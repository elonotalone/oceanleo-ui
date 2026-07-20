import type { ReactNode } from "react";
import type { LibraryItem, LibraryKind } from "./library-data";

export interface WorkspaceLibraryEntry {
  id: string;
  title: string;
  description?: string;
  category?: string;
  keywords?: string[];
  thumbUrl?: string;
  kind?: LibraryKind;
  libraryItem?: LibraryItem;
  content?: ReactNode;
  /** Viewer resource URL; never use this as the card-click navigation target. */
  externalUrl?: string;
  /** User-facing destination, usually the matching asset/project page. */
  linkUrl?: string;
  badge?: string;
  /** The current query was already applied by the authoritative remote index. */
  trustedSearchMatch?: boolean;
  /** Present only for user-owned rows. Curated/platform entries stay read-only. */
  onDelete?: () => Promise<void> | void;
}

export const WORKSPACE_KIND_LABELS: Partial<Record<LibraryKind, string>> = {
  website: "网站",
  canvas: "画布",
  ppt: "PPT",
  sheet: "表格",
  document: "文档",
  image: "图片",
  video: "视频",
  video_canvas: "视频工作流",
  audio: "音频",
  xhs: "小红书",
  threed: "3D",
  file: "文件",
};

export interface WorkspaceLibraryCategory {
  id: string;
  label: string;
}

export function workspaceEntryFromLibraryItem(
  item: LibraryItem,
  extra: Partial<WorkspaceLibraryEntry> = {},
): WorkspaceLibraryEntry {
  return {
    id: item.key,
    title: item.title,
    description: item.siteId || item.source || "",
    category: WORKSPACE_KIND_LABELS[item.kind] || "内容",
    keywords: [item.kind, item.siteId || "", item.source || ""].filter(Boolean),
    thumbUrl: item.thumbUrl || item.previewUrl,
    kind: item.kind,
    libraryItem: item,
    externalUrl: item.url || item.previewUrl,
    linkUrl:
      (typeof item.meta.asset_page_url === "string"
        ? item.meta.asset_page_url
        : "") ||
      (typeof item.meta.open_url === "string" ? item.meta.open_url : "") ||
      item.url ||
      item.previewUrl,
    ...extra,
  };
}

export function workspaceLibraryCategories(
  entries: readonly WorkspaceLibraryEntry[],
): WorkspaceLibraryCategory[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    const value = String(entry.category || "").trim();
    if (value) seen.add(value);
  }
  return [
    { id: "all", label: "全部" },
    ...[...seen].map((value) => ({ id: value, label: value })),
  ];
}

export function visibleWorkspaceLibraryCategories(
  categories: readonly WorkspaceLibraryCategory[],
  primaryCategoryIds: readonly string[] | undefined,
  selected: string,
  expanded: boolean,
): {
  visibleCategories: WorkspaceLibraryCategory[];
  overflowCategoryCount: number;
} {
  if (!primaryCategoryIds) {
    return {
      visibleCategories: [...categories],
      overflowCategoryCount: 0,
    };
  }
  const primary = new Set(primaryCategoryIds);
  const head = categories.filter(
    (item) => item.id === "all" || primary.has(item.id),
  );
  const overflow = categories.filter(
    (item) => item.id !== "all" && !primary.has(item.id),
  );
  if (expanded) {
    return {
      visibleCategories: [...head, ...overflow],
      overflowCategoryCount: overflow.length,
    };
  }
  const selectedOverflow = overflow.find((item) => item.id === selected);
  return {
    visibleCategories: selectedOverflow ? [...head, selectedOverflow] : head,
    overflowCategoryCount: overflow.length,
  };
}

export function filterWorkspaceLibraryEntries(
  entries: readonly WorkspaceLibraryEntry[],
  search: string,
  category: string,
): WorkspaceLibraryEntry[] {
  const needle = search.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (category !== "all" && entry.category !== category) return false;
    if (!needle || entry.trustedSearchMatch) return true;
    return [
      entry.title,
      entry.description,
      entry.category,
      ...(entry.keywords || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle);
  });
}
