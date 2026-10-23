// ============================================================================
// @oceanleo/ui — 文本类文档（txt / md）的交付字节与库卡片摘要
// ----------------------------------------------------------------------------
// 三件事都从编辑器自己的结构出发：
//   · txt：段落之间空一行、段内换行原样保留，与载入时 `plainTextToHtml` 的切法
//     对称。过去这里是「去掉标签后把所有空白压成一个空格」，存一次整篇就成了
//     一行，`&amp;` 之类的实体还原样留在文件里。
//   · md：GFM 表格、删除线、紧凑列表、段内换行都有自己的规则。turndown 的默认值
//     会把表格压成散字、把列表写成 `-   ` 加只有空格的行（读回来就成了松散列表），
//     还把 `<br>` 写成行尾两个空格。
//   · 摘要（`meta.text_excerpt`）：库卡片上的「开头几行」，≤600 字，没有任何
//     markdown 记号，被修订删掉的字不算。
// 正文的完整样子（颜色、字号、批注）在工程 JSON 里，重开编辑器读的是那一份；
// 这里只负责「这个格式本身能装下的东西一样不丢」。
// ============================================================================

import type { JSONContent } from "@tiptap/core";
import { RICHDOC_DELETION_MARK } from "./richdoc-review/review-marks";

export const RICHDOC_TEXT_EXCERPT_MAX = 600;
export const RICHDOC_TEXT_EXCERPT_LINES = 8;

type RichNode = JSONContent;

function childNodes(node: RichNode | null | undefined): RichNode[] {
  return node && Array.isArray(node.content) ? node.content : [];
}

function isTrackedDeletion(node: RichNode): boolean {
  return (
    Array.isArray(node.marks) &&
    node.marks.some((mark) => mark?.type === RICHDOC_DELETION_MARK)
  );
}

/** 行内内容 → 文字：硬换行是 `\n`，图片不占字，修订里删掉的字不算。 */
function inlineText(node: RichNode): string {
  let text = "";
  for (const child of childNodes(node)) {
    if (child.type === "text") {
      if (!isTrackedDeletion(child)) text += child.text || "";
    } else if (child.type === "hardBreak") {
      text += "\n";
    } else if (child.type !== "image") {
      text += inlineText(child);
    }
  }
  return text;
}

function boundedSpan(value: unknown, maximum: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 1 ? Math.min(parsed, maximum) : 1;
}

/**
 * 合并单元格展开成规整的网格：被 colspan / rowspan 盖住的格子留空，
 * 列不会因为合并而错位。txt 与 md 共用同一套摆放规则。
 */
export function richDocTableGrid<Cell>(
  rows: readonly (readonly Cell[])[],
  read: (cell: Cell) => { text: string; colspan: number; rowspan: number },
): string[][] {
  const grid: string[][] = rows.map(() => []);
  rows.forEach((cells, rowIndex) => {
    let column = 0;
    for (const cell of cells) {
      while (grid[rowIndex][column] !== undefined) column += 1;
      const { text, colspan, rowspan } = read(cell);
      for (let dy = 0; dy < rowspan && rowIndex + dy < grid.length; dy += 1) {
        for (let dx = 0; dx < colspan; dx += 1) {
          grid[rowIndex + dy][column + dx] = dy === 0 && dx === 0 ? text : "";
        }
      }
      column += colspan;
    }
  });
  const width = Math.max(0, ...grid.map((row) => row.length));
  return grid.map((row) =>
    Array.from({ length: width }, (_, index) => row[index] ?? ""),
  );
}

function jsonTableGrid(table: RichNode): string[][] {
  const rows = childNodes(table)
    .filter((row) => row.type === "tableRow")
    .map((row) => childNodes(row));
  return richDocTableGrid(rows, (cell) => ({
    text: childNodes(cell)
      .map((block) => inlineText(block).replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean)
      .join(" "),
    colspan: boundedSpan(cell.attrs?.colspan, 64),
    rowspan: boundedSpan(cell.attrs?.rowspan, 1024),
  }));
}

function indentLines(text: string, indent: string): string {
  return indent ? text.replace(/^(?=.)/gm, indent) : text;
}

function isList(node: RichNode): boolean {
  return node.type === "bulletList" || node.type === "orderedList";
}

