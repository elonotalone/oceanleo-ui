"use client";

/**
 * 后缀 / MIME 判型表。从 `workbench-routes.ts` 拆出来的**纯查表层**，没有任何判定
 * 语义：路由决策仍然只在 `editorCapabilityFor()` 那一处。拆分理由是尺寸闸——
 * 工作台模块 600 行软顶 / 800 行硬顶，路由层要留出空间给真正的判定分支。
 */

export const ROUND_TRIP = ["load", "mutate", "save", "reopen"] as const;

export const WORD_EXT = new Set([
  "docx",
  "doc",
  "odt",
  "rtf",
  "docm",
  "dotx",
  "epub",
  "mht",
]);
export const CELL_EXT = new Set([
  "xlsx",
  "xls",
  "ods",
  "xlsm",
  "xlsb",
  "xltx",
]);
export const NATIVE_GRID_EXT = new Set(CELL_EXT);
export const SLIDE_EXT = new Set([
  "pptx",
  "ppt",
  "odp",
  "pptm",
  "pot",
  "potx",
  "potm",
]);
export const NATIVE_DECK_EXT = new Set(SLIDE_EXT);
export const NATIVE_RICHDOC_EXT = new Set(WORD_EXT);
export const VIDEO_EXT = new Set([
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
export const AUDIO_EXT = new Set([
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
export const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "svg",
  "avif",
]);
export const MODEL_EXT = new Set(["glb", "gltf"]);
const OFFICE_MIME_EXT = new Map<string, string>([
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
  ["application/msword", "doc"],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx",
  ],
  ["application/vnd.ms-excel", "xls"],
  [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pptx",
  ],
  ["application/vnd.ms-powerpoint.presentation.macroenabled.12", "pptm"],
  [
    "application/vnd.openxmlformats-officedocument.presentationml.template",
    "potx",
  ],
  ["application/vnd.ms-powerpoint.template.macroenabled.12", "potm"],
  ["application/vnd.ms-powerpoint", "ppt"],
]);

export function extOf(url: string): string {
  try {
    const path = new URL(url, "https://local.invalid").pathname.toLowerCase();
    if (!path.includes(".")) return "";
    return path.split(".").pop() || "";
  } catch {
    return "";
  }
}

function officeExtensionOf(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^\./, "");
  const extension =
    WORD_EXT.has(normalized) ||
    CELL_EXT.has(normalized) ||
    SLIDE_EXT.has(normalized)
      ? normalized
      : extOf(value);
  return WORD_EXT.has(extension) ||
    CELL_EXT.has(extension) ||
    SLIDE_EXT.has(extension)
    ? extension
    : "";
}

export function officeExtensionForItem(item: {
  url?: string;
  previewUrl?: string;
  title?: string;
  meta: Record<string, unknown>;
}): string {
  const meta = item.meta || {};
  const candidates = [
    item.url,
    item.previewUrl,
    meta.file_name,
    meta.filename,
    meta.name,
    meta.format,
    meta.extension,
    meta.ext,
    item.title,
  ];
  for (const candidate of candidates) {
    const extension = officeExtensionOf(String(candidate || ""));
    if (extension) return extension;
  }
  return OFFICE_MIME_EXT.get(String(meta.mime || "").toLowerCase()) || "";
}
