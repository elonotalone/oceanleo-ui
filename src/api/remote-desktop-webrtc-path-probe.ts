import { boundedRtt, readPathStats, type PathRoute, type StatsRow } from "./remote-desktop-webrtc-path";

type ProbeData = { k: "offer"; sdp: string; target: "direct" | "relay" } | { k: "answer"; sdp: string }
  | { k: "candidate"; candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | { k: "close" };
interface ActiveProbe {
  pc: RTCPeerConnection; channel: RTCDataChannel; route: PathRoute; id: number; gen: number; started: number;
  lastPing: number; statsPending: boolean;
  pings: Map<number, { at: number; pairId: string }>; candidates: RTCIceCandidateInit[];
  samples: { rtt: number; at: number; identity: string }[];
}
/** Requires an explicit host capability. Signaling rides the MAIN authenticated rd-ctl,
 * never the gateway's ordinary offer/gen slot. The probe has no video or input lanes. */
export class WebRtcPathProbe {
  private enabled = false;
  private active: ActiveProbe | undefined;
  private nextId = 0;
  private cursor = 0;
  private due = 0;
  private surveyKey: string | undefined;
  private surveyAt = -Infinity;
  private surveyed = new Set<string>();
  private measurements = new Map<string, number>();
  private preferred: string | undefined;
  private alternatives: PathRoute[] = [];
  private options: {
    sid: string; now(): number; wallNow(): number; createPeer(configuration: RTCConfiguration): RTCPeerConnection;
    send(message: object): boolean; sample(route: PathRoute, rtt: number, at: number, identity: string): void;
  };
  constructor(options: WebRtcPathProbe["options"]) { this.options = options; }
  enable(): void { this.enabled = true; }
  reset(): void { this.stop(); this.enabled = false; this.surveyKey = undefined; }
  private finish(probe: ActiveProbe): void {
    if (this.active !== probe) return;
    this.surveyed.add(probe.route.key);
    const samples = probe.samples;
    if (samples.length >= 4 && samples.at(-1)!.at - samples[0].at >= 3000) {
      const rtts = samples.map(sample => sample.rtt).sort((a, b) => a - b);
      this.measurements.set(probe.route.key, rtts[Math.floor(rtts.length / 2)]);
    } else this.measurements.delete(probe.route.key);
    if (this.alternatives.every(route => this.surveyed.has(route.key))) {
      this.preferred = [...this.measurements].sort((a, b) => a[1] - b[1])[0]?.[0];
      // Survey values rank the next probe only. Decisions still require four fresh
      // pongs on the best route; no stale earlier region is eligible for a switch.
      if (this.preferred === probe.route.key) for (const sample of samples) this.options.sample(probe.route, sample.rtt, sample.at, sample.identity);
    }
    this.stop();
  }
  stop(): void {
    const probe = this.active; this.active = undefined;
    if (!probe) return;
    this.send(probe, { k: "close" });
    probe.pc.onicecandidate = probe.pc.onconnectionstatechange = null;
    probe.channel.onmessage = probe.channel.onopen = probe.channel.onclose = probe.channel.onerror = null;
    try { probe.channel.close(); } catch { /* independent disposal */ }
    try { probe.pc.close(); } catch { /* independent disposal */ }
    this.due = this.options.now() + 1000;
  }
  private send(probe: ActiveProbe, data: ProbeData): boolean {
    try { return this.options.send({ t: "rd.path_probe", gen: probe.gen, probe_id: probe.id, data }); } catch { return false; }
  }
  tick(routes: PathRoute[], selected: string | undefined, gen: number, allowed: boolean): void {
    const now = this.options.now();
    if (!allowed || this.active && (this.active.gen !== gen || !routes.some(route => route.key === this.active!.route.key))) { this.stop(); return; }
    const alternatives = routes.filter(route => route.key !== selected);
    const surveyKey = `${gen}:${selected}:${alternatives.map(route => route.key).join(";")}`;
    if (this.surveyKey !== surveyKey || now - this.surveyAt >= Math.max(60_000, alternatives.length * 13_000 + 12_000)) {
      this.stop(); this.surveyKey = surveyKey; this.surveyAt = now;
      this.surveyed.clear(); this.measurements.clear(); this.preferred = undefined; this.cursor = 0;
    }
    this.alternatives = alternatives;
    const probe = this.active;
    if (probe) {
      if (now - probe.started >= 12_000 || ["failed", "closed"].includes(probe.pc.connectionState)) { this.finish(probe); return; }
      if (now - probe.lastPing >= 1000 && !probe.statsPending) {
        probe.lastPing = now;
        void this.inspect(probe).then(pairId => {
          if (!pairId || this.active !== probe || probe.channel.readyState !== "open" || probe.channel.bufferedAmount > 16_384) return;
          const sent = this.options.wallNow();
          probe.pings.set(sent, { at: this.options.now(), pairId });
          for (const [id, ping] of probe.pings) if (this.options.now() - ping.at > 3000) probe.pings.delete(id);
          try { probe.channel.send(JSON.stringify({ v: 1, t: "rd.ping", sid: this.options.sid, t_v: sent })); } catch { this.stop(); }
        });
      }
      return;
    }
    if (!this.enabled || !selected || now < this.due || !routes.some(route => route.kind === "relay") || this.nextId >= 2_147_483_647) return;
    if (!alternatives.length) return;
    const route = alternatives.find(route => route.key === this.preferred) ?? alternatives[this.cursor++ % alternatives.length];
    this.surveyed.add(route.key);
    let pc: RTCPeerConnection;
    try { pc = this.options.createPeer({ iceServers: route.servers, iceTransportPolicy: route.kind === "relay" ? "relay" : "all", bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" }); }
    catch { this.due = now + 12_000; return; }
    let channel: RTCDataChannel;
    try { channel = pc.createDataChannel("rd-ctl", { ordered: true }); } catch { pc.close(); this.due = now + 12_000; return; }
    const active: ActiveProbe = { pc, channel, route, id: ++this.nextId, gen, started: now, lastPing: -Infinity, statsPending: false, pings: new Map(), candidates: [], samples: [] };
    this.active = active;
    pc.onicecandidate = event => {
      if (this.active !== active || !event.candidate) return;
      const candidate = event.candidate;
      if (route.kind === "direct" && /\btyp relay\b/.test(candidate.candidate)) return;
      if (!this.send(active, { k: "candidate", candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex })) this.finish(active);
    };
    channel.onmessage = event => { void this.pong(active, event.data); };
    channel.onerror = channel.onclose = () => this.finish(active);
    void (async () => {
      try {
        const offer = await pc.createOffer();
        if (this.active !== active) return;
        await pc.setLocalDescription(offer);
        if (this.active === active && !this.send(active, { k: "offer", sdp: pc.localDescription?.sdp ?? offer.sdp ?? "", target: route.kind })) this.finish(active);
      } catch { this.finish(active); }
    })();
  }
  async receive(message: Record<string, unknown>, gen: number): Promise<void> {
    const probe = this.active;
    if (!probe || message.gen !== gen || gen !== probe.gen || message.probe_id !== probe.id || !message.data || typeof message.data !== "object") return;
    const data = message.data as ProbeData;
    try {
      if (data.k === "answer" && typeof data.sdp === "string" && data.sdp.length <= 16_384) {
        await probe.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        if (this.active !== probe) return;
        for (const candidate of probe.candidates.splice(0)) { if (this.active !== probe) return; await probe.pc.addIceCandidate(candidate); }
      } else if (data.k === "candidate" && typeof data.candidate === "string" && data.candidate.length <= 2048) {
        if (probe.route.kind === "direct" && /\btyp relay\b/.test(data.candidate)) return;
        const candidate = { candidate: data.candidate, sdpMid: data.sdpMid, sdpMLineIndex: data.sdpMLineIndex };
        if (probe.pc.remoteDescription) await probe.pc.addIceCandidate(candidate);
        else if (probe.candidates.length < 32) probe.candidates.push(candidate);
      } else if (data.k === "close") this.stop();
    } catch { if (this.active === probe) this.stop(); }
  }
  private async inspect(probe: ActiveProbe): Promise<string | undefined> {
    if (probe.statsPending || this.active !== probe) return;
    probe.statsPending = true;
    try {
      const stats = await probe.pc.getStats();
      if (this.active !== probe || probe.pc.connectionState !== "connected") return;
      const rows: StatsRow[] = []; stats.forEach(row => rows.push(row));
      const reading = readPathStats(rows, [probe.route.kind === "direct" ? probe.route : { key: "direct", kind: "direct", servers: [] }, probe.route]).selected;
      if (reading?.route?.key !== probe.route.key || reading.pair.state !== "succeeded") return;
      return reading.id;
    } catch { return; } finally { probe.statsPending = false; }
  }
  private async pong(probe: ActiveProbe, raw: unknown): Promise<void> {
    if (this.active !== probe || typeof raw !== "string" || raw.length > 16_384) return;
    let data: Record<string, unknown>; try { data = JSON.parse(raw); } catch { return; }
    if (!data || data.v !== 1 || data.t !== "rd.pong" || data.sid !== this.options.sid || typeof data.t_v !== "number") return;
    const ping = probe.pings.get(data.t_v); probe.pings.delete(data.t_v);
    if (!ping) return;
    const at = this.options.now(), rtt = boundedRtt(at - ping.at);
    if (rtt === undefined || rtt > 3000) return;
    const pairId = await this.inspect(probe);
    if (this.active === probe && pairId && pairId === ping.pairId) {
      const sample = { rtt, at, identity: `${probe.gen}:${probe.id}:${pairId}` };
      probe.samples.push(sample);
      if (probe.samples.length >= 4 && at - probe.samples[0].at >= 3000) this.finish(probe);
    }
  }
}
