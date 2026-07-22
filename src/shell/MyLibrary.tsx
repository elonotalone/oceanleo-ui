"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  uploadFile,
  type AssetItem,
  type Creation,
  type FileItem,
} from "../lib/database";
import {
  artifactProjectionToLibraryItem,
  artifactTypeForLibraryKind,
  inferLibraryKind,
  isDurableLibraryItem,
  libraryItemIdentityKey,
  type LibraryItem,
  type LibraryKind,
} from "./library-data";
import {
  ARTIFACT_LIBRARY_CHANGE_EVENT,
  ensureArtifact,
  listFavoriteArtifacts,
  listMyArtifacts,
  retireArtifact,
} from "./artifact-client";
import {
  artifactIsVisible,
  isEnsureableTransient,
  normalizeArtifactProjectionResult,
  type TransientGenerationResult,
} from "./artifact-contract";
import {
  WorkspaceLibrary,
  type WorkspaceLibraryEntry,
  workspaceEntryFromLibraryItem,
} from "./WorkspaceLibrary";
import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import type { WorkbenchMaterialActionAvailability } from "./workbench-material-registry";
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

function dedupeDurableItems(items: readonly LibraryItem[]): LibraryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!isDurableLibraryItem(item)) return false;
    const identity = libraryItemIdentityKey(item);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function dedupeWorkspaceEntries(
  entries: readonly WorkspaceLibraryEntry[],
): WorkspaceLibraryEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.libraryItem || !isDurableLibraryItem(entry.libraryItem)) {
      return false;
    }
    const identity = libraryItemIdentityKey(entry.libraryItem);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function myLibraryFailure(status: number | undefined, error = ""): {
  title: string;
  description: string;
} {
  if (status === 401) {
    return {
      title: "登录后查看我的库",
      description: "登录任意 OceanLeo 站点后，跨站作品会在这里汇总。",
    };
  }
  if (status === 403) {
    return {
      title: "当前账号无权访问我的库",
      description: "服务端拒绝了 owner-scoped 我的库请求，请确认账号权限。",
    };
  }
  if (status === 503) {
    return {
      title: "我的库服务暂时不可用",
      description: "服务端正在维护或过载，请稍后刷新。",
    };
  }
  return {
    title: "我的库响应无效",
    description: error || "服务端没有返回完整、可验证的 rich artifact 列表。",
  };
}

function libraryAuthorityLost(result: {
  status?: number;
  code?: string;
}): boolean {
  return (
    result.status === 401 ||
    result.status === 403 ||
    result.code === "unauthorized" ||
    result.code === "forbidden" ||
    result.code === "invalid-response"
  );
}

type LibraryPageResult = Awaited<ReturnType<typeof listMyArtifacts>>;

function rejectedLibraryPage(reason: unknown): LibraryPageResult {
  return {
    ok: false,
    error:
      reason instanceof Error
        ? reason.message
        : "我的库请求失败，请重试。",
    code: "network-error",
    status: 0,
    retryable: true,
  };
}

function favoriteRefreshWarning(result: LibraryPageResult): string {
  return result.status === 503
    ? "收藏素材服务暂时不可用；已保留上次验证成功的收藏。"
    : `收藏素材暂时未刷新：${result.error || "请稍后重试。"}`;
}

function favoriteItemAllowed(
  item: LibraryItem,
  ownerPrincipalId: string,
): boolean {
  return Boolean(
    ownerPrincipalId &&
      isDurableLibraryItem(item) &&
      item.favorite &&
      artifactIsVisible(item.artifact) &&
      (item.artifact.owner.visibility === "public" ||
        (item.artifact.owner.visibility === "private" &&
          item.artifact.owner.principalId === ownerPrincipalId)),
  );
}

function withFavoriteState(
  item: LibraryItem,
  favorite: boolean,
): LibraryItem {
  return isDurableLibraryItem(item)
    ? {
        ...item,
        favorite,
        artifact: {
          ...item.artifact,
          favorite,
        },
      }
    : item;
}

