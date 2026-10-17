"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { VideoCanvasGraph, VideoCanvasNode } from "./video-canvas-schema";

const GRID = 16;

function toFlowNodes(graph: VideoCanvasGraph): Node[] {
  return graph.nodes.map((node, index) => ({
    id: node.id,
    position: { x: node.x ?? (index % 4) * 180, y: node.y ?? Math.floor(index / 4) * 96 },
    data: { label: node.label || node.kind, kind: node.kind },
    style: {
      fontSize: 12,
      padding: 8,
      border: "1px solid #cbd5e1",
      borderRadius: 8,
      background: "#fff",
    },
  }));
}

function toFlowEdges(graph: VideoCanvasGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.fromNodeId,
    target: edge.toNodeId,
    sourceHandle: edge.fromPort,
    targetHandle: edge.toPort,
    label: edge.condition || "",
  }));
}

function fromFlow(
  nodes: Node[],
  edges: Edge[],
  graph: VideoCanvasGraph,
): VideoCanvasGraph {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const nextNodes: VideoCanvasNode[] = nodes.map((node) => {
    const previous = byId.get(node.id);
    return {
      id: node.id,
      kind: previous?.kind || "filter",
      label: String(node.data?.label || previous?.label || node.id),
      x: node.position.x,
      y: node.position.y,
      params: previous?.params,
      assetId: previous?.assetId,
      ports: previous?.ports || { inputs: [], outputs: [] },
    };
  });
  return {
    nodes: nextNodes,
    edges: edges.map((edge) => ({
      id: edge.id,
      fromNodeId: edge.source,
      fromPort: String(edge.sourceHandle || "out"),
      toNodeId: edge.target,
      toPort: String(edge.targetHandle || "in"),
    })),
  };
}

function LocalCanvasInner({
  graph,
  onChange,
  readOnly = false,
}: {
  graph: VideoCanvasGraph;
  onChange: (graph: VideoCanvasGraph) => void;
  readOnly?: boolean;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(graph));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(graph));
  const signature = useMemo(
    () => JSON.stringify({ nodes: graph.nodes, edges: graph.edges }),
    [graph],
  );

  useEffect(() => {
    setNodes(toFlowNodes(graph));
    setEdges(toFlowEdges(graph));
  }, [graph, setEdges, setNodes, signature]);

  const emit = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      onChange(fromFlow(nextNodes, nextEdges, graph));
    },
    [graph, onChange],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      const moved = changes.some((change) => change.type === "position" && change.dragging === false);
      if (moved) {
        setNodes((current) => {
          emit(current, edges);
          return current;
        });
      }
    },
    [edges, emit, onNodesChange, setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        const next = addEdge({ ...connection, id: `e-${connection.source}-${connection.target}` }, current);
        emit(nodes, next);
        return next;
      });
    },
    [emit, nodes, setEdges],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={readOnly ? undefined : handleNodesChange}
      onEdgesChange={readOnly ? undefined : onEdgesChange}
      onConnect={readOnly ? undefined : onConnect}
      fitView
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} color="#cbd5e1" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function VideoCanvasLocalCanvas(props: {
  graph: VideoCanvasGraph;
  onChange: (graph: VideoCanvasGraph) => void;
  readOnly?: boolean;
}) {
  return (
    <div
      data-testid="workflow-react-flow-canvas"
      data-local-core="xyflow"
      className="h-full min-h-[240px] w-full"
    >
      <ReactFlowProvider>
        <LocalCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
