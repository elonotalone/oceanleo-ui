"use client";

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type AriaRole,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  pluginWorkbenchStyle,
  usePluginTheme,
  usePluginThemePortal,
} from "./plugin-theme";

export interface AnchoredPopoverRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface AnchoredPopoverViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AnchoredPopoverPosition {
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
  placement: "above" | "below";
}

export interface AnchoredPopoverPositionOptions {
  align?: "start" | "center" | "end";
  gap?: number;
  margin?: number;
  maxHeight?: number;
}

export type AnchoredPopoverCloseReason = "escape" | "outside";

const DEFAULT_GAP = 6;
const DEFAULT_MARGIN = 8;
const DEFAULT_FOCUS_SELECTOR =
  '[autofocus]:not(:disabled), [aria-selected="true"]:not([aria-disabled="true"]):not(:disabled), [role="menuitem"]:not([aria-disabled="true"]):not(:disabled), [role="option"]:not([aria-disabled="true"]):not(:disabled), button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';

const AnchoredPopoverLineageContext = createContext<readonly string[]>([]);
const openPopoverStack: string[] = [];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, Math.max(minimum, maximum)));
}

/**
 * 弹层进出场的全部词汇，`docs/architecture/motion-system.md` §规范三。
 *
 * 用平台原生能力，不是延迟卸载状态机：元素留在 DOM 里，`data-leo-overlay-state`
 * 翻面，`transition-behavior: allow-discrete` 让浏览器把 `display` 的离散变化
 * 推迟到过渡结束——退场期间元素因此还在，不需要 JS 计时器去卡卸载时机。
 *
 * 时长曲线一律取 `--leo-` token（§规范一）。**刻意不写 fallback 裸值**：
 * token 缺席时整条 `transition` 声明无效被丢弃，弹层退回今天的瞬时显示——
 * 不劣化，也不会在仓里种下第二套时长（红线 9）。
 *
 * 层级（§规范一「同层同档，跨层差一档」）：弹层与遮罩淡出走 `--leo-dur-3`，
 * 对话框面板高一档走 `--leo-dur-4`。遮罩的 `display` 用面板那一档，
 * 否则外层先消失会把里层的退场剪断。
 *
 * 状态用 `data-` 属性而不是 `[hidden]` 驱动：`[hidden]` 只有 (0,1,0) 特异度，
 * 会被组件自己带的 Tailwind `flex` / `grid` 这类同级 display 类盖掉。
 */
export const LEO_OVERLAY_MOTION_CSS = `
.leo-overlay {
  transition:
    opacity var(--leo-dur-3) var(--leo-ease-decelerate),
    transform var(--leo-dur-3) var(--leo-ease-decelerate),
    display var(--leo-dur-3) allow-discrete,
    overlay var(--leo-dur-3) allow-discrete;
}
.leo-overlay-scrim {
  transition:
    opacity var(--leo-dur-3) var(--leo-ease-decelerate),
    display var(--leo-dur-4) allow-discrete,
    overlay var(--leo-dur-4) allow-discrete;
}
.leo-overlay-panel {
  transition:
    opacity var(--leo-dur-4) var(--leo-ease-decelerate),
    transform var(--leo-dur-4) var(--leo-ease-decelerate);
}
.leo-overlay[data-leo-overlay-state="closed"],
.leo-overlay-panel[data-leo-overlay-state="closed"] {
  opacity: 0;
  transform: scale(0.96);
  transition-timing-function: var(--leo-ease-accelerate);
}
.leo-overlay[data-leo-overlay-state="closed"],
.leo-overlay-scrim[data-leo-overlay-state="closed"] {
  display: none;
}
.leo-overlay-scrim[data-leo-overlay-state="closed"] {
  opacity: 0;
  transition-timing-function: var(--leo-ease-accelerate);
}
@starting-style {
  .leo-overlay[data-leo-overlay-state="open"],
  .leo-overlay-panel[data-leo-overlay-state="open"] {
    opacity: 0;
    transform: scale(0.96);
  }
  .leo-overlay-scrim[data-leo-overlay-state="open"] {
    opacity: 0;
  }
}
`;

const OVERLAY_MOTION_STYLE_ID = "leo-overlay-motion";

/**
 * 把上面那段词汇挂进文档，每份文档只挂一次。
 *
 * 为什么在组件里注入而不是写进 `src/theme/globals.css`：`@starting-style` 是
 * at-rule，行内 style 表达不了；而 globals.css 是 `W01` 的独占面。注入让 31 个
 * 站与门户拿到同一份规则，且不依赖调用方是否引了主题产物。
 */
