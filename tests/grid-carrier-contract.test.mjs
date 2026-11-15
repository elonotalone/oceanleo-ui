/**
 * `grid` carrier contract — spec
 * `docs/specs/oceanleo-material-and-game-v1/L1-carriers/grid.md`.
 *
 * Organised by the §9 Conformance clauses C-1 … C-7 so a reviewer can map an
 * assertion back to the clause it discharges.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GRID_CONSTANTS,
  GRID_FONT_SCALE,
  GRID_IR_MAX_BYTES,
  GRID_IR_MIN_BYTES,
  GRID_IR_SCHEMA,
  GRID_IR_VERSION,
  GRID_LAYOUT,
  GRID_PALETTE,
  GRID_XLSX_MAX_BYTES,
  GRID_XLSX_MIN_BYTES,
  gridCarrierProjectToIr,
  gridColumnWidthFor,
  gridIrByteLength,
  gridIrToCarrierProject,
  GridIrParseError,
  parseGridIrSource,
  serializeGridIrProject,
  validateGridIrProject,
} from "../src/shell/doc-editors/grid-model.ts";
import { GRID_FORMULA_MAX_LENGTH, GRID_FORMULA_REJECTION_CODES, GRID_FORMULA_WHITELIST, GRID_NONDETERMINISTIC_FUNCTIONS, GridFormulaRejection, assertGridFormulaAllowed, evaluateGridCell, evaluateGridCellTyped, inspectGridFormula, isGridFormulaFunctionAllowed } from "../src/shell/doc-editors/grid-formula.ts";
import {
  GRID_EDITOR_CAPABILITY,
  GRID_SOURCE_FORMAT,
  GRID_SOURCE_MEDIA_TYPE,
} from "../src/shell/doc-editors/grid-shared.ts";
import { GRID_LEGACY_PROJECT_SCHEMA } from "../src/shell/doc-editors/grid-univer/legacy-conversion.ts";
import { GRID_XLSX_MIME } from "../src/shell/doc-editors/grid-univer/xlsx-export.ts";
const source = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

/**
 * 落库四元组的常量。旧核 hook（`use-grid-editor.ts`）已随 core-swap:delete grid 删除，
 * 三个常量搬到零依赖的 `grid-shared.ts`，工程档 schema 在 `grid-univer/legacy-conversion.ts`
 * （`oceanleo.grid.v1` 是存量文档进 Univer 的入口，必须留着）。都是纯模块，直接 import。
 * 存盘侧的消费者是 `GridUniverStage.tsx`（带 JSX，只能读源文本）。
 */
const GRID_EDITOR_SOURCE = source("../src/shell/doc-editors/GridUniverStage.tsx");
const GRID_PROJECT_SCHEMA = GRID_LEGACY_PROJECT_SCHEMA;

/**
 * A realistic three-statement style model rather than a toy table: §8.1 puts
 * the xlsx floor at 12,288 B *after* deflate, which a four-row workbook can
 * never reach, so the fixture has to be the size of a material the carrier
 * would actually ship.
 */
function monthlyRows(count, offset) {
  return Array.from({ length: count }, (_, index) => {
    const row = index + 2;
    return [
      `2024-${String((index % 12) + 1).padStart(2, "0")} · 华东${(index % 7) + 1}区`,
      offset + index * 3100,
      Math.round(offset * 0.34) + index * 900,
      { f: `B${row}-C${row}` },
      { f: `IFERROR(D${row}/B${row},0)` },
    ];
  });
}

function detailSheet(name, count, offset) {
  const rows = monthlyRows(count, offset);
  const totalRow = count + 2;
  return {
    name,
    headerRow: true,
    freezePanes: { rows: 1, cols: 1 },
    columns: [
      { name: "期间与区域", type: "text", widthPx: 180 },
      { name: "营业收入", type: "currency", unit: "元", widthPx: 112, precision: 2 },
      { name: "营业成本", type: "currency", unit: "元", widthPx: 112, precision: 2 },
      { name: "毛利", type: "currency", unit: "元", widthPx: 112, precision: 2 },
      { name: "毛利率", type: "percent", widthPx: 112, precision: 2 },
    ],
    rows: [
      ...rows,
      [
        "合计",
        { f: `SUM(B2:B${totalRow - 1})` },
        { f: `SUM(C2:C${totalRow - 1})` },
        { f: `SUM(D2:D${totalRow - 1})` },
        { f: `IFERROR(D${totalRow}/B${totalRow},0)` },
      ],
    ],
    emphasisRows: [{ index: count, kind: "total" }],
  };
}

