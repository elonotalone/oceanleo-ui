// Bay 的界面状态（oceanleo-bay 契约 §4.2）：目标栈、返回、站点、任务上下文、浮窗请求、登录请求。
// 模块加载时不碰 window；浏览器能力都在调用时才取，服务端渲染拿到的是空状态。
//
// openBay：在 `/bay` 页上（BayPage 已挂载）→ 换页内详情并写 `?bay=`；否则记下目标，派发
// `oceanleo:im-open`（detail.view = "bay"）让 Messages 浮窗切到 Bay 视图；未登录时由 BayGuestHost 接住。
import { useSyncExternalStore } from "react";
import {
  currentDomainFamily,
  currentDomainProfile,
  currentFamilySubsiteOrigin,
} from "../../../contracts/domain-family";
import { AUTH_STATE_EVENT, accessToken, cachedAccessToken } from "../../../lib/auth/client";
import { IM_OPEN_EVENT, hostState } from "../../messages/host-state";
import { BAY_FEED_KINDS, bayHrefWith, buildBaySearch, isBayCategorySlug, isBaySiteKey, isBayPath, parseBayDeepLink, sameBayTarget } from "./bay-links";

export type BayLayout = "docked" | "full" | "mobile" | "page";

export type BayMineTab = "needs" | "proposals" | "services" | "orders" | "help";

export type BayFeedFilter = {
  kind?: "all" | "demand" | "service" | "help" | "consult";
  category?: string;
  q?: string;
};

export type BayTarget =
  | { kind: "feed"; filter?: BayFeedFilter }
  | { kind: "demand"; id: string }
  | { kind: "service"; id: string }
  | { kind: "help"; id: string }
  | { kind: "consult"; id: string }
  | { kind: "profile"; handle: string }
  | { kind: "order"; id: string }
  | { kind: "conversation"; threadId: string }
  | { kind: "post-need"; category?: string }
  | { kind: "call-human"; category?: string }
  | { kind: "propose"; demandId: string }
  | { kind: "checkout"; serviceId: string; tier?: string }
  | { kind: "service-editor"; serviceId?: string }
  | { kind: "mine"; tab: BayMineTab }
  | { kind: "settings"; pane?: "profile" | "vetting" | "money" };

export interface BayPaneProps {
  target: BayTarget;
  layout: BayLayout;
  siteKey: string;
}

export interface BayTaskContext {
  taskId: string;
  messages: unknown[];
}

interface BayStore {
  filter: BayFeedFilter;
  /** 信息流之上的详情目标；空 = 停在信息流。 */
  stack: BayTarget[];
  siteKey: string;
  task: BayTaskContext | null;
  /** 有人要求打开 Bay 浮窗（BayGuestHost 据此开合）。 */
  overlayOpen: boolean;
  loginRequested: boolean;
  pageCount: number;
}

const MAX_STACK = 20;
const DEFAULT_SITE = "oceanleo";

let store: BayStore = {
  filter: { kind: "all" },
  stack: [],
  siteKey: DEFAULT_SITE,
  task: null,
  overlayOpen: false,
  loginRequested: false,
  pageCount: 0,
};
const listeners = new Set<() => void>();

interface BayView {
  current: BayTarget;
  canGoBack: boolean;
}
let view: BayView = deriveView(store);

function deriveView(s: BayStore): BayView {
  const top = s.stack[s.stack.length - 1];
  return { current: top ?? { kind: "feed", filter: s.filter }, canGoBack: s.stack.length > 0 };
}

