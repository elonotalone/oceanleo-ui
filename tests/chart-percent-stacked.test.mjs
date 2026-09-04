/**
 * W28 / V9-red-5 / A-94：AVA 荐「百分比堆叠」必须真画占比，
 * 不许静默改成普通堆叠还报已按推荐画。
 *
 * 锁的是用户看见的图：轴 0–100%，**每一段与原值成比例**。
 * 「各段加起来等于 100」不够——实现里的 drift 修正专职维持那个等式
 * （A-97）。不锁映射表长什么样。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CHART_PERCENT_STACK_NEGATIVE_REASON,
  applyAvaAdviceToChartDocument,
  applyAvaMappingToChartDocument,
  mapAvaChartType,
} from "../src/shell/chart-editor/chart-next-ava-advisor.ts";
import { normalizeChartDocument } from "../src/shell/chart-editor/chart-schema.ts";

const PERCENT_IDS = [
  "percent_stacked_area_chart",
  "percent_stacked_column_chart",
  "percent_stacked_bar_chart",
];

const STACKED_IDS = [
  "stacked_area_chart",
  "stacked_column_chart",
  "stacked_bar_chart",
];

const SERIES_IDS = ["income", "cost", "profit", "tax"];
const SERIES_NAMES = ["收入", "成本", "利润", "税"];

function sampleDocument(seriesData) {
  return normalizeChartDocument({
    schema: "oceanleo.chart.v1",
    option: {
      title: { text: "区域构成" },
      xAxis: { type: "category", data: ["华东", "华南", "华北"] },
      yAxis: { type: "value" },
      series: seriesData.map((data, index) => ({
        id: SERIES_IDS[index] || `series-${index + 1}`,
        name: SERIES_NAMES[index] || `系列 ${index + 1}`,
        type: "bar",
        data,
        label: { show: false },
      })),
    },
  });
}

function valueAxis(document) {
  const axis = document.option.yAxis;
  return Array.isArray(axis) ? axis[0] : axis;
}

function scalar(datum) {
  if (typeof datum === "number") return datum;
  if (Array.isArray(datum)) return Number(datum[datum.length - 1]) || 0;
  if (datum && typeof datum === "object") return Number(datum.value) || 0;
  return 0;
}

function categorySum(document, index) {
  return document.option.series.reduce(
    (sum, series) => sum + scalar(series.data[index]),
    0,
  );
}

function originalAt(original, seriesIndex, categoryIndex) {
  const datum = original.option.series[seriesIndex]?.data[categoryIndex];
  return datum === undefined ? 0 : scalar(datum);
}

function actualAt(document, seriesIndex, categoryIndex) {
  return scalar(document.option.series[seriesIndex].data[categoryIndex]);
}

/** 独立算出应占多少，不走产品的 drift。drift 只能吃掉浮点碎屑。 */
function rawPercent(value, total) {
  return total === 0 ? 0 : (value / total) * 100;
}

function assertPercentStackedDrawn(applied, original, label) {
  assert.equal(
    applied.ok,
    true,
    `${label}：荐了百分比堆叠却没画成。用户会看到图被改了，或什么都没发生。`,
  );
  if (!applied.ok) return;
  const axis = valueAxis(applied.document);
  assert.equal(axis.min, 0, `${label}：轴下限不是 0，看起来不像占比轴。`);
  assert.equal(
    axis.max,
    100,
    `${label}：轴上限不是 100%。用户问的是「各段占多少」，轴却还按绝对量来。`,
  );
  assert.equal(
    axis.axisLabel.formatter,
    "{value}%",
    `${label}：轴刻度没有 %。用户没法看出这是占比。`,
  );
  const seriesCount = original.option.series.length;
  const width = Math.max(
    ...applied.document.option.series.map((series) => series.data.length),
    ...original.option.series.map((series) => series.data.length),
  );
  for (let index = 0; index < width; index += 1) {
    const originals = Array.from({ length: seriesCount }, (_, seriesIndex) =>
      originalAt(original, seriesIndex, index),
    );
    const actuals = Array.from({ length: seriesCount }, (_, seriesIndex) =>
      actualAt(applied.document, seriesIndex, index),
    );
    const before = originals.reduce((sum, value) => sum + value, 0);
    const after = actuals.reduce((sum, value) => sum + value, 0);
    if (before === 0) {
      for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex += 1) {
        const name = original.option.series[seriesIndex].name;
        assert.equal(
          actuals[seriesIndex],
          0,
          `${label}：第 ${index + 1} 类「${name}」原来是 0，必须仍是 0%，不能靠合计为 0 混过去。`,
        );
      }
      continue;
    }
    assert.ok(
      Math.abs(after - 100) < 1e-6,
      `${label}：第 ${index + 1} 类各段加起来是 ${after}，不是 100%。画的是绝对量堆叠，回答了用户没问的问题。`,
    );
    const raw = originals.map((value) => rawPercent(value, before));
    for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex += 1) {
      const name = original.option.series[seriesIndex].name;
      const expected = raw[seriesIndex];
      const actual = actuals[seriesIndex];
      assert.ok(
        Math.abs(actual - expected) < 1e-6,
        `${label}：第 ${index + 1} 类「${name}」应占 ${expected.toFixed(2)}%，实际 ${actual}%。占比算错了，用户会以为成本吃掉了全部。`,
      );
    }
    const last = seriesCount - 1;
    const driftApplied = actuals[last] - raw[last];
    assert.ok(
      Math.abs(driftApplied) < 1e-6,
      `${label}：drift 修正把 ${driftApplied} 个百分点补给了最后一段「${original.option.series[last].name}」。超过浮点误差，说明占比根本没算对，却硬凑成了 100。用户会以为最后一项吃掉了全部。`,
    );
  }
}

