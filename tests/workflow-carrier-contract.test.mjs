// W14 —— workflow 载体(`workflow` / `oceanleo.video.project.v2` /
// `oceanleo.video-canvas.v1`)的平台侧契约回归防线。
//
// 规格: docs/specs/oceanleo-material-and-game-v1/L1-carriers/workflow.md
//   §1.2 三个格式的分工 · §1.3 与 video-timeline 的边界 · §2 视觉靶
//   §3 Schema · §3.2 状态机 · §3.3 图的确定性 · §3.4 端口类型相容表
//   §4 常量 C1–C45 · §6 F1–F8 · §8.1 字节下限 · §8.2 完备判据

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LEGACY_WORKFLOW_SOURCE_FORMAT,
  VIDEO_CANVAS_CONSTANTS,
  VIDEO_CANVAS_CONTRAST_OBLIGATIONS,
  VIDEO_CANVAS_JSON_SCHEMA,
  VIDEO_CANVAS_LAYOUT,
  VIDEO_CANVAS_NODE_KINDS,
  VIDEO_CANVAS_PALETTE,
  VIDEO_CANVAS_PORT_DATA_TYPES,
  VIDEO_CANVAS_PROJECT_SCHEMA,
  VIDEO_CANVAS_REQUIREMENT_PATHS,
  VIDEO_CANVAS_SOURCE_FORMAT,
  VIDEO_CANVAS_TYPE_SCALE,
  WORKFLOW_CARRIER_CONTRACT,
  contrastRatio,
} from "../src/shell/workflow-carrier/video-canvas-schema.ts";
import {
  PORT_TYPE_COMPATIBILITY,
  arePortTypesCompatible,
  linkGraphEdges,
} from "../src/shell/workflow-carrier/video-canvas-port-types.ts";
import {
  assessDeterminism,
  branchNodeIds,
  canonicalizeGraph,
  graphFingerprint,
  graphJaccard,
  topologicalOrder,
  unreachableFromOutput,
  versionTreeReport,
} from "../src/shell/workflow-carrier/video-canvas-determinism.ts";
import {
  VIDEO_CANVAS_ILLEGAL_TRANSITIONS,
  VIDEO_CANVAS_TRANSITIONS,
  VideoCanvasCarrierError,
  assessVideoCanvasCompleteness,
  classifyCarrierBoundary,
  isLegalVideoCanvasTransition,
  parseVideoCanvasSource,
  serializeVideoCanvasProject,
  validateVideoCanvasProject,
  videoCanvasSourceFormatAdmission,
} from "../src/shell/workflow-carrier/video-canvas-source.ts";

function source(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const sha = (seed) => seed.repeat(64).slice(0, 64);

function port(name, dataType) {
  return { name, dataType, required: true };
}

/** §8.2 全条判据都成立的参照工程(6 kinds / 7 nodes / 7 edges / 分支 / 单 output)。 */
function branchingGraph() {
  return {
    nodes: [
      {
        id: "src-a",
        kind: "source",
        label: "主机位素材",
        x: 0,
        y: 0,
        assetId: "asset-main-video",
        params: { inPointMs: 0, gain: 1 },
        ports: { inputs: [], outputs: [port("out", "video")] },
      },
      {
        id: "src-b",
        kind: "source",
        label: "叠加静帧",
        x: 0,
        y: 160,
        assetId: "asset-overlay-image",
        params: { opacity: 0.8 },
        ports: { inputs: [], outputs: [port("out", "image")] },
      },
      {
        id: "trim-a",
        kind: "trim",
        label: "掐头去尾",
        x: 260,
        y: 0,
        params: { startMs: 400, endMs: 9600 },
        ports: { inputs: [port("in", "video")], outputs: [port("out", "video")] },
      },
      {
        id: "overlay-a",
        kind: "overlay",
        label: "静帧叠加",
        x: 520,
        y: 120,
        params: { blend: "normal" },
        ports: {
          inputs: [port("base", "video"), port("layer", "image")],
          outputs: [port("out", "video")],
        },
      },
      {
        id: "concat-a",
        kind: "concat",
        label: "拼接",
        x: 780,
        y: 0,
        params: { crossfadeMs: 240 },
        ports: {
          inputs: [port("first", "video"), port("second", "video")],
          outputs: [port("out", "video")],
        },
      },
      {
        id: "audio-a",
        kind: "audio-mix",
        label: "配乐混音",
        x: 780,
        y: 220,
        assetId: "asset-score-audio",
        params: { musicDb: -18, seed: 20260729 },
        ports: {
          inputs: [port("track", "audio")],
          outputs: [port("out", "audio")],
        },
      },
      {
        id: "out-a",
        kind: "output",
        label: "成片",
        x: 1040,
        y: 100,
        params: { container: "mp4" },
        ports: {
          inputs: [port("final", "video"), port("audio", "audio")],
          outputs: [],
        },
      },
    ],
    edges: [
      {
        id: "e1",
        fromNodeId: "src-a",
        fromPort: "out",
        toNodeId: "trim-a",
        toPort: "in",
      },
      {
        id: "e2",
        fromNodeId: "trim-a",
        fromPort: "out",
        toNodeId: "overlay-a",
        toPort: "base",
      },
      {
        id: "e3",
        fromNodeId: "trim-a",
        fromPort: "out",
        toNodeId: "concat-a",
        toPort: "first",
        condition: "durationMs > 0 ? 1 : 0",
      },
      {
        id: "e4",
        fromNodeId: "src-b",
        fromPort: "out",
        toNodeId: "overlay-a",
        toPort: "layer",
      },
      {
        id: "e5",
        fromNodeId: "overlay-a",
        fromPort: "out",
        toNodeId: "concat-a",
        toPort: "second",
      },
      {
        id: "e6",
        fromNodeId: "concat-a",
        fromPort: "out",
        toNodeId: "out-a",
        toPort: "final",
      },
      {
        id: "e7",
        fromNodeId: "audio-a",
        fromPort: "out",
        toNodeId: "out-a",
        toPort: "audio",
      },
    ],
  };
}

function clips(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `clip-${index + 1}`,
    nodeId: index % 2 === 0 ? "concat-a" : "overlay-a",
    startMs: index * 500,
    durationMs: 480 + index,
    layer: index % 3,
  }));
}

