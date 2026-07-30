// oceanleo.interactive-doc.v1 —— 数据层与 §3.4 封闭表达式求值器的聚焦用例。
// 规格: docs/specs/oceanleo-material-and-game-v1/L1-carriers/interactive-doc.md
// 合同: docs/work-logs/2026-07/oceanleo-material-and-game-impl/S1-dispatch-contract.md §4 W6
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  INTERACTIVE_DOC_ARTIFACT_TYPE,
  INTERACTIVE_DOC_LIMITS,
  INTERACTIVE_DOC_PROJECT_SCHEMA,
  canonicalInteractiveDocProject,
  validateInteractiveDocProject,
} from "../src/shell/interactive-doc-editor/interactive-doc-schema.ts";
import {
  EXPRESSION_FUNCTIONS,
  EXPRESSION_FUNCTION_NAMES,
  InteractiveDocSourceError,
  THREE_STATEMENT_TIE_IDS,
  assessInteractiveDocCompleteness,
  assessThreeStatementTies,
  evaluateComputeGraph,
  evaluateExpressionValue,
  interactiveDocSimilarity,
  interactiveDocSourceByteLength,
  linkInteractiveDocProject,
  parseInteractiveDocExpression,
  parseInteractiveDocSource,
  probeInteractiveDocReactivity,
  serializeInteractiveDocProject,
  threeStatementTieValidations,
} from "../src/shell/interactive-doc-editor/interactive-doc-source.ts";
import {
  INTERACTIVE_DOC_VALUE_PLACEHOLDER,
  renderInteractiveDocBlock,
  renderInteractiveDocDocument,
} from "../src/shell/interactive-doc-editor/interactive-doc-render.ts";
import {
  INTERACTIVE_DOC_PERSISTENCE_IDENTITY,
  InteractiveDocCommitError,
  assertInteractiveDocSaveable,
  commitInteractiveDocProject,
} from "../src/shell/interactive-doc-editor/interactive-doc-persistence.ts";

const EDITOR_DIR = new URL(
  "../src/shell/interactive-doc-editor/",
  import.meta.url,
);
const OWNED_FILES = [
  "interactive-doc-schema.ts",
  "interactive-doc-source.ts",
  "interactive-doc-persistence.ts",
  "interactive-doc-render.ts",
];

const INTRO_PROSE =
  "这份可算文档把「买房贷款到底还多少」拆成可以自己改的参数：本金、年利率、年限、每月额外还款。" +
  "改任何一个参数，下面的月供、总利息、利息占比、现金流图都会立刻重算，不需要重新生成一份新素材。" +
  "所有中间量都写在 computations 里，公式展开块会逐步显示等额本息的推导，任何一步都可以自己核对。" +
  "文档不承诺任何投资建议，只把公开的等额本息公式与你自己填的数字算清楚，并把口径写在下面的方法学一节里。";
const METHOD_PROSE =
  "方法学：月利率取年利率除以一百再除以十二；期数取年限乘十二；月供用等额本息公式 pmt(月利率, 期数, 本金) 求出。" +
  "总还款为月供乘期数，总利息为总还款减本金，利息占比为总利息除以本金；分母恒大于零，除零仍由 guard 兜底。" +
  "现金流表格与折线图取同一份内联数据集，不引外部依赖件，因此这份文档在离线环境也能完整重算。" +
  "若把年利率调到零，月供会退化为本金除以期数，这一点可以直接在参数面板里验证，也是这份文档自带行为的证据。";

