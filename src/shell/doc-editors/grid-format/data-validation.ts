/**
 * Data validation: entry constraints for grid cells.
 *
 * Nothing like this existed in the repo before (`rg -in "dataValidation"` over
 * `src/` returned zero, verified against a positive control first), so this is
 * a new surface rather than a rewrite.
 *
 * Two decisions worth stating up front, because both are load-bearing:
 *
 * 1. **Validation is a predicate, never a mutation.** `validateGridValue()`
 *    answers "may this land" and returns why not; it never rewrites, coerces or
 *    clamps the candidate. The same separation the number-format engine keeps
 *    between rendering and storage applies here: a validator that silently
 *    rounded 3.7 to 4 would corrupt data the user believed they typed.
 * 2. **"Warn" is the default, not "block".** The task brief is explicit about
 *    why — a hard block in a shared document is how one person's rule locks
 *    everyone else out of a cell they need to fix. `rejected` is true only when
 *    an invalid value meets a rule that explicitly asked to block.
 *
 * Cross-sheet dropdown sources work because `W12` shipped workbook context in
 * `d537d69`; `resolveValidationList()` resolves `Sheet2!A1:A9` through the same
 * rows the evaluator sees, so a dropdown and a formula can never disagree about
 * what `Sheet2` means.
 */

import { evaluateGridCell, type GridRow } from "../grid-formula";
import { rangeContainsCell, type GridRange } from "../grid-structure";
import { parseGridDateValue } from "./number-format";
import { translateRuleFormula } from "./conditional-format";

/* ------------------------------- rule model ------------------------------ */

export type GridValidationKind =
  | "list"
  | "whole"
  | "decimal"
  | "date"
  | "text-length"
  | "custom";

export type GridValidationOperator =
  | "between"
  | "not-between"
  | "equal"
  | "not-equal"
  | "greater-than"
  | "less-than"
  | "greater-equal"
  | "less-equal";

/**
 * `warn` lets the edit land and marks the cell; `block` refuses it. Default is
 * `warn` — see the module header.
 */
export type GridValidationBehavior = "warn" | "block";

interface ValidationCommon {
  id: string;
  range: GridRange;
  /** Defaults to `warn`. */
  behavior?: GridValidationBehavior;
  /** Defaults to true: an empty cell is "not filled in yet", not "wrong". */
  allowBlank?: boolean;
  /** Shown before the user types. */
  prompt?: string;
  /** Shown when the value fails; falls back to a generated description. */
  error?: string;
}

export type GridValidationRule =
  | (ValidationCommon & {
      kind: "list";
      /**
       * Either a literal list (`"甲,乙,丙"`) or a reference (`"=Sheet2!A1:A9"`).
       * Both forms are Excel's; which one is in play is decided by the leading
       * `=`, not by guessing at the content.
       */
      source: string;
      /** Defaults to true. False keeps the constraint but hides the arrow. */
      showDropdown?: boolean;
      /** Defaults to false: `"甲"` and `"甲 "` are different entries. */
      ignoreCase?: boolean;
    })
  | (ValidationCommon & {
      kind: "whole" | "decimal" | "text-length";
      operator: GridValidationOperator;
      value: string;
      /** Second bound; only `between` / `not-between` read it. */
      value2?: string;
    })
  | (ValidationCommon & {
      kind: "date";
      operator: GridValidationOperator;
      /** ISO date, or an Excel serial. Parsed by `parseGridDateValue`. */
      value: string;
      value2?: string;
    })
  | (ValidationCommon & {
      kind: "custom";
      /** `=AND(A1>0,A1<100)`; relative refs shift per cell, `$` refs do not. */
      formula: string;
    });

export type GridValidationRuleKind = GridValidationRule["kind"];

export type GridValidationCode =
  | "blank"
  | "not-in-list"
  | "not-number"
  | "not-whole"
  | "not-date"
  | "out-of-range"
  | "length"
  | "formula"
  | "unresolved-source";

export interface GridValidationVerdict {
  valid: boolean;
  /** Which rule spoke. Absent when no rule covers the cell. */
  ruleId?: string;
  code?: GridValidationCode;
  /** Ready to show; the rule's own `error` wins when it set one. */
  message?: string;
  behavior: GridValidationBehavior;
  /** The editor refuses the edit on this and only this. */
  rejected: boolean;
}

