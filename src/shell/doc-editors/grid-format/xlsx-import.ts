/** ExcelJS → native Univer data. Do not flatten this through the legacy string grid. */
import type { ICellData, IStyleData, IWorksheetData } from "@univerjs/presets";
import type * as Excel from "exceljs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { DELIVERED_EDITOR_FONT_FAMILIES } from "../../image-editor/editor-font-registry";
import { bytesToDataUrl } from "../grid-univer/material-image";

type Json = Record<string, any>;
// ExcelJS reads these OOXML fields but omits them from its published Color type.
type XlsxColor = Partial<Excel.Color> & { tint?: number; indexed?: number };
export interface GridXlsxImport {
  worksheet: Partial<IWorksheetData>;
  /** Values are grouped by the final sheet id when creating the workbook. */
  resources: Record<string, unknown>;
  names: Record<string, unknown>;
}
const BORDER = ["", "thin", "hair", "dotted", "dashed", "dashDot", "dashDotDot", "double", "medium", "mediumDashed", "mediumDashDot", "mediumDashDotDot", "slantDashDot", "thick"];
const DEFAULT_THEME = ["FFFFFF", "000000", "EEECE1", "1F497D", "4F81BD", "C0504D", "9BBB59", "8064A2", "4BACC6", "F79646", "0000FF", "800080"];
const INDEXED = ["000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF", "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF", "800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080", "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF", "000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF", "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99", "3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696", "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333"];

// OOXML has fixed element/attribute names here. Decode XML text only, never HTML.
const unescapeXml = (text: string) => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, key: string) => {
  if (key[0] === "#") return String.fromCodePoint(Math.min(0x10ffff, parseInt(key.slice(key[1].toLowerCase() === "x" ? 2 : 1), key[1].toLowerCase() === "x" ? 16 : 10)) || 0);
  return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[key] ?? _;
});
const attr = (xml: string, name: string) => unescapeXml(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`).exec(xml)?.[1] ?? "");
const elements = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:[\\w]+:)?${name}(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w]+:)?${name}>)`, "g"))];

export function xlsxArchive(source: ArrayBuffer): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(source));
}

/**
 * ExcelJS 4.4 only indexes xl/commentsN.xml, then dereferences every comments
 * relationship unconditionally. Valid nested/absolute targets therefore abort
 * the entire workbook. Read notes ourselves; exclude their relationships only
 * from ExcelJS's disposable copy (including VML, whose namespaces also vary).
 * Keep the original archive intact for native note import and other resources.
 */
export function xlsxWithoutNoteRelationships(files: Record<string, Uint8Array>, source: ArrayBuffer): ArrayBuffer {
  const copy = { ...files };
  let changed = false;
  for (const path of Object.keys(files)) {
    if (!/^xl\/worksheets\/_rels\/[^/]+\.rels$/.test(path)) continue;
    const xml = strFromU8(files[path]);
    const clean = xml.replace(/<(?:[\w]+:)?Relationship(?=[\s/>])[^>]*?(?:\/>|>[\s\S]*?<\/(?:[\w]+:)?Relationship>)/g, (entry) => {
      const type = attr(entry, "Type");
      return /\/(?:comments|vmlDrawing)$/.test(type) ? "" : entry;
    });
    if (clean !== xml) { copy[path] = strToU8(clean); changed = true; }
  }
  return changed ? zipSync(copy).buffer as ArrayBuffer : source;
}
export function xlsxTheme(files: Record<string, Uint8Array>): string[] {
  const xml = files["xl/theme/theme1.xml"] ? strFromU8(files["xl/theme/theme1.xml"]) : "";
  const scheme = elements(xml, "clrScheme")[0]?.[2] ?? "";
  return ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"].map((key, i) => {
    const color = elements(scheme, key)[0]?.[2] ?? "";
    return attr(elements(color, "srgbClr")[0]?.[1] ?? "", "val") || attr(elements(color, "sysClr")[0]?.[1] ?? "", "lastClr") || DEFAULT_THEME[i];
  });
}

