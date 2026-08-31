import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateGridCellTyped,
  gridDateToSerial,
  gridSerialToDate,
} from "../src/shell/doc-editors/grid-formula.ts";

/**
 * §规范二 date-serial pin.
 *
 * A spreadsheet stores a date as a day count, and the anchor of that count is
 * not negotiable: get it wrong by one and every exported date is off by a day,
 * silently, in a file that still opens cleanly. Two separate quirks have to be
 * reproduced exactly, not corrected:
 *
 *   1. Serial 0 is 1899-12-30, not 1900-01-01.
 *   2. Serial 60 is 1900-02-29 — a day that never existed. Lotus 1-2-3 shipped
 *      the phantom leap day, Excel kept it for file compatibility, and so every
 *      real date between the anchor and 1900-03-01 carries a number one lower
 *      than a straight day count gives.
 *
 * "Excel is wrong here" is true and beside the point: the file format is the
 * contract, and a reader on the other side will apply the same quirk.
 */

/**
 * Verified against Excel's own numbering, value by value.
 *
 * The list starts at the anchor and then jumps to serial 1: Excel's
 * representable range begins at 1900-01-01, and the day between is not a date
 * Excel will name. `DATE()` cannot reach it either (see the two-digit-year rule
 * below), so nothing in the product can observe it.
 */
const ANCHORS = [
  [1899, 12, 30, 0, "序列号 0 的锚点，不是 1900-01-01"],
  [1900, 1, 1, 1, "可表示范围的第一天，闰年兼容位已生效"],
  [1900, 2, 28, 59, "幻影日之前最后一个真实日"],
  [1900, 3, 1, 61, "幻影日之后，60 被 1900-02-29 占着"],
  [1901, 1, 1, 367, "跨过幻影日整整一年（Excel 眼里 1900 年有 366 天）"],
  [2026, 8, 31, 46265, "本轮交付当天"],
  [9999, 12, 31, 2958465, "子集接受的最大序列号"],
];

test("日期序列号锚点逐值对齐 Excel", () => {
  for (const [year, month, day, serial, why] of ANCHORS) {
    assert.equal(
      gridDateToSerial(year, month, day),
      serial,
      `${year}-${month}-${day} 应为 ${serial}（${why}）`,
    );
  }
});

/**
 * The anchor is the case the arithmetic got wrong: it is not one of the days
 * the phantom pushed out of place, but a `raw <= 60` test swept it in and
 * numbered 1899-12-30 as -1. A negative serial is not a date at all, so the
 * error surfaced as `#NUM!` far from its cause.
 */
test("锚点自己不参与闰年兼容位的减一", () => {
  assert.equal(gridDateToSerial(1899, 12, 30), 0);
  assert.ok(gridDateToSerial(1899, 12, 30) >= 0, "锚点不许算成负数");
});

test("序列号 60 是幻影日 1900-02-29", () => {
  assert.deepEqual(gridSerialToDate(60), { year: 1900, month: 2, day: 29 });
  assert.deepEqual(gridSerialToDate(59), { year: 1900, month: 2, day: 28 });
  assert.deepEqual(gridSerialToDate(61), { year: 1900, month: 3, day: 1 });
});

/**
 * The phantom is the one serial that cannot round-trip, because there is no
 * real 1900-02-29 to come back from. Stating it as an expected exception keeps
 * a future reader from "fixing" the asymmetry and shifting 59 days with it.
 */
test("序列号 ↔ 日期双向 round-trip，幻影日是唯一例外", () => {
  const sampled = [
    0, 1, 2, 30, 58, 59, 61, 62, 100, 366, 367, 1000, 25569, 46265, 2958465,
  ];
  for (const serial of sampled) {
    const { year, month, day } = gridSerialToDate(serial);
    assert.equal(
      gridDateToSerial(year, month, day),
      serial,
      `序列号 ${serial} 往返后变了`,
    );
  }
  const phantom = gridSerialToDate(60);
  assert.deepEqual(phantom, { year: 1900, month: 2, day: 29 });
  assert.equal(
    gridDateToSerial(phantom.year, phantom.month, phantom.day),
    61,
    "幻影日回不去 60，因为它不是真实存在的一天",
  );
});