function timeline() {
  return {
    durationMs: 24_000,
    fps: 30,
    widthPx: 1_920,
    heightPx: 1_080,
    clips: clips(24),
  };
}

function project(overrides = {}) {
  const base = {
    schemaVersion: VIDEO_CANVAS_PROJECT_SCHEMA,
    headVersionId: "v2",
    versions: [
      {
        id: "v1",
        createdAt: "2026-07-28T09:00:00.000Z",
        note: "初版:单机位直出,尚未加叠加与配乐分支。",
        graph: branchingGraph(),
        timeline: timeline(),
        production: {
          parserPassed: true,
          parserVersion: "video-canvas-parser-1.4.0",
          checkedAt: "2026-07-28T09:04:00.000Z",
        },
      },
      {
        id: "v2",
        parentId: "v1",
        createdAt: "2026-07-29T10:00:00.000Z",
        note: "加入静帧叠加分支与配乐混音,成片时长拉到 24 秒。",
        graph: branchingGraph(),
        timeline: timeline(),
        production: {
          parserPassed: true,
          parserVersion: "video-canvas-parser-1.4.0",
          checkedAt: "2026-07-29T10:06:00.000Z",
        },
      },
    ],
    assets: [
      {
        id: "asset-main-video",
        sha256: sha("a"),
        mediaType: "video/mp4",
        byteSize: 18_442_240,
        licenseCode: "CC0-1.0",
      },
      {
        id: "asset-overlay-image",
        sha256: sha("b"),
        mediaType: "image/png",
        byteSize: 262_144,
        licenseCode: "CC0-1.0",
      },
      {
        id: "asset-score-audio",
        sha256: sha("c"),
        mediaType: "audio/mpeg",
        byteSize: 2_097_152,
        licenseCode: "CC-BY-4.0",
      },
    ],
    attribution: {
      entries: [
        {
          text: "配乐 by OceanLeo Studio",
          licenseCode: "CC-BY-4.0",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          assetId: "asset-score-audio",
        },
      ],
    },
  };
  return { ...base, ...overrides };
}

const HEALTHY_METRICS = {
  byteSize: 12_288,
  captureColorCount: 18,
  dependencyClosureBytes: 20_801_536,
};

// ---------------------------------------------------------------------------
// §1.1 / §1.2 / §3 —— 结构与格式
// ---------------------------------------------------------------------------

