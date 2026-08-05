// ============================================================================
// A-5 / R-4 / R-10 —— 功能里的用户数据保存，不许走素材完备判据（三个内核）
// ----------------------------------------------------------------------------
// 实测的坏法（V4 §6.3 用 W14 三份初始态跑出来的）：
//   spaced-repetition-scheduler -> source-too-small / prose-too-short /
//                                  spaced-repetition-nodes-missing
//   unit-converter              -> source 6398 B < 8192; prose 205 < 300
//   financial-calculator        -> source 5899 B < 8192; prose 195 < 300
// 也就是用户在间隔排程里加完第一张卡、一按保存就被拒；其中
// `attribution.entries ≥ 1` 那条等于要求用户给自己手写的卡片填一个许可证 URL。
// 那套判据回答的是「这件产物够不够格上货架」，而功能里的用户数据根本不上货架。
//
// 本文件锁两侧，缺一不可：
//   · 正面：W14 那三份第一屏，以及「用户加了一条数据」之后的样子，都存得下去，
//     并且**一次上传 / 一次 revision 都没有发生**（插件数据不进 artifact 链）。
//   · 反面：真素材那一侧的判据一个字都没松；正确性判据（schema、计算图、roundtrip）
//     对功能数据照样查；给一件真素材挂上 plugin_id 也换不到那条松判据的路。
// 一行 mock 都没有：初始态取自 W14 已提交的目录，判据走产品自己的守门人。
// ============================================================================

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  INTERACTIVE_DOC_ARTIFACT_TYPE,
  INTERACTIVE_DOC_LIMITS,
  INTERACTIVE_DOC_PROJECT_SCHEMA,
} from "../src/shell/interactive-doc-editor/interactive-doc-schema.ts";
import {
  assessInteractiveDocCompleteness,
  interactiveDocSourceByteLength,
  parseInteractiveDocSource,
} from "../src/shell/interactive-doc-editor/interactive-doc-source.ts";
import {
  InteractiveDocCommitError,
  assertInteractiveDocSaveable,
  commitInteractiveDocProject,
  interactiveDocSaveTargetForItem,
} from "../src/shell/interactive-doc-editor/interactive-doc-persistence.ts";
import {
  loadBuiltInGeoPayload,
  pluginInitialItemInput,
} from "../src/shell/plugin-initial-states/index.ts";
import { pluginInstanceLibraryItem } from "../src/shell/plugin-initial-state.ts";
import {
  gridCarrierProjectToIr,
  loadGridSheets,
  parseGridIrSource,
  serializeGridIrProject,
  validateGridIrProject,
} from "../src/shell/doc-editors/grid-model.ts";
import { evaluateGeoMapCompleteness } from "../src/shell/geo-map-editor/geo-map-schema.ts";
import { parseGeoMapSource } from "../src/shell/geo-map-editor/geo-map-source.ts";
import { commitGeoMapProject } from "../src/shell/geo-map-editor/geo-map-persistence.ts";

/** W14 已提交的三份 interactive-doc 第一屏。 */
const PLUGIN_IDS = [
  "spaced-repetition-scheduler",
  "unit-converter",
  "financial-calculator",
];

