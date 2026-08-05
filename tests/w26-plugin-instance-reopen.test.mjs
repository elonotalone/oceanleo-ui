/**
 * 「存了能重开、用户填的东西还在」—— 三个非编辑类内核各一条，罩住**保存之后那一跳**。
 *
 * 与 `tests/plugin-instance-save-entry.test.mjs`（W19）的分工，先说清楚免得重复造：
 * 那一份已经端到端证明了「第一屏起手 → 用户填 → 存 → 把保存交回来的那件东西重新
 * 挂上去 → 填的东西还在」，三个内核各一条，用的是真的第一屏与真的 hook。
 * **本文件不重造那一段**，接的是它后面那一跳：
 *
 *   保存交回来的那件东西 → 工作台把它写进会话（右栏那份「存过的编辑器」）→
 *   用户从会话里把它捡回来 → 它还得**是同一个功能实例**、填的东西还在、还能接着存。
 *
 * 这一跳今天真的会断，不是假想：功能实例每存一次，
 * `InlineAdvancedWorkbenchShell` → `advanced-persistence-controller` →
 * `advanced-session.withInlineEditorHistoryHead()` 就把它写进会话快照，而那一层
 * 的 `META_KEYS` 白名单（`advanced-session.ts:72-139`）里没有 `plugin_id`。
 * 捡回来的台账因此被判成一件素材，下一次保存就照素材链把用户记的账发进库 ——
 * W19 在保存入口堵掉的洞，在下一跳原样复现。识别那一侧已在
 * `plugin-initial-state.pluginIdForItem()` 修掉（实例键是同一处写下的第二份证据）；
 * 白名单本身不在本人独占面上，写进 `signals/W26-request.md`。
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  inlineEditorItemsFromSession,
  withInlineEditorHistoryHead,
} from "../src/shell/advanced-session.ts";
import { loadGridSheets } from "../src/shell/doc-editors/grid-model.ts";
import { commitGeoMapProject } from "../src/shell/geo-map-editor/geo-map-persistence.ts";
import { parseGeoMapSource } from "../src/shell/geo-map-editor/geo-map-source.ts";
import { commitInteractiveDocProject } from "../src/shell/interactive-doc-editor/interactive-doc-persistence.ts";
import { parseInteractiveDocSource } from "../src/shell/interactive-doc-editor/interactive-doc-source.ts";
import {
  pluginInstanceLibraryItem,
  pluginRuntimeForItem,
  saveTargetForItem,
} from "../src/shell/plugin-initial-state.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

/* ------------------------------ grid 的取用 ------------------------------ */
/**
 * `use-grid-editor.ts` 直接 import 会经 i18n 链拖进一份 `.tsx`，本仓的 loader
 * 不认这个扩展名。做法与 W19 那份测试同源：把它编出来，只替掉三个进不来的模块，
 * 其余一律用真模块。本文件只取它两个纯函数，不挂 React。
 */
const require = createRequire(import.meta.url);

/**
 * 相对 specifier 一律换成绝对 file URL。
 *
 * 不用「逐个列出要替换的模块」那种写法：`data:` 模块解析不了相对路径，于是
 * **被编译的文件每多一个 import，替换表就漏一个，整份测试当场
 * `ERR_UNSUPPORTED_RESOLVE_REQUEST`、一条断言都不执行**（W19 加 import 时
 * `tests/rendition-callback-identity.test.mjs` 就是这么整份哑掉的，W22 `3946fa9` 修的）。
 * 这里改成全量重写，只有真的加载不进来的那几个才落到显式桩上。
 */
const { gridPluginInstanceVersion, gridSavedItemForHandoff } = await import(
  await compileModule("src/shell/doc-editors/use-grid-editor.ts", {
    "../../i18n/ui/useUI": dataModule(
      "export function useUI() { return (value) => value; }",
    ),
    "./doc-io": dataModule(`
      export function downloadBlob() {}
      export function downloadText() {}
      export async function loadEditorProject() {
        throw new Error("测试里没有可编辑工程 sidecar");
      }
      export async function saveFileToLibrary() {
        throw new Error("功能数据这条路上不许出现落库调用");
      }
    `),
    "./editor-preview-raster": dataModule(
      "export async function renderGridPreviewPng() { return null; }",
    ),
  })
);

