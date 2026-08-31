/**
 * `oceanleo.grid.v1` formula subset.
 *
 * Spec: `docs/specs/oceanleo-material-and-game-v1/L1-carriers/grid.md` §3.3.
 * The names below are the whole allowed surface — every one of them is
 * spelled and behaves the same in Excel, WPS and LibreOffice Calc, which is
 * why a workbook that stays inside the list opens in all three without a
 * repair prompt (§5.4). Anything outside the list is rejected with a code by
 * `inspectGridFormula`; it is never silently dropped or passed through, because
 * a passed-through `INDIRECT()` reaches outside the workbook. `RAND()` and the
 * rest of `GRID_VOLATILE_FUNCTIONS` are the one conditional case: they run only
 * against a document carrying a recalc stamp, so §6 F6 (the same material shows
 * a different number on every open) still cannot happen.
 */

export type GridFormulaValue = string | number;

/** Typed evaluation result. The XLSX cache-value writer needs the real type. */
export type GridFormulaScalar = string | number | boolean;

/**
 * §3.3 / §规范二 — the functions that may run with nothing but the workbook.
 *
 * Batch one (office hit rate) and batch two (dates and finance) are both here;
 * the volatile names live in `GRID_VOLATILE_FUNCTIONS` below because they need
 * a recalc stamp before they are allowed to run at all. §4 C11 pins the size.
 *
 * Every name is spelled and behaves the same in Excel, WPS and LibreOffice
 * Calc, which is what lets a workbook that stays inside the list open in all
 * three without a repair prompt (§5.4).
 */
export const GRID_FORMULA_WHITELIST = [
  // 逻辑
  "IF",
  "IFS",
  "IFERROR",
  "IFNA",
  "SWITCH",
  "AND",
  "OR",
  "NOT",
  "XOR",
  "TRUE",
  "FALSE",
  // 数学
  "SUM",
  "SUMIF",
  "SUMIFS",
  "SUMPRODUCT",
  "PRODUCT",
  "ABS",
  "ROUND",
  "ROUNDUP",
  "ROUNDDOWN",
  "MROUND",
  "CEILING",
  "FLOOR",
  "INT",
  "TRUNC",
  "MOD",
  "POWER",
  "SQRT",
  "SIGN",
  // 统计
  "COUNT",
  "COUNTA",
  "COUNTBLANK",
  "COUNTIF",
  "COUNTIFS",
  "AVERAGE",
  "AVERAGEIF",
  "AVERAGEIFS",
  "MEDIAN",
  "MIN",
  "MAX",
  "MINIFS",
  "MAXIFS",
  "LARGE",
  "SMALL",
  "RANK",
  // 文本
  "CONCAT",
  "TEXTJOIN",
  "LEFT",
  "RIGHT",
  "MID",
  "LEN",
  "FIND",
  "SEARCH",
  "SUBSTITUTE",
  "REPLACE",
  "TRIM",
  "UPPER",
  "LOWER",
  "TEXT",
  "VALUE",
  "EXACT",
  // 查找
  "VLOOKUP",
  "HLOOKUP",
  "INDEX",
  "MATCH",
  "CHOOSE",
  "ROW",
  "COLUMN",
  "ROWS",
  "COLUMNS",
  // 日期
  "DATE",
  "YEAR",
  "MONTH",
  "DAY",
  "HOUR",
  "MINUTE",
  "SECOND",
  "WEEKDAY",
  "WEEKNUM",
  "EDATE",
  "EOMONTH",
  "DATEDIF",
  "DAYS",
  "NETWORKDAYS",
  "WORKDAY",
  "DATEVALUE",
  "TIME",
  // 财务
  "NPV",
  "IRR",
  "XNPV",
  "XIRR",
  "PMT",
  "IPMT",
  "PPMT",
  "PV",
  "FV",
  "RATE",
  "NPER",
  "SLN",
  "DB",
  "DDB",
  "SYD",
  // 信息
  "ISBLANK",
  "ISNUMBER",
  "ISTEXT",
  "ISERROR",
  "ISERR",
  "ISNA",
  "ISLOGICAL",
  "ISEVEN",
  "ISODD",
  "N",
  "NA",
  "TYPE",
] as const;

export type GridFormulaFunction = (typeof GRID_FORMULA_WHITELIST)[number];

const WHITELIST = new Set<string>(GRID_FORMULA_WHITELIST);

/**
 * §规范三. Allowed, but only against a document that carries a
 * {@link GridRecalcStamp} — they read the stamp, never the host clock or the
 * platform RNG, so "same document bytes, same numbers" (§5.4 / §6 F6) still
 * holds. With no stamp in scope they fail closed with the
 * `grid-formula-nondeterministic` code, which is the behaviour a caller that
 * passes no options has always seen.
 *
 * Renamed from `GRID_NONDETERMINISTIC_FUNCTIONS`: the old name described a
 * verdict ("these are rejected"), and the verdict is now conditional.
 */
export const GRID_VOLATILE_FUNCTIONS = [
  "RAND",
  "RANDBETWEEN",
  "RANDARRAY",
  "NOW",
  "TODAY",
] as const;

export type GridVolatileFunction = (typeof GRID_VOLATILE_FUNCTIONS)[number];

/**
 * @deprecated Use {@link GRID_VOLATILE_FUNCTIONS}. Kept as an alias because
 * `GridWorkbookExport.ts` and `tests/grid-carrier-contract.test.mjs` import the
 * old name, and neither is this task's to edit.
 */
export const GRID_NONDETERMINISTIC_FUNCTIONS = GRID_VOLATILE_FUNCTIONS;

/**
 * Volatile in name only: `RANDARRAY` returns a dynamic array, so it needs the
 * §规范四 spill semantics that this wave deliberately does not ship (zero hits
 * across the 456-workbook corpus; the spec itself says half a spill
 * implementation is worse than none). It stays rejected as "not on the list"
 * rather than half-working, and a recalc stamp does not unlock it.
 */
const SPILL_REQUIRED = new Set<string>(["RANDARRAY"]);

const VOLATILE = new Set<string>(
  GRID_VOLATILE_FUNCTIONS.filter((name) => !SPILL_REQUIRED.has(name)),
);

/**
 * §3.3 third bullet, "no `INDIRECT`" half: the argument is computed at open
 * time, so the reference graph cannot be linked or cycle-checked ahead of
 * emit, and §3.2 `ir-validated → formula-linked` has nothing to resolve.
 */
export const GRID_UNREACHABLE_FUNCTIONS = [
  "INDIRECT",
  "OFFSET",
  "WEBSERVICE",
  "HYPERLINK",
] as const;

/**
 * §3.3 third bullet, "no macros" half, kept apart from the unreachable set so
 * §6's macro failure mode gets its own code: these are XLM macro-sheet calls,
 * which is code execution rather than a reference the linker could follow.
 */
export const GRID_MACRO_FUNCTIONS = [
  "CALL",
  "EVALUATE",
  "EXEC",
  "REGISTER",
  "REGISTER.ID",
] as const;

/** §4 C12 — `$defs.cell.f` maxLength. */
export const GRID_FORMULA_MAX_LENGTH = 500;
/** §4 C14 — longest path of the reference graph after topological sort. */
export const GRID_FORMULA_MAX_DEPTH = 32;
/** §4 C26 — `IRR` iteration ceiling. */
export const GRID_IRR_MAX_ITERATIONS = 200;
/** §4 C25 — three-statement tie-out tolerance, in yuan. */
export const GRID_TIE_OUT_TOLERANCE = 0.01;

export const GRID_FORMULA_REJECTION_CODES = {
  notWhitelisted: "grid-formula-not-whitelisted",
  nondeterministic: "grid-formula-nondeterministic",
  unreachable: "grid-formula-unreachable-reference",
  externalWorkbook: "grid-formula-external-workbook",
  macro: "grid-formula-macro",
  unguardedDivision: "grid-formula-unguarded-division",
  tooLong: "grid-formula-too-long",
  empty: "grid-formula-empty",
  syntax: "grid-formula-syntax",
} as const;

export type GridFormulaRejectionCode =
  (typeof GRID_FORMULA_REJECTION_CODES)[keyof typeof GRID_FORMULA_REJECTION_CODES];

export interface GridFormulaViolation {
  code: GridFormulaRejectionCode;
  detail: string;
}

export interface GridFormulaInspection {
  ok: boolean;
  /** Formula body with any leading `=` removed — what OOXML `<f>` carries. */
  source: string;
  functions: string[];
  /** Same-sheet A1 references, deduplicated and in first-seen order. */
  references: string[];
  /**
   * The same references with their `$` markers intact, index-aligned with
   * {@link references}. A fill handle has to know that `$A1` pins the column
   * while `A1` travels, and `references` cannot say so because it drops the
   * markers — a shape other editors already depend on, so the information is
   * added alongside rather than folded in.
   */
  absoluteReferences: string[];
  /** `A1:B9` style ranges. */
  ranges: string[];
  /** `Sheet!A1` style qualified references. */
  qualifiedReferences: string[];
  /** Bare identifiers that are not function calls — named-range candidates. */
  names: string[];
  /**
   * Volatile names this formula calls (§规范三). Non-empty means the answer is
   * pinned to the document's recalc stamp rather than to the formula alone, so
   * a caller re-stamping the document knows this cell has to be recomputed.
   * Only populated when a stamp was in scope; with no stamp these same names
   * are rejected instead, and show up in `violations`.
   */
  volatileFunctions: string[];
  violations: GridFormulaViolation[];
}

/** Options for {@link inspectGridFormula}. */
export interface GridFormulaInspectOptions {
  /**
   * The document's recalc stamp. Its presence is the whole question: §规范三
   * says a volatile name is allowed only against a document that carries one.
   * Leave it out — as every caller that predates the stamp does — and volatile
   * names keep being rejected, which is the fail-closed half of the rule.
   */
  recalc?: GridRecalcStamp;
}

/** Thrown by `assertGridFormulaAllowed`; carries the machine-readable code. */
export class GridFormulaRejection extends Error {
  readonly code: GridFormulaRejectionCode;
  readonly violations: GridFormulaViolation[];

  constructor(source: string, violations: GridFormulaViolation[]) {
    super(
      `公式不合规（${violations[0]?.code ?? "unknown"}）：${source.slice(0, 120)}`,
    );
    this.name = "GridFormulaRejection";
    this.code = violations[0]?.code ?? GRID_FORMULA_REJECTION_CODES.syntax;
    this.violations = violations;
  }
}

type Token =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  /** `raw` keeps the `$` markers `value` drops, for `absoluteReferences`. */
  | { type: "cell"; value: string; raw: string }
  | { type: "qualified"; value: string; raw: string }
  | { type: "name"; value: string }
  | { type: "operator"; value: string }
  | { type: "external"; value: string }
  | { type: "eof"; value: "" };

class FormulaError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const OPERATORS = ["<>", ">=", "<=", "=", "<", ">", "+", "-", "*", "/", "^", "&"];

/**
 * Operators and punctuation are the only tokens whose spelling may be acted on.
 * A string literal can spell anything: `SUBSTITUTE(A1,"-","")` is how a phone
 * column loses its dashes, and matching on `value` alone read that `-` as a
 * minus sign and failed the whole formula with `#VALUE!`.
 */
function isOperator(token: Token | undefined, value: string): boolean {
  return token?.type === "operator" && token.value === value;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    // `[Book1.xlsx]Sheet1!A1` and `'C:\path\[Book]Sheet'!A1` — external
    // workbook references. Captured as their own token type so the inspector
    // can report them instead of the tokenizer failing with a syntax code.
    const external = rest.match(/^(?:'[^']*\[[^\]]*\][^']*'|\[[^\]]+\][A-Za-z0-9_]*)!\$?[A-Za-z]{1,3}\$?\d{1,7}/);
    if (external) {
      tokens.push({ type: "external", value: external[0] });
      index += external[0].length;
      continue;
    }
    const text = rest.match(/^"((?:[^"]|"")*)"/);
    if (text) {
      tokens.push({ type: "string", value: text[1].replace(/""/g, '"') });
      index += text[0].length;
      continue;
    }
    const qualified = rest.match(
      /^(?:'[^'\[\]]+'|[A-Za-z0-9_\u4e00-\u9fff]+)!\$?[A-Za-z]{1,3}\$?\d{1,7}/,
    );
    if (qualified) {
      tokens.push({
        type: "qualified",
        value: qualified[0].replace(/\$/g, ""),
        raw: qualified[0],
      });
      index += qualified[0].length;
      continue;
    }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      tokens.push({ type: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    // Cell before name: `A1` must not lex as the identifier `A1`.
    const cell = rest.match(/^\$?[A-Za-z]{1,3}\$?\d{1,7}(?![A-Za-z0-9_])/);
    if (cell) {
      tokens.push({ type: "cell", value: cell[0].replace(/\$/g, ""), raw: cell[0] });
      index += cell[0].length;
      continue;
    }
    // `Module1.Macro` keeps the dot so the inspector can flag it as a macro.
    const name = rest.match(/^[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_.\u4e00-\u9fff]*/);
    if (name) {
      tokens.push({ type: "name", value: name[0].toUpperCase() });
      index += name[0].length;
      continue;
    }
    const operator = OPERATORS.find((candidate) => rest.startsWith(candidate));
    if (operator) {
      tokens.push({ type: "operator", value: operator });
      index += operator.length;
      continue;
    }
    if ("():,;%!".includes(source[index])) {
      tokens.push({ type: "operator", value: source[index] });
      index += 1;
      continue;
    }
    throw new FormulaError("#VALUE!");
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

function columnIndex(label: string): number {
  let value = 0;
  for (const character of label.toUpperCase()) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value - 1;
}

export function gridColumnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function cellPosition(reference: string): { row: number; col: number } {
  const match = reference.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) throw new FormulaError("#REF!");
  return { row: Number(match[2]) - 1, col: columnIndex(match[1]) };
}

/** A1 reference parser exposed for the linker in `GridWorkbookExport`. */
export function parseGridReference(
  reference: string,
): { row: number; col: number } | null {
  const bare = reference.replace(/\$/g, "");
  return /^[A-Za-z]{1,3}\d{1,7}$/.test(bare) ? cellPosition(bare) : null;
}

function numeric(value: GridFormulaScalar): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (!value.trim()) return 0;
  if (value.startsWith("#")) throw new FormulaError(value);
  const parsed = Number(value.replace(/,/g, "").replace(/%$/, ""));
  if (!Number.isFinite(parsed)) throw new FormulaError("#VALUE!");
  return value.trim().endsWith("%") ? parsed / 100 : parsed;
}

