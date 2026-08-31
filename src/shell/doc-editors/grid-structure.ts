import {
  evaluateGridCell,
  gridColumnName,
  inspectGridFormula,
  parseGridReference,
} from "./grid-formula";
import type { GridCellFormat } from "./grid-model";

export interface GridRange {
  firstRow: number;
  lastRow: number;
  firstCol: number;
  lastCol: number;
}

export interface GridMerge extends GridRange {}

export type GridConditionalOperator =
  | "greater-than"
  | "less-than"
  | "equal"
  | "not-equal"
  | "contains";

export interface GridConditionalFormat {
  id: string;
  range: GridRange;
  operator: GridConditionalOperator;
  value: string;
  color?: string;
  background?: string;
  bold?: boolean;
}

const COLOR = /^#[0-9a-f]{6}$/i;

function finiteInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  const numeric = Number(value);
  return Math.max(
    0,
    Math.min(maximum, Number.isFinite(numeric) ? Math.floor(numeric) : fallback),
  );
}

function normalizeRange(
  value: unknown,
  maxRows: number,
  maxCols: number,
): GridRange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const firstRow = finiteInteger(source.firstRow, 0, maxRows - 1);
  const lastRow = finiteInteger(source.lastRow, firstRow, maxRows - 1);
  const firstCol = finiteInteger(source.firstCol, 0, maxCols - 1);
  const lastCol = finiteInteger(source.lastCol, firstCol, maxCols - 1);
  return {
    firstRow: Math.min(firstRow, lastRow),
    lastRow: Math.max(firstRow, lastRow),
    firstCol: Math.min(firstCol, lastCol),
    lastCol: Math.max(firstCol, lastCol),
  };
}

export function rangesIntersect(left: GridRange, right: GridRange): boolean {
  return !(
    left.lastRow < right.firstRow ||
    left.firstRow > right.lastRow ||
    left.lastCol < right.firstCol ||
    left.firstCol > right.lastCol
  );
}

export function rangeContainsCell(
  range: GridRange,
  row: number,
  col: number,
): boolean {
  return (
    row >= range.firstRow &&
    row <= range.lastRow &&
    col >= range.firstCol &&
    col <= range.lastCol
  );
}

export function normalizeGridMerges(
  value: unknown,
  maxRows: number,
  maxCols: number,
): GridMerge[] {
  const result: GridMerge[] = [];
  for (const entry of Array.isArray(value) ? value.slice(0, 1_000) : []) {
    const range = normalizeRange(entry, maxRows, maxCols);
    if (
      !range ||
      (range.firstRow === range.lastRow && range.firstCol === range.lastCol) ||
      result.some((current) => rangesIntersect(current, range))
    ) {
      continue;
    }
    result.push(range);
  }
  return result;
}

export function normalizeGridConditionalFormats(
  value: unknown,
  maxRows: number,
  maxCols: number,
): GridConditionalFormat[] {
  const used = new Set<string>();
  return (Array.isArray(value) ? value.slice(0, 500) : []).flatMap(
    (entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const source = entry as Record<string, unknown>;
      const range = normalizeRange(source.range || source, maxRows, maxCols);
      const operator = String(source.operator) as GridConditionalOperator;
      if (
        !range ||
        !["greater-than", "less-than", "equal", "not-equal", "contains"].includes(
          operator,
        )
      ) {
        return [];
      }
      let id = String(source.id || `conditional-${index + 1}`)
        .replace(/[^a-z0-9_.:-]/gi, "-")
        .slice(0, 80);
      if (!id || used.has(id)) id = `conditional-${index + 1}`;
      used.add(id);
      const color = String(source.color || "");
      const background = String(source.background || "");
      return [
        {
          id,
          range,
          operator,
          value: String(source.value ?? "").slice(0, 240),
          ...(COLOR.test(color) ? { color } : {}),
          ...(COLOR.test(background) ? { background } : {}),
          ...(source.bold === true ? { bold: true } : {}),
        },
      ];
    },
  );
}

export function gridMergeAt(
  merges: readonly GridMerge[],
  row: number,
  col: number,
): GridMerge | undefined {
  return merges.find((merge) => rangeContainsCell(merge, row, col));
}

export function mergeGridRange(
  merges: readonly GridMerge[],
  range: GridRange,
): GridMerge[] {
  if (range.firstRow === range.lastRow && range.firstCol === range.lastCol) {
    return [...merges];
  }
  const partiallyOverlapping = merges.some(
    (merge) =>
      rangesIntersect(merge, range) &&
      !(
        merge.firstRow >= range.firstRow &&
        merge.lastRow <= range.lastRow &&
        merge.firstCol >= range.firstCol &&
        merge.lastCol <= range.lastCol
      ),
  );
  if (partiallyOverlapping) {
    throw new Error("不能跨越已有合并区域再次合并");
  }
  return [
    ...merges.filter((merge) => !rangesIntersect(merge, range)),
    { ...range },
  ];
}

export function splitGridRange(
  merges: readonly GridMerge[],
  range: GridRange,
): GridMerge[] {
  return merges.filter((merge) => !rangesIntersect(merge, range));
}

export function transformGridRanges<T extends GridRange>(
  values: readonly T[],
  axis: "row" | "col",
  index: number,
  amount: number,
): T[] {
  const first = axis === "row" ? "firstRow" : "firstCol";
  const last = axis === "row" ? "lastRow" : "lastCol";
  return values.flatMap((value) => {
    const next = { ...value };
    if (amount > 0) {
      if (next[first] >= index) {
        next[first] += amount;
        next[last] += amount;
      } else if (next[last] >= index) {
        next[last] += amount;
      }
    } else {
      const count = -amount;
      const deletionEnd = index + count - 1;
      if (next[first] > deletionEnd) {
        next[first] -= count;
        next[last] -= count;
      } else if (next[last] >= index) {
        next[first] = Math.min(next[first], index);
        next[last] =
          next[last] > deletionEnd ? next[last] - count : index - 1;
      }
    }
    return next[last] < next[first] ? [] : [next as T];
  });
}

function numeric(value: string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value.replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(parsed)
    ? value.trim().endsWith("%")
      ? parsed / 100
      : parsed
    : null;
}

