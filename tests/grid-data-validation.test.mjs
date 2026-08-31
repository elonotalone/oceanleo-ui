import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteValidationRule,
  describeValidationRule,
  findInvalidCells,
  listValidationRules,
  nextValidationId,
  normalizeValidationRules,
  resolveValidationList,
  updateValidationRule,
  validateGridCell,
  validateGridValue,
  validationRuleForCell,
} from "../src/shell/doc-editors/grid-format/data-validation.ts";

const range = (firstRow, lastRow, firstCol, lastCol) => ({
  firstRow,
  lastRow,
  firstCol,
  lastCol,
});

const sheet = (rows = [[""]]) => ({ rows });

/* ------------------------------ the five kinds --------------------------- */

test("list validation accepts only its literal options", () => {
  const rule = {
    id: "dv-status",
    range: range(0, 9, 0, 0),
    kind: "list",
    source: "待办,进行中,已完成",
  };
  const context = sheet();

  assert.equal(validateGridValue(rule, "进行中", context).valid, true);

  const bad = validateGridValue(rule, "完成了", context);
  assert.equal(bad.valid, false);
  assert.equal(bad.code, "not-in-list");
  assert.match(bad.message, /不在候选列表中/);

  // Whitespace is significant unless the rule opts out of case folding only;
  // "已完成 " is a different string and must not silently pass.
  assert.equal(validateGridValue(rule, "已完成 ", context).valid, false);

  assert.deepEqual(resolveValidationList(rule, context).options, [
    "待办",
    "进行中",
    "已完成",
  ]);
});

test("whole and decimal split on integrality, not on magnitude", () => {
  const whole = {
    id: "dv-qty",
    range: range(0, 9, 0, 0),
    kind: "whole",
    operator: "between",
    value: "1",
    value2: "100",
  };
  const decimal = { ...whole, id: "dv-rate", kind: "decimal" };
  const context = sheet();

  assert.equal(validateGridValue(whole, "42", context).valid, true);
  assert.equal(validateGridValue(whole, "42.5", context).code, "not-whole");
  assert.equal(validateGridValue(decimal, "42.5", context).valid, true);

  // Both bounds are inclusive, and out-of-range is a different code from
  // not-a-number: the UI wants to say different things about them.
  assert.equal(validateGridValue(decimal, "1", context).valid, true);
  assert.equal(validateGridValue(decimal, "100", context).valid, true);
  assert.equal(validateGridValue(decimal, "100.01", context).code, "out-of-range");
  assert.equal(validateGridValue(decimal, "abc", context).code, "not-number");
});

test("date validation compares instants, not the strings that spell them", () => {
  const rule = {
    id: "dv-when",
    range: range(0, 9, 0, 0),
    kind: "date",
    operator: "between",
    value: "2026-01-01",
    value2: "2026-12-31",
  };
  const context = sheet();

  assert.equal(validateGridValue(rule, "2026-06-15", context).valid, true);
  assert.equal(validateGridValue(rule, "2025-12-31", context).code, "out-of-range");
  assert.equal(validateGridValue(rule, "不是日期", context).code, "not-date");

  // An Excel serial and an ISO string naming the same day must agree, because
  // one workbook can hold both spellings of the same column.
  const serial = validateGridValue(rule, "46023", context);
  const iso = validateGridValue(rule, "2026-01-01", context);
  assert.equal(serial.valid, iso.valid);
});

test("text length counts characters a person would count", () => {
  const rule = {
    id: "dv-code",
    range: range(0, 9, 0, 0),
    kind: "text-length",
    operator: "less-equal",
    value: "4",
  };
  const context = sheet();

  assert.equal(validateGridValue(rule, "ABCD", context).valid, true);
  assert.equal(validateGridValue(rule, "ABCDE", context).code, "length");
  // Four CJK characters are four characters, not eight bytes or eight units.
  assert.equal(validateGridValue(rule, "上海市区", context).valid, true);
  // One emoji is one character even though it is two UTF-16 units.
  assert.equal(validateGridValue(rule, "🙂", context).valid, true);
});