function truthy(value: GridFormulaScalar): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const upper = value.trim().toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE" || upper === "") return false;
  return numeric(value) !== 0;
}

function isBlank(value: GridFormulaScalar): boolean {
  return typeof value === "string" && value.trim() === "";
}

/**
 * Cells are stored as strings, so a numeric literal has to be recovered on
 * read: Excel treats `120` in a cell as the number 120, and `SUM` / `>` / the
 * cached `<v>` writer all need the real type back. Text, error codes and blanks
 * pass through untouched.
 */
function coerceCellScalar(raw: string): GridFormulaScalar {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (trimmed.startsWith("#")) return raw;
  const upper = trimmed.toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  const percent = trimmed.endsWith("%");
  const body = (percent ? trimmed.slice(0, -1) : trimmed).replace(/,/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(body)) return raw;
  const parsed = Number(body);
  if (!Number.isFinite(parsed)) return raw;
  return percent ? parsed / 100 : parsed;
}

interface ScalarArg {
  kind: "scalar";
  value: GridFormulaScalar;
}

interface RangeArg {
  kind: "range";
  matrix: GridFormulaScalar[][];
}

type Arg = ScalarArg | RangeArg;

function flatten(args: readonly Arg[]): GridFormulaScalar[] {
  return args.flatMap((arg) =>
    arg.kind === "scalar" ? [arg.value] : arg.matrix.flat(),
  );
}

/**
 * Excel semantics: text inside a *range* is skipped by SUM/AVERAGE, while text
 * handed in directly is an error. Keeping the distinction matters because a
 * header cell caught inside `SUM(B1:B9)` must not poison the total.
 */
function numbersFrom(args: readonly Arg[]): number[] {
  const values: number[] = [];
  for (const arg of args) {
    if (arg.kind === "scalar") {
      values.push(numeric(arg.value));
      continue;
    }
    for (const cell of arg.matrix.flat()) {
      if (isBlank(cell) || typeof cell === "boolean") continue;
      try {
        values.push(numeric(cell));
      } catch (caught) {
        if (caught instanceof FormulaError && caught.code === "#VALUE!") continue;
        throw caught;
      }
    }
  }
  return values;
}

function compareScalars(
  left: GridFormulaScalar,
  right: GridFormulaScalar,
): number {
  const leftNumber = typeof left === "string" ? Number(left) : Number(left);
  const rightNumber = typeof right === "string" ? Number(right) : Number(right);
  if (
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber) &&
    !(typeof left === "string" && left.trim() === "") &&
    !(typeof right === "string" && right.trim() === "")
  ) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
}

function matchesCriteria(
  value: GridFormulaScalar,
  criteria: GridFormulaScalar,
): boolean {
  const text = typeof criteria === "string" ? criteria.trim() : String(criteria);
  const operator = text.match(/^(<>|>=|<=|=|>|<)(.*)$/);
  if (operator) {
    const target = operator[2].trim();
    const compared = compareScalars(value, target);
    switch (operator[1]) {
      case ">":
        return compared > 0;
      case "<":
        return compared < 0;
      case ">=":
        return compared >= 0;
      case "<=":
        return compared <= 0;
      case "=":
        return compared === 0;
      default:
        return compared !== 0;
    }
  }
  return compareScalars(value, text) === 0;
}

function roundTo(value: number, digits: number, mode: "half" | "up" | "down") {
  const factor = 10 ** Math.trunc(digits);
  const scaled = value * factor;
  const rounded =
    mode === "half"
      ? Math.sign(scaled) * Math.round(Math.abs(scaled))
      : mode === "up"
        ? Math.sign(scaled) * Math.ceil(Math.abs(scaled) - Number.EPSILON)
        : Math.sign(scaled) * Math.floor(Math.abs(scaled) + Number.EPSILON);
  return rounded / factor;
}

function npv(rate: number, values: readonly number[]): number {
  return values.reduce(
    (total, value, index) => total + value / (1 + rate) ** (index + 1),
    0,
  );
}

/**
 * `IRR` by bisection. §4 C26 caps the iteration count at 200, which is also
 * what makes the value reproducible: a Newton solve seeded from a guess can
 * land on a different root between runs, and §6 F6 forbids a material whose
 * numbers move between opens.
 */
function irr(values: readonly number[], guess: number): number {
  const at = (rate: number) =>
    values.reduce(
      (total, value, index) => total + value / (1 + rate) ** index,
      0,
    );
  let low = -0.9999;
  let high = Math.max(1, Math.abs(guess) * 4 + 1);
  let lowValue = at(low);
  let highValue = at(high);
  if (lowValue * highValue > 0) throw new FormulaError("#NUM!");
  for (let iteration = 0; iteration < GRID_IRR_MAX_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    const value = at(middle);
    if (Math.abs(value) < 1e-9) return middle;
    if (lowValue * value <= 0) {
      high = middle;
      highValue = value;
    } else {
      low = middle;
      lowValue = value;
    }
  }
  void highValue;
  return (low + high) / 2;
}

/** One row of cells as the evaluator sees them: raw editor text. */
export type GridRow = readonly string[];

/**
 * The frozen instant and random seed a document carries so that volatile
 * functions stay reproducible (§规范三). `TODAY()` / `NOW()` read `at`;
 * the `RAND` family derives from `seed` plus the cell address. Neither ever
 * reaches the system clock or the platform RNG — the §5.4 invariant is "same
 * document bytes, same numbers", and reading either one breaks it.
 *
 * Those two API names are described rather than spelled out on purpose: the
 * C-4 closed-subset assertion greps this file for them, and it should keep
 * failing the moment one genuinely appears.
 */
export interface GridRecalcStamp {
  /** ISO8601, UTC. */
  at: string;
  /** uint32. */
  seed: number;
}

export interface GridFormulaContext {
  /** `namedRanges[].name` → `Sheet!A1:B9`, resolved case-insensitively. */
  namedRanges?: Readonly<Record<string, string>>;
  /** Sheet name → rows, so `Sheet2!B3` links inside one workbook (§3.2). */
  workbook?: Readonly<Record<string, readonly GridRow[]>>;
  /** Name of the sheet that owns `rows`; used to resolve self-qualified refs. */
  sheetName?: string;
  /** Present ⇒ volatile functions may run; absent ⇒ they fail closed (§规范三). */
  recalc?: GridRecalcStamp;
  /**
   * Lazy alternative to `workbook`, consulted first. `evaluateGridCellInWorkbook`
   * uses it so a caller holding sheets in any shape can answer lookups without
   * first materialising a whole `Record` of every sheet's rows.
   */
  sheetResolver?: (name: string) => readonly GridRow[] | null;
  /** Lazy alternative to `namedRanges`, consulted first. */
  namedRangeResolver?: (name: string) => string | null;
  /**
   * Zero-based address of the cell being evaluated. `ROW()` / `COLUMN()` report
   * it, and the `RAND` family mixes it into the seed so two cells sharing one
   * document do not draw the same number.
   */
  cell?: { row: number; col: number };
  /**
   * How many volatile draws this cell has already made, held in a box so the
   * count survives the context spread that nested evaluation performs. Without
   * it `=RAND()+RAND()` would derive both halves from the same seed material
   * and always come out an exact double.
   */
  volatileCalls?: { count: number };
}

/**
 * The workbook a formula is evaluated against (§规范一). This is the shape the
 * editor canvas passes in; it is what `evaluateGridCell`'s `rows`-only
 * signature could not express, and why `Sheet2!B3` showed `#REF!` on screen
 * while the very same formula exported correctly.
 */
export interface GridWorkbookContext {
  /** Sheet id or name → rows. Resolved case-insensitively, as OOXML does. */
  sheetRows(ref: string): readonly GridRow[] | undefined;
  /** Named range → `A1` or `Sheet!A1:B9`. */
  namedRange(name: string): string | undefined;
  /** Omitted ⇒ volatile functions fail closed rather than read the clock. */
  recalc?: GridRecalcStamp;
}

class Parser {
  private position = 0;
  private readonly tokens: Token[];
  private readonly rows: readonly (readonly string[])[];
  private readonly visiting: Set<string>;
  private readonly context: GridFormulaContext;
  private readonly depth: number;

  constructor(
    tokens: Token[],
    rows: readonly (readonly string[])[],
    visiting: Set<string>,
    context: GridFormulaContext,
    depth: number,
  ) {
    this.tokens = tokens;
    this.rows = rows;
    this.visiting = visiting;
    this.context = context;
    this.depth = depth;
  }

  parse(): GridFormulaScalar {
    const result = this.comparison();
    const next = this.peek();
    if (next.type !== "eof" && next.value !== ")" && next.value !== ",") {
      throw new FormulaError("#VALUE!");
    }
    return result;
  }

  private peek(offset = 0): Token {
    return this.tokens[this.position + offset] ?? { type: "eof", value: "" };
  }

  private take(): Token {
    const token = this.peek();
    this.position += 1;
    return token;
  }

  private accept(value: string): boolean {
    if (!isOperator(this.peek(), value)) return false;
    this.position += 1;
    return true;
  }

  private expect(value: string): void {
    if (!this.accept(value)) throw new FormulaError("#VALUE!");
  }

  private comparison(): GridFormulaScalar {
    const left = this.concat();
    const operator = this.peek();
    if (
      operator.type === "operator" &&
      ["=", "<>", ">", "<", ">=", "<="].includes(operator.value)
    ) {
      this.position += 1;
      const right = this.concat();
      const compared = compareScalars(left, right);
      switch (operator.value) {
        case "=":
          return compared === 0;
        case "<>":
          return compared !== 0;
        case ">":
          return compared > 0;
        case "<":
          return compared < 0;
        case ">=":
          return compared >= 0;
        default:
          return compared <= 0;
      }
    }
    return left;
  }

  private concat(): GridFormulaScalar {
    let value = this.additive();
    while (isOperator(this.peek(), "&")) {
      this.position += 1;
      value = `${stringify(value)}${stringify(this.additive())}`;
    }
    return value;
  }

  private additive(): GridFormulaScalar {
    let value = this.multiplicative();
    while (isOperator(this.peek(), "+") || isOperator(this.peek(), "-")) {
      const operator = this.take().value;
      const right = numeric(this.multiplicative());
      value = operator === "+" ? numeric(value) + right : numeric(value) - right;
    }
    return value;
  }

  private multiplicative(): GridFormulaScalar {
    let value = this.power();
    while (isOperator(this.peek(), "*") || isOperator(this.peek(), "/")) {
      const operator = this.take().value;
      const right = numeric(this.power());
      if (operator === "/" && right === 0) throw new FormulaError("#DIV/0!");
      value =
        operator === "*" ? numeric(value) * right : numeric(value) / right;
    }
    return value;
  }

  private power(): GridFormulaScalar {
    const value = this.unary();
    if (this.accept("^")) return numeric(value) ** numeric(this.power());
    return value;
  }

  private unary(): GridFormulaScalar {
    if (this.accept("+")) return numeric(this.unary());
    if (this.accept("-")) return -numeric(this.unary());
    return this.postfix();
  }

  private postfix(): GridFormulaScalar {
    const value = this.primary();
    if (this.accept("%")) return numeric(value) / 100;
    return value;
  }

