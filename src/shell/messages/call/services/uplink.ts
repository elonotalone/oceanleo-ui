// 字幕上行 WebSocket 的状态机（合同 §3.6）。纯 TS，浏览器能力经 UplinkDeps 注入，
// 所以 tests/call-services-captions.test.mjs 用假 WebSocket + 假计时器跑真实实现。
//
// 何时连：通话在进行（connected / reconnecting）+ 服务端转写开着 + 知道 callId 与自己的 participantId + 自己开麦。
//   连上后第一帧文本 `{"type":"auth","access_token","participant_id"}`，等 `{"type":"ready","sample_rate"}`；
//   之后发二进制 PCM（16 kHz s16le 单声道，每帧 100 ms）。
// 静音：已连上就发 `{"type":"pause"}`，开麦发 `{"type":"resume"}`；还没连就先不连（静音时本来就没有声音要传）。
// 何时停：转写关了 / 离开 / 通话结束 / 换了通话 → 关掉连接，不重连。
// 断线：开麦时指数退避重连（1 s → 30 s，带抖动，与 IM 实时通道同一条退避曲线）；静音时不重连，等开麦再连。
//
// 服务端怎么关、我们怎么办（照 W03 `backend/app/im/call_captions.py` 头注释的约定表）：
//   error 帧 transcription_off（4409）/ not_participant（4403）→ 不立刻重连：等服务端转写状态先关再开、
//     换了参与者（重新入会），或 60 秒后再核一次（防我们看到的状态是旧的）；
//   error 帧 auth_failed（4401）→ 退避重试（token 会重新取）；
//   error 帧 asr_unavailable（1013）→ 至少 15 秒后重试，界面据 `status().error` 提示「实时转写暂不可用」；
//   无 error 帧 1000（call_ended / replaced）、4429（quota_exceeded）、1008（policy）、1009（帧太大）、4403/4409
//     → 服务端主动结束：不自动重连，直到换了参与者或转写先关再开（replaced 时绝不来回抢连接）；
//   无 error 帧 1013（rate_limited / busy）→ 至少 15 秒后重试；
//   4408（idle_timeout / max_duration）与网络断开 → 开麦就退避重连，静音就等开麦。
import { backoffDelay } from "../../realtime/socket";
import { CAPTIONS_SAMPLE_RATE } from "./pcm";

/** stopped = 服务端主动结束了这条连接，等状态变化（换参与者 / 转写先关再开）才会再连。 */
export type UplinkState = "idle" | "connecting" | "streaming" | "paused" | "retrying" | "stopped";

export interface UplinkTarget {
  callId: string | null;
  participantId: string | null;
  /** 通话在进行（引擎 phase 为 connected 或 reconnecting）。 */
  inCall: boolean;
  /** 服务端 `CallView.transcription.enabled`。 */
  transcription: boolean;
  /** 自己开着麦。 */
  mic: boolean;
}

export interface UplinkStatus {
  state: UplinkState;
  /** 服务端 ready 帧给的采样率（默认 16000）。 */
  sampleRate: number;
  /** 最近一次失败的原因码（`asr_unavailable`、`auth_failed`…）；重新连上后清空。 */
  error: string | null;
}

export interface CaptionsSocketLike {
  binaryType?: string;
  readonly bufferedAmount?: number;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev?: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}

export interface UplinkDeps {
  /** 上行地址；null = 这里连不了（未登录 / 网关地址不合格）。 */
  url(callId: string): string | null;
  /** 当前 Supabase access token（照 IM 实时连接的取法）。 */
  getToken(): Promise<string | null>;
  createSocket(url: string): CaptionsSocketLike;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  random(): number;
  now(): number;
}

