// ============================================================================
// oceanleo.interactive-doc.v1 — 呈现投影
// ----------------------------------------------------------------------------
// 契约: interactive-doc.md §2 视觉靶(line 120-186)、§3.2 blocks(line 372-487)、
//   §5.3 可靠性(line 735-738)、§5.5 安全性(line 744-747)、§6 F3/F4。
//
// 铁律:
//   - 仲裁 D4:本文件 MUST NOT 从 `chart-editor/` import 任何符号。`blocks[].chart`
//     只持序列绑定,这里把绑定投影成一份最小 ECharts option(不复制 oceanleo.chart.v1
//     的完整 option 结构);echarts 运行时由视口层的既有装载点只读复用。
//   - §5.5:输出是纯数据渲染模型,不产出 HTML 串,视口层 MUST NOT 走
//     `dangerouslySetInnerHTML`。
//   - §5.3 / F3:呈现层永远拿不到 NaN / Infinity,拿到的是 null + 占位符。
// ============================================================================

import {
  INTERACTIVE_DOC_LIMITS,
  type InteractiveDocBlock,
  type InteractiveDocBlockKind,
  type InteractiveDocCallout,
  type InteractiveDocChartType,
  type InteractiveDocParameter,
  type InteractiveDocProject,
  type InteractiveDocTableEmphasis,
} from "./interactive-doc-schema";
import {
  computeScope,
  evaluateExpressionValue,
  isComputeScalar,
  parseInteractiveDocExpression,
  type ComputeGraphResult,
  type ComputeScalar,
  type ComputeValue,
} from "./interactive-doc-source";

/** §2.1 色板(line 124-135)。视口层按 token 名取色,MUST NOT 就地改值。 */
export const INTERACTIVE_DOC_COLOR_TOKENS = Object.freeze({
  "doc.surface": "#FFFFFF",
  "doc.surface.alt": "#F5F7FA",
  "doc.text.primary": "#1F2328",
  "doc.text.secondary": "#57606A",
  "doc.accent": "#1F6FEB",
  "doc.positive": "#1A7F37",
  "doc.negative": "#CF222E",
  "doc.warn": "#9A6700",
  // 纯装饰分隔线,实测 1.45:1,不在 SC 1.4.11 射程(§2.1 line 139-143)。
  "doc.border": "#D0D7DE",
  // 表格线 / 控件边界,判定基准取两底最小值 3.48:1(SC 1.4.11)。
  "doc.rule.strong": "#7D8590",
});

/** §2.2 版面栅格(line 156-166)。 */
export const INTERACTIVE_DOC_GRID = Object.freeze({
  documentWidthPx: INTERACTIVE_DOC_LIMITS.documentWidthPx,
  columns: INTERACTIVE_DOC_LIMITS.gridColumns,
  gutterPx: 16,
  marginPx: 40,
  blockGapPx: 24,
  parameterPanelMinColumns: 4,
  metricCardMinColumns: 3,
  controlMinHeightPx: INTERACTIVE_DOC_LIMITS.controlMinHeightPx,
  tableRowHeightPx: INTERACTIVE_DOC_LIMITS.tableRowHeightPx,
});

/** §2.3 字号档(line 170-177)。 */
export const INTERACTIVE_DOC_TYPE_SCALE = Object.freeze({
  h1: { fontSizePx: 30, lineHeightPx: 40 },
  h2: { fontSizePx: 22, lineHeightPx: 30 },
  h3: { fontSizePx: 17, lineHeightPx: 24 },
  body: { fontSizePx: 15, lineHeightPx: 24 },
  metric: { fontSizePx: 32, lineHeightPx: 40 },
  caption: { fontSizePx: 12, lineHeightPx: 18 },
});

/** F3 / §5.3:值缺失时呈现层显示的占位符,MUST NOT 显示 NaN 字面量。 */
export const INTERACTIVE_DOC_VALUE_PLACEHOLDER = "—";

export type InteractiveDocTone = "neutral" | "positive" | "negative" | "warn";

export type InteractiveDocInlineSpan =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "emphasis"; text: string }
  | { type: "code"; text: string };

