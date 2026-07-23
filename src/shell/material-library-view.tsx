"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  ARTIFACT_TYPES,
  artifactIsVisible,
  type ArtifactContextRef,
  type ArtifactType,
} from "./artifact-contract";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import {
  ARTIFACT_LIBRARY_CHANGE_EVENT,
  getArtifactItem,
} from "./artifact-client";
import { isAdvancedEditableShelfItem } from "./advanced-features";
import {
  MATERIAL_TAXONOMY_LABEL,
  artifactEntry,
  invalidateMaterialLibraryCache,
  libraryItemHasExactPrimaryContext,
  materialToEntry,
  materialLibraryRequestKey,
  mergeMaterialEntries,
  normalizedMaterialTaxonomy,
  queryMaterialLibrary,
  readMaterialLibraryCache,
  type MaterialItem,
  type MaterialLibraryQueryInput,
  type MaterialLibraryLevel,
} from "./material-library-controller";
import {
  WorkspaceLibrary,
  type WorkspaceLibraryEntry,
  type WorkspaceLibraryProps,
} from "./WorkspaceLibrary";
import { useOptionalWorkspaceSession } from "./WorkspaceSession";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import {
  materialScopeKey,
  registerWorkbenchMaterialSource,
} from "./workbench-material-registry";
import type { WorkspaceActionEnvelope } from "./workspace-actions";

export interface MaterialLibraryProps {
  materials: MaterialItem[];
  accent?: string;
  emptyHint?: string;
  className?: string;
  onSeeAll?: () => void;
  seeAllHref?: string;
  hideSeeAll?: boolean;
  seeAllLabel?: string;
  featuredEntries?: WorkspaceLibraryEntry[];
  action?: WorkspaceActionEnvelope | null;
  taskId?: string | null;
  siteId?: string;
  appId?: string;
  contextId?: string;
  functionId?: string;
  fetchCurated?: boolean;
  fetchPrimary?: boolean;
  fetchMore?: boolean;
  curatedType?: string;
  curatedSeriesId?: string;
  initialLevel?: MaterialLibraryLevel;
  lockLevel?: MaterialLibraryLevel;
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
  materialActionEvidence?: WorkspaceLibraryProps["materialActionEvidence"];
  primaryMaterialAction?: WorkbenchMaterialAction;
  draggableMaterials?: boolean;
  onMaterialDragStart?: (item: LibraryItem) => void;
  onMaterialDragEnd?: () => void;
  allowAdvancedOnSelect?: boolean;
  onOpenItem?: (item: LibraryItem) => void;
}

const MATERIAL_LIBRARY_BASE = "https://asset.oceanleo.com/materials";

function materialLibraryHref(options: {
  query?: string;
  taxonomy?: ArtifactType | "";
  item?: LibraryItem;
}): string {
  const url = new URL(MATERIAL_LIBRARY_BASE);
  if (options.query?.trim()) url.searchParams.set("q", options.query.trim());
  if (options.taxonomy) {
    url.searchParams.set("taxonomy", options.taxonomy);
  }
  if (options.item && isDurableLibraryItem(options.item)) {
    url.searchParams.set("artifactId", options.item.artifactId);
    url.searchParams.set("revisionId", options.item.revisionId);
  }
  return url.toString();
}

function safeCompleteLibraryHref(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value, MATERIAL_LIBRARY_BASE);
    return url.protocol === "https:" &&
      url.hostname === "asset.oceanleo.com" &&
      url.pathname === "/materials"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function materialFailureCopy(status: number | undefined, _message: string): {
  title: string;
  description: string;
} {
  if (status === 401) {
    return {
      title: "登录后访问素材库",
      description: "登录后可查看当前 App 素材和可编辑模板。",
    };
  }
  if (status === 403) {
    return {
      title: "当前账号无权访问素材库",
      description: "当前账号无法查看这组素材。",
    };
  }
  if (status === 503) {
    return {
      title: "素材库服务暂时不可用",
      description: "服务端正在维护或过载，请稍后重试。",
    };
  }
  return {
    title: "素材暂时无法显示",
    description: "素材数据未通过安全检查，请重试。",
  };
}

