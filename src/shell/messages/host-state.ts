// 消息浮层的开合状态（work-chat 契约 §8.3）。纯 TS：不碰 DOM 全局，浏览器能力经 HostEnv 注入，
// 所以 tests/im-host-state.test.mjs 能用假的 history/location 跑真实实现。
//
// 关掉浮层时记住栏目和会话（`oceanleo:leochat:last`）；再开或刷新后停在原处。放大 / 还原也记住（`oceanleo:leochat:expanded`）。
// LeoBay 是一张独立的页（`/bay`），不在小窗里。
//
// LeoChat 能在三处显示：左下角图标开的小窗（window）、各站 `/leochat` 整页（page）、对话页右侧栏里的那一块（panel）。
// 一次只显示一处，三处共用这一份状态（栏目、会话、筛选）：
//   - 整页 / 右侧栏挂上时 `claimSurface()` 认领；认领期间 `open` 恒为真、`surface` 是认领的那一处（整页压过右侧栏），小窗不画。
//   - `close()` 只关小窗；`toggleWindow()` 是左下角图标专用（整页在场不动；右侧栏在场 → 接过来开小窗）。
//   - 最后一处认领释放后 LeoChat 收起，小窗不会自己弹回来。
//
// 深链：任何站 `?im=<会话 id>`（可带 `&im_seq=<seq>`）、`?im=inbox`、`?im=people`、`?im_invite=<code>`。
// 浮层不是路由：侧栏打开不写 `?im=`。带着深链进来时 applyLocation 打开一次，随后 replaceState 清掉。
// 切页由外壳 closeMessages，不把 `?im=` 带到下一页。
import { useSyncExternalStore } from "react";

export type MessagesView = "inbox" | "people";
export const MESSAGES_VIEWS: readonly MessagesView[] = ["inbox", "people"];
/** 收件箱筛选的合法值；与 `lib/im/inbox-api.ts` 的 `INBOX_FILTERS` 相同（测试里对拍，host-state 保持纯、不引入鉴权依赖）。 */
export const INBOX_FILTER_IDS: readonly string[] = ["all", "unread", "mentions", "dm", "group", "team", "project", "talent"];
export type MessagesLayoutKind = "docked" | "full" | "mobile";
/** LeoChat 现在归哪一处显示。没有认领时是小窗。 */
export type MessagesSurface = "window" | "page" | "panel";

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
  /** `open` 为真时 LeoChat 显示在哪一处；小窗只在这里是 `"window"` 时画。 */
  surface: MessagesSurface;
}

export const IM_PARAM = "im";
export const IM_SEQ_PARAM = "im_seq";
export const IM_INVITE_PARAM = "im_invite";
export const IM_OPEN_EVENT = "oceanleo:im-open";
export const DOCK_WIDTH_KEY = "oceanleo:im:dock-width";
export const OVERLAY_OFFSET_KEY = "oceanleo:im:overlay-offset";
export const LAST_VIEW_KEY = "oceanleo:leochat:last";
export const EXPANDED_KEY = "oceanleo:leochat:expanded";
export const DOCK_MIN = 360;
export const DOCK_MAX = 720;
export const DOCK_DEFAULT = 420;
export const MOBILE_MAX_WIDTH = 767;

const CONVERSATION_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
const INVITE_CODE = /^[A-Za-z0-9]{6,32}$/;

export type ImDeepLink =
  | { kind: "none" }
  | { kind: "open"; target: MessagesTarget; inviteCode: string | null };

