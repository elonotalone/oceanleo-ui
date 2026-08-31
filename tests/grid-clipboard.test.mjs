import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildGridClipboardPayload,
  gridFormatFromNumberPattern,
  normalizeGridPastedValue,
  parseGridClipboardHtml,
  parseGridClipboardText,
  planGridPaste,
  readGridClipboard,
} from "../src/shell/doc-editors/grid-structure.ts";

const GRID_MAX_ROWS = 10_000;
const GRID_MAX_COLS = 256;

/**
 * 真 Excel 剪贴板片段（Office 365 / WPS 复制一片区域时写进 `text/html` 的形状）：
 * `xmlns:x` 头、`<!--` 包住的 `<style>`、`class=xl68` 与内联样式并存、
 * 属性不加引号、`mso-number-format` 用 `\0022` 与反斜杠转义。
 * 这几样任缺一样都会让「照着文档写」的解析器在真实剪贴板上当场散架。
 */
const EXCEL_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta http-equiv=Content-Type content="text/html; charset=utf-8">
<style><!--table
	{mso-displayed-decimal-separator:"\\.";}
.xl65 {font-weight:700;}
--></style></head>
<body link="#0563C1" vlink="#954F72">
<table border=0 cellpadding=0 cellspacing=0 width=288 style='border-collapse:collapse;table-layout:fixed;width:216pt'>
 <col width=96 span=3 style='width:72pt'>
 <tr height=20 style='height:15.0pt'>
  <td colspan=3 height=20 class=xl68 style='height:15.0pt;font-weight:700;text-align:center;background:#FFFF00'>2026 &#24180;&#39044;&#31639;</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td height=20 class=xl65 style='height:15.0pt;font-weight:700'>&#31185;&#30446;</td>
  <td class=xl65 style='font-weight:700;text-align:right'>金额</td>
  <td class=xl65 style='font-weight:700;text-align:right'>占比</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td height=20 class=xl66 style='height:15.0pt'><b>研发</b></td>
  <td class=xl67 align=right style='mso-number-format:"\\0022¥\\0022\\#\\,\\#\\#0\\.00";color:#CF222E'>¥1,234.50</td>
  <td class=xl69 align=right style='mso-number-format:"0\\.0%"'>45.0%</td>
 </tr>
