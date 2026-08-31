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