export function conditionalRuleMatches(
  cellValue: string | number,
  rule: GridConditionalFormat,
): boolean {
  if (rule.operator === "contains") {
    return String(cellValue)
      .toLocaleLowerCase()
      .includes(rule.value.toLocaleLowerCase());
  }
  if (rule.operator === "equal" || rule.operator === "not-equal") {
    const leftNumber = numeric(cellValue);
    const rightNumber = numeric(rule.value);
    const equal =
      leftNumber !== null && rightNumber !== null
        ? leftNumber === rightNumber
        : String(cellValue) === rule.value;
    return rule.operator === "equal" ? equal : !equal;
  }
  const left = numeric(cellValue);
  const right = numeric(rule.value);
  if (left === null || right === null) return false;
  return rule.operator === "greater-than" ? left > right : left < right;
}

export function conditionalGridStyle(
  rules: readonly GridConditionalFormat[],
  row: number,
  col: number,
  value: string | number,
): Pick<GridConditionalFormat, "color" | "background" | "bold"> {
  return rules.reduce<Pick<GridConditionalFormat, "color" | "background" | "bold">>(
    (style, rule) =>
      rangeContainsCell(rule.range, row, col) &&
      conditionalRuleMatches(value, rule)
        ? {
            ...style,
            ...(rule.color ? { color: rule.color } : {}),
            ...(rule.background ? { background: rule.background } : {}),
            ...(rule.bold ? { bold: true } : {}),
          }
        : style,
    {},
  );
}

/* ══════════════════════ 剪贴板：从 Excel 粘进来还是一张表 ══════════════════════
 *
 * 在这之前 `GridStage` 没有任何剪贴板处理器，粘贴走的是浏览器对单个 `<input>`
 * 的默认行为：从 Excel 复制一片区域，落进来是一个格子里的一坨文本。
 *
 * 解析器是**手写的受限扫描器，不碰 DOM**，两个理由：
 * 一、本仓没有 jsdom/happy-dom/linkedom（`package.json` 全文核过），
 *     用 `DOMParser` 就等于这三条判据没法在 node 测试里跑；
 * 二、剪贴板 HTML 是外部输入。只认 `table/tr/td/th/br/b/strong/font` 与
 *     白名单内的几条内联样式，其余一律当文本，从结构上就吃不进任意 CSS
 *     ——这也是任务书「只解析结构与基础样式」的字面要求。
 */

/** 单元格在剪贴板里的样子：值 + 基础样式 + 合并跨度。 */
export interface GridClipboardCell {
  value: string;
  format?: GridCellFormat;
  /** >1 表示这是一个合并区的左上角。被覆盖的格子值为空串。 */
  rowSpan?: number;
  colSpan?: number;
}

export interface GridClipboardMatrix {
  rows: GridClipboardCell[][];
  height: number;
  width: number;
}

/** 一次粘贴要写的所有格子与合并，行列都已按上限截断。 */
export interface GridPastePlan {
  cells: { row: number; col: number; value: string; format?: GridCellFormat }[];
  merges: GridRange[];
  target: GridRange;
  /** 剪贴板在选区里平铺的次数；1×1 表示没有平铺。 */
  repeatRows: number;
  repeatCols: number;
  /** 因为撞上 `GRID_MAX_ROWS` / `GRID_MAX_COLS` 而没能写下的行列数。 */
  truncatedRows: number;
  truncatedCols: number;
  truncated: boolean;
}

const CLIPBOARD_HTML_MAX_LENGTH = 4_000_000;
const CLIPBOARD_MAX_ROWS = 20_000;
const CLIPBOARD_MAX_COLS = 1_000;

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    const named = HTML_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

function parseTagAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-z_:][\w:.-]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const raw = match[2] ?? "";
    const unquoted =
      raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(unquoted);
  }
  return attributes;
}

function parseInlineStyle(style: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const chunk of style.split(";")) {
    const colon = chunk.indexOf(":");
    if (colon <= 0) continue;
    declarations[chunk.slice(0, colon).trim().toLowerCase()] = chunk
      .slice(colon + 1)
      .trim();
  }
  return declarations;
}

/** `#abc` / `#AABBCC` / `rgb(1,2,3)` → `#aabbcc`，认不出就丢弃（不猜）。 */
function normalizeCssColor(value: string): string | undefined {
  const text = value.trim().toLowerCase();
  const short = text.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  const rgb = text.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!rgb) return undefined;
  const channels = [rgb[1], rgb[2], rgb[3]].map((part) =>
    Math.max(0, Math.min(255, Number(part))),
  );
  return `#${channels.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Excel 把数字格式写成 `mso-number-format:"\0022¥\0022\#\,\#\#0\.00"`：
 * 反斜杠转义 + `\00XX` 十六进制字面量。先还原成人读的样子再归类。
 */
function decodeMsoNumberFormat(spec: string): string {
  return spec
    .replace(/^["']|["']$/g, "")
    .replace(/\\00([0-9a-f]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\(.)/g, "$1");
}

/**
 * 数字格式串 → `GridCellFormat` 的 type/decimals。认不出返回 undefined。
 *
 * 判日期只看**骨架**——`"¥"#,##0.00` 去掉引号字面量后是 `#,##0.00`，一个字母都
 * 没有；不去掉的话 `.00` 会被「小数点后跟一到两位」的日期规则吃掉，一列人民币
 * 全变成日期。数字格式在剥掉字面量与 `[...]` 之后必然无字母，这就是判据。
 */
