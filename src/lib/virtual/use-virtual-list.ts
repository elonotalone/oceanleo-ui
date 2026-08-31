"use client";

// ============================================================================
// 第一方虚拟化原语（纵向窗口）· W06
// ----------------------------------------------------------------------------
// 不引虚拟化库。理由不是「能自己写」，是这三条：
//
// 1. 网格要与统一 UI 的卡片尺寸/间距规则**逐字一致**。本包发到 31 个租户站，
//    货架的列宽规则是 `WorkspaceLibrary` 里那一行 `auto-fill` + `minmax`，
//    无头库照样要写同样多的适配代码去复刻它。
// 2. 本仓的滚动容器**不归网格所有**：`WorkspaceLibrary` 的滚动区里还坐着分类
//    chips 与分节小标题，`ArtifactLibrary` 的 legacy 分支更是刻意不带
//    `overflow-y-auto`（双滚动条事故，见该文件 :346-357）。市面上的库默认
//    「一个滚动容器一个列表」，这两处都不成立。
// 3. 多一个依赖就多一层升级负担（`01-verified-facts.md` §2.7：115 个不存在的库
//    是刻意的）。
//
// 设计上只有一条铁律：**计算是纯的，测量是可注入的。**
// 窗口怎么算、行高怎么累、滚动锚定要补多少像素，全都是不碰 DOM 的纯函数；
// 只有「量一次容器宽高」这一步碰 DOM。测试环境（jsdom）没有布局引擎，
// 这条铁律是本原语能被确定性测到的唯一原因。
// ============================================================================

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** 服务端与 jsdom 里没有布局，`useLayoutEffect` 会告警。 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// ---------------------------------------------------------------------------
// 行高账本
// ---------------------------------------------------------------------------

/**
 * 「乐观估高 + 测量缓存」的行高账本。
 *
 * 没量到的行按 `estimate` 记账，量到之后回填真值。前缀和是增量维护的：
 * 一行被改写只会让**它之后**的前缀失效，前面的照旧，所以一屏 60 行同时回填
 * 也只重算一次尾巴。
 */
export class RowMetrics {
  #estimate: number;
  #count: number;
  /** 未测量记 `-1`，而不是 `0`——真高确实可能是 0（空分节）。 */
  #measured: number[] = [];
  /** `#offsets[i]` = 第 0..i-1 行的高度之和。长度恒为 `count + 1`。 */
  #offsets: number[] = [0];
  /** `#offsets[0..#validCount]` 是可信的，之后的是陈的。 */
  #validCount = 0;

  constructor(count: number, estimate: number) {
    this.#count = Math.max(0, Math.floor(count));
    this.#estimate = Math.max(0, estimate);
  }

  get count(): number {
    return this.#count;
  }

  get estimate(): number {
    return this.#estimate;
  }

