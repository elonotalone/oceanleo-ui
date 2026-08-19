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

// ============================================================================
// 入口后缀（**只用于「用户刚拖进来的本地文件」**）
// ----------------------------------------------------------------------------
// 上面那些 `*_EXT` 是**素材路由**用的：一件素材声明自己是这个后缀，就直接挂对应
// 编辑器。它们一个都不能加——加进去等于宣称「这个后缀我原生就能打开」，而 tiff、
// heic 这些浏览器根本解不了，挂上去只会得到一个空白编辑器。
//
// 下面这几张是**入口表**：用户手上的文件属于哪一家，要先转一道才能编。它们只喂给
// `uploadEditorTargetForExtension()`（空框第一次落文件时判去哪条路由），以及 W2/W3
// 写自己那张「转成什么」的映射时对表用。真能不能转由后端端点说了算，判型表不替它
// 打包票。
// ============================================================================

/** 文档家族入口：LibreOffice 读得进来的文本/文档格式。 */
export const RICHDOC_IMPORT_EXT = new Set([
  "md",
  "markdown",
  "txt",
  "html",
  "htm",
  "wps",
  "pages",
]);
/** 表格家族入口。 */
export const GRID_IMPORT_EXT = new Set(["csv", "tsv", "numbers", "et"]);
/** 演示家族入口。 */
export const DECK_IMPORT_EXT = new Set(["key", "dps"]);
/** 图片家族入口：浏览器解不了、要后端转一道的那些。 */
export const IMAGE_IMPORT_EXT = new Set([
  "heic",
  "heif",
  "tif",
  "tiff",
  "ico",
  "jfif",
]);
/** 视频家族入口。 */
export const VIDEO_IMPORT_EXT = new Set(["3gp", "wmv", "flv", "ts", "m2ts"]);
/** 音频家族入口。 */
export const AUDIO_IMPORT_EXT = new Set(["amr", "aiff", "aif", "ac3"]);
/**
 * 3D 家族入口。
 *
 * **刻意为空**：obj/stl/fbx 能不能真转成 glb 在本机还没有人证过（合同 §1 的 `[待核]`，
 * 由 W10 去证）。没证之前把它们列进来，等于让用户传一个 obj 上来、看着它上传完、
 * 再告诉他打不开——那比一开始就说「这里还打不开 OBJ」更糟。
 */
export const MODEL_IMPORT_EXT = new Set<string>([]);

/** 本地文件第一次落进工作台时，它该去哪条编辑器路由。 */
export type UploadEditorTarget =
  | "richdoc"
  | "grid"
  | "deck"
  | "pdf"
  | "image"
  | "video-timeline"
  | "audio"
  | "threed";

const UPLOAD_TARGETS: readonly {
  target: UploadEditorTarget;
  native: ReadonlySet<string>;
  imported: ReadonlySet<string>;
}[] = [
  { target: "deck", native: SLIDE_EXT, imported: DECK_IMPORT_EXT },
  { target: "grid", native: CELL_EXT, imported: GRID_IMPORT_EXT },
  { target: "richdoc", native: WORD_EXT, imported: RICHDOC_IMPORT_EXT },
  { target: "pdf", native: new Set(["pdf"]), imported: new Set<string>() },
  { target: "image", native: IMAGE_EXT, imported: IMAGE_IMPORT_EXT },
  {
    target: "video-timeline",
    native: VIDEO_EXT,
    imported: VIDEO_IMPORT_EXT,
  },
  { target: "audio", native: AUDIO_EXT, imported: AUDIO_IMPORT_EXT },
  { target: "threed", native: MODEL_EXT, imported: MODEL_IMPORT_EXT },
];

export function normalizedUploadExtension(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
}

/**
 * 这个后缀该去哪条编辑器路由；认不出来返回空串。
 *
 * `needsConversion` 是「要先转一道」——空框据此告诉用户「正在转成能编的格式」，
 * 而不是让他盯着一个不动的界面。
 */
export function uploadEditorTargetForExtension(value: string): {
  target: UploadEditorTarget | "";
  needsConversion: boolean;
} {
  const extension = normalizedUploadExtension(value);
  if (!extension) return { target: "", needsConversion: false };
  for (const entry of UPLOAD_TARGETS) {
    if (entry.native.has(extension)) {
      return { target: entry.target, needsConversion: false };
    }
    if (entry.imported.has(extension)) {
      return { target: entry.target, needsConversion: true };
    }
  }
  return { target: "", needsConversion: false };
}

export function uploadEditorTargetForFileName(name: string): {
  extension: string;
  target: UploadEditorTarget | "";
  needsConversion: boolean;
} {
  const raw = String(name || "");
  const dot = raw.lastIndexOf(".");
  const extension = dot > 0 ? normalizedUploadExtension(raw.slice(dot + 1)) : "";
  return { extension, ...uploadEditorTargetForExtension(extension) };
}

/** 「我们支持哪些」——写给用户看的那一串，不许现编。 */
export function uploadSupportedExtensions(): string[] {
  return [
    ...new Set(
      UPLOAD_TARGETS.flatMap((entry) => [
        ...entry.native,
        ...entry.imported,
      ]),
    ),
  ].sort();
}

/** 按家族分组的入口后缀。界面照这个分组说「这里支持什么」，不许各处自己抄一份。 */
export function uploadSupportedExtensionsByTarget(): {
  target: UploadEditorTarget;
  extensions: string[];
}[] {
  return UPLOAD_TARGETS.map((entry) => ({
    target: entry.target,
    extensions: [...new Set([...entry.native, ...entry.imported])].sort(),
  })).filter((entry) => entry.extensions.length > 0);
}
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
