"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n";
import { SelectionToolbar } from "../../SelectionToolbar";
import { WorkbenchMaterialProvider, useWorkbenchMaterialAdapter } from "../../workbench-material-provider";
import {
  PLUGIN_THEME_SPECS,
  usePluginTheme,
} from "../../plugin-theme";
import {
  PluginChromeFrame,
  readPluginChromeFromSearch,
  type PluginChromePanel,
} from "../../plugin-chrome";
import {
  CANVAS_AGENT_SITE_ID,
  useCanvasAgentSurface,
} from "./canvas-agent-surface";
import {
  NODE_MENU_ENTRY_IDS,
  type CanvasCommandAvailability,
  type NodeMenuEntryId,
} from "./command-registry";
import {
  CANVAS_CREATE_MIME,
  CanvasCreateMenu,
} from "./CanvasCreateMenu";
import {
  CANVAS_MATERIAL_PANEL_ID,
  CanvasMaterialPanel,
  CanvasMaterialPanelBridge,
} from "./CanvasMaterialPanel";
import { LeoNode } from "./LeoNode";
import { CanvasProductView } from "./CanvasProductViews";
import { PluginThemeStyles } from "./plugin-theme";
import {
  useCanvasViews,
  useCanvasChromeActions,
  useCanvasNotices,
  useCanvasSaveState,
} from "./use-canvas-chrome";
import type { CanvasFlowNode } from "./project-model";
import { useCanvasWorkflow } from "./use-canvas-workflow";
import { useCanvasCollabBridge } from "./use-canvas-collab";

const NODE_TYPES: NodeTypes = { "leovideo-media": LeoNode };

/** 选不中东西时编辑栏说的那句话。AI 键由外壳恒定出一个，不在这一行里。 */
const EDIT_BAR_EMPTY_HINT = "选中画布节点后在此编辑";

