/**
 * 存量表格载体 ⇄ Univer 工作簿快照。
 *
 * 两个方向都要，而且**必须是同一份代码的两半**：
 *
 * - 正向（`gridSheetsToUniverSnapshot`）是判据 5「存量文档只读打开 + 一键转换」的引擎；
 * - 反向（`univerSnapshotToGridSheets`）是判据 4「XLSX 导入导出走现有 exceljs」的接线。
 *   新核不自带我们要的 XLSX 保真度（那在 Pro 的 `-advanced` 里，仲裁 A-13 明令不许碰），
 *   所以导出这一步仍然交给 `GridWorkbookExport.ts` 那条已经被 21 份测试守住的老路：
 *   Univer 快照 → `GridSheet[]` → 现有 exceljs 链。**换核不等于把导出保真度一起换掉。**
 *
 * 类型从 `@univerjs/presets` 以 `import type` 取；运行时只从同一包拿
 * `getPlainText`（A-64：不许自写 dataStream 切片器）。`@univerjs/core`
 * 不是直接依赖，解析不到。本模块只被 Univer 叶子 `GridUniverStage` 与测试加载。
 */
import { getPlainText } from "@univerjs/presets";
import type {
  ICellData,
  IRange,
  IStyleData,
  IWorkbookData,
  IWorksheetData,
  Nullable,
} from "@univerjs/presets";
import type { GridCellFormat, GridSheet } from "../grid-model";
import type {
  GridConditionalFormat,
  GridConditionalOperator,
  GridMerge,
  GridRange,
} from "../grid-structure";
import { translateGridFormula } from "../grid-structure";

/** Univer 空白表的最小尺寸；存量表比它小就补到这里，和旧核的空表观感一致。 */
export const GRID_UNIVER_MIN_ROWS = 20;
export const GRID_UNIVER_MIN_COLS = 8;

/** `IWorkbookData.appVersion` 写死成我们锁的那一版，出问题时快照自带出处。 */
export const GRID_UNIVER_APP_VERSION = "0.25.1";

/** `HorizontalAlign`：1=左 2=中 3=右（`@univerjs/core` 的 enum 值，实读 `.d.ts`）。 */
const HORIZONTAL_ALIGN: Record<NonNullable<GridCellFormat["align"]>, number> = {
  left: 1,
  center: 2,
  right: 3,
};

/** `CellValueType`：1=字符串 2=数字（同上）。 */
const CELL_VALUE_STRING = 1;
const CELL_VALUE_NUMBER = 2;

/**
 * 一次转换的如实报数。**不是日志，是判据 5 要给用户看的那句话的原料**：
 * 「转过去了什么、有什么没带过去」——没带过去的东西必须点名，
 * 否则用户是在一个静默丢了数据的文件上继续工作。
 */
export interface GridUniverConversionReport {
  sheets: number;
  cells: number;
  formulas: number;
  styledCells: number;
  merges: number;
  /** 本波带不过去的东西，每条一句人话。 */
  dropped: string[];
}

export interface GridUniverSnapshotOptions {
  /** 工作簿 id；不给就用第一张表的 id 派生，保证同一份文档反复转换得到同一个 id。 */
  id?: string;
  name?: string;
}

/**
 * 读回（Univer → GridSheet）带不过去的东西。导出链没有 inbound 那份
 * `report.dropped`，所以这里单独收：调用方（导出/另存）必须拿去显示，
 * 否则色阶这类降级又会变成静默丢失。
 */
export interface GridUniverOutboundNotes {
  dropped: string[];
}

/** Univer 条件格式插件写进 `workbook.resources` 的名字。实读 0.25.1 `toJson`。 */
export const GRID_UNIVER_CF_PLUGIN = "SHEET_CONDITIONAL_FORMATTING_PLUGIN";

const CF_NUMBER_OPERATOR: Record<string, GridConditionalOperator> = {
  greaterThan: "greater-than",
  lessThan: "less-than",
  equal: "equal",
  notEqual: "not-equal",
};

function rgbFromUniver(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rgb = String((value as { rgb?: unknown }).rgb ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(rgb)) return rgb;
  if (/^[0-9a-f]{6}$/i.test(rgb)) return `#${rgb}`;
  return undefined;
}

