// ============================================================================
// oceanleo.interactive-doc.v1 — 结构层
// ----------------------------------------------------------------------------
// 契约: docs/specs/oceanleo-material-and-game-v1/L1-carriers/interactive-doc.md
//   §3.1 顶层字段(line 191-197)、§3.2 完整 Schema(line 199-566)、
//   §4 数值常量表 C1-C44(line 662-710)、§8 完备判据(line 865-893)。
// 本文件只做「结构」:类型、常量、逐字段校验、确定性规范化。
// 表达式求值与拓扑排序在 interactive-doc-source.ts;呈现投影在
// interactive-doc-render.ts。ADR-04:源永远是 JSON,MUST NOT 落 HTML。
// ============================================================================

export const INTERACTIVE_DOC_PROJECT_SCHEMA = "oceanleo.interactive-doc.v1" as const;
export const INTERACTIVE_DOC_PROJECT_VERSION = 1 as const;

/** §3.2 line 203-204:方言与 $id 逐字锁定。 */
export const INTERACTIVE_DOC_SCHEMA_DIALECT =
  "https://json-schema.org/draft/2020-12/schema" as const;
export const INTERACTIVE_DOC_SCHEMA_ID =
  "https://oceanleo.com/schemas/oceanleo.interactive-doc.v1.json" as const;

/** §1.1 四元组(line 55-71)。下划线进库,连字符进能力名/格式串(§1.1.1)。 */
export const INTERACTIVE_DOC_ARTIFACT_TYPE = "interactive_doc" as const;
export const INTERACTIVE_DOC_FEATURE_ID = "interactive_doc_editing" as const;
export const INTERACTIVE_DOC_EDITOR_CAPABILITY = "interactive-doc-editor" as const;
export const INTERACTIVE_DOC_ADAPTER_ID = "interactive-doc" as const;
export const INTERACTIVE_DOC_SOURCE_MEDIA_TYPE = "application/json" as const;
export const INTERACTIVE_DOC_REQUIREMENT_PATHS = Object.freeze([
  "blocks",
  "computations",
] as const);

/**
 * §4 数值常量表。键名与 C 编号的对应写在 marker;这里保持可读名。
 * MUST NOT 就地放宽任何一项 —— C11 明文「扩充白名单必须改版本号」。
 */
export const INTERACTIVE_DOC_LIMITS = Object.freeze({
  parametersMin: 3, // C1
  parametersMax: 120, // C2
  computationsMin: 2, // C3
  computationsMax: 400, // C4
  blocksMin: 4, // C5
  blocksMax: 200, // C6
  expressionMaxChars: 2_000, // C7
  assertMaxChars: 1_000, // C8
  graphMaxDepth: 32, // C9
  nodeMaxDependencies: 64, // C10
  functionWhitelistSize: 24, // C11
  precisionMin: 0, // C12
  precisionMax: 8, // C12
  gridColumns: 12, // C13
  spanMin: 1, // C14
  spanMax: 12, // C14
  recomputeMsDefault: 200, // C15
  recomputeMsMin: 1, // C15
  recomputeMsMax: 2_000, // C16
  scenarioSlotsMax: 8, // C17
  inlineRowsMax: 2_000, // C18
  externalRowsMax: 200_000, // C19
  columnsMax: 64, // C20
  dependencyBytesMax: 16_777_216, // C21
  dependencyCountMax: 128, // C22
  dependencyClosureBytesMax: 67_108_864, // C23
  irrIterationsMax: 200, // C24
  threeStatementTolerance: 0.01, // C25
  sm2EasinessInitial: 2.5, // C26
  sm2EasinessFloor: 1.3, // C27
  sm2FirstIntervalDays: 1, // C28
  sm2SecondIntervalDays: 6, // C29
  sm2QualityMin: 0, // C30
  sm2QualityMax: 5, // C30
  sm2QualityFailBelow: 3, // C30
  quizChoicesMin: 2, // C31
  quizChoicesMax: 10, // C31
  quizItemsMin: 6, // C32
  formulaStepsMin: 2, // C33
  formulaStepsMax: 24, // C33
  chartSeriesMax: 8, // C34
  tableRowsMax: 500, // C35
  documentWidthPx: 960, // C36
  controlMinHeightPx: 40, // C37
  tableRowHeightPx: 36, // C38
  sourceBytesMin: 8_192, // C39 / §8.1
  sourceBytesMax: 2_097_152, // C40
  coverMinEdgePx: 128, // C41
  frameColorsMin: 16, // C42
  familyJaccardMax: 0.85, // C43
  twinJaccardMax: 0.99, // C44
});

/** §8.2 line 885:prose 正文合计字符数下限。 */
export const INTERACTIVE_DOC_PROSE_MIN_CHARS = 300;
/** §8.2 line 886:被 bind 引用到的 computations 占比下限。 */
export const INTERACTIVE_DOC_BOUND_COMPUTATION_RATIO = 0.5;
/** §8.2 line 888:与 reviewed_material_catalog.py:3309 一致。 */
export const INTERACTIVE_DOC_TITLE_MIN_CHARS = 8;

export const INTERACTIVE_DOC_KINDS = Object.freeze([
  "calculator",
  "three-statement-model",
  "quiz",
  "spaced-repetition",
  "formula-walkthrough",
  "ledger",
  "checklist",
  "executable-note",
  "decision-tree",
] as const);

export const INTERACTIVE_DOC_DENSITIES = Object.freeze([
  "compact",
  "regular",
] as const);

export const INTERACTIVE_DOC_PARAMETER_KINDS = Object.freeze([
  "number",
  "integer",
  "percent",
  "currency",
  "boolean",
  "enum",
  "date",
  "text",
] as const);

/** §3.2 line 283-288:这四类 MUST 同时给 min / max / unit(F5)。 */
export const INTERACTIVE_DOC_NUMERIC_PARAMETER_KINDS = Object.freeze([
  "number",
  "integer",
  "percent",
  "currency",
] as const);

export const INTERACTIVE_DOC_CONTROLS = Object.freeze([
  "input",
  "slider",
  "stepper",
  "select",
  "switch",
  "radio",
  "date-picker",
] as const);

export const INTERACTIVE_DOC_COLUMN_TYPES = Object.freeze([
  "number",
  "integer",
  "string",
  "date",
  "boolean",
] as const);

export const INTERACTIVE_DOC_BLOCK_KINDS = Object.freeze([
  "prose",
  "parameter-panel",
  "metric",
  "table",
  "chart",
  "formula",
  "callout",
  "quiz-item",
  "schedule",
  "divider",
] as const);

/** §8.2 line 884:这三类是「呈现」,少一个都不算可算文档。 */
export const INTERACTIVE_DOC_PRESENTATION_BLOCK_KINDS = Object.freeze([
  "metric",
  "table",
  "chart",
] as const);

export const INTERACTIVE_DOC_CHART_TYPES = Object.freeze([
  "line",
  "bar",
  "area",
  "scatter",
  "pie",
] as const);

export const INTERACTIVE_DOC_TABLE_EMPHASIS = Object.freeze([
  "none",
  "subtotal",
  "total",
] as const);

export const INTERACTIVE_DOC_ANSWER_KINDS = Object.freeze([
  "single-choice",
  "multi-choice",
  "numeric",
  "short-text",
] as const);

