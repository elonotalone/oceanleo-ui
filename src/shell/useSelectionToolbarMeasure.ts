"use client";

import {
  useLayoutEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  cssPixelValue,
  elementInlineSize,
  elementOuterInlineSize,
  equalMeasuredWidths,
  normalizedAvailableWidth,
  normalizedMeasuredWidth,
  toolbarContainerInlineSize,
  toolbarFloatingHost,
  toolbarFloatingTranslatedShell,
  toolbarSizingBoundary,
} from "./selection-toolbar-measure";

/** 浮动编辑栏在容器两侧各留 .5rem（FloatingContextToolbar 的 `max-w-[calc(100%-1rem)]`）。 */
const FLOATING_EDGE_RESERVE_PX = 16;
/** SelectionToolbar 自己在视口两侧各留 1rem 可达空间。 */
const VIEWPORT_REACHABLE_RESERVE_PX = 32;

/**
 * 浮动编辑栏的容量边界：只认**外部**盒子。
 *
 * 优先 `[data-workspace-floating-toolbar-overlay]`（FloatingContextToolbar 的
 * inset-0 覆盖层，尺寸 = 舞台/图层），其次旧的 sizing boundary。
 * **绝不**回到栏自己或它的 translate 外壳——那两个盒子的尺寸与位置都由
 * 栏内容决定，拿它们算容量就是把自己的输出接回自己的输入（React #185 的根）。
 */
function floatingCapacityBoundary(toolbar: HTMLDivElement): HTMLElement | null {
  const overlay = toolbar.closest<HTMLElement>(
    "[data-workspace-floating-toolbar-overlay]",
  );
  if (overlay) return overlay;
  return toolbarSizingBoundary(toolbar);
}

/** 边界与视口相交的可见宽度；边界不可量时返回 0。 */
function visibleBoundaryWidth(boundary: HTMLElement | null): number {
  if (!boundary || typeof window === "undefined") return 0;
  const rect = boundary.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportRight = viewportLeft + (viewport?.width || window.innerWidth);
  const width = Math.max(
    0,
    Math.min(rect.right, viewportRight) - Math.max(rect.left, viewportLeft),
  );
  return width > 0 ? width : Math.max(0, rect.width);
}

/**
 * 单行编辑栏（`[data-workspace-edit-bar]`）里，SelectionToolbar 只是其中一段：
 * 撤销重做 / 文档段 / AI 与固定柄都是它的兄弟。这些兄弟的宽度由各自内容决定，
 * 与本栏无关，所以从容量里扣掉它们不会形成反馈。
 */
function rowSiblingsInlineSize(
  toolbar: HTMLDivElement,
  row: HTMLElement,
): number {
  const style = window.getComputedStyle(row);
  let total =
    cssPixelValue(style.paddingInlineStart) +
    cssPixelValue(style.paddingInlineEnd) +
    cssPixelValue(style.borderInlineStartWidth) +
    cssPixelValue(style.borderInlineEndWidth);
  const gap = cssPixelValue(style.columnGap);
  let laidOut = 0;
  for (const child of Array.from(row.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child === toolbar || child.contains(toolbar)) {
      laidOut += 1;
      continue;
    }
    if (child.hidden || child.getAttribute("aria-hidden") === "true") continue;
    const width = elementOuterInlineSize(child);
    if (width <= 0) continue;
    total += width;
    laidOut += 1;
  }
  total += Math.max(0, laidOut - 1) * gap;
  return total;
}