export function canonicalUploadLibraryItem(
  uploaded: FileItem,
): { ok: true; item: LibraryItem } | { ok: false; error: string } {
  const normalized = normalizeArtifactProjectionResult(uploaded.artifact);
  if (!normalized.ok || !normalized.data) {
    return {
      ok: false,
      error:
        normalized.error ||
        "上传响应 file.artifact 不是 canonical durable projection。",
    };
  }
  const artifactId = String(uploaded.artifact_id || "").trim();
  const revisionId = String(uploaded.revision_id || "").trim();
  if (
    !artifactId ||
    !revisionId ||
    normalized.data.artifactId !== artifactId ||
    normalized.data.revisionId !== revisionId ||
    !artifactIsVisible(normalized.data)
  ) {
    return {
      ok: false,
      error:
        "上传响应的 file.artifact、artifact_id、revision_id 或 ACL/integrity 不一致。",
    };
  }
  return {
    ok: true,
    item: artifactProjectionToLibraryItem(normalized.data),
  };
}

export function legacyUploadTransient(
  uploaded: FileItem,
  file: File,
  siteId: string,
):
  | { ok: true; transient: TransientGenerationResult }
  | { ok: false; error: string } {
  const resultId = String(uploaded.id || "").trim();
  const payloadDigest = String(
    uploaded.meta?.content_digest || uploaded.meta?.sha256 || "",
  ).trim();
  const renditionUrl = String(
    uploaded.thumb_url || uploaded.url || "",
  ).trim();
  if (
    !resultId ||
    resultId.toLowerCase() === "undefined" ||
    resultId.toLowerCase() === "null" ||
    !payloadDigest ||
    !renditionUrl
  ) {
    return {
      ok: false,
      error:
        "旧上传响应缺少 canonical file.artifact，且没有稳定 id/content digest/rendition；已拒绝构造 transient。",
    };
  }
  const kind = inferLibraryKind({
    kind: uploaded.media_type,
    mediaType: uploaded.media_type,
    url: uploaded.url,
    siteId: uploaded.site_id,
    meta: uploaded.meta,
  });
  const transient: TransientGenerationResult = {
    schema: "oceanleo.transient-generation.v1",
    operation: "upload",
    resultId,
    idempotencyKey: `artifact-upload:${resultId}`,
    payloadDigest,
    artifactType: artifactTypeForLibraryKind(kind),
    title: uploaded.title || file.name,
    renditionUrl,
    sourceUrl: uploaded.url,
    sourceFormat:
      file.name.split(".").pop()?.toLowerCase() || file.type,
    siteId: uploaded.site_id || siteId || "home",
    provenance: {
      source_kind: "user_upload",
      upload_id: resultId,
      rights_attested: true,
    },
  };
  return isEnsureableTransient(transient)
    ? { ok: true, transient }
    : {
        ok: false,
        error:
          "旧上传响应无法形成完整的 durable ensure receipt；已拒绝继续。",
      };
}

