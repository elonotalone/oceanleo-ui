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
import { useRouter } from "next/navigation";
import { useUI } from "../i18n/ui/useUI";
import { ensureDatabaseThumbnail } from "../lib/database";
import type { LibraryItem, LibraryKind } from "./library-data";
import { LibraryItemViewer } from "./library-viewers";
import { LibraryChips, LibraryToolbar } from "./LibraryLayout";
import type { WorkspaceActionEnvelope } from "./workspace-actions";
import { editorCapabilityFor } from "./workbench-routes";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import {
  advancedFeatureHrefForItem,
  advancedLibraryReferenceFor,
} from "./advanced-features";

export interface WorkspaceLibraryEntry {
  id: string;
  title: string;
  description?: string;
  category?: string;
  keywords?: string[];
  thumbUrl?: string;
  kind?: LibraryKind;
  libraryItem?: LibraryItem;
  content?: ReactNode;
  /** Viewer resource URL; never use this as the card-click navigation target. */
  externalUrl?: string;
  /** User-facing destination, usually the matching asset/project page. */
  linkUrl?: string;
  badge?: string;
  /** The current query was already applied by the authoritative remote index. */
  trustedSearchMatch?: boolean;
  /** Present only for user-owned rows. Curated/platform entries stay read-only. */
  onDelete?: () => Promise<void> | void;
}

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
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  /** Full-page libraries render directly on the page instead of inside a white panel. */
  plain?: boolean;
}

