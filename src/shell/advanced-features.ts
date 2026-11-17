"use client";

import {
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";
import {
  ADVANCED_CAPABILITY_MATRIX,
  advancedCapabilityForAdapter,
  advancedCapabilityForArtifactFields,
  type AdvancedCapabilityContractEntry,
  type AdvancedFeatureId as ContractAdvancedFeatureId,
} from "./artifact-contract";
import { editorCapabilityFor } from "./workbench-routes";

export type AdvancedFeatureId = ContractAdvancedFeatureId;

export interface AdvancedFeatureDefinition {
  id: AdvancedFeatureId;
  /** Canonical shared-plane row; stable and identical for every host site. */
  capability: AdvancedCapabilityContractEntry;
  title: string;
  eyebrow: string;
  description: string;
  accent: string;
  examples: string;
}

/** Advanced tools share one calm product identity; content type is not a theme. */
export const ADVANCED_PRODUCT_ACCENT = "#6d5dfc";

type AdvancedFeaturePresentation = Omit<
  AdvancedFeatureDefinition,
  "id" | "capability"
>;

const ADVANCED_FEATURE_PRESENTATION: Readonly<
  Record<AdvancedFeatureId, AdvancedFeaturePresentation>
> = {
  video_editing: {
    title: "视频编辑",
    eyebrow: "Video editing",
    description: "剪辑、分轨、字幕、转场与画面精修。",
    accent: ADVANCED_PRODUCT_ACCENT,
    examples: "MP4 · MOV · WebM",
  },
  website_finetuning: {
    title: "网站",
    eyebrow: "Website work",
    description: "通过 agent 修改作品。",
    accent: ADVANCED_PRODUCT_ACCENT,
    examples: "Website · HTML",
  },
  design_canvas: {
    title: "设计画布",
    eyebrow: "Design canvas",
    description: "自由排版图文、品牌素材与社交媒体成品。",
    accent: ADVANCED_PRODUCT_ACCENT,
    examples: "Canvas · Poster",
  },
  presentation_editing: {
    title: "演示文稿编辑",
    eyebrow: "Presentation editing",
    description: "逐页编辑 PPT，保留版式并生成新版本。",
    accent: ADVANCED_PRODUCT_ACCENT,
    examples: "PPTX · PPT · ODP",
  },
  document_editing: {
    title: "文档编辑",
    eyebrow: "Document editing",
    description: "编辑长文档、合同、报告与富文本内容。",
    accent: ADVANCED_PRODUCT_ACCENT,
    examples: "DOCX · DOC · RTF",
  },
  spreadsheet_editing: {
    title: "Sheet 编辑",
    eyebrow: "Sheet editing",
    description: "处理工作表、公式、数据与结构化表格。",
    accent: ADVANCED_PRODUCT_ACCENT,
    examples: "XLSX · XLS · CSV",
  },
  image_editing: {
    title: "图片编辑",
    eyebrow: "Image editing",
    description: "裁剪、抠图、调色、标注与图层合成。",
    accent: ADVANCED_PRODUCT_ACCENT,
    examples: "PNG · JPG · WebP",
  },
  pdf_editing: {
    title: "PDF 编辑",
    eyebrow: "PDF editing",
    description: "批注、页面整理、签署与格式转换。",
    accent: ADVANCED_PRODUCT_ACCENT,
    examples: "PDF",
  },
  // Stored capability identity stays; games open the common works workbench.
  game_editing: {
    title: "游戏",
    eyebrow: "Game work",
    description: "通过 agent 修改作品。",
    accent: ADVANCED_PRODUCT_ACCENT,
    examples: "Playable · Canvas",
  },
};

const ALL_FEATURES: readonly AdvancedFeatureDefinition[] =
  Object.freeze(
    ADVANCED_CAPABILITY_MATRIX.map((capability) =>
      Object.freeze({
        id: capability.featureId,
        capability,
        ...ADVANCED_FEATURE_PRESENTATION[capability.featureId],
      }),
    ),
  );

/** Six full editors; stored work/design feature IDs remain readable below. */
export const ADVANCED_FEATURES = Object.freeze(ALL_FEATURES.filter(
  ({ capability, id }) => capability.adapter !== "work" && id !== "design_canvas",
));

const FEATURE_BY_ID = new Map(
  ALL_FEATURES.map((feature) => [feature.id, feature]),
);

export function advancedFeatureById(
  value: string | null | undefined,
): AdvancedFeatureDefinition | null {
  return FEATURE_BY_ID.get((value || "") as AdvancedFeatureId) || null;
}

function advancedFeatureForAdapterId(
  adapter: string,
): AdvancedFeatureDefinition | null {
  // Keep the adapter switch explicit so frozen consumer contracts can assert
  // the route mapping without importing the matrix runtime.
  switch (adapter) {
    case "video-timeline":
      return advancedFeatureById("video_editing");
    case "image":
      return advancedFeatureById("image_editing");
    case "pdf":
      return advancedFeatureById("pdf_editing");
    case "richdoc":
      return advancedFeatureById("document_editing");
    case "grid":
      return advancedFeatureById("spreadsheet_editing");
    case "deck":
      return advancedFeatureById("presentation_editing");
    case "design-canvas":
      return advancedFeatureById("design_canvas");
    default:
      return null;
  }
}

export function advancedFeatureForItem(
  item: LibraryItem,
): AdvancedFeatureDefinition | null {
  const capability = editorCapabilityFor(item);
  if (!capability.available) return null;
  if (capability.route.type === "work") {
    const type = item.artifact?.artifactType || item.artifactType || item.kind;
    const game = type === "game" ||
      [item.meta.advanced_editor_route, item.meta.editor, item.meta.feature_id, item.meta.capability_id]
        .some((value) => value === "game" || value === "game_editing");
    return advancedFeatureById(game ? "game_editing" : "website_finetuning");
  }
  if (isDurableLibraryItem(item)) {
    const contract = advancedCapabilityForArtifactFields({
      artifactType: item.artifact.artifactType,
      sourceFormat: item.artifact.sourceFormat,
      editorCapability: item.artifact.editorCapability,
    });
    if (contract) return advancedFeatureById(contract.featureId);
  }
  const fromAdapter = advancedFeatureForAdapterId(capability.adapter);
  if (fromAdapter) return fromAdapter;
  const contract = advancedCapabilityForAdapter(capability.adapter);
  return contract ? advancedFeatureById(contract.featureId) : null;
}

export interface AdvancedEditorSource {
  url: string;
  format: string;
  structured: boolean;
}

/**
 * Resolve the editor input independently from the card poster. Durable items
 * always use their revision-pinned source rendition.
 */
export function advancedEditorSourceFor(
  item: LibraryItem,
): AdvancedEditorSource | null {
  if (isDurableLibraryItem(item)) {
    const source = item.artifact.renditions.source;
    if (
      item.artifact.editability === "view_only" ||
      !source ||
      source.revisionId !== item.revisionId ||
      !source.url ||
      !source.digest
    ) {
      return null;
    }
    const format = item.artifact.sourceFormat.trim().toLowerCase();
    const contract = advancedCapabilityForArtifactFields({
      artifactType: item.artifact.artifactType,
      sourceFormat: format,
      editorCapability: item.artifact.editorCapability,
    });
    return {
      url: source.url,
      format,
      structured:
        Boolean(contract && contract.requirement.kind !== "none") ||
        item.artifactType === "composite_image" ||
        /(?:fabric|scene|project).*(?:json)|(?:json).*(?:fabric|scene|project)/.test(
          format,
        ),
    };
  }
  const format = String(
    item.meta.source_format || item.meta.format || "",
  )
    .trim()
    .toLowerCase();
  const url = String(
    item.meta.editor_source_url ||
      item.meta.source_url ||
      item.url ||
      item.previewUrl ||
      "",
  ).trim();
  return url
    ? {
        url,
        format,
        structured: /(?:fabric|scene|project).*(?:json)/.test(format),
      }
    : null;
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

/** Typed material share links open the common Library. */
export function libraryItemHref(item: LibraryItem): string {
  const params = new URLSearchParams({ item: String(item.artifactId || item.meta.artifact_id || item.id) });
  if (item.revisionId) params.set("revisionId", item.revisionId);
  return `/library?${params}`;
}

/** @deprecated Compatibility for old consumers; standalone feature pages are removed. */
export function advancedFeatureHref(
  _feature: AdvancedFeatureDefinition | AdvancedFeatureId,
  options: { item?: LibraryItem; sessionId?: string } = {},
): string {
  return options.item ? libraryItemHref(options.item) : "/library";
}

/** @deprecated Use libraryItemHref for typed materials. */
export function advancedFeatureHrefForItem(item: LibraryItem): string | null {
  return advancedFeatureForItem(item) ? libraryItemHref(item) : null;
}

/**
 * Public material shelves keep only items that map to one of the nine full
 * editors or editable works with a trusted typed capability. Opening a work's
 * preview does not make it an editable material for another editor's shelf.
 */
export function isAdvancedEditableShelfItem(item: LibraryItem): boolean {
  if (isDurableLibraryItem(item) && item.artifact.editability === "view_only") return false;
  return advancedFeatureForItem(item) !== null;
}
