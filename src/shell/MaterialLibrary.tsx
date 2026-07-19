"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
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
  ARTIFACT_TYPES,
  artifactHasExactContext,
  artifactIsVisible,
  normalizeArtifactProjection,
  type ArtifactContextRef,
  type ArtifactType,
} from "./artifact-contract";
import {
  listPrimaryArtifacts,
  searchArtifactLibrary,
} from "./artifact-client";
import {
  WorkspaceLibrary,
  type WorkspaceLibraryEntry,
  type WorkspaceLibraryProps,
  workspaceEntryFromLibraryItem,
} from "./WorkspaceLibrary";
import type { WorkspaceActionEnvelope } from "./workspace-actions";
import { useOptionalWorkspaceSession } from "./WorkspaceSession";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import {
  materialScopeKey,
  registerWorkbenchMaterialSource,
} from "./workbench-material-registry";

const GATEWAY =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL)) ||
  "https://api.oceanleo.com";

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

export interface MaterialLibraryProps {
  materials: MaterialItem[];
  accent?: string;
  emptyHint?: string;
  className?: string;
  onSeeAll?: () => void;
  seeAllHref?: string;
  hideSeeAll?: boolean;
  seeAllLabel?: string;
  /** Existing product pages/workflows that should also be curated materials. */
  featuredEntries?: WorkspaceLibraryEntry[];
  /** Trusted agent action currently targeting this library. */
  action?: WorkspaceActionEnvelope | null;
  taskId?: string | null;
  siteId?: string;
  appId?: string;
  /** Stable server-issued context. Primary requests fail closed without it. */
  contextId?: string;
  functionId?: string;
  /**
   * Legacy switch. Since v0.179 it controls Primary remote fetching only;
   * More remains available unless `fetchMore={false}` is explicit.
   */
  fetchCurated?: boolean;
  /** Independently control the exact-context Primary request. */
  fetchPrimary?: boolean;
  /** Independently control global ACL-scoped More search. */
  fetchMore?: boolean;
  /** Restrict the central catalog to the editor's current media family. */
  curatedType?: string;
  /** Restrict the central catalog to one curated collection/series. */
  curatedSeriesId?: string;
  /** Register GoalApp/local/platform entries for the advanced workbench scope. */
  registerRuntimeSource?: boolean;
  materialActions?: readonly WorkbenchMaterialAction[];
  onMaterialAction?: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
  materialActionAvailable?: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => boolean;
  materialActionEvidence?: WorkspaceLibraryProps["materialActionEvidence"];
  primaryMaterialAction?: WorkbenchMaterialAction;
  draggableMaterials?: boolean;
  onMaterialDragStart?: (item: LibraryItem) => void;
  onMaterialDragEnd?: () => void;
  /** Standalone libraries may open an editor; embedded workbenches stay in place. */
  allowAdvancedOnSelect?: boolean;
  /** Workspace-level editor host; keeps the editor out of the library detail. */
  onOpenItem?: (item: LibraryItem) => void;
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
  // Viewer only: chart editability is declared separately by chart-editor@1.
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

function materialToEntry(material: MaterialItem): WorkspaceLibraryEntry {
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
    return workspaceEntryFromLibraryItem(normalizedItem, {
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
      externalUrl:
        normalizedItem.url || material.libraryItem.previewUrl,
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
  // An editor/project deep link is an action, not the material itself. Static
  // cards (for example video-cover WebP cards whose openUrl points at Design)
  // always open their preview first. Real Office/media files still use the
  // matching rich viewer.
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
    url:
      viewerKind === "ppt"
        ? material.openUrl
        : viewerUrl,
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
  return workspaceEntryFromLibraryItem(item, {
    description: material.desc,
    category:
      material.categories?.[0] || KIND_CATEGORY[viewerKind] || "本站精选",
    keywords: material.tags,
    externalUrl: viewerUrl,
    linkUrl: templateDocUrl ? undefined : material.openUrl || preview,
  });
}

export function platformToEntry(asset: PlatformAsset): WorkspaceLibraryEntry {
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
  // Viewer and editor source are intentionally separate. A chart card opens
  // its cover; chart-editor@1 loads only the manifest's trusted JSON source.
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
  const htmlViewer =
    starterId
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
  return workspaceEntryFromLibraryItem(item, {
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

function mergeEntries(groups: WorkspaceLibraryEntry[][]): WorkspaceLibraryEntry[] {
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

const TAXONOMY_LABEL: Record<ArtifactType, string> = {
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

function normalizedTaxonomy(value: string): ArtifactType | "" {
  if ((ARTIFACT_TYPES as readonly string[]).includes(value)) {
    return value as ArtifactType;
  }
  return {
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
  }[value] as ArtifactType | undefined || "";
}

function artifactEntry(item: LibraryItem, trustedSearchMatch = false) {
  return workspaceEntryFromLibraryItem(item, {
    category: item.artifactType
      ? TAXONOMY_LABEL[item.artifactType]
      : KIND_CATEGORY[item.kind] || "素材",
    description: item.artifact?.roles.length
      ? item.artifact.roles.join(" · ")
      : "OceanLeo 素材",
    keywords: [
      item.artifactType || "",
      ...(item.artifact?.roles || []),
      item.artifact?.sourceFormat || "",
    ].filter(Boolean),
    trustedSearchMatch,
  });
}

/**
 * Two-level library: exact context bindings in Primary, ACL-scoped global
 * search in More. Empty Primary never falls back to tags/site/series/random.
 */
export function MaterialLibrary({
  materials,
  accent = "#4f46e5",
  emptyHint,
  className = "",
  onSeeAll,
  seeAllHref,
  hideSeeAll = false,
  seeAllLabel = "更多",
  featuredEntries = [],
  action,
  taskId,
  siteId = "",
  appId = "",
  contextId = "",
  functionId = "",
  fetchCurated = true,
  fetchPrimary,
  fetchMore = true,
  curatedType = "all",
  registerRuntimeSource = true,
  materialActions = [],
  onMaterialAction,
  materialActionAvailable,
  materialActionEvidence,
  primaryMaterialAction,
  draggableMaterials,
  onMaterialDragStart,
  onMaterialDragEnd,
  allowAdvancedOnSelect = true,
  onOpenItem,
}: MaterialLibraryProps) {
  const tt = useUI();
  const workspaceSession = useOptionalWorkspaceSession();
  const runtimeAppId = appId || workspaceSession?.appId || "default";
  const runtimeSourceRef = useRef(Symbol("material-library"));
  const requestEpochRef = useRef(0);
  const primaryFetchEnabled = fetchPrimary ?? fetchCurated;
  const [level, setLevel] = useState<"primary" | "more">("primary");
  const [query, setQuery] = useState(action?.action.query || "");
  const [debounced, setDebounced] = useState(query);
  const [taxonomy, setTaxonomy] = useState<ArtifactType | "">(
    normalizedTaxonomy(curatedType),
  );
  const [remote, setRemote] = useState<WorkspaceLibraryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  const context = useMemo<ArtifactContextRef>(
    () => ({
      contextId,
      siteKey: siteId,
      appId: runtimeAppId,
      functionId: functionId || undefined,
    }),
    [contextId, functionId, runtimeAppId, siteId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setLevel("primary");
    setQuery("");
  }, [contextId, functionId, runtimeAppId, siteId]);

  useEffect(() => {
    if (action?.action.query !== undefined) {
      setQuery(action.action.query);
    }
  }, [action?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (level === "primary" && (!context.contextId || !context.siteKey)) {
      setRemote([]);
      setNextCursor(null);
      setLoading(false);
      setError("缺少精确 contextId；Primary 已保持为空，不做宽泛回填。");
      return;
    }
    const fetchEnabled =
      level === "primary" ? primaryFetchEnabled : fetchMore;
    if (!fetchEnabled) {
      setRemote([]);
      setNextCursor(null);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    const epoch = ++requestEpochRef.current;
    setLoading(true);
    setError("");
    const request =
      level === "primary"
        ? listPrimaryArtifacts(context, {
            artifactType: taxonomy,
            limit: 60,
            signal: controller.signal,
          })
        : searchArtifactLibrary({
            query: debounced,
            artifactType: taxonomy,
            limit: 60,
            signal: controller.signal,
          });
    void request.then((result) => {
      if (controller.signal.aborted || epoch !== requestEpochRef.current) {
        return;
      }
      if (!result.ok || !result.data) {
        setRemote([]);
        setNextCursor(null);
        setError(result.error || "素材库暂时无法加载。");
      } else {
        setRemote(
          result.data.items.map((item) =>
            artifactEntry(item, level === "more" && Boolean(debounced)),
          ),
        );
        setNextCursor(result.data.nextCursor);
      }
      setLoading(false);
    });
    return () => controller.abort();
  }, [
    context,
    debounced,
    fetchMore,
    level,
    primaryFetchEnabled,
    retryNonce,
    taxonomy,
  ]);

  const loadMore = async () => {
    if (
      level !== "more" ||
      !fetchMore ||
      !nextCursor ||
      loadingMore
    ) {
      return;
    }
    setLoadingMore(true);
    const result = await searchArtifactLibrary({
      query: debounced,
      artifactType: taxonomy,
      cursor: nextCursor,
      limit: 60,
    });
    if (result.ok && result.data) {
      setRemote((current) =>
        mergeEntries([
          current,
          result.data!.items.map((item) =>
            artifactEntry(item, Boolean(debounced)),
          ),
        ]),
      );
      setNextCursor(result.data.nextCursor);
      setError("");
    } else {
      setError(result.error || "继续加载失败，请重试。");
    }
    setLoadingMore(false);
  };

  const localEntries = useMemo(
    () => materials.map(materialToEntry),
    [materials],
  );
  const exactLocalEntries = useMemo(
    () =>
      [...featuredEntries, ...localEntries].filter((entry) => {
        const item = entry.libraryItem;
        return Boolean(
          item &&
            isDurableLibraryItem(item) &&
            contextId &&
            artifactIsVisible(item.artifact) &&
            artifactHasExactContext(item.artifact, contextId),
        );
      }),
    [contextId, featuredEntries, localEntries],
  );
  const entries = useMemo(
    () =>
      level === "primary"
        ? mergeEntries([remote, exactLocalEntries])
        : remote,
    [exactLocalEntries, level, remote],
  );
  const primaryCategoryIds = useMemo(
    () =>
      level === "primary"
        ? [
            ...new Set(
              entries
                .map((entry) => String(entry.category || "").trim())
                .filter(Boolean),
            ),
          ]
        : undefined,
    [entries, level],
  );

  useEffect(() => {
    if (!registerRuntimeSource) return;
    return registerWorkbenchMaterialSource(
      materialScopeKey(siteId, runtimeAppId),
      runtimeSourceRef.current,
      entries,
    );
  }, [entries, registerRuntimeSource, runtimeAppId, siteId]);

  const primaryMoreControl = hideSeeAll ? null : onSeeAll ? (
    <button
      type="button"
      onClick={onSeeAll}
      className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      aria-label={tt("打开完整素材库")}
    >
      {tt(seeAllLabel)} →
    </button>
  ) : seeAllHref ? (
    <a
      href={seeAllHref}
      className="inline-flex min-h-8 items-center whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      aria-label={tt("打开完整素材库")}
    >
      {tt(seeAllLabel)} →
    </a>
  ) : fetchMore ? (
    <button
      type="button"
      onClick={() => {
        setLevel("more");
        setQuery("");
      }}
      className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      aria-label={tt("打开完整素材库")}
    >
      {tt(seeAllLabel)} →
    </button>
  ) : null;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {level === "primary" ? (
        primaryMoreControl
      ) : (
        <button
          type="button"
          onClick={() => {
            setLevel("primary");
            setQuery("");
          }}
          className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
        >
          ← {tt("当前 App")}
        </button>
      )}
      <label className="sr-only" htmlFor="oceanleo-artifact-taxonomy">
        {tt("素材类型")}
      </label>
      <select
        id="oceanleo-artifact-taxonomy"
        value={taxonomy}
        onChange={(event) =>
          setTaxonomy(event.currentTarget.value as ArtifactType | "")
        }
        className="min-h-8 rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 text-[11px] text-[var(--fg-2,#57534e)]"
      >
        <option value="">{tt("全部类型")}</option>
        {ARTIFACT_TYPES.map((type) => (
          <option key={type} value={type}>
            {tt(TAXONOMY_LABEL[type])}
          </option>
        ))}
      </select>
      {nextCursor && level === "more" && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="min-h-8 rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium disabled:opacity-50"
        >
          {tt(loadingMore ? "加载中…" : "继续加载")}
        </button>
      )}
      {error &&
        (level === "more" ? fetchMore : primaryFetchEnabled) && (
        <button
          type="button"
          onClick={() => setRetryNonce((value) => value + 1)}
          className="min-h-8 rounded-lg border border-amber-500/30 px-2.5 text-[11px] font-medium text-amber-700"
        >
          {tt("重试")}
        </button>
        )}
    </div>
  );

  return (
    <WorkspaceLibrary
      entries={entries}
      accent={accent}
      action={action}
      taskId={taskId}
      siteId={siteId}
      appId={runtimeAppId}
      query={query}
      onQueryChange={setQuery}
      primaryCategoryIds={primaryCategoryIds}
      toolbarActions={toolbar}
      searchPlaceholder={
        level === "primary"
          ? "筛选当前 App 的精确绑定素材"
          : "搜索全部有权访问的素材"
      }
      emptyTitle={
        loading
          ? "正在加载素材…"
          : level === "primary"
            ? "当前 App 暂无绑定素材"
            : "完整素材库暂无匹配结果"
      }
      emptyDescription={
        error ||
        (level === "primary"
          ? emptyHint || "这里不会用标签、站点、系列或热门素材回填；请点「更多」搜索完整库。"
          : "换一个关键词或 taxonomy；未授权素材不会出现在结果、计数或建议中。")
      }
      materialActions={materialActions}
      onMaterialAction={onMaterialAction}
      materialActionAvailable={materialActionAvailable}
      materialActionEvidence={materialActionEvidence}
      primaryMaterialAction={primaryMaterialAction}
      draggableMaterials={draggableMaterials}
      onMaterialDragStart={onMaterialDragStart}
      onMaterialDragEnd={onMaterialDragEnd}
      allowAdvanced={allowAdvancedOnSelect}
      onOpenItem={onOpenItem}
      className={className}
    />
  );
}