export const UPLINK_AUTH_TIMEOUT_MS = 10_000;
/** asr_unavailable / 1013（服务端忙、连接太频繁）之后至少等这么久再试。 */
export const UPLINK_ASR_RETRY_MIN_MS = 15_000;
/** 服务端说转写已关 / 不是在场参与者、而我们看到的状态还是能连：最多等这么久再核一次。 */
export const UPLINK_OFF_RETRY_MS = 60_000;
/** 服务端主动结束、不该自动重连的关闭码（无 error 帧时）：1000 call_ended/replaced、1008、1009、4403、4409、4429。 */
export const UPLINK_FINAL_CLOSE_CODES: readonly number[] = [1000, 1008, 1009, 4403, 4409, 4429];
/** 服务端「稍后再试」的关闭码。 */
export const UPLINK_TRY_LATER_CLOSE_CODE = 1013;
/** 连上后撑过这么久才算「稳定」，断了从最短退避重来；否则退避继续加长（防服务端一连就断的快速循环）。 */
export const UPLINK_STABLE_MS = 10_000;
/** 发送缓冲超过这么多字节（16 kHz s16le 约 2 秒）就丢帧，不让网络慢时内存无限涨。 */
export const UPLINK_MAX_BUFFERED_BYTES = 64_000;
/** 地址取不到（多半是未登录或网关地址不合格）时，至少隔这么久再试。 */
export const UPLINK_UNAVAILABLE_RETRY_MS = 5_000;

export const SERVER_ERROR_CODES = ["transcription_off", "not_participant", "auth_failed", "asr_unavailable"] as const;

export function uplinkWanted(target: UplinkTarget): boolean {
  return Boolean(target.inCall && target.transcription && target.callId && target.participantId);
}

export interface CaptionsUplink {
  /** 喂最新的通话状态；状态机自己决定连、停、pause、resume。 */
  update(target: UplinkTarget): void;
  /** 发一帧 PCM。没连上、静音、缓冲太满时返回 false（丢弃，不攒）。 */
  sendFrame(frame: Uint8Array): boolean;
  /** 麦克风采集此刻是否该跑（要连、开麦、没有被服务端判为转写已关）。 */
  capturing(): boolean;
  status(): UplinkStatus;
  stats(): { framesSent: number; framesDropped: number; connects: number };
  subscribe(listener: (status: UplinkStatus) => void): () => void;
  stop(): void;
}

const IDLE_TARGET: UplinkTarget = { callId: null, participantId: null, inCall: false, transcription: false, mic: false };

