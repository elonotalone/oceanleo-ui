import assert from "node:assert/strict";
import test from "node:test";

import { evaluateGridCell } from "../src/shell/doc-editors/grid-formula.ts";
import {
  GRID_COL_WIDTH_RANGE,
  GRID_DEFAULT_ROW_HEIGHT,
  GRID_ROW_HEIGHT_RANGE,
  detectGridFillSeries,
  gridAxisExtent,
  gridFillDownLength,
  gridRowSpacer,
  gridRowWindowRange,
  measureGridAutoColumnWidth,
  normalizeGridAxisSizes,
  planGridFill,
  translateGridFormula,
} from "../src/shell/doc-editors/grid-structure.ts";

test("公式相对引用跟着平移，$ 锁住的绝对引用一步不动", () => {
  // 纯相对：行列都跟着走。
  assert.equal(translateGridFormula("=A1+B2", 2, 0), "=A3+B4");
  assert.equal(translateGridFormula("=A1+B2", 0, 3), "=D1+E2");
  assert.equal(translateGridFormula("=A1+B2", 2, 3), "=D3+E4");

  // 绝对：$ 在哪儿就锁哪一维。
  assert.equal(translateGridFormula("=$A$1", 5, 5), "=$A$1");
  assert.equal(translateGridFormula("=$A1", 2, 4), "=$A3");
  assert.equal(translateGridFormula("=A$1", 2, 4), "=E$1");

  // 混合一条：这是财务表里最常见的形状（单价列锁死，数量列跟着走）。
  assert.equal(
    translateGridFormula("=B2*$F$1+SUM($A2:A5)", 3, 1),
    "=C5*$F$1+SUM($A5:B8)",
  );

  // 跨表引用同样按相对/绝对处理，表名原样保留。
  assert.equal(translateGridFormula("=Sheet2!B3", 1, 1), "=Sheet2!C4");
  assert.equal(translateGridFormula("='我的 表'!B3", 1, 0), "='我的 表'!B4");
});

test("平移不碰字符串字面量、函数名与命名区域", () => {
  assert.equal(
    translateGridFormula('=IF(A1>0,"A1 达标","A1 未达标")', 1, 0),
    '=IF(A2>0,"A1 达标","A1 未达标")',
  );
  // 函数名不是引用；SUM 不能被当成 A1 形状改掉。
  assert.equal(translateGridFormula("=SUM(A1:A3)", 1, 0), "=SUM(A2:A4)");
  // 不是公式、位移为零、词法解析不了 —— 三种都原样返回。
  assert.equal(translateGridFormula("A1", 3, 3), "A1");
  assert.equal(translateGridFormula("=A1", 0, 0), "=A1");
  assert.equal(translateGridFormula("=SUM(#", 2, 0), "=SUM(#");
});

test("平移出界得到 #REF!，不是悄悄夹回 A1", () => {
  assert.equal(translateGridFormula("=A1", -1, 0), "=#REF!");
  assert.equal(translateGridFormula("=A1", 0, -1), "=#REF!");
  // 绝对引用不参与越界：它压根没动。
  assert.equal(translateGridFormula("=$A$1", -5, -5), "=$A$1");
});

test("平移后的公式仍然是 W12 引擎能求值的公式", () => {
  // C1 = SUM(A1:B1)；往下拉一行应当变成 SUM(A2:B2) 并算出第二行的和。
  const rows = [
    ["10", "20", "=SUM(A1:B1)"],
    ["3", "4", ""],
  ];
  rows[1][2] = translateGridFormula(rows[0][2], 1, 0);
  assert.equal(rows[1][2], "=SUM(A2:B2)");
  assert.equal(evaluateGridCell(rows, 0, 2), 30);
  assert.equal(evaluateGridCell(rows, 1, 2), 7);
});

test("两格构成等差序列，按步长继续填", () => {
  assert.deepEqual(detectGridFillSeries(["1", "3"]), { kind: "linear", step: 2 });
  assert.deepEqual(planGridFill(["1", "3"], 4, { axis: "row" }), {
    kind: "linear",
    values: ["5", "7", "9", "11"],
  });

  // 递减、小数位保留、百分号保留。
  assert.deepEqual(planGridFill(["10", "8"], 3, { axis: "row" }).values, [
    "6",
    "4",
    "2",
  ]);
  assert.deepEqual(planGridFill(["1.5", "2.0"], 2, { axis: "row" }).values, [
    "2.5",
    "3.0",
  ]);
  assert.deepEqual(planGridFill(["5%", "10%"], 2, { axis: "row" }).values, [
    "15%",
    "20%",
  ]);

  // 差值不恒定就不是等差，退回循环重复而不是硬拟合。
  assert.deepEqual(detectGridFillSeries(["1", "3", "9"]), { kind: "copy", step: 0 });
  assert.deepEqual(planGridFill(["1", "3", "9"], 3, { axis: "row" }), {
    kind: "repeat",
    values: ["1", "3", "9"],
  });
});

