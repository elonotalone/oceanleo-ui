"use client";

// ============================================================================
// 第一方虚拟化原语（网格）· W06
// ----------------------------------------------------------------------------
// 在 `useVirtualList` 之上加三件事：列数换算、二维键盘导航、行/列 ↔ 条目下标。
//
// **本原语不接管布局。** 列宽仍然由消费方那一行 CSS
// `repeat(auto-fill, minmax(min(12rem, calc((100% - gap) / 2)), 1fr))` 决定，
// 这里只做两件事：算出「CSS 这一刻排了几列」，以及往网格里塞两个跨列占位块
// 把没挂载的行的高度顶起来。所以**外观不可能变**——真正排版的还是原来那行 CSS，
// 算错列数最多让窗口选得不准，不会让卡片长得不一样。
//
// 列数优先直接问 CSS（`getComputedStyle().gridTemplateColumns` 在 `auto-fill`
// 下会把空轨道也列出来），问不到才用公式回落。公式与 CSS 的等价性有测试锁着。
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  useVirtualList,
  type VirtualListResult,
} from "./use-virtual-list";

/** CSS `repeat(auto-fill, minmax(min(minTrack, (100% - gap) / divisor), 1fr))`。 */
export interface GridColumnRule {
  /** `minmax()` 的下界，像素。 */
  readonly minTrackPx: number;
  /** 列间距，像素。 */
  readonly gapPx: number;
  /**
   * 窄容器上把下界再压到 `(100% - gap) / divisor`，保证至少排得下 `divisor` 列。
   * 0 表示不封顶（纯 `minmax(minTrack, 1fr)`）。
   */
  readonly narrowDivisor?: number;
}

/**
 * `auto-fill` 在给定容器宽度下会排几列。
 *
 * CSS 的算法：轨道下界 `M` 定下来之后，能塞进 `floor((W + gap) / (M + gap))` 条。
 * `auto-fill`（区别于 `auto-fit`）**保留空轨道**，所以列数只跟宽度有关、
 * 与条目数无关——这正是我们能在只挂了几张卡时仍然问出真列数的原因。
 */
export function autoFillColumnCount(
  containerWidth: number,
  rule: GridColumnRule,
): number {
  const { minTrackPx, gapPx, narrowDivisor = 0 } = rule;
  if (!(containerWidth > 0) || !(minTrackPx > 0)) return 1;
  const narrowCap =
    narrowDivisor > 0
      ? Math.max(1, (containerWidth - gapPx) / narrowDivisor)
      : Number.POSITIVE_INFINITY;
  const track = Math.min(minTrackPx, narrowCap);
  return Math.max(1, Math.floor((containerWidth + gapPx) / (track + gapPx)));
}

/** 从 `getComputedStyle().gridTemplateColumns` 数出真列数。数不出来返回 0。 */
export function columnCountFromTemplate(template: string): number {
  const value = String(template || "").trim();
  if (!value || value === "none") return 0;
  // 解析过的值形如 `192px 192px 192px`；未解析的（`repeat(...)`）不算数。
  if (value.includes("repeat(")) return 0;
  const tracks = value.split(/\s+/).filter(Boolean);
  return tracks.every((track) => /^[\d.]+px$/.test(track)) ? tracks.length : 0;
}

/**
 * 两个跨列占位块该多高。
 *
 * 网格自己带 `row-gap`，占位块也占一行，所以它上/下各会多出一个 gap。
 * 不减掉的话滚动条会比真实内容长出 `2 * gap`，滚到底时露出一条空白。
 */
export function spacerHeights(
  paddingTop: number,
  paddingBottom: number,
  gapPx: number,
): { readonly top: number; readonly bottom: number } {
  return {
    top: paddingTop > 0 ? Math.max(0, paddingTop - gapPx) : 0,
    bottom: paddingBottom > 0 ? Math.max(0, paddingBottom - gapPx) : 0,
  };
}

/**
 * 方向键 / Home / End 在二维网格里的落点。返回 `null` = 这一下不归我们管
 * （不拦截事件，交回浏览器）。
 *
 * 上下移动只在目标真的存在时才走：最后一行不满时按 ↓ 不会跳到别的列上去，
 * 那种「看起来在往下、实际横着窜」的位移比不动更让人迷路。最后一行的尾巴用
 * → 或 End 到达。
 */
