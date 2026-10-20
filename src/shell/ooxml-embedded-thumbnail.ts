/**
 * Word / PPTX / XLSX 自带的封面图。
 *
 * OOXML 包里经常有 `docProps/thumbnail.jpeg`（Word「保存预览图」）。这张图很小，
 * 解出来就能当货架封面，不必等 LibreOffice 把整份文档渲成 PDF。没有这张内嵌图时
 * 返回 null，调用方再走纸面封面或转换服务。
 */

import { unzipSync } from "fflate";

const THUMBNAIL_PARTS = [
  "docProps/thumbnail.jpeg",
  "docProps/thumbnail.jpg",
  "docProps/thumbnail.png",
  "docProps/thumbnail.JPG",
  "docProps/thumbnail.PNG",
] as const;

const DISPLAYABLE_THUMBNAIL_MEDIA: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
};

export interface OoxmlEmbeddedThumbnail {
  bytes: Uint8Array;
  mediaType: string;
  partName: string;
}

function extensionOf(partName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(partName);
  return (match?.[1] || "").toLowerCase();
}

function looksLikeImage(bytes: Uint8Array, mediaType: string): boolean {
  if (bytes.length < 8) return false;
  if (mediaType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * 从一份 OOXML 包里取出内嵌封面。bytes 必须是完整 zip；解压失败或没有可显示
 * 的 jpeg/png 封面时返回 null。
 */
export function extractOoxmlEmbeddedThumbnail(
  bytes: Uint8Array | ArrayBuffer,
): OoxmlEmbeddedThumbnail | null {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (source.length < 4 || source[0] !== 0x50 || source[1] !== 0x4b) {
    return null;
  }
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(source, {
      filter: (file) =>
        THUMBNAIL_PARTS.some(
          (name) =>
            file.name.replace(/^\//, "").toLowerCase() === name.toLowerCase(),
        ),
    });
  } catch {
    return null;
  }
  for (const name of THUMBNAIL_PARTS) {
    const part =
      parts[name] ||
      parts[`/${name}`] ||
      Object.entries(parts).find(
        ([key]) => key.replace(/^\//, "").toLowerCase() === name.toLowerCase(),
      )?.[1];
    if (!part || part.length < 8) continue;
    const mediaType = DISPLAYABLE_THUMBNAIL_MEDIA[extensionOf(name)];
    if (!mediaType || !looksLikeImage(part, mediaType)) continue;
    return { bytes: part, mediaType, partName: name };
  }
  return null;
}

export function ooxmlThumbnailObjectUrl(
  thumbnail: OoxmlEmbeddedThumbnail,
): string {
  const copy = thumbnail.bytes.slice();
  const blob = new Blob([copy as BlobPart], { type: thumbnail.mediaType });
  return URL.createObjectURL(blob);
}
