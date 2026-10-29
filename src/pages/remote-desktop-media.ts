import { prepareEngine, PUBLISH_STATE, type ArtcEngine } from "../shell/messages/call/engine/sdk";
import { loadRemoteArtcSdk, type RemoteArtcSdk } from "./remote-desktop-sdk";
import type { RemoteDesktopDataLane, RemoteMediaCredentials } from "../api/remote-desktop";

/** A remote viewer owns a separate receive-only engine; never reuse the call singleton. */
export type RemoteMediaState = "joining" | "waiting_frame" | "playing" | "reconnecting" | "error";
export interface RemoteMediaViewer {
  close(): Promise<void>;
}
export interface RemoteMediaHandlers {
  state(value: RemoteMediaState, error?: string, status?: number): void;
  frame(width: number, height: number): void;
  renew(): Promise<RemoteMediaCredentials>;
  /** D4: the viewer's published ARTC data channel, or null when it is (no longer) usable. */
  dataChannel?(lane: RemoteDesktopDataLane | null): void;
  /** Why media setup failed, before the matching `state("error")`; host names and numeric SDK codes only. */
  diagnostic?(detail: RemoteMediaDiagnostic): void;
}

export interface RemoteMediaDiagnostic { blocked_host?: string; sdk_error?: number }

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
  const sdk = await sdkLoader();
  if (signal.aborted) throw new Error("aborted");
  const engine = sdk.createEngine() as DataChannelEngine;
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
  let lastFrame = 0, lastTime = -1;
  let playing = false, renewal: ReturnType<typeof setTimeout> | undefined, expiry: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
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
  const decodedFrame = () => {
    if (closed || !video.videoWidth || !video.videoHeight || video.readyState < 2) return;
    lastFrame = Date.now();
    // Notify on every decoded frame so display-switch geometry can gate input even
    // when two displays happen to have identical encoded dimensions.
    handlers.frame(video.videoWidth, video.videoHeight);
    if (!playing) { playing = true; clearTimeout(subscribeFailure); subscribeFailure = undefined; lowerPlayoutDelay(video); handlers.state("playing"); }
  };
  const fallbackFrame = () => {
    if (video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    decodedFrame();
  };
  const watchFrame = () => {
    if (closed) return;
    decodedFrame();
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
      if (!closed) scheduleRenew(fresh.expires_at);
    })().catch((error: unknown) => {
      // A renewal refusal retains account/revocation/compatibility evidence.
      const status = error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : undefined;
      fail(error instanceof RemotePublisherStatusError ? error.message
        : status !== undefined && error instanceof Error ? error.message : "media_auth_failed", status);
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  };
  const subscribe = (uid: string, track?: number) => {
    if (closed || uid !== credentials.publisher_id || (track !== undefined && !(track & 2))) return;
    try {
      // 7.3.8 public subscribeRemoteMediaStream incorrectly passes {video,audio},
      // omitting screen. Use the SDK's declared screen reconciler; never subscribe mic.
      const biz = (engine as unknown as { bizControl?: { updateScreenWant(uid: string, enabled: boolean): void } }).bizControl;
      if (!biz?.updateScreenWant) throw new Error("media_screen_subscription_unsupported");
      engine.setRemoteViewConfig(video, uid, 2);
      biz.updateScreenWant(uid, true);
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
  on("authInfoWillExpire", () => { void renew(); });
  on("authInfoExpired", () => { void renew(); });
  on("bye", () => fail("media_session_closed"));
  watchdog = setInterval(() => {
    if (closed || (typeof document !== "undefined" && document.hidden)) return;
    const elapsed = Date.now() - (lastFrame || started);
    if (elapsed > 20_000) fail(lastFrame ? "media_frame_timeout" : "media_first_frame_timeout");
    else if (lastFrame && elapsed > 5000 && playing) { playing = false; handlers.state("reconnecting"); }
  }, 1000);
  try {
    handlers.state("joining");
    scheduleRenew(credentials.expires_at);
    await untilAborted(prepareEngine(engine, { autoSubscribeAudio: false }), lifetime.signal);
    // index.d.ts ParameterData: documented publisher-side data channel; it rides the synthetic track below.
    let dataChannelEnabled = false;
    if (wantsDataChannel) {
      try { engine.setParameter!(JSON.stringify({ data: { enablePubDataChannel: true, enableSubDataChannel: false } })); dataChannelEnabled = true; }
      catch { /* input stays on the gateway path */ }
    }
    await untilAborted(engine.publishLocalAudioStream(false), lifetime.signal);
    await untilAborted(engine.publishLocalVideoStream(false), lifetime.signal);
    await untilAborted(engine.publishLocalScreenShareStream?.(false), lifetime.signal);
    if (closed) throw new Error("aborted");
    joining = true;
    const join = Promise.resolve(engine.joinChannel(credentials.token, "Remote desktop viewer"));
    void join.then(() => { if (closed) void boundedCleanup(() => engine.leaveChannel()); }, () => {});
    await untilAborted(join, lifetime.signal);
    if (closed) throw new Error("aborted");
    if (!playing) handlers.state("waiting_frame");
    for (const uid of engine.getOnlineRemoteUsers?.() ?? []) subscribe(uid);
    if (dataChannelEnabled) {
      // The custom track first, then publish: with a local screen stream present the SDK never
      // falls back to getDisplayMedia. Any failure leaves input on the gateway path; video is unaffected.
      synthetic = inputTrack();
      if (synthetic) {
        try {
          await untilAborted(engine.startScreenShare({ audio: false, videoTrack: synthetic.track }), lifetime.signal);
          await untilAborted(engine.publishLocalScreenShareStream?.(true), lifetime.signal);
        } catch (error) {
          if (closed) throw error;
          synthetic.stop(); synthetic = null;
          void Promise.resolve().then(() => engine.stopScreenShare()).catch(() => {});
        }
      }
    }
    scheduleRenew(credentials.expires_at);
    return { close };
  } catch (error) {
    await close();
    throw error;
  }
}
