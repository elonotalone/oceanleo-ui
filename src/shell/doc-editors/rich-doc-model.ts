"use client";

// ============================================================================
// @oceanleo/ui — RichDocEditor 数据层（加载 / 导出转换，无 React）
// ----------------------------------------------------------------------------
// 加载优先级：inline 字符串（content / meta.markdown|content|text，按 markdown
// 解析）→ url .md/.txt/.html 文本 → url .docx（mammoth 转 HTML）。所有进编辑器
// 的 HTML 一律先过 DOMPurify。marked / dompurify / mammoth / turndown 全部动态
// import，保证 SSR 与首屏 bundle 干净。
// ============================================================================

import { fetchMediaBlob } from "../../lib/media-proxy";
import type { JSONContent } from "@tiptap/core";
import type { LibraryItem } from "../library-data";
import { urlExtension } from "./doc-io";

export type RichDocSource =
  | "project"
  | "inline"
  | "url-markdown"
  | "url-text"
  | "url-html"
  | "url-docx"
  | "import-markdown"
  | "import-text"
  | "import-html"
  | "import-doc"
  | "import-docx"
  | "empty";

export interface RichDocLoadResult {
  html: string;
  json?: JSONContent;
  source: RichDocSource;
  error: string;
}

async function sanitizeHtml(html: string): Promise<string> {
  const DOMPurify = (await import("dompurify")).default;
  return DOMPurify.sanitize(html);
}

async function docxToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammothModule = (await import("mammoth")) as unknown as {
    convertToHtml?: (input: {
      arrayBuffer: ArrayBuffer;
    }) => Promise<{ value: string }>;
    default?: {
      convertToHtml: (input: {
        arrayBuffer: ArrayBuffer;
      }) => Promise<{ value: string }>;
    };
  };
  const convertToHtml =
    mammothModule.convertToHtml ?? mammothModule.default?.convertToHtml;
  if (!convertToHtml) throw new Error("mammoth 模块加载失败");
  const { value } = await convertToHtml({ arrayBuffer });
  return sanitizeHtml(value);
}

export async function markdownToHtml(markdown: string): Promise<string> {
  const { marked } = await import("marked");
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: true });
  return sanitizeHtml(html);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 纯文本逐段包 <p>，段内单换行转 <br>。 */
