import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  INTERACTIVE_DOC_CONTRAST_OBLIGATIONS,
  INTERACTIVE_DOC_CONTROL_TYPES,
  INTERACTIVE_DOC_GRID,
  INTERACTIVE_DOC_PALETTE,
  INTERACTIVE_DOC_PARAMETER_KINDS,
  INTERACTIVE_DOC_TYPE_SCALE,
  INTERACTIVE_DOC_VALUE_PLACEHOLDER,
  INTERACTIVE_DOC_WCAG_OBLIGATIONS,
  coerceInteractiveDocParameter,
  contrastRatio,
  formatInteractiveDocValue,
  interactiveDocControlDescriptor,
  interactiveDocControlsForKind,
  interactiveDocDefaultControl,
  interactiveDocSelectionControls,
  parseInteractiveDocText,
} from "../src/shell/interactive-doc-editor/interactive-doc-controls.ts";
import {
  INTERACTIVE_DOC_FORBIDDEN_TRANSITIONS,
  INTERACTIVE_DOC_FUNCTION_WHITELIST,
  INTERACTIVE_DOC_LIMITS,
  INTERACTIVE_DOC_SCHEMA_ID,
  INTERACTIVE_DOC_TRANSITIONS,
  createInteractiveDocEngine,
  interactiveDocEditorManifest,
  interactiveDocExpressionIdentifiers,
  interactiveDocTopology,
  interactiveDocTransition,
  isForbiddenInteractiveDocTransition,
  linkInteractiveDocProject,
  planInteractiveDocRecompute,
} from "../src/shell/interactive-doc-editor/use-interactive-doc-workbench.ts";
import { InteractiveDocHistory } from "../src/shell/interactive-doc-editor/interactive-doc-history.ts";

const EDITOR_DIR = new URL(
  "../src/shell/interactive-doc-editor/",
  import.meta.url,
);
const OWNED_FILES = [
  "use-interactive-doc-workbench.ts",
  "interactive-doc-controls.ts",
  "interactive-doc-history.ts",
  "InteractiveDocStage.tsx",
  "InteractiveDocControls.tsx",
  "InteractiveDocContextToolbar.tsx",
];
const ROUTE_FILE = new URL(
  "../src/shell/advanced-routes/InteractiveDocRoute.tsx",
  import.meta.url,
);

function readOwned(name) {
  return readFileSync(new URL(name, EDITOR_DIR), "utf8");
}

const PROSE = `本文档是一份可算的按月还款计算器。改动任一输入参数后，下游的月供、总还款额与利息合计会按拓扑序重算，
所有结果卡都声明了它依赖的参数 id，便于读屏软件把输入与结果关联起来。除零、非有限数与超出取值域的输入都会
以文本形式给出受控提示，而不是静默吞掉或直接显示 NaN。表格线与控件边界使用 doc.rule.strong，装饰性分隔线
使用 doc.border，两者的对比度义务分别取 3.0:1 与 1.05:1。自测卷与间隔排程块的推进结果会写回参数并经
持久化端口落库，因此关掉页面再打开也不会丢掉学习进度。本段正文长度用于满足内容完备判据里 prose 合计
不少于 300 字符的要求，避免出现「排版冒充计算」的空壳文档。`;

function calculatorProject(overrides = {}) {
  return {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "等额本息按月还款计算器",
      locale: "zh-CN",
      docKind: "calculator",
      createdAt: "2026-07-29T00:00:00Z",
    },
    theme: { accent: "#1F6FEB", density: "regular", gridColumns: 12 },
    parameters: [
      {
        id: "principal",
        label: "本金",
        kind: "currency",
        unit: "元",
        min: 0,
        max: 10000000,
        step: 1000,
        precision: 2,
        default: 3000000,
      },
      {
        id: "annual_rate",
        label: "年利率",
        kind: "percent",
        unit: "%",
        min: 0,
        max: 24,
        step: 0.05,
        precision: 2,
        control: "slider",
        default: 4.9,
      },
      {
        id: "months",
        label: "期数",
        kind: "integer",
        unit: "期",
        min: 1,
        max: 360,
        step: 1,
        default: 240,
      },
      {
        id: "insured",
        label: "含保险",
        kind: "boolean",
        default: false,
      },
      {
        id: "repay_plan",
        label: "还款方式",
        kind: "enum",
        control: "radio",
        options: [
          { value: "equal_installment", label: "等额本息" },
          { value: "equal_principal", label: "等额本金" },
        ],
        default: "equal_installment",
      },
      {
        id: "first_due",
        label: "首期日",
        kind: "date",
        default: "2026-09-01",
      },
      {
        id: "memo",
        label: "备注",
        kind: "text",
        default: "自用住房",
      },
    ],
    computations: [
      { id: "monthly_rate", label: "月利率", expression: "annual_rate / 1200", precision: 6 },
      {
        id: "payment",
        label: "月供",
        expression: "pmt(monthly_rate, months, principal)",
        unit: "元",
        precision: 2,
      },
      { id: "total_paid", label: "总还款", expression: "payment * months", unit: "元", precision: 2 },
      { id: "interest", label: "利息合计", expression: "total_paid - principal", unit: "元", precision: 2 },
    ],
    blocks: [
      { id: "intro", kind: "prose", span: 12, title: "说明", text: PROSE },
      {
        id: "inputs",
        kind: "parameter-panel",
        span: 4,
        title: "参数",
        parameterIds: [
          "principal",
          "annual_rate",
          "months",
          "insured",
          "repay_plan",
          "first_due",
          "memo",
        ],
      },
      { id: "metric-payment", kind: "metric", span: 3, title: "月供", bind: "payment" },
      { id: "metric-interest", kind: "metric", span: 3, title: "利息合计", bind: "interest" },
      {
        id: "table-summary",
        kind: "table",
        span: 12,
        title: "汇总",
        table: {
          rows: [
            { label: "总还款", bind: "total_paid", emphasis: "subtotal" },
            { label: "利息合计", bind: "interest", emphasis: "total" },
          ],
        },
      },
      {
        id: "chart-payment",
        kind: "chart",
        span: 12,
        title: "月供构成",
        chart: {
          chartType: "bar",
          xAxisLabel: "项目",
          yAxisLabel: "元",
          series: [{ name: "月供", bind: "payment", color: "#1F6FEB" }],
        },
      },
      {
        id: "formula-payment",
        kind: "formula",
        span: 12,
        title: "月供展开",
        formula: {
          computationId: "payment",
          steps: [
            { expression: "annual_rate / 1200", note: "月利率" },
            { expression: "pmt(monthly_rate, months, principal)", note: "等额本息月供" },
          ],
        },
      },
      { id: "note", kind: "callout", span: 12, callout: "info", text: "利率变化会**同时**影响月供与利息。" },
      { id: "rule", kind: "divider", span: 12 },
    ],
    validation: [
      {
        id: "payment_positive",
        assert: "payment > 0",
        message: "月供必须为正数",
        severity: "error",
      },
      {
        id: "interest_reasonable",
        assert: "interest >= 0",
        message: "利息合计不应为负",
        severity: "warn",
      },
    ],
    interactions: {
      recomputeMode: "on-change",
      resetEnabled: true,
      scenarioSlots: 2,
      maxRecomputeMs: 200,
    },
    exports: ["json", "csv"],
    attribution: {
      entries: [
        {
          text: "公开会计恒等式与等额本息公式",
          licenseCode: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
      ],
    },
    ...overrides,
  };
}

function pmt(rate, months, principal) {
  const r = Number(rate);
  const n = Number(months);
  const p = Number(principal);
  if (!r) return n ? p / n : null;
  const factor = Math.pow(1 + r, n);
  return (p * r * factor) / (factor - 1);
}

const CALCULATOR_NODES = {
  monthly_rate: (scope) => Number(scope.annual_rate) / 1200,
  payment: (scope) => pmt(scope.monthly_rate, scope.months, scope.principal),
  total_paid: (scope) => Number(scope.payment) * Number(scope.months),
  interest: (scope) => Number(scope.total_paid) - Number(scope.principal),
  assert_payment_positive: (scope) => Number(scope.payment) > 0,
  assert_interest_reasonable: (scope) => Number(scope.interest) >= 0,
};