export function gridFormatFromNumberPattern(
  spec: string,
): Pick<GridCellFormat, "type" | "decimals"> | undefined {
  const pattern = decodeMsoNumberFormat(spec).trim();
  if (!pattern || /^general$/i.test(pattern)) return undefined;
  if (pattern === "@" || /^text$/i.test(pattern)) return { type: "text" };
  // 只看正数段：Excel 的 `正;负;零;文本` 四段共用一套小数位。
  const section = pattern.split(";")[0];
  const skeleton = section.replace(/"[^"]*"/g, " ").replace(/\[[^\]]*\]/g, " ");
  const fraction = skeleton.match(/[.]([0#]+)/);
  const decimals = fraction ? fraction[1].length : 0;
  if (skeleton.includes("%")) return { type: "percent", decimals };
  if (
    /date|time/i.test(section) ||
    /(^|[^a-z])(y{2,4}|m{1,5}|d{1,4}|h{1,2})([^a-z]|$)/i.test(skeleton)
  ) {
    return { type: "date" };
  }
  if (/[¥$€£￥]/.test(section)) return { type: "currency", decimals };
  if (/[0#]/.test(skeleton)) return { type: "number", decimals };
  return undefined;
}

function clipboardCellFormat(
  attributes: Record<string, string>,
  boldTag: boolean,
): GridCellFormat | undefined {
  const style = parseInlineStyle(attributes.style || "");
  const format: GridCellFormat = {};

  const weight = style["font-weight"] || "";
  if (boldTag || /^(bold|bolder|[6-9]00)$/.test(weight.trim())) format.bold = true;

  const align = (style["text-align"] || attributes.align || "").trim().toLowerCase();
  if (align === "left" || align === "center" || align === "right") {
    format.align = align;
  }

  const color = normalizeCssColor(style.color || "");
  if (color) format.color = color;

  const background = normalizeCssColor(
    style["background-color"] || style.background || attributes.bgcolor || "",
  );
  if (background) format.background = background;

  const numberFormat = gridFormatFromNumberPattern(
    style["mso-number-format"] || attributes["data-number-format"] || "",
  );
  if (numberFormat) Object.assign(format, numberFormat);

  return Object.keys(format).length > 0 ? format : undefined;
}

/**
 * 带格式的单元格文本 → 可参与求值的原始值。
 *
 * Excel 的 HTML 里 `<td>` 装的是**显示值**（`¥1,234.00`），直接存下来会得到一个
 * 字符串：看着对，`SUM` 一算就是 0。所以数值类格式一律把符号与千分位剥掉，
 * 值与格式分开存——这才是「保真」，否则只是保样子。
 * 百分比保留 `%` 后缀：`grid-formula.ts` 的 `numeric()` 与 `grid-model.ts` 的
 * `exportValue()` 都已经认这个后缀，剥掉反而要改它们（都在 W12 面上）。
 */
export function normalizeGridPastedValue(
  text: string,
  format: GridCellFormat | undefined,
): string {
  const type = format?.type;
  if (type !== "number" && type !== "currency" && type !== "percent") return text;
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("=")) return text;
  const negative = /^\(.*\)$/.test(trimmed);
  const bare = trimmed
    .replace(/^\(|\)$/g, "")
    .replace(/[¥$€£￥\s\u00a0]/g, "")
    .replace(/,/g, "");
  const numericPart = type === "percent" ? bare.replace(/%$/, "") : bare;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(numericPart)) return text;
  const signed = negative ? `-${numericPart.replace(/^[+-]/, "")}` : numericPart;
  return type === "percent" ? `${signed}%` : signed;
}

interface RawClipboardCell extends GridClipboardCell {
  rowSpan: number;
  colSpan: number;
}

function positiveSpan(value: string | undefined, limit: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 1 ? Math.min(parsed, limit) : 1;
}

/**
 * 把 `rowspan` / `colspan` 铺成稠密矩阵：跨度的左上角保留跨度，被它盖住的格子
 * 补空串。这与 `use-grid-editor.ts` 的 `mergeSelection()` 语义一致（合并只留
 * 左上角的值），所以粘进来的合并区和本地合并出来的完全同形。
 */
function expandClipboardSpans(raw: RawClipboardCell[][]): GridClipboardMatrix {
  const placed: (GridClipboardCell | undefined)[][] = [];
  const occupied = new Set<string>();
  let width = 0;
  let height = 0;

  raw.forEach((cells, row) => {
    let col = 0;
    for (const cell of cells) {
      while (occupied.has(`${row}:${col}`)) col += 1;
      if (col >= CLIPBOARD_MAX_COLS) break;
      const rowSpan = Math.min(cell.rowSpan, CLIPBOARD_MAX_ROWS - row);
      const colSpan = Math.min(cell.colSpan, CLIPBOARD_MAX_COLS - col);
      for (let r = 0; r < rowSpan; r += 1) {
        for (let c = 0; c < colSpan; c += 1) occupied.add(`${row + r}:${col + c}`);
      }
      (placed[row] ||= [])[col] = {
        value: cell.value,
        ...(cell.format ? { format: cell.format } : {}),
        ...(rowSpan > 1 ? { rowSpan } : {}),
        ...(colSpan > 1 ? { colSpan } : {}),
      };
      width = Math.max(width, col + colSpan);
      height = Math.max(height, row + rowSpan);
      col += colSpan;
    }
    height = Math.max(height, row + 1);
  });

  const rows = Array.from({ length: height }, (_, row) =>
    Array.from(
      { length: width },
      (_, col) => placed[row]?.[col] ?? { value: "" },
    ),
  );
  return { rows, height, width };
}

/**
 * 剪贴板 HTML → 矩阵。不是通用 HTML 解析器：只走第一张 `<table>`，
 * 白名单之外的标签一律当作文本容器。解析不出表格返回 `null`，
 * 调用方据此回落到 `text/plain`。
 */
export function parseGridClipboardHtml(html: string): GridClipboardMatrix | null {
  const source = String(html ?? "").slice(0, CLIPBOARD_HTML_MAX_LENGTH);
  if (!/<t(able|r|d|h)\b/i.test(source)) return null;

  const raw: RawClipboardCell[][] = [];
  let row: RawClipboardCell[] | null = null;
  let cell: { text: string[]; attributes: Record<string, string>; bold: boolean } | null =
    null;
  let tableDepth = 0;
  let finished = false;
  let index = 0;

  const closeCell = () => {
    if (!cell || !row) return;
    const text = decodeHtmlEntities(cell.text.join(""))
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    const format = clipboardCellFormat(cell.attributes, cell.bold);
    row.push({
      value: normalizeGridPastedValue(text, format),
      ...(format ? { format } : {}),
      rowSpan: positiveSpan(cell.attributes.rowspan, CLIPBOARD_MAX_ROWS),
      colSpan: positiveSpan(cell.attributes.colspan, CLIPBOARD_MAX_COLS),
    });
    cell = null;
  };
  const closeRow = () => {
    closeCell();
    if (row) raw.push(row);
    row = null;
  };

  while (index < source.length && !finished) {
    const open = source.indexOf("<", index);
    if (open < 0) {
      if (cell) cell.text.push(source.slice(index));
      break;
    }
    if (cell && open > index) cell.text.push(source.slice(index, open));

    if (source.startsWith("<!--", open)) {
      const close = source.indexOf("-->", open + 4);
      index = close < 0 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith("<!", open)) {
      const close = source.indexOf(">", open + 2);
      index = close < 0 ? source.length : close + 1;
      continue;
    }

    // 属性值里可以有 `>`（`content:">"`），所以找结束尖括号时要认引号。
    let cursor = open + 1;
    let quote = "";
    while (cursor < source.length) {
      const character = source[cursor];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
      cursor += 1;
    }
    const inner = source.slice(open + 1, cursor);
    index = cursor + 1;

    const closing = inner.startsWith("/");
    const body = closing ? inner.slice(1) : inner;
    const nameMatch = body.match(/^[a-z][\w:-]*/i);
    if (!nameMatch) continue;
    const name = nameMatch[0].toLowerCase();
    const attributeSource = body.slice(nameMatch[0].length);

    if ((name === "script" || name === "style") && !closing) {
      const endPattern = new RegExp(`</${name}\\b`, "i");
      const rest = source.slice(index);
      const match = rest.match(endPattern);
      index += match?.index === undefined ? rest.length : match.index;
      continue;
    }

    if (name === "table") {
      if (closing) {
        closeRow();
        tableDepth -= 1;
        if (tableDepth <= 0) finished = true;
      } else {
        tableDepth += 1;
      }
      continue;
    }
    if (tableDepth !== 1) continue;

    if (name === "tr") {
      if (closing) closeRow();
      else {
        closeRow();
        row = [];
      }
      continue;
    }
    if (name === "td" || name === "th") {
      if (closing) {
        closeCell();
      } else {
        closeCell();
        if (!row) row = [];
        cell = {
          text: [],
          attributes: parseTagAttributes(attributeSource),
          bold: name === "th",
        };
      }
      continue;
    }
    if (!cell) continue;
    if (name === "br") cell.text.push("\n");
    else if (closing && (name === "p" || name === "div")) cell.text.push("\n");
    else if (!closing && (name === "b" || name === "strong")) cell.bold = true;
  }
  closeRow();

  const matrix = expandClipboardSpans(raw);
  return matrix.height > 0 && matrix.width > 0 ? matrix : null;
}

/**
 * 剪贴板纯文本 → 矩阵。TAB 分列、`\r?\n` 分行，但**引号字段按 CSV 规则**：
 * 引号内的分隔符与换行都是字面量。单元格内含换行是最常见的静默错位来源
 * ——按行 split 再按 TAB split 的写法会把一格拆成好几行，且不报错。
 */
export function parseGridClipboardText(
  text: string,
  options: { delimiter?: string } = {},
): GridClipboardMatrix {
  const source = String(text ?? "").replace(/\r\n?/g, "\n");
  const delimiter =
    options.delimiter ?? (source.includes("\t") ? "\t" : source.includes(",") ? "," : "\t");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }
    if (character === '"' && field === "") {
      quoted = true;
      index += 1;
      continue;
    }
    if (character === delimiter) {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }
    if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
      continue;
    }
    field += character;
    index += 1;
  }
  if (field !== "" || row.length > 0 || rows.length === 0) {
    row.push(field);
    rows.push(row);
  }
  // Excel 的纯文本以换行结尾，那条尾巴不是一行数据。
  while (rows.length > 1 && rows[rows.length - 1].every((value) => value === "")) {
    rows.pop();
  }

  const width = rows.reduce((max, entry) => Math.max(max, entry.length), 0);
  return {
    rows: rows.map((entry) =>
      Array.from({ length: width }, (_, col) => ({ value: entry[col] ?? "" })),
    ),
    height: rows.length,
    width,
  };
}

