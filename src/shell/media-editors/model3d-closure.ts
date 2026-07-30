/**
 * §3.3 依赖闭包、§3.1 `graph` 六项的派生、§5.1 静态代理指标与 §8 完备判据。
 *
 * 全部指标都是**静态代理**：从 glTF 2.0 JSON 与闭包件的字节/像素尺寸算出,不需要
 * GPU、不需要真实设备(§5.1 明文只写静态代理,真 fps 标注「需真实设备,未验」)。
 * `graph` 六项 MUST 由本模块派生而非手填(§6 F4)。
 */

import {
  MODEL3D_BYTE_FLOORS,
  MODEL3D_CONSTANTS,
  MODEL3D_GRAPH_COUNT_KEYS,
  MODEL3D_TEXT_FLOORS,
  type Model3DGraphCountKey,
  type Model3DViewManifest,
  type Model3DViewManifestBudget,
  type Model3DViewManifestGraph,
} from "./model3d-view-manifest";

/** §6 的八个失败模式各自的错误码。 */
export const MODEL3D_FAILURE_CODES = {
  /** F1 0.6 KB 空壳。 */
  hollow: "model-3d-hollow",
  /** F2 白模(零贴图)。 */
  whiteModel: "model-3d-white-model",
  /** F3 依赖闭包不完整。 */
  closureIncomplete: "model-3d-closure-incomplete",
  /** F4 quality evidence 与实际图不符。 */
  graphMismatch: "model-3d-graph-mismatch",
  /** F5 包围盒退化。 */
  degenerateBounds: "model-3d-degenerate-bounds",
  /** F6 沙箱资源越界。 */
  sandboxBudget: "model-3d-sandbox-budget",
  /** F7 许可传染。 */
  licenseContagion: "model-3d-license-contagion",
  /** F8 孪生模型。 */
  twin: "model-3d-twin",
} as const;

export type Model3DFailureCode =
  (typeof MODEL3D_FAILURE_CODES)[keyof typeof MODEL3D_FAILURE_CODES];

export type Model3DDependencyKind = "buffer" | "image";

export interface Model3DDependencyRef {
  uri: string;
  kind: Model3DDependencyKind;
  index: number;
}

export interface Model3DClosureEntry {
  path: string;
  bytes: number;
  widthPx?: number;
  heightPx?: number;
}

type GltfDocument = Record<string, unknown>;

function list(document: GltfDocument, key: string): Record<string, unknown>[] {
  const value = document?.[key];
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
}

function count(document: GltfDocument, key: string): number {
  return Array.isArray(document?.[key])
    ? (document[key] as unknown[]).length
    : 0;
}

/**
 * §3.3:`buffers[].uri` 与 `images[].uri` 里每一条**外部**引用都是一条
 * `SourceDependency`。`data:` 内联 MUST NOT 用来规避闭包(§3.3 末),因此内联项
 * 不计入闭包但会在完备判据里被单独点名。
 */
export function model3DDependencyRefs(
  document: GltfDocument,
): Model3DDependencyRef[] {
  const refs: Model3DDependencyRef[] = [];
  for (const kind of ["buffer", "image"] as const) {
    const entries = list(document, kind === "buffer" ? "buffers" : "images");
    for (const [index, entry] of entries.entries()) {
      const uri = typeof entry.uri === "string" ? entry.uri.trim() : "";
      if (!uri || uri.startsWith("data:")) continue;
      refs.push({ uri, kind, index });
    }
  }
  return refs;
}

export function model3DInlinedDependencyRefs(
  document: GltfDocument,
): Model3DDependencyRef[] {
  const refs: Model3DDependencyRef[] = [];
  for (const kind of ["buffer", "image"] as const) {
    const entries = list(document, kind === "buffer" ? "buffers" : "images");
    for (const [index, entry] of entries.entries()) {
      const uri = typeof entry.uri === "string" ? entry.uri.trim() : "";
      if (uri.startsWith("data:")) refs.push({ uri, kind, index });
    }
  }
  return refs;
}

/**
 * §3.1 `graph` 六项 + 两项可选计数,全部由实际 glTF 图派生。
 * `dependencyCount` 取去重后的外部依赖 URI 数,与落库的 `SourceDependency`
 * 条数一致(§3.3)。
 */
