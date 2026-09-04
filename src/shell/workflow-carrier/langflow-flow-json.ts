/**
 * `oceanleo.video-canvas.v1` 的节点图 ↔ Langflow flow JSON 双向转换（W15 判据 1 后半）。
 *
 * ## 为什么需要它
 *
 * 普通模式的画布是本仓自己的 React Flow（`@xyflow/react`，`workbench-routes.ts`
 * 把 `video-canvas` 路由到 video 站的 `/canvas-board`）。专业模式是 Langflow
 * （MIT，`flow.oceanleo.app`）。两边都是「节点 + 边」，但**结构事实源不同**：
 * 我们的节点有 10 种 `kind` 与 6 种端口数据类型（`video-canvas-schema.ts` C9/C15），
 * Langflow 的节点类型是它自己的 Python 组件类名。
 * 没有这一层，用户点进专业模式看到的会是一张空画布。
 *
 * ## 上游形状是实测来的，不是猜的
 *
 * `[实测 2026-09-04]` 取自 Langflow 上游
 * `src/backend/base/langflow/initial_setup/starter_projects/Basic Prompting.json`
 * （`last_tested_version: "1.8.0"`，6 节点 3 边）。两处**反直觉但必须逐字复刻**的细节：
 *
 * 1. `sourceHandle` / `targetHandle` 不是 JSON，是把 `"` 换成 `œ` 的伪 JSON 串；
 * 2. 同一份文件里**两种空白形态并存**——边 `id` 里嵌的是紧凑形态
 *    （`{œidœ:œXœ}`，前端 `JSON.stringify` 产出），而 `sourceHandle` 字段本身是带空格形态
 *    （`{œidœ: œXœ}`，后端 `json.dumps` 产出）。解码器两种都要认，编码器照上游各出各的。
 *
 * ## 许可
 *
 * **本文件零行 Langflow 代码。** Langflow 是 MIT，但这里只按它 flow JSON 的
 * *数据形状*写编解码，没有复制任何上游源码、函数名或独有实现
 * （`_COMMON.md` §10 第 1 条的隔离标准；Langflow 本身是 MIT，不是 AGPL，
 * 记这一笔是为了让 V4 的三路核有据可依）。
 *
 * ## 一条刻意的边界：不转时间线
 *
 * `VideoCanvasVersion` 除了 `graph` 还有 `timeline`（clips / fps / 画幅）。
 * **Langflow 里没有任何东西对应时间线**。硬塞会造出一份「看着像时间线、
 * 编回来对不上」的假事实源。所以本模块只转 `graph`：`timeline` 由宿主原样留在手里，
 * 取回时按 `fromLangflowFlow()` 给的新图重新挂。这是**缩小承诺并写明理由**，
 * 不是漏做（`_COMMON.md` §3 第 2 问）。
 */

import {
  VIDEO_CANVAS_CONSTANTS,
  VIDEO_CANVAS_NODE_KINDS,
  VIDEO_CANVAS_PORT_DATA_TYPES,
  type VideoCanvasEdge,
  type VideoCanvasGraph,
  type VideoCanvasNode,
  type VideoCanvasNodeKind,
  type VideoCanvasPort,
  type VideoCanvasPortDataType,
} from "./video-canvas-schema";
import { OCEANLEO_WORKFLOW_NODE_SOURCE } from "./oceanleo-workflow-node-source";

/** 上游实测过的 flow 版本；写进 `last_tested_version`，出处见文件头。 */
export const LANGFLOW_LAST_TESTED_VERSION = "1.8.0";

/**
 * 承载 OceanLeo 节点的 Langflow 组件类型名。
 *
 * 用**一个**自有类型而不是逐 kind 映射到 Langflow 内置组件，理由是内置组件的
 * `template` 由 Langflow 后端按 Python 类反射生成，我们伪造出来的那份一旦与
 * 上游版本对不上，用户在专业模式里点「运行」会收到一条看不懂的后端报错。
 * 一个自有类型至少让「这个节点来自 OceanLeo」这件事在两侧都显式可见。
 */
