import {
  ARTIFACT_TYPES,
  normalizeArtifactProjection,
  type ArtifactContextRef,
  type ArtifactType,
} from "./artifact-contract";
import {
  listPrimaryArtifacts,
  searchArtifactLibrary,
} from "./artifact-client";
import {
  artifactProjectionToLibraryItem,
  isDurableLibraryItem,
  libraryContentDescriptor,
  type EditorCapabilityName,
  type EditorManifestV1,
  type LibraryItem,
  type LibraryKind,
} from "./library-data";
import {
  workspaceEntryFromLibraryItem,
  type WorkspaceLibraryEntry,
} from "./workspace-library-model";

const GATEWAY =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL)) ||
  "https://api.oceanleo.com";

export type MaterialLibraryLevel = "primary" | "more";

/** A site-curated finished example shown alongside the central asset catalog. */
export interface MaterialItem {
  id: string;
  title: string;
  thumb: string;
  preview?: string;
  categories?: string[];
  desc?: string;
  tags?: string[];
  openUrl?: string;
  openLabel?: string;
  kind?: "image" | "doc" | "slides" | "web" | "template";
  /** New callers can provide a normalized item and bypass all inference. */
  libraryItem?: LibraryItem;
}

export interface PlatformAsset {
  id: string;
  type: string;
  title: string;
  thumb_url?: string;
  preview_url?: string;
  full_url?: string;
  category?: string;
  tags?: string[];
  scene_tags?: string[];
  format?: string;
  content_type?: string;
  representation?: string;
  subtype?: string;
  source?: string;
  source_url?: string;
  series_id?: string;
  oss_key?: string;
  editor?: EditorManifestV1 | null;
  capabilities?: EditorCapabilityName[];
  unavailable_reason?: string;
  artifact_id?: string;
  revision_id?: string;
  artifact_type?: ArtifactType;
  artifact?: unknown;
}

const TYPE_TO_KIND: Record<string, LibraryKind> = {
  image: "image",
  vector: "image",
  sticker: "image",
  ppt: "ppt",
  pdf: "document",
  document: "document",
  sheet: "sheet",
  chart: "image",
  website: "website",
  video_workflow: "video_canvas",
  video: "video",
  audio: "audio",
  music: "audio",
  "3d": "threed",
  font: "document",
};

const KIND_CATEGORY: Partial<Record<LibraryKind, string>> = {
  website: "网站与工作流",
  canvas: "画布",
  ppt: "PPT",
  sheet: "表格",
  document: "文档",
  image: "图片",
  video: "视频",
  video_canvas: "视频工作流",
  audio: "音频",
  threed: "3D",
  xhs: "小红书",
  file: "文件",
};

export const MATERIAL_TAXONOMY_LABEL: Record<ArtifactType, string> = {
  single_file_image: "单文件图片",
  composite_image: "复合图片",
  vector_image: "矢量图片",
  chart: "图表",
  document: "文档",
  grid: "表格",
  deck: "幻灯片",
  pdf: "PDF",
  website: "网站",
  video: "视频",
  audio: "音频",
  model_3d: "3D",
  workflow: "工作流",
};

function designTemplateDocumentUrl(value = ""): string {
  try {
    const actionUrl = new URL(value);
    if (actionUrl.hostname !== "design.oceanleo.com") return "";
    const documentUrl = new URL(actionUrl.searchParams.get("tplDoc") || "");
    return documentUrl.hostname === "asset.oceanleo.com" &&
      /^\/design-templates\/doc\/[a-z0-9-]+\.json$/i.test(documentUrl.pathname)
      ? documentUrl.toString()
      : "";
  } catch {
    return "";
  }
}

function materialSurfaceEntry(
  item: LibraryItem,
  extra: Partial<WorkspaceLibraryEntry> = {},
): WorkspaceLibraryEntry {
  return workspaceEntryFromLibraryItem(
    {
      ...item,
      meta: {
        ...item.meta,
        workspace_library_surface: "materials",
      },
    },
    extra,
  );
}

