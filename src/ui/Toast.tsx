"use client";

// ============================================================================
// @oceanleo/ui — 第一方 toast 原语（W05，2026-08-31）
// ----------------------------------------------------------------------------
// 为什么是第一方而不是引一个库：门户那套 toaster 在本包里只是 optional peer，
// 31 个租户站不一定装（依赖纪律见 `src/pages/AuthDialog.tsx:29`）。共享包里不许
// 出现任何第三方 toast 库的名字，所以队列、合并、停留、暂停全部自己实现，零依赖。
//
// 与门户共存靠 `../lib/toast-bridge`：宿主注册了自己的 toaster，本 viewport 就
// 整个让位（`hasToastHost()` 时返回 null），避免右下角一摞、宿主位置又一摞。
// 无论谁渲染，**时序都由本文件的 store 说了算**——这才是「31 个站与门户行为
// 一致」的意思。
//
// store 是模块级单例而不是 useState：队列与暂停要能脱离 React 单独推演，
// 也因为调用方散落在 627 个文件里，没有一个可靠的公共祖先。
// ============================================================================

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useUI } from "../i18n/ui/useUI";
import {
  currentToastHost,
  hasToastHost,
  subscribeToastHost,
  type ToastKind,
  type ToastPayload,
} from "../lib/toast-bridge";
import { runAfterOverlayExit } from "../shell/anchored-popover";

/** 同时最多可见几条，超出的排队。第 4 条要等前面让出位置。 */
export const TOAST_MAX_VISIBLE = 3;

/**
 * 停留时长（ms），`0` = 不自动消失。
 *
 * 这四个数是**产品语义**（读完一句话要多久），不是动效时长，所以刻意**不**从
 * `--leo-dur-*` 取——红线 9 管的是 transition 的时长与曲线，不是「一句话该在
 * 屏幕上待多久」。
 *
 * - `success` 4s：一句「已保存」，扫一眼就够。
 * - `info` 6s：信息类往往比成功提示长，给足读完的时间。
 * - `error` 0：**错误不自动消失**，用户要有时间读，也要能复制错误文案。
 *   因此错误那一条**必须**有关闭键，否则没法关。
 * - `loading` 0：长任务的中间态，由调用方 `.success()` / `.error()` 结束。
 */
export const TOAST_DWELL: Readonly<Record<ToastKind, number>> = {
  success: 4_000,
  info: 6_000,
  error: 0,
  loading: 0,
};

export interface ToastEntry extends ToastPayload {
  /** 已经开始退场：还在 DOM 里播完动效，但不再计时、不再接管计数。 */
  leaving: boolean;
}

export interface ToastInput {
  title: string;
  description?: string;
  kind?: ToastKind;
  /** 不传则由 kind+文案自动生成 ⇒ 同内容自动合并计数，连点保存不会叠 5 条。 */
  id?: string;
  /** 覆盖 `TOAST_DWELL[kind]`。`0` = 不自动消失。 */
  dwell?: number;
}

/** `show()` 的返回值：让 `loading` 能原地翻成终态，而不是再弹一条。 */
export interface ToastHandle {
  readonly id: string;
  success(title: string, description?: string): ToastHandle;
  error(title: string, description?: string): ToastHandle;
  info(title: string, description?: string): ToastHandle;
  loading(title: string, description?: string): ToastHandle;
  dismiss(): void;
}

export interface ToastApi {
  show(input: ToastInput): ToastHandle;
  success(title: string, description?: string): ToastHandle;
  error(title: string, description?: string): ToastHandle;
  info(title: string, description?: string): ToastHandle;
  loading(title: string, description?: string): ToastHandle;
  dismiss(id: string): void;
  dismissAll(): void;
}

// ── store ───────────────────────────────────────────────────────────────────

const NO_ENTRIES: readonly ToastEntry[] = [];

let entries: readonly ToastEntry[] = NO_ENTRIES;
let dwellByKind: Record<ToastKind, number> = { ...TOAST_DWELL };
let paused = false;
/** 正在真的渲染第一方 viewport 的实例数。0 = 没人渲染，退场动效无从谈起。 */
let liveViewports = 0;
let warnedNoViewport = false;

const subscribers = new Set<() => void>();

/**
 * 计时记账。`remaining` 是**还欠多少毫秒**，不是绝对到期时刻：
 * 暂停时把已经跑掉的那段扣掉并清掉 handle，恢复时按余额重新排一次。
 * 只有「可见 && 未退场 && dwell>0 && 未暂停」的那几条才真的持有 handle。
 */