test("W14/wf §1.1 四元组与 §3 Schema 字段逐条对规格", () => {
  assert.equal(WORKFLOW_CARRIER_CONTRACT.artifactType, "workflow");
  assert.equal(WORKFLOW_CARRIER_CONTRACT.sourceFormat, "oceanleo.video.project.v2");
  assert.equal(WORKFLOW_CARRIER_CONTRACT.projectSchema, "oceanleo.video-canvas.v1");
  assert.equal(WORKFLOW_CARRIER_CONTRACT.editorCapability, "video-canvas");
  assert.equal(WORKFLOW_CARRIER_CONTRACT.editability, "native");
  assert.equal(
    WORKFLOW_CARRIER_CONTRACT.sourceIntegrity,
    "complete_dependency_closure",
  );
  // §1.1:requirement_paths 有 4 条,且含 headVersionId 与 versions。
  assert.deepEqual([...VIDEO_CANVAS_REQUIREMENT_PATHS], [
    "schemaVersion",
    "headVersionId",
    "versions",
    "assets",
  ]);

  const schema = VIDEO_CANVAS_JSON_SCHEMA;
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "schemaVersion",
    "headVersionId",
    "versions",
    "assets",
    "attribution",
  ]);
  assert.equal(schema.properties.schemaVersion.const, VIDEO_CANVAS_PROJECT_SCHEMA);
  assert.equal(schema.properties.headVersionId.pattern, "^v[0-9]{1,6}$");

  const versions = schema.properties.versions;
  assert.equal(versions.minItems, VIDEO_CANVAS_CONSTANTS.C17_VERSION_COUNT_MIN);
  assert.equal(versions.maxItems, VIDEO_CANVAS_CONSTANTS.C18_VERSION_COUNT_MAX);
  assert.deepEqual(versions.items.required, ["id", "createdAt", "graph", "timeline"]);

  const graph = versions.items.properties.graph;
  assert.deepEqual(graph.required, ["nodes", "edges"]);
  // §8.2 六项计数的 Schema 侧对应(reviewed_material_catalog.py:2600-2654)。
  assert.equal(graph.properties.nodes.minItems, 6);
  assert.equal(graph.properties.nodes.maxItems, 500);
  assert.equal(graph.properties.edges.minItems, 5);
  assert.equal(graph.properties.edges.maxItems, 2_000);
  assert.equal(schema.properties.assets.minItems, 3);
  assert.equal(schema.properties.assets.maxItems, 500);

  const node = graph.properties.nodes.items;
  assert.deepEqual(node.required, ["id", "kind", "x", "y", "ports"]);
  assert.deepEqual(node.properties.kind.enum, [...VIDEO_CANVAS_NODE_KINDS]);
  assert.equal(node.properties.kind.enum.length, VIDEO_CANVAS_CONSTANTS.C9_NODE_KIND_COUNT);
  assert.equal(node.properties.x.minimum, -20_000);
  assert.equal(node.properties.y.maximum, 20_000);
  assert.deepEqual(node.properties.ports.required, ["inputs", "outputs"]);
  assert.equal(node.properties.ports.properties.inputs.maxItems, 8);
  assert.equal(node.properties.ports.properties.outputs.maxItems, 8);
  assert.equal(node.properties.ports.properties.inputs.items.$ref, "#/$defs/port");

  // §2.4 SC 1.3.1:每条边显式声明四个端点。
  assert.deepEqual(graph.properties.edges.items.required, [
    "id",
    "fromNodeId",
    "fromPort",
    "toNodeId",
    "toPort",
  ]);

  const tl = versions.items.properties.timeline;
  assert.deepEqual(tl.required, ["durationMs", "clips"]);
  assert.equal(tl.properties.durationMs.minimum, 6_000);
  assert.equal(tl.properties.durationMs.maximum, 1_800_000);
  assert.deepEqual(tl.properties.fps.enum, [24, 25, 30, 50, 60]);
  assert.equal(tl.properties.widthPx.minimum, 640);
  assert.equal(tl.properties.widthPx.maximum, 3_840);
  assert.equal(tl.properties.heightPx.minimum, 360);
  assert.equal(tl.properties.heightPx.maximum, 2_160);
  assert.equal(tl.properties.clips.minItems, 1);
  assert.equal(tl.properties.clips.maxItems, 500);
  assert.equal(tl.properties.clips.items.properties.durationMs.minimum, 400);
  assert.equal(tl.properties.clips.items.properties.layer.maximum, 15);

  // §8.2 的布尔闸:parserPassed 只能是 true。
  assert.equal(
    versions.items.properties.production.properties.parserPassed.const,
    true,
  );

  const asset = schema.properties.assets.items;
  assert.deepEqual(asset.required, ["id", "sha256", "mediaType", "byteSize"]);
  assert.equal(asset.properties.sha256.pattern, "^[0-9a-f]{64}$");
  assert.equal(asset.properties.byteSize.minimum, 512);
  assert.equal(asset.properties.byteSize.maximum, 2_147_483_648);

  const attribution = schema.properties.attribution;
  assert.deepEqual(attribution.required, ["entries"]);
  assert.equal(attribution.properties.entries.minItems, 1);
  assert.equal(attribution.properties.entries.maxItems, 32);
  assert.equal(
    attribution.properties.entries.items.properties.licenseUrl.pattern,
    "^https://",
  );

  assert.deepEqual(schema.$defs.port.required, ["name", "dataType"]);
  assert.deepEqual(schema.$defs.port.properties.dataType.enum, [
    ...VIDEO_CANVAS_PORT_DATA_TYPES,
  ]);
  assert.equal(
    schema.$defs.port.properties.dataType.enum.length,
    VIDEO_CANVAS_CONSTANTS.C15_PORT_DATA_TYPE_COUNT,
  );
});

test("W14/wf §3.1 校验:参照工程通过,越界与多余字段被受控拒绝", () => {
  const ok = validateVideoCanvasProject(project());
  assert.equal(ok.ok, true, JSON.stringify(ok.errors || [], null, 2));

  const cases = [
    [{ schemaVersion: "oceanleo.workflow.v1" }, "const"],
    [{ headVersionId: "head-1" }, "pattern"],
    [{ assets: project().assets.slice(0, 2) }, "minItems"],
    [{ versions: [] }, "minItems"],
  ];
  for (const [override, keyword] of cases) {
    const result = validateVideoCanvasProject(project(override));
    assert.equal(result.ok, false, JSON.stringify(override));
    assert.ok(
      result.errors.some((error) => error.keyword === keyword),
      `${JSON.stringify(override)} 期望 ${keyword},实得 ${JSON.stringify(result.errors)}`,
    );
  }

  // additionalProperties: false —— 顶层与节点层都不许夹带字段。
  const extra = validateVideoCanvasProject({ ...project(), hotHtml: "<div/>" });
  assert.equal(extra.ok, false);
  assert.ok(extra.errors.some((error) => error.keyword === "additionalProperties"));

  // requirement_paths 逐条非空。
  const emptyAssets = validateVideoCanvasProject(project({ assets: [] }));
  assert.ok(
    emptyAssets.errors.some((error) => error.keyword === "requirement_paths"),
  );
});

test("W14/wf §1.2:三个格式分工;oceanleo.workflow.v1 落库被显式拒绝", () => {
  assert.equal(LEGACY_WORKFLOW_SOURCE_FORMAT, "oceanleo.workflow.v1");
  const good = videoCanvasSourceFormatAdmission(VIDEO_CANVAS_SOURCE_FORMAT);
  assert.equal(good.ok, true);
  assert.equal(good.editabilityCeiling, "native");

  const legacy = videoCanvasSourceFormatAdmission(LEGACY_WORKFLOW_SOURCE_FORMAT);
  assert.equal(legacy.ok, false);
  assert.equal(legacy.code, "workflow-legacy-source-format");

  for (const unknown of ["", "html", "zip", "oceanleo.timeline.v1", null]) {
    const verdict = videoCanvasSourceFormatAdmission(unknown);
    assert.equal(verdict.ok, false, String(unknown));
  }
});