export function ensureOverlayMotionStyles(doc?: Document): void {
  const target = doc ?? (typeof document === "undefined" ? null : document);
  if (!target || target.getElementById(OVERLAY_MOTION_STYLE_ID)) return;
  const style = target.createElement("style");
  style.id = OVERLAY_MOTION_STYLE_ID;
  style.textContent = LEO_OVERLAY_MOTION_CSS;
  (target.head || target.documentElement).append(style);
}

/**
 * 动效的来源：弹层从触发它的那个按钮长出来，不是从中间淡入。
 *
 * 原点取「锚点中心的横坐标」与「贴着锚点的那条边」，都换算成面板自身坐标系里的
 * 像素——几何是 `computeAnchoredPopoverPosition` 已经算过的，这里只是把它读出来。
 */
export function computeAnchoredPopoverTransformOrigin(
  anchor: Pick<AnchoredPopoverRect, "left" | "width">,
  position: Pick<AnchoredPopoverPosition, "left" | "placement">,
  panel: Pick<AnchoredPopoverRect, "width" | "height">,
): string {
  const anchorCenterX = anchor.left + anchor.width / 2;
  const x = clamp(anchorCenterX - position.left, 0, panel.width);
  const y = position.placement === "below" ? 0 : panel.height;
  return `${Math.round(x)}px ${Math.round(y)}px`;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Tab 循环。`src/ui/index.tsx` 的 `Modal` 里那一份实现搬到这里共用，
 * 弹层与对话框从此是同一套语义，不会各修各的。
 *
 * 返回是否已经接管了这次按键，调用方据此决定要不要继续往下传。
 */
export function trapTabWithin(
  container: HTMLElement | null,
  event: Pick<KeyboardEvent, "key" | "shiftKey"> & { preventDefault(): void },
): boolean {
  if (event.key !== "Tab" || !container) return false;
  const focusable = [
    ...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ].filter((element) => !element.hasAttribute("disabled"));
  if (!focusable.length) return false;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = container.ownerDocument.activeElement;
  const inside = active instanceof Node && container.contains(active);
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

let scrollLockDepth = 0;
let releaseScrollLock: (() => void) | null = null;

/**
 * 锁滚动，并在最后一层解锁时把滚动位置**精确**放回去。
 *
 * 只写 `overflow: hidden` 在 iOS Safari 上不生效（页面照样橡皮筋滚动），
 * 而一旦改用 `position: fixed` 就必须自己记住并还原像素位置，否则关闭弹层的人
 * 会被扔回文档顶部。
 *
 * 计数是必需的：嵌套弹层、对话框套弹层都会同时持锁，先关的那个不能把锁拆了。
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  scrollLockDepth += 1;
  if (scrollLockDepth === 1) {
    const { body } = document;
    const view = body.ownerDocument.defaultView;
    const scrollX = view?.scrollX ?? 0;
    const scrollY = view?.scrollY ?? 0;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };
    body.style.position = "fixed";
    body.style.top = `${-scrollY}px`;
    body.style.left = `${-scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "contain";
    releaseScrollLock = () => {
      Object.assign(body.style, previous);
      view?.scrollTo(scrollX, scrollY);
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLockDepth -= 1;
    if (scrollLockDepth > 0) return;
    releaseScrollLock?.();
    releaseScrollLock = null;
  };
}

/** 兜底时长相对实测过渡时长的倍率。是比值，不是又一个裸时长。 */
const OVERLAY_EXIT_TIMEOUT_FACTOR = 1.5;
/** 离散过渡不一定跑（`overlay` 只对顶层元素生效），不能拿它们当收尾信号。 */
const DISCRETE_TRANSITION_PROPERTIES = new Set(["display", "overlay"]);

export function parseCssTimeMs(value: string): number {
  const text = value.trim();
  if (!text) return 0;
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount)) return 0;
  return text.endsWith("ms") ? amount : amount * 1000;
}

/** 元素身上最长的那条过渡要跑多久（含 delay）。读的是计算值，不是写死的数。 */
export function overlayTransitionBudgetMs(element: Element | null): number {
  const view = element?.ownerDocument?.defaultView;
  if (!element || !view) return 0;
  const style = view.getComputedStyle(element);
  const delays = style.transitionDelay.split(",");
  let longest = 0;
  style.transitionDuration.split(",").forEach((duration, index) => {
    const total =
      parseCssTimeMs(duration) +
      parseCssTimeMs(delays[index % delays.length] ?? "");
    if (total > longest) longest = total;
  });
  return longest;
}

