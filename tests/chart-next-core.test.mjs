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

/** 直接读成品 option（导出成品 / 代码模式 parse 结果），按系列名取 data，不走 decode 往返。 */
function seriesDataFromFinishedOption(option, seriesName) {
  const item = option.series.find((entry) => entry.name === seriesName);
  assert.ok(item, `成品 option 里必须有名为「${seriesName}」的系列`);
  return item.data;
}

test("typed artifact is option + data, and HTML wrap is embeddable", () => {
  const { artifact, document, ingest } = chartTypedArtifactFromRangeSnapshot(RANGE);
  assert.equal(artifact.schema, CHART_TYPED_ARTIFACT_SCHEMA);
  assert.ok(artifact.option.series.length >= 1);
  assert.ok(artifact.data.source.length >= 2);
  assert.equal(ingest.recommendation.type, "bar");

  const revenueInArtifact = seriesDataFromFinishedOption(artifact.option, "收入");
  const costInArtifact = seriesDataFromFinishedOption(artifact.option, "成本");
  assert.deepEqual(
    revenueInArtifact,
    [100, 120, 140],
    "导出 HTML 成品里「收入」三根柱必须是 100/120/140；若挂成 40/45/50，就是收入柱子画成了成本的高度",
  );
  assert.deepEqual(costInArtifact, [40, 45, 50]);

  const roundtrip = chartDocumentFromTypedArtifact(artifact);
  assert.equal(roundtrip.option.series[0].type, document.option.series[0].type);

  const html = wrapChartArtifactHtml(artifact, "<svg></svg>");
  assert.match(html, /data-oceanleo-chart="oceanleo.chart.artifact.v1"/);
  assert.match(html, /application\/json/);
  const embeddedJson = html.match(
    /<script type="application\/json">([\s\S]*?)<\/script>/,
  );
  assert.ok(embeddedJson, "HTML 成品必须内嵌 typed artifact JSON");
  const embedded = JSON.parse(embeddedJson[1]);
  const revenueInHtml = seriesDataFromFinishedOption(embedded.option, "收入");
  const costInHtml = seriesDataFromFinishedOption(embedded.option, "成本");
  assert.deepEqual(
    revenueInHtml,
    [100, 120, 140],
    "HTML 内嵌 JSON 里「收入」柱子不能画成成本的高度（应为 100/120/140）",
  );
  assert.deepEqual(costInHtml, [40, 45, 50]);

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
  // 夹具按 A-103：两个系列、六个值互不相等，系列间对调 / 倒序 / 平移都看得见。
  const seed = normalizeChartDocument({
    schema: "oceanleo.chart.v1",
    option: {
      title: { text: "代码模式" },
      xAxis: { type: "category", data: ["A", "B", "C"] },
      yAxis: { type: "value" },
      series: [
        { id: "s1", name: "收入", type: "bar", data: [3, 7, 11], label: { show: false } },
        { id: "s2", name: "成本", type: "bar", data: [2, 5, 9], label: { show: false } },
      ],
    },
  });
  const json = chartOptionJsonFromDocument(seed);
  // 用户在代码模式看到的 JSON 文本里，柱子就是这六个数（字面量，不引用 seed）。
  const shown = JSON.parse(json);
  assert.deepEqual(seriesDataFromFinishedOption(shown, "收入"), [3, 7, 11]);
  assert.deepEqual(seriesDataFromFinishedOption(shown, "成本"), [2, 5, 9]);

  const good = parseChartOptionJson(json, seed);
  assert.equal(good.ok, true);
  assert.ok(good.ok);
  // parse 成功还不够：Apply 后画布拿到的 series data 必须逐项等于用户写进 JSON 的那根数。
  assert.equal(good.document.option.series.length, 2, "代码模式 Apply 后系列不能多也不能少");
  assert.deepEqual(
    seriesDataFromFinishedOption(good.document.option, "收入"),
    [3, 7, 11],
    "代码模式 Apply 后「收入」柱子高度不是用户写的那根数（JSON 里写的是 3/7/11）",
  );
  assert.deepEqual(
    seriesDataFromFinishedOption(good.document.option, "成本"),
    [2, 5, 9],
    "代码模式 Apply 后「成本」柱子高度不是用户写的那根数（JSON 里写的是 2/5/9）",
  );
  // 返回的 option 与 document.option 是同一份成品，不许一边对一边错。
  assert.deepEqual(seriesDataFromFinishedOption(good.option, "收入"), [3, 7, 11]);
  assert.deepEqual(seriesDataFromFinishedOption(good.option, "成本"), [2, 5, 9]);

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
