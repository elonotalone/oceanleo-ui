/**
 * 流程图的多人同改适配（work-chat W14，契约 §9.15）。
 *
 * 合并粒度 = 节点与连线：实体 id 就是图里已有的 `node.id` / `edge.id`。节点的位置、标签、参数
 * 各是一个字段，两个人同时拖不同节点、或同一节点一个改标签一个拖位置都保留。
 *
 * 路由层（第二轮 F06）：真画布（React Flow）在 video 站 iframe 里，工程是 `oceanleo.video.project.v2`
 * （节点 `nodeId/title/position/…`、连线 `edgeId/sourceNodeId/targetNodeId/…`）。外壳用 v1 协议里已有的
 * `recovery-capture` / `recovery-restore`（不加新指令）拿画布的图、把别人的改动按字段补丁发回去；
 * 本文件下半部分（`canvas*`）是这条通道的纯函数：画布图 ↔ 协同实体、补丁、分块、载荷校验。
 * 上半部分（`workflow*`）服务回放，并且能读懂真实画布工程的字段名。
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

/**
 * 真实画布（video 站）的节点用 `title` / `position`、连线用 `sourceNodeId` / `targetNodeId`；回放画法读的是
 * `label` / `x` / `y` / `fromNodeId` / `toNodeId`。字段缺哪个才补哪个（只加不改：旧形状的输入原样不变）。
 */
function readableNode(raw: Record<string, unknown>): VideoCanvasNode {
  const node: Record<string, unknown> = { ...raw };
  const position = isRecord(node.position) ? node.position : null;
  if (node.x === undefined && position && typeof position.x === "number") node.x = position.x;
  if (node.y === undefined && position && typeof position.y === "number") node.y = position.y;
  if (node.label === undefined && typeof node.title === "string") node.label = node.title;
  return node as unknown as VideoCanvasNode;
}

function readableEdge(raw: Record<string, unknown>): VideoCanvasEdge {
  const edge: Record<string, unknown> = { ...raw };
  if (edge.fromNodeId === undefined && typeof edge.sourceNodeId === "string") edge.fromNodeId = edge.sourceNodeId;
  if (edge.toNodeId === undefined && typeof edge.targetNodeId === "string") edge.toNodeId = edge.targetNodeId;
  if (edge.fromNodeId !== undefined && edge.fromPort === undefined) {
    edge.fromPort = typeof edge.sourceHandle === "string" ? edge.sourceHandle : "";
  }
  if (edge.toNodeId !== undefined && edge.toPort === undefined) {
    edge.toPort = typeof edge.targetHandle === "string" ? edge.targetHandle : "";
  }
  return edge as unknown as VideoCanvasEdge;
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
    if (key.startsWith(NODE)) nodes.push(readableNode({ ports: {}, ...(entity as object), id: key.slice(NODE.length) }));
    else if (key.startsWith(EDGE)) edges.push(readableEdge({ ...(entity as object), id: key.slice(EDGE.length) }));
  }
  const ids = new Set(nodes.map((node) => node.id));
  return { nodes, edges: edges.filter((edge) => ids.has(edge.fromNodeId) && ids.has(edge.toNodeId)) };
}

export function workflowFromYDoc(doc: unknown): VideoCanvasGraph {
  return workflowFromEntities(readEntityRoot(doc, WORKFLOW_ROOT), null);
}

/** 真实画布工程的节点 / 连线用 `nodeId` / `edgeId`：没有 `id` 时借它当实体 id（有 `id` 的旧形状原样不变）。 */
const withNativeId = (field: "nodeId" | "edgeId") => (record: Record<string, unknown>): Record<string, unknown> =>
  typeof record.id !== "string" && typeof record[field] === "string" ? { ...record, id: record[field] } : record;