/**
 * 等这个元素的退场过渡跑完再回调。
 *
 * 三件事一起做：
 * - **防抖**：一条 `transition` 上每个属性各触发一次 `transitionend`，
 *   要等到全部报到才算完，不能被最短的那条提前收走；
 * - **超时兜底**：元素被 `display: none` 或过渡压根没生效时
 *   `transitionend` 不会来，用实测时长的 1.5 倍兜住；
 * - **零时长直接收**：reduced-motion 与 token 缺席都会让预算为 0，下一拍就回调。
 *
 * 返回取消函数：调用方卸载时用它拆监听，回调不会再来。
 */
export function runAfterOverlayExit(
  element: HTMLElement | null,
  done: () => void,
): () => void {
  const view = element?.ownerDocument?.defaultView;
  const budget = overlayTransitionBudgetMs(element);
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Set<string>();
  const cleanup = () => {
    if (timer !== undefined) clearTimeout(timer);
    element?.removeEventListener("transitionend", onTransitionEnd);
    element?.removeEventListener("transitioncancel", onTransitionEnd);
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    cleanup();
    done();
  };
  function onTransitionEnd(event: TransitionEvent) {
    if (event.target !== element) return;
    pending.delete(event.propertyName);
    if (!pending.size) finish();
  }
  if (!element || !view || budget <= 0) {
    timer = setTimeout(finish, 0);
    return () => {
      if (settled) return;
      settled = true;
      cleanup();
    };
  }
  for (const name of view
    .getComputedStyle(element)
    .transitionProperty.split(",")) {
    const property = name.trim();
    // `all` 枚举不出具体属性名，报到集合就永远清不空——那种情况交给超时兜底。
    if (!property || property === "none" || property === "all") continue;
    if (DISCRETE_TRANSITION_PROPERTIES.has(property)) continue;
    pending.add(property);
  }
  element.addEventListener("transitionend", onTransitionEnd);
  element.addEventListener("transitioncancel", onTransitionEnd);
  timer = setTimeout(finish, Math.ceil(budget * OVERLAY_EXIT_TIMEOUT_FACTOR));
  return () => {
    if (settled) return;
    settled = true;
    cleanup();
  };
}

export function computeAnchoredPopoverPosition(
  anchor: AnchoredPopoverRect,
  popover: Pick<AnchoredPopoverRect, "width" | "height">,
  viewport: AnchoredPopoverViewport,
  {
    align = "start",
    gap = DEFAULT_GAP,
    margin = DEFAULT_MARGIN,
    maxHeight: requestedMaxHeight,
  }: AnchoredPopoverPositionOptions = {},
): AnchoredPopoverPosition {
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const innerLeft = viewport.left + margin;
  const innerTop = viewport.top + margin;
  const innerRight = Math.max(innerLeft, viewportRight - margin);
  const innerBottom = Math.max(innerTop, viewportBottom - margin);
  const roomBelow = Math.max(0, innerBottom - anchor.bottom - gap);
  const roomAbove = Math.max(0, anchor.top - gap - innerTop);
  const placement =
    popover.height > roomBelow && roomAbove > roomBelow ? "above" : "below";
  const availableHeight = placement === "above" ? roomAbove : roomBelow;
  const maxHeight = Math.max(
    0,
    Math.min(
      availableHeight,
      requestedMaxHeight ?? Number.POSITIVE_INFINITY,
    ),
  );
  const renderedHeight = Math.min(popover.height, maxHeight);
  const maxWidth = Math.max(0, innerRight - innerLeft);
  const renderedWidth = Math.min(popover.width, maxWidth);
  const rawLeft =
    align === "end"
      ? anchor.right - renderedWidth
      : align === "center"
        ? anchor.left + (anchor.width - renderedWidth) / 2
        : anchor.left;
  const left = clamp(rawLeft, innerLeft, innerRight - renderedWidth);
  const rawTop =
    placement === "above"
      ? anchor.top - gap - renderedHeight
      : anchor.bottom + gap;
  const top = clamp(rawTop, innerTop, innerBottom - renderedHeight);
  return { left, top, maxWidth, maxHeight, placement };
}

function samePosition(
  left: AnchoredPopoverPosition,
  right: AnchoredPopoverPosition,
): boolean {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.maxWidth === right.maxWidth &&
    left.maxHeight === right.maxHeight &&
    left.placement === right.placement
  );
}

