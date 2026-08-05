// ============================================================================
// 通用空白起手件 —— 已废弃的那条路，与它留下来的载体字节
// ----------------------------------------------------------------------------
// 原来这份文件锁的是「空手点开一个功能」：按载体类型反查 5 份通用空白模板之一，
// 判它们能不能挂起来。那条路已经整条拆掉 —— 全平台两千多枚按键共用 5 份骨架，
// 正是「点地图、点台账、点换算器打开的都是同一份『输入 A / 输入 B』」的成因。
// 按键现在按**插件身份**派发，第一屏由该插件自己的初始态提供
// （`plugin-initial-state.ts` + `plugin-initial-states/`）。
//
// 文件与字节仍然留着，锁两件事：
//   1. **载体契约**：那几份起手件的字节至今是各载体解析器唯一一份可执行夹具
//      （geo-map / interactive-doc / chart 三份 schema，grid / pdf 两条空态约定）。
//      这部分断言一条没动。
//   2. **回不去**：任何一枚按键都不许再走到通用模板 —— 起手件不是插件实例、
//      载体 id 不是插件 id、查不到初始态时返回空而不是给一份骨架。
// 一行 mock 都没有：每一步都走产品自己的函数，断言解析出来的具体值。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BLANK_DRAFT_FEATURE_IDS,
  blankDraftLibraryItem,
  isBlankDraftFeatureId,
} from "../src/shell/blank-draft-items.ts";
import {
  ADVANCED_FEATURE_LAUNCH_EVENT,
  advancedFeatureLaunchForCapability,
  normalizeAdvancedFeatureLaunch,
} from "../src/shell/advanced-feature-launch.ts";
import {
  pluginIdForItem,
  pluginInitialStateAvailable,
  pluginInstanceFromInitialState,
  pluginInstanceLibraryItem,
} from "../src/shell/plugin-initial-state.ts";
import { editorCapabilityFor } from "../src/shell/workbench-routes.ts";
import { FIXED_WORKSPACE_SLOTS } from "../src/shell/workspace-actions.ts";
import { parseGeoMapSource } from "../src/shell/geo-map-editor/geo-map-source.ts";
import {
  evaluateComputeGraph,
  parseInteractiveDocSource,
} from "../src/shell/interactive-doc-editor/interactive-doc-source.ts";
import { resolveChartSource } from "../src/shell/chart-editor/chart-source.ts";
import { chartDocumentFromJson } from "../src/shell/chart-editor/chart-schema.ts";
import { loadGridSheets } from "../src/shell/doc-editors/grid-model.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function draftFor(featureId) {
  const item = blankDraftLibraryItem(featureId, {
    siteId: "study",
    appId: "note-outline",
    nonce: "test-1",
  });
  assert.ok(item, `${featureId} 没有造出起手件`);
  return item;
}

test("通用起手件不再是任何一枚按键的目的地", () => {
  assert.deepEqual([...BLANK_DRAFT_FEATURE_IDS].sort(), [
    "chart_editing",
    "geo_map_editing",
    "interactive_doc_editing",
    "pdf_editing",
    "spreadsheet_editing",
  ]);
  for (const featureId of BLANK_DRAFT_FEATURE_IDS) {
    const item = draftFor(featureId);
    // 起手件必须**真的空手**：没有任何 URL，也不是 durable artifact。
    assert.equal(item.url, undefined, `${featureId} 起手件不该带 url`);
    assert.equal(item.previewUrl, undefined, `${featureId} 起手件不该带 previewUrl`);
    assert.equal(item.artifactId, undefined);
    assert.equal(item.meta.draft, true);
    assert.equal(item.meta.blank, true);
    // 而它**不是插件实例**：承载层认的是 `meta.plugin_id`，起手件一个都没有，
    // 所以再也不会被当成「某个插件的第一屏」挂起来。
    assert.equal(pluginIdForItem(item), "", `${featureId} 混进了插件身份`);
    // 载体 id 也不是插件 id：拿它去查初始态，返回空而不是一份骨架。
    assert.equal(pluginInitialStateAvailable(featureId), false, featureId);
    assert.equal(pluginInstanceLibraryItem(featureId, {}), null, featureId);
  }
});

test("空白草稿分支已从路由里拆掉：表格与 PDF 起手件不再自动挂得起来", () => {
  // 这两类原来**只**靠那条分支才判得了 available（它们不带字节）。分支拆掉之后
  // 一律 fail-closed —— 这正是「按键不许退回通用模板」在路由层的表现。
  for (const featureId of ["spreadsheet_editing", "pdf_editing"]) {
    const capability = editorCapabilityFor(draftFor(featureId));
    assert.equal(capability.available, false, featureId);
    assert.equal(capability.adapter, "none", featureId);
  }
  const routes = source("../src/shell/workbench-routes.ts");
  assert.doesNotMatch(
    routes,
    /blankDraftCapabilityFor/,
    "空白起手件分支必须从路由里消失，否则按键还能退回通用模板",
  );
  assert.match(
    source("../src/shell/blank-draft-items.ts"),
    /@deprecated/,
    "本模块必须留着废弃标记，免得下一个人当它还是活路",
  );
  assert.doesNotMatch(
    source("../src/shell/ResultCanvas.tsx"),
    /blankDraftLibraryItem/,
    "右栏不许再造通用起手件",
  );
});

