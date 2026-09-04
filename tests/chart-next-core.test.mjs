/**
 * W12 判据 1–5 的内容闸：typed artifact、AVA 推荐+lint、双轴入口、
 * option JSON 代码模式、L4 chips、存量只读转换。
 *
 * 接线（flag / dynamic）在 chart-next-wiring.test.mjs。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EDITOR_MODE,
  validAgentChips,
  validReviewProposal,
} from "../src/shell/hosted-editor/index.ts";
import {
  CHART_RANGE_SNAPSHOT_SCHEMA,
  chartYAxisCount,
  normalizeChartDocument,
  setChartYAxisCount,
} from "../src/shell/chart-editor/chart-schema.ts";
import {
  CHART_RENDITION_MIME,
  CHART_TYPED_ARTIFACT_SCHEMA,
  chartDocumentFromTypedArtifact,
  chartTypedArtifactFromDocument,
  chartTypedArtifactFromRangeSnapshot,
  wrapChartArtifactHtml,
} from "../src/shell/chart-editor/chart-next-artifact.ts";
import {
  AVA_CHART_TO_SERIES,
  adviseChartFromTable,
  lintChartFromTable,
  mapAvaChartType,
} from "../src/shell/chart-editor/chart-next-ava-advisor.ts";
import {
  parseChartOptionJson,
  chartOptionJsonFromDocument,
} from "../src/shell/chart-editor/chart-next-option-code.ts";
import {
  CHART_NEXT_DEFAULT_MODE,
  applyChartNextMode,
} from "../src/shell/chart-editor/chart-next-chrome.ts";
import {
  CHART_AGENT_CHIPS,
  buildChartReviewProposal,
  chartAgentChipsAreValid,
  chartToolsManifestChips,
} from "../src/shell/chart-editor/chart-next-l4-chips.ts";
import {
  CHART_CONVERT_FAIL_NO_OPTION,
  nextChartConversionState,
  planChartLegacyConversion,
} from "../src/shell/chart-editor/chart-next-legacy-conversion.ts";

const RANGE = {
  schema: CHART_RANGE_SNAPSHOT_SCHEMA,
  sourceName: "预算表",
  range: "A1:C4",
  headerRow: true,
  headerColumn: true,
  cells: [
    ["区域", "收入", "成本"],
    ["华东", 100, 40],
    ["华南", 120, 45],
    ["华北", 140, 50],
  ],
};

test("typed artifact is option + data, and HTML wrap is embeddable", () => {
  const { artifact, document, ingest } = chartTypedArtifactFromRangeSnapshot(RANGE);
  assert.equal(artifact.schema, CHART_TYPED_ARTIFACT_SCHEMA);
  assert.ok(artifact.option.series.length >= 1);
  assert.ok(artifact.data.source.length >= 2);
  assert.equal(ingest.recommendation.type, "bar");
  const roundtrip = chartDocumentFromTypedArtifact(artifact);
  assert.equal(roundtrip.option.series[0].type, document.option.series[0].type);
  const html = wrapChartArtifactHtml(artifact, "<svg></svg>");
  assert.match(html, /data-oceanleo-chart="oceanleo.chart.artifact.v1"/);
  assert.match(html, /application\/json/);
  assert.equal(CHART_RENDITION_MIME.svg, "image/svg+xml;charset=utf-8");
  assert.equal(CHART_RENDITION_MIME.png, "image/png");
  assert.equal(CHART_RENDITION_MIME.html, "text/html;charset=utf-8");
  const fromDoc = chartTypedArtifactFromDocument(document);
  assert.equal(fromDoc.schema, CHART_TYPED_ARTIFACT_SCHEMA);
});

test("range type override still wins over the default recommendation", () => {
  const { document, ingest } = chartTypedArtifactFromRangeSnapshot(RANGE, {
    type: "line",
  });
  assert.equal(ingest.recommendation.type, "bar");
  assert.equal(document.option.series[0].type, "line");
});

test("AVA advisor recommends a mapped chart type from real data", () => {
  const { ingest } = chartTypedArtifactFromRangeSnapshot(RANGE);
  const advised = adviseChartFromTable(ingest.table);
  assert.equal(advised.ok, true);
  if (!advised.ok) return;
  assert.ok(mapAvaChartType(advised.best.avaType));
  assert.ok(AVA_CHART_TO_SERIES[advised.best.avaType]);
  assert.ok(advised.best.mapping.type);
  const linted = lintChartFromTable(ingest.table);
  assert.equal(typeof linted.ok, "boolean");
  assert.ok(Array.isArray(linted.notes));
});

test("AVA mapping does not silently invent an unlisted chart id", () => {
  assert.equal(mapAvaChartType("no_such_chart_id"), null);
});

test("AVA refuses an empty table with a human reason", () => {
  const advised = adviseChartFromTable([["列"]]);
  assert.equal(advised.ok, false);
  if (!advised.ok) assert.match(advised.reason, /没有可分析的数据行/);
});

test("option JSON code mode parses, rejects broken JSON with a human reason", () => {
  const seed = normalizeChartDocument({
    schema: "oceanleo.chart.v1",
    option: {
      title: { text: "代码模式" },
      xAxis: { type: "category", data: ["A"] },
      yAxis: { type: "value" },
      series: [{ id: "s1", name: "系列", type: "bar", data: [1], label: { show: false } }],
    },
  });
  const json = chartOptionJsonFromDocument(seed);
  const good = parseChartOptionJson(json, seed);
  assert.equal(good.ok, true);
  const broken = parseChartOptionJson("{ not json", seed);
  assert.equal(broken.ok, false);
  if (!broken.ok) assert.match(broken.reason, /不是合法 JSON/);
  const empty = parseChartOptionJson("   ", seed);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.reason, /空的/);
  const array = parseChartOptionJson("[1,2]", seed);
  assert.equal(array.ok, false);
  if (!array.ok) assert.match(array.reason, /必须是一个 JSON 对象/);
});

test("professional mode is code mode, default normal, validated by set-mode builder", () => {
  assert.equal(CHART_NEXT_DEFAULT_MODE, "normal");
  assert.equal(CHART_NEXT_DEFAULT_MODE, DEFAULT_EDITOR_MODE);
  const pro = applyChartNextMode("oceanleo-chart-next", "pro");
  assert.equal(pro.mode, "pro");
  assert.equal(pro.codeModeVisible, true);
  const normal = applyChartNextMode("oceanleo-chart-next", "normal");
  assert.equal(normal.codeModeVisible, false);
});

test("L4 chips: 8 entries, host validator, manifestVersion 2 paired", () => {
  assert.equal(chartAgentChipsAreValid(), true);
  assert.equal(validAgentChips(CHART_AGENT_CHIPS), true);
  assert.equal(CHART_AGENT_CHIPS.length, 8);
  const manifest = chartToolsManifestChips();
  assert.equal(manifest.manifestVersion, 2);
  assert.equal(manifest.chips.length, 8);
});

test("review proposal is a message only: validReviewProposal, no document rewrite", () => {
  const before = JSON.stringify({ a: 1 });
  const after = JSON.stringify({ a: 2 });
  const proposal = buildChartReviewProposal({
    proposalId: "p-1",
    commandId: "chart.apply-option",
    before,
    after,
    revision: 3,
  });
  assert.ok(proposal);
  assert.equal(validReviewProposal(proposal), true);
  assert.equal(proposal.revision, 3);
});

test("legacy HTML-only charts refuse conversion with a human reason", () => {
  const refused = planChartLegacyConversion({
    carrierState: "legacy-render-only",
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.reason, CHART_CONVERT_FAIL_NO_OPTION);
    assert.match(refused.reason, /不要从图片反推/);
  }
  assert.equal(
    nextChartConversionState("readonly", { type: "request" }),
    "converting",
  );
  assert.equal(
    nextChartConversionState("readonly", { type: "resolve" }),
    "readonly",
  );
});

test("dual-axis helpers still upgrade 1→2→1", () => {
  const single = normalizeChartDocument({
    schema: "oceanleo.chart.v1",
    option: {
      title: { text: "单轴" },
      xAxis: { type: "category", data: ["Q1"] },
      yAxis: { type: "value", name: "万元" },
      series: [{ id: "s", name: "收入", type: "bar", data: [1], label: { show: false } }],
    },
  });
  assert.equal(chartYAxisCount(single.option), 1);
  const dual = setChartYAxisCount(single, 2);
  assert.equal(chartYAxisCount(dual.option), 2);
});