function visualViewportRect(): AnchoredPopoverViewport {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
    width: viewport?.width || window.innerWidth,
    height: viewport?.height || window.innerHeight,
  };
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function targetBelongsToLineage(
  target: EventTarget | null,
  popoverId: string,
): boolean {
  const popover = eventTargetElement(target)?.closest<HTMLElement>(
    "[data-anchored-popover-lineage]",
  );
  return Boolean(
    popover?.dataset.anchoredPopoverLineage
      ?.split(/\s+/)
      .includes(popoverId),
  );
}

export interface AnchoredPopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLElement | null>;
  onClose: (reason: AnchoredPopoverCloseReason) => void;
  children: ReactNode;
  id?: string;
  role?: AriaRole;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaModal?: boolean;
  tabIndex?: number;
  align?: "start" | "center" | "end";
  gap?: number;
  margin?: number;
  maxHeight?: number;
  className?: string;
  style?: CSSProperties;
  attributes?: Record<string, string | number | boolean | undefined>;
  initialFocusSelector?: string | false;
  restoreFocusOnEscape?: boolean;
  /** Tab 循环。默认只给 `role="dialog"`：菜单该让 Tab 走出去，对话框不该。 */
  trapFocus?: boolean;
  /**
   * 打开时锁住页面滚动。默认同样只给 `role="dialog"`——下拉菜单锁掉整页滚动
   * 对坐在屏幕前的人是骚扰，而且这个组件本来就会跟着滚动重新定位。
   */
  lockScroll?: boolean;
}

/**
 * Shared portal-backed anchored surface for menus, listboxes and dialogs.
 * React portals preserve logical nesting while the DOM node escapes transformed
 * toolbar roots and overflow-hidden panes.
 */
