import {
  artifactHasExactContext,
  ARTIFACT_TYPES,
  normalizeArtifactProjection,
  POPULARITY_META_KEY,
  popularityMetricsFromWire,
  type ArtifactContextRef,
  type ArtifactType,
} from "./artifact-contract";
import {
  listPrimaryArtifacts,
  searchArtifactLibrary,
  type ArtifactApiResult,
  type ArtifactSearchResult,
} from "./artifact-client";
import { isAdvancedEditableShelfItem } from "./advanced-features";
import {
  exploreArtifactClassOf,
  isPlayableGameLibraryItem,
} from "./explore-artifact-class";
import {
  MATERIAL_LIBRARY_TEMPLATE_ROLE,
  materialLibraryCacheGeneration,
  materialLibraryPageLimit,
  materialLibraryPending,
  materialLibraryRequestKey,
  readMaterialLibraryCache,
  rememberMaterialLibraryResult,
  type MaterialLibraryQueryInput,
} from "./material-library-cache";
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
  applyMaterialScope,
  materialLibrarySearchParams,
  materialScopeTypes,
  materialScopeViolation,
  warnMaterialScopeDegraded,
} from "./material-library-scope";
import {
  workspaceEntryFromLibraryItem,
  type WorkspaceLibraryEntry,
} from "./workspace-library-model";

const GATEWAY =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL)) ||
  "https://api.oceanleo.com";

export {
  MATERIAL_APP_BINDINGS_META_KEY,
  MATERIAL_LIBRARY_LEVELS,
  MATERIAL_SCOPE_PARAM_NAMES,
  MATERIAL_SCOPE_UNENFORCEABLE_CODE,
  libraryItemAppAttributions,
  libraryItemMatchesOriginScope,
  libraryItemOriginAppId,
  libraryItemStoredAppAttributions,
  materialLibrarySearchParams,
  materialLibrarySearchQuery,
  materialScopeTypes,
  materialScopeViolation,
  materialTypesCsv,
  materialTypesFromCsv,
  mergeAppAttributions,
} from "./material-library-scope";
export type {
  MaterialAppAttribution,
  MaterialLibraryLevel,
  MaterialLibrarySearchParams,
  MaterialScope,
} from "./material-library-scope";
// D3 的去重与多归属住在 `material-library-dedupe.ts`（本模块贴着 800 行硬顶）；
// 从这里 re-export，既有 import 路径不变。
export {
  materialAppDedupeKey,
  materialArtifactDedupeKey,
  materialEntryAppAttributions,
  materialEntryAppForScope,
  materialEntryPrimaryAppId,
  mergeMaterialEntries,
} from "./material-library-dedupe";
// 请求形状 / 内存缓存 / 同键去重同样住在自己的模块里（同一条 800 行硬顶的理由）；
// 从这里原样 re-export，既有 import 路径一个字不变。
export {
  MATERIAL_LIBRARY_DEFAULT_PAGE_LIMIT,
  MATERIAL_LIBRARY_TEMPLATE_ROLE,
  invalidateMaterialLibraryCache,
  materialLibraryPageLimit,
  materialLibraryRequestKey,
  readMaterialLibraryCache,
} from "./material-library-cache";
export type {
  MaterialLibraryCacheSnapshot,
  MaterialLibraryQueryInput,
} from "./material-library-cache";

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
  geo_map: "geo_map",
  interactive_doc: "interactive_doc",
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
  geo_map: "地图",
  interactive_doc: "交互文档",
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
  // 第 14 个 artifact type，由 W9 加进 `ARTIFACT_TYPES`（D7）。
  game: "游戏",
  // 第 15 / 16 个 artifact type（`geo-map.md` §1.1、`interactive-doc.md` §1.1）。
  // 「地图」而不是「地理」：卡片标签讲的是产物形态，不是学科。
  geo_map: "地图",
  interactive_doc: "交互文档",
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
  const assetPopularity = popularityMetricsFromWire(asset);
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
      // 平台素材这条路径不经 artifact 投影（`asset.*` 是另一套字段），所以热度要在这里
      // 单独放行一次，否则同一份 ambientCG 素材从这个入口进来就没有下载量、排序与
      // artifact 入口不一致。判据与放行名单同源（`artifact-contract.ts`）。
      ...(assetPopularity ? { [POPULARITY_META_KEY]: assetPopularity } : {}),
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
      // 搜索与深链里的旧写法别名；权威 token 仍是下划线的枚举值本身
      // （`geo-map.md` §1.1.1「进数据库的一律下划线」）。
      map: "geo_map",
      geomap: "geo_map",
      "geo-map": "geo_map",
      interactive: "interactive_doc",
      interactivedoc: "interactive_doc",
      "interactive-doc": "interactive_doc",
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

