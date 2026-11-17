import type { RemoteDesktopAction } from "./remote-desktop";
import { isWebRtcInputFault } from "./remote-desktop-webrtc-errors";
import { WebRtcInputScheduler, WEBRTC_MESSAGE_BYTES, type InputLabel } from "./remote-desktop-webrtc-input";
import { WebRtcTelemetry, type WebRtcPath, type WebRtcPresentation, type WebRtcQualityReport, type WebRtcViewerState } from "./remote-desktop-webrtc-telemetry";
import { boundedRtt, pathRoutes, readPathStats, WebRtcPathSelector, type PathRoute } from "./remote-desktop-webrtc-path";
import { WebRtcPathProbe } from "./remote-desktop-webrtc-path-probe";
export type { WebRtcPath, WebRtcPresentation, WebRtcQualityReport, WebRtcViewerState } from "./remote-desktop-webrtc-telemetry";

export interface RemoteWebRtcDescriptor {
  transport: "webrtc-v1"; role: "viewer" | "host"; session_id: string; display_id: string | null;
  ice_servers: (RTCIceServer & { region?: string })[]; ice_expires_at: string; server_now: number; lease_expires_at: string;
}
export type WebRtcSignal =
  | { k: "offer" | "answer"; sdp: string; gen: number }
  | { k: "candidate"; candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; gen: number }
  | { k: "bye"; reason?: string; gen?: number };
export interface PreparedWebRtcPeer {
  pc: RTCPeerConnection; transceiver: RTCRtpTransceiver; channels: Map<Label, RTCDataChannel>;
  offer: RTCSessionDescriptionInit; offeredAt?: number;
}
export interface WebRtcViewerOptions {
  descriptor: RemoteWebRtcDescriptor;
  sendSignal(data: WebRtcSignal): boolean;
  onState(state: WebRtcViewerState, path?: WebRtcPath): void;
  onFrame(width: number, height: number): void;
  onPresentation?(sample: WebRtcPresentation): void;
  onTerminal(reason: string): void;
  onReport(report: WebRtcQualityReport, final: boolean): void;
  clickedAt?: number; sessionCreatedAt?: number; descriptorReceivedAt?: number; sequenceFloor?: number;
  deviceId?: string; now?: () => number; wallNow?: () => number;
  createPeer?: (configuration: RTCConfiguration) => RTCPeerConnection;
  initialPeer?: PreparedWebRtcPeer;
}
type Label = InputLabel | "rd-ctl";
type FrameMetadata = VideoFrameCallbackMetadata & { captureTime?: number; receiveTime?: number };
const labels: Label[] = ["rd-input", "rd-fast", "rd-ctl"];
// Host EndReason::code(), codec refusal and existing viewer terminal aliases.
const terminalByeReasons = new Set([
  "remote_access_disabled", "signed_out", "consent_revoked", "viewer_left", "billing_stopped", "lease_expired",
  "reconnect_window_expired", "capture_restart_failed", "peer_generation_exhausted", "unsupported_h264_profile",
  "input_consent_revoked", "capture_recovery_failed",
]);
const swallow = (fn: () => void): void => { try { fn(); } catch { /* observers cannot stop media */ } };

/** Explicit development-only TURN acceptance switch; never changes a public viewer. */
function viewerIcePolicy(): RTCIceTransportPolicy {
  try {
    const { hostname, search } = window.location;
    const development = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname) || hostname.endsWith(".dev.oceanleo.com");
    const query = new URLSearchParams(search);
    if (development && query.get("__rd_debug") === "1" && query.get("__rd_ice") === "relay") return "relay";
  } catch { /* SSR and non-browser clients keep normal candidate selection. */ }
  return "all";
}
function viewerPathSelection(): boolean {
  try {
    const { hostname, search } = window.location;
    const development = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname) || hostname.endsWith(".dev.oceanleo.com");
    const query = new URLSearchParams(search);
    return !(development && query.get("__rd_debug") === "1" && query.get("__rd_path") === "off");
  } catch { return true; }
}