test("插件实例按内核挂 route，带了下载地址一律拒", () => {
  const byRuntime = {
    "geo-map": { adapter: "geo-map", route: "geo-map" },
    grid: { adapter: "grid", route: "grid" },
    "interactive-doc": { adapter: "interactive-doc", route: "interactive-doc" },
  };
  for (const [runtime, expected] of Object.entries(byRuntime)) {
    const instance = pluginInstanceFromInitialState(
      "probe-plugin",
      { runtime, title: "探针" },
      { siteId: "study", appId: "review-outline", nonce: "n1" },
    );
    assert.ok(instance, runtime);
    assert.equal(instance.url, undefined, `${runtime} 实例不该带 url`);
    assert.equal(instance.meta.plugin_id, "probe-plugin");
    assert.equal(instance.meta.plugin_runtime, runtime);
    assert.equal(instance.meta.draft, undefined, "插件实例不是空白草稿");
    assert.equal(instance.meta.blank, undefined, "插件实例不是空白草稿");
    const capability = editorCapabilityFor(instance);
    assert.equal(capability.available, true, `${runtime}: ${capability.unavailableReason}`);
    assert.equal(capability.adapter, expected.adapter, runtime);
    assert.equal(capability.route.type, expected.route, runtime);
    // 插件不可下载：带了地址的「插件实例」身份不可信，不许挂。
    const withUrl = editorCapabilityFor({
      ...instance,
      url: "https://asset.oceanleo.com/whatever.json",
    });
    assert.equal(withUrl.available, false, runtime);
  }
  // 认不出内核 = 不可用，而不是找一个回退编辑器。
  const unknownRuntime = editorCapabilityFor({
    key: "k",
    source: "creation",
    id: "i",
    title: "未知内核",
    kind: "file",
    siteId: "study",
    favorite: false,
    meta: { plugin_id: "probe-plugin", plugin_runtime: "video-timeline" },
  });
  assert.equal(unknownRuntime.available, false);
  assert.equal(unknownRuntime.adapter, "none");
});

test("初始态注册表 fail-closed：查不到就返回空，不给通用模板", () => {
  for (const unknown of [
    "not-registered-at-all",
    "probe-plugin",
    "",
    null,
    undefined,
    "Not A Plugin Id",
    "a".repeat(80),
  ]) {
    assert.equal(pluginInitialStateAvailable(unknown), false, String(unknown));
    assert.equal(pluginInstanceLibraryItem(unknown, {}), null, String(unknown));
  }
  // 初始态自己不合法（内核不认、没有标题）也一样退空。
  assert.equal(
    pluginInstanceFromInitialState("probe-plugin", {
      runtime: "spreadsheet",
      title: "内核不认",
    }),
    null,
  );
  assert.equal(
    pluginInstanceFromInitialState("probe-plugin", {
      runtime: "grid",
      title: "   ",
    }),
    null,
  );
});

test("地图起手件的字节能被 oceanleo.geo-map.v1 真解析器读进去", () => {
  const item = draftFor("geo_map_editing");
  const project = parseGeoMapSource(item.content);
  assert.equal(project.schema, "oceanleo.geo-map.v1");
  // 空手起手不等于「空工程」：地图 schema 要求至少 3 个图层、1 个源、1 条署名。
  assert.ok(project.layers.length >= 3);
  assert.ok(Object.keys(project.sources).length >= 1);
  assert.ok(project.attribution.entries.length >= 1);
  // 声明的依赖与源引用必须自洽，否则编辑器一开就落进 degraded、存不回去。
  const declared = new Set((project.dependencies ?? []).map((entry) => entry.path));
  for (const source of Object.values(project.sources)) {
    assert.ok(
      declared.has(source.dependencyPath),
      `源 ${source.dependencyPath} 没有对应的 dependencies 声明`,
    );
  }
});

test("可算文档起手件能解析，且计算图真的算得出结果", () => {
  const item = draftFor("interactive_doc_editing");
  const project = parseInteractiveDocSource(item.content);
  assert.equal(project.schema, "oceanleo.interactive-doc.v1");
  const compute = evaluateComputeGraph(project, {
    input_a: 100,
    input_b: 20,
    rate: 10,
  });
  assert.equal(compute.ok, true);
  assert.deepEqual(compute.values, { total: 120, scaled: 12 });
});

test("图表起手件的 option 源取得到、解析得动", () => {
  const item = draftFor("chart_editing");
  const source = resolveChartSource(item);
  assert.equal(source.kind, "inline");
  assert.equal(source.parseAs, "canonical");
  const document = chartDocumentFromJson(item.content);
  assert.equal(document.schema, "oceanleo.chart.v1");
  assert.equal(document.option.series[0].id, "series-1");
});

