/**
 * 视频画布的 v2 工程文档（`oceanleo.video.project.v2`）——本地 xyflow 画布直接编辑它。
 *
 * 库里在用的视频画布全部是这个格式（2026-10-23 实测 96/96），所以画布不再把它投影成
 * 只读的 v1 图，而是：
 * - 解析时只校验结构（schema、head 版本、节点/连线身份与坐标），**未知字段原样保留**；
 * - 编辑只改 head 版本的 `graph.nodes` / `graph.edges`，其余（scenes、shots、assets、
 *   lineage、operationReceipts……）一个字节都不动；节点 kind 也原样保留
 *   （官方模板的 `prompt` / `generate` 不会被改写成 `script` / `video`）；
 * - 每个操作返回新对象，旧对象可直接进撤销栈。
 */

export const VIDEO_PROJECT_V2_SCHEMA = "oceanleo.video.project.v2";
export const VIDEO_PROJECT_V2_MEDIA_TYPE = "application/json";
export const VIDEO_DOC_NODE_LIMIT = 500;
export const VIDEO_DOC_EDGE_LIMIT = 2_000;
export const VIDEO_DOC_COORDINATE_LIMIT = 20_000;

type Rec = Record<string, unknown>;

export interface VideoDocPosition {
  x: number;
  y: number;
}

export interface VideoDocNode extends Rec {
  nodeId: string;
  kind: string;
  title: string;
  position: VideoDocPosition;
  params?: Rec;
  assetId?: string;
}

export interface VideoDocEdge extends Rec {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface VideoDocVersion extends Rec {
  graph: Rec & { nodes: VideoDocNode[]; edges: VideoDocEdge[] };
}

export interface VideoProjectDoc extends Rec {
  schema: typeof VIDEO_PROJECT_V2_SCHEMA;
  schemaVersion: 2;
  headVersionId: string;
  versions: Record<string, VideoDocVersion>;
  assets: Record<string, Rec>;
}

export type VideoDocParse =
  | { ok: true; doc: VideoProjectDoc }
  | { ok: false; error: string };

function record(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Rec)
    : null;
}

function idText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Is this parsed JSON a v2 video project at all (before structural checks)? */
export function looksLikeVideoProjectDoc(value: unknown): boolean {
  return record(value)?.schema === VIDEO_PROJECT_V2_SCHEMA;
}

/**
 * Structural check only. Fails closed with a sentence the stage can show; the
 * editor never falls back to a blank graph over a stored project it cannot read.
 */
export function parseVideoProjectDoc(value: unknown): VideoDocParse {
  const project = record(value);
  if (!project || project.schema !== VIDEO_PROJECT_V2_SCHEMA) {
    return { ok: false, error: "这不是视频画布工程文件" };
  }
  if (project.schemaVersion !== 2) {
    return { ok: false, error: "视频画布工程的版本号不受支持" };
  }
  const versions = record(project.versions);
  const headId = project.headVersionId;
  if (!versions || !idText(headId) || !Object.hasOwn(versions, headId)) {
    return { ok: false, error: "视频画布工程缺少当前版本" };
  }
  const head = record(versions[headId]);
  const graph = record(head?.graph);
  if (!head || !graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return { ok: false, error: "视频画布工程的节点图不完整" };
  }
  if (graph.nodes.length > VIDEO_DOC_NODE_LIMIT || graph.edges.length > VIDEO_DOC_EDGE_LIMIT) {
    return { ok: false, error: "视频画布工程的节点或连线超过上限" };
  }
  if (project.assets !== undefined && !record(project.assets)) {
    return { ok: false, error: "视频画布工程的素材表无效" };
  }
  const nodeIds = new Set<string>();
  for (const candidate of graph.nodes) {
    const node = record(candidate);
    const position = record(node?.position);
    if (
      !node || !idText(node.nodeId) || nodeIds.has(node.nodeId) ||
      typeof node.kind !== "string" || !position ||
      !finite(position.x) || !finite(position.y)
    ) {
      return { ok: false, error: "视频画布工程里有身份或坐标无效的节点" };
    }
    nodeIds.add(node.nodeId);
  }
  const edgeIds = new Set<string>();
  for (const candidate of graph.edges) {
    const edge = record(candidate);
    if (
      !edge || !idText(edge.edgeId) || edgeIds.has(edge.edgeId) ||
      !idText(edge.sourceNodeId) || !idText(edge.targetNodeId) ||
      !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)
    ) {
      return { ok: false, error: "视频画布工程里有悬空或重复的连线" };
    }
    edgeIds.add(edge.edgeId);
  }
  // structuredClone: the editor owns its copy; the loader's object is never mutated.
  const doc = structuredClone(project) as VideoProjectDoc;
  if (!record(doc.assets)) doc.assets = {};
  for (const node of doc.versions[headId].graph.nodes) {
    if (typeof node.title !== "string") node.title = "";
  }
  return { ok: true, doc };
}

