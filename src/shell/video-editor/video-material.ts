import type { LibraryItem } from "../library-data";

export type VideoMaterialKind = "image" | "video" | "audio";

const EXTENSIONS: ReadonlyArray<[VideoMaterialKind, RegExp]> = [
  ["image", /\.(?:png|jpe?g|gif|webp|avif|bmp)(?:$|[?#])/i],
  ["video", /\.(?:mp4|mov|webm|m4v|mkv)(?:$|[?#])/i],
  ["audio", /\.(?:mp3|wav|m4a|aac|ogg|flac)(?:$|[?#])/i],
];

export function videoMaterialKind(item: LibraryItem): VideoMaterialKind | null {
  const type = String(item.artifactType || "");
  if (type === "single_file_image" || type === "composite_image" || type === "vector_image") return "image";
  if (type === "video") return "video";
  if (type === "audio") return "audio";
  const kind = String(item.kind || "");
  if (kind === "image" || kind === "video" || kind === "audio") return kind;
  const mime = String(item.meta?.mime || item.meta?.source_media_type || "");
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const url = item.url || item.previewUrl || "";
  for (const [candidate, pattern] of EXTENSIONS) if (pattern.test(url)) return candidate;
  return null;
}
