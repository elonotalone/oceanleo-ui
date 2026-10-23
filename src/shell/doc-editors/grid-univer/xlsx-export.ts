/**
 * Univer 快照 → XLSX，直接走 exceljs，不经过 `GridSheet`。
 *
 * 以前的保存/下载链是 `univerSnapshotToGridSheets` → `GridSheet` → exceljs：`GridSheet` 只有
 * 行、格式、合并和五种条件格式，其余（数据验证、超链接、批注、筛选、图片、色阶 / 数据条、
 * 列宽行高、冻结窗格、段内富文本……）在中途就丢了，而且大多数是静默丢。这里改成直接读快照，
 * exceljs 能表达的都写出去；写不出去的收进 `dropped`，由调用方原样显示给用户。
 *
 * 快照里的资源（`workbook.resources`）是插件各自序列化的 JSON 字符串，形状见各插件
 * `registerPluginResource` 的 `toJson`（0.25.1）：
 *   - SHEET_DATA_VALIDATION_PLUGIN        { [sheetId]: rule[] }
 *   - SHEET_CONDITIONAL_FORMATTING_PLUGIN { [sheetId]: rule[] }
 *   - SHEET_FILTER_PLUGIN                 { [sheetId]: { ref, filterColumns } }
 *   - SHEET_NOTE_PLUGIN                   { [sheetId]: { [row]: { [col]: note } } }
 *   - SHEET_UNIVER_THREAD_COMMENT_PLUGIN  { [sheetId]: comment[] }
 *   - SHEET_DRAWING_PLUGIN                { [sheetId]: { data: { [id]: drawing } } }
 *   - SHEET_TABLE_PLUGIN                  只报告，不写（exceljs 的表格会重写单元格）
 * 超链接在单元格富文本 `p.body.customRanges`（rangeType 0）里，不在资源里。
 */
import type { IWorkbookData } from "@univerjs/presets";
import { sanitizeSheetName } from "../grid-model";
import { formatWithNumberFormat, parseGridDateValue } from "../grid-format/number-format";
import type { GridSheet } from "../grid-model";
import { translateGridFormula } from "../grid-structure";
import { AUTOSAVE_ERROR_NETWORK } from "../../../lib/auth/autosave-error-message";

type Json = Record<string, unknown>;
type ExcelJs = typeof import("exceljs");
let loadedExcelJs: (ExcelJs & { default?: ExcelJs }) | undefined;

async function loadExcelJs() {
  if (loadedExcelJs) return loadedExcelJs;
  // Do not retain a rejected import promise. In particular, avoid starting a
  // first chunk request while offline; loaded modules still support CPU export.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error(AUTOSAVE_ERROR_NETWORK);
  }
  const imported = (await import("exceljs")) as ExcelJs & { default?: ExcelJs };
  loadedExcelJs = imported;
  return imported;
}

export interface GridUniverXlsxResult {
  blob: Blob;
  /** 没能写进 XLSX 的内容，每条一句人话；空数组 = 没有降级。 */
  dropped: string[];
}

export const GRID_XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MAX_VALIDATION_CELLS = 100_000;

function isObject(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resourceJson(
  data: Partial<IWorkbookData>,
  name: string,
): Json | unknown[] | null {
  const entry = (Array.isArray(data.resources) ? data.resources : []).find(
    (item) => item?.name === name,
  );
  if (!entry || entry.data == null) return null;
  let parsed: unknown = entry.data;
  if (typeof parsed === "string") {
    if (!parsed.trim()) return null;
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return null;
    }
  }
  return isObject(parsed) || Array.isArray(parsed) ? parsed : null;
}

function sheetResource(data: Partial<IWorkbookData>, name: string): Json {
  const parsed = resourceJson(data, name);
  return isObject(parsed) ? parsed : {};
}

/* ---------------------------------- 颜色 --------------------------------- */

function argb(value: unknown): string | undefined {
  const raw =
    typeof value === "string"
      ? value
      : isObject(value) && typeof value.rgb === "string"
        ? value.rgb
        : "";
  const text = raw.trim();
  let match = /^#?([0-9a-f]{6})$/i.exec(text);
  if (match) return `FF${match[1].toUpperCase()}`;
  match = /^#?([0-9a-f]{3})$/i.exec(text);
  if (match) {
    return `FF${match[1]
      .split("")
      .map((c) => c + c)
      .join("")
      .toUpperCase()}`;
  }
  match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(text);
  if (match) {
    const hex = [match[1], match[2], match[3]]
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    return `FF${hex}`;
  }
  return undefined;
}

/* ---------------------------------- 样式 --------------------------------- */

const BORDER_STYLE: Record<number, string> = {
  1: "thin",
  2: "hair",
  3: "dotted",
  4: "dashed",
  5: "dashDot",
  6: "dashDotDot",
  7: "double",
  8: "medium",
  9: "mediumDashed",
  10: "mediumDashDot",
  11: "mediumDashDotDot",
  12: "slantDashDot",
  13: "thick",
};

function resolveStyle(ref: unknown, catalog: unknown): Json | null {
  if (!ref) return null;
  if (typeof ref === "string") {
    const hit = isObject(catalog) ? catalog[ref] : undefined;
    return isObject(hit) ? hit : null;
  }
  return isObject(ref) ? ref : null;
}

