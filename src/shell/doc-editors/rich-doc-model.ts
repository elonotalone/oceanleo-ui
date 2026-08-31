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
import { Extension, type JSONContent } from "@tiptap/core";
import type { LibraryItem } from "../library-data";
import { officeExtensionForItem } from "../workbench-routes";
import { urlExtension } from "./doc-io";
import {
  fetchValidatedOfficePackage,
  officePackageKindForItem,
  validateOfficePackageBlob,
} from "./office-file";

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

const UNSUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  "doc",
  "odt",
  "rtf",
  "epub",
  "mht",
]);

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
  onSourceAccessError?: () => void,
): Promise<RichDocLoadResult> {
  try {
    const url =
      String(item.meta.editor_source_url || "").trim() || item.url || "";
    const ext = urlExtension(url) || officeExtensionForItem(item);
    const isDocx =
      officePackageKindForItem(item) === "docx" || ext === "docx";
    if (url && isDocx) {
      const { arrayBuffer } = await fetchValidatedOfficePackage(url, "docx", {
        maxBytes: 64 * 1024 * 1024,
        onAccessDenied: onSourceAccessError,
      });
      return {
        html: await docxToHtml(arrayBuffer),
        source: "url-docx",
        error: "",
      };
    }
    const inline = inlineSource(item);
    if (inline) {
      return { html: await markdownToHtml(inline), source: "inline", error: "" };
    }
    if (url && UNSUPPORTED_DOCUMENT_EXTENSIONS.has(ext)) {
      return {
        html: "<p></p>",
        source: "empty",
        error: `轻量文档编辑器暂不能解析 .${ext} 源文件；请转换为 DOCX 后重试。`,
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
    if (item.source === "artifact") {
      return {
        html: "<p></p>",
        source: "empty",
        error:
          "当前文档 revision 缺少可验证的 source/full 内容；已阻止用空白文档替代。",
      };
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
        html: await docxToHtml(await validateOfficePackageBlob(file, "docx")),
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

// ============================================================================
// 排版层（W15）
// ----------------------------------------------------------------------------
// 行距 / 缩进 / 段间距 / 多级编号 / 表格与图片的几何属性，全部存在节点 attrs 上，
// 并各自带一条 docx 映射。这里只放**纯函数与一个 TipTap Extension**，没有 React，
// 也不 import `docx` —— 映射函数返回的是普通对象，由 `docx-export.ts` 直接 spread，
// 所以本文件不需要知道 OOXML 构造器长什么样。
//
// 为什么不用 `@tiptap/extension-text-style` 自带的 `LineHeight`：它的 `types` 默认是
// `['textStyle']`，是 inline mark。行距在语义上属于段落，docx 的 `w:spacing` 也挂在
// `w:pPr` 上；用 mark 会允许「同一段里两半不同行距」这种 Word 表达不出来的状态，
// 往返必丢。所以行距和缩进一起做成段落 attrs。
// ============================================================================

/** 一磅 = 20 缇（twips），OOXML 的长度单位。 */
const TWIPS_PER_PT = 20;

/**
 * 中文正文的锚点字号（小四 = 12pt）。
 *
 * 只用于把「字符」单位的缩进换算成 docx 的缇。首行缩进走 Word 原生的
 * `w:firstLineChars`（单位 1/100 字符）所以不吃这个近似；悬挂缩进 OOXML 里
 * **没有** `hangingChars`，只能给绝对值，那一条会用这个锚点，是已知的近似。
 */
const RICHDOC_ANCHOR_CHAR_PT = 12;
const CHAR_TWIPS = RICHDOC_ANCHOR_CHAR_PT * TWIPS_PER_PT;

/** 行距预设：倍数档。固定值档由用户直接给磅数。 */
export const RICHDOC_LINE_HEIGHT_MULTIPLES = [
  "1",
  "1.15",
  "1.5",
  "2",
] as const;

export type RichDocLineHeightMode = "multiple" | "exact";

/** 段落排版属性，`paragraph` 与 `heading` 共用。 */
export interface RichDocParagraphAttrs {
  /** `"1.5"` = 1.5 倍；`"22pt"` = 固定 22 磅。 */
  lineHeight: string | null;
  /** 首行缩进，单位「字符」。中文公文默认 2。 */
  firstLineChars: number | null;
  /** 悬挂缩进，单位「字符」。与首行缩进互斥（OOXML 里就是互斥的）。 */
  hangingChars: number | null;
  /** 左缩进，磅。 */
  indentLeft: number | null;
  /** 右缩进，磅。 */
  indentRight: number | null;
  /** 段前间距，磅。 */
  spaceBefore: number | null;
  /** 段后间距，磅。 */
  spaceAfter: number | null;
}

const PARAGRAPH_ATTR_KEYS = [
  "lineHeight",
  "firstLineChars",
  "hangingChars",
  "indentLeft",
  "indentRight",
  "spaceBefore",
  "spaceAfter",
] as const;

/** 拆 `"1.5"` / `"22pt"` 两种写法。非法值一律当「没设」。 */
export function parseRichDocLineHeight(
  value: unknown,
): { mode: RichDocLineHeightMode; value: number } | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const exact = /^(-?[\d.]+)\s*pt$/i.exec(raw);
  if (exact) {
    const pt = Number(exact[1]);
    return Number.isFinite(pt) && pt > 0 && pt <= 1_000
      ? { mode: "exact", value: pt }
      : null;
  }
  const multiple = Number(raw);
  return Number.isFinite(multiple) && multiple > 0 && multiple <= 10
    ? { mode: "multiple", value: multiple }
    : null;
}

function boundedAttr(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const clamped = Math.min(max, Math.max(min, parsed));
  return clamped === 0 ? null : clamped;
}

/**
 * 中文排版预设。**首行缩进 2 字符**是中文公文与正式文稿的硬约定
 * （GB/T 9704 的排版惯例），这一条对目标用户比任何动效都实在。
 */
export const RICHDOC_CN_PARAGRAPH_PRESET: RichDocParagraphAttrs = {
  lineHeight: "1.5",
  firstLineChars: 2,
  hangingChars: null,
  indentLeft: null,
  indentRight: null,
  spaceBefore: null,
  spaceAfter: null,
};

/** 西文/默认预设：清掉缩进，1.15 倍行距，段后 6 磅。 */
export const RICHDOC_DEFAULT_PARAGRAPH_PRESET: RichDocParagraphAttrs = {
  lineHeight: "1.15",
  firstLineChars: null,
  hangingChars: null,
  indentLeft: null,
  indentRight: null,
  spaceBefore: null,
  spaceAfter: 6,
};

// ---------------------------------------------------------------------------
// 多级编号
// ---------------------------------------------------------------------------

export type RichDocNumberingPreset =
  | "decimal"
  | "cn-official"
  | "cn-simple"
  | "lower-alpha"
  | "circled";

export const RICHDOC_NUMBERING_PRESETS: readonly {
  value: RichDocNumberingPreset;
  label: string;
}[] = [
  { value: "decimal", label: "1. / 1.1 / 1.1.1" },
  { value: "cn-official", label: "一、（一）1.（1）—— 公文" },
  { value: "cn-simple", label: "一、二、三" },
  { value: "lower-alpha", label: "a. b. c." },
  { value: "circled", label: "① ② ③" },
];

const CN_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/** 1–99 的中文数字（十、十一、二十…）。超出范围退回阿拉伯数字。 */
export function richDocChineseNumeral(value: number): string {
  const n = Math.trunc(value);
  if (!Number.isFinite(n) || n < 1 || n > 99) return String(value);
  if (n < 10) return CN_DIGITS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const tensPart = tens === 1 ? "十" : `${CN_DIGITS[tens]}十`;
  return ones ? `${tensPart}${CN_DIGITS[ones]}` : tensPart;
}

/**
 * 某一级的编号文字。`depth` 从 0 起。
 *
 * 公文层级是 **一、 →（一）→ 1. →（1）**，四级一循环。这是《党政机关公文格式》
 * 的层次序数写法，也是操作员那句「办公用」最直接的落点。
 */
export function richDocListMarker(
  preset: RichDocNumberingPreset,
  depth: number,
  index: number,
): string {
  const level = Math.max(0, Math.trunc(depth));
  const n = Math.max(1, Math.trunc(index));
  switch (preset) {
    case "cn-official":
      switch (level % 4) {
        case 0:
          return `${richDocChineseNumeral(n)}、`;
        case 1:
          return `（${richDocChineseNumeral(n)}）`;
        case 2:
          return `${n}.`;
        default:
          return `（${n}）`;
      }
    case "cn-simple":
      return `${richDocChineseNumeral(n)}、`;
    case "lower-alpha":
      return n <= 26
        ? `${String.fromCharCode(96 + n)}.`
        : `${n}.`;
    case "circled":
      return n <= CIRCLED.length ? CIRCLED[n - 1] : `(${n})`;
    default:
      return `${n}.`;
  }
}

// ---------------------------------------------------------------------------
// 图片环绕
// ---------------------------------------------------------------------------

/**
 * 环绕方式。**只有两种，这是缩小后的承诺。**
 *
 * 「四周环绕」（文字沿图片外轮廓回流）没有做，理由不是省事：ProseMirror 的文档模型
 * 是线性 inline 流，行盒不知道旁边有个浮动矩形要避开。用 CSS `float` 硬做，
 * 视觉上像环绕，但 `view.posAtCoords()` 会系统性给错位置——点浮动图右侧的文字
 * 光标会跳到图片前面。与其给一个光标会乱跳的「环绕」，不如不给。
 */
export type RichDocImageWrap = "inline" | "top-bottom";

export const RICHDOC_IMAGE_WRAPS: readonly {
  value: RichDocImageWrap;
  label: string;
}[] = [
  { value: "top-bottom", label: "上下型（独占一行）" },
  { value: "inline", label: "嵌入文字行" },
];

// ---------------------------------------------------------------------------
// TipTap 扩展
// ---------------------------------------------------------------------------

/**
 * 把排版属性挂到既有节点上。
 *
 * 这是一个 `Extension`（不是 Node / Mark），只做 `addGlobalAttributes` 与
 * `addCommands`，**不与任何已注册扩展重名**，所以在
 * `use-rich-doc-editor.ts` 的 extensions 数组里加一行不会触发重复注册 throw。
 * 注册请求在 `signals/W15-request.md` §1.1。
 */
export const RichDocTypography = Extension.create({
  name: "richDocTypography",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) =>
              parseRichDocLineHeight(element.style.lineHeight)
                ? element.style.lineHeight.trim()
                : null,
            renderHTML: (attributes) => {
              const parsed = parseRichDocLineHeight(attributes.lineHeight);
              if (!parsed) return {};
              return {
                style: `line-height:${
                  parsed.mode === "exact"
                    ? `${parsed.value}pt`
                    : parsed.value
                }`,
              };
            },
          },
          firstLineChars: {
            default: null,
            parseHTML: (element) => {
              const raw = element.getAttribute("data-first-line-chars");
              return boundedAttr(raw, 0, 20);
            },
            renderHTML: (attributes) => {
              const chars = boundedAttr(attributes.firstLineChars, 0, 20);
              if (chars === null) return {};
              return {
                "data-first-line-chars": String(chars),
                style: `text-indent:${chars}em`,
              };
            },
          },
          hangingChars: {
            default: null,
            parseHTML: (element) =>
              boundedAttr(element.getAttribute("data-hanging-chars"), 0, 20),
            renderHTML: (attributes) => {
              const chars = boundedAttr(attributes.hangingChars, 0, 20);
              if (chars === null) return {};
              // 悬挂 = 首行反向缩进 + 整段左推同样多，第二行起才对齐。
              return {
                "data-hanging-chars": String(chars),
                style: `text-indent:-${chars}em;padding-left:${chars}em`,
              };
            },
          },
          indentLeft: {
            default: null,
            parseHTML: (element) =>
              boundedAttr(element.getAttribute("data-indent-left"), 0, 720),
            renderHTML: (attributes) => {
              const pt = boundedAttr(attributes.indentLeft, 0, 720);
              if (pt === null) return {};
              return {
                "data-indent-left": String(pt),
                style: `margin-left:${pt}pt`,
              };
            },
          },
          indentRight: {
            default: null,
            parseHTML: (element) =>
              boundedAttr(element.getAttribute("data-indent-right"), 0, 720),
            renderHTML: (attributes) => {
              const pt = boundedAttr(attributes.indentRight, 0, 720);
              if (pt === null) return {};
              return {
                "data-indent-right": String(pt),
                style: `margin-right:${pt}pt`,
              };
            },
          },
          spaceBefore: {
            default: null,
            parseHTML: (element) =>
              boundedAttr(element.getAttribute("data-space-before"), 0, 720),
            renderHTML: (attributes) => {
              const pt = boundedAttr(attributes.spaceBefore, 0, 720);
              if (pt === null) return {};
              return {
                "data-space-before": String(pt),
                style: `margin-top:${pt}pt`,
              };
            },
          },
          spaceAfter: {
            default: null,
            parseHTML: (element) =>
              boundedAttr(element.getAttribute("data-space-after"), 0, 720),
            renderHTML: (attributes) => {
              const pt = boundedAttr(attributes.spaceAfter, 0, 720);
              if (pt === null) return {};
              return {
                "data-space-after": String(pt),
                style: `margin-bottom:${pt}pt`,
              };
            },
          },
        },
      },
      {
        // TipTap 的 TableCell 只带 colspan/rowspan/colwidth，底色与垂直对齐
        // 得自己挂。挂在 global attributes 上而不是新写一个 TableCell，
        // 是为了不和已注册的 TableKit 撞名。
        types: ["tableCell", "tableHeader"],
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-background-color") ||
              element.style.backgroundColor ||
              null,
            renderHTML: (attributes) =>
              attributes.backgroundColor
                ? {
                    "data-background-color": String(
                      attributes.backgroundColor,
                    ),
                    style: `background-color:${String(
                      attributes.backgroundColor,
                    )}`,
                  }
                : {},
          },
          verticalAlign: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-vertical-align") || null,
            renderHTML: (attributes) =>
              attributes.verticalAlign
                ? {
                    "data-vertical-align": String(attributes.verticalAlign),
                    style: `vertical-align:${String(attributes.verticalAlign)}`,
                  }
                : {},
          },
        },
      },
      {
        types: ["orderedList"],
        attributes: {
          numbering: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-numbering"),
            renderHTML: (attributes) =>
              attributes.numbering
                ? { "data-numbering": String(attributes.numbering) }
                : {},
          },
        },
      },
      {
        types: ["image"],
        attributes: {
          wrap: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-wrap"),
            renderHTML: (attributes) =>
              attributes.wrap ? { "data-wrap": String(attributes.wrap) } : {},
          },
        },
      },
    ];
  },

});