  private primary(): GridFormulaScalar {
    const token = this.take();
    if (token.type === "number") return token.value;
    if (token.type === "string") return token.value;
    if (token.type === "cell") return this.resolveCell(token.value);
    if (token.type === "qualified") return this.resolveQualified(token.value);
    if (token.type === "external") throw new FormulaError("#REF!");
    if (token.type === "name") {
      if (isOperator(this.peek(), "(")) return this.callFunction(token.value);
      if (token.value === "TRUE") return true;
      if (token.value === "FALSE") return false;
      return this.resolveName(token.value);
    }
    if (token.value === "(") {
      const value = this.comparison();
      this.expect(")");
      return value;
    }
    throw new FormulaError("#VALUE!");
  }

  private sheetRows(name: string): readonly (readonly string[])[] | null {
    const own = this.context.sheetName || "";
    // OOXML matches sheet names case-insensitively, so `sheet2!B3` and
    // `Sheet2!B3` must land on the same rows — including when the name refers
    // to the sheet being evaluated.
    if (!name || name.toLowerCase() === own.toLowerCase()) return this.rows;
    const resolved = this.context.sheetResolver?.(name);
    if (resolved) return resolved;
    const workbook = this.context.workbook;
    if (!workbook) return null;
    const key = Object.keys(workbook).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase(),
    );
    return key ? workbook[key] : null;
  }

  private resolveQualified(reference: string): GridFormulaScalar {
    const separator = reference.indexOf("!");
    const sheet = reference.slice(0, separator).replace(/^'|'$/g, "");
    const rows = this.sheetRows(sheet);
    if (!rows) throw new FormulaError("#REF!");
    return this.resolveIn(rows, sheet, reference.slice(separator + 1));
  }

  private resolveName(name: string): GridFormulaScalar {
    const target = this.namedRange(name);
    if (!target) throw new FormulaError("#NAME?");
    const matrix = this.rangeMatrixFor(target);
    const first = matrix[0]?.[0];
    return first === undefined ? "" : first;
  }

  private namedRange(name: string): string | null {
    const resolved = this.context.namedRangeResolver?.(name);
    if (resolved) return resolved;
    const ranges = this.context.namedRanges;
    if (!ranges) return null;
    const key = Object.keys(ranges).find(
      (candidate) => candidate.toUpperCase() === name.toUpperCase(),
    );
    return key ? ranges[key] : null;
  }

  private resolveCell(reference: string): GridFormulaScalar {
    return this.resolveIn(this.rows, this.context.sheetName || "", reference);
  }

  private resolveIn(
    rows: readonly (readonly string[])[],
    sheetName: string,
    reference: string,
  ): GridFormulaScalar {
    const { row, col } = cellPosition(reference.replace(/\$/g, ""));
    if (row < 0 || col < 0) throw new FormulaError("#REF!");
    if (this.depth >= GRID_FORMULA_MAX_DEPTH) throw new FormulaError("#REF!");
    const key = `${sheetName}!${row}:${col}`;
    if (this.visiting.has(key)) throw new FormulaError("#CYCLE!");
    const raw = rows[row]?.[col] ?? "";
    if (!raw.startsWith("=")) return coerceCellScalar(raw);
    this.visiting.add(key);
    try {
      return evaluateFormulaSource(
        raw.slice(1),
        rows,
        this.visiting,
        {
          ...this.context,
          sheetName,
          // The referenced cell is the one `ROW()` and the RAND family are
          // now standing in, and it gets its own draw counter so its value
          // does not depend on how many draws the caller had already made.
          cell: { row, col },
          volatileCalls: { count: 0 },
        },
        this.depth + 1,
      );
    } finally {
      this.visiting.delete(key);
    }
  }

  private rangeMatrixFor(reference: string): GridFormulaScalar[][] {
    const separator = reference.indexOf("!");
    const sheet =
      separator >= 0
        ? reference.slice(0, separator).replace(/^'|'$/g, "")
        : this.context.sheetName || "";
    const body = separator >= 0 ? reference.slice(separator + 1) : reference;
    const [first, last = first] = body.replace(/\$/g, "").split(":");
    const rows = this.sheetRows(sheet);
    if (!rows) throw new FormulaError("#REF!");
    return this.matrix(rows, sheet, first, last);
  }

  private matrix(
    rows: readonly (readonly string[])[],
    sheetName: string,
    first: string,
    last: string,
  ): GridFormulaScalar[][] {
    const start = cellPosition(first);
    const end = cellPosition(last);
    const matrix: GridFormulaScalar[][] = [];
    for (
      let row = Math.min(start.row, end.row);
      row <= Math.max(start.row, end.row);
      row += 1
    ) {
      const line: GridFormulaScalar[] = [];
      for (
        let col = Math.min(start.col, end.col);
        col <= Math.max(start.col, end.col);
        col += 1
      ) {
        try {
          line.push(
            this.resolveIn(rows, sheetName, `${gridColumnName(col)}${row + 1}`),
          );
        } catch (caught) {
          if (caught instanceof FormulaError) {
            line.push(caught.code);
            continue;
          }
          throw caught;
        }
      }
      matrix.push(line);
    }
    return matrix;
  }

  /** Consume one argument without evaluating it — needed by IF / IFERROR. */
  private skipArgument(): void {
    let depth = 0;
    for (;;) {
      const token = this.peek();
      if (token.type === "eof") return;
      if (isOperator(token, "(")) depth += 1;
      if (isOperator(token, ")")) {
        if (depth === 0) return;
        depth -= 1;
      }
      if (isOperator(token, ",") && depth === 0) return;
      this.position += 1;
    }
  }

  private argument(): Arg {
    const first = this.peek();
    if (
      (first.type === "cell" || first.type === "qualified") &&
      isOperator(this.peek(1), ":") &&
      (this.peek(2).type === "cell" || this.peek(2).type === "qualified")
    ) {
      const start = String(this.take().value);
      this.take();
      const end = String(this.take().value);
      const separator = start.indexOf("!");
      const sheet =
        separator >= 0
          ? start.slice(0, separator).replace(/^'|'$/g, "")
          : this.context.sheetName || "";
      const rows = this.sheetRows(sheet);
      if (!rows) throw new FormulaError("#REF!");
      const endBody = end.includes("!") ? end.slice(end.indexOf("!") + 1) : end;
      return {
        kind: "range",
        matrix: this.matrix(
          rows,
          sheet,
          separator >= 0 ? start.slice(separator + 1) : start,
          endBody,
        ),
      };
    }
    if (first.type === "name" && !isOperator(this.peek(1), "(")) {
      const target = this.namedRange(first.value);
      if (target && target.includes(":")) {
        this.position += 1;
        return { kind: "range", matrix: this.rangeMatrixFor(target) };
      }
    }
    return { kind: "scalar", value: this.comparison() };
  }

  private callFunction(name: string): GridFormulaScalar {
    this.expect("(");
    // A volatile name is only callable against a document that carries a
    // recalc stamp; with none in scope it fails closed rather than reading the
    // host clock (§规范三). The evaluator agrees with the inspector: an
    // off-list name is an error value, never a guess at what the author meant.
    if (!WHITELIST.has(name)) {
      if (!VOLATILE.has(name)) throw new FormulaError("#NAME?");
      requireRecalc(this.context);
    }
    switch (name) {
      case "IF":
        return this.callIf();
      case "IFERROR":
        return this.callIfError();
      case "IFNA":
        return this.callIfNa();
      case "IFS":
        return this.callIfs();
      case "SWITCH":
        return this.callSwitch();
      case "CHOOSE":
        return this.callChoose();
      case "ROW":
      case "COLUMN":
        return this.callRowColumn(name);
      case "ISERROR":
      case "ISERR":
      case "ISNA":
        return this.callIsError(name);
      default:
        break;
    }
    const args: Arg[] = [];
    if (!isOperator(this.peek(), ")")) {
      do args.push(this.argument());
      while (this.accept(",") || this.accept(";"));
    }
    this.expect(")");
    return applyFunction(name as GridDispatchedFunction, args, this.context);
  }

  /** Evaluate one argument, converting a thrown error into a value. */
  private tryArgument():
    | { ok: true; value: GridFormulaScalar }
    | { ok: false; code: string } {
    const start = this.position;
    try {
      const value = this.comparison();
      // A cached error string reaches here through the range path; treat it
      // the same as a thrown one so IS* and IFNA agree with IFERROR.
      if (typeof value === "string" && /^#[A-Z0-9/!?]+$/.test(value)) {
        return { ok: false, code: value };
      }
      return { ok: true, value };
    } catch (caught) {
      if (!(caught instanceof FormulaError)) throw caught;
      this.position = start;
      this.skipArgument();
      return { ok: false, code: caught.code };
    }
  }

  private callIfNa(): GridFormulaScalar {
    const outcome = this.tryArgument();
    this.expect(",");
    if (!outcome.ok && outcome.code === "#N/A") {
      const fallback = this.comparison();
      this.expect(")");
      return fallback;
    }
    this.skipArgument();
    this.expect(")");
    if (!outcome.ok) throw new FormulaError(outcome.code);
    return outcome.value;
  }

  private callIfs(): GridFormulaScalar {
    let chosen: GridFormulaScalar | null = null;
    for (;;) {
      if (chosen === null) {
        const condition = truthy(this.comparison());
        this.expect(",");
        if (condition) chosen = this.comparison();
        else this.skipArgument();
      } else {
        this.skipArgument();
        this.expect(",");
        this.skipArgument();
      }
      if (!this.accept(",")) break;
    }
    this.expect(")");
    if (chosen === null) throw new FormulaError("#N/A");
    return chosen;
  }

  private callSwitch(): GridFormulaScalar {
    const subject = this.comparison();
    this.expect(",");
    let chosen: GridFormulaScalar | null = null;
    let fallback: GridFormulaScalar | null = null;
    for (;;) {
      const candidate = this.comparison();
      if (!this.accept(",")) {
        // A trailing argument with no pair of its own is the default.
        if (chosen === null) fallback = candidate;
        break;
      }
      if (chosen === null && compareScalars(subject, candidate) === 0) {
        chosen = this.comparison();
      } else {
        this.skipArgument();
      }
      if (!this.accept(",")) break;
    }
    this.expect(")");
    if (chosen !== null) return chosen;
    if (fallback !== null) return fallback;
    throw new FormulaError("#N/A");
  }

  private callChoose(): GridFormulaScalar {
    const which = Math.trunc(numeric(this.comparison()));
    this.expect(",");
    let chosen: GridFormulaScalar | null = null;
    let position = 1;
    for (;;) {
      if (position === which) chosen = this.comparison();
      else this.skipArgument();
      position += 1;
      if (!this.accept(",")) break;
    }
    this.expect(")");
    if (chosen === null) throw new FormulaError("#VALUE!");
    return chosen;
  }

  /**
   * `ROW()` reports where the formula sits; `ROW(A5)` reports the address it
   * was handed, not that cell's contents — which is why this cannot go through
   * the ordinary argument path.
   */
  private callRowColumn(name: "ROW" | "COLUMN"): GridFormulaScalar {
    if (this.accept(")")) {
      const cell = this.context.cell;
      if (!cell) throw new FormulaError("#REF!");
      return name === "ROW" ? cell.row + 1 : cell.col + 1;
    }
    const token = this.peek();
    if (token.type !== "cell" && token.type !== "qualified") {
      throw new FormulaError("#VALUE!");
    }
    const raw = String(token.value);
    const body = raw.includes("!") ? raw.slice(raw.indexOf("!") + 1) : raw;
    const { row, col } = cellPosition(body.replace(/\$/g, ""));
    this.skipArgument();
    this.expect(")");
    return name === "ROW" ? row + 1 : col + 1;
  }

  private callIsError(
    name: "ISERROR" | "ISERR" | "ISNA",
  ): GridFormulaScalar {
    const outcome = this.tryArgument();
    this.expect(")");
    if (outcome.ok) return false;
    if (name === "ISNA") return outcome.code === "#N/A";
    if (name === "ISERR") return outcome.code !== "#N/A";
    return true;
  }

  private callIf(): GridFormulaScalar {
    const condition = truthy(this.comparison());
    this.expect(",");
    if (condition) {
      const value = this.comparison();
      if (this.accept(",")) this.skipArgument();
      this.expect(")");
      return value;
    }
    this.skipArgument();
    if (!this.accept(",")) {
      this.expect(")");
      return false;
    }
    const value = this.comparison();
    this.expect(")");
    return value;
  }

  private callIfError(): GridFormulaScalar {
    const start = this.position;
    let value: GridFormulaScalar | null = null;
    try {
      const candidate = this.comparison();
      // A cached error string (`#DIV/0!`) counts as an error for IFERROR too:
      // it is how a referenced cell reports failure through the range path.
      if (typeof candidate === "string" && /^#[A-Z0-9/!?]+$/.test(candidate)) {
        throw new FormulaError(candidate);
      }
      value = candidate;
    } catch (caught) {
      if (!(caught instanceof FormulaError)) throw caught;
      this.position = start;
      this.skipArgument();
    }
    this.expect(",");
    if (value === null) {
      const fallback = this.comparison();
      this.expect(")");
      return fallback;
    }
    this.skipArgument();
    this.expect(")");
    return value;
  }
}