/** `?im=` 里已经不再认的栏目名。它们长得像会话 id，所以要点名排除。 */
const RETIRED_IM_VALUES: ReadonlySet<string> = new Set(["bay"]);

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
  } else if (raw === "people") {
    target.view = "people";
    valid = true;
  } else if (RETIRED_IM_VALUES.has(raw)) {
    // 旧链接里曾经是栏目名的值（小窗里有过 LeoBay 栏）：当没有——不能把它当成会话 id 去开。
    valid = false;
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
  /**
   * 整页（`"page"`）或右侧栏里的那一块（`"panel"`）显示出来时认领 LeoChat；返回释放函数（重复调用只算一次）。
   * `onEvicted`：这一处被别处接走时调一次（左下角图标把它换成小窗、又来了一个新的右侧栏认领）。被接走之后再释放是空操作。
   */
  claimSurface(surface: "page" | "panel", onEvicted?: () => void): () => void;
  /** 左下角图标：整页在场 → 不动；右侧栏那一处在场 → 接过来开小窗；否则开 / 关小窗。 */
  toggleWindow(): void;
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
  surface: MessagesSurface;
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

  const storedLast = (() => {
    try {
      const raw = env.storage?.getItem(LAST_VIEW_KEY);
      if (!raw) return { view: "inbox" as MessagesView, conversationId: null as string | null };
      const value = JSON.parse(raw) as { view?: unknown; conversationId?: unknown };
      const view =
        typeof value?.view === "string" && (MESSAGES_VIEWS as readonly string[]).includes(value.view)
          ? (value.view as MessagesView)
          : "inbox";
      const conversationId = typeof value?.conversationId === "string" ? value.conversationId : null;
      return { view, conversationId };
    } catch {
      return { view: "inbox" as MessagesView, conversationId: null as string | null };
    }
  })();

  const storedExpanded = (() => {
    try {
      return env.storage?.getItem(EXPANDED_KEY) === "1";
    } catch {
      return false;
    }
  })();

  let s: Internal = {
    open: false,
    conversationId: storedLast.conversationId,
    view: storedLast.view,
    filter: "all",
    highlightSeq: null,
    inviteCode: null,
    expanded: storedExpanded,
    narrow: env.viewportWidth() <= MOBILE_MAX_WIDTH,
    dockWidth: stored,
    enabled: false,
    overlayOffset: storedOffset,
    surface: "window",
  };
  let snapshot: MessagesHostSnapshot = derive(s);

  // 认领：整页按个数记（切页时新旧两页可能短暂并存），右侧栏只认最后来的那一个。
  let pageClaims = 0;
  let panelClaim: { token: object; onEvicted?: () => void } | null = null;

  function claimedSurface(): "page" | "panel" | null {
    if (pageClaims > 0) return "page";
    return panelClaim ? "panel" : null;
  }

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
      surface: v.surface,
    };
  }

  /** 认领变了之后把 `open` / `surface` 对齐：有认领且可用 → 显示在那一处；最后一处释放 → 收起。 */
  function syncClaim(wasClaimed: boolean): void {
    const claimed = claimedSurface();
    if (claimed) {
      commit(s.enabled ? { open: true, surface: claimed } : { surface: claimed });
      return;
    }
    if (!wasClaimed) return;
    commit({ open: false, surface: "window", highlightSeq: null, inviteCode: null });
  }

  function persistLast(view: MessagesView, conversationId: string | null): void {
    try {
      env.storage?.setItem(LAST_VIEW_KEY, JSON.stringify({ view, conversationId }));
    } catch {
      /* 隐私模式 */
    }
  }

  function commit(patch: Partial<Internal>): void {
    const next = { ...s, ...patch };
    const changed = (Object.keys(next) as (keyof Internal)[]).some((key) => next[key] !== s[key]);
    if (!changed) return;
    const lastChanged = next.view !== s.view || next.conversationId !== s.conversationId;
    s = next;
    snapshot = derive(s);
    if (lastChanged) persistLast(s.view, s.conversationId);
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

  function resolveOpen(target: MessagesTarget): { view: MessagesView; conversationId: string | null } {
    if (target.conversationId) return { view: "inbox", conversationId: target.conversationId };
    if (target.view) return { view: target.view, conversationId: s.conversationId };
    return { view: s.view, conversationId: s.conversationId };
  }

  function open(target: MessagesTarget = {}): void {
    if (!s.enabled) return;
    const resolved = resolveOpen(target);
    const wasOpen = s.open;
    commit({
      open: true,
      // 整页 / 右侧栏认领着时，「打开某栏 / 某会话」就落在那一处，不另开小窗。
      surface: claimedSurface() ?? "window",
      conversationId: resolved.conversationId,
      view: resolved.view,
      filter: target.filter ?? s.filter,
      highlightSeq: resolved.conversationId && typeof target.seq === "number" ? target.seq : null,
      inviteCode: wasOpen ? s.inviteCode : null,
    });
    // 浮层不是页面：侧栏打开不写 ?im=inbox。地址栏只在进来时带着深链，applyLocation 消费后清掉。
  }

  function close(): void {
    // 只关小窗：整页和右侧栏那一处不归「关闭」管（切页时外壳照旧调 close，不能把它们收掉）。
    if (!s.open || s.surface !== "window") return;
    commit({ open: false, highlightSeq: null, inviteCode: null });
    stripUrl();
  }

  function applyLocation(closeIfMissing = true): void {
    // 前进/后退以地址栏为准。深链只用来打开一次，随后从地址栏清掉，浮层不是路由。
    const loc = env.getLocation();
    const link = parseImDeepLink(loc.search);
    if (link.kind === "none") {
      if (s.open && s.surface === "window" && closeIfMissing) {
        commit({ open: false, highlightSeq: null, inviteCode: null });
      }
      return;
    }
    if (!s.enabled) return;
    commit({
      open: true,
      surface: claimedSurface() ?? "window",
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
      if (enabled) {
        applyLocation(false);
        // 认领比「可用」先到（登录态是懒加载的）：这时把它补显示出来。
        const claimed = claimedSurface();
        if (claimed) commit({ open: true, surface: claimed });
      } else if (s.open) {
        commit({ open: false, highlightSeq: null, inviteCode: null });
      }
    },
    setExpanded(expanded) {
      commit({ expanded });
      try {
        env.storage?.setItem(EXPANDED_KEY, expanded ? "1" : "0");
      } catch {
        /* 隐私模式：只是不记住 */
      }
    },
    setView(view) {
      if (!s.open) return;
      if (!MESSAGES_VIEWS.includes(view)) return;
      commit({ view });
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
    claimSurface(surface, onEvicted) {
      const wasClaimed = claimedSurface() !== null;
      const token = {};
      // 被顶掉的那一个右侧栏认领；它的回调放到状态对齐之后再调（回调里可能又来读状态）。
      let displaced: { token: object; onEvicted?: () => void } | null = null;
      if (surface === "page") {
        pageClaims += 1;
      } else {
        displaced = panelClaim;
        panelClaim = { token, onEvicted };
      }
      syncClaim(wasClaimed);
      displaced?.onEvicted?.();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (surface === "page") {
          pageClaims = Math.max(0, pageClaims - 1);
        } else {
          // 已经被接走（左下角图标开了小窗、或来了新的认领）：这时释放不能再动状态。
          if (panelClaim?.token !== token) return;
          panelClaim = null;
        }
        syncClaim(true);
      };
    },
    toggleWindow() {
      if (!s.enabled) return;
      if (pageClaims > 0) return;
      if (panelClaim) {
        const claim = panelClaim;
        panelClaim = null;
        commit({ open: true, surface: "window" });
        claim.onEvicted?.();
        return;
      }
      if (s.open) close();
      else open();
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
  surface: "window",
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
