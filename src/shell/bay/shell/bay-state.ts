// Bay 的界面状态（oceanleo-bay 契约 §4.2）：目标栈、返回、站点、任务上下文、浮窗请求、登录请求。
// 模块加载时不碰 window；浏览器能力都在调用时才取，服务端渲染拿到的是空状态。
//
// LeoBay 是一张页（各站 `/bay`），不在 LeoChat 小窗里。
// openBay：在 `/bay` 页上（BayPage 已挂载）→ 换页内详情并写 `?bay=`；在别的页面上 → 记下目标并跳到 `/bay?bay=<目标>`。
import { useSyncExternalStore } from "react";
import {
  currentDomainFamily,
  currentDomainProfile,
  currentFamilySubsiteOrigin,
} from "../../../contracts/domain-family";
import { isLeoDevPreviewHost } from "../../../lib/auth/config";
import { AUTH_STATE_EVENT, accessToken, cachedAccessToken } from "../../../lib/auth/client";
import { hostState } from "../../messages/host-state";
import { BAY_FEED_KINDS, BAY_KIND_PARAM, bayHrefWith, buildBaySearch, isBayCategorySlug, isBaySiteKey, parseBayDeepLink, sameBayTarget } from "./bay-links";

export type BayLayout = "docked" | "full" | "mobile" | "page";

export type BayMineTab = "needs" | "proposals" | "services" | "orders" | "help";