export const INTERACTIVE_DOC_CALLOUTS = Object.freeze([
  "info",
  "warn",
  "danger",
  "success",
] as const);

export const INTERACTIVE_DOC_SEVERITIES = Object.freeze([
  "info",
  "warn",
  "error",
] as const);

export const INTERACTIVE_DOC_RECOMPUTE_MODES = Object.freeze([
  "on-change",
  "on-commit",
] as const);

export const INTERACTIVE_DOC_EXPORT_TARGETS = Object.freeze([
  "pdf",
  "xlsx",
  "csv",
  "png",
  "json",
] as const);

export const INTERACTIVE_DOC_DEPENDENCY_MEDIA_TYPES = Object.freeze([
  "application/json",
  "text/csv",
  "image/png",
  "image/webp",
] as const);

export const INTERACTIVE_DOC_DIVIDE_BY_ZERO_GUARDS = Object.freeze([
  "nan",
  "zero",
  "null",
  "error",
] as const);

export const INTERACTIVE_DOC_NAN_GUARDS = Object.freeze(["null", "error"] as const);

const ID_PATTERN = /^[a-z][a-zA-Z0-9_]{0,47}$/;
const BLOCK_ID_PATTERN = /^[a-z][a-zA-Z0-9_-]{0,47}$/;
const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const HTTPS_PATTERN = /^https:\/\/[^\s]{3,}$/;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export const INTERACTIVE_DOC_ID_PATTERN = ID_PATTERN;
export const INTERACTIVE_DOC_BLOCK_ID_PATTERN = BLOCK_ID_PATTERN;

export type InteractiveDocKind = (typeof INTERACTIVE_DOC_KINDS)[number];
export type InteractiveDocDensity = (typeof INTERACTIVE_DOC_DENSITIES)[number];
export type InteractiveDocParameterKind =
  (typeof INTERACTIVE_DOC_PARAMETER_KINDS)[number];
export type InteractiveDocControl = (typeof INTERACTIVE_DOC_CONTROLS)[number];
export type InteractiveDocColumnType =
  (typeof INTERACTIVE_DOC_COLUMN_TYPES)[number];
export type InteractiveDocBlockKind =
  (typeof INTERACTIVE_DOC_BLOCK_KINDS)[number];
export type InteractiveDocChartType =
  (typeof INTERACTIVE_DOC_CHART_TYPES)[number];
export type InteractiveDocTableEmphasis =
  (typeof INTERACTIVE_DOC_TABLE_EMPHASIS)[number];
export type InteractiveDocAnswerKind =
  (typeof INTERACTIVE_DOC_ANSWER_KINDS)[number];
export type InteractiveDocCallout = (typeof INTERACTIVE_DOC_CALLOUTS)[number];
export type InteractiveDocSeverity = (typeof INTERACTIVE_DOC_SEVERITIES)[number];
export type InteractiveDocRecomputeMode =
  (typeof INTERACTIVE_DOC_RECOMPUTE_MODES)[number];
export type InteractiveDocExportTarget =
  (typeof INTERACTIVE_DOC_EXPORT_TARGETS)[number];
export type InteractiveDocDependencyMediaType =
  (typeof INTERACTIVE_DOC_DEPENDENCY_MEDIA_TYPES)[number];
export type InteractiveDocDivideByZeroGuard =
  (typeof INTERACTIVE_DOC_DIVIDE_BY_ZERO_GUARDS)[number];
export type InteractiveDocNaNGuard = (typeof INTERACTIVE_DOC_NAN_GUARDS)[number];

export type InteractiveDocScalar = string | number | boolean;

export interface InteractiveDocMetadata {
  title: string;
  summary?: string;
  locale: string;
  docKind: InteractiveDocKind;
  createdAt: string;
}

export interface InteractiveDocTheme {
  accent: string;
  density: InteractiveDocDensity;
  gridColumns: 12;
}

export interface InteractiveDocParameterOption {
  value: InteractiveDocScalar;
  label: string;
}

export interface InteractiveDocParameter {
  id: string;
  label: string;
  help?: string;
  kind: InteractiveDocParameterKind;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  options?: InteractiveDocParameterOption[];
  default: InteractiveDocScalar;
  control?: InteractiveDocControl;
}

export interface InteractiveDocDatasetColumn {
  name: string;
  type: InteractiveDocColumnType;
  unit?: string;
}

export interface InteractiveDocInlineDatasetSource {
  inline: unknown[][];
}

export interface InteractiveDocExternalDatasetSource {
  dependencyPath: string;
  rowCount?: number;
}

export type InteractiveDocDatasetSource =
  | InteractiveDocInlineDatasetSource
  | InteractiveDocExternalDatasetSource;

export interface InteractiveDocDataset {
  id: string;
  columns: InteractiveDocDatasetColumn[];
  source: InteractiveDocDatasetSource;
}

export interface ComputeNodeGuard {
  onDivideByZero: InteractiveDocDivideByZeroGuard;
  onNaN: InteractiveDocNaNGuard;
  clampMin?: number;
  clampMax?: number;
}

/** §3.2 line 339-370 的 `computations[]` 单项。 */
export interface ComputeNode {
  id: string;
  label?: string;
  expression: string;
  unit?: string;
  precision?: number;
  dependsOn?: string[];
  guard: ComputeNodeGuard;
}

export interface InteractiveDocTableRow {
  label: string;
  bind?: string;
  emphasis: InteractiveDocTableEmphasis;
}

export interface InteractiveDocBlockTable {
  datasetId?: string;
  rows: InteractiveDocTableRow[];
}

export interface InteractiveDocChartSeries {
  name: string;
  bind: string;
  color?: string;
}

/** §1.3 line 116 / D4:只持序列绑定,MUST NOT 复制完整 ECharts option。 */
export interface InteractiveDocBlockChart {
  chartType: InteractiveDocChartType;
  xAxisLabel?: string;
  yAxisLabel?: string;
  series: InteractiveDocChartSeries[];
}

export interface InteractiveDocFormulaStep {
  expression: string;
  note?: string;
}

export interface InteractiveDocBlockFormula {
  computationId: string;
  steps: InteractiveDocFormulaStep[];
}

export interface InteractiveDocBlockQuiz {
  prompt: string;
  answerKind: InteractiveDocAnswerKind;
  choices?: string[];
  answer: string | number | unknown[];
  tolerance?: number;
  explanation?: string;
}

export interface InteractiveDocBlock {
  id: string;
  kind: InteractiveDocBlockKind;
  span: number;
  title?: string;
  text?: string;
  bind?: string;
  parameterIds?: string[];
  table?: InteractiveDocBlockTable;
  chart?: InteractiveDocBlockChart;
  formula?: InteractiveDocBlockFormula;
  quiz?: InteractiveDocBlockQuiz;
  callout?: InteractiveDocCallout;
}

export interface InteractiveDocValidationRule {
  id: string;
  assert: string;
  message: string;
  severity: InteractiveDocSeverity;
  tolerance?: number;
}

export interface InteractiveDocInteractions {
  recomputeMode: InteractiveDocRecomputeMode;
  resetEnabled: boolean;
  scenarioSlots: number;
  maxRecomputeMs: number;
}

export interface InteractiveDocAttributionEntry {
  text: string;
  licenseCode: string;
  licenseUrl: string;
  datasetId?: string;
}

