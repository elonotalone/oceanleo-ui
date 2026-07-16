"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "../lib/auth/client";
import { useUI } from "../i18n/ui/useUI";
import {
  deleteArtifact,
  deleteAsset,
  deleteWork,
  getDatabaseOverview,
  uploadFile,
  type AssetItem,
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

const libraryCache = new Map<
  string,
  { items: LibraryItem[]; cachedAt: number }
>();

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

export function assetAsWork(item: AssetItem): WorkItem {
  const uploaded = item.meta?.is_upload === true;
  return {
    id: item.id,
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
      library_source: uploaded ? "upload" : "asset",
      library_table: "asset",
    },
    created_at: item.created_at,
  };
}

function toEntry(item: LibraryItem, onDelete: () => Promise<void>) {
  const uploaded = item.meta.library_source === "upload";
  const userAsset = item.meta.library_source === "asset";
  return workspaceEntryFromLibraryItem(item, {
    category: uploaded ? "上传文件" : userAsset ? "我的素材" : KIND_CATEGORY[item.kind],
    description:
      (uploaded
        ? "用户上传"
        : userAsset
          ? "我的素材"
          : item.source === "artifact"
            ? "任务交付物"
            : "我的作品") +
      (item.siteId ? ` · ${item.siteId}` : ""),
    keywords: [
      item.kind,
      item.siteId,
      uploaded ? "上传 文件" : userAsset ? "素材 收藏" : "作品 生成",
      item.favorite ? "收藏" : "",
    ].filter(Boolean),
    onDelete,
  });
}

export interface MyLibraryProps {
  accent?: string;
  action?: WorkspaceActionEnvelope | null;
  className?: string;
  featuredEntries?: WorkspaceLibraryEntry[];
  taskId?: string | null;
  siteId?: string;
  /** Reload when the current task gains or removes a structured artifact receipt. */
  refreshNonce?: string | number;
  category?: string;
  onCategoryChange?: (category: string) => void;
  onlyFavorites?: boolean;
  plain?: boolean;
  itemFilter?: (item: LibraryItem) => boolean;
  onOpenItem?: (item: LibraryItem) => void;
  openAdvancedOnSelect?: boolean;
}

