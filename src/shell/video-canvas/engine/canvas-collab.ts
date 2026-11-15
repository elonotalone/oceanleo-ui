/**
 * 流程图画布的多人同改（work-chat 第二轮 F06）——画布这一侧的纯逻辑。
 *
 * 通道：外壳（oceanleo-ui 的 VideoCanvasStage）是协同客户端，只用 v1 协议里已有的四条消息跟画布交换，
 * 不加新指令、不加新来源：
 *   外壳 → 画布  recovery-capture   「把你现在的图给我」
 *   画布 → 外壳  recovery-snapshot  载荷 {op:"state"}：图（节点、连线、节点用到的素材记录）
 *   外壳 → 画布  recovery-restore   载荷 {op:"patch"}：别人的改动（按字段的补丁）；{op:"control"}：只读 / 要不要自己保存
 *   画布 → 外壳  recovery-result    这块补丁落地了没有
 *
 * 外壳那一侧的同名常量与函数在 oceanleo-ui `src/shell/collab/adapters/workflow.ts`，两边必须逐字一致。
 * 这个文件不碰 DOM、不碰 postMessage，所以能直接在 node 里测。
 */
import {
  CANVAS_EDGE_LIMIT,
  CANVAS_NODE_LIMIT,
  advanceProject,
  projectHead,
  parseVideoProject,
  type CanvasEdgeDefinition,
  type CanvasNodeDefinition,
  type CanvasNodeKind,
  type ProjectAsset,
  type VideoProject,
} from "./project-model";

export const CANVAS_COLLAB_SCHEMA = "oceanleo.canvas.collab.v1";
export const COLLAB_REASON = "collab.remote";
const ID_MAX = 256;
const ASSET_MAX_BYTES = 20_000;
const FIELD_NAME_MAX = 64;

const NODE_KINDS: readonly string[] = [
  "text", "image", "video", "audio", "script", "model", "subtitle", "composite", "delivery", "director", "storyboard", "timeline",
];
const RATIOS: readonly string[] = ["16:9", "9:16", "1:1"];
const NODE_FIELDS = [
  "kind", "title", "position", "assetId", "prompt", "text", "model", "ratio", "durationSeconds",
  "sceneId", "shotId", "cameraId", "localEditRecipe", "asset",
] as const;
const EDGE_FIELDS = ["sourceNodeId", "targetNodeId", "sourceHandle", "targetHandle"] as const;
/** 删字段时不许删的（缺了节点就不成立）。 */
const REQUIRED_NODE_FIELDS = new Set(["kind", "title", "position", "localEditRecipe"]);
const REQUIRED_EDGE_FIELDS = new Set(["sourceNodeId", "targetNodeId"]);

type Json = Record<string, unknown>;

export interface CollabEntityPatch {
  id: string;
  set: Json;
  unset: string[];
}
export interface CollabPatchPayload {
  schema: typeof CANVAS_COLLAB_SCHEMA;
  op: "patch";
  markDirty: boolean;
  nodes: { upsert: CollabEntityPatch[]; remove: string[] };
  edges: { upsert: CollabEntityPatch[]; remove: string[] };
}
export interface CollabControlPayload {
  schema: typeof CANVAS_COLLAB_SCHEMA;
  op: "control";
  readOnly: boolean;
  canSave: boolean;
  flush: boolean;
}
export type CollabPayload = CollabPatchPayload | CollabControlPayload;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= ID_MAX;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ---------------------------------------------------------------- 抓图（画布 → 外壳）

export interface CollabStatePayload {
  schema: typeof CANVAS_COLLAB_SCHEMA;
  op: "state";
  /** Host may offer guarded Agent writes only when this capability is present. */
  agentWriteProtocol: 1;
  loaded: boolean;
  versionId: string;
  nodes: Json[];
  edges: Json[];
}

/**
 * 头版本的图。节点用到的素材记录（`project.assets[assetId]`）挂在节点的 `asset` 字段上，
 * 对方才能把素材画出来；还没载入完（`loaded=false`）时给空图，外壳不会拿它比对或推送。
 */
export function captureCollabState(project: VideoProject, loaded: boolean): CollabStatePayload {
  const head = project.versions[project.headVersionId];
  if (!loaded || !head) {
    return { schema: CANVAS_COLLAB_SCHEMA, op: "state", agentWriteProtocol: 1, loaded: false, versionId: head?.versionId ?? "", nodes: [], edges: [] };
  }
  const nodes = head.graph.nodes.map((node) => {
    const asset = node.assetId ? project.assets[node.assetId] : undefined;
    return (asset ? { ...node, asset } : { ...node }) as unknown as Json;
  });
  const edges = head.graph.edges.map((edge) => ({ ...edge }) as unknown as Json);
  // 外壳要求载荷是纯 JSON（没有 undefined）。
  return jsonClone({ schema: CANVAS_COLLAB_SCHEMA, op: "state" as const, agentWriteProtocol: 1 as const, loaded: true, versionId: head.versionId, nodes, edges });
}

