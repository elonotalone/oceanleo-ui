"use client";

/**
 * 网站 → 自己的电脑「远程桌面」固定接口 v1（合同 REMOTE.md §三方固定接口）。
 *
 * 只走网站现有的用户 Bearer；设备密钥、本机令牌永远不到网页。session_id 只是句柄，
 * 每个请求服务端仍会核账号与设备归属。画面只在内存里转发，这里也不缓存、不落盘。
 *
 * `error` 一律是**码**不是句子（同 `devices.ts`）：句子在渲染处用 `tt` 取。
 */

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import { controllerHeaders, registerController, type DeviceAvailability } from "./device-settings";
import { RemoteInputScheduler } from "./remote-desktop-scheduler";
import { RemoteControlTimings, type RemoteControlTiming } from "./remote-desktop-control-timing";
export interface RemoteMediaCredentials {
  provider: "artc";
  transport: "artc-v1";
  app_id: string;
  channel_id: string;
  user_id: string;
  publisher_id: string;
  token: string;
  expires_at: string;
  timestamp: number;
  role: "viewer";
  camera: false;
  microphone: false;
  display_id?: string;
  track: "screen";
}

export interface RemoteMediaStatus {
  state: "starting" | "publishing" | "failed";
  error?: string;
  geometry?: { display_id: string; width: number; height: number };
  displays?: Array<{ display_id: string; label: string; width: number; height: number }>;
  metrics?: RemoteMediaMetrics;
}
const MEDIA_METRICS = ["elapsed_ms", "tick_calls", "tick_max_gap_us", "capture_frames", "capture_idle", "capture_errors", "capture_us", "capture_max_us", "capture_lock_wait_us", "capture_lock_max_us", "last_capture_age_ms", "pushes", "push_errors", "repeated_pushes", "empty_ticks", "push_us", "push_max_us", "push_lock_wait_us", "push_lock_max_us", "sdk_samples", "sdk_age_ms", "sdk_capture_fps", "sdk_encode_fps", "sdk_sent_fps", "sdk_sent_kbps", "sdk_rtt_ms", "sdk_send_bytes", "first_capture_ms", "first_push_ms", "joined_ms", "first_encoded_stats_ms"] as const;
/** Optional fixed numeric diagnostics only; never publisher tokens or arbitrary text. */
export type RemoteMediaMetrics = { version: 1 } & Partial<Record<typeof MEDIA_METRICS[number], number>>;
export interface RemoteMediaResponse { media: RemoteMediaCredentials; media_status: RemoteMediaStatus | null }

export type RemoteDesktopSessionState = "pending_consent" | "connecting" | "active" | "closed";

export interface RemoteDesktopStatus {
  supported: boolean;
  enabled: boolean;
  online: boolean;
  session_id: string | null;
  /** Absence means legacy/unknown, not proof of a signed-in device. */
  availability?: DeviceAvailability;
}

export interface RemoteDesktopSession {
  session_id: string;
  state: "pending_consent" | "connecting";
  expires_at: string;
  transport?: "websocket-v2" | "http-v1";
}

export interface RemoteDesktopFrameData {
  /** JPEG data URL（PNG 仅兼容）。 */
  image: string;
  /** 传输尺寸，不是电脑的物理分辨率。 */
  width: number;
  height: number;
  sequence: number;
}

export interface RemoteDesktopFrame {
  state: RemoteDesktopSessionState;
  frame: RemoteDesktopFrameData | null;
  error?: string;
}

export type RemoteDesktopInputKind =
  | "click"
  | "double_click"
  | "move"
  | "scroll"
  | "type"
  | "keypress"
  | "drag";
// v2 press/release actions share the bounded, ordered sequence space with v1.
export type RemoteDesktopStreamInputKind = RemoteDesktopInputKind | "pointer_down" | "pointer_up" | "key_down" | "key_up" | "release_all";

export type RemoteDesktopButton = "left" | "right" | "middle";

export interface RemoteDesktopAction {
  kind: RemoteDesktopStreamInputKind;
  x?: number;
  y?: number;
  toX?: number;
  toY?: number;
  deltaX?: number;
  deltaY?: number;
  text?: string;
  key?: string;
  modifiers?: string[];
  button?: RemoteDesktopButton;
}

export interface RemoteDesktopApiResult<T> {
  ok: boolean;
  data?: T;
  /** 码，不是句子。 */
  error?: string;
  status?: number;
}

/** 网站侧的每个请求都可以带 AbortSignal，关闭面板即取消在途请求。 */
export interface RemoteDesktopRequestOptions {
  signal?: AbortSignal;
}

