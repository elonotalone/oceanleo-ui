/**
 * SpreadsheetML round-trip for the three things `W13` added: number-format
 * strings, conditional-format rules and data validations.
 *
 * ## Why this is a separate module from `GridWorkbookExport`
 *
 * The emit side has to be provable without building a whole workbook. These are
 * pure string functions with a matching parser, so "export then import returns
 * the same rules" is a unit test rather than a zip round-trip, and the byte
 * gates in `runGridEmitPipeline` never enter into it.
 *
 * ## Two hard constraints, both learned from the format rather than chosen
 *
 * 1. **Element order in `CT_Worksheet` is mandatory.** `conditionalFormatting`
 *    comes after `sheetData` and before `dataValidations`; get it wrong and
 *    Excel opens the file with a repair prompt instead of the data. The
 *    functions here return fragments and say where they go, and
 *    `worksheetXml()` splices them in that order.
 * 2. **No rules must cost no bytes.** `oceanleo.grid.v1` has a byte floor and
 *    ceiling (`GRID_XLSX_MIN/MAX_BYTES`) and an existing `grid-hollow` verdict
 *    keyed to it. Every builder here returns `""` for an empty rule list — not
 *    an empty `<conditionalFormatting/>` element — so a workbook without rules
 *    is byte-identical to one built before this module existed.
 *
 * ## What "degraded" means here
 *
 * Some of our rule model has no home in base SpreadsheetML: a disabled rule, a
 * data bar's negative colour, case-insensitive list matching. The task forbids
 * dropping those silently, so every one is reported in `degradations` with the
 * rule id and a sentence naming what will not survive. The caller shows them;
 * this module never decides for the user.
 */

import type {
  GridConditionalRule,
  GridConditionalStyle,
  GridIconSetName,
} from "./conditional-format";
import type {
  GridValidationBehavior,
  GridValidationOperator,
  GridValidationRule,
  GridValidationRuleKind,
} from "./data-validation";
import type { GridRange } from "../grid-structure";

/* --------------------------------- shared -------------------------------- */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function columnName(index: number): string {
  let value = index + 1;
  let out = "";
  while (value > 0) {
    value -= 1;
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26);
  }
  return out;
}

function columnIndex(name: string): number {
  let value = 0;
  for (const char of name.toUpperCase()) value = value * 26 + (char.charCodeAt(0) - 64);
  return value - 1;
}

/** `{0,9,0,1}` → `A1:B10`; a single cell collapses to `A1`, as Excel writes it. */
export function rangeToSqref(range: GridRange): string {
  const first = `${columnName(range.firstCol)}${range.firstRow + 1}`;
  if (range.firstRow === range.lastRow && range.firstCol === range.lastCol) {
    return first;
  }
  return `${first}:${columnName(range.lastCol)}${range.lastRow + 1}`;
}

const SQREF = /^([A-Za-z]{1,3})(\d{1,7})(?::([A-Za-z]{1,3})(\d{1,7}))?$/;

export function sqrefToRange(sqref: string): GridRange | null {
  // A multi-area sqref (`A1:A9 C1:C9`) is legal OOXML; we take the first area
  // and let the caller decide, because our rule model holds one rectangle.
  const first = sqref.trim().split(/\s+/)[0] ?? "";
  const match = SQREF.exec(first.replace(/\$/g, ""));
  if (!match) return null;
  const [, firstCol, firstRow, lastCol, lastRow] = match;
  const top = Number(firstRow) - 1;
  const left = columnIndex(firstCol);
  const bottom = lastRow === undefined ? top : Number(lastRow) - 1;
  const right = lastCol === undefined ? left : columnIndex(lastCol);
  return {
    firstRow: Math.min(top, bottom),
    lastRow: Math.max(top, bottom),
    firstCol: Math.min(left, right),
    lastCol: Math.max(left, right),
  };
}

export interface GridExportDegradation {
  ruleId: string;
  /** One sentence naming exactly what will not survive the trip. */
  message: string;
}

/* ---------------------------------- dxfs --------------------------------- */