export const OCEANLEO_LANGFLOW_NODE_TYPE = "OceanLeoWorkflowNode";

/** 原节点整条存在这个 template 字段里；`fromLangflowFlow()` 靠它判定来源。 */
export const OCEANLEO_NODE_TEMPLATE_FIELD = "oceanleo_node";

/**
 * Langflow 执行面只认这一对口：组件的 `out` → 下游的 `upstream`。
 * 画布上的 fromPort/toPort 走 `data.oceanleo` 旁挂，不写进 handle。
 */
const LANGFLOW_EXECUTION_OUTPUT = "out";
const LANGFLOW_EXECUTION_INPUT = "upstream";
const LANGFLOW_EXECUTION_OUTPUT_TYPES = ["JSON"] as const;
const LANGFLOW_EXECUTION_INPUT_TYPES = ["Data", "JSON"] as const;

/** Langflow 里 `œ` 代替 `"`。上游前端解码就是把它换回来再 `JSON.parse`。 */
const HANDLE_QUOTE = "\u0153";

/**
 * 端口数据类型 → Langflow `output_types` / `inputTypes` 的字面量。
 *
 * 两侧用**同一张表**，所以我们自己产出的边在 Langflow 前端的类型校验里天然成立。
 * 刻意不把六种全压成 `Data`：压平之后 Langflow 会允许把音频接进图像口，
 * 而那条连线取回来在 `linkGraphEdges()` 里才会被拒——错误离用户按下鼠标的时刻太远。
 */
const PORT_TYPE_TO_LANGFLOW: Readonly<Record<VideoCanvasPortDataType, string>> =
  Object.freeze({
    video: "OceanLeoVideo",
    audio: "OceanLeoAudio",
    image: "OceanLeoImage",
    text: "Message",
    number: "OceanLeoNumber",
    any: "Data",
  });

const NODE_KIND_SET: ReadonlySet<string> = new Set(VIDEO_CANVAS_NODE_KINDS);
const PORT_DATA_TYPE_SET: ReadonlySet<string> = new Set(
  VIDEO_CANVAS_PORT_DATA_TYPES,
);

/** 节点在 Langflow 画布上的默认尺寸；与上游 `measured` 同量级。 */
const NODE_MEASURED = Object.freeze({ width: 320, height: 234 });

// ── Langflow flow JSON 的结构（只声明我们读写的字段）────────────────────────

export interface LangflowHandleSource {
  dataType: string;
  id: string;
  name: string;
  output_types: string[];
}

export interface LangflowHandleTarget {
  fieldName: string;
  id: string;
  inputTypes: string[];
  type: string;
}

export interface LangflowNode {
  id: string;
  type: "genericNode";
  position: { x: number; y: number };
  data: {
    id: string;
    type: string;
    node: {
      display_name: string;
      description: string;
      base_classes: string[];
      template: Record<string, unknown>;
      outputs: {
        name: string;
        display_name: string;
        types: string[];
        method: string;
      }[];
      documentation?: string;
    };
  };
  measured?: { width: number; height: number };
  selected?: boolean;
  dragging?: boolean;
}

export interface LangflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  data: {
    sourceHandle: LangflowHandleSource;
    targetHandle: LangflowHandleTarget;
    /**
     * 本仓自有的旁挂字段：Langflow 原样保存它不认识的键（`[实测]` 1.12.0 存取无损）。
     *
     * **端口名也存在这里，而不是只存在 handle 串里。** 理由是容器侧的 adapter shim
     * 为了让流程真的跑得起来，会按装在那台 Langflow 上的真组件描述符**重写 handle**
     * （见 `signals/W15-container.md`：不重写就报「Edge … has no matched type」）。
     * 只认 handle 的话，一次 rehydrate 就把端口名冲掉了，取回来的图会挂错线。
     */
    oceanleo?: {
      edgeId: string;
      fromPort: string;
      toPort: string;
      condition?: string;
    };
  };
  animated?: boolean;
  className?: string;
  selected?: boolean;
}

