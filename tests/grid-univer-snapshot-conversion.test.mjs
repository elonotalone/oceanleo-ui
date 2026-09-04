/**
 * W03 判据 4/5 —— 存量载体 ⇄ Univer 快照双向，以及「只读打开 + 一键转换」。
 *
 * 这份闸的重点不是「转换跑通了」，是**转换不许静默丢东西**：
 * 每一条带不过去的内容都要出现在报数里，否则用户是在一个悄悄少了数据的文件上
 * 继续工作。往返（round-trip）断言是这件事唯一的证明方式。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GRID_UNIVER_APP_VERSION,
  GRID_UNIVER_MIN_COLS,
  GRID_UNIVER_MIN_ROWS,
  gridFormatToUniverStyle,
  gridSheetsToUniverSnapshot,
  gridUniverOutboundWarning,
  univerSnapshotToGridSheets,
  univerStyleToGridFormat,
} from "../src/shell/doc-editors/grid-univer/snapshot.ts";
import {
  GRID_LEGACY_PROJECT_SCHEMA,
  GRID_LEGACY_READONLY_NOTICE,
  GRID_UNIVER_MAX_COLS,
  GRID_UNIVER_MAX_ROWS,
  GRID_UNIVER_PROJECT_SCHEMA,
  describeGridConversion,
  nextGridConversionState,
  planGridLegacyConversion,
} from "../src/shell/doc-editors/grid-univer/legacy-conversion.ts";

function sheet(overrides = {}) {
  return {
    id: "s1",
    name: "Sheet1",
    rows: [
      ["名称", "数量"],
      ["苹果", "3"],
    ],
    formats: {},
    merges: [],
    conditionalFormats: [],
    ...overrides,
  };
}

test("数字存成数字、文本存成文本、公式存成公式——三种各自的落点不同", () => {
  const { data, report } = gridSheetsToUniverSnapshot([
    sheet({
      rows: [
        ["苹果", "3", "=B1*2"],
      ],
    }),
  ]);
  const cells = data.sheets.s1.cellData;
  assert.equal(cells[0][0].v, "苹果");
  assert.equal(cells[0][0].t, 1, "字符串类型");
  assert.equal(cells[0][1].v, 3, "「3」要存成数字 3，不是字符串");
  assert.equal(cells[0][1].t, 2, "数字类型");
  assert.equal(cells[0][2].f, "=B1*2", "公式进 f 而不是 v");
  assert.equal(report.formulas, 1);
  assert.equal(report.cells, 3);
  assert.equal(data.appVersion, GRID_UNIVER_APP_VERSION);
});

test("本地化数字串不许猜——「1,234」在不同地区含义相反，存成文本", () => {
  const { data } = gridSheetsToUniverSnapshot([
    sheet({ rows: [["1,234", "1.5e3", " 42 "]] }),
  ]);
  const cells = data.sheets.s1.cellData;
  assert.equal(cells[0][0].v, "1,234", "带千分位的串猜错就是静默改数据");
  assert.equal(cells[0][0].t, 1);
  assert.equal(cells[0][1].v, 1500, "科学计数法整串是个有限数，可以当数字");
  assert.equal(cells[0][2].v, 42, "两侧空白不影响它就是一个数");
});

test("单个 = 不是公式（用户可能只是打了个等号）", () => {
  const { data, report } = gridSheetsToUniverSnapshot([
    sheet({ rows: [["="]] }),
  ]);
  assert.equal(data.sheets.s1.cellData[0][0].f, undefined);
  assert.equal(data.sheets.s1.cellData[0][0].v, "=");
  assert.equal(report.formulas, 0);
});

test("样式往返：写进去的每一项都能原样取回来", () => {
  const format = {
    bold: true,
    align: "right",
    color: "#ff0000",
    background: "#00ff00",
    numFmt: "#,##0.00",
  };
  const style = gridFormatToUniverStyle(format);
  assert.equal(style.bl, 1);
  assert.equal(style.ht, 3, "right = 3");
  assert.equal(style.cl.rgb, "#ff0000");
  assert.equal(style.bg.rgb, "#00ff00");
  assert.equal(style.n.pattern, "#,##0.00");
  assert.deepEqual(univerStyleToGridFormat(style), format);
});

test("三种对齐各自的枚举值对得上，反向也一致", () => {
  for (const [align, ht] of [["left", 1], ["center", 2], ["right", 3]]) {
    const style = gridFormatToUniverStyle({ align });
    assert.equal(style.ht, ht, align);
    assert.equal(univerStyleToGridFormat(style).align, align);
  }
});

test("没有任何样式的格子不产出空样式对象", () => {
  assert.equal(gridFormatToUniverStyle(undefined), null);
  assert.equal(gridFormatToUniverStyle({}), null);
  assert.equal(univerStyleToGridFormat(null), null);
  assert.equal(univerStyleToGridFormat(undefined), null);
  // Univer 的 `s` 可以是样式 id 字符串；那种情况这里取不到样式，不该编一个。
  assert.equal(univerStyleToGridFormat("style-id-1"), null);
});

test("Univer 的 Nullable 含 void——传 void 进来要当没有样式，不许炸", () => {
  const nothing = (() => {})();
  assert.equal(univerStyleToGridFormat(nothing), null);
});

test("合并区域两个方向的字段名对得上（错一个字就是合并跑到别处）", () => {
  const merges = [{ firstRow: 1, lastRow: 2, firstCol: 3, lastCol: 4 }];
  const { data, report } = gridSheetsToUniverSnapshot([sheet({ merges })]);
  assert.deepEqual(data.sheets.s1.mergeData, [
    { startRow: 1, endRow: 2, startColumn: 3, endColumn: 4 },
  ]);
  assert.equal(report.merges, 1);
  assert.deepEqual(univerSnapshotToGridSheets(data)[0].merges, merges);
});

test("稀疏 cellData 摊平成稠密二维数组：缺的格子是空串而不是 undefined", () => {
  const restored = univerSnapshotToGridSheets({
    sheetOrder: ["s1"],
    sheets: {
      s1: {
        id: "s1",
        name: "Sheet1",
        cellData: { 3: { 2: { v: "x", t: 1 } } },
      },
    },
  });
  const rows = restored[0].rows;
  assert.equal(rows[3][2], "x");
  // 调用点会做 `rows[r][c].trim()`；undefined 会当场炸。
  assert.equal(rows[0][0], "");
  for (const row of rows) {
    for (const cell of row) assert.equal(typeof cell, "string");
  }
});

test("空表补到最小尺寸，和旧核空表观感一致", () => {
  const { data } = gridSheetsToUniverSnapshot([sheet({ rows: [] })]);
  assert.equal(data.sheets.s1.rowCount, GRID_UNIVER_MIN_ROWS);
  assert.equal(data.sheets.s1.columnCount, GRID_UNIVER_MIN_COLS);
});

test("同一份文档反复转换得到同一个工作簿 id（否则每次转都像换了个文件）", () => {
  const first = gridSheetsToUniverSnapshot([sheet()]);
  const second = gridSheetsToUniverSnapshot([sheet()]);
  assert.equal(first.data.id, second.data.id);
});

test("多表：sheetOrder 保序，反向按 order 还原", () => {
  const { data } = gridSheetsToUniverSnapshot([
    sheet({ id: "a", name: "A" }),
    sheet({ id: "b", name: "B" }),
  ]);
  assert.deepEqual(data.sheetOrder, ["a", "b"]);
  assert.deepEqual(
    univerSnapshotToGridSheets(data).map((entry) => entry.id),
    ["a", "b"],
  );
});

test("条件格式带不过去，但必须点名——静默丢是这份闸要拦的头号问题", () => {
  const { report } = gridSheetsToUniverSnapshot([
    sheet({
      conditionalFormats: [
        { id: "c1", range: { firstRow: 0, lastRow: 1, firstCol: 0, lastCol: 1 } },
        { id: "c2", range: { firstRow: 2, lastRow: 3, firstCol: 0, lastCol: 1 } },
      ],
    }),
  ]);
  assert.equal(report.dropped.length, 1);
  assert.match(report.dropped[0], /2 条/);
  // 报数说成人话时，带不过去的东西一定出现。
  assert.match(describeGridConversion(report), /没有带过去/);
});

test("没有丢东西时，那句话里不该出现「没有带过去」", () => {
  const { report } = gridSheetsToUniverSnapshot([sheet()]);
  assert.deepEqual(report.dropped, []);
  const summary = describeGridConversion(report);
  assert.doesNotMatch(summary, /没有带过去/);
  assert.match(summary, /1 张工作表/);
});

test("判据 5：状态机没有任何一条边能从「打开」直接走到「已改写」", () => {
  // 这是整台状态机的全部意义：只有用户按下那一下（request）才离开只读。
  for (const event of ["resolve", "reject", "retry"]) {
    assert.equal(nextGridConversionState("readonly", { type: event }), "readonly");
  }
  assert.equal(
    nextGridConversionState("readonly", { type: "request" }),
    "converting",
  );
  assert.equal(
    nextGridConversionState("converting", { type: "resolve" }),
    "converted",
  );
  assert.equal(
    nextGridConversionState("converting", { type: "reject" }),
    "failed",
  );
  assert.equal(nextGridConversionState("failed", { type: "retry" }), "converting");
  // 转换是一次性的：已在新核里的文档再「转换」一次只会多出一份漂移。
  assert.equal(
    nextGridConversionState("converted", { type: "request" }),
    "converted",
  );
});

test("判据 5：两个 schema 值不同，「转过没转过」才一眼可查", () => {
  assert.notEqual(GRID_LEGACY_PROJECT_SCHEMA, GRID_UNIVER_PROJECT_SCHEMA);
  assert.match(GRID_UNIVER_PROJECT_SCHEMA, /univer/);
  // 只读那句话要告诉用户「现在是只读」以及「按哪一下才会改」。
  assert.match(GRID_LEGACY_READONLY_NOTICE, /只读/);
  assert.match(GRID_LEGACY_READONLY_NOTICE, /转换/);
});

test("判据 5：planGridLegacyConversion 是纯函数，不改入参", () => {
  const input = [sheet()];
  const snapshot = JSON.stringify(input);
  planGridLegacyConversion({ sheets: input });
  assert.equal(JSON.stringify(input), snapshot, "算一遍就改了用户的文档");
});

test("判据 5：转不了要给能照着做的原因，不是「转换失败」四个字", () => {
  const empty = planGridLegacyConversion({ sheets: [] });
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /一张工作表都没有/);

  const tall = planGridLegacyConversion({
    sheets: [
      sheet({
        name: "很长的表",
        rows: Array.from({ length: GRID_UNIVER_MAX_ROWS + 1 }, () => ["x"]),
      }),
    ],
  });
  assert.equal(tall.ok, false);
  assert.match(tall.reason, /很长的表/, "要点名是哪张表");
  assert.match(tall.reason, new RegExp(String(GRID_UNIVER_MAX_ROWS)));
  assert.match(tall.reason, /拆表|删掉空行/, "要给下一步动作");

  const wide = planGridLegacyConversion({
    sheets: [
      sheet({
        name: "很宽的表",
        rows: [Array.from({ length: GRID_UNIVER_MAX_COLS + 1 }, () => "x")],
      }),
    ],
  });
  assert.equal(wide.ok, false);
  assert.match(wide.reason, /很宽的表/);
});

test("判据 5：未知 schema 允许试转，但要在报数里点名", () => {
  const outcome = planGridLegacyConversion({
    sheets: [sheet()],
    schema: "oceanleo.grid.v0-experimental",
  });
  assert.equal(outcome.ok, true);
  assert.ok(
    outcome.report.dropped.some((line) => line.includes("v0-experimental")),
    "读了一份不认识格式的文件却不告诉用户，是最容易丢数据的一种",
  );
  // 认得的 schema 不该产生这条噪音。
  const known = planGridLegacyConversion({
    sheets: [sheet()],
    schema: GRID_LEGACY_PROJECT_SCHEMA,
  });
  assert.deepEqual(known.report.dropped, []);
});

test("判据 4：Univer 快照 → GridSheet[] 供既有 exceljs 导出链消费", () => {
  const { data } = gridSheetsToUniverSnapshot([
    sheet({
      rows: [["名称", "数量"], ["苹果", "3"]],
      formats: { "0:0": { bold: true } },
      merges: [{ firstRow: 0, lastRow: 0, firstCol: 0, lastCol: 1 }],
    }),
  ]);
  const [restored] = univerSnapshotToGridSheets(data);
  assert.equal(restored.rows[0][0], "名称");
  assert.equal(restored.rows[1][1], "3", "数字取回来仍是导出链要的字符串");
  assert.deepEqual(restored.formats["0:0"], { bold: true });
  assert.equal(restored.merges.length, 1);
});

test("空快照不炸——没有 sheets 就是零张表", () => {
  assert.deepEqual(univerSnapshotToGridSheets(null), []);
  assert.deepEqual(univerSnapshotToGridSheets({}), []);
  assert.deepEqual(univerSnapshotToGridSheets({ sheets: {} }), []);
});

/**
 * Univer `save()` 的活快照形状：公式格子同时带 `f` 和算好的 `v`，
 * 样式在 `styles` 字典里、格子上只挂 id。导出链吃的就是这个，
 * 不是 `gridSheetsToUniverSnapshot` 写出来的内联样式快照。
 */
