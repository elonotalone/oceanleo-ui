// ============================================================================
// 第一方虚拟化原语 · W06
// ----------------------------------------------------------------------------
// 素材库一大就掉帧，根因是「有多少条就挂多少个 DOM」。这个目录只回答一个问题：
// **这一刻该挂哪几个**。「每个长什么样、图怎么加载」是 W07 的事，两边的接缝是：
// 被 W07 渲染的卡片，只要在视口内就一定已经挂载。
//
// 与 W07 的另一条接缝（写进 W06 交付说明）：**卡片高度不许依赖图片加载结果。**
// 本目录的动态行高会把量到的真高回填进账本；如果高度随图片加载而变，W07 的 CLS
// 治理就会被这里的回填抵消。约定是：高度 = 宽高比 + 文本行数，与图片无关。
//
// 用法（网格）：
//
// ```tsx
// const gridRef = useRef<HTMLDivElement>(null);
// const grid = useVirtualGrid({
//   itemCount: entries.length,
//   containerRef: gridRef,
//   rule: { minTrackPx: 192, gapPx: 10, narrowDivisor: 2 },
// });
// <div ref={gridRef} className="grid gap-2.5" {...grid.containerProps}>
//   {grid.spacerTop > 0 && <div style={{ gridColumn: "1 / -1", height: grid.spacerTop }} />}
//   {entries.slice(grid.startIndex, grid.endIndex).map(render)}
//   {grid.spacerBottom > 0 && <div style={{ gridColumn: "1 / -1", height: grid.spacerBottom }} />}
// </div>
// ```
//
// 这个 barrel **不**挂进 `src/lib/index.ts`：那份 barrel 归 W1，且虚拟化是渲染层
// 内部实现，不属于本包的公共 API。消费方直接 `import … from "../lib/virtual"`。
// ============================================================================

export {
  RowMetrics,
  applyRowMeasurements,
  nearestScrollParent,
  rowWindow,
  scrollOffsetForRow,
  useVirtualList,
  type RowWindow,
  type RowWindowRequest,
  type VirtualListOptions,
  type VirtualListResult,
} from "./use-virtual-list";

export {
  autoFillColumnCount,
  columnCountFromTemplate,
  nextGridIndex,
  spacerHeights,
  useVirtualGrid,
  type GridColumnRule,
  type VirtualGridOptions,
  type VirtualGridResult,
} from "./use-virtual-grid";