export interface InteractiveDocRenderMessage {
  id: string;
  severity: "info" | "warn" | "error";
  /** SC 3.3.1:校验失败必须有文本,MUST NOT 只靠颜色。 */
  text: string;
  tone: InteractiveDocTone;
}

export interface RenderedControl {
  parameterId: string;
  label: string;
  help: string;
  kind: InteractiveDocParameter["kind"];
  control: NonNullable<InteractiveDocParameter["control"]>;
  unit: string;
  min: number | null;
  max: number | null;
  step: number | null;
  precision: number | null;
  options: { value: ComputeScalar; label: string }[];
  value: ComputeScalar;
  display: string;
  /** SC 3.3.2:带取值域的数值参数必须同时给出 min / max / unit 的可见说明。 */
  domainHint: string;
  minHeightPx: number;
}

export interface RenderedTableRow {
  label: string;
  bind: string | null;
  value: ComputeValue;
  display: string;
  emphasis: InteractiveDocTableEmphasis;
  tone: InteractiveDocTone;
}

export interface InteractiveDocChartSeriesProjection {
  name: string;
  type: "line" | "bar" | "scatter" | "pie";
  data: number[];
  areaStyle?: Record<string, never>;
  itemStyle?: { color: string };
}

/**
 * 最小 ECharts option 投影。字段只到 series / 轴 / 图例这一层 —— §1.3 line 116
 * 明文:interactive_doc MUST NOT 复制 oceanleo.chart.v1 的完整 option。
 */
export interface InteractiveDocChartOption {
  color?: string[];
  legend: { show: boolean; data: string[] };
  tooltip: { show: boolean; trigger: "item" | "axis" };
  xAxis: { type: "category" | "value"; name: string; data: string[] };
  yAxis: { type: "value"; name: string };
  series: InteractiveDocChartSeriesProjection[];
}

export interface RenderedFormulaStep {
  expression: string;
  note: string;
  value: ComputeValue;
  display: string;
  ok: boolean;
}

export type InteractiveDocRenderNode =
  | { kind: "prose"; spans: InteractiveDocInlineSpan[] }
  | { kind: "parameter-panel"; controls: RenderedControl[] }
  | {
      kind: "metric";
      bind: string;
      value: ComputeValue;
      display: string;
      unit: string;
      tone: InteractiveDocTone;
      /** SC 1.3.1:结果卡声明其依赖的参数 id。 */
      dependsOnParameters: string[];
    }
  | {
      kind: "table";
      datasetId: string | null;
      columns: { name: string; unit: string }[];
      datasetRows: ComputeScalar[][];
      rows: RenderedTableRow[];
    }
  | { kind: "chart"; chartType: InteractiveDocChartType; option: InteractiveDocChartOption }
  | { kind: "formula"; computationId: string; steps: RenderedFormulaStep[]; display: string }
  | { kind: "callout"; variant: InteractiveDocCallout; spans: InteractiveDocInlineSpan[] }
  | {
      kind: "quiz";
      prompt: string;
      answerKind: string;
      choices: string[];
      tolerance: number | null;
      explanation: string;
      answer: unknown;
      answerRevealed: boolean;
    }
  | { kind: "schedule"; entries: { label: string; display: string }[] }
  | { kind: "divider" };

export interface InteractiveDocRenderError {
  code: "unbound" | "unsupported-kind" | "expression-invalid" | "value-type";
  message: string;
}

export interface InteractiveDocRenderArgs {
  project: InteractiveDocProject;
  block: InteractiveDocBlock;
  compute: ComputeGraphResult;
  /** 测验答案默认不进渲染模型;由视口层在用户提交后显式要求。 */
  revealAnswers?: boolean;
  documentWidthPx?: number;
}

export interface InteractiveDocRenderResult {
  ok: boolean;
  blockId: string;
  kind: InteractiveDocBlockKind;
  span: number;
  widthPx: number;
  title: string;
  node: InteractiveDocRenderNode;
  messages: InteractiveDocRenderMessage[];
  /** 有占位符即说明本块有值缺失(F3),视口层 MUST 同时显示 messages。 */
  placeholders: string[];
  /** 上一轮结果(§3.3 `computing → degraded`),视口层 MUST 标注过期。 */
  stale: boolean;
  errors: InteractiveDocRenderError[];
}

