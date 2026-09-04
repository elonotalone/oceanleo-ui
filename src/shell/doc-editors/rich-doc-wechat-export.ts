/**
 * 转公众号排版（W08 判据 5）。
 *
 * doocs/md（MIT）是国内家族常用的公众号 Markdown 排版器。本波**不把它立成
 * 第 14 件编辑器**：只拿走它的导出口径——微信会剥 class / 外链样式，所以成品
 * 必须是**内联样式**的 HTML，才能粘进公众号后台还不塌。
 *
 * 零新依赖：不装 doocs/md，不装 juice。样式值按 doocs/md 默认主题（accent
 * `#42b983`、正文 16px / 1.75、引用左边线）手写进字符串。
 */

import type { TiptapMark, TiptapNode } from "./rich-doc-umo-migration";

export const WECHAT_EXPORT_FORMAT = "doocs.md.wechat.v1";

export const WECHAT_THEME_IDS = ["default", "grace", "simple"] as const;
export type WechatThemeId = (typeof WECHAT_THEME_IDS)[number];

export interface WechatTheme {
  id: WechatThemeId;
  label: string;
  text: string;
  heading: string;
  accent: string;
  link: string;
  quoteBg: string;
  codeBg: string;
  border: string;
  font: string;
}

export const WECHAT_THEMES: Record<WechatThemeId, WechatTheme> = {
  default: {
    id: "default",
    label: "默认（doocs/md）",
    text: "#3f3f3f",
    heading: "#3f3f3f",
    accent: "#42b983",
    link: "#576b95",
    quoteBg: "#f7f7f7",
    codeBg: "#f3f4f6",
    border: "#e5e7eb",
    font: "Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, 'PingFang SC', Cambria, Cochin, Georgia, Times, Times New Roman, serif",
  },
  grace: {
    id: "grace",
    label: "优雅",
    text: "#333333",
    heading: "#1a1a1a",
    accent: "#c59d5f",
    link: "#576b95",
    quoteBg: "#faf6f0",
    codeBg: "#f6f3ee",
    border: "#e8dfd0",
    font: "'Noto Serif SC', 'Songti SC', Georgia, serif",
  },
  simple: {
    id: "simple",
    label: "简洁",
    text: "#2c2c2c",
    heading: "#111111",
    accent: "#111111",
    link: "#576b95",
    quoteBg: "#f5f5f5",
    codeBg: "#f4f4f4",
    border: "#dddddd",
    font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
};

export interface WechatExportResult {
  format: typeof WECHAT_EXPORT_FORMAT;
  theme: WechatThemeId;
  title: string;
  html: string;
  markdown: string;
  warnings: string[];
}

export interface WechatExportOptions {
  title?: string;
  theme?: WechatThemeId;
  originUrl?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveTheme(id: WechatThemeId | undefined): WechatTheme {
  return WECHAT_THEMES[id && WECHAT_THEME_IDS.includes(id) ? id : "default"];
}

function unwrapDoc(input: unknown): TiptapNode | null {
  if (!isPlainObject(input)) return null;
  if (input.format === "umo.tiptap.v1" && isPlainObject(input.content)) {
    return input.content as unknown as TiptapNode;
  }
  if (input.schema === "tiptap-json@1" && isPlainObject(input.data)) {
    return unwrapDoc(input.data);
  }
  if (input.type === "doc") return input as unknown as TiptapNode;
  return null;
}

function renderMarks(text: string, marks: TiptapMark[] | undefined, theme: WechatTheme): string {
  let html = escapeHtml(text);
  if (!marks || marks.length === 0) return html;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        html = `<strong style="font-weight:700">${html}</strong>`;
        break;
      case "italic":
        html = `<em style="font-style:italic">${html}</em>`;
        break;
      case "underline":
        html = `<span style="text-decoration:underline">${html}</span>`;
        break;
      case "strike":
        html = `<span style="text-decoration:line-through">${html}</span>`;
        break;
      case "code":
        html = `<code style="font-family:Menlo,Monaco,Consolas,monospace;font-size:0.9em;background:${theme.codeBg};padding:0.16em 0.4em;border-radius:3px">${html}</code>`;
        break;
      case "highlight": {
        const color =
          typeof mark.attrs?.color === "string" ? mark.attrs.color : "#fff3bf";
        html = `<span style="background:${escapeHtml(color)}">${html}</span>`;
        break;
      }
      case "link": {
        const href =
          typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        if (href && /^https?:\/\//i.test(href)) {
          html = `<a href="${escapeHtml(href)}" style="color:${theme.link};text-decoration:none;border-bottom:1px solid ${theme.link}">${html}</a>`;
        }
        break;
      }
      case "textStyle": {
        const color =
          typeof mark.attrs?.color === "string" ? mark.attrs.color : "";
        if (color && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) {
          html = `<span style="color:${color}">${html}</span>`;
        }
        break;
      }
      default:
        break;
    }
  }
  return html;
}