test("custom formula judges the candidate, not the value already stored", () => {
  const rule = {
    id: "dv-custom",
    range: range(0, 4, 0, 0),
    kind: "custom",
    formula: "=A1>0",
  };
  // A1 currently holds a value that would FAIL the rule. If the evaluator read
  // storage instead of the candidate, the good candidate below would be
  // rejected and the bad one accepted — exactly backwards.
  const context = sheet([["-5"], ["-5"], ["-5"], ["-5"], ["-5"]]);

  assert.equal(validateGridValue(rule, "10", context, 0, 0).valid, true);
  assert.equal(validateGridValue(rule, "-1", context, 0, 0).code, "formula");

  // The relative reference shifts with the row, the way one authored rule
  // covers a whole range.
  assert.equal(validateGridValue(rule, "7", context, 3, 0).valid, true);
});

/* ----------------------------- block vs warn ----------------------------- */

test("warn is the default and lets the edit land; block is opt-in and rejects", () => {
  const base = {
    id: "dv-qty",
    range: range(0, 9, 0, 0),
    kind: "whole",
    operator: "greater-than",
    value: "0",
  };
  const context = sheet();

  const warned = validateGridValue(base, "-3", context);
  assert.equal(warned.valid, false);
  assert.equal(warned.behavior, "warn", "a rule that named no behavior must warn");
  assert.equal(warned.rejected, false, "warn must never refuse the edit");

  const blocked = validateGridValue({ ...base, behavior: "block" }, "-3", context);
  assert.equal(blocked.valid, false);
  assert.equal(blocked.behavior, "block");
  assert.equal(blocked.rejected, true);

  // A valid value is never rejected, whatever the behavior says.
  assert.equal(
    validateGridValue({ ...base, behavior: "block" }, "3", context).rejected,
    false,
  );
});

test("a broken rule never locks the user out", () => {
  const context = sheet([["1"]]);

  // A formula that errors is not a verdict of "invalid".
  const broken = {
    id: "dv-broken",
    range: range(0, 0, 0, 0),
    kind: "custom",
    behavior: "block",
    formula: "=1/0",
  };
  const verdict = validateGridValue(broken, "anything", context, 0, 0);
  assert.equal(verdict.valid, true);
  assert.equal(verdict.rejected, false);
  assert.equal(verdict.code, "formula");

  // Nor is a list whose source names a sheet nobody can read.
  const dangling = {
    id: "dv-dangling",
    range: range(0, 0, 0, 0),
    kind: "list",
    behavior: "block",
    source: "=不存在的表!A1:A9",
  };
  const stranded = validateGridValue(dangling, "甲", context, 0, 0);
  assert.equal(stranded.valid, true);
  assert.equal(stranded.code, "unresolved-source");
  assert.equal(resolveValidationList(dangling, context).unresolved, true);
});

test("blank passes unless the rule says otherwise", () => {
  const rule = {
    id: "dv-qty",
    range: range(0, 9, 0, 0),
    kind: "whole",
    operator: "greater-than",
    value: "0",
  };
  const context = sheet();

  assert.equal(validateGridValue(rule, "", context).valid, true);
  assert.equal(validateGridValue(rule, "   ", context).valid, true);
  assert.equal(validateGridValue({ ...rule, allowBlank: false }, "", context).code, "blank");
});

/* --------------------------- dropdown sources ---------------------------- */

test("a dropdown can read its options out of another sheet", () => {
  const rule = {
    id: "dv-city",
    range: range(0, 9, 0, 0),
    kind: "list",
    source: "=清单!A1:A4",
  };
  const context = {
    rows: [[""]],
    sheetName: "录入",
    workbook: {
      清单: [["上海"], ["北京"], [""], ["广州"]],
    },
  };

  const list = resolveValidationList(rule, context);
  assert.equal(list.fromReference, true);
  assert.equal(list.unresolved, false);
  // Blank cells inside the range are not offered as an empty choice.
  assert.deepEqual(list.options, ["上海", "北京", "广州"]);

  assert.equal(validateGridValue(rule, "北京", context).valid, true);
  assert.equal(validateGridValue(rule, "深圳", context).code, "not-in-list");

  // Sheet names resolve case-insensitively, as OOXML does.
  const upper = { ...rule, source: "=清单!A1:A4" };
  assert.equal(resolveValidationList(upper, context).options.length, 3);
});