function excelFont(style: Json): Partial<import("exceljs").Font> {
  const font: Partial<import("exceljs").Font> = {};
  if (style.bl) font.bold = true;
  if (style.it) font.italic = true;
  if (isObject(style.ul) && style.ul.s) font.underline = true;
  if (isObject(style.st) && style.st.s) font.strike = true;
  const size = num(style.fs);
  if (size) font.size = size;
  if (typeof style.ff === "string" && style.ff) font.name = style.ff;
  const color = argb(style.cl);
  if (color) font.color = { argb: color };
  return font;
}

function applyStyle(
  cell: import("exceljs").Cell,
  style: Json | null,
  textColorOverride = true,
): void {
  if (!style) return;
  const font = excelFont(style);
  if (Object.keys(font).length > 0 && textColorOverride) cell.font = font;
  const fill = argb(style.bg);
  if (fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  }
  const alignment: Partial<import("exceljs").Alignment> = {};
  const ht = num(style.ht);
  if (ht === 1) alignment.horizontal = "left";
  else if (ht === 2) alignment.horizontal = "center";
  else if (ht === 3) alignment.horizontal = "right";
  else if (ht === 4 || ht === 5) alignment.horizontal = "justify";
  const vt = num(style.vt);
  if (vt === 1) alignment.vertical = "top";
  else if (vt === 2) alignment.vertical = "middle";
  else if (vt === 3) alignment.vertical = "bottom";
  if (num(style.tb) === 3) alignment.wrapText = true;
  if (isObject(style.tr) && num(style.tr.a)) {
    alignment.textRotation = Math.max(-90, Math.min(90, style.tr.a as number));
  }
  if (Object.keys(alignment).length > 0) cell.alignment = alignment;
  if (isObject(style.bd)) {
    const border: Partial<import("exceljs").Borders> = {};
    for (const [key, side] of [
      ["t", "top"],
      ["b", "bottom"],
      ["l", "left"],
      ["r", "right"],
    ] as const) {
      const edge = style.bd[key];
      if (!isObject(edge)) continue;
      const kind = BORDER_STYLE[num(edge.s) ?? 0];
      if (!kind) continue;
      const color = argb(edge.cl);
      border[side] = {
        style: kind as import("exceljs").BorderStyle,
        ...(color ? { color: { argb: color } } : {}),
      };
    }
    if (Object.keys(border).length > 0) cell.border = border;
  }
  const pattern = isObject(style.n) ? style.n.pattern : undefined;
  if (typeof pattern === "string" && pattern && pattern.toLowerCase() !== "general") {
    cell.numFmt = pattern;
  }
}

/* ---------------------------------- 单元格 ------------------------------- */

interface CellLink {
  text: string;
  url: string;
  whole: boolean;
}

function plainText(stream: string): string {
  return stream.replace(/\r\n?$/, "").replace(/\r/g, "\n").replace(/\n$/, "");
}

function documentBody(cell: Json): Json | null {
  const p = cell.p;
  if (!isObject(p) || !isObject(p.body)) return null;
  return p.body;
}

function hyperlinkOf(body: Json | null): CellLink | null {
  if (!body || typeof body.dataStream !== "string") return null;
  const ranges = Array.isArray(body.customRanges) ? body.customRanges : [];
  for (const range of ranges) {
    if (!isObject(range) || num(range.rangeType) !== 0) continue;
    const props = isObject(range.properties) ? range.properties : {};
    const url = typeof props.url === "string" ? props.url : "";
    if (!url) continue;
    const start = num(range.startIndex) ?? 0;
    const end = num(range.endIndex) ?? start;
    const text = plainText(body.dataStream.slice(start, end + 1));
    const full = plainText(body.dataStream);
    return { text: text || full || url, url, whole: text === full };
  }
  return null;
}

function richTextOf(
  body: Json | null,
): import("exceljs").CellRichTextValue | null {
  if (!body || typeof body.dataStream !== "string") return null;
  const runs = Array.isArray(body.textRuns) ? body.textRuns : [];
  const styled = runs.filter(
    (run) => isObject(run) && isObject(run.ts) && Object.keys(run.ts).length > 0,
  ) as Json[];
  if (styled.length === 0) return null;
  const stream = body.dataStream.replace(/\r\n?$/, "");
  const parts: import("exceljs").RichText[] = [];
  let cursor = 0;
  const sorted = [...styled].sort(
    (a, b) => (num(a.st) ?? 0) - (num(b.st) ?? 0),
  );
  for (const run of sorted) {
    const st = Math.max(cursor, num(run.st) ?? 0);
    const ed = Math.min(stream.length, num(run.ed) ?? st);
    if (st > cursor) parts.push({ text: stream.slice(cursor, st) });
    if (ed > st) {
      parts.push({
        text: stream.slice(st, ed),
        font: excelFont(run.ts as Json),
      });
    }
    cursor = Math.max(cursor, ed);
  }
  if (cursor < stream.length) parts.push({ text: stream.slice(cursor) });
  const joined = parts.map((part) => part.text).join("");
  if (!joined) return null;
  return { richText: parts.map((part) => ({ ...part, text: part.text.replace(/\r/g, "\n") })) };
}

function textOf(cell: Json): string {
  if (cell.v !== undefined && cell.v !== null) return String(cell.v);
  const body = documentBody(cell);
  return body && typeof body.dataStream === "string"
    ? plainText(body.dataStream)
    : "";
}