/** 版本 JSON：项目（`versions` + `headVersionId`）/ `{ graph }` / `{ nodes, edges }` 都认。 */
export function workflowFromRevisionJson(json: unknown): VideoCanvasGraph {
  const record = isRecord(json) ? json : {};
  let graph: unknown = record;
  if (Array.isArray(record.versions)) {
    const head = (record.versions as unknown[]).filter(isRecord).find((version) => version.id === record.headVersionId);
    const last = (record.versions as unknown[]).filter(isRecord).at(-1);
    graph = (head ?? last)?.graph;
  } else if (isRecord(record.versions) && typeof record.headVersionId === "string") {
    // 真实画布工程（`oceanleo.video.project.v2`）：versions 是「版本 id → 版本」的表。
    const head = record.versions[record.headVersionId];
    graph = isRecord(head) ? head.graph : undefined;
  } else if (isRecord(record.graph)) {
    graph = record.graph;
  }
  const g = isRecord(graph) ? graph : {};
  return workflowFromEntities(
    workflowToEntities({
      nodes: Array.isArray(g.nodes) ? (g.nodes as unknown[]).filter(isRecord).map(withNativeId("nodeId")).filter((n) => typeof n.id === "string") as unknown as VideoCanvasNode[] : [],
      edges: Array.isArray(g.edges) ? (g.edges as unknown[]).filter(isRecord).map(withNativeId("edgeId")).filter((e) => typeof e.id === "string") as unknown as VideoCanvasEdge[] : [],
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

// ============================================================================
// 真实画布（video 站 iframe）的协同通道：外壳 ↔ 画布，走 v1 协议里已有的
// recovery-capture / recovery-snapshot / recovery-restore / recovery-result（不加新指令）。
// 画布那一侧的同名常量与校验在 video 站 `canvas-collab.ts`，两边必须逐字一致（测试各自锁）。
// ============================================================================

export const CANVAS_COLLAB_SCHEMA = "oceanleo.canvas.collab.v1";
/** 画布只收 ≤ 64KB 的外壳消息（`MAX_PROTOCOL_MESSAGE_BYTES`）；补丁分块后每块载荷不超过这个数，给信封留足余量。 */
export const CANVAS_COLLAB_CHUNK_BYTES = 40_000;
/** 画布硬预算（video `CANVAS_NODE_LIMIT` / `CANVAS_EDGE_LIMIT`）。 */
export const CANVAS_COLLAB_MAX_NODES = 500;
export const CANVAS_COLLAB_MAX_EDGES = 2_000;

export interface CanvasCollabNode extends Record<string, unknown> {
  nodeId: string;
}
export interface CanvasCollabEdge extends Record<string, unknown> {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
}
export interface CanvasCollabGraph {
  nodes: CanvasCollabNode[];
  edges: CanvasCollabEdge[];
}

export interface CanvasCollabEntityPatch {
  id: string;
  /** 新增或改过的字段（新实体 = 全部字段）。 */
  set: Record<string, unknown>;
  /** 被删掉的字段名。 */
  unset: string[];
}
export interface CanvasCollabPatch {
  nodes: { upsert: CanvasCollabEntityPatch[]; remove: string[] };
  edges: { upsert: CanvasCollabEntityPatch[]; remove: string[] };
}

export type CanvasCollabPayload =
  | {
      schema: typeof CANVAS_COLLAB_SCHEMA;
      op: "patch";
      /** 保存者的画布应用远端改动后要把自己标成「有改动待保存」；非保存者不管这个值。 */
      markDirty: boolean;
      nodes: { upsert: CanvasCollabEntityPatch[]; remove: string[] };
      edges: { upsert: CanvasCollabEntityPatch[]; remove: string[] };
    }
  | {
      schema: typeof CANVAS_COLLAB_SCHEMA;
      op: "control";
      readOnly: boolean;
      canSave: boolean;
      /** 刚当上保存者且还有没存的改动：画布把自己标成待保存。 */
      flush: boolean;
    };

const NODE_ID_MAX = 256;

/** 键排序、丢 undefined：同样的内容永远得到同样的 JSON（两端 `toEntities` 比对靠它，顺序不同会互相反复推送）。 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      const entry = value[key];
      if (entry !== undefined) out[key] = canonical(entry);
    }
    return out;
  }
  return value;
}

const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= NODE_ID_MAX;

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** 画布的图 → 协同实体。节点 `n:<nodeId>`、连线 `e:<edgeId>`；`order` 按键排序（不同客户端的数组顺序不同，不能参与比对）。 */
export function canvasGraphToEntities(graph: CanvasCollabGraph): EntityDoc {
  const entities: Record<string, Record<string, unknown>> = {};
  for (const node of graph.nodes ?? []) {
    if (!isRecord(node) || !validId(node.nodeId)) continue;
    const { nodeId, ...fields } = node;
    entities[`${NODE}${nodeId}`] = canonical(fields) as Record<string, unknown>;
  }
  for (const edge of graph.edges ?? []) {
    if (!isRecord(edge) || !validId(edge.edgeId)) continue;
    const { edgeId, ...fields } = edge;
    entities[`${EDGE}${edgeId}`] = canonical(fields) as Record<string, unknown>;
  }
  const keys = Object.keys(entities);
  const order = [...keys.filter((k) => k.startsWith(NODE)).sort(), ...keys.filter((k) => k.startsWith(EDGE)).sort()];
  // 实体表也按 order 重建：JSON 字符串比对（外壳的 stableKey）看键顺序，插入顺序不能漏进去。
  const sorted: Record<string, Record<string, unknown>> = {};
  for (const key of order) sorted[key] = entities[key]!;
  return { order, entities: sorted, meta: {} };
}

/** 协同实体 → 画布的图；连到已被删掉的节点上的线随节点一起消失。 */
export function canvasGraphFromEntities(
  input: { order: string[]; entities: Record<string, Record<string, unknown>>; meta?: Record<string, unknown> },
  _prev: CanvasCollabGraph | null,
): CanvasCollabGraph {
  const nodes: CanvasCollabNode[] = [];
  const edges: CanvasCollabEdge[] = [];
  const seen = new Set<string>();
  for (const key of input.order) {
    if (seen.has(key)) continue;
    seen.add(key);
    const entity = input.entities[key];
    if (!isRecord(entity)) continue;
    if (key.startsWith(NODE)) {
      const nodeId = key.slice(NODE.length);
      if (validId(nodeId)) nodes.push({ ...(canonical(entity) as object), nodeId } as CanvasCollabNode);
    } else if (key.startsWith(EDGE)) {
      const edgeId = key.slice(EDGE.length);
      if (!validId(edgeId) || !validId(entity.sourceNodeId) || !validId(entity.targetNodeId)) continue;
      edges.push({ ...(canonical(entity) as object), edgeId } as CanvasCollabEdge);
    }
  }
  const ids = new Set(nodes.map((node) => node.nodeId));
  return { nodes, edges: edges.filter((edge) => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId)) };
}

function entityMap<T extends Record<string, unknown>>(items: T[], idField: string): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const id = item[idField];
    if (!validId(id)) continue;
    const { [idField]: _ignored, ...fields } = item;
    out.set(id, canonical(fields) as Record<string, unknown>);
  }
  return out;
}

function diffEntities(
  before: Map<string, Record<string, unknown>>,
  after: Map<string, Record<string, unknown>>,
): { upsert: CanvasCollabEntityPatch[]; remove: string[] } {
  const upsert: CanvasCollabEntityPatch[] = [];
  const remove: string[] = [];
  for (const [id, fields] of after) {
    const old = before.get(id);
    if (!old) {
      upsert.push({ id, set: fields, unset: [] });
      continue;
    }
    const set: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(fields)) {
      if (!(name in old) || !sameJson(old[name], value)) set[name] = value;
    }
    const unset = Object.keys(old).filter((name) => !(name in fields));
    if (Object.keys(set).length || unset.length) upsert.push({ id, set, unset });
  }
  for (const id of before.keys()) if (!after.has(id)) remove.push(id);
  return { upsert, remove };
}

