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
import { MEDIA_METRIC_KEYS, type RemoteMediaMetrics } from "./remote-metrics.generated";
export type { RemoteMediaMetrics } from "./remote-metrics.generated";
import { RemoteInputHistory, parseRemoteInputReceipt, type RemoteInputLane, type RemoteInputReceipt } from "./remote-desktop-input-history";
import { RemoteInputScheduler } from "./remote-desktop-scheduler";
import { isNetworkFailure, newRequestId } from "./remote-desktop-retry";
import { RemoteControlTimings, type RemoteControlTiming } from "./remote-desktop-control-timing";
import type { RemoteDesktopQualityReport, RemoteDesktopViewerReport, RemoteDesktopQualityWindow, RemoteMediaQualitySink } from "./remote-desktop-quality";
import { RemoteTransportDiagnostics, parseRemoteInputDiagnostics, type RemoteInputDiagnostics, type RemoteDesktopTransportDiagnostics } from "./remote-desktop-diagnostics";
export { parseRemoteInputDiagnostics } from "./remote-desktop-diagnostics";
export type { RemoteInputDiagnostics, RemoteDesktopTransportDiagnostics } from "./remote-desktop-diagnostics";
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
  /**
   * D4: the gateway minted this viewer token with data-channel publish permission and the
   * computer listens for input on the session's ARTC data channel (and allows input).
   * Absent/false: input stays on the gateway WebSocket.
   */
  data_channel_input?: boolean;
}

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
  transport?: "websocket-v2" | "http-v1";
  billing?: RemoteDesktopBilling | null;
  /** Owner request waiting only for an idle computer's own answer; its video may be negotiated now. */
  owner_handshake?: true;
  /** K5 one-call media join descriptor when the device is already publishing. */
  media?: RemoteMediaResponse;
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
  activity?: RemoteDesktopActivity | null;
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
  /** sendInput only: an HTTP response proves this attempt was written, including refusals. */
  inputWritten?(): void;
}

/** One HTTP attempt never waits longer than this for its reply (lossy paths drop replies). */
export const REQUEST_TIMEOUT_MS = 10_000;
/** Input fallback calls must not hold the pointer behind a dead HTTP reply. */
export const INPUT_REQUEST_TIMEOUT_MS = 1_500;
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
  /** Anonymous end-of-session quality report (`remote-desktop-quality.ts`); keepalive, best effort. */
  reportQuality?(report: RemoteDesktopQualityReport): Promise<RemoteDesktopApiResult<{ stored: boolean }>>;
  reportQualityWindow?(window: RemoteDesktopQualityWindow): Promise<RemoteDesktopApiResult<{ stored: boolean }>>;
  /** Set by `RemoteDesktopQualityHub.wrap`: the media-side quality hooks of a live session. */
  mediaQuality?(sessionId: string): RemoteMediaQualitySink | null;
}

/** C6 publisher-authenticated messages; admission and execution are different measurements. */
export type RemoteDesktopDataMessage =
  | { t: "rd.pong"; v: 1; sid: string; t_v: number; device_wall_ms: number }
  | { t: "rd.input_ack"; v: 1; sid: string; acked_seq: number; input_receipt_version?: 1 }
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
/**
 * Real data-channel writes are credited by receipts relayed over the gateway socket. That socket
 * goes quiet for over a second on the controller's path (measured 2026-11-04, CN -> SG twin), so
 * an unreceipted write waits this long before input falls back to the gateway (never a close).
 */
export const PEER_WRITE_RECEIPT_MS = 3000;
/** Unanswered probes back off (1.5, 3, 6, 12, 24 s): each probe briefly pauses gateway writes. */
const PEER_PROBE_BACKOFF_MAX = 4;

/** Contract D4 bound: one JSON message per input, at most 1 KB. */
export const DATA_CHANNEL_MAX_BYTES = 1024;

