// ============================================================================
// oceanleo.interactive-doc.v1 — 源解析 / 确定性序列化 / §3.4 封闭表达式求值器
// ----------------------------------------------------------------------------
// 契约: interactive-doc.md §3.3 计算图状态机(line 568-591)、
//   §3.4 表达式语言(line 593-646)、§3.5 三表勾稽(line 648-658)、
//   §5.3 可靠性(line 735-738)、§5.4 可移植性(line 740-742)、
//   §6 失败模式 F1-F8(line 751-791)、§8 完备判据(line 865-893)。
//
// 铁律:
//   - 求值器是封闭子集。本文件 MUST NOT 出现 eval / new Function / 动态 import /
//     模板字符串拼代码;白名单外的调用一律受控拒绝并带 error code(§1.2 line 104-105)。
//   - ADR-04:HTML 不得作为源。`parseInteractiveDocSource` 显式拒绝 HTML 字节。
//   - D4:本目录 MUST NOT 从 chart-editor/ import 任何符号。
// ============================================================================

import {
  INTERACTIVE_DOC_LIMITS,
  INTERACTIVE_DOC_PROJECT_SCHEMA,
  INTERACTIVE_DOC_PROSE_MIN_CHARS,
  INTERACTIVE_DOC_BOUND_COMPUTATION_RATIO,
  INTERACTIVE_DOC_TITLE_MIN_CHARS,
  boundComputationIds,
  canonicalInteractiveDocProject,
  errorSeverityRuleCount,
  presentationBlocks,
  proseCharacterCount,
  quizItemCount,
  validateInteractiveDocProject,
  type ComputeNode,
  type ComputeNodeGuard,
  type InteractiveDocColumnType,
  type InteractiveDocDataset,
  type InteractiveDocParameter,
  type InteractiveDocProject,
  type InteractiveDocScalar,
  type InteractiveDocSeverity,
  type InteractiveDocValidationError,
  type InteractiveDocValidationRule,
} from "./interactive-doc-schema";

export {
  INTERACTIVE_DOC_ADAPTER_ID,
  INTERACTIVE_DOC_ARTIFACT_TYPE,
  INTERACTIVE_DOC_EDITOR_CAPABILITY,
  INTERACTIVE_DOC_FEATURE_ID,
  INTERACTIVE_DOC_LIMITS,
  INTERACTIVE_DOC_PROJECT_SCHEMA,
  INTERACTIVE_DOC_PROJECT_VERSION,
  INTERACTIVE_DOC_SOURCE_MEDIA_TYPE,
  validateInteractiveDocProject,
} from "./interactive-doc-schema";
export type {
  ComputeNode,
  InteractiveDocBlock,
  InteractiveDocProject,
  InteractiveDocValidationError,
} from "./interactive-doc-schema";

const textEncoder = new TextEncoder();

export const INTERACTIVE_DOC_EDITOR_ID = "interactive-doc-editor";
export const INTERACTIVE_DOC_EDITOR_ADAPTER = "interactive-doc@1";
export const INTERACTIVE_DOC_SOURCE_REPAIR =
  "数据修复:为当前 revision 补录 oceanleo.interactive-doc.v1 结构化工程;" +
  "MUST NOT 用 HTML、脚本或截图逆向伪恢复(ADR-04)。";

export type InteractiveDocSourceErrorCode =
  | "missing-source"
  | "source-too-large"
  | "source-too-small"
  | "source-not-utf8"
  | "html-source-rejected"
  | "invalid-json"
  | "invalid-schema"
  | "interactive-doc-inert";

export class InteractiveDocSourceError extends Error {
  readonly code: InteractiveDocSourceErrorCode;
  readonly errors: InteractiveDocValidationError[];

  constructor(
    code: InteractiveDocSourceErrorCode,
    message: string,
    errors: InteractiveDocValidationError[] = [],
  ) {
    super(`${message} ${INTERACTIVE_DOC_SOURCE_REPAIR}`);
    this.name = "InteractiveDocSourceError";
    this.code = code;
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// 解析与序列化
// ---------------------------------------------------------------------------

function decodeSource(input: string | Uint8Array): string {
  if (typeof input === "string") return input;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new InteractiveDocSourceError(
      "source-not-utf8",
      "interactive-doc 源不是有效 UTF-8 字节。",
    );
  }
}

/** ADR-04:热 HTML 只能是渲染结果,永远不是源。 */
function rejectHtmlSource(text: string): void {
  const head = text.slice(0, 512).trimStart().toLowerCase();
  if (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<?xml") ||
    /^<[a-z!/]/.test(head)
  ) {
    throw new InteractiveDocSourceError(
      "html-source-rejected",
      "interactive-doc MUST NOT 以 source_format='html' 落库(ADR-04);源必须是 JSON。",
    );
  }
}

export function parseInteractiveDocSource(
  input: string | Uint8Array,
): InteractiveDocProject {
  const decoded = decodeSource(input).replace(/^\uFEFF/, "");
  if (!decoded.trim()) {
    throw new InteractiveDocSourceError("missing-source", "interactive-doc 源为空。");
  }
  const byteLength = textEncoder.encode(decoded).byteLength;
  if (byteLength > INTERACTIVE_DOC_LIMITS.sourceBytesMax) {
    throw new InteractiveDocSourceError(
      "source-too-large",
      `interactive-doc 源 ${byteLength} B 超过 C40 上限 ${INTERACTIVE_DOC_LIMITS.sourceBytesMax} B。`,
    );
  }
  rejectHtmlSource(decoded);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new InteractiveDocSourceError(
      "invalid-json",
      "interactive-doc 源必须是合法 JSON;HTML 与脚本永不被求值。",
    );
  }
  const result = validateInteractiveDocProject(parsed);
  if (!result.ok) {
    const head = result.errors
      .slice(0, 4)
      .map((error) => `${error.path}: ${error.message}`)
      .join("; ");
    throw new InteractiveDocSourceError(
      "invalid-schema",
      `interactive-doc 源不满足 ${INTERACTIVE_DOC_PROJECT_SCHEMA}(${result.errors.length} 处):${head}。`,
      result.errors,
    );
  }
  return result.project;
}

export function serializeInteractiveDocProject(
  project: InteractiveDocProject,
): string {
  const json = JSON.stringify(canonicalInteractiveDocProject(project), null, 2);
  if (textEncoder.encode(json).byteLength > INTERACTIVE_DOC_LIMITS.sourceBytesMax) {
    throw new InteractiveDocSourceError(
      "source-too-large",
      `interactive-doc 源超过 C40 上限 ${INTERACTIVE_DOC_LIMITS.sourceBytesMax} B。`,
    );
  }
  return json;
}

export function interactiveDocSourceByteLength(
  project: InteractiveDocProject,
): number {
  return textEncoder.encode(serializeInteractiveDocProject(project)).byteLength;
}

// ---------------------------------------------------------------------------
// §3.4 表达式语言:词法
// ---------------------------------------------------------------------------

export type ExpressionErrorCode =
  | "expression-empty"
  | "expression-too-long"
  | "expression-syntax"
  | "expression-forbidden"
  | "expression-unknown-function"
  | "expression-arity"
  | "expression-depth";

export interface ExpressionError {
  code: ExpressionErrorCode;
  message: string;
  offset: number;
}

/**
 * §3.4 line 615-642 的 24 个函数。`arity` 为固定参数个数,
 * `variadicMin` 为可变参下限。C11 明文:MUST NOT 不改版本号就扩充。
 */
export const EXPRESSION_FUNCTIONS: Readonly<
  Record<string, { arity?: number; variadicMin?: number; lazy?: boolean }>
> = Object.freeze({
  abs: { arity: 1 },
  min: { variadicMin: 2 },
  max: { variadicMin: 2 },
  round: { arity: 2 },
  floor: { arity: 1 },
  ceil: { arity: 1 },
  pow: { arity: 2 },
  sqrt: { arity: 1 },
  exp: { arity: 1 },
  ln: { arity: 1 },
  log10: { arity: 1 },
  sum: { arity: 1 },
  avg: { arity: 1 },
  count: { arity: 1 },
  median: { arity: 1 },
  stdev: { arity: 1 },
  npv: { arity: 2 },
  irr: { arity: 1 },
  pmt: { arity: 3 },
  // `if` 惰性求值:未取的分支 MUST NOT 触发除零(§3.4 除法保护的正常用法)。
  if: { arity: 3, lazy: true },
  clamp: { arity: 3 },
  lookup: { arity: 3 },
  days: { arity: 2 },
  coalesce: { variadicMin: 2 },
});

export const EXPRESSION_FUNCTION_NAMES = Object.freeze(
  Object.keys(EXPRESSION_FUNCTIONS).sort(),
);

const PUNCTUATORS = Object.freeze([
  "||",
  "&&",
  "==",
  "!=",
  "<=",
  ">=",
  "?",
  ":",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "(",
  ")",
  ",",
  "!",
] as const);

const MAX_EXPRESSION_DEPTH = 64;

interface Token {
  type: "number" | "string" | "boolean" | "ident" | "punct";
  value: string;
  numeric?: number;
  offset: number;
}

class ExpressionSyntaxError extends Error {
  readonly code: ExpressionErrorCode;
  readonly offset: number;