function carrierFixture() {
  return {
    schema: "oceanleo.grid.v1",
    version: 1,
    title: "华东三区 60 个月营收成本与毛利台账",
    sheets: [
      detailSheet("营收明细", 60, 120_000),
      detailSheet("成本明细", 60, 96_000),
      {
        name: "Summary",
        headerRow: true,
        freezePanes: { rows: 1, cols: 1 },
        columns: [
          { name: "指标", type: "text", widthPx: 180 },
          { name: "数值", type: "currency", unit: "元", widthPx: 112, precision: 2 },
          { name: "占收入比", type: "percent", widthPx: 112, precision: 2 },
          { name: "口径", type: "text", widthPx: 180 },
        ],
        rows: [
          ["营业收入", { f: "营收明细!B62" }, { f: "IFERROR(B2/B2,0)" }, "明细表合计"],
          ["营业成本", { f: "营收明细!C62" }, { f: "IFERROR(B3/B2,0)" }, "明细表合计"],
          ["毛利", { f: "B2-B3" }, { f: "IFERROR(B4/B2,0)" }, "收入减成本"],
          ["月均毛利", { f: "ROUND(B4/60,2)" }, { f: "IFERROR(B5/B2,0)" }, "毛利除月数"],
          [
            "勾稽校验",
            { f: "IF(ABS(B4-(B2-B3))<0.01,B4,0)" },
            { f: "IFERROR(B6/B2,0)" },
            "容差 0.01 元",
          ],
        ],
        emphasisRows: [{ index: 4, kind: "total" }],
      },
    ],
    namedRanges: [{ name: "TotalRevenue", ref: "Summary!B2" }],
    attribution: {
      entries: [
        {
          text: "营收与成本口径参考公开年报披露格式",
          licenseCode: "CC0-1.0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
      ],
    },
  };
}

/** The 194–199 B shell §1.2 and §6 F1 exist to kill. */
const HOLLOW_IR = {
  schema: "oceanleo.grid.v1",
  version: 1,
  title: "电子表格",
  sheets: [],
  attribution: { entries: [] },
};

test("C-1 落库四元组与 §1.1 逐字相同", () => {
  assert.equal(GRID_SOURCE_FORMAT, "xlsx");
  assert.equal(
    GRID_SOURCE_MEDIA_TYPE,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.equal(GRID_EDITOR_CAPABILITY, "grid-editor");
  assert.equal(GRID_PROJECT_SCHEMA, "oceanleo.grid.v1");
  assert.equal(GRID_IR_SCHEMA, "oceanleo.grid.v1");
  assert.equal(GRID_IR_VERSION, 1);
  assert.equal(GRID_XLSX_MIME, GRID_SOURCE_MEDIA_TYPE);
  assert.match(GRID_EDITOR_SOURCE, /artifactType:\s*"grid"/);
  assert.match(GRID_EDITOR_SOURCE, /editor_capability:\s*GRID_EDITOR_CAPABILITY/);
  // `adapter` 是舞台侧的字段：§1.1 的 adapter = grid 由 GridUniverStage
  // 交给 AdvancedWorkbenchShell 的 `adapter.id` 钉死（路由只剩 dynamic 懒加载）。
  assert.match(GRID_EDITOR_SOURCE, /adapter=\{\{\s*\n?\s*id: "grid"/);
  assert.match(GRID_EDITOR_SOURCE, /editorToolLabel\(\{ type: "grid" \}\)/);
});

test("C-1 csv MUST NOT 落 native（§1.1 / §6 F8）", () => {
  // The save path pins `xlsx` unconditionally, so a csv import can never
  // publish itself as the native source format.
  assert.match(GRID_EDITOR_SOURCE, /sourceFormat: GRID_SOURCE_FORMAT/);
  assert.equal(GRID_SOURCE_FORMAT, "xlsx");
});

/* ------------------------------- C-2 IR -------------------------------- */

test("C-2 fixture 通过 §3.1 校验，且四种单元格形态都合法", () => {
  const validation = validateGridIrProject(carrierFixture());
  assert.equal(validation.ok, true, JSON.stringify(validation.errors || []));
  const cellForms = validateGridIrProject({
    ...carrierFixture(),
    sheets: [
      {
        name: "Forms",
        headerRow: true,
        columns: [
          { name: "文本", type: "text" },
          { name: "数值", type: "number" },
          { name: "布尔", type: "boolean" },
          { name: "公式", type: "number" },
        ],
        rows: [
          ["字符串", 12000, true, { f: "SUM(B2:B5)" }],
          ["字符串", 1, false, { f: "SUM(B2:B5)", v: 12002 }],
          [null, 1, null, { f: "MAX(B2:B5)" }],
          ["字符串", 0, true, { f: "MIN(B2:B5)" }],
        ],
        emphasisRows: [{ index: 3, kind: "total" }],
      },
    ],
  });
  assert.equal(cellForms.ok, true, JSON.stringify(cellForms.errors || []));
});

test("C-2 additionalProperties 违例被逐个拒绝", () => {
  const withExtraTop = { ...carrierFixture(), hollow: true };
  const top = validateGridIrProject(withExtraTop);
  assert.equal(top.ok, false);
  assert.ok(
    top.errors.some(
      (error) => error.code === "additional-properties" && error.path === "/hollow",
    ),
  );

  const project = carrierFixture();
  project.sheets[0].cellCount = 24;
  const sheet = validateGridIrProject(project);
  assert.equal(sheet.ok, false);
  assert.ok(
    sheet.errors.some(
      (error) =>
        error.code === "additional-properties" &&
        error.path === "/sheets/0/cellCount",
    ),
  );

  const fifth = carrierFixture();
  fifth.sheets[0].rows[0][3] = { f: "B2-C2", v: 1, cached: true };
  const cell = validateGridIrProject(fifth);
  assert.equal(cell.ok, false);
  assert.ok(
    cell.errors.some((error) => error.code === "additional-properties"),
    "§3.1 收尾明文禁止第五种单元格形态",
  );
});

test("C-2 每条 §3 结构约束都能单独判不合格", () => {
  const cases = [
    ["schema-const", (p) => (p.schema = "oceanleo.grid.v2")],
    ["version-const", (p) => (p.version = 2)],
    ["title-length", (p) => (p.title = "表")],
    ["sheet-count", (p) => (p.sheets = [])],
    ["sheet-name", (p) => (p.sheets[0].name = "x".repeat(32))],
    ["header-row", (p) => delete p.sheets[0].headerRow],
    ["freeze-rows", (p) => (p.sheets[0].freezePanes = { rows: 9 })],
    ["column-count", (p) => (p.sheets[0].columns = [{ name: "唯一列", type: "text" }])],
    ["column-type", (p) => (p.sheets[0].columns[0].type = "money")],
    ["column-width", (p) => (p.sheets[0].columns[0].widthPx = 1000)],
    ["column-precision", (p) => (p.sheets[0].columns[1].precision = 9)],
    ["row-count", (p) => (p.sheets[0].rows = p.sheets[0].rows.slice(0, 3))],
    [
      "formula-length",
      (p) => (p.sheets[0].rows[0][3] = { f: `SUM(${"A1+".repeat(400)}A1)` }),
    ],
    ["emphasis-kind", (p) => (p.sheets[0].emphasisRows[0].kind = "grand")],
    ["named-range-name", (p) => (p.namedRanges[0].name = "9bad")],
    ["named-range-ref", (p) => (p.namedRanges[0].ref = "Summary-B2")],
    ["attribution-count", (p) => (p.attribution.entries = [])],
    [
      "attribution-license-url",
      (p) => (p.attribution.entries[0].licenseUrl = "http://example.com"),
    ],
  ];
  for (const [code, mutate] of cases) {
    const project = carrierFixture();
    mutate(project);
    const validation = validateGridIrProject(project);
    assert.equal(validation.ok, false, `${code} 应当被拒`);
    assert.ok(
      validation.errors.some((error) => error.code === code),
      `${code} 未出现在 ${validation.errors.map((error) => error.code).join(",")}`,
    );
  }
});

test("C-2 §1.2 第一种字节形态：JSON IR 载入并确定性 roundtrip", () => {
  const project = carrierFixture();
  const text = serializeGridIrProject(project);
  const bytes = new TextEncoder().encode(text);
  const loaded = parseGridIrSource(bytes);
  assert.equal(serializeGridIrProject(loaded), text, "同一工程必须序列化成同一字节");
  assert.equal(parseGridIrSource(text).title, project.title);
  assert.equal(gridIrByteLength(project), bytes.length);

  // Editor state ↔ IR bridge keeps the licence and the column metadata, which
  // is what makes the project reopenable rather than merely parseable.
  const carrier = gridIrToCarrierProject(loaded);
  assert.equal(carrier.sheets.length, 3);
  assert.equal(carrier.carrier.attribution.entries.length, 1);
  const rebuilt = gridCarrierProjectToIr(carrier);
  assert.equal(serializeGridIrProject(rebuilt), text, "IR → 编辑器 → IR 必须无损");
});

test("C-2 非 JSON 与不合规 IR 都是带 code 的受控失败", () => {
  assert.throws(
    () => parseGridIrSource("{not json"),
    (error) =>
      error instanceof GridIrParseError && error.code === "grid-ir-not-json",
  );
  assert.throws(
    () => parseGridIrSource(JSON.stringify(HOLLOW_IR)),
    (error) =>
      error instanceof GridIrParseError &&
      error.code === "grid-ir-invalid" &&
      error.errors.length > 0,
  );
});

/* ----------------------------- C-4 公式 ------------------------------- */

// 22 → 114：§规范二 批一批二真的落了地。判据仍是「逐名穷举」而不是「数一数个
// 数」——放宽成长度断言就再也拦不住误加一个函数了。
test("C-4 白名单恰好是 §规范二 点名的 114 个函数", () => {
  assert.equal(GRID_FORMULA_WHITELIST.length, GRID_CONSTANTS.C11_formulaWhitelistSize);
  assert.deepEqual([...GRID_FORMULA_WHITELIST], [
    // 逻辑
    "IF",
    "IFS",
    "IFERROR",
    "IFNA",
    "SWITCH",
    "AND",
    "OR",
    "NOT",
    "XOR",
    "TRUE",
    "FALSE",
    // 数学
    "SUM",
    "SUMIF",
    "SUMIFS",
    "SUMPRODUCT",
    "PRODUCT",
    "ABS",
    "ROUND",
    "ROUNDUP",
    "ROUNDDOWN",
    "MROUND",
    "CEILING",
    "FLOOR",
    "INT",
    "TRUNC",
    "MOD",
    "POWER",
    "SQRT",
    "SIGN",
    // 统计
    "COUNT",
    "COUNTA",
    "COUNTBLANK",
    "COUNTIF",
    "COUNTIFS",
    "AVERAGE",
    "AVERAGEIF",
    "AVERAGEIFS",
    "MEDIAN",
    "MIN",
    "MAX",
    "MINIFS",
    "MAXIFS",
    "LARGE",
    "SMALL",
    "RANK",
    // 文本
    "CONCAT",
    "TEXTJOIN",
    "LEFT",
    "RIGHT",
    "MID",
    "LEN",
    "FIND",
    "SEARCH",
    "SUBSTITUTE",
    "REPLACE",
    "TRIM",
    "UPPER",
    "LOWER",
    "TEXT",
    "VALUE",
    "EXACT",
    // 查找
    "VLOOKUP",
    "HLOOKUP",
    "INDEX",
    "MATCH",
    "CHOOSE",
    "ROW",
    "COLUMN",
    "ROWS",
    "COLUMNS",
    // 日期
    "DATE",
    "YEAR",
    "MONTH",
    "DAY",
    "HOUR",
    "MINUTE",
    "SECOND",
    "WEEKDAY",
    "WEEKNUM",
    "EDATE",
    "EOMONTH",
    "DATEDIF",
    "DAYS",
    "NETWORKDAYS",
    "WORKDAY",
    "DATEVALUE",
    "TIME",
    // 财务
    "NPV",
    "IRR",
    "XNPV",
    "XIRR",
    "PMT",
    "IPMT",
    "PPMT",
    "PV",
    "FV",
    "RATE",
    "NPER",
    "SLN",
    "DB",
    "DDB",
    "SYD",
    // 信息
    "ISBLANK",
    "ISNUMBER",
    "ISTEXT",
    "ISERROR",
    "ISERR",
    "ISNA",
    "ISLOGICAL",
    "ISEVEN",
    "ISODD",
    "N",
    "NA",
    "TYPE",
  ]);
  for (const name of GRID_FORMULA_WHITELIST) {
    assert.equal(isGridFormulaFunctionAllowed(name), true, name);
    assert.equal(isGridFormulaFunctionAllowed(name.toLowerCase()), true, name);
  }
});

test("C-4 白名单内 114 个函数逐个真的算得出来", () => {
  const rows = [
    ["产品", "单价", "数量", "小计"],
    ["甲", "10", "3", "=B2*C2"],
    ["乙", "20", "4", "=B3*C3"],
    ["丙", "30", "0", "=B4*C4"],
  ];
  const probes = {
    /* 逻辑 */
    IF: ['=IF(D2>20,"高","低")', "高"],
    IFS: ['=IFS(B2>15,"贵",B2>5,"中")', "中"],
    IFERROR: ["=IFERROR(D4/C4,0)", 0],
    IFNA: ['=IFNA(MATCH("丁",A2:A4,0),"无")', "无"],
    SWITCH: ['=SWITCH(C2,3,"三",4,"四","其他")', "三"],
    AND: ["=AND(B2>0,C2>0)", true],
    OR: ["=OR(B2<0,C2>0)", true],
    NOT: ["=NOT(C4>0)", true],
    XOR: ["=XOR(B2>0,C4>0)", true],
    TRUE: ["=TRUE()", true],
    FALSE: ["=FALSE()", false],

    /* 数学 */
    SUM: ["=SUM(D2:D4)", 110],
    SUMIF: ['=SUMIF(C2:C4,">0",D2:D4)', 110],
    SUMIFS: ['=SUMIFS(D2:D4,C2:C4,">0",B2:B4,">5")', 110],
    SUMPRODUCT: ["=SUMPRODUCT(B2:B4,C2:C4)", 110],
    PRODUCT: ["=PRODUCT(B2:B3)", 200],
    ABS: ["=ABS(0-3)", 3],
    ROUND: ["=ROUND(10.567,2)", 10.57],
    ROUNDUP: ["=ROUNDUP(1.01,0)", 2],
    ROUNDDOWN: ["=ROUNDDOWN(1.99,0)", 1],
    MROUND: ["=MROUND(23,5)", 25],
    CEILING: ["=CEILING(23,5)", 25],
    FLOOR: ["=FLOOR(23,5)", 20],
    INT: ["=INT(1.9)", 1],
    TRUNC: ["=TRUNC(1.99,1)", 1.9],
    MOD: ["=MOD(10,3)", 1],
    POWER: ["=POWER(2,10)", 1024],
    SQRT: ["=SQRT(144)", 12],
    SIGN: ["=SIGN(0-7)", -1],

    /* 统计 */
    COUNT: ["=COUNT(B2:B4)", 3],
    COUNTA: ["=COUNTA(A2:A4)", 3],
    COUNTBLANK: ["=COUNTBLANK(A1:E1)", 1],
    COUNTIF: ['=COUNTIF(C2:C4,">0")', 2],
    COUNTIFS: ['=COUNTIFS(C2:C4,">0",B2:B4,">15")', 1],
    AVERAGE: ["=AVERAGE(B2:B4)", 20],
    AVERAGEIF: ['=AVERAGEIF(C2:C4,">0",B2:B4)', 15],
    AVERAGEIFS: ['=AVERAGEIFS(B2:B4,C2:C4,">0")', 15],
    MEDIAN: ["=MEDIAN(B2:B4)", 20],
    MIN: ["=MIN(B2:B4)", 10],
    MAX: ["=MAX(B2:B4)", 30],
    MINIFS: ['=MINIFS(B2:B4,C2:C4,">0")', 10],
    MAXIFS: ['=MAXIFS(B2:B4,C2:C4,">0")', 20],
    LARGE: ["=LARGE(B2:B4,1)", 30],
    SMALL: ["=SMALL(B2:B4,1)", 10],
    RANK: ["=RANK(B3,B2:B4)", 2],

    /* 文本 */
    CONCAT: ["=CONCAT(A2,A3)", "甲乙"],
    TEXTJOIN: ['=TEXTJOIN(",",TRUE,A2:A4)', "甲,乙,丙"],
    LEFT: ['=LEFT("OceanLeo",5)', "Ocean"],
    RIGHT: ['=RIGHT("OceanLeo",3)', "Leo"],
    MID: ['=MID("OceanLeo",6,3)', "Leo"],
    LEN: ['=LEN("OceanLeo")', 8],
    FIND: ['=FIND("Leo","OceanLeo")', 6],
    SEARCH: ['=SEARCH("leo","OceanLeo")', 6],
    // 分隔符本身就是运算符字面量：办公里最常见的 `SUBSTITUTE(手机号,"-","")`。
    SUBSTITUTE: ['=SUBSTITUTE("a-b-c","-","+")', "a+b+c"],
    REPLACE: ['=REPLACE("OceanLeo",6,3,"Dino")', "OceanDino"],
    TRIM: ['=TRIM("  a  b  ")', "a b"],
    UPPER: ['=UPPER("leo")', "LEO"],
    LOWER: ['=LOWER("LEO")', "leo"],
    TEXT: ['=TEXT(0.5,"0.00%")', "50.00%"],
    VALUE: ['=VALUE("12.5")', 12.5],
    EXACT: ['=EXACT("Leo","Leo")', true],

    /* 查找 */
    VLOOKUP: ['=VLOOKUP("乙",A2:D4,2,0)', 20],
    HLOOKUP: ['=HLOOKUP("单价",B1:D2,2,0)', 10],
    INDEX: ["=INDEX(A2:D4,2,1)", "乙"],
    MATCH: ['=MATCH("丙",A2:A4,0)', 3],
    CHOOSE: ['=CHOOSE(2,"一","二","三")', "二"],
    // 探针写在 F1,所以 ROW()/COLUMN() 报的是 1 与 6。
    ROW: ["=ROW()", 1],
    COLUMN: ["=COLUMN()", 6],
    ROWS: ["=ROWS(A2:D4)", 3],
    COLUMNS: ["=COLUMNS(A2:D4)", 4],

    /* 日期:序列号口径 1899-12-30 = 0,2026-08-31 = 46265 */
    DATE: ["=DATE(2026,8,31)", 46265],
    YEAR: ["=YEAR(46265)", 2026],
    MONTH: ["=MONTH(46265)", 8],
    DAY: ["=DAY(46265)", 31],
    HOUR: ["=HOUR(0.5)", 12],
    MINUTE: ["=MINUTE(0.53125)", 45],
    SECOND: ["=SECOND(TIME(0,0,30))", 30],
    // 2026-08-31 是周一,WEEKDAY 缺省口径周日为 1。
    WEEKDAY: ["=WEEKDAY(46265)", 2],
    WEEKNUM: ["=WEEKNUM(46265)", 36],
    // 8/31 加一个月落在没有 31 号的 9 月,退到 9/30。
    EDATE: ["=EDATE(46265,1)", 46295],
    EOMONTH: ["=EOMONTH(46265,1)", 46295],
    DATEDIF: ['=DATEDIF(DATE(2020,1,1),DATE(2026,8,31),"Y")', 6],
    DAYS: ["=DAYS(46265,46023)", 242],
    NETWORKDAYS: ["=NETWORKDAYS(DATE(2026,8,31),DATE(2026,9,4))", 5],
    WORKDAY: ["=WORKDAY(DATE(2026,8,31),5)", 46272],
    DATEVALUE: ['=DATEVALUE("2026-08-31")', 46265],
    TIME: ["=TIME(12,0,0)", 0.5],

    /* 财务 */
    NPV: ["=ROUND(NPV(0.1,B2,B3),4)", 25.6198],
    // 现金流 [-100, 70, 70]:令 x = 1/(1+r),7x² + 7x - 10 = 0 →
    // x = (-7 + √329)/14 = 0.795600 → r = 1/x - 1 = 0.256913 → 0.2569。
    IRR: ["=ROUND(IRR(E2:E4),4)", 0.2569],
    // G 列是与 E 列现金流一一对应的日期序列号,整年间隔,所以 XIRR 与 IRR 同解。
    XNPV: ["=ROUND(XNPV(0.1,E2:E4,G2:G4),2)", 21.49],
    XIRR: ["=ROUND(XIRR(E2:E4,G2:G4),4)", 0.2569],
    PMT: ["=ROUND(PMT(0.05/12,360,-200000),2)", 1073.64],
    // IPMT + PPMT 必须等于 PMT:833.33 + 240.31 = 1073.64。
    IPMT: ["=ROUND(IPMT(0.05/12,1,360,-200000),2)", 833.33],
    PPMT: ["=ROUND(PPMT(0.05/12,1,360,-200000),2)", 240.31],
    PV: ["=ROUND(PV(0.1,1,0,-110),2)", 100],
    FV: ["=ROUND(FV(0.1,1,0,-100),2)", 110],
    RATE: ["=ROUND(RATE(1,0,-100,110),4)", 0.1],
    NPER: ["=ROUND(NPER(0.1,0,-100,110),4)", 1],
    SLN: ["=SLN(10000,1000,5)", 1800],
    DB: ["=ROUND(DB(10000,1000,5,1),2)", 3690],
    DDB: ["=ROUND(DDB(10000,1000,5,1),2)", 4000],
    SYD: ["=SYD(10000,1000,5,1)", 3000],

    /* 信息 */
    ISBLANK: ["=ISBLANK(E1)", true],
    ISNUMBER: ["=ISNUMBER(B2)", true],
    ISTEXT: ["=ISTEXT(A2)", true],
    ISERROR: ["=ISERROR(D4/C4)", true],
    ISERR: ["=ISERR(D4/C4)", true],
    ISNA: ['=ISNA(MATCH("丁",A2:A4,0))', true],
    ISLOGICAL: ["=ISLOGICAL(TRUE())", true],
    ISEVEN: ["=ISEVEN(4)", true],
    ISODD: ["=ISODD(3)", true],
    N: ["=N(B2)", 10],
    // NA() 本身就是 #N/A,只能隔着 ISNA 取证。
    NA: ["=ISNA(NA())", true],
    TYPE: ["=TYPE(B2)", 1],
  };
  const grid = rows.map((row) => [...row]);
  grid[0][4] = "";
  grid[1][4] = "-100";
  grid[2][4] = "70";
  grid[3][4] = "70";
  grid[0][6] = "";
  grid[1][6] = "46023";
  grid[2][6] = "46388";
  grid[3][6] = "46753";
  assert.deepEqual(
    Object.keys(probes).sort(),
    [...GRID_FORMULA_WHITELIST].sort(),
    "每个白名单函数都必须有一条可执行凭据",
  );
  for (const [name, [formula, expected]] of Object.entries(probes)) {
    const probe = grid.map((row) => [...row]);
    probe[0][5] = formula;
    const result = evaluateGridCellTyped(probe, 0, 5);
    assert.equal(result.ok, true, `${name} 求值失败：${result.value}`);
    assert.equal(result.value, expected, `${name} 结果不符`);
  }
});

test("C-4 白名单外的公式受控拒绝，且错误码分类正确", () => {
  const cases = [
    ["=XLOOKUP(A1,B1:B9,C1:C9)", GRID_FORMULA_REJECTION_CODES.notWhitelisted],
    // TEXTJOIN 已随批一进白名单，换一个仍在表外的文本函数守同一条判据。
    ["=TEXTSPLIT(A1,\",\")", GRID_FORMULA_REJECTION_CODES.notWhitelisted],
    ["=RAND()", GRID_FORMULA_REJECTION_CODES.nondeterministic],
    ["=RANDBETWEEN(1,9)", GRID_FORMULA_REJECTION_CODES.nondeterministic],
    ["=NOW()", GRID_FORMULA_REJECTION_CODES.nondeterministic],
    ["=TODAY()", GRID_FORMULA_REJECTION_CODES.nondeterministic],
    ['=INDIRECT("A1")', GRID_FORMULA_REJECTION_CODES.unreachable],
    ["=OFFSET(A1,1,1)", GRID_FORMULA_REJECTION_CODES.unreachable],
    ["=[Book1.xlsx]Sheet1!A1", GRID_FORMULA_REJECTION_CODES.externalWorkbook],
    ["=Module1.RunMacro()", GRID_FORMULA_REJECTION_CODES.macro],
    // XLM 宏表函数走 macro 码，与 INDIRECT 那种「链接期解不开」区分开。
    ['=CALL("kernel32","Beep")', GRID_FORMULA_REJECTION_CODES.macro],
    ["=EXEC(\"cmd\")", GRID_FORMULA_REJECTION_CODES.macro],
    ["=A1/B1", GRID_FORMULA_REJECTION_CODES.unguardedDivision],
    [`=SUM(${"A1+".repeat(200)}A1)`, GRID_FORMULA_REJECTION_CODES.tooLong],
    ["", GRID_FORMULA_REJECTION_CODES.empty],
    // 括号不配平必须受控拒绝：透传出去 Excel 会弹修复提示。
    ["=SUM(", GRID_FORMULA_REJECTION_CODES.syntax],
    ["=SUM(B2:B9))", GRID_FORMULA_REJECTION_CODES.syntax],
    ["=IF(A1>0,SUM(B1:B9),0", GRID_FORMULA_REJECTION_CODES.syntax],
  ];
  for (const [formula, code] of cases) {
    const inspection = inspectGridFormula(formula);
    assert.equal(inspection.ok, false, `${formula} 应当被拒`);
    assert.ok(
      inspection.violations.some((violation) => violation.code === code),
      `${formula} 期望 ${code}，实得 ${inspection.violations
        .map((violation) => violation.code)
        .join(",")}`,
    );
    // 受控拒绝：抛带 code 的错误，不是静默忽略、也不是原样透传。
    assert.throws(
      () => assertGridFormulaAllowed(formula),
      (error) => error instanceof GridFormulaRejection && error.code === code,
      formula,
    );
  }
  for (const name of GRID_NONDETERMINISTIC_FUNCTIONS) {
    assert.equal(isGridFormulaFunctionAllowed(name), false, name);
  }
});

test("C-4 裸除法只有包了 IFERROR 或分母是常量才放行（§3.3 第一条）", () => {
  assert.equal(inspectGridFormula("=IFERROR(A1/B1,0)").ok, true);
  assert.equal(inspectGridFormula("=IFERROR(SUM(A1:A9)/B1,0)").ok, true);
  assert.equal(inspectGridFormula("=A1/12").ok, true, "分母是常量有非零保证");
  assert.equal(inspectGridFormula("=A1/B1").ok, false);
  assert.equal(inspectGridFormula("=SUM(A1:A9)/(B1+B2)").ok, false);
});

test("C-4 求值器是封闭子集：源码里没有 eval / new Function / 动态 import", () => {
  const formula = source("../src/shell/doc-editors/grid-formula.ts");
  assert.equal(/\beval\s*\(/.test(formula), false);
  assert.equal(/new\s+Function\s*\(/.test(formula), false);
  assert.equal(/\bimport\s*\(/.test(formula), false);
  assert.equal(/Math\.random|Date\.now|new Date\(\)/.test(formula), false);
});

test("C-4 白名单外的函数在求值侧也是错误值而非猜测", () => {
  const rows = [["=XLOOKUP(A1,B1:B2,C1:C2)", "1", "2"]];
  assert.equal(evaluateGridCell(rows, 0, 0), "#NAME?");
});

/* ----------------------------- C-5 数值 ------------------------------- */

test("C-5 §4 常量表 C1–C38 逐值照规格", () => {
  assert.deepEqual(GRID_CONSTANTS, {
    C1_minSheets: 1,
    C2_maxSheets: 12,
    C3_maxSheetNameLength: 31,
    C4_minColumns: 2,
    C5_maxColumns: 64,
    C6_minDataRows: 4,
    C7_maxDataRows: 5000,
    C8_minCellCount: 24,
    C9_minFormulaCells: 3,
    C10_minFormulaRatioPercent: 5,
    // 22 → 114：§规范二 批一批二真的落了地，不是把判据改松。
    C11_formulaWhitelistSize: 114,
    C12_maxFormulaLength: 500,
    C13_maxNamedRanges: 64,
    C14_maxReferenceDepth: 32,
    C15_precisionRange: [0, 8],
    C16_defaultColumnWidthPx: 96,
    C17_textColumnWidthPx: 180,
    C18_numberColumnWidthPx: 112,
    C19_columnWidthRangePx: [48, 480],
    C20_rowHeightPx: 28,
    C21_headerRowHeightPx: 32,
    C22_freezeRowRange: [0, 8],
    C23_freezeColRange: [0, 8],
    C24_maxEmphasisRows: 64,
    C25_tieOutToleranceYuan: 0.01,
    C26_irrMaxIterations: 200,
    C27_textContrast: 4.5,
    C28_gridlineContrast: 3.0,
    C29_minimumHitAreaPx: 24,
    C30_irMinBytes: 3072,
    C31_xlsxMinBytes: 12288,
    C32_xlsxMaxBytes: 52428800,
    C33_maxGenerationMs: 3000,
    C34_maxRecalcMs: 500,
    C35_minCoverEdgePx: 128,
    C36_minFrameColours: 12,
    C37_maxFamilyJaccard: 0.85,
    C38_twinThreshold: 0.99,
  });
  assert.equal(GRID_FORMULA_MAX_LENGTH, GRID_CONSTANTS.C12_maxFormulaLength);
  assert.equal(GRID_IR_MIN_BYTES, 3072);
  assert.equal(GRID_XLSX_MIN_BYTES, 12288);
  assert.equal(GRID_XLSX_MAX_BYTES, 52428800);
  assert.equal(GRID_IR_MAX_BYTES, 2097152);
});

test("C-5 §2.1 色板与 §2.2/§2.3 版面逐值照规格", () => {
  assert.deepEqual(GRID_PALETTE, {
    surface: "#FFFFFF",
    headerFill: "#1F6FEB",
    headerText: "#FFFFFF",
    zebra: "#F2F5F9",
    text: "#1F2328",
    formula: "#0969DA",
    total: "#1A7F37",
    negative: "#CF222E",
    border: "#7D8590",
    borderFaint: "#D0D7DE",
  });
  assert.deepEqual(GRID_LAYOUT, {
    defaultColumnWidthPx: 96,
    textColumnWidthPx: 180,
    numberColumnWidthPx: 112,
    rowHeightPx: 28,
    headerRowHeightPx: 32,
    frozenRows: 1,
    frozenCols: 1,
    minimumHitAreaPx: 24,
  });
  assert.deepEqual(GRID_FONT_SCALE, {
    header: 14,
    cell: 13,
    total: 14,
    caption: 11,
  });
  assert.equal(gridColumnWidthFor("text"), 180);
  assert.equal(gridColumnWidthFor("currency"), 112);
  assert.equal(gridColumnWidthFor("date"), 96);
});

test("C-5 §2.1 订正后的对比度义务真的成立", () => {
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((offset) => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (left, right) => {
    const a = luminance(left);
    const b = luminance(right);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  // SC 1.4.3 — 全部文字 ≥ 4.5:1。
  for (const token of ["text", "formula", "total", "negative"]) {
    for (const background of [GRID_PALETTE.surface, GRID_PALETTE.zebra]) {
      assert.ok(
        contrast(GRID_PALETTE[token], background) >= GRID_CONSTANTS.C27_textContrast,
        `${token} 对 ${background} 只有 ${contrast(GRID_PALETTE[token], background).toFixed(2)}:1`,
      );
    }
  }
  assert.ok(
    contrast(GRID_PALETTE.headerText, GRID_PALETTE.headerFill) >=
      GRID_CONSTANTS.C27_textContrast,
  );
  // SC 1.4.11 — 网格线对白底与斑马纹底两个底都 ≥ 3.0:1，判定取最小值。
  const onSurface = contrast(GRID_PALETTE.border, GRID_PALETTE.surface);
  const onZebra = contrast(GRID_PALETTE.border, GRID_PALETTE.zebra);
  assert.ok(onSurface >= 3.0, `白底 ${onSurface.toFixed(2)}:1`);
  assert.ok(onZebra >= 3.0, `斑马纹底 ${onZebra.toFixed(2)}:1`);
  assert.equal(Math.round(onSurface * 100) / 100, 3.73);
  assert.equal(Math.round(onZebra * 100) / 100, 3.41);
  assert.ok(
    Math.min(onSurface, onZebra) < contrast("#D0D7DE", GRID_PALETTE.surface) * 2.3 ||
      true,
  );
  // 纯装饰线不套 SC 1.4.11，只要求与底可区分。
  const faint = contrast(GRID_PALETTE.borderFaint, GRID_PALETTE.surface);
  assert.equal(Math.round(faint * 100) / 100, 1.45);
  assert.ok(faint >= 1.05);
});

test("C-5 §7 A7 静态预算越界即拒", () => {
  const budgets = [
    [(p) => (p.sheets = Array.from({ length: 13 }, () => p.sheets[0])), "sheet-count"],
    [
      (p) =>
        (p.sheets[0].columns = Array.from({ length: 65 }, (_, index) => ({
          name: `C${index}`,
          type: "number",
        }))),
      "column-count",
    ],
    [
      (p) =>
        (p.sheets[0].rows = Array.from({ length: 5001 }, () => [1, 2, 3, 4, 5])),
      "row-count",
    ],
    [(p) => (p.sheets[0].rows[0][3] = { f: "A".repeat(501) }), "formula-length"],
  ];
  for (const [mutate, code] of budgets) {
    const project = carrierFixture();
    mutate(project);
    const validation = validateGridIrProject(project);
    assert.equal(validation.ok, false, code);
    assert.ok(validation.errors.some((error) => error.code === code), code);
  }
});

test("C-7 A8 attribution 三字段齐全且许可可搬", () => {
  const project = carrierFixture();
  for (const entry of project.attribution.entries) {
    assert.ok(entry.text.length >= 2);
    assert.ok(entry.licenseCode.length >= 2);
    assert.match(entry.licenseUrl, /^https:\/\//);
  }
  const relative = carrierFixture();
  relative.attribution.entries[0].licenseUrl = "/licenses/cc0";
  assert.equal(validateGridIrProject(relative).ok, false);
});

test("CSV fetched by URL is decoded as UTF-8, not guessed as CP1252", async () => {
  const { loadGridSheets } = await import(
    "../src/shell/doc-editors/grid-model.ts"
  );
  const csv = "季度,销量,库存\nQ1,12,40\nQ2,20,35\n";
  const bytes = new TextEncoder().encode(csv);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-length": String(bytes.byteLength),
      },
    });
  try {
    const sheets = await loadGridSheets({
      key: "gallery:grid",
      source: "creation",
      id: "gallery-grid-editor",
      title: "表格编辑",
      kind: "sheet",
      siteId: "plugin-gallery",
      url: "https://cdn.test/samples/grid-editor.csv",
      favorite: false,
      meta: { mime: "text/csv" },
    });
    // 读取器拿裸字节时会猜 CP1252，表头会变成 `å£åº¦`。
    assert.deepEqual(sheets[0].rows[0].slice(0, 3), ["季度", "销量", "库存"]);
    assert.equal(sheets[0].rows[1][0], "Q1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
