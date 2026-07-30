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

/**
 * 「编辑」深链要指名的 artifact id（D3 §4）。
 *
 * durable 行直接用自己的 `artifactId`；官方模板目录行**故意**不是 durable artifact，
 * 但带着官方 artifact root 的稳定 id。库按 artifact 取数，拿 `TemplateMaterial.id`
 * 去定位会撞车——那个只保证同一个 app 内唯一。
 */
export function materialDeepLinkArtifactId(
  item: LibraryItem | null | undefined,
): string {
  if (!item) return "";
  const durable = String(item.artifactId || "").trim();
  if (durable) return durable;
  const templateArtifactId = item.meta?.template_material_artifact_id;
  return typeof templateArtifactId === "string"
    ? templateArtifactId.trim()
    : "";
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
  // 第 15 / 16 类载体的卡片标签。缺项会让缩略图与卡片头都退回 tt("内容")
  // 那句兜底文案，`geo-map.md` §10.3 的枚举面要求每类都有自己的显式标签。
  geo_map: "地图",
  interactive_doc: "交互文档",
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
