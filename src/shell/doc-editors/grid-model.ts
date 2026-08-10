"use client";

import type { LibraryItem } from "../library-data";
import { urlExtension } from "./doc-io";
import { evaluateGridCell, type GridFormulaValue } from "./grid-formula";
import { normalizeGridSheetIdentities } from "./grid-sheet-identity";
import {
  fetchValidatedSpreadsheetSource,
  validateOfficePackageBlob,
  validateSpreadsheetParserBytes,
} from "./office-file";
import {
  conditionalGridStyle,
  normalizeGridConditionalFormats,
  normalizeGridMerges,
  type GridConditionalFormat,
  type GridMerge,
} from "./grid-structure";

export interface GridSheet {
  id: string;
  name: string;
  rows: string[][];
  formats: Record<string, GridCellFormat>;
  merges: GridMerge[];
  conditionalFormats: GridConditionalFormat[];
}

export interface NormalizedGridProjectSheetState {
  sheets: GridSheet[];
  activeSheetId: string;
}

export interface GridCell {
  row: number;
  col: number;
}

export type GridCellType =
  | "auto"
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "date";

export interface GridCellFormat {
  type?: GridCellType;
  decimals?: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  background?: string;
}

export const GRID_MIN_ROWS = 20;
export const GRID_MIN_COLS = 8;
export const GRID_MAX_ROWS = 10_000;
export const GRID_MAX_COLS = 256;

/**
 * §2.1 palette. Values are taken verbatim from the spec table — the
 * `grid.border` entry in particular MUST stay `#7D8590`: the earlier
 * `#D0D7DE` measures 1.45:1 against white, so the SC 1.4.11 obligation the
 * spec attaches to grid lines could never hold, and grid lines are load
 * bearing (they are what tells the reader which row and column a number
 * belongs to). `grid.border.faint` keeps `#D0D7DE` but is decoration only and
 * MUST NOT be used for cell boundaries.
 */
export const GRID_PALETTE = {
  surface: "#FFFFFF",
  headerFill: "#1F6FEB",
  headerText: "#FFFFFF",
  zebra: "#F2F5F9",
  text: "#1F2328",
  formula: "#0969DA",
  total: "#1A7F37",
  negative: "#CF222E",
  border: "#7D8590",
  borderFaint: "#D0D7DE",
} as const;

/** §2.2 layout, in px. */
export const GRID_LAYOUT = {
  defaultColumnWidthPx: 96,
  textColumnWidthPx: 180,
  numberColumnWidthPx: 112,
  rowHeightPx: 28,
  headerRowHeightPx: 32,
  frozenRows: 1,
  frozenCols: 1,
  minimumHitAreaPx: 24,
} as const;

/** §2.3 type scale, in px. `total` is 14 px bold. */
export const GRID_FONT_SCALE = {
  header: 14,
  cell: 13,
  total: 14,
  caption: 11,
} as const;

/**
 * §4 numeric constant table, C1–C38. Kept as one object so the contract test
 * can assert every value against the spec instead of trusting scattered
 * literals.
 */
export const GRID_CONSTANTS = {
  C1_minSheets: 1,
  C2_maxSheets: 12,
  C3_maxSheetNameLength: 31,
  C4_minColumns: 2,
  C5_maxColumns: 64,
  C6_minDataRows: 4,
  C7_maxDataRows: 5_000,
  C8_minCellCount: 24,
  C9_minFormulaCells: 3,
  C10_minFormulaRatioPercent: 5,
  C11_formulaWhitelistSize: 22,
  C12_maxFormulaLength: 500,
  C13_maxNamedRanges: 64,
  C14_maxReferenceDepth: 32,
  C15_precisionRange: [0, 8],
  C16_defaultColumnWidthPx: 96,
  C17_textColumnWidthPx: 180,
  C18_numberColumnWidthPx: 112,
  C19_columnWidthRangePx: [48, 480],
  C20_rowHeightPx: 28,
  C21_headerRowHeightPx: 32,
  C22_freezeRowRange: [0, 8],
  C23_freezeColRange: [0, 8],
  C24_maxEmphasisRows: 64,
  C25_tieOutToleranceYuan: 0.01,
  C26_irrMaxIterations: 200,
  C27_textContrast: 4.5,
  C28_gridlineContrast: 3.0,
  C29_minimumHitAreaPx: 24,
  C30_irMinBytes: 3_072,
  C31_xlsxMinBytes: 12_288,
  C32_xlsxMaxBytes: 52_428_800,
  C33_maxGenerationMs: 3_000,
  C34_maxRecalcMs: 500,
  C35_minCoverEdgePx: 128,
  C36_minFrameColours: 12,
  C37_maxFamilyJaccard: 0.85,
  C38_twinThreshold: 0.99,
} as const;

/** §8.1 / §4 C30 — the floor that closes the 194–199 B hollow IR. */
export const GRID_IR_MIN_BYTES = GRID_CONSTANTS.C30_irMinBytes;
/** §8.1 / §4 C31. */
export const GRID_XLSX_MIN_BYTES = GRID_CONSTANTS.C31_xlsxMinBytes;
/** §8.1 / §4 C32. */
export const GRID_XLSX_MAX_BYTES = GRID_CONSTANTS.C32_xlsxMaxBytes;
/** §7 A4 upper bound on the project IR. */
export const GRID_IR_MAX_BYTES = 2_097_152;

let idSerial = 0;

