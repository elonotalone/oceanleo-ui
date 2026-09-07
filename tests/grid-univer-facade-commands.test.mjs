/**
 * W03 判据 2 —— 「一个命令一个执行器」的覆盖闸 + 两处上游语义陷阱 + 执行器行为。
 *
 * 覆盖闸原来的形状：把 `GridContextToolbar.tsx` 里真实声明的控件 id 全扫出来，
 * 逐个要求命令表里有一行。2026-09-07 `core-swap:delete grid` 把旧核连同那张工具条
 * 一起删了，扫源码没有对象可扫；这里改成**冻结在删除那一刻的清单**
 * （`git show 2a4f7d9:src/shell/doc-editors/GridContextToolbar.tsx` 抓出的 38 个 id）：
 * 它锁的是「换核不许丢能力」——旧表格用户能按到的每个控件，Univer 下都必须有执行器。
 * 新增控件不经这张表（`gridUniverSelectionContext` 直接从 `GRID_UNIVER_COMMANDS` 出），
 * 所以它不会静默过期，只会在有人删命令时红。
 *
 * ⚠️ agent 面那条仍判 `HEAD` 而不是工作树（`_COMMON.md` §7b⑪b/⑪）：共享树上挂着
 * 同事的在途改动，照工作树扫会把半成品当成已入库。清单类判据一律用 `git show HEAD:<path>`。
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
  GRID_UNIVER_COMMANDS,
  buildGridValidationRule,
  gridConditionalDraft,
  gridFacadeAlignment,
  gridTypePattern,
  gridUniverCommand,
  runGridUniverCommand,
} from "../src/shell/doc-editors/grid-univer/facade-commands.ts";

const AGENT_SURFACE = "src/shell/doc-editors/doc-family-commands.ts";

/** 旧核工具条（已删）在最后一个含它的 commit 上声明的全部控件 id，逐字冻结。 */
const LEGACY_TOOLBAR_CONTROL_IDS = [
  "type", "bold", "align", "color", "background", "decimals",
  "numfmt-preset", "numfmt-pattern", "numfmt-preview",
  "row-before", "row-after", "row-delete",
  "column-before", "column-after", "column-delete",
  "sort-asc", "sort-desc", "header-row", "filter-query",
  "merge-cells", "split-cells",
  "condition-rule", "condition-rule-detail", "condition-operator", "condition-value",
  "condition-color", "condition-background", "condition-bold",
  "condition-apply", "condition-clear",
  "validation-kind", "validation-operator", "validation-value", "validation-value2",
  "validation-behavior", "validation-check", "validation-report",
];

