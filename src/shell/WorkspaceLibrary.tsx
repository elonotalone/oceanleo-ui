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
import { humanErrorMessage } from "./human-error-message";
import {
  WORKSPACE_KIND_LABELS,
  filterWorkspaceLibraryEntries,
  visibleWorkspaceLibraryCategories,
  materialDeepLinkArtifactId,
  workspaceEntryFromLibraryItem,
  workspaceLibraryCategories,
  type WorkspaceLibraryEntry,
} from "./workspace-library-model";
import {
  MaterialOwningAppEdit,
  MaterialOwningAppList,
  materialAppLabel,
  useMaterialDetailAppPlan,
  type MaterialAppAttribution,
} from "./library-detail-app-actions";
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
  /**
   * Material library uses the toolbar taxonomy `<select>` as the sole type
   * shelf. Hide the overlapping horizontal LibraryChips row there without
   * affecting 我的库 / Navigator surfaces that still need chips.
   */
  hideCategoryChips?: boolean;
  toolbarActions?: ReactNode;
  /** Current Agent task is reused by the advanced workbench. */
  taskId?: string | null;
  siteId?: string;
  /**
   * 当前工作台锚定的 app。详情浮层用它区分「这份素材就属于我现在这个 app」（内联
   * 打开 typed 编辑器）和「它属于别的 app」（深链跳进那个 app 的工作台库预览）。
   */
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
  /** When true, the preview-detail header may offer Edit into the advanced workbench. */
  openAdvancedOnSelect?: boolean;
  /** Route hosts open the typed advanced editor from the detail-header Edit action. */
  onOpenItem?: (item: LibraryItem) => void;
  /** Workspace hosts can move every preview/editor into the fixed main canvas. */
  onOpenEntry?: (entry: WorkspaceLibraryEntry) => void;
  /**
   * 货架卡片上的动作插槽——**只给「下载」用**（合同 §0.6「每张素材卡带下载」、
   * §8.9 仲裁）。
   *
   * 另外四个动作（编辑 / 收藏 / 全屏 / 链接）仍然只许出现在安静预览详情的头部：
   * 货架的视觉安静是既定契约。`tests/typed-artifact-contract.test.mjs` 的
   * 「library shelf cards stay quiet」用 `shelfCardActionViolations()` 挡住把它们
   * 塞回卡片，那条断言同时带反向用例，改成摆设会被测出来。
   */
  entryActions?: (entry: WorkspaceLibraryEntry) => ReactNode;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /**
   * 空态下方的 CTA 插槽（只在「本来就没有内容」时出现，搜索无结果时不出现——那时
   * 该做的是换关键词，不是新建）。**可选**，不传时空态与今天逐字相同。
   */
  emptyCta?: ReactNode;
  className?: string;
  /** Full-page libraries render directly on the page instead of inside a white panel. */
  plain?: boolean;
}