function listText(list: RichNode, indent: string): string {
  const start = Math.max(0, Math.floor(Number(list.attrs?.start)) || 1);
  return childNodes(list)
    .map((item, index) => {
      const marker = list.type === "orderedList" ? `${start + index}. ` : "- ";
      const hang = indent + " ".repeat(marker.length);
      const parts: string[] = [];
      let markerUsed = false;
      const useMarker = (body = "") => {
        parts.push(`${indent}${marker}${body}`.trimEnd());
        markerUsed = true;
      };
      for (const child of childNodes(item)) {
        if (isList(child)) {
          if (!markerUsed) useMarker();
          const nested = listText(child, hang);
          if (nested.trim()) parts.push(nested);
          continue;
        }
        const body = plainBlocks(child, "").join("\n");
        if (!body.trim()) continue;
        if (markerUsed) parts.push(indentLines(body, hang));
        else useMarker(body.replace(/\n/g, `\n${hang}`));
      }
      if (!markerUsed) useMarker();
      return parts.join("\n");
    })
    .join("\n");
}

function plainBlocks(node: RichNode, indent: string): string[] {
  switch (node.type) {
    case "paragraph":
    case "heading":
    case "codeBlock": {
      const text = inlineText(node);
      return text.trim() ? [indentLines(text.replace(/[ \t]+$/gm, ""), indent)] : [];
    }
    case "bulletList":
    case "orderedList": {
      const text = listText(node, indent);
      return text.trim() ? [text] : [];
    }
    case "table": {
      const text = jsonTableGrid(node)
        .map((row) => row.join("\t").replace(/\t+$/, ""))
        .filter((row) => row.trim())
        .join("\n");
      return text ? [text] : [];
    }
    case "horizontalRule":
      return [`${indent}---`];
    case "image":
      return [];
    default:
      return childNodes(node).flatMap((child) => plainBlocks(child, indent));
  }
}

/**
 * Tiptap JSON → txt 交付字节。段落之间空一行，段内硬换行是单个 `\n`，
 * 与 `plainTextToHtml` 的载入规则对称：打开、改一个字、保存，行结构不变。
 */
export function richDocJsonToPlainText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const text = plainBlocks(json as RichNode, "").join("\n\n");
  return text ? `${text}\n` : "";
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** 没有结构可用时的退路：按块级标签断行、还原实体，不把整篇压成一行。 */
export function richDocHtmlToPlainText(html: string): string {
  const text = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|blockquote|pre|tr|div)>/gi, "\n\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
      if (!entity.startsWith("#")) return HTML_ENTITIES[entity.toLowerCase()] ?? whole;
      const code = entity[1].toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16)
        : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? `${text}\n` : "";
}

/**
 * 库卡片上的「开头几行」。一块正文一行（硬换行另起一行），列表带 `•` / 序号，
 * 表格一行一排、格子之间用 ` · `。最多 8 行、600 个字符（按字算，不切断代理对）。
 */
export function richDocTextExcerpt(
  json: unknown,
  maxChars = RICHDOC_TEXT_EXCERPT_MAX,
): string {
  const lines: string[] = [];
  const full = () => lines.length >= RICHDOC_TEXT_EXCERPT_LINES;
  const push = (text: string, prefix = "") => {
    let marker = prefix;
    for (const raw of text.split("\n")) {
      if (full()) return;
      const line = raw.replace(/\s+/g, " ").trim();
      if (!line) continue;
      lines.push(`${marker}${line}`);
      marker = "";
    }
  };
  const walk = (node: RichNode, prefix = "") => {
    if (full()) return;
    switch (node.type) {
      case "paragraph":
      case "heading":
      case "codeBlock":
        push(inlineText(node), prefix);
        return;
      case "bulletList":
      case "orderedList": {
        const start = Math.max(0, Math.floor(Number(node.attrs?.start)) || 1);
        childNodes(node).forEach((item, index) => {
          const marker = node.type === "orderedList" ? `${start + index}. ` : "• ";
          let first = true;
          for (const child of childNodes(item)) {
            walk(child, first ? marker : "");
            first = false;
          }
        });
        return;
      }
      case "table":
        for (const row of jsonTableGrid(node)) {
          push(row.filter(Boolean).join(" · "));
        }
        return;
      case "image":
      case "horizontalRule":
        return;
      default:
        for (const child of childNodes(node)) walk(child, prefix);
    }
  };
  if (json && typeof json === "object") walk(json as RichNode);
  const excerpt = lines.join("\n");
  const chars = Array.from(excerpt);
  return chars.length > maxChars ? chars.slice(0, maxChars).join("").trimEnd() : excerpt;
}

/**
 * txt / md / html 的封面就是正文本身（与上传时一致，库卡片读字不读图）；
 * 只有 docx 这种二进制交付才值得在保存时另画一张位图。
 */
export function richDocRendersPreviewBitmap(target: { extension: string }): boolean {
  return target.extension === "docx";
}

// ---------------------------------------------------------------------------
// HTML → Markdown
// ---------------------------------------------------------------------------