const VALID: GridValidationVerdict = {
  valid: true,
  behavior: "warn",
  rejected: false,
};

export const GRID_VALIDATION_KINDS: readonly GridValidationRuleKind[] = [
  "list",
  "whole",
  "decimal",
  "date",
  "text-length",
  "custom",
];

const OPERATORS: readonly GridValidationOperator[] = [
  "between",
  "not-between",
  "equal",
  "not-equal",
  "greater-than",
  "less-than",
  "greater-equal",
  "less-equal",
];

/* --------------------------- context and sources ------------------------- */

export interface GridValidationContext {
  rows: readonly GridRow[];
  /** Sheet name → rows, for `Sheet2!A1:A9` list sources and custom formulas. */
  workbook?: Readonly<Record<string, readonly GridRow[]>>;
  namedRanges?: Readonly<Record<string, string>>;
  sheetName?: string;
}

function columnIndexFromName(name: string): number {
  let value = 0;
  for (const char of name.toUpperCase()) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value - 1;
}

const A1_RANGE = /^([A-Za-z]{1,3})(\d{1,7})(?::([A-Za-z]{1,3})(\d{1,7}))?$/;

interface ResolvedReference {
  rows: readonly GridRow[];
  range: GridRange;
}

/**
 * Split `Sheet2!A1:A9` into the rows it names and the rectangle inside them.
 *
 * Sheet lookup is case-insensitive, as OOXML is and as `W12`'s evaluator
 * already is; an unknown sheet resolves to null rather than to the current
 * sheet, because silently reading the wrong sheet is worse than an empty list.
 */
function resolveReference(
  reference: string,
  context: GridValidationContext,
): ResolvedReference | null {
  let body = reference.trim();
  if (body.startsWith("=")) body = body.slice(1).trim();
  if (!body) return null;

  let rows = context.rows;
  const bang = body.lastIndexOf("!");
  if (bang >= 0) {
    let sheet = body.slice(0, bang).trim();
    body = body.slice(bang + 1).trim();
    if (sheet.startsWith("'") && sheet.endsWith("'") && sheet.length >= 2) {
      sheet = sheet.slice(1, -1).replace(/''/g, "'");
    }
    const own = context.sheetName ?? "";
    if (sheet.toLowerCase() !== own.toLowerCase()) {
      const table = context.workbook ?? {};
      const key = Object.keys(table).find(
        (name) => name.toLowerCase() === sheet.toLowerCase(),
      );
      if (key === undefined) return null;
      rows = table[key];
    }
  }

  const match = A1_RANGE.exec(body.replace(/\$/g, ""));
  if (!match) return null;
  const [, firstColName, firstRowName, lastColName, lastRowName] = match;
  const firstRow = Number(firstRowName) - 1;
  const firstCol = columnIndexFromName(firstColName);
  const lastRow = lastRowName === undefined ? firstRow : Number(lastRowName) - 1;
  const lastCol =
    lastColName === undefined ? firstCol : columnIndexFromName(lastColName);
  return {
    rows,
    range: {
      firstRow: Math.min(firstRow, lastRow),
      lastRow: Math.max(firstRow, lastRow),
      firstCol: Math.min(firstCol, lastCol),
      lastCol: Math.max(firstCol, lastCol),
    },
  };
}

export interface GridValidationList {
  options: readonly string[];
  /** True when the source was a reference that named no readable sheet. */
  unresolved: boolean;
  /** True when the source was `=…`, so the toolbar can show it as a link. */
  fromReference: boolean;
}

const LIST_LIMIT = 500;

/**
 * Turn a list rule's source into the options a dropdown offers.
 *
 * Blank cells inside a referenced range are dropped rather than offered as an
 * empty choice — a range is nearly always taller than the data in it, and an
 * empty option in a dropdown reads as a bug.
 */