export interface RemoteDesktopClient {
  negotiateMedia?(deviceId: string, sessionId: string, displayId?: string, options?: RemoteDesktopRequestOptions): Promise<RemoteDesktopApiResult<RemoteMediaResponse>>;
  openStream?(
    deviceId: string, sessionId: string, handlers: RemoteDesktopStreamHandlers,
    options?: RemoteDesktopRequestOptions,
  ): Promise<RemoteDesktopApiResult<RemoteDesktopStream>>;
  getStatus(
    deviceId: string,
    options?: RemoteDesktopRequestOptions,
  ): Promise<RemoteDesktopApiResult<RemoteDesktopStatus>>;
  createSession(
    deviceId: string,
    options?: RemoteDesktopRequestOptions,
  ): Promise<RemoteDesktopApiResult<RemoteDesktopSession>>;
  getFrame(
    deviceId: string,
    sessionId: string,
    options?: RemoteDesktopRequestOptions,
  ): Promise<RemoteDesktopApiResult<RemoteDesktopFrame>>;
  sendInput(
    deviceId: string,
    sessionId: string,
    seq: number,
    action: RemoteDesktopAction,
    options?: RemoteDesktopRequestOptions,
  ): Promise<RemoteDesktopApiResult<{ accepted: true; seq: number }>>;
  closeSession(
    deviceId: string,
    sessionId: string,
  ): Promise<RemoteDesktopApiResult<{ closed: true }>>;
}

export interface RemoteDesktopStream {
  send(action: RemoteDesktopAction): boolean;
  acknowledgeFrame(sequence: number): void;
  close(): void;
}

export interface RemoteDesktopStreamHandlers {
  /** Numeric diagnostics only; completion watermark is not proof of successful OS input. */
  controlTiming?(sample: RemoteControlTiming): void;
  media?(media: RemoteMediaCredentials | null, status: RemoteMediaStatus | null): void;
  state(state: RemoteDesktopSessionState, error?: string): void;
  frame(frame: RemoteDesktopFrameData): void;
  error(code: string): void;
  /** Transient pressure keeps the media/session alive; not a terminal error. */
  congestion?(busy: boolean): void;
}

/** Fixed, bounded binary envelope; dimensions are of the encoded frame. */
export function parseBinaryFrame(packet: ArrayBuffer): { width: number; height: number; sequence: number; jpeg: Uint8Array } | null {
  if (packet.byteLength <= 24 || packet.byteLength > 1_500_024) return null;
  const view = new DataView(packet);
  if (view.getUint32(0) !== 0x4f4c5244 || view.getUint32(4) !== 0x02010000) return null;
  const width = view.getUint32(8), height = view.getUint32(12);
  const sequence = view.getUint32(16) * 2 ** 32 + view.getUint32(20);
  if (!width || !height || width > 4096 || height > 4096 || !Number.isSafeInteger(sequence)) return null;
  const jpeg = new Uint8Array(packet, 24);
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  return { width, height, sequence, jpeg };
}