export function assetAsWork(item: AssetItem): Creation {
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

function toEntry(
  item: LibraryItem,
  onDelete?: () => Promise<void>,
) {
  const uploaded = item.meta.library_source === "upload";
  const userAsset = item.meta.library_source === "asset";
  const publicFavorite =
    isDurableLibraryItem(item) &&
    item.favorite &&
    item.artifact.owner.visibility === "public";
  return workspaceEntryFromLibraryItem(item, {
    category: publicFavorite
      ? "收藏素材"
      : uploaded
        ? "上传文件"
        : userAsset
          ? "我的素材"
          : KIND_CATEGORY[item.kind],
    description:
      (publicFavorite
        ? "公共收藏"
        : uploaded
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
    ...(onDelete ? { onDelete } : {}),
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
  materialActions?: readonly WorkbenchMaterialAction[];
  onMaterialAction?: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
  materialActionAvailable?: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => boolean;
  materialActionEvidence?: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => WorkbenchMaterialActionAvailability;
  primaryMaterialAction?: WorkbenchMaterialAction;
  draggableMaterials?: boolean;
  onMaterialDragStart?: (item: LibraryItem) => void;
  onMaterialDragEnd?: () => void;
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
  materialActions,
  onMaterialAction,
  materialActionAvailable,
  materialActionEvidence,
  primaryMaterialAction,
  draggableMaterials,
  onMaterialDragStart,
  onMaterialDragEnd,
}: MyLibraryProps) {
  const tt = useUI();
  const [ownedItems, setOwnedItems] = useState<LibraryItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failureStatus, setFailureStatus] = useState<number | undefined>();
  const [failureMessage, setFailureMessage] = useState("");
  const [ownerPrincipalId, setOwnerPrincipalId] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [favoriteNextCursor, setFavoriteNextCursor] =
    useState<string | null>(null);
  const [favoriteWarning, setFavoriteWarning] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [standaloneEditorItem, setStandaloneEditorItem] =
    useState<LibraryItem | null>(null);

  const requestEpochRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const favoritesOwnerRef = useRef("");
  const items = useMemo(() => {
    const favoriteIdentity = new Set(
      favoriteItems.map(libraryItemIdentityKey),
    );
    return dedupeDurableItems([
      ...ownedItems.map((item) =>
        favoriteIdentity.has(libraryItemIdentityKey(item))
          ? withFavoriteState(item, true)
          : item,
      ),
      ...favoriteItems,
    ]);
  }, [favoriteItems, ownedItems]);

  const clearLibraryAuthority = useCallback(() => {
    setOwnedItems([]);
    setFavoriteItems([]);
    setOwnerPrincipalId("");
    setNextCursor(null);
    setFavoriteNextCursor(null);
    setStandaloneEditorItem(null);
    favoritesOwnerRef.current = "";
  }, []);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const epoch = ++requestEpochRef.current;
    setFailed(false);
    setFailureStatus(undefined);
    setFailureMessage("");
    setFavoriteWarning("");
    setLoading(true);
    setLoadingMore(false);
    const [mineSettled, favoritesSettled] = await Promise.allSettled([
        listMyArtifacts({
          limit: 100,
          signal: controller.signal,
        }),
        listFavoriteArtifacts({
          limit: 100,
          signal: controller.signal,
        }),
      ]);
    if (controller.signal.aborted || epoch !== requestEpochRef.current) {
      return;
    }
    const mineResult =
      mineSettled.status === "fulfilled"
        ? mineSettled.value
        : rejectedLibraryPage(mineSettled.reason);
    const favoritesResult =
      favoritesSettled.status === "fulfilled"
        ? favoritesSettled.value
        : rejectedLibraryPage(favoritesSettled.reason);
    if (!mineResult.ok || !mineResult.data) {
      if (libraryAuthorityLost(mineResult)) {
        clearLibraryAuthority();
      }
      setAuthRequired(mineResult.status === 401);
      setFailed(mineResult.status !== 401);
      setFailureStatus(mineResult.status);
      setFailureMessage(mineResult.error || "");
      setFavoriteWarning("");
      setLoading(false);
      return;
    }
    const mineOwnerPrincipalId =
      mineResult.data.ownerPrincipalId || "";
    if (!mineOwnerPrincipalId) {
      clearLibraryAuthority();
      setAuthRequired(false);
      setFailed(true);
      setFailureStatus(502);
      setFailureMessage(
        "我的库响应缺少 ownerPrincipalId，已拒绝显示。",
      );
      setLoading(false);
      return;
    }
    if (!favoritesResult.ok || !favoritesResult.data) {
      if (libraryAuthorityLost(favoritesResult)) {
        clearLibraryAuthority();
        setAuthRequired(favoritesResult.status === 401);
        setFailed(favoritesResult.status !== 401);
        setFailureStatus(favoritesResult.status);
        setFailureMessage(favoritesResult.error || "");
        setLoading(false);
        return;
      }
      setOwnedItems(dedupeDurableItems(mineResult.data.items));
      setOwnerPrincipalId(mineOwnerPrincipalId);
      setNextCursor(mineResult.data.nextCursor);
      if (favoritesOwnerRef.current !== mineOwnerPrincipalId) {
        setFavoriteItems([]);
        setFavoriteNextCursor(null);
        favoritesOwnerRef.current = "";
      }
      setAuthRequired(false);
      setFailed(false);
      setFailureStatus(undefined);
      setFailureMessage("");
      setFavoriteWarning(favoriteRefreshWarning(favoritesResult));
      setLoading(false);
      return;
    }
    if (
      mineOwnerPrincipalId !==
      favoritesResult.data.ownerPrincipalId
    ) {
      clearLibraryAuthority();
      setAuthRequired(false);
      setFailed(true);
      setFailureStatus(502);
      setFailureMessage(
        "我的库与收藏素材 ownerPrincipalId 不一致，已拒绝合并。",
      );
      setLoading(false);
      return;
    }
    setAuthRequired(false);
    setFailed(false);
    setFailureStatus(undefined);
    setFailureMessage("");
    setFavoriteWarning("");
    setOwnerPrincipalId(mineOwnerPrincipalId);
    setOwnedItems(dedupeDurableItems(mineResult.data.items));
    setFavoriteItems(dedupeDurableItems(favoritesResult.data.items));
    setNextCursor(mineResult.data.nextCursor);
    setFavoriteNextCursor(favoritesResult.data.nextCursor);
    favoritesOwnerRef.current = mineOwnerPrincipalId;
    setLoading(false);
  }, [clearLibraryAuthority]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  useEffect(
    () => () => {
      loadAbortRef.current?.abort();
      loadMoreAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const refresh = (event: Event) => {
      const invalidatePendingReads = () => {
        loadAbortRef.current?.abort();
        loadMoreAbortRef.current?.abort();
        requestEpochRef.current += 1;
        setLoading(false);
        setLoadingMore(false);
      };
      const detail = (event as CustomEvent<{
        action?: string;
        artifactId?: string;
        revisionId?: string;
        favorite?: boolean;
        item?: LibraryItem;
      }>).detail;
      if (detail?.action === "retire" && detail.artifactId) {
        invalidatePendingReads();
        const keep = (item: LibraryItem) =>
          !isDurableLibraryItem(item) ||
          item.artifactId !== detail.artifactId;
        setOwnedItems((current) =>
          current.filter(keep),
        );
        setFavoriteItems((current) =>
          current.filter(
            keep,
          ),
        );
        return;
      }
      if (
        detail?.action === "favorite" &&
        detail.artifactId &&
        detail.revisionId
      ) {
        invalidatePendingReads();
        setFavoriteNextCursor(null);
        if (ownerPrincipalId) {
          favoritesOwnerRef.current = ownerPrincipalId;
        }
        const matches = (item: LibraryItem) =>
          isDurableLibraryItem(item) &&
          item.artifactId === detail.artifactId &&
          item.revisionId === detail.revisionId;
        setOwnedItems((current) =>
          current.map((item) =>
            matches(item)
              ? withFavoriteState(item, detail.favorite === true)
              : item,
          ),
        );
        if (detail.favorite === true) {
          if (
            detail.item &&
            isDurableLibraryItem(detail.item) &&
            detail.item.artifactId === detail.artifactId &&
            detail.item.revisionId === detail.revisionId &&
            favoriteItemAllowed(detail.item, ownerPrincipalId)
          ) {
            setFavoriteItems((current) =>
              dedupeDurableItems([
                detail.item!,
                ...current.filter((item) => !matches(item)),
              ]),
            );
            void load();
          } else {
            void load();
          }
        } else {
          setFavoriteItems((current) =>
            current.filter((item) => !matches(item)),
          );
          void load();
        }
        return;
      }
      if (
        (detail?.action === "ensure" ||
          detail?.action === "upload" ||
          detail?.action === "fork") &&
        detail.item &&
        isDurableLibraryItem(detail.item) &&
        artifactIsVisible(detail.item.artifact) &&
        detail.item.artifact.owner.principalId === ownerPrincipalId &&
        detail.item.artifact.owner.visibility !== "public"
      ) {
        invalidatePendingReads();
        setOwnedItems((current) =>
          dedupeDurableItems([
            detail.item!,
            ...current.filter(
              (item) =>
                !isDurableLibraryItem(item) ||
                item.artifactId !== detail.item!.artifactId,
            ),
          ]),
        );
        return;
      }
      void load();
    };
    window.addEventListener(ARTIFACT_LIBRARY_CHANGE_EVENT, refresh);
    return () =>
      window.removeEventListener(ARTIFACT_LIBRARY_CHANGE_EVENT, refresh);
  }, [load, ownerPrincipalId]);

  const lastActionNonceRef = useRef("");
  useEffect(() => {
    if (!action?.nonce || lastActionNonceRef.current === action.nonce) return;
    lastActionNonceRef.current = action.nonce;
    // A result card can be clicked immediately after its durable artifact row
    // is inserted. Revalidate the per-user cache; WorkspaceLibrary retries the
    // same itemId/URL action when the fresh entry list arrives, then opens it.
    void load();
  }, [action?.nonce, load]);

  const loadMore = useCallback(async () => {
    if (
      (!nextCursor && !favoriteNextCursor) ||
      loadingMore ||
      loading
    ) {
      return;
    }
    const mineCursor = nextCursor;
    const favoritesCursor = favoriteNextCursor;
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    const epoch = requestEpochRef.current;
    setLoadingMore(true);
    const [mineSettled, favoritesSettled] = await Promise.allSettled([
      mineCursor
        ? listMyArtifacts({
            cursor: mineCursor,
            limit: 100,
            signal: controller.signal,
          })
        : Promise.resolve(null),
      favoritesCursor
        ? listFavoriteArtifacts({
            cursor: favoritesCursor,
            limit: 100,
            signal: controller.signal,
          })
        : Promise.resolve(null),
    ]);
    if (
      controller.signal.aborted ||
      epoch !== requestEpochRef.current
    ) {
      return;
    }
    const mineResult: LibraryPageResult | null =
      mineSettled.status === "fulfilled"
        ? mineSettled.value
        : rejectedLibraryPage(mineSettled.reason);
    const favoritesResult: LibraryPageResult | null =
      favoritesSettled.status === "fulfilled"
        ? favoritesSettled.value
        : rejectedLibraryPage(favoritesSettled.reason);
    const mineAuthorityError = Boolean(
      mineResult &&
        ((mineResult.ok && !mineResult.data) ||
          (!mineResult.ok && libraryAuthorityLost(mineResult)) ||
          (mineResult.data &&
            mineResult.data.ownerPrincipalId !== ownerPrincipalId)),
    );
    const favoritesAuthorityError = Boolean(
      favoritesResult &&
        ((favoritesResult.ok && !favoritesResult.data) ||
          (!favoritesResult.ok &&
            libraryAuthorityLost(favoritesResult)) ||
          (favoritesResult.data &&
            favoritesResult.data.ownerPrincipalId !== ownerPrincipalId)),
    );
    if (mineAuthorityError || favoritesAuthorityError) {
      const result = mineAuthorityError
        ? mineResult!
        : favoritesResult!;
      clearLibraryAuthority();
      setFavoriteWarning("");
      setFailed(true);
      setFailureStatus(result.status || 502);
      setFailureMessage(
        result.error ||
          "我的库分页 owner/scope 与第一页不一致，已拒绝合并。",
      );
      setAuthRequired(result.status === 401);
      setLoadingMore(false);
      return;
    }
    if (mineResult && (!mineResult.ok || !mineResult.data)) {
      setAuthRequired(false);
      setFailed(true);
      setFailureStatus(mineResult.status);
      setFailureMessage(mineResult.error || "我的库继续加载失败。");
      setLoadingMore(false);
      return;
    }
    if (mineResult?.data) {
      setOwnedItems((current) =>
        dedupeDurableItems([...current, ...mineResult.data!.items]),
      );
      setNextCursor(mineResult.data.nextCursor);
    }
    if (
      favoritesResult &&
      (!favoritesResult.ok || !favoritesResult.data)
    ) {
      if (favoritesOwnerRef.current !== ownerPrincipalId) {
        setFavoriteItems([]);
        setFavoriteNextCursor(null);
        favoritesOwnerRef.current = "";
      }
      setAuthRequired(false);
      setFailed(false);
      setFailureStatus(undefined);
      setFailureMessage("");
      setFavoriteWarning(favoriteRefreshWarning(favoritesResult));
      setLoadingMore(false);
      return;
    }
    if (favoritesResult?.data) {
      setFavoriteItems((current) =>
        dedupeDurableItems([
          ...current,
          ...favoritesResult.data!.items,
        ]),
      );
      setFavoriteNextCursor(favoritesResult.data.nextCursor);
      favoritesOwnerRef.current = ownerPrincipalId;
      setFavoriteWarning("");
    }
    setAuthRequired(false);
    setFailed(false);
    setFailureStatus(undefined);
    setFailureMessage("");
    setLoadingMore(false);
  }, [
    clearLibraryAuthority,
    favoriteNextCursor,
    loading,
    loadingMore,
    nextCursor,
    ownerPrincipalId,
  ]);

  const removeItem = useCallback(async (item: LibraryItem) => {
    if (!isDurableLibraryItem(item)) {
      throw new Error("缺少 durable artifact identity，不能按 URL 猜测删除对象。");
    }
    const result = await retireArtifact(item);
    if (!result.ok || result.data?.retired !== true) {
      throw new Error(result.error || "删除失败，请重试。");
    }
    setOwnedItems((current) => {
      return current.filter(
        (entry) =>
          !isDurableLibraryItem(entry) ||
          entry.artifactId !== item.artifactId,
      );
    });
    setFavoriteItems((current) =>
      current.filter(
        (entry) =>
          !isDurableLibraryItem(entry) ||
          entry.artifactId !== item.artifactId,
      ),
    );
  }, []);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      const queue = Array.from(files || []);
      if (!queue.length || uploading) return;
      if (!ownerPrincipalId) {
        setUploadError(
          "我的库尚未取得当前 ownerPrincipalId，已拒绝上传后猜测归属。",
        );
        return;
      }
      setUploading(true);
      setUploadError("");
      try {
        for (let index = 0; index < queue.length; index += 1) {
          const file = queue[index];
          setUploadProgress(`${index + 1}/${queue.length} · ${file.name}`);
          const uploadIdempotencyKey = [
            "library-upload-v1",
            siteId || "home",
            file.name,
            file.size,
            file.lastModified,
          ].join(":");
          const result = await uploadFile(file, {
            siteId: siteId || "home",
            title: file.name,
            idempotencyKey: uploadIdempotencyKey,
          });
          if (!result.ok || !result.data?.file) {
            setUploadError(result.error || "文件上传失败，请重试。");
            continue;
          }
          const uploaded = result.data.file;
          const hasCanonicalContract =
            uploaded.artifact !== undefined ||
            Boolean(uploaded.artifact_id) ||
            Boolean(uploaded.revision_id);
          let uploadedItem: LibraryItem | null = null;
          if (hasCanonicalContract) {
            const canonical = canonicalUploadLibraryItem(uploaded);
            if (!canonical.ok) {
              setUploadError(canonical.error);
              continue;
            }
            uploadedItem = canonical.item;
          } else {
            const legacy = legacyUploadTransient(
              uploaded,
              file,
              siteId,
            );
            if (!legacy.ok) {
              setUploadError(legacy.error);
              continue;
            }
            const ensured = await ensureArtifact(legacy.transient);
            if (!ensured.ok || !ensured.data) {
              setUploadError(
                ensured.error ||
                  "旧上传文件已落盘，但 durable artifact ensure 失败。",
              );
              continue;
            }
            uploadedItem = ensured.data;
          }
          if (
            !uploadedItem ||
            !isDurableLibraryItem(uploadedItem) ||
            !artifactIsVisible(uploadedItem.artifact) ||
            uploadedItem.artifact.owner.principalId !==
              ownerPrincipalId ||
            uploadedItem.artifact.owner.visibility === "public"
          ) {
            setUploadError(
              "上传 artifact 的 owner/scope/ACL 与当前我的库不一致，已拒绝显示。",
            );
            continue;
          }
          setOwnedItems((current) =>
            dedupeDurableItems([
              uploadedItem!,
              ...current.filter(
                (item) =>
                  !isDurableLibraryItem(item) ||
                  item.artifactId !== uploadedItem!.artifactId,
              ),
            ]),
          );
          if (hasCanonicalContract && typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(ARTIFACT_LIBRARY_CHANGE_EVENT, {
                detail: {
                  action: "upload",
                  artifactId: uploadedItem.artifactId,
                  revisionId: uploadedItem.revisionId,
                  item: uploadedItem,
                },
              }),
            );
          }
        }
      } catch (caught) {
        setUploadError(
          caught instanceof Error
            ? caught.message
            : "上传处理失败，请重试。",
        );
      } finally {
        setUploading(false);
        setUploadProgress("");
      }
    },
    [ownerPrincipalId, siteId, uploading],
  );

  const entries = useMemo(
    () =>
      dedupeWorkspaceEntries([
        ...items
          .filter(
            (item) =>
              (!onlyFavorites || item.favorite) &&
              (!itemFilter || itemFilter(item)),
          )
          .map((item) => {
            const owned =
              isDurableLibraryItem(item) &&
              item.artifact.owner.principalId === ownerPrincipalId &&
              item.artifact.owner.visibility !== "public";
            return toEntry(
              item,
              owned ? () => removeItem(item) : undefined,
            );
          }),
        ...(onlyFavorites
          ? []
          : featuredEntries.filter(
              (entry) =>
                entry.libraryItem &&
                isDurableLibraryItem(entry.libraryItem) &&
                entry.libraryItem.artifact.owner.visibility !== "public" &&
                Boolean(ownerPrincipalId) &&
                entry.libraryItem.artifact.owner.principalId ===
                  ownerPrincipalId &&
                items.some(
                  (item) =>
                    libraryItemIdentityKey(item) ===
                    libraryItemIdentityKey(entry.libraryItem!),
                ),
            )),
      ]),
    [
      featuredEntries,
      itemFilter,
      items,
      onlyFavorites,
      ownerPrincipalId,
      removeItem,
    ],
  );
  const failureCopy = myLibraryFailure(failureStatus, failureMessage);
  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <label className="inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,#fafaf9)]">
        <input
          type="file"
          multiple
          className="sr-only"
          disabled={
            uploading ||
            loading ||
            authRequired ||
            failed ||
            !ownerPrincipalId
          }
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
      {(nextCursor || favoriteNextCursor) && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore || loading}
          className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,#fafaf9)] disabled:opacity-50"
        >
          {tt(loadingMore ? "加载中…" : "继续加载")}
        </button>
      )}
    </div>
  );

  if (standaloneEditorItem) {
    return (
      <div className={`h-full min-h-0 ${className}`}>
        <AdvancedContentWorkbench
          key={`${standaloneEditorItem.artifactId || standaloneEditorItem.id}:${
            standaloneEditorItem.revisionId || "transient"
          }`}
          item={standaloneEditorItem}
          taskId={taskId}
          siteId={siteId || standaloneEditorItem.siteId}
          appId={siteId || "library"}
          accent={accent}
          embedded
          onSavedItem={setStandaloneEditorItem}
          onClose={() => setStandaloneEditorItem(null)}
        />
      </div>
    );
  }

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
        onOpenItem={onOpenItem || setStandaloneEditorItem}
        openAdvancedOnSelect={openAdvancedOnSelect}
        materialActions={materialActions}
        onMaterialAction={onMaterialAction}
        materialActionAvailable={materialActionAvailable}
        materialActionEvidence={materialActionEvidence}
        primaryMaterialAction={primaryMaterialAction}
        draggableMaterials={draggableMaterials}
        onMaterialDragStart={onMaterialDragStart}
        onMaterialDragEnd={onMaterialDragEnd}
        toolbarActions={toolbar}
        searchPlaceholder="搜索我的作品、收藏素材、网站、交付物和上传文件"
        emptyTitle={
          loading
            ? "正在加载我的库…"
            : authRequired || failed
              ? failureCopy.title
              : "我的库还是空的"
        }
        emptyDescription={
          authRequired || failed
            ? failureCopy.description
            : "生成作品、收藏公共素材或上传文件后，它们会自动出现在这里。"
        }
        className={className}
        plain={plain}
      />
      {failed && entries.length > 0 && (
        <div
          role="alert"
          className="absolute left-3 right-3 top-3 z-30 rounded-lg border border-rose-500/25 bg-[var(--card,#fff)] px-3 py-2 text-[11px] text-rose-700 shadow-sm"
        >
          {tt(failureCopy.title)}：{tt(failureCopy.description)}
        </div>
      )}
      {favoriteWarning && !authRequired && !failed && (
        <div
          role="alert"
          className="absolute left-3 right-3 top-3 z-30 rounded-lg border border-amber-500/25 bg-[var(--card,#fff)] px-3 py-2 text-[11px] text-amber-700 shadow-sm"
        >
          {tt(favoriteWarning)}
        </div>
      )}
      {(uploadProgress || uploadError) && (
        <div
          role={uploadError ? "alert" : "status"}
          aria-live="polite"
          className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-[var(--fg,#1c1917)] px-3 py-2 text-[11px] text-[var(--card,#fff)] shadow-lg"
        >
          {uploadError || uploadProgress}
        </div>
      )}
    </div>
  );
}