test("W14/wf §6 F1:464–500 B 与 490 B 双空壳都不合格", () => {
  const hollow = JSON.stringify({
    schemaVersion: VIDEO_CANVAS_PROJECT_SCHEMA,
    headVersionId: "v1",
    versions: [],
    assets: [],
  });
  assert.ok(hollow.length < 500, `空壳应在 500 B 量级,实得 ${hollow.length}`);
  assert.throws(
    () => parseVideoCanvasSource(hollow),
    (error) =>
      error instanceof VideoCanvasCarrierError &&
      error.code === "workflow-schema-invalid",
  );

  // 结构勉强合法但内容是空壳:§8.2 判据仍必须拒。
  const thin = project({
    versions: [
      {
        id: "v1",
        createdAt: "2026-07-29T10:00:00.000Z",
        graph: {
          nodes: Array.from({ length: 6 }, (_, index) => ({
            id: `src-${index}`,
            kind: "source",
            x: index * 10,
            y: 0,
            ports: { inputs: [], outputs: [port("out", "video")] },
          })),
          edges: Array.from({ length: 5 }, (_, index) => ({
            id: `e${index}`,
            fromNodeId: `src-${index}`,
            fromPort: "out",
            toNodeId: `src-${index + 1}`,
            toPort: "out",
          })),
        },
        timeline: {
          durationMs: 6_000,
          clips: [{ id: "c1", nodeId: "src-0", startMs: 0, durationMs: 400 }],
        },
      },
    ],
    headVersionId: "v1",
  });
  const verdict = assessVideoCanvasCompleteness(thin, { byteSize: 490 });
  assert.equal(verdict.ok, false);
  for (const criterion of [
    "irByteFloor",
    "nodeKindVariety",
    "outputNodeCount",
    "productionParserPassed",
  ]) {
    assert.ok(verdict.failed.includes(criterion), `${criterion} 必须判不达标`);
  }
});

// ---------------------------------------------------------------------------
// §3.4 端口类型相容表
// ---------------------------------------------------------------------------

// 规格 §3.4 的表格逐格转录(行 = 输出,列 = 输入)。任何一格漂移都必须变红。
const SPEC_PORT_TABLE = {
  //        video  audio  image  text   number any
  video: [true, false, false, false, false, true],
  audio: [false, true, false, false, false, true],
  image: [true, false, true, false, false, true],
  text: [false, false, false, true, false, true],
  number: [false, false, false, true, true, true],
  any: [true, true, true, true, true, true],
};

test("W14/wf §3.4 端口类型相容表 36 格逐格可判", () => {
  assert.deepEqual([...VIDEO_CANVAS_PORT_DATA_TYPES], [
    "video",
    "audio",
    "image",
    "text",
    "number",
    "any",
  ]);
  let asserted = 0;
  for (const [outputType, row] of Object.entries(SPEC_PORT_TABLE)) {
    VIDEO_CANVAS_PORT_DATA_TYPES.forEach((inputType, column) => {
      const expected = row[column];
      assert.equal(
        arePortTypesCompatible(outputType, inputType),
        expected,
        `${outputType} → ${inputType} 期望 ${expected}`,
      );
      assert.equal(
        PORT_TYPE_COMPATIBILITY[outputType][inputType],
        expected,
        `表格 ${outputType} → ${inputType}`,
      );
      asserted += 1;
    });
  }
  assert.equal(asserted, 36, "6 × 6 全格都要断言");

  // §3.4 正文点名的两条跨类相容。
  assert.equal(arePortTypesCompatible("image", "video"), true);
  assert.equal(arePortTypesCompatible("number", "text"), true);
  // 反向不相容(表是有向的)。
  assert.equal(arePortTypesCompatible("video", "image"), false);
  assert.equal(arePortTypesCompatible("text", "number"), false);
  // 未知类型 fail-closed。
  for (const unknown of ["json", "", null, undefined, "VIDEO"]) {
    assert.equal(arePortTypesCompatible(unknown, "any"), false, String(unknown));
    assert.equal(arePortTypesCompatible("any", unknown), false, String(unknown));
  }
});

test("W14/wf §6 F5:不相容连接与悬空端点都受控拒绝,不静默丢边", () => {
  const healthy = linkGraphEdges(branchingGraph());
  assert.equal(healthy.ok, true, JSON.stringify(healthy.rejections));
  assert.equal(healthy.incompatibleEdgeCount, 0);

  // audio 输出接进 video 输入(§6 F5 点名的例子)。
  const graph = branchingGraph();
  graph.edges.push({
    id: "e8",
    fromNodeId: "audio-a",
    fromPort: "out",
    toNodeId: "overlay-a",
    toPort: "base",
  });
  const report = linkGraphEdges(graph);
  assert.equal(report.ok, false);
  assert.equal(report.incompatibleEdgeCount, 1);
  const rejection = report.rejections.find(
    (entry) => entry.code === "incompatible-port-types",
  );
  assert.ok(rejection, "必须给出 incompatible-port-types");
  assert.equal(rejection.edgeId, "e8");
  assert.equal(rejection.from.dataType, "audio");
  assert.equal(rejection.to.dataType, "video");

  // 不相容的边使产物 invalid(§3.2 ir-validated → invalid)。
  const invalid = project({
    headVersionId: "v1",
    versions: [
      {
        id: "v1",
        createdAt: "2026-07-29T10:00:00.000Z",
        graph,
        timeline: timeline(),
        production: { parserPassed: true },
      },
    ],
  });
  const verdict = assessVideoCanvasCompleteness(invalid, HEALTHY_METRICS);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failed.includes("incompatibleEdgeCount"));

  // 悬空端点逐类给码。
  const dangling = branchingGraph();
  dangling.edges.push({
    id: "e9",
    fromNodeId: "ghost",
    fromPort: "out",
    toNodeId: "out-a",
    toPort: "final",
  });
  dangling.edges.push({
    id: "e10",
    fromNodeId: "src-a",
    fromPort: "nope",
    toNodeId: "out-a",
    toPort: "final",
  });
  const codes = linkGraphEdges(dangling).rejections.map((entry) => entry.code);
  assert.ok(codes.includes("unknown-from-node"));
  assert.ok(codes.includes("unknown-from-port"));
});

