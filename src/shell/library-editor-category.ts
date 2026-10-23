import { ADVANCED_CAPABILITY_MATRIX, type AdvancedFeatureId } from "./artifact-contract";
import type { LibraryItem } from "./library-data";

/**
 * 库的类型名就是**素材类别**（D5，2026-10-23）：「视频」而不是「视频编辑」。
 * 筛选菜单、卡片下方小字、详情角标用的是同一个名字。
 *
 * 设计画布并进图片（10-22 的决定）。这里只改**读与展示**：`design_canvas` 仍是
 * 能力矩阵里的一行、存量行一个字不改写，库层面把它归到 `image_editing`。
 */
export type LibraryCategoryId = Exclude<AdvancedFeatureId, "design_canvas">;

const FOLDED_FEATURES: Partial<Record<AdvancedFeatureId, LibraryCategoryId>> = {
  design_canvas: "image_editing",
};

// [类型名, URL / 筛选 id]
const PRESENTATION: Record<LibraryCategoryId, readonly [string, string]> = {
  video_editing: ["视频", "videos"],
  website_finetuning: ["网站", "website"],
  presentation_editing: ["演示文稿", "presentations"],
  document_editing: ["文档", "documents"],
  spreadsheet_editing: ["表格", "spreadsheets"],
  image_editing: ["图片", "images"],
  pdf_editing: ["PDF", "pdf"],
  audio_editing: ["音频", "audio"],
  video_canvas: ["视频画布", "video-canvas"],
  model_3d: ["3D 模型", "threed"],
  game_editing: ["游戏", "game"],
};

/**
 * 旧的 URL、筛选 id 与菜单文字仍然能用（`?category=design` 落到图片）。
 * 包括 10-23 之前菜单上的编辑器名，免得谁存过一条旧链接就变成空结果。
 */
const LEGACY_ALIASES: Record<string, LibraryCategoryId> = {
  slides: "presentation_editing",
  PPT: "presentation_editing",
  design: "image_editing",
  design_canvas: "image_editing",
  canvas: "image_editing",
  composite_image: "image_editing",
  设计画布: "image_editing",
  画布: "image_editing",
  视频编辑: "video_editing",
  网站编辑: "website_finetuning",
  演示文稿编辑: "presentation_editing",
  文档编辑: "document_editing",
  表格编辑: "spreadsheet_editing",
  图片编辑: "image_editing",
  "PDF 编辑": "pdf_editing",
  音频编辑: "audio_editing",
  视频工作流: "video_canvas",
  "3D": "model_3d",
  游戏创作: "game_editing",
};

export function libraryCategoryForFeature(feature: AdvancedFeatureId): LibraryCategoryId {
  return FOLDED_FEATURES[feature] || (feature as LibraryCategoryId);
}

/** 菜单顺序跟能力矩阵走：视频、网站、演示文稿、文档、表格、图片、PDF、音频、视频画布、3D 模型、游戏。 */
export const LIBRARY_EDITOR_CATEGORIES = ADVANCED_CAPABILITY_MATRIX
  .filter(({ featureId }) => !FOLDED_FEATURES[featureId])
  .map(({ featureId }) => {
    const value = featureId as LibraryCategoryId;
    const [typeLabel, filter] = PRESENTATION[value];
    return { value, label: typeLabel, typeLabel, filter };
  });

const KIND_FEATURE: Partial<Record<LibraryItem["kind"], AdvancedFeatureId>> = {
  website: "website_finetuning", canvas: "design_canvas", ppt: "presentation_editing",
  document: "document_editing", sheet: "spreadsheet_editing", image: "image_editing",
  audio: "audio_editing", video_canvas: "video_canvas", video: "video_editing",
  threed: "model_3d", game: "game_editing",
};
const OTHER_LABELS: Record<string, string> = {
  file: "文件", xhs: "小红书", geo_map: "地图", interactive_doc: "交互文档",
};

/**
 * 这件素材实际绑定的编辑能力（design_canvas 照实返回）。库的类别另由
 * `libraryEditorCategory` 折叠；不依赖源文件可用性、revision 状态或编辑权限。
 */
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
  if (feature) return PRESENTATION[libraryCategoryForFeature(feature)][0];
  // 图表编辑器已删除；存量图表仍按「图表」归类（只读）。
  if ((item.artifact?.artifactType || item.artifactType) === "chart") return "图表";
  return OTHER_LABELS[item.kind] || "文件";
}

export function libraryEditorCategory(item: LibraryItem): string {
  const feature = libraryEditorFeatureId(item);
  return feature ? libraryCategoryForFeature(feature) : libraryEditorLabel(item);
}

export function normalizeLibraryCategory(value: string): string {
  const legacy = LEGACY_ALIASES[value];
  if (legacy) return legacy;
  return LIBRARY_EDITOR_CATEGORIES.find((row) =>
    row.value === value || row.filter === value || row.typeLabel === value)?.value || value;
}

export function libraryCategoryLabel(value: string): string {
  return LIBRARY_EDITOR_CATEGORIES.find((row) => row.value === normalizeLibraryCategory(value))?.typeLabel || value;
}

/**
 * 词典是「中文原文即 key」的平铺表，没有语境。「表格」在演示 / 图片编辑器里是插入
 * 表格的工具（Table），「游戏」在别处是频道名（Games）；改那两条会把别处一起改坏。
 * 所以这两个类型名用带语境的 key 取译文（Spreadsheet / Game）。中文站对这种 key
 * 原样回显（聚合册 zh 是 identity），这时退回中文类型名本身。
 */
const CATEGORY_CONTEXT_KEYS: Record<string, string> = {
  表格: "素材类别：表格",
  游戏: "素材类别：游戏",
};

export function translateLibraryTypeLabel(
  tt: (zh: string) => string,
  label: string,
): string {
  const key = CATEGORY_CONTEXT_KEYS[label];
  if (!key) return tt(label);
  const translated = tt(key);
  return translated && translated !== key ? translated : label;
}
