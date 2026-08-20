// ============================================================================
// @oceanleo/ui — 对话正文 → 分享块 IR（长图与 .docx 的共同上游）
// ----------------------------------------------------------------------------
// 一份 IR，两个出口：`share-layout.ts` 把它排成长图，`share-docx.ts` 把它写成
// Word 的样式/编号/真表格。两条出口共用同一棵树，导出的两种件才不会长得不一样。
//
// 词法用已在依赖里的 `marked`（Lexer 部分，不生成 HTML）——自己手写 markdown 解析
// 会在嵌套列表、表格对齐、围栏语言标记上无穷无尽地掉坑。公式 `marked` 不认，所以
// 在进 Lexer 之前先把 `$$…$$` 切成独立块、在行内阶段再切 `$…$`。
// ============================================================================

import { marked } from "marked";

export type ShareInline =
  | {
      type: "text";
      text: string;
      bold?: boolean;
      italic?: boolean;
      strike?: boolean;
      code?: boolean;
      href?: string;
    }
  | { type: "math"; tex: string };

export interface ShareListItem {
  /** 0 = 顶层；嵌套列表把深度摊平，排版与 Word 缩进都按它算。 */
  depth: number;
  /** 有序列表里的序号（1 起）；无序列表为 0。 */
  index: number;
  ordered: boolean;
  checked?: boolean;
  inlines: ShareInline[];
}

/** 一个单元格 = 一串行内片段；一行 = 一串单元格。 */
export type ShareTableCell = ShareInline[];
export type ShareTableRow = ShareTableCell[];

export type ShareBlock =
  | { type: "heading"; level: number; inlines: ShareInline[] }
  | { type: "paragraph"; inlines: ShareInline[] }
  | { type: "quote"; inlines: ShareInline[] }
  | { type: "list"; ordered: boolean; items: ShareListItem[] }
  | { type: "code"; lang: string; lines: string[] }
  | { type: "table"; header: ShareTableRow; rows: ShareTableRow[] }
  | { type: "math"; tex: string }
  | { type: "image"; src: string; alt: string }
  | { type: "rule" };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

