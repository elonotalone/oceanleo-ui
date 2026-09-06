"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
import {
  HiddenUploadInput,
  StageNoticeCorner,
  useEditBarDockPresentation,
  useHistoryControls,
  useLeaveGate,
  usePluginPagesForAdapter,
} from "./inline-advanced-shell-parts";
import { useAdvancedSession } from "./advanced-session-context";
import {
  actionGroup,
  advancedWorkbenchStyle,
  type AdvancedWorkbenchAction,
} from "./advanced-workbench-chrome";
import {
  PluginThemePortalContext,
  pluginThemeIdForAdapter,
  pluginWorkbenchStyle,
  usePluginTheme,
  type PluginThemeId,
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
import { EditBarDocumentSegment } from "./plugin-chrome/EditBarDocumentSegment";
import { editBarVisibleOnPage } from "./plugin-chrome/plugin-pages";
import { usePluginPage } from "./plugin-chrome/plugin-page-store";

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
  const pagePluginId = (pluginThemeId ??
    adapter.id.split("@")[0]) as PluginThemeId;
  const { pageId } = usePluginPage(pagePluginId);
  const pluginPages = usePluginPagesForAdapter(adapter);
  const activePluginPage =
    pluginPages.find((page) => page.id === pageId) ?? pluginPages[0];
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
  const showEditBar =
    !editBarSuppressed && editBarVisibleOnPage(activePluginPage);
  const localDockPresentation = useEditBarDockPresentation({
    rightPaneSlot,
    showEditBar,
    ownerId: ownerIdRef.current,
    mode: floatingToolbar.mode,
    dropActive: floatingToolbar.dropActive,
    accent: effectiveAccent,
    theme: pluginTheme.theme,
  });
  const liveHeaderStoreRef = useRef(createLiveReactNodeStore());
  const liveHeaderNode = useMemo(
    () => <LiveReactNode store={liveHeaderStoreRef.current} />,
    [],
  );
  const closingRef = useRef(false);
  const handledCloseRequestRef = useRef(adapter.closeRequestRevision || 0);
  const dirtyRecordedRef = useRef(false);
  // 隐藏的 <input type=file>：素材库抽屉第一项「从本地上传」与画布拖放共用同一条上传路径。
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const openLocalUpload = useCallback(
    () => uploadInputRef.current?.click(),
    [],
  );
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
    onLocalUpload: openLocalUpload,
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
  const { state: autoSaveState, errorMessage: autoSaveError } = autoSave as {
    state: typeof autoSave.state;
    errorMessage?: string;
  };
  // 编辑栏文档段只收 edit 组（规范 v2 §4）。save 组进第一行保存菜单、download 组进
  // 下载菜单、`adapter.upload` 进素材库抽屉——三者永不混住，这里不再往里塞任何一项。
  const documentActions = useMemo(
    () =>
      (adapter.actions || []).filter(
        (action) =>
          action.group !== "download" &&
          action.group !== "save" &&
          actionGroup(action) === "edit",
      ),
    [adapter.actions],
  );
  const triggerDocumentAction = useCallback(
    (action: AdvancedWorkbenchAction) => {
      if (action.panelId) {
        openDrawer(action.panelId);
        return;
      }
      return action.onTrigger?.();
    },
    [openDrawer],
  );
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
  const historyControls = useHistoryControls(adapter.history);

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
      // 固定柄由 FloatingContextToolbar 的单行容器自己画（controller.canDock），
      // 这里不再透传，否则同一行出现两个固定键。
      contextBarTrailing: undefined,
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
  // 离开确认走异步 ConfirmDialog（useLeaveGate 的注释）：requestClose 里
  // `await confirmLeave()`，用户点哪个按钮就 resolve 成什么。
  const { askingLeave, confirmLeave, answerLeave } = useLeaveGate();

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
      // `/advanced/<featureId>` 与 MaterialCatalog 这类没有 SplitWorkspace 的承载里，
      // 工作区窗格不存在（或没人登记库面板），第一行「素材库」以前点了没反应。
      // 这时退到壳自己的素材抽屉——它的第一项就是「从本地上传」。
      if (workspacePane?.openLibraryPanel(id)) return;
      if (id === "materials") openDrawer("materials");
    },
    [closeDetail, openDrawer, workspacePane],
  );
  const materialsDrawerOpen =
    !transientPanel && activeDrawerId === "materials";
  const activeLibraryPanelId =
    workspacePane?.activeLibraryPanelId ||
    (materialsDrawerOpen ? ("materials" as const) : null);
  const saveNow = useCallback(
    () => void autoSave.flushLatest(),
    [autoSave.flushLatest],
  );
  const actionBar = useMemo(
    () => (
      <InlineAdvancedWorkbenchHeader
        adapter={adapter}
        autoSaveState={autoSaveState}
        autoSaveError={autoSaveError}
        activeDrawerId={layoutState.activeDrawerId}
        activeLibraryPanelId={activeLibraryPanelId}
        drawers={drawers}
        accent={effectiveAccent}
        pluginThemeId={pluginThemeId}
        showLibrary={siteId !== "plugin-gallery"}
        showBack={siteId !== "plugin-gallery"}
        showClose
        onBack={requestClose}
        onOpenDrawer={openDrawer}
        onCloseDrawer={closeDetail}
        onOpenTransientPanel={openTransientPanel}
        onOpenLibrary={openLibraryPanel}
        onRetrySave={() => void autoSave.retry()}
        onSaveNow={saveNow}
        onUploadFiles={(files) => void performUpload(files)}
        onClose={requestClose}
      />
    ),
    [
      activeLibraryPanelId,
      adapter,
      effectiveAccent,
      pluginThemeId,
      autoSave.retry,
      autoSaveError,
      autoSaveState,
      closeDetail,
      drawers,
      layoutState.activeDrawerId,
      openLibraryPanel,
      openDrawer,
      openTransientPanel,
      performUpload,
      requestClose,
      saveNow,
      siteId,
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
      {showEditBar && (
        <FloatingContextToolbar
          controller={floatingToolbar}
          accent={effectiveAccent}
          theme={pluginTheme.theme}
          // 单行容器 `[data-workspace-edit-bar]` 由 FloatingContextToolbar 自己画
          // （signals/X2-interface.md）：撤销重做来自 layout.contextBarLeading，
          // 文档段走 documentSegment，AI 助手与固定柄由容器最右段统一画。
          documentSegment={
            documentActions.length > 0 ? (
              <EditBarDocumentSegment
                actions={documentActions}
                onTrigger={triggerDocumentAction}
              />
            ) : undefined
          }
          emptyHint="在画面里选中元素后，可在此编辑"
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
        <HiddenUploadInput
          inputRef={uploadInputRef}
          upload={adapter.upload}
          onFiles={(files) => void performUpload(files)}
        />
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
              {showEditBar && (
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
              {/* 规范 v2 §1：提示是画布左下角的小胶囊，不是顶部通栏；与右下角缩放控件同高。 */}
              <StageNoticeCorner notices={adapter.notices} />
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
        //
        // `body` 反过来，刻意包一层 `tt()`（W43 A-11 D-4）：`i18n-tt-key-coverage`
        // 的 AST 扫的是 `tt()` 的字面量实参，包了这一层，词典条目哪天被删掉会当场判红；
        // 传裸中文则一条判据都碰不到，16 语一起静默回落成中文。
        // 代价只是内部那次 `tt()` 拿译文查一次词典、查不中原样返回。
        <ConfirmDialog
          title={tt("修改仍安全保留在当前编辑器，但尚未同步到云端。仍要离开吗？")}
          body={tt("改动留在这台设备的编辑器里，换台设备就打不开；回到编辑器可以再同步一次。")}
          confirmLabel="离开"
          onConfirm={() => answerLeave(true)}
          onCancel={() => answerLeave(false)}
        />
      )}
    </AdvancedLayoutContext.Provider>
    </PluginThemePortalContext.Provider>
  );
}
