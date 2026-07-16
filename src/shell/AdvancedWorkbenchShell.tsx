"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useUI } from "../i18n/ui/useUI";
import {
  advancedFeatureForItem,
  advancedFeatureHrefForItem,
} from "./advanced-features";
import { AdvancedAgentPanel } from "./AdvancedAgentPanel";
import { AdvancedTasks } from "./AdvancedTasks";
import { AdvancedTopBar, type TopBarModel } from "./advanced-topbar";
import { CHROME, EditorPanel } from "./editor-chrome";
import {
  useAdvancedSession,
  type AdvancedFlushResult,
} from "./advanced-session-context";
import { AdvancedLayoutContext } from "./advanced-layout-context";
import type { LibraryItem } from "./library-data";
import { LibraryItemViewer, libraryKindLabel } from "./library-viewers";
import { MaterialLibrary } from "./MaterialLibrary";
import { MyLibrary } from "./MyLibrary";
import { useWorkbenchMaterials } from "./workbench-material-provider";

// 左侧导航只保留「资源与会话」入口（Canva 左栏气质）。创建/属性类操作全部
// 上移到统一顶栏（AdvancedTopBar）与选中对象浮动 bar；「编辑」栏已删除。
type WorkbenchTool = "agent" | "materials" | "tasks" | "library";

/** overlay 侧栏内容：由顶栏 panel 按钮触发，panelId → 渲染内容。 */
export interface EditorPanelDescriptor {
  id: string;
  title: string;
  width?: number;
  content: ReactNode;
}

export interface AdvancedWorkbenchShellProps {
  item: LibraryItem;
  previewContent?: ReactNode;
  linkUrl?: string;
  taskId?: string | null;
  siteId?: string;
  accent?: string;
  editorLabel: string;
  /**
   * 统一顶栏数据模型（创建 / 全局操作 + 收尾）。route 提供它以替代旧的左侧
   * editorToolbox。未提供时退回 editorToolbox（过渡兼容）。
   */
  topBarModel?: TopBarModel;
  /** overlay 侧栏内容集合（顶栏 kind:"panel" 按钮据 id 打开）。 */
  editorPanels?: EditorPanelDescriptor[];
  /**
   * 兼容旧路由：仍未迁移到 topBarModel 的编辑器把创建工具塞这里，作为一个
   * 默认 overlay 面板（"工具"）。迁移完成后移除。
   */
  editorToolbox?: ReactNode;
  /** Object-aware horizontal controls rendered over the stage. */
  editorContextualToolbar?: ReactNode;
  editorContextualToolbarAnchor?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  editorStage: ReactNode;
  editorAvailable?: boolean;
  editorStatus?: string;
  editorDirty?: boolean;
  editorOwnsCloseGuard?: boolean;
  /** Embedded editors render their own creation toolbox inside the iframe. */
  editorUsesOwnControls?: boolean;
  onBeforeNewConversation?:
    | (() => Promise<AdvancedFlushResult> | AdvancedFlushResult);
  savedItem?: LibraryItem | null;
  exportPanel?: ReactNode;
  versionRevision?: string | number;
  onClose: () => void;
}

function curatedTypeFor(item: LibraryItem): string {
  const explicit = String(
    item.descriptor?.contentType || item.meta.content_type || item.meta.asset_type || "",
  ).toLowerCase();
  if (explicit === "chart") return "chart";
  const map: Partial<Record<LibraryItem["kind"], string>> = {
    website: "website",
    canvas: "image",
    ppt: "ppt",
    sheet: "sheet",
    document: "document",
    image: "image",
    video: "video",
    video_canvas: "video_workflow",
    audio: "audio",
    xhs: "image",
    threed: "3d",
  };
  return map[item.kind] || "all";
}

function ToolIcon({ tool }: { tool: WorkbenchTool }) {
  const paths: Record<WorkbenchTool, ReactNode> = {
    agent: (
      <>
        <path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1" />
        <rect x="6" y="7" width="12" height="12" rx="4" />
        <path d="M9.5 13h.01M14.5 13h.01M9.5 16h5" />
      </>
    ),
    materials: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h10M7 12h6M7 16h8" />
      </>
    ),
    tasks: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    library: (
      <>
        <path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5v-16z" />
        <path d="M4 18.5A2.5 2.5 0 016.5 16H20" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-6 w-6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[tool]}
    </svg>
  );
}

/**
 * The route-agnostic full-screen shell. Route adapters own the editor hook and
 * provide a unified top bar model + stage + optional overlay panels, so only
 * the selected editor is mounted and every feature shares one chrome.
 */
