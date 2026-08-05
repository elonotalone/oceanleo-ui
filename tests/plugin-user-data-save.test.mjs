// ============================================================================
// A-5 / R-4 —— 功能里的用户数据保存，不许走素材完备判据
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
import { pluginInitialItemInput } from "../src/shell/plugin-initial-states/index.ts";
import { pluginInstanceLibraryItem } from "../src/shell/plugin-initial-state.ts";

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