function liveUniverWorkbook() {
  return {
    id: "wb",
    name: "工作簿",
    appVersion: GRID_UNIVER_APP_VERSION,
    styles: {
      heading: {
        bl: 1,
        ht: 2,
        cl: { rgb: "#166534" },
        bg: { rgb: "#fff3cd" },
        n: { pattern: "#,##0.00" },
      },
    },
    // 与对象插入顺序相反：先写 uid-detail，order 却要汇总在前。
    sheetOrder: ["uid-summary", "uid-detail"],
    sheets: {
      "uid-detail": {
        id: "uid-detail",
        name: "明细",
        rowCount: 40,
        columnCount: 12,
        cellData: {
          0: { 0: { v: "后期插入的表", t: 1 } },
        },
        mergeData: [],
      },
      "uid-summary": {
        id: "other-id",
        name: "汇总",
        rowCount: 24,
        columnCount: 10,
        cellData: {
          0: {
            0: { v: 12.5, t: 2 },
            1: { f: "=A1*2", v: 25, t: 2, s: "heading" },
            2: { v: "标题", t: 1, s: "heading" },
          },
        },
        mergeData: [
          { startRow: 2, endRow: 3, startColumn: 0, endColumn: 1 },
        ],
      },
    },
  };
}

test("导出：公式和算好的值同时在时，必须带走公式，不能退化成死数字", () => {
  const [summary] = univerSnapshotToGridSheets(liveUniverWorkbook());
  assert.equal(
    summary.rows[0][1],
    "=A1*2",
    "用户在新核里写的公式，导出链看的是格子字符串。写成 25 的话 exceljs 会当死数字写进 xlsx，公式就没了。",
  );
  assert.notEqual(summary.rows[0][1], "25");
  assert.equal(summary.rows[0][0], "12.5");
});