/**
 * The data layer (W6) is stubbed by a table of node closures. No `eval` and no
 * `new Function`: each node is a plain JS function, so the test exercises this
 * viewport's topological ordering rather than an expression parser.
 */
function makePorts(table, options = {}) {
  const calls = { evaluate: 0, node: [], commits: [] };
  const clock = { value: 0, step: 0 };
  const ports = {
    projectSchema: "oceanleo.interactive-doc.v1",
    parse: (text) => JSON.parse(String(text)),
    serialize: (project) => JSON.stringify(project),
    validate: () => ({ ok: true }),
    evaluate: (project, inputs) => {
      calls.evaluate += 1;
      const scope = { ...inputs };
      const ids = (project.computations || []).map((node) => node.id);
      for (let pass = 0; pass < ids.length + 1; pass += 1) {
        for (const id of ids) {
          if (table[id]) scope[id] = table[id](scope);
        }
      }
      const values = {};
      for (const id of ids) values[id] = scope[id] === undefined ? null : scope[id];
      return { ok: true, values };
    },
    commit: async (args) => {
      calls.commits.push(args);
      return { ok: true, revisionId: `rev-${calls.commits.length}` };
    },
    render: (args) => ({ rendered: true, blockId: args.block.id }),
    now: () => {
      const current = clock.value;
      clock.value += clock.step;
      return current;
    },
  };
  if (options.perNode) {
    ports.evaluateNode = ({ nodeId, scope }) => {
      calls.node.push(nodeId);
      return table[nodeId] ? table[nodeId](scope) : null;
    };
  }
  return { ports, calls, clock };
}

test("§3.2 参数控件族覆盖全部 8 种 kind 与全部 7 种 control", () => {
  assert.deepEqual(
    [...INTERACTIVE_DOC_PARAMETER_KINDS],
    ["number", "integer", "percent", "currency", "boolean", "enum", "date", "text"],
  );
  assert.deepEqual(
    [...INTERACTIVE_DOC_CONTROL_TYPES],
    ["input", "slider", "stepper", "select", "switch", "radio", "date-picker"],
  );
  const reachable = new Set();
  for (const kind of INTERACTIVE_DOC_PARAMETER_KINDS) {
    const controls = interactiveDocControlsForKind(kind);
    assert.ok(controls.length >= 1, `${kind} 至少要有一个控件`);
    assert.ok(
      controls.includes(interactiveDocDefaultControl(kind)),
      `${kind} 的默认控件必须在允许集合内`,
    );
    for (const control of controls) reachable.add(control);
  }
  assert.deepEqual(
    [...reachable].sort(),
    [...INTERACTIVE_DOC_CONTROL_TYPES].sort(),
    "§3.2 声明的 7 种 control 必须全部被控件族覆盖",
  );
});

test("控件描述符尊重显式 control 并按 kind 回退", () => {
  const project = calculatorProject();
  const slider = interactiveDocControlDescriptor({
    parameter: project.parameters[1],
    value: 5.5,
  });
  assert.equal(slider.control, "slider");
  assert.equal(slider.domainHint, "取值域 0 – 24 %");
  const radio = interactiveDocControlDescriptor({
    parameter: project.parameters[4],
    value: "equal_principal",
  });
  assert.equal(radio.control, "radio");
  assert.equal(radio.options.length, 2);
  const currency = interactiveDocControlDescriptor({
    parameter: project.parameters[0],
    value: 100,
  });
  assert.equal(currency.control, "input");
  const date = interactiveDocControlDescriptor({
    parameter: project.parameters[5],
    value: "2026-09-01",
  });
  assert.equal(date.control, "date-picker");
  const bool = interactiveDocControlDescriptor({
    parameter: project.parameters[3],
    value: true,
  });
  assert.equal(bool.control, "switch");
  assert.equal(bool.minHeightPx, INTERACTIVE_DOC_GRID.controlMinHeightPx);
  const declaredBadControl = interactiveDocControlDescriptor({
    parameter: { ...project.parameters[3], control: "slider" },
    value: true,
  });
  assert.equal(
    declaredBadControl.control,
    "switch",
    "boolean 不接受 slider，必须回退到 switch",
  );
});

test("§6 F5 / SC 3.3.1 非法输入给受控文本提示，不静默吞掉", () => {
  const project = calculatorProject();
  const months = project.parameters[2];
  const outOfRange = coerceInteractiveDocParameter(months, 400);
  assert.equal(outOfRange.ok, false);
  assert.equal(outOfRange.issue.code, "interactive-doc-parameter-out-of-range");
  assert.match(outOfRange.issue.message, /1 – 360 期/);
  const notNumber = coerceInteractiveDocParameter(months, "abc");
  assert.equal(notNumber.issue.code, "interactive-doc-parameter-not-a-number");
  const notInteger = coerceInteractiveDocParameter(months, 12.5);
  assert.equal(notInteger.issue.code, "interactive-doc-parameter-not-an-integer");
  const badEnum = coerceInteractiveDocParameter(project.parameters[4], "nope");
  assert.equal(badEnum.issue.code, "interactive-doc-parameter-not-in-options");
  const badDate = coerceInteractiveDocParameter(project.parameters[5], "2026-02-31");
  assert.equal(badDate.issue.code, "interactive-doc-parameter-invalid-date");
  const goodDate = coerceInteractiveDocParameter(project.parameters[5], "2026-02-28");
  assert.equal(goodDate.ok, true);
  const offStep = coerceInteractiveDocParameter(project.parameters[1], 4.93);
  assert.equal(offStep.ok, true);
  assert.equal(offStep.issue.code, "interactive-doc-parameter-off-step");
  assert.equal(offStep.issue.severity, "warn");
  const boolInput = coerceInteractiveDocParameter(project.parameters[3], "true");
  assert.deepEqual(boolInput, { ok: true, value: true });
  // §6 F5 —— 缺 min/max/unit 的数值参数必须报出来，渲染器不得用默认域兜。
  const missingDomain = linkInteractiveDocProject(
    calculatorProject({
      parameters: [
        { id: "bare", label: "裸数值", kind: "number", default: 1 },
        ...calculatorProject().parameters.slice(1),
      ],
    }),
  );
  assert.ok(
    missingDomain.diagnostics.some(
      (entry) => entry.code === "interactive-doc-parameter-missing-domain",
    ),
  );
  const shortLabel = linkInteractiveDocProject(
    calculatorProject({
      parameters: [
        { ...calculatorProject().parameters[0], label: "本" },
        ...calculatorProject().parameters.slice(1),
      ],
    }),
  );
  assert.ok(
    shortLabel.diagnostics.some(
      (entry) => entry.code === "interactive-doc-parameter-label-too-short",
    ),
    "SC 2.4.6 label ≥ 2 字符",
  );
});

test("§3.3 拓扑排序确定、深度可算、依赖来自 dependsOn 与表达式扫描", () => {
  const project = calculatorProject();
  const topology = interactiveDocTopology(project);
  assert.deepEqual(topology.order, [
    "monthly_rate",
    "payment",
    "total_paid",
    "interest",
  ]);
  assert.equal(topology.cycle, null);
  assert.equal(topology.depth, 4);
  assert.deepEqual(topology.dependencies.payment, [
    "monthly_rate",
    "months",
    "principal",
  ]);
  assert.deepEqual(topology.dependents.annual_rate, ["monthly_rate"]);
  const again = interactiveDocTopology(calculatorProject());
  assert.deepEqual(again.order, topology.order, "§5.4 同一份源必须得到同一顺序");
  // 每个节点都排在其上游之后
  for (const nodeId of topology.order) {
    const position = topology.order.indexOf(nodeId);
    for (const upstream of topology.dependencies[nodeId] || []) {
      if (!topology.order.includes(upstream)) continue;
      assert.ok(
        topology.order.indexOf(upstream) < position,
        `${upstream} 必须排在 ${nodeId} 之前`,
      );
    }
  }
  assert.deepEqual(
    interactiveDocExpressionIdentifiers("pmt(monthly_rate, months, principal)"),
    ["monthly_rate", "months", "principal"],
    "白名单函数在调用位不算依赖",
  );
  assert.deepEqual(
    interactiveDocExpressionIdentifiers('lookup(rates, "principal", months)'),
    ["rates", "months"],
    "字符串字面量里的词不算依赖",
  );
  assert.equal(INTERACTIVE_DOC_FUNCTION_WHITELIST.length, 24, "§4 C11");
});

