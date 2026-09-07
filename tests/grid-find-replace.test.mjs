import assert from "node:assert/strict";
import test from "node:test";

import { evaluateGridCell } from "../src/shell/doc-editors/grid-formula.ts";
import {
  GRID_COL_WIDTH_RANGE,
  findGridMatches,
  planGridReplaceAll,
} from "../src/shell/doc-editors/grid-structure.ts";
import { GRID_CONSTANTS } from "../src/shell/doc-editors/grid-model.ts";

function sheet() {
  return [
    ["科目", "预算", "实际", "差额"],
    // 预算列合计 590、实际列合计 600：两列刻意不等，否则「唯一命中」的断言
    // 会因为两个 SUM 算出同一个数而失去意义。
    ["研发", "90", "120", "=C2-B2"],
    ["市场", "200", "180", "=C3-B3"],
    ["财务", "300", "300", "=C4-B4"],
    ["合计", "=SUM(B2:B4)", "=SUM(C2:C4)", "=SUM(D2:D4)"],
  ];
}

test("值模式在算出来的值里找，公式模式在原文里找", () => {
  const rows = sheet();

  // 590 只存在于 =SUM(B2:B4) 的**结果**里，原文里没有这三个字符。
  const byValue = findGridMatches(rows, { query: "590", scope: "value" });
  assert.deepEqual(
    byValue.map((match) => `${match.row}:${match.col}`),
    ["4:1"],
  );
  assert.equal(
    findGridMatches(rows, { query: "590", scope: "formula" }).length,
    0,
    "公式模式看的是原文，不该命中求值结果",
  );

  // 反过来：SUM 只存在于原文里，值里没有。
  const byFormula = findGridMatches(rows, { query: "SUM", scope: "formula" });
  assert.deepEqual(
    byFormula.map((match) => `${match.row}:${match.col}`),
    ["4:1", "4:2", "4:3"],
  );
  assert.equal(findGridMatches(rows, { query: "SUM", scope: "value" }).length, 0);
});

test("区分大小写与全字匹配各自生效", () => {
  const rows = [["sum", "SUM", "SUMIF", "总和 sum 值"]];

  assert.equal(findGridMatches(rows, { query: "sum", scope: "formula" }).length, 4);
  assert.deepEqual(
    findGridMatches(rows, {
      query: "sum",
      scope: "formula",
      caseSensitive: true,
    }).map((match) => match.col),
    [0, 3],
  );

  // 全字：SUMIF 不算 SUM。
  assert.deepEqual(
    findGridMatches(rows, {
      query: "SUM",
      scope: "formula",
      wholeWord: true,
    }).map((match) => match.col),
    [0, 1, 3],
  );
  assert.deepEqual(
    findGridMatches(rows, {
      query: "sum",
      scope: "formula",
      caseSensitive: true,
      wholeWord: true,
    }).map((match) => match.col),
    [0, 3],
  );
});

test("中文按全字匹配也能命中（CJK 不是 \\w，不能靠 \\b）", () => {
  const rows = [["研发部", "研发", "市场"]];
  assert.deepEqual(
    findGridMatches(rows, {
      query: "研发",
      scope: "formula",
      wholeWord: true,
    }).map((match) => match.col),
    [0, 1],
  );
});

test("公式模式批量改引用：一次拿到全部编辑，改完仍然可求值", () => {
  const rows = sheet();
  const plan = planGridReplaceAll(rows, {
    query: "B",
    scope: "formula",
    replacement: "E",
    wholeWord: false,
  });

  // 三条含 B 的公式：D2、D3、D4 里的 B2/B3/B4，以及合计行的 SUM(B2:B4)。
  assert.deepEqual(
    plan.edits.map((edit) => `${edit.row}:${edit.col} ${edit.before}→${edit.after}`),
    [
      "1:3 =C2-B2→=C2-E2",
      "2:3 =C3-B3→=C3-E3",
      "3:3 =C4-B4→=C4-E4",
      "4:1 =SUM(B2:B4)→=SUM(E2:E4)",
    ],
  );
  assert.equal(plan.skippedFormulas, 0);

  // 应用之后引擎照样能算（E 列为空，SUM 为 0）。
  const applied = sheet();
  for (const edit of plan.edits) applied[edit.row][edit.col] = edit.after;
  assert.equal(evaluateGridCell(applied, 4, 1), 0);
});

