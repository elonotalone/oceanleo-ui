"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  AUTH_STATE_EVENT,
  getUserIdSnapshot,
  type AuthStateEventDetail,
} from "../lib/auth/client";
import { APP_PAGE_TITLE_CLASS } from "./AppPageHeader";
import { LibraryToolbar } from "./LibraryLayout";
import {
  COLLECTION_ACTION_BTN_PRIMARY,
  CollectionFilterRow,
  CollectionFilterSelect,
  type CollectionViewOption,
} from "./collection-chrome";
import {
  humanLibraryUploadError,
  normalizeUploadIdempotencyKey,
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
  sortLibraryItems,
  type LibrarySort,
  type LibraryItem,
} from "./library-data";
import {
  LibraryScope,
  type LibraryScopeIntegration,
} from "./library-scope";
import {
  ARTIFACT_LIBRARY_CHANGE_EVENT,
  ensureArtifact,
  listFavoriteArtifacts,
  listMyArtifacts,
  retireArtifact,
} from "./artifact-client";
import {
  clearLibraryCurrentIdentity,
  getLibraryCurrentIdentity,
  rememberOpenedLibraryItem,
} from "./library-current-identity";
import { useLibraryEditIntent } from "./library-edit-intent";
import { libraryStandaloneEditorBinding } from "./library-edit-landing";
import {
  artifactIsVisible,
  isEnsureableTransient,
  normalizeArtifactProjectionResult,
  type TransientGenerationResult,
} from "./artifact-contract";
import {
  LIBRARY_EDITOR_CATEGORIES,
  libraryEditorCategory,
  normalizeLibraryCategory,
  translateLibraryTypeLabel,
} from "./library-editor-category";
import {
  WorkspaceLibrary,
  type WorkspaceLibraryEntry,
  workspaceEntryFromLibraryItem,
} from "./WorkspaceLibrary";
import { adoptSavedEditorItem } from "./advanced-session";
import { MaterialStandaloneEditor } from "./material-library-standalone";
import { preloadEditorFor } from "./editor-preload";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import type { WorkbenchMaterialActionAvailability } from "./workbench-material-registry";
import type { WorkspaceActionEnvelope } from "./workspace-actions";

const LIBRARY_PAGE_TYPE_OPTIONS = LIBRARY_EDITOR_CATEGORIES;

// 服务端的库结果就是用户实际拥有的内容。这里只去掉非持久项和重复项，不再用
// 一张固定 artifact type 清单替用户决定哪些内容有资格出现。
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

