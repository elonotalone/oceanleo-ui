"use client";

// workflow 的回放画法（work-chat W14，契约 §8.4）：节点与连线示意。
// 纯 React/SVG 元素（不插入外来 SVG 字符串）；这一步新增或改过的节点、连线用作者颜色描边。
import { useUI } from "../../../../i18n/ui/useUI";
import {
  workflowDiff,
  workflowFromRevisionJson,
  workflowFromYDoc,
  workflowToArtifactJson,
} from "../../../collab/adapters/workflow";
import type { VideoCanvasGraph } from "../../../workflow-carrier/video-canvas-schema";
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";
import { joinNotes, plainChangeTranslate, type ChangeTranslate } from "./notes";

const NODE_W = 150;
const NODE_H = 52;
const PAD = 16;

function WorkflowFrame({ snapshot, prev, width, height, authorColor = "#4f46e5" }: ReplayFrameProps) {
  const tt = useUI();
  const graph = snapshot as VideoCanvasGraph;
  if (graph.nodes.length === 0) {
    return (
      <div data-replay-frame="workflow" style={{ width, height }} className="rounded border border-[var(--border,#e7e5e4)] bg-[#14171B] p-2 text-[11px] text-[#8C959F]">
        {tt("流程图是空的")}
      </div>
    );
  }
  const diff = prev ? workflowDiff(prev as VideoCanvasGraph, graph) : null;
  const touchedNodes = new Set([...(diff?.nodesAdded ?? []), ...(diff?.nodesChanged ?? [])]);
  const touchedEdges = new Set([...(diff?.edgesAdded ?? []), ...(diff?.edgesChanged ?? [])]);
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const minX = Math.min(...graph.nodes.map((n) => num(n.x)));
  const minY = Math.min(...graph.nodes.map((n) => num(n.y)));
  const maxX = Math.max(...graph.nodes.map((n) => num(n.x))) + NODE_W;
  const maxY = Math.max(...graph.nodes.map((n) => num(n.y))) + NODE_H;
  const boxW = maxX - minX + PAD * 2;
  const boxH = maxY - minY + PAD * 2;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const at = (id: string, side: "out" | "in") => {
    const n = byId.get(id)!;
    return { x: num(n.x) - minX + PAD + (side === "out" ? NODE_W : 0), y: num(n.y) - minY + PAD + NODE_H / 2 };
  };
  return (
    <svg
      data-replay-frame="workflow"
      role="img"
      width={width}
      height={height}
      viewBox={`0 0 ${boxW} ${boxH}`}
      preserveAspectRatio="xMidYMid meet"
      className="rounded border border-[var(--border,#e7e5e4)]"
      style={{ background: "#14171B" }}
    >
      {graph.edges.filter((e) => byId.has(e.fromNodeId) && byId.has(e.toNodeId)).map((edge) => {
        const a = at(edge.fromNodeId, "out");
        const b = at(edge.toNodeId, "in");
        const mid = (a.x + b.x) / 2;
        const mark = touchedEdges.has(edge.id);
        return (
          <path
            key={edge.id}
            data-edge-id={edge.id}
            data-changed={mark ? "true" : undefined}
            d={`M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`}
            fill="none"
            stroke={mark ? authorColor : "#5F6974"}
            strokeWidth={mark ? 4 : 2}
          />
        );
      })}
      {graph.nodes.map((node) => {
        const x = num(node.x) - minX + PAD;
        const y = num(node.y) - minY + PAD;
        const mark = touchedNodes.has(node.id);
        return (
          <g key={node.id} data-node-id={node.id} data-changed={mark ? "true" : undefined}>
            <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={6} fill="#1F2328" stroke={mark ? authorColor : "#5F6974"} strokeWidth={mark ? 4 : 1.5} />
            <rect x={x} y={y} width={NODE_W} height={14} rx={6} fill="#1F6FEB" />
            <text x={x + 8} y={y + 11} fontSize={10} fill="#E6EDF3">{node.kind}</text>
            <text x={x + 8} y={y + 36} fontSize={13} fill="#E6EDF3">{(node.label || node.kind).slice(0, 18)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 这一步改了什么（节点、连线）。 */
export function describeWorkflowChange(prev: unknown, next: unknown, tt?: ChangeTranslate): string | null {
  if (!isRecord(next) || !Array.isArray(next.nodes)) return null;
  const before = isRecord(prev) && Array.isArray(prev.nodes) ? (prev as unknown as VideoCanvasGraph) : null;
  const d = workflowDiff(before, next as unknown as VideoCanvasGraph);
  const t = tt ?? plainChangeTranslate;
  const parts: string[] = [];
  if (d.nodesAdded.length) parts.push(t("新增了 {n} 个节点", { n: d.nodesAdded.length }));
  if (d.nodesRemoved.length) parts.push(t("删了 {n} 个节点", { n: d.nodesRemoved.length }));
  if (d.nodesChanged.length) parts.push(t("改了 {n} 个节点", { n: d.nodesChanged.length }));
  if (d.edgesAdded.length) parts.push(t("连了 {n} 条线", { n: d.edgesAdded.length }));
  if (d.edgesRemoved.length) parts.push(t("断了 {n} 条线", { n: d.edgesRemoved.length }));
  if (d.edgesChanged.length) parts.push(t("改了 {n} 条线", { n: d.edgesChanged.length }));
  return joinNotes(tt, parts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const renderer: ReplayFrameRenderer = {
  kind: "workflow",
  fromY: workflowFromYDoc,
  fromRevision: workflowFromRevisionJson,
  Frame: WorkflowFrame,
  describeChange: describeWorkflowChange,
  toArtifactJson: workflowToArtifactJson,
};

export default renderer;