function headSource(path) {
  return execFileSync("git", ["show", `HEAD:${path}`], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

// ── 先验正则本身（`_COMMON.md` §6/§7b③：零命中是最贵的一类断言）─────────────

test("自检：冻结清单本身没缩水，旧核工具条源码已不在 HEAD 上", () => {
  assert.ok(LEGACY_TOOLBAR_CONTROL_IDS.includes("bold"));
  assert.ok(LEGACY_TOOLBAR_CONTROL_IDS.length >= 30, "清单被人删短了");
  assert.equal(new Set(LEGACY_TOOLBAR_CONTROL_IDS).size, LEGACY_TOOLBAR_CONTROL_IDS.length);
  assert.throws(
    () => headSource("src/shell/doc-editors/GridContextToolbar.tsx"),
    "旧核工具条回来了？core-swap:delete grid 之后它不该在 HEAD 上",
  );
});

test("判据 2：旧核用户按得到的每一个控件，Univer 下都有一行命令，一个都不许漏", () => {
  const ids = LEGACY_TOOLBAR_CONTROL_IDS;
  const missing = ids.filter((id) => !gridUniverCommand(id));
  assert.deepEqual(
    missing,
    [],
    `这些控件在新核下没有执行器，用户按下去会没反应：${missing.join(", ")}`,
  );
});

test("判据 2：agent 面那批 grid.* 命令 id 换核后同名同义", () => {
  const source = headSource(AGENT_SURFACE);
  const agentIds = [
    ...new Set([...source.matchAll(/"(grid\.[a-z-]+)"/g)].map((m) => m[1])),
  ];
  assert.ok(agentIds.length >= 9, `只扫到 ${agentIds.length} 条 grid.* 命令`);
  const missing = agentIds.filter((id) => !gridUniverCommand(id));
  assert.deepEqual(missing, [], `agent 调不到：${missing.join(", ")}`);
});

test("每条命令要么有执行器，要么写明它去哪儿了——没有第三种", () => {
  for (const command of GRID_UNIVER_COMMANDS) {
    if (command.run) continue;
    assert.ok(
      command.delegatedTo && command.delegatedTo.length > 0,
      `${command.id} 既没有执行器也没写去处`,
    );
    assert.ok(
      command.layer === "shell" || command.layer === "draft",
      `${command.id} 没有执行器却声明成 ${command.layer} 层`,
    );
  }
});

test("命令 id 不重复——重复等于后一条静默盖掉前一条", () => {
  const ids = GRID_UNIVER_COMMANDS.map((command) => command.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ── 上游语义陷阱 ────────────────────────────────────────────────────────────

test("陷阱一：我们的「右对齐」在 Facade 里叫 normal（取值里没有 right）", () => {
  assert.equal(gridFacadeAlignment("right"), "normal");
  assert.equal(gridFacadeAlignment("left"), "left");
  assert.equal(gridFacadeAlignment("center"), "center");
});

test("陷阱二：auto 类型没有格式串对应位，返回空串而不是编一个 General", () => {
  assert.equal(gridTypePattern("auto"), "");
  assert.equal(gridTypePattern(undefined), "");
  assert.equal(gridTypePattern("text"), "@");
  assert.equal(gridTypePattern("number", 2), "#,##0.00");
  assert.equal(gridTypePattern("percent", 1), "0.0%");
  assert.equal(gridTypePattern("date"), "yyyy-mm-dd");
  // 货币不给小数位时仍要两位——钱不写小数位是错的。
  assert.equal(gridTypePattern("currency"), "¥#,##0.00");
  // 小数位钳到 10：格式串里放 40 个 0 是 Excel 拒收的。
  assert.equal(gridTypePattern("number", 40), `#,##0.${"0".repeat(10)}`);
});

// ── 执行器行为（假端口，逐条验它到底调了什么）────────────────────────────────

function recordingPort(overrides = {}) {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push([name, ...args]);
    return `${name}-ok`;
  };
  const filter = {
    setColumnFilterCriteria: record("filter.setCriteria"),
    removeColumnFilterCriteria: record("filter.removeCriteria"),
    remove: record("filter.remove"),
  };
  const conditionalBuilder = {};
  for (const name of [
    "whenNumberGreaterThan",
    "whenNumberLessThan",
    "whenNumberEqualTo",
    "whenNumberNotEqualTo",
    "whenTextContains",
    "setFontColor",
    "setBackground",
    "setBold",
    "setRanges",
  ]) {
    conditionalBuilder[name] = (...args) => {
      calls.push([`cf.${name}`, ...args]);
      return conditionalBuilder;
    };
  }
  conditionalBuilder.build = record("cf.build");

  const validationBuilder = {};
  for (const name of [
    "requireValueInList",
    "requireNumberBetween",
    "requireNumberNotBetween",
    "requireNumberEqualTo",
    "requireNumberNotEqualTo",
    "requireNumberGreaterThan",
    "requireNumberLessThan",
    "requireNumberGreaterThanOrEqualTo",
    "requireNumberLessThanOrEqualTo",
    "requireDateBetween",
    "requireDateNotBetween",
    "requireDateEqualTo",
    "requireDateAfter",
    "requireDateBefore",
    "requireDateOnOrAfter",
    "requireDateOnOrBefore",
    "requireFormulaSatisfied",
    "setAllowInvalid",
  ]) {
    validationBuilder[name] = (...args) => {
      calls.push([`dv.${name}`, ...args]);
      return validationBuilder;
    };
  }
  validationBuilder.build = record("dv.build");

  const range = {
    setValue: record("range.setValue"),
    getValue: () => "cell-value",
    setFontWeight: record("range.setFontWeight"),
    setFontColor: record("range.setFontColor"),
    setBackgroundColor: record("range.setBackgroundColor"),
    setHorizontalAlignment: record("range.setHorizontalAlignment"),
    setNumberFormat: record("range.setNumberFormat"),
    merge: record("range.merge"),
    breakApart: record("range.breakApart"),
    createFilter: () => {
      calls.push(["range.createFilter"]);
      return filter;
    },
    getFilter: () => (overrides.hasFilter ? filter : null),
    createConditionalFormattingRule: () => {
      calls.push(["range.createConditionalFormattingRule"]);
      return conditionalBuilder;
    },
    getConditionalFormattingRules: () => [],
    clearConditionalFormatRules: record("range.clearConditionalFormatRules"),
    setDataValidation: record("range.setDataValidation"),
    getDataValidation: () => null,
    getValidatorStatus: async () => "status",
  };
  const sheet = {
    getSheetId: () => "sheet-1",
    getSheetName: () => "Sheet1",
    getRange: (...args) => {
      calls.push(["sheet.getRange", ...args]);
      return range;
    },
    insertRowsBefore: record("sheet.insertRowsBefore"),
    insertRowsAfter: record("sheet.insertRowsAfter"),
    deleteRows: record("sheet.deleteRows"),
    insertColumnsBefore: record("sheet.insertColumnsBefore"),
    insertColumnsAfter: record("sheet.insertColumnsAfter"),
    deleteColumns: record("sheet.deleteColumns"),
    sort: record("sheet.sort"),
  };
  return {
    calls,
    port: {
      api: { newDataValidation: () => validationBuilder },
      workbook: {
        getActiveSheet: () => sheet,
        insertSheet: record("workbook.insertSheet"),
        undo: record("workbook.undo"),
        redo: record("workbook.redo"),
      },
      sheet,
      range,
      selection: {
        startRow: 2,
        endRow: 4,
        startColumn: 1,
        endColumn: 3,
        ...(overrides.selection || {}),
      },
    },
  };
}

test("L1 粗体/对齐/颜色落到对应的 Facade 方法，右对齐经过翻译", () => {
  const { calls, port } = recordingPort();
  runGridUniverCommand("bold", port, {});
  runGridUniverCommand("bold", port, { on: false });
  runGridUniverCommand("align", port, { value: "right" });
  runGridUniverCommand("color", port, { value: "#ff0000" });
  runGridUniverCommand("background", port, { value: "#00ff00" });
  assert.deepEqual(calls, [
    ["range.setFontWeight", "bold"],
    ["range.setFontWeight", "normal"],
    ["range.setHorizontalAlignment", "normal"],
    ["range.setFontColor", "#ff0000"],
    ["range.setBackgroundColor", "#00ff00"],
  ]);
});

test("非法对齐值不递给 Facade——上游 default 分支是 throw", () => {
  const { calls, port } = recordingPort();
  const outcome = runGridUniverCommand("align", port, { value: "justify" });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.result, null);
  assert.deepEqual(calls, []);
});

test("行列结构命令按选区跨度算数量，不是一次一行", () => {
  const { calls, port } = recordingPort();
  runGridUniverCommand("row-before", port, {});
  runGridUniverCommand("row-after", port, {});
  runGridUniverCommand("row-delete", port, {});
  runGridUniverCommand("column-before", port, {});
  runGridUniverCommand("column-delete", port, {});
  // 选区 2..4 行 = 3 行，1..3 列 = 3 列。
  assert.deepEqual(calls, [
    ["sheet.insertRowsBefore", 2, 3],
    ["sheet.insertRowsAfter", 4, 3],
    ["sheet.deleteRows", 2, 3],
    ["sheet.insertColumnsBefore", 1, 3],
    ["sheet.deleteColumns", 1, 3],
  ]);
});

test("「首行为表头」关掉时移除筛选器，而不是留一个空壳", () => {
  const withFilter = recordingPort({ hasFilter: true });
  runGridUniverCommand("header-row", withFilter.port, { on: false });
  assert.deepEqual(withFilter.calls, [["filter.remove"]]);

  const without = recordingPort({ hasFilter: false });
  runGridUniverCommand("header-row", without.port, { on: false });
  // 本来就没有筛选器，关掉是无事发生，不该去建一个再删。
  assert.deepEqual(without.calls, []);
});

test("筛选：空查询是「清掉这一列的条件」，不是「筛选空字符串」", () => {
  const { calls, port } = recordingPort({ hasFilter: true });
  runGridUniverCommand("filter-query", port, { column: 2, value: "" });
  assert.deepEqual(calls, [["filter.removeCriteria", 2]]);
});

test("筛选：有查询时按列下条件，colId 与 column 一致", () => {
  const { calls, port } = recordingPort({ hasFilter: true });
  runGridUniverCommand("filter-query", port, { column: 2, value: "北京" });
  assert.deepEqual(calls, [
    ["filter.setCriteria", 2, { colId: 2, filters: { filters: ["北京"] } }],
  ]);
});

test("条件格式：五个操作符各自落到对应的 when* 上，样式与选区一起进 build", () => {
  const { calls, port } = recordingPort();
  runGridUniverCommand("condition-apply", port, {
    operator: "greater-than",
    value: "100",
    color: "#166534",
    background: "#dcfce7",
    bold: true,
  });
  assert.deepEqual(calls, [
    ["range.createConditionalFormattingRule"],
    ["cf.whenNumberGreaterThan", 100],
    ["cf.setFontColor", "#166534"],
    ["cf.setBackground", "#dcfce7"],
    ["cf.setBold", true],
    [
      "cf.setRanges",
      [{ startRow: 2, endRow: 4, startColumn: 1, endColumn: 3 }],
    ],
    ["cf.build"],
  ]);
});

test("条件格式：包含文字走文本操作符，不要求比较值是数字", () => {
  const { calls, port } = recordingPort();
  runGridUniverCommand("condition-apply", port, {
    operator: "contains",
    value: "逾期",
    bold: false,
  });
  assert.deepEqual(calls[1], ["cf.whenTextContains", "逾期"]);
  assert.deepEqual(calls.at(-1), ["cf.build"]);
});

test("条件格式：数字操作符拿不到数就不建规则（不把「abc」当 0）", () => {
  const { calls, port } = recordingPort();
  const outcome = runGridUniverCommand("condition-apply", port, {
    operator: "greater-than",
    value: "abc",
  });
  assert.equal(outcome.result, null);
  assert.deepEqual(calls, []);
});

test("条件格式草稿：空比较值不成立——用户还没填不等于「> 0」", () => {
  assert.equal(gridConditionalDraft({ operator: "equal", value: "  " }), null);
  assert.equal(gridConditionalDraft({ operator: "nope", value: "1" }), null);
  const draft = gridConditionalDraft({ operator: "less-than", value: "12.5" });
  assert.equal(draft.numeric, 12.5);
  assert.equal(draft.bold, false);
});

test("条件格式：清除走 clearConditionalFormatRules，只清选区", () => {
  const { calls, port } = recordingPort();
  runGridUniverCommand("condition-clear", port, {});
  assert.deepEqual(calls, [["range.clearConditionalFormatRules"]]);
});

test("数据验证：列表按分隔符拆项，warn 落到 setAllowInvalid(true)", () => {
  const { calls, port } = recordingPort();
  runGridUniverCommand("validation-check", port, {
    kind: "list",
    value: "北京，上海, 广州",
    behavior: "warn",
  });
  assert.deepEqual(calls[0], [
    "dv.requireValueInList",
    ["北京", "上海", "广州"],
    false,
    true,
  ]);
  assert.deepEqual(calls[1], ["dv.setAllowInvalid", true]);
});

test("数据验证：block 落到 setAllowInvalid(false)——这是两个取值的唯一区别", () => {
  const { calls, port } = recordingPort();
  runGridUniverCommand("validation-check", port, {
    kind: "whole",
    operator: "between",
    value: "1",
    value2: "100",
    behavior: "block",
  });
  assert.deepEqual(calls[0], ["dv.requireNumberBetween", 1, 100, true]);
  assert.deepEqual(calls[1], ["dv.setAllowInvalid", false]);
});

test("数据验证：decimal 不强制整数，text-length 强制整数", () => {
  const dec = recordingPort();
  runGridUniverCommand("validation-check", dec.port, {
    kind: "decimal",
    operator: "greater-than",
    value: "0.5",
  });
  assert.deepEqual(dec.calls[0], ["dv.requireNumberGreaterThan", 0.5, false]);

  const len = recordingPort();
  runGridUniverCommand("validation-check", len.port, {
    kind: "text-length",
    operator: "less-equal",
    value: "20",
  });
  assert.deepEqual(len.calls[0], [
    "dv.requireNumberLessThanOrEqualTo",
    20,
    true,
  ]);
});

test("数据验证：between 少了上限就不建规则，不拿下限凑一个", () => {
  const { calls, port } = recordingPort();
  const outcome = runGridUniverCommand("validation-check", port, {
    kind: "whole",
    operator: "between",
    value: "1",
  });
  assert.equal(outcome.result, null);
  assert.deepEqual(calls, []);
});

test("数据验证：Invalid Date 不许进 builder（否则静默造一条永不命中的规则）", () => {
  const { calls, port } = recordingPort();
  const outcome = runGridUniverCommand("validation-check", port, {
    kind: "date",
    operator: "greater-than",
    value: "不是日期",
  });
  assert.equal(outcome.result, null);
  assert.deepEqual(calls, []);
});

test("数据验证：日期各操作符落到对应的 require*，日期没有「不等于」就不假装有", () => {
  const eq = recordingPort();
  runGridUniverCommand("validation-check", eq.port, {
    kind: "date",
    operator: "equal",
    value: "2026-09-04",
  });
  assert.equal(eq.calls[0][0], "dv.requireDateEqualTo");

  const ne = recordingPort();
  const outcome = runGridUniverCommand("validation-check", ne.port, {
    kind: "date",
    operator: "not-equal",
    value: "2026-09-04",
  });
  assert.equal(outcome.result, null, "上游没有日期不等于，不许自己拼公式");
  assert.deepEqual(ne.calls, []);
});

test("数据验证：自定义公式直接进 requireFormulaSatisfied", () => {
  const { calls, port } = recordingPort();
  runGridUniverCommand("validation-check", port, {
    kind: "custom",
    value: "=A1>0",
  });
  assert.deepEqual(calls[0], ["dv.requireFormulaSatisfied", "=A1>0"]);
});

test("buildGridValidationRule 空值直接不成立", () => {
  const { port } = recordingPort();
  assert.equal(buildGridValidationRule(port, { kind: "list", value: " " }), null);
});

test("agent 命令按行列号取 range，不依赖当前选区", () => {
  const { calls, port } = recordingPort();
  runGridUniverCommand("grid.set-cell", port, {
    row: 5,
    column: 6,
    value: "42",
  });
  assert.deepEqual(calls, [
    ["sheet.getRange", 5, 6],
    ["range.setValue", "42"],
  ]);
});

test("grid.read-cell 是读，不写任何东西", () => {
  const { calls, port } = recordingPort();
  const outcome = runGridUniverCommand("grid.read-cell", port, {
    row: 0,
    column: 0,
  });
  assert.equal(outcome.result, "cell-value");
  assert.deepEqual(calls, [["sheet.getRange", 0, 0]]);
});

test("排序方向：只有明确的 desc 才降序", () => {
  const { calls, port } = recordingPort();
  runGridUniverCommand("grid.sort-column", port, { column: 1 });
  runGridUniverCommand("grid.sort-column", port, {
    column: 1,
    direction: "desc",
  });
  assert.deepEqual(calls, [
    ["sheet.sort", 1, true],
    ["sheet.sort", 1, false],
  ]);
});

test("导出与保存不经 Facade，报错要说清去哪儿了", () => {
  const { calls, port } = recordingPort();
  const exported = runGridUniverCommand("grid.export", port, {});
  assert.equal(exported.ok, false);
  assert.match(exported.reason, /exceljs/);
  const saved = runGridUniverCommand("grid.save", port, {});
  assert.equal(saved.ok, false);
  assert.match(saved.reason, /持久化/);
  assert.deepEqual(calls, []);
});

test("草稿层控件被调用时说的是「只改草稿」，与「不归 Facade 管」分开报", () => {
  const { calls, port } = recordingPort();
  const outcome = runGridUniverCommand("condition-operator", port, {});
  assert.equal(outcome.ok, false);
  assert.match(outcome.reason, /只改面板草稿/);
  assert.deepEqual(calls, []);
});

test("未知命令与「这条不归 Facade 管」是两种不同的失败", () => {
  const { port } = recordingPort();
  const unknown = runGridUniverCommand("no-such-command", port, {});
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /没有/);
  assert.equal(gridUniverCommand("no-such-command"), null);
});