function cachedResult(
  cell: Json,
): number | string | boolean | Date | undefined {
  const value = cell.v;
  if (value === undefined || value === null || value === "") return undefined;
  const t = num(cell.t);
  if (t === 3) return Boolean(value) && value !== "FALSE" && value !== "false" && value !== 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  const asNumber = Number(value);
  if (t !== 1 && String(value).trim() !== "" && Number.isFinite(asNumber)) return asNumber;
  return String(value);
}

function plainValue(cell: Json): number | string | boolean | undefined {
  const t = num(cell.t);
  const value = cell.v;
  if (value === undefined || value === null) {
    const fromDoc = textOf(cell);
    return fromDoc === "" ? undefined : fromDoc;
  }
  if (t === 3) {
    return !(value === 0 || value === "0" || value === false || String(value).toUpperCase() === "FALSE");
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  if (t === 2) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && String(value).trim() !== "") return parsed;
  }
  return String(value);
}

/* ----------------------------- 地址 / 区域工具 --------------------------- */

function colName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function parseA1(ref: string): { row: number; col: number } | null {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim());
  if (!match) return null;
  let col = 0;
  for (const ch of match[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, col: col - 1 };
}

interface Rect {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

function toRect(raw: unknown, maxRow: number, maxCol: number): Rect | null {
  if (!isObject(raw)) return null;
  const startRow = num(raw.startRow) ?? 0;
  const startColumn = num(raw.startColumn) ?? 0;
  const endRow = Math.min(num(raw.endRow) ?? maxRow, maxRow);
  const endColumn = Math.min(num(raw.endColumn) ?? maxCol, maxCol);
  if (endRow < startRow || endColumn < startColumn) return null;
  return { startRow, endRow, startColumn, endColumn };
}

function sqref(rect: Rect): string {
  return `${colName(rect.startColumn)}${rect.startRow + 1}:${colName(rect.endColumn)}${rect.endRow + 1}`;
}

function stripEq(formula: unknown): string {
  return String(formula ?? "").trim().replace(/^=/, "");
}

/* --------------------------------- 数据验证 ------------------------------- */

const DV_TYPE: Record<string, import("exceljs").DataValidation["type"]> = {
  list: "list",
  listMultiple: "list",
  whole: "whole",
  decimal: "decimal",
  date: "date",
  textLength: "textLength",
  custom: "custom",
};

const DV_OPERATOR = new Set([
  "between",
  "notBetween",
  "equal",
  "notEqual",
  "greaterThan",
  "lessThan",
  "greaterThanOrEqual",
  "lessThanOrEqual",
]);

function dvCriterion(
  type: string,
  raw: unknown,
): string | number | Date | null {
  const text = stripEq(raw);
  if (!text) return null;
  if (type === "date") {
    const date = parseGridDateValue(text);
    if (date && !/^[A-Za-z]/.test(text)) return date;
    return text;
  }
  if (type === "custom") return text;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : text;
}

function buildValidation(
  rule: Json,
  dropped: Set<string>,
): import("exceljs").DataValidation | null {
  const univerType = String(rule.type || "");
  if (univerType === "checkbox") {
    dropped.add("复选框（数据验证）没有对应的 XLSX 控件，格子保留 TRUE/FALSE 值");
    return null;
  }
  const type = DV_TYPE[univerType];
  if (!type) {
    if (univerType && univerType !== "any" && univerType !== "none") {
      dropped.add(`数据验证类型「${univerType}」`);
    }
    return null;
  }
  if (univerType === "listMultiple") {
    dropped.add("多选下拉写成了单选下拉（XLSX 没有多选）");
  }
  let formulae: unknown[] = [];
  if (type === "list") {
    const source = String(rule.formula1 ?? "").trim();
    if (!source) return null;
    const rangeLike = /^=?(?:(?:'[^']+'|[A-Za-z0-9_一-龥.]+)!)?\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?$/.test(source);
    if (rangeLike) {
      formulae = [stripEq(source)];
    } else {
      const list = source.replace(/^=/, "");
      if (list.length > 255) {
        dropped.add("超过 255 字符的下拉选项列表");
        return null;
      }
      formulae = [`"${list.replace(/"/g, '""')}"`];
    }
  } else {
    const first = dvCriterion(type, rule.formula1);
    if (first === null) return null;
    formulae = [first];
    const second = dvCriterion(type, rule.formula2);
    if (second !== null) formulae.push(second);
  }
  const validation: import("exceljs").DataValidation = {
    type,
    formulae,
    allowBlank: rule.allowBlank !== false,
    showErrorMessage: rule.showErrorMessage !== false,
    showInputMessage: Boolean(rule.showInputMessage),
  };
  if (type !== "list" && type !== "custom") {
    const operator = typeof rule.operator === "string" ? rule.operator : "between";
    if (DV_OPERATOR.has(operator)) {
      validation.operator = operator as import("exceljs").DataValidationOperator;
    }
  }
  if (typeof rule.error === "string" && rule.error) validation.error = rule.error;
  if (typeof rule.errorTitle === "string" && rule.errorTitle) {
    validation.errorTitle = rule.errorTitle;
  }
  if (typeof rule.prompt === "string" && rule.prompt) validation.prompt = rule.prompt;
  if (typeof rule.promptTitle === "string" && rule.promptTitle) {
    validation.promptTitle = rule.promptTitle;
  }
  const errorStyle = num(rule.errorStyle);
  validation.errorStyle =
    errorStyle === 0 ? "information" : errorStyle === 2 ? "warning" : "stop";
  return validation;
}

/* --------------------------------- 条件格式 ------------------------------- */

function cfStyle(style: unknown): Partial<import("exceljs").Style> {
  const source = isObject(style) ? style : {};
  const out: Partial<import("exceljs").Style> = {};
  const font = excelFont(source);
  if (Object.keys(font).length > 0) out.font = font;
  const bg = argb(source.bg);
  if (bg) out.fill = { type: "pattern", pattern: "solid", bgColor: { argb: bg } };
  return out;
}

/** exceljs `CellIsOperators` only has these four; the rest become expression rules. */
const CF_CELLIS: Record<string, import("exceljs").CellIsOperators> = {
  greaterThan: "greaterThan",
  lessThan: "lessThan",
  between: "between",
  equal: "equal",
};

/** Number operators exceljs cannot name: written as an equivalent formula on the top-left cell. */
function numberExpression(operator: string, origin: string, values: string[]): string | null {
  const [first, second] = values;
  switch (operator) {
    case "greaterThanOrEqual":
      return first ? `${origin}>=${first}` : null;
    case "lessThanOrEqual":
      return first ? `${origin}<=${first}` : null;
    case "notEqual":
      return first ? `${origin}<>${first}` : null;
    case "notBetween":
      return first && second ? `OR(${origin}<${first},${origin}>${second})` : null;
    default:
      return null;
  }
}


function cfvo(value: unknown): import("exceljs").Cvfo {
  const v = isObject(value) ? value : {};
  const type = String(v.type || "min");
  const allowed = ["min", "max", "num", "percent", "percentile", "formula"];
  const mapped = (allowed.includes(type) ? type : "min") as import("exceljs").CfvoTypes;
  const raw = v.value;
  if (mapped === "min" || mapped === "max") return { type: mapped };
  return { type: mapped, value: raw as number };
}

function literal(value: unknown): string {
  if (typeof value === "number") return String(value);
  const text = String(value ?? "");
  return /^[+-]?\d+(?:\.\d+)?$/.test(text) ? text : `"${text.replace(/"/g, '""')}"`;
}

function textLiteral(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function applyConditionalFormats(
  worksheet: import("exceljs").Worksheet,
  rules: unknown[],
  maxRow: number,
  maxCol: number,
  dropped: Set<string>,
): void {
  let priority = 1;
  for (const entry of rules) {
    if (!isObject(entry) || !isObject(entry.rule)) continue;
    const rule = entry.rule;
    const rects = (Array.isArray(entry.ranges) ? entry.ranges : [])
      .map((range) => toRect(range, maxRow, maxCol))
      .filter((rect): rect is Rect => rect !== null);
    if (rects.length === 0) continue;
    const origin = `${colName(rects[0].startColumn)}${rects[0].startRow + 1}`;
    const type = String(rule.type || "");
    const subType = String(rule.subType || "");
    const operator = String(rule.operator || "");
    let built: import("exceljs").ConditionalFormattingRule | null = null;
    const style = cfStyle(rule.style);

    if (type === "colorScale") {
      const stops = (Array.isArray(rule.config) ? rule.config : []).filter(isObject);
      const colors = stops.map((stop) => argb(stop.color));
      if (stops.length >= 2 && colors.every(Boolean)) {
        built = {
          type: "colorScale",
          priority,
          cfvo: stops.map((stop) => cfvo(stop.value)),
          color: colors.map((color) => ({ argb: color as string })),
        };
      }
    } else if (type === "dataBar") {
      const config = isObject(rule.config) ? rule.config : {};
      const color = argb(config.positiveColor) || "FF638EC6";
      built = {
        type: "dataBar",
        priority,
        minLength: 0,
        maxLength: 100,
        gradient: config.isGradient !== false,
        cfvo: [cfvo(config.min), cfvo(config.max)],
        color: { argb: color },
        showValue: rule.isShowValue !== false,
      } as unknown as import("exceljs").ConditionalFormattingRule;
    } else if (type === "iconSet") {
      const config = (Array.isArray(rule.config) ? rule.config : []).filter(isObject);
      const iconType = String(config[0]?.iconType || "");
      const known = /^[345](Arrows|ArrowsGray|Boxes|Quarters|Rating|Flags|Signs|Stars|Symbols|Symbols2|TrafficLights1|TrafficLights2|Triangles|RedToBlack|TrafficLights)$/.test(iconType);
      if (known && config.length >= 2) {
        built = {
          type: "iconSet",
          priority,
          iconSet: iconType as import("exceljs").IconSetTypes,
          showValue: rule.isShowValue !== false,
          // 第一档永远是 0%，其余档用 Univer 里存的阈值。
          cfvo: config.map((item, index) =>
            index === 0
              ? { type: "percent", value: 0 }
              : cfvo(item.value),
          ),
        } as import("exceljs").ConditionalFormattingRule;
      }
    } else if (type === "highlightCell") {
      if (subType === "number" && (CF_CELLIS[operator] || numberExpression(operator, origin, ["0", "0"]))) {
        const value = rule.value;
        const formulae = Array.isArray(value)
          ? value.map(literal)
          : value === undefined || value === null
            ? []
            : [literal(value)];
        const direct = CF_CELLIS[operator];
        const expression = direct ? null : numberExpression(operator, origin, formulae);
        if (formulae.length > 0 && direct) {
          built = { type: "cellIs", operator: direct, formulae, priority, style };
        } else if (expression) {
          built = { type: "expression", formulae: [expression], priority, style };
        }
      } else if (subType === "text") {
        const text = String(rule.value ?? "");
        if (operator === "containsText") {
          built = { type: "containsText", operator: "containsText", text, priority, style };
        } else if (operator === "notContainsText") {
          built = {
            type: "expression",
            formulae: [`ISERROR(SEARCH(${textLiteral(text)},${origin}))`],
            priority,
            style,
          };
        } else if (operator === "beginsWith" || operator === "endsWith") {
          const fn = operator === "beginsWith" ? "LEFT" : "RIGHT";
          built = {
            type: "expression",
            formulae: [`${fn}(${origin},${text.length})=${textLiteral(text)}`],
            priority,
            style,
          };
        } else if (operator === "equal" || operator === "notEqual") {
          built = {
            type: "expression",
            formulae: [`${origin}${operator === "equal" ? "=" : "<>"}${textLiteral(text)}`],
            priority,
            style,
          };
        }
      } else if (subType === "formula") {
        const formula = stripEq(rule.value);
        if (formula) {
          built = { type: "expression", formulae: [formula], priority, style };
        }
      } else if (subType === "rank") {
        built = {
          type: "top10",
          rank: num(rule.value) ?? 10,
          percent: Boolean(rule.isPercent),
          bottom: Boolean(rule.isBottom),
          priority,
          style,
        };
      } else if (subType === "average") {
        if (operator === "greaterThan" || operator === "lessThan") {
          built = {
            type: "aboveAverage",
            aboveAverage: operator === "greaterThan",
            priority,
            style,
          };
        }
      }
    }
    if (!built) {
      dropped.add(`一条条件格式（${cfLabel(type, subType, operator)}）没有对应的 XLSX 规则`);
      continue;
    }
    worksheet.addConditionalFormatting({
      ref: rects.map(sqref).join(" "),
      rules: [built],
    });
    priority += 1;
  }
}

function cfLabel(type: string, subType: string, operator: string): string {
  if (type === "iconSet") return "图标集";
  if (type === "colorScale") return "色阶";
  if (type === "dataBar") return "数据条";
  if (subType === "uniqueValues") return "唯一值";
  if (subType === "duplicateValues") return "重复值";
  if (subType === "timePeriod") return "日期时段";
  return [type, subType, operator].filter(Boolean).join("/") || "未知";
}

/* ----------------------------------- 图片 -------------------------------- */

function imageExtension(source: string): "png" | "jpeg" | "gif" | null {
  const match = /^data:image\/(png|jpe?g|gif);base64,/i.exec(source);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  return kind === "png" ? "png" : kind === "gif" ? "gif" : "jpeg";
}

/* ------------------------------------ 主流程 ------------------------------ */

function uniqueName(base: string, used: Set<string>): string {
  const clean = sanitizeSheetName(base) || "Sheet";
  let name = clean;
  let counter = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${counter})`;
    name = `${clean.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function quoteSheet(name: string): string {
  return /^[A-Za-z0-9_]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/** 从 `Univer 快照` 生成 XLSX；失败直接抛，不吞。 */
export async function buildGridXlsxFromUniverSnapshot(
  data: Partial<IWorkbookData> | null | undefined,
  options: { title?: string } = {},
): Promise<GridUniverXlsxResult> {
  const snapshot = data || {};
  const imported = await loadExcelJs();
  const ExcelJS = imported.Workbook ? imported : (imported.default ?? imported);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OceanLeo";
  workbook.created = new Date();
  workbook.title = options.title || String(snapshot.name || "");
  // 缓存值缺失的公式让 Excel 打开时重算，而不是显示 0。
  workbook.calcProperties = { fullCalcOnLoad: true };

  const dropped = new Set<string>();
  const sheets = isObject(snapshot.sheets) ? snapshot.sheets : {};
  const order =
    Array.isArray(snapshot.sheetOrder) && snapshot.sheetOrder.length > 0
      ? snapshot.sheetOrder
      : Object.keys(sheets);

  const validations = sheetResource(snapshot, "SHEET_DATA_VALIDATION_PLUGIN");
  const formats = sheetResource(snapshot, "SHEET_CONDITIONAL_FORMATTING_PLUGIN");
  const filters = sheetResource(snapshot, "SHEET_FILTER_PLUGIN");
  const notes = sheetResource(snapshot, "SHEET_NOTE_PLUGIN");
  const comments = sheetResource(snapshot, "SHEET_UNIVER_THREAD_COMMENT_PLUGIN");
  const drawings = sheetResource(snapshot, "SHEET_DRAWING_PLUGIN");
  const tables = sheetResource(snapshot, "SHEET_TABLE_PLUGIN");

  const usedNames = new Set<string>();
  const nameById = new Map<string, string>();
  for (const id of order) {
    const sheet = sheets[id];
    if (!isObject(sheet)) continue;
    nameById.set(
      id,
      uniqueName(typeof sheet.name === "string" && sheet.name ? sheet.name : id, usedNames),
    );
  }

  for (const sheetId of order) {
    const sheet = sheets[sheetId];
    if (!isObject(sheet)) continue;
    const sheetName = nameById.get(sheetId) as string;
    const worksheet = workbook.addWorksheet(sheetName);
    if (num(sheet.hidden) === 1) worksheet.state = "hidden";
    const tab = argb(sheet.tabColor);
    if (tab) worksheet.properties.tabColor = { argb: tab };

    const cellData = isObject(sheet.cellData) ? sheet.cellData : {};
    const columnData = isObject(sheet.columnData) ? sheet.columnData : {};
    const rowData = isObject(sheet.rowData) ? sheet.rowData : {};
    let maxRow = 0;
    let maxCol = 0;

    // 共享公式：从格按偏移翻译主公式。
    const masters = new Map<string, { formula: string; row: number; col: number }>();
    for (const [rowKey, line] of Object.entries(cellData)) {
      if (!isObject(line)) continue;
      for (const [colKey, raw] of Object.entries(line)) {
        if (!isObject(raw)) continue;
        const f = typeof raw.f === "string" ? raw.f.trim() : "";
        const si = typeof raw.si === "string" ? raw.si : "";
        if (f && si && !masters.has(si)) {
          masters.set(si, { formula: f.startsWith("=") ? f : `=${f}`, row: Number(rowKey), col: Number(colKey) });
        }
      }
    }

    for (const [rowKey, line] of Object.entries(cellData)) {
      const row = Number(rowKey);
      if (!Number.isInteger(row) || row < 0 || !isObject(line)) continue;
      for (const [colKey, raw] of Object.entries(line)) {
        const col = Number(colKey);
        if (!Number.isInteger(col) || col < 0 || !isObject(raw)) continue;
        const cell = worksheet.getCell(row + 1, col + 1);
        const style = resolveStyle(raw.s, snapshot.styles);
        let formula = typeof raw.f === "string" ? raw.f.trim() : "";
        if (!formula && typeof raw.si === "string" && raw.si) {
          const master = masters.get(raw.si);
          if (master) {
            formula = translateGridFormula(master.formula, row - master.row, col - master.col);
          }
        }
        const body = documentBody(raw);
        const link = hyperlinkOf(body);
        const rich = richTextOf(body);
        let hasContent = true;
        if (formula) {
          const text = formula.startsWith("=") ? formula.slice(1) : formula;
          const result = cachedResult(raw);
          cell.value = {
            formula: text,
            ...(result !== undefined ? { result } : {}),
          } as import("exceljs").CellFormulaValue;
        } else if (link) {
          cell.value = { text: link.text, hyperlink: toExcelLink(link.url, nameById) };
          if (!link.whole) {
            dropped.add("只有部分文字带链接的格子，XLSX 里整格都成了链接");
          }
        } else if (rich) {
          cell.value = rich;
        } else {
          const value = plainValue(raw);
          if (value === undefined) hasContent = false;
          else cell.value = value;
        }
        applyStyle(cell, style, !rich);
        if (hasContent || style) {
          maxRow = Math.max(maxRow, row);
          maxCol = Math.max(maxCol, col);
        }
      }
    }

    // 列宽 / 行高：Univer 用像素，XLSX 列宽是字符数、行高是点。
    const defaultColWidth = num(sheet.defaultColumnWidth);
    const defaultRowHeight = num(sheet.defaultRowHeight);
    const colCount = Math.max(num(sheet.columnCount) ?? 0, maxCol + 1);
    const rowCount = Math.max(num(sheet.rowCount) ?? 0, maxRow + 1);
    if (defaultColWidth) {
      worksheet.properties.defaultColWidth = Math.max(1, (defaultColWidth - 5) / 7);
    }
    if (defaultRowHeight) {
      worksheet.properties.defaultRowHeight = Math.round(defaultRowHeight * 0.75 * 100) / 100;
    }
    for (const [key, raw] of Object.entries(columnData)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || !isObject(raw)) continue;
      const width = num(raw.w);
      const hidden = num(raw.hd) === 1;
      if (width === undefined && !hidden) continue;
      const column = worksheet.getColumn(index + 1);
      if (width !== undefined) column.width = Math.max(0.5, Math.round(((width - 5) / 7) * 100) / 100);
      if (hidden) column.hidden = true;
    }
    for (const [key, raw] of Object.entries(rowData)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || !isObject(raw)) continue;
      const height = num(raw.h);
      const hidden = num(raw.hd) === 1;
      if (height === undefined && !hidden) continue;
      const row = worksheet.getRow(index + 1);
      if (height !== undefined) row.height = Math.round(height * 0.75 * 100) / 100;
      if (hidden) row.hidden = true;
      // exceljs 不写没有任何单元格的行，隐藏/行高会随之消失；触一下首格让这一行落盘。
      row.getCell(1);
    }

    // 合并（值写完之后再合并，否则从格写入会被重定向到主格）。
    for (const merge of Array.isArray(sheet.mergeData) ? sheet.mergeData : []) {
      const rect = toRect(merge, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      if (!rect) continue;
      if (rect.startRow === rect.endRow && rect.startColumn === rect.endColumn) continue;
      worksheet.mergeCells(rect.startRow + 1, rect.startColumn + 1, rect.endRow + 1, rect.endColumn + 1);
    }

    // 冻结窗格 / 网格线 / 缩放。
    const view: Partial<import("exceljs").WorksheetView> & Json = {};
    const freeze = isObject(sheet.freeze) ? sheet.freeze : null;
    const xSplit = freeze ? (num(freeze.xSplit) ?? 0) : 0;
    const ySplit = freeze ? (num(freeze.ySplit) ?? 0) : 0;
    if (xSplit > 0 || ySplit > 0) {
      Object.assign(view, { state: "frozen", xSplit, ySplit });
    }
    if (num(sheet.showGridlines) === 0) view.showGridLines = false;
    const zoom = num(sheet.zoomRatio);
    if (zoom && zoom !== 1) view.zoomScale = Math.round(zoom * 100);
    if (Object.keys(view).length > 0) {
      worksheet.views = [view as import("exceljs").WorksheetView];
    }

    // 数据验证。
    const dvRules = Array.isArray(validations[sheetId]) ? (validations[sheetId] as unknown[]) : [];
    let dvCells = 0;
    for (const raw of dvRules) {
      if (!isObject(raw)) continue;
      const validation = buildValidation(raw, dropped);
      if (!validation) continue;
      for (const range of Array.isArray(raw.ranges) ? raw.ranges : []) {
        const rect = toRect(range, Math.max(rowCount, 1) - 1, Math.max(colCount, 1) - 1);
        if (!rect) continue;
        for (let r = rect.startRow; r <= rect.endRow; r += 1) {
          for (let c = rect.startColumn; c <= rect.endColumn; c += 1) {
            if (dvCells >= MAX_VALIDATION_CELLS) {
              dropped.add(`数据验证覆盖的格子超过 ${MAX_VALIDATION_CELLS}，超出部分没有写入`);
              r = rect.endRow + 1;
              break;
            }
            worksheet.getCell(r + 1, c + 1).dataValidation = validation;
            dvCells += 1;
          }
        }
      }
    }

    // 条件格式。
    const cfRules = Array.isArray(formats[sheetId]) ? (formats[sheetId] as unknown[]) : [];
    applyConditionalFormats(worksheet, cfRules, Math.max(rowCount, 1) - 1, Math.max(colCount, 1) - 1, dropped);

    // 筛选：范围写进去，具体的筛选条件 XLSX 里不重放。
    const filter = isObject(filters[sheetId]) ? (filters[sheetId] as Json) : null;
    if (filter && isObject(filter.ref)) {
      const rect = toRect(filter.ref, Math.max(rowCount, 1) - 1, Math.max(colCount, 1) - 1);
      if (rect) {
        worksheet.autoFilter = {
          from: { row: rect.startRow + 1, column: rect.startColumn + 1 },
          to: { row: rect.endRow + 1, column: rect.endColumn + 1 },
        };
        const active = Array.isArray(filter.filterColumns) ? filter.filterColumns.length : 0;
        if (active > 0) dropped.add(`${active} 列的筛选条件（保留了筛选范围，条件没有写入）`);
      }
    }

    // 批注（单元格备注）+ 线程评论：都写成 XLSX 批注，评论回复按顺序拼进正文。
    const noteBySheet = isObject(notes[sheetId]) ? (notes[sheetId] as Json) : {};
    for (const [rowKey, line] of Object.entries(noteBySheet)) {
      if (!isObject(line)) continue;
      for (const [colKey, note] of Object.entries(line)) {
        if (!isObject(note) || typeof note.note !== "string" || !note.note) continue;
        const target = worksheet.getCell(Number(rowKey) + 1, Number(colKey) + 1);
        target.note = note.note;
      }
    }
    const threads = Array.isArray(comments[sheetId]) ? (comments[sheetId] as unknown[]) : [];
    for (const thread of threads) {
      if (!isObject(thread) || typeof thread.ref !== "string") continue;
      const at = parseA1(thread.ref);
      if (!at) continue;
      const lines = [thread, ...(Array.isArray(thread.children) ? thread.children : [])]
        .filter(isObject)
        .map((item) => {
          const body = isObject(item.text) ? item.text : null;
          const text = body && typeof body.dataStream === "string" ? plainText(body.dataStream) : "";
          const who = typeof item.personId === "string" && item.personId ? `${item.personId}: ` : "";
          return text ? `${who}${text}` : "";
        })
        .filter(Boolean);
      if (lines.length === 0) continue;
      const target = worksheet.getCell(at.row + 1, at.col + 1);
      const existing = typeof target.note === "string" ? `${target.note}\n` : "";
      target.note = `${existing}${lines.join("\n")}`;
    }

    // 图片。
    const drawingBlock = isObject(drawings[sheetId]) ? (drawings[sheetId] as Json) : null;
    const drawingData = drawingBlock && isObject(drawingBlock.data) ? drawingBlock.data : {};
    for (const raw of Object.values(drawingData)) {
      if (!isObject(raw)) continue;
      const source = typeof raw.source === "string" ? raw.source : "";
      const extension = imageExtension(source);
      const sheetTransform = isObject(raw.sheetTransform) ? raw.sheetTransform : null;
      const from = sheetTransform && isObject(sheetTransform.from) ? sheetTransform.from : null;
      const to = sheetTransform && isObject(sheetTransform.to) ? sheetTransform.to : null;
      if (!extension || !from || !to) {
        dropped.add("无法内嵌的图片（不是 base64 数据，或缺少位置信息）");
        continue;
      }
      const imageId = workbook.addImage({ base64: source, extension });
      worksheet.addImage(imageId, {
        tl: { col: (num(from.column) ?? 0) + (num(from.columnOffset) ?? 0) / 64, row: (num(from.row) ?? 0) + (num(from.rowOffset) ?? 0) / 20 },
        br: { col: (num(to.column) ?? 0) + (num(to.columnOffset) ?? 0) / 64, row: (num(to.row) ?? 0) + (num(to.rowOffset) ?? 0) / 20 },
      } as unknown as import("exceljs").ImageRange);
    }

    const tableList = tables[sheetId];
    const tableCount = Array.isArray(tableList)
      ? tableList.length
      : isObject(tableList)
        ? Object.keys(tableList).length
        : 0;
    if (tableCount > 0) {
      dropped.add(`${tableCount} 个表格对象（数据与样式保留为普通区域，表格样式与结构化引用没有写入）`);
    }
  }

  // 定义名称。
  const names = resourceJson(snapshot, "SHEET_DEFINED_NAME_PLUGIN");
  const nameEntries = isObject(names)
    ? Object.values(names).flatMap((value) => (isObject(value) && typeof value.name === "string" ? [value] : isObject(value) ? Object.values(value).filter(isObject) : []))
    : [];
  for (const entry of nameEntries) {
    const name = typeof entry.name === "string" ? entry.name : "";
    const ref = stripEq(entry.formulaOrRefString);
    if (!name || !ref) continue;
    try {
      workbook.definedNames.add(ref, name);
    } catch {
      dropped.add(`定义名称「${name}」`);
    }
  }

  const bytes = await workbook.xlsx.writeBuffer();
  return {
    blob: new Blob([new Uint8Array(bytes as ArrayBuffer)], { type: GRID_XLSX_MIME }),
    dropped: [...dropped],
  };
}

/**
 * 缩略图用的**显示稿**：公式取缓存结果，数字按单元格格式串渲染（日期显示为日期，
 * 不是序列号）。只给 `renderGridPreviewPng` 用，不进任何存档。
 */
export function univerSnapshotToPreviewSheets(
  data: Partial<IWorkbookData> | null | undefined,
  limit = { rows: 24, cols: 10 },
): GridSheet[] {
  const snapshot = data || {};
  const sheets = isObject(snapshot.sheets) ? snapshot.sheets : {};
  const order =
    Array.isArray(snapshot.sheetOrder) && snapshot.sheetOrder.length > 0
      ? snapshot.sheetOrder
      : Object.keys(sheets);
  const out: GridSheet[] = [];
  for (const id of order) {
    const sheet = sheets[id];
    if (!isObject(sheet)) continue;
    const cellData = isObject(sheet.cellData) ? sheet.cellData : {};
    const rows: string[][] = Array.from({ length: limit.rows }, () =>
      Array<string>(limit.cols).fill(""),
    );
    const formats: GridSheet["formats"] = {};
    for (let r = 0; r < limit.rows; r += 1) {
      const line = cellData[String(r)];
      if (!isObject(line)) continue;
      for (let c = 0; c < limit.cols; c += 1) {
        const raw = line[String(c)];
        if (!isObject(raw)) continue;
        const style = resolveStyle(raw.s, snapshot.styles);
        const value = typeof raw.f === "string" && raw.f ? cachedResult(raw) : plainValue(raw);
        let text = value === undefined || value instanceof Date ? "" : String(value);
        const pattern = style && isObject(style.n) && typeof style.n.pattern === "string" ? style.n.pattern : "";
        if (pattern && typeof value === "number") {
          text = formatWithNumberFormat(value, pattern).text;
        }
        rows[r][c] = text;
        const format: GridSheet["formats"][string] = {};
        if (style?.bl) format.bold = true;
        const color = style && isObject(style.cl) && typeof style.cl.rgb === "string" ? style.cl.rgb : "";
        if (color) format.color = color;
        if (Object.keys(format).length > 0) formats[`${r}:${c}`] = format;
      }
    }
    out.push({
      id: String(sheet.id || id),
      name: String(sheet.name || id),
      rows,
      formats,
      merges: [],
      conditionalFormats: [],
    });
  }
  return out;
}

/** 把降级说成人话。没有降级时是空串，调用方不要凭空弹一句。 */
export function gridXlsxDroppedWarning(dropped: readonly string[]): string {
  if (dropped.length === 0) return "";
  return `XLSX 副本里没有带过去：${dropped.join("；")}。（编辑器里的原始内容完整保留。）`;
}

/** Univer 内部链接 `#gid=<sheetId>&range=A1` → Excel 位置 `#'Name'!A1`。 */
function toExcelLink(url: string, names: Map<string, string>): string {
  if (!url.startsWith("#")) return url;
  const gid = /gid=([^&]+)/.exec(url)?.[1];
  const range = /range=([^&]+)/.exec(url)?.[1] || "A1";
  const name = gid ? names.get(decodeURIComponent(gid)) : undefined;
  return name ? `#${quoteSheet(name)}!${decodeURIComponent(range)}` : url;
}