export function plainTextToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`);
  return paragraphs.join("") || "<p></p>";
}

function inlineSource(item: LibraryItem): string {
  if (typeof item.content === "string" && item.content.trim()) {
    return item.content;
  }
  for (const key of ["markdown", "content", "text"] as const) {
    const value = item.meta[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export async function loadRichDocHtml(
  item: LibraryItem,
): Promise<RichDocLoadResult> {
  try {
    const inline = inlineSource(item);
    if (inline) {
      return { html: await markdownToHtml(inline), source: "inline", error: "" };
    }
    const url = item.url || "";
    const ext = urlExtension(url);
    if (url && ext === "docx") {
      const blob = await fetchMediaBlob(url);
      return {
        html: await docxToHtml(await blob.arrayBuffer()),
        source: "url-docx",
        error: "",
      };
    }
    if (url && ["md", "markdown", "txt", "html", "htm"].includes(ext)) {
      const text = await (await fetchMediaBlob(url)).text();
      if (ext === "md" || ext === "markdown") {
        return {
          html: await markdownToHtml(text),
          source: "url-markdown",
          error: "",
        };
      }
      if (ext === "txt") {
        return {
          html: await sanitizeHtml(plainTextToHtml(text)),
          source: "url-text",
          error: "",
        };
      }
      return { html: await sanitizeHtml(text), source: "url-html", error: "" };
    }
    return { html: "<p></p>", source: "empty", error: "" };
  } catch (caught) {
    return {
      html: "<p></p>",
      source: "empty",
      error: caught instanceof Error ? caught.message : "文档加载失败",
    };
  }
}

/** Import a local Word/HTML/Markdown/text file into the active editor. */
export async function loadRichDocFile(file: File): Promise<RichDocLoadResult> {
  try {
    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (ext === "docx") {
      return {
        html: await docxToHtml(await file.arrayBuffer()),
        source: "import-docx",
        error: "",
      };
    }
    const text = await file.text();
    if (ext === "md" || ext === "markdown") {
      return {
        html: await markdownToHtml(text),
        source: "import-markdown",
        error: "",
      };
    }
    if (ext === "txt") {
      return {
        html: await sanitizeHtml(plainTextToHtml(text)),
        source: "import-text",
        error: "",
      };
    }
    if (["html", "htm", "doc"].includes(ext)) {
      return {
        html: await sanitizeHtml(text),
        source: ext === "doc" ? "import-doc" : "import-html",
        error: "",
      };
    }
    return {
      html: "<p></p>",
      source: "empty",
      error: "不支持这个文档格式",
    };
  } catch (caught) {
    return {
      html: "<p></p>",
      source: "empty",
      error: caught instanceof Error ? caught.message : "文档导入失败",
    };
  }
}

export async function htmlToMarkdown(html: string): Promise<string> {
  const TurndownService = (await import("turndown")).default;
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  return service.turndown(html);
}

/** 包一层完整 HTML 文档（导出用）。 */
export function fullHtmlDocument(title: string, bodyHtml: string): string {
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>body{max-width:820px;margin:32px auto;padding:0 24px;font-family:system-ui,sans-serif;line-height:1.7;color:#1c1917}table{border-collapse:collapse}td,th{border:1px solid #d6d3d1;padding:6px 10px}img{max-width:100%}pre{background:#f5f5f4;padding:12px;border-radius:8px;overflow:auto}blockquote{border-left:3px solid #d6d3d1;margin-left:0;padding-left:16px;color:#57534e}</style>",
    "</head>",
    `<body>${bodyHtml}</body>`,
    "</html>",
  ].join("\n");
}

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

/** 字数 = CJK 字符数 + 拉丁词数；字符 = 去空白后的字符数。 */
export function countText(text: string): { words: number; chars: number } {
  const normalized = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(normalized.replace(/ /g, "")).length;
  const cjk = (normalized.match(CJK_PATTERN) || []).length;
  const latinWords = (
    normalized.replace(CJK_PATTERN, " ").match(/[A-Za-z0-9'’_-]+/g) || []
  ).length;
  return { words: cjk + latinWords, chars };
}

/** 编辑区排版样式（Tailwind preflight 把标题拍平了，这里补回文档观感）。 */
export const RICHDOC_CSS = `
.oleo-richdoc{outline:none;min-height:100%;color:#1c1917;font-size:14px;line-height:1.75}
.oleo-richdoc>*+*{margin-top:.6em}
.oleo-richdoc h1{font-size:1.9em;font-weight:700;line-height:1.3;margin-top:1em}
.oleo-richdoc h2{font-size:1.5em;font-weight:700;line-height:1.35;margin-top:1em}
.oleo-richdoc h3{font-size:1.25em;font-weight:600;margin-top:.9em}
.oleo-richdoc h4{font-size:1.1em;font-weight:600;margin-top:.8em}
.oleo-richdoc ul{list-style:disc;padding-left:1.5em}
.oleo-richdoc ol{list-style:decimal;padding-left:1.5em}
.oleo-richdoc li+li{margin-top:.25em}
.oleo-richdoc blockquote{border-left:3px solid #d6d3d1;padding-left:1em;color:#57534e}
.oleo-richdoc pre{background:#1c1917;color:#e7e5e4;padding:.9em 1.1em;border-radius:10px;font-size:.9em;overflow-x:auto}
.oleo-richdoc code{background:#f5f5f4;border-radius:4px;padding:.15em .35em;font-size:.9em}
.oleo-richdoc pre code{background:transparent;padding:0}
.oleo-richdoc hr{border:none;border-top:1px solid #d6d3d1;margin:1.4em 0}
.oleo-richdoc a{color:#4f46e5;text-decoration:underline}
.oleo-richdoc img{max-width:100%;border-radius:8px}
.oleo-richdoc table{border-collapse:collapse;width:100%;table-layout:fixed;margin:.8em 0}
.oleo-richdoc td,.oleo-richdoc th{border:1px solid #d6d3d1;padding:5px 9px;vertical-align:top;position:relative}
.oleo-richdoc th{background:#fafaf9;font-weight:600;text-align:left}
.oleo-richdoc .selectedCell:after{content:"";position:absolute;inset:0;background:rgba(79,70,229,.08);pointer-events:none}
.oleo-richdoc mark{border-radius:3px;padding:0 .1em}
`;
