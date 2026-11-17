"use client";

/**
 * 网站 → 自己的电脑「远程桌面」固定接口 v1（合同 REMOTE.md §三方固定接口）。
 *
 * 只走网站现有的用户 Bearer；设备密钥、本机令牌永远不到网页。session_id 只是句柄，
 * 每个请求服务端仍会核账号与设备归属。画面只在内存里转发，这里也不缓存、不落盘。
 *
 * `error` 一律是**码**不是句子（同 `devices.ts`）：句子在渲染处用 `tt` 取。
 */

import { createPreparedRemoteWebRtcSession } from "./remote-desktop-webrtc-preconnect";
import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import { controllerHeaders, registerController, type DeviceAvailability } from "./device-settings";
import { MEDIA_METRIC_KEYS, type RemoteMediaMetrics } from "./remote-metrics.generated";
export type { RemoteMediaMetrics } from "./remote-metrics.generated";
import { RemoteInputHistory, parseRemoteInputReceipt, type RemoteInputLane, type RemoteInputReceipt } from "./remote-desktop-input-history";
import { RemoteInputScheduler } from "./remote-desktop-scheduler";
import { isNetworkFailure, newRequestId } from "./remote-desktop-retry";
import { RemoteControlTimings, type RemoteControlTiming } from "./remote-desktop-control-timing";
import type { RemoteDesktopQualityReport, RemoteDesktopViewerReport, RemoteDesktopQualityWindow, RemoteMediaQualitySink } from "./remote-desktop-quality";
import { RemoteTransportDiagnostics, parseRemoteInputDiagnostics, type RemoteInputDiagnostics, type RemoteDesktopTransportDiagnostics } from "./remote-desktop-diagnostics";
import { openRemoteWebRtcStream } from "./remote-desktop-webrtc-stream";
import type { RemoteWebRtcDescriptor, WebRtcPath, WebRtcPresentation } from "./remote-desktop-webrtc";
export type { RemoteWebRtcDescriptor } from "./remote-desktop-webrtc";
export { parseRemoteInputDiagnostics } from "./remote-desktop-diagnostics";
export type { RemoteInputDiagnostics, RemoteDesktopTransportDiagnostics } from "./remote-desktop-diagnostics";
export interface ArtcRemoteMediaCredentials {
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
  /**
   * D4: the gateway minted this viewer token with data-channel publish permission and the
   * computer listens for input on the session's ARTC data channel (and allows input).
   * Required: sessions never carry input over the gateway.
   */
  data_channel_input: boolean;
}
export type RemoteMediaCredentials = ArtcRemoteMediaCredentials | RemoteWebRtcDescriptor;
export type RemoteWebRtcViewerState = "connecting" | "playing" | "input_reconnecting" | "picture_reconnecting";
export type RemoteWebRtcPath = WebRtcPath;
const webRtcSessionTimes = new Map<string, { sessionCreatedAt: number; descriptorReceivedAt?: number }>();

/** What the controlled computer allows (its 允许访问 options, enforced there). */
export interface RemoteDesktopAccess {
  input_allowed: boolean;
  audio: boolean;
}

/** Per-minute metering of the controller's balance while a session is live (gateway R3). */
export interface RemoteDesktopBilling {
  per_minute: number;
  currency: "CNY" | "USD";
  charged_minutes: number;
}

/** Access + billing as last reported; either may be null (legacy gateway/computer). */
export interface RemoteDesktopSessionInfo {
  access: RemoteDesktopAccess | null;
  billing: RemoteDesktopBilling | null;
}

export interface RemoteMediaStatus {
  state: "starting" | "publishing" | "locked" | "failed";
  error?: string;
  geometry?: { display_id: string; width: number; height: number };
  displays?: Array<{ display_id: string; label: string; width: number; height: number }>;
  metrics?: RemoteMediaMetrics;
}
const MEDIA_METRICS = MEDIA_METRIC_KEYS;
export interface RemoteMediaResponse { media: RemoteMediaCredentials; media_status: RemoteMediaStatus | null }

export type RemoteDesktopSessionState = "pending_consent" | "connecting" | "active" | "reconnecting" | "closed";

export interface RemoteDesktopActivity {
  reconnect_window_s?: number;
  reconnect_remaining_s: number | null;
  idle_confirmation_required: boolean;
  idle_remaining_s: number | null;
}