test("连续序列号对应连续日历日，跨过幻影日也不断档", () => {
  for (let serial = 1; serial <= 400; serial += 1) {
    if (serial === 60) continue;
    const today = gridSerialToDate(serial);
    const next = gridSerialToDate(serial + 1 === 60 ? 61 : serial + 1);
    const gap =
      Date.UTC(next.year, next.month - 1, next.day) -
      Date.UTC(today.year, today.month - 1, today.day);
    assert.equal(
      gap,
      86_400_000,
      `序列号 ${serial} 与下一天之间不是一整天`,
    );
  }
});

/* ------------------------- 公式层看到的是同一套口径 ------------------------- */

function evaluate(formula) {
  return evaluateGridCellTyped([[formula]], 0, 0);
}

test("DATE / YEAR / MONTH / DAY 与序列号口径一致", () => {
  assert.equal(evaluate("=DATE(1900,1,1)").value, 1);
  assert.equal(evaluate("=DATE(1900,3,1)").value, 61);
  assert.equal(evaluate("=DATE(2026,8,31)").value, 46265);
  assert.equal(evaluate("=YEAR(46265)").value, 2026);
  assert.equal(evaluate("=MONTH(46265)").value, 8);
  assert.equal(evaluate("=DAY(46265)").value, 31);
});

/**
 * A year argument under 1900 is added to 1900 rather than taken literally, so
 * `DATE(1899,12,30)` is 3799-12-30 and `DATE(26,8,31)` is 1926 — not 2026, and
 * not the anchor. The consequence worth pinning: the anchor is reachable
 * through `gridDateToSerial` but not through any formula, so a test asserting
 * `DATE(1899,12,30) = 0` would be pinning a divergence from Excel, not a match.
 */
test("DATE 的年份规则：小于 1900 的年份是「1900 + 它」", () => {
  assert.equal(evaluate("=YEAR(DATE(1899,12,30))").value, 3799);
  assert.equal(evaluate("=YEAR(DATE(26,8,31))").value, 1926);
  assert.equal(evaluate("=DATE(26,8,31)").value, 9740);
  assert.equal(evaluate("=DATE(0,1,1)").value, 1);
});

test("公式层也看得见幻影日", () => {
  assert.equal(evaluate("=YEAR(60)").value, 1900);
  assert.equal(evaluate("=MONTH(60)").value, 2);
  assert.equal(evaluate("=DAY(60)").value, 29);
});

/**
 * The gap Excel readers depend on: two calendar days apart, but two serials
 * apart plus one, because the phantom sits between them.
 */
test("DAYS 跨幻影日按序列号相减，与 Excel 同步差这一天", () => {
  assert.equal(evaluate("=DAYS(DATE(1900,3,1),DATE(1900,2,28))").value, 2);
  assert.equal(evaluate("=DAYS(DATE(2026,8,31),DATE(2026,8,30))").value, 1);
});

test("超出范围的序列号给 #NUM!，不是负数也不是 NaN", () => {
  const tooLate = evaluate("=DATE(10000,1,1)");
  assert.equal(tooLate.ok, false);
  assert.equal(tooLate.value, "#NUM!");
  const tooEarly = evaluate("=YEAR(0-1)");
  assert.equal(tooEarly.ok, false);
  assert.equal(tooEarly.value, "#NUM!");
});

test("月份溢出按 Excel 归一，不是报错", () => {
  assert.equal(evaluate("=YEAR(DATE(2026,13,1))").value, 2027);
  assert.equal(evaluate("=MONTH(DATE(2026,13,1))").value, 1);
});

/**
 * A month-end walk is where an off-by-one anchor shows up in real ledgers:
 * `EOMONTH` drives every "as of month end" row in the corpus's 台账 family.
 */
test("EOMONTH / EDATE 在月末与真实闰年上不越界", () => {
  assert.equal(evaluate("=DAY(EOMONTH(DATE(2024,2,1),0))").value, 29);
  assert.equal(evaluate("=DAY(EOMONTH(DATE(2026,2,1),0))").value, 28);
  assert.equal(evaluate("=DAY(EDATE(DATE(2026,1,31),1))").value, 28);
});