/** 画布此刻的图 → 应该变成的图：按字段的差异补丁（同一节点别人改的字段不会把你正在改的字段冲掉）。 */
export function canvasGraphDiff(prev: CanvasCollabGraph | null, next: CanvasCollabGraph): CanvasCollabPatch {
  return {
    nodes: diffEntities(entityMap(prev?.nodes ?? [], "nodeId"), entityMap(next.nodes, "nodeId")),
    edges: diffEntities(entityMap(prev?.edges ?? [], "edgeId"), entityMap(next.edges, "edgeId")),
  };
}

export function canvasPatchIsEmpty(patch: CanvasCollabPatch): boolean {
  return !patch.nodes.upsert.length && !patch.nodes.remove.length && !patch.edges.upsert.length && !patch.edges.remove.length;
}

const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
const byteLength = (text: string): number => (encoder ? encoder.encode(text).byteLength : text.length * 3);

/**
 * 补丁 → 一串载荷，每块 JSON 不超过 `maxBytes`。顺序固定：先增改节点、再增改连线、再删连线、最后删节点，
 * 所以任何一块单独落地都不会留下指向不存在节点的线。单个实体超限时先去掉它的 `asset`（素材记录最大），
 * 仍超限就丢掉并计入 `skipped`（外壳提示「有 n 处太大没同步」）。
 */
