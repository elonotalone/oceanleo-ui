/**
 * Rule-driven conditional formatting.
 *
 * ## What this module does and does not change (W13 裁定 A-1)
 *
 * The task brief claimed formats did not follow the data. That was wrong and
 * was retracted: `grid-model.ts` `gridDisplayFormat()` already re-runs
 * `conditionalGridStyle()` against a freshly evaluated value on every read, so
 * **automatic recalculation has always worked and is deliberately preserved
 * here** — `resolveConditionalStyle()` is a pure function of the current value
 * for exactly that reason.
 *
 * The two real gaps this module closes:
 *
 * 1. **Rule management.** `grid-structure.ts` supports appending one rule to a
 *    selection and clearing every rule in a selection. There is no way to list,
 *    edit, reorder or delete a single rule, no priority, no "stop if true", and
 *    only five operators.
 * 2. **Cost.** `conditionalGridStyle()` reduces over *every* rule for *every*
 *    cell, and the range-wide statistics that data bars, colour scales and icon
 *    sets need would multiply that by another full scan. The index below buckets
 *    rules by row band and memoises range statistics, invalidating only the
 *    ranges a change actually touched.
 *
 * `grid-structure.ts` is not this task's surface, so its five-operator rule type
 * is imported and widened rather than edited; `fromLegacyConditionalFormat()`
 * lifts an existing stored rule into the richer shape without a migration.
 */

import { evaluateGridCell, gridColumnName } from "../grid-formula";
import {
  rangeContainsCell,
  rangesIntersect,
  type GridConditionalFormat,
  type GridRange,
} from "../grid-structure";

/* ------------------------------- rule model ------------------------------ */

export type GridComparisonOperator =
  | "greater-than"
  | "less-than"
  | "greater-equal"
  | "less-equal"
  | "equal"
  | "not-equal"
  | "between"
  | "not-between";

export type GridTextOperator =
  | "contains"
  | "not-contains"
  | "begins-with"
  | "ends-with";

export type GridBlankOperator = "blank" | "not-blank";

export type GridUniquenessOperator = "duplicate" | "unique";

export type GridIconSetName = "arrows" | "traffic" | "triangles" | "flags";

export interface GridConditionalStyle {
  color?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
}

interface RuleCommon {
  id: string;
  range: GridRange;
  /** Ascending: 1 runs before 2. Ties fall back to position in the array. */
  priority: number;
  /** When this rule matches, no lower-priority rule may also apply. */
  stopIfTrue?: boolean;
  /** A disabled rule keeps its slot in the manager but paints nothing. */
  disabled?: boolean;
}

export type GridConditionalRule =
  | (RuleCommon & {
      kind: "cell-value";
      operator: GridComparisonOperator;
      value: string;
      /** Second bound; only `between` / `not-between` read it. */
      value2?: string;
      style: GridConditionalStyle;
    })
  | (RuleCommon & {
      kind: "text";
      operator: GridTextOperator;
      value: string;
      style: GridConditionalStyle;
    })
  | (RuleCommon & {
      kind: "blank";
      operator: GridBlankOperator;
      style: GridConditionalStyle;
    })
  | (RuleCommon & {
      kind: "uniqueness";
      operator: GridUniquenessOperator;
      style: GridConditionalStyle;
    })
  | (RuleCommon & {
      kind: "formula";
      /** `=$A1>100`; relative parts shift per cell, `$` parts do not. */
      formula: string;
      style: GridConditionalStyle;
    })
  | (RuleCommon & {
      kind: "data-bar";
      color: string;
      negativeColor?: string;
      showValue?: boolean;
    })
  | (RuleCommon & {
      kind: "color-scale";
      /** Two or three stops, low → high. */
      colors: readonly string[];
    })
  | (RuleCommon & {
      kind: "icon-set";
      set: GridIconSetName;
      reverse?: boolean;
    });

export type GridConditionalRuleKind = GridConditionalRule["kind"];

export interface GridDataBarPaint {
  /** 0–1 share of the cell width. */
  fraction: number;
  color: string;
  /** Negative bars grow from the axis in the other direction. */
  negative: boolean;
}

export interface GridIconPaint {
  glyph: string;
  label: string;
}

export interface GridConditionalPaint {
  color?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  dataBar?: GridDataBarPaint;
  icon?: GridIconPaint;
  /** Ids of the rules that contributed, in the order they were applied. */
  appliedRuleIds: readonly string[];
  /** True when a `stopIfTrue` rule cut the cascade short. */
  stopped: boolean;
}

