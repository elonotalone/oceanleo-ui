"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent as ReactDragEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";
import { LibraryChips, LibraryToolbar } from "./LibraryLayout";
import type { WorkspaceActionEnvelope } from "./workspace-actions";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import type { WorkbenchMaterialActionAvailability } from "./workbench-material-registry";
import {
  ArtifactActionButtons,
  artifactActionMatrix,
  type ArtifactTargetActionEvidence,
} from "./ArtifactActions";
import { prepareArtifactForAction } from "./artifact-client";
import {
  WORKSPACE_KIND_LABELS,
  filterWorkspaceLibraryEntries,
  visibleWorkspaceLibraryCategories,
  workspaceEntryFromLibraryItem,
  workspaceLibraryCategories,
  type WorkspaceLibraryEntry,
} from "./workspace-library-model";
import {
  WorkspaceCard,
  WorkspaceLibraryEmpty,
  WorkspaceLibraryEntryViewer,
  WorkspaceListRow,
} from "./workspace-library-view";

export {
  workspaceEntryFromLibraryItem,
} from "./workspace-library-model";
export { WorkspaceLibraryEntryViewer } from "./workspace-library-view";
export type { WorkspaceLibraryEntry } from "./workspace-library-model";

export interface WorkspaceLibraryProps {
  entries: WorkspaceLibraryEntry[];
  accent?: string;
  action?: WorkspaceActionEnvelope | null;
  query?: string;
  onQueryChange?: (query: string) => void;
  category?: string;
  onCategoryChange?: (category: string) => void;
  /** Categories kept visible before the user expands the remote catalog. */
  primaryCategoryIds?: string[];
  toolbarActions?: ReactNode;
  /** Current Agent task is reused by the advanced workbench. */
  taskId?: string | null;
  siteId?: string;
  appId?: string;
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
  /** Advanced-editor drawers use one click as an immediate editor action. */
  primaryMaterialAction?: WorkbenchMaterialAction;
  /** Enables dragging a material card into the current editor canvas. */
  draggableMaterials?: boolean;
  onMaterialDragStart?: (item: LibraryItem) => void;
  onMaterialDragEnd?: () => void;
  allowAdvanced?: boolean;
  /** File cards leave the App workspace and enter their canonical advanced URL. */
  openAdvancedOnSelect?: boolean;
  /** Route hosts can intercept selection while preserving the shared card UI. */
  onOpenItem?: (item: LibraryItem) => void;
  /** Workspace hosts can move every preview/editor into the fixed main canvas. */
  onOpenEntry?: (entry: WorkspaceLibraryEntry) => void;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  /** Full-page libraries render directly on the page instead of inside a white panel. */
  plain?: boolean;
}

/**
 * Shared list/detail shell for Preview, Materials and My Library.
 * Those three areas intentionally share the exact same search, categories,
 * card density, detail header and viewer dispatch. Editable items are handed
 * to the workspace-level host through onOpenItem; this component never nests a
 * full editor inside a library detail.
 */
