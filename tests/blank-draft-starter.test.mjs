// ============================================================================
// H 波 W3 —— 空手启动（判据 H1-c）
// ----------------------------------------------------------------------------
// 这一条最容易被糊弄成「组件挂载条件写对了」。所以本文件一行 mock 都没有：
// 每一类都走**产品自己的**函数——
//   blankDraftLibraryItem（右栏造起手件用的那一个）
//     → editorCapabilityFor（路由判定，唯一事实源）
//     → advancedFeatureForItem（回指到 15 个功能里的哪一个）
//     → 各载体**真正的解析器**（起手件字节能不能真被编辑器读进去）
// 只断言「函数被调用过」是不算数的，所以每一步都断言解析出来的**具体值**。
// ============================================================================

import assert from "node:assert/strict";
import test from "node:test";

import {
  BLANK_DRAFT_FEATURE_IDS,
  blankDraftLibraryItem,
  isBlankDraftFeatureId,
} from "../src/shell/blank-draft-items.ts";
import {
  ADVANCED_FEATURE_LAUNCH_EVENT,
  normalizeAdvancedFeatureLaunch,
} from "../src/shell/advanced-feature-launch.ts";
import { editorCapabilityFor } from "../src/shell/workbench-routes.ts";
import { advancedFeatureForItem } from "../src/shell/advanced-features.ts";
import { FIXED_WORKSPACE_SLOTS } from "../src/shell/workspace-actions.ts";
import { parseGeoMapSource } from "../src/shell/geo-map-editor/geo-map-source.ts";
import {
  evaluateComputeGraph,
  parseInteractiveDocSource,
} from "../src/shell/interactive-doc-editor/interactive-doc-source.ts";
import { resolveChartSource } from "../src/shell/chart-editor/chart-source.ts";
import { chartDocumentFromJson } from "../src/shell/chart-editor/chart-schema.ts";
import { loadGridSheets } from "../src/shell/doc-editors/grid-model.ts";

const EXPECTED = {
  interactive_doc_editing: { adapter: "interactive-doc", route: "interactive-doc" },
  geo_map_editing: { adapter: "geo-map", route: "geo-map" },
  spreadsheet_editing: { adapter: "grid", route: "grid" },
  chart_editing: { adapter: "chart-editor@1", route: "grid" },
  pdf_editing: { adapter: "pdf", route: "pdf" },
};

function draftFor(featureId) {
  const item = blankDraftLibraryItem(featureId, {
    siteId: "study",
    appId: "note-outline",
    nonce: "test-1",
  });
  assert.ok(item, `${featureId} 没有造出起手件`);
  return item;
}

test("H1-c：五类功能空手起手，都真的解析出了适配器与路由", () => {
  assert.deepEqual([...BLANK_DRAFT_FEATURE_IDS].sort(), Object.keys(EXPECTED).sort());
  for (const featureId of BLANK_DRAFT_FEATURE_IDS) {
    const item = draftFor(featureId);
    // 起手件必须**真的空手**：没有任何 URL，也不是 durable artifact。
    assert.equal(item.url, undefined, `${featureId} 起手件不该带 url`);
    assert.equal(item.previewUrl, undefined, `${featureId} 起手件不该带 previewUrl`);
    assert.equal(item.artifactId, undefined);
    assert.equal(item.meta.draft, true);
    assert.equal(item.meta.blank, true);

    const capability = editorCapabilityFor(item);
    assert.equal(
      capability.available,
      true,
      `${featureId} 判不了 available：${capability.unavailableReason}`,
    );
    assert.equal(capability.adapter, EXPECTED[featureId].adapter);
    assert.equal(capability.route.type, EXPECTED[featureId].route);

    // 回指：这条路由确实落回 15 个功能里被点的那一个，不是随手找的回退编辑器。
    const feature = advancedFeatureForItem(item);
    assert.ok(feature, `${featureId} 没有回指到任何功能`);
    assert.equal(feature.id, featureId);
  }
});

test("图表起手件走 chart-editor@1 而不是 grid 宿主", () => {
  const capability = editorCapabilityFor(draftFor("chart_editing"));
  assert.equal(capability.route.adapter, "chart-editor@1");
  assert.equal(capability.manifest?.id, "chart-editor");
  assert.deepEqual(capability.manifest?.capabilities, [
    "load",
    "mutate",
    "save",
    "reopen",
  ]);
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

test("派发协议 fail-closed：版本、功能名、非对象一律拒", () => {
  assert.equal(ADVANCED_FEATURE_LAUNCH_EVENT, "oceanleo:advanced-feature-launch");
  assert.equal(normalizeAdvancedFeatureLaunch(null), null);
  assert.equal(normalizeAdvancedFeatureLaunch([{ version: 1 }]), null);
  assert.equal(normalizeAdvancedFeatureLaunch("pdf_editing"), null);
  assert.equal(
    normalizeAdvancedFeatureLaunch({ version: 2, featureId: "pdf_editing" }),
    null,
  );
  assert.equal(
    normalizeAdvancedFeatureLaunch({ version: 1, featureId: "office" }),
    null,
  );
  assert.deepEqual(
    normalizeAdvancedFeatureLaunch({ version: 1, featureId: "pdf_editing" }),
    { version: 1, featureId: "pdf_editing" },
  );
  assert.deepEqual(
    normalizeAdvancedFeatureLaunch({
      version: 1,
      featureId: "geo_map_editing",
      title: "  地球仪  ",
    }),
    { version: 1, featureId: "geo_map_editing", title: "地球仪" },
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

test("H1-f：右栏仍然是那 5 个槽位，空手启动没有新增槽", () => {
  assert.deepEqual([...FIXED_WORKSPACE_SLOTS], [
    "template",
    "preview",
    "materials",
    "mine",
    "browser",
  ]);
});