test("导出：xlsx 打开后公式还在，不是写死的数字", async () => {
  const sheets = univerSnapshotToGridSheets(liveUniverWorkbook());
  const { buildGridRouteWorkbookBlob } = await import(
    "../src/shell/doc-editors/GridWorkbookExport.ts"
  );
  const blob = await buildGridRouteWorkbookBlob(sheets, { headerRow: false });
  const imported = await import("exceljs");
  const ExcelJS = "Workbook" in imported ? imported : imported.default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  const exported = workbook.getWorksheet("汇总");
  assert.ok(exported, "导出的工作簿里必须有用户起的表名「汇总」");
  const formulaCell = exported.getCell("B1").value;
  assert.equal(
    typeof formulaCell === "object" && formulaCell ? formulaCell.formula : null,
    "A1*2",
    "用户打开导出的 xlsx，B1 必须还是公式。切掉 cell.f 的写出只会留下算好的 25。",
  );
  assert.notEqual(exported.getCell("B1").value, 25);
});

test("导出：工作表标签用的是表名，不是内部 id", () => {
  const restored = univerSnapshotToGridSheets(liveUniverWorkbook());
  assert.deepEqual(
    restored.map((entry) => entry.name),
    ["汇总", "明细"],
    "exceljs 用 name 当 xlsx 的工作表标签。丢掉表名，用户打开文件看见的是 uid。",
  );
  assert.equal(restored[0].id, "other-id");
});

