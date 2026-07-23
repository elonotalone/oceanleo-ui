import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CHART_SOURCE_MAX_BYTES,
  appendChartSeries,
  chartDocumentFromJson,
  chartDocumentFromManifestOptionJson,
  chartDocumentToJson,
  normalizeChartDocument,
  patchChartAxis,
  patchChartSeries,
  patchChartTooltip,
  replaceChartData,
} from "../src/shell/chart-editor/chart-schema.ts";
import {
  ChartSourceError,
  loadChartDocument,
  resolveChartSource,
} from "../src/shell/chart-editor/chart-source.ts";
import { saveChartRevision } from "../src/shell/chart-editor/chart-persistence.ts";

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

const sourceDocument = {
  schema: "oceanleo.chart.v1",
  editor: "chart-editor@1",
  option: sourceOption,
};

function loadSourceDocument() {
  return chartDocumentFromJson(JSON.stringify(sourceDocument));
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pngBlob() {
  return new Blob(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    { type: "image/png" },
  );
}

function chartManifest(source) {
  return {
    schema: "oceanleo.editor-manifest.v1",
    id: "chart-editor",
    version: 1,
    capabilities: ["load", "mutate", "save", "reopen"],
    source,
  };
}

function libraryItem(patch = {}) {
  return {
    key: "chart:fixture",
    source: "artifact",
    id: "chart-fixture",
    title: "季度收入",
    kind: "image",
    siteId: "asset",
    favorite: false,
    meta: {},
    ...patch,
  };
}

test("chart-editor@1 load, mutate, save and reopen roundtrip is structural", () => {
  const loaded = loadSourceDocument();
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

test("axis bounds, grid, tooltip and deep data-label styles survive reopen", () => {
  const loaded = loadSourceDocument();
  const withAxis = patchChartAxis(loaded, "y", {
    min: -20,
    max: 320,
    interval: 20,
    axisTick: { show: false },
    axisLabel: { show: true, rotate: 35, color: "#475569" },
    splitLine: { show: true, lineStyle: { color: "#cbd5e1" } },
  });
  const withTooltip = patchChartTooltip(withAxis, {
    show: true,
    trigger: "axis",
    backgroundColor: "#0f172a",
    borderColor: "#38bdf8",
    borderWidth: 2,
    formatter: "{b}: {c}",
    textStyle: { color: "#f8fafc", fontSize: 15 },
  });
  const styled = patchChartSeries(withTooltip, "revenue", {
    label: {
      show: true,
      position: "insideTop",
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "bold",
      formatter: "¥{c}",
    },
  });
  const reopened = chartDocumentFromJson(chartDocumentToJson(styled));
  assert.equal(reopened.option.yAxis.min, -20);
  assert.equal(reopened.option.yAxis.max, 320);
  assert.equal(reopened.option.yAxis.interval, 20);
  assert.equal(reopened.option.yAxis.axisTick.show, false);
  assert.equal(reopened.option.yAxis.axisLabel.rotate, 35);
  assert.equal(reopened.option.yAxis.splitLine.lineStyle.color, "#cbd5e1");
  assert.equal(reopened.option.tooltip.trigger, "axis");
  assert.equal(reopened.option.tooltip.textStyle.fontSize, 15);
  assert.equal(reopened.option.series[0].label.position, "insideTop");
  assert.equal(reopened.option.series[0].label.fontWeight, "bold");
  assert.equal(reopened.option.series[0].label.formatter, "¥{c}");
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
        JSON.stringify({
          schema: "oceanleo.chart.v1",
          option: { series: [{ type: "custom", data: [1] }] },
        }),
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

test("only canonical documents or chart-editor@1 manifest options can enter the editor", async () => {
  assert.throws(
    () => chartDocumentFromJson(JSON.stringify(sourceOption)),
    /oceanleo\.chart\.v1/,
  );
  const manifestOption = chartDocumentFromManifestOptionJson(
    JSON.stringify(sourceOption),
  );
  assert.equal(manifestOption.schema, "oceanleo.chart.v1");
  assert.equal(manifestOption.option.series[0].name, "收入");

  const inline = libraryItem({
    content: JSON.stringify(sourceOption),
    meta: {
      content_type: "chart",
      editor: chartManifest({
        kind: "inline",
        format: "echarts-option+json",
      }),
    },
  });
  assert.deepEqual(await loadChartDocument(inline), manifestOption);

  await assert.rejects(
    () =>
      loadChartDocument(
        libraryItem({
          content: JSON.stringify(sourceOption),
          meta: { content_type: "chart" },
        }),
      ),
    (error) =>
      error instanceof ChartSourceError &&
      error.code === "missing-source" &&
      /数据修复/.test(error.message) &&
      /HTML、脚本或 PNG/.test(error.message),
  );
});

test("malicious and oversized options fail closed before ECharts sees them", () => {
  assert.throws(
    () =>
      chartDocumentFromJson(
        JSON.stringify({
          ...sourceDocument,
          option: {
            ...sourceOption,
            tooltip: {
              formatter: '<img src=x onerror="globalThis.pwned=true">',
            },
          },
        }),
      ),
    /unsafe executable content/,
  );
  assert.throws(
    () =>
      chartDocumentFromJson(
        '{"schema":"oceanleo.chart.v1","option":{"__proto__":{"polluted":true},"series":[{"type":"bar","data":[1]}]}}',
      ),
    /forbidden key/,
  );
  assert.throws(
    () =>
      normalizeChartDocument({
        schema: "oceanleo.chart.v1",
        option: {
          ...sourceOption,
          tooltip: { formatter: () => "executed" },
        },
      }),
    /JSON data only/,
  );
  assert.throws(
    () =>
      chartDocumentFromJson(
        JSON.stringify({
          ...sourceDocument,
          option: {
            ...sourceOption,
            title: { text: "unsafe", link: "javascript:alert(1)" },
          },
        }),
      ),
    /unsafe executable content/,
  );
  assert.throws(
    () =>
      chartDocumentFromJson(
        JSON.stringify({
          ...sourceDocument,
          option: {
            ...sourceOption,
            graphic: {
              type: "image",
              style: { image: "https://tracker.example/pixel.png" },
            },
          },
        }),
      ),
    /unsafe executable content/,
  );
  const huge = JSON.stringify({
    ...sourceDocument,
    option: {
      ...sourceOption,
      title: { text: "x".repeat(CHART_SOURCE_MAX_BYTES) },
    },
  });
  assert.throws(() => chartDocumentFromJson(huge), /2MB/);
});

test("URL manifests enforce trust, expiry, JSON media type and bounded bytes", async () => {
  const trusted = libraryItem({
    meta: {
      content_type: "chart",
      editor: chartManifest({
        kind: "url",
        format: "echarts-option+json",
        url: "/v1/assets/library/chart-123/editor-source",
      }),
    },
  });
  let requested = "";
  const loaded = await loadChartDocument(trusted, {
    fetcher: async (input) => {
      requested = String(input);
      return new Response(JSON.stringify(sourceOption), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
  });
  assert.match(
    requested,
    /^https:\/\/api\.oceanleo\.com\/v1\/assets\/library\/chart-123\/editor-source$/,
  );
  assert.equal(loaded.option.title.text, "季度收入");

  let untrustedFetches = 0;
  await assert.rejects(
    () =>
      loadChartDocument(
        libraryItem({
          meta: {
            editor: chartManifest({
              kind: "url",
              format: "echarts-option+json",
              url: "https://evil.example/option.json",
            }),
          },
        }),
        {
          fetcher: async () => {
            untrustedFetches += 1;
            return new Response();
          },
        },
      ),
    (error) =>
      error instanceof ChartSourceError && error.code === "untrusted-url",
  );
  assert.equal(untrustedFetches, 0);
  assert.throws(
    () =>
      resolveChartSource(
        canonicalChartItem(
          "revision-private",
          "https://127.0.0.1/chart.json",
        ),
      ),
    (error) =>
      error instanceof ChartSourceError && error.code === "untrusted-url",
  );

  assert.throws(
    () =>
      resolveChartSource(
        libraryItem({
          meta: {
            editor: chartManifest({
              kind: "url",
              format: "echarts-option+json",
              url: "https://api.oceanleo.com/chart.json?Expires=1",
            }),
          },
        }),
      ),
    (error) =>
      error instanceof ChartSourceError &&
      error.code === "expired-url" &&
      /数据修复/.test(error.message),
  );

  await assert.rejects(
    () =>
      loadChartDocument(trusted, {
        fetcher: async () =>
          new Response("<html>not source</html>", {
            headers: { "content-type": "text/html" },
          }),
      }),
    (error) =>
      error instanceof ChartSourceError && error.code === "source-type",
  );
  await assert.rejects(
    () =>
      loadChartDocument(trusted, {
        fetcher: async () =>
          new Response("", {
            status: 410,
            headers: { "content-type": "application/json" },
          }),
      }),
    (error) =>
      error instanceof ChartSourceError &&
      error.code === "expired-url" &&
      /数据修复/.test(error.message),
  );
  await assert.rejects(
    () =>
      loadChartDocument(trusted, {
        fetcher: async () =>
          new Response("{}", {
            headers: {
              "content-type": "application/json",
              "content-length": String(CHART_SOURCE_MAX_BYTES + 1),
            },
          }),
      }),
    (error) =>
      error instanceof ChartSourceError && error.code === "source-too-large",
  );
});

function artifactRendition(purpose, revisionId, url, digest) {
  return {
    purpose,
    revisionId,
    url,
    mediaType:
      purpose === "source"
        ? "application/vnd.oceanleo.chart+json"
        : "image/png",
    format: purpose === "source" ? "oceanleo.chart.v1" : "png",
    expiresAt: "2099-01-01T00:00:00.000Z",
    rendererVersion: "fixture",
    width: purpose === "source" ? null : 800,
    height: purpose === "source" ? null : 450,
    durationMs: null,
    digest,
  };
}

function canonicalChartItem(
  revisionId,
  sourceUrl,
  sourceDigest = "a".repeat(64),
  previewUrl = "https://cdn.oceanleo.com/chart-root.png",
  previewDigest = "b".repeat(64),
) {
  const artifactId = "chart-root";
  const preview = artifactRendition(
    "preview",
    revisionId,
    previewUrl,
    previewDigest,
  );
  const artifact = {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId,
    artifactType: "chart",
    roles: ["primary"],
    owner: {
      principalId: "user-1",
      workspacePrincipalId: null,
      visibility: "private",
      originSiteKey: "chart",
      originAppId: null,
      originFunctionId: null,
    },
    access: {
      canRead: true,
      canPreview: true,
      canEdit: true,
      canFork: true,
      canInsert: true,
      canReplace: true,
      canFavorite: true,
      canBind: true,
      canExportSource: true,
    },
    editability: "native",
    editorCapability: "chart-editor",
    sourceFormat: "oceanleo.chart.v1",
    title: "季度收入",
    favorite: false,
    renditions: {
      source: artifactRendition(
        "source",
        revisionId,
        sourceUrl,
        sourceDigest,
      ),
      preview,
      full: { ...preview, purpose: "full" },
    },
    scene: null,
    provenance: {
      id: "provenance-1",
      sourceKind: "owned",
      licenseCode: "owned",
      licenseUrl: "",
      attribution: "",
    },
    bindings: [],
    integrity: { ok: true, code: "ok", reason: "" },
    createdAt: "2026-07-23T00:00:00.000Z",
  };
  return libraryItem({
    key: `artifact:${artifactId}:${revisionId}`,
    id: artifactId,
    artifactId,
    revisionId,
    artifactType: "chart",
    artifact,
    url: preview.url,
    previewUrl: preview.url,
    thumbUrl: preview.url,
    meta: {
      artifact_id: artifactId,
      revision_id: revisionId,
      content_type: "chart",
    },
  });
}

test("canonical load, data/type mutation, new revision save and URL reopen are identical", async () => {
  const firstSourceUrl =
    "https://source.oceanleo.com/chart-root/revision-1.json";
  const nextSourceUrl =
    "https://source.oceanleo.com/chart-root/revision-2.json";
  const nextPreviewUrl =
    "https://source.oceanleo.com/chart-root/revision-2.png";
  const previewBlob = pngBlob();
  const bodies = new Map([
    [firstSourceUrl, JSON.stringify(sourceDocument)],
  ]);
  const fetcher = async (input) => {
    const body = bodies.get(String(input));
    return body
      ? new Response(body, {
          headers: { "content-type": "application/vnd.oceanleo.chart+json" },
        })
      : new Response("", {
          status: 404,
          headers: { "content-type": "application/json" },
        });
  };
  const firstItem = canonicalChartItem(
    "revision-1",
    firstSourceUrl,
    sha256Text(JSON.stringify(sourceDocument)),
  );
  await assert.rejects(
    () =>
      loadChartDocument(
        canonicalChartItem("revision-tampered", firstSourceUrl, "0".repeat(64)),
        { fetcher },
      ),
    (error) =>
      error instanceof ChartSourceError && error.code === "source-digest",
  );
  const loaded = await loadChartDocument(firstItem, { fetcher });
  const withData = replaceChartData(loaded, [
    ["季度", "收入"],
    ["Q1", 135],
    ["Q2", 225],
    ["Q3", 310],
  ]);
  const mutated = patchChartSeries(withData, "revenue", {
    type: "line",
    color: "#0f766e",
    label: { show: true, formatter: "¥{c}" },
  });

  let publishedCommit;
  let uploadedJson = "";
  const saved = await saveChartRevision(
    {
      item: firstItem,
      siteId: "chart",
      editRevision: 2,
      document: mutated,
      workingHeadUrl: firstItem.url,
      title: "季度收入-编辑版",
      previewBlob,
    },
    {
      upload: async (file) => {
        if (file.type === "image/png") {
          assert.deepEqual(
            new Uint8Array(await file.arrayBuffer()),
            new Uint8Array(await previewBlob.arrayBuffer()),
          );
          return { ok: true, data: { file: { url: nextPreviewUrl } } };
        }
        uploadedJson = await file.text();
        bodies.set(nextSourceUrl, uploadedJson);
        return { ok: true, data: { file: { url: nextSourceUrl } } };
      },
      publish: async (artifactId, commit) => {
        assert.equal(artifactId, "chart-root");
        publishedCommit = commit;
        return {
          ok: true,
          data: canonicalChartItem(
            "revision-2",
            nextSourceUrl,
            commit.source.digest,
            nextPreviewUrl,
            commit.renditions.find(
              (rendition) => rendition.purpose === "preview",
            ).digest,
          ),
        };
      },
      saveLegacy: async () => {
        throw new Error("canonical chart must not use legacy creation save");
      },
    },
  );
  assert.equal(saved.previousRevisionId, "revision-1");
  assert.equal(saved.revisionId, "revision-2");
  assert.notEqual(saved.revisionId, saved.previousRevisionId);
  assert.equal(publishedCommit.expectedRevisionId, "revision-1");
  assert.equal(publishedCommit.source.format, "oceanleo.chart.v1");
  assert.match(publishedCommit.source.digest, /^[0-9a-f]{64}$/);
  assert.equal(
    publishedCommit.renditions.find(
      (rendition) => rendition.purpose === "preview",
    ).url,
    nextPreviewUrl,
  );
  assert.equal(
    publishedCommit.provenance.preview_source_digest,
    publishedCommit.source.digest,
  );
  assert.deepEqual(JSON.parse(uploadedJson), saved.document);

  const reopened = await loadChartDocument(saved.item, { fetcher });
  assert.deepEqual(reopened, saved.document);
  assert.deepEqual(reopened.option.xAxis.data, ["Q1", "Q2", "Q3"]);
  assert.deepEqual(reopened.option.series[0].data, [135, 225, 310]);
  assert.equal(reopened.option.series[0].type, "line");
  assert.equal(reopened.option.series[0].color, "#0f766e");
  assert.equal(reopened.option.series[0].label.formatter, "¥{c}");
});

test("expired canonical chart source refreshes the same revision and digest", async () => {
  const oldUrl =
    "https://source.oceanleo.com/chart-root/revision-refresh-old.json";
  const freshUrl =
    "https://source.oceanleo.com/chart-root/revision-refresh-new.json";
  const body = JSON.stringify(sourceDocument);
  const digest = sha256Text(body);
  const stale = canonicalChartItem("revision-refresh", oldUrl, digest);
  stale.artifact.renditions.source.expiresAt =
    "2020-01-01T00:00:00.000Z";
  let refreshes = 0;
  const reopened = await loadChartDocument(stale, {
    now: Date.parse("2026-07-23T00:00:00.000Z"),
    refreshRendition: async (identity, purpose) => {
      refreshes += 1;
      assert.deepEqual(identity, {
        artifactId: "chart-root",
        revisionId: "revision-refresh",
      });
      assert.equal(purpose, "source");
      return {
        ok: true,
        data: artifactRendition(
          "source",
          "revision-refresh",
          freshUrl,
          digest,
        ),
      };
    },
    fetcher: async (url) => {
      assert.equal(String(url), freshUrl);
      return new Response(body, {
        headers: {
          "content-type": "application/vnd.oceanleo.chart+json",
        },
      });
    },
  });
  assert.equal(refreshes, 1);
  assert.deepEqual(reopened, loadSourceDocument());
});

test("consecutive canonical chart saves CAS the returned head", async () => {
  const previewBlob = pngBlob();
  const expectedHeads = [];
  let saveOrdinal = 0;
  const dependencies = {
    upload: async (file) => {
      if (file.type !== "image/png") saveOrdinal += 1;
      const extension = file.type === "image/png" ? "png" : "json";
      return {
        ok: true,
        data: {
          file: {
            url: `https://source.oceanleo.com/chart-root/save-${saveOrdinal}.${extension}`,
          },
        },
      };
    },
    publish: async (publishedArtifactId, commit) => {
      assert.equal(publishedArtifactId, "chart-root");
      expectedHeads.push(commit.expectedRevisionId);
      const preview = commit.renditions.find(
        (rendition) => rendition.purpose === "preview",
      );
      return {
        ok: true,
        data: canonicalChartItem(
          `revision-${saveOrdinal + 1}`,
          commit.source.url,
          commit.source.digest,
          preview.url,
          preview.digest,
        ),
      };
    },
    saveLegacy: async () => {
      throw new Error("canonical chart must not use legacy save");
    },
  };
  const first = await saveChartRevision(
    {
      item: canonicalChartItem(
        "revision-1",
        "https://source.oceanleo.com/chart-root/revision-1.json",
      ),
      siteId: "chart",
      editRevision: 1,
      document: sourceDocument,
      workingHeadUrl: "",
      title: "save one",
      previewBlob,
    },
    dependencies,
  );
  const second = await saveChartRevision(
    {
      item: first.item,
      siteId: "chart",
      editRevision: 2,
      document: {
        ...sourceDocument,
        option: {
          ...sourceDocument.option,
          title: { text: "second" },
        },
      },
      workingHeadUrl: first.url,
      title: "save two",
      previewBlob,
    },
    dependencies,
  );
  assert.equal(second.revisionId, "revision-3");
  assert.deepEqual(expectedHeads, ["revision-1", "revision-2"]);

  const hook = readFileSync(
    new URL(
      "../src/shell/chart-editor/use-chart-workbench.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(hook, /item: artifactHeadRef\.current/);
  assert.match(hook, /artifactHeadRef\.current = result\.item/);
});
