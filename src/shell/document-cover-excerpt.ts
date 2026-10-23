import { unzipSync } from "fflate";
import type { LibraryItem, LibraryKind } from "./library-data";

const MAX_XML_BYTES = 2 * 1024 * 1024;

/**
 * `meta.text_excerpt` 的约定（`00-dispatch.md` §6）：≤600 字，去掉 markdown 记号后的
 * 前几行。上传时由后端（`backend/app/typed_uploads.py::text_excerpt_from_source`）
 * 算，编辑器保存时由文档编辑器经保存内核透传；库卡片读不到时用同一个函数现算。
 * 三处同一套规则，卡片上看到的才不会因为来源不同而变样。
 */
export const TEXT_EXCERPT_MAX_CHARS = 600;
export const TEXT_EXCERPT_MAX_LINES = 8;

const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?$/;
const HORIZONTAL_RULE = /^([-*_])(?:\s*\1){2,}$/;

function stripMarkdownLine(raw: string): string {
  let line = raw
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/^\s*(?:>\s?)+/, "")
    .replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/(\*\*|__)(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/~~(\S(?:.*?\S)?)~~/g, "$1")
    .replace(/(^|[^A-Za-z0-9_*])\*(\S(?:.*?\S)?)\*(?=[^A-Za-z0-9_*]|$)/g, "$1$2")
    .replace(/(^|[^A-Za-z0-9_])_(\S(?:.*?\S)?)_(?=[^A-Za-z0-9_]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
  if (/^\|.*\|$/.test(line)) {
    line = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join(" · ");
  }
  return line;
}

/** 纯文本：不挂 HTML、不解析实体、不碰外链。 */
export function textExcerptFromSource(text: string): string {
  const lines: string[] = [];
  const body = text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  for (const raw of body.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed || /^(?:```|~~~)/.test(trimmed)) continue;
    if (TABLE_SEPARATOR.test(trimmed) || HORIZONTAL_RULE.test(trimmed)) continue;
    const line = stripMarkdownLine(raw);
    if (!line) continue;
    lines.push(line);
    if (lines.length >= TEXT_EXCERPT_MAX_LINES) break;
  }
  return clampExcerpt(lines.join("\n"));
}

/** 按字符（码点）截断，与后端 Python 的 `str[:600]` 同口径。 */
export function clampExcerpt(value: string): string {
  const characters = Array.from(value.trim());
  return characters.length > TEXT_EXCERPT_MAX_CHARS
    ? characters.slice(0, TEXT_EXCERPT_MAX_CHARS).join("").trimEnd()
    : characters.join("");
}

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] || "";
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

function textRuns(xml: string): string {
  return Array.from(xml.matchAll(/<(?:[\w]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w]+:)?t>/g), (match) => decodeXmlText(match[1])).join("");
}

/** Plain text only. Never mount Office XML/HTML, resolve entities, or load external links. */
export function extractDocumentCoverExcerpt(bytes: ArrayBuffer | Uint8Array): string {
  try {
    const parts = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
      filter: (part) => part.originalSize <= MAX_XML_BYTES && /^(word\/document\.xml|ppt\/slides\/slide1\.xml|xl\/(sharedStrings\.xml|worksheets\/sheet1\.xml))$/.test(part.name),
    });
    const read = (path: string) => parts[path] ? new TextDecoder().decode(parts[path]) : "";
    const document = read("word/document.xml") || read("ppt/slides/slide1.xml");
    if (document) {
      return document.split(/<\/(?:w|a):p>/).map(textRuns).map((line) => line.trim()).filter(Boolean).slice(0, 8).join("\n").slice(0, 1200);
    }
    const strings = Array.from(read("xl/sharedStrings.xml").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g), (match) => textRuns(match[1]));
    const sheet = read("xl/worksheets/sheet1.xml");
    return Array.from(sheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)).slice(0, 8).map((row) =>
      Array.from(row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)).slice(0, 6).map((cell) => {
        const value = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] || "";
        if (/\bt=["']s["']/.test(cell[1])) return strings[Number(value)] || "";
        return textRuns(cell[2]) || decodeXmlText(value);
      }).join(" · "),
    ).filter(Boolean).join("\n").slice(0, 1200);
  } catch {
    return "";
  }
}

const DOCUMENT_NAME = /\.(?:md|markdown|txt|docx?|odt|rtf)(?:$|[?#])/i;
const TEXT_MEDIA = /^text\/(?:plain|markdown|x-markdown)$/;
const TEXT_FORMAT = /^(?:txt|md|markdown)$/;
const TEXT_NAME = /\.(?:md|markdown|txt)(?:$|[?#])/i;
const DOCX_MEDIA = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCX_NAME = /\.docx(?:$|[?#])/i;

function mediaTypeOf(value: unknown): string {
  return String(value || "").trim().toLowerCase().split(";", 1)[0];
}

/**
 * D8：文档类的项（txt、md、docx 以及所有「文档」类型）一律是文字卡片——标题加开头几行，
 * **永不**等待或显示 PNG 的 preview / thumbnail（编辑器保存时渲的整页图）。
 * 归类与库的「文档」类别一致：typed 项看 artifactType，旧项看 kind 与文件名。
 */
export function itemUsesTextDocumentCard(
  item: LibraryItem | undefined,
  kind?: LibraryKind,
): boolean {
  if (!item) return false;
  const type = item.artifact?.artifactType || item.artifactType;
  if (type) return type === "document";
  if ((kind || item.kind) === "document") return true;
  return DOCUMENT_NAME.test(String(item.meta.filename || item.url || item.title || ""));
}

/** 上传或保存时存下的摘要；有它就不发网络请求。 */
export function storedTextExcerpt(item: LibraryItem): string {
  const value = item.meta.text_excerpt;
  return typeof value === "string" ? clampExcerpt(value) : "";
}

export type DocumentExcerptSource = { kind: "text" | "docx"; url: string };

type RenditionLike = { url?: string; mediaType?: string; format?: string } | undefined;

function renditionSource(rendition: RenditionLike): DocumentExcerptSource | null {
  const url = String(rendition?.url || "").trim();
  if (!url) return null;
  const media = mediaTypeOf(rendition?.mediaType);
  const format = String(rendition?.format || "").trim().toLowerCase();
  if (TEXT_MEDIA.test(media) || (!media && TEXT_FORMAT.test(format))) return { kind: "text", url };
  if (media === DOCX_MEDIA || (format === "docx" && (!media || media === "application/octet-stream" || media === "application/zip"))) {
    return { kind: "docx", url };
  }
  return null;
}

/**
 * 摘要从哪份字节读：只认**文本或 Word 包本身**，按 source → full → preview → thumbnail。
 * PNG 之类的渲染图一律跳过，不会被当成文字解码。
 */
export function documentExcerptSource(item: LibraryItem): DocumentExcerptSource | null {
  const renditions = item.artifact?.renditions;
  if (renditions) {
    for (const purpose of ["source", "full", "preview", "thumbnail"] as const) {
      const found = renditionSource(renditions[purpose]);
      if (found) return found;
    }
    return null;
  }
  const url = String(item.url || item.previewUrl || "").trim();
  if (!url) return null;
  const media = mediaTypeOf(item.meta.viewer_media_type || item.meta.mime);
  const name = String(item.meta.filename || item.meta.format || url || item.title || "");
  const format = String(item.meta.format || "").trim().toLowerCase();
  if (TEXT_MEDIA.test(media) || TEXT_NAME.test(name) || TEXT_FORMAT.test(format)) return { kind: "text", url };
  if (media === DOCX_MEDIA || DOCX_NAME.test(name) || format === "docx") return { kind: "docx", url };
  return null;
}

/** 字节像图片 / 压缩包 / 含 NUL 时不是文本，宁可不出摘要也不出乱码。 */
export function looksLikeBinaryText(bytes: Uint8Array): boolean {
  if (bytes.length >= 4) {
    const [a, b, c, d] = bytes;
    if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return true; // PNG
    if (a === 0x50 && b === 0x4b && (c === 0x03 || c === 0x05 || c === 0x07)) return true; // ZIP
    if (a === 0xff && b === 0xd8 && c === 0xff) return true; // JPEG
    if (a === 0x25 && b === 0x50 && c === 0x44 && d === 0x46) return true; // %PDF
  }
  return bytes.subarray(0, 4096).includes(0);
}

/** UTF-8 优先（截断在多字节中间也不出替换符），不合法再按 GB18030 读。 */
export function decodeTextHead(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
  } catch {
    try {
      return new TextDecoder("gb18030").decode(bytes, { stream: true });
    } catch {
      return "";
    }
  }
}
