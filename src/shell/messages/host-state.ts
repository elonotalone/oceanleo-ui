// 消息浮层的开合状态（work-chat 契约 §8.3）。纯 TS：不碰 DOM 全局，浏览器能力经 HostEnv 注入，
// 所以 tests/im-host-state.test.mjs 能用假的 history/location 跑真实实现。
//
// 深链：任何站 `?im=<会话 id>`（可带 `&im_seq=<seq>`）、`?im=inbox`、`?im=people`、`?im_invite=<code>`。
// 浮层不是路由：侧栏打开不写 `?im=`。带着深链进来时 applyLocation 打开一次，随后 replaceState 清掉。
// 切页由外壳 closeMessages，不把 `?im=` 带到下一页。
import { useSyncExternalStore } from "react";

export type MessagesView = "inbox" | "people" | "bay";
export const MESSAGES_VIEWS: readonly MessagesView[] = ["inbox", "people", "bay"];
/** 收件箱筛选的合法值；与 `lib/im/inbox-api.ts` 的 `INBOX_FILTERS` 相同（测试里对拍，host-state 保持纯、不引入鉴权依赖）。 */
export const INBOX_FILTER_IDS: readonly string[] = ["all", "unread", "mentions", "dm", "group", "team", "project", "talent"];
export type MessagesLayoutKind = "docked" | "full" | "mobile";

export interface MessagesTarget {
  conversationId?: string;
  seq?: number;
  filter?: string;
  view?: MessagesView;
}

/** `useMessagesHost()` 的返回：契约要求 open/layout/conversationId，其余是本外壳内部要用的附加字段。 */
export interface MessagesHostSnapshot {
  open: boolean;
  layout: MessagesLayoutKind;
  conversationId: string | null;
  view: MessagesView;
  filter: string;
  highlightSeq: number | null;
  inviteCode: string | null;
  expanded: boolean;
  narrow: boolean;
  dockWidth: number;
  enabled: boolean;
  overlayOffset: { x: number; y: number } | null;
}

export const IM_PARAM = "im";
export const IM_SEQ_PARAM = "im_seq";
export const IM_INVITE_PARAM = "im_invite";
export const IM_OPEN_EVENT = "oceanleo:im-open";
export const DOCK_WIDTH_KEY = "oceanleo:im:dock-width";
export const OVERLAY_OFFSET_KEY = "oceanleo:im:overlay-offset";
export const DOCK_MIN = 360;
export const DOCK_MAX = 720;
export const DOCK_DEFAULT = 420;
export const MOBILE_MAX_WIDTH = 767;

const CONVERSATION_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
const INVITE_CODE = /^[A-Za-z0-9]{6,32}$/;

export type ImDeepLink =
  | { kind: "none" }
  | { kind: "open"; target: MessagesTarget; inviteCode: string | null };

/** 解析 `?im=` / `?im_seq=` / `?im_invite=`。不认的值一律当没有（fail closed）。 */
export function parseImDeepLink(search: string): ImDeepLink {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search || "");
  } catch {
    return { kind: "none" };
  }
  const rawInvite = (params.get(IM_INVITE_PARAM) || "").trim();
  const inviteCode = INVITE_CODE.test(rawInvite) ? rawInvite : null;
  const raw = (params.get(IM_PARAM) || "").trim();
  const target: MessagesTarget = {};
  let valid = false;
  if (raw === "inbox") {
    target.view = "inbox";
    valid = true;
  } else if (raw === "bay") {
    target.view = "bay";
    valid = true;
  } else if (raw === "people") {
    target.view = "people";
    valid = true;
  } else if (raw && CONVERSATION_ID.test(raw)) {
    target.conversationId = raw;
    valid = true;
    const seqRaw = (params.get(IM_SEQ_PARAM) || "").trim();
    if (/^\d{1,15}$/.test(seqRaw)) target.seq = Number(seqRaw);
  }
  if (!valid && inviteCode) {
    target.view = "inbox";
    valid = true;
  }
  if (!valid) return { kind: "none" };
  return { kind: "open", target, inviteCode };
}

