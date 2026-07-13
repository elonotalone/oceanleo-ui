"use client";

import { useEffect, useMemo, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem, LibraryKind } from "./library-data";
import {
  WorkspaceLibrary,
  type WorkspaceLibraryEntry,
  workspaceEntryFromLibraryItem,
} from "./WorkspaceLibrary";
import type { WorkspaceActionEnvelope } from "./workspace-actions";

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
  /** Disable the central catalog only on isolated/offline surfaces. */
  fetchCurated?: boolean;
}

interface PlatformAsset {
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
  source?: string;
}

interface PlatformSearchResponse {
  items?: PlatformAsset[];
  total?: number;
}

const TYPE_TO_KIND: Record<string, LibraryKind> = {
  image: "image",
  vector: "image",
  sticker: "image",
  ppt: "ppt",
  sheet: "sheet",
  chart: "website",
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

function materialToEntry(material: MaterialItem): WorkspaceLibraryEntry {
  if (material.libraryItem) {
    const normalizedItem =
      material.libraryItem.kind === "website"
        ? { ...material.libraryItem, previewUrl: undefined }
        : material.libraryItem;
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
        material.openUrl ||
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
  // Deep links to an editor are useful as an external action, but the in-panel
  // detail remains the stable rendered preview.  Actual .pptx/.xlsx/platform
  // assets below are parsed by their rich viewers.
  const viewerUrl =
    kind === "website" && material.openUrl ? material.openUrl : preview;
  const viewerKind =
    kind === "ppt" && !/\.pptx?(?:[?#]|$)/i.test(material.openUrl || "")
      ? "image"
      : kind;
  const item: LibraryItem = {
    key: `site:${material.id}`,
    source: "artifact",
    id: `site:${material.id}`,
    kind: viewerKind,
    title: material.title,
    siteId: "",
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
    },
  };
  return workspaceEntryFromLibraryItem(item, {
    description: material.desc,
    category:
      material.categories?.[0] || KIND_CATEGORY[viewerKind] || "本站精选",
    keywords: material.tags,
    externalUrl: material.openUrl || preview,
  });
}

function platformToEntry(asset: PlatformAsset): WorkspaceLibraryEntry {
  const kind = TYPE_TO_KIND[asset.type] || "file";
  const rawId = asset.id.replace(/^library:/, "");
  const htmlViewer =
    kind === "website" && rawId
      ? `${GATEWAY}/v1/assets/library/${encodeURIComponent(rawId)}/view`
      : "";
  const item: LibraryItem = {
    key: `asset:${asset.id}`,
    source: "artifact",
    id: `asset:${asset.id}`,
    kind,
    title: asset.title || "未命名素材",
    siteId: "asset",
    url: htmlViewer || asset.full_url || asset.preview_url || "",
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
    },
  };
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
  fetchCurated = true,
}: MaterialLibraryProps) {
  const tt = useUI();
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
    const params = new URLSearchParams({
      type: "all",
      q: debounced,
      page: "1",
      page_size: "60",
      license: "commercial",
    });
    setLoading(true);
    setFailed(false);
    void fetch(
      `${GATEWAY}/v1/assets/library/search?${params.toString()}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PlatformSearchResponse;
      })
      .then((payload) => {
        setRemote(
          (Array.isArray(payload.items) ? payload.items : []).map((asset) => ({
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
  }, [debounced, fetchCurated]);

  const entries = useMemo(
    () =>
      mergeEntries([
        featuredEntries,
        materials.map(materialToEntry),
        remote,
      ]),
    [featuredEntries, materials, remote],
  );

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
      query={query}
      onQueryChange={setQuery}
      toolbarActions={seeAll}
      searchPlaceholder="搜索 PPT、网站、图片、表格、视频或工作流"
      emptyTitle={loading ? "正在加载精选素材…" : "暂无匹配素材"}
      emptyDescription={
        failed
          ? "中央素材暂时不可用；本站精选仍可继续查看。"
          : emptyHint || "换一个关键词，或打开完整素材库继续浏览。"
      }
      className={className}
    />
  );
}