function stringify(value: GridFormulaScalar): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

/* --------------------------- 日期序列号（§规范二） --------------------------- */

/**
 * Days from 1970-01-01 for a proleptic-Gregorian date, by Howard Hinnant's
 * `days_from_civil`. Written out in integer arithmetic rather than built on the
 * host date type on purpose: the §5.4 invariant is that a document's numbers
 * depend on its bytes and nothing else, and a host date type carries the
 * machine's time zone into the answer.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const shifted = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/** Inverse of {@link daysFromCivil}. */
function civilFromDays(days: number): {
  year: number;
  month: number;
  day: number;
} {
  const shifted = days + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra +
      Math.floor(yearOfEra / 4) -
      Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  return { year: year + (month <= 2 ? 1 : 0), month, day };
}

/** Real days between 1899-12-30 and 1970-01-01, the serial-0 anchor. */
const SERIAL_EPOCH_DAYS = daysFromCivil(1899, 12, 30);

/**
 * Serial 60 is 1900-02-29 — a date that never happened. Lotus 1-2-3 shipped the
 * mistake, Excel kept it for file compatibility, and every serial at or below
 * it is therefore one greater than the true day count. Dropping the quirk would
 * make every pre-March-1900 date export one day off, which is exactly the
 * silent corruption §规范二 asks to pin down with a test.
 */
const LEAP_BUG_SERIAL = 60;

/** Largest serial the subset accepts: 9999-12-31, as in Excel. */
const MAX_SERIAL = 2_958_465;

export function gridDateToSerial(
  year: number,
  month: number,
  day: number,
): number {
  const raw = daysFromCivil(year, month, day) - SERIAL_EPOCH_DAYS;
  // Serial 0 is the 1899-12-30 anchor itself, so it is not one of the days the
  // phantom 1900-02-29 pushed out of place; only the real days between the
  // anchor and the phantom are, and those are the ones Excel numbers one lower
  // than a straight day count would.
  return raw >= 1 && raw <= LEAP_BUG_SERIAL ? raw - 1 : raw;
}

export function gridSerialToDate(serial: number): {
  year: number;
  month: number;
  day: number;
} {
  const whole = Math.floor(serial);
  if (whole === LEAP_BUG_SERIAL) return { year: 1900, month: 2, day: 29 };
  const raw = whole >= 1 && whole < LEAP_BUG_SERIAL ? whole + 1 : whole;
  return civilFromDays(raw + SERIAL_EPOCH_DAYS);
}

/** Reject a serial that no real date maps to, rather than wrapping silently. */
function requireSerial(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_SERIAL) {
    throw new FormulaError("#NUM!");
  }
  return value;
}

function serialDayFraction(serial: number): number {
  const fraction = serial - Math.floor(serial);
  return fraction < 0 ? fraction + 1 : fraction;
}

/** Sunday-based weekday index, 0..6, matching Excel's leap-bug-aware count. */
function weekdayIndex(serial: number): number {
  return (((Math.floor(serial) - 1) % 7) + 7) % 7;
}

/** Normalise an out-of-range month the way `DATE(2026,13,1)` expects. */
function normalizedDateSerial(
  year: number,
  month: number,
  day: number,
): number {
  const yearShift = Math.floor((month - 1) / 12);
  return requireSerial(
    gridDateToSerial(
      year + yearShift + (year >= 0 && year <= 1899 ? 1900 : 0),
      month - yearShift * 12,
      day,
    ),
  );
}

const DATE_TEXT = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;

/** ISO8601 instant → serial, for `TODAY` / `NOW` reading `recalc.at`. */
function serialFromIsoInstant(instant: string): number {
  const parsed = instant.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/,
  );
  if (!parsed) throw new FormulaError("#VALUE!");
  const days = gridDateToSerial(
    Number(parsed[1]),
    Number(parsed[2]),
    Number(parsed[3]),
  );
  const seconds =
    Number(parsed[4]) * 3600 + Number(parsed[5]) * 60 + Number(parsed[6]);
  return days + seconds / 86_400;
}

/* ------------------------ volatile 的确定性来源（§规范三） ------------------------ */

function mix32(value: number): number {
  let state = value >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x21f0_aaad) >>> 0;
  state = Math.imul(state ^ (state >>> 15), 0x735a_2d97) >>> 0;
  return (state ^ (state >>> 15)) >>> 0;
}

function textHash(text: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x0100_0193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The stamp, or a controlled rejection. Fail-closed is the whole point: a
 * volatile function that quietly fell back to the host clock would make the
 * same document bytes produce different numbers on the next open (§6 F6).
 */
function requireRecalc(context: GridFormulaContext): GridRecalcStamp {
  const stamp = context.recalc;
  if (!stamp) throw new FormulaError(GRID_FORMULA_REJECTION_CODES.nondeterministic);
  return stamp;
}

/**
 * One draw in `[0, 1)` from `hash(seed, sheetId, row, col, callIndex)`.
 * Deterministic in the document, and distinct per cell and per call within a
 * cell, so `=RAND()+RAND()` is not forced to be an exact doubling.
 */
function volatileDraw(context: GridFormulaContext): number {
  const stamp = requireRecalc(context);
  const box = context.volatileCalls ?? { count: 0 };
  const callIndex = box.count;
  box.count += 1;
  const address = context.cell ?? { row: 0, col: 0 };
  const sheet = textHash(context.sheetName ?? "");
  let state = mix32(stamp.seed >>> 0);
  state = mix32(state ^ sheet);
  state = mix32(state ^ ((address.row + 1) * 0x0001_0001));
  state = mix32(state ^ ((address.col + 1) * 0x0100_0001));
  state = mix32(state ^ (callIndex + 0x9e37_79b9));
  return state / 0x1_0000_0000;
}

/* ------------------------------ 文本与数值工具 ------------------------------ */

function textOf(value: GridFormulaScalar): string {
  return stringify(value);
}

function requireText(args: readonly Arg[], position: number): string {
  return textOf(requireScalar(args, position));
}

function requirePositiveInteger(value: number): number {
  const count = Math.trunc(value);
  if (count < 0) throw new FormulaError("#VALUE!");
  return count;
}

/** Excel's `?` / `*` wildcards, used by FIND-free matching in SEARCH. */
function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (character) =>
    character === "*" ? "[\\s\\S]*" : character === "?" ? "[\\s\\S]" : `\\${character}`,
  );
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * A very small `TEXT()` / number-format subset: fixed decimals, thousands
 * grouping, percent, and the three date shapes the corpus actually carries.
 * An unrecognised format returns the value as plain text rather than guessing,
 * because a wrong format silently changes what the reader sees.
 */
function formatByPattern(value: GridFormulaScalar, pattern: string): string {
  const trimmed = pattern.trim();
  if (/^[yYmMdD][-/.\syYmMdD]*$/.test(trimmed) && typeof value !== "string") {
    const serial = requireSerial(numeric(value));
    const { year, month, day } = gridSerialToDate(serial);
    const pad = (input: number, width: number) =>
      String(input).padStart(width, "0");
    return trimmed
      .replace(/yyyy/gi, String(year))
      .replace(/yy/gi, pad(year % 100, 2))
      .replace(/mm/g, pad(month, 2))
      .replace(/dd/gi, pad(day, 2))
      .replace(/(?<![a-z0-9])m(?![a-z0-9])/g, String(month))
      .replace(/(?<![a-z0-9])d(?![a-z0-9])/gi, String(day));
  }
  const percent = trimmed.endsWith("%");
  const body = percent ? trimmed.slice(0, -1) : trimmed;
  const decimals = body.includes(".") ? body.split(".")[1].length : 0;
  if (!/^[#,0]+(?:\.[0#]*)?$/.test(body)) return textOf(value);
  const scaled = numeric(value) * (percent ? 100 : 1);
  const fixed = roundTo(scaled, decimals, "half").toFixed(decimals);
  const grouped = body.includes(",")
    ? fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : fixed;
  return percent ? `${grouped}%` : grouped;
}

/* ------------------------------ 条件聚合工具 ------------------------------ */

/** Positions in `range` that satisfy every `(range, criteria)` pair. */
function matchingPositions(
  pairs: readonly { range: GridFormulaScalar[][]; criteria: GridFormulaScalar }[],
): number[] {
  const first = pairs[0];
  if (!first) return [];
  const length = first.range.flat().length;
  const positions: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const matched = pairs.every((pair) => {
      const value = pair.range.flat()[index];
      return value !== undefined && matchesCriteria(value, pair.criteria);
    });
    if (matched) positions.push(index);
  }
  return positions;
}

/** `SUMIFS`-shaped arguments: a target range then `(range, criteria)` pairs. */
function criteriaPairs(
  args: readonly Arg[],
  start: number,
): { range: GridFormulaScalar[][]; criteria: GridFormulaScalar }[] {
  const pairs: { range: GridFormulaScalar[][]; criteria: GridFormulaScalar }[] =
    [];
  for (let index = start; index + 1 < args.length + 1; index += 2) {
    if (!args[index] || !args[index + 1]) break;
    pairs.push({
      range: requireRange(args, index),
      criteria: requireScalar(args, index + 1),
    });
  }
  return pairs;
}

function finiteNumbers(values: readonly GridFormulaScalar[]): number[] {
  const numbers: number[] = [];
  for (const value of values) {
    if (isBlank(value) || typeof value === "boolean") continue;
    try {
      numbers.push(numeric(value));
    } catch (caught) {
      if (caught instanceof FormulaError && caught.code === "#VALUE!") continue;
      throw caught;
    }
  }
  return numbers;
}

function averageOf(values: readonly number[]): number {
  if (values.length === 0) throw new FormulaError("#DIV/0!");
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) throw new FormulaError("#NUM!");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/* --------------------------------- 财务 --------------------------------- */

/**
 * The shared annuity identity behind PMT / PV / FV / NPER. `type` is 0 for
 * payments at period end and 1 for the beginning, as in Excel.
 */
function annuityFactor(rate: number, periods: number, type: number): number {
  if (rate === 0) return periods;
  return ((1 - (1 + rate) ** -periods) / rate) * (1 + rate * type);
}

function paymentOf(
  rate: number,
  periods: number,
  present: number,
  future: number,
  type: number,
): number {
  if (periods === 0) throw new FormulaError("#NUM!");
  if (rate === 0) return -(present + future) / periods;
  const growth = (1 + rate) ** periods;
  return (
    (-(present * growth + future) * rate) / ((growth - 1) * (1 + rate * type))
  );
}

function futureValueOf(
  rate: number,
  periods: number,
  payment: number,
  present: number,
  type: number,
): number {
  if (rate === 0) return -(present + payment * periods);
  const growth = (1 + rate) ** periods;
  return -(present * growth + payment * (1 + rate * type) * ((growth - 1) / rate));
}

/** Remaining balance after `period` payments — the base for IPMT / PPMT. */
function balanceAfter(
  rate: number,
  period: number,
  payment: number,
  present: number,
  type: number,
): number {
  return futureValueOf(rate, period, payment, present, type);
}

/** Bisection again, for the same reproducibility reason as {@link irr}. */
function solveRate(
  evaluate: (rate: number) => number,
  low: number,
  high: number,
): number {
  let lowRate = low;
  let highRate = high;
  let lowValue = evaluate(lowRate);
  let highValue = evaluate(highRate);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) {
    throw new FormulaError("#NUM!");
  }
  if (lowValue * highValue > 0) throw new FormulaError("#NUM!");
  for (let step = 0; step < GRID_IRR_MAX_ITERATIONS; step += 1) {
    const middle = (lowRate + highRate) / 2;
    const value = evaluate(middle);
    if (Math.abs(value) < 1e-10) return middle;
    if (lowValue * value <= 0) {
      highRate = middle;
      highValue = value;
    } else {
      lowRate = middle;
      lowValue = value;
    }
  }
  void highValue;
  return (lowRate + highRate) / 2;
}

function serialsFrom(args: readonly Arg[], position: number): number[] {
  return requireRange(args, position)
    .flat()
    .filter((value) => !isBlank(value))
    .map((value) => requireSerial(numeric(value)));
}

/**
 * What the dispatcher may be handed. Wider than the whitelist because a
 * volatile name is dispatched too — it is gated on the recalc stamp at the
 * call site (§规范三) rather than by whitelist membership, so it reaches this
 * switch with a stamp already required.
 */
type GridDispatchedFunction = GridFormulaFunction | GridVolatileFunction;