function baseProject() {
  return {
    schema: INTERACTIVE_DOC_PROJECT_SCHEMA,
    version: 1,
    metadata: {
      title: "等额本息贷款可算文档",
      summary:
        "参数驱动的贷款测算：改本金、利率、年限、额外还款，月供与总利息随之重算。",
      locale: "zh-CN",
      docKind: "calculator",
      createdAt: "2026-07-29T00:00:00Z",
    },
    parameters: [
      {
        id: "principal",
        label: "贷款本金",
        help: "商业贷款的合同金额，不含公积金部分；取值域按国内主流银行的单笔上限设定。",
        kind: "currency",
        unit: "元",
        min: 10000,
        max: 5000000,
        step: 10000,
        precision: 2,
        default: 1200000,
        control: "input",
      },
      {
        id: "annual_rate",
        label: "年利率",
        help: "按年计的名义利率，月利率由它除以十二得到；上限取历史高位以便做压力测试。",
        kind: "percent",
        unit: "%",
        min: 0,
        max: 24,
        step: 0.1,
        precision: 2,
        default: 4.2,
        control: "slider",
      },
      {
        id: "years",
        label: "贷款年限",
        help: "还款年数，期数等于它乘以十二。",
        kind: "integer",
        unit: "年",
        min: 1,
        max: 30,
        step: 1,
        default: 20,
        control: "stepper",
      },
      {
        id: "extra_monthly",
        label: "每月额外还款",
        help: "在月供之外每月多还的金额，直接叠加到月供上。",
        kind: "currency",
        unit: "元",
        min: 0,
        max: 50000,
        step: 500,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "insured",
        label: "是否含房贷险",
        help: "仅用于标注，不参与本版计算。",
        kind: "boolean",
        default: false,
        control: "switch",
      },
      {
        id: "plan",
        label: "还款方式",
        help: "本版只实现等额本息，等额本金留待下一版。",
        kind: "enum",
        options: [
          { value: "equal-installment", label: "等额本息" },
          { value: "equal-principal", label: "等额本金" },
        ],
        default: "equal-installment",
        control: "select",
      },
    ],
    datasets: [
      {
        id: "flows",
        columns: [
          { name: "label", type: "string" },
          { name: "amount", type: "number", unit: "元" },
        ],
        source: {
          inline: [
            ["第 1 年", 72000],
            ["第 2 年", 71000],
            ["第 3 年", 70000],
            ["第 4 年", 69000],
            ["第 5 年", 68000],
          ],
        },
      },
    ],
    computations: [
      {
        id: "monthly_rate",
        label: "月利率",
        expression: "annual_rate / 100 / 12",
        precision: 8,
      },
      { id: "periods", label: "总期数", expression: "years * 12", unit: "期" },
      {
        id: "base_payment",
        label: "基础月供",
        expression: "pmt(monthly_rate, periods, principal)",
        unit: "元",
        precision: 2,
        dependsOn: ["monthly_rate", "periods"],
      },
      {
        id: "monthly_payment",
        label: "实际月供",
        expression: "base_payment + extra_monthly",
        unit: "元",
        precision: 2,
      },
      {
        id: "total_payment",
        label: "总还款",
        expression: "monthly_payment * periods",
        unit: "元",
        precision: 2,
      },
      {
        id: "total_interest",
        label: "总利息",
        expression: "total_payment - principal",
        unit: "元",
        precision: 2,
      },
      {
        id: "interest_ratio",
        label: "利息占本金比",
        expression: "total_interest / principal",
        precision: 4,
        guard: { onDivideByZero: "null", onNaN: "null" },
      },
      { id: "flow_total", label: "五年现金流合计", expression: "sum(flows)", unit: "元" },
      { id: "flow_avg", label: "五年现金流均值", expression: "avg(flows)", unit: "元" },
      { id: "flow_series", label: "现金流序列", expression: "flows" },
    ],
    blocks: [
      { id: "intro", kind: "prose", span: 12, title: "这份文档在算什么", text: INTRO_PROSE },
      {
        id: "panel",
        kind: "parameter-panel",
        span: 4,
        title: "参数",
        parameterIds: ["principal", "annual_rate", "years", "extra_monthly", "plan"],
      },
      { id: "m-payment", kind: "metric", span: 4, title: "月供", bind: "monthly_payment" },
      { id: "m-interest", kind: "metric", span: 4, title: "总利息", bind: "total_interest" },
      {
        id: "summary-table",
        kind: "table",
        span: 8,
        title: "测算摘要",
        table: {
          datasetId: "flows",
          rows: [
            { label: "总还款", bind: "total_payment", emphasis: "subtotal" },
            { label: "总利息", bind: "total_interest", emphasis: "subtotal" },
            { label: "利息占本金比", bind: "interest_ratio", emphasis: "none" },
            { label: "五年现金流合计", bind: "flow_total", emphasis: "total" },
            { label: "五年现金流均值", bind: "flow_avg", emphasis: "none" },
          ],
        },
      },
      {
        id: "flow-chart",
        kind: "chart",
        span: 8,
        title: "现金流",
        chart: {
          chartType: "line",
          xAxisLabel: "年",
          yAxisLabel: "元",
          series: [{ name: "现金流", bind: "flow_series", color: "#1F6FEB" }],
        },
      },
      {
        id: "walkthrough",
        kind: "formula",
        span: 12,
        title: "等额本息展开",
        formula: {
          computationId: "base_payment",
          steps: [
            { expression: "annual_rate / 100 / 12", note: "第一步：把年利率折成月利率。" },
            { expression: "years * 12", note: "第二步：把年限折成期数。" },
            {
              expression: "pmt(monthly_rate, periods, principal)",
              note: "第三步：代入等额本息公式得到月供。",
            },
          ],
        },
      },
      {
        id: "note",
        kind: "callout",
        span: 12,
        title: "口径说明",
        callout: "info",
        text: "利率为名义年利率，未考虑提前还款违约金与税费。",
      },
      { id: "method", kind: "prose", span: 12, title: "方法学", text: METHOD_PROSE },
      { id: "rule", kind: "divider", span: 12 },
    ],
    validation: [
      {
        id: "payment_positive",
        assert: "monthly_payment > 0",
        message: "月供必须为正，请检查本金与期数。",
        severity: "error",
      },
      {
        id: "ratio_sane",
        assert: "interest_ratio < 5",
        message: "利息占本金比超过 5 倍，请复核利率与年限。",
        severity: "warn",
      },
    ],
    interactions: { recomputeMode: "on-change", resetEnabled: true, maxRecomputeMs: 200 },
    exports: ["json", "csv"],
    attribution: {
      entries: [
        {
          text: "等额本息公式为公开会计惯例，示例现金流为本文档自造样例数据。",
          licenseCode: "CC0-1.0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          datasetId: "flows",
        },
      ],
    },
  };
}

