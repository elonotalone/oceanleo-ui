import type { RemoteDesktopAction } from "./remote-desktop";
import { isWebRtcInputFault } from "./remote-desktop-webrtc-errors";
import { WebRtcInputScheduler, WEBRTC_MESSAGE_BYTES, type InputLabel } from "./remote-desktop-webrtc-input";
import { WebRtcTelemetry, type WebRtcPath, type WebRtcQualityReport, type WebRtcViewerState } from "./remote-desktop-webrtc-telemetry";
export type { WebRtcPath, WebRtcQualityReport, WebRtcViewerState } from "./remote-desktop-webrtc-telemetry";

export interface RemoteWebRtcDescriptor {
  transport: "webrtc-v1"; role: "viewer" | "host"; session_id: string; display_id: string | null;
  ice_servers: (RTCIceServer & { region?: string })[]; ice_expires_at: string; server_now: number; lease_expires_at: string;
}
export type WebRtcSignal =
  | { k: "offer" | "answer"; sdp: string; gen: number }
  | { k: "candidate"; candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; gen: number }
  | { k: "bye"; reason?: string; gen?: number };
export interface WebRtcViewerOptions {
  descriptor: RemoteWebRtcDescriptor;
  sendSignal(data: WebRtcSignal): boolean;
  onState(state: WebRtcViewerState, path?: WebRtcPath): void;
  onFrame(width: number, height: number): void;
  onTerminal(reason: string): void;
  onReport(report: WebRtcQualityReport, final: boolean): void;
  clickedAt?: number; sessionCreatedAt?: number; descriptorReceivedAt?: number; sequenceFloor?: number;
  deviceId?: string; now?: () => number; wallNow?: () => number;
  createPeer?: (configuration: RTCConfiguration) => RTCPeerConnection;
}
type Label = InputLabel | "rd-ctl";
type FrameMetadata = VideoFrameCallbackMetadata & { captureTime?: number; receiveTime?: number };
const labels: Label[] = ["rd-input", "rd-fast", "rd-ctl"];
const swallow = (fn: () => void): void => { try { fn(); } catch { /* observers cannot stop media */ } };

