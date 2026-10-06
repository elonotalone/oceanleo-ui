// 人发的消息的轻量标记解析：只产出 React 节点，不碰 HTML 字符串（契约 §10：禁止 innerHTML）。
// 支持：**粗体**、_斜体_、~~删除线~~、`行内代码`、```代码块```、> 引用、有序/无序列表、
// 自动识别 http(s) 链接、@提及（按 mentions 里的 id 画成名字胶囊）。
// 解析规则宁可「不识别就当文字」：未闭合的标记、javascript: 之类的地址一律原样显示为文字。

import { createElement, Fragment, type ReactNode } from "react";

export interface MentionRef {
  /** 用户 id；`all` / `leo` 是两个特殊项。 */
  id: string;
  /** 正文里 `@` 后面跟的名字（不含 `@`）。 */
  label: string;
  kind: "user" | "all" | "leo";
}

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "link"; href: string; text: string }
  | { type: "mention"; mention: MentionRef };

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "code"; text: string; lang: string }
  | { type: "quote"; children: BlockNode[] }
  | { type: "list"; ordered: boolean; start: number; items: InlineNode[][] };

export interface FormatOptions {
  mentions?: MentionRef[];
}

const URL_AT = /^https?:\/\/[^\s<>"'`]+/i;
const ALWAYS_TRAIL = new Set([".", ",", ";", ":", "!", "?", "，", "。", "；", "：", "！", "？", "、", "]", "}", ">", "）", "】", "」", "』", "”", "’"]);

function count(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n += 1;
  return n;
}

/** 允许的链接：只认 http(s)；`new URL` 解析失败的当文字。 */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

/** 从 `start` 开始取一个链接，去掉句尾标点（`)` 只在没有配对的 `(` 时去掉）。 */
function matchUrl(text: string, start: number): { raw: string } | null {
  const hit = URL_AT.exec(text.slice(start));
  if (!hit) return null;
  let raw = hit[0];
  while (raw.length > 0) {
    const last = raw[raw.length - 1];
    if (ALWAYS_TRAIL.has(last) || (last === ")" && count(raw, ")") > count(raw, "("))) {
      raw = raw.slice(0, -1);
      continue;
    }
    break;
  }
  return /^https?:\/\/./i.test(raw) ? { raw } : null;
}

function findClosing(text: string, from: number, marker: string): number {
  let index = from;
  for (;;) {
    const found = text.indexOf(marker, index);
    if (found === -1) return -1;
    // 内容不能为空，也不让标记紧贴着更长的同类标记（`***`）
    if (found === from) {
      index = found + marker.length;
      continue;
    }
    return found;
  }
}

function sortedMentions(mentions: MentionRef[] | undefined): MentionRef[] {
  return [...(mentions ?? [])].sort((a, b) => b.label.length - a.label.length);
}

export function parseInline(text: string, options: FormatOptions = {}): InlineNode[] {
  const mentions = sortedMentions(options.mentions);
  return parseInlineWith(text, mentions);
}

function parseInlineWith(text: string, mentions: MentionRef[]): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) {
      nodes.push({ type: "text", text: buffer });
      buffer = "";
    }
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // 行内代码：内容原样，不再解析
    if (ch === "`") {
      const close = text.indexOf("`", i + 1);
      if (close > i + 1) {
        flush();
        nodes.push({ type: "code", text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    // 粗体 / 删除线
    if (text.startsWith("**", i) || text.startsWith("~~", i)) {
      const marker = text.slice(i, i + 2);
      const close = findClosing(text, i + 2, marker);
      if (close > i + 2) {
        const inner = text.slice(i + 2, close);
        flush();
        nodes.push({
          type: marker === "**" ? "bold" : "strike",
          children: parseInlineWith(inner, mentions),
        });
        i = close + 2;
        continue;
      }
    }

    // 斜体：`_` 两侧不能是字母数字（snake_case 不受影响），内容首尾不能是空白
    if (ch === "_" && !isWordChar(text[i - 1]) && text[i + 1] !== undefined && !/\s/.test(text[i + 1]) && text[i + 1] !== "_") {
      let close = -1;
      for (let j = i + 1; j < text.length; j += 1) {
        if (text[j] === "_" && !/\s/.test(text[j - 1]) && !isWordChar(text[j + 1]) && text[j - 1] !== "_") {
          close = j;
          break;
        }
      }
      if (close > i + 1) {
        flush();
        nodes.push({ type: "italic", children: parseInlineWith(text.slice(i + 1, close), mentions) });
        i = close + 1;
        continue;
      }
    }

    // 链接：只认 http(s)；前一个字符不能是字母数字（避免从词中间切）
    if ((ch === "h" || ch === "H") && !isWordChar(text[i - 1])) {
      const hit = matchUrl(text, i);
      if (hit) {
        const href = safeHref(hit.raw);
        if (href) {
          flush();
          nodes.push({ type: "link", href, text: hit.raw });
          i += hit.raw.length;
          continue;
        }
      }
    }

    // @提及：按名字最长优先；名字后面不能紧跟字母数字（@Al 不会吃掉 @Alice）
    if (ch === "@" && mentions.length > 0) {
      const match = mentions.find((m) => {
        if (!text.startsWith(m.label, i + 1)) return false;
        const after = text[i + 1 + m.label.length];
        return !(isWordChar(after) && isWordChar(m.label[m.label.length - 1]));
      });
      if (match) {
        flush();
        nodes.push({ type: "mention", mention: match });
        i += 1 + match.label.length;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }
  flush();
  return nodes;
}

const FENCE = /^ {0,3}```\s*([\w+#.-]*)\s*$/;
const BULLET = /^\s{0,3}[-*•]\s+(.*)$/;
const ORDERED = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

export function parseBlocks(text: string, options: FormatOptions = {}): BlockNode[] {
  const mentions = sortedMentions(options.mentions);
  return parseBlocksWith(text.replace(/\r\n?/g, "\n").split("\n"), mentions, 0);
}

function parseBlocksWith(lines: string[], mentions: MentionRef[], depth: number): BlockNode[] {
  const blocks: BlockNode[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const body = paragraph.join("\n");
    blocks.push({ type: "paragraph", children: parseInlineWith(body, mentions) });
    paragraph = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = FENCE.exec(line);
    if (fence) {
      // 找闭合的围栏；找不到就当普通文字（不吞掉后面的内容）
      let close = -1;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^ {0,3}```\s*$/.test(lines[j])) {
          close = j;
          break;
        }
      }
      if (close !== -1) {
        flushParagraph();
        blocks.push({ type: "code", lang: fence[1] ?? "", text: lines.slice(i + 1, close).join("\n") });
        i = close + 1;
        continue;
      }
    }

    if (QUOTE.test(line) && depth < 3) {
      flushParagraph();
      const inner: string[] = [];
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i]);
        if (!q) break;
        inner.push(q[1]);
        i += 1;
      }
      blocks.push({ type: "quote", children: parseBlocksWith(inner, mentions, depth + 1) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const start = ordered ? Number(ordered[1]) : 1;
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const m = isOrdered ? ORDERED.exec(lines[i]) : BULLET.exec(lines[i]);
        if (!m) break;
        items.push(parseInlineWith(isOrdered ? m[2] : m[1], mentions));
        i += 1;
      }
      blocks.push({ type: "list", ordered: isOrdered, start, items });
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      i += 1;
      continue;
    }

    paragraph.push(line);
    i += 1;
  }
  flushParagraph();
  return blocks;
}

