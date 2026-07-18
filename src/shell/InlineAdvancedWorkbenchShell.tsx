"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import type {
  AdvancedEditorAdapter,
  AdvancedWorkbenchDrawer,
} from "./advanced-editor-adapter";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { AdvancedLayoutContext } from "./advanced-layout-context";
import { AdvancedStageControls } from "./AdvancedStageControls";
import { AdvancedWorkspaceActionBar } from "./AdvancedWorkspaceActionBar";
import { AdvancedWorkbenchStage } from "./AdvancedWorkbenchStage";
import { useAdvancedSession } from "./advanced-session-context";
import { advancedWorkbenchStyle } from "./advanced-workbench-chrome";
import type { LibraryItem } from "./library-data";
import { InlineEditorMaterialPanel } from "./InlineEditorMaterialPanel";
import {
  WORKBENCH_MATERIAL_MIME,
  useWorkbenchMaterials,
  type WorkbenchMaterialAction,
} from "./workbench-material-provider";
import { useRightPaneSlot, useWorkspacePane } from "./SplitWorkspace";
import { useAdvancedAutoSave } from "./use-advanced-autosave";
import { useAdvancedRecovery } from "./use-advanced-recovery";
import {
  clampFloatingToolbar,
  type FloatingToolbarPoint,
} from "./floating-toolbar-geometry";

interface LiveDetailStore {
  node: ReactNode;
  version: number;
  listeners: Set<() => void>;
}

function createLiveDetailStore(): LiveDetailStore {
  return { node: null, version: 0, listeners: new Set() };
}

function LiveEditorDetail({ store }: { store: LiveDetailStore }) {
  useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    () => store.version,
    () => store.version,
  );
  return <>{store.node}</>;
}

export interface InlineAdvancedWorkbenchShellProps {
  item: LibraryItem;
  taskId?: string | null;
  siteId?: string;
  accent?: string;
  adapter: AdvancedEditorAdapter;
  onClose: () => void;
}

/**
 * Editor chrome owned by the normal App library. It deliberately has no
 * Agent/upload/tasks/library rail: those already belong to the App. Drawers
 * temporarily occupy the App pane through WorkspacePaneContext.
 */