interface DomLike {
  nodeName: string;
  childNodes: ArrayLike<DomLike>;
  parentNode: DomLike | null;
  nextSibling: DomLike | null;
  getAttribute?: (name: string) => string | null;
  classList?: { contains: (name: string) => boolean };
}

function elementChildren(node: DomLike, names: readonly string[]): DomLike[] {
  return Array.from(node.childNodes).filter((child) =>
    names.includes(child.nodeName),
  );
}

function tableRowsOf(table: DomLike): DomLike[] {
  const rows: DomLike[] = [];
  for (const child of Array.from(table.childNodes)) {
    if (child.nodeName === "TR") rows.push(child);
    else if (["THEAD", "TBODY", "TFOOT"].includes(child.nodeName)) {
      rows.push(...elementChildren(child, ["TR"]));
    }
  }
  return rows;
}

type TurndownLike = {
  turndown: (input: string | DomLike) => string;
  addRule: (
    key: string,
    rule: {
      filter: string | string[] | ((node: DomLike) => boolean);
      replacement: (content: string, node: DomLike, options: { bulletListMarker: string }) => string;
    },
  ) => unknown;
  escape: (text: string) => string;
};

function markdownCell(service: TurndownLike, cell: DomLike): string {
  return service
    .turndown(cell)
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

/** 装好规则的 turndown；与 `markdownToHtml`（marked + gfm + breaks）互为逆运算。 */
export async function createRichDocTurndown(): Promise<TurndownLike> {
  const TurndownService = (await import("turndown")).default;
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    hr: "---",
    // 载入用 `breaks: true`：源文件里的单个换行读进来就是 `<br>`，写回去也只是换行。
    br: "",
  }) as unknown as TurndownLike;
  const escape = service.escape.bind(service);
  // 词中间的下划线不会被读成强调（CommonMark），不必写成 `a\_b`。
  service.escape = (text) => escape(text).replace(/(\w)\\_(?=\w)/g, "$1_");
  service.addRule("richdocStrike", {
    filter: ["s", "del", "strike"],
    replacement: (content) => (content.trim() ? `~~${content}~~` : content),
  });
  service.addRule("richdocTrackedDeletion", {
    filter: (node) =>
      node.nodeName === "SPAN" && Boolean(node.classList?.contains("oleo-richdoc-del")),
    replacement: (content) => (content.trim() ? `~~${content}~~` : content),
  });
  service.addRule("richdocListItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const parent = node.parentNode;
      let marker = `${options.bulletListMarker} `;
      if (parent?.nodeName === "OL") {
        const start = Math.max(0, Math.floor(Number(parent.getAttribute?.("start"))) || 1);
        marker = `${start + elementChildren(parent, ["LI"]).indexOf(node)}. `;
      }
      const hang = " ".repeat(marker.length);
      const body = content
        .replace(/^\n+/, "")
        .replace(/\s+$/, "")
        .replace(/\n{2,}/g, "\n")
        .replace(/\n(?=.)/g, `\n${hang}`);
      return `${marker}${body}${node.nextSibling ? "\n" : ""}`;
    },
  });
  service.addRule("richdocTable", {
    filter: "table",
    replacement: (_content, node) => {
      const grid = richDocTableGrid(
        tableRowsOf(node).map((row) => elementChildren(row, ["TH", "TD"])),
        (cell) => ({
          text: markdownCell(service, cell),
          colspan: boundedSpan(cell.getAttribute?.("colspan"), 64),
          rowspan: boundedSpan(cell.getAttribute?.("rowspan"), 1024),
        }),
      );
      if (grid.length === 0 || grid[0].length === 0) return "\n\n";
      const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
      const [head, ...body] = grid;
      return `\n\n${[
        line(head),
        line(head.map(() => "---")),
        ...body.map(line),
      ].join("\n")}\n\n`;
    },
  });
  return service;
}

/** 编辑器 HTML → Markdown 交付字节（末尾一个换行；代码块里的空行原样保留）。 */
export async function richDocHtmlToMarkdown(html: string): Promise<string> {
  const service = await createRichDocTurndown();
  const markdown = service.turndown(String(html || "")).trim();
  return markdown ? `${markdown}\n` : "";
}

const warmedWriters = new Set<string>();

/**
 * 打开文档时就把这种格式的写回器载好。保存时才去拉 chunk 的话，断网那一次
 * 保存拉不到，恢复网络后重试还卡在同一个失败的 chunk 上。
 */
export function preloadRichDocDeliveryWriters(extension: string): void {
  if (warmedWriters.has(extension)) return;
  const task =
    extension === "md"
      ? import("turndown")
      : extension === "docx"
        ? import("./docx-export").then((module) => module.preloadDocxWriter())
        : null;
  if (!task) return;
  warmedWriters.add(extension);
  task.catch(() => warmedWriters.delete(extension));
}