function CanvasInner() {
  const tt = useUI();
  const workflow = useCanvasWorkflow();
  // 多人同改（F06）：外壳用 recovery-capture / recovery-restore 读写这张图（use-canvas-collab.ts）；
  // 只读时仍可拖动画布、缩放、点开节点看参数，只是改不了。
  useCanvasCollabBridge(workflow.embed, workflow.collabPort);
  const collabReadOnly = Boolean(workflow.collabReadOnly);
  // 主题不再自持：与顶栏的切换器、其余 12 件插件读同一个 store。
  // 兜底也不自己钉常量——SSR 首帧 theme 为空时照样从统一表取，
  // 本地写死一个值正是「顶栏一个绿、画布另一个绿」的来路。
  const { theme, accent } = usePluginTheme("video-canvas");
  const spec = PLUGIN_THEME_SPECS["video-canvas"];
  const pluginTheme = theme || "light";
  const chromeAccent = accent || spec.accent[pluginTheme];
  useWorkbenchMaterialAdapter(workflow.materialAdapter);
  // 内建 AI 抽屉的上下文与可执行指令从这里来。挂在 chrome 之外也注册：
  // 宿主自带 chrome（LeoDev 嵌入态）时抽屉由宿主出，指令面照样得在。
  useCanvasAgentSurface(workflow);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const latestRun = workflow.project.durable?.runs.at(-1);
  const refreshRun: CanvasCommandAvailability = latestRun
    ? workflow.availability("canvas.run.status.refresh", {
        runId: latestRun.runId,
      })
    : { enabled: false };
  const cancelRun: CanvasCommandAvailability = latestRun
    ? workflow.availability("canvas.run.cancel", { runId: latestRun.runId })
    : { enabled: false };

  useEffect(() => {
    const update = () =>
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    if (workflow.mediaUploadRequest > 0) uploadInputRef.current?.click();
  }, [workflow.mediaUploadRequest]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void workflow.dispatchCommand("canvas.project.save", {}, "keyboard");
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        workflow.selectedNode
      ) {
        event.preventDefault();
        void workflow.dispatchCommand("canvas.node.delete", {}, "keyboard");
      } else if (event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        void workflow.dispatchCommand(
          "canvas.node.create",
          { entryId: "text" },
          "keyboard",
        );
      } else if (event.altKey && event.key === "1") {
        event.preventDefault();
        void workflow.dispatchCommand(
          "canvas.session.image-mode.set",
          { mode: "retouch" },
          "keyboard",
        );
      } else if (event.altKey && event.key === "2") {
        event.preventDefault();
        void workflow.dispatchCommand(
          "canvas.session.image-mode.set",
          { mode: "generate" },
          "keyboard",
        );
      } else if (event.key === "Escape") {
        workflow.closeCreateMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workflow]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen();
  }, []);

  const chromeViews = useCanvasViews();
  const chromeActions = useCanvasChromeActions(workflow);
  const chromeNotices = useCanvasNotices(workflow);
  const chromeSaveState = useCanvasSaveState(workflow);
  // agent 抽屉**刻意不在这张表里**：它由 PluginChromeFrame 内建，全仓唯一注册点是
  // agent-drawer-panel.tsx 的 createPluginAgentDrawer()。这里传同 id 的面板会被
  // frame 过滤掉（改造中途本插件就撞在这上面：面板一帧没渲染，却多出一个 AI 键）。
  const chromePanels = useMemo<PluginChromePanel[]>(
    () => [
      {
        id: CANVAS_MATERIAL_PANEL_ID,
        label: tt("素材库"),
        icon: "materials",
        width: 360,
        content: <CanvasMaterialPanel accent={chromeAccent} />,
      },
    ],
    [chromeAccent, tt],
  );

  const stage = (
    <div
      ref={rootRef}
      data-canvas-workflow
      data-project-id={workflow.project.projectId}
      data-project-version-id={workflow.project.headVersionId}
      data-performance-budget="200 nodes / 400 edges reference; 500 / 2000 hard"
      data-plugin-theme={pluginTheme}
      data-collab-readonly={collabReadOnly ? "true" : undefined}
      className="relative h-full min-h-[28rem] min-w-[20rem] w-full overflow-hidden bg-[var(--vc-canvas)] text-[var(--vc-text)]"
      onWheelCapture={workflow.onWheelCapture}
      onDoubleClickCapture={(event) => {
        const target = event.target as HTMLElement;
        if (!target.classList.contains("react-flow__pane")) return;
        workflow.onPaneDoubleClick(event);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(CANVAS_CREATE_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        const entryId = event.dataTransfer.getData(CANVAS_CREATE_MIME);
        if (
          !NODE_MENU_ENTRY_IDS.includes(entryId as NodeMenuEntryId)
        ) {
          return;
        }
        event.preventDefault();
        workflow.dropCreate(entryId as NodeMenuEntryId, {
          x: event.clientX,
          y: event.clientY,
        });
      }}
    >
      <PluginThemeStyles />
      {/* 执行降级提示已进 chrome 的 notices 行；这里只留住那个测试与宿主都在
          找的标记属性，不再重复画一条横幅（画两条是改造前的老样子）。 */}
      {workflow.executionDegraded && (
        <span data-gallery-edit-only hidden />
      )}

      <ReactFlow
        // Absolute fill: when the host only contributes min-height (narrow
        // ResultCanvas slots), height:100% collapses to 0 and bottom-left
        // Controls park above the viewport (V5 y=-22 / bottomInset=504).
        className="!absolute inset-0 h-full w-full"
        nodes={workflow.renderNodes}
        edges={workflow.edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={workflow.onNodesChange}
        onEdgesChange={workflow.onEdgesChange}
        onConnect={workflow.onConnect}
        isValidConnection={workflow.isValidConnection}
        onNodeClick={(_event, node) => workflow.onNodeClick(node.id)}
        onNodeDoubleClick={(_event, node) =>
          workflow.onNodeDoubleClick(node.id)
        }
        onPaneClick={workflow.onPaneClick}
        onNodeDragStart={workflow.onNodeDragStart}
        onNodeDragStop={workflow.onNodeDragStop}
        onConnectStart={workflow.onConnectStart}
        onConnectEnd={workflow.onConnectEnd}
        onMoveStart={workflow.onMoveStart}
        onMove={workflow.onMove}
        onMoveEnd={workflow.onMoveEnd}
        onInit={workflow.setFlowInstance}
        onlyRenderVisibleElements
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.12}
        maxZoom={2.2}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={null}
        nodesDraggable={!collabReadOnly}
        nodesConnectable={!collabReadOnly}
        edgesReconnectable={!collabReadOnly}
        multiSelectionKeyCode={["Control", "Meta"]}
        proOptions={{ hideAttribution: true }}
        colorMode={pluginTheme}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--vc-dot)"
          bgColor="var(--vc-canvas)"
          gap={22}
          size={1.1}
        />
        {workflow.workspaceView === "graph" && (
          <Controls
            position="bottom-left"
            orientation="horizontal"
            aria-label="Canvas zoom and fit controls"
            showInteractive={false}
            className="!bottom-14 !left-4 !m-0 !border-[var(--vc-border)] !bg-[var(--vc-surface)] !text-[var(--vc-text-2)] md:!bottom-4 [&_.react-flow__controls-button:focus-visible]:!outline-2 [&_.react-flow__controls-button:focus-visible]:!outline-offset-2 [&_.react-flow__controls-button:focus-visible]:!outline-[var(--vc-accent)]"
          />
        )}
        {workflow.workspaceView === "graph" &&
          workflow.renderNodes.length <= 200 && (
            <MiniMap<CanvasFlowNode>
              pannable
              zoomable
              position="bottom-right"
              ariaLabel="Canvas overview"
              nodeColor={(node) =>
                node.data.kind === "image"
                  ? "var(--vc-info)"
                  : node.data.kind === "video"
                    ? "var(--vc-video)"
                    : node.data.kind === "audio"
                      ? "var(--vc-accent)"
                      : "var(--vc-edge)"
              }
              maskColor="var(--vc-minimap-mask)"
              className="!bottom-14 !right-4 !m-0 !h-24 !w-36 !border !border-[var(--vc-border)] !bg-[var(--vc-surface)] max-md:!hidden xl:!bottom-4"
            />
          )}
      </ReactFlow>

      {workflow.workspaceView !== "graph" && (
        <CanvasProductView
          view={workflow.workspaceView}
          project={workflow.project}
          comparison={workflow.historyComparison}
          dispatch={workflow.dispatchCommand}
          commandState={workflow.commandState}
          cancelActiveCommand={workflow.cancelActiveCommand}
        />
      )}

      {workflow.workspaceView === "graph" &&
        workflow.renderNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <div className="max-w-sm rounded-2xl border border-dashed border-[var(--vc-accent-border)] bg-[var(--vc-accent-soft)] px-8 py-7 text-center backdrop-blur-sm">
            <p className="text-sm font-semibold text-[var(--vc-text)]">
              Double-click the blank canvas
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--vc-text-3)]">
              Add a real media surface, Script, or Composite. Unsupported
              capabilities are not advertised.
            </p>
          </div>
        </div>
        )}

      {workflow.workspaceView === "graph" && latestRun && (
        <aside
          aria-label="Latest durable video run"
          className="absolute right-3 top-16 z-30 w-72 rounded-xl border border-[var(--vc-video-border)] bg-[var(--vc-surface-glass)] p-3 text-[10px] shadow-2xl backdrop-blur"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--vc-video)]">
                Durable video Run
              </p>
              <p className="mt-1 truncate font-mono text-[9px] text-[var(--vc-text-3)]">
                {latestRun.runId}
              </p>
              <p className="mt-1 text-[var(--vc-text-2)]" aria-live="polite">
                {latestRun.status}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                disabled={!refreshRun.enabled}
                title={refreshRun.reason}
                onClick={() =>
                  void workflow.dispatchCommand(
                    "canvas.run.status.refresh",
                    { runId: latestRun.runId },
                    "toolbar",
                  )
                }
                className="rounded-md border border-[var(--vc-border)] px-2 py-1 text-[var(--vc-text-2)] disabled:hidden"
              >
                {tt("刷新")}
              </button>
              <button
                type="button"
                disabled={!cancelRun.enabled}
                title={cancelRun.reason}
                onClick={() =>
                  void workflow.dispatchCommand(
                    "canvas.run.cancel",
                    { runId: latestRun.runId },
                    "toolbar",
                  )
                }
                className="rounded-md border border-[var(--vc-danger-border)] px-2 py-1 text-[var(--vc-danger)] disabled:hidden"
              >
                {tt("取消")}
              </button>
            </div>
          </div>
        </aside>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-4">
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex max-w-[70vw] items-center gap-2 rounded-full border border-[var(--vc-border)] bg-[var(--vc-overlay)] px-3 py-1.5 text-center text-[10px] text-[var(--vc-text-2)] shadow-xl backdrop-blur"
        >
          {workflow.commandState?.status === "pending"
            ? `${workflow.commandState.phase || "running"} · ${Math.round(
                (workflow.commandState.progress || 0) * 100,
              )}% · ${workflow.commandState.message || workflow.commandState.commandId}`
            : workflow.status}
          {workflow.commandState?.status === "pending" &&
            workflow.commandState.cancelable && (
              <button
                type="button"
                onClick={() => workflow.cancelActiveCommand()}
                className="rounded-full border border-[var(--vc-danger-border)] px-2 py-0.5 text-[9px] text-[var(--vc-danger)]"
              >
                {tt("取消")}
              </button>
            )}
        </div>
      </div>


      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        aria-label="Upload canvas media"
        disabled={workflow.uploadingMedia}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void workflow.uploadMedia(file);
          event.target.value = "";
        }}
      />

      <CanvasCreateMenu
        point={workflow.menuPoint}
        onCreate={workflow.createFromMenu}
        onClose={workflow.closeCreateMenu}
      />
    </div>
  );

  // 嵌入态（?embed=1 / hostOwnsChrome / 协议判定的 embed.active）由宿主画
  // 两行：Frame 仍挂着，但 chrome="host" 一行都不画。
  const chrome =
    workflow.hostOwnsChrome ||
    workflow.embed.active ||
    readPluginChromeFromSearch() === "host"
      ? "host"
      : "self";

  return (
    <PluginChromeFrame
      pluginId="video-canvas"
      chrome={chrome}
      // agent 会话按站分区。删掉第二套时这个值最容易一起丢掉——丢了会话就从
      // video.video-canvas 掉到 editor.video-canvas，历史对话当场找不回来。
      siteId={CANVAS_AGENT_SITE_ID}
      title={workflow.project.title}
      subtitle={`head ${workflow.project.headVersionId.slice(0, 16)}…`}
      badge="LV"
      views={chromeViews}
      activeViewId={workflow.workspaceView}
      onViewChange={(view) =>
        void workflow.openView(view as typeof workflow.workspaceView)
      }
      actions={chromeActions}
      saveState={chromeSaveState}
      notices={chromeNotices}
      panels={chromePanels}
      // 槽里只有选区工具条：AI 键归外壳右段，插件不再自己出一个。
      // 图像 / 视频 / 音频 / 合成的命令一律走这条 SelectionToolbar
      //（简单动作在胶囊，表单进 inspector 左栏），不再按节点类型把槽位腾空。
      onModeChange={(next) => {
        void workflow.openView(next === "pro" ? "director" : "graph");
      }}
      editBar={
        <>
          {workflow.selectionContext ? (
            <SelectionToolbar
              context={workflow.selectionContext}
              onCommand={workflow.dispatchSelectionCommand}
              accent={chromeAccent}
            />
          ) : (
            <span className="px-1.5 text-[11px] text-[var(--pchrome-ink-mid)]">
              {tt(EDIT_BAR_EMPTY_HINT)}
            </span>
          )}
        </>
      }
      window={{
        onToggleFullscreen: toggleFullscreen,
        fullscreen: isFullscreen,
      }}
    >
      <CanvasMaterialPanelBridge
        requestOpen={workflow.materialLibraryOpen}
        onRequestHandled={workflow.closeMaterialLibrary}
      />
      {workflow.projectLoadError ? (
        <div role="alert" data-video-project-load-error className="grid h-full place-items-center p-6">
          <div className="max-w-lg space-y-2 text-sm">
            <p className="font-semibold">{tt("这份视频工程无法打开")}</p>
            <p>{workflow.projectLoadError}</p>
          </div>
        </div>
      ) : stage}
    </PluginChromeFrame>
  );
}

export default function CanvasWorkflow({
  materialAppId = "canvas-flow",
}: {
  materialAppId?: string;
}) {
  return (
    <WorkbenchMaterialProvider siteId="video" appId={materialAppId}>
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
    </WorkbenchMaterialProvider>
  );
}