interface DwellTimer {
  remaining: number;
  startedAt: number;
  handle: ReturnType<typeof setTimeout> | undefined;
}

const timers = new Map<string, DwellTimer>();

function emit(): void {
  for (const listener of [...subscribers]) listener();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function snapshot(): readonly ToastEntry[] {
  return entries;
}

function serverSnapshot(): readonly ToastEntry[] {
  return NO_ENTRIES;
}

function hostInactive(): boolean {
  return false;
}

/** 每次变更后统一收口计时器，避免十几处各自 setTimeout / clearTimeout。 */
function syncTimers(): void {
  const live = new Set(entries.map((entry) => entry.id));
  for (const [id, timer] of [...timers]) {
    if (live.has(id)) continue;
    if (timer.handle !== undefined) clearTimeout(timer.handle);
    timers.delete(id);
  }
  entries.forEach((entry, index) => {
    let timer = timers.get(entry.id);
    if (!timer) {
      timer = { remaining: entry.dwell, startedAt: 0, handle: undefined };
      timers.set(entry.id, timer);
    }
    const shouldRun =
      index < TOAST_MAX_VISIBLE &&
      !entry.leaving &&
      entry.dwell > 0 &&
      !paused;
    if (shouldRun) {
      if (timer.handle !== undefined) return;
      const record = timer;
      record.startedAt = Date.now();
      record.handle = setTimeout(() => {
        record.handle = undefined;
        dismiss(entry.id);
      }, Math.max(0, record.remaining));
      return;
    }
    if (timer.handle === undefined) return;
    clearTimeout(timer.handle);
    timer.handle = undefined;
    timer.remaining = Math.max(
      0,
      timer.remaining - (Date.now() - timer.startedAt),
    );
  });
}

function commit(next: readonly ToastEntry[]): void {
  entries = next;
  syncTimers();
  emit();
}

/** 合并命中或原地转终态时，倒计时从头开始——否则新内容会秒消失。 */
function restartTimer(id: string, dwell: number): void {
  const timer = timers.get(id);
  if (!timer) return;
  if (timer.handle !== undefined) clearTimeout(timer.handle);
  timer.handle = undefined;
  timer.remaining = dwell;
  timer.startedAt = 0;
}

function autoId(
  kind: ToastKind,
  title: string,
  description: string | undefined,
): string {
  return `auto:${kind}:${title}\u0000${description ?? ""}`;
}

function payloadOf(entry: ToastEntry): ToastPayload {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    description: entry.description,
    dwell: entry.dwell,
    count: entry.count,
  };
}

function warnIfNowhereToRender(): void {
  if (warnedNoViewport || liveViewports > 0 || hasToastHost()) return;
  warnedNoViewport = true;
  const env =
    typeof process === "undefined" ? undefined : process.env?.NODE_ENV;
  if (env === "production") return;
  // 静默丢弃是最难查的一类 bug：调用方以为提示弹了，用户什么也没看见。
  console.warn(
    "[@oceanleo/ui] toast 已入队，但没有任何 <ToastProvider> / <ToastViewport> 在渲染它。" +
      "请在应用外壳挂一次，或由宿主 registerToastHost()。",
  );
}

function show(input: ToastInput): ToastHandle {
  const kind = input.kind ?? "info";
  const id = input.id ?? autoId(kind, input.title, input.description);
  const dwell = input.dwell ?? dwellByKind[kind];
  const existing = entries.find((entry) => entry.id === id);
  if (existing) {
    // 命中已存在的 id：计数 +1、字段更新、计时重置；**正在退场的复活**
    // （_COMMON.md §3「可打断：动效播放中能被新意图接管」）。
    const merged: ToastEntry = {
      ...existing,
      kind,
      title: input.title,
      description: input.description,
      dwell,
      count: existing.count + 1,
      leaving: false,
    };
    restartTimer(id, dwell);
    commit(entries.map((entry) => (entry.id === id ? merged : entry)));
    currentToastHost()?.update(payloadOf(merged));
    return handleFor(id);
  }
  const created: ToastEntry = {
    id,
    kind,
    title: input.title,
    description: input.description,
    dwell,
    count: 1,
    leaving: false,
  };
  timers.delete(id);
  commit([...entries, created]);
  currentToastHost()?.show(payloadOf(created));
  warnIfNowhereToRender();
  return handleFor(id);
}

/**
 * `loading` 原地转终态：**沿用同一个 id**，所以是同一个 DOM 节点翻面，
 * 不是旧的消失 + 新的弹出。计数**不**加一——这不是重复，是同一件事有了结果。
 */
