/**
 * workflow 载体的解析 / 序列化 / 校验 / 状态机 / 完备判据。
 *
 * 规格: docs/specs/oceanleo-material-and-game-v1/L1-carriers/workflow.md
 *  - §1.2 三个格式的分工(`oceanleo.workflow.v1` MUST NOT 用于新产出)
 *  - §1.3 与 video-timeline 的边界(判据是「有没有节点图」)
 *  - §3.1 Schema · §3.2 状态机 · §3.3 确定性 · §3.4 端口相容
 *  - §6 F1–F8 失败模式 · §8.1 字节下限 · §8.2 完备判据
 */

import {
  LEGACY_WORKFLOW_SOURCE_FORMAT,
  VIDEO_CANVAS_CONSTANTS,
  VIDEO_CANVAS_JSON_SCHEMA,
  VIDEO_CANVAS_PROJECT_SCHEMA,
  VIDEO_CANVAS_REQUIREMENT_PATHS,
  VIDEO_CANVAS_SOURCE_FORMAT,
  validateAgainstJsonSchema,
  type SchemaViolation,
  type VideoCanvasProject,
  type VideoCanvasVersion,
} from "./video-canvas-schema";
import { linkGraphEdges } from "./video-canvas-port-types";
import {
  assessDeterminism,
  branchNodeIds,
  canonicalizeGraph,
  graphFingerprint,
  topologicalOrder,
  unreachableFromOutput,
  versionTreeReport,
} from "./video-canvas-determinism";

export type VideoCanvasErrorCode =
  | "workflow-source-not-json"
  | "workflow-source-not-object"
  | "workflow-schema-invalid"
  | "workflow-legacy-source-format"
  | "workflow-hollow";

export class VideoCanvasCarrierError extends Error {
  readonly code: VideoCanvasErrorCode;
  readonly violations: readonly SchemaViolation[];

  constructor(
    message: string,
    code: VideoCanvasErrorCode,
    violations: readonly SchemaViolation[] = [],
  ) {
    super(message);
    this.name = "VideoCanvasCarrierError";
    this.code = code;
    this.violations = violations;
  }
}

export type VideoCanvasValidation =
  | { ok: true; project: VideoCanvasProject }
  | { ok: false; errors: SchemaViolation[] };

/** §3.1 结构校验。四个 `requirement_paths` MUST 全部在顶层且非空。 */
export function validateVideoCanvasProject(
  value: unknown,
): VideoCanvasValidation {
  const errors = validateAgainstJsonSchema(
    value,
    VIDEO_CANVAS_JSON_SCHEMA as unknown as Record<string, unknown>,
  );
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const path of VIDEO_CANVAS_REQUIREMENT_PATHS) {
      const entry = record[path];
      const empty =
        entry === undefined ||
        entry === null ||
        entry === "" ||
        (Array.isArray(entry) && entry.length === 0);
      if (empty) {
        errors.push({
          path: `/${path}`,
          keyword: "requirement_paths",
          message: `requirement_path ${path} MUST 存在且非空(§1.1)`,
        });
      }
    }
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, project: value as VideoCanvasProject };
}

function decode(input: string | Uint8Array): string {
  if (typeof input === "string") return input;
  return new TextDecoder("utf-8", { fatal: false }).decode(input);
}

/** 解析工程 IR。失败抛带 code 的错误(§6)。 */
export function parseVideoCanvasSource(
  input: string | Uint8Array,
): VideoCanvasProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decode(input));
  } catch {
    throw new VideoCanvasCarrierError(
      "video-canvas IR 不是合法 JSON。",
      "workflow-source-not-json",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new VideoCanvasCarrierError(
      "video-canvas IR 顶层必须是对象。",
      "workflow-source-not-object",
    );
  }
  const validation = validateVideoCanvasProject(parsed);
  if (!validation.ok) {
    throw new VideoCanvasCarrierError(
      `video-canvas IR 未通过 §3.1 校验(${validation.errors.length} 处)。`,
      "workflow-schema-invalid",
      validation.errors,
    );
  }
  return validation.project;
}

/**
 * 确定性序列化:字段序取 §3 Schema 的声明序,数组内部按 id 规范化。
 * 同一份工程反复序列化 MUST 逐位相同,与输入的键序无关。
 */