/** `text/html` 优先，解析不出表格才回落 `text/plain`。 */
export function readGridClipboard(payload: {
  html?: string;
  text?: string;
}): GridClipboardMatrix | null {
  const fromHtml = payload.html ? parseGridClipboardHtml(payload.html) : null;
  if (fromHtml) return fromHtml;
  const text = payload.text ?? "";
  return text ? parseGridClipboardText(text) : null;
}

/**
 * 三种选区语义（Excel 行为）：
 * 单格 → 以它为左上角铺开；形状一致 → 逐格对应；整数倍 → 平铺重复。
 * 都不是 → 退回「以左上角铺开」而不是报错：宁可多写也不静默丢数据。
 */
export function planGridPaste(
  matrix: GridClipboardMatrix,
  selection: GridRange,
  limits: { maxRows: number; maxCols: number },
): GridPastePlan {
  const height = Math.max(1, matrix.height);
  const width = Math.max(1, matrix.width);
  const selectionRows = selection.lastRow - selection.firstRow + 1;
  const selectionCols = selection.lastCol - selection.firstCol + 1;
  const singleCell = selectionRows === 1 && selectionCols === 1;
  const tiles =
    !singleCell &&
    selectionRows % height === 0 &&
    selectionCols % width === 0 &&
    (selectionRows !== height || selectionCols !== width);

  const repeatRows = tiles ? selectionRows / height : 1;
  const repeatCols = tiles ? selectionCols / width : 1;
  const wantedRows = height * repeatRows;
  const wantedCols = width * repeatCols;
  const allowedRows = Math.max(0, Math.min(wantedRows, limits.maxRows - selection.firstRow));
  const allowedCols = Math.max(0, Math.min(wantedCols, limits.maxCols - selection.firstCol));

  const cells: GridPastePlan["cells"] = [];
  const merges: GridRange[] = [];
  for (let offsetRow = 0; offsetRow < allowedRows; offsetRow += 1) {
    for (let offsetCol = 0; offsetCol < allowedCols; offsetCol += 1) {
      const source = matrix.rows[offsetRow % height]?.[offsetCol % width];
      if (!source) continue;
      const row = selection.firstRow + offsetRow;
      const col = selection.firstCol + offsetCol;
      cells.push({
        row,
        col,
        value: source.value,
        ...(source.format ? { format: source.format } : {}),
      });
      const rowSpan = source.rowSpan ?? 1;
      const colSpan = source.colSpan ?? 1;
      if (rowSpan <= 1 && colSpan <= 1) continue;
      const lastRow = Math.min(row + rowSpan - 1, selection.firstRow + allowedRows - 1);
      const lastCol = Math.min(col + colSpan - 1, selection.firstCol + allowedCols - 1);
      if (lastRow > row || lastCol > col) {
        merges.push({ firstRow: row, lastRow, firstCol: col, lastCol });
      }
    }
  }

  return {
    cells,
    merges,
    target: {
      firstRow: selection.firstRow,
      lastRow: selection.firstRow + Math.max(0, allowedRows - 1),
      firstCol: selection.firstCol,
      lastCol: selection.firstCol + Math.max(0, allowedCols - 1),
    },
    repeatRows,
    repeatCols,
    truncatedRows: wantedRows - allowedRows,
    truncatedCols: wantedCols - allowedCols,
    truncated: wantedRows > allowedRows || wantedCols > allowedCols,
  };
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

function clipboardStyleAttribute(format: GridCellFormat | undefined): string {
  if (!format) return "";
  const declarations: string[] = [];
  if (format.bold) declarations.push("font-weight:700");
  if (format.align) declarations.push(`text-align:${format.align}`);
  if (format.color) declarations.push(`color:${format.color}`);
  if (format.background) declarations.push(`background:${format.background}`);
  if (format.type && format.type !== "auto" && format.type !== "text") {
    const decimals = Math.max(0, Math.min(8, format.decimals ?? 2));
    const fraction = decimals > 0 ? `.${"0".repeat(decimals)}` : "";
    const pattern =
      format.type === "percent"
        ? `0${fraction}%`
        : format.type === "currency"
          ? `¥#,##0${fraction}`
          : format.type === "date"
            ? "yyyy-mm-dd"
            : `0${fraction}`;
    declarations.push(`mso-number-format:"${pattern}"`);
  }
  // 单引号包属性值，与 Excel 自己写出来的一致：`mso-number-format` 的值自带双引号，
  // 用双引号包会当场截断属性，格式在往返里静默丢一半。
  return declarations.length
    ? ` style='${declarations.join(";").replace(/'/g, "&apos;")}'`
    : "";
}

function clipboardTextField(value: string, delimiter: string): string {
  return value.includes(delimiter) || /["\n]/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

/**
 * 复制方向同样写双格式：只写 `text/plain` 的话，粘回 Excel 就丢掉了
 * 合并、对齐、数字格式与粗体——那是把保真做了一半。
 */
export function buildGridClipboardPayload(
  matrix: GridClipboardMatrix,
): { text: string; html: string } {
  const covered = new Set<string>();
  matrix.rows.forEach((cells, row) =>
    cells.forEach((cell, col) => {
      const rowSpan = cell.rowSpan ?? 1;
      const colSpan = cell.colSpan ?? 1;
      if (rowSpan <= 1 && colSpan <= 1) return;
      for (let r = 0; r < rowSpan; r += 1) {
        for (let c = 0; c < colSpan; c += 1) {
          if (r || c) covered.add(`${row + r}:${col + c}`);
        }
      }
    }),
  );

  const text = matrix.rows
    .map((cells) =>
      cells.map((cell) => clipboardTextField(cell.value, "\t")).join("\t"),
    )
    .join("\r\n");

  const html = [
    "<table>",
    ...matrix.rows.map((cells, row) =>
      [
        "<tr>",
        ...cells.flatMap((cell, col) => {
          if (covered.has(`${row}:${col}`)) return [];
          const rowSpan = cell.rowSpan ?? 1;
          const colSpan = cell.colSpan ?? 1;
          const spans = `${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ""}${
            colSpan > 1 ? ` colspan="${colSpan}"` : ""
          }`;
          return [
            `<td${spans}${clipboardStyleAttribute(cell.format)}>${escapeHtmlText(
              cell.value,
            )}</td>`,
          ];
        }),
        "</tr>",
      ].join(""),
    ),
    "</table>",
  ].join("");

  return { text, html };
}

/* ══════════════════════════ 填充柄 ══════════════════════════
 *
 * 引用语义全部走 W12 的导出：`inspectGridFormula()` 说哪些 token 是引用，
 * `parseGridReference()` 把 A1 解析成 row/col，`gridColumnName()` 再写回去。
 * 这里只做两件 W12 没有也不该有的事：**位移算术**与**`$` 的保留**。
 *
 * 为什么 `$` 要单独处理：`grid-formula.ts:199,211` 的 tokenizer 对 cell 与
 * qualified 两种 token 都做了 `.replace(/\$/g, "")`，所以 `inspection.references`
 * 里根本没有绝对引用的信息。判断只能落在**原文的出现位置**上。
 */

export type GridFillKind = "copy" | "linear" | "date" | "formula" | "repeat";

export interface GridFillSeries {
  kind: "copy" | "linear" | "date";
  /** linear：等差步长；date：步长个 unit。copy 恒为 0。 */
  step: number;
  unit?: "day" | "month";
}

const FILL_REFERENCE_PATTERN =
  /(?<![A-Za-z0-9_.])(?:(?:'[^'[\]]+'|[A-Za-z0-9_\u4e00-\u9fff]+)!)?\$?[A-Za-z]{1,3}\$?\d{1,7}(?![A-Za-z0-9_])/g;

function shiftReferenceToken(
  token: string,
  rowDelta: number,
  colDelta: number,
): string {
  const bang = token.lastIndexOf("!");
  const sheetPrefix = bang >= 0 ? token.slice(0, bang + 1) : "";
  const parts = token
    .slice(bang + 1)
    .match(/^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})$/);
  if (!parts) return token;
  const [, colMark, letters, rowMark, digits] = parts;
  const position = parseGridReference(`${letters}${digits}`);
  if (!position) return token;
  const col = colMark ? position.col : position.col + colDelta;
  const row = rowMark ? position.row : position.row + rowDelta;
  // 平移出界是 Excel 的 `#REF!`，不是悄悄夹到 0——夹到 0 会让公式看着还在算，
  // 算的却是另一个格子。
  if (row < 0 || col < 0) return "#REF!";
  return `${sheetPrefix}${colMark}${gridColumnName(col)}${rowMark}${row + 1}`;
}

/**
 * 把一条公式按 (rowDelta, colDelta) 平移。相对引用跟着走，`$` 锁住的不动。
 * 不是公式、解析不出引用、或位移为零，一律原样返回。
 */
export function translateGridFormula(
  formula: string,
  rowDelta: number,
  colDelta: number,
): string {
  const text = String(formula ?? "");
  if (!text.trimStart().startsWith("=")) return text;
  if (rowDelta === 0 && colDelta === 0) return text;

  const inspection = inspectGridFormula(text);
  const known = new Set([
    ...inspection.references,
    ...inspection.qualifiedReferences,
  ]);
  // 词法解析失败时两个数组都是空的，这里同时兜住「没有引用可平移」与
  // 「W12 认为这条公式根本读不出来」，两种情况都不许瞎改原文。
  if (known.size === 0) return text;

  const rewrite = (chunk: string): string =>
    chunk.replace(FILL_REFERENCE_PATTERN, (token) =>
      known.has(token.replace(/\$/g, ""))
        ? shiftReferenceToken(token, rowDelta, colDelta)
        : token,
    );

  let result = "";
  let index = 0;
  while (index < text.length) {
    const quote = text.indexOf('"', index);
    if (quote < 0) {
      result += rewrite(text.slice(index));
      break;
    }
    result += rewrite(text.slice(index, quote));
    // 字符串字面量原样搬运：`="A1 合计"` 里的 A1 是文案，不是引用。
    let cursor = quote + 1;
    while (cursor < text.length) {
      if (text[cursor] === '"') {
        if (text[cursor + 1] === '"') {
          cursor += 2;
          continue;
        }
        cursor += 1;
        break;
      }
      cursor += 1;
    }
    result += text.slice(quote, cursor);
    index = cursor;
  }
  return result;
}

function parseFillNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const bare = trimmed.replace(/,/g, "").replace(/%$/, "");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(bare)) return null;
  return Number(bare);
}

