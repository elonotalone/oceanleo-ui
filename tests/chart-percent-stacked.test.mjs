/**
 * W28 / V9-red-5 / A-94：AVA 荐「百分比堆叠」必须真画占比，
 * 不许静默改成普通堆叠还报已按推荐画。
 *
 * 锁的是用户看见的图：轴 0–100% 且各类上各段相加为 100%。
 * 不锁映射表长什么样（把「写成 bar + stack:total」钉死会把缺陷写进契约）。
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

function sampleDocument(seriesData) {
  return normalizeChartDocument({
    schema: "oceanleo.chart.v1",
    option: {
      title: { text: "区域构成" },
      xAxis: { type: "category", data: ["华东", "华南", "华北"] },
      yAxis: { type: "value" },
      series: seriesData.map((data, index) => ({
        id: index === 0 ? "income" : "cost",
        name: index === 0 ? "收入" : "成本",
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
  const width = Math.max(
    ...applied.document.option.series.map((series) => series.data.length),
    ...original.option.series.map((series) => series.data.length),
  );
  for (let index = 0; index < width; index += 1) {
    const before = categorySum(original, index);
    const after = categorySum(applied.document, index);
    if (before === 0) {
      assert.equal(
        after,
        0,
        `${label}：第 ${index + 1} 类原来合计是 0，占比必须仍是 0，不能假装 100%。`,
      );
      continue;
    }
    assert.ok(
      Math.abs(after - 100) < 1e-6,
      `${label}：第 ${index + 1} 类各段加起来是 ${after}，不是 100%。画的是绝对量堆叠，回答了用户没问的问题。`,
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