export function AdvancedWorkbenchShell({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  editorLabel,
  topBarModel,
  editorPanels,
  editorToolbox,
  editorContextualToolbar,
  editorContextualToolbarAnchor,
  editorStage,
  editorAvailable = true,
  editorStatus = "",
  editorDirty = false,
  editorOwnsCloseGuard = false,
  editorUsesOwnControls = false,
  onBeforeNewConversation,
  savedItem = null,
  onClose,
}: AdvancedWorkbenchShellProps) {
  const tt = useUI();
  const router = useRouter();
  const currentFeatureId = advancedFeatureForItem(item)?.id;
  const rootRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const dirtyRecordedRef = useRef(false);
  const portalReady = typeof document !== "undefined";
  const advancedSession = useAdvancedSession();
  const workbenchMaterials = useWorkbenchMaterials();

  // 左侧导航默认收起（Canva 里画布优先，资源栏靠图标召唤）。
  const [activeTool, setActiveTool] = useState<WorkbenchTool | null>(null);
  const [panelWidth, setPanelWidth] = useState(320);
  const [fullscreen, setFullscreen] = useState(false);
  const [resizing, setResizing] = useState(false);
  // 顶栏 panel 按钮打开的 overlay 侧栏（编辑属性/图层/主题等）。
  const [activePanelId, setActivePanelId] = useState<string | null>(null);

  // 过渡兼容：老路由只给了 editorToolbox → 合成一个默认 overlay 面板。
  const panels = useMemo<EditorPanelDescriptor[]>(() => {
    if (editorPanels?.length) return editorPanels;
    if (editorToolbox && !editorUsesOwnControls) {
      return [
        { id: "tools", title: tt(editorLabel), width: 320, content: editorToolbox },
      ];
    }
    return [];
  }, [editorLabel, editorPanels, editorToolbox, editorUsesOwnControls, tt]);

  const effectiveTopBar = useMemo<TopBarModel | null>(() => {
    if (topBarModel) return topBarModel;
    // 老路由无顶栏模型：至少给一个「工具」panel 按钮，接住旧 editorToolbox。
    if (panels.length) {
      return {
        groups: [
          {
            id: "legacy",
            actions: panels.map((panel) => ({
              kind: "panel" as const,
              id: panel.id,
              label: panel.title,
              icon: "adjust",
              panelId: panel.id,
            })),
          },
        ],
      };
    }
    return null;
  }, [panels, topBarModel]);

  const activePanel = panels.find((panel) => panel.id === activePanelId) || null;

  const layoutState = useMemo(
    () => ({
      hostPanelVisible: activeTool !== null,
      editorToolActive: activePanelId !== null,
    }),
    [activePanelId, activeTool],
  );

  const requestClose = useCallback(() => {
    if (
      editorDirty &&
      !editorOwnsCloseGuard &&
      !window.confirm(tt("当前有未保存的修改，确定要离开高级工作台吗？"))
    ) {
      return;
    }
    onClose();
  }, [editorDirty, editorOwnsCloseGuard, onClose, tt]);

  useEffect(() => {
    if (!editorDirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [editorDirty]);

  useEffect(() => {
    if (!editorDirty) {
      dirtyRecordedRef.current = false;
      return;
    }
    if (!advancedSession || dirtyRecordedRef.current) return;
    dirtyRecordedRef.current = true;
    void (async () => {
      const session = await advancedSession.ensure();
      if (!session) dirtyRecordedRef.current = false;
    })();
  }, [advancedSession, editorDirty]);

  useEffect(() => {
    if (!advancedSession || !savedItem) return;
    void advancedSession.recordSavedItem(savedItem);
  }, [advancedSession, savedItem]);

  useEffect(() => {
    if (!advancedSession) return;
    advancedSession.registerFlush(async () => {
      if (!editorDirty) {
        return savedItem ? { ok: true, item: savedItem } : { ok: true };
      }
      if (!onBeforeNewConversation) {
        return { ok: false, error: "当前编辑器无法保存未提交修改" };
      }
      return onBeforeNewConversation();
    });
    return () => advancedSession.registerFlush(null);
  }, [advancedSession, editorDirty, onBeforeNewConversation, savedItem]);

  useEffect(() => {
    if (!portalReady) return;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const root = rootRef.current;
    const siblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => {
        return element instanceof HTMLElement && element !== root;
      })
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    siblings.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    root?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement && !activePanelId) {
        requestClose();
      }
      if (event.key !== "Tab" || !root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hidden && element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const full = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", close);
    document.addEventListener("fullscreenchange", full);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      siblings.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden == null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      window.removeEventListener("keydown", close);
      document.removeEventListener("fullscreenchange", full);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [activePanelId, portalReady, requestClose]);

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    },
    [],
  );

  const tools = useMemo(
    () =>
      [
        { id: "agent" as const, label: tt("Agent") },
        { id: "materials" as const, label: tt("素材") },
        { id: "tasks" as const, label: tt("我的任务") },
        { id: "library" as const, label: tt("我的库") },
      ] satisfies { id: WorkbenchTool; label: string }[],
    [tt],
  );

  // 左栏图标点击 = toggle 伸缩（再点同一激活图标即收起）。
  const chooseTool = useCallback((tool: WorkbenchTool) => {
    setActiveTool((current) => (current === tool ? null : tool));
  }, []);

  const openPanel = useCallback((panelId: string) => {
    setActivePanelId((current) => (current === panelId ? null : panelId));
  }, []);

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture?.(pointerId);
    const startX = event.clientX;
    const startWidth = panelWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    let frame = 0;
    let nextX = startX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setResizing(true);
    const render = () => {
      frame = 0;
      setPanelWidth(
        Math.min(
          Math.min(560, Math.max(260, window.innerWidth * 0.42)),
          Math.max(260, startWidth + nextX - startX),
        ),
      );
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      nextX = next.clientX;
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      handle.removeEventListener("lostpointercapture", stop);
      if (handle.hasPointerCapture?.(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    handle.addEventListener("lostpointercapture", stop);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await rootRef.current?.requestFullscreen();
      }
    } catch {
      // The portal already covers the viewport.
    }
  }

  let sidePanel: ReactNode = null;
  if (activeTool === "agent") {
    sidePanel = (
      <AdvancedAgentPanel item={item} taskId={taskId} siteId={siteId} accent={accent} />
    );
  } else if (activeTool === "materials") {
    sidePanel = (
      <div className="h-full min-h-0">
        <MaterialLibrary
          materials={[]}
          featuredEntries={[...(workbenchMaterials?.entries || [])]}
          curatedType={curatedTypeFor(item)}
          curatedSeriesId={siteId === "design" ? "design-materials" : ""}
          accent={accent}
          taskId={taskId}
          siteId={siteId}
          appId={workbenchMaterials?.appId}
          registerRuntimeSource={false}
          materialActions={workbenchMaterials?.actions || []}
          onMaterialAction={workbenchMaterials?.perform}
          materialActionAvailable={workbenchMaterials?.canPerform}
          allowAdvancedOnSelect={false}
          hideSeeAll
        />
      </div>
    );
  } else if (activeTool === "tasks") {
    sidePanel = (
      <AdvancedTasks
        siteId={siteId}
        accent={accent}
        currentSessionId={advancedSession?.sessionId}
      />
    );
  } else if (activeTool === "library") {
    sidePanel = (
      <MyLibrary
        siteId={siteId}
        accent={accent}
        taskId={taskId}
        plain
        itemFilter={(candidate) =>
          advancedFeatureForItem(candidate)?.id === currentFeatureId
        }
        onOpenItem={(nextItem) => {
          const href = advancedFeatureHrefForItem(nextItem);
          if (href) router.push(href);
        }}
      />
    );
  }

  if (!portalReady) return null;

  const contextualAnchor =
    editorContextualToolbarAnchor &&
    Object.values(editorContextualToolbarAnchor).every(Number.isFinite)
      ? editorContextualToolbarAnchor
      : null;
  const contextualLeft = contextualAnchor
    ? Math.max(
        16,
        Math.min(
          window.innerWidth - 16,
          contextualAnchor.x + contextualAnchor.width / 2,
        ),
      )
    : 0;
  const contextualTop = contextualAnchor
    ? Math.max(112, contextualAnchor.y - 10)
    : 0;

  const visibleEditorStatus = ["loading", "ready"].includes(
    editorStatus.trim().toLowerCase(),
  )
    ? ""
    : editorStatus;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} · ${tt("高级功能")}`}
      tabIndex={-1}
      className={`fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen flex-col overflow-hidden ${CHROME.surface} ${CHROME.fg}`}
    >
      {resizing && (
        <div
          className="fixed inset-0 z-[2147483600] cursor-col-resize bg-transparent"
          aria-hidden="true"
        />
      )}
      <header className={`flex h-12 shrink-0 items-center gap-3 border-b ${CHROME.border} px-3`}>
        <button
          type="button"
          onClick={requestClose}
          className={`inline-flex items-center gap-1 rounded-lg border ${CHROME.border} px-2.5 py-1.5 text-[11px] ${CHROME.fg2} ${CHROME.hover}`}
        >
          ← {tt("返回")}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[13px] font-semibold ${CHROME.fg}`}>{item.title}</p>
          <p className={`truncate text-[10px] ${CHROME.muted}`}>
            {tt("高级功能")} · {tt(libraryKindLabel(item.kind))}
          </p>
        </div>
        {visibleEditorStatus && (
          <span className={`hidden max-w-[28rem] truncate text-[11px] ${CHROME.muted} md:block`}>
            {visibleEditorStatus}
          </span>
        )}
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className={`rounded-lg border ${CHROME.border} px-2.5 py-1.5 text-[11px] ${CHROME.fg2} ${CHROME.hover}`}
        >
          {fullscreen ? tt("退出全屏") : tt("浏览器全屏")}
        </button>
        <button
          type="button"
          onClick={requestClose}
          aria-label={tt("关闭")}
          className={`grid h-8 w-8 place-items-center rounded-lg text-lg ${CHROME.muted} ${CHROME.hover}`}
        >
          ×
        </button>
      </header>

      <AdvancedLayoutContext.Provider value={layoutState}>
        {/* 统一顶部主 bar：创建/全局操作，按对象类型数据驱动换按钮。 */}
        {editorAvailable && effectiveTopBar && (
          <AdvancedTopBar
            model={effectiveTopBar}
            accent={accent}
            activePanelId={activePanelId}
            onOpenPanel={openPanel}
          />
        )}

        <div className="flex min-h-0 flex-1">
          <nav className={`flex w-16 shrink-0 flex-col items-center gap-1.5 border-r ${CHROME.border} ${CHROME.subtle} py-2`}>
            {tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => chooseTool(tool.id)}
                aria-pressed={activeTool === tool.id}
                className={`group relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-2xl transition ${
                  activeTool === tool.id
                    ? `${CHROME.surface} shadow-sm`
                    : `${CHROME.muted} ${CHROME.hover} hover:text-[var(--fg,#292524)]`
                }`}
                style={activeTool === tool.id ? { color: accent } : undefined}
                aria-label={tool.label}
              >
                <ToolIcon tool={tool.id} />
                <span className="max-w-14 truncate text-[9px] font-medium">
                  {tool.label}
                </span>
              </button>
            ))}
          </nav>

          {activeTool && sidePanel && (
            <>
              <aside
                className={`min-h-0 max-w-[42vw] shrink-0 overflow-hidden border-r ${CHROME.border} ${CHROME.surface}`}
                style={{ width: panelWidth }}
              >
                <div className={`flex h-10 items-center border-b ${CHROME.border} px-3 text-[12px] font-semibold ${CHROME.fg}`}>
                  <span className="min-w-0 flex-1 truncate">
                    {tools.find((tool) => tool.id === activeTool)?.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTool(null)}
                    aria-label={tt("收起工具区")}
                    className={`grid h-7 w-7 place-items-center rounded-lg ${CHROME.muted} ${CHROME.hover}`}
                  >
                    ×
                  </button>
                </div>
                <div className="h-[calc(100%-2.5rem)] min-h-0 overflow-y-auto">
                  {sidePanel}
                </div>
              </aside>
              <div
                role="separator"
                aria-orientation="vertical"
                onPointerDown={beginResize}
                className={`-ml-1 hidden w-2 shrink-0 cursor-col-resize touch-none bg-transparent transition hover:${CHROME.divider} md:block`}
                title={tt("拖动调整工具区宽度")}
              />
            </>
          )}

          <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--bg,#f5f5f4)]">
            {/* overlay 侧栏：顶栏 panel 按钮触发，浮在画布上、不挤压 */}
            {editorAvailable && activePanel && (
              <EditorPanel
                title={activePanel.title}
                width={activePanel.width || 320}
                onClose={() => setActivePanelId(null)}
              >
                {activePanel.content}
              </EditorPanel>
            )}

            {editorAvailable && editorContextualToolbar && (
              <div
                className={
                  contextualAnchor
                    ? "pointer-events-none fixed z-40 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-full"
                    : "pointer-events-none absolute left-1/2 top-3 z-40 max-w-[calc(100%-1.5rem)] -translate-x-1/2"
                }
                style={
                  contextualAnchor
                    ? { left: contextualLeft, top: contextualTop }
                    : undefined
                }
              >
                {editorContextualToolbar}
              </div>
            )}
            {editorAvailable ? (
              <div className="h-full">{editorStage}</div>
            ) : (
              <div className={`h-full overflow-auto ${CHROME.surface}`}>
                <LibraryItemViewer item={item} accent={accent} />
              </div>
            )}
          </main>
        </div>
      </AdvancedLayoutContext.Provider>
    </div>,
    document.body,
  );
}