function settle(
  id: string,
  kind: ToastKind,
  title: string,
  description: string | undefined,
): void {
  const existing = entries.find((entry) => entry.id === id);
  if (!existing) {
    show({ id, kind, title, description });
    return;
  }
  const dwell = dwellByKind[kind];
  const next: ToastEntry = {
    ...existing,
    kind,
    title,
    description,
    dwell,
    leaving: false,
  };
  restartTimer(id, dwell);
  commit(entries.map((entry) => (entry.id === id ? next : entry)));
  currentToastHost()?.update(payloadOf(next));
}

/**
 * 打退场标记。真正从队列里摘掉由 `ToastItem` 在过渡跑完后调 `remove()`，
 * 这样那一条能就地播完动效，后面排队的也才在正确的时刻补位。
 *
 * 没有第一方 viewport 在渲染时（宿主接管、或压根没挂 provider）没有过渡可等,
 * 直接摘——否则条目会永远挂在 store 里。
 */
function dismiss(id: string): void {
  const existing = entries.find((entry) => entry.id === id);
  if (!existing) return;
  currentToastHost()?.dismiss(id);
  if (liveViewports === 0) {
    remove(id);
    return;
  }
  if (existing.leaving) return;
  commit(
    entries.map((entry) =>
      entry.id === id ? { ...entry, leaving: true } : entry,
    ),
  );
}

function remove(id: string): void {
  const timer = timers.get(id);
  if (timer?.handle !== undefined) clearTimeout(timer.handle);
  timers.delete(id);
  if (!entries.some((entry) => entry.id === id)) return;
  commit(entries.filter((entry) => entry.id !== id));
}

function dismissAll(): void {
  for (const entry of [...entries]) dismiss(entry.id);
}

/**
 * 暂停**整摞**，不是被 hover 的那一条。
 * 只停一条是错的：光标停在第一条上时，它下面那两条会在眼皮底下消失。
 */
function setPaused(next: boolean): void {
  if (paused === next) return;
  paused = next;
  syncTimers();
}

function handleFor(id: string): ToastHandle {
  const handle: ToastHandle = {
    id,
    success(title, description) {
      settle(id, "success", title, description);
      return handle;
    },
    error(title, description) {
      settle(id, "error", title, description);
      return handle;
    },
    info(title, description) {
      settle(id, "info", title, description);
      return handle;
    },
    loading(title, description) {
      settle(id, "loading", title, description);
      return handle;
    },
    dismiss() {
      dismiss(id);
    },
  };
  return handle;
}

const toastApi: ToastApi = {
  show,
  success: (title, description) => show({ kind: "success", title, description }),
  error: (title, description) => show({ kind: "error", title, description }),
  info: (title, description) => show({ kind: "info", title, description }),
  loading: (title, description) => show({ kind: "loading", title, description }),
  dismiss,
  dismissAll,
};

/**
 * 拿 toast API。**不需要 context**：store 是模块级的，31 个站的树形状各不相同，
 * 强求一个公共 provider 只会让深处的组件拿不到。`ToastProvider` 负责的是
 * 「谁来渲染」与「停留时长覆盖」，不是「谁能调用」。
 */
export function useToast(): ToastApi {
  return toastApi;
}

/** 仅供测试：清空队列、计时器与时长覆盖。产品代码不该调用。 */
export function resetToastStoreForTests(): void {
  for (const timer of timers.values()) {
    if (timer.handle !== undefined) clearTimeout(timer.handle);
  }
  timers.clear();
  entries = NO_ENTRIES;
  dwellByKind = { ...TOAST_DWELL };
  paused = false;
  warnedNoViewport = false;
  emit();
}

// ── 动效词汇 ────────────────────────────────────────────────────────────────

const TOAST_STYLE_ID = "leo-toast-motion";

/**
 * toast 自己的进出场词汇。为什么不复用 `.leo-overlay-panel`：那一套是缩放淡入，
 * 给弹层与对话框用；toast 该从屏幕下缘升起（§3「有来源」），而 motion-system
 * 没有缩放 token，硬套就得写裸值。
 *
 * 层级（§3「同层同档，跨层差一档」）：入场 `--leo-dur-3`，退场 `--leo-dur-2`
 * ——退场比入场快一档，人不需要等一条已经读完的提示慢慢挪走。
 *
 * **刻意不写 fallback 裸值**（本波裁定 A-2）：写 `var(--leo-dur-3)` 而不是
 * `var(--leo-dur-3, <裸时长>)`。token 缺席时整条 transition 声明失效 ⇒ 退化成
 * 「无过渡」，而不是在仓里种下第二套时长（红线 9）。
 *
 * `--leo-safe-*` 是**例外，要写 fallback**：它定义在 `src/shell/phone-shell.css`
 * 的 `:root` 上，门户钉的是已发布版本、未必载入那份 CSS。它不是动效 token，
 * A-2 不适用；缺了会让整条 `calc()` 失效，toast 的位置会直接崩掉。
 */