function firstScreenProject(pluginId) {
  const input = pluginInitialItemInput(pluginId);
  assert.ok(input?.content, `${pluginId} 取不到初始态字节`);
  return parseInteractiveDocSource(input.content);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * 「用户加了一条数据」。这三份第一屏都带一张 `table` 块 —— 用户往里记一行，
 * 就是加一条自己的数据；它既不会让工程变大到 8192 B，也不会长出 attribution。
 */
function withOneUserRow(project) {
  const next = clone(project);
  const computation = {
    id: "user_entry_1",
    label: "我的第一条",
    expression: "1",
    precision: 2,
  };
  next.computations = [...next.computations, computation];
  const table = next.blocks.find(
    (block) => block.kind === "table" && Array.isArray(block.table?.rows),
  );
  assert.ok(table, "第一屏没有可记录的表格块");
  table.table.rows = [
    ...table.table.rows,
    { bind: computation.id, label: computation.label, emphasis: "none" },
  ];
  return next;
}

/** 一件真素材：durable artifact 身份齐全，走的是素材那条路。 */
function materialItem(overrides = {}) {
  const artifactId = "artifact-doc-a5";
  const revisionId = "rev-1";
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    id: artifactId,
    source: "artifact",
    title: "等额本息贷款可算文档",
    kind: "interactive_doc",
    siteId: "oceanleo",
    favorite: false,
    artifactId,
    revisionId,
    artifactType: INTERACTIVE_DOC_ARTIFACT_TYPE,
    meta: {},
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId,
      artifactType: INTERACTIVE_DOC_ARTIFACT_TYPE,
      sourceFormat: INTERACTIVE_DOC_PROJECT_SCHEMA,
      editorCapability: "interactive-doc-editor",
      editability: "native",
      integrity: { ok: true, reason: "" },
      access: { canRead: true, canEdit: true, canFork: true },
      owner: { visibility: "private" },
      renditions: {},
    },
    ...overrides,
  };
}

/** 任何一次调用都算「碰了 artifact 链」，功能数据保存一次都不许碰。 */
function forbiddenDependencies(calls) {
  return {
    upload: async () => {
      calls.push("upload");
      return { ok: true, data: { file: { url: "https://cdn.test/x.json" } } };
    },
    publish: async () => {
      calls.push("publish");
      return { ok: false, error: "不该走到这里" };
    },
    fork: async () => {
      calls.push("fork");
      return { ok: false, error: "不该走到这里" };
    },
    digest: async () => {
      calls.push("digest");
      return "b".repeat(64);
    },
  };
}

test("这三份第一屏今天确实过不了素材完备判据 —— 缺陷本身先钉死", () => {
  for (const pluginId of PLUGIN_IDS) {
    const project = firstScreenProject(pluginId);
    const assessment = assessInteractiveDocCompleteness(project, {
      skipReactivity: true,
    });
    assert.equal(
      assessment.ok,
      false,
      `${pluginId} 若已达标，本用例的前提就变了，请重判 A-5`,
    );
    assert.ok(
      interactiveDocSourceByteLength(project) <
        INTERACTIVE_DOC_LIMITS.sourceBytesMin,
      `${pluginId} 的第一屏本来就远小于货架字节下限`,
    );
    // attribution 那条正是「要用户给自己手写的卡片填许可证 URL」。
    const codes = assessment.failures.map((failure) => failure.code);
    assert.ok(
      codes.includes("source-too-small") || codes.includes("prose-too-short"),
      `${pluginId} 实际失败项:${codes.join(",")}`,
    );
  }
});

test("功能里的用户数据存得下去：三份第一屏与「加了一条」之后都放行", () => {
  for (const pluginId of PLUGIN_IDS) {
    const project = firstScreenProject(pluginId);
    for (const [label, candidate] of [
      ["第一屏", project],
      ["加了一条数据", withOneUserRow(project)],
    ]) {
      const saved = assertInteractiveDocSaveable(candidate, {
        saveTarget: "plugin-instance",
      });
      assert.ok(
        saved.json.length > 0,
        `${pluginId} ${label}:功能数据被拒了`,
      );
      assert.equal(saved.project.schema, INTERACTIVE_DOC_PROJECT_SCHEMA);
    }
  }
});

test("同一份工程按素材存仍然被拒 —— 编辑类插件编辑真素材的判据一个字没松", () => {
  for (const pluginId of PLUGIN_IDS) {
    const project = firstScreenProject(pluginId);
    assert.throws(
      () => assertInteractiveDocSaveable(project),
      (error) => {
        assert.ok(error instanceof InteractiveDocCommitError);
        assert.ok(
          ["source-too-small", "incomplete"].includes(error.code),
          `${pluginId} 期望仍按 §8 判拒,实际 ${error.code}`,
        );
        return true;
      },
      `${pluginId}:默认口径必须仍是素材完备判据`,
    );
  }
});