// ---------------------------------------------------------------------------
// §3.3 图的确定性
// ---------------------------------------------------------------------------

test("W14/wf §3.3 确定性:同图同序 → 同指纹、同序列化、同拓扑序", () => {
  const graph = branchingGraph();
  const shuffled = {
    nodes: [...graph.nodes].reverse().map((node) => ({
      ...node,
      ports: {
        inputs: [...(node.ports.inputs || [])].reverse(),
        outputs: [...(node.ports.outputs || [])].reverse(),
      },
      ...(node.params
        ? {
            params: Object.fromEntries(
              Object.entries(node.params).reverse(),
            ),
          }
        : {}),
    })),
    edges: [...graph.edges].reverse(),
  };

  assert.deepEqual(canonicalizeGraph(shuffled), canonicalizeGraph(graph));
  assert.equal(graphFingerprint(shuffled), graphFingerprint(graph));
  assert.deepEqual(
    topologicalOrder(shuffled).order,
    topologicalOrder(graph).order,
  );

  // 序列化确定性:同一份工程反复序列化、以及键序被打乱后,字节逐位相同。
  const first = serializeVideoCanvasProject(project());
  const second = serializeVideoCanvasProject(project());
  assert.equal(first, second);
  const reordered = project({
    versions: [...project().versions].reverse(),
    assets: [...project().assets].reverse(),
  });
  assert.equal(serializeVideoCanvasProject(reordered), first);

  // 同一份图两次求值给同一个 fingerprint(§8.2 报告里也带出来)。
  assert.equal(
    assessVideoCanvasCompleteness(project(), HEALTHY_METRICS).graphFingerprint,
    assessVideoCanvasCompleteness(reordered, HEALTHY_METRICS).graphFingerprint,
  );
});

test("W14/wf §3.3 随机 / 除零 / NaN / 表达式封闭子集四项逐条判", () => {
  const healthy = assessDeterminism(project().versions[1]);
  assert.equal(healthy.ok, true, JSON.stringify(healthy.findings));

  const withSeed = (params) => {
    const version = structuredClone(project().versions[1]);
    version.graph.nodes[0].params = params;
    return assessDeterminism(version);
  };

  // 随机但有种子 → 通过;无种子 → unseeded-random。
  assert.equal(withSeed({ randomOffset: 3, seed: 42 }).ok, true);
  const unseeded = withSeed({ randomOffset: 3 });
  assert.equal(unseeded.ok, false);
  assert.equal(unseeded.findings[0].code, "unseeded-random");

  // 墙钟类输入是非确定性输入。
  assert.equal(withSeed({ now: 1 }).findings[0].code, "non-deterministic-param");
  // NaN MUST NOT 传进生产解析器。
  assert.equal(withSeed({ gain: Number.NaN }).findings[0].code, "nan-param");
  // 表达式位的除零必须有兜底。
  assert.equal(
    withSeed({ scaleExpr: "width / height" }).findings[0].code,
    "division-by-zero-unguarded",
  );
  assert.equal(withSeed({ scaleExpr: "height > 0 ? width / height : 1" }).ok, true);
  // 普通文本参数里的斜杠是内容,不是运算符。
  assert.equal(withSeed({ label: "a/b 机位" }).ok, true);

  // edges[].condition 走 interactive-doc.md §3.4 的封闭子集:逃逸构造一律拒。
  for (const condition of [
    "eval('1')",
    "new Function('return 1')",
    "Math.random() > 0.5",
    "Date.now() % 2",
    "(() => 1)()",
  ]) {
    const version = structuredClone(project().versions[1]);
    version.graph.edges[2].condition = condition;
    const report = assessDeterminism(version);
    assert.equal(report.ok, false, condition);
    assert.ok(
      report.findings.some((finding) => finding.code === "forbidden-expression"),
      condition,
    );
  }
  const unguarded = structuredClone(project().versions[1]);
  unguarded.graph.edges[2].condition = "a / b";
  assert.ok(
    assessDeterminism(unguarded).findings.some(
      (finding) => finding.code === "division-by-zero-unguarded-condition",
    ),
  );
});

test("W14/wf §5.1 / §5.3 / §5.4:环、死节点、分支与版本树", () => {
  const healthy = topologicalOrder(branchingGraph());
  assert.equal(healthy.ok, true);
  assert.deepEqual(healthy.cycles, []);
  assert.ok(healthy.depth <= VIDEO_CANVAS_CONSTANTS.C16_GRAPH_DEPTH_MAX);
  assert.deepEqual(unreachableFromOutput(branchingGraph()), []);
  assert.deepEqual(branchNodeIds(branchingGraph()), ["trim-a"]);

  // §6 F3:overlay 的输出接回上游 concat 的输入 → 环,MUST 给出完整环上 id 序列。
  const cyclic = branchingGraph();
  cyclic.edges.push({
    id: "e8",
    fromNodeId: "concat-a",
    fromPort: "out",
    toNodeId: "overlay-a",
    toPort: "base",
  });
  const cycleReport = topologicalOrder(cyclic);
  assert.equal(cycleReport.ok, false);
  assert.equal(cycleReport.cycles.length, 1);
  const cycle = cycleReport.cycles[0];
  assert.ok(cycle.includes("overlay-a") && cycle.includes("concat-a"));
  assert.equal(cycle[0], cycle[cycle.length - 1], "环序列必须闭合");

  // 死节点:加一个谁都到不了 output 的节点。
  const dead = branchingGraph();
  dead.nodes.push({
    id: "orphan-a",
    kind: "text",
    x: 0,
    y: 400,
    ports: { inputs: [], outputs: [port("out", "text")] },
  });
  assert.deepEqual(unreachableFromOutput(dead), ["orphan-a"]);

  // §5.4 版本树:悬空 parentId / 多根 / head 未命中。
  assert.equal(versionTreeReport(project()).ok, true);
  assert.deepEqual(versionTreeReport(project()).rootIds, ["v1"]);
  const badHead = versionTreeReport(project({ headVersionId: "v9" }));
  assert.equal(badHead.ok, false);
  assert.equal(badHead.headResolved, false);
  const versions = structuredClone(project().versions);
  versions[1].parentId = "v7";
  const dangling = versionTreeReport(project({ versions }));
  assert.equal(dangling.ok, false);
  assert.deepEqual(dangling.danglingParentIds, ["v7"]);
});

