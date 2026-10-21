import {
  CANVAS_COLLAB_SCHEMA,
  canvasGraphEquals,
  type CanvasCollabGraph,
  type CanvasCollabPayload,
} from "../collab/adapters/workflow";
import { VIDEO_CANVAS_NODE_KINDS, type VideoCanvasNodeKind } from "./video-canvas-schema";

export const WORKFLOW_NATIVE_AGENT_WRITE_PROTOCOL = 1 as const;
export const WORKFLOW_NATIVE_AGENT_NODE_KINDS = [
  "text",
  "image",
  "video",
  "audio",
  "script",
  "model",
  "subtitle",
  "composite",
  "delivery",
  "director",
  "storyboard",
  "timeline",
] as const;

export type WorkflowNativeAgentNodeKind =
  (typeof WORKFLOW_NATIVE_AGENT_NODE_KINDS)[number];

export interface WorkflowAgentAddNodeParams {
  kind: string;
  label: string;
}

export interface WorkflowNativeAgentWriteRequest {
  recoveryId: string;
  targetKey: string;
  bridgeEpoch: number;
  nodeId: string;
  expectedNativeRevision: number;
  expectedGraph: CanvasCollabGraph;
  snapshot: {
    /** Legacy transport sequence only; never used as a CAS value. */
    revision: number;
    expectedNativeRevision: number;
    payload: CanvasCollabPayload;
  };
}

