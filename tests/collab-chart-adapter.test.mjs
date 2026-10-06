// W13：图表多人同改适配器。两个真 Y.Doc 互相应用更新（实体布局同契约 §8.4）。
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { readJsonStateRoot, writeJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import { normalizeChartDocument } from "../src/shell/chart-editor/chart-schema.ts";
import {
  CHART_BLOCKS,
  CHART_COLLAB_ROOT as ROOT,
  chartFromEntities,
  chartFromY,
  chartRebase,
  chartSeriesKey,
  chartToEntities,
} from "../src/shell/collab/adapters/chart.ts";

// ---- 用 W11 的真实现写读实体根（collab/bind-json-state.ts）：只写变化的字段、被删的字段/实体随之删除
function writeState(doc, state, _last) {
  writeJsonStateRoot(doc, ROOT, state);
}

function sync(a, b) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

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
        { id: "s-c", name: "华北", type: "bar", data: [7, 8, 9] },
      ],
    },
  });
}

function pair() {
  const chart = makeChart();
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeState(a, chartToEntities(chart), null);
  sync(a, b);
  return { chart, a, b };
}

const seriesById = (doc, id) => doc.option.series.find((s) => s.id === id);

test("往返无损：fromEntities(toEntities(x)) 与 x 等价", () => {
  const chart = makeChart();
  assert.equal(canon(chartFromEntities(chartToEntities(chart), null)), canon(chart));
});

test("双 y 轴文档（数组形态）与数据集也往返无损", () => {
  const chart = makeChart();
  chart.option.yAxis = [chart.option.yAxis, { ...chart.option.yAxis, name: "右轴" }];
  chart.dataset = { dimensions: [{ name: "季度", type: "ordinal" }, { name: "华东", type: "number" }], source: [["Q1", 10], ["Q2", 20]] };
  const state = chartToEntities(chart);
  assert.equal(state.entities[CHART_BLOCKS.yAxis].shape, "array");
  assert.ok(state.entities[CHART_BLOCKS.dataset]);
  assert.equal(canon(chartFromEntities(state, null)), canon(chart));
});

test("两人同时改不同系列和标题：互不影响", () => {
  const { chart, a, b } = pair();
  const base = chartToEntities(chart);
  const sa = clone(chart);
  seriesById(sa, "s-a").data = [11, 21, 31];
  sa.option.title.text = "新标题";
  const sb = clone(chart);
  seriesById(sb, "s-b").name = "华南区";
  seriesById(sb, "s-b").color = "#ff0000";
  writeState(a, chartToEntities(sa), base);
  writeState(b, chartToEntities(sb), base);
  sync(a, b);
  for (const doc of [a, b]) {
    const merged = chartFromY(doc);
    assert.deepEqual(seriesById(merged, "s-a").data, [11, 21, 31]);
    assert.equal(seriesById(merged, "s-b").name, "华南区");
    assert.equal(seriesById(merged, "s-b").color, "#ff0000");
    assert.equal(merged.option.title.text, "新标题");
    assert.deepEqual(seriesById(merged, "s-c").data, [7, 8, 9]);
  }
  assert.equal(canon(chartFromY(a)), canon(chartFromY(b)));
});

test("同一系列不同属性并发修改都保留；同属性后写者胜且两端一致", () => {
  const { chart, a, b } = pair();
  const base = chartToEntities(chart);
  const sa = clone(chart);
  const sb = clone(chart);
  Object.assign(seriesById(sa, "s-a"), { color: "#112233", name: "A 命名" });
  Object.assign(seriesById(sb, "s-a"), { stack: "total", name: "B 命名" });
  writeState(a, chartToEntities(sa), base);
  writeState(b, chartToEntities(sb), base);
  sync(a, b);
  const merged = seriesById(chartFromY(a), "s-a");
  assert.equal(merged.color, "#112233");
  assert.equal(merged.stack, "total");
  assert.ok(["A 命名", "B 命名"].includes(merged.name));
  assert.equal(canon(chartFromY(a)), canon(chartFromY(b)));
});

test("清掉系列的可选属性也会同步", () => {
  const { chart, a, b } = pair();
  const withColor = clone(chart);
  seriesById(withColor, "s-a").color = "#abcdef";
  const base = chartToEntities(chart);
  writeState(a, chartToEntities(withColor), base);
  sync(a, b);
  assert.equal(seriesById(chartFromY(b), "s-a").color, "#abcdef");
  writeState(a, chartToEntities(chart), chartToEntities(withColor));
  sync(a, b);
  assert.equal("color" in seriesById(chartFromY(b), "s-a"), false);
});

test("新增 / 删除 / 重排系列收敛，两端一致；坐标轴与图例各自合并", () => {
  const { chart, a, b } = pair();
  const base = chartToEntities(chart);
  const sa = clone(chart);
  sa.option.series.push({ id: "s-d", name: "西部", type: "line", data: [1, 2, 3], label: { show: false } });
  sa.option.legend.show = false;
  const sb = clone(chart);
  sb.option.series = sb.option.series.filter((s) => s.id !== "s-c").reverse();
  sb.option.xAxis.name = "季度";
  writeState(a, chartToEntities(sa), base);
  writeState(b, chartToEntities(sb), base);
  sync(a, b);
  const merged = chartFromY(a);
  assert.equal(canon(merged), canon(chartFromY(b)));
  const ids = merged.option.series.map((s) => s.id);
  assert.ok(ids.includes("s-d"));
  assert.ok(!ids.includes("s-c"));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(merged.option.legend.show, false);
  assert.equal(merged.option.xAxis.name, "季度");
});

test("选择键：系列 id → 实体 key", () => {
  assert.equal(chartSeriesKey("s-a"), "series:s-a");
  assert.ok(chartToEntities(makeChart()).order.includes("series:s-a"));
});

test("chartRebase：别人的改动套进旧快照，本地撤销不撤掉别人的；系列顺序/新增/删除跟着变", () => {
  const base = makeChart();
  const remote = clone(base);
  remote.option.title.text = "别人改的标题";
  seriesById(remote, "s-b").name = "华南（改）";
  remote.option.series = remote.option.series.filter((s) => s.id !== "s-c");
  remote.option.series.push({ id: "s-new", name: "新系列", type: "line", data: [1, 2, 3] });
  const old = clone(base);
  seriesById(old, "s-a").name = "本人旧名字"; // 撤销栈里本人当时的版本
  const rebased = chartRebase(old, base, remote);
  assert.equal(seriesById(rebased, "s-a").name, "本人旧名字");
  assert.equal(rebased.option.title.text, "别人改的标题");
  assert.equal(seriesById(rebased, "s-b").name, "华南（改）");
  assert.deepEqual(rebased.option.series.map((s) => s.id), ["s-a", "s-b", "s-new"]);
  assert.equal(chartRebase(old, base, base), old);
  const reordered = clone(base);
  reordered.option.series.reverse();
  assert.deepEqual(chartRebase(clone(base), base, reordered).option.series.map((s) => s.id), ["s-c", "s-b", "s-a"]);
});