/* --------------------------------- 夹具 ---------------------------------- */

/** 真的第一屏。造不出来就直接红——不许在这里自造夹具顶上。 */
function firstScreen(pluginId, siteId, appId) {
  const item = pluginInstanceLibraryItem(pluginId, {
    siteId,
    appId,
    nonce: `cap:${siteId}/${appId}/${pluginId}:1`,
  });
  assert.ok(item, `${pluginId} 造不出第一屏实例`);
  assert.equal(saveTargetForItem(item), "plugin-instance");
  return item;
}

/**
 * 工作台那一跳：把保存交回来的实例写进会话，再从会话里把它捡回来。
 * 走的是真链上的两个函数，不手搓「会话里大概长这样」的形状。
 */
function throughSession(savedItem, route) {
  const snapshot = withInlineEditorHistoryHead({}, savedItem, route, null);
  const restored = inlineEditorItemsFromSession({ snapshot });
  assert.equal(restored.length, 1, "会话里没捡回那份存过的实例");
  return restored[0];
}

/** 网络与落库在这一层一律不许发生：功能数据的字节全在手上。 */
function forbiddenRuntime(label) {
  return {
    upload: async () => {
      throw new Error(`${label} 不许上传`);
    },
    publish: async () => {
      throw new Error(`${label} 不许发 revision`);
    },
    fork: async () => {
      throw new Error(`${label} 不许 fork`);
    },
    digest: async () => "0".repeat(64),
  };
}

/* ================================= grid ================================== */

test("grid：台账存下去，经会话捡回来还是台账，账还在、还能接着记", async () => {
  const item = firstScreen("ledger-register", "excel", "bookkeeping");
  const sheets = await loadGridSheets(item);
  const header = [...sheets[0].rows[0]];
  assert.ok(header.length >= 3, `第一屏的台账没有列头：${JSON.stringify(header)}`);

  // 用户记第一笔账。
  sheets[0].rows[1][0] = "2026-08-05";
  sheets[0].rows[1][1] = "地铁";
  sheets[0].rows[1][2] = "6";

  const version = gridPluginInstanceVersion({ item, sheets, headerRow: true });
  assert.equal(version.saveTarget, "plugin-instance");
  assert.equal(version.artifactId, "", "功能数据不许拿到 artifact 身份");
  assert.equal(version.revisionId, "", "功能数据不许发 revision");
  assert.equal(version.url, "", "功能数据不落对象存储");

  const restored = throughSession(version.item, "grid");
  assert.equal(
    saveTargetForItem(restored),
    "plugin-instance",
    "从会话里捡回来的台账被判成素材了：下一次保存就会把用户记的账发进库",
  );
  assert.equal(pluginRuntimeForItem(restored), "grid");

  const reopened = await loadGridSheets(restored);
  assert.deepEqual(
    reopened[0].rows[1].slice(0, 3),
    ["2026-08-05", "地铁", "6"],
    `重开之后用户记的账没了：${JSON.stringify(reopened[0].rows.slice(0, 2))}`,
  );
  assert.deepEqual(reopened[0].rows[0], header, "列头这类插件自己的结构不许丢");

  // 接着记第二笔：捡回来的实例仍然走功能数据那条路，不是一次性的。
  reopened[0].rows[2][0] = "2026-08-06";
  reopened[0].rows[2][1] = "午饭";
  reopened[0].rows[2][2] = "28";
  const again = gridPluginInstanceVersion({
    item: restored,
    sheets: reopened,
    headerRow: true,
  });
  assert.equal(again.saveTarget, "plugin-instance");
  const twice = await loadGridSheets(throughSession(again.item, "grid"));
  assert.deepEqual(twice[0].rows[1].slice(0, 3), ["2026-08-05", "地铁", "6"]);
  assert.deepEqual(twice[0].rows[2].slice(0, 3), ["2026-08-06", "午饭", "28"]);
});