export function InlineAdvancedWorkbenchShell({
  item,
  taskId,
  siteId = "",
  accent = "#6d5dfc",
  adapter,
  onClose,
}: InlineAdvancedWorkbenchShellProps) {
  const tt = useUI();
  const workspacePane = useWorkspacePane();
  const rightPaneSlot = useRightPaneSlot();
  const workspaceDetail = workspacePane?.detail;
  const showWorkspaceDetail = workspacePane?.showDetail;
  const clearWorkspaceDetail = workspacePane?.clearDetail;
  const advancedSession = useAdvancedSession();
  const workbenchMaterials = useWorkbenchMaterials();
  const stageRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const ownerIdRef = useRef(
    `inline-editor:${adapter.id}:${item.key || item.id}`,
  );
  const liveDetailStoreRef = useRef<LiveDetailStore>(createLiveDetailStore());
  const liveHeaderStoreRef = useRef<LiveDetailStore>(createLiveDetailStore());
  const liveHeaderNode = useMemo(
    () => <LiveEditorDetail store={liveHeaderStoreRef.current} />,
    [],
  );
  const closingRef = useRef(false);
  const handledCloseRequestRef = useRef(adapter.closeRequestRevision || 0);
  const dirtyRecordedRef = useRef(false);
  const [fallbackDetail, setFallbackDetail] = useState<{
    label: ReactNode;
    content: ReactNode;
  } | null>(null);
  const [activeDrawerId, setActiveDrawerId] = useState("");
  const [transientPanel, setTransientPanel] = useState<{
    id: string;
    label: ReactNode;
    content: ReactNode;
  } | null>(null);
  const [requestedMaterialAction, setRequestedMaterialAction] =
    useState<WorkbenchMaterialAction>();
  const [dropMessage, setDropMessage] = useState("");
  const [toolbarPosition, setToolbarPosition] =
    useState<FloatingToolbarPoint>({ x: 0, y: 0 });
  const [toolbarDragging, setToolbarDragging] = useState(false);
  const toolbarDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: FloatingToolbarPoint;
  } | null>(null);

  const drawers = useMemo<AdvancedWorkbenchDrawer[]>(() => {
    if (adapter.drawers?.length) return [...adapter.drawers];
    if (!adapter.toolbox?.content) return [];
    return [
      {
        id: "editor-global",
        label: adapter.toolbox.label,
        icon: adapter.toolbox.icon,
        content: adapter.toolbox.content,
      },
    ];
  }, [adapter.drawers, adapter.toolbox]);
  const drawerById = useMemo(
    () => new Map(drawers.map((drawer) => [drawer.id, drawer])),
    [drawers],
  );
  const preferredMaterialAction = (
    ["insert", "apply", "replace", "merge"] as const
  ).find((action) => workbenchMaterials?.actions.includes(action));
  const activeMaterialAction =
    requestedMaterialAction &&
    workbenchMaterials?.actions.includes(requestedMaterialAction)
      ? requestedMaterialAction
      : preferredMaterialAction;
  const editorDirty = adapter.persistence?.dirty || false;
  const editRevision = adapter.persistence?.editRevision || 0;
  const autoSave = useAdvancedAutoSave({
    dirty: editorDirty,
    revision: editRevision,
    flush: adapter.persistence?.flush,
    session: advancedSession,
  });
  useAdvancedRecovery({
    editorId: adapter.id,
    revision: editRevision,
    dirty: editorDirty,
    persistenceState: autoSave.state,
    recovery: adapter.persistence?.recovery,
  });

  const ownedDetail =
    workspaceDetail?.ownerId === ownerIdRef.current
      ? workspaceDetail
      : null;
  const panelVisible = Boolean(ownedDetail || fallbackDetail);

  const panelFor = useCallback(
    (drawerId: string, materialAction?: WorkbenchMaterialAction) => {
      const drawer = drawerById.get(drawerId);
      if (drawer) {
        return { label: tt(drawer.label), content: drawer.content };
      }
      return {
        label: tt(drawerId === "materials" ? "素材" : adapter.label),
        content:
          drawerId === "materials" ? (
          <InlineEditorMaterialPanel
            item={item}
            taskId={taskId}
            siteId={siteId}
            accent={accent}
            materials={workbenchMaterials}
            primaryMaterialAction={materialAction || activeMaterialAction}
          />
          ) : null,
      };
    },
    [
      accent,
      activeMaterialAction,
      adapter.label,
      drawerById,
      item,
      siteId,
      taskId,
      tt,
      workbenchMaterials,
    ],
  );
  const liveDetail =
    transientPanel && activeDrawerId === transientPanel.id
      ? transientPanel
      : activeDrawerId
        ? panelFor(activeDrawerId, requestedMaterialAction)
        : null;
  liveDetailStoreRef.current.node = liveDetail?.content || null;
  useLayoutEffect(() => {
    const store = liveDetailStoreRef.current;
    store.version += 1;
    store.listeners.forEach((listener) => listener());
  }, [liveDetail?.content]);

  const openDrawer = useCallback(
    (drawerId: string, materialAction?: WorkbenchMaterialAction) => {
      setTransientPanel(null);
      setActiveDrawerId(drawerId);
      setRequestedMaterialAction(
        drawerId === "materials" ? materialAction : undefined,
      );
      const next = panelFor(drawerId, materialAction);
      if (showWorkspaceDetail) {
        showWorkspaceDetail({
          ownerId: ownerIdRef.current,
          id: drawerId,
          label: next.label,
          content: <LiveEditorDetail store={liveDetailStoreRef.current} />,
        });
      } else {
        setFallbackDetail({
          label: next.label,
          content: <LiveEditorDetail store={liveDetailStoreRef.current} />,
        });
      }
    },
    [panelFor, showWorkspaceDetail],
  );

  const openTransientPanel = useCallback(
    (panelId: string, label: ReactNode, content: ReactNode) => {
      setTransientPanel({ id: panelId, label, content });
      setActiveDrawerId(panelId);
      setRequestedMaterialAction(undefined);
      liveDetailStoreRef.current.node = content;
      if (showWorkspaceDetail) {
        showWorkspaceDetail({
          ownerId: ownerIdRef.current,
          id: panelId,
          label,
          content: <LiveEditorDetail store={liveDetailStoreRef.current} />,
        });
      } else {
        setFallbackDetail({
          label,
          content: <LiveEditorDetail store={liveDetailStoreRef.current} />,
        });
      }
    },
    [showWorkspaceDetail],
  );

  const closeDetail = useCallback(() => {
    clearWorkspaceDetail?.(ownerIdRef.current);
    setFallbackDetail(null);
    setActiveDrawerId("");
    setTransientPanel(null);
    setRequestedMaterialAction(undefined);
  }, [clearWorkspaceDetail]);

  const clampToolbar = useCallback(
    (point: FloatingToolbarPoint) => {
      const container = stageRef.current?.getBoundingClientRect();
      const toolbar = toolbarRef.current?.getBoundingClientRect();
      if (!container || !toolbar) return { x: 0, y: 0 };
      return clampFloatingToolbar(
        point,
        {
          width: container.width,
          height: Math.max(0, container.height - 64),
        },
        { width: toolbar.width, height: toolbar.height },
      );
    },
    [],
  );
  const contextBarLeading = useMemo(
    () => (
      <button
        type="button"
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          event.preventDefault();
          toolbarDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            origin: toolbarPosition,
          };
          setToolbarDragging(true);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = toolbarDragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          setToolbarPosition(
            clampToolbar({
              x: drag.origin.x + event.clientX - drag.startX,
              y: drag.origin.y + event.clientY - drag.startY,
            }),
          );
        }}
        onPointerUp={(event) => {
          if (toolbarDragRef.current?.pointerId !== event.pointerId) return;
          toolbarDragRef.current = null;
          setToolbarDragging(false);
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }}
        onPointerCancel={() => {
          toolbarDragRef.current = null;
          setToolbarDragging(false);
        }}
        onDoubleClick={() => setToolbarPosition({ x: 0, y: 0 })}
        className={`grid h-9 w-6 shrink-0 touch-none select-none place-items-center rounded-lg text-[13px] text-[var(--awb-muted)] transition hover:bg-[var(--awb-hover)] ${
          toolbarDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        aria-label={tt("拖动编辑栏")}
        title={tt("拖动编辑栏；双击复位")}
      >
        ⠿
      </button>
    ),
    [clampToolbar, toolbarDragging, toolbarPosition, tt],
  );
  const layoutState = useMemo(
    () => ({
      hostPanelVisible: panelVisible,
      editorToolActive: panelVisible,
      activeDrawerId: showWorkspaceDetail
        ? ownedDetail?.id || ""
        : fallbackDetail
          ? activeDrawerId
          : "",
      contextBarLeading,
      openDrawer,
      openTransientPanel,
      closeDrawer: closeDetail,
    }),
    [
      activeDrawerId,
      contextBarLeading,
      fallbackDetail,
      closeDetail,
      openDrawer,
      openTransientPanel,
      ownedDetail?.id,
      panelVisible,
      showWorkspaceDetail,
    ],
  );
  const contextToolbar = adapter.renderContextToolbar
    ? adapter.renderContextToolbar(layoutState)
    : adapter.contextToolbar;

  useLayoutEffect(() => {
    const update = () =>
      setToolbarPosition((current) => clampToolbar(current));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    if (stageRef.current) observer.observe(stageRef.current);
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    return () => observer.disconnect();
  }, [adapter.id, clampToolbar]);

  useEffect(() => {
    setToolbarPosition({ x: 0, y: 0 });
    toolbarDragRef.current = null;
    setToolbarDragging(false);
  }, [adapter.id, item.key]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    void (async () => {
      if (editorDirty || autoSave.state !== "saved") {
        const flushed =
          autoSave.state === "error"
            ? { ok: false as const, error: "自动保存仍未同步" }
            : await Promise.race([
                autoSave.flushLatest(),
                new Promise<{ ok: false; error: string }>((resolve) =>
                  window.setTimeout(
                    () =>
                      resolve({
                        ok: false,
                        error: "离开前保存等待超时",
                      }),
                    3_000,
                  ),
                ),
              ]);
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
      closeDetail();
      onClose();
      closingRef.current = false;
    })();
  }, [
    autoSave.flushLatest,
    autoSave.state,
    closeDetail,
    editorDirty,
    onClose,
    tt,
  ]);

  useEffect(() => {
    const revision = adapter.closeRequestRevision || 0;
    if (revision <= handledCloseRequestRef.current) return;
    handledCloseRequestRef.current = revision;
    requestClose();
  }, [adapter.closeRequestRevision, requestClose]);

  useEffect(
    () => () => clearWorkspaceDetail?.(ownerIdRef.current),
    [clearWorkspaceDetail],
  );

  useEffect(() => {
    if (!editorDirty) {
      dirtyRecordedRef.current = false;
      return;
    }
    if (!advancedSession || dirtyRecordedRef.current) return;
    dirtyRecordedRef.current = true;
    void advancedSession.ensure().then((session) => {
      if (!session) dirtyRecordedRef.current = false;
    });
  }, [advancedSession, editorDirty]);

  useEffect(() => {
    if (!advancedSession) return;
    advancedSession.registerFlush(autoSave.flushLatest);
    return () => advancedSession.registerFlush(null);
  }, [advancedSession, autoSave.flushLatest]);

  useEffect(() => {
    if (!editorDirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [editorDirty]);

  const performUpload = useCallback(
    async (files: File[]) => {
      if (!adapter.upload || files.length === 0) return;
      setDropMessage(tt("正在上传并添加到画布…"));
      try {
        await adapter.upload.onFiles(
          adapter.upload.multiple ? files : files.slice(0, 1),
        );
        setDropMessage(tt("文件已添加到画布"));
      } catch (error) {
        setDropMessage(
          error instanceof Error ? error.message : tt("上传失败，请重试"),
        );
      }
      window.setTimeout(() => setDropMessage(""), 1800);
    },
    [adapter.upload, tt],
  );

  const handleDrop = useCallback(
    async (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length && adapter.upload) {
        await performUpload(files);
        return;
      }
      if (!activeMaterialAction || !workbenchMaterials) return;
      let material = workbenchMaterials.draggedItem;
      if (!material) {
        try {
          const payload = JSON.parse(
            event.dataTransfer.getData(WORKBENCH_MATERIAL_MIME) || "{}",
          ) as { id?: string };
          material =
            workbenchMaterials.entries.find(
              (entry) =>
                entry.id === payload.id ||
                entry.libraryItem?.key === payload.id ||
                entry.libraryItem?.url === payload.id,
            )?.libraryItem || null;
        } catch {
          material = null;
        }
      }
      if (!material) {
        setDropMessage(tt("无法读取这个素材，请从素材库重新拖入"));
        window.setTimeout(() => setDropMessage(""), 1800);
        return;
      }
      setDropMessage(tt("正在添加素材…"));
      const result = await workbenchMaterials
        .perform(activeMaterialAction, material, {
          source: "drop",
          clientX: event.clientX,
          clientY: event.clientY,
        })
        .finally(workbenchMaterials.endMaterialDrag);
      setDropMessage(
        result.ok ? tt("素材已添加到画布") : result.error || tt("素材添加失败"),
      );
      window.setTimeout(() => setDropMessage(""), 1800);
    },
    [
      activeMaterialAction,
      adapter.upload,
      performUpload,
      tt,
      workbenchMaterials,
    ],
  );

  const actions = adapter.actions || [];
  const triggerAction = (action: (typeof actions)[number]) => {
    if (action.panelId) {
      openDrawer(action.panelId);
      return;
    }
    return action.onTrigger?.();
  };
  const toolsPanel = (
    <div className="h-full overflow-y-auto p-3">
      <p className="mb-3 text-[12px] font-semibold text-[var(--fg,#292524)]">
        {tt("编辑工具")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {drawers.map((drawer) => (
          <button
            key={drawer.id}
            type="button"
            onClick={() => openDrawer(drawer.id)}
            className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--fg-2,#57534e)] transition hover:border-[var(--awb-accent)]/35 hover:bg-[var(--surface-hover,#fafaf9)]"
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
              style={{ color: accent, background: `${accent}12` }}
            >
              <AdvancedEditorIcon name={drawer.icon} className="h-4 w-4" />
            </span>
            {tt(drawer.label)}
          </button>
        ))}
      </div>
    </div>
  );
  const openTools = () => {
    if (layoutState.activeDrawerId === "workspace-tools") {
      closeDetail();
      return;
    }
    openTransientPanel("workspace-tools", tt("编辑工具"), toolsPanel);
  };
  const openLibraryPanel = (
    id: "materials" | "mine",
  ) => {
    closeDetail();
    workspacePane?.openLibraryPanel(id);
  };
  const actionBar = (
    <AdvancedWorkspaceActionBar
      adapter={adapter}
      autoSaveState={autoSave.state}
      activeDrawerId={layoutState.activeDrawerId}
      activeLibraryPanelId={workspacePane?.activeLibraryPanelId || null}
      onBack={requestClose}
      onOpenTools={openTools}
      onOpenLibrary={openLibraryPanel}
      onRetrySave={() => void autoSave.retry()}
      onTriggerAction={triggerAction}
      onUploadFiles={(files) => void performUpload(files)}
    />
  );
  liveHeaderStoreRef.current.node = actionBar;
  useLayoutEffect(() => {
    const store = liveHeaderStoreRef.current;
    store.version += 1;
    store.listeners.forEach((listener) => listener());
  });
  useLayoutEffect(() => {
    if (!rightPaneSlot) return;
    rightPaneSlot.setRightFrameless(false);
    rightPaneSlot.setRightEditorHeader(true);
    rightPaneSlot.setRightLabel(liveHeaderNode);
    return () => {
      rightPaneSlot.clearRightLabel(liveHeaderNode);
      rightPaneSlot.setRightEditorHeader(false);
      rightPaneSlot.setRightFrameless(false);
    };
  }, [liveHeaderNode, rightPaneSlot]);

  const editorViewport = adapter.nativeChrome?.viewport
    ? undefined
    : adapter.viewport;
  const editorAvailable = adapter.available !== false;
  const draggedTitle =
    activeMaterialAction && workbenchMaterials?.draggedItem
      ? workbenchMaterials.draggedItem.title
      : undefined;

  return (
    <AdvancedLayoutContext.Provider value={layoutState}>
      <div
        data-inline-editor
        data-editor-adapter={adapter.id}
        className="flex h-full min-h-0 min-w-0 overflow-hidden bg-[var(--awb-stage-bg)] text-[var(--awb-text)]"
        style={advancedWorkbenchStyle(accent)}
      >
        {fallbackDetail && (
          <aside className="flex w-80 shrink-0 flex-col border-r border-[var(--awb-border)] bg-[var(--awb-chrome-bg)]">
            <div className="flex h-11 items-center gap-2 border-b border-[var(--awb-border)] px-3">
              <button type="button" onClick={closeDetail} aria-label={tt("关闭详情")}>
                ←
              </button>
              <span className="truncate text-[12px] font-semibold">
                {fallbackDetail.label}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {fallbackDetail.content}
            </div>
          </aside>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!rightPaneSlot && (
            <div className="shrink-0 border-b border-[var(--awb-border)] px-2 py-1">
              {actionBar}
            </div>
          )}
          <div
            ref={stageRef}
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
          >
          {contextToolbar && (
            <div
              data-advanced-context-row
              ref={toolbarRef}
              className="absolute left-2 z-[70] flex max-w-[calc(100%-1rem)] min-w-0 will-change-transform"
              style={{
                top: 8,
                transform: `translate3d(${toolbarPosition.x}px, ${toolbarPosition.y}px, 0)`,
              }}
            >
              {contextToolbar}
            </div>
          )}
          <div
            data-advanced-viewport-row
            className="relative h-full min-h-0 min-w-0 overflow-hidden"
          >
            <AdvancedWorkbenchStage
              editorAvailable={editorAvailable}
              editorStage={adapter.stage}
              item={item}
              accent={accent}
              draggedTitle={draggedTitle}
              acceptLocalFiles={Boolean(adapter.upload)}
              dropMessage={dropMessage}
              onMaterialDrop={(event) => void handleDrop(event)}
            />
            <div className="absolute bottom-3 right-3 z-[75]">
              <AdvancedStageControls
                fullscreenRef={workspacePane?.fullscreenRef || stageRef}
                viewport={editorViewport}
                accent={accent}
              />
            </div>
          </div>
        </div>
        </div>
      </div>
    </AdvancedLayoutContext.Provider>
  );
}
