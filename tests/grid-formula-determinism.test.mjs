import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  GRID_FORMULA_REJECTION_CODES,
  buildGridDependencyGraph,
  evaluateGridCellInWorkbook,
  evaluateGridCellInWorkbookTyped,
  gridDateToSerial,
  inspectGridFormula,
  planGridRecalc,
  recalcGridWorkbook,
} from "../src/shell/doc-editors/grid-formula.ts";
import { gridWorkbookContext } from "../src/shell/doc-editors/grid-model.ts";

/**
 * §规范三 + §规范五.
 *
 * `TODAY()` is the most ordinary formula in office work and the engine used to
 * reject it outright, because an answer that changes on its own breaks the §5.4
 * invariant "same document bytes, same numbers". The fix is not to allow the
 * clock in — it is to move the instant into the document. A saved project
 * carries a `recalc` stamp; volatile functions read that. No stamp, no volatile
 * function: fail closed, never a quiet fall back to the host clock.
 */

const STAMP = { at: "2001-02-03T04:05:06.000Z", seed: 12345 };

function sheet(id, name, rows) {
  return { id, name, rows, formats: {}, merges: [], conditionalFormats: [] };
}

function book(rows, options = {}) {
  return gridWorkbookContext([sheet("s1", "表一", rows)], options);
}

function valueOf(rows, row, col, options = {}) {
  return evaluateGridCellInWorkbook(book(rows, options), "表一", row, col);
}

/* ------------------------------ 缺戳 fail-closed ------------------------------ */

test("没有 recalc 戳时 volatile 函数被拒，不回落系统时间", () => {
  for (const formula of ["=TODAY()", "=NOW()", "=RAND()", "=RANDBETWEEN(1,9)"]) {
    const inspection = inspectGridFormula(formula);
    assert.equal(inspection.ok, false, `${formula} 无戳时应当被拒`);
    assert.ok(
      inspection.violations.some(
        (violation) =>
          violation.code === GRID_FORMULA_REJECTION_CODES.nondeterministic,
      ),
      `${formula} 应当落在 nondeterministic 码上`,
    );
    assert.deepEqual(inspection.volatileFunctions, []);
  }
});

test("缺戳时求值也拒绝，给的是拒绝码而不是一个算出来的数", () => {
  const result = evaluateGridCellInWorkbookTyped(book([["=TODAY()"]]), "表一", 0, 0);
  assert.equal(result.ok, false);
  assert.equal(result.value, GRID_FORMULA_REJECTION_CODES.nondeterministic);
  assert.notEqual(typeof result.value, "number");
});

/* ------------------------------ 有戳才放行 ------------------------------ */

test("有戳时 volatile 函数放行，并被记进 volatileFunctions 供重算图用", () => {
  const inspection = inspectGridFormula("=TODAY()+RAND()", { recalc: STAMP });
  assert.equal(inspection.ok, true);
  assert.deepEqual(inspection.volatileFunctions.sort(), ["RAND", "TODAY"]);
});

