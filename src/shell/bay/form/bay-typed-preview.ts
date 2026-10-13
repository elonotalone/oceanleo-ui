export type PreviewFileKind = "image" | "video" | "audio" | "ppt" | "sheet" | "document" | "website" | "file";

export type PreviewSlide =
  | { type: "artifact"; id: string; title?: string }
  | { type: "image"; url: string };

export type BayTypedSlide = PreviewSlide;
export type BayTypedFileKind = PreviewFileKind;

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif", "avif", "svg"]);
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v"]);
const AUDIO_EXT = new Set(["mp3", "wav", "m4a", "aac", "ogg"]);
const PPT_EXT = new Set(["ppt", "pptx"]);
const SHEET_EXT = new Set(["xls", "xlsx", "csv"]);
const DOC_EXT = new Set(["doc", "docx", "pdf", "rtf", "odt", "md", "txt"]);
const WEB_EXT = new Set(["html", "htm"]);

function extensionOf(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  let path = raw.split("?")[0].split("#")[0];
  try {
    if (/^https?:\/\//i.test(raw)) path = new URL(raw).pathname;
  } catch {
    /* keep stripped path */
  }
  const base = path.split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function kindFromUrl(url: string): PreviewFileKind {
  const ext = extensionOf(url);
  if (PPT_EXT.has(ext)) return "ppt";
  if (SHEET_EXT.has(ext)) return "sheet";
  if (DOC_EXT.has(ext)) return "document";
  if (WEB_EXT.has(ext)) return "website";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (IMAGE_EXT.has(ext)) return "image";
  return "file";
}

export function slidesFrom(input: { artifactId?: string; workTitle?: string; imageUrls: string[] }): PreviewSlide[] {
  const slides: PreviewSlide[] = [];
  const artifactId = String(input.artifactId || "").trim();
  const title = String(input.workTitle || "").trim();
  if (artifactId) {
    slides.push(title ? { type: "artifact", id: artifactId, title } : { type: "artifact", id: artifactId });
  }
  const urls = Array.isArray(input.imageUrls) ? input.imageUrls : [];
  for (const item of urls) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (!url.startsWith("https://")) continue;
    slides.push({ type: "image", url });
  }
  return slides;
}