export interface LangflowFlow {
  id: string;
  name: string;
  description: string;
  data: {
    nodes: LangflowNode[];
    edges: LangflowEdge[];
    viewport: { x: number; y: number; zoom: number };
  };
  is_component: false;
  endpoint_name: string | null;
  last_tested_version: string;
  tags: string[];
}

// ── 失败码。每一条都要能对用户讲人话（`_COMMON.md` §10 第 6 条）─────────────

export type LangflowConvertErrorCode =
  | "langflow-flow-not-object"
  | "langflow-flow-missing-data"
  | "langflow-node-not-object"
  | "langflow-node-foreign"
  | "langflow-node-kind-unknown"
  | "langflow-node-payload-invalid"
  | "langflow-node-id-duplicated"
  | "langflow-handle-unparsable"
  | "langflow-edge-dangling"
  | "langflow-graph-too-large";

export interface LangflowConvertFailure {
  ok: false;
  code: LangflowConvertErrorCode;
  /** 给用户看的一句话，必须说清**为什么失败**与**他能做什么**。 */
  message: string;
  /** 出问题的那个节点/边的 id，能指就指。 */
  at?: string;
}

export interface LangflowExportSuccess {
  ok: true;
  flow: LangflowFlow;
}

export interface LangflowImportSuccess {
  ok: true;
  graph: VideoCanvasGraph;
  /** 非致命但用户该知道的事，例如「专业模式里新加的 3 个 Langflow 原生节点没有带回来」。 */
  warnings: string[];
}

// ── handle 编解码 ──────────────────────────────────────────────────────────

function stableStringify(value: Record<string, unknown>, spaced: boolean): string {
  const keys = Object.keys(value).sort();
  const parts = keys.map(
    (key) => `${JSON.stringify(key)}${spaced ? ": " : ":"}${JSON.stringify(value[key])}`,
  );
  return `{${parts.join(spaced ? ", " : ",")}}`;
}

/**
 * 编成 Langflow 的 handle 串。
 *
 * `spaced` 决定用哪一种空白形态：上游的 `sourceHandle` 字段是带空格的，
 * 而边 `id` 里嵌的是紧凑的（见文件头第 2 条实测）。两处都照上游出，
 * 因为 Langflow 前端在若干处**按字符串相等**比对 handle 与 id 的子串。
 */
export function encodeLangflowHandle(
  handle: Record<string, unknown>,
  spaced = true,
): string {
  return stableStringify(handle, spaced).split('"').join(HANDLE_QUOTE);
}

