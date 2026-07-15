"use client";

import type { LibraryItem } from "./library-data";
import { editorCapabilityFor } from "./workbench-routes";

export type AdvancedFeatureId =
  | "video_editing"
  | "audio_editing"
  | "image_editing"
  | "document_editing"
  | "spreadsheet_editing"
  | "presentation_editing"
  | "pdf_editing"
  | "chart_editing"
  | "website_finetuning"
  | "design_canvas"
  | "video_canvas"
  | "model_3d";

export interface AdvancedFeatureDefinition {
  id: AdvancedFeatureId;
  title: string;
  eyebrow: string;
  description: string;
  accent: string;
  examples: string;
}

export const ADVANCED_FEATURES: readonly AdvancedFeatureDefinition[] = [
  {
    id: "video_editing",
    title: "视频编辑",
    eyebrow: "Video editing",
    description: "剪辑、分轨、字幕、转场与画面精修。",
    accent: "#f97316",
    examples: "MP4 · MOV · WebM",
  },
  {
    id: "website_finetuning",
    title: "网站精调",
    eyebrow: "Website finetuning",
    description: "在真实页面预览中修改布局、内容与交互。",
    accent: "#0ea5e9",
    examples: "Website · HTML",
  },
  {
    id: "design_canvas",
    title: "设计画布",
    eyebrow: "Design canvas",
    description: "自由排版图文、品牌素材与社交媒体成品。",
    accent: "#8b5cf6",
    examples: "Canvas · Poster",
  },
  {
    id: "presentation_editing",
    title: "演示文稿编辑",
    eyebrow: "Presentation editing",
    description: "逐页编辑 PPT，保留版式并生成新版本。",
    accent: "#ea580c",
    examples: "PPTX · PPT · ODP",
  },
  {
    id: "document_editing",
    title: "文档编辑",
    eyebrow: "Document editing",
    description: "编辑长文档、合同、报告与富文本内容。",
    accent: "#2563eb",
    examples: "DOCX · DOC · RTF",
  },
  {
    id: "spreadsheet_editing",
    title: "表格编辑",
    eyebrow: "Spreadsheet editing",
    description: "处理工作表、公式、数据与结构化表格。",
    accent: "#16a34a",
    examples: "XLSX · XLS · CSV",
  },
  {
    id: "image_editing",
    title: "图片编辑",
    eyebrow: "Image editing",
    description: "裁剪、抠图、调色、标注与图层合成。",
    accent: "#db2777",
    examples: "PNG · JPG · WebP",
  },
  {
    id: "pdf_editing",
    title: "PDF 编辑",
    eyebrow: "PDF editing",
    description: "批注、页面整理、签署与格式转换。",
    accent: "#dc2626",
    examples: "PDF",
  },
  {
    id: "audio_editing",
    title: "音频编辑",
    eyebrow: "Audio editing",
    description: "裁剪、淡入淡出、音量与多轨混音。",
    accent: "#0891b2",
    examples: "MP3 · WAV · M4A",
  },
  {
    id: "chart_editing",
    title: "图表编辑",
    eyebrow: "Chart editing",
    description: "调整数据、图形编码、标注与导出样式。",
    accent: "#4f46e5",
    examples: "Chart · JSON",
  },
  {
    id: "video_canvas",
    title: "视频画布",
    eyebrow: "Video canvas",
    description: "用无限画布编排镜头、素材与生成流程。",
    accent: "#7c3aed",
    examples: "Storyboard · Canvas",
  },
  {
    id: "model_3d",
    title: "3D 模型",
    eyebrow: "3D workspace",
    description: "查看模型、环境贴图并保存场景版本。",
    accent: "#0d9488",
    examples: "GLB · GLTF · HDR",
  },
] as const;

const FEATURE_BY_ID = new Map(
  ADVANCED_FEATURES.map((feature) => [feature.id, feature]),
);

export function advancedFeatureById(
  value: string | null | undefined,
): AdvancedFeatureDefinition | null {
  return FEATURE_BY_ID.get((value || "") as AdvancedFeatureId) || null;
}