// ── 渲染成 React 节点 ──────────────────────────────────────────────────────
export interface RenderOptions {
  /** 点名字胶囊（只对真实用户触发）。 */
  onMentionClick?: (userId: string) => void;
  /** 自己被 @ 到（或 @所有人）时胶囊高亮。 */
  viewerId?: string | null;
}

function renderInline(nodes: InlineNode[], options: RenderOptions, keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}.${index}`;
    switch (node.type) {
      case "text":
        return createElement(Fragment, { key }, node.text);
      case "code":
        return createElement(
          "code",
          { key, className: "rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.9em] text-neutral-800" },
          node.text,
        );
      case "bold":
        return createElement("strong", { key, className: "font-semibold" }, ...renderInline(node.children, options, key));
      case "italic":
        return createElement("em", { key }, ...renderInline(node.children, options, key));
      case "strike":
        return createElement("del", { key, className: "text-neutral-500" }, ...renderInline(node.children, options, key));
      case "link":
        return createElement(
          "a",
          {
            key,
            href: node.href,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "break-all text-sky-700 underline underline-offset-2 hover:text-sky-800",
          },
          node.text,
        );
      case "mention": {
        const { mention } = node;
        const self = mention.kind === "all" || mention.id === options.viewerId;
        const clickable = mention.kind === "user" && options.onMentionClick;
        return createElement(
          clickable ? "button" : "span",
          {
            key,
            ...(clickable
              ? { type: "button", onClick: () => options.onMentionClick?.(mention.id) }
              : {}),
            "data-mention": mention.kind,
            className:
              "inline rounded px-1 font-medium " +
              (self ? "bg-amber-100 text-amber-900" : "bg-sky-50 text-sky-800") +
              (clickable ? " cursor-pointer hover:bg-sky-100" : ""),
          },
          `@${mention.label}`,
        );
      }
      default:
        return null;
    }
  });
}

function renderBlocks(blocks: BlockNode[], options: RenderOptions, keyPrefix: string): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}.${index}`;
    switch (block.type) {
      case "paragraph":
        return createElement(
          "p",
          { key, className: "whitespace-pre-wrap break-words" },
          ...renderInline(block.children, options, key),
        );
      case "code":
        return createElement(
          "pre",
          {
            key,
            className:
              "my-1 max-w-full overflow-x-auto rounded-lg bg-neutral-900 p-3 font-mono text-[12.5px] leading-relaxed text-neutral-100",
          },
          createElement("code", null, block.text),
        );
      case "quote":
        return createElement(
          "blockquote",
          { key, className: "my-1 border-l-2 border-neutral-300 pl-3 text-neutral-600" },
          ...renderBlocks(block.children, options, key),
        );
      case "list":
        return createElement(
          block.ordered ? "ol" : "ul",
          {
            key,
            className: (block.ordered ? "list-decimal" : "list-disc") + " my-1 space-y-0.5 pl-5",
            ...(block.ordered && block.start !== 1 ? { start: block.start } : {}),
          },
          ...block.items.map((item, itemIndex) =>
            createElement("li", { key: `${key}.${itemIndex}`, className: "break-words" }, ...renderInline(item, options, `${key}.${itemIndex}`)),
          ),
        );
      default:
        return null;
    }
  });
}

