import assert from "node:assert/strict";
import test from "node:test";

import {
  GRID_FORMULA_WHITELIST,
  evaluateGridCellInWorkbookTyped,
} from "../src/shell/doc-editors/grid-formula.ts";
import { gridWorkbookContext } from "../src/shell/doc-editors/grid-model.ts";

/**
 * §规范二 的第二条用例。
 *
 * `tests/grid-carrier-contract.test.mjs` 的 C-3 已经为 114 个白名单函数各留了
 * **一条正常值**凭据。任务书要的是**每个函数至少两条**：一条正常、一条边界或
 * 错误。这份测试就是那第二条——全部瞄准边界：空区域、零、找不到、越界、负数
 * 开方、除零。
 *
 * 除了逐条对值，它还锁一条全局不变式，那是任务书点名的红线：
 * **不许返回 `undefined`，不许返回 `NaN`**；算不出来就必须落在 7 种 Excel
 * 错误值里，不许是别的东西。上一波定下的话是「要么算出有限数、要么如实空着」。
 */

/** Excel 的 7 种错误值，§规范二 允许的全部错误出口。 */
const EXCEL_ERRORS = new Set([
  "#DIV/0!",
  "#N/A",
  "#VALUE!",
  "#REF!",
  "#NAME?",
  "#NUM!",
  "#NULL!",
]);

/**
 * A..D 有内容，E..G 刻意留空——「空区域」这一族边界全靠它。
 * B3 是 0（除零与「零而非空」的分界），B4 是空串（`COUNTBLANK` 的靶子）。
 */
const BASE_ROWS = [
  ["名称", "数量", "单价", "金额", "", "", ""],
  ["甲", "10", "2.5", "25", "", "", ""],
  ["乙", "0", "3", "0", "", "", ""],
  ["丙", "", "4", "", "", "", ""],
];

/** 公式落在 F1（row 0 / col 5），所以 `ROW()` 是 1、`COLUMN()` 是 6。 */
const PROBE_ROW = 0;
const PROBE_COL = 5;

/**
 * 每个白名单函数一条边界/错误用例。
 *
 * 值得单独点出来的几条：
 * - `SUBSTITUTE`：`"13-8-9"` 去掉 `-`。第 7 棒查实的真 bug 就长这样——分析器
 *   按 token.value 认运算符，字符串字面量 `"-"` 被当成一元负号，整条公式
 *   `#VALUE!`。`SUBSTITUTE(手机号,"-","")` 是办公里最常见的清洗公式之一。
 * - `ISERR` vs `ISERROR`：`ISERR(NA())` 必须是 `false`，这是两者唯一的区别，
 *   一条用例就能把它们分开。
 * - 日期族一律以 `1899-12-30 = 0` 这个锚点取边界，与 `grid-formula-date-serial`
 *   的口径同源。
 */
