"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../i18n/ui/useUI";
import type { WorkbenchIconName } from "./AdvancedEditorIcon";
import { AdvancedWorkbenchHeader } from "./AdvancedWorkbenchHeader";
import { AdvancedWorkbenchPanel } from "./AdvancedWorkbenchPanel";
import {
  AdvancedWorkbenchSidebar,
  type WorkbenchNavItem,
} from "./AdvancedWorkbenchSidebar";
import { AdvancedWorkbenchStage } from "./AdvancedWorkbenchStage";
import {
  useAdvancedSession,
  type AdvancedFlushResult,
} from "./advanced-session-context";
import { AdvancedLayoutContext } from "./advanced-layout-context";
import type { LibraryItem } from "./library-data";
import {
  useWorkbenchMaterials,
  type WorkbenchMaterialAction,
} from "./workbench-material-provider";

export interface AdvancedWorkbenchDrawer {
  id: string;
  label: string;
  icon: WorkbenchIconName;
  content: ReactNode;
  hiddenFromRail?: boolean;
}

export interface AdvancedWorkbenchShellProps {
  item: LibraryItem;
  previewContent?: ReactNode;
  linkUrl?: string;
  taskId?: string | null;
  siteId?: string;
  accent?: string;
  editorLabel: string;
  /** Creation/global tools only. Selection-specific properties belong in editorContextualToolbar. */
  editorToolbox?: ReactNode;
  /** Optional route-specific label/icon for the legacy global toolbox fallback. */
  editorDrawerLabel?: string;
  editorDrawerIcon?: WorkbenchIconName;
  /** Canva-style content drawers supplied by the current editor route. */
  editorDrawers?: readonly AdvancedWorkbenchDrawer[];
  /** Object-aware controls rendered in the single shared property bar. */
  editorContextualToolbar?: ReactNode;
  /** Persistent document-level actions shown in the colored product header. */
  editorHeaderActions?: ReactNode;
  /** @deprecated The property bar is fixed at the top; kept for route compatibility. */
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
  /** Embedded editors render their own creation toolbox when the Tools entry is active. */
  editorUsesOwnControls?: boolean;
  /** Persist pending editor changes before Advanced Agent starts a new session. */
  onBeforeNewConversation?:
    | (() => Promise<AdvancedFlushResult> | AdvancedFlushResult);
  /** Latest durable material version produced by an explicit editor save. */
  savedItem?: LibraryItem | null;
  exportPanel?: ReactNode;
  versionRevision?: string | number;
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
  accent = "#4f46e5",
  editorLabel,
  editorToolbox,
  editorDrawerLabel,
  editorDrawerIcon = "settings",
  editorDrawers = [],
  editorContextualToolbar,
  editorHeaderActions,
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
  const rootRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const dirtyRecordedRef = useRef(false);
  const portalReady = typeof document !== "undefined";
  const advancedSession = useAdvancedSession();
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
  const [activeTool, setActiveTool] = useState<string>(
    () =>
      (!editorUsesOwnControls && editorAvailable && fallbackDrawer[0]?.id) ||
      "agent",
  );
  const [panelWidth, setPanelWidth] = useState(340);
  const [panelVisible, setPanelVisible] = useState(
    () =>
      !editorUsesOwnControls &&
      (typeof window === "undefined" || window.innerWidth >= 768),
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
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
  }, [portalReady, requestClose]);

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    },
    [],
  );

  const tools = useMemo(
    () => {
      const custom: WorkbenchNavItem[] = editorAvailable
        ? fallbackDrawer
          .filter((drawer) => !drawer.hiddenFromRail)
          .map((drawer) => ({
            id: drawer.id,
            label: tt(drawer.label),
            icon: drawer.icon,
          }))
        : [];
      return [
        ...custom,
        {
          id: "materials",
          label: tt("素材"),
          icon: "materials",
        },
        { id: "agent", label: tt("Agent"), icon: "agent" },
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
      ] satisfies WorkbenchNavItem[];
    },
    [editorAvailable, fallbackDrawer, tt],
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
          Math.min(620, Math.max(270, window.innerWidth * 0.48)),
          Math.max(270, startWidth + nextX - startX),
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
      // The portal already covers the viewport. Fullscreen API denial should
      // not make the workbench unusable.
    }
  }

  const customDrawer = fallbackDrawer.find(
    (drawer) => drawer.id === activeTool,
  );
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
      className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--surface,#f5f5f4)] text-[var(--fg,#292524)]"
    >
      {resizing && (
        <div
          className="fixed inset-0 z-[2147483600] cursor-col-resize bg-transparent"
          aria-hidden="true"
        />
      )}
      <AdvancedWorkbenchHeader
        item={item}
        editorLabel={editorLabel}
        status={visibleEditorStatus}
        actions={editorHeaderActions}
        accent={accent}
        fullscreen={fullscreen}
        mobileActionsOpen={mobileActionsOpen}
        onToggleMobileActions={() =>
          setMobileActionsOpen((value) => !value)
        }
        onToggleFullscreen={() => void toggleFullscreen()}
        onClose={requestClose}
      />

      <AdvancedLayoutContext.Provider value={layoutState}>
      <div className="flex h-12 shrink-0 items-center border-b border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] shadow-[0_1px_0_rgba(0,0,0,.02)]">
        {editorAvailable && editorContextualToolbar ? (
          editorContextualToolbar
        ) : (
          <span className="px-4 text-[12px] font-medium text-[var(--muted,#78716c)]">
            {tt(editorLabel)}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <AdvancedWorkbenchSidebar
          tools={tools}
          activeTool={activeTool}
          panelVisible={panelVisible}
          panelWidth={panelWidth}
          panel={panel}
          accent={accent}
          onChooseTool={chooseTool}
          onClosePanel={() => setPanelVisible(false)}
          onBeginResize={beginResize}
        />

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
      </AdvancedLayoutContext.Provider>
    </div>,
    document.body,
  );
}
