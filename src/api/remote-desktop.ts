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
import { isNetworkFailure, newRequestId } from "./remote-desktop-retry";
import { RemoteControlTimings, type RemoteControlTiming } from "./remote-desktop-control-timing";
import type { RemoteDesktopQualityReport, RemoteMediaQualitySink } from "./remote-desktop-quality";
import { REMOTE_INPUT_METRICS, RemoteTransportDiagnostics, parseRemoteInputDiagnostics, type RemoteInputDiagnostics, type RemoteDesktopTransportDiagnostics } from "./remote-desktop-diagnostics";
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
  state: "starting" | "publishing" | "failed";
  error?: string;
  geometry?: { display_id: string; width: number; height: number };
  displays?: Array<{ display_id: string; label: string; width: number; height: number }>;
  metrics?: RemoteMediaMetrics;
}
const MEDIA_METRICS = ["elapsed_ms", "tick_calls", "tick_max_gap_us", "capture_frames", "capture_idle", "capture_errors", "capture_us", "capture_max_us", "capture_lock_wait_us", "capture_lock_max_us", "last_capture_age_ms", "pushes", "push_errors", "repeated_pushes", "empty_ticks", "push_us", "push_max_us", "push_lock_wait_us", "push_lock_max_us", "sdk_samples", "sdk_age_ms", "sdk_capture_fps", "sdk_encode_fps", "sdk_sent_fps", "sdk_sent_kbps", "sdk_rtt_ms", "sdk_send_bytes", "first_capture_ms", "first_push_ms", "joined_ms", "first_encoded_stats_ms",
  // D4 receipt: highest data-channel seq the computer accepted (R1a/R1b publish it; absent = unproven lane).
  "dc_input_seq", ...REMOTE_INPUT_METRICS,
  // Publisher-elapsed first screen packet send, not encode/keyframe or viewer paint. Absent = unknown.
  "first_packet_sent_ms"] as const;
/** Optional fixed numeric diagnostics only; never publisher tokens or arbitrary text. */
export type RemoteMediaMetrics = { version: 1 } & Partial<Record<typeof MEDIA_METRICS[number], number>>;
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
  /** Physical KeyboardEvent.code; used only by the Windows secure broker. */
  code?: string;
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
}

/** One HTTP attempt never waits longer than this for its reply (lossy paths drop replies). */
export const REQUEST_TIMEOUT_MS = 10_000;
/** Input fallback calls must not hold the pointer behind a dead HTTP reply. */
export const INPUT_REQUEST_TIMEOUT_MS = 1_500;
/** createSession keeps retrying the same request id for at most this long. */
export const CREATE_RETRY_WINDOW_MS = 30_000;

export { isNetworkFailure, newRequestId };

export interface RemoteDesktopClient {
  /** Optional boot/lock-screen owner path. Never uses device or restricted credentials in the browser. */
  broker?: RemoteDesktopBrokerClient;
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
  /** Set by `RemoteDesktopQualityHub.wrap`: the media-side quality hooks of a live session. */
  mediaQuality?(sessionId: string): RemoteMediaQualitySink | null;
}

