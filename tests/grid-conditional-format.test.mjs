import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConditionalIndex,
  createConditionalPass,
  deleteConditionalRule,
  describeConditionalRule,
  fromLegacyConditionalFormat,
  interpolateColorScale,
  invalidateConditionalCell,
  listConditionalRules,
  nextConditionalPriority,
  normalizeConditionalRules,
  reorderConditionalRule,
  resolveConditionalStyle,
  translateRuleFormula,
  updateConditionalRule,
} from "../src/shell/doc-editors/grid-format/conditional-format.ts";

const range = (firstRow, lastRow, firstCol, lastCol) => ({
  firstRow,
  lastRow,
  firstCol,
  lastCol,
});

const RED = { color: "#cf222e", background: "#ffebe9", bold: true };
const GREEN = { color: "#1a7f37" };

function sheet() {
  return {
    rows: [
      ["10", "标题 A", "5"],
      ["50", "标题 B", "50"],
      ["90", "重复", "95"],
      ["", "重复", "40"],
    ],
  };
}

test("automatic recalculation is preserved: the same rule follows the new value", () => {
  const rules = [
    {
      id: "big",
      range: range(0, 3, 0, 0),
      priority: 1,
      kind: "cell-value",
      operator: "greater-than",
      value: "60",
      style: RED,
    },
  ];
  const context = sheet();
  const index = buildConditionalIndex(rules);

  // A1 is 10 — below the threshold, so nothing paints.
  assert.deepEqual(resolveConditionalStyle(index, context, 0, 0, "10").appliedRuleIds, []);
  // A3 is 90 — above it.
  const hot = resolveConditionalStyle(index, context, 2, 0, "90");
  assert.equal(hot.color, "#cf222e");
  assert.equal(hot.bold, true);

  // Edit A1 to 99. No rule was touched and the index was not rebuilt; the
  // paint follows the value because resolution is pure in the current value.
  context.rows[0][0] = "99";
  const recalculated = resolveConditionalStyle(index, context, 0, 0, "99");
  assert.equal(recalculated.color, "#cf222e");
  assert.deepEqual(recalculated.appliedRuleIds, ["big"]);
});

test("priority order and stop-if-true decide which of several matches wins", () => {
  const rules = [
    {
      id: "second",
      range: range(0, 3, 0, 0),
      priority: 2,
      kind: "cell-value",
      operator: "greater-than",
      value: "10",
      style: { background: "#dcfce7" },
    },
    {
      id: "first",
      range: range(0, 3, 0, 0),
      priority: 1,
      kind: "cell-value",
      operator: "greater-than",
      value: "40",
      style: { color: "#cf222e" },
    },
  ];
  const context = sheet();

  // Both match 50. Without a stop they cascade in priority order, so the
  // lower-priority background lands on top of the higher-priority colour.
  const cascaded = resolveConditionalStyle(buildConditionalIndex(rules), context, 1, 0, "50");
  assert.deepEqual(cascaded.appliedRuleIds, ["first", "second"]);
  assert.equal(cascaded.color, "#cf222e");
  assert.equal(cascaded.background, "#dcfce7");
  assert.equal(cascaded.stopped, false);

  // Marking the first rule "stop if true" cuts the cascade: rule `second`
  // never runs, so no background is applied.
  const stopping = rules.map((rule) =>
    rule.id === "first" ? { ...rule, stopIfTrue: true } : rule,
  );
  const stopped = resolveConditionalStyle(buildConditionalIndex(stopping), context, 1, 0, "50");
  assert.deepEqual(stopped.appliedRuleIds, ["first"]);
  assert.equal(stopped.color, "#cf222e");
  assert.equal(stopped.background, undefined);
  assert.equal(stopped.stopped, true);

  // A value only the second rule matches still reaches it.
  const low = resolveConditionalStyle(buildConditionalIndex(stopping), context, 0, 0, "20");
  assert.deepEqual(low.appliedRuleIds, ["second"]);
  assert.equal(low.background, "#dcfce7");
});

