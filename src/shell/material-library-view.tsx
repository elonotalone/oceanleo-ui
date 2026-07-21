"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  ARTIFACT_CONTEXT_MISSING_MESSAGE,
  ARTIFACT_TYPES,
  artifactHasExactContext,
  artifactIsVisible,
  type ArtifactContextRef,
  type ArtifactType,
} from "./artifact-contract";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import {
  ARTIFACT_LIBRARY_CHANGE_EVENT,
  getArtifactItem,
} from "./artifact-client";
import {
  MATERIAL_TAXONOMY_LABEL,
  artifactEntry,
  materialToEntry,
  mergeMaterialEntries,
  normalizedMaterialTaxonomy,
  queryMaterialLibrary,
  type MaterialItem,
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

function materialFailureCopy(status: number | undefined, message: string): {
  title: string;
  description: string;
} {
  if (status === 401) {
    return {
      title: "登录后访问素材库",
      description: "登录后可查看当前 App 的精确绑定和授权公共库存。",
    };
  }
  if (status === 403) {
    return {
      title: "当前账号无权访问素材库",
      description: "服务端拒绝了此素材范围，未显示任何降级或猜测结果。",
    };
  }
  if (status === 503) {
    return {
      title: "素材库服务暂时不可用",
      description: "服务端正在维护或过载，请稍后重试。",
    };
  }
  return {
    title: "素材库响应无效",
    description:
      message || "服务端没有返回完整、可验证的 rich artifact 列表。",
  };
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
  seeAllLabel = "更多",
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
  const runtimeSourceRef = useRef(Symbol("material-library"));
  const requestEpochRef = useRef(0);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const primaryFetchEnabled = fetchPrimary ?? fetchCurated;
  const [level, setLevel] = useState<MaterialLibraryLevel>(
    lockLevel || initialLevel,
  );
  const [query, setQuery] = useState(action?.action.query || "");
  const [debounced, setDebounced] = useState(query);
  const [taxonomy, setTaxonomy] = useState<ArtifactType | "">(
    normalizedMaterialTaxonomy(curatedType),
  );
  const [remote, setRemote] = useState<WorkspaceLibraryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
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

  const context = useMemo<ArtifactContextRef>(
    () => ({
      contextId,
      siteKey: siteId,
      appId: runtimeAppId,
      functionId: functionId || undefined,
    }),
    [contextId, functionId, runtimeAppId, siteId],
  );

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
        const inScope = Boolean(
          result.ok &&
            item &&
            isDurableLibraryItem(item) &&
            (!taxonomy || item.artifactType === taxonomy) &&
            (level === "more"
              ? item.artifact.owner.visibility === "public"
              : artifactHasExactContext(item.artifact, context)),
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
      setError("");
      setErrorStatus(undefined);
      return;
    }
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    const epoch = ++requestEpochRef.current;
    setRemote([]);
    setNextCursor(null);
    setLoading(true);
    setLoadingMore(false);
    setError("");
    setErrorStatus(undefined);
    void queryMaterialLibrary({
      level,
      context,
      query: debounced,
      taxonomy,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted || epoch !== requestEpochRef.current) {
        return;
      }
      if (!result.ok || !result.data) {
        setRemote([]);
        setNextCursor(null);
        // "This app has no binding yet" class responses (missing context,
        // unknown context, no bindings) are a normal empty shelf, not a
        // failure banner.
        const noBinding =
          level === "primary" &&
          (result.status === 400 || result.status === 404) &&
          (result.code === "invalid-binding" || result.code === "not-found");
        if (noBinding) {
          setError("");
          setErrorStatus(undefined);
        } else {
          setError(result.error || "素材库暂时无法加载。");
          setErrorStatus(result.status);
        }
      } else {
        setRemote(
          result.data.items.map((item) => ({
            ...artifactEntry(
              item,
              level === "more" && Boolean(debounced),
            ),
            linkUrl: materialLibraryHref({
              query: level === "more" ? debounced : "",
              taxonomy,
              item,
            }),
          })),
        );
        setNextCursor(result.data.nextCursor);
        setErrorStatus(undefined);
      }
      setLoading(false);
    });
    return () => controller.abort();
  }, [
    context,
    debounced,
    fetchMore,
    level,
    primaryFetchEnabled,
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
          result.data!.items.map((item) => ({
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
            artifactHasExactContext(item.artifact, contextId),
        );
      }),
    [contextId, featuredEntries, localEntries],
  );
  // Site-curated MaterialItems (design templates, real examples) have no
  // durable artifact identity, so the exact-context filter can never admit
  // them. They stay visible on the primary shelf as "本站精选" instead of
  // silently disappearing.
  const siteFeaturedEntries = useMemo(
    () =>
      [...featuredEntries, ...localEntries]
        .filter((entry) => {
          const item = entry.libraryItem;
          return Boolean(item && !isDurableLibraryItem(item));
        })
        .map((entry) => ({ ...entry, category: "本站精选" })),
    [featuredEntries, localEntries],
  );
  const entries = useMemo(
    () => {
      if (deepLinkError) return [];
      const deepLinked = deepLinkedEntry ? [deepLinkedEntry] : [];
      return level === "primary"
        ? mergeMaterialEntries([
            deepLinked,
            remote,
            exactLocalEntries,
            siteFeaturedEntries,
          ])
        : mergeMaterialEntries([deepLinked, remote]);
    },
    [
      deepLinkError,
      deepLinkedEntry,
      exactLocalEntries,
      level,
      remote,
      siteFeaturedEntries,
    ],
  );
  const primaryCategoryIds = useMemo(
    () =>
      level === "primary"
        ? [
            ...new Set(
              entries
                .map((entry) => String(entry.category || "").trim())
                .filter(Boolean),
            ),
          ]
        : undefined,
    [entries, level],
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
        {tt("素材类型")}
      </label>
      <select
        id={taxonomyId}
        value={taxonomy}
        onChange={(event) =>
          setTaxonomy(event.currentTarget.value as ArtifactType | "")
        }
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
          onClick={() => setRetryNonce((value) => value + 1)}
          className="min-h-8 rounded-lg border border-amber-500/30 px-2.5 text-[11px] font-medium text-amber-700"
        >
          {tt("重试")}
        </button>
      )}
    </div>
  );

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
      primaryCategoryIds={primaryCategoryIds}
      toolbarActions={toolbar}
      searchPlaceholder={
        level === "primary"
          ? "筛选当前 App 的精确绑定素材"
          : "搜索全部有权访问的素材"
      }
      emptyTitle={
        loading
          ? "正在加载素材…"
          : effectiveError
            ? failureCopy.title
            : level === "primary"
              ? "当前 App 暂无绑定素材"
              : "完整素材库暂无匹配结果"
      }
      emptyDescription={
        effectiveError
          ? failureCopy.description
          : level === "primary"
            ? emptyHint ||
              (contextMissing
                ? ARTIFACT_CONTEXT_MISSING_MESSAGE
                : "这里不会用标签、站点、系列或热门素材回填；请点「更多」搜索完整库。")
            : emptyHint ||
              "换一个关键词或 taxonomy；未授权素材不会出现在结果、计数或建议中。"
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
      onOpenItem={onOpenItem}
      className={className}
    />
  );
}
