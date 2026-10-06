/**
 * 流程图的多人同改适配（work-chat W14，契约 §9.15）。
 *
 * 合并粒度 = 节点与连线：实体 id 就是图里已有的 `node.id` / `edge.id`。节点的位置、标签、参数
 * 各是一个字段，两个人同时拖不同节点、或同一节点一个改标签一个拖位置都保留。
 *
 * 路由层的现状（如实写明）：真画布（React Flow）由 video 站经 `EmbedEditorPane` 注入，本仓的
 * `VideoCanvasStage` 没有受控的 nodes/edges 入参，也没有「把远端变化写回画布」的命令接口，
 * 所以路由做「一次一人」；这份适配器服务于回放（版本前后对比）与 video 站补上接口之后的真同改。
 * 需要 video 站补的接口见交付说明。
 */
import { readEntityRoot, type EntityDoc } from "./video";
import type { VideoCanvasEdge, VideoCanvasGraph, VideoCanvasNode } from "../../workflow-carrier/video-canvas-schema";

export const WORKFLOW_ROOT = "oceanleo:workflow";

const NODE = "n:";
const EDGE = "e:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function workflowToEntities(graph: VideoCanvasGraph): EntityDoc {
  const order: string[] = [];
  const entities: Record<string, Record<string, unknown>> = {};
  for (const node of graph.nodes ?? []) {
    const { id, ...fields } = node;
    const key = `${NODE}${id}`;
    const entity: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(fields)) if (value !== undefined) entity[name] = value;
    order.push(key);
    entities[key] = entity;
  }
  for (const edge of graph.edges ?? []) {
    const { id, ...fields } = edge;
    const key = `${EDGE}${id}`;
    const entity: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(fields)) if (value !== undefined) entity[name] = value;
    order.push(key);
    entities[key] = entity;
  }
  return { order, entities, meta: {} };
}

/** 连到已被删掉的节点上的连线随节点一起消失。 */
export function workflowFromEntities(
  input: { order: string[]; entities: Record<string, Record<string, unknown>>; meta?: Record<string, unknown> },
  _prev: VideoCanvasGraph | null,
): VideoCanvasGraph {
  const nodes: VideoCanvasNode[] = [];
  const edges: VideoCanvasEdge[] = [];
  const seen = new Set<string>();
  for (const key of input.order) {
    if (seen.has(key)) continue;
    seen.add(key);
    const entity = input.entities[key];
    if (!isRecord(entity)) continue;
    if (key.startsWith(NODE)) nodes.push({ ports: {}, ...(entity as object), id: key.slice(NODE.length) } as VideoCanvasNode);
    else if (key.startsWith(EDGE)) edges.push({ ...(entity as object), id: key.slice(EDGE.length) } as VideoCanvasEdge);
  }
  const ids = new Set(nodes.map((node) => node.id));
  return { nodes, edges: edges.filter((edge) => ids.has(edge.fromNodeId) && ids.has(edge.toNodeId)) };
}

export function workflowFromYDoc(doc: unknown): VideoCanvasGraph {
  return workflowFromEntities(readEntityRoot(doc, WORKFLOW_ROOT), null);
}

/** 版本 JSON：项目（`versions` + `headVersionId`）/ `{ graph }` / `{ nodes, edges }` 都认。 */
export function workflowFromRevisionJson(json: unknown): VideoCanvasGraph {
  const record = isRecord(json) ? json : {};
  let graph: unknown = record;
  if (Array.isArray(record.versions)) {
    const head = (record.versions as unknown[]).filter(isRecord).find((version) => version.id === record.headVersionId);
    const last = (record.versions as unknown[]).filter(isRecord).at(-1);
    graph = (head ?? last)?.graph;
  } else if (isRecord(record.graph)) {
    graph = record.graph;
  }
  const g = isRecord(graph) ? graph : {};
  return workflowFromEntities(
    workflowToEntities({
      nodes: Array.isArray(g.nodes) ? (g.nodes as unknown[]).filter(isRecord).filter((n) => typeof n.id === "string") as unknown as VideoCanvasNode[] : [],
      edges: Array.isArray(g.edges) ? (g.edges as unknown[]).filter(isRecord).filter((e) => typeof e.id === "string") as unknown as VideoCanvasEdge[] : [],
    }) as never,
    null,
  );
}

export function workflowDiff(prev: VideoCanvasGraph | null, next: VideoCanvasGraph) {
  const nodesBefore = new Map((prev?.nodes ?? []).map((n) => [n.id, JSON.stringify(n)]));
  const edgesBefore = new Map((prev?.edges ?? []).map((e) => [e.id, JSON.stringify(e)]));
  const nodesAfter = new Map(next.nodes.map((n) => [n.id, n]));
  const edgesAfter = new Map(next.edges.map((e) => [e.id, e]));
  return {
    nodesAdded: next.nodes.filter((n) => !nodesBefore.has(n.id)).map((n) => n.id),
    nodesRemoved: [...nodesBefore.keys()].filter((id) => !nodesAfter.has(id)),
    nodesChanged: next.nodes.filter((n) => nodesBefore.has(n.id) && nodesBefore.get(n.id) !== JSON.stringify(n)).map((n) => n.id),
    edgesAdded: next.edges.filter((e) => !edgesBefore.has(e.id)).map((e) => e.id),
    edgesRemoved: [...edgesBefore.keys()].filter((id) => !edgesAfter.has(id)),
    edgesChanged: next.edges.filter((e) => edgesBefore.has(e.id) && edgesBefore.get(e.id) !== JSON.stringify(e)).map((e) => e.id),
  };
}

export function workflowDescribeChange(prev: unknown, next: unknown): string | null {
  if (!isRecord(next) || !Array.isArray(next.nodes)) return null;
  const before = isRecord(prev) && Array.isArray(prev.nodes) ? (prev as unknown as VideoCanvasGraph) : null;
  const d = workflowDiff(before, next as unknown as VideoCanvasGraph);
  const parts: string[] = [];
  if (d.nodesAdded.length) parts.push(`新增了 ${d.nodesAdded.length} 个节点`);
  if (d.nodesRemoved.length) parts.push(`删了 ${d.nodesRemoved.length} 个节点`);
  if (d.nodesChanged.length) parts.push(`改了 ${d.nodesChanged.length} 个节点`);
  if (d.edgesAdded.length) parts.push(`连了 ${d.edgesAdded.length} 条线`);
  if (d.edgesRemoved.length) parts.push(`断了 ${d.edgesRemoved.length} 条线`);
  if (d.edgesChanged.length) parts.push(`改了 ${d.edgesChanged.length} 条线`);
  return parts.length ? parts.join("，") : null;
}

/** 「从这一步接手」：还原成编辑器的图（`{ nodes, edges }`）。 */
export function workflowToArtifactJson(snapshot: unknown): unknown {
  return workflowFromRevisionJson(snapshot);
}
