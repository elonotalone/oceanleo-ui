"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../i18n/ui/useUI";
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
import {
  hasPendingOrFailed,
  subscribe as subscribeBackgroundSaves,
} from "./advanced-background-saver";
import { useInlineWorkbenchLeave } from "./use-inline-workbench-leave";
import { useInlineAdvancedWorkbenchDrop } from "./inline-advanced-workbench-drop";
import { useInlineAdvancedPanels } from "./use-inline-advanced-panels";
import { useInlineLibraryPanels } from "./use-inline-library-panels";
import {
  FallbackDetailAside,
  HiddenUploadInput,
  SelectionPresenceProbe,
  StageNoticeCorner,
  useEditBarDockPresentation,
  usePluginPagesForAdapter,
} from "./inline-advanced-shell-parts";
import { useAdvancedSession } from "./advanced-session-context";
import { advancedRootItemId } from "./advanced-session";
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
    resetKey: `${adapter.id}:${advancedRootItemId(item)}`,
  });
  const instanceId = useId();
  const ownerIdRef = useRef(`inline-editor:${instanceId}`);
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
  const [headerHost, setHeaderHost] = useState<HTMLDivElement | null>(null);
  // Only the DOM target belongs to SplitWorkspace. The header stays in this
  // React tree so its reported page and the editor commit together. Publishing
  // a ReactNode from a layout effect let the old header effect write the old
  // page back to the store while the editor was already reporting the new one.
  const headerSlotNode = useMemo(
    () => <div ref={setHeaderHost} className="w-full min-w-0" />,
    [],
  );
  const dirtyRecordedRef = useRef(false);
  // 隐藏的 <input type=file>：素材库抽屉第一项「从本地上传」与画布拖放共用同一条上传路径。
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const openLocalUpload = useCallback(
    () => uploadInputRef.current?.click(),
    [],
  );
  const ownedWorkspaceDetailId =
    workspaceDetail?.ownerId === ownerIdRef.current ? workspaceDetail.id : null;
  const panels = useInlineAdvancedPanels({
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
    workspaceLeftHidden: workspacePane?.leftHidden === true,
    ownedWorkspaceDetailId,
    onLocalUpload: openLocalUpload,
  });
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
    closeDrawer,
  } = panels;
  const [selectionPresent, setSelectionPresent] = useState(false);

  const editorDirty = adapter.persistence?.dirty || false;
  const editRevision = adapter.persistence?.editRevision || 0;
  const hostAutoSaveEnabled = adapter.persistence?.autoSave !== false;
  const materialKey =
    adapter.persistence?.userEditKey || advancedRootItemId(item) || item.id;
  const autoSave = useAdvancedAutoSave({
    // Website keeps dirty for close guards but disables observe-autosave so a
    // pending visual draft is not save→auto-Applied out from under Apply.
    key: materialKey,
    dirty: hostAutoSaveEnabled ? editorDirty : false,
    revision: editRevision,
    flush: adapter.persistence?.flush,
    draft: hostAutoSaveEnabled ? adapter.persistence?.draft : undefined,
    recovery: hostAutoSaveEnabled ? adapter.persistence?.recovery : undefined,
    item,
    editorId: adapter.id,
    session: advancedSession,
  });
  const backgroundBusy = useSyncExternalStore(
    subscribeBackgroundSaves,
    hasPendingOrFailed,
    () => false,
  );
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

  const layoutState = useMemo(
    () => ({
      hostPanelVisible: panelVisible,
      editorToolActive: panelVisible,
      activeDrawerId: showWorkspaceDetail
        ? ownedDetail?.id || activeDrawerId
        : activeDrawerId,
      activeTransientPanelId:
        transientPanel && panels.isPanelOpen(transientPanel.id)
          ? transientPanel.id
          : "",
      contextBarLeading: floatingToolbar.leading,
      // trailing 控件由 FloatingContextToolbar 的单行容器自己画。
      contextBarTrailing: undefined,
      openDrawer,
      openTransientPanel,
      updateTransientPanel,
      closeDrawer,
    }),
    [
      activeDrawerId,
      floatingToolbar.leading,
      floatingToolbar.trailing,
      fallbackDetail,
      closeDetail,
      closeDrawer,
      openDrawer,
      openTransientPanel,
      updateTransientPanel,
      ownedDetail?.id,
      panels.isPanelOpen,
      panelVisible,
      showWorkspaceDetail,
      transientPanel?.id,
    ],
  );
  const rawContextToolbar = adapter.renderContextToolbar
    ? adapter.renderContextToolbar(layoutState)
    : adapter.contextToolbar;
  // 合同：没选中时 contextToolbar 为 null；多数编辑器仍交包装组件，由探针看它画没画出控件。
  const contextToolbar =
    rawContextToolbar == null ? null : (
      <SelectionPresenceProbe onChange={setSelectionPresent}>
        {rawContextToolbar}
      </SelectionPresenceProbe>
    );
  const noSelection = rawContextToolbar == null || !selectionPresent;

  const { leavingMountedEditor, requestClose, requestPaneClose, activateMineItem } = useInlineWorkbenchLeave({
    item, onClose, onPaneClose: rightPaneSlot?.closeRightPane, closeDetail, autoSave,
    autoSaveEnabled: hostAutoSaveEnabled,
    requiresMountedFlush: adapter.persistence?.requiresMountedFlush,
    closeRequestRevision: adapter.closeRequestRevision,
    editorUnconfirmed: hostAutoSaveEnabled ? editorDirty || autoSave.state !== "saved" : editorDirty,
  });

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

  // confirmation 只影响显式重试。Hosted iframe 的 mounted-flush 关闭闸单独声明；
  // 其余编辑器仍同步交给后台保存器，不因云朵状态阻塞离开。
  const flushForExplicitSave = adapter.persistence?.confirmation
    ? adapter.persistence.flush
    : autoSave.flushLatest;
  useEffect(() => {
    if (!advancedSession) return;
    advancedSession.registerFlush(flushForExplicitSave);
    return () => advancedSession.registerFlush(null);
  }, [advancedSession, flushForExplicitSave]);

  void backgroundBusy;
  const { openLibraryPanel, toggleDrawer, activeLibraryPanelId, openDrawerId } =
    useInlineLibraryPanels({
      panels,
      item,
      siteId,
      mineLabel: tt("我的库"),
      activateMineItem,
    });
  const actionBar = useMemo(
    () => (
      <InlineAdvancedWorkbenchHeader
        adapter={adapter}
        item={item}
        autoSaveState={autoSaveState}
        autoSaveError={autoSaveError}
        activeDrawerId={layoutState.activeDrawerId}
        activeLibraryPanelId={activeLibraryPanelId}
        drawers={drawers}
        accent={effectiveAccent}
        pluginThemeId={pluginThemeId}
        showLibrary={siteId !== "plugin-gallery"}
        showBack={siteId !== "plugin-gallery"}
        onBack={requestClose}
        onClose={requestPaneClose}
        onOpenDrawer={openDrawer}
        onCloseDrawer={closeDetail}
        onOpenTransientPanel={openTransientPanel}
        onOpenLibrary={openLibraryPanel}
        onRetrySave={() => void (adapter.persistence?.confirmation ? flushForExplicitSave() : autoSave.retry())}
        onUploadFiles={(files) => void performUpload(files)}
      />
    ),
    [
      activeLibraryPanelId,
      adapter,
      item,
      effectiveAccent,
      pluginThemeId,
      autoSave.retry,
      flushForExplicitSave,
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
      requestPaneClose,
      rightPaneSlot,
      siteId,
    ],
  );
  useLayoutEffect(() => {
    if (!rightPaneSlot) return;
    const owner = ownerIdRef.current;
    rightPaneSlot.setRightPaneClaim(owner, {
      label: headerSlotNode,
      editorHeader: true,
      frameless: false,
    });
    return () => rightPaneSlot.clearRightPaneClaim(owner);
  }, [headerSlotNode, rightPaneSlot]);

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
      {rightPaneSlot && headerHost && createPortal(actionBar, headerHost)}
      {showEditBar && (
        <FloatingContextToolbar
          controller={floatingToolbar}
          accent={effectiveAccent}
          theme={pluginTheme.theme}
          // 单行容器 `[data-workspace-edit-bar]` 由 FloatingContextToolbar 自己画
          // （signals/X2-interface.md）：撤销重做在第一行 history 槽，
          // 文档段走 documentSegment，AI 助手由容器最右段统一画。
          documentSegment={
            documentActions.length > 0 ||
            (noSelection && panels.editBarDrawers.length > 0) ? (
              <EditBarDocumentSegment
                actions={documentActions}
                onTrigger={triggerDocumentAction}
                drawers={noSelection ? panels.editBarDrawers : []}
                activeDrawerId={openDrawerId}
                onToggleDrawer={toggleDrawer}
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
        <FallbackDetailAside fallbackDetail={fallbackDetail} onClose={closeDetail} />
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
            inert={leavingMountedEditor || undefined}
            aria-busy={leavingMountedEditor || undefined}
            data-editor-leave-pending={leavingMountedEditor || undefined}
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
    </AdvancedLayoutContext.Provider>
    </PluginThemePortalContext.Provider>
  );
}