export function advancedFeatureForItem(
  item: LibraryItem,
): AdvancedFeatureDefinition | null {
  const capability = editorCapabilityFor(item);
  if (!capability.available) return null;
  switch (capability.adapter) {
    case "video-timeline":
      return advancedFeatureById("video_editing");
    case "audio":
      return advancedFeatureById("audio_editing");
    case "image":
      return advancedFeatureById("image_editing");
    case "pdf":
      return advancedFeatureById("pdf_editing");
    case "richdoc":
      return advancedFeatureById("document_editing");
    case "grid":
      return advancedFeatureById("spreadsheet_editing");
    case "chart-editor@1":
      return advancedFeatureById("chart_editing");
    case "deck":
      return advancedFeatureById("presentation_editing");
    case "threed":
      return advancedFeatureById("model_3d");
    case "website":
      return advancedFeatureById("website_finetuning");
    case "design-canvas":
      return advancedFeatureById("design_canvas");
    case "video-canvas":
      return advancedFeatureById("video_canvas");
    case "office": {
      const ext = capability.route.type === "office" ? capability.route.ext : "";
      if (/^(?:pptx?|odp|pptm|potx?|potm)$/.test(ext)) {
        return advancedFeatureById("presentation_editing");
      }
      if (/^(?:xlsx?|ods|xlsm|xltx)$/.test(ext)) {
        return advancedFeatureById("spreadsheet_editing");
      }
      return advancedFeatureById("document_editing");
    }
    default:
      return null;
  }
}

export type AdvancedLibraryReferenceSource =
  | "work"
  | "asset"
  | "artifact"
  | "platform"
  | "local";

export interface AdvancedLibraryReference {
  source: AdvancedLibraryReferenceSource;
  id: string;
}

export function advancedLibraryReferenceFor(
  item: LibraryItem,
): AdvancedLibraryReference {
  const table = String(item.meta.library_table || "").toLowerCase();
  const source: AdvancedLibraryReferenceSource =
    table === "work" || table === "asset"
      ? table
      : item.meta.asset_id || item.meta.platform_asset_id
        ? "platform"
        : item.source === "artifact" || item.meta.artifact_id
          ? "artifact"
          : "local";
  const id =
    source === "platform"
      ? String(item.meta.asset_id || item.meta.platform_asset_id || item.id)
      : source === "artifact"
        ? String(item.meta.artifact_id || item.id)
        : String(item.id || item.key);
  return { source, id };
}

export function encodeAdvancedLibraryReference(
  reference: AdvancedLibraryReference,
): string {
  return `${reference.source}:${encodeURIComponent(reference.id)}`;
}

export function parseAdvancedLibraryReference(
  value: string | null | undefined,
): AdvancedLibraryReference | null {
  const raw = (value || "").trim();
  const separator = raw.indexOf(":");
  if (separator <= 0) return null;
  const source = raw.slice(0, separator) as AdvancedLibraryReferenceSource;
  if (
    source !== "work" &&
    source !== "asset" &&
    source !== "artifact" &&
    source !== "platform" &&
    source !== "local"
  ) {
    return null;
  }
  try {
    const id = decodeURIComponent(raw.slice(separator + 1)).trim();
    return id ? { source, id } : null;
  } catch {
    return null;
  }
}

const STORAGE_PREFIX = "oceanleo:advanced-entry:v1:";

export function rememberAdvancedLibraryItem(
  reference: string,
  item: LibraryItem,
): void {
  if (typeof window === "undefined" || !reference) return;
  try {
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${reference}`,
      JSON.stringify(item),
    );
  } catch {
    // Deep links still resolve database-backed references server-side.
  }
}

export function recalledAdvancedLibraryItem(
  reference: string,
): LibraryItem | null {
  if (typeof window === "undefined" || !reference) return null;
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(`${STORAGE_PREFIX}${reference}`) || "null",
    ) as LibraryItem | null;
    return value && typeof value === "object" && value.id ? value : null;
  } catch {
    return null;
  }
}

export function advancedFeatureHref(
  feature: AdvancedFeatureDefinition | AdvancedFeatureId,
  options: { item?: LibraryItem; sessionId?: string } = {},
): string {
  const id = typeof feature === "string" ? feature : feature.id;
  const params = new URLSearchParams();
  if (options.item) {
    const reference = encodeAdvancedLibraryReference(
      advancedLibraryReferenceFor(options.item),
    );
    rememberAdvancedLibraryItem(reference, options.item);
    params.set("asset", reference);
  }
  if (options.sessionId) params.set("session", options.sessionId);
  const query = params.toString();
  return `/advanced/${id}${query ? `?${query}` : ""}`;
}

export function advancedFeatureHrefForItem(item: LibraryItem): string | null {
  const feature = advancedFeatureForItem(item);
  return feature ? advancedFeatureHref(feature, { item }) : null;
}
