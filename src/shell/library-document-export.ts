/**
 * 库详情里文档的「下载为 Markdown / Word / PDF」。
 *
 * 编辑器里的同类菜单走 live tiptap；这里没有打开的编辑器，只对已经存下来的那份
 * 源文件做格式转换。Markdown 与 Word 在浏览器本地出；PDF 把 Word/纯文本交给
 * 既有的 `/v1/convert/office`。
 */

import { getArtifactDownload } from "./artifact-client";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import { officePackageKindForItem } from "./doc-editors/office-file";

export const LIBRARY_DOCUMENT_DOWNLOAD_FORMATS = [
  { id: "md", label: "Markdown", extension: "md" },
  { id: "docx", label: "Word", extension: "docx" },
  { id: "pdf", label: "PDF", extension: "pdf" },
] as const;

export type LibraryDocumentDownloadFormat =
  (typeof LIBRARY_DOCUMENT_DOWNLOAD_FORMATS)[number]["extension"];

const TEXT_EXTENSIONS = new Set(["md", "markdown", "txt", "html", "htm"]);
const OFFICE_SOURCE_EXTENSIONS = new Set([
  "doc",
  "docx",
  "odt",
  "rtf",
  "txt",
  "pdf",
]);

function cleanMediaType(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(";", 1)[0];
}

function extensionOf(value: unknown): string {
  const text = String(value || "")
    .split(/[?#]/)[0]
    .trim()
    .toLowerCase();
  const match = /\.([a-z0-9]+)$/i.exec(text);
  return match?.[1] || "";
}

function itemExtension(item: LibraryItem): string {
  return (
    extensionOf(item.meta.filename) ||
    extensionOf(item.meta.format) ||
    extensionOf(item.artifact?.sourceFormat) ||
    extensionOf(item.url) ||
    extensionOf(item.previewUrl) ||
    extensionOf(item.title)
  );
}

function itemMediaType(item: LibraryItem): string {
  return cleanMediaType(
    item.artifact?.renditions.source?.mediaType ||
      item.artifact?.renditions.full?.mediaType ||
      item.meta.viewer_media_type ||
      item.meta.content_type ||
      item.meta.mime,
  );
}

export function libraryItemOffersDocumentFormats(item: LibraryItem): boolean {
  if (
    item.kind === "image" ||
    item.kind === "video" ||
    item.kind === "audio" ||
    item.kind === "website" ||
    item.kind === "game" ||
    item.kind === "threed" ||
    item.kind === "ppt" ||
    item.kind === "sheet"
  ) {
    return false;
  }
  const media = itemMediaType(item);
  if (
    media.startsWith("image/") ||
    media.startsWith("video/") ||
    media.startsWith("audio/")
  ) {
    return false;
  }
  if (item.kind === "document" || item.kind === "file") return true;
  const ext = itemExtension(item);
  return (
    TEXT_EXTENSIONS.has(ext) ||
    OFFICE_SOURCE_EXTENSIONS.has(ext) ||
    media.startsWith("text/") ||
    media.includes("wordprocessingml") ||
    media === "application/pdf" ||
    media === "application/msword"
  );
}

function sourceKind(
  item: LibraryItem,
): "docx" | "pdf" | "text" | "unknown" {
  if (officePackageKindForItem(item) === "docx") return "docx";
  const ext = itemExtension(item);
  const media = itemMediaType(item);
  if (ext === "docx" || media.includes("wordprocessingml")) return "docx";
  if (ext === "pdf" || media === "application/pdf") return "pdf";
  if (
    TEXT_EXTENSIONS.has(ext) ||
    media.startsWith("text/") ||
    media === "application/xhtml+xml"
  ) {
    return "text";
  }
  return "unknown";
}

function fileStem(item: LibraryItem): string {
  const raw = String(item.title || "document")
    .replace(/\.[a-z0-9]{2,8}$/i, "")
    .trim();
  return raw || "document";
}

function triggerDownload(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener noreferrer";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function sourceBlob(item: LibraryItem): Promise<{
  blob: Blob;
  filename: string;
  mediaType: string;
}> {
  if (isDurableLibraryItem(item)) {
    const result = await getArtifactDownload(item);
    if (result.ok && result.data) {
      const response = await fetch(result.data.url, {
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) {
        throw new Error(`下载源文件失败 HTTP ${response.status}`);
      }
      return {
        blob: await response.blob(),
        filename: result.data.filename || `${fileStem(item)}.bin`,
        mediaType: result.data.mediaType || itemMediaType(item),
      };
    }
    if (result.error) throw new Error(result.error);
  }
  const url = item.url || item.previewUrl || "";
  if (!url) throw new Error("这份文档没有可下载的源文件。");
  const { fetchMediaBlob } = await import("../lib/media-proxy");
  const blob = await fetchMediaBlob(url);
  return {
    blob,
    filename: `${fileStem(item)}.${itemExtension(item) || "bin"}`,
    mediaType: blob.type || itemMediaType(item),
  };
}

async function blobAsText(blob: Blob): Promise<string> {
  const text = await blob.text();
  if (!text.trim()) throw new Error("这份文档是空的，没有可导出的正文。");
  return text;
}

async function htmlToMarkdown(html: string): Promise<string> {
  const TurndownService = (await import("turndown")).default;
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  return service.turndown(html);
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
  if (!convertToHtml) throw new Error("文档转换模块加载失败。");
  const { value } = await convertToHtml({ arrayBuffer });
  return value;
}

async function markdownToDocxBlob(
  title: string,
  markdown: string,
): Promise<Blob> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import(
    "docx"
  );
  const children: InstanceType<typeof Paragraph>[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      const level = line.match(/^#+/)?.[0].length || 1;
      const text = line.replace(/^#{1,6}\s+/, "");
      const heading =
        level <= 1
          ? HeadingLevel.HEADING_1
          : level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3;
      children.push(new Paragraph({ text, heading }));
      continue;
    }
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line || " ", font: "Microsoft YaHei" })],
      }),
    );
  }
  if (children.length === 0) {
    children.push(new Paragraph({ text: title || "document" }));
  }
  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

