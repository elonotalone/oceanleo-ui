/** 作品图（Portfolio images）：最多 9 张 https 图，第一张当封面。 */

export const BAY_GALLERY_MAX = 9;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i;

/** 相册/相机有时不带 MIME，按扩展名也收。 */
export function isGalleryImageFile(file: { type?: string; name?: string }): boolean {
  const type = (file.type || "").trim().toLowerCase();
  if (type.startsWith("image/")) return true;
  if (type && type !== "application/octet-stream") return false;
  return IMAGE_EXT.test(file.name || "");
}

export function cleanGalleryUrls(urls: unknown, cover?: unknown): string[] {
  const raw = Array.isArray(urls) && urls.length > 0 ? urls : cover !== undefined && cover !== null && cover !== "" ? [cover] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (!text.startsWith("https://") || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= BAY_GALLERY_MAX) break;
  }
  return out;
}

export function galleryCoverUrl(urls: string[]): string {
  return urls[0] || "";
}
