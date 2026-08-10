"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
import { openArtifactPlay } from "./explore-artifact-class";
import {
  ExplorePlayableSurface,
  useExploreShelfDispatch,
} from "./explore-shelf-dispatch";
import {
  MATERIAL_LIBRARY_LEVELS,
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
import { useMaterialLibraryFacets } from "./material-library-facet-filter";
import { MaterialCompleteLibraryLink, MaterialShelfToolbar } from "./material-library-toolbar";
import {
  entriesFromRemoteResult,
  materialFailureCopy,
  materialShelfEmptyCopy,
  materialLevelSearchPlaceholder,
  materialLibraryHref,
  materialShelfEntries,
  materialShelfFailure,
  safeCompleteLibraryHref,
  type MaterialLibraryProps,
} from "./material-library-presentation";
import {
  materialSceneView,
  readSiteAppDirectory,
  subscribeSiteAppDirectories,
  type SceneSelection,
} from "./material-scene-axis";
import { useMaterialPackLanding } from "./material-pack-landing";
import { MaterialShelfSkeleton } from "./material-library-skeleton";
import {
  useMaterialLibraryChangeEvents,
  useMaterialLibraryDeepLink,
  useMaterialLibraryPreviewIntent,
  useMaterialShelfSettle,
  useOfficialTemplateMaterials,
} from "./material-library-effects";
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

const DEFAULT_LEVELS: readonly MaterialLibraryLevel[] = ["primary", "site"];

/** 顺序取自 `MATERIAL_LIBRARY_LEVELS`，这样 W4 下线 `more` 时这里不必跟着改。 */
function orderedLevels(
  levels: readonly MaterialLibraryLevel[],
): MaterialLibraryLevel[] {
  const wanted = new Set(levels);
  return MATERIAL_LIBRARY_LEVELS.filter((level) => wanted.has(level));
}

/**
 * Controller/view facade for the two-level material library
 * (此 app ｜ 本站素材；`more` 已按 D1 下线). Query decoding, normalization, scoping
 * and page merging stay in material-library-controller / -scope / -dedupe.
 */
export function MaterialLibrary({
  materials,
  accent = "#4f46e5",
  emptyHint,
  className = "",
  plain = false,
  onSeeAll,
  seeAllHref,
  hideSeeAll = false,
  seeAllLabel = "完整素材库",
  featuredEntries = [],
  action,
  taskId,
  siteId = "",
  appId = "",
  contextId = "",
  functionId = "",
  fetchCurated = true,
  fetchPrimary,
  curatedType = "all",
  initialLevel = "primary",
  lockLevel,
  levels,
  exploreClassDispatch,
  scene: controlledScene,
  onSceneChange,
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
  emptyCta,
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
  // 本站层的取数由 site 作用域自己决定（缺 siteKey 就一个请求都不发，见 W4 的
  // fail-closed 判据）。
  const levelFetchEnabled =
    level === "primary" ? primaryFetchEnabled : Boolean(context.siteKey);
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
  const [deepLinkStatus, setDeepLinkStatus] = useState<number | undefined>();
  const [retryNonce, setRetryNonce] = useState(0);
  const [standaloneEditorItem, setStandaloneEditorItem] =
    useState<LibraryItem | null>(null);
  // 分区轴的选中态。`null` = 全部；`""` = 「其它」。两者必须区分得开。
  const [internalScene, setInternalScene] = useState<SceneSelection>(null);
  const scene = controlledScene !== undefined ? controlledScene : internalScene;
  const applyScene = useCallback(
    (next: SceneSelection) => {
      if (controlledScene === undefined) setInternalScene(next);
      onSceneChange?.(next);
    },
    [controlledScene, onSceneChange],
  );
  // `?app=` 锚点在货架内部是可清除的：清掉它回到整站视图，而不是回到一排 appId chips。
  const [anchorCleared, setAnchorCleared] = useState(false);

  useEffect(() => {
    setInternalScene(null);
    setAnchorCleared(false);
  }, [level, siteId]);

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
  }, [contextId, functionId, initialLevel, lockLevel, runtimeAppId, siteId]);

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
  // D5：首次请求 settle 之前只画骨架。`markSettled` 必须覆盖这条 effect 的**每一个**
  // 终点（不发请求、命中新鲜缓存、成功、失败），漏一个骨架就永远不消失。
  const shelfSettle = useMaterialShelfSettle(remoteRequestKey, {
    initiallySettled: Boolean(initialCache),
  });
  const markSettled = shelfSettle.markSettled;

  useEffect(() => {
    if (level === "primary" && (!context.contextId || !context.siteKey)) {
      markSettled(remoteRequestKey);
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
    const fetchEnabled =
      level === "primary" ? primaryFetchEnabled : Boolean(context.siteKey);
    if (!fetchEnabled) {
      markSettled(remoteRequestKey);
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
        markSettled(remoteRequestKey);
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
      markSettled(remoteRequestKey);
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
      markSettled(remoteRequestKey);
      setLoading(false);
    });
    return () => controller.abort();
  }, [
    context,
    debounced,
    level,
    markSettled,
    materialRequest,
    primaryFetchEnabled,
    remoteRequestKey,
    retryNonce,
    taxonomy,
  ]);

  const loadMore = async () => {
    if (level === "primary" || !levelFetchEnabled || !nextCursor || loadingMore) {
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
        siteKey: siteId,
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
      siteId,
      templateShelf.entries,
      remote,
    ],
  );
  const facetShelf = useMaterialLibraryFacets(entries, {
    enabled: siteId === "website",
    scopeKey: `${level}:${runtimeAppId}`,
  });
  // 本站素材的主分区轴 = 站点 app 目录的场景词（D2）。原来那排原始 appId chips 已下线；
  // 类型筛选降为次级筛选，与分区叠加。
  const directory = useSyncExternalStore(
    subscribeSiteAppDirectories,
    () => readSiteAppDirectory(siteId),
    () => readSiteAppDirectory(siteId),
  );
  const anchoredAppId = anchorCleared ? "" : appId.trim();
  const sceneView = useMemo(
    () =>
      level === "site"
        ? materialSceneView({
            entries: facetShelf.entries,
            siteKey: siteId,
            directory,
            scene,
            anchoredAppId,
          })
        : null,
    [anchoredAppId, directory, facetShelf.entries, level, scene, siteId],
  );
  // 素材包三层：这里算、下发，并回落点解析器（`material-pack-landing.ts` 说明理由）。
  const packAppIdForEntry = useMaterialPackLanding(level === "site" ? { entries, siteKey: siteId, directory, scene, anchoredAppId } : null, sceneView);
  const visibleEntries = useMemo(
    () => (sceneView ? sceneView.cards.map((card) => card.entry) : facetShelf.entries),
    [facetShelf.entries, sceneView],
  );
  // 按 artifact 类型分派呈现模式（P2）。探索页之外 `exploreClassDispatch` 不传，
  // `dispatch.entries === visibleEntries` 的顺序与内容都与今天逐字相同。
  const dispatch = useExploreShelfDispatch({
    dispatch: exploreClassDispatch,
    level,
    siteKey: siteId,
    entries: visibleEntries,
  });
  const shelfEntries = dispatch.enabled ? dispatch.entries : visibleEntries;
  const anchoredAppLabel = useMemo(
    () =>
      directory?.apps.find((app) => app.appId === anchoredAppId)?.name ||
      anchoredAppId,
    [anchoredAppId, directory],
  );
  // 次级类型 chips 只铺货架上真实出现过的类型。站点不再声明 `types`，所以这份集合
  // 由数据自己长出来；一旦选了类型，请求会收窄，故用 ref 记住无筛选那一帧的全集。
  const seenTypesRef = useRef<{ siteKey: string; types: ArtifactType[] }>({
    siteKey: siteId,
    types: [],
  });
  if (seenTypesRef.current.siteKey !== siteId) {
    seenTypesRef.current = { siteKey: siteId, types: [] };
  }
  for (const type of sceneView?.presentTypes || []) {
    if (!seenTypesRef.current.types.includes(type)) {
      seenTypesRef.current.types = [...seenTypesRef.current.types, type];
    }
  }
  const availableTypes = sceneView ? seenTypesRef.current.types : undefined;
  const openPreparedItem = useCallback(
    (item: LibraryItem) => {
      if (openArtifactPlay(item)) return;
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

  // 官方模板目录与库检索是两条并行的取数链，两条都有结论才算 settle：只等一条，
  // 另一条的空窗期照样会漏出空态。
  const shelfLoading = loading || templateShelf.loading;
  const shelfSettled =
    shelfSettle.settled && !templateShelf.loading && dispatch.settled;
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
  const completeLibraryHref =
    safeCompleteLibraryHref(seeAllHref) ||
    materialLibraryHref({ query, taxonomy });
  // D1 之后没有「更多素材」这一层可跳，只剩宿主自己声明的完整素材库外链。
  const primaryMoreControl =
    hideSeeAll || !(onSeeAll || seeAllHref) ? null : (
      <MaterialCompleteLibraryLink
        href={completeLibraryHref}
        label={seeAllLabel}
        onSeeAll={onSeeAll}
      />
    );

  const toolbar = (
    <MaterialShelfToolbar
      level={level}
      sections={sections}
      tabbed={Boolean(levels)}
      lockLevel={lockLevel}
      onGoToLevel={goToLevel}
      seeAllControl={primaryMoreControl}
      settled={shelfSettled}
      exploreClassAxis={dispatch.axis}
      sceneChips={dispatch.artifactClass === "playable" ? undefined : sceneView?.chips}
      scene={scene}
      onSceneChange={applyScene}
      anchoredAppId={sceneView ? anchoredAppId : ""}
      anchoredAppLabel={anchoredAppLabel}
      onClearAnchor={() => setAnchorCleared(true)}
      multiSelectTypes={multiSelectTypes}
      selectedTypes={selectedTypes}
      availableTypes={availableTypes}
      onApplyTypes={applyTypes}
      facetControl={facetShelf.control}
      canLoadMore={Boolean(
        nextCursor && level !== "primary" && levelFetchEnabled,
      )}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
      retryable={Boolean(
        effectiveError &&
          effectiveErrorStatus !== 401 &&
          effectiveErrorStatus !== 403 &&
          levelFetchEnabled,
      )}
      onRetry={() => {
        invalidateMaterialLibraryCache(materialRequest);
        setRetryNonce((value) => value + 1);
      }}
      inlineFailure={
        effectiveError && entries.length > 0 ? failureCopy : null
      }
    />
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

  // D5：首帧未 settle 时既没有卡片也不许有「暂无」文案，货架整块换成骨架。
  // 已经有卡片（命中缓存 / 背景刷新）时不退回骨架 —— 那会比空态更晃眼。
  if (!shelfSettled && shelfEntries.length === 0 && !effectiveError) {
    return (
      <div
        className={`h-full min-h-0 ${className}`}
        data-material-shelf-state="loading"
      >
        <MaterialShelfSkeleton toolbar={toolbar} plain={plain} />
      </div>
    );
  }

  // P1：可玩游戏那一类只有整屏竖向 feed 一种布局，没有网格变体。
  if (dispatch.renderMode === "vertical-feed") {
    return (
      <ExplorePlayableSurface
        dispatch={dispatch}
        toolbar={toolbar}
        accent={accent}
        loading={shelfLoading}
        failure={effectiveError ? failureCopy : null}
        className={className}
      />
    );
  }

  const emptyCopy = materialShelfEmptyCopy({
    loading: shelfLoading,
    failed: Boolean(effectiveError),
    failureCopy,
    level,
    contextMissing,
    emptyHint,
    cta: emptyCta,
  });

  return (
    <WorkspaceLibrary
      entries={shelfEntries}
      packAppIdForEntry={packAppIdForEntry}
      accent={accent}
      plain={plain}
      action={templateDeepLinkAction(action, templateShelf.deepLinkEntryId)}
      taskId={taskId}
      siteId={siteId}
      appId={runtimeAppId}
      query={query}
      onQueryChange={setQuery}
      hideCategoryChips
      toolbarActions={toolbar}
      searchPlaceholder={materialLevelSearchPlaceholder(level)}
      emptyTitle={facetShelf.active ? "没有匹配模板" : emptyCopy.title}
      emptyDescription={facetShelf.active ? "清除一项筛选再看看。" : emptyCopy.description}
      emptyCta={emptyCopy.showCta ? emptyCta : undefined}
      materialActions={materialActions}
      onMaterialAction={onMaterialAction}
      materialActionAvailable={materialActionAvailable}
      materialActionEvidence={materialActionEvidence}
      primaryMaterialAction={primaryMaterialAction}
      draggableMaterials={draggableMaterials}
      onMaterialDragStart={onMaterialDragStart}
      onMaterialDragEnd={onMaterialDragEnd}
      allowAdvanced={allowAdvancedOnSelect}
      // D4：网格卡上不再挂「下载」。下载只在详情浮层里（W5），卡片的职责是「点进去看」。
      onOpenItem={openPreparedItem}
      className={className}
    />
  );
}
