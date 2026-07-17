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
import { AdvancedWorkbenchStage } from "./AdvancedWorkbenchStage";
import { useAdvancedSession } from "./advanced-session-context";
import { advancedWorkbenchStyle } from "./advanced-workbench-chrome";
import type { LibraryItem } from "./library-data";
import { InlineEditorMaterialPanel } from "./InlineEditorMaterialPanel";
import {
  useWorkbenchMaterials,
  type WorkbenchMaterialAction,
} from "./workbench-material-provider";
import { useWorkspacePane } from "./SplitWorkspace";
import { useAdvancedAutoSave } from "./use-advanced-autosave";
import { useAdvancedRecovery } from "./use-advanced-recovery";

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
  const advancedSession = useAdvancedSession();
  const workbenchMaterials = useWorkbenchMaterials();
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ownerIdRef = useRef(
    `inline-editor:${adapter.id}:${item.key || item.id}`,
  );
  const liveDetailStoreRef = useRef<LiveDetailStore>(createLiveDetailStore());
  const closingRef = useRef(false);
  const handledCloseRequestRef = useRef(adapter.closeRequestRevision || 0);
  const dirtyRecordedRef = useRef(false);
  const [fallbackDetail, setFallbackDetail] = useState<{
    label: ReactNode;
    content: ReactNode;
  } | null>(null);
  const [activeDrawerId, setActiveDrawerId] = useState("");
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
    workspacePane?.detail?.ownerId === ownerIdRef.current
      ? workspacePane.detail
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
  const liveDetail = activeDrawerId
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
      setActiveDrawerId(drawerId);
      setRequestedMaterialAction(
        drawerId === "materials" ? materialAction : undefined,
      );
      const next = panelFor(drawerId, materialAction);
      if (workspacePane) {
        workspacePane.showDetail({
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
    [panelFor, workspacePane],
  );

  const closeDetail = useCallback(() => {
    workspacePane?.clearDetail(ownerIdRef.current);
    setFallbackDetail(null);
    setActiveDrawerId("");
    setRequestedMaterialAction(undefined);
  }, [workspacePane]);

  const layoutState = useMemo(
    () => ({
      hostPanelVisible: panelVisible,
      editorToolActive: panelVisible,
      activeDrawerId: workspacePane
        ? ownedDetail?.id || ""
        : fallbackDetail
          ? activeDrawerId
          : "",
      openDrawer,
      closeDrawer: closeDetail,
    }),
    [
      activeDrawerId,
      fallbackDetail,
      closeDetail,
      openDrawer,
      ownedDetail?.id,
      panelVisible,
      workspacePane,
    ],
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
    () => () => workspacePane?.clearDetail(ownerIdRef.current),
    [workspacePane],
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
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length && adapter.upload) {
        await performUpload(files);
        return;
      }
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
    },
    [
      activeMaterialAction,
      adapter.upload,
      performUpload,
      tt,
      workbenchMaterials,
    ],
  );

  const actionButtons = adapter.actions?.map((action) => (
    <button
      key={action.id}
      type="button"
      disabled={action.disabled || action.busy}
      onClick={() => {
        if (action.panelId) openDrawer(action.panelId);
        else void action.onTrigger?.();
      }}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] px-2.5 text-[11px] font-semibold text-[var(--awb-text)] transition hover:bg-[var(--awb-hover)] disabled:opacity-40"
      title={tt(action.label)}
      aria-label={tt(action.label)}
    >
      {action.icon && (
        <AdvancedEditorIcon name={action.icon} className="h-4 w-4" />
      )}
      {action.variant !== "icon" &&
        tt(action.busy && action.busyLabel ? action.busyLabel : action.label)}
    </button>
  ));

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
        <div
          ref={stageRef}
          className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
        >
          <div
            data-advanced-context-row
            className="z-[70] flex min-h-14 min-w-0 items-center gap-1.5 border-b border-[var(--awb-border)] bg-[var(--awb-chrome-bg)] px-2 py-2"
          >
            <button
              type="button"
              onClick={requestClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--awb-muted)] transition hover:bg-[var(--awb-hover)] hover:text-[var(--awb-text)]"
              aria-label={tt("返回库")}
              title={tt("返回库")}
            >
              ←
            </button>
            {adapter.history && (
              <>
                <button
                  type="button"
                  onClick={adapter.history.undo}
                  disabled={!adapter.history.canUndo}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition hover:bg-[var(--awb-hover)] disabled:opacity-30"
                  aria-label={tt("撤销")}
                  title={tt("撤销")}
                >
                  <AdvancedEditorIcon name="undo" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={adapter.history.redo}
                  disabled={!adapter.history.canRedo}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition hover:bg-[var(--awb-hover)] disabled:opacity-30"
                  aria-label={tt("重做")}
                  title={tt("重做")}
                >
                  <AdvancedEditorIcon name="redo" className="h-4 w-4" />
                </button>
              </>
            )}
            <div className="min-w-0 flex-1 overflow-x-auto">
              {adapter.contextToolbar}
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1 text-[10px] text-[var(--awb-muted)]"
              aria-live="polite"
            >
              <CloudAutoSaveIcon
                className={`h-3.5 w-3.5 ${
                  autoSave.state === "saving" ? "animate-pulse" : ""
                }`}
              />
              {autoSave.state === "saving"
                ? tt("正在自动保存")
                : autoSave.state === "error"
                  ? tt("保存遇到问题")
                  : Number(editRevision) > 0
                    ? tt("已自动保存")
                    : tt("自动保存")}
            </span>
            {actionButtons}
          </div>
          <div
            data-advanced-viewport-row
            className="relative min-h-0 min-w-0 overflow-hidden"
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
            {adapter.upload && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute right-3 top-3 z-[75] inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)]/95 px-3 text-[11px] font-semibold text-[var(--awb-text)] shadow-lg backdrop-blur transition hover:bg-[var(--awb-hover)]"
                  aria-label={tt("从本地添加到画布")}
                  title={tt("从本地添加到画布，也可以直接拖放文件")}
                >
                  <AdvancedEditorIcon name="uploads" className="h-4 w-4" />
                  {tt("添加文件")}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={adapter.upload.accept}
                  multiple={adapter.upload.multiple}
                  className="hidden"
                  onChange={(event) => {
                    void performUpload(Array.from(event.currentTarget.files || []));
                    event.currentTarget.value = "";
                  }}
                />
              </>
            )}
            <div className="absolute bottom-3 right-3 z-[75]">
              <AdvancedStageControls
                stageRef={stageRef}
                viewport={editorViewport}
                accent={accent}
              />
            </div>
          </div>
        </div>
      </div>
    </AdvancedLayoutContext.Provider>
  );
}

function CloudAutoSaveIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M7.2 18.5h9.5a4.3 4.3 0 0 0 .8-8.5A6.2 6.2 0 0 0 5.7 8.4a5 5 0 0 0 1.5 10.1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m9.4 13.2 1.8 1.8 3.6-3.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
