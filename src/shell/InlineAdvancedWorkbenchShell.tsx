"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import { ConfirmDialog } from "../ui";
import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { AdvancedLayoutContext } from "./advanced-layout-context";
import { AdvancedStageControls } from "./AdvancedStageControls";
import { AdvancedWorkbenchStage } from "./AdvancedWorkbenchStage";
import {
  FloatingContextToolbar,
  useFloatingContextToolbar,
} from "./FloatingContextToolbar";
import { EditBarDockHost } from "./EditBarDockHost";
import { InlineAdvancedWorkbenchHeader } from "./InlineAdvancedWorkbenchHeader";
import { flushAdvancedWorkBeforeLeave } from "./advanced-leave-flush";
import { useInlineAdvancedWorkbenchDrop } from "./inline-advanced-workbench-drop";
import { useInlineAdvancedPanels } from "./use-inline-advanced-panels";
import { EditBarHistoryControls } from "./EditBarDockControls";
import { useAdvancedSession } from "./advanced-session-context";
import { advancedWorkbenchStyle } from "./advanced-workbench-chrome";
import {
  PluginThemePortalContext,
  pluginThemeIdForAdapter,
  pluginWorkbenchStyle,
  usePluginTheme,
} from "./plugin-theme";
import type { LibraryItem } from "./library-data";
import { useWorkbenchMaterials } from "./workbench-material-provider";
import { useRightPaneSlot, useWorkspacePane } from "./SplitWorkspace";
import { editBarOwnershipForItem } from "./workbench-routes";
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
  // 插件内主题（10 件高级编辑器）：与站点 html.dark 完全解耦。非 10 件的
  // adapter（website / design-canvas / video-canvas）pluginThemeId 为 null，
  // 保持原站点主题别名路径不变。
  const pluginThemeId = pluginThemeIdForAdapter(adapter.id);
  const pluginTheme = usePluginTheme(pluginThemeId);
  const effectiveAccent = pluginTheme.accent ?? accent;
  const workspacePane = useWorkspacePane();
  const rightPaneSlot = useRightPaneSlot();
  const workspaceDetail = workspacePane?.detail;
  const showWorkspaceDetail = workspacePane?.showDetail;
  const clearWorkspaceDetail = workspacePane?.clearDetail;
  const advancedSession = useAdvancedSession();
  const workbenchMaterials = useWorkbenchMaterials();
  const stageRef = useRef<HTMLDivElement>(null);
  const localEditBarLayerRef = useRef<HTMLDivElement>(null);
  // MaterialCatalog / MaterialLibrary / MyLibrary embed this shell without
  // SplitWorkspace. Keep a local dock host under the action row so pin /
  // undock / redock still expose data-workspace-edit-bar-dock on those
  // production surfaces.
  const localEditBarDockRef = useRef<HTMLDivElement>(null);
  const editBarLayerRef =
    rightPaneSlot?.editBarLayerRef ?? localEditBarLayerRef;
  const editBarDockRef =
    rightPaneSlot?.editBarDockRef ?? localEditBarDockRef;
  const floatingToolbar = useFloatingContextToolbar({
    workspaceRootRef: editBarLayerRef,
    stageRef,
    dockRootRef: editBarDockRef,
    resetKey: `${adapter.id}:${item.key || item.id}`,
  });
  const ownerIdRef = useRef(
    `inline-editor:${adapter.id}:${item.key || item.id}`,
  );
  /**
   * 编辑栏是用来编辑一件素材的。非编辑类插件没有素材输入、自身即体验
   * （`_COMMON.md` §3.2），所以地图、地球仪、台账这些打开之后上方**没有编辑栏**
   * ——不渲染那条栏，也不占那条停靠带。判据在 `editBarOwnershipForItem()`：它按
   * 挂的是插件实例还是素材来判，不按适配器判（`grid` 两种身份共用一个适配器）。
   */
  const editBarSuppressed = editBarOwnershipForItem(item) === "none";
  const localDockPresentation = useMemo(
    () =>
      rightPaneSlot || editBarSuppressed
        ? null
        : {
            ownerId: ownerIdRef.current,
            mode: floatingToolbar.mode,
            dropActive: floatingToolbar.dropActive,
            accent: effectiveAccent,
            theme: pluginTheme.theme,
          },
    [
      effectiveAccent,
      editBarSuppressed,
      floatingToolbar.dropActive,
      floatingToolbar.mode,
      pluginTheme.theme,
      rightPaneSlot,
    ],
  );
  const liveHeaderStoreRef = useRef(createLiveReactNodeStore());
  const liveHeaderNode = useMemo(
    () => <LiveReactNode store={liveHeaderStoreRef.current} />,
    [],
  );
  const closingRef = useRef(false);
  const handledCloseRequestRef = useRef(adapter.closeRequestRevision || 0);
  const dirtyRecordedRef = useRef(false);
  const {
    drawers,
    activeDrawerId,
    activeMaterialAction,
    transientPanel,
    fallbackDetail,
    openDrawer,
    openTransientPanel,
    updateTransientPanel,
    closeDetail,
  } = useInlineAdvancedPanels({
    adapter,
    item,
    taskId,
    siteId,
    accent: effectiveAccent,
    ownerId: ownerIdRef.current,
    pluginThemeId,
    workbenchMaterials,
    showWorkspaceDetail,
    clearWorkspaceDetail,
  });

  const editorDirty = adapter.persistence?.dirty || false;
  const editRevision = adapter.persistence?.editRevision || 0;
  const hostAutoSaveEnabled = adapter.persistence?.autoSave !== false;
  const autoSave = useAdvancedAutoSave({
    // Website keeps dirty for close guards but disables observe-autosave so a
    // pending visual draft is not save→auto-Applied out from under Apply.
    dirty: hostAutoSaveEnabled ? editorDirty : false,
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
  // Drop placement contract (implemented in useInlineAdvancedWorkbenchDrop):
  // source: "drop", clientX: event.clientX, clientY: event.clientY
  const { dropMessage, performUpload, handleDrop } =
    useInlineAdvancedWorkbenchDrop({
      adapter,
      activeMaterialAction,
      workbenchMaterials,
      tt,
    });

  const ownedDetail =
    workspaceDetail?.ownerId === ownerIdRef.current ? workspaceDetail : null;
  const panelVisible = Boolean(ownedDetail || fallbackDetail);

  // 撤销/重做从顶栏搬到编辑栏最左段（见 EditBarHistoryControls 的注释）。
  const history = adapter.history;
  const historyControls = useMemo(
    () =>
      history ? (
        <EditBarHistoryControls
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
        />
      ) : null,
    [history],
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
      activeTransientPanelId:
        transientPanel &&
        (showWorkspaceDetail
          ? ownedDetail?.id === transientPanel.id
          : Boolean(fallbackDetail))
          ? transientPanel.id
          : "",
      contextBarLeading: historyControls ? (
        <>
          {historyControls}
          {floatingToolbar.leading}
        </>
      ) : (
        floatingToolbar.leading
      ),
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
      historyControls,
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
  // 离开确认。原生 window.confirm 冻住主线程、样式不可控、移动端尤其糟，
  // 换成 ConfirmDialog 后它是异步的；用一道 promise 门把下面那段命令式流程接回来：
  // requestClose 里 `await confirmLeave()`，用户点哪个按钮就 resolve 成什么。
  const leaveResolveRef = useRef<((leave: boolean) => void) | null>(null);
  const [askingLeave, setAskingLeave] = useState(false);
  const confirmLeave = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        leaveResolveRef.current = resolve;
        setAskingLeave(true);
      }),
    [],
  );
  const answerLeave = useCallback((leave: boolean) => {
    const resolve = leaveResolveRef.current;
    leaveResolveRef.current = null;
    setAskingLeave(false);
    resolve?.(leave);
  }, []);
  // 卸载时把门放掉，否则 requestClose 里那个 await 会永远挂着。
  useEffect(() => () => answerLeave(false), [answerLeave]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    void (async () => {
      if (editorDirty || autoSave.state !== "saved") {
        const flushed = await flushAdvancedWorkBeforeLeave(autoSave);
        if (!flushed.ok && !(await confirmLeave())) {
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
    confirmLeave,
    editorDirty,
    onClose,
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
        accent={effectiveAccent}
        pluginThemeId={pluginThemeId}
        showLibrary={siteId !== "plugin-gallery"}
        showBack={siteId !== "plugin-gallery"}
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
      effectiveAccent,
      pluginThemeId,
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
      siteId,
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
    if (!rightPaneSlot || editBarSuppressed) return;
    rightPaneSlot.setEditBarDockPresentation({
      ownerId: ownerIdRef.current,
      mode: floatingToolbar.mode,
      dropActive: floatingToolbar.dropActive,
      accent: effectiveAccent,
      theme: pluginTheme.theme,
    });
    return () =>
      rightPaneSlot.clearEditBarDockPresentation(ownerIdRef.current);
  }, [
    effectiveAccent,
    editBarSuppressed,
    floatingToolbar.dropActive,
    floatingToolbar.mode,
    pluginTheme.theme,
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
    <PluginThemePortalContext.Provider value={pluginThemeId}>
    <AdvancedLayoutContext.Provider value={layoutState}>
      {!editBarSuppressed && (
        <FloatingContextToolbar
          controller={floatingToolbar}
          accent={effectiveAccent}
          theme={pluginTheme.theme}
        >
          {contextToolbar}
        </FloatingContextToolbar>
      )}
      <div
        data-inline-editor
        data-editor-adapter={adapter.id}
        data-plugin-theme={pluginTheme.theme || undefined}
        className="flex h-full min-h-0 min-w-0 overflow-hidden bg-[var(--awb-stage-bg)] text-[var(--awb-text)]"
        style={
          pluginTheme.theme
            ? pluginWorkbenchStyle(pluginTheme.theme, effectiveAccent)
            : advancedWorkbenchStyle(accent)
        }
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
                className="grid h-8 w-8 place-items-center rounded-lg outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-[var(--awb-hover)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/35"
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
        <div
          ref={localEditBarLayerRef}
          data-edit-bar-layer-root={!rightPaneSlot || undefined}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          {!rightPaneSlot && (
            <>
              {/* Project/View actions stay first; the dock is then immediately
                  adjacent to the displayed website/editor stage. */}
              <div className="shrink-0 border-b border-[var(--awb-border)] px-2 py-1">
                {actionBar}
              </div>
              {!editBarSuppressed && (
                <EditBarDockHost
                  hostRef={localEditBarDockRef}
                  presentation={localDockPresentation}
                />
              )}
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
                accent={effectiveAccent}
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
                  accent={effectiveAccent}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      {askingLeave && (
        // 文案逐字沿用原生弹窗那一句（已有 16 语覆盖）：它已经说清了后果——
        // 改动留在编辑器里、只是没同步到云端，所以这一步不是 danger。
        //
        // 确认键从通用的「确认」换成「离开」（`W05-request.md` 的 A-11 D-1）：
        // 16 语译文在 `src/i18n/ui/messages/workbench-office-copy.ts`。
        // 传中文原文而不是 `tt("离开")`——`ConfirmDialog` 内部对 `confirmLabel`
        // 自己过一次 `tt()`，外面再包一层就成了拿译文去查词典。
        <ConfirmDialog
          title={tt("修改仍安全保留在当前编辑器，但尚未同步到云端。仍要离开吗？")}
          confirmLabel="离开"
          onConfirm={() => answerLeave(true)}
          onCancel={() => answerLeave(false)}
        />
      )}
    </AdvancedLayoutContext.Provider>
    </PluginThemePortalContext.Provider>
  );
}
