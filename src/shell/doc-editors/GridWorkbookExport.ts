import {
  gridCellValue,
  gridDisplayFormat,
  sanitizeSheetName,
  type GridCellFormat,
  type GridSheet,
} from "./grid-model";
import { evaluateGridCell } from "./grid-formula";

function usedBounds(sheet: GridSheet): { rows: number; cols: number } {
  let rows = sheet.rows.length;
  let cols = sheet.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  while (rows > 1 && (sheet.rows[rows - 1] || []).every((value) => value === "")) {
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

function exportValue(value: string, format: GridCellFormat): unknown {
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

/**
 * Route-owned XLSX projection. The default/module interop is deliberate:
 * ExcelJS is CommonJS in Node smoke tests but exposed as a namespace by bundlers.
 */
export async function buildGridRouteWorkbookBlob(
  sheets: GridSheet[],
  options: { headerRow?: boolean } = {},
): Promise<Blob> {
  const { headerRow = true } = options;
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
          target.value = exportValue(raw, format) as string | number | Date;
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
    // Merge after assigning values. In ExcelJS, writing a merged slave cell
    // redirects to the master and would otherwise overwrite its content.
    for (const merge of source.merges) {
      worksheet.mergeCells(
        merge.firstRow + 1,
        merge.firstCol + 1,
        merge.lastRow + 1,
        merge.lastCol + 1,
      );
    }
    if (headerRow && bounds.cols > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, bounds.rows), column: bounds.cols },
      };
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
    }
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
