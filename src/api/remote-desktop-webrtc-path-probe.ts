import { boundedRtt, readPathStats, type PathRoute, type StatsRow } from "./remote-desktop-webrtc-path";

type ProbeData = { k: "offer"; sdp: string; target: "direct" | "relay" } | { k: "answer"; sdp: string }
  | { k: "candidate"; candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | { k: "close" };
interface ActiveProbe {
  pc: RTCPeerConnection; channel: RTCDataChannel; route: PathRoute; id: number; gen: number; started: number;
  lastPing: number; statsPending: boolean; pairId?: string; checkedAt: number;
  pings: Map<number, { at: number; pairId: string }>; candidates: RTCIceCandidateInit[];
}
/** Requires an explicit host capability. Signaling rides the MAIN authenticated rd-ctl,
 * never the gateway's ordinary offer/gen slot. The probe has no video or input lanes. */
export class WebRtcPathProbe {
  private enabled = false;
  private active: ActiveProbe | undefined;
  private nextId = 0;
  private cursor = 0;
  private due = 0;
  constructor(private options: {
    sid: string; now(): number; wallNow(): number; createPeer(configuration: RTCConfiguration): RTCPeerConnection;
    send(message: object): boolean; sample(route: PathRoute, rtt: number, at: number, identity: string): void;
  }) {}
  enable(): void { this.enabled = true; }
  reset(): void { this.stop(); this.enabled = false; }
  stop(): void {
    const probe = this.active; this.active = undefined;
    if (!probe) return;
    this.send(probe, { k: "close" });
    probe.pc.onicecandidate = probe.pc.onconnectionstatechange = null;
    probe.channel.onmessage = probe.channel.onopen = probe.channel.onclose = probe.channel.onerror = null;
    try { probe.channel.close(); probe.pc.close(); } catch { /* independent disposal */ }
    this.due = this.options.now() + 1000;
  }
  private send(probe: ActiveProbe, data: ProbeData): boolean {
    try { return this.options.send({ t: "rd.path_probe", gen: probe.gen, probe_id: probe.id, data }); } catch { return false; }
  }
  tick(routes: PathRoute[], selected: string | undefined, gen: number, allowed: boolean): void {
    const now = this.options.now();
    if (!allowed || this.active && (this.active.gen !== gen || !routes.some(route => route.key === this.active!.route.key))) { this.stop(); return; }
    const probe = this.active;
    if (probe) {
      if (now - probe.started >= 12_000 || ["failed", "closed"].includes(probe.pc.connectionState)) { this.stop(); return; }
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
    const alternatives = routes.filter(route => route.key !== selected);
    if (!alternatives.length) return;
    const route = alternatives[this.cursor++ % alternatives.length];
    let pc: RTCPeerConnection;
    try { pc = this.options.createPeer({ iceServers: route.servers, iceTransportPolicy: route.kind === "relay" ? "relay" : "all", bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" }); }
    catch { this.due = now + 12_000; return; }
    let channel: RTCDataChannel;
    try { channel = pc.createDataChannel("rd-ctl", { ordered: true }); } catch { pc.close(); this.due = now + 12_000; return; }
    const active: ActiveProbe = { pc, channel, route, id: ++this.nextId, gen, started: now, lastPing: -Infinity, statsPending: false, checkedAt: -Infinity, pings: new Map(), candidates: [] };
    this.active = active;
    pc.onicecandidate = event => {
      if (this.active !== active || !event.candidate) return;
      const candidate = event.candidate;
      if (route.kind === "direct" && /\btyp relay\b/.test(candidate.candidate)) return;
      if (!this.send(active, { k: "candidate", candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex })) this.stop();
    };
    channel.onmessage = event => { void this.pong(active, event.data); };
    channel.onerror = channel.onclose = () => { if (this.active === active) this.stop(); };
    void (async () => {
      try {
        const offer = await pc.createOffer();
        if (this.active !== active) return;
        await pc.setLocalDescription(offer);
        if (this.active === active && !this.send(active, { k: "offer", sdp: pc.localDescription?.sdp ?? offer.sdp ?? "", target: route.kind })) this.stop();
      } catch { if (this.active === active) this.stop(); }
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
      probe.pairId = reading.id; probe.checkedAt = this.options.now();
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
    if (this.active === probe && pairId && pairId === ping.pairId) this.options.sample(probe.route, rtt, at, `${probe.gen}:${probe.id}:${pairId}`);
  }
}
