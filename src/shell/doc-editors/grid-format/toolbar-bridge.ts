/**
 * The decisions the grid toolbar makes between a reader's click and the three
 * engines.
 *
 * They live here instead of inside `GridContextToolbar.tsx` for one reason:
 * a React component that only renders a control list can be asserted on by
 * scanning its source, and a source scan cannot tell "the preset dropdown
 * picks the right pattern" from "the preset dropdown exists". Every function
 * below is pure, so `tests/grid-format-toolbar.test.mjs` can hold each one to
 * its behaviour and go red when the behaviour changes.
 */
import { gridColumnName } from "../grid-formula";
import type { GridConditionalFormat, GridRange } from "../grid-structure";
import {
  describeConditionalRule,
  fromLegacyConditionalFormat,
  type GridConditionalRule,
} from "./conditional-format";
import {
  describeValidationRule,
  findInvalidCells,
  type GridValidationBehavior,
  type GridValidationContext,
  type GridValidationKind,
  type GridValidationOperator,
  type GridValidationRule,
} from "./data-validation";
import {
  NUMBER_FORMAT_PRESETS,
  formatWithNumberFormat,
  isGeneralNumberFormat,
} from "./number-format";

export interface GridToolbarOption {
  value: string;
  label: string;
}

/** Excel refuses a `formatCode` past this; clamp before it reaches the file. */
export const NUMFMT_MAX_LENGTH = 255;

/**
 * Which preset the pattern box is currently showing.
 *
 * `custom` is a real answer, not a fallback failure: a hand-typed pattern must
 * not silently re-label itself as the nearest preset.
 */
export function numberFormatPresetId(pattern: string): string {
  const trimmed = (pattern || "").trim();
  if (!trimmed) return "general";
  const preset = NUMBER_FORMAT_PRESETS.find(
    (entry) => entry.pattern === trimmed,
  );
  if (preset) return preset.id;
  return isGeneralNumberFormat(trimmed) ? "general" : "custom";
}

/** The pattern a preset id selects; `general` means "clear the pattern". */
export function numberFormatPatternForPreset(id: string): string | null {
  const preset = NUMBER_FORMAT_PRESETS.find((entry) => entry.id === id);
  if (!preset) return null;
  return preset.id === "general" ? "" : preset.pattern;
}

/**
 * What the pattern will do to this cell, rendered by the same engine the
 * export chain uses — so a wrong pattern is visible before it ships rather
 * than after the file lands in Excel.
 *
 * A pattern the parser cannot make sense of yields an empty preview, never a
 * thrown error: the reader is mid-typing and half a pattern is not a fault.
 */
export function numberFormatPreview(value: string, pattern: string): string {
  const trimmed = (pattern || "").trim();
  if (!trimmed) return "";
  const sample = value || "1234.5";
  try {
    return formatWithNumberFormat(sample, trimmed).text;
  } catch {
    return "";
  }
}

/**
 * Every stored rule on the sheet, lifted into the engine's shape so it can be
 * described. Listing is the half of a rule manager the five-operator store can
 * back; editing one in place needs a write seam `use-grid-editor` does not
 * expose (`signals/W13-request.md` R4).
 */
export function conditionalRulesFromSheet(
  legacy: readonly GridConditionalFormat[],
): GridConditionalRule[] {
  return legacy.map((rule, index) => fromLegacyConditionalFormat(rule, index + 1));
}

/** The rule picker's options, newest rule last, with a "new rule" head entry. */
export function conditionalRuleOptions(
  rules: readonly GridConditionalRule[],
  newRuleLabel: string,
): GridToolbarOption[] {
  return [
    {
      value: "",
      label: rules.length ? `${newRuleLabel} · ${rules.length}` : newRuleLabel,
    },
    ...rules.map((rule) => ({
      value: rule.id,
      label: describeConditionalRule(rule),
    })),
  ];
}

export interface GridValidationDraft {
  kind: GridValidationKind;
  operator: GridValidationOperator;
  value: string;
  value2: string;
  behavior: GridValidationBehavior;
}

/** `between` / `not-between` are the only shapes that read a second bound. */
export function validationNeedsSecondBound(
  draft: GridValidationDraft,
): boolean {
  if (draft.kind === "list" || draft.kind === "custom") return false;
  return draft.operator === "between" || draft.operator === "not-between";
}

/**
 * The rule the toolbar's fields currently describe, scoped to the selection.
 *
 * Returns null rather than a half-built rule when the value box is empty: an
 * unfinished rule must not be run against the sheet and reported as "all
 * clear".
 */
export function validationRuleFromDraft(
  draft: GridValidationDraft,
  range: GridRange,
  id = "toolbar-check",
): GridValidationRule | null {
  const value = draft.value.trim();
  if (!value) return null;
  const base = { id, range, behavior: draft.behavior };
  switch (draft.kind) {
    case "list":
      return { ...base, kind: "list", source: draft.value };
    case "custom":
      return { ...base, kind: "custom", formula: draft.value };
    case "date":
      return {
        ...base,
        kind: "date",
        operator: draft.operator,
        value: draft.value,
        value2: draft.value2,
      };
    default:
      return {
        ...base,
        kind: draft.kind,
        operator: draft.operator,
        value: draft.value,
        value2: draft.value2,
      };
  }
}

export interface GridValidationCheck {
  /** Cells the stage should circle. */
  invalid: ReturnType<typeof findInvalidCells>;
  /** One line the reader can act on: how many, where the first one is, why. */
  report: string;
}

/**
 * Run the drafted rule over its range and say what is wrong, in words.
 *
 * The count is the point. "Some cells are invalid" is not actionable; "3 ·
 * B7 · 必须介于 1 与 100" sends the reader to a cell.
 */
export function runValidationCheck(
  rule: GridValidationRule | null,
  context: GridValidationContext,
  allClearLabel: string,
): GridValidationCheck {
  if (!rule) return { invalid: [], report: "" };
  const invalid = findInvalidCells([rule], context);
  if (!invalid.length) return { invalid, report: allClearLabel };
  const first = invalid[0];
  return {
    invalid,
    report: `${invalid.length} · ${gridColumnName(first.col)}${
      first.row + 1
    } · ${first.message}`,
  };
}

/** The drafted rule in words, shown before the reader runs the check. */
export function describeValidationDraft(
  rule: GridValidationRule | null,
): string {
  return rule ? describeValidationRule(rule) : "";
}