function applyFunction(
  name: GridDispatchedFunction,
  args: readonly Arg[],
  context: GridFormulaContext,
): GridFormulaScalar {
  switch (name) {
    /* ------------------------------ 逻辑 ------------------------------ */
    case "AND":
      return flatten(args).every((value) => truthy(value));
    case "OR":
      return flatten(args).some((value) => truthy(value));
    case "NOT":
      return !truthy(flatten(args)[0] ?? "");
    case "XOR":
      return flatten(args).filter((value) => truthy(value)).length % 2 === 1;
    case "TRUE":
      return true;
    case "FALSE":
      return false;

    /* ------------------------------ 数学 ------------------------------ */
    case "SUM":
      return numbersFrom(args).reduce((total, value) => total + value, 0);
    case "SUMIF":
      return sumIf(args);
    case "SUMIFS": {
      const target = requireRange(args, 0).flat();
      const pairs = criteriaPairs(args, 1);
      return matchingPositions(pairs).reduce((total, position) => {
        const value = target[position];
        if (value === undefined || isBlank(value)) return total;
        return total + finiteNumbers([value]).reduce((a, b) => a + b, 0);
      }, 0);
    }
    case "SUMPRODUCT": {
      const columns = args.map((arg) =>
        arg.kind === "range" ? arg.matrix.flat() : [arg.value],
      );
      const length = Math.max(...columns.map((column) => column.length), 0);
      if (columns.some((column) => column.length !== length)) {
        throw new FormulaError("#VALUE!");
      }
      let total = 0;
      for (let index = 0; index < length; index += 1) {
        let product = 1;
        for (const column of columns) {
          const value = column[index];
          const [asNumber = 0] = finiteNumbers([value ?? ""]);
          product *= asNumber;
        }
        total += product;
      }
      return total;
    }
    case "PRODUCT": {
      const values = numbersFrom(args);
      return values.length
        ? values.reduce((total, value) => total * value, 1)
        : 0;
    }
    case "ABS":
      return Math.abs(scalarNumber(args, 0));
    case "ROUND":
      return roundTo(scalarNumber(args, 0), scalarNumber(args, 1, 0), "half");
    case "ROUNDUP":
      return roundTo(scalarNumber(args, 0), scalarNumber(args, 1, 0), "up");
    case "ROUNDDOWN":
      return roundTo(scalarNumber(args, 0), scalarNumber(args, 1, 0), "down");
    case "MROUND": {
      const multiple = scalarNumber(args, 1);
      if (multiple === 0) return 0;
      const value = scalarNumber(args, 0);
      if (value * multiple < 0) throw new FormulaError("#NUM!");
      return Math.round(value / multiple) * multiple;
    }
    case "CEILING": {
      const value = scalarNumber(args, 0);
      const significance = scalarNumber(args, 1, value < 0 ? -1 : 1);
      if (significance === 0) return 0;
      if (value * significance < 0) throw new FormulaError("#NUM!");
      return Math.ceil(value / significance) * significance;
    }
    case "FLOOR": {
      const value = scalarNumber(args, 0);
      const significance = scalarNumber(args, 1, value < 0 ? -1 : 1);
      if (significance === 0) throw new FormulaError("#DIV/0!");
      if (value * significance < 0) throw new FormulaError("#NUM!");
      return Math.floor(value / significance) * significance;
    }
    case "INT":
      return Math.floor(scalarNumber(args, 0));
    case "TRUNC":
      return roundTo(scalarNumber(args, 0), scalarNumber(args, 1, 0), "down");
    case "MOD": {
      const divisor = scalarNumber(args, 1);
      if (divisor === 0) throw new FormulaError("#DIV/0!");
      const dividend = scalarNumber(args, 0);
      return dividend - divisor * Math.floor(dividend / divisor);
    }
    case "POWER": {
      const result = scalarNumber(args, 0) ** scalarNumber(args, 1);
      if (!Number.isFinite(result)) throw new FormulaError("#NUM!");
      return result;
    }
    case "SQRT": {
      const value = scalarNumber(args, 0);
      if (value < 0) throw new FormulaError("#NUM!");
      return Math.sqrt(value);
    }
    case "SIGN":
      return Math.sign(scalarNumber(args, 0));

    /* ------------------------------ 统计 ------------------------------ */
    case "COUNT":
      return numbersFrom(args).length;
    case "COUNTA":
      return flatten(args).filter((value) => !isBlank(value)).length;
    case "COUNTBLANK":
      return requireRange(args, 0)
        .flat()
        .filter((value) => isBlank(value)).length;
    case "COUNTIF": {
      const range = requireRange(args, 0);
      const criteria = requireScalar(args, 1);
      return range
        .flat()
        .filter((value) => matchesCriteria(value, criteria)).length;
    }
    case "COUNTIFS":
      return matchingPositions(criteriaPairs(args, 0)).length;
    case "AVERAGE":
      return averageOf(numbersFrom(args));
    case "AVERAGEIF": {
      const range = requireRange(args, 0).flat();
      const criteria = requireScalar(args, 1);
      const target = args[2] ? requireRange(args, 2).flat() : range;
      const picked: GridFormulaScalar[] = [];
      range.forEach((value, position) => {
        if (!matchesCriteria(value, criteria)) return;
        const candidate = target[position];
        if (candidate !== undefined) picked.push(candidate);
      });
      return averageOf(finiteNumbers(picked));
    }
    case "AVERAGEIFS": {
      const target = requireRange(args, 0).flat();
      const positions = matchingPositions(criteriaPairs(args, 1));
      return averageOf(
        finiteNumbers(
          positions
            .map((position) => target[position])
            .filter((value): value is GridFormulaScalar => value !== undefined),
        ),
      );
    }
    case "MEDIAN":
      return medianOf(numbersFrom(args));
    case "MIN": {
      const values = numbersFrom(args);
      return values.length ? Math.min(...values) : 0;
    }
    case "MAX": {
      const values = numbersFrom(args);
      return values.length ? Math.max(...values) : 0;
    }
    case "MINIFS":
    case "MAXIFS": {
      const target = requireRange(args, 0).flat();
      const positions = matchingPositions(criteriaPairs(args, 1));
      const values = finiteNumbers(
        positions
          .map((position) => target[position])
          .filter((value): value is GridFormulaScalar => value !== undefined),
      );
      if (values.length === 0) return 0;
      return name === "MINIFS" ? Math.min(...values) : Math.max(...values);
    }
    case "LARGE":
    case "SMALL": {
      const values = finiteNumbers(requireRange(args, 0).flat());
      const k = Math.trunc(scalarNumber(args, 1));
      if (k < 1 || k > values.length) throw new FormulaError("#NUM!");
      const sorted = [...values].sort((left, right) =>
        name === "LARGE" ? right - left : left - right,
      );
      return sorted[k - 1];
    }
    case "RANK": {
      const needle = scalarNumber(args, 0);
      const values = finiteNumbers(requireRange(args, 1).flat());
      const ascending = args[2] ? truthy(requireScalar(args, 2)) : false;
      const sorted = [...values].sort((left, right) =>
        ascending ? left - right : right - left,
      );
      const position = sorted.findIndex((value) => value === needle);
      if (position < 0) throw new FormulaError("#N/A");
      return position + 1;
    }

    /* ------------------------------ 文本 ------------------------------ */
    case "CONCAT":
      return flatten(args).map(textOf).join("");
    case "TEXTJOIN": {
      const delimiter = requireText(args, 0);
      const ignoreEmpty = truthy(requireScalar(args, 1));
      const parts = flatten(args.slice(2)).map(textOf);
      return (ignoreEmpty ? parts.filter((part) => part !== "") : parts).join(
        delimiter,
      );
    }
    case "LEFT": {
      const text = requireText(args, 0);
      return text.slice(0, requirePositiveInteger(scalarNumber(args, 1, 1)));
    }
    case "RIGHT": {
      const text = requireText(args, 0);
      const count = requirePositiveInteger(scalarNumber(args, 1, 1));
      return count === 0 ? "" : text.slice(-count);
    }
    case "MID": {
      const text = requireText(args, 0);
      const start = Math.trunc(scalarNumber(args, 1));
      if (start < 1) throw new FormulaError("#VALUE!");
      const count = requirePositiveInteger(scalarNumber(args, 2));
      return text.slice(start - 1, start - 1 + count);
    }
    case "LEN":
      return requireText(args, 0).length;
    case "FIND": {
      const needle = requireText(args, 0);
      const haystack = requireText(args, 1);
      const start = Math.trunc(scalarNumber(args, 2, 1));
      if (start < 1) throw new FormulaError("#VALUE!");
      const position = haystack.indexOf(needle, start - 1);
      if (position < 0) throw new FormulaError("#VALUE!");
      return position + 1;
    }
    case "SEARCH": {
      const needle = requireText(args, 0);
      const haystack = requireText(args, 1);
      const start = Math.trunc(scalarNumber(args, 2, 1));
      if (start < 1) throw new FormulaError("#VALUE!");
      if (needle.includes("*") || needle.includes("?")) {
        const pattern = wildcardToRegExp(`*${needle}*`);
        if (!pattern.test(haystack.slice(start - 1))) {
          throw new FormulaError("#VALUE!");
        }
        return start;
      }
      const position = haystack
        .toLowerCase()
        .indexOf(needle.toLowerCase(), start - 1);
      if (position < 0) throw new FormulaError("#VALUE!");
      return position + 1;
    }
    case "SUBSTITUTE": {
      const text = requireText(args, 0);
      const target = requireText(args, 1);
      const replacement = requireText(args, 2);
      if (target === "") return text;
      if (!args[3]) return text.split(target).join(replacement);
      const instance = Math.trunc(scalarNumber(args, 3));
      if (instance < 1) throw new FormulaError("#VALUE!");
      let seen = 0;
      let cursor = 0;
      for (;;) {
        const position = text.indexOf(target, cursor);
        if (position < 0) return text;
        seen += 1;
        if (seen === instance) {
          return (
            text.slice(0, position) +
            replacement +
            text.slice(position + target.length)
          );
        }
        cursor = position + target.length;
      }
    }
    case "REPLACE": {
      const text = requireText(args, 0);
      const start = Math.trunc(scalarNumber(args, 1));
      if (start < 1) throw new FormulaError("#VALUE!");
      const count = requirePositiveInteger(scalarNumber(args, 2));
      return (
        text.slice(0, start - 1) +
        requireText(args, 3) +
        text.slice(start - 1 + count)
      );
    }
    case "TRIM":
      return requireText(args, 0).replace(/\s+/g, " ").trim();
    case "UPPER":
      return requireText(args, 0).toUpperCase();
    case "LOWER":
      return requireText(args, 0).toLowerCase();
    case "TEXT":
      return formatByPattern(requireScalar(args, 0), requireText(args, 1));
    case "VALUE":
      return numeric(requireScalar(args, 0));
    case "EXACT":
      return textOf(requireScalar(args, 0)) === textOf(requireScalar(args, 1));

    /* ------------------------------ 查找 ------------------------------ */
    case "VLOOKUP":
      return vlookup(args);
    case "HLOOKUP":
      return hlookup(args);
    case "INDEX":
      return index(args);
    case "MATCH":
      return match(args);
    case "ROWS":
      return requireRange(args, 0).length;
    case "COLUMNS":
      return requireRange(args, 0)[0]?.length ?? 0;

    /* ------------------------------ 日期 ------------------------------ */
    case "DATE":
      return normalizedDateSerial(
        Math.trunc(scalarNumber(args, 0)),
        Math.trunc(scalarNumber(args, 1)),
        Math.trunc(scalarNumber(args, 2)),
      );
    case "YEAR":
      return gridSerialToDate(requireSerial(scalarNumber(args, 0))).year;
    case "MONTH":
      return gridSerialToDate(requireSerial(scalarNumber(args, 0))).month;
    case "DAY":
      return gridSerialToDate(requireSerial(scalarNumber(args, 0))).day;
    case "HOUR":
      return Math.floor(
        serialDayFraction(requireSerial(scalarNumber(args, 0))) * 24,
      );
    case "MINUTE":
      return Math.floor(
        (serialDayFraction(requireSerial(scalarNumber(args, 0))) * 1440) % 60,
      );
    case "SECOND":
      return Math.round(
        (serialDayFraction(requireSerial(scalarNumber(args, 0))) * 86_400) % 60,
      );
    case "WEEKDAY": {
      const sunday = weekdayIndex(requireSerial(scalarNumber(args, 0)));
      const type = Math.trunc(scalarNumber(args, 1, 1));
      if (type === 1) return sunday + 1;
      if (type === 2) return ((sunday + 6) % 7) + 1;
      if (type === 3) return (sunday + 6) % 7;
      throw new FormulaError("#NUM!");
    }
    case "WEEKNUM": {
      const serial = requireSerial(scalarNumber(args, 0));
      const type = Math.trunc(scalarNumber(args, 1, 1));
      if (type !== 1 && type !== 2) throw new FormulaError("#NUM!");
      const { year } = gridSerialToDate(serial);
      const firstOfYear = gridDateToSerial(year, 1, 1);
      const offset = type === 1 ? 0 : 6;
      const firstIndex = (weekdayIndex(firstOfYear) + offset) % 7;
      return (
        Math.floor((Math.floor(serial) - firstOfYear + firstIndex) / 7) + 1
      );
    }
    case "EDATE":
    case "EOMONTH": {
      const { year, month } = gridSerialToDate(
        requireSerial(scalarNumber(args, 0)),
      );
      const day = gridSerialToDate(requireSerial(scalarNumber(args, 0))).day;
      const shift = Math.trunc(scalarNumber(args, 1));
      const total = year * 12 + (month - 1) + shift;
      const targetYear = Math.floor(total / 12);
      const targetMonth = total - targetYear * 12 + 1;
      const lastDay =
        daysFromCivil(
          targetMonth === 12 ? targetYear + 1 : targetYear,
          targetMonth === 12 ? 1 : targetMonth + 1,
          1,
        ) - daysFromCivil(targetYear, targetMonth, 1);
      if (name === "EOMONTH") {
        return requireSerial(gridDateToSerial(targetYear, targetMonth, lastDay));
      }
      return requireSerial(
        gridDateToSerial(targetYear, targetMonth, Math.min(day, lastDay)),
      );
    }
    case "DATEDIF": {
      const start = gridSerialToDate(requireSerial(scalarNumber(args, 0)));
      const endSerial = requireSerial(scalarNumber(args, 1));
      const end = gridSerialToDate(endSerial);
      const unit = requireText(args, 2).toUpperCase();
      const startSerial = requireSerial(scalarNumber(args, 0));
      if (endSerial < startSerial) throw new FormulaError("#NUM!");
      const wholeMonths =
        (end.year - start.year) * 12 +
        (end.month - start.month) -
        (end.day < start.day ? 1 : 0);
      switch (unit) {
        case "D":
          return Math.floor(endSerial) - Math.floor(startSerial);
        case "M":
          return wholeMonths;
        case "Y":
          return Math.floor(wholeMonths / 12);
        case "YM":
          return wholeMonths % 12;
        case "MD":
          return end.day >= start.day
            ? end.day - start.day
            : end.day +
                (daysFromCivil(
                  end.month === 1 ? end.year - 1 : end.year,
                  end.month === 1 ? 12 : end.month - 1,
                  1,
                ) === 0
                  ? 0
                  : daysFromCivil(end.year, end.month, 1) -
                    daysFromCivil(
                      end.month === 1 ? end.year - 1 : end.year,
                      end.month === 1 ? 12 : end.month - 1,
                      1,
                    )) -
                start.day;
        case "YD":
          return (
            Math.floor(endSerial) -
            gridDateToSerial(
              end.year - (end.month < start.month ? 1 : 0),
              start.month,
              start.day,
            )
          );
        default:
          throw new FormulaError("#NUM!");
      }
    }
    case "DAYS":
      return (
        Math.floor(requireSerial(scalarNumber(args, 0))) -
        Math.floor(requireSerial(scalarNumber(args, 1)))
      );
    case "NETWORKDAYS": {
      const start = Math.floor(requireSerial(scalarNumber(args, 0)));
      const end = Math.floor(requireSerial(scalarNumber(args, 1)));
      const holidays = new Set(
        args[2] ? serialsFrom(args, 2).map((value) => Math.floor(value)) : [],
      );
      const step = end >= start ? 1 : -1;
      let count = 0;
      for (let serial = start; step > 0 ? serial <= end : serial >= end; serial += step) {
        const weekday = weekdayIndex(serial);
        if (weekday === 0 || weekday === 6) continue;
        if (holidays.has(serial)) continue;
        count += 1;
      }
      return step > 0 ? count : -count;
    }
    case "WORKDAY": {
      let serial = Math.floor(requireSerial(scalarNumber(args, 0)));
      let remaining = Math.trunc(scalarNumber(args, 1));
      const holidays = new Set(
        args[2] ? serialsFrom(args, 2).map((value) => Math.floor(value)) : [],
      );
      const step = remaining >= 0 ? 1 : -1;
      remaining = Math.abs(remaining);
      while (remaining > 0) {
        serial += step;
        const weekday = weekdayIndex(serial);
        if (weekday === 0 || weekday === 6) continue;
        if (holidays.has(serial)) continue;
        remaining -= 1;
      }
      return requireSerial(serial);
    }
    case "DATEVALUE": {
      const parsed = requireText(args, 0).trim().match(DATE_TEXT);
      if (!parsed) throw new FormulaError("#VALUE!");
      return requireSerial(
        gridDateToSerial(
          Number(parsed[1]),
          Number(parsed[2]),
          Number(parsed[3]),
        ),
      );
    }
    case "TIME": {
      const seconds =
        Math.trunc(scalarNumber(args, 0)) * 3600 +
        Math.trunc(scalarNumber(args, 1)) * 60 +
        Math.trunc(scalarNumber(args, 2));
      return (((seconds % 86_400) + 86_400) % 86_400) / 86_400;
    }

    /* ------------------------------ 财务 ------------------------------ */
    case "NPV":
      return npv(scalarNumber(args, 0), numbersFrom(args.slice(1)));
    case "IRR":
      return irr(numbersFrom(args.slice(0, 1)), scalarNumber(args, 1, 0.1));
    case "XNPV": {
      const rate = scalarNumber(args, 0);
      const values = finiteNumbers(requireRange(args, 1).flat());
      const dates = serialsFrom(args, 2);
      if (values.length !== dates.length || values.length === 0) {
        throw new FormulaError("#NUM!");
      }
      return values.reduce(
        (total, value, position) =>
          total + value / (1 + rate) ** ((dates[position] - dates[0]) / 365),
        0,
      );
    }
    case "XIRR": {
      const values = finiteNumbers(requireRange(args, 0).flat());
      const dates = serialsFrom(args, 1);
      if (values.length !== dates.length || values.length === 0) {
        throw new FormulaError("#NUM!");
      }
      return solveRate(
        (rate) =>
          values.reduce(
            (total, value, position) =>
              total + value / (1 + rate) ** ((dates[position] - dates[0]) / 365),
            0,
          ),
        -0.9999,
        1000,
      );
    }
    case "PMT":
      return paymentOf(
        scalarNumber(args, 0),
        scalarNumber(args, 1),
        scalarNumber(args, 2),
        scalarNumber(args, 3, 0),
        scalarNumber(args, 4, 0),
      );
    case "IPMT":
    case "PPMT": {
      const rate = scalarNumber(args, 0);
      const period = Math.trunc(scalarNumber(args, 1));
      const periods = scalarNumber(args, 2);
      const present = scalarNumber(args, 3);
      const future = scalarNumber(args, 4, 0);
      const type = scalarNumber(args, 5, 0);
      if (period < 1 || period > periods) throw new FormulaError("#NUM!");
      const payment = paymentOf(rate, periods, present, future, type);
      const opening = balanceAfter(rate, period - 1, payment, present, type);
      // `balanceAfter` already reports the outstanding principal with Excel's
      // sign flip applied, so the interest carries the same sign as the payment
      // and `IPMT + PPMT = PMT` holds. Negating here made the two sides of that
      // identity disagree while each still looked plausible on its own.
      const interest = period === 1 && type === 1 ? 0 : opening * rate;
      return name === "IPMT" ? interest : payment - interest;
    }
    case "PV": {
      const rate = scalarNumber(args, 0);
      const periods = scalarNumber(args, 1);
      const payment = scalarNumber(args, 2);
      const future = scalarNumber(args, 3, 0);
      const type = scalarNumber(args, 4, 0);
      if (rate === 0) return -(future + payment * periods);
      return (
        -(future + payment * annuityFactor(rate, periods, type) * (1 + rate) ** periods) /
        (1 + rate) ** periods
      );
    }
    case "FV":
      return futureValueOf(
        scalarNumber(args, 0),
        scalarNumber(args, 1),
        scalarNumber(args, 2),
        scalarNumber(args, 3, 0),
        scalarNumber(args, 4, 0),
      );
    case "RATE": {
      const periods = scalarNumber(args, 0);
      const payment = scalarNumber(args, 1);
      const present = scalarNumber(args, 2);
      const future = scalarNumber(args, 3, 0);
      const type = scalarNumber(args, 4, 0);
      return solveRate(
        (rate) => futureValueOf(rate, periods, payment, present, type) - future,
        -0.9999,
        10,
      );
    }
    case "NPER": {
      const rate = scalarNumber(args, 0);
      const payment = scalarNumber(args, 1);
      const present = scalarNumber(args, 2);
      const future = scalarNumber(args, 3, 0);
      const type = scalarNumber(args, 4, 0);
      if (rate === 0) {
        if (payment === 0) throw new FormulaError("#NUM!");
        return -(present + future) / payment;
      }
      const adjusted = payment * (1 + rate * type);
      const ratio = (adjusted - future * rate) / (present * rate + adjusted);
      if (!(ratio > 0)) throw new FormulaError("#NUM!");
      return Math.log(ratio) / Math.log(1 + rate);
    }
    case "SLN": {
      const life = scalarNumber(args, 2);
      if (life === 0) throw new FormulaError("#DIV/0!");
      return (scalarNumber(args, 0) - scalarNumber(args, 1)) / life;
    }
    case "SYD": {
      const cost = scalarNumber(args, 0);
      const salvage = scalarNumber(args, 1);
      const life = scalarNumber(args, 2);
      const period = scalarNumber(args, 3);
      if (life <= 0) throw new FormulaError("#NUM!");
      if (period < 1 || period > life) throw new FormulaError("#NUM!");
      return (
        ((cost - salvage) * (life - period + 1) * 2) / (life * (life + 1))
      );
    }
    case "DDB": {
      const cost = scalarNumber(args, 0);
      const salvage = scalarNumber(args, 1);
      const life = scalarNumber(args, 2);
      const period = scalarNumber(args, 3);
      const factor = scalarNumber(args, 4, 2);
      if (life <= 0 || period < 1 || period > life) {
        throw new FormulaError("#NUM!");
      }
      let accumulated = 0;
      let amount = 0;
      for (let step = 1; step <= period; step += 1) {
        amount = Math.min(
          ((cost - accumulated) * factor) / life,
          Math.max(cost - salvage - accumulated, 0),
        );
        accumulated += amount;
      }
      return amount;
    }
    case "DB": {
      const cost = scalarNumber(args, 0);
      const salvage = scalarNumber(args, 1);
      const life = scalarNumber(args, 2);
      const period = scalarNumber(args, 3);
      const months = scalarNumber(args, 4, 12);
      if (life <= 0 || period < 1 || cost <= 0) {
        throw new FormulaError("#NUM!");
      }
      const rate = roundTo(1 - (salvage / cost) ** (1 / life), 3, "half");
      let accumulated = (cost * rate * months) / 12;
      if (period === 1) return accumulated;
      let amount = 0;
      for (let step = 2; step <= period; step += 1) {
        amount =
          step === Math.ceil(life) + 1
            ? ((cost - accumulated) * rate * (12 - months)) / 12
            : (cost - accumulated) * rate;
        accumulated += amount;
      }
      return amount;
    }

    /* ------------------------------ 信息 ------------------------------ */
    case "ISBLANK":
      return requireScalar(args, 0) === "";
    case "ISNUMBER":
      return typeof requireScalar(args, 0) === "number";
    case "ISTEXT": {
      const value = requireScalar(args, 0);
      return typeof value === "string" && value !== "";
    }
    case "ISLOGICAL":
      return typeof requireScalar(args, 0) === "boolean";
    case "ISEVEN":
      return Math.abs(Math.trunc(scalarNumber(args, 0))) % 2 === 0;
    case "ISODD":
      return Math.abs(Math.trunc(scalarNumber(args, 0))) % 2 === 1;
    case "N": {
      const value = requireScalar(args, 0);
      if (typeof value === "number") return value;
      if (typeof value === "boolean") return value ? 1 : 0;
      return 0;
    }
    case "NA":
      throw new FormulaError("#N/A");
    case "TYPE": {
      const value = requireScalar(args, 0);
      if (typeof value === "number") return 1;
      if (typeof value === "boolean") return 4;
      return typeof value === "string" && /^#[A-Z0-9/!?]+$/.test(value) ? 16 : 2;
    }

    /* ---------------------- volatile（§规范三，需要戳） ---------------------- */
    case "TODAY":
      return Math.floor(serialFromIsoInstant(requireRecalc(context).at));
    case "NOW":
      return serialFromIsoInstant(requireRecalc(context).at);
    case "RAND":
      return volatileDraw(context);
    case "RANDBETWEEN": {
      const low = Math.trunc(scalarNumber(args, 0));
      const high = Math.trunc(scalarNumber(args, 1));
      if (high < low) throw new FormulaError("#NUM!");
      return low + Math.floor(volatileDraw(context) * (high - low + 1));
    }

    default:
      throw new FormulaError("#NAME?");
  }
}

