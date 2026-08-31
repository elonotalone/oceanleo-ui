import assert from "node:assert/strict";
import test from "node:test";

import {
  CHART_CREATE_FROM_RANGE_COMMAND,
  CHART_RANGE_SNAPSHOT_SCHEMA,
  chartDocumentFromJson,
  chartDocumentFromRangeSnapshot,
  chartDocumentToJson,
  normalizeChartDocument,
  recommendChartType,
} from "../src/shell/chart-editor/chart-schema.ts";

const SNAPSHOT = {
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

const TIME_SNAPSHOT = {
  schema: CHART_RANGE_SNAPSHOT_SCHEMA,
  headerRow: true,
  headerColumn: true,
  columnTypes: ["time", "number"],
  cells: [
    ["日期", "访问"],
    ["2024-01-01", 100],
    ["2024-02-01", 130],
    ["2024-03-01", 160],
  ],
};

const SCATTER_SNAPSHOT = {
  schema: CHART_RANGE_SNAPSHOT_SCHEMA,
  headerRow: true,
  headerColumn: false,
  cells: [
    ["身高", "体重"],
    [170, 65],
    [175, 70],
    [180, 75],
  ],
};

const PIE_SNAPSHOT = {
  schema: CHART_RANGE_SNAPSHOT_SCHEMA,
  headerRow: true,
  headerColumn: true,
  cells: [
    ["渠道", "占比"],
    ["搜索", 45],
    ["社交", 30],
    ["直接", 25],
  ],
};

test("command id and snapshot schema are stable", () => {
  assert.equal(
    CHART_CREATE_FROM_RANGE_COMMAND,
    "chart-editor@1.create-from-range",
  );
  assert.equal(CHART_RANGE_SNAPSHOT_SCHEMA, "oceanleo.chart.range-snapshot.v1");
});

test("recommendChartType picks bar, line, scatter, pie", () => {
  assert.equal(recommendChartType(SNAPSHOT).type, "bar");
  assert.equal(recommendChartType(TIME_SNAPSHOT).type, "line");
  assert.equal(recommendChartType(SCATTER_SNAPSHOT).type, "scatter");
  assert.equal(recommendChartType(PIE_SNAPSHOT).type, "pie");
});

test("chartDocumentFromRangeSnapshot applies recommendation but allows override", () => {
  const recommended = chartDocumentFromRangeSnapshot(SNAPSHOT);
  assert.equal(recommended.document.option.series[0].type, "bar");
  assert.equal(recommended.ingest.recommendation.type, "bar");

  const forced = chartDocumentFromRangeSnapshot(SNAPSHOT, { type: "line" });
  assert.equal(forced.document.option.series[0].type, "line");
  assert.equal(forced.ingest.recommendation.type, "bar");
  assert.notEqual(
    recommended.document.option.series[0].type,
    forced.document.option.series[0].type,
  );
});

test("negative: ignoring type override would fail this lock", () => {
  const { document, ingest } = chartDocumentFromRangeSnapshot(PIE_SNAPSHOT, {
    type: "bar",
  });
  assert.equal(ingest.recommendation.type, "pie");
  assert.equal(document.option.series[0].type, "bar");
});

test("extended series types roundtrip store-read-render params", () => {
  for (const type of ["heatmap", "boxplot", "candlestick"]) {
    const seed = {
      schema: "oceanleo.chart.v1",
      option: {
        title: { text: "扩展图型" },
        xAxis: { type: "category", data: ["A", "B"] },
        yAxis: { type: "value" },
        series: [
          {
            id: "s1",
            name: "系列",
            type,
            data:
              type === "candlestick"
                ? [
                    [20, 30, 10, 35],
                    [30, 25, 15, 32],
                  ]
                : type === "boxplot"
                  ? [
                      [850, 900, 940, 980, 1020],
                      [880, 920, 960, 990, 1050],
                    ]
                  : [
                      [0, 0, 5],
                      [0, 1, 8],
                    ],
            label: { show: false },
          },
        ],
      },
    };
    const normalized = normalizeChartDocument(seed);
    const reopened = chartDocumentFromJson(chartDocumentToJson(normalized));
    assert.equal(reopened.option.series[0].type, type);
    assert.deepEqual(reopened.option.series[0].data, normalized.option.series[0].data);
  }
});

test("stacked bar, area, and combo mixed series roundtrip", () => {
  const seed = {
    schema: "oceanleo.chart.v1",
    option: {
      title: { text: "组合图" },
      xAxis: { type: "category", data: ["Q1", "Q2"] },
      yAxis: { type: "value" },
      series: [
        {
          id: "bar",
          name: "收入",
          type: "bar",
          stack: "total",
          data: [100, 120],
          label: { show: false },
        },
        {
          id: "line",
          name: "增长率",
          type: "line",
          areaStyle: { opacity: 0.2 },
          data: [5, 8],
          label: { show: false },
        },
      ],
    },
  };
  const normalized = normalizeChartDocument(seed);
  const bar = normalized.option.series.find((entry) => entry.id === "bar");
  const line = normalized.option.series.find((entry) => entry.id === "line");
  assert.equal(bar.stack, "total");
  assert.deepEqual(line.areaStyle, { opacity: 0.2 });
  assert.notEqual(bar.type, line.type);
  const reopened = chartDocumentFromJson(chartDocumentToJson(normalized));
  assert.equal(reopened.option.series[0].stack, "total");
  assert.deepEqual(reopened.option.series[1].areaStyle, { opacity: 0.2 });
});