// ---------------------------------------------------------------- 解析外壳发来的载荷

function parsePatchList(value: unknown, maxItems: number): CollabEntityPatch[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const out: CollabEntityPatch[] = [];
  for (const item of value) {
    if (!isRecord(item) || !validId(item.id) || !isRecord(item.set) || !Array.isArray(item.unset)) return null;
    if (item.unset.length > 64 || !item.unset.every((name) => typeof name === "string" && name.length <= FIELD_NAME_MAX)) return null;
    out.push({ id: item.id, set: item.set, unset: item.unset as string[] });
  }
  return out;
}

function parseIdList(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  return value.every(validId) ? (value as string[]) : null;
}

/** 外壳发来的 recovery-restore 载荷。不是这套协议、或哪一处形状不对，整条丢掉（返回 null）。 */
export function parseCollabPayload(value: unknown): CollabPayload | null {
  if (!isRecord(value) || value.schema !== CANVAS_COLLAB_SCHEMA) return null;
  if (value.op === "control") {
    if (typeof value.readOnly !== "boolean" || typeof value.canSave !== "boolean" || typeof value.flush !== "boolean") return null;
    return { schema: CANVAS_COLLAB_SCHEMA, op: "control", readOnly: value.readOnly, canSave: value.canSave, flush: value.flush };
  }
  if (value.op !== "patch" || typeof value.markDirty !== "boolean") return null;
  if (!isRecord(value.nodes) || !isRecord(value.edges)) return null;
  const nodeUpsert = parsePatchList(value.nodes.upsert, CANVAS_NODE_LIMIT);
  const edgeUpsert = parsePatchList(value.edges.upsert, CANVAS_EDGE_LIMIT);
  const nodeRemove = parseIdList(value.nodes.remove, CANVAS_NODE_LIMIT);
  const edgeRemove = parseIdList(value.edges.remove, CANVAS_EDGE_LIMIT);
  if (!nodeUpsert || !edgeUpsert || !nodeRemove || !edgeRemove) return null;
  return {
    schema: CANVAS_COLLAB_SCHEMA,
    op: "patch",
    markDirty: value.markDirty,
    nodes: { upsert: nodeUpsert, remove: nodeRemove },
    edges: { upsert: edgeUpsert, remove: edgeRemove },
  };
}

// ---------------------------------------------------------------- 落地（补丁 → 工程）

