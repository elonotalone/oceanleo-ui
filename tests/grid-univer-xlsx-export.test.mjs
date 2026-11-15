/**
 * W10 —— Univer 快照直接导出 XLSX 的往返：写出去再用 exceljs 读回来，逐项断言。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";

import { buildGridXlsxFromUniverSnapshot } from "../src/shell/doc-editors/grid-univer/xlsx-export.ts";

async function roundTrip(snapshot) {
  const result = await buildGridXlsxFromUniverSnapshot(snapshot, { title: "t" });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await result.blob.arrayBuffer()));
  return { workbook, dropped: result.dropped };
}

function snapshot(sheet, resources = [], extra = {}) {
  return {
    id: "wb",
    name: "wb",
    sheetOrder: ["s1"],
    styles: {},
    sheets: { s1: { id: "s1", name: "Data", rowCount: 20, columnCount: 8, ...sheet } },
    resources,
    ...extra,
  };
}

const res = (name, data) => ({ name, data: JSON.stringify(data) });

test("offline first export does not start a chunk load; online retry preserves the workbook", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const input = snapshot({ cellData: { 0: { 0: { v: 'offline first', t: 1 } } } });
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    await assert.rejects(buildGridXlsxFromUniverSnapshot(input), /网络不通/);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    const { workbook } = await roundTrip(input);
    assert.equal(workbook.worksheets[0].getCell('A1').value, 'offline first');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    const offline = await roundTrip(input);
    assert.equal(offline.workbook.worksheets[0].getCell('A1').value, 'offline first', 'loaded exporter remains available offline');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  }
});

test("数字写成数字，文本写成文本，布尔写成布尔，格式串带过去", async () => {
  const { workbook } = await roundTrip(
    snapshot({
      cellData: {
        0: {
          0: { v: "名称", t: 1 },
          1: { v: 12.5, t: 2, s: { n: { pattern: "0.00" }, bl: 1, bg: { rgb: "#ffeeaa" } } },
          2: { v: 1, t: 3 },
          3: { v: "007", t: 1 },
        },
      },
    }),
  );
  const ws = workbook.getWorksheet("Data");
  assert.equal(ws.getCell("A1").value, "名称");
  assert.equal(ws.getCell("B1").value, 12.5);
  assert.equal(typeof ws.getCell("B1").value, "number");
  assert.equal(ws.getCell("B1").numFmt, "0.00");
  assert.equal(ws.getCell("B1").font.bold, true);
  assert.equal(ws.getCell("B1").fill.fgColor.argb, "FFFFEEAA");
  assert.equal(ws.getCell("C1").value, true);
  assert.equal(ws.getCell("D1").value, "007");
});

test("日期：序列号 + 日期格式串读回来是真日期，不是 46239", async () => {
  const { workbook } = await roundTrip(
    snapshot({
      cellData: {
        3: { 4: { v: 46239, t: 2, s: { n: { pattern: "yyyy-mm-dd" } } } },
        8: { 5: { f: "=E4+10", v: 46249, t: 2, s: { n: { pattern: "yyyy-mm-dd" } } } },
      },
    }),
  );
  const ws = workbook.getWorksheet("Data");
  const e4 = ws.getCell("E4").value;
  assert.ok(e4 instanceof Date, "E4 should read back as a Date");
  assert.equal(e4.toISOString().slice(0, 10), "2026-08-05");
  assert.equal(ws.getCell("E4").numFmt, "yyyy-mm-dd");
  const f9 = ws.getCell("F9").value;
  assert.equal(f9.formula, "E4+10");
  assert.equal(f9.result.toISOString().slice(0, 10), "2026-08-15");
});

test("超链接（外部与工作表内）、合并、列宽行高、冻结窗格", async () => {
  const body = (text, url) => ({
    p: {
      body: {
        dataStream: `${text}\r\n`,
        customRanges: [
          { startIndex: 0, endIndex: text.length - 1, rangeId: "r", rangeType: 0, properties: { url } },
        ],
      },
    },
  });
  const { workbook, dropped } = await roundTrip(
    snapshot({
      cellData: {
        0: { 0: body("官网", "https://example.com/a"), 1: body("回到表头", "#gid=s1&range=C3") },
        2: { 0: { v: "合并", t: 1 } },
      },
      mergeData: [{ startRow: 2, endRow: 3, startColumn: 0, endColumn: 1 }],
      columnData: { 0: { w: materialWidth(120) }, 2: { hd: 1 } },
      rowData: { 1: { h: 40 }, 4: { hd: 1 } },
      freeze: { xSplit: 1, ySplit: 2, startRow: 2, startColumn: 1 },
    }),
  );
  const ws = workbook.getWorksheet("Data");
  assert.equal(ws.getCell("A1").value.hyperlink, "https://example.com/a");
  assert.equal(ws.getCell("A1").value.text, "官网");
  assert.match(ws.getCell("B1").value.hyperlink, /Data.*!C3$/);
  assert.ok(ws.getCell("A3").isMerged);
  assert.equal(ws.getCell("B4").master.address, "A3");
  assert.ok(Math.abs(ws.getColumn(1).width - (120 - 5) / 7) < 0.05);
  assert.equal(ws.getColumn(3).hidden, true);
  assert.ok(Math.abs(ws.getRow(2).height - 30) < 0.05);
  assert.equal(ws.getRow(5).hidden, true);
  const view = ws.views[0];
  assert.equal(view.state, "frozen");
  assert.equal(view.xSplit, 1);
  assert.equal(view.ySplit, 2);
  assert.deepEqual(dropped, []);
});

function materialWidth(px) {
  return px;
}

test("数据验证：下拉列表、数值范围、自定义提示，且按区域展开到每个格子", async () => {
  const { workbook } = await roundTrip(
    snapshot({ cellData: { 0: { 0: { v: "x", t: 1 } } } }, [
      res("SHEET_DATA_VALIDATION_PLUGIN", {
        s1: [
          {
            uid: "a",
            type: "list",
            formula1: "是,否,待定",
            ranges: [{ startRow: 1, endRow: 2, startColumn: 0, endColumn: 0 }],
            allowBlank: true,
            error: "只能选列表里的",
            errorTitle: "不对",
          },
          {
            uid: "b",
            type: "whole",
            operator: "between",
            formula1: "1",
            formula2: "10",
            ranges: [{ startRow: 1, endRow: 1, startColumn: 1, endColumn: 1 }],
            errorStyle: 2,
          },
        ],
      }),
    ]),
  );
  const ws = workbook.getWorksheet("Data");
  const a2 = ws.getCell("A2").dataValidation;
  assert.equal(a2.type, "list");
  assert.deepEqual(a2.formulae, ['"是,否,待定"']);
  assert.equal(a2.error, "只能选列表里的");
  assert.equal(a2.errorTitle, "不对");
  assert.equal(ws.getCell("A3").dataValidation.type, "list");
  assert.equal(ws.getCell("A4").dataValidation, undefined);
  const b2 = ws.getCell("B2").dataValidation;
  assert.equal(b2.type, "whole");
  assert.equal(b2.operator, "between");
  assert.deepEqual(b2.formulae, [1, 10]);
  assert.equal(b2.errorStyle, "warning");
});

test("批注、线程评论、筛选范围、色阶 / 数据条 / 高亮规则", async () => {
  const { workbook, dropped } = await roundTrip(
    snapshot({ cellData: { 0: { 0: { v: 1, t: 2 }, 1: { v: 2, t: 2 } }, 1: { 0: { v: 5, t: 2 } } } }, [
      res("SHEET_NOTE_PLUGIN", { s1: { 0: { 0: { id: "n", row: 0, col: 0, width: 160, height: 60, note: "这是批注" } } } }),
      res("SHEET_UNIVER_THREAD_COMMENT_PLUGIN", {
        s1: [
          {
            id: "c1",
            threadId: "c1",
            ref: "B1",
            personId: "alice",
            text: { dataStream: "请核对\r\n" },
            children: [{ id: "c2", personId: "bob", text: { dataStream: "已核对\r\n" } }],
          },
        ],
      }),
      res("SHEET_FILTER_PLUGIN", {
        s1: { ref: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }, filterColumns: [] },
      }),
      res("SHEET_CONDITIONAL_FORMATTING_PLUGIN", {
        s1: [
          {
            cfId: "x1",
            ranges: [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 0 }],
            stopIfTrue: false,
            rule: {
              type: "colorScale",
              config: [
                { index: 0, color: "#ff0000", value: { type: "min" } },
                { index: 1, color: "#00ff00", value: { type: "max" } },
              ],
            },
          },
          {
            cfId: "x2",
            ranges: [{ startRow: 0, endRow: 1, startColumn: 1, endColumn: 1 }],
            stopIfTrue: false,
            rule: {
              type: "dataBar",
              isShowValue: true,
              config: { min: { type: "min" }, max: { type: "max" }, isGradient: true, positiveColor: "#638ec6", nativeColor: "#ff0000" },
            },
          },
          {
            cfId: "x3",
            ranges: [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }],
            stopIfTrue: false,
            rule: { type: "highlightCell", subType: "number", operator: "between", value: [1, 3], style: { bg: { rgb: "#ffff00" } } },
          },
          {
            cfId: "x4",
            ranges: [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 0 }],
            stopIfTrue: false,
            rule: { type: "highlightCell", subType: "duplicateValues", style: { bg: { rgb: "#ffff00" } } },
          },
        ],
      }),
    ]),
  );
  const ws = workbook.getWorksheet("Data");
  assert.match(String(ws.getCell("A1").note?.texts?.map((t) => t.text).join("") ?? ws.getCell("A1").note), /这是批注/);
  const b1 = ws.getCell("B1").note;
  const b1Text = typeof b1 === "string" ? b1 : b1.texts.map((t) => t.text).join("");
  assert.match(b1Text, /alice: 请核对/);
  assert.match(b1Text, /bob: 已核对/);
  assert.deepEqual(ws.autoFilter, "A1:B2");
  const kinds = ws.conditionalFormattings.flatMap((cf) => cf.rules.map((r) => r.type)).sort();
  assert.deepEqual(kinds, ["cellIs", "colorScale", "dataBar", "duplicateValues"]);
  assert.deepEqual(dropped, [], "重复值规则应保留，不再降级");
});

test("多工作表、隐藏表、定义名称、图片", async () => {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const data = {
    id: "wb",
    name: "wb",
    sheetOrder: ["a", "b"],
    styles: {},
    sheets: {
      a: { id: "a", name: "概览", cellData: { 0: { 0: { v: "hi", t: 1 } } } },
      b: { id: "b", name: "概览", hidden: 1, cellData: {} },
    },
    resources: [
      res("SHEET_DRAWING_PLUGIN", {
        a: {
          data: {
            d1: {
              drawingId: "d1",
              source: png,
              sheetTransform: {
                from: { column: 1, columnOffset: 0, row: 1, rowOffset: 0 },
                to: { column: 3, columnOffset: 0, row: 4, rowOffset: 0 },
              },
            },
          },
        },
      }),
    ],
  };
  const { workbook, dropped } = await roundTrip(data);
  assert.equal(workbook.worksheets.length, 2);
  assert.notEqual(workbook.worksheets[0].name, workbook.worksheets[1].name);
  assert.equal(workbook.worksheets[1].state, "hidden");
  assert.equal(workbook.worksheets[0].getImages().length, 1);
  assert.deepEqual(dropped, []);
});

test("表格对象与筛选条件这类写不出去的东西必须出现在 dropped 里", async () => {
  const { dropped } = await roundTrip(
    snapshot({ cellData: { 0: { 0: { v: "h", t: 1 } } } }, [
      res("SHEET_TABLE_PLUGIN", { s1: [{ id: "t1", name: "T1" }] }),
      res("SHEET_FILTER_PLUGIN", {
        s1: { ref: { startRow: 0, endRow: 3, startColumn: 0, endColumn: 1 }, filterColumns: [{ colId: 0 }] },
      }),
      res("SHEET_DATA_VALIDATION_PLUGIN", {
        s1: [{ uid: "c", type: "checkbox", ranges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }] }],
      }),
    ]),
  );
  assert.ok(dropped.some((line) => line.includes("表格对象")));
  assert.ok(dropped.some((line) => line.includes("筛选条件")));
  assert.ok(dropped.some((line) => line.includes("复选框")));
});

test("段内富文本样式写成 XLSX 富文本，不丢", async () => {
  const { workbook } = await roundTrip(
    snapshot({
      cellData: {
        0: {
          0: {
            p: {
              body: {
                dataStream: "ab粗体\r\n",
                textRuns: [{ st: 2, ed: 4, ts: { bl: 1, cl: { rgb: "#ff0000" } } }],
              },
            },
          },
        },
      },
    }),
  );
  const value = workbook.getWorksheet("Data").getCell("A1").value;
  assert.ok(value.richText, "should be rich text");
  assert.equal(value.richText.map((part) => part.text).join(""), "ab粗体");
  const bold = value.richText.find((part) => part.text === "粗体");
  assert.equal(bold.font.bold, true);
  assert.equal(bold.font.color.argb, "FFFF0000");
});

import { readFileSync } from "node:fs";
import { gridUniverCorePresetConfig } from "../src/shell/doc-editors/grid-univer/stage-plan.ts";
import { univerSnapshotToPreviewSheets } from "../src/shell/doc-editors/grid-univer/xlsx-export.ts";

test("接线：保存与下载直接从 Univer 快照生成 XLSX，不再经过 GridSheet 精简稿", () => {
  const stage = readFileSync(
    new URL("../src/shell/doc-editors/GridUniverStage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(stage, /buildGridXlsxFromUniverSnapshot/);
  assert.doesNotMatch(stage, /buildGridRouteWorkbookBlob/);
  assert.match(stage, /gridXlsxDroppedWarning\(xlsxDropped\)/, "保存后必须把没带过去的东西显示出来");
});

test("功能区撤销 / 重做用 Univer 自己的 menu 配置隐藏，顶栏只留一份", () => {
  const config = gridUniverCorePresetConfig("pro", "container");
  assert.deepEqual(config.menu["univer.command.undo"], { hidden: true });
  assert.deepEqual(config.menu["univer.command.redo"], { hidden: true });
  const stagePlan = readFileSync(
    new URL("../src/shell/doc-editors/grid-univer/stage-plan.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(stagePlan, /undo[^\n]*display:\s*none/i);
});

test("缩略图显示稿：日期按格式串渲染、公式取缓存值，不是序列号", () => {
  const [sheet] = univerSnapshotToPreviewSheets(
    snapshot({
      cellData: {
        0: {
          0: { v: 46239, t: 2, s: { n: { pattern: "yyyy-mm-dd" } } },
          1: { f: "=A1+10", v: 46249, t: 2, s: { n: { pattern: "yyyy-mm-dd" } } },
          2: { v: "文本", t: 1 },
        },
      },
    }),
  );
  assert.equal(sheet.rows[0][0], "2026-08-05");
  assert.equal(sheet.rows[0][1], "2026-08-15");
  assert.equal(sheet.rows[0][2], "文本");
});

test("定义名称写进工作簿；写不进去的会报，不吞", async () => {
  const { workbook, dropped } = await roundTrip(
    snapshot({ cellData: { 0: { 0: { v: 1, t: 2 } } } }, [
      res("SHEET_DEFINED_NAME_PLUGIN", {
        n1: { id: "n1", name: "Total", formulaOrRefString: "Data!$A$1:$A$3" },
      }),
    ]),
  );
  assert.ok(workbook.definedNames.getRanges("Total").ranges.length >= 1);
  assert.deepEqual(dropped, []);
});

test("exceljs 没有的比较 / 文本运算符改写成等价公式规则", async () => {
  const hl = (cfId, rule) => ({
    cfId,
    ranges: [{ startRow: 1, endRow: 5, startColumn: 2, endColumn: 2 }],
    stopIfTrue: false,
    rule: { type: "highlightCell", style: { bg: { rgb: "#ffff00" } }, ...rule },
  });
  const { workbook, dropped } = await roundTrip(
    snapshot({ cellData: { 1: { 2: { v: 1, t: 2 } } } }, [
      res("SHEET_CONDITIONAL_FORMATTING_PLUGIN", {
        s1: [
          hl("a", { subType: "number", operator: "greaterThanOrEqual", value: 5 }),
          hl("b", { subType: "number", operator: "notBetween", value: [1, 3] }),
          hl("c", { subType: "text", operator: "beginsWith", value: "ab" }),
          hl("d", { subType: "text", operator: "notContainsText", value: "x" }),
        ],
      }),
    ]),
  );
  const rules = workbook.getWorksheet("Data").conditionalFormattings.flatMap((cf) => cf.rules);
  assert.equal(rules.length, 4);
  assert.ok(rules.every((r) => r.type === "expression"));
  const formulas = rules.map((r) => r.formulae[0]);
  assert.ok(formulas.includes("C2>=5"));
  assert.ok(formulas.includes("OR(C2<1,C2>3)"));
  assert.ok(formulas.includes('LEFT(C2,2)="ab"'));
  assert.deepEqual(dropped, []);
});

test("旧规则能力迁入当前写入器：空白、唯一 / 重复值、禁用与命中后停止均保留", async () => {
  const { unzipSync, strFromU8 } = await import("fflate");
  const range = { startRow: 0, endRow: 2, startColumn: 0, endColumn: 0 };
  const rule = (cfId, subType, extra = {}, settings = {}) => ({
    cfId, ranges: [range], ...settings,
    rule: { type: "highlightCell", subType, style: { bg: { rgb: "#ffeeaa" } }, ...extra },
  });
  const input = snapshot({ cellData: { 0: { 0: { v: "重复" } }, 1: { 0: { v: "重复" } } } }, [
    res("SHEET_CONDITIONAL_FORMATTING_PLUGIN", { s1: [
      rule("disabled", "duplicateValues", {}, { disabled: true }),
      rule("blank", "text", { operator: "containsBlanks" }, { stopIfTrue: true }),
      rule("not-blank", "text", { operator: "notContainsBlanks" }),
      rule("duplicates", "duplicateValues", {}, { ranges: [range, { ...range, startColumn: 2, endColumn: 2 }] }),
      rule("unique", "uniqueValues"),
      rule("rank", "rank", { value: 2 }, { stopIfTrue: true }),
    ] }),
  ]);
  const exported = await buildGridXlsxFromUniverSnapshot(input);
  assert.equal(exported.dropped.length, 1);
  assert.match(exported.dropped[0], /已停用/);
  const files = unzipSync(new Uint8Array(await exported.blob.arrayBuffer()));
  const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /<cfRule[^>]*type="containsBlanks"[^>]*priority="1"[^>]*stopIfTrue="1"/);
  assert.match(xml, /<cfRule[^>]*type="notContainsBlanks"[^>]*priority="2"/);
  assert.match(xml, /<cfRule[^>]*type="duplicateValues"[^>]*priority="3"[^>]*\/>/);
  assert.match(xml, /<cfRule[^>]*type="uniqueValues"[^>]*priority="4"[^>]*\/>/);
  assert.doesNotMatch(xml, /COUNTIF|<formula>FALSE<\/formula>/);
  assert.match(xml, /<cfRule[^>]*type="top10"[^>]*priority="5"[^>]*stopIfTrue="1"\s*\/>/);
  const opened = new ExcelJS.Workbook();
  await opened.xlsx.load(Buffer.from(await exported.blob.arrayBuffer()));
  const rules = opened.worksheets[0].conditionalFormattings.flatMap((cf) => cf.rules);
  assert.equal(rules.length, 5);
});

test("旧写入器的署名随文件和固定时间导出能力在当前 XLSX 路径可用", async () => {
  const { unzipSync, strFromU8 } = await import("fflate");
  const input = snapshot({ name: "署名", cellData: { 0: { 0: { v: "用户原表" } } } });
  const attribution = { entries: [{ text: "作者 <A> & B", licenseCode: "CC-BY-4.0", licenseUrl: "https://example.test/license?a=1&b=2" }] };
  const options = { title: "许可随产物", attribution, createdAt: new Date("2026-01-01T00:00:00Z") };
  const first = await buildGridXlsxFromUniverSnapshot(input, options);
  const second = await buildGridXlsxFromUniverSnapshot(input, options);
  const bytes = new Uint8Array(await first.blob.arrayBuffer());
  assert.deepEqual(bytes, new Uint8Array(await second.blob.arrayBuffer()));
  const files = unzipSync(bytes);
  const props = strFromU8(files["docProps/custom.xml"]);
  assert.match(props, /name="License"/);
  assert.match(props, /CC-BY-4.0/);
  assert.match(props, /作者 &lt;A&gt; &amp; B/);
  assert.match(props, /a=1&amp;b=2/);
  assert.match(strFromU8(files["[Content_Types].xml"]), /PartName="\/docProps\/custom.xml"/);
  assert.match(strFromU8(files["_rels/.rels"]), /custom-properties" Target="docProps\/custom.xml"/);
  const opened = new ExcelJS.Workbook();
  await opened.xlsx.load(Buffer.from(bytes));
  assert.deepEqual(opened.worksheets.map((sheet) => sheet.name), ["署名", "署名 (2)"]);
  assert.equal(opened.worksheets[0].getCell("A1").value, "用户原表");
  assert.deepEqual(opened.worksheets[1].getRow(2).values.slice(1), Object.values(attribution.entries[0]));
  assert.match(opened.description, /CC-BY-4.0/);
  assert.equal(opened.created.toISOString(), options.createdAt.toISOString());
});

test("下拉验证的命名区域引用写成公式，不改写成一个字面选项", async () => {
  const { workbook, dropped } = await roundTrip(snapshot({ cellData: { 0: { 0: { v: "A" } } } }, [
    res("SHEET_DEFINED_NAME_PLUGIN", { list: { name: "Allowed", formulaOrRefString: "Data!$A$1:$A$2" } }),
    res("SHEET_DATA_VALIDATION_PLUGIN", { s1: [{ uid: "list", type: "list", formula1: "=Allowed", ranges: [{ startRow: 2, endRow: 2, startColumn: 0, endColumn: 0 }] }] }),
  ]));
  assert.deepEqual(workbook.worksheets[0].getCell("A3").dataValidation.formulae, ["Allowed"]);
  assert.deepEqual(dropped, []);
});

test("缺少公式缓存时按旧能力补算跨表、命名区域和共享公式，已有缓存保持原值", async () => {
  const input = snapshot({ name: "汇总", cellData: {
    0: { 0: { f: "='明细'!A1*2", si: "shared" }, 1: { f: "=Total+1" }, 2: { f: "=SUM(A1:B1)", v: 99 }, 3: { f: "=NOT_A_REAL_FUNCTION(1)" } },
    1: { 0: { si: "shared" } },
  } }, [res("SHEET_DEFINED_NAME_PLUGIN", { n: { name: "Total", formulaOrRefString: "'明细'!$A$1" } })]);
  input.sheetOrder.push("s2");
  input.sheets.s2 = { id: "s2", name: "明细", cellData: { 0: { 0: { v: 12.5 } }, 1: { 0: { v: 7 } } } };
  const { workbook, dropped } = await roundTrip(input);
  const ws = workbook.getWorksheet("汇总");
  assert.equal(ws.getCell("A1").value.result, 25);
  assert.equal(ws.getCell("A2").value.result, 14);
  assert.equal(ws.getCell("B1").value.result, 13.5);
  assert.equal(ws.getCell("C1").value.result, 99, "已有缓存由 Univer 提供，不覆盖");
  assert.equal(ws.getCell("D1").value.formula, "NOT_A_REAL_FUNCTION(1)");
  assert.equal(ws.getCell("D1").value.result, undefined);
  assert.equal(dropped.length, 1);
  assert.match(dropped[0], /D1.*缺少缓存值/);
});

test("公式补算按用户表名查找；另一张表的内部 ID 不覆盖同名工作表", async () => {
  const input = snapshot({ name: "s2", cellData: { 0: { 0: { v: 7 }, 1: { f: "=A1*2" } } } });
  input.sheetOrder.push("s2");
  input.sheets.s2 = { id: "s2", name: "Data", cellData: { 0: { 0: { v: 100 }, 1: { f: "=s2!A1+1" } } } };
  const { workbook, dropped } = await roundTrip(input);
  assert.equal(workbook.getWorksheet("s2").getCell("B1").value.result, 14);
  assert.equal(workbook.getWorksheet("Data").getCell("B1").value.result, 8);
  assert.deepEqual(dropped, []);
});
