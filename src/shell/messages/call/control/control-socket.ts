// 控制方中继 WebSocket（合同 §3.8 + 仲裁 A-6）。纯 TS：浏览器能力全部经 deps 注入，
// tests/call-control-protocol.test.mjs 用假 WebSocket + 假计时器跑这份真实实现。
//
// 规则：
//  - 连上后第一帧 `{"type":"auth","access_token"}`（token 取法同 realtime/socket.ts：deps.getToken → accessToken()）；
//    10 秒内没收到任何服务端帧 → 断开重试。
//  - 服务端 `{"type":"waiting"}` = 已鉴权、对方桌面客户端还没接入；`{"type":"ready","surface"}` = 可以发输入。
//  - 设备转来的 `{"t":"state","state":"active|paused|ended"}`、`{"t":"surface"}` 更新状态与尺寸。
//  - `{"type":"ended"|"error"}`、设备 `state: ended`、或 4000–4999 关闭码 = 服务端结束（A-6），不重连。
//  - 其它断开（1006 等）：从断开起 20 秒内退避重连（0.5→1→2→4 秒，±20% 抖动），超出 → 结束（connection_lost）。
//  - 只在 ready 时发输入帧；`stop` 在任何已鉴权的状态都发。
import { encodeFrame, parseServerFrame, type ControlSurface, type ControllerFrame } from "./protocol";

export type ControlLinkState = "connecting" | "waiting" | "ready" | "paused" | "ended";

export interface ControlLinkSnapshot {
  state: ControlLinkState;
  surface: ControlSurface | null;
  endReason: string | null;
  /** 断线后正在重连（state 此时是 connecting）。 */
  reconnecting: boolean;
}

export interface ControlWebSocketLike {
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

export interface ControlLinkDeps {
  /** 中继地址；null = 地址不合格（结束，原因 unavailable）。 */
  url(): string | null;
  getToken(): Promise<string | null>;
  createSocket(url: string): ControlWebSocketLike;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  random(): number;
  now(): number;
}

export interface ControlLink {
  start(): void;
  /** 本端结束：可选先发 `{"t":"stop"}`，然后关连接；之后不再重连。 */
  close(options?: { sendStop?: boolean; reason?: string }): void;
  /** 发一帧；没就绪返回 false（调用方计为丢弃）。 */
  send(frame: ControllerFrame): boolean;
  snapshot(): ControlLinkSnapshot;
  subscribe(listener: () => void): () => void;
}

export const CONTROL_LINK_AUTH_TIMEOUT_MS = 10_000;
export const CONTROL_LINK_RECONNECT_WINDOW_MS = 20_000;
export const CONTROL_LINK_BACKOFF_MS: readonly number[] = [500, 1_000, 2_000, 4_000];

export function controlLinkBackoff(attempt: number, random: () => number): number {
  const base = CONTROL_LINK_BACKOFF_MS[Math.min(Math.max(0, attempt), CONTROL_LINK_BACKOFF_MS.length - 1)];
  const jitter = 0.8 + 0.4 * Math.min(1, Math.max(0, random()));
  return Math.round(base * jitter);
}

function sameSurface(a: ControlSurface | null, b: ControlSurface | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.width === b.width && a.height === b.height && a.scale === b.scale && a.monitor_id === b.monitor_id;
}

export function createControlLink(deps: ControlLinkDeps): ControlLink {
  const listeners = new Set<() => void>();
  let snap: ControlLinkSnapshot = { state: "connecting", surface: null, endReason: null, reconnecting: false };
  let socket: ControlWebSocketLike | null = null;
  let generation = 0;
  let started = false;
  let authed = false;
  let authTimer: unknown = null;
  let reconnectTimer: unknown = null;
  let droppedAt: number | null = null;
  let attempt = 0;

  function emit(): void {
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch {
        /* 订阅者异常不能拖垮链路 */
      }
    }
  }

  function set(patch: Partial<ControlLinkSnapshot>): void {
    const next: ControlLinkSnapshot = { ...snap, ...patch };
    if (
      next.state === snap.state &&
      next.endReason === snap.endReason &&
      next.reconnecting === snap.reconnecting &&
      sameSurface(next.surface, snap.surface)
    ) {
      return;
    }
    snap = next;
    emit();
  }

  function clearAuthTimer(): void {
    if (authTimer !== null) deps.clearTimer(authTimer);
    authTimer = null;
  }

