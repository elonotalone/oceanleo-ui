"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  artifactIsVisible,
  type ArtifactContextRef,
  type ArtifactType,
} from "./artifact-contract";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import { isAdvancedEditableShelfItem } from "./advanced-features";
import {
  artifactEntry,
  invalidateMaterialLibraryCache,
  libraryItemHasExactPrimaryContext,
  materialToEntry,
  materialLibraryRequestKey,
  materialTypesCsv,
  mergeMaterialEntries,
  normalizedMaterialTaxonomy,
  queryMaterialLibrary,
  readMaterialLibraryCache,
  type MaterialLibraryQueryInput,
  type MaterialLibraryLevel,
} from "./material-library-controller";
import { templateDeepLinkAction } from "./material-library-template-source";
import { MaterialTypeFilter } from "./material-library-type-filter";
import {
  MATERIAL_LEVEL_LABEL,
  entriesFromRemoteResult,
  materialFailureCopy,
  materialLevelEmptyDescription,
  materialLevelEmptyTitle,
  materialLevelSearchPlaceholder,
  materialLibraryHref,
  materialShelfEntries,
  materialShelfFailure,
  safeCompleteLibraryHref,
  type MaterialLibraryProps,
} from "./material-library-presentation";
import {
  useMaterialLibraryChangeEvents,
  useMaterialLibraryDeepLink,
  useMaterialLibraryPreviewIntent,
  useOfficialTemplateMaterials,
} from "./material-library-effects";
import { materialEntryDownloadAction } from "./material-library-download";
import {
  WorkspaceLibrary,
  type WorkspaceLibraryEntry,
} from "./WorkspaceLibrary";
import { useOptionalWorkspaceSession } from "./WorkspaceSession";
import {
  materialScopeKey,
  registerWorkbenchMaterialSource,
} from "./workbench-material-registry";

export type { MaterialLibraryProps } from "./material-library-presentation";

const DEFAULT_LEVELS: readonly MaterialLibraryLevel[] = ["primary", "more"];

function orderedLevels(
  levels: readonly MaterialLibraryLevel[],
): MaterialLibraryLevel[] {
  const wanted = new Set(levels);
  return (["primary", "site", "more"] as const).filter((level) =>
    wanted.has(level),
  );
}

