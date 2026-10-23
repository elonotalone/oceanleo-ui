/**
 * 从活的 Univer 读当前选区左上格的样式，给统一文字栏出「当前值」。
 *
 * 读的是 `getCellStyleData()`（行 / 列 / 表默认样式合成后的样式），与画布上看到的一致；
 * 拿不到工作簿或选区时回默认样式，栏照样能用。本文件不 import Univer 运行时。
 */
import {
  GRID_DEFAULT_TEXT_STYLE,
  gridCellTextStyleFromStyleData,
  type GridCellTextStyle,
  type GridStyleDataLike,
} from "./text-bar";
import type { GridUniverSelection } from "./facade-commands";

export interface GridSelectionStyleRange {
  getRow(): number;
  getColumn(): number;
  getWidth(): number;
  getHeight(): number;
  getCellStyleData?: () => (GridStyleDataLike & { n?: { pattern?: string } | null }) | null;
  isMerged?: () => boolean;
  isPartOfMerge?: () => boolean;
}

export interface GridSelectionStyleApi {
  getActiveWorkbook?: () => {
    getActiveSheet?: () => {
      getSheetId?: () => string;
      getSelection?: () => { getActiveRange?: () => GridSelectionStyleRange | null } | null;
    } | null;
  } | null;
}

export interface GridSelectionStyleRead {
  style: GridCellTextStyle;
  numberType: string;
  selection: GridUniverSelection;
  sheetId: string;
}

/** 数字格式串 → `type` 下拉的取值（与 `gridTypePattern` 互逆；认不出的算「自动」）。 */
export function gridNumberTypeFromPattern(pattern: unknown): string {
  if (typeof pattern !== "string" || !pattern.trim()) return "auto";
  const raw = pattern.trim();
  if (raw === "@") return "text";
  if (/[¥$€£]/.test(raw)) return "currency";
  if (/%/.test(raw)) return "percent";
  if (/[ymd]/i.test(raw.replace(/"[^"]*"|\[[^\]]*\]/g, ""))) return "date";
  if (/^[#0,.]+$/.test(raw)) return "number";
  return "auto";
}

export function readGridSelectionStyle(
  api: GridSelectionStyleApi | null | undefined,
): GridSelectionStyleRead | null {
  try {
    const sheet = api?.getActiveWorkbook?.()?.getActiveSheet?.();
    const range = sheet?.getSelection?.()?.getActiveRange?.();
    if (!sheet || !range) return null;
    const row = range.getRow();
    const column = range.getColumn();
    const height = Math.max(1, range.getHeight());
    const width = Math.max(1, range.getWidth());
    const data = range.getCellStyleData?.() ?? null;
    const merged = Boolean(range.isMerged?.() || range.isPartOfMerge?.());
    return {
      style: gridCellTextStyleFromStyleData(data, {
        merged,
        multiCell: height > 1 || width > 1,
      }),
      numberType: gridNumberTypeFromPattern(data?.n?.pattern),
      selection: {
        startRow: row,
        endRow: row + height - 1,
        startColumn: column,
        endColumn: column + width - 1,
      },
      sheetId: sheet.getSheetId?.() || "sheet",
    };
  } catch {
    // 工作簿正在被替换（载入 / 协同整本换）时 facade 会抛；下一次事件再读。
    return null;
  }
}

/** 选区读数的比较键：一样就不重渲染编辑栏。 */
export function gridSelectionReadKey(read: GridSelectionStyleRead | null): string {
  if (!read) return "";
  const s = read.selection;
  return [
    read.sheetId,
    s.startRow,
    s.endRow,
    s.startColumn,
    s.endColumn,
    read.numberType,
    JSON.stringify({ ...GRID_DEFAULT_TEXT_STYLE, ...read.style }),
  ].join("|");
}
