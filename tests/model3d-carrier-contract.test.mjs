/**
 * L1 载体契约 model-3d v1 的聚焦验证。
 * 规格:docs/specs/oceanleo-material-and-game-v1/L1-carriers/model-3d.md
 */
import assert from "node:assert/strict";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MODEL3D_ALLOWED_LOADER_FILES,
  MODEL3D_CARRIER_CONTRACT,
  MODEL3D_EXTENSION_LOADERS,
  MODEL3D_FORBIDDEN_LOADER_FILES,
  MODEL3D_THREE_ADDONS,
  MODEL3D_THREE_ADDON_FILE_COUNT,
  MODEL3D_THREE_VERSION,
  MODEL3D_VIEW_ONLY_TOLERATED_FORMATS,
  assertModel3DLoaderFile,
} from "../src/shell/media-editors/model3d-runtime-lock.ts";
import {
  MODEL3D_BYTE_FLOORS,
  MODEL3D_CONSTANTS,
  MODEL3D_DEFAULT_CAMERA,
  MODEL3D_DEFAULT_LIGHTING,
  MODEL3D_FRAMING,
  MODEL3D_GRAPH_COUNT_KEYS,
  MODEL3D_STAGE_TOKENS,
  MODEL3D_VIEW_MANIFEST_JSON_SCHEMA,
  MODEL3D_VIEW_MANIFEST_SCHEMA,
  createModel3DViewManifest,
  parseModel3DViewManifest,
  serializeModel3DViewManifest,
  validateModel3DViewManifest,
} from "../src/shell/media-editors/model3d-view-manifest.ts";
import {
  MODEL3D_FAILURE_CODES,
  Model3DClosureError,
  compareModel3DViewGraph,
  deriveModel3DBoundingBox,
  deriveModel3DStaticProxyMetrics,
  deriveModel3DViewBudget,
  deriveModel3DViewGraph,
  evaluateModel3DCompleteness,
  model3DCameraDistance,
  model3DDependencyRefs,
  model3DInlinedDependencyRefs,
  resolveModel3DDependencyClosure,
} from "../src/shell/media-editors/model3d-closure.ts";
import {
  MODEL3D_FORBIDDEN_LOAD_TRANSITIONS,
  MODEL3D_LOAD_TRANSITIONS,
  Model3DLoadTransitionError,
  isDeliverableModel3DLoadState,
  isLegalModel3DLoadTransition,
  model3DLoadTransition,
} from "../src/shell/media-editors/model3d-load-state.ts";
import {
  model3DCameraOffset,
  model3DFramingCoverage,
  model3DKeyLightOffset,
  model3DPreviewCanvas,
  model3DStageBackgroundCss,
  model3DThumbnailCanvas,
} from "../src/shell/media-editors/model3d-framing.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "..");
const readSource = (relative) =>
  readFileSync(resolvePath(repoRoot, relative), "utf8");

/** 一份「够真」的 glTF 2.0:2 节点 / 1 网格 / 1 材质 / 1 贴图 / 600 三角面。 */
function realisticGltf({ triangles = 600, textures = 1 } = {}) {
  return {
    asset: { version: "2.0", generator: "oceanleo-test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ children: [1], name: "Root" }, { mesh: 0, name: "Body" }],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 1, material: 0, mode: 4 },
        ],
      },
    ],
    materials: [
      { pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, name: "Body" },
    ],
    textures: Array.from({ length: textures }, (_unused, index) => ({
      source: index,
      sampler: 0,
    })),
    samplers: [{ magFilter: 9729, minFilter: 9987 }],
    images: Array.from({ length: textures }, (_unused, index) => ({
      uri: `textures/base-${index}.png`,
    })),
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: triangles * 3,
        type: "VEC3",
        min: [-1, 0, -1],
        max: [1, 2, 1],
      },
      { bufferView: 1, componentType: 5125, count: triangles * 3, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: triangles * 3, type: "VEC2" },
    ],
    bufferViews: [
      { buffer: 0, byteLength: triangles * 36 },
      { buffer: 0, byteLength: triangles * 12 },
      { buffer: 0, byteLength: triangles * 24 },
    ],
    buffers: [{ uri: "scene.bin", byteLength: triangles * 72 }],
  };
}

function realisticClosure({ textures = 1 } = {}) {
  return [
    { path: "scene.bin", bytes: 64_000 },
    ...Array.from({ length: textures }, (_unused, index) => ({
      path: `textures/base-${index}.png`,
      bytes: 48_000,
      widthPx: 1_024,
      heightPx: 1_024,
    })),
  ];
}