function univerRangeToGrid(range: unknown): GridRange | null {
  if (!range || typeof range !== "object" || Array.isArray(range)) return null;
  const source = range as Record<string, unknown>;
  const firstRow = Number(source.startRow);
  const lastRow = Number(source.endRow);
  const firstCol = Number(source.startColumn);
  const lastCol = Number(source.endColumn);
  if (
    ![firstRow, lastRow, firstCol, lastCol].every((value) =>
      Number.isInteger(value),
    )
  ) {
    return null;
  }
  return {
    firstRow: Math.min(firstRow, lastRow),
    lastRow: Math.max(firstRow, lastRow),
    firstCol: Math.min(firstCol, lastCol),
    lastCol: Math.max(firstCol, lastCol),
  };
}

function parseUniverCfResource(data: unknown): Record<string, unknown[]> {
  if (data == null) return {};
  let parsed: unknown = data;
  if (typeof data === "string") {
    if (!data.trim()) return {};
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, unknown[]> = {};
  for (const [sheetId, rules] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    out[sheetId] = Array.isArray(rules) ? rules : [];
  }
  return out;
}

function droppedCfLabel(rule: Record<string, unknown>): string {
  const type = String(rule.type || "");
  if (type === "colorScale") return "色阶";
  if (type === "dataBar") return "数据条";
  if (type === "iconSet") return "图标集";
  const subType = String(rule.subType || "");
  const operator = String(rule.operator || "");
  if (subType === "uniqueValues") return "「唯一值」高亮";
  if (subType === "duplicateValues") return "「重复值」高亮";
  if (subType === "rank") return "「前/后 N」高亮";
  if (subType === "timePeriod") return "「日期时段」高亮";
  if (subType === "average") return "「高于/低于平均值」高亮";
  if (subType === "formula") return "「公式」高亮";
  if (subType === "text" && operator && operator !== "containsText") {
    return `「文本 ${operator}」高亮`;
  }
  if (subType === "number" && operator && !(operator in CF_NUMBER_OPERATOR)) {
    return `「数值 ${operator}」高亮`;
  }
  if (type === "highlightCell") return "其它高亮";
  return type ? `「${type}」条件格式` : "未知条件格式";
}

function mapUniverCfRule(raw: unknown): {
  mapped: GridConditionalFormat[];
  dropped: string | null;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { mapped: [], dropped: "未知条件格式" };
  }
  const entry = raw as Record<string, unknown>;
  const spec =
    entry.rule && typeof entry.rule === "object" && !Array.isArray(entry.rule)
      ? (entry.rule as Record<string, unknown>)
      : entry;
  const type = String(spec.type || "");
  const subType = String(spec.subType || "");
  const operator = String(spec.operator || "");
  const ranges = Array.isArray(entry.ranges) ? entry.ranges : [];
  const gridRanges = ranges
    .map(univerRangeToGrid)
    .filter((range): range is GridRange => range !== null);
  if (gridRanges.length === 0) {
    return { mapped: [], dropped: droppedCfLabel(spec) };
  }

  let mappedOperator: GridConditionalOperator | null = null;
  let mappedValue = "";
  if (type === "highlightCell" && subType === "number") {
    mappedOperator = CF_NUMBER_OPERATOR[operator] ?? null;
    if (mappedOperator && spec.value !== undefined && spec.value !== null) {
      mappedValue = String(spec.value);
    } else {
      mappedOperator = null;
    }
  } else if (
    type === "highlightCell" &&
    subType === "text" &&
    operator === "containsText"
  ) {
    mappedOperator = "contains";
    mappedValue = String(spec.value ?? "");
  }

  if (!mappedOperator) {
    return { mapped: [], dropped: droppedCfLabel(spec) };
  }

  const style =
    spec.style && typeof spec.style === "object" && !Array.isArray(spec.style)
      ? (spec.style as Record<string, unknown>)
      : {};
  const color = rgbFromUniver(style.cl);
  const background = rgbFromUniver(style.bg);
  const baseId = String(entry.cfId || entry.id || "cf").slice(0, 80) || "cf";
  return {
    mapped: gridRanges.map((range, index) => ({
      id: gridRanges.length === 1 ? baseId : `${baseId}:${index + 1}`,
      range,
      operator: mappedOperator,
      value: mappedValue.slice(0, 240),
      ...(color ? { color } : {}),
      ...(background ? { background } : {}),
      ...(style.bl ? { bold: true } : {}),
    })),
    dropped: null,
  };
}

/**
 * 从活快照 `resources` 里取出五操作符条件格式。色阶 / 数据条 / 图标集
 * 以及其它高亮子类写进 `notes.dropped`，不许静默丢。
 */