export function libraryItemHasExactPrimaryContext(
  item: LibraryItem,
  context: ArtifactContextRef,
): boolean {
  if (
    !isDurableLibraryItem(item) ||
    !artifactHasExactContext(item.artifact, context)
  ) {
    return false;
  }
  return item.artifact.bindings.some(
    (binding) =>
      binding.contextId === context.contextId &&
      binding.role.trim().toLowerCase() === "primary" &&
      binding.pinnedRevisionId === item.revisionId,
  );
}

/**
 * 检索结果里剔掉这条货架用不了的条目。
 *
 * **这是附录 2 §6 那三道过滤之外的第四道**，而且它在最上游：过去这里无条件只留
 * `isAdvancedEditableShelfItem`，于是 100 款 `view_only` 的 artifact 游戏在
 * `materialShelfEntries()` 看到它们之前就已经没了——可玩探针拿回来的永远是空数组。
 *
 * 放行是**按请求作用域**的，不是无条件的：只有明确按 `game` 类型检索时才收下可玩
 * 条目。这样素材货架（抽屉、工作台面板、探索页的素材那一格）的结果集与今天逐字
 * 相同，36 个消费者的行为不变；而可玩探针（`taxonomy=game`）拿得到它要的东西。
 */
function omitUneditableMaterials(
  result: ArtifactApiResult<ArtifactSearchResult>,
  playableRequested: boolean,
): ArtifactApiResult<ArtifactSearchResult> {
  if (!result.ok || !result.data) return result;
  const items = result.data.items.filter(
    (item) =>
      isAdvancedEditableShelfItem(item) ||
      (playableRequested && isPlayableGameLibraryItem(item)),
  );
  const locallyOmitted = result.data.items.length - items.length;
  const existing = result.data.diagnostics;
  return {
    ...result,
    data: {
      ...result.data,
      items,
      diagnostics: {
        omittedCount: (existing?.omittedCount || 0) + locallyOmitted,
        reasons: [
          ...(existing?.reasons || []),
          ...(locallyOmitted > 0 ? ["unsupported-editor-route"] : []),
        ],
      },
    },
  };
}

function cacheMaterialLibraryResult(
  key: string,
  result: ArtifactApiResult<ArtifactSearchResult>,
  generation: number,
  playableRequested: boolean,
): ArtifactApiResult<ArtifactSearchResult> {
  const safe = omitUneditableMaterials(result, playableRequested);
  if (generation === materialLibraryCacheGeneration()) {
    rememberMaterialLibraryResult(key, safe);
  }
  return safe;
}

type LibrarySearchOptions = Parameters<typeof searchArtifactLibrary>[0];

/**
 * `searchArtifactLibrary` lives in `artifact-client.ts`, which this owner may
 * not edit, and it drops keys it does not know. Until it forwards the §3.2
 * names the scoped request comes back unscoped and `applyMaterialScope`
 * narrows the page in the browser.
 */
type ScopedLibrarySearchOptions = LibrarySearchOptions & {
  artifactTypes?: string;
  originSiteKey?: string;
  originAppId?: string;
};

/**
 * Fail-closed（合同 §3 W4 必做 2）。后端拒绝 §3.2 的作用域参数时**不再重放一次无
 * 作用域请求**：旧实现那样做是为了不让探索页白屏，代价是把全平台素材摆到本站货架上。
 * D1 之后那个代价不可接受，错误原样上抛。
 */
async function searchScopedLibrary(
  input: MaterialLibraryQueryInput,
  types: readonly ArtifactType[],
): Promise<ArtifactApiResult<ArtifactSearchResult>> {
  const params = materialLibrarySearchParams({
    level: input.level,
    query: input.query,
    role:
      String(input.role ?? "").trim() || MATERIAL_LIBRARY_TEMPLATE_ROLE,
    siteKey: input.context?.siteKey,
    appId: input.context?.appId,
    types,
    legacyTaxonomyOnly: !input.types || input.types.length === 0,
  });
  const scoped: ScopedLibrarySearchOptions = {
    query: params.q,
    artifactType: params.artifactType,
    role: params.role,
    cursor: input.cursor || undefined,
    limit: materialLibraryPageLimit(input),
    signal: input.signal,
    ...(params.artifactTypes ? { artifactTypes: params.artifactTypes } : {}),
    originSiteKey: params.originSiteKey,
    ...(params.originAppId ? { originAppId: params.originAppId } : {}),
  };
  return searchArtifactLibrary(scoped);
}