/** 把 target 写进（拷贝出来的）查询串；没有 im 的相关参数时全部清掉。 */
export function buildImSearch(
  currentSearch: string,
  next: { target: MessagesTarget; inviteCode?: string | null } | null,
): string {
  const params = new URLSearchParams(currentSearch || "");
  params.delete(IM_PARAM);
  params.delete(IM_SEQ_PARAM);
  params.delete(IM_INVITE_PARAM);
  if (next) {
    const { target } = next;
    if (target.conversationId) {
      params.set(IM_PARAM, target.conversationId);
      if (typeof target.seq === "number" && Number.isFinite(target.seq) && target.seq >= 0) {
        params.set(IM_SEQ_PARAM, String(Math.floor(target.seq)));
      }
    } else if (target.view === "people") {
      params.set(IM_PARAM, "people");
    } else {
      params.set(IM_PARAM, "inbox");
    }
    if (next.inviteCode) params.set(IM_INVITE_PARAM, next.inviteCode);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function clampDockWidth(value: number): number {
  if (!Number.isFinite(value)) return DOCK_DEFAULT;
  return Math.min(DOCK_MAX, Math.max(DOCK_MIN, Math.round(value)));
}

export function parseOverlayOffset(raw: string | null): { x: number; y: number } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = Number(value?.x);
    const y = Number(value?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
  } catch {
    return null;
  }
}

export interface HostEnv {
  getLocation(): { pathname: string; search: string; hash: string };
  history: {
    readonly state: unknown;
    pushState(state: unknown, title: string, url: string): void;
    replaceState(state: unknown, title: string, url: string): void;
    back(): void;
  };
  /** 订阅 window 事件，返回取消函数。 */
  on(type: string, handler: (event: any) => void): () => void;
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void } | null;
  viewportWidth(): number;
}

export interface HostState {
  getSnapshot(): MessagesHostSnapshot;
  subscribe(listener: () => void): () => void;
  open(target?: MessagesTarget): void;
  close(): void;
  setEnabled(enabled: boolean): void;
  setExpanded(expanded: boolean): void;
  setView(view: MessagesView): void;
  /** 记下收件箱当前的筛选（用户在列表里点了筛选）；只认白名单，不写地址栏。 */
  setFilter(filter: string): void;
  setDockWidth(width: number): void;
  setOverlayOffset(offset: { x: number; y: number } | null): void;
  /** 打开某会话（浮层内部切换；不新增历史记录）。 */
  showConversation(conversationId: string | null, seq?: number | null): void;
  clearInvite(): void;
  clearHighlight(): void;
  syncViewport(): void;
  /** 挂上 popstate 与 `oceanleo:im-open` 监听；返回卸载函数。 */
  attach(): () => void;
}

interface Internal {
  open: boolean;
  conversationId: string | null;
  view: MessagesView;
  filter: string;
  highlightSeq: number | null;
  inviteCode: string | null;
  expanded: boolean;
  narrow: boolean;
  dockWidth: number;
  enabled: boolean;
  overlayOffset: { x: number; y: number } | null;
}

function noopEnv(): HostEnv {
  return {
    getLocation: () => ({ pathname: "/", search: "", hash: "" }),
    history: { state: null, pushState() {}, replaceState() {}, back() {} },
    on: () => () => {},
    storage: null,
    viewportWidth: () => 1280,
  };
}