test("a data change recomputes only the ranges it touched", () => {
  const context = {
    rows: Array.from({ length: 200 }, (_, row) => [String(row), String(1000 - row)]),
  };
  const rules = [
    { id: "scale-a", range: range(0, 199, 0, 0), priority: 1, kind: "color-scale", colors: ["#ffffff", "#1f6feb"] },
    { id: "scale-b", range: range(0, 199, 1, 1), priority: 2, kind: "color-scale", colors: ["#ffffff", "#1a7f37"] },
  ];
  const index = buildConditionalIndex(rules);

  resolveConditionalStyle(index, context, 0, 0, "0");
  resolveConditionalStyle(index, context, 0, 1, "1000");
  // One scan per rule, memoised thereafter.
  assert.equal(index.metrics.statisticsComputed, 2);

  resolveConditionalStyle(index, context, 5, 0, "5");
  resolveConditionalStyle(index, context, 5, 1, "995");
  assert.equal(index.metrics.statisticsComputed, 2, "cached statistics must be reused");

  // Edit one cell in column A. Only `scale-a` overlaps it.
  context.rows[3][0] = "5000";
  const affected = invalidateConditionalCell(index, 3, 0);
  assert.equal(affected.length, 1);
  assert.deepEqual(affected[0], range(0, 199, 0, 0));

  resolveConditionalStyle(index, context, 0, 0, "0");
  resolveConditionalStyle(index, context, 0, 1, "1000");
  // Exactly one rescan. A full invalidation would make this 4 — that is the
  // difference between the incremental index and the old full rescan.
  assert.equal(index.metrics.statisticsComputed, 3);

  // The new maximum really did land, so the narrower invalidation is still correct.
  const top = resolveConditionalStyle(index, context, 3, 0, "5000");
  assert.equal(top.background, "#1f6feb");
});

test("the row-band index keeps a cell from being compared against distant rules", () => {
  const context = { rows: Array.from({ length: 400 }, (_, row) => [String(row)]) };
  const rules = Array.from({ length: 6 }, (_, slot) => ({
    id: `band-${slot}`,
    range: range(slot * 64, slot * 64 + 63, 0, 0),
    priority: slot + 1,
    kind: "cell-value",
    operator: "greater-than",
    value: "-1",
    style: GREEN,
  }));
  const index = buildConditionalIndex(rules);

  resolveConditionalStyle(index, context, 0, 0, "0");
  // Only the rule whose band contains row 0 was examined, not all six.
  assert.equal(index.metrics.rulesExamined, 1);

  resolveConditionalStyle(index, context, 300, 0, "300");
  assert.equal(index.metrics.rulesExamined, 2);
});

test("between, blank and duplicate rules cover the everyday office cases", () => {
  const context = sheet();

  const between = buildConditionalIndex([
    { id: "mid", range: range(0, 3, 0, 0), priority: 1, kind: "cell-value", operator: "between", value: "20", value2: "80", style: GREEN },
  ]);
  assert.deepEqual(resolveConditionalStyle(between, context, 0, 0, "10").appliedRuleIds, []);
  assert.deepEqual(resolveConditionalStyle(between, context, 1, 0, "50").appliedRuleIds, ["mid"]);
  assert.deepEqual(resolveConditionalStyle(between, context, 2, 0, "90").appliedRuleIds, []);
  // Bounds are inclusive and order-insensitive.
  assert.deepEqual(resolveConditionalStyle(between, context, 1, 0, "20").appliedRuleIds, ["mid"]);
  assert.deepEqual(resolveConditionalStyle(between, context, 1, 0, "80").appliedRuleIds, ["mid"]);

  const notBetween = buildConditionalIndex([
    { id: "out", range: range(0, 3, 0, 0), priority: 1, kind: "cell-value", operator: "not-between", value: "20", value2: "80", style: GREEN },
  ]);
  assert.deepEqual(resolveConditionalStyle(notBetween, context, 0, 0, "10").appliedRuleIds, ["out"]);
  assert.deepEqual(resolveConditionalStyle(notBetween, context, 1, 0, "50").appliedRuleIds, []);

  const blank = buildConditionalIndex([
    { id: "gap", range: range(0, 3, 0, 0), priority: 1, kind: "blank", operator: "blank", style: RED },
  ]);
  assert.deepEqual(resolveConditionalStyle(blank, context, 3, 0, "").appliedRuleIds, ["gap"]);
  assert.deepEqual(resolveConditionalStyle(blank, context, 0, 0, "10").appliedRuleIds, []);

  const duplicate = buildConditionalIndex([
    { id: "dup", range: range(0, 3, 1, 1), priority: 1, kind: "uniqueness", operator: "duplicate", style: RED },
  ]);
  assert.deepEqual(resolveConditionalStyle(duplicate, context, 2, 1, "重复").appliedRuleIds, ["dup"]);
  assert.deepEqual(resolveConditionalStyle(duplicate, context, 3, 1, "重复").appliedRuleIds, ["dup"]);
  assert.deepEqual(resolveConditionalStyle(duplicate, context, 0, 1, "标题 A").appliedRuleIds, []);

  const unique = buildConditionalIndex([
    { id: "uniq", range: range(0, 3, 1, 1), priority: 1, kind: "uniqueness", operator: "unique", style: GREEN },
  ]);
  assert.deepEqual(resolveConditionalStyle(unique, context, 0, 1, "标题 A").appliedRuleIds, ["uniq"]);
  assert.deepEqual(resolveConditionalStyle(unique, context, 2, 1, "重复").appliedRuleIds, []);
});