interface FillDate {
  year: number;
  month: number;
  day: number;
  separator: string;
  padded: boolean;
}

function parseFillDate(value: string): FillDate | null {
  const match = value.trim().match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day);
  const probe = new Date(utc);
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return {
    year,
    month,
    day,
    separator: match[2],
    padded: match[3].length === 2 && match[4].length === 2,
  };
}

function fillDateToUtc(date: FillDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function formatFillDate(utc: number, template: FillDate): string {
  const date = new Date(utc);
  const month = String(date.getUTCMonth() + 1);
  const day = String(date.getUTCDate());
  return [
    String(date.getUTCFullYear()),
    template.padded ? month.padStart(2, "0") : month,
    template.padded ? day.padStart(2, "0") : day,
  ].join(template.separator);
}

const DAY_MS = 86_400_000;

/**
 * 两格及以上才谈序列——单格按任务书是「复制」。
 * 等差要求相邻差值全部相同；日期优先认整月步长（1/31 → 2/28 这类月末对齐
 * 用天数步长会走偏），否则按天。
 */
export function detectGridFillSeries(source: readonly string[]): GridFillSeries {
  if (source.length < 2) return { kind: "copy", step: 0 };

  const numbers = source.map(parseFillNumber);
  if (numbers.every((value): value is number => value !== null)) {
    const step = numbers[1] - numbers[0];
    const constant = numbers.every(
      (value, index) => index === 0 || Math.abs(value - numbers[index - 1] - step) < 1e-9,
    );
    if (constant) return { kind: "linear", step };
    return { kind: "copy", step: 0 };
  }

  const dates = source.map(parseFillDate);
  if (dates.every((value): value is FillDate => value !== null)) {
    const monthStep =
      (dates[1].year - dates[0].year) * 12 + (dates[1].month - dates[0].month);
    const sameDay = dates.every((date) => date.day === dates[0].day);
    const monthConstant = dates.every(
      (date, index) =>
        index === 0 ||
        (date.year - dates[index - 1].year) * 12 +
          (date.month - dates[index - 1].month) ===
          monthStep,
    );
    if (sameDay && monthConstant && monthStep !== 0) {
      return { kind: "date", step: monthStep, unit: "month" };
    }
    const dayStep = Math.round((fillDateToUtc(dates[1]) - fillDateToUtc(dates[0])) / DAY_MS);
    const dayConstant = dates.every(
      (date, index) =>
        index === 0 ||
        Math.round((fillDateToUtc(date) - fillDateToUtc(dates[index - 1])) / DAY_MS) ===
          dayStep,
    );
    if (dayConstant && dayStep !== 0) return { kind: "date", step: dayStep, unit: "day" };
  }

  return { kind: "copy", step: 0 };
}

function decimalsOf(value: string): number {
  const dot = value.trim().replace(/%$/, "").indexOf(".");
  return dot < 0 ? 0 : value.trim().replace(/%$/, "").length - dot - 1;
}

/**
 * 从 `source`（沿填充方向的原始块）往后再生成 `count` 个值。
 *
 * 四种行为：单格纯文本复制、单格/多格公式按位移平移、两格等差或日期序列、
 * 其余按原块循环重复。公式无论落在哪种 kind 里都单独平移——一块里混着公式和
 * 常量时，常量重复、公式仍然跟着走，这才是 Excel 的行为。
 */
export function planGridFill(
  source: readonly string[],
  count: number,
  options: { axis: "row" | "col" },
): { kind: GridFillKind; values: string[] } {
  const length = source.length;
  if (length === 0 || count <= 0) return { kind: "copy", values: [] };

  const series = detectGridFillSeries(source);
  const anyFormula = source.some((value) => value.trimStart().startsWith("="));
  const first = parseFillNumber(source[0]);
  const percent = source.every((value) => value.trim().endsWith("%"));
  const decimals = Math.max(...source.map(decimalsOf));
  const dateTemplate = series.unit ? parseFillDate(source[0]) : null;

  const values = Array.from({ length: count }, (_, index) => {
    const position = length + index;
    const origin = position % length;
    const raw = source[origin];
    if (raw.trimStart().startsWith("=")) {
      const delta = position - origin;
      return translateGridFormula(
        raw,
        options.axis === "row" ? delta : 0,
        options.axis === "col" ? delta : 0,
      );
    }
    if (series.kind === "linear" && first !== null) {
      const next = first + series.step * position;
      return `${next.toFixed(decimals)}${percent ? "%" : ""}`;
    }
    if (series.kind === "date" && dateTemplate) {
      if (series.unit === "month") {
        const months = dateTemplate.month - 1 + series.step * position;
        return formatFillDate(
          Date.UTC(
            dateTemplate.year + Math.floor(months / 12),
            ((months % 12) + 12) % 12,
            dateTemplate.day,
          ),
          dateTemplate,
        );
      }
      return formatFillDate(
        fillDateToUtc(dateTemplate) + series.step * position * DAY_MS,
        dateTemplate,
      );
    }
    return raw;
  });

  const kind: GridFillKind =
    series.kind !== "copy"
      ? series.kind
      : anyFormula
        ? "formula"
        : length > 1
          ? "repeat"
          : "copy";
  return { kind, values };
}

/**
 * 双击填充柄能往下走多远：沿相邻列已有数据的长度。
 * 先看左邻列（Excel 的优先级），左邻空了再看右邻。两边都空就是 0——
 * 双击一个孤立格子不应该凭空填出几千行。
 */
export function gridFillDownLength(
  rows: readonly (readonly string[])[],
  range: GridRange,
  limit = 10_000,
): number {
  const probeColumns = [range.firstCol - 1, range.lastCol + 1].filter(
    (col) => col >= 0,
  );
  for (const col of probeColumns) {
    let length = 0;
    for (
      let row = range.lastRow + 1;
      row < rows.length && length < limit;
      row += 1
    ) {
      if (String(rows[row]?.[col] ?? "").trim() === "") break;
      length += 1;
    }
    if (length > 0) return length;
  }
  return 0;
}

/* ══════════════════════════ 行高与列宽 ══════════════════════════
 *
 * `GridSheet`（`grid-model.ts`，W12 独占）没有尺寸字段，所以尺寸不挂在表上，
 * 挂在 `oceanleo.grid.v1` 工程档顶层、按 sheetId 分组，由 `use-grid-editor.ts`
 * 读写。稀疏 map：只存被用户改过的那几行几列。
 */

/** 稀疏尺寸表：`{ 索引: 像素 }`，未登记的走默认值。 */
export type GridAxisSizes = Record<number, number>;

/** `GridStage` 原来写死的 `ROW_HEIGHT = 34`，现在只是默认值。 */
export const GRID_DEFAULT_ROW_HEIGHT = 34;
/** 与 `GridStage` 原来的 `min-w-28`（7rem = 112px）逐像素一致，改默认值会动 31 个站。 */
export const GRID_DEFAULT_COL_WIDTH = 112;
export const GRID_ROW_HEIGHT_RANGE: readonly [number, number] = [18, 400];
/** 与 `grid-model.ts` 的 `GRID_CONSTANTS.C19_columnWidthRangePx` 同值（有测试锁）。 */
export const GRID_COL_WIDTH_RANGE: readonly [number, number] = [48, 480];

export function normalizeGridAxisSizes(
  value: unknown,
  options: { count: number; min: number; max: number },
): GridAxisSizes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const sizes: GridAxisSizes = {};
  for (const [key, size] of Object.entries(value as Record<string, unknown>)) {
    const index = Number(key);
    const pixels = Number(size);
    if (!Number.isInteger(index) || index < 0 || index >= options.count) continue;
    if (!Number.isFinite(pixels)) continue;
    sizes[index] = Math.round(
      Math.max(options.min, Math.min(options.max, pixels)),
    );
  }
  return sizes;
}