/**
 * Shared list/detail shell for Preview, Materials and My Library.
 * Those three areas intentionally share the exact same search, categories,
 * card density, detail header and viewer dispatch. Shelf cards show thumbnail,
 * title, and — only where the host opts in through `entryActions` — a single
 * 下载 button; the other four artifact actions live on the quiet preview detail
 * header. Editable items are handed to the workspace-level host through the
 * detail-header Edit action via onOpenItem; this component never nests a full
 * editor inside a library detail.
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
  hideCategoryChips = false,
  toolbarActions,
  siteId = "",
  appId = "",
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
  entryActions,
  searchPlaceholder = "搜索",
  emptyTitle = "这里还没有内容",
  emptyDescription = "生成或保存内容后，会显示在这里。",
  emptyCta,
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
  const viewerRef = useRef<HTMLDivElement>(null);
  const materialActionPendingRef = useRef(false);
  /**
   * 详情要先向服务端取一次这份素材的当前版本，「下载」与「收藏」都等它。
   * 这两个状态存在的唯一理由：那一次失败时，读者要看得见发生了什么，并且**不用刷新
   * 整页**就能再试一次（改前的实况见 W4-journal J3：两颗按钮直接消失，没有出口）。
   */
  const [detailIdentityFailed, setDetailIdentityFailed] = useState(false);
  const [detailIdentityNonce, setDetailIdentityNonce] = useState(0);
  /**
   * 详情里此刻**真的**有没有可放大的东西。「全屏」过去只看宿主传没传回调，于是对任何
   * 素材恒亮；而查看器完全可能只渲染一句「暂时无法预览」或「登录后可预览」——那时候
   * 全屏放大的只是一屏文字加一排工具条。
   */
  const [viewerHasZoomableContent, setViewerHasZoomableContent] =
    useState(false);

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
      // 宿主编辑器抛什么都有可能，包括运行时的英文异常。摆给用户的必须是人话，
      // 但**往上抛的仍是原异常**：调用方要靠它做机器判断，排障也要靠它。
      const message = humanErrorMessage(
        caught,
        tt("这份素材没能应用到编辑器里，请重试。"),
      );
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

  const requestFullscreenFor = async (node: HTMLElement | null) => {
    if (!node) {
      throw new Error("当前详情没有可进入全屏的容器。");
    }
    if (document.fullscreenElement === node) return;
    if (
      document.fullscreenElement &&
      typeof document.exitFullscreen === "function"
    ) {
      await document.exitFullscreen();
    }
    if (typeof node.requestFullscreen !== "function") {
      throw new Error("当前环境不支持全屏。");
    }
    await node.requestFullscreen();
  };

  const activateEntry = (entry: WorkspaceLibraryEntry) => {
    // Primary card activation is quiet preview detail. Edit lives on the
    // detail header and must not be the card-click primary path.
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

  // 一份素材可以同时绑在多个 app 上（image 站已核实 9 组）。「编辑」要进的是**那个
  // app 的工作台**，并且落在该 app 库里这份素材的预览上——不是就地弹一个与归属无关
  // 的编辑器。落点与归属解析都在 `library-detail-app-actions`。
  // `useMaterialDetailAppPlan` 只在**取数失败**这一条分支上报状态，所以这个回调
  // 同时就是「身份没取到」的信号；`selectionKey` 带上 nonce，改它即重取一次。
  const detailAppPlan = useMaterialDetailAppPlan({
    entry: selected,
    selectionKey: `${selectedId}#${detailIdentityNonce}`,
    siteKey: siteId,
    appId,
    onStatus: (message) => {
      setDetailIdentityFailed(true);
      setMaterialActionState(message);
    },
  });

  /**
   * 素材就在当前 app 名下：深链会落回这一页，没有意义——直接进 typed 编辑器。
   * 这条路上的素材必然是 durable / 已解析成 durable 的官方模板行（transient 结果
   * 没有 app 绑定），所以不需要 `prepareArtifactForAction` 的 ensure 步骤。
   */
  const editInCurrentApp = async (
    app: MaterialAppAttribution,
    item: LibraryItem,
  ) => {
    setMaterialActionState(tt("正在打开编辑器…"));
    try {
      await editItem(item);
      setMaterialActionState(tt("编辑器已打开。"));
    } catch (caught) {
      setMaterialActionState(
        humanErrorMessage(
          caught,
          tt(`在「${materialAppLabel(app)}」里没能打开编辑器，请重试。`),
        ),
      );
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    if (!entries.some((entry) => entry.id === selectedId)) setSelectedId("");
  }, [entries, selectedId]);

  useEffect(() => {
    setMaterialActionState("");
    setDetailIdentityFailed(false);
    setDetailIdentityNonce(0);
  }, [selectedId]);

  /**
   * 「真有可放大内容」只有渲染出来才知道，所以直接看查看器那块 DOM 里有没有可放大的
   * 元素。`svg` 刻意不算：空态与「暂时无法预览」自己就带一个图标，把它算进去等于
   * 恒亮照旧。查看器异步换内容（图片加载、W3 的预览承载挂上 iframe）也要跟上，
   * 所以挂一个 MutationObserver 而不是只在挂载时看一眼。
   */
  useEffect(() => {
    const node = viewerRef.current;
    if (!node) {
      setViewerHasZoomableContent(false);
      return;
    }
    const probe = () =>
      setViewerHasZoomableContent(
        Boolean(
          node.querySelector(
            "img, iframe, canvas, video, model-viewer, [data-fullscreen-content]",
          ),
        ),
      );
    probe();
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(probe);
    observer.observe(node, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [selectedId, viewerNonce, detailAppPlan.item]);

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
    // `intent:"edit"` 已经由宿主直接送进 typed 编辑器，这里不要再抢着开一份安静
    // 预览详情——否则用户会看到编辑器背后还压着一层列表详情。
    if (next.intent === "edit") return;
    // 深链指名的是 **artifact id**，而 durable 条目的 `entry.id` 是
    // `artifact:<artifactId>:<revisionId>`，直接比 id 永远匹配不上。「预览&编辑」
    // 就落在这一行上，所以两种写法都要认。
    const byId = next.itemId
      ? entries.find(
          (entry) =>
            entry.id === next.itemId ||
            (entry.libraryItem &&
              isDurableLibraryItem(entry.libraryItem) &&
              entry.libraryItem.artifactId === next.itemId),
        )
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
    fullscreenNode?: () => HTMLElement | null,
  ) => {
    const item = entry.libraryItem;
    if (!item) return null;
    const linkUrl = entryLinkUrl(entry);
    const matrix = matrixFor(item);
    // 只有「本该解析出耐久身份、但现在还没有」的条目才需要这套说明与重试：
    // 已经是 durable 的、以及压根没有可解析身份的（临时结果），都与过去逐字相同。
    const identityExpected =
      Boolean(materialDeepLinkArtifactId(item)) && !isDurableLibraryItem(item);
    return (
      <ArtifactActionButtons
        item={item}
        matrix={
          // 归属 app 自己出编辑入口时，这里再渲染一颗无归属的「编辑」就成了第二个
          // 说法不一样的入口。隐藏而不是禁用：禁用会连带渲染一条「为什么不能编辑」
          // 的理由，而它此刻明明是能编辑的。
          detailAppPlan.routeEditByApp
            ? { ...matrix, edit: { ...matrix.edit, visible: false } }
            : matrix
        }
        onEdit={editItem}
        onInsert={(prepared) =>
          applyMaterialAction("insert", prepared)
        }
        onReplace={(prepared) =>
          applyMaterialAction("replace", prepared)
        }
        onFullscreen={async () => {
          const target =
            fullscreenNode?.() ||
            document.querySelector<HTMLElement>("[data-workspace-split]");
          await requestFullscreenFor(target);
        }}
        fullscreenContentPresent={
          fullscreenNode ? viewerHasZoomableContent : undefined
        }
        identity={
          identityExpected
            ? {
                resolving: !detailIdentityFailed,
                failed: detailIdentityFailed,
                reason:
                  "没取到这份素材的当前版本，所以下载与收藏暂时按不动；重试一次通常就好了。",
                onRetry: () => {
                  setDetailIdentityFailed(false);
                  setMaterialActionState("");
                  setDetailIdentityNonce((value) => value + 1);
                },
              }
            : undefined
        }
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
      detailAppPlan.item || {
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
            onClick={() => {
              const fullscreenElement = document.fullscreenElement;
              if (
                fullscreenElement &&
                detailRef.current?.contains(fullscreenElement) &&
                typeof document.exitFullscreen === "function"
              ) {
                void document.exitFullscreen();
              }
              setSelectedId("");
            }}
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
            {/* 跨 app 素材必须把**全部**归属摆在明面上：下面每个归属各有一颗编辑
                键，不写出来的话那排「编辑 · xxx」看上去像是凭空多出来的。 */}
            <MaterialOwningAppList plan={detailAppPlan} />
          </div>
          <MaterialOwningAppEdit
            plan={detailAppPlan}
            item={workbenchItem}
            appId={appId}
            accent={accent}
            compact
            onEditHere={(app, item) => void editInCurrentApp(app, item)}
          />
          {actionButtonsFor(
            {
              ...selected,
              libraryItem: workbenchItem,
            },
            true,
            () => detailRef.current,
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
        <div
          ref={viewerRef}
          className="min-h-0 flex-1 overflow-auto bg-[var(--surface,#fafaf9)]"
        >
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
        {!hideCategoryChips && categories.length > 1 && (
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
            cta={search ? undefined : emptyCta}
          />
        ) : view === "list" ? (
          <div className="space-y-1.5">
            {filtered.map((entry) => (
              <WorkspaceListRow
                key={entry.id}
                entry={entry}
                onOpen={() => activateEntry(entry)}
                dragProps={dragPropsFor(entry)}
                actions={entryActions?.(entry)}
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
                actions={entryActions?.(entry)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