test("两格构成日期序列，按天或按整月继续填", () => {
  assert.deepEqual(detectGridFillSeries(["2026-01-01", "2026-01-08"]), {
    kind: "date",
    step: 7,
    unit: "day",
  });
  assert.deepEqual(
    planGridFill(["2026-01-01", "2026-01-08"], 3, { axis: "row" }).values,
    ["2026-01-15", "2026-01-22", "2026-01-29"],
  );

  // 整月步长优先：按 31 天推会走成 3-03，按月才是 3-31。
  assert.deepEqual(detectGridFillSeries(["2026-01-31", "2026-02-28"]).unit, "day");
  assert.deepEqual(detectGridFillSeries(["2026-01-15", "2026-02-15"]), {
    kind: "date",
    step: 1,
    unit: "month",
  });
  assert.deepEqual(
    planGridFill(["2026-01-15", "2026-02-15"], 12, { axis: "row" }).values.at(-1),
    "2027-02-15",
  );

  // 跨年与分隔符/补零风格保留。
  assert.deepEqual(
    planGridFill(["2026/12/30", "2026/12/31"], 2, { axis: "row" }).values,
    ["2027/01/01", "2027/01/02"],
  );
  assert.deepEqual(planGridFill(["2026-1-1", "2026-1-2"], 1, { axis: "row" }).values, [
    "2026-1-3",
  ]);
});

test("单格纯文本是复制，不是造序列", () => {
  assert.deepEqual(planGridFill(["研发"], 3, { axis: "row" }), {
    kind: "copy",
    values: ["研发", "研发", "研发"],
  });
  assert.deepEqual(planGridFill(["7"], 3, { axis: "row" }), {
    kind: "copy",
    values: ["7", "7", "7"],
  });
});

test("整块填充：沿行按行位移、沿列按列位移，混合块里公式仍单独平移", () => {
  const down = planGridFill(["=A1", "=A2"], 4, { axis: "row" });
  assert.equal(down.kind, "formula");
  assert.deepEqual(down.values, ["=A3", "=A4", "=A5", "=A6"]);

  const across = planGridFill(["=A1"], 2, { axis: "col" });
  assert.deepEqual(across.values, ["=B1", "=C1"]);

  // 常量循环重复，公式跟着走。
  const mixed = planGridFill(["小计", "=A1"], 4, { axis: "row" });
  assert.deepEqual(mixed.values, ["小计", "=A3", "小计", "=A5"]);
});

test("双击填充柄沿相邻列的数据长度决定填多远", () => {
  const rows = [
    ["科目", "金额", "=B1"],
    ["研发", "10", ""],
    ["市场", "20", ""],
    ["财务", "30", ""],
    ["", "", ""],
    ["运维", "40", ""],
  ];
  // 选区在 C 列第 0 行；左邻 B 列从第 1 行起连续 3 行有数据，第 4 行断开。
  assert.equal(
    gridFillDownLength(rows, { firstRow: 0, lastRow: 0, firstCol: 2, lastCol: 2 }),
    3,
  );

  // 左邻为空时看右邻。
  assert.equal(
    gridFillDownLength(rows, { firstRow: 0, lastRow: 0, firstCol: 0, lastCol: 0 }),
    3,
    "A 列没有左邻，改看 B 列",
  );

  // 两边都没有数据就是 0，双击孤立格子不许凭空填出一片。
  assert.equal(
    gridFillDownLength(
      [["孤立", "", ""]],
      { firstRow: 0, lastRow: 0, firstCol: 0, lastCol: 0 },
    ),
    0,
  );
});

/* ── 行高列宽：另一个拖拽手势，和填充柄同属直接操作 ─────────────────────── */

test("尺寸表归一化：夹到区间、丢掉越界与非数", () => {
  const sizes = normalizeGridAxisSizes(
    { 0: 10, 1: 60, 2: 9999, 3: "abc", 99: 40, "-1": 40, x: 40 },
    { count: 10, min: GRID_ROW_HEIGHT_RANGE[0], max: GRID_ROW_HEIGHT_RANGE[1] },
  );
  assert.deepEqual(sizes, {
    0: GRID_ROW_HEIGHT_RANGE[0],
    1: 60,
    2: GRID_ROW_HEIGHT_RANGE[1],
  });
  assert.deepEqual(normalizeGridAxisSizes(null, { count: 5, min: 1, max: 9 }), {});
  assert.deepEqual(normalizeGridAxisSizes([1, 2], { count: 5, min: 1, max: 9 }), {});
});

