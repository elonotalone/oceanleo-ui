/**
 * workflow 载体(`workflow` / `oceanleo.video.project.v2` / `oceanleo.video-canvas.v1`)的
 * 结构事实源。
 *
 * 规格: docs/specs/oceanleo-material-and-game-v1/L1-carriers/workflow.md
 *  - §1.1 四元组 · §1.2 三个格式的分工 · §2 视觉靶 · §3 JSON Schema · §4 常量表 C1–C45
 *
 * 本模块只声明结构与常量,不做 IO、不生成素材。
 */

export const VIDEO_CANVAS_PROJECT_SCHEMA = "oceanleo.video-canvas.v1";
export const VIDEO_CANVAS_SOURCE_FORMAT = "oceanleo.video.project.v2";
/** §1.2:历史遗留格式,只在 `_source_format_matches` 被容忍,新产出 MUST NOT 使用。 */
export const LEGACY_WORKFLOW_SOURCE_FORMAT = "oceanleo.workflow.v1";

/** §1.1 四元组(逐字)。 */
export const WORKFLOW_CARRIER_CONTRACT = Object.freeze({
  featureId: "video_canvas",
  artifactType: "workflow",
  sourceFormat: VIDEO_CANVAS_SOURCE_FORMAT,
  sourceMediaType: "application/json",
  editorCapability: "video-canvas",
  adapter: "video-canvas",
  projectSchema: VIDEO_CANVAS_PROJECT_SCHEMA,
  editability: "native",
  sourceIntegrity: "complete_dependency_closure",
  openMode: "structured-project",
  requirementKind: "manifest",
  requirementSchema: VIDEO_CANVAS_PROJECT_SCHEMA,
  requirementPaths: Object.freeze([
    "schemaVersion",
    "headVersionId",
    "versions",
    "assets",
  ] as const),
  dependencyClosure: "complete",
} as const);

export const VIDEO_CANVAS_REQUIREMENT_PATHS =
  WORKFLOW_CARRIER_CONTRACT.requirementPaths;

/** §3.1 `nodes[].kind` 枚举 —— C9 = 10 种。 */
export const VIDEO_CANVAS_NODE_KINDS = Object.freeze([
  "source",
  "trim",
  "concat",
  "overlay",
  "transition",
  "filter",
  "audio-mix",
  "text",
  "branch",
  "output",
] as const);

export type VideoCanvasNodeKind = (typeof VIDEO_CANVAS_NODE_KINDS)[number];

/** §3.1 `$defs.port.dataType` 枚举 —— C15 = 6 种。 */
export const VIDEO_CANVAS_PORT_DATA_TYPES = Object.freeze([
  "video",
  "audio",
  "image",
  "text",
  "number",
  "any",
] as const);

export type VideoCanvasPortDataType =
  (typeof VIDEO_CANVAS_PORT_DATA_TYPES)[number];

export interface VideoCanvasPort {
  name: string;
  dataType: VideoCanvasPortDataType;
  required?: boolean;
}

export interface VideoCanvasNode {
  id: string;
  kind: VideoCanvasNodeKind;
  label?: string;
  x: number;
  y: number;
  params?: Record<string, unknown>;
  assetId?: string;
  ports: {
    inputs?: VideoCanvasPort[];
    outputs?: VideoCanvasPort[];
  };
}

export interface VideoCanvasEdge {
  id: string;
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
  condition?: string;
}

export interface VideoCanvasGraph {
  nodes: VideoCanvasNode[];
  edges: VideoCanvasEdge[];
}

export interface VideoCanvasClip {
  id: string;
  nodeId: string;
  startMs: number;
  durationMs: number;
  layer?: number;
}

export interface VideoCanvasTimeline {
  durationMs: number;
  fps?: 24 | 25 | 30 | 50 | 60;
  widthPx?: number;
  heightPx?: number;
  clips: VideoCanvasClip[];
}

export interface VideoCanvasProduction {
  parserPassed: true;
  parserVersion?: string;
  checkedAt?: string;
}

export interface VideoCanvasVersion {
  id: string;
  parentId?: string;
  createdAt: string;
  note?: string;
  graph: VideoCanvasGraph;
  timeline: VideoCanvasTimeline;
  production?: VideoCanvasProduction;
}

export interface VideoCanvasAsset {
  id: string;
  sha256: string;
  mediaType:
    | "video/mp4"
    | "audio/mpeg"
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "font/woff2";
  byteSize: number;
  licenseCode?: string;
}

