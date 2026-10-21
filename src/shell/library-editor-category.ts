import { ADVANCED_CAPABILITY_MATRIX, type AdvancedFeatureId } from "./artifact-contract";
import type { LibraryItem } from "./library-data";

// Presentation and legacy URL aliases, keyed by the canonical capability plane.
const PRESENTATION: Record<AdvancedFeatureId, [string, string, string]> = {
  website_finetuning: ["网站", "网站编辑", "website"],
  design_canvas: ["设计画布", "设计画布", "design"],
  presentation_editing: ["演示文稿", "演示文稿编辑", "presentations"],
  document_editing: ["文档", "文档编辑", "documents"],
  spreadsheet_editing: ["表格", "表格编辑", "spreadsheets"],
  image_editing: ["图片", "图片编辑", "images"],
  pdf_editing: ["PDF", "PDF 编辑", "pdf"],
  audio_editing: ["音频", "音频编辑", "audio"],
  chart_editing: ["图表", "图表编辑", "charts"],
  video_canvas: ["视频画布", "视频画布", "video-canvas"],
  model_3d: ["3D", "3D 模型", "threed"],
  game_editing: ["游戏", "游戏创作", "game"],
  video_editing: ["视频", "视频编辑", "videos"],
};

export const LIBRARY_EDITOR_CATEGORIES = ADVANCED_CAPABILITY_MATRIX.map(({ featureId }) => ({
  value: featureId, label: PRESENTATION[featureId][1],
  typeLabel: PRESENTATION[featureId][0], filter: PRESENTATION[featureId][2],
}));

const KIND_FEATURE: Partial<Record<LibraryItem["kind"], AdvancedFeatureId>> = {
  website: "website_finetuning", canvas: "design_canvas", ppt: "presentation_editing",
  document: "document_editing", sheet: "spreadsheet_editing", image: "image_editing",
  audio: "audio_editing", video_canvas: "video_canvas", video: "video_editing",
  threed: "model_3d", game: "game_editing",
};
const OTHER_LABELS: Record<string, string> = {
  file: "文件", xhs: "小红书", geo_map: "地图", interactive_doc: "交互文档",
};

/** Shelf identity does not depend on source availability, revision state or edit permission. */
export function libraryEditorFeatureId(item: LibraryItem): AdvancedFeatureId | null {
  const type = item.artifact?.artifactType || item.artifactType;
  if (type) {
    const candidates = ADVANCED_CAPABILITY_MATRIX.filter((row) =>
      row.artifactBindings.some((binding) => binding.artifactType === type));
    const capability = item.artifact?.editorCapability;
    const exact = candidates.find((row) => row.artifactBindings.some((binding) =>
      binding.artifactType === type && binding.editorCapabilities.some((value) => value === capability)));
    if (exact) return exact.featureId;
    const primary = candidates.find((row) => row.artifactType === type);
    return primary?.featureId || candidates[0]?.featureId || null;
  }
  return KIND_FEATURE[item.kind] || null;
}

export function libraryEditorLabel(item: LibraryItem): string {
  const feature = libraryEditorFeatureId(item);
  return feature ? PRESENTATION[feature][0] : OTHER_LABELS[item.kind] || "文件";
}

export function libraryEditorCategory(item: LibraryItem): string {
  return libraryEditorFeatureId(item) || libraryEditorLabel(item);
}

export function normalizeLibraryCategory(value: string): string {
  if (value === "slides" || value === "PPT") return "presentation_editing";
  return LIBRARY_EDITOR_CATEGORIES.find((row) =>
    row.value === value || row.filter === value || row.typeLabel === value)?.value || value;
}

export function libraryCategoryLabel(value: string): string {
  return LIBRARY_EDITOR_CATEGORIES.find((row) => row.value === normalizeLibraryCategory(value))?.typeLabel || value;
}
