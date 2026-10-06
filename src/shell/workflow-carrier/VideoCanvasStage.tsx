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
import { flushVideoCanvasGraph } from "./video-canvas-leave";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { useUI } from "../../i18n/ui/useUI";
import { useLockedEditCollab } from "../collab/adapters/use-entity-collab";

export {
  VIDEO_CANVAS_DUAL_ENGINE_HANDOFF,
  flushVideoCanvasGraph,
  videoCanvasLeavePolicy,
} from "./video-canvas-leave";
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
  const tt = useUI();
  // 别人保存新版后用它换掉画布的来源条目（画布嵌在 video 站里，由条目地址重新载入）。
  const [externalItem, setExternalItem] = useState<LibraryItem | null>(null);
  useEffect(() => {
    setExternalItem(null);
  }, [item]);
  const shownItem = externalItem ?? item;
  // ---- 多人同改（W14）：流程图是一次一人。画布是 video 站里的 React Flow（iframe），
  // 本仓拿不到它的节点与连线数据，也没有「把远端改动应用进去」的入口，所以不能合并，只能轮流。
  const lockedEdit = useLockedEditCollab({
    item,
    editorKind: "workflow",
    onExternalItem: setExternalItem,
  });
  const collabReadOnly = lockedEdit.readOnly;
  const [graph, setGraph] = useState<VideoCanvasGraph>(() => graphFromItem(item));
  const [editRevision, setEditRevision] = useState(0);
  const chipsManifest = useMemo(() => workflowToolsManifestChips(), []);

  useEffect(() => {
    setGraph(graphFromItem(shownItem));
  }, [shownItem]);

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

  const liveCanvasBase = shownItem ? embedEditorBase(shownItem) : "";

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
        collab: lockedEdit.collab,
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
                inert={collabReadOnly || undefined}
                data-collab-readonly={collabReadOnly ? "true" : undefined}
                className="h-full min-h-[240px] w-full"
              >
                <EmbedEditorPane
                  item={shownItem}
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
        status:
          collabReadOnly && lockedEdit.lockHolderName
            ? tt("「{name}」正在编辑这个作品，你现在只能看；他保存后这里会自动更新。", {
                name: lockedEdit.lockHolderName,
              })
            : "",
        persistence: {
          dirty: lockedEdit.mayWrite ? editRevision > 0 : false,
          editRevision,
          // 保持 true：只读端 dirty 恒为 false 且 flush 不落库，自动保存不会产生任何写入。
          autoSave: true,
          flush: () => {
            // 只读（别人持锁）时不落库；别人保存后这里会自动更新。
            if (!lockedEdit.mayWrite) return { ok: true as const, item };
            const saved = flushVideoCanvasGraph(item, graph);
            if (saved.item.revisionId) lockedEdit.markSaved(String(saved.item.revisionId));
            return saved;
          },
          recovery: {
            draftSchema: liveCanvasBase ? undefined : "oceanleo.workflow.graph.v1",
            key: advancedRecoveryKey("video-canvas", item),
            ready: !liveCanvasBase,
            capture: () => liveCanvasBase ? null : graph,
            restore: (payload) => {
              const restored = payload as VideoCanvasGraph | null;
              if (!restored || !Array.isArray(restored.nodes) || !Array.isArray(restored.edges)) return false;
              setGraph(restored);
              setEditRevision(value => value + 1);
              return true;
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