export function parseVideoProjectText(text: string): VideoDocParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "视频画布工程不是有效的 JSON" };
  }
  return parseVideoProjectDoc(parsed);
}

export function videoDocHead(doc: VideoProjectDoc): VideoDocVersion {
  return doc.versions[doc.headVersionId];
}

export function videoDocGraph(doc: VideoProjectDoc): {
  nodes: VideoDocNode[];
  edges: VideoDocEdge[];
} {
  const graph = videoDocHead(doc).graph;
  return { nodes: graph.nodes, edges: graph.edges };
}

function withGraph(
  doc: VideoProjectDoc,
  nodes: VideoDocNode[],
  edges: VideoDocEdge[],
): VideoProjectDoc {
  const head = videoDocHead(doc);
  return {
    ...doc,
    versions: {
      ...doc.versions,
      [doc.headVersionId]: { ...head, graph: { ...head.graph, nodes, edges } },
    },
  };
}

let fallbackSequence = 0;

/** Same id shape as the v2 core (`<prefix>_<uuid>`), unique within `taken`. */
export function videoDocNewId(prefix: string, taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const uuid = globalThis.crypto?.randomUUID?.();
    fallbackSequence += 1;
    const id = uuid
      ? `${prefix}_${uuid}`
      : `${prefix}_${Date.now().toString(36)}_${fallbackSequence.toString(36)}`;
    if (!taken.has(id)) return id;
  }
  throw new Error("无法生成新的节点身份");
}

function clampCoordinate(value: number): number {
  return Math.max(
    -VIDEO_DOC_COORDINATE_LIMIT,
    Math.min(VIDEO_DOC_COORDINATE_LIMIT, Math.round(value)),
  );
}

export function moveVideoDocNodes(
  doc: VideoProjectDoc,
  moves: ReadonlyArray<{ id: string; x: number; y: number }>,
): VideoProjectDoc {
  const byId = new Map(
    moves
      .filter((move) => finite(move.x) && finite(move.y))
      .map((move) => [move.id, move]),
  );
  if (!byId.size) return doc;
  const { nodes, edges } = videoDocGraph(doc);
  let changed = false;
  const next = nodes.map((node) => {
    const move = byId.get(node.nodeId);
    if (!move) return node;
    const position = { x: clampCoordinate(move.x), y: clampCoordinate(move.y) };
    if (position.x === node.position.x && position.y === node.position.y) return node;
    changed = true;
    return { ...node, position };
  });
  return changed ? withGraph(doc, next, edges) : doc;
}