/** Excel tint changes HSL luminance (not individual RGB channels). */
export function xlsxColor(color: XlsxColor | undefined, theme = DEFAULT_THEME): string | undefined {
  if (!color) return undefined;
  const raw = color.argb?.slice(-6) ?? (color.theme !== undefined ? theme[color.theme] : color.indexed !== undefined ? INDEXED[color.indexed] : undefined);
  if (!raw || !/^[\da-f]{6}$/i.test(raw)) return undefined;
  let rgb = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255);
  const tint = color.tint ?? 0;
  if (tint) {
    const max = Math.max(...rgb), min = Math.min(...rgb), d = max - min;
    let l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    const h = d === 0 ? 0 : max === rgb[0] ? ((rgb[1] - rgb[2]) / d + 6) % 6 : max === rgb[1] ? (rgb[2] - rgb[0]) / d + 2 : (rgb[0] - rgb[1]) / d + 4;
    l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h % 2 - 1)), m = l - c / 2;
    rgb = (h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]).map((v) => v + m);
  }
  return `#${rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function xlsxFontFamily(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const fonts = DELIVERED_EDITOR_FONT_FAMILIES;
  const known = fonts.find((font) => font.toLowerCase() === name.toLowerCase());
  if (known) return known;
  const serif = /serif|times|cambria|georgia|宋|明朝|ming|simsun|batang|source\s*han\s*serif/i.test(name) && !/sans/i.test(name);
  const prefix = `Noto ${serif ? "Serif" : "Sans"}`;
  const locale = /(?:TC|TW|HK)|繁體|新細明體/i.test(name) ? "TC" : /(?:JP)|mincho|gothic|明朝|ゴシック/i.test(name) ? "JP" : /(?:KR)|batang|gulim|malgun/i.test(name) ? "KR" : /CJK|source\s*han|思源|宋|黑|微軟|微软|simsun|simhei|yahei/i.test(name) ? "SC" : "";
  const mapped = `${prefix}${locale ? ` ${locale}` : ""}`;
  return fonts.includes(mapped) ? mapped : prefix;
}

export function xlsxStyle(style: Partial<Excel.Style>, theme: string[], completeFont = false): IStyleData {
  const out: Json = {}, font = style.font;
  if (font) {
    if (completeFont) Object.assign(out, { bl: Number(!!font.bold), it: Number(!!font.italic), ul: { s: 0 }, st: { s: Number(!!font.strike) } });
    if (font.name) out.ff = xlsxFontFamily(font.name);
    if (font.size) out.fs = font.size;
    if (font.bold !== undefined) out.bl = Number(font.bold);
    if (font.italic !== undefined) out.it = Number(font.italic);
    if (font.underline) out.ul = { s: 1, t: String(font.underline).startsWith("double") ? 10 : 12 };
    if (font.strike !== undefined) out.st = { s: Number(font.strike) };
    const color = xlsxColor(font.color, theme);
    if (color) out.cl = { rgb: color };
  }
  const fill = style.fill;
  if (fill?.type === "pattern" && fill.pattern === "solid") {
    const color = xlsxColor(fill.fgColor ?? fill.bgColor, theme);
    if (color) out.bg = { rgb: color };
  }
  if (style.numFmt && style.numFmt !== "General") out.n = { pattern: style.numFmt };
  const alignment = style.alignment;
  if (alignment) {
    const ht = ({ left: 1, center: 2, right: 3, justify: 4, distributed: 6, centerContinuous: 2 } as Json)[alignment.horizontal ?? ""];
    const vt = ({ top: 1, middle: 2, bottom: 3, justify: 2, distributed: 2 } as Json)[alignment.vertical ?? ""];
    if (ht) out.ht = ht;
    if (vt) out.vt = vt;
    if (alignment.wrapText !== undefined) out.tb = alignment.wrapText ? 3 : 1;
    if (alignment.textRotation) out.tr = alignment.textRotation === "vertical" ? { v: 1, a: 0 } : { a: alignment.textRotation, v: 0 };
    if (alignment.readingOrder) out.td = alignment.readingOrder === "rtl" ? 2 : 1;
  }
  const border: Json = {};
  for (const [key, side] of [["t", "top"], ["b", "bottom"], ["l", "left"], ["r", "right"]] as const) {
    const edge = style.border?.[side];
    if (!edge?.style) continue;
    border[key] = { s: BORDER.indexOf(edge.style), cl: { rgb: xlsxColor(edge.color, theme) ?? "#000000" } };
  }
  const diagonal = style.border?.diagonal;
  if (diagonal?.style) {
    const edge = { s: BORDER.indexOf(diagonal.style), cl: { rgb: xlsxColor(diagonal.color, theme) ?? "#000000" } };
    if (diagonal.down) border.tl_br = edge;
    if (diagonal.up) border.bl_tr = edge;
  }
  if (Object.keys(border).length) out.bd = border;
  return out as IStyleData;
}

export function xlsxRange(ref: string): Json | null {
  const match = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(ref);
  if (!match) return null;
  const col = (v: string) => [...v.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return { startRow: Number(match[2]) - 1, endRow: Number(match[4] ?? match[2]) - 1, startColumn: col(match[1]), endColumn: col(match[3] ?? match[1]) };
}
const ranges = (ref: string): Json[] => ref.split(/\s+/).map(xlsxRange).filter((r): r is Json => !!r);
const serial = (date: Date) => {
  const days = (date.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  return days >= 61 ? days : days - 1;
};
const typed = (value: unknown): Json => value instanceof Date ? { v: serial(value), t: 2 } : typeof value === "number" ? { v: value, t: 2 } : typeof value === "boolean" ? { v: Number(value), t: 3 } : typeof value === "string" ? { v: value, t: 1 } : value && typeof value === "object" && "error" in value ? { v: String(value.error), t: 4 } : {};

function richDocument(cell: Excel.Cell, theme: string[]): Json | undefined {
  const value = cell.value as Json | null;
  const parts = value?.richText as Excel.RichText[] | undefined;
  const text = parts ? parts.map((part) => part.text).join("") : value?.hyperlink ? String(value.text ?? value.hyperlink) : cell.text;
  const indent = cell.alignment?.indent;
  if (!parts && !value?.hyperlink && !indent) return undefined;
  let start = 0;
  const textRuns = parts?.map((part) => {
    const st = start;
    start += part.text.length;
    return { st, ed: start, ts: xlsxStyle({ font: part.font }, theme, true) };
  });
  return { id: `xlsx-${cell.address}`, body: {
    dataStream: `${text}\r\n`,
    ...(textRuns ? { textRuns } : {}),
    paragraphs: [{ startIndex: text.length, ...(indent ? { paragraphStyle: { indentStart: { v: indent * 24, u: 3 } } } : {}) }],
    ...(value?.hyperlink ? { customRanges: [{ startIndex: 0, endIndex: Math.max(0, text.length - 1), rangeId: `link-${cell.address}`, rangeType: 0, properties: { url: value.hyperlink } }] } : {}),
  } };
}

function conditionals(sheet: Excel.Worksheet, theme: string[], xml: string): Json[] {
  const out: Json[] = [];
  const groups = (sheet as unknown as Json).conditionalFormattings ?? [];
  const rawRules = elements(xml, "cfRule");
  let ruleIndex = 0;
  for (const group of groups) for (const source of group.rules ?? []) {
    const rawRule = rawRules[ruleIndex++];
    const stopIfTrue = rawRule ? attr(rawRule[1], "stopIfTrue") === "1" : !!source.stopIfTrue;
    let rule: Json | undefined;
    const style = xlsxStyle(source.style ?? {}, theme);
    if (source.type === "cellIs") {
      const values = (source.formulae ?? []).map((v: unknown) => Number(v));
      const text = /^"((?:[^"]|"")*)"$/.exec(String(source.formulae?.[0] ?? ""));
      rule = text && ["equal", "notEqual"].includes(source.operator) ? { type: "highlightCell", subType: "text", operator: source.operator, value: text[1].replace(/""/g, '"'), style } : values.every(Number.isFinite) ? { type: "highlightCell", subType: "number", operator: source.operator, value: values.length > 1 ? values : values[0], style } : { type: "highlightCell", subType: "formula", value: cellIsFormula(source, group.ref), style };
    } else if (source.type === "expression") {
      const formula = String(source.formulae?.[0] ?? "");
      // Our exporter uses expressions for text equality. Restore the text rule so dropdown chips regain colours.
      const match = /^([A-Z]+\d+)(=|<>)"((?:[^"]|"")*)"$/i.exec(formula);
      const numberMatch = /^([A-Z]+\d+)(>=|<=|<>|=|>|<)([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/i.exec(formula);
      const origin = group.ref.split(/[ :]/)[0];
      if (match && match[1] === origin) rule = { type: "highlightCell", subType: "text", operator: match[2] === "=" ? "equal" : "notEqual", value: match[3].replace(/""/g, '"'), style };
      else if (numberMatch && numberMatch[1] === origin) rule = { type: "highlightCell", subType: "number", operator: ({ ">=": "greaterThanOrEqual", "<=": "lessThanOrEqual", "<>": "notEqual", "=": "equal", ">": "greaterThan", "<": "lessThan" } as Json)[numberMatch[2]], value: Number(numberMatch[3]), style };
      else {
        const between = /^OR\(([A-Z]+\d+)<([^,]+),\1>([^)]+)\)$/i.exec(formula);
        rule = between && between[1] === origin && Number.isFinite(Number(between[2])) && Number.isFinite(Number(between[3])) ? { type: "highlightCell", subType: "number", operator: "notBetween", value: [Number(between[2]), Number(between[3])], style } : { type: "highlightCell", subType: "formula", value: formula, style };
      }
    } else if (source.type === "colorScale") {
      rule = { type: "colorScale", config: (source.cfvo ?? []).map((value: Json, index: number) => ({ index, value: { type: value.type, ...(value.value !== undefined ? { value: value.value } : {}) }, color: xlsxColor(source.color?.[index], theme) ?? "#ffffff" })) };
    } else if (source.type === "dataBar") {
      const values = source.cfvo ?? [{ type: "min" }, { type: "max" }];
      rule = { type: "dataBar", isShowValue: source.showValue !== false, config: { min: values[0], max: values[1], isGradient: source.gradient !== false, positiveColor: xlsxColor(source.color, theme) ?? "#638ec6", nativeColor: "#ff0000" } };
    } else if (source.type === "containsText") {
      rule = { type: "highlightCell", subType: "text", operator: source.operator ?? "containsText", value: source.text ?? "", style };
    } else if (["duplicateValues", "uniqueValues"].includes(source.type)) {
      rule = { type: "highlightCell", subType: source.type, style };
    } else if (source.type === "top10") {
      rule = { type: "highlightCell", subType: "rank", isBottom: !!source.bottom, isPercent: !!source.percent, value: source.rank ?? 10, style };
    } else if (source.type === "aboveAverage") {
      rule = { type: "highlightCell", subType: "average", operator: source.aboveAverage === false ? "lessThan" : "greaterThan", style };
    } else if (source.type === "timePeriod") {
      rule = { type: "highlightCell", subType: "timePeriod", operator: source.timePeriod, style };
    }
    if (rule && ranges(group.ref).length) out.push({ cfId: `xlsx-cf-${out.length}`, ranges: ranges(group.ref), stopIfTrue, rule, priority: source.priority ?? out.length + 1 });
  }
  return out.sort((a, b) => a.priority - b.priority).map(({ priority: _, ...rule }) => rule);
}
function cellIsFormula(source: Json, ref: string): string {
  const cell = ref.split(/[ :]/)[0], [a, b] = source.formulae ?? [];
  const op = ({ equal: "=", notEqual: "<>", greaterThan: ">", lessThan: "<", greaterThanOrEqual: ">=", lessThanOrEqual: "<=" } as Json)[source.operator];
  return op ? `${cell}${op}${a}` : source.operator === "between" ? `AND(${cell}>=${a},${cell}<=${b})` : `OR(${cell}<${a},${cell}>${b})`;
}

function validations(sheet: Excel.Worksheet, cf: Json[], book: Excel.Workbook): Json[] {
  const model = ((sheet as unknown as Json).dataValidations?.model ?? {}) as Record<string, Excel.DataValidation>;
  const grouped = new Map<string, Json>();
  for (const [ref, source] of Object.entries(model)) {
    if (!source.type) continue;
    const key = JSON.stringify(source);
    let entry = grouped.get(key);
    if (!entry) {
      const type = ({ whole: "whole", decimal: "decimal", date: "date", textLength: "textLength", list: "list", custom: "custom" } as Json)[source.type];
      if (!type) continue;
      const formulae = source.formulae ?? [];
      const first = String(formulae[0] ?? "");
      const inline = source.type === "list" && first.startsWith('"') && first.endsWith('"');
      entry = { uid: `xlsx-dv-${grouped.size}`, ...source, type, formula1: inline ? first.slice(1, -1).replace(/""/g, '"') : formulae[0] instanceof Date ? String(serial(formulae[0])) : first, formula2: formulae[1] instanceof Date ? String(serial(formulae[1])) : String(formulae[1] ?? ""), errorStyle: source.errorStyle === "information" ? 0 : source.errorStyle === "warning" ? 2 : 1, ranges: [], inlineList: inline };
      delete entry.formulae;
      grouped.set(key, entry);
    }
    entry.ranges.push(...ranges(ref));
  }
  for (const entry of grouped.values()) {
    if (entry.type !== "list") continue;
    let options: string[] = [];
    if (entry.inlineList) options = entry.formula1.split(",");
    else {
      const reference = String(entry.formula1).replace(/^=/, "");
      const named = book.definedNames.model.find((name) => name.name === reference)?.ranges?.[0];
      const actual = named ?? reference;
      const [sheetPart, rangePart] = actual.includes("!") ? [actual.slice(0, actual.lastIndexOf("!")), actual.slice(actual.lastIndexOf("!") + 1)] : [sheet.name, actual];
      const target = book.getWorksheet(sheetPart.replace(/^'|'$/g, "").replace(/''/g, "'"));
      const rect = xlsxRange(rangePart);
      if (target && rect && (rect.endRow - rect.startRow + 1) * (rect.endColumn - rect.startColumn + 1) <= 1000) {
        for (let r = rect.startRow; r <= rect.endRow; r++) for (let c = rect.startColumn; c <= rect.endColumn; c++) options.push(target.getCell(r + 1, c + 1).text);
      } else if (!/[!:$]/.test(reference) && !named) options = [reference];
      entry.formula1 = `=${reference}`;
    }
    delete entry.inlineList;
    // Excel itself has no chip palette: infer it only from equality rules applying to this dropdown.
    const colors = options.map((option) => {
      const match = cf.find((item) => item.rule.type === "highlightCell" && item.rule.operator === "equal" && String(item.rule.value) === option && entry.ranges.every((area: Json) => item.ranges.some((range: Json) => range.startRow <= area.startRow && range.endRow >= area.endRow && range.startColumn <= area.startColumn && range.endColumn >= area.endColumn)));
      return match?.rule.style?.bg?.rgb ?? "";
    });
    if (colors.some(Boolean)) { entry.formula2 = colors.join(","); entry.renderMode = 0; }
  }
  return [...grouped.values()];
}

/** Preserve sparse coordinates, including content beyond the old 10k × 256 projection. */
export function importXlsxSheet(book: Excel.Workbook, sheet: Excel.Worksheet, files: Record<string, Uint8Array>): GridXlsxImport {
  const theme = xlsxTheme(files);
  const cellData: Record<number, Record<number, ICellData>> = {}, rowData: Json = {}, columnData: Json = {};
  const sheetXml = worksheetXml(files, sheet.name);
  const cf = conditionals(sheet, theme, sheetXml);
  // ExcelJS's model getter omits cell-less rows with only hidden/style settings.
  for (const rawRow of elements(sheetXml, "row")) {
    const rowNumber = Number(attr(rawRow[1], "r"));
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 1048576) continue;
    const row = sheet.getRow(rowNumber);
    const rowStyle = xlsxStyle((row as Excel.Row & { style: Partial<Excel.Style> }).style, theme, true);
    if (row.height !== undefined || row.hidden || Object.keys(rowStyle).length) rowData[row.number - 1] = { ...(Object.keys(rowStyle).length ? { s: rowStyle } : {}), ...(row.height !== undefined ? { h: row.height / .75 } : {}), ...(row.hidden ? { hd: 1 } : {}) };
    for (const raw of row.model?.cells ?? []) {
      const cell = sheet.getCell(String(raw.address));
      if (cell.isMerged && cell.master.address !== cell.address) continue;
      const style = xlsxStyle(cell.style, theme, true);
      const value = cell.value as Json | null;
      const data: Json = cell.formula ? { f: `=${cell.formula}`, ...typed(cell.result) } : typed(cell.value);
      if (value?.richText || value?.hyperlink) Object.assign(data, { v: cell.text, t: 1 });
      if (Object.keys(style).length) data.s = style;
      const p = richDocument(cell, theme);
      if (p) data.p = p;
      if (Object.keys(data).length) (cellData[Number(cell.row) - 1] ??= {})[Number(cell.col) - 1] = data as ICellData;
    }
  }
  for (let index = 0; index < (sheet.columns?.length ?? 0); index++) {
    const col = sheet.getColumn(index + 1);
    const columnStyle = xlsxStyle(col.style, theme, true);
    if (col.width !== undefined || col.hidden || Object.keys(columnStyle).length) columnData[col.number - 1] = { ...(Object.keys(columnStyle).length ? { s: columnStyle } : {}), ...(col.width !== undefined ? { w: col.width * 7 + 5 } : {}), ...(col.hidden ? { hd: 1 } : {}) };
  }
  const view = sheet.views?.[0];
  const worksheet: Partial<IWorksheetData> = {
    rowCount: Math.max(20, sheet.rowCount), columnCount: Math.max(8, sheet.columnCount, sheet.columns?.length ?? 0), cellData, rowData, columnData,
    mergeData: (sheet.model.merges ?? []).map(xlsxRange).filter(Boolean) as IWorksheetData["mergeData"],
    ...(sheet.state !== "visible" ? { hidden: 1 as const } : {}),
    ...(xlsxColor(sheet.properties.tabColor, theme) ? { tabColor: xlsxColor(sheet.properties.tabColor, theme) } : {}),
    ...(sheet.properties.defaultColWidth ? { defaultColumnWidth: sheet.properties.defaultColWidth * 7 + 5 } : {}),
    ...(sheet.properties.defaultRowHeight ? { defaultRowHeight: sheet.properties.defaultRowHeight / .75 } : {}),
    ...(view?.showGridLines === false ? { showGridlines: 0 as const } : {}),
    ...(view?.zoomScale ? { zoomRatio: view.zoomScale / 100 } : {}),
    ...(view?.state === "frozen" ? { freeze: { xSplit: view.xSplit ?? 0, ySplit: view.ySplit ?? 0, startRow: view.ySplit ?? 0, startColumn: view.xSplit ?? 0 } } : {}),
  };
  const drawings: Json = { data: {}, order: [] };
  for (const image of sheet.getImages()) {
    const media = book.getImage(Number(image.imageId));
    if (!media || !["png", "jpeg", "gif"].includes(media.extension)) continue;
    const data = media.buffer ? bytesToDataUrl(new Uint8Array(media.buffer as unknown as ArrayBuffer), `image/${media.extension}`) : media.base64;
    if (!data) continue;
    const range = image.range as Excel.ImageRange & { ext?: { width: number; height: number }; editAs?: string }, from = range.tl;
    const to = range.br;
    const drawingId = `xlsx-image-${drawings.order.length}-${image.imageId}`;
    const start = { row: from.nativeRow, column: from.nativeCol, rowOffset: from.nativeRowOff / 9525, columnOffset: from.nativeColOff / 9525 };
    const end = to ? { row: to.nativeRow, column: to.nativeCol, rowOffset: to.nativeRowOff / 9525, columnOffset: to.nativeColOff / 9525 } : imageEnd(start, range.ext, worksheet);
    worksheet.rowCount = Math.max(worksheet.rowCount ?? 20, end.row + 1);
    worksheet.columnCount = Math.max(worksheet.columnCount ?? 8, end.column + 1);
    const position = (point: Json) => ({
      left: point.columnOffset + axisPosition(point.column, columnData, "w", worksheet.defaultColumnWidth ?? 64),
      top: point.rowOffset + axisPosition(point.row, rowData, "h", worksheet.defaultRowHeight ?? 20),
    });
    const first = position(start), last = position(end);
    const drawing: Json = { drawingId, drawingType: 0, imageSourceType: "BASE64", source: data, sheetTransform: { from: start, to: end }, transform: { ...first, width: last.left - first.left, height: last.top - first.top }, axisAlignSheetTransform: { from: start, to: end }, anchorType: range.editAs === "absolute" ? "2" : range.editAs === "oneCell" ? "0" : "1" };
    if (range.editAs === "oneCell" && end.row === start.row + 1 && end.column === start.column + 1 && !start.rowOffset && !start.columnOffset && !end.rowOffset && !end.columnOffset) {
      const cell = (cellData[start.row] ??= {})[start.column] ??= {};
      const p = imageDocument(data, drawingId, columnData[start.column]?.w ?? worksheet.defaultColumnWidth ?? 64, rowData[start.row]?.h ?? worksheet.defaultRowHeight ?? 20);
      cell.p = p as unknown as ICellData["p"];
      delete cell.v;
      cell.t = 1;
    } else {
      drawings.data[drawingId] = drawing;
      drawings.order.push(drawingId);
    }
  }
  for (const image of richValueImages(files, sheetXml)) {
    const cell = (cellData[image.row] ??= {})[image.col] ??= {};
    cell.p = imageDocument(image.source, `xlsx-rich-image-${image.row}-${image.col}`, columnData[image.col]?.w ?? worksheet.defaultColumnWidth ?? 64, rowData[image.row]?.h ?? worksheet.defaultRowHeight ?? 20) as unknown as ICellData["p"];
    delete cell.v;
    cell.t = 1;
  }
  const names: Json = {};
  const xml = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  elements(xml, "definedName").forEach((entry, i) => {
    const name = attr(entry[1], "name");
    if (!name || name.startsWith("_xlnm.")) return;
    names[`xlsx-name-${i}`] = { id: `xlsx-name-${i}`, name, formulaOrRefString: unescapeXml(entry[2] ?? ""), ...(attr(entry[1], "localSheetId") !== "" ? { localSheetId: attr(entry[1], "localSheetId") } : {}), ...(attr(entry[1], "hidden") === "1" ? { hidden: true } : {}), ...(attr(entry[1], "comment") ? { comment: attr(entry[1], "comment") } : {}) };
  });
  const notes = worksheetNotes(files, sheet.name);
  for (const [row, line] of Object.entries(notes)) {
    worksheet.rowCount = Math.max(worksheet.rowCount ?? 20, Number(row) + 1);
    for (const col of Object.keys(line)) worksheet.columnCount = Math.max(worksheet.columnCount ?? 8, Number(col) + 1);
  }
  return { worksheet, names, resources: { SHEET_CONDITIONAL_FORMATTING_PLUGIN: cf, SHEET_DATA_VALIDATION_PLUGIN: validations(sheet, cf, book), ...(drawings.order.length ? { SHEET_DRAWING_PLUGIN: drawings } : {}), ...(Object.keys(notes).length ? { SHEET_NOTE_PLUGIN: notes } : {}) } };
}

function imageEnd(start: Json, ext: { width: number; height: number } | undefined, sheet: Partial<IWorksheetData>): Json {
  const axis = (index: number, offset: number, length: number, data: Json, field: string, fallback: number) => {
    let rest = offset + length;
    while (index < 1048575) { const size = data[index]?.[field] ?? fallback; if (rest < size) break; rest -= size; index++; }
    return [index, rest];
  };
  const [column, columnOffset] = axis(start.column, start.columnOffset, ext?.width ?? 100, sheet.columnData ?? {}, "w", sheet.defaultColumnWidth ?? 64);
  const [row, rowOffset] = axis(start.row, start.rowOffset, ext?.height ?? 100, sheet.rowData ?? {}, "h", sheet.defaultRowHeight ?? 20);
  return { row, column, rowOffset, columnOffset };
}

function worksheetPath(files: Record<string, Uint8Array>, name: string): string {
  const workbook = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const sheet = elements(workbook, "sheet").find((item) => attr(item[1], "name") === name);
  const id = sheet ? attr(sheet[1], "r:id") : "";
  const rels = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const rel = elements(rels, "Relationship").find((item) => attr(item[1], "Id") === id);
  const target = rel ? attr(rel[1], "Target") : "";
  return packagePath("xl", target);
}

function worksheetXml(files: Record<string, Uint8Array>, name: string): string {
  const path = worksheetPath(files, name);
  return files[path] ? strFromU8(files[path]) : "";
}

/** Legacy Excel comments become editable native cell notes, including empty cells. */
function worksheetNotes(files: Record<string, Uint8Array>, name: string): Record<number, Record<number, Json>> {
  const path = worksheetPath(files, name);
  const split = path.lastIndexOf("/"), base = path.slice(0, split);
  const rels = files[`${base}/_rels/${path.slice(split + 1)}.rels`];
  const notes: Record<number, Record<number, Json>> = {};
  for (const rel of elements(rels ? strFromU8(rels) : "", "Relationship")) {
    if (!/\/comments$/.test(attr(rel[1], "Type")) || attr(rel[1], "TargetMode") === "External") continue;
    const bytes = files[packagePath(base, attr(rel[1], "Target"))];
    if (!bytes) continue;
    for (const comment of elements(strFromU8(bytes), "comment")) {
      const ref = attr(comment[1], "ref"), range = xlsxRange(ref);
      if (!range || !/^\$?[A-Z]{1,3}\$?[1-9]\d*$/i.test(ref)) continue;
      const row = range.startRow, col = range.startColumn;
      if (row > 1048575 || col > 16383) continue;
      const text = elements(comment[2] ?? "", "text")[0]?.[2] ?? "";
      const note = elements(text, "t").map((run) => unescapeXml(run[2] ?? "")).join("");
      (notes[row] ??= {})[col] = { id: `xlsx-note-${row}-${col}`, row, col, width: 200, height: 80, note };
    }
  }
  return notes;
}

/** Complete inline document data required by Univer's cell-image resize/render controller. */
function imageDocument(source: string, id: string, cellWidth: number, cellHeight: number): Json {
  let width = cellWidth, height = cellHeight;
  const bytes = Uint8Array.from(atob(source.slice(source.indexOf(",") + 1)), (c) => c.charCodeAt(0));
  let naturalWidth = 0, naturalHeight = 0;
  if (bytes[0] === 0x89 && bytes.length >= 24) {
    const view = new DataView(bytes.buffer);
    naturalWidth = view.getUint32(16); naturalHeight = view.getUint32(20);
  } else if (bytes[0] === 0x47 && bytes.length >= 10) {
    naturalWidth = bytes[6] + bytes[7] * 256; naturalHeight = bytes[8] + bytes[9] * 256;
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 8 < bytes.length) {
      if (bytes[at] !== 0xff) break;
      const marker = bytes[at + 1], length = bytes[at + 2] * 256 + bytes[at + 3];
      if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) { naturalHeight = bytes[at + 5] * 256 + bytes[at + 6]; naturalWidth = bytes[at + 7] * 256 + bytes[at + 8]; break; }
      if (length < 2) break;
      at += length + 2;
    }
  }
  if (naturalWidth && naturalHeight) {
    const ratio = Math.min(cellWidth / naturalWidth, cellHeight / naturalHeight);
    width = naturalWidth * ratio; height = naturalHeight * ratio;
  }
  return { id, documentStyle: { pageSize: { width: null, height: null }, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 }, body: {
    dataStream: "\b\r\n", paragraphs: [{ startIndex: 1 }], sectionBreaks: [{ startIndex: 2 }], customBlocks: [{ startIndex: 0, blockId: id }],
  }, drawingsOrder: [id], drawings: { [id]: {
    drawingId: id, unitId: id, subUnitId: id, drawingType: 0, imageSourceType: "BASE64", source,
    transform: { left: 0, top: 0, width, height, angle: 0 },
    docTransform: { size: { width, height }, positionH: { relativeFrom: 0, posOffset: 0 }, positionV: { relativeFrom: 1, posOffset: 0 }, angle: 0 },
    behindDoc: 0, title: "", description: "", layoutType: 0, wrapText: 0, distB: 0, distL: 0, distR: 0, distT: 0,
  } } };
}

/** Modern Excel "Place in Cell" images live in rich-value metadata, not drawings. */
function richValueImages(files: Record<string, Uint8Array>, sheetXml: string): { row: number; col: number; source: string }[] {
  const text = (path: string) => files[path] ? strFromU8(files[path]) : "";
  const metadata = text("xl/metadata.xml");
  const valueMetadata = elements(elements(metadata, "valueMetadata")[0]?.[2] ?? "", "bk");
  const future = elements(metadata, "futureMetadata").find((item) => attr(item[1], "name") === "XLRICHVALUE");
  const futureValues = elements(future?.[2] ?? "", "bk");
  const types = elements(elements(metadata, "metadataTypes")[0]?.[2] ?? "", "metadataType");
  const values = elements(text("xl/richData/rdrichvalue.xml"), "rv");
  const structures = elements(text("xl/richData/rdrichvaluestructure.xml"), "s");
  const relIds = elements(text("xl/richData/richValueRel.xml"), "rel");
  const rels = elements(text("xl/richData/_rels/richValueRel.xml.rels"), "Relationship");
  const out: { row: number; col: number; source: string }[] = [];
  for (const cell of elements(sheetXml, "c")) {
    const vm = Number(attr(cell[1], "vm"));
    if (!vm) continue;
    const record = elements(valueMetadata[vm - 1]?.[2] ?? "", "rc")[0];
    if (!record || attr(types[Number(attr(record[1], "t")) - 1]?.[1] ?? "", "name") !== "XLRICHVALUE") continue;
    const futureValue = futureValues[Number(attr(record[1], "v"))];
    const richIndex = Number(attr(elements(futureValue?.[2] ?? "", "rvb")[0]?.[1] ?? "", "i"));
    const value = values[richIndex];
    if (!value) continue;
    const structure = structures[Number(attr(value[1], "s"))];
    if (!structure || attr(structure[1], "t") !== "_localImage") continue;
    const keyIndex = elements(structure[2] ?? "", "k").findIndex((key) => attr(key[1], "n") === "_rvRel:LocalImageIdentifier");
    if (keyIndex < 0) continue;
    const imageIndex = Number(elements(value[2] ?? "", "v")[keyIndex]?.[2]);
    const id = attr(relIds[imageIndex]?.[1] ?? "", "r:id");
    const rel = rels.find((item) => attr(item[1], "Id") === id);
    if (!rel || attr(rel[1], "TargetMode") === "External") continue;
    const path = packagePath("xl/richData", attr(rel[1], "Target"));
    const bytes = files[path], rect = xlsxRange(attr(cell[1], "r"));
    const extension = /\.(png|jpe?g|gif)$/i.exec(path)?.[1].toLowerCase();
    if (bytes && rect && extension) out.push({ row: rect.startRow, col: rect.startColumn, source: bytesToDataUrl(bytes, `image/${extension === "jpg" ? "jpeg" : extension}`) });
  }
  return out;
}
function packagePath(base: string, target: string): string {
  const parts: string[] = [];
  for (const part of (target.startsWith("/") ? target.slice(1) : `${base}/${target}`).split("/")) {
    if (part === "..") parts.pop(); else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

function axisPosition(index: number, data: Json, field: string, fallback: number): number {
  let size = index * fallback;
  for (const [key, value] of Object.entries(data) as [string, Json][]) {
    if (Number(key) < index) {
      if (value.hd === 1) size -= fallback;
      else if (typeof value[field] === "number") size += value[field] - fallback;
    }
  }
  return size;
}