const MARKDOWN_INLINE =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/**
 * §5.5:受限 Markdown 子集 —— 粗体 / 斜体 / 行内代码。原始 HTML 标签一律按
 * 字面文本输出,不解析、不注入。
 */
export function interactiveDocInlineSpans(
  text: string,
): InteractiveDocInlineSpan[] {
  const source = sanitizeText(text);
  if (!source) return [];
  const spans: InteractiveDocInlineSpan[] = [];
  let cursor = 0;
  for (const match of source.matchAll(MARKDOWN_INLINE)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      spans.push({ type: "text", text: source.slice(cursor, index) });
    }
    const token = match[0];
    if (token.startsWith("**")) {
      spans.push({ type: "strong", text: token.slice(2, -2) });
    } else if (token.startsWith("`")) {
      spans.push({ type: "code", text: token.slice(1, -1) });
    } else {
      spans.push({ type: "emphasis", text: token.slice(1, -1) });
    }
    cursor = index + token.length;
  }
  if (cursor < source.length) {
    spans.push({ type: "text", text: source.slice(cursor) });
  }
  return spans;
}

/** 确定性数值格式化:不走 toLocaleString(§5.4 要求 Node 与浏览器逐位一致)。 */
export function formatComputeValue(
  value: ComputeValue,
  options: { precision?: number; unit?: string } = {},
): string {
  if (value === null || value === undefined) return INTERACTIVE_DOC_VALUE_PLACEHOLDER;
  if (!isComputeScalar(value)) return INTERACTIVE_DOC_VALUE_PLACEHOLDER;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return sanitizeText(value);
  if (!Number.isFinite(value)) return INTERACTIVE_DOC_VALUE_PLACEHOLDER;
  const precision = options.precision;
  const text =
    precision === undefined
      ? String(value)
      : value.toFixed(Math.max(0, Math.min(INTERACTIVE_DOC_LIMITS.precisionMax, precision)));
  return options.unit ? `${text} ${options.unit}` : text;
}

function toneForValue(value: ComputeValue): InteractiveDocTone {
  if (value === null) return "warn";
  if (typeof value === "number") {
    if (value < 0) return "negative";
    if (value > 0) return "positive";
  }
  return "neutral";
}

export function blockWidthPx(span: number, documentWidthPx?: number): number {
  const width = documentWidthPx ?? INTERACTIVE_DOC_GRID.documentWidthPx;
  const content = width - INTERACTIVE_DOC_GRID.marginPx * 2;
  const columnWidth =
    (content - INTERACTIVE_DOC_GRID.gutterPx * (INTERACTIVE_DOC_GRID.columns - 1)) /
    INTERACTIVE_DOC_GRID.columns;
  const columns = Math.max(
    INTERACTIVE_DOC_LIMITS.spanMin,
    Math.min(INTERACTIVE_DOC_LIMITS.spanMax, span),
  );
  return Math.round(
    columnWidth * columns + INTERACTIVE_DOC_GRID.gutterPx * (columns - 1),
  );
}

function blockBoundIds(block: InteractiveDocBlock): Set<string> {
  const ids = new Set<string>();
  if (block.bind) ids.add(block.bind);
  for (const row of block.table?.rows || []) {
    if (row.bind) ids.add(row.bind);
  }
  for (const series of block.chart?.series || []) ids.add(series.bind);
  if (block.formula?.computationId) ids.add(block.formula.computationId);
  for (const parameterId of block.parameterIds || []) ids.add(parameterId);
  return ids;
}