test("保存对象按 meta.plugin_id 认，不按编辑器认", () => {
  const instance = pluginInstanceLibraryItem("unit-converter", {
    siteId: "study",
    appId: "unit-tools",
    nonce: "n1",
  });
  assert.ok(instance, "取不到插件实例");
  assert.equal(interactiveDocSaveTargetForItem(instance), "plugin-instance");
  assert.equal(interactiveDocSaveTargetForItem(materialItem()), "material");
  assert.equal(interactiveDocSaveTargetForItem(null), "material");
  assert.equal(
    interactiveDocSaveTargetForItem({ meta: { content_type: "interactive_doc" } }),
    "material",
    "只有带身份的插件实例才走功能数据那条路",
  );
});

test("功能数据保存全程不碰 artifact 链:零上传、零 revision", async () => {
  for (const pluginId of PLUGIN_IDS) {
    const item = pluginInstanceLibraryItem(pluginId, {
      siteId: "study",
      appId: "review-outline",
      nonce: "n1",
    });
    assert.ok(item, `${pluginId} 造不出实例`);
    const calls = [];
    const result = await commitInteractiveDocProject({
      project: withOneUserRow(firstScreenProject(pluginId)),
      item,
      dependencies: forbiddenDependencies(calls),
    });
    assert.equal(result.ok, true, pluginId);
    assert.equal(result.saveTarget, "plugin-instance", pluginId);
    assert.deepEqual(calls, [], `${pluginId} 碰了 artifact 链:${calls.join(",")}`);
    assert.equal(result.artifactId, "", "功能数据不许拿到 artifact 身份");
    assert.equal(result.revisionId, "", "功能数据不许发 revision");
    assert.equal(result.projectUrl, "", "功能数据不落对象存储");
    assert.equal(result.item.content, result.json, "字节要回给工作台记进会话");
    assert.equal(result.item.url, undefined, "功能数据不可下载");
  }
});

test("反面:正确性判据对功能数据照查 —— 有环的计算图仍然拒", async () => {
  const project = firstScreenProject("financial-calculator");
  const cyclic = clone(project);
  cyclic.computations = [
    ...cyclic.computations,
    { id: "loop_a", label: "环 A", expression: "loop_b + 1", precision: 2 },
    { id: "loop_b", label: "环 B", expression: "loop_a + 1", precision: 2 },
  ];
  assert.throws(
    () => assertInteractiveDocSaveable(cyclic, { saveTarget: "plugin-instance" }),
    (error) => {
      assert.equal(error.code, "graph-cyclic");
      return true;
    },
  );
  const item = pluginInstanceLibraryItem("financial-calculator", {
    nonce: "n2",
  });
  const calls = [];
  await assert.rejects(
    () =>
      commitInteractiveDocProject({
        project: cyclic,
        item,
        dependencies: forbiddenDependencies(calls),
      }),
    (error) => error instanceof InteractiveDocCommitError,
  );
  assert.deepEqual(calls, []);
});

test("反面:给真素材挂上 plugin_id 也换不到松判据那条路", async () => {
  const project = firstScreenProject("unit-converter");
  const disguised = {
    ...materialItem(),
    meta: { plugin_id: "unit-converter" },
  };
  const calls = [];
  await assert.rejects(
    () =>
      commitInteractiveDocProject({
        project,
        item: disguised,
        dependencies: forbiddenDependencies(calls),
      }),
    (error) => {
      assert.ok(error instanceof InteractiveDocCommitError);
      assert.equal(error.code, "plugin-not-material");
      return true;
    },
  );
  // 显式点名要那条路也一样：判据看的是这件东西有没有 artifact 身份。
  await assert.rejects(
    () =>
      commitInteractiveDocProject({
        project,
        item: materialItem(),
        saveTarget: "plugin-instance",
        dependencies: forbiddenDependencies(calls),
      }),
    (error) => error.code === "plugin-not-material",
  );
  assert.deepEqual(calls, [], "被拒的路径不许留下任何上传");
});