export function nextGridIndex(
  key: string,
  current: number,
  itemCount: number,
  columnCount: number,
): number | null {
  if (itemCount <= 0 || columnCount <= 0) return null;
  if (current < 0 || current >= itemCount) return null;
  const target = (() => {
    switch (key) {
      case "ArrowRight":
        return current + 1;
      case "ArrowLeft":
        return current - 1;
      case "ArrowDown":
        return current + columnCount;
      case "ArrowUp":
        return current - columnCount;
      case "Home":
        return 0;
      case "End":
        return itemCount - 1;
      default:
        return null;
    }
  })();
  if (target === null) return null;
  if (target < 0 || target >= itemCount) return null;
  return target === current ? null : target;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface VirtualGridOptions {
  readonly itemCount: number;
  /** 网格元素本身。 */
  readonly containerRef: { current: HTMLElement | null };
  /** 滚动容器。不传就找最近的可滚动祖先。 */
  readonly scrollRef?: { current: HTMLElement | null };
  /** 列规则。像素值由消费方按自己的 CSS 给。 */
  readonly rule: GridColumnRule;
  /** 乐观估高（行高，含行间距）。可以按列宽算。 */
  readonly estimatedRowHeight?: number | ((columnWidthPx: number) => number);
  readonly overscanScreens?: number;
}

export interface VirtualGridResult {
  readonly columnCount: number;
  /** 该挂的条目区间，`[startIndex, endIndex)`。 */
  readonly startIndex: number;
  readonly endIndex: number;
  /** 顶部/底部跨列占位块的高度。0 表示不用渲染那一块。 */
  readonly spacerTop: number;
  readonly spacerBottom: number;
  /** false = 这次全量渲染（量不到视口，例如服务端渲染与首帧水合）。 */
  readonly windowed: boolean;
  readonly metrics: VirtualListResult["metrics"];
  /** 挂到网格元素上。 */
  readonly containerProps: {
    readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
    readonly onFocus: (event: ReactFocusEvent<HTMLElement>) => void;
    readonly onBlur: (event: ReactFocusEvent<HTMLElement>) => void;
  };
  /** 把第 `index` 个条目滚进视口（「打开素材后返回列表回到原位」用）。 */
  readonly scrollToIndex: (index: number, align?: "auto" | "start") => void;
}

export function useVirtualGrid({
  itemCount,
  containerRef,
  scrollRef,
  rule,
  estimatedRowHeight = 208,
  overscanScreens = 1,
}: VirtualGridOptions): VirtualGridResult {
  const [columnWidth, setColumnWidth] = useState(0);
  const [measuredColumns, setMeasuredColumns] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const pendingFocusRef = useRef<number | null>(null);

  const columnCount = Math.max(
    1,
    measuredColumns || autoFillColumnCount(columnWidth, rule),
  );
  const rowCount = Math.ceil(itemCount / columnCount);

  const estimate = useMemo(() => {
    if (typeof estimatedRowHeight === "function") {
      const width =
        columnWidth > 0
          ? (columnWidth - rule.gapPx * (columnCount - 1)) / columnCount
          : 0;
      return estimatedRowHeight(Math.max(0, width));
    }
    return estimatedRowHeight;
  }, [columnCount, columnWidth, estimatedRowHeight, rule.gapPx]);

  /**
   * 渲染期写、layout effect 期读。测量回调必须是稳定引用（否则 `useVirtualList`
   * 每帧重跑测量 effect），但它要用到本帧的窗口——只能走 ref 交接。
   */
  const layoutRef = useRef({
    startIndex: 0,
    endIndex: 0,
    columnCount: 1,
    leadingCells: 0,
  });

  const measureRow = useCallback(
    (row: number, container: HTMLElement): number | null => {
      const { startIndex, endIndex, columnCount: columns, leadingCells } =
        layoutRef.current;
      const first = row * columns;
      let tallest = 0;
      let seen = 0;
      for (let column = 0; column < columns; column += 1) {
        const index = first + column;
        if (index < startIndex || index >= endIndex) continue;
        const cell = container.children[leadingCells + (index - startIndex)];
        if (!(cell instanceof HTMLElement)) continue;
        tallest = Math.max(tallest, cell.offsetHeight);
        seen += 1;
      }
      // 一张都没量到（这一行没挂载，或环境没有布局引擎）就别记账——
      // 记个 0 会把估高覆盖成 0，整份账本当场塌掉。
      if (!seen || tallest <= 0) return null;
      return tallest + rule.gapPx;
    },
    [rule.gapPx],
  );

  const list = useVirtualList({
    rowCount,
    containerRef,
    scrollRef,
    estimatedRowHeight: estimate,
    overscanScreens,
    measureRow,
  });

  // 焦点所在行必须留在窗口里。虚拟化最常见的无障碍退化就是焦点掉进未挂载区：
  // 一旦那张卡被回收，`document.activeElement` 会退回 `<body>`，键盘用户当场
  // 失去位置感，后面所有方向键都无处可去。
  const focusedRow =
    focusedIndex === null ? null : Math.floor(focusedIndex / columnCount);
  const { pinRow } = list;
  useEffect(() => {
    pinRow(focusedRow);
  }, [focusedRow, pinRow]);

  const startIndex = list.startRow * columnCount;
  const endIndex = Math.min(itemCount, list.endRow * columnCount);
  const { top: spacerTop, bottom: spacerBottom } = spacerHeights(
    list.paddingTop,
    list.paddingBottom,
    rule.gapPx,
  );
  layoutRef.current = {
    startIndex,
    endIndex,
    columnCount,
    leadingCells: spacerTop > 0 ? 1 : 0,
  };

  // 列数与列宽：先问 CSS，问不到用公式。
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;
    const read = () => {
      const width = container.clientWidth;
      setColumnWidth(width);
      setMeasuredColumns(
        columnCountFromTemplate(
          window.getComputedStyle(container).gridTemplateColumns,
        ),
      );
    };
    read();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(read);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  const cellIndexOf = useCallback(
    (node: Element | null): number | null => {
      const container = containerRef.current;
      if (!container || !node) return null;
      let cell: Element | null = node;
      while (cell && cell.parentElement !== container) cell = cell.parentElement;
      if (!cell) return null;
      const position = Array.prototype.indexOf.call(container.children, cell);
      const { startIndex: start, endIndex: end, leadingCells } =
        layoutRef.current;
      if (position < leadingCells) return null;
      const index = start + (position - leadingCells);
      return index >= start && index < end ? index : null;
    },
    [containerRef],
  );

  const focusCell = useCallback(
    (index: number): boolean => {
      const container = containerRef.current;
      if (!container) return false;
      const { startIndex: start, endIndex: end, leadingCells } =
        layoutRef.current;
      if (index < start || index >= end) return false;
      const cell = container.children[leadingCells + (index - start)];
      if (!(cell instanceof HTMLElement)) return false;
      const focusable = cell.querySelector(FOCUSABLE_SELECTOR);
      const target = focusable instanceof HTMLElement ? focusable : cell;
      target.focus({ preventScroll: true });
      return true;
    },
    [containerRef],
  );

  // 键盘目标可能在上一帧还没挂载。挂载发生在提交之后，所以焦点也只能等到提交之后。
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) return;
    if (focusCell(pending)) pendingFocusRef.current = null;
  });

  const { scrollRowIntoView } = list;
  const scrollToIndex = useCallback(
    (index: number, align: "auto" | "start" = "auto") => {
      if (index < 0 || index >= itemCount) return;
      scrollRowIntoView(Math.floor(index / columnCount), align);
    },
    [columnCount, itemCount, scrollRowIntoView],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const current = cellIndexOf(event.target as Element);
      if (current === null) return;
      const next = nextGridIndex(event.key, current, itemCount, columnCount);
      if (next === null) return;
      event.preventDefault();
      // 顺序要紧：先钉住目标行（这一帧就把它挂上），再滚，最后等提交后聚焦。
      setFocusedIndex(next);
      pendingFocusRef.current = next;
      scrollRowIntoView(Math.floor(next / columnCount));
    },
    [cellIndexOf, columnCount, itemCount, scrollRowIntoView],
  );

  const onFocus = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      const index = cellIndexOf(event.target as Element);
      if (index !== null) setFocusedIndex(index);
    },
    [cellIndexOf],
  );

  const onBlur = useCallback((event: ReactFocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    // 焦点离开整张网格：不必再为它保留挂载。
    setFocusedIndex(null);
  }, []);

  return {
    columnCount,
    startIndex,
    endIndex,
    spacerTop,
    spacerBottom,
    windowed: list.windowed,
    metrics: list.metrics,
    containerProps: { onKeyDown, onFocus, onBlur },
    scrollToIndex,
  };
}