export function canvasPatchToPayloads(
  patch: CanvasCollabPatch,
  options: { markDirty?: boolean; maxBytes?: number } = {},
): { payloads: CanvasCollabPayload[]; skipped: number } {
  const maxBytes = options.maxBytes ?? CANVAS_COLLAB_CHUNK_BYTES;
  const markDirty = options.markDirty !== false;
  type Item =
    | { to: "nodes" | "edges"; kind: "upsert"; value: CanvasCollabEntityPatch }
    | { to: "nodes" | "edges"; kind: "remove"; value: string };
  const items: Item[] = [
    ...patch.nodes.upsert.map((value): Item => ({ to: "nodes", kind: "upsert", value })),
    ...patch.edges.upsert.map((value): Item => ({ to: "edges", kind: "upsert", value })),
    ...patch.edges.remove.map((value): Item => ({ to: "edges", kind: "remove", value })),
    ...patch.nodes.remove.map((value): Item => ({ to: "nodes", kind: "remove", value })),
  ];
  const empty = (): Extract<CanvasCollabPayload, { op: "patch" }> => ({
    schema: CANVAS_COLLAB_SCHEMA,
    op: "patch",
    markDirty,
    nodes: { upsert: [], remove: [] },
    edges: { upsert: [], remove: [] },
  });
  const payloads: CanvasCollabPayload[] = [];
  let current = empty();
  let used = byteLength(JSON.stringify(current));
  let skipped = 0;
  const flush = () => {
    if (current.nodes.upsert.length || current.nodes.remove.length || current.edges.upsert.length || current.edges.remove.length) {
      payloads.push(current);
    }
    current = empty();
    used = byteLength(JSON.stringify(current));
  };
  for (const item of items) {
    let value = item.value;
    let size = byteLength(JSON.stringify(value)) + 1;
    if (size > maxBytes && item.kind === "upsert" && "asset" in (value as CanvasCollabEntityPatch).set) {
      const { asset: _asset, ...rest } = (value as CanvasCollabEntityPatch).set;
      value = { ...(value as CanvasCollabEntityPatch), set: rest };
      size = byteLength(JSON.stringify(value)) + 1;
    }
    if (size > maxBytes) {
      skipped += 1;
      continue;
    }
    if (used + size > maxBytes) flush();
    if (item.kind === "upsert") current[item.to].upsert.push(value as CanvasCollabEntityPatch);
    else current[item.to].remove.push(value as string);
    used += size;
  }
  flush();
  return { payloads, skipped };
}

export function canvasControlPayload(state: { readOnly: boolean; canSave: boolean; flush?: boolean }): CanvasCollabPayload {
  return { schema: CANVAS_COLLAB_SCHEMA, op: "control", readOnly: state.readOnly, canSave: state.canSave, flush: Boolean(state.flush) };
}

export interface CanvasCaptureResult {
  /** 画布已经把工程载入完（还没载入时给的是默认空图，不能拿来比对或推送）。 */
  loaded: boolean;
  graph: CanvasCollabGraph;
  revision: number;
}

/** 画布 `recovery-snapshot` 里的载荷 → 图。不是这套协议的载荷（旧画布 / 别的东西）返回 null。 */
export function parseCanvasCapture(snapshot: unknown): CanvasCaptureResult | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.payload)) return null;
  const payload = snapshot.payload;
  if (payload.schema !== CANVAS_COLLAB_SCHEMA || payload.op !== "state" || typeof payload.loaded !== "boolean") return null;
  if (!Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) return null;
  if (payload.nodes.length > CANVAS_COLLAB_MAX_NODES || payload.edges.length > CANVAS_COLLAB_MAX_EDGES) return null;
  const nodes: CanvasCollabNode[] = [];
  for (const raw of payload.nodes) {
    if (!isRecord(raw) || !validId(raw.nodeId)) return null;
    nodes.push(raw as CanvasCollabNode);
  }
  const edges: CanvasCollabEdge[] = [];
  for (const raw of payload.edges) {
    if (!isRecord(raw) || !validId(raw.edgeId) || !validId(raw.sourceNodeId) || !validId(raw.targetNodeId)) return null;
    edges.push(raw as CanvasCollabEdge);
  }
  const revision = typeof snapshot.revision === "number" && Number.isSafeInteger(snapshot.revision) ? snapshot.revision : 0;
  return { loaded: payload.loaded, graph: canonicalGraph({ nodes, edges }), revision };
}

