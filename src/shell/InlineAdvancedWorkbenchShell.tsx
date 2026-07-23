"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import type { AdvancedEditorAdapter, AdvancedWorkbenchDrawer } from "./advanced-editor-adapter";
import { AdvancedLayoutContext } from "./advanced-layout-context";
import { AdvancedStageControls } from "./AdvancedStageControls";
import { AdvancedWorkbenchStage } from "./AdvancedWorkbenchStage";
import {
  FloatingContextToolbar,
  useFloatingContextToolbar,
} from "./FloatingContextToolbar";
import { EditBarDockHost } from "./EditBarDockHost";
import { InlineAdvancedWorkbenchHeader } from "./InlineAdvancedWorkbenchHeader";
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
  createLiveReactNodeStore,
  LiveReactNode,
  publishLiveReactNode,
} from "./live-react-node";

export interface InlineAdvancedWorkbenchShellProps {
  item: LibraryItem;
  taskId?: string | null;
  siteId?: string;
  accent?: string;
  adapter: AdvancedEditorAdapter;
  onClose: () => void;
}

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
  // MaterialCatalog / MaterialLibrary / MyLibrary embed this shell without
  // SplitWorkspace. Keep a local dock host under the action row so pin /
  // undock / redock still expose data-workspace-edit-bar-dock on those
  // production surfaces.
  const localEditBarDockRef = useRef<HTMLDivElement>(null);
  const editBarDockRef =
    rightPaneSlot?.editBarDockRef ?? localEditBarDockRef;
  const floatingToolbar = useFloatingContextToolbar({
    workspaceRootRef: workspacePane?.fullscreenRef,
    stageRef,
    dockRootRef: editBarDockRef,
    resetKey: `${adapter.id}:${item.key || item.id}`,
  });
  const ownerIdRef = useRef(
    `inline-editor:${adapter.id}:${item.key || item.id}`,
  );
  const localDockPresentation = useMemo(
    () =>
      rightPaneSlot
        ? null
        : {
            ownerId: ownerIdRef.current,
            mode: floatingToolbar.mode,
            dropActive: floatingToolbar.dropActive,
            accent,
          },
    [
      accent,
      floatingToolbar.dropActive,
      floatingToolbar.mode,
      rightPaneSlot,
    ],
  );
  const liveDetailStoreRef = useRef(createLiveReactNodeStore());
  const liveHeaderStoreRef = useRef(createLiveReactNodeStore());
  const liveHeaderNode = useMemo(
    () => <LiveReactNode store={liveHeaderStoreRef.current} />,
    [],
  );
  const closingRef = useRef(false);
  const handledCloseRequestRef = useRef(adapter.closeRequestRevision || 0);
  const dirtyRecordedRef = useRef(false);
  const [fallbackDetail, setFallbackDetail] = useState<{
    label: ReactNode; content: ReactNode;
  } | null>(null);
  const [activeDrawerId, setActiveDrawerId] = useState("");
  const [transientPanel, setTransientPanel] = useState<{
    id: string;
    label: ReactNode;
  } | null>(null);
  const transientPanelRef = useRef(transientPanel);
  transientPanelRef.current = transientPanel;
  const [requestedMaterialAction, setRequestedMaterialAction] =
    useState<WorkbenchMaterialAction>();
  const [dropMessage, setDropMessage] = useState("");

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
  const liveDrawerDetail = useMemo(
    () =>
      !transientPanel && activeDrawerId
        ? panelFor(activeDrawerId, requestedMaterialAction)
        : null,
    [
      activeDrawerId,
      panelFor,
      requestedMaterialAction,
      transientPanel,
    ],
  );
  useLayoutEffect(() => {
    if (transientPanel) return;
    publishLiveReactNode(
      liveDetailStoreRef.current,
      liveDrawerDetail?.content || null,
    );
  }, [liveDrawerDetail?.content, transientPanel]);

  const openDrawer = useCallback(
    (drawerId: string, materialAction?: WorkbenchMaterialAction) => {
      transientPanelRef.current = null;
      setTransientPanel(null);
      setActiveDrawerId(drawerId);
      setRequestedMaterialAction(
        drawerId === "materials" ? materialAction : undefined,
      );
      const next = panelFor(drawerId, materialAction);
      publishLiveReactNode(liveDetailStoreRef.current, next.content);
      if (showWorkspaceDetail) {
        showWorkspaceDetail({
          ownerId: ownerIdRef.current,
          id: drawerId,
          label: next.label,
          content: <LiveReactNode store={liveDetailStoreRef.current} />,
        });
      } else {
        setFallbackDetail({
          label: next.label,
          content: <LiveReactNode store={liveDetailStoreRef.current} />,
        });
      }
    },
    [panelFor, showWorkspaceDetail],
  );

  const openTransientPanel = useCallback(
    (panelId: string, label: ReactNode, content: ReactNode) => {
      const panel = { id: panelId, label };
      transientPanelRef.current = panel;
      setTransientPanel(panel);
      setActiveDrawerId(panelId);
      setRequestedMaterialAction(undefined);
      publishLiveReactNode(liveDetailStoreRef.current, content);
      if (showWorkspaceDetail) {
        showWorkspaceDetail({
          ownerId: ownerIdRef.current,
          id: panelId,
          label,
          content: <LiveReactNode store={liveDetailStoreRef.current} />,
        });
      } else {
        setFallbackDetail({
          label,
          content: <LiveReactNode store={liveDetailStoreRef.current} />,
        });
      }
    },
    [showWorkspaceDetail],
  );
  const updateTransientPanel = useCallback(
    (panelId: string, content: ReactNode) => {
      if (transientPanelRef.current?.id !== panelId) return;
      publishLiveReactNode(liveDetailStoreRef.current, content);
    },
    [],
  );

  const closeDetail = useCallback(() => {
    clearWorkspaceDetail?.(ownerIdRef.current);
    setFallbackDetail(null);
    setActiveDrawerId("");
    transientPanelRef.current = null;
    setTransientPanel(null);
    setRequestedMaterialAction(undefined);
    publishLiveReactNode(liveDetailStoreRef.current, null);
  }, [clearWorkspaceDetail]);

  const layoutState = useMemo(
    () => ({
      hostPanelVisible: panelVisible,
      editorToolActive: panelVisible,
      activeDrawerId: showWorkspaceDetail
        ? ownedDetail?.id || ""
        : fallbackDetail
          ? activeDrawerId
          : "",
      activeTransientPanelId:
        transientPanel &&
        (showWorkspaceDetail
          ? ownedDetail?.id === transientPanel.id
          : Boolean(fallbackDetail))
          ? transientPanel.id
          : "",
      contextBarLeading: floatingToolbar.leading,
      contextBarTrailing: floatingToolbar.trailing,
      openDrawer,
      openTransientPanel,
      updateTransientPanel,
      closeDrawer: closeDetail,
    }),
    [
      activeDrawerId,
      floatingToolbar.leading,
      floatingToolbar.trailing,
      fallbackDetail,
      closeDetail,
      openDrawer,
      openTransientPanel,
      updateTransientPanel,
      ownedDetail?.id,
      panelVisible,
      showWorkspaceDetail,
      transientPanel?.id,
    ],
  );
  const contextToolbar = adapter.renderContextToolbar
    ? adapter.renderContextToolbar(layoutState)
    : adapter.contextToolbar;
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

  const openLibraryPanel = useCallback(
    (id: "materials" | "mine") => {
      closeDetail();
      workspacePane?.openLibraryPanel(id);
    },
    [closeDetail, workspacePane],
  );
  const actionBar = useMemo(
    () => (
      <InlineAdvancedWorkbenchHeader
        adapter={adapter}
        autoSaveState={autoSave.state}
        activeDrawerId={layoutState.activeDrawerId}
        activeLibraryPanelId={workspacePane?.activeLibraryPanelId || null}
        drawers={drawers}
        accent={accent}
        onBack={requestClose}
        onOpenDrawer={openDrawer}
        onCloseDrawer={closeDetail}
        onOpenTransientPanel={openTransientPanel}
        onOpenLibrary={openLibraryPanel}
        onRetrySave={() => void autoSave.retry()}
        onUploadFiles={(files) => void performUpload(files)}
      />
    ),
    [
      adapter,
      accent,
      autoSave.retry,
      autoSave.state,
      closeDetail,
      drawers,
      layoutState.activeDrawerId,
      openLibraryPanel,
      openDrawer,
      openTransientPanel,
      performUpload,
      requestClose,
      workspacePane?.activeLibraryPanelId,
    ],
  );
  useLayoutEffect(() => {
    publishLiveReactNode(liveHeaderStoreRef.current, actionBar);
  }, [actionBar]);
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
  useLayoutEffect(() => {
    if (!rightPaneSlot) return;
    rightPaneSlot.setEditBarDockPresentation({
      ownerId: ownerIdRef.current,
      mode: floatingToolbar.mode,
      dropActive: floatingToolbar.dropActive,
      accent,
    });
    return () =>
      rightPaneSlot.clearEditBarDockPresentation(ownerIdRef.current);
  }, [
    accent,
    floatingToolbar.dropActive,
    floatingToolbar.mode,
    rightPaneSlot,
  ]);

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
      <FloatingContextToolbar controller={floatingToolbar} accent={accent}>
        {contextToolbar}
      </FloatingContextToolbar>
      <div
        data-inline-editor
        data-editor-adapter={adapter.id}
        className="flex h-full min-h-0 min-w-0 overflow-hidden bg-[var(--awb-stage-bg)] text-[var(--awb-text)]"
        style={advancedWorkbenchStyle(accent)}
      >
        {fallbackDetail && (
          <aside
            data-workspace-pane="left"
            data-left-panel="tool-detail"
            className="flex w-80 shrink-0 flex-col border-r border-[var(--awb-border)] bg-[var(--awb-chrome-bg)]"
          >
            <div className="flex h-11 items-center gap-2 border-b border-[var(--awb-border)] px-3">
              <button
                type="button"
                onClick={closeDetail}
                aria-label={tt("关闭详情")}
                className="grid h-8 w-8 place-items-center rounded-lg outline-none transition hover:bg-[var(--awb-hover)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/35"
              >
                ←
              </button>
              <span className="truncate text-[12px] font-semibold">
                {fallbackDetail.label}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {fallbackDetail.content}
            </div>
          </aside>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!rightPaneSlot && (
            <>
              <div className="shrink-0 border-b border-[var(--awb-border)] px-2 py-1">
                {actionBar}
              </div>
              <EditBarDockHost
                hostRef={localEditBarDockRef}
                presentation={localDockPresentation}
              />
            </>
          )}
          <div
            ref={stageRef}
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
          >
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
              <div
                className="absolute bottom-3 right-3"
                style={{ zIndex: 2_147_483_010 }}
              >
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
