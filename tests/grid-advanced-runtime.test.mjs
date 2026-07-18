import assert from "node:assert/strict";
import test from "node:test";

import { evaluateGridCell } from "../src/shell/doc-editors/grid-formula.ts";
import {
  conditionalGridStyle,
  mergeGridRange,
  normalizeGridConditionalFormats,
  normalizeGridMerges,
  splitGridRange,
  transformGridRanges,
} from "../src/shell/doc-editors/grid-structure.ts";

test("grid formulas calculate references, ranges, nesting and deterministic errors", () => {
  const rows = [
    ["10", "20", "=SUM(A1:B1)"],
    ["=C1/2", "=AVERAGE(A1:C1)", "=MAX(A1:B2)"],
    ["=B3", "=A3", "=1/0"],
  ];
  assert.equal(evaluateGridCell(rows, 0, 2), 30);
  assert.equal(evaluateGridCell(rows, 1, 0), 15);
  assert.equal(evaluateGridCell(rows, 1, 1), 20);
  assert.equal(evaluateGridCell(rows, 1, 2), 20);
  assert.equal(evaluateGridCell(rows, 2, 0), "#CYCLE!");
  assert.equal(evaluateGridCell(rows, 2, 2), "#DIV/0!");
});

test("grid project normalization persists formulas, merges and conditional rules", () => {
  const persisted = JSON.parse(
    JSON.stringify({
      name: "预算",
      rows: [["收入", "成本"], ["120", "70"], ["=A2-B2", ""]],
      formats: { "2:0": { type: "currency", decimals: 0 } },
      merges: [{ firstRow: 0, lastRow: 0, firstCol: 0, lastCol: 1 }],
      conditionalFormats: [
        {
          id: "profit",
          range: { firstRow: 2, lastRow: 2, firstCol: 0, lastCol: 0 },
          operator: "greater-than",
          value: "0",
          color: "#166534",
          background: "#dcfce7",
          bold: true,
        },
      ],
    }),
  );
  const sheet = {
    ...persisted,
    merges: normalizeGridMerges(persisted.merges, 10_000, 256),
    conditionalFormats: normalizeGridConditionalFormats(
      persisted.conditionalFormats,
      10_000,
      256,
    ),
  };
  assert.equal(sheet.rows[2][0], "=A2-B2");
  assert.equal(evaluateGridCell(sheet.rows, 2, 0), 50);
  assert.deepEqual(sheet.merges[0], {
    firstRow: 0,
    lastRow: 0,
    firstCol: 0,
    lastCol: 1,
  });
  assert.deepEqual(
    conditionalGridStyle(sheet.conditionalFormats, 2, 0, 50),
    {
    bold: true,
    color: "#166534",
    background: "#dcfce7",
    },
  );
});

test("grid merge and split reject overlaps and transform with row edits", () => {
  const first = { firstRow: 1, lastRow: 2, firstCol: 1, lastCol: 3 };
  const merged = mergeGridRange([], first);
  assert.deepEqual(merged, [first]);
  assert.throws(
    () =>
      mergeGridRange(merged, {
        firstRow: 2,
        lastRow: 4,
        firstCol: 2,
        lastCol: 4,
      }),
    /已有合并区域/,
  );
  assert.deepEqual(
    transformGridRanges(merged, "row", 0, 1),
    [{ firstRow: 2, lastRow: 3, firstCol: 1, lastCol: 3 }],
  );
  assert.deepEqual(splitGridRange(merged, first), []);
  assert.equal(
    normalizeGridMerges([first, first], 20, 20).length,
    1,
  );
});

test("conditional formatting evaluates formula results, strings and bounds", () => {
  const rows = [["12", "待处理"], ["=A1*2", "完成"]];
  const rules = normalizeGridConditionalFormats(
    [
      {
        id: "high",
        range: { firstRow: 0, lastRow: 1, firstCol: 0, lastCol: 0 },
        operator: "greater-than",
        value: "20",
        background: "#fee2e2",
      },
      {
        id: "done",
        range: { firstRow: 0, lastRow: 1, firstCol: 1, lastCol: 1 },
        operator: "contains",
        value: "完成",
        color: "#166534",
      },
    ],
    20,
    20,
  );
  assert.deepEqual(conditionalGridStyle(rules, 1, 0, evaluateGridCell(rows, 1, 0)), {
    background: "#fee2e2",
  });
  assert.deepEqual(conditionalGridStyle(rules, 1, 1, evaluateGridCell(rows, 1, 1)), {
    color: "#166534",
  });
  assert.deepEqual(conditionalGridStyle(rules, 0, 0, evaluateGridCell(rows, 0, 0)), {});
});