test("反面:真素材走素材那条路,完备判据仍在闸上", async () => {
  const calls = [];
  await assert.rejects(
    () =>
      commitInteractiveDocProject({
        project: firstScreenProject("spaced-repetition-scheduler"),
        item: materialItem(),
        dependencies: forbiddenDependencies(calls),
      }),
    (error) => {
      assert.ok(error instanceof InteractiveDocCommitError);
      assert.ok(["source-too-small", "incomplete"].includes(error.code));
      return true;
    },
  );
  assert.deepEqual(calls, [], "判据没过就不该上传任何字节");
});

// ===========================================================================
// R-10 第二个内核：grid（台账 / 文献矩阵 / 三表模型）
// ---------------------------------------------------------------------------
// 取证（`/tmp/w12-r10-probe.mjs`，跑的是产品自己的函数）：三份第一屏的 IR 逐份
// 被 `validateGridIrProject` 判红，失败形状与 interactive-doc 那次一模一样 ——
//   ledger-register        title-length | row-count | attribution-count
//   literature-matrix      title-length | row-count ×2 | attribution-count
//   three-statement-model  title-length | attribution-count
// `row-count` 说的是「数据行数至少 4」，而台账刚打开时是零行数据加一行列头；
// `attribution-count` 说的是「署名至少 1 条且要有 licenseUrl」。
// ===========================================================================

const GRID_PLUGIN_IDS = [
  "ledger-register",
  "literature-matrix",
  "three-statement-model",
];

/** 把功能的第一屏摊成 `oceanleo.grid.v1` IR —— 走产品自己的换算，不手搓。 */
async function firstScreenGridIr(pluginId) {
  const item = pluginInstanceLibraryItem(pluginId, {
    siteId: "excel",
    appId: "probe",
    nonce: "n1",
  });
  assert.ok(item, `${pluginId} 造不出实例`);
  const sheets = await loadGridSheets(item);
  return gridCarrierProjectToIr({
    sheets,
    carrier: {
      title: String(item.title || ""),
      sheets: Object.fromEntries(
        sheets.map((sheet) => [
          sheet.name,
          { headerRow: true, columns: [], emphasisRows: [] },
        ]),
      ),
      namedRanges: [],
      attribution: { entries: [] },
    },
  });
}

test("grid:三份第一屏今天确实过不了素材判据 —— 缺陷本身先钉死", async () => {
  for (const pluginId of GRID_PLUGIN_IDS) {
    const ir = await firstScreenGridIr(pluginId);
    const asMaterial = validateGridIrProject(ir);
    assert.equal(
      asMaterial.ok,
      false,
      `${pluginId} 若已达标，本用例的前提就变了，请重判 R-10`,
    );
    const codes = asMaterial.errors.map((error) => error.code);
    assert.ok(
      codes.includes("attribution-count") ||
        codes.includes("attribution-missing"),
      `${pluginId} 期望仍被署名判据拦下,实际 ${codes.join(",")}`,
    );
  }
});

test("grid:功能里的用户数据存得下去,零行数据的台账也存得下去", async () => {
  for (const pluginId of GRID_PLUGIN_IDS) {
    const ir = await firstScreenGridIr(pluginId);
    const asPlugin = validateGridIrProject(ir, {
      saveTarget: "plugin-instance",
    });
    assert.equal(
      asPlugin.ok,
      true,
      `${pluginId} 功能数据被拒:${(asPlugin.errors || [])
        .map((error) => `${error.code}@${error.path}`)
        .join(" | ")}`,
    );
    // 存得进去还要读得回来：同一套口径，否则用户下次打开就炸。
    const reopened = parseGridIrSource(serializeGridIrProject(asPlugin.project), {
      saveTarget: "plugin-instance",
    });
    assert.equal(reopened.title, ir.title, pluginId);
  }
});