export const LEO_TOAST_MOTION_CSS = `
.leo-toast-viewport {
  position: fixed;
  right: calc(1rem + var(--leo-safe-right, 0px));
  bottom: calc(1rem + var(--leo-safe-bottom, 0px));
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: min(24rem, calc(100vw - 2rem));
  pointer-events: none;
}
.leo-toast-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}
.leo-toast {
  pointer-events: auto;
  transition:
    opacity var(--leo-dur-3) var(--leo-ease-decelerate),
    transform var(--leo-dur-3) var(--leo-ease-decelerate);
}
.leo-toast[data-leo-toast-state="leaving"] {
  opacity: 0;
  transform: translateY(var(--leo-move-md));
  transition:
    opacity var(--leo-dur-2) var(--leo-ease-accelerate),
    transform var(--leo-dur-2) var(--leo-ease-accelerate);
}
.leo-toast-close {
  transition:
    background-color var(--leo-dur-2) var(--leo-ease-standard),
    color var(--leo-dur-2) var(--leo-ease-standard);
}
@starting-style {
  .leo-toast[data-leo-toast-state="visible"] {
    opacity: 0;
    transform: translateY(var(--leo-move-md));
  }
}
@media (prefers-reduced-motion: reduce) {
  .leo-toast,
  .leo-toast-close {
    transition: none;
  }
}
.leo-toast-viewport[data-leo-reduced-motion="true"] .leo-toast,
.leo-toast-viewport[data-leo-reduced-motion="true"] .leo-toast-close {
  transition: none;
}
`;

/**
 * 挂进文档，每份文档只挂一次。写在这里而不是 `src/theme/globals.css`：
 * `@starting-style` 是 at-rule，行内 style 表达不了，而 globals.css 是 W01 的
 * 独占面。注入让 31 个站与门户拿到同一份规则，不依赖调用方引没引主题产物。
 */