export function createHostState(env: HostEnv): HostState {
  const listeners = new Set<() => void>();

  const stored = (() => {
    try {
      const raw = env.storage?.getItem(DOCK_WIDTH_KEY);
      return raw ? clampDockWidth(Number(raw)) : DOCK_DEFAULT;
    } catch {
      return DOCK_DEFAULT;
    }
  })();

  const storedOffset = (() => {
    try {
      return parseOverlayOffset(env.storage?.getItem(OVERLAY_OFFSET_KEY) ?? null);
    } catch {
      return null;
    }
  })();

  let s: Internal = {
    open: false,
    conversationId: null,
    view: "inbox",
    filter: "all",
    highlightSeq: null,
    inviteCode: null,
    expanded: false,
    narrow: env.viewportWidth() <= MOBILE_MAX_WIDTH,
    dockWidth: stored,
    enabled: false,
    overlayOffset: storedOffset,
  };
  let snapshot: MessagesHostSnapshot = derive(s);

  function derive(v: Internal): MessagesHostSnapshot {
    return {
      open: v.open,
      layout: v.narrow ? "mobile" : v.expanded ? "full" : "docked",
      conversationId: v.conversationId,
      view: v.view,
      filter: v.filter,
      highlightSeq: v.highlightSeq,
      inviteCode: v.inviteCode,
      expanded: v.expanded,
      narrow: v.narrow,
      dockWidth: v.dockWidth,
      enabled: v.enabled,
      overlayOffset: v.overlayOffset,
    };
  }

  function commit(patch: Partial<Internal>): void {
    const next = { ...s, ...patch };
    const changed = (Object.keys(next) as (keyof Internal)[]).some((key) => next[key] !== s[key]);
    if (!changed) return;
    s = next;
    snapshot = derive(s);
    for (const listener of Array.from(listeners)) listener();
  }

  function urlFor(search: string): string {
    const loc = env.getLocation();
    return `${loc.pathname}${search}${loc.hash || ""}`;
  }

  function stripUrl(): void {
    const loc = env.getLocation();
    const search = buildImSearch(loc.search, null);
    if (search === loc.search) return;
    const prev = (env.history.state && typeof env.history.state === "object" ? env.history.state : {}) as Record<
      string,
      unknown
    >;
    const { imOverlay: _drop, ...rest } = prev;
    void _drop;
    try {
      env.history.replaceState(rest, "", urlFor(search));
    } catch {
      /* ignore */
    }
  }

  function open(target: MessagesTarget = {}): void {
    if (!s.enabled) return;
    const wasOpen = s.open;
    const conversationId = target.conversationId ?? null;
    const view: MessagesView = conversationId ? "inbox" : target.view ?? (wasOpen ? s.view : "inbox");
    commit({
      open: true,
      conversationId,
      view,
      filter: target.filter ?? (wasOpen ? s.filter : "all"),
      highlightSeq: conversationId && typeof target.seq === "number" ? target.seq : null,
      inviteCode: wasOpen ? s.inviteCode : null,
    });
    // 浮层不是页面：侧栏打开不写 ?im=inbox。地址栏只在进来时带着深链，applyLocation 消费后清掉。
  }

  function close(): void {
    if (!s.open) return;
    commit({ open: false, conversationId: null, highlightSeq: null, inviteCode: null, view: "inbox" });
    stripUrl();
  }

  function applyLocation(closeIfMissing = true): void {
    // 前进/后退以地址栏为准。深链只用来打开一次，随后从地址栏清掉，浮层不是路由。
    const loc = env.getLocation();
    const link = parseImDeepLink(loc.search);
    if (link.kind === "none") {
      if (s.open && closeIfMissing) {
        commit({ open: false, conversationId: null, highlightSeq: null, inviteCode: null, view: "inbox" });
      }
      return;
    }
    if (!s.enabled) return;
    commit({
      open: true,
      conversationId: link.target.conversationId ?? null,
      view: link.target.view ?? "inbox",
      highlightSeq: typeof link.target.seq === "number" ? link.target.seq : null,
      inviteCode: link.inviteCode,
    });
    stripUrl();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open,
    close,
    setEnabled(enabled) {
      if (enabled === s.enabled) return;
      commit({ enabled });
      if (enabled) applyLocation(false);
      else if (s.open) {
        commit({ open: false, conversationId: null, highlightSeq: null, inviteCode: null, view: "inbox" });
      }
    },
    setExpanded(expanded) {
      commit({ expanded });
    },
    setView(view) {
      if (!s.open) return;
      if (!MESSAGES_VIEWS.includes(view)) return;
      commit({ view, conversationId: view === "inbox" ? s.conversationId : null, highlightSeq: null });
    },
    setFilter(filter) {
      if (!INBOX_FILTER_IDS.includes(filter)) return;
      commit({ filter });
    },
    setDockWidth(width) {
      const next = clampDockWidth(width);
      commit({ dockWidth: next });
      try {
        env.storage?.setItem(DOCK_WIDTH_KEY, String(next));
      } catch {
        /* 隐私模式 */
      }
    },
    setOverlayOffset(offset) {
      const next =
        offset && Number.isFinite(offset.x) && Number.isFinite(offset.y)
          ? { x: Math.round(offset.x), y: Math.round(offset.y) }
          : null;
      commit({ overlayOffset: next });
      try {
        if (next) env.storage?.setItem(OVERLAY_OFFSET_KEY, JSON.stringify(next));
        else env.storage?.setItem(OVERLAY_OFFSET_KEY, "");
      } catch {
        /* 隐私模式 */
      }
    },
    showConversation(conversationId, seq = null) {
      if (!s.open) return;
      commit({
        conversationId,
        view: "inbox",
        highlightSeq: conversationId && typeof seq === "number" ? seq : null,
      });
    },
    clearInvite() {
      if (!s.inviteCode) return;
      commit({ inviteCode: null });
    },
    clearHighlight() {
      commit({ highlightSeq: null });
    },
    syncViewport() {
      commit({ narrow: env.viewportWidth() <= MOBILE_MAX_WIDTH });
    },
    attach() {
      const offPop = env.on("popstate", () => applyLocation(true));
      const offOpen = env.on(
        IM_OPEN_EVENT,
        (event: { detail?: { conversationId?: unknown; seq?: unknown; view?: unknown; filter?: unknown } }) => {
          const detail = event?.detail ?? {};
          const conversationId =
            typeof detail.conversationId === "string" && CONVERSATION_ID.test(detail.conversationId)
              ? detail.conversationId
              : undefined;
          const seq = typeof detail.seq === "number" && Number.isFinite(detail.seq) ? detail.seq : undefined;
          // view / filter 只认白名单，别的值忽略（退回默认），不会把任意字符串带进状态。
          const view =
            typeof detail.view === "string" && (MESSAGES_VIEWS as readonly string[]).includes(detail.view)
              ? (detail.view as MessagesView)
              : undefined;
          const filter =
            typeof detail.filter === "string" && (INBOX_FILTER_IDS as readonly string[]).includes(detail.filter)
              ? detail.filter
              : undefined;
          const target: MessagesTarget = {};
          if (conversationId) {
            target.conversationId = conversationId;
            if (seq !== undefined) target.seq = seq;
          } else if (view) {
            target.view = view;
          }
          if (filter) target.filter = filter;
          open(target);
        },
      );
      const offResize = env.on("resize", () => {
        commit({ narrow: env.viewportWidth() <= MOBILE_MAX_WIDTH });
      });
      applyLocation(false);
      return () => {
        offPop();
        offOpen();
        offResize();
      };
    },
  };
}