  constructor(code: ExpressionErrorCode, message: string, offset: number) {
    super(message);
    this.name = "ExpressionSyntaxError";
    this.code = code;
    this.offset = offset;
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === " " || character === "\t" || character === "\n" || character === "\r") {
      index += 1;
      continue;
    }
    if (character >= "0" && character <= "9") {
      const match = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
      if (!match) {
        throw new ExpressionSyntaxError(
          "expression-syntax",
          `无法解析数字字面量(位置 ${index})`,
          index,
        );
      }
      const numeric = Number(match[0]);
      if (!Number.isFinite(numeric)) {
        throw new ExpressionSyntaxError(
          "expression-syntax",
          `数字字面量不是有限值(位置 ${index})`,
          index,
        );
      }
      tokens.push({ type: "number", value: match[0], numeric, offset: index });
      index += match[0].length;
      continue;
    }
    if (character === '"' || character === "'") {
      let cursor = index + 1;
      let literal = "";
      let closed = false;
      while (cursor < source.length) {
        const current = source[cursor];
        if (current === "\\") {
          const next = source[cursor + 1];
          if (next !== '"' && next !== "'" && next !== "\\") {
            throw new ExpressionSyntaxError(
              "expression-forbidden",
              `字符串只允许 \\" \\' \\\\ 三种转义(位置 ${cursor})`,
              cursor,
            );
          }
          literal += next;
          cursor += 2;
          continue;
        }
        if (current === character) {
          closed = true;
          cursor += 1;
          break;
        }
        if (current === "\n" || current === "\r") break;
        literal += current;
        cursor += 1;
      }
      if (!closed) {
        throw new ExpressionSyntaxError(
          "expression-syntax",
          `字符串字面量未闭合(位置 ${index})`,
          index,
        );
      }
      tokens.push({ type: "string", value: literal, offset: index });
      index = cursor;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index));
      const name = match ? match[0] : character;
      if (name === "true" || name === "false") {
        tokens.push({ type: "boolean", value: name, offset: index });
      } else {
        tokens.push({ type: "ident", value: name, offset: index });
      }
      index += name.length;
      continue;
    }
    const punctuator = PUNCTUATORS.find((entry) =>
      source.startsWith(entry, index),
    );
    if (punctuator) {
      tokens.push({ type: "punct", value: punctuator, offset: index });
      index += punctuator.length;
      continue;
    }
    // §3.4 line 613:赋值、属性访问、下标访问、模板串、分号等一律不在文法内。
    throw new ExpressionSyntaxError(
      "expression-forbidden",
      `字符 ${JSON.stringify(character)} 不在 §3.4 封闭子集内(位置 ${index})`,
      index,
    );
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// §3.4 表达式语言:文法(EBNF line 599-610)
// ---------------------------------------------------------------------------

export type ExpressionBinaryOperator =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/"
  | "%";

export type ExpressionNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "ident"; name: string; offset: number }
  | { type: "call"; name: string; args: ExpressionNode[]; offset: number }
  | { type: "unary"; operator: "-" | "!"; argument: ExpressionNode }
  | {
      type: "binary";
      operator: ExpressionBinaryOperator;
      left: ExpressionNode;
      right: ExpressionNode;
      offset: number;
    }
  | { type: "logical"; operator: "||" | "&&"; left: ExpressionNode; right: ExpressionNode }
  | {
      type: "conditional";
      test: ExpressionNode;
      consequent: ExpressionNode;
      alternate: ExpressionNode;
    };

export interface ParsedExpression {
  source: string;
  ast: ExpressionNode;
  /** 表达式引用到的 IDENT(§3.4 line 612:MUST 解析为已声明 id)。 */
  identifiers: string[];
  /** 表达式调用到的白名单函数。 */
  functions: string[];
}

class Parser {
  private readonly tokens: Token[];
  private position = 0;
  private depth = 0;
  private readonly identifiers = new Set<string>();
  private readonly functions = new Set<string>();

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(source: string): ParsedExpression {
    const ast = this.expression();
    if (this.position < this.tokens.length) {
      const token = this.tokens[this.position];
      throw new ExpressionSyntaxError(
        "expression-syntax",
        `表达式在位置 ${token.offset} 处有多余记号 ${JSON.stringify(token.value)}`,
        token.offset,
      );
    }
    return {
      source,
      ast,
      identifiers: [...this.identifiers].sort(),
      functions: [...this.functions].sort(),
    };
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private eat(value: string): boolean {
    const token = this.peek();
    if (token && token.type === "punct" && token.value === value) {
      this.position += 1;
      return true;
    }
    return false;
  }

  private expect(value: string): void {
    if (!this.eat(value)) {
      const token = this.peek();
      throw new ExpressionSyntaxError(
        "expression-syntax",
        `期望 ${JSON.stringify(value)},实际 ${
          token ? JSON.stringify(token.value) : "表达式结束"
        }`,
        token?.offset ?? 0,
      );
    }
  }

  private guardDepth(offset: number): void {
    if (this.depth > MAX_EXPRESSION_DEPTH) {
      throw new ExpressionSyntaxError(
        "expression-depth",
        `表达式嵌套超过 ${MAX_EXPRESSION_DEPTH} 层`,
        offset,
      );
    }
  }

  /** expr := ternary */
  private expression(): ExpressionNode {
    this.depth += 1;
    this.guardDepth(this.peek()?.offset ?? 0);
    const node = this.ternary();
    this.depth -= 1;
    return node;
  }

  /** ternary := or [ "?" expr ":" expr ] */
  private ternary(): ExpressionNode {
    const test = this.or();
    if (!this.eat("?")) return test;
    const consequent = this.expression();
    this.expect(":");
    const alternate = this.expression();
    return { type: "conditional", test, consequent, alternate };
  }

  /** or := and { "||" and } */
  private or(): ExpressionNode {
    let left = this.and();
    while (this.eat("||")) {
      left = { type: "logical", operator: "||", left, right: this.and() };
    }
    return left;
  }

  /** and := cmp { "&&" cmp } */
  private and(): ExpressionNode {
    let left = this.comparison();
    while (this.eat("&&")) {
      left = { type: "logical", operator: "&&", left, right: this.comparison() };
    }
    return left;
  }

  /** cmp := add { ("=="|"!="|"<"|"<="|">"|">=") add } */
  private comparison(): ExpressionNode {
    let left = this.additive();
    for (;;) {
      const token = this.peek();
      if (
        !token ||
        token.type !== "punct" ||
        !["==", "!=", "<", "<=", ">", ">="].includes(token.value)
      ) {
        return left;
      }
      this.position += 1;
      left = {
        type: "binary",
        operator: token.value as ExpressionBinaryOperator,
        left,
        right: this.additive(),
        offset: token.offset,
      };
    }
  }

  /** add := mul { ("+"|"-") mul } */
  private additive(): ExpressionNode {
    let left = this.multiplicative();
    for (;;) {
      const token = this.peek();
      if (!token || token.type !== "punct" || (token.value !== "+" && token.value !== "-")) {
        return left;
      }
      this.position += 1;
      left = {
        type: "binary",
        operator: token.value,
        left,
        right: this.multiplicative(),
        offset: token.offset,
      };
    }
  }

  /** mul := unary { ("*"|"/"|"%") unary } */
  private multiplicative(): ExpressionNode {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (
        !token ||
        token.type !== "punct" ||
        !["*", "/", "%"].includes(token.value)
      ) {
        return left;
      }
      this.position += 1;
      left = {
        type: "binary",
        operator: token.value as ExpressionBinaryOperator,
        left,
        right: this.unary(),
        offset: token.offset,
      };
    }
  }

  /** unary := [ "-" | "!" ] primary —— 只允许一个前缀,照 EBNF line 607。 */
  private unary(): ExpressionNode {
    const token = this.peek();
    if (token && token.type === "punct" && (token.value === "-" || token.value === "!")) {
      this.position += 1;
      return { type: "unary", operator: token.value, argument: this.primary() };
    }
    return this.primary();
  }

  /** primary := NUMBER | STRING | BOOLEAN | IDENT | call | "(" expr ")" */
  private primary(): ExpressionNode {
    const token = this.peek();
    if (!token) {
      throw new ExpressionSyntaxError("expression-syntax", "表达式意外结束", 0);
    }
    if (token.type === "number") {
      this.position += 1;
      return { type: "number", value: token.numeric as number };
    }
    if (token.type === "string") {
      this.position += 1;
      return { type: "string", value: token.value };
    }
    if (token.type === "boolean") {
      this.position += 1;
      return { type: "boolean", value: token.value === "true" };
    }
    if (token.type === "ident") {
      this.position += 1;
      const next = this.peek();
      if (next && next.type === "punct" && next.value === "(") {
        return this.call(token);
      }
      this.identifiers.add(token.value);
      return { type: "ident", name: token.value, offset: token.offset };
    }
    if (token.value === "(") {
      this.position += 1;
      const node = this.expression();
      this.expect(")");
      return node;
    }
    throw new ExpressionSyntaxError(
      "expression-syntax",
      `位置 ${token.offset} 处不是合法的 primary:${JSON.stringify(token.value)}`,
      token.offset,
    );
  }

  /** call := IDENT "(" [ expr { "," expr } ] ")" */
  private call(name: Token): ExpressionNode {
    const contract = EXPRESSION_FUNCTIONS[name.value];
    if (!contract) {
      // eval / new Function / 任何库外函数都在这里被受控拒绝。
      throw new ExpressionSyntaxError(
        "expression-unknown-function",
        `函数 ${name.value} 不在 §3.4 的 ${INTERACTIVE_DOC_LIMITS.functionWhitelistSize} 个白名单函数内`,
        name.offset,
      );
    }
    this.expect("(");
    const args: ExpressionNode[] = [];
    if (!this.eat(")")) {
      for (;;) {
        args.push(this.expression());
        if (this.eat(",")) continue;
        this.expect(")");
        break;
      }
    }
    if (contract.arity !== undefined && args.length !== contract.arity) {
      throw new ExpressionSyntaxError(
        "expression-arity",
        `${name.value} 需要 ${contract.arity} 个参数,实际 ${args.length}`,
        name.offset,
      );
    }
    if (contract.variadicMin !== undefined && args.length < contract.variadicMin) {
      throw new ExpressionSyntaxError(
        "expression-arity",
        `${name.value} 至少需要 ${contract.variadicMin} 个参数,实际 ${args.length}`,
        name.offset,
      );
    }
    this.functions.add(name.value);
    return { type: "call", name: name.value, args, offset: name.offset };
  }
}