export interface InteractiveDocAttribution {
  entries: InteractiveDocAttributionEntry[];
}

export interface InteractiveDocDependency {
  path: string;
  sha256: string;
  mediaType: InteractiveDocDependencyMediaType;
  byteSize?: number;
}

/** §3.1 line 193:顶层字段顺序即本接口的声明顺序,序列化按此固定。 */
export interface InteractiveDocProject {
  schema: typeof INTERACTIVE_DOC_PROJECT_SCHEMA;
  version: typeof INTERACTIVE_DOC_PROJECT_VERSION;
  metadata: InteractiveDocMetadata;
  theme: InteractiveDocTheme;
  parameters: InteractiveDocParameter[];
  datasets?: InteractiveDocDataset[];
  computations: ComputeNode[];
  blocks: InteractiveDocBlock[];
  validation?: InteractiveDocValidationRule[];
  interactions: InteractiveDocInteractions;
  exports?: InteractiveDocExportTarget[];
  attribution: InteractiveDocAttribution;
  dependencies?: InteractiveDocDependency[];
}

export type InteractiveDocValidationCode =
  | "root-not-object"
  | "unknown-property"
  | "missing-property"
  | "type"
  | "enum"
  | "pattern"
  | "range"
  | "length"
  | "count"
  | "duplicate-id"
  | "conditional"
  | "one-of"
  | "format";

export interface InteractiveDocValidationError {
  code: InteractiveDocValidationCode;
  path: string;
  message: string;
}

export type InteractiveDocValidationResult =
  | { ok: true; project: InteractiveDocProject; errors: [] }
  | { ok: false; project: null; errors: InteractiveDocValidationError[] };

interface Ctx {
  errors: InteractiveDocValidationError[];
}

function fail(
  ctx: Ctx,
  code: InteractiveDocValidationCode,
  path: string,
  message: string,
): void {
  ctx.errors.push({ code, path, message });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

/** §3.2 全对象都是 `additionalProperties: false`,未知键即校验失败。 */
function objectAt(
  ctx: Ctx,
  value: unknown,
  path: string,
  allowed: readonly string[],
  required: readonly string[],
): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) {
    fail(ctx, "type", path, `${path} 必须是普通 JSON 对象`);
    return null;
  }
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      fail(ctx, "unknown-property", `${path}.${key}`, `${path} 不允许额外字段 ${key}`);
    }
  }
  for (const key of required) {
    if (record[key] === undefined) {
      fail(ctx, "missing-property", `${path}.${key}`, `${path} 缺少必填字段 ${key}`);
    }
  }
  return record;
}

interface StringRule {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  patternHint?: string;
}

function stringField(
  ctx: Ctx,
  record: Record<string, unknown>,
  path: string,
  key: string,
  rule: StringRule = {},
): string | undefined {
  const value = record[key];
  const at = `${path}.${key}`;
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    fail(ctx, "type", at, `${at} 必须是字符串`);
    return undefined;
  }
  if (rule.min !== undefined && value.length < rule.min) {
    fail(ctx, "length", at, `${at} 长度不足 ${rule.min}`);
  }
  if (rule.max !== undefined && value.length > rule.max) {
    fail(ctx, "length", at, `${at} 长度超过 ${rule.max}`);
  }
  if (rule.pattern && !rule.pattern.test(value)) {
    fail(
      ctx,
      "pattern",
      at,
      `${at} 不匹配 ${rule.patternHint || String(rule.pattern)}`,
    );
  }
  return value;
}

interface NumberRule {
  min?: number;
  max?: number;
  exclusiveMin?: number;
  integer?: boolean;
}

function numberField(
  ctx: Ctx,
  record: Record<string, unknown>,
  path: string,
  key: string,
  rule: NumberRule = {},
): number | undefined {
  const value = record[key];
  const at = `${path}.${key}`;
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(ctx, "type", at, `${at} 必须是有限数字`);
    return undefined;
  }
  if (rule.integer && !Number.isInteger(value)) {
    fail(ctx, "type", at, `${at} 必须是整数`);
    return undefined;
  }
  if (rule.min !== undefined && value < rule.min) {
    fail(ctx, "range", at, `${at} 不得小于 ${rule.min}`);
  }
  if (rule.max !== undefined && value > rule.max) {
    fail(ctx, "range", at, `${at} 不得大于 ${rule.max}`);
  }
  if (rule.exclusiveMin !== undefined && value <= rule.exclusiveMin) {
    fail(ctx, "range", at, `${at} 必须大于 ${rule.exclusiveMin}`);
  }
  return value;
}

function booleanField(
  ctx: Ctx,
  record: Record<string, unknown>,
  path: string,
  key: string,
): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    fail(ctx, "type", `${path}.${key}`, `${path}.${key} 必须是布尔值`);
    return undefined;
  }
  return value;
}

function enumField<T extends string>(
  ctx: Ctx,
  record: Record<string, unknown>,
  path: string,
  key: string,
  values: readonly T[],
): T | undefined {
  const value = record[key];
  const at = `${path}.${key}`;
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail(ctx, "enum", at, `${at} 必须取值于 ${values.join(" / ")}`);
    return undefined;
  }
  return value as T;
}

interface ArrayRule {
  min?: number;
  max?: number;
}

function arrayField(
  ctx: Ctx,
  record: Record<string, unknown>,
  path: string,
  key: string,
  rule: ArrayRule = {},
): unknown[] | undefined {
  const value = record[key];
  const at = `${path}.${key}`;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    fail(ctx, "type", at, `${at} 必须是数组`);
    return undefined;
  }
  if (rule.min !== undefined && value.length < rule.min) {
    fail(ctx, "count", at, `${at} 至少需要 ${rule.min} 项,实际 ${value.length}`);
  }
  if (rule.max !== undefined && value.length > rule.max) {
    fail(ctx, "count", at, `${at} 最多 ${rule.max} 项,实际 ${value.length}`);
  }
  return value;
}

function scalarField(
  ctx: Ctx,
  record: Record<string, unknown>,
  path: string,
  key: string,
): InteractiveDocScalar | undefined {
  const value = record[key];
  const at = `${path}.${key}`;
  if (value === undefined) return undefined;
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  fail(ctx, "type", at, `${at} 必须是 string / number / boolean`);
  return undefined;
}

function uniqueIds(
  ctx: Ctx,
  ids: (string | undefined)[],
  path: string,
): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (!id) return;
    if (seen.has(id)) {
      fail(ctx, "duplicate-id", `${path}[${index}].id`, `id ${id} 重复`);
    }
    seen.add(id);
  });
}

// ---------------------------------------------------------------------------
// §3.2 metadata(line 214-229)
// ---------------------------------------------------------------------------

function validateMetadata(ctx: Ctx, value: unknown): void {
  const path = "metadata";
  const record = objectAt(
    ctx,
    value,
    path,
    ["title", "summary", "locale", "docKind", "createdAt"],
    ["title", "locale", "docKind", "createdAt"],
  );
  if (!record) return;
  stringField(ctx, record, path, "title", { min: 8, max: 300 });
  stringField(ctx, record, path, "summary", { max: 800 });
  stringField(ctx, record, path, "locale", {
    pattern: LOCALE_PATTERN,
    patternHint: "^[a-z]{2}(-[A-Z]{2})?$",
  });
  enumField(ctx, record, path, "docKind", INTERACTIVE_DOC_KINDS);
  const createdAt = stringField(ctx, record, path, "createdAt");
  if (createdAt !== undefined && !DATE_TIME_PATTERN.test(createdAt)) {
    fail(ctx, "format", `${path}.createdAt`, "createdAt 必须是 RFC 3339 date-time");
  }
}

