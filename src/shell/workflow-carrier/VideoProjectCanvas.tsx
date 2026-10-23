"use client";

/**
 * 视频画布 v2 的 xyflow 画面：节点卡、连线、小地图、缩放控件，深浅两档。
 *
 * 这一层只管「画」和「把手势报上去」：拖完一次报一次位置、连线报连接、
 * 删除报删除、选中报选区。真正改文档的是 `VideoProjectStage`（走撤销栈和保存）。
 */
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  videoCanvasPalette,
  videoCanvasThemeStyle,
  type VideoCanvasThemeMode,
} from "./video-canvas-theme";

export interface VideoCanvasViewNode {
  id: string;
  kindLabel: string;
  accent: string;
  title: string;
  summary: string;
  x: number;
  y: number;
  locked: boolean;
  /** Displayable https image; media keeps its own colours in both themes. */
  thumbUrl?: string;
  mediaKind?: "image" | "video" | "audio";
}

export interface VideoCanvasViewEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface VideoCanvasSelection {
  nodeIds: string[];
  edgeIds: string[];
}

export interface VideoCanvasViewApi {
  /** Flow coordinates of the visible centre (where 「加节点」 drops a node). */
  center: () => { x: number; y: number };
  fit: () => void;
}

export interface VideoProjectCanvasProps {
  nodes: readonly VideoCanvasViewNode[];
  edges: readonly VideoCanvasViewEdge[];
  selection: VideoCanvasSelection;
  readOnly: boolean;
  theme: VideoCanvasThemeMode;
  lockedLabel: string;
  onMove: (moves: { id: string; x: number; y: number }[]) => void;
  onConnect: (connection: Connection) => void;
  onRemove: (nodeIds: string[], edgeIds: string[]) => void;
  onSelectionChange: (selection: VideoCanvasSelection) => void;
  onReady?: (api: VideoCanvasViewApi | null) => void;
}

type CardData = VideoCanvasViewNode & { lockedLabel: string } & Record<string, unknown>;

const NODE_WIDTH = 208;
const HANDLE_STYLE = {
  width: 10,
  height: 10,
  borderWidth: 2,
  background: "var(--vc-node-bg)",
  borderColor: "var(--vc-accent)",
} as const;

