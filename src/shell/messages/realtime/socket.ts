// 消息实时通道客户端（work-chat 契约 §6.1）。纯 TS，所有浏览器能力经 SocketDeps 注入，
// 所以 tests/im-realtime-socket.test.mjs 用假 WebSocket + 假计时器跑真实实现。
//
// 规则（逐条对应契约）：
//  - 每个标签页一条连接；连上后第一帧文本 `{"type":"auth","token"}`（10 秒内）。
//  - 25 秒一次 `{"type":"ping"}`；token 续期发 `{"type":"auth.refresh","token"}`。
//  - 断线指数退避 1s→30s，带抖动；重连成功（再次 ready）后通知订阅者「需要补数据」。
//  - 标签页隐藏或 5 分钟没操作 → `presence: away`；回来 → active。
//  - `typing` 每个会话（含线程）3 秒最多一次。
//  - 不保证不丢：事件丢了靠 REST 补，所以这里只负责告诉订阅者「重连好了」。
import type { ImEvent } from "../../../lib/im/types";

export type SocketState = "connecting" | "open" | "closed" | "disabled";

export type SocketOutput =
  | { kind: "state"; state: SocketState }
  | { kind: "ready"; userId: string }
  | { kind: "resync" }
  | { kind: "event"; event: ImEvent };

export interface WebSocketLike {
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

export interface SocketDeps {
  /** 通道地址；null = 这里不该连（境内 / 地址不合格）。 */
  url(): string | null;
  /** 当前可用的 access token；没有 = null。 */
  getToken(): Promise<string | null>;
  createSocket(url: string): WebSocketLike;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  random(): number;
  now(): number;
  /** 标签页当前是否隐藏。 */
  isHidden(): boolean;
}

export const PING_MS = 25_000;
export const IDLE_MS = 5 * 60_000;
export const TYPING_GAP_MS = 3_000;
export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
export const AUTH_TIMEOUT_MS = 10_000;

/** 第 attempt 次重连（从 0 开始）前的等待：1s、2s、4s … 封顶 30s，±20% 抖动。 */
export function backoffDelay(attempt: number, random: () => number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt));
  const jitter = 0.8 + 0.4 * Math.min(1, Math.max(0, random()));
  return Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, Math.round(base * jitter)));
}

export interface ImSocket {
  start(): void;
  stop(): void;
  state(): SocketState;
  subscribe(listener: (out: SocketOutput) => void): () => void;
  /** token 变了（续期 / 换号）：已连上就发 auth.refresh；没连上就等下一次重连带新 token。 */
  tokenChanged(token: string | null): void;
  /** 用户有操作（键盘、鼠标、触摸）。 */
  noteActivity(): void;
  /** 标签页可见性变化。 */
  noteVisibility(): void;
  sendTyping(conversationId: string, threadRootId?: string | null): void;
}

