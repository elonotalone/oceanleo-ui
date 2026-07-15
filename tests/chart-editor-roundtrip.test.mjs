import assert from "node:assert/strict";
import test from "node:test";

import {
  appendChartSeries,
  chartDocumentFromJson,
  chartDocumentToJson,
  patchChartAxis,
  patchChartSeries,
  replaceChartData,
} from "../src/shell/chart-editor/chart-schema.ts";

const sourceOption = {
  title: { text: "季度收入" },
  color: ["#2563eb", "#f97316"],
  legend: { show: true },
  xAxis: { type: "category", name: "季度", data: ["Q1", "Q2", "Q3"] },
  yAxis: { type: "value", name: "万元" },
  series: [
    {
      id: "revenue",
      name: "收入",
      type: "bar",
      data: [120, 180, 240],
      label: { show: false },
    },
  ],
};

test("chart-editor@1 load, mutate, save and reopen roundtrip is structural", () => {
  const loaded = chartDocumentFromJson(JSON.stringify(sourceOption));
  const withData = replaceChartData(loaded, [
    ["季度", "收入", "利润"],
    ["Q1", 130, 40],
    ["Q2", 210, 70],
    ["Q3", 280, 95],
  ]);
  const withSeries = appendChartSeries(withData, {
    id: "margin",
    name: "利润率",
    type: "line",
    data: [30.8, 33.3, 33.9],
    label: { show: true },
  });
  const styled = patchChartSeries(withSeries, "revenue", {
    color: "#7c3aed",
    label: { show: true },
  });
  const mutated = patchChartAxis(styled, "y", {
    name: "金额（万元）",
    show: true,
  });

  const saved = chartDocumentToJson(mutated);
  const reopened = chartDocumentFromJson(saved);
  assert.deepEqual(reopened, mutated);
  assert.equal(reopened.option.series[0].color, "#7c3aed");
  assert.equal(reopened.option.series[0].label.show, true);
  assert.equal(reopened.option.series.at(-1).name, "利润率");
  assert.equal(reopened.option.yAxis.name, "金额（万元）");
  assert.deepEqual(reopened.option.xAxis.data, ["Q1", "Q2", "Q3"]);
});

test("chart source parser accepts JSON only and never extracts scripts from HTML", () => {
  assert.throws(
    () =>
      chartDocumentFromJson(
        '<script>window.option={series:[{data:[1]}]}</script>',
      ),
    /JSON/,
  );
  assert.throws(
    () =>
      chartDocumentFromJson(
        JSON.stringify({ series: [{ type: "custom", data: [1] }] }),
      ),
    /series type/,
  );
});

test("chart roundtrip preserves trusted gauge option details it does not edit", () => {
  const source = {
    schema: "oceanleo.chart.v1",
    option: {
      backgroundColor: "#fff",
      title: [{ text: "设备温度", subtext: "温度计式" }],
      legend: [{ show: true, data: ["温度"] }],
      series: [
        {
          type: "gauge",
          name: "温度",
          min: 0,
          max: 100,
          detail: { formatter: "{value}℃", valueAnimation: true },
          axisLine: { lineStyle: { width: 22 } },
          data: [{ name: "温度", value: 55, itemStyle: { opacity: 0.9 } }],
        },
      ],
    },
  };
  const document = chartDocumentFromJson(JSON.stringify(source));
  const reopened = chartDocumentFromJson(chartDocumentToJson(document));
  const gauge = reopened.option.series[0];
  assert.equal(reopened.option.backgroundColor, "#fff");
  assert.equal(reopened.option.title.subtext, "温度计式");
  assert.deepEqual(reopened.option.legend.data, ["温度"]);
  assert.equal(gauge.min, 0);
  assert.equal(gauge.max, 100);
  assert.equal(gauge.detail.formatter, "{value}℃");
  assert.equal(gauge.axisLine.lineStyle.width, 22);
  assert.equal(gauge.data[0].itemStyle.opacity, 0.9);
});

test("all curated ECharts families reopen without losing typed values or source identity", () => {
  const fixtures = [
    { type: "bar", data: [12, 18] },
    { type: "line", data: [12, 18], areaStyle: { opacity: 0.25 } },
    { type: "pie", data: [{ name: "A", value: 12 }] },
    { type: "gauge", data: [{ name: "温度", value: 55 }], max: 100 },
    { type: "scatter", data: [[10, 20], [15, 25]], symbolSize: 14 },
    { type: "radar", data: [{ name: "甲", value: [80, 65, 92] }] },
    { type: "funnel", data: [{ name: "访问", value: 100 }], sort: "descending" },
  ];
  for (const series of fixtures) {
    const source = {
      schema: "oceanleo.chart.v1",
      editor: "chart-editor@1",
      category: "real-fixture",
      effect: series.type,
      option: {
        title: { text: `${series.type} fixture` },
        radar: { indicator: [{ name: "A", max: 100 }] },
        series: [series],
      },
    };
    const reopened = chartDocumentFromJson(
      chartDocumentToJson(chartDocumentFromJson(JSON.stringify(source))),
    );
    assert.equal(reopened.editor, "chart-editor@1");
    assert.equal(reopened.category, "real-fixture");
    assert.equal(reopened.effect, series.type);
    assert.equal(reopened.option.series[0].type, series.type);
    assert.deepEqual(reopened.option.series[0].data, series.data);
    assert.deepEqual(reopened.option.radar, source.option.radar);
  }
});
