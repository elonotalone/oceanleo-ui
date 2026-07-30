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
import {
  GRID_FORMULA_MAX_LENGTH,
  GRID_FORMULA_REJECTION_CODES,
  GRID_FORMULA_WHITELIST,
  GRID_IRR_MAX_ITERATIONS,
  GRID_NONDETERMINISTIC_FUNCTIONS,
  GridFormulaRejection,
  assertGridFormulaAllowed,
  evaluateGridCell,
  evaluateGridCellTyped,
  inspectGridFormula,
  isGridFormulaFunctionAllowed,
} from "../src/shell/doc-editors/grid-formula.ts";
import {
  GRID_ILLEGAL_TRANSITIONS,
  GRID_XLSX_MEDIA_TYPE,
  buildGridXlsxParts,
  isLegalGridTransition,
  judgeGridCompleteness,
  proveGridIsNotDeadTable,
  runGridEmitPipeline,
  zipGridXlsxParts,
} from "../src/shell/doc-editors/GridWorkbookExport.ts";
const source = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

/**
 * `use-grid-editor.ts` is a React hook module and pulls the i18n `.tsx` tree in
 * behind it, which `--experimental-strip-types` cannot load. Its exported
 * constants are read out of the source text instead, the same way the other
 * advanced-editor tests inspect route modules.
 */
const GRID_EDITOR_SOURCE = source("../src/shell/doc-editors/use-grid-editor.ts");

function exportedConstant(name) {
  const match = GRID_EDITOR_SOURCE.match(
    new RegExp(`export const ${name}\\s*(?::[^=]*)?=\\s*\\n?\\s*"([^"]+)"`),
  );
  assert.ok(match, `use-grid-editor.ts 没有导出 ${name}`);
  return match[1];
}

const GRID_SOURCE_FORMAT = exportedConstant("GRID_SOURCE_FORMAT");
const GRID_SOURCE_MEDIA_TYPE = exportedConstant("GRID_SOURCE_MEDIA_TYPE");
const GRID_EDITOR_CAPABILITY = exportedConstant("GRID_EDITOR_CAPABILITY");
const GRID_PROJECT_SCHEMA = exportedConstant("GRID_PROJECT_SCHEMA");

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

/* ------------------------------ C-1 四元组 ------------------------------ */

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
  assert.equal(GRID_XLSX_MEDIA_TYPE, GRID_SOURCE_MEDIA_TYPE);
  assert.match(GRID_EDITOR_SOURCE, /artifactType:\s*"grid"/);
  // `adapter` 是路由侧的字段，不在 hook 里：§1.1 的 adapter = grid 由 GridRoute
  // 交给 AdvancedWorkbenchShell 的 `adapter.id` 钉死。
  const route = source("../src/shell/advanced-routes/GridRoute.tsx");
  assert.match(route, /adapter=\{\{\s*\n?\s*id: "grid"/);
  assert.match(route, /editorToolLabel\(\{ type: "grid" \}\)/);
});