export type ParseExpressionResult =
  | { ok: true; expression: ParsedExpression }
  | { ok: false; error: ExpressionError };

export function parseInteractiveDocExpression(
  source: string,
): ParseExpressionResult {
  if (!source.trim()) {
    return {
      ok: false,
      error: { code: "expression-empty", message: "表达式为空", offset: 0 },
    };
  }
  if (source.length > INTERACTIVE_DOC_LIMITS.expressionMaxChars) {
    return {
      ok: false,
      error: {
        code: "expression-too-long",
        message: `表达式长度 ${source.length} 超过 C7 上限 ${INTERACTIVE_DOC_LIMITS.expressionMaxChars}`,
        offset: 0,
      },
    };
  }
  try {
    return { ok: true, expression: new Parser(tokenize(source)).parse(source) };
  } catch (caught) {
    if (caught instanceof ExpressionSyntaxError) {
      return {
        ok: false,
        error: {
          code: caught.code,
          message: caught.message,
          offset: caught.offset,
        },
      };
    }
    throw caught;
  }
}

// ---------------------------------------------------------------------------
// 值域
// ---------------------------------------------------------------------------

export type ComputeScalar = number | string | boolean | null;

export interface ComputeColumn {
  kind: "column";
  name: string;
  type: InteractiveDocColumnType;
  values: ComputeScalar[];
}

export interface ComputeDatasetValue {
  kind: "dataset";
  id: string;
  columns: ComputeColumn[];
  rowCount: number;
  /** 外置依赖件未随本次载入到位(F7)。 */
  unloaded: boolean;
}

export type ComputeValue = ComputeScalar | ComputeColumn | ComputeDatasetValue;

function isColumn(value: ComputeValue): value is ComputeColumn {
  return Boolean(value) && typeof value === "object" && (value as ComputeColumn).kind === "column";
}

function isDataset(value: ComputeValue): value is ComputeDatasetValue {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as ComputeDatasetValue).kind === "dataset"
  );
}

export function isComputeScalar(value: ComputeValue): value is ComputeScalar {
  return !isColumn(value) && !isDataset(value);
}

// ---------------------------------------------------------------------------
// §3.3 linking:引用解析、拓扑排序、环检出
// ---------------------------------------------------------------------------

export type ComputeGraphState = "ready" | "invalid" | "cyclic" | "degraded";

export type InteractiveDocGraphErrorCode =
  | "expression-invalid"
  | "unknown-identifier"
  | "interactive-doc-dangling-bind"
  | "interactive-doc-cyclic"
  | "interactive-doc-dependency-missing"
  | "graph-too-deep"
  | "node-degree";

export interface InteractiveDocGraphError {
  code: InteractiveDocGraphErrorCode;
  path: string;
  message: string;
  /** F2:环上完整 id 序列,MUST NOT 只说「计算失败」。 */
  cycle?: string[];
}

export interface InteractiveDocLinkOptions {
  /** 已随 revision 落库、可读到字节的依赖件路径。缺省取 `project.dependencies[].path`。 */
  availableDependencyPaths?: Iterable<string>;
  /** 本次已载入行数据的 dataset id(未列入者视为声明但未载入)。 */
  loadedDatasetIds?: Iterable<string>;
}

export interface InteractiveDocLinkResult {
  state: ComputeGraphState;
  /** 拓扑序(仅 computations)。 */
  order: string[];
  /** 拓扑排序后的最长路径,C9 上限 32。 */
  depth: number;
  cycle: string[];
  dependencies: Record<string, string[]>;
  expressions: Record<string, ParsedExpression>;
  /** §5.1 line 718:无人引用的死节点。 */
  deadComputationIds: string[];
  /** F7:声明了 dependencyPath 但闭包里没有对应件。 */
  missingDatasetIds: string[];
  errors: InteractiveDocGraphError[];
}

function datasetIsAvailable(
  dataset: InteractiveDocDataset,
  available: Set<string>,
): boolean {
  if ("inline" in dataset.source) return true;
  return available.has(dataset.source.dependencyPath);
}