/** 只有过了 §3.2 校验的工程才进入求值,避免用例悄悄依赖非法结构。 */
function canonical(projectLike) {
  const result = validateInteractiveDocProject(projectLike);
  assert.deepEqual(
    result.errors,
    [],
    `fixture 未通过 §3.2 校验: ${JSON.stringify(result.errors, null, 2)}`,
  );
  assert.equal(result.ok, true);
  return result.project;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const FIXTURE = canonical(baseProject());

const numericScope = {
  a: 12,
  b: 5,
  zero: 0,
  flag: true,
  name: "leo",
  amounts: { kind: "column", name: "amount", type: "number", values: [3, 1, 4, 1, 5] },
  ledger: {
    kind: "dataset",
    id: "ledger",
    rowCount: 3,
    unloaded: false,
    columns: [
      { kind: "column", name: "label", type: "string", values: ["a", "b", "c"] },
      { kind: "column", name: "amount", type: "number", values: [10, 20, 30] },
    ],
  },
  cash: {
    kind: "column",
    name: "cash",
    type: "number",
    values: [-1000, 400, 400, 400],
  },
};

function evalValue(expression, scope = numericScope, guard) {
  const result = evaluateExpressionValue(expression, scope, guard);
  assert.equal(
    result.ok,
    true,
    `表达式应当求值成功: ${expression} → ${JSON.stringify(result.error)}`,
  );
  return result.value;
}

function rejection(expression) {
  const parsed = parseInteractiveDocExpression(expression);
  assert.equal(parsed.ok, false, `表达式必须被拒绝: ${expression}`);
  return parsed.error;
}

// ---------------------------------------------------------------------------
// 合同 §4 W6 导出签名清单(W7 视口层按这些名字写)
// ---------------------------------------------------------------------------

test("W6 导出签名齐全且为合同钉死的形态", () => {
  assert.equal(INTERACTIVE_DOC_PROJECT_SCHEMA, "oceanleo.interactive-doc.v1");
  assert.equal(INTERACTIVE_DOC_ARTIFACT_TYPE, "interactive_doc");
  for (const [name, value] of [
    ["parseInteractiveDocSource", parseInteractiveDocSource],
    ["serializeInteractiveDocProject", serializeInteractiveDocProject],
    ["validateInteractiveDocProject", validateInteractiveDocProject],
    ["evaluateComputeGraph", evaluateComputeGraph],
    ["commitInteractiveDocProject", commitInteractiveDocProject],
    ["renderInteractiveDocBlock", renderInteractiveDocBlock],
  ]) {
    assert.equal(typeof value, "function", `${name} 必须是函数`);
  }
  assert.equal(parseInteractiveDocSource.length, 1);
  assert.equal(serializeInteractiveDocProject.length, 1);
  assert.equal(validateInteractiveDocProject.length, 1);
  // evaluateComputeGraph(project, inputs) —— 第三参数是可选的求值选项。
  assert.equal(evaluateComputeGraph.length, 2);
  assert.equal(
    INTERACTIVE_DOC_PERSISTENCE_IDENTITY.sourceFormat,
    INTERACTIVE_DOC_PROJECT_SCHEMA,
  );
  assert.equal(INTERACTIVE_DOC_PERSISTENCE_IDENTITY.minimumSourceBytes, 8192);
});

test("硬红线:四个源文件无 eval / new Function / 动态 import,且不 import chart-editor(D4)", () => {
  for (const file of OWNED_FILES) {
    const source = readFileSync(new URL(file, EDITOR_DIR), "utf8");
    const code = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
      .join("\n");
    assert.equal(/\beval\s*\(/.test(code), false, `${file} 出现 eval(`);
    assert.equal(/new\s+Function\s*\(/.test(code), false, `${file} 出现 new Function(`);
    assert.equal(
      /[^A-Za-z0-9_$.]import\s*\(/.test(code),
      false,
      `${file} 出现动态 import(`,
    );
    assert.equal(/\bwith\s*\(/.test(code), false, `${file} 出现 with(`);
    assert.equal(/chart-editor/.test(code), false, `${file} 引用了 chart-editor(违反 D4)`);
  }
});

// ---------------------------------------------------------------------------
// §3.2 Schema + 解析 / 序列化确定性
// ---------------------------------------------------------------------------

test("roundtrip 确定性:serialize → parse → serialize 逐字节一致", () => {
  const first = serializeInteractiveDocProject(FIXTURE);
  const reopened = parseInteractiveDocSource(first);
  const second = serializeInteractiveDocProject(reopened);
  assert.equal(second, first);
  const third = serializeInteractiveDocProject(parseInteractiveDocSource(Buffer.from(first, "utf8")));
  assert.equal(third, first);
  assert.deepEqual(reopened, FIXTURE);
});

test("规范化落 §3.2 声明的默认值:theme / interactions / guard / emphasis", () => {
  const stripped = clone(baseProject());
  delete stripped.theme;
  delete stripped.interactions;
  const project = canonical(stripped);
  assert.deepEqual(project.theme, {
    accent: "#1F6FEB",
    density: "regular",
    gridColumns: 12,
  });
  assert.deepEqual(project.interactions, {
    recomputeMode: "on-change",
    resetEnabled: true,
    scenarioSlots: 0,
    maxRecomputeMs: INTERACTIVE_DOC_LIMITS.recomputeMsDefault,
  });
  for (const node of project.computations) {
    assert.deepEqual(node.guard.onDivideByZero, "null");
    assert.deepEqual(node.guard.onNaN, "null");
  }
  const table = project.blocks.find((block) => block.kind === "table");
  assert.equal(table.table.rows.every((row) => typeof row.emphasis === "string"), true);
  assert.equal(
    serializeInteractiveDocProject(canonicalInteractiveDocProject(project)),
    serializeInteractiveDocProject(project),
  );
});

test("§8.1:样例工程的 source 字节达到 8,192 B 下限", () => {
  const bytes = interactiveDocSourceByteLength(FIXTURE);
  assert.ok(
    bytes >= INTERACTIVE_DOC_LIMITS.sourceBytesMin,
    `source ${bytes} B 低于 §8.1 的 ${INTERACTIVE_DOC_LIMITS.sourceBytesMin} B`,
  );
  assert.ok(bytes <= INTERACTIVE_DOC_LIMITS.sourceBytesMax);
});

test("§3.2 逐字段校验:additionalProperties / 条件必填 / 取值域", () => {
  const cases = [
    [
      "未知顶层字段",
      (project) => {
        project.extra = 1;
      },
      "unknown-property",
    ],
    [
      "F5 数值参数缺 min/max/unit",
      (project) => {
        delete project.parameters[0].min;
      },
      "conditional",
    ],
    [
      "kind = enum 缺 options",
      (project) => {
        delete project.parameters[5].options;
      },
      "conditional",
    ],
    [
      "metric 块缺 bind",
      (project) => {
        delete project.blocks[2].bind;
      },
      "conditional",
    ],
    [
      "blocks 少于 C5 = 4",
      (project) => {
        project.blocks = project.blocks.slice(0, 3);
      },
      "count",
    ],
    [
      "computations 少于 C3 = 2",
      (project) => {
        project.computations = project.computations.slice(0, 1);
      },
      "count",
    ],
    [
      "parameters 少于 C1 = 3",
      (project) => {
        project.parameters = project.parameters.slice(0, 2);
      },
      "count",
    ],
    [
      "span 越过 C14 上限",
      (project) => {
        project.blocks[0].span = 13;
      },
      "range",
    ],
    [
      "id 不匹配 §3.2 的 pattern",
      (project) => {
        project.computations[0].id = "Monthly-Rate";
      },
      "pattern",
    ],
    [
      "schema 不是 const",
      (project) => {
        project.schema = "oceanleo.interactive.v1";
      },
      "enum",
    ],
    [
      "attribution 缺许可字段",
      (project) => {
        delete project.attribution.entries[0].licenseUrl;
      },
      "missing-property",
    ],
    [
      "computation id 与 parameter id 撞名",
      (project) => {
        project.computations[0].id = "principal";
      },
      "duplicate-id",
    ],
  ];
  for (const [label, mutate, code] of cases) {
    const project = clone(baseProject());
    mutate(project);
    const result = validateInteractiveDocProject(project);
    assert.equal(result.ok, false, `${label} 应当校验失败`);
    assert.ok(
      result.errors.some((error) => error.code === code),
      `${label} 期望 error code ${code}，实际 ${JSON.stringify(result.errors)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// ADR-04:HTML 永远不是源
// ---------------------------------------------------------------------------

test("ADR-04:HTML 字节在解析入口被受控拒绝", () => {
  const htmlSources = [
    "<!DOCTYPE html><html><body><h1>月供 5000</h1></body></html>",
    "  <html><body>可算文档</body></html>",
    "<div data-doc='interactive'>4200</div>",
  ];
  for (const html of htmlSources) {
    assert.throws(
      () => parseInteractiveDocSource(html),
      (error) => {
        assert.ok(error instanceof InteractiveDocSourceError);
        assert.equal(error.code, "html-source-rejected");
        return true;
      },
      `HTML 源必须被拒绝: ${html.slice(0, 24)}`,
    );
  }
  assert.throws(
    () => parseInteractiveDocSource("{ not json"),
    (error) => error.code === "invalid-json",
  );
  assert.throws(
    () => parseInteractiveDocSource("   "),
    (error) => error.code === "missing-source",
  );
});

test("ADR-04:声明 source_format='html' 的 revision 不得提交", async () => {
  const item = libraryItem({ sourceFormat: "html" });
  await assert.rejects(
    () => commitInteractiveDocProject({ project: FIXTURE, item, dependencies: stubDependencies() }),
    (error) => {
      assert.ok(error instanceof InteractiveDocCommitError);
      assert.equal(error.code, "html-source-rejected");
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// §3.4 表达式语言:封闭子集
// ---------------------------------------------------------------------------

test("§3.4 白名单恰好 24 个函数,逐条与规格表一致(C11)", () => {
  const spec = [
    "abs", "min", "max", "round", "floor", "ceil", "pow", "sqrt", "exp", "ln",
    "log10", "sum", "avg", "count", "median", "stdev", "npv", "irr", "pmt",
    "if", "clamp", "lookup", "days", "coalesce",
  ];
  assert.equal(spec.length, INTERACTIVE_DOC_LIMITS.functionWhitelistSize);
  assert.equal(EXPRESSION_FUNCTION_NAMES.length, 24);
  assert.deepEqual([...EXPRESSION_FUNCTION_NAMES].sort(), [...spec].sort());
  const arity = {
    abs: 1, round: 2, floor: 1, ceil: 1, pow: 2, sqrt: 1, exp: 1, ln: 1,
    log10: 1, sum: 1, avg: 1, count: 1, median: 1, stdev: 1, npv: 2, irr: 1,
    pmt: 3, if: 3, clamp: 3, lookup: 3, days: 2,
  };
  for (const [name, expected] of Object.entries(arity)) {
    assert.equal(EXPRESSION_FUNCTIONS[name].arity, expected, `${name} arity`);
  }
  for (const name of ["min", "max", "coalesce"]) {
    assert.equal(EXPRESSION_FUNCTIONS[name].variadicMin, 2, `${name} 可变参下限`);
  }
});

test("§3.4 白名单函数逐条求值", () => {
  assert.equal(evalValue("abs(0 - 7)"), 7);
  assert.equal(evalValue("min(3, 9, 2)"), 2);
  assert.equal(evalValue("max(3, 9, 2)"), 9);
  assert.equal(evalValue("round(3.14159, 2)"), 3.14);
  assert.equal(evalValue("floor(3.9)"), 3);
  assert.equal(evalValue("ceil(3.1)"), 4);
  assert.equal(evalValue("pow(2, 10)"), 1024);
  assert.equal(evalValue("sqrt(144)"), 12);
  assert.equal(evalValue("exp(0)"), 1);
  assert.equal(evalValue("ln(1)"), 0);
  assert.equal(evalValue("log10(1000)"), 3);
  assert.equal(evalValue("sum(amounts)"), 14);
  assert.equal(evalValue("avg(amounts)"), 2.8);
  assert.equal(evalValue("count(amounts)"), 5);
  assert.equal(evalValue("count(ledger)"), 3);
  assert.equal(evalValue("median(amounts)"), 3);
  assert.equal(Math.round(evalValue("stdev(amounts)") * 1000) / 1000, 1.789);
  assert.ok(
    Math.abs(
      evalValue("npv(0.1, cash)") - (-1000 + 400 / 1.1 + 400 / 1.21 + 400 / 1.331),
    ) < 1e-6,
  );
  const rate = evalValue("irr(cash)");
  assert.ok(rate > 0.09 && rate < 0.1, `irr 应落在 9%-10%，实际 ${rate}`);
  assert.ok(
    Math.abs(
      evalValue("pmt(0.004, 12, 10000)") -
        (10000 * 0.004) / (1 - Math.pow(1.004, -12)),
    ) < 1e-6,
  );
  assert.equal(evalValue("pmt(0, 10, 1000)"), 100);
  assert.equal(evalValue("if(a > b, 1, 0)"), 1);
  assert.equal(evalValue("clamp(99, 0, 10)"), 10);
  assert.equal(evalValue('lookup(ledger, "b", "amount")'), 20);
  assert.equal(evalValue('lookup(ledger, "zz", "amount")'), null);
  assert.equal(evalValue('days("2026-01-01", "2026-03-01")'), 59);
  assert.equal(evalValue("coalesce(zero, 42)"), 0);
  // C24:irr 未收敛(现金流不变号)时按 guard.onNaN 兜底,不把 NaN 交出去。
  assert.equal(evalValue("irr(amounts)"), null);
});

test("§3.4 运算符与文法:优先级、比较、逻辑、三元、一元", () => {
  assert.equal(evalValue("1 + 2 * 3"), 7);
  assert.equal(evalValue("(1 + 2) * 3"), 9);
  assert.equal(evalValue("a - b"), 7);
  assert.equal(evalValue("a % b"), 2);
  assert.equal(evalValue("a / b"), 2.4);
  assert.equal(evalValue("-a"), -12);
  assert.equal(evalValue("!flag"), false);
  assert.equal(evalValue("a > b && b > 0"), true);
  assert.equal(evalValue("a < b || flag"), true);
  assert.equal(evalValue("a == 12"), true);
  assert.equal(evalValue("a != 12"), false);
  assert.equal(evalValue("a >= 12 && a <= 12"), true);
  assert.equal(evalValue("a > b ? a : b"), 12);
  assert.equal(evalValue('name == "leo"'), true);
  assert.equal(evalValue("true"), true);
  // 同一表达式重复求值逐位一致(§5.4 可移植性的本地必要条件)。
  assert.equal(evalValue("pmt(0.0035, 240, 1200000)"), evalValue("pmt(0.0035, 240, 1200000)"));
});

test("§3.4 封闭子集:白名单外的表达式被受控拒绝并带 error code", () => {
  const cases = [
    ['eval("1+1")', "expression-unknown-function"],
    ["Function('return 1')()", "expression-unknown-function"],
    ['import("./x.js")', "expression-unknown-function"],
    ["random()", "expression-unknown-function"],
    ["require('fs')", "expression-unknown-function"],
    ["a.constructor", "expression-forbidden"],
    ["amounts[0]", "expression-forbidden"],
    ["a = 1", "expression-forbidden"],
    ["a; b", "expression-forbidden"],
    ["`${a}`", "expression-forbidden"],
    ["a & b", "expression-forbidden"],
    ["a ** b", "expression-syntax"],
    ["abs(1, 2)", "expression-arity"],
    ["min(1)", "expression-arity"],
    ["pmt(1, 2)", "expression-arity"],
    ["abs(", "expression-syntax"],
    ["1 +", "expression-syntax"],
  ];
  for (const [expression, code] of cases) {
    const error = rejection(expression);
    assert.equal(error.code, code, `${expression} 期望 ${code}，实际 ${error.code}`);
    assert.ok(error.message.length > 0);
  }
  assert.equal(rejection("").code, "expression-empty");
  assert.equal(
    rejection("1".repeat(INTERACTIVE_DOC_LIMITS.expressionMaxChars + 1)).code,
    "expression-too-long",
  );
  // 受控拒绝 = 返回错误对象,不是抛异常、不是静默求值。
  const attempt = evaluateExpressionValue('eval("2+2")', numericScope);
  assert.equal(attempt.ok, false);
  assert.equal(attempt.value, null);
  assert.equal(attempt.error.code, "expression-unknown-function");
});

test("§3.4 IDENT 必须解析为已声明 id,否则计算图判 invalid", () => {
  const project = clone(baseProject());
  project.computations[0].expression = "globalThis + 1";
  const link = linkInteractiveDocProject(canonical(project));
  assert.equal(link.state, "invalid");
  assert.ok(link.errors.some((error) => error.code === "unknown-identifier"));
});

test("§3.4 / F3:除零与 NaN 一律走 guard,呈现层拿不到 NaN", () => {
  const guarded = (guard, expression, scope) =>
    evaluateExpressionValue(expression, scope || numericScope, guard);

  const byNull = guarded({ onDivideByZero: "null", onNaN: "null" }, "a / zero");
  assert.equal(byNull.value, null);
  assert.ok(byNull.diagnostics.some((entry) => entry.code === "divide-by-zero"));

  assert.equal(guarded({ onDivideByZero: "zero", onNaN: "null" }, "a / zero").value, 0);
  // guard = nan 也不把 NaN 交出去:出口统一收敛成 null(§5.3)。
  assert.equal(guarded({ onDivideByZero: "nan", onNaN: "null" }, "a / zero").value, null);

  const strict = guarded({ onDivideByZero: "error", onNaN: "null" }, "a / zero");
  assert.equal(strict.ok, false);
  assert.equal(strict.error.code, "divide-by-zero");

  // ln(非正数) / sqrt(负数) 走 onNaN,值退成 null。
  assert.equal(guarded({ onDivideByZero: "null", onNaN: "null" }, "ln(0)").value, null);
  assert.equal(guarded({ onDivideByZero: "null", onNaN: "null" }, "sqrt(0 - 4)").value, null);

  // 节点级:整张图里 guard 生效,值是 null 而不是 NaN。
  const project = clone(baseProject());
  project.parameters[0].min = 0;
  project.parameters[0].default = 0;
  project.computations[6].expression = "total_interest / principal";
  const compute = evaluateComputeGraph(canonical(project), { principal: 0 });
  assert.equal(compute.values.interest_ratio, null);
  assert.ok(compute.diagnostics.some((entry) => entry.code === "divide-by-zero"));
  for (const value of Object.values(compute.values)) {
    assert.equal(typeof value === "number" && !Number.isFinite(value), false);
  }
});

// ---------------------------------------------------------------------------
// §3.3 计算图状态机
// ---------------------------------------------------------------------------

test("§3.3 linking → ready:拓扑序、深度与求值结果", () => {
  const compute = evaluateComputeGraph(FIXTURE, {});
  assert.equal(compute.state, "ready");
  assert.equal(compute.ok, true);
  assert.equal(compute.cycle.length, 0);
  assert.ok(compute.depth <= INTERACTIVE_DOC_LIMITS.graphMaxDepth);
  const order = compute.order;
  assert.ok(order.indexOf("monthly_rate") < order.indexOf("base_payment"));
  assert.ok(order.indexOf("periods") < order.indexOf("base_payment"));
  assert.ok(order.indexOf("base_payment") < order.indexOf("monthly_payment"));
  assert.ok(order.indexOf("total_payment") < order.indexOf("total_interest"));

  assert.equal(compute.parameters.principal, 1200000);
  assert.equal(compute.values.periods, 240);
  assert.equal(Math.round(compute.values.monthly_rate * 1e8) / 1e8, 0.0035);
  const expectedPayment =
    (1200000 * (4.2 / 100 / 12)) / (1 - Math.pow(1 + 4.2 / 100 / 12, -240));
  assert.ok(
    Math.abs(compute.values.monthly_payment - expectedPayment) < 1e-6,
    `月供 ${compute.values.monthly_payment} 与等额本息公式 ${expectedPayment} 不符`,
  );
  assert.equal(compute.values.flow_total, 350000);
  assert.equal(compute.values.flow_avg, 70000);
  assert.equal(compute.validation.find((entry) => entry.id === "payment_positive").passed, true);
  // SC 1.3.1:结果卡能说出自己依赖哪些参数。
  assert.deepEqual(compute.parameterDependencies.monthly_payment.sort(), [
    "annual_rate",
    "extra_monthly",
    "principal",
    "years",
  ]);
});

test("§3.3 ready → computing:改参数必须联动结果(A4 / §5.1)", () => {
  const base = evaluateComputeGraph(FIXTURE, {});
  const raised = evaluateComputeGraph(FIXTURE, { annual_rate: 6 });
  assert.ok(raised.values.monthly_payment > base.values.monthly_payment);
  const extra = evaluateComputeGraph(FIXTURE, { extra_monthly: 1000 });
  assert.equal(
    Math.round((extra.values.monthly_payment - base.values.monthly_payment) * 100) / 100,
    1000,
  );
  // 同参数两次求值逐位一致。
  assert.deepEqual(
    evaluateComputeGraph(FIXTURE, { annual_rate: 6 }).values,
    raised.values,
  );
});

test("§3.3 linking → cyclic:环被检出并给出完整 id 序列(F2)", () => {
  const project = clone(baseProject());
  project.computations[0].expression = "interest_ratio + 1";
  const cyclic = canonical(project);
  const link = linkInteractiveDocProject(cyclic);
  assert.equal(link.state, "cyclic");
  const cycleError = link.errors.find((error) => error.code === "interactive-doc-cyclic");
  assert.ok(cycleError, "必须给出 interactive-doc-cyclic 错误码");
  assert.ok(cycleError.cycle.length >= 2);
  assert.ok(cycleError.cycle.includes("monthly_rate"));
  assert.ok(cycleError.cycle.includes("interest_ratio"));
  assert.ok(cycleError.message.includes("→"), "环上 id 序列必须完整打印，不能只说计算失败");

  // cyclic → computing 是非法迁移:一个值都不许算出来。
  const compute = evaluateComputeGraph(cyclic, {});
  assert.equal(compute.state, "cyclic");
  assert.equal(compute.ok, false);
  assert.deepEqual(compute.values, {});
  assert.ok(compute.cycle.length >= 2);

  // cyclic 工程 MUST NOT 保存。
  assert.throws(
    () => assertInteractiveDocSaveable(cyclic),
    (error) => error instanceof InteractiveDocCommitError && error.code === "graph-cyclic",
  );
});

test("§3.3 linking → invalid:悬空绑定被逐条列出(F4)", () => {
  const project = clone(baseProject());
  project.blocks[2].bind = "ghost_metric";
  const link = linkInteractiveDocProject(canonical(project));
  assert.equal(link.state, "invalid");
  const dangling = link.errors.find(
    (error) => error.code === "interactive-doc-dangling-bind",
  );
  assert.ok(dangling);
  assert.ok(dangling.message.includes("ghost_metric"));
  const compute = evaluateComputeGraph(canonical(project), {});
  assert.equal(compute.state, "invalid");
  assert.equal(compute.ok, false);
});

test("§3.3 linking → degraded:缺依赖件不得保存", () => {
  const project = clone(baseProject());
  project.datasets[0].source = { dependencyPath: "flows.csv", rowCount: 5 };
  const degraded = canonical(project);
  const link = linkInteractiveDocProject(degraded);
  assert.equal(link.state, "degraded");
  assert.ok(
    link.errors.some((error) => error.code === "interactive-doc-dependency-missing"),
  );
  const compute = evaluateComputeGraph(degraded, {});
  assert.equal(compute.state, "degraded");
  // §3.3 line 590:degraded → saving 是非法迁移。
  assert.throws(
    () => assertInteractiveDocSaveable(degraded),
    (error) =>
      error instanceof InteractiveDocCommitError && error.code === "degraded-not-saveable",
  );
});

test("§3.3 computing → degraded:超时保留上一轮结果并标注过期", () => {
  let clock = 0;
  const compute = evaluateComputeGraph(FIXTURE, {}, {
    now: () => {
      clock += 500;
      return clock;
    },
    previousValues: { monthly_payment: 7397.42 },
  });
  assert.equal(compute.state, "degraded");
  assert.equal(compute.stale, true);
  assert.equal(compute.values.monthly_payment, 7397.42);
  assert.ok(compute.diagnostics.some((entry) => entry.code === "recompute-timeout"));
});

// ---------------------------------------------------------------------------
// §3.5 三表勾稽(下游 D 档与三表模型族的接口)
// ---------------------------------------------------------------------------

function threeStatementProject(withTies = true, balanced = true) {
  const project = clone(baseProject());
  project.metadata.title = "三表联动财务模型样例";
  project.metadata.docKind = "three-statement-model";
  project.parameters = [
    {
      id: "total_liabilities", label: "负债合计", kind: "currency", unit: "元",
      min: 0, max: 10000000, default: 400000, control: "input",
    },
    {
      id: "total_equity", label: "所有者权益", kind: "currency", unit: "元",
      min: 0, max: 10000000, default: 600000, control: "input",
    },
    {
      id: "beginning_cash", label: "期初现金", kind: "currency", unit: "元",
      min: 0, max: 10000000, default: 120000, control: "input",
    },
    {
      id: "net_cash_flow", label: "净现金流", kind: "currency", unit: "元",
      min: -1000000, max: 1000000, default: 30000, control: "input",
    },
    {
      id: "re_begin", label: "期初留存收益", kind: "currency", unit: "元",
      min: 0, max: 10000000, default: 200000, control: "input",
    },
    {
      id: "net_income", label: "净利润", kind: "currency", unit: "元",
      min: -1000000, max: 1000000, default: 90000, control: "input",
    },
    {
      id: "dividends", label: "分红", kind: "currency", unit: "元",
      min: 0, max: 1000000, default: 20000, control: "input",
    },
  ];
  const skew = balanced ? "" : " + 1000";
  project.computations = [
    { id: "total_assets", label: "资产合计", expression: `total_liabilities + total_equity${skew}`, unit: "元", precision: 2 },
    { id: "ending_cash", label: "期末现金", expression: "beginning_cash + net_cash_flow", unit: "元", precision: 2 },
    { id: "re_end", label: "期末留存收益", expression: "re_begin + net_income - dividends", unit: "元", precision: 2 },
    { id: "equity_ratio", label: "权益占比", expression: "total_equity / total_assets", precision: 4 },
  ];
  project.datasets = undefined;
  delete project.datasets;
  project.attribution.entries[0].datasetId = undefined;
  delete project.attribution.entries[0].datasetId;
  project.blocks = [
    { id: "intro", kind: "prose", span: 12, title: "三表模型", text: INTRO_PROSE },
    {
      id: "panel", kind: "parameter-panel", span: 4, title: "驱动参数",
      parameterIds: ["total_liabilities", "total_equity", "beginning_cash", "net_cash_flow"],
    },
    { id: "m-assets", kind: "metric", span: 4, title: "资产合计", bind: "total_assets" },
    { id: "m-cash", kind: "metric", span: 4, title: "期末现金", bind: "ending_cash" },
    {
      id: "tie-table", kind: "table", span: 12, title: "勾稽表",
      table: {
        rows: [
          { label: "期末留存收益", bind: "re_end", emphasis: "subtotal" },
          { label: "权益占比", bind: "equity_ratio", emphasis: "none" },
        ],
      },
    },
    { id: "method", kind: "prose", span: 12, title: "方法学", text: METHOD_PROSE },
  ];
  project.validation = withTies ? threeStatementTieValidations() : [];
  return project;
}

test("§3.5 三表勾稽的表达方式可用:三条 error 级 validation + C25 容差", () => {
  const rules = threeStatementTieValidations();
  assert.equal(rules.length, 3);
  assert.deepEqual(
    rules.map((rule) => rule.id),
    [...THREE_STATEMENT_TIE_IDS],
  );
  for (const rule of rules) {
    assert.equal(rule.severity, "error");
    assert.equal(rule.tolerance, INTERACTIVE_DOC_LIMITS.threeStatementTolerance);
    assert.equal(INTERACTIVE_DOC_LIMITS.threeStatementTolerance, 0.01);
    // 勾稽表达式本身必须落在 §3.4 封闭子集内。
    const parsed = parseInteractiveDocExpression(rule.assert);
    assert.equal(parsed.ok, true, `${rule.id} 的 assert 必须可解析: ${rule.assert}`);
    assert.deepEqual(parsed.expression.functions, ["abs"]);
  }
  // 可自定义绑定名,供下游族接线。
  const custom = threeStatementTieValidations({ totalAssets: "assets_sum" });
  assert.ok(custom[0].assert.includes("assets_sum"));
});

test("§3.5 / F8:勾稽齐则通过,缺失或不平则受控失败", () => {
  const tied = canonical(threeStatementProject(true, true));
  const compute = evaluateComputeGraph(tied, {});
  assert.equal(compute.state, "ready");
  const assessment = assessThreeStatementTies(tied, compute);
  assert.deepEqual(assessment.missing, []);
  assert.deepEqual(assessment.failed, []);
  assert.equal(assessment.ok, true);
  assert.equal(compute.values.total_assets, 1000000);
  assert.equal(compute.values.ending_cash, 150000);
  assert.equal(compute.values.re_end, 270000);

  const untied = canonical(threeStatementProject(false, true));
  const missing = assessThreeStatementTies(untied);
  assert.deepEqual(missing.missing, [...THREE_STATEMENT_TIE_IDS]);
  const completeness = assessInteractiveDocCompleteness(untied);
  assert.equal(completeness.ok, false);
  assert.ok(
    completeness.failures.some((failure) => failure.code === "three-statement-ties-missing"),
  );

  // 资产端多出 1,000 元,超过 0.01 容差 → balance_identity 判失败。
  const skewed = canonical(threeStatementProject(true, false));
  const skewedCompute = evaluateComputeGraph(skewed, {});
  const balance = skewedCompute.validation.find((entry) => entry.id === "balance_identity");
  assert.equal(balance.passed, false);
  assert.equal(balance.severity, "error");
  assert.deepEqual(assessThreeStatementTies(skewed, skewedCompute).failed, [
    "balance_identity",
  ]);
});

// ---------------------------------------------------------------------------
// §8 完备判据:静态文档必须判不合格
// ---------------------------------------------------------------------------

test("§8.2:样例可算文档判合格,并交代抓帧判据由渲染层承担", () => {
  const assessment = assessInteractiveDocCompleteness(FIXTURE);
  assert.deepEqual(assessment.failures, []);
  assert.equal(assessment.ok, true);
  assert.ok(assessment.sourceBytes >= INTERACTIVE_DOC_LIMITS.sourceBytesMin);
  assert.equal(assessment.deferred.length, 1);
  assert.ok(assessment.deferred[0].includes("16"));
});

test("§8.2 / F1:静态无行为的文档判不合格(not-reactive)", () => {
  const project = clone(baseProject());
  // 计算图与参数彻底脱钩 —— 排版文档冒充可算文档。
  project.computations = [
    { id: "const_a", label: "常量甲", expression: "1 + 1" },
    { id: "const_b", label: "常量乙", expression: "const_a * 2" },
  ];
  project.blocks = project.blocks.filter(
    (block) => block.kind !== "chart" && block.kind !== "formula",
  );
  project.blocks[2].bind = "const_a";
  project.blocks[3].bind = "const_b";
  project.blocks.find((block) => block.kind === "table").table = {
    rows: [{ label: "常量甲", bind: "const_a", emphasis: "none" }],
  };
  project.validation = [];
  const inert = canonical(project);
  const reactivity = probeInteractiveDocReactivity(inert);
  assert.equal(reactivity.ok, false);
  assert.equal(reactivity.probes.every((probe) => probe.reactive === false), true);
  const assessment = assessInteractiveDocCompleteness(inert);
  assert.equal(assessment.ok, false);
  assert.ok(assessment.failures.some((failure) => failure.code === "not-reactive"));
});

test("§8.2 / F1:空壳文档在四条计数判据上被判 inert", () => {
  const shell = canonicalInteractiveDocProject({
    ...clone(baseProject()),
    blocks: [
      { id: "a", kind: "prose", span: 12, text: "空壳" },
      { id: "b", kind: "prose", span: 12, text: "空壳" },
      { id: "c", kind: "prose", span: 12, text: "空壳" },
      { id: "d", kind: "divider", span: 12 },
    ],
  });
  const assessment = assessInteractiveDocCompleteness(shell, { skipReactivity: true });
  assert.equal(assessment.ok, false);
  const codes = assessment.failures.map((failure) => failure.code);
  assert.ok(codes.includes("interactive-doc-inert"), `实际 ${codes.join(",")}`);
  assert.ok(codes.includes("prose-too-short"));
  assert.ok(codes.includes("dead-computations"));
});

test("§8.1:低于 8,192 B 的源被判 source-too-small", () => {
  // 结构上刚好合法(C1/C3/C5 都踩线),但字节远不到 §8.1 下限的骨架文档。
  const small = canonical({
    schema: INTERACTIVE_DOC_PROJECT_SCHEMA,
    version: 1,
    metadata: {
      title: "骨架文档字节下限样例",
      locale: "zh-CN",
      docKind: "calculator",
      createdAt: "2026-07-29T00:00:00Z",
    },
    parameters: [
      { id: "a", label: "甲值", kind: "number", unit: "元", min: 0, max: 10, default: 1 },
      { id: "b", label: "乙值", kind: "number", unit: "元", min: 0, max: 10, default: 2 },
      { id: "c", label: "丙值", kind: "boolean", default: true },
    ],
    computations: [
      { id: "s", label: "和", expression: "a + b" },
      { id: "d", label: "差", expression: "a - b" },
    ],
    blocks: [
      { id: "t", kind: "prose", span: 12, text: "短" },
      { id: "m1", kind: "metric", span: 6, bind: "s" },
      { id: "m2", kind: "metric", span: 6, bind: "d" },
      { id: "hr", kind: "divider", span: 12 },
    ],
    attribution: {
      entries: [
        { text: "自造", licenseCode: "CC0-1.0", licenseUrl: "https://example.com/cc0" },
      ],
    },
  });
  const bytes = interactiveDocSourceByteLength(small);
  assert.ok(bytes < INTERACTIVE_DOC_LIMITS.sourceBytesMin, `实际 ${bytes} B`);
  const assessment = assessInteractiveDocCompleteness(small, { skipReactivity: true });
  assert.ok(assessment.failures.some((failure) => failure.code === "source-too-small"));
  assert.equal(assessment.sourceBytes, bytes);
});

test("F6:逐字节相同的同族文档按 Jaccard 判为孪生", () => {
  const twin = interactiveDocSimilarity(FIXTURE, parseInteractiveDocSource(
    serializeInteractiveDocProject(FIXTURE),
  ));
  assert.equal(twin.jaccard, 1);
  assert.equal(twin.twin, true);
  const other = clone(baseProject());
  other.computations = other.computations.map((node) => {
    const { dependsOn, ...rest } = node;
    return { ...rest, id: `${node.id}_x`, expression: "1 + 1" };
  });
  other.blocks = other.blocks.map((block) =>
    block.bind ? { ...block, bind: `${block.bind}_x` } : block,
  );
  other.blocks.find((block) => block.kind === "table").table.rows = [
    { label: "x", bind: "total_payment_x", emphasis: "none" },
  ];
  other.blocks.find((block) => block.kind === "chart").chart.series = [
    { name: "x", bind: "flow_series_x" },
  ];
  other.blocks.find((block) => block.kind === "formula").formula.computationId =
    "base_payment_x";
  other.validation = [];
  const distinct = interactiveDocSimilarity(FIXTURE, canonical(other));
  assert.equal(distinct.twin, false);
  assert.ok(distinct.jaccard < INTERACTIVE_DOC_LIMITS.familyJaccardMax);
});

// ---------------------------------------------------------------------------
// 呈现投影(W7 消费面)
// ---------------------------------------------------------------------------

test("renderInteractiveDocBlock:纯数据模型,永不输出 NaN 字面量或 HTML 串", () => {
  const compute = evaluateComputeGraph(FIXTURE, {});
  const rendered = renderInteractiveDocDocument(FIXTURE, compute);
  assert.equal(rendered.length, FIXTURE.blocks.length);
  const serialized = JSON.stringify(rendered);
  assert.equal(/NaN|Infinity/.test(serialized), false);
  assert.equal(/<\s*script/i.test(serialized), false);

  const metric = rendered.find((entry) => entry.blockId === "m-payment");
  assert.equal(metric.kind, "metric");
  assert.equal(
    metric.node.display,
    `${compute.values.monthly_payment.toFixed(2)} 元`,
  );
  assert.deepEqual(metric.node.dependsOnParameters.includes("annual_rate"), true);

  const chart = rendered.find((entry) => entry.kind === "chart");
  assert.deepEqual(chart.node.option.series[0].data, [72000, 71000, 70000, 69000, 68000]);
  assert.equal(chart.node.option.series[0].type, "line");

  const formula = rendered.find((entry) => entry.kind === "formula");
  assert.equal(formula.node.steps.length, 3);
  assert.equal(formula.node.steps.every((step) => step.ok), true);

  // 值缺失时给占位符 + 消息,不给 NaN(F3)。
  const project = clone(baseProject());
  project.computations[3].expression = "ln(0)";
  const broken = canonical(project);
  const brokenCompute = evaluateComputeGraph(broken, {});
  const brokenMetric = renderInteractiveDocBlock({
    project: broken,
    block: broken.blocks.find((block) => block.id === "m-payment"),
    compute: brokenCompute,
  });
  assert.equal(brokenMetric.node.display, INTERACTIVE_DOC_VALUE_PLACEHOLDER);
  assert.deepEqual(brokenMetric.placeholders, ["monthly_payment"]);
});

// ---------------------------------------------------------------------------
// 提交路径(ADR-04 + §3.3 保存禁令)
// ---------------------------------------------------------------------------

function libraryItem(overrides = {}) {
  const artifactId = "artifact-doc-1";
  const revisionId = "rev-1";
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    id: artifactId,
    artifactId,
    revisionId,
    artifactType: overrides.artifactType ?? INTERACTIVE_DOC_ARTIFACT_TYPE,
    siteId: "oceanleo",
    title: "等额本息贷款可算文档",
    meta: {},
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId,
      artifactType: overrides.artifactType ?? INTERACTIVE_DOC_ARTIFACT_TYPE,
      sourceFormat: overrides.sourceFormat ?? INTERACTIVE_DOC_PROJECT_SCHEMA,
      editorCapability: "interactive-doc-editor",
      editability: "native",
      integrity: { ok: overrides.integrityOk ?? true, reason: "" },
      access: { canRead: true, canEdit: overrides.canEdit ?? true, canFork: true },
      owner: { visibility: "private" },
      renditions: {},
    },
  };
}

function stubDependencies(overrides = {}) {
  const digest = "a".repeat(64);
  return {
    upload: async () => ({ ok: true, data: { file: { url: "https://cdn.oceanleo.com/doc.json", meta: {} } } }),
    publish: async (artifactId, commit) => {
      overrides.onPublish?.(artifactId, commit);
      return {
        ok: true,
        data: {
          key: `artifact:${artifactId}:rev-2`,
          id: artifactId,
          artifactId,
          revisionId: "rev-2",
          artifactType: INTERACTIVE_DOC_ARTIFACT_TYPE,
          meta: {},
          artifact: {
            schema: "oceanleo.artifact.v1",
            artifactId,
            revisionId: "rev-2",
            artifactType: INTERACTIVE_DOC_ARTIFACT_TYPE,
            sourceFormat: INTERACTIVE_DOC_PROJECT_SCHEMA,
            editorCapability: "interactive-doc-editor",
            editability: "native",
            integrity: { ok: true, reason: "" },
            access: { canRead: true, canEdit: true, canFork: true },
            owner: { visibility: "private" },
            renditions: {
              source: {
                purpose: "source",
                revisionId: "rev-2",
                url: "https://cdn.oceanleo.com/doc.json",
                digest,
              },
            },
          },
        },
      };
    },
    digest: async () => digest,
  };
}

test("commitInteractiveDocProject:JSON 落库、四元组正确、renditions 齐", async () => {
  let seen = null;
  const dependencies = stubDependencies({ onPublish: (_id, commit) => (seen = commit) });
  const result = await commitInteractiveDocProject({
    project: FIXTURE,
    item: libraryItem(),
    dependencies,
  });
  assert.equal(result.ok, true);
  assert.equal(result.projectSchema, INTERACTIVE_DOC_PROJECT_SCHEMA);
  assert.equal(result.artifactType, "interactive_doc");
  assert.equal(result.revisionId, "rev-2");
  assert.ok(result.byteSize >= INTERACTIVE_DOC_LIMITS.sourceBytesMin);
  assert.equal(result.json, serializeInteractiveDocProject(FIXTURE));
  assert.equal(seen.source.format, INTERACTIVE_DOC_PROJECT_SCHEMA);
  assert.equal(seen.artifactType, "interactive_doc");
  assert.deepEqual(
    seen.renditions.map((rendition) => rendition.purpose).sort(),
    ["editor_manifest", "full"],
  );
  assert.equal(result.nativeCover, true);
});

test("commitInteractiveDocProject:孪生与不完备工程被拒", async () => {
  await assert.rejects(
    () =>
      commitInteractiveDocProject({
        project: FIXTURE,
        item: libraryItem(),
        familyProjects: [FIXTURE],
        dependencies: stubDependencies(),
      }),
    (error) => error.code === "interactive-doc-twin",
  );

  const project = clone(baseProject());
  for (const block of project.blocks) {
    if (block.kind === "prose") block.text = "短";
  }
  await assert.rejects(
    () =>
      commitInteractiveDocProject({
        project: canonical(project),
        item: libraryItem(),
        dependencies: stubDependencies(),
      }),
    (error) => error instanceof InteractiveDocCommitError,
  );
});
