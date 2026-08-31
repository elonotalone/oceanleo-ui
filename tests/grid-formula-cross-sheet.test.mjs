import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateGridCellInWorkbook,
  evaluateGridCellInWorkbookTyped,
} from "../src/shell/doc-editors/grid-formula.ts";
import {
  gridDisplayValue,
  gridSheetToCsv,
  gridWorkbookContext,
} from "../src/shell/doc-editors/grid-model.ts";

/**
 * §规范一. The parsing layer always understood `Sheet2!B3`; the evaluation
 * entry had nowhere to put the sibling sheets, so the canvas showed `#REF!`
 * while the very same formula exported correctly. 21.0% of the 42,928 formulas
 * in the 456-workbook corpus carry a qualified reference, which is why this is
 * filed as a bug rather than a feature.
 */

function sheet(id, name, rows) {
  return { id, name, rows, formats: {}, merges: [], conditionalFormats: [] };
}

/** 明细 carries its numbers in column B, so `明细!B2` is 25. */
function twoSheetBook() {
  return [
    sheet("sheet-main", "总表", [
      ["=明细!B2", "=SUM(明细!B1:B3)", "=明细!B2*2"],
      ["=总表!A1", "=MINGXI_TOTAL", ""],
    ]),
    sheet("sheet-detail", "明细", [
      ["物料", "10"],
      ["单价", "25"],
      ["数量", "7"],
    ]),
  ];
}

test("跨表标量引用在画布上算得出（不是只在导出链上）", () => {
  const sheets = twoSheetBook();
  assert.equal(gridDisplayValue(sheets[0], 0, 0, sheets), "25");
});

test("跨表区域引用参与聚合", () => {
  const sheets = twoSheetBook();
  assert.equal(gridDisplayValue(sheets[0], 0, 1, sheets), "42");
});

test("跨表引用可以继续参与算术", () => {
  const sheets = twoSheetBook();
  assert.equal(gridDisplayValue(sheets[0], 0, 2, sheets), "50");
});

/**
 * The negative control the spec asks for by name: swap the workbook context
 * back for a single-sheet one and the cross-sheet formula must go red on the
 * spot. If this ever passes, the entry has quietly stopped carrying the
 * workbook and P1 has regressed.
 */
test("反面：换回单表 context，跨表引用当场变 #REF!", () => {
  const sheets = twoSheetBook();
  const single = gridWorkbookContext([sheets[0]]);
  assert.equal(evaluateGridCellInWorkbook(single, "总表", 0, 0), "#REF!");
  assert.notEqual(gridDisplayValue(sheets[0], 0, 0, sheets), "#REF!");
});

test("反面：三参数旧调用仍是单表语义，跨表引用仍 #REF!", () => {
  const sheets = twoSheetBook();
  assert.equal(gridDisplayValue(sheets[0], 0, 0), "#REF!");
});

test("表名大小写不敏感，与 OOXML 一致", () => {
  const sheets = [
    sheet("s1", "Main", [["=data!A1", "=DATA!A1", "=DaTa!A1"]]),
    sheet("s2", "Data", [["88"]]),
  ];
  for (let col = 0; col < 3; col += 1) {
    assert.equal(gridDisplayValue(sheets[0], 0, col, sheets), "88");
  }
});

test("自引用限定名（本表!A1）解析到本表而不是 #REF!", () => {
  const sheets = twoSheetBook();
  assert.equal(gridDisplayValue(sheets[0], 1, 0, sheets), "25");
});

test("未知表名给 #REF!，不是 undefined", () => {
  const context = gridWorkbookContext(twoSheetBook());
  const result = evaluateGridCellInWorkbookTyped(context, "查无此表", 0, 0);
  assert.equal(result.ok, false);
  assert.equal(result.value, "#REF!");
  assert.notEqual(result.value, undefined);
});

test("工作簿上下文按 id 也能查到表", () => {
  const sheets = twoSheetBook();
  const context = gridWorkbookContext(sheets);
  assert.equal(context.sheetRows("sheet-detail")?.[1]?.[1], "25");
});

test("表名与 id 撞车时表名优先", () => {
  const sheets = [
    sheet("alpha", "beta", [["from-alpha-sheet"]]),
    sheet("gamma", "alpha", [["from-name-alpha"]]),
  ];
  const context = gridWorkbookContext(sheets);
  assert.deepEqual(context.sheetRows("alpha"), [["from-name-alpha"]]);
});

test("命名区域通过工作簿上下文解析", () => {
  const sheets = twoSheetBook();
  const context = gridWorkbookContext(sheets, {
    namedRanges: { MINGXI_TOTAL: "明细!B2" },
  });
  // The workbook entry returns the typed value; only the display layer strings it.
  assert.equal(evaluateGridCellInWorkbook(context, "总表", 1, 1), 25);
});

test("命名区域缺席时给 #NAME?，不是空值", () => {
  const sheets = twoSheetBook();
  const context = gridWorkbookContext(sheets);
  assert.equal(evaluateGridCellInWorkbook(context, "总表", 1, 1), "#NAME?");
});

test("CSV 导出带上工作簿后跨表单元格不再是 #REF!", () => {
  const sheets = twoSheetBook();
  const csv = gridSheetToCsv(sheets[0], sheets);
  assert.equal(csv.split("\r\n")[0], "25,42,50");
  assert.ok(!csv.includes("#REF!"));
});

test("CSV 不带工作簿时保持既有单表行为", () => {
  const sheets = twoSheetBook();
  assert.ok(gridSheetToCsv(sheets[0]).includes("#REF!"));
});
