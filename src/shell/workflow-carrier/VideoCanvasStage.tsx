"use client";

/**
 * 工作流叶子：React Flow 画布是唯一编辑面。
 *
 * 本仓没有 React Flow 画布实现（画布在 video 站，经 EmbeddedRoute 注入）。
 * 这里的 stand-in 只把节点和连线画成可断言的 DOM，好让闸锁住
 * 「画布不渲染 / 节点连不上」——不是自研核。
 *
 * 专业编辑页保留，但不可用（点了不动）。
 */
import { useEffect, useMemo, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { usePluginCommandSurface } from "../plugin-command";
import { rememberEditorChips } from "../agent-review/inbox";
import type { LibraryItem } from "../library-data";
import type {
  VideoCanvasEdge,
  VideoCanvasGraph,
  VideoCanvasNode,
} from "./video-canvas-schema";
import {
  WORKFLOW_AGENT_CHIPS,
  WORKFLOW_EDITOR_ID,
  workflowToolsManifestChips,
} from "./l4-chips";
import { dispatchWorkflowAgentChip } from "./agent-route";
import { EmbedEditorPane, embedEditorBase } from "../workbench-embed";

export const WORKFLOW_STAGE_ATTR = "data-workflow-stage";
export const WORKFLOW_MODE_ATTR = "data-workflow-mode";
export const WORKFLOW_CANVAS_ATTR = "data-workflow-canvas-visible";
export const WORKFLOW_PRO_UNAVAILABLE = "专业编辑即将到来";

function emptyGraph(): VideoCanvasGraph {
  return { nodes: [], edges: [] };
}

function graphFromItem(item: LibraryItem | null | undefined): VideoCanvasGraph {
  if (!item) return emptyGraph();
  const meta = item.meta as { graph?: unknown } | undefined;
  const raw = meta?.graph;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyGraph();
  const nodes = (raw as { nodes?: unknown }).nodes;
  const edges = (raw as { edges?: unknown }).edges;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return emptyGraph();
  return {
    nodes: nodes as VideoCanvasNode[],
    edges: edges as VideoCanvasEdge[],
  };
}

function WorkflowCanvasStandIn({ graph }: { graph: VideoCanvasGraph }) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  return (
    <div
      data-testid="workflow-react-flow-canvas"
      className="h-full min-h-[240px] w-full overflow-auto"
    >
      {nodes.map((node) => (
        <div
          key={node.id}
          data-testid="workflow-node"
          data-node-id={node.id}
          data-node-kind={node.kind}
        >
          {node.label || node.kind}
        </div>
      ))}
      {edges.map((edge) => (
        <div
          key={edge.id}
          data-testid="workflow-edge"
          data-edge-id={edge.id}
          data-from={edge.fromNodeId}
          data-to={edge.toNodeId}
          data-from-port={edge.fromPort}
          data-to-port={edge.toPort}
        />
      ))}
    </div>
  );
}

export function VideoCanvasStage({
  item,
  taskId,
  siteId = "",
  accent = "#0d9488",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const [graph, setGraph] = useState<VideoCanvasGraph>(() => graphFromItem(item));
  const [editRevision, setEditRevision] = useState(0);
  const chipsManifest = useMemo(() => workflowToolsManifestChips(), []);

  useEffect(() => {
    setGraph(graphFromItem(item));
  }, [item]);

  useEffect(() => {
    rememberEditorChips("workflow", chipsManifest.chips);
    rememberEditorChips("video-canvas", chipsManifest.chips);
    return () => {
      rememberEditorChips("workflow", []);
      rememberEditorChips("video-canvas", []);
    };
  }, [chipsManifest.chips]);

  usePluginCommandSurface(
    useMemo(
      () => ({
        editorId: WORKFLOW_EDITOR_ID,
        describe: () =>
          WORKFLOW_AGENT_CHIPS.map((chip) => ({
            id: chip.id,
            label: chip.label,
            summary: chip.prompt.slice(0, 120),
            mutates: true,
          })),
        state: () => ({
          mode: "normal",
          revision: editRevision,
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          chips: chipsManifest.chips.map((chip) => chip.id),
        }),
        run: (id, params) => {
          const proposed =
            params && typeof params.proposedGraph === "object"
              ? (params.proposedGraph as VideoCanvasGraph)
              : undefined;
          const dispatched = dispatchWorkflowAgentChip({
            chipId: id,
            origin: params?.origin,
            graph,
            revision: editRevision,
            proposedGraph: proposed,
          });
          if (dispatched.parked) {
            return {
              ok: true,
              message: "改动已送审阅，你点接受之前流程图一个节点都不会变。",
              revision: editRevision,
            };
          }
          if (dispatched.route.kind === "reject") {
            return {
              ok: false,
              message: dispatched.route.reason,
              revision: editRevision,
            };
          }
          if (dispatched.graph !== graph) {
            setGraph(dispatched.graph);
            setEditRevision((n) => n + 1);
            return {
              ok: true,
              message: "改动已写入画布。",
              revision: editRevision + 1,
            };
          }
          return {
            ok: true,
            message: "这条动作没有改图。",
            revision: editRevision,
          };
        },
      }),
      [chipsManifest.chips, editRevision, graph],
    ),
  );

  const liveCanvasBase = item ? embedEditorBase(item) : "";

  if (!item) {
    return <div data-testid="workflow-missing-item">没有打开的流程图。</div>;
  }

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "video-canvas",
        label: "工作流",
        mode: {
          current: "normal",
          setMode: () => {},
          unavailableReason: WORKFLOW_PRO_UNAVAILABLE,
        },
        pages: { proUnavailableReason: WORKFLOW_PRO_UNAVAILABLE },
        stage: (
          <div
            {...{ [WORKFLOW_STAGE_ATTR]: "true" }}
            {...{ [WORKFLOW_MODE_ATTR]: "normal" }}
            {...{ [WORKFLOW_CANVAS_ATTR]: "true" }}
            data-testid="workflow-react-flow-stage"
            className="flex h-full min-h-0 flex-col"
          >
            {liveCanvasBase ? (
              <div
                data-testid="workflow-react-flow-canvas"
                className="h-full min-h-[240px] w-full"
              >
                <EmbedEditorPane
                  item={item}
                  editorBase={liveCanvasBase}
                  mediaType="video_canvas"
                  siteId={siteId}
                />
              </div>
            ) : (
              <WorkflowCanvasStandIn graph={graph} />
            )}
          </div>
        ),
        status: "",
        persistence: {
          dirty: editRevision > 0,
          editRevision,
          autoSave: false,
          flush: () => ({ ok: true as const }),
        },
      }}
      onClose={onClose}
    />
  );
}