export type BayFeedFilter = {
  /** `material` = 官方素材货架（不走信息流接口，由页面自己画）。 */
  kind?: "all" | "material" | "demand" | "service" | "help" | "consult";
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

let lastDirection: "forward" | "back" = "forward";

/** 最近一次切换是往前推还是返回（窄浮窗的滑入方向用）。 */
export function bayLastNavDirection(): "forward" | "back" {
  return lastDirection;
}

/** 改目标栈；返回是否真的往前推了一层（用来决定 push 还是 replace 地址）。 */
function navigate(target: BayTarget): boolean {
  if (target.kind === "feed") {
    const filter = target.filter ? normalizeFilter(target.filter) : store.filter;
    if (store.stack.length) lastDirection = "back";
    commit({ filter: sameBayTarget({ kind: "feed", filter }, { kind: "feed", filter: store.filter }) ? store.filter : filter, stack: [] });
    return false;
  }
  const top = store.stack[store.stack.length - 1];
  if (top && sameBayTarget(top, target)) return false;
  lastDirection = "forward";
  commit({ stack: [...store.stack, target].slice(-MAX_STACK) });
  return true;
}

function applyPageTarget(target: BayTarget | null): void {
  if (target?.kind === "conversation") {
    // 旧链接 `?bay=conversation:<id>`：会话在 LeoChat 小窗里开，页面停在信息流。
    openBayConversation(target.threadId);
    stripBayParam();
    return;
  }
  if (!target || target.kind === "feed") {
    if (store.stack.length) {
      lastDirection = "back";
      commit({ stack: [] });
    }
    return;
  }
  const below = store.stack[store.stack.length - 2];
  if (below && sameBayTarget(below, target)) {
    lastDirection = "back";
    commit({ stack: store.stack.slice(0, -1) });
    return;
  }
  const top = store.stack[store.stack.length - 1];
  if (top && sameBayTarget(top, target)) return;
  lastDirection = "forward";
  commit({ stack: [target] });
}

// ---- 从别的页面去 LeoBay ---------------------------------------------------------

let bayNavigator: ((href: string) => void) | null = null;

/** 外壳把站内跳转（next/navigation 的 router.push）交进来；没交时退回整页跳转。 */
export function setBayNavigator(navigate: ((href: string) => void) | null): void {
  bayNavigator = navigate;
}

/** 当前目标与筛选对应的 `/bay` 地址（站内相对地址）。 */
export function bayPageHrefNow(): string {
  const params = new URLSearchParams(buildBaySearch("", view.canGoBack ? view.current : null));
  const kind = store.filter.kind;
  if (kind && kind !== "all") params.set(BAY_KIND_PARAM, kind);
  const text = params.toString().replace(/%3A/gi, ":");
  return text ? `/bay?${text}` : "/bay";
}

function goToBayPage(): void {
  const w = win();
  if (!w) return;
  const href = bayPageHrefNow();
  if (bayNavigator) {
    bayNavigator(href);
    return;
  }
  try {
    w.location.assign(href);
  } catch {
    /* 沙箱里不让跳：目标已经记下，用户自己进 /bay 时还在 */
  }
}

// ---- 交易会话：在 LeoChat 小窗里开 -------------------------------------------------

let pendingConversation: string | null = null;
let hostOff: (() => void) | null = null;

/** 打开一条交易会话：LeoChat 小窗停在那条会话上。小窗还没就绪（登录态是懒加载的）就等它可用时再开。 */
export function openBayConversation(threadId: string): void {
  if (!win() || !threadId) return;
  let host: ReturnType<typeof hostState>;
  try {
    host = hostState();
  } catch {
    return;
  }
  const conversationId = `talent:${threadId}`;
  if (host.getSnapshot().enabled) {
    host.open({ conversationId });
    return;
  }
  pendingConversation = conversationId;
  if (hostOff) return;
  hostOff = host.subscribe(() => {
    if (!pendingConversation || !host.getSnapshot().enabled) return;
    const next = pendingConversation;
    pendingConversation = null;
    host.open({ conversationId: next });
  });
}

export function openBay(target: BayTarget = { kind: "feed" }): void {
  if (target.kind === "conversation") {
    openBayConversation(target.threadId);
    return;
  }
  const advanced = navigate(target);
  if (onBayPage()) {
    writePageUrl(view.canGoBack ? view.current : null, advanced ? "push" : "replace");
    return;
  }
  if (!bayEnabledHere()) return;
  goToBayPage();
}

/** 换掉当前这一层详情，不新增返回层（「我的」里切分区用）；停在信息流时等同 openBay。 */
export function replaceBay(target: BayTarget): void {
  if (!store.stack.length || target.kind === "feed") {
    openBay(target);
    return;
  }
  const top = store.stack[store.stack.length - 1];
  if (top && sameBayTarget(top, target)) return;
  commit({ stack: [...store.stack.slice(0, -1), target] });
  if (onBayPage()) writePageUrl(target, "replace");
}

export function bayBack(): void {
  if (!store.stack.length) return;
  lastDirection = "back";
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

const SERVER_VIEW: BayView = { current: { kind: "feed" }, canGoBack: false };

export function useBayState(): { current: BayTarget; canGoBack: boolean } {
  return useSyncExternalStore(subscribe, () => view, () => SERVER_VIEW);
}

export function useBayHasDetail(): boolean {
  return useSyncExternalStore(subscribe, () => store.stack.length > 0, () => false);
}

/** 当前页面是不是 `/bay` 页本身（BayPage 已挂载）。 */
export function useBayPageMounted(): boolean {
  return useSyncExternalStore(subscribe, () => store.pageCount > 0, () => false);
}

export function useBayFilter(): BayFeedFilter {
  return useSyncExternalStore(subscribe, () => store.filter, () => store.filter);
}

/** 只改信息流筛选，不动详情栈（左栏里点种类、类目、搜索用）。 */
export function setBayFilter(filter: BayFeedFilter): void {
  const next = normalizeFilter(filter);
  if (sameBayTarget({ kind: "feed", filter: next }, { kind: "feed", filter: store.filter })) return;
  commit({ filter: next });
  if (onBayPage()) writePageKind(next.kind);
}

/** 把当前种类写进 `/bay` 页的地址（`?kind=material`），刷新或把链接发给别人时停在同一栏。 */
function writePageKind(kind: BayFeedFilter["kind"]): void {
  const w = win();
  if (!w) return;
  const params = new URLSearchParams(w.location.search);
  if (kind && kind !== "all") params.set(BAY_KIND_PARAM, kind);
  else params.delete(BAY_KIND_PARAM);
  const text = params.toString().replace(/%3A/gi, ":");
  const next = `${w.location.pathname}${text ? `?${text}` : ""}${w.location.hash || ""}`;
  if (next === `${w.location.pathname}${w.location.search}${w.location.hash || ""}`) return;
  try {
    w.history.replaceState(historyState(), "", next);
  } catch {
    /* ignore */
  }
}

function readPageKind(search: string): BayFeedFilter["kind"] | null {
  const raw = new URLSearchParams(search || "").get(BAY_KIND_PARAM);
  return raw && (BAY_FEED_KINDS as readonly string[]).includes(raw) ? (raw as BayFeedFilter["kind"]) : null;
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

function subscribeNever(): () => void {
  return () => {};
}

/** 响应式版本：服务端与水合首帧为 false，避免境内外判断不一致造成水合错位。 */
export function useBayEnabled(): boolean {
  return useSyncExternalStore(subscribeNever, bayEnabledHere, () => false);
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

function pageHrefHost(): { hostname: string; origin: string } | null {
  const w = win();
  if (!w) return null;
  try {
    const loc = w.location;
    const hostname = String(loc?.hostname || loc?.host || "")
      .trim()
      .toLowerCase();
    const origin = String(loc?.origin || "").trim();
    if (!hostname || !origin) return null;
    return { hostname, origin };
  } catch {
    return null;
  }
}

/** LeoDev 槽：跨站也停在当前页 origin。正式宿主返回 null，仍按家族子站拼。 */
function leoDevStayOrigin(): string | null {
  const page = pageHrefHost();
  if (!page) return null;
  let originHost = "";
  try {
    originHost = new URL(page.origin).hostname;
  } catch {
    return null;
  }
  if (!isLeoDevPreviewHost(page.hostname) || !isLeoDevPreviewHost(originHost)) return null;
  return page.origin.replace(/\/+$/, "");
}

/** 那个站的 `/bay?bay=…` 绝对地址；当前家族没有那个子站时落到同家族门户。 */
export function bayHrefOnSite(siteKey: string, target: BayTarget): string {
  let portalOrigin = "https://oceanleo.com";
  try {
    portalOrigin = currentDomainProfile().portalOrigin;
  } catch {
    /* 用缺省家族 */
  }
  return bayHrefWith(siteKey, target, {
    portalOrigin,
    subsiteOrigin: (label) => currentFamilySubsiteOrigin(label),
    stayOnOrigin: leoDevStayOrigin(),
  });
}

// ---- /bay 页与深链 -----------------------------------------------------------------

let pageOff: (() => void) | null = null;

/**
 * 在 `/bay` 页上点了一个仍然指向本页的链接（侧栏的「LeoBay」、别处的 `/bay?bay=…`）：
 * 站内跳转只换地址、不重挂页面，所以这里按链接带的目标换页内详情；没带目标就回信息流。
 */
function onSamePageLinkClick(event: MouseEvent): void {
  const w = win();
  if (!w || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const origin = event.target as { closest?: (selector: string) => Element | null } | null;
  const anchor = origin && typeof origin.closest === "function" ? origin.closest("a[href]") : null;
  if (!anchor || anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) return;
  let url: URL;
  try {
    url = new URL(anchor.getAttribute("href") || "", w.location.href);
  } catch {
    return;
  }
  if (url.origin !== w.location.origin || url.pathname !== w.location.pathname) return;
  const kind = readPageKind(url.search);
  if (kind && kind !== store.filter.kind) commit({ filter: normalizeFilter({ ...store.filter, kind }) });
  applyPageTarget(parseBayDeepLink(url.search));
}

/** BayPage 挂载时调；返回卸载函数。页上 `?bay=` 驱动页内详情，前进/后退跟着走。 */
export function registerBayPage(): () => void {
  const w = win();
  commit({ pageCount: store.pageCount + 1 });
  if (w && store.pageCount === 1) {
    const applyKind = () => {
      const kind = readPageKind(w.location.search);
      if (kind && kind !== store.filter.kind) commit({ filter: normalizeFilter({ ...store.filter, kind }) });
    };
    applyKind();
    applyPageTarget(parseBayDeepLink(w.location.search));
    const onPop = () => {
      applyKind();
      applyPageTarget(parseBayDeepLink(w.location.search));
    };
    w.addEventListener("popstate", onPop);
    const doc = w.document;
    doc?.addEventListener("click", onSamePageLinkClick, true);
    pageOff = () => {
      w.removeEventListener("popstate", onPop);
      doc?.removeEventListener("click", onSamePageLinkClick, true);
    };
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
  if (onBayPage() || /\/bay\/?$/.test(w.location.pathname)) return;
  const target = parseBayDeepLink(w.location.search);
  if (!target) return;
  stripBayParam();
  if (!bayEnabledHere()) return;
  if (target.kind === "conversation") {
    openBayConversation(target.threadId);
    return;
  }
  navigate(target);
  goToBayPage();
}

/**
 * 别的页面带 `?bay=`（旧通知、旧链接）→ 跳到 `/bay` 页的那个目标，并从原地址清掉。
 * LeoChat 图标挂它（每个页面都有那个图标）；引用计数，只挂一份监听。
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

/** @deprecated LeoBay 不再有浮窗；留着这个空函数是为了设置窗等旧调用方不用同步改。 */
export function closeBayOverlay(): void {}
