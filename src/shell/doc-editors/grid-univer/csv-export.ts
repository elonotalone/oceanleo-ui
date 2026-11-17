import type { IWorkbookData } from "@univerjs/presets";
import { univerSnapshotToGridSheets } from "./snapshot";
/** RFC 4180: quote delimiter, quotes and either newline; double embedded quotes. */
export function csvField(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function csvRows(rows: readonly (readonly unknown[])[]): string {
  return rows.map(row => row.map(csvField).join(",")).join("\r\n");
}
export function activeSheetCsv(snapshot: Partial<IWorkbookData>, activeSheetId: string): string {
  const sheet = univerSnapshotToGridSheets(snapshot).find(sheet => sheet.id === activeSheetId);
  if (!sheet) throw new Error("没有可导出的工作表。");
  return `\uFEFF${csvRows(sheet.rows)}`;
}