function cleanRecipe(value: unknown): CanvasNodeDefinition["localEditRecipe"] | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  const out: CanvasNodeDefinition["localEditRecipe"] = [];
  for (const step of value) {
    if (!isRecord(step) || typeof step.operation !== "string" || !isRecord(step.parameters)) return null;
    const parameters: Record<string, number | string | boolean> = {};
    for (const [name, v] of Object.entries(step.parameters)) {
      if (name.length > FIELD_NAME_MAX || (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean")) return null;
      if (typeof v === "number" && !Number.isFinite(v)) return null;
      parameters[name] = v;
    }
    out.push({ operation: step.operation as never, parameters });
  }
  return out;
}

/** 只放行已知字段、类型对得上的值；不认识的字段、类型不对的字段整个丢掉（不让别人往工程里塞东西）。 */
function cleanNodeFields(set: Json): Json {
  const out: Json = {};
  for (const name of NODE_FIELDS) {
    if (!(name in set)) continue;
    const v = set[name];
    switch (name) {
      case "kind":
        if (typeof v === "string" && NODE_KINDS.includes(v)) out.kind = v;
        break;
      case "title":
      case "prompt":
      case "text":
      case "model":
        if (typeof v === "string" && v.length <= 20_000) out[name] = v;
        break;
      case "position":
        if (isRecord(v) && finite(v.x) && finite(v.y)) out.position = { x: v.x, y: v.y };
        break;
      case "assetId":
      case "sceneId":
      case "shotId":
      case "cameraId":
        if (validId(v)) out[name] = v;
        break;
      case "ratio":
        if (typeof v === "string" && RATIOS.includes(v)) out.ratio = v;
        break;
      case "durationSeconds":
        if (finite(v) && v >= 0 && v < 86_400) out.durationSeconds = v;
        break;
      case "localEditRecipe": {
        const recipe = cleanRecipe(v);
        if (recipe) out.localEditRecipe = recipe;
        break;
      }
      case "asset":
        if (isRecord(v) && JSON.stringify(v).length <= ASSET_MAX_BYTES) out.asset = jsonClone(v);
        break;
    }
  }
  return out;
}

function cleanEdgeFields(set: Json): Json {
  const out: Json = {};
  for (const name of EDGE_FIELDS) {
    if (!(name in set)) continue;
    const v = set[name];
    if (name === "sourceNodeId" || name === "targetNodeId") {
      if (validId(v)) out[name] = v;
    } else if (v === null || (typeof v === "string" && v.length <= ID_MAX)) {
      out[name] = v;
    }
  }
  return out;
}

export interface ApplyCollabResult {
  project: VideoProject;
  /** 工程的图有没有真的变。 */
  changed: boolean;
  /** 没落地的条目（形状不对、引用不存在……）：每条一句话，给日志用，不给用户看。 */
  rejected: string[];
}

/**
 * 把别人的补丁落到工程的头版本上，得到一个新头版本（原因 `collab.remote`）。
 * - 同一节点只改补丁里列出的字段，其余字段（包括你刚改还没被抓到的）原样保留；
 * - 删节点时连到它的线一起删；补丁里连到不存在节点的线不落地；
 * - 节点引用的场景 / 镜头 / 机位在本地不存在 → 去掉这个引用；素材记录随节点带来，本地没有才登记（不覆盖已有）；
 * - 落地后整份工程过一遍 `parseVideoProject`，不合格就整块不落地（不会留下半成品）。
 */
export function applyCollabPatch(project: VideoProject, patch: CollabPatchPayload): ApplyCollabResult {
  const rejected: string[] = [];
  const head = project.versions[project.headVersionId];
  if (!head) return { project, changed: false, rejected: ["工程没有头版本"] };

  const nodes = new Map<string, CanvasNodeDefinition>(head.graph.nodes.map((n) => [n.nodeId, { ...n }]));
  const edges = new Map<string, CanvasEdgeDefinition>(head.graph.edges.map((e) => [e.edgeId, { ...e }]));
  const assets: Record<string, ProjectAsset> = { ...project.assets };
  const known = (list: Array<Record<string, string>>, key: string) => new Set(list.map((item) => item[key]));
  const scenes = known((head.scenes || []) as unknown as Array<Record<string, string>>, "sceneId");
  const shots = known((head.shots || []) as unknown as Array<Record<string, string>>, "shotId");
  const cameras = known((head.cameras || []) as unknown as Array<Record<string, string>>, "cameraId");

  for (const entry of patch.nodes.upsert) {
    const existing = nodes.get(entry.id);
    const fields = cleanNodeFields(entry.set);
    const merged: Json = { ...(existing ?? {}), ...fields, nodeId: entry.id };
    for (const name of entry.unset) {
      if ((NODE_FIELDS as readonly string[]).includes(name) && !REQUIRED_NODE_FIELDS.has(name)) delete merged[name];
    }
    // 素材记录：本地没有才登记；登记不了（形状不对 / id 对不上）就去掉 assetId，节点照样在。
    const asset = fields.asset;
    delete merged.asset;
    if (isRecord(asset) && typeof merged.assetId === "string" && asset.assetId === merged.assetId && !assets[merged.assetId]) {
      assets[merged.assetId] = jsonClone(asset) as unknown as ProjectAsset;
    }
    if (typeof merged.assetId === "string" && !assets[merged.assetId]) delete merged.assetId;
    if (typeof merged.sceneId === "string" && !scenes.has(merged.sceneId)) delete merged.sceneId;
    if (typeof merged.shotId === "string" && !shots.has(merged.shotId)) delete merged.shotId;
    if (typeof merged.cameraId === "string" && !cameras.has(merged.cameraId)) delete merged.cameraId;
    if (!Array.isArray(merged.localEditRecipe)) merged.localEditRecipe = [];
    if (typeof merged.kind !== "string" || typeof merged.title !== "string" || !isRecord(merged.position)) {
      rejected.push(`节点 ${entry.id} 缺少必要字段，没有落地`);
      continue;
    }
    nodes.set(entry.id, merged as unknown as CanvasNodeDefinition);
  }

  for (const entry of patch.edges.upsert) {
    const existing = edges.get(entry.id);
    const merged: Json = { ...(existing ?? {}), ...cleanEdgeFields(entry.set), edgeId: entry.id };
    for (const name of entry.unset) {
      if ((EDGE_FIELDS as readonly string[]).includes(name) && !REQUIRED_EDGE_FIELDS.has(name)) delete merged[name];
    }
    if (!validId(merged.sourceNodeId) || !validId(merged.targetNodeId) || merged.sourceNodeId === merged.targetNodeId) {
      rejected.push(`连线 ${entry.id} 两端不完整，没有落地`);
      continue;
    }
    edges.set(entry.id, merged as unknown as CanvasEdgeDefinition);
  }

  for (const id of patch.edges.remove) edges.delete(id);
  for (const id of patch.nodes.remove) nodes.delete(id);

  // 悬空的线（删了节点、或补丁里连到不存在的节点）一律不留。
  for (const [id, edge] of [...edges]) {
    if (!nodes.has(edge.sourceNodeId) || !nodes.has(edge.targetNodeId)) {
      edges.delete(id);
      if (!head.graph.edges.some((e) => e.edgeId === id)) rejected.push(`连线 ${id} 连到不存在的节点，没有落地`);
    }
  }

  // 是否真的变了：和头版本逐项比（同样的补丁再来一次、或补丁里的东西全被丢掉，都不产生新版本）。
  const nextNodes = [...nodes.values()];
  const nextEdges = [...edges.values()];
  const graphChanged =
    JSON.stringify(nextNodes) !== JSON.stringify(head.graph.nodes) ||
    JSON.stringify(nextEdges) !== JSON.stringify(head.graph.edges);
  if (!graphChanged && Object.keys(assets).length === Object.keys(project.assets).length) {
    return { project, changed: false, rejected };
  }
  if (nodes.size > CANVAS_NODE_LIMIT || edges.size > CANVAS_EDGE_LIMIT) {
    return { project, changed: false, rejected: [...rejected, `超过画布上限（${CANVAS_NODE_LIMIT} 个节点 / ${CANVAS_EDGE_LIMIT} 条线）`] };
  }

  try {
    const next = advanceProject({ ...project, assets }, COLLAB_REASON, (draft) => {
      draft.graph = { ...draft.graph, nodes: nextNodes, edges: nextEdges };
    });
    parseVideoProject(jsonClone(next));
    return { project: next, changed: true, rejected };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "工程校验没通过";
    return { project, changed: false, rejected: [...rejected, reason] };
  }
}

// ---------------------------------------------------------------- 应答外壳（纯函数，hook 只管收发）

/** 画布工程状态的写入口（由 `use-canvas-workflow.ts` 交出，见 F06 补丁）。 */
export interface CanvasCollabPort {
  getProject(): VideoProject;
  /** 工程是否已经从宿主载入（没载入前的默认图不能当作「画布的图」）。 */
  isLoaded(): boolean;
  /**
   * 在最新的工程上执行 `fn`，把返回的新工程换进画布（不动选中、视图、正在拖的节点）；
   * `fn` 返回 null = 不改。`markDirty` 为 true 且本端是保存者时画布把自己标成待保存。
   */
  applyRemote(fn: (current: VideoProject) => VideoProject | null, markDirty: boolean): boolean;
  setPolicy(policy: { readOnly: boolean; canSave: boolean }): void;
  /** 保存者交接后还有没存的改动：标成待保存（只在 canSave 时生效）。 */
  markDirty(): void;
}

export interface CollabReply {
  type: "recovery-snapshot" | "recovery-result";
  recoveryId: string;
  ok: boolean;
  message: string;
  /** 有几条补丁内容没能落地（给外壳 / 日志看，不是错误）。 */
  rejected?: number;
  severity?: "warning";
  code?: string;
  retryable?: boolean;
  revision?: number;
  /** Present only when a guarded native revision comparison was actually executed. */
  expectedNativeRevision?: number;
  snapshot?: { revision: number; payload: unknown };
}

export function answerCollabCapture(recoveryId: string, port: CanvasCollabPort): CollabReply {
  const project = port.getProject();
  const loaded = port.isLoaded();
  const head = projectHead(project);
  return {
    type: "recovery-snapshot",
    recoveryId,
    ok: true,
    message: "",
    snapshot: { revision: loaded ? head?.revision ?? 0 : 0, payload: captureCollabState(project, loaded) },
  };
}

export function answerCollabRestore(
  recoveryId: string,
  snapshot: {
    revision: number | string;
    payload: Record<string, unknown>;
    expectedNativeRevision?: number;
  },
  port: CanvasCollabPort,
): CollabReply {
  const revision = typeof snapshot.revision === "number" ? snapshot.revision : undefined;
  const expectedNativeRevision = snapshot.expectedNativeRevision;
  if (
    expectedNativeRevision !== undefined &&
    (!Number.isSafeInteger(expectedNativeRevision) || expectedNativeRevision < 0)
  ) {
    return {
      type: "recovery-result",
      recoveryId,
      ok: false,
      message: "invalid expected native revision",
      severity: "warning",
      code: "collab-native-revision-invalid",
      retryable: false,
    };
  }
  if (expectedNativeRevision === Number.MAX_SAFE_INTEGER) {
    return {
      type: "recovery-result",
      recoveryId,
      ok: false,
      message: "native project revision cannot advance safely",
      severity: "warning",
      code: "collab-native-revision-exhausted",
      retryable: false,
    };
  }
  const payload = parseCollabPayload(snapshot.payload);
  if (!payload) {
    return { type: "recovery-result", recoveryId, ok: false, message: "unrecognized collab payload", severity: "warning", code: "collab-payload-invalid", retryable: false, ...(revision === undefined ? {} : { revision }) };
  }
  if (payload.op === "control") {
    if (expectedNativeRevision !== undefined) {
      return {
        type: "recovery-result",
        recoveryId,
        ok: false,
        message: "native revision guard is only supported for graph patches",
        severity: "warning",
        code: "collab-native-cas-op-invalid",
        retryable: false,
      };
    }
    port.setPolicy({ readOnly: payload.readOnly, canSave: payload.canSave });
    if (payload.flush && payload.canSave) port.markDirty();
    return { type: "recovery-result", recoveryId, ok: true, message: "", ...(revision === undefined ? {} : { revision }) };
  }
  if (!port.isLoaded()) {
    // 工程还没载入：补丁没有可落的地方。让外壳稍后重抓、重算（它发现差异会再发）。
    return { type: "recovery-result", recoveryId, ok: false, message: "project not loaded yet", severity: "warning", code: "collab-not-ready", retryable: true, ...(revision === undefined ? {} : { revision }) };
  }
  if (expectedNativeRevision !== undefined) {
    const currentProject = port.getProject();
    const currentHead = projectHead(currentProject);
    const currentRevision = currentHead?.revision;
    if (currentRevision !== expectedNativeRevision) {
      return {
        type: "recovery-result",
        recoveryId,
        ok: false,
        message: "native project revision changed before restore",
        severity: "warning",
        code: "collab-native-revision-conflict",
        retryable: true,
        ...(Number.isSafeInteger(currentRevision) && currentRevision! >= 0
          ? { revision: currentRevision, expectedNativeRevision }
          : { expectedNativeRevision }),
      };
    }
  }
  let rejected: string[] = [];
  let nativeCasConflict: number | undefined;
  let nativeCasRejected = false;
  port.applyRemote((current) => {
    if (expectedNativeRevision !== undefined) {
      const currentHead = projectHead(current);
      if (currentHead?.revision !== expectedNativeRevision) {
        nativeCasConflict = currentHead?.revision;
        return null;
      }
    }
    const result = applyCollabPatch(current, payload);
    rejected = result.rejected;
    if (expectedNativeRevision !== undefined && (result.rejected.length > 0 || !result.changed)) {
      nativeCasRejected = true;
      return null;
    }
    return result.changed ? result.project : null;
  }, payload.markDirty);
  if (expectedNativeRevision !== undefined) {
    const resultingHead = port.getProject().versions[port.getProject().headVersionId];
    if (nativeCasConflict !== undefined) {
      return {
        type: "recovery-result",
        recoveryId,
        ok: false,
        message: "native project revision changed during restore",
        severity: "warning",
        code: "collab-native-revision-conflict",
        retryable: true,
        revision: nativeCasConflict,
        expectedNativeRevision,
      };
    }
    if (nativeCasRejected || resultingHead?.revision !== expectedNativeRevision + 1) {
      return {
        type: "recovery-result",
        recoveryId,
        ok: false,
        message: "native patch was not applied as one complete revision",
        severity: "warning",
        code: "collab-native-patch-not-applied",
        retryable: false,
        ...(Number.isSafeInteger(resultingHead?.revision)
          ? { revision: resultingHead.revision }
          : {}),
        expectedNativeRevision,
      };
    }
    return {
      type: "recovery-result",
      recoveryId,
      ok: true,
      message: "",
      revision: resultingHead.revision,
      expectedNativeRevision,
    };
  }
  return {
    type: "recovery-result",
    recoveryId,
    ok: true,
    message: "",
    rejected: rejected.length,
    ...(revision === undefined ? {} : { revision }),
  };
}