function blockMessages(
  args: InteractiveDocRenderArgs,
  boundIds: Set<string>,
): InteractiveDocRenderMessage[] {
  const messages: InteractiveDocRenderMessage[] = [];
  for (const rule of args.project.validation || []) {
    const outcome = args.compute.validation.find((entry) => entry.id === rule.id);
    if (!outcome || (outcome.passed && !outcome.indeterminate)) continue;
    const parsed = parseInteractiveDocExpression(rule.assert);
    const touches =
      parsed.ok && parsed.expression.identifiers.some((id) => boundIds.has(id));
    if (!touches) continue;
    messages.push({
      id: rule.id,
      severity: rule.severity,
      text: outcome.indeterminate ? `${rule.message}(无法判定)` : rule.message,
      tone:
        rule.severity === "error"
          ? "negative"
          : rule.severity === "warn"
            ? "warn"
            : "neutral",
    });
  }
  for (const diagnostic of args.compute.diagnostics) {
    if (![...boundIds].some((id) => diagnostic.path.includes(id))) continue;
    messages.push({
      id: diagnostic.code,
      severity: "warn",
      text: diagnostic.message,
      tone: "warn",
    });
  }
  return messages;
}

function computationById(project: InteractiveDocProject, id: string) {
  return project.computations.find((node) => node.id === id);
}

function renderParameterPanel(args: InteractiveDocRenderArgs): RenderedControl[] {
  const byId = new Map(
    args.project.parameters.map((parameter) => [parameter.id, parameter]),
  );
  const controls: RenderedControl[] = [];
  for (const parameterId of args.block.parameterIds || []) {
    const parameter = byId.get(parameterId);
    if (!parameter) continue;
    const value = args.compute.parameters[parameterId] ?? parameter.default;
    const numericKind =
      parameter.kind === "number" ||
      parameter.kind === "integer" ||
      parameter.kind === "percent" ||
      parameter.kind === "currency";
    controls.push({
      parameterId,
      label: sanitizeText(parameter.label),
      help: sanitizeText(parameter.help || ""),
      kind: parameter.kind,
      control: parameter.control || defaultControl(parameter),
      unit: parameter.unit || "",
      min: parameter.min ?? null,
      max: parameter.max ?? null,
      step: parameter.step ?? null,
      precision: parameter.precision ?? null,
      options: (parameter.options || []).map((option) => ({
        value: option.value,
        label: sanitizeText(option.label),
      })),
      value,
      display: formatComputeValue(value, { precision: parameter.precision }),
      domainHint: numericKind
        ? `范围 ${parameter.min ?? "—"} – ${parameter.max ?? "—"} ${parameter.unit || ""}`.trim()
        : "",
      minHeightPx: INTERACTIVE_DOC_GRID.controlMinHeightPx,
    });
  }
  return controls;
}

function defaultControl(
  parameter: InteractiveDocParameter,
): NonNullable<InteractiveDocParameter["control"]> {
  switch (parameter.kind) {
    case "boolean":
      return "switch";
    case "enum":
      return "select";
    case "date":
      return "date-picker";
    case "integer":
      return "stepper";
    default:
      return "input";
  }
}

function seriesData(value: ComputeValue): number[] {
  if (value === null) return [];
  if (typeof value === "number") return Number.isFinite(value) ? [value] : [];
  if (typeof value === "boolean") return [value ? 1 : 0];
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? [parsed] : [];
  }
  if (value.kind === "column") {
    return value.values
      .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
      .filter((entry) => Number.isFinite(entry));
  }
  const numericColumn = value.columns.find(
    (column) => column.type === "number" || column.type === "integer",
  );
  return (numericColumn?.values || [])
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry));
}

function chartOption(args: InteractiveDocRenderArgs): InteractiveDocChartOption {
  const chart = args.block.chart;
  const series: InteractiveDocChartSeriesProjection[] = (chart?.series || []).map(
    (binding) => {
      const data = seriesData(args.compute.values[binding.bind] ?? null);
      const type: InteractiveDocChartSeriesProjection["type"] =
        chart?.chartType === "pie"
          ? "pie"
          : chart?.chartType === "bar"
            ? "bar"
            : chart?.chartType === "scatter"
              ? "scatter"
              : "line";
      return {
        name: sanitizeText(binding.name),
        type,
        data,
        ...(chart?.chartType === "area" ? { areaStyle: {} as Record<string, never> } : {}),
        ...(binding.color ? { itemStyle: { color: binding.color } } : {}),
      };
    },
  );
  const longest = series.reduce((count, entry) => Math.max(count, entry.data.length), 0);
  return {
    ...(chart?.series.some((binding) => binding.color)
      ? {
          color: chart.series
            .map((binding) => binding.color || INTERACTIVE_DOC_COLOR_TOKENS["doc.accent"])
            .slice(0, INTERACTIVE_DOC_LIMITS.chartSeriesMax),
        }
      : {}),
    legend: { show: series.length > 1, data: series.map((entry) => entry.name) },
    tooltip: { show: true, trigger: chart?.chartType === "pie" ? "item" : "axis" },
    xAxis: {
      type: chart?.chartType === "scatter" ? "value" : "category",
      name: sanitizeText(chart?.xAxisLabel || ""),
      data: Array.from({ length: longest }, (_, index) => String(index + 1)),
    },
    yAxis: { type: "value", name: sanitizeText(chart?.yAxisLabel || "") },
    series,
  };
}