export interface VideoCanvasAttributionEntry {
  text: string;
  licenseCode: string;
  licenseUrl: string;
  assetId?: string;
}

export interface VideoCanvasProject {
  schemaVersion: typeof VIDEO_CANVAS_PROJECT_SCHEMA;
  headVersionId: string;
  versions: VideoCanvasVersion[];
  assets: VideoCanvasAsset[];
  attribution: { entries: VideoCanvasAttributionEntry[] };
}

/**
 * §4 数值常量表 C1–C45。键名即规格编号,阈值 MUST 与规格逐值一致。
 */
export const VIDEO_CANVAS_CONSTANTS = Object.freeze({
  C1_NODE_COUNT_MIN: 6,
  C2_NODE_COUNT_MAX: 500,
  C3_EDGE_COUNT_MIN: 5,
  C4_EDGE_COUNT_MAX: 2_000,
  C5_ASSET_COUNT_MIN: 3,
  C6_ASSET_COUNT_MAX: 500,
  C7_CLIP_COUNT_MIN: 1,
  C8_CLIP_COUNT_MAX: 500,
  C9_NODE_KIND_COUNT: 10,
  C10_NODE_KINDS_USED_MIN: 4,
  C11_BRANCH_NODE_MIN: 1,
  C12_OUTPUT_NODE_COUNT: 1,
  C13_NODE_INPUT_PORT_MAX: 8,
  C14_NODE_OUTPUT_PORT_MAX: 8,
  C15_PORT_DATA_TYPE_COUNT: 6,
  C16_GRAPH_DEPTH_MAX: 64,
  C17_VERSION_COUNT_MIN: 1,
  C18_VERSION_COUNT_MAX: 200,
  C19_DURATION_MS_MIN: 6_000,
  C20_DURATION_MS_MAX: 1_800_000,
  C21_CLIP_DURATION_MS_MIN: 400,
  C22_CLIP_LAYER_MIN: 0,
  C22_CLIP_LAYER_MAX: 15,
  C23_FPS_VALUES: Object.freeze([24, 25, 30, 50, 60] as const),
  C24_WIDTH_PX_MIN: 640,
  C24_WIDTH_PX_MAX: 3_840,
  C25_HEIGHT_PX_MIN: 360,
  C25_HEIGHT_PX_MAX: 2_160,
  C26_NODE_COORDINATE_MIN: -20_000,
  C26_NODE_COORDINATE_MAX: 20_000,
  C27_NODE_MIN_WIDTH_PX: 180,
  C28_NODE_MIN_HEIGHT_PX: 72,
  C29_PORT_SPACING_PX: 24,
  C30_PORT_HIT_RADIUS_PX: 12,
  C31_AUTO_LAYOUT_H_GAP_PX: 120,
  C32_AUTO_LAYOUT_V_GAP_PX: 48,
  C33_GRID_SNAP_PX: 8,
  C34_HIT_AREA_MIN_PX: 24,
  C35_ASSET_BYTE_MIN: 512,
  C35_ASSET_BYTE_MAX: 2_147_483_648,
  C36_DEPENDENCY_CLOSURE_BYTE_MAX: 4_294_967_296,
  C37_IR_BYTE_MIN: 8_192,
  C38_IR_BYTE_MAX: 8_388_608,
  C39_TOPO_SORT_WALL_MS_MAX: 200,
  C40_PRODUCTION_PARSER_WALL_MS_MAX: 30_000,
  C41_COVER_MIN_EDGE_PX: 128,
  C42_CAPTURE_CANVAS_PX: Object.freeze({ width: 1_600, height: 1_000 } as const),
  C43_CAPTURE_COLOR_COUNT_MIN: 12,
  C44_FAMILY_JACCARD_MAX: 0.85,
  C45_TWIN_THRESHOLD: 0.99,
  /** §8.1 依赖闭包字节下限。 */
  DEPENDENCY_CLOSURE_BYTE_MIN: 65_536,
} as const);

/**
 * §2.1 节点图色板。`obligation` 是规格逐 token 写死的义务与实测值;
 * `criterion` 区分 SC 1.4.3(文字 4.5:1)、SC 1.4.11(非文本 3.0:1)与自定分层义务。
 * `wf.node` 的取值 MUST NOT 抬高(§2.1 末条:抬填充会打破 header 与 muted 两条义务)。
 */