/** `editor.chain()` 里我们只用到这两个方法，收窄成结构类型省掉泛型噪声。 */
export interface RichDocAttrChain {
  updateAttributes: (
    type: string,
    attrs: Record<string, unknown>,
  ) => RichDocAttrChain;
  run: () => boolean;
}

/**
 * 把段落排版属性打到 `paragraph` 与 `heading` 两种节点上。
 *
 * 两种都打，是因为用户选中一行标题去调行距/段间距时，那当然也该生效——
 * 只打 paragraph 会让「标题调不了行距」变成一个说不清的 bug。
 * 不在类型层面判断光标落在哪种节点上：`updateAttributes` 找不到目标就是空操作。
 */
export function applyRichDocParagraphAttrs(
  chain: RichDocAttrChain,
  attrs: Partial<RichDocParagraphAttrs>,
): boolean {
  let next = chain;
  for (const type of ["paragraph", "heading"]) {
    next = next.updateAttributes(type, attrs as Record<string, unknown>);
  }
  return next.run();
}

// ---------------------------------------------------------------------------
// docx 映射（导出侧）
// ---------------------------------------------------------------------------

export interface RichDocDocxParagraphProperties {
  spacing?: {
    before?: number;
    after?: number;
    line?: number;
    lineRule?: "auto" | "exactly";
  };
  indent?: {
    left?: number;
    right?: number;
    firstLine?: number;
    firstLineChars?: number;
    hanging?: number;
  };
}