// ---------------------------------------------------------------------------
// §3.2 theme(line 231-239)
// ---------------------------------------------------------------------------

function validateTheme(ctx: Ctx, value: unknown): void {
  if (value === undefined) return;
  const path = "theme";
  const record = objectAt(
    ctx,
    value,
    path,
    ["accent", "density", "gridColumns"],
    [],
  );
  if (!record) return;
  stringField(ctx, record, path, "accent", {
    pattern: COLOR_PATTERN,
    patternHint: "^#[0-9A-Fa-f]{6}$",
  });
  enumField(ctx, record, path, "density", INTERACTIVE_DOC_DENSITIES);
  const columns = numberField(ctx, record, path, "gridColumns", { integer: true });
  if (columns !== undefined && columns !== INTERACTIVE_DOC_LIMITS.gridColumns) {
    fail(
      ctx,
      "enum",
      `${path}.gridColumns`,
      `gridColumns 是 const ${INTERACTIVE_DOC_LIMITS.gridColumns}(C13)`,
    );
  }
}

// ---------------------------------------------------------------------------
// §3.2 parameters(line 241-291)
// ---------------------------------------------------------------------------

function validateParameter(ctx: Ctx, value: unknown, index: number): string | undefined {
  const path = `parameters[${index}]`;
  const record = objectAt(
    ctx,
    value,
    path,
    [
      "id",
      "label",
      "help",
      "kind",
      "unit",
      "min",
      "max",
      "step",
      "precision",
      "options",
      "default",
      "control",
    ],
    ["id", "label", "kind", "default"],
  );
  if (!record) return undefined;
  const id = stringField(ctx, record, path, "id", {
    pattern: ID_PATTERN,
    patternHint: "^[a-z][a-zA-Z0-9_]{0,47}$",
  });
  stringField(ctx, record, path, "label", { min: 2, max: 120 });
  stringField(ctx, record, path, "help", { max: 400 });
  const kind = enumField(ctx, record, path, "kind", INTERACTIVE_DOC_PARAMETER_KINDS);
  stringField(ctx, record, path, "unit", { max: 24 });
  const min = numberField(ctx, record, path, "min");
  const max = numberField(ctx, record, path, "max");
  numberField(ctx, record, path, "step", { exclusiveMin: 0 });
  numberField(ctx, record, path, "precision", {
    integer: true,
    min: INTERACTIVE_DOC_LIMITS.precisionMin,
    max: INTERACTIVE_DOC_LIMITS.precisionMax,
  });
  const options = arrayField(ctx, record, path, "options", { min: 2, max: 40 });
  const optionValues: InteractiveDocScalar[] = [];
  options?.forEach((entry, optionIndex) => {
    const optionPath = `${path}.options[${optionIndex}]`;
    const option = objectAt(ctx, entry, optionPath, ["value", "label"], [
      "value",
      "label",
    ]);
    if (!option) return;
    const optionValue = scalarField(ctx, option, optionPath, "value");
    if (optionValue !== undefined) optionValues.push(optionValue);
    stringField(ctx, option, optionPath, "label", { min: 1, max: 80 });
  });
  const fallback = scalarField(ctx, record, path, "default");
  enumField(ctx, record, path, "control", INTERACTIVE_DOC_CONTROLS);

  // §3.2 line 277-280:kind = enum MUST 带 options。
  if (kind === "enum" && record.options === undefined) {
    fail(ctx, "conditional", `${path}.options`, "kind = enum 必须声明 options");
  }
  // §3.2 line 281-288 / F5:数值四类 MUST 同时给 min / max / unit。
  if (
    kind !== undefined &&
    (INTERACTIVE_DOC_NUMERIC_PARAMETER_KINDS as readonly string[]).includes(kind)
  ) {
    for (const key of ["min", "max", "unit"] as const) {
      if (record[key] === undefined) {
        fail(
          ctx,
          "conditional",
          `${path}.${key}`,
          `kind = ${kind} 必须声明 ${key}(F5:参数无取值域)`,
        );
      }
    }
    if (min !== undefined && max !== undefined && min > max) {
      fail(ctx, "range", `${path}.min`, "min 不得大于 max");
    }
    if (typeof fallback === "number") {
      if (
        (min !== undefined && fallback < min) ||
        (max !== undefined && fallback > max)
      ) {
        fail(ctx, "range", `${path}.default`, "default 必须落在 [min, max] 内");
      }
      if (kind === "integer" && !Number.isInteger(fallback)) {
        fail(ctx, "type", `${path}.default`, "kind = integer 的 default 必须是整数");
      }
    } else if (fallback !== undefined) {
      fail(ctx, "type", `${path}.default`, `kind = ${kind} 的 default 必须是数字`);
    }
  }
  if (kind === "boolean" && fallback !== undefined && typeof fallback !== "boolean") {
    fail(ctx, "type", `${path}.default`, "kind = boolean 的 default 必须是布尔值");
  }
  if (
    kind === "enum" &&
    fallback !== undefined &&
    optionValues.length > 0 &&
    !optionValues.some((entry) => entry === fallback)
  ) {
    fail(ctx, "conditional", `${path}.default`, "kind = enum 的 default 必须命中 options");
  }
  return id;
}

// ---------------------------------------------------------------------------
// §3.2 datasets(line 293-337)
// ---------------------------------------------------------------------------

function validateDatasetSource(ctx: Ctx, value: unknown, path: string): void {
  const record = asRecord(value);
  if (!record) {
    fail(ctx, "type", path, `${path} 必须是普通 JSON 对象`);
    return;
  }
  const inline = record.inline !== undefined;
  const external = record.dependencyPath !== undefined;
  if (inline === external) {
    fail(
      ctx,
      "one-of",
      path,
      "source 必须恰好是 { inline } 或 { dependencyPath, rowCount } 之一",
    );
    return;
  }
  if (inline) {
    const allowed = objectAt(ctx, record, path, ["inline"], ["inline"]);
    if (!allowed) return;
    const rows = arrayField(ctx, allowed, path, "inline", {
      min: 1,
      max: INTERACTIVE_DOC_LIMITS.inlineRowsMax,
    });
    rows?.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) {
        fail(ctx, "type", `${path}.inline[${rowIndex}]`, "inline 每行必须是数组");
      } else if (row.length > INTERACTIVE_DOC_LIMITS.columnsMax) {
        fail(
          ctx,
          "count",
          `${path}.inline[${rowIndex}]`,
          `inline 行列数不得超过 ${INTERACTIVE_DOC_LIMITS.columnsMax}(C20)`,
        );
      }
    });
    return;
  }
  const allowed = objectAt(
    ctx,
    record,
    path,
    ["dependencyPath", "rowCount"],
    ["dependencyPath"],
  );
  if (!allowed) return;
  stringField(ctx, allowed, path, "dependencyPath", { min: 1, max: 512 });
  numberField(ctx, allowed, path, "rowCount", {
    integer: true,
    min: 1,
    max: INTERACTIVE_DOC_LIMITS.externalRowsMax,
  });
}

