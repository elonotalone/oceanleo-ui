"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "../lib/auth/client";
import { useUI } from "../i18n/ui/useUI";
import {
  getDatabaseOverview,
  type AssetItem,
  type FileItem,
  type WorkItem,
} from "../lib/database";
import {
  buildLibraryItems,
  type LibraryArtifactRow,
  type LibraryItem,
  type LibraryKind,
} from "./library-data";
import {
  WorkspaceLibrary,
  type WorkspaceLibraryEntry,
  workspaceEntryFromLibraryItem,
} from "./WorkspaceLibrary";
import type { WorkspaceActionEnvelope } from "./workspace-actions";

const KIND_CATEGORY: Record<LibraryKind, string> = {
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

function assetAsWork(item: AssetItem | FileItem): WorkItem {
  return {
    id: `asset-${item.id}`,
    url: item.url,
    thumb_url: item.thumb_url,
    title: item.title,
    kind: item.media_type || item.mime || "file",
    media_type: item.media_type,
    site_id: item.site_id,
    meta: {
      ...(item.meta || {}),
      mime: item.mime || "",
      bytes: item.bytes || 0,
      library_source: "upload",
    },
    created_at: item.created_at,
  };
}

function toEntry(item: LibraryItem) {
  const uploaded = item.meta.library_source === "upload";
  return workspaceEntryFromLibraryItem(item, {
    category: uploaded ? "上传文件" : KIND_CATEGORY[item.kind],
    description:
      (uploaded ? "用户上传" : item.source === "artifact" ? "任务交付物" : "我的作品") +
      (item.siteId ? ` · ${item.siteId}` : ""),
    keywords: [
      item.kind,
      item.siteId,
      uploaded ? "上传 文件" : "作品 生成",
      item.favorite ? "收藏" : "",
    ].filter(Boolean),
  });
}

export interface MyLibraryProps {
  accent?: string;
  action?: WorkspaceActionEnvelope | null;
  className?: string;
  featuredEntries?: WorkspaceLibraryEntry[];
  taskId?: string | null;
  siteId?: string;
  category?: string;
  onCategoryChange?: (category: string) => void;
  onlyFavorites?: boolean;
}

/** User-owned works + generated websites + task artifacts + uploaded files. */
export function MyLibrary({
  accent = "#4f46e5",
  action,
  className = "",
  featuredEntries = [],
  taskId,
  siteId = "",
  category,
  onCategoryChange,
  onlyFavorites = false,
}: MyLibraryProps) {
  const tt = useUI();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const overview = await getDatabaseOverview({ limit: 200 });
    if (!overview.ok) {
      setItems([]);
      setAuthRequired(overview.status === 401);
      setFailed(overview.status !== 401);
      setLoading(false);
      return;
    }
    setAuthRequired(false);
    const data = overview.data;
    const works: WorkItem[] = [
      ...(data?.works || []),
      ...(data?.assets || []).map(assetAsWork),
      ...(data?.files || []).map(assetAsWork),
    ];

    let artifacts: LibraryArtifactRow[] = [];
    const supabase = browserClient();
    if (supabase) {
      const response = await supabase
        .from("agent_artifacts")
        .select("id,title,kind,content,url,favorite,created_at,task_id,session_id")
        .order("created_at", { ascending: false })
        .limit(500);
      artifacts = (response.data as LibraryArtifactRow[] | null) || [];
    }
    setItems(buildLibraryItems(works, artifacts));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  const entries = useMemo(
    () => [
      ...(onlyFavorites ? [] : featuredEntries),
      ...items.filter((item) => !onlyFavorites || item.favorite).map(toEntry),
    ],
    [featuredEntries, items, onlyFavorites],
  );
  const refresh = (
    <button
      type="button"
      onClick={() => setRefreshNonce((value) => value + 1)}
      disabled={loading}
      className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
    >
      {tt(loading ? "加载中…" : "刷新")}
    </button>
  );

  return (
    <WorkspaceLibrary
      entries={entries}
      accent={accent}
      action={action}
      category={category}
      onCategoryChange={onCategoryChange}
      taskId={taskId}
      siteId={siteId}
      toolbarActions={refresh}
      searchPlaceholder="搜索我的作品、网站、交付物和上传文件"
      emptyTitle={
        authRequired
          ? "登录后查看我的库"
          : loading
            ? "正在加载我的库…"
            : failed
              ? "我的库暂时无法加载"
              : "我的库还是空的"
      }
      emptyDescription={
        authRequired
          ? "登录任意 OceanLeo 站点后，跨站作品会在这里汇总。"
          : failed
            ? "请稍后刷新重试。"
            : "生成作品、网站或上传文件后，它们会自动出现在这里。"
      }
      className={className}
    />
  );
}
