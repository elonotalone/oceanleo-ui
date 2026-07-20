"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  ARTIFACT_TYPES,
  artifactHasExactContext,
  artifactIsVisible,
  type ArtifactContextRef,
  type ArtifactType,
} from "./artifact-contract";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
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
  const runtimeSourceRef = useRef(Symbol("material-library"));
  const requestEpochRef = useRef(0);
  const primaryFetchEnabled = fetchPrimary ?? fetchCurated;
  const [level, setLevel] = useState<MaterialLibraryLevel>("primary");
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

  useEffect(() => {
    setLevel("primary");
    setQuery("");
  }, [contextId, functionId, runtimeAppId, siteId]);

  useEffect(() => {
    if (action?.action.query !== undefined) {
      setQuery(action.action.query);
    }
  }, [action?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (level === "primary" && (!context.contextId || !context.siteKey)) {
      setRemote([]);
      setNextCursor(null);
      setLoading(false);
      setError("缺少精确 contextId；Primary 已保持为空，不做宽泛回填。");
      return;
    }
    const fetchEnabled = level === "primary" ? primaryFetchEnabled : fetchMore;
    if (!fetchEnabled) {
      setRemote([]);
      setNextCursor(null);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    const epoch = ++requestEpochRef.current;
    setLoading(true);
    setError("");
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
        setError(result.error || "素材库暂时无法加载。");
      } else {
        setRemote(
          result.data.items.map((item) =>
            artifactEntry(item, level === "more" && Boolean(debounced)),
          ),
        );
        setNextCursor(result.data.nextCursor);
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
    setLoadingMore(true);
    const result = await queryMaterialLibrary({
      level: "more",
      context,
      query: debounced,
      taxonomy,
      cursor: nextCursor,
    });
    if (result.ok && result.data) {
      setRemote((current) =>
        mergeMaterialEntries([
          current,
          result.data!.items.map((item) =>
            artifactEntry(item, Boolean(debounced)),
          ),
        ]),
      );
      setNextCursor(result.data.nextCursor);
      setError("");
    } else {
      setError(result.error || "继续加载失败，请重试。");
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
  const entries = useMemo(
    () =>
      level === "primary"
        ? mergeMaterialEntries([remote, exactLocalEntries])
        : remote,
    [exactLocalEntries, level, remote],
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

  const primaryMoreControl = hideSeeAll ? null : onSeeAll ? (
    <button
      type="button"
      onClick={onSeeAll}
      className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      aria-label={tt("打开完整素材库")}
    >
      {tt(seeAllLabel)} →
    </button>
  ) : seeAllHref ? (
    <a
      href={seeAllHref}
      className="inline-flex min-h-8 items-center whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      aria-label={tt("打开完整素材库")}
    >
      {tt(seeAllLabel)} →
    </a>
  ) : fetchMore ? (
    <button
      type="button"
      onClick={() => {
        setLevel("more");
        setQuery("");
      }}
      className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
      aria-label={tt("打开完整素材库")}
    >
      {tt(seeAllLabel)} →
    </button>
  ) : null;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {level === "primary" ? (
        primaryMoreControl
      ) : (
        <button
          type="button"
          onClick={() => {
            setLevel("primary");
            setQuery("");
          }}
          className="min-h-8 whitespace-nowrap rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
        >
          ← {tt("当前 App")}
        </button>
      )}
      <label className="sr-only" htmlFor="oceanleo-artifact-taxonomy">
        {tt("素材类型")}
      </label>
      <select
        id="oceanleo-artifact-taxonomy"
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
      {error && (level === "more" ? fetchMore : primaryFetchEnabled) && (
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
          : level === "primary"
            ? "当前 App 暂无绑定素材"
            : "完整素材库暂无匹配结果"
      }
      emptyDescription={
        error ||
        (level === "primary"
          ? emptyHint ||
            "这里不会用标签、站点、系列或热门素材回填；请点「更多」搜索完整库。"
          : "换一个关键词或 taxonomy；未授权素材不会出现在结果、计数或建议中。")
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