test("§6 F2 循环依赖被检出并打印环上完整 id 序列", () => {
  const cyclic = calculatorProject({
    computations: [
      { id: "interest_expense", label: "利息", expression: "debt * 0.05" },
      { id: "net_income", label: "净利", expression: "revenue - interest_expense" },
      { id: "cash", label: "现金", expression: "net_income + 100" },
      { id: "debt", label: "债务", expression: "cash * 0.5" },
      { id: "revenue", label: "收入", expression: "principal * 0.1" },
    ],
    blocks: calculatorProject().blocks.map((block) =>
      block.id === "metric-payment"
        ? { ...block, bind: "net_income" }
        : block.id === "metric-interest"
          ? { ...block, bind: "debt" }
          : block.kind === "table"
            ? {
                ...block,
                table: {
                  rows: [
                    { label: "现金", bind: "cash", emphasis: "total" },
                    { label: "收入", bind: "revenue", emphasis: "none" },
                  ],
                },
              }
            : block.kind === "chart"
              ? {
                  ...block,
                  chart: {
                    chartType: "line",
                    series: [{ name: "现金", bind: "cash" }],
                  },
                }
              : block.kind === "formula"
                ? {
                    ...block,
                    formula: {
                      computationId: "net_income",
                      steps: [
                        { expression: "debt * 0.05", note: "利息" },
                        { expression: "revenue - interest_expense", note: "净利" },
                      ],
                    },
                  }
                : block,
    ),
    validation: [],
  });
  const link = linkInteractiveDocProject(cyclic);
  assert.equal(link.phase, "cyclic");
  assert.ok(link.topology.cycle, "必须给出环");
  const cycle = link.topology.cycle;
  assert.equal(cycle[0], cycle[cycle.length - 1], "环序列首尾同一个 id");
  for (const id of ["interest_expense", "net_income", "cash", "debt"]) {
    assert.ok(cycle.includes(id), `${id} 必须出现在环序列里`);
  }
  const diagnostic = link.diagnostics.find(
    (entry) => entry.code === "interactive-doc-cyclic",
  );
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /→/, "MUST NOT 只说「计算失败」");

  const { ports } = makePorts({});
  const engine = createInteractiveDocEngine({ project: cyclic, ports });
  assert.equal(engine.state().phase, "cyclic");
  const refused = engine.setParameter("principal", 123456);
  assert.equal(refused.ok, false);
  assert.equal(refused.issue.code, "interactive-doc-cyclic");
  assert.equal(engine.recompute(["principal"]).ok, false);
  assert.equal(isForbiddenInteractiveDocTransition("cyclic", "computing"), true);
  assert.equal(isForbiddenInteractiveDocTransition("cyclic", "ready"), true);
});

test("§3.3 状态机迁移表与 5 条非法迁移逐条落地", () => {
  const rows = INTERACTIVE_DOC_TRANSITIONS.map(
    (entry) => `${entry.from}->${entry.event}->${entry.to}`,
  );
  for (const expected of [
    "empty->source-bytes->parsing",
    "parsing->parse-failed->invalid",
    "parsing->parse-ok->linking",
    "linking->link-cyclic->cyclic",
    "linking->link-degraded->degraded",
    "linking->link-invalid->invalid",
    "linking->link-ready->ready",
    "ready->parameter-changed->computing",
    "ready->commit-recompute->computing",
    "computing->compute-done->ready",
    "computing->compute-timeout->degraded",
  ]) {
    assert.ok(rows.includes(expected), `缺迁移 ${expected}`);
  }
  assert.equal(interactiveDocTransition("empty", "source-bytes").to, "parsing");
  const illegal = interactiveDocTransition("parsing", "parameter-changed");
  assert.equal(illegal.ok, false);
  assert.equal(illegal.code, "interactive-doc-illegal-transition");
  assert.deepEqual(
    INTERACTIVE_DOC_FORBIDDEN_TRANSITIONS.map(
      (entry) => `${entry.from}->${entry.to}`,
    ),
    [
      "parsing->ready",
      "cyclic->computing",
      "cyclic->ready",
      "degraded->saving",
      "invalid->computing",
    ],
  );
  for (const entry of INTERACTIVE_DOC_FORBIDDEN_TRANSITIONS) {
    assert.ok(entry.why.length > 4, "每条非法迁移都要写清理由");
  }
});

test("A4 改一个输入 → 下游按拓扑序重算，且只重算下游闭包", () => {
  const { ports, calls } = makePorts(CALCULATOR_NODES, { perNode: true });
  const engine = createInteractiveDocEngine({ project: calculatorProject(), ports });
  const before = engine.state();
  assert.equal(before.phase, "ready");
  const paymentBefore = before.blocks.find((block) => block.id === "metric-payment");
  assert.match(paymentBefore.display, /^\d+\.\d{2} 元$/);
  assert.deepEqual(paymentBefore.dependsOnParameterIds, [
    "annual_rate",
    "months",
    "principal",
  ]);

  calls.node.length = 0;
  const outcome = engine.setParameter("annual_rate", 6.4);
  assert.equal(outcome.ok, true);
  const after = engine.state();
  const paymentAfter = after.blocks.find((block) => block.id === "metric-payment");
  const interestAfter = after.blocks.find((block) => block.id === "metric-interest");
  assert.notEqual(paymentAfter.display, paymentBefore.display, "月供必须变化");
  assert.notEqual(
    interestAfter.display,
    before.blocks.find((block) => block.id === "metric-interest").display,
  );
  const tableAfter = after.blocks.find((block) => block.id === "table-summary");
  assert.notEqual(
    tableAfter.rows[0].display,
    before.blocks.find((block) => block.id === "table-summary").rows[0].display,
    "table 块跟着重算",
  );
  const chartAfter = after.blocks.find((block) => block.id === "chart-payment");
  assert.equal(chartAfter.series[0].display, paymentAfter.display);

  const record = after.lastRecompute;
  assert.deepEqual(record.changed, ["annual_rate"]);
  assert.deepEqual(record.order, [
    "monthly_rate",
    "payment",
    "total_paid",
    "interest",
  ]);
  const evaluated = calls.node.filter((id) => !id.startsWith("assert_"));
  assert.deepEqual(evaluated, record.order, "求值顺序即拓扑序");
  assert.equal(record.timedOut, false);

  // 只改一个孤立参数时，下游闭包为空：不属于依赖链的节点不重算。
  calls.node.length = 0;
  engine.setParameter("memo", "改备注不该触发重算");
  const memoRecord = engine.state().lastRecompute;
  assert.deepEqual(memoRecord.order, [], "memo 没有下游节点");
  assert.deepEqual(
    calls.node.filter((id) => !id.startsWith("assert_")),
    [],
  );

  const plan = planInteractiveDocRecompute(
    interactiveDocTopology(calculatorProject()),
    ["months"],
  );
  assert.deepEqual(plan.order, ["payment", "total_paid", "interest"]);
  assert.ok(!plan.order.includes("monthly_rate"), "上游不重算");
});

test("整图求值端口(evaluateComputeGraph 签名)同样跑通重算联动", () => {
  const { ports, calls } = makePorts(CALCULATOR_NODES);
  const engine = createInteractiveDocEngine({ project: calculatorProject(), ports });
  const first = engine.state().results.payment;
  assert.ok(Number.isFinite(first));
  engine.setParameter("principal", 4000000);
  const second = engine.state().results.payment;
  assert.ok(second > first, "本金变大，月供必须变大");
  assert.ok(calls.evaluate >= 2, "每轮重算都真的调用了数据层求值器");
});