export function readUniverConditionalFormats(
  data: Partial<IWorkbookData> | null | undefined,
  notes?: GridUniverOutboundNotes,
): Map<string, GridConditionalFormat[]> {
  const bySheet = new Map<string, GridConditionalFormat[]>();
  const resources = Array.isArray(data?.resources) ? data.resources : [];
  const plugin = resources.find((entry) => entry?.name === GRID_UNIVER_CF_PLUGIN);
  const grouped = parseUniverCfResource(plugin?.data);
  const droppedCounts = new Map<string, number>();
  for (const [sheetId, rules] of Object.entries(grouped)) {
    const mapped: GridConditionalFormat[] = [];
    for (const rule of rules) {
      const outcome = mapUniverCfRule(rule);
      mapped.push(...outcome.mapped);
      if (outcome.dropped) {
        droppedCounts.set(
          outcome.dropped,
          (droppedCounts.get(outcome.dropped) || 0) + 1,
        );
      }
    }
    bySheet.set(sheetId, mapped);
  }
  if (notes) {
    for (const [label, count] of droppedCounts) {
      notes.dropped.push(
        `${count} 条${label}没有带过去（导出只接大于/小于/等于/不等于/包含这五种高亮）`,
      );
    }
  }
  return bySheet;
}

/** 把读回降级说成人话。没有丢的时候是空串，调用方不要凭空弹一句。 */
export function gridUniverOutboundWarning(
  notes: GridUniverOutboundNotes,
): string {
  if (notes.dropped.length === 0) return "";
  return `以下内容没有带过去：${notes.dropped.join("；")}。`;
}

function isFormula(value: string): boolean {
  return value.startsWith("=") && value.length > 1;
}

/**
 * 这个字符串该不该当数字存。
 *
 * 只认「整个串就是一个有限数」，不做任何本地化解析：`1,234` 在中文环境是一千二百三十四，
 * 在别处是 1.234，猜错了就是**静默改数据**。存成文本至少是用户当初打进去的东西。
 */
function numericValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 存量格式 → Univer 样式。返回 `null` = 这个格子没有任何要带过去的样式。 */
export function gridFormatToUniverStyle(
  format: GridCellFormat | undefined,
): IStyleData | null {
  if (!format) return null;
  const style: IStyleData = {};
  let touched = false;
  if (format.bold) {
    style.bl = 1;
    touched = true;
  }
  if (format.align) {
    style.ht = HORIZONTAL_ALIGN[format.align];
    touched = true;
  }
  if (format.color) {
    style.cl = { rgb: format.color };
    touched = true;
  }
  if (format.background) {
    style.bg = { rgb: format.background };
    touched = true;
  }
  // `numFmt` 是 Excel 的格式串，Univer 的 `n.pattern` 收的正是同一种串
  // （两边都直接进 XLSX 的 `numFmt`），所以这里是平移不是翻译。
  // `type` / `decimals` 那两个自研字段没有对应位：它们表达不了自定义格式，
  // 本来就是 `numFmt` 的退化形式，由调用方先归一化。
  if (format.numFmt) {
    style.n = { pattern: format.numFmt };
    touched = true;
  }
  return touched ? style : null;
}

/**
 * Univer 样式 → 存量格式。反向要能把上面写进去的东西原样取回来。
 *
 * 入参写 `Nullable<IStyleData | string>` 而不是 `… | null | undefined`：
 * `ICellData.s` 的声明就是 `Nullable<…>`，而 Univer 的 `Nullable<T>` 是
 * `T | null | undefined | void`（`@univerjs/core` `shared/types.d.ts:19`）——
 * **多一个 `void`**，所以照直觉写窄一档，`cell.s` 递进来就 TS2345。
 * 这里跟着上游的别名走，多出来的 `void` 与 `null` 一样落进下面那句 falsy 判断。
 */
export function univerStyleToGridFormat(
  style: Nullable<IStyleData | string>,
): GridCellFormat | null {
  if (!style || typeof style === "string") return null;
  const format: GridCellFormat = {};
  let touched = false;
  if (style.bl) {
    format.bold = true;
    touched = true;
  }
  if (style.ht === 1 || style.ht === 2 || style.ht === 3) {
    format.align = style.ht === 1 ? "left" : style.ht === 2 ? "center" : "right";
    touched = true;
  }
  if (style.cl?.rgb) {
    format.color = style.cl.rgb;
    touched = true;
  }
  if (style.bg?.rgb) {
    format.background = style.bg.rgb;
    touched = true;
  }
  if (style.n?.pattern) {
    format.numFmt = style.n.pattern;
    touched = true;
  }
  return touched ? format : null;
}

function mergeToRange(merge: GridMerge): IRange {
  return {
    startRow: merge.firstRow,
    endRow: merge.lastRow,
    startColumn: merge.firstCol,
    endColumn: merge.lastCol,
  };
}