export type WorkflowAgentWriteResult =
  | { ok: true; revision: number }
  | { ok: false; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSafeRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function workflowNativeWriteCapability(
  snapshot: unknown,
): { supported: true; revision: number } | { supported: false } {
  if (!isRecord(snapshot) || !isRecord(snapshot.payload)) {
    return { supported: false };
  }
  const payload = snapshot.payload;
  if (
    payload.schema !== CANVAS_COLLAB_SCHEMA ||
    payload.op !== "state" ||
    payload.loaded !== true ||
    payload.agentWriteProtocol !== WORKFLOW_NATIVE_AGENT_WRITE_PROTOCOL ||
    !isSafeRevision(snapshot.revision)
  ) {
    return { supported: false };
  }
  return { supported: true, revision: snapshot.revision };
}

function normalizeAddNodeParams(
  params: Record<string, unknown>,
  allowedKinds: readonly string[],
): { ok: true; kind: string; label: string } | { ok: false; error: string } {
  const unexpected = Object.keys(params).filter(
    (key) => key !== "kind" && key !== "label",
  );
  if (unexpected.length) {
    return {
      ok: false,
      error: `加节点只接受 kind、label 参数；不认识「${unexpected[0]}」。`,
    };
  }
  if (typeof params.kind !== "string" || !allowedKinds.includes(params.kind)) {
    return { ok: false, error: "请从当前画布支持的节点类型中选择 kind。" };
  }
  if (typeof params.label !== "string") {
    return { ok: false, error: "加节点需要一个 label 名称。" };
  }
  const label = params.label.trim();
  if (!label || label.length > 80) {
    return { ok: false, error: "节点名称不能为空，且最多 80 个字符。" };
  }
  return { ok: true, kind: params.kind, label };
}

export function validateLocalWorkflowAddNodeParams(
  params: Record<string, unknown>,
):
  | { ok: true; kind: VideoCanvasNodeKind; label: string }
  | { ok: false; error: string } {
  const normalized = normalizeAddNodeParams(
    params,
    VIDEO_CANVAS_NODE_KINDS,
  );
  if (!normalized.ok) return normalized;
  return {
    ok: true,
    kind: normalized.kind as VideoCanvasNodeKind,
    label: normalized.label,
  };
}

function positionForNextNode(graph: CanvasCollabGraph): { x: number; y: number } {
  const positions = graph.nodes.flatMap((node) =>
    isRecord(node.position) &&
    typeof node.position.x === "number" &&
    Number.isFinite(node.position.x) &&
    typeof node.position.y === "number" &&
    Number.isFinite(node.position.y)
      ? [{ x: node.position.x, y: node.position.y }]
      : [],
  );
  for (let index = 0; index < 500; index += 1) {
    const point = {
      x: 120 + (index % 6) * 260,
      y: 120 + Math.floor(index / 6) * 180,
    };
    if (
      positions.every(
        (other) => Math.abs(other.x - point.x) >= 180 || Math.abs(other.y - point.y) >= 110,
      )
    ) {
      return point;
    }
  }
  return { x: 120, y: 120 };
}

export function prepareWorkflowNativeAddNode(input: {
  graph: CanvasCollabGraph;
  params: Record<string, unknown>;
  nodeId: string;
  recoveryId: string;
  transportRevision: number;
  expectedNativeRevision: number;
  targetKey: string;
  bridgeEpoch: number;
}):
  | { ok: true; request: WorkflowNativeAgentWriteRequest; message: string }
  | { ok: false; error: string } {
  const normalized = normalizeAddNodeParams(
    input.params,
    WORKFLOW_NATIVE_AGENT_NODE_KINDS,
  );
  if (!normalized.ok) return normalized;
  if (input.graph.nodes.length >= 500) {
    return { ok: false, error: "工作流节点已达到 500 个上限，不能再加节点。" };
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(input.nodeId) ||
    input.graph.nodes.some((node) => node.nodeId === input.nodeId)
  ) {
    return { ok: false, error: "新节点身份无效或已存在；没有发送到画布。" };
  }
  if (
    !input.recoveryId ||
    input.recoveryId.length > 128 ||
    !isSafeRevision(input.transportRevision) ||
    !isSafeRevision(input.expectedNativeRevision) ||
    !Number.isSafeInteger(input.bridgeEpoch) ||
    input.bridgeEpoch < 0 ||
    !input.targetKey
  ) {
    return { ok: false, error: "工作流原生写入目标或版本号无效。" };
  }

  const node = {
    nodeId: input.nodeId,
    kind: normalized.kind,
    title: normalized.label,
    position: positionForNextNode(input.graph),
    localEditRecipe: [],
  };
  const payload: CanvasCollabPayload = {
    schema: CANVAS_COLLAB_SCHEMA,
    op: "patch",
    markDirty: true,
    nodes: {
      upsert: [
        {
          id: node.nodeId,
          set: {
            kind: node.kind,
            title: node.title,
            position: node.position,
            localEditRecipe: node.localEditRecipe,
          },
          unset: [],
        },
      ],
      remove: [],
    },
    edges: { upsert: [], remove: [] },
  };
  const expectedGraph: CanvasCollabGraph = {
    nodes: [...input.graph.nodes, node],
    edges: input.graph.edges,
  };
  return {
    ok: true,
    message: `已在当前工作流画布中加入「${normalized.label}」节点。`,
    request: {
      recoveryId: input.recoveryId,
      targetKey: input.targetKey,
      bridgeEpoch: input.bridgeEpoch,
      nodeId: node.nodeId,
      expectedNativeRevision: input.expectedNativeRevision,
      expectedGraph,
      snapshot: {
        revision: input.transportRevision,
        expectedNativeRevision: input.expectedNativeRevision,
        payload,
      },
    },
  };
}

export function matchWorkflowNativeWriteAck(
  request: WorkflowNativeAgentWriteRequest,
  result: {
    recoveryId: string;
    ok: boolean;
    revision?: unknown;
    expectedNativeRevision?: unknown;
  },
  activeTargetKey: string,
  activeBridgeEpoch: number,
): WorkflowAgentWriteResult {
  if (
    result.recoveryId !== request.recoveryId ||
    activeTargetKey !== request.targetKey ||
    activeBridgeEpoch !== request.bridgeEpoch
  ) {
    return { ok: false, message: "工作流文件或画布实例已切换；原生写入回执作废。" };
  }
  if (!result.ok) {
    return { ok: false, message: "当前工作流画布拒绝了这次修改；没有报告成功。" };
  }
  if (result.expectedNativeRevision !== request.expectedNativeRevision) {
    return {
      ok: false,
      message: "画布没有证明它执行了原生版本比较；可能是旧版画布，修改未确认。",
    };
  }
  if (
    !isSafeRevision(result.revision) ||
    result.revision !== request.expectedNativeRevision + 1
  ) {
    return {
      ok: false,
      message: "工作流版本在提交期间发生变化；原生写入没有通过版本确认。",
    };
  }
  return { ok: true, revision: result.revision };
}

export function verifyWorkflowNativeWriteCapture(input: {
  request: WorkflowNativeAgentWriteRequest;
  snapshot: unknown;
  graph: CanvasCollabGraph;
  acknowledgedRevision: number;
  activeTargetKey: string;
  activeBridgeEpoch: number;
}): boolean {
  const capability = workflowNativeWriteCapability(input.snapshot);
  return Boolean(
    input.activeTargetKey === input.request.targetKey &&
      input.activeBridgeEpoch === input.request.bridgeEpoch &&
      capability.supported &&
      capability.revision === input.acknowledgedRevision &&
      canvasGraphEquals(input.request.expectedGraph, input.graph),
  );
}
