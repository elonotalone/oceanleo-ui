"use client";

import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useRef } from "react";
import { useUI } from "../../../i18n";
import { CanvasCreateMenu, CANVAS_CREATE_MIME } from "./CanvasCreateMenu";
import { NODE_MENU_ENTRY_IDS, type NodeMenuEntryId, type CanvasCommandAvailability } from "./command-registry";
import { LeoNode } from "./LeoNode";
import { CanvasProductView } from "./CanvasProductViews";
import { PluginThemeStyles } from "./plugin-theme";
import type { CanvasFlowNode } from "./project-model";
import type { useCanvasWorkflow } from "./use-canvas-workflow";
const NODE_TYPES: NodeTypes = { "leovideo-media": LeoNode };

/** Content only. The Library shell owns every edit bar, panel and save action. */
export default function CanvasWorkflow({ workflow, pluginTheme }: {
  workflow: ReturnType<typeof useCanvasWorkflow>; pluginTheme: "light" | "dark";
}) {
  const tt = useUI();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const collabReadOnly = workflow.collabReadOnly;
  const latestRun = workflow.project.durable?.runs.at(-1);
  const refreshRun: CanvasCommandAvailability = latestRun
    ? workflow.availability("canvas.run.status.refresh", { runId: latestRun.runId }) : { enabled: false };
  const cancelRun: CanvasCommandAvailability = latestRun
    ? workflow.availability("canvas.run.cancel", { runId: latestRun.runId }) : { enabled: false };
  useEffect(() => { if (workflow.mediaUploadRequest > 0) uploadInputRef.current?.click(); }, [workflow.mediaUploadRequest]);
  return (
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
          project={workflow.displayProject}
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

}