/**
 * Conditional-format colours live in `<dxfs>` in `styles.xml`, addressed from
 * the rule by index. Identical styles are pooled so ten rules painting the same
 * red cost one record.
 */
export class GridDxfTable {
  private readonly keys: string[] = [];

  intern(style: GridConditionalStyle): number {
    const key = dxfXml(style);
    const found = this.keys.indexOf(key);
    if (found >= 0) return found;
    this.keys.push(key);
    return this.keys.length - 1;
  }

  get length(): number {
    return this.keys.length;
  }

  /** `""` when nothing was interned, so `styles.xml` keeps its old bytes. */
  toXml(): string {
    if (!this.keys.length) return "";
    return `<dxfs count="${this.keys.length}">${this.keys.join("")}</dxfs>`;
  }

  entries(): readonly string[] {
    return [...this.keys];
  }
}

function argb(color: string | undefined): string | null {
  const hex = String(color ?? "").replace("#", "");
  return /^[0-9a-f]{6}$/i.test(hex) ? `FF${hex.toUpperCase()}` : null;
}

function dxfXml(style: GridConditionalStyle): string {
  const font: string[] = [];
  if (style.bold) font.push("<b/>");
  if (style.italic) font.push("<i/>");
  if (style.strike) font.push("<strike/>");
  const color = argb(style.color);
  if (color) font.push(`<color rgb="${color}"/>`);
  const background = argb(style.background);
  // `bgColor` is the one that paints in a dxf fill; `fgColor` is the pattern
  // foreground and shows nothing for a solid fill. Swapping them is the classic
  // way to emit a rule that Excel accepts and renders as no colour at all.
  const fill = background
    ? `<fill><patternFill><bgColor rgb="${background}"/></patternFill></fill>`
    : "";
  return `<dxf>${font.length ? `<font>${font.join("")}</font>` : ""}${fill}</dxf>`;
}

/** Read a `styles.xml` `<dxfs>` block back into styles, for the import half. */
export function parseDxfs(xml: string): GridConditionalStyle[] {
  const block = /<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>/.exec(xml);
  if (!block) return [];
  const out: GridConditionalStyle[] = [];
  for (const entry of block[1].matchAll(/<dxf>([\s\S]*?)<\/dxf>/g)) {
    const body = entry[1];
    const style: GridConditionalStyle = {};
    if (/<b\/>/.test(body)) style.bold = true;
    if (/<i\/>/.test(body)) style.italic = true;
    if (/<strike\/>/.test(body)) style.strike = true;
    const fontColor = /<font>[\s\S]*?<color rgb="FF([0-9A-Fa-f]{6})"\/>[\s\S]*?<\/font>/.exec(body);
    if (fontColor) style.color = `#${fontColor[1].toLowerCase()}`;
    const fillColor = /<bgColor rgb="FF([0-9A-Fa-f]{6})"\/>/.exec(body);
    if (fillColor) style.background = `#${fillColor[1].toLowerCase()}`;
    out.push(style);
  }
  return out;
}

/* -------------------------- conditional formatting ----------------------- */

const CF_OPERATOR: Record<string, string> = {
  "greater-than": "greaterThan",
  "less-than": "lessThan",
  "greater-equal": "greaterThanOrEqual",
  "less-equal": "lessThanOrEqual",
  equal: "equal",
  "not-equal": "notEqual",
  between: "between",
  "not-between": "notBetween",
};

const CF_OPERATOR_BACK: Record<string, string> = Object.fromEntries(
  Object.entries(CF_OPERATOR).map(([ours, theirs]) => [theirs, ours]),
);

const CF_TEXT_TYPE: Record<string, string> = {
  contains: "containsText",
  "not-contains": "notContainsText",
  "begins-with": "beginsWith",
  "ends-with": "endsWith",
};

const CF_TEXT_TYPE_BACK: Record<string, string> = Object.fromEntries(
  Object.entries(CF_TEXT_TYPE).map(([ours, theirs]) => [theirs, ours]),
);