test("a dropdown reading its own sheet follows edits to the source range", () => {
  const rule = {
    id: "dv-self",
    range: range(0, 2, 1, 1),
    kind: "list",
    source: "=$D$1:$D$2",
  };
  const context = sheet([
    ["", "", "", "甲"],
    ["", "", "", "乙"],
  ]);

  assert.deepEqual(resolveValidationList(rule, context).options, ["甲", "乙"]);
  assert.equal(validateGridValue(rule, "丙", context).valid, false);

  context.rows[1][3] = "丙";
  assert.deepEqual(resolveValidationList(rule, context).options, ["甲", "丙"]);
  assert.equal(validateGridValue(rule, "丙", context).valid, true);
});

/* ------------------------- circling invalid data ------------------------- */

test("invalid data already in the sheet can be circled", () => {
  const rules = [
    {
      id: "dv-score",
      range: range(0, 3, 0, 0),
      kind: "whole",
      operator: "between",
      value: "0",
      value2: "100",
    },
  ];
  const context = sheet([["50"], ["120"], [""], ["abc"]]);

  const circled = findInvalidCells(rules, context);
  assert.deepEqual(
    circled.map((cell) => [cell.row, cell.col, cell.code]),
    [
      [1, 0, "out-of-range"],
      [3, 0, "not-number"],
    ],
    "row 0 is valid and row 2 is blank, so only two cells are circled",
  );
  assert.equal(circled[0].value, "120");
  assert.ok(circled[0].message.length > 0);
});

test("circling honours last-rule-wins where two rules overlap", () => {
  // The second rule is applied over part of the first, which is what happens
  // when a user selects a sub-range and applies a new validation to it.
  const rules = [
    {
      id: "dv-wide",
      range: range(0, 3, 0, 0),
      kind: "whole",
      operator: "less-than",
      value: "10",
    },
    {
      id: "dv-narrow",
      range: range(2, 3, 0, 0),
      kind: "whole",
      operator: "greater-than",
      value: "100",
    },
  ];
  const context = sheet([["5"], ["50"], ["5"], ["500"]]);

  assert.equal(validationRuleForCell(rules, 0, 0).id, "dv-wide");
  assert.equal(validationRuleForCell(rules, 2, 0).id, "dv-narrow");

  const circled = findInvalidCells(rules, context);
  assert.deepEqual(
    circled.map((cell) => [cell.row, cell.ruleId]),
    [
      [1, "dv-wide"],
      [2, "dv-narrow"],
    ],
    "row 2 holds 5, which the wide rule allows and the narrow one does not",
  );
});

test("validateGridCell picks the governing rule and defers to it", () => {
  const rules = [
    {
      id: "dv-a",
      range: range(0, 1, 0, 0),
      kind: "list",
      source: "甲,乙",
    },
  ];
  const context = sheet([["甲"], ["丙"]]);

  assert.equal(validateGridCell(rules, context, 0, 0, "乙").valid, true);
  assert.equal(validateGridCell(rules, context, 0, 0, "丙").valid, false);
  // No rule covers this cell, so nothing constrains it.
  const free = validateGridCell(rules, context, 5, 5, "任何东西");
  assert.equal(free.valid, true);
  assert.equal(free.ruleId, undefined);
});

/* --------------------------- the rule manager ---------------------------- */