export function serializeVideoCanvasProject(
  project: VideoCanvasProject,
): string {
  const versions = [...project.versions]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((version) => canonicalVersion(version));
  const assets = [...project.assets].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  return JSON.stringify({
    schemaVersion: project.schemaVersion,
    headVersionId: project.headVersionId,
    versions,
    assets,
    attribution: { entries: [...project.attribution.entries] },
  });
}

function canonicalVersion(version: VideoCanvasVersion): VideoCanvasVersion {
  const canonicalGraph = canonicalizeGraph(version.graph);
  return {
    id: version.id,
    ...(version.parentId ? { parentId: version.parentId } : {}),
    createdAt: version.createdAt,
    ...(version.note ? { note: version.note } : {}),
    graph: canonicalGraph,
    timeline: {
      ...version.timeline,
      clips: [...version.timeline.clips].sort((left, right) => {
        const layer = (left.layer || 0) - (right.layer || 0);
        if (layer !== 0) return layer;
        if (left.startMs !== right.startMs) return left.startMs - right.startMs;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      }),
    },
    ...(version.production ? { production: version.production } : {}),
  };
}

export type SourceFormatAdmission =
  | { ok: true; sourceFormat: string; editabilityCeiling: "native" }
  | {
      ok: false;
      code: "workflow-legacy-source-format" | "workflow-unknown-source-format";
      sourceFormat: string;
      message: string;
    };

/**
 * §1.2:新产出 MUST 用 `oceanleo.video.project.v2`。
 * `oceanleo.workflow.v1` 只是 `_source_format_matches` 的入库容忍,
 * 以它落库的新产出 MUST 被拒绝(§6 F2,§3.2 `empty → invalid`)。
 */
export function videoCanvasSourceFormatAdmission(
  sourceFormat: unknown,
): SourceFormatAdmission {
  const format = String(sourceFormat || "").trim();
  if (format === VIDEO_CANVAS_SOURCE_FORMAT || format === VIDEO_CANVAS_PROJECT_SCHEMA) {
    return { ok: true, sourceFormat: format, editabilityCeiling: "native" };
  }
  if (format === LEGACY_WORKFLOW_SOURCE_FORMAT) {
    return {
      ok: false,
      code: "workflow-legacy-source-format",
      sourceFormat: format,
      message:
        `${LEGACY_WORKFLOW_SOURCE_FORMAT} 是历史遗留格式,MUST NOT 用于新产出(workflow.md §1.2)。`,
    };
  }
  return {
    ok: false,
    code: "workflow-unknown-source-format",
    sourceFormat: format,
    message: `source_format ${format || "(空)"} 不属于 workflow 载体(§1.1)。`,
  };
}

export type VideoCanvasState =
  | "empty"
  | "ir-validated"
  | "graph-linked"
  | "assets-resolved"
  | "parser-passed"
  | "ready"
  | "dirty"
  | "saving"
  | "invalid"
  | "cyclic"
  | "degraded";

/** §3.2 合法迁移表。 */
export const VIDEO_CANVAS_TRANSITIONS: readonly {
  from: VideoCanvasState;
  to: VideoCanvasState;
  trigger: string;
}[] = Object.freeze([
  { from: "empty", to: "ir-validated", trigger: "IR 通过 §3.1 校验" },
  {
    from: "empty",
    to: "invalid",
    trigger: "IR 校验失败,或 source_format 为 oceanleo.workflow.v1",
  },
  {
    from: "ir-validated",
    to: "invalid",
    trigger: "headVersionId 不在 versions[].id 中,或 parentId 悬空,或端口不相容",
  },
  {
    from: "ir-validated",
    to: "graph-linked",
    trigger: "全部 edges[] 的四个端点可解析且端口 dataType 相容",
  },
  { from: "graph-linked", to: "cyclic", trigger: "拓扑排序失败(存在环)" },
  {
    from: "graph-linked",
    to: "assets-resolved",
    trigger: "全部 nodes[].assetId 与 assets[] 命中闭包",
  },
  {
    from: "assets-resolved",
    to: "degraded",
    trigger: "部分素材缺失,但图结构完整",
  },
  {
    from: "assets-resolved",
    to: "parser-passed",
    trigger: "生产解析器走通,production.parserPassed = true",
  },
  { from: "assets-resolved", to: "invalid", trigger: "生产解析器未通过" },
  { from: "parser-passed", to: "ready", trigger: "§8.2 完备判据全部成立" },
  { from: "ready", to: "dirty", trigger: "编辑器改动" },
  {
    from: "dirty",
    to: "saving",
    trigger: "提交,产生新 versions[] 条目并更新 headVersionId",
  },
  { from: "saving", to: "ready", trigger: "收到新 revision_id" },
]);