test("percent_stacked ids are not the same mapping as ordinary stacked ids", () => {
  for (let index = 0; index < PERCENT_IDS.length; index += 1) {
    const percent = mapAvaChartType(PERCENT_IDS[index]);
    const stacked = mapAvaChartType(STACKED_IDS[index]);
    assert.ok(percent, `${PERCENT_IDS[index]} 必须仍在表内，不能当未列出 id 丢掉。`);
    assert.ok(stacked);
    assert.notDeepEqual(
      percent,
      stacked,
      `${PERCENT_IDS[index]} 映到的对象不能和 ${STACKED_IDS[index]} 逐字相同——那就是把百分比静默丢掉。`,
    );
  }
});

test("applying each percent_stacked mapping draws 0–100% shares, not absolute stacks", () => {
  const original = sampleDocument([
    [100, 120, 140],
    [40, 45, 50],
  ]);
  for (const avaType of PERCENT_IDS) {
    const mapping = mapAvaChartType(avaType);
    assert.ok(mapping);
    const applied = applyAvaMappingToChartDocument(original, mapping);
    assertPercentStackedDrawn(applied, original, avaType);
    if (!applied.ok) continue;
    if (avaType === "percent_stacked_area_chart") {
      assert.equal(applied.document.option.series[0].type, "line");
      assert.ok(applied.document.option.series[0].areaStyle);
    } else {
      assert.equal(applied.document.option.series[0].type, "bar");
    }
    assert.equal(applied.document.option.series[0].stack, "total");
  }
});

test("ordinary stacked mapping still answers totals, not shares", () => {
  const original = sampleDocument([
    [100, 120, 140],
    [40, 45, 50],
  ]);
  const mapping = mapAvaChartType("stacked_column_chart");
  assert.ok(mapping);
  const applied = applyAvaMappingToChartDocument(original, mapping);
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(categorySum(applied.document, 0), 140);
  const axis = valueAxis(applied.document);
  assert.notEqual(axis.max, 100);
  assert.notEqual(axis.axisLabel.formatter, "{value}%");
});

test("zero-sum category stays 0%; other categories still sum to 100%", () => {
  const original = sampleDocument([
    [100, 0, 140],
    [40, 0, 50],
  ]);
  const mapping = mapAvaChartType("percent_stacked_column_chart");
  assert.ok(mapping);
  const applied = applyAvaMappingToChartDocument(original, mapping);
  assertPercentStackedDrawn(applied, original, "zero-sum");
});

test("missing values (shorter series / empty cells already 0) take 0% and the rest share 100%", () => {
  const original = sampleDocument([
    [10, 10, 10],
    [10],
  ]);
  const mapping = mapAvaChartType("percent_stacked_bar_chart");
  assert.ok(mapping);
  const applied = applyAvaMappingToChartDocument(original, mapping);
  assertPercentStackedDrawn(applied, original, "missing");
  if (!applied.ok) return;
  assert.equal(scalar(applied.document.option.series[1].data[1]), 0);
  assert.equal(scalar(applied.document.option.series[0].data[1]), 100);
});

