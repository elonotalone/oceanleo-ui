/**
 * W10 —— 日期不许在编辑器里变成 Excel 序列号（运营截图：E4 `46239`、F9 `46249`）。
 *
 * 用一份真 xlsx：日期格、带日期格式的公式格、带货币格式的数字、`[Red]` 格式（含字母 d，
 * 不能被当成日期）。走真实导入链 `loadGridFile` → `gridSheetsToUniverSnapshot`。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";

import { loadGridFile } from "../src/shell/doc-editors/grid-model.ts";
import {
  gridSheetsToUniverSnapshot,
  effectiveGridNumberFormat,
  dateToExcelSerial,
} from "../src/shell/doc-editors/grid-univer/snapshot.ts";
import { buildGridXlsxFromUniverSnapshot } from "../src/shell/doc-editors/grid-univer/xlsx-export.ts";

async function sampleXlsx() {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Dates");
  ws.getCell("A1").value = new Date(Date.UTC(2026, 7, 5));
  ws.getCell("A1").numFmt = "yyyy-mm-dd";
  ws.getCell("B1").value = { formula: "A1+10", result: 46249 };
  ws.getCell("B1").numFmt = "yyyy/mm/dd";
  ws.getCell("C1").value = 1234.5;
  ws.getCell("C1").numFmt = '"¥"#,##0.00';
  ws.getCell("D1").value = -3;
  ws.getCell("D1").numFmt = "0.00;[Red]-0.00";
  const bytes = await workbook.xlsx.writeBuffer();
  return new File([bytes], "dates.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

test("导入的日期格进 Univer 后是序列号 + 日期格式串（显示为日期）", async () => {
  const sheets = await loadGridFile(await sampleXlsx());
  const { data } = gridSheetsToUniverSnapshot(sheets);
  const cells = data.sheets[sheets[0].id].cellData[0];
  assert.equal(cells[0].v, 46239);
  assert.equal(cells[0].s.n.pattern, "yyyy-mm-dd");
  assert.equal(cells[1].f, "=A1+10");
  assert.equal(cells[1].s.n.pattern, "yyyy/mm/dd", "公式格的日期格式不能丢，否则显示 46249");
  assert.equal(cells[2].s.n.pattern, '"¥"#,##0.00');
  assert.equal(cells[3].s.n.pattern, "0.00;[Red]-0.00");
});

test("`[Red]` 里的 d 不会把数字格式误判成日期", async () => {
  const sheets = await loadGridFile(await sampleXlsx());
  const format = sheets[0].formats["0:3"];
  assert.notEqual(format?.type, "date");
});

test("只带 type: date 的存量格（旧工程档）也归一成日期格式串", () => {
  assert.equal(effectiveGridNumberFormat({ type: "date" }), "yyyy-mm-dd");
  assert.equal(effectiveGridNumberFormat({ type: "number" }), "");
  assert.equal(effectiveGridNumberFormat({ type: "percent", decimals: 1 }), "0.0%");
  const { data } = gridSheetsToUniverSnapshot([
    {
      id: "s",
      name: "S",
      rows: [["2026-08-05"]],
      formats: { "0:0": { type: "date" } },
      merges: [],
      conditionalFormats: [],
    },
  ]);
  const cell = data.sheets.s.cellData[0][0];
  assert.equal(cell.v, dateToExcelSerial(new Date(Date.UTC(2026, 7, 5))));
  assert.equal(cell.v, 46239);
  assert.equal(cell.s.n.pattern, "yyyy-mm-dd");
});

test("导入 → Univer → 导出：日期读回来仍是日期，格式串不变", async () => {
  const sheets = await loadGridFile(await sampleXlsx());
  const { data } = gridSheetsToUniverSnapshot(sheets);
  const { blob } = await buildGridXlsxFromUniverSnapshot(data);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  const ws = back.getWorksheet("Dates");
  assert.ok(ws.getCell("A1").value instanceof Date);
  assert.equal(ws.getCell("A1").value.toISOString().slice(0, 10), "2026-08-05");
  assert.equal(ws.getCell("A1").numFmt, "yyyy-mm-dd");
  assert.equal(ws.getCell("B1").numFmt, "yyyy/mm/dd");
});
