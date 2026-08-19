/**
 * 视觉影音家族（图片 / 视频 / 音频 / 图表 / 3D）的交付格式与上传归一化规则。
 *
 * 纯数据 + 纯函数：不碰 DOM、不发请求、不引 React，所以可以被 node --test 直接读。
 * 传输在 `visual-convert-client.ts`，落地在各自路由。
 */

import { uploadUnavailableReason } from "../workbench-route-formats";

export type VisualEditorId =
  | "image"
  | "video-timeline"
  | "audio"
  | "chart-editor@1"
  | "threed";

export const VISUAL_EDITOR_IDS: readonly VisualEditorId[] = [
  "image",
  "video-timeline",
  "audio",
  "chart-editor@1",
  "threed",
];

/** 有损格式的默认质量。菜单里不许悄悄按 100 出。 */
export const DEFAULT_LOSSY_QUALITY = 90;
export const MIN_LOSSY_QUALITY = 20;
export const MAX_LOSSY_QUALITY = 100;

export interface VisualDownloadFormat {
  /** 编辑栏 action id，全局唯一。 */
  id: string;
  /** 交付后缀，不带点。 */
  format: string;
  /** 用户看得懂的中文条目名，必须带后缀。 */
  label: string;
  /** 有损格式要给质量选择。 */
  lossy: boolean;
  /** local = 浏览器本地出；backend = 走后端转换端点。 */
  via: "local" | "backend";
  /** 一句话说清这条会拿到什么。 */
  hint: string;
}

const IMAGE_DOWNLOADS: readonly VisualDownloadFormat[] = [
  {
    id: "image-download-png",
    format: "png",
    label: "PNG 图片 (.png)",
    lossy: false,
    via: "local",
    hint: "无损，体积最大，适合再编辑。",
  },
  {
    id: "image-download-jpg",
    format: "jpg",
    label: "JPEG 图片 (.jpg)",
    lossy: true,
    via: "local",
    hint: "有损压缩，体积小，适合发给别人。",
  },
  {
    id: "image-download-webp",
    format: "webp",
    label: "WebP 图片 (.webp)",
    lossy: true,
    via: "local",
    hint: "同等清晰度下比 JPEG 更小，适合放网页。",
  },
];

const VIDEO_DOWNLOADS: readonly VisualDownloadFormat[] = [
  {
    id: "video-download-mp4",
    format: "mp4",
    label: "MP4 视频 (.mp4)",
    lossy: true,
    via: "backend",
    hint: "最通用，渲染完成后同时存进我的库。",
  },
  {
    id: "video-download-webm",
    format: "webm",
    label: "WebM 视频 (.webm)",
    lossy: true,
    via: "backend",
    hint: "网页内嵌播放更省流量，渲染完再转一次。",
  },
];

const AUDIO_DOWNLOADS: readonly VisualDownloadFormat[] = [
  {
    id: "audio-download-wav",
    format: "wav",
    label: "WAV 音频 (.wav)",
    lossy: false,
    via: "local",
    hint: "无损，体积最大，适合继续做后期。",
  },
  {
    id: "audio-download-mp3",
    format: "mp3",
    label: "MP3 音频 (.mp3)",
    lossy: true,
    via: "backend",
    hint: "最通用，体积小，什么设备都能放。",
  },
  {
    id: "audio-download-m4a",
    format: "m4a",
    label: "M4A 音频 (.m4a)",
    lossy: true,
    via: "backend",
    hint: "苹果设备原生格式，同体积下比 MP3 清楚一点。",
  },
];