  function end(reason: string): void {
    if (snap.state === "ended") return;
    clearAuthTimer();
    if (reconnectTimer !== null) deps.clearTimer(reconnectTimer);
    reconnectTimer = null;
    generation += 1; // 之后旧连接的回调一律忽略
    const ws = socket;
    socket = null;
    authed = false;
    if (ws) {
      try {
        ws.close(1000);
      } catch {
        /* ignore */
      }
    }
    set({ state: "ended", endReason: reason, reconnecting: false });
  }

  function scheduleReconnect(): void {
    if (snap.state === "ended" || reconnectTimer !== null) return;
    const now = deps.now();
    if (droppedAt === null) droppedAt = now;
    if (now - droppedAt >= CONTROL_LINK_RECONNECT_WINDOW_MS) {
      end("connection_lost");
      return;
    }
    const delay = controlLinkBackoff(attempt, deps.random);
    attempt += 1;
    set({ state: "connecting", reconnecting: true });
    reconnectTimer = deps.setTimer(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  function handleClosed(myGeneration: number, code: number | undefined): void {
    if (myGeneration !== generation) return;
    clearAuthTimer();
    socket = null;
    authed = false;
    if (snap.state === "ended") return;
    if (typeof code === "number" && code >= 4000 && code <= 4999) {
      end(snap.endReason ?? `closed_${code}`);
      return;
    }
    scheduleReconnect();
  }

  async function connect(): Promise<void> {
    if (snap.state === "ended") return;
    const url = deps.url();
    if (!url) {
      end("unavailable");
      return;
    }
    const myGeneration = ++generation;
    let token: string | null = null;
    try {
      token = await deps.getToken();
    } catch {
      token = null;
    }
    if (myGeneration !== generation || snap.state === "ended") return;
    if (!token) {
      scheduleReconnect();
      return;
    }
    let ws: ControlWebSocketLike;
    try {
      ws = deps.createSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;
    authed = false;
    const authToken = token;
    ws.onopen = () => {
      if (myGeneration !== generation) return;
      try {
        ws.send(JSON.stringify({ type: "auth", access_token: authToken }));
      } catch {
        /* onclose 会接手 */
      }
      clearAuthTimer();
      authTimer = deps.setTimer(() => {
        authTimer = null;
        if (myGeneration !== generation || authed) return;
        try {
          ws.close(1000);
        } catch {
          /* ignore */
        }
        handleClosed(myGeneration, 1006);
      }, CONTROL_LINK_AUTH_TIMEOUT_MS);
    };
    ws.onmessage = (ev) => {
      if (myGeneration !== generation) return;
      const frame = parseServerFrame(ev.data);
      if (!frame) return;
      if (!authed) {
        authed = true;
        clearAuthTimer();
        droppedAt = null;
        attempt = 0;
      }
      switch (frame.kind) {
        case "waiting":
          set({ state: "waiting", reconnecting: false });
          return;
        case "ready":
          set({ state: "ready", surface: frame.surface ?? snap.surface, reconnecting: false });
          return;
        case "state":
          if (frame.state === "ended") end(frame.reason ?? "ended");
          else set({ state: frame.state === "paused" ? "paused" : "ready", reconnecting: false });
          return;
        case "surface":
          set({
            surface: {
              ...(snap.surface ?? {}),
              width: frame.width,
              height: frame.height,
            },
          });
          return;
        case "ended":
          end(frame.reason ?? "ended");
          return;
        case "error":
          end(frame.code);
          return;
      }
    };
    ws.onerror = () => {
      /* 紧跟着会有 onclose */
    };
    ws.onclose = (ev) => handleClosed(myGeneration, ev?.code);
  }

  return {
    start() {
      if (started) return;
      started = true;
      void connect();
    },
    close(options = {}) {
      if (snap.state === "ended") return;
      if (options.sendStop && socket && authed) {
        try {
          socket.send(encodeFrame({ t: "stop" }));
        } catch {
          /* ignore */
        }
      }
      end(options.reason ?? "local_stop");
    },
    send(frame) {
      const ws = socket;
      if (!ws || !authed) return false;
      if (frame.t !== "stop" && snap.state !== "ready") return false;
      try {
        ws.send(encodeFrame(frame));
        return true;
      } catch {
        return false;
      }
    },
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
