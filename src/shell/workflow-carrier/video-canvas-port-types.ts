/**
 * workflow.md §3.4 端口类型相容表。
 *
 * 表是**有向**的:行是输出端口 `dataType`,列是输入端口 `dataType`。
 * `image → video` 相容(静帧可作视频输入);`number → text` 相容(数值可格式化为文本);
 * 其余跨类 MUST 判不相容并使产物 `invalid`(§3.2 `ir-validated → invalid`)。
 */

import {
  VIDEO_CANVAS_PORT_DATA_TYPES,
  type VideoCanvasEdge,
  type VideoCanvasGraph,
  type VideoCanvasPortDataType,
} from "./video-canvas-schema";

type CompatibilityRow = Readonly<Record<VideoCanvasPortDataType, boolean>>;

function row(compatible: readonly VideoCanvasPortDataType[]): CompatibilityRow {
  const entries = VIDEO_CANVAS_PORT_DATA_TYPES.map((type) => [
    type,
    compatible.includes(type),
  ]);
  return Object.freeze(Object.fromEntries(entries)) as CompatibilityRow;
}

/** §3.4 的表格逐行落地。行 = 输出类型,列 = 输入类型。 */
export const PORT_TYPE_COMPATIBILITY: Readonly<
  Record<VideoCanvasPortDataType, CompatibilityRow>
> = Object.freeze({
  video: row(["video", "any"]),
  audio: row(["audio", "any"]),
  image: row(["video", "image", "any"]),
  text: row(["text", "any"]),
  number: row(["text", "number", "any"]),
  any: row(["video", "audio", "image", "text", "number", "any"]),
});

export function isPortDataType(value: unknown): value is VideoCanvasPortDataType {
  return (
    typeof value === "string" &&
    (VIDEO_CANVAS_PORT_DATA_TYPES as readonly string[]).includes(value)
  );
}

/**
 * 相容判定。未知类型一律不相容(fail-closed)—— 新增 `dataType` 枚举成员时
 * MUST 同步 `PORT_TYPE_COMPATIBILITY`,否则这里直接拒。
 */
export function arePortTypesCompatible(
  outputType: unknown,
  inputType: unknown,
): boolean {
  if (!isPortDataType(outputType) || !isPortDataType(inputType)) return false;
  return PORT_TYPE_COMPATIBILITY[outputType][inputType];
}

export interface PortResolution {
  nodeId: string;
  port: string;
  dataType: VideoCanvasPortDataType | null;
}

export type EdgeLinkRejection =
  | { code: "unknown-from-node"; edgeId: string; nodeId: string }
  | { code: "unknown-to-node"; edgeId: string; nodeId: string }
  | { code: "unknown-from-port"; edgeId: string; nodeId: string; port: string }
  | { code: "unknown-to-port"; edgeId: string; nodeId: string; port: string }
  | {
      code: "incompatible-port-types";
      edgeId: string;
      from: PortResolution;
      to: PortResolution;
    };

export interface EdgeLinkReport {
  /** 全部边的四个端点可解析且端口类型相容(§3.2 `ir-validated → graph-linked`)。 */
  ok: boolean;
  rejections: EdgeLinkRejection[];
  /** §8.2「端口类型不相容的边数 = 0」判据的实测值。 */
  incompatibleEdgeCount: number;
}

function portOf(
  ports: readonly { name: string; dataType: VideoCanvasPortDataType }[] | undefined,
  name: string,
): VideoCanvasPortDataType | null {
  const match = ports?.find((port) => port.name === name);
  return match ? match.dataType : null;
}

/**
 * 逐边解析 §2.4 SC 1.3.1 要求显式声明的四个端点,并按 §3.4 判相容。
 * 端点缺失与类型不相容都是受控拒绝,MUST NOT 静默丢弃该边(§6 F5)。
 */
export function linkGraphEdges(graph: VideoCanvasGraph): EdgeLinkReport {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const rejections: EdgeLinkRejection[] = [];
  let incompatibleEdgeCount = 0;

  for (const edge of graph.edges as readonly VideoCanvasEdge[]) {
    const fromNode = nodes.get(edge.fromNodeId);
    const toNode = nodes.get(edge.toNodeId);
    if (!fromNode) {
      rejections.push({
        code: "unknown-from-node",
        edgeId: edge.id,
        nodeId: edge.fromNodeId,
      });
      continue;
    }
    if (!toNode) {
      rejections.push({
        code: "unknown-to-node",
        edgeId: edge.id,
        nodeId: edge.toNodeId,
      });
      continue;
    }
    const fromType = portOf(fromNode.ports.outputs, edge.fromPort);
    const toType = portOf(toNode.ports.inputs, edge.toPort);
    if (!fromType) {
      rejections.push({
        code: "unknown-from-port",
        edgeId: edge.id,
        nodeId: fromNode.id,
        port: edge.fromPort,
      });
      continue;
    }
    if (!toType) {
      rejections.push({
        code: "unknown-to-port",
        edgeId: edge.id,
        nodeId: toNode.id,
        port: edge.toPort,
      });
      continue;
    }
    if (!arePortTypesCompatible(fromType, toType)) {
      incompatibleEdgeCount += 1;
      rejections.push({
        code: "incompatible-port-types",
        edgeId: edge.id,
        from: { nodeId: fromNode.id, port: edge.fromPort, dataType: fromType },
        to: { nodeId: toNode.id, port: edge.toPort, dataType: toType },
      });
    }
  }

  return {
    ok: rejections.length === 0,
    rejections,
    incompatibleEdgeCount,
  };
}
