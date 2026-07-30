// L1 载体契约 · chart 的聚焦验证(W15)。
// 规格: docs/specs/oceanleo-material-and-game-v1/L1-carriers/chart.md
// 本用例只判契约条款,不判编辑器交互;交互 roundtrip 由既有
// chart-editor-roundtrip.test.mjs 与 advanced-editor-v8-*.test.mjs 覆盖。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import test from "node:test";

import {
  CHART_DIMENSION_TYPES,
  CHART_FONT_SCALE,
  CHART_LAYOUT,
  CHART_SERIES_PALETTE,
  CHART_SPEC_CONSTANTS,
  CHART_SPEC_MAX_SOURCE_BYTES,
  CHART_SPEC_MIN_SOURCE_BYTES,
  CHART_SPEC_SERIES_TYPES,
  CHART_SPEC_SYMBOLS,
  ChartHtmlSourceRejected,
  assertChartSourceIsNotRenderArtifact,
  chartCompletenessReport,
  chartDimensionBindingErrors,
  chartDocumentFromJson,
  chartDocumentToJson,
  chartRenderArtifactKind,
  chartSourceFormatIsForbidden,
  normalizeChartDocument,
  validateChartProjectV1,
} from "../src/shell/chart-editor/chart-schema.ts";
import {
  CHART_FORBIDDEN_STATE_TRANSITIONS,
  CHART_STATE_TRANSITIONS,
  ChartSourceError,
  chartStateForSourceError,
  chartStateTransitionAllowed,
  loadChartDocument,
} from "../src/shell/chart-editor/chart-source.ts";
import { saveChartRevision } from "../src/shell/chart-editor/chart-persistence.ts";

const repoFile = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

// --------------------------------------------------------------------------
// 色度学工具(§2.1 V1–V3 的判据本身)
// --------------------------------------------------------------------------

