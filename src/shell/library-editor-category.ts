import { ADVANCED_CAPABILITY_MATRIX, type AdvancedFeatureId } from "./artifact-contract";
import type { LibraryItem } from "./library-data";

/**
 * 网站和游戏是作品，分类 ID 保留以兼容存量筛选链接；这份列表不是编辑器清单。
 * 库的类型名就是**素材类别**（D5，2026-10-23）：「视频」而不是「视频编辑」。
 * 筛选菜单、卡片下方小字、详情角标用的是同一个名字。
 *
 * 设计画布并进图片（10-22 的决定）。这里只改**读与展示**：`design_canvas` 仍是
 * 能力矩阵里的一行、存量行一个字不改写，库层面把它归到 `image_editing`。
 */
export type LibraryCategoryId = Exclude<AdvancedFeatureId, "design_canvas" | "pdf_editing"> | "audio" | "threed" | "links" | "files";

const FOLDED_FEATURES: Partial<Record<AdvancedFeatureId, LibraryCategoryId>> = {
  design_canvas: "image_editing",
  pdf_editing: "document_editing",
};

// [类型名, URL / 筛选 id]
const PRESENTATION: Record<LibraryCategoryId, readonly [string, string]> = {
  video_editing: ["视频", "videos"],
  website_finetuning: ["网站与应用", "website"],
  presentation_editing: ["演示文稿", "presentations"],
  document_editing: ["文档", "documents"],
  spreadsheet_editing: ["电子表格", "spreadsheets"],
  image_editing: ["图像", "images"],
  links: ["链接", "links"],
  files: ["文件", "files"],
  audio: ["音频", "audio"],
  threed: ["3D 模型", "threed"],
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
  "PDF 编辑": "document_editing",
  pdf: "document_editing",
  pdf_editing: "document_editing",
  "3D": "threed",
  游戏创作: "game_editing",
};

// 字面量而不是 LIBRARY_FOLDER_CATEGORY_ID：那个常量声明在下面，模块求值到这里时还在 TDZ。
const FOLDER_ALIASES: Record<string, "folders"> = {
  folder: "folders",
  文件夹: "folders",
  文件包: "folders",
};

export function libraryCategoryForFeature(feature: AdvancedFeatureId): LibraryCategoryId {
  return FOLDED_FEATURES[feature] || (feature as LibraryCategoryId);
}

/** Folder navigation remains separate from the generic files category. */
export const LIBRARY_FOLDER_CATEGORY_ID = "folders" as const;
export type LibraryFolderCategoryId = typeof LIBRARY_FOLDER_CATEGORY_ID;

export const LIBRARY_FOLDER_CATEGORY = {
  value: LIBRARY_FOLDER_CATEGORY_ID,
  label: "文件",
  typeLabel: "文件",
  filter: LIBRARY_FOLDER_CATEGORY_ID,
} as const;

export function isLibraryFolderCategory(value: string | null | undefined): boolean {
  return normalizeLibraryCategory(String(value || "")) === LIBRARY_FOLDER_CATEGORY_ID;
}

/** Professional material names; Documents includes PDF, independently of editor routing. */
export const LIBRARY_EDITOR_CATEGORIES: readonly {
  value: LibraryCategoryId | LibraryFolderCategoryId;
  label: string;
  typeLabel: string;
  filter: string;
}[] = [
  ...(["presentation_editing", "image_editing", "document_editing", "spreadsheet_editing",
    "website_finetuning", "game_editing", "video_editing", "threed", "audio"] as const).map((value) => {
      const [typeLabel, filter] = PRESENTATION[value];
      return { value, label: typeLabel, typeLabel, filter };
    }),
  { value: "files", label: "文件", typeLabel: "文件", filter: "files" },
  { value: "links", label: "链接", typeLabel: "链接", filter: "links" },
];

const KIND_FEATURE: Partial<Record<LibraryItem["kind"], AdvancedFeatureId>> = {
  website: "website_finetuning", canvas: "design_canvas", ppt: "presentation_editing",
  document: "document_editing", sheet: "spreadsheet_editing", image: "image_editing",
  video: "video_editing", game: "game_editing",
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
  if (isLibraryLink(item)) return "链接";
  if (item.kind === "audio") return "音频";
  if (item.kind === "threed") return "3D 模型";
  const feature = libraryEditorFeatureId(item);
  if (feature) return PRESENTATION[libraryCategoryForFeature(feature)][0];
  return "文件";
}

export function libraryEditorCategory(item: LibraryItem): string {
  if (isLibraryLink(item)) return "links";
  if (item.kind === "audio") return "audio";
  if (item.kind === "threed") return "threed";
  const feature = libraryEditorFeatureId(item);
  return feature ? libraryCategoryForFeature(feature) : "files";
}

export function normalizeLibraryCategory(value: string): string {
  const legacy = LEGACY_ALIASES[value] || FOLDER_ALIASES[value];
  if (legacy) return legacy;
  return LIBRARY_EDITOR_CATEGORIES.find((row) =>
    row.value === value || row.filter === value || row.typeLabel === value)?.value || value;
}

export function libraryCategoryLabel(value: string): string {
  return LIBRARY_EDITOR_CATEGORIES.find((row) => row.value === normalizeLibraryCategory(value))?.typeLabel || value;
}

/** Context keys keep material type names independent of in-document tools. */
const CATEGORY_CONTEXT_KEYS: Record<string, string> = {
  电子表格: "素材类别：电子表格",
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

function isLibraryLink(item: LibraryItem): boolean {
  return Boolean(item.meta?.link_work);
}

/** Source format remains independent from the merged document category. */
export function libraryDocumentFormat(item: LibraryItem): string {
  const raw = item.artifact?.sourceFormat || item.meta?.source_format || item.meta?.format || "";
  return String(raw).toLowerCase().replace(/^\./, "");
}

export function libraryMatchesDocumentFormat(item: LibraryItem, format: string): boolean {
  return !format || libraryDocumentFormat(item) === format;
}