test("grid:反面 —— 素材那一侧的三条判据一个字没松", async () => {
  const ir = await firstScreenGridIr("ledger-register");
  const material = validateGridIrProject(ir);
  const codes = material.errors.map((error) => error.code);
  for (const expected of ["title-length", "row-count", "attribution-count"]) {
    assert.ok(codes.includes(expected), `素材口径丢了 ${expected}`);
  }
  // 结构与正确性判据对功能数据照查：未知字段、错 schema、坏单元格一律仍拒。
  const broken = JSON.parse(JSON.stringify(ir));
  broken.schema = "oceanleo.grid.v2";
  broken.sheets[0].rows = "not-an-array";
  broken.uninvitedKey = 1;
  const asPlugin = validateGridIrProject(broken, {
    saveTarget: "plugin-instance",
  });
  assert.equal(asPlugin.ok, false, "结构坏了也放行就成了另一个洞");
  const brokenCodes = asPlugin.errors.map((error) => error.code);
  assert.ok(brokenCodes.includes("schema-const"), brokenCodes.join(","));
  assert.ok(brokenCodes.includes("additional-properties"), brokenCodes.join(","));
  assert.ok(brokenCodes.includes("row-count"), brokenCodes.join(","));
});

// ===========================================================================
// R-10 第三个内核：geo-map（地图 / 地球仪 / 户型标注）
// ---------------------------------------------------------------------------
// 取证：三份第一屏跑 `evaluateGeoMapCompleteness` 逐份判红
// （`geo-map-hollow` ×3 + `geo-map-color-collapse`），`commitGeoMapProject`
// 再叠上封面与 durable 身份两条。父 agent 让我先查证再动手，这一条**查证属实**。
// ===========================================================================

const GEO_PLUGIN_IDS = [
  "annotatable-city-map",
  "interactive-globe",
  "floorplan-annotation",
];

function firstScreenGeoProject(pluginId) {
  const input = pluginInitialItemInput(pluginId);
  assert.ok(input?.content, `${pluginId} 取不到初始态字节`);
  return parseGeoMapSource(input.content);
}

/** 内置底图的真字节 —— 依赖闭包判定是正确性，功能数据也要过。 */
async function geoDependencyBlobs(project) {
  const blobs = [];
  for (const dependency of project.dependencies ?? []) {
    const payload = await loadBuiltInGeoPayload(dependency.path);
    assert.ok(payload, `内置数据 ${dependency.path} 取不到`);
    blobs.push({
      path: dependency.path,
      mediaType: dependency.mediaType,
      blob: new Blob([payload], { type: dependency.mediaType }),
    });
  }
  return blobs;
}

const geoRuntime = (calls) => ({
  digest: async (blob) =>
    createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex"),
  upload: async () => {
    calls.push("upload");
    return { ok: true, url: "https://cdn.test/x.json", digest: "0".repeat(64) };
  },
  publish: async () => {
    calls.push("publish");
    return { ok: false, error: "不该走到这里" };
  },
  fork: async () => {
    calls.push("fork");
    return { ok: false, error: "不该走到这里" };
  },
});

test("geo-map:三份第一屏今天确实过不了素材完备判据 —— 缺陷本身先钉死", () => {
  for (const pluginId of GEO_PLUGIN_IDS) {
    const project = firstScreenGeoProject(pluginId);
    const assessment = evaluateGeoMapCompleteness({
      project,
      sourceBytes: new TextEncoder().encode(JSON.stringify(project)).byteLength,
    });
    assert.equal(
      assessment.ok,
      false,
      `${pluginId} 若已达标，本用例的前提就变了，请重判 R-10`,
    );
    assert.ok(
      assessment.failures.some((failure) => failure.code === "geo-map-hollow"),
      `${pluginId} 实际失败项:${assessment.failures
        .map((failure) => failure.code)
        .join(",")}`,
    );
  }
});