const BOUNDARY_PROBES = {
  /* 逻辑 —— 走没走到的那个分支 */
  IF: ['=IF(B3=0,"零","非零")', "零"],
  IFS: ['=IFS(B3>0,"正",TRUE(),"非正")', "非正"],
  IFERROR: ['=IFERROR(1/B3,"守卫")', "守卫"],
  IFNA: ['=IFNA(MATCH("丁",A2:A4,0),"缺")', "缺"],
  SWITCH: '=SWITCH(99,1,"a",2,"b","兜底")',
  AND: "=AND(TRUE(),FALSE())",
  OR: "=OR(FALSE(),FALSE())",
  NOT: "=NOT(TRUE())",
  XOR: "=XOR(TRUE(),TRUE())",
  TRUE: "=TRUE()",
  FALSE: "=FALSE()",

  /* 数学 —— 零、空区域、负数、除零 */
  SUM: ["=SUM(E1:E4)", 0],
  SUMIF: ['=SUMIF(A2:A4,"丁",D2:D4)', 0],
  SUMIFS: ['=SUMIFS(D2:D4,A2:A4,"丁")', 0],
  SUMPRODUCT: "=SUMPRODUCT(B2:B4,C2:C4)",
  PRODUCT: ["=PRODUCT(B2:B4)", 0],
  ABS: ["=ABS(0)", 0],
  ROUND: "=ROUND(2.5,0)",
  ROUNDUP: ["=ROUNDUP(0,2)", 0],
  ROUNDDOWN: "=ROUNDDOWN(-2.567,1)",
  MROUND: ["=MROUND(0,5)", 0],
  CEILING: ["=CEILING(0,5)", 0],
  FLOOR: ["=FLOOR(0,5)", 0],
  INT: ["=INT(-2.5)", -3],
  TRUNC: ["=TRUNC(-2.5)", -2],
  MOD: ['=IFERROR(MOD(5,0),"除零")', "除零"],
  POWER: ["=POWER(0,0)", 1],
  SQRT: ['=IFERROR(SQRT(-1),"负数")', "负数"],
  SIGN: ["=SIGN(0)", 0],

  /* 统计 —— 空区域与无匹配 */
  COUNT: ["=COUNT(A2:A4)", 0],
  COUNTA: ["=COUNTA(E1:E4)", 0],
  COUNTBLANK: ["=COUNTBLANK(B2:B4)", 1],
  COUNTIF: ['=COUNTIF(A2:A4,"丁")', 0],
  COUNTIFS: ['=COUNTIFS(A2:A4,"丁")', 0],
  AVERAGE: ['=IFERROR(AVERAGE(E1:E4),"空区")', "空区"],
  AVERAGEIF: ['=IFERROR(AVERAGEIF(A2:A4,"丁",D2:D4),"无匹配")', "无匹配"],
  AVERAGEIFS: ['=IFERROR(AVERAGEIFS(D2:D4,A2:A4,"丁"),"无匹配")', "无匹配"],
  MEDIAN: ["=MEDIAN(B2:B3)", 5],
  MIN: ["=MIN(E1:E4)", 0],
  MAX: ["=MAX(E1:E4)", 0],
  MINIFS: ['=MINIFS(D2:D4,A2:A4,"丁")', 0],
  MAXIFS: ['=MAXIFS(D2:D4,A2:A4,"丁")', 0],
  LARGE: ['=IFERROR(LARGE(B2:B3,9),"越界")', "越界"],
  SMALL: ['=IFERROR(SMALL(B2:B3,9),"越界")', "越界"],
  RANK: ["=RANK(B3,B2:B3)", 2],

  /* 文本 —— 空串、长度 0、找不到 */
  CONCAT: ['=CONCAT("","")', ""],
  TEXTJOIN: '=TEXTJOIN(",",TRUE(),E1:E4)',
  LEFT: ['=LEFT("abc",0)', ""],
  RIGHT: ['=RIGHT("abc",0)', ""],
  MID: ['=MID("abc",9,2)', ""],
  LEN: ['=LEN("")', 0],
  FIND: ['=IFERROR(FIND("z","abc"),"找不到")', "找不到"],
  SEARCH: ['=IFERROR(SEARCH("z","abc"),"找不到")', "找不到"],
  // 第 7 棒查实的那条真 bug 的回归位。
  SUBSTITUTE: ['=SUBSTITUTE("13-8-9","-","")', "1389"],
  REPLACE: ['=REPLACE("abc",1,0,"X")', "Xabc"],
  TRIM: ['=TRIM("   ")', ""],
  UPPER: ['=UPPER("")', ""],
  LOWER: ['=LOWER("")', ""],
  TEXT: '=TEXT(0,"0.00")',
  VALUE: ['=IFERROR(VALUE("abc"),"非数")', "非数"],
  EXACT: ['=EXACT("a","A")', false],

  /* 查找 —— 未命中与越界 */
  VLOOKUP: ['=IFERROR(VLOOKUP("丁",A2:D4,2,FALSE()),"未命中")', "未命中"],
  HLOOKUP: ['=IFERROR(HLOOKUP("无此列",A1:D4,2,FALSE()),"未命中")', "未命中"],
  INDEX: ['=IFERROR(INDEX(A2:A4,9),"越界")', "越界"],
  MATCH: ['=IFERROR(MATCH("丁",A2:A4,0),"未命中")', "未命中"],
  CHOOSE: ['=IFERROR(CHOOSE(9,"a","b"),"越界")', "越界"],
  ROW: ["=ROW()", 1],
  COLUMN: ["=COLUMN()", 6],
  ROWS: ["=ROWS(A2:A4)", 3],
  COLUMNS: ["=COLUMNS(A1:D1)", 4],

  /* 日期 —— 全部咬住 1899-12-30 = 0 这个锚点 */
  // 唯一的例外，也正是 DATE 的那条边界：Excel 规定 year 落在 0–1899 时**加
  // 1900**，所以 `DATE(1899,12,30)` 问的是 3799-12-30，不是锚点自己。693961 是
  // 那一天的序列号。写成 0 是我一开始的想当然，实跑之后按 Excel 订正。
  DATE: ["=DATE(1899,12,30)", 693961],
  YEAR: ["=YEAR(0)", 1899],
  MONTH: ["=MONTH(0)", 12],
  DAY: ["=DAY(0)", 30],
  HOUR: ["=HOUR(0)", 0],
  MINUTE: ["=MINUTE(0)", 0],
  SECOND: ["=SECOND(0)", 0],
  WEEKDAY: "=WEEKDAY(0)",
  WEEKNUM: "=WEEKNUM(1)",
  EDATE: ["=EDATE(0,0)", 0],
  EOMONTH: "=EOMONTH(0,0)",
  DATEDIF: ['=DATEDIF(0,0,"d")', 0],
  DAYS: ["=DAYS(0,0)", 0],
  NETWORKDAYS: "=NETWORKDAYS(1,1)",
  WORKDAY: "=WORKDAY(1,0)",
  DATEVALUE: ['=DATEVALUE("1899-12-30")', 0],
  TIME: ["=TIME(0,0,0)", 0],

  /* 财务 —— 零利率与零残值，边界上必须是有限数 */
  NPV: ["=NPV(0,E1:E4)", 0],
  IRR: ['=IFERROR(IRR(E1:E4),"无解")', "无解"],
  XNPV: '=IFERROR(XNPV(0,E1:E4,G1:G4),"无解")',
  XIRR: '=IFERROR(XIRR(E1:E4,G1:G4),"无解")',
  PMT: ["=PMT(0,10,-100)", 10],
  IPMT: ["=IPMT(0,1,10,-100)", 0],
  PPMT: ["=PPMT(0,1,10,-100)", 10],
  PV: ["=PV(0,10,-10)", 100],
  FV: ["=FV(0,10,-10)", 100],
  RATE: ["=ROUND(RATE(1,0,-100,100),4)", 0],
  NPER: ["=NPER(0,-10,100)", 10],
  SLN: ["=SLN(1000,1000,5)", 0],
  DB: ["=ROUND(DB(1000,1000,5,1),2)", 0],
  DDB: ["=ROUND(DDB(1000,1000,5,1),2)", 0],
  SYD: ["=SYD(1000,1000,5,1)", 0],

  /* 信息 —— 全部取「否」的那一侧 */
  ISBLANK: ["=ISBLANK(B2)", false],
  ISNUMBER: ["=ISNUMBER(A2)", false],
  ISTEXT: ["=ISTEXT(B2)", false],
  ISERROR: ["=ISERROR(B2)", false],
  // ISERR 与 ISERROR 的唯一区别：#N/A 不算。
  ISERR: ["=ISERR(NA())", false],
  ISNA: ["=ISNA(B2)", false],
  ISLOGICAL: ["=ISLOGICAL(B2)", false],
  ISEVEN: ["=ISEVEN(0)", true],
  ISODD: ["=ISODD(0)", false],
  N: ["=N(A2)", 0],
  NA: ["=ISERROR(NA())", true],
  TYPE: ["=TYPE(A2)", 2],
};