export function AnchoredPopover({
  open,
  anchorRef,
  panelRef,
  onClose,
  children,
  id: providedId,
  role,
  ariaLabel,
  ariaLabelledBy,
  ariaModal,
  tabIndex = -1,
  align = "start",
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
  maxHeight,
  className = "",
  style,
  attributes,
  initialFocusSelector = DEFAULT_FOCUS_SELECTOR,
  restoreFocusOnEscape = true,
  trapFocus = role === "dialog",
  lockScroll = role === "dialog",
}: AnchoredPopoverProps) {
  const generatedId = useId().replace(/:/g, "");
  const popoverId = providedId || `anchored-popover-${generatedId}`;
  // 插件内主题：portal 到 body 后 DOM 上不再继承插件根的 token，靠 React
  // context（穿透 portal）拿到 pluginId，在面板自身重建作用域。
  const portalPluginThemeId = usePluginThemePortal();
  const portalPluginTheme = usePluginTheme(portalPluginThemeId);
  const parentLineage = useContext(AnchoredPopoverLineageContext);
  const lineage = [...parentLineage, popoverId];
  const internalPanelRef = useRef<HTMLElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const [positioned, setPositioned] = useState(false);
  const [position, setPosition] = useState<AnchoredPopoverPosition>({
    left: DEFAULT_MARGIN,
    top: DEFAULT_MARGIN,
    maxWidth: 0,
    maxHeight: 0,
    placement: "below",
  });
  const [transformOrigin, setTransformOrigin] = useState("center");
  // 退场期间元素还留在 DOM 里，里面的 children 也就还挂着。每次重新打开都换一把
  // key，让 children 重挂一次——否则上一次开着时输了一半的表单会在下一次露出来。
  const [openGeneration, setOpenGeneration] = useState(0);
  const [previousOpen, setPreviousOpen] = useState(open);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) setOpenGeneration((generation) => generation + 1);
  }
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const setPanel = useCallback(
    (node: HTMLElement | null) => {
      internalPanelRef.current = node;
      if (panelRef) {
        (panelRef as MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    [panelRef],
  );

  const moveCompositeFocus = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (
        (role !== "menu" && role !== "listbox") ||
        !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
      ) {
        return;
      }
      const items = [
        ...(internalPanelRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([aria-disabled="true"]):not(:disabled), [role="option"]:not([aria-disabled="true"]):not(:disabled)',
        ) || []),
      ];
      if (!items.length) return;
      const activeIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowUp"
              ? activeIndex <= 0
                ? items.length - 1
                : activeIndex - 1
              : activeIndex < 0 || activeIndex === items.length - 1
                ? 0
                : activeIndex + 1;
      event.preventDefault();
      event.stopPropagation();
      items[nextIndex]?.focus();
    },
    [role],
  );

  // 关掉之后**不**摘 portalRoot：元素得留在 DOM 里退场（§规范三）。第一次打开时
  // 挂上，此后由 `data-leo-overlay-state` 翻面，卸载交给 React 父级。
  useLayoutEffect(() => {
    if (!open) return;
    ensureOverlayMotionStyles();
    const updatePortalRoot = () => {
      setPortalRoot(document.fullscreenElement ?? document.body);
    };
    updatePortalRoot();
    document.addEventListener("fullscreenchange", updatePortalRoot);
    return () =>
      document.removeEventListener("fullscreenchange", updatePortalRoot);
  }, [open]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const panel = internalPanelRef.current;
    if (!anchor || !panel) return;
    const panelRect = panel.getBoundingClientRect();
    const naturalWidth = Math.max(panelRect.width, panel.scrollWidth || 0);
    const naturalHeight = Math.max(panelRect.height, panel.scrollHeight || 0);
    const next = computeAnchoredPopoverPosition(
      anchor,
      {
        width: naturalWidth,
        height: naturalHeight,
      },
      visualViewportRect(),
      { align, gap, margin, maxHeight },
    );
    setPosition((current) => (samePosition(current, next) ? current : next));
    setTransformOrigin(
      computeAnchoredPopoverTransformOrigin(anchor, next, {
        width: Math.min(naturalWidth, next.maxWidth),
        height: Math.min(naturalHeight, next.maxHeight),
      }),
    );
    setPositioned(true);
  }, [align, anchorRef, gap, margin, maxHeight]);

  useLayoutEffect(() => {
    if (!open || !portalRoot) return;
    setPositioned(false);
    updatePosition();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    if (internalPanelRef.current) observer?.observe(internalPanelRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [anchorRef, open, portalRoot, updatePosition]);

  useEffect(() => {
    if (!open || !portalRoot || !lockScroll) return;
    return lockBodyScroll();
  }, [lockScroll, open, portalRoot]);

  useEffect(() => {
    if (!open || !portalRoot) return;
    openPopoverStack.push(popoverId);
    const closeOnEscape = (event: KeyboardEvent) => {
      // Tab 循环与 Escape 同一条纪律：只有栈顶那层理会键盘，嵌套弹层不抢。
      if (openPopoverStack.at(-1) !== popoverId) return;
      if (trapFocus && event.key === "Tab") {
        trapTabWithin(internalPanelRef.current, event);
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current("escape");
      if (restoreFocusOnEscape) {
        anchorRef.current?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        internalPanelRef.current?.contains(target) ||
        targetBelongsToLineage(event.target, popoverId)
      ) {
        return;
      }
      onCloseRef.current("outside");
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      const index = openPopoverStack.lastIndexOf(popoverId);
      if (index >= 0) openPopoverStack.splice(index, 1);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [
    anchorRef,
    open,
    popoverId,
    portalRoot,
    restoreFocusOnEscape,
    trapFocus,
  ]);

  useLayoutEffect(() => {
    if (!open || !portalRoot || initialFocusSelector === false) return;
    const panel = internalPanelRef.current;
    const initial = panel?.querySelector<HTMLElement>(initialFocusSelector);
    (initial || panel)?.focus();
  }, [initialFocusSelector, open, portalRoot]);

  if (!portalRoot) return null;
  return createPortal(
    <AnchoredPopoverLineageContext.Provider value={lineage}>
      <div
        {...attributes}
        ref={setPanel}
        id={popoverId}
        role={role}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-modal={ariaModal}
        aria-hidden={open ? undefined : true}
        // 退场那 200ms 里元素还在，`inert` 保证它既接不到 Tab 也接不到点击。
        inert={!open}
        hidden={!open}
        tabIndex={tabIndex}
        onKeyDown={moveCompositeFocus}
        data-anchored-popover
        data-anchored-popover-id={popoverId}
        data-anchored-popover-lineage={lineage.join(" ")}
        data-anchored-placement={position.placement}
        data-leo-overlay-state={open ? "open" : "closed"}
        data-plugin-theme={portalPluginTheme.theme || undefined}
        className={`leo-overlay ${className}`.trim()}
        style={{
          ...(portalPluginTheme.theme && portalPluginTheme.accent
            ? pluginWorkbenchStyle(
                portalPluginTheme.theme,
                portalPluginTheme.accent,
              )
            : null),
          ...style,
          position: "fixed",
          boxSizing: "border-box",
          left: position.left,
          top: position.top,
          maxWidth: positioned ? position.maxWidth : undefined,
          maxHeight: positioned ? position.maxHeight : maxHeight,
          visibility: positioned ? "visible" : "hidden",
          transformOrigin,
        }}
      >
        <Fragment key={openGeneration}>{children}</Fragment>
      </div>
    </AnchoredPopoverLineageContext.Provider>,
    portalRoot,
  );
}
