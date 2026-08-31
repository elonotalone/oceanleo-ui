/**
 * P5 的接线判据：工具栏与三个引擎之间那几个决定。
 *
 * 引擎本身的语义由 grid-number-format / grid-conditional-format /
 * grid-data-validation 三份测试锁住；这一份只锁「工具栏按下去之后发生了什么」——
 * 预设选中哪个格式串、规则列表列出了什么、验证草稿变成什么规则、检查报了几个。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  NUMFMT_MAX_LENGTH,
  conditionalRuleOptions,
  conditionalRulesFromSheet,
  describeValidationDraft,
  numberFormatPatternForPreset,
  numberFormatPresetId,
  numberFormatPreview,
  runValidationCheck,
  validationNeedsSecondBound,
  validationRuleFromDraft,
} from "../src/shell/doc-editors/grid-format/toolbar-bridge.ts";
import { NUMBER_FORMAT_PRESETS } from "../src/shell/doc-editors/grid-format/number-format.ts";

const RANGE = { firstRow: 0, lastRow: 4, firstCol: 1, lastCol: 1 };

function draft(patch = {}) {
  return {
    kind: "list",
    operator: "between",
    value: "",
    value2: "",
    behavior: "warn",
    ...patch,
  };
}

test("每个预设都能被自己的格式串认回来，手写串报 custom 而不是最近的预设", () => {
  for (const preset of NUMBER_FORMAT_PRESETS) {
    assert.equal(
      numberFormatPresetId(preset.pattern),
      preset.id,
      `${preset.id} 的格式串应认回 ${preset.id}`,
    );
  }
  // 空 = 常规；General 也是常规，不是自定义。
  assert.equal(numberFormatPresetId(""), "general");
  assert.equal(numberFormatPresetId("  "), "general");
  assert.equal(numberFormatPresetId("General"), "general");
  // 与 #,##0.00 只差一位，绝不许被归到 decimal2 名下。
  assert.equal(numberFormatPresetId("#,##0.000"), "custom");
  assert.equal(numberFormatPresetId("yyyy/mm/dd"), "custom");
});

test("预设选中的是它自己的格式串，常规选中的是「清空」而不是字面量 General", () => {
  assert.equal(numberFormatPatternForPreset("general"), "");
  assert.equal(numberFormatPatternForPreset("accounting"), "#,##0.00_);[Red](#,##0.00)");
  assert.equal(numberFormatPatternForPreset("date-cn"), "yyyy年m月d日 aaaa");
  // custom 不是预设：它的意思是「别动格式串输入框」，必须返回 null 让接线跳过。
  assert.equal(numberFormatPatternForPreset("custom"), null);
  assert.equal(numberFormatPatternForPreset("不存在的预设"), null);
});

test("预览用的是引擎本身，负数括号与中文星期都能在应用前看见", () => {
  assert.equal(
    numberFormatPreview("-1234.5", "#,##0.00_);[Red](#,##0.00)"),
    "(1,234.50)",
  );
  assert.equal(numberFormatPreview("0.1235", "0.00%"), "12.35%");
  assert.equal(numberFormatPreview("2026-08-31", "yyyy年m月d日 aaaa"), "2026年8月31日 星期一");
  // 空格式串没有预览可言，不是错误。
  assert.equal(numberFormatPreview("123", ""), "");
  // 单元格为空时用样值，输入框不会空着让人猜。
  assert.notEqual(numberFormatPreview("", "#,##0.00"), "");
});

test("半截格式串只让预览变空，不许抛出去打断正在打字的人", () => {
  for (const halfTyped of ['"', "[", "[Red", "0.00;", "yyyy-mm-dd;;;;"]) {
    assert.doesNotThrow(
      () => numberFormatPreview("1", halfTyped),
      `半截格式串 ${JSON.stringify(halfTyped)} 不许抛`,
    );
  }
});

test("规则列表把存量五运算符规则逐条列出来，并带上区域与条件", () => {
  const stored = [
    {
      id: "rule-a",
      range: { firstRow: 0, lastRow: 9, firstCol: 0, lastCol: 0 },
      operator: "greater-than",
      value: "100",
      background: "#dcfce7",
    },
    {
      id: "rule-b",
      range: { firstRow: 2, lastRow: 2, firstCol: 1, lastCol: 3 },
      operator: "contains",
      value: "退款",
      color: "#b91c1c",
    },
  ];
  const rules = conditionalRulesFromSheet(stored);
  assert.equal(rules.length, 2);
  // 优先级按数组位次密集赋值，列表顺序即生效顺序。
  assert.deepEqual(
    rules.map((rule) => rule.priority),
    [1, 2],
  );
  assert.equal(rules[0].kind, "cell-value");
  assert.equal(rules[1].kind, "text");

  const options = conditionalRuleOptions(rules, "新建规则");
  assert.equal(options.length, 3, "两条规则 + 一个新建项");
  assert.equal(options[0].value, "");
  assert.match(options[0].label, /新建规则 · 2/);
  // 「无法列出」正是 J2 记的那条缺口：这里必须看得见区域和条件。
  assert.equal(options[1].value, "rule-a");
  assert.match(options[1].label, /A1:A10/);
  assert.match(options[1].label, /大于 100/);
  assert.match(options[2].label, /B3:D3/);
  assert.match(options[2].label, /包含 退款/);

  // 一条规则都没有时不显示计数，避免出现「新建规则 · 0」。
  assert.equal(conditionalRuleOptions([], "新建规则")[0].label, "新建规则");
});

test("验证草稿：值没填就不成规则，成规则时类型逐个对上", () => {
  assert.equal(validationRuleFromDraft(draft(), RANGE), null);
  assert.equal(validationRuleFromDraft(draft({ value: "   " }), RANGE), null);

  const list = validationRuleFromDraft(draft({ value: "甲,乙,丙" }), RANGE);
  assert.equal(list.kind, "list");
  assert.equal(list.source, "甲,乙,丙");
  assert.deepEqual(list.range, RANGE);
  assert.equal(list.behavior, "warn", "默认警告，不是阻止");

  const whole = validationRuleFromDraft(
    draft({ kind: "whole", value: "1", value2: "100", behavior: "block" }),
    RANGE,
  );
  assert.equal(whole.kind, "whole");
  assert.equal(whole.operator, "between");
  assert.equal(whole.value2, "100");
  assert.equal(whole.behavior, "block");

  const date = validationRuleFromDraft(
    draft({ kind: "date", operator: "greater-than", value: "2026-01-01" }),
    RANGE,
  );
  assert.equal(date.kind, "date");

  const custom = validationRuleFromDraft(
    draft({ kind: "custom", value: "=B1>0" }),
    RANGE,
  );
  assert.equal(custom.kind, "custom");
  assert.equal(custom.formula, "=B1>0");
  assert.equal(custom.operator, undefined, "自定义公式没有比较运算符");

  const length = validationRuleFromDraft(
    draft({ kind: "text-length", operator: "less-equal", value: "8" }),
    RANGE,
  );
  assert.equal(length.kind, "text-length");
});

test("只有 between / not-between 读第二个界，列表与公式一概不读", () => {
  assert.equal(validationNeedsSecondBound(draft({ kind: "whole" })), true);
  assert.equal(
    validationNeedsSecondBound(draft({ kind: "decimal", operator: "not-between" })),
    true,
  );
  assert.equal(
    validationNeedsSecondBound(draft({ kind: "whole", operator: "greater-than" })),
    false,
  );
  assert.equal(validationNeedsSecondBound(draft({ kind: "list" })), false);
  assert.equal(validationNeedsSecondBound(draft({ kind: "custom" })), false);
});

test("圈出无效数据：报的是个数、第一个的地址和原因，全合格时说全合格", () => {
  const rows = [
    ["名称", "数量"],
    ["甲", "5"],
    ["乙", "500"],
    ["丙", ""],
    ["丁", "abc"],
  ];
  const rule = validationRuleFromDraft(
    draft({ kind: "whole", operator: "between", value: "1", value2: "100" }),
    { firstRow: 1, lastRow: 4, firstCol: 1, lastCol: 1 },
  );
  const check = runValidationCheck(rule, { rows }, "所选区域全部符合");
  // 500 越界、abc 不是整数；空单元格默认不算错（allowBlank）。
  assert.equal(check.invalid.length, 2);
  assert.deepEqual(
    check.invalid.map((cell) => `${cell.row}:${cell.col}`),
    ["2:1", "4:1"],
  );
  assert.match(check.report, /^2 · B3 · /, "先说几个，再说第一个在哪");

  const clean = runValidationCheck(
    validationRuleFromDraft(
      draft({ kind: "whole", operator: "between", value: "1", value2: "1000" }),
      { firstRow: 1, lastRow: 3, firstCol: 1, lastCol: 1 },
    ),
    { rows },
    "所选区域全部符合",
  );
  assert.equal(clean.invalid.length, 0);
  assert.equal(clean.report, "所选区域全部符合");

  // 没成规则就什么都不报——不许把「还没填完」说成「全合格」。
  const empty = runValidationCheck(null, { rows }, "所选区域全部符合");
  assert.equal(empty.report, "");
  assert.equal(empty.invalid.length, 0);
});

test("跨表候选：=Sheet2!A1:A3 的下拉在工作簿上下文里解析，不是被拒", () => {
  const rows = [["城市"], ["杭州"], ["火星"]];
  const rule = validationRuleFromDraft(
    draft({ value: "=清单!A1:A3" }),
    { firstRow: 1, lastRow: 2, firstCol: 0, lastCol: 0 },
  );
  const check = runValidationCheck(
    rule,
    {
      rows,
      sheetName: "主表",
      workbook: { 主表: rows, 清单: [["杭州"], ["宁波"], ["温州"]] },
    },
    "所选区域全部符合",
  );
  assert.equal(check.invalid.length, 1, "只有「火星」不在候选里");
  assert.match(check.report, /^1 · A3 · /);
});

test("草稿的说明在跑检查之前就能读懂，且没成规则时不硬编一句假话", () => {
  assert.equal(describeValidationDraft(null), "");
  const described = describeValidationDraft(
    validationRuleFromDraft(
      draft({ kind: "whole", operator: "between", value: "1", value2: "100" }),
      RANGE,
    ),
  );
  assert.match(described, /1/);
  assert.match(described, /100/);
});

test("格式串长度按 Excel 的 formatCode 上限钳位", () => {
  assert.equal(NUMFMT_MAX_LENGTH, 255);
});
