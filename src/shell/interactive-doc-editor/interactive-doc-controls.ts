import type { UITranslate } from "../../i18n/ui/useUI";
import type { SelectionControl } from "../selection-context";
import type { InteractiveDocProject } from "./interactive-doc-schema";

/**
 * Parameter control family and presentation primitives for
 * `oceanleo.interactive-doc.v1`.
 *
 * Every token in this file is a literal from the carrier contract
 * (`docs/specs/oceanleo-material-and-game-v1/L1-carriers/interactive-doc.md`)
 * §2.1 palette / §2.2 grid / §2.3 type scale / §2.4 WCAG 2.2 obligations.
 * The values are Normative: they must not be re-derived to satisfy a contrast
 * check, because §2.1 splits `doc.border` (decorative, 1.45:1, outside every
 * success criterion) from `doc.rule.strong` (component boundary, SC 1.4.11,
 * judged against the darker zebra base at 3.48:1).
 */

export type InteractiveDocParameter =
  InteractiveDocProject["parameters"][number];

/** §3.2 `parameters[].kind` — all eight declared input types. */
export const INTERACTIVE_DOC_PARAMETER_KINDS = [
  "number",
  "integer",
  "percent",
  "currency",
  "boolean",
  "enum",
  "date",
  "text",
] as const;

/** §3.2 `parameters[].control` — all seven declared control types. */
export const INTERACTIVE_DOC_CONTROL_TYPES = [
  "input",
  "slider",
  "stepper",
  "select",
  "switch",
  "radio",
  "date-picker",
] as const;

export type InteractiveDocParameterKind =
  (typeof INTERACTIVE_DOC_PARAMETER_KINDS)[number];
export type InteractiveDocControlType =
  (typeof INTERACTIVE_DOC_CONTROL_TYPES)[number];

export type InteractiveDocParameterValue = string | number | boolean;

/** §2.1 色板 — literal values, one token per row. */
export const INTERACTIVE_DOC_PALETTE = {
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
} as const;

/**
 * §2.1 contrast obligations. `doc.rule.strong` carries SC 1.4.11 against both
 * bases and is judged on the minimum of the two; `doc.border` is decorative and
 * only owes "distinguishable from the base" (1.05:1), explicitly not SC 1.4.11.
 */
export const INTERACTIVE_DOC_CONTRAST_OBLIGATIONS = [
  { token: "doc.text.primary", base: "doc.surface", minRatio: 4.5, criterion: "SC 1.4.3" },
  { token: "doc.text.secondary", base: "doc.surface", minRatio: 4.5, criterion: "SC 1.4.3" },
  { token: "doc.accent", base: "doc.surface", minRatio: 4.5, criterion: "SC 1.4.3" },
  { token: "doc.positive", base: "doc.surface", minRatio: 4.5, criterion: "SC 1.4.3" },
  { token: "doc.negative", base: "doc.surface", minRatio: 4.5, criterion: "SC 1.4.3" },
  { token: "doc.warn", base: "doc.surface", minRatio: 4.5, criterion: "SC 1.4.3" },
  { token: "doc.rule.strong", base: "doc.surface", minRatio: 3, criterion: "SC 1.4.11" },
  { token: "doc.rule.strong", base: "doc.surface.alt", minRatio: 3, criterion: "SC 1.4.11" },
  { token: "doc.surface.alt", base: "doc.surface", minRatio: 1.05, criterion: "none (layering)" },
  { token: "doc.border", base: "doc.surface", minRatio: 1.05, criterion: "none (decorative)" },
] as const;

/** §2.2 版面栅格 (px unless noted). */
export const INTERACTIVE_DOC_GRID = {
  documentWidthPx: 960,
  columns: 12,
  columnGapPx: 16,
  documentPaddingPx: 40,
  blockGapPx: 24,
  parameterPanelMinColumns: 4,
  resultCardMinColumns: 3,
  controlMinHeightPx: 40,
  tableRowHeightPx: 36,
} as const;