function isTrustedEditableMaterialEntry(
  entry: WorkspaceLibraryEntry,
): boolean {
  const item = entry.libraryItem;
  return Boolean(
    item &&
      isDurableLibraryItem(item) &&
      artifactIsVisible(item.artifact) &&
      isAdvancedEditableShelfItem(item),
  );
}

function entriesFromRemoteResult(
  items: readonly LibraryItem[],
  level: MaterialLibraryLevel,
  context: ArtifactContextRef,
  query: string,
  taxonomy: ArtifactType | "",
): WorkspaceLibraryEntry[] {
  const scopedItems =
    level === "primary"
      ? items.filter((item) =>
          libraryItemHasExactPrimaryContext(item, context),
        )
      : items;
  return scopedItems.map((item) => ({
    ...artifactEntry(item, level === "more" && Boolean(query)),
    linkUrl: materialLibraryHref({
      query: level === "more" ? query : "",
      taxonomy,
      item,
    }),
  }));
}

/**
 * Controller/view facade for the two-level material library. Query decoding,
 * normalization and page merging stay in material-library-controller.
 */
export function MaterialLibrary({
  materials,
  accent = "#4f46e5",
  emptyHint,
  className = "",
  onSeeAll,
  seeAllHref,
  hideSeeAll = false,
  seeAllLabel = "更多素材",
  featuredEntries = [],
  action,
  taskId,
  siteId = "",
  appId = "",
  contextId = "",
  functionId = "",
  fetchCurated = true,
  fetchPrimary,
  fetchMore = true,
  curatedType = "all",
  initialLevel = "primary",
  lockLevel,
  registerRuntimeSource = true,
  materialActions = [],
  onMaterialAction,
  materialActionAvailable,
  materialActionEvidence,
  primaryMaterialAction,
  draggableMaterials,
  onMaterialDragStart,
  onMaterialDragEnd,
  allowAdvancedOnSelect = true,
  onOpenItem,
}: MaterialLibraryProps) {
  const tt = useUI();
  const taxonomyId = useId();
  const workspaceSession = useOptionalWorkspaceSession();
  const runtimeAppId = appId || workspaceSession?.appId || "default";
  const primaryFetchEnabled = fetchPrimary ?? fetchCurated;
  const [level, setLevel] = useState<MaterialLibraryLevel>(
    lockLevel || initialLevel,
  );
  const [query, setQuery] = useState(action?.action.query || "");
  const [debounced, setDebounced] = useState(query);
  const [taxonomy, setTaxonomy] = useState<ArtifactType | "">(
    normalizedMaterialTaxonomy(curatedType),
  );
  const context = useMemo<ArtifactContextRef>(
    () => ({
      contextId,
      siteKey: siteId,
      appId: runtimeAppId,
      functionId: functionId || undefined,
    }),
    [contextId, functionId, runtimeAppId, siteId],
  );
  const materialRequest = useMemo<MaterialLibraryQueryInput>(
    () => ({
      level,
      context,
      query: debounced,
      taxonomy,
    }),
    [context, debounced, level, taxonomy],
  );
  const remoteRequestKey = useMemo(
    () => materialLibraryRequestKey(materialRequest),
    [materialRequest],
  );
  const initialFetchEnabled =
    (level === "primary" ? primaryFetchEnabled : fetchMore) &&
    (level === "more" || Boolean(context.contextId && context.siteKey));
  const initialCache = initialFetchEnabled
    ? readMaterialLibraryCache(materialRequest)
    : null;
  const runtimeSourceRef = useRef(Symbol("material-library"));
  const requestEpochRef = useRef(0);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const successfulRemoteRequestKeyRef = useRef(
    initialCache ? remoteRequestKey : "",
  );
  const [remote, setRemote] = useState<WorkspaceLibraryEntry[]>(() =>
    initialCache
      ? entriesFromRemoteResult(
          initialCache.data.items,
          level,
          context,
          debounced,
          taxonomy,
        )
      : [],
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialCache?.data.nextCursor || null,
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState<number | undefined>();
  const [deepLinkedEntry, setDeepLinkedEntry] =
    useState<WorkspaceLibraryEntry | null>(null);
  const [deepLinkError, setDeepLinkError] = useState("");
  const [deepLinkStatus, setDeepLinkStatus] =
    useState<number | undefined>();
  const [retryNonce, setRetryNonce] = useState(0);
  const [standaloneEditorItem, setStandaloneEditorItem] =
    useState<LibraryItem | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(
    () => () => {
      loadMoreAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const refresh = (event: Event) => {
      invalidateMaterialLibraryCache();
      const detail = (event as CustomEvent<{
        action?: string;
        artifactId?: string;
        revisionId?: string;
        favorite?: boolean;
      }>).detail;
      if (
        detail?.action === "favorite" &&
        detail.artifactId &&
        detail.revisionId
      ) {
        const update = (entry: WorkspaceLibraryEntry) => {
          const item = entry.libraryItem;
          if (
            !item ||
            !isDurableLibraryItem(item) ||
            item.artifactId !== detail.artifactId ||
            item.revisionId !== detail.revisionId
          ) {
            return entry;
          }
          const updatedItem: LibraryItem = {
            ...item,
            favorite: detail.favorite === true,
            artifact: {
              ...item.artifact,
              favorite: detail.favorite === true,
            },
          };
          return {
            ...entry,
            libraryItem: updatedItem,
          };
        };
        setRemote((current) => current.map(update));
        setDeepLinkedEntry((current) => (current ? update(current) : null));
        return;
      }
      if (detail?.action === "retire" && detail.artifactId) {
        setRemote((current) =>
          current.filter(
            (entry) =>
              !entry.libraryItem ||
              !isDurableLibraryItem(entry.libraryItem) ||
              entry.libraryItem.artifactId !== detail.artifactId,
          ),
        );
        setDeepLinkedEntry((current) =>
          current?.libraryItem &&
          isDurableLibraryItem(current.libraryItem) &&
          current.libraryItem.artifactId === detail.artifactId
            ? null
            : current,
        );
        return;
      }
      setRetryNonce((value) => value + 1);
    };
    window.addEventListener(ARTIFACT_LIBRARY_CHANGE_EVENT, refresh);
    return () =>
      window.removeEventListener(ARTIFACT_LIBRARY_CHANGE_EVENT, refresh);
  }, []);

  useEffect(() => {
    setLevel(lockLevel || initialLevel);
    setQuery("");
  }, [
    contextId,
    functionId,
    initialLevel,
    lockLevel,
    runtimeAppId,
    siteId,
  ]);

  useEffect(() => {
    setTaxonomy(normalizedMaterialTaxonomy(curatedType));
  }, [curatedType]);

  useEffect(() => {
    if (action?.action.query !== undefined) {
      setQuery(action.action.query);
    }
  }, [action?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const itemId = action?.action.itemId || "";
    const match = /^artifact:([^:]+):([^:]+)$/.exec(itemId);
    setDeepLinkedEntry(null);
    setDeepLinkError("");
    setDeepLinkStatus(undefined);
    if (!itemId) return;
    if (!match) {
      setDeepLinkError("素材深链缺少有效 artifact/revision identity。");
      setDeepLinkStatus(400);
      return;
    }
    const controller = new AbortController();
    void getArtifactItem(match[1], match[2], controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        const item = result.data;
        const artifact = item?.artifact;
        const trustedItem = Boolean(
          item &&
            artifact &&
            isDurableLibraryItem(item) &&
            artifactIsVisible(artifact) &&
            isAdvancedEditableShelfItem(item),
        );
        const inScope = Boolean(
          result.ok &&
            item &&
            artifact &&
            trustedItem &&
            (!taxonomy || item.artifactType === taxonomy) &&
            (level === "more"
              ? artifact.owner.visibility === "public" &&
                artifact.roles.includes("template")
              : libraryItemHasExactPrimaryContext(item, context)),
        );
        if (!inScope || !item) {
          setDeepLinkError(
            result.error ||
              "深链 artifact/revision 不属于当前授权范围或 taxonomy。",
          );
          setDeepLinkStatus(result.status || 403);
          return;
        }
        setDeepLinkedEntry({
          ...artifactEntry(item),
          linkUrl: materialLibraryHref({
            query: action?.action.query || "",
            taxonomy,
            item,
          }),
        });
      },
    );
    return () => controller.abort();
  }, [action?.nonce, context, level, retryNonce, taxonomy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (level === "primary" && (!context.contextId || !context.siteKey)) {
      loadMoreAbortRef.current?.abort();
      requestEpochRef.current += 1;
      setRemote([]);
      setNextCursor(null);
      setLoading(false);
      setLoadingMore(false);
      successfulRemoteRequestKeyRef.current = "";
      // A missing context is a normal setup state (site did not derive a
      // binding yet), not a failure: fall through to the friendly empty
      // shelf and any site-curated featured materials.
      setError("");
      setErrorStatus(undefined);
      return;
    }
    const fetchEnabled = level === "primary" ? primaryFetchEnabled : fetchMore;
    if (!fetchEnabled) {
      setRemote([]);
      setNextCursor(null);
      setLoading(false);
      setLoadingMore(false);
      successfulRemoteRequestKeyRef.current = "";
      setError("");
      setErrorStatus(undefined);
      return;
    }
    loadMoreAbortRef.current?.abort();
    const cached = readMaterialLibraryCache(materialRequest);
    if (cached) {
      successfulRemoteRequestKeyRef.current = remoteRequestKey;
      setRemote(
        entriesFromRemoteResult(
          cached.data.items,
          level,
          context,
          debounced,
          taxonomy,
        ),
      );
      setNextCursor(cached.data.nextCursor);
      setLoadingMore(false);
      setError("");
      setErrorStatus(undefined);
      if (cached.freshness === "fresh") {
        setLoading(false);
        return;
      }
    }
    const controller = new AbortController();
    const epoch = ++requestEpochRef.current;
    const requestChanged =
      successfulRemoteRequestKeyRef.current !== remoteRequestKey;
    if (requestChanged && !cached) {
      setRemote([]);
      setNextCursor(null);
    }
    setLoading(true);
    setLoadingMore(false);
    setError("");
    setErrorStatus(undefined);
    void queryMaterialLibrary({
      ...materialRequest,
      forceRefresh: cached?.freshness === "stale",
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted || epoch !== requestEpochRef.current) {
        return;
      }
      if (!result.ok || !result.data) {
        // "This app has no binding yet" class responses (missing context,
        // unknown context, no bindings) are a normal empty shelf, not a
        // failure banner.
        const noBinding =
          level === "primary" &&
          (result.status === 400 || result.status === 404) &&
          (result.code === "invalid-binding" || result.code === "not-found");
        if (noBinding) {
          successfulRemoteRequestKeyRef.current = remoteRequestKey;
          setRemote([]);
          setNextCursor(null);
          setError("");
          setErrorStatus(undefined);
        } else {
          setError(result.error || "素材库暂时无法加载。");
          setErrorStatus(result.status);
        }
      } else {
        successfulRemoteRequestKeyRef.current = remoteRequestKey;
        setRemote(
          entriesFromRemoteResult(
            result.data.items,
            level,
            context,
            debounced,
            taxonomy,
          ),
        );
        setNextCursor(result.data.nextCursor);
        setError("");
        setErrorStatus(undefined);
      }
      setLoading(false);
    }).catch((caught) => {
      if (controller.signal.aborted || epoch !== requestEpochRef.current) {
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "素材库请求失败，请重试。",
      );
      setErrorStatus(0);
      setLoading(false);
    });
    return () => controller.abort();
  }, [
    context,
    debounced,
    fetchMore,
    level,
    materialRequest,
    primaryFetchEnabled,
    remoteRequestKey,
    retryNonce,
    taxonomy,
  ]);

  const loadMore = async () => {
    if (level !== "more" || !fetchMore || !nextCursor || loadingMore) {
      return;
    }
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    const epoch = ++requestEpochRef.current;
    setLoadingMore(true);
    const result = await queryMaterialLibrary({
      level: "more",
      context,
      query: debounced,
      taxonomy,
      cursor: nextCursor,
      signal: controller.signal,
    });
    if (controller.signal.aborted || epoch !== requestEpochRef.current) {
      return;
    }
    if (result.ok && result.data) {
      setRemote((current) =>
        mergeMaterialEntries([
          current,
          result.data!.items
            .filter(isAdvancedEditableShelfItem)
            .map((item) => ({
              ...artifactEntry(item, Boolean(debounced)),
              linkUrl: materialLibraryHref({
                query: debounced,
                taxonomy,
                item,
              }),
            })),
        ]),
      );
      setNextCursor(result.data.nextCursor);
      setError("");
      setErrorStatus(undefined);
    } else {
      setError(result.error || "继续加载失败，请重试。");
      setErrorStatus(result.status);
    }
    setLoadingMore(false);
  };

  const localEntries = useMemo(
    () => materials.map(materialToEntry),
    [materials],
  );
  const exactLocalEntries = useMemo(
    () =>
      [...featuredEntries, ...localEntries].filter((entry) => {
        const item = entry.libraryItem;
        return Boolean(
          item &&
            isDurableLibraryItem(item) &&
            contextId &&
            artifactIsVisible(item.artifact) &&
            isAdvancedEditableShelfItem(item) &&
            (!taxonomy || item.artifactType === taxonomy) &&
            libraryItemHasExactPrimaryContext(item, context),
        );
      }),
    [context, featuredEntries, localEntries, taxonomy],
  );
  const entries = useMemo(
    () => {
      const deepLinked =
        !deepLinkError && deepLinkedEntry ? [deepLinkedEntry] : [];
      const merged = level === "primary"
        ? mergeMaterialEntries([
            deepLinked,
            remote,
            exactLocalEntries,
          ])
        : mergeMaterialEntries([deepLinked, remote]);
      return merged.filter(isTrustedEditableMaterialEntry);
    },
    [
      deepLinkError,
      deepLinkedEntry,
      exactLocalEntries,
      level,
      remote,
    ],
  );
  const openPreparedItem = useCallback(
    (item: LibraryItem) => {
      if (!isAdvancedEditableShelfItem(item)) {
        setError("editor-source-unavailable");
        setErrorStatus(422);
        throw new Error("当前 revision 缺少可验证的编辑器 source。");
      }
      if (onOpenItem) {
        onOpenItem(item);
      } else {
        setStandaloneEditorItem(item);
      }
    },
    [onOpenItem],
  );
  useEffect(() => {
    if (!registerRuntimeSource) return;
    return registerWorkbenchMaterialSource(
      materialScopeKey(siteId, runtimeAppId),
      runtimeSourceRef.current,
      entries,
    );
  }, [entries, registerRuntimeSource, runtimeAppId, siteId]);

  const contextMissing =
    level === "primary" && (!context.contextId || !context.siteKey);
  const effectiveError = deepLinkError || error;
  const effectiveErrorStatus = deepLinkError
    ? deepLinkStatus
    : errorStatus;
  const failureCopy = materialFailureCopy(
    effectiveErrorStatus,
    effectiveError,
  );
  const canonicalMoreHref = materialLibraryHref({
    query,
    taxonomy,
  });
  const completeLibraryHref =
    safeCompleteLibraryHref(seeAllHref) || canonicalMoreHref;
  const primaryMoreControl = hideSeeAll ? null : onSeeAll ? (
    <a
      href={completeLibraryHref}
      onClick={(event) => {
        event.preventDefault();
        onSeeAll();
      }}
      className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      aria-label={tt("打开完整素材库")}
    >
      {tt(seeAllLabel)} →
    </a>
  ) : seeAllHref ? (
    <a
      href={completeLibraryHref}
      className="inline-flex min-h-8 items-center whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      aria-label={tt("打开完整素材库")}
    >
      {tt(seeAllLabel)} →
    </a>
  ) : fetchMore ? (
    <a
      href={canonicalMoreHref}
      onClick={(event) => {
        event.preventDefault();
        setLevel("more");
        setQuery("");
      }}
      className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      aria-label={tt("打开完整素材库")}
    >
      {tt(seeAllLabel)} →
    </a>
  ) : null;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        data-material-library-scope={level}
        className="whitespace-nowrap text-[11px] font-semibold text-[var(--fg,#292524)]"
      >
        {tt(level === "primary" ? "当前 App" : "更多素材")}
      </span>
      {level === "primary" ? (
        primaryMoreControl
      ) : lockLevel ? null : (
        <button
          type="button"
          onClick={() => {
            setLevel(lockLevel || "primary");
            setQuery("");
          }}
          className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
        >
          ← {tt("当前 App")}
        </button>
      )}
      <label className="sr-only" htmlFor={taxonomyId}>
        {tt("货架")}
      </label>
      <select
        id={taxonomyId}
        value={taxonomy}
        onChange={(event) =>
          setTaxonomy(event.currentTarget.value as ArtifactType | "")
        }
        aria-label={tt("货架")}
        className="min-h-8 rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 text-[11px] text-[var(--fg-2,#57534e)]"
      >
        <option value="">{tt("全部类型")}</option>
        {ARTIFACT_TYPES.map((type) => (
          <option key={type} value={type}>
            {tt(MATERIAL_TAXONOMY_LABEL[type])}
          </option>
        ))}
      </select>
      {nextCursor && level === "more" && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="min-h-8 rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium disabled:opacity-50"
        >
          {tt(loadingMore ? "加载中…" : "继续加载")}
        </button>
      )}
      {effectiveError &&
        effectiveErrorStatus !== 401 &&
        effectiveErrorStatus !== 403 &&
        (level === "more" ? fetchMore : primaryFetchEnabled) && (
        <button
          type="button"
          onClick={() => {
            invalidateMaterialLibraryCache(materialRequest);
            setRetryNonce((value) => value + 1);
          }}
          className="min-h-8 rounded-lg border border-amber-500/30 px-2.5 text-[11px] font-medium text-amber-700"
        >
          {tt("重试")}
        </button>
      )}
      {effectiveError && entries.length > 0 && (
        <span
          role="alert"
          className="max-w-md text-[11px] text-rose-700"
        >
          {tt(failureCopy.title)}：{tt(failureCopy.description)}
        </span>
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
          appId={runtimeAppId}
          accent={accent}
          embedded
          onSavedItem={setStandaloneEditorItem}
          onClose={() => setStandaloneEditorItem(null)}
        />
      </div>
    );
  }

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
      hideCategoryChips
      toolbarActions={toolbar}
      searchPlaceholder={
        level === "primary"
          ? "筛选当前 App 可编辑素材"
          : "搜索可编辑模板"
      }
      emptyTitle={
        loading
          ? "正在加载素材…"
          : effectiveError
            ? failureCopy.title
            : level === "primary"
              ? "当前 App 暂无可编辑素材"
              : "暂无可编辑模板"
      }
      emptyDescription={
        effectiveError
          ? failureCopy.description
          : level === "primary"
            ? emptyHint ||
              (contextMissing
                ? "当前 App 暂未提供可用素材。"
                : "这里只显示当前 App 已绑定且可安全编辑的素材；可前往「更多素材」查找模板。")
            : emptyHint ||
              "这里只显示可在高级编辑器中打开并保存的模板；可更换关键词或类型。"
      }
      materialActions={materialActions}
      onMaterialAction={onMaterialAction}
      materialActionAvailable={materialActionAvailable}
      materialActionEvidence={materialActionEvidence}
      primaryMaterialAction={primaryMaterialAction}
      draggableMaterials={draggableMaterials}
      onMaterialDragStart={onMaterialDragStart}
      onMaterialDragEnd={onMaterialDragEnd}
      allowAdvanced={allowAdvancedOnSelect}
      onOpenItem={openPreparedItem}
      className={className}
    />
  );
}
