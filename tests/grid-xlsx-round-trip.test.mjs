import assert from "node:assert/strict";
import test from "node:test";

import {
  GridDxfTable,
  buildConditionalFormattingXml,
  buildDataValidationsXml,
  buildSheetRuleXml,
  parseConditionalFormattingXml,
  parseDataValidationsXml,
  parseDxfs,
  parseSheetRuleXml,
  rangeToSqref,
  sqrefToRange,
} from "../src/shell/doc-editors/grid-format/xlsx-round-trip.ts";
import {
  buildGridXlsxParts,
  gridXlsxExportDegradations,
} from "../src/shell/doc-editors/GridWorkbookExport.ts";

const range = (firstRow, lastRow, firstCol, lastCol) => ({
  firstRow,
  lastRow,
  firstCol,
  lastCol,
});

const RED = { color: "#cf222e", background: "#ffebe9", bold: true };
const GREEN = { color: "#1a7f37" };

/** One rule of every kind the engine can emit, so the trip is exercised whole. */
function everyConditionalKind() {
  return [
    {
      id: "over-budget",
      kind: "cell-value",
      range: range(1, 40, 1, 1),
      priority: 1,
      operator: "greater-than",
      value: "100000",
      style: RED,
    },
    {
      id: "in-band",
      kind: "cell-value",
      range: range(1, 40, 2, 2),
      priority: 2,
      operator: "between",
      value: "10",
      value2: "90",
      style: GREEN,
      stopIfTrue: true,
    },
    {
      id: "late",
      kind: "text",
      range: range(1, 40, 3, 3),
      priority: 3,
      operator: "contains",
      value: "延期",
      style: RED,
    },
    {
      id: "unfilled",
      kind: "blank",
      range: range(1, 40, 4, 4),
      priority: 4,
      operator: "blank",
      style: GREEN,
    },
    {
      id: "dupes",
      kind: "uniqueness",
      range: range(1, 40, 5, 5),
      priority: 5,
      operator: "duplicate",
      style: RED,
    },
    {
      id: "ratio",
      kind: "formula",
      range: range(1, 40, 6, 6),
      priority: 6,
      formula: "=$B2>$C2*2",
      style: GREEN,
    },
    {
      id: "bar",
      kind: "data-bar",
      range: range(1, 40, 7, 7),
      priority: 7,
      color: "#638ec6",
    },
    {
      id: "scale",
      kind: "color-scale",
      range: range(1, 40, 8, 8),
      priority: 8,
      colors: ["#f8696b", "#ffeb84", "#63be7b"],
    },
    {
      id: "icons",
      kind: "icon-set",
      range: range(1, 40, 9, 9),
      priority: 9,
      set: "traffic",
    },
  ];
}

/** Every validation kind, including both list forms and both behaviours. */
function everyValidationKind() {
  return [
    {
      id: "grade",
      kind: "list",
      range: range(1, 40, 1, 1),
      source: "高,中,低",
    },
    {
      id: "owner",
      kind: "list",
      range: range(1, 40, 2, 2),
      source: "=Sheet2!$A$1:$A$9",
    },
    {
      id: "count",
      kind: "whole",
      range: range(1, 40, 3, 3),
      operator: "between",
      value: "1",
      value2: "100",
      behavior: "block",
    },
    {
      id: "rate",
      kind: "decimal",
      range: range(1, 40, 4, 4),
      operator: "less-equal",
      value: "1.5",
    },
    {
      id: "due",
      kind: "date",
      range: range(1, 40, 5, 5),
      operator: "between",
      value: "2026-01-01",
      value2: "2026-12-31",
    },
    {
      id: "code",
      kind: "text-length",
      range: range(1, 40, 6, 6),
      operator: "equal",
      value: "8",
      allowBlank: false,
    },
    {
      id: "checked",
      kind: "custom",
      range: range(1, 40, 7, 7),
      formula: "=AND(G2>0,G2<H2)",
      behavior: "block",
      error: "必须落在 0 与 H 列之间",
    },
  ];
}

