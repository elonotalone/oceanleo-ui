"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../i18n/ui/useUI";
import {
  AdvancedEditorIcon,
} from "./AdvancedEditorIcon";
import type {
  AdvancedEditorAdapter,
  AdvancedWorkbenchDrawer,
} from "./advanced-editor-adapter";
import { AdvancedStageControls } from "./AdvancedStageControls";
import { AdvancedWorkbenchHeader } from "./AdvancedWorkbenchHeader";
import { AdvancedWorkbenchPanel } from "./AdvancedWorkbenchPanel";
import {
  AdvancedWorkbenchSidebar,
  type WorkbenchNavItem,
} from "./AdvancedWorkbenchSidebar";
import { AdvancedWorkbenchStage } from "./AdvancedWorkbenchStage";
import { useAdvancedSession } from "./advanced-session-context";
import { AdvancedLayoutContext } from "./advanced-layout-context";
import type { LibraryItem } from "./library-data";
import {
  useWorkbenchMaterials,
  type WorkbenchMaterialAction,
} from "./workbench-material-provider";
import { useAdvancedAutoSave } from "./use-advanced-autosave";
import { useAdvancedRecovery } from "./use-advanced-recovery";
import { advancedWorkbenchStyle } from "./advanced-workbench-chrome";

export interface AdvancedWorkbenchShellProps {
  item: LibraryItem;
  taskId?: string | null;
  siteId?: string;
  accent?: string;
  adapter: AdvancedEditorAdapter;
  onClose: () => void;
}

/**
 * The route-agnostic full-screen shell. Route adapters own the actual editor
 * hook and provide Controls + Stage as slots, so only the selected editor is
 * mounted (no hidden image/video/audio decoders doing work for another kind).
 */