function rangeToMerge(range: IRange): GridMerge {
  return {
    firstRow: range.startRow,
    lastRow: range.endRow,
    firstCol: range.startColumn,
    lastCol: range.endColumn,
  };
}

function cellPlainTextFromDocument(cell: ICellData): string {
  const dataStream = cell.p?.body?.dataStream;
  if (typeof dataStream !== "string" || !dataStream) return "";
  return getPlainText(dataStream);
}

function cellHasStyledRuns(cell: ICellData): boolean {
  const runs = cell.p?.body?.textRuns;
  if (!Array.isArray(runs)) return false;
  return runs.some((run) => {
    const ts =
      run && typeof run === "object"
        ? (run as { ts?: { bl?: unknown; cl?: unknown } }).ts
        : undefined;
    return Boolean(ts?.bl || ts?.cl);
  });
}

function cellTextFallback(cell: ICellData): string {
  if (cell.v !== undefined && cell.v !== null) return String(cell.v);
  return cellPlainTextFromDocument(cell);
}

/**
 * Univer 活快照里 `cell.s` 经常是样式表 id，真样式在 `workbook.styles[id]`。
 * `Workbook.save()` 只是深拷贝这份快照，不会把 id 展开成对象。
 * 不查表的话，用户在新核里设的加粗 / 颜色 / 数字格式导出时会全部消失。
 */
function resolveUniverStyle(
  ref: Nullable<IStyleData | string>,
  catalog: IWorkbookData["styles"] | undefined,
): IStyleData | null {
  if (!ref) return null;
  if (typeof ref === "string") {
    const resolved = catalog?.[ref];
    if (!resolved || typeof resolved === "string") return null;
    return resolved;
  }
  return ref;
}

/**
 * `GridSheet[]` → Univer 快照。第二个返回值是报数（判据 5 要显示给用户）。
 */
export function gridSheetsToUniverSnapshot(
  sheets: readonly GridSheet[],
  options: GridUniverSnapshotOptions = {},
): { data: Partial<IWorkbookData>; report: GridUniverConversionReport } {
  const report: GridUniverConversionReport = {
    sheets: 0,
    cells: 0,
    formulas: 0,
    styledCells: 0,
    merges: 0,
    dropped: [],
  };
  const sheetOrder: string[] = [];
  const out: Record<string, Partial<IWorksheetData>> = {};
  let conditionalRules = 0;

  for (const sheet of sheets) {
    const rows = sheet.rows || [];
    const cellData: Record<number, Record<number, ICellData>> = {};
    let maxCol = 0;
    for (let row = 0; row < rows.length; row += 1) {
      const line = rows[row] || [];
      maxCol = Math.max(maxCol, line.length);
      for (let col = 0; col < line.length; col += 1) {
        const raw = line[col] ?? "";
        const style = gridFormatToUniverStyle(sheet.formats?.[`${row}:${col}`]);
        if (!raw && !style) continue;
        const cell: ICellData = {};
        if (isFormula(raw)) {
          cell.f = raw;
          report.formulas += 1;
        } else if (raw) {
          const numeric = numericValue(raw);
          if (numeric === null) {
            cell.v = raw;
            cell.t = CELL_VALUE_STRING;
          } else {
            cell.v = numeric;
            cell.t = CELL_VALUE_NUMBER;
          }
        }
        if (style) {
          cell.s = style;
          report.styledCells += 1;
        }
        if (raw) report.cells += 1;
        cellData[row] = cellData[row] || {};
        cellData[row][col] = cell;
      }
    }
    const merges = (sheet.merges || []).map(mergeToRange);
    report.merges += merges.length;
    conditionalRules += (sheet.conditionalFormats || []).length;
    sheetOrder.push(sheet.id);
    out[sheet.id] = {
      id: sheet.id,
      name: sheet.name,
      rowCount: Math.max(rows.length, GRID_UNIVER_MIN_ROWS),
      columnCount: Math.max(maxCol, GRID_UNIVER_MIN_COLS),
      cellData,
      mergeData: merges,
    };
    report.sheets += 1;
  }

  if (conditionalRules > 0) {
    // 自研条件格式的规则形状（五个操作符 + 单区域）与 Univer 的条件格式插件不是
    // 同一套语义，逐条映射属于另一件活。**不静默丢**：在这里点名，由调用方显示。
    report.dropped.push(
      `${conditionalRules} 条条件格式规则没有带过去（新核的条件格式规则形状不同，需要逐条重建）`,
    );
  }

  return {
    data: {
      id: options.id || `grid-${sheets[0]?.id || "empty"}`,
      name: options.name || "工作簿",
      appVersion: GRID_UNIVER_APP_VERSION,
      sheetOrder,
      sheets: out,
      styles: {},
    },
    report,
  };
}