export function parseRemoteDesktopActivity(value: unknown): RemoteDesktopActivity | null {
  if (!isRecord(value)) return null;
  const seconds = (raw: unknown) => typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.ceil(raw) : null;
  return { reconnect_remaining_s: seconds(value.reconnect_remaining_s),
    ...(typeof value.reconnect_window_s === "number" && Number.isFinite(value.reconnect_window_s) && value.reconnect_window_s > 0 ? { reconnect_window_s: value.reconnect_window_s } : {}),
    idle_confirmation_required: value.idle_confirmation_required === true,
    idle_remaining_s: seconds(value.idle_remaining_s) };
}

export interface RemoteDesktopStatus {
  supported: boolean;
  enabled: boolean;
  online: boolean;
  session_id: string | null;
  input_diagnostics?: RemoteInputDiagnostics | null;
  /** Absence means legacy/unknown, not proof of a signed-in device. */
  availability?: DeviceAvailability;
  access?: RemoteDesktopAccess | null;
  billing?: RemoteDesktopBilling | null;
  /** 2026-11-03: last heartbeat the gateway saw (ISO), for "last seen" copy. */
  last_seen_at?: string | null;
  /** 2026-11-03: why no session can start right now (allowlisted gateway reasons only). */
  reason?: RemoteDesktopStatusReason | null;
}

export type RemoteDesktopStatusReason = "remote_desktop_device_reconnecting" | "remote_desktop_unavailable" | "signed_out";
const STATUS_REASONS: readonly RemoteDesktopStatusReason[] = ["remote_desktop_device_reconnecting", "remote_desktop_unavailable", "signed_out"];

export interface RemoteDesktopSession {
  session_id: string;
  state: "pending_consent" | "connecting";
  expires_at: string;
  transport?: "artc-v1" | "webrtc-v1";
  billing?: RemoteDesktopBilling | null;
  /** Owner request waiting only for an idle computer's own answer; its video may be negotiated now. */
  owner_handshake?: true;
  /** K5 one-call media join descriptor when the device is already publishing. */
  media?: RemoteMediaResponse;
}

export interface RemoteDesktopFrameData {
  /** Empty for ARTC: decoded pixels remain on the video element. */
  image: string;
  /** 传输尺寸，不是电脑的物理分辨率。 */
  width: number;
  height: number;
  sequence: number;
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
  /**
   * createSession: the viewer's idempotency key. A retry with the same id (its first reply
   * lost on a lossy path) gets the same session back instead of a second consent request.
   */
  requestId?: string;
  /** The authenticated owner opened this from 我的设备; agent takeover stays consent-gated. */
  ownerDirect?: boolean;
  /** openStream on re-attach: continue input numbering above this (the previous socket's last seq). */
  sequenceFloor?: number;
  transport?: "artc-v1" | "webrtc-v1";
  descriptor?: RemoteWebRtcDescriptor;
  /** Monotonic timestamp of the user's original click, shared by connection telemetry. */
  clickedAt?: number;
}

/** One HTTP attempt never waits longer than this for its reply (lossy paths drop replies). */
export const REQUEST_TIMEOUT_MS = 10_000;
/** createSession keeps retrying the same request id for at most this long. */
export const CREATE_RETRY_WINDOW_MS = 30_000;

export { isNetworkFailure, newRequestId };

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
  closeSession(
    deviceId: string,
    sessionId: string,
  ): Promise<RemoteDesktopApiResult<{ closed: true }>>;
  /** Anonymous end-of-session quality report (`remote-desktop-quality.ts`); keepalive, best effort. */
  reportQuality?(report: RemoteDesktopQualityReport): Promise<RemoteDesktopApiResult<{ stored: boolean }>>;
  reportQualityWindow?(window: RemoteDesktopQualityWindow): Promise<RemoteDesktopApiResult<{ stored: boolean }>>;
  /** Set by `RemoteDesktopQualityHub.wrap`: the media-side quality hooks of a live session. */
  mediaQuality?(sessionId: string): RemoteMediaQualitySink | null;
}

/** C6 publisher-authenticated messages; admission and execution are different measurements. */
export type RemoteDesktopDataMessage =
  | { t: "rd.pong"; v: 1; sid: string; t_v: number; device_wall_ms: number }
  | ({ t: "rd.input_receipt"; v: 1; sid: string } & RemoteInputReceipt)
  | { t: "rd.publisher_stats"; v: 1; sid: string; metrics: Record<string, number> };
