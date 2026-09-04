"use client";

/**
 * 工作流叶子：普通模式是 React Flow 画布槽，专业模式才挂 Langflow iframe。
 *
 * 本仓没有 React Flow 画布实现（A-45：画布在 video 站，经 EmbeddedRoute 注入）。
 * 这里的 stand-in 只把节点和连线画成可断言的 DOM，好让闸锁住
 * 「画布不渲染 / 节点连不上」——不是自研核。
 *
 * L0 adapter.mode（默认 normal，只走 set-mode）
 * L4 chips + review-proposal（routeWorkflowChip，默认送审）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { usePluginCommandSurface } from "../plugin-command";
import { type EditorMode } from "../hosted-editor/index";
import { rememberEditorChips } from "../agent-review/inbox";
import type { LibraryItem } from "../library-data";
import type {
  VideoCanvasEdge,
  VideoCanvasGraph,
  VideoCanvasNode,
} from "./video-canvas-schema";
import { fromLangflowFlow, toLangflowFlow } from "./langflow-flow-json";
import {
  buildWorkflowFlowInitEnvelope,
  buildWorkflowLangflowEmbedUrl,
} from "./langflow-embed";
import {
  WORKFLOW_CANVAS_ATTR,
  WORKFLOW_HOSTED_ATTR,
  WORKFLOW_LANGFLOW_DEFAULT_MODE,
  WORKFLOW_MODE_ATTR,
  WORKFLOW_STAGE_ATTR,
  applyWorkflowEditorMode,
} from "./langflow-mode";
import {
  LangflowHostedFrame,
  postWorkflowInit,
  postWorkflowSaveRequest,
  postWorkflowSetMode,
} from "./langflow-hosted-frame";
import {
  WORKFLOW_AGENT_CHIPS,
  WORKFLOW_EDITOR_ID,
  workflowToolsManifestChips,
} from "./l4-chips";
import { dispatchWorkflowAgentChip } from "./agent-route";

function hostOriginNow(): string {
  if (typeof window === "undefined") return "https://oceanleo.com";
  return window.location.origin || "https://oceanleo.com";
}

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

export function LangflowProStage({
  item,
  taskId,
  siteId = "",
  accent = "#0d9488",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const instanceId = useRef(
    `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ).current;
  const iframeHolderRef = useRef<HTMLIFrameElement | null>(null);
  const hostedSessionRef = useRef(false);
  const [mode, setMode] = useState<EditorMode>(WORKFLOW_LANGFLOW_DEFAULT_MODE);
  const [graph, setGraph] = useState<VideoCanvasGraph>(() => graphFromItem(item));
  const [hostedSrc, setHostedSrc] = useState("");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [editRevision, setEditRevision] = useState(0);
  const chipsManifest = useMemo(() => workflowToolsManifestChips(), []);
  const applied = applyWorkflowEditorMode(instanceId, mode);

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

  useEffect(() => {
    try {
      setHostedSrc(
        buildWorkflowLangflowEmbedUrl({
          instanceId,
          hostOrigin: hostOriginNow(),
          assetTitle: item?.title,
        }),
      );
    } catch {
      setHostedSrc("");
    }
  }, [instanceId, item?.title]);

  useEffect(() => {
    if (!applied.showHostedEditor) {
      setReady(false);
      hostedSessionRef.current = false;
    }
  }, [applied.showHostedEditor]);

  useEffect(() => {
    if (!applied.showHostedEditor || !ready || hostedSessionRef.current) return;
    const frame = iframeHolderRef.current?.contentWindow || null;
    const exported = toLangflowFlow(graph, {
      flowId: instanceId,
      name: item?.title || "workflow",
    });
    if (!exported.ok) {
      setStatus(exported.message);
      return;
    }
    hostedSessionRef.current = true;
    postWorkflowSetMode(frame, instanceId, "pro");
    postWorkflowInit(
      frame,
      instanceId,
      buildWorkflowFlowInitEnvelope(instanceId, {
        flow: exported.flow,
        readOnly: false,
        title: item?.title,
      }),
    );
  }, [applied.showHostedEditor, graph, instanceId, item?.title, ready]);

  const applyMode = useCallback(
    (next: EditorMode) => {
      const planned = applyWorkflowEditorMode(instanceId, next);
      setMode(planned.mode);
      const frame = iframeHolderRef.current?.contentWindow || null;
      if (planned.showHostedEditor) {
        postWorkflowSetMode(frame, instanceId, "pro");
      } else {
        postWorkflowSetMode(frame, instanceId, "normal");
        postWorkflowSaveRequest(
          frame,
          instanceId,
          `save-${Date.now().toString(36)}`,
        );
      }
    },
    [instanceId],
  );

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
          mode,
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
      [chipsManifest.chips, editRevision, graph, mode],
    ),
  );

  const showHosted = applied.showHostedEditor && Boolean(hostedSrc);
  const showCanvas = applied.showCanvas;

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
        mode: { current: mode, setMode: applyMode },
        stage: (
          <div
            {...{ [WORKFLOW_STAGE_ATTR]: "true" }}
            {...{ [WORKFLOW_MODE_ATTR]: applied.mode }}
            {...{ [WORKFLOW_CANVAS_ATTR]: showCanvas ? "true" : "false" }}
            {...{ [WORKFLOW_HOSTED_ATTR]: showHosted ? "true" : "false" }}
            data-testid="workflow-langflow-stage"
            className="flex h-full min-h-0 flex-col"
          >
            {showHosted ? (
              <LangflowHostedFrame
                instanceId={instanceId}
                hostOrigin={hostOriginNow()}
                iframeRef={iframeHolderRef}
                src={hostedSrc}
                title="Langflow"
                onReady={() => setReady(true)}
                onSnapshot={(payload) => {
                  if (!payload.flow) return;
                  const back = fromLangflowFlow(payload.flow);
                  if (!back.ok) {
                    setStatus(back.message);
                    return;
                  }
                  setGraph(back.graph);
                  if (back.warnings.length > 0) {
                    setStatus(back.warnings.join(" "));
                  }
                  setEditRevision((n) => n + 1);
                }}
                onError={setStatus}
              />
            ) : null}
            {applied.showHostedEditor && !hostedSrc ? (
              <div data-testid="workflow-pro-unavailable">
                专业模式现在打不开：还没有可用的 Langflow 嵌入地址。
              </div>
            ) : null}
            {showCanvas ? <WorkflowCanvasStandIn graph={graph} /> : null}
          </div>
        ),
        status:
          status ||
          (showHosted && !ready ? "正在连接工作流专业内核" : ""),
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

export { WORKFLOW_LANGFLOW_DEFAULT_MODE };