/** The peer owns media/input only. Authentication, HTTP and stream reconnects belong to the caller. */
export class WebRtcRemoteDesktopViewer {
  gen = 0;
  pc: RTCPeerConnection | null = null;
  private options: WebRtcViewerOptions;
  private descriptor: RemoteWebRtcDescriptor;
  private now: () => number;
  private wallNow: () => number;
  private input: WebRtcInputScheduler;
  private telemetry: WebRtcTelemetry;
  private channels = new Map<Label, RTCDataChannel>();
  private recovery = new Map<Label, { due: number; backoff: number }>();
  private pendingSignals: WebRtcSignal[] = [];
  private candidates: RTCIceCandidateInit[] = [];
  private video: HTMLVideoElement | null = null;
  private mediaStream: MediaStream | null = null;
  private frameCallback: number | undefined;
  private lastFrameCount: number | undefined;
  private hasFrame = false;
  private pictureRebuilding = false;
  private trackGeneration = 0;
  private ended = false;
  private started = false;
  private creating: Promise<void> | undefined;
  private negotiatingPeer: RTCPeerConnection | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private disconnectedAt: number | undefined;
  private restartDue: number | undefined;
  private restartBackoff = 1000;
  private peerRetryDue: number | undefined;
  private lastPing = -Infinity;
  private lastStats = -Infinity;
  private lastReport: number;
  private statsPending = false;
  private leaseDeadline: number;
  private state: WebRtcViewerState = "connecting";
  private hostRelayRegion: string | undefined;
  private pingTimes = new Map<number, number>();
  constructor(options: WebRtcViewerOptions) {
    this.options = options; this.descriptor = options.descriptor;
    this.now = options.now ?? (() => performance.now()); this.wallNow = options.wallNow ?? Date.now;
    const clickedAt = options.clickedAt ?? this.now();
    this.lastReport = this.now();
    this.telemetry = new WebRtcTelemetry({ sessionId: this.descriptor.session_id, deviceId: options.deviceId, clickedAt, now: this.now, wallNow: this.wallNow });
    if (options.sessionCreatedAt !== undefined) this.telemetry.step("session_created_ms", options.sessionCreatedAt);
    this.telemetry.step("descriptor_received_ms", options.descriptorReceivedAt);
    this.leaseDeadline = this.deadline(this.descriptor, options.descriptorReceivedAt);
    this.input = new WebRtcInputScheduler({ sid: this.descriptor.session_id, sequenceFloor: options.sequenceFloor, now: this.now, wallNow: this.wallNow,
      fault: (label, reason) => this.channelFault(label, reason), written: () => this.telemetry.written(),
      receipt: (write, receipt) => this.telemetry.receipt(write, receipt) });
  }
  private deadline(descriptor: RemoteWebRtcDescriptor, receivedAt = this.now()): number {
    const expires = Date.parse(descriptor.lease_expires_at);
    return Number.isFinite(expires) && Number.isFinite(descriptor.server_now)
      ? receivedAt + Math.max(0, expires - descriptor.server_now * 1000) : receivedAt;
  }
  async start(): Promise<void> {
    if (this.ended || this.started) return;
    if (this.descriptor.role !== "viewer") throw new Error("webrtc_viewer_descriptor_required");
    this.started = true; this.emitState("connecting");
    this.timer = setInterval(() => this.tick(), 100);
    if (this.now() >= this.leaseDeadline) { this.close("lease_expired"); return; }
    await this.createConnection();
  }
  private async createConnection(): Promise<void> {
    if (this.ended) return;
    if (this.creating) return this.creating;
    this.creating = (async () => {
      const old = this.pc;
      this.detachPeer();
      if (old) { this.pictureRebuilding = true; this.telemetry.reconnects++; this.input.recover("picture_reconnecting"); }
      this.gen++; const gen = this.gen;
      this.hostRelayRegion = undefined; this.telemetry.path = undefined;
      this.candidates = []; this.pendingSignals = []; this.recovery.clear();
      this.disconnectedAt = undefined; this.restartDue = undefined; this.restartBackoff = 1000;
      const create = this.options.createPeer ?? (configuration => new RTCPeerConnection(configuration));
      let pc: RTCPeerConnection;
      try { pc = create({ iceServers: this.iceServers(), iceTransportPolicy: "all", bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" }); }
      catch { this.peerRetryDue = this.now() + 1000; this.emitState("picture_reconnecting"); return; }
      this.pc = pc;
      const transceiver = pc.addTransceiver("video", { direction: "recvonly" });
      this.lowDelay(transceiver.receiver);
      this.preferCodecs(transceiver);
      pc.onicecandidate = event => {
        if (this.pc !== pc || this.ended || !event.candidate) return;
        this.transmit({ k: "candidate", candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex, gen });
      };
      pc.ontrack = event => {
        if (this.pc !== pc || this.ended || event.track.kind !== "video") return;
        this.lowDelay(event.receiver);
        this.trackGeneration = gen;
        this.mediaStream = event.streams[0] ?? new MediaStream([event.track]);
        if (this.video) { this.video.srcObject = this.mediaStream; this.play(); }
      };
      pc.onconnectionstatechange = () => {
        if (this.pc !== pc || this.ended) return;
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          this.emitState("picture_reconnecting"); this.peerRetryDue = this.now() + 200;
        } else if (pc.connectionState === "connected") this.connected();
      };
      pc.oniceconnectionstatechange = () => {
        if (this.pc !== pc || this.ended) return;
        if (pc.iceConnectionState === "disconnected") {
          this.disconnectedAt ??= this.now(); this.restartDue ??= this.disconnectedAt + 2000;
          this.emitState("picture_reconnecting");
        } else if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
          this.emitState("picture_reconnecting"); this.peerRetryDue = this.now() + 200;
        } else if (["connected", "completed"].includes(pc.iceConnectionState)) this.connected();
      };
      for (const label of labels) this.createChannel(label);
      await this.offer(pc, false);
    })().catch(() => {
      if (!this.ended) { this.peerRetryDue = this.now() + 1000; this.emitState("picture_reconnecting"); }
    }).finally(() => { this.creating = undefined; });
    return this.creating;
  }
  private lowDelay(receiver: RTCRtpReceiver): void {
    const low = receiver as RTCRtpReceiver & { jitterBufferTarget?: number; playoutDelayHint?: number };
    if ("jitterBufferTarget" in low) { try { low.jitterBufferTarget = 0; return; } catch { /* try the older hint */ } }
    try { low.playoutDelayHint = 0; } catch { /* platform may expose read-only hints */ }
  }
  private iceServers(): RTCIceServer[] { return this.descriptor.ice_servers.map(({ region: _region, ...server }) => server); }
  private preferCodecs(transceiver: RTCRtpTransceiver): void {
    try {
      const caps = typeof RTCRtpReceiver === "undefined" ? undefined : RTCRtpReceiver.getCapabilities?.("video");
      if (!caps?.codecs || !transceiver.setCodecPreferences) return;
      const codecs = caps.codecs;
      const h264 = codecs.filter(c => /h264/i.test(c.mimeType) && /(?:^|;)\s*packetization-mode=1(?:;|$)/.test(c.sdpFmtpLine ?? ""));
      const vp8 = codecs.filter(c => /vp8/i.test(c.mimeType));
      transceiver.setCodecPreferences([...h264, ...vp8, ...codecs.filter(c => !h264.includes(c) && !vp8.includes(c))]);
    } catch { /* unsupported preferences leave standard codec negotiation intact */ }
  }
  private connected(): void {
    this.disconnectedAt = undefined; this.restartDue = undefined; this.restartBackoff = 1000; this.peerRetryDue = undefined;
    this.telemetry.step("ice_connected_ms"); this.updateState();
  }
  private async offer(pc: RTCPeerConnection, restart: boolean): Promise<void> {
    if (this.negotiatingPeer === pc || this.ended || this.pc !== pc) return;
    this.negotiatingPeer = pc;
    try {
      const offer = await pc.createOffer(restart ? { iceRestart: true } : undefined);
      if (this.ended || this.pc !== pc) return;
      await pc.setLocalDescription(offer);
      if (this.ended || this.pc !== pc) return;
      this.transmit({ k: "offer", sdp: pc.localDescription?.sdp ?? offer.sdp ?? "", gen: this.gen });
    } catch { if (!this.ended && this.pc === pc) this.restartDue = this.now() + this.restartBackoff; }
    finally { if (this.negotiatingPeer === pc) this.negotiatingPeer = null; }
  }
  private transmit(data: WebRtcSignal): void {
    if (this.ended) return;
    let sent = false; try { sent = this.options.sendSignal(data); } catch { /* the direct peer remains alive */ }
    if (sent) { if (data.k === "offer") this.telemetry.step("offer_sent_ms"); return; }
    if (data.k === "offer") {
      this.pendingSignals = this.pendingSignals.filter(s => s.k !== "offer" && (s.k !== "candidate" || s.gen === data.gen));
      this.pendingSignals.unshift(data);
    } else this.pendingSignals.push(data);
    const candidates = this.pendingSignals.filter(s => s.k === "candidate");
    if (candidates.length > 64) this.pendingSignals.splice(this.pendingSignals.indexOf(candidates[0]), 1);
  }
  flushSignals(): void {
    if (this.ended) return;
    while (this.pendingSignals.length) {
      let sent = false; try { sent = this.options.sendSignal(this.pendingSignals[0]); } catch { /* retry on next tick */ }
      if (!sent) break;
      if (this.pendingSignals[0].k === "offer") this.telemetry.step("offer_sent_ms");
      this.pendingSignals.shift();
    }
  }
  async signal(value: unknown): Promise<void> {
    if (this.ended || !value || typeof value !== "object") return;
    const data = value as WebRtcSignal;
    if (data.gen !== undefined && (!Number.isSafeInteger(data.gen) || data.gen < this.gen)) return;
    if (data.k === "bye") {
      if (data.gen !== undefined && data.gen !== this.gen) return;
      const reason = typeof data.reason === "string" && data.reason ? data.reason : "host_left";
      if (isWebRtcInputFault(reason)) this.channelFault("rd-input", reason);
      else this.close(reason);
      return;
    }
    if (data.gen !== this.gen || !this.pc) return;
    const pc = this.pc;
    try {
      if (data.k === "answer" && typeof data.sdp === "string") {
        await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        if (this.pc !== pc || this.ended) return;
        this.telemetry.step("answer_received_ms");
        for (const candidate of this.candidates.splice(0)) { if (this.pc === pc && !this.ended) await pc.addIceCandidate(candidate); }
      } else if (data.k === "candidate" && typeof data.candidate === "string") {
        const candidate = { candidate: data.candidate, sdpMid: data.sdpMid, sdpMLineIndex: data.sdpMLineIndex };
        if (pc.remoteDescription) await pc.addIceCandidate(candidate);
        else { this.candidates.push(candidate); if (this.candidates.length > 64) this.candidates.shift(); }
      }
    } catch { /* malformed or racing signalling never tears down the direct media path */ }
  }
  updateDescriptor(descriptor: RemoteWebRtcDescriptor): void {
    if (this.ended || descriptor.transport !== "webrtc-v1" || descriptor.session_id !== this.descriptor.session_id || descriptor.role !== "viewer") return;
    // A delayed pre-renewal snapshot must not replace current credentials or grant a fresh relative lease.
    if (Date.parse(descriptor.lease_expires_at) < Date.parse(this.descriptor.lease_expires_at) || descriptor.server_now < this.descriptor.server_now) return;
    const sameExpiry = descriptor.lease_expires_at === this.descriptor.lease_expires_at;
    const deadline = this.deadline(descriptor);
    this.leaseDeadline = sameExpiry ? Math.min(this.leaseDeadline, deadline) : deadline;
    this.descriptor = descriptor;
    try { this.pc?.setConfiguration({ ...this.pc.getConfiguration(), iceServers: this.iceServers() }); } catch { /* use fresh credentials on next restart */ }
    this.flushSignals();
  }
  private createChannel(label: Label): void {
    const pc = this.pc; if (!pc || this.ended) return;
    let channel: RTCDataChannel;
    try { channel = pc.createDataChannel(label, label === "rd-fast" ? { ordered: false, maxRetransmits: 0 } : { ordered: true }); }
    catch { this.channelFault(label, "input_channel_create_failed"); return; }
    const previous = this.channels.get(label);
    if (previous) { previous.onopen = previous.onclose = previous.onerror = previous.onmessage = previous.onbufferedamountlow = null; swallow(() => previous.close()); }
    this.channels.set(label, channel); channel.bufferedAmountLowThreshold = 128 * 1024;
    if (label !== "rd-ctl") this.input.setLane(label, channel);
    const current = () => !this.ended && this.pc === pc && this.channels.get(label) === channel;
    channel.onopen = () => {
      if (!current()) return;
      this.recovery.delete(label); if (label !== "rd-ctl") this.input.setLane(label, channel);
      if (label === "rd-ctl") { this.input.setReceiptsAvailable(true); this.ping(); }
      this.updateState();
    };
    channel.onbufferedamountlow = () => { if (current()) this.input.flush(); };
    channel.onclose = channel.onerror = () => { if (current()) this.channelFault(label, "input_channel_lost"); };
    channel.onmessage = event => { if (current() && label === "rd-ctl") this.controlMessage(event.data); };
    if (channel.readyState === "open") channel.onopen(new Event("open"));
  }
  private channelFault(label: Label, _reason: string): void {
    if (this.ended) return;
    const previous = this.recovery.get(label);
    const backoff = previous?.backoff ?? 200;
    this.recovery.set(label, { due: this.now() + backoff, backoff: Math.min(2000, backoff * 2) });
    const channel = this.channels.get(label); this.channels.delete(label);
    if (label === "rd-ctl") this.input.setReceiptsAvailable(false);
    if (label !== "rd-ctl") this.input.setLane(label, null);
    if (channel) { channel.onclose = channel.onerror = channel.onopen = channel.onmessage = channel.onbufferedamountlow = null; swallow(() => channel.close()); }
    this.input.recover(); this.updateState();
  }
  private controlMessage(raw: unknown): void {
    if (typeof raw !== "string" || new TextEncoder().encode(raw).length > WEBRTC_MESSAGE_BYTES) return;
    let data: Record<string, unknown>; try { data = JSON.parse(raw); } catch { return; }
    if (!data || data.v !== 1 || data.sid !== this.descriptor.session_id) return;
    if (data.t === "rd.input_receipt") this.input.receipt(data);
    else if (data.t === "rd.pong" && typeof data.t_v === "number" && this.pingTimes.has(data.t_v)) {
      this.pingTimes.delete(data.t_v);
      const received = data.host_receive_ms ?? data.t_h_recv ?? data.device_wall_ms;
      const sent = data.host_send_ms ?? data.t_h_send ?? data.device_wall_ms;
      if (typeof received === "number" && typeof sent === "number") this.telemetry.clock.sample(data.t_v, received, sent, this.wallNow(), this.now());
    } else if (data.t === "rd.publisher_stats" && data.metrics && typeof data.metrics === "object") {
      this.telemetry.publisher = Object.fromEntries(Object.entries(data.metrics).filter(([key, value]) => /^[a-z][a-z0-9_]{0,63}$/.test(key) && typeof value === "number" && Number.isFinite(value)) as [string, number][]);
      const region = data.path && typeof data.path === "object" ? (data.path as Record<string, unknown>).relay_region : undefined;
      if (typeof region === "string" && /^[a-z0-9-]{1,32}$/.test(region)) this.hostRelayRegion = region;
    } else if (data.t === "rd.input_error") this.channelFault("rd-input", "host_input_executor_failed");
  }
  private ping(): void {
    const sent = this.wallNow();
    if (this.sendControl({ t: "rd.ping", t_v: sent })) {
      this.pingTimes.set(sent, this.now()); if (this.pingTimes.size > 32) this.pingTimes.delete(this.pingTimes.keys().next().value!);
    }
    this.lastPing = this.now();
  }
  sendControl(report: object): boolean {
    if (this.ended) return false;
    const channel = this.channels.get("rd-ctl");
    if (!channel || channel.readyState !== "open" || channel.bufferedAmount > 256 * 1024) return false;
    let payload: string; try { payload = JSON.stringify({ ...report, v: 1, sid: this.descriptor.session_id }); } catch { return false; }
    if (new TextEncoder().encode(payload).length > WEBRTC_MESSAGE_BYTES) return false;
    try { channel.send(payload); return true; } catch { this.channelFault("rd-ctl", "control_send_failed"); return false; }
  }
  send(action: RemoteDesktopAction): boolean { return !this.ended && this.input.send(action); }
  releaseForHandoff(): Promise<void> { return this.input.releaseForHandoff(); }
  finishHandoff(): void { this.input.finishHandoff(); }
  lastSequence(): number { return this.input.lastSequence; }
  attachVideo(video: HTMLVideoElement | null): void {
    if (this.video && this.frameCallback !== undefined) this.video.cancelVideoFrameCallback?.(this.frameCallback);
    if (this.video) { this.video.onloadeddata = null; this.video.ontimeupdate = null; if (this.video !== video) this.video.srcObject = null; }
    this.frameCallback = undefined; this.video = video; this.lastFrameCount = undefined;
    if (!video || this.ended) return;
    video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = this.mediaStream;
    video.onloadeddata = () => { if (!this.ended && video.videoWidth && video.videoHeight) this.telemetry.step("first_frame_decoded_ms"); };
    if (typeof video.requestVideoFrameCallback === "function") {
      const frame: VideoFrameRequestCallback = (_now, raw) => {
        if (this.ended || this.video !== video) return;
        const metadata = raw as FrameMetadata;
        const presented = Number.isFinite(metadata.expectedDisplayTime) ? metadata.expectedDisplayTime : Number.isFinite(metadata.presentationTime) ? metadata.presentationTime : this.now();
        this.frame(video, presented, metadata);
        if (!this.ended && this.video === video) this.frameCallback = video.requestVideoFrameCallback(frame);
      };
      this.frameCallback = video.requestVideoFrameCallback(frame);
    } else {
      const frame = () => {
        const count = video.getVideoPlaybackQuality?.().totalVideoFrames;
        if (count !== undefined && count === this.lastFrameCount) return;
        this.lastFrameCount = count; this.frame(video, this.now(), {});
      };
      video.onloadeddata = frame; video.ontimeupdate = frame;
    }
    this.play();
  }
  private play(): void { try { const playing = this.video?.play(); playing?.catch(() => {}); } catch { /* attach before autoplay is permitted */ } }
  private frame(video: HTMLVideoElement, at: number, metadata: { captureTime?: number; receiveTime?: number; presentationTime?: number }): void {
    if (this.ended || !video.videoWidth || !video.videoHeight) return;
    if (this.pictureRebuilding && this.trackGeneration !== this.gen) return;
    this.hasFrame = true; this.pictureRebuilding = false; this.telemetry.frame(at, metadata); this.updateState();
    swallow(() => this.options.onFrame(video.videoWidth, video.videoHeight));
  }
  private updateState(): void {
    const pictureFault = this.pictureRebuilding || this.disconnectedAt !== undefined || this.peerRetryDue !== undefined;
    this.emitState(pictureFault ? "picture_reconnecting" : this.recovery.size ? "input_reconnecting" : this.hasFrame ? "playing" : "connecting");
  }
  private emitState(state: WebRtcViewerState): void { this.state = state; swallow(() => this.options.onState(state, this.telemetry.path)); }
  private tick(): void {
    if (this.ended) return;
    const now = this.now();
    if (now >= this.leaseDeadline) { this.close("lease_expired"); return; }
    this.flushSignals(); this.input.tick(); this.telemetry.tick();
    for (const [label, retry] of this.recovery) if (now >= retry.due) {
      // Give DCEP time to open. Retiring a connecting replacement every 200ms can starve a slow path.
      retry.due = now + Math.max(2000, retry.backoff); retry.backoff = Math.min(2000, retry.backoff * 2); this.createChannel(label);
    }
    if (this.peerRetryDue !== undefined && now >= this.peerRetryDue) { this.peerRetryDue = undefined; void this.createConnection(); }
    else if (this.restartDue !== undefined && now >= this.restartDue && this.pc) {
      this.restartDue = now + this.restartBackoff; this.restartBackoff = Math.min(8000, this.restartBackoff * 2); void this.offer(this.pc, true);
    }
    if (now - this.lastPing >= 1000) this.ping();
    if (now - this.lastStats >= 1000) { this.lastStats = now; void this.stats(); }
    if (now - this.lastReport >= 10_000) { this.lastReport = now; const report = this.telemetry.report(false); swallow(() => this.options.onReport(report, false)); }
  }
  private async stats(): Promise<void> {
    const pc = this.pc; if (!pc || this.statsPending) return;
    this.statsPending = true;
    try {
      const stats = await pc.getStats();
      if (this.pc !== pc || this.ended) return;
      const all: Record<string, unknown>[] = []; stats.forEach(value => all.push(value));
      const byId = new Map(all.map(value => [value.id, value]));
      const transport = all.find(value => value.type === "transport" && value.selectedCandidatePairId);
      const pair = (transport && byId.get(transport.selectedCandidatePairId)) ?? all.find(value => value.type === "candidate-pair" && (value.selected || value.nominated && value.state === "succeeded"));
      const local = pair && byId.get(pair.localCandidateId); const remote = pair && byId.get(pair.remoteCandidateId);
      const inbound = all.find(value => value.type === "inbound-rtp" && (value.kind === "video" || value.mediaType === "video"));
      if (typeof inbound?.framesDecoded === "number" && inbound.framesDecoded > 0) this.telemetry.step("first_frame_decoded_ms");
      if (inbound) this.telemetry.hostSample(typeof inbound.bytesReceived === "number" ? inbound.bytesReceived : undefined, typeof inbound.framesReceived === "number" ? inbound.framesReceived : undefined);
      if (!pair) return;
      const path: WebRtcPath = {};
      if (local && ["host", "srflx", "prflx", "relay"].includes(String(local.candidateType))) path.local_type = local.candidateType as WebRtcPath["local_type"];
      if (remote && ["host", "srflx", "prflx", "relay"].includes(String(remote.candidateType))) path.remote_type = remote.candidateType as WebRtcPath["remote_type"];
      const address = String(remote?.address ?? local?.address ?? "");
      if (address.includes(":")) path.address_family = "ipv6"; else if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) path.address_family = "ipv4";
      if (["udp", "tcp"].includes(String(local?.protocol))) path.protocol = local?.protocol as WebRtcPath["protocol"];
      if (typeof pair.currentRoundTripTime === "number" && Number.isFinite(pair.currentRoundTripTime)) path.rtt_ms = Math.max(0, Math.round(pair.currentRoundTripTime * 1000));
      // A relay region is reported only when supplied as coarse metadata; never derive or expose an IP/hostname.
      const relayUrl = path.local_type === "relay" ? local?.url : path.remote_type === "relay" ? remote?.url : undefined;
      const mappedRegion = this.descriptor.ice_servers.find(server => (Array.isArray(server.urls) ? server.urls : [server.urls]).includes(String(relayUrl)))?.region;
      // Remote candidate stats often omit url; the authenticated host can identify its own selected TURN region.
      const region = mappedRegion ?? (path.remote_type === "relay" ? this.hostRelayRegion : undefined);
      if ((path.local_type === "relay" || path.remote_type === "relay") && typeof region === "string" && /^[a-z0-9-]{1,32}$/.test(region)) path.relay_region = region;
      this.telemetry.path = path; this.emitState(this.state);
    } catch { /* stats are optional and never affect connection lifetime */ }
    finally { this.statsPending = false; }
  }
  private detachPeer(): void {
    this.input.setReceiptsAvailable(false);
    for (const channel of this.channels.values()) { channel.onopen = channel.onclose = channel.onerror = channel.onmessage = channel.onbufferedamountlow = null; swallow(() => channel.close()); }
    this.channels.clear(); this.input.setLane("rd-input", null); this.input.setLane("rd-fast", null);
    if (this.pc) {
      const pc = this.pc; this.pc = null;
      pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = pc.oniceconnectionstatechange = null;
      swallow(() => pc.close());
    }
  }
  close(reason = "viewer_left"): void {
    if (this.ended) return;
    this.input.close();
    if (reason === "viewer_left") { try { this.options.sendSignal({ k: "bye", reason, gen: this.gen }); } catch { /* best effort */ } }
    this.ended = true;
    if (this.timer) clearInterval(this.timer); this.timer = undefined;
    this.attachVideo(null); this.detachPeer(); this.recovery.clear(); this.pendingSignals = []; this.candidates = []; this.pingTimes.clear();
    const report = this.telemetry.report(true, reason); swallow(() => this.options.onReport(report, true));
    swallow(() => this.options.onTerminal(reason));
  }
}