test("没有任何自定义行高时，窗口定位与改造前的除法逐格一致", () => {
  const indexes = Array.from({ length: 1_000 }, (_, index) => index);
  for (const scrollTop of [0, 33, 34, 500, 1_234, 20_000]) {
    const { start } = gridRowWindowRange(indexes, {
      scrollTop,
      viewportHeight: 600,
      defaultHeight: GRID_DEFAULT_ROW_HEIGHT,
    });
    // 改造前：`Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 8)`
    assert.equal(
      start,
      Math.max(0, Math.floor(scrollTop / GRID_DEFAULT_ROW_HEIGHT) - 8),
      `scrollTop=${scrollTop} 的定位不许变`,
    );
  }
});

test("行高可变时 spacer 跟着变：三段之和恒等于全部行的真实总高", () => {
  const indexes = Array.from({ length: 300 }, (_, index) => index);
  const sizes = { 0: 120, 5: 80, 7: 200, 250: 60 };
  const truth = indexes.reduce(
    (total, row) => total + (sizes[row] ?? GRID_DEFAULT_ROW_HEIGHT),
    0,
  );

  for (const scrollTop of [0, 150, 900, 5_000]) {
    const range = gridRowWindowRange(indexes, {
      scrollTop,
      viewportHeight: 600,
      sizes,
      defaultHeight: GRID_DEFAULT_ROW_HEIGHT,
    });
    const spacer = gridRowSpacer(indexes, {
      ...range,
      sizes,
      defaultHeight: GRID_DEFAULT_ROW_HEIGHT,
    });
    assert.equal(
      spacer.totalHeight,
      truth,
      `scrollTop=${scrollTop}：spacer 三段之和必须等于真实总高，否则滚动条长度就是错的`,
    );
    assert.equal(
      spacer.leadingHeight,
      gridAxisExtent(indexes, 0, range.start, sizes, GRID_DEFAULT_ROW_HEIGHT),
    );
  }

  // 合并区把窗口往两头撑开之后，spacer 必须按**撑开后**的 start/end 重算。
  const range = gridRowWindowRange(indexes, {
    scrollTop: 900,
    viewportHeight: 600,
    sizes,
    defaultHeight: GRID_DEFAULT_ROW_HEIGHT,
  });
  const widened = gridRowSpacer(indexes, {
    start: Math.max(0, range.start - 6),
    end: Math.min(indexes.length, range.end + 9),
    sizes,
    defaultHeight: GRID_DEFAULT_ROW_HEIGHT,
  });
  assert.equal(widened.totalHeight, truth, "撑开窗口不改变总高");
  assert.ok(
    widened.leadingHeight <
      gridAxisExtent(indexes, 0, range.start, sizes, GRID_DEFAULT_ROW_HEIGHT) + 1,
    "start 前移，前 spacer 必须跟着变矮",
  );
});

test("筛选后窗口按可见行算高，隐藏行不占滚动长度", () => {
  // `visibleRowIndexes` 是筛选后的行号，不连续。
  const indexes = [0, 3, 4, 9];
  const sizes = { 3: 100 };
  const spacer = gridRowSpacer(indexes, {
    start: 0,
    end: indexes.length,
    sizes,
    defaultHeight: GRID_DEFAULT_ROW_HEIGHT,
  });
  assert.equal(spacer.totalHeight, GRID_DEFAULT_ROW_HEIGHT * 3 + 100);
  assert.equal(
    gridAxisExtent(indexes, 1, 3, sizes, GRID_DEFAULT_ROW_HEIGHT),
    100 + GRID_DEFAULT_ROW_HEIGHT,
    "按位置切片、按行号取高",
  );
});

test("双击自适应列宽：CJK 按两格算，结果夹在列宽区间内", () => {
  const [min, max] = GRID_COL_WIDTH_RANGE;
  assert.equal(measureGridAutoColumnWidth([""]), min, "空列取下限");
  assert.ok(
    measureGridAutoColumnWidth(["中文四个字"]) >
      measureGridAutoColumnWidth(["12345"]),
    "五个汉字必须比五个数字宽",
  );
  assert.equal(measureGridAutoColumnWidth(["x".repeat(500)]), max, "夹到上限");
  // 多行取最宽的一行，不是整串长度。
  assert.equal(
    measureGridAutoColumnWidth(["短\n长得多的一行文字"]),
    measureGridAutoColumnWidth(["长得多的一行文字"]),
  );
});