export function materialToEntry(
  material: MaterialItem,
): WorkspaceLibraryEntry {
  const templateDocUrl = designTemplateDocumentUrl(material.openUrl);
  if (material.libraryItem) {
    const baseItem =
      material.libraryItem.kind === "website"
        ? { ...material.libraryItem, previewUrl: undefined }
        : material.libraryItem;
    const normalizedItem = templateDocUrl
      ? {
          ...baseItem,
          siteId: "design",
          meta: {
            ...baseItem.meta,
            template_doc_url: templateDocUrl,
          },
        }
      : baseItem;
    return materialSurfaceEntry(normalizedItem, {
      id: `site:${material.id}`,
      title: material.title || material.libraryItem.title,
      description: material.desc,
      category:
        material.categories?.[0] ||
        KIND_CATEGORY[material.libraryItem.kind] ||
        "本站精选",
      keywords: material.tags,
      thumbUrl:
        material.thumb ||
        normalizedItem.thumbUrl ||
        material.libraryItem.previewUrl,
      externalUrl: normalizedItem.url || material.libraryItem.previewUrl,
      linkUrl:
        (!templateDocUrl && material.openUrl) ||
        (typeof normalizedItem.meta.asset_page_url === "string"
          ? normalizedItem.meta.asset_page_url
          : "") ||
        normalizedItem.url ||
        material.libraryItem.previewUrl,
    });
  }

  const kind: LibraryKind =
    material.kind === "web"
      ? "website"
      : material.kind === "doc"
        ? "document"
        : material.kind === "slides"
          ? "ppt"
          : "image";
  const preview = material.preview || material.thumb;
  const richFile =
    (kind === "ppt" && /\.pptx?(?:[?#]|$)/i.test(material.openUrl || "")) ||
    (kind === "document" &&
      /\.(docx?|pdf|md|txt)(?:[?#]|$)/i.test(material.openUrl || ""));
  const viewerKind: LibraryKind = richFile ? kind : preview ? "image" : kind;
  const viewerUrl = richFile ? material.openUrl : preview || material.openUrl;
  const item: LibraryItem = {
    key: `site:${material.id}`,
    source: "artifact",
    id: `site:${material.id}`,
    kind: viewerKind,
    title: material.title,
    siteId: templateDocUrl ? "design" : "",
    url: viewerKind === "ppt" ? material.openUrl : viewerUrl,
    previewUrl: viewerKind === "website" ? undefined : preview,
    thumbUrl: material.thumb,
    favorite: false,
    meta: {
      categories: material.categories || [],
      open_label: material.openLabel || "",
      open_url: material.openUrl || "",
      template_doc_url: templateDocUrl,
    },
  };
  return materialSurfaceEntry(item, {
    description: material.desc,
    category:
      material.categories?.[0] || KIND_CATEGORY[viewerKind] || "本站精选",
    keywords: material.tags,
    externalUrl: viewerUrl,
    linkUrl: templateDocUrl ? undefined : material.openUrl || preview,
  });
}

export function platformToEntry(
  asset: PlatformAsset,
): WorkspaceLibraryEntry {
  const projection = normalizeArtifactProjection(asset.artifact ?? asset);
  if (projection) {
    return artifactEntry(artifactProjectionToLibraryItem(projection));
  }
  const designTemplateDoc =
    asset.series_id === "design-materials" &&
    /^https:\/\/asset\.oceanleo\.com\/design-templates\/doc\/[a-z0-9-]+\.json$/i.test(
      asset.source_url || "",
    )
      ? asset.source_url || ""
      : "";
  const kind: LibraryKind = TYPE_TO_KIND[asset.type] || "file";
  const chartViewerUrl =
    asset.type === "chart"
      ? asset.preview_url || asset.thumb_url || asset.full_url || ""
      : "";
  const rawId = asset.id.replace(/^library:/, "");
  const starterMatch =
    kind === "website"
      ? /^assets\/workspace-starters\/website\/([a-z0-9-]+)\.html$/i.exec(
          asset.oss_key || "",
        )
      : null;
  const starterId = starterMatch?.[1] || "";
  const htmlViewer = starterId
    ? `${GATEWAY}/v1/assets/library/starters/${encodeURIComponent(starterId)}/view`
    : kind === "website" && rawId
      ? `${GATEWAY}/v1/assets/library/${encodeURIComponent(rawId)}/view`
      : "";
  const item: LibraryItem = {
    key: `asset:${asset.id}`,
    source: "artifact",
    id: `asset:${asset.id}`,
    kind,
    title: asset.title || "未命名素材",
    siteId: designTemplateDoc ? "design" : "asset",
    url:
      chartViewerUrl ||
      htmlViewer ||
      asset.full_url ||
      asset.preview_url ||
      "",
    previewUrl:
      kind === "website"
        ? undefined
        : asset.preview_url || asset.full_url || "",
    thumbUrl: asset.thumb_url || asset.preview_url || "",
    favorite: false,
    meta: {
      asset_id: asset.id,
      asset_type: asset.type,
      category: asset.category || "",
      tags: asset.tags || [],
      scene_tags: asset.scene_tags || [],
      format: asset.format || "",
      oss_key: asset.oss_key || "",
      content_type: asset.content_type || asset.type,
      representation: asset.representation || "",
      subtype: asset.subtype || "",
      editor: asset.editor || undefined,
      capabilities: asset.capabilities || [],
      unavailable_reason: asset.unavailable_reason || "",
      source_asset_url: asset.full_url || "",
      source_url: asset.source_url || "",
      template_doc_url: designTemplateDoc,
      starter_id: starterId,
      asset_page_url: `https://asset.oceanleo.com/materials?asset=${encodeURIComponent(rawId)}`,
    },
  };
  item.descriptor = libraryContentDescriptor({
    kind,
    meta: item.meta,
    descriptor: {
      content_type: asset.content_type || asset.type,
      representation: asset.representation || "",
      subtype: asset.subtype || "",
      editor: asset.editor || null,
      capabilities: asset.capabilities || [],
      unavailable_reason: asset.unavailable_reason || "",
    },
  });
  return materialSurfaceEntry(item, {
    category: KIND_CATEGORY[kind] || asset.category || "精选素材",
    description: asset.category
      ? `OceanLeo 精选 · ${asset.category}`
      : "OceanLeo 精选素材",
    keywords: [
      asset.type,
      asset.category || "",
      ...(asset.tags || []),
      ...(asset.scene_tags || []),
    ],
    linkUrl: `https://asset.oceanleo.com/materials?asset=${encodeURIComponent(rawId)}`,
  });
}

export function mergeMaterialEntries(
  groups: readonly (readonly WorkspaceLibraryEntry[])[],
): WorkspaceLibraryEntry[] {
  const seen = new Set<string>();
  const out: WorkspaceLibraryEntry[] = [];
  for (const group of groups) {
    for (const entry of group) {
      const key =
        entry.libraryItem && isDurableLibraryItem(entry.libraryItem)
          ? `${entry.libraryItem.artifactId}:${entry.libraryItem.revisionId}`
          : entry.libraryItem?.key || entry.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

export function normalizedMaterialTaxonomy(
  value: string,
): ArtifactType | "" {
  if ((ARTIFACT_TYPES as readonly string[]).includes(value)) {
    return value as ArtifactType;
  }
  return (
    ({
      image: "single_file_image",
      vector: "vector_image",
      chart: "chart",
      document: "document",
      sheet: "grid",
      ppt: "deck",
      pdf: "pdf",
      website: "website",
      video: "video",
      audio: "audio",
      "3d": "model_3d",
      video_workflow: "workflow",
    } as Record<string, ArtifactType>)[value] || ""
  );
}

export function artifactEntry(
  item: LibraryItem,
  trustedSearchMatch = false,
): WorkspaceLibraryEntry {
  return materialSurfaceEntry(item, {
    category: item.artifactType
      ? MATERIAL_TAXONOMY_LABEL[item.artifactType]
      : KIND_CATEGORY[item.kind] || "素材",
    // Machine role names (acceptance_fixture, template, …) are keywords for
    // search only and never shown as human-facing description copy.
    description: item.artifactType
      ? MATERIAL_TAXONOMY_LABEL[item.artifactType]
      : "",
    keywords: [
      item.artifactType || "",
      ...(item.artifact?.roles || []),
      item.artifact?.sourceFormat || "",
    ].filter(Boolean),
    trustedSearchMatch,
  });
}

/**
 * Public "更多素材" shelves only surface editable advanced-feature templates.
 * Owned/promoted catalog rows use the `template` role; view-only reference
 * rehosts are excluded so every visible card can open an advanced editor.
 */
export const MATERIAL_LIBRARY_MORE_ROLE = "template";

/** One page of the unfiltered more shelf mixes these editable types. */
const BALANCED_MORE_TYPES: readonly ArtifactType[] = [
  "website",
  "workflow",
  "deck",
  "document",
  "grid",
  "single_file_image",
  "vector_image",
  "pdf",
  "video",
  "audio",
  "chart",
  "model_3d",
];

function interleaveLibraryItems(
  groups: readonly (readonly LibraryItem[])[],
): LibraryItem[] {
  const out: LibraryItem[] = [];
  const seen = new Set<string>();
  let index = 0;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const group of groups) {
      const item = group[index];
      if (!item) continue;
      progressed = true;
      const key =
        item.artifactId && item.revisionId
          ? `${item.artifactId}:${item.revisionId}`
          : item.key || item.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    index += 1;
  }
  return out;
}

export async function queryMaterialLibrary(input: {
  level: MaterialLibraryLevel;
  context: ArtifactContextRef;
  query: string;
  taxonomy: ArtifactType | "";
  cursor?: string | null;
  signal?: AbortSignal;
}) {
  if (input.level === "primary") {
    return listPrimaryArtifacts(input.context, {
      artifactType: input.taxonomy,
      limit: 60,
      signal: input.signal,
    });
  }
  // Unfiltered more shelf: round-robin the 12 advanced-capable types so a
  // single recent promote wave (e.g. model_3d) cannot monopolize page one.
  if (!input.taxonomy && !input.query.trim() && !input.cursor) {
    const perType = 5;
    const pages = await Promise.all(
      BALANCED_MORE_TYPES.map((artifactType) =>
        searchArtifactLibrary({
          query: "",
          artifactType,
          role: MATERIAL_LIBRARY_MORE_ROLE,
          limit: perType,
          signal: input.signal,
        }),
      ),
    );
    const failed = pages.find((page) => !page.ok || !page.data);
    if (failed) {
      return failed as (typeof pages)[number];
    }
    const items = interleaveLibraryItems(
      pages.map((page) => page.data!.items),
    );
    return {
      ok: true as const,
      data: {
        items,
        nextCursor: null,
        total: items.length,
      },
      status: 200,
      retryable: false,
    };
  }
  return searchArtifactLibrary({
    query: input.query,
    artifactType: input.taxonomy,
    role: MATERIAL_LIBRARY_MORE_ROLE,
    cursor: input.cursor || undefined,
    limit: 60,
    signal: input.signal,
  });
}
