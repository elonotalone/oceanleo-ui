"use client";

import { fetchMediaBlob } from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import { urlExtension } from "./doc-io";
import { evaluateGridCell, type GridFormulaValue } from "./grid-formula";

export interface GridSheet {
  id: string;
  name: string;
  rows: string[][];
  formats: Record<string, GridCellFormat>;
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
  return { id: gridId(), name, rows: emptyGridRows(), formats: {} };
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

export function normalizeGridProjectSheets(value: unknown): GridSheet[] {
  const rawSheets = Array.isArray(value) ? value : [];
  const used = new Set<string>();
  return rawSheets.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    if (!Array.isArray(record.rows)) return [];
    const rows = record.rows.filter(Array.isArray) as unknown[][];
    return [
      {
        id: gridId(),
        name: uniqueSheetName(String(record.name || `Sheet${index + 1}`), used),
        rows: normalizeRows(rows),
        formats: normalizeFormats(record.formats),
      },
    ];
  });
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
    if (worksheet?.["!ref"]) {
      const range = XLSX.utils.decode_range(worksheet["!ref"]);
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
    };
  });
}

export async function loadGridSheets(
  item: LibraryItem,
  signal?: AbortSignal,
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
        await (
          await fetchMediaBlob(url, { maxBytes: 48 * 1024 * 1024, signal })
        ).arrayBuffer(),
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
      : await readWorkbook(await file.arrayBuffer(), "array");
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
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OceanLeo";
  workbook.created = new Date();
  for (const source of sheets) {
    const bounds = usedBounds(source);
    const worksheet = workbook.addWorksheet(sanitizeSheetName(source.name));
    for (let row = 0; row < bounds.rows; row += 1) {
      for (let col = 0; col < bounds.cols; col += 1) {
        const raw = gridCellValue(source, row, col);
        const format = gridCellFormat(source, row, col);
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
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
