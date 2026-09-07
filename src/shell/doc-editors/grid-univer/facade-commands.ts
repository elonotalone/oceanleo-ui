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
import type { UITranslate } from "../../../i18n/ui/useUI";

// ── 端口 ────────────────────────────────────────────────────────────────────

export interface GridFacadeFilter {
  setColumnFilterCriteria(
    column: number,
    criteria: { colId: number; filters?: { filters?: string[] } },
  ): unknown;
  removeColumnFilterCriteria(column: number): unknown;
  remove(): unknown;
}

/**
 * 条件格式规则构造器（`@univerjs/preset-sheets-conditional-formatting` 的
 * `FConditionalFormattingBuilder`，OSS）。
 *
 * 只列我们 L2 那五个操作符用得到的方法。链式返回写成 `this` 而不是具体类名，
 * 是因为上游每个 `when*` 都返回 `ConditionalFormatHighlightRuleBuilder`——
 * 我们只需要「还能接着链下去」这件事。
 */
export interface GridFacadeConditionalBuilder {
  whenNumberGreaterThan(value: number): GridFacadeConditionalBuilder;
  whenNumberLessThan(value: number): GridFacadeConditionalBuilder;
  whenNumberEqualTo(value: number): GridFacadeConditionalBuilder;
  whenNumberNotEqualTo(value: number): GridFacadeConditionalBuilder;
  whenTextContains(text: string): GridFacadeConditionalBuilder;
  setFontColor(color?: string): GridFacadeConditionalBuilder;
  setBackground(color?: string): GridFacadeConditionalBuilder;
  setBold(isBold: boolean): GridFacadeConditionalBuilder;
  setRanges(ranges: GridFacadeRangeSpec[]): GridFacadeConditionalBuilder;
  build(): unknown;
}