test("W14/wf §6 F8 反孪生:只换 note 的复制品 Jaccard 落在孪生阈上", () => {
  const left = branchingGraph();
  const twin = branchingGraph();
  twin.nodes[0].label = "换个标题";
  twin.nodes[0].x = 40;
  assert.equal(graphJaccard(left, twin), 1);
  assert.ok(graphJaccard(left, twin) >= VIDEO_CANVAS_CONSTANTS.C45_TWIN_THRESHOLD);

  const different = branchingGraph();
  different.nodes = different.nodes.filter((node) => node.id !== "audio-a");
  different.edges = different.edges.filter((edge) => edge.fromNodeId !== "audio-a");
  different.nodes.push({
    id: "text-a",
    kind: "text",
    x: 300,
    y: 400,
    ports: { inputs: [], outputs: [port("out", "text")] },
  });
  different.edges.push({
    id: "e8",
    fromNodeId: "text-a",
    fromPort: "out",
    toNodeId: "out-a",
    toPort: "audio",
  });
  assert.ok(
    graphJaccard(left, different) < VIDEO_CANVAS_CONSTANTS.C44_FAMILY_JACCARD_MAX,
    "换掉一族节点后必须低于 0.85",
  );
});

// ---------------------------------------------------------------------------
// §1.3 与 video-timeline 的边界
// ---------------------------------------------------------------------------

test("W14/wf §1.3 边界:判据是有没有节点图,一条直线归 video-timeline", () => {
  assert.deepEqual(classifyCarrierBoundary(project()), {
    carrier: "workflow",
    reason: "node-graph-with-branching",
  });

  // §6 F4:6 节点串成一条链,满足 nodeCount/edgeCount 门槛却没有分支。
  const chainNodes = ["source", "trim", "filter", "transition", "concat", "output"].map(
    (kind, index) => ({
      id: `n-${index}`,
      kind,
      x: index * 200,
      y: 0,
      ports: {
        inputs: index === 0 ? [] : [port("in", "video")],
        outputs: kind === "output" ? [] : [port("out", "video")],
      },
    }),
  );
  const chain = {
    nodes: chainNodes,
    edges: chainNodes.slice(0, -1).map((node, index) => ({
      id: `ce${index}`,
      fromNodeId: node.id,
      fromPort: "out",
      toNodeId: chainNodes[index + 1].id,
      toPort: "in",
    })),
  };
  const linear = project({
    headVersionId: "v1",
    versions: [
      {
        id: "v1",
        createdAt: "2026-07-29T10:00:00.000Z",
        graph: chain,
        timeline: timeline(),
        production: { parserPassed: true },
      },
    ],
  });
  const verdict = classifyCarrierBoundary(linear);
  assert.equal(verdict.carrier, "video-timeline");
  assert.equal(verdict.reason, "linear-chain-without-branching");
  assert.equal(verdict.shouldBe, "oceanleo.timeline.v1");
  // 同一份图在 §8.2 侧也必须因缺分支而不达标。
  assert.ok(
    assessVideoCanvasCompleteness(linear, HEALTHY_METRICS).failed.includes(
      "branchNodeCount",
    ),
  );
});

test("W14/wf §1.3:时间线独有职责不落在本载体", () => {
  // 预览分辨率契约、编码档、批量编码归 video-timeline.md(§3.3 / §5.2)。
  const carrier = [
    source("../src/shell/workflow-carrier/video-canvas-schema.ts"),
    source("../src/shell/workflow-carrier/video-canvas-source.ts"),
    source("../src/shell/workflow-carrier/video-canvas-determinism.ts"),
    source("../src/shell/workflow-carrier/video-canvas-port-types.ts"),
  ].join("\n");
  for (const forbidden of [
    "previewResolution",
    "downsample",
    "ffmpeg",
    "encodeProfile",
    "oceanleo.timeline.v1\" as",
  ]) {
    assert.equal(
      carrier.includes(forbidden),
      false,
      `节点图载体不得承担时间线职责:${forbidden}`,
    );
  }
});

// ---------------------------------------------------------------------------
// §3.2 状态机 · §8 完备判据 · §2 视觉靶
// ---------------------------------------------------------------------------

test("W14/wf §3.2 状态机:合法迁移可走,六条非法迁移一条都不许", () => {
  assert.equal(isLegalVideoCanvasTransition("empty", "ir-validated"), true);
  assert.equal(isLegalVideoCanvasTransition("ir-validated", "graph-linked"), true);
  assert.equal(isLegalVideoCanvasTransition("graph-linked", "cyclic"), true);
  assert.equal(isLegalVideoCanvasTransition("parser-passed", "ready"), true);
  assert.equal(isLegalVideoCanvasTransition("dirty", "saving"), true);

  assert.equal(VIDEO_CANVAS_ILLEGAL_TRANSITIONS.length, 6);
  for (const illegal of VIDEO_CANVAS_ILLEGAL_TRANSITIONS) {
    assert.equal(
      isLegalVideoCanvasTransition(illegal.from, illegal.to),
      false,
      `${illegal.from} → ${illegal.to} 必须非法`,
    );
    assert.ok(illegal.why.length > 4);
  }
  // 未登记的迁移也一律拒(fail-closed)。
  assert.equal(isLegalVideoCanvasTransition("invalid", "ready"), false);
  assert.equal(isLegalVideoCanvasTransition("cyclic", "graph-linked"), false);
  assert.ok(VIDEO_CANVAS_TRANSITIONS.length >= 13);
});