export function ensureToastMotionStyles(doc?: Document): void {
  const target = doc ?? (typeof document === "undefined" ? null : document);
  if (!target || target.getElementById(TOAST_STYLE_ID)) return;
  const style = target.createElement("style");
  style.id = TOAST_STYLE_ID;
  style.textContent = LEO_TOAST_MOTION_CSS;
  (target.head || target.documentElement).append(style);
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

const KIND_ICON_CLASS: Record<ToastKind, string> = {
  success: "text-emerald-600",
  error: "text-red-600",
  info: "text-sky-600",
  loading: "text-neutral-400",
};

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === "loading") {
    return <span className="v-spinner text-[11px]" aria-hidden="true" />;
  }
  const path =
    kind === "success"
      ? "M5 13l4 4L19 7"
      : kind === "error"
        ? "M6 6l12 12M18 6L6 18"
        : "M12 8h.01M11 12h1v4h1";
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ToastItem({ entry }: { entry: ToastEntry }) {
  const tt = useUI();
  const nodeRef = useRef<HTMLLIElement>(null);
  const isError = entry.kind === "error";

  // 退场收尾复用 `runAfterOverlayExit`（`../shell/anchored-popover`）：它已经把
  // 三件事做对了——多属性 transitionend 要等齐、实测时长 1.5 倍超时兜底、
  // 零时长（reduced-motion 或 token 缺席）下一拍直接收。返回值就是取消函数，
  // 所以「退场途中被新意图复活」时 effect 清理会把移除撤掉。
  useEffect(() => {
    if (!entry.leaving) return;
    return runAfterOverlayExit(nodeRef.current, () => remove(entry.id));
  }, [entry.id, entry.leaving]);

  return (
    <li
      ref={nodeRef}
      className="leo-toast flex items-start gap-2.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 shadow-lg"
      data-leo-toast-state={entry.leaving ? "leaving" : "visible"}
      data-leo-toast-kind={entry.kind}
      data-leo-toast-id={entry.id}
      // 错误自己带 assertive：它不自动消失，也值得打断屏幕阅读器当前的朗读。
      // 其余走容器那条 polite，不打断用户正在听的内容。
      role={isError ? "alert" : undefined}
      aria-live={isError ? "assertive" : undefined}
    >
      <span className={`mt-0.5 shrink-0 ${KIND_ICON_CLASS[entry.kind]}`}>
        <ToastIcon kind={entry.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-snug text-neutral-900">
          {tt(entry.title)}
          {entry.count > 1 && (
            <span
              data-leo-toast-count={entry.count}
              className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-normal tabular-nums text-neutral-500"
            >
              ×{entry.count}
            </span>
          )}
        </p>
        {entry.description && (
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
            {tt(entry.description)}
          </p>
        )}
      </div>
      <button
        type="button"
        data-leo-toast-close
        onClick={() => dismiss(entry.id)}
        aria-label={tt("关闭提示")}
        className="leo-toast-close -mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

/**
 * 那一摞。挂一次即可（应用外壳），不要每页挂一个。
 *
 * 容器**空着也要渲染**：`aria-live` 只会播报「已存在的活动区域内部」的变化，
 * 等有 toast 了才把容器插进 DOM，屏幕阅读器什么也不会念。
 */
export function ToastViewport() {
  const visibleEntries = useSyncExternalStore(
    subscribe,
    snapshot,
    serverSnapshot,
  );
  const hostActive = useSyncExternalStore(
    subscribeToastHost,
    hasToastHost,
    hostInactive,
  );
  const [reducedMotion, setReducedMotion] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hostActive) return;
    ensureToastMotionStyles();
    liveViewports += 1;
    syncTimers();
    return () => {
      liveViewports = Math.max(0, liveViewports - 1);
    };
  }, [hostActive]);

  // CSS 的 `@media (prefers-reduced-motion)` 已经把过渡归零了，这里再读一次
  // matchMedia 打成属性，是因为 **jsdom 不跑媒体查询**——没有这个属性，
  // 「reduced-motion 下无动画」就只能靠肉眼看，测不出来。
  // motion-system §规范二第 5 条已为 spring 原语开过「原语自己读 matchMedia」的先例。
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  // 原生监听而不是 React 合成事件：`mouseenter` / `focusin` 语义直白，
  // 且暂停是 store 级副作用，不需要走 React 的一轮渲染。
  useEffect(() => {
    const node = viewportRef.current;
    if (hostActive || !node) return;
    let hovering = false;
    let focused = false;
    const sync = () => setPaused(hovering || focused);
    const onEnter = () => {
      hovering = true;
      sync();
    };
    const onLeave = () => {
      hovering = false;
      sync();
    };
    const onFocusIn = () => {
      focused = true;
      sync();
    };
    const onFocusOut = () => {
      focused = false;
      sync();
    };
    node.addEventListener("mouseenter", onEnter);
    node.addEventListener("mouseleave", onLeave);
    node.addEventListener("focusin", onFocusIn);
    node.addEventListener("focusout", onFocusOut);
    return () => {
      node.removeEventListener("mouseenter", onEnter);
      node.removeEventListener("mouseleave", onLeave);
      node.removeEventListener("focusin", onFocusIn);
      node.removeEventListener("focusout", onFocusOut);
      setPaused(false);
    };
  }, [hostActive]);

  // 宿主接管时整个让位，避免两摞并存。桥是单例，宿主可能比本组件后挂载，
  // 所以订阅的是「接管 / 交还」这个事件，而不是只在挂载时读一次。
  if (hostActive) return null;

  return (
    <div
      ref={viewportRef}
      className="leo-toast-viewport"
      data-leo-toast-viewport
      data-leo-reduced-motion={reducedMotion ? "true" : undefined}
      role="status"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <ol className="leo-toast-list">
        {visibleEntries.slice(0, TOAST_MAX_VISIBLE).map((entry) => (
          <ToastItem key={entry.id} entry={entry} />
        ))}
      </ol>
    </div>
  );
}

/**
 * 应用外壳挂这一个就够：渲染 children，并在末尾挂那一摞。
 *
 * `durations` 存在的理由是测试：真实计时器 + 几十毫秒的停留，比
 * fake timers 跟 `act()` 缠斗可靠得多。产品代码不要传。
 */
export function ToastProvider({
  children,
  durations,
}: {
  children?: React.ReactNode;
  durations?: Partial<Record<ToastKind, number>>;
}) {
  const [applied, setApplied] = useState(false);
  const serialized = JSON.stringify(durations ?? null);

  useEffect(() => {
    dwellByKind = { ...TOAST_DWELL, ...(durations ?? {}) };
    setApplied(true);
    return () => {
      dwellByKind = { ...TOAST_DWELL };
    };
    // 依赖走序列化后的值：调用方几乎都会传字面量对象，按引用比会每帧重置一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);
  void applied;

  return (
    <>
      {children}
      <ToastViewport />
    </>
  );
}