function myLibraryFailure(status: number | undefined): {
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
      description: "当前账号暂时无法读取这里的作品，请确认登录的是保存作品的账号。",
    };
  }
  if (status === 503) {
    return {
      title: "我的库服务暂时不可用",
      description: "服务端正在维护或过载，请稍后刷新。",
    };
  }
  return {
    title: "暂时无法加载我的库",
    description: "请稍后重试。已保存作品链接仍可单独打开。",
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

function retainableLibraryReadFailure(result: {
  status?: number;
  code?: string;
  error?: string;
}): boolean {
  if (
    result.status === 401 ||
    result.status === 403 ||
    result.code === "unauthorized" ||
    result.code === "forbidden"
  ) {
    return false;
  }
  if (
    result.code === "network-error" ||
    result.status === 0 ||
    (result.status ?? 0) >= 500
  ) {
    return true;
  }
  return (
    result.code === "invalid-response" &&
    /items envelope|暂时无法读取这份响应/.test(result.error || "")
  );
}

type LibraryPageResult = Awaited<ReturnType<typeof listMyArtifacts>>;

const DEFAULT_LIBRARY_SORT: LibrarySort = { by: "none", direction: "desc" };
const LIBRARY_SORT_PAGE_SIZE = 100;
const MAX_LIBRARY_SORT_ROWS_PER_SCOPE = 10_000;
const MAX_LIBRARY_SORT_PAGES =
  MAX_LIBRARY_SORT_ROWS_PER_SCOPE / LIBRARY_SORT_PAGE_SIZE;

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

function libraryFailureDiagnostic(result: {
  error?: string;
  diagnostic?: string;
}): string {
  return [result.error, result.diagnostic].filter(Boolean).join(" | ");
}

function libraryPageFromSettled(
  settled: PromiseSettledResult<LibraryPageResult | null>,
): LibraryPageResult | null {
  if (settled.status === "fulfilled") return settled.value;
  return rejectedLibraryPage(settled.reason);
}

async function collectCompleteLibraryPages(
  firstPage: LibraryPageResult,
  fetchPage: (offset: number, signal: AbortSignal) => Promise<LibraryPageResult>,
  ownerPrincipalId: string,
  signal: AbortSignal,
): Promise<LibraryItem[]> {
  if (!firstPage.ok || !firstPage.data) {
    throw new Error(libraryFailureDiagnostic(firstPage) || "我的库暂时无法读取。");
  }
  if (firstPage.data.ownerPrincipalId !== ownerPrincipalId) {
    throw new Error("列表归属与当前账号不一致；未对结果排序。");
  }
  const expectedTotal = firstPage.data.total;
  if (
    typeof expectedTotal !== "number" ||
    expectedTotal < 0 ||
    expectedTotal > MAX_LIBRARY_SORT_ROWS_PER_SCOPE
  ) {
    throw new Error("列表规模超过完整排序上限；未对部分结果排序。");
  }

  const items: LibraryItem[] = [];
  const seenArtifactIds = new Set<string>();
  const accountPage = (data: NonNullable<LibraryPageResult["data"]>) => {
    const rawRows =
      data.items.length +
      (data.invalidItems?.length || 0) +
      (data.diagnostics?.omittedCount || 0);
    for (const item of data.items) {
      if (!isDurableLibraryItem(item)) {
        throw new Error("完整排序页含非 durable 条目；未对部分结果排序。");
      }
      const identity = `artifact:${item.artifactId}`;
      if (seenArtifactIds.has(identity)) {
        throw new Error("列表分页出现重叠条目；未对部分结果排序。");
      }
      seenArtifactIds.add(identity);
      items.push(item);
    }
    for (const invalid of data.invalidItems || []) {
      const identity = `artifact:${invalid.artifactId}`;
      if (seenArtifactIds.has(identity)) {
        throw new Error("列表分页出现重叠坏条目；未对部分结果排序。");
      }
      seenArtifactIds.add(identity);
    }
    if (!Number.isSafeInteger(rawRows) || rawRows < 0) {
      throw new Error("列表页行数无效；未对部分结果排序。");
    }
    return rawRows;
  };
  let observedRows = accountPage(firstPage.data);
  let page = firstPage;
  let offset = 0;
  let pages = 1;
  while (page.data && page.data.nextCursor !== null) {
    if (signal.aborted) throw new Error("列表排序已取消。");
    if (pages >= MAX_LIBRARY_SORT_PAGES) {
      throw new Error("列表页数超过完整排序上限；未对部分结果排序。");
    }
    const pageRows =
      page.data.items.length +
      (page.data.invalidItems?.length || 0) +
      (page.data.diagnostics?.omittedCount || 0);
    const expectedNextOffset = offset + pageRows;
    const nextOffset = Number(page.data.nextCursor);
    if (
      !Number.isSafeInteger(nextOffset) ||
      pageRows <= 0 ||
      nextOffset !== expectedNextOffset ||
      nextOffset >= expectedTotal
    ) {
      throw new Error("列表分页游标或行数不连续；未对部分结果排序。");
    }
    const next = await fetchPage(nextOffset, signal);
    if (!next.ok || !next.data) {
      throw new Error(libraryFailureDiagnostic(next) || "列表分页未能完整读取。");
    }
    if (
      next.data.ownerPrincipalId !== ownerPrincipalId ||
      next.data.total !== expectedTotal
    ) {
      throw new Error("排序期间列表归属或总数发生变化；未合并部分结果。");
    }
    observedRows += accountPage(next.data);
    offset = nextOffset;
    page = next;
    pages += 1;
  }
  if (observedRows !== expectedTotal) {
    throw new Error("列表分页提前结束；未对部分结果排序。");
  }
  return items;
}

async function collectCompleteLibrarySnapshot(
  mineFirst: LibraryPageResult,
  favoritesFirst: LibraryPageResult,
  ownerPrincipalId: string,
  signal: AbortSignal,
): Promise<{ mine: LibraryItem[]; favorites: LibraryItem[] }> {
  if (
    !mineFirst.data ||
    !favoritesFirst.data ||
    mineFirst.data.ownerPrincipalId !== ownerPrincipalId ||
    favoritesFirst.data.ownerPrincipalId !== ownerPrincipalId
  ) {
    throw new Error("列表归属与当前账号不一致；未对结果排序。");
  }
  const [mine, favorites] = await Promise.all([
    collectCompleteLibraryPages(
      mineFirst,
      (offset, pageSignal) =>
        listMyArtifacts({ offset, limit: LIBRARY_SORT_PAGE_SIZE, signal: pageSignal }),
      ownerPrincipalId,
      signal,
    ),
    collectCompleteLibraryPages(
      favoritesFirst,
      (offset, pageSignal) =>
        listFavoriteArtifacts({ offset, limit: LIBRARY_SORT_PAGE_SIZE, signal: pageSignal }),
      ownerPrincipalId,
      signal,
    ),
  ]);
  return { mine, favorites };
}

/** Mixed `/v1/library/mine` is newest-first across all kinds, so the first
 * page is almost all games. Documents have to be fetched by type and pinned. */
type PinnedMineType = "document" | "pdf";

type PinnedMineCursors = Record<PinnedMineType, string | null>;

const EMPTY_PINNED_MINE_CURSORS: PinnedMineCursors = {
  document: null,
  pdf: null,
};

function isOwnedDocumentLibraryItem(item: LibraryItem): boolean {
  return (
    item.kind === "document" &&
    (!isDurableLibraryItem(item) ||
      item.artifact.owner.visibility !== "public")
  );
}

function documentsFirstItems(items: readonly LibraryItem[]): LibraryItem[] {
  const documents: LibraryItem[] = [];
  const rest: LibraryItem[] = [];
  for (const item of items) {
    if (isOwnedDocumentLibraryItem(item)) documents.push(item);
    else rest.push(item);
  }
  documents.sort((left, right) =>
    String(right.createdAt || "").localeCompare(String(left.createdAt || "")),
  );
  return [...documents, ...rest];
}

function pinnedMineItemsFromPage(
  result: LibraryPageResult | null,
  ownerPrincipalId: string,
  previousCursor: string | null = null,
): { items: LibraryItem[]; nextCursor: string | null } {
  if (
    !result?.ok ||
    !result.data ||
    !ownerPrincipalId ||
    result.data.ownerPrincipalId !== ownerPrincipalId
  ) {
    return { items: [], nextCursor: previousCursor };
  }
  return {
    items: result.data.items,
    nextCursor: result.data.nextCursor,
  };
}

function mergeOwnedMineItems(
  pinned: readonly LibraryItem[],
  mine: readonly LibraryItem[],
): LibraryItem[] {
  return documentsFirstItems(dedupeDurableItems([...pinned, ...mine]));
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
    category: libraryEditorCategory(item),
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
  /** Lets the full-page host expand its editor canvas without changing collection layout. */
  onEditorOpenChange?: (open: boolean) => void;
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
  /** W5 device facade + W7 fs.list task adapter for device-bound libraries. */
  libraryScope?: LibraryScopeIntegration;
  /**
   * Full-page library title. When set, title + search sit in `LibraryScope.header`.
   * Embedded shelves omit this so no page title appears.
   */
  pageTitle?: ReactNode;
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
  onEditorOpenChange,
  openAdvancedOnSelect = true,
  materialActions,
  onMaterialAction,
  materialActionAvailable,
  materialActionEvidence,
  primaryMaterialAction,
  draggableMaterials,
  onMaterialDragStart,
  onMaterialDragEnd,
  libraryScope,
  pageTitle,
}: MyLibraryProps) {
  const tt = useUI();
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryView, setLibraryView] = useState<"grid" | "list">("grid");
  const [detailOpen, setDetailOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return Boolean(new URLSearchParams(window.location.search).get("item"));
    } catch {
      return false;
    }
  });
  const [internalCategory, setInternalCategory] = useState(category ?? "all");
  const [favoritesOnly, setFavoritesOnly] = useState(onlyFavorites);
  const [ownedItems, setOwnedItems] = useState<LibraryItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUsableLibrarySnapshot, setHasUsableLibrarySnapshot] =
    useState(false);
  const hasUsableLibrarySnapshotRef = useRef(false);
  const [librarySort, setLibrarySort] =
    useState<LibrarySort>(DEFAULT_LIBRARY_SORT);
  const librarySortRef = useRef(librarySort);
  const updateLibrarySort = useCallback((nextSort: LibrarySort) => {
    librarySortRef.current = nextSort;
    setLibrarySort(nextSort);
  }, []);
  const [sortLoading, setSortLoading] = useState(false);
  const [sortWarning, setSortWarning] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failureStatus, setFailureStatus] = useState<number | undefined>();
  const [failureMessage, setFailureMessage] = useState("");
  const [ownerPrincipalId, setOwnerPrincipalId] = useState("");
  const ownerPrincipalIdRef = useRef("");
  const [restoreGeneration, setRestoreGeneration] = useState(0);
  const authUserIdRef = useRef<string | null | undefined>(undefined);
  const authSyncEpochRef = useRef(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pinnedNextCursors, setPinnedNextCursors] =
    useState<PinnedMineCursors>(EMPTY_PINNED_MINE_CURSORS);
  const [favoriteNextCursor, setFavoriteNextCursor] =
    useState<string | null>(null);
  const [favoriteWarning, setFavoriteWarning] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [retryableUploadFiles, setRetryableUploadFiles] = useState<File[]>([]);
  const [standaloneEditorItem, setStandaloneEditorItem] =
    useState<LibraryItem | null>(null);
  useEffect(() => {
    onEditorOpenChange?.(Boolean(standaloneEditorItem));
  }, [onEditorOpenChange, standaloneEditorItem]);
  // 「预览&编辑」深链指名的那一份。官方模板素材不属于当前用户，不会出现在 `items`
  // 里，所以按 id 取回来后要自己挂上去，右栏才有东西可选中（详见 library-edit-intent）。
  const [previewIntentItem, setPreviewIntentItem] =
    useState<LibraryItem | null>(null);
  const previewRestoreRef = useRef<{
    item: LibraryItem;
    principalId: string;
  } | null>(null);

  const clearPreviewIntent = useCallback(() => {
    previewRestoreRef.current = null;
    setPreviewIntentItem(null);
  }, []);

  const rememberPreviewIntent = useCallback(
    (item: LibraryItem) => {
      previewRestoreRef.current = {
        item,
        // Only the current auth snapshot can authorize retention across a
        // transient list failure. The API owner id is not an auth snapshot.
        principalId: authUserIdRef.current || "",
      };
      setPreviewIntentItem(item);
    },
    [],
  );

  const reconcilePreviewPrincipal = useCallback((principalId: string) => {
    const restored = previewRestoreRef.current;
    const currentAuthUserId = authUserIdRef.current;
    if (!restored || !currentAuthUserId || restored.principalId === currentAuthUserId) return;
    if (
      !restored.principalId &&
      isDurableLibraryItem(restored.item) &&
      (restored.item.artifact.owner.visibility === "public" ||
        restored.item.artifact.owner.principalId === principalId)
    ) {
      previewRestoreRef.current = { ...restored, principalId: currentAuthUserId };
      return;
    }
    previewRestoreRef.current = null;
    setPreviewIntentItem(null);
  }, []);

  useEffect(() => {
    if (!failed || !failureMessage) return;
    // Keep the response detail for diagnosis without showing transport/schema
    // terminology in the library's user-facing failure state.
    console.warn("[OceanLeo Library] list request failed", {
      status: failureStatus,
      message: failureMessage,
    });
  }, [failed, failureMessage, failureStatus]);

  useEffect(() => {
    if (category !== undefined) setInternalCategory(category);
  }, [category]);
  useEffect(() => {
    setFavoritesOnly(onlyFavorites);
  }, [onlyFavorites]);
  const activeCategory = normalizeLibraryCategory(category ?? internalCategory);
  const changeCategory = (next: string) => {
    if (category === undefined) setInternalCategory(next);
    onCategoryChange?.(next);
  };
  const favoriteViewOptions: CollectionViewOption[] = [
    {
      id: "favorites",
      label: tt("仅看收藏"),
      checked: favoritesOnly,
      onSelect: () => setFavoritesOnly((value) => !value),
    },
  ];

  const requestEpochRef = useRef(0);
  const sortEpochRef = useRef(0);
  const sortAbortRef = useRef<AbortController | null>(null);
  const completeSortOwnerRef = useRef("");
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const favoritesOwnerRef = useRef("");
  const items = useMemo(() => {
    const favoriteIdentity = new Set(
      favoriteItems.map(libraryItemIdentityKey),
    );
    return documentsFirstItems(
      dedupeDurableItems([
        ...ownedItems.map((item) =>
          favoriteIdentity.has(libraryItemIdentityKey(item))
            ? withFavoriteState(item, true)
            : item,
        ),
        ...favoriteItems,
      ]),
    );
  }, [favoriteItems, ownedItems]);

  const clearLibraryAuthority = useCallback((preservePreviewForPrincipal = "") => {
    sortAbortRef.current?.abort();
    sortAbortRef.current = null;
    sortEpochRef.current += 1;
    completeSortOwnerRef.current = "";
    setOwnedItems([]);
    setFavoriteItems([]);
    hasUsableLibrarySnapshotRef.current = false;
    setHasUsableLibrarySnapshot(false);
    updateLibrarySort(DEFAULT_LIBRARY_SORT);
    setSortLoading(false);
    setSortWarning("");
    setOwnerPrincipalId("");
    ownerPrincipalIdRef.current = "";
    setNextCursor(null);
    setPinnedNextCursors(EMPTY_PINNED_MINE_CURSORS);
    setFavoriteNextCursor(null);
    setStandaloneEditorItem(null);
    if (!preservePreviewForPrincipal ||
        previewRestoreRef.current?.principalId !== preservePreviewForPrincipal) {
      clearPreviewIntent();
    }
    // Also abort a delayed direct-item GET even when this same principal may
    // keep the already-restored item during a list transport/schema failure.
    setRestoreGeneration((current) => current + 1);
    favoritesOwnerRef.current = "";
  }, [clearPreviewIntent, updateLibrarySort]);

  const load = useCallback(async () => {
    sortAbortRef.current?.abort();
    sortAbortRef.current = null;
    sortEpochRef.current += 1;
    let requestedSort = librarySortRef.current;
    setSortLoading(requestedSort.by !== "none");
    setSortWarning("");
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
    const [documentSettled, pdfSettled, mineSettled, favoritesSettled] =
      await Promise.allSettled([
        listMyArtifacts({
          artifactType: "document",
          limit: 100,
          signal: controller.signal,
        }),
        listMyArtifacts({
          artifactType: "pdf",
          limit: 100,
          signal: controller.signal,
        }),
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
      libraryPageFromSettled(mineSettled) ??
      rejectedLibraryPage(undefined);
    const favoritesResult =
      libraryPageFromSettled(favoritesSettled) ??
      rejectedLibraryPage(undefined);
    const verifiedAuthUserId = authUserIdRef.current;
    if (!mineResult.ok || !mineResult.data) {
      let sameVerifiedAccount = hasUsableLibrarySnapshotRef.current;
      if (hasUsableLibrarySnapshotRef.current) {
        const currentSnapshot = await getUserIdSnapshot();
        if (controller.signal.aborted || epoch !== requestEpochRef.current) {
          return;
        }
        if (currentSnapshot.available) {
          if (verifiedAuthUserId) {
            sameVerifiedAccount =
              currentSnapshot.userId === verifiedAuthUserId;
          } else {
            sameVerifiedAccount = currentSnapshot.userId !== null;
          }
          authUserIdRef.current = currentSnapshot.userId;
        }
      }
      const mayRetainPreview = Boolean(
        sameVerifiedAccount &&
          retainableLibraryReadFailure(mineResult) &&
          verifiedAuthUserId &&
          previewRestoreRef.current?.principalId === verifiedAuthUserId,
      );
      const keepVerifiedCache = Boolean(
        sameVerifiedAccount &&
          hasUsableLibrarySnapshotRef.current &&
          (mineResult.status === 401 ||
            retainableLibraryReadFailure(mineResult)),
      );
      if (libraryAuthorityLost(mineResult) && !keepVerifiedCache) {
        clearLibraryAuthority(mayRetainPreview ? verifiedAuthUserId! : "");
      } else if (!mayRetainPreview && !keepVerifiedCache) {
        clearPreviewIntent();
        setRestoreGeneration((current) => current + 1);
      }
      setAuthRequired(mineResult.status === 401 && !keepVerifiedCache);
      setFailed(keepVerifiedCache || mineResult.status !== 401);
      setFailureStatus(mineResult.status);
      setFailureMessage(libraryFailureDiagnostic(mineResult));
      setFavoriteWarning("");
      setSortLoading(false);
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
    const priorOwnerPrincipalId = ownerPrincipalIdRef.current;
    if (
      priorOwnerPrincipalId &&
      priorOwnerPrincipalId !== mineOwnerPrincipalId
    ) {
      // The authoritative API owner changed without an auth event. Treat it as
      // an account boundary before adopting any rows from the new principal.
      clearLibraryAuthority();
      requestedSort = DEFAULT_LIBRARY_SORT;
    }
    // A successful, owner-verified /mine page is a usable list snapshot. A
    // transient refresh failure may keep it visible, but a category-only
    // recovery page is never promoted to a complete Library cache.
    hasUsableLibrarySnapshotRef.current = true;
    setHasUsableLibrarySnapshot(true);
    reconcilePreviewPrincipal(mineOwnerPrincipalId);
    if (!favoritesResult.ok || !favoritesResult.data) {
      if (
        requestedSort.by !== "none" &&
        hasUsableLibrarySnapshotRef.current &&
        priorOwnerPrincipalId === mineOwnerPrincipalId
      ) {
        // A failed auxiliary favorites request must not replace a previously
        // complete same-owner snapshot with only the first page.
        setAuthRequired(false);
        setFailed(true);
        setFailureStatus(favoritesResult.status || 503);
        setFailureMessage(libraryFailureDiagnostic(favoritesResult));
        setFavoriteWarning(favoriteRefreshWarning(favoritesResult));
        setSortLoading(false);
        setLoading(false);
        return;
      }
      const documentPage = pinnedMineItemsFromPage(
        libraryPageFromSettled(documentSettled),
        mineOwnerPrincipalId,
      );
      const pdfPage = pinnedMineItemsFromPage(
        libraryPageFromSettled(pdfSettled),
        mineOwnerPrincipalId,
      );
      setOwnedItems(
        mergeOwnedMineItems(
          [...documentPage.items, ...pdfPage.items],
          mineResult.data.items,
        ),
      );
      setOwnerPrincipalId(mineOwnerPrincipalId);
      ownerPrincipalIdRef.current = mineOwnerPrincipalId;
      setNextCursor(mineResult.data.nextCursor);
      setPinnedNextCursors({
        document: documentPage.nextCursor,
        pdf: pdfPage.nextCursor,
      });
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
      setSortLoading(false);
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
    let completePages: { mine: LibraryItem[]; favorites: LibraryItem[] } | null = null;
    if (requestedSort.by !== "none") {
      try {
        completePages = await collectCompleteLibrarySnapshot(
          mineResult,
          favoritesResult,
          mineOwnerPrincipalId,
          controller.signal,
        );
      } catch (caught) {
        if (controller.signal.aborted || epoch !== requestEpochRef.current) {
          return;
        }
        // Keep the prior list and sort intact. A refresh is not allowed to
        // downgrade an established full snapshot to its newest page.
        setFailed(true);
        setFailureStatus(502);
        setFailureMessage(
          caught instanceof Error
            ? caught.message
            : "未能完整刷新列表。",
        );
        setSortWarning(
          caught instanceof Error
            ? caught.message
            : "未能完整刷新列表；保留上次成功的排序快照。",
        );
        setSortLoading(false);
        setLoading(false);
        return;
      }
      if (controller.signal.aborted || epoch !== requestEpochRef.current) {
        return;
      }
    }
    setAuthRequired(false);
    setFailed(false);
    setFailureStatus(undefined);
    setFailureMessage("");
    setFavoriteWarning("");
    const documentPage = pinnedMineItemsFromPage(
      libraryPageFromSettled(documentSettled),
      mineOwnerPrincipalId,
    );
    const pdfPage = pinnedMineItemsFromPage(
      libraryPageFromSettled(pdfSettled),
      mineOwnerPrincipalId,
    );
    setOwnerPrincipalId(mineOwnerPrincipalId);
    ownerPrincipalIdRef.current = mineOwnerPrincipalId;
    if (completePages) {
      const favoriteKeys = new Set(
        completePages.favorites.map(libraryItemIdentityKey),
      );
      setOwnedItems(
        dedupeDurableItems(
          completePages.mine.map((item) =>
            favoriteKeys.has(libraryItemIdentityKey(item))
              ? withFavoriteState(item, true)
              : item,
          ),
        ),
      );
      setFavoriteItems(dedupeDurableItems(completePages.favorites));
      setNextCursor(null);
      setPinnedNextCursors(EMPTY_PINNED_MINE_CURSORS);
      setFavoriteNextCursor(null);
      completeSortOwnerRef.current = mineOwnerPrincipalId;
    } else {
      setOwnedItems(
        mergeOwnedMineItems(
          [...documentPage.items, ...pdfPage.items],
          mineResult.data.items,
        ),
      );
      setFavoriteItems(dedupeDurableItems(favoritesResult.data.items));
      setNextCursor(mineResult.data.nextCursor);
      setPinnedNextCursors({
        document: documentPage.nextCursor,
        pdf: pdfPage.nextCursor,
      });
      setFavoriteNextCursor(favoritesResult.data.nextCursor);
      completeSortOwnerRef.current = "";
    }
    favoritesOwnerRef.current = mineOwnerPrincipalId;
    setSortLoading(false);
    setLoading(false);
  }, [
    clearLibraryAuthority,
    reconcilePreviewPrincipal,
  ]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  useEffect(() => {
    let active = true;
    const applyAuthIdentity = (
      nextUserId: string | null,
      eventName?: string,
    ) => {
      const previousUserId = authUserIdRef.current;
      const boundary =
        (previousUserId !== undefined && previousUserId !== nextUserId) ||
        eventName === "SIGNED_OUT";
      if (boundary) {
        // A confirmed sign-out/account switch is an authority boundary. Clear
        // synchronously so stale private content cannot survive the next read.
        loadAbortRef.current?.abort();
        loadMoreAbortRef.current?.abort();
        requestEpochRef.current += 1;
        clearLibraryAuthority();
      }
      authUserIdRef.current = nextUserId;
      if (ownerPrincipalIdRef.current) {
        reconcilePreviewPrincipal(ownerPrincipalIdRef.current);
      }
      if (boundary) void load();
    };
    const syncAuth = async (detail?: AuthStateEventDetail) => {
      const syncEpoch = ++authSyncEpochRef.current;
      if (
        detail &&
        Object.prototype.hasOwnProperty.call(detail, "userId") &&
        detail.userId !== undefined
      ) {
        if (active && syncEpoch === authSyncEpochRef.current) {
          applyAuthIdentity(detail.userId ?? null, detail.event);
        }
        return;
      }
      // Legacy announcements (e.g. account-profile updates) do not carry an
      // identity. Resolve them first; an unavailable auth read is not proof of
      // sign-out and must not evict the active editor or private list.
      const snapshot = await getUserIdSnapshot();
      if (!active || syncEpoch !== authSyncEpochRef.current) return;
      if (!snapshot.available) return;
      applyAuthIdentity(snapshot.userId, detail?.event);
    };
    const onAuthState = (event: Event) => {
      const detail = (event as CustomEvent<AuthStateEventDetail>).detail;
      void syncAuth(detail);
    };
    window.addEventListener(AUTH_STATE_EVENT, onAuthState);
    void syncAuth();
    return () => {
      active = false;
      window.removeEventListener(AUTH_STATE_EVENT, onAuthState);
    };
  }, [clearLibraryAuthority, load, reconcilePreviewPrincipal]);

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

  const openLibraryItem = useCallback(
    (item: LibraryItem) => {
      rememberOpenedLibraryItem(item, action?.nonce);
      (onOpenItem || setStandaloneEditorItem)(item);
    },
    [action?.nonce, onOpenItem],
  );
  const preloadPreviewEditor = useCallback((item: LibraryItem | null) => {
    if (item) void preloadEditorFor(item);
  }, []);

  useEffect(() => {
    if (previewIntentItem) return;
    const identity = getLibraryCurrentIdentity();
    if (!identity?.artifactId) return;
    const known = items.find(
      (item) =>
        isDurableLibraryItem(item) && item.artifactId === identity.artifactId,
    );
    if (known) rememberPreviewIntent(known);
  }, [items, previewIntentItem, rememberPreviewIntent]);

  // 指名了一份具体 artifact 的深链：`intent: "open"` 走只读预览，旧的模板直编深链
  // （`intent: "edit"`）直接进 typed 编辑器（时序与兜底取数见 `library-edit-intent.ts`）。
  // 不带 `intent` 的 action 语义不变，仍是安静预览详情。
  useLibraryEditIntent({
    action,
    items,
    onOpenItem: openLibraryItem,
    // 只读预览落点：纯读取回投影 + 挂进 entries，不碰任何写端点、不 fork。
    onPreviewItem: rememberPreviewIntent,
    restoreGeneration,
    onFailure: ({ status, message }) => {
      setFailed(true);
      setFailureStatus(status);
      setFailureMessage(message);
    },
  });

  const loadMore = useCallback(async () => {
    const documentCursor = pinnedNextCursors.document;
    const pdfCursor = pinnedNextCursors.pdf;
    if (
      (!nextCursor &&
        !favoriteNextCursor &&
        !documentCursor &&
        !pdfCursor) ||
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
    const [documentSettled, pdfSettled, mineSettled, favoritesSettled] =
      await Promise.allSettled([
        documentCursor
          ? listMyArtifacts({
              artifactType: "document",
              cursor: documentCursor,
              limit: 100,
              signal: controller.signal,
            })
          : Promise.resolve(null),
        pdfCursor
          ? listMyArtifacts({
              artifactType: "pdf",
              cursor: pdfCursor,
              limit: 100,
              signal: controller.signal,
            })
          : Promise.resolve(null),
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
    const documentResult = libraryPageFromSettled(documentSettled);
    const pdfResult = libraryPageFromSettled(pdfSettled);
    const mineResult = libraryPageFromSettled(mineSettled);
    const favoritesResult = libraryPageFromSettled(favoritesSettled);
    const mineScopeMismatch = Boolean(
      mineResult?.ok &&
        (!mineResult.data ||
          mineResult.data.ownerPrincipalId !== ownerPrincipalId),
    );
    const mineConfirmedForbidden = Boolean(
      mineResult &&
        !mineResult.ok &&
        mineResult.status !== 401 &&
        libraryAuthorityLost(mineResult),
    );
    if (mineScopeMismatch || mineConfirmedForbidden) {
      const result = mineResult!;
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
      if (
        mineResult.status === 401 &&
        authUserIdRef.current &&
        hasUsableLibrarySnapshotRef.current
      ) {
        const currentSnapshot = await getUserIdSnapshot();
        if (controller.signal.aborted || epoch !== requestEpochRef.current) {
          return;
        }
        if (
          currentSnapshot.available &&
          currentSnapshot.userId !== authUserIdRef.current
        ) {
          clearLibraryAuthority();
        }
      }
      setAuthRequired(false);
      setFailed(true);
      setFailureStatus(mineResult.status);
      setFailureMessage(
        libraryFailureDiagnostic(mineResult) || "我的库继续加载失败。",
      );
      setLoadingMore(false);
      return;
    }
    const documentPage = pinnedMineItemsFromPage(
      documentResult,
      ownerPrincipalId,
      documentCursor,
    );
    const pdfPage = pinnedMineItemsFromPage(
      pdfResult,
      ownerPrincipalId,
      pdfCursor,
    );
    setPinnedNextCursors({
      document: documentPage.nextCursor,
      pdf: pdfPage.nextCursor,
    });
    if (
      mineResult?.data ||
      documentPage.items.length > 0 ||
      pdfPage.items.length > 0
    ) {
      setOwnedItems((current) =>
        mergeOwnedMineItems(
          [...current, ...documentPage.items, ...pdfPage.items],
          mineResult?.data?.items || [],
        ),
      );
      if (mineResult?.data) {
        setNextCursor(mineResult.data.nextCursor);
      }
    }
    const favoritesOwnerMismatch = Boolean(
      favoritesResult?.ok &&
        favoritesResult.data &&
        favoritesResult.data.ownerPrincipalId !== ownerPrincipalId,
    );
    if (favoritesOwnerMismatch) {
      // A successful later page with a different principal is an authority
      // boundary, not a transient auxiliary outage. Drop the old favorite
      // cache/cursor, but retain the separately owner-verified /mine rows.
      setFavoriteItems([]);
      setFavoriteNextCursor(null);
      favoritesOwnerRef.current = "";
      setAuthRequired(false);
      setFailed(false);
      setFailureStatus(undefined);
      setFailureMessage("");
      setFavoriteWarning(
        "收藏列表归属与当前账号不一致，已拒绝显示；请稍后重试。",
      );
      setLoadingMore(false);
      return;
    }
    if (favoritesResult && (!favoritesResult.ok || !favoritesResult.data)) {
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
    clearPreviewIntent,
    favoriteNextCursor,
    loading,
    loadingMore,
    nextCursor,
    ownerPrincipalId,
    pinnedNextCursors,
    reconcilePreviewPrincipal,
  ]);

  const changeLibrarySort = useCallback(
    (nextSort: LibrarySort) => {
      sortAbortRef.current?.abort();
      sortAbortRef.current = null;
      const epoch = ++sortEpochRef.current;
      setSortWarning("");
      if (nextSort.by === "none") {
        updateLibrarySort(nextSort);
        setSortLoading(false);
        return;
      }
      const expectedOwner = ownerPrincipalIdRef.current;
      if (!expectedOwner || loading) return;
      if (completeSortOwnerRef.current === expectedOwner) {
        updateLibrarySort(nextSort);
        setSortLoading(false);
        return;
      }

      const controller = new AbortController();
      sortAbortRef.current = controller;
      setSortLoading(true);
      void (async () => {
        try {
          const [mineFirst, favoritesFirst] = await Promise.all([
            listMyArtifacts({ limit: LIBRARY_SORT_PAGE_SIZE, signal: controller.signal }),
            listFavoriteArtifacts({ limit: LIBRARY_SORT_PAGE_SIZE, signal: controller.signal }),
          ]);
          if (
            controller.signal.aborted ||
            epoch !== sortEpochRef.current ||
            expectedOwner !== ownerPrincipalIdRef.current
          ) {
            return;
          }
          if (!mineFirst.ok || !mineFirst.data) {
            throw new Error(libraryFailureDiagnostic(mineFirst) || "我的库暂时无法完整读取。");
          }
          if (!favoritesFirst.ok || !favoritesFirst.data) {
            throw new Error(libraryFailureDiagnostic(favoritesFirst) || "收藏列表暂时无法完整读取。");
          }
          if (
            mineFirst.data.ownerPrincipalId !== expectedOwner ||
            favoritesFirst.data.ownerPrincipalId !== expectedOwner
          ) {
            throw new Error("列表归属与当前账号不一致；已取消完整排序。");
          }
          const { mine: allMineItems, favorites: allFavoriteItems } =
            await collectCompleteLibrarySnapshot(
              mineFirst,
              favoritesFirst,
              expectedOwner,
              controller.signal,
            );
          if (
            controller.signal.aborted ||
            epoch !== sortEpochRef.current ||
            expectedOwner !== ownerPrincipalIdRef.current
          ) {
            return;
          }
          const favoriteKeys = new Set(allFavoriteItems.map(libraryItemIdentityKey));
          setOwnedItems(
            dedupeDurableItems(
              allMineItems.map((item) =>
                favoriteKeys.has(libraryItemIdentityKey(item))
                  ? withFavoriteState(item, true)
                  : item,
              ),
            ),
          );
          setFavoriteItems(dedupeDurableItems(allFavoriteItems));
          setNextCursor(null);
          setPinnedNextCursors(EMPTY_PINNED_MINE_CURSORS);
          setFavoriteNextCursor(null);
          favoritesOwnerRef.current = expectedOwner;
          completeSortOwnerRef.current = expectedOwner;
          hasUsableLibrarySnapshotRef.current = true;
          setHasUsableLibrarySnapshot(true);
          updateLibrarySort(nextSort);
          setSortLoading(false);
        } catch (caught) {
          if (
            controller.signal.aborted ||
            epoch !== sortEpochRef.current
          ) {
            return;
          }
          setSortLoading(false);
          setSortWarning(
            caught instanceof Error
              ? caught.message
              : "未能完整读取列表；没有对部分结果排序。",
          );
        } finally {
          if (sortAbortRef.current === controller) {
            sortAbortRef.current = null;
          }
        }
      })();
    },
    [loading, updateLibrarySort],
  );

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
    async (files: FileList | readonly File[] | null, retrying = false) => {
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
      if (retrying) {
        setRetryableUploadFiles((current) =>
          current.filter((file) => !queue.includes(file)),
        );
      }
      const retryableFailures: File[] = [];
      try {
        for (let index = 0; index < queue.length; index += 1) {
          const file = queue[index];
          setUploadProgress(`${index + 1}/${queue.length} · ${file.name}`);
          const uploadIdempotencyKey = await normalizeUploadIdempotencyKey([
            "library-upload-v1",
            siteId || "home",
            file.name,
            file.size,
            file.lastModified,
          ]);
          const result = await uploadFile(file, {
            siteId: siteId || "home",
            title: file.name,
            idempotencyKey: uploadIdempotencyKey,
            privateUpload: true,
          });
          if (!result.ok || !result.data?.file) {
            if (result.retryable) retryableFailures.push(file);
            setUploadError(
              humanLibraryUploadError(result.error, result.status),
            );
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
              if (ensured.retryable) retryableFailures.push(file);
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
        if (retryableFailures.length) {
          setRetryableUploadFiles((current) =>
            [...current, ...retryableFailures.filter((file) => !current.includes(file))],
          );
        }
        setUploading(false);
        setUploadProgress("");
      }
    },
    [ownerPrincipalId, siteId, uploading],
  );
  const retryFailedUploads = useCallback(() => {
    void handleUpload(retryableUploadFiles, true);
  }, [handleUpload, retryableUploadFiles]);

  const orderedItems = useMemo(
    () => sortLibraryItems(items, librarySort),
    [items, librarySort],
  );
  const entries = useMemo(
    () =>
      dedupeWorkspaceEntries([
        ...orderedItems
          .filter(
            (item) =>
              (!favoritesOnly || item.favorite) &&
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
        ...(favoritesOnly
          ? []
          : featuredEntries.filter(
              (entry) =>
                entry.libraryItem &&
                isDurableLibraryItem(entry.libraryItem) &&
                entry.libraryItem.artifact.owner.visibility !== "public" &&
                Boolean(ownerPrincipalId) &&
                entry.libraryItem.artifact.owner.principalId ===
                  ownerPrincipalId &&
                orderedItems.some(
                  (item) =>
                    libraryItemIdentityKey(item) ===
                    libraryItemIdentityKey(entry.libraryItem!),
                ),
            )),
        // 深链指名的只读预览排在最后：万一它本来就在我的库里，前面那份（带删除
        // 能力）会被 dedupe 保留，这里不会把它降级成一张只读卡。
        ...(previewIntentItem ? [toEntry(previewIntentItem)] : []),
      ]),
    [
      featuredEntries,
      itemFilter,
      orderedItems,
      favoritesOnly,
      ownerPrincipalId,
      previewIntentItem,
      removeItem,
    ],
  );
  const failureCopy = myLibraryFailure(failureStatus);
  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <label
        className={`${COLLECTION_ACTION_BTN_PRIMARY} cursor-pointer ${
          uploading || loading || authRequired || failed || !ownerPrincipalId
            ? "pointer-events-none opacity-50"
            : ""
        }`}
      >
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
    </div>
  );
  const retryControl = (
    <button
      type="button"
      data-library-retry=""
      onClick={() => void load()}
      disabled={loading || uploading}
      className="shrink-0 font-medium underline underline-offset-2 disabled:opacity-50"
    >
      {tt("重试")}
    </button>
  );

  if (standaloneEditorItem) {
    const editorBinding = libraryStandaloneEditorBinding({
      hostSiteId: siteId,
      itemSiteId: standaloneEditorItem.siteId,
    });
    return (
      <div
        className={`h-full min-h-0 ${className}`}
        data-library-standalone-editor={
          standaloneEditorItem.artifactId || standaloneEditorItem.id
        }
      >
        <MaterialStandaloneEditor
          key={standaloneEditorItem.artifactId || standaloneEditorItem.id}
          item={standaloneEditorItem}
          taskId={taskId}
          siteId={editorBinding.siteId}
          appId={editorBinding.appId}
          accent={accent}
          onSavedItem={(saved) =>
            setStandaloneEditorItem((current) =>
              adoptSavedEditorItem(current, saved),
            )
          }
          onClose={() => {
            clearLibraryCurrentIdentity(action?.nonce);
            setPreviewIntentItem(null);
            setStandaloneEditorItem(null);
          }}
        />
      </div>
    );
  }

  return (
    <LibraryScope
      {...libraryScope}
      header={
        detailOpen ? null : (
        <div className="mb-3 shrink-0" data-library-collection-chrome="">
          <LibraryToolbar
            search={libraryQuery}
            setSearch={setLibraryQuery}
            view={libraryView}
            setView={setLibraryView}
            actions={toolbar}
            placeholder="search"
            tt={tt}
            viewOptions={favoriteViewOptions}
            sort={librarySort}
            onSortChange={changeLibrarySort}
            sortBusy={sortLoading || loading}
            leading={
              pageTitle ? (
                <h1 className={APP_PAGE_TITLE_CLASS}>
                  {typeof pageTitle === "string" ? tt(pageTitle) : pageTitle}
                </h1>
              ) : undefined
            }
          />
          {pageTitle ? (
            <CollectionFilterRow>
              <CollectionFilterSelect
                label={tt("类型")}
                name="type"
                value={activeCategory === "all" ? "" : activeCategory}
                options={LIBRARY_PAGE_TYPE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: translateLibraryTypeLabel(tt, option.typeLabel),
                }))}
                onChange={(value) => changeCategory(value || "all")}
                allLabel={tt("全部类型")}
              />
            </CollectionFilterRow>
          ) : null}
        </div>
        )
      }
    >
      <div className="relative h-full min-h-0">
        <WorkspaceLibrary
          entries={entries}
          accent={accent}
          action={action}
          query={libraryQuery}
          onQueryChange={setLibraryQuery}
          view={libraryView}
          onViewChange={setLibraryView}
          hideToolbar
          hideCategoryChips={Boolean(pageTitle)}
          onDetailOpenChange={setDetailOpen}
          onDetailItemChange={preloadPreviewEditor}
          category={activeCategory}
          onCategoryChange={changeCategory}
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
          searchPlaceholder="search"
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
          emptyCta={failed && !authRequired ? retryControl : undefined}
          hasMore={Boolean(
            !loading &&
              (nextCursor ||
                favoriteNextCursor ||
                pinnedNextCursors.document ||
                pinnedNextCursors.pdf),
          )}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          className={className}
          plain={plain}
        />
        {failed && entries.length > 0 && hasUsableLibrarySnapshot && (
          <div
            role="status"
            className="absolute left-3 top-3 z-30 flex max-w-[min(32rem,calc(100%-1.5rem))] items-center gap-3 rounded-lg border border-amber-500/20 bg-[var(--card,#fff)] px-3 py-2 text-[11px] text-amber-700 shadow-sm"
          >
            <span>{tt("显示上次成功加载的作品；列表暂未刷新。")}</span>
            {retryControl}
          </div>
        )}
        {failed && entries.length > 0 && !hasUsableLibrarySnapshot && (
          <div
            role="alert"
            className="absolute left-3 right-3 top-3 z-30 flex items-center justify-between gap-3 rounded-lg border border-rose-500/25 bg-[var(--card,#fff)] px-3 py-2 text-[11px] text-rose-700 shadow-sm"
          >
            <span>
              {tt(failureCopy.title)}：{tt(failureCopy.description)}
            </span>
            {retryControl}
          </div>
        )}
        {favoriteWarning && !authRequired && !failed && (
          <div
            role="alert"
            className="absolute left-3 right-3 top-3 z-30 flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-[var(--card,#fff)] px-3 py-2 text-[11px] text-amber-700 shadow-sm"
          >
            <span>{tt(favoriteWarning)}</span>
            {retryControl}
          </div>
        )}
        {sortWarning && !failed && (
          <div
            role="status"
            className="absolute left-3 right-3 top-3 z-30 rounded-lg border border-amber-500/20 bg-[var(--card,#fff)] px-3 py-2 text-[11px] text-amber-700 shadow-sm"
          >
            {tt(sortWarning)}
          </div>
        )}
        {(uploadProgress || uploadError) && (
          <div
            role={uploadError ? "alert" : "status"}
            aria-live="polite"
            className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-[var(--fg,#1c1917)] px-3 py-2 text-[11px] text-[var(--card,#fff)] shadow-lg"
          >
            {uploadError || uploadProgress}
            {retryableUploadFiles.length > 0 ? (
              <button
                type="button"
                data-library-upload-retry=""
                disabled={uploading}
                onClick={retryFailedUploads}
                className="shrink-0 font-medium underline underline-offset-2 disabled:opacity-50"
              >
                {tt(`重试失败文件 (${retryableUploadFiles.length})`)}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </LibraryScope>
  );
}