/** The peer owns media/input only. Authentication, HTTP and stream reconnects belong to the caller. */
export class WebRtcRemoteDesktopViewer {
  /** Make SDP during session creation; ICE gathering waits for authorized TURN credentials. */
  static async prepareInitialPeer(): Promise<PreparedWebRtcPeer | undefined> {
    if (typeof RTCPeerConnection === "undefined") return undefined;
    let pc: RTCPeerConnection | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      pc = new RTCPeerConnection({ iceServers: [], iceTransportPolicy: viewerIcePolicy(), bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" });
      const active = pc;
      const transceiver = pc.addTransceiver("video", { direction: "recvonly" });
      this.lowDelay(transceiver.receiver); this.receiveExtensions(transceiver);
      if (!this.preferCodecs(transceiver)) { pc.close(); return undefined; }
      const channels = new Map<Label, RTCDataChannel>();
      for (const label of labels) channels.set(label, pc.createDataChannel(label, label === "rd-fast" ? { ordered: false, maxRetransmits: 0 } : { ordered: true }));
      const offer = await Promise.race([
        pc.createOffer(),
        new Promise<undefined>(resolve => { timer = setTimeout(() => { swallow(() => active.close()); resolve(undefined); }, 200); }),
      ]);
      if (!offer?.sdp) { swallow(() => active.close()); return undefined; }
      return { pc, transceiver, channels, offer };
    } catch { if (pc) swallow(() => pc!.close()); return undefined; }
    finally { clearTimeout(timer); }
  }
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
  private captureTimes = new Map<number, number>();
  private presentedTimes = new Map<number, number>();
  private captureMappingAvailable = false;
  private lastFrameCount: number | undefined;
  private sessionFrameCount = 0;
  private lastPresentedAt: number | undefined;
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
  private answerDue: number | undefined;
  private connectingOffer: { pc: RTCPeerConnection; gen: number; started: number; answeredAt?: number } | undefined;
  private lastPing = -Infinity;
  private lastStats = -Infinity;
  private lastReport: number;
  private statsPending = false;
  private leaseDeadline: number;
  private state: WebRtcViewerState = "connecting";
  private hostRelayRegion: string | undefined;
  private pingTimes = new Map<number, { at: number; key?: string; pairId?: string }>();
  private icePolicy = viewerIcePolicy();
  private pathEnabled = this.icePolicy === "all" && viewerPathSelection();
  private pathSelector: WebRtcPathSelector;
  private pathProbe: WebRtcPathProbe;
  private selectedPath: { key: string; pairId: string; at: number } | undefined;
  private activeRoute: string | undefined;
  private pathSwitch: { route: PathRoute; previousRoute?: string; started: number; answered: boolean } | undefined;
  constructor(options: WebRtcViewerOptions) {
    this.options = options; this.descriptor = options.descriptor;
    // A reload re-attaches to the same authorized session with a NEW peer generation.
    // This stores no auth, descriptor, action or credential; host authority is unchanged.
    try {
      const saved = Number(sessionStorage.getItem(`oceanleo.rd.generation.${this.descriptor.session_id}`));
      if (Number.isSafeInteger(saved) && saved > 0 && saved < Number.MAX_SAFE_INTEGER) this.gen = saved;
    } catch { /* Restricted storage keeps the normal initial negotiation. */ }
    this.now = options.now ?? (() => performance.now()); this.wallNow = options.wallNow ?? Date.now;
    this.pathSelector = new WebRtcPathSelector(pathRoutes(this.descriptor.ice_servers));
    this.pathProbe = new WebRtcPathProbe({ sid: this.descriptor.session_id, now: this.now, wallNow: this.wallNow,
      createPeer: configuration => (this.options.createPeer ?? (config => new RTCPeerConnection(config)))(configuration),
      send: message => this.sendControl(message), sample: (route, rtt, at, identity) => this.pathSelector.observe(route.key, rtt, at, "ctl", identity) });
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
  private async createConnection(route?: PathRoute): Promise<void> {
    if (this.ended) return;
    if (this.creating) return this.creating;
    this.creating = (async () => {
      const old = this.pc;
      this.pathProbe.reset();
      if (!route) { this.pathSelector.reset(pathRoutes(this.descriptor.ice_servers)); this.pathSwitch = undefined; }
      this.activeRoute = route?.kind === "relay" ? route.key : undefined;
      this.selectedPath = undefined; this.pingTimes.clear();
      this.detachPeer();
      if (old) { this.pictureRebuilding = true; this.telemetry.reconnects++; this.input.recover("picture_reconnecting"); }
      this.captureTimes.clear(); this.presentedTimes.clear(); this.captureMappingAvailable = false;
      this.gen++; const gen = this.gen;
      try { sessionStorage.setItem(`oceanleo.rd.generation.${this.descriptor.session_id}`, String(gen)); } catch { /* optional continuity */ }
      this.hostRelayRegion = undefined; this.telemetry.path = undefined;
      this.candidates = []; this.pendingSignals = []; this.recovery.clear(); this.answerDue = undefined;
      this.disconnectedAt = undefined; this.restartDue = undefined; this.restartBackoff = 1000;
      const create = this.options.createPeer ?? (configuration => new RTCPeerConnection(configuration));
      const initial = this.options.initialPeer; this.options.initialPeer = undefined;
      const prepared = gen === 1 && !route ? initial : undefined;
      if (initial && !prepared) swallow(() => initial.pc.close());
      let pc: RTCPeerConnection;
      try {
        const configuration: RTCConfiguration = { iceServers: route?.kind === "relay" ? route.servers : this.iceServers(), iceTransportPolicy: route ? (route.kind === "relay" ? "relay" : "all") : this.icePolicy, bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" };
        pc = prepared?.pc ?? create(configuration);
        if (prepared) pc.setConfiguration(configuration);
      }
      catch { if (prepared) swallow(() => prepared.pc.close()); this.peerRetryDue = this.now() + 1000; this.emitState("picture_reconnecting"); return; }
      this.pc = pc;
      const transceiver = prepared?.transceiver ?? pc.addTransceiver("video", { direction: "recvonly" });
      WebRtcRemoteDesktopViewer.lowDelay(transceiver.receiver);
      WebRtcRemoteDesktopViewer.receiveExtensions(transceiver);
      if (!WebRtcRemoteDesktopViewer.preferCodecs(transceiver)) { this.close("unsupported_h264_profile"); return; }
      pc.onicecandidate = event => {
        if (this.pc !== pc || this.ended || !event.candidate) return;
        this.transmit({ k: "candidate", candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex, gen });
      };
      pc.ontrack = event => {
        if (this.pc !== pc || this.ended || event.track.kind !== "video") return;
        WebRtcRemoteDesktopViewer.lowDelay(event.receiver);
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
      for (const label of labels) this.createChannel(label, prepared?.channels.get(label));
      if (prepared) {
        // The create envelope already carried this offer. Configure ICE first,
        // then install exactly that SDP; no duplicate offer or second peer.
        await pc.setLocalDescription(prepared.offer);
        if (this.pc === pc && !this.ended) {
          this.telemetry.step("offer_sent_ms", prepared.offeredAt);
          this.armConnectingOffer({ k: "offer", sdp: prepared.offer.sdp ?? "", gen });
        }
      } else await this.offer(pc, false);
    })().catch(() => {
      if (!this.ended) { this.peerRetryDue = this.now() + 1000; this.emitState("picture_reconnecting"); }
    }).finally(() => { this.creating = undefined; });
    return this.creating;
  }
  private static lowDelay(receiver: RTCRtpReceiver): void {
    const low = receiver as RTCRtpReceiver & { jitterBufferTarget?: number; playoutDelayHint?: number };
    if ("jitterBufferTarget" in low) { try { low.jitterBufferTarget = 0; } catch { /* try the older hint */ } }
    try { low.playoutDelayHint = 0; } catch { /* platform may expose read-only hints */ }
  }
  private iceServers(): RTCIceServer[] { return this.descriptor.ice_servers.map(({ region: _region, ...server }) => server); }
  private static receiveExtensions(transceiver: RTCRtpTransceiver): void {
    // Enable capture timing and the sender's playout bounds before the offer.
    // Receiver hints express a minimum; the RTP extension also conveys a maximum.
    // No audio transceiver is created, so audio synchronization adds no delay.
    type Extension = { uri: string; direction: RTCRtpTransceiverDirection | "stopped" };
    const headers = transceiver as RTCRtpTransceiver & {
      getHeaderExtensionsToNegotiate?(): Extension[];
      setHeaderExtensionsToNegotiate?(extensions: Extension[]): void;
    };
    try {
      const extensions = headers.getHeaderExtensionsToNegotiate?.();
      const receive = new Set([
        "http://www.webrtc.org/experiments/rtp-hdrext/abs-capture-time",
        "http://www.webrtc.org/experiments/rtp-hdrext/playout-delay",
      ]);
      if (!extensions || !headers.setHeaderExtensionsToNegotiate) return;
      headers.setHeaderExtensionsToNegotiate(extensions.map(extension => receive.has(extension.uri) ? { ...extension, direction: "recvonly" } : extension));
    } catch { /* Unsupported timing metadata must never prevent the picture. */ }
  }
  private static preferCodecs(transceiver: RTCRtpTransceiver): boolean {
    try {
      const caps = typeof RTCRtpReceiver === "undefined" ? undefined : RTCRtpReceiver.getCapabilities?.("video");
      if (!caps?.codecs || !transceiver.setCodecPreferences) return false;
      const h264 = caps.codecs.filter(c => {
        if (c.mimeType.toLowerCase() !== "video/h264") return false;
        const parameters = (c.sdpFmtpLine ?? "").split(";").map(value => value.trim().toLowerCase());
        return parameters.includes("profile-level-id=42e01f") && parameters.includes("packetization-mode=1");
      });
      const vp8 = caps.codecs.filter(c => c.mimeType.toLowerCase() === "video/vp8");
      // An empty preference list restores defaults, including the host's unsupported profiles.
      if (!h264.length && !vp8.length) return false;
      // RTX repairs lost packets; it is not an additional picture codec/profile.
      const repair = caps.codecs.filter(c => c.mimeType.toLowerCase() === "video/rtx");
      transceiver.setCodecPreferences([...h264, ...vp8, ...repair]);
      return true;
    } catch { return false; /* Never send an unfiltered offer when preferences cannot be applied. */ }
  }
  private connected(): void {
    this.connectingOffer = undefined;
    this.answerDue = undefined;
    this.disconnectedAt = undefined; this.restartDue = undefined; this.restartBackoff = 1000; this.peerRetryDue = undefined;
    this.telemetry.step("ice_connected_ms"); this.updateState();
  }
  private async offer(pc: RTCPeerConnection, restart: boolean): Promise<void> {
    if (this.negotiatingPeer === pc || this.ended || this.pc !== pc) return;
    this.negotiatingPeer = pc;
    let offered = false;
    try {
      const offer = await pc.createOffer(restart ? { iceRestart: true } : undefined);
      if (this.ended || this.pc !== pc) return;
      await pc.setLocalDescription(offer);
      if (this.ended || this.pc !== pc) return;
      this.transmit({ k: "offer", sdp: pc.localDescription?.sdp ?? offer.sdp ?? "", gen: this.gen });
      offered = true;
    } catch { if (!this.ended && this.pc === pc) this.restartDue = this.now() + this.restartBackoff; }
    finally {
      if (this.negotiatingPeer === pc) {
        this.negotiatingPeer = null;
        if (offered) this.flushSignals();
        else this.pendingSignals = this.pendingSignals.filter(signal => signal.k !== "candidate");
      }
    }
  }
  private transmit(data: WebRtcSignal): void {
    if (this.ended) return;
    // ICE can fire while setLocalDescription is pending. Keep those candidates
    // behind their offer so a host staging a new offer does not discard them.
    let sent = false;
    if (data.k !== "candidate" || this.negotiatingPeer !== this.pc) {
      try { sent = this.options.sendSignal(data); } catch { /* the direct peer remains alive */ }
    }
    if (sent) { if (data.k === "offer") this.offerAccepted(data); return; }
    if (data.k === "offer") {
      this.pendingSignals = this.pendingSignals.filter(s => s.k !== "offer" && (s.k !== "candidate" || s.gen === data.gen));
      this.pendingSignals.unshift(data);
    } else this.pendingSignals.push(data);
    const candidates = this.pendingSignals.filter(s => s.k === "candidate");
    if (candidates.length > 64) this.pendingSignals.splice(this.pendingSignals.indexOf(candidates[0]), 1);
  }
  private armConnectingOffer(data: WebRtcSignal): void {
    const pc = this.pc;
    if (data.k !== "offer" || !pc || pc.remoteDescription || pc.connectionState === "connected") return;
    if (this.connectingOffer?.pc === pc && this.connectingOffer.gen === data.gen) return;
    this.connectingOffer = { pc, gen: data.gen, started: this.now() };
  }
  private offerAccepted(data: WebRtcSignal): void {
    this.telemetry.step("offer_sent_ms");
    this.armConnectingOffer(data);
    // Repeated ICE offers must not keep postponing recovery of a lost host.
    if (this.hasFrame && !this.pathSwitch && this.pc?.connectionState !== "connected") this.answerDue ??= this.now() + 5000;
  }
  flushSignals(): void {
    if (this.ended || this.negotiatingPeer) return;
    while (this.pendingSignals.length) {
      let sent = false; try { sent = this.options.sendSignal(this.pendingSignals[0]); } catch { /* retry on next tick */ }
      if (!sent) break;
      if (this.pendingSignals[0].k === "offer") this.offerAccepted(this.pendingSignals[0]);
      this.pendingSignals.shift();
    }
  }
  async signal(value: unknown): Promise<void> {
    // A create+offer answer can arrive before initial setLocalDescription ends.
    if (this.creating) await this.creating;
    if (this.ended || !value || typeof value !== "object") return;
    const data = value as WebRtcSignal;
    if (data.gen !== undefined && (!Number.isSafeInteger(data.gen) || data.gen < this.gen)) return;
    if (data.k === "bye") {
      if (data.gen !== undefined && data.gen !== this.gen) return;
      const reason = typeof data.reason === "string" ? data.reason : "";
      if (isWebRtcInputFault(reason)) this.channelFault("rd-input", reason);
      else if (reason === "peer_failed" && this.pc) {
        this.peerRetryDue ??= this.now() + 200;
        this.emitState("picture_reconnecting");
      } else if (reason === "ice_restart_required" && this.pc) {
        this.disconnectedAt ??= this.now();
        this.restartDue ??= this.now();
        this.emitState("picture_reconnecting");
      } else if (terminalByeReasons.has(reason)) this.close(reason);
      return;
    }
    if (data.gen !== this.gen || !this.pc) return;
    const pc = this.pc;
    try {
      if (data.k === "answer" && typeof data.sdp === "string") {
        await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        if (this.pc !== pc || this.ended) return;
        this.answerDue = undefined;
        if (this.connectingOffer?.pc === pc && this.connectingOffer.gen === data.gen) this.connectingOffer.answeredAt ??= this.now();
        if (this.pathSwitch) this.pathSwitch.answered = true;
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
    const routes = pathRoutes(descriptor.ice_servers); this.pathSelector.updateRoutes(routes);
    const relay = routes.find(route => route.key === this.activeRoute);
    try { this.pc?.setConfiguration({ ...this.pc.getConfiguration(), iceServers: relay?.servers ?? this.iceServers() }); } catch { /* use fresh credentials on next restart */ }
    if (this.activeRoute && !relay) { this.pathProbe.stop(); this.pathSwitch = undefined; this.fallbackPath(); if (this.pc) void this.offer(this.pc, true); }
    this.flushSignals();
  }
  private createChannel(label: Label, prepared?: RTCDataChannel): void {
    const pc = this.pc; if (!pc || this.ended) return;
    let channel: RTCDataChannel;
    try { channel = prepared ?? pc.createDataChannel(label, label === "rd-fast" ? { ordered: false, maxRetransmits: 0 } : { ordered: true }); }
    catch { this.channelFault(label, "input_channel_create_failed"); return; }
    const previous = this.channels.get(label);
    if (previous) { previous.onopen = previous.onclose = previous.onerror = previous.onmessage = previous.onbufferedamountlow = null; swallow(() => previous.close()); }
    this.channels.set(label, channel); channel.bufferedAmountLowThreshold = label === "rd-fast" ? 0 : 128 * 1024;
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
    if (label === "rd-ctl") this.pathProbe.reset();
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
    else if (data.t === "rd.path_probe_ready" && data.version === 1 && this.pathEnabled) this.pathProbe.enable();
    else if (data.t === "rd.path_probe" && this.pathEnabled) void this.pathProbe.receive(data, this.gen);
    else if (data.t === "rd.pong" && typeof data.t_v === "number" && this.pingTimes.has(data.t_v)) {
      const ping = this.pingTimes.get(data.t_v)!;
      this.pingTimes.delete(data.t_v);
      const selected = this.selectedPath, rtt = boundedRtt(this.now() - ping.at);
      if (this.pathEnabled && selected && ping.key === selected.key && ping.pairId === selected.pairId && this.now() - selected.at <= 1500 && rtt !== undefined && rtt <= 3000) {
        this.pathSelector.observe(selected.key, rtt, this.now(), "ctl", `${this.gen}:${selected.pairId}`);
      }
      const received = data.host_receive_ms ?? data.t_h_recv ?? data.device_wall_ms;
      const sent = data.host_send_ms ?? data.t_h_send ?? data.device_wall_ms;
      if (typeof received === "number" && typeof sent === "number") this.telemetry.clock.sample(data.t_v, received, sent, this.wallNow(), this.now());
    } else if (data.t === "rd.frame_time" && data.gen === this.gen && Array.isArray(data.frames) && data.frames.length <= 128) {
      this.captureMappingAvailable = true;
      for (const pair of data.frames) {
        if (!Array.isArray(pair) || pair.length !== 2) continue;
        const [rtp, capture] = pair;
        if (!Number.isInteger(rtp) || rtp < 0 || rtp > 0xffff_ffff || !Number.isSafeInteger(capture) || capture <= 0) continue;
        const presented = this.presentedTimes.get(rtp);
        if (presented !== undefined) { this.telemetry.captureFrameTime(presented, capture); this.presentedTimes.delete(rtp); }
        else this.captureTimes.set(rtp, capture);
      }
      while (this.captureTimes.size > 512) this.captureTimes.delete(this.captureTimes.keys().next().value!);
    } else if (data.t === "rd.publisher_stats" && data.metrics && typeof data.metrics === "object") {
      this.telemetry.publisher = Object.fromEntries(Object.entries(data.metrics).filter(([key, value]) => /^[a-z][a-z0-9_]{0,63}$/.test(key) && typeof value === "number" && Number.isFinite(value)) as [string, number][]);
      const region = data.path && typeof data.path === "object" ? (data.path as Record<string, unknown>).relay_region : undefined;
      if (typeof region === "string" && /^[a-z0-9-]{1,32}$/.test(region)) this.hostRelayRegion = region;
    } else if (data.t === "rd.input_error") this.channelFault("rd-input", "host_input_executor_failed");
  }
  private ping(): void {
    const sent = this.wallNow();
    if (this.sendControl({ t: "rd.ping", t_v: sent })) {
      this.pingTimes.set(sent, { at: this.now(), key: this.selectedPath?.key, pairId: this.selectedPath?.pairId }); if (this.pingTimes.size > 32) this.pingTimes.delete(this.pingTimes.keys().next().value!);
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
    video.autoplay = true; video.muted = true; video.playsInline = true;
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
    // Observe before attaching an already-producing track: the first decoded image
    // must not pass the observer while waiting for a second image on an idle screen.
    video.srcObject = this.mediaStream;
    this.play();
  }
  private play(): void { try { const playing = this.video?.play(); playing?.catch(() => {}); } catch { /* attach before autoplay is permitted */ } }
  private frame(video: HTMLVideoElement, at: number, metadata: Partial<FrameMetadata>): void {
    if (this.ended || !video.videoWidth || !video.videoHeight) return;
    if (this.pictureRebuilding && this.trackGeneration !== this.gen) return;
    this.hasFrame = true; this.pictureRebuilding = false; this.telemetry.frame(at, this.captureMappingAvailable ? { ...metadata, captureTime: undefined } : metadata);
    const sample: WebRtcPresentation = { session_frame_count: ++this.sessionFrameCount, peer_generation: this.gen, presented_at_ms: at };
    if (this.lastPresentedAt !== undefined && at >= this.lastPresentedAt) sample.gap_ms = at - this.lastPresentedAt;
    this.lastPresentedAt = at;
    for (const key of ["expectedDisplayTime", "presentationTime", "captureTime", "receiveTime", "processingDuration", "presentedFrames", "rtpTimestamp"] as const) {
      const value = metadata[key]; if (typeof value === "number" && Number.isFinite(value)) sample[key] = value;
    }
    // Diagnostics are optional, numeric-only, and never drive media or input lifetime.
    if (this.options.onPresentation) swallow(() => this.options.onPresentation!(sample));
    if (Number.isInteger(metadata.rtpTimestamp)) {
      const rtp = metadata.rtpTimestamp!; const captured = this.captureTimes.get(rtp);
      if (captured !== undefined) { this.telemetry.captureFrameTime(at, captured); this.captureTimes.delete(rtp); }
      else this.presentedTimes.set(rtp, at);
      while (this.presentedTimes.size > 512) this.presentedTimes.delete(this.presentedTimes.keys().next().value!);
    }
    this.updateState();
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
    // Decoder recovery uses the browser's RTCP PLI/FIR. A freeze is telemetry only;
    // there is no application keyframe timer or periodic-keyframe wait.
    this.flushSignals(); this.input.tick(); this.telemetry.tick();
    const connecting = this.connectingOffer;
    if (connecting && !this.creating && !this.negotiatingPeer && !this.pathSwitch) {
      // A frame from a retired peer is not proof that this peer connected.
      if (this.pc !== connecting.pc || connecting.gen !== this.gen || connecting.pc.connectionState === "connected") this.connectingOffer = undefined;
      else if (now >= (connecting.answeredAt === undefined ? connecting.started + 2500 : connecting.answeredAt + 5000)) {
        // Same-gen duplicate SDP re-enters native answer negotiation, so never replay it.
        // Bound both missing answers and answers stuck checking on the same authorized
        // session; input sequences are not replayed and the session lease still bounds retries.
        this.connectingOffer = undefined; this.peerRetryDue = now;
      }
    }
    for (const [label, retry] of this.recovery) if (now >= retry.due) {
      // Give DCEP time to open. Retiring a connecting replacement every 200ms can starve a slow path.
      retry.due = now + Math.max(2000, retry.backoff); retry.backoff = Math.min(2000, retry.backoff * 2); this.createChannel(label);
    }
    if (this.answerDue !== undefined && now >= this.answerDue && !this.creating && !this.negotiatingPeer && this.pc?.connectionState !== "connected") {
      this.answerDue = undefined; this.peerRetryDue = now;
    }
    if (this.peerRetryDue !== undefined && now >= this.peerRetryDue) { this.peerRetryDue = undefined; void this.createConnection(); }
    else if (this.restartDue !== undefined && now >= this.restartDue && this.pc) {
      if (this.activeRoute) { this.pathSwitch = undefined; this.fallbackPath(); }
      this.restartDue = now + this.restartBackoff; this.restartBackoff = Math.min(8000, this.restartBackoff * 2); void this.offer(this.pc, true);
    }
    this.pathTick();
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
      const readings = readPathStats(all, pathRoutes(this.descriptor.ice_servers));
      if (this.pathEnabled && readings.selected && pair.state === "succeeded") {
        const selected = readings.selected;
        this.selectedPath = { key: selected.route?.key ?? `selected:${selected.id}`, pairId: selected.id, at: this.now() };
        this.pathSelector.selected(this.selectedPath.key, this.now());
        for (const reading of readings.succeeded) this.pathSelector.ice(reading, this.now());
        if (!selected.route) this.pathSelector.ice({ ...selected, route: { key: this.selectedPath.key, kind: "relay", servers: [] } }, this.now());
        if (this.pathSwitch?.answered && selected.route?.key === this.pathSwitch.route.key) this.pathSwitch = undefined;
      } else this.selectedPath = undefined;
      const path: WebRtcPath = {};
      if (local && ["host", "srflx", "prflx", "relay"].includes(String(local.candidateType))) path.local_type = local.candidateType as WebRtcPath["local_type"];
      if (remote && ["host", "srflx", "prflx", "relay"].includes(String(remote.candidateType))) path.remote_type = remote.candidateType as WebRtcPath["remote_type"];
      const address = String(remote?.address ?? local?.address ?? "");
      if (address.includes(":")) path.address_family = "ipv6"; else if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) path.address_family = "ipv4";
      if (["udp", "tcp"].includes(String(local?.protocol))) path.protocol = local?.protocol as WebRtcPath["protocol"];
      const rtt = boundedRtt(typeof pair.currentRoundTripTime === "number" ? pair.currentRoundTripTime * 1000 : undefined);
      if (rtt !== undefined) path.rtt_ms = rtt;
      // A relay region is reported only when supplied as coarse metadata; never derive or expose an IP/hostname.
      const relayUrl = path.local_type === "relay" ? local?.url : path.remote_type === "relay" ? remote?.url : undefined;
      const mappedRegion = this.descriptor.ice_servers.find(server => (Array.isArray(server.urls) ? server.urls : [server.urls]).includes(String(relayUrl)))?.region;
      // Remote candidate stats often omit url; the authenticated host can identify its own selected TURN region.
      const region = mappedRegion ?? (path.remote_type === "relay" ? this.hostRelayRegion : undefined);
      if ((path.local_type === "relay" || path.remote_type === "relay") && typeof region === "string" && /^[a-z0-9-]{1,32}$/.test(region)) path.relay_region = region;
      if (this.pathEnabled) {
        Object.assign(path, this.pathSelector.comparison(this.selectedPath?.key, this.now()));
        path.selection_state = this.pathSwitch ? "switching" : !pathRoutes(this.descriptor.ice_servers).some(route => route.kind === "relay") ? "unavailable"
          : path.direct_rtt_ms !== undefined && path.relay_rtt_ms !== undefined ? "stable" : "measuring";
      }
      this.telemetry.path = path; this.emitState(this.state);
    } catch { /* stats are optional and never affect connection lifetime */ }
    finally { this.statsPending = false; }
  }
  private fallbackPath(): void {
    if (!this.pc || !this.activeRoute) return;
    this.pathSelector.failed(this.activeRoute, this.now()); this.activeRoute = undefined;
    try { this.pc.setConfiguration({ ...this.pc.getConfiguration(), iceTransportPolicy: this.icePolicy, iceServers: this.iceServers() }); } catch { /* peer recovery uses all routes */ }
  }
  private pathTick(): void {
    if (!this.pathEnabled || !this.pc) return;
    const now = this.now(), pc = this.pc, routes = pathRoutes(this.descriptor.ice_servers);
    if (this.telemetry.path) {
      const path = this.telemetry.path;
      delete path.direct_rtt_ms; delete path.relay_rtt_ms; delete path.best_relay_region; delete path.comparison_source;
      Object.assign(path, this.pathSelector.comparison(this.selectedPath && now - this.selectedPath.at <= 1500 ? this.selectedPath.key : undefined, now));
      path.selection_state = this.pathSwitch ? "switching" : !routes.some(route => route.kind === "relay") ? "unavailable"
        : path.direct_rtt_ms !== undefined && path.relay_rtt_ms !== undefined ? "stable" : "measuring";
    }
    if (this.pathSwitch && now - this.pathSwitch.started >= 10_000) {
      const change = this.pathSwitch; this.pathSwitch = undefined; this.pathSelector.failed(change.route.key, now);
      const previous = routes.find(route => route.key === change.previousRoute);
      // Rebuild for rollback too: Chromium may keep the old selected pair on an ICE restart.
      void this.createConnection(previous ?? routes.find(route => route.kind === "direct")); return;
    }
    const allowed = this.hasFrame && !this.pathSwitch && !this.creating && !this.negotiatingPeer && !this.pendingSignals.length && this.disconnectedAt === undefined && this.peerRetryDue === undefined && pc.connectionState === "connected" && (!pc.signalingState || pc.signalingState === "stable") && this.channels.get("rd-ctl")?.readyState === "open";
    this.pathProbe.tick(routes, this.selectedPath?.key, this.gen, allowed);
    if (!allowed || !this.selectedPath || now - this.selectedPath.at > 1500) return;
    const route = this.pathSelector.choose(this.selectedPath.key, now);
    if (!route) return;
    this.pathSelector.attempted(now); this.pathProbe.stop();
    // A fresh generation makes the selected relay mandatory; setConfiguration +
    // ICE restart can retain an already nominated direct pair in Chromium.
    this.pathSwitch = { route, previousRoute: this.activeRoute, started: now, answered: false };
    void this.createConnection(route);
  }
  private detachPeer(): void {
    this.connectingOffer = undefined;
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
    if (this.options.initialPeer) { swallow(() => this.options.initialPeer!.pc.close()); this.options.initialPeer = undefined; }
    this.pathProbe.reset();
    this.input.close();
    if (reason === "viewer_left") { try { this.options.sendSignal({ k: "bye", reason, gen: this.gen }); } catch { /* best effort */ } }
    this.ended = true;
    if (this.timer) clearInterval(this.timer); this.timer = undefined;
    this.attachVideo(null); this.detachPeer(); this.recovery.clear(); this.pendingSignals = []; this.candidates = []; this.pingTimes.clear();
    const report = this.telemetry.report(true, reason); swallow(() => this.options.onReport(report, true));
    swallow(() => this.options.onTerminal(reason));
  }
}