const CHART_DOWNLOADS: readonly VisualDownloadFormat[] = [
  {
    id: "chart-download-png",
    format: "png",
    label: "PNG 图片 (.png)",
    lossy: false,
    via: "local",
    hint: "两倍清晰度位图，贴进文档或幻灯片。",
  },
  {
    id: "chart-download-svg",
    format: "svg",
    label: "SVG 矢量图 (.svg)",
    lossy: false,
    via: "local",
    hint: "放多大都不糊，适合印刷和再排版。",
  },
  {
    id: "chart-download-json",
    format: "json",
    label: "图表数据 (.json)",
    lossy: false,
    via: "local",
    hint: "结构化数据本身，导回来还能继续改。",
  },
];

const THREED_DOWNLOADS: readonly VisualDownloadFormat[] = [
  {
    id: "model3d-download-glb",
    format: "glb",
    label: "GLB 模型 (.glb)",
    lossy: false,
    via: "local",
    hint: "改完的模型本体，带材质与动画。",
  },
  {
    id: "model3d-download-png",
    format: "png",
    label: "PNG 截图 (.png)",
    lossy: false,
    via: "local",
    hint: "当前视角的一张静态图。",
  },
];

const DOWNLOADS: Record<VisualEditorId, readonly VisualDownloadFormat[]> = {
  image: IMAGE_DOWNLOADS,
  "video-timeline": VIDEO_DOWNLOADS,
  audio: AUDIO_DOWNLOADS,
  "chart-editor@1": CHART_DOWNLOADS,
  threed: THREED_DOWNLOADS,
};

/** 某一类编辑器下载菜单该有的全部条目（含第一条 directDownload）。 */
export function visualDownloadFormats(
  editorId: VisualEditorId,
): readonly VisualDownloadFormat[] {
  return DOWNLOADS[editorId];
}

export function visualDownloadFormat(
  editorId: VisualEditorId,
  format: string,
): VisualDownloadFormat | null {
  const wanted = format.trim().toLowerCase();
  return (
    DOWNLOADS[editorId].find((entry) => entry.format === wanted) || null
  );
}

/**
 * 菜单里的格式 → 画布导出器认识的格式。
 *
 * 用户看到的是 JPG，canvas 认的是 `image/jpeg`；这一处换算只允许有一个出处，
 * 否则菜单点 JPG、出来 PNG 这种事迟早发生。
 */
export function imageCanvasFormat(format: string): "png" | "jpeg" | "webp" {
  const wanted = format.trim().toLowerCase();
  if (wanted === "jpg" || wanted === "jpeg") return "jpeg";
  if (wanted === "webp") return "webp";
  return "png";
}

export function clampLossyQuality(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_LOSSY_QUALITY;
  return Math.round(
    Math.max(MIN_LOSSY_QUALITY, Math.min(MAX_LOSSY_QUALITY, numeric)),
  );
}

// ---------------------------------------------------------------------------
// 上传归一化
// ---------------------------------------------------------------------------

export interface VisualImportRule {
  /** 小写后缀，不带点。 */
  from: readonly string[];
  /** 归一化后的后缀。 */
  to: string;
  /** 走哪个后端端点。 */
  via: "convert-image" | "convert-media";
  /** 转换失败时给用户的人话。 */
  failure: string;
}

export interface VisualImportPlan {
  /** accept = 原样收下；convert = 先转一道；reject = 打不开。 */
  action: "accept" | "convert" | "reject";
  extension: string;
  target?: string;
  via?: "convert-image" | "convert-media";
  /** convert 失败或 reject 时给用户看的一句话。 */
  message?: string;
}

const NATIVE: Record<VisualEditorId, readonly string[]> = {
  image: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
  "video-timeline": [
    "mp4",
    "webm",
    "mp3",
    "wav",
    "m4a",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
  ],
  audio: ["mp3", "wav", "m4a", "aac"],
  "chart-editor@1": ["csv", "tsv"],
  threed: ["glb", "gltf"],
};