export interface VideoDocConnection {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** Adds one edge; refuses self-loops, unknown endpoints and exact duplicates. */
export function connectVideoDocNodes(
  doc: VideoProjectDoc,
  connection: VideoDocConnection,
): VideoProjectDoc | null {
  const { nodes, edges } = videoDocGraph(doc);
  const { source, target } = connection;
  if (!source || !target || source === target) return null;
  const ids = new Set(nodes.map((node) => node.nodeId));
  if (!ids.has(source) || !ids.has(target)) return null;
  if (edges.length >= VIDEO_DOC_EDGE_LIMIT) return null;
  const sourceHandle = connection.sourceHandle || null;
  const targetHandle = connection.targetHandle || null;
  if (
    edges.some(
      (edge) =>
        edge.sourceNodeId === source &&
        edge.targetNodeId === target &&
        (edge.sourceHandle || null) === sourceHandle &&
        (edge.targetHandle || null) === targetHandle,
    )
  ) {
    return null;
  }
  const edge: VideoDocEdge = {
    edgeId: videoDocNewId("edge", new Set(edges.map((item) => item.edgeId))),
    sourceNodeId: source,
    targetNodeId: target,
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(targetHandle ? { targetHandle } : {}),
  };
  return withGraph(doc, nodes, [...edges, edge]);
}

/** Removing a node also removes every edge that touches it (no dangling lines). */
export function removeVideoDocElements(
  doc: VideoProjectDoc,
  nodeIds: readonly string[],
  edgeIds: readonly string[],
): VideoProjectDoc {
  const goneNodes = new Set(nodeIds);
  const goneEdges = new Set(edgeIds);
  const { nodes, edges } = videoDocGraph(doc);
  const nextNodes = nodes.filter((node) => !goneNodes.has(node.nodeId));
  const nextEdges = edges.filter(
    (edge) =>
      !goneEdges.has(edge.edgeId) &&
      !goneNodes.has(edge.sourceNodeId) &&
      !goneNodes.has(edge.targetNodeId),
  );
  if (nextNodes.length === nodes.length && nextEdges.length === edges.length) return doc;
  return withGraph(doc, nextNodes, nextEdges);
}

export const VIDEO_DOC_DUPLICATE_OFFSET = 40;

/** Copies nodes (and the edges among them) next to the originals. */
export function duplicateVideoDocNodes(
  doc: VideoProjectDoc,
  nodeIds: readonly string[],
): { doc: VideoProjectDoc; ids: string[] } {
  const { nodes, edges } = videoDocGraph(doc);
  const picked = nodes.filter((node) => nodeIds.includes(node.nodeId));
  if (!picked.length || nodes.length + picked.length > VIDEO_DOC_NODE_LIMIT) {
    return { doc, ids: [] };
  }
  const takenNodes = new Set(nodes.map((node) => node.nodeId));
  const mapping = new Map<string, string>();
  const copies = picked.map((node) => {
    const id = videoDocNewId("node", takenNodes);
    takenNodes.add(id);
    mapping.set(node.nodeId, id);
    const copy: VideoDocNode = {
      ...structuredClone(node),
      nodeId: id,
      position: {
        x: clampCoordinate(node.position.x + VIDEO_DOC_DUPLICATE_OFFSET),
        y: clampCoordinate(node.position.y + VIDEO_DOC_DUPLICATE_OFFSET),
      },
    };
    // The exact imported v1 source belongs to the original node only.
    delete copy.legacySourceNode;
    return copy;
  });
  const takenEdges = new Set(edges.map((edge) => edge.edgeId));
  const innerEdges = edges
    .filter((edge) => mapping.has(edge.sourceNodeId) && mapping.has(edge.targetNodeId))
    .map((edge) => {
      const edgeId = videoDocNewId("edge", takenEdges);
      takenEdges.add(edgeId);
      const copy: VideoDocEdge = {
        ...structuredClone(edge),
        edgeId,
        sourceNodeId: mapping.get(edge.sourceNodeId)!,
        targetNodeId: mapping.get(edge.targetNodeId)!,
      };
      delete copy.legacySourceEdge;
      return copy;
    });
  return {
    doc: withGraph(doc, [...nodes, ...copies], [...edges, ...innerEdges]),
    ids: copies.map((node) => node.nodeId),
  };
}

export function addVideoDocNode(
  doc: VideoProjectDoc,
  // `Omit` on an index-signature interface drops the named keys, so spell them out.
  node: Rec & {
    nodeId?: string;
    kind: string;
    title: string;
    position: VideoDocPosition;
  },
): { doc: VideoProjectDoc; id: string } | null {
  const { nodes, edges } = videoDocGraph(doc);
  if (nodes.length >= VIDEO_DOC_NODE_LIMIT) return null;
  const taken = new Set(nodes.map((item) => item.nodeId));
  const id = node.nodeId && !taken.has(node.nodeId)
    ? node.nodeId
    : videoDocNewId("node", taken);
  const created: VideoDocNode = {
    ...node,
    kind: node.kind,
    title: node.title,
    nodeId: id,
    position: {
      x: clampCoordinate(node.position.x),
      y: clampCoordinate(node.position.y),
    },
  };
  return { doc: withGraph(doc, [...nodes, created], edges), id };
}

export function patchVideoDocNode(
  doc: VideoProjectDoc,
  nodeId: string,
  patch: (node: VideoDocNode) => VideoDocNode,
): VideoProjectDoc {
  const { nodes, edges } = videoDocGraph(doc);
  let changed = false;
  const next = nodes.map((node) => {
    if (node.nodeId !== nodeId) return node;
    const patched = patch(node);
    if (patched !== node) changed = true;
    return patched;
  });
  return changed ? withGraph(doc, next, edges) : doc;
}

export function addVideoDocAsset(
  doc: VideoProjectDoc,
  asset: Rec & { assetId: string },
): VideoProjectDoc {
  return { ...doc, assets: { ...doc.assets, [asset.assetId]: asset } };
}

export function serializeVideoProjectDoc(doc: VideoProjectDoc): string {
  return JSON.stringify(doc);
}

/** A fresh, empty v2 project with the same top-level shape the core writes. */
export function createVideoProjectDoc(title: string, now = new Date()): VideoProjectDoc {
  const taken = new Set<string>();
  const versionId = videoDocNewId("projectVersion", taken);
  return {
    schema: VIDEO_PROJECT_V2_SCHEMA,
    schemaVersion: 2,
    projectId: videoDocNewId("project", taken),
    title,
    headVersionId: versionId,
    versions: {
      [versionId]: {
        versionId,
        revision: 1,
        createdAt: now.toISOString(),
        reason: "project.created",
        graph: { nodes: [], edges: [] },
        scenes: [],
        shots: [],
        storyboards: [],
        takes: [],
        timelines: [],
        clips: [],
        cameras: [],
      },
    },
    assets: {},
    derivatives: {},
    lineage: [],
    operationReceipts: {},
  };
}