function canonicalGraph(graph: CanvasCollabGraph): CanvasCollabGraph {
  return { nodes: graph.nodes.map((n) => canonical(n) as CanvasCollabNode), edges: graph.edges.map((e) => canonical(e) as CanvasCollabEdge) };
}

export function canvasGraphEquals(a: CanvasCollabGraph | null, b: CanvasCollabGraph | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(canvasGraphToEntities(a)) === JSON.stringify(canvasGraphToEntities(b));
}

/**
 * 某个版本的画布工程 JSON（`oceanleo.video.project.v2`：`versions[headVersionId].graph`）→ 图。
 * 不是这种工程返回 null。节点用到的素材记录一并带上（`asset` 字段），对方才画得出来。
 */
export function canvasGraphFromProjectJson(json: unknown): CanvasCollabGraph | null {
  if (!isRecord(json) || !isRecord(json.versions) || typeof json.headVersionId !== "string") return null;
  const head = json.versions[json.headVersionId];
  if (!isRecord(head) || !isRecord(head.graph) || !Array.isArray(head.graph.nodes) || !Array.isArray(head.graph.edges)) return null;
  const assets = isRecord(json.assets) ? json.assets : {};
  const nodes: CanvasCollabNode[] = [];
  for (const raw of head.graph.nodes) {
    if (!isRecord(raw) || !validId(raw.nodeId)) continue;
    const asset = typeof raw.assetId === "string" && isRecord(assets[raw.assetId]) ? assets[raw.assetId] : undefined;
    nodes.push((asset ? { ...raw, asset } : { ...raw }) as CanvasCollabNode);
  }
  const edges: CanvasCollabEdge[] = [];
  for (const raw of head.graph.edges) {
    if (isRecord(raw) && validId(raw.edgeId) && validId(raw.sourceNodeId) && validId(raw.targetNodeId)) edges.push({ ...raw } as CanvasCollabEdge);
  }
  return canvasGraphFromEntities(canvasGraphToEntities({ nodes, edges }), null);
}

/**
 * 外壳该告诉画布什么：`null` = 不用说（协同没开，画布保持默认：能改、自己存）。
 * 房间还在连（或还没建出来）时先让画布只读、不保存——否则查看者在连上之前就能改到东西，
 * 非保存者也会在知道自己是谁之前把版本存出去。连上 / 被拒 / 离线之后按房间给的结论走。
 */
export function canvasControlState(input: {
  expectRoom: boolean;
  status: string | null;
  readOnly: boolean;
  saveGate: boolean;
}): { readOnly: boolean; canSave: boolean } | null {
  if (!input.expectRoom) return null;
  const settled = input.status === "synced" || input.status === "denied" || input.status === "disabled" || input.status === "offline";
  if (!settled) return { readOnly: true, canSave: false };
  return { readOnly: input.readOnly, canSave: input.saveGate };
}

// ============================================================================
// 外壳 ↔ 画布的收发状态机（无 React，可单测）。
//
// 三件事：
//  1) 抓取：一次只在途一个；抓回来时若期间有补丁入队（或还在发送），这份就是旧的，丢掉，不当作「本端状态」。
//  2) 补丁/控制消息排队：画布的 `recovery-restore` 一次只处理一条（外壳组件只发当前的 recoveryRestore），
//     收到 `recovery-result` 才发下一条。
//  3) 基线：画布此刻被认为持有的图；远端新状态与基线求字段差异，只发差异。
// ============================================================================

export type CanvasCaptureOutcome =
  | { kind: "ignored" }
  /** 画布回了别的格式（旧画布不认协同）。 */
  | { kind: "legacy" }
  /** 画布回了失败（没载入好等）。 */
  | { kind: "failed" }
  /** 期间有补丁入队：这份是旧的。 */
  | { kind: "stale" }
  | { kind: "notLoaded" }
  | { kind: "state"; graph: CanvasCollabGraph };