/**
 * 段落 attrs → docx 段落选项。**这一条是「排版做出来但导出丢失」的唯一防线**，
 * 拆掉任意一个分支，`tests/richdoc-typography.test.mjs` 的对应往返用例当场红。
 *
 * `listLevel` 给多级编号用：每级左缩进递进一个字符宽。
 */
export function richDocDocxParagraphProperties(
  attrs: Record<string, unknown> | null | undefined,
  listLevel = 0,
): RichDocDocxParagraphProperties {
  const source = attrs || {};
  const out: RichDocDocxParagraphProperties = {};

  const spacing: NonNullable<RichDocDocxParagraphProperties["spacing"]> = {};
  const before = boundedAttr(source.spaceBefore, 0, 720);
  const after = boundedAttr(source.spaceAfter, 0, 720);
  if (before !== null) spacing.before = Math.round(before * TWIPS_PER_PT);
  if (after !== null) spacing.after = Math.round(after * TWIPS_PER_PT);
  const line = parseRichDocLineHeight(source.lineHeight);
  if (line) {
    if (line.mode === "exact") {
      spacing.line = Math.round(line.value * TWIPS_PER_PT);
      spacing.lineRule = "exactly";
    } else {
      // 倍数行距在 OOXML 里是「240 缇 = 1 倍」，lineRule=auto。
      spacing.line = Math.round(line.value * 240);
      spacing.lineRule = "auto";
    }
  }
  if (Object.keys(spacing).length) out.spacing = spacing;

  const indent: NonNullable<RichDocDocxParagraphProperties["indent"]> = {};
  const left = boundedAttr(source.indentLeft, 0, 720);
  const right = boundedAttr(source.indentRight, 0, 720);
  const levelIndent = Math.max(0, Math.trunc(listLevel)) * CHAR_TWIPS;
  const leftTwips = (left === null ? 0 : left * TWIPS_PER_PT) + levelIndent;
  if (leftTwips) indent.left = Math.round(leftTwips);
  if (right !== null) indent.right = Math.round(right * TWIPS_PER_PT);
  const hanging = boundedAttr(source.hangingChars, 0, 20);
  const firstLine = boundedAttr(source.firstLineChars, 0, 20);
  if (hanging !== null) {
    // OOXML 没有 hangingChars，只能给绝对值；锚点字号见 RICHDOC_ANCHOR_CHAR_PT。
    indent.hanging = Math.round(hanging * CHAR_TWIPS);
  } else if (firstLine !== null) {
    // firstLineChars 是 Word 原生的「字符」单位（1/100 字符），中文首行缩进
    // 2 字符用它表达不丢精度；同时给 firstLine 兜住不认这个属性的阅读器。
    indent.firstLineChars = Math.round(firstLine * 100);
    indent.firstLine = Math.round(firstLine * CHAR_TWIPS);
  }
  if (Object.keys(indent).length) out.indent = indent;

  return out;
}