test("formula rules are evaluated by W12's engine, including its refusals", () => {
  const context = sheet();
  const index = buildConditionalIndex([
    {
      id: "formula",
      range: range(0, 3, 0, 0),
      priority: 1,
      kind: "formula",
      formula: "=$A1>60",
      style: RED,
    },
  ]);

  // Row 0 → `$A1` (10, no match); row 2 → `$A3` (90, match). The `$` pins the
  // column while the row tracks the cell being painted.
  assert.deepEqual(resolveConditionalStyle(index, context, 0, 0, "10").appliedRuleIds, []);
  assert.deepEqual(resolveConditionalStyle(index, context, 2, 0, "90").appliedRuleIds, ["formula"]);

  // Whitelisted functions work because this is the same evaluator the cells use.
  const withSum = buildConditionalIndex([
    { id: "sum", range: range(0, 0, 0, 0), priority: 1, kind: "formula", formula: "=SUM($A$1:$A$3)>100", style: GREEN },
  ]);
  assert.deepEqual(resolveConditionalStyle(withSum, context, 0, 0, "10").appliedRuleIds, ["sum"]);

  // INDIRECT is on W12's unreachable list. A rule cannot smuggle it in, which
  // is the proof that this path is not a second private parser.
  const smuggled = buildConditionalIndex([
    { id: "bad", range: range(0, 0, 0, 0), priority: 1, kind: "formula", formula: '=INDIRECT("A1")>0', style: RED },
  ]);
  assert.deepEqual(resolveConditionalStyle(smuggled, context, 0, 0, "10").appliedRuleIds, []);
});

test("relative and absolute references translate per cell", () => {
  assert.equal(translateRuleFormula("=$A1>100", 2, 0), "=$A3>100");
  assert.equal(translateRuleFormula("=$A$1>100", 2, 5), "=$A$1>100");
  assert.equal(translateRuleFormula("=A1>100", 1, 1), "=B2>100");
  assert.equal(translateRuleFormula("=A$1>100", 3, 2), "=C$1>100");
  // Quoted text is data, not a reference.
  assert.equal(translateRuleFormula('=A1&"B2"', 1, 0), '=A2&"B2"');
  // A function name that happens to end in letters+digits is left alone.
  assert.equal(translateRuleFormula("=SUM(A1:A2)", 1, 0), "=SUM(A2:A3)");
});