test("表格起手件不带字节，由 grid 载入器自己开一张空表", async () => {
  const item = draftFor("spreadsheet_editing");
  assert.equal(item.content, undefined);
  const sheets = await loadGridSheets(item);
  assert.equal(sheets.length, 1);
  assert.ok(Array.isArray(sheets[0].rows));
});

test("PDF 起手件满足 usePdfWorkbench 自建空白页的三个条件", () => {
  const item = draftFor("pdf_editing");
  // `allowBlankSource = item.source === "creation" && 非 durable && 无 editor_project_schema`
  assert.equal(item.source, "creation");
  assert.equal(item.artifactId, undefined);
  assert.equal(item.meta.editor_project_schema, undefined);
  assert.equal(item.content, undefined);
});

test("起手件名单 fail-closed：office 是哨兵、vector 是死代码，都进不来", () => {
  for (const rejected of [
    "office",
    "office_editing",
    "vector_editing",
    "video_editing",
    "website_finetuning",
    "design_canvas",
    "game_editing",
    "",
    null,
    undefined,
  ]) {
    assert.equal(isBlankDraftFeatureId(rejected), false, String(rejected));
    assert.equal(blankDraftLibraryItem(rejected, {}), null, String(rejected));
  }
});

test("派发协议 fail-closed：版本、身份、非对象一律拒，旧 featureId 载荷也拒", () => {
  assert.equal(ADVANCED_FEATURE_LAUNCH_EVENT, "oceanleo:advanced-feature-launch");
  assert.equal(normalizeAdvancedFeatureLaunch(null), null);
  assert.equal(normalizeAdvancedFeatureLaunch([{ version: 1 }]), null);
  assert.equal(normalizeAdvancedFeatureLaunch("ledger-register"), null);
  assert.equal(
    normalizeAdvancedFeatureLaunch({ version: 2, pluginId: "ledger-register" }),
    null,
  );
  // 旧载荷只带 featureId（5 个通用模板之一）：整条协议不再认它。
  assert.equal(
    normalizeAdvancedFeatureLaunch({ version: 1, featureId: "pdf_editing" }),
    null,
  );
  assert.equal(
    normalizeAdvancedFeatureLaunch({ version: 1, pluginId: "Ledger Register" }),
    null,
  );
  assert.deepEqual(
    normalizeAdvancedFeatureLaunch({ version: 1, pluginId: "ledger-register" }),
    { version: 1, pluginId: "ledger-register" },
  );
  assert.deepEqual(
    normalizeAdvancedFeatureLaunch({
      version: 1,
      pluginId: "interactive-globe",
      title: "  地球仪  ",
    }),
    { version: 1, pluginId: "interactive-globe", title: "地球仪" },
  );
  // 入口侧换信封：没有身份就换不出，`artifactType` 不再是身份来源。
  assert.equal(advancedFeatureLaunchForCapability(null, "n"), null);
  assert.equal(advancedFeatureLaunchForCapability({ label: "地图" }, "n"), null);
  assert.equal(
    advancedFeatureLaunchForCapability({ artifactType: "geo_map" }, "n"),
    null,
  );
  assert.deepEqual(
    advancedFeatureLaunchForCapability(
      { pluginId: "annotatable-city-map", label: "地图" },
      "cap:1",
    ),
    {
      nonce: "cap:1",
      launch: { version: 1, pluginId: "annotatable-city-map", title: "地图" },
    },
  );
});

test("空白草稿这条约定不外溢：带了 URL 或不是这五类，一律走老判定", () => {
  const base = {
    key: "k",
    source: "creation",
    id: "i",
    title: "t",
    siteId: "study",
    favorite: false,
  };
  // 带 URL = 不是空手起手件。这一件是一张普通 PNG，仍然进图片编辑器。
  assert.equal(
    editorCapabilityFor({
      ...base,
      kind: "image",
      url: "https://asset.oceanleo.com/a.png",
      meta: { draft: true, blank: true, content_type: "pdf" },
    }).adapter,
    "image",
  );
  // 不在五类之内：草稿标记不授予任何编辑能力。
  const unknown = editorCapabilityFor({
    ...base,
    kind: "file",
    meta: { draft: true, blank: true },
  });
  assert.equal(unknown.available, false);
  assert.equal(unknown.adapter, "none");
  // 网站与画布的空白草稿仍然走它们自己那两条既有分支。
  assert.equal(
    editorCapabilityFor({ ...base, kind: "website", meta: { draft: true } }).adapter,
    "website",
  );
  assert.equal(
    editorCapabilityFor({ ...base, kind: "canvas", meta: { blank: true } }).adapter,
    "design-canvas",
  );
});

test("H1-f：右栏仍然是那 5 个槽位，按键打开没有新增槽", () => {
  assert.deepEqual([...FIXED_WORKSPACE_SLOTS], [
    "template",
    "preview",
    "materials",
    "mine",
    "browser",
  ]);
});
