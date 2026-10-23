import type { LibraryItem } from "../library-data";

const IMAGE_URL = /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i;

/** 只收图片：视频、文档的预览图不算图片素材（插进去是一张截图，不是用户要的东西）。 */
export function deckAcceptsMaterial(material: LibraryItem): boolean {
  const mime = String(material.meta.mime || "").toLowerCase();
  return (
    material.kind === "image" ||
    material.artifactType === "image" ||
    mime.startsWith("image/") ||
    IMAGE_URL.test(material.url || "")
  );
}

export function deckMaterialImageUrl(material: LibraryItem): string {
  const candidates = [material.previewUrl, material.thumbUrl, material.url].filter(
    Boolean,
  ) as string[];
  return candidates.find((candidate) => IMAGE_URL.test(candidate)) || candidates[0] || "";
}