/** User-owned works + generated websites + task artifacts + uploaded files. */
export function MyLibrary({
  accent = "#4f46e5",
  action,
  className = "",
  featuredEntries = [],
  taskId,
  siteId = "",
  refreshNonce,
  category,
  onCategoryChange,
  onlyFavorites = false,
  plain = false,
  itemFilter,
  onOpenItem,
  openAdvancedOnSelect = true,
}: MyLibraryProps) {
  const tt = useUI();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const cacheUserIdRef = useRef("");

  const load = useCallback(async () => {
    setFailed(false);
    const supabase = browserClient();
    const sessionResult = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const userId = sessionResult.data.session?.user.id || "";
    cacheUserIdRef.current = userId;
    if (!userId || !supabase) {
      setItems([]);
      setAuthRequired(true);
      setLoading(false);
      return;
    }

    const cached = libraryCache.get(userId);
    if (cached) {
      setItems(cached.items);
      setAuthRequired(false);
      setLoading(false);
    } else {
      setLoading(true);
    }

    // The gateway and direct owner-scoped RLS reads are intentionally
    // independent. SSO cookies can briefly lag behind the Supabase session
    // after cross-site navigation; direct reads prevent that transient from
    // turning a populated library into an empty panel.
    const [
      overview,
      creationResponse,
      assetResponse,
      artifactResponse,
    ] = await Promise.all([
      getDatabaseOverview({ limit: 200 }),
      supabase
        .from("user_creations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("user_assets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("agent_artifacts")
        .select("id,title,kind,content,url,favorite,created_at,task_id,session_id")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    const directLibraryAvailable =
      !creationResponse.error || !assetResponse.error || !artifactResponse.error;
    if (!overview.ok && !directLibraryAvailable) {
      if (!cached) setItems([]);
      setAuthRequired(overview.status === 401);
      setFailed(overview.status !== 401);
      setLoading(false);
      return;
    }
    setAuthRequired(false);
    const data = overview.data;
    const worksById = new Map<string, WorkItem>();
    const rawWorks: WorkItem[] = [
      ...(((creationResponse.data as WorkItem[] | null) || []).map((item) => ({
        ...item,
        meta: { ...(item.meta || {}), library_table: "work" },
      }))),
      ...(((assetResponse.data as AssetItem[] | null) || []).map(assetAsWork)),
      ...(data?.works || []).map((item) => ({
        ...item,
        meta: { ...(item.meta || {}), library_table: "work" },
      })),
      ...(data?.assets || []).map(assetAsWork),
    ];
    rawWorks.forEach((work) => {
      const table = String(work.meta?.library_table || "work");
      worksById.set(`${table}:${work.id}`, work);
    });
    const works = [...worksById.values()];
    const artifactsById = new Map<string, LibraryArtifactRow>();
    for (const artifact of [
      ...((data?.artifacts || []) as LibraryArtifactRow[]),
      ...((artifactResponse.data as LibraryArtifactRow[] | null) || []),
    ]) {
      if (artifact?.id) artifactsById.set(artifact.id, artifact);
    }
    const artifacts = [...artifactsById.values()];
    const nextItems = buildLibraryItems(works, artifacts);
    setItems(nextItems);
    libraryCache.set(userId, {
      items: nextItems,
      cachedAt: Date.now(),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  const lastActionNonceRef = useRef("");
  useEffect(() => {
    if (!action?.nonce || lastActionNonceRef.current === action.nonce) return;
    lastActionNonceRef.current = action.nonce;
    // A result card can be clicked immediately after its durable artifact row
    // is inserted. Revalidate the per-user cache; WorkspaceLibrary retries the
    // same itemId/URL action when the fresh entry list arrives, then opens it.
    void load();
  }, [action?.nonce, load]);

  const removeItem = useCallback(async (item: LibraryItem) => {
    const table = String(item.meta.library_table || "");
    const artifactId =
      typeof item.meta.artifact_id === "string"
        ? item.meta.artifact_id
        : item.source === "artifact"
          ? item.id
          : "";
    const requests: Array<Promise<{ ok: boolean; error?: string }>> = [];
    if (item.source === "creation") {
      requests.push(
        table === "asset" ? deleteAsset(item.id) : deleteWork(item.id),
      );
    }
    if (artifactId) requests.push(deleteArtifact(artifactId));
    const results = await Promise.all(requests);
    const rejected = results.find((result) => !result.ok);
    if (rejected) {
      throw new Error(rejected.error || "删除失败，请重试。");
    }
    setItems((current) => {
      const next = current.filter((entry) => entry.key !== item.key);
      const userId = cacheUserIdRef.current;
      if (userId) {
        libraryCache.set(userId, {
          items: next,
          cachedAt: Date.now(),
        });
      }
      return next;
    });
  }, []);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      const queue = Array.from(files || []);
      if (!queue.length || uploading) return;
      setUploading(true);
      setUploadError("");
      let failedCount = 0;
      for (let index = 0; index < queue.length; index += 1) {
        const file = queue[index];
        setUploadProgress(`${index + 1}/${queue.length} · ${file.name}`);
        const result = await uploadFile(file, {
          siteId: siteId || "home",
          title: file.name,
        });
        if (!result.ok) {
          failedCount += 1;
          setUploadError(result.error || "文件上传失败，请重试。");
        }
      }
      setUploading(false);
      setUploadProgress("");
      if (failedCount < queue.length) await load();
    },
    [load, siteId, uploading],
  );

  const entries = useMemo(
    () => [
      ...(onlyFavorites ? [] : featuredEntries),
      ...items
        .filter(
          (item) =>
            (!onlyFavorites || item.favorite) &&
            (!itemFilter || itemFilter(item)),
        )
        .map((item) => toEntry(item, () => removeItem(item))),
    ],
    [featuredEntries, itemFilter, items, onlyFavorites, removeItem],
  );
  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <label className="inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,#fafaf9)]">
        <input
          type="file"
          multiple
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            void handleUpload(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        {tt(uploading ? "上传中…" : "上传文件")}
      </label>
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading || uploading}
        className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,#fafaf9)] disabled:opacity-50"
      >
        {tt(loading ? "加载中…" : "刷新")}
      </button>
    </div>
  );

  return (
    <div className="relative h-full min-h-0">
      <WorkspaceLibrary
        entries={entries}
        accent={accent}
        action={action}
        category={category}
        onCategoryChange={onCategoryChange}
        taskId={taskId}
        siteId={siteId}
        onOpenItem={onOpenItem}
        openAdvancedOnSelect={openAdvancedOnSelect}
        toolbarActions={toolbar}
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
        plain={plain}
      />
      {(uploadProgress || uploadError) && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-[var(--fg,#1c1917)] px-3 py-2 text-[11px] text-[var(--card,#fff)] shadow-lg">
          {uploadError || uploadProgress}
        </div>
      )}
    </div>
  );
}