/** 正文 → React 节点列表。永远只产出元素与文本节点。 */
export function renderMessageBody(
  text: string,
  formatOptions: FormatOptions = {},
  renderOptions: RenderOptions = {},
): ReactNode[] {
  return renderBlocks(parseBlocks(text, formatOptions), renderOptions, "mf");
}

/** 去掉标记后的纯文字（引用预览、复制文字、通知用）。 */
export function plainTextOf(text: string): string {
  const blocks = parseBlocks(text);
  const inlineText = (nodes: InlineNode[]): string =>
    nodes
      .map((node) => {
        switch (node.type) {
          case "text":
          case "code":
            return node.text;
          case "link":
            return node.text;
          case "mention":
            return `@${node.mention.label}`;
          default:
            return inlineText(node.children);
        }
      })
      .join("");
  const blockText = (list: BlockNode[]): string =>
    list
      .map((block) => {
        switch (block.type) {
          case "paragraph":
            return inlineText(block.children);
          case "code":
            return block.text;
          case "quote":
            return blockText(block.children);
          case "list":
            return block.items.map((item, i) => `${block.ordered ? `${block.start + i}.` : "•"} ${inlineText(item)}`).join("\n");
          default:
            return "";
        }
      })
      .join("\n");
  return blockText(blocks);
}