test("导出：多表顺序跟 sheetOrder 走，跟对象插入顺序无关", () => {
  const restored = univerSnapshotToGridSheets(liveUniverWorkbook());
  assert.deepEqual(
    restored.map((entry) => entry.name),
    ["汇总", "明细"],
    "活快照的 sheets 对象插入顺序可以和 sheetOrder 相反。按 Object.keys 导出会把表页顺序弄反。",
  );
});

test("导出：行列数按快照声明补齐——CSV 会把空行也写出去", () => {
  const restored = univerSnapshotToGridSheets(liveUniverWorkbook());
  const summary = restored[0];
  const detail = restored[1];
  assert.equal(summary.rows.length, 24);
  assert.equal(summary.rows[0].length, 10);
  assert.equal(detail.rows.length, 40);
  assert.equal(detail.rows[0].length, 12);
});

test("导出：Univer 用样式 id 存的加粗/对齐/颜色/底色/数字格式必须带上", () => {
  const [summary] = univerSnapshotToGridSheets(liveUniverWorkbook());
  const formulaFormat = summary.formats["0:1"];
  const titleFormat = summary.formats["0:2"];
  assert.equal(formulaFormat?.bold, true, "加粗");
  assert.equal(formulaFormat?.align, "center", "对齐");
  assert.equal(formulaFormat?.color, "#166534", "字体颜色");
  assert.equal(formulaFormat?.background, "#fff3cd", "底色");
  assert.equal(formulaFormat?.numFmt, "#,##0.00", "数字格式");
  assert.deepEqual(titleFormat, formulaFormat);
});