function inlineChildren(nodes: TiptapNode[] | undefined, theme: WechatTheme): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "text") return renderMarks(node.text || "", node.marks, theme);
      if (node.type === "hardBreak") return "<br/>";
      if (node.type === "image") {
        const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
        const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
        if (!src || !/^https?:\/\//i.test(src)) return "";
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="max-width:100%;display:block;margin:1em auto"/>`;
      }
      return inlineChildren(node.content, theme);
    })
    .join("");
}

function paragraphStyle(theme: WechatTheme): string {
  return `font-size:16px;line-height:1.75;letter-spacing:0.04em;margin:1em 0;color:${theme.text};font-family:${theme.font}`;
}

function headingStyle(level: number, theme: WechatTheme): string {
  const sizes = ["", "24px", "20px", "18px", "16px", "15px", "14px"];
  const size = sizes[level] || "16px";
  const border =
    level === 2
      ? `;border-bottom:1px solid ${theme.border};padding-bottom:0.3em`
      : "";
  return `font-size:${size};font-weight:700;line-height:1.5;margin:1.4em 0 0.8em;color:${theme.heading};font-family:${theme.font}${border}`;
}

function renderBlock(
  node: TiptapNode,
  theme: WechatTheme,
  warnings: string[],
): string {
  switch (node.type) {
    case "doc":
      return (node.content || []).map((child) => renderBlock(child, theme, warnings)).join("");
    case "paragraph":
      return `<p style="${paragraphStyle(theme)}">${inlineChildren(node.content, theme) || "<br/>"}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      return `<h${level} style="${headingStyle(level, theme)}">${inlineChildren(node.content, theme)}</h${level}>`;
    }
    case "blockquote":
      return `<blockquote style="margin:1em 0;padding:0.8em 1em;border-left:4px solid ${theme.accent};background:${theme.quoteBg};color:${theme.text}">${(node.content || []).map((child) => renderBlock(child, theme, warnings)).join("")}</blockquote>`;
    case "codeBlock": {
      const text = (node.content || [])
        .map((child) => child.text || "")
        .join("");
      return `<pre style="background:${theme.codeBg};padding:1em;overflow:auto;border-radius:4px;font-size:14px;line-height:1.6;font-family:Menlo,Monaco,Consolas,monospace"><code>${escapeHtml(text)}</code></pre>`;
    }
    case "horizontalRule":
      return `<hr style="border:none;border-top:1px solid ${theme.border};margin:1.6em 0"/>`;
    case "bulletList":
      return `<ul style="margin:1em 0;padding-left:1.4em;color:${theme.text}">${(node.content || []).map((child) => renderBlock(child, theme, warnings)).join("")}</ul>`;
    case "orderedList":
      return `<ol style="margin:1em 0;padding-left:1.4em;color:${theme.text}">${(node.content || []).map((child) => renderBlock(child, theme, warnings)).join("")}</ol>`;
    case "listItem":
      return `<li style="margin:0.4em 0">${(node.content || []).map((child) => renderBlock(child, theme, warnings)).join("")}</li>`;
    case "taskList":
      warnings.push("任务列表按普通无序列表导出，勾选状态不会出现在公众号里。");
      return `<ul style="margin:1em 0;padding-left:1.4em;color:${theme.text}">${(node.content || []).map((child) => renderBlock(child, theme, warnings)).join("")}</ul>`;
    case "taskItem":
      return `<li style="margin:0.4em 0">${(node.content || []).map((child) => renderBlock(child, theme, warnings)).join("")}</li>`;
    case "table":
      return `<table style="border-collapse:collapse;width:100%;margin:1em 0;font-size:15px">${(node.content || []).map((child) => renderBlock(child, theme, warnings)).join("")}</table>`;
    case "tableRow":
      return `<tr>${(node.content || []).map((child) => renderBlock(child, theme, warnings)).join("")}</tr>`;
    case "tableHeader":
      return `<th style="border:1px solid ${theme.border};padding:6px 10px;background:${theme.quoteBg};font-weight:600">${inlineChildren(node.content, theme)}</th>`;
    case "tableCell":
      return `<td style="border:1px solid ${theme.border};padding:6px 10px">${inlineChildren(node.content, theme)}</td>`;
    case "image":
      return inlineChildren([node], theme);
    default:
      warnings.push(`节点「${node.type}」公众号排版不认识，已跳过。`);
      return "";
  }
}