export const VIDEO_CANVAS_PALETTE = Object.freeze({
  "wf.bg": "#14171B",
  "wf.node": "#1F2328",
  "wf.node.border": "#5F6974",
  "wf.node.header": "#1F6FEB",
  "wf.text": "#E6EDF3",
  "wf.muted": "#8C959F",
  "wf.edge": "#5F6974",
  "wf.edge.active": "#1F6FEB",
  "wf.port.in": "#2E8B6F",
  "wf.port.out": "#D9822B",
  "wf.error": "#CF222E",
} as const);

export interface ContrastObligation {
  token: keyof typeof VIDEO_CANVAS_PALETTE;
  basis: keyof typeof VIDEO_CANVAS_PALETTE;
  minimumRatio: number;
  measuredRatio: number;
  criterion: "SC 1.4.3" | "SC 1.4.11" | "self-defined-layering";
}

/** §2.1 逐条对比度义务(实测值来自规格表内)。 */
export const VIDEO_CANVAS_CONTRAST_OBLIGATIONS: readonly ContrastObligation[] =
  Object.freeze([
    {
      token: "wf.node",
      basis: "wf.bg",
      minimumRatio: 1.1,
      measuredRatio: 1.14,
      criterion: "self-defined-layering",
    },
    {
      token: "wf.node.border",
      basis: "wf.bg",
      minimumRatio: 3.0,
      measuredRatio: 3.22,
      criterion: "SC 1.4.11",
    },
    {
      token: "wf.node.header",
      basis: "wf.node",
      minimumRatio: 3.0,
      measuredRatio: 3.41,
      criterion: "SC 1.4.11",
    },
    {
      token: "wf.text",
      basis: "wf.node",
      minimumRatio: 4.5,
      measuredRatio: 13.37,
      criterion: "SC 1.4.3",
    },
    {
      token: "wf.muted",
      basis: "wf.node",
      minimumRatio: 4.5,
      measuredRatio: 5.2,
      criterion: "SC 1.4.3",
    },
    {
      token: "wf.edge",
      basis: "wf.bg",
      minimumRatio: 3.0,
      measuredRatio: 3.22,
      criterion: "SC 1.4.11",
    },
    {
      token: "wf.edge.active",
      basis: "wf.bg",
      minimumRatio: 3.0,
      measuredRatio: 3.88,
      criterion: "SC 1.4.11",
    },
    {
      token: "wf.port.in",
      basis: "wf.node",
      minimumRatio: 3.0,
      measuredRatio: 3.79,
      criterion: "SC 1.4.11",
    },
    {
      token: "wf.port.out",
      basis: "wf.node",
      minimumRatio: 3.0,
      measuredRatio: 5.4,
      criterion: "SC 1.4.11",
    },
    {
      token: "wf.error",
      basis: "wf.bg",
      minimumRatio: 3.0,
      measuredRatio: 3.36,
      criterion: "SC 1.4.11",
    },
  ] as const);

/** §2.2 版面(单位 px)。 */
export const VIDEO_CANVAS_LAYOUT = Object.freeze({
  nodeMinWidthPx: VIDEO_CANVAS_CONSTANTS.C27_NODE_MIN_WIDTH_PX,
  nodeMinHeightPx: VIDEO_CANVAS_CONSTANTS.C28_NODE_MIN_HEIGHT_PX,
  nodeHeaderHeightPx: 28,
  portSpacingPx: VIDEO_CANVAS_CONSTANTS.C29_PORT_SPACING_PX,
  portHitRadiusPx: VIDEO_CANVAS_CONSTANTS.C30_PORT_HIT_RADIUS_PX,
  autoLayoutHorizontalGapPx: VIDEO_CANVAS_CONSTANTS.C31_AUTO_LAYOUT_H_GAP_PX,
  autoLayoutVerticalGapPx: VIDEO_CANVAS_CONSTANTS.C32_AUTO_LAYOUT_V_GAP_PX,
  edgeCornerRadiusPx: 12,
  edgeWidthPx: 2,
  gridSnapPx: VIDEO_CANVAS_CONSTANTS.C33_GRID_SNAP_PX,
  hitAreaMinPx: VIDEO_CANVAS_CONSTANTS.C34_HIT_AREA_MIN_PX,
} as const);

/** §2.3 字号档(px)。 */
export const VIDEO_CANVAS_TYPE_SCALE = Object.freeze({
  "node-title": 14,
  port: 12,
  param: 12,
  badge: 11,
} as const);