export interface RichDocDocxCellProperties {
  columnSpan?: number;
  rowSpan?: number;
  width?: { size: number; type: "dxa" };
  shading?: { fill: string; type: "clear" };
  verticalAlign?: "top" | "center" | "bottom";
}

/**
 * 表格单元格 attrs → docx 单元格选项。
 *
 * **`colspan`/`rowspan` 这一段修的是既有 bug**：合并单元格在编辑器里做出来，
 * 导出时 `docx-export.ts` 完全没读这两个 attr，合并会在 docx 里散开。
 */
export function richDocDocxCellProperties(
  attrs: Record<string, unknown> | null | undefined,
): RichDocDocxCellProperties {
  const source = attrs || {};
  const out: RichDocDocxCellProperties = {};

  const colspan = Number(source.colspan);
  if (Number.isFinite(colspan) && colspan > 1) {
    out.columnSpan = Math.min(64, Math.trunc(colspan));
  }
  const rowspan = Number(source.rowspan);
  if (Number.isFinite(rowspan) && rowspan > 1) {
    out.rowSpan = Math.min(64, Math.trunc(rowspan));
  }

  // ProseMirror 的 colwidth 是像素数组（每个被合并列一个值）。
  const colwidth = source.colwidth;
  const widths = Array.isArray(colwidth)
    ? colwidth.map((value) => Number(value)).filter((value) =>
        Number.isFinite(value) && value > 0,
      )
    : [];
  if (widths.length) {
    const px = widths.reduce((sum, value) => sum + value, 0);
    // 96 px = 1 inch = 1440 缇。
    out.width = { size: Math.round((px / 96) * 1440), type: "dxa" };
  }

  const fill = String(source.backgroundColor || "").replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(fill)) {
    out.shading = { fill: fill.toUpperCase(), type: "clear" };
  }

  const align = String(source.verticalAlign || "");
  if (align === "top" || align === "center" || align === "bottom") {
    out.verticalAlign = align;
  }

  return out;
}