test("§6 F3 非有限数走 guard，呈现层不出现 NaN 字面量", () => {
  const { ports } = makePorts({
    ...CALCULATOR_NODES,
    payment: () => Number.POSITIVE_INFINITY,
    total_paid: () => Number.NaN,
    interest: () => null,
  });
  const engine = createInteractiveDocEngine({ project: calculatorProject(), ports });
  const state = engine.state();
  assert.equal(state.results.payment, null);
  assert.equal(state.results.total_paid, null);
  const metric = state.blocks.find((block) => block.id === "metric-payment");
  assert.equal(metric.display, INTERACTIVE_DOC_VALUE_PLACEHOLDER);
  assert.ok(
    state.diagnostics.some((entry) => entry.code === "interactive-doc-nan-guarded"),
  );
  for (const block of state.blocks) {
    // `tokens` carries authored prose, which is allowed to discuss NaN in
    // words; the guard is about computed values reaching the viewport.
    const { tokens: _authored, ...computed } = block;
    assert.ok(
      !JSON.stringify(computed).includes("NaN"),
      `${block.id} 不得把 NaN 字面量带进呈现层`,
    );
  }
  assert.equal(formatInteractiveDocValue(Number.NaN), INTERACTIVE_DOC_VALUE_PLACEHOLDER);
  assert.equal(formatInteractiveDocValue(null), INTERACTIVE_DOC_VALUE_PLACEHOLDER);
  assert.equal(formatInteractiveDocValue("Infinity"), INTERACTIVE_DOC_VALUE_PLACEHOLDER);
  assert.equal(formatInteractiveDocValue(3.14159, { precision: 2, unit: "元" }), "3.14 元");
});

test("§6 F4 悬空绑定与 §6 F1 空壳都进 invalid 且逐条点名", () => {
  const dangling = linkInteractiveDocProject(
    calculatorProject({
      blocks: calculatorProject().blocks.map((block) =>
        block.id === "metric-payment" ? { ...block, bind: "ghost_node" } : block,
      ),
    }),
  );
  assert.equal(dangling.phase, "invalid");
  assert.deepEqual(dangling.danglingBinds, [
    { blockId: "metric-payment", missing: "ghost_node" },
  ]);
  assert.ok(
    dangling.diagnostics.some(
      (entry) =>
        entry.code === "interactive-doc-dangling-bind" &&
        entry.message.includes("ghost_node"),
    ),
  );

  const inert = linkInteractiveDocProject({
    schema: INTERACTIVE_DOC_SCHEMA_ID,
    version: 1,
    metadata: { title: "只有排版的文档", locale: "zh-CN", docKind: "executable-note", createdAt: "2026-07-29T00:00:00Z" },
    parameters: [],
    computations: [],
    blocks: [{ id: "a", kind: "prose", span: 12, text: "静态文字" }],
    attribution: { entries: [] },
  });
  assert.equal(inert.phase, "invalid");
  assert.equal(inert.inert, true);
  const inertDiagnostic = inert.diagnostics.find(
    (entry) => entry.code === "interactive-doc-inert",
  );
  assert.match(inertDiagnostic.message, /parameters=0/);

  const unresolved = linkInteractiveDocProject(
    calculatorProject({
      computations: [
        { id: "monthly_rate", expression: "annual_rate / 1200" },
        { id: "payment", expression: "pmt(monthly_rate, months, missing_input)" },
        { id: "total_paid", expression: "payment * months" },
        { id: "interest", expression: "total_paid - principal" },
      ],
    }),
  );
  assert.equal(unresolved.phase, "invalid");
  assert.deepEqual(unresolved.topology.unknownReferences, [
    { nodeId: "payment", missing: "missing_input" },
  ]);
});

test("§4 C9 深度上限与 §5.1 死节点判据", () => {
  const computations = [{ id: "n0", expression: "principal * 1" }];
  for (let index = 1; index <= 40; index += 1) {
    computations.push({ id: `n${index}`, expression: `n${index - 1} + 1` });
  }
  const deep = linkInteractiveDocProject(
    calculatorProject({
      computations,
      blocks: calculatorProject().blocks.map((block) =>
        block.kind === "metric" ? { ...block, bind: "n40" } : block,
      ),
      validation: [],
    }),
  );
  assert.ok(deep.topology.depth > INTERACTIVE_DOC_LIMITS.graphDepthMax);
  assert.equal(deep.phase, "invalid");
  assert.ok(
    deep.diagnostics.some(
      (entry) => entry.code === "interactive-doc-graph-too-deep",
    ),
  );

  const withDeadNode = linkInteractiveDocProject(
    calculatorProject({
      computations: [
        ...calculatorProject().computations,
        { id: "orphan", expression: "principal * 2" },
      ],
    }),
  );
  assert.equal(withDeadNode.phase, "ready");
  assert.deepEqual(withDeadNode.deadNodes, ["orphan"]);
  assert.ok(
    withDeadNode.diagnostics.some(
      (entry) => entry.code === "interactive-doc-dead-node",
    ),
  );
  assert.equal(withDeadNode.boundComputationRatio, 0.8);
});

test("§6 F7 缺依赖件 → degraded 且 MUST NOT 保存", async () => {
  const project = calculatorProject({
    datasets: [
      {
        id: "rates",
        columns: [{ name: "month", type: "integer" }],
        source: { dependencyPath: "blobs/rates.csv", rowCount: 12 },
      },
    ],
  });
  const link = linkInteractiveDocProject(project, { availableDependencyPaths: [] });
  assert.equal(link.phase, "degraded");
  assert.deepEqual(link.missingDependencyPaths, ["blobs/rates.csv"]);

  const { ports, calls } = makePorts(CALCULATOR_NODES);
  const engine = createInteractiveDocEngine({
    project,
    ports,
    availableDependencyPaths: [],
  });
  assert.equal(engine.state().phase, "degraded");
  assert.equal(engine.state().savingAllowed, false);
  const saved = await engine.save();
  assert.equal(saved.ok, false);
  assert.equal(saved.code, "interactive-doc-degraded-save-blocked");
  assert.equal(calls.commits.length, 0, "degraded 一次都不许 commit");
  // 改参数仍可重算（§3.3 degraded 的前提是计算只依赖 parameters），但不得回到 ready。
  engine.setParameter("months", 180);
  assert.equal(engine.state().phase, "degraded");

  const fatal = linkInteractiveDocProject(
    {
      ...project,
      computations: [
        ...project.computations,
        { id: "avg_rate", expression: "avg(rates)" },
      ],
      blocks: project.blocks.map((block) =>
        block.id === "metric-interest" ? { ...block, bind: "avg_rate" } : block,
      ),
    },
    { availableDependencyPaths: [] },
  );
  assert.equal(fatal.phase, "invalid");
  assert.ok(
    fatal.diagnostics.some(
      (entry) => entry.code === "interactive-doc-dataset-missing",
    ),
  );
});

test("§3.3 / §5.3 重算超时 → degraded，保留上一轮结果并标注过期", async () => {
  const { ports, clock, calls } = makePorts(CALCULATOR_NODES);
  const engine = createInteractiveDocEngine({ project: calculatorProject(), ports });
  const goodResults = engine.state().results;
  assert.equal(engine.state().phase, "ready");
  clock.step = 500; // 每次读表跳 500 ms > C15 的 200 ms 预算
  engine.setParameter("months", 300);
  const state = engine.state();
  assert.equal(state.phase, "degraded");
  assert.equal(state.stale, true);
  assert.deepEqual(state.results, goodResults, "§5.3 不得清空呈现");
  assert.equal(state.lastRecompute.timedOut, true);
  assert.equal(state.lastRecompute.budgetMs, 200);
  assert.ok(
    state.diagnostics.some(
      (entry) => entry.code === "interactive-doc-recompute-timeout",
    ),
  );
  const saved = await engine.save();
  assert.equal(saved.ok, false);
  assert.equal(calls.commits.length, 0);
});