export function useSelectionToolbarMeasure({
  toolbarRef,
  prefixRef,
  suffixRef,
  measurementRef,
  viewportCapacityRef,
  moreButtonRef,
  morePanelRef,
  restoreMoreFocusRef,
  effectiveVariant,
  prefixVisible,
  suffixVisible,
  hasAdaptiveControls,
  measurementIdentity,
  setMeasuredWidths,
  setAvailableWidth,
  setFloatingMaxInlineSize,
}: {
  toolbarRef: RefObject<HTMLDivElement | null>;
  prefixRef: RefObject<HTMLDivElement | null>;
  suffixRef: RefObject<HTMLDivElement | null>;
  measurementRef: RefObject<HTMLDivElement | null>;
  viewportCapacityRef: RefObject<HTMLDivElement | null>;
  moreButtonRef: RefObject<HTMLButtonElement | null>;
  morePanelRef: RefObject<HTMLDivElement | null>;
  restoreMoreFocusRef: MutableRefObject<boolean>;
  effectiveVariant: "bar" | "floating";
  prefixVisible: boolean;
  suffixVisible: boolean;
  hasAdaptiveControls: boolean;
  /**
   * 控件身份串（原始值）。**刻意不收 ReactNode**：宿主每次重渲染都会换新的
   * leading / trailing 节点，把它们放进依赖会让本 effect 每个 commit 都重跑并在
   * layout 阶段同步 setState——那正是 React #185 那条链的第一环。前后缀的宽度
   * 变化由 ResizeObserver 异步接住。
   */
  measurementIdentity: string;
  setMeasuredWidths: Dispatch<
    SetStateAction<ReadonlyMap<string, number>>
  >;
  setAvailableWidth: Dispatch<SetStateAction<number>>;
  setFloatingMaxInlineSize: Dispatch<SetStateAction<number>>;
}): void {
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const readLayout = () => {
      restoreMoreFocusRef.current =
        moreButtonRef.current === document.activeElement ||
        Boolean(morePanelRef.current?.contains(document.activeElement));
      const nextMeasured = new Map<string, number>();
      const measurementNodes =
        measurementRef.current?.querySelectorAll<HTMLElement>(
          "[data-selection-measure-control-id]",
        );
      measurementNodes?.forEach((node) => {
        const width = elementInlineSize(node);
        const id = node.dataset.selectionMeasureControlId;
        if (id && width > 0) {
          nextMeasured.set(id, normalizedMeasuredWidth(width));
        }
      });
      setMeasuredWidths((current) =>
        equalMeasuredWidths(current, nextMeasured)
          ? current
          : nextMeasured,
      );

      const row = toolbar.closest<HTMLElement>("[data-workspace-edit-bar]");
      const inFloatingChrome = Boolean(
        toolbarFloatingHost(toolbar) ||
          toolbarFloatingTranslatedShell(toolbar),
      );
      const viewport =
        typeof window === "undefined" ? null : window.visualViewport;
      const viewportWidth =
        viewport?.width ||
        (typeof window === "undefined" ? 0 : window.innerWidth);

      let containerWidth: number;
      if (inFloatingChrome) {
        // 容量 = 外部边界的可见宽度 − 两侧保留。与栏自己的位置/宽度无关。
        let capacity =
          visibleBoundaryWidth(floatingCapacityBoundary(toolbar)) -
          FLOATING_EDGE_RESERVE_PX;
        if (viewportWidth > 0) {
          capacity = Math.min(
            capacity,
            viewportWidth - VIEWPORT_REACHABLE_RESERVE_PX,
          );
        }
        capacity = Math.max(0, capacity);
        setFloatingMaxInlineSize((current) =>
          current === capacity ? current : capacity,
        );
        containerWidth = capacity;
      } else {
        setFloatingMaxInlineSize((current) => (current === 0 ? current : 0));
        containerWidth = toolbarContainerInlineSize(toolbar, effectiveVariant);
      }
      if (row && containerWidth > 0) {
        containerWidth = Math.max(
          0,
          containerWidth - rowSiblingsInlineSize(toolbar, row),
        );
      }
      const measuredViewportCapacity =
        effectiveVariant === "floating"
          ? elementInlineSize(viewportCapacityRef.current)
          : 0;
      if (measuredViewportCapacity > 0) {
        containerWidth = Math.min(
          containerWidth,
          measuredViewportCapacity,
        );
      }
      if (!(containerWidth > 0)) {
        // Only collapse when we are actually inside the floating edit-bar
        // chrome (or the single-row edit bar). Layout-context alone flips
        // effectiveVariant to "floating" even in hermetic mounts without a
        // translated shell; those must keep infinite capacity until a real
        // boundary exists.
        setAvailableWidth(
          inFloatingChrome || row ? 0 : Number.POSITIVE_INFINITY,
        );
        return;
      }
      const style = window.getComputedStyle(toolbar);
      const chromeWidth =
        cssPixelValue(style.paddingInlineStart) +
        cssPixelValue(style.paddingInlineEnd) +
        cssPixelValue(style.borderInlineStartWidth) +
        cssPixelValue(style.borderInlineEndWidth) +
        elementOuterInlineSize(prefixRef.current) +
        elementOuterInlineSize(suffixRef.current);
      const regionCount =
        (prefixVisible ? 1 : 0) +
        (hasAdaptiveControls ? 1 : 0) +
        (suffixVisible ? 1 : 0);
      const regionGaps =
        Math.max(0, regionCount - 1) * cssPixelValue(style.columnGap);
      const nextAvailable = normalizedAvailableWidth(
        containerWidth - chromeWidth - regionGaps,
      );
      setAvailableWidth((current) =>
        current === nextAvailable ? current : nextAvailable,
      );
    };

    // 首次同步量一遍：依赖全是原始值，所以这里只在挂载 / 控件身份变化时跑，
    // 而且容量不再依赖自身几何，最多带来一次嵌套更新。
    readLayout();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(readLayout);
    const boundary = toolbarFloatingHost(toolbar)
      ? floatingCapacityBoundary(toolbar)
      : toolbarSizingBoundary(toolbar);
    if (boundary) observer?.observe(boundary);
    // **不**观察栏自己、不观察 translate 外壳：它们的尺寸是本 hook 的输出。
    const row = toolbar.closest<HTMLElement>("[data-workspace-edit-bar]");
    if (row) {
      for (const child of Array.from(row.children)) {
        if (child === toolbar || child.contains(toolbar)) continue;
        observer?.observe(child);
      }
    }
    if (prefixRef.current) observer?.observe(prefixRef.current);
    if (suffixRef.current) observer?.observe(suffixRef.current);
    if (measurementRef.current) observer?.observe(measurementRef.current);
    if (viewportCapacityRef.current) {
      observer?.observe(viewportCapacityRef.current);
    }
    measurementRef.current
      ?.querySelectorAll<HTMLElement>("[data-selection-measure-control-id]")
      .forEach((node) => observer?.observe(node));
    // 行里的兄弟节点增减（文档段折进/展开、固定柄出现）改变可用宽度。
    const rowObserver =
      row && typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            for (const child of Array.from(row.children)) {
              if (child === toolbar || child.contains(toolbar)) continue;
              observer?.observe(child);
            }
            readLayout();
          })
        : null;
    if (row) rowObserver?.observe(row, { childList: true });
    window.addEventListener("resize", readLayout);
    window.visualViewport?.addEventListener("resize", readLayout);
    window.visualViewport?.addEventListener("scroll", readLayout);
    return () => {
      observer?.disconnect();
      rowObserver?.disconnect();
      window.removeEventListener("resize", readLayout);
      window.visualViewport?.removeEventListener("resize", readLayout);
      window.visualViewport?.removeEventListener("scroll", readLayout);
    };
  }, [
    effectiveVariant,
    hasAdaptiveControls,
    measurementIdentity,
    measurementRef,
    moreButtonRef,
    morePanelRef,
    prefixRef,
    prefixVisible,
    restoreMoreFocusRef,
    setAvailableWidth,
    setFloatingMaxInlineSize,
    setMeasuredWidths,
    suffixRef,
    suffixVisible,
    toolbarRef,
    viewportCapacityRef,
  ]);
}