export function gridId(prefix = "sheet"): string {
  idSerial += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSerial.toString(36)}`;
}

export function emptyGridRows(
  rows = GRID_MIN_ROWS,
  cols = GRID_MIN_COLS,
): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(""));
}

export function emptyGridSheet(name = "Sheet1"): GridSheet {
  return {
    id: gridId(),
    name,
    rows: emptyGridRows(),
    formats: {},
    merges: [],
    conditionalFormats: [],
  };
}

export function cloneGridSheets(sheets: GridSheet[]): GridSheet[] {
  return sheets.map((sheet) => ({
    ...sheet,
    rows: sheet.rows.map((row) => [...row]),
    formats: Object.fromEntries(
      Object.entries(sheet.formats || {}).map(([key, format]) => [
        key,
        { ...format },
      ]),
    ),
    merges: (sheet.merges || []).map((merge) => ({ ...merge })),
    conditionalFormats: (sheet.conditionalFormats || []).map((rule) => ({
      ...rule,
      range: { ...rule.range },
    })),
  }));
}

function normalizeRows(rows: unknown[][]): string[][] {
  return rows.slice(0, GRID_MAX_ROWS).map((row) =>
    row
      .slice(0, GRID_MAX_COLS)
      .map((value) => (value == null ? "" : String(value))),
  );
}

function uniqueSheetName(name: string, used: Set<string>): string {
  const base = name.trim().slice(0, 31) || "Sheet";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let serial = 2;
  while (used.has(`${base.slice(0, 27)}-${serial}`)) serial += 1;
  const result = `${base.slice(0, 27)}-${serial}`;
  used.add(result);
  return result;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function normalizeFormats(value: unknown): Record<string, GridCellFormat> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, GridCellFormat> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+:\d+$/.test(key) || !raw || typeof raw !== "object") continue;
    const format = raw as Record<string, unknown>;
    const type = String(format.type || "auto") as GridCellType;
    result[key] = {
      type: ["auto", "text", "number", "currency", "percent", "date"].includes(
        type,
      )
        ? type
        : "auto",
      decimals: Math.max(0, Math.min(8, Number(format.decimals || 0))),
      bold: Boolean(format.bold),
      align:
        format.align === "center" || format.align === "right"
          ? format.align
          : "left",
      color: typeof format.color === "string" ? format.color : undefined,
      background:
        typeof format.background === "string"
          ? format.background
          : undefined,
    };
  }
  return result;
}

export function normalizeGridProjectSheetState(
  value: unknown,
  activeSheetId: unknown = "",
): NormalizedGridProjectSheetState {
  const rawSheets = Array.isArray(value) ? value : [];
  const candidates = rawSheets.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    if (!Array.isArray(record.rows)) return [];
    return [
      {
        index,
        record,
        rows: record.rows.filter(Array.isArray) as unknown[][],
      },
    ];
  });
  const identities = normalizeGridSheetIdentities(
    candidates.map(({ record }) => record.id),
    activeSheetId,
  );
  const usedNames = new Set<string>();
  const sheets = candidates.map(({ index, record, rows }, sheetIndex) => ({
    id: identities.ids[sheetIndex],
    name: uniqueSheetName(
      String(record.name || `Sheet${index + 1}`),
      usedNames,
    ),
    rows: normalizeRows(rows),
    formats: normalizeFormats(record.formats),
    merges: normalizeGridMerges(
      record.merges,
      GRID_MAX_ROWS,
      GRID_MAX_COLS,
    ),
    conditionalFormats: normalizeGridConditionalFormats(
      record.conditionalFormats,
      GRID_MAX_ROWS,
      GRID_MAX_COLS,
    ),
  }));
  return { sheets, activeSheetId: identities.activeSheetId };
}

export function normalizeGridProjectSheets(value: unknown): GridSheet[] {
  return normalizeGridProjectSheetState(value).sheets;
}

function structuredSheets(item: LibraryItem): GridSheet[] {
  const rawSheets = Array.isArray(item.meta.sheets)
    ? item.meta.sheets
    : Array.isArray(item.meta.rows)
      ? [{ name: "Sheet1", rows: item.meta.rows }]
      : [];
  return normalizeGridProjectSheets(rawSheets);
}

async function readWorkbook(
  source: ArrayBuffer | string,
  type: "array" | "string",
): Promise<GridSheet[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(source, {
    type,
    cellDates: true,
    cellFormula: true,
    cellStyles: true,
  });
  const used = new Set<string>();
  return workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const rows: string[][] = [];
    const formats: Record<string, GridCellFormat> = {};
    let originRow = 0;
    let originCol = 0;
    if (worksheet?.["!ref"]) {
      const range = XLSX.utils.decode_range(worksheet["!ref"]);
      originRow = range.s.r;
      originCol = range.s.c;
      const lastRow = Math.min(range.e.r, range.s.r + GRID_MAX_ROWS - 1);
      const lastCol = Math.min(range.e.c, range.s.c + GRID_MAX_COLS - 1);
      for (let row = range.s.r; row <= lastRow; row += 1) {
        const nextRow: string[] = [];
        for (let col = range.s.c; col <= lastCol; col += 1) {
          const address = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[address] as
            | {
                f?: string;
                t?: string;
                v?: unknown;
                z?: unknown;
                s?: {
                  font?: { bold?: boolean; color?: { rgb?: string } };
                  alignment?: { horizontal?: string };
                  fill?: { fgColor?: { rgb?: string } };
                };
              }
            | undefined;
          const value = cell?.v;
          nextRow.push(
            cell?.f
              ? `=${cell.f}`
              : value instanceof Date
                ? value.toISOString().slice(0, 10)
                : value == null
                  ? ""
                  : String(value),
          );
          if (cell) {
            const format: GridCellFormat = {};
            const numberFormat = String(cell.z || "");
            if (value instanceof Date || /[ymdhis]/i.test(numberFormat)) {
              format.type = "date";
            } else if (cell.t === "n" && /%/.test(numberFormat)) {
              format.type = "percent";
            } else if (cell.t === "n" && /[$¥€£]/.test(numberFormat)) {
              format.type = "currency";
            } else if (cell.t === "n") {
              format.type = "number";
            }
            if (cell.s?.font?.bold) format.bold = true;
            const align = cell.s?.alignment?.horizontal;
            if (align === "center" || align === "right" || align === "left") {
              format.align = align;
            }
            const color = cell.s?.font?.color?.rgb?.slice(-6);
            if (color && /^[0-9a-f]{6}$/i.test(color)) {
              format.color = `#${color}`;
            }
            const background = cell.s?.fill?.fgColor?.rgb?.slice(-6);
            if (background && /^[0-9a-f]{6}$/i.test(background)) {
              format.background = `#${background}`;
            }
            if (Object.keys(format).length > 0) {
              formats[cellKey(row - range.s.r, col - range.s.c)] = format;
            }
          }
        }
        rows.push(nextRow);
      }
    }
    return {
      id: gridId(),
      name: uniqueSheetName(name, used),
      rows,
      formats,
      merges: normalizeGridMerges(
        (worksheet["!merges"] || []).map((merge) => ({
          firstRow: merge.s.r - originRow,
          lastRow: merge.e.r - originRow,
          firstCol: merge.s.c - originCol,
          lastCol: merge.e.c - originCol,
        })),
        GRID_MAX_ROWS,
        GRID_MAX_COLS,
      ),
      conditionalFormats: [],
    };
  });
}