function renderNode(
  args: InteractiveDocRenderArgs,
  errors: InteractiveDocRenderError[],
  placeholders: string[],
): InteractiveDocRenderNode {
  const { block, project, compute } = args;
  switch (block.kind) {
    case "prose":
      return { kind: "prose", spans: interactiveDocInlineSpans(block.text || "") };
    case "parameter-panel":
      return { kind: "parameter-panel", controls: renderParameterPanel(args) };
    case "metric": {
      const bind = block.bind || "";
      const node = computationById(project, bind);
      const value = compute.values[bind] ?? null;
      if (!node) {
        errors.push({
          code: "unbound",
          message: `metric 块 ${block.id} 的 bind ${bind || "(空)"} 没有对应 computation(F4)`,
        });
      }
      const display = formatComputeValue(value, {
        precision: node?.precision,
        unit: node?.unit,
      });
      if (display === INTERACTIVE_DOC_VALUE_PLACEHOLDER) placeholders.push(bind);
      return {
        kind: "metric",
        bind,
        value,
        display,
        unit: node?.unit || "",
        tone: toneForValue(value),
        dependsOnParameters: compute.parameterDependencies[bind] || [],
      };
    }
    case "table": {
      const datasetId = block.table?.datasetId || null;
      const dataset = datasetId ? compute.datasets[datasetId] : undefined;
      const rows: RenderedTableRow[] = (block.table?.rows || []).map((row) => {
        const node = row.bind ? computationById(project, row.bind) : undefined;
        const value = row.bind ? (compute.values[row.bind] ?? null) : null;
        const display = row.bind
          ? formatComputeValue(value, {
              precision: node?.precision,
              unit: node?.unit,
            })
          : "";
        if (row.bind && display === INTERACTIVE_DOC_VALUE_PLACEHOLDER) {
          placeholders.push(row.bind);
        }
        return {
          label: sanitizeText(row.label),
          bind: row.bind || null,
          value,
          display,
          emphasis: row.emphasis || "none",
          tone: row.bind ? toneForValue(value) : "neutral",
        };
      });
      const columns = (dataset?.columns || []).map((column) => ({
        name: column.name,
        unit:
          project.datasets
            ?.find((entry) => entry.id === datasetId)
            ?.columns.find((entry) => entry.name === column.name)?.unit || "",
      }));
      const datasetRows: ComputeScalar[][] = Array.from(
        { length: dataset?.rowCount || 0 },
        (_, rowIndex) =>
          (dataset?.columns || []).map((column) => column.values[rowIndex] ?? null),
      );
      if (dataset?.unloaded) {
        errors.push({
          code: "unbound",
          message: `table 块 ${block.id} 的 dataset ${datasetId} 未载入,呈现进入降级(F7)`,
        });
      }
      return { kind: "table", datasetId, columns, datasetRows, rows };
    }
    case "chart":
      return {
        kind: "chart",
        chartType: block.chart?.chartType || "line",
        option: chartOption(args),
      };
    case "formula": {
      const computationId = block.formula?.computationId || "";
      const scope = computeScope(compute);
      const node = computationById(project, computationId);
      const steps: RenderedFormulaStep[] = (block.formula?.steps || []).map((step) => {
        const evaluated = evaluateExpressionValue(
          step.expression,
          scope,
          node?.guard,
          `blocks[${block.id}].formula`,
        );
        if (!evaluated.ok) {
          errors.push({
            code: "expression-invalid",
            message: `公式展开步骤求值失败:${step.expression}`,
          });
        }
        return {
          expression: step.expression,
          note: sanitizeText(step.note || ""),
          value: evaluated.value,
          display: formatComputeValue(evaluated.value, {
            precision: node?.precision,
          }),
          ok: evaluated.ok,
        };
      });
      return {
        kind: "formula",
        computationId,
        steps,
        display: formatComputeValue(compute.values[computationId] ?? null, {
          precision: node?.precision,
          unit: node?.unit,
        }),
      };
    }
    case "callout":
      return {
        kind: "callout",
        variant: block.callout || "info",
        spans: interactiveDocInlineSpans(block.text || ""),
      };
    case "quiz-item": {
      const quiz = block.quiz;
      return {
        kind: "quiz",
        prompt: sanitizeText(quiz?.prompt || ""),
        answerKind: quiz?.answerKind || "short-text",
        choices: (quiz?.choices || []).map(sanitizeText),
        tolerance: quiz?.tolerance ?? null,
        explanation: sanitizeText(quiz?.explanation || ""),
        answer: args.revealAnswers ? quiz?.answer : undefined,
        answerRevealed: Boolean(args.revealAnswers),
      };
    }
    case "schedule": {
      const bind = block.bind || "";
      const value = bind ? (compute.values[bind] ?? null) : null;
      const node = bind ? computationById(project, bind) : undefined;
      const series = seriesData(value);
      const entries = series.length
        ? series.map((entry, index) => ({
            label: `第 ${index + 1} 轮`,
            display: formatComputeValue(entry, {
              precision: node?.precision,
              unit: node?.unit || "天",
            }),
          }))
        : [
            {
              label: sanitizeText(block.title || "下次复习间隔"),
              display: formatComputeValue(value, {
                precision: node?.precision,
                unit: node?.unit || "天",
              }),
            },
          ];
      return { kind: "schedule", entries };
    }
    case "divider":
      return { kind: "divider" };
    default:
      errors.push({
        code: "unsupported-kind",
        message: `未知块类型 ${String(block.kind)}`,
      });
      return { kind: "divider" };
  }
}