function evaluate(formula) {
  const rows = BASE_ROWS.map((row) => [...row]);
  rows[PROBE_ROW][PROBE_COL] = formula;
  const context = gridWorkbookContext([
    {
      id: "s1",
      name: "表一",
      rows,
      formats: {},
      merges: [],
      conditionalFormats: [],
    },
  ]);
  return evaluateGridCellInWorkbookTyped(context, "表一", PROBE_ROW, PROBE_COL);
}

/** `[公式, 期望值]` 或者只有公式（只受不变式约束，不对具体值）。 */
function probeOf(entry) {
  return Array.isArray(entry)
    ? { formula: entry[0], expected: entry[1], pinned: true }
    : { formula: entry, expected: undefined, pinned: false };
}

test("§规范二 每个白名单函数都有第二条用例（边界或错误）", () => {
  assert.deepEqual(
    Object.keys(BOUNDARY_PROBES).sort(),
    [...GRID_FORMULA_WHITELIST].sort(),
    "白名单增删了函数，边界用例必须跟着增删——不许留白",
  );
  assert.equal(Object.keys(BOUNDARY_PROBES).length, 114);
});

test("§规范二 边界用例逐条对值", () => {
  const mismatches = [];
  for (const [name, entry] of Object.entries(BOUNDARY_PROBES)) {
    const { formula, expected, pinned } = probeOf(entry);
    if (!pinned) continue;
    const result = evaluate(formula);
    if (result.value !== expected) {
      mismatches.push(`${name}: ${formula} => ${result.value}，期望 ${expected}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test("§规范二 边界上不许出现 undefined / NaN / 非 Excel 的错误值", () => {
  const offenders = [];
  for (const [name, entry] of Object.entries(BOUNDARY_PROBES)) {
    const { formula } = probeOf(entry);
    const { value } = evaluate(formula);
    if (value === undefined || value === null) {
      offenders.push(`${name}: ${formula} => ${String(value)}`);
      continue;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      offenders.push(`${name}: ${formula} => ${value}`);
      continue;
    }
    if (
      typeof value === "string" &&
      value.startsWith("#") &&
      !EXCEL_ERRORS.has(value)
    ) {
      offenders.push(`${name}: ${formula} => ${value}（不是 7 种 Excel 错误值）`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("§规范二 正常值那条用例（C-3）与边界这条用例是两条不同的公式", () => {
  // 两条用例必须真的不同，否则「至少两条」是凑数。C-3 的公式表在
  // grid-carrier-contract.test.mjs 里，这里只自查边界表内部无重复。
  const formulas = Object.values(BOUNDARY_PROBES).map(
    (entry) => probeOf(entry).formula,
  );
  assert.equal(
    new Set(formulas).size,
    formulas.length,
    "边界用例之间不许有重复公式",
  );
});
