// W13：图表回放画法。fromRevision 与 fromY 同内容得到等价快照；describeChange；toArtifactJson 往返；Frame 源码安全。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as Y from "yjs";
import { writeJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import { normalizeChartDocument } from "../src/shell/chart-editor/chart-schema.ts";
import {
  CHART_COLLAB_ROOT,
  chartChangedSeries,
  chartDescribeChange,
  chartFromRevision,
  chartFromY,
  chartToArtifactJson,
  chartToEntities,
} from "../src/shell/collab/adapters/chart.ts";

const canon = (value) =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => (x < y ? -1 : 1)))
      : v);
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeChart() {
  return normalizeChartDocument({
    schema: "oceanleo.chart.v1",
    version: 1,
    title: "销量",
    option: {
      title: { text: "季度销量" },
      xAxis: { type: "category", data: ["Q1", "Q2", "Q3"] },
      yAxis: { type: "value" },
      series: [
        { id: "s-a", name: "华东", type: "bar", data: [10, 20, 30] },
        { id: "s-b", name: "华南", type: "line", data: [5, 15, 25] },
      ],
    },
  });
}

function yDocOf(chart) {
  const doc = new Y.Doc();
  writeJsonStateRoot(doc, CHART_COLLAB_ROOT, chartToEntities(chart));
  return doc;
}

test("fromRevision（版本 JSON）与 fromY（协同文档）对同一内容得到等价快照", () => {
  const chart = makeChart();
  assert.equal(canon(chartFromRevision(chart, normalizeChartDocument)), canon(chartFromY(yDocOf(chart))));
  assert.equal(chartFromRevision({ schema: "bogus" }, normalizeChartDocument), null);
  assert.equal(chartFromRevision(null, normalizeChartDocument), null);
  assert.equal(chartFromY(new Y.Doc()), null);
});

test("describeChange：新增/删除系列、改数据、改名、改样式、改标题、改坐标轴、改图例、调整顺序", () => {
  const base = makeChart();
  const next = (fn) => {
    const c = clone(base);
    fn(c);
    return c;
  };
  assert.equal(chartDescribeChange(null, base), "创建了图表");
  assert.equal(chartDescribeChange(base, base), null);
  assert.equal(
    chartDescribeChange(base, next((c) => c.option.series.push({ id: "s-c", name: "华北", type: "bar", data: [1, 2, 3], label: { show: false } }))),
    "新增了系列「华北」",
  );
  assert.equal(chartDescribeChange(base, next((c) => (c.option.series = c.option.series.slice(0, 1)))), "删除了系列「华南」");
  assert.equal(chartDescribeChange(base, next((c) => (c.option.series[0].data = [11, 21, 31]))), "改了系列「华东」的数据");
  assert.equal(chartDescribeChange(base, next((c) => (c.option.series[1].name = "华南区"))), "给系列改了名「华南区」");
  assert.equal(chartDescribeChange(base, next((c) => (c.option.series[1].color = "#ff0000"))), "改了系列「华南」的样式");
  assert.equal(chartDescribeChange(base, next((c) => (c.option.title.text = "别的"))), "改了图表标题");
  assert.equal(chartDescribeChange(base, next((c) => (c.option.xAxis.name = "季度"))), "改了坐标轴");
  assert.equal(chartDescribeChange(base, next((c) => (c.option.legend.show = false))), "改了图例");
  assert.equal(chartDescribeChange(base, next((c) => (c.option.series.reverse()))), "调整了系列顺序");
});

test("变化的系列（回放高亮用）", () => {
  const base = makeChart();
  const next = clone(base);
  next.option.series[1].data = [9, 9, 9];
  next.option.series.push({ id: "s-c", name: "新", type: "bar", data: [1], label: { show: false } });
  assert.deepEqual([...chartChangedSeries(base, next)].sort(), ["s-b", "s-c"]);
  assert.deepEqual([...chartChangedSeries(null, base)].sort(), ["s-a", "s-b"]);
});

test("toArtifactJson 往返：还原成图表编辑器能打开的 JSON，再读回等价", () => {
  const chart = makeChart();
  const artifact = chartToArtifactJson(chart);
  assert.equal(canon(normalizeChartDocument(artifact)), canon(chart));
  assert.equal(canon(chartFromRevision(artifact, normalizeChartDocument)), canon(chart));
  assert.equal(chartToArtifactJson(null), null);
});

test("Frame 源码不用 iframe / dangerouslySetInnerHTML / innerHTML，且用图表现有的渲染口径", () => {
  const source = readFileSync(new URL("../src/shell/replay/work/frames/chart.tsx", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(source, /<iframe|dangerouslySetInnerHTML|innerHTML|postMessage/);
  assert.match(source, /chartExportOption/);
});