export function gridAxisSize(
  sizes: GridAxisSizes | undefined,
  index: number,
  fallback: number,
): number {
  const size = sizes?.[index];
  return typeof size === "number" && Number.isFinite(size) ? size : fallback;
}

/** `indexes` 中 `[from, to)` 一段的像素总高（下标是**行号**，不是位置）。 */
export function gridAxisExtent(
  indexes: readonly number[],
  from: number,
  to: number,
  sizes: GridAxisSizes | undefined,
  fallback: number,
): number {
  const start = Math.max(0, from);
  const end = Math.min(indexes.length, to);
  if (end <= start) return 0;
  if (!sizes || Object.keys(sizes).length === 0) return (end - start) * fallback;
  let total = 0;
  for (let position = start; position < end; position += 1) {
    total += gridAxisSize(sizes, indexes[position], fallback);
  }
  return total;
}

/**
 * 粗窗口的定位。原来是 `floor(scrollTop / ROW_HEIGHT) - 8`，行高一旦可变这条
 * 除法就不成立了；这里按累计高度走。没有任何自定义行高时仍然走那条除法快路，
 * 一万行不必每次滚动都累加。
 */
export function gridRowWindowRange(
  indexes: readonly number[],
  options: {
    scrollTop: number;
    viewportHeight: number;
    sizes?: GridAxisSizes;
    defaultHeight: number;
    overscan?: number;
    maxWindow?: number;
  },
): { start: number; end: number } {
  const overscan = options.overscan ?? 8;
  const maxWindow = options.maxWindow ?? 500;
  const height = Math.max(1, options.defaultHeight);
  const scrollTop = Math.max(0, options.scrollTop);
  const viewport = Math.max(height, options.viewportHeight);

  if (!options.sizes || Object.keys(options.sizes).length === 0) {
    const start = Math.max(0, Math.floor(scrollTop / height) - overscan);
    const visible = Math.ceil(viewport / height) + overscan * 2;
    return {
      start: Math.min(start, indexes.length),
      end: Math.min(indexes.length, start + Math.min(visible, maxWindow)),
    };
  }

  let position = 0;
  let offset = 0;
  while (position < indexes.length) {
    const size = gridAxisSize(options.sizes, indexes[position], height);
    if (offset + size > scrollTop) break;
    offset += size;
    position += 1;
  }
  const start = Math.max(0, position - overscan);

  let end = start;
  let covered = 0;
  const budget = viewport + (position - start) * height + overscan * height;
  while (end < indexes.length && covered < budget && end - start < maxWindow) {
    covered += gridAxisSize(options.sizes, indexes[end], height);
    end += 1;
  }
  return { start, end: Math.max(end, Math.min(indexes.length, start + 1)) };
}