/** false proves no write; a throw is ambiguous and must never replay the action on another lane. */
export interface RemoteDesktopDataLane {
  send(payload: string): boolean;
  /** C6: publisher-authenticated session messages. The disposer removes this listener. */
  subscribe?(listener: (message: RemoteDesktopDataMessage) => void): () => void;
}

/** Oldest pending peer write deadline; partial progress never restarts an older write's clock. */
export const PEER_RECEIPT_MS = 1500;
/** Contract D4 bound: one JSON message per input, at most 1 KB. */
export const DATA_CHANNEL_MAX_BYTES = 1024;

/** Contract D4 message (field names fixed by the parent): `{"v":1,"sid","seq","a"}`. */
export function dataChannelMessage(sessionId: string, seq: number, action: RemoteDesktopAction): string | null {
  const text = JSON.stringify({ v: 1, sid: sessionId, seq, a: action });
  return new TextEncoder().encode(text).byteLength <= DATA_CHANNEL_MAX_BYTES ? text : null;
}

export interface RemoteDesktopStream {
  transport?: "artc-v1" | "webrtc-v1";
  attachVideo?(video: HTMLVideoElement | null): void;
  /** Shared actual-write history; measurement never owns another seq/timestamp map. */
  inputHistory?: RemoteInputHistory;
  releaseForHandoff(): Promise<void>;
  finishHandoff(): void;
  send(action: RemoteDesktopAction): boolean;
  /** K2: viewer telemetry uses the ARTC lane when present and the session WS otherwise. */
  sendViewerReport(report: RemoteDesktopViewerReport): boolean;
  acknowledgeFrame(sequence: number): void;
  acknowledgeMediaFrame?(): void;
  /** Attach the sole input transport. No alternate input lane exists. */
  attachDataChannel?(lane: RemoteDesktopDataLane | null): void;
  /** Which path the last written input took (diagnostics/UI only). */
  inputPath?(): "data_channel";
  /** Highest input seq used on this socket (both lanes): the floor for a re-attached stream. */
  lastSequence?(): number;
  /** Current bounded numeric measurement interval; reading it never changes transport state. */
  diagnostics?(): RemoteDesktopTransportDiagnostics;
  close(): void;
}

export interface RemoteDesktopStreamHandlers {
  webrtcState?(state: RemoteWebRtcViewerState, path?: RemoteWebRtcPath): void;
  webrtcFrame?(width: number, height: number): void;
  webrtcPresentation?(sample: WebRtcPresentation): void;
  activity?(activity: RemoteDesktopActivity | null): void;
  /** Numeric diagnostics only; completion watermark is not proof of successful OS input. */
  controlTiming?(sample: RemoteControlTiming): void;
  /** Actual transport write, for opt-in applied-input picture measurement only. */
  inputWritten?(seq: number, measurable?: boolean, lane?: RemoteInputLane, probe?: boolean): void;
  /** Optional numeric samples at a one-second cadence using the existing input pump. */
  diagnostics?(sample: RemoteDesktopTransportDiagnostics): void;
  inputDiagnostics?(sample: RemoteInputDiagnostics): void;
  media?(media: RemoteMediaCredentials | null, status: RemoteMediaStatus | null): void;
  state(state: RemoteDesktopSessionState, error?: string): void;
  frame(frame: RemoteDesktopFrameData): void;
  error(code: string): void;
  /** Transient pressure keeps the media/session alive; not a terminal error. */
  congestion?(busy: boolean): void;
  /** Access/billing from the state snapshot (only when the gateway sends them). */
  session?(info: RemoteDesktopSessionInfo): void;
  /** Gateway milestones in ms since the request was created (created, consented, attached, media, publishing, active). */
  serverTiming?(timing: Record<string, number>): void;
  /** The computer refused input because it allows viewing only (never retried). */
  inputRefused?(code: "input_not_allowed"): void;
  /** The gateway answered an application-level ping. */
  pong?(): void;
}

/** Continue the local sequence when the same session control socket reconnects. */
export function seedRemoteInputScheduler(scheduler: RemoteInputScheduler, sequence: number): boolean {
  if (!Number.isSafeInteger(sequence) || sequence < 0) return false;
  scheduler.seed(sequence);
  return true;
}