/** §2.3 字号档 (fontSizePx / lineHeightPx). */
export const INTERACTIVE_DOC_TYPE_SCALE = {
  h1: { fontSizePx: 30, lineHeightPx: 40 },
  h2: { fontSizePx: 22, lineHeightPx: 30 },
  h3: { fontSizePx: 17, lineHeightPx: 24 },
  body: { fontSizePx: 15, lineHeightPx: 24 },
  metric: { fontSizePx: 32, lineHeightPx: 40 },
  caption: { fontSizePx: 12, lineHeightPx: 18 },
} as const;

/** §2.4 WCAG 2.2 success criteria this viewport is answerable for. */
export const INTERACTIVE_DOC_WCAG_OBLIGATIONS = [
  {
    criterion: "SC 1.3.1",
    obligation:
      "每个参数控件有可编程关联标签；结果卡声明其依赖的参数 id",
    surface: "controlDescriptor.labelId / metric.dependsOnParameterIds",
  },
  {
    criterion: "SC 1.4.3",
    obligation: "§2.1 逐 token 的 4.5:1 文本对比度",
    surface: "INTERACTIVE_DOC_CONTRAST_OBLIGATIONS",
  },
  {
    criterion: "SC 2.4.6",
    obligation: "parameters[].label 非空且 ≥ 2 字符",
    surface: "coerceInteractiveDocLabel",
  },
  {
    criterion: "SC 3.3.1",
    obligation: "校验失败以文本给出，不只靠 doc.negative 颜色",
    surface: "controlDescriptor.issue.message + role=alert",
  },
  {
    criterion: "SC 3.3.2",
    obligation: "带取值域的数值参数同时给出 min / max / unit 的可见说明",
    surface: "controlDescriptor.domainHint",
  },
  {
    criterion: "SC 2.5.8",
    obligation: "控件最小高度 40 px ≥ 24 px 目标尺寸",
    surface: "INTERACTIVE_DOC_GRID.controlMinHeightPx",
  },
] as const;

/** Placeholder shown instead of `NaN` / `Infinity` / `null` (§6 F3). */
export const INTERACTIVE_DOC_VALUE_PLACEHOLDER = "—";

const NUMERIC_KINDS = new Set<InteractiveDocParameterKind>([
  "number",
  "integer",
  "percent",
  "currency",
]);

const CONTROLS_BY_KIND: Record<
  InteractiveDocParameterKind,
  readonly InteractiveDocControlType[]
> = {
  number: ["input", "slider", "stepper"],
  integer: ["input", "slider", "stepper"],
  percent: ["input", "slider", "stepper"],
  currency: ["input", "stepper"],
  boolean: ["switch"],
  enum: ["select", "radio"],
  date: ["date-picker"],
  text: ["input"],
};

const DEFAULT_CONTROL_BY_KIND: Record<
  InteractiveDocParameterKind,
  InteractiveDocControlType
> = {
  number: "input",
  integer: "stepper",
  percent: "slider",
  currency: "input",
  boolean: "switch",
  enum: "select",
  date: "date-picker",
  text: "input",
};

export function interactiveDocControlsForKind(
  kind: InteractiveDocParameterKind,
): readonly InteractiveDocControlType[] {
  return CONTROLS_BY_KIND[kind] || ["input"];
}

export function interactiveDocDefaultControl(
  kind: InteractiveDocParameterKind,
): InteractiveDocControlType {
  return DEFAULT_CONTROL_BY_KIND[kind] || "input";
}

export function isNumericParameterKind(kind: string): boolean {
  return NUMERIC_KINDS.has(kind as InteractiveDocParameterKind);
}

export interface InteractiveDocIssue {
  code: string;
  severity: "error" | "warn";
  message: string;
  parameterId?: string;
  blockId?: string;
  nodeId?: string;
}

export type InteractiveDocCoercion =
  | { ok: true; value: InteractiveDocParameterValue; issue?: InteractiveDocIssue }
  | { ok: false; issue: InteractiveDocIssue };

function issue(
  code: string,
  message: string,
  parameterId: string,
  severity: "error" | "warn" = "error",
): InteractiveDocIssue {
  return { code, severity, message, parameterId };
}