const RULES: Record<VisualEditorId, readonly VisualImportRule[]> = {
  image: [
    {
      from: ["bmp", "tif", "tiff", "avif", "ico"],
      to: "png",
      via: "convert-image",
      failure: "这张老格式图片转成 PNG 时失败了，可以先用系统看图软件另存为 PNG。",
    },
  ],
  "video-timeline": [
    {
      from: ["mov", "m4v", "mkv", "avi", "wmv", "flv", "3gp", "mts", "ts"],
      to: "mp4",
      via: "convert-media",
      failure: "这个视频转成 MP4 时失败了，可以先用别的软件导出 MP4 再传。",
    },
    {
      from: ["flac", "ogg", "oga", "opus", "wma", "amr", "aiff", "aif"],
      to: "mp3",
      via: "convert-media",
      failure: "这段声音转成 MP3 时失败了，可以先导出 MP3 或 WAV 再传。",
    },
    {
      from: ["bmp", "tif", "tiff"],
      to: "png",
      via: "convert-image",
      failure: "这张图转成 PNG 时失败了，可以先另存为 PNG 再传。",
    },
  ],
  audio: [
    {
      from: ["flac", "ogg", "oga", "opus", "wma", "amr", "aiff", "aif"],
      to: "mp3",
      via: "convert-media",
      failure: "这段声音转成 MP3 时失败了，可以先导出 MP3 或 WAV 再传。",
    },
    {
      from: ["mp4", "mov", "m4v", "webm", "mkv"],
      to: "mp3",
      via: "convert-media",
      failure: "从这个视频里抽声音失败了，可以先单独导出音轨再传。",
    },
  ],
  "chart-editor@1": [],
  threed: [],
};

/**
 * 相机原片：**这台服务器实测转不了**。
 *
 * `verdicts/W10-delivery.md` 的图片能力表原话：`cr2/cr3/nef/arw/dng/raf/orf/rw2`
 * 「PIL 可打开扩展名清单里没有它们」。第一轮我把它们写成了「→ jpg」，那是让用户
 * 传完整张原片（动辄几十 MB）再收到一句失败——所以改成上传之前就说清，并点名格式。
 */
const RAW_PHOTO_EXT: readonly string[] = [
  "cr2",
  "cr3",
  "nef",
  "arw",
  "dng",
  "raf",
  "orf",
  "rw2",
];

function rawPhotoRejection(extension: string): string {
  return (
    `这里还打不开相机原片（RAW）：转换服务不认 .${extension.toUpperCase()} 这类原片格式。` +
    `请在相机、Lightroom 或系统看图软件里导出 JPG 再拖进来。`
  );
}

const REJECTIONS: Record<VisualEditorId, Record<string, string>> = {
  image: Object.fromEntries(
    RAW_PHOTO_EXT.map((extension) => [extension, rawPhotoRejection(extension)]),
  ),
  "video-timeline": {},
  audio: {},
  "chart-editor@1": {
    xlsx: "图表现在只读 CSV / TSV 数据；请在表格软件里另存为 CSV 再传。",
    xls: "图表现在只读 CSV / TSV 数据；请在表格软件里另存为 CSV 再传。",
    json: "这个 JSON 不是图表工程文件；要恢复图表请用「导出图表数据」存下来的那份。",
  },
  threed: {
    obj:
      "3D 编辑器这个入口只直接打开 GLB 和 glTF；OBJ 请从工作台的上传入口拖进来，" +
      "那条路会自动转成 GLB（只搬形状，贴图和材质不带过来）。",
    stl:
      "3D 编辑器这个入口只直接打开 GLB 和 glTF；STL 请从工作台的上传入口拖进来，" +
      "那条路会自动转成 GLB（只搬形状，贴图和材质不带过来）。",
    fbx: "现在只能打开 GLB 和 glTF 模型；FBX 还没有可用的转换通道。",
    dae: "现在只能打开 GLB 和 glTF 模型；DAE 还没有可用的转换通道。",
    ply: "现在只能打开 GLB 和 glTF 模型；PLY 还没有可用的转换通道。",
    "3ds": "现在只能打开 GLB 和 glTF 模型；3DS 还没有可用的转换通道。",
    usdz: "现在只能打开 GLB 和 glTF 模型；USDZ 还没有可用的转换通道。",
    blend: "现在只能打开 GLB 和 glTF 模型；请在 Blender 里导出 GLB 再传。",
  },
};

