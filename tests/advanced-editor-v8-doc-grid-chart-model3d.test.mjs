import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import { unzipSync } from "fflate";

import {
  chartDocumentFromCsv,
  chartDocumentFromJson,
  chartDocumentToJson,
  normalizeChartDocument,
  patchChartSeries,
  replaceChartData,
} from "../src/shell/chart-editor/chart-schema.ts";
import { ChartDocumentHistory } from "../src/shell/chart-editor/chart-history.ts";
import {
  chartExportOption,
  chartRenderOption,
} from "../src/shell/chart-editor/chart-render.ts";
import {
  GridRouteHistory,
  captureGridRouteSnapshot,
} from "../src/shell/doc-editors/GridRouteHistory.ts";
import { tiptapJsonToDocxBlob } from "../src/shell/doc-editors/docx-export.ts";
import {
  Model3DRouteHistory,
  captureModel3DRouteSnapshot,
} from "../src/shell/media-editors/Model3DRouteHistory.ts";

register("./ts-extension-loader.mjs", import.meta.url);
const { buildGridRouteWorkbookBlob } = await import(
  "../src/shell/doc-editors/GridWorkbookExport.ts"
);

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("v8 routes expose one real global history and semantic compact controls", () => {
  const richRoute = source("../src/shell/advanced-routes/RichDocRoute.tsx");
  const gridRoute = source("../src/shell/advanced-routes/GridRoute.tsx");
  const chartRoute = source("../src/shell/advanced-routes/ChartRoute.tsx");
  const modelRoute = source("../src/shell/advanced-routes/Model3DRoute.tsx");
  const richToolbar = source(
    "../src/shell/doc-editors/RichDocContextToolbar.tsx",
  );
  const gridToolbar = source(
    "../src/shell/doc-editors/GridContextToolbar.tsx",
  );
  const chartToolbar = source(
    "../src/shell/chart-editor/ChartContextToolbar.tsx",
  );
  const modelToolbar = source(
    "../src/shell/media-editors/Model3DContextToolbar.tsx",
  );

  for (const route of [richRoute, gridRoute, chartRoute, modelRoute]) {
    assert.match(route, /history: \{/);
    assert.match(route, /recovery: \{/);
    assert.match(route, /directDownload: \{/);
  }
  assert.doesNotMatch(richToolbar, /case "undo"|case "redo"/);
  assert.doesNotMatch(modelToolbar, /id: "undo"|id: "redo"/);
  assert.match(modelRoute, /showNativeControls=\{false\}/);
  assert.match(modelRoute, /showDeliveryActions=\{false\}/);
  assert.match(modelRoute, /model3d-download-screenshot/);
  assert.match(modelRoute, /assertBlobSource\(blob, "model3d"\)/);
  assert.match(modelRoute, /actualFormat === "gltf"/);
  assert.match(modelRoute, /editor\.openModelUrl\(\s*url,\s*actualFormat,/);
  assert.match(modelRoute, /material\.artifactId && material\.revisionId/);
  assert.match(modelRoute, /editor\.saveCopy\(\)/);
  assert.match(modelRoute, /editor\.downloadModel/);
  assert.match(modelRoute, /checkpoint-glb\+operation-journal/);
  assert.match(modelRoute, /model_dependency_base_url/);
  assert.match(modelRoute, /model_source_identity/);

  for (const toolbar of [richToolbar, gridToolbar, chartToolbar, modelToolbar]) {
    assert.match(toolbar, /iconOnly: true/);
    assert.match(toolbar, /selectionRevision/);
    assert.match(toolbar, /editRevision/);
  }
  assert.match(richToolbar, /"embedded-object"/);
  assert.match(richToolbar, /id: "link"/);
  assert.match(richToolbar, /id: "row-add"/);
  assert.match(gridToolbar, /"grid-row"/);
  assert.match(gridToolbar, /"grid-column"/);
  assert.match(chartToolbar, /"chart-series"/);
  assert.match(modelToolbar, /placement: "more"/);
});

test("Chart data, stable series, legend, history and export projection roundtrip", () => {
  const initial = normalizeChartDocument({
    title: { text: "季度收入" },
    legend: { show: true, position: "bottom", data: ["过期名称"] },
    xAxis: { type: "category", data: ["Q1", "Q2"] },
    yAxis: { type: "value" },
    series: [
      {
        id: "revenue",
        name: "收入",
        type: "bar",
        data: [120, 180],
        label: { show: false },
      },
    ],
  });
  assert.deepEqual(initial.option.legend.data, ["收入"]);

  const renamed = patchChartSeries(initial, "revenue", {
    name: "营业收入",
    color: "#7c3aed",
    label: { show: true },
  });
  const normalized = chartDocumentFromJson(chartDocumentToJson(renamed));
  assert.deepEqual(normalized.option.legend.data, ["营业收入"]);
  assert.equal(normalized.option.series[0].id, "revenue");

  const render = chartRenderOption(normalized.option);
  const exported = chartExportOption(normalized.option);
  assert.equal(render.legend.bottom, 8);
  assert.equal("position" in render.legend, false);
  assert.equal(exported.animation, false);
  assert.deepEqual(exported.series, render.series);
  assert.deepEqual(exported.legend, render.legend);

  const history = new ChartDocumentHistory();
  history.record(initial, normalized);
  assert.equal(history.canUndo, true);
  const undone = history.undo(normalized);
  assert.equal(undone.option.series[0].name, "收入");
  assert.equal(history.canRedo, true);
  const redone = history.redo(undone);
  assert.equal(redone.option.series[0].name, "营业收入");

  const csv = chartDocumentFromCsv(
    '季度,"营业收入,含税",利润\r\nQ1,130,40\r\n"Q2,调整",210,70',
  );
  assert.deepEqual(csv[0], ["季度", "营业收入,含税", "利润"]);
  assert.deepEqual(csv[2], ["Q2,调整", 210, 70]);
  const tsv = chartDocumentFromCsv("季度\t收入\nQ1\t120\nQ2\t180");
  assert.deepEqual(tsv[2], ["Q2", 180]);
  assert.throws(() => chartDocumentFromCsv('季度,"收入\nQ1,120'), /引号/);

  const replaced = replaceChartData(normalized, csv);
  assert.deepEqual(replaced.option.xAxis.data, ["Q1", "Q2,调整"]);
  assert.deepEqual(
    replaced.option.legend.data,
    replaced.option.series.map((series) => series.name),
  );

  const duplicateIds = normalizeChartDocument({
    xAxis: { type: "category", data: ["Q1"] },
    yAxis: { type: "value" },
    series: [
      { id: "revenue", name: "收入", type: "bar", data: [120] },
      { id: "revenue", name: "利润", type: "line", data: [40] },
    ],
  });
  assert.deepEqual(
    duplicateIds.option.series.map((series) => series.id),
    ["revenue", "revenue-2"],
  );
  assert.deepEqual(chartDocumentFromCsv('名称,值\n"""含引号""",1')[1], [
    '"含引号"',
    1,
  ]);
});

test("RichDoc table, link and inline formats survive a real DOCX package", async () => {
  const document = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2, textAlign: "center" },
        content: [
          {
            type: "text",
            text: "交付说明",
            marks: [
              { type: "bold" },
              { type: "textStyle", attrs: { color: "#123456" } },
              {
                type: "link",
                attrs: { href: "https://oceanleo.com/docs" },
              },
            ],
          },
        ],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "项目" }],
                  },
                ],
              },
              {
                type: "tableHeader",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "状态" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const reopened = JSON.parse(JSON.stringify(document));
  assert.deepEqual(reopened, document);

  const blob = await tiptapJsonToDocxBlob("高级文档", reopened);
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml = new TextDecoder().decode(files["word/document.xml"]);
  const relationships = new TextDecoder().decode(
    files["word/_rels/document.xml.rels"],
  );
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<w:b\/>/);
  assert.match(xml, /w:color w:val="123456"/);
  assert.match(xml, /<w:hyperlink/);
  assert.match(relationships, /https:\/\/oceanleo\.com\/docs/);
});