function validateDataset(ctx: Ctx, value: unknown, index: number): string | undefined {
  const path = `datasets[${index}]`;
  const record = objectAt(ctx, value, path, ["id", "columns", "source"], [
    "id",
    "columns",
    "source",
  ]);
  if (!record) return undefined;
  const id = stringField(ctx, record, path, "id", {
    pattern: ID_PATTERN,
    patternHint: "^[a-z][a-zA-Z0-9_]{0,47}$",
  });
  const columns = arrayField(ctx, record, path, "columns", {
    min: 1,
    max: INTERACTIVE_DOC_LIMITS.columnsMax,
  });
  const columnNames = new Set<string>();
  columns?.forEach((entry, columnIndex) => {
    const columnPath = `${path}.columns[${columnIndex}]`;
    const column = objectAt(ctx, entry, columnPath, ["name", "type", "unit"], [
      "name",
      "type",
    ]);
    if (!column) return;
    const name = stringField(ctx, column, columnPath, "name", { min: 1, max: 64 });
    enumField(ctx, column, columnPath, "type", INTERACTIVE_DOC_COLUMN_TYPES);
    stringField(ctx, column, columnPath, "unit", { max: 24 });
    if (name !== undefined) {
      if (columnNames.has(name)) {
        fail(ctx, "duplicate-id", `${columnPath}.name`, `列名 ${name} 重复`);
      }
      columnNames.add(name);
    }
  });
  if (record.source !== undefined) {
    validateDatasetSource(ctx, record.source, `${path}.source`);
  }
  return id;
}

// ---------------------------------------------------------------------------
// §3.2 computations(line 339-370)
// ---------------------------------------------------------------------------

function validateGuard(ctx: Ctx, value: unknown, path: string): void {
  if (value === undefined) return;
  const record = objectAt(
    ctx,
    value,
    path,
    ["onDivideByZero", "onNaN", "clampMin", "clampMax"],
    [],
  );
  if (!record) return;
  enumField(
    ctx,
    record,
    path,
    "onDivideByZero",
    INTERACTIVE_DOC_DIVIDE_BY_ZERO_GUARDS,
  );
  enumField(ctx, record, path, "onNaN", INTERACTIVE_DOC_NAN_GUARDS);
  const clampMin = numberField(ctx, record, path, "clampMin");
  const clampMax = numberField(ctx, record, path, "clampMax");
  if (clampMin !== undefined && clampMax !== undefined && clampMin > clampMax) {
    fail(ctx, "range", `${path}.clampMin`, "clampMin 不得大于 clampMax");
  }
}

function validateComputation(
  ctx: Ctx,
  value: unknown,
  index: number,
): string | undefined {
  const path = `computations[${index}]`;
  const record = objectAt(
    ctx,
    value,
    path,
    ["id", "label", "expression", "unit", "precision", "dependsOn", "guard"],
    ["id", "expression"],
  );
  if (!record) return undefined;
  const id = stringField(ctx, record, path, "id", {
    pattern: ID_PATTERN,
    patternHint: "^[a-z][a-zA-Z0-9_]{0,47}$",
  });
  stringField(ctx, record, path, "label", { max: 120 });
  stringField(ctx, record, path, "expression", {
    min: 1,
    max: INTERACTIVE_DOC_LIMITS.expressionMaxChars,
  });
  stringField(ctx, record, path, "unit", { max: 24 });
  numberField(ctx, record, path, "precision", {
    integer: true,
    min: INTERACTIVE_DOC_LIMITS.precisionMin,
    max: INTERACTIVE_DOC_LIMITS.precisionMax,
  });
  const dependsOn = arrayField(ctx, record, path, "dependsOn", {
    max: INTERACTIVE_DOC_LIMITS.nodeMaxDependencies,
  });
  dependsOn?.forEach((entry, dependencyIndex) => {
    if (typeof entry !== "string" || !ID_PATTERN.test(entry)) {
      fail(
        ctx,
        "pattern",
        `${path}.dependsOn[${dependencyIndex}]`,
        "dependsOn 每项必须匹配 ^[a-z][a-zA-Z0-9_]{0,47}$",
      );
    }
  });
  validateGuard(ctx, record.guard, `${path}.guard`);
  return id;
}

// ---------------------------------------------------------------------------
// §3.2 blocks(line 372-487)
// ---------------------------------------------------------------------------

function validateBlockTable(ctx: Ctx, value: unknown, path: string): void {
  const record = objectAt(ctx, value, path, ["datasetId", "rows"], ["rows"]);
  if (!record) return;
  stringField(ctx, record, path, "datasetId", {
    pattern: ID_PATTERN,
    patternHint: "^[a-z][a-zA-Z0-9_]{0,47}$",
  });
  const rows = arrayField(ctx, record, path, "rows", {
    min: 1,
    max: INTERACTIVE_DOC_LIMITS.tableRowsMax,
  });
  rows?.forEach((entry, rowIndex) => {
    const rowPath = `${path}.rows[${rowIndex}]`;
    const row = objectAt(ctx, entry, rowPath, ["label", "bind", "emphasis"], [
      "label",
    ]);
    if (!row) return;
    stringField(ctx, row, rowPath, "label", { min: 1, max: 160 });
    stringField(ctx, row, rowPath, "bind", {
      pattern: ID_PATTERN,
      patternHint: "^[a-z][a-zA-Z0-9_]{0,47}$",
    });
    enumField(ctx, row, rowPath, "emphasis", INTERACTIVE_DOC_TABLE_EMPHASIS);
  });
}

function validateBlockChart(ctx: Ctx, value: unknown, path: string): void {
  const record = objectAt(
    ctx,
    value,
    path,
    ["chartType", "xAxisLabel", "yAxisLabel", "series"],
    ["chartType", "series"],
  );
  if (!record) return;
  enumField(ctx, record, path, "chartType", INTERACTIVE_DOC_CHART_TYPES);
  stringField(ctx, record, path, "xAxisLabel", { max: 80 });
  stringField(ctx, record, path, "yAxisLabel", { max: 80 });
  const series = arrayField(ctx, record, path, "series", {
    min: 1,
    max: INTERACTIVE_DOC_LIMITS.chartSeriesMax,
  });
  series?.forEach((entry, seriesIndex) => {
    const seriesPath = `${path}.series[${seriesIndex}]`;
    const item = objectAt(ctx, entry, seriesPath, ["name", "bind", "color"], [
      "name",
      "bind",
    ]);
    if (!item) return;
    stringField(ctx, item, seriesPath, "name", { min: 1, max: 80 });
    stringField(ctx, item, seriesPath, "bind", {
      pattern: ID_PATTERN,
      patternHint: "^[a-z][a-zA-Z0-9_]{0,47}$",
    });
    stringField(ctx, item, seriesPath, "color", {
      pattern: COLOR_PATTERN,
      patternHint: "^#[0-9A-Fa-f]{6}$",
    });
  });
}

