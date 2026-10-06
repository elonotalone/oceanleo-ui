// 消息实时通道的 React 钩子与浏览器接线（契约 §8.3）。
// 一个标签页一条连接：模块级单例；`attachImRealtime()` 由全局唯一的 MessagesHost 在可用时调用。
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { GATEWAY_BASE } from "../../../lib/auth/config";
import { AUTH_STATE_EVENT, accessToken, getUserId } from "../../../lib/auth/client";
import { imEnabledHere, imFetch, useImEnabled } from "../../../lib/im/client";
import { fetchConversations, fetchUnread } from "../../../lib/im/inbox-api";
import type { ImEvent, ImPresence, ImProfile, ImUnread } from "../../../lib/im/types";
import { imSocketUrl } from "../messages-family";
import { maybeShowDesktopNotification } from "../notify/desktop-notify";
import { createWindowBridge, type WindowBridge } from "./broadcast";
import { createImSocket, type ImSocket, type WebSocketLike } from "./socket";
import { createImStore, emptyInbox, type ImConnectionState, type ImStore, type InboxState } from "./store";

export type { ImConnectionState } from "./store";

interface Runtime {
  socket: ImSocket;
  store: ImStore;
}

let runtime: Runtime | null = null;

function getRuntime(): Runtime {
  if (runtime) return runtime;
  const socket = createImSocket({
    url: () => (imEnabledHere() ? imSocketUrl(GATEWAY_BASE) : null),
    getToken: () => accessToken(),
    createSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    random: () => Math.random(),
    now: () => Date.now(),
    isHidden: () => typeof document !== "undefined" && document.hidden,
  });
  const store = createImStore({
    socket,
    fetchUnread,
    fetchConversations,
    notifyDesktop: (input) => maybeShowDesktopNotification(input),
    isHidden: () => typeof document !== "undefined" && document.hidden,
    selfId: () => getUserId(),
    fallbackTitle: () => "消息",
  });
  runtime = { socket, store };
  return runtime;
}

/** 本标签页的消息状态仓（收件箱、未读等）。 */
export function imStore(): ImStore {
  return getRuntime().store;
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

/**
 * 连上网关并把浏览器信号接进去：用户操作 → 活跃，标签页可见性 → 在线/离开，登录态变化 → token 续期。
 * 返回卸载函数（断开连接并清空状态）。
 */
export function attachImRealtime(): () => void {
  if (typeof window === "undefined") return () => {};
  const { socket, store } = getRuntime();
  store.start();
  const bridge = windowBridge(socket);

  let lastActivityPing = 0;
  const onActivity = () => {
    const now = Date.now();
    if (now - lastActivityPing < 1000) return; // 节流：每秒最多告知一次
    lastActivityPing = now;
    socket.noteActivity();
  };
  const onVisibility = () => socket.noteVisibility();
  const onAuth = () => {
    void accessToken().then((token) => socket.tokenChanged(token));
  };
  for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true, capture: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener(AUTH_STATE_EVENT, onAuth);
  return () => {
    for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true });
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener(AUTH_STATE_EVENT, onAuth);
    bridge.detach();
    store.stop();
  };
}

function windowBridge(socket: ImSocket): WindowBridge {
  return createWindowBridge({
    socket,
    win: window as unknown as Parameters<typeof createWindowBridge>[0]["win"],
    makeEvent: (name, detail) => new CustomEvent(name, { detail }),
  });
}

/**
 * 本页没有实时通道（境内站点、未登录）：告诉旧版站点「disabled」，让它们继续轮询。
 * 已经 attach 过的页面由 `attachImRealtime` 自己管。
 */
export function publishImDisabled(): void {
  if (typeof window === "undefined") return;
  const win = window as unknown as Record<string, unknown>;
  if (win.__oceanleoImConnection === "disabled") return;
  win.__oceanleoImConnection = "disabled";
  try {
    window.dispatchEvent(new CustomEvent("oceanleo:im-connection", { detail: "disabled" }));
  } catch {
    /* ignore */
  }
}

export function useImEvent<T extends ImEvent["type"]>(
  type: T,
  handler: (event: Extract<ImEvent, { type: T }>) => void,
): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => imStore().onEvent(type, (event) => ref.current(event)), [type]);
}

/** 重连之后需要补数据（当前会话用 `after_seq` 补）。契约 §6.1：事件不保证不丢。 */
export function useImResync(handler: () => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => imStore().onResync(() => ref.current()), []);
}

export function useImUnread(): ImUnread | null {
  const store = imStore();
  return useSyncExternalStore(store.subscribe, store.unread, () => null);
}

const EMPTY_PRESENCE: Record<string, ImPresence> = {};
const requestedPresence = new Set<string>();

function requestPresence(ids: string[]): void {
  const fresh = ids.filter((id) => id && !requestedPresence.has(id));
  if (fresh.length === 0) return;
  for (const id of fresh) requestedPresence.add(id);
  const batch = fresh.slice(0, 100);
  void imFetch<{ items: ImProfile[] }>(`/v1/im/profiles?ids=${encodeURIComponent(batch.join(","))}`)
    .then((res) => {
      const seeded: Record<string, ImPresence> = {};
      for (const profile of res?.items ?? []) {
        if (profile.presence) seeded[profile.user_id] = profile.presence;
      }
      imStore().seedPresence(seeded);
    })
    .catch(() => {
      for (const id of batch) requestedPresence.delete(id); // 下次再试
    });
}

export function usePresence(userIds: string[]): Record<string, ImPresence> {
  const store = imStore();
  const map = useSyncExternalStore(store.subscribe, store.presenceMap, () => EMPTY_PRESENCE);
  const key = userIds.join("|");
  useEffect(() => {
    const unknown = userIds.filter((id) => !(id in store.presenceMap()));
    if (unknown.length > 0 && imEnabledHere()) requestPresence(unknown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, store]);
  return useMemo(
    () => Object.fromEntries(userIds.map((id) => [id, map[id] ?? "offline"])) as Record<string, ImPresence>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, key],
  );
}

const SERVER_INBOX: InboxState = emptyInbox();

/** 收件箱列表（按事件实时更新排序与未读）。 */
export function useImInbox(): InboxState {
  const store = imStore();
  return useSyncExternalStore(store.subscribe, store.inbox, () => SERVER_INBOX);
}

export function sendTyping(conversationId: string, threadRootId: string | null = null): void {
  if (!runtime) return;
  runtime.socket.sendTyping(conversationId, threadRootId);
}

export function useImConnection(): ImConnectionState {
  const enabled = useImEnabled();
  const store = imStore();
  const state = useSyncExternalStore(store.subscribe, store.connection, () => "closed" as ImConnectionState);
  return enabled ? state : "disabled";
}