test("a workbook with no rules costs no bytes at all", () => {
  const dxfs = new GridDxfTable();
  const built = buildSheetRuleXml({}, dxfs);

  // Not `<conditionalFormatting/>`, not `<dataValidations count="0"/>` —
  // the empty string. §8.1 keys a byte floor to this part and the existing
  // `grid-hollow` verdict reads it, so a rule-free workbook has to be
  // byte-identical to one built before the round-trip module existed.
  assert.equal(built.conditionalXml, "");
  assert.equal(built.validationXml, "");
  assert.equal(dxfs.toXml(), "");
  assert.deepEqual([...built.degradations], []);

  assert.equal(buildConditionalFormattingXml([], dxfs).xml, "");
  assert.equal(buildDataValidationsXml([]).xml, "");
});

test("conditional rules survive the trip: count and semantics both", () => {
  const dxfs = new GridDxfTable();
  const rules = everyConditionalKind();
  const emitted = buildConditionalFormattingXml(rules, dxfs);
  const back = parseConditionalFormattingXml(
    emitted.xml,
    parseDxfs(`<styleSheet>${dxfs.toXml()}</styleSheet>`),
  );

  assert.equal(back.length, rules.length, "规则数量必须不变");
  assert.deepEqual(
    back.map((rule) => rule.kind),
    rules.map((rule) => rule.kind),
  );
  assert.deepEqual(
    back.map((rule) => rule.priority),
    rules.map((rule) => rule.priority),
  );
  assert.deepEqual(
    back.map((rule) => rule.range),
    rules.map((rule) => rule.range),
  );

  const overBudget = back[0];
  assert.equal(overBudget.operator, "greater-than");
  assert.equal(overBudget.value, "100000");
  assert.deepEqual(overBudget.style, RED);

  // `between` carries two bounds; losing the second silently widens the rule.
  const band = back[1];
  assert.equal(band.operator, "between");
  assert.equal(band.value, "10");
  assert.equal(band.value2, "90");
  assert.equal(band.stopIfTrue, true, "「符合此条件时停止」必须活着回来");

  assert.equal(back[2].value, "延期", "非 ASCII 文本必须原样回来");
  assert.equal(back[3].operator, "blank");
  assert.equal(back[4].operator, "duplicate");
  assert.equal(back[5].formula, "=$B2>$C2*2", "公式的 $ 锚定不许被改写");
  assert.equal(back[7].colors.length, 3);
  assert.equal(back[8].set, "traffic");
});

test("data validations survive the trip, including block vs warn", () => {
  const rules = everyValidationKind();
  const back = parseDataValidationsXml(buildDataValidationsXml(rules).xml);

  assert.equal(back.length, rules.length, "验证条数必须不变");
  assert.deepEqual(
    back.map((rule) => rule.kind),
    rules.map((rule) => rule.kind),
  );

  assert.equal(back[0].source, "高,中,低", "字面量列表回来时不带引号");
  assert.equal(back[1].source, "=Sheet2!$A$1:$A$9", "区域引用保留前导 =");
  assert.equal(back[2].behavior, "block", "「阻止」必须活着回来");
  assert.equal(back[2].value, "1");
  assert.equal(back[2].value2, "100");

  // `warn` is the default, so it is expressed by absence rather than by the
  // word — asserting the effective behaviour, not the key.
  assert.notEqual(back[3].behavior, "block", "没写「阻止」的就得是警告");
  assert.equal(back[4].value2, "2026-12-31");
  assert.equal(back[5].allowBlank, false);
  assert.equal(back[6].formula, "=AND(G2>0,G2<H2)");
  assert.equal(back[6].error, "必须落在 0 与 H 列之间");
});

test("both families ride in one worksheet in the order CT_Worksheet demands", () => {
  const dxfs = new GridDxfTable();
  const built = buildSheetRuleXml(
    {
      conditionalRules: everyConditionalKind(),
      dataValidations: everyValidationKind(),
    },
    dxfs,
  );
  // The splice order in `worksheetXml`: sheetData, conditionalFormatting,
  // dataValidations. Excel offers to repair a file whose worksheet children
  // are out of schema order, so this is a correctness assertion, not style.
  const worksheet = `<worksheet><sheetData/>${built.conditionalXml}${built.validationXml}</worksheet>`;
  assert.ok(
    worksheet.indexOf("</sheetData>") < worksheet.indexOf("<conditionalFormatting") ||
      worksheet.indexOf("<sheetData/>") < worksheet.indexOf("<conditionalFormatting"),
  );
  assert.ok(
    worksheet.indexOf("<conditionalFormatting") < worksheet.indexOf("<dataValidations"),
    "conditionalFormatting 必须排在 dataValidations 之前",
  );

  const back = parseSheetRuleXml(
    worksheet,
    parseDxfs(`<styleSheet>${dxfs.toXml()}</styleSheet>`),
  );
  assert.equal(back.conditionalRules.length, 9);
  assert.equal(back.dataValidations.length, 7);
});