test("TODAY() 读的是戳上的日期，不是今天", () => {
  const expected = gridDateToSerial(2001, 2, 3);
  assert.equal(valueOf([["=TODAY()"]], 0, 0, { recalc: STAMP }), expected);

  // 反面控制：戳换一天，答案必须跟着换。若它纹丝不动，说明读的根本不是戳。
  const moved = valueOf([["=TODAY()"]], 0, 0, {
    recalc: { ...STAMP, at: "2001-02-04T04:05:06.000Z" },
  });
  assert.equal(moved, expected + 1);

  // 而且它显然不是「今天」——除非有人把机器时钟调回 2001 年。
  const now = new Date();
  const todayReal = gridDateToSerial(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
  assert.notEqual(expected, todayReal, "戳选在 2001 年就是为了与真实今天分开");
});

test("NOW() 带上戳里的时刻，TODAY() 只取整日", () => {
  const now = valueOf([["=NOW()"]], 0, 0, { recalc: STAMP });
  const today = valueOf([["=TODAY()"]], 0, 0, { recalc: STAMP });
  assert.equal(Math.floor(now), today);
  const seconds = 4 * 3600 + 5 * 60 + 6;
  assert.ok(
    Math.abs(now - today - seconds / 86_400) < 1e-9,
    `NOW() 的小数位应当是 04:05:06，实得 ${now - today}`,
  );
});

/* ------------------------------ RAND 的确定性 ------------------------------ */

test("同一份文档同一个种子，RAND() 每次都是同一个数", () => {
  const first = valueOf([["=RAND()"]], 0, 0, { recalc: STAMP });
  const second = valueOf([["=RAND()"]], 0, 0, { recalc: STAMP });
  assert.equal(first, second);
  assert.ok(first >= 0 && first < 1, `RAND() 必须落在 [0,1)，实得 ${first}`);
});

test("换种子换答案，否则种子是摆设", () => {
  const a = valueOf([["=RAND()"]], 0, 0, { recalc: STAMP });
  const b = valueOf([["=RAND()"]], 0, 0, { recalc: { ...STAMP, seed: 999 } });
  assert.notEqual(a, b);
});

test("同一份文档里两个格子不共用一个抽样", () => {
  const rows = [["=RAND()", "=RAND()"]];
  const context = book(rows, { recalc: STAMP });
  const left = evaluateGridCellInWorkbook(context, "表一", 0, 0);
  const right = evaluateGridCellInWorkbook(context, "表一", 0, 1);
  assert.notEqual(left, right, "两个格子抽到同一个数说明地址没进种子");
});

/**
 * `=RAND()+RAND()` is the cheap way to catch a per-cell seed that forgot the
 * call index: if both halves derive from the same material the sum is exactly
 * double the single draw, and every such formula in a document is quietly
 * wrong in the same direction.
 */
test("一个格子里的两次抽样互不相同", () => {
  const single = valueOf([["=RAND()"]], 0, 0, { recalc: STAMP });
  const doubled = valueOf([["=RAND()+RAND()"]], 0, 0, { recalc: STAMP });
  assert.notEqual(doubled, single * 2);
});

test("RANDBETWEEN 落在闭区间内，上界小于下界时给 #NUM!", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const drawn = valueOf([["=RANDBETWEEN(1,6)"]], 0, 0, {
      recalc: { ...STAMP, seed },
    });
    assert.ok(
      Number.isInteger(drawn) && drawn >= 1 && drawn <= 6,
      `种子 ${seed} 抽出了 ${drawn}`,
    );
  }
  const backwards = evaluateGridCellInWorkbookTyped(
    book([["=RANDBETWEEN(9,1)"]], { recalc: STAMP }),
    "表一",
    0,
    0,
  );
  assert.equal(backwards.ok, false);
  assert.equal(backwards.value, "#NUM!");
});

/**
 * `RANDARRAY` is volatile too, but it returns a dynamic array and the §规范四
 * spill semantics are deliberately not in this wave (zero hits across the
 * 456-workbook corpus). A stamp must not be mistaken for permission to ship
 * half of it.
 */
test("RANDARRAY 即便有戳也仍然被拒——溢出区本波不做", () => {
  const inspection = inspectGridFormula("=RANDARRAY(2,2)", { recalc: STAMP });
  assert.equal(inspection.ok, false);
  assert.ok(
    inspection.violations.some(
      (violation) =>
        violation.code === GRID_FORMULA_REJECTION_CODES.nondeterministic,
    ),
  );
});

test("不确定性之外的两类拒绝没有被这一波放宽", () => {
  for (const formula of ['=INDIRECT("A1")', "=OFFSET(A1,1,1)"]) {
    assert.equal(inspectGridFormula(formula, { recalc: STAMP }).ok, false, formula);
  }
  for (const formula of ["=Module1.RunMacro()", '=CALL("kernel32","Beep")']) {
    assert.equal(inspectGridFormula(formula, { recalc: STAMP }).ok, false, formula);
  }
});

/**
 * The source-level half of the rule. Every assertion above could be satisfied
 * by an engine that reads the clock somewhere else, so the closed subset is
 * also checked as text: neither API name may appear in the evaluator at all.
 * This is the assertion that goes red if `TODAY()` is ever pointed back at the
 * host clock.
 */
test("求值器源码里不出现 Date.now / Math.random", () => {
  const body = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/shell/doc-editors/grid-formula.ts",
    ),
    "utf8",
  );
  assert.equal(body.includes("Date.now("), false, "求值器碰了系统时钟");
  assert.equal(body.includes("Math.random("), false, "求值器碰了平台 RNG");
  // 反向自验：确定存在的字符串必须查得到，否则上面两条零命中是工具坏了（§6）。
  assert.equal(body.includes("Math.floor("), true, "探针本身失效");
});