/**
 * Icon sets we can name in the base namespace.
 *
 * `triangles` has no base-namespace equivalent — Excel's 3Triangles lives in
 * the `x14` extension block — so it is approximated by arrows and reported.
 * Emitting an unknown `iconSet` value is what produces a repair prompt.
 */
const ICON_SET_XLSX: Record<GridIconSetName, string> = {
  arrows: "3Arrows",
  traffic: "3TrafficLights1",
  flags: "3Flags",
  triangles: "3Arrows",
};

const ICON_SET_BACK: Record<string, GridIconSetName> = {
  "3Arrows": "arrows",
  "3TrafficLights1": "traffic",
  "3Flags": "flags",
};

/** A literal in a `<formula>` is quoted if it is not already a number. */
function cfLiteral(value: string): string {
  const text = value.trim();
  if (text === "") return '""';
  return Number.isFinite(Number(text)) ? escapeXml(text) : `"${escapeXml(text)}"`;
}

function unquote(value: string): string {
  const text = unescapeXml(value).trim();
  return text.startsWith('"') && text.endsWith('"') && text.length >= 2
    ? text.slice(1, -1)
    : text;
}

function firstCellRef(range: GridRange): string {
  return `${columnName(range.firstCol)}${range.firstRow + 1}`;
}

export interface GridConditionalXlsx {
  /** Fragment for straight after `</sheetData>`; `""` when there are no rules. */
  xml: string;
  degradations: readonly GridExportDegradation[];
}

/**
 * Emit `<conditionalFormatting>` blocks, one per rule.
 *
 * One block per rule rather than one per sqref: our priorities are global to
 * the sheet and Excel honours `priority` across blocks, so grouping would only
 * risk reordering rules that deliberately overlap.
 */
