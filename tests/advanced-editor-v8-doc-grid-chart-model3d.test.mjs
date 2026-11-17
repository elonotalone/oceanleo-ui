// NOTE: file name kept for history; the chart editor was deleted 2026-10-22, only doc/grid/3D cases remain.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import { unzipSync } from "fflate";

import { tiptapJsonToDocxBlob } from "../src/shell/doc-editors/docx-export.ts";

register("./ts-extension-loader.mjs", import.meta.url);
const { buildGridXlsxFromUniverSnapshot } = await import(
  "../src/shell/doc-editors/grid-univer/xlsx-export.ts"
);
const { gridSheetsToUniverSnapshot } = await import(
  "../src/shell/doc-editors/grid-univer/snapshot.ts"
);

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

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

test("Grid formulas, formats, merges and sheets survive XLSX", async () => {
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
  const { data } = gridSheetsToUniverSnapshot(sheets);
  // 真实快照的公式缓存由 Univer 计算；夹具给定对应结果。
  data.sheets.budget.cellData[1][2].v = 135.6;
  data.resources = [{ name: "SHEET_FILTER_PLUGIN", data: JSON.stringify({
    budget: { ref: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 2 } },
  }) }];
  const { blob } = await buildGridXlsxFromUniverSnapshot(data);
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
  // 路由级 undo/redo（GridRouteHistory）已随旧核删除：Univer 自带撤销栈，
  // 宿主只转发 `api.undo()` / `api.redo()`（GridUniverStage）。
});