export function linkInteractiveDocProject(
  project: InteractiveDocProject,
  options: InteractiveDocLinkOptions = {},
): InteractiveDocLinkResult {
  const errors: InteractiveDocGraphError[] = [];
  const parameterIds = new Set(project.parameters.map((entry) => entry.id));
  const datasetIds = new Set((project.datasets || []).map((entry) => entry.id));
  const computationIds = new Set(project.computations.map((entry) => entry.id));
  const expressions: Record<string, ParsedExpression> = {};
  const dependencies: Record<string, string[]> = {};
  const referenced = new Set<string>();

  const available = new Set<string>(
    options.availableDependencyPaths ??
      (project.dependencies || []).map((entry) => entry.path),
  );
  const missingDatasetIds = (project.datasets || [])
    .filter((dataset) => !datasetIsAvailable(dataset, available))
    .map((dataset) => dataset.id);
  for (const dataset of project.datasets || []) {
    if (!datasetIsAvailable(dataset, available)) {
      errors.push({
        code: "interactive-doc-dependency-missing",
        path: `datasets[${dataset.id}].source.dependencyPath`,
        message: `dataset ${dataset.id} 的依赖件未随 revision 落库(F7),运行期进入 degraded 且 MUST NOT 保存`,
      });
    }
  }

  const resolveIdentifier = (name: string, path: string): string | null => {
    if (computationIds.has(name)) return "computation";
    if (parameterIds.has(name)) return "parameter";
    if (datasetIds.has(name)) return "dataset";
    errors.push({
      code: "unknown-identifier",
      path,
      message: `标识符 ${name} 不是任何 parameters / computations / datasets 的 id(§3.4 line 612)`,
    });
    return null;
  };

  project.computations.forEach((node, index) => {
    const path = `computations[${index}].expression`;
    const parsed = parseInteractiveDocExpression(node.expression);
    if (!parsed.ok) {
      errors.push({
        code: "expression-invalid",
        path,
        message: `${parsed.error.code}: ${parsed.error.message}`,
      });
      dependencies[node.id] = [];
      return;
    }
    expressions[node.id] = parsed.expression;
    const edges = new Set<string>();
    for (const identifier of parsed.expression.identifiers) {
      const kind = resolveIdentifier(identifier, path);
      if (kind === "computation") edges.add(identifier);
      if (kind !== null) referenced.add(identifier);
    }
    for (const declared of node.dependsOn || []) {
      const kind = resolveIdentifier(declared, `computations[${index}].dependsOn`);
      if (kind === "computation") edges.add(declared);
      if (kind !== null) referenced.add(declared);
    }
    if (edges.size > INTERACTIVE_DOC_LIMITS.nodeMaxDependencies) {
      errors.push({
        code: "node-degree",
        path: `computations[${index}]`,
        message: `节点 ${node.id} 的依赖数 ${edges.size} 超过 C10 上限 ${INTERACTIVE_DOC_LIMITS.nodeMaxDependencies}`,
      });
    }
    dependencies[node.id] = [...edges].sort();
  });

  for (const rule of project.validation || []) {
    const path = `validation[${rule.id}].assert`;
    const parsed = parseInteractiveDocExpression(rule.assert);
    if (!parsed.ok) {
      errors.push({
        code: "expression-invalid",
        path,
        message: `${parsed.error.code}: ${parsed.error.message}`,
      });
      continue;
    }
    expressions[`validation:${rule.id}`] = parsed.expression;
    for (const identifier of parsed.expression.identifiers) {
      if (resolveIdentifier(identifier, path) !== null) referenced.add(identifier);
    }
  }

  // F4 悬空绑定:blocks 侧的每一个引用都必须解析得到。
  project.blocks.forEach((block, index) => {
    const path = `blocks[${index}]`;
    const requireComputation = (id: string, at: string): void => {
      if (computationIds.has(id)) {
        referenced.add(id);
        return;
      }
      errors.push({
        code: "interactive-doc-dangling-bind",
        path: at,
        message: `block ${block.id} 的 bind ${id} 指向不存在的 computation(F4)`,
      });
    };
    if (block.bind) requireComputation(block.bind, `${path}.bind`);
    for (const [rowIndex, row] of (block.table?.rows || []).entries()) {
      if (row.bind) requireComputation(row.bind, `${path}.table.rows[${rowIndex}].bind`);
    }
    if (block.table?.datasetId && !datasetIds.has(block.table.datasetId)) {
      errors.push({
        code: "interactive-doc-dangling-bind",
        path: `${path}.table.datasetId`,
        message: `block ${block.id} 的 datasetId ${block.table.datasetId} 不存在(F4)`,
      });
    }
    for (const [seriesIndex, series] of (block.chart?.series || []).entries()) {
      requireComputation(series.bind, `${path}.chart.series[${seriesIndex}].bind`);
    }
    if (block.formula) {
      requireComputation(block.formula.computationId, `${path}.formula.computationId`);
      for (const [stepIndex, step] of block.formula.steps.entries()) {
        const stepPath = `${path}.formula.steps[${stepIndex}].expression`;
        const parsed = parseInteractiveDocExpression(step.expression);
        if (!parsed.ok) {
          errors.push({
            code: "expression-invalid",
            path: stepPath,
            message: `${parsed.error.code}: ${parsed.error.message}`,
          });
          continue;
        }
        for (const identifier of parsed.expression.identifiers) {
          if (resolveIdentifier(identifier, stepPath) !== null) {
            referenced.add(identifier);
          }
        }
      }
    }
    for (const parameterId of block.parameterIds || []) {
      if (!parameterIds.has(parameterId)) {
        errors.push({
          code: "interactive-doc-dangling-bind",
          path: `${path}.parameterIds`,
          message: `block ${block.id} 的 parameterIds 含不存在的参数 ${parameterId}(F4)`,
        });
      }
    }
  });

  for (const [index, entry] of (project.attribution.entries || []).entries()) {
    if (entry.datasetId && !datasetIds.has(entry.datasetId)) {
      errors.push({
        code: "interactive-doc-dangling-bind",
        path: `attribution.entries[${index}].datasetId`,
        message: `署名条目引用了不存在的 dataset ${entry.datasetId}(F4)`,
      });
    }
  }

  // F2 环检出:DFS 保留路径,报出环上完整 id 序列。
  const cycle: string[] = [];
  const order: string[] = [];
  const depths = new Map<string, number>();
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];
  const visit = (id: string): number => {
    if (cycle.length > 0) return 0;
    const current = state.get(id);
    if (current === "done") return depths.get(id) || 1;
    if (current === "visiting") {
      const start = path.indexOf(id);
      cycle.push(...path.slice(start >= 0 ? start : 0), id);
      return 0;
    }
    state.set(id, "visiting");
    path.push(id);
    let deepest = 0;
    for (const edge of dependencies[id] || []) {
      deepest = Math.max(deepest, visit(edge));
      if (cycle.length > 0) return 0;
    }
    path.pop();
    state.set(id, "done");
    const depth = deepest + 1;
    depths.set(id, depth);
    order.push(id);
    return depth;
  };
  for (const node of project.computations) {
    visit(node.id);
    if (cycle.length > 0) break;
  }

  if (cycle.length > 0) {
    errors.push({
      code: "interactive-doc-cyclic",
      path: "computations",
      message: `计算图存在环:${cycle.join(" → ")}(F2;MUST NOT 求值)`,
      cycle: [...cycle],
    });
    return {
      state: "cyclic",
      order: [],
      depth: 0,
      cycle: [...cycle],
      dependencies,
      expressions,
      deadComputationIds: [],
      missingDatasetIds,
      errors,
    };
  }

  const depth = order.reduce((deepest, id) => Math.max(deepest, depths.get(id) || 0), 0);
  if (depth > INTERACTIVE_DOC_LIMITS.graphMaxDepth) {
    errors.push({
      code: "graph-too-deep",
      path: "computations",
      message: `计算图深度 ${depth} 超过 C9 上限 ${INTERACTIVE_DOC_LIMITS.graphMaxDepth}`,
    });
  }

  const deadComputationIds = project.computations
    .filter((node) => !referenced.has(node.id))
    .map((node) => node.id);

  const blocking = errors.filter(
    (error) => error.code !== "interactive-doc-dependency-missing",
  );
  // 外置 dataset 被表达式引用但本次没有行数据 —— 依赖件在闭包里也算不出来,
  // 按 §3.3 line 578 进 degraded,而不是 invalid(id 是可解析的)。
  const loaded = new Set<string>(options.loadedDatasetIds || []);
  const unloadedReferenced = (project.datasets || []).filter(
    (dataset) =>
      !("inline" in dataset.source) &&
      !loaded.has(dataset.id) &&
      referenced.has(dataset.id),
  );
  for (const dataset of unloadedReferenced) {
    if (missingDatasetIds.includes(dataset.id)) continue;
    errors.push({
      code: "interactive-doc-dependency-missing",
      path: `datasets[${dataset.id}]`,
      message: `dataset ${dataset.id} 已在闭包里声明但本次未载入行数据,求值进入 degraded(F7)`,
    });
  }
  const linkState: ComputeGraphState =
    blocking.length > 0
      ? "invalid"
      : missingDatasetIds.length > 0 || unloadedReferenced.length > 0
        ? "degraded"
        : "ready";

  return {
    state: linkState,
    order: linkState === "invalid" ? [] : order,
    depth,
    cycle: [],
    dependencies,
    expressions,
    deadComputationIds,
    missingDatasetIds,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 参数解析(§3.2 parameters + F5)
// ---------------------------------------------------------------------------

export type ParameterDiagnosticCode =
  | "parameter-type"
  | "parameter-out-of-range"
  | "parameter-not-integer"
  | "parameter-unknown-option"
  | "parameter-invalid-date";

export interface ParameterDiagnostic {
  code: ParameterDiagnosticCode;
  parameterId: string;
  message: string;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateValue(value: ComputeScalar): number | null {
  if (typeof value !== "string") return null;
  const normalized = DATE_ONLY_PATTERN.test(value) ? `${value}T00:00:00Z` : value;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveParameterValues(
  project: InteractiveDocProject,
  inputs: Record<string, unknown>,
): { values: Record<string, ComputeScalar>; diagnostics: ParameterDiagnostic[] } {
  const values: Record<string, ComputeScalar> = {};
  const diagnostics: ParameterDiagnostic[] = [];
  for (const parameter of project.parameters) {
    values[parameter.id] = resolveParameter(parameter, inputs, diagnostics);
  }
  return { values, diagnostics };
}

function resolveParameter(
  parameter: InteractiveDocParameter,
  inputs: Record<string, unknown>,
  diagnostics: ParameterDiagnostic[],
): ComputeScalar {
  const provided = Object.prototype.hasOwnProperty.call(inputs, parameter.id)
    ? inputs[parameter.id]
    : undefined;
  const raw: InteractiveDocScalar =
    provided === undefined || provided === null
      ? parameter.default
      : (provided as InteractiveDocScalar);
  const reject = (
    code: ParameterDiagnosticCode,
    message: string,
  ): InteractiveDocScalar => {
    diagnostics.push({ code, parameterId: parameter.id, message });
    return parameter.default;
  };

  switch (parameter.kind) {
    case "number":
    case "percent":
    case "currency":
    case "integer": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return reject("parameter-type", `${parameter.id} 需要有限数字`) as number;
      }
      let value = raw;
      if (parameter.kind === "integer" && !Number.isInteger(value)) {
        diagnostics.push({
          code: "parameter-not-integer",
          parameterId: parameter.id,
          message: `${parameter.id} 是整数参数,已按四舍五入取整`,
        });
        value = Math.round(value);
      }
      // F5:取值域由 §3.2 强制存在,渲染器 MUST NOT 用默认域兜;这里夹取并留痕。
      if (parameter.min !== undefined && value < parameter.min) {
        diagnostics.push({
          code: "parameter-out-of-range",
          parameterId: parameter.id,
          message: `${parameter.id} 低于 min ${parameter.min},已夹取`,
        });
        value = parameter.min;
      }
      if (parameter.max !== undefined && value > parameter.max) {
        diagnostics.push({
          code: "parameter-out-of-range",
          parameterId: parameter.id,
          message: `${parameter.id} 高于 max ${parameter.max},已夹取`,
        });
        value = parameter.max;
      }
      return value;
    }
    case "boolean":
      return typeof raw === "boolean"
        ? raw
        : (reject("parameter-type", `${parameter.id} 需要布尔值`) as boolean);
    case "enum": {
      const options = parameter.options || [];
      return options.some((option) => option.value === raw)
        ? raw
        : (reject(
            "parameter-unknown-option",
            `${parameter.id} 的取值不在 options 内`,
          ) as InteractiveDocScalar);
    }
    case "date":
      return typeof raw === "string" && parseDateValue(raw) !== null
        ? raw
        : (reject("parameter-invalid-date", `${parameter.id} 需要 ISO 日期`) as string);
    case "text":
      return typeof raw === "string"
        ? raw.slice(0, 2_000)
        : (reject("parameter-type", `${parameter.id} 需要字符串`) as string);
    default:
      return parameter.default;
  }
}

// ---------------------------------------------------------------------------
// §3.4 求值
// ---------------------------------------------------------------------------

export type EvalErrorCode =
  | "divide-by-zero"
  | "nan"
  | "expression-type"
  | "expression-column-ambiguous"
  | "dataset-unavailable"
  | "irr-not-converged"
  | "recompute-timeout";

export interface EvalDiagnostic {
  code: EvalErrorCode;
  path: string;
  message: string;
}

class EvalAbort extends Error {
  readonly code: EvalErrorCode;

  constructor(code: EvalErrorCode, message: string) {
    super(message);
    this.name = "EvalAbort";
    this.code = code;
  }
}

interface EvalScope {
  values: Record<string, ComputeValue>;
  guard: ComputeNodeGuard;
  path: string;
  diagnostics: EvalDiagnostic[];
}

const DEFAULT_GUARD: ComputeNodeGuard = Object.freeze({
  onDivideByZero: "null",
  onNaN: "null",
});

/** 整数指数走乘法,避免 Math.pow 的实现差异(§5.4 逐位一致)。 */
function deterministicPow(base: number, exponent: number): number {
  if (Number.isInteger(exponent) && Math.abs(exponent) <= 1_024) {
    let result = 1;
    const times = Math.abs(exponent);
    for (let index = 0; index < times; index += 1) result *= base;
    return exponent < 0 ? 1 / result : result;
  }
  return Math.pow(base, exponent);
}

export function roundTo(value: number, digits: number): number {
  const factor = deterministicPow(10, Math.max(0, Math.min(8, Math.trunc(digits))));
  return Math.round(value * factor) / factor;
}

function numeric(value: ComputeValue, label: string): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new EvalAbort("expression-type", `${label} 需要数值,实际是 ${describe(value)}`);
}