export interface CanvasRestoreItem {
  recoveryId: string;
  snapshot: { revision: number; payload: CanvasCollabPayload };
}

export class CanvasCollabLink {
  baseline: CanvasCollabGraph | null = null;
  /** 因单个实体太大而没能同步的个数（累计）。 */
  skipped = 0;
  /** 画布拒收 / 应用失败的消息条数（累计）。 */
  failures = 0;
  private generation = 0;
  private seq = 0;
  private inflight: { id: string; generation: number } | null = null;
  private queue: CanvasRestoreItem[] = [];

  private readonly prefix: string;

  constructor(prefix = "canvas-collab") {
    this.prefix = prefix;
  }

  private nextId(kind: string): string {
    this.seq += 1;
    return `${this.prefix}-${kind}-${this.seq}`;
  }

  /** 排队中或发送中的消息数。 */
  get pending(): number {
    return this.queue.length;
  }

  /** 要抓一次画布：返回请求号；已有一个在途返回 null（调用方稍后再试）。 */
  beginCapture(): string | null {
    if (this.inflight) return null;
    const id = this.nextId("cap");
    this.inflight = { id, generation: this.generation };
    return id;
  }

  /** 当前在途的抓取（用于超时判断）。 */
  get capturing(): boolean {
    return this.inflight !== null;
  }

  /** 放弃在途的抓取（超时）。 */
  abandonCapture(): void {
    this.inflight = null;
  }

  receiveCapture(result: { recoveryId: string; ok: boolean; snapshot?: unknown }): CanvasCaptureOutcome {
    if (!this.inflight || this.inflight.id !== result.recoveryId) return { kind: "ignored" };
    const issued = this.inflight.generation;
    this.inflight = null;
    if (!result.ok) return { kind: "failed" };
    const parsed = parseCanvasCapture(result.snapshot);
    if (!parsed) return { kind: "legacy" };
    if (issued !== this.generation || this.queue.length > 0) return { kind: "stale" };
    if (!parsed.loaded) return { kind: "notLoaded" };
    this.baseline = parsed.graph;
    return { kind: "state", graph: parsed.graph };
  }

  private enqueue(payload: CanvasCollabPayload): void {
    this.queue.push({ recoveryId: this.nextId("rst"), snapshot: { revision: this.seq, payload } });
  }

  /** 房间里的新状态 → 与基线求字段差异 → 分块入队。返回入队的消息条数。 */
  applyRemote(state: CanvasCollabGraph, options: { markDirty?: boolean } = {}): number {
    const patch = canvasGraphDiff(this.baseline, state);
    this.baseline = state;
    if (canvasPatchIsEmpty(patch)) return 0;
    const { payloads, skipped } = canvasPatchToPayloads(patch, { markDirty: options.markDirty !== false });
    this.skipped += skipped;
    for (const payload of payloads) this.enqueue(payload);
    if (payloads.length > 0) this.generation += 1;
    return payloads.length;
  }

  /** 排一条控制消息（只读 / 保存闸 / 立刻保存）。不改图，所以不让在途的抓取作废。 */
  sendControl(state: { readOnly: boolean; canSave: boolean; flush?: boolean }): void {
    this.enqueue(canvasControlPayload(state));
  }

  /** 此刻该交给画布的那一条（没有就是 null）。 */
  head(): CanvasRestoreItem | null {
    return this.queue[0] ?? null;
  }

  /** 画布回了 `recovery-result`。返回这条是不是队首、成没成功。 */
  receiveRestoreResult(result: { recoveryId: string; ok: boolean }): { matched: boolean; ok: boolean; drained: boolean } {
    const head = this.queue[0];
    if (!head || head.recoveryId !== result.recoveryId) return { matched: false, ok: false, drained: false };
    this.queue.shift();
    if (!result.ok) this.failures += 1;
    return { matched: true, ok: result.ok, drained: this.queue.length === 0 };
  }

  /** 画布换了一次（iframe 重载）：基线、队列、在途抓取全部作废。 */
  reset(): void {
    this.baseline = null;
    this.queue = [];
    this.inflight = null;
    this.generation += 1;
  }
}