export function deriveModel3DViewGraph(
  document: GltfDocument,
): Model3DViewManifestGraph {
  const dependencies = new Set(
    model3DDependencyRefs(document).map((ref) => ref.uri),
  );
  return {
    sceneCount: count(document, "scenes"),
    nodeCount: count(document, "nodes"),
    meshCount: count(document, "meshes"),
    materialCount: count(document, "materials"),
    textureCount: count(document, "textures"),
    dependencyCount: dependencies.size,
    animationCount: count(document, "animations"),
    skinCount: count(document, "skins"),
  };
}

export interface Model3DGraphMismatch {
  key: Model3DGraphCountKey;
  declared: number;
  actual: number;
}

/**
 * §3.2 `closure-resolved → graph-verified`:六项逐项**相等**才通过。不等即
 * `invalid`,不留到 catalog 发布时才由 `_validate_gltf_source` 抛
 * 「glTF graph disagrees with quality evidence」(§5.3 / §6 F4)。
 */
export function compareModel3DViewGraph(
  declared: Partial<Model3DViewManifestGraph> | undefined,
  actual: Model3DViewManifestGraph,
): { ok: boolean; mismatches: Model3DGraphMismatch[] } {
  const mismatches: Model3DGraphMismatch[] = [];
  for (const key of MODEL3D_GRAPH_COUNT_KEYS) {
    const declaredValue = Number(declared?.[key]);
    if (declaredValue !== actual[key]) {
      mismatches.push({
        key,
        declared: Number.isFinite(declaredValue) ? declaredValue : Number.NaN,
        actual: actual[key],
      });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

export type Model3DClosureState = "closure-resolved" | "degraded" | "invalid";

export interface Model3DClosureResolution {
  state: Model3DClosureState;
  code: Model3DFailureCode | "";
  missing: Model3DDependencyRef[];
  present: Model3DDependencyRef[];
  /** 闭包件字节合计(不含 `source` 本体)。 */
  closureBytes: number;
  message: string;
}

function describeMissing(missing: Model3DDependencyRef[]): string {
  return missing
    .map(
      (ref) =>
        `${ref.kind === "buffer" ? "几何二进制" : "贴图"} ${ref.kind}s[${ref.index}] → ${ref.uri}`,
    )
    .join("；");
}

/**
 * §3.3 闭包判定。`available` 是本次 revision 真正拿得到的闭包件。
 *
 * - 全部命中 → `closure-resolved`(§3.2 `parsing → closure-resolved`)。
 * - 只缺贴图、几何完整 → `degraded`(§3.2 `parsing → degraded`,可只渲白模;
 *   §5.3 明文 `degraded → ready` 不成立,MUST NOT 直接交付)。
 * - 缺 `buffers` 指向的二进制 → `invalid`(无几何即无模型)。
 *
 * 两种缺件都返回具体缺哪一件,调用方 MUST 把它显示出来而不是渲一个空场景。
 */
export function resolveModel3DDependencyClosure(
  document: GltfDocument,
  available: Iterable<string | Model3DClosureEntry>,
): Model3DClosureResolution {
  const byPath = new Map<string, Model3DClosureEntry>();
  for (const entry of available) {
    if (typeof entry === "string") {
      byPath.set(entry, { path: entry, bytes: 0 });
      continue;
    }
    if (entry && typeof entry.path === "string") byPath.set(entry.path, entry);
  }
  const refs = model3DDependencyRefs(document);
  const missing: Model3DDependencyRef[] = [];
  const present: Model3DDependencyRef[] = [];
  const countedPaths = new Set<string>();
  let closureBytes = 0;
  for (const ref of refs) {
    let decoded = ref.uri;
    try {
      decoded = decodeURIComponent(ref.uri);
    } catch {
      // A malformed escape can never match a stored closure path.
    }
    const entry = byPath.get(ref.uri) ?? byPath.get(decoded);
    if (!entry) {
      missing.push(ref);
      continue;
    }
    present.push(ref);
    if (!countedPaths.has(entry.path)) {
      countedPaths.add(entry.path);
      closureBytes += Number(entry.bytes) || 0;
    }
  }
  if (!missing.length) {
    return {
      state: "closure-resolved",
      code: "",
      missing,
      present,
      closureBytes,
      message: "",
    };
  }
  const geometryMissing = missing.some((ref) => ref.kind === "buffer");
  return {
    state: geometryMissing ? "invalid" : "degraded",
    code: MODEL3D_FAILURE_CODES.closureIncomplete,
    missing,
    present,
    closureBytes,
    message: geometryMissing
      ? `3D 依赖闭包缺少几何二进制，无法载入模型：${describeMissing(missing)}`
      : `3D 依赖闭包缺少贴图，只能渲白模（degraded，不可交付）：${describeMissing(missing)}`,
  };
}

/** 受控失败:调用方拿到的错误一定带 §6 错误码与缺件清单。 */
export class Model3DClosureError extends Error {
  readonly code: Model3DFailureCode;
  readonly state: Model3DClosureState;
  readonly missing: readonly Model3DDependencyRef[];

  constructor(resolution: Model3DClosureResolution) {
    super(resolution.message || "3D 依赖闭包不完整");
    this.name = "Model3DClosureError";
    this.code = MODEL3D_FAILURE_CODES.closureIncomplete;
    this.state = resolution.state;
    this.missing = resolution.missing;
  }
}

export interface Model3DBoundingBox {
  min: [number, number, number];
  max: [number, number, number];
  /** 三轴长。§8.2 要求各 > 0(治 F5)。 */
  size: [number, number, number];
  diagonal: number;
  /** 没有任何带 min/max 的 POSITION 访问器时为 false。 */
  derived: boolean;
}

/**
 * 静态包围盒:glTF 2.0 要求 POSITION 访问器必须声明 `min` / `max`,因此三轴长
 * 不需要解码 `.bin` 就能判(§8.2「包围盒三轴长各 > 0」)。节点变换未参与合成,
 * 这是刻意的静态代理近似。
 */
export function deriveModel3DBoundingBox(
  document: GltfDocument,
): Model3DBoundingBox {
  const accessors = list(document, "accessors");
  const min: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const max: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  let derived = false;
  for (const mesh of list(document, "meshes")) {
    for (const primitive of Array.isArray(mesh.primitives)
      ? (mesh.primitives as Record<string, unknown>[])
      : []) {
      const attributes =
        primitive && typeof primitive.attributes === "object"
          ? (primitive.attributes as Record<string, unknown>)
          : {};
      const positionIndex = Number(attributes.POSITION);
      if (!Number.isInteger(positionIndex)) continue;
      const accessor = accessors[positionIndex];
      const accessorMin = accessor?.min;
      const accessorMax = accessor?.max;
      if (!Array.isArray(accessorMin) || !Array.isArray(accessorMax)) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        const low = Number(accessorMin[axis]);
        const high = Number(accessorMax[axis]);
        if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
        derived = true;
        if (low < min[axis]) min[axis] = low;
        if (high > max[axis]) max[axis] = high;
      }
    }
  }
  if (!derived) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      size: [0, 0, 0],
      diagonal: 0,
      derived: false,
    };
  }
  const size: [number, number, number] = [
    max[0] - min[0],
    max[1] - min[1],
    max[2] - min[2],
  ];
  return {
    min,
    max,
    size,
    diagonal: Math.hypot(size[0], size[1], size[2]),
    derived: true,
  };
}

