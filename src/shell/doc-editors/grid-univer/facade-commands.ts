/**
 * L1 edit bar 与 L2 左侧操控台的每一个表格控件 → `univerAPI`（Facade）的一个执行器。
 *
 * 规范 §2.1 第 2 条「一个命令一个执行器」在这里是字面意思：**一个 id 一行表**。
 * L1 按钮、L2 面板、L3 专业模式里的 ribbon、L4 chips、agent 调用，最后都落到同一条
 * `id` 上，只执行一次，进同一条 Univer history。
 *
 * 为什么执行器收的是 `GridFacadePort` 而不是 `FUniver` 本身：
 * `FUniver` 一被 import，Univer 整棵模块图就跟着进来了，这个文件就再也不能被
 * 测试直接加载（`W01-deps.md` §4：重内核只能待在懒加载叶子里）。端口是一组
 * **结构化的方法签名**，真身在 `GridUniverStage.tsx` 里由 `univerFacadePort()` 现场
 * 包出来——那一层是唯一碰真 Facade 的地方，参数写错了 `tsc` 当场报，
 * 而这里的 30 条执行器可以用一个假端口逐条验行为。
 */
import { numberFormatPatternForPreset } from "../grid-format/toolbar-bridge";
import type { GridCellType } from "../grid-model";

// ── 端口 ────────────────────────────────────────────────────────────────────

export interface GridFacadeFilter {
  setColumnFilterCriteria(
    column: number,
    criteria: { colId: number; filters?: { filters?: string[] } },
  ): unknown;
  removeColumnFilterCriteria(column: number): unknown;
  remove(): unknown;
}

export interface GridFacadeRange {
  setValue(value: string | number | boolean): unknown;
  getValue(): string | number | boolean | null;
  setFontWeight(weight: "normal" | "bold" | null): unknown;
  setFontColor(color: string | null): unknown;
  setBackgroundColor(color: string): unknown;
  setHorizontalAlignment(alignment: GridFacadeAlignment): unknown;
  setNumberFormat(pattern: string): unknown;
  merge(): unknown;
  breakApart(): unknown;
  createFilter(): GridFacadeFilter | null;
  getFilter(): GridFacadeFilter | null;
}

export interface GridFacadeWorksheet {
  getSheetId(): string;
  getSheetName(): string;
  getRange(
    row: number,
    column: number,
    numRows?: number,
    numColumns?: number,
  ): GridFacadeRange;
  insertRowsBefore(beforePosition: number, howMany: number): unknown;
  insertRowsAfter(afterPosition: number, howMany: number): unknown;
  deleteRows(rowPosition: number, howMany: number): unknown;
  insertColumnsBefore(beforePosition: number, howMany: number): unknown;
  insertColumnsAfter(afterPosition: number, howMany: number): unknown;
  deleteColumns(columnPosition: number, howMany: number): unknown;
  sort(colIndex: number, asc?: boolean): unknown;
}

export interface GridFacadeWorkbook {
  getActiveSheet(): GridFacadeWorksheet;
  insertSheet(name?: string): unknown;
  undo(): unknown;
  redo(): unknown;
}

/** Facade 的水平对齐取值。**`normal` 就是「右对齐」**，见 `gridFacadeAlignment`。 */
export type GridFacadeAlignment = "left" | "center" | "normal";