test("identical colours are pooled into one dxf, and dxfId indexes that table", () => {
  const dxfs = new GridDxfTable();
  const rules = [
    { id: "a", kind: "cell-value", range: range(0, 9, 0, 0), priority: 1, operator: "greater-than", value: "1", style: RED },
    { id: "b", kind: "cell-value", range: range(0, 9, 1, 1), priority: 2, operator: "greater-than", value: "2", style: RED },
    { id: "c", kind: "cell-value", range: range(0, 9, 2, 2), priority: 3, operator: "greater-than", value: "3", style: GREEN },
  ];
  const emitted = buildConditionalFormattingXml(rules, dxfs);

  assert.equal(dxfs.length, 2, "两条同色规则只该占一条 dxf 记录");
  const ids = [...emitted.xml.matchAll(/dxfId="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(ids, [0, 0, 1]);
  for (const id of ids) {
    assert.ok(id < dxfs.length, `dxfId ${id} 必须落在 dxfs 表内`);
  }

  // A dxf paints through `bgColor`; `fgColor` is the pattern foreground and
  // renders nothing under a solid fill, which is how a rule ends up accepted
  // by Excel and visibly doing nothing.
  assert.match(dxfs.toXml(), /<bgColor rgb="FFFFEBE9"\/>/);
  assert.doesNotMatch(dxfs.toXml(), /<fgColor/);
});

test("nothing is dropped in silence: every unsupported bit is reported by rule id", () => {
  const dxfs = new GridDxfTable();
  const emitted = buildConditionalFormattingXml(
    [
      { id: "off", kind: "cell-value", range: range(0, 9, 0, 0), priority: 1, operator: "equal", value: "1", style: RED, disabled: true },
      { id: "tri", kind: "icon-set", range: range(0, 9, 1, 1), priority: 2, set: "triangles" },
      { id: "rev", kind: "icon-set", range: range(0, 9, 2, 2), priority: 3, set: "arrows", reverse: true },
      { id: "neg", kind: "data-bar", range: range(0, 9, 3, 3), priority: 4, color: "#638ec6", negativeColor: "#cf222e" },
    ],
    dxfs,
  );
  const reported = emitted.degradations.map((entry) => entry.ruleId);
  assert.deepEqual(reported.sort(), ["neg", "off", "rev", "tri"]);
  for (const entry of emitted.degradations) {
    assert.ok(entry.message.length > 10, `${entry.ruleId} 的降级说明必须讲清丢了什么`);
  }

  // A disabled rule is the one case where the rule itself does not travel:
  // SpreadsheetML has no "off" bit, so writing it would turn it back on.
  assert.doesNotMatch(emitted.xml, /priority="1"/);

  const listCase = buildDataValidationsXml([
    { id: "ci", kind: "list", range: range(0, 9, 0, 0), source: "甲,乙", ignoreCase: true },
  ]);
  assert.deepEqual(
    listCase.degradations.map((entry) => entry.ruleId),
    ["ci"],
  );
});

test("an unknown icon set is never written: Excel repairs the file instead of reading it", () => {
  const dxfs = new GridDxfTable();
  const emitted = buildConditionalFormattingXml(
    [{ id: "tri", kind: "icon-set", range: range(0, 9, 0, 0), priority: 1, set: "triangles" }],
    dxfs,
  );
  // Degraded to a set the base namespace names, not passed through verbatim.
  assert.match(emitted.xml, /iconSet="3Arrows"/);
  assert.doesNotMatch(emitted.xml, /iconSet="3Triangles"/i);
});

test("sqref survives both ways, and a multi-area sqref does not become a bogus rectangle", () => {
  assert.equal(rangeToSqref(range(0, 0, 0, 0)), "A1");
  assert.equal(rangeToSqref(range(0, 9, 0, 1)), "A1:B10");
  assert.equal(rangeToSqref(range(1, 50, 27, 27)), "AB2:AB51");
  assert.deepEqual(sqrefToRange("AB2:AB51"), range(1, 50, 27, 27));
  assert.deepEqual(sqrefToRange("$C$2:$C$51"), range(1, 50, 2, 2));
  // Reversed corners are legal in the wild and must normalise, not invert.
  assert.deepEqual(sqrefToRange("B10:A1"), range(0, 9, 0, 1));
  assert.deepEqual(sqrefToRange("A1:A9 C1:C9"), range(0, 8, 0, 0));
  assert.equal(sqrefToRange("not-a-ref"), null);
});

/* ------------------------- the packaged workbook ------------------------- */

function irProject(sheetRules) {
  return {
    schema: "oceanleo.grid.v1",
    version: 1,
    title: "W13 往返判据",
    sheets: [
      {
        name: "明细",
        headerRow: true,
        columns: [
          { name: "科目", type: "text", widthPx: 160 },
          { name: "金额", type: "currency", widthPx: 120, precision: 2 },
        ],
        rows: [
          ["华东", 120000],
          ["华北", 80000],
        ],
        ...sheetRules,
      },
    ],
    attribution: { entries: [] },
  };
}

test("styles.xml carries the dxfs the worksheets address, and omits the block otherwise", () => {
  const plain = buildGridXlsxParts(irProject({}));
  const plainStyles = plain.find((part) => part.name === "xl/styles.xml").data;
  assert.doesNotMatch(plainStyles, /<dxfs/, "没有规则时 styles.xml 不该多一个字节");
  for (const part of plain.filter((entry) => entry.name.startsWith("xl/worksheets/"))) {
    assert.doesNotMatch(part.data, /<conditionalFormatting/);
    assert.doesNotMatch(part.data, /<dataValidations/);
  }

  const ruled = buildGridXlsxParts(
    irProject({
      conditionalRules: [
        { id: "hot", kind: "cell-value", range: range(1, 2, 1, 1), priority: 1, operator: "greater-than", value: "100000", style: RED },
      ],
      dataValidations: [
        { id: "grade", kind: "list", range: range(1, 2, 0, 0), source: "华东,华北" },
      ],
    }),
  );
  const styles = ruled.find((part) => part.name === "xl/styles.xml").data;
  const sheet = ruled.find((part) => part.name === "xl/worksheets/sheet1.xml").data;

  // The defect this pins: worksheets interned their styles into a throwaway
  // table while styles.xml was written from an empty one, so `dxfId="0"`
  // addressed a `<dxfs>` block that was never emitted.
  const used = [...sheet.matchAll(/dxfId="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(used.length > 0, "规则应当引用了 dxf");
  const declared = parseDxfs(styles);
  assert.ok(declared.length > 0, "styles.xml 必须真的写出 <dxfs>");
  for (const id of used) {
    assert.ok(id < declared.length, `worksheet 的 dxfId ${id} 在 styles.xml 里必须有对应记录`);
  }
  assert.deepEqual(declared[used[0]], RED, "指过去的那条 dxf 得是这条规则的颜色");

  // Order inside the worksheet part, as shipped.
  assert.ok(sheet.indexOf("</sheetData>") < sheet.indexOf("<conditionalFormatting"));
  assert.ok(sheet.indexOf("<conditionalFormatting") < sheet.indexOf("<dataValidations"));

  const back = parseSheetRuleXml(sheet, declared);
  assert.equal(back.conditionalRules.length, 1);
  assert.equal(back.dataValidations.length, 1);
  assert.equal(back.dataValidations[0].source, "华东,华北");
});

test("degradations reach the caller from the packaged path too", () => {
  const reported = gridXlsxExportDegradations(
    irProject({
      conditionalRules: [
        { id: "tri", kind: "icon-set", range: range(1, 2, 1, 1), priority: 1, set: "triangles" },
      ],
    }),
  );
  assert.deepEqual(
    reported.map((entry) => entry.ruleId),
    ["tri"],
  );
});