export function buildConditionalFormattingXml(
  rules: readonly GridConditionalRule[],
  dxfs: GridDxfTable,
): GridConditionalXlsx {
  const degradations: GridExportDegradation[] = [];
  const blocks: string[] = [];

  for (const rule of rules) {
    if (rule.disabled) {
      degradations.push({
        ruleId: rule.id,
        message: "已停用的规则不写入 xlsx：SpreadsheetML 没有「停用」位，写进去就会立刻生效。",
      });
      continue;
    }
    const attrs: string[] = [];
    const stop = rule.stopIfTrue ? ' stopIfTrue="1"' : "";
    const priority = ` priority="${Math.max(1, Math.floor(rule.priority))}"`;
    const anchor = firstCellRef(rule.range);
    let body = "";

    if (rule.kind === "cell-value") {
      const formulas =
        rule.operator === "between" || rule.operator === "not-between"
          ? `<formula>${cfLiteral(rule.value)}</formula><formula>${cfLiteral(rule.value2 ?? rule.value)}</formula>`
          : `<formula>${cfLiteral(rule.value)}</formula>`;
      attrs.push(`type="cellIs"`, `operator="${CF_OPERATOR[rule.operator]}"`);
      attrs.push(`dxfId="${dxfs.intern(rule.style)}"`);
      body = formulas;
    } else if (rule.kind === "text") {
      const text = escapeXml(rule.value);
      attrs.push(`type="${CF_TEXT_TYPE[rule.operator]}"`, `text="${text}"`);
      attrs.push(`dxfId="${dxfs.intern(rule.style)}"`);
      // Excel writes both the `text` attribute and the equivalent formula; the
      // formula is what non-Excel readers evaluate.
      const search = `SEARCH("${text}",${anchor})`;
      body =
        rule.operator === "contains"
          ? `<formula>NOT(ISERROR(${search}))</formula>`
          : rule.operator === "not-contains"
            ? `<formula>ISERROR(${search})</formula>`
            : rule.operator === "begins-with"
              ? `<formula>LEFT(${anchor},${[...rule.value].length})="${text}"</formula>`
              : `<formula>RIGHT(${anchor},${[...rule.value].length})="${text}"</formula>`;
    } else if (rule.kind === "blank") {
      attrs.push(
        `type="${rule.operator === "blank" ? "containsBlanks" : "notContainsBlanks"}"`,
      );
      attrs.push(`dxfId="${dxfs.intern(rule.style)}"`);
      body = `<formula>LEN(TRIM(${anchor}))${rule.operator === "blank" ? "=0" : ">0"}</formula>`;
    } else if (rule.kind === "uniqueness") {
      attrs.push(
        `type="${rule.operator === "duplicate" ? "duplicateValues" : "uniqueValues"}"`,
      );
      attrs.push(`dxfId="${dxfs.intern(rule.style)}"`);
    } else if (rule.kind === "formula") {
      const source = rule.formula.startsWith("=") ? rule.formula.slice(1) : rule.formula;
      attrs.push(`type="expression"`, `dxfId="${dxfs.intern(rule.style)}"`);
      body = `<formula>${escapeXml(source)}</formula>`;
    } else if (rule.kind === "data-bar") {
      attrs.push(`type="dataBar"`);
      if (rule.negativeColor) {
        degradations.push({
          ruleId: rule.id,
          message:
            "数据条的负值颜色不写入：基础 SpreadsheetML 的 dataBar 没有负值颜色，它属于 x14 扩展。正值颜色照常保留。",
        });
      }
      body = `<dataBar${rule.showValue === false ? ' showValue="0"' : ""}><cfvo type="min"/><cfvo type="max"/><color rgb="${argb(rule.color) ?? "FF638EC6"}"/></dataBar>`;
    } else if (rule.kind === "color-scale") {
      attrs.push(`type="colorScale"`);
      const stops = rule.colors.length >= 3 ? ["min", "percentile", "max"] : ["min", "max"];
      const cfvo = stops
        .map((type) => (type === "percentile" ? `<cfvo type="percentile" val="50"/>` : `<cfvo type="${type}"/>`))
        .join("");
      const colors = rule.colors
        .slice(0, stops.length)
        .map((color) => `<color rgb="${argb(color) ?? "FFFFFFFF"}"/>`)
        .join("");
      body = `<colorScale>${cfvo}${colors}</colorScale>`;
    } else {
      attrs.push(`type="iconSet"`);
      if (rule.set === "triangles") {
        degradations.push({
          ruleId: rule.id,
          message:
            "三角图标集降级为箭头：基础 SpreadsheetML 只认 3Arrows / 3TrafficLights1 / 3Flags，三角属于 x14 扩展，写未知值会让 Excel 提示修复。",
        });
      }
      if (rule.reverse) {
        degradations.push({
          ruleId: rule.id,
          message: "图标集的「反转顺序」不写入：基础 iconSet 没有反转位，导入方会看到正序图标。",
        });
      }
      body = `<iconSet iconSet="${ICON_SET_XLSX[rule.set]}"><cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/></iconSet>`;
    }

    blocks.push(
      `<conditionalFormatting sqref="${rangeToSqref(rule.range)}"><cfRule ${attrs.join(" ")}${priority}${stop}>${body}</cfRule></conditionalFormatting>`,
    );
  }

  return { xml: blocks.join(""), degradations };
}

function attr(source: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(source);
  return match ? match[1] : null;
}

/**
 * Read `<conditionalFormatting>` blocks back into rules.
 *
 * `styles` is the parsed `<dxfs>` table; a rule whose `dxfId` is out of range
 * gets an empty style rather than being dropped, because losing the rule loses
 * more than losing its colour.
 */