test("反面：台账改走素材那一档，重开就只剩第一屏", async () => {
  const item = firstScreen("ledger-register", "excel", "bookkeeping");
  const sheets = await loadGridSheets(item);
  sheets[0].rows[1][1] = "地铁";

  // 素材那一档的交回件是 `gridSavedItemForHandoff`（真链上那一个）：它交的是
  // 新 revision 的身份，用户填的东西在 xlsx 字节里，不在 `meta.sheets` 里。
  const asMaterial = gridSavedItemForHandoff(item, {
    ok: true,
    url: "https://cdn.test/saved.xlsx",
    versionId: "version-2",
    projectUrl: "https://cdn.test/saved.project.json",
    projectSchema: "oceanleo.grid.v1",
    artifactId: "artifact-grid-1",
    revisionId: "revision-2",
    previousRevisionId: "revision-1",
    title: "台账-编辑版",
    savedAt: "2026-08-05T00:00:00.000Z",
    error: "",
  });
  const reopened = await loadGridSheets(asMaterial);
  assert.notDeepEqual(
    reopened[0].rows[1].slice(0, 2),
    ["", "地铁"],
    "分档改坏之后这条端到端仍然是绿的，说明它没有钉住任何东西",
  );
  assert.equal(
    reopened[0].rows[1][1],
    "",
    "素材档交回来的实例里不该带着功能数据的那一格",
  );
});

/* ================================ geo-map ================================= */

test("geo-map：地图上点的标注存下去，经会话捡回来还是地图，标注还在", async () => {
  const item = firstScreen("annotatable-city-map", "travel", "city-guide");
  const project = parseGeoMapSource(item.content);
  const manifest = item.meta.source_manifest;
  assert.ok(Array.isArray(manifest) && manifest.length > 0, "第一屏没有内置底图清单");

  // 用户在地图上点第一个标注。
  const annotated = {
    ...project,
    metadata: { ...project.metadata, title: "我的成都散步路线" },
    annotations: [
      ...(project.annotations ?? []),
      {
        id: "annotation-1",
        kind: "marker",
        geometry: { type: "Point", coordinates: [104.0668, 30.5728] },
        text: "宽窄巷子",
      },
    ],
  };

  const saved = await commitGeoMapProject({
    item,
    title: annotated.metadata.title,
    editRevision: 0,
    project: annotated,
    durableDependencies: manifest,
    runtime: forbiddenRuntime("地图功能数据"),
  });
  assert.equal(
    saved.ok,
    true,
    `地图保存被拒：${JSON.stringify(saved.ok === false ? saved.errors : [])}`,
  );
  assert.equal(saved.saveTarget, "plugin-instance");
  assert.equal(saved.revisionId, "", "功能数据不许发 revision");
  assert.equal(saved.projectUrl, "", "功能数据不落对象存储");

  // 工作台把字节挂回实例的 `content`（`GeoMapRoute.buildSavedItem` 就是这么交的）。
  const restored = throughSession(
    { ...item, content: saved.json },
    "geo-map",
  );
  assert.equal(
    saveTargetForItem(restored),
    "plugin-instance",
    "从会话里捡回来的地图被判成素材了",
  );
  assert.equal(pluginRuntimeForItem(restored), "geo-map");

  const reopened = parseGeoMapSource(restored.content);
  assert.equal(reopened.metadata.title, "我的成都散步路线");
  assert.equal(reopened.annotations.length, (project.annotations ?? []).length + 1);
  assert.equal(
    reopened.annotations.at(-1).text,
    "宽窄巷子",
    "重开之后用户点的标注没了",
  );

  // 捡回来之后再存一次仍然走功能数据那条路。
  const again = await commitGeoMapProject({
    item: restored,
    title: reopened.metadata.title,
    editRevision: 1,
    project: reopened,
    durableDependencies: manifest,
    runtime: forbiddenRuntime("地图功能数据"),
  });
  assert.equal(again.ok, true);
  assert.equal(again.saveTarget, "plugin-instance");
});