test("导出：合并区域要进 GridSheet，exceljs 才能合并格子", () => {
  const [summary] = univerSnapshotToGridSheets(liveUniverWorkbook());
  assert.deepEqual(summary.merges, [
    { firstRow: 2, lastRow: 3, firstCol: 0, lastCol: 1 },
  ]);
});

test("导出：xlsx 里的表名、合并、数字格式跟活快照一致", async () => {
  const sheets = univerSnapshotToGridSheets(liveUniverWorkbook());
  const { buildGridRouteWorkbookBlob } = await import(
    "../src/shell/doc-editors/GridWorkbookExport.ts"
  );
  const blob = await buildGridRouteWorkbookBlob(sheets, { headerRow: false });
  const imported = await import("exceljs");
  const ExcelJS = "Workbook" in imported ? imported : imported.default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  assert.deepEqual(
    workbook.worksheets.map((entry) => entry.name),
    ["汇总", "明细"],
  );
  const summary = workbook.getWorksheet("汇总");
  assert.equal(summary.getCell("A3").isMerged, true);
  assert.equal(summary.getCell("B1").numFmt, "#,##0.00");
  assert.equal(summary.getCell("B1").font.bold, true);
  assert.equal(summary.getCell("B1").font.color.argb, "FF166534");
  assert.equal(summary.getCell("C1").fill.fgColor.argb, "FFFFF3CD");
  assert.equal(summary.getCell("C1").alignment.horizontal, "center");
});

async function openRouteXlsx(sheets) {
  const { buildGridRouteWorkbookBlob } = await import(
    "../src/shell/doc-editors/GridWorkbookExport.ts"
  );
  const blob = await buildGridRouteWorkbookBlob(sheets, { headerRow: false });
  const imported = await import("exceljs");
  const ExcelJS = "Workbook" in imported ? imported : imported.default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return workbook;
}

function greaterThanCfRule(overrides = {}) {
  return {
    cfId: "cf-greater-100",
    ranges: [{ startRow: 0, endRow: 9, startColumn: 1, endColumn: 1 }],
    stopIfTrue: false,
    rule: {
      type: "highlightCell",
      subType: "number",
      operator: "greaterThan",
      value: 100,
      style: { bl: 1, bg: { rgb: "#ffebe9" }, cl: { rgb: "#cf222e" } },
    },
    ...overrides,
  };
}

function salesWorkbookWithCf(resourceData) {
  return {
    id: "wb",
    name: "wb",
    appVersion: GRID_UNIVER_APP_VERSION,
    sheetOrder: ["s1"],
    styles: {},
    resources: [
      {
        name: "SHEET_CONDITIONAL_FORMATTING_PLUGIN",
        data: resourceData,
      },
    ],
    sheets: {
      s1: {
        id: "s1",
        name: "销售",
        rowCount: 20,
        columnCount: 8,
        mergeData: [],
        cellData: {
          0: { 0: { v: "金额", t: 1 }, 1: { v: 250, t: 2 } },
        },
      },
    },
  };
}

test("导出：活快照里的「金额 > 100 变红底」必须写进 GridSheet，不能恒写成空数组", () => {
  const notes = { dropped: [] };
  const sheets = univerSnapshotToGridSheets(
    salesWorkbookWithCf(JSON.stringify({ s1: [greaterThanCfRule()] })),
    notes,
  );
  assert.equal(sheets[0].conditionalFormats.length, 1);
  const rule = sheets[0].conditionalFormats[0];
  assert.equal(rule.operator, "greater-than");
  assert.equal(rule.value, "100");
  assert.equal(rule.background, "#ffebe9");
  assert.equal(rule.color, "#cf222e");
  assert.equal(rule.bold, true);
  assert.deepEqual(rule.range, {
    firstRow: 0,
    lastRow: 9,
    firstCol: 1,
    lastCol: 1,
  });
  assert.deepEqual(notes.dropped, []);
});