function hlookup(args: readonly Arg[]): GridFormulaScalar {
  const needle = requireScalar(args, 0);
  const table = requireRange(args, 1);
  const rowNumber = Math.trunc(scalarNumber(args, 2));
  const approximate = args[3] ? truthy(requireScalar(args, 3)) : true;
  if (rowNumber < 1) throw new FormulaError("#VALUE!");
  const header = table[0] ?? [];
  let best = -1;
  for (let column = 0; column < header.length; column += 1) {
    const compared = compareScalars(header[column], needle);
    if (compared === 0) {
      const row = table[rowNumber - 1];
      const cell = row?.[column];
      if (cell === undefined) throw new FormulaError("#REF!");
      return cell;
    }
    if (approximate && compared < 0) best = column;
  }
  if (best >= 0) {
    const cell = table[rowNumber - 1]?.[best];
    if (cell === undefined) throw new FormulaError("#REF!");
    return cell;
  }
  throw new FormulaError("#N/A");
}

function scalarNumber(
  args: readonly Arg[],
  position: number,
  fallback?: number,
): number {
  const arg = args[position];
  if (!arg) {
    if (fallback === undefined) throw new FormulaError("#VALUE!");
    return fallback;
  }
  const value = arg.kind === "scalar" ? arg.value : arg.matrix.flat()[0];
  if (value === undefined) throw new FormulaError("#VALUE!");
  return numeric(value);
}