/** Contract D4 message (field names fixed by the parent): `{"v":1,"sid","seq","a"}`. */
export function dataChannelMessage(sessionId: string, seq: number, action: RemoteDesktopAction): string | null {
  const text = JSON.stringify({ v: 1, sid: sessionId, seq, a: action });
  return new TextEncoder().encode(text).byteLength <= DATA_CHANNEL_MAX_BYTES ? text : null;
}

export interface RemoteDesktopStream {
  /** Shared actual-write history; measurement never owns another seq/timestamp map. */
  inputHistory?: RemoteInputHistory;
  releaseForHandoff(): Promise<void>;
  finishHandoff(): void;
  send(action: RemoteDesktopAction): boolean;
  /** K2: viewer telemetry uses the ARTC lane when present and the session WS otherwise. */
  sendViewerReport(report: RemoteDesktopViewerReport): boolean;
  acknowledgeFrame(sequence: number): void;
  acknowledgeMediaFrame?(): void;
  /**
   * C6 lanes return direct admission receipts and have no gateway drain fence. Legacy lanes
   * without subscribe keep their gateway receipt compatibility. `null` detaches without replay.
   */
  attachDataChannel?(lane: RemoteDesktopDataLane | null): void;
  /** Which path the last written input took (diagnostics/UI only). */
  inputPath?(): "data_channel" | "websocket";
  /** Highest input seq used on this socket (both lanes): the floor for a re-attached stream. */
  lastSequence?(): number;
  /** Current bounded numeric measurement interval; reading it never changes transport state. */
  diagnostics?(): RemoteDesktopTransportDiagnostics;
  close(): void;
}