async function openStream(deviceId: string, sessionId: string, handlers: RemoteDesktopStreamHandlers, options?: RemoteDesktopRequestOptions): Promise<RemoteDesktopApiResult<RemoteDesktopStream>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "unauthorized" };
  let controller: string;
  try { controller = controllerHeaders()["X-OceanLeo-Controller"]; }
  catch { return { ok: false, error: "controller_identity_unavailable" }; }
  if (options?.signal?.aborted) return { ok: false, error: "aborted" };
  const url = new URL(`${GATEWAY_BASE}${base(deviceId)}/sessions/${encodeURIComponent(sessionId)}/stream`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url.toString());
  socket.binaryType = "arraybuffer";
  let ended = false, ready = false, state: RemoteDesktopSessionState = "pending_consent";
  let currentUrl: string | null = null;
  let decoding: { sequence: number; started: number } | null = null;
  let pendingFrameAck: number | null = null;
  let writeFailed = false;
  let settle: (result: RemoteDesktopApiResult<RemoteDesktopStream>) => void;
  const connected = new Promise<RemoteDesktopApiResult<RemoteDesktopStream>>((resolve) => { settle = resolve; });
  const timings = new RemoteControlTimings(() => performance.now(), sample => handlers.controlTiming?.(sample));
  const dispose = () => {
    ended = true;
    timings.dispose();
    clearInterval(heartbeat);
    clearInterval(refresh);
    clearInterval(inputPump);
    clearTimeout(timeout);
    options?.signal?.removeEventListener("abort", abort);
    scheduler.dispose();
    pendingFrameAck = null;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null;
    socket.close();
  };
  const fail = (error: string) => {
    if (ended) return;
    scheduler.emergencyRelease();
    dispose();
    settle!({ ok: false, error });
    handlers.error(error);
  };
  const send = (data: object): boolean => {
    if (ended || writeFailed || socket.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > 64_000) return false;
    try { socket.send(JSON.stringify(data)); }
    catch {
      // Never call this write again: its outcome is unknown, unlike bufferedAmount pressure.
      writeFailed = true;
      queueMicrotask(() => fail("input_ack_unknown"));
      return false;
    }
    return true;
  };
  const scheduler = new RemoteInputScheduler({
    now: Date.now,
    write: (seq, action) => {
      const written = send({ type: "input", seq, action });
      if (written) timings.sent(seq);
      return written;
    },
    congestion: (busy) => handlers.congestion?.(busy),
    failure: fail,
  });
  const stream: RemoteDesktopStream = {
    send(action) {
      if (!ready || state !== "active") return false;
      return scheduler.enqueue(action);
    },
    acknowledgeFrame(value) {
      if (decoding?.sequence === value) decoding = null;
      pendingFrameAck = Math.max(pendingFrameAck ?? 0, value);
      if (send({ type: "frame_ack", sequence: pendingFrameAck })) pendingFrameAck = null;
    },
    close() { scheduler.emergencyRelease(); dispose(); },
  };
  const abort = () => { if (!ended) { scheduler.emergencyRelease(); dispose(); settle!({ ok: false, error: "aborted" }); } };
  const timeout = setTimeout(() => fail("network_error"), 10_000);
  const inputPump = setInterval(() => {
    if (pendingFrameAck !== null && send({ type: "frame_ack", sequence: pendingFrameAck })) pendingFrameAck = null;
    scheduler.tick();
  }, 25);
  const heartbeat = setInterval(() => {
    if (decoding && Date.now() - decoding.started > 10_000) { fail("frame_decode_timeout"); return; }
    send({ type: "ping" });
  }, 2000);
  const refresh = setInterval(() => {
    void accessToken().then((value) => { if (value) send({ type: "auth.refresh", token: value }); else fail("unauthorized"); }).catch(() => fail("unauthorized"));
  }, 20_000);
  options?.signal?.addEventListener("abort", abort, { once: true });
  socket.onopen = () => { send({ type: "auth", token, controller }); };
  socket.onmessage = (event: MessageEvent) => {
    if (ended) return;
    if (event.data instanceof ArrayBuffer) {
      if (state !== "active") { fail("response_malformed"); return; }
      const frame = parseBinaryFrame(event.data);
      if (!frame) { fail("response_malformed"); return; }
      decoding = { sequence: frame.sequence, started: Date.now() };
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = URL.createObjectURL(new Blob([frame.jpeg as BlobPart], { type: "image/jpeg" }));
      handlers.frame({ image: currentUrl, width: frame.width, height: frame.height, sequence: frame.sequence });
      return;
    }
    let data: Record<string, unknown>;
    try { data = JSON.parse(event.data); } catch { fail("response_malformed"); return; }
    if (!data || typeof data !== "object") { fail("response_malformed"); return; }
    if (data.type === "input_ack" && Number.isSafeInteger(data.seq)) { timings.accepted(data.seq as number); scheduler.accepted(data.seq as number); return; }
    if (data.type === "input_rejected" && Number.isSafeInteger(data.seq) && typeof data.error === "string" && typeof data.retry_after_ms === "number" && Number.isFinite(data.retry_after_ms)) {
      scheduler.rejected(data.seq as number, data.error, data.retry_after_ms); return;
    }
    if (data.type !== "state" || !["pending_consent", "connecting", "active", "closed"].includes(String(data.state))) { fail("response_malformed"); return; }
    state = data.state as RemoteDesktopSessionState;
    if (state !== "closed" && typeof data.acked_seq === "number") {
      scheduler.executedThrough(data.acked_seq);
      if (!ended) timings.completedThrough(data.acked_seq);
    }
    if (ended) return;
    if (!ready) { ready = true; clearTimeout(timeout); settle!({ ok: true, data: stream }); }
    handlers.state(state, data.error === "stream_failed" ? "network_error" : typeof data.error === "string" ? data.error : undefined);
    if ("media" in data) {
      const media = data.media === null ? null : parseRemoteMedia(data.media);
      if (data.media !== null && !media) { fail("response_malformed"); return; }
      handlers.media?.(media, parseRemoteMediaStatus(data.media_status));
    }
    if (state === "closed") dispose();
  };
  socket.onerror = () => fail("network_error");
  socket.onclose = () => { if (!ended) fail("network_error"); };
  return connected;
}

