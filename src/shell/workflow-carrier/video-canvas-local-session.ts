import {
  VIDEO_CANVAS_PROJECT_SCHEMA,
  type VideoCanvasGraph,
  type VideoCanvasNode,
  type VideoCanvasNodeKind,
} from "./video-canvas-schema";

export function cloneVideoCanvasGraph(graph: VideoCanvasGraph): VideoCanvasGraph {
  return JSON.parse(JSON.stringify(graph)) as VideoCanvasGraph;
}

export function emptyVideoCanvasGraph(): VideoCanvasGraph {
  return { nodes: [], edges: [] };
}

export function createVideoCanvasHistory(initial: VideoCanvasGraph) {
  let history = [cloneVideoCanvasGraph(initial)];
  let index = 0;

  return {
    current(): VideoCanvasGraph {
      return cloneVideoCanvasGraph(history[index]);
    },
    commit(next: VideoCanvasGraph): VideoCanvasGraph {
      const cloned = cloneVideoCanvasGraph(next);
      history = history.slice(0, index + 1);
      history.push(cloned);
      index = history.length - 1;
      return cloned;
    },
    undo(): VideoCanvasGraph {
      if (index > 0) index -= 1;
      return this.current();
    },
    redo(): VideoCanvasGraph {
      if (index < history.length - 1) index += 1;
      return this.current();
    },
    canUndo(): boolean {
      return index > 0;
    },
    canRedo(): boolean {
      return index < history.length - 1;
    },
  };
}

export function addVideoCanvasNode(
  graph: VideoCanvasGraph,
  kind: VideoCanvasNodeKind,
  id: string,
  label?: string,
): VideoCanvasGraph {
  const node: VideoCanvasNode = {
    id,
    kind,
    label: label || kind,
    x: 80 + graph.nodes.length * 40,
    y: 80,
    ports: {
      inputs: kind === "source" ? [] : [{ name: "in", dataType: "any" }],
      outputs: kind === "output" ? [] : [{ name: "out", dataType: "any" }],
    },
  };
  return {
    nodes: [...graph.nodes, node],
    edges: graph.edges,
  };
}

export function setVideoCanvasNodeLabel(
  graph: VideoCanvasGraph,
  id: string,
  label: string,
): VideoCanvasGraph {
  return {
    nodes: graph.nodes.map((node) => (node.id === id ? { ...node, label } : node)),
    edges: graph.edges,
  };
}

export function exportVideoCanvasProject(graph: VideoCanvasGraph): string {
  return `${JSON.stringify({
    schema: VIDEO_CANVAS_PROJECT_SCHEMA,
    version: 1,
    graph: cloneVideoCanvasGraph(graph),
  })}\n`;
}

export function parseVideoCanvasProject(value: unknown): VideoCanvasGraph | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { schema?: unknown; graph?: unknown };
  const graph =
    record.graph && typeof record.graph === "object"
      ? (record.graph as VideoCanvasGraph)
      : (value as VideoCanvasGraph);
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null;
  return cloneVideoCanvasGraph(graph);
}