test("Grid formulas, formats, merges and sheets survive XLSX plus route undo", async () => {
  const sheets = [
    {
      id: "budget",
      name: "预算",
      rows: [
        ["项目", "金额", "含税金额"],
        ["收入", "120", "=B2*1.13"],
      ],
      formats: {
        "0:0": { bold: true, background: "#e0e7ff" },
        "1:1": {
          type: "currency",
          decimals: 2,
          color: "#166534",
          align: "right",
        },
        "1:2": { type: "currency", decimals: 2 },
      },
      merges: [
        { firstRow: 0, lastRow: 0, firstCol: 0, lastCol: 1 },
      ],
      conditionalFormats: [],
    },
    {
      id: "notes",
      name: "说明",
      rows: [["备注"], ["公式与格式必须保留"]],
      formats: {},
      merges: [],
      conditionalFormats: [],
    },
  ];
  const blob = await buildGridRouteWorkbookBlob(sheets, { headerRow: true });
  const importedExcelJS = await import("exceljs");
  const ExcelJS =
    "Workbook" in importedExcelJS ? importedExcelJS : importedExcelJS.default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["预算", "说明"],
  );
  const budget = workbook.getWorksheet("预算");
  assert.equal(budget.getCell("C2").value.formula, "B2*1.13");
  assert.equal(budget.getCell("C2").value.result, 135.6);
  assert.match(budget.getCell("B2").numFmt, /¥/);
  assert.equal(budget.getCell("B2").font.color.argb, "FF166534");
  assert.equal(budget.getCell("A1").isMerged, true);
  assert.equal(budget.getCell("A1").value, "项目");
  assert.ok(budget.autoFilter);

  const editorState = {
    sheets,
    activeSheetId: "budget",
    headerRow: true,
    filterQuery: "",
    selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
  };
  const before = captureGridRouteSnapshot(editorState);
  const after = {
    ...before,
    headerRow: false,
    sheets: JSON.parse(JSON.stringify(before.sheets)),
  };
  after.sheets[0].rows.splice(1, 0, ["成本", "40", "=B2*1.13"]);
  const history = new GridRouteHistory();
  history.reset(0, before);
  assert.equal(history.observe(1, after), true);
  assert.equal(history.undo(after).headerRow, true);
  assert.equal(history.redo(before).sheets[0].rows.length, 3);
});

