"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StorageCapacityStrip } from "./StorageCapacityStrip";
import { LibraryImportDialog, LibraryUploadQueue, LibraryPurchasedUpdates, type LibraryImportMode } from "./library-import";
import { useUI } from "../i18n/ui/useUI";
import {
  AUTH_STATE_EVENT,
  getUserIdSnapshot,
  type AuthStateEventDetail,
} from "../lib/auth/client";
import type { LibraryChatFile } from "./library-chat-files";
import { APP_PAGE_TITLE_CLASS } from "./AppPageHeader";
import { LibraryToolbar } from "./LibraryLayout";
import {
  COLLECTION_ACTION_BTN_PRIMARY,
  COLLECTION_ACTION_BTN_GHOST,
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
  isUploadedLibraryItem,
  libraryItemIdentityKey,
  libraryItemSection,
  sortLibraryItems,
  type LibrarySort,
  type LibraryItem,
} from "./library-data";
import { serverWorkLibraryItem } from "./works/server-work-item";
import { linkWorkLibraryItem, normalizeLinkWork } from "./works/link-work-item";
import { LinkWorkDialog } from "./works/LinkWorkDialog";
import {
  LibraryScope,
  type LibraryScopeIntegration,
} from "./library-scope";
import {
  ARTIFACT_LIBRARY_CHANGE_EVENT,
  ensureArtifact,
  getCurrentArtifactItem,
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
import {
  LibraryPaginationReadError,
  libraryLoadFailureCopy,
  type LibraryFailureStage,
  type LibraryLoadFailure,
  type LibraryPageCollection,
} from "./library-load-failure";
import { LibraryDropOverlay, useLibraryDrop, type LibraryDrop } from "./library-drop";
import {
  canPickFolder,
  foldersFromDirectoryInput,
  type DroppedFolder,
} from "./dropped-entries";
import { libraryStandaloneEditorBinding } from "./library-edit-landing";
import {
  artifactIsVisible,
  isEnsureableTransient,
  normalizeArtifactProjectionResult,
  type LibrarySource,
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
import { MaterialStandaloneEditor } from "./library-standalone-editor-host";
import { preloadEditorFor } from "./editor-preload";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import type { WorkbenchMaterialActionAvailability } from "./workbench-material-registry";
import type { WorkspaceActionEnvelope } from "./workspace-actions";
import { loadProjectMemberships, loadLinkWorkItem, projectNames, LibraryProjectContext, type LibraryProjectMembership } from "./library-project-membership";
import { FloatingMenu, FloatingMenuItem } from "../ui/menu/FloatingMenu";
// Memo opens only on request; loading it with the Library would pull the IM client into every Library view.
const LibraryMemoPage = lazy(() => import("./library-memo/LibraryMemoPage").then((module) => ({ default: module.LibraryMemoPage })));
// Same reason for the 来自 LeoChat section (it opens chats through the IM host).


const LIBRARY_PAGE_TYPE_OPTIONS = LIBRARY_EDITOR_CATEGORIES;

function isServerWorkLibraryItem(item: LibraryItem): boolean {
  return item.source === "creation" && item.key.startsWith("server-work:") && Boolean(item.meta?.serverWorkRecord);
}
function isLinkWorkLibraryItem(item: LibraryItem): boolean {
  return item.source === "creation" && Boolean(normalizeLinkWork(item.meta?.link_work));
}

// 服务端的库结果就是用户实际拥有的内容。这里只去掉非持久项和重复项，不再用
// 一张固定 artifact type 清单替用户决定哪些内容有资格出现。
function dedupeDurableItems(items: readonly LibraryItem[]): LibraryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!isDurableLibraryItem(item) && !isServerWorkLibraryItem(item) && !isLinkWorkLibraryItem(item) && !item.key.startsWith("leochat:")) return false;
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
    if (!entry.libraryItem || (!entry.libraryItem.meta.project_scope && !isDurableLibraryItem(entry.libraryItem) && !isServerWorkLibraryItem(entry.libraryItem) && !isLinkWorkLibraryItem(entry.libraryItem))) {
      return false;
    }
    const identity = libraryItemIdentityKey(entry.libraryItem);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
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

const SECTION_EMPTY_COPY: Record<LibrarySource, { title: string; description: string }> = {
  task: { title: "还没有任务附件", description: "在任务中上传的文件会出现在这里。" },
  creation: { title: "还没有创作", description: "生成的作品会自动出现在这里。" },
  upload: { title: "还没有上传的文件", description: "把文件或文件夹拖到这里就能上传。" },
  leobay: { title: "还没有来自 LeoBay 的内容", description: "在 LeoBay 获取的内容会出现在这里。" },
  // 来自 LeoChat renders LibraryChatFiles, which has its own empty state.
  leochat: { title: "", description: "" },
};

/** A complete sort snapshot belongs to one owner and one section. */
function completeSortKey(ownerPrincipalId: string, source: LibrarySource): string {
  return `${ownerPrincipalId}\u0000${source}`;
}
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
  collection: LibraryPageCollection,
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
      throw new LibraryPaginationReadError(libraryFailureDiagnostic(next) || "列表分页未能完整读取。", collection, pages + 1, next.status);
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
  source: LibrarySource,
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
        listMyArtifacts({ offset, ...(source === "task" ? { source } : {}), limit: LIBRARY_SORT_PAGE_SIZE, signal: pageSignal }),
      ownerPrincipalId,
      signal,
      "mine",
    ),
    collectCompleteLibraryPages(
      favoritesFirst,
      (offset, pageSignal) =>
        listFavoriteArtifacts({ offset, limit: LIBRARY_SORT_PAGE_SIZE, signal: pageSignal }),
      ownerPrincipalId,
      signal,
      "favorites",
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

function serverWorkItemsFromPage(
  result: LibraryPageResult,
  options: { offset: number; source?: LibrarySource; artifactType?: string; role?: string },
): LibraryItem[] {
  if (
    options.offset !== 0 ||
    (options.source !== undefined && options.source !== "creation") ||
    (options.artifactType !== undefined && options.artifactType !== "website") ||
    options.role !== undefined ||
    !result.ok ||
    !result.data
  ) return [];
  return (result.data.serverWorks || []).flatMap((work) => {
    if ("link_work" in work) {
      const link = normalizeLinkWork({ ...work, ...work.link_work });
      return link ? [linkWorkLibraryItem(link)] : [];
    }
    return [serverWorkLibraryItem(work)];
  });
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
  tt: (key: string) => string = (key) => key,
) {
  const taskUpload = item.meta?.taskUpload as { taskId?: string } | undefined;
  const taskCaption = libraryItemSection(item) === "task"
    ? `${tt("任务附件")} · ${taskUpload?.taskId ? taskUpload.taskId.slice(0, 8) : tt("尚未发送到任务")}` : "";
  const uploaded = isUploadedLibraryItem(item);
  const userAsset = item.meta.library_source === "asset";
  const publicFavorite =
    isDurableLibraryItem(item) &&
    item.favorite &&
    item.artifact.owner.visibility === "public";
  return workspaceEntryFromLibraryItem(taskCaption ? { ...item, meta: { ...item.meta, library_source_label: taskCaption } } : item, {
    category: libraryEditorCategory(item),
    description: taskCaption ||
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
      taskUpload?.taskId || "",
      item.kind,
      item.siteId,
      uploaded ? "上传 文件" : userAsset ? "素材 收藏" : "作品 生成",
      item.favorite ? "收藏" : "",
      typeof (item.meta?.link_work as { note?: unknown } | undefined)?.note === "string" ? String((item.meta?.link_work as { note?: unknown }).note) : "",
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
  /** Library section (我的创作 / 上传的 / 来自 LeoBay / 来自 LeoChat); uncontrolled when omitted. */
  section?: LibrarySource;
  onSectionChange?: (section: LibrarySource) => void;
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
  /**
   * 类型筛选行之后、网格之前的一段宿主内容（skills-overhaul W17 / 仲裁 A-04）：
   * `/library`「上传的」分区、「全部类型」时放「文件包」横排。不传则什么都不渲染。
   * 也可以传函数（仲裁 A-21）：拿到本库当前的搜索词、「仅看收藏」与分区，宿主据此过滤或隐藏。
   */
  supplementalSection?:
    | ReactNode
    | ((ctx: { query: string; favoritesOnly: boolean; section: LibrarySource }) => ReactNode);
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
  section,
  onSectionChange,
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
  supplementalSection,
}: MyLibraryProps) {
  const tt = useUI();
  const [memberships, setMemberships] = useState<LibraryProjectMembership[]>([]);
  const projectLookup = useMemo(() => new Map(
    memberships.map(membership => [`${membership.kind}:${membership.id}`, membership.projects]),
  ), [memberships]);
  const membershipEpoch = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const epoch = ++membershipEpoch.current;
    void loadProjectMemberships(controller.signal).then(value => {
      if (!controller.signal.aborted && epoch === membershipEpoch.current) setMemberships(value);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryView, setLibraryView] = useState<"grid" | "list">("grid");
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const uploadAnchorRef = useRef<HTMLButtonElement | null>(null);
  const uploadFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [attachmentSection, setAttachmentSection] = useState(section === "task");
  useEffect(() => { if (section !== undefined) setAttachmentSection(section === "task"); }, [section]);
  const activeSection: LibrarySource = attachmentSection ? "task" : "creation";
  // Every list read takes the section from here (`source=`), so a read started
  // right after a section click already asks for the new one.
  const sectionRef = useRef<LibrarySource>(activeSection);
  sectionRef.current = activeSection;
  const loadedSectionRef = useRef<LibrarySource | null>(null);
  const [ownedItems, setOwnedItems] = useState<LibraryItem[]>([]);
  // 来自 LeoChat files, mapped to Library items once loaded (the client module is loaded on demand).
  const [chatItems, setChatItems] = useState<LibraryItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const displayLoading = loading;
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
  const [failures, setFailures] = useState<Partial<Record<LibraryFailureStage, LibraryLoadFailure>>>({});
  const reportFailure = useCallback((failure: LibraryLoadFailure) => {
    setFailures((current) => ({ ...current, [failure.stage]: failure }));
  }, []);
  const clearFailures = useCallback((...stages: LibraryFailureStage[]) => {
    setFailures((current) => {
      if (!stages.some((stage) => current[stage])) return current;
      const next = { ...current };
      for (const stage of stages) delete next[stage];
      return next;
    });
  }, []);
  const emptyFailure = failures.mine || (failures.favorites?.reason === "owner-mismatch" ? failures.favorites : undefined);
  const failed = Boolean(emptyFailure);
  const [intentRetry, setIntentRetry] = useState(0);
  const [ownerPrincipalId, setOwnerPrincipalId] = useState("");
  const ownerPrincipalIdRef = useRef("");
  const [restoreGeneration, setRestoreGeneration] = useState(0);
  const authUserIdRef = useRef<string | null | undefined>(undefined);
  const authSyncEpochRef = useRef(0);
  const loadedPageCountsRef = useRef({ mine: 1, favorites: 1, document: 1, pdf: 1 });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pinnedNextCursors, setPinnedNextCursors] =
    useState<PinnedMineCursors>(EMPTY_PINNED_MINE_CURSORS);
  const [favoriteNextCursor, setFavoriteNextCursor] =
    useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<LibraryImportMode | null>(null);
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

  const rememberPreviewSelection = useCallback(
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
    for (const failure of Object.values(failures)) {
      if (!failure?.diagnostic) continue;
      console.warn("[OceanLeo Library] read request failed", {
        stage: failure.stage,
        page: failure.page,
        status: failure.status,
        message: failure.diagnostic,
      });
    }
  }, [failures]);

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
  const changeSection = useCallback((next: LibrarySource) => {
    sectionRef.current = next === "task" ? "task" : "creation";
    setAttachmentSection(next === "task");
    onSectionChange?.(next);
  }, [onSectionChange]);
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
        ...chatItems,
        ...ownedItems.map((item) =>
          favoriteIdentity.has(libraryItemIdentityKey(item))
            ? withFavoriteState(item, true)
            : item,
        ),
        ...(attachmentSection ? [] : favoriteItems),
      ]),
    );
  }, [attachmentSection, chatItems, favoriteItems, ownedItems]);

  const clearLibraryAuthority = useCallback((preservePreviewForPrincipal = "") => {
    sortAbortRef.current?.abort();
    sortAbortRef.current = null;
    sortEpochRef.current += 1;
    completeSortOwnerRef.current = "";
    setOwnedItems([]);
    setFavoriteItems([]);
    setFailures({});
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
    setDirectItem(null);
    if (!preservePreviewForPrincipal ||
        previewRestoreRef.current?.principalId !== preservePreviewForPrincipal) {
      clearPreviewIntent();
    }
    // Also abort a delayed direct-item GET even when this same principal may
    // keep the already-restored item during a list transport/schema failure.
    setRestoreGeneration((current) => current + 1);
    favoritesOwnerRef.current = "";
  }, [clearPreviewIntent, updateLibrarySort]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      // On demand, like the old 来自 LeoChat section: the LeoChat client pulls the IM transport.
      const chat = await import("./library-chat-files").catch(() => null);
      if (!chat || !active) return;
      const files: LibraryChatFile[] = [];
      let cursor: string | undefined;
      // The newest 200 LeoChat files join the list; older ones stay reachable in LeoChat itself.
      for (let page = 0; page < 2 && active; page += 1) {
        const result = await chat.listLibraryChatFiles({ ...(cursor ? { cursor } : {}), limit: 100, signal: controller.signal }).catch(() => null);
        if (!result || !result.ok) break;
        files.push(...result.items);
        if (!result.next) break;
        cursor = result.next;
      }
      if (!active) return;
      setChatItems(files
        .filter((file) => chat.chatFileMatches(file, { query: "", category: "all" }))
        .map((file) => {
          const item = chat.chatFileLibraryItem(file);
          const image = item.kind === "image";
          return {
            ...item,
            url: file.url,
            previewUrl: file.url,
            ...(image ? { thumbUrl: file.url } : {}),
            createdAt: file.created_at || undefined,
            meta: { ...item.meta, chat_file_url: file.url, library_source_label: "来自 LeoChat" },
          } as LibraryItem;
        }));
    })();
    return () => { active = false; controller.abort(); };
  }, [refreshNonce]);

  const load = useCallback(async () => {
    sortAbortRef.current?.abort();
    sortAbortRef.current = null;
    sortEpochRef.current += 1;
    let requestedSort = librarySortRef.current;
    const requestedSection = sectionRef.current;
    loadedSectionRef.current = requestedSection;
    setSortLoading(requestedSort.by !== "none");
    setSortWarning("");
    loadAbortRef.current?.abort();
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const epoch = ++requestEpochRef.current;
    setLoading(true);
    setLoadingMore(false);
    const [documentSettled, pdfSettled, mineSettled, favoritesSettled] =
      await Promise.allSettled([
        listMyArtifacts({
          ...(requestedSection === "task" ? { source: "task" as const } : {}),
          artifactType: "document",
          limit: 100,
          signal: controller.signal,
        }),
        listMyArtifacts({
          ...(requestedSection === "task" ? { source: "task" as const } : {}),
          artifactType: "pdf",
          limit: 100,
          signal: controller.signal,
        }),
        listMyArtifacts({
          ...(requestedSection === "task" ? { source: "task" as const } : {}),
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
    const serverWorkItems = serverWorkItemsFromPage(mineResult, {
      offset: 0,
    });
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
      reportFailure({ stage: "mine", status: mineResult.status, diagnostic: libraryFailureDiagnostic(mineResult) });
      setSortLoading(false);
      setLoading(false);
      return;
    }
    const mineOwnerPrincipalId =
      mineResult.data.ownerPrincipalId || "";
    if (!mineOwnerPrincipalId) {
      clearLibraryAuthority();
      setAuthRequired(false);
      reportFailure({ stage: "mine", status: 502, diagnostic: "我的库响应缺少 ownerPrincipalId，已拒绝显示。" });
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
    clearFailures("mine");
    if (!favoritesResult.ok || !favoritesResult.data) {
      if (
        requestedSort.by !== "none" &&
        hasUsableLibrarySnapshotRef.current &&
        priorOwnerPrincipalId === mineOwnerPrincipalId
      ) {
        // A failed auxiliary favorites request must not replace a previously
        // complete same-owner snapshot with only the first page.
        setAuthRequired(false);
        reportFailure({ stage: "favorites", status: favoritesResult.status, diagnostic: libraryFailureDiagnostic(favoritesResult) });
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
      loadedPageCountsRef.current = { ...loadedPageCountsRef.current, mine: 1, document: 1, pdf: 1 };
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
      reportFailure({ stage: "favorites", status: favoritesResult.status, diagnostic: libraryFailureDiagnostic(favoritesResult) });
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
      reportFailure({ stage: "favorites", status: 502, reason: "owner-mismatch", diagnostic: "我的库与收藏素材 ownerPrincipalId 不一致，已拒绝合并。" });
      setLoading(false);
      return;
    }
    clearFailures("favorites");
    let completePages: { mine: LibraryItem[]; favorites: LibraryItem[] } | null = null;
    if (requestedSort.by !== "none") {
      try {
        completePages = await collectCompleteLibrarySnapshot(
          mineResult,
          favoritesResult,
          mineOwnerPrincipalId,
          "creation",
          controller.signal,
        );
      } catch (caught) {
        if (controller.signal.aborted || epoch !== requestEpochRef.current) {
          return;
        }
        // Keep the prior list and sort intact. A refresh is not allowed to
        // downgrade an established full snapshot to its newest page.
        reportFailure({
          stage: "pagination",
          status: caught instanceof LibraryPaginationReadError ? caught.status : 502,
          collection: caught instanceof LibraryPaginationReadError ? caught.collection : "mine",
          page: caught instanceof LibraryPaginationReadError ? caught.page : undefined,
          diagnostic: caught instanceof Error ? caught.message : "未能完整刷新列表。",
          retry: "refresh",
        });
        setSortLoading(false);
        setLoading(false);
        return;
      }
      if (controller.signal.aborted || epoch !== requestEpochRef.current) {
        return;
      }
    }
    setAuthRequired(false);
    if (completePages) clearFailures("pagination");
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
          [...serverWorkItems, ...completePages.mine].map((item) =>
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
      completeSortOwnerRef.current = completeSortKey(mineOwnerPrincipalId, requestedSection);
    } else {
      setOwnedItems(
        mergeOwnedMineItems(
          [...documentPage.items, ...pdfPage.items],
          [...serverWorkItems, ...mineResult.data.items],
        ),
      );
      setFavoriteItems(dedupeDurableItems(favoritesResult.data.items));
      loadedPageCountsRef.current = { mine: 1, favorites: 1, document: 1, pdf: 1 };
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
    clearFailures,
    reportFailure,
  ]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  // A section click re-reads the list for that section (the mount read above already covers the first one).
  useEffect(() => {
    if (loadedSectionRef.current !== null && loadedSectionRef.current !== activeSection) {
      void load();
    }
  }, [activeSection, load]);

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
        detail.item.artifact.owner.visibility !== "public" &&
        // Without the server's section the item could only be guessed into one; the re-read below places it.
        libraryItemSection(detail.item)
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
    // A chat upload opens here on the 上传的 section; its type category
    // (`action.category`) is applied by WorkspaceLibrary.
    // Uploaded actions still resolve by itemId; section switching was removed.
    // A result card can be clicked immediately after its durable artifact row
    // is inserted. Revalidate the per-user cache; WorkspaceLibrary retries the
    // same itemId/URL action when the fresh entry list arrives, then opens it.
    void load();
  }, [action?.nonce, changeSection, load]);

  const openLibraryItem = useCallback(
    (item: LibraryItem) => {
      clearFailures("intent");
      rememberOpenedLibraryItem(item, action?.nonce);
      (onOpenItem || setStandaloneEditorItem)(item);
    },
    [action?.nonce, clearFailures, onOpenItem],
  );
  const preloadPreviewEditor = useCallback((item: LibraryItem | null) => {
    if (item) void preloadEditorFor(item);
  }, []);

  const [directItem, setDirectItem] = useState<{ nonce: string; item: LibraryItem | null } | null>(null);
  const requestedItemId = action?.action.tab === "mine" && action.action.itemId !== "memo" ? action.action.itemId : undefined;
  const directItemId = requestedItemId && (!action?.action.intent || requestedItemId.startsWith("link-work:")) ? requestedItemId : undefined;
  useEffect(() => { clearFailures("intent"); }, [action?.nonce, clearFailures]);
  useEffect(() => {
    if (!directItemId || !action?.nonce) return;
    const controller = new AbortController();
    const nonce = action.nonce;
    clearPreviewIntent();
    clearLibraryCurrentIdentity();
    void (async () => {
      try {
        const result = directItemId.startsWith("link-work:")
          ? { ok: true, data: await loadLinkWorkItem(directItemId.slice(10), controller.signal), status: undefined }
          : await getCurrentArtifactItem(directItemId, controller.signal);
        if (controller.signal.aborted) return;
        const item = result.ok ? result.data || null : null;
        setDirectItem({ nonce, item });
        if (item) clearFailures("intent");
        else reportFailure({ stage: "intent", status: result.status, retry: "intent" });
      } catch (caught) {
        if (controller.signal.aborted) return;
        setDirectItem({ nonce, item: null });
        reportFailure({ stage: "intent", diagnostic: caught instanceof Error ? caught.message : undefined, retry: "intent" });
      }
    })();
    return () => controller.abort();
  }, [action?.nonce, directItemId, restoreGeneration, intentRetry, clearPreviewIntent, clearFailures, reportFailure]);
  const resolvedDirectItem = directItem?.nonce === action?.nonce ? directItem?.item : null;
  // Do not let the shelf consume the action before its requested item exists.
  const shelfAction: WorkspaceActionEnvelope | null | undefined = directItemId && action
    ? resolvedDirectItem
      ? { ...action, nonce: `${action.nonce}:resolved` }
      : { nonce: `${action.nonce}:pending`, action: { version: 1, tab: "mine" } }
    : action;

  useEffect(() => {
    if (previewIntentItem) return;
    const identity = getLibraryCurrentIdentity();
    if (!identity?.artifactId) return;
    const known = items.find(
      (item) =>
        isDurableLibraryItem(item) && item.artifactId === identity.artifactId,
    );
    if (known) rememberPreviewSelection(known);
  }, [items, previewIntentItem, rememberPreviewSelection]);

  // 指名了一份具体 artifact 的深链：`intent: "open"` 走只读预览，旧的模板直编深链
  // （`intent: "edit"`）直接进 typed 编辑器（时序与兜底取数见 `library-edit-intent.ts`）。
  // 不带 `intent` 的 action 语义不变，仍是安静预览详情。
  const editIntentAction = directItemId?.startsWith("link-work:") && action
    ? { ...action, action: { ...action.action, intent: undefined } }
    : action && intentRetry > 0
      ? { ...action, nonce: `${action.nonce}:retry:${intentRetry}` }
      : action;
  const rememberPreviewIntent = useCallback((item: LibraryItem) => {
    rememberPreviewSelection(item);
    clearFailures("intent");
  }, [clearFailures, rememberPreviewSelection]);
  useLibraryEditIntent({
    action: editIntentAction,
    items,
    onOpenItem: openLibraryItem,
    onPreviewItem: rememberPreviewIntent,
    restoreGeneration,
    onFailure: ({ status, message }) => {
      reportFailure({ stage: "intent", status, diagnostic: message, retry: "intent" });
    },
  });

  const loadMore = useCallback(async () => {
    const cursors = {
      document: pinnedNextCursors.document,
      pdf: pinnedNextCursors.pdf,
      mine: nextCursor,
      favorites: favoriteNextCursor,
    };
    if (!Object.values(cursors).some(Boolean) || loadingMore || loading) return;
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    const epoch = requestEpochRef.current;
    setLoadingMore(true);
    const collections = ["document", "pdf", "mine", "favorites"] as const;
    const settled = await Promise.allSettled(collections.map((collection) => {
      const cursor = cursors[collection];
      if (!cursor) return Promise.resolve(null);
      const options = { cursor, limit: 100, signal: controller.signal };
      return collection === "favorites"
        ? listFavoriteArtifacts(options)
        : listMyArtifacts({ ...options, ...(sectionRef.current === "task" ? { source: "task" as const } : {}), ...(collection !== "mine" ? { artifactType: collection } : {}) });
    }));
    if (controller.signal.aborted || epoch !== requestEpochRef.current) return;
    const results = settled.map(libraryPageFromSettled);
    // A batch is adopted only after every requested page is validated. A
    // retry uses the same cursors and never duplicates a successful sibling.
    for (let index = 0; index < collections.length; index += 1) {
      const collection = collections[index];
      if (!cursors[collection]) continue;
      const result = results[index] || rejectedLibraryPage(undefined);
      const scopeMismatch = result.ok && (!result.data || result.data.ownerPrincipalId !== ownerPrincipalId);
      const confirmedForbidden = !result.ok && result.status !== 401 && libraryAuthorityLost(result);
      if (!result.ok || !result.data || scopeMismatch) {
        let retry: "page" | "refresh" = "page";
        if (collection !== "favorites" && (scopeMismatch || confirmedForbidden)) {
          clearLibraryAuthority();
          retry = "refresh";
        } else if (collection === "favorites" && scopeMismatch) {
          setFavoriteItems([]);
          setFavoriteNextCursor(null);
          favoritesOwnerRef.current = "";
          retry = "refresh";
        } else if (result.status === 401 && authUserIdRef.current && hasUsableLibrarySnapshotRef.current) {
          const snapshot = await getUserIdSnapshot();
          if (controller.signal.aborted || epoch !== requestEpochRef.current) return;
          if (snapshot.available && snapshot.userId !== authUserIdRef.current) {
            clearLibraryAuthority();
            retry = "refresh";
          }
        }
        setAuthRequired(false);
        reportFailure({
          stage: "pagination", collection, page: loadedPageCountsRef.current[collection] + 1,
          reason: scopeMismatch ? "owner-mismatch" : undefined,
          status: scopeMismatch ? 502 : result.status,
          diagnostic: scopeMismatch
            ? "分页归属与当前账号不一致，已拒绝合并。"
            : libraryFailureDiagnostic(result) || "分页暂时无法读取。",
          retry,
        });
        setLoadingMore(false);
        return;
      }
    }
    for (const collection of collections) {
      if (cursors[collection]) loadedPageCountsRef.current[collection] += 1;
    }
    const [documentResult, pdfResult, mineResult, favoritesResult] = results;
    const documentPage = pinnedMineItemsFromPage(documentResult, ownerPrincipalId, cursors.document);
    const pdfPage = pinnedMineItemsFromPage(pdfResult, ownerPrincipalId, cursors.pdf);
    setPinnedNextCursors({ document: documentPage.nextCursor, pdf: pdfPage.nextCursor });
    if (mineResult?.data || documentPage.items.length || pdfPage.items.length) {
      setOwnedItems((current) => mergeOwnedMineItems(
        [...current, ...documentPage.items, ...pdfPage.items], mineResult?.data?.items || [],
      ));
      if (mineResult?.data) setNextCursor(mineResult.data.nextCursor);
    }
    if (favoritesResult?.data) {
      setFavoriteItems((current) => dedupeDurableItems([...current, ...favoritesResult.data!.items]));
      setFavoriteNextCursor(favoritesResult.data.nextCursor);
      favoritesOwnerRef.current = ownerPrincipalId;
    }
    setAuthRequired(false);
    clearFailures("pagination");
    setLoadingMore(false);
  }, [clearLibraryAuthority, clearFailures, reportFailure, favoriteNextCursor, loading, loadingMore, nextCursor, ownerPrincipalId, pinnedNextCursors]);

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
      const expectedSection = sectionRef.current;
      if (!expectedOwner || loading) return;
      if (completeSortOwnerRef.current === completeSortKey(expectedOwner, expectedSection)) {
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
            listMyArtifacts({ ...(expectedSection === "task" ? { source: "task" as const } : {}), limit: LIBRARY_SORT_PAGE_SIZE, signal: controller.signal }),
            listFavoriteArtifacts({ limit: LIBRARY_SORT_PAGE_SIZE, signal: controller.signal }),
          ]);
          if (
            controller.signal.aborted ||
            epoch !== sortEpochRef.current ||
            expectedOwner !== ownerPrincipalIdRef.current ||
            expectedSection !== sectionRef.current
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
              "creation",
              controller.signal,
            );
          if (
            controller.signal.aborted ||
            epoch !== sortEpochRef.current ||
            expectedOwner !== ownerPrincipalIdRef.current ||
            expectedSection !== sectionRef.current
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
          completeSortOwnerRef.current = completeSortKey(expectedOwner, expectedSection);
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
      // Uploads belong to 上传的: show that section so the new files are in view.
      changeSection("upload");
      setUploading(true);
      setUploadError("");
      if (retrying) {
        setRetryableUploadFiles((current) =>
          current.filter((file) => !queue.includes(file)),
        );
      }
      const retryableFailures: File[] = [];
      // An upload answer without `librarySource` cannot be placed in a section here; the server decides on a re-read.
      let rereadSections = false;
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
            onProgress: (loaded, total) => setUploadProgress(`${index + 1}/${queue.length} · ${file.name} · ${total ? Math.round(loaded / total * 100) : 0}%`),
          });
          if (!result.ok || !result.data?.file) {
            if (result.retryable) retryableFailures.push(file);
            setUploadError(
              humanLibraryUploadError(result.error, result.status),
            );
            continue;
          }
          const uploaded = result.data.file;
          if (uploaded.meta?.library_folder_id) {
            // Formats without a dedicated kind arrive as real Library folders.
            continue;
          }
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
          if (!libraryItemSection(uploadedItem)) rereadSections = true;
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
        if (rereadSections) void load();
      }
    },
    [changeSection, load, ownerPrincipalId, siteId, uploading],
  );
  const retryFailedUploads = useCallback(() => {
    void handleUpload(retryableUploadFiles, true);
  }, [handleUpload, retryableUploadFiles]);

  // A dropped folder is uploaded file by file and becomes a 文件包 (the folder module loads only when one is dropped).
  const uploadFolders = useCallback(
    async (folders: readonly DroppedFolder[]) => {
      changeSection("upload");
      setUploading(true);
      setUploadError("");
      try {
        const { uploadDroppedFolder } = await import("./library-folder-upload");
        for (const folder of folders) {
          const result = await uploadDroppedFolder(folder, {
            onPhase: (phase) =>
              setUploadProgress(
                `${tt(phase === "creating" ? "正在创建文件夹…" : "正在上传文件包…")} · ${folder.name}`,
              ),
          });
          if (!result.ok) setUploadError(tt(result.error));
        }
      } catch (caught) {
        setUploadError(
          caught instanceof Error ? caught.message : "上传处理失败，请重试。",
        );
      } finally {
        setUploading(false);
        setUploadProgress("");
      }
    },
    [changeSection, tt],
  );
  const uploadBlocked =
    uploading || loading || authRequired || failed || !ownerPrincipalId;
  // 「上传文件夹」 only where the browser really opens a folder picker (desktop); decided after mount so
  // the server render and the first client render agree. Elsewhere folders arrive by drop or as .zip on 文件包.
  const [folderPickable, setFolderPickable] = useState(false);
  useEffect(() => setFolderPickable(canPickFolder()), []);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // `webkitdirectory` is not in React's input attribute types.
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, [folderPickable]);
  const { dragging, dropProps } = useLibraryDrop({
    disabled: uploadBlocked,
    onError: setUploadError,
    onDrop: ({ files, folders }: LibraryDrop) => {
      void (async () => {
        if (files.length) await handleUpload(files);
        if (folders.length) await uploadFolders(folders);
      })();
    },
  });

  const orderedItems = useMemo(
    () => sortLibraryItems(items, librarySort),
    [items, librarySort],
  );
  const shownSectionItems = useMemo(
    () => orderedItems.filter(
      (item) => (attachmentSection ? libraryItemSection(item) === "task" : libraryItemSection(item) !== "task") && (!favoritesOnly || item.favorite) && (!itemFilter || itemFilter(item)),
    ),
    [attachmentSection, favoritesOnly, itemFilter, orderedItems],
  );
  const entries = useMemo(
    () =>
      dedupeWorkspaceEntries([
        ...shownSectionItems
          .map((item) => {
            const owned =
              isDurableLibraryItem(item) &&
              item.artifact.owner.principalId === ownerPrincipalId &&
              item.artifact.owner.visibility !== "public";
            return toEntry(
              item,
              owned ? () => removeItem(item) : undefined,
              tt,
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
                // A task output shows in the section its Library copy is in.
                shownSectionItems.some(
                  (item) =>
                    libraryItemIdentityKey(item) ===
                    libraryItemIdentityKey(entry.libraryItem!),
                ),
            )),
        // 深链指名的只读预览排在最后：万一它本来就在我的库里，前面那份（带删除
        // 能力）会被 dedupe 保留，这里不会把它降级成一张只读卡。
        ...(previewIntentItem ? [toEntry(previewIntentItem, undefined, tt)] : []),
        ...(resolvedDirectItem ? [toEntry(resolvedDirectItem, undefined, tt)] : []),
      ]).map(entry => ({
        ...entry,
        keywords: [...(entry.keywords || []), ...(entry.libraryItem ? projectNames(entry.libraryItem, projectLookup) : [])],
      })),
    [
      tt,
      featuredEntries,
      shownSectionItems,
      favoritesOnly,
      ownerPrincipalId,
      previewIntentItem,
      resolvedDirectItem,
      projectLookup,
      removeItem,
    ],
  );
  const failureCopy = libraryLoadFailureCopy(emptyFailure || { stage: "mine" }, hasUsableLibrarySnapshot);
  const uploadMenu = (
    <div className="relative shrink-0" data-library-upload-menu="">
      <button
        ref={uploadAnchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={uploadMenuOpen}
        disabled={uploadBlocked}
        onClick={() => setUploadMenuOpen((open) => !open)}
        className={`${COLLECTION_ACTION_BTN_PRIMARY} relative gap-1.5 after:absolute after:-inset-1 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50`}
      >
        {tt(uploading ? "上传中…" : "上传")}
        <span aria-hidden="true" className="text-[10px]">⌄</span>
      </button>
      <input
        ref={uploadFileInputRef}
        type="file"
        multiple
        className="sr-only"
        disabled={uploadBlocked}
        onChange={(event) => {
          void handleUpload(event.currentTarget.files);
          event.currentTarget.value = "";
          setUploadMenuOpen(false);
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="sr-only"
        disabled={uploadBlocked}
        onChange={(event) => {
          const folders = foldersFromDirectoryInput(event.currentTarget.files || []);
          event.currentTarget.value = "";
          if (folders.length) void uploadFolders(folders);
          else setUploadError("这个文件夹是空的");
          setUploadMenuOpen(false);
        }}
      />
      <FloatingMenu
        open={uploadMenuOpen}
        anchorRef={uploadAnchorRef}
        onClose={() => setUploadMenuOpen(false)}
        align="start"
        width={160}
        ariaLabel={tt("上传")}
      >
        <FloatingMenuItem
          label={tt("上传文件")}
          disabled={uploadBlocked}
          onSelect={() => {
            setUploadMenuOpen(false);
            uploadFileInputRef.current?.click();
          }}
        />
        {folderPickable && <FloatingMenuItem
          label={tt("上传文件夹")}
          disabled={uploadBlocked}
          onSelect={() => {
            setUploadMenuOpen(false);
            folderInputRef.current?.click();
          }}
        />}
        <FloatingMenuItem label={tt("从我的电脑添加")} disabled={uploadBlocked} onSelect={() => { setUploadMenuOpen(false); setImportMode("computer"); }} />
        <FloatingMenuItem label={tt("从 GitHub 导入")} disabled={uploadBlocked} onSelect={() => { setUploadMenuOpen(false); setImportMode("github"); }} />
        <FloatingMenuItem label={tt("添加链接")} disabled={uploadBlocked} onSelect={() => { setUploadMenuOpen(false); setLinkDialogOpen(true); }} />
      </FloatingMenu>
    </div>
  );
  const toolbar = pageTitle ? null : uploadMenu;
  const retryFailure = (failure: LibraryLoadFailure) => {
    if (failure.stage === "intent") {
      setIntentRetry((current) => current + 1);
      if (!action?.nonce) setRestoreGeneration((current) => current + 1);
    } else if (failure.stage === "pagination" && failure.retry !== "refresh") {
      void loadMore();
    } else {
      void load();
    }
  };
  const retryControlFor = (failure: LibraryLoadFailure) => (
    <button
      type="button"
      data-library-retry={failure.stage}
      onClick={() => retryFailure(failure)}
      disabled={loading || loadingMore || uploading}
      className="shrink-0 font-medium underline underline-offset-2 disabled:opacity-50"
    >
      {tt(libraryLoadFailureCopy(failure, hasUsableLibrarySnapshot).retryLabel)}
    </button>
  );
  const retryControl = emptyFailure ? retryControlFor(emptyFailure) : undefined;

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

  if (action?.action?.tab === "mine" && action.action.itemId === "memo") {
    return <Suspense fallback={null}><LibraryMemoPage className={className} /></Suspense>;
  }

  const emptyCopy = SECTION_EMPTY_COPY[activeSection];
  return (
    <LibraryProjectContext.Provider value={projectLookup}>
    <div
      className="relative h-full min-h-0"
      data-library-drop-zone=""
      {...dropProps}
    >
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
                <div className="flex min-w-0 items-center gap-3">
                  <h1 className={APP_PAGE_TITLE_CLASS}>
                    {typeof pageTitle === "string" ? tt(pageTitle) : pageTitle}
                  </h1>
                  {uploadMenu}
                </div>
              ) : undefined
            }
          />
          {pageTitle ? (
            <CollectionFilterRow>
              <button type="button" data-library-section="creation" aria-pressed={!attachmentSection}
                className="min-h-8 rounded-full border border-[var(--border)] px-3 text-xs" onClick={() => changeSection("creation")}>{tt("我的库")}</button>
              <button type="button" data-library-section="task" aria-pressed={attachmentSection}
                className="min-h-8 rounded-full border border-[var(--border)] px-3 text-xs" onClick={() => changeSection("task")}>{tt("任务附件")}</button>
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
          {uploadError && <StorageCapacityStrip accent={accent} />}
          <LibraryUploadQueue onCompleted={load} />
          <LibraryPurchasedUpdates items={shownSectionItems} onUpdated={load} />
          {typeof supplementalSection === "function"
            ? supplementalSection({ query: libraryQuery, favoritesOnly, section: activeSection })
            : supplementalSection}
        </div>
        )
      }
    >
      <div className="relative flex h-full min-h-0 flex-col">
        {failures.intent && (
          <section
            data-library-entry-error=""
            data-library-failure-stage="intent"
            role="status"
            className="mx-3 my-2 max-w-md shrink-0 self-start rounded-lg border border-amber-500/20 px-3 py-2 text-xs text-amber-700"
          >
            <p className="font-medium">{tt(libraryLoadFailureCopy(failures.intent).title)}</p>
            <p className="my-1">{tt(libraryLoadFailureCopy(failures.intent).description)}</p>
            {retryControlFor(failures.intent)}
          </section>
        )}
        <div className="relative min-h-0 flex-1">
        <WorkspaceLibrary
          key={directItemId ? action?.nonce : "library"}
          allowHostRestore={!directItemId}
          entries={entries}
          accent={accent}
          action={shelfAction}
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
            displayLoading
              ? "正在加载我的库…"
              : authRequired || failed
                ? failureCopy.title
                : emptyCopy.title
          }
          emptyDescription={
            authRequired || failed
              ? failureCopy.description
              : emptyCopy.description
          }
          emptyCta={failed && !authRequired ? retryControl : undefined}
          hasMore={Boolean(
            !displayLoading &&
              (nextCursor ||
                favoriteNextCursor ||
                pinnedNextCursors.document ||
                pinnedNextCursors.pdf),
          )}
          loadingMore={loadingMore}
          loading={displayLoading}
          onLoadMore={loadMore}
          className={className}
          plain={plain}
        />
        <div data-library-list-failures="" className="absolute left-3 right-3 top-3 z-30 grid gap-2">
          {(["mine", "favorites", "pagination"] as const).map((stage) => {
            const failure = failures[stage];
            if (!failure || (stage === "mine" && entries.length === 0)) return null;
            const copy = libraryLoadFailureCopy(failure, hasUsableLibrarySnapshot);
            return (
              <div
                key={stage}
                data-library-failure-stage={stage}
                data-library-failure-page={failure.page}
                role={stage === "mine" && hasUsableLibrarySnapshot ? "status" : "alert"}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-[var(--card,#fff)] px-3 py-2 text-[11px] text-amber-700 shadow-sm"
              >
                <span>{tt(copy.title)}：{tt(copy.description)}</span>
                {retryControlFor(failure)}
              </div>
            );
          })}
          {sortWarning && !failures.pagination && (
            <div role="status" className="rounded-lg border border-amber-500/20 bg-[var(--card,#fff)] px-3 py-2 text-[11px] text-amber-700 shadow-sm">
              {tt(sortWarning)}
            </div>
          )}
        </div>
        </div>
        {(uploadProgress || uploadError) && (
          <div
            role={uploadError ? "alert" : "status"}
            aria-live="polite"
            className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-[var(--fg,#1c1917)] px-3 py-2 text-[11px] text-[var(--card,#fff)] shadow-lg"
          >
            {uploadError || uploadProgress}
            {uploadError && <a href="/library#storage-capacity" className="shrink-0 underline">{tt("查看存储套餐")}</a>}
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
    {importMode && <LibraryImportDialog mode={importMode} onClose={() => setImportMode(null)} onImported={() => { changeSection("upload"); void load(); }} />}
    {linkDialogOpen && <LinkWorkDialog mode="create" onClose={() => setLinkDialogOpen(false)} />}
    <LibraryDropOverlay show={dragging} />
    </div>
    </LibraryProjectContext.Provider>
  );
}