export async function loadGridSheets(
  item: LibraryItem,
  signal?: AbortSignal,
  onSourceAccessError?: () => void,
): Promise<GridSheet[]> {
  const local = structuredSheets(item);
  if (local.length > 0) return local;
  const url = item.url || "";
  const extension = urlExtension(url);
  const hasWorkbookUrl =
    Boolean(url) &&
    (["csv", "xlsx", "xls", "xlsm", "ods"].includes(extension) ||
      item.kind === "sheet");
  const hasCsvContent =
    typeof item.content === "string" && item.content.length > 0;
  if (!hasWorkbookUrl && !hasCsvContent) return [emptyGridSheet()];

  const sheets = hasWorkbookUrl
    ? await readWorkbook(
        await fetchValidatedSpreadsheetSource(url, item, {
          maxBytes: 48 * 1024 * 1024,
          signal,
          onAccessDenied: onSourceAccessError,
        }),
        "array",
      )
    : await readWorkbook(item.content || "", "string");
  return sheets.length > 0 ? sheets : [emptyGridSheet()];
}

export async function loadGridFile(file: File): Promise<GridSheet[]> {
  const extension = file.name.toLowerCase().split(".").pop() || "";
  if (!["csv", "xlsx", "xls", "xlsm", "ods"].includes(extension)) {
    throw new Error("只支持 CSV、XLS、XLSX、XLSM 或 ODS");
  }
  const sheets =
    extension === "csv"
      ? await readWorkbook(await file.text(), "string")
      : await readWorkbook(
          ["xlsx", "xlsm"].includes(extension)
            ? await validateOfficePackageBlob(file, "xlsx")
            : await file.arrayBuffer().then((arrayBuffer) => {
                validateSpreadsheetParserBytes(
                  new Uint8Array(arrayBuffer),
                  file.type,
                );
                return arrayBuffer;
              }),
          "array",
        );
  return sheets.length > 0 ? sheets : [emptyGridSheet()];
}

export function gridRowCount(sheet: GridSheet): number {
  return Math.max(GRID_MIN_ROWS, sheet.rows.length);
}

export function gridColCount(sheet: GridSheet): number {
  return Math.max(
    GRID_MIN_COLS,
    sheet.rows.reduce((max, row) => Math.max(max, row.length), 0),
  );
}

export function gridCellValue(
  sheet: GridSheet,
  row: number,
  col: number,
): string {
  return sheet.rows[row]?.[col] ?? "";
}

export function setGridCell(
  sheet: GridSheet,
  row: number,
  col: number,
  value: string,
): void {
  while (sheet.rows.length <= row) sheet.rows.push([]);
  while (sheet.rows[row].length <= col) sheet.rows[row].push("");
  sheet.rows[row][col] = value;
}

export function gridCellFormat(
  sheet: GridSheet,
  row: number,
  col: number,
): GridCellFormat {
  return sheet.formats?.[cellKey(row, col)] ?? {};
}

export function gridDisplayFormat(
  sheet: GridSheet,
  row: number,
  col: number,
): GridCellFormat {
  return {
    ...gridCellFormat(sheet, row, col),
    ...conditionalGridStyle(
      sheet.conditionalFormats,
      row,
      col,
      evaluateGridCell(sheet.rows, row, col),
    ),
  };
}

export function formatGridValue(
  value: GridFormulaValue,
  format: GridCellFormat = {},
): string {
  if (typeof value === "string" && value.startsWith("#")) return value;
  const type = format.type || "auto";
  if (type === "text") return String(value);
  if (type === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat("zh-CN").format(date);
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || type === "auto") return String(value);
  const decimals = Math.max(0, Math.min(8, format.decimals ?? 2));
  if (type === "currency") {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numeric);
  }
  if (type === "percent") {
    return new Intl.NumberFormat("zh-CN", {
      style: "percent",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numeric);
  }
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  }).format(numeric);
}

export function gridDisplayValue(
  sheet: GridSheet,
  row: number,
  col: number,
): string {
  return formatGridValue(
    evaluateGridCell(sheet.rows, row, col),
    gridCellFormat(sheet, row, col),
  );
}

export function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function sanitizeSheetName(value: string): string {
  return value.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet";
}

function usedBounds(sheet: GridSheet): { rows: number; cols: number } {
  let rows = sheet.rows.length;
  let cols = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
  while (
    rows > 1 &&
    (sheet.rows[rows - 1] || []).every((value) => value === "")
  ) {
    rows -= 1;
  }
  while (
    cols > 1 &&
    sheet.rows.slice(0, rows).every((row) => (row[cols - 1] ?? "") === "")
  ) {
    cols -= 1;
  }
  return { rows: Math.max(1, rows), cols: Math.max(1, cols) };
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function gridSheetToCsv(sheet: GridSheet): string {
  const bounds = usedBounds(sheet);
  return Array.from({ length: bounds.rows }, (_, row) =>
    Array.from({ length: bounds.cols }, (_, col) =>
      csvCell(String(evaluateGridCell(sheet.rows, row, col))),
    ).join(","),
  ).join("\r\n");
}

function exportValue(value: string, format: GridCellFormat): unknown {
  if (value.startsWith("=")) return 0;
  if (format.type === "date") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (
    format.type === "number" ||
    format.type === "currency" ||
    format.type === "percent"
  ) {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/, ""));
    if (Number.isFinite(parsed)) {
      return format.type === "percent" && value.trim().endsWith("%")
        ? parsed / 100
        : parsed;
    }
  }
  return value;
}

function excelColor(value: string | undefined): { argb: string } | undefined {
  const hex = String(value || "").replace("#", "");
  return /^[0-9a-f]{6}$/i.test(hex)
    ? { argb: `FF${hex.toUpperCase()}` }
    : undefined;
}