</table>
</body></html>`;

test("Excel 的 text/html 片段逐项落位：合并、对齐、数字格式、粗体、背景色", () => {
  const matrix = parseGridClipboardHtml(EXCEL_HTML);
  assert.ok(matrix, "真 Excel 片段必须解析出表格");
  assert.equal(matrix.height, 3);
  assert.equal(matrix.width, 3);

  // 合并：标题行 colspan=3，左上角带跨度，被盖住的两格补空串。
  const title = matrix.rows[0][0];
  assert.equal(title.value, "2026 年预算");
  assert.equal(title.colSpan, 3);
  assert.equal(matrix.rows[0][1].value, "");
  assert.equal(matrix.rows[0][2].value, "");

  // 基础样式：粗体（样式与 <b> 两条来源）、对齐、背景色。
  assert.equal(title.format.bold, true);
  assert.equal(title.format.align, "center");
  assert.equal(title.format.background, "#ffff00");
  assert.equal(matrix.rows[1][0].format.bold, true);
  assert.equal(matrix.rows[1][1].format.align, "right");
  assert.equal(matrix.rows[2][0].format.bold, true, "<b> 也要算粗体");
  assert.equal(matrix.rows[2][0].value, "研发");

  // 数字格式：货币与百分比各自的 type/decimals，且**值被还原成可求值的原始值**。
  const money = matrix.rows[2][1];
  assert.deepEqual(money.format, {
    align: "right",
    color: "#cf222e",
    type: "currency",
    decimals: 2,
  });
  assert.equal(money.value, "1234.50", "¥ 与千分位必须剥掉，否则 SUM 算出 0");

  const ratio = matrix.rows[2][2];
  assert.equal(ratio.format.type, "percent");
  assert.equal(ratio.format.decimals, 1);
  assert.equal(ratio.value, "45.0%");
});

test("数字格式串分类不会把 #,##0.00 当成日期", () => {
  assert.deepEqual(gridFormatFromNumberPattern('"¥"#,##0.00'), {
    type: "currency",
    decimals: 2,
  });
  assert.deepEqual(gridFormatFromNumberPattern("#,##0.00"), {
    type: "number",
    decimals: 2,
  });
  assert.deepEqual(gridFormatFromNumberPattern("0.0%"), {
    type: "percent",
    decimals: 1,
  });
  assert.deepEqual(gridFormatFromNumberPattern("yyyy\\-mm\\-dd"), { type: "date" });
  assert.deepEqual(gridFormatFromNumberPattern("[$-409]m/d/yy"), { type: "date" });
  assert.deepEqual(gridFormatFromNumberPattern("Short Date"), { type: "date" });
  assert.equal(gridFormatFromNumberPattern("General"), undefined);
  assert.deepEqual(gridFormatFromNumberPattern("@"), { type: "text" });
});

test("负数与括号负数在货币格式下都还原成可求值的数", () => {
  const currency = { type: "currency", decimals: 2 };
  assert.equal(normalizeGridPastedValue("¥1,234.50", currency), "1234.50");
  assert.equal(normalizeGridPastedValue("(1,234.50)", currency), "-1234.50");
  assert.equal(normalizeGridPastedValue("-¥98", currency), "-98");
  // 认不出就原样留着，不猜。
  assert.equal(normalizeGridPastedValue("待定", currency), "待定");
  assert.equal(normalizeGridPastedValue("2026-01-01", undefined), "2026-01-01");
});

test("text/plain 里带引号的字段含换行与制表符时不会错位", () => {
  // Excel 对含换行的单元格加引号；按 \n split 再按 \t split 的写法会在这里散架。
  const clipboard = [
    "科目\t备注",
    '研发\t"第一行\n第二行"',
    '市场\t"含\t制表符"',
    '财务\t"他说""好"""',
    "",
  ].join("\r\n");

  const matrix = parseGridClipboardText(clipboard);
  assert.equal(matrix.height, 4, "四行数据，末尾空行不算一行");
  assert.equal(matrix.width, 2);
  assert.equal(matrix.rows[1][1].value, "第一行\n第二行");
  assert.equal(matrix.rows[2][1].value, "含\t制表符");
  assert.equal(matrix.rows[3][1].value, '他说"好"');
  assert.equal(matrix.rows[3][0].value, "财务");
});

test("没有 text/html 时回落 text/plain，有则优先 html", () => {
  const plain = readGridClipboard({ text: "a\tb\nc\td" });
  assert.equal(plain.width, 2);
  assert.equal(plain.rows[1][1].value, "d");

  const preferred = readGridClipboard({
    html: EXCEL_HTML,
    text: "2026 年预算\t\t\n科目\t金额\t占比",
  });
  assert.equal(
    preferred.rows[0][0].colSpan,
    3,
    "两种格式都在时必须用 html，否则合并与格式全丢",
  );

  assert.equal(readGridClipboard({ html: "<p>不是表格</p>", text: "" }), null);
  assert.equal(
    readGridClipboard({ html: "<p>不是表格</p>", text: "回落\t到这里" }).rows[0][1]
      .value,
    "到这里",
  );
});

test("三种选区语义：单格铺开、形状一致逐格、整数倍平铺", () => {
  const matrix = parseGridClipboardText("1\t2\n3\t4");
  const limits = { maxRows: GRID_MAX_ROWS, maxCols: GRID_MAX_COLS };
  const valuesOf = (plan) =>
    plan.cells.map((cell) => `${cell.row}:${cell.col}=${cell.value}`);

  // 单格 → 以它为左上角铺开。
  const spread = planGridPaste(
    matrix,
    { firstRow: 5, lastRow: 5, firstCol: 2, lastCol: 2 },
    limits,
  );
  assert.equal(spread.repeatRows, 1);
  assert.equal(spread.repeatCols, 1);
  assert.deepEqual(valuesOf(spread), [
    "5:2=1",
    "5:3=2",
    "6:2=3",
    "6:3=4",
  ]);

  // 形状一致 → 逐格对应，不平铺。
  const exact = planGridPaste(
    matrix,
    { firstRow: 0, lastRow: 1, firstCol: 0, lastCol: 1 },
    limits,
  );
  assert.equal(exact.repeatRows, 1);
  assert.equal(exact.repeatCols, 1);
  assert.equal(exact.cells.length, 4);

  // 整数倍 → 平铺重复（Excel 行为）。
  const tiled = planGridPaste(
    matrix,
    { firstRow: 0, lastRow: 3, firstCol: 0, lastCol: 3 },
    limits,
  );
  assert.equal(tiled.repeatRows, 2);
  assert.equal(tiled.repeatCols, 2);
  assert.equal(tiled.cells.length, 16);
  assert.deepEqual(
    valuesOf(tiled).filter((entry) => entry.startsWith("2:") || entry.startsWith("3:")),
    ["2:0=1", "2:1=2", "2:2=1", "2:3=2", "3:0=3", "3:1=4", "3:2=3", "3:3=4"],
  );

  // 既不一致也不是整数倍 → 退回以左上角铺开，不静默丢数据。
  const mismatched = planGridPaste(
    matrix,
    { firstRow: 0, lastRow: 2, firstCol: 0, lastCol: 2 },
    limits,
  );
  assert.equal(mismatched.repeatRows, 1);
  assert.equal(mismatched.cells.length, 4);
  assert.equal(mismatched.truncated, false);
});

test("粘贴越界时截断并报出确切的截断行列数，不静默丢数据", () => {
  const matrix = parseGridClipboardText("1\t2\t3\n4\t5\t6");
  const plan = planGridPaste(
    matrix,
    {
      firstRow: GRID_MAX_ROWS - 1,
      lastRow: GRID_MAX_ROWS - 1,
      firstCol: GRID_MAX_COLS - 2,
      lastCol: GRID_MAX_COLS - 2,
    },
    { maxRows: GRID_MAX_ROWS, maxCols: GRID_MAX_COLS },
  );
  assert.equal(plan.truncated, true);
  assert.equal(plan.truncatedRows, 1, "两行只放得下一行");
  assert.equal(plan.truncatedCols, 1, "三列只放得下两列");
  assert.equal(plan.cells.length, 2);
  assert.equal(plan.target.lastRow, GRID_MAX_ROWS - 1);
  assert.equal(plan.target.lastCol, GRID_MAX_COLS - 1);

  const fits = planGridPaste(
    matrix,
    { firstRow: 0, lastRow: 0, firstCol: 0, lastCol: 0 },
    { maxRows: GRID_MAX_ROWS, maxCols: GRID_MAX_COLS },
  );
  assert.equal(fits.truncated, false);
  assert.equal(fits.truncatedRows, 0);
  assert.equal(fits.truncatedCols, 0);
});

test("粘贴计划把 HTML 的合并跨度转成 GridRange，越界处收窄", () => {
  const matrix = parseGridClipboardHtml(EXCEL_HTML);
  const plan = planGridPaste(
    matrix,
    { firstRow: 2, lastRow: 2, firstCol: 1, lastCol: 1 },
    { maxRows: GRID_MAX_ROWS, maxCols: GRID_MAX_COLS },
  );
  assert.deepEqual(plan.merges, [
    { firstRow: 2, lastRow: 2, firstCol: 1, lastCol: 3 },
  ]);

  const clipped = planGridPaste(
    matrix,
    { firstRow: 0, lastRow: 0, firstCol: GRID_MAX_COLS - 2, lastCol: GRID_MAX_COLS - 2 },
    { maxRows: GRID_MAX_ROWS, maxCols: GRID_MAX_COLS },
  );
  assert.deepEqual(clipped.merges, [
    {
      firstRow: 0,
      lastRow: 0,
      firstCol: GRID_MAX_COLS - 2,
      lastCol: GRID_MAX_COLS - 1,
    },
  ]);
});

test("复制同时写 text/plain 与 text/html，粘回 Excel 不丢格式", () => {
  const source = {
    height: 2,
    width: 2,
    rows: [
      [
        {
          value: "标题",
          colSpan: 2,
          format: { bold: true, align: "center", background: "#ffff00" },
        },
        { value: "" },
      ],
      [
        { value: "1234.50", format: { type: "currency", decimals: 2 } },
        { value: "含\t制表符\n与换行" },
      ],
    ],
  };
  const payload = buildGridClipboardPayload(source);

  assert.equal(
    payload.text,
    ['标题\t', '1234.50\t"含\t制表符\n与换行"'].join("\r\n"),
    "纯文本按 CSV 规则给含分隔符/换行的字段加引号",
  );
  assert.ok(payload.html.includes('colspan="2"'), "合并要写进 html");
  assert.ok(payload.html.includes("font-weight:700"));
  assert.ok(payload.html.includes("background:#ffff00"));
  assert.ok(payload.html.includes('mso-number-format:"¥#,##0.00"'));
  assert.ok(!payload.html.includes("<td></td><td>"), "被合并盖住的格子不再单独写一个 td");

  // 往返：自己写出去的 html 自己读回来，结构与格式一致。
  const roundTrip = parseGridClipboardHtml(payload.html);
  assert.equal(roundTrip.width, 2);
  assert.equal(roundTrip.rows[0][0].colSpan, 2);
  assert.equal(roundTrip.rows[0][0].format.bold, true);
  assert.equal(roundTrip.rows[0][0].format.background, "#ffff00");
  assert.equal(roundTrip.rows[1][0].format.type, "currency");
  assert.equal(roundTrip.rows[1][0].value, "1234.50");
  assert.equal(roundTrip.rows[1][1].value, "含\t制表符\n与换行");
});

test("受限扫描器不吃任意 CSS，也不被脚本与注释带偏", () => {
  const hostile = `<table>
    <!-- <tr><td>注释里的行不算行</td></tr> -->
    <tr><td style='content:">";font-weight:700;position:fixed;z-index:99'>A</td>
        <td style='background:url(javascript:alert(1))'>B</td></tr>
    <tr><td><script>document.title="x"</script>C</td><td>D</td></tr>
  </table>`;
  const matrix = parseGridClipboardHtml(hostile);
  assert.equal(matrix.height, 2, "注释里的 tr 不能算一行");
  assert.equal(matrix.rows[0][0].value, "A", "属性值里的 > 不能提前截断标签");
  assert.equal(matrix.rows[0][0].format.bold, true);
  assert.deepEqual(
    Object.keys(matrix.rows[0][0].format),
    ["bold"],
    "position/z-index/content 这些不在白名单里的声明一个都不许进来",
  );
  assert.equal(matrix.rows[0][1].format, undefined, "认不出的颜色值直接丢弃");
  assert.equal(matrix.rows[1][0].value, "C", "script 内容不进单元格");
  assert.equal(matrix.rows[1][1].value, "D");
});

/**
 * 复制方向的公式往返。两个读者，一份剪贴板：
 * Excel / 邮件读 `<td>` 正文，拿到的是算好的显示值；本编辑器读
 * `data-grid-formula`，拿回公式本身。`data-grid-origin` 让「粘到别处」
 * 按位移平移相对引用——Excel 就是这么干的，不平移等于把公式指向旧格子。
 */
test("复制出去的公式：外部读到显示值，粘回本编辑器读到公式", () => {
  const payload = buildGridClipboardPayload({
    origin: { row: 0, col: 0 },
    height: 1,
    width: 2,
    rows: [
      [
        { value: "3", formula: "=A1+1" },
        { value: "¥1,234.50", format: { type: "currency", decimals: 2 } },
      ],
    ],
  });

  assert.match(payload.html, /data-grid-origin="0:0"/);
  assert.match(
    payload.html,
    />3</,
    "td 正文必须是显示值，Excel 读的就是这里",
  );
  assert.match(payload.html, /data-grid-formula="=A1\+1"/);
  assert.equal(
    payload.text,
    "3\t¥1,234.50",
    "text/plain 给的是显示值：粘进纯文本编辑器不该是一串公式",
  );

  const back = parseGridClipboardHtml(payload.html);
  assert.deepEqual(back.origin, { row: 0, col: 0 });
  assert.equal(back.rows[0][0].formula, "=A1+1");
  assert.equal(
    back.rows[0][1].value,
    "1234.50",
    "货币显示值粘回来要还原成可求值的数字，值与格式分开存",
  );
});

test("粘到别处：相对引用按位移平移，$ 锁住的不动", () => {
  const matrix = parseGridClipboardHtml(
    buildGridClipboardPayload({
      origin: { row: 0, col: 0 },
      height: 1,
      width: 1,
      rows: [[{ value: "7", formula: "=A1+$B$2+C3" }]],
    }).html,
  );

  const plan = planGridPaste(
    matrix,
    { firstRow: 2, lastRow: 2, firstCol: 1, lastCol: 1 },
    { maxRows: GRID_MAX_ROWS, maxCols: GRID_MAX_COLS },
  );

  assert.equal(
    plan.cells[0].value,
    "=B3+$B$2+D5",
    "下移 2 行右移 1 列：A1→B3、C3→D5 跟着走，$B$2 一个字都不许动",
  );
});

test("平铺重复时每一块按自己那一格的位移平移", () => {
  const matrix = parseGridClipboardHtml(
    buildGridClipboardPayload({
      origin: { row: 0, col: 0 },
      height: 2,
      width: 1,
      rows: [[{ value: "1", formula: "=A1" }], [{ value: "2", formula: "=A2" }]],
    }).html,
  );

  const plan = planGridPaste(
    matrix,
    { firstRow: 0, lastRow: 3, firstCol: 0, lastCol: 0 },
    { maxRows: GRID_MAX_ROWS, maxCols: GRID_MAX_COLS },
  );

  assert.equal(plan.repeatRows, 2, "4 行选区装 2 行剪贴板 = 平铺两次");
  assert.deepEqual(
    plan.cells.map((cell) => cell.value),
    ["=A1", "=A2", "=A3", "=A4"],
    "第二块整体下移 2 行，不是两块都按同一个位移算",
  );
});

test("外部来源没有 origin，公式原样落地不乱平移", () => {
  const matrix = parseGridClipboardHtml(
    `<table><tr><td data-grid-formula="=A1+1">3</td></tr></table>`,
  );
  assert.equal(matrix.origin, undefined);

  const plan = planGridPaste(
    matrix,
    { firstRow: 5, lastRow: 5, firstCol: 5, lastCol: 5 },
    { maxRows: GRID_MAX_ROWS, maxCols: GRID_MAX_COLS },
  );
  assert.equal(
    plan.cells[0].value,
    "=A1+1",
    "不知道人家是从哪儿复制的，就不许猜位移",
  );
});

/* ═══════════════ 接线：把判据从纯函数往上挪一层 ═══════════════
 *
 * 上面十四条测的全是 `grid-structure.ts` 的纯函数。**纯函数全绿并不等于用户拿到
 * 了东西**：事件没挂上去，屏幕前的人看到的仍然是 S10 那个「一坨文本落进一个
 * 格子」，而上面每一条照样绿。真正的承诺落在两处接线上——
 * `GridStage.tsx` 把三个事件挂在滚动容器上、两种格式都读也都写；
 * `use-grid-editor.ts` 把 `readGridClipboard → planGridPaste` 收进**一次**
 * `mutate()`，并在截断时如实报数。
 *
 * 两份源码都带 JSX / React hook，`--experimental-strip-types` 加载不了，
 * 所以按本仓既有做法（`grid-carrier-contract.test.mjs:59-64`）读源文本断言。
 */
const GRID_STAGE_SOURCE = readFileSync(
  new URL("../src/shell/doc-editors/GridStage.tsx", import.meta.url),
  "utf8",
);
const GRID_EDITOR_SOURCE = readFileSync(
  new URL("../src/shell/doc-editors/use-grid-editor.ts", import.meta.url),
  "utf8",
);

// 注释里写的 `mutate()` 不是一次调用；数调用之前先摘注释。
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "");
}

/** 取 JSX 上 `onX={(event) => { … }}` 整个处理器的源文本（花括号配对，不靠缩进）。 */
function jsxHandlerBody(name) {
  const marker = `${name}={(event) => {`;
  const start = GRID_STAGE_SOURCE.indexOf(marker);
  assert.notEqual(start, -1, `GridStage.tsx 里找不到 ${name} 处理器`);
  let depth = 0;
  for (let i = start + marker.length - 2; i < GRID_STAGE_SOURCE.length; i += 1) {
    const ch = GRID_STAGE_SOURCE[i];
    if (ch === "{") depth += 1;
    else if (ch === "}" && (depth -= 1) === 0) {
      return stripComments(GRID_STAGE_SOURCE.slice(start, i + 1));
    }
  }
  return assert.fail(`${name} 处理器的花括号没有闭合`);
}

function hookCallbackBody(name) {
  const start = GRID_EDITOR_SOURCE.indexOf(`const ${name} = useCallback(`);
  assert.notEqual(start, -1, `use-grid-editor.ts 里找不到 ${name} 的 useCallback`);
  const rest = GRID_EDITOR_SOURCE.slice(start);
  const end = rest.search(/\n {2}(?:const|function|return|void) /);
  return stripComments(end === -1 ? rest : rest.slice(0, end));
}

test("GridStage 把 paste/copy/cut 挂在滚动容器上（没有这三行，上面十四条全是空转）", () => {
  const paste = jsxHandlerBody("onPaste");
  assert.match(
    paste,
    /getData\("text\/html"\)/,
    "不读 text/html 就等于回到 S10：Excel 的合并与格式全丢",
  );
  assert.match(paste, /getData\("text\/plain"\)/, "plain 是回落，也必须读");
  assert.match(
    paste,
    /pasteClipboard\(\{\s*html,\s*text\s*\}\)/,
    "两种格式都要交给 hook，由 readGridClipboard 决定优先级",
  );
  assert.match(
    paste,
    /preventDefault\(\)/,
    "接管成功必须挡掉浏览器默认粘贴，否则表格内容与一坨文本会同时落进去",
  );

  for (const name of ["onCopy", "onCut"]) {
    const body = jsxHandlerBody(name);
    assert.match(
      body,
      /setData\("text\/plain",/,
      `${name} 要写 text/plain：粘进纯文本编辑器不该是一堆标签`,
    );
    assert.match(
      body,
      /setData\("text\/html",/,
      `${name} 要写 text/html：这是「粘回 Excel 不丢格式」的唯一出处`,
    );
    assert.match(body, /preventDefault\(\)/);
  }
  assert.match(
    jsxHandlerBody("onCut"),
    /clearSelection\(\)/,
    "剪切要真的清掉原区域，否则它只是复制",
  );
});

test("带 <table> 的粘贴一定走表格通道，不被单值快路吞掉", () => {
  // `isSingleValuePaste` 是让「在格子里编辑时粘一个词」保持浏览器原生行为的快路。
  // 它一旦忘了先看 html 里有没有 <table>，Excel 复制来的整片区域就会从这条快路
  // 溜走，重新变成一坨文本——S10 原样复发，而纯函数层测不到。
  const guard = GRID_STAGE_SOURCE.slice(
    GRID_STAGE_SOURCE.indexOf("function isSingleValuePaste"),
  ).slice(0, 200);
  assert.match(
    guard,
    /if \(html && \/<table\/i\.test\(html\)\) return false;/,
    "html 里有 <table> 就必须判定为表格粘贴",
  );
  assert.match(
    guard,
    /return !\/\[\\t\\r\\n\]\/\.test\(text\)/,
    "没有 html 时，带制表符或换行的纯文本同样是表格，不能当单值",
  );
  assert.ok(
    jsxHandlerBody("onPaste").indexOf("isSingleValuePaste") <
      jsxHandlerBody("onPaste").indexOf("pasteClipboard"),
    "快路判断要在调用 hook 之前",
  );
});

test("hook 的 pasteClipboard：一次 mutate 写完整片，截断如实报数不静默丢", () => {
  const body = hookCallbackBody("pasteClipboard");

  assert.match(body, /readGridClipboard\(payload\)/, "html 优先/plain 回落的唯一入口");
  assert.match(body, /planGridPaste\(/);
  assert.match(
    body,
    /maxRows: GRID_MAX_ROWS/,
    "上限必须由 hook 传进纯函数层（grid-structure 不许 import grid-model 的值）",
  );

  assert.equal(
    [...body.matchAll(/\bmutate\(/g)].length,
    1,
    "整片粘贴只许一次 mutate()：撤一次回到粘贴前，不是一格一格撤",
  );

  assert.match(
    body,
    /plan\.truncated\s*\?/,
    "截断必须走到一条真的消息上；删掉这个分支就是静默丢数据",
  );
  assert.match(body, /gridPasteTruncationMessage\(plan, tt\)/);
  assert.match(
    body,
    /gridRangeAddress\(plan\.target\)/,
    "报截断要连「到底写进了哪个区域」一起给，否则用户不知道该去哪儿检查",
  );
});