/**
 * §2.4 无障碍:四个操作各有键盘通路,环与悬空必须同时给文本消息。
 * 这些是视口层(W13 的 video-editor 不含节点图;节点图视口在站点仓 video 侧)的义务,
 * 平台侧只负责让它们可编程识别与可判。
 */
export const VIDEO_CANVAS_ACCESSIBILITY = Object.freeze({
  /** SC 1.3.1:边 MUST 显式声明四个端点,MUST NOT 靠坐标邻近推断。 */
  edgeEndpointsAreExplicit: true,
  /** SC 2.1.1:四个操作各有键盘通路。 */
  keyboardOperations: Object.freeze([
    "select-node",
    "select-edge",
    "delete",
    "auto-layout",
  ] as const),
  /** §2.4 末条:环与悬空 MUST NOT 只用颜色表达。 */
  errorsRequireTextMessage: true,
} as const);

/** §3 `oceanleo.video-canvas.v1` JSON Schema(Draft 2020-12,逐字取规格 §3)。 */
export const VIDEO_CANVAS_JSON_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://oceanleo.com/schemas/oceanleo.video-canvas.v1.json",
  title: "oceanleo.video-canvas.v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "headVersionId", "versions", "assets", "attribution"],
  properties: {
    schemaVersion: { const: VIDEO_CANVAS_PROJECT_SCHEMA },
    headVersionId: { type: "string", pattern: "^v[0-9]{1,6}$" },
    versions: {
      type: "array",
      minItems: VIDEO_CANVAS_CONSTANTS.C17_VERSION_COUNT_MIN,
      maxItems: VIDEO_CANVAS_CONSTANTS.C18_VERSION_COUNT_MAX,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "createdAt", "graph", "timeline"],
        properties: {
          id: { type: "string", pattern: "^v[0-9]{1,6}$" },
          parentId: { type: "string", pattern: "^v[0-9]{1,6}$" },
          createdAt: { type: "string", format: "date-time" },
          note: { type: "string", maxLength: 300 },
          graph: {
            type: "object",
            additionalProperties: false,
            required: ["nodes", "edges"],
            properties: {
              nodes: {
                type: "array",
                minItems: VIDEO_CANVAS_CONSTANTS.C1_NODE_COUNT_MIN,
                maxItems: VIDEO_CANVAS_CONSTANTS.C2_NODE_COUNT_MAX,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "kind", "x", "y", "ports"],
                  properties: {
                    id: { type: "string", pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$" },
                    kind: { enum: [...VIDEO_CANVAS_NODE_KINDS] },
                    label: { type: "string", maxLength: 120 },
                    x: {
                      type: "number",
                      minimum: VIDEO_CANVAS_CONSTANTS.C26_NODE_COORDINATE_MIN,
                      maximum: VIDEO_CANVAS_CONSTANTS.C26_NODE_COORDINATE_MAX,
                    },
                    y: {
                      type: "number",
                      minimum: VIDEO_CANVAS_CONSTANTS.C26_NODE_COORDINATE_MIN,
                      maximum: VIDEO_CANVAS_CONSTANTS.C26_NODE_COORDINATE_MAX,
                    },
                    params: { type: "object" },
                    assetId: { type: "string", maxLength: 64 },
                    ports: {
                      type: "object",
                      additionalProperties: false,
                      required: ["inputs", "outputs"],
                      properties: {
                        inputs: {
                          type: "array",
                          maxItems: VIDEO_CANVAS_CONSTANTS.C13_NODE_INPUT_PORT_MAX,
                          items: { $ref: "#/$defs/port" },
                        },
                        outputs: {
                          type: "array",
                          minItems: 0,
                          maxItems: VIDEO_CANVAS_CONSTANTS.C14_NODE_OUTPUT_PORT_MAX,
                          items: { $ref: "#/$defs/port" },
                        },
                      },
                    },
                  },
                },
              },
              edges: {
                type: "array",
                minItems: VIDEO_CANVAS_CONSTANTS.C3_EDGE_COUNT_MIN,
                maxItems: VIDEO_CANVAS_CONSTANTS.C4_EDGE_COUNT_MAX,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "fromNodeId", "fromPort", "toNodeId", "toPort"],
                  properties: {
                    id: { type: "string", pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$" },
                    fromNodeId: {
                      type: "string",
                      pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$",
                    },
                    fromPort: { type: "string", minLength: 1, maxLength: 40 },
                    toNodeId: {
                      type: "string",
                      pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$",
                    },
                    toPort: { type: "string", minLength: 1, maxLength: 40 },
                    condition: { type: "string", maxLength: 300 },
                  },
                },
              },
            },
          },
          timeline: {
            type: "object",
            additionalProperties: false,
            required: ["durationMs", "clips"],
            properties: {
              durationMs: {
                type: "integer",
                minimum: VIDEO_CANVAS_CONSTANTS.C19_DURATION_MS_MIN,
                maximum: VIDEO_CANVAS_CONSTANTS.C20_DURATION_MS_MAX,
              },
              fps: { enum: [...VIDEO_CANVAS_CONSTANTS.C23_FPS_VALUES] },
              widthPx: {
                type: "integer",
                minimum: VIDEO_CANVAS_CONSTANTS.C24_WIDTH_PX_MIN,
                maximum: VIDEO_CANVAS_CONSTANTS.C24_WIDTH_PX_MAX,
              },
              heightPx: {
                type: "integer",
                minimum: VIDEO_CANVAS_CONSTANTS.C25_HEIGHT_PX_MIN,
                maximum: VIDEO_CANVAS_CONSTANTS.C25_HEIGHT_PX_MAX,
              },
              clips: {
                type: "array",
                minItems: VIDEO_CANVAS_CONSTANTS.C7_CLIP_COUNT_MIN,
                maxItems: VIDEO_CANVAS_CONSTANTS.C8_CLIP_COUNT_MAX,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "nodeId", "startMs", "durationMs"],
                  properties: {
                    id: { type: "string", pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$" },
                    nodeId: { type: "string", pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$" },
                    startMs: {
                      type: "integer",
                      minimum: 0,
                      maximum: VIDEO_CANVAS_CONSTANTS.C20_DURATION_MS_MAX,
                    },
                    durationMs: {
                      type: "integer",
                      minimum: VIDEO_CANVAS_CONSTANTS.C21_CLIP_DURATION_MS_MIN,
                      maximum: VIDEO_CANVAS_CONSTANTS.C20_DURATION_MS_MAX,
                    },
                    layer: {
                      type: "integer",
                      minimum: VIDEO_CANVAS_CONSTANTS.C22_CLIP_LAYER_MIN,
                      maximum: VIDEO_CANVAS_CONSTANTS.C22_CLIP_LAYER_MAX,
                    },
                  },
                },
              },
            },
          },
          production: {
            type: "object",
            additionalProperties: false,
            required: ["parserPassed"],
            properties: {
              parserPassed: { const: true },
              parserVersion: { type: "string", maxLength: 40 },
              checkedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    assets: {
      type: "array",
      minItems: VIDEO_CANVAS_CONSTANTS.C5_ASSET_COUNT_MIN,
      maxItems: VIDEO_CANVAS_CONSTANTS.C6_ASSET_COUNT_MAX,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "sha256", "mediaType", "byteSize"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 64 },
          sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
          mediaType: {
            enum: [
              "video/mp4",
              "audio/mpeg",
              "image/png",
              "image/jpeg",
              "image/webp",
              "font/woff2",
            ],
          },
          byteSize: {
            type: "integer",
            minimum: VIDEO_CANVAS_CONSTANTS.C35_ASSET_BYTE_MIN,
            maximum: VIDEO_CANVAS_CONSTANTS.C35_ASSET_BYTE_MAX,
          },
          licenseCode: { type: "string", maxLength: 60 },
        },
      },
    },
    attribution: {
      type: "object",
      additionalProperties: false,
      required: ["entries"],
      properties: {
        entries: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "licenseCode", "licenseUrl"],
            properties: {
              text: { type: "string", minLength: 2, maxLength: 200 },
              licenseCode: { type: "string", minLength: 2, maxLength: 60 },
              licenseUrl: { type: "string", format: "uri", pattern: "^https://" },
              assetId: { type: "string", maxLength: 64 },
            },
          },
        },
      },
    },
  },
  $defs: {
    port: {
      type: "object",
      additionalProperties: false,
      required: ["name", "dataType"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 40 },
        dataType: { enum: [...VIDEO_CANVAS_PORT_DATA_TYPES] },
        required: { type: "boolean", default: true },
      },
    },
  },
} as const);

