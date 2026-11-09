import { prepareEngine, PUBLISH_STATE, type ArtcEngine } from "../shell/messages/call/engine/sdk";
import { loadRemoteArtcSdk, type RemoteArtcSdk } from "./remote-desktop-sdk";
import type { RemoteDesktopDataLane, RemoteMediaCredentials } from "../api/remote-desktop";
import { videoStatSample } from "../api/remote-desktop-quality";

/** A remote viewer owns a separate receive-only engine; never reuse the call singleton. */
export type RemoteMediaState = "joining" | "waiting_frame" | "playing" | "reconnecting" | "error";
export interface RemoteMediaViewer {
  close(): Promise<void>;
  /** getStats of this <video>'s screen receiver(s), for the anonymous quality report only. */
  stats?(): Promise<unknown[]>;
  diagnostics?(): RemoteMediaDiagnosticSnapshot;
}
export interface RemoteMediaHandlers {
  state(value: RemoteMediaState, error?: string, status?: number): void;
  frame(width: number, height: number, sample?: { presentation_time_ms?: number; media_time_ms?: number; rtp_timestamp_90?: number }): void;
  renew(): Promise<RemoteMediaCredentials>;
  /** D4: the viewer's published ARTC data channel, or null when it is (no longer) usable. */
  dataChannel?(lane: RemoteDesktopDataLane | null): void;
  /** Why media setup failed, before the matching `state("error")`; host names and numeric SDK codes only. */
  diagnostic?(detail: RemoteMediaDiagnostic): void;
  /** Optional measurement hooks; never credentials, tracks, SDP or candidate addresses. */
  timing?(value: RemoteMediaStartupTimings): void;
  diagnostics?(value: RemoteMediaDiagnosticSnapshot): void;
}

export interface RemoteMediaDiagnostic { blocked_host?: string; sdk_error?: number; renew_reason?: string }
export type RemoteMediaStartupStep = "media_negotiate_started_ms" | "media_negotiated_ms" | "media_open_ms" | "sdk_load_started_ms" | "sdk_loaded_ms" | "engine_created_ms"
  | "prepare_started_ms" | "prepared_ms" | "publish_disabled_ms" | "join_started_ms" | "joined_ms"
  | "synthetic_started_ms" | "synthetic_ready_ms" | "synthetic_failed_ms" | "synthetic_skipped_ms"
  | "first_decoded_frame_ms" | "close_started_ms" | "closed_ms";
/** Milestones are absolute performance.now() values on the same viewer clock, not host clocks. */
export type RemoteMediaStartupTimings = { v: 1; kind: 3; at_ms: number; viewer_instance?: number } & Partial<Record<RemoteMediaStartupStep, number>>;
export interface RemoteMediaDiagnosticSnapshot {
  v: 1; kind: 2; viewer_instance: number; at_ms: number; elapsed_ms: number; decoded_frame_count: number; last_frame_age_ms: number;
  stats_calls_total: number; stats_finished_total: number; stats_inflight_count: number; stats_inflight_high_water: number;
  stats_duration_max_ms: number; last_stats_age_ms: number;
  /** Recorder scope can include other calls; these are not a count of this viewer's engines. */
  recorded_peer_count: number; recorded_closed_peer_count: number; screen_track_count: number;
  video_ready_state: number; video_width: number; video_height: number; video_time_ms: number;
  rtc_fps?: number; rtc_frames_decoded?: number; rtc_frames_dropped?: number;
  rtc_packets_received?: number; rtc_packets_lost?: number; rtc_nack_count?: number; rtc_pli_count?: number; rtc_fir_count?: number;
  rtc_freeze_count?: number; rtc_freeze_ms?: number; rtc_jitter_buffer_delay_ms?: number; rtc_jitter_buffer_emitted_count?: number;
  rtc_rtt_ms?: number; rtc_relay?: 0 | 1;
}

/**
 * ARTC media signalling hosts (scheduler/room `*.rtn.aliyuncs.com`, RTS edges `*.alivecdn.com`).
 * A CSP refusal for one of them means this client cannot ever show the picture: fail at once with
 * `media_host_blocked` and the host, instead of a black video until the first-frame timeout.
 */