export function parseConditionalFormattingXml(
  xml: string,
  styles: readonly GridConditionalStyle[] = [],
): GridConditionalRule[] {
  const out: GridConditionalRule[] = [];
  let counter = 0;
  for (const block of xml.matchAll(
    /<conditionalFormatting\b([^>]*)>([\s\S]*?)<\/conditionalFormatting>/g,
  )) {
    const sqref = attr(block[1], "sqref");
    const range = sqref ? sqrefToRange(sqref) : null;
    if (!range) continue;
    for (const entry of block[2].matchAll(
      /<cfRule\b([^>]*?)(?:\/>|>([\s\S]*?)<\/cfRule>)/g,
    )) {
      const head = entry[1];
      const body = entry[2] ?? "";
      const type = attr(head, "type");
      if (!type) continue;
      counter += 1;
      const priority = Number(attr(head, "priority") ?? counter) || counter;
      const stopIfTrue = attr(head, "stopIfTrue") === "1";
      const dxfId = Number(attr(head, "dxfId") ?? -1);
      const style: GridConditionalStyle =
        dxfId >= 0 && dxfId < styles.length ? { ...styles[dxfId] } : {};
      const id = `cf-${counter}`;
      const common = {
        id,
        range,
        priority,
        ...(stopIfTrue ? { stopIfTrue: true } : {}),
      };
      const formulas = [...body.matchAll(/<formula>([\s\S]*?)<\/formula>/g)].map(
        (found) => found[1],
      );

      if (type === "cellIs") {
        const operator = CF_OPERATOR_BACK[attr(head, "operator") ?? ""];
        if (!operator) continue;
        const isRange = operator === "between" || operator === "not-between";
        out.push({
          ...common,
          kind: "cell-value",
          operator: operator as GridConditionalRule extends { operator: infer T } ? T : never,
          value: unquote(formulas[0] ?? ""),
          ...(isRange ? { value2: unquote(formulas[1] ?? "") } : {}),
          style,
        } as GridConditionalRule);
        continue;
      }
      if (CF_TEXT_TYPE_BACK[type]) {
        out.push({
          ...common,
          kind: "text",
          operator: CF_TEXT_TYPE_BACK[type],
          value: unescapeXml(attr(head, "text") ?? ""),
          style,
        } as GridConditionalRule);
        continue;
      }
      if (type === "containsBlanks" || type === "notContainsBlanks") {
        out.push({
          ...common,
          kind: "blank",
          operator: type === "containsBlanks" ? "blank" : "not-blank",
          style,
        } as GridConditionalRule);
        continue;
      }
      if (type === "duplicateValues" || type === "uniqueValues") {
        out.push({
          ...common,
          kind: "uniqueness",
          operator: type === "duplicateValues" ? "duplicate" : "unique",
          style,
        } as GridConditionalRule);
        continue;
      }
      if (type === "expression") {
        const formula = unescapeXml(formulas[0] ?? "");
        if (!formula.trim()) continue;
        out.push({
          ...common,
          kind: "formula",
          formula: formula.startsWith("=") ? formula : `=${formula}`,
          style,
        } as GridConditionalRule);
        continue;
      }
      if (type === "dataBar") {
        const color = /<color rgb="FF([0-9A-Fa-f]{6})"\/>/.exec(body);
        out.push({
          ...common,
          kind: "data-bar",
          color: `#${(color?.[1] ?? "638EC6").toLowerCase()}`,
          ...(/showValue="0"/.test(body) ? { showValue: false } : {}),
        } as GridConditionalRule);
        continue;
      }
      if (type === "colorScale") {
        const colors = [...body.matchAll(/<color rgb="FF([0-9A-Fa-f]{6})"\/>/g)].map(
          (found) => `#${found[1].toLowerCase()}`,
        );
        if (colors.length < 2) continue;
        out.push({ ...common, kind: "color-scale", colors } as GridConditionalRule);
        continue;
      }
      if (type === "iconSet") {
        const set = ICON_SET_BACK[attr(body, "iconSet") ?? "3Arrows"] ?? "arrows";
        out.push({ ...common, kind: "icon-set", set } as GridConditionalRule);
      }
    }
  }
  return out;
}

/* ----------------------------- data validation --------------------------- */

const DV_TYPE: Record<GridValidationRuleKind, string> = {
  list: "list",
  whole: "whole",
  decimal: "decimal",
  date: "date",
  "text-length": "textLength",
  custom: "custom",
};

const DV_TYPE_BACK: Record<string, GridValidationRuleKind> = Object.fromEntries(
  Object.entries(DV_TYPE).map(([ours, theirs]) => [theirs, ours as GridValidationRuleKind]),
) as Record<string, GridValidationRuleKind>;

