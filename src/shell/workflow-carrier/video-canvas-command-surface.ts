import type {
  PluginCommandResult,
  PluginCommandSurfaceInput,
} from "../plugin-command/types";
import { WORKFLOW_EDITOR_ID } from "./l4-chips";
import { addVideoCanvasNode } from "./video-canvas-local-session";
import type { VideoCanvasGraph } from "./video-canvas-schema";

export interface VideoCanvasCommandPort {
  graph(): VideoCanvasGraph;
  revision(): number;
  sourceReady(): boolean;
  sourceError(): string;
  apply(next: VideoCanvasGraph): void;
}

function ok(message: string, revision?: number): PluginCommandResult {
  return {
    ok: true,
    message,
    ...(typeof revision === "number" ? { revision } : {}),
  };
}

function fail(message: string, revision?: number): PluginCommandResult {
  return {
    ok: false,
    message,
    ...(typeof revision === "number" ? { revision } : {}),
  };
}

export function applyVideoCanvasCommand(
  graph: VideoCanvasGraph,
  id: string,
  params: Record<string, unknown> = {},
  revision = 0,
):
  | { ok: true; graph: VideoCanvasGraph; message: string; revision: number }
  | { ok: false; error: string } {
  if (id !== "workflow.add-node") {
    return { ok: false, error: `工作流编辑器没有「${id}」这条指令。` };
  }
  const next = addVideoCanvasNode(
    graph,
    "filter",
    `node-${revision + 1}`,
    String(params.label || "新节点"),
  );
  return {
    ok: true,
    graph: next,
    message: `已加入节点，现在共 ${next.nodes.length} 个。`,
    revision: revision + 1,
  };
}

export function createVideoCanvasCommandSurface(
  port: VideoCanvasCommandPort,
): PluginCommandSurfaceInput {
  return {
    editorId: WORKFLOW_EDITOR_ID,
    describe() {
      if (!port.sourceReady()) return [];
      return [
        {
          id: "workflow.add-node",
          label: "加节点",
          summary: "在流程图上加入一个处理节点。",
          mutates: true,
        },
      ];
    },
    state() {
      const graph = port.graph();
      return {
        revision: port.revision(),
        sourceReady: port.sourceReady(),
        nodes: graph.nodes.length,
        edges: graph.edges.length,
      };
    },
    run(id, params) {
      if (!port.sourceReady()) {
        return fail(
          port.sourceError() || "工作流源还没载入，图一个节点都没改。",
          port.revision(),
        );
      }
      const applied = applyVideoCanvasCommand(
        port.graph(),
        id,
        params || {},
        port.revision(),
      );
      if (!applied.ok) return fail(applied.error, port.revision());
      port.apply(applied.graph);
      return ok(applied.message, applied.revision);
    },
  };
}