test("反面：地图改走素材那一档，当场存不下去", async () => {
  const item = firstScreen("annotatable-city-map", "travel", "city-guide");
  const project = parseGeoMapSource(item.content);
  const outcome = await commitGeoMapProject({
    item,
    title: project.metadata.title,
    editRevision: 0,
    project,
    durableDependencies: item.meta.source_manifest,
    saveTarget: "material",
    runtime: forbiddenRuntime("地图素材档"),
  });
  assert.equal(
    outcome.ok,
    false,
    "分档恒 material 之后地图功能数据居然存下去了 —— 那条端到端没有钉住分档",
  );
  assert.ok(
    outcome.errors.some((error) => error.code === "geo-map-commit-rejected"),
    `素材档该按 artifact 身份与封面判拒，实际：${JSON.stringify(outcome.errors)}`,
  );
});

/* ============================ interactive-doc ============================= */

test("interactive-doc：换算器里填的数存下去，经会话捡回来还是换算器，数还在", async () => {
  const item = firstScreen("unit-converter", "study", "unit-tools");
  const project = parseInteractiveDocSource(item.content);
  const numeric = project.parameters.find(
    (parameter) => parameter.kind === "number",
  );
  assert.ok(numeric, "第一屏没有可填的数值参数");
  assert.notEqual(numeric.default, 42, "夹具与第一屏缺省撞上了，这条会假绿");

  // 用户填 42。功能数据这一档把当前值冻成参数缺省（W19 `62d7c0f` 的做法）。
  const filled = {
    ...project,
    parameters: project.parameters.map((parameter) =>
      parameter.id === numeric.id ? { ...parameter, default: 42 } : parameter,
    ),
  };

  const saved = await commitInteractiveDocProject({
    item,
    project: filled,
    dependencies: {
      upload: async () => {
        throw new Error("功能数据不许上传");
      },
      publish: async () => {
        throw new Error("功能数据不许发 revision");
      },
      fork: async () => {
        throw new Error("功能数据不许 fork");
      },
    },
  });
  assert.equal(saved.saveTarget, "plugin-instance");
  assert.equal(saved.artifactId, "", "功能数据不许拿到 artifact 身份");
  assert.equal(saved.revisionId, "", "功能数据不许发 revision");

  const restored = throughSession(saved.item, "interactive-doc");
  assert.equal(
    saveTargetForItem(restored),
    "plugin-instance",
    "从会话里捡回来的换算器被判成素材了",
  );
  assert.equal(pluginRuntimeForItem(restored), "interactive-doc");

  const reopened = parseInteractiveDocSource(restored.content);
  assert.equal(
    reopened.parameters.find((parameter) => parameter.id === numeric.id).default,
    42,
    "重开之后用户填的数没了，只剩第一屏的示例值",
  );

  const again = await commitInteractiveDocProject({
    item: restored,
    project: reopened,
    dependencies: {
      upload: async () => {
        throw new Error("功能数据不许上传");
      },
      publish: async () => {
        throw new Error("功能数据不许发 revision");
      },
    },
  });
  assert.equal(again.saveTarget, "plugin-instance");
});

test("反面：换算器改走素材那一档，当场存不下去", async () => {
  const item = firstScreen("unit-converter", "study", "unit-tools");
  const project = parseInteractiveDocSource(item.content);
  await assert.rejects(
    () =>
      commitInteractiveDocProject({
        item,
        project,
        saveTarget: "material",
        dependencies: {
          upload: async () => {
            throw new Error("素材档不该走到上传");
          },
          publish: async () => {
            throw new Error("素材档不该走到发布");
          },
        },
      }),
    (error) => {
      assert.equal(error.name, "InteractiveDocCommitError");
      assert.ok(
        ["identity", "incomplete", "source-too-small"].includes(error.code),
        `素材档该按身份或 §8 完备判拒，实际 ${error.code}`,
      );
      return true;
    },
    "分档恒 material 之后换算器的功能数据居然存下去了",
  );
});