export function resolveValidationList(
  rule: GridValidationRule,
  context: GridValidationContext,
): GridValidationList {
  if (rule.kind !== "list") {
    return { options: [], unresolved: false, fromReference: false };
  }
  const source = rule.source.trim();
  if (!source.startsWith("=")) {
    const options: string[] = [];
    for (const entry of source.split(",")) {
      const text = entry.trim();
      if (text && !options.includes(text)) options.push(text);
      if (options.length >= LIST_LIMIT) break;
    }
    return { options, unresolved: false, fromReference: false };
  }

  const resolved = resolveReference(source, context);
  if (!resolved) {
    return { options: [], unresolved: true, fromReference: true };
  }
  const options: string[] = [];
  const { range, rows } = resolved;
  for (let row = range.firstRow; row <= range.lastRow; row += 1) {
    for (let col = range.firstCol; col <= range.lastCol; col += 1) {
      const text = (rows[row]?.[col] ?? "").trim();
      if (text && !options.includes(text)) options.push(text);
      if (options.length >= LIST_LIMIT) {
        return { options, unresolved: false, fromReference: true };
      }
    }
  }
  return { options, unresolved: false, fromReference: true };
}

/* -------------------------------- comparison ----------------------------- */

function numericValue(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const percent = text.endsWith("%");
  const body = (percent ? text.slice(0, -1) : text).replace(/,/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(body)) return null;
  const parsed = Number(body);
  if (!Number.isFinite(parsed)) return null;
  return percent ? parsed / 100 : parsed;
}

function compare(
  operator: GridValidationOperator,
  actual: number,
  first: number,
  second: number | null,
): boolean {
  switch (operator) {
    case "between":
      return second === null
        ? actual >= first
        : actual >= Math.min(first, second) && actual <= Math.max(first, second);
    case "not-between":
      return second === null
        ? actual < first
        : actual < Math.min(first, second) || actual > Math.max(first, second);
    case "equal":
      return actual === first;
    case "not-equal":
      return actual !== first;
    case "greater-than":
      return actual > first;
    case "less-than":
      return actual < first;
    case "greater-equal":
      return actual >= first;
    default:
      return actual <= first;
  }
}

const OPERATOR_TEXT: Record<GridValidationOperator, string> = {
  between: "介于",
  "not-between": "不介于",
  equal: "等于",
  "not-equal": "不等于",
  "greater-than": "大于",
  "less-than": "小于",
  "greater-equal": "大于或等于",
  "less-equal": "小于或等于",
};

const KIND_TEXT: Record<GridValidationRuleKind, string> = {
  list: "序列",
  whole: "整数",
  decimal: "小数",
  date: "日期",
  "text-length": "文本长度",
  custom: "自定义公式",
};

function bounds(rule: GridValidationRule): string {
  if (rule.kind === "list" || rule.kind === "custom") return "";
  const second = rule.value2 ? ` 与 ${rule.value2}` : "";
  const joined =
    rule.operator === "between" || rule.operator === "not-between"
      ? `${rule.value}${second}`
      : rule.value;
  return `${OPERATOR_TEXT[rule.operator]} ${joined}`;
}

/** One line of human text for the rule manager and for the default message. */
export function describeValidationRule(rule: GridValidationRule): string {
  if (rule.kind === "list") {
    const source = rule.source.trim();
    return `${KIND_TEXT.list}：${source.startsWith("=") ? source : source || "（空）"}`;
  }
  if (rule.kind === "custom") return `${KIND_TEXT.custom}：${rule.formula}`;
  return `${KIND_TEXT[rule.kind]} ${bounds(rule)}`;
}

/* ------------------------------- evaluation ------------------------------ */

function behaviorOf(rule: GridValidationRule): GridValidationBehavior {
  return rule.behavior === "block" ? "block" : "warn";
}

function fail(
  rule: GridValidationRule,
  code: GridValidationCode,
  fallback: string,
): GridValidationVerdict {
  const behavior = behaviorOf(rule);
  return {
    valid: false,
    ruleId: rule.id,
    code,
    message: rule.error?.trim() || fallback,
    behavior,
    rejected: behavior === "block",
  };
}

/**
 * A custom rule is evaluated with the *candidate* written into the cell, not
 * the value already stored there.
 *
 * This is the whole point of a custom rule: `=A1>0` typed against A1 has to
 * judge what the user is about to commit. Evaluating the stored value would
 * validate the previous keystroke and let the new one through.
 */
