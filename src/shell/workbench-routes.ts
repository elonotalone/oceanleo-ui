"use client";

// 高级内容工作台 v2 的类型路由：一个素材应该由哪个编辑器承接。
// 单一事实源——壳（AdvancedContentWorkbench）与工具栏标签都从这里取。

import type { MediaType } from "../lib/database";
import { officeExtensionOf } from "../lib/office-client";
import type { LibraryItem } from "./library-data";

export type EditorRoute =
  | { type: "office"; ext: string }
  | { type: "video-timeline" }
  | { type: "audio" }
  | { type: "image" }
  | { type: "pdf" }
  | { type: "richdoc" }
  | { type: "grid" }
  | { type: "deck" }
  | { type: "threed" }
  | { type: "embed"; base: string; mediaType: MediaType }
  | { type: "none" };

const WORD_EXT = new Set([
  "docx",
  "doc",
  "odt",
  "rtf",
  "docm",
  "dotx",
  "epub",
  "mht",
]);
const CELL_EXT = new Set(["xlsx", "xls", "ods", "xlsm", "xltx"]);
const SLIDE_EXT = new Set([
  "pptx",
  "ppt",
  "odp",
  "pptm",
  "pot",
  "potx",
  "potm",
]);
const VIDEO_EXT = new Set([
  "mp4",
  "webm",
  "mov",
  "mkv",
  "m4v",
  "avi",
  "mpeg",
  "mpg",
  "ogv",
]);
const AUDIO_EXT = new Set([
  "mp3",
  "wav",
  "m4a",
  "flac",
  "ogg",
  "oga",
  "opus",
  "aac",
  "wma",
]);
const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "svg",
  "avif",
]);
const MODEL_EXT = new Set(["glb", "gltf"]);

function extOf(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (!path.includes(".")) return "";
    return path.split(".").pop() || "";
  } catch {
    return "";
  }
}

function hasInlineText(item: LibraryItem): boolean {
  if (item.content?.trim()) return true;
  return ["content", "text", "markdown", "source"].some(
    (key) => typeof item.meta[key] === "string" && String(item.meta[key]).trim(),
  );
}

function hasStructuredSlides(item: LibraryItem): boolean {
  if (Array.isArray(item.meta.slides) && item.meta.slides.length > 0) return true;
  const content = (item.content || "").trim();
  if (content.startsWith("{")) {
    try {
      const parsed = JSON.parse(content) as { slides?: unknown };
      return Array.isArray(parsed.slides) && parsed.slides.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

/** 素材 → 编辑器路由。 */
export function editorRouteFor(item: LibraryItem): EditorRoute {
  const url = item.url || item.previewUrl || "";
  const ext = extOf(url);
  const officeExt = url ? officeExtensionOf(url) : "";
  const mime = String(item.meta.mime || "").toLowerCase();
  const isPdf = mime === "application/pdf" || ext === "pdf";

  switch (item.kind) {
    case "image":
    case "xhs":
      return { type: "image" };
    case "video":
      return { type: "video-timeline" };
    case "audio":
      return { type: "audio" };
    case "ppt":
      if (officeExt && SLIDE_EXT.has(officeExt)) return { type: "office", ext: officeExt };
      if (hasStructuredSlides(item)) return { type: "deck" };
      if (isPdf) return { type: "pdf" };
      return { type: "deck" };
    case "sheet":
      if (officeExt && CELL_EXT.has(officeExt)) return { type: "office", ext: officeExt };
      return { type: "grid" };
    case "document":
      if (officeExt && WORD_EXT.has(officeExt)) return { type: "office", ext: officeExt };
      if (isPdf) return { type: "pdf" };
      return { type: "richdoc" };
    case "website": {
      const projectId =
        item.meta.website_id ||
        item.meta.project_id ||
        item.meta.slug ||
        item.meta.site_id;
      const starterId = item.meta.starter_id;
      if (!projectId && !starterId) return { type: "none" };
      return {
        type: "embed",
        base: "https://website.oceanleo.com/embed/site-editor",
        mediaType: "website",
      };
    }
    case "canvas":
      return item.siteId === "video" ||
        item.siteId === "video.oceanleo.com" ||
        item.meta.editor === "video-canvas"
        ? {
            type: "embed",
            base: "https://video.oceanleo.com/canvas-board",
            mediaType: "video_canvas",
          }
        : {
            type: "embed",
            base: "https://design.oceanleo.com/embed/editor",
            mediaType: "canvas",
          };
    case "video_canvas":
      return {
        type: "embed",
        base: "https://video.oceanleo.com/canvas-board",
        mediaType: "video_canvas",
      };
    case "threed":
      return MODEL_EXT.has(ext) ||
        mime === "model/gltf-binary" ||
        mime === "model/gltf+json"
        ? { type: "threed" }
        : { type: "none" };
    case "file": {
      if (officeExt && (WORD_EXT.has(officeExt) || CELL_EXT.has(officeExt) || SLIDE_EXT.has(officeExt))) {
        return { type: "office", ext: officeExt };
      }
      if (isPdf) return { type: "pdf" };
      if (VIDEO_EXT.has(ext) || mime.startsWith("video/")) {
        return { type: "video-timeline" };
      }
      if (AUDIO_EXT.has(ext) || mime.startsWith("audio/")) {
        return { type: "audio" };
      }
      if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) {
        return { type: "image" };
      }
      if (
        MODEL_EXT.has(ext) ||
        mime === "model/gltf-binary" ||
        mime === "model/gltf+json"
      ) {
        return { type: "threed" };
      }
      if (ext === "csv" || mime === "text/csv") return { type: "grid" };
      if (["md", "markdown", "txt", "html", "htm"].includes(ext) || hasInlineText(item)) {
        return { type: "richdoc" };
      }
      return { type: "none" };
    }
    default:
      return { type: "none" };
  }
}

/** 「编辑」工具在工具栏上的具体名字（按路由）。 */
export function editorToolLabel(route: EditorRoute): string {
  switch (route.type) {
    case "office":
      return "Office 编辑";
    case "video-timeline":
      return "时间线剪辑";
    case "audio":
      return "音频处理";
    case "image":
      return "图片编辑";
    case "pdf":
      return "PDF 工作台";
    case "richdoc":
      return "文档编辑";
    case "grid":
      return "表格编辑";
    case "deck":
      return "幻灯片编辑";
    case "threed":
      return "3D 查看";
    case "embed":
      return route.mediaType === "website"
        ? "网站编辑"
        : route.mediaType === "video_canvas"
          ? "节点画布"
          : "画布编辑";
    default:
      return "编辑";
  }
}