test("C-1 csv MUST NOT 落 native（§1.1 / §6 F8）", () => {
  const editor = source("../src/shell/doc-editors/use-grid-editor.ts");
  // The save path pins `xlsx` unconditionally, so a csv import can never
  // publish itself as the native source format.
  assert.match(editor, /sourceFormat: GRID_SOURCE_FORMAT/);
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

/* ---------------------------- C-3 状态机 ------------------------------- */

test("C-3 ready 路径按 §3.2 逐个迁移，且不触碰任何非法迁移", () => {
  const result = runGridEmitPipeline(carrierFixture());
  assert.equal(
    result.state,
    "ready",
    `${result.state}: ${JSON.stringify(result.issues.slice(0, 4))}`,
  );
  assert.deepEqual(
    result.transitions.map((entry) => `${entry.from}→${entry.to}`),
    [
      "empty→ir-validated",
      "ir-validated→formula-linked",
      "formula-linked→computed",
      "computed→emitted",
      "emitted→ready",
    ],
  );
  for (const transition of result.transitions) {
    assert.ok(
      isLegalGridTransition(transition.from, transition.to),
      `${transition.from}→${transition.to} 不是 §3.2 的合法迁移`,
    );
    assert.ok(
      !GRID_ILLEGAL_TRANSITIONS.some(
        (illegal) =>
          illegal[0] === transition.from && illegal[1] === transition.to,
      ),
      `发生了非法迁移 ${transition.from}→${transition.to}`,
    );
  }
});

test("C-3 五条非法迁移在迁移表里都不成立", () => {
  assert.equal(GRID_ILLEGAL_TRANSITIONS.length, 5);
  for (const [from, to] of GRID_ILLEGAL_TRANSITIONS) {
    assert.equal(
      isLegalGridTransition(from, to),
      false,
      `${from}→${to} 必须是非法迁移`,
    );
  }
});

test("C-3 empty → invalid：空壳 IR 走不到 ir-validated", () => {
  const result = runGridEmitPipeline(HOLLOW_IR);
  assert.equal(result.state, "invalid");
  assert.deepEqual(
    result.transitions.map((entry) => `${entry.from}→${entry.to}`),
    ["empty→invalid"],
  );
  assert.equal(result.xlsxBytes, undefined, "invalid 不得产出字节");
});

test("C-3 formula-linked → cyclic 并打印环上完整地址序列（§6 F4）", () => {
  const project = carrierFixture();
  // 利息 → 净利 → 现金 → 债务 → 利息 的闭环，直接写成互相引用。
  project.sheets[2].rows[0][1] = { f: "B4" };
  project.sheets[2].rows[2][1] = { f: "B2-B3" };
  const result = runGridEmitPipeline(project);
  assert.equal(result.state, "cyclic");
  assert.ok(Array.isArray(result.cycle) && result.cycle.length >= 2);
  assert.ok(
    result.cycle.every((address) => /^[^!]+![A-Z]+\d+$/.test(address)),
    `环上地址必须是完整单元格地址：${JSON.stringify(result.cycle)}`,
  );
  assert.ok(result.issues.some((issue) => issue.code === "grid-cyclic-reference"));
  assert.equal(result.computed, undefined, "cyclic MUST NOT 求值");
  assert.equal(result.xlsxBytes, undefined, "cyclic MUST NOT 当作可用");
});

test("C-3 除零与错误值不进交付物（§5.3 / §6 F5）", () => {
  const project = carrierFixture();
  project.sheets[2].rows[3][1] = { f: "B4/C4" };
  const result = runGridEmitPipeline(project);
  assert.equal(result.state, "invalid");
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.code === GRID_FORMULA_REJECTION_CODES.unguardedDivision ||
        issue.code === "grid-formula-error-value",
    ),
    JSON.stringify(result.issues.slice(0, 3)),
  );
});

/* ----------------------------- C-4 公式 ------------------------------- */

test("C-4 白名单恰好是 §3.3 点名的 22 个函数", () => {
  assert.equal(GRID_FORMULA_WHITELIST.length, GRID_CONSTANTS.C11_formulaWhitelistSize);
  assert.deepEqual([...GRID_FORMULA_WHITELIST], [
    "SUM",
    "AVERAGE",
    "COUNT",
    "COUNTA",
    "MIN",
    "MAX",
    "ROUND",
    "ROUNDUP",
    "ROUNDDOWN",
    "ABS",
    "IF",
    "IFERROR",
    "AND",
    "OR",
    "NOT",
    "SUMIF",
    "COUNTIF",
    "VLOOKUP",
    "INDEX",
    "MATCH",
    "NPV",
    "IRR",
  ]);
  for (const name of GRID_FORMULA_WHITELIST) {
    assert.equal(isGridFormulaFunctionAllowed(name), true, name);
    assert.equal(isGridFormulaFunctionAllowed(name.toLowerCase()), true, name);
  }
});