/**
 * Univer 快照 → `GridSheet[]`。导出链（XLSX/CSV/PDF）与恢复快照都走这里。
 *
 * 稀疏的 `cellData` 要摊平成稠密的 `string[][]`：旧载体是二维数组，
 * 缺的格子必须是空串而不是 `undefined`，否则 `rows[r][c].trim()` 那类调用点会当场炸。
 */
export function univerSnapshotToGridSheets(
  data: Partial<IWorkbookData> | null | undefined,
  notes?: GridUniverOutboundNotes,
): GridSheet[] {
  const sheets = data?.sheets || {};
  const order =
    data?.sheetOrder && data.sheetOrder.length > 0
      ? data.sheetOrder
      : Object.keys(sheets);
  const cfBySheet = readUniverConditionalFormats(data, notes);
  const result: GridSheet[] = [];
  for (const sheetId of order) {
    const sheet = sheets[sheetId];
    if (!sheet) continue;
    const cellData = (sheet.cellData || {}) as Record<
      string,
      Record<string, ICellData>
    >;
    let maxRow = 0;
    let maxCol = 0;
    const sharedMasters = new Map<
      string,
      { formula: string; row: number; col: number }
    >();
    for (const rowKey of Object.keys(cellData)) {
      const row = Number(rowKey);
      if (!Number.isInteger(row)) continue;
      maxRow = Math.max(maxRow, row + 1);
      for (const colKey of Object.keys(cellData[rowKey] || {})) {
        const col = Number(colKey);
        if (!Number.isInteger(col)) continue;
        maxCol = Math.max(maxCol, col + 1);
        const probe = cellData[rowKey][colKey] || {};
        const formula =
          typeof probe.f === "string" ? probe.f.trim() : "";
        const si = typeof probe.si === "string" ? probe.si : "";
        // 空 `f` 是假值（Univer 0.25.1 公式引擎对从格写 `{ f:"", si }`）。
        if (formula.startsWith("=") && formula.length > 1 && si && !sharedMasters.has(si)) {
          sharedMasters.set(si, { formula, row, col });
        }
      }
    }
    const rowCount = Math.max(
      maxRow,
      sheet.rowCount || 0,
      GRID_UNIVER_MIN_ROWS,
    );
    const colCount = Math.max(
      maxCol,
      sheet.columnCount || 0,
      GRID_UNIVER_MIN_COLS,
    );
    const rows: string[][] = Array.from({ length: rowCount }, () =>
      Array<string>(colCount).fill(""),
    );
    const formats: Record<string, GridCellFormat> = {};
    let richRunsDropped = 0;
    for (const rowKey of Object.keys(cellData)) {
      const row = Number(rowKey);
      if (!Number.isInteger(row) || row < 0 || row >= rowCount) continue;
      for (const colKey of Object.keys(cellData[rowKey] || {})) {
        const col = Number(colKey);
        if (!Number.isInteger(col) || col < 0 || col >= colCount) continue;
        const cell = cellData[rowKey][colKey] || {};
        const formula = typeof cell.f === "string" ? cell.f.trim() : "";
        if (formula.startsWith("=") && formula.length > 1) {
          rows[row][col] = formula;
        } else if (typeof cell.si === "string" && cell.si) {
          const master = sharedMasters.get(cell.si);
          if (master) {
            rows[row][col] = translateGridFormula(
              master.formula,
              row - master.row,
              col - master.col,
            );
          } else {
            rows[row][col] = cellTextFallback(cell);
          }
        } else {
          rows[row][col] = cellTextFallback(cell);
        }
        if (cellHasStyledRuns(cell)) richRunsDropped += 1;
        const format = univerStyleToGridFormat(
          resolveUniverStyle(cell.s, data?.styles),
        );
        if (format) formats[`${row}:${col}`] = format;
      }
    }
    const sheetKey = sheet.id || sheetId;
    result.push({
      id: sheetKey,
      name: sheet.name || sheetId,
      rows,
      formats,
      merges: (sheet.mergeData || []).map(rangeToMerge),
      conditionalFormats:
        cfBySheet.get(sheetKey) ||
        cfBySheet.get(sheetId) ||
        [],
    });
    if (notes && richRunsDropped > 0) {
      notes.dropped.push(
        `${richRunsDropped} 个格子的段内加粗/颜色没有带过去（一格一份格式装不下同一格里多段不同样式）`,
      );
    }
  }
  return result;
}
