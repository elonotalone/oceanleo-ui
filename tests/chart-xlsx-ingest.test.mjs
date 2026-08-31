import assert from "node:assert/strict";
import test from "node:test";

import {
  chartDocumentFromXlsx,
  chartTableFromXlsx,
  chartXlsxCellValue,
  parseChartXlsxA1Range,
} from "../src/shell/chart-editor/chart-schema.ts";

async function loadExcelJS() {
  const imported = await import("exceljs");
  return "Workbook" in imported ? imported : imported.default;
}

async function buildFixtureWorkbook() {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("销售");
  sheet.getCell("A1").value = "月份";
  sheet.getCell("B1").value = "销量";
  sheet.getCell("A2").value = new Date("2024-03-01T08:00:00.000Z");
  sheet.getCell("B2").value = 120;
  sheet.getCell("A3").value = new Date("2024-04-15T12:00:00.000Z");
  sheet.getCell("B3").value = 180;
  sheet.getCell("A4").value = "小计";
  sheet.getCell("B4").value = { formula: "SUM(B2:B3)", result: 300 };
  sheet.mergeCells("A5:B5");
  sheet.getCell("A5").value = "备注行";
  sheet.getCell("A6").value = "2024-05-01";
  sheet.getCell("B6").value = 95;
  sheet.getCell("A2").numFmt = "yyyy/mm";
  sheet.getCell("A3").numFmt = "yyyy/mm";
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

test("parseChartXlsxA1Range accepts A1 notation", () => {
  assert.deepEqual(parseChartXlsxA1Range("B2:D4"), {
    top: 2,
    left: 2,
    bottom: 4,
    right: 4,
  });
  assert.throws(() => parseChartXlsxA1Range("bad"), /A1/);
});

test("chartXlsxCellValue reads Date type not display text", () => {
  const cell = {
    type: 4,
    value: new Date("2024-03-01T00:00:00.000Z"),
    text: "2024/03",
  };
  assert.equal(chartXlsxCellValue(cell), "2024-03-01");
  assert.equal(chartXlsxCellValue(cell, { preferDisplayText: true }), "2024/03");
  assert.notEqual(
    chartXlsxCellValue(cell),
    chartXlsxCellValue(cell, { preferDisplayText: true }),
  );
});

test("chartTableFromXlsx: date by type, header guess, merged cells", async () => {
  const bytes = await buildFixtureWorkbook();
  const listed = await import("../src/shell/chart-editor/chart-schema.ts").then(
    (mod) => mod.chartXlsxListSheets(bytes),
  );
  assert.deepEqual(listed, ["销售"]);

  const ingest = await chartTableFromXlsx(bytes, {
    sheet: "销售",
    range: "A1:B6",
  });
  assert.equal(ingest.sheet, "销售");
  assert.equal(ingest.headerRow, true);
  assert.match(ingest.notices.join(" "), /表头|合并/);
  assert.equal(ingest.table[1][0], "2024-03-01");
  assert.equal(ingest.table[2][0], "2024-04-15");
  assert.equal(ingest.table[1][1], 120);
  assert.equal(ingest.table[3][1], 300);
  assert.equal(ingest.table.length, 6);
});

test("headerRow override flips xlsx ingest", async () => {
  const bytes = await buildFixtureWorkbook();
  const guessed = await chartTableFromXlsx(bytes, { range: "A1:B3" });
  const forced = await chartTableFromXlsx(bytes, {
    range: "A1:B3",
    headerRow: false,
  });
  assert.equal(guessed.headerRow, true);
  assert.equal(forced.headerRow, false);
  assert.notDeepEqual(guessed.table[0], forced.table[0]);
});

test("negative: preferDisplayText would break date column lock", async () => {
  const bytes = await buildFixtureWorkbook();
  const ingest = await chartTableFromXlsx(bytes, { range: "A1:B3" });
  assert.match(String(ingest.table[1][0]), /^\d{4}-\d{2}-\d{2}$/);
  assert.doesNotMatch(String(ingest.table[1][0]), /^\d{4}\/\d{2}$/);
});

test("chartDocumentFromXlsx produces editable chart document", async () => {
  const bytes = await buildFixtureWorkbook();
  const { document, ingest } = await chartDocumentFromXlsx(bytes, {
    range: "A1:B3",
    title: "季度销量",
  });
  assert.equal(document.option.title.text, "季度销量");
  assert.equal(document.option.series.length, 1);
  assert.deepEqual(document.option.xAxis.data, ["2024-03-01", "2024-04-15"]);
  assert.ok(ingest.notices.length >= 0);
});