function decodeEntities(value: string): string {
  return String(value || "").replace(
    /&(?:amp|lt|gt|quot|nbsp|#39|#x27);/g,
    (hit) => ENTITIES[hit] ?? hit,
  );
}

interface MarkedToken {
  type?: string;
  text?: string;
  raw?: string;
  depth?: number;
  lang?: string;
  ordered?: boolean;
  start?: number | string;
  checked?: boolean;
  href?: string;
  tokens?: MarkedToken[];
  items?: MarkedToken[];
  header?: MarkedToken[];
  rows?: MarkedToken[][];
}

const INLINE_MATH = /(?<!\\)\$([^$\n]+?)(?<!\\)\$/;

/** 把一段纯文本里的 `$…$` 切成 text / math 交替的行内片段。 */
function splitInlineMath(
  text: string,
  style: Omit<Extract<ShareInline, { type: "text" }>, "type" | "text">,
): ShareInline[] {
  const out: ShareInline[] = [];
  let rest = text;
  for (;;) {
    const hit = INLINE_MATH.exec(rest);
    if (!hit || hit.index === undefined) break;
    const before = rest.slice(0, hit.index);
    if (before) out.push({ type: "text", text: before, ...style });
    out.push({ type: "math", tex: hit[1].trim() });
    rest = rest.slice(hit.index + hit[0].length);
  }
  if (rest) out.push({ type: "text", text: rest, ...style });
  return out.length ? out : [{ type: "text", text, ...style }];
}

function inlinesFrom(
  tokens: MarkedToken[] | undefined,
  style: Omit<Extract<ShareInline, { type: "text" }>, "type" | "text"> = {},
): ShareInline[] {
  const out: ShareInline[] = [];
  for (const token of tokens || []) {
    const type = token.type || "text";
    if (type === "strong") {
      out.push(...inlinesFrom(token.tokens, { ...style, bold: true }));
    } else if (type === "em") {
      out.push(...inlinesFrom(token.tokens, { ...style, italic: true }));
    } else if (type === "del") {
      out.push(...inlinesFrom(token.tokens, { ...style, strike: true }));
    } else if (type === "link") {
      out.push(
        ...inlinesFrom(token.tokens, { ...style, href: String(token.href || "") }),
      );
    } else if (type === "codespan") {
      out.push({
        type: "text",
        text: decodeEntities(token.text || ""),
        ...style,
        code: true,
      });
    } else if (type === "br") {
      out.push({ type: "text", text: "\n", ...style });
    } else if (type === "image") {
      out.push({
        type: "text",
        text: decodeEntities(token.text || token.href || ""),
        ...style,
        italic: true,
      });
    } else if (type === "escape") {
      out.push({ type: "text", text: decodeEntities(token.text || ""), ...style });
    } else if (token.tokens && token.tokens.length) {
      out.push(...inlinesFrom(token.tokens, style));
    } else {
      const text = decodeEntities(token.text || "");
      if (text) out.push(...splitInlineMath(text, style));
    }
  }
  return out;
}

function flattenListItems(
  token: MarkedToken,
  depth: number,
  out: ShareListItem[],
): void {
  const ordered = Boolean(token.ordered);
  const start = Number(token.start || 1) || 1;
  (token.items || []).forEach((item, position) => {
    const own: MarkedToken[] = [];
    const nested: MarkedToken[] = [];
    for (const child of item.tokens || []) {
      if (child.type === "list") nested.push(child);
      else own.push(child);
    }
    out.push({
      depth,
      index: ordered ? start + position : 0,
      ordered,
      checked: typeof item.checked === "boolean" ? item.checked : undefined,
      inlines: inlinesFrom(own.length ? own : item.tokens),
    });
    for (const child of nested) flattenListItems(child, depth + 1, out);
  });
}

function cellsFrom(cells: MarkedToken[] | undefined): ShareTableRow {
  return (cells || []).map((cell) =>
    inlinesFrom(cell.tokens || [{ type: "text", text: cell.text || "" }]),
  );
}

function blocksFromTokens(tokens: MarkedToken[]): ShareBlock[] {
  const out: ShareBlock[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        out.push({
          type: "heading",
          level: Math.min(6, Math.max(1, Number(token.depth) || 1)),
          inlines: inlinesFrom(token.tokens),
        });
        break;
      case "paragraph": {
        const only = (token.tokens || []).filter(
          (child) => child.type !== "space",
        );
        if (
          only.length === 1 &&
          only[0].type === "image" &&
          String(only[0].href || "")
        ) {
          out.push({
            type: "image",
            src: String(only[0].href || ""),
            alt: decodeEntities(only[0].text || ""),
          });
          break;
        }
        out.push({ type: "paragraph", inlines: inlinesFrom(token.tokens) });
        break;
      }
      case "text":
        out.push({
          type: "paragraph",
          inlines: token.tokens
            ? inlinesFrom(token.tokens)
            : splitInlineMath(decodeEntities(token.text || ""), {}),
        });
        break;
      case "code":
        out.push({
          type: "code",
          lang: String(token.lang || "").split(/\s+/)[0] || "",
          lines: String(token.text || "").replace(/\s+$/, "").split("\n"),
        });
        break;
      case "blockquote":
        out.push({
          type: "quote",
          inlines: inlinesFrom(
            (token.tokens || []).flatMap((child) => child.tokens || [child]),
          ),
        });
        break;
      case "list": {
        const items: ShareListItem[] = [];
        flattenListItems(token, 0, items);
        out.push({ type: "list", ordered: Boolean(token.ordered), items });
        break;
      }
      case "table":
        out.push({
          type: "table",
          header: cellsFrom(token.header),
          rows: (token.rows || []).map((row) => cellsFrom(row)),
        });
        break;
      case "hr":
        out.push({ type: "rule" });
        break;
      case "space":
      case "def":
        break;
      default: {
        const text = decodeEntities(token.text || "").trim();
        if (text) {
          out.push({ type: "paragraph", inlines: splitInlineMath(text, {}) });
        }
      }
    }
  }
  return out;
}

const DISPLAY_MATH = /\$\$([\s\S]+?)\$\$/g;

/** markdown 源码 → 块 IR。先切出 `$$…$$` 独立公式块，其余交给 marked。 */
export function markdownToShareBlocks(source: string): ShareBlock[] {
  const text = String(source || "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return [];
  const out: ShareBlock[] = [];
  let cursor = 0;
  DISPLAY_MATH.lastIndex = 0;
  for (;;) {
    const hit = DISPLAY_MATH.exec(text);
    if (!hit) break;
    // 围栏代码块里的 `$$` 不是公式；有围栏未闭合时保守放弃切分。
    const before = text.slice(cursor, hit.index);
    if ((before.match(/```/g) || []).length % 2 === 1) continue;
    if (before.trim()) {
      out.push(...blocksFromTokens(marked.lexer(before) as MarkedToken[]));
    }
    const tex = hit[1].trim();
    if (tex) out.push({ type: "math", tex });
    cursor = hit.index + hit[0].length;
  }
  const tail = text.slice(cursor);
  if (tail.trim()) {
    out.push(...blocksFromTokens(marked.lexer(tail) as MarkedToken[]));
  }
  return out;
}

/** 行内片段 → 纯文本（画布测量兜底、Word 里不需要富格式的地方用）。 */
export function inlinesToPlainText(inlines: readonly ShareInline[]): string {
  return inlines
    .map((inline) => (inline.type === "math" ? inline.tex : inline.text))
    .join("");
}