/** §3.2 非法迁移(MUST NOT 发生)。 */
export const VIDEO_CANVAS_ILLEGAL_TRANSITIONS: readonly {
  from: VideoCanvasState;
  to: VideoCanvasState;
  why: string;
}[] = Object.freeze([
  {
    from: "cyclic",
    to: "parser-passed",
    why: "有环图送进生产解析器会死循环或栈溢出",
  },
  { from: "cyclic", to: "ready", why: "有环工程不是可用工程" },
  {
    from: "graph-linked",
    to: "ready",
    why: "跳过素材解析与解析器闸,产出无法生产的图",
  },
  {
    from: "assets-resolved",
    to: "ready",
    why: "跳过 productionParserPassed 闸(R2 那条布尔校验存在的意义)",
  },
  { from: "degraded", to: "saving", why: "缺素材态 MUST NOT 保存" },
  { from: "empty", to: "ready", why: "464–500 B 与 490 B 空壳的产生路径" },
]);

export function isLegalVideoCanvasTransition(
  from: VideoCanvasState,
  to: VideoCanvasState,
): boolean {
  if (
    VIDEO_CANVAS_ILLEGAL_TRANSITIONS.some(
      (illegal) => illegal.from === from && illegal.to === to,
    )
  ) {
    return false;
  }
  return VIDEO_CANVAS_TRANSITIONS.some(
    (legal) => legal.from === from && legal.to === to,
  );
}

export interface CompletenessCriterion {
  /** §8.2 表内的判据名。 */
  id: string;
  /** 规格出处(章节 / 常量编号)。 */
  basis: string;
  ok: boolean;
  actual: number | boolean | string;
  threshold: number | boolean | string;
}

export interface VideoCanvasCompleteness {
  ok: boolean;
  criteria: CompletenessCriterion[];
  failed: string[];
  /** §3.3:同图同序 → 同指纹。 */
  graphFingerprint: string;
}

export interface VideoCanvasCompletenessInput {
  /** IR 字节数(§8.1 下限 8,192 B)。 */
  byteSize?: number;
  /** §8.2 抓帧颜色数(C43 ≥ 12),渲染侧提供;缺省时该条判为待渲染。 */
  captureColorCount?: number;
  /** 依赖闭包字节合计(§8.1 下限 65,536 B)。 */
  dependencyClosureBytes?: number;
}

/**
 * §8.1 + §8.2 逐条判据。空壳(464–500 B / 490 B)MUST 在这里被拒(§6 F1)。
 * 判据面向 `headVersionId` 指向的版本 —— 那是编辑器实际打开的图。
 */