export interface GridUniverSelection {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface GridFacadePort {
  workbook: GridFacadeWorkbook;
  sheet: GridFacadeWorksheet;
  /** 当前选区对应的 range。 */
  range: GridFacadeRange;
  selection: GridUniverSelection;
}

// ── 两处上游语义陷阱，各自收成一个纯函数 ────────────────────────────────────

/**
 * 我们的「右对齐」在 Facade 里叫 `normal`。
 *
 * 这不是我编的别名：`transformFacadeHorizontalAlignment` 的实现里
 * `case "normal": return HorizontalAlign.RIGHT`，而 `default` 是 **`throw`**。
 * 也就是说把我们 L1 上那个 `"right"` 直接递进去，不是右对齐失效，是**当场抛异常**。
 * 上游这个命名是个疤，但它是既成事实，所以翻译只此一处、并且有测试钉着。
 */
export function gridFacadeAlignment(
  align: "left" | "center" | "right",
): GridFacadeAlignment {
  return align === "right" ? "normal" : align;
}

/**
 * 存量的 `type` + `decimals` → Excel 格式串。
 *
 * 旧载体用两个字段表达格式，新核只认格式串（`n.pattern`）。两者不是一一对应：
 * `auto` 在旧核是「让渲染器猜」，在新核里对应的是**没有格式串**——所以返回空串，
 * 由调用方决定是清掉格式还是不动，而不是在这里编一个 `General` 出来。
 */
export function gridTypePattern(
  type: GridCellType | undefined,
  decimals?: number,
): string {
  const digits =
    typeof decimals === "number" && decimals > 0
      ? `.${"0".repeat(Math.min(decimals, 10))}`
      : "";
  switch (type) {
    case "text":
      return "@";
    case "number":
      return `#,##0${digits}`;
    case "currency":
      return `¥#,##0${digits || ".00"}`;
    case "percent":
      return `0${digits}%`;
    case "date":
      return "yyyy-mm-dd";
    default:
      return "";
  }
}

// ── 命令表 ──────────────────────────────────────────────────────────────────

/** 这条命令归哪一层。`shell` = 不经 Facade，仍走宿主既有那条路。 */
export type GridUniverCommandLayer = "L1" | "L2" | "agent" | "shell";

export type GridUniverCommandArgs = Record<
  string,
  string | number | boolean | undefined
>;

export interface GridUniverCommand {
  id: string;
  label: string;
  layer: GridUniverCommandLayer;
  /** `shell` 层的命令没有执行器，写明它去哪儿了。 */
  delegatedTo?: string;
  run?: (port: GridFacadePort, args: GridUniverCommandArgs) => unknown;
}

function str(args: GridUniverCommandArgs, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function num(args: GridUniverCommandArgs, key: string, fallback: number): number {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function selectionRows(port: GridFacadePort): number {
  return Math.max(1, port.selection.endRow - port.selection.startRow + 1);
}

function selectionCols(port: GridFacadePort): number {
  return Math.max(1, port.selection.endColumn - port.selection.startColumn + 1);
}

/**
 * 表格的全部命令。**新增控件必须在这里落一行**，否则
 * `tests/grid-univer-facade-commands.test.mjs` 的覆盖闸会红：
 * 它把 `GridContextToolbar.tsx` 里的控件 id 全扫出来，逐个要求这里有执行器。
 */
export const GRID_UNIVER_COMMANDS: readonly GridUniverCommand[] = [
  // —— L1：选中格子后的直接动作 ——
  {
    id: "bold",
    label: "粗体",
    layer: "L1",
    run: (port, args) =>
      port.range.setFontWeight(args.on === false ? "normal" : "bold"),
  },
  {
    id: "align",
    label: "对齐",
    layer: "L1",
    run: (port, args) => {
      const raw = str(args, "value", "left");
      if (raw !== "left" && raw !== "center" && raw !== "right") return null;
      return port.range.setHorizontalAlignment(gridFacadeAlignment(raw));
    },
  },
  {
    id: "color",
    label: "文字色",
    layer: "L1",
    run: (port, args) => port.range.setFontColor(str(args, "value") || null),
  },
  {
    id: "background",
    label: "底色",
    layer: "L1",
    run: (port, args) => port.range.setBackgroundColor(str(args, "value")),
  },
  {
    id: "type",
    label: "数据类型",
    layer: "L1",
    run: (port, args) =>
      port.range.setNumberFormat(
        gridTypePattern(
          str(args, "value") as GridCellType,
          typeof args.decimals === "number" ? args.decimals : undefined,
        ),
      ),
  },
  {
    id: "decimals",
    label: "小数位",
    layer: "L1",
    run: (port, args) =>
      port.range.setNumberFormat(
        gridTypePattern(
          (str(args, "type") || "number") as GridCellType,
          num(args, "value", 2),
        ),
      ),
  },
  {
    id: "numfmt-preset",
    label: "格式预设",
    layer: "L2",
    run: (port, args) => {
      // 预设 → 格式串仍然走既有引擎（`grid-format/toolbar-bridge`），
      // 换核不换这张表：两边最后写进 XLSX 的都是同一个 `numFmt`。
      const pattern = numberFormatPatternForPreset(str(args, "value"));
      if (pattern === null) return null;
      return port.range.setNumberFormat(pattern);
    },
  },
  {
    id: "numfmt-pattern",
    label: "格式串",
    layer: "L2",
    run: (port, args) => port.range.setNumberFormat(str(args, "value")),
  },
  {
    id: "merge-cells",
    label: "合并所选单元格",
    layer: "L1",
    run: (port) => port.range.merge(),
  },
  {
    id: "split-cells",
    label: "拆分合并单元格",
    layer: "L1",
    run: (port) => port.range.breakApart(),
  },
  // —— L2：行列结构 ——
  {
    id: "row-before",
    label: "上方插入行",
    layer: "L2",
    run: (port) =>
      port.sheet.insertRowsBefore(port.selection.startRow, selectionRows(port)),
  },
  {
    id: "row-after",
    label: "下方插入行",
    layer: "L2",
    run: (port) =>
      port.sheet.insertRowsAfter(port.selection.endRow, selectionRows(port)),
  },
  {
    id: "row-delete",
    label: "删除所选行",
    layer: "L2",
    run: (port) =>
      port.sheet.deleteRows(port.selection.startRow, selectionRows(port)),
  },
  {
    id: "column-before",
    label: "左侧插入列",
    layer: "L2",
    run: (port) =>
      port.sheet.insertColumnsBefore(
        port.selection.startColumn,
        selectionCols(port),
      ),
  },
  {
    id: "column-after",
    label: "右侧插入列",
    layer: "L2",
    run: (port) =>
      port.sheet.insertColumnsAfter(
        port.selection.endColumn,
        selectionCols(port),
      ),
  },
  {
    id: "column-delete",
    label: "删除所选列",
    layer: "L2",
    run: (port) =>
      port.sheet.deleteColumns(
        port.selection.startColumn,
        selectionCols(port),
      ),
  },
  {
    id: "sort-asc",
    label: "升序",
    layer: "L2",
    run: (port) => port.sheet.sort(port.selection.startColumn, true),
  },
  {
    id: "sort-desc",
    label: "降序",
    layer: "L2",
    run: (port) => port.sheet.sort(port.selection.startColumn, false),
  },
  {
    id: "header-row",
    label: "首行为表头",
    layer: "L2",
    run: (port, args) => {
      // 旧核的「首行为表头」是渲染器的一个布尔；新核里同一个意思的落点是筛选器
      // 的表头行——有筛选器 = 首行是表头。关掉时移除筛选器而不是留一个空壳。
      if (args.on === false) {
        const existing = port.range.getFilter();
        return existing ? existing.remove() : null;
      }
      return port.range.getFilter() || port.range.createFilter();
    },
  },
  {
    id: "filter-query",
    label: "筛选当前列",
    layer: "L2",
    run: (port, args) => {
      const filter = port.range.getFilter() || port.range.createFilter();
      if (!filter) return null;
      const column = num(args, "column", port.selection.startColumn);
      const query = str(args, "value");
      if (!query) return filter.removeColumnFilterCriteria(column);
      return filter.setColumnFilterCriteria(column, {
        colId: column,
        filters: { filters: [query] },
      });
    },
  },
  // —— agent 面：`doc-family-commands.ts` 里那批 id，换核后同名同义 ——
  {
    id: "grid.set-cell",
    label: "写入单元格",
    layer: "agent",
    run: (port, args) =>
      port.sheet
        .getRange(num(args, "row", 0), num(args, "column", 0))
        .setValue(str(args, "value")),
  },
  {
    id: "grid.read-cell",
    label: "读取单元格",
    layer: "agent",
    run: (port, args) =>
      port.sheet
        .getRange(num(args, "row", 0), num(args, "column", 0))
        .getValue(),
  },
  {
    id: "grid.select-cell",
    label: "选中单元格",
    layer: "agent",
    run: (port, args) =>
      port.sheet.getRange(num(args, "row", 0), num(args, "column", 0)),
  },
  {
    id: "grid.insert-row",
    label: "插入行",
    layer: "agent",
    run: (port, args) =>
      port.sheet.insertRowsBefore(num(args, "row", 0), num(args, "count", 1)),
  },
  {
    id: "grid.insert-column",
    label: "插入列",
    layer: "agent",
    run: (port, args) =>
      port.sheet.insertColumnsBefore(
        num(args, "column", 0),
        num(args, "count", 1),
      ),
  },
  {
    id: "grid.sort-column",
    label: "按列排序",
    layer: "agent",
    run: (port, args) =>
      port.sheet.sort(num(args, "column", 0), str(args, "direction") !== "desc"),
  },
  {
    id: "grid.add-sheet",
    label: "新增工作表",
    layer: "agent",
    run: (port, args) => port.workbook.insertSheet(str(args, "name") || undefined),
  },
  {
    id: "grid.export",
    label: "导出",
    layer: "shell",
    delegatedTo:
      "GridWorkbookExport.ts（exceljs）—— 新核的高保真导出在 Pro 包里，仲裁 A-13 不许用",
  },
  {
    id: "grid.save",
    label: "保存",
    layer: "shell",
    delegatedTo: "AdvancedWorkbenchShell 的 persistence 队列（两级持久化不换）",
  },
];

const COMMAND_INDEX = new Map(
  GRID_UNIVER_COMMANDS.map((command) => [command.id, command]),
);

export function gridUniverCommand(id: string): GridUniverCommand | null {
  return COMMAND_INDEX.get(id) || null;
}

export type GridUniverCommandOutcome =
  | { ok: true; result: unknown }
  | { ok: false; reason: string };

/**
 * 执行一条命令。**未知 id 与「这条不归 Facade 管」是两种不同的失败**，
 * 分开报：前者是接线错了，后者是问错了人。
 */
export function runGridUniverCommand(
  id: string,
  port: GridFacadePort,
  args: GridUniverCommandArgs = {},
): GridUniverCommandOutcome {
  const command = gridUniverCommand(id);
  if (!command) {
    return { ok: false, reason: `表格里没有「${id}」这条命令。` };
  }
  if (!command.run) {
    return {
      ok: false,
      reason: `「${command.label}」不走内核 API：${command.delegatedTo || "由宿主处理"}。`,
    };
  }
  return { ok: true, result: command.run(port, args) };
}