/**
 * 把一个 block 投影成纯数据渲染模型。视口层(W7)只消费本函数的返回值,
 * 不自己读 `project` 的原始字段,也不自己求值。
 */
export function renderInteractiveDocBlock(
  args: InteractiveDocRenderArgs,
): InteractiveDocRenderResult {
  const errors: InteractiveDocRenderError[] = [];
  const placeholders: string[] = [];
  const boundIds = blockBoundIds(args.block);
  if (args.compute.state === "cyclic" || args.compute.state === "invalid") {
    // §3.3 非法迁移:有环/非法源 MUST NOT 被当成可用工程渲染。
    errors.push({
      code: "unbound",
      message:
        args.compute.state === "cyclic"
          ? `计算图有环,MUST NOT 求值:${args.compute.cycle.join(" → ")}(F2)`
          : "源不满足 §3.2 或存在悬空引用,呈现被拒(F4)",
    });
  }
  const node = renderNode(args, errors, placeholders);
  return {
    ok: errors.length === 0,
    blockId: args.block.id,
    kind: args.block.kind,
    span: args.block.span,
    widthPx: blockWidthPx(args.block.span, args.documentWidthPx),
    title: sanitizeText(args.block.title || ""),
    node,
    messages: blockMessages(args, boundIds),
    placeholders,
    stale: args.compute.stale,
    errors,
  };
}

/** 整篇文档的投影,顺序即 `blocks[]` 顺序。 */
export function renderInteractiveDocDocument(
  project: InteractiveDocProject,
  compute: ComputeGraphResult,
  options: { revealAnswers?: boolean; documentWidthPx?: number } = {},
): InteractiveDocRenderResult[] {
  return project.blocks.map((block) =>
    renderInteractiveDocBlock({ project, block, compute, ...options }),
  );
}