const DV_OPERATOR: Record<GridValidationOperator, string> = {
  between: "between",
  "not-between": "notBetween",
  equal: "equal",
  "not-equal": "notEqual",
  "greater-than": "greaterThan",
  "less-than": "lessThan",
  "greater-equal": "greaterThanOrEqual",
  "less-equal": "lessThanOrEqual",
};

const DV_OPERATOR_BACK: Record<string, GridValidationOperator> = Object.fromEntries(
  Object.entries(DV_OPERATOR).map(([ours, theirs]) => [theirs, ours as GridValidationOperator]),
) as Record<string, GridValidationOperator>;

/** `block` is Excel's `stop`; everything else is `warning`. */
function errorStyle(behavior: GridValidationBehavior | undefined): string {
  return behavior === "block" ? "stop" : "warning";
}

export interface GridValidationXlsx {
  /** Fragment for after `conditionalFormatting`; `""` when there are none. */
  xml: string;
  degradations: readonly GridExportDegradation[];
}

export function buildDataValidationsXml(
  rules: readonly GridValidationRule[],
): GridValidationXlsx {
  const degradations: GridExportDegradation[] = [];
  const entries: string[] = [];

  for (const rule of rules) {
    const attrs: string[] = [`type="${DV_TYPE[rule.kind]}"`];
    let body = "";

    if (rule.kind === "list") {
      const source = rule.source.trim();
      if (source.startsWith("=")) {
        body = `<formula1>${escapeXml(source.slice(1))}</formula1>`;
      } else {
        // A literal list is one quoted, comma-joined string in `formula1`.
        // A member containing a comma cannot be expressed — Excel has no
        // escape for it — so it is reported rather than silently split.
        const members = source.split(",").map((entry) => entry.trim()).filter(Boolean);
        body = `<formula1>${escapeXml(`"${members.join(",")}"`)}</formula1>`;
      }
      if (rule.ignoreCase) {
        degradations.push({
          ruleId: rule.id,
          message: "列表的「忽略大小写」不写入：SpreadsheetML 的 list 校验没有大小写选项，导入方会按精确匹配。",
        });
      }
      if (rule.showDropdown === false) attrs.push(`showDropDown="1"`);
    } else if (rule.kind === "custom") {
      const source = rule.formula.startsWith("=") ? rule.formula.slice(1) : rule.formula;
      body = `<formula1>${escapeXml(source)}</formula1>`;
    } else {
      attrs.push(`operator="${DV_OPERATOR[rule.operator]}"`);
      body = `<formula1>${escapeXml(rule.value)}</formula1>`;
      if (rule.operator === "between" || rule.operator === "not-between") {
        body += `<formula2>${escapeXml(rule.value2 ?? rule.value)}</formula2>`;
      }
    }

    attrs.push(`allowBlank="${rule.allowBlank === false ? 0 : 1}"`);
    attrs.push(`showInputMessage="${rule.prompt ? 1 : 0}"`);
    attrs.push(`showErrorMessage="1"`);
    attrs.push(`errorStyle="${errorStyle(rule.behavior)}"`);
    if (rule.prompt) attrs.push(`prompt="${escapeXml(rule.prompt)}"`);
    if (rule.error) attrs.push(`error="${escapeXml(rule.error)}"`);
    attrs.push(`sqref="${rangeToSqref(rule.range)}"`);
    entries.push(`<dataValidation ${attrs.join(" ")}>${body}</dataValidation>`);
  }

  if (!entries.length) return { xml: "", degradations };
  return {
    xml: `<dataValidations count="${entries.length}">${entries.join("")}</dataValidations>`,
    degradations,
  };
}