function evaluateCustom(
  rule: GridValidationRule & { kind: "custom" },
  candidate: string,
  context: GridValidationContext,
  row: number,
  col: number,
): boolean | null {
  const source = rule.formula.startsWith("=") ? rule.formula : `=${rule.formula}`;
  const translated = translateRuleFormula(
    source,
    row - rule.range.firstRow,
    col - rule.range.firstCol,
  );

  const scratch: GridRow[] = context.rows.map((line) => line.slice());
  while (scratch.length <= row) scratch.push([]);
  const line = scratch[row].slice();
  while (line.length <= col) line.push("");
  line[col] = candidate;
  scratch[row] = line;
  const scratchRow = scratch.length;
  scratch.push([translated]);

  const result = evaluateGridCell(scratch, scratchRow, 0, {
    ...(context.namedRanges ? { namedRanges: context.namedRanges } : {}),
    ...(context.workbook ? { workbook: context.workbook } : {}),
    ...(context.sheetName ? { sheetName: context.sheetName } : {}),
  });
  if (typeof result === "number") return result !== 0;
  const text = String(result).trim().toUpperCase();
  if (text === "TRUE") return true;
  if (text === "FALSE" || text === "") return false;
  // An error is not a verdict. Returning null lets the caller decide, and the
  // caller lets the value through: a broken rule must not lock a user out.
  if (text.startsWith("#")) return null;
  const asNumber = Number(text);
  return Number.isFinite(asNumber) ? asNumber !== 0 : true;
}

/**
 * Judge one candidate against one rule.
 *
 * `row`/`col` matter only for custom formulas, which shift per cell; every
 * other kind is positional-independent.
 */
export function validateGridValue(
  rule: GridValidationRule,
  candidate: string,
  context: GridValidationContext,
  row = rule.range.firstRow,
  col = rule.range.firstCol,
): GridValidationVerdict {
  const text = candidate ?? "";
  if (!text.trim()) {
    if (rule.allowBlank === false) {
      return fail(rule, "blank", "此单元格不能为空");
    }
    return { ...VALID, ruleId: rule.id, behavior: behaviorOf(rule) };
  }

  if (rule.kind === "list") {
    const list = resolveValidationList(rule, context);
    if (list.unresolved) {
      // The source names a sheet we cannot read. Refusing every value here
      // would strand the user behind someone else's broken reference.
      return {
        ...VALID,
        ruleId: rule.id,
        code: "unresolved-source",
        behavior: behaviorOf(rule),
      };
    }
    const hit = rule.ignoreCase
      ? list.options.some((option) => option.toLowerCase() === text.toLowerCase())
      : list.options.includes(text);
    return hit
      ? { ...VALID, ruleId: rule.id, behavior: behaviorOf(rule) }
      : fail(
          rule,
          "not-in-list",
          `“${text}”不在候选列表中（${list.options.slice(0, 8).join("、") || "空列表"}）`,
        );
  }

  if (rule.kind === "custom") {
    const verdict = evaluateCustom(rule, text, context, row, col);
    if (verdict === null) {
      return { ...VALID, ruleId: rule.id, code: "formula", behavior: behaviorOf(rule) };
    }
    return verdict
      ? { ...VALID, ruleId: rule.id, behavior: behaviorOf(rule) }
      : fail(rule, "formula", `不满足自定义公式 ${rule.formula}`);
  }

  if (rule.kind === "date") {
    const actual = parseGridDateValue(text);
    if (!actual) return fail(rule, "not-date", `“${text}”不是有效日期`);
    const first = parseGridDateValue(rule.value);
    if (!first) return { ...VALID, ruleId: rule.id, behavior: behaviorOf(rule) };
    const second = rule.value2 ? parseGridDateValue(rule.value2) : null;
    const ok = compare(
      rule.operator,
      actual.getTime(),
      first.getTime(),
      second ? second.getTime() : null,
    );
    return ok
      ? { ...VALID, ruleId: rule.id, behavior: behaviorOf(rule) }
      : fail(rule, "out-of-range", `日期需${bounds(rule)}`);
  }

  if (rule.kind === "text-length") {
    // Count code points, not UTF-16 units: an emoji is one character to the
    // person typing it, and CJK text must not be counted double.
    const length = [...text].length;
    const first = numericValue(rule.value);
    if (first === null) return { ...VALID, ruleId: rule.id, behavior: behaviorOf(rule) };
    const second = rule.value2 ? numericValue(rule.value2) : null;
    return compare(rule.operator, length, first, second)
      ? { ...VALID, ruleId: rule.id, behavior: behaviorOf(rule) }
      : fail(rule, "length", `文本长度需${bounds(rule)}，当前 ${length}`);
  }

  const actual = numericValue(text);
  if (actual === null) return fail(rule, "not-number", `“${text}”不是数字`);
  if (rule.kind === "whole" && !Number.isInteger(actual)) {
    return fail(rule, "not-whole", `“${text}”不是整数`);
  }
  const first = numericValue(rule.value);
  if (first === null) return { ...VALID, ruleId: rule.id, behavior: behaviorOf(rule) };
  const second = rule.value2 ? numericValue(rule.value2) : null;
  return compare(rule.operator, actual, first, second)
    ? { ...VALID, ruleId: rule.id, behavior: behaviorOf(rule) }
    : fail(rule, "out-of-range", `数值需${bounds(rule)}`);
}