export function AdvancedWorkbenchShell({
  item,
  taskId,
  siteId = "",
  accent = "#6d5dfc",
  adapter,
  onClose,
}: AdvancedWorkbenchShellProps) {
  const tt = useUI();
  const editorLabel = adapter.label;
  const editorToolbox = adapter.toolbox?.content;
  const editorDrawerLabel = adapter.toolbox?.label;
  const editorDrawerIcon = adapter.toolbox?.icon || "settings";
  const editorDrawers = adapter.drawers || [];
  const editorContextualToolbar = adapter.contextToolbar;
  const editorHeaderActions = adapter.actions;
  const editorHistory = adapter.history;
  const editorViewport = adapter.nativeChrome?.viewport
    ? undefined
    : adapter.viewport;
  const editorStage = adapter.stage;
  const editorAvailable = adapter.available !== false;
  const editorStatus = adapter.status || "";
  const editorDirty = adapter.persistence?.dirty || false;
  const onBeforeNewConversation = adapter.persistence?.flush;
  const versionRevision = adapter.persistence?.editRevision || 0;
  const editorCloseRequestRevision = adapter.closeRequestRevision || 0;
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const dirtyRecordedRef = useRef(false);
  const closingRef = useRef(false);
  const handledCloseRequestRef = useRef(editorCloseRequestRevision);
  const portalReady = typeof document !== "undefined";
  const advancedSession = useAdvancedSession();
  const autoSave = useAdvancedAutoSave({
    dirty: editorDirty,
    revision: versionRevision,
    flush: onBeforeNewConversation,
    session: advancedSession,
  });
  useAdvancedRecovery({
    editorId: adapter.id,
    revision: versionRevision,
    dirty: editorDirty,
    persistenceState: autoSave.state,
    recovery: adapter.persistence?.recovery,
  });
  const workbenchMaterials = useWorkbenchMaterials();
  const fallbackDrawer = useMemo<AdvancedWorkbenchDrawer[]>(() => {
    if (editorDrawers.length) return [...editorDrawers];
    if (!editorToolbox) return [];
    return [
      {
        id: "editor-global",
        label: editorDrawerLabel || editorLabel,
        icon: editorDrawerIcon,
        content: editorToolbox,
      },
    ];
  }, [
    editorDrawerIcon,
    editorDrawerLabel,
    editorDrawers,
    editorLabel,
    editorToolbox,
  ]);
  const [activeTool, setActiveTool] = useState<string>("agent");
  const [panelWidth, setPanelWidth] = useState(380);
  const [panelVisible, setPanelVisible] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 768,
  );
  const [compactLayout, setCompactLayout] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [startingNew, setStartingNew] = useState(false);
  const [dropMessage, setDropMessage] = useState("");
  const [requestedMaterialAction, setRequestedMaterialAction] =
    useState<WorkbenchMaterialAction>();
  const editorDrawerIds = useMemo(
    () => new Set(fallbackDrawer.map((drawer) => drawer.id)),
    [fallbackDrawer],
  );
  const openDrawer = useCallback((
    drawerId: string,
    panelAction?: WorkbenchMaterialAction,
  ) => {
    setRequestedMaterialAction(
      drawerId === "materials" ? panelAction : undefined,
    );
    setActiveTool(drawerId);
    setPanelVisible(true);
  }, []);
  const layoutState = useMemo(
    () => ({
      hostPanelVisible: panelVisible,
      editorToolActive: editorDrawerIds.has(activeTool),
      activeDrawerId: activeTool,
      openDrawer,
    }),
    [activeTool, editorDrawerIds, openDrawer, panelVisible],
  );

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    void (async () => {
      if (editorDirty || autoSave.state !== "saved") {
        const flushed = await autoSave.flushLatest();
        if (
          !flushed.ok &&
          !window.confirm(
            tt("修改仍安全保留在当前编辑器，但尚未同步到云端。仍要离开吗？"),
          )
        ) {
          closingRef.current = false;
          return;
        }
      }
      onClose();
      closingRef.current = false;
    })();
  }, [autoSave.flushLatest, autoSave.state, editorDirty, onClose, tt]);

  useEffect(() => {
    if (editorCloseRequestRevision <= handledCloseRequestRef.current) return;
    handledCloseRequestRef.current = editorCloseRequestRevision;
    requestClose();
  }, [editorCloseRequestRevision, requestClose]);

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
    if (!advancedSession) return;
    advancedSession.registerFlush(autoSave.flushLatest);
    return () => advancedSession.registerFlush(null);
  }, [advancedSession, autoSave.flushLatest]);

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
      if (event.key === "Escape" && !document.fullscreenElement) requestClose();
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
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      siblings.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden == null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      window.removeEventListener("keydown", close);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [portalReady, requestClose]);

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const reflow = () => {
      const compact = window.innerWidth < 768;
      setCompactLayout(compact);
      if (!compact) {
        setPanelWidth((current) =>
          Math.min(
            current,
            Math.min(620, Math.max(320, window.innerWidth * 0.48)),
          ),
        );
      }
    };
    reflow();
    window.addEventListener("resize", reflow);
    return () => window.removeEventListener("resize", reflow);
  }, []);

  const tools = useMemo(
    () =>
      [
        { id: "agent", label: tt("Agent"), icon: "agent" },
        {
          id: "materials",
          label: tt("素材"),
          icon: "materials",
        },
        {
          id: "uploads",
          label: tt("上传"),
          icon: "uploads",
        },
        {
          id: "tasks",
          label: tt("我的任务"),
          icon: "tasks",
        },
        {
          id: "library",
          label: tt("我的库"),
          icon: "library",
        },
      ] satisfies WorkbenchNavItem[],
    [tt],
  );

  const chooseTool = useCallback((tool: string) => {
    setRequestedMaterialAction(undefined);
    if (tool === activeTool && panelVisible) {
      setPanelVisible(false);
      return;
    }
    setActiveTool(tool);
    setPanelVisible(true);
  }, [activeTool, panelVisible]);

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
          Math.min(620, Math.max(320, window.innerWidth * 0.48)),
          Math.max(320, startWidth + nextX - startX),
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

  const startNewTask = useCallback(async () => {
    if (!advancedSession || startingNew) return;
    setStartingNew(true);
    const next = await advancedSession.startNew();
    if (!next) setDropMessage(tt("新建任务失败，当前内容仍已保留。"));
    setStartingNew(false);
  }, [advancedSession, startingNew, tt]);

  const renameTitle = useCallback(
    async (title: string) => {
      if (!advancedSession) return;
      const renamed = await advancedSession.renameTitle(title);
      if (!renamed) setDropMessage(tt("项目名称保存失败，请稍后重试。"));
    },
    [advancedSession, tt],
  );

  const customDrawer = fallbackDrawer.find(
    (drawer) => drawer.id === activeTool,
  );
  const primaryEditorDrawer = editorToolbox ? fallbackDrawer[0] : undefined;
  const preferredMaterialAction = (
    ["insert", "apply", "replace", "merge"] as const
  ).find((action) => workbenchMaterials?.actions.includes(action));
  const activeMaterialAction =
    requestedMaterialAction &&
    workbenchMaterials?.actions.includes(requestedMaterialAction)
      ? requestedMaterialAction
      : preferredMaterialAction;
  const panel = (
    <AdvancedWorkbenchPanel
      activeTool={activeTool}
      hasCustomContent={Boolean(customDrawer)}
      customContent={customDrawer?.content}
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      sessionId={advancedSession?.sessionId}
      materials={workbenchMaterials}
      primaryMaterialAction={activeMaterialAction}
    />
  );

  if (!portalReady) return null;

  // Route adapters already render an in-canvas loading state. Raw machine
  // states from third-party editors ("loading" / "ready") are not useful in
  // the title bar and previously remained there after usable content painted.
  const visibleEditorStatus = ["loading", "ready"].includes(
    editorStatus.trim().toLowerCase(),
  )
    ? ""
    : editorStatus;
  const handleMaterialDrop = async (
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const material = workbenchMaterials?.draggedItem;
    if (!material || !activeMaterialAction || !workbenchMaterials) return;
    setDropMessage(tt("正在添加素材…"));
    const result = await workbenchMaterials.perform(
      activeMaterialAction,
      material,
      {
        source: "drop",
        clientX: event.clientX,
        clientY: event.clientY,
      },
    );
    workbenchMaterials.endMaterialDrag();
    setDropMessage(
      result.ok ? tt("素材已添加到画布") : result.error || tt("素材添加失败"),
    );
    window.setTimeout(() => setDropMessage(""), 1800);
  };

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} · ${tt("高级功能")}`}
      tabIndex={-1}
      className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--awb-shell-bg)] font-[var(--font-sans,Inter,'Noto_Sans_SC','PingFang_SC','Microsoft_YaHei',sans-serif)] text-[var(--awb-text)]"
      style={advancedWorkbenchStyle(accent)}
    >
      {resizing && (
        <div
          className="fixed inset-0 z-[2147483600] cursor-col-resize bg-transparent"
          aria-hidden="true"
        />
      )}
      <AdvancedLayoutContext.Provider value={layoutState}>
      <AdvancedWorkbenchHeader
        item={item}
        editorLabel={editorLabel}
        status={visibleEditorStatus}
        actions={editorHeaderActions}
        accent={accent}
        history={editorHistory}
        startingNew={startingNew}
        autoSaveState={autoSave.state}
        mobileActionsOpen={mobileActionsOpen}
        onToggleMobileActions={() =>
          setMobileActionsOpen((value) => !value)
        }
        onOpenPanel={openDrawer}
        onStartNew={() => void startNewTask()}
        onAutoSave={() => void autoSave.retry()}
        onRenameTitle={renameTitle}
        onClose={requestClose}
      />
      <div className="flex min-h-0 flex-1">
        <AdvancedWorkbenchSidebar
          tools={tools}
          activeTool={activeTool}
          activeLabel={customDrawer ? tt(customDrawer.label) : undefined}
          panelVisible={panelVisible}
          panelWidth={panelWidth}
          compact={compactLayout}
          panel={panel}
          accent={accent}
          onChooseTool={chooseTool}
          onClosePanel={() => setPanelVisible(false)}
          onBeginResize={beginResize}
        />

        <div
          ref={stageRef}
          className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[var(--awb-stage-bg)]"
        >
          {editorAvailable &&
            (primaryEditorDrawer ||
              editorContextualToolbar ||
              adapter.nativeChrome?.toolbar) && (
              <div
                data-advanced-context-row
                className="z-[70] flex min-h-14 min-w-0 items-center gap-2 border-b border-[var(--awb-border)] bg-[var(--awb-stage-bg)] px-3 py-2"
              >
                {primaryEditorDrawer && (
                  <button
                    type="button"
                    onClick={() => openDrawer(primaryEditorDrawer.id)}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] px-3 text-[12px] font-semibold text-[var(--awb-text)] shadow-sm transition hover:bg-[var(--awb-hover)]"
                    aria-label={tt(primaryEditorDrawer.label)}
                    aria-expanded={
                      panelVisible && activeTool === primaryEditorDrawer.id
                    }
                  >
                    <AdvancedEditorIcon
                      name={primaryEditorDrawer.icon}
                      className="h-4 w-4"
                    />
                    {tt(primaryEditorDrawer.label)}
                  </button>
                )}
                {adapter.nativeChrome?.toolbar && (
                  <button
                    type="button"
                    onClick={() => setPanelVisible(false)}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] px-3 text-[12px] font-semibold text-[var(--awb-text)] shadow-sm transition hover:bg-[var(--awb-hover)]"
                    aria-pressed={!panelVisible}
                    aria-label={tt("编辑器工具")}
                  >
                    <AdvancedEditorIcon name="settings" className="h-4 w-4" />
                    {tt("编辑器工具")}
                  </button>
                )}
                <div className="min-w-0 flex-1 overflow-x-auto">
                  {editorContextualToolbar}
                </div>
              </div>
            )}
          <div className="relative min-h-0 min-w-0 overflow-hidden">
            <AdvancedWorkbenchStage
              editorAvailable={editorAvailable}
              editorStage={editorStage}
              item={item}
              accent={accent}
              draggedTitle={
                activeMaterialAction
                  ? workbenchMaterials?.draggedItem?.title
                  : undefined
              }
              dropMessage={dropMessage}
              onMaterialDrop={(event) => void handleMaterialDrop(event)}
            />
          </div>
          <div
            data-advanced-viewport-row
            className="flex min-h-14 shrink-0 items-center justify-end border-t border-[var(--awb-border)] bg-[var(--awb-stage-bg)] px-3 py-2"
          >
            <AdvancedStageControls
              stageRef={stageRef}
              viewport={editorViewport}
              accent={accent}
            />
          </div>
        </div>
      </div>
      </AdvancedLayoutContext.Provider>
    </div>,
    document.body,
  );
}
