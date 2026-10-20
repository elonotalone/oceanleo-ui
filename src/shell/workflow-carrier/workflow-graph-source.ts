import type { LibraryItem } from "../library-data";
import { isDurableLibraryItem } from "../library-data";
import {
  storedEditorProjectUrl,
  unwrapStoredEditorProject,
  type TextLoader,
} from "../advanced-routes/stored-editor-project";
import { parseVideoCanvasSource } from "./video-canvas-source";
import { parseVideoCanvasProject } from "./video-canvas-local-session";
import type { VideoCanvasGraph, VideoCanvasProject } from "./video-canvas-schema";

export type WorkflowGraphPlan =
  | { kind: "ready"; graph: VideoCanvasGraph }
  | { kind: "blank"; graph: VideoCanvasGraph }
  | { kind: "remote"; url: string }
  | { kind: "fail"; error: string };

function emptyGraph(): VideoCanvasGraph {
  return { nodes: [], edges: [] };
}

function asGraph(value: unknown): VideoCanvasGraph | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fromWrapper = parseVideoCanvasProject(value);
  if (fromWrapper) return fromWrapper;
  const record = value as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) return null;
  return {
    nodes: record.nodes as VideoCanvasGraph["nodes"],
    edges: record.edges as VideoCanvasGraph["edges"],
  };
}

function graphFromVideoCanvasProject(project: VideoCanvasProject): VideoCanvasGraph | null {
  const head =
    project.versions.find((version) => version.id === project.headVersionId) ||
    project.versions[0];
  return head?.graph ? asGraph(head.graph) : null;
}

export function parseStoredWorkflowGraph(text: string): VideoCanvasGraph {
  const unwrapped = unwrapStoredEditorProject(text);
  const asObject =
    typeof unwrapped === "string" ? (JSON.parse(unwrapped) as unknown) : unwrapped;
  const graph = asGraph(asObject);
  if (graph) return graph;
  const project = parseVideoCanvasSource(
    typeof asObject === "string" ? asObject : JSON.stringify(asObject),
  );
  const fromProject = graphFromVideoCanvasProject(project);
  if (fromProject) return fromProject;
  throw new Error("工作流工程里没有可打开的节点图");
}

export function planWorkflowGraphFromItem(
  item: LibraryItem | null | undefined,
): WorkflowGraphPlan {
  if (!item) {
    return { kind: "blank", graph: emptyGraph() };
  }
  const meta = item.meta as { graph?: unknown } | undefined;
  const inline = asGraph(meta?.graph);
  if (inline && (inline.nodes.length > 0 || inline.edges.length > 0)) {
    return { kind: "ready", graph: inline };
  }
  if (inline && !item.artifactId && !storedEditorProjectUrl(item)) {
    return { kind: "ready", graph: inline };
  }
  const url = storedEditorProjectUrl(item);
  if (url) return { kind: "remote", url };
  if (isDurableLibraryItem(item) || item.artifactId) {
    return {
      kind: "fail",
      error: "这份工作流没有可打开的节点图，未改用空白图画覆盖原件。",
    };
  }
  return { kind: "blank", graph: emptyGraph() };
}

export async function hydrateWorkflowGraph(
  plan: WorkflowGraphPlan,
  loadText: TextLoader,
): Promise<{ ok: true; graph: VideoCanvasGraph } | { ok: false; error: string }> {
  if (plan.kind === "ready" || plan.kind === "blank") {
    return { ok: true, graph: plan.graph };
  }
  if (plan.kind === "fail") return { ok: false, error: plan.error };
  try {
    const text = await loadText(plan.url);
    if (!text || !String(text).trim()) {
      return {
        ok: false,
        error: "远程工作流工程为空，未改用空白图画覆盖原件。",
      };
    }
    return { ok: true, graph: parseStoredWorkflowGraph(text) };
  } catch (caught) {
    const detail =
      caught instanceof Error && caught.message.trim()
        ? caught.message.trim()
        : "远程工作流工程无法读取";
    return {
      ok: false,
      error: `${detail}，未改用空白图画覆盖原件。`,
    };
  }
}