export function createImSocket(deps: SocketDeps): ImSocket {
  const listeners = new Set<(out: SocketOutput) => void>();
  let state: SocketState = "closed";
  let socket: WebSocketLike | null = null;
  let running = false;
  let attempt = 0;
  let everReady = false;
  let reconnectTimer: unknown = null;
  let pingTimer: unknown = null;
  let authTimer: unknown = null;
  let idleTimer: unknown = null;
  let idle = false;
  let sentPresence: "active" | "away" | null = null;
  const typingAt = new Map<string, number>();
  let generation = 0; // 过期连接的回调一律忽略

  function emit(out: SocketOutput): void {
    for (const listener of Array.from(listeners)) {
      try {
        listener(out);
      } catch {
        /* 订阅者异常不能拖垮连接 */
      }
    }
  }

  function setState(next: SocketState): void {
    if (state === next) return;
    state = next;
    emit({ kind: "state", state });
  }

  function clearTimers(): void {
    if (pingTimer !== null) deps.clearTimer(pingTimer);
    if (authTimer !== null) deps.clearTimer(authTimer);
    pingTimer = null;
    authTimer = null;
  }

  function rawSend(payload: unknown): boolean {
    if (!socket || state !== "open") return false;
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function desiredPresence(): "active" | "away" {
    return deps.isHidden() || idle ? "away" : "active";
  }

  function syncPresence(force = false): void {
    const want = desiredPresence();
    if (!force && want === sentPresence) return;
    if (rawSend({ type: "presence", state: want })) sentPresence = want;
  }

  function armIdle(): void {
    if (idleTimer !== null) deps.clearTimer(idleTimer);
    idleTimer = deps.setTimer(() => {
      idleTimer = null;
      idle = true;
      syncPresence();
    }, IDLE_MS);
  }

  function schedulePing(): void {
    if (pingTimer !== null) deps.clearTimer(pingTimer);
    pingTimer = deps.setTimer(() => {
      pingTimer = null;
      rawSend({ type: "ping" });
      if (state === "open") schedulePing();
    }, PING_MS);
  }

  function scheduleReconnect(): void {
    if (!running || reconnectTimer !== null) return;
    const delay = backoffDelay(attempt, deps.random);
    attempt += 1;
    reconnectTimer = deps.setTimer(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  function handleClosed(myGeneration: number): void {
    if (myGeneration !== generation) return;
    clearTimers();
    socket = null;
    sentPresence = null;
    if (!running) {
      setState("closed");
      return;
    }
    setState("connecting"); // 对外仍是「正在连接」：浮层照常可开
    scheduleReconnect();
  }

  async function connect(): Promise<void> {
    if (!running) return;
    const url = deps.url();
    if (!url) {
      setState("disabled");
      return;
    }
    setState("connecting");
    const myGeneration = ++generation;
    let token: string | null = null;
    try {
      token = await deps.getToken();
    } catch {
      token = null;
    }
    if (!running || myGeneration !== generation) return;
    if (!token) {
      scheduleReconnect();
      return;
    }
    let ws: WebSocketLike;
    try {
      ws = deps.createSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (myGeneration !== generation) return;
      // 第一帧必须是 auth。此时 state 还不是 open，所以直接发。
      try {
        ws.send(JSON.stringify({ type: "auth", token }));
      } catch {
        /* onclose 会接手 */
      }
      authTimer = deps.setTimer(() => {
        authTimer = null;
        if (myGeneration === generation && state !== "open") {
          try {
            ws.close(4000);
          } catch {
            /* ignore */
          }
          handleClosed(myGeneration);
        }
      }, AUTH_TIMEOUT_MS);
    };
    ws.onmessage = (ev) => {
      if (myGeneration !== generation) return;
      if (typeof ev.data !== "string") return;
      let msg: unknown;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      const frame = msg as { type?: unknown; user_id?: unknown; event?: unknown };
      if (frame.type === "ready") {
        if (authTimer !== null) {
          deps.clearTimer(authTimer);
          authTimer = null;
        }
        const reconnected = everReady;
        everReady = true;
        attempt = 0;
        setState("open");
        schedulePing();
        syncPresence(true);
        emit({ kind: "ready", userId: typeof frame.user_id === "string" ? frame.user_id : "" });
        if (reconnected) emit({ kind: "resync" });
        return;
      }
      if (frame.type === "event" && frame.event && typeof frame.event === "object") {
        const event = frame.event as { type?: unknown };
        if (typeof event.type === "string") emit({ kind: "event", event: frame.event as ImEvent });
      }
      // pong 与未知帧：忽略。
    };
    ws.onerror = () => {
      /* 紧跟着会有 onclose */
    };
    ws.onclose = () => handleClosed(myGeneration);
  }

  return {
    start() {
      if (running) return;
      running = true;
      idle = false;
      armIdle();
      void connect();
    },
    stop() {
      running = false;
      generation += 1;
      if (reconnectTimer !== null) deps.clearTimer(reconnectTimer);
      reconnectTimer = null;
      if (idleTimer !== null) deps.clearTimer(idleTimer);
      idleTimer = null;
      clearTimers();
      const ws = socket;
      socket = null;
      sentPresence = null;
      attempt = 0;
      everReady = false;
      if (ws) {
        try {
          ws.close(1000);
        } catch {
          /* ignore */
        }
      }
      setState("closed");
    },
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    tokenChanged(token) {
      if (token && state === "open") rawSend({ type: "auth.refresh", token });
    },
    noteActivity() {
      if (!running) return;
      const wasIdle = idle;
      idle = false;
      armIdle();
      if (wasIdle) syncPresence();
    },
    noteVisibility() {
      if (!running) return;
      if (!deps.isHidden()) {
        idle = false;
        armIdle();
      }
      syncPresence();
    },
    sendTyping(conversationId, threadRootId = null) {
      if (state !== "open") return;
      const key = `${conversationId}\u0000${threadRootId ?? ""}`;
      const now = deps.now();
      const last = typingAt.get(key);
      if (last !== undefined && now - last < TYPING_GAP_MS) return;
      typingAt.set(key, now);
      rawSend({ type: "typing", conversation_id: conversationId, thread_root_id: threadRootId });
    },
  };
}