test("geo-map:功能里的用户数据存得下去,且不碰 artifact 链", async () => {
  for (const pluginId of GEO_PLUGIN_IDS) {
    const project = firstScreenGeoProject(pluginId);
    const item = pluginInstanceLibraryItem(pluginId, { nonce: "n1" });
    assert.ok(item, `${pluginId} 造不出实例`);
    const calls = [];
    const result = await commitGeoMapProject({
      project,
      item,
      title: String(item.title),
      editRevision: 1,
      dependencyBlobs: await geoDependencyBlobs(project),
      runtime: geoRuntime(calls),
    });
    assert.equal(
      result.ok,
      true,
      `${pluginId} 被拒:${(result.errors || [])
        .map((error) => `${error.code}@${error.path}`)
        .join(" | ")}`,
    );
    assert.equal(result.saveTarget, "plugin-instance");
    assert.deepEqual(calls, [], `${pluginId} 碰了 artifact 链:${calls.join(",")}`);
    assert.equal(result.artifactId, "", "功能数据不许拿到 artifact 身份");
    assert.equal(result.revisionId, "", "功能数据不许发 revision");
    assert.ok(result.closure.length >= 1, "内置底图仍要逐件对上摘要");
  }
});

test("geo-map:反面 —— 依赖闭包是正确性,取不到底图字节照样拒", async () => {
  const pluginId = "annotatable-city-map";
  const project = firstScreenGeoProject(pluginId);
  const calls = [];
  const result = await commitGeoMapProject({
    project,
    item: pluginInstanceLibraryItem(pluginId, { nonce: "n2" }),
    title: "地图",
    editRevision: 1,
    // 一件依赖都不给：缺陷二的根因就是「声明了依赖却取不到字节」，
    // 这条判据对功能数据也必须留着，否则又回到淡蓝空矩形。
    dependencyBlobs: [],
    runtime: geoRuntime(calls),
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (error) => error.code === "geo-map-dependency-closure-incomplete",
    ),
    result.errors.map((error) => error.code).join(","),
  );
  assert.deepEqual(calls, []);
});

test("geo-map:反面 —— 给真素材挂 plugin_id 换不到松判据,真素材判据也没松", async () => {
  const project = firstScreenGeoProject("annotatable-city-map");
  const blobs = await geoDependencyBlobs(project);
  const durableGeoItem = {
    ...materialItem(),
    artifactType: "geo_map",
    artifact: {
      ...materialItem().artifact,
      artifactType: "geo_map",
      sourceFormat: "oceanleo.geo-map.v1",
      editorCapability: "geo-map-editor",
    },
    meta: { plugin_id: "annotatable-city-map" },
  };
  const calls = [];
  const disguised = await commitGeoMapProject({
    project,
    item: durableGeoItem,
    title: "伪装成功能数据的真素材",
    editRevision: 1,
    dependencyBlobs: blobs,
    runtime: geoRuntime(calls),
  });
  assert.equal(disguised.ok, false);
  assert.ok(
    disguised.errors.some(
      (error) =>
        error.code === "geo-map-commit-rejected" &&
        error.message.includes("artifact 身份"),
    ),
    disguised.errors.map((error) => error.message).join(" | "),
  );
  // 同一份工程按素材存：§8 完备判据仍然把它拦下（这三条正是功能数据不该受的）。
  const asMaterial = await commitGeoMapProject({
    project,
    item: { ...durableGeoItem, meta: {} },
    title: "真素材",
    editRevision: 1,
    dependencyBlobs: blobs,
    runtime: geoRuntime(calls),
  });
  assert.equal(asMaterial.ok, false);
  assert.ok(
    asMaterial.errors.some((error) => error.code === "geo-map-hollow"),
    asMaterial.errors.map((error) => error.code).join(","),
  );
  assert.deepEqual(calls, [], "被拒的路径不许留下任何上传");
});