/** Build a styled editable workbook; ExcelJS stays outside the SSR bundle. */
export async function buildGridWorkbookBlob(
  sheets: GridSheet[],
): Promise<Blob> {
  const imported = (await import("exceljs")) as typeof import("exceljs") & {
    default?: typeof import("exceljs");
  };
  const ExcelJS = imported.Workbook ? imported : (imported.default ?? imported);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OceanLeo";
  workbook.created = new Date();
  for (const source of sheets) {
    const bounds = usedBounds(source);
    const worksheet = workbook.addWorksheet(sanitizeSheetName(source.name));
    for (let row = 0; row < bounds.rows; row += 1) {
      for (let col = 0; col < bounds.cols; col += 1) {
        const raw = gridCellValue(source, row, col);
        const format = gridDisplayFormat(source, row, col);
        const target = worksheet.getCell(row + 1, col + 1);
        if (raw.startsWith("=")) {
          const result = evaluateGridCell(source.rows, row, col);
          target.value = {
            formula: raw.slice(1),
            result:
              typeof result === "number" || typeof result === "string"
                ? result
                : 0,
          };
        } else {
          target.value = exportValue(raw, format) as
            | string
            | number
            | Date;
        }
        const decimals = Math.max(0, Math.min(8, format.decimals ?? 2));
        if (format.type === "currency") {
          target.numFmt = `¥#,##0${decimals ? `.${"0".repeat(decimals)}` : ""}`;
        } else if (format.type === "percent") {
          target.numFmt = `0${decimals ? `.${"0".repeat(decimals)}` : ""}%`;
        } else if (format.type === "date") {
          target.numFmt = "yyyy-mm-dd";
        } else if (format.type === "number") {
          target.numFmt = `0${decimals ? `.${"0".repeat(decimals)}` : ""}`;
        }
        if (format.bold || format.color) {
          target.font = {
            bold: Boolean(format.bold),
            ...(excelColor(format.color)
              ? { color: excelColor(format.color) }
              : {}),
          };
        }
        if (format.align) {
          target.alignment = { horizontal: format.align, vertical: "middle" };
        }
        const background = excelColor(format.background);
        if (background) {
          target.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: background,
          };
        }
      }
    }
    // Assign values before merging: ExcelJS redirects writes to merged slave
    // cells into the master and would otherwise overwrite the leading value.
    for (const merge of source.merges) {
      worksheet.mergeCells(
        merge.firstRow + 1,
        merge.firstCol + 1,
        merge.lastRow + 1,
        merge.lastCol + 1,
      );
    }
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ------------------------------------------------------------------------- *
 * `oceanleo.grid.v1` — the carrier IR (§3)
 *
 * Two byte forms carry one workbook (§1.2): this JSON IR is the editor project
 * and the `project_schema`, and the xlsx zip is the downloadable source. Both
 * have their own floor, because the 194–199 B shells the contract measured were
 * on the IR side only and a floor on just one side would not have caught them.
 * ------------------------------------------------------------------------- */

export const GRID_IR_SCHEMA = "oceanleo.grid.v1";
export const GRID_IR_VERSION = 1;

export const GRID_IR_COLUMN_TYPES = [
  "text",
  "number",
  "integer",
  "currency",
  "percent",
  "date",
  "boolean",
] as const;

export type GridIrColumnType = (typeof GRID_IR_COLUMN_TYPES)[number];

export interface GridIrColumn {
  name: string;
  type: GridIrColumnType;
  unit?: string;
  widthPx?: number;
  precision?: number;
}

/** §3 `$defs.cell` formula form: `{ f }` alone, or `{ f, v }` with the cache. */
export interface GridIrFormulaCell {
  f: string;
  v?: number | string | boolean;
}

/**
 * The four shapes here are exactly the four `buildXlsx` cell writings recorded
 * in §0 R3. A fifth shape MUST NOT be added without a schema version bump
 * (§3.1 closing note).
 */
export type GridIrCell =
  | string
  | number
  | boolean
  | null
  | GridIrFormulaCell;

export interface GridIrEmphasisRow {
  index: number;
  kind: "subtotal" | "total";
}

export interface GridIrFreezePanes {
  rows?: number;
  cols?: number;
}

export interface GridIrSheet {
  name: string;
  headerRow: boolean;
  freezePanes?: GridIrFreezePanes;
  columns: GridIrColumn[];
  rows: GridIrCell[][];
  emphasisRows?: GridIrEmphasisRow[];
}

export interface GridIrNamedRange {
  name: string;
  ref: string;
}

export interface GridIrAttributionEntry {
  text: string;
  licenseCode: string;
  licenseUrl: string;
}

export interface GridIrProject {
  schema: typeof GRID_IR_SCHEMA;
  version: typeof GRID_IR_VERSION;
  title: string;
  sheets: GridIrSheet[];
  namedRanges?: GridIrNamedRange[];
  attribution: { entries: GridIrAttributionEntry[] };
}

export interface GridIrValidationError {
  /** JSON pointer into the document, so a rejection names the offending node. */
  path: string;
  code: string;
  message: string;
}

export type GridIrValidation =
  | { ok: true; project: GridIrProject }
  | { ok: false; errors: GridIrValidationError[] };

export class GridIrParseError extends Error {
  readonly code: string;
  readonly errors: GridIrValidationError[];

  constructor(code: string, message: string, errors: GridIrValidationError[] = []) {
    super(message);
    this.name = "GridIrParseError";
    this.code = code;
    this.errors = errors;
  }
}

const NAMED_RANGE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
const NAMED_RANGE_REF = /^[A-Za-z0-9_]+![A-Z]{1,3}[0-9]{1,5}(:[A-Z]{1,3}[0-9]{1,5})?$/;
const LICENSE_URL = /^https:\/\/\S+$/;

const SHEET_KEYS = new Set([
  "name",
  "headerRow",
  "freezePanes",
  "columns",
  "rows",
  "emphasisRows",
]);
const COLUMN_KEYS = new Set(["name", "type", "unit", "widthPx", "precision"]);
const TOP_LEVEL_KEYS = new Set([
  "schema",
  "version",
  "title",
  "sheets",
  "namedRanges",
  "attribution",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extraKeys(
  source: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): string[] {
  return Object.keys(source).filter((key) => !allowed.has(key));
}

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validateCell(
  value: unknown,
  path: string,
  errors: GridIrValidationError[],
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }
  const cell = record(value);
  if (!cell) {
    errors.push({
      path,
      code: "cell-shape",
      message: "单元格只能是 string / number / boolean / null / { f, v }",
    });
    return;
  }
  for (const key of extraKeys(cell, new Set(["f", "v"]))) {
    errors.push({
      path: `${path}/${key}`,
      code: "additional-properties",
      message: `公式单元格不允许字段 ${key}`,
    });
  }
  if (
    typeof cell.f !== "string" ||
    cell.f.length < 2 ||
    cell.f.length > GRID_CONSTANTS.C12_maxFormulaLength
  ) {
    errors.push({
      path: `${path}/f`,
      code: "formula-length",
      message: `f 长度必须在 2 与 ${GRID_CONSTANTS.C12_maxFormulaLength} 之间（§4 C12）`,
    });
  }
  if (
    cell.v !== undefined &&
    !["number", "string", "boolean"].includes(typeof cell.v)
  ) {
    errors.push({
      path: `${path}/v`,
      code: "cache-type",
      message: "缓存值只能是 number / string / boolean",
    });
  }
}

function validateSheet(
  value: unknown,
  path: string,
  errors: GridIrValidationError[],
): void {
  const sheet = record(value);
  if (!sheet) {
    errors.push({ path, code: "sheet-shape", message: "工作表必须是对象" });
    return;
  }
  for (const key of extraKeys(sheet, SHEET_KEYS)) {
    errors.push({
      path: `${path}/${key}`,
      code: "additional-properties",
      message: `工作表不允许字段 ${key}`,
    });
  }
  if (
    typeof sheet.name !== "string" ||
    sheet.name.length < 1 ||
    sheet.name.length > GRID_CONSTANTS.C3_maxSheetNameLength
  ) {
    errors.push({
      path: `${path}/name`,
      code: "sheet-name",
      message: `工作表名长度必须在 1 与 ${GRID_CONSTANTS.C3_maxSheetNameLength} 之间（§4 C3）`,
    });
  }
  if (typeof sheet.headerRow !== "boolean") {
    errors.push({
      path: `${path}/headerRow`,
      code: "header-row",
      message: "headerRow 必须存在且为 boolean（SC 1.3.1 靠它可编程识别表头）",
    });
  }
  const freeze = sheet.freezePanes;
  if (freeze !== undefined) {
    const panes = record(freeze);
    if (!panes) {
      errors.push({
        path: `${path}/freezePanes`,
        code: "freeze-shape",
        message: "freezePanes 必须是对象",
      });
    } else {
      for (const key of extraKeys(panes, new Set(["rows", "cols"]))) {
        errors.push({
          path: `${path}/freezePanes/${key}`,
          code: "additional-properties",
          message: `freezePanes 不允许字段 ${key}`,
        });
      }
      if (panes.rows !== undefined && !integerInRange(panes.rows, 0, 8)) {
        errors.push({
          path: `${path}/freezePanes/rows`,
          code: "freeze-rows",
          message: "冻结行数必须在 0–8（§4 C22）",
        });
      }
      if (panes.cols !== undefined && !integerInRange(panes.cols, 0, 8)) {
        errors.push({
          path: `${path}/freezePanes/cols`,
          code: "freeze-cols",
          message: "冻结列数必须在 0–8（§4 C23）",
        });
      }
    }
  }
  const columns = Array.isArray(sheet.columns) ? sheet.columns : null;
  const minColumns = GRID_CONSTANTS.C4_minColumns;
  if (
    !columns ||
    columns.length < minColumns ||
    columns.length > GRID_CONSTANTS.C5_maxColumns
  ) {
    errors.push({
      path: `${path}/columns`,
      code: "column-count",
      message: `列数必须在 ${minColumns} 与 ${GRID_CONSTANTS.C5_maxColumns} 之间（§4 C4/C5，单列不构成表）`,
    });
  }
  (columns || []).forEach((raw, index) => {
    const column = record(raw);
    const columnPath = `${path}/columns/${index}`;
    if (!column) {
      errors.push({
        path: columnPath,
        code: "column-shape",
        message: "列定义必须是对象",
      });
      return;
    }
    for (const key of extraKeys(column, COLUMN_KEYS)) {
      errors.push({
        path: `${columnPath}/${key}`,
        code: "additional-properties",
        message: `列定义不允许字段 ${key}`,
      });
    }
    if (
      typeof column.name !== "string" ||
      column.name.length < 1 ||
      column.name.length > 64
    ) {
      errors.push({
        path: `${columnPath}/name`,
        code: "column-name",
        message: "列名长度必须在 1 与 64 之间",
      });
    }
    if (!GRID_IR_COLUMN_TYPES.includes(column.type as GridIrColumnType)) {
      errors.push({
        path: `${columnPath}/type`,
        code: "column-type",
        message: `列类型必须取 ${GRID_IR_COLUMN_TYPES.join(" / ")}`,
      });
    }
    if (column.unit !== undefined && (typeof column.unit !== "string" || column.unit.length > 24)) {
      errors.push({
        path: `${columnPath}/unit`,
        code: "column-unit",
        message: "unit 长度上限 24",
      });
    }
    if (
      column.widthPx !== undefined &&
      !integerInRange(
        column.widthPx,
        GRID_CONSTANTS.C19_columnWidthRangePx[0],
        GRID_CONSTANTS.C19_columnWidthRangePx[1],
      )
    ) {
      errors.push({
        path: `${columnPath}/widthPx`,
        code: "column-width",
        message: `列宽必须在 ${GRID_CONSTANTS.C19_columnWidthRangePx.join("–")} px（§4 C19）`,
      });
    }
    if (
      column.precision !== undefined &&
      !integerInRange(
        column.precision,
        GRID_CONSTANTS.C15_precisionRange[0],
        GRID_CONSTANTS.C15_precisionRange[1],
      )
    ) {
      errors.push({
        path: `${columnPath}/precision`,
        code: "column-precision",
        message: `小数位必须在 ${GRID_CONSTANTS.C15_precisionRange.join("–")}（§4 C15）`,
      });
    }
  });
  const rows = Array.isArray(sheet.rows) ? sheet.rows : null;
  const minRows = GRID_CONSTANTS.C6_minDataRows;
  if (
    !rows ||
    rows.length < minRows ||
    rows.length > GRID_CONSTANTS.C7_maxDataRows
  ) {
    errors.push({
      path: `${path}/rows`,
      code: "row-count",
      message: `数据行数必须在 ${minRows} 与 ${GRID_CONSTANTS.C7_maxDataRows} 之间（§4 C6/C7）`,
    });
  }
  (rows || []).forEach((row, rowIndex) => {
    const rowPath = `${path}/rows/${rowIndex}`;
    if (!Array.isArray(row)) {
      errors.push({ path: rowPath, code: "row-shape", message: "行必须是数组" });
      return;
    }
    if (
      row.length < GRID_CONSTANTS.C4_minColumns ||
      row.length > GRID_CONSTANTS.C5_maxColumns
    ) {
      errors.push({
        path: rowPath,
        code: "row-width",
        message: `行宽必须在 ${GRID_CONSTANTS.C4_minColumns} 与 ${GRID_CONSTANTS.C5_maxColumns} 之间`,
      });
    }
    row.forEach((cell, colIndex) =>
      validateCell(cell, `${rowPath}/${colIndex}`, errors),
    );
  });
  if (sheet.emphasisRows !== undefined) {
    const emphasis = Array.isArray(sheet.emphasisRows) ? sheet.emphasisRows : null;
    if (!emphasis || emphasis.length > GRID_CONSTANTS.C24_maxEmphasisRows) {
      errors.push({
        path: `${path}/emphasisRows`,
        code: "emphasis-count",
        message: `合计行数上限 ${GRID_CONSTANTS.C24_maxEmphasisRows}（§4 C24）`,
      });
    }
    (emphasis || []).forEach((raw, index) => {
      const entry = record(raw);
      const entryPath = `${path}/emphasisRows/${index}`;
      if (!entry) {
        errors.push({
          path: entryPath,
          code: "emphasis-shape",
          message: "合计行标记必须是对象",
        });
        return;
      }
      for (const key of extraKeys(entry, new Set(["index", "kind"]))) {
        errors.push({
          path: `${entryPath}/${key}`,
          code: "additional-properties",
          message: `合计行标记不允许字段 ${key}`,
        });
      }
      if (
        !integerInRange(entry.index, 0, GRID_CONSTANTS.C7_maxDataRows - 1)
      ) {
        errors.push({
          path: `${entryPath}/index`,
          code: "emphasis-index",
          message: `合计行下标必须在 0–${GRID_CONSTANTS.C7_maxDataRows - 1}`,
        });
      }
      if (entry.kind !== "subtotal" && entry.kind !== "total") {
        errors.push({
          path: `${entryPath}/kind`,
          code: "emphasis-kind",
          message: "kind 只能是 subtotal / total",
        });
      }
    });
  }
}

/**
 * §3.1 structural validation. Rejects unknown keys (`additionalProperties`).
 *
 * 校验编辑器可保存、可重开的表格工程：schema、版本、未知字段、工作表与单元格
 * 形状、公式合法性、命名区域、各项上限与署名信息都在这一处检查。
 */
export function validateGridIrProject(
  value: unknown,
): GridIrValidation {
  const errors: GridIrValidationError[] = [];
  const document = record(value);
  if (!document) {
    return {
      ok: false,
      errors: [{ path: "", code: "root-shape", message: "IR 根必须是对象" }],
    };
  }
  for (const key of extraKeys(document, TOP_LEVEL_KEYS)) {
    errors.push({
      path: `/${key}`,
      code: "additional-properties",
      message: `顶层不允许字段 ${key}`,
    });
  }
  if (document.schema !== GRID_IR_SCHEMA) {
    errors.push({
      path: "/schema",
      code: "schema-const",
      message: `schema 必须是 ${GRID_IR_SCHEMA}`,
    });
  }
  if (document.version !== GRID_IR_VERSION) {
    errors.push({
      path: "/version",
      code: "version-const",
      message: `version 必须是 ${GRID_IR_VERSION}`,
    });
  }
  const minTitleLength = 8;
  if (
    typeof document.title !== "string" ||
    document.title.length < minTitleLength ||
    document.title.length > 300
  ) {
    errors.push({
      path: "/title",
      code: "title-length",
      message: `title 长度必须在 ${minTitleLength} 与 300 之间（§8.2 与 catalog:3309 同档）`,
    });
  }
  const sheets = Array.isArray(document.sheets) ? document.sheets : null;
  if (
    !sheets ||
    sheets.length < GRID_CONSTANTS.C1_minSheets ||
    sheets.length > GRID_CONSTANTS.C2_maxSheets
  ) {
    errors.push({
      path: "/sheets",
      code: "sheet-count",
      message: `工作表数必须在 ${GRID_CONSTANTS.C1_minSheets} 与 ${GRID_CONSTANTS.C2_maxSheets} 之间（§4 C1/C2）`,
    });
  }
  (sheets || []).forEach((sheet, index) =>
    validateSheet(sheet, `/sheets/${index}`, errors),
  );
  if (document.namedRanges !== undefined) {
    const named = Array.isArray(document.namedRanges) ? document.namedRanges : null;
    if (!named || named.length > GRID_CONSTANTS.C13_maxNamedRanges) {
      errors.push({
        path: "/namedRanges",
        code: "named-range-count",
        message: `命名区域上限 ${GRID_CONSTANTS.C13_maxNamedRanges}（§4 C13）`,
      });
    }
    (named || []).forEach((raw, index) => {
      const entry = record(raw);
      const entryPath = `/namedRanges/${index}`;
      if (!entry) {
        errors.push({
          path: entryPath,
          code: "named-range-shape",
          message: "命名区域必须是对象",
        });
        return;
      }
      for (const key of extraKeys(entry, new Set(["name", "ref"]))) {
        errors.push({
          path: `${entryPath}/${key}`,
          code: "additional-properties",
          message: `命名区域不允许字段 ${key}`,
        });
      }
      if (typeof entry.name !== "string" || !NAMED_RANGE_NAME.test(entry.name)) {
        errors.push({
          path: `${entryPath}/name`,
          code: "named-range-name",
          message: "命名区域名必须匹配 ^[A-Za-z_][A-Za-z0-9_]{0,31}$",
        });
      }
      if (typeof entry.ref !== "string" || !NAMED_RANGE_REF.test(entry.ref)) {
        errors.push({
          path: `${entryPath}/ref`,
          code: "named-range-ref",
          message: "命名区域引用必须匹配 Sheet!A1 或 Sheet!A1:B9",
        });
      }
    });
  }
  const attribution = record(document.attribution);
  if (!attribution) {
    errors.push({
      path: "/attribution",
      code: "attribution-missing",
      message: "attribution 必须存在（§7 A8/A9 署名随产物）",
    });
  } else {
    for (const key of extraKeys(attribution, new Set(["entries"]))) {
      errors.push({
        path: `/attribution/${key}`,
        code: "additional-properties",
        message: `attribution 不允许字段 ${key}`,
      });
    }
    const entries = Array.isArray(attribution.entries) ? attribution.entries : null;
    const minEntries = 1;
    if (!entries || entries.length < minEntries || entries.length > 12) {
      errors.push({
        path: "/attribution/entries",
        code: "attribution-count",
        message: `attribution.entries 必须有 ${minEntries}–12 条（§8.2）`,
      });
    }
    (entries || []).forEach((raw, index) => {
      const entry = record(raw);
      const entryPath = `/attribution/entries/${index}`;
      if (!entry) {
        errors.push({
          path: entryPath,
          code: "attribution-shape",
          message: "署名条目必须是对象",
        });
        return;
      }
      for (const key of extraKeys(
        entry,
        new Set(["text", "licenseCode", "licenseUrl"]),
      )) {
        errors.push({
          path: `${entryPath}/${key}`,
          code: "additional-properties",
          message: `署名条目不允许字段 ${key}`,
        });
      }
      if (
        typeof entry.text !== "string" ||
        entry.text.length < 2 ||
        entry.text.length > 200
      ) {
        errors.push({
          path: `${entryPath}/text`,
          code: "attribution-text",
          message: "署名文字长度必须在 2 与 200 之间",
        });
      }
      if (
        typeof entry.licenseCode !== "string" ||
        entry.licenseCode.length < 2 ||
        entry.licenseCode.length > 60
      ) {
        errors.push({
          path: `${entryPath}/licenseCode`,
          code: "attribution-license-code",
          message: "licenseCode 长度必须在 2 与 60 之间",
        });
      }
      if (
        typeof entry.licenseUrl !== "string" ||
        !LICENSE_URL.test(entry.licenseUrl)
      ) {
        errors.push({
          path: `${entryPath}/licenseUrl`,
          code: "attribution-license-url",
          message: "licenseUrl 必须是 https:// 开头的 URI",
        });
      }
    });
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, project: value as GridIrProject };
}

function cellForSerialization(cell: GridIrCell): GridIrCell {
  if (cell === null || typeof cell !== "object") return cell;
  return cell.v === undefined ? { f: cell.f } : { f: cell.f, v: cell.v };
}

/**
 * Deterministic serialization. Key order is fixed to the §3 property order and
 * optional members are omitted rather than emitted as `undefined`, so the same
 * project always hashes to the same bytes — §6 F7 twin detection and the §8.1
 * byte floor both compare bytes, not objects.
 */
export function serializeGridIrProject(project: GridIrProject): string {
  const ordered = {
    schema: GRID_IR_SCHEMA,
    version: GRID_IR_VERSION,
    title: project.title,
    sheets: project.sheets.map((sheet) => ({
      name: sheet.name,
      headerRow: sheet.headerRow,
      ...(sheet.freezePanes
        ? {
            freezePanes: {
              ...(sheet.freezePanes.rows === undefined
                ? {}
                : { rows: sheet.freezePanes.rows }),
              ...(sheet.freezePanes.cols === undefined
                ? {}
                : { cols: sheet.freezePanes.cols }),
            },
          }
        : {}),
      columns: sheet.columns.map((column) => ({
        name: column.name,
        type: column.type,
        ...(column.unit === undefined ? {} : { unit: column.unit }),
        ...(column.widthPx === undefined ? {} : { widthPx: column.widthPx }),
        ...(column.precision === undefined
          ? {}
          : { precision: column.precision }),
      })),
      rows: sheet.rows.map((row) => row.map(cellForSerialization)),
      ...(sheet.emphasisRows && sheet.emphasisRows.length
        ? {
            emphasisRows: sheet.emphasisRows.map((entry) => ({
              index: entry.index,
              kind: entry.kind,
            })),
          }
        : {}),
    })),
    ...(project.namedRanges && project.namedRanges.length
      ? {
          namedRanges: project.namedRanges.map((entry) => ({
            name: entry.name,
            ref: entry.ref,
          })),
        }
      : {}),
    attribution: {
      entries: project.attribution.entries.map((entry) => ({
        text: entry.text,
        licenseCode: entry.licenseCode,
        licenseUrl: entry.licenseUrl,
      })),
    },
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function gridIrByteLength(project: GridIrProject): number {
  return new TextEncoder().encode(serializeGridIrProject(project)).length;
}

/**
 * Load the JSON IR byte form (§1.2). Failure is a coded error, never silent.
 */
export function parseGridIrSource(
  input: string | Uint8Array | ArrayBuffer,
): GridIrProject {
  const text =
    typeof input === "string"
      ? input
      : new TextDecoder().decode(
          input instanceof Uint8Array ? input : new Uint8Array(input),
        );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (caught) {
    throw new GridIrParseError(
      "grid-ir-not-json",
      `oceanleo.grid.v1 不是合法 JSON：${caught instanceof Error ? caught.message : caught}`,
    );
  }
  const validation = validateGridIrProject(parsed);
  if (!validation.ok) {
    throw new GridIrParseError(
      "grid-ir-invalid",
      `oceanleo.grid.v1 校验失败：${validation.errors[0].path} ${validation.errors[0].message}`,
      validation.errors,
    );
  }
  return validation.project;
}

/** §2.2 — text columns get 180 px, numeric 112 px, everything else 96 px. */
export function gridColumnWidthFor(type: GridIrColumnType): number {
  if (type === "text") return GRID_LAYOUT.textColumnWidthPx;
  if (type === "boolean" || type === "date") {
    return GRID_LAYOUT.defaultColumnWidthPx;
  }
  return GRID_LAYOUT.numberColumnWidthPx;
}

/**
 * IR-only state the interactive `GridSheet` model has no slot for. Carrying it
 * beside the sheets is what makes the JSON byte form round-trip: dropping
 * `attribution` on load would silently strip the licence obligation the
 * download is required to keep (§7 A8/A9).
 */
export interface GridCarrierMeta {
  title: string;
  namedRanges: GridIrNamedRange[];
  attribution: { entries: GridIrAttributionEntry[] };
  sheets: Record<
    string,
    {
      headerRow: boolean;
      columns: GridIrColumn[];
      freezePanes?: GridIrFreezePanes;
      emphasisRows: GridIrEmphasisRow[];
    }
  >;
}

export interface GridCarrierProject {
  sheets: GridSheet[];
  carrier: GridCarrierMeta;
}

function irCellToEditorText(cell: GridIrCell): string {
  if (cell === null) return "";
  if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
  if (typeof cell === "number") return String(cell);
  if (typeof cell === "string") return cell;
  return `=${cell.f.replace(/^=/, "")}`;
}

/** IR → interactive editor state, keeping the header row as row 0. */
export function gridIrToCarrierProject(project: GridIrProject): GridCarrierProject {
  const used = new Set<string>();
  const meta: GridCarrierMeta["sheets"] = {};
  const sheets = project.sheets.map((sheet) => {
    const name = uniqueSheetName(sheet.name, used);
    meta[name] = {
      headerRow: sheet.headerRow,
      columns: sheet.columns.map((column) => ({ ...column })),
      ...(sheet.freezePanes ? { freezePanes: { ...sheet.freezePanes } } : {}),
      emphasisRows: (sheet.emphasisRows || []).map((entry) => ({ ...entry })),
    };
    const header = sheet.headerRow
      ? [sheet.columns.map((column) => column.name)]
      : [];
    const formats: Record<string, GridCellFormat> = {};
    if (sheet.headerRow) {
      sheet.columns.forEach((_, col) => {
        formats[cellKey(0, col)] = { bold: true, align: "left" };
      });
    }
    const offset = header.length;
    sheet.rows.forEach((row, rowIndex) => {
      row.forEach((cell, col) => {
        const column = sheet.columns[col];
        const type =
          column?.type === "currency"
            ? "currency"
            : column?.type === "percent"
              ? "percent"
              : column?.type === "date"
                ? "date"
                : column?.type === "number" || column?.type === "integer"
                  ? "number"
                  : column?.type === "text"
                    ? "text"
                    : undefined;
        if (!type && typeof cell !== "object") return;
        const key = cellKey(rowIndex + offset, col);
        formats[key] = {
          ...(formats[key] || {}),
          ...(type ? { type } : {}),
          ...(column?.precision === undefined
            ? {}
            : { decimals: column.precision }),
          ...(typeof cell === "object" && cell !== null
            ? { color: GRID_PALETTE.formula }
            : {}),
        };
      });
    });
    for (const emphasis of sheet.emphasisRows || []) {
      sheet.columns.forEach((_, col) => {
        const key = cellKey(emphasis.index + offset, col);
        formats[key] = {
          ...(formats[key] || {}),
          bold: true,
          color: GRID_PALETTE.total,
        };
      });
    }
    return {
      id: gridId(),
      name,
      rows: [...header, ...sheet.rows.map((row) => row.map(irCellToEditorText))],
      formats,
      merges: [],
      conditionalFormats: [],
    } satisfies GridSheet;
  });
  return {
    sheets,
    carrier: {
      title: project.title,
      namedRanges: (project.namedRanges || []).map((entry) => ({ ...entry })),
      attribution: {
        entries: project.attribution.entries.map((entry) => ({ ...entry })),
      },
      sheets: meta,
    },
  };
}

function editorTextToIrCell(
  raw: string,
  type: GridIrColumnType | undefined,
): GridIrCell {
  if (raw.startsWith("=")) return { f: raw.slice(1) };
  if (raw === "") return null;
  if (type === "boolean") {
    const upper = raw.trim().toUpperCase();
    if (upper === "TRUE") return true;
    if (upper === "FALSE") return false;
  }
  if (type && type !== "text" && type !== "date") {
    const percent = raw.trim().endsWith("%");
    const body = (percent ? raw.trim().slice(0, -1) : raw.trim()).replace(
      /,/g,
      "",
    );
    const parsed = Number(body);
    if (body !== "" && Number.isFinite(parsed)) {
      return percent ? parsed / 100 : parsed;
    }
  }
  return raw;
}

/**
 * Interactive editor state → IR, then recompute the cached values so the
 * emitted workbook can never land in the §3.2 `ir-validated → emitted` illegal
 * transition. Column metadata comes from `carrier` when the project was loaded
 * from IR, and is inferred from the header row plus cell contents otherwise.
 */
export function gridCarrierProjectToIr(
  input: GridCarrierProject,
): GridIrProject {
  const { sheets, carrier } = input;
  return {
    schema: GRID_IR_SCHEMA,
    version: GRID_IR_VERSION,
    title: carrier.title,
    sheets: sheets.map((sheet) => {
      const meta = carrier.sheets[sheet.name];
      const headerRow = meta ? meta.headerRow : true;
      const offset = headerRow ? 1 : 0;
      const bounds = usedBounds(sheet);
      const columns: GridIrColumn[] =
        meta && meta.columns.length
          ? meta.columns.map((column) => ({ ...column }))
          : Array.from({ length: bounds.cols }, (_, col) => {
              const type = inferColumnType(sheet, col, offset);
              return {
                name:
                  (headerRow ? gridCellValue(sheet, 0, col) : "") ||
                  `Column${col + 1}`,
                type,
                widthPx: gridColumnWidthFor(type),
              } satisfies GridIrColumn;
            });
      const rows: GridIrCell[][] = [];
      for (let row = offset; row < bounds.rows; row += 1) {
        rows.push(
          Array.from({ length: columns.length }, (_, col) =>
            editorTextToIrCell(
              gridCellValue(sheet, row, col),
              columns[col]?.type,
            ),
          ),
        );
      }
      const emphasisRows = meta
        ? meta.emphasisRows.map((entry) => ({ ...entry }))
        : inferEmphasisRows(rows);
      return {
        name: sanitizeSheetName(sheet.name),
        headerRow,
        freezePanes:
          meta?.freezePanes ??
          (headerRow
            ? {
                rows: GRID_LAYOUT.frozenRows,
                cols: GRID_LAYOUT.frozenCols,
              }
            : undefined),
        columns,
        rows,
        ...(emphasisRows.length ? { emphasisRows } : {}),
      } satisfies GridIrSheet;
    }),
    ...(carrier.namedRanges.length ? { namedRanges: carrier.namedRanges } : {}),
    attribution: carrier.attribution,
  };
}

function inferColumnType(
  sheet: GridSheet,
  col: number,
  offset: number,
): GridIrColumnType {
  const declared = gridCellFormat(sheet, offset, col).type;
  if (declared === "currency") return "currency";
  if (declared === "percent") return "percent";
  if (declared === "date") return "date";
  if (declared === "number") return "number";
  if (declared === "text") return "text";
  const bounds = usedBounds(sheet);
  let numeric = 0;
  let filled = 0;
  for (let row = offset; row < bounds.rows; row += 1) {
    const raw = gridCellValue(sheet, row, col).trim();
    if (!raw) continue;
    filled += 1;
    if (raw.startsWith("=") || Number.isFinite(Number(raw.replace(/,/g, "")))) {
      numeric += 1;
    }
  }
  return filled > 0 && numeric === filled ? "number" : "text";
}

/**
 * §8.2 requires at least one `kind = "total"` row. When the project came from
 * the interactive editor there is no explicit marker, so the last row that is
 * entirely formulas or blanks is treated as the total line.
 */
function inferEmphasisRows(rows: readonly GridIrCell[][]): GridIrEmphasisRow[] {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const formulas = row.filter(
      (cell) => cell !== null && typeof cell === "object",
    ).length;
    if (formulas > 0) return [{ index, kind: "total" }];
  }
  return [];
}