function describe(value: ComputeValue): string {
  if (value === null) return "null";
  if (isColumn(value)) return `column(${value.name})`;
  if (isDataset(value)) return `dataset(${value.id})`;
  return typeof value;
}

function numericVector(value: ComputeValue, label: string): number[] {
  const column = columnOf(value, label);
  return column.values.map((entry) => {
    if (typeof entry === "number") return entry;
    if (typeof entry === "boolean") return entry ? 1 : 0;
    const parsed = typeof entry === "string" ? Number(entry) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
    throw new EvalAbort("expression-type", `${label} 的列含非数值项`);
  });
}

/**
 * 文法里没有属性访问与下标访问,所以聚合函数的「列」只能整列取:
 * 传 column 直接用;传 dataset 时 MUST 恰有一个数值列,否则受控拒绝。
 */
function columnOf(value: ComputeValue, label: string): ComputeColumn {
  if (isColumn(value)) return value;
  if (isDataset(value)) {
    if (value.unloaded) {
      throw new EvalAbort(
        "dataset-unavailable",
        `dataset ${value.id} 的依赖件未载入(F7)`,
      );
    }
    const numericColumns = value.columns.filter(
      (column) => column.type === "number" || column.type === "integer",
    );
    if (numericColumns.length === 1) return numericColumns[0];
    throw new EvalAbort(
      "expression-column-ambiguous",
      `${label} 需要单一数值列,dataset ${value.id} 有 ${numericColumns.length} 个数值列;请用 lookup(dataset, key, "列名") 指名`,
    );
  }
  throw new EvalAbort("expression-type", `${label} 需要 dataset 或列,实际是 ${describe(value)}`);
}

function divide(
  left: number,
  right: number,
  operator: "/" | "%",
  scope: EvalScope,
): ComputeScalar {
  if (right === 0) {
    // §3.4 line 645:除法 MUST 走 guard.onDivideByZero,默认 null。
    scope.diagnostics.push({
      code: "divide-by-zero",
      path: scope.path,
      message: `除数为 0,按 guard.onDivideByZero=${scope.guard.onDivideByZero} 处理(F3)`,
    });
    switch (scope.guard.onDivideByZero) {
      case "zero":
        return 0;
      case "nan":
        return Number.NaN;
      case "error":
        throw new EvalAbort("divide-by-zero", "除数为 0 且 guard.onDivideByZero=error");
      default:
        return null;
    }
  }
  return operator === "/" ? left / right : left % right;
}

function compare(
  operator: ExpressionBinaryOperator,
  left: ComputeValue,
  right: ComputeValue,
): ComputeScalar {
  if (operator === "==" || operator === "!=") {
    const equal = left === right;
    return operator === "==" ? equal : !equal;
  }
  if (left === null || right === null) return false;
  const leftValue = isComputeScalar(left) ? left : Number.NaN;
  const rightValue = isComputeScalar(right) ? right : Number.NaN;
  if (typeof leftValue === "string" && typeof rightValue === "string") {
    switch (operator) {
      case "<":
        return leftValue < rightValue;
      case "<=":
        return leftValue <= rightValue;
      case ">":
        return leftValue > rightValue;
      default:
        return leftValue >= rightValue;
    }
  }
  const a = numeric(leftValue, "比较左值");
  const b = numeric(rightValue, "比较右值");
  if (a === null || b === null) return false;
  switch (operator) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    default:
      return a >= b;
  }
}

function truthy(value: ComputeValue): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && Number.isFinite(value);
  if (typeof value === "string") return value.length > 0;
  return true;
}

function npv(rate: number, cashflows: number[]): number {
  let total = 0;
  for (let index = 0; index < cashflows.length; index += 1) {
    const denominator = deterministicPow(1 + rate, index);
    if (denominator === 0) return Number.NaN;
    total += cashflows[index] / denominator;
  }
  return total;
}

/** C24:迭代上限 200 次,未收敛交给 guard.onNaN。 */
function irr(cashflows: number[]): number {
  let low = -0.9999;
  let high = 10;
  let lowValue = npv(low, cashflows);
  let highValue = npv(high, cashflows);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) return Number.NaN;
  if (lowValue === 0) return low;
  if (highValue === 0) return high;
  if (lowValue > 0 === highValue > 0) return Number.NaN;
  for (let iteration = 0; iteration < INTERACTIVE_DOC_LIMITS.irrIterationsMax; iteration += 1) {
    const middle = (low + high) / 2;
    const value = npv(middle, cashflows);
    if (!Number.isFinite(value)) return Number.NaN;
    if (value === 0) return middle;
    if (value > 0 === lowValue > 0) {
      low = middle;
      lowValue = value;
    } else {
      high = middle;
      highValue = value;
    }
  }
  return (low + high) / 2;
}

function pmt(rate: number, periods: number, principal: number): number {
  if (periods <= 0) return Number.NaN;
  if (rate === 0) return principal / periods;
  const factor = 1 - deterministicPow(1 + rate, -periods);
  if (factor === 0) return Number.NaN;
  return (principal * rate) / factor;
}

function median(values: number[]): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stdev(values: number[]): number {
  if (values.length < 2) return Number.NaN;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) * (value - mean), 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function lookup(
  dataset: ComputeValue,
  key: ComputeValue,
  columnName: ComputeValue,
): ComputeScalar {
  if (!isDataset(dataset)) {
    throw new EvalAbort("expression-type", "lookup 第一参数必须是 dataset");
  }
  if (dataset.unloaded) {
    throw new EvalAbort(
      "dataset-unavailable",
      `lookup 的 dataset ${dataset.id} 未载入(F7)`,
    );
  }
  if (typeof columnName !== "string") {
    throw new EvalAbort("expression-type", "lookup 第三参数必须是列名字符串");
  }
  const keyColumn = dataset.columns[0];
  const valueColumn = dataset.columns.find((column) => column.name === columnName);
  if (!keyColumn || !valueColumn) {
    throw new EvalAbort(
      "expression-type",
      `lookup 找不到列 ${columnName} 或 dataset ${dataset.id} 没有键列`,
    );
  }
  const index = keyColumn.values.findIndex((entry) => entry === key);
  return index < 0 ? null : (valueColumn.values[index] ?? null);
}

function daysBetween(from: ComputeValue, to: ComputeValue): ComputeScalar {
  const start = parseDateValue(isComputeScalar(from) ? from : null);
  const end = parseDateValue(isComputeScalar(to) ? to : null);
  if (start === null || end === null) {
    throw new EvalAbort("expression-type", "days 的两个参数必须是 ISO 日期字符串");
  }
  return Math.round((end - start) / 86_400_000);
}

function callFunction(
  node: Extract<ExpressionNode, { type: "call" }>,
  evaluate: (child: ExpressionNode) => ComputeValue,
): ComputeValue {
  const name = node.name;
  if (name === "if") {
    return truthy(evaluate(node.args[0]))
      ? evaluate(node.args[1])
      : evaluate(node.args[2]);
  }
  const args = node.args.map(evaluate);
  const asNumber = (index: number): number | null =>
    numeric(args[index], `${name} 第 ${index + 1} 参数`);
  const requireNumber = (index: number): number => {
    const value = asNumber(index);
    if (value === null) throw new EvalAbort("nan", `${name} 收到 null 参数`);
    return value;
  };
  switch (name) {
    case "abs":
      return args[0] === null ? null : Math.abs(requireNumber(0));
    case "min":
    case "max": {
      const numbers = args.map((_, index) => asNumber(index));
      if (numbers.some((value) => value === null)) return null;
      const finite = numbers as number[];
      return name === "min" ? Math.min(...finite) : Math.max(...finite);
    }
    case "round":
      return args[0] === null ? null : roundTo(requireNumber(0), requireNumber(1));
    case "floor":
      return args[0] === null ? null : Math.floor(requireNumber(0));
    case "ceil":
      return args[0] === null ? null : Math.ceil(requireNumber(0));
    case "pow":
      return args[0] === null || args[1] === null
        ? null
        : deterministicPow(requireNumber(0), requireNumber(1));
    case "sqrt": {
      if (args[0] === null) return null;
      const value = requireNumber(0);
      return value < 0 ? Number.NaN : Math.sqrt(value);
    }
    case "exp":
      return args[0] === null ? null : Math.exp(requireNumber(0));
    case "ln": {
      if (args[0] === null) return null;
      const value = requireNumber(0);
      return value <= 0 ? Number.NaN : Math.log(value);
    }
    case "log10": {
      if (args[0] === null) return null;
      const value = requireNumber(0);
      return value <= 0 ? Number.NaN : Math.log10(value);
    }
    case "sum":
      return numericVector(args[0], "sum").reduce((total, value) => total + value, 0);
    case "avg": {
      const values = numericVector(args[0], "avg");
      return values.length
        ? values.reduce((total, value) => total + value, 0) / values.length
        : Number.NaN;
    }
    case "count": {
      const value = args[0];
      if (isDataset(value)) {
        if (value.unloaded) {
          throw new EvalAbort(
            "dataset-unavailable",
            `count 的 dataset ${value.id} 未载入(F7)`,
          );
        }
        return value.rowCount;
      }
      return columnOf(value, "count").values.length;
    }
    case "median":
      return median(numericVector(args[0], "median"));
    case "stdev":
      return stdev(numericVector(args[0], "stdev"));
    case "npv":
      return npv(requireNumber(0), numericVector(args[1], "npv"));
    case "irr":
      return irr(numericVector(args[0], "irr"));
    case "pmt":
      return pmt(requireNumber(0), requireNumber(1), requireNumber(2));
    case "clamp": {
      if (args[0] === null) return null;
      const value = requireNumber(0);
      return Math.min(Math.max(value, requireNumber(1)), requireNumber(2));
    }
    case "lookup":
      return lookup(args[0], args[1], args[2]);
    case "days":
      return daysBetween(args[0], args[1]);
    case "coalesce": {
      for (const value of args) {
        if (value !== null) return value;
      }
      return null;
    }
    default:
      // parseInteractiveDocExpression 已按白名单挡掉,这里是兜底。
      throw new EvalAbort("expression-type", `函数 ${name} 不在 §3.4 白名单内`);
  }
}