export function blockedMediaHost(event: { blockedURI?: string; effectiveDirective?: string; violatedDirective?: string }): string | null {
  const directive = event.effectiveDirective || event.violatedDirective || "";
  if (!directive.startsWith("connect-src")) return null;
  let host: string;
  try { host = new URL(event.blockedURI || "").hostname.toLowerCase(); } catch { return null; }
  return /(^|\.)alivecdn\.com$/.test(host) || /(^|\.)rtn\.aliyuncs\.com$/.test(host) ? host : null;
}

/** AliRtcErrorCode screen/video subscribe failures (index.d.ts:1770-1780). */
const SUBSCRIBE_ERRORS: ReadonlySet<number> = new Set([16974852, 16844114, 16844116]);
/** A subscribe error without any decoded frame afterwards ends the attempt this soon. */
export const SUBSCRIBE_ERROR_GRACE_MS = 5000;

/** The engine surface the data-channel lane needs (index.d.ts:1178 setParameter, :1183 sendDataChannelMessage, AliRtcScreenShareStartConfig.videoTrack). */
type DataChannelEngine = ArtcEngine & {
  setParameter?(parameter: string): void;
  sendDataChannelMessage?(message: unknown): void;
  startScreenShare(config?: { audio?: boolean; videoTrack?: MediaStreamTrack }): Promise<void>;
};

/**
 * ARTC data channels need the SENDER to be publishing a stream ("发送消息需正在推流"). The viewer
 * never publishes a microphone, camera or its own screen: it publishes this synthetic 16x16 black
 * track as its *screen-share* track (uid = the viewer descriptor's `user_id`), repainted once a
 * second so the encoder keeps a live stream. Absent canvas capture: no data channel (WS input).
 */
export function syntheticScreenTrack(): { track: MediaStreamTrack; stop(): void } | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas") as HTMLCanvasElement & { captureStream?(rate?: number): MediaStream };
    canvas.width = 16; canvas.height = 16;
    const context = canvas.getContext("2d");
    const track = canvas.captureStream?.(1).getVideoTracks()[0];
    if (!context || !track) return null;
    const paint = () => { context.fillStyle = "#000"; context.fillRect(0, 0, 16, 16); };
    paint();
    const timer = setInterval(paint, 1000);
    return { track, stop() { clearInterval(timer); track.stop(); } };
  } catch { return null; }
}

/*
 * D5 lowest playout delay. The SDK does not expose its RTCPeerConnection, so while a viewer is
 * open the prototype records the connections that get a remote description; only receivers whose
 * track is this <video>'s screen track get `jitterBufferTarget = 0` (Chromium/WebView2, Safari
 * 18+/WKWebView) or the older `playoutDelayHint = 0`. Other calls' receivers are never touched.
 */
const recordedPeers = new Set<RTCPeerConnection>();
let viewerInstances = 0;
let recorders = 0;
let originalSetRemote: RTCPeerConnection["setRemoteDescription"] | null = null;
function recordPeers(): () => void {
  const Peer = typeof RTCPeerConnection === "function" ? RTCPeerConnection : null;
  if (!Peer) return () => {};
  if (recorders++ === 0) {
    const original = Peer.prototype.setRemoteDescription;
    originalSetRemote = original;
    Peer.prototype.setRemoteDescription = function (this: RTCPeerConnection, ...args: Parameters<RTCPeerConnection["setRemoteDescription"]>) {
      recordedPeers.add(this);
      return original.apply(this, args);
    } as RTCPeerConnection["setRemoteDescription"];
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--recorders === 0) {
      if (originalSetRemote) Peer.prototype.setRemoteDescription = originalSetRemote;
      originalSetRemote = null;
      recordedPeers.clear();
    }
  };
}
const tunedReceivers = new WeakSet<object>();
export function lowerPlayoutDelay(video: HTMLVideoElement, peers: Iterable<{ getReceivers?(): RTCRtpReceiver[]; connectionState?: string }> = recordedPeers): number {
  const stream = video.srcObject as { getVideoTracks?(): MediaStreamTrack[] } | null;
  const ids = new Set((stream?.getVideoTracks?.() ?? []).map((track) => track.id));
  let tuned = 0;
  if (!ids.size) return tuned;
  for (const peer of peers) {
    if (peer.connectionState === "closed") { recordedPeers.delete(peer as RTCPeerConnection); continue; }
    for (const receiver of peer.getReceivers?.() ?? []) {
      if (!receiver.track || !ids.has(receiver.track.id) || tunedReceivers.has(receiver)) continue;
      const tunable = receiver as unknown as { jitterBufferTarget?: number | null; playoutDelayHint?: number | null };
      try { if ("jitterBufferTarget" in tunable) tunable.jitterBufferTarget = 0; else tunable.playoutDelayHint = 0; } catch { /* browser keeps its default */ }
      tunedReceivers.add(receiver);
      tuned++;
    }
  }
  return tuned;
}