function nodeToMarkdown(node: TiptapNode): string {
  switch (node.type) {
    case "doc":
      return (node.content || []).map(nodeToMarkdown).join("\n\n");
    case "paragraph":
      return inlineMarkdown(node.content);
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      return `${"#".repeat(level)} ${inlineMarkdown(node.content)}`;
    }
    case "blockquote":
      return (node.content || [])
        .map((child) => `> ${nodeToMarkdown(child)}`)
        .join("\n");
    case "codeBlock":
      return `\`\`\`\n${(node.content || []).map((child) => child.text || "").join("")}\n\`\`\``;
    case "horizontalRule":
      return "---";
    case "bulletList":
      return (node.content || [])
        .map((child) => `- ${nodeToMarkdown(child).replace(/\n/g, "\n  ")}`)
        .join("\n");
    case "orderedList":
      return (node.content || [])
        .map((child, index) => `${index + 1}. ${nodeToMarkdown(child).replace(/\n/g, "\n   ")}`)
        .join("\n");
    case "listItem":
    case "taskItem":
      return (node.content || []).map(nodeToMarkdown).join("\n");
    case "image": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return src ? `![${alt}](${src})` : "";
    }
    default:
      return inlineMarkdown(node.content);
  }
}

function inlineMarkdown(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      if (node.type !== "text") return inlineMarkdown(node.content);
      let text = node.text || "";
      for (const mark of node.marks || []) {
        if (mark.type === "bold") text = `**${text}**`;
        if (mark.type === "italic") text = `*${text}*`;
        if (mark.type === "code") text = `\`${text}\``;
        if (mark.type === "link" && typeof mark.attrs?.href === "string") {
          text = `[${text}](${mark.attrs.href})`;
        }
      }
      return text;
    })
    .join("");
}

function wrapArticle(
  inner: string,
  theme: WechatTheme,
  options: WechatExportOptions,
): string {
  const title = options.title ? escapeHtml(options.title) : "";
  const heading = title
    ? `<h1 style="${headingStyle(1, theme)};text-align:center">${title}</h1>`
    : "";
  const origin =
    options.originUrl && /^https?:\/\//i.test(options.originUrl)
      ? `<p style="font-size:13px;color:#888;margin-top:2em">原文：<a href="${escapeHtml(options.originUrl)}" style="color:${theme.link}">${escapeHtml(options.originUrl)}</a></p>`
      : "";
  return `<section style="max-width:677px;margin:0 auto;color:${theme.text};font-family:${theme.font}">${heading}${inner}${origin}</section>`;
}

/**
 * 从 Tiptap / Umo JSON 转出可粘贴的公众号 HTML。
 * 入参只读。
 */
export function exportWechatFromTiptap(
  input: unknown,
  options: WechatExportOptions = {},
): WechatExportResult {
  const theme = resolveTheme(options.theme);
  const warnings: string[] = [];
  const doc = unwrapDoc(input);
  if (!doc) {
    return {
      format: WECHAT_EXPORT_FORMAT,
      theme: theme.id,
      title: options.title || "",
      html: "",
      markdown: "",
      warnings: ["没有可排版的文档正文。"],
    };
  }
  const inner = renderBlock(doc, theme, warnings);
  return {
    format: WECHAT_EXPORT_FORMAT,
    theme: theme.id,
    title: options.title || "",
    html: wrapArticle(inner, theme, options),
    markdown: nodeToMarkdown(doc).trim(),
    warnings,
  };
}

/**
 * 极小 Markdown 子集 → 同一套公众号 HTML。
 * 只认 ATX 标题、引用、围栏代码、列表、分隔线、段落；不引入 marked。
 */
export function exportWechatFromMarkdown(
  markdown: string,
  options: WechatExportOptions = {},
): WechatExportResult {
  const theme = resolveTheme(options.theme);
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  if (!source.trim()) {
    return {
      format: WECHAT_EXPORT_FORMAT,
      theme: theme.id,
      title: options.title || "",
      html: "",
      markdown: "",
      warnings: ["没有可排版的 Markdown。"],
    };
  }
  const blocks: TiptapNode[] = [];
  const lines = source.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: [{ type: "text", text: heading[2] }],
      });
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        type: "codeBlock",
        content: [{ type: "text", text: body.join("\n") }],
      });
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      const quoted: string[] = [];
      while (index < lines.length && lines[index].startsWith("> ")) {
        quoted.push(lines[index].slice(2));
        index += 1;
      }
      blocks.push({
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: quoted.join("\n") }] }],
      });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: TiptapNode[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: lines[index].replace(/^\s*[-*]\s+/, "") }],
            },
          ],
        });
        index += 1;
      }
      blocks.push({ type: "bulletList", content: items });
      continue;
    }
    const para: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !lines[index].startsWith("```") &&
      !lines[index].startsWith("> ") &&
      !/^\s*[-*]\s+/.test(lines[index])
    ) {
      para.push(lines[index]);
      index += 1;
    }
    blocks.push({
      type: "paragraph",
      content: [{ type: "text", text: para.join("\n") }],
    });
  }
  return exportWechatFromTiptap(
    { type: "doc", content: blocks },
    options,
  );
}

export function isWechatThemeId(value: unknown): value is WechatThemeId {
  return typeof value === "string" && (WECHAT_THEME_IDS as readonly string[]).includes(value);
}