function browserEnv(): HostEnv {
  if (typeof window === "undefined") return noopEnv();
  return {
    getLocation: () => ({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    }),
    history: {
      get state() {
        return window.history.state;
      },
      pushState: (state, title, url) => window.history.pushState(state, title, url),
      replaceState: (state, title, url) => window.history.replaceState(state, title, url),
      back: () => window.history.back(),
    },
    on(type, handler) {
      window.addEventListener(type, handler);
      return () => window.removeEventListener(type, handler);
    },
    storage: (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })(),
    viewportWidth: () => window.innerWidth,
  };
}

let singleton: HostState | null = null;

/** 全局唯一的浮层状态。服务端渲染时是一个永远关闭的空壳。 */
export function hostState(): HostState {
  if (!singleton) singleton = createHostState(browserEnv());
  return singleton;
}

const SERVER_SNAPSHOT: MessagesHostSnapshot = {
  open: false,
  layout: "docked",
  conversationId: null,
  view: "inbox",
  filter: "all",
  highlightSeq: null,
  inviteCode: null,
  expanded: false,
  narrow: false,
  dockWidth: DOCK_DEFAULT,
  enabled: false,
  overlayOffset: null,
};

export function openMessages(target?: MessagesTarget): void {
  hostState().open(target);
}

export function closeMessages(): void {
  hostState().close();
}

export function useMessagesHost(): MessagesHostSnapshot {
  const host = hostState();
  return useSyncExternalStore(host.subscribe, host.getSnapshot, () => SERVER_SNAPSHOT);
}
