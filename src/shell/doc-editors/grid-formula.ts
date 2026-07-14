export type GridFormulaValue = string | number;

type Token =
  | { type: "number"; value: number }
  | { type: "cell"; value: string }
  | { type: "name"; value: string }
  | { type: "operator"; value: string }
  | { type: "eof"; value: "" };

class FormulaError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
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
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number) {
      tokens.push({ type: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const cell = rest.match(/^\$?[A-Za-z]+\$?\d+/);
    if (cell) {
      tokens.push({ type: "cell", value: cell[0].replace(/\$/g, "") });
      index += cell[0].length;
      continue;
    }
    const name = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (name) {
      tokens.push({ type: "name", value: name[0].toUpperCase() });
      index += name[0].length;
      continue;
    }
    if ("+-*/^():,".includes(source[index])) {
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

function cellPosition(reference: string): { row: number; col: number } {
  const match = reference.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) throw new FormulaError("#REF!");
  return { row: Number(match[2]) - 1, col: columnIndex(match[1]) };
}

function numeric(value: GridFormulaValue): number {
  if (typeof value === "number") return value;
  if (!value.trim()) return 0;
  const parsed = Number(value.replace(/,/g, "").replace(/%$/, ""));
  if (!Number.isFinite(parsed)) throw new FormulaError("#VALUE!");
  return value.trim().endsWith("%") ? parsed / 100 : parsed;
}

class Parser {
  private position = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly rows: string[][],
    private readonly visiting: Set<string>,
  ) {}

  parse(): number {
    const result = this.additive();
    if (this.peek().type !== "eof" && this.peek().value !== ")" && this.peek().value !== ",") {
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

  private additive(): number {
    let value = this.multiplicative();
    while (this.peek().value === "+" || this.peek().value === "-") {
      const operator = this.take().value;
      const right = this.multiplicative();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private multiplicative(): number {
    let value = this.power();
    while (this.peek().value === "*" || this.peek().value === "/") {
      const operator = this.take().value;
      const right = this.power();
      if (operator === "/" && right === 0) throw new FormulaError("#DIV/0!");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  private power(): number {
    let value = this.unary();
    if (this.accept("^")) value **= this.power();
    return value;
  }

  private unary(): number {
    if (this.accept("+")) return this.unary();
    if (this.accept("-")) return -this.unary();
    return this.primary();
  }

  private primary(): number {
    const token = this.take();
    if (token.type === "number") return token.value;
    if (token.type === "cell") return numeric(this.resolveCell(token.value));
    if (token.type === "name") return this.callFunction(token.value);
    if (token.value === "(") {
      const value = this.additive();
      if (!this.accept(")")) throw new FormulaError("#VALUE!");
      return value;
    }
    throw new FormulaError("#VALUE!");
  }

  private resolveCell(reference: string): GridFormulaValue {
    const { row, col } = cellPosition(reference);
    if (row < 0 || col < 0) throw new FormulaError("#REF!");
    const key = `${row}:${col}`;
    if (this.visiting.has(key)) throw new FormulaError("#CYCLE!");
    const raw = this.rows[row]?.[col] ?? "";
    if (!raw.startsWith("=")) return raw;
    this.visiting.add(key);
    try {
      return evaluateFormulaSource(raw.slice(1), this.rows, this.visiting);
    } finally {
      this.visiting.delete(key);
    }
  }

  private range(first: string, last: string): number[] {
    const start = cellPosition(first);
    const end = cellPosition(last);
    const values: number[] = [];
    for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
      for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col += 1) {
        try {
          values.push(numeric(this.resolveCell(`${columnName(col)}${row + 1}`)));
        } catch (caught) {
          if (caught instanceof FormulaError && caught.code === "#VALUE!") continue;
          throw caught;
        }
      }
    }
    return values;
  }

  private argument(): number[] {
    if (
      this.peek().type === "cell" &&
      this.peek(1).value === ":" &&
      this.peek(2).type === "cell"
    ) {
      const first = String(this.take().value);
      this.take();
      const last = String(this.take().value);
      return this.range(first, last);
    }
    return [this.additive()];
  }

  private callFunction(name: string): number {
    if (!this.accept("(")) throw new FormulaError("#NAME?");
    const values: number[] = [];
    if (this.peek().value !== ")") {
      do values.push(...this.argument());
      while (this.accept(","));
    }
    if (!this.accept(")")) throw new FormulaError("#VALUE!");
    if (name === "SUM") return values.reduce((sum, value) => sum + value, 0);
    if (name === "COUNT") return values.length;
    if (name === "AVERAGE") {
      if (values.length === 0) throw new FormulaError("#DIV/0!");
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    if (name === "MIN") return values.length ? Math.min(...values) : 0;
    if (name === "MAX") return values.length ? Math.max(...values) : 0;
    throw new FormulaError("#NAME?");
  }
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function evaluateFormulaSource(
  source: string,
  rows: string[][],
  visiting: Set<string>,
): GridFormulaValue {
  return new Parser(tokenize(source), rows, visiting).parse();
}

/** Evaluate a small, deterministic spreadsheet subset without `eval`. */
export function evaluateGridCell(
  rows: string[][],
  row: number,
  col: number,
): GridFormulaValue {
  const raw = rows[row]?.[col] ?? "";
  if (!raw.startsWith("=")) return raw;
  const visiting = new Set([`${row}:${col}`]);
  try {
    return evaluateFormulaSource(raw.slice(1), rows, visiting);
  } catch (caught) {
    return caught instanceof FormulaError ? caught.code : "#VALUE!";
  }
}