/** 表头行是否在跨页时重复。Word 里这是行属性 `w:tblHeader`。 */
export function richDocDocxRowProperties(
  row: { type?: string; content?: unknown[] } | null | undefined,
  isFirstRow: boolean,
): { tableHeader?: boolean } {
  if (!isFirstRow || !row) return {};
  const cells = Array.isArray(row.content) ? row.content : [];
  const allHeader =
    cells.length > 0 &&
    cells.every(
      (cell) =>
        (cell as { type?: string } | null)?.type === "tableHeader",
    );
  return allHeader ? { tableHeader: true } : {};
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

/* --- 多级编号（W15）---------------------------------------------------------
   分级格式用 @counter-style 做，不用 CSS counter 手搓：counter 方案要给每一级
   写一条 counter-reset/increment，层数一多就漂移，而 list-style-type 是浏览器
   自己算的，nested ol 天然按嵌套深度取到对应那一级的格式。
   「（一）」这种带括号的格式 list-style-type 表达不了，所以 extends 一个内置
   系统再加 prefix/suffix。 */
@counter-style oleo-cn-dun{system:extends simp-chinese-informal;suffix:"、"}
@counter-style oleo-cn-paren{system:extends simp-chinese-informal;prefix:"（";suffix:"）"}
@counter-style oleo-num-paren{system:extends decimal;prefix:"（";suffix:"）"}
@counter-style oleo-circled{system:fixed;symbols:"①" "②" "③" "④" "⑤" "⑥" "⑦" "⑧" "⑨" "⑩" "⑪" "⑫" "⑬" "⑭" "⑮" "⑯" "⑰" "⑱" "⑲" "⑳";suffix:" "}
.oleo-richdoc ol[data-numbering="cn-official"]{list-style-type:oleo-cn-dun}
.oleo-richdoc ol[data-numbering="cn-official"] ol{list-style-type:oleo-cn-paren}
.oleo-richdoc ol[data-numbering="cn-official"] ol ol{list-style-type:decimal}
.oleo-richdoc ol[data-numbering="cn-official"] ol ol ol{list-style-type:oleo-num-paren}
.oleo-richdoc ol[data-numbering="cn-simple"]{list-style-type:oleo-cn-dun}
.oleo-richdoc ol[data-numbering="lower-alpha"]{list-style-type:lower-alpha}
.oleo-richdoc ol[data-numbering="circled"]{list-style-type:oleo-circled}
.oleo-richdoc ol[data-numbering] ol{margin-top:.25em}

/* --- 行内图与上下型（W15，承诺已缩小：不做四周环绕，理由见 RichDocImageWrap）--- */
.oleo-richdoc img[data-wrap="inline"]{display:inline-block;vertical-align:bottom;margin:0 .2em}
.oleo-richdoc img[data-wrap="top-bottom"]{display:block;margin:.8em auto}

/* --- 列宽拖拽（W14 打开 TableKit.resizable 后这套样式才有东西可画）--------- */
.oleo-richdoc .tableWrapper{overflow-x:auto}
.oleo-richdoc .column-resize-handle{position:absolute;right:-2px;top:0;bottom:-2px;width:4px;background:#4f46e5;pointer-events:none}
.oleo-richdoc.resize-cursor{cursor:col-resize}
`;