function realisticManifest(document, closure, sourceBytes) {
  const metrics = deriveModel3DStaticProxyMetrics(document, {
    sourceBytes,
    closure,
  });
  return createModel3DViewManifest({
    title: "CC0 木质边桌白模测试件",
    description: "一件 CC0 木质边桌,带基础色贴图与接地阴影,用于契约自证。",
    graph: deriveModel3DViewGraph(document),
    budget: deriveModel3DViewBudget(metrics),
    environment: {
      hdriAssetId: "polyhaven/studio_small_03_2k.hdr",
      hdriLicenseCode: "CC0",
      intensity: 1,
      background: "gradient",
    },
    attribution: [
      {
        text: "Poly Haven, CC0",
        licenseCode: "CC0-1.0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    ],
  });
}

/* ---------------------------------------------------------------- §1.1 / §1.2 */

test("§1.1 四元组与 view_only 容忍格式逐字落地", () => {
  assert.equal(MODEL3D_CARRIER_CONTRACT.featureId, "model_3d");
  assert.equal(MODEL3D_CARRIER_CONTRACT.artifactType, "model_3d");
  assert.equal(MODEL3D_CARRIER_CONTRACT.sourceFormat, "gltf");
  assert.notEqual(MODEL3D_CARRIER_CONTRACT.sourceFormat, "glb");
  assert.equal(MODEL3D_CARRIER_CONTRACT.sourceMediaType, "model/gltf+json");
  assert.equal(MODEL3D_CARRIER_CONTRACT.editorCapability, "model-3d-editor");
  assert.equal(MODEL3D_CARRIER_CONTRACT.adapter, "threed");
  assert.equal(MODEL3D_CARRIER_CONTRACT.projectSchema, MODEL3D_VIEW_MANIFEST_SCHEMA);
  assert.equal(MODEL3D_CARRIER_CONTRACT.editability, "bounded");
  assert.equal(
    MODEL3D_CARRIER_CONTRACT.sourceIntegrity,
    "complete_dependency_closure",
  );
  assert.equal(MODEL3D_CARRIER_CONTRACT.requirementSchema, "gltf/2.0");
  assert.deepEqual(MODEL3D_CARRIER_CONTRACT.requirementPaths, [
    "asset.version",
    "buffers",
  ]);
  assert.equal(MODEL3D_CARRIER_CONTRACT.dependencyClosure, "complete");
  assert.deepEqual([...MODEL3D_VIEW_ONLY_TOLERATED_FORMATS], [
    "glb",
    "obj",
    "fbx",
    "stl",
    "usdz",
  ]);
});

test("§1.2 three 版本锁:每个 addon 都能在 node_modules 指出真实文件", () => {
  // `three` 的 exports 不导出 ./package.json,所以按 realpath 走到 pnpm 实存目录,
  // 这样凭据里给出的是真实落盘路径而不是符号链接。
  const threeRoot = realpathSync(resolvePath(repoRoot, "node_modules/three"));
  const threePackage = resolvePath(threeRoot, "package.json");
  const installed = JSON.parse(readFileSync(threePackage, "utf8"));
  assert.equal(installed.version, MODEL3D_THREE_VERSION);
  assert.equal(MODEL3D_THREE_VERSION, "0.183.2");
  const evidence = [];
  for (const addon of MODEL3D_THREE_ADDONS) {
    const absolute = resolvePath(threeRoot, addon.addonPath);
    const stats = statSync(absolute);
    assert.ok(stats.isFile(), `${addon.name} 必须是真实文件`);
    assert.ok(stats.size > 0, `${addon.name} 不能是空文件`);
    evidence.push(`${addon.name} → ${absolute} (${stats.size} B)`);
  }
  // §0.3:契约只许点名实测存在的 loader。
  for (const file of MODEL3D_ALLOWED_LOADER_FILES) {
    const absolute = resolvePath(threeRoot, "examples/jsm/loaders", file);
    assert.ok(statSync(absolute).isFile(), `${file} 必须实测存在`);
  }
  for (const forbidden of MODEL3D_FORBIDDEN_LOADER_FILES) {
    assert.throws(
      () => assertModel3DLoaderFile(forbidden),
      /不在 model-3d 契约 §0.3/,
      `${forbidden} 必须被拒绝`,
    );
  }
  assert.equal(MODEL3D_EXTENSION_LOADERS.KHR_draco_mesh_compression, "DRACOLoader.js");
  assert.equal(MODEL3D_EXTENSION_LOADERS.KHR_texture_basisu, "KTX2Loader.js");

  const addonCount = Number(
    execFileSync(
      "bash",
      [
        "-c",
        `find ${JSON.stringify(threeRoot)}/examples/jsm -name '*.js' | wc -l`,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  assert.equal(addonCount, MODEL3D_THREE_ADDON_FILE_COUNT);
  console.log(`[§1.2 版本锁凭据] three@${installed.version}\n  ${evidence.join("\n  ")}`);
});

test("§1.3 CSP 边界:model3d 簇不改 CSP、不走 CDN、不放开 connect-src", () => {
  const owned = [
    "src/shell/media-editors/model3d-view-manifest.ts",
    "src/shell/media-editors/model3d-closure.ts",
    "src/shell/media-editors/model3d-load-state.ts",
    "src/shell/media-editors/model3d-runtime-lock.ts",
    "src/shell/media-editors/model3d-framing.mjs",
    "src/shell/media-editors/model3d-files.ts",
    "src/shell/media-editors/model3d-runtime.mjs",
    "src/shell/media-editors/Model3DStage.tsx",
    "src/shell/media-editors/use-model3d-source-loader.ts",
    "src/shell/advanced-routes/Model3DRoute.tsx",
  ];
  for (const relative of owned) {
    const source = readSource(relative);
    for (const forbidden of [
      "connect-src",
      "Content-Security-Policy",
      "contentSecurityPolicy",
      "unpkg.com",
      "cdn.jsdelivr.net",
      "cdnjs.cloudflare.com",
      "esm.sh",
    ]) {
      assert.ok(
        !source.includes(forbidden),
        `${relative} MUST NOT 出现 ${forbidden}（ADR-07 §1.3）`,
      );
    }
  }
  // 3D 运行时只许点名 three(§1.2 末)。
  const runtime = readSource("src/shell/media-editors/model3d-runtime.mjs");
  for (const foreign of ["phaser", "cannon-es", "rapier", "matter-js", "howler"]) {
    assert.ok(!runtime.toLowerCase().includes(foreign), `MUST NOT 点名 ${foreign}`);
  }
});

/* -------------------------------------------------------------------- §2 视觉靶 */

test("§2.1–§2.3 默认镜头、打光、背景与取景逐字照规格", () => {
  assert.deepEqual({ ...MODEL3D_DEFAULT_CAMERA }, {
    fovDeg: 45,
    nearPlane: 0.1,
    farPlane: 1_000,
    pitchDeg: 20,
    yawDeg: 35,
    distanceFactor: 2.4,
  });
  assert.deepEqual({ ...MODEL3D_DEFAULT_LIGHTING }, {
    keyIntensity: 3.0,
    fillIntensity: 1.2,
    ambientIntensity: 0.6,
    keyAzimuthDeg: 45,
    keyElevationDeg: 55,
    shadows: true,
  });
  assert.deepEqual({ ...MODEL3D_STAGE_TOKENS }, {
    "stage.bg.top": "#2A2F36",
    "stage.bg.bottom": "#14171B",
    "stage.ground": "#0F1215",
    "stage.accent": "#1F6FEB",
    "stage.grid": "#3A4149",
  });
  assert.deepEqual({ ...MODEL3D_FRAMING }, {
    previewWidthPx: 1_200,
    previewHeightPx: 900,
    thumbnailEdgePx: 512,
    modelHeightRatio: 0.72,
    minimumMarginPercent: 8,
  });
  assert.deepEqual(model3DPreviewCanvas(), { widthPx: 1_200, heightPx: 900 });
  assert.deepEqual(model3DThumbnailCanvas(), { widthPx: 512, heightPx: 512 });
  assert.equal(
    model3DStageBackgroundCss(),
    "linear-gradient(180deg, #2A2F36 0%, #14171B 100%)",
  );
});

test("§2.1 视觉靶被运行时与舞台真正消费,不只是常量表", () => {
  const runtime = readSource("src/shell/media-editors/model3d-runtime.mjs");
  assert.match(runtime, /MODEL3D_DEFAULT_CAMERA\.fovDeg/);
  assert.match(runtime, /MODEL3D_DEFAULT_CAMERA\.nearPlane/);
  assert.match(runtime, /MODEL3D_DEFAULT_CAMERA\.farPlane/);
  assert.match(runtime, /MODEL3D_DEFAULT_LIGHTING\.keyIntensity/);
  assert.match(runtime, /MODEL3D_DEFAULT_LIGHTING\.fillIntensity/);
  assert.match(runtime, /MODEL3D_DEFAULT_LIGHTING\.ambientIntensity/);
  assert.match(runtime, /MODEL3D_STAGE_TOKENS\["stage\.grid"\]/);
  assert.match(runtime, /MODEL3D_STAGE_TOKENS\["stage\.ground"\]/);
  assert.match(runtime, /model3DKeyLightOffset/);
  const stage = readSource("src/shell/media-editors/Model3DStage.tsx");
  assert.match(stage, /model3DStageBackgroundCss\(\)/);
});

test("§2.1 相机距离 2.4 × 对角线,退化包围盒受控失败", () => {
  const offset = model3DCameraOffset({ diagonal: 10 });
  assert.equal(offset.distance, 24);
  assert.ok(offset.y > 0, "俯仰 20° 应在水平面之上");
  assert.ok(Math.abs(Math.hypot(offset.x, offset.y, offset.z) - 24) < 1e-9);
  // C22 域夹取 1.2 – 6。
  assert.equal(model3DCameraOffset({ diagonal: 10, distanceFactor: 99 }).distance, 60);
  assert.equal(model3DCameraOffset({ diagonal: 10, distanceFactor: 0 }).distance, 12);
  assert.equal(model3DCameraOffset({ diagonal: 0 }).distance, 0);
  assert.throws(
    () =>
      model3DCameraDistance(
        { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], diagonal: 0, derived: true },
        2.4,
      ),
    new RegExp(MODEL3D_FAILURE_CODES.degenerateBounds),
  );
  const key = model3DKeyLightOffset(10);
  assert.ok(key.y > 0 && key.x > 0 && key.z > 0, "主光在 45°/55° 象限");
});

test("§2.3 取景覆盖率可测:2.4 × 对角线在 FOV 45° 下达不到 0.72(规格内部冲突)", () => {
  const coverage = model3DFramingCoverage({ distance: 24, modelHeight: 10 });
  assert.ok(coverage.heightRatio > 0);
  assert.ok(
    coverage.heightRatio < MODEL3D_FRAMING.modelHeightRatio,
    "C22 与 C32 无法同时满足,marker 已上报",
  );
  assert.ok(coverage.marginPercent >= MODEL3D_FRAMING.minimumMarginPercent);
});

/* ---------------------------------------------------------------- §3.1 Schema */

test("§3.1 JSON Schema 逐字段与规格一致", () => {
  const schema = MODEL3D_VIEW_MANIFEST_JSON_SCHEMA;
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$id, "https://oceanleo.com/schemas/oceanleo.model-view@1.json");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required], [
    "schema",
    "version",
    "title",
    "description",
    "camera",
    "lighting",
    "budget",
    "graph",
    "attribution",
  ]);
  assert.equal(schema.properties.schema.const, "oceanleo.model-view@1");
  assert.deepEqual({ ...schema.properties.camera.properties.fovDeg }, {
    type: "number",
    minimum: 20,
    maximum: 90,
  });
  assert.deepEqual({ ...schema.properties.camera.properties.nearPlane }, {
    type: "number",
    exclusiveMinimum: 0,
    maximum: 10,
  });
  assert.deepEqual({ ...schema.properties.camera.properties.yawDeg }, {
    type: "number",
    minimum: 0,
    exclusiveMaximum: 360,
  });
  assert.deepEqual({ ...schema.properties.camera.properties.distanceFactor }, {
    type: "number",
    minimum: 1.2,
    maximum: 6,
  });
  assert.deepEqual({ ...schema.properties.budget.properties.sourceBytes }, {
    type: "integer",
    minimum: 20480,
    maximum: 52428800,
  });
  assert.deepEqual({ ...schema.properties.budget.properties.textureMemoryBytes }, {
    type: "integer",
    minimum: 0,
    maximum: 268435456,
  });
  assert.deepEqual({ ...schema.properties.graph.properties.nodeCount }, {
    type: "integer",
    minimum: 2,
    maximum: 5000,
  });
  assert.deepEqual({ ...schema.properties.graph.properties.textureCount }, {
    type: "integer",
    minimum: 1,
    maximum: 100,
  });
  assert.deepEqual([...schema.properties.environment.properties.hdriLicenseCode.enum], [
    "CC0",
    "PDM",
  ]);
  assert.deepEqual([...schema.properties.environment.properties.background.enum], [
    "gradient",
    "hdri",
    "solid",
  ]);
  assert.equal(schema.properties.attribution.properties.entries.minItems, 1);
  assert.equal(schema.properties.attribution.properties.entries.maxItems, 12);
  assert.equal(
    schema.properties.attribution.properties.entries.items.properties.licenseUrl
      .pattern,
    "^https://",
  );
  // §3.1 末:graph 六键与 _validate_gltf_source 逐字同名。
  assert.deepEqual([...MODEL3D_GRAPH_COUNT_KEYS], [
    "sceneCount",
    "nodeCount",
    "meshCount",
    "materialCount",
    "textureCount",
    "dependencyCount",
  ]);
});

test("§3.1 校验:合法 manifest 通过,越界与未知字段逐条被点名", () => {
  const document = realisticGltf();
  const closure = realisticClosure();
  const manifest = realisticManifest(document, closure, 40_960);
  const validated = validateModel3DViewManifest(manifest);
  assert.equal(validated.ok, true, JSON.stringify(validated.errors ?? []));
  assert.equal(manifest.camera.fovDeg, 45);
  assert.equal(manifest.lighting.keyIntensity, 3);

  const bad = validateModel3DViewManifest({
    ...manifest,
    extra: 1,
    camera: { ...manifest.camera, fovDeg: 120, yawDeg: 360 },
    graph: { ...manifest.graph, nodeCount: 1 },
    attribution: { entries: [] },
  });
  assert.equal(bad.ok, false);
  const paths = bad.errors.map((entry) => entry.path);
  assert.ok(paths.includes("/extra"));
  assert.ok(paths.includes("/camera/fovDeg"));
  assert.ok(paths.includes("/camera/yawDeg"));
  assert.ok(paths.includes("/graph/nodeCount"));
  assert.ok(paths.includes("/attribution/entries"));

  // §5.5 许可锁:HDRI 只允许 CC0 / PDM。
  const contagious = validateModel3DViewManifest({
    ...manifest,
    environment: { ...manifest.environment, hdriLicenseCode: "CC-BY-SA-4.0" },
  });
  assert.equal(contagious.ok, false);
  assert.ok(
    contagious.errors.some(
      (entry) => entry.code === MODEL3D_FAILURE_CODES.licenseContagion,
    ),
  );

  const httpLicense = validateModel3DViewManifest({
    ...manifest,
    attribution: {
      entries: [
        { text: "x source", licenseCode: "CC0-1.0", licenseUrl: "http://example.com/l" },
      ],
    },
  });
  assert.equal(httpLicense.ok, false);
  assert.ok(
    httpLicense.errors.some((entry) => entry.code === "model-view-pattern"),
  );
});

test("§3.1 序列化确定性,parse 拒绝非法 manifest", () => {
  const document = realisticGltf();
  const closure = realisticClosure();
  const manifest = realisticManifest(document, closure, 40_960);
  const first = serializeModel3DViewManifest(manifest);
  const second = serializeModel3DViewManifest(
    parseModel3DViewManifest(first),
  );
  assert.equal(first, second, "同一 manifest 必须序列化成同一字节串");
  assert.equal(JSON.parse(first).schema, MODEL3D_VIEW_MANIFEST_SCHEMA);
  assert.throws(
    () => parseModel3DViewManifest("{"),
    /JSON 无法解析/,
  );
  assert.throws(
    () => parseModel3DViewManifest(JSON.stringify({ schema: "nope" })),
    /校验失败/,
  );
});

/* --------------------------------------------------------------- §3.2 状态机 */

test("§3.2 载入状态机:合法通路走到 ready,五条非法迁移全部封死", () => {
  let state = "empty";
  state = model3DLoadTransition(state, "source-bytes");
  assert.equal(state, "parsing");
  state = model3DLoadTransition(state, "closure-complete");
  assert.equal(state, "closure-resolved");
  state = model3DLoadTransition(state, "graph-equal");
  assert.equal(state, "graph-verified");
  state = model3DLoadTransition(state, "framed");
  assert.equal(state, "staged");
  state = model3DLoadTransition(state, "preview-complete");
  assert.equal(state, "ready");
  assert.ok(isDeliverableModel3DLoadState(state));

  assert.equal(model3DLoadTransition("parsing", "closure-missing-texture"), "degraded");
  assert.equal(model3DLoadTransition("parsing", "closure-missing-geometry"), "invalid");
  assert.equal(model3DLoadTransition("closure-resolved", "graph-mismatch"), "invalid");
  assert.equal(model3DLoadTransition("staged", "bounds-degenerate"), "invalid");

  assert.equal(MODEL3D_FORBIDDEN_LOAD_TRANSITIONS.length, 5);
  for (const forbidden of MODEL3D_FORBIDDEN_LOAD_TRANSITIONS) {
    assert.equal(
      isLegalModel3DLoadTransition(forbidden.from, forbidden.to),
      false,
      `${forbidden.from} → ${forbidden.to} MUST NOT 合法：${forbidden.reason}`,
    );
  }
  assert.equal(isDeliverableModel3DLoadState("degraded"), false);
  assert.equal(isDeliverableModel3DLoadState("invalid"), false);
  assert.throws(
    () => model3DLoadTransition("degraded", "preview-complete"),
    Model3DLoadTransitionError,
  );
  assert.ok(MODEL3D_LOAD_TRANSITIONS.length >= 10);
});

/* --------------------------------------------------------------- §3.3 闭包 */

test("§3.3 依赖闭包:gltf + bin + 贴图全命中才 closure-resolved", () => {
  const document = realisticGltf({ textures: 2 });
  const refs = model3DDependencyRefs(document);
  assert.deepEqual(refs.map((ref) => ref.uri), [
    "scene.bin",
    "textures/base-0.png",
    "textures/base-1.png",
  ]);
  assert.deepEqual(refs.map((ref) => ref.kind), ["buffer", "image", "image"]);

  const complete = resolveModel3DDependencyClosure(
    document,
    realisticClosure({ textures: 2 }),
  );
  assert.equal(complete.state, "closure-resolved");
  assert.equal(complete.code, "");
  assert.deepEqual(complete.missing, []);
  assert.equal(complete.closureBytes, 64_000 + 48_000 * 2);
  assert.equal(deriveModel3DViewGraph(document).dependencyCount, 3);
});

test("§3.3/§6 缺件受控失败并点名缺哪一件,MUST NOT 静默空场景", () => {
  const document = realisticGltf({ textures: 2 });

  const missingTexture = resolveModel3DDependencyClosure(document, [
    { path: "scene.bin", bytes: 64_000 },
    { path: "textures/base-0.png", bytes: 48_000, widthPx: 512, heightPx: 512 },
  ]);
  assert.equal(missingTexture.state, "degraded");
  assert.equal(missingTexture.code, MODEL3D_FAILURE_CODES.closureIncomplete);
  assert.deepEqual(
    missingTexture.missing.map((ref) => ref.uri),
    ["textures/base-1.png"],
  );
  assert.match(missingTexture.message, /textures\/base-1\.png/);
  assert.match(missingTexture.message, /贴图/);
  assert.match(missingTexture.message, /白模|degraded/);

  const missingGeometry = resolveModel3DDependencyClosure(document, [
    { path: "textures/base-0.png", bytes: 48_000 },
    { path: "textures/base-1.png", bytes: 48_000 },
  ]);
  assert.equal(missingGeometry.state, "invalid");
  assert.match(missingGeometry.message, /scene\.bin/);
  assert.match(missingGeometry.message, /几何/);

  const error = new Model3DClosureError(missingGeometry);
  assert.equal(error.code, MODEL3D_FAILURE_CODES.closureIncomplete);
  assert.equal(error.state, "invalid");
  assert.match(error.message, /scene\.bin/);
  assert.equal(error.missing.length, 1);

  // 载入路径把 §6 错误码与缺件一起交给 UI,舞台有可断言的报错面。
  const loader = readSource("src/shell/media-editors/use-model3d-source-loader.ts");
  assert.match(loader, /Model3DClosureError/);
  assert.match(loader, /\[\$\{caught\.code\}\]/);
  const files = readSource("src/shell/media-editors/model3d-files.ts");
  assert.match(files, /closureFailure\(document, uri/);
  assert.match(files, /resolveModel3DDependencyClosure/);
  const stage = readSource("src/shell/media-editors/Model3DStage.tsx");
  assert.match(stage, /data-testid="model3d-load-error"/);
});

test("§3.3 data: 内联不算闭包件,规避闭包会被识别出来", () => {
  const document = {
    asset: { version: "2.0" },
    buffers: [{ uri: "data:application/octet-stream;base64,AAAA" }],
    images: [{ uri: "textures/base.png" }],
  };
  assert.deepEqual(
    model3DDependencyRefs(document).map((ref) => ref.uri),
    ["textures/base.png"],
  );
  assert.equal(model3DInlinedDependencyRefs(document).length, 1);
  assert.equal(deriveModel3DViewGraph(document).dependencyCount, 1);
});

/* ---------------------------------------------- §5.1 静态代理指标 / §8 判据 */

test("§5.1 静态代理指标由解析器派生,不许手填", () => {
  const document = realisticGltf({ triangles: 600 });
  const closure = realisticClosure();
  const metrics = deriveModel3DStaticProxyMetrics(document, {
    sourceBytes: 40_960,
    closure,
  });
  assert.equal(metrics.triangleCount, 600);
  assert.equal(metrics.drawCallCount, 1);
  assert.equal(metrics.textureMemoryBytes, 1_024 * 1_024 * 4);
  assert.equal(metrics.maxTextureEdgePx, 1_024);
  assert.equal(metrics.sourceBytes, 40_960);
  assert.equal(metrics.closureBytes, 112_000);
  assert.equal(metrics.firstScreenBytes, 40_960 + 112_000);
  assert.equal(metrics.measuredTextureCount, 1);

  const budget = deriveModel3DViewBudget(metrics);
  assert.deepEqual(budget, {
    triangleCount: 600,
    drawCallCount: 1,
    textureMemoryBytes: 1_024 * 1_024 * 4,
    sourceBytes: 40_960,
    maxTextureEdgePx: 1_024,
  });

  const box = deriveModel3DBoundingBox(document);
  assert.equal(box.derived, true);
  assert.deepEqual(box.size, [2, 2, 2]);
  assert.ok(Math.abs(box.diagonal - Math.sqrt(12)) < 1e-9);
});

test("§8.1/§8.2 真产物达标,§6 F4 图不符被 closure-resolved 就地拦下", () => {
  const document = realisticGltf();
  const closure = realisticClosure();
  const manifest = realisticManifest(document, closure, 40_960);
  const verdict = evaluateModel3DCompleteness({
    manifest,
    document,
    sourceBytes: 40_960,
    closure,
    capture: { frameColorCount: 4_096, thumbnailMinEdgePx: 512 },
  });
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);

  const handFilled = {
    ...manifest,
    graph: { ...manifest.graph, nodeCount: 99 },
  };
  const mismatch = evaluateModel3DCompleteness({
    manifest: handFilled,
    document,
    sourceBytes: 40_960,
    closure,
  });
  assert.equal(mismatch.ok, false);
  assert.ok(
    mismatch.failures.some(
      (entry) => entry.code === MODEL3D_FAILURE_CODES.graphMismatch,
    ),
  );
  assert.equal(compareModel3DViewGraph(handFilled.graph, verdict.graph).ok, false);
  assert.equal(compareModel3DViewGraph(manifest.graph, verdict.graph).ok, true);
});

test("§6 F1 空壳(614 B、无 mesh/贴图)必须不合格", () => {
  const hollow = { asset: { version: "2.0", generator: "hollow" }, scenes: [{}] };
  const hollowBytes = Buffer.byteLength(JSON.stringify(hollow));
  assert.ok(hollowBytes < MODEL3D_BYTE_FLOORS.sourceBytes);
  const verdict = evaluateModel3DCompleteness({
    manifest: {
      schema: MODEL3D_VIEW_MANIFEST_SCHEMA,
      version: 1,
      title: "空壳模型样例",
      description: "空壳模型样例说明",
      camera: { ...MODEL3D_DEFAULT_CAMERA },
      lighting: { ...MODEL3D_DEFAULT_LIGHTING },
      budget: {
        triangleCount: 500,
        drawCallCount: 1,
        textureMemoryBytes: 0,
        sourceBytes: 20_480,
      },
      graph: {
        sceneCount: 1,
        nodeCount: 2,
        meshCount: 1,
        materialCount: 1,
        textureCount: 1,
        dependencyCount: 1,
      },
      attribution: {
        entries: [
          {
            text: "空壳",
            licenseCode: "CC0-1.0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          },
        ],
      },
    },
    document: hollow,
    sourceBytes: 614,
    closure: [],
  });
  assert.equal(verdict.ok, false);
  const codes = new Set(verdict.failures.map((entry) => entry.code));
  assert.ok(codes.has(MODEL3D_FAILURE_CODES.hollow), "字节与网格下限必须拒绝空壳");
  assert.ok(codes.has(MODEL3D_FAILURE_CODES.whiteModel), "零贴图必须拒绝");
  assert.ok(codes.has(MODEL3D_FAILURE_CODES.closureIncomplete), "空闭包必须拒绝");
  assert.ok(codes.has(MODEL3D_FAILURE_CODES.graphMismatch), "手填计数必须拒绝");
  assert.ok(codes.has(MODEL3D_FAILURE_CODES.degenerateBounds), "无包围盒必须拒绝");
  const hollowFailure = verdict.failures.find(
    (entry) => entry.criterion === "source 字节",
  );
  assert.equal(hollowFailure.expected, `≥ ${MODEL3D_BYTE_FLOORS.sourceBytes}`);
  assert.equal(hollowFailure.actual, "614");
});

test("§8.2 白模、退化包围盒、抓帧颜色数与缩略图下限各自可判", () => {
  const document = realisticGltf();
  const closure = realisticClosure();
  const manifest = realisticManifest(document, closure, 40_960);

  const whiteModel = { ...document, textures: [], images: [] };
  const whiteVerdict = evaluateModel3DCompleteness({
    manifest: {
      ...manifest,
      graph: deriveModel3DViewGraph(whiteModel),
    },
    document: whiteModel,
    sourceBytes: 40_960,
    closure: [{ path: "scene.bin", bytes: 64_000 }],
  });
  assert.equal(whiteVerdict.ok, false);
  assert.ok(
    whiteVerdict.failures.some(
      (entry) =>
        entry.code === MODEL3D_FAILURE_CODES.whiteModel &&
        entry.criterion === "graph.textureCount",
    ),
    "C7 零贴图必须被拒",
  );

  const flat = structuredClone(document);
  flat.accessors[0].min = [-1, 0, -1];
  flat.accessors[0].max = [1, 0, 1];
  const flatVerdict = evaluateModel3DCompleteness({
    manifest,
    document: flat,
    sourceBytes: 40_960,
    closure,
  });
  assert.ok(
    flatVerdict.failures.some(
      (entry) => entry.code === MODEL3D_FAILURE_CODES.degenerateBounds,
    ),
    "F5 包围盒 Y 轴为 0 必须被拒",
  );

  const dullCapture = evaluateModel3DCompleteness({
    manifest,
    document,
    sourceBytes: 40_960,
    closure,
    capture: { frameColorCount: 3, thumbnailMinEdgePx: 64 },
  });
  const dullCodes = dullCapture.failures.map((entry) => entry.criterion);
  assert.ok(dullCodes.includes("抓帧颜色数"));
  assert.ok(dullCodes.includes("缩略图最小边"));
  assert.equal(MODEL3D_CONSTANTS.C34_FRAME_COLOR_COUNT_MIN, 32);
  assert.equal(MODEL3D_CONSTANTS.C33_COVER_MIN_EDGE_PX, 128);
});

test("§4 常量表关键行与规格一致", () => {
  assert.equal(MODEL3D_CONSTANTS.C1_ASSET_VERSION, "2.0");
  assert.equal(MODEL3D_CONSTANTS.C3_NODE_COUNT_MIN, 2);
  assert.equal(MODEL3D_CONSTANTS.C7_TEXTURE_COUNT_MIN, 1);
  assert.equal(MODEL3D_CONSTANTS.C10_TRIANGLE_COUNT_MIN, 500);
  assert.equal(MODEL3D_CONSTANTS.C11_TRIANGLE_COUNT_MAX_PROP, 150_000);
  assert.equal(MODEL3D_CONSTANTS.C12_TRIANGLE_COUNT_MAX_SCENE, 1_500_000);
  assert.equal(MODEL3D_CONSTANTS.C13_DRAW_CALL_MAX, 200);
  assert.equal(MODEL3D_CONSTANTS.C14_TEXTURE_MEMORY_MAX_BYTES, 268_435_456);
  assert.equal(MODEL3D_CONSTANTS.C15_TEXTURE_EDGE_MAX_PX, 4_096);
  assert.equal(MODEL3D_CONSTANTS.C16_TEXTURE_EDGE_MIN_PX, 64);
  assert.equal(MODEL3D_CONSTANTS.C24_SOURCE_BYTES_MIN, 20_480);
  assert.equal(MODEL3D_CONSTANTS.C25_SOURCE_BYTES_MAX, 52_428_800);
  assert.equal(MODEL3D_CONSTANTS.C28_SANDBOX_BUNDLE_MAX_BYTES, 2_097_152);
  assert.equal(MODEL3D_CONSTANTS.C29_SANDBOX_ASSET_MAX_BYTES, 524_288);
  assert.equal(MODEL3D_CONSTANTS.C36_ANIMATION_COUNT_MAX, 64);
  assert.equal(MODEL3D_CONSTANTS.C37_SKIN_COUNT_MAX, 32);
  assert.equal(MODEL3D_CONSTANTS.C38_FAMILY_JACCARD_MAX, 0.85);
  assert.equal(MODEL3D_CONSTANTS.C39_TWIN_JACCARD, 0.99);
  assert.deepEqual({ ...MODEL3D_BYTE_FLOORS }, {
    sourceBytes: 20_480,
    sourceBytesMax: 52_428_800,
    closureBytes: 16_384,
    textureBytes: 4_096,
  });
});