/* --------------------------- P4 增量重算（§规范五） --------------------------- */

/**
 * A chain plus a bystander: editing the head of the chain must move the chain
 * and leave the bystander alone. "Recalculate everything" also produces right
 * answers, which is why the interesting assertion is about what is *not* in the
 * plan.
 */
function chainBook() {
  return [
    sheet("s1", "表一", [
      ["1", "=A1*2", "=B1+1", "=SUM(A1:A3)"],
      ["2", "=A2*2", "", ""],
      ["3", "", "", ""],
      ["=表二!A1", "", "", ""],
    ]),
    sheet("s2", "表二", [["100"]]),
  ];
}

function graphFor(sheets, options = {}) {
  const context = gridWorkbookContext(sheets, options);
  return {
    context,
    graph: buildGridDependencyGraph(
      context,
      sheets.map((each) => each.name),
    ),
  };
}

test("依赖图找得到直接读者，包括区域读者", () => {
  const { graph } = graphFor(chainBook());
  const readersOfA1 = graph
    .dependentsOf({ sheet: "表一", row: 0, col: 0 })
    .map((ref) => `${ref.row}:${ref.col}`)
    .sort();
  // B1 直接读 A1；D1 的 SUM(A1:A3) 把 A1 圈在区域里。
  assert.deepEqual(readersOfA1, ["0:1", "0:3"]);
});

test("区域依赖按矩形命中，不需要把成员格展开进索引", () => {
  const { graph } = graphFor(chainBook());
  const readersOfA3 = graph
    .dependentsOf({ sheet: "表一", row: 2, col: 0 })
    .map((ref) => `${ref.row}:${ref.col}`);
  assert.deepEqual(readersOfA3, ["0:3"]);
});

test("改一个格子只排它的下游，旁观者不进计划", () => {
  const { graph } = graphFor(chainBook());
  const plan = planGridRecalc(graph, [{ sheet: "表一", row: 0, col: 0 }]);
  const touched = plan.map((ref) => `${ref.row}:${ref.col}`);
  assert.deepEqual([...touched].sort(), ["0:1", "0:2", "0:3"]);
  assert.equal(
    touched.includes("1:1"),
    false,
    "B2 与 A1 无关，重算它就说明这不是增量",
  );
  // 拓扑序：B1 必须排在读它的 C1 之前。
  assert.ok(
    touched.indexOf("0:1") < touched.indexOf("0:2"),
    `拓扑序不对：${touched.join(" → ")}`,
  );
});

test("增量重算的结果与全量重算逐格相同", () => {
  const sheets = chainBook();
  const { context, graph } = graphFor(sheets);
  const patch = recalcGridWorkbook(context, graph, [
    { sheet: "表一", row: 0, col: 0 },
  ]);
  for (const [key, incremental] of patch) {
    const [, address] = key.split("!");
    const [row, col] = address.split(":").map(Number);
    assert.equal(
      incremental,
      evaluateGridCellInWorkbook(context, "表一", row, col),
      `${key} 增量与全量不一致`,
    );
  }
  assert.equal(patch.get("表一!0:1"), 2);
  assert.equal(patch.get("表一!0:2"), 3);
  assert.equal(patch.get("表一!0:3"), 6);
});

test("跨表依赖也在图里，改表二的源格会牵动表一", () => {
  const sheets = chainBook();
  const { graph } = graphFor(sheets);
  const plan = planGridRecalc(graph, [{ sheet: "表二", row: 0, col: 0 }]);
  assert.deepEqual(
    plan.map((ref) => `${ref.sheet}!${ref.row}:${ref.col}`),
    ["表一!3:0"],
  );
});

test("volatile 格子被单独记出来，供「重新计算」时一并刷新", () => {
  const sheets = [
    sheet("s1", "表一", [["=TODAY()", "=A1+1", "5"], ["=B1*2", "", ""]]),
  ];
  const { graph } = graphFor(sheets, { recalc: STAMP });
  assert.deepEqual(
    graph.volatileCells.map((ref) => `${ref.row}:${ref.col}`),
    ["0:0"],
  );
  // 重新盖戳等于改动了每一个 volatile 格子，下游跟着走。
  const plan = planGridRecalc(graph, graph.volatileCells);
  assert.deepEqual(
    plan.map((ref) => `${ref.row}:${ref.col}`).sort(),
    ["0:1", "1:0"],
  );
});