function commit(patch: Partial<BayStore>): void {
  const next = { ...store, ...patch };
  const changed = (Object.keys(next) as (keyof BayStore)[]).some((key) => next[key] !== store[key]);
  if (!changed) return;
  const viewChanged = next.stack !== store.stack || next.filter !== store.filter;
  store = next;
  if (viewChanged) view = deriveView(store);
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function win(): Window | null {
  return typeof window === "undefined" ? null : window;
}

// ---- 浏览器地址（只在 /bay 页上写） -------------------------------------------------

function historyState(): Record<string, unknown> {
  const w = win();
  const state = w?.history.state;
  return state && typeof state === "object" ? { ...(state as Record<string, unknown>) } : {};
}

function writePageUrl(target: BayTarget | null, mode: "push" | "replace"): void {
  const w = win();
  if (!w) return;
  const search = buildBaySearch(w.location.search, target);
  if (search === w.location.search) return;
  const url = `${w.location.pathname}${search}${w.location.hash || ""}`;
  const prev = historyState();
  const depth = typeof prev.bayDepth === "number" ? prev.bayDepth : 0;
  try {
    if (mode === "push") w.history.pushState({ ...prev, bayDepth: depth + 1 }, "", url);
    else w.history.replaceState(prev, "", url);
  } catch {
    /* 沙箱里不让改历史：页内照常切换，只是没有深链 */
  }
}

function stripBayParam(): void {
  const w = win();
  if (!w) return;
  const search = buildBaySearch(w.location.search, null);
  if (search === w.location.search) return;
  try {
    w.history.replaceState(historyState(), "", `${w.location.pathname}${search}${w.location.hash || ""}`);
  } catch {
    /* ignore */
  }
}

function onBayPage(): boolean {
  return store.pageCount > 0;
}

// ---- 目标栈 -------------------------------------------------------------------

function normalizeFilter(filter: BayFeedFilter | undefined): BayFeedFilter {
  const out: BayFeedFilter = { kind: "all" };
  if (!filter) return out;
  if (filter.kind && BAY_FEED_KINDS.includes(filter.kind)) out.kind = filter.kind;
  if (isBayCategorySlug(filter.category)) out.category = filter.category;
  const q = typeof filter.q === "string" ? filter.q.trim().slice(0, 60) : "";
  if (q) out.q = q;
  return out;
}

/** 改目标栈；返回是否真的往前推了一层（用来决定 push 还是 replace 地址）。 */
function navigate(target: BayTarget): boolean {
  if (target.kind === "feed") {
    const filter = target.filter ? normalizeFilter(target.filter) : store.filter;
    commit({ filter: sameBayTarget({ kind: "feed", filter }, { kind: "feed", filter: store.filter }) ? store.filter : filter, stack: [] });
    return false;
  }
  const top = store.stack[store.stack.length - 1];
  if (top && sameBayTarget(top, target)) return false;
  commit({ stack: [...store.stack, target].slice(-MAX_STACK) });
  return true;
}

function applyPageTarget(target: BayTarget | null): void {
  if (!target || target.kind === "feed") {
    if (store.stack.length) commit({ stack: [] });
    return;
  }
  const below = store.stack[store.stack.length - 2];
  if (below && sameBayTarget(below, target)) {
    commit({ stack: store.stack.slice(0, -1) });
    return;
  }
  const top = store.stack[store.stack.length - 1];
  if (top && sameBayTarget(top, target)) return;
  commit({ stack: [target] });
}

// ---- 浮窗请求 -------------------------------------------------------------------

let pendingImOpen = false;
let hostWatch: (() => void) | null = null;
let hostWasOpen = false;

function watchHost(): void {
  if (hostWatch || !win()) return;
  let host: ReturnType<typeof hostState>;
  try {
    host = hostState();
  } catch {
    return;
  }
  hostWasOpen = host.getSnapshot().open;
  hostWatch = host.subscribe(() => {
    const snap = host.getSnapshot();
    if (snap.enabled && pendingImOpen) {
      pendingImOpen = false;
      dispatchImOpen();
    }
    if (hostWasOpen && !snap.open) commit({ overlayOpen: false });
    hostWasOpen = snap.open;
  });
}

function dispatchImOpen(): void {
  const w = win();
  if (!w) return;
  try {
    w.dispatchEvent(new CustomEvent(IM_OPEN_EVENT, { detail: { view: "bay" } }));
  } catch {
    /* 没有 CustomEvent 的环境 */
  }
}

function requestOverlay(): void {
  commit({ overlayOpen: true });
  watchHost();
  let enabled = false;
  try {
    enabled = hostState().getSnapshot().enabled;
  } catch {
    enabled = false;
  }
  // 浮窗还没就绪（登录态在内存里是懒加载的）：等它可用时再派发一次。
  pendingImOpen = !enabled;
  dispatchImOpen();
}

export function openBay(target: BayTarget = { kind: "feed" }): void {
  const advanced = navigate(target);
  if (onBayPage()) {
    writePageUrl(view.canGoBack ? view.current : null, advanced ? "push" : "replace");
    return;
  }
  if (!bayEnabledHere()) return;
  requestOverlay();
}

export function bayBack(): void {
  if (!store.stack.length) return;
  if (onBayPage()) {
    const w = win();
    const depth = historyState().bayDepth;
    if (w && typeof depth === "number" && depth > 0) {
      try {
        w.history.back();
        return;
      } catch {
        /* 落到下面的就地返回 */
      }
    }
    commit({ stack: store.stack.slice(0, -1) });
    writePageUrl(view.canGoBack ? view.current : null, "replace");
    return;
  }
  commit({ stack: store.stack.slice(0, -1) });
}

/** BayGuestHost 的关闭键；已登录时关闭由 Messages 浮窗负责。 */
export function closeBayOverlay(): void {
  pendingImOpen = false;
  commit({ overlayOpen: false });
}

export function useBayOverlayOpen(): boolean {
  return useSyncExternalStore(subscribe, () => store.overlayOpen, () => false);
}

const SERVER_VIEW: BayView = { current: { kind: "feed" }, canGoBack: false };

export function useBayState(): { current: BayTarget; canGoBack: boolean } {
  return useSyncExternalStore(subscribe, () => view, () => SERVER_VIEW);
}

export function useBayHasDetail(): boolean {
  return useSyncExternalStore(subscribe, () => store.stack.length > 0, () => false);
}

export function useBayFilter(): BayFeedFilter {
  return useSyncExternalStore(subscribe, () => store.filter, () => store.filter);
}

/** 只改信息流筛选，不动详情栈（左栏里点种类、类目、搜索用）。 */
export function setBayFilter(filter: BayFeedFilter): void {
  const next = normalizeFilter(filter);
  if (sameBayTarget({ kind: "feed", filter: next }, { kind: "feed", filter: store.filter })) return;
  commit({ filter: next });
}

export function bayStateSnapshot(): { current: BayTarget; canGoBack: boolean } {
  return view;
}

// ---- 站点与任务上下文 -------------------------------------------------------------

export function useBaySiteKey(): string {
  return useSyncExternalStore(subscribe, () => store.siteKey, () => DEFAULT_SITE);
}

export function setBaySiteKey(siteKey: string): void {
  const key = typeof siteKey === "string" ? siteKey.trim().toLowerCase() : "";
  commit({ siteKey: isBaySiteKey(key) ? key : DEFAULT_SITE });
}

export function setBayTaskContext(ctx: BayTaskContext | null): void {
  if (!ctx || typeof ctx.taskId !== "string" || !ctx.taskId) {
    commit({ task: null });
    return;
  }
  const current = store.task;
  if (current && current.taskId === ctx.taskId && current.messages === ctx.messages) return;
  commit({ task: { taskId: ctx.taskId, messages: Array.isArray(ctx.messages) ? ctx.messages : [] } });
}

export function useBayTaskContext(): BayTaskContext | null {
  return useSyncExternalStore(subscribe, () => store.task, () => null);
}

// ---- 境内、登录 -------------------------------------------------------------------

/** 境内（域名家族 cn）为 false；不看登录（未登录也能逛 Bay）。 */
export function bayEnabledHere(): boolean {
  try {
    return currentDomainFamily() !== "cn";
  } catch {
    return false;
  }
}

const authListeners = new Set<() => void>();
let authInstalled = false;
let authPrimed = false;

function notifyAuth(): void {
  for (const listener of Array.from(authListeners)) listener();
}

function signedInNow(): boolean {
  try {
    return Boolean(cachedAccessToken());
  } catch {
    return false;
  }
}

function primeAuth(): void {
  if (authPrimed) return;
  authPrimed = true;
  void accessToken().then(
    () => notifyAuth(),
    () => {
      authPrimed = false;
    },
  );
}

function subscribeAuth(listener: () => void): () => void {
  authListeners.add(listener);
  const w = win();
  if (!authInstalled && w) {
    authInstalled = true;
    w.addEventListener(AUTH_STATE_EVENT, () => {
      if (signedInNow() && store.loginRequested) commit({ loginRequested: false });
      notifyAuth();
    });
  }
  primeAuth();
  return () => {
    authListeners.delete(listener);
  };
}

/** 响应式登录态：服务端与水合首帧为 false。 */
export function useBaySignedIn(): boolean {
  return useSyncExternalStore(subscribeAuth, signedInNow, () => false);
}

/** 未登录 → 弹现有登录框并返回 false；已登录返回 true。 */
export function requireBayLogin(): boolean {
  if (signedInNow()) return true;
  commit({ loginRequested: true });
  void accessToken()
    .then((token) => {
      if (!token) return;
      commit({ loginRequested: false });
      notifyAuth();
    })
    .catch(() => {});
  return false;
}

export function dismissBayLogin(): void {
  commit({ loginRequested: false });
}

export function useBayLoginRequested(): boolean {
  return useSyncExternalStore(subscribe, () => store.loginRequested, () => false);
}

// ---- 跨站地址 -------------------------------------------------------------------

/** 那个站的 `/bay?bay=…` 绝对地址；当前家族没有那个子站时落到同家族门户。 */
export function bayHrefOnSite(siteKey: string, target: BayTarget): string {
  let portalOrigin = "https://oceanleo.com";
  try {
    portalOrigin = currentDomainProfile().portalOrigin;
  } catch {
    /* 用缺省家族 */
  }
  return bayHrefWith(siteKey, target, { portalOrigin, subsiteOrigin: (label) => currentFamilySubsiteOrigin(label) });
}

// ---- /bay 页与深链 -----------------------------------------------------------------

let pageOff: (() => void) | null = null;

/** BayPage 挂载时调；返回卸载函数。页上 `?bay=` 驱动页内详情，前进/后退跟着走。 */
export function registerBayPage(): () => void {
  const w = win();
  commit({ pageCount: store.pageCount + 1 });
  if (w && store.pageCount === 1) {
    applyPageTarget(parseBayDeepLink(w.location.search));
    const onPop = () => applyPageTarget(parseBayDeepLink(w.location.search));
    w.addEventListener("popstate", onPop);
    pageOff = () => w.removeEventListener("popstate", onPop);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    commit({ pageCount: Math.max(0, store.pageCount - 1) });
    if (store.pageCount === 0) {
      pageOff?.();
      pageOff = null;
    }
  };
}

let linkRefs = 0;
let linkOff: (() => void) | null = null;

function consumeDeepLink(): void {
  const w = win();
  if (!w) return;
  // `/bay` 页自己读 `?bay=`（registerBayPage）；这里只管别的页面。
  if (isBayPath(w.location.pathname) || onBayPage()) return;
  const target = parseBayDeepLink(w.location.search);
  if (!target) return;
  stripBayParam();
  if (!bayEnabledHere()) return;
  navigate(target);
  requestOverlay();
}

/**
 * 任何页面带 `?bay=` → 打开浮窗的 Bay 视图到那个目标，并从地址栏清掉（浮窗不是路由）。
 * Bay 图标、叫真人按钮、BayGuestHost 都挂它；引用计数，只挂一份监听。
 */
export function attachBayDeepLinks(): () => void {
  const w = win();
  if (!w) return () => {};
  linkRefs += 1;
  if (linkRefs === 1) {
    consumeDeepLink();
    const onPop = () => consumeDeepLink();
    w.addEventListener("popstate", onPop);
    linkOff = () => w.removeEventListener("popstate", onPop);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    linkRefs = Math.max(0, linkRefs - 1);
    if (linkRefs === 0) {
      linkOff?.();
      linkOff = null;
    }
  };
}