function channels(hex) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function linearize(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const [r, g, b] = channels(hex).map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

function labOf(hex) {
  const [r, g, b] = channels(hex).map(linearize);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (value) =>
    value > 216 / 24389 ? Math.cbrt(value) : (841 / 108) * value + 4 / 29;
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE 15:2018 / ISO/CIE 11664-6 的 CIEDE2000 色差。 */
function deltaE2000(hexA, hexB) {
  const [l1, a1, b1] = labOf(hexA);
  const [l2, a2, b2] = labOf(hexB);
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const meanC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const angle = (y, x) => {
    if (y === 0 && x === 0) return 0;
    const value = Math.atan2(y, x) * deg;
    return value < 0 ? value + 360 : value;
  };
  const h1p = angle(b1, a1p);
  const h2p = angle(b2, a2p);
  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp * rad) / 2);
  const meanLp = (l1 + l2) / 2;
  const meanCp = (c1p + c2p) / 2;
  let meanHp = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) meanHp += h1p + h2p < 360 ? 360 : -360;
    meanHp /= 2;
  }
  const t =
    1 -
    0.17 * Math.cos((meanHp - 30) * rad) +
    0.24 * Math.cos(2 * meanHp * rad) +
    0.32 * Math.cos((3 * meanHp + 6) * rad) -
    0.2 * Math.cos((4 * meanHp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((meanHp - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7));
  const sl =
    1 + (0.015 * (meanLp - 50) ** 2) / Math.sqrt(20 + (meanLp - 50) ** 2);
  const sc = 1 + 0.045 * meanCp;
  const sh = 1 + 0.015 * meanCp * t;
  const rt = -Math.sin(2 * dTheta * rad) * rc;
  return Math.sqrt(
    (dLp / sl) ** 2 +
      (dCp / sc) ** 2 +
      (dHp / sh) ** 2 +
      rt * (dCp / sc) * (dHp / sh),
  );
}

// --------------------------------------------------------------------------
// §2.1 序列色序
// --------------------------------------------------------------------------

test("§2.1 序列色序前 8 位逐值固定,并且是 option.color 的默认值", () => {
  assert.deepEqual(
    [...CHART_SERIES_PALETTE],
    [
      "#1F6FEB",
      "#C47323",
      "#2E8B6F",
      "#8E5BA6",
      "#CF222E",
      "#57606A",
      "#0A7EA4",
      "#B45309",
    ],
  );
  assert.equal(CHART_SERIES_PALETTE.length, CHART_SPEC_CONSTANTS.C12_paletteLength);
  // 位次 2 的订正值:规格明写 `#D9822B` 对白底只有 2.93:1,已换成 `#C47323`。
  assert.equal(CHART_SERIES_PALETTE[1], "#C47323");
  assert.ok(!CHART_SERIES_PALETTE.includes("#D9822B"));

  // §2.1 是 `option.color` 的默认值:未声明 color 的图表载入后拿到这 8 位。
  const defaulted = normalizeChartDocument({
    title: { text: "默认色序" },
    xAxis: { type: "category", data: ["A", "B", "C"] },
    yAxis: { type: "value" },
    series: [{ id: "s1", name: "系列 1", type: "bar", data: [1, 2, 3] }],
  });
  assert.deepEqual(defaulted.option.color, [...CHART_SERIES_PALETTE]);
});

test("§2.1 V1:每个序列色对白底 ≥ 3.0:1(SC 1.4.11 的正确射程)", () => {
  const measured = CHART_SERIES_PALETTE.map((color) =>
    Number(contrastRatio(color, "#FFFFFF").toFixed(2)),
  );
  for (const [index, ratio] of measured.entries()) {
    assert.ok(
      ratio >= 3.0,
      `位次 ${index + 1} ${CHART_SERIES_PALETTE[index]} 对白底 ${ratio}:1 < 3.0:1`,
    );
  }
  // 规格 §2.1 表里的实测值,逐位对账。
  assert.deepEqual(measured, [4.63, 3.61, 4.17, 5.0, 5.36, 6.39, 4.63, 5.02]);
  // 被订正掉的 `#D9822B` 确实不达标 —— 证明订正不是随手改色。
  assert.ok(contrastRatio("#D9822B", "#FFFFFF") < 3.0);
});

test("§2.1 V2/V3:相邻 ΔE2000 ≥ 12.0,任意两位次 ΔE2000 ≥ 10.0", () => {
  let minAdjacent = Infinity;
  for (let index = 0; index < CHART_SERIES_PALETTE.length - 1; index += 1) {
    const delta = deltaE2000(
      CHART_SERIES_PALETTE[index],
      CHART_SERIES_PALETTE[index + 1],
    );
    minAdjacent = Math.min(minAdjacent, delta);
    assert.ok(
      delta >= 12.0,
      `位次 ${index + 1}↔${index + 2} ΔE2000 ${delta.toFixed(1)} < 12.0`,
    );
  }
  let minAny = Infinity;
  for (let i = 0; i < CHART_SERIES_PALETTE.length; i += 1) {
    for (let j = i + 1; j < CHART_SERIES_PALETTE.length; j += 1) {
      const delta = deltaE2000(CHART_SERIES_PALETTE[i], CHART_SERIES_PALETTE[j]);
      minAny = Math.min(minAny, delta);
      assert.ok(
        delta >= 10.0,
        `位次 ${i + 1}↔${j + 1} ΔE2000 ${delta.toFixed(1)} < 10.0`,
      );
    }
  }
  // 规格记的最低值:相邻 17.3(位次 6↔7)、任意 10.8(位次 2↔8)。
  assert.ok(minAdjacent >= 17.0 && minAdjacent < 18.0, `实测相邻最低 ${minAdjacent}`);
  assert.ok(minAny >= 10.0 && minAny < 11.5, `实测任意最低 ${minAny}`);
});

// --------------------------------------------------------------------------
// §1.3 运行时版本锁
// --------------------------------------------------------------------------

test("§1.3 运行时版本锁:echarts 恰为 6.1.0,且未引入 Vega / D3 / Chart.js", () => {
  const installed = JSON.parse(repoFile("../node_modules/echarts/package.json"));
  assert.equal(installed.name, "echarts");
  assert.equal(installed.version, "6.1.0");

  const manifest = JSON.parse(repoFile("../package.json"));
  const declared = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  // 现状声明是 `^6.1.0`(range),锁的凭据是**装机版本**恰为 6.1.0。
  // 收紧成精确 pin 要改 package.json,那不是本 owner 的文件,已写进 marker
  // 的「跨 owner 接口请求」。这里只保证 range 的下界就是契约锁定的版本。
  assert.equal(declared.echarts, "^6.1.0");
  assert.equal(declared.echarts.replace(/^[\^~]/, ""), installed.version);
  for (const banned of ["vega", "vega-lite", "vega-embed", "d3", "chart.js"]) {
    assert.equal(
      declared[banned],
      undefined,
      `§1.3 MUST NOT 引入 ${banned}:库内没有对应运行时`,
    );
  }
});

// --------------------------------------------------------------------------
// §2.2 / §2.3 / §4
// --------------------------------------------------------------------------

test("§2.2 版面与 §2.3 字号档逐值落地", () => {
  assert.deepEqual(CHART_LAYOUT, {
    canvasWidth: 960,
    canvasHeight: 540,
    gridLeft: 64,
    gridRight: 32,
    gridTop: 56,
    gridBottom: 56,
    legendHeight: 28,
    axisLineWidth: 1,
    splitLineWidth: 1,
    lineWidth: 2,
    symbolRadius: 4,
  });
  assert.deepEqual(CHART_FONT_SCALE, {
    title: 18,
    subtitle: 13,
    axis: 12,
    legend: 12,
    label: 11,
    caption: 10,
  });
  // 新图表生在 §2.2 的栅格上,而不是 ECharts 默认留白上。
  const hook = repoFile("../src/shell/chart-editor/use-chart-workbench.ts");
  assert.match(hook, /grid:\s*\{[\s\S]*?CHART_LAYOUT\.gridLeft/);
});

test("§4 数值常量表 C1–C27 逐值落地", () => {
  assert.equal(CHART_SPEC_CONSTANTS.C1_minSeries, 1);
  assert.equal(CHART_SPEC_CONSTANTS.C2_maxSeries, 12);
  assert.equal(CHART_SPEC_CONSTANTS.C3_minIndicators, 3);
  assert.equal(CHART_SPEC_CONSTANTS.C4_maxIndicators, 24);
  assert.equal(CHART_SPEC_CONSTANTS.C5_minDataPoints, 6);
  assert.equal(CHART_SPEC_CONSTANTS.C6_maxDataPoints, 5_000);
  assert.equal(CHART_SPEC_CONSTANTS.C7_minDatasetRows, 3);
  assert.equal(CHART_SPEC_CONSTANTS.C8_maxDatasetRows, 5_000);
  assert.equal(CHART_SPEC_CONSTANTS.C9_minDimensions, 2);
  assert.equal(CHART_SPEC_CONSTANTS.C9_maxDimensions, 24);
  assert.equal(CHART_SPEC_SERIES_TYPES.length, CHART_SPEC_CONSTANTS.C10_seriesTypeCount);
  assert.deepEqual(
    [...CHART_SPEC_SERIES_TYPES],
    ["line", "bar", "pie", "scatter", "radar", "heatmap", "boxplot", "candlestick"],
  );
  assert.equal(CHART_SPEC_SYMBOLS.length, CHART_SPEC_CONSTANTS.C11_symbolCount);
  assert.deepEqual(
    [...CHART_SPEC_SYMBOLS],
    ["circle", "rect", "triangle", "diamond", "pin", "arrow", "none"],
  );
  assert.deepEqual([...CHART_DIMENSION_TYPES], ["ordinal", "number", "time"]);
  assert.equal(CHART_SPEC_CONSTANTS.C23_minTitleTextLength, 4);
  assert.equal(CHART_SPEC_CONSTANTS.C24_minTakeawayLength, 8);
  assert.equal(CHART_SPEC_CONSTANTS.C25_maxPrecision, 8);
  assert.equal(CHART_SPEC_MIN_SOURCE_BYTES, 4_096);
  assert.equal(CHART_SPEC_MAX_SOURCE_BYTES, 4_194_304);
});

// --------------------------------------------------------------------------
// §3.1 `oceanleo.chart.v1` Schema
// --------------------------------------------------------------------------

function conformingProject(patch = {}) {
  const rows = Array.from({ length: 90 }, (_, index) => [
    `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
    Number((120 + index * 1.37).toFixed(2)),
    Number((80 + index * 0.91).toFixed(2)),
    index % 17 === 0 ? null : Number((30 + index * 0.44).toFixed(2)),
  ]);
  return {
    schema: "oceanleo.chart.v1",
    version: 1,
    title: "2026 年季度营收、成本与毛利趋势",
    dataset: {
      dimensions: [
        { name: "日期", type: "time" },
        { name: "营收", type: "number", unit: "万元" },
        { name: "成本", type: "number", unit: "万元" },
        { name: "毛利", type: "number", unit: "万元" },
      ],
      source: rows,
    },
    option: {
      color: CHART_SERIES_PALETTE.slice(0, 3),
      title: { text: "营收成本毛利趋势", subtext: "口径:合并报表,含税" },
      grid: {
        left: CHART_LAYOUT.gridLeft,
        right: CHART_LAYOUT.gridRight,
        top: CHART_LAYOUT.gridTop,
        bottom: CHART_LAYOUT.gridBottom,
      },
      legend: {},
      tooltip: { trigger: "axis" },
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      series: [
        { type: "line", name: "营收", encode: { x: "日期", y: "营收" }, symbol: "circle" },
        { type: "line", name: "成本", encode: { x: "日期", y: "成本" }, symbol: "rect" },
        { type: "line", name: "毛利", encode: { x: "日期", y: "毛利" }, symbol: "triangle" },
      ],
    },
    indicators: [
      { key: "revenue", label: "营收合计", unit: "万元", precision: 2 },
      { key: "cost", label: "成本合计", unit: "万元", precision: 2 },
      { key: "margin", label: "毛利率", unit: "%", precision: 1 },
    ],
    narrative: {
      takeaway: "毛利率在观察期内从 24.8% 抬到 31.2%,拉动主要来自成本增速低于营收增速。",
      method: "按月合并报表口径汇总,缺失月份以 null 表达,未做插值。",
      caveat: "第 18 / 35 / 52 号观测点缺失,折线在该处断开而非归零。",
    },
    attribution: {
      entries: [
        {
          text: "公司合并报表 2026 年月度披露",
          licenseCode: "CC-BY-4.0",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        },
      ],
    },
    ...patch,
  };
}

test("§3.1 一份合规 oceanleo.chart.v1 通过逐字校验", () => {
  const result = validateChartProjectV1(conformingProject());
  assert.deepEqual(result.ok ? [] : result.errors, []);
  assert.equal(result.ok, true);
});

test("§3.1 required 七项缺一即拒", () => {
  for (const key of [
    "schema",
    "version",
    "title",
    "dataset",
    "option",
    "indicators",
    "attribution",
  ]) {
    const broken = conformingProject();
    delete broken[key];
    const result = validateChartProjectV1(broken);
    assert.equal(result.ok, false, `缺 ${key} 时应当被拒`);
    assert.ok(
      result.errors.some(
        (error) => error.path === key && ["required", "const"].includes(error.code),
      ),
      `缺 ${key} 时应当报 required/const,实际 ${JSON.stringify(result.errors)}`,
    );
  }
});

test("§3.1 additionalProperties:false —— 历史 editor/category/effect 键在落库层被拒", () => {
  const result = validateChartProjectV1(
    conformingProject({ editor: "chart-editor@1", category: "finance", effect: "line" }),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors
      .filter((error) => error.code === "additional-property")
      .map((error) => error.path)
      .sort(),
    ["category", "editor", "effect"],
  );
  // 但载入层 MUST NOT 因此失败:库内 88 份既有 native chart 都带这三个键。
  const loaded = chartDocumentFromJson(
    JSON.stringify({
      schema: "oceanleo.chart.v1",
      editor: "chart-editor@1",
      option: { title: { text: "历史图" }, series: [{ type: "bar", data: [1, 2] }] },
    }),
  );
  assert.equal(loaded.editor, "chart-editor@1");
});

test("§3.1 枚举、区间与 https 署名逐条可判", () => {
  const cases = [
    [
      "series type 超出 C10 的 8 种",
      { option: { ...conformingProject().option, series: [{ type: "gauge", name: "仪表" }] } },
      "option.series[0].type",
    ],
    [
      "symbol 超出 C11 的 7 种",
      {
        option: {
          ...conformingProject().option,
          series: [{ type: "line", name: "营收", symbol: "star" }],
        },
      },
      "option.series[0].symbol",
    ],
    [
      "option.color 非 6 位十六进制",
      { option: { ...conformingProject().option, color: ["rgb(31,111,235)"] } },
      "option.color[0]",
    ],
    [
      "indicators 少于 C3 下限 3",
      { indicators: [{ key: "a", label: "甲" }] },
      "indicators",
    ],
    [
      "dataset.dimensions 少于 C9 下限 2",
      {
        dataset: {
          dimensions: [{ name: "日期", type: "time" }],
          source: [["a", 1], ["b", 2], ["c", 3]],
        },
      },
      "dataset.dimensions",
    ],
    [
      "attribution.licenseUrl 不是 https",
      {
        attribution: {
          entries: [
            { text: "某处", licenseCode: "CC0-1.0", licenseUrl: "http://example.com/x" },
          ],
        },
      },
      "attribution.entries[0].licenseUrl",
    ],
    ["version 不是 1", { version: 2 }, "version"],
    ["title 短于 8 字符", { title: "短标题" }, "title"],
  ];
  for (const [label, patch, expectedPath] of cases) {
    const result = validateChartProjectV1(conformingProject(patch));
    assert.equal(result.ok, false, `${label} 应当被拒`);
    assert.ok(
      result.errors.some((error) => error.path === expectedPath),
      `${label} 应当在 ${expectedPath} 报错,实际 ${JSON.stringify(result.errors)}`,
    );
  }
});

test("§3.2 F3 悬空维度绑定被逐条列出(序列名 + 维度名)", () => {
  const project = conformingProject();
  project.option.series[1].encode = { x: "日期", y: "已改名的成本" };
  const dangling = chartDimensionBindingErrors(project);
  assert.equal(dangling.length, 1);
  assert.equal(dangling[0].code, "dangling-dimension");
  assert.equal(dangling[0].path, "option.series[1].encode.y");
  assert.match(dangling[0].message, /成本/);
  assert.match(dangling[0].message, /已改名的成本/);
  assert.deepEqual(chartDimensionBindingErrors(conformingProject()), []);
});

// --------------------------------------------------------------------------
// §3.2 载入与重算状态机
// --------------------------------------------------------------------------

test("§3.2 状态机迁移表与规格逐条一致", () => {
  assert.deepEqual(
    CHART_STATE_TRANSITIONS.map(({ from, to }) => `${from} → ${to}`),
    [
      "empty → parsing",
      "parsing → invalid",
      "parsing → legacy-render-only",
      "parsing → option-linked",
      "option-linked → invalid",
      "option-linked → ready",
      "ready → dirty",
      "dirty → saving",
      "saving → ready",
      "saving → dirty",
    ],
  );
});

test("§3.2 五条非法迁移一条都不在允许表里", () => {
  assert.equal(CHART_FORBIDDEN_STATE_TRANSITIONS.length, 5);
  assert.deepEqual(
    CHART_FORBIDDEN_STATE_TRANSITIONS.map(({ from, to }) => `${from} → ${to}`),
    [
      "legacy-render-only → dirty",
      "parsing → ready",
      "invalid → saving",
      "saving → invalid",
      "empty → ready",
    ],
  );
  for (const { from, to, why } of CHART_FORBIDDEN_STATE_TRANSITIONS) {
    assert.equal(
      chartStateTransitionAllowed(from, to),
      false,
      `${from} → ${to} MUST NOT 发生(${why})`,
    );
  }
  assert.equal(chartStateTransitionAllowed("empty", "parsing"), true);
  assert.equal(chartStateTransitionAllowed("saving", "dirty"), true);
});

test("§3.2 载入失败按码落到旁路终态,且编辑器不把 legacy 图表放进可编辑态", () => {
  assert.equal(chartStateForSourceError("legacy-render-only"), "legacy-render-only");
  assert.equal(chartStateForSourceError("invalid-option"), "invalid");
  assert.equal(chartStateForSourceError("source-digest"), "invalid");

  const hook = repoFile("../src/shell/chart-editor/use-chart-workbench.ts");
  // `parsing → option-linked → ready`,中间必须过维度绑定,不许直达 ready。
  assert.match(hook, /setCarrierState\("option-linked"\)/);
  assert.match(hook, /chartDimensionBindingErrors\(next\)/);
  // `legacy-render-only → dirty` 的兜底:本地草稿恢复也不能绕进可编辑态。
  assert.match(hook, /carrierStateRef\.current === "legacy-render-only"/);
  // `saving → invalid` 是非法迁移,保存失败退回 dirty。
  assert.match(hook, /saving → dirty/);
});

// --------------------------------------------------------------------------
// §1.2 硬禁令:`html` 不得落库
// --------------------------------------------------------------------------

test("§1.2 渲染产物的 source_format 与实际字节都被识别", () => {
  for (const format of ["html", "HTML", "text/html", "png", "image/png", "image/svg+xml"]) {
    assert.equal(chartSourceFormatIsForbidden(format), true, `${format} 应当被禁`);
  }
  for (const format of ["oceanleo.chart.v1", "echarts-option+json"]) {
    assert.equal(chartSourceFormatIsForbidden(format), false);
  }
  assert.equal(chartRenderArtifactKind("<!DOCTYPE html><html><body>图</body></html>"), "html");
  assert.equal(chartRenderArtifactKind("<script>window.option={}</script>"), "html");
  assert.equal(chartRenderArtifactKind('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "svg");
  assert.equal(
    chartRenderArtifactKind(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    ),
    "png",
  );
  assert.equal(chartRenderArtifactKind('{"schema":"oceanleo.chart.v1"}'), null);
});

test("§1.2 落库闸:声明或字节命中渲染产物即抛 ChartHtmlSourceRejected", () => {
  assert.throws(
    () => assertChartSourceIsNotRenderArtifact({ sourceFormat: "html" }),
    (error) =>
      error instanceof ChartHtmlSourceRejected &&
      error.code === "chart-html-source-forbidden" &&
      /§1\.2/.test(error.message),
  );
  assert.throws(
    () => assertChartSourceIsNotRenderArtifact({ bytes: "<html><body></body></html>" }),
    ChartHtmlSourceRejected,
  );
  assert.doesNotThrow(() =>
    assertChartSourceIsNotRenderArtifact({
      sourceFormat: "oceanleo.chart.v1",
      bytes: JSON.stringify(conformingProject()),
    }),
  );
});

test("§1.2 saveChartRevision 在任何上传之前就拒绝 html 源的图表", async () => {
  let touched = 0;
  const dependencies = {
    upload: async () => {
      touched += 1;
      return { ok: true, data: { file: { url: "https://x/y.json" } } };
    },
    publish: async () => {
      touched += 1;
      return { ok: true };
    },
    saveLegacy: async () => {
      touched += 1;
      return { ok: true };
    },
  };
  await assert.rejects(
    () =>
      saveChartRevision(
        {
          item: {
            key: "chart:legacy",
            source: "artifact",
            id: "chart-legacy",
            title: "历史 html 图表",
            kind: "image",
            siteId: "asset",
            favorite: false,
            meta: {},
            artifactType: "chart",
            artifact: { sourceFormat: "html" },
          },
          siteId: "chart",
          editRevision: 1,
          document: {
            schema: "oceanleo.chart.v1",
            option: { title: { text: "历史图" }, series: [{ type: "bar", data: [1, 2] }] },
          },
          workingHeadUrl: "",
          title: "历史 html 图表",
        },
        dependencies,
      ),
    ChartHtmlSourceRejected,
  );
  assert.equal(touched, 0, "拒绝必须发生在任何上传/发布之前");
});

test("§3.2 parsing → legacy-render-only:html 声明与 PNG 字节都进旁路终态", async () => {
  const htmlItem = {
    key: "chart:legacy-html",
    source: "artifact",
    id: "chart-legacy-html",
    title: "历史 html 图表",
    kind: "image",
    siteId: "asset",
    favorite: false,
    artifactType: "chart",
    content: "<html><body><div id=chart></div></body></html>",
    meta: { content_type: "chart", source_format: "html" },
  };
  await assert.rejects(
    () => loadChartDocument(htmlItem),
    (error) =>
      error instanceof ChartSourceError &&
      error.code === "legacy-render-only" &&
      /没有 ECharts option 源/.test(error.message) &&
      /数据修复/.test(error.message),
  );

  const inlineHtml = {
    ...htmlItem,
    meta: {
      content_type: "chart",
      editor: {
        schema: "oceanleo.editor-manifest.v1",
        id: "chart-editor",
        version: 1,
        capabilities: ["load", "mutate", "save", "reopen"],
        source: { kind: "inline", format: "echarts-option+json" },
      },
    },
  };
  await assert.rejects(
    () => loadChartDocument(inlineHtml),
    (error) =>
      error instanceof ChartSourceError && error.code === "legacy-render-only",
  );
});

// --------------------------------------------------------------------------
// §8 字节下限与完备判据
// --------------------------------------------------------------------------

test("§8.1 + §8.2:合规产物达标,且字节确实过 4,096 B 下限", () => {
  const project = conformingProject();
  const report = chartCompletenessReport(project);
  assert.deepEqual(report.failures, []);
  assert.equal(report.ok, true);
  assert.ok(
    report.byteLength >= CHART_SPEC_MIN_SOURCE_BYTES,
    `合规样例字节 ${report.byteLength} 应当 ≥ ${CHART_SPEC_MIN_SOURCE_BYTES}`,
  );
  assert.ok(report.byteLength <= CHART_SPEC_MAX_SOURCE_BYTES);
});

test("§8.2 空 option / 空图 / 233 B 空壳一律判不合格", () => {
  const emptyOption = chartCompletenessReport({
    schema: "oceanleo.chart.v1",
    version: 1,
    title: "一个什么都没有的图表",
    dataset: { dimensions: [], source: [] },
    option: {},
    indicators: [],
    attribution: { entries: [] },
  });
  assert.equal(emptyOption.ok, false);
  for (const code of [
    "byte-floor",
    "series-count",
    "indicator-count",
    "data-point-count",
    "dataset-row-count",
    "dimension-count",
    "title-text",
    "narrative-takeaway",
    "attribution-entries",
  ]) {
    assert.ok(
      emptyOption.failures.some((failure) => failure.code === code),
      `空 option 应当命中 ${code},实际 ${JSON.stringify(emptyOption.failures.map((f) => f.code))}`,
    );
  }

  // 233 B 空壳 —— 本 session 要治的那一类。
  const shell = { schema: "oceanleo.chart.v1", version: 1, option: { series: [] } };
  const shellReport = chartCompletenessReport(shell);
  assert.equal(shellReport.ok, false);
  assert.ok(shellReport.byteLength < 233);
  assert.ok(shellReport.failures.some((failure) => failure.code === "byte-floor"));

  // 只是字节不够(其余齐全)也必须判不合格:字节下限是独立 MUST。
  const thin = chartCompletenessReport(conformingProject(), { byteLength: 233 });
  assert.equal(thin.ok, false);
  assert.deepEqual(
    thin.failures.map((failure) => failure.code),
    ["byte-floor"],
  );
});

test("§8.2 F2 全序列同色 与 SC 1.4.1 只靠颜色 都被判不合格", () => {
  const monochrome = conformingProject();
  monochrome.option.color = ["#1F6FEB"];
  const monoReport = chartCompletenessReport(monochrome);
  assert.equal(monoReport.ok, false);
  assert.ok(
    monoReport.failures.some((failure) => failure.code === "series-color-variety"),
  );

  const colorOnly = conformingProject();
  for (const series of colorOnly.option.series) delete series.symbol;
  const colorOnlyReport = chartCompletenessReport(colorOnly);
  assert.equal(colorOnlyReport.ok, false);
  assert.ok(
    colorOnlyReport.failures.some((failure) => failure.code === "non-color-encoding"),
  );
});

test("§5.3 dataset 里的 null 是缺失值,载入后 MUST NOT 变成 0", () => {
  const project = conformingProject();
  const nullColumn = project.dataset.source
    .map((row) => row[3])
    .filter((cell) => cell === null);
  assert.ok(nullColumn.length > 0, "样例本身要含缺失值");
  const roundtripped = JSON.parse(
    chartDocumentToJson(chartDocumentFromJson(JSON.stringify(project))),
  );
  assert.deepEqual(roundtripped.dataset.source, project.dataset.source);
  assert.equal(
    roundtripped.dataset.source.filter((row) => row[3] === null).length,
    nullColumn.length,
  );
});

test("§3.1 顶层字段在载入 → 序列化 → 重开后确定性保真", () => {
  const project = conformingProject();
  const once = chartDocumentToJson(chartDocumentFromJson(JSON.stringify(project)));
  const twice = chartDocumentToJson(chartDocumentFromJson(once));
  assert.equal(once, twice, "确定性序列化:两次 roundtrip 必须逐字节相同");
  const reopened = JSON.parse(once);
  assert.equal(reopened.version, 1);
  assert.equal(reopened.title, project.title);
  assert.deepEqual(reopened.indicators, project.indicators);
  assert.deepEqual(reopened.narrative, project.narrative);
  assert.deepEqual(reopened.attribution, project.attribution);
  assert.deepEqual(reopened.dataset.dimensions, project.dataset.dimensions);
});

// --------------------------------------------------------------------------
// 仲裁 D4 与跨 owner 边界
// --------------------------------------------------------------------------

/** 只看真实的 import / export / require / 动态 import 说明符,不看注释里的提法。 */
function moduleSpecifiers(body) {
  const specifiers = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

function directorySpecifiers(url) {
  let names;
  try {
    names = readdirSync(url);
  } catch {
    return null;
  }
  return names.map((name) => ({
    name,
    specifiers: moduleSpecifiers(readFileSync(new URL(name, url), "utf8")),
  }));
}

test("仲裁 D4:chart-editor/ 与 interactive-doc-editor/ 互不 import", () => {
  const chart = directorySpecifiers(
    new URL("../src/shell/chart-editor/", import.meta.url),
  );
  assert.ok(chart, "chart-editor/ 必须存在");
  for (const { name, specifiers } of chart) {
    for (const specifier of specifiers) {
      assert.ok(
        !/interactive-doc/.test(specifier),
        `chart-editor/${name} MUST NOT import ${specifier}(D4)`,
      );
    }
  }
  // W6/W7 的目录尚未落盘时,反向检查由 V2/V3 兜。
  const interactive = directorySpecifiers(
    new URL("../src/shell/interactive-doc-editor/", import.meta.url),
  );
  for (const { name, specifiers } of interactive || []) {
    for (const specifier of specifiers) {
      assert.ok(
        !/chart-editor/.test(specifier),
        `interactive-doc-editor/${name} MUST NOT import ${specifier}(D4)`,
      );
    }
  }
});

test("落库四元组喂给后端 chart_option_evidence_is_present 的 source_format 合法", () => {
  const persistence = repoFile("../src/shell/chart-editor/chart-persistence.ts");
  // 后端 typed_artifact_models.py:510-521 只认这两种 source_format。
  assert.match(persistence, /format: CHART_DOCUMENT_SCHEMA/);
  const source = repoFile("../src/shell/chart-editor/chart-source.ts");
  assert.match(source, /CHART_OPTION_FORMAT = "echarts-option\+json"/);
  const schema = repoFile("../src/shell/chart-editor/chart-schema.ts");
  assert.match(schema, /CHART_DOCUMENT_SCHEMA = "oceanleo\.chart\.v1"/);
});

test("R6 拒绝文案归 W3:本 owner 未改 workbench-routes.ts", () => {
  const routes = repoFile("../src/shell/workbench-routes.ts");
  assert.match(routes, /ECharts option 源/);
});