test("导出：xlsx 打开后条件格式还在，金额 > 100 仍是一条规则", async () => {
  const sheets = univerSnapshotToGridSheets(
    salesWorkbookWithCf(JSON.stringify({ s1: [greaterThanCfRule()] })),
  );
  const workbook = await openRouteXlsx(sheets);
  const ws = workbook.getWorksheet("销售");
  assert.ok(ws, "导出的工作簿里必须有用户起的表名「销售」");
  const cfs = ws.conditionalFormattings || [];
  assert.equal(
    cfs.length,
    1,
    "用户打开导出的 xlsx，必须还能看到「金额 > 100 变红底」。切掉 resources 映射或切掉 exceljs 写出都会变成 0 条。",
  );
  const first = cfs[0];
  const rule = first.rules?.[0] || first;
  assert.equal(rule.type, "cellIs");
  assert.equal(rule.operator, "greaterThan");
  const formulae = rule.formulae || [];
  assert.equal(String(formulae[0]), "100");
  assert.notEqual(ws.getCell("B1").value, undefined);
});

test("导出：GridSheet 上已有五操作符规则时，exceljs 链也必须写进 xlsx", async () => {
  const sheets = [
    sheet({
      name: "销售",
      rows: [["金额", "250"]],
      conditionalFormats: [
        {
          id: "c1",
          range: { firstRow: 0, lastRow: 9, firstCol: 1, lastCol: 1 },
          operator: "greater-than",
          value: "100",
          background: "#ffebe9",
          color: "#cf222e",
          bold: true,
        },
      ],
    }),
  ];
  const workbook = await openRouteXlsx(sheets);
  const ws = workbook.getWorksheet("销售");
  assert.equal(
    (ws.conditionalFormattings || []).length,
    1,
    "即便跳过 snapshot 映射、直接把规则填进 GridSheet，新核这条 exceljs 链也要把规则写进文件。",
  );
});

test("导出：xlsx 打开后「包含」规则还在，不是写丢", async () => {
  const notes = { dropped: [] };
  const snap = salesWorkbookWithCf(
    JSON.stringify({
      s1: [
        {
          cfId: "cf-contains",
          ranges: [{ startRow: 0, endRow: 4, startColumn: 0, endColumn: 0 }],
          rule: {
            type: "highlightCell",
            subType: "text",
            operator: "containsText",
            value: "逾期",
            style: { bg: { rgb: "#fff3cd" } },
          },
        },
      ],
    }),
  );
  const sheets = univerSnapshotToGridSheets(snap, notes);
  assert.equal(sheets[0].conditionalFormats[0].operator, "contains");
  assert.equal(sheets[0].conditionalFormats[0].value, "逾期");
  const workbook = await openRouteXlsx(sheets);
  const rule = (workbook.getWorksheet("销售").conditionalFormattings || [])[0]
    ?.rules?.[0];
  assert.equal(rule?.type, "containsText");
  assert.match(
    String(rule?.formulae?.[0] || ""),
    /逾期/,
    "用户打开导出的 xlsx，「包含逾期」这条规则必须还在。exceljs 把比较词写进 SEARCH 公式。",
  );
  assert.deepEqual(notes.dropped, []);
});

test("导出：色阶 / 数据条 / 图标集带不过去，但必须点名", () => {
  const notes = { dropped: [] };
  const extra = [
    greaterThanCfRule(),
    {
      cfId: "cf-scale",
      ranges: [{ startRow: 0, endRow: 4, startColumn: 0, endColumn: 0 }],
      rule: { type: "colorScale", config: [] },
    },
    {
      cfId: "cf-bar",
      ranges: [{ startRow: 0, endRow: 4, startColumn: 0, endColumn: 0 }],
      rule: { type: "dataBar", isShowValue: true, config: {} },
    },
    {
      cfId: "cf-icon",
      ranges: [{ startRow: 0, endRow: 4, startColumn: 0, endColumn: 0 }],
      rule: { type: "iconSet", isShowValue: true, config: [] },
    },
  ];
  const sheets = univerSnapshotToGridSheets(
    salesWorkbookWithCf(JSON.stringify({ s1: extra })),
    notes,
  );
  assert.equal(sheets[0].conditionalFormats.length, 1);
  assert.equal(sheets[0].conditionalFormats[0].operator, "greater-than");
  assert.equal(notes.dropped.length, 3);
  assert.match(notes.dropped.join("；"), /色阶/);
  assert.match(notes.dropped.join("；"), /数据条/);
  assert.match(notes.dropped.join("；"), /图标集/);
  const warning = gridUniverOutboundWarning(notes);
  assert.match(warning, /没有带过去/);
  assert.match(warning, /色阶/);
});