export interface RemoteDesktopStreamHandlers {
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

/**
 * Advance the input sequence when a stream is re-attached. A cached split chunk can briefly
 * contain the stream code from the previous UI release and the scheduler class from the
 * previous release; feature-detect the method so the first state message never throws
 * `U.seed is not a function`. A zero floor needs no compatibility work. If a positive floor
 * cannot be applied, fail closed and let the stream reconnect instead of replaying input.
 */
export function seedRemoteInputScheduler(scheduler: RemoteInputScheduler, sequence: number): boolean {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) return true;
  const legacy = scheduler as unknown as {
    seed?: (value: number) => void;
    claimSequence?: () => number;
    lastSequence?: () => number;
  };
  if (typeof legacy.seed === "function") {
    legacy.seed.call(scheduler, sequence);
    return true;
  }
  if (typeof legacy.claimSequence !== "function" || typeof legacy.lastSequence !== "function") return false;
  let current = legacy.lastSequence.call(scheduler);
  let steps = 0;
  while (current < sequence && steps++ <= 100_000) current = legacy.claimSequence.call(scheduler);
  return current >= sequence;
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
  let handoff: Promise<void> | null = null;
  let lane: RemoteDesktopDataLane | null = null;
  let unsubscribeLane: (() => void) | undefined;
  let directReceipts = false;
  let lastPath: "data_channel" | "websocket" = "websocket";
  let lastPongAt = Date.now();
  let pingId = 0;
  /*
   * Prove subscription with a harmless probe before real input. C6 replies directly; legacy peers
   * without a subscribe listener use the gateway-relayed receipt. The computer proves it
   * receives it: a harmless `release_all` probe (sent only while nothing is held) must show up in
   * the publisher's `metrics.dc_input_seq`. Real writes then use a bounded shared scheduler window,
   * credited by input_completed_seq when supported, or explicitly weaker legacy admission receipts.
   * Unretired input cannot be overtaken on fallback or replayed on silence/ambiguous failure.
   * The lane opens when the viewer's data publish is up, which can be before the computer has
   * subscribed to it; those first messages are lost (2026-10-31 SDK probe: 3-5 messages). So an
   * unconfirmed probe is re-sent with a fresh seq after PEER_RECEIPT_MS instead of being waited on forever.
   */
  let peerTrusted = false, peerProbe = 0, peerProbeAt = 0, peerReceipt = 0, probeRequested = false, peerProbesLost = 0;
  const history = new RemoteInputHistory(() => performance.now(), performance.timeOrigin);
  const diagnostics = new RemoteTransportDiagnostics(history.now, history);
  let lastDiagnosticsAt = performance.now();
  const dropLane = () => { unsubscribeLane?.(); unsubscribeLane = undefined; directReceipts = false; lane = null; peerTrusted = false; peerProbe = 0; probeRequested = false; peerProbesLost = 0; };
  const peerHealthy = (now: number) => {
    if (directReceipts || scheduler.usesReceipts()) return;
    const oldest = scheduler.oldestPeerPendingAt();
    if (oldest === undefined || now - oldest <= PEER_WRITE_RECEIPT_MS) return;
    // Receipts stopped: keep the session and video, move input back to the gateway behind a
    // release_all, and prove the lane again later instead of guessing what the host ran.
    scheduler.abandonPeer();
    peerTrusted = false; peerProbe = 0; peerProbesLost = Math.min(PEER_PROBE_BACKOFF_MAX, peerProbesLost + 1); peerProbeAt = now;
    if (lane) probeRequested = true;
  };
  const notePeerReceipt = (value: number | undefined, completed?: number) => {
    if (scheduler.usesReceipts()) return;
    if (directReceipts) {
      // Completion remains separate from admission, and is required only for explicit handback.
      if (Number.isSafeInteger(completed) && completed! >= 0 && completed! <= scheduler.lastSequence()) {
        scheduler.executedThrough(completed!); timings.completedThrough(completed!);
      }
      return; // Gateway admission snapshots cannot release direct-channel credits.
    }
    if (value !== undefined) {
      peerReceipt = Math.max(peerReceipt, value);
      if (peerProbe && peerReceipt >= peerProbe) { peerTrusted = true; peerProbesLost = 0; }
    }
    scheduler.observePeerProgress({ admissionSeq: value, completedSeq: completed });
  };
  const probeWait = () => PEER_RECEIPT_MS * 2 ** peerProbesLost;
  const probeDue = () => !!lane && !peerTrusted && probeRequested && (peerProbe ? performance.now() - peerProbeAt > probeWait() : !peerProbesLost || performance.now() - peerProbeAt > probeWait());
  /** Probe only between retired writes and new queue writes, never inside a provisional write. */
  const probePeer = () => {
    if (ended || !ready || state !== "active" || !probeDue() || !lane || !scheduler.probeAllowed() || !directReceipts && (!scheduler.gatewayDrained() || !scheduler.peerDrained())) return;
    if (peerProbe) peerProbesLost = Math.min(PEER_PROBE_BACKOFF_MAX, peerProbesLost + 1);
    peerProbe = scheduler.claimSequence();
    peerProbeAt = performance.now();
    probeRequested = false;
    const message = dataChannelMessage(sessionId, peerProbe, { kind: "release_all" });
    try { if (message && lane.send(message)) { noteInputWritten(peerProbe, "data_channel", { kind: "release_all" }, true); return; } } catch { /* no real action to replay */ }
    dropLane();
  };
  let settle: (result: RemoteDesktopApiResult<RemoteDesktopStream>) => void;
  const connected = new Promise<RemoteDesktopApiResult<RemoteDesktopStream>>((resolve) => { settle = resolve; });
  const timings = new RemoteControlTimings(history.now, sample => { diagnostics.control(sample); handlers.controlTiming?.(sample); }, history);
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
    return directReceipts ? { ...value, dc_credit_basis: 1 as const } : value;
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
    pendingFrameAck = null;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null;
    socket.close();
  };
  const fail = (error: string) => {
    if (ended) return;
    peerRelease();
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
    now: history.now,
    history,
    write: (seq, action, context) => {
      if (!context?.emergency) {
        // Probes run between scheduler writes. C6 receipt proofs do not wait for old WS retirement.
        if (!context?.retry && !context?.barrier && probeDue() && scheduler.probeAllowed()) return false;
        const message = lane && peerTrusted && !context?.retry && (!context?.barrier || directReceipts) ? dataChannelMessage(sessionId, seq, action) : null;
        if (message && lane) {
          // A proved C6 lane sends immediately. Only legacy peers retain the gateway drain fence.
          if (!directReceipts && (!scheduler.gatewayDrained() || !scheduler.peerCreditReady())) return false;
          try {
            if (lane.send(message)) { noteInputWritten(seq, "data_channel", action); lastPath = "data_channel"; return { lane: "data_channel" }; }
          } catch { dropLane(); return "unknown"; }
          const wasDirect = directReceipts;
          dropLane(); // explicit false: this action was never written
          if (wasDirect) { queueMicrotask(() => { if (!ended) scheduler.abandonPeer(true); }); return false; }
        }
        // A definitely unwritten or oversized action may take WS only after older peer writes.
        if (!scheduler.peerDrained()) return false;
      }
      const written = send({ type: "input", seq, action });
      if (written) { noteInputWritten(seq, "websocket", action); lastPath = "websocket"; }
      return !written && writeFailed ? "unknown" : written;
    },
    congestion: (busy) => handlers.congestion?.(busy),
    failure: fail,
  });
  const negotiateReceipts = () => { scheduler.negotiateReceipts(); diagnostics.negotiateReceipts(); };
  const terminalReceipt = (raw: unknown) => {
    const value = parseRemoteInputReceipt(raw);
    if (!value) return;
    negotiateReceipts();
    // A claimed probe whose send failed is a hole, never a valid receipt target.
    const written = history.get(value.seq);
    if (!written || !scheduler.receipt(value)) return;
    timings.receipt(value);
    if (written.probe && value.seq === peerProbe && value.status === "executed") {
      peerTrusted = true; peerProbesLost = 0;
    }
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
      peerHealthy(performance.now());
      if (ended) return false;
      if (directReceipts && !dataChannelMessage(sessionId, scheduler.lastSequence() + 1, action)) { handlers.congestion?.(true); return false; }
      if (lane && !peerTrusted) probeRequested = true;
      probePeer();
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
      const lostDirect = directReceipts;
      dropLane(); lane = ended ? null : next;
      if (lane?.subscribe) {
        directReceipts = true; peerTrusted = false; probeRequested = true;
        unsubscribeLane = lane.subscribe(message => {
          if (ended || message.sid !== sessionId) return;
          if (message.t === "rd.input_receipt") { terminalReceipt(message); return; }
          if (message.t !== "rd.input_ack") return;
          if (message.input_receipt_version === 1) negotiateReceipts();
          const seq = message.acked_seq;
          if (!Number.isSafeInteger(seq) || seq < 0 || seq > scheduler.lastSequence()) return;
          if (scheduler.usesReceipts()) return; // @deprecated C6 admission: parse only after negotiation.
          if (peerProbe && seq >= peerProbe && !peerTrusted) { peerTrusted = true; scheduler.usePeerCredits(); }
          diagnostics.observe({ dc_input_seq: seq });
          timings.admittedThrough(seq);
          scheduler.peerAcknowledgedThrough(seq);
        });
      }
      if (lostDirect) scheduler.abandonPeer(true);
      probePeer(); scheduler.tick();
    },
    inputPath: () => lastPath,
    lastSequence: () => scheduler.lastSequence(),
    diagnostics: () => diagnosticSnapshot(),
    acknowledgeMediaFrame() { send({ type: "media_ready" }); },
    acknowledgeFrame(value) {
      if (decoding?.sequence === value) decoding = null;
      pendingFrameAck = Math.max(pendingFrameAck ?? 0, value);
      if (send({ type: "frame_ack", sequence: pendingFrameAck })) pendingFrameAck = null;
    },
    close() { peerRelease(); scheduler.emergencyRelease(); dispose(); },
  };
  /** Emergency release on both lanes: the peer one is fastest, the gateway one is the backstop (higher seq). */
  const peerRelease = () => {
    if (!lane || ended) return;
    const message = dataChannelMessage(sessionId, scheduler.claimSequence(), { kind: "release_all" });
    try { if (message && lane.send(message)) noteInputWritten(scheduler.lastSequence(), "data_channel", { kind: "release_all" }); } catch { /* the gateway release still follows */ }
    dropLane();
  };
  const abort = () => { if (!ended) { peerRelease(); scheduler.emergencyRelease(); dispose(); settle!({ ok: false, error: "aborted" }); } };
  const timeout = setTimeout(() => fail("network_error"), 10_000);
  const inputPump = setInterval(() => {
    if (pendingFrameAck !== null && send({ type: "frame_ack", sequence: pendingFrameAck })) pendingFrameAck = null;
    peerHealthy(performance.now());
    probePeer();
    scheduler.tick();
    if (performance.now() - lastDiagnosticsAt >= 1000) { lastDiagnosticsAt = performance.now(); reportDiagnostics(); }
  }, 25);
  const heartbeat = setInterval(() => {
    if (decoding && Date.now() - decoding.started > 10_000) { fail("frame_decode_timeout"); return; }
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
    if (data.type === "pong" && Number.isSafeInteger(data.id) && Number(data.id) >= 1 && Number(data.id) <= pingId) {
      lastPongAt = Date.now(); handlers.pong?.(); return;
    }
    if (data.type === "input_receipt") { if (data.session_id === sessionId) terminalReceipt(data); return; }
    // @deprecated Gateway admission, native completion and C6 admission remain for older publishers.
    if (data.type === "input_ack" && Number.isSafeInteger(data.seq)) { if (!scheduler.usesReceipts()) timings.accepted(data.seq as number); scheduler.accepted(data.seq as number); return; }
    if (data.type === "input_rejected" && Number.isSafeInteger(data.seq) && data.error === "input_not_allowed") {
      // View-only computer: final, never retried; the session (and video) stays.
      if (scheduler.refused(data.seq as number)) handlers.inputRefused?.("input_not_allowed");
      return;
    }
    if (data.type === "input_rejected" && Number.isSafeInteger(data.seq) && typeof data.error === "string" && typeof data.retry_after_ms === "number" && Number.isFinite(data.retry_after_ms)) {
      scheduler.rejected(data.seq as number, data.error, data.retry_after_ms); return;
    }
    if (data.type !== "state" || !["pending_consent", "connecting", "active", "reconnecting", "closed"].includes(String(data.state))) { fail("response_malformed"); return; }
    state = data.state as RemoteDesktopSessionState;
    if (data.input_receipt_version === 1) negotiateReceipts();
    if (handoff && state !== "active") { fail("input_ack_unknown"); return; }
    // First snapshot of a re-attached socket: continue above what the session already took.
    if (!ready && typeof data.input_seq === "number" && !seedRemoteInputScheduler(scheduler, data.input_seq)) {
      fail("response_malformed");
      return;
    }
    if (state !== "closed" && typeof data.acked_seq === "number") {
      scheduler.executedThrough(data.acked_seq);
      if (!ended && !scheduler.usesReceipts()) timings.completedThrough(data.acked_seq);
    }
    if (ended) return;
    if (!ready) { ready = true; clearTimeout(timeout); settle!({ ok: true, data: stream }); }
    if ("access" in data || "billing" in data) handlers.session?.({ access: parseRemoteAccess(data.access), billing: parseRemoteBilling(data.billing) });
    if (isRecord(data.timing)) handlers.serverTiming?.(Object.fromEntries(Object.entries(data.timing).filter(([, value]) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) as Record<string, number>);
    if ("activity" in data) handlers.activity?.(parseRemoteDesktopActivity(data.activity));
    if ("input_diagnostics" in data) {
      const input = parseRemoteInputDiagnostics(data.input_diagnostics);
      diagnostics.observe(input);
      if (input) notePeerReceipt(undefined, input.input_completed_seq);
      if (ended) return;
      if (input) { try { handlers.inputDiagnostics?.(input); } catch { /* measurement only */ } }
    }
    handlers.state(state, data.error === "stream_failed" ? "network_error" : typeof data.error === "string" ? data.error : undefined);
    if ("media" in data) {
      const media = data.media === null ? null : parseRemoteMedia(data.media);
      if (data.media !== null && !media) { fail("response_malformed"); return; }
      const mediaStatus = parseRemoteMediaStatus(data.media_status);
      diagnostics.observe(mediaStatus?.metrics);
      notePeerReceipt(mediaStatus?.metrics?.dc_input_seq, mediaStatus?.metrics?.input_completed_seq);
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

export function parseRemoteMedia(data: unknown): RemoteMediaCredentials | null {
  if (!isRecord(data) || data.provider !== "artc" || data.transport !== "artc-v1" || data.track !== "screen" || data.role !== "viewer" || data.camera !== false || data.microphone !== false) return null;
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
    ...("input_diagnostics" in data ? { input_diagnostics: parseRemoteInputDiagnostics(data.input_diagnostics) } : {}),
    ...(["online", "signed_out", "offline"].includes(String(data.availability)) ? { availability: data.availability as DeviceAvailability } : {}),
    ...("access" in data ? { access: parseRemoteAccess(data.access) } : {}),
    ...("billing" in data ? { billing: parseRemoteBilling(data.billing) } : {}),
    ...("last_seen_at" in data ? { last_seen_at: typeof data.last_seen_at === "string" && !Number.isNaN(Date.parse(data.last_seen_at)) ? data.last_seen_at : null } : {}),
    ...("reason" in data ? { reason: STATUS_REASONS.includes(data.reason as RemoteDesktopStatusReason) ? data.reason as RemoteDesktopStatusReason : null } : {}),
  };
}

const IMAGE_PREFIX = /^data:image\/(jpeg|png);base64,/i;

export function parseFrame(data: unknown): RemoteDesktopFrame | null {
  if (!isRecord(data)) return null;
  const state = data.state;
  if (state !== "pending_consent" && state !== "connecting" && state !== "active" && state !== "reconnecting" && state !== "closed") return null;
  const out: RemoteDesktopFrame = { state, frame: null };
  if ("activity" in data) out.activity = parseRemoteDesktopActivity(data.activity);
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
    // One request id for every attempt: the gateway hands a retry the session the first
    // attempt created (its reply lost on the way) instead of a second consent request.
    const body = JSON.stringify({ request_id: options?.requestId ?? newRequestId(), media: ["artc-v1"], first_frame_ack: true,
      ...(options?.ownerDirect === true ? { owner_direct: true } : {}) });
    const started = Date.now();
    let result: RemoteDesktopApiResult<unknown>;
    for (let delay = 500; ; delay = Math.min(delay * 2, 4000)) {
      result = await authed<unknown>(`${base(deviceId)}/sessions`, { method: "POST", body }, options?.signal);
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
    return {
      ok: true,
      data: {
        session_id: data.session_id,
        state: data.state,
        expires_at: typeof data.expires_at === "string" ? data.expires_at : "",
        ...(data.transport === "websocket-v2" || data.transport === "http-v1" ? { transport: data.transport } : {}),
        ...("billing" in data ? { billing: parseRemoteBilling(data.billing) } : {}),
        ...(data.state === "pending_consent" && data.owner_handshake === true ? { owner_handshake: true as const } : {}),
        ...(isRecord(data.media) && parseRemoteMedia(data.media.media) ? { media: { media: parseRemoteMedia(data.media.media)!, media_status: parseRemoteMediaStatus(data.media.media_status) } } : {}),
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
      INPUT_REQUEST_TIMEOUT_MS,
      false,
      options?.inputWritten,
    );
    return result;
  },

  closeSession(deviceId, sessionId) {
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