test("Model3D authored state history preserves viewport while undoing scene state", () => {
  const editor = {
    sourceUrl: "https://asset.oceanleo.com/model.glb",
    operationJournal: [],
    azimuth: 35,
    elevation: 65,
    zoom: 110,
    autoRotate: false,
    exposure: 1,
    shadowIntensity: 1,
    shadowSoftness: 1,
    shadowEnabled: true,
    background: "#f5f5f4",
    animationName: "Idle",
    animationPlaying: false,
    animationSpeed: 1,
    animationTime: 0,
    environmentUrl: "",
    environmentIntensity: 1,
    annotations: [],
  };
  const initial = captureModel3DRouteSnapshot(editor);
  const navigated = {
    ...initial,
    view: { ...initial.view, zoom: 240, azimuth: 80 },
  };
  const edited = {
    ...navigated,
    operations: [
      {
        id: "material-1",
        kind: "material",
        target: "base:0",
        materialIndex: 0,
        value: { color: "#33aa77", metalness: 0.6, roughness: 0.3 },
      },
    ],
    view: {
      ...navigated.view,
      background: "#112233",
      animationSpeed: 1.5,
      environmentUrl: "https://asset.oceanleo.com/studio.hdr",
    },
  };
  const history = new Model3DRouteHistory();
  history.reset(0, initial);
  assert.equal(history.observe(1, navigated), false);
  assert.equal(history.canUndo, false, "viewport navigation is not document history");
  assert.equal(history.observe(2, edited), true);
  const undone = history.undo(edited);
  assert.equal(undone.view.background, initial.view.background);
  assert.equal(undone.view.zoom, 240);
  assert.equal(undone.view.azimuth, 80);
  assert.equal(undone.operations.length, 0);
  const redone = history.redo(undone);
  assert.equal(redone.view.background, "#112233");
  assert.equal(redone.view.animationSpeed, 1.5);
  assert.equal(redone.operations[0].kind, "material");
  const reopenedProject = JSON.parse(
    JSON.stringify({
      schema: "oceanleo.model3d.project.v2",
      checkpointUrl: redone.checkpointUrl,
      operations: redone.operations,
      view: redone.view,
    }),
  );
  assert.equal(reopenedProject.checkpointUrl, editor.sourceUrl);
  assert.equal(reopenedProject.operations[0].target, "base:0");
  assert.equal(reopenedProject.view.background, "#112233");
});