function parameterKindOf(parameter: unknown): InteractiveDocParameterKind {
  const kind = String((parameter as { kind?: unknown })?.kind || "");
  return INTERACTIVE_DOC_PARAMETER_KINDS.includes(
    kind as InteractiveDocParameterKind,
  )
    ? (kind as InteractiveDocParameterKind)
    : "text";
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionValues(parameter: unknown): InteractiveDocParameterValue[] {
  const options = (parameter as { options?: unknown }).options;
  if (!Array.isArray(options)) return [];
  return options
    .map((option) => (option as { value?: unknown })?.value)
    .filter(
      (value): value is InteractiveDocParameterValue =>
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean",
    );
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

export function isIsoDateLike(value: string): boolean {
  if (!ISO_DATE_RE.test(value) && !ISO_DATE_TIME_RE.test(value)) return false;
  const parsed = Date.parse(
    ISO_DATE_RE.test(value) ? `${value}T00:00:00Z` : value,
  );
  if (!Number.isFinite(parsed)) return false;
  if (!ISO_DATE_RE.test(value)) return true;
  // Reject calendar-invalid days such as 2026-02-31 that Date.parse tolerates.
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

/**
 * §6 F5 — a numeric parameter without `min` / `max` / `unit` is a project
 * defect. The renderer MUST NOT substitute a default domain, so the missing
 * domain is reported as a controlled issue instead of being silently filled.
 */
export function interactiveDocParameterDomainIssue(
  parameter: unknown,
): InteractiveDocIssue | null {
  const kind = parameterKindOf(parameter);
  const id = String((parameter as { id?: unknown })?.id || "");
  if (!NUMERIC_KINDS.has(kind)) return null;
  const record = parameter as { min?: unknown; max?: unknown; unit?: unknown };
  const missing: string[] = [];
  if (typeof record.min !== "number") missing.push("min");
  if (typeof record.max !== "number") missing.push("max");
  if (typeof record.unit !== "string" || !record.unit) missing.push("unit");
  if (!missing.length) return null;
  return issue(
    "interactive-doc-parameter-missing-domain",
    `参数「${id}」缺少 ${missing.join(" / ")}，无法给出取值域说明（§3.2 allOf / §6 F5 / WCAG 2.2 SC 3.3.2）`,
    id,
  );
}

/** SC 2.4.6 — label MUST be non-empty and at least 2 characters. */
export function interactiveDocLabelIssue(
  parameter: unknown,
): InteractiveDocIssue | null {
  const id = String((parameter as { id?: unknown })?.id || "");
  const label = String((parameter as { label?: unknown })?.label || "");
  if (label.trim().length >= 2) return null;
  return issue(
    "interactive-doc-parameter-label-too-short",
    `参数「${id}」的 label 少于 2 字符，违反 WCAG 2.2 SC 2.4.6（§2.4）`,
    id,
  );
}

/**
 * Validates one raw control input against its parameter declaration. Invalid
 * input always produces a text message (SC 3.3.1); nothing is swallowed and no
 * value is clamped behind the user's back.
 */
export function coerceInteractiveDocParameter(
  parameter: unknown,
  raw: unknown,
): InteractiveDocCoercion {
  const id = String((parameter as { id?: unknown })?.id || "");
  const kind = parameterKindOf(parameter);
  const label = String((parameter as { label?: unknown })?.label || id);
  const record = parameter as {
    min?: unknown;
    max?: unknown;
    step?: unknown;
    unit?: unknown;
    precision?: unknown;
  };
  const unit = typeof record.unit === "string" ? record.unit : "";

  if (kind === "boolean") {
    if (typeof raw === "boolean") return { ok: true, value: raw };
    const text = String(raw ?? "").trim().toLowerCase();
    if (text === "true" || text === "1") return { ok: true, value: true };
    if (text === "false" || text === "0") return { ok: true, value: false };
    return {
      ok: false,
      issue: issue(
        "interactive-doc-parameter-not-boolean",
        `「${label}」只接受是 / 否两种取值`,
        id,
      ),
    };
  }

  if (kind === "enum") {
    const allowed = optionValues(parameter);
    const match = allowed.find((value) => String(value) === String(raw));
    if (match === undefined) {
      return {
        ok: false,
        issue: issue(
          "interactive-doc-parameter-not-in-options",
          `「${label}」只接受下列取值：${allowed.map((value) => String(value)).join(" / ")}`,
          id,
        ),
      };
    }
    return { ok: true, value: match };
  }

  if (kind === "date") {
    const text = String(raw ?? "").trim();
    if (!isIsoDateLike(text)) {
      return {
        ok: false,
        issue: issue(
          "interactive-doc-parameter-invalid-date",
          `「${label}」需要 YYYY-MM-DD 形式的合法日期`,
          id,
        ),
      };
    }
    return { ok: true, value: text };
  }

  if (kind === "text") {
    if (typeof raw === "object" && raw !== null) {
      return {
        ok: false,
        issue: issue(
          "interactive-doc-parameter-not-text",
          `「${label}」只接受文本`,
          id,
        ),
      };
    }
    const text = String(raw ?? "");
    if (text.length > 2000) {
      return {
        ok: false,
        issue: issue(
          "interactive-doc-parameter-text-too-long",
          `「${label}」超过 2000 字符上限`,
          id,
        ),
      };
    }
    return { ok: true, value: text };
  }

  const parsed = numberOrNull(raw);
  if (parsed === null) {
    return {
      ok: false,
      issue: issue(
        "interactive-doc-parameter-not-a-number",
        `「${label}」需要一个有限数值${unit ? `（单位：${unit}）` : ""}`,
        id,
      ),
    };
  }
  if (kind === "integer" && !Number.isInteger(parsed)) {
    return {
      ok: false,
      issue: issue(
        "interactive-doc-parameter-not-an-integer",
        `「${label}」需要整数`,
        id,
      ),
    };
  }
  const min = typeof record.min === "number" ? record.min : null;
  const max = typeof record.max === "number" ? record.max : null;
  if ((min !== null && parsed < min) || (max !== null && parsed > max)) {
    return {
      ok: false,
      issue: issue(
        "interactive-doc-parameter-out-of-range",
        `「${label}」超出取值域 ${min ?? "-∞"} – ${max ?? "+∞"}${unit ? ` ${unit}` : ""}`,
        id,
      ),
    };
  }
  const step = typeof record.step === "number" && record.step > 0 ? record.step : null;
  if (step !== null && min !== null) {
    const offset = (parsed - min) / step;
    if (Math.abs(offset - Math.round(offset)) > 1e-9) {
      return {
        ok: true,
        value: parsed,
        issue: issue(
          "interactive-doc-parameter-off-step",
          `「${label}」不在 ${step}${unit ? ` ${unit}` : ""} 的步长刻度上，已按输入值计算`,
          id,
          "warn",
        ),
      };
    }
  }
  return { ok: true, value: parsed };
}

export interface InteractiveDocControlDescriptor {
  parameterId: string;
  label: string;
  help: string;
  kind: InteractiveDocParameterKind;
  control: InteractiveDocControlType;
  unit: string;
  min: number | null;
  max: number | null;
  step: number | null;
  precision: number | null;
  options: Array<{ value: InteractiveDocParameterValue; label: string }>;
  value: InteractiveDocParameterValue;
  /** SC 1.3.1 — the `<label for>` / `aria-labelledby` target. */
  labelId: string;
  /** SC 3.3.2 — visible min / max / unit sentence for bounded numerics. */
  domainHint: string;
  /** SC 3.3.1 — text description of the current validation failure. */
  issue: InteractiveDocIssue | null;
  /** SC 1.3.1 — ids of the elements describing this control. */
  describedBy: string[];
  minHeightPx: number;
  /** Computation ids that read this parameter (drives the recompute hint). */
  downstream: string[];
}

export function interactiveDocDomainHint(parameter: unknown): string {
  const kind = parameterKindOf(parameter);
  if (!NUMERIC_KINDS.has(kind)) return "";
  const record = parameter as { min?: unknown; max?: unknown; unit?: unknown };
  const min = typeof record.min === "number" ? record.min : null;
  const max = typeof record.max === "number" ? record.max : null;
  const unit = typeof record.unit === "string" ? record.unit : "";
  if (min === null || max === null || !unit) return "";
  return `取值域 ${min} – ${max} ${unit}`;
}

export function interactiveDocControlDescriptor(args: {
  parameter: unknown;
  value: unknown;
  issue?: InteractiveDocIssue | null;
  downstream?: readonly string[];
}): InteractiveDocControlDescriptor {
  const { parameter } = args;
  const id = String((parameter as { id?: unknown })?.id || "");
  const kind = parameterKindOf(parameter);
  const record = parameter as {
    label?: unknown;
    help?: unknown;
    unit?: unknown;
    min?: unknown;
    max?: unknown;
    step?: unknown;
    precision?: unknown;
    control?: unknown;
    default?: unknown;
  };
  const declaredControl = String(record.control || "");
  const allowed = interactiveDocControlsForKind(kind);
  const control = allowed.includes(declaredControl as InteractiveDocControlType)
    ? (declaredControl as InteractiveDocControlType)
    : interactiveDocDefaultControl(kind);
  const labelId = `interactive-doc-param-${id}-label`;
  const domainHint = interactiveDocDomainHint(parameter);
  const describedBy: string[] = [];
  if (record.help) describedBy.push(`interactive-doc-param-${id}-help`);
  if (domainHint) describedBy.push(`interactive-doc-param-${id}-domain`);
  const controlIssue = args.issue || interactiveDocParameterDomainIssue(parameter);
  if (controlIssue) describedBy.push(`interactive-doc-param-${id}-issue`);
  const fallback = record.default;
  const rawValue = args.value === undefined ? fallback : args.value;
  const value: InteractiveDocParameterValue =
    typeof rawValue === "string" ||
    typeof rawValue === "number" ||
    typeof rawValue === "boolean"
      ? rawValue
      : "";
  return {
    parameterId: id,
    label: String(record.label || id),
    help: typeof record.help === "string" ? record.help : "",
    kind,
    control,
    unit: typeof record.unit === "string" ? record.unit : "",
    min: typeof record.min === "number" ? record.min : null,
    max: typeof record.max === "number" ? record.max : null,
    step: typeof record.step === "number" ? record.step : null,
    precision: typeof record.precision === "number" ? record.precision : null,
    options: optionValues(parameter).map((optionValue, index) => {
      const options = (parameter as { options?: unknown }).options;
      const entry = Array.isArray(options) ? options[index] : null;
      const optionLabel = String(
        (entry as { label?: unknown })?.label || optionValue,
      );
      return { value: optionValue, label: optionLabel };
    }),
    value,
    labelId,
    domainHint,
    issue: controlIssue,
    describedBy,
    minHeightPx: INTERACTIVE_DOC_GRID.controlMinHeightPx,
    downstream: [...(args.downstream || [])],
  };
}

export function interactiveDocControlFamily(args: {
  parameters: readonly unknown[];
  values: Record<string, InteractiveDocParameterValue>;
  issues?: Record<string, InteractiveDocIssue>;
  dependents?: Record<string, readonly string[]>;
}): InteractiveDocControlDescriptor[] {
  return args.parameters.map((parameter) => {
    const id = String((parameter as { id?: unknown })?.id || "");
    return interactiveDocControlDescriptor({
      parameter,
      value: args.values[id],
      issue: args.issues?.[id] || null,
      downstream: args.dependents?.[id] || [],
    });
  });
}

/**
 * Formats a computed value for a `metric` / `table` cell. `null`, `NaN` and
 * `Infinity` all collapse to the placeholder: §6 F3 forbids letting a NaN
 * literal reach the presentation layer.
 */
export function formatInteractiveDocValue(
  value: unknown,
  options: { precision?: number | null; unit?: string } = {},
): string {
  const precision =
    typeof options.precision === "number" &&
    options.precision >= 0 &&
    options.precision <= 8
      ? options.precision
      : null;
  const unit = options.unit ? ` ${options.unit}` : "";
  if (value === null || value === undefined) {
    return INTERACTIVE_DOC_VALUE_PLACEHOLDER;
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return INTERACTIVE_DOC_VALUE_PLACEHOLDER;
    const text = precision === null ? String(value) : value.toFixed(precision);
    return `${text}${unit}`;
  }
  const text = String(value);
  if (!text) return INTERACTIVE_DOC_VALUE_PLACEHOLDER;
  if (/^(nan|infinity|-infinity)$/i.test(text.trim())) {
    return INTERACTIVE_DOC_VALUE_PLACEHOLDER;
  }
  return `${text}${unit}`;
}

export type InteractiveDocTextToken =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "emphasis"; text: string }
  | { kind: "code"; text: string };

/**
 * §5.5 — `blocks[].text` renders through a restricted inline subset
 * (`**strong**`, `*emphasis*`, `` `code` ``) emitted as tokens. The viewport
 * turns tokens into React elements, so no HTML string ever reaches an injection
 * sink and no raw-HTML escape hatch is needed.
 */
export function parseInteractiveDocText(
  text: string,
): InteractiveDocTextToken[] {
  const source = String(text ?? "");
  const tokens: InteractiveDocTextToken[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let cursor = 0;
  let match = pattern.exec(source);
  while (match) {
    if (match.index > cursor) {
      tokens.push({ kind: "text", text: source.slice(cursor, match.index) });
    }
    if (match[1] !== undefined) tokens.push({ kind: "strong", text: match[1] });
    else if (match[2] !== undefined) tokens.push({ kind: "emphasis", text: match[2] });
    else if (match[3] !== undefined) tokens.push({ kind: "code", text: match[3] });
    cursor = match.index + match[0].length;
    match = pattern.exec(source);
  }
  if (cursor < source.length) {
    tokens.push({ kind: "text", text: source.slice(cursor) });
  }
  return tokens;
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928
    ? scaled / 12.92
    : Math.pow((scaled + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const text = hex.replace("#", "");
  const r = Number.parseInt(text.slice(0, 2), 16);
  const g = Number.parseInt(text.slice(2, 4), 16);
  const b = Number.parseInt(text.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.2 relative-luminance contrast ratio, rounded to two decimals. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return Math.round(ratio * 100) / 100;
}

const SELECTION_CONTROL_KIND: Record<
  InteractiveDocControlType,
  "text" | "number" | "range" | "select" | "toggle"
> = {
  input: "text",
  slider: "range",
  stepper: "number",
  select: "select",
  switch: "toggle",
  radio: "select",
  "date-picker": "text",
};

export function interactiveDocParameterControlId(parameterId: string): string {
  return `param:${parameterId}`;
}

export function parseInteractiveDocParameterControlId(
  controlId: string,
): string | null {
  const match = /^param:([a-z][a-zA-Z0-9_]{0,47})$/.exec(controlId);
  return match ? match[1] : null;
}

/**
 * Projects the control family onto the shared selection toolbar protocol.
 * `toolbarOwnership: "shared"` means the host renders the chrome, so the
 * descriptors must degrade to the protocol's control kinds without losing the
 * label, the domain hint or the failure text.
 */
export function interactiveDocSelectionControls(
  descriptors: readonly InteractiveDocControlDescriptor[],
  tt: UITranslate,
): SelectionControl[] {
  const controls: SelectionControl[] = [];
  for (const descriptor of descriptors) {
    const kind = SELECTION_CONTROL_KIND[descriptor.control];
    const numeric = kind === "number" || kind === "range";
    const label = descriptor.domainHint
      ? `${descriptor.label}（${descriptor.domainHint}）`
      : descriptor.label;
    const control: SelectionControl = {
      id: interactiveDocParameterControlId(descriptor.parameterId),
      kind,
      label,
      slot: "inspector",
      inspectorGroup: "interactive-doc-parameters",
      inspectorLabel: tt("参数"),
      inspectorIcon: "note",
      value:
        kind === "toggle"
          ? descriptor.value === true
          : numeric
            ? Number(descriptor.value) || 0
            : String(descriptor.value ?? ""),
      ...(numeric && descriptor.min !== null ? { min: descriptor.min } : {}),
      ...(numeric && descriptor.max !== null ? { max: descriptor.max } : {}),
      ...(numeric && descriptor.step !== null ? { step: descriptor.step } : {}),
      ...(kind === "select"
        ? {
            options: descriptor.options.map((option) => ({
              value: String(option.value),
              label: option.label,
            })),
          }
        : {}),
      ...(descriptor.issue
        ? { tone: "danger" as const, unavailableReason: descriptor.issue.message }
        : {}),
    };
    controls.push(control);
  }
  return controls;
}
