/**
 * `oceanleo.grid.v1` formula subset.
 *
 * Spec: `docs/specs/oceanleo-material-and-game-v1/L1-carriers/grid.md` §3.3.
 * The 22 names below are the whole allowed surface — every one of them is
 * spelled and behaves the same in Excel, WPS and LibreOffice Calc, which is
 * why a workbook that stays inside the list opens in all three without a
 * repair prompt (§5.4). Anything outside the list is rejected with a code by
 * `inspectGridFormula`; it is never silently dropped or passed through, because
 * a passed-through `RAND()` reproduces §6 F6 (the same material shows a
 * different number on every open) and a passed-through `INDIRECT()` reaches
 * outside the workbook.
 */

export type GridFormulaValue = string | number;

/** Typed evaluation result. The XLSX cache-value writer needs the real type. */
export type GridFormulaScalar = string | number | boolean;

/** §3.3 — the complete whitelist. §4 C11 pins its size at 22. */
export const GRID_FORMULA_WHITELIST = [
  "SUM",
  "AVERAGE",
  "COUNT",
  "COUNTA",
  "MIN",
  "MAX",
  "ROUND",
  "ROUNDUP",
  "ROUNDDOWN",
  "ABS",
  "IF",
  "IFERROR",
  "AND",
  "OR",
  "NOT",
  "SUMIF",
  "COUNTIF",
  "VLOOKUP",
  "INDEX",
  "MATCH",
  "NPV",
  "IRR",
] as const;

export type GridFormulaFunction = (typeof GRID_FORMULA_WHITELIST)[number];

const WHITELIST = new Set<string>(GRID_FORMULA_WHITELIST);

/**
 * §3.3 second bullet / §6 F6. These are called out separately from the plain
 * "not on the list" case so a reviewer can tell reproducibility damage from an
 * ordinary typo.
 */
export const GRID_NONDETERMINISTIC_FUNCTIONS = [
  "RAND",
  "RANDBETWEEN",
  "RANDARRAY",
  "NOW",
  "TODAY",
] as const;

