import { prepareEngine, type ArtcEngine, type ArtcSdk } from "../shell/messages/call/engine/sdk";
import { loadRemoteArtcSdk } from "./remote-desktop-sdk";
import type { RemoteMediaCredentials } from "../api/remote-desktop";

/** A remote viewer owns a separate receive-only engine; never reuse the call singleton. */
export type RemoteMediaState = "joining" | "waiting_frame" | "playing" | "reconnecting" | "error";
export interface RemoteMediaViewer {
  close(): Promise<void>;
}
export interface RemoteMediaHandlers {
  state(value: RemoteMediaState, error?: string, status?: number): void;
  frame(width: number, height: number): void;
  renew(): Promise<RemoteMediaCredentials>;
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
  sdkLoader: () => Promise<ArtcSdk> = loadRemoteArtcSdk,
): Promise<RemoteMediaViewer> {
  const sdk = await sdkLoader();
  if (signal.aborted) throw new Error("aborted");
  const engine: ArtcEngine = sdk.createEngine();
  const lifetime = new AbortController();
  let closed = false, joining = false, closePromise: Promise<void> | null = null;
  let refreshPromise: Promise<void> | null = null;
  let frameCallback: number | null = null;
  let lastFrame = 0, lastTime = -1;
  let playing = false, renewal: ReturnType<typeof setTimeout> | undefined, expiry: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  let watchdog: ReturnType<typeof setInterval> | undefined;
  const listeners: Array<[string, (...args: any[]) => void]> = [];
  const on = (name: string, fn: (...args: any[]) => void) => { listeners.push([name, fn]); engine.on(name, fn); };
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closed = true;
    lifetime.abort();
    clearInterval(watchdog); clearTimeout(renewal); clearTimeout(expiry);
    signal.removeEventListener("abort", abort);
    video.removeEventListener("timeupdate", fallbackFrame);
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
    if (!playing) { playing = true; handlers.state("playing"); }
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
  video.muted = true; video.autoplay = true; video.playsInline = true;
  if (video.requestVideoFrameCallback) frameCallback = video.requestVideoFrameCallback(watchFrame);
  else video.addEventListener("timeupdate", fallbackFrame);
  on("remoteTrackAvailableNotify", (uid: string, _audio: number, track: number) => subscribe(uid, track));
  on("remoteUserOnLineNotify", (uid: string) => subscribe(uid));
  on("remoteUserOffLineNotify", (uid: string) => {
    if (uid === credentials.publisher_id && !closed) { playing = false; handlers.state("reconnecting"); }
  });
  on("connectionStatusChange", (status: number) => {
    if (closed) return;
    if (status === 5) fail("media_connection_failed");
    else if (status === 4 || status === 1) { playing = false; handlers.state("reconnecting"); }
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
    scheduleRenew(credentials.expires_at);
    return { close };
  } catch (error) {
    await close();
    throw error;
  }
}