const KIND_LABELS: Partial<Record<LibraryKind, string>> = {
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

const generatedThumbnailCache = new Map<string, string>();
const generatedThumbnailPending = new Map<string, Promise<string>>();
const generatedThumbnailFailed = new Set<string>();

export function workspaceEntryFromLibraryItem(
  item: LibraryItem,
  extra: Partial<WorkspaceLibraryEntry> = {},
): WorkspaceLibraryEntry {
  return {
    id: item.key,
    title: item.title,
    description: item.siteId || item.source || "",
    category: KIND_LABELS[item.kind] || "内容",
    keywords: [item.kind, item.siteId || "", item.source || ""].filter(Boolean),
    thumbUrl: item.thumbUrl || item.previewUrl,
    kind: item.kind,
    libraryItem: item,
    externalUrl: item.url || item.previewUrl,
    linkUrl:
      (typeof item.meta.asset_page_url === "string"
        ? item.meta.asset_page_url
        : "") ||
      (typeof item.meta.open_url === "string" ? item.meta.open_url : "") ||
      item.url ||
      item.previewUrl,
    ...extra,
  };
}

/**
 * Shared master/detail shell for Preview, Materials and My Library.
 * Those three areas intentionally share the exact same search, categories,
 * card density, detail header and viewer dispatch.
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
  primaryMaterialAction,
  draggableMaterials = false,
  onMaterialDragStart,
  onMaterialDragEnd,
  allowAdvanced = true,
  openAdvancedOnSelect = true,
  onOpenItem,
  searchPlaceholder = "搜索",
  emptyTitle = "这里还没有内容",
  emptyDescription = "生成或保存内容后，会显示在这里。",
  className = "",
  plain = false,
}: WorkspaceLibraryProps) {
  const tt = useUI();
  const router = useRouter();
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
  const [deletingId, setDeletingId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [materialActionState, setMaterialActionState] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  const materialActionPendingRef = useRef(false);

  const openEntry = useCallback(
    (entry: WorkspaceLibraryEntry) => {
      const item = entry.libraryItem;
      if (
        item &&
        allowAdvanced &&
        openAdvancedOnSelect &&
        materialActions.length === 0
      ) {
        if (onOpenItem) {
          onOpenItem(item);
          return;
        }
        const href = advancedFeatureHrefForItem(item);
        if (href) {
          router.push(href);
          return;
        }
      }
      setSelectedId(entry.id);
    },
    [
      allowAdvanced,
      materialActions.length,
      onOpenItem,
      openAdvancedOnSelect,
      router,
    ],
  );

  const removeEntry = async (entry: WorkspaceLibraryEntry) => {
    if (!entry.onDelete || deletingId) return;
    if (!window.confirm(tt("确定删除「{title}」吗？", { title: entry.title }))) {
      return;
    }
    setDeleteError("");
    setDeletingId(entry.id);
    try {
      await entry.onDelete();
      if (selectedId === entry.id) setSelectedId("");
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : tt("删除失败，请重试。"),
      );
    } finally {
      setDeletingId("");
    }
  };

  const applyMaterialAction = async (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => {
    if (!onMaterialAction || materialActionPendingRef.current) return;
    materialActionPendingRef.current = true;
    setMaterialActionState(tt("应用中…"));
    try {
      const result = await onMaterialAction(action, item);
      setMaterialActionState(
        result.ok ? tt("已应用素材副本") : result.error || tt("素材应用失败"),
      );
    } catch (caught) {
      setMaterialActionState(
        caught instanceof Error ? caught.message : tt("素材应用失败"),
      );
    } finally {
      materialActionPendingRef.current = false;
    }
  };

  const activateEntry = (entry: WorkspaceLibraryEntry) => {
    const item = entry.libraryItem;
    if (
      item &&
      primaryMaterialAction &&
      onMaterialAction &&
      (!materialActionAvailable ||
        materialActionAvailable(primaryMaterialAction, item))
    ) {
      void applyMaterialAction(primaryMaterialAction, item);
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
        (!materialActionAvailable ||
          materialActionAvailable(primaryMaterialAction || "insert", item)),
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

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of entries) {
      const value = String(entry.category || "").trim();
      if (value) seen.add(value);
    }
    return [
      { id: "all", label: "全部" },
      ...[...seen].map((value) => ({ id: value, label: value })),
    ];
  }, [entries]);
  const { visibleCategories, overflowCategoryCount } = useMemo(() => {
    if (!primaryCategoryIds) {
      return { visibleCategories: categories, overflowCategoryCount: 0 };
    }
    const primary = new Set(primaryCategoryIds);
    const head = categories.filter(
      (item) => item.id === "all" || primary.has(item.id),
    );
    const overflow = categories.filter(
      (item) => item.id !== "all" && !primary.has(item.id),
    );
    if (categoriesExpanded) {
      return {
        visibleCategories: [...head, ...overflow],
        overflowCategoryCount: overflow.length,
      };
    }
    const selectedOverflow = overflow.find((item) => item.id === category);
    return {
      visibleCategories: selectedOverflow ? [...head, selectedOverflow] : head,
      overflowCategoryCount: overflow.length,
    };
  }, [categories, categoriesExpanded, category, primaryCategoryIds]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (!needle) return true;
      if (entry.trustedSearchMatch) return true;
      return [
        entry.title,
        entry.description,
        entry.category,
        ...(entry.keywords || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [entries, search, category]);

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
            entry.externalUrl === next.url ||
            entry.libraryItem?.url === next.url ||
            entry.libraryItem?.previewUrl === next.url,
        )
      : null;
    if (byId || byUrl) setSelectedId((byId || byUrl)!.id);
  // Remote material/file rows may arrive after the action. Re-run against the
  // new entry set so `itemId` opens once its card exists.
  }, [action?.nonce, entries, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    const kind = selected.kind || selected.libraryItem?.kind;
    const externalUrl =
      selected.externalUrl ||
      selected.libraryItem?.url ||
      selected.libraryItem?.previewUrl ||
      "";
    const linkUrl =
      selected.linkUrl ||
      (typeof selected.libraryItem?.meta.asset_page_url === "string"
        ? selected.libraryItem.meta.asset_page_url
        : "") ||
      (typeof selected.libraryItem?.meta.open_url === "string"
        ? selected.libraryItem.meta.open_url
        : "") ||
      externalUrl;
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
    const editorCapability = editorCapabilityFor(workbenchItem);
    const actionLabels: Record<WorkbenchMaterialAction, string> = {
      insert: "插入",
      replace: "替换",
      apply: "应用",
      merge: "合并",
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
                  {tt(KIND_LABELS[kind] || "内容")}
                </span>
              )}
            </div>
            {selected.description && (
              <p className="mt-0.5 truncate text-[11px] text-[var(--muted,#a8a29e)]">
                {tt(selected.description)}
              </p>
            )}
          </div>
          {materialActions
            .filter(
              (action) =>
                !materialActionAvailable ||
                materialActionAvailable(action, workbenchItem),
            )
            .map((action) => (
            <button
              key={action}
              type="button"
              disabled={!onMaterialAction || Boolean(materialActionState === tt("应用中…"))}
              onClick={() => void applyMaterialAction(action, workbenchItem)}
              className="shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-50"
              style={{ borderColor: accent, color: accent }}
            >
              {tt(actionLabels[action])}
            </button>
          ))}
          {allowAdvanced && editorCapability.available && (
            <button
              type="button"
              onClick={() => {
                if (onOpenItem) {
                  onOpenItem(workbenchItem);
                  return;
                }
                const href = advancedFeatureHrefForItem(workbenchItem);
                if (href) router.push(href);
              }}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90"
              style={{ background: accent }}
            >
              {tt("高级功能")}
            </button>
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
          {selected.onDelete && (
            <button
              type="button"
              onClick={() => void removeEntry(selected)}
              disabled={deletingId === selected.id}
              className="shrink-0 rounded-lg border border-rose-500/25 px-2.5 py-1.5 text-[11px] font-medium text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-50"
            >
              {tt(deletingId === selected.id ? "删除中…" : "删除")}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const node = detailRef.current;
              if (!node) return;
              if (document.fullscreenElement) {
                void document.exitFullscreen();
              } else {
                void node.requestFullscreen();
              }
            }}
            className="shrink-0 rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,#fafaf9)]"
          >
            {tt("全屏")}
          </button>
          {linkUrl && (
            <a
              href={linkUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,#fafaf9)]"
            >
              {tt("链接")}
            </a>
          )}
        </header>
        {(materialActionState ||
          (allowAdvanced &&
            !editorCapability.available &&
            editorCapability.unavailableReason)) && (
          <div
            role="status"
            className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-600"
          >
            {materialActionState || tt(editorCapability.unavailableReason)}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface,#fafaf9)]">
          {selected.libraryItem ? (
            <LibraryItemViewer
              key={`${selected.id}:${viewerNonce}`}
              item={selected.libraryItem}
              accent={accent}
            />
          ) : selected.content ? (
            <div key={viewerNonce} className="h-full min-h-[520px]">
              {selected.content}
            </div>
          ) : (
            <WorkspaceLibraryEmpty
              title={tt("暂时无法预览")}
              description={tt("这个条目还没有可显示的内容。")}
            />
          )}
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
      {deleteError && (
        <p className="mt-2 shrink-0 rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] text-rose-500">
          {deleteError}
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
                onDelete={
                  entry.onDelete ? () => void removeEntry(entry) : undefined
                }
                deleting={deletingId === entry.id}
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
                onDelete={
                  entry.onDelete ? () => void removeEntry(entry) : undefined
                }
                deleting={deletingId === entry.id}
                accent={accent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkspaceCard({
  entry,
  onOpen,
  onDelete,
  deleting,
  accent,
  dragProps,
}: {
  entry: WorkspaceLibraryEntry;
  onOpen: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  accent: string;
  dragProps?: {
    draggable?: boolean;
    onDragStart?: (event: ReactDragEvent<HTMLElement>) => void;
    onDragEnd?: () => void;
  };
}) {
  const tt = useUI();
  const kind = entry.kind || entry.libraryItem?.kind || "file";
  return (
    <div
      {...dragProps}
      className={`group relative overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-left transition hover:-translate-y-0.5 hover:border-[var(--border-strong,#d6d3d1)] hover:shadow-sm ${
        dragProps?.draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface,#f5f5f4)]">
          <WorkspaceThumbnail
            url={entry.thumbUrl}
            item={entry.libraryItem}
            alt={entry.title}
            kind={kind}
            accent={accent}
            imageClassName="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
          <span className="absolute bottom-2 left-2 rounded-md bg-[var(--card,#fff)]/90 px-1.5 py-0.5 text-[10px] font-medium text-[var(--fg-2,#57534e)] shadow-sm backdrop-blur">
            {tt(KIND_LABELS[kind] || entry.category || "内容")}
          </span>
        </div>
        <div className="p-2.5">
          <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-[var(--fg,#292524)]">
            {entry.title}
          </p>
          {entry.description && (
            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--muted,#a8a29e)]">
              {tt(entry.description)}
            </p>
          )}
        </div>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={tt("删除「{title}」", { title: entry.title })}
          title={tt("删除")}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-[var(--card,#fff)]/95 text-[var(--muted,#a8a29e)] opacity-0 shadow-sm backdrop-blur transition hover:text-rose-600 disabled:opacity-50 group-hover:opacity-100 focus:opacity-100"
        >
          {deleting ? (
            <span className="v-spinner h-3 w-3" />
          ) : (
            <TrashIcon />
          )}
        </button>
      )}
    </div>
  );
}

function WorkspaceListRow({
  entry,
  onOpen,
  onDelete,
  deleting,
  dragProps,
}: {
  entry: WorkspaceLibraryEntry;
  onOpen: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  dragProps?: {
    draggable?: boolean;
    onDragStart?: (event: ReactDragEvent<HTMLElement>) => void;
    onDragEnd?: () => void;
  };
}) {
  const tt = useUI();
  const kind = entry.kind || entry.libraryItem?.kind || "file";
  return (
    <div
      {...dragProps}
      className={`flex w-full items-center rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] transition hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,#fafaf9)] ${
        dragProps?.draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left"
      >
        <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--surface,#f5f5f4)]">
          <WorkspaceThumbnail
            url={entry.thumbUrl}
            item={entry.libraryItem}
            alt={entry.title}
            kind={kind}
            accent="#78716c"
            imageClassName="h-full w-full object-cover"
            compact
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-[var(--fg,#292524)]">
            {entry.title}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-[var(--muted,#a8a29e)]">
            {entry.description
              ? tt(entry.description)
              : tt(KIND_LABELS[kind] || entry.category || "内容")}
          </p>
        </div>
        <svg className="h-4 w-4 shrink-0 text-[var(--border-strong,#d6d3d1)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={tt("删除「{title}」", { title: entry.title })}
          title={tt("删除")}
          className="mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted,#a8a29e)] transition hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50"
        >
          {deleting ? <span className="v-spinner h-3 w-3" /> : <TrashIcon />}
        </button>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WorkspaceKindIcon({
  kind,
  accent,
}: {
  kind: LibraryKind;
  accent: string;
}) {
  const tt = useUI();
  return (
    <div
      className="grid h-12 w-12 place-items-center rounded-2xl text-[11px] font-semibold"
      style={{ background: `${accent}12`, color: accent }}
    >
      {tt(KIND_LABELS[kind] || "内容")}
    </div>
  );
}

function WorkspaceThumbnail({
  url,
  item,
  alt,
  kind,
  accent,
  imageClassName,
  compact = false,
}: {
  url?: string;
  item?: LibraryItem;
  alt: string;
  kind: LibraryKind;
  accent: string;
  imageClassName: string;
  compact?: boolean;
}) {
  const tt = useUI();
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const reference = item ? advancedLibraryReferenceFor(item) : null;
  const referenceKey =
    reference &&
    (reference.source === "work" ||
      reference.source === "asset" ||
      reference.source === "artifact")
      ? `${reference.source}:${reference.id}`
      : "";
  const thumbnailFilename = String(
    item?.meta.filename ||
      item?.meta.format ||
      item?.url ||
      "",
  ).toLowerCase();
  const canGenerateThumbnail =
    /\.(?:pdf|docx?|odt|rtf|pptx?|odp|xlsx?|ods|csv|mp4|mov|webm)(?:$|[?#])/i.test(
      thumbnailFilename,
    ) ||
    /^(?:pdf|docx?|odt|rtf|pptx?|odp|xlsx?|ods|csv|mp4|mov|webm)$/.test(
      String(item?.meta.format || "").toLowerCase(),
    );
  const requiresGeneratedThumbnail = Boolean(
    item &&
      canGenerateThumbnail &&
      ["ppt", "sheet", "document", "video", "file"].includes(kind) &&
      (!url || url === item.url),
  );
  const [generatedUrl, setGeneratedUrl] = useState(
    referenceKey ? generatedThumbnailCache.get(referenceKey) || "" : "",
  );
  useEffect(() => {
    setFailed(false);
    setGeneratedUrl(
      referenceKey ? generatedThumbnailCache.get(referenceKey) || "" : "",
    );
  }, [referenceKey, url]);
  useEffect(() => {
    if (
      !referenceKey ||
      generatedThumbnailFailed.has(referenceKey) ||
      !visible ||
      generatedUrl ||
      (url && !failed && !requiresGeneratedThumbnail) ||
      !reference
    ) {
      return;
    }
    let alive = true;
    let pending = generatedThumbnailPending.get(referenceKey);
    if (!pending) {
      pending = ensureDatabaseThumbnail(
        reference.source as "work" | "asset" | "artifact",
        reference.id,
      )
        .then((result) => (result.ok ? result.data?.thumb_url || "" : ""))
        .catch(() => "");
      generatedThumbnailPending.set(referenceKey, pending);
    }
    void pending.then((nextUrl) => {
      generatedThumbnailPending.delete(referenceKey);
      if (!nextUrl) {
        generatedThumbnailFailed.add(referenceKey);
        return;
      }
      generatedThumbnailCache.set(referenceKey, nextUrl);
      if (alive) {
        setGeneratedUrl(nextUrl);
        setFailed(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [
    failed,
    generatedUrl,
    reference,
    referenceKey,
    requiresGeneratedThumbnail,
    url,
    visible,
  ]);
  const displayUrl =
    generatedUrl || (requiresGeneratedThumbnail ? "" : url);
  if (!displayUrl || failed) {
    return (
      <div ref={hostRef} className="grid h-full place-items-center">
        {compact ? (
          <span className="text-[10px] font-medium text-[var(--muted,#a8a29e)]">
            {tt(KIND_LABELS[kind] || "内容")}
          </span>
        ) : (
          <WorkspaceKindIcon kind={kind} accent={accent} />
        )}
      </div>
    );
  }
  return (
    <div ref={hostRef} className="h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={displayUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={imageClassName}
      />
    </div>
  );
}

function WorkspaceLibraryEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-6 text-center">
      <svg className="h-10 w-10 text-[var(--border-strong,#d6d3d1)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9h10M7 13h7M7 17h5" strokeLinecap="round" />
      </svg>
      <p className="mt-3 text-[13px] font-medium text-[var(--fg-2,#57534e)]">{title}</p>
      <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-[var(--muted,#a8a29e)]">
        {description}
      </p>
    </div>
  );
}