function validateBlockFormula(ctx: Ctx, value: unknown, path: string): void {
  const record = objectAt(ctx, value, path, ["computationId", "steps"], [
    "computationId",
    "steps",
  ]);
  if (!record) return;
  stringField(ctx, record, path, "computationId", {
    pattern: ID_PATTERN,
    patternHint: "^[a-z][a-zA-Z0-9_]{0,47}$",
  });
  const steps = arrayField(ctx, record, path, "steps", {
    min: INTERACTIVE_DOC_LIMITS.formulaStepsMin,
    max: INTERACTIVE_DOC_LIMITS.formulaStepsMax,
  });
  steps?.forEach((entry, stepIndex) => {
    const stepPath = `${path}.steps[${stepIndex}]`;
    const step = objectAt(ctx, entry, stepPath, ["expression", "note"], [
      "expression",
    ]);
    if (!step) return;
    stringField(ctx, step, stepPath, "expression", { min: 1, max: 500 });
    stringField(ctx, step, stepPath, "note", { max: 300 });
  });
}

function validateBlockQuiz(ctx: Ctx, value: unknown, path: string): void {
  const record = objectAt(
    ctx,
    value,
    path,
    ["prompt", "answerKind", "choices", "answer", "tolerance", "explanation"],
    ["prompt", "answerKind", "answer"],
  );
  if (!record) return;
  stringField(ctx, record, path, "prompt", { min: 4, max: 1_200 });
  const answerKind = enumField(
    ctx,
    record,
    path,
    "answerKind",
    INTERACTIVE_DOC_ANSWER_KINDS,
  );
  const choices = arrayField(ctx, record, path, "choices", {
    min: INTERACTIVE_DOC_LIMITS.quizChoicesMin,
    max: INTERACTIVE_DOC_LIMITS.quizChoicesMax,
  });
  choices?.forEach((entry, choiceIndex) => {
    if (typeof entry !== "string" || entry.length < 1 || entry.length > 300) {
      fail(
        ctx,
        "length",
        `${path}.choices[${choiceIndex}]`,
        "choices 每项必须是 1-300 字符的字符串",
      );
    }
  });
  const answer = record.answer;
  if (
    answer !== undefined &&
    !(
      typeof answer === "string" ||
      (typeof answer === "number" && Number.isFinite(answer)) ||
      Array.isArray(answer)
    )
  ) {
    fail(ctx, "type", `${path}.answer`, "answer 必须是 string / number / array");
  }
  numberField(ctx, record, path, "tolerance", { min: 0 });
  stringField(ctx, record, path, "explanation", { max: 1_200 });
  if (
    (answerKind === "single-choice" || answerKind === "multi-choice") &&
    record.choices === undefined
  ) {
    fail(
      ctx,
      "conditional",
      `${path}.choices`,
      `answerKind = ${answerKind} 必须声明 choices(C31)`,
    );
  }
}

function validateBlock(ctx: Ctx, value: unknown, index: number): string | undefined {
  const path = `blocks[${index}]`;
  const record = objectAt(
    ctx,
    value,
    path,
    [
      "id",
      "kind",
      "span",
      "title",
      "text",
      "bind",
      "parameterIds",
      "table",
      "chart",
      "formula",
      "quiz",
      "callout",
    ],
    ["id", "kind", "span"],
  );
  if (!record) return undefined;
  const id = stringField(ctx, record, path, "id", {
    pattern: BLOCK_ID_PATTERN,
    patternHint: "^[a-z][a-zA-Z0-9_-]{0,47}$",
  });
  const kind = enumField(ctx, record, path, "kind", INTERACTIVE_DOC_BLOCK_KINDS);
  numberField(ctx, record, path, "span", {
    integer: true,
    min: INTERACTIVE_DOC_LIMITS.spanMin,
    max: INTERACTIVE_DOC_LIMITS.spanMax,
  });
  stringField(ctx, record, path, "title", { max: 200 });
  stringField(ctx, record, path, "text", { max: 6_000 });
  stringField(ctx, record, path, "bind", {
    pattern: ID_PATTERN,
    patternHint: "^[a-z][a-zA-Z0-9_]{0,47}$",
  });
  const parameterIds = arrayField(ctx, record, path, "parameterIds", { max: 40 });
  parameterIds?.forEach((entry, parameterIndex) => {
    if (typeof entry !== "string" || !ID_PATTERN.test(entry)) {
      fail(
        ctx,
        "pattern",
        `${path}.parameterIds[${parameterIndex}]`,
        "parameterIds 每项必须匹配 ^[a-z][a-zA-Z0-9_]{0,47}$",
      );
    }
  });
  if (record.table !== undefined) validateBlockTable(ctx, record.table, `${path}.table`);
  if (record.chart !== undefined) validateBlockChart(ctx, record.chart, `${path}.chart`);
  if (record.formula !== undefined) {
    validateBlockFormula(ctx, record.formula, `${path}.formula`);
  }
  if (record.quiz !== undefined) validateBlockQuiz(ctx, record.quiz, `${path}.quiz`);
  enumField(ctx, record, path, "callout", INTERACTIVE_DOC_CALLOUTS);

  // §3.2 line 471-485 的 6 条 if/then。
  const conditionals: [InteractiveDocBlockKind, string][] = [
    ["metric", "bind"],
    ["chart", "chart"],
    ["table", "table"],
    ["formula", "formula"],
    ["quiz-item", "quiz"],
    ["parameter-panel", "parameterIds"],
  ];
  for (const [conditionalKind, requiredKey] of conditionals) {
    if (kind === conditionalKind && record[requiredKey] === undefined) {
      fail(
        ctx,
        "conditional",
        `${path}.${requiredKey}`,
        `kind = ${conditionalKind} 必须声明 ${requiredKey}`,
      );
    }
  }
  return id;
}

// ---------------------------------------------------------------------------
// §3.2 validation / interactions / exports / attribution / dependencies
// (line 489-559)
// ---------------------------------------------------------------------------

function validateRules(ctx: Ctx, root: Record<string, unknown>): void {
  if (root.validation === undefined) return;
  const rules = arrayField(ctx, root, "$", "validation", { max: 80 });
  if (!rules) return;
  const ids: (string | undefined)[] = [];
  rules.forEach((entry, index) => {
    const path = `validation[${index}]`;
    const record = objectAt(
      ctx,
      entry,
      path,
      ["id", "assert", "message", "severity", "tolerance"],
      ["id", "assert", "message", "severity"],
    );
    if (!record) return;
    ids.push(
      stringField(ctx, record, path, "id", {
        pattern: ID_PATTERN,
        patternHint: "^[a-z][a-zA-Z0-9_]{0,47}$",
      }),
    );
    stringField(ctx, record, path, "assert", {
      min: 1,
      max: INTERACTIVE_DOC_LIMITS.assertMaxChars,
    });
    stringField(ctx, record, path, "message", { min: 2, max: 400 });
    enumField(ctx, record, path, "severity", INTERACTIVE_DOC_SEVERITIES);
    numberField(ctx, record, path, "tolerance", { min: 0, max: 1_000_000 });
  });
  uniqueIds(ctx, ids, "validation");
}

function validateInteractions(ctx: Ctx, value: unknown): void {
  if (value === undefined) return;
  const path = "interactions";
  const record = objectAt(
    ctx,
    value,
    path,
    ["recomputeMode", "resetEnabled", "scenarioSlots", "maxRecomputeMs"],
    [],
  );
  if (!record) return;
  enumField(ctx, record, path, "recomputeMode", INTERACTIVE_DOC_RECOMPUTE_MODES);
  booleanField(ctx, record, path, "resetEnabled");
  numberField(ctx, record, path, "scenarioSlots", {
    integer: true,
    min: 0,
    max: INTERACTIVE_DOC_LIMITS.scenarioSlotsMax,
  });
  numberField(ctx, record, path, "maxRecomputeMs", {
    integer: true,
    min: INTERACTIVE_DOC_LIMITS.recomputeMsMin,
    max: INTERACTIVE_DOC_LIMITS.recomputeMsMax,
  });
}