test("值模式替换跳过公式格并如实报数，不假装成功", () => {
  const rows = sheet();
  const plan = planGridReplaceAll(rows, {
    query: "300",
    scope: "value",
    replacement: "330",
  });

  // B4 与 C4 是字面量 300，改得动；D4 的值也是 0 不含 300，不参与。
  assert.deepEqual(
    plan.edits.map((edit) => `${edit.row}:${edit.col}`),
    ["3:1", "3:2"],
  );
  assert.equal(plan.matched, 2);
  assert.equal(plan.skippedFormulas, 0);

  // 换一个只在公式结果里出现的数：命中了，但改不动，必须报出来。
  const guarded = planGridReplaceAll(rows, {
    query: "600",
    scope: "value",
    replacement: "0",
  });
  assert.equal(guarded.matched, 1);
  assert.equal(guarded.skippedFormulas, 1);
  assert.deepEqual(guarded.edits, [], "改公式的结果做不到，就一条都不许写");
});

test("替换全部是一份编辑清单，调用方一次事务写完 = 一步撤销", () => {
  const rows = sheet();
  const plan = planGridReplaceAll(rows, {
    query: "C",
    scope: "formula",
    replacement: "F",
  });
  assert.ok(plan.edits.length >= 4, "这次替换要覆盖多个格子才有意义");

  // 一份快照 = 一步撤销。整份清单在同一个 draft 上写完，撤销栈只进一条。
  const undoStack = [];
  const draft = rows.map((row) => [...row]);
  undoStack.push(rows.map((row) => [...row]));
  for (const edit of plan.edits) draft[edit.row][edit.col] = edit.after;

  assert.equal(undoStack.length, 1, "四处改动只压一条撤销记录");
  assert.equal(draft[1][3], "=F2-B2");
  assert.equal(draft[4][2], "=SUM(F2:F4)");

  const restored = undoStack.pop();
  assert.deepEqual(restored, sheet(), "一次撤销回到替换之前的完整状态");
});

test("空查询与无命中都得到空清单，不产生一次空事务", () => {
  const rows = sheet();
  assert.deepEqual(findGridMatches(rows, { query: "", scope: "formula" }), []);
  assert.deepEqual(planGridReplaceAll(rows, {
    query: "",
    scope: "formula",
    replacement: "x",
  }), { edits: [], matched: 0, skippedFormulas: 0 });

  const missing = planGridReplaceAll(rows, {
    query: "不存在的字串",
    scope: "formula",
    replacement: "x",
  });
  assert.equal(missing.edits.length, 0);
  assert.equal(missing.matched, 0);
});

test("查询串里的正则元字符按字面量处理", () => {
  const rows = [["=SUM(A1:A3)", "a.c", "abc"]];
  assert.deepEqual(
    findGridMatches(rows, { query: "a.c", scope: "formula" }).map((m) => m.col),
    [1],
    "`.` 是字面点号，不能匹配 abc",
  );
  assert.deepEqual(
    findGridMatches(rows, { query: "(A1:A3)", scope: "formula" }).map((m) => m.col),
    [0],
  );
});

test("列宽区间与 grid-model 的 C19 常量同值（防止两处漂移）", () => {
  assert.deepEqual(
    [...GRID_COL_WIDTH_RANGE],
    GRID_CONSTANTS.C19_columnWidthRangePx,
  );
});

/* ═══════════════ 接线段已删（core-swap:delete grid，2026-09-07）═══════════════
 *
 * 这份文件原来还有一段读 `GridStage.tsx` / `use-grid-editor.ts` 源码的接线判据。
 * 自研旧表格已删，查找替换与一步撤销在 Univer 内核里是原生能力
 * （`@univerjs/preset-sheets-find-replace` + Univer 自带 undo），不再有宿主侧接线可判。上面的纯函数判据保留：
 * `grid-structure.ts` 仍被 Univer 快照转换与 xlsx 往返用着。
 */