test("two equal series each take half, not 0.5% versus 99.5%", () => {
  const original = sampleDocument([
    [100, 120, 140],
    [100, 120, 140],
  ]);
  const mapping = mapAvaChartType("percent_stacked_column_chart");
  assert.ok(mapping);
  const applied = applyAvaMappingToChartDocument(original, mapping);
  assertPercentStackedDrawn(applied, original, "equal-split");
  if (!applied.ok) return;
  const income = scalar(applied.document.option.series[0].data[0]);
  const cost = scalar(applied.document.option.series[1].data[0]);
  assert.ok(
    Math.abs(income - 50) < 1e-6 && Math.abs(cost - 50) < 1e-6,
    `同样大的两项必须各占一半，不能一项 ${income}% 另一项 ${cost}%。占比算错了，用户会以为成本吃掉了全部。`,
  );
});

test("three series in one category split 100:120:140 into about 27.78/33.33/38.89", () => {
  const original = sampleDocument([[100], [120], [140]]);
  const mapping = mapAvaChartType("percent_stacked_column_chart");
  assert.ok(mapping);
  const applied = applyAvaMappingToChartDocument(original, mapping);
  assertPercentStackedDrawn(applied, original, "three-way");
  if (!applied.ok) return;
  const shares = applied.document.option.series.map((series) =>
    scalar(series.data[0]),
  );
  const expected = [100 / 3.6, 120 / 3.6, 140 / 3.6];
  for (let index = 0; index < 3; index += 1) {
    assert.ok(
      Math.abs(shares[index] - expected[index]) < 1e-6,
      `「${original.option.series[index].name}」应约占 ${expected[index].toFixed(2)}%，实际 ${shares[index]}%。占比算错了，用户会以为成本吃掉了全部。`,
    );
  }
});

test("a segment three times the other must draw 75/25, not a stuffed 100", () => {
  const original = sampleDocument([[300], [100]]);
  const mapping = mapAvaChartType("percent_stacked_area_chart");
  assert.ok(mapping);
  const applied = applyAvaMappingToChartDocument(original, mapping);
  assertPercentStackedDrawn(applied, original, "triple");
  if (!applied.ok) return;
  const income = scalar(applied.document.option.series[0].data[0]);
  const cost = scalar(applied.document.option.series[1].data[0]);
  assert.ok(
    Math.abs(income - 75) < 1e-6 && Math.abs(cost - 25) < 1e-6,
    `三倍大的那一项应占 75%、另一项 25%，实际 ${income}% / ${cost}%。占比算错了，用户会以为成本吃掉了全部。`,
  );
});

test("negatives refuse with a human sentence and do not change the chart", () => {
  const original = sampleDocument([
    [100, -20, 140],
    [40, 45, 50],
  ]);
  const before = JSON.stringify(original);
  const mapping = mapAvaChartType("percent_stacked_column_chart");
  assert.ok(mapping);
  const applied = applyAvaMappingToChartDocument(original, mapping);
  assert.equal(applied.ok, false);
  if (applied.ok) return;
  assert.equal(applied.reason, CHART_PERCENT_STACK_NEGATIVE_REASON);
  assert.notEqual(applied.reason, "");
  assert.doesNotMatch(applied.reason, /^[A-Z][A-Z0-9_]+$/);
  assert.match(applied.reason, /占比/);
  assert.match(applied.reason, /没有替你改图/);
  assert.equal(JSON.stringify(original), before);
});

test("failed AVA advice is passed through; the chart is not rewritten as a bar stack", () => {
  const original = sampleDocument([[1], [2]]);
  const before = JSON.stringify(original);
  const applied = applyAvaAdviceToChartDocument(original, {
    ok: false,
    reason: "没有可分析的数据行，AVA 没法推荐图型。",
  });
  assert.equal(applied.ok, false);
  if (applied.ok) return;
  assert.match(applied.reason, /没有可分析的数据行/);
  assert.equal(JSON.stringify(original), before);
});

test("recommend-chart path in ChartNextStage applies the mapping, it does not only patch type/stack", () => {
  const leaf = readFileSync(
    new URL("../src/shell/chart-editor/ChartNextStage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(leaf, /applyAvaAdviceToChartDocument/);
  assert.match(leaf, /editor\.loadDocument\(applied\.document\)/);
  assert.doesNotMatch(leaf, /advised\.best\.mapping\.type/);
});