/**
 * 挑得到、但一个字节都不会上传的后缀。
 *
 * 它们**不在**能转的规则表里（真转不了），却仍然写进文件选择框的 `accept`：
 * 手机相册里最常见的就是 HEIC，选择框里把它灰掉，用户只会以为「这软件坏了」；
 * 挑得到、当场收到一句「怎么自己导出 JPG」，才是能照做的。判成 `reject` 之后
 * 路由不会发任何请求，所以是零上传。
 */
const PICKABLE_BUT_REFUSED: Record<VisualEditorId, readonly string[]> = {
  image: ["heic", "heif", ...RAW_PHOTO_EXT],
  "video-timeline": ["heic", "heif"],
  audio: [],
  "chart-editor@1": [],
  threed: [],
};

const FAMILY_NAME: Record<VisualEditorId, string> = {
  image: "图片",
  "video-timeline": "视频",
  audio: "音频",
  "chart-editor@1": "图表",
  threed: "3D 模型",
};

export function visualImportRules(
  editorId: VisualEditorId,
): readonly VisualImportRule[] {
  return RULES[editorId];
}

/** 从文件名或 URL 取小写后缀，取不到给空串。 */
export function visualFileExtension(name: string): string {
  const path = String(name || "").split(/[?#]/)[0];
  const base = path.split("/").pop() || "";
  if (!base.includes(".")) return "";
  return (base.split(".").pop() || "").trim().toLowerCase();
}

/** 决定一个上传文件该原样收、先转一道、还是明确拒绝。 */
export function visualImportPlan(
  editorId: VisualEditorId,
  fileName: string,
): VisualImportPlan {
  const extension = visualFileExtension(fileName);
  if (!extension) {
    return {
      action: "reject",
      extension,
      message: `这个文件没有后缀，认不出是不是${FAMILY_NAME[editorId]}。`,
    };
  }
  if (NATIVE[editorId].includes(extension)) {
    return { action: "accept", extension };
  }
  const rule = RULES[editorId].find((entry) => entry.from.includes(extension));
  if (rule) {
    return {
      action: "convert",
      extension,
      target: rule.to,
      via: rule.via,
      message: rule.failure,
    };
  }
  // 顺序有讲究：W1 的入口表是 heic/heif/fbx 这几句话的**唯一出处**，编辑器这边照读，
  // 不另抄一份。同一张照片从空框拖进来、和在图片编辑器里选进来，必须是同一句话。
  const ownFamily =
    PICKABLE_BUT_REFUSED[editorId].includes(extension) ||
    Boolean(REJECTIONS[editorId][extension]);
  const shared = ownFamily ? uploadUnavailableReason(extension) : "";
  const rejection = shared || REJECTIONS[editorId][extension];
  return {
    action: "reject",
    extension,
    message:
      rejection ||
      `${FAMILY_NAME[editorId]}编辑器打不开 .${extension} 这种文件。`,
  };
}

/**
 * 上传按钮的 accept：原生格式 + 能自动转的格式 + 挑得到但会当场被拒的那几个。
 *
 * 最后一类不会产生任何上传（`visualImportPlan` 判 `reject`），列出来只是为了让用户
 * 在选择框里挑得到、当场拿到一句能照做的话。
 */
export function visualUploadAccept(editorId: VisualEditorId): string {
  const extensions = [
    ...NATIVE[editorId],
    ...RULES[editorId].flatMap((rule) => rule.from),
    ...PICKABLE_BUT_REFUSED[editorId],
  ];
  return [...new Set(extensions)].map((entry) => `.${entry}`).join(",");
}
