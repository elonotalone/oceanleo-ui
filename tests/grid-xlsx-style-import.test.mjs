/**
 * W10（2026-10-23）—— 上传的 xlsx 打开时不许丢掉用户的格式。
 *
 * 回退前的样子：SheetJS 社区版把实心填充放在 `cell.s.fgColor`，导入链读的却是
 * `cell.s.fill.fgColor`，于是黄底、灰底全丢；粗体和字色社区版根本不给，深蓝白字的
 * 表头打开后成了白底黑字。现在 exceljs 再读一遍补字体与填充（`xlsx-style-overlay.ts`）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";

import { loadGridFile } from "../src/shell/doc-editors/grid-model.ts";
import { gridSheetsToUniverSnapshot } from "../src/shell/doc-editors/grid-univer/snapshot.ts";
import { gridFormatFromExcelStyle } from "../src/shell/doc-editors/grid-format/xlsx-style-overlay.ts";

async function coloredXlsx() {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Budget");
  ws.addRow(["Item", "Owner"]);
  ws.addRow(["Rent", "Ann"]);
  ws.addRow(["Travel", "Bo"]);
  ws.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  ws.getCell("A3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  ws.getCell("B2").font = { color: { argb: "FFC00000" } };
  const bytes = await workbook.xlsx.writeBuffer();
  return new File([bytes], "colored.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

test("导入 xlsx：表头的深蓝填充、白字、粗体都在", async () => {
  const [sheet] = await loadGridFile(await coloredXlsx());
  assert.deepEqual(
    { ...sheet.formats["0:0"] },
    { ...sheet.formats["0:0"], bold: true, color: "#ffffff", background: "#1f4e79" },
  );
  assert.equal(sheet.formats["0:0"].bold, true);
  assert.equal(sheet.formats["0:0"].color, "#ffffff");
  assert.equal(sheet.formats["0:0"].background.toLowerCase(), "#1f4e79");
});

test("导入 xlsx：黄色高亮与红字各自保留，并进 Univer 快照的样式", async () => {
  const sheets = await loadGridFile(await coloredXlsx());
  const [sheet] = sheets;
  assert.equal(sheet.formats["2:0"].background.toLowerCase(), "#ffff00");
  assert.equal(sheet.formats["1:1"].color, "#c00000");
  const { data } = gridSheetsToUniverSnapshot(sheets);
  const cell = data.sheets[sheet.id].cellData[2][0];
  const style = typeof cell.s === "string" ? data.styles[cell.s] : cell.s;
  assert.equal(String(style.bg.rgb).toLowerCase(), "#ffff00");
});

test("exceljs 样式 → 格式增量：Excel 的「自动」黑字不写，主题色不猜", () => {
  assert.equal(gridFormatFromExcelStyle({ font: { color: { argb: "FF000000" } } }), null);
  assert.equal(gridFormatFromExcelStyle({ font: { color: { theme: 1 } } }), null);
  assert.deepEqual(
    gridFormatFromExcelStyle({ fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } } }),
    { background: "#d9d9d9" },
  );
});