test("data bars, colour scales and icon sets read range-wide statistics", () => {
  const context = { rows: [["0"], ["50"], ["100"], ["-25"]] };

  const bar = buildConditionalIndex([
    { id: "bar", range: range(0, 3, 0, 0), priority: 1, kind: "data-bar", color: "#1f6feb", negativeColor: "#cf222e" },
  ]);
  // min is -25 and max is 100, so 50 sits five eighths of the way along.
  assert.equal(resolveConditionalStyle(bar, context, 1, 0, "50").dataBar.fraction, 0.6);
  assert.equal(resolveConditionalStyle(bar, context, 2, 0, "100").dataBar.fraction, 1);
  assert.equal(resolveConditionalStyle(bar, context, 3, 0, "-25").dataBar.fraction, 0);
  const negative = resolveConditionalStyle(bar, context, 3, 0, "-25").dataBar;
  assert.equal(negative.negative, true);
  assert.equal(negative.color, "#cf222e");

  const scale = buildConditionalIndex([
    { id: "scale", range: range(0, 3, 0, 0), priority: 1, kind: "color-scale", colors: ["#ffffff", "#000000"] },
  ]);
  assert.equal(resolveConditionalStyle(scale, context, 3, 0, "-25").background, "#ffffff");
  assert.equal(resolveConditionalStyle(scale, context, 2, 0, "100").background, "#000000");
  assert.equal(interpolateColorScale(["#ffffff", "#000000"], 0.5), "#808080");
  assert.equal(interpolateColorScale(["#ff0000", "#00ff00", "#0000ff"], 0.5), "#00ff00");

  const icons = buildConditionalIndex([
    { id: "icons", range: range(0, 3, 0, 0), priority: 1, kind: "icon-set", set: "arrows" },
  ]);
  assert.equal(resolveConditionalStyle(icons, context, 3, 0, "-25").icon.glyph, "↓");
  assert.equal(resolveConditionalStyle(icons, context, 2, 0, "100").icon.glyph, "↑");
  // Every icon carries a label; a glyph alone would be unreadable aloud.
  assert.equal(resolveConditionalStyle(icons, context, 2, 0, "100").icon.label, "上升");

  const reversed = buildConditionalIndex([
    { id: "rev", range: range(0, 3, 0, 0), priority: 1, kind: "icon-set", set: "arrows", reverse: true },
  ]);
  assert.equal(resolveConditionalStyle(reversed, context, 2, 0, "100").icon.glyph, "↓");
});

test("the rule manager can list, edit, reorder and delete a single rule", () => {
  const rules = normalizeConditionalRules([
    { id: "a", kind: "cell-value", operator: "greater-than", value: "1", range: range(0, 1, 0, 0), priority: 1, style: RED },
    { id: "b", kind: "text", operator: "contains", value: "x", range: range(0, 1, 1, 1), priority: 2, style: GREEN },
    { id: "c", kind: "blank", operator: "blank", range: range(5, 9, 0, 0), priority: 3, style: RED },
  ]);
  assert.equal(rules.length, 3);

  // List, optionally narrowed to a selection — the old surface could not do this.
  assert.deepEqual(listConditionalRules(rules).map((rule) => rule.id), ["a", "b", "c"]);
  assert.deepEqual(
    listConditionalRules(rules, range(0, 0, 0, 0)).map((rule) => rule.id),
    ["a"],
  );

  // Edit one rule in place without disturbing the others.
  const edited = updateConditionalRule(rules, "a", { value: "42" });
  assert.equal(edited.find((rule) => rule.id === "a").value, "42");
  assert.equal(edited.find((rule) => rule.id === "b").value, "x");

  // Reorder, and confirm priorities are rewritten densely rather than left tied.
  const moved = reorderConditionalRule(rules, "c", "up");
  assert.deepEqual(moved.map((rule) => rule.id), ["a", "c", "b"]);
  assert.deepEqual(moved.map((rule) => rule.priority), [1, 2, 3]);
  assert.deepEqual(
    reorderConditionalRule(rules, "a", "up").map((rule) => rule.id),
    ["a", "b", "c"],
    "moving the first rule up is a no-op",
  );

  // Delete exactly one, not the whole selection.
  const remaining = deleteConditionalRule(rules, "b");
  assert.deepEqual(remaining.map((rule) => rule.id), ["a", "c"]);

  assert.equal(nextConditionalPriority(rules), 4);
  assert.equal(describeConditionalRule(rules[0]), "A1:A2 · 大于 1");
  assert.match(describeConditionalRule({ ...rules[2], stopIfTrue: true }), /停止$/);
});