export interface Model3DStaticProxyMetrics {
  triangleCount: number;
  drawCallCount: number;
  textureMemoryBytes: number;
  sourceBytes: number;
  maxTextureEdgePx: number;
  closureBytes: number;
  /** 首屏字节 = `source` + 闭包(§5.1)。 */
  firstScreenBytes: number;
  /** 有像素尺寸凭据的贴图数;不足时 `textureMemoryBytes` 是下界。 */
  measuredTextureCount: number;
}

const TRIANGLE_MODES = new Set([4, 5, 6]);

function accessorCount(
  accessors: Record<string, unknown>[],
  index: unknown,
): number {
  if (!Number.isInteger(Number(index))) return 0;
  const value = Number(accessors[Number(index)]?.count);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function primitiveTriangles(
  primitive: Record<string, unknown>,
  accessors: Record<string, unknown>[],
): number {
  const mode = primitive.mode === undefined ? 4 : Number(primitive.mode);
  if (!TRIANGLE_MODES.has(mode)) return 0;
  const attributes =
    primitive.attributes && typeof primitive.attributes === "object"
      ? (primitive.attributes as Record<string, unknown>)
      : {};
  const vertices =
    accessorCount(accessors, primitive.indices) ||
    accessorCount(accessors, attributes.POSITION);
  if (!vertices) return 0;
  // 4 = TRIANGLES, 5 = TRIANGLE_STRIP, 6 = TRIANGLE_FAN.
  return mode === 4 ? Math.floor(vertices / 3) : Math.max(0, vertices - 2);
}

/**
 * §5.1 静态代理指标。`textureMemoryBytes` 按 RGBA8 未压缩估算
 * (`width × height × 4`),只统计拿到像素尺寸的闭包贴图,故它是**下界**;
 * `measuredTextureCount` 让校验侧知道凭据够不够。
 */
export function deriveModel3DStaticProxyMetrics(
  document: GltfDocument,
  {
    sourceBytes,
    closure = [],
  }: { sourceBytes: number; closure?: readonly Model3DClosureEntry[] },
): Model3DStaticProxyMetrics {
  const accessors = list(document, "accessors");
  const meshes = list(document, "meshes");
  const instances = new Array<number>(meshes.length).fill(0);
  for (const node of list(document, "nodes")) {
    const meshIndex = Number(node.mesh);
    if (Number.isInteger(meshIndex) && meshIndex >= 0 && meshIndex < meshes.length) {
      instances[meshIndex] += 1;
    }
  }
  let triangleCount = 0;
  let drawCallCount = 0;
  for (const [meshIndex, mesh] of meshes.entries()) {
    const primitives = Array.isArray(mesh.primitives)
      ? (mesh.primitives as Record<string, unknown>[])
      : [];
    const multiplicity = instances[meshIndex];
    if (!multiplicity) continue;
    for (const primitive of primitives) {
      const triangles = primitiveTriangles(primitive, accessors);
      triangleCount += triangles * multiplicity;
      if (triangles > 0) drawCallCount += multiplicity;
    }
  }
  let textureMemoryBytes = 0;
  let maxTextureEdgePx = 0;
  let measuredTextureCount = 0;
  let closureBytes = 0;
  const seen = new Set<string>();
  for (const entry of closure) {
    if (!entry || typeof entry.path !== "string" || seen.has(entry.path)) continue;
    seen.add(entry.path);
    closureBytes += Number(entry.bytes) || 0;
    const width = Number(entry.widthPx);
    const height = Number(entry.heightPx);
    if (width > 0 && height > 0) {
      measuredTextureCount += 1;
      textureMemoryBytes += width * height * 4;
      maxTextureEdgePx = Math.max(maxTextureEdgePx, width, height);
    }
  }
  const normalizedSourceBytes = Math.max(0, Math.trunc(Number(sourceBytes) || 0));
  return {
    triangleCount,
    drawCallCount,
    textureMemoryBytes,
    sourceBytes: normalizedSourceBytes,
    maxTextureEdgePx,
    closureBytes,
    firstScreenBytes: normalizedSourceBytes + closureBytes,
    measuredTextureCount,
  };
}

/** `budget` 也由派生指标生成,不许手填(§6 F4 同理)。 */
export function deriveModel3DViewBudget(
  metrics: Model3DStaticProxyMetrics,
): Model3DViewManifestBudget {
  return {
    triangleCount: metrics.triangleCount,
    drawCallCount: metrics.drawCallCount,
    textureMemoryBytes: metrics.textureMemoryBytes,
    sourceBytes: metrics.sourceBytes,
    ...(metrics.maxTextureEdgePx
      ? { maxTextureEdgePx: metrics.maxTextureEdgePx }
      : {}),
  };
}

export interface Model3DCompletenessFailure {
  code: Model3DFailureCode;
  criterion: string;
  expected: string;
  actual: string;
  specRef: string;
}

export interface Model3DCompletenessResult {
  ok: boolean;
  failures: Model3DCompletenessFailure[];
  graph: Model3DViewManifestGraph;
  metrics: Model3DStaticProxyMetrics;
  boundingBox: Model3DBoundingBox;
}

export interface Model3DCaptureEvidence {
  /** §8.2 抓帧颜色数 ≥ 32 (C34)。 */
  frameColorCount?: number;
  /** §8.2 缩略图最小边 ≥ 128 px (C33)。 */
  thumbnailMinEdgePx?: number;
}

/**
 * §8.1 字节下限 + §8.2 内容完备判据,全部 MUST 同时成立。
 * 空壳(614 B、无 mesh/贴图)会在这里拿到多条 `model-3d-hollow`。
 */
export function evaluateModel3DCompleteness({
  manifest,
  document,
  sourceBytes,
  closure = [],
  capture = {},
}: {
  manifest: Model3DViewManifest;
  document: GltfDocument;
  sourceBytes: number;
  closure?: readonly Model3DClosureEntry[];
  capture?: Model3DCaptureEvidence;
}): Model3DCompletenessResult {
  const failures: Model3DCompletenessFailure[] = [];
  const graph = deriveModel3DViewGraph(document);
  const metrics = deriveModel3DStaticProxyMetrics(document, {
    sourceBytes,
    closure,
  });
  const boundingBox = deriveModel3DBoundingBox(document);

  const fail = (
    code: Model3DFailureCode,
    criterion: string,
    expected: string,
    actual: string,
    specRef: string,
  ) => failures.push({ code, criterion, expected, actual, specRef });

  const assetVersion = String(
    (document?.asset as Record<string, unknown> | undefined)?.version ?? "",
  );
  if (assetVersion !== MODEL3D_CONSTANTS.C1_ASSET_VERSION) {
    fail(
      MODEL3D_FAILURE_CODES.hollow,
      "asset.version",
      MODEL3D_CONSTANTS.C1_ASSET_VERSION,
      assetVersion || "(缺失)",
      "§4 C1",
    );
  }

  const floors: [Model3DGraphCountKey, number, Model3DFailureCode, string][] = [
    ["sceneCount", MODEL3D_CONSTANTS.C2_SCENE_COUNT_MIN, MODEL3D_FAILURE_CODES.hollow, "§8.2"],
    ["nodeCount", MODEL3D_CONSTANTS.C3_NODE_COUNT_MIN, MODEL3D_FAILURE_CODES.hollow, "§4 C3"],
    ["meshCount", MODEL3D_CONSTANTS.C5_MESH_COUNT_MIN, MODEL3D_FAILURE_CODES.hollow, "§8.2"],
    ["materialCount", MODEL3D_CONSTANTS.C6_MATERIAL_COUNT_MIN, MODEL3D_FAILURE_CODES.hollow, "§8.2"],
    ["textureCount", MODEL3D_CONSTANTS.C7_TEXTURE_COUNT_MIN, MODEL3D_FAILURE_CODES.whiteModel, "§4 C7"],
    ["dependencyCount", MODEL3D_CONSTANTS.C9_DEPENDENCY_COUNT_MIN, MODEL3D_FAILURE_CODES.closureIncomplete, "§8.2"],
  ];
  for (const [key, minimum, code, specRef] of floors) {
    if (graph[key] < minimum) {
      fail(code, `graph.${key}`, `≥ ${minimum}`, String(graph[key]), specRef);
    }
  }

  const comparison = compareModel3DViewGraph(manifest.graph, graph);
  for (const mismatch of comparison.mismatches) {
    fail(
      MODEL3D_FAILURE_CODES.graphMismatch,
      `graph.${mismatch.key}`,
      `= 实际图 ${mismatch.actual}`,
      `manifest 声明 ${Number.isNaN(mismatch.declared) ? "(缺失)" : mismatch.declared}`,
      "§8.2 / §6 F4",
    );
  }

  if (metrics.triangleCount < MODEL3D_CONSTANTS.C10_TRIANGLE_COUNT_MIN) {
    fail(
      MODEL3D_FAILURE_CODES.hollow,
      "triangleCount",
      `≥ ${MODEL3D_CONSTANTS.C10_TRIANGLE_COUNT_MIN}`,
      String(metrics.triangleCount),
      "§4 C10",
    );
  }
  if (metrics.triangleCount > MODEL3D_CONSTANTS.C12_TRIANGLE_COUNT_MAX_SCENE) {
    fail(
      MODEL3D_FAILURE_CODES.sandboxBudget,
      "triangleCount",
      `≤ ${MODEL3D_CONSTANTS.C12_TRIANGLE_COUNT_MAX_SCENE}`,
      String(metrics.triangleCount),
      "§4 C12",
    );
  }
  if (metrics.drawCallCount > MODEL3D_CONSTANTS.C13_DRAW_CALL_MAX) {
    fail(
      MODEL3D_FAILURE_CODES.sandboxBudget,
      "drawCallCount",
      `≤ ${MODEL3D_CONSTANTS.C13_DRAW_CALL_MAX}`,
      String(metrics.drawCallCount),
      "§4 C13",
    );
  }
  if (
    metrics.textureMemoryBytes > MODEL3D_CONSTANTS.C14_TEXTURE_MEMORY_MAX_BYTES
  ) {
    fail(
      MODEL3D_FAILURE_CODES.sandboxBudget,
      "textureMemoryBytes",
      `≤ ${MODEL3D_CONSTANTS.C14_TEXTURE_MEMORY_MAX_BYTES}`,
      String(metrics.textureMemoryBytes),
      "§4 C14",
    );
  }
  if (metrics.maxTextureEdgePx > MODEL3D_CONSTANTS.C15_TEXTURE_EDGE_MAX_PX) {
    fail(
      MODEL3D_FAILURE_CODES.sandboxBudget,
      "maxTextureEdgePx",
      `≤ ${MODEL3D_CONSTANTS.C15_TEXTURE_EDGE_MAX_PX}`,
      String(metrics.maxTextureEdgePx),
      "§4 C15",
    );
  }
  if (metrics.firstScreenBytes > MODEL3D_CONSTANTS.C25_SOURCE_BYTES_MAX) {
    fail(
      MODEL3D_FAILURE_CODES.sandboxBudget,
      "firstScreenBytes",
      `≤ ${MODEL3D_CONSTANTS.C25_SOURCE_BYTES_MAX}`,
      String(metrics.firstScreenBytes),
      "§5.1 / §4 C25",
    );
  }

  if (metrics.sourceBytes < MODEL3D_BYTE_FLOORS.sourceBytes) {
    fail(
      MODEL3D_FAILURE_CODES.hollow,
      "source 字节",
      `≥ ${MODEL3D_BYTE_FLOORS.sourceBytes}`,
      String(metrics.sourceBytes),
      "§8.1 / §4 C24",
    );
  }
  if (metrics.sourceBytes > MODEL3D_BYTE_FLOORS.sourceBytesMax) {
    fail(
      MODEL3D_FAILURE_CODES.sandboxBudget,
      "source 字节",
      `≤ ${MODEL3D_BYTE_FLOORS.sourceBytesMax}`,
      String(metrics.sourceBytes),
      "§8.1 / §4 C25",
    );
  }
  if (metrics.closureBytes < MODEL3D_BYTE_FLOORS.closureBytes) {
    fail(
      MODEL3D_FAILURE_CODES.closureIncomplete,
      "依赖闭包字节",
      `≥ ${MODEL3D_BYTE_FLOORS.closureBytes}`,
      String(metrics.closureBytes),
      "§8.1",
    );
  }
  for (const entry of closure) {
    const looksLikeTexture =
      Number(entry?.widthPx) > 0 && Number(entry?.heightPx) > 0;
    if (!looksLikeTexture) continue;
    if ((Number(entry.bytes) || 0) < MODEL3D_BYTE_FLOORS.textureBytes) {
      fail(
        MODEL3D_FAILURE_CODES.whiteModel,
        `单贴图字节 ${entry.path}`,
        `≥ ${MODEL3D_BYTE_FLOORS.textureBytes}`,
        String(Number(entry.bytes) || 0),
        "§8.1",
      );
    }
    const edge = Math.min(Number(entry.widthPx), Number(entry.heightPx));
    if (edge < MODEL3D_CONSTANTS.C16_TEXTURE_EDGE_MIN_PX) {
      fail(
        MODEL3D_FAILURE_CODES.whiteModel,
        `单贴图边长 ${entry.path}`,
        `≥ ${MODEL3D_CONSTANTS.C16_TEXTURE_EDGE_MIN_PX} px`,
        `${edge} px`,
        "§4 C16",
      );
    }
  }

  if (!boundingBox.derived) {
    fail(
      MODEL3D_FAILURE_CODES.degenerateBounds,
      "包围盒",
      "POSITION 访问器声明 min/max",
      "无法派生",
      "§8.2 / §6 F5",
    );
  } else {
    for (const [axis, length] of boundingBox.size.entries()) {
      if (length > 0) continue;
      fail(
        MODEL3D_FAILURE_CODES.degenerateBounds,
        `包围盒轴 ${"XYZ"[axis]}`,
        "> 0",
        String(length),
        "§8.2 / §6 F5",
      );
    }
  }

  if (
    typeof manifest.description !== "string" ||
    manifest.description.length < MODEL3D_TEXT_FLOORS.descriptionMinLength
  ) {
    fail(
      MODEL3D_FAILURE_CODES.hollow,
      "description 长度",
      `≥ ${MODEL3D_TEXT_FLOORS.descriptionMinLength}`,
      String(manifest.description?.length ?? 0),
      "§8.2 / WCAG 2.2 SC 1.1.1",
    );
  }
  if (
    typeof manifest.title !== "string" ||
    manifest.title.length < MODEL3D_TEXT_FLOORS.titleMinLength
  ) {
    fail(
      MODEL3D_FAILURE_CODES.hollow,
      "title 长度",
      `≥ ${MODEL3D_TEXT_FLOORS.titleMinLength}`,
      String(manifest.title?.length ?? 0),
      "§8.2",
    );
  }

  const entries = manifest.attribution?.entries;
  if (!Array.isArray(entries) || entries.length < 1) {
    fail(
      MODEL3D_FAILURE_CODES.licenseContagion,
      "attribution.entries",
      "≥ 1 且三字段齐全",
      String(entries?.length ?? 0),
      "§8.2 / §5.5",
    );
  } else {
    for (const [index, entry] of entries.entries()) {
      if (entry?.text && entry?.licenseCode && entry?.licenseUrl) continue;
      fail(
        MODEL3D_FAILURE_CODES.licenseContagion,
        `attribution.entries[${index}]`,
        "text / licenseCode / licenseUrl 齐全",
        JSON.stringify(entry ?? null),
        "§8.2",
      );
    }
  }

  if (capture.frameColorCount !== undefined) {
    if (capture.frameColorCount < MODEL3D_CONSTANTS.C34_FRAME_COLOR_COUNT_MIN) {
      fail(
        MODEL3D_FAILURE_CODES.whiteModel,
        "抓帧颜色数",
        `≥ ${MODEL3D_CONSTANTS.C34_FRAME_COLOR_COUNT_MIN}`,
        String(capture.frameColorCount),
        "§8.2 / §4 C34",
      );
    }
  }
  if (capture.thumbnailMinEdgePx !== undefined) {
    if (capture.thumbnailMinEdgePx < MODEL3D_CONSTANTS.C33_COVER_MIN_EDGE_PX) {
      fail(
        MODEL3D_FAILURE_CODES.hollow,
        "缩略图最小边",
        `≥ ${MODEL3D_CONSTANTS.C33_COVER_MIN_EDGE_PX} px`,
        `${capture.thumbnailMinEdgePx} px`,
        "§8.2 / §4 C33",
      );
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    graph,
    metrics,
    boundingBox,
  };
}

/**
 * §2.1 相机距离 = 2.4 × 包围盒对角线,并按 §4 C22 的 1.2 – 6 域夹取
 * (§6 F5 兜底:退化包围盒 MUST NOT 把距离算成 0 或 Infinity)。
 */
export function model3DCameraDistance(
  boundingBox: Model3DBoundingBox,
  distanceFactor: number,
): number {
  const factor = Math.min(
    6,
    Math.max(1.2, Number.isFinite(distanceFactor) ? distanceFactor : 2.4),
  );
  const diagonal = Number.isFinite(boundingBox.diagonal)
    ? boundingBox.diagonal
    : 0;
  if (!(diagonal > 0)) {
    throw new Error(
      `${MODEL3D_FAILURE_CODES.degenerateBounds}: 包围盒退化，无法按 §2.1 取景`,
    );
  }
  return diagonal * factor;
}