test("没有读者的改动排出空计划，不退化成全表重算", () => {
  const { graph } = graphFor(chainBook());
  const plan = planGridRecalc(graph, [{ sheet: "表一", row: 3, col: 3 }]);
  assert.deepEqual(plan, []);
});

/**
 * The property the incremental path exists for: cost tracks the affected
 * subgraph, not the sheet. Asserted as a ratio rather than a duration so the
 * test says the same thing on a loaded machine; the measured wall time lives in
 * the delivery note.
 */
test("5,000 行量级下，改一个格子排出的计划远小于全表", () => {
  const rows = [];
  for (let row = 0; row < 5000; row += 1) {
    rows.push([String(row + 1), `=A${row + 1}*2`, `=B${row + 1}+1`, ""]);
  }
  rows[0][3] = "=SUM(A1:A5000)";
  const sheets = [sheet("s1", "表一", rows)];
  const { graph } = graphFor(sheets);
  assert.equal(graph.formulaCells.length, 10_001);

  const plan = planGridRecalc(graph, [{ sheet: "表一", row: 4321, col: 0 }]);
  // B4322、C4322，加上把整列圈进去的那条 SUM。
  assert.equal(plan.length, 3);
  assert.ok(
    plan.length * 100 < graph.formulaCells.length,
    `增量计划 ${plan.length} 相对全表 ${graph.formulaCells.length} 没有省下来`,
  );
});

/* ------------------- 画布：recalc 戳必须够得着（V3 A3） ------------------- */

/**
 * V3 于 18:39 判 A3 翻红，实跑复核**成立**，而且与 A2 是同一个根因：画布按
 * 三参数调用 `gridDisplayValue`，`evaluateIn` 于是造一个**既没有兄弟表、也没有
 * recalc 戳**的临时上下文。结果是 `TODAY()` 在画布上永远 fail-closed。
 *
 * 「两次加载同值」在修复前字面上也为真——两次都同样地用不了。所以这里两条都要
 * 判：**既要两次同值，又要真的算得出数。** 只判前者会把「一致地坏」读成绿。
 */
test("画布：文档带 recalc 戳时，TODAY() 在画布上算得出，且两次加载同值", async () => {
  const { cloneGridSheets, gridDisplayValue, gridIrToCarrierProject } =
    await import("../src/shell/doc-editors/grid-model.ts");

  const irProject = {
    schema: "oceanleo.grid.v1",
    version: 1,
    title: "recalc",
    sheets: [
      {
        name: "表一",
        headerRow: false,
        columns: [
          { name: "today", type: "text" },
          { name: "rand", type: "number" },
        ],
        rows: [
          [{ f: "TODAY()" }, { f: "RAND()" }],
          ["a", 1],
          ["b", 2],
          ["c", 3],
        ],
      },
    ],
    recalc: { at: "2026-08-31T00:00:00.000Z", seed: 12345 },
    attribution: {
      entries: [
        { text: "t", licenseCode: "CC0-1.0", licenseUrl: "https://x.test" },
      ],
    },
  };

  /** 同一份文档「加载」一次：IR → 编辑器状态 → 状态漏斗 → 画布的三参数调用。 */
  const loadOnce = () => {
    const { sheets } = gridIrToCarrierProject(irProject);
    const active = cloneGridSheets(sheets)[0];
    return {
      today: gridDisplayValue(active, 0, 0),
      rand: gridDisplayValue(active, 0, 1),
    };
  };

  const first = loadOnce();
  const second = loadOnce();

  // 2026-08-31 的序列号，与 grid-formula-date-serial 的口径同源。
  assert.equal(first.today, "46265", "画布拿不到 recalc 戳，TODAY() 又被挡回去了");
  assert.notEqual(first.rand, "grid-formula-nondeterministic");
  assert.deepEqual(first, second, "同一份文档两次加载必须逐字相同");
});

test("画布：文档没有 recalc 戳时，volatile 仍然 fail-closed（不许读系统时钟）", async () => {
  const { bindGridWorkbook, cloneGridSheets, gridDisplayValue } = await import(
    "../src/shell/doc-editors/grid-model.ts"
  );
  const sheets = cloneGridSheets([sheet("s1", "表一", [["=TODAY()"]])]);
  bindGridWorkbook(sheets); // 登记了工作簿，但没有戳
  assert.equal(gridDisplayValue(sheets[0], 0, 0), "grid-formula-nondeterministic");
});
