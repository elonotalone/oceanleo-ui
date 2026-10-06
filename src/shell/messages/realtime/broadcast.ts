// 把实时通道的信号转播到 `window`，给装着旧版 @oceanleo/ui、拿不到 `useImEvent` 的站点用
// （首个使用者：talent 站的会话面板，见 work-chat W07 的请求）。
//
// 只做同页 CustomEvent：不跨窗口通信、不带凭据。
//   - 连接状态：`window.__oceanleoImConnection` + `oceanleo:im-connection`（detail = 状态字符串）
//   - 服务端事件：只转播 `message.created` / `message.updated` → `oceanleo:im-event`（detail = 事件对象）
// 纯 TS：window 与事件构造经依赖注入，tests/im-realtime-socket.test.mjs 用假 window 跑真实现。
import type { ImEvent } from "../../../lib/im/types";
import type { SocketOutput, SocketState } from "./socket";

export const IM_CONNECTION_EVENT = "oceanleo:im-connection";
export const IM_EVENT_EVENT = "oceanleo:im-event";
export const IM_CONNECTION_GLOBAL = "__oceanleoImConnection";

/** 对外只暴露这四种；别的值一律不发。 */
export type BroadcastConnection = "open" | "connecting" | "closed" | "disabled";

const BROADCAST_EVENT_TYPES: ReadonlySet<string> = new Set(["message.created", "message.updated"]);

export interface BridgeWindow {
  dispatchEvent(event: unknown): boolean;
  [key: string]: unknown;
}

export interface BridgeSocket {
  state(): SocketState;
  subscribe(listener: (out: SocketOutput) => void): () => void;
}

export interface BridgeDeps {
  socket: BridgeSocket;
  win: BridgeWindow;
  makeEvent(name: string, detail: unknown): unknown;
}

export interface WindowBridge {
  /** 手动发布一个状态（比如未启用时的 "disabled"）。 */
  publish(state: BroadcastConnection): void;
  /** 取消订阅，并把状态置为 "disabled"（本页不再有实时通道）。 */
  detach(): void;
}

function normalize(state: string): BroadcastConnection | null {
  return state === "open" || state === "connecting" || state === "closed" || state === "disabled" ? state : null;
}

export function createWindowBridge(deps: BridgeDeps): WindowBridge {
  let last: BroadcastConnection | null = null;
  let off: (() => void) | null = null;

  function dispatch(name: string, detail: unknown): void {
    try {
      deps.win.dispatchEvent(deps.makeEvent(name, detail));
    } catch {
      /* 转播失败不能影响消息本身 */
    }
  }

  function publish(state: BroadcastConnection): void {
    if (state === last) return;
    last = state;
    deps.win[IM_CONNECTION_GLOBAL] = state;
    dispatch(IM_CONNECTION_EVENT, state);
  }

  const first = normalize(deps.socket.state());
  if (first) publish(first);
  off = deps.socket.subscribe((out) => {
    if (out.kind === "state") {
      const next = normalize(out.state);
      if (next) publish(next);
    } else if (out.kind === "event") {
      const event = out.event as ImEvent;
      if (BROADCAST_EVENT_TYPES.has(event.type)) dispatch(IM_EVENT_EVENT, event);
    }
  });

  return {
    publish,
    detach() {
      if (off) off();
      off = null;
      publish("disabled");
    },
  };
}