function evaluateNode(node: ExpressionNode, scope: EvalScope): ComputeValue {
  const evaluate = (child: ExpressionNode): ComputeValue => evaluateNode(child, scope);
  switch (node.type) {
    case "number":
      return node.value;
    case "string":
      return node.value;
    case "boolean":
      return node.value;
    case "ident": {
      const value = scope.values[node.name];
      return value === undefined ? null : value;
    }
    case "call":
      return callFunction(node, evaluate);
    case "unary": {
      const value = evaluate(node.argument);
      if (node.operator === "!") return !truthy(value);
      if (value === null) return null;
      const number = numeric(value, "一元负号");
      return number === null ? null : -number;
    }
    case "logical": {
      const left = evaluate(node.left);
      if (node.operator === "&&") {
        return truthy(left) ? truthy(evaluate(node.right)) : false;
      }
      return truthy(left) ? true : truthy(evaluate(node.right));
    }
    case "conditional":
      return truthy(evaluate(node.test))
        ? evaluate(node.consequent)
        : evaluate(node.alternate);
    case "binary": {
      const left = evaluate(node.left);
      const right = evaluate(node.right);
      if (["==", "!=", "<", "<=", ">", ">="].includes(node.operator)) {
        return compare(node.operator, left, right);
      }
      if (
        node.operator === "+" &&
        typeof left === "string" &&
        typeof right === "string"
      ) {
        return (left + right).slice(0, 2_000);
      }
      if (left === null || right === null) return null;
      const a = numeric(left, "运算左值");
      const b = numeric(right, "运算右值");
      if (a === null || b === null) return null;
      switch (node.operator) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        default:
          return divide(a, b, node.operator as "/" | "%", scope);
      }
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// datasets → 值
// ---------------------------------------------------------------------------

export interface InteractiveDocDatasetRows {
  [datasetId: string]: unknown[][];
}

function datasetValue(
  dataset: InteractiveDocDataset,
  rows: unknown[][] | undefined,
): ComputeDatasetValue {
  const inline = "inline" in dataset.source ? dataset.source.inline : undefined;
  const source = rows ?? inline;
  const unloaded = source === undefined;
  const columns: ComputeColumn[] = dataset.columns.map((column, columnIndex) => ({
    kind: "column",
    name: column.name,
    type: column.type,
    values: (source || []).map((row) => normalizeCell(row?.[columnIndex], column.type)),
  }));
  return {
    kind: "dataset",
    id: dataset.id,
    columns,
    rowCount: (source || []).length,
    unloaded,
  };
}

function normalizeCell(value: unknown, type: InteractiveDocColumnType): ComputeScalar {
  if (value === null || value === undefined) return null;
  if (type === "number" || type === "integer") {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) return null;
    return type === "integer" ? Math.trunc(number) : number;
  }
  if (type === "boolean") return Boolean(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "string" ? value : String(value);
  }
  return null;
}

// ---------------------------------------------------------------------------
// §3.3 computing:evaluateComputeGraph
// ---------------------------------------------------------------------------

export interface ComputeValidationOutcome {
  id: string;
  severity: InteractiveDocSeverity;
  message: string;
  passed: boolean;
  /** assert 未求出布尔值(§3.4 assert 必须是布尔表达式)。 */
  indeterminate: boolean;
}

export interface EvaluateComputeGraphOptions {
  now?: () => number;
  /** 超时降级时保留的上一轮结果(§3.3 `computing → degraded`,§5.3)。 */
  previousValues?: Record<string, ComputeValue>;
  link?: InteractiveDocLinkResult;
  datasetRows?: InteractiveDocDatasetRows;
  availableDependencyPaths?: Iterable<string>;
}

export interface ComputeGraphResult {
  ok: boolean;
  state: ComputeGraphState;
  /** computation id → 值。§5.3:MUST NOT 把 NaN / Infinity 交到呈现层。 */
  values: Record<string, ComputeValue>;
  parameters: Record<string, ComputeScalar>;
  /** dataset id → 列值,呈现层的 table / chart 直接取这里,不再自己读源。 */
  datasets: Record<string, ComputeDatasetValue>;
  /** computation id → 传递闭包内的 parameters id(WCAG 2.2 SC 1.3.1:结果卡 MUST 声明依赖)。 */
  parameterDependencies: Record<string, string[]>;
  order: string[];
  depth: number;
  cycle: string[];
  validation: ComputeValidationOutcome[];
  graphErrors: InteractiveDocGraphError[];
  diagnostics: EvalDiagnostic[];
  parameterDiagnostics: ParameterDiagnostic[];
  /** 值来自上一轮(超时降级),呈现层 MUST 标注过期。 */
  stale: boolean;
  elapsedMs: number;
}

/** SC 1.3.1:每个结果卡都要能说出「我依赖哪些参数」,这里给传递闭包。 */
function parameterClosure(
  project: InteractiveDocProject,
  link: InteractiveDocLinkResult,
): Record<string, string[]> {
  const parameterIds = new Set(project.parameters.map((entry) => entry.id));
  const closure: Record<string, string[]> = {};
  const resolve = (id: string, seen: Set<string>): string[] => {
    if (closure[id]) return closure[id];
    if (seen.has(id)) return [];
    seen.add(id);
    const direct = new Set<string>();
    for (const identifier of link.expressions[id]?.identifiers || []) {
      if (parameterIds.has(identifier)) direct.add(identifier);
    }
    for (const edge of link.dependencies[id] || []) {
      for (const inherited of resolve(edge, seen)) direct.add(inherited);
    }
    const sorted = [...direct].sort();
    closure[id] = sorted;
    return sorted;
  };
  for (const node of project.computations) resolve(node.id, new Set());
  return closure;
}

function guardedResult(
  raw: ComputeValue,
  node: ComputeNode,
  scope: EvalScope,
): ComputeValue {
  let value = raw;
  if (typeof value === "number" && !Number.isFinite(value)) {
    // §3.4 line 646 / F3:NaN MUST 走 guard.onNaN,默认 null。
    scope.diagnostics.push({
      code: "nan",
      path: `computations[${node.id}]`,
      message: `节点 ${node.id} 产出非有限值,按 guard.onNaN=${scope.guard.onNaN} 处理(F3)`,
    });
    if (scope.guard.onNaN === "error") {
      throw new EvalAbort("nan", `节点 ${node.id} 产出 NaN 且 guard.onNaN=error`);
    }
    value = null;
  }
  if (typeof value === "number") {
    if (scope.guard.clampMin !== undefined) value = Math.max(value, scope.guard.clampMin);
    if (scope.guard.clampMax !== undefined) value = Math.min(value, scope.guard.clampMax);
  }
  return value;
}

export function evaluateComputeGraph(
  project: InteractiveDocProject,
  inputs: Record<string, unknown>,
  options: EvaluateComputeGraphOptions = {},
): ComputeGraphResult {
  const now = options.now || Date.now;
  const startedAt = now();
  const link =
    options.link ||
    linkInteractiveDocProject(project, {
      availableDependencyPaths: options.availableDependencyPaths,
      loadedDatasetIds: Object.keys(options.datasetRows || {}),
    });
  const { values: parameters, diagnostics: parameterDiagnostics } =
    resolveParameterValues(project, inputs);

  // §3.3 非法迁移:cyclic → computing、invalid → computing 一律不发生。
  if (link.state === "cyclic" || link.state === "invalid") {
    return {
      ok: false,
      state: link.state,
      values: {},
      parameters,
      datasets: {},
      parameterDependencies: {},
      order: [],
      depth: link.depth,
      cycle: link.cycle,
      validation: [],
      graphErrors: link.errors,
      diagnostics: [],
      parameterDiagnostics,
      stale: false,
      elapsedMs: now() - startedAt,
    };
  }

  const scopeValues: Record<string, ComputeValue> = { ...parameters };
  const datasets: Record<string, ComputeDatasetValue> = {};
  for (const dataset of project.datasets || []) {
    datasets[dataset.id] = datasetValue(dataset, options.datasetRows?.[dataset.id]);
    scopeValues[dataset.id] = datasets[dataset.id];
  }

  const diagnostics: EvalDiagnostic[] = [];
  const values: Record<string, ComputeValue> = {};
  const nodesById = new Map(project.computations.map((node) => [node.id, node]));
  const budget = project.interactions.maxRecomputeMs;
  let timedOut = false;

  for (const id of link.order) {
    const node = nodesById.get(id);
    if (!node) continue;
    if (now() - startedAt > budget) {
      timedOut = true;
      diagnostics.push({
        code: "recompute-timeout",
        path: `computations[${id}]`,
        message: `重算超过 interactions.maxRecomputeMs=${budget} ms,保留上一轮结果并标注过期(§3.3 / C16)`,
      });
      break;
    }
    const scope: EvalScope = {
      values: scopeValues,
      guard: node.guard || DEFAULT_GUARD,
      path: `computations[${id}]`,
      diagnostics,
    };
    const ast = link.expressions[id]?.ast;
    if (!ast) {
      values[id] = null;
      continue;
    }
    let value: ComputeValue = null;
    try {
      value = guardedResult(evaluateNode(ast, scope), node, scope);
    } catch (caught) {
      if (caught instanceof EvalAbort) {
        diagnostics.push({
          code: caught.code,
          path: `computations[${id}]`,
          message: caught.message,
        });
        value = null;
      } else {
        throw caught;
      }
    }
    values[id] = value;
    scopeValues[id] = value;
  }

  if (timedOut) {
    for (const [id, previous] of Object.entries(options.previousValues || {})) {
      if (values[id] === undefined) {
        values[id] = previous;
        scopeValues[id] = previous;
      }
    }
  }

  const validation: ComputeValidationOutcome[] = (project.validation || []).map(
    (rule) => evaluateRule(rule, scopeValues, diagnostics),
  );

  const state: ComputeGraphState = timedOut
    ? "degraded"
    : link.state === "degraded"
      ? "degraded"
      : "ready";

  return {
    ok: state === "ready",
    state,
    values,
    parameters,
    datasets,
    parameterDependencies: parameterClosure(project, link),
    order: link.order,
    depth: link.depth,
    cycle: link.cycle,
    validation,
    graphErrors: link.errors,
    diagnostics,
    parameterDiagnostics,
    stale: timedOut,
    elapsedMs: now() - startedAt,
  };
}

export interface EvaluateExpressionResult {
  ok: boolean;
  value: ComputeValue;
  diagnostics: EvalDiagnostic[];
  error: ExpressionError | EvalDiagnostic | null;
}

/** 求值单条表达式(`blocks[].formula.steps[]` 展开、编辑器预览共用同一台机器)。 */
export function evaluateExpressionValue(
  source: string,
  values: Record<string, ComputeValue>,
  guard: ComputeNodeGuard = DEFAULT_GUARD,
  path = "expression",
): EvaluateExpressionResult {
  const parsed = parseInteractiveDocExpression(source);
  if (!parsed.ok) {
    return { ok: false, value: null, diagnostics: [], error: parsed.error };
  }
  const diagnostics: EvalDiagnostic[] = [];
  const scope: EvalScope = { values, guard, path, diagnostics };
  try {
    const value = evaluateNode(parsed.expression.ast, scope);
    const finite = typeof value === "number" && !Number.isFinite(value) ? null : value;
    return { ok: true, value: finite, diagnostics, error: null };
  } catch (caught) {
    if (caught instanceof EvalAbort) {
      const diagnostic: EvalDiagnostic = {
        code: caught.code,
        path,
        message: caught.message,
      };
      diagnostics.push(diagnostic);
      return { ok: false, value: null, diagnostics, error: diagnostic };
    }
    throw caught;
  }
}

/** 呈现层拿到的求值作用域:参数 + 计算结果 + dataset,三者同名域(§3.4 line 612)。 */
export function computeScope(
  result: ComputeGraphResult,
): Record<string, ComputeValue> {
  return { ...result.parameters, ...result.datasets, ...result.values };
}

function evaluateRule(
  rule: InteractiveDocValidationRule,
  values: Record<string, ComputeValue>,
  diagnostics: EvalDiagnostic[],
): ComputeValidationOutcome {
  const parsed = parseInteractiveDocExpression(rule.assert);
  if (!parsed.ok) {
    return {
      id: rule.id,
      severity: rule.severity,
      message: rule.message,
      passed: false,
      indeterminate: true,
    };
  }
  const scope: EvalScope = {
    values,
    guard: DEFAULT_GUARD,
    path: `validation[${rule.id}]`,
    diagnostics,
  };
  try {
    const outcome = evaluateNode(parsed.ast, scope);
    if (typeof outcome !== "boolean") {
      return {
        id: rule.id,
        severity: rule.severity,
        message: rule.message,
        passed: false,
        indeterminate: true,
      };
    }
    return {
      id: rule.id,
      severity: rule.severity,
      message: rule.message,
      passed: outcome,
      indeterminate: false,
    };
  } catch (caught) {
    if (caught instanceof EvalAbort) {
      diagnostics.push({
        code: caught.code,
        path: `validation[${rule.id}]`,
        message: caught.message,
      });
      return {
        id: rule.id,
        severity: rule.severity,
        message: rule.message,
        passed: false,
        indeterminate: true,
      };
    }
    throw caught;
  }
}

// ---------------------------------------------------------------------------
// §3.5 三表勾稽(下游 D 档与三表模型族的接口)
// ---------------------------------------------------------------------------

export const THREE_STATEMENT_TIE_IDS = Object.freeze([
  "balance_identity",
  "cash_tie",
  "retained_earnings_roll",
] as const);

export type ThreeStatementTieId = (typeof THREE_STATEMENT_TIE_IDS)[number];

export interface ThreeStatementTieBindings {
  totalAssets?: string;
  totalLiabilities?: string;
  totalEquity?: string;
  endingCash?: string;
  beginningCash?: string;
  netCashFlow?: string;
  retainedEarningsEnd?: string;
  retainedEarningsBegin?: string;
  netIncome?: string;
  dividends?: string;
  tolerance?: number;
}

/**
 * §3.5 line 650-656:三表模型 MUST 用 `validation[]` 表达勾稽,MUST NOT 靠约定。
 * 下游族(三表模型 / 台账 / 计算器)直接取这三条,容差取 C25 = 0.01 元。
 */
export function threeStatementTieValidations(
  bindings: ThreeStatementTieBindings = {},
): InteractiveDocValidationRule[] {
  const {
    totalAssets = "total_assets",
    totalLiabilities = "total_liabilities",
    totalEquity = "total_equity",
    endingCash = "ending_cash",
    beginningCash = "beginning_cash",
    netCashFlow = "net_cash_flow",
    retainedEarningsEnd = "re_end",
    retainedEarningsBegin = "re_begin",
    netIncome = "net_income",
    dividends = "dividends",
    tolerance = INTERACTIVE_DOC_LIMITS.threeStatementTolerance,
  } = bindings;
  return [
    {
      id: "balance_identity",
      assert: `abs(${totalAssets} - (${totalLiabilities} + ${totalEquity})) <= ${tolerance}`,
      message: "资产 ≠ 负债 + 所有者权益,资产负债表不平",
      severity: "error",
      tolerance,
    },
    {
      id: "cash_tie",
      assert: `abs(${endingCash} - (${beginningCash} + ${netCashFlow})) <= ${tolerance}`,
      message: "期末现金 ≠ 期初现金 + 净现金流,现金勾稽断裂",
      severity: "error",
      tolerance,
    },
    {
      id: "retained_earnings_roll",
      assert: `abs(${retainedEarningsEnd} - (${retainedEarningsBegin} + ${netIncome} - ${dividends})) <= ${tolerance}`,
      message: "留存收益结转不平:期末 ≠ 期初 + 净利 − 分红",
      severity: "error",
      tolerance,
    },
  ];
}

export interface ThreeStatementTieAssessment {
  ok: boolean;
  missing: string[];
  wrongSeverity: string[];
  failed: string[];
}

/**
 * F8:`docKind = three-statement-model` 时三条 `severity = error` 的勾稽必须齐,
 * 且在给定输入下真的成立。
 */
export function assessThreeStatementTies(
  project: InteractiveDocProject,
  compute?: ComputeGraphResult,
): ThreeStatementTieAssessment {
  const rules = new Map((project.validation || []).map((rule) => [rule.id, rule]));
  const missing: string[] = [];
  const wrongSeverity: string[] = [];
  for (const id of THREE_STATEMENT_TIE_IDS) {
    const rule = rules.get(id);
    if (!rule) {
      missing.push(id);
      continue;
    }
    if (rule.severity !== "error") wrongSeverity.push(id);
  }
  const failed = (compute?.validation || [])
    .filter(
      (outcome) =>
        (THREE_STATEMENT_TIE_IDS as readonly string[]).includes(outcome.id) &&
        !outcome.passed,
    )
    .map((outcome) => outcome.id);
  return {
    ok: missing.length === 0 && wrongSeverity.length === 0 && failed.length === 0,
    missing,
    wrongSeverity,
    failed,
  };
}

// ---------------------------------------------------------------------------
// §5.1 行为判据 + §8 完备判据
// ---------------------------------------------------------------------------

function alternateParameterValue(
  parameter: InteractiveDocParameter,
  current: ComputeScalar,
): InteractiveDocScalar | null {
  switch (parameter.kind) {
    case "boolean":
      return !(current === true);
    case "enum": {
      const other = (parameter.options || []).find(
        (option) => option.value !== current,
      );
      return other ? other.value : null;
    }
    case "date": {
      const parsed = parseDateValue(current);
      if (parsed === null) return null;
      return new Date(parsed + 86_400_000).toISOString().slice(0, 10);
    }
    case "text":
      return `${String(current ?? "")}·`;
    default: {
      const base = typeof current === "number" ? current : 0;
      const min = parameter.min ?? base - 1;
      const max = parameter.max ?? base + 1;
      const step = parameter.step ?? (parameter.kind === "integer" ? 1 : (max - min) / 8);
      const raised = Math.min(max, base + Math.abs(step || 1));
      if (raised !== base) {
        return parameter.kind === "integer" ? Math.round(raised) : raised;
      }
      const lowered = Math.max(min, base - Math.abs(step || 1));
      if (lowered === base) return null;
      return parameter.kind === "integer" ? Math.round(lowered) : lowered;
    }
  }
}

function presentationSignature(
  project: InteractiveDocProject,
  compute: ComputeGraphResult,
): string {
  const bound = [...boundComputationIds(project)].sort();
  return JSON.stringify(bound.map((id) => [id, compute.values[id] ?? null]));
}

export interface ReactivityProbe {
  parameterId: string;
  /** 改这个参数后是否有 metric / table / chart 的呈现值变化(§5.1 line 717 / A4)。 */
  reactive: boolean;
  reason: string;
}

export interface ReactivityAssessment {
  /** 至少一个参数能撬动呈现值 —— 这是「素材自带行为」的可判形式。 */
  ok: boolean;
  probes: ReactivityProbe[];
}

export function probeInteractiveDocReactivity(
  project: InteractiveDocProject,
  options: EvaluateComputeGraphOptions = {},
): ReactivityAssessment {
  const baseline = evaluateComputeGraph(project, {}, options);
  const baselineSignature = presentationSignature(project, baseline);
  const probes: ReactivityProbe[] = project.parameters.map((parameter) => {
    const alternate = alternateParameterValue(
      parameter,
      baseline.parameters[parameter.id] ?? null,
    );
    if (alternate === null) {
      return {
        parameterId: parameter.id,
        reactive: false,
        reason: "取值域内没有第二个可取值",
      };
    }
    const next = evaluateComputeGraph(
      project,
      { [parameter.id]: alternate },
      options,
    );
    const changed = presentationSignature(project, next) !== baselineSignature;
    return {
      parameterId: parameter.id,
      reactive: changed,
      reason: changed ? "呈现值随参数变化" : "呈现值未变化(排版文档特征)",
    };
  });
  return {
    ok: baseline.state === "ready" && probes.some((probe) => probe.reactive),
    probes,
  };
}

export type CompletenessCode =
  | "interactive-doc-inert"
  | "source-too-small"
  | "prose-too-short"
  | "dead-computations"
  | "attribution-missing"
  | "title-too-short"
  | "quiz-too-few"
  | "three-statement-ties-missing"
  | "spaced-repetition-nodes-missing"
  | "not-reactive"
  | "graph-not-ready";

export interface CompletenessFailure {
  code: CompletenessCode;
  message: string;
}

export interface CompletenessAssessment {
  ok: boolean;
  sourceBytes: number;
  failures: CompletenessFailure[];
  /** 数据层判不了、必须由抓帧承担的判据(§8.2 line 889 的 ≥ 16 色)。 */
  deferred: string[];
}

export interface CompletenessOptions extends EvaluateComputeGraphOptions {
  /** 跳过行为探针(仅结构判据)。默认 false —— 静态文档 MUST 判不合格。 */
  skipReactivity?: boolean;
}

/**
 * §8.1 字节下限 + §8.2 完备判据在数据层的落地。
 * F1「排版冒充计算」的正面解:静态、无行为的文档在这里必然不合格。
 */
export function assessInteractiveDocCompleteness(
  project: InteractiveDocProject,
  options: CompletenessOptions = {},
): CompletenessAssessment {
  const failures: CompletenessFailure[] = [];
  const sourceBytes = interactiveDocSourceByteLength(project);
  if (sourceBytes < INTERACTIVE_DOC_LIMITS.sourceBytesMin) {
    failures.push({
      code: "source-too-small",
      message: `source ${sourceBytes} B 低于 §8.1 下限 ${INTERACTIVE_DOC_LIMITS.sourceBytesMin} B(C39)`,
    });
  }
  // F1 line 756:四者任一成立即 interactive-doc-inert。
  const presentation = presentationBlocks(project);
  if (
    project.parameters.length < INTERACTIVE_DOC_LIMITS.parametersMin ||
    project.computations.length < INTERACTIVE_DOC_LIMITS.computationsMin ||
    project.blocks.length < INTERACTIVE_DOC_LIMITS.blocksMin ||
    presentation.length < 1
  ) {
    failures.push({
      code: "interactive-doc-inert",
      message: `排版冒充计算(F1):parameters=${project.parameters.length} computations=${project.computations.length} blocks=${project.blocks.length} 呈现块=${presentation.length}`,
    });
  }
  const prose = proseCharacterCount(project);
  if (prose < INTERACTIVE_DOC_PROSE_MIN_CHARS) {
    failures.push({
      code: "prose-too-short",
      message: `prose 正文合计 ${prose} 字符,低于 §8.2 的 ${INTERACTIVE_DOC_PROSE_MIN_CHARS}`,
    });
  }
  const bound = boundComputationIds(project);
  const boundCount = project.computations.filter((node) => bound.has(node.id)).length;
  const ratio = project.computations.length
    ? boundCount / project.computations.length
    : 0;
  if (ratio < INTERACTIVE_DOC_BOUND_COMPUTATION_RATIO) {
    failures.push({
      code: "dead-computations",
      message: `被 blocks[].bind 引用的 computations 占比 ${(ratio * 100).toFixed(1)}%,低于 §8.2 的 50%(§5.1 死节点)`,
    });
  }
  const entries = project.attribution.entries || [];
  if (
    entries.length < 1 ||
    entries.some((entry) => !entry.text || !entry.licenseCode || !entry.licenseUrl)
  ) {
    failures.push({
      code: "attribution-missing",
      message: "attribution.entries 至少 1 条且 text / licenseCode / licenseUrl 三字段齐全",
    });
  }
  if (project.metadata.title.length < INTERACTIVE_DOC_TITLE_MIN_CHARS) {
    failures.push({
      code: "title-too-short",
      message: `metadata.title 长度 ${project.metadata.title.length} < ${INTERACTIVE_DOC_TITLE_MIN_CHARS}`,
    });
  }
  if (project.metadata.docKind === "quiz") {
    const items = quizItemCount(project);
    if (items < INTERACTIVE_DOC_LIMITS.quizItemsMin) {
      failures.push({
        code: "quiz-too-few",
        message: `docKind = quiz 需要 ≥ ${INTERACTIVE_DOC_LIMITS.quizItemsMin} 题,实际 ${items}(C32)`,
      });
    }
  }
  if (project.metadata.docKind === "three-statement-model") {
    const ties = assessThreeStatementTies(project);
    if (ties.missing.length > 0 || ties.wrongSeverity.length > 0) {
      failures.push({
        code: "three-statement-ties-missing",
        message: `三表勾稽缺失 ${ties.missing.join(",") || "无"} / 严重级不对 ${
          ties.wrongSeverity.join(",") || "无"
        }(F8 / §3.5)`,
      });
    }
    if (errorSeverityRuleCount(project) < 3) {
      failures.push({
        code: "three-statement-ties-missing",
        message: `docKind = three-statement-model 需要 ≥ 3 条 severity = error 的 validation(§8.2 line 891)`,
      });
    }
  }
  if (project.metadata.docKind === "spaced-repetition") {
    const text = project.computations
      .map((node) => `${node.id} ${node.label || ""} ${node.expression}`)
      .join("\n")
      .toLowerCase();
    const hasEasiness = /\bef\b|easiness|easefactor|ease_factor/.test(text);
    const hasInterval = /interval/.test(text);
    if (!hasEasiness || !hasInterval) {
      failures.push({
        code: "spaced-repetition-nodes-missing",
        message:
          "docKind = spaced-repetition 需要 EF 更新与间隔递推两个节点(§8.2 line 892 / C26-C30)",
      });
    }
  }
  if (!options.skipReactivity) {
    const link = linkInteractiveDocProject(project, {
      availableDependencyPaths: options.availableDependencyPaths,
      loadedDatasetIds: Object.keys(options.datasetRows || {}),
    });
    if (link.state === "invalid" || link.state === "cyclic") {
      failures.push({
        code: "graph-not-ready",
        message: `计算图不可用(${link.state}):${link.errors
          .map((error) => error.code)
          .join(",")}`,
      });
    } else {
      const reactivity = probeInteractiveDocReactivity(project, options);
      if (!reactivity.ok) {
        failures.push({
          code: "not-reactive",
          message:
            "改任一参数都不影响 metric / table / chart 的呈现值(§5.1 line 717:这是排版文档,应改用 document 载体)",
        });
      }
    }
  }
  return {
    ok: failures.length === 0,
    sourceBytes,
    failures,
    deferred: [
      `抓帧颜色数 ≥ ${INTERACTIVE_DOC_LIMITS.frameColorsMin} 种(§8.2 line 889;需渲染层抓帧)`,
    ],
  };
}

// ---------------------------------------------------------------------------
// F6 孪生判定
// ---------------------------------------------------------------------------

function similarityTokens(project: InteractiveDocProject): Set<string> {
  const tokens = new Set<string>();
  for (const parameter of project.parameters) {
    tokens.add(
      `p:${parameter.id}:${parameter.kind}:${parameter.min ?? ""}:${
        parameter.max ?? ""
      }:${String(parameter.default)}`,
    );
  }
  for (const node of project.computations) {
    tokens.add(`c:${node.id}:${node.expression.replace(/\s+/g, "")}`);
  }
  for (const rule of project.validation || []) {
    tokens.add(`v:${rule.id}:${rule.assert.replace(/\s+/g, "")}`);
  }
  return tokens;
}

export interface InteractiveDocSimilarity {
  jaccard: number;
  /** ≥ C44 = 0.99:MUST 拒绝入库。 */
  twin: boolean;
  /** ≥ C43 = 0.85:MUST 要求 parameters 或 computations 有实质差异。 */
  family: boolean;
}

export function interactiveDocSimilarity(
  left: InteractiveDocProject,
  right: InteractiveDocProject,
): InteractiveDocSimilarity {
  const a = similarityTokens(left);
  const b = similarityTokens(right);
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  const union = a.size + b.size - shared;
  const jaccard = union === 0 ? 1 : shared / union;
  return {
    jaccard,
    twin: jaccard >= INTERACTIVE_DOC_LIMITS.twinJaccardMax,
    family: jaccard >= INTERACTIVE_DOC_LIMITS.familyJaccardMax,
  };
}