/** Stats of the receivers that feed this <video> (never other calls' receivers); [] when unavailable. */
export async function receiverStats(video: HTMLVideoElement, peers: Iterable<{ getReceivers?(): RTCRtpReceiver[]; connectionState?: string }> = recordedPeers): Promise<unknown[]> {
  const stream = video.srcObject as { getVideoTracks?(): MediaStreamTrack[] } | null;
  const ids = new Set((stream?.getVideoTracks?.() ?? []).map((track) => track.id));
  if (!ids.size) return [];
  const pending: Promise<unknown>[] = [];
  for (const peer of peers) {
    if (peer.connectionState === "closed") continue;
    for (const receiver of peer.getReceivers?.() ?? []) {
      if (receiver.track && ids.has(receiver.track.id) && typeof receiver.getStats === "function") pending.push(receiver.getStats().catch(() => null));
    }
  }
  return (await Promise.all(pending)).filter(Boolean);
}

/** Cumulative inbound counters, scoped to this screen's receivers (not RTCP or another call). */
function inboundVideoProgress(reports: unknown[], previous: Map<string, number>): boolean {
  let progressed = false;
  for (const report of reports) {
    if (!report || typeof (report as RTCStatsReport).forEach !== "function") continue;
    (report as RTCStatsReport).forEach((entry) => {
      const stat = entry as Record<string, unknown>;
      if (stat.type !== "inbound-rtp" || (stat.kind !== "video" && stat.mediaType !== "video")) return;
      for (const counter of ["bytesReceived", "packetsReceived", "framesReceived"] as const) {
        const value = stat[counter];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
        const key = `${stat.id ?? stat.ssrc ?? "video"}:${counter}`;
        const before = previous.get(key);
        // A replacement receiver may restart its counters. A zero snapshot is never traffic.
        if (value > 0 && (before === undefined || value !== before)) progressed = true;
        previous.set(key, value);
      }
    });
  }
  return progressed;
}

const PUBLISHER_ERROR_CODES: ReadonlySet<string> = new Set([
  "screen_permission_required", "screen_content_unavailable", "screen_content_timeout",
  "screen_display_mismatch", "screen_geometry_invalid", "screen_capture_output_failed",
  "screen_capture_start_failed", "screen_capture_start_timeout", "screen_capture_cleanup_pending",
  "screen_capture_quarantined", "screen_capture_os_unsupported", "screen_permission_or_capture_unavailable",
  "display_enumeration_failed", "display_geometry_failed", "display_not_found",
  "media_audio_guard_unavailable", "media_sdk_not_installed", "media_sdk_start_failed",
  "media_credential_invalid", "media_lease_invalid", "media_renew_failed", "media_no_encoded_frame",
  "media_capture_or_publish_failed",
]);

/** Only a failed publisher snapshot can carry these codes through RTC renewal. */
export class RemotePublisherStatusError extends Error {
  constructor(code?: string) {
    super(code && PUBLISHER_ERROR_CODES.has(code) ? code : "media_capture_or_publish_failed");
    this.name = "RemotePublisherStatusError";
  }
}

function untilAborted<T>(promise: Promise<T> | T, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("aborted"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function boundedCleanup(action: () => Promise<unknown> | unknown): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.resolve().then(action), new Promise<void>((resolve) => { timeout = setTimeout(resolve, 2000); })]);
  } catch { /* teardown must still advance to destroy */ }
  finally { clearTimeout(timeout); }
}