  /** 条目数变了：只把**尾巴**作废，已量到的前面那些行不重来。 */
  setCount(count: number): void {
    const next = Math.max(0, Math.floor(count));
    if (next === this.#count) return;
    if (next < this.#count) this.#measured.length = next;
    this.#count = next;
    this.#validCount = Math.min(this.#validCount, next);
  }

  setEstimate(estimate: number): void {
    const next = Math.max(0, estimate);
    if (next === this.#estimate) return;
    this.#estimate = next;
    // 估高只影响没量到的行，但它们散落在任何位置，只能整体重来。
    this.#validCount = 0;
  }

  /** 量到一行的真高。返回「这次真的改变了账本吗」。 */
  measure(row: number, size: number): boolean {
    if (!Number.isFinite(size) || size < 0) return false;
    if (row < 0 || row >= this.#count) return false;
    const previous = this.#measured[row];
    if (previous === size) return false;
    this.#measured[row] = size;
    if (row < this.#validCount) this.#validCount = row;
    return true;
  }

  /** 这一行现在按多高记账（量到就是真高，没量到就是估高）。 */
  sizeOf(row: number): number {
    const measured = this.#measured[row];
    return measured === undefined || measured < 0 ? this.#estimate : measured;
  }

  isMeasured(row: number): boolean {
    const measured = this.#measured[row];
    return measured !== undefined && measured >= 0;
  }

  #ensure(upTo: number): void {
    const target = Math.min(Math.max(0, upTo), this.#count);
    for (let row = this.#validCount; row < target; row += 1) {
      this.#offsets[row + 1] = this.#offsets[row] + this.sizeOf(row);
    }
    if (target > this.#validCount) this.#validCount = target;
  }

  /** 第 `row` 行的上沿离列表顶端多远。`row === count` 即列表总高。 */
  offsetOf(row: number): number {
    const clamped = Math.min(Math.max(0, Math.floor(row)), this.#count);
    this.#ensure(clamped);
    return this.#offsets[clamped] ?? 0;
  }

  totalSize(): number {
    return this.offsetOf(this.#count);
  }

  /** 距列表顶端 `offset` 像素处落在第几行。空列表返回 0。 */
  rowAtOffset(offset: number): number {
    if (this.#count === 0) return 0;
    this.#ensure(this.#count);
    const target = Math.max(0, offset);
    let low = 0;
    let high = this.#count - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((this.#offsets[middle] ?? 0) <= target) low = middle;
      else high = middle - 1;
    }
    return low;
  }
}

/**
 * 把一批测量结果落账，并算出**为了不让画面跳动**需要给滚动位置补多少像素。
 *
 * 滚动锚定是这类实现最容易错的一处：视口上方某一行的估高被修正成真高时，
 * 下面所有内容会整体位移，用户正在看的那一行就会往上/往下窜。做法是先记住
 * 锚点行（当前视口第一行）的上沿位置，落账之后再看它挪了多少，把这个差额
 * 原样加回 `scrollTop`——于是屏幕上的内容一动不动，动的只是滚动条。
 *
 * 返回值就是那个差额（像素）。0 表示不用管。
 */
export function applyRowMeasurements(
  metrics: RowMetrics,
  measurements: Iterable<readonly [number, number]>,
  anchorRow: number,
): number {
  const before = metrics.offsetOf(anchorRow);
  let changed = false;
  for (const [row, size] of measurements) {
    if (metrics.measure(row, size)) changed = true;
  }
  if (!changed) return 0;
  return metrics.offsetOf(anchorRow) - before;
}

// ---------------------------------------------------------------------------
// 窗口计算
// ---------------------------------------------------------------------------

export interface RowWindowRequest {
  readonly metrics: RowMetrics;
  /** 滚动容器当前的 `scrollTop`。 */
  readonly scrollTop: number;
  /** 滚动容器的可视高度。**`<= 0` 表示量不到**，此时一律全量渲染。 */
  readonly viewportHeight: number;
  /** 列表顶端相对滚动容器内容原点的距离（列表上面还坐着 chips / 小标题）。 */
  readonly listOffsetTop: number;
  /** 上下各多渲染多少像素。 */
  readonly overscanPx: number;
  /** 必须留在窗口里的行（键盘焦点所在行）。 */
  readonly pinnedRow?: number | null;
}

export interface RowWindow {
  readonly startRow: number;
  /** 开区间上界。 */
  readonly endRow: number;
  readonly paddingTop: number;
  readonly paddingBottom: number;
  readonly totalSize: number;
  /** false = 这次是全量渲染（量不到视口）。 */
  readonly windowed: boolean;
}

/**
 * 算出该挂哪几行。
 *
 * **量不到视口（`viewportHeight <= 0`）时返回全量窗口**，这不是偷懒：服务端渲染、
 * 首帧水合、以及任何没有布局引擎的环境里，「哪些行可见」这个问题没有答案，
 * 此时唯一不会丢内容的答案就是全都挂上。生产环境里 `ResizeObserver` 一上来就
 * 给出真高，窗口随即收敛。
 */
export function rowWindow({
  metrics,
  scrollTop,
  viewportHeight,
  listOffsetTop,
  overscanPx,
  pinnedRow = null,
}: RowWindowRequest): RowWindow {
  const count = metrics.count;
  const totalSize = metrics.totalSize();
  if (count === 0) {
    return {
      startRow: 0,
      endRow: 0,
      paddingTop: 0,
      paddingBottom: 0,
      totalSize,
      windowed: false,
    };
  }
  if (!(viewportHeight > 0)) {
    return {
      startRow: 0,
      endRow: count,
      paddingTop: 0,
      paddingBottom: 0,
      totalSize,
      windowed: false,
    };
  }
  const top = scrollTop - listOffsetTop - overscanPx;
  const bottom = scrollTop - listOffsetTop + viewportHeight + overscanPx;
  let startRow = metrics.rowAtOffset(Math.max(0, top));
  let endRow = Math.min(count, metrics.rowAtOffset(Math.max(0, bottom)) + 1);
  if (pinnedRow !== null && pinnedRow >= 0 && pinnedRow < count) {
    startRow = Math.min(startRow, pinnedRow);
    endRow = Math.max(endRow, pinnedRow + 1);
  }
  if (endRow <= startRow) endRow = Math.min(count, startRow + 1);
  const paddingTop = metrics.offsetOf(startRow);
  return {
    startRow,
    endRow,
    paddingTop,
    paddingBottom: Math.max(0, totalSize - metrics.offsetOf(endRow)),
    totalSize,
    windowed: true,
  };
}

/**
 * 把第 `row` 行滚进视口所需的 `scrollTop`。
 *
 * `align: "auto"` 只在它确实在视口外时才动——已经看得见的东西不该因为一次
 * 键盘移动而重新居中，那是本仓 anchored-popover 那类「自作主张」的老毛病。
 */
export function scrollOffsetForRow(
  metrics: RowMetrics,
  row: number,
  options: {
    readonly scrollTop: number;
    readonly viewportHeight: number;
    readonly listOffsetTop: number;
    readonly align?: "auto" | "start";
  },
): number {
  const { scrollTop, viewportHeight, listOffsetTop, align = "auto" } = options;
  const rowTop = listOffsetTop + metrics.offsetOf(row);
  const rowBottom = rowTop + metrics.sizeOf(row);
  if (align === "start") return Math.max(0, rowTop);
  if (rowTop < scrollTop) return Math.max(0, rowTop);
  if (viewportHeight > 0 && rowBottom > scrollTop + viewportHeight) {
    return Math.max(0, rowBottom - viewportHeight);
  }
  return scrollTop;
}

// ---------------------------------------------------------------------------
// DOM 接缝（本文件里唯一碰 DOM 的一段）
// ---------------------------------------------------------------------------

/**
 * 找祖先里最近的那个真的会滚动的元素。
 *
 * 不能假设「滚动容器 = 列表的父节点」：`ArtifactLibrary` 的 legacy 分支刻意不带
 * 自己的 `overflow-y-auto`（外层 ResultCanvas body 才是滚动容器；它自己再套一层
 * 会出现双滚动条，那是操作员点名过的缺陷）。
 */
export function nearestScrollParent(node: Element | null): HTMLElement | null {
  if (!node || typeof window === "undefined") return null;
  let current: Element | null = node.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      current.scrollHeight > current.clientHeight
    ) {
      return current as HTMLElement;
    }
    current = current.parentElement;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface VirtualListOptions {
  /** 行数。网格模式下由 `useVirtualGrid` 换算成行数后传进来。 */
  readonly rowCount: number;
  /** 列表容器（放行的那个元素）。 */
  readonly containerRef: { current: HTMLElement | null };
  /** 滚动容器。不传就自己往上找最近的可滚动祖先。 */
  readonly scrollRef?: { current: HTMLElement | null };
  /** 乐观估高。量到真高之前按它记账。 */
  readonly estimatedRowHeight: number;
  /** 上下各多渲染几屏。默认 1（任务书 P1：「上下各多渲染一屏」）。 */
  readonly overscanScreens?: number;
  /** 量一行的真高。网格模式传「这一行里最高的那张卡」。 */
  readonly measureRow: (row: number, container: HTMLElement) => number | null;
}

export interface VirtualListResult {
  readonly startRow: number;
  readonly endRow: number;
  readonly paddingTop: number;
  readonly paddingBottom: number;
  readonly windowed: boolean;
  readonly metrics: RowMetrics;
  readonly viewportHeight: number;
  /** 把某一行滚进视口。 */
  readonly scrollRowIntoView: (row: number, align?: "auto" | "start") => void;
  /** 强行把某一行留在窗口里（键盘焦点跑到未挂载区时用）。 */
  readonly pinRow: (row: number | null) => void;
}

/**
 * 纵向窗口 hook。网格模式请用 `useVirtualGrid`——它在本 hook 之上再加列数换算
 * 与二维键盘导航。
 */
export function useVirtualList({
  rowCount,
  containerRef,
  scrollRef,
  estimatedRowHeight,
  overscanScreens = 1,
  measureRow,
}: VirtualListOptions): VirtualListResult {
  const metrics = useMemo(
    () => new RowMetrics(rowCount, estimatedRowHeight),
    // 账本要跨渲染活着；行数与估高的变化走下面的 setter，不重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  metrics.setCount(rowCount);
  metrics.setEstimate(estimatedRowHeight);

  const scrollElementRef = useRef<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [listOffsetTop, setListOffsetTop] = useState(0);
  const [pinnedRow, setPinnedRow] = useState<number | null>(null);
  /** 只用来把测量结果推成一次重渲染；值本身没有意义。 */
  const [measureNonce, setMeasureNonce] = useState(0);

  const readGeometry = useCallback(() => {
    const container = containerRef.current;
    const scroller =
      scrollRef?.current ?? scrollElementRef.current ?? null;
    if (!container || !scroller) return;
    setViewportHeight(scroller.clientHeight);
    setScrollTop(scroller.scrollTop);
    // 列表顶端相对滚动容器**内容原点**的距离。两个 rect 之差 + 当前 scrollTop
    // 才是内容坐标；只用 offsetTop 会在中间夹着 `position: relative` 的祖先时错。
    const containerRect = container.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    setListOffsetTop(
      containerRect.top - scrollerRect.top + scroller.scrollTop,
    );
  }, [containerRef, scrollRef]);

  // 绑滚动容器 + 尺寸观察。容器宽高、窗口大小、滚动位置任一变化都要重算。
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;
    const scroller =
      scrollRef?.current ?? nearestScrollParent(container);
    scrollElementRef.current = scroller;
    if (!scroller) {
      // 量不到滚动容器 = 全量渲染。这条分支在服务端与 jsdom 上恒真。
      setViewportHeight(0);
      return;
    }
    readGeometry();
    const onScroll = () => {
      setScrollTop(scroller.scrollTop);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => readGeometry());
      observer.observe(scroller);
      observer.observe(container);
    }
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [containerRef, readGeometry, scrollRef, rowCount]);

  const overscanPx = Math.max(0, viewportHeight * overscanScreens);
  const window_ = rowWindow({
    metrics,
    scrollTop,
    viewportHeight,
    listOffsetTop,
    overscanPx,
    pinnedRow,
  });

  // 落账 + 滚动锚定。必须在 layout 阶段做完：浏览器绘制之前把 `scrollTop` 补回去，
  // 用户才看不到那一下位移。
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measurements: Array<readonly [number, number]> = [];
    for (let row = window_.startRow; row < window_.endRow; row += 1) {
      const size = measureRow(row, container);
      if (size !== null && Number.isFinite(size)) measurements.push([row, size]);
    }
    if (!measurements.length) return;
    const delta = applyRowMeasurements(metrics, measurements, window_.startRow);
    if (delta !== 0) {
      const scroller = scrollRef?.current ?? scrollElementRef.current;
      if (scroller) {
        scroller.scrollTop += delta;
        setScrollTop(scroller.scrollTop);
      }
    }
    // 账本变了就得重算窗口；`RowMetrics` 是可变对象，React 看不见它的变化。
    setMeasureNonce((value) => value + 1);
    // `measureNonce` 是这个 effect 自己的输出，不能进依赖，否则每帧自激。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    containerRef,
    measureRow,
    metrics,
    scrollRef,
    window_.startRow,
    window_.endRow,
    scrollTop,
    viewportHeight,
  ]);
  void measureNonce;

  const scrollRowIntoView = useCallback(
    (row: number, align: "auto" | "start" = "auto") => {
      const scroller = scrollRef?.current ?? scrollElementRef.current;
      if (!scroller) return;
      const next = scrollOffsetForRow(metrics, row, {
        scrollTop: scroller.scrollTop,
        viewportHeight: scroller.clientHeight,
        listOffsetTop,
        align,
      });
      if (next === scroller.scrollTop) return;
      // 刻意**不用** `behavior: "smooth"`：回到原位与键盘移动都要即时。
      // 平滑滚动在连续按方向键时会排队，正好违反「可打断」。
      scroller.scrollTop = next;
      setScrollTop(next);
    },
    [listOffsetTop, metrics, scrollRef],
  );

  return {
    startRow: window_.startRow,
    endRow: window_.endRow,
    paddingTop: window_.paddingTop,
    paddingBottom: window_.paddingBottom,
    windowed: window_.windowed,
    metrics,
    viewportHeight,
    scrollRowIntoView,
    pinRow: setPinnedRow,
  };
}