/**
 * 窗口两端 spacer 的高度。**必须和最终的 start/end 一起算**：`GridStage` 会为
 * 跨窗口的合并区把 start 往前、end 往后推，先算 spacer 再推窗口就会让滚动条
 * 长度错——这正是行高可变之后最容易出的那个 bug。
 */
export function gridRowSpacer(
  indexes: readonly number[],
  options: {
    start: number;
    end: number;
    sizes?: GridAxisSizes;
    defaultHeight: number;
  },
): { leadingHeight: number; trailingHeight: number; totalHeight: number } {
  const leadingHeight = gridAxisExtent(
    indexes,
    0,
    options.start,
    options.sizes,
    options.defaultHeight,
  );
  const trailingHeight = gridAxisExtent(
    indexes,
    options.end,
    indexes.length,
    options.sizes,
    options.defaultHeight,
  );
  const windowHeight = gridAxisExtent(
    indexes,
    options.start,
    options.end,
    options.sizes,
    options.defaultHeight,
  );
  return {
    leadingHeight,
    trailingHeight,
    totalHeight: leadingHeight + windowHeight + trailingHeight,
  };
}

/**
 * 双击列边界的自适应宽度。没有 DOM 可量，按字符宽度估：CJK 与全角算两个单位，
 * 其余算一个。估宽比不能拖好得多，也比 `min-w-28` 一刀切好得多。
 */