export function parseRemoteAccess(data: unknown): RemoteDesktopAccess | null {
  if (!isRecord(data) || typeof data.input_allowed !== "boolean") return null;
  return { input_allowed: data.input_allowed, audio: data.audio === true };
}

export function parseRemoteBilling(data: unknown): RemoteDesktopBilling | null {
  if (!isRecord(data) || (data.currency !== "CNY" && data.currency !== "USD")) return null;
  const { per_minute: price, charged_minutes: minutes } = data;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  if (typeof minutes !== "number" || !Number.isSafeInteger(minutes) || minutes < 0) return null;
  return { per_minute: price, currency: data.currency, charged_minutes: minutes };
}

/** Authenticated session control and telemetry. Media and input use ARTC exclusively. */
async function openStream(deviceId: string, sessionId: string, handlers: RemoteDesktopStreamHandlers, options?: RemoteDesktopRequestOptions): Promise<RemoteDesktopApiResult<RemoteDesktopStream>> {
  if (options?.transport === "webrtc-v1") return openRemoteWebRtcStream(deviceId, sessionId, handlers, { ...webRtcSessionTimes.get(sessionId), ...options }, remoteDesktopClient, {
    descriptor: parseRemoteWebRtcDescriptor, mediaStatus: parseRemoteMediaStatus,
    access: parseRemoteAccess, billing: parseRemoteBilling, activity: parseRemoteDesktopActivity,
  });
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
  let dcWriteUnknown = false;
  let inputAllowed = true;
  let writeFailed = false;
  let handoff: Promise<void> | null = null;
  let lane: RemoteDesktopDataLane | null = null;
  let unsubscribeLane: (() => void) | undefined;
  let lastPongAt = Date.now();
  let pingId = 0;
  const history = new RemoteInputHistory(() => performance.now(), performance.timeOrigin);
  const diagnostics = new RemoteTransportDiagnostics(history.now, history);
  let lastDiagnosticsAt = performance.now();
  const dropLane = () => { unsubscribeLane?.(); unsubscribeLane = undefined; lane = null; };
  let settle: (result: RemoteDesktopApiResult<RemoteDesktopStream>) => void;
  const connected = new Promise<RemoteDesktopApiResult<RemoteDesktopStream>>((resolve) => { settle = resolve; });
  const timings = new RemoteControlTimings(history.now, sample => {
    diagnostics.control(sample);
    if (!history.get(sample.seq)?.probe) handlers.controlTiming?.(sample);
  }, history);
  const noteInputWritten = (seq: number, lane: RemoteInputLane, action: RemoteDesktopAction, probe = false) => {
    const entry = history.written(seq, lane, action, probe);
    diagnostics.written(lane, seq);
    if (!probe) timings.sent(seq, lane === "data_channel");
    try { handlers.inputWritten?.(seq, entry.measurable, lane, probe); } catch { /* measurement cannot affect input */ }
  };
  const diagnosticSnapshot = (finishInterval = false) => {
    const value = diagnostics.snapshot(scheduler.diagnostics?.() ?? {
      queued_count: 0, queued_soft_count: 0, outstanding_count: 0, retry_count: 0, last_seq: scheduler.lastSequence(),
      execution_watermark: 0, held_key_count: 0, held_button_count: 0,
    }, socket.bufferedAmount, finishInterval);
    return { ...value, dc_credit_basis: 1 as const };
  };
  const reportDiagnostics = () => {
    if (!handlers.diagnostics) return;
    try { handlers.diagnostics(diagnosticSnapshot(true)); } catch { /* measurement cannot affect input */ }
  };
  const dispose = () => {
    if (!ended) reportDiagnostics();
    ended = true;
    unsubscribeLane?.(); unsubscribeLane = undefined;
    timings.dispose();
    diagnostics.dispose();
    clearInterval(heartbeat);
    clearInterval(refresh);
    clearInterval(inputPump);
    clearTimeout(timeout);
    options?.signal?.removeEventListener("abort", abort);
    scheduler.dispose();
    history.clear();
    socket.close();
  };
  const fail = (error: string) => {
    if (ended) return;
    scheduler.emergencyRelease();
    dropLane();
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
    now: history.now,
    history,
    write: (seq, action) => {
      if (!lane || !inputAllowed && action.kind !== "release_all") return false;
      const message = dataChannelMessage(sessionId, seq, action);
      if (!message) return false;
      try {
        if (!lane.send(message)) { queueMicrotask(() => fail("media_data_channel_unavailable")); return false; }
        noteInputWritten(seq, "data_channel", action);
        return { lane: "data_channel" };
      } catch { dcWriteUnknown = true; return "unknown"; }
    },
    congestion: (busy) => handlers.congestion?.(busy),
    failure: code => fail(dcWriteUnknown && code === "input_ack_unknown" ? "media_data_channel_write_unknown" : code),
  });
  const terminalReceipt = (raw: unknown) => {
    const value = parseRemoteInputReceipt(raw);
    if (!value) return;
    const written = history.get(value.seq);
    if (!written || !scheduler.receipt(value)) return;
    timings.receipt(value);
    scheduler.tick();
  };
  if (options?.sequenceFloor && !seedRemoteInputScheduler(scheduler, options.sequenceFloor)) {
    socket.close();
    return { ok: false, error: "response_malformed" };
  }
  const stream: RemoteDesktopStream = {
    inputHistory: history,
    releaseForHandoff() {
      if (ended || !ready || state !== "active") return Promise.reject(new Error("input_ack_unknown"));
      if (!handoff) handoff = scheduler.releaseForHandoff().then(() => {
        if (ended || state !== "active") throw new Error("input_ack_unknown");
      }).catch(error => { handoff = null; throw error; });
      return handoff;
    },
    finishHandoff() { if (!ended && state === "active") { scheduler.finishHandoff(); handoff = null; } },
    send(action) {
      if (ended || !ready || state !== "active") return false;
      if (!inputAllowed && action.kind !== "release_all") return false;
      if (!lane) { handlers.error("media_data_channel_unavailable"); return false; }
      if (!dataChannelMessage(sessionId, scheduler.lastSequence() + 1, action)) { handlers.congestion?.(true); return false; }
      return scheduler.enqueue(action);
    },
    sendViewerReport(report) {
      if (ended || !ready) return false;
      const payload = JSON.stringify(report);
      try {
        if (lane && lane.send(payload)) return true;
      } catch { /* report delivery is best effort */ }
      return send({ type: "viewer_report", report });
    },
    attachDataChannel(next) {
      if (next === lane) return;
      const lost = !!lane;
      dropLane(); lane = ended ? null : next;
      if (lane?.subscribe) {
        unsubscribeLane = lane.subscribe(message => {
          if (!ended && message.sid === sessionId && message.v === 1 && message.t === "rd.input_receipt") terminalReceipt(message);
        });
      } else if (lane) { dropLane(); handlers.error("media_data_channel_unavailable"); }
      if (lost && !lane && !ended && inputAllowed) handlers.error("media_data_channel_unavailable");
      scheduler.tick();
    },
    inputPath: () => "data_channel",
    lastSequence: () => scheduler.lastSequence(),
    diagnostics: () => diagnosticSnapshot(),
    acknowledgeMediaFrame() { send({ type: "media_ready" }); },
    acknowledgeFrame() {},
    close() { scheduler.emergencyRelease(); dropLane(); dispose(); },
  };
  const abort = () => { if (!ended) { scheduler.emergencyRelease(); dropLane(); dispose(); settle!({ ok: false, error: "aborted" }); } };
  const timeout = setTimeout(() => fail("network_error"), 10_000);
  const inputPump = setInterval(() => {
    scheduler.tick();
    if (performance.now() - lastDiagnosticsAt >= 1000) { lastDiagnosticsAt = performance.now(); reportDiagnostics(); }
  }, 25);
  const heartbeat = setInterval(() => {
    if (ready && Date.now() - lastPongAt > 3_500) { fail("network_error"); return; }
    send({ type: "ping", id: ++pingId });
  }, 1000);
  const refresh = setInterval(() => {
    void accessToken().then((value) => { if (value) send({ type: "auth.refresh", token: value }); else fail("unauthorized"); }).catch(() => fail("unauthorized"));
  }, 20_000);
  options?.signal?.addEventListener("abort", abort, { once: true });
  socket.onopen = () => { send({ type: "auth", token, controller }); };
  socket.onmessage = (event: MessageEvent) => {
    if (ended) return;
    if (typeof event.data !== "string") { fail("response_malformed"); return; }
    let data: Record<string, unknown>;
    try { data = JSON.parse(event.data); } catch { fail("response_malformed"); return; }
    if (!data || typeof data !== "object") { fail("response_malformed"); return; }
    if (data.type === "pong" && Number.isSafeInteger(data.id) && Number(data.id) >= 1 && Number(data.id) <= pingId) {
      lastPongAt = Date.now(); handlers.pong?.(); return;
    }
    if (data.type !== "state" || !["pending_consent", "connecting", "active", "reconnecting", "closed"].includes(String(data.state))) { fail("response_malformed"); return; }
    state = data.state as RemoteDesktopSessionState;
    if (handoff && state !== "active") { fail("input_ack_unknown"); return; }
    if (ended) return;
    if (!ready) { ready = true; clearTimeout(timeout); settle!({ ok: true, data: stream }); }
    if ("access" in data || "billing" in data) {
      const access = parseRemoteAccess(data.access);
      if (access) { inputAllowed = access.input_allowed; if (!inputAllowed) scheduler.discardQueued(); }
      handlers.session?.({ access, billing: parseRemoteBilling(data.billing) });
    }
    if (isRecord(data.timing)) handlers.serverTiming?.(Object.fromEntries(Object.entries(data.timing).filter(([, value]) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) as Record<string, number>);
    if ("activity" in data) handlers.activity?.(parseRemoteDesktopActivity(data.activity));
    if ("input_diagnostics" in data) {
      const input = parseRemoteInputDiagnostics(data.input_diagnostics);
      if (ended) return;
      if (input) { try { handlers.inputDiagnostics?.(input); } catch { /* measurement only */ } }
    }
    handlers.state(state, data.error === "stream_failed" ? "network_error" : typeof data.error === "string" ? data.error : undefined);
    if ("media" in data) {
      const media = data.media === null ? null : parseRemoteMedia(data.media);
      if (data.media !== null && !media) { fail("response_malformed"); return; }
      if (media?.transport === "artc-v1" && media.data_channel_input === false) { inputAllowed = false; scheduler.discardQueued(); }
      const mediaStatus = parseRemoteMediaStatus(data.media_status);
      if (ended) return;
      handlers.media?.(media, mediaStatus);
    }
    if (state === "closed") { dropLane(); dispose(); }
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
  timeoutMs = REQUEST_TIMEOUT_MS,
  retried401 = false,
  written?: () => void,
): Promise<RemoteDesktopApiResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "unauthorized", status: 401 };
  let controller: Record<string, string>;
  try { controller = controllerHeaders(); }
  catch { return { ok: false, error: "controller_identity_unavailable", status: 0 }; }
  if (signal?.aborted) return { ok: false, error: "aborted", status: 0 };

  // On a lossy path the request can reach the gateway while its reply never returns:
  // never wait forever (the caller retries idempotently where that is safe).
  const local = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; local.abort(); }, timeoutMs);
  const forward = () => local.abort();
  signal?.addEventListener("abort", forward, { once: true });
  const failed = () => ({ ok: false as const, error: timedOut ? "request_timeout" : signal?.aborted ? "aborted" : "network_error", status: 0 });
  try {
    let response: Response;
    try {
      response = await fetch(`${GATEWAY_BASE}${path}`, {
        ...init,
        signal: local.signal,
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
      return failed();
    }

    try { written?.(); } catch { /* measurement cannot affect input or retry semantics */ }
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // 空体或非 JSON：成功时按空处理，失败时落到 HTTP 码。读到一半超时/取消不算成功。
      if (timedOut || signal?.aborted) return failed();
    }
    if (!response.ok) {
      // A token can expire between accessToken() and the request. Refresh once on
      // the same idempotent request before surfacing an auth failure to the panel.
      if (response.status === 401 && !retried401 && !signal?.aborted) {
        return authed<T>(path, init, signal, timeoutMs, true, written);
      }
      return { ok: false, error: errorCode(data, response.status), status: response.status };
    }
    return { ok: true, data: data as T, status: response.status };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

function base(deviceId: string): string {
  return `/v1/devices/${encodeURIComponent(deviceId)}/remote-desktop`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function parseRemoteWebRtcDescriptor(data: unknown, sessionId?: string): RemoteWebRtcDescriptor | null {
  if (!isRecord(data) || data.transport !== "webrtc-v1" || data.role !== "viewer" || typeof data.session_id !== "string" || !data.session_id || (sessionId !== undefined && data.session_id !== sessionId)) return null;
  if (data.display_id !== null && (typeof data.display_id !== "string" || !data.display_id)) return null;
  if (typeof data.server_now !== "number" || !Number.isFinite(data.server_now) || data.server_now <= 0) return null;
  for (const key of ["ice_expires_at", "lease_expires_at"]) if (typeof data[key] !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data[key] as string) || !Number.isFinite(Date.parse(data[key] as string))) return null;
  if (!Array.isArray(data.ice_servers) || data.ice_servers.length > 64) return null;
  const iceServers: RTCIceServer[] = [];
  for (const server of data.ice_servers) {
    if (!isRecord(server)) return null;
    const urls = typeof server.urls === "string" ? [server.urls] : server.urls;
    if (!Array.isArray(urls) || !urls.length || urls.length > 16 || urls.some(url => typeof url !== "string" || url.length > 2048 || !/^(stun|stuns|turn|turns):[^\s]+$/i.test(url))) return null;
    if ((server.username !== undefined && (typeof server.username !== "string" || !server.username)) || (server.credential !== undefined && (typeof server.credential !== "string" || !server.credential))) return null;
    if (urls.some(url => /^turns?:/i.test(url)) && (typeof server.username !== "string" || typeof server.credential !== "string")) return null;
    if (server.region !== undefined && (typeof server.region !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(server.region))) return null;
    iceServers.push({ urls: [...urls], ...(typeof server.username === "string" ? { username: server.username } : {}), ...(typeof server.credential === "string" ? { credential: server.credential } : {}), ...(typeof server.region === "string" ? { region: server.region } : {}) });
  }
  return { transport: "webrtc-v1", role: "viewer", session_id: data.session_id, display_id: data.display_id as string | null,
    ice_servers: iceServers, ice_expires_at: data.ice_expires_at as string, server_now: data.server_now, lease_expires_at: data.lease_expires_at as string };
}

export function parseRemoteMedia(data: unknown, sessionId?: string): RemoteMediaCredentials | null {
  if (isRecord(data) && data.transport === "webrtc-v1") return parseRemoteWebRtcDescriptor(data, sessionId);
  if (!isRecord(data) || data.provider !== "artc" || data.transport !== "artc-v1" || data.track !== "screen" || data.role !== "viewer" || data.camera !== false || data.microphone !== false || typeof data.data_channel_input !== "boolean") return null;
  for (const field of ["app_id", "channel_id", "user_id", "publisher_id", "token", "expires_at"]) if (typeof data[field] !== "string" || !data[field]) return null;
  if (typeof data.timestamp !== "number" || !Number.isFinite(data.timestamp) || !Number.isFinite(Date.parse(data.expires_at as string))) return null;
  return data as unknown as RemoteMediaCredentials;
}

export function parseRemoteMediaStatus(data: unknown): RemoteMediaStatus | null {
  if (!isRecord(data) || !["starting", "publishing", "locked", "failed"].includes(String(data.state))) return null;
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

/** 未知状态形状按响应异常处理，不进入会话控制。 */
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
    ...("input_diagnostics" in data ? { input_diagnostics: parseRemoteInputDiagnostics(data.input_diagnostics) } : {}),
    ...(["online", "signed_out", "offline"].includes(String(data.availability)) ? { availability: data.availability as DeviceAvailability } : {}),
    ...("access" in data ? { access: parseRemoteAccess(data.access) } : {}),
    ...("billing" in data ? { billing: parseRemoteBilling(data.billing) } : {}),
    ...("last_seen_at" in data ? { last_seen_at: typeof data.last_seen_at === "string" && !Number.isNaN(Date.parse(data.last_seen_at)) ? data.last_seen_at : null } : {}),
    ...("reason" in data ? { reason: STATUS_REASONS.includes(data.reason as RemoteDesktopStatusReason) ? data.reason as RemoteDesktopStatusReason : null } : {}),
  };
}

export const remoteDesktopClient: RemoteDesktopClient = {
  openStream,
  async negotiateMedia(deviceId, sessionId, displayId, options) {
    const transport = options?.transport ?? "artc-v1";
    const result = await authed<unknown>(`${base(deviceId)}/sessions/${encodeURIComponent(sessionId)}/media`, { method: "POST", body: JSON.stringify({ transport, ...(displayId ? { display_id: displayId } : {}) }) }, options?.signal);
    if (!result.ok) {
      // Missing endpoint is a gateway version mismatch, not missing device consent.
      const missingRoute = result.status === 405 || result.status === 501 || (result.status === 404 && ["Not Found", "HTTP 404"].includes(result.error ?? ""));
      return { ok: false, error: missingRoute ? "media_gateway_unsupported" : result.error, status: result.status };
    }
    const media = isRecord(result.data) ? parseRemoteMedia(result.data.media, sessionId) : null;
    if (!media || media.transport !== transport) return { ok: false, error: "response_malformed", status: result.status };
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
    // One request id for every attempt: the gateway hands a retry the session the first
    // attempt created (its reply lost on the way) instead of a second consent request.
    const body = JSON.stringify({ request_id: options?.requestId ?? newRequestId(), transports: ["webrtc-v1", "artc-v1"], media: ["artc-v1"],
      ...(options?.ownerDirect === true ? { owner_direct: true } : {}) });
    const started = Date.now();
    let result: RemoteDesktopApiResult<unknown>;
    const prepared = await createPreparedRemoteWebRtcSession(deviceId, JSON.parse(body), options?.signal);
    for (let delay = 500; ; delay = Math.min(delay * 2, 4000)) {
      result = prepared !== null ? { ok: true, data: prepared, status: 200 }
        : await authed<unknown>(`${base(deviceId)}/sessions`, { method: "POST", body }, options?.signal);
      if (result.ok || !isNetworkFailure(result.error) || options?.signal?.aborted) break;
      if (Date.now() - started + delay >= CREATE_RETRY_WINDOW_MS) break;
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); options?.signal?.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, delay);
        options?.signal?.addEventListener("abort", done, { once: true });
      });
      if (options?.signal?.aborted) return { ok: false, error: "aborted", status: 0 };
    }
    if (!result.ok) return { ok: false, error: result.error, status: result.status };
    const data = result.data;
    if (!isRecord(data) || typeof data.session_id !== "string" || !data.session_id || (data.state !== "pending_consent" && data.state !== "connecting")) {
      return { ok: false, error: "response_malformed", status: result.status };
    }
    // Old gateways used websocket-v2 for the control socket while still returning ARTC media.
    const transport = data.transport === "webrtc-v1" ? "webrtc-v1" : data.transport === undefined || data.transport === "artc-v1" || data.transport === "websocket-v2" ? "artc-v1" : null;
    const media = isRecord(data.media) ? parseRemoteMedia(data.media.media, data.session_id) : null;
    if (!transport || (data.media != null && (!media || media.transport !== transport))) return { ok: false, error: "response_malformed", status: result.status };
    if (transport === "webrtc-v1") {
      const receivedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      webRtcSessionTimes.set(data.session_id, { sessionCreatedAt: receivedAt, ...(media ? { descriptorReceivedAt: receivedAt } : {}) });
      while (webRtcSessionTimes.size > 32) webRtcSessionTimes.delete(webRtcSessionTimes.keys().next().value!);
    }
    return {
      ok: true,
      data: {
        session_id: data.session_id,
        state: data.state,
        expires_at: typeof data.expires_at === "string" ? data.expires_at : "",
        transport,
        ...("billing" in data ? { billing: parseRemoteBilling(data.billing) } : {}),
        ...(data.state === "pending_consent" && data.owner_handshake === true ? { owner_handshake: true as const } : {}),
        ...(media && isRecord(data.media) ? { media: { media, media_status: parseRemoteMediaStatus(data.media.media_status) } } : {}),
      },
      status: result.status,
    };
  },

  closeSession(deviceId, sessionId) {
    webRtcSessionTimes.delete(sessionId);
    return authed<{ closed: true }>(
      `${base(deviceId)}/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE", keepalive: true },
    );
  },

  reportQuality(report) {
    // keepalive (not sendBeacon): it still leaves on pagehide and can carry the owner's bearer.
    return authed<{ stored: boolean }>("/v1/devices/remote-desktop/quality", { method: "POST", body: JSON.stringify(report), keepalive: true });
  },
  reportQualityWindow(window) {
    return authed<{ stored: boolean }>("/v1/devices/remote-desktop/quality/windows", { method: "POST", body: JSON.stringify(window), keepalive: true });
  },
};