test("W14/wf §8.1 / §8.2:参照工程全条达标,空壳必须不合格", () => {
  const serialized = serializeVideoCanvasProject(project());
  const byteSize = Buffer.byteLength(serialized, "utf8");
  assert.ok(
    byteSize >= VIDEO_CANVAS_CONSTANTS.C37_IR_BYTE_MIN,
    `参照工程应过 8,192 B 下限,实得 ${byteSize}`,
  );

  const verdict = assessVideoCanvasCompleteness(project(), {
    ...HEALTHY_METRICS,
    byteSize,
  });
  assert.equal(
    verdict.ok,
    true,
    `未达标项:${JSON.stringify(verdict.criteria.filter((entry) => !entry.ok), null, 2)}`,
  );
  // §8.2 表内 16 条判据 + §8.1 两条字节判据都要在报告里露出。
  for (const id of [
    "irByteFloor",
    "nodeCount",
    "edgeCount",
    "assetCount",
    "clipCount",
    "durationMs",
    "productionParserPassed",
    "nodeKindVariety",
    "branchNodeCount",
    "outputNodeCount",
    "deadNodeCount",
    "cycleCount",
    "incompatibleEdgeCount",
    "headVersionResolved",
    "versionTreeRootCount",
    "attributionEntries",
    "captureColorCount",
    "dependencyClosureBytes",
  ]) {
    assert.ok(
      verdict.criteria.some((entry) => entry.id === id),
      `缺判据 ${id}`,
    );
  }
  // 每条判据必须能指回规格。
  for (const criterion of verdict.criteria) {
    assert.match(criterion.basis, /§|:\d+/);
  }

  // 逐条打破:每破一条,恰好该条不达标。
  const brokenByteSize = assessVideoCanvasCompleteness(project(), {
    ...HEALTHY_METRICS,
    byteSize: 490,
  });
  assert.deepEqual(brokenByteSize.failed, ["irByteFloor"]);
  const noParser = structuredClone(project());
  delete noParser.versions[1].production;
  assert.deepEqual(
    assessVideoCanvasCompleteness(noParser, { ...HEALTHY_METRICS, byteSize }).failed,
    ["productionParserPassed"],
  );
  const noCover = assessVideoCanvasCompleteness(project(), {
    ...HEALTHY_METRICS,
    byteSize,
    captureColorCount: 11,
  });
  assert.deepEqual(noCover.failed, ["captureColorCount"]);
});

test("W14/wf §2 视觉靶:色板逐值、对比度实算、版面与字号档", () => {
  assert.equal(VIDEO_CANVAS_PALETTE["wf.bg"], "#14171B");
  assert.equal(VIDEO_CANVAS_PALETTE["wf.node"], "#1F2328");
  assert.equal(VIDEO_CANVAS_PALETTE["wf.node.border"], "#5F6974");
  assert.equal(VIDEO_CANVAS_PALETTE["wf.node.header"], "#1F6FEB");
  assert.equal(VIDEO_CANVAS_PALETTE["wf.edge"], "#5F6974");
  assert.equal(VIDEO_CANVAS_PALETTE["wf.error"], "#CF222E");

  // 逐 token 按 WCAG 2.2 相对亮度公式复算,必须同时满足义务与规格实测值。
  assert.equal(VIDEO_CANVAS_CONTRAST_OBLIGATIONS.length, 10);
  for (const obligation of VIDEO_CANVAS_CONTRAST_OBLIGATIONS) {
    const actual = contrastRatio(
      VIDEO_CANVAS_PALETTE[obligation.token],
      VIDEO_CANVAS_PALETTE[obligation.basis],
    );
    assert.ok(
      actual >= obligation.minimumRatio,
      `${obligation.token} 对 ${obligation.basis} 实算 ${actual.toFixed(2)} < ${obligation.minimumRatio}`,
    );
    assert.ok(
      Math.abs(actual - obligation.measuredRatio) < 0.01,
      `${obligation.token} 实算 ${actual.toFixed(4)} 与规格实测 ${obligation.measuredRatio} 不符`,
    );
  }
  // §2.1 末条:节点填充 MUST NOT 抬高 —— 抬到 #2C3239 会打破另两条义务。
  assert.ok(contrastRatio("#1F6FEB", "#2C3239") < 3);
  assert.ok(contrastRatio("#8C959F", "#2C3239") < 4.5);
  // SC 1.4.3 只用于文字,SC 1.4.11 只用于非文本图形。
  for (const obligation of VIDEO_CANVAS_CONTRAST_OBLIGATIONS) {
    if (obligation.criterion === "SC 1.4.3") {
      assert.equal(obligation.minimumRatio, 4.5);
      assert.ok(["wf.text", "wf.muted"].includes(obligation.token));
    }
    if (obligation.criterion === "SC 1.4.11") {
      assert.equal(obligation.minimumRatio, 3);
    }
  }

  assert.equal(VIDEO_CANVAS_LAYOUT.nodeMinWidthPx, 180);
  assert.equal(VIDEO_CANVAS_LAYOUT.nodeMinHeightPx, 72);
  assert.equal(VIDEO_CANVAS_LAYOUT.nodeHeaderHeightPx, 28);
  assert.equal(VIDEO_CANVAS_LAYOUT.portSpacingPx, 24);
  assert.equal(VIDEO_CANVAS_LAYOUT.portHitRadiusPx, 12);
  assert.equal(VIDEO_CANVAS_LAYOUT.autoLayoutHorizontalGapPx, 120);
  assert.equal(VIDEO_CANVAS_LAYOUT.autoLayoutVerticalGapPx, 48);
  assert.equal(VIDEO_CANVAS_LAYOUT.edgeCornerRadiusPx, 12);
  assert.equal(VIDEO_CANVAS_LAYOUT.edgeWidthPx, 2);
  assert.equal(VIDEO_CANVAS_LAYOUT.gridSnapPx, 8);
  assert.equal(VIDEO_CANVAS_LAYOUT.hitAreaMinPx, 24);

  assert.deepEqual({ ...VIDEO_CANVAS_TYPE_SCALE }, {
    "node-title": 14,
    port: 12,
    param: 12,
    badge: 11,
  });
});