export function measureGridAutoColumnWidth(
  values: readonly string[],
  options: {
    min?: number;
    max?: number;
    unitPx?: number;
    paddingPx?: number;
  } = {},
): number {
  const min = options.min ?? GRID_COL_WIDTH_RANGE[0];
  const max = options.max ?? GRID_COL_WIDTH_RANGE[1];
  const unit = options.unitPx ?? 7;
  const padding = options.paddingPx ?? 20;
  let widest = 0;
  for (const value of values) {
    for (const line of String(value ?? "").split("\n")) {
      let units = 0;
      for (const character of line) {
        const code = character.codePointAt(0) ?? 0;
        units +=
          (code >= 0x1100 && code <= 0x115f) ||
          (code >= 0x2e80 && code <= 0xa4cf) ||
          (code >= 0xac00 && code <= 0xd7a3) ||
          (code >= 0xf900 && code <= 0xfaff) ||
          (code >= 0xfe30 && code <= 0xfe6f) ||
          (code >= 0xff00 && code <= 0xff60) ||
          (code >= 0xffe0 && code <= 0xffe6)
            ? 2
            : 1;
      }
      widest = Math.max(widest, units);
    }
  }
  return Math.round(Math.max(min, Math.min(max, widest * unit + padding)));
}

/* ══════════════════════════ 查找与替换 ══════════════════════════ */

/** `value` = 在算出来的值里找；`formula` = 在单元格原文（含 `=…`）里找。 */
export type GridSearchScope = "value" | "formula";

export interface GridSearchOptions {
  query: string;
  scope: GridSearchScope;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

export interface GridMatch {
  row: number;
  col: number;
  /** 命中所在的那串文本：值模式是算出来的值，公式模式是原文。 */
  text: string;
}

export interface GridReplaceEdit {
  row: number;
  col: number;
  before: string;
  after: string;
}

export interface GridReplacePlan {
  edits: GridReplaceEdit[];
  matched: number;
  /**
   * 值模式下命中、但因为原文是公式而没有改的格子数。
   * 改公式的**结果**是做不到的事，静默跳过比假装成功更坏。
   */
  skippedFormulas: number;
}

function escapeSearchPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function gridSearchPattern(options: GridSearchOptions): RegExp | null {
  if (!options.query) return null;
  const body = escapeSearchPattern(options.query);
  // `\b` 对中文不成立（CJK 不是 `\w`），所以「全字匹配」定义为两侧不是
  // 拉丁字母、数字或下划线。中文词天然满足，英文 `SUM` 不会命中 `SUMIF`。
  const pattern = options.wholeWord
    ? `(?<![A-Za-z0-9_])${body}(?![A-Za-z0-9_])`
    : body;
  return new RegExp(pattern, options.caseSensitive ? "g" : "gi");
}

function searchableText(
  rows: readonly (readonly string[])[],
  row: number,
  col: number,
  options: GridSearchOptions,
  resolveValue: (row: number, col: number) => string,
): string {
  const raw = String(rows[row]?.[col] ?? "");
  return options.scope === "formula" ? raw : resolveValue(row, col);
}

/**
 * 逐格找。值模式默认用 W12 的 `evaluateGridCell()` 求值；调用方可以传
 * `resolveValue` 换成带数字格式的显示值（`use-grid-editor.ts` 就是这么做的）。
 */
export function findGridMatches(
  rows: readonly (readonly string[])[],
  options: GridSearchOptions,
  resolveValue: (row: number, col: number) => string = (row, col) =>
    String(evaluateGridCell(rows as string[][], row, col)),
): GridMatch[] {
  const pattern = gridSearchPattern(options);
  if (!pattern) return [];
  const matches: GridMatch[] = [];
  for (let row = 0; row < rows.length; row += 1) {
    const width = rows[row]?.length ?? 0;
    for (let col = 0; col < width; col += 1) {
      const text = searchableText(rows, row, col, options, resolveValue);
      if (!text) continue;
      pattern.lastIndex = 0;
      if (pattern.test(text)) matches.push({ row, col, text });
    }
  }
  return matches;
}

/**
 * 「替换全部」的完整编辑清单。返回清单而不是就地改，是为了让调用方把它
 * **一次性**写进一个 `mutate()` ——一步撤销，不是撤两百次。
 */
export function planGridReplaceAll(
  rows: readonly (readonly string[])[],
  options: GridSearchOptions & { replacement: string },
  resolveValue: (row: number, col: number) => string = (row, col) =>
    String(evaluateGridCell(rows as string[][], row, col)),
): GridReplacePlan {
  const pattern = gridSearchPattern(options);
  if (!pattern) return { edits: [], matched: 0, skippedFormulas: 0 };

  const edits: GridReplaceEdit[] = [];
  let matched = 0;
  let skippedFormulas = 0;

  for (let row = 0; row < rows.length; row += 1) {
    const width = rows[row]?.length ?? 0;
    for (let col = 0; col < width; col += 1) {
      const raw = String(rows[row]?.[col] ?? "");
      const text = searchableText(rows, row, col, options, resolveValue);
      if (!text) continue;
      pattern.lastIndex = 0;
      if (!pattern.test(text)) continue;
      matched += 1;
      if (options.scope === "value" && raw.trimStart().startsWith("=")) {
        skippedFormulas += 1;
        continue;
      }
      pattern.lastIndex = 0;
      // 替换永远写回**原文**：值模式下 raw 就是那串文本，公式模式下 raw 是公式。
      const after = raw.replace(pattern, options.replacement);
      if (after !== raw) edits.push({ row, col, before: raw, after });
    }
  }
  return { edits, matched, skippedFormulas };
}