const VideoNodeCard = memo(function VideoNodeCard({ data, selected }: NodeProps<Node<CardData>>) {
  return (
    <div
      data-testid="video-canvas-node"
      data-node-id={data.id}
      data-selected={selected ? "true" : undefined}
      // No overflow clipping on the card: the side handles sit half outside it and must stay grabbable.
      className="relative rounded-[10px] text-left"
      style={{
        width: NODE_WIDTH,
        background: "var(--vc-node-bg)",
        color: "var(--vc-node-text)",
        border: `1px solid ${selected ? "var(--vc-accent)" : "var(--vc-node-border)"}`,
        boxShadow: selected
          ? "0 0 0 3px color-mix(in srgb, var(--vc-accent) 22%, transparent), var(--vc-node-shadow)"
          : "var(--vc-node-shadow)",
      }}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
        style={{ background: data.accent }}
      />
      {data.thumbUrl && data.mediaKind === "video" ? (
        <video src={data.thumbUrl} muted preload="metadata" controls className="nodrag block h-[96px] w-full rounded-t-[10px] object-cover" />
      ) : data.thumbUrl && data.mediaKind === "audio" ? (
        <audio src={data.thumbUrl} controls preload="metadata" className="nodrag block w-full" />
      ) : data.thumbUrl ? (
        <img
          src={data.thumbUrl}
          alt=""
          draggable={false}
          className="block h-[96px] w-full rounded-t-[10px] object-cover"
        />
      ) : null}
      <div className="space-y-1 py-2 pl-4 pr-3">
        <div
          className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.04em]"
          style={{ color: data.accent }}
        >
          <span className="truncate">{data.kindLabel}</span>
          {data.locked ? (
            <span className="shrink-0 normal-case" style={{ color: "var(--vc-node-muted)" }}>
              · {data.lockedLabel}
            </span>
          ) : null}
        </div>
        <div className="truncate text-[13px] font-semibold leading-snug">{data.title}</div>
        {data.summary ? (
          <div className="line-clamp-2 text-[11.5px] leading-snug" style={{ color: "var(--vc-node-muted)" }}>
            {data.summary}
          </div>
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  );
});

const NODE_TYPES = { video: VideoNodeCard };

function toFlowNodes(
  nodes: readonly VideoCanvasViewNode[],
  selected: ReadonlySet<string>,
  readOnly: boolean,
  lockedLabel: string,
): Node<CardData>[] {
  return nodes.map((node) => ({
    id: node.id,
    type: "video",
    position: { x: node.x, y: node.y },
    data: { ...node, lockedLabel },
    selected: selected.has(node.id),
    draggable: !readOnly && !node.locked,
    deletable: !readOnly && !node.locked,
    connectable: !readOnly,
  }));
}

function toFlowEdges(edges: readonly VideoCanvasViewEdge[], selected: ReadonlySet<string>, readOnly: boolean): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    // The card has one unnamed handle per side; named v2 handles still round-trip in the doc.
    selected: selected.has(edge.id),
    deletable: !readOnly,
  }));
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function CanvasInner(props: VideoProjectCanvasProps) {
  const { readOnly, theme, onReady } = props;
  const selectedNodes = useMemo(() => new Set(props.selection.nodeIds), [props.selection.nodeIds]);
  const selectedEdges = useMemo(() => new Set(props.selection.edgeIds), [props.selection.edgeIds]);
  const [nodes, setNodes, onNodesChange] = useNodesState(
    toFlowNodes(props.nodes, selectedNodes, readOnly, props.lockedLabel),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(props.edges, selectedEdges, readOnly));
  useEffect(() => {
    setNodes(toFlowNodes(props.nodes, selectedNodes, readOnly, props.lockedLabel));
  }, [props.lockedLabel, props.nodes, readOnly, selectedNodes, setNodes]);
  useEffect(() => {
    setEdges(toFlowEdges(props.edges, selectedEdges, readOnly));
  }, [props.edges, readOnly, selectedEdges, setEdges]);

  const flow = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    onReady?.({
      center: () => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return flow.screenToFlowPosition({
          x: rect.left + rect.width / 2 - NODE_WIDTH / 2,
          y: rect.top + rect.height / 2 - 40,
        });
      },
      fit: () => void flow.fitView({ padding: 0.2, duration: 200 }),
    });
    return () => onReady?.(null);
  }, [flow, onReady]);

  // Selection flows one way per direction: user gestures arrive as `select` changes
  // (reported up); the stage's selection goes down through `selected` on the nodes,
  // which xyflow never echoes back as a change. Listening to `onSelectionChange`
  // instead ping-ponged between the two (React "maximum update depth" on duplicate).
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const lastSelection = useRef<VideoCanvasSelection>(props.selection);
  lastSelection.current = props.selection;
  const { onSelectionChange } = props;
  const report = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      const next = {
        nodeIds: nextNodes.filter((node) => node.selected).map((node) => node.id).sort(),
        edgeIds: nextEdges.filter((edge) => edge.selected).map((edge) => edge.id).sort(),
      };
      const previous = lastSelection.current;
      if (sameIds(previous.nodeIds, next.nodeIds) && sameIds(previous.edgeIds, next.edgeIds)) return;
      lastSelection.current = next;
      onSelectionChange(next);
    },
    [onSelectionChange],
  );
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<CardData>>[]) => {
      onNodesChange(changes);
      if (changes.some((change) => change.type === "select")) {
        // Same-tick node + edge batches (click a node while a link is selected) must see each other.
        nodesRef.current = applyNodeChanges(changes, nodesRef.current);
        report(nodesRef.current, edgesRef.current);
      }
    },
    [onNodesChange, report],
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      if (changes.some((change) => change.type === "select")) {
        edgesRef.current = applyEdgeChanges(changes, edgesRef.current);
        report(nodesRef.current, edgesRef.current);
      }
    },
    [onEdgesChange, report],
  );

  const palette = videoCanvasPalette(theme);
  return (
    <div ref={wrapperRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        colorMode={theme}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDragStop={(_event, _node, dragged) => {
          if (readOnly) return;
          props.onMove(dragged.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })));
        }}
        onConnect={readOnly ? undefined : props.onConnect}
        onDelete={({ nodes: gone, edges: goneEdges }) => {
          if (readOnly) return;
          props.onRemove(gone.map((node) => node.id), goneEdges.map((edge) => edge.id));
        }}
        deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color={palette.dots} bgColor={palette.canvas} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="top-right"
          nodeColor={(node) => String((node.data as CardData | undefined)?.accent || palette.minimapNode)}
          nodeBorderRadius={4}
          bgColor={palette.minimapBg}
          maskColor={palette.minimapMask}
          style={{ border: `1px solid ${palette.nodeBorder}`, borderRadius: 8, overflow: "hidden" }}
        />
      </ReactFlow>
    </div>
  );
}

export function VideoProjectCanvas(props: VideoProjectCanvasProps) {
  return (
    <div
      data-testid="workflow-react-flow-canvas"
      data-local-core="xyflow"
      data-canvas-theme={props.theme}
      className="h-full min-h-[240px] w-full"
      style={videoCanvasThemeStyle(props.theme)}
    >
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