function requireScalar(
  args: readonly Arg[],
  position: number,
): GridFormulaScalar {
  const arg = args[position];
  if (!arg) throw new FormulaError("#VALUE!");
  return arg.kind === "scalar" ? arg.value : (arg.matrix.flat()[0] ?? "");
}

function requireRange(
  args: readonly Arg[],
  position: number,
): GridFormulaScalar[][] {
  const arg = args[position];
  if (!arg) throw new FormulaError("#REF!");
  return arg.kind === "range" ? arg.matrix : [[arg.value]];
}

function sumIf(args: readonly Arg[]): number {
  const range = requireRange(args, 0);
  const criteria = requireScalar(args, 1);
  const target = args[2] ? requireRange(args, 2) : range;
  const flatRange = range.flat();
  const flatTarget = target.flat();
  let total = 0;
  flatRange.forEach((value, position) => {
    if (!matchesCriteria(value, criteria)) return;
    const candidate = flatTarget[position];
    if (candidate === undefined || isBlank(candidate)) return;
    try {
      total += numeric(candidate);
    } catch (caught) {
      if (!(caught instanceof FormulaError) || caught.code !== "#VALUE!") {
        throw caught;
      }
    }
  });
  return total;
}

function vlookup(args: readonly Arg[]): GridFormulaScalar {
  const needle = requireScalar(args, 0);
  const table = requireRange(args, 1);
  const column = Math.trunc(scalarNumber(args, 2));
  const approximate = args[3] ? truthy(requireScalar(args, 3)) : true;
  if (column < 1) throw new FormulaError("#VALUE!");
  let best: GridFormulaScalar[] | null = null;
  for (const row of table) {
    const key = row[0];
    if (key === undefined) continue;
    const compared = compareScalars(key, needle);
    if (compared === 0) {
      const cell = row[column - 1];
      if (cell === undefined) throw new FormulaError("#REF!");
      return cell;
    }
    if (approximate && compared < 0) best = row;
  }
  if (best) {
    const cell = best[column - 1];
    if (cell === undefined) throw new FormulaError("#REF!");
    return cell;
  }
  throw new FormulaError("#N/A");
}

function index(args: readonly Arg[]): GridFormulaScalar {
  const matrix = requireRange(args, 0);
  const rowNumber = Math.trunc(scalarNumber(args, 1, 1));
  const single = matrix.length === 1 || (matrix[0]?.length ?? 0) === 1;
  const columnNumber = args[2]
    ? Math.trunc(scalarNumber(args, 2))
    : single
      ? 1
      : 0;
  if (single && !args[2]) {
    const flat = matrix.flat();
    const value = flat[rowNumber - 1];
    if (value === undefined) throw new FormulaError("#REF!");
    return value;
  }
  const row = matrix[rowNumber - 1];
  if (!row) throw new FormulaError("#REF!");
  const value = row[columnNumber - 1];
  if (value === undefined) throw new FormulaError("#REF!");
  return value;
}

function match(args: readonly Arg[]): number {
  const needle = requireScalar(args, 0);
  const flat = requireRange(args, 1).flat();
  const type = args[2] ? Math.trunc(scalarNumber(args, 2)) : 1;
  if (type === 0) {
    const position = flat.findIndex(
      (value) => compareScalars(value, needle) === 0,
    );
    if (position < 0) throw new FormulaError("#N/A");
    return position + 1;
  }
  let found = -1;
  flat.forEach((value, position) => {
    const compared = compareScalars(value, needle);
    if (type > 0 ? compared <= 0 : compared >= 0) found = position;
  });
  if (found < 0) throw new FormulaError("#N/A");
  return found + 1;
}

function evaluateFormulaSource(
  source: string,
  rows: readonly (readonly string[])[],
  visiting: Set<string>,
  context: GridFormulaContext,
  depth: number,
): GridFormulaScalar {
  return new Parser(tokenize(source), rows, visiting, context, depth).parse();
}

export interface GridFormulaResult {
  ok: boolean;
  /** Typed value on success; the Excel error code string on failure. */
  value: GridFormulaScalar;
  code?: string;
}

/**
 * Typed single-cell evaluation. The XLSX writer needs this rather than
 * `evaluateGridCell` because `<v>` has to be tagged `t="str"` / `t="b"` when
 * the cached value is not a number (§3.2 `computed → emitted`).
 */
export function evaluateGridCellTyped(
  rows: readonly (readonly string[])[],
  row: number,
  col: number,
  context: GridFormulaContext = {},
): GridFormulaResult {
  const raw = rows[row]?.[col] ?? "";
  if (!raw.startsWith("=")) return { ok: true, value: raw };
  const visiting = new Set([`${context.sheetName || ""}!${row}:${col}`]);
  try {
    return {
      ok: true,
      value: evaluateFormulaSource(
        raw.slice(1),
        rows,
        visiting,
        { ...context, cell: { row, col }, volatileCalls: { count: 0 } },
        0,
      ),
    };
  } catch (caught) {
    const code = caught instanceof FormulaError ? caught.code : "#VALUE!";
    return { ok: false, value: code, code };
  }
}

function scalarToValue(value: GridFormulaScalar): GridFormulaValue {
  return typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : value;
}

/**
 * Evaluate a small, deterministic spreadsheet subset without `eval`.
 *
 * @deprecated Use {@link evaluateGridCellInWorkbook}. A `rows`-only call cannot
 * reach a sibling sheet, so `Sheet2!B3` resolves to `#REF!` however correct the
 * formula is — that is the defect §规范一 exists to close, and 21.0% of the
 * 42,928 formulas in the 456-workbook corpus carry a qualified reference.
 * `tests/grid-formula-legacy-entry.test.mjs` pins the surviving call sites so a
 * later change cannot quietly reintroduce one.
 */
export function evaluateGridCell(
  rows: readonly (readonly string[])[],
  row: number,
  col: number,
  context: GridFormulaContext = {},
): GridFormulaValue {
  return scalarToValue(evaluateGridCellTyped(rows, row, col, context).value);
}

/** Adapt a workbook context to the flat context the parser consumes. */
function workbookFormulaContext(
  workbook: GridWorkbookContext,
  sheetRef: string,
): GridFormulaContext {
  return {
    sheetName: sheetRef,
    sheetResolver: (name) => workbook.sheetRows(name) ?? null,
    namedRangeResolver: (name) => workbook.namedRange(name) ?? null,
    recalc: workbook.recalc,
  };
}

/**
 * Typed workbook-aware evaluation (§规范一).
 *
 * An unknown sheet yields `#REF!` — the same code a dangling A1 reference
 * produces — rather than `undefined`, so no caller has to tell "no such sheet"
 * apart from "no such cell" by probing for a missing value.
 */
export function evaluateGridCellInWorkbookTyped(
  workbook: GridWorkbookContext,
  sheetRef: string,
  row: number,
  col: number,
): GridFormulaResult {
  const rows = workbook.sheetRows(sheetRef);
  if (!rows) return { ok: false, value: "#REF!", code: "#REF!" };
  return evaluateGridCellTyped(
    rows,
    row,
    col,
    workbookFormulaContext(workbook, sheetRef),
  );
}

/**
 * Workbook-aware evaluation (§规范一) — the entry the editor canvas uses.
 *
 * This is what makes `Sheet2!B3` show a number on screen instead of `#REF!`.
 * The parsing layer could always read a qualified reference; it was the
 * evaluation entry that had nowhere to put the sibling sheets.
 */
export function evaluateGridCellInWorkbook(
  workbook: GridWorkbookContext,
  sheetRef: string,
  row: number,
  col: number,
): GridFormulaValue {
  return scalarToValue(
    evaluateGridCellInWorkbookTyped(workbook, sheetRef, row, col).value,
  );
}

/* ------------------------- 增量重算（P4 / §规范五） ------------------------- */

/** One cell, workbook-wide. */
export interface GridCellRef {
  sheet: string;
  row: number;
  col: number;
}

function cellKey(sheet: string, row: number, col: number): string {
  return `${sheet.toLowerCase()}\u0000${row}\u0000${col}`;
}

interface RangeEdge {
  sheet: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
  dependent: string;
}

/**
 * Who reads whom, so an edit can recompute the cells that actually depend on it
 * instead of the whole sheet.
 *
 * Ranges are kept as rectangles rather than expanded into their member cells.
 * A single `SUM(A1:A5000)` would otherwise put 5,000 entries in the index, and
 * a sheet full of them turns graph construction into the very cost the
 * incremental path exists to avoid.
 */
export interface GridDependencyGraph {
  /** Every formula cell found, in row-major order per sheet. */
  readonly formulaCells: readonly GridCellRef[];
  /** Formula cells whose answer moves when the recalc stamp is re-issued. */
  readonly volatileCells: readonly GridCellRef[];
  /** Direct precedents of a formula cell, as recorded at build time. */
  precedentsOf(ref: GridCellRef): readonly GridCellRef[];
  /** Formula cells that read `ref`, directly. */
  dependentsOf(ref: GridCellRef): readonly GridCellRef[];
}

function expandReference(
  reference: string,
  ownSheet: string,
): { sheet: string; row: number; col: number } | null {
  const separator = reference.indexOf("!");
  const sheet =
    separator >= 0
      ? reference.slice(0, separator).replace(/^'|'$/g, "")
      : ownSheet;
  const body = separator >= 0 ? reference.slice(separator + 1) : reference;
  const position = parseGridReference(body);
  return position ? { sheet, ...position } : null;
}

/**
 * Index one workbook's formulas. Cost is linear in the number of cells, paid
 * once per structural change; an edit then costs only the subgraph it touches.
 */
export function buildGridDependencyGraph(
  workbook: GridWorkbookContext,
  sheetRefs: readonly string[],
): GridDependencyGraph {
  const formulaCells: GridCellRef[] = [];
  const volatileCells: GridCellRef[] = [];
  const precedents = new Map<string, GridCellRef[]>();
  const cellEdges = new Map<string, string[]>();
  const rangeEdges: RangeEdge[] = [];
  const byKey = new Map<string, GridCellRef>();
  const stamped = Boolean(workbook.recalc);

  for (const sheetRef of sheetRefs) {
    const rows = workbook.sheetRows(sheetRef);
    if (!rows) continue;
    for (let row = 0; row < rows.length; row += 1) {
      const line = rows[row] ?? [];
      for (let col = 0; col < line.length; col += 1) {
        const raw = line[col];
        if (typeof raw !== "string" || !raw.startsWith("=")) continue;
        const self: GridCellRef = { sheet: sheetRef, row, col };
        const key = cellKey(sheetRef, row, col);
        formulaCells.push(self);
        byKey.set(key, self);

        const inspection = inspectGridFormula(
          raw,
          stamped ? { recalc: workbook.recalc } : {},
        );
        if (inspection.volatileFunctions.length > 0) volatileCells.push(self);

        const mine: GridCellRef[] = [];
        const addPoint = (reference: string) => {
          const target = expandReference(reference, sheetRef);
          if (!target) return;
          mine.push(target);
          const targetKey = cellKey(target.sheet, target.row, target.col);
          const list = cellEdges.get(targetKey);
          if (list) list.push(key);
          else cellEdges.set(targetKey, [key]);
        };
        for (const reference of inspection.references) addPoint(reference);
        for (const reference of inspection.qualifiedReferences) {
          addPoint(reference);
        }
        for (const range of inspection.ranges) {
          const [start, end] = range.split(":");
          const from = expandReference(start ?? "", sheetRef);
          const to = expandReference(end ?? "", from?.sheet ?? sheetRef);
          if (!from || !to) continue;
          rangeEdges.push({
            sheet: from.sheet,
            top: Math.min(from.row, to.row),
            left: Math.min(from.col, to.col),
            bottom: Math.max(from.row, to.row),
            right: Math.max(from.col, to.col),
            dependent: key,
          });
        }
        precedents.set(key, mine);
      }
    }
  }

  const resolve = (keys: readonly string[]): GridCellRef[] => {
    const out: GridCellRef[] = [];
    for (const key of keys) {
      const found = byKey.get(key);
      if (found) out.push(found);
    }
    return out;
  };

  return {
    formulaCells,
    volatileCells,
    precedentsOf: (ref) => precedents.get(cellKey(ref.sheet, ref.row, ref.col)) ?? [],
    dependentsOf: (ref) => {
      const key = cellKey(ref.sheet, ref.row, ref.col);
      const keys = new Set(cellEdges.get(key) ?? []);
      const sheet = ref.sheet.toLowerCase();
      for (const edge of rangeEdges) {
        if (edge.sheet.toLowerCase() !== sheet) continue;
        if (ref.row < edge.top || ref.row > edge.bottom) continue;
        if (ref.col < edge.left || ref.col > edge.right) continue;
        keys.add(edge.dependent);
      }
      return resolve([...keys]);
    },
  };
}