export function parseDataValidationsXml(xml: string): GridValidationRule[] {
  const out: GridValidationRule[] = [];
  let counter = 0;
  for (const entry of xml.matchAll(
    /<dataValidation\b([^>]*?)(?:\/>|>([\s\S]*?)<\/dataValidation>)/g,
  )) {
    const head = entry[1];
    const body = entry[2] ?? "";
    const kind = DV_TYPE_BACK[attr(head, "type") ?? ""];
    if (!kind) continue;
    const sqref = attr(head, "sqref");
    const range = sqref ? sqrefToRange(sqref) : null;
    if (!range) continue;
    counter += 1;

    const formula1 = unescapeXml(
      /<formula1>([\s\S]*?)<\/formula1>/.exec(body)?.[1] ?? "",
    );
    const formula2 = unescapeXml(
      /<formula2>([\s\S]*?)<\/formula2>/.exec(body)?.[1] ?? "",
    );
    const prompt = attr(head, "prompt");
    const error = attr(head, "error");
    const common = {
      id: `dv-${counter}`,
      range,
      ...(attr(head, "errorStyle") === "stop" ? { behavior: "block" as const } : {}),
      ...(attr(head, "allowBlank") === "0" ? { allowBlank: false } : {}),
      ...(prompt ? { prompt: unescapeXml(prompt) } : {}),
      ...(error ? { error: unescapeXml(error) } : {}),
    };

    if (kind === "list") {
      const trimmed = formula1.trim();
      const literal =
        trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2;
      const source = literal ? trimmed.slice(1, -1) : `=${trimmed}`;
      if (!source.replace(/^=/, "").trim()) continue;
      out.push({
        ...common,
        kind,
        source,
        ...(attr(head, "showDropDown") === "1" ? { showDropdown: false } : {}),
      });
      continue;
    }
    if (kind === "custom") {
      if (!formula1.trim()) continue;
      out.push({
        ...common,
        kind,
        formula: formula1.startsWith("=") ? formula1 : `=${formula1}`,
      });
      continue;
    }
    const operator = DV_OPERATOR_BACK[attr(head, "operator") ?? "between"];
    if (!operator || !formula1.trim()) continue;
    const isRange = operator === "between" || operator === "not-between";
    out.push({
      ...common,
      kind,
      operator,
      value: formula1,
      ...(isRange && formula2.trim() ? { value2: formula2 } : {}),
    });
  }
  return out;
}

/* --------------------------------- sheets -------------------------------- */

/**
 * Rules attached to a sheet.
 *
 * These are read as optional properties rather than declared fields because
 * `grid-model.ts` is `W12`'s surface and has no slot for them yet
 * (`signals/W13-request.md`). Absent slots produce empty fragments, so today's
 * output is byte-identical to output from before this module existed, and the
 * day the slots land the wiring is already done.
 */
export interface GridSheetRules {
  conditionalRules?: readonly GridConditionalRule[];
  dataValidations?: readonly GridValidationRule[];
}

export interface GridSheetRuleXml {
  /** Splice directly after `</sheetData>`. */
  conditionalXml: string;
  /** Splice directly after `conditionalXml`. Order is mandatory. */
  validationXml: string;
  degradations: readonly GridExportDegradation[];
}

const EMPTY_RULE_XML: GridSheetRuleXml = {
  conditionalXml: "",
  validationXml: "",
  degradations: [],
};

export function buildSheetRuleXml(
  sheet: GridSheetRules | null | undefined,
  dxfs: GridDxfTable,
): GridSheetRuleXml {
  const conditional = sheet?.conditionalRules ?? [];
  const validations = sheet?.dataValidations ?? [];
  if (!conditional.length && !validations.length) return EMPTY_RULE_XML;
  const cf = buildConditionalFormattingXml(conditional, dxfs);
  const dv = buildDataValidationsXml(validations);
  return {
    conditionalXml: cf.xml,
    validationXml: dv.xml,
    degradations: [...cf.degradations, ...dv.degradations],
  };
}

/**
 * Read both rule families out of one worksheet part.
 *
 * This is the import half of the round-trip judgement: feed it what
 * `buildSheetRuleXml` produced and the rule count and semantics come back.
 */
export function parseSheetRuleXml(
  worksheetXml: string,
  styles: readonly GridConditionalStyle[] = [],
): Required<GridSheetRules> {
  return {
    conditionalRules: parseConditionalFormattingXml(worksheetXml, styles),
    dataValidations: parseDataValidationsXml(worksheetXml),
  };
}