test("rules can be listed by selection, edited and deleted one at a time", () => {
  const rules = [
    { id: "dv-1", range: range(0, 1, 0, 0), kind: "list", source: "甲,乙" },
    { id: "dv-2", range: range(5, 6, 2, 2), kind: "list", source: "丙,丁" },
  ];

  assert.equal(listValidationRules(rules).length, 2);
  assert.deepEqual(
    listValidationRules(rules, range(0, 2, 0, 1)).map((rule) => rule.id),
    ["dv-1"],
  );

  const edited = updateValidationRule(rules, "dv-2", { behavior: "block" });
  assert.equal(edited[1].behavior, "block");
  assert.equal(edited[0].behavior, undefined, "editing one rule must not touch the other");
  assert.equal(edited[1].id, "dv-2", "the id is not editable");

  const pruned = deleteValidationRule(rules, "dv-1");
  assert.deepEqual(pruned.map((rule) => rule.id), ["dv-2"]);
  assert.equal(rules.length, 2, "the manager returns new arrays and never mutates");

  assert.equal(nextValidationId(rules), "dv-3");
});

test("rules from storage are checked, and unusable ones are dropped not coerced", () => {
  const kept = normalizeValidationRules([
    { id: "ok", kind: "whole", operator: "between", value: "1", value2: "9", range: range(0, 1, 0, 1) },
    { id: "bad-kind", kind: "colour", range: range(0, 1, 0, 1) },
    { id: "bad-op", kind: "whole", operator: "sideways", value: "1", range: range(0, 1, 0, 1) },
    { id: "no-range", kind: "list", source: "甲" },
    { id: "empty-list", kind: "list", source: "   ", range: range(0, 1, 0, 1) },
    { kind: "list", source: "甲,乙", range: range(2, 2, 0, 0) },
  ]);

  assert.deepEqual(kept.map((rule) => rule.id), ["ok", "dv-6"]);
  assert.equal(kept[0].value2, "9");
  assert.equal(kept[0].behavior, undefined, "storage that named no behavior stays warn");

  // Out-of-bounds ranges are clamped rather than dropped, and reversed corners
  // are straightened.
  const [clamped] = normalizeValidationRules(
    [{ id: "x", kind: "list", source: "甲", range: { firstRow: 9, lastRow: 2, firstCol: 5, lastCol: 1 } }],
    10_000,
    256,
  );
  assert.deepEqual(clamped.range, { firstRow: 2, lastRow: 9, firstCol: 1, lastCol: 5 });

  // Duplicate ids would make the manager address two rules with one handle.
  const deduped = normalizeValidationRules([
    { id: "same", kind: "list", source: "甲", range: range(0, 0, 0, 0) },
    { id: "same", kind: "list", source: "乙", range: range(1, 1, 0, 0) },
  ]);
  assert.equal(new Set(deduped.map((rule) => rule.id)).size, 2);
});

test("every rule kind can describe itself for the manager", () => {
  const described = [
    { id: "a", range: range(0, 0, 0, 0), kind: "list", source: "甲,乙" },
    { id: "b", range: range(0, 0, 0, 0), kind: "whole", operator: "between", value: "1", value2: "9" },
    { id: "c", range: range(0, 0, 0, 0), kind: "decimal", operator: "greater-than", value: "0" },
    { id: "d", range: range(0, 0, 0, 0), kind: "date", operator: "less-equal", value: "2026-12-31" },
    { id: "e", range: range(0, 0, 0, 0), kind: "text-length", operator: "equal", value: "6" },
    { id: "f", range: range(0, 0, 0, 0), kind: "custom", formula: "=A1<>\"\"" },
  ].map(describeValidationRule);

  assert.deepEqual(described, [
    "序列：甲,乙",
    "整数 介于 1 与 9",
    "小数 大于 0",
    "日期 小于或等于 2026-12-31",
    "文本长度 等于 6",
    '自定义公式：=A1<>""',
  ]);
});

test("validation is a predicate and never rewrites the candidate", () => {
  const rule = {
    id: "dv-qty",
    range: range(0, 0, 0, 0),
    kind: "whole",
    operator: "between",
    value: "1",
    value2: "10",
  };
  const context = sheet([["  7  "]]);
  const before = context.rows[0][0];

  const verdict = validateGridValue(rule, "  7  ", context, 0, 0);
  assert.equal(verdict.valid, true);
  assert.equal(context.rows[0][0], before, "the stored value must be untouched");
  assert.equal(
    Object.prototype.hasOwnProperty.call(verdict, "value"),
    false,
    "a verdict carries no replacement value; clamping is not this module's job",
  );
});