function validateExports(ctx: Ctx, root: Record<string, unknown>): void {
  if (root.exports === undefined) return;
  const targets = arrayField(ctx, root, "$", "exports", { max: 6 });
  targets?.forEach((entry, index) => {
    if (
      typeof entry !== "string" ||
      !(INTERACTIVE_DOC_EXPORT_TARGETS as readonly string[]).includes(entry)
    ) {
      fail(
        ctx,
        "enum",
        `exports[${index}]`,
        `exports 每项必须取值于 ${INTERACTIVE_DOC_EXPORT_TARGETS.join(" / ")}`,
      );
    }
  });
}

function validateAttribution(ctx: Ctx, value: unknown): void {
  const path = "attribution";
  const record = objectAt(ctx, value, path, ["entries"], ["entries"]);
  if (!record) return;
  const entries = arrayField(ctx, record, path, "entries", { min: 1, max: 12 });
  entries?.forEach((entry, index) => {
    const entryPath = `${path}.entries[${index}]`;
    const item = objectAt(
      ctx,
      entry,
      entryPath,
      ["text", "licenseCode", "licenseUrl", "datasetId"],
      ["text", "licenseCode", "licenseUrl"],
    );
    if (!item) return;
    stringField(ctx, item, entryPath, "text", { min: 2, max: 200 });
    stringField(ctx, item, entryPath, "licenseCode", { min: 2, max: 60 });
    stringField(ctx, item, entryPath, "licenseUrl", {
      pattern: HTTPS_PATTERN,
      patternHint: "^https://",
    });
    stringField(ctx, item, entryPath, "datasetId", { max: 48 });
  });
}

function validateDependencies(ctx: Ctx, root: Record<string, unknown>): void {
  if (root.dependencies === undefined) return;
  const entries = arrayField(ctx, root, "$", "dependencies", {
    max: INTERACTIVE_DOC_LIMITS.dependencyCountMax,
  });
  if (!entries) return;
  let closure = 0;
  entries.forEach((entry, index) => {
    const path = `dependencies[${index}]`;
    const record = objectAt(
      ctx,
      entry,
      path,
      ["path", "sha256", "mediaType", "byteSize"],
      ["path", "sha256", "mediaType"],
    );
    if (!record) return;
    stringField(ctx, record, path, "path", { min: 1, max: 512 });
    stringField(ctx, record, path, "sha256", {
      pattern: SHA256_PATTERN,
      patternHint: "^[0-9a-f]{64}$",
    });
    enumField(ctx, record, path, "mediaType", INTERACTIVE_DOC_DEPENDENCY_MEDIA_TYPES);
    const byteSize = numberField(ctx, record, path, "byteSize", {
      integer: true,
      min: 1,
      max: INTERACTIVE_DOC_LIMITS.dependencyBytesMax,
    });
    closure += byteSize || 0;
  });
  if (closure > INTERACTIVE_DOC_LIMITS.dependencyClosureBytesMax) {
    fail(
      ctx,
      "range",
      "dependencies",
      `依赖闭包总字节 ${closure} 超过 C23 上限 ${INTERACTIVE_DOC_LIMITS.dependencyClosureBytesMax}`,
    );
  }
}

const ROOT_PROPERTIES = Object.freeze([
  "schema",
  "version",
  "metadata",
  "theme",
  "parameters",
  "datasets",
  "computations",
  "blocks",
  "validation",
  "interactions",
  "exports",
  "attribution",
  "dependencies",
] as const);

const ROOT_REQUIRED = Object.freeze([
  "schema",
  "version",
  "metadata",
  "parameters",
  "computations",
  "blocks",
  "attribution",
] as const);

/**
 * §3.2 逐字段校验。返回规范化后的工程(默认值已落、键序已固定),
 * 便于 `serializeInteractiveDocProject` 直接得到确定性字节。
 */
export function validateInteractiveDocProject(
  project: unknown,
): InteractiveDocValidationResult {
  const ctx: Ctx = { errors: [] };
  const root = objectAt(ctx, project, "$", ROOT_PROPERTIES, ROOT_REQUIRED);
  if (!root) {
    return { ok: false, project: null, errors: ctx.errors };
  }
  if (root.schema !== undefined && root.schema !== INTERACTIVE_DOC_PROJECT_SCHEMA) {
    fail(
      ctx,
      "enum",
      "$.schema",
      `schema 是 const ${INTERACTIVE_DOC_PROJECT_SCHEMA}(§3.2 line 211)`,
    );
  }
  if (root.version !== undefined && root.version !== INTERACTIVE_DOC_PROJECT_VERSION) {
    fail(ctx, "enum", "$.version", "version 是 const 1(§3.2 line 212)");
  }
  if (root.metadata !== undefined) validateMetadata(ctx, root.metadata);
  validateTheme(ctx, root.theme);
  const parameters = arrayField(ctx, root, "$", "parameters", {
    min: INTERACTIVE_DOC_LIMITS.parametersMin,
    max: INTERACTIVE_DOC_LIMITS.parametersMax,
  });
  uniqueIds(
    ctx,
    (parameters || []).map((entry, index) => validateParameter(ctx, entry, index)),
    "parameters",
  );
  const datasets = arrayField(ctx, root, "$", "datasets", { max: 32 });
  uniqueIds(
    ctx,
    (datasets || []).map((entry, index) => validateDataset(ctx, entry, index)),
    "datasets",
  );
  const computations = arrayField(ctx, root, "$", "computations", {
    min: INTERACTIVE_DOC_LIMITS.computationsMin,
    max: INTERACTIVE_DOC_LIMITS.computationsMax,
  });
  uniqueIds(
    ctx,
    (computations || []).map((entry, index) => validateComputation(ctx, entry, index)),
    "computations",
  );
  const blocks = arrayField(ctx, root, "$", "blocks", {
    min: INTERACTIVE_DOC_LIMITS.blocksMin,
    max: INTERACTIVE_DOC_LIMITS.blocksMax,
  });
  uniqueIds(
    ctx,
    (blocks || []).map((entry, index) => validateBlock(ctx, entry, index)),
    "blocks",
  );
  validateRules(ctx, root);
  validateInteractions(ctx, root.interactions);
  validateExports(ctx, root);
  if (root.attribution !== undefined) validateAttribution(ctx, root.attribution);
  validateDependencies(ctx, root);

  // 参数 id 与计算 id 共享一个标识符命名域(§3.4 line 612 的 IDENT 解析),
  // 撞名会让表达式的引用不可判定。
  const parameterIds = new Set<string>();
  for (const entry of parameters || []) {
    const id = asRecord(entry)?.id;
    if (typeof id === "string") parameterIds.add(id);
  }
  (computations || []).forEach((entry, index) => {
    const id = asRecord(entry)?.id;
    if (typeof id === "string" && parameterIds.has(id)) {
      fail(
        ctx,
        "duplicate-id",
        `computations[${index}].id`,
        `computation id ${id} 与 parameter id 撞名`,
      );
    }
  });
  (datasets || []).forEach((entry, index) => {
    const id = asRecord(entry)?.id;
    if (typeof id === "string" && parameterIds.has(id)) {
      fail(
        ctx,
        "duplicate-id",
        `datasets[${index}].id`,
        `dataset id ${id} 与 parameter id 撞名`,
      );
    }
  });

  if (ctx.errors.length > 0) {
    return { ok: false, project: null, errors: ctx.errors };
  }
  return {
    ok: true,
    project: canonicalInteractiveDocProject(root as unknown as InteractiveDocProject),
    errors: [],
  };
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) next[key] = entry;
  }
  return next as T;
}

