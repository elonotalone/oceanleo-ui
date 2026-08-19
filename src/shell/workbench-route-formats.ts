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

/**
 * 每一条都要有人真跑过。
 *
 * 这几张表的取舍**逐条对着 W10 在活体转换服务上的实测**（`signals/W10-journal.md` P1/P2）
 * 与 LibreOffice 的源格式白名单（`oceanleo/convert/office.py:27` `_OFFICE_EXTS`）：
 * 转不了的一律不列。列一个转不了的后缀，等于让用户传完整个文件、等完整段上传，
 * 才被告知打不开——那比一开始就说「这里还打不开它」糟得多。
 */

/**
 * 文档路由直接吃得下的纯文本入口。
 *
 * 它们**不需要**后端转（LibreOffice 白名单里根本没有 md/html，W10 实测 400），
 * 文档编辑器自己读文本，`editorCapabilityFor()` 今天就把它们判到 richdoc。
 */
export const RICHDOC_TEXT_EXT = new Set([
  "md",
  "markdown",
  "txt",
  "html",
  "htm",
]);
/**
 * 表格入口：`csv` LibreOffice 直转 xlsx（W10 实测 4958B）；
 * `tsv` 白名单里没有，由网关先按制表符改写成 csv 再转（W10 本波新增，已单测）。
 */
export const GRID_IMPORT_EXT = new Set(["csv", "tsv"]);
/**
 * 演示入口：**空**。LibreOffice 只收 ppt/pptx/odp，而这三个已经在原生集里；
 * keynote/dps 之类没有任何解析路径。
 */
export const DECK_IMPORT_EXT = new Set<string>([]);
/**
 * 图片入口：浏览器解不了、后端 PIL 能转的那些（W10 实测 bmp/tiff/gif/ico/ppm/tga 全 200）。
 *
 * **heic/heif 刻意不在这里**：转换容器与网关的 PIL 都没注册 `.heic`/`.heif`，
 * ffmpeg 也没有 heif 解封装器（W10 实测），少的是 `pillow-heif`/`libheif`，
 * 而那要改镜像，不在本波任何人的路径里。手机照片这条今天就是打不开，明说。
 */
export const IMAGE_IMPORT_EXT = new Set(["tif", "tiff", "ico", "ppm", "tga", "jfif"]);
/** 视频入口：`wmv → mp4` 已实测（14523B）。avi/mkv/webm 本来就在原生集里。 */
export const VIDEO_IMPORT_EXT = new Set(["wmv"]);
/**
 * 音频入口：**空**。W10 实测能转的 flac/ogg/wav/m4a/aac/wma 全部已在原生集，
 * 3gp/amr 本机造不出样片、**未证**，不进表。
 */
export const AUDIO_IMPORT_EXT = new Set<string>([]);
/**
 * 3D 入口：等 W10 的 `verdicts/W10-delivery.md` 落盘后按它的实际结论补。
 *
 * 它的流水已实测 obj/stl → glb 能转（网关纯 Python，只留形状不留材质）、
 * fbx 转不了（FBX SDK / Blender 都不在机器上）；交付说明落盘前不改这里。
 */
export const MODEL_IMPORT_EXT = new Set<string>([]);

/**
 * 用户真会拖进来、但**这台服务器已经实测转不了**的那几个后缀，各自配一句能照做的话。
 *
 * 不写这张表的话，手机照片会掉进「现在支持：AVIF、BMP、CSV…」那一长串里，用户读完
 * 只知道「不支持」，不知道下一步该干什么。能转不能转是后端的事，但**告诉用户怎么绕过去**
 * 是这里的事。
 *
 * 只收 `[实测]` 过的：没证过的后缀一律走那串通用清单，不许在这里替后端打包票。
 * 哪天后端把缺的装上（heic 要 `pillow-heif`/`libheif`，fbx 要 FBX SDK 或 Blender），
 * 从这里删掉、加进上面对应的 `*_IMPORT_EXT` 即可，界面不用改。
 */
const UPLOAD_UNAVAILABLE = new Map<string, string>([
  [
    "heic",
    "这里还打不开 iPhone 的 HEIC 照片。在手机上打开「设置 → 相机 → 格式」选「兼容性最佳」，" +
      "之后拍的就是 JPG；已经拍好的照片，用相册的「拷贝并保留原始文件」导出成 JPG 再拖进来。",
  ],
  [
    "heif",
    "这里还打不开 HEIF 照片。先在手机或看图软件里导出成 JPG、PNG，再拖进来。",
  ],
  [
    "fbx",
    "这里还打不开 FBX 模型。FBX 是 Autodesk 的私有格式，得用建模软件（Blender 等）" +
      "导出成 GLB 或 glTF 再拖进来。",
  ],
]);

/**
 * 这个后缀有没有一句专门的原因；没有就返回空串，由调用方给那串通用清单。
 */
export function uploadUnavailableReason(value: string): string {
  return UPLOAD_UNAVAILABLE.get(normalizedUploadExtension(value)) || "";
}

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
  {
    target: "richdoc",
    native: new Set([...WORD_EXT, ...RICHDOC_TEXT_EXT]),
    imported: new Set<string>([]),
  },
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
