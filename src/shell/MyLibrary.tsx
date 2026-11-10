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
  isUploadedLibraryItem,
  libraryItemIdentityKey,
  libraryItemSection,
  sortLibraryItems,
  type LibrarySort,
  type LibraryItem,
} from "./library-data";
import { serverWorkLibraryItem } from "./works/server-work-item";
import { linkWorkLibraryItem, normalizeLinkWork } from "./works/link-work-item";
import { worksApi } from "../lib/works-api";
import type { WorkLink } from "./works/model";
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
import { chatFileLibraryItem, chatFileMatches, listLibraryChatFiles, type LibraryChatFile } from "./library-chat-files";
import type { WorkspaceActionEnvelope } from "./workspace-actions";
import { addProjectLibraryReference, deleteProjectAsset, downloadProjectAsset, removeProjectLibraryReference, useProjectLibraryScope } from "./library-project-scope";
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

const SECTION_EMPTY_COPY: Record<LibrarySource, { title: string; description: string }> = {
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
        listMyArtifacts({ offset, source, limit: LIBRARY_SORT_PAGE_SIZE, signal: pageSignal }),
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
  return (result.data.serverWorks || []).map((work) => {
    const raw = work as unknown as { source_type?: string; link_work?: unknown };
    const link = normalizeLinkWork(raw.link_work || (raw.source_type === "link" ? work : null));
    return link ? linkWorkLibraryItem(link) : serverWorkLibraryItem(work);
  });
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
  const uploaded = isUploadedLibraryItem(item);
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
  const [projectScopeSuppressed, setProjectScopeSuppressed] = useState(false);
  const hasProjectAction = Boolean(action?.action.projectId);
  const projectScoped = hasProjectAction && !projectScopeSuppressed;
  const projectScopeAction = projectScoped ? action : null;
  const projectScope = useProjectLibraryScope(projectScopeAction);
  useEffect(() => { setProjectScopeSuppressed(false); }, [action?.nonce, action?.action.projectId]);
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
  // Deprecated compatibility props: the unified Library no longer scopes by section.
  const activeSection: LibrarySource = "creation";
  // Every list read takes the section from here (`source=`), so a read started
  // right after a section click already asks for the new one.
  const sectionRef = useRef<LibrarySource>("creation");
  const loadedSectionRef = useRef<LibrarySource | null>(null);
  const [ownedItems, setOwnedItems] = useState<LibraryItem[]>([]);
  const [chatFiles, setChatFiles] = useState<LibraryChatFile[]>([]);
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
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [linkRows, setLinkRows] = useState<WorkLink[]>([{ label: "正式版", url: "" }]);
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
  const changeSection = useCallback((next: LibrarySource) => {
    // Kept for legacy hosts; there are no section tabs in the unified shelf.
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
    if (projectScoped) return projectScope.items;
    const favoriteIdentity = new Set(
      favoriteItems.map(libraryItemIdentityKey),
    );
    return documentsFirstItems(
      dedupeDurableItems([
        ...chatFiles.filter((file) => chatFileMatches(file, { query: "", category: "all" })).map((file) => ({
          ...chatFileLibraryItem(file),
          url: file.url,
          createdAt: file.created_at || undefined,
          meta: { chat_file_url: file.url, library_source_label: "来自 LeoChat" },
        } as LibraryItem)),
        ...ownedItems.map((item) =>
          favoriteIdentity.has(libraryItemIdentityKey(item))
            ? withFavoriteState(item, true)
            : item,
        ),
        ...favoriteItems,
      ]),
    );
  }, [chatFiles, favoriteItems, ownedItems, projectScope.items, projectScoped]);

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

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      const all: LibraryChatFile[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 100 && active; page += 1) {
        const result = await listLibraryChatFiles({ ...(cursor ? { cursor } : {}), limit: 100, signal: controller.signal });
        if (!result.ok) break;
        all.push(...result.items);
        if (!result.next) break;
        cursor = result.next;
      }
      if (active) setChatFiles(all);
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
          "creation",
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
      rememberOpenedLibraryItem(item, action?.nonce);
      (onOpenItem || setStandaloneEditorItem)(item);
    },
    [action?.nonce, onOpenItem],
  );
  const preloadPreviewEditor = useCallback((item: LibraryItem | null) => {
    if (item) void preloadEditorFor(item);
  }, []);

  const projectEntryActions = useCallback((entry: WorkspaceLibraryEntry): ReactNode => {
    if (!hasProjectAction || !entry.libraryItem || !action?.action.projectId) return null;
    const item = entry.libraryItem;
    const projectId = action.action.projectId;
    const projectName = action.action.projectName || projectId;
    const run = async (operation: () => Promise<void>, notice?: string) => {
      try { await operation(); projectScope.reload(); if (notice) setUploadError(tt(notice)); }
      catch (error) { setUploadError(error instanceof Error ? error.message : tt("操作失败，请重试")); }
    };
    if (projectScoped && item.meta.project_reference) {
      const kind = item.meta.project_reference_kind === "work" ? "work" : "artifact";
      return <button type="button" className="text-[11px] underline" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void run(() => removeProjectLibraryReference(projectId, kind, item.id)); }}>{tt("从项目移除")}</button>;
    }
    if (projectScoped && item.meta.project_asset) {
      return <span className="flex gap-2"><button type="button" className="text-[11px] underline" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void run(() => downloadProjectAsset(projectId, item.id, item.title)); }}>{tt("下载")}</button>{projectScope.canEdit ? <button type="button" className="text-[11px] underline" onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (window.confirm(tt("确认删除项目文件吗？"))) void run(() => deleteProjectAsset(projectId, item.id)); }}>{tt("删除")}</button> : null}</span>;
    }
    if (!projectScoped) {
      const kind = item.meta.link_work ? "work" : "artifact";
      const id = kind === "work" ? item.id : (item.artifactId || item.id);
      return <button type="button" className="text-[11px] underline" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void run(() => addProjectLibraryReference(projectId, kind, id), "已加入项目"); }}>{tt("加入项目「{name}」", { name: projectName })}</button>;
    }
    return null;
  }, [action?.action.projectId, action?.action.projectName, hasProjectAction, projectScope, projectScoped, tt]);

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
    // The cursors belong to the section the last load read.
    const source = loadedSectionRef.current ?? sectionRef.current;
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
            listMyArtifacts({ limit: LIBRARY_SORT_PAGE_SIZE, signal: controller.signal }),
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
          if (projectScoped && action?.action.projectId && uploadedItem) {
            await addProjectLibraryReference(action.action.projectId, "artifact", uploadedItem.artifactId || uploadedItem.id);
            projectScope.reload();
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
    [action?.action.projectId, changeSection, load, ownerPrincipalId, projectScope, projectScoped, siteId, uploading],
  );
  const retryFailedUploads = useCallback(() => {
    void handleUpload(retryableUploadFiles, true);
  }, [handleUpload, retryableUploadFiles]);

  // A dropped folder is zipped here and becomes a 文件包 (the folder module loads only when one is dropped).
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
                `${tt(phase === "zipping" ? "正在打包文件夹…" : "正在上传文件包…")} · ${folder.name}`,
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
      (item) => (!favoritesOnly || item.favorite) && (!itemFilter || itemFilter(item)),
    ),
    [favoritesOnly, itemFilter, orderedItems],
  );
  const entries = useMemo(
    () =>
      dedupeWorkspaceEntries([
        ...(projectScoped ? shownSectionItems.map((item) => workspaceEntryFromLibraryItem(item, { description: String(item.meta.folder_path || item.meta.library_source_label || "") })) : []),
        ...shownSectionItems
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
                // A task output shows in the section its Library copy is in.
                shownSectionItems.some(
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
      shownSectionItems,
      favoritesOnly,
      ownerPrincipalId,
      previewIntentItem,
      removeItem,
      projectScoped,
    ],
  );
  const failureCopy = myLibraryFailure(failureStatus);
  const uploadFilePicker = (
    <label
      data-library-upload-file=""
      className={`${COLLECTION_ACTION_BTN_PRIMARY} cursor-pointer ${
        uploadBlocked ? "pointer-events-none opacity-50" : ""
      }`}
    >
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
      {tt("上传文件")}
    </label>
  );
  const saveLink = async () => {
    const links = linkRows.map((link) => ({ label: link.label.trim(), url: link.url.trim() }));
    if (!linkTitle.trim()) return setUploadError(tt("请填写标题"));
    if (!links.length || links.length > 8 || links.some((link) => !link.label || link.label.length > 40 || !/^https:\/\/[^#\s]+$/i.test(link.url))) return setUploadError(tt("请填写有效的 HTTPS 链接和标签"));
    try {
      const created = await worksApi.createLink({ title: linkTitle.trim(), links, note: linkNote.trim() });
      if (projectScoped && action?.action.projectId) { await addProjectLibraryReference(action.action.projectId, "work", created.id); projectScope.reload(); }
      setLinkDialogOpen(false); setLinkTitle(""); setLinkNote(""); setLinkRows([{ label: "正式版", url: "" }]); setUploadError(""); window.dispatchEvent(new CustomEvent("oceanleo:artifact-library-change"));
    } catch { setUploadError(tt("保存失败，请重试")); }
  };
  const uploadMenu = pageTitle && folderPickable ? (
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
        <FloatingMenuItem
          label={tt("上传文件夹")}
          disabled={uploadBlocked}
          onSelect={() => {
            setUploadMenuOpen(false);
            folderInputRef.current?.click();
          }}
        />
        <FloatingMenuItem label={tt("添加链接")} disabled={uploadBlocked} onSelect={() => { setUploadMenuOpen(false); setLinkDialogOpen(true); }} />
      </FloatingMenu>
    </div>
  ) : pageTitle ? (
    <label
      data-library-upload-file=""
      className={`${COLLECTION_ACTION_BTN_PRIMARY} cursor-pointer ${uploadBlocked ? "pointer-events-none opacity-50" : ""}`}
    >
      <input
        ref={uploadFileInputRef}
        type="file"
        multiple
        className="sr-only"
        disabled={uploadBlocked}
        onChange={(event) => {
          void handleUpload(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      {tt(uploading ? "上传中…" : "上传")}
    </label>
  ) : (
    <div className="flex shrink-0 flex-wrap items-center gap-2">{uploadFilePicker}</div>
  );
  const toolbar = pageTitle ? null : (
    <div className="flex shrink-0 flex-wrap items-center gap-2">{uploadFilePicker}</div>
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

  if (action?.action?.tab === "mine" && action.action.itemId === "memo") {
    return <Suspense fallback={null}><LibraryMemoPage className={className} /></Suspense>;
  }

  const emptyCopy = SECTION_EMPTY_COPY.creation;
  return (
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
          {hasProjectAction ? (
            <div className="mt-3 flex items-center justify-between rounded-md border border-[var(--line,#e5e7eb)] px-3 py-2 text-xs" data-library-project-scope="">
              <span>{projectScoped ? (projectScope.loading ? tt("正在加载项目素材…") : projectScope.error ? tt("项目素材暂时无法加载") : tt("项目「{name}」的素材", { name: action?.action.projectName || action?.action.projectId || "" })) : tt("回到项目「{name}」的素材", { name: action?.action.projectName || action?.action.projectId || "" })}</span>
              <button type="button" className="font-medium underline underline-offset-2" onClick={() => setProjectScopeSuppressed((value) => !value)}>{tt(projectScoped ? "显示整个 Library" : "回到项目")}</button>
            </div>
          ) : null}
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
          {typeof supplementalSection === "function"
            ? supplementalSection({ query: libraryQuery, favoritesOnly, section: activeSection })
            : supplementalSection}
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
          onOpenEntry={(entry) => {
            const url = typeof entry.libraryItem?.meta.chat_file_url === "string" ? entry.libraryItem.meta.chat_file_url : "";
            if (url) window.open(url, "_blank", "noopener,noreferrer");
          }}
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
          entryActions={hasProjectAction ? projectEntryActions : undefined}
          searchPlaceholder="search"
          emptyTitle={
            loading
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
    {linkDialogOpen && (
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] grid place-items-center bg-black/30 p-4">
        <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
          <h2 className="text-base font-semibold">{tt("添加链接")}</h2>
          <input className="mt-4 w-full rounded border p-2 text-sm" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder={tt("标题")} />
          {linkRows.map((link, index) => <div key={index} className="mt-2 flex gap-2"><input className="w-28 rounded border p-2 text-sm" value={link.label} onChange={(e) => setLinkRows((all) => all.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} placeholder={tt("标签")} /><input className="min-w-0 flex-1 rounded border p-2 text-sm" value={link.url} onChange={(e) => setLinkRows((all) => all.map((item, i) => i === index ? { ...item, url: e.target.value } : item))} placeholder="https://" /></div>)}
          {linkRows.length < 8 && <button type="button" className="mt-2 text-xs underline" onClick={() => setLinkRows((all) => [...all, { label: "开发版", url: "" }])}>{tt("＋ 再加一条")}</button>}
          <textarea className="mt-3 w-full rounded border p-2 text-sm" value={linkNote} onChange={(e) => setLinkNote(e.target.value)} placeholder={tt("备注（可选）")} />
          <div className="mt-4 flex justify-end gap-2"><button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setLinkDialogOpen(false)}>{tt("取消")}</button><button type="button" className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white" onClick={() => void saveLink()}>{tt("保存")}</button></div>
        </div>
      </div>
    )}
    <LibraryDropOverlay show={dragging} />
    </div>
  );
}