/** 解回对象。两种空白形态都认；不是合法 handle 就返回 `null`，**不抛**。 */
export function decodeLangflowHandle(
  handle: unknown,
): Record<string, unknown> | null {
  if (typeof handle !== "string" || !handle) return null;
  try {
    const parsed: unknown = JSON.parse(handle.split(HANDLE_QUOTE).join('"'));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function executionSourceHandle(langflowNodeId: string): LangflowHandleSource {
  return {
    dataType: OCEANLEO_LANGFLOW_NODE_TYPE,
    id: langflowNodeId,
    name: LANGFLOW_EXECUTION_OUTPUT,
    output_types: [...LANGFLOW_EXECUTION_OUTPUT_TYPES],
  };
}

function executionTargetHandle(langflowNodeId: string): LangflowHandleTarget {
  return {
    fieldName: LANGFLOW_EXECUTION_INPUT,
    id: langflowNodeId,
    inputTypes: [...LANGFLOW_EXECUTION_INPUT_TYPES],
    type: "other",
  };
}

// ── id 互译 ────────────────────────────────────────────────────────────────

/** OceanLeo 节点 id → Langflow 节点 id。前缀让「谁产的」在两侧都看得见。 */
export function toLangflowNodeId(nodeId: string): string {
  return `${OCEANLEO_LANGFLOW_NODE_TYPE}-${nodeId}`;
}

/** 反向。不是本仓产的节点返回 `null`（调用方据此判 foreign）。 */
export function fromLangflowNodeId(langflowNodeId: string): string | null {
  const prefix = `${OCEANLEO_LANGFLOW_NODE_TYPE}-`;
  if (!langflowNodeId.startsWith(prefix)) return null;
  const rest = langflowNodeId.slice(prefix.length);
  return rest || null;
}

// ── 导出：OceanLeo → Langflow ──────────────────────────────────────────────

function portsOf(node: VideoCanvasNode, side: "inputs" | "outputs"): VideoCanvasPort[] {
  const list = node.ports?.[side];
  return Array.isArray(list) ? list : [];
}

function oceanLeoNodePayload(node: VideoCanvasNode): Record<string, unknown> {
  return {
    id: node.id,
    kind: node.kind,
    ...(node.label === undefined ? {} : { label: node.label }),
    x: node.x,
    y: node.y,
    ...(node.params === undefined ? {} : { params: node.params }),
    ...(node.assetId === undefined ? {} : { assetId: node.assetId }),
    ports: {
      inputs: portsOf(node, "inputs"),
      outputs: portsOf(node, "outputs"),
    },
  };
}

function templateFieldFor(node: VideoCanvasNode): Record<string, unknown> {
  return {
    _type: "Component",
    // Langflow 1.12 `instantiate_class` 必 pop 这一项；缺了点运行就是 KeyError: code。
    code: {
      type: "code",
      required: true,
      show: true,
      name: "code",
      value: OCEANLEO_WORKFLOW_NODE_SOURCE,
      advanced: true,
      dynamic: true,
      multiline: true,
      list: false,
      password: false,
      load_from_db: false,
      fileTypes: [],
      file_path: "",
      placeholder: "",
      info: "",
    },
    [OCEANLEO_NODE_TEMPLATE_FIELD]: {
      advanced: false,
      display_name: "OceanLeo node",
      dynamic: false,
      info: "OceanLeo 节点图的原始节点（JSON）。改这里等于改流程，请用画布而不是手编。",
      list: false,
      name: OCEANLEO_NODE_TEMPLATE_FIELD,
      password: false,
      required: true,
      show: true,
      type: "str",
      // MessageTextInput 只收字符串。取回时 JSON.parse。
      value: JSON.stringify(oceanLeoNodePayload(node)),
    },
    upstream: {
      advanced: false,
      display_name: "Upstream",
      dynamic: false,
      info: "上游节点传下来的值。没有上游时留空。",
      list: true,
      name: LANGFLOW_EXECUTION_INPUT,
      required: false,
      show: true,
      type: "other",
      value: "",
      input_types: [...LANGFLOW_EXECUTION_INPUT_TYPES],
    },
    strict: {
      advanced: false,
      display_name: "Strict",
      dynamic: false,
      list: false,
      name: "strict",
      required: false,
      show: true,
      type: "bool",
      value: true,
    },
  };
}

function langflowNodeFor(node: VideoCanvasNode): LangflowNode {
  const langflowId = toLangflowNodeId(node.id);
  const outputs = [
    {
      name: LANGFLOW_EXECUTION_OUTPUT,
      display_name: "Node",
      types: [...LANGFLOW_EXECUTION_OUTPUT_TYPES],
      method: "build_node",
    },
  ];
  return {
    id: langflowId,
    type: "genericNode",
    position: { x: node.x, y: node.y },
    data: {
      id: langflowId,
      type: OCEANLEO_LANGFLOW_NODE_TYPE,
      node: {
        display_name: node.label || node.kind,
        description: `OceanLeo ${node.kind} 节点`,
        base_classes: [...LANGFLOW_EXECUTION_OUTPUT_TYPES],
        template: templateFieldFor(node),
        outputs,
        documentation: "",
      },
    },
    measured: { ...NODE_MEASURED },
    selected: false,
    dragging: false,
  };
}

function langflowEdgeFor(
  edge: VideoCanvasEdge,
  byId: ReadonlyMap<string, VideoCanvasNode>,
): LangflowEdge | LangflowConvertFailure {
  const from = byId.get(edge.fromNodeId);
  const to = byId.get(edge.toNodeId);
  if (!from || !to) {
    return {
      ok: false,
      code: "langflow-edge-dangling",
      at: edge.id,
      message: `连线「${edge.id}」的${from ? "终点" : "起点"}节点不在这张图里，没法转换。请先删掉这条连线。`,
    };
  }
  const outPort = portsOf(from, "outputs").find((port) => port.name === edge.fromPort);
  const inPort = portsOf(to, "inputs").find((port) => port.name === edge.toPort);
  if (!outPort || !inPort) {
    return {
      ok: false,
      code: "langflow-edge-dangling",
      at: edge.id,
      message: `连线「${edge.id}」接的${outPort ? "输入" : "输出"}端口「${outPort ? edge.toPort : edge.fromPort}」在节点上不存在，没法转换。`,
    };
  }
  const sourceId = toLangflowNodeId(edge.fromNodeId);
  const targetId = toLangflowNodeId(edge.toNodeId);
  const sourceHandle = executionSourceHandle(sourceId);
  const targetHandle = executionTargetHandle(targetId);
  return {
    // 紧凑形态嵌进 id、带空格形态放字段，逐字照上游（文件头实测第 2 条）。
    id: `reactflow__edge-${sourceId}${encodeLangflowHandle(
      sourceHandle as unknown as Record<string, unknown>,
      false,
    )}-${targetId}${encodeLangflowHandle(
      targetHandle as unknown as Record<string, unknown>,
      false,
    )}`,
    source: sourceId,
    target: targetId,
    sourceHandle: encodeLangflowHandle(
      sourceHandle as unknown as Record<string, unknown>,
    ),
    targetHandle: encodeLangflowHandle(
      targetHandle as unknown as Record<string, unknown>,
    ),
    data: {
      sourceHandle,
      targetHandle,
      oceanleo: {
        edgeId: edge.id,
        fromPort: outPort.name,
        toPort: inPort.name,
        ...(edge.condition === undefined ? {} : { condition: edge.condition }),
      },
    },
    animated: false,
    className: "",
    selected: false,
  };
}

/**
 * 把当前流程图导出成 Langflow flow JSON（判据 2 的「导入当前流程」那一半）。
 *
 * 超出 C2/C4 上限直接拒，并说清超了多少——这两条上限是规格里的，
 * 不是我随手定的（`video-canvas-schema.ts` §4）。
 */
export function toLangflowFlow(
  graph: VideoCanvasGraph,
  opts: { flowId: string; name: string; description?: string },
): LangflowExportSuccess | LangflowConvertFailure {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  if (
    nodes.length > VIDEO_CANVAS_CONSTANTS.C2_NODE_COUNT_MAX ||
    edges.length > VIDEO_CANVAS_CONSTANTS.C4_EDGE_COUNT_MAX
  ) {
    return {
      ok: false,
      code: "langflow-graph-too-large",
      message: `这张图有 ${nodes.length} 个节点、${edges.length} 条连线，超过上限（${VIDEO_CANVAS_CONSTANTS.C2_NODE_COUNT_MAX} / ${VIDEO_CANVAS_CONSTANTS.C4_EDGE_COUNT_MAX}），专业模式打不开。请先拆成几张图。`,
    };
  }
  const byId = new Map<string, VideoCanvasNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) {
      return {
        ok: false,
        code: "langflow-node-id-duplicated",
        at: node.id,
        message: `节点 id「${node.id}」在这张图里出现了不止一次，转换会把它们合成一个。请先改名。`,
      };
    }
    byId.set(node.id, node);
  }
  const langflowEdges: LangflowEdge[] = [];
  for (const edge of edges) {
    const converted = langflowEdgeFor(edge, byId);
    if ("ok" in converted) return converted;
    langflowEdges.push(converted);
  }
  return {
    ok: true,
    flow: {
      id: opts.flowId,
      name: opts.name,
      description: opts.description || "",
      data: {
        nodes: nodes.map(langflowNodeFor),
        edges: langflowEdges,
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      is_component: false,
      endpoint_name: null,
      last_tested_version: LANGFLOW_LAST_TESTED_VERSION,
      tags: [],
    },
  };
}

// ── 导入：Langflow → OceanLeo ─────────────────────────────────────────────

function readOceanLeoPayload(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const data = (node as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const inner = (data as { node?: unknown }).node;
  if (!inner || typeof inner !== "object") return null;
  const template = (inner as { template?: unknown }).template;
  if (!template || typeof template !== "object") return null;
  const field = (template as Record<string, unknown>)[
    OCEANLEO_NODE_TEMPLATE_FIELD
  ];
  if (!field || typeof field !== "object") return null;
  let value = (field as { value?: unknown }).value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parsePorts(value: unknown): VideoCanvasPort[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const out: VideoCanvasPort[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const name = record.name;
    const dataType = record.dataType;
    if (typeof name !== "string" || !name) return null;
    if (
      typeof dataType !== "string" ||
      !PORT_DATA_TYPE_SET.has(dataType)
    ) {
      return null;
    }
    out.push({
      name,
      dataType: dataType as VideoCanvasPortDataType,
      ...(record.required === undefined ? {} : { required: record.required === true }),
    });
  }
  return out;
}

function nodeFromPayload(
  payload: Record<string, unknown>,
  position: { x: number; y: number } | null,
): VideoCanvasNode | LangflowConvertFailure {
  const id = payload.id;
  const kind = payload.kind;
  if (typeof id !== "string" || !id) {
    return {
      ok: false,
      code: "langflow-node-payload-invalid",
      message: "专业模式带回来的节点里有一个没有 id，没法对回原来的流程。这次改动没有落地。",
    };
  }
  if (typeof kind !== "string" || !NODE_KIND_SET.has(kind)) {
    return {
      ok: false,
      code: "langflow-node-kind-unknown",
      at: id,
      message: `节点「${id}」的类型是「${String(kind)}」，不是这张画布认识的 ${VIDEO_CANVAS_NODE_KINDS.length} 种之一。这次改动没有落地。`,
    };
  }
  const inputs = parsePorts((payload.ports as Record<string, unknown> | undefined)?.inputs);
  const outputs = parsePorts((payload.ports as Record<string, unknown> | undefined)?.outputs);
  if (!inputs || !outputs) {
    return {
      ok: false,
      code: "langflow-node-payload-invalid",
      at: id,
      message: `节点「${id}」的端口描述在专业模式里被改坏了（端口要有 name 与合法 dataType）。这次改动没有落地。`,
    };
  }
  // 位置以 Langflow 画布上的真实位置为准——用户在专业模式里拖过节点，
  // 那次拖动就是他的意图；payload 里的 x/y 只是导出那一刻的快照。
  const x = position ? position.x : Number(payload.x);
  const y = position ? position.y : Number(payload.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return {
      ok: false,
      code: "langflow-node-payload-invalid",
      at: id,
      message: `节点「${id}」没有可用的坐标，取不回来。这次改动没有落地。`,
    };
  }
  return {
    id,
    kind: kind as VideoCanvasNodeKind,
    ...(typeof payload.label === "string" ? { label: payload.label } : {}),
    x,
    y,
    ...(payload.params && typeof payload.params === "object"
      ? { params: payload.params as Record<string, unknown> }
      : {}),
    ...(typeof payload.assetId === "string" ? { assetId: payload.assetId } : {}),
    ports: { inputs, outputs },
  };
}

/**
 * 把专业模式编辑后的 flow JSON 取回成本仓的节点图（判据 2 的「编辑后取回」）。
 *
 * **外来节点不静默丢弃。** 用户在 Langflow 里加一个真 Langflow 组件（比如
 * `OpenAIModel`）是完全合理的操作，但那个组件在我们的 10 种 kind 里没有对应物。
 * 静默丢掉 = 用户回到普通模式发现自己的活没了，且没有任何提示。
 * 这里的处置是：**图照常取回，外来节点与挂在它们身上的连线逐条列进 `warnings`**，
 * 让宿主把这句话原样显示给用户。真正会让整次转换失败的只有「本仓自己的节点坏了」。
 */
export function fromLangflowFlow(
  flow: unknown,
): LangflowImportSuccess | LangflowConvertFailure {
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) {
    return {
      ok: false,
      code: "langflow-flow-not-object",
      message: "专业模式回传的不是一份流程文件，没法取回。你的原流程没有被改动。",
    };
  }
  const data = (flow as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return {
      ok: false,
      code: "langflow-flow-missing-data",
      message: "专业模式回传的流程文件缺少 data 段（节点与连线都在这一段里）。你的原流程没有被改动。",
    };
  }
  const rawNodes = (data as { nodes?: unknown }).nodes;
  const rawEdges = (data as { edges?: unknown }).edges;
  if (!Array.isArray(rawNodes)) {
    return {
      ok: false,
      code: "langflow-flow-missing-data",
      message: "专业模式回传的流程文件里没有节点列表。你的原流程没有被改动。",
    };
  }
  const edgesIn: unknown[] = Array.isArray(rawEdges) ? rawEdges : [];
  if (
    rawNodes.length > VIDEO_CANVAS_CONSTANTS.C2_NODE_COUNT_MAX ||
    edgesIn.length > VIDEO_CANVAS_CONSTANTS.C4_EDGE_COUNT_MAX
  ) {
    return {
      ok: false,
      code: "langflow-graph-too-large",
      message: `专业模式里这张图长到了 ${rawNodes.length} 个节点、${edgesIn.length} 条连线，超过上限（${VIDEO_CANVAS_CONSTANTS.C2_NODE_COUNT_MAX} / ${VIDEO_CANVAS_CONSTANTS.C4_EDGE_COUNT_MAX}），取不回来。`,
    };
  }

  const warnings: string[] = [];
  const nodes: VideoCanvasNode[] = [];
  const seen = new Set<string>();
  const foreignLangflowIds = new Set<string>();
  const knownLangflowIds = new Set<string>();

  for (const raw of rawNodes) {
    if (!raw || typeof raw !== "object") {
      return {
        ok: false,
        code: "langflow-node-not-object",
        message: "专业模式回传的节点列表里有一项不是节点对象。你的原流程没有被改动。",
      };
    }
    const langflowId = String((raw as { id?: unknown }).id || "");
    const payload = readOceanLeoPayload(raw);
    if (!payload) {
      foreignLangflowIds.add(langflowId);
      continue;
    }
    const rawPosition = (raw as { position?: unknown }).position;
    const position =
      rawPosition &&
      typeof rawPosition === "object" &&
      Number.isFinite(Number((rawPosition as { x?: unknown }).x)) &&
      Number.isFinite(Number((rawPosition as { y?: unknown }).y))
        ? {
            x: Number((rawPosition as { x: unknown }).x),
            y: Number((rawPosition as { y: unknown }).y),
          }
        : null;
    const node = nodeFromPayload(payload, position);
    if ("ok" in node) return node;
    if (seen.has(node.id)) {
      return {
        ok: false,
        code: "langflow-node-id-duplicated",
        at: node.id,
        message: `专业模式里出现了两个 id 都是「${node.id}」的节点（多半是复制粘贴出来的）。请给其中一个改名后再取回。`,
      };
    }
    seen.add(node.id);
    knownLangflowIds.add(langflowId);
    nodes.push(node);
  }

  if (foreignLangflowIds.size > 0) {
    warnings.push(
      `专业模式里新加的 ${foreignLangflowIds.size} 个 Langflow 原生节点没有带回普通画布：它们没有对应的节点类型。这些节点仍留在专业模式的流程里，切回专业模式还能看到。`,
    );
  }

  const edges: VideoCanvasEdge[] = [];
  let droppedEdges = 0;
  for (const raw of edgesIn) {
    if (!raw || typeof raw !== "object") {
      return {
        ok: false,
        code: "langflow-handle-unparsable",
        message: "专业模式回传的连线列表里有一项不是连线对象。你的原流程没有被改动。",
      };
    }
    const record = raw as Record<string, unknown>;
    const sourceLangflowId = String(record.source || "");
    const targetLangflowId = String(record.target || "");
    if (
      !knownLangflowIds.has(sourceLangflowId) ||
      !knownLangflowIds.has(targetLangflowId)
    ) {
      // 至少一端是外来节点 ⇒ 这条线在普通画布上无处可挂。计数，不静默。
      droppedEdges += 1;
      continue;
    }
    const side = (
      record.data as
        | {
            oceanleo?: {
              edgeId?: unknown;
              fromPort?: unknown;
              toPort?: unknown;
              condition?: unknown;
            };
          }
        | undefined
    )?.oceanleo;
    // 端口名优先取旁挂字段：容器侧 shim 为了让流程真跑得起来会重写 handle
    // （见 `LangflowEdge.data.oceanleo` 的注释）。handle 只作回落。
    const source = decodeLangflowHandle(record.sourceHandle);
    const target = decodeLangflowHandle(record.targetHandle);
    const fromPort =
      typeof side?.fromPort === "string" && side.fromPort
        ? side.fromPort
        : source?.name;
    const toPort =
      typeof side?.toPort === "string" && side.toPort
        ? side.toPort
        : target?.fieldName;
    const fromNodeId = fromLangflowNodeId(sourceLangflowId);
    const toNodeId = fromLangflowNodeId(targetLangflowId);
    if (
      typeof fromPort !== "string" ||
      !fromPort ||
      typeof toPort !== "string" ||
      !toPort ||
      !fromNodeId ||
      !toNodeId
    ) {
      return {
        ok: false,
        code: "langflow-handle-unparsable",
        at: String(record.id || ""),
        message:
          "有一条连线指不出它接在哪个端口上（端口描述既不在旁挂字段里，handle 也读不出来）。你的原流程没有被改动。",
      };
    }
    const edgeId =
      typeof side?.edgeId === "string" && side.edgeId
        ? side.edgeId
        : `e-${fromNodeId}-${fromPort}-${toNodeId}-${toPort}`;
    edges.push({
      id: edgeId,
      fromNodeId,
      fromPort,
      toNodeId,
      toPort,
      ...(typeof side?.condition === "string" ? { condition: side.condition } : {}),
    });
  }
  if (droppedEdges > 0) {
    warnings.push(
      `另有 ${droppedEdges} 条连线因为一端接在 Langflow 原生节点上，没有带回普通画布。`,
    );
  }

  return { ok: true, graph: { nodes, edges }, warnings };
}

/**
 * 往返自证：导出再取回，图必须逐字相同。
 *
 * 给闸用，也给宿主在真的写回之前自己确认一次——**转换器自称无损不算数**。
 * 比的是规范化之后的 JSON：键序与「缺省的 `ports.inputs`」对语义不承载信息，
 * 但**节点、边、端口、参数、条件一个都不许变**。
 */
export function langflowRoundTripMatches(graph: VideoCanvasGraph): boolean {
  const exported = toLangflowFlow(graph, { flowId: "rt", name: "rt" });
  if (!exported.ok) return false;
  const back = fromLangflowFlow(exported.flow);
  if (!back.ok) return false;
  return canonicalJson(back.graph) === canonicalJson(normalizedGraph(graph));
}

/** 只补齐缺省的端口数组，其余一个字节不动。 */
function normalizedGraph(graph: VideoCanvasGraph): VideoCanvasGraph {
  return {
    nodes: (graph.nodes || []).map((node) => ({
      ...node,
      ports: {
        inputs: portsOf(node, "inputs"),
        outputs: portsOf(node, "outputs"),
      },
    })),
    edges: [...(graph.edges || [])],
  };
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const record = inner as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) sorted[key] = record[key];
      return sorted;
    }
    return inner;
  });
}