export function WorkspaceLibrary({
  entries,
  accent = "#4f46e5",
  action,
  query,
  onQueryChange,
  category: controlledCategory,
  onCategoryChange,
  primaryCategoryIds,
  toolbarActions,
  siteId = "",
  materialActions = [],
  onMaterialAction,
  materialActionAvailable,
  materialActionEvidence,
  draggableMaterials = false,
  onMaterialDragStart,
  onMaterialDragEnd,
  allowAdvanced = true,
  openAdvancedOnSelect = true,
  onOpenItem,
  onOpenEntry,
  searchPlaceholder = "搜索",
  emptyTitle = "这里还没有内容",
  emptyDescription = "生成或保存内容后，会显示在这里。",
  className = "",
  plain = false,
}: WorkspaceLibraryProps) {
  const tt = useUI();
  const [internalSearch, setInternalSearch] = useState("");
  const search = query ?? internalSearch;
  const setSearch: Dispatch<SetStateAction<string>> = (value) => {
    const next = typeof value === "function" ? value(search) : value;
    if (query === undefined) setInternalSearch(next);
    onQueryChange?.(next);
  };
  const [internalCategory, setInternalCategory] = useState("all");
  const category = controlledCategory ?? internalCategory;
  const setCategory = (next: string) => {
    if (controlledCategory === undefined) setInternalCategory(next);
    onCategoryChange?.(next);
  };
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState("");
  const [viewerNonce, setViewerNonce] = useState(0);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [materialActionState, setMaterialActionState] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  const materialActionPendingRef = useRef(false);

  const openEntry = useCallback(
    (entry: WorkspaceLibraryEntry) => {
      if (onOpenEntry) {
        onOpenEntry(entry);
        return;
      }
      setSelectedId(entry.id);
    },
    [onOpenEntry],
  );

  const applyMaterialAction = async (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => {
    if (!onMaterialAction) {
      throw new Error("当前编辑器没有注册素材命令执行器。");
    }
    if (materialActionPendingRef.current) {
      throw new Error("另一个素材命令仍在执行。");
    }
    materialActionPendingRef.current = true;
    setMaterialActionState(tt("应用中…"));
    try {
      const result = await onMaterialAction(action, item);
      if (!result.ok) {
        throw new Error(result.error || tt("素材应用失败"));
      }
      setMaterialActionState(tt("已通过编辑器历史应用素材"));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : tt("素材应用失败");
      setMaterialActionState(message);
      throw caught instanceof Error ? caught : new Error(message);
    } finally {
      materialActionPendingRef.current = false;
    }
  };

  const targetEvidence = (
    action: "insert" | "replace",
    item: LibraryItem,
  ): ArtifactTargetActionEvidence => {
    if (!materialActions.includes(action)) {
      return {
        visible: false,
        available: false,
        reason: "当前编辑器没有声明这个动作。",
      };
    }
    const evidence = materialActionEvidence?.(action, item);
    if (evidence) return evidence;
    const available =
      materialActionAvailable?.(action, item) ?? Boolean(onMaterialAction);
    return {
      visible: true,
      available,
      reason: available
        ? ""
        : "目标编辑器没有可验证的 command/history 契约。",
    };
  };

  const matrixFor = (item: LibraryItem) =>
    artifactActionMatrix(item, {
      hidePreview: true,
      canOpenPreview: false,
      canOpenEdit:
        allowAdvanced && openAdvancedOnSelect && Boolean(onOpenItem),
      insert: targetEvidence("insert", item),
      replace: targetEvidence("replace", item),
    });

  const editItem = async (item: LibraryItem) => {
    if (!onOpenItem) throw new Error("当前工作区没有注册 typed Edit route。");
    onOpenItem(item);
  };

  const entryLinkUrl = (entry: WorkspaceLibraryEntry) => {
    const externalUrl =
      entry.externalUrl ||
      entry.libraryItem?.url ||
      entry.libraryItem?.previewUrl ||
      "";
    return (
      entry.linkUrl ||
      (typeof entry.libraryItem?.meta.asset_page_url === "string"
        ? entry.libraryItem.meta.asset_page_url
        : "") ||
      (typeof entry.libraryItem?.meta.open_url === "string"
        ? entry.libraryItem.meta.open_url
        : "") ||
      externalUrl
    );
  };

  const requestFullscreenFor = (node: HTMLElement | null) => {
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void node.requestFullscreen();
  };

  const activateEntry = (entry: WorkspaceLibraryEntry) => {
    const item = entry.libraryItem;
    if (!item) {
      openEntry(entry);
      return;
    }
    // Primary card activation is Edit → advanced workbench when the host
    // registered onOpenItem. Preview is no longer a user-facing library action.
    const edit = matrixFor(item).edit;
    if (
      allowAdvanced &&
      openAdvancedOnSelect &&
      onOpenItem &&
      edit.visible
    ) {
      if (!edit.available) {
        if (edit.reason) setMaterialActionState(tt(edit.reason));
        openEntry(entry);
        return;
      }
      void (async () => {
        setMaterialActionState(
          tt(
            edit.requiresEnsure
              ? "正在建立耐久 artifact identity…"
              : "编辑中…",
          ),
        );
        try {
          const prepared = await prepareArtifactForAction("edit", item);
          if (!prepared.ok || !prepared.data) {
            throw new Error(prepared.error || tt("编辑失败。"));
          }
          onOpenItem(prepared.data);
          setMaterialActionState(tt("编辑已执行。"));
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : tt("编辑失败。");
          setMaterialActionState(message);
          openEntry(entry);
        }
      })();
      return;
    }
    openEntry(entry);
  };

  const dragPropsFor = (entry: WorkspaceLibraryEntry) => {
    const item = entry.libraryItem;
    const enabled = Boolean(
      draggableMaterials &&
        item &&
        onMaterialDragStart &&
        matrixFor(item).insert.available,
    );
    return {
      draggable: enabled,
      onDragStart: enabled
        ? (event: ReactDragEvent<HTMLElement>) => {
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData(
              "application/x-oceanleo-material+json",
              JSON.stringify({
                id: item?.key || entry.id,
                title: item?.title || entry.title,
                kind: item?.kind || entry.kind || "file",
              }),
            );
            if (item) onMaterialDragStart?.(item);
          }
        : undefined,
      onDragEnd: enabled ? () => onMaterialDragEnd?.() : undefined,
    };
  };

  const categories = useMemo(
    () => workspaceLibraryCategories(entries),
    [entries],
  );
  const { visibleCategories, overflowCategoryCount } = useMemo(
    () =>
      visibleWorkspaceLibraryCategories(
        categories,
        primaryCategoryIds,
        category,
        categoriesExpanded,
      ),
    [categories, categoriesExpanded, category, primaryCategoryIds],
  );

  useEffect(() => {
    if (categories.some((item) => item.id === category)) return;
    setCategory("all");
  }, [categories, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(
    () => filterWorkspaceLibraryEntries(entries, search, category),
    [entries, search, category],
  );

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) || null,
    [entries, selectedId],
  );

  useEffect(() => {
    if (!selectedId) return;
    if (!entries.some((entry) => entry.id === selectedId)) setSelectedId("");
  }, [entries, selectedId]);

  useEffect(() => {
    setMaterialActionState("");
  }, [selectedId]);

  useEffect(() => {
    if (!action) return;
    const next = action.action;
    if (next.query !== undefined) setSearch(next.query);
    if (next.category !== undefined) {
      setCategory(
        categories.some((item) => item.id === next.category)
          ? next.category
          : "all",
      );
    }
    const byId = next.itemId
      ? entries.find((entry) => entry.id === next.itemId)
      : null;
    const byUrl = !byId && next.url
      ? entries.find(
          (entry) =>
            (!entry.libraryItem ||
              !isDurableLibraryItem(entry.libraryItem)) &&
            (entry.externalUrl === next.url ||
              entry.libraryItem?.url === next.url ||
              entry.libraryItem?.previewUrl === next.url),
        )
      : null;
    if (byId || byUrl) openEntry((byId || byUrl)!);
  // Remote material/file rows may arrive after the action. Re-run against the
  // new entry set so `itemId` opens once its card exists.
  }, [action?.nonce, entries, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const actionButtonsFor = (
    entry: WorkspaceLibraryEntry,
    compact = false,
    fullscreenNode?: HTMLElement | null,
  ) => {
    const item = entry.libraryItem;
    if (!item) return null;
    const linkUrl = entryLinkUrl(entry);
    return (
      <ArtifactActionButtons
        item={item}
        matrix={matrixFor(item)}
        onEdit={editItem}
        onInsert={(prepared) =>
          applyMaterialAction("insert", prepared)
        }
        onReplace={(prepared) =>
          applyMaterialAction("replace", prepared)
        }
        onFullscreen={() => {
          if (fullscreenNode) {
            requestFullscreenFor(fullscreenNode);
            return;
          }
          openEntry(entry);
          const split = document.querySelector<HTMLElement>(
            "[data-workspace-split]",
          );
          requestFullscreenFor(split);
        }}
        linkUrl={linkUrl || undefined}
        onStatus={setMaterialActionState}
        accent={accent}
        compact={compact}
      />
    );
  };

  if (selected) {
    const kind = selected.kind || selected.libraryItem?.kind;
    const externalUrl =
      selected.externalUrl ||
      selected.libraryItem?.url ||
      selected.libraryItem?.previewUrl ||
      "";
    const refreshable =
      Boolean(externalUrl) &&
      (kind === "website" || kind === "canvas" || kind === "video_canvas");
    const workbenchItem: LibraryItem =
      selected.libraryItem || {
        key: selected.id,
        source: "creation",
        id: selected.id,
        title: selected.title,
        kind: kind || "file",
        siteId,
        url: externalUrl || undefined,
        previewUrl: externalUrl || undefined,
        thumbUrl: selected.thumbUrl,
        favorite: false,
        meta: {
          library_source: "workspace",
          category: selected.category || "",
          description: selected.description || "",
        },
      };
    return (
      <>
      <div
        ref={detailRef}
        className={`flex h-full min-h-0 flex-col ${plain ? "bg-transparent" : "bg-[var(--card,#fff)]"} ${className}`}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border,#e7e5e4)] px-3 py-2.5">
          <button
            type="button"
            onClick={() => setSelectedId("")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border,#e7e5e4)] text-[var(--muted,#78716c)] transition hover:bg-[var(--surface-hover,#fafaf9)] hover:text-[var(--fg,#292524)]"
            aria-label={tt("返回列表")}
            title={tt("返回列表")}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[13px] font-semibold text-[var(--fg,#1c1917)]">
                {selected.title}
              </h3>
              {kind && (
                <span className="shrink-0 rounded-md bg-[var(--surface,#f5f5f4)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted,#78716c)]">
                  {tt(WORKSPACE_KIND_LABELS[kind] || "内容")}
                </span>
              )}
            </div>
            {selected.description && (
              <p className="mt-0.5 truncate text-[11px] text-[var(--muted,#a8a29e)]">
                {tt(selected.description)}
              </p>
            )}
          </div>
          {actionButtonsFor(
            {
              ...selected,
              libraryItem: workbenchItem,
            },
            true,
            detailRef.current,
          )}
          {refreshable && (
            <button
              type="button"
              onClick={() => setViewerNonce((value) => value + 1)}
              className="shrink-0 rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,#fafaf9)]"
            >
              {tt("刷新")}
            </button>
          )}
        </header>
        {materialActionState && (
          <div
            role="status"
            aria-live="polite"
            className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-600"
          >
            {materialActionState}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface,#fafaf9)]">
          <WorkspaceLibraryEntryViewer
            entry={selected}
            accent={accent}
            viewerNonce={viewerNonce}
          />
        </div>
      </div>
      </>
    );
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        plain ? "bg-transparent" : "bg-[var(--card,#fff)] px-3 pb-3 pt-5"
      } ${className}`}
    >
      <LibraryToolbar
        search={search}
        setSearch={setSearch}
        view={view}
        setView={setView}
        actions={toolbarActions}
        placeholder={tt(searchPlaceholder)}
        tt={tt}
      />
      {materialActionState && (
        <p
          className="mt-2 shrink-0 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700"
          role="status"
          aria-live="polite"
        >
          {materialActionState}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        {categories.length > 1 && (
          <LibraryChips
            chips={visibleCategories}
            active={category}
            onChange={setCategory}
            accent={accent}
            tt={tt}
            className="mb-3"
            trailing={
              overflowCategoryCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setCategoriesExpanded((value) => !value)}
                  className="rounded-full border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3.5 py-1.5 text-[13px] text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,#fafaf9)]"
                  aria-expanded={categoriesExpanded}
                >
                  {tt(categoriesExpanded ? "收起" : "更多")}
                  {!categoriesExpanded ? ` +${overflowCategoryCount}` : ""}
                </button>
              ) : undefined
            }
          />
        )}
        {filtered.length === 0 ? (
          <WorkspaceLibraryEmpty
            title={tt(search ? "没有匹配内容" : emptyTitle)}
            description={tt(
              search
                ? "换一个关键词或分类试试。"
                : emptyDescription,
            )}
          />
        ) : view === "list" ? (
          <div className="space-y-1.5">
            {filtered.map((entry) => (
              <WorkspaceListRow
                key={entry.id}
                entry={entry}
                onOpen={() => activateEntry(entry)}
                dragProps={dragPropsFor(entry)}
                actions={actionButtonsFor(entry, true)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
            {filtered.map((entry) => (
              <WorkspaceCard
                key={entry.id}
                entry={entry}
                onOpen={() => activateEntry(entry)}
                dragProps={dragPropsFor(entry)}
                accent={accent}
                actions={actionButtonsFor(entry, true)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