export async function openRemoteMedia(
  credentials: RemoteMediaCredentials,
  video: HTMLVideoElement,
  handlers: RemoteMediaHandlers,
  signal: AbortSignal,
  sdkLoader: () => Promise<RemoteArtcSdk> = loadRemoteArtcSdk,
  inputTrack: typeof syntheticScreenTrack = syntheticScreenTrack,
): Promise<RemoteMediaViewer> {
  const now = () => performance.now();
  const instance = ++viewerInstances;
  const openedAt = now();
  const milestones: Partial<Record<RemoteMediaStartupStep, number>> = {};
  const mark = (step: RemoteMediaStartupStep) => {
    if (milestones[step] !== undefined) return;
    milestones[step] = now();
    try { handlers.timing?.({ v: 1, kind: 3, viewer_instance: instance, at_ms: now(), ...milestones }); } catch { /* measurement only */ }
  };
  mark("media_open_ms"); mark("sdk_load_started_ms");
  const sdk = await sdkLoader();
  mark("sdk_loaded_ms");
  if (signal.aborted) throw new Error("aborted");
  const engine = sdk.createEngine() as DataChannelEngine;
  mark("engine_created_ms");
  const releasePeers = recordPeers();
  // Peer input only when the gateway granted it for this controller and the SDK can carry it.
  const wantsDataChannel = credentials.data_channel_input === true && typeof sdk.dataChannelMessage === "function"
    && typeof engine.setParameter === "function" && typeof engine.sendDataChannelMessage === "function";
  let laneOpen = false;
  let synthetic: ReturnType<typeof syntheticScreenTrack> = null;
  const encoder = new TextEncoder();
  const setLane = (open: boolean) => {
    if (open === laneOpen || (open && closed)) return;
    laneOpen = open;
    handlers.dataChannel?.(open ? {
      send(payload: string) {
        if (closed || !laneOpen) return false;
        const bytes = encoder.encode(payload);
        engine.sendDataChannelMessage!(sdk.dataChannelMessage!(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
        return true;
      },
    } : null);
  };
  const lifetime = new AbortController();
  let closed = false, joining = false, closePromise: Promise<void> | null = null;
  let refreshPromise: Promise<void> | null = null;
  let frameCallback: number | null = null;
  let lastFrame: number | null = null, lastTime = -1;
  let playing = false, renewal: ReturnType<typeof setTimeout> | undefined, expiry: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  let lastInbound = started, statsPending = false;
  let statsCalls = 0, statsFinished = 0, statsInFlight = 0, statsHighWater = 0, statsMaxMs = 0;
  let lastStatsAt: number | null = null, lastDecodedAt: number | null = null, decodedFrames = 0;
  let rtc: Partial<RemoteMediaDiagnosticSnapshot> = {};
  const readStats = (): Promise<unknown[]> => {
    statsCalls++; statsInFlight++; statsHighWater = Math.max(statsHighWater, statsInFlight);
    const sampledAt = now();
    return receiverStats(video).then((reports) => {
      try {
        const sample = videoStatSample(reports as Parameters<typeof videoStatSample>[0]);
        if (sample) {
          const fields = { rtc_fps: sample.fps, rtc_frames_decoded: sample.framesDecoded, rtc_frames_dropped: sample.framesDropped,
            rtc_packets_received: sample.packetsReceived, rtc_packets_lost: sample.packetsLost, rtc_nack_count: sample.nackCount,
            rtc_pli_count: sample.pliCount, rtc_fir_count: sample.firCount, rtc_freeze_count: sample.freezeCount,
            rtc_freeze_ms: sample.totalFreezesDuration === undefined ? undefined : sample.totalFreezesDuration * 1000,
            rtc_jitter_buffer_delay_ms: sample.jitterBufferDelay === undefined ? undefined : sample.jitterBufferDelay * 1000,
            rtc_jitter_buffer_emitted_count: sample.jitterBufferEmittedCount, rtc_rtt_ms: sample.rttMs,
            rtc_relay: sample.relay === undefined ? undefined : sample.relay ? 1 : 0 };
          rtc = Object.fromEntries(Object.entries(fields).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0));
        }
      } catch { /* telemetry must not turn a successful stats read into a media failure */ }
      return reports;
    }).finally(() => { statsFinished++; statsInFlight--; lastStatsAt = now(); statsMaxMs = Math.max(statsMaxMs, lastStatsAt - sampledAt); });
  };
  const diagnosticSnapshot = (): RemoteMediaDiagnosticSnapshot => {
    const at = now();
    let closedPeers = 0;
    for (const peer of recordedPeers) if (peer.connectionState === "closed") closedPeers++;
    const tracks = video.srcObject as { getVideoTracks?(): MediaStreamTrack[] } | null;
    return { ...rtc, v: 1, kind: 2, viewer_instance: instance, at_ms: at, elapsed_ms: Math.max(0, at - openedAt), decoded_frame_count: decodedFrames,
      last_frame_age_ms: Math.max(0, at - (lastDecodedAt ?? openedAt)), stats_calls_total: statsCalls,
      stats_finished_total: statsFinished, stats_inflight_count: statsInFlight, stats_inflight_high_water: statsHighWater,
      stats_duration_max_ms: statsMaxMs, last_stats_age_ms: Math.max(0, at - (lastStatsAt ?? openedAt)),
      recorded_peer_count: recordedPeers.size, recorded_closed_peer_count: closedPeers, screen_track_count: tracks?.getVideoTracks?.().length ?? 0,
      video_ready_state: video.readyState, video_width: video.videoWidth, video_height: video.videoHeight,
      video_time_ms: Number.isFinite(video.currentTime) ? video.currentTime * 1000 : 0 };
  };
  const reportDiagnostics = () => { try { handlers.diagnostics?.(diagnosticSnapshot()); } catch { /* measurement only */ } };
  const inboundCounters = new Map<string, number>();
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let subscribeFailure: ReturnType<typeof setTimeout> | undefined;
  const violation = (event: Event) => {
    const host = blockedMediaHost(event as SecurityPolicyViolationEvent);
    if (!host || closed) return;
    handlers.diagnostic?.({ blocked_host: host });
    fail("media_host_blocked");
  };
  const listeners: Array<[string, (...args: any[]) => void]> = [];
  const on = (name: string, fn: (...args: any[]) => void) => { listeners.push([name, fn]); engine.on(name, fn); };
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    mark("close_started_ms"); reportDiagnostics();
    setLane(false);
    closed = true;
    releasePeers();
    synthetic?.stop(); synthetic = null;
    lifetime.abort();
    clearInterval(watchdog); clearTimeout(renewal); clearTimeout(expiry); clearTimeout(subscribeFailure);
    if (typeof document !== "undefined") document.removeEventListener("securitypolicyviolation", violation);
    signal.removeEventListener("abort", abort);
    video.removeEventListener("timeupdate", fallbackFrame);
    video.removeEventListener("loadedmetadata", playMuted);
    if (frameCallback !== null) video.cancelVideoFrameCallback?.(frameCallback);
    for (const [name, fn] of listeners) engine.off?.(name, fn);
    video.srcObject = null;
    closePromise = (async () => {
      // join may still resolve after cancellation. The startup path leaves again then.
      if (joining) await boundedCleanup(() => engine.leaveChannel());
      await boundedCleanup(() => engine.destroy());
      mark("closed_ms");
    })();
    return closePromise;
  };
  const abort = () => { void close(); };
  const fail = (code: string, status?: number) => {
    if (closed) return;
    if (status === undefined) handlers.state("error", code);
    else handlers.state("error", code, status);
    void close();
  };
  const decodedFrame = (sample?: { presentation_time_ms?: number; media_time_ms?: number; rtp_timestamp_90?: number }) => {
    if (closed || !video.videoWidth || !video.videoHeight || video.readyState < 2) return;
    decodedFrames++; lastDecodedAt = now(); mark("first_decoded_frame_ms");
    lastFrame = Date.now();
    lastInbound = lastFrame;
    // Notify on every decoded frame so display-switch geometry can gate input even
    // when two displays happen to have identical encoded dimensions.
    if (sample) handlers.frame(video.videoWidth, video.videoHeight, sample);
    else handlers.frame(video.videoWidth, video.videoHeight);
    if (!playing) { playing = true; clearTimeout(subscribeFailure); subscribeFailure = undefined; lowerPlayoutDelay(video); handlers.state("playing"); }
  };
  const fallbackFrame = () => {
    if (video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    decodedFrame();
  };
  const watchFrame = (_now?: number, metadata?: VideoFrameCallbackMetadata) => {
    if (closed) return;
    const value = metadata as unknown as { presentationTime?: number; mediaTime?: number; rtpTimestamp?: number } | undefined;
    decodedFrame(value && {
      ...(Number.isFinite(value.presentationTime) ? { presentation_time_ms: value.presentationTime } : {}),
      ...(value.mediaTime !== undefined && Number.isFinite(value.mediaTime) ? { media_time_ms: value.mediaTime * 1000 } : {}),
      ...(Number.isFinite(value.rtpTimestamp) ? { rtp_timestamp_90: value.rtpTimestamp } : {}),
    });
    frameCallback = video.requestVideoFrameCallback(watchFrame);
  };
  const scheduleRenew = (expires: string) => {
    clearTimeout(renewal); clearTimeout(expiry);
    expiry = setTimeout(() => fail("media_auth_failed"), Math.max(0, Date.parse(expires) - Date.now()));
    renewal = setTimeout(() => { void renew(); }, Math.max(1000, Math.min(60_000, Date.parse(expires) - Date.now() - 30_000)));
  };
  const renew = (): Promise<void> => {
    if (closed) return Promise.resolve();
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const fresh = await handlers.renew();
      if (closed) return;
      if (fresh.channel_id !== credentials.channel_id || fresh.user_id !== credentials.user_id || fresh.publisher_id !== credentials.publisher_id) throw new Error("media_session_changed");
      // SDK exceptions are not gateway HTTP or publisher status evidence.
      try { await engine.refreshAuthInfo(fresh.token); }
      catch { throw new Error("media_auth_failed"); }
      if (!closed) { handlers.diagnostic?.({ renew_reason: "success" }); scheduleRenew(fresh.expires_at); }
    })().catch((error: unknown) => {
      // A renewal refusal retains account/revocation/compatibility evidence.
      const reason = error instanceof Error ? error.message : "media_auth_failed";
      handlers.diagnostic?.({ renew_reason: reason.replace(/[^a-zA-Z0-9_]+/g, "_").toLowerCase().slice(0, 64) || "media_auth_failed" });
      const status = error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : undefined;
      fail(error instanceof RemotePublisherStatusError ? error.message
        : status !== undefined && error instanceof Error ? error.message : "media_auth_failed", status);
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  };
  const subscribe = (uid: string, track?: number) => {
    if (closed || uid !== credentials.publisher_id || (track !== undefined && !(track & 2))) return;
    try {
      engine.setRemoteViewConfig(video, uid, 2);
      // 7.3.8's public method maps track 2 to camera; use its screen want
      // reconciler directly, with the older SDK fallback when needed.
      const biz = (engine as unknown as { bizControl?: { updateScreenWant?(uid: string, enabled: boolean): void; updateVideoWant?(uid: string, enabled: boolean): void } }).bizControl;
      if (biz?.updateScreenWant) biz.updateScreenWant(uid, true);
      else if (typeof (engine as any).subscribeRemoteMediaStream === "function") engine.subscribeRemoteMediaStream(uid, 2, true, true);
      else throw new Error("media_screen_subscription_unsupported");
    } catch { fail("media_subscribe_failed"); }
  };
  signal.addEventListener("abort", abort, { once: true });
  if (typeof document !== "undefined") document.addEventListener("securitypolicyviolation", violation);
  video.muted = true; video.autoplay = true; video.playsInline = true;
  // A webview whose autoplay policy ignored the muted autoplay attribute still starts here.
  const playMuted = () => { void Promise.resolve().then(() => video.play?.()).catch(() => {}); };
  video.addEventListener("loadedmetadata", playMuted);
  if (video.requestVideoFrameCallback) frameCallback = video.requestVideoFrameCallback(watchFrame);
  else video.addEventListener("timeupdate", fallbackFrame);
  on("remoteTrackAvailableNotify", (uid: string, _audio: number, track: number) => subscribe(uid, track));
  on("remoteUserOnLineNotify", (uid: string) => subscribe(uid));
  on("remoteUserOffLineNotify", (uid: string) => {
    if (uid === credentials.publisher_id && !closed) { playing = false; handlers.state("reconnecting"); }
  });
  on("dataPublishStateChanged", (_previous: number, next: number) => { if (!closed) setLane(next === PUBLISH_STATE.published); });
  on("connectionStatusChange", (status: number) => {
    if (closed) return;
    if (status === 5) fail("media_connection_failed");
    else if (status === 4 || status === 1) { playing = false; setLane(false); handlers.state("reconnecting"); }
  });
  on("occurError", (error: { code?: unknown } | undefined, uid?: string) => {
    const code = typeof error?.code === "number" ? error.code : NaN;
    if (closed || playing || !SUBSCRIBE_ERRORS.has(code) || (uid !== undefined && uid !== credentials.publisher_id) || subscribeFailure) return;
    // The SDK retries internally; only a retry that still yields no frame becomes explicit.
    subscribeFailure = setTimeout(() => {
      if (closed || playing) return;
      handlers.diagnostic?.({ sdk_error: code });
      fail("media_subscribe_failed");
    }, SUBSCRIBE_ERROR_GRACE_MS);
  });
  on("authInfoWillExpire", () => { handlers.diagnostic?.({ renew_reason: "auth_info_will_expire" }); void renew(); });
  on("authInfoExpired", () => { handlers.diagnostic?.({ renew_reason: "auth_info_expired" }); void renew(); });
  on("bye", () => fail("media_session_closed"));
  const checkLiveness = () => {
    if (closed || (typeof document !== "undefined" && document.hidden)) return;
    const elapsed = Date.now() - (lastFrame ?? started);
    // Receiving bytes cannot hide a decoder that never produces a picture.
    if (elapsed > 20_000) fail(lastFrame !== null ? "media_frame_timeout" : "media_first_frame_timeout");
    else if (lastFrame !== null && Date.now() - lastInbound > 6000 && playing) { playing = false; handlers.state("reconnecting"); }
  };
  watchdog = setInterval(() => {
    if (closed || (typeof document !== "undefined" && document.hidden)) return;
    reportDiagnostics();
    // A stuck getStats must not hold up either the traffic deadline or the hard frame deadline.
    if (statsPending || Date.now() - (lastFrame ?? started) > 20_000) { checkLiveness(); return; }
    statsPending = true;
    const sampledAt = Date.now();
    void readStats().then((reports) => {
      if (closed) return;
      if (inboundVideoProgress(reports, inboundCounters)) lastInbound = Math.max(lastInbound, sampledAt);
      checkLiveness();
    }).catch(() => { checkLiveness(); }).finally(() => { statsPending = false; });
  }, 1000);
  try {
    handlers.state("joining");
    scheduleRenew(credentials.expires_at);
    mark("prepare_started_ms");
    await untilAborted(prepareEngine(engine, { autoSubscribeAudio: false }), lifetime.signal);
    mark("prepared_ms");
    // index.d.ts ParameterData: documented publisher-side data channel; it rides the synthetic track below.
    let dataChannelEnabled = false;
    if (wantsDataChannel) {
      try { engine.setParameter!(JSON.stringify({ data: { enablePubDataChannel: true, enableSubDataChannel: false } })); dataChannelEnabled = true; }
      catch { /* input stays on the gateway path */ }
    }
    await untilAborted(engine.publishLocalAudioStream(false), lifetime.signal);
    await untilAborted(engine.publishLocalVideoStream(false), lifetime.signal);
    await untilAborted(engine.publishLocalScreenShareStream?.(false), lifetime.signal);
    mark("publish_disabled_ms");
    if (closed) throw new Error("aborted");
    joining = true;
    mark("join_started_ms");
    const join = Promise.resolve(engine.joinChannel(credentials.token, "Remote desktop viewer"));
    void join.then(() => { if (closed) void boundedCleanup(() => engine.leaveChannel()); }, () => {});
    await untilAborted(join, lifetime.signal);
    mark("joined_ms");
    if (closed) throw new Error("aborted");
    if (!playing) handlers.state("waiting_frame");
    for (const uid of engine.getOnlineRemoteUsers?.() ?? []) subscribe(uid);
    if (dataChannelEnabled) {
      // The custom track first, then publish: with a local screen stream present the SDK never
      // falls back to getDisplayMedia. Any failure leaves input on the gateway path; video is unaffected.
      mark("synthetic_started_ms");
      synthetic = inputTrack();
      if (synthetic) {
        try {
          await untilAborted(engine.startScreenShare({ audio: false, videoTrack: synthetic.track }), lifetime.signal);
          await untilAborted(engine.publishLocalScreenShareStream?.(true), lifetime.signal);
          mark("synthetic_ready_ms");
        } catch (error) {
          if (closed) throw error;
          mark("synthetic_failed_ms");
          synthetic.stop(); synthetic = null;
          void Promise.resolve().then(() => engine.stopScreenShare()).catch(() => {});
        }
      } else mark("synthetic_skipped_ms");
    } else mark("synthetic_skipped_ms");
    scheduleRenew(credentials.expires_at);
    return { close, stats: () => closed ? Promise.resolve([]) : readStats(), diagnostics: diagnosticSnapshot };
  } catch (error) {
    await close();
    throw error;
  }
}