/**
 * Controller/view facade for the three-level material library
 * (此 app ｜ 本站素材 ｜ 更多素材). Query decoding, normalization, scoping and
 * page merging stay in material-library-controller / -scope.
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
  levels,
  cardDownload,
  types: controlledTypes,
  onTypesChange,
  onLevelChange,
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
  const workspaceSession = useOptionalWorkspaceSession();
  const runtimeAppId = appId || workspaceSession?.appId || "default";
  const primaryFetchEnabled = fetchPrimary ?? fetchCurated;
  // Multi-select chips are the explore-page filter; drawers keep the compact
  // taxonomy dropdown they render today.
  const multiSelectTypes = Boolean(levels || controlledTypes || onTypesChange);
  const sections = useMemo(
    () => orderedLevels(lockLevel ? [lockLevel] : levels || DEFAULT_LEVELS),
    [levels, lockLevel],
  );
  const [level, setLevel] = useState<MaterialLibraryLevel>(
    lockLevel || initialLevel,
  );
  const [query, setQuery] = useState(action?.action.query || "");
  const [debounced, setDebounced] = useState(query);
  const [internalTypes, setInternalTypes] = useState<ArtifactType[]>(() => {
    const single = normalizedMaterialTaxonomy(curatedType);
    return single ? [single] : [];
  });
  const selectedTypes = useMemo(
    () => (controlledTypes ? [...controlledTypes] : internalTypes),
    [controlledTypes, internalTypes],
  );
  const typesCsv = materialTypesCsv(selectedTypes);
  const taxonomy: ArtifactType | "" =
    selectedTypes.length === 1 ? selectedTypes[0] : "";
  const applyTypes = useCallback(
    (next: ArtifactType[]) => {
      if (!controlledTypes) setInternalTypes(next);
      onTypesChange?.(next);
    },
    [controlledTypes, onTypesChange],
  );
  const goToLevel = useCallback(
    (next: MaterialLibraryLevel) => {
      setLevel(next);
      setQuery("");
      onLevelChange?.(next);
    },
    [onLevelChange],
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
      types: typesCsv ? (typesCsv.split(",") as ArtifactType[]) : [],
    }),
    [context, debounced, level, taxonomy, typesCsv],
  );
  const remoteRequestKey = useMemo(
    () => materialLibraryRequestKey(materialRequest),
    [materialRequest],
  );
  const levelFetchEnabled =
    level === "primary" ? primaryFetchEnabled : fetchMore;
  const initialFetchEnabled =
    levelFetchEnabled &&
    (level !== "primary" || Boolean(context.contextId && context.siteKey));
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

  useMaterialLibraryChangeEvents({
    setRemote,
    setDeepLinkedEntry,
    setRetryNonce,
  });

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
    if (controlledTypes) return;
    const single = normalizedMaterialTaxonomy(curatedType);
    setInternalTypes(single ? [single] : []);
  }, [controlledTypes, curatedType]);

  useEffect(() => {
    if (action?.action.query !== undefined) {
      setQuery(action.action.query);
    }
  }, [action?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useMaterialLibraryDeepLink({
    nonce: action?.nonce,
    itemId: action?.action.itemId || "",
    query: action?.action.query || "",
    level,
    context,
    taxonomy,
    retryNonce,
    setDeepLinkedEntry,
    setDeepLinkError,
    setDeepLinkStatus,
  });

  // 官方模板素材：面板以前只认带权限的 `/v1/library/*`，匿名进来就是空货架。
  const templateShelf = useOfficialTemplateMaterials({
    level,
    siteKey: siteId,
    appId: runtimeAppId,
    itemId: action?.action.itemId || "",
    types: selectedTypes,
  });

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
    if (level === "primary" || !fetchMore || !nextCursor || loadingMore) {
      return;
    }
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    const epoch = ++requestEpochRef.current;
    setLoadingMore(true);
    const result = await queryMaterialLibrary({
      ...materialRequest,
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
    () =>
      materialShelfEntries({
        level,
        deepLinked: !deepLinkError && deepLinkedEntry ? [deepLinkedEntry] : [],
        officialTemplates: templateShelf.entries,
        remote,
        exactLocal: exactLocalEntries,
      }),
    [
      deepLinkError,
      deepLinkedEntry,
      exactLocalEntries,
      level,
      templateShelf.entries,
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
  // 接口 A 的只读落点。目录已经认领这条深链时不再重复：`templateDeepLinkAction`
  // 已经把 `item=` 改写成目录条目 id，货架自己会开那一张卡，这里再按 artifact id
  // 取一次只是多余请求。
  useMaterialLibraryPreviewIntent({
    action: templateShelf.deepLinkEntryId ? null : action,
    entries,
    onOpenItem: openPreparedItem,
    setDeepLinkedEntry,
    setDeepLinkError,
    setDeepLinkStatus,
  });
  useEffect(() => {
    if (!registerRuntimeSource) return;
    return registerWorkbenchMaterialSource(
      materialScopeKey(siteId, runtimeAppId),
      runtimeSourceRef.current,
      entries,
    );
  }, [entries, registerRuntimeSource, runtimeAppId, siteId]);

  // 素材卡下载（合同 §0.6）。编辑器抽屉注册了主动作时，卡片的职责是喂画布，
  // 不再挂下载；浏览型货架（探索页、素材总栏目）默认挂。
  const showCardDownload = cardDownload ?? !primaryMaterialAction;
  const contextMissing =
    level === "primary" && (!context.contextId || !context.siteKey);
  const { error: effectiveError, status: effectiveErrorStatus } =
    materialShelfFailure(
      { deepLinkError, deepLinkStatus, error, errorStatus },
      templateShelf,
    );
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
        goToLevel("more");
      }}
      className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      aria-label={tt("打开完整素材库")}
    >
      {tt(seeAllLabel)} →
    </a>
  ) : null;

  const sectionTabs = (
    <div
      role="tablist"
      aria-label={tt("素材分区")}
      className="flex flex-wrap items-center gap-1"
    >
      {sections.map((section) => (
        <button
          key={section}
          type="button"
          role="tab"
          aria-selected={section === level}
          data-material-library-section={section}
          onClick={() => goToLevel(section)}
          className={`min-h-8 whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-medium ${
            section === level
              ? "border-transparent bg-[var(--fg,#292524)] text-white"
              : "border-[var(--border,#e7e5e4)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
          }`}
        >
          {tt(MATERIAL_LEVEL_LABEL[section])}
        </button>
      ))}
    </div>
  );

  const legacyLevelControl =
    level === "primary" ? (
      primaryMoreControl
    ) : lockLevel ? null : (
      <button
        type="button"
        onClick={() => goToLevel(lockLevel || "primary")}
        className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      >
        ← {tt("当前 App")}
      </button>
    );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        data-material-library-scope={level}
        className="whitespace-nowrap text-[11px] font-semibold text-[var(--fg,#292524)]"
      >
        {tt(MATERIAL_LEVEL_LABEL[level])}
      </span>
      {sections.length > 1 && (levels ? sectionTabs : legacyLevelControl)}
      <MaterialTypeFilter
        multiSelect={multiSelectTypes}
        selectedTypes={selectedTypes}
        onApplyTypes={applyTypes}
      />
      {nextCursor && level !== "primary" && (
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
        levelFetchEnabled && (
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
      action={templateDeepLinkAction(action, templateShelf.deepLinkEntryId)}
      taskId={taskId}
      siteId={siteId}
      appId={runtimeAppId}
      query={query}
      onQueryChange={setQuery}
      hideCategoryChips
      toolbarActions={toolbar}
      searchPlaceholder={materialLevelSearchPlaceholder(level)}
      emptyTitle={
        loading
          ? "正在加载素材…"
          : effectiveError
            ? failureCopy.title
            : materialLevelEmptyTitle(level)
      }
      emptyDescription={
        effectiveError
          ? failureCopy.description
          : emptyHint ||
            materialLevelEmptyDescription(level, contextMissing)
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
      entryActions={
        showCardDownload ? materialEntryDownloadAction : undefined
      }
      onOpenItem={openPreparedItem}
      className={className}
    />
  );
}