export function createCaptionsUplink(deps: UplinkDeps): CaptionsUplink {
  const listeners = new Set<(status: UplinkStatus) => void>();
  let target: UplinkTarget = IDLE_TARGET;
  let sessionKey: string | null = null;
  let socket: CaptionsSocketLike | null = null;
  let socketReady = false;
  let readyAt = 0;
  let paused = false;
  let generation = 0;
  let attempt = 0;
  let retryTimer: unknown = null;
  let authTimer: unknown = null;
  /** soft = 服务端说转写已关 / 不是在场参与者（60 秒后再核）；hard = 服务端主动结束（等状态变化）。 */
  let blocked: "soft" | "hard" | null = null;
  let pendingConnect = false; // 正在取 token / 建连接（同一代只发起一次）
  let status: UplinkStatus = { state: "idle", sampleRate: CAPTIONS_SAMPLE_RATE, error: null };
  let framesSent = 0;
  let framesDropped = 0;
  let connects = 0;

  function emit(): void {
    for (const listener of Array.from(listeners)) {
      try {
        listener(status);
      } catch {
        /* 订阅者异常不能拖垮上行 */
      }
    }
  }

  function setStatus(patch: Partial<UplinkStatus>): void {
    const next = { ...status, ...patch };
    if (next.state === status.state && next.sampleRate === status.sampleRate && next.error === status.error) return;
    status = next;
    emit();
  }

  function rawSend(data: string | Uint8Array): boolean {
    if (!socket) return false;
    try {
      socket.send(data);
      return true;
    } catch {
      return false;
    }
  }

  function clearRetry(): void {
    if (retryTimer !== null) deps.clearTimer(retryTimer);
    retryTimer = null;
  }

  function clearAuth(): void {
    if (authTimer !== null) deps.clearTimer(authTimer);
    authTimer = null;
  }

  /** 关掉当前连接（之后它的回调一律作废）。 */
  function dropSocket(code = 1000): void {
    generation += 1;
    pendingConnect = false;
    clearAuth();
    const ws = socket;
    socket = null;
    socketReady = false;
    paused = false;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close(code);
      } catch {
        /* ignore */
      }
    }
  }

  function settledState(): UplinkState {
    if (!uplinkWanted(target)) return "idle";
    if (socket) {
      if (!socketReady) return "connecting";
      return paused ? "paused" : "streaming";
    }
    if (blocked === "hard") return "stopped";
    if (retryTimer !== null || blocked) return "retrying";
    return target.mic ? "connecting" : "paused";
  }

  function scheduleRetry(minDelay = 0): void {
    clearRetry();
    const delay = Math.max(minDelay, backoffDelay(attempt, deps.random));
    attempt += 1;
    retryTimer = deps.setTimer(() => {
      retryTimer = null;
      blocked = null;
      reconcile();
    }, delay);
    setStatus({ state: "retrying" });
  }

  function onServerError(code: string): void {
    dropSocket(1000);
    if (code === "transcription_off" || code === "not_participant") {
      blocked = "soft";
      clearRetry();
      retryTimer = deps.setTimer(() => {
        retryTimer = null;
        blocked = null;
        reconcile();
      }, UPLINK_OFF_RETRY_MS);
      setStatus({ state: "retrying", error: code });
      return;
    }
    setStatus({ error: code });
    scheduleRetry(code === "asr_unavailable" ? UPLINK_ASR_RETRY_MIN_MS : 0);
  }

  function onUnexpectedClose(ev?: { code?: number; reason?: string }): void {
    const code = typeof ev?.code === "number" ? ev.code : 0;
    const reason = typeof ev?.reason === "string" ? ev.reason : "";
    const wasReady = socketReady;
    const stable = wasReady && deps.now() - readyAt >= UPLINK_STABLE_MS;
    dropSocket(1000);
    if (!uplinkWanted(target)) {
      setStatus({ state: "idle" });
      return;
    }
    if (UPLINK_FINAL_CLOSE_CODES.includes(code)) {
      // 服务端主动结束（通话结束、被同一参会者的新连接替换、配额、策略…）：不自动重连。
      blocked = "hard";
      clearRetry();
      setStatus({ state: "stopped", error: reason || `closed_${code}` });
      return;
    }
    if (stable) attempt = 0;
    if (code === UPLINK_TRY_LATER_CLOSE_CODE) setStatus({ error: reason || "busy" });
    else if (!wasReady) setStatus({ error: status.error ?? "connect_failed" });
    if (!target.mic) {
      // 静音时不重连：开麦时 reconcile 会立刻再连。
      setStatus({ state: "paused" });
      return;
    }
    scheduleRetry(code === UPLINK_TRY_LATER_CLOSE_CODE ? UPLINK_ASR_RETRY_MIN_MS : 0);
  }

  async function connect(): Promise<void> {
    const callId = target.callId;
    const participantId = target.participantId;
    if (!callId || !participantId) return;
    const myGeneration = ++generation;
    pendingConnect = true;
    setStatus({ state: "connecting" });
    const url = deps.url(callId);
    if (!url) {
      pendingConnect = false;
      setStatus({ error: "unavailable" });
      scheduleRetry(UPLINK_UNAVAILABLE_RETRY_MS);
      return;
    }
    let token: string | null = null;
    try {
      token = await deps.getToken();
    } catch {
      token = null;
    }
    if (myGeneration !== generation) return; // 期间被关掉或换了通话：新的那一代自己会连
    pendingConnect = false;
    if (!uplinkWanted(target) || target.callId !== callId || target.participantId !== participantId) {
      reconcile();
      return;
    }
    if (!target.mic) {
      // 取 token 的工夫里静音了：先不连，开麦再连。
      setStatus({ state: settledState() });
      return;
    }
    if (!token) {
      setStatus({ error: "auth_failed" });
      scheduleRetry();
      return;
    }
    let ws: CaptionsSocketLike;
    try {
      ws = deps.createSocket(url);
    } catch {
      setStatus({ error: "connect_failed" });
      scheduleRetry();
      return;
    }
    connects += 1;
    try {
      ws.binaryType = "arraybuffer";
    } catch {
      /* 有的实现不让写 */
    }
    socket = ws;
    socketReady = false;
    paused = false;
    ws.onopen = () => {
      if (myGeneration !== generation) return;
      // 第一帧必须是 auth。
      try {
        ws.send(JSON.stringify({ type: "auth", access_token: token, participant_id: participantId }));
      } catch {
        /* onclose 会接手 */
      }
      clearAuth();
      authTimer = deps.setTimer(() => {
        authTimer = null;
        if (myGeneration !== generation || socketReady) return;
        setStatus({ error: "auth_timeout" });
        onUnexpectedClose();
      }, UPLINK_AUTH_TIMEOUT_MS);
    };
    ws.onmessage = (ev) => {
      if (myGeneration !== generation) return;
      if (typeof ev.data !== "string") return;
      let frame: { type?: unknown; sample_rate?: unknown; code?: unknown } | null = null;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!frame || typeof frame !== "object") return;
      if (frame.type === "ready") {
        clearAuth();
        socketReady = true;
        readyAt = deps.now();
        const rate = Number(frame.sample_rate);
        const sampleRate = Number.isFinite(rate) && rate >= 8_000 && rate <= 48_000 ? rate : CAPTIONS_SAMPLE_RATE;
        if (!target.mic) {
          rawSend(JSON.stringify({ type: "pause" }));
          paused = true;
        }
        setStatus({ state: paused ? "paused" : "streaming", sampleRate, error: null });
        return;
      }
      if (frame.type === "error") {
        const code = typeof frame.code === "string" && frame.code ? frame.code : "server_error";
        onServerError(code);
      }
      // 其余文本帧（未来的扩展）：忽略。
    };
    ws.onerror = () => {
      /* 紧跟着会有 onclose */
    };
    ws.onclose = (ev) => {
      if (myGeneration !== generation) return;
      onUnexpectedClose(ev);
    };
  }

  function reconcile(): void {
    if (!uplinkWanted(target)) {
      dropSocket(1000);
      clearRetry();
      sessionKey = null;
      attempt = 0;
      blocked = null;
      setStatus({ state: "idle", error: null });
      return;
    }
    const key = `${target.callId}\u0000${target.participantId}`;
    if (key !== sessionKey) {
      dropSocket(1000);
      clearRetry();
      sessionKey = key;
      attempt = 0;
      blocked = null;
      setStatus({ error: null });
    }
    if (socket) {
      if (socketReady) {
        if (!target.mic && !paused) {
          if (rawSend(JSON.stringify({ type: "pause" }))) paused = true;
        } else if (target.mic && paused) {
          if (rawSend(JSON.stringify({ type: "resume" }))) paused = false;
        }
      }
      setStatus({ state: settledState() });
      return;
    }
    if (pendingConnect || !target.mic || blocked || retryTimer !== null) {
      setStatus({ state: settledState() });
      return;
    }
    void connect();
  }

  return {
    update(next) {
      const before = target;
      target = { ...next };
      // 服务端把转写关掉（我们看到 false）→ 解除阻塞（soft 与 hard 都解）；再开时立刻重连。
      if (!next.transcription && before.transcription) blocked = null;
      reconcile();
    },
    sendFrame(frame) {
      if (!socket || !socketReady || paused || !target.mic) return false;
      const buffered = Number(socket.bufferedAmount ?? 0);
      if (buffered > UPLINK_MAX_BUFFERED_BYTES) {
        framesDropped += 1;
        return false;
      }
      if (!rawSend(frame)) {
        framesDropped += 1;
        return false;
      }
      framesSent += 1;
      return true;
    },
    capturing: () => uplinkWanted(target) && target.mic && blocked === null,
    status: () => status,
    stats: () => ({ framesSent, framesDropped, connects }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop() {
      target = IDLE_TARGET;
      reconcile();
    },
  };
}

/** 网关 http(s) 地址 → 字幕上行地址（合同 §3.6）。地址不合格返回 null。 */
export function captionsSocketUrl(gatewayBase: string, callId: string): string | null {
  const base = (gatewayBase || "").trim().replace(/\/+$/, "");
  const id = String(callId || "").trim();
  if (!base || !id) return null;
  const path = `/v1/im/calls/${encodeURIComponent(id)}/captions/ws`;
  if (/^https:\/\//i.test(base)) return `${base.replace(/^https:/i, "wss:")}${path}`;
  if (/^http:\/\//i.test(base)) return `${base.replace(/^http:/i, "ws:")}${path}`;
  return null;
}