function errorCode(data: unknown, status: number): string {
  if (typeof data === "string" && data) return data;
  if (!data || typeof data !== "object") return `HTTP ${status}`;
  const body = data as { code?: unknown; error?: unknown; detail?: unknown };
  if (body.detail && typeof body.detail === "object") {
    const detailCode = (body.detail as { code?: unknown }).code;
    if (typeof detailCode === "string" && detailCode) return detailCode;
  }
  if (typeof body.detail === "string" && body.detail) return body.detail;
  if (typeof body.code === "string" && body.code) return body.code;
  if (typeof body.error === "string" && body.error) return body.error;
  return `HTTP ${status}`;
}

async function authed<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<RemoteDesktopApiResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "unauthorized", status: 401 };
  let controller: Record<string, string>;
  try { controller = controllerHeaders(); }
  catch { return { ok: false, error: "controller_identity_unavailable", status: 0 }; }

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      ...(signal ? { signal } : {}),
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
        ...controller,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    if (signal?.aborted) return { ok: false, error: "aborted", status: 0 };
    return { ok: false, error: "network_error", status: 0 };
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // 空体或非 JSON：成功时按空处理，失败时落到 HTTP 码。
  }
  if (!response.ok) {
    return { ok: false, error: errorCode(data, response.status), status: response.status };
  }
  return { ok: true, data: data as T, status: response.status };
}