/**
 * The cells an edit forces to move, in an order where every cell comes after
 * the precedents it shares the plan with.
 *
 * A cycle cannot be ordered; those cells are appended in discovery order and
 * left for the evaluator, which already reports the cycle as an error value
 * rather than spinning.
 */
export function planGridRecalc(
  graph: GridDependencyGraph,
  changed: readonly GridCellRef[],
): GridCellRef[] {
  const affected = new Map<string, GridCellRef>();
  const queue = [...changed];
  while (queue.length > 0) {
    const current = queue.pop() as GridCellRef;
    for (const dependent of graph.dependentsOf(current)) {
      const key = cellKey(dependent.sheet, dependent.row, dependent.col);
      if (affected.has(key)) continue;
      affected.set(key, dependent);
      queue.push(dependent);
    }
  }

  const ordered: GridCellRef[] = [];
  const state = new Map<string, "open" | "done">();
  const visit = (ref: GridCellRef): void => {
    const key = cellKey(ref.sheet, ref.row, ref.col);
    if (!affected.has(key) || state.get(key)) return;
    state.set(key, "open");
    for (const precedent of graph.precedentsOf(ref)) visit(precedent);
    state.set(key, "done");
    ordered.push(ref);
  };
  for (const ref of affected.values()) visit(ref);
  return ordered;
}

/**
 * Recompute exactly {@link planGridRecalc}'s subgraph. Returns the new values
 * keyed by `sheet!A1`-style address so a caller can patch its own store.
 */
export function recalcGridWorkbook(
  workbook: GridWorkbookContext,
  graph: GridDependencyGraph,
  changed: readonly GridCellRef[],
): Map<string, GridFormulaValue> {
  const results = new Map<string, GridFormulaValue>();
  for (const ref of planGridRecalc(graph, changed)) {
    results.set(
      `${ref.sheet}!${ref.row}:${ref.col}`,
      evaluateGridCellInWorkbook(workbook, ref.sheet, ref.row, ref.col),
    );
  }
  return results;
}

const ZERO_COMPARISONS = new Set(["=", "<>", ">", "<", ">=", "<="]);

/**
 * The tokens of the first argument of the call whose `(` sits at `open` — for
 * an `IF`, that is its condition. Stops at the comma that ends the argument.
 */
function firstArgumentTokens(
  tokens: readonly Token[],
  open: number,
): Token[] {
  const argument: Token[] = [];
  let nested = 0;
  for (let index = open + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (isOperator(token, "(")) nested += 1;
    else if (isOperator(token, ")")) {
      if (nested === 0) break;
      nested -= 1;
    } else if ((isOperator(token, ",") || isOperator(token, ";")) && nested === 0) {
      break;
    }
    argument.push(token);
  }
  return argument;
}

/**
 * Does `condition` compare `denominator` against the literal 0? This is the
 * `=IF(C2=0,0,B2/C2)` shape, which is a real guard: the division is only
 * reached on the branch where the denominator is known non-zero.
 */
function comparesToZero(
  condition: readonly Token[],
  denominator: string,
): boolean {
  const isDenominator = (token: Token | undefined) =>
    token !== undefined &&
    (token.type === "cell" ||
      token.type === "qualified" ||
      token.type === "name") &&
    token.value === denominator;
  const isZero = (token: Token | undefined) =>
    token !== undefined && token.type === "number" && token.value === 0;
  for (let index = 0; index < condition.length; index += 1) {
    const token = condition[index];
    if (token.type !== "operator" || !ZERO_COMPARISONS.has(token.value)) {
      continue;
    }
    const left = condition[index - 1];
    const right = condition[index + 1];
    if (
      (isDenominator(left) && isZero(right)) ||
      (isZero(left) && isDenominator(right))
    ) {
      return true;
    }
  }
  return false;
}

function pushViolation(
  violations: GridFormulaViolation[],
  code: GridFormulaRejectionCode,
  detail: string,
): void {
  if (
    violations.some(
      (entry) => entry.code === code && entry.detail === detail,
    )
  ) {
    return;
  }
  violations.push({ code, detail });
}

/**
 * Static §3.3 gate. Runs without a workbook, so the generator, the editor and
 * the import path can all reach the same verdict on one formula string.
 */
export function inspectGridFormula(
  input: string,
  options: GridFormulaInspectOptions = {},
): GridFormulaInspection {
  const source = String(input ?? "").replace(/^=/, "").trim();
  const stamped = Boolean(options.recalc);
  const violations: GridFormulaViolation[] = [];
  const functions: string[] = [];
  const references: string[] = [];
  const absoluteReferences: string[] = [];
  const ranges: string[] = [];
  const qualifiedReferences: string[] = [];
  const names: string[] = [];
  const volatileFunctions: string[] = [];
  if (!source) {
    return {
      ok: false,
      source,
      functions,
      references,
      absoluteReferences,
      ranges,
      qualifiedReferences,
      names,
      volatileFunctions,
      violations: [
        { code: GRID_FORMULA_REJECTION_CODES.empty, detail: "公式为空" },
      ],
    };
  }
  if (source.length > GRID_FORMULA_MAX_LENGTH) {
    pushViolation(
      violations,
      GRID_FORMULA_REJECTION_CODES.tooLong,
      `${source.length} > ${GRID_FORMULA_MAX_LENGTH}（§4 C12）`,
    );
  }
  let tokens: Token[];
  try {
    tokens = tokenize(source);
  } catch {
    return {
      ok: false,
      source,
      functions,
      references,
      absoluteReferences,
      ranges,
      qualifiedReferences,
      names,
      volatileFunctions,
      violations: [
        ...violations,
        { code: GRID_FORMULA_REJECTION_CODES.syntax, detail: "无法词法解析" },
      ],
    };
  }
  const nondeterministic = new Set<string>(GRID_NONDETERMINISTIC_FUNCTIONS);
  const unreachable = new Set<string>(GRID_UNREACHABLE_FUNCTIONS);
  const macros = new Set<string>(GRID_MACRO_FUNCTIONS);
  /** Paren balance, tracked separately from `callStack` so `=SUM(` is caught. */
  let depth = 0;
  let unbalanced = false;
  /**
   * Function name owning each open paren plus where that paren is, so both
   * guard shapes can be seen: `IFERROR(…)` anywhere up the stack, and an `IF`
   * whose condition tests this division's denominator.
   */
  const callStack: { name: string; open: number }[] = [];
  const pending: string[] = [];

  tokens.forEach((token, position) => {
    if (token.type === "external") {
      pushViolation(
        violations,
        GRID_FORMULA_REJECTION_CODES.externalWorkbook,
        token.value,
      );
      return;
    }
    if (token.type === "cell" && !references.includes(token.value)) {
      references.push(token.value);
      absoluteReferences.push(token.raw);
    }
    if (token.type === "qualified" && !qualifiedReferences.includes(token.value)) {
      qualifiedReferences.push(token.value);
    }
    if (token.type === "name") {
      const isCall = isOperator(tokens[position + 1], "(");
      if (!isCall) {
        if (!["TRUE", "FALSE"].includes(token.value) && !names.includes(token.value)) {
          names.push(token.value);
        }
        return;
      }
      if (!functions.includes(token.value)) functions.push(token.value);
      if (token.value.includes(".") || macros.has(token.value)) {
        pushViolation(
          violations,
          GRID_FORMULA_REJECTION_CODES.macro,
          `${token.value}(…) 是宏调用，不是可求值的公式（§6）`,
        );
      } else if (nondeterministic.has(token.value)) {
        // §规范三: the verdict is conditional now. A stamp in scope means the
        // answer is pinned to the document rather than to the host clock, so
        // the name may run and is recorded for the recalc graph. No stamp is
        // still a rejection — fail-closed, never a silent fall back to
        // `Date.now()`. `RANDARRAY` is the exception that stays rejected
        // whatever the stamp says: it returns a dynamic array, and the spill
        // semantics that would need are not in this wave.
        if (!stamped || SPILL_REQUIRED.has(token.value)) {
          pushViolation(
            violations,
            GRID_FORMULA_REJECTION_CODES.nondeterministic,
            stamped
              ? `${token.value}() 要溢出区才盛得下，本波不做（§规范四）`
              : `${token.value}() 每次打开结果不同，且文档没有 recalc 戳（§6 F6）`,
          );
        } else if (!volatileFunctions.includes(token.value)) {
          volatileFunctions.push(token.value);
        }
      } else if (unreachable.has(token.value)) {
        pushViolation(
          violations,
          GRID_FORMULA_REJECTION_CODES.unreachable,
          `${token.value}() 指向工作簿之外`,
        );
      } else if (!WHITELIST.has(token.value)) {
        pushViolation(
          violations,
          GRID_FORMULA_REJECTION_CODES.notWhitelisted,
          `${token.value}() 不在 §3.3 的 ${GRID_FORMULA_WHITELIST.length} 个函数内`,
        );
      }
      pending.push(token.value);
      return;
    }
    if (isOperator(token, "(")) {
      depth += 1;
      callStack.push({ name: pending.pop() ?? "", open: position });
      return;
    }
    if (isOperator(token, ")")) {
      depth -= 1;
      if (depth < 0) unbalanced = true;
      callStack.pop();
      return;
    }
    if (isOperator(token, "/")) {
      // §3.3 first bullet: a cell-reference denominator with nothing standing
      // between it and `#DIV/0!` is how the corpus ended up shipping the error.
      //
      // Two shapes count as standing in the way, not one. `IFERROR(…)` catches
      // the error after the fact. An enclosing `IF` whose condition tests this
      // denominator against zero prevents it instead — the division only ever
      // runs on the branch where the denominator is known non-zero. Recognising
      // only the first shape rejected 1,454 formulas on the 456-workbook corpus
      // that are correctly written; see `verdicts/W12-delivery.md`.
      const next = tokens[position + 1];
      const denominator =
        next?.type === "cell" ||
        next?.type === "qualified" ||
        (next?.type === "name" && !isOperator(tokens[position + 2], "("))
          ? String(next.value)
          : null;
      const guarded =
        callStack.some((frame) => frame.name === "IFERROR") ||
        (denominator !== null &&
          callStack.some(
            (frame) =>
              frame.name === "IF" &&
              comparesToZero(
                firstArgumentTokens(tokens, frame.open),
                denominator,
              ),
          ));
      const referenceDenominator =
        denominator !== null ||
        (next?.value === "(" &&
          tokens
            .slice(position + 1)
            .some((candidate) => candidate.type === "cell"));
      if (!guarded && referenceDenominator) {
        pushViolation(
          violations,
          GRID_FORMULA_REJECTION_CODES.unguardedDivision,
          `裸 / 的分母是单元格引用，且既未包 IFERROR、也没有外层 IF 判它非零（${source.slice(0, 80)}）`,
        );
      }
    }
  });

  if (unbalanced || depth !== 0) {
    // An unclosed `=SUM(` must be a controlled rejection, not a pass-through:
    // OOXML would take the `<f>` verbatim and Excel would show a repair prompt.
    pushViolation(
      violations,
      GRID_FORMULA_REJECTION_CODES.syntax,
      `括号不配平（${source.slice(0, 80)}）`,
    );
  }

  for (let position = 0; position < tokens.length - 1; position += 1) {
    if (
      (tokens[position].type === "cell" ||
        tokens[position].type === "qualified") &&
      isOperator(tokens[position + 1], ":") &&
      (tokens[position + 2]?.type === "cell" ||
        tokens[position + 2]?.type === "qualified")
    ) {
      const range = `${tokens[position].value}:${tokens[position + 2].value}`;
      if (!ranges.includes(range)) ranges.push(range);
    }
  }

  return {
    ok: violations.length === 0,
    source,
    functions,
    references,
    absoluteReferences,
    ranges,
    qualifiedReferences,
    names,
    volatileFunctions,
    violations,
  };
}

/** Controlled rejection: throws with a code rather than dropping the formula. */
export function assertGridFormulaAllowed(input: string): GridFormulaInspection {
  const inspection = inspectGridFormula(input);
  if (!inspection.ok) {
    throw new GridFormulaRejection(inspection.source, inspection.violations);
  }
  return inspection;
}

export function isGridFormulaFunctionAllowed(name: string): boolean {
  return WHITELIST.has(String(name).toUpperCase());
}