export function assessVideoCanvasCompleteness(
  project: VideoCanvasProject,
  input: VideoCanvasCompletenessInput = {},
): VideoCanvasCompleteness {
  const criteria: CompletenessCriterion[] = [];
  const head =
    project.versions.find((version) => version.id === project.headVersionId) ||
    project.versions[0];
  const graph = head?.graph || { nodes: [], edges: [] };
  const timeline = head?.timeline || { durationMs: 0, clips: [] };
  const kinds = new Set(graph.nodes.map((node) => node.kind));
  const outputs = graph.nodes.filter((node) => node.kind === "output");
  const topology = topologicalOrder(graph);
  const links = linkGraphEdges(graph);
  const tree = versionTreeReport(project);
  const determinism = head
    ? assessDeterminism(head)
    : { ok: false, findings: [] };

  const add = (
    id: string,
    basis: string,
    ok: boolean,
    actual: number | boolean | string,
    threshold: number | boolean | string,
  ) => criteria.push({ id, basis, ok, actual, threshold });

  const byteSize = input.byteSize;
  add(
    "irByteFloor",
    "§8.1 / C37",
    byteSize === undefined
      ? false
      : byteSize >= VIDEO_CANVAS_CONSTANTS.C37_IR_BYTE_MIN &&
        byteSize <= VIDEO_CANVAS_CONSTANTS.C38_IR_BYTE_MAX,
    byteSize ?? "unknown",
    `${VIDEO_CANVAS_CONSTANTS.C37_IR_BYTE_MIN}–${VIDEO_CANVAS_CONSTANTS.C38_IR_BYTE_MAX}`,
  );
  add(
    "nodeCount",
    "§8.2 / reviewed_material_catalog.py:2626",
    graph.nodes.length >= VIDEO_CANVAS_CONSTANTS.C1_NODE_COUNT_MIN &&
      graph.nodes.length <= VIDEO_CANVAS_CONSTANTS.C2_NODE_COUNT_MAX,
    graph.nodes.length,
    `≥ ${VIDEO_CANVAS_CONSTANTS.C1_NODE_COUNT_MIN}`,
  );
  add(
    "edgeCount",
    "§8.2 / :2632",
    graph.edges.length >= VIDEO_CANVAS_CONSTANTS.C3_EDGE_COUNT_MIN &&
      graph.edges.length <= VIDEO_CANVAS_CONSTANTS.C4_EDGE_COUNT_MAX,
    graph.edges.length,
    `≥ ${VIDEO_CANVAS_CONSTANTS.C3_EDGE_COUNT_MIN}`,
  );
  add(
    "assetCount",
    "§8.2 / :2638",
    project.assets.length >= VIDEO_CANVAS_CONSTANTS.C5_ASSET_COUNT_MIN,
    project.assets.length,
    `≥ ${VIDEO_CANVAS_CONSTANTS.C5_ASSET_COUNT_MIN}`,
  );
  add(
    "clipCount",
    "§8.2 / :2644",
    timeline.clips.length >= VIDEO_CANVAS_CONSTANTS.C7_CLIP_COUNT_MIN,
    timeline.clips.length,
    `≥ ${VIDEO_CANVAS_CONSTANTS.C7_CLIP_COUNT_MIN}`,
  );
  add(
    "durationMs",
    "§8.2 / C19",
    timeline.durationMs >= VIDEO_CANVAS_CONSTANTS.C19_DURATION_MS_MIN,
    timeline.durationMs,
    `≥ ${VIDEO_CANVAS_CONSTANTS.C19_DURATION_MS_MIN}`,
  );
  add(
    "productionParserPassed",
    "§8.2 / :2650-2653 / §5.3",
    head?.production?.parserPassed === true,
    head?.production?.parserPassed === true,
    true,
  );
  add(
    "nodeKindVariety",
    "§8.2 / C10(治 F4)",
    kinds.size >= VIDEO_CANVAS_CONSTANTS.C10_NODE_KINDS_USED_MIN,
    kinds.size,
    `≥ ${VIDEO_CANVAS_CONSTANTS.C10_NODE_KINDS_USED_MIN}`,
  );
  const branches = branchNodeIds(graph);
  add(
    "branchNodeCount",
    "§8.2 / C11(治 F4)",
    branches.length >= VIDEO_CANVAS_CONSTANTS.C11_BRANCH_NODE_MIN,
    branches.length,
    `≥ ${VIDEO_CANVAS_CONSTANTS.C11_BRANCH_NODE_MIN}`,
  );
  add(
    "outputNodeCount",
    "§8.2 / C12",
    outputs.length === VIDEO_CANVAS_CONSTANTS.C12_OUTPUT_NODE_COUNT,
    outputs.length,
    VIDEO_CANVAS_CONSTANTS.C12_OUTPUT_NODE_COUNT,
  );
  const deadNodes = unreachableFromOutput(graph);
  add(
    "deadNodeCount",
    "§8.2 / §5.1",
    deadNodes.length === 0,
    deadNodes.length,
    0,
  );
  add("cycleCount", "§8.2 / F3", topology.cycles.length === 0, topology.cycles.length, 0);
  add(
    "graphDepth",
    "§5.2 / C16",
    topology.depth <= VIDEO_CANVAS_CONSTANTS.C16_GRAPH_DEPTH_MAX,
    topology.depth,
    `≤ ${VIDEO_CANVAS_CONSTANTS.C16_GRAPH_DEPTH_MAX}`,
  );
  add(
    "incompatibleEdgeCount",
    "§8.2 / §3.4",
    links.incompatibleEdgeCount === 0,
    links.incompatibleEdgeCount,
    0,
  );
  add(
    "headVersionResolved",
    "§8.2 / F7",
    tree.headResolved,
    tree.headResolved,
    true,
  );
  add(
    "versionTreeRootCount",
    "§8.2 / §5.4",
    tree.rootIds.length === 1 && tree.danglingParentIds.length === 0,
    tree.rootIds.length,
    1,
  );
  const entries = project.attribution?.entries || [];
  add(
    "attributionEntries",
    "§8.2",
    entries.length >= 1 &&
      entries.every(
        (entry) =>
          Boolean(entry.text) &&
          Boolean(entry.licenseCode) &&
          entry.licenseUrl.startsWith("https://"),
      ),
    entries.length,
    "≥ 1,三字段齐全",
  );
  add(
    "determinism",
    "§3.3 / §8.2 前置",
    determinism.ok,
    determinism.findings.length,
    0,
  );
  add(
    "captureColorCount",
    "§8.2 / C43",
    (input.captureColorCount ?? -1) >=
      VIDEO_CANVAS_CONSTANTS.C43_CAPTURE_COLOR_COUNT_MIN,
    input.captureColorCount ?? "unknown",
    `≥ ${VIDEO_CANVAS_CONSTANTS.C43_CAPTURE_COLOR_COUNT_MIN}`,
  );
  add(
    "dependencyClosureBytes",
    "§8.1",
    (input.dependencyClosureBytes ?? -1) >=
      VIDEO_CANVAS_CONSTANTS.DEPENDENCY_CLOSURE_BYTE_MIN &&
      (input.dependencyClosureBytes ?? Number.POSITIVE_INFINITY) <=
        VIDEO_CANVAS_CONSTANTS.C36_DEPENDENCY_CLOSURE_BYTE_MAX,
    input.dependencyClosureBytes ?? "unknown",
    `${VIDEO_CANVAS_CONSTANTS.DEPENDENCY_CLOSURE_BYTE_MIN}–${VIDEO_CANVAS_CONSTANTS.C36_DEPENDENCY_CLOSURE_BYTE_MAX}`,
  );

  const failed = criteria.filter((entry) => !entry.ok).map((entry) => entry.id);
  return {
    ok: failed.length === 0,
    criteria,
    failed,
    graphFingerprint: graphFingerprint(graph),
  };
}