function base(deviceId: string): string {
  return `/v1/devices/${encodeURIComponent(deviceId)}/remote-desktop`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function parseRemoteMedia(data: unknown): RemoteMediaCredentials | null {
  if (!isRecord(data) || data.provider !== "artc" || data.transport !== "artc-v1" || data.track !== "screen" || data.role !== "viewer" || data.camera !== false || data.microphone !== false) return null;
  for (const field of ["app_id", "channel_id", "user_id", "publisher_id", "token", "expires_at"]) if (typeof data[field] !== "string" || !data[field]) return null;
  if (typeof data.timestamp !== "number" || !Number.isFinite(data.timestamp) || !Number.isFinite(Date.parse(data.expires_at as string))) return null;
  return data as unknown as RemoteMediaCredentials;
}

export function parseRemoteMediaStatus(data: unknown): RemoteMediaStatus | null {
  if (!isRecord(data) || !["starting", "publishing", "failed"].includes(String(data.state))) return null;
  const dimensions = (value: unknown): value is { display_id: string; width: number; height: number } => isRecord(value) && typeof value.display_id === "string" && typeof value.width === "number" && Number.isFinite(value.width) && value.width > 0 && typeof value.height === "number" && Number.isFinite(value.height) && value.height > 0;
  const rawMetrics = data.metrics;
  const metrics: RemoteMediaMetrics | null = isRecord(rawMetrics) && rawMetrics.version === 1 ? {
    version: 1,
    ...Object.fromEntries(MEDIA_METRICS.filter((key) => typeof rawMetrics[key] === "number" && Number.isSafeInteger(rawMetrics[key]) && Number(rawMetrics[key]) >= 0).map((key) => [key, rawMetrics[key]])),
  } : null;
  return {
    state: data.state as RemoteMediaStatus["state"],
    ...(typeof data.error === "string" ? { error: data.error } : {}),
    ...(dimensions(data.geometry) ? { geometry: data.geometry } : {}),
    ...(Array.isArray(data.displays) ? { displays: data.displays.filter(dimensions).map((display) => ({ ...display, label: typeof (display as Record<string, unknown>).label === "string" ? (display as Record<string, unknown>).label as string : display.display_id })) } : {}),
    ...(metrics ? { metrics } : {}),
  };
}

/** 读不懂的形状宁可当「响应异常」，也不把脏数据喂给 <img>。 */
function parseStatus(data: unknown): RemoteDesktopStatus | null {
  if (!isRecord(data)) return null;
  if (
    typeof data.supported !== "boolean" ||
    typeof data.enabled !== "boolean" ||
    typeof data.online !== "boolean"
  ) {
    return null;
  }
  const sessionId = typeof data.session_id === "string" ? data.session_id : null;
  return {
    supported: data.supported,
    enabled: data.enabled,
    online: data.online,
    session_id: sessionId,
    ...(["online", "signed_out", "offline"].includes(String(data.availability)) ? { availability: data.availability as DeviceAvailability } : {}),
  };
}

const IMAGE_PREFIX = /^data:image\/(jpeg|png);base64,/i;

export function parseFrame(data: unknown): RemoteDesktopFrame | null {
  if (!isRecord(data)) return null;
  const state = data.state;
  if (state !== "pending_consent" && state !== "connecting" && state !== "active" && state !== "closed") return null;
  const out: RemoteDesktopFrame = { state, frame: null };
  if (typeof data.error === "string" && data.error) out.error = data.error;
  const raw = data.frame;
  if (raw === null || raw === undefined) return out;
  // A pending/ended request can never carry a view of the target desktop.
  if (state === "pending_consent" || state === "closed") return null;
  if (!isRecord(raw)) return null;
  const { image, width, height, sequence } = raw;
  if (
    typeof image !== "string" ||
    !IMAGE_PREFIX.test(image) ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof sequence !== "number" ||
    !(width > 0) ||
    !(height > 0) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }
  out.frame = { image, width, height, sequence };
  return out;
}

export const remoteDesktopClient: RemoteDesktopClient = {
  openStream,
  async negotiateMedia(deviceId, sessionId, displayId, options) {
    const result = await authed<unknown>(`${base(deviceId)}/sessions/${encodeURIComponent(sessionId)}/media`, { method: "POST", body: JSON.stringify({ transport: "artc-v1", ...(displayId ? { display_id: displayId } : {}) }) }, options?.signal);
    if (!result.ok) {
      // Missing endpoint is a gateway version mismatch, not missing device consent.
      const missingRoute = result.status === 405 || result.status === 501 || (result.status === 404 && ["Not Found", "HTTP 404"].includes(result.error ?? ""));
      return { ok: false, error: missingRoute ? "media_gateway_unsupported" : result.error, status: result.status };
    }
    const media = isRecord(result.data) ? parseRemoteMedia(result.data.media) : null;
    if (!media) return { ok: false, error: "response_malformed", status: result.status };
    return { ok: true, data: { media, media_status: parseRemoteMediaStatus((result.data as Record<string, unknown>).media_status) }, status: result.status };
  },
  async getStatus(deviceId, options) {
    const registered = await registerController(options?.signal);
    if (!registered.ok) return { ok: false, error: registered.error, status: registered.status };
    const result = await authed<unknown>(`${base(deviceId)}/status`, {}, options?.signal);
    if (!result.ok) return { ok: false, error: result.error, status: result.status };
    const status = parseStatus(result.data);
    if (!status) return { ok: false, error: "response_malformed", status: result.status };
    return { ok: true, data: status, status: result.status };
  },

  async createSession(deviceId, options) {
    const registered = await registerController(options?.signal);
    if (!registered.ok) return { ok: false, error: registered.error, status: registered.status };
    const result = await authed<unknown>(
      `${base(deviceId)}/sessions`,
      { method: "POST", body: "{}" },
      options?.signal,
    );
    if (!result.ok) return { ok: false, error: result.error, status: result.status };
    const data = result.data;
    if (!isRecord(data) || typeof data.session_id !== "string" || !data.session_id || (data.state !== "pending_consent" && data.state !== "connecting")) {
      return { ok: false, error: "response_malformed", status: result.status };
    }
    return {
      ok: true,
      data: {
        session_id: data.session_id,
        state: data.state,
        expires_at: typeof data.expires_at === "string" ? data.expires_at : "",
        ...(data.transport === "websocket-v2" || data.transport === "http-v1" ? { transport: data.transport } : {}),
      },
      status: result.status,
    };
  },

  async getFrame(deviceId, sessionId, options) {
    const result = await authed<unknown>(
      `${base(deviceId)}/sessions/${encodeURIComponent(sessionId)}/frame`,
      {},
      options?.signal,
    );
    if (!result.ok) return { ok: false, error: result.error, status: result.status };
    const frame = parseFrame(result.data);
    if (!frame) return { ok: false, error: "response_malformed", status: result.status };
    return { ok: true, data: frame, status: result.status };
  },

  async sendInput(deviceId, sessionId, seq, action, options) {
    const result = await authed<{ accepted: true; seq: number }>(
      `${base(deviceId)}/sessions/${encodeURIComponent(sessionId)}/input`,
      { method: "POST", body: JSON.stringify({ seq, action }) },
      options?.signal,
    );
    return result;
  },

  closeSession(deviceId, sessionId) {
    return authed<{ closed: true }>(
      `${base(deviceId)}/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE", keepalive: true },
    );
  },
};
