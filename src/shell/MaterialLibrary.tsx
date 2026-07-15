"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  libraryContentDescriptor,
  type EditorCapabilityName,
  type EditorManifestV1,
  type LibraryItem,
  type LibraryKind,
} from "./library-data";
import {
  WorkspaceLibrary,
  type WorkspaceLibraryEntry,
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
  /** Disable the central catalog only on isolated/offline surfaces. */
  fetchCurated?: boolean;
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
}

interface PlatformSearchResponse {
  items?: PlatformAsset[];
  total?: number;
}

const MATERIAL_CACHE_TTL_MS = 5 * 60 * 1000;
const materialSearchCache = new Map<
  string,
  { assets: PlatformAsset[]; cachedAt: number }
>();

const TYPE_TO_KIND: Record<string, LibraryKind> = {
  image: "image",
  vector: "image",
  sticker: "image",
  ppt: "ppt",
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
        entry.libraryItem?.url ||
        entry.externalUrl ||
        entry.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

/**
 * The right-panel material library is a real child view of the central,
 * platform-owned catalog. Site examples and existing workflow pages are
 * prepended, while search fans out over all curated asset kinds.
 */
export function MaterialLibrary({
  materials,
  accent = "#4f46e5",
  emptyHint,
  className = "",
  onSeeAll,
  seeAllHref = "https://asset.oceanleo.com/materials",
  hideSeeAll = false,
  seeAllLabel,
  featuredEntries = [],
  action,
  taskId,
  siteId = "",
  appId = "",
  fetchCurated = true,
  curatedType = "all",
  curatedSeriesId = "",
  registerRuntimeSource = true,
  materialActions = [],
  onMaterialAction,
  materialActionAvailable,
}: MaterialLibraryProps) {
  const tt = useUI();
  const workspaceSession = useOptionalWorkspaceSession();
  const runtimeAppId = appId || workspaceSession?.appId || "default";
  const runtimeSourceRef = useRef(Symbol("material-library"));
  const [query, setQuery] = useState(action?.action.query || "");
  const [debounced, setDebounced] = useState(query);
  const [remote, setRemote] = useState<WorkspaceLibraryEntry[]>([]);
  const [loading, setLoading] = useState(fetchCurated);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (action?.action.query !== undefined) {
      setQuery(action.action.query);
    }
  }, [action?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fetchCurated) {
      setRemote([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const cacheKey = `${curatedType || "all"}:${curatedSeriesId}:${debounced.toLocaleLowerCase()}`;
    const cached = materialSearchCache.get(cacheKey);
    if (
      cached &&
      Date.now() - cached.cachedAt < MATERIAL_CACHE_TTL_MS
    ) {
      setRemote(
        cached.assets.map((asset) => ({
          ...platformToEntry(asset),
          trustedSearchMatch: Boolean(debounced),
        })),
      );
      setLoading(false);
      setFailed(false);
      return () => controller.abort();
    }
    const params = new URLSearchParams({
      type: curatedType || "all",
      q: debounced,
      page: "1",
      page_size: "60",
      license: "commercial",
    });
    if (curatedSeriesId) params.set("series_id", curatedSeriesId);
    setLoading(true);
    setFailed(false);
    void fetch(
      `${GATEWAY}/v1/assets/library/search?${params.toString()}`,
      {
        cache: debounced ? "no-store" : "force-cache",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PlatformSearchResponse;
      })
      .then((payload) => {
        const assets = Array.isArray(payload.items) ? payload.items : [];
        materialSearchCache.set(cacheKey, {
          assets,
          cachedAt: Date.now(),
        });
        setRemote(
          assets.map((asset) => ({
            ...platformToEntry(asset),
            trustedSearchMatch: Boolean(debounced),
          })),
        );
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        setRemote([]);
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [curatedSeriesId, curatedType, debounced, fetchCurated]);

  const localEntries = useMemo(
    () => materials.map(materialToEntry),
    [materials],
  );
  const primaryCategoryIds = useMemo(
    () =>
      [
        ...new Set(
          [...featuredEntries, ...localEntries]
            .map((entry) => String(entry.category || "").trim())
            .filter(Boolean),
        ),
      ],
    [featuredEntries, localEntries],
  );
  const entries = useMemo(
    () => mergeEntries([featuredEntries, localEntries, remote]),
    [featuredEntries, localEntries, remote],
  );
  useEffect(() => {
    if (!registerRuntimeSource) return;
    return registerWorkbenchMaterialSource(
      materialScopeKey(siteId, runtimeAppId),
      runtimeSourceRef.current,
      entries,
    );
  }, [entries, registerRuntimeSource, runtimeAppId, siteId]);

  const seeAll = hideSeeAll ? null : (
    onSeeAll ? (
      <button
        type="button"
        onClick={onSeeAll}
        className="whitespace-nowrap rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition hover:bg-stone-50"
      >
        {tt(seeAllLabel || "完整素材库")} →
      </button>
    ) : (
      <a
        href={seeAllHref}
        target="_blank"
        rel="noreferrer"
        className="whitespace-nowrap rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition hover:bg-stone-50"
      >
        {tt(seeAllLabel || "完整素材库")} →
      </a>
    )
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
      toolbarActions={seeAll}
      searchPlaceholder="搜索 PPT、网站、图片、表格、视频或工作流"
      emptyTitle={loading ? "正在加载精选素材…" : "暂无匹配素材"}
      emptyDescription={
        failed
          ? "中央素材暂时不可用；本站精选仍可继续查看。"
          : emptyHint || "换一个关键词，或打开完整素材库继续浏览。"
      }
      materialActions={materialActions}
      onMaterialAction={onMaterialAction}
      materialActionAvailable={materialActionAvailable}
      allowAdvanced={materialActions.length === 0}
      className={className}
    />
  );
}