const EMPTY_PAINT: GridConditionalPaint = {
  appliedRuleIds: [],
  stopped: false,
};

/* ------------------------------- iconography ----------------------------- */

const ICON_SETS: Readonly<
  Record<GridIconSetName, readonly { glyph: string; label: string }[]>
> = {
  // Three buckets, low → high. Glyphs are text so they survive an export and a
  // screen reader; an icon font would be a new runtime dependency.
  arrows: [
    { glyph: "↓", label: "下降" },
    { glyph: "→", label: "持平" },
    { glyph: "↑", label: "上升" },
  ],
  traffic: [
    { glyph: "●", label: "红灯" },
    { glyph: "●", label: "黄灯" },
    { glyph: "●", label: "绿灯" },
  ],
  triangles: [
    { glyph: "▼", label: "下降" },
    { glyph: "◆", label: "持平" },
    { glyph: "▲", label: "上升" },
  ],
  flags: [
    { glyph: "⚑", label: "低" },
    { glyph: "⚑", label: "中" },
    { glyph: "⚑", label: "高" },
  ],
};

const TRAFFIC_COLORS = ["#cf222e", "#bf8700", "#1a7f37"];

/* -------------------------------- numbers -------------------------------- */

function numeric(value: string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const percent = trimmed.endsWith("%");
  const parsed = Number((percent ? trimmed.slice(0, -1) : trimmed).replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return percent ? parsed / 100 : parsed;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function parseHex(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return null;
  const value = Number.parseInt(hex[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(channels: readonly number[]): string {
  return `#${channels
    .map((channel) => Math.round(clamp01(channel / 255) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Linear interpolation across two or three stops, low → high. */
export function interpolateColorScale(
  colors: readonly string[],
  fraction: number,
): string | undefined {
  const stops = colors.map(parseHex).filter((stop): stop is [number, number, number] => stop !== null);
  if (stops.length === 0) return undefined;
  if (stops.length === 1) return toHex(stops[0]);
  const position = clamp01(fraction) * (stops.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(stops.length - 1, lower + 1);
  const ratio = position - lower;
  return toHex(
    stops[lower].map((channel, index) => channel + (stops[upper][index] - channel) * ratio),
  );
}

/* ------------------------------ formula rules ---------------------------- */

const REFERENCE = /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g;

/**
 * Shift the relative half of every A1 reference by a row/column offset, which
 * is how one authored rule (`=$A1>100`) covers a whole range: the `$` parts stay
 * put and the rest tracks the cell being painted.
 */
export function translateRuleFormula(
  formula: string,
  rowOffset: number,
  colOffset: number,
): string {
  let out = "";
  let index = 0;
  while (index < formula.length) {
    const char = formula[index];
    // Quoted text is data, not references; `"A1"` must survive untouched.
    if (char === '"') {
      const close = formula.indexOf('"', index + 1);
      const end = close < 0 ? formula.length : close + 1;
      out += formula.slice(index, end);
      index = end;
      continue;
    }
    const rest = formula.slice(index);
    REFERENCE.lastIndex = 0;
    const match = REFERENCE.exec(rest);
    if (match && match.index === 0) {
      const [whole, colAbsolute, colName, rowAbsolute, rowName] = match;
      // A bare `SUM2` style token is a name, not a reference, when a letter or
      // digit runs straight into it from the left.
      const previous = out[out.length - 1] ?? "";
      if (/[A-Za-z0-9_$]/.test(previous)) {
        out += whole;
        index += whole.length;
        continue;
      }
      const column = colAbsolute
        ? colName
        : gridColumnName(
            Math.max(0, columnIndexFromName(colName) + colOffset),
          );
      const row = rowAbsolute
        ? rowName
        : String(Math.max(1, Number(rowName) + rowOffset));
      out += `${colAbsolute}${column}${rowAbsolute}${row}`;
      index += whole.length;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function columnIndexFromName(name: string): number {
  let value = 0;
  for (const char of name.toUpperCase()) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value - 1;
}

export interface GridConditionalContext {
  rows: readonly (readonly string[])[];
  /** Passed straight to `W12`'s evaluator so `Sheet2!B3` rules can work. */
  namedRanges?: Readonly<Record<string, string>>;
  workbook?: Readonly<Record<string, readonly (readonly string[])[]>>;
  sheetName?: string;
}

/**
 * Formula rules go through `W12`'s `evaluateGridCell` entry point rather than a
 * second parser, so a rule and a cell can never disagree about what `SUM` means.
 *
 * The translated formula is parked in one scratch row past the sheet so the
 * evaluator's own cycle guard and reference resolution apply unchanged. The
 * scratch grid is built once per pass, not once per cell.
 */
function createFormulaEvaluator(context: GridConditionalContext) {
  const scratchRow = context.rows.length;
  const scratch: (readonly string[])[] = [...context.rows, [""]];
  const formulaContext = {
    ...(context.namedRanges ? { namedRanges: context.namedRanges } : {}),
    ...(context.workbook ? { workbook: context.workbook } : {}),
    ...(context.sheetName ? { sheetName: context.sheetName } : {}),
  };
  return (formula: string, rowOffset: number, colOffset: number): boolean => {
    const source = formula.startsWith("=") ? formula : `=${formula}`;
    scratch[scratchRow] = [translateRuleFormula(source, rowOffset, colOffset)];
    const result = evaluateGridCell(scratch, scratchRow, 0, formulaContext);
    if (typeof result === "number") return result !== 0;
    const text = String(result).trim().toUpperCase();
    if (text === "TRUE") return true;
    if (text === "FALSE" || text === "") return false;
    // An error value is not a match; a rule must never paint on `#DIV/0!`.
    if (text.startsWith("#")) return false;
    const asNumber = Number(text);
    return Number.isFinite(asNumber) ? asNumber !== 0 : true;
  };
}

/* -------------------------------- the index ------------------------------ */

interface RangeStatistics {
  min: number;
  max: number;
  /** Raw string → occurrence count, for duplicate / unique rules. */
  counts: Map<string, number>;
}

/** Rules are bucketed by row band so a cell only sees rules that reach it. */
const ROW_BAND = 64;

export interface GridConditionalIndexMetrics {
  /** How many range-statistics scans ran. The incremental claim rests on this. */
  statisticsComputed: number;
  /** How many (cell, rule) pairs were examined. */
  rulesExamined: number;
}

export interface GridConditionalIndex {
  readonly rules: readonly GridConditionalRule[];
  readonly bands: ReadonlyMap<number, readonly number[]>;
  readonly statistics: Map<string, RangeStatistics>;
  readonly metrics: GridConditionalIndexMetrics;
}

function sortRules(rules: readonly GridConditionalRule[]): GridConditionalRule[] {
  return rules
    .map((rule, position) => ({ rule, position }))
    .sort((left, right) =>
      left.rule.priority === right.rule.priority
        ? left.position - right.position
        : left.rule.priority - right.rule.priority,
    )
    .map((entry) => entry.rule);
}

export function buildConditionalIndex(
  rules: readonly GridConditionalRule[],
): GridConditionalIndex {
  const ordered = sortRules(rules);
  const bands = new Map<number, number[]>();
  ordered.forEach((rule, position) => {
    const first = Math.floor(rule.range.firstRow / ROW_BAND);
    const last = Math.floor(rule.range.lastRow / ROW_BAND);
    for (let band = first; band <= last; band += 1) {
      const bucket = bands.get(band);
      if (bucket) bucket.push(position);
      else bands.set(band, [position]);
    }
  });
  return {
    rules: ordered,
    bands,
    statistics: new Map(),
    metrics: { statisticsComputed: 0, rulesExamined: 0 },
  };
}

/**
 * Drop only the memoised statistics whose range the edit actually touched.
 *
 * This is the incremental half of A-1: a one-cell edit in a 5,000-row sheet
 * used to force every colour scale to rescan its whole range.
 */
export function invalidateConditionalIndex(
  index: GridConditionalIndex,
  changed: readonly GridRange[],
): GridRange[] {
  const affected: GridRange[] = [];
  for (const rule of index.rules) {
    if (!changed.some((range) => rangesIntersect(rule.range, range))) continue;
    index.statistics.delete(rule.id);
    affected.push(rule.range);
  }
  return affected;
}

/** Convenience wrapper for the common "one cell changed" case. */
export function invalidateConditionalCell(
  index: GridConditionalIndex,
  row: number,
  col: number,
): GridRange[] {
  return invalidateConditionalIndex(index, [
    { firstRow: row, lastRow: row, firstCol: col, lastCol: col },
  ]);
}

function rangeStatistics(
  index: GridConditionalIndex,
  rule: GridConditionalRule,
  context: GridConditionalContext,
): RangeStatistics {
  const cached = index.statistics.get(rule.id);
  if (cached) return cached;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const counts = new Map<string, number>();
  for (let row = rule.range.firstRow; row <= rule.range.lastRow; row += 1) {
    for (let col = rule.range.firstCol; col <= rule.range.lastCol; col += 1) {
      const raw = context.rows[row]?.[col] ?? "";
      const value = raw.startsWith("=")
        ? evaluateGridCell(context.rows, row, col)
        : raw;
      const asNumber = numeric(value);
      if (asNumber !== null) {
        if (asNumber < min) min = asNumber;
        if (asNumber > max) max = asNumber;
      }
      const key = String(value);
      if (key !== "") counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const statistics: RangeStatistics = {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
    counts,
  };
  index.statistics.set(rule.id, statistics);
  index.metrics.statisticsComputed += 1;
  return statistics;
}

function needsStatistics(rule: GridConditionalRule): boolean {
  return (
    rule.kind === "data-bar" ||
    rule.kind === "color-scale" ||
    rule.kind === "icon-set" ||
    rule.kind === "uniqueness"
  );
}

/* ------------------------------- evaluation ------------------------------ */

function comparisonHolds(
  operator: GridComparisonOperator,
  value: string | number,
  first: string,
  second: string | undefined,
): boolean {
  const left = numeric(value);
  const right = numeric(first);
  if (operator === "between" || operator === "not-between") {
    const upper = numeric(second ?? "");
    if (left === null || right === null || upper === null) return false;
    const low = Math.min(right, upper);
    const high = Math.max(right, upper);
    const inside = left >= low && left <= high;
    return operator === "between" ? inside : !inside;
  }
  if (operator === "equal" || operator === "not-equal") {
    const equal =
      left !== null && right !== null ? left === right : String(value) === first;
    return operator === "equal" ? equal : !equal;
  }
  if (left === null || right === null) return false;
  switch (operator) {
    case "greater-than":
      return left > right;
    case "less-than":
      return left < right;
    case "greater-equal":
      return left >= right;
    case "less-equal":
      return left <= right;
    default:
      return false;
  }
}

function textHolds(
  operator: GridTextOperator,
  value: string | number,
  needle: string,
): boolean {
  const haystack = String(value).toLocaleLowerCase();
  const target = needle.toLocaleLowerCase();
  switch (operator) {
    case "contains":
      return haystack.includes(target);
    case "not-contains":
      return !haystack.includes(target);
    case "begins-with":
      return haystack.startsWith(target);
    case "ends-with":
      return haystack.endsWith(target);
    default:
      return false;
  }
}

function bucketOf(fraction: number, buckets: number): number {
  return Math.min(buckets - 1, Math.floor(clamp01(fraction) * buckets));
}

function applyStyle(
  paint: GridConditionalPaint,
  style: GridConditionalStyle,
): GridConditionalPaint {
  return {
    ...paint,
    ...(style.color ? { color: style.color } : {}),
    ...(style.background ? { background: style.background } : {}),
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.strike ? { strike: true } : {}),
  };
}

/**
 * Resolve one cell.
 *
 * Pure in the current value, which is what keeps automatic recalculation
 * working: nothing is cached per cell, only the range-wide statistics that
 * cannot be derived from a single cell.
 */
export function resolveConditionalStyle(
  index: GridConditionalIndex,
  context: GridConditionalContext,
  row: number,
  col: number,
  value: string | number,
  evaluateFormula?: (formula: string, rowOffset: number, colOffset: number) => boolean,
): GridConditionalPaint {
  const bucket = index.bands.get(Math.floor(row / ROW_BAND));
  if (!bucket || bucket.length === 0) return EMPTY_PAINT;
  let paint: GridConditionalPaint = EMPTY_PAINT;
  const applied: string[] = [];
  let formulaEvaluator = evaluateFormula;

  for (const position of bucket) {
    const rule = index.rules[position];
    if (rule.disabled) continue;
    if (!rangeContainsCell(rule.range, row, col)) continue;
    index.metrics.rulesExamined += 1;

    let matched = false;
    let next = paint;

    switch (rule.kind) {
      case "cell-value":
        matched = comparisonHolds(rule.operator, value, rule.value, rule.value2);
        if (matched) next = applyStyle(paint, rule.style);
        break;
      case "text":
        matched = textHolds(rule.operator, value, rule.value);
        if (matched) next = applyStyle(paint, rule.style);
        break;
      case "blank": {
        const blank = String(value).trim() === "";
        matched = rule.operator === "blank" ? blank : !blank;
        if (matched) next = applyStyle(paint, rule.style);
        break;
      }
      case "uniqueness": {
        const statistics = rangeStatistics(index, rule, context);
        const occurrences = statistics.counts.get(String(value)) ?? 0;
        const duplicated = occurrences > 1;
        matched =
          String(value).trim() !== "" &&
          (rule.operator === "duplicate" ? duplicated : !duplicated);
        if (matched) next = applyStyle(paint, rule.style);
        break;
      }
      case "formula": {
        if (!formulaEvaluator) formulaEvaluator = createFormulaEvaluator(context);
        matched = formulaEvaluator(
          rule.formula,
          row - rule.range.firstRow,
          col - rule.range.firstCol,
        );
        if (matched) next = applyStyle(paint, rule.style);
        break;
      }
      case "data-bar": {
        const asNumber = numeric(value);
        if (asNumber === null) break;
        const statistics = rangeStatistics(index, rule, context);
        const span = statistics.max - statistics.min;
        const fraction = span === 0 ? (asNumber === 0 ? 0 : 1) : (asNumber - statistics.min) / span;
        matched = true;
        next = {
          ...paint,
          dataBar: {
            fraction: clamp01(fraction),
            color: asNumber < 0 ? (rule.negativeColor ?? rule.color) : rule.color,
            negative: asNumber < 0,
          },
        };
        break;
      }
      case "color-scale": {
        const asNumber = numeric(value);
        if (asNumber === null) break;
        const statistics = rangeStatistics(index, rule, context);
        const span = statistics.max - statistics.min;
        const fraction = span === 0 ? 0.5 : (asNumber - statistics.min) / span;
        const background = interpolateColorScale(rule.colors, fraction);
        if (!background) break;
        matched = true;
        next = { ...paint, background };
        break;
      }
      case "icon-set": {
        const asNumber = numeric(value);
        if (asNumber === null) break;
        const statistics = rangeStatistics(index, rule, context);
        const span = statistics.max - statistics.min;
        const fraction = span === 0 ? 1 : (asNumber - statistics.min) / span;
        const icons = ICON_SETS[rule.set];
        const slot = bucketOf(fraction, icons.length);
        const chosen = rule.reverse ? icons[icons.length - 1 - slot] : icons[slot];
        matched = true;
        next = {
          ...paint,
          icon: chosen,
          ...(rule.set === "traffic"
            ? {
                color:
                  TRAFFIC_COLORS[rule.reverse ? icons.length - 1 - slot : slot],
              }
            : {}),
        };
        break;
      }
      default:
        break;
    }

    if (!matched) continue;
    applied.push(rule.id);
    paint = next;
    if (rule.stopIfTrue) {
      return { ...paint, appliedRuleIds: applied, stopped: true };
    }
  }

  if (applied.length === 0) return EMPTY_PAINT;
  return { ...paint, appliedRuleIds: applied, stopped: false };
}

/** One shared formula evaluator for a whole repaint pass. */
export function createConditionalPass(context: GridConditionalContext) {
  const evaluateFormula = createFormulaEvaluator(context);
  return (
    index: GridConditionalIndex,
    row: number,
    col: number,
    value: string | number,
  ) => resolveConditionalStyle(index, context, row, col, value, evaluateFormula);
}

/* ---------------------------- rule management ---------------------------- */

/**
 * The four operations the old surface could not do. Each returns a new array;
 * the caller owns persistence, so an undo stack keeps working.
 */
export function listConditionalRules(
  rules: readonly GridConditionalRule[],
  range?: GridRange,
): GridConditionalRule[] {
  const ordered = sortRules(rules);
  return range
    ? ordered.filter((rule) => rangesIntersect(rule.range, range))
    : ordered;
}

export function updateConditionalRule(
  rules: readonly GridConditionalRule[],
  id: string,
  patch: Partial<GridConditionalRule>,
): GridConditionalRule[] {
  return rules.map((rule) =>
    rule.id === id ? ({ ...rule, ...patch, id: rule.id } as GridConditionalRule) : rule,
  );
}

export function deleteConditionalRule(
  rules: readonly GridConditionalRule[],
  id: string,
): GridConditionalRule[] {
  return rules.filter((rule) => rule.id !== id);
}

/**
 * Move a rule one slot up or down in evaluation order.
 *
 * Priorities are rewritten densely from 1 afterwards, so repeated reordering
 * cannot drift into ties that would silently fall back to array position.
 */
export function reorderConditionalRule(
  rules: readonly GridConditionalRule[],
  id: string,
  direction: "up" | "down",
): GridConditionalRule[] {
  const ordered = sortRules(rules);
  const at = ordered.findIndex((rule) => rule.id === id);
  if (at < 0) return ordered;
  const target = direction === "up" ? at - 1 : at + 1;
  if (target < 0 || target >= ordered.length) return ordered;
  const moved = [...ordered];
  [moved[at], moved[target]] = [moved[target], moved[at]];
  return moved.map((rule, position) => ({ ...rule, priority: position + 1 }));
}

export function nextConditionalPriority(
  rules: readonly GridConditionalRule[],
): number {
  return rules.reduce((max, rule) => Math.max(max, rule.priority), 0) + 1;
}

/* ------------------------------ persistence ------------------------------ */

const COLOR = /^#[0-9a-f]{6}$/i;
const RULE_KINDS: readonly GridConditionalRuleKind[] = [
  "cell-value",
  "text",
  "blank",
  "uniqueness",
  "formula",
  "data-bar",
  "color-scale",
  "icon-set",
];

function normalizeStyle(value: unknown): GridConditionalStyle {
  const source = (value ?? {}) as Record<string, unknown>;
  const color = String(source.color ?? "");
  const background = String(source.background ?? "");
  return {
    ...(COLOR.test(color) ? { color } : {}),
    ...(COLOR.test(background) ? { background } : {}),
    ...(source.bold === true ? { bold: true } : {}),
    ...(source.italic === true ? { italic: true } : {}),
    ...(source.strike === true ? { strike: true } : {}),
  };
}

function normalizeRange(value: unknown, maxRows: number, maxCols: number): GridRange | null {
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
 * Unknown kinds are dropped rather than coerced: a rule nobody can evaluate is
 * worse than a missing rule, because it would paint nothing while still
 * claiming a slot in the manager.
 */
export function normalizeConditionalRules(
  value: unknown,
  maxRows = 10_000,
  maxCols = 256,
): GridConditionalRule[] {
  const used = new Set<string>();
  const out: GridConditionalRule[] = [];
  for (const [position, entry] of (Array.isArray(value) ? value.slice(0, 500) : []).entries()) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const kind = String(source.kind ?? "") as GridConditionalRuleKind;
    if (!RULE_KINDS.includes(kind)) continue;
    const range = normalizeRange(source.range, maxRows, maxCols);
    if (!range) continue;
    let id = String(source.id ?? "")
      .replace(/[^a-z0-9_.:-]/gi, "-")
      .slice(0, 80);
    if (!id || used.has(id)) id = `rule-${position + 1}`;
    used.add(id);
    const common = {
      id,
      range,
      priority: Number.isFinite(Number(source.priority))
        ? Math.max(1, Math.floor(Number(source.priority)))
        : position + 1,
      ...(source.stopIfTrue === true ? { stopIfTrue: true } : {}),
      ...(source.disabled === true ? { disabled: true } : {}),
    };
    const style = normalizeStyle(source.style);
    const text = String(source.value ?? "").slice(0, 240);

    if (kind === "cell-value") {
      const operator = String(source.operator) as GridComparisonOperator;
      const allowed: readonly GridComparisonOperator[] = [
        "greater-than", "less-than", "greater-equal", "less-equal",
        "equal", "not-equal", "between", "not-between",
      ];
      if (!allowed.includes(operator)) continue;
      out.push({
        ...common,
        kind,
        operator,
        value: text,
        ...(source.value2 !== undefined
          ? { value2: String(source.value2).slice(0, 240) }
          : {}),
        style,
      });
      continue;
    }
    if (kind === "text") {
      const operator = String(source.operator) as GridTextOperator;
      const allowed: readonly GridTextOperator[] = [
        "contains", "not-contains", "begins-with", "ends-with",
      ];
      if (!allowed.includes(operator)) continue;
      out.push({ ...common, kind, operator, value: text, style });
      continue;
    }
    if (kind === "blank") {
      const operator = String(source.operator) as GridBlankOperator;
      if (operator !== "blank" && operator !== "not-blank") continue;
      out.push({ ...common, kind, operator, style });
      continue;
    }
    if (kind === "uniqueness") {
      const operator = String(source.operator) as GridUniquenessOperator;
      if (operator !== "duplicate" && operator !== "unique") continue;
      out.push({ ...common, kind, operator, style });
      continue;
    }
    if (kind === "formula") {
      const formula = String(source.formula ?? "").slice(0, 500);
      if (!formula.trim()) continue;
      out.push({ ...common, kind, formula, style });
      continue;
    }
    if (kind === "data-bar") {
      const color = String(source.color ?? "");
      if (!COLOR.test(color)) continue;
      const negativeColor = String(source.negativeColor ?? "");
      out.push({
        ...common,
        kind,
        color,
        ...(COLOR.test(negativeColor) ? { negativeColor } : {}),
        ...(source.showValue === false ? { showValue: false } : {}),
      });
      continue;
    }
    if (kind === "color-scale") {
      const colors = (Array.isArray(source.colors) ? source.colors : [])
        .map((entryColor) => String(entryColor))
        .filter((entryColor) => COLOR.test(entryColor))
        .slice(0, 3);
      if (colors.length < 2) continue;
      out.push({ ...common, kind, colors });
      continue;
    }
    const set = String(source.set ?? "") as GridIconSetName;
    if (!(set in ICON_SETS)) continue;
    out.push({
      ...common,
      kind: "icon-set",
      set,
      ...(source.reverse === true ? { reverse: true } : {}),
    });
  }
  return sortRules(out);
}

/**
 * Lift a stored five-operator rule into the richer shape. Existing documents
 * therefore keep working with no migration and no schema bump.
 */
export function fromLegacyConditionalFormat(
  legacy: GridConditionalFormat,
  priority: number,
): GridConditionalRule {
  const style: GridConditionalStyle = {
    ...(legacy.color ? { color: legacy.color } : {}),
    ...(legacy.background ? { background: legacy.background } : {}),
    ...(legacy.bold ? { bold: true } : {}),
  };
  if (legacy.operator === "contains") {
    return {
      id: legacy.id,
      range: legacy.range,
      priority,
      kind: "text",
      operator: "contains",
      value: legacy.value,
      style,
    };
  }
  return {
    id: legacy.id,
    range: legacy.range,
    priority,
    kind: "cell-value",
    operator: legacy.operator,
    value: legacy.value,
    style,
  };
}

/** Invalid-data circling and the toolbar both need a human-readable summary. */
export function describeConditionalRule(rule: GridConditionalRule): string {
  const address = `${gridColumnName(rule.range.firstCol)}${rule.range.firstRow + 1}:${gridColumnName(rule.range.lastCol)}${rule.range.lastRow + 1}`;
  const body = (() => {
    switch (rule.kind) {
      case "cell-value": {
        const labels: Record<GridComparisonOperator, string> = {
          "greater-than": "大于",
          "less-than": "小于",
          "greater-equal": "大于等于",
          "less-equal": "小于等于",
          equal: "等于",
          "not-equal": "不等于",
          between: "介于",
          "not-between": "不介于",
        };
        return rule.operator === "between" || rule.operator === "not-between"
          ? `${labels[rule.operator]} ${rule.value} 与 ${rule.value2 ?? ""}`
          : `${labels[rule.operator]} ${rule.value}`;
      }
      case "text": {
        const labels: Record<GridTextOperator, string> = {
          contains: "包含",
          "not-contains": "不包含",
          "begins-with": "开头为",
          "ends-with": "结尾为",
        };
        return `${labels[rule.operator]} ${rule.value}`;
      }
      case "blank":
        return rule.operator === "blank" ? "为空" : "非空";
      case "uniqueness":
        return rule.operator === "duplicate" ? "重复值" : "唯一值";
      case "formula":
        return `公式 ${rule.formula}`;
      case "data-bar":
        return "数据条";
      case "color-scale":
        return `色阶（${rule.colors.length} 色）`;
      case "icon-set":
        return "图标集";
      default:
        return "规则";
    }
  })();
  return `${address} · ${body}${rule.stopIfTrue ? " · 停止" : ""}`;
}

export const __conditionalFormatInternals = {
  ROW_BAND,
  ICON_SETS,
  columnIndexFromName,
  sortRules,
};