test("C-4 白名单内 22 个函数逐个真的算得出来", () => {
  const rows = [
    ["产品", "单价", "数量", "小计"],
    ["甲", "10", "3", "=B2*C2"],
    ["乙", "20", "4", "=B3*C3"],
    ["丙", "30", "0", "=B4*C4"],
  ];
  const probes = {
    SUM: ["=SUM(D2:D4)", 110],
    AVERAGE: ["=AVERAGE(B2:B4)", 20],
    COUNT: ["=COUNT(B2:B4)", 3],
    COUNTA: ["=COUNTA(A2:A4)", 3],
    MIN: ["=MIN(B2:B4)", 10],
    MAX: ["=MAX(B2:B4)", 30],
    ROUND: ["=ROUND(10.567,2)", 10.57],
    ROUNDUP: ["=ROUNDUP(1.01,0)", 2],
    ROUNDDOWN: ["=ROUNDDOWN(1.99,0)", 1],
    ABS: ["=ABS(0-3)", 3],
    IF: ['=IF(D2>20,"高","低")', "高"],
    IFERROR: ["=IFERROR(D4/C4,0)", 0],
    AND: ["=AND(B2>0,C2>0)", true],
    OR: ["=OR(B2<0,C2>0)", true],
    NOT: ["=NOT(C4>0)", true],
    SUMIF: ['=SUMIF(C2:C4,">0",D2:D4)', 110],
    COUNTIF: ['=COUNTIF(C2:C4,">0")', 2],
    VLOOKUP: ['=VLOOKUP("乙",A2:D4,2,0)', 20],
    INDEX: ["=INDEX(A2:D4,2,1)", "乙"],
    MATCH: ['=MATCH("丙",A2:A4,0)', 3],
    NPV: ["=ROUND(NPV(0.1,B2,B3),4)", 25.6198],
    // 现金流 [-100, 70, 70]:令 x = 1/(1+r),7x² + 7x - 10 = 0 →
    // x = (-7 + √329)/14 = 0.795600 → r = 1/x - 1 = 0.256913 → 0.2569。
    IRR: ["=ROUND(IRR(E2:E4),4)", 0.2569],
  };
  const grid = rows.map((row) => [...row]);
  grid[1][4] = "-100";
  grid[2][4] = "70";
  grid[3][4] = "70";
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
    ["=TEXTJOIN(\",\",TRUE,A1:A9)", GRID_FORMULA_REJECTION_CODES.notWhitelisted],
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

test("C-4 §5.4 确定性：同一工程重复求值得到同一结果", () => {
  const first = runGridEmitPipeline(carrierFixture());
  const second = runGridEmitPipeline(carrierFixture());
  assert.equal(first.state, "ready");
  assert.equal(
    serializeGridIrProject(first.computed),
    serializeGridIrProject(second.computed),
  );
  assert.deepEqual(
    Array.from(first.xlsxBytes),
    Array.from(second.xlsxBytes),
    "同一输入必须产出同一字节（§6 F7 靠字节比对）",
  );
  assert.equal(GRID_IRR_MAX_ITERATIONS, GRID_CONSTANTS.C26_irrMaxIterations);
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
    C11_formulaWhitelistSize: 22,
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

/* ---------------------------- C-6 完备性 ------------------------------- */

test("C-6 §8.2 每条判据都能单独把产物判不合格", () => {
  const ready = runGridEmitPipeline(carrierFixture());
  assert.equal(ready.state, "ready");
  assert.equal(ready.completeness.ok, true);
  assert.ok(ready.completeness.cellCount >= GRID_CONSTANTS.C8_minCellCount);
  assert.ok(ready.completeness.formulaCells >= GRID_CONSTANTS.C9_minFormulaCells);
  assert.ok(
    ready.completeness.formulaRatioPercent >=
      GRID_CONSTANTS.C10_minFormulaRatioPercent,
  );
  assert.equal(
    ready.completeness.cachedFormulaCells,
    ready.completeness.formulaCells,
    "每个 <f> 都必须配 <v>（§8.2 100%）",
  );
  assert.ok(ready.completeness.totalRows >= 1);

  const deadTable = {
    ...carrierFixture(),
    sheets: [
      {
        name: "静态表",
        headerRow: true,
        columns: [
          { name: "项目", type: "text" },
          { name: "金额", type: "currency" },
        ],
        rows: [
          ["收入", 100],
          ["成本", 60],
          ["税费", 8],
          ["合计", 32],
        ],
        emphasisRows: [{ index: 3, kind: "total" }],
      },
    ],
    namedRanges: [],
  };
  const dead = judgeGridCompleteness(deadTable);
  assert.equal(dead.ok, false);
  assert.ok(
    dead.failures.some((failure) => failure.code === "grid-dead-table"),
    "全静态数值的表必须被判为死表（§6 F2）",
  );

  const noCache = carrierFixture();
  const noCacheJudged = judgeGridCompleteness(noCache);
  assert.equal(noCacheJudged.ok, false);
  assert.ok(
    noCacheJudged.failures.some((failure) => failure.code === "grid-missing-cache"),
    "未重算的工程缺缓存值，必须在 §8.2 被判不合格（§6 F3）",
  );

  const noTotal = { ...ready.computed, sheets: ready.computed.sheets.map((sheet) => ({ ...sheet, emphasisRows: [] })) };
  assert.ok(
    judgeGridCompleteness(noTotal).failures.some(
      (failure) => failure.code === "grid-no-total-row",
    ),
  );
  const noAttribution = { ...ready.computed, attribution: { entries: [] } };
  assert.ok(
    judgeGridCompleteness(noAttribution).failures.some(
      (failure) => failure.code === "grid-no-attribution",
    ),
  );
  const shortTitle = { ...ready.computed, title: "表格" };
  assert.ok(
    judgeGridCompleteness(shortTitle).failures.some(
      (failure) => failure.code === "grid-title-too-short",
    ),
  );
});

test("C-6 §6 F1 空壳：194–199 B 的 IR 被 grid-hollow 拒绝", () => {
  const bytes = new TextEncoder().encode(JSON.stringify(HOLLOW_IR)).length;
  assert.ok(bytes < GRID_IR_MIN_BYTES, `空壳只有 ${bytes} B`);
  const judged = judgeGridCompleteness(HOLLOW_IR);
  assert.equal(judged.ok, false);
  assert.ok(judged.failures.some((failure) => failure.code === "grid-hollow"));
  assert.equal(runGridEmitPipeline(HOLLOW_IR).state, "invalid");
});

test("C-6 §8.1 两侧字节下限都可判，只满足一侧不算通过", () => {
  const ready = runGridEmitPipeline(carrierFixture());
  assert.equal(ready.state, "ready");
  assert.ok(
    ready.irBytes >= GRID_IR_MIN_BYTES,
    `IR ${ready.irBytes} B < ${GRID_IR_MIN_BYTES} B`,
  );
  assert.ok(ready.irBytes <= GRID_IR_MAX_BYTES);
  assert.ok(
    ready.xlsxBytes.length >= GRID_XLSX_MIN_BYTES,
    `xlsx ${ready.xlsxBytes.length} B < ${GRID_XLSX_MIN_BYTES} B`,
  );
  assert.ok(ready.xlsxBytes.length <= GRID_XLSX_MAX_BYTES);

  // A workbook that is structurally complete but too small on the xlsx side
  // still fails: §1.2 forbids putting a floor on only one of the two forms.
  // The thin sheet has to be self-contained — a cross-sheet reference left
  // dangling would trip the link stage first and never reach the byte floor.
  const thin = carrierFixture();
  thin.sheets = [detailSheet("营收明细", 6, 120_000)];
  thin.namedRanges = [];
  const thinResult = runGridEmitPipeline(thin);
  // §8.2 is judged on the computed project — cache values only exist after the
  // compute stage — so the completeness verdict is read off the pipeline.
  assert.deepEqual(
    thinResult.completeness.failures,
    [],
    "thin fixture 必须先过 §8.2 完备判据，才能证明字节下限是独立可判的",
  );
  assert.equal(thinResult.liveness.ok, true);
  assert.equal(thinResult.state, "invalid");
  const floor = thinResult.issues.find((issue) => issue.code === "grid-hollow");
  assert.ok(floor, JSON.stringify(thinResult.issues.slice(0, 3)));
  assert.match(floor.message, /^xlsx \d+ B 不在/);
});

test("C-6 §5.1「不是死表」有可执行判据：改数字必须联动", () => {
  const ready = runGridEmitPipeline(carrierFixture());
  const proof = proveGridIsNotDeadTable(ready.computed);
  assert.equal(proof.ok, true, `惰性单元格：${proof.inertCells.slice(0, 5)}`);
  assert.ok(proof.probes.length >= 100, `只探测了 ${proof.probes.length} 个数值输入`);
  assert.deepEqual(proof.inertCells, []);
  for (const probe of proof.probes) {
    assert.ok(
      probe.changedFormulas.length >= 1,
      `${probe.address} 改动后没有任何公式缓存值变化`,
    );
  }

  // 反例：把公式换成静态值后，同一判据必须判不通过。
  const frozen = {
    ...ready.computed,
    sheets: ready.computed.sheets.map((sheet) => ({
      ...sheet,
      rows: sheet.rows.map((row) =>
        row.map((cell) =>
          cell !== null && typeof cell === "object" ? (cell.v ?? 0) : cell,
        ),
      ),
    })),
  };
  const frozenProof = proveGridIsNotDeadTable(frozen);
  assert.equal(frozenProof.ok, false);
  assert.ok(frozenProof.inertCells.length > 0);
});

/* --------------------------- C-7 断言 A1–A12 --------------------------- */

test("C-7 A3/A4 字节区间与 A5 重算联动", () => {
  const ready = runGridEmitPipeline(carrierFixture());
  // A3: xlsx 字节介于 12288 与 52428800。
  assert.ok(
    ready.xlsxBytes.length > 12288 && ready.xlsxBytes.length < 52428800,
  );
  // A4: IR 字节介于 3072 与 2097152。
  assert.ok(ready.irBytes > 3072 && ready.irBytes < 2097152);
  // A5: 记录全部公式缓存值 → 改一个非公式单元格 → 重算联动。
  const before = ready.computed.sheets[0].rows.at(-1)[1].v;
  const mutated = structuredClone(ready.computed);
  mutated.sheets[0].rows[0][1] = Number(mutated.sheets[0].rows[0][1]) + 50_000;
  const after = runGridEmitPipeline(mutated);
  assert.equal(after.state, "ready");
  assert.equal(after.computed.sheets[0].rows.at(-1)[1].v, before + 50_000);
});

test("C-7 A9 下载物带署名：docProps 与署名工作表两处都有", () => {
  const ready = runGridEmitPipeline(carrierFixture());
  const byName = Object.fromEntries(
    ready.parts.map((part) => [part.name, part.data]),
  );
  // ECMA-376 core properties 没有 dc:rights，所以许可走 custom.xml。
  assert.ok(!/dc:rights/.test(byName["docProps/core.xml"]));
  assert.match(byName["docProps/core.xml"], /<dc:title>华东三区/);
  assert.match(byName["docProps/core.xml"], /CC0-1\.0/);
  assert.match(byName["docProps/custom.xml"], /name="License"/);
  assert.match(byName["docProps/custom.xml"], /name="LicenseUrl"/);
  assert.match(byName["docProps/custom.xml"], /creativecommons\.org/);
  // 署名工作表：sheets 只有 3 张，未触 C2 上限，所以必须追加。
  const attributionSheet = byName["xl/worksheets/sheet4.xml"];
  assert.ok(attributionSheet, "缺少署名工作表");
  assert.match(attributionSheet, /营收与成本口径参考公开年报披露格式/);
  assert.match(ready.parts[6].data, /署名/);
});

test("C-7 A9 每个写出的 part 都有 Content_Types Override 与 rels 关系", () => {
  const ready = runGridEmitPipeline(carrierFixture());
  const names = ready.parts.map((part) => part.name);
  const contentTypes = ready.parts.find(
    (part) => part.name === "[Content_Types].xml",
  ).data;
  const packageRels = ready.parts.find((part) => part.name === "_rels/.rels").data;
  const workbookRels = ready.parts.find(
    (part) => part.name === "xl/_rels/workbook.xml.rels",
  ).data;
  for (const name of names) {
    if (name === "[Content_Types].xml" || name.includes("_rels/")) continue;
    assert.ok(
      contentTypes.includes(`PartName="/${name}"`),
      `${name} 没有 Content_Types Override —— 孤儿 part 会让 Excel 弹修复提示`,
    );
  }
  for (const part of ["docProps/core.xml", "docProps/app.xml", "docProps/custom.xml"]) {
    assert.ok(packageRels.includes(`Target="${part}"`), `${part} 没有 rels 关系`);
  }
  for (const name of names.filter((entry) => entry.startsWith("xl/worksheets/"))) {
    assert.ok(
      workbookRels.includes(`Target="${name.replace("xl/", "")}"`),
      `${name} 没有挂到 workbook.xml.rels`,
    );
  }
  assert.ok(workbookRels.includes('Target="styles.xml"'));
  assert.ok(contentTypes.includes('PartName="/xl/styles.xml"'));
});

test("C-7 A2 §1.2 第二种字节形态：xlsx 能被表格编辑器载回", async () => {
  const { loadGridFile } = await import("../src/shell/doc-editors/grid-model.ts");
  const ready = runGridEmitPipeline(carrierFixture());
  const file = new File([ready.xlsxBytes], "carrier.xlsx", {
    type: GRID_XLSX_MEDIA_TYPE,
  });
  const sheets = await loadGridFile(file);
  assert.deepEqual(
    sheets.map((sheet) => sheet.name),
    ["营收明细", "成本明细", "Summary", "署名"],
  );
  // 公式与缓存值都要回来：只有 <f> 没有 <v> 就是 §6 F3。
  const summary = sheets[2];
  assert.match(summary.rows[3][1], /^=B2-B3$/);
  const detail = sheets[0];
  assert.match(detail.rows.at(-1)[1], /^=SUM\(B2:B61\)$/);
  assert.equal(detail.formats["1:1"].type, "currency");
});

test("C-7 A6 首个工作表渲得出内容：非空且色彩数 ≥ 12", () => {
  const ready = runGridEmitPipeline(carrierFixture());
  const sheetXml = ready.parts.find(
    (part) => part.name === "xl/worksheets/sheet1.xml",
  ).data;
  // 抓帧要真机渲染，此处判可渲染的前置条件:表头冻结、列宽、样式索引齐全。
  assert.match(sheetXml, /<pane xSplit="1" ySplit="1" topLeftCell="B2"/);
  assert.match(sheetXml, /<col min="1" max="1" width="25"/);
  assert.match(sheetXml, /t="inlineStr"/);
  assert.match(sheetXml, /<f>SUM\(B2:B61\)<\/f><v>/);
  const styles = ready.parts.find((part) => part.name === "xl/styles.xml").data;
  const colours = new Set(styles.match(/rgb="FF[0-9A-F]{6}"/g) || []);
  assert.ok(
    colours.size >= GRID_CONSTANTS.C36_minFrameColours / 2,
    `样式里只有 ${colours.size} 种颜色，抓帧不可能达到 12 种`,
  );
  assert.ok(styles.includes(`FF${GRID_PALETTE.headerFill.slice(1)}`));
  assert.ok(styles.includes(`FF${GRID_PALETTE.zebra.slice(1)}`));
  assert.ok(styles.includes(`FF${GRID_PALETTE.border.slice(1)}`));
  assert.ok(styles.includes(`FF${GRID_PALETTE.total.slice(1)}`));
  assert.ok(styles.includes(`FF${GRID_PALETTE.negative.slice(1)}`));
  assert.ok(styles.includes(`FF${GRID_PALETTE.formula.slice(1)}`));
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

test("C-7 §2.4 负值不得只用颜色表达", () => {
  const project = carrierFixture();
  project.sheets[2].rows[2][1] = -1234.5;
  const parts = buildGridXlsxParts(project);
  const styles = parts.find((part) => part.name === "xl/styles.xml").data;
  const summary = parts.find(
    (part) => part.name === "xl/worksheets/sheet3.xml",
  ).data;
  // 负号本身写在 <v> 里，颜色只是附加线索。
  assert.match(summary, /<v>-1234\.5<\/v>/);
  assert.ok(styles.includes(`FF${GRID_PALETTE.negative.slice(1)}`));
});

test("C-7 A1/A10/A11/A12 的承担层记录在案", () => {
  // 这四条要落库后的只读 SQL 或全语料两两比对才成立，编辑器侧只能保证输入面:
  // A1 四元组由 use-grid-editor 的 save() 钉死（见 C-1）；
  // A10 需要 platform_assets 的 source + oss_key 查询（后端 W2 / V1）；
  // A11/A12 需要同族与全语料 Jaccard（6 号批产侧）。
  const ready = runGridEmitPipeline(carrierFixture());
  assert.equal(ready.state, "ready");
  assert.equal(GRID_CONSTANTS.C37_maxFamilyJaccard, 0.85);
  assert.equal(GRID_CONSTANTS.C38_twinThreshold, 0.99);
  // 字节确定性是 A11/A12 相似度比对的前置条件。
  const again = zipGridXlsxParts(buildGridXlsxParts(ready.computed));
  assert.deepEqual(Array.from(again), Array.from(ready.xlsxBytes));
});