/**
 * `ArtifactApiResult.code` 是 `artifact-contract.ts` 里的封闭联合（不是本 owner 的
 * 文件），所以 fail-closed 的标记走这个独立字段，不去撑那个联合。
 * `MATERIAL_SCOPE_UNENFORCEABLE_CODE` 是它的稳定标识值。
 */
export interface MaterialLibraryResult
  extends ArtifactApiResult<ArtifactSearchResult> {
  /** 非空即请求被 fail-closed 拦下，压根没发出去；值是可直接展示的中文原因。 */
  scopeViolation?: string;
}

export function isUnenforceableScopeResult(
  result: MaterialLibraryResult,
): boolean {
  return Boolean(result.scopeViolation);
}

/** 请求压根没发出去时返回的结果。`materialScopeViolation` 的原因原样带给用户。 */
function unenforceableScopeResult(reason: string): MaterialLibraryResult {
  return {
    ok: false,
    error: reason,
    status: 400,
    retryable: false,
    scopeViolation: reason,
  };
}

function scopedSearchResult(
  input: MaterialLibraryQueryInput,
  types: readonly ArtifactType[],
  result: ArtifactApiResult<ArtifactSearchResult>,
): ArtifactApiResult<ArtifactSearchResult> {
  if (!result.ok || !result.data) return result;
  const outcome = applyMaterialScope(result.data.items, {
    // 此 app comes from the exact-context endpoint, which is already
    // authoritative; only 本站素材 needs browser-side narrowing.
    siteKey: input.level === "site" ? input.context?.siteKey : "",
    types,
  });
  if (!outcome.degraded) return result;
  warnMaterialScopeDegraded(
    `${input.level}:${input.context?.siteKey || ""}:${input.context?.appId || ""}`,
    { level: input.level },
  );
  return {
    ...result,
    data: { ...result.data, items: outcome.items },
  };
}

export async function queryMaterialLibrary(
  input: MaterialLibraryQueryInput,
): Promise<MaterialLibraryResult> {
  // Fail-closed 在缓存与去重之前：一个不可执行的作用域不该有缓存条目，也不该
  // 有 in-flight 请求可以被复用。
  const violation = materialScopeViolation({
    level: input.level,
    siteKey: input.context?.siteKey,
    appId: input.context?.appId,
  });
  if (violation) return unenforceableScopeResult(violation);
  const key = materialLibraryRequestKey(input);
  if (!input.forceRefresh) {
    const cached = readMaterialLibraryCache(input);
    if (cached?.freshness === "fresh") {
      return {
        ok: true,
        data: cached.data,
        status: cached.status,
      };
    }
  }
  const pending = input.signal ? null : materialLibraryPending.get(key);
  if (pending) return pending;
  const generation = materialLibraryCacheGeneration();
  const types = materialScopeTypes(input);
  // 只有明确按可玩类型检索时才放行 `view_only` 游戏，见 `omitUneditableMaterials`。
  const playableRequested = types.some(
    (type) => exploreArtifactClassOf(type) === "playable",
  );
  const request = (async () => {
    if (input.level === "primary") {
      // `/v1/library/primary` is already exact-context scoped, so 此 app keeps
      // the endpoint the workbench has always used.
      const page = await listPrimaryArtifacts(input.context, {
        artifactType: types.length === 1 ? types[0] : "",
        limit: materialLibraryPageLimit(input),
        signal: input.signal,
      });
      return cacheMaterialLibraryResult(
        key,
        scopedSearchResult(input, types, page),
        generation,
        playableRequested,
      );
    }
    const page = await searchScopedLibrary(input, types);
    return cacheMaterialLibraryResult(
      key,
      scopedSearchResult(input, types, page),
      generation,
      playableRequested,
    );
  })();
  if (!input.signal) materialLibraryPending.set(key, request);
  try {
    return await request;
  } finally {
    if (materialLibraryPending.get(key) === request) {
      materialLibraryPending.delete(key);
    }
  }
}