test("A12 三表勾稽：改驱动参数后 validation 逐条重算并给出失败文本", () => {
  const threeStatement = {
    schema: INTERACTIVE_DOC_SCHEMA_ID,
    version: 1,
    metadata: {
      title: "三表联动财务模型",
      locale: "zh-CN",
      docKind: "three-statement-model",
      createdAt: "2026-07-29T00:00:00Z",
    },
    parameters: [
      { id: "total_liabilities", label: "负债合计", kind: "currency", unit: "元", min: 0, max: 1000000, default: 400000 },
      { id: "total_equity", label: "权益合计", kind: "currency", unit: "元", min: 0, max: 1000000, default: 600000 },
      { id: "assets_override", label: "资产调整", kind: "currency", unit: "元", min: -100000, max: 100000, default: 0 },
      { id: "beginning_cash", label: "期初现金", kind: "currency", unit: "元", min: 0, max: 1000000, default: 50000 },
      { id: "net_cash_flow", label: "现金净流量", kind: "currency", unit: "元", min: -100000, max: 100000, default: 12000 },
      { id: "re_begin", label: "期初留存", kind: "currency", unit: "元", min: 0, max: 1000000, default: 80000 },
      { id: "net_income", label: "净利润", kind: "currency", unit: "元", min: -100000, max: 100000, default: 30000 },
      { id: "dividends", label: "分红", kind: "currency", unit: "元", min: 0, max: 100000, default: 10000 },
    ],
    computations: [
      { id: "total_assets", expression: "total_liabilities + total_equity + assets_override", unit: "元", precision: 2 },
      { id: "ending_cash", expression: "beginning_cash + net_cash_flow", unit: "元", precision: 2 },
      { id: "re_end", expression: "re_begin + net_income - dividends", unit: "元", precision: 2 },
    ],
    blocks: [
      { id: "intro", kind: "prose", span: 12, text: PROSE },
      { id: "inputs", kind: "parameter-panel", span: 4, parameterIds: ["total_liabilities", "total_equity", "assets_override"] },
      { id: "bs", kind: "metric", span: 3, title: "资产合计", bind: "total_assets" },
      { id: "cf", kind: "metric", span: 3, title: "期末现金", bind: "ending_cash" },
      { id: "re", kind: "metric", span: 3, title: "期末留存", bind: "re_end" },
    ],
    validation: [
      { id: "balance_identity", assert: "abs(total_assets - (total_liabilities + total_equity)) <= 0.01", message: "资产 ≠ 负债 + 权益", severity: "error", tolerance: 0.01 },
      { id: "cash_tie", assert: "abs(ending_cash - (beginning_cash + net_cash_flow)) <= 0.01", message: "现金勾稽不平", severity: "error", tolerance: 0.01 },
      { id: "retained_earnings_roll", assert: "abs(re_end - (re_begin + net_income - dividends)) <= 0.01", message: "留存收益滚动不平", severity: "error", tolerance: 0.01 },
    ],
    attribution: {
      entries: [
        { text: "公开会计恒等式", licenseCode: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
      ],
    },
  };
  const nodes = {
    total_assets: (scope) =>
      Number(scope.total_liabilities) +
      Number(scope.total_equity) +
      Number(scope.assets_override),
    ending_cash: (scope) => Number(scope.beginning_cash) + Number(scope.net_cash_flow),
    re_end: (scope) =>
      Number(scope.re_begin) + Number(scope.net_income) - Number(scope.dividends),
    assert_balance_identity: (scope) =>
      Math.abs(
        Number(scope.total_assets) -
          (Number(scope.total_liabilities) + Number(scope.total_equity)),
      ) <= 0.01,
    assert_cash_tie: (scope) =>
      Math.abs(
        Number(scope.ending_cash) -
          (Number(scope.beginning_cash) + Number(scope.net_cash_flow)),
      ) <= 0.01,
    assert_retained_earnings_roll: (scope) =>
      Math.abs(
        Number(scope.re_end) -
          (Number(scope.re_begin) + Number(scope.net_income) - Number(scope.dividends)),
      ) <= 0.01,
  };
  const { ports } = makePorts(nodes);
  const engine = createInteractiveDocEngine({ project: threeStatement, ports });
  const baseline = engine.state();
  assert.equal(baseline.validations.length, 3);
  assert.equal(
    baseline.validations.filter((entry) => entry.severity === "error").length,
    3,
    "§8.2 three-statement-model 需 ≥ 3 条 severity=error 勾稽",
  );
  assert.ok(baseline.validations.every((entry) => entry.passed));

  engine.setParameter("assets_override", 25000);
  const broken = engine.state();
  const failed = broken.validations.find((entry) => entry.ruleId === "balance_identity");
  assert.equal(failed.passed, false);
  assert.equal(failed.message, "资产 ≠ 负债 + 权益");
  assert.ok(
    broken.diagnostics.some(
      (entry) =>
        entry.code === "interactive-doc-validation-failed" &&
        entry.message.includes("balance_identity"),
    ),
    "勾稽失败必须以文本进诊断（SC 3.3.1）",
  );
  assert.notEqual(
    broken.blocks.find((block) => block.id === "bs").display,
    baseline.blocks.find((block) => block.id === "bs").display,
    "A12 改驱动参数后三张表重算联动",
  );
});

test("自测卷块：状态推进、答案校验与解析可见性", () => {
  const quizProject = calculatorProject({
    metadata: {
      title: "自测卷：按月还款要点",
      locale: "zh-CN",
      docKind: "quiz",
      createdAt: "2026-07-29T00:00:00Z",
    },
    blocks: [
      ...calculatorProject().blocks,
      {
        id: "quiz-1",
        kind: "quiz-item",
        span: 12,
        title: "选择题",
        quiz: {
          prompt: "利率上升时月供怎样变化？",
          answerKind: "single-choice",
          choices: ["上升", "下降", "不变"],
          answer: "上升",
          explanation: "月供随月利率单调上升。",
        },
      },
      {
        id: "quiz-2",
        kind: "quiz-item",
        span: 12,
        title: "计算题",
        quiz: {
          prompt: "月利率是年利率的多少分之一？",
          answerKind: "numeric",
          answer: 1200,
          tolerance: 0.5,
          explanation: "年利率百分数除以 1200。",
        },
      },
    ],
  });
  const { ports, calls } = makePorts(CALCULATOR_NODES);
  const engine = createInteractiveDocEngine({ project: quizProject, ports });
  const wrongChoice = engine.submitQuizAnswer("quiz-1", "不在选项里");
  assert.equal(wrongChoice.ok, false);
  assert.equal(wrongChoice.code, "interactive-doc-quiz-answer-not-a-choice");
  const wrong = engine.submitQuizAnswer("quiz-1", "下降");
  assert.deepEqual(wrong, { ok: true, correct: false });
  const right = engine.submitQuizAnswer("quiz-1", "上升");
  assert.equal(right.correct, true);
  const quizBlock = engine
    .state()
    .blocks.find((block) => block.id === "quiz-1");
  assert.equal(quizBlock.attempts, 2);
  assert.equal(quizBlock.correct, true);
  assert.equal(quizBlock.explanationVisible, true);

  assert.equal(
    engine.submitQuizAnswer("quiz-2", "不是数字").code,
    "interactive-doc-quiz-answer-not-a-number",
  );
  assert.equal(engine.submitQuizAnswer("quiz-2", 1200.4).correct, true, "容差内算对");
  assert.equal(engine.submitQuizAnswer("quiz-2", 1190).correct, false);
  engine.revealQuizExplanation("quiz-2");
  assert.equal(
    engine.state().blocks.find((block) => block.id === "quiz-2").explanationVisible,
    true,
  );
  assert.equal(engine.state().dirty, true, "状态推进算文档改动");
});

test("间隔排程块：SM-2 状态推进写回参数并经 persistence 端口持久化", async () => {
  const scheduleProject = {
    schema: INTERACTIVE_DOC_SCHEMA_ID,
    version: 1,
    metadata: {
      title: "间隔重复排程卡片",
      locale: "zh-CN",
      docKind: "spaced-repetition",
      createdAt: "2026-07-29T00:00:00Z",
    },
    parameters: [
      { id: "quality", label: "本次评分", kind: "integer", unit: "分", min: 0, max: 5, step: 1, default: 4 },
      { id: "ease_factor", label: "易度因子", kind: "number", unit: "无量纲", min: 1.3, max: 3.5, default: 2.5, precision: 2 },
      { id: "repetition", label: "重复次数", kind: "integer", unit: "次", min: 0, max: 999, step: 1, default: 0 },
      { id: "interval_days", label: "当前间隔", kind: "integer", unit: "天", min: 1, max: 3650, step: 1, default: 1 },
    ],
    computations: [
      {
        id: "next_ease_factor",
        label: "下一轮易度因子",
        expression:
          "max(1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))",
        precision: 2,
      },
      {
        id: "next_repetition",
        label: "下一轮重复次数",
        expression: "if(quality < 3, 0, repetition + 1)",
      },
      {
        id: "next_interval_days",
        label: "下一轮间隔",
        expression:
          "if(next_repetition == 0, 1, if(next_repetition == 1, 1, if(next_repetition == 2, 6, round(interval_days * next_ease_factor, 0))))",
        unit: "天",
      },
    ],
    blocks: [
      { id: "intro", kind: "prose", span: 12, text: PROSE },
      { id: "metric-next", kind: "metric", span: 3, title: "下次复习间隔", bind: "next_interval_days" },
      { id: "metric-ef", kind: "metric", span: 3, title: "下一轮易度因子", bind: "next_ease_factor" },
      {
        id: "schedule-1",
        kind: "schedule",
        span: 12,
        title: "评分并推进",
        bind: "next_interval_days",
        parameterIds: ["quality", "ease_factor", "repetition", "interval_days"],
      },
    ],
    validation: [
      { id: "ef_floor", assert: "next_ease_factor >= 1.3", message: "易度因子不得低于 1.3", severity: "error" },
    ],
    attribution: {
      entries: [
        { text: "SM-2 公开算法描述", licenseCode: "PDM", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/" },
      ],
    },
  };
  const nodes = {
    next_ease_factor: (scope) =>
      Math.max(
        1.3,
        Number(scope.ease_factor) +
          (0.1 -
            (5 - Number(scope.quality)) *
              (0.08 + (5 - Number(scope.quality)) * 0.02)),
      ),
    next_repetition: (scope) =>
      Number(scope.quality) < 3 ? 0 : Number(scope.repetition) + 1,
    next_interval_days: (scope) => {
      const repetition = Number(scope.next_repetition);
      if (repetition === 0) return 1;
      if (repetition === 1) return 1;
      if (repetition === 2) return 6;
      return Math.round(Number(scope.interval_days) * Number(scope.next_ease_factor));
    },
    assert_ef_floor: (scope) => Number(scope.next_ease_factor) >= 1.3,
  };
  const { ports, calls } = makePorts(nodes, { perNode: true });
  const engine = createInteractiveDocEngine({
    project: scheduleProject,
    ports,
    item: { key: "k", id: "i", meta: {} },
    siteId: "oceanleo",
  });
  const scheduleBlock = engine
    .state()
    .blocks.find((block) => block.id === "schedule-1");
  assert.equal(scheduleBlock.qualityParameterId, "quality");
  assert.deepEqual(scheduleBlock.feedback, [
    { parameterId: "ease_factor", computationId: "next_ease_factor" },
    { parameterId: "repetition", computationId: "next_repetition" },
    { parameterId: "interval_days", computationId: "next_interval_days" },
  ]);

  assert.equal(
    engine.advanceSchedule("schedule-1", 9).code,
    "interactive-doc-quality-out-of-range",
  );
  const first = engine.advanceSchedule("schedule-1", 4);
  assert.equal(first.ok, true);
  const afterFirst = engine.state();
  assert.equal(afterFirst.values.repetition, 1);
  assert.equal(afterFirst.values.interval_days, 1, "§4 C28 首次间隔 1 天");
  assert.equal(
    afterFirst.project.parameters.find((entry) => entry.id === "repetition").default,
    1,
    "状态推进必须写回 parameters[].default 才能被序列化",
  );
  engine.advanceSchedule("schedule-1", 4);
  assert.equal(engine.state().values.interval_days, 6, "§4 C29 第二次间隔 6 天");
  engine.advanceSchedule("schedule-1", 5);
  const third = engine.state();
  assert.ok(third.values.interval_days > 6, "第三次起 interval × EF");
  assert.ok(third.values.ease_factor >= 1.3, "§4 C27 EF 下界 1.3");

  const failed = engine.advanceSchedule("schedule-1", 1);
  assert.equal(failed.ok, true);
  const afterFail = engine.state();
  assert.equal(afterFail.values.repetition, 0, "§4 C30 q < 3 重置重复计数");
  assert.equal(afterFail.progress.schedule["schedule-1"].lastQuality, 1);
  assert.equal(afterFail.progress.schedule["schedule-1"].step, 4);

  const saved = await engine.save();
  assert.equal(saved.ok, true);
  assert.equal(calls.commits.length, 1);
  const committed = calls.commits[0];
  assert.equal(committed.projectSchema, INTERACTIVE_DOC_SCHEMA_ID);
  assert.equal(committed.siteId, "oceanleo");
  assert.equal(
    committed.project.parameters.find((entry) => entry.id === "interval_days").default,
    afterFail.values.interval_days,
    "commit 拿到的是推进后的工程",
  );
  assert.equal(committed.progress.schedule["schedule-1"].step, 4);
  assert.equal(engine.state().dirty, false, "保存后 dirty 清零");
  const serialized = engine.serialize();
  assert.ok(
    serialized.includes(`"id":"interval_days"`),
    "序列化经数据层 serializeInteractiveDocProject 端口",
  );
});

test("on-commit 模式下改参数先挂起，提交后才重算", () => {
  const project = calculatorProject({
    interactions: {
      recomputeMode: "on-commit",
      resetEnabled: true,
      scenarioSlots: 0,
      maxRecomputeMs: 200,
    },
  });
  const { ports, calls } = makePorts(CALCULATOR_NODES);
  const engine = createInteractiveDocEngine({ project, ports });
  const before = engine.state();
  const evaluateBefore = calls.evaluate;
  engine.setParameter("annual_rate", 7.15);
  const pending = engine.state();
  assert.deepEqual(pending.pendingParameterIds, ["annual_rate"]);
  assert.equal(calls.evaluate, evaluateBefore, "on-commit 不立即求值");
  assert.equal(
    pending.blocks.find((block) => block.id === "metric-payment").display,
    before.blocks.find((block) => block.id === "metric-payment").display,
  );
  assert.equal(engine.commitInputs().ok, true);
  const committed = engine.state();
  assert.deepEqual(committed.pendingParameterIds, []);
  assert.notEqual(
    committed.blocks.find((block) => block.id === "metric-payment").display,
    before.blocks.find((block) => block.id === "metric-payment").display,
  );
});

test("§4 C17 情景槽位、reset 与 undo/redo", () => {
  const { ports } = makePorts(CALCULATOR_NODES);
  const engine = createInteractiveDocEngine({ project: calculatorProject(), ports });
  const baseDisplay = engine
    .state()
    .blocks.find((block) => block.id === "metric-payment").display;
  assert.equal(engine.state().scenarios.length, 2);
  assert.equal(engine.saveScenario(0).ok, true);
  assert.equal(engine.saveScenario(5).code, "interactive-doc-scenario-slot-out-of-range");
  assert.equal(engine.applyScenario(1).code, "interactive-doc-scenario-empty");
  engine.setParameter("annual_rate", 8.5);
  const changed = engine.state().blocks.find((block) => block.id === "metric-payment").display;
  assert.notEqual(changed, baseDisplay);
  assert.equal(engine.applyScenario(0).ok, true);
  assert.equal(
    engine.state().blocks.find((block) => block.id === "metric-payment").display,
    baseDisplay,
    "情景回放要恢复结果",
  );
  engine.setParameter("months", 120);
  assert.equal(engine.undo(), true);
  assert.equal(engine.state().values.months, 240);
  assert.equal(engine.redo(), true);
  assert.equal(engine.state().values.months, 120);
  assert.equal(engine.reset().ok, true);
  assert.equal(engine.state().values.annual_rate, 4.9);
  assert.equal(
    engine.state().blocks.find((block) => block.id === "metric-payment").display,
    baseDisplay,
  );
  const history = new InteractiveDocHistory(2);
  assert.equal(history.canUndo, false);
  const snapshot = engine.snapshot();
  assert.equal(
    history.record(snapshot, { ...snapshot, values: { ...snapshot.values, months: 1 } }),
    true,
  );
  assert.equal(history.record(snapshot, snapshot), false, "无变化不入栈");
});

test("recovery 快照按 schema 门禁恢复，非本载体一律拒绝", () => {
  const { ports } = makePorts(CALCULATOR_NODES);
  const engine = createInteractiveDocEngine({ project: calculatorProject(), ports });
  engine.setParameter("months", 96);
  const snapshot = engine.snapshot();
  const fresh = createInteractiveDocEngine({ project: calculatorProject(), ports });
  assert.equal(fresh.restore({ project: { schema: "oceanleo.chart.v1" } }), false);
  assert.equal(fresh.restore(null), false);
  assert.equal(fresh.restore(snapshot), true);
  assert.equal(fresh.state().values.months, 96);
  assert.equal(
    fresh.state().blocks.find((block) => block.id === "metric-payment").display,
    engine.state().blocks.find((block) => block.id === "metric-payment").display,
    "§5.4 同一份源与输入必须得到同样结果",
  );
});

test("§2 视觉靶：色板 / 栅格 / 字号档逐值照规格", () => {
  assert.deepEqual(INTERACTIVE_DOC_PALETTE, {
    "doc.surface": "#FFFFFF",
    "doc.surface.alt": "#F5F7FA",
    "doc.text.primary": "#1F2328",
    "doc.text.secondary": "#57606A",
    "doc.accent": "#1F6FEB",
    "doc.positive": "#1A7F37",
    "doc.negative": "#CF222E",
    "doc.warn": "#9A6700",
    "doc.border": "#D0D7DE",
    "doc.rule.strong": "#7D8590",
  });
  assert.deepEqual(INTERACTIVE_DOC_GRID, {
    documentWidthPx: 960,
    columns: 12,
    columnGapPx: 16,
    documentPaddingPx: 40,
    blockGapPx: 24,
    parameterPanelMinColumns: 4,
    resultCardMinColumns: 3,
    controlMinHeightPx: 40,
    tableRowHeightPx: 36,
  });
  assert.deepEqual(INTERACTIVE_DOC_TYPE_SCALE, {
    h1: { fontSizePx: 30, lineHeightPx: 40 },
    h2: { fontSizePx: 22, lineHeightPx: 30 },
    h3: { fontSizePx: 17, lineHeightPx: 24 },
    body: { fontSizePx: 15, lineHeightPx: 24 },
    metric: { fontSizePx: 32, lineHeightPx: 40 },
    caption: { fontSizePx: 12, lineHeightPx: 18 },
  });
});

test("§2.1 / §2.4 对比度义务按 token 分别取阈且实测达标", () => {
  for (const row of INTERACTIVE_DOC_CONTRAST_OBLIGATIONS) {
    const ratio = contrastRatio(
      INTERACTIVE_DOC_PALETTE[row.token],
      INTERACTIVE_DOC_PALETTE[row.base],
    );
    assert.ok(
      ratio >= row.minRatio,
      `${row.token} 对 ${row.base} 实测 ${ratio}:1，低于 ${row.minRatio}:1`,
    );
  }
  assert.equal(contrastRatio("#7D8590", "#FFFFFF"), 3.73, "§2.1 白底实测值");
  assert.equal(contrastRatio("#7D8590", "#F5F7FA"), 3.48, "§2.1 斑马纹底判定基准");
  assert.equal(contrastRatio("#D0D7DE", "#FFFFFF"), 1.45, "§2.1 装饰线事实陈述");
  const decorative = INTERACTIVE_DOC_CONTRAST_OBLIGATIONS.find(
    (row) => row.token === "doc.border",
  );
  assert.equal(decorative.minRatio, 1.05);
  assert.ok(
    !decorative.criterion.includes("1.4.11"),
    "doc.border MUST NOT 再冠以 SC 1.4.11",
  );
  const strong = INTERACTIVE_DOC_CONTRAST_OBLIGATIONS.filter(
    (row) => row.token === "doc.rule.strong",
  );
  assert.equal(strong.length, 2, "doc.rule.strong 受两个底约束");
  assert.ok(strong.every((row) => row.criterion === "SC 1.4.11"));
  const criteria = INTERACTIVE_DOC_WCAG_OBLIGATIONS.map((row) => row.criterion);
  for (const sc of ["SC 1.3.1", "SC 1.4.3", "SC 2.4.6", "SC 3.3.1", "SC 3.3.2"]) {
    assert.ok(criteria.includes(sc), `§2.4 点名的 ${sc} 必须有落点`);
  }
});

test("§5.5 blocks[].text 走受限 Markdown 子集，HTML 只当文本", () => {
  const tokens = parseInteractiveDocText("利率**上升**时月供 *同向* 变化，`pmt()` 负责计算。");
  assert.deepEqual(
    tokens.map((token) => token.kind),
    ["text", "strong", "text", "emphasis", "text", "code", "text"],
  );
  const hostile = parseInteractiveDocText("<img src=x onerror=alert(1)>");
  assert.equal(hostile.length, 1);
  assert.equal(hostile[0].kind, "text");
  assert.equal(hostile[0].text, "<img src=x onerror=alert(1)>");
  const kinds = new Set(parseInteractiveDocText("a<b>c</b>").map((token) => token.kind));
  assert.ok(!kinds.has("html"), "不存在 html token 种类");
});

test("控件族投影到共享工具栏协议后仍带标签、取值域与失败文本", () => {
  const project = calculatorProject();
  const descriptors = [
    interactiveDocControlDescriptor({ parameter: project.parameters[1], value: 4.9 }),
    interactiveDocControlDescriptor({ parameter: project.parameters[3], value: true }),
    interactiveDocControlDescriptor({ parameter: project.parameters[4], value: "equal_installment" }),
    interactiveDocControlDescriptor({
      parameter: project.parameters[2],
      value: 400,
      issue: {
        code: "interactive-doc-parameter-out-of-range",
        severity: "error",
        message: "「期数」超出取值域 1 – 360 期",
        parameterId: "months",
      },
    }),
  ];
  const controls = interactiveDocSelectionControls(descriptors, (text) => text);
  assert.deepEqual(
    controls.map((control) => control.kind),
    ["range", "toggle", "select", "number"],
  );
  assert.equal(controls[0].id, "param:annual_rate");
  assert.match(controls[0].label, /取值域 0 – 24 %/);
  assert.equal(controls[0].min, 0);
  assert.equal(controls[0].max, 24);
  assert.equal(controls[2].options.length, 2);
  assert.equal(controls[3].tone, "danger");
  assert.match(controls[3].unavailableReason, /超出取值域/);
});

test("§4 常量表与 §8.1 字节下限逐值落地", () => {
  assert.equal(INTERACTIVE_DOC_LIMITS.parametersMin, 3);
  assert.equal(INTERACTIVE_DOC_LIMITS.parametersMax, 120);
  assert.equal(INTERACTIVE_DOC_LIMITS.computationsMin, 2);
  assert.equal(INTERACTIVE_DOC_LIMITS.computationsMax, 400);
  assert.equal(INTERACTIVE_DOC_LIMITS.blocksMin, 4);
  assert.equal(INTERACTIVE_DOC_LIMITS.blocksMax, 200);
  assert.equal(INTERACTIVE_DOC_LIMITS.expressionMaxChars, 2000);
  assert.equal(INTERACTIVE_DOC_LIMITS.assertMaxChars, 1000);
  assert.equal(INTERACTIVE_DOC_LIMITS.graphDepthMax, 32);
  assert.equal(INTERACTIVE_DOC_LIMITS.nodeDependencyMax, 64);
  assert.equal(INTERACTIVE_DOC_LIMITS.recomputeBudgetMsDefault, 200);
  assert.equal(INTERACTIVE_DOC_LIMITS.recomputeBudgetMsMax, 2000);
  assert.equal(INTERACTIVE_DOC_LIMITS.scenarioSlotsMax, 8);
  assert.equal(INTERACTIVE_DOC_LIMITS.dependencyClosureBytesMax, 67108864);
  assert.equal(INTERACTIVE_DOC_LIMITS.easeFactorInitial, 2.5);
  assert.equal(INTERACTIVE_DOC_LIMITS.easeFactorFloor, 1.3);
  assert.equal(INTERACTIVE_DOC_LIMITS.firstIntervalDays, 1);
  assert.equal(INTERACTIVE_DOC_LIMITS.secondIntervalDays, 6);
  assert.equal(INTERACTIVE_DOC_LIMITS.qualityFailBelow, 3);
  assert.equal(INTERACTIVE_DOC_LIMITS.quizItemsMin, 6);
  assert.equal(INTERACTIVE_DOC_LIMITS.formulaStepsMax, 24);
  assert.equal(INTERACTIVE_DOC_LIMITS.chartSeriesMax, 8);
  assert.equal(INTERACTIVE_DOC_LIMITS.tableRowsMax, 500);
  assert.equal(INTERACTIVE_DOC_LIMITS.sourceBytesMin, 8192, "§8.1 / A3");
  assert.equal(INTERACTIVE_DOC_LIMITS.sourceBytesMax, 2097152, "§4 C40 / A7");
  assert.equal(INTERACTIVE_DOC_LIMITS.proseCharactersMin, 300, "§8.2");
  assert.equal(INTERACTIVE_DOC_LIMITS.boundComputationRatioMin, 0.5, "§8.2");
});

test("A1 / A2 四元组标识符与编辑器清单自洽", () => {
  assert.equal(INTERACTIVE_DOC_SCHEMA_ID, "oceanleo.interactive-doc.v1");
  const manifest = interactiveDocEditorManifest();
  assert.equal(manifest.schema, "oceanleo.editor-manifest.v1");
  assert.equal(manifest.source.format, "oceanleo.interactive-doc.v1");
  assert.deepEqual(manifest.capabilities, ["load", "mutate", "save", "reopen"]);
  const workbench = readOwned("use-interactive-doc-workbench.ts");
  assert.match(workbench, /INTERACTIVE_DOC_SOURCE_MEDIA_TYPE = "application\/json"/);
  assert.ok(
    !/"interactive-doc"\s*as\s*ArtifactType/.test(workbench),
    "artifact_type 连字符拼法 MUST NOT 出现",
  );
});

test("§5.5 / §3.4 / D4 禁区静态扫描:无 eval、无动态 import、不碰 chart-editor", () => {
  const sources = [
    ...OWNED_FILES.map((name) => [name, readOwned(name)]),
    ["advanced-routes/InteractiveDocRoute.tsx", readFileSync(ROUTE_FILE, "utf8")],
  ];
  for (const [name, source] of sources) {
    assert.ok(!/\beval\s*\(/.test(source), `${name} 不得出现 eval(`);
    assert.ok(!/new\s+Function/.test(source), `${name} 不得出现 new Function`);
    assert.ok(!/\bwith\s*\(/.test(source), `${name} 不得出现 with(`);
    assert.ok(
      !/dangerouslySetInnerHTML/.test(source),
      `${name} 不得出现 dangerouslySetInnerHTML`,
    );
    assert.ok(
      !/chart-editor/.test(source),
      `${name} 不得 import chart-editor（仲裁 D4）`,
    );
    const dynamicImport = /(^|[^.\w])import\s*\(/.exec(source);
    assert.equal(
      dynamicImport,
      null,
      `${name} 不得出现动态 import（§5.5 封闭子集）`,
    );
  }
});

test("Route 真的把编辑器挂起来并按签名接 W6 的数据层", () => {
  const route = readFileSync(ROUTE_FILE, "utf8");
  assert.match(route, /export default InteractiveDocRoute/, "W3 按这个名字接路由");
  assert.match(route, /export function InteractiveDocRoute\(/);
  for (const symbol of [
    "parseInteractiveDocSource",
    "serializeInteractiveDocProject",
    "validateInteractiveDocProject",
    "evaluateComputeGraph",
    "commitInteractiveDocProject",
    "renderInteractiveDocBlock",
    "INTERACTIVE_DOC_PROJECT_SCHEMA",
  ]) {
    assert.ok(
      route.includes(symbol),
      `Route 必须按签名接 W6 的 ${symbol}`,
    );
  }
  for (const module of [
    "interactive-doc-editor/interactive-doc-source",
    "interactive-doc-editor/interactive-doc-persistence",
    "interactive-doc-editor/interactive-doc-render",
    "interactive-doc-editor/interactive-doc-schema",
  ]) {
    assert.ok(route.includes(module), `Route 必须 import ${module}`);
  }
  for (const surface of [
    "InteractiveDocStage",
    "InteractiveDocControls",
    "InteractiveDocContextToolbar",
    "useInteractiveDocWorkbench",
  ]) {
    assert.ok(route.includes(surface), `Route 必须挂 ${surface}`);
  }
  assert.match(route, /AdvancedWorkbenchShell/, "走共享工作台外壳");
  assert.match(route, /id: "interactive-doc"/, "adapter id 用连字符命名域");
  assert.match(route, /persistence: \{/, "必须接持久化，不许交空壳路由");
  assert.match(route, /recovery: \{/);
  assert.ok(
    !/routeType: "grid"/.test(route),
    "MUST NOT 照抄 chart-editor 复用 routeType: grid",
  );

  const stage = readOwned("InteractiveDocStage.tsx");
  assert.match(stage, /role="alert"/, "SC 3.3.1 失败要有 alert 文本");
  assert.match(stage, /aria-describedby/, "SC 1.3.1 控件与说明可编程关联");
  assert.match(stage, /960/, "§2.2 文档基准宽");
  const controls = readOwned("InteractiveDocControls.tsx");
  assert.match(controls, /type="range"|type="number"|type="date"/);
  const toolbar = readOwned("InteractiveDocContextToolbar.tsx");
  assert.match(toolbar, /SelectionToolbar/, "toolbarOwnership: shared");
});

test("A6 / A8 / A9 呈现与署名信息在视口侧可达", () => {
  const { ports } = makePorts(CALCULATOR_NODES);
  const engine = createInteractiveDocEngine({ project: calculatorProject(), ports });
  const state = engine.state();
  const kinds = state.blocks.map((block) => block.kind);
  for (const kind of [
    "prose",
    "parameter-panel",
    "metric",
    "table",
    "chart",
    "formula",
    "callout",
    "divider",
  ]) {
    assert.ok(kinds.includes(kind), `${kind} 块必须有视口模型`);
  }
  const proseCharacters = state.blocks
    .filter((block) => block.kind === "prose")
    .reduce((total, block) => total + block.characters, 0);
  assert.ok(
    proseCharacters >= INTERACTIVE_DOC_LIMITS.proseCharactersMin,
    "§8.2 prose 合计 ≥ 300 字符",
  );
  assert.equal(
    state.diagnostics.some(
      (entry) => entry.code === "interactive-doc-prose-too-short",
    ),
    false,
    "达标文档不得报 §8.2 正文不足",
  );
  const short = createInteractiveDocEngine({
    project: calculatorProject({
      blocks: calculatorProject().blocks.map((block) =>
        block.kind === "prose" ? { ...block, text: "太短了。" } : block,
      ),
    }),
    ports: makePorts(CALCULATOR_NODES).ports,
  });
  assert.ok(
    short
      .state()
      .diagnostics.some(
        (entry) => entry.code === "interactive-doc-prose-too-short",
      ),
    "§8.2 正文不足必须被点名，不能静默通过",
  );
  const chart = state.blocks.find((block) => block.kind === "chart");
  assert.notEqual(chart.series[0].display, INTERACTIVE_DOC_VALUE_PLACEHOLDER);
  const attribution = state.project.attribution.entries[0];
  assert.equal(attribution.licenseCode, "CC0");
  assert.match(attribution.licenseUrl, /^https:\/\//);
  const stage = readOwned("InteractiveDocStage.tsx");
  assert.match(stage, /attribution/, "A9 导出物署名的呈现落点");
  assert.match(stage, /licenseCode/);
});