/** `IRange` 的四个字段，写在这里免得为了一个矩形把 Univer 的类型拖进来。 */
export interface GridFacadeRangeSpec {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

/**
 * 数据验证构造器（`@univerjs/preset-sheets-data-validation`，OSS）。
 *
 * `setAllowInvalid` 就是我们「违规时」那个开关：`warn` = 允许落地并标记
 * （`setAllowInvalid(true)`），`block` = 拒绝录入（`false`）。上游没有第三档，
 * 所以我们那两个取值刚好覆盖，不必缩小承诺。
 */
export interface GridFacadeValidationBuilder {
  requireValueInList(
    values: string[],
    multiple?: boolean,
    showDropdown?: boolean,
  ): GridFacadeValidationBuilder;
  requireNumberBetween(
    start: number,
    end: number,
    isInteger?: boolean,
  ): GridFacadeValidationBuilder;
  requireNumberNotBetween(
    start: number,
    end: number,
    isInteger?: boolean,
  ): GridFacadeValidationBuilder;
  requireNumberEqualTo(num: number, isInteger?: boolean): GridFacadeValidationBuilder;
  requireNumberNotEqualTo(
    num: number,
    isInteger?: boolean,
  ): GridFacadeValidationBuilder;
  requireNumberGreaterThan(
    num: number,
    isInteger?: boolean,
  ): GridFacadeValidationBuilder;
  requireNumberLessThan(num: number, isInteger?: boolean): GridFacadeValidationBuilder;
  requireNumberGreaterThanOrEqualTo(
    num: number,
    isInteger?: boolean,
  ): GridFacadeValidationBuilder;
  requireNumberLessThanOrEqualTo(
    num: number,
    isInteger?: boolean,
  ): GridFacadeValidationBuilder;
  requireDateBetween(start: Date, end: Date): GridFacadeValidationBuilder;
  requireDateNotBetween(start: Date, end: Date): GridFacadeValidationBuilder;
  requireDateEqualTo(date: Date): GridFacadeValidationBuilder;
  requireDateAfter(date: Date): GridFacadeValidationBuilder;
  requireDateBefore(date: Date): GridFacadeValidationBuilder;
  requireDateOnOrAfter(date: Date): GridFacadeValidationBuilder;
  requireDateOnOrBefore(date: Date): GridFacadeValidationBuilder;
  requireFormulaSatisfied(formula: string): GridFacadeValidationBuilder;
  setAllowInvalid(allowInvalidData: boolean): GridFacadeValidationBuilder;
  build(): unknown;
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
  /** 条件格式（OSS 插件的 facade 扩展）。 */
  createConditionalFormattingRule(): GridFacadeConditionalBuilder;
  getConditionalFormattingRules(): { cfId?: string }[];
  clearConditionalFormatRules(): unknown;
  /** 数据验证（OSS 插件的 facade 扩展）。 */
  setDataValidation(rule: unknown): unknown;
  getDataValidation(): unknown;
  getValidatorStatus(): Promise<unknown>;
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

/**
 * `univerAPI` 自己（`FUniver`）上我们要用的那一个方法。
 *
 * 单独成一个面而不是塞进 workbook：`newDataValidation()` 挂在 `univerAPI` 上、
 * 不挂在工作簿上（`sheets-data-validation` 的 `f-univer.d.ts:45`）。
 * 照工作簿的形状写会在接线那一刻才发现，而那是没有类型帮忙的地方。
 */
export interface GridFacadeApi {
  newDataValidation(): GridFacadeValidationBuilder;
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
  api: GridFacadeApi;
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

/**
 * 这条命令归哪一层。
 *
 * - `L1` / `L2` / `agent`：有执行器，进 Facade，一次调用一条 Univer history；
 * - `shell`：不经 Facade，仍走宿主既有那条路（导出、保存）；
 * - `draft`：**只改面板草稿，不碰文档**。条件格式与数据验证那两组里，
 *   用户挑操作符/填界值的过程有十几步，每步都写工作簿会把撤销栈灌满草稿，
 *   而用户一次都没说「应用」。这一层的存在就是为了让「哪些控件允许不进 Facade」
 *   是一张能被读完的表，而不是散落在组件里的判断。
 */
export type GridUniverCommandLayer =
  | "L1"
  | "L2"
  | "agent"
  | "shell"
  | "draft";

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

/**
 * 命令表里的 `label` 是**中文原文即 key**：上屏前一律经这里过 `tt()`。
 *
 * 表本身保持纯数据（不持有 `tt`，也不 import React）；舞台在建浮条 / 检查器 /
 * 审阅提案文案时把 `useUI()` 的 `tt` 递进来。`tests/i18n-tt-key-coverage.test.mjs`
 * 靠这处 `tt(command.label)` 认出本文件是「声明侧」，于是表里每一条 `label:`
 * 都进 16 语齐全的判据——少一条译文当场红，不靠人记得补。
 */
export function gridUniverCommandLabel(
  command: Pick<GridUniverCommand, "label">,
  tt: UITranslate,
): string {
  return tt(command.label);
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

/** L2 条件格式面板上那五个操作符（`GridContextToolbar.tsx:424-434` 实读）。 */
export type GridConditionOperator =
  | "greater-than"
  | "less-than"
  | "equal"
  | "not-equal"
  | "contains";

export interface GridConditionalDraft {
  operator: GridConditionOperator;
  value: string;
  /** 数值形态；`contains` 之外的四个操作符都需要它，拿不到就不建规则。 */
  numeric: number | null;
  color: string;
  background: string;
  bold: boolean;
}

/**
 * 把面板递过来的参数收成一条条件格式草稿。
 *
 * 空的比较值返回 `null` 而不是「当成 0」：`>0` 与「用户还没填」是两件完全
 * 不同的事，猜成前者会让一条用户没打算建的规则染满整片选区。
 */
export function gridConditionalDraft(
  args: GridUniverCommandArgs,
): GridConditionalDraft | null {
  const operator = str(args, "operator", "greater-than");
  const allowed: GridConditionOperator[] = [
    "greater-than",
    "less-than",
    "equal",
    "not-equal",
    "contains",
  ];
  if (!allowed.includes(operator as GridConditionOperator)) return null;
  const value = str(args, "value").trim();
  if (!value) return null;
  const parsed = Number(value);
  return {
    operator: operator as GridConditionOperator,
    value,
    numeric: Number.isFinite(parsed) ? parsed : null,
    color: str(args, "color"),
    background: str(args, "background"),
    bold: args.bold === true,
  };
}

/**
 * 把数据验证面板的草稿翻成内核规则。返回 `null` = 这份草稿还不成立。
 *
 * 两处**不许猜**的地方，各自返回 `null`：
 * - 数字类拿不到有限数（用户打了半个数）；
 * - 日期类 `new Date()` 出 `Invalid Date`（`requireDateAfter` 收 `Date`，
 *   递一个 `Invalid Date` 进去不会报错，会静默造出一条永不命中的规则）。
 *
 * `warn` / `block` 落到 `setAllowInvalid(true/false)`：上游只有这一档开关，
 * 语义与旧核的两个取值恰好对齐（`warn` 允许落地并标记 / `block` 拒绝录入）。
 */
export function buildGridValidationRule(
  port: GridFacadePort,
  args: GridUniverCommandArgs,
): unknown {
  const kind = str(args, "kind", "list");
  const operator = str(args, "operator", "between");
  const raw = str(args, "value").trim();
  const raw2 = str(args, "value2").trim();
  if (!raw) return null;
  let builder = port.api.newDataValidation();

  if (kind === "list") {
    const values = raw
      .split(/[,，\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (values.length === 0) return null;
    builder = builder.requireValueInList(values, false, true);
  } else if (kind === "custom") {
    builder = builder.requireFormulaSatisfied(raw);
  } else if (kind === "date") {
    const start = new Date(raw);
    if (Number.isNaN(start.getTime())) return null;
    const end = raw2 ? new Date(raw2) : null;
    const needsEnd = operator === "between" || operator === "not-between";
    if (needsEnd && (!end || Number.isNaN(end.getTime()))) return null;
    switch (operator) {
      case "between":
        builder = builder.requireDateBetween(start, end as Date);
        break;
      case "not-between":
        builder = builder.requireDateNotBetween(start, end as Date);
        break;
      case "equal":
        builder = builder.requireDateEqualTo(start);
        break;
      case "greater-than":
        builder = builder.requireDateAfter(start);
        break;
      case "less-than":
        builder = builder.requireDateBefore(start);
        break;
      case "greater-equal":
        builder = builder.requireDateOnOrAfter(start);
        break;
      case "less-equal":
        builder = builder.requireDateOnOrBefore(start);
        break;
      default:
        // 日期没有「不等于」的上游方法；不自己拼公式假装有（§10 第 2 条）。
        return null;
    }
  } else {
    // whole / decimal / text-length 都落到数字闸；`whole` 要整数。
    const start = Number(raw);
    if (!Number.isFinite(start)) return null;
    const isInteger = kind === "whole" || kind === "text-length";
    const needsEnd = operator === "between" || operator === "not-between";
    const end = raw2 ? Number(raw2) : null;
    if (needsEnd && (end === null || !Number.isFinite(end))) return null;
    switch (operator) {
      case "between":
        builder = builder.requireNumberBetween(start, end as number, isInteger);
        break;
      case "not-between":
        builder = builder.requireNumberNotBetween(
          start,
          end as number,
          isInteger,
        );
        break;
      case "equal":
        builder = builder.requireNumberEqualTo(start, isInteger);
        break;
      case "not-equal":
        builder = builder.requireNumberNotEqualTo(start, isInteger);
        break;
      case "greater-than":
        builder = builder.requireNumberGreaterThan(start, isInteger);
        break;
      case "less-than":
        builder = builder.requireNumberLessThan(start, isInteger);
        break;
      case "greater-equal":
        builder = builder.requireNumberGreaterThanOrEqualTo(start, isInteger);
        break;
      case "less-equal":
        builder = builder.requireNumberLessThanOrEqualTo(start, isInteger);
        break;
      default:
        return null;
    }
  }
  return builder.setAllowInvalid(str(args, "behavior", "warn") !== "block").build();
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
    id: "numfmt-preview",
    label: "格式预览",
    layer: "draft",
    delegatedTo:
      "只读回显：既有 numberFormatPreview（用导出链同一台引擎渲染，换核不换）",
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
  // —— L2 条件格式：五个操作符 → OSS 条件格式插件的 builder ——
  //
  // 这一组里**只有 `condition-apply` 与 `condition-clear` 改文档**，其余六个
  // 是草稿态（用户还在挑操作符、填比较值）。草稿态不进 Facade 不是偷懒：
  // 每挑一次操作符就往工作簿写一条规则，撤销栈会被草稿灌满，而用户一次都没说「应用」。
  // ⇒ 它们声明成 `draft` 层，由 `GridUniverStage` 存在组件 state 里。
  {
    id: "condition-rule",
    label: "本表规则",
    layer: "draft",
    delegatedTo: "选规则只改草稿的选中项；规则清单来自 getConditionalFormattingRules()",
  },
  {
    id: "condition-rule-detail",
    label: "规则说明",
    layer: "draft",
    delegatedTo: "只读回显（既有 describeConditionalRule）",
  },
  {
    id: "condition-operator",
    label: "条件",
    layer: "draft",
    delegatedTo: "草稿态：五个操作符的选择，按下「应用」时才进 Facade",
  },
  {
    id: "condition-value",
    label: "比较值",
    layer: "draft",
    delegatedTo: "草稿态：比较值",
  },
  {
    id: "condition-color",
    label: "条件文字色",
    layer: "draft",
    delegatedTo: "草稿态：命中时的文字色",
  },
  {
    id: "condition-background",
    label: "条件底色",
    layer: "draft",
    delegatedTo: "草稿态：命中时的底色",
  },
  {
    id: "condition-bold",
    label: "条件粗体",
    layer: "draft",
    delegatedTo: "草稿态：命中时是否加粗",
  },
  {
    id: "condition-apply",
    label: "应用到所选区域",
    layer: "L2",
    run: (port, args) => {
      const draft = gridConditionalDraft(args);
      if (!draft) return null;
      // 草稿先验完再碰内核：`contains` 之外的四个操作符都要一个有限数，
      // 拿不到就一步都不迈。先建 builder 再中途 `return null` 会在内核里留下
      // 一个没人 build 的半成品——今天不改文档，但下一个读这段的人会以为
      // 「已经开始建规则了」，而且顺序一变就真的落地了。
      const needsNumber = draft.operator !== "contains";
      if (needsNumber && draft.numeric === null) return null;
      let builder = port.range.createConditionalFormattingRule();
      switch (draft.operator) {
        case "greater-than":
          builder = builder.whenNumberGreaterThan(draft.numeric as number);
          break;
        case "less-than":
          builder = builder.whenNumberLessThan(draft.numeric as number);
          break;
        case "equal":
          builder = builder.whenNumberEqualTo(draft.numeric as number);
          break;
        case "not-equal":
          builder = builder.whenNumberNotEqualTo(draft.numeric as number);
          break;
        case "contains":
          builder = builder.whenTextContains(draft.value);
          break;
        default:
          return null;
      }
      if (draft.color) builder = builder.setFontColor(draft.color);
      if (draft.background) builder = builder.setBackground(draft.background);
      builder = builder.setBold(draft.bold);
      return builder
        .setRanges([
          {
            startRow: port.selection.startRow,
            endRow: port.selection.endRow,
            startColumn: port.selection.startColumn,
            endColumn: port.selection.endColumn,
          },
        ])
        .build();
    },
  },
  {
    id: "condition-clear",
    label: "清除所选区域规则",
    layer: "L2",
    run: (port) => port.range.clearConditionalFormatRules(),
  },
  // —— L2 数据验证：六种类型 × 八个操作符 → OSS 数据验证插件的 builder ——
  //
  // 同上：只有「圈出无效数据」是真动作，其余五个是草稿态。
  {
    id: "validation-kind",
    label: "验证类型",
    layer: "draft",
    delegatedTo: "草稿态：list/whole/decimal/date/text-length/custom",
  },
  {
    id: "validation-operator",
    label: "比较",
    layer: "draft",
    delegatedTo: "草稿态：八个操作符（list/custom 下禁用）",
  },
  {
    id: "validation-value",
    label: "下限或值",
    layer: "draft",
    delegatedTo: "草稿态：第一个界值",
  },
  {
    id: "validation-value2",
    label: "上限",
    layer: "draft",
    delegatedTo: "草稿态：第二个界值（只有 between/not-between 读）",
  },
  {
    id: "validation-behavior",
    label: "违规时",
    layer: "draft",
    delegatedTo: "草稿态：warn=setAllowInvalid(true) / block=setAllowInvalid(false)",
  },
  {
    id: "validation-check",
    label: "圈出所选区域的无效数据",
    layer: "L2",
    run: (port, args) => {
      const rule = buildGridValidationRule(port, args);
      if (!rule) return null;
      port.range.setDataValidation(rule);
      // 圈出无效数据这件事本身由内核画，我们要的是那份状态好写回执。
      return port.range.getValidatorStatus();
    },
  },
  {
    id: "validation-report",
    label: "检查结果",
    layer: "draft",
    delegatedTo: "只读回显：getValidatorStatus() 的报数",
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
      reason:
        command.layer === "draft"
          ? `「${command.label}」只改面板草稿，不动文档：${command.delegatedTo || "由面板自己存"}。`
          : `「${command.label}」不走内核 API：${command.delegatedTo || "由宿主处理"}。`,
    };
  }
  return { ok: true, result: command.run(port, args) };
}