export type CarrierBoundaryVerdict =
  | { carrier: "workflow"; reason: "node-graph-with-branching" }
  | {
      carrier: "video-timeline";
      reason: "linear-chain-without-branching" | "no-node-graph";
      /** §1.3:线性时间线归 `video` + `oceanleo.timeline.v1`。 */
      shouldBe: "oceanleo.timeline.v1";
    };

/**
 * §1.3 与 `video-timeline` 的边界。判据是「有没有节点图」:
 * 一条直线的六个节点满足 nodeCount/edgeCount 门槛,但它是线性时间线,
 * 归 video-timeline 载体(§6 F4)。时间线的剪辑职责 MUST NOT 搬进节点图 ——
 * 本模块因此只判归属,不实现任何剪辑/编码/预览分辨率逻辑。
 */
export function classifyCarrierBoundary(
  project: VideoCanvasProject,
): CarrierBoundaryVerdict {
  const head =
    project.versions.find((version) => version.id === project.headVersionId) ||
    project.versions[0];
  const graph = head?.graph;
  if (!graph || graph.nodes.length < VIDEO_CANVAS_CONSTANTS.C1_NODE_COUNT_MIN) {
    return {
      carrier: "video-timeline",
      reason: "no-node-graph",
      shouldBe: "oceanleo.timeline.v1",
    };
  }
  const kinds = new Set(graph.nodes.map((node) => node.kind));
  const branches = branchNodeIds(graph);
  if (
    branches.length >= VIDEO_CANVAS_CONSTANTS.C11_BRANCH_NODE_MIN &&
    kinds.size >= VIDEO_CANVAS_CONSTANTS.C10_NODE_KINDS_USED_MIN
  ) {
    return { carrier: "workflow", reason: "node-graph-with-branching" };
  }
  return {
    carrier: "video-timeline",
    reason: "linear-chain-without-branching",
    shouldBe: "oceanleo.timeline.v1",
  };
}