export interface SchemaViolation {
  /** JSON Pointer 风格的路径,空串表示根。 */
  path: string;
  keyword: string;
  message: string;
}

type JsonSchemaNode = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return isPlainObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return false;
  }
}

/**
 * 两个载体共用的最小 Draft 2020-12 子集求值器。
 *
 * 只实现两份规格 Schema 真正用到的关键字(type / const / enum / required /
 * properties / additionalProperties:false / items / minItems / maxItems /
 * minLength / maxLength / pattern / minimum / maximum / format / $ref+$defs /
 * allOf / if-then),因此「规格 Schema 字面量」本身就是唯一事实源 ——
 * 校验器不复述字段,漏改字面量就会被用例逐字段抓出。
 *
 * MUST NOT 扩成通用求值器:未识别的关键字一律被忽略,新关键字进 Schema 前
 * 必须先在此登记,否则会静默放行。
 */
export function validateAgainstJsonSchema(
  value: unknown,
  schema: JsonSchemaNode,
  root: JsonSchemaNode = schema,
  path = "",
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const push = (keyword: string, message: string, at = path) => {
    violations.push({ path: at, keyword, message });
  };

  const ref = schema.$ref;
  if (typeof ref === "string") {
    const resolved = resolveRef(root, ref);
    if (!resolved) {
      push("$ref", `无法解析 $ref ${ref}`);
      return violations;
    }
    return validateAgainstJsonSchema(value, resolved, root, path);
  }

  if ("const" in schema && value !== schema.const) {
    push("const", `期望 ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value as never)) {
    push("enum", `取值不在枚举 ${JSON.stringify(schema.enum)} 内`);
  }
  if (typeof schema.type === "string" && !matchesType(value, schema.type)) {
    push("type", `期望 ${schema.type},实得 ${describe(value)}`);
    return violations;
  }

  if (typeof value === "string") {
    if (
      typeof schema.minLength === "number" &&
      value.length < schema.minLength
    ) {
      push("minLength", `长度 ${value.length} < ${schema.minLength}`);
    }
    if (
      typeof schema.maxLength === "number" &&
      value.length > schema.maxLength
    ) {
      push("maxLength", `长度 ${value.length} > ${schema.maxLength}`);
    }
    if (
      typeof schema.pattern === "string" &&
      !new RegExp(schema.pattern).test(value)
    ) {
      push("pattern", `不匹配 ${schema.pattern}`);
    }
    if (schema.format === "date-time" && !DATE_TIME_PATTERN.test(value)) {
      push("format", "不是 RFC 3339 date-time");
    }
    if (schema.format === "uri" && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      push("format", "不是绝对 URI");
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      push("minimum", `${value} < ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      push("maximum", `${value} > ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      push("minItems", `条数 ${value.length} < ${schema.minItems}`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      push("maxItems", `条数 ${value.length} > ${schema.maxItems}`);
    }
    const items = schema.items;
    if (isPlainObject(items)) {
      value.forEach((entry, index) => {
        violations.push(
          ...validateAgainstJsonSchema(entry, items, root, `${path}/${index}`),
        );
      });
    }
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && !(key in value)) {
          push("required", `缺少必填字段 ${key}`);
        }
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          push("additionalProperties", `不允许的字段 ${key}`, `${path}/${key}`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (!(key in value) || !isPlainObject(propertySchema)) continue;
      violations.push(
        ...validateAgainstJsonSchema(
          (value as Record<string, unknown>)[key],
          propertySchema,
          root,
          `${path}/${key}`,
        ),
      );
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf) {
      if (!isPlainObject(branch)) continue;
      const condition = branch.if;
      const consequent = branch.then;
      if (isPlainObject(condition) && isPlainObject(consequent)) {
        const conditionHolds =
          validateAgainstJsonSchema(value, condition, root, path).length === 0;
        if (conditionHolds) {
          violations.push(
            ...validateAgainstJsonSchema(value, consequent, root, path),
          );
        }
        continue;
      }
      violations.push(...validateAgainstJsonSchema(value, branch, root, path));
    }
  }

  return violations;
}

function resolveRef(root: JsonSchemaNode, ref: string): JsonSchemaNode | null {
  if (!ref.startsWith("#/")) return null;
  let cursor: unknown = root;
  for (const segment of ref.slice(2).split("/")) {
    if (!isPlainObject(cursor)) return null;
    cursor = cursor[segment];
  }
  return isPlainObject(cursor) ? cursor : null;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** WCAG 2.2 相对亮度,供 §2.1 对比度义务机检。 */
export function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.2 对比度比值。 */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