/* --------------------------------- manager ------------------------------- */

/**
 * The rule that governs a cell, or null.
 *
 * Excel allows exactly one validation per cell, and applying a new one over a
 * range replaces what was there. Later rules therefore win, which is what
 * "apply to selection" means to the person clicking it.
 */
export function validationRuleForCell(
  rules: readonly GridValidationRule[],
  row: number,
  col: number,
): GridValidationRule | null {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    if (rangeContainsCell(rules[index].range, row, col)) return rules[index];
  }
  return null;
}

export function validateGridCell(
  rules: readonly GridValidationRule[],
  context: GridValidationContext,
  row: number,
  col: number,
  candidate: string,
): GridValidationVerdict {
  const rule = validationRuleForCell(rules, row, col);
  if (!rule) return VALID;
  return validateGridValue(rule, candidate, context, row, col);
}

export interface GridInvalidCell {
  row: number;
  col: number;
  ruleId: string;
  code: GridValidationCode;
  message: string;
  value: string;
}

/**
 * Every cell currently holding a value its rule rejects — the set the UI draws
 * circles around.
 *
 * This deliberately reports cells that are already stored and invalid, which is
 * the normal state after `warn` let something through or after a rule was
 * tightened over existing data. Scanning is bounded by the rules' own ranges,
 * so a sheet with no validation costs nothing.
 */