test("a disabled rule keeps its slot but paints nothing", () => {
  const context = sheet();
  const index = buildConditionalIndex([
    { id: "off", range: range(0, 3, 0, 0), priority: 1, kind: "cell-value", operator: "greater-than", value: "1", style: RED, disabled: true },
  ]);
  assert.deepEqual(resolveConditionalStyle(index, context, 2, 0, "90").appliedRuleIds, []);
  assert.equal(index.rules.length, 1);
});

test("normalization drops what cannot be evaluated and keeps what can", () => {
  const normalized = normalizeConditionalRules([
    { id: "ok", kind: "cell-value", operator: "between", value: "1", value2: "9", range: range(0, 1, 0, 0), priority: 1, style: RED },
    { id: "bad-kind", kind: "telepathy", range: range(0, 1, 0, 0), priority: 2 },
    { id: "bad-operator", kind: "cell-value", operator: "vibes", value: "1", range: range(0, 1, 0, 0), priority: 3 },
    { id: "no-range", kind: "blank", operator: "blank", priority: 4 },
    { id: "empty-formula", kind: "formula", formula: "   ", range: range(0, 1, 0, 0), priority: 5 },
    { id: "one-colour", kind: "color-scale", colors: ["#ffffff"], range: range(0, 1, 0, 0), priority: 6 },
    { id: "bar-no-colour", kind: "data-bar", color: "nope", range: range(0, 1, 0, 0), priority: 7 },
    { id: "icons", kind: "icon-set", set: "traffic", range: range(0, 1, 0, 0), priority: 8 },
  ]);
  assert.deepEqual(normalized.map((rule) => rule.id), ["ok", "icons"]);
  assert.equal(normalized[0].value2, "9");

  // Duplicate ids are made unique instead of silently shadowing each other.
  const collided = normalizeConditionalRules([
    { id: "same", kind: "blank", operator: "blank", range: range(0, 0, 0, 0), priority: 1 },
    { id: "same", kind: "blank", operator: "not-blank", range: range(0, 0, 0, 0), priority: 2 },
  ]);
  assert.equal(new Set(collided.map((rule) => rule.id)).size, 2);
});

test("existing five-operator rules lift into the new shape with no migration", () => {
  const legacy = {
    id: "profit",
    range: range(2, 2, 0, 0),
    operator: "greater-than",
    value: "0",
    color: "#166534",
    background: "#dcfce7",
    bold: true,
  };
  const lifted = fromLegacyConditionalFormat(legacy, 1);
  assert.equal(lifted.kind, "cell-value");
  assert.equal(lifted.operator, "greater-than");
  assert.deepEqual(lifted.style, {
    color: "#166534",
    background: "#dcfce7",
    bold: true,
  });

  const context = { rows: [["1"], ["2"], ["50"]] };
  const paint = resolveConditionalStyle(buildConditionalIndex([lifted]), context, 2, 0, 50);
  assert.equal(paint.background, "#dcfce7");

  // `contains` is a text test, so it lifts to the text kind rather than being
  // wedged into a numeric comparison.
  assert.equal(
    fromLegacyConditionalFormat({ ...legacy, operator: "contains", value: "ab" }, 1).kind,
    "text",
  );
});

test("one shared pass reuses a single formula evaluator across cells", () => {
  const context = sheet();
  const index = buildConditionalIndex([
    { id: "f", range: range(0, 3, 0, 0), priority: 1, kind: "formula", formula: "=$A1>60", style: RED },
  ]);
  const paint = createConditionalPass(context);
  assert.deepEqual(paint(index, 0, 0, "10").appliedRuleIds, []);
  assert.deepEqual(paint(index, 2, 0, "90").appliedRuleIds, ["f"]);
  assert.deepEqual(paint(index, 1, 0, "50").appliedRuleIds, []);
});
