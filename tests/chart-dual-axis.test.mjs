import assert from "node:assert/strict";
import test from "node:test";

import {
  bindChartSeriesToAxis,
  chartDocumentFromJson,
  chartDocumentToJson,
  chartYAxes,
  chartYAxisCount,
  normalizeChartDocument,
  setChartYAxisCount,
} from "../src/shell/chart-editor/chart-schema.ts";

const SINGLE_AXIS = {
  schema: "oceanleo.chart.v1",
  option: {
    title: { text: "单轴" },
    xAxis: { type: "category", data: ["Q1", "Q2"] },
    yAxis: { type: "value", name: "万元" },
    series: [
      {
        id: "revenue",
        name: "收入",
        type: "bar",
        data: [100, 120],
        label: { show: false },
      },
    ],
  },
};

const DUAL_AXIS_INPUT = {
  schema: "oceanleo.chart.v1",
  option: {
    title: { text: "双轴" },
    xAxis: { type: "category", data: ["Q1", "Q2"] },
    yAxis: [
      { type: "value", name: "金额" },
      { type: "value", name: "增长率", position: "right" },
    ],
    series: [
      {
        id: "amount",
        name: "金额",
        type: "bar",
        data: [100, 120],
        label: { show: false },
      },
      {
        id: "rate",
        name: "增长率",
        type: "line",
        yAxisIndex: 1,
        data: [5, 8],
        label: { show: false },
      },
    ],
  },
};

test("single-axis document stays object after normalize", () => {
  const normalized = normalizeChartDocument(SINGLE_AXIS);
  assert.equal(Array.isArray(normalized.option.yAxis), false);
  assert.equal(chartYAxisCount(normalized.option), 1);
  assert.equal(normalized.option.yAxis.name, "万元");
});

test("dual-axis document preserves array shape and second axis", () => {
  const normalized = normalizeChartDocument(DUAL_AXIS_INPUT);
  assert.equal(Array.isArray(normalized.option.yAxis), true);
  assert.equal(chartYAxes(normalized.option).length, 2);
  assert.equal(normalized.option.series[1].yAxisIndex, 1);
  assert.equal(chartYAxes(normalized.option)[1].position, "right");
});

test("setChartYAxisCount upgrades and downgrades losslessly", () => {
  const single = normalizeChartDocument(SINGLE_AXIS);
  const singleJson = chartDocumentToJson(single);

  const dual = setChartYAxisCount(single, 2);
  assert.equal(chartYAxisCount(dual.option), 2);
  assert.equal(Array.isArray(dual.option.yAxis), true);

  const back = setChartYAxisCount(dual, 1);
  assert.equal(chartDocumentToJson(back), singleJson);
});

test("bindChartSeriesToAxis attaches to secondary axis", () => {
  const dual = setChartYAxisCount(normalizeChartDocument(SINGLE_AXIS), 2);
  const bound = bindChartSeriesToAxis(dual, "revenue", 1);
  assert.equal(bound.option.series[0].yAxisIndex, 1);
});

test("mark lines and areas roundtrip on series", () => {
  const withMarks = normalizeChartDocument({
    schema: "oceanleo.chart.v1",
    option: {
      title: { text: "标注" },
      xAxis: { type: "category", data: ["A", "B"] },
      yAxis: { type: "value" },
      series: [
        {
          id: "s1",
          name: "系列",
          type: "line",
          data: [10, 20],
          label: { show: false },
          markLine: {
            silent: true,
            data: [{ type: "average" }, { yAxis: 15, name: "目标" }],
          },
          markArea: {
            silent: true,
            data: [[{ yAxis: 8 }, { yAxis: 18 }]],
          },
        },
      ],
    },
  });
  const reopened = chartDocumentFromJson(chartDocumentToJson(withMarks));
  assert.equal(reopened.option.series[0].markLine.data.length, 2);
  assert.equal(reopened.option.series[0].markArea.data.length, 1);
});

test("negative: dropping upgrade path breaks lossless single-axis roundtrip", () => {
  const single = normalizeChartDocument(SINGLE_AXIS);
  const dual = setChartYAxisCount(single, 2);
  const back = setChartYAxisCount(dual, 1);
  assert.equal(chartDocumentToJson(back), chartDocumentToJson(single));
  const broken = normalizeChartDocument({
    ...back,
    option: {
      ...back.option,
      yAxis: chartYAxes(back.option),
    },
  });
  assert.notEqual(
    chartDocumentToJson(broken),
    chartDocumentToJson(single),
    "array yAxis on formerly single doc must change bytes",
  );
});