/**
 * 规范化:填 §3.2 声明的 default、固定键序、剔除 undefined。
 * 只有经过它的对象才允许序列化,保证 roundtrip 确定性(§5.4)。
 */
export function canonicalInteractiveDocProject(
  project: InteractiveDocProject,
): InteractiveDocProject {
  const theme = project.theme || ({} as Partial<InteractiveDocTheme>);
  const interactions =
    project.interactions || ({} as Partial<InteractiveDocInteractions>);
  return omitUndefined({
    schema: INTERACTIVE_DOC_PROJECT_SCHEMA,
    version: INTERACTIVE_DOC_PROJECT_VERSION,
    metadata: omitUndefined({
      title: project.metadata.title,
      summary: project.metadata.summary,
      locale: project.metadata.locale,
      docKind: project.metadata.docKind,
      createdAt: project.metadata.createdAt,
    }),
    theme: {
      accent: theme.accent || "#1F6FEB",
      density: theme.density || "regular",
      gridColumns: INTERACTIVE_DOC_LIMITS.gridColumns as 12,
    },
    parameters: project.parameters.map((parameter) =>
      omitUndefined({
        id: parameter.id,
        label: parameter.label,
        help: parameter.help,
        kind: parameter.kind,
        unit: parameter.unit,
        min: parameter.min,
        max: parameter.max,
        step: parameter.step,
        precision: parameter.precision,
        options: parameter.options?.map((option) => ({
          value: option.value,
          label: option.label,
        })),
        default: parameter.default,
        control: parameter.control,
      }),
    ),
    datasets: project.datasets?.map((dataset) => ({
      id: dataset.id,
      columns: dataset.columns.map((column) =>
        omitUndefined({
          name: column.name,
          type: column.type,
          unit: column.unit,
        }),
      ),
      source:
        "inline" in dataset.source
          ? { inline: dataset.source.inline }
          : omitUndefined({
              dependencyPath: dataset.source.dependencyPath,
              rowCount: dataset.source.rowCount,
            }),
    })),
    computations: project.computations.map((node) =>
      omitUndefined({
        id: node.id,
        label: node.label,
        expression: node.expression,
        unit: node.unit,
        precision: node.precision,
        dependsOn: node.dependsOn ? [...node.dependsOn] : undefined,
        guard: omitUndefined({
          onDivideByZero: node.guard?.onDivideByZero || "null",
          onNaN: node.guard?.onNaN || "null",
          clampMin: node.guard?.clampMin,
          clampMax: node.guard?.clampMax,
        }),
      }),
    ),
    blocks: project.blocks.map((block) =>
      omitUndefined({
        id: block.id,
        kind: block.kind,
        span: block.span,
        title: block.title,
        text: block.text,
        bind: block.bind,
        parameterIds: block.parameterIds ? [...block.parameterIds] : undefined,
        table: block.table
          ? omitUndefined({
              datasetId: block.table.datasetId,
              rows: block.table.rows.map((row) =>
                omitUndefined({
                  label: row.label,
                  bind: row.bind,
                  emphasis: row.emphasis || "none",
                }),
              ),
            })
          : undefined,
        chart: block.chart
          ? omitUndefined({
              chartType: block.chart.chartType,
              xAxisLabel: block.chart.xAxisLabel,
              yAxisLabel: block.chart.yAxisLabel,
              series: block.chart.series.map((series) =>
                omitUndefined({
                  name: series.name,
                  bind: series.bind,
                  color: series.color,
                }),
              ),
            })
          : undefined,
        formula: block.formula
          ? {
              computationId: block.formula.computationId,
              steps: block.formula.steps.map((step) =>
                omitUndefined({ expression: step.expression, note: step.note }),
              ),
            }
          : undefined,
        quiz: block.quiz
          ? omitUndefined({
              prompt: block.quiz.prompt,
              answerKind: block.quiz.answerKind,
              choices: block.quiz.choices ? [...block.quiz.choices] : undefined,
              answer: block.quiz.answer,
              tolerance: block.quiz.tolerance,
              explanation: block.quiz.explanation,
            })
          : undefined,
        callout: block.callout,
      }),
    ),
    validation: project.validation?.map((rule) =>
      omitUndefined({
        id: rule.id,
        assert: rule.assert,
        message: rule.message,
        severity: rule.severity,
        tolerance: rule.tolerance,
      }),
    ),
    interactions: {
      recomputeMode: interactions.recomputeMode || "on-change",
      resetEnabled: interactions.resetEnabled !== false,
      scenarioSlots: interactions.scenarioSlots ?? 0,
      maxRecomputeMs:
        interactions.maxRecomputeMs ?? INTERACTIVE_DOC_LIMITS.recomputeMsDefault,
    },
    exports: project.exports ? [...project.exports] : undefined,
    attribution: {
      entries: project.attribution.entries.map((entry) =>
        omitUndefined({
          text: entry.text,
          licenseCode: entry.licenseCode,
          licenseUrl: entry.licenseUrl,
          datasetId: entry.datasetId,
        }),
      ),
    },
    dependencies: project.dependencies?.map((dependency) =>
      omitUndefined({
        path: dependency.path,
        sha256: dependency.sha256,
        mediaType: dependency.mediaType,
        byteSize: dependency.byteSize,
      }),
    ),
  }) as InteractiveDocProject;
}

/** §5.1 line 717:呈现块必须存在,否则是排版文档。 */
export function presentationBlocks(
  project: InteractiveDocProject,
): InteractiveDocBlock[] {
  return project.blocks.filter((block) =>
    (INTERACTIVE_DOC_PRESENTATION_BLOCK_KINDS as readonly string[]).includes(
      block.kind,
    ),
  );
}

/** `blocks[]` 里出现的全部 computation 绑定(metric / table 行 / chart 序列)。 */
export function boundComputationIds(project: InteractiveDocProject): Set<string> {
  const bound = new Set<string>();
  for (const block of project.blocks) {
    if (block.bind) bound.add(block.bind);
    for (const row of block.table?.rows || []) {
      if (row.bind) bound.add(row.bind);
    }
    for (const series of block.chart?.series || []) {
      bound.add(series.bind);
    }
    if (block.formula?.computationId) bound.add(block.formula.computationId);
  }
  return bound;
}

export function proseCharacterCount(project: InteractiveDocProject): number {
  return project.blocks
    .filter((block) => block.kind === "prose")
    .reduce((total, block) => total + (block.text || "").trim().length, 0);
}

export function quizItemCount(project: InteractiveDocProject): number {
  return project.blocks.filter((block) => block.kind === "quiz-item").length;
}

export function errorSeverityRuleCount(project: InteractiveDocProject): number {
  return (project.validation || []).filter((rule) => rule.severity === "error")
    .length;
}