/** false proves no write; a throw is ambiguous and must never replay the action on another lane. */
export interface RemoteDesktopDataLane {
  send(payload: string): boolean;
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
  releaseForHandoff(): Promise<void>;
  finishHandoff(): void;
  send(action: RemoteDesktopAction): boolean;
  acknowledgeFrame(sequence: number): void;
  acknowledgeMediaFrame?(): void;
  /**
   * Both lanes share one bounded ordered queue. A trusted peer pauses new WS writes until older
   * gateway writes retire; fallback waits for earlier peer credits. `null` detaches the lane.
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
  let lastPath: "data_channel" | "websocket" = "websocket";
  /*
   * The data channel has no per-message reply, so it is used only once the computer proved it
   * receives it: a harmless `release_all` probe (sent only while nothing is held) must show up in
   * the publisher's `metrics.dc_input_seq`. Real writes then use a bounded shared scheduler window,
   * credited by input_completed_seq when supported, or explicitly weaker legacy admission receipts.
   * Unretired input cannot be overtaken on fallback or replayed on silence/ambiguous failure.
   * The lane opens when the viewer's data publish is up, which can be before the computer has
   * subscribed to it; those first messages are lost (2026-10-31 SDK probe: 3-5 messages). So an
   * unconfirmed probe is re-sent with a fresh seq after PEER_RECEIPT_MS instead of being waited on forever.
   */
  let peerTrusted = false, peerProbe = 0, peerProbeAt = 0, peerReceipt = 0, probeRequested = false;
  const diagnostics = new RemoteTransportDiagnostics(() => performance.now());
  let lastDiagnosticsAt = performance.now();
  const dropLane = () => { lane = null; peerTrusted = false; peerProbe = 0; probeRequested = false; };
  const peerHealthy = (now: number) => {
    const oldest = scheduler.oldestPeerPendingAt();
    if (oldest !== undefined && now - oldest > PEER_RECEIPT_MS) fail("input_ack_unknown");
  };
  const notePeerReceipt = (value: number | undefined, completed?: number) => {
    if (value !== undefined) {
      peerReceipt = Math.max(peerReceipt, value);
      if (peerProbe && peerReceipt >= peerProbe) peerTrusted = true;
    }
    scheduler.observePeerProgress({ admissionSeq: value, completedSeq: completed });
  };
  const probeDue = () => !!lane && !peerTrusted && probeRequested && (!peerProbe || Date.now() - peerProbeAt > PEER_RECEIPT_MS);
  /** Probe only between retired writes and new queue writes, never inside a provisional write. */
  const probePeer = () => {
    if (ended || !ready || state !== "active" || !probeDue() || !lane || !scheduler.probeAllowed() || !scheduler.gatewayDrained() || !scheduler.peerDrained()) return;
    peerProbe = scheduler.claimSequence();
    peerProbeAt = Date.now();
    probeRequested = false;
    const message = dataChannelMessage(sessionId, peerProbe, { kind: "release_all" });
    try { if (message && lane.send(message)) { diagnostics.written("data_channel", peerProbe); return; } } catch { /* no real action to replay */ }
    dropLane();
  };
  let settle: (result: RemoteDesktopApiResult<RemoteDesktopStream>) => void;
  const connected = new Promise<RemoteDesktopApiResult<RemoteDesktopStream>>((resolve) => { settle = resolve; });
  const timings = new RemoteControlTimings(() => performance.now(), sample => { diagnostics.control(sample); handlers.controlTiming?.(sample); });
  const diagnosticSnapshot = (finishInterval = false) => diagnostics.snapshot(scheduler.diagnostics?.() ?? {
    queued_count: 0, queued_soft_count: 0, outstanding_count: 0, retry_count: 0, last_seq: scheduler.lastSequence(),
    execution_watermark: 0, held_key_count: 0, held_button_count: 0,
  }, socket.bufferedAmount, finishInterval);
  const reportDiagnostics = () => {
    if (!handlers.diagnostics) return;
    try { handlers.diagnostics(diagnosticSnapshot(true)); } catch { /* measurement cannot affect input */ }
  };
  const dispose = () => {
    if (!ended) reportDiagnostics();
    ended = true;
    timings.dispose();
    diagnostics.dispose();
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
    now: Date.now,
    write: (seq, action, context) => {
      if (!context?.emergency) {
        // A late lane needs the same brief WS drain as trusted handover. Let queued releases,
        // held input and explicit retries drain first; never claim the probe's seq here.
        if (!context?.retry && !context?.barrier && probeDue() && scheduler.probeAllowed()) return false;
        const message = lane && peerTrusted && !context?.retry && !context?.barrier ? dataChannelMessage(sessionId, seq, action) : null;
        if (message && lane) {
          // Queue admission is independent of lane readiness. Continuous input cannot refill WS
          // while prior gateway writes drain; the same queued gesture/barriers later take DC.
          if (!scheduler.gatewayDrained() || !scheduler.peerCreditReady()) return false;
          try {
            if (lane.send(message)) { diagnostics.written("data_channel", seq); lastPath = "data_channel"; return { lane: "data_channel" }; }
          } catch { dropLane(); return "unknown"; }
          dropLane(); // explicit false: this action was never written
        }
        // A definitely unwritten or oversized action may take WS only after older peer writes.
        if (!scheduler.peerDrained()) return false;
      }
      const written = send({ type: "input", seq, action });
      if (written) { diagnostics.written("websocket", seq); timings.sent(seq); lastPath = "websocket"; }
      return !written && writeFailed ? "unknown" : written;
    },
    congestion: (busy) => handlers.congestion?.(busy),
    failure: fail,
  });
  if (options?.sequenceFloor && !seedRemoteInputScheduler(scheduler, options.sequenceFloor)) {
    socket.close();
    return { ok: false, error: "response_malformed" };
  }
  const stream: RemoteDesktopStream = {
    releaseForHandoff() {
      if (ended || !ready || state !== "active") return Promise.reject(new Error("input_ack_unknown"));
      if (!handoff) handoff = scheduler.releaseForHandoff().then(() => {
        if (ended || state !== "active") throw new Error("input_ack_unknown");
      });
      return handoff;
    },
    finishHandoff() { if (!ended && state === "active") { scheduler.finishHandoff(); handoff = null; } },
    send(action) {
      if (ended || !ready || state !== "active") return false;
      peerHealthy(Date.now());
      if (ended) return false;
      if (lane && !peerTrusted) probeRequested = true;
      probePeer();
      return scheduler.enqueue(action);
    },
    attachDataChannel(next) { if (next !== lane) { dropLane(); lane = ended ? null : next; } },
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
    try { if (message && lane.send(message)) diagnostics.written("data_channel", scheduler.lastSequence()); } catch { /* the gateway release still follows */ }
    dropLane();
  };
  const abort = () => { if (!ended) { peerRelease(); scheduler.emergencyRelease(); dispose(); settle!({ ok: false, error: "aborted" }); } };
  const timeout = setTimeout(() => fail("network_error"), 10_000);
  const inputPump = setInterval(() => {
    if (pendingFrameAck !== null && send({ type: "frame_ack", sequence: pendingFrameAck })) pendingFrameAck = null;
    peerHealthy(Date.now());
    probePeer();
    scheduler.tick();
    if (performance.now() - lastDiagnosticsAt >= 1000) { lastDiagnosticsAt = performance.now(); reportDiagnostics(); }
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
    if (handoff && state !== "active") { fail("input_ack_unknown"); return; }
    // First snapshot of a re-attached socket: continue above what the session already took.
    if (!ready && typeof data.input_seq === "number" && !seedRemoteInputScheduler(scheduler, data.input_seq)) {
      fail("response_malformed");
      return;
    }
    if (state !== "closed" && typeof data.acked_seq === "number") {
      scheduler.executedThrough(data.acked_seq);
      if (!ended) timings.completedThrough(data.acked_seq);
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

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // 空体或非 JSON：成功时按空处理，失败时落到 HTTP 码。读到一半超时/取消不算成功。
      if (timedOut || signal?.aborted) return failed();
    }
    if (!response.ok) {
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

export type RemoteDesktopBrokerState = "loggedIn" | "locked" | "loggedOut" | "preBoot" | "unknown";
export interface RemoteDesktopBrokerStatus {
  deviceId: string;
  generation: number;
  online: boolean;
  enabled: boolean;
  state: RemoteDesktopBrokerState;
  role: "broker" | "userAgent";
  controlSupported: boolean;
  captureVerified: boolean;
  inputVerified: boolean;
  reason: string | null;
}
export interface RemoteDesktopBrokerClient extends Pick<RemoteDesktopClient, "getFrame" | "sendInput" | "closeSession"> {
  getStatus(deviceId: string, options?: RemoteDesktopRequestOptions): Promise<RemoteDesktopApiResult<RemoteDesktopBrokerStatus>>;
  createSession(deviceId: string, options?: RemoteDesktopRequestOptions): Promise<RemoteDesktopApiResult<Omit<RemoteDesktopSession, "transport"> & { transport: "secure-broker-http-v1" }>>;
}

const BROKER_STATES = ["loggedIn", "locked", "loggedOut", "preBoot", "unknown"] as const;
const BROKER_REASONS = ["broker_unavailable", "macos_loginwindow_not_supported", "broker_state_unavailable", "broker_device_verification_required", "os_not_running"];
export function parseBrokerStatus(value: unknown, deviceId: string): RemoteDesktopBrokerStatus | null {
  if (!isRecord(value) || value.deviceId !== deviceId || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1
    || !BROKER_STATES.includes(value.state as RemoteDesktopBrokerState) || !["broker", "userAgent"].includes(String(value.role))
    || ["online", "enabled", "controlSupported", "captureVerified", "inputVerified"].some(key => typeof value[key] !== "boolean")) return null;
  const online = value.online === true;
  const supported = online && value.enabled === true && value.role === "broker" && ["locked", "loggedOut"].includes(String(value.state)) && value.controlSupported === true;
  return { deviceId, generation: value.generation as number, online, enabled: value.enabled as boolean,
    state: online ? value.state as RemoteDesktopBrokerState : "unknown", role: value.role as RemoteDesktopBrokerStatus["role"],
    controlSupported: supported, captureVerified: supported && value.captureVerified === true,
    inputVerified: supported && value.captureVerified === true && value.inputVerified === true,
    reason: typeof value.reason === "string" && BROKER_REASONS.includes(value.reason) ? value.reason : null };
}

type BrokerEvent = { kind: "pointer"; x: number; y: number } | { kind: "button"; button: number; down: boolean }
  | { kind: "key"; scan: number; extended: boolean; down: boolean };
// Windows set-1 scan codes. Browser key text/layout never becomes a privileged command.
const BROKER_KEYS: Record<string, [number, boolean?]> = {
  Escape: [1], Digit1: [2], Digit2: [3], Digit3: [4], Digit4: [5], Digit5: [6], Digit6: [7], Digit7: [8], Digit8: [9], Digit9: [10], Digit0: [11],
  Minus: [12], Equal: [13], Backspace: [14], Tab: [15], KeyQ: [16], KeyW: [17], KeyE: [18], KeyR: [19], KeyT: [20], KeyY: [21], KeyU: [22], KeyI: [23], KeyO: [24], KeyP: [25],
  BracketLeft: [26], BracketRight: [27], Enter: [28], ControlLeft: [29], KeyA: [30], KeyS: [31], KeyD: [32], KeyF: [33], KeyG: [34], KeyH: [35], KeyJ: [36], KeyK: [37], KeyL: [38],
  Semicolon: [39], Quote: [40], Backquote: [41], ShiftLeft: [42], Backslash: [43], KeyZ: [44], KeyX: [45], KeyC: [46], KeyV: [47], KeyB: [48], KeyN: [49], KeyM: [50],
  Comma: [51], Period: [52], Slash: [53], ShiftRight: [54], AltLeft: [56], Space: [57], CapsLock: [58], F1: [59], F2: [60], F3: [61], F4: [62], F5: [63], F6: [64], F7: [65], F8: [66], F9: [67], F10: [68],
  NumLock: [69], ScrollLock: [70], Numpad7: [71], Numpad8: [72], Numpad9: [73], NumpadSubtract: [74], Numpad4: [75], Numpad5: [76], Numpad6: [77], NumpadAdd: [78], Numpad1: [79], Numpad2: [80], Numpad3: [81], Numpad0: [82], NumpadDecimal: [83],
  F11: [87], F12: [88], NumpadEnter: [28, true], ControlRight: [29, true], NumpadDivide: [53, true], AltRight: [56, true], Home: [71, true], ArrowUp: [72, true], PageUp: [73, true], ArrowLeft: [75, true], ArrowRight: [77, true], End: [79, true], ArrowDown: [80, true], PageDown: [81, true], Insert: [82, true], Delete: [83, true], MetaLeft: [91, true], MetaRight: [92, true], ContextMenu: [93, true],
};
export function brokerInputEvents(action: RemoteDesktopAction): BrokerEvent[] | null {
  if (action.kind === "move" || action.kind === "pointer_down" || action.kind === "pointer_up") {
    if (typeof action.x !== "number" || typeof action.y !== "number" || !Number.isFinite(action.x) || !Number.isFinite(action.y) || action.x < 0 || action.x > 1 || action.y < 0 || action.y > 1) return null;
    const events: BrokerEvent[] = [{ kind: "pointer", x: Math.round(action.x * 65535), y: Math.round(action.y * 65535) }];
    if (action.kind !== "move") {
      const button = ["left", "right", "middle"].indexOf(action.button ?? "left");
      if (button < 0) return null;
      events.push({ kind: "button", button, down: action.kind === "pointer_down" });
    }
    return events;
  }
  if (action.kind === "key_down" || action.kind === "key_up") {
    const key = BROKER_KEYS[action.code ?? ""];
    return key ? [{ kind: "key", scan: key[0], extended: key[1] === true, down: action.kind === "key_down" }] : null;
  }
  return null;
}

const brokerBase = (id: string) => `/v1/secure-broker/devices/${encodeURIComponent(id)}`;
const brokerInputs = new Map<string, { sequence: number; held: Map<string, BrokerEvent> }>();
const brokerInputKey = (device: string, session: string) => JSON.stringify([device, session]);
const heldId = (event: BrokerEvent) => event.kind === "key" ? `k:${event.scan}:${event.extended}` : event.kind === "button" ? `b:${event.button}` : "";
const brokerClient: RemoteDesktopBrokerClient = {
  async getStatus(deviceId, options) {
    const result = await authed<unknown>(`${brokerBase(deviceId)}/status`, {}, options?.signal, 2000);
    if (!result.ok) return result as RemoteDesktopApiResult<RemoteDesktopBrokerStatus>;
    const data = parseBrokerStatus(result.data, deviceId);
    return data ? { ...result, data } : { ok: false, error: "response_malformed", status: result.status };
  },
  async createSession(deviceId, options) {
    const registered = await registerController(options?.signal);
    if (!registered.ok) return { ok: false, error: registered.error, status: registered.status };
    const body = JSON.stringify({ requestId: options?.requestId ?? newRequestId() });
    let result = await authed<unknown>(`${brokerBase(deviceId)}/sessions`, { method: "POST", body }, options?.signal, 2000);
    // One safe retry of a lost create reply: the same owner/controller/requestId replays its session.
    if (!result.ok && isNetworkFailure(result.error) && !options?.signal?.aborted) {
      result = await authed<unknown>(`${brokerBase(deviceId)}/sessions`, { method: "POST", body }, options?.signal, 2000);
    }
    if (!result.ok) return { ok: false, error: result.error, status: result.status };
    const data = result.data;
    // API v1's early replay returns the legacy HTTP marker; this authenticated route fixes transport.
    if (!isRecord(data) || typeof data.session_id !== "string" || !data.session_id || !["connecting", "pending_consent"].includes(String(data.state))
      || (data.transport !== undefined && !["secure-broker-http-v1", "http-v1"].includes(String(data.transport)))) return { ok: false, error: "response_malformed", status: result.status };
    const key = brokerInputKey(deviceId, data.session_id);
    if (!brokerInputs.has(key)) brokerInputs.set(key, { sequence: 0, held: new Map() });
    return { ok: true, status: result.status, data: { session_id: data.session_id, state: data.state as RemoteDesktopSession["state"], expires_at: typeof data.expires_at === "string" ? data.expires_at : "",
      transport: "secure-broker-http-v1", ...("billing" in data ? { billing: parseRemoteBilling(data.billing) } : {}) } };
  },
  async getFrame(deviceId, sessionId, options) {
    const result = await authed<unknown>(`${brokerBase(deviceId)}/sessions/${encodeURIComponent(sessionId)}/frame`, {}, options?.signal, 2000);
    if (!result.ok) return { ok: false, error: result.error, status: result.status };
    const data = parseFrame(result.data);
    return data ? { ok: true, data, status: result.status } : { ok: false, error: "response_malformed", status: result.status };
  },
  async sendInput(deviceId, sessionId, seq, action, options) {
    const input = brokerInputs.get(brokerInputKey(deviceId, sessionId));
    if (!input) return { ok: false, error: "session_not_found", status: 404 };
    const events = action.kind === "release_all" ? [...input.held.values()].map(event => ({ ...event, down: false }) as BrokerEvent) : brokerInputEvents(action);
    if (!events) return { ok: false, error: "broker_input_unsupported", status: 422 };
    for (const event of events) {
      const sequence = input.sequence = Math.max(input.sequence + 1, seq);
      const result = await authed<unknown>(`${brokerBase(deviceId)}/sessions/${encodeURIComponent(sessionId)}/input`, { method: "POST", body: JSON.stringify({ sequence, event }) }, options?.signal, INPUT_REQUEST_TIMEOUT_MS);
      if (!result.ok) return { ok: false, error: result.error, status: result.status };
      if (!isRecord(result.data) || result.data.accepted !== true || result.data.sequence !== sequence) return { ok: false, error: "response_malformed", status: result.status };
      if (event.kind !== "pointer") { if (event.down) input.held.set(heldId(event), event); else input.held.delete(heldId(event)); }
    }
    return { ok: true, data: { accepted: true, seq } };
  },
  async closeSession(deviceId, sessionId) {
    brokerInputs.delete(brokerInputKey(deviceId, sessionId));
    return authed<{ closed: true }>(`${brokerBase(deviceId)}/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE", keepalive: true }, undefined, 2000);
  },
};

export const remoteDesktopClient: RemoteDesktopClient = {
  broker: brokerClient,
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
};