async function convertToPdf(source: Blob, sourceName: string): Promise<Blob> {
  const { convertOfficeBlob } = await import(
    "./doc-editors/office-convert-client"
  );
  return convertOfficeBlob(source, sourceName, "pdf");
}

/**
 * 按用户点的格式把当前这份库文档落到本机。成功返回空串，失败返回一句中文原因。
 */
export async function downloadLibraryDocument(
  item: LibraryItem,
  format: LibraryDocumentDownloadFormat,
): Promise<string> {
  try {
    const kind = sourceKind(item);
    const stem = fileStem(item);
    const source = await sourceBlob(item);
    if (format === "md") {
      if (kind === "docx") {
        const html = await docxToHtml(await source.blob.arrayBuffer());
        triggerDownload(
          `${stem}.md`,
          new Blob([await htmlToMarkdown(html)], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        return "";
      }
      const text = await blobAsText(source.blob);
      const markdown =
        itemExtension(item) === "html" || source.mediaType.includes("html")
          ? await htmlToMarkdown(text)
          : text;
      triggerDownload(
        `${stem}.md`,
        new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
      );
      return "";
    }
    if (format === "docx") {
      if (kind === "docx") {
        triggerDownload(`${stem}.docx`, source.blob);
        return "";
      }
      const text = await blobAsText(source.blob);
      const markdown =
        itemExtension(item) === "html" || source.mediaType.includes("html")
          ? await htmlToMarkdown(text)
          : text;
      triggerDownload(`${stem}.docx`, await markdownToDocxBlob(stem, markdown));
      return "";
    }
    if (kind === "pdf") {
      triggerDownload(`${stem}.pdf`, source.blob);
      return "";
    }
    const officeSource =
      kind === "docx"
        ? source.blob
        : await markdownToDocxBlob(stem, await blobAsText(source.blob));
    const officeName =
      kind === "docx" ? source.filename || `${stem}.docx` : `${stem}.docx`;
    triggerDownload(`${stem}.pdf`, await convertToPdf(officeSource, officeName));
    return "";
  } catch (caught) {
    return caught instanceof Error && caught.message
      ? caught.message
      : `导出 ${format.toUpperCase()} 失败。`;
  }
}