test("W14/wf §4 常量表 C1–C45 逐值对规格", () => {
  const c = VIDEO_CANVAS_CONSTANTS;
  assert.equal(c.C1_NODE_COUNT_MIN, 6);
  assert.equal(c.C2_NODE_COUNT_MAX, 500);
  assert.equal(c.C3_EDGE_COUNT_MIN, 5);
  assert.equal(c.C4_EDGE_COUNT_MAX, 2_000);
  assert.equal(c.C5_ASSET_COUNT_MIN, 3);
  assert.equal(c.C6_ASSET_COUNT_MAX, 500);
  assert.equal(c.C7_CLIP_COUNT_MIN, 1);
  assert.equal(c.C8_CLIP_COUNT_MAX, 500);
  assert.equal(c.C9_NODE_KIND_COUNT, 10);
  assert.equal(c.C10_NODE_KINDS_USED_MIN, 4);
  assert.equal(c.C11_BRANCH_NODE_MIN, 1);
  assert.equal(c.C12_OUTPUT_NODE_COUNT, 1);
  assert.equal(c.C13_NODE_INPUT_PORT_MAX, 8);
  assert.equal(c.C14_NODE_OUTPUT_PORT_MAX, 8);
  assert.equal(c.C15_PORT_DATA_TYPE_COUNT, 6);
  assert.equal(c.C16_GRAPH_DEPTH_MAX, 64);
  assert.equal(c.C17_VERSION_COUNT_MIN, 1);
  assert.equal(c.C18_VERSION_COUNT_MAX, 200);
  assert.equal(c.C19_DURATION_MS_MIN, 6_000);
  assert.equal(c.C20_DURATION_MS_MAX, 1_800_000);
  assert.equal(c.C21_CLIP_DURATION_MS_MIN, 400);
  assert.equal(c.C22_CLIP_LAYER_MAX, 15);
  assert.deepEqual([...c.C23_FPS_VALUES], [24, 25, 30, 50, 60]);
  assert.equal(c.C24_WIDTH_PX_MIN, 640);
  assert.equal(c.C24_WIDTH_PX_MAX, 3_840);
  assert.equal(c.C25_HEIGHT_PX_MIN, 360);
  assert.equal(c.C25_HEIGHT_PX_MAX, 2_160);
  assert.equal(c.C26_NODE_COORDINATE_MAX, 20_000);
  assert.equal(c.C35_ASSET_BYTE_MIN, 512);
  assert.equal(c.C35_ASSET_BYTE_MAX, 2_147_483_648);
  assert.equal(c.C36_DEPENDENCY_CLOSURE_BYTE_MAX, 4_294_967_296);
  assert.equal(c.C37_IR_BYTE_MIN, 8_192);
  assert.equal(c.C38_IR_BYTE_MAX, 8_388_608);
  assert.equal(c.C39_TOPO_SORT_WALL_MS_MAX, 200);
  assert.equal(c.C40_PRODUCTION_PARSER_WALL_MS_MAX, 30_000);
  assert.equal(c.C41_COVER_MIN_EDGE_PX, 128);
  assert.deepEqual({ ...c.C42_CAPTURE_CANVAS_PX }, { width: 1_600, height: 1_000 });
  assert.equal(c.C43_CAPTURE_COLOR_COUNT_MIN, 12);
  assert.equal(c.C44_FAMILY_JACCARD_MAX, 0.85);
  assert.equal(c.C45_TWIN_THRESHOLD, 0.99);
  assert.equal(c.DEPENDENCY_CLOSURE_BYTE_MIN, 65_536);
});

test("W14/wf §5.2 / C39:500 节点上限时拓扑排序在 200 ms 墙钟内", () => {
  const nodes = Array.from({ length: 500 }, (_, index) => ({
    id: `n-${index}`,
    kind: index === 499 ? "output" : "filter",
    x: index,
    y: 0,
    ports: {
      inputs: index === 0 ? [] : [port("in", "video")],
      outputs: index === 499 ? [] : [port("out", "video")],
    },
  }));
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `e-${index}`,
    fromNodeId: node.id,
    fromPort: "out",
    toNodeId: nodes[index + 1].id,
    toPort: "in",
  }));
  const started = performance.now();
  const report = topologicalOrder({ nodes, edges });
  const elapsed = performance.now() - started;
  assert.equal(report.ok, true);
  assert.equal(report.order.length, 500);
  assert.ok(
    elapsed <= VIDEO_CANVAS_CONSTANTS.C39_TOPO_SORT_WALL_MS_MAX,
    `拓扑排序耗时 ${elapsed.toFixed(1)} ms 超过 C39`,
  );
  // 500 层链条正好越过 C16 的 64 层预算,必须判超。
  assert.ok(report.depth > VIDEO_CANVAS_CONSTANTS.C16_GRAPH_DEPTH_MAX);
});