/** §3.3 third bullet: no macros, no `INDIRECT`, no external workbook refs. */
export const GRID_UNREACHABLE_FUNCTIONS = [
  "INDIRECT",
  "OFFSET",
  "CALL",
  "EVALUATE",
  "EXEC",
  "WEBSERVICE",
  "HYPERLINK",
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
  /** `A1:B9` style ranges. */
  ranges: string[];
  /** `Sheet!A1` style qualified references. */
  qualifiedReferences: string[];
  /** Bare identifiers that are not function calls — named-range candidates. */
  names: string[];
  violations: GridFormulaViolation[];
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
  | { type: "cell"; value: string }
  | { type: "qualified"; value: string }
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
      tokens.push({ type: "qualified", value: qualified[0].replace(/\$/g, "") });
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
      tokens.push({ type: "cell", value: cell[0].replace(/\$/g, "") });
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

export interface GridFormulaContext {
  /** `namedRanges[].name` → `Sheet!A1:B9`, resolved case-insensitively. */
  namedRanges?: Readonly<Record<string, string>>;
  /** Sheet name → rows, so `Sheet2!B3` links inside one workbook (§3.2). */
  workbook?: Readonly<Record<string, readonly (readonly string[])[]>>;
  /** Name of the sheet that owns `rows`; used to resolve self-qualified refs. */
  sheetName?: string;
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
    if (this.peek().value !== value) return false;
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
    while (this.peek().value === "&") {
      this.position += 1;
      value = `${stringify(value)}${stringify(this.additive())}`;
    }
    return value;
  }

  private additive(): GridFormulaScalar {
    let value = this.multiplicative();
    while (this.peek().value === "+" || this.peek().value === "-") {
      const operator = this.take().value;
      const right = numeric(this.multiplicative());
      value = operator === "+" ? numeric(value) + right : numeric(value) - right;
    }
    return value;
  }

  private multiplicative(): GridFormulaScalar {
    let value = this.power();
    while (this.peek().value === "*" || this.peek().value === "/") {
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
      if (this.peek().value === "(") return this.callFunction(token.value);
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
    if (!name || name === (this.context.sheetName || "")) return this.rows;
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
        { ...this.context, sheetName },
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
      if (token.value === "(") depth += 1;
      if (token.value === ")") {
        if (depth === 0) return;
        depth -= 1;
      }
      if (token.value === "," && depth === 0) return;
      this.position += 1;
    }
  }

  private argument(): Arg {
    const first = this.peek();
    if (
      (first.type === "cell" || first.type === "qualified") &&
      this.peek(1).value === ":" &&
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
    if (first.type === "name" && this.peek(1).value !== "(") {
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
    if (!WHITELIST.has(name)) {
      // The evaluator agrees with the inspector: an off-list name is an error
      // value, never a best-effort guess at what the author meant.
      throw new FormulaError("#NAME?");
    }
    if (name === "IF") return this.callIf();
    if (name === "IFERROR") return this.callIfError();
    const args: Arg[] = [];
    if (this.peek().value !== ")") {
      do args.push(this.argument());
      while (this.accept(",") || this.accept(";"));
    }
    this.expect(")");
    return applyFunction(name as GridFormulaFunction, args);
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

function applyFunction(
  name: GridFormulaFunction,
  args: readonly Arg[],
): GridFormulaScalar {
  switch (name) {
    case "SUM":
      return numbersFrom(args).reduce((total, value) => total + value, 0);
    case "COUNT":
      return numbersFrom(args).length;
    case "COUNTA":
      return flatten(args).filter((value) => !isBlank(value)).length;
    case "AVERAGE": {
      const values = numbersFrom(args);
      if (values.length === 0) throw new FormulaError("#DIV/0!");
      return values.reduce((total, value) => total + value, 0) / values.length;
    }
    case "MIN": {
      const values = numbersFrom(args);
      return values.length ? Math.min(...values) : 0;
    }
    case "MAX": {
      const values = numbersFrom(args);
      return values.length ? Math.max(...values) : 0;
    }
    case "ABS":
      return Math.abs(scalarNumber(args, 0));
    case "ROUND":
      return roundTo(scalarNumber(args, 0), scalarNumber(args, 1, 0), "half");
    case "ROUNDUP":
      return roundTo(scalarNumber(args, 0), scalarNumber(args, 1, 0), "up");
    case "ROUNDDOWN":
      return roundTo(scalarNumber(args, 0), scalarNumber(args, 1, 0), "down");
    case "AND":
      return flatten(args).every((value) => truthy(value));
    case "OR":
      return flatten(args).some((value) => truthy(value));
    case "NOT":
      return !truthy(flatten(args)[0] ?? "");
    case "SUMIF":
      return sumIf(args);
    case "COUNTIF": {
      const range = requireRange(args, 0);
      const criteria = requireScalar(args, 1);
      return range
        .flat()
        .filter((value) => matchesCriteria(value, criteria)).length;
    }
    case "VLOOKUP":
      return vlookup(args);
    case "INDEX":
      return index(args);
    case "MATCH":
      return match(args);
    case "NPV":
      return npv(scalarNumber(args, 0), numbersFrom(args.slice(1)));
    case "IRR":
      return irr(numbersFrom(args.slice(0, 1)), scalarNumber(args, 1, 0.1));
    default:
      throw new FormulaError("#NAME?");
  }
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
      value: evaluateFormulaSource(raw.slice(1), rows, visiting, context, 0),
    };
  } catch (caught) {
    const code = caught instanceof FormulaError ? caught.code : "#VALUE!";
    return { ok: false, value: code, code };
  }
}

/** Evaluate a small, deterministic spreadsheet subset without `eval`. */
export function evaluateGridCell(
  rows: readonly (readonly string[])[],
  row: number,
  col: number,
  context: GridFormulaContext = {},
): GridFormulaValue {
  const result = evaluateGridCellTyped(rows, row, col, context);
  return typeof result.value === "boolean"
    ? result.value
      ? "TRUE"
      : "FALSE"
    : result.value;
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
export function inspectGridFormula(input: string): GridFormulaInspection {
  const source = String(input ?? "").replace(/^=/, "").trim();
  const violations: GridFormulaViolation[] = [];
  const functions: string[] = [];
  const references: string[] = [];
  const ranges: string[] = [];
  const qualifiedReferences: string[] = [];
  const names: string[] = [];
  if (!source) {
    return {
      ok: false,
      source,
      functions,
      references,
      ranges,
      qualifiedReferences,
      names,
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
      ranges,
      qualifiedReferences,
      names,
      violations: [
        ...violations,
        { code: GRID_FORMULA_REJECTION_CODES.syntax, detail: "无法词法解析" },
      ],
    };
  }
  const nondeterministic = new Set<string>(GRID_NONDETERMINISTIC_FUNCTIONS);
  const unreachable = new Set<string>(GRID_UNREACHABLE_FUNCTIONS);
  /** Function name owning each open paren, so `IFERROR` guards can be seen. */
  const callStack: string[] = [];
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
    }
    if (token.type === "qualified" && !qualifiedReferences.includes(token.value)) {
      qualifiedReferences.push(token.value);
    }
    if (token.type === "name") {
      const isCall = tokens[position + 1]?.value === "(";
      if (!isCall) {
        if (!["TRUE", "FALSE"].includes(token.value) && !names.includes(token.value)) {
          names.push(token.value);
        }
        return;
      }
      if (!functions.includes(token.value)) functions.push(token.value);
      if (token.value.includes(".")) {
        pushViolation(
          violations,
          GRID_FORMULA_REJECTION_CODES.macro,
          `${token.value}(…) 形如宏调用`,
        );
      } else if (nondeterministic.has(token.value)) {
        pushViolation(
          violations,
          GRID_FORMULA_REJECTION_CODES.nondeterministic,
          `${token.value}() 每次打开结果不同（§6 F6）`,
        );
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
    if (token.value === "(") {
      callStack.push(pending.pop() ?? "");
      return;
    }
    if (token.value === ")") {
      callStack.pop();
      return;
    }
    if (token.value === "/") {
      // §3.3 first bullet: a cell-reference denominator without an IFERROR
      // wrapper is how 92.9% of the corpus ended up shipping `#DIV/0!`.
      const next = tokens[position + 1];
      const guarded = callStack.includes("IFERROR");
      const referenceDenominator =
        next?.type === "cell" ||
        next?.type === "qualified" ||
        (next?.type === "name" && tokens[position + 2]?.value !== "(") ||
        (next?.value === "(" &&
          tokens
            .slice(position + 1)
            .some((candidate) => candidate.type === "cell"));
      if (!guarded && referenceDenominator) {
        pushViolation(
          violations,
          GRID_FORMULA_REJECTION_CODES.unguardedDivision,
          `裸 / 的分母是单元格引用且未包 IFERROR（${source.slice(0, 80)}）`,
        );
      }
    }
  });

  for (let position = 0; position < tokens.length - 1; position += 1) {
    if (
      (tokens[position].type === "cell" ||
        tokens[position].type === "qualified") &&
      tokens[position + 1]?.value === ":" &&
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
    ranges,
    qualifiedReferences,
    names,
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