export function findInvalidCells(
  rules: readonly GridValidationRule[],
  context: GridValidationContext,
  limit = 1000,
): GridInvalidCell[] {
  const out: GridInvalidCell[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    const { range } = rule;
    for (let row = range.firstRow; row <= range.lastRow; row += 1) {
      for (let col = range.firstCol; col <= range.lastCol; col += 1) {
        const key = `${row}:${col}`;
        if (seen.has(key)) continue;
        // Honour "last rule wins" even while iterating an earlier rule.
        if (validationRuleForCell(rules, row, col) !== rule) continue;
        seen.add(key);
        const value = context.rows[row]?.[col] ?? "";
        const verdict = validateGridValue(rule, value, context, row, col);
        if (verdict.valid) continue;
        out.push({
          row,
          col,
          ruleId: rule.id,
          code: verdict.code ?? "formula",
          message: verdict.message ?? describeValidationRule(rule),
          value,
        });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

export function listValidationRules(
  rules: readonly GridValidationRule[],
  selection?: GridRange,
): GridValidationRule[] {
  if (!selection) return [...rules];
  return rules.filter(
    (rule) =>
      !(
        rule.range.lastRow < selection.firstRow ||
        rule.range.firstRow > selection.lastRow ||
        rule.range.lastCol < selection.firstCol ||
        rule.range.firstCol > selection.lastCol
      ),
  );
}

export function updateValidationRule(
  rules: readonly GridValidationRule[],
  id: string,
  patch: Partial<GridValidationRule>,
): GridValidationRule[] {
  return rules.map((rule) =>
    rule.id === id ? ({ ...rule, ...patch, id: rule.id } as GridValidationRule) : rule,
  );
}

export function deleteValidationRule(
  rules: readonly GridValidationRule[],
  id: string,
): GridValidationRule[] {
  return rules.filter((rule) => rule.id !== id);
}

export function nextValidationId(rules: readonly GridValidationRule[]): string {
  let index = rules.length + 1;
  const used = new Set(rules.map((rule) => rule.id));
  while (used.has(`dv-${index}`)) index += 1;
  return `dv-${index}`;
}

/* ------------------------------ normalisation ---------------------------- */

function normalizeRange(
  value: unknown,
  maxRows: number,
  maxCols: number,
): GridRange | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const bound = (raw: unknown, limit: number): number => {
    const parsed = Number(raw);
    return Math.max(0, Math.min(limit - 1, Number.isFinite(parsed) ? Math.floor(parsed) : 0));
  };
  const firstRow = bound(source.firstRow, maxRows);
  const lastRow = bound(source.lastRow, maxRows);
  const firstCol = bound(source.firstCol, maxCols);
  const lastCol = bound(source.lastCol, maxCols);
  return {
    firstRow: Math.min(firstRow, lastRow),
    lastRow: Math.max(firstRow, lastRow),
    firstCol: Math.min(firstCol, lastCol),
    lastCol: Math.max(firstCol, lastCol),
  };
}

/**
 * Validate rules coming back from storage or from an imported workbook.
 *
 * Unknown kinds and unusable operators are dropped rather than coerced, on the
 * same reasoning as the conditional-format normaliser: a rule nobody can
 * evaluate would sit in the manager pretending to constrain something.
 */
export function normalizeValidationRules(
  value: unknown,
  maxRows = 10_000,
  maxCols = 256,
): GridValidationRule[] {
  const used = new Set<string>();
  const out: GridValidationRule[] = [];
  const entries = Array.isArray(value) ? value.slice(0, 500) : [];
  for (const [position, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const kind = String(source.kind ?? "") as GridValidationRuleKind;
    if (!GRID_VALIDATION_KINDS.includes(kind)) continue;
    const range = normalizeRange(source.range, maxRows, maxCols);
    if (!range) continue;
    let id = String(source.id ?? "")
      .replace(/[^a-z0-9_.:-]/gi, "-")
      .slice(0, 80);
    if (!id || used.has(id)) id = `dv-${position + 1}`;
    used.add(id);

    const common = {
      id,
      range,
      ...(source.behavior === "block" ? { behavior: "block" as const } : {}),
      ...(source.allowBlank === false ? { allowBlank: false } : {}),
      ...(typeof source.prompt === "string" && source.prompt.trim()
        ? { prompt: source.prompt.slice(0, 240) }
        : {}),
      ...(typeof source.error === "string" && source.error.trim()
        ? { error: source.error.slice(0, 240) }
        : {}),
    };

    if (kind === "list") {
      const listSource = String(source.source ?? "").slice(0, 2000);
      if (!listSource.trim()) continue;
      out.push({
        ...common,
        kind,
        source: listSource,
        ...(source.showDropdown === false ? { showDropdown: false } : {}),
        ...(source.ignoreCase === true ? { ignoreCase: true } : {}),
      });
      continue;
    }
    if (kind === "custom") {
      const formula = String(source.formula ?? "").slice(0, 500);
      if (!formula.trim()) continue;
      out.push({ ...common, kind, formula });
      continue;
    }
    const operator = String(source.operator ?? "") as GridValidationOperator;
    if (!OPERATORS.includes(operator)) continue;
    const first = String(source.value ?? "").slice(0, 240);
    if (!first.trim()) continue;
    out.push({
      ...common,
      kind,
      operator,
      value: first,
      ...(source.value2 !== undefined && String(source.value2).trim()
        ? { value2: String(source.value2).slice(0, 240) }
        : {}),
    });
  }
  return out;
}

export const __dataValidationInternals = {
  resolveReference,
  numericValue,
  compare,
};
