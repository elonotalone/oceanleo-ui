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
import { useLibraryEditorBinding, useLibraryEditState, LibraryEditStatus } from "./plugin-command/use-library-edit";
import { editIsLocked } from "./plugin-command/library-edit-flow";
import { useUI } from "../i18n/ui/useUI";
import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { AdvancedLayoutContext } from "./advanced-layout-context";
import { AdvancedStageControls } from "./AdvancedStageControls";
import { AdvancedWorkbenchStage } from "./AdvancedWorkbenchStage";
import {
  FloatingContextToolbar,
  useFloatingContextToolbar,
} from "./FloatingContextToolbar";
import { EditBarFloatingPanel, EditBarPanelContext } from "./EditBarFloatingPanel";
import { EditBarDockHost } from "./EditBarDockHost";
import { editorToolsIconForSelection } from "./EditorToolsIcon";
import { InlineAdvancedWorkbenchHeader } from "./InlineAdvancedWorkbenchHeader";
import {
  hasPendingOrFailed,
  subscribe as subscribeBackgroundSaves,
} from "./advanced-background-saver";
import { useInlineWorkbenchLeave } from "./use-inline-workbench-leave";
import { useInlineAdvancedWorkbenchDrop } from "./inline-advanced-workbench-drop";
import { useInlineAdvancedPanels } from "./use-inline-advanced-panels";
import {
  editBarShowsDrawers,
  useInlineLibraryPanels,
} from "./use-inline-library-panels";
import {
  FallbackDetailAside,
  HiddenUploadInput,
  StageNoticeCorner,
  useEditBarDockPresentation,
  usePluginPagesForAdapter,
} from "./inline-advanced-shell-parts";
import { useAdvancedSession } from "./advanced-session-context";
import { advancedRootItemId } from "./advanced-session";
import {
  actionGroup,
  advancedWorkbenchStyle,
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
import { canSaveVersion } from "./collab/provider";
import { useAdvancedAutoSave } from "./use-advanced-autosave";
import { editBarDocumentTools } from "./plugin-chrome/EditBarDocumentSegment";
import { SelectionToolbar } from "./SelectionToolbar";
import { creationToolControl } from "./creation-tools";
import { resolveSelectionAdapterContext } from "./selection-adapter";
import type { SelectionCommand, SelectionContext } from "./selection-context";
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
  // adapter（website / design-canvas）pluginThemeId 为 null，
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
    floatingPanels,
    openDrawer,
    openTransientPanel,
    updateTransientPanel,
    closeDetail,
    closeDrawer,
  } = panels;
  const selectionPresent = Boolean(adapter.selection?.context?.controls.length);
  const selectionKind = adapter.selection?.context?.kind ?? null;

  const editorDirty = adapter.persistence?.dirty || false;
  const editRevision = adapter.persistence?.editRevision || 0;
  const room = adapter.collab?.room;
  const hostAutoSaveEnabled = adapter.persistence?.autoSave !== false && (adapter.persistence?.destination === "local-device" || canSaveVersion(room ?? null));
  const materialKey =
    adapter.persistence?.userEditKey || advancedRootItemId(item) || item.id;
  const autoSave = useAdvancedAutoSave({
    // Website keeps dirty for close guards but disables observe-autosave so a
    // pending visual draft is not save→auto-Applied out from under Apply.
    key: materialKey,
    enabled: hostAutoSaveEnabled,
    room: adapter.collab?.room,
    dirty: hostAutoSaveEnabled ? editorDirty : false,
    revision: editRevision,
    flush: adapter.persistence?.flush,
    preparePublish: adapter.persistence?.preparePublish,
    draft: hostAutoSaveEnabled ? adapter.persistence?.draft : undefined,
    recovery: adapter.persistence?.recovery,
    item,
    editorId: adapter.id,
    destination: adapter.persistence?.destination,
    session: advancedSession,
  });
  const retrySave = autoSave.retry;
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
  const panelVisible = Boolean(floatingPanels.active || ownedDetail || fallbackDetail);
  const activeTransientPanelId = transientPanel && panels.isPanelOpen(transientPanel.id) ? transientPanel.id : "";

  const layoutState = useMemo(
    () => ({
      hostPanelVisible: panelVisible,
      editorToolActive: panelVisible,
      activeDrawerId,
      activeTransientPanelId,
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
      activeTransientPanelId,
      floatingToolbar.leading,
      closeDrawer,
      openDrawer,
      openTransientPanel,
      updateTransientPanel,
      panelVisible,
    ],
  );
  useLayoutEffect(() => {
    const ref = adapter.panelHostRef;
    if (!ref) return;
    ref.current = layoutState;
    return () => { if (ref.current === layoutState) ref.current = null; };
  }, [adapter.panelHostRef, layoutState]);
  const noSelection = editBarShowsDrawers({
    adapterId: adapter.id,
    hasContextToolbar: adapter.selection?.context != null,
    selectionPresent,
    selectionKind,
  });

  const { leavingMountedEditor, requestClose, requestPaneClose, activateMineItem } = useInlineWorkbenchLeave({
    item, onClose, onPaneClose: rightPaneSlot?.closeRightPane, closeDetail, autoSave,
    autoSaveEnabled: hostAutoSaveEnabled,
    requiresMountedFlush: adapter.persistence?.requiresMountedFlush,
    closeRequestRevision: adapter.closeRequestRevision,
    editorUnconfirmed: hostAutoSaveEnabled ? autoSave.pending : editorDirty || autoSave.pending,
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
  const flushForExplicitSave = autoSave.flushLatest;
  const editState = useLibraryEditorBinding(item, flushForExplicitSave, hostAutoSaveEnabled && adapter.persistence?.destination !== "local-device" && Boolean(item.artifact?.access.canEdit), siteId);
  const [editFlow] = useLibraryEditState(item, siteId);
  const aiLocked = editIsLocked(editState.phase);
  useEffect(() => {
    if (!aiLocked || typeof document === "undefined") return;
    const root = stageRef.current?.closest("[data-inline-editor]");
    if (root?.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur?.();
    const fence = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-library-ai-entry], [data-library-ai-phase]")) return;
      const inPanel = floatingPanels.active && target.closest("[data-edit-bar-floating-panel]")?.id === floatingPanels.active.id && target.closest("[data-edit-bar-panel-current]");
      if (root?.contains(target) || inPanel) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const events = ["pointerdown", "click", "keydown", "beforeinput", "paste", "drop"];
    events.forEach(name => document.addEventListener(name, fence, true));
    return () => events.forEach(name => document.removeEventListener(name, fence, true));
  }, [aiLocked, floatingPanels.active]);

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
  const creationTools = useMemo(() => {
    const tools = [
      ...(adapter.creationTools || []),
      ...editBarDocumentTools({
        actions: documentActions,
        drawers: noSelection ? panels.editBarDrawers : [],
        activeDrawerId: openDrawerId,
        onToggleDrawer: toggleDrawer,
      }),
    ];
    return tools.filter((tool, index) => tools.findIndex((candidate) => candidate.id === tool.id) === index);
  }, [adapter.creationTools, documentActions, noSelection, panels.editBarDrawers, openDrawerId, toggleDrawer]);
  const toolbarContext = useMemo<SelectionContext | null>(() => {
    const selected = resolveSelectionAdapterContext(adapter.selection?.context ?? null, tt);
    const controls = [...(selected?.controls || []), ...creationTools.map((tool) => creationToolControl(tool, tt))];
    if (!controls.length) return null;
    return selected ? { ...selected, controls } : {
      version: 1, kind: "creation", id: `creation:${adapter.id.replace(/[^a-z0-9_.:-]/gi, "-")}`, controls,
    };
  }, [adapter.selection?.context, adapter.id, creationTools, tt]);
  const dispatchToolbarCommand = useCallback((message: SelectionCommand, anchor?: HTMLElement) => {
    if (!toolbarContext || message.selectionId !== toolbarContext.id) return;
    if (toolbarContext.epoch !== undefined && message.selectionEpoch !== toolbarContext.epoch) return;
    const creation = creationTools.find((tool) => tool.id === message.controlId);
    if (creation) {
      if (toolbarContext.revision !== undefined && message.selectionRevision !== toolbarContext.revision) return;
      if (!creation.disabled) creation.execute?.(anchor);
      return;
    }
    // Engine revisions may advance inside one gesture; its adapter owns the
    // transaction-aware revision gate and must still receive commit/cancel.
    if (!aiLocked) adapter.selection?.dispatch(message);
  }, [toolbarContext, creationTools, adapter.selection, aiLocked]);
  const actionBar = useMemo(
    () => (
      <div inert={aiLocked || undefined}><InlineAdvancedWorkbenchHeader
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
        onRetrySave={() => void retrySave()}
        onUploadFiles={(files) => void performUpload(files)}
      /></div>
    ),
    [
      aiLocked,
      activeLibraryPanelId,
      adapter,
      item,
      effectiveAccent,
      pluginThemeId,
      retrySave,
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
    <EditBarPanelContext.Provider value={floatingPanels}>
    <AdvancedLayoutContext.Provider value={layoutState}>
      {rightPaneSlot && headerHost && createPortal(actionBar, headerHost)}
      {showEditBar && (
        <FloatingContextToolbar
          controller={floatingToolbar}
          accent={effectiveAccent}
          theme={pluginTheme.theme}
          // 收起后的小圆显示选中对象类型（signals/W03-to-W02.md #1）。
          collapsedIcon={
            selectionPresent && selectionKind
              ? editorToolsIconForSelection(selectionKind)
              : undefined
          }
          // 单行容器 `[data-workspace-edit-bar]` 由 FloatingContextToolbar 自己画
          // （signals/X2-interface.md）：撤销重做在第一行 history 槽，
          // 创建工具与选区共用 SelectionToolbar，AI 助手由容器最右段统一画。
          emptyHint="在画面里选中元素后，可在此编辑"
        >
          {!aiLocked && toolbarContext && <SelectionToolbar context={toolbarContext} onCommand={dispatchToolbarCommand} accent={effectiveAccent} />}
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
          onFiles={(files) => { if (!aiLocked) void performUpload(files); }}
        />
        <FallbackDetailAside fallbackDetail={fallbackDetail} onClose={closeDetail} />
        <EditBarFloatingPanel controller={floatingPanels} containerRef={stageRef} editBarRef={editBarLayerRef} pluginThemeId={pluginThemeId} />
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
          <LibraryEditStatus flow={editFlow} state={editState} />
          <div
            ref={stageRef}
            inert={leavingMountedEditor || aiLocked || undefined}
            aria-busy={leavingMountedEditor || aiLocked || undefined}
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
                onMaterialDrop={(event) => { if (!aiLocked) void handleDrop(event); }}
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
    </EditBarPanelContext.Provider>
    </PluginThemePortalContext.Provider>
  );
}
