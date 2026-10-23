/**
 * 上传的 xlsx 打开时，把**字体与填充**补回来。
 *
 * 读表用的是 SheetJS 社区版：它的 `cellStyles` 只给填充（而且放在 `cell.s.fgColor`
 * 上，不在 `cell.s.fill` 里），粗体、字色一概不给。结果是用户 Excel 里的深蓝白字表头、
 * 黄色高亮在编辑器里全变成了白底黑字——打开就丢了用户的格式。
 *
 * 这里用仓里已经在用的 exceljs（导出也是它）再读一遍同一份字节，只取样式：
 * 粗体、字色、实心填充。值与公式仍以 SheetJS 那一遍为准，这一层只往 `formats` 里补。
 * 主题色（`theme` 索引，没有 argb）不猜，保持原样。
 */
import type { GridCellFormat } from "../grid-model";

export interface GridStyleOverlayTarget {
  /** 原文件里的工作表名（SheetJS 的 `SheetNames[i]`，不是去重后的显示名）。 */
  sourceName: string;
  originRow: number;
  originCol: number;
  formats: Record<string, GridCellFormat>;
}

type ArgbColor = { argb?: string } | undefined;

function hex(color: ArgbColor): string | null {
  const argb = color?.argb;
  if (typeof argb !== "string") return null;
  const rgb = argb.slice(-6);
  return /^[0-9a-f]{6}$/i.test(rgb) ? `#${rgb.toLowerCase()}` : null;
}

/** 一个 exceljs 单元格的样式 → GridCellFormat 的增量（没有可补的返回 null）。 */
export function gridFormatFromExcelStyle(cell: {
  font?: { bold?: boolean; color?: ArgbColor };
  fill?: { type?: string; pattern?: string; fgColor?: ArgbColor };
}): Partial<GridCellFormat> | null {
  const out: Partial<GridCellFormat> = {};
  if (cell.font?.bold) out.bold = true;
  const color = hex(cell.font?.color);
  // 纯黑就是 Excel 的「自动」：不写，深色主题下才能按默认字色显示成浅色。
  if (color && color !== "#000000") out.color = color;
  if (cell.fill?.type === "pattern" && cell.fill.pattern === "solid") {
    const background = hex(cell.fill.fgColor);
    if (background) out.background = background;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function overlayXlsxStyles(
  source: ArrayBuffer,
  targets: readonly GridStyleOverlayTarget[],
): Promise<void> {
  if (targets.length === 0) return;
  let workbook: {
    getWorksheet(name: string):
      | {
          eachRow(
            cb: (
              row: { eachCell(cb: (cell: Parameters<typeof gridFormatFromExcelStyle>[0], col: number) => void): void },
              rowNumber: number,
            ) => void,
          ): void;
        }
      | undefined;
  };
  try {
    const imported = (await import("exceljs")) as typeof import("exceljs") & {
      default?: typeof import("exceljs");
    };
    const ExcelJS = imported.Workbook ? imported : (imported.default ?? imported);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(source);
    workbook = book as unknown as typeof workbook;
  } catch {
    // 不是 OOXML（csv / xls / ods）或 exceljs 读不动：保留 SheetJS 那一遍的结果。
    return;
  }
  for (const target of targets) {
    const sheet = workbook.getWorksheet(target.sourceName);
    if (!sheet) continue;
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        const patch = gridFormatFromExcelStyle(cell);
        if (!patch) return;
        const r = rowNumber - 1 - target.originRow;
        const c = colNumber - 1 - target.originCol;
        if (r < 0 || c < 0) return;
        const key = `${r}:${c}`;
        target.formats[key] = { ...target.formats[key], ...patch };
      });
    });
  }
}
