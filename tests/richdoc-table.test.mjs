// 富文档表格与块级图 · 合并拆分 / 列宽 / 表头重复 / 底色对齐 / 图片不丢（W15）
//
// 与 `richdoc-typography.test.mjs` 同一条判据：**「做出来但导出丢失，等于没做」**。
// 所以每一条能力都走真 docx 往返——`tiptapJsonToDocxBlob()` → 真 `docx` 包打出
// 真 OOXML → `jszip` 解开 `word/document.xml` → 断言 `w:gridSpan` / `w:vMerge` /
// `w:tcW` / `w:tblHeader` / `w:shd` / `w:vAlign` 真的在里面。
//
// **P5（行内图与环绕）也落在这份文件里**，因为任务书只给了三份测试文件的名额，
// 而图片与表格同属「块级对象的导出」这一类；排版那份管的是段落属性。

import test from "node:test";
import assert from "node:assert/strict";

import JSZip from "jszip";

import {
  richDocDocxCellProperties,
  richDocDocxRowProperties,
} from "../src/shell/doc-editors/rich-doc-model.ts";
import { tiptapJsonToDocxBlob } from "../src/shell/doc-editors/docx-export.ts";

// --- 往返台 ----------------------------------------------------------------

async function exportXml(content) {
  const blob = await tiptapJsonToDocxBlob("w15", { type: "doc", content });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file("word/document.xml").async("string");
}

const paragraph = (text) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

/** 一个单元格。`kind` 用来区分表头格与普通格（表头行判定看的是这个）。 */
function cell(attrs, text = "格", kind = "tableCell") {
  return { type: kind, attrs, content: [paragraph(text)] };
}

const row = (cells) => ({ type: "tableRow", content: cells });
const table = (rows) => ({ type: "table", content: rows });

/** 第 n 个 `<w:tcPr>`。断言挂在单元格属性块上，免得整份 XML 里别处的同名
 *  字串把用例喂绿（表格自身的 `w:tblW` 就带 `w:type=`）。 */
function cellProperties(xml, index = 0) {
  const all = xml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/g) || [];
  return all[index] || "";
}

/** 第 n 个 `<w:trPr>`（行属性块）。 */
function rowProperties(xml, index = 0) {
  const all = xml.match(/<w:trPr>[\s\S]*?<\/w:trPr>/g) || [];
  return all[index] || "";
}

// --- P4 合并 / 拆分 ---------------------------------------------------------

test("横向合并 · colspan 往返 docx 变成 w:gridSpan", async () => {
  assert.equal(richDocDocxCellProperties({ colspan: 2 }).columnSpan, 2);

  const xml = await exportXml([
    table([row([cell({ colspan: 2 }, "合并两列"), cell({}, "右")])]),
  ]);
  assert.match(cellProperties(xml, 0), /<w:gridSpan w:val="2"\/>/);
});

test("纵向合并 · rowspan 往返 docx 变成 w:vMerge restart", async () => {
  assert.equal(richDocDocxCellProperties({ rowspan: 3 }).rowSpan, 3);

  const xml = await exportXml([
    table([
      row([cell({ rowspan: 2 }, "跨两行"), cell({}, "右上")]),
      row([cell({}, "右下")]),
    ]),
  ]);
  assert.match(cellProperties(xml, 0), /<w:vMerge w:val="restart"\/>/);
});

test("拆分单元格 · colspan 回到 1 之后 docx 里不留 gridSpan 残留", async () => {
  // 「拆分」在 ProseMirror 里就是把 colspan/rowspan 写回 1。如果导出侧用
  // `> 0` 而不是 `> 1` 判断，拆完还会写一个 gridSpan=1，Word 里看着没合并
  // 但表格网格已经被改脏。
  assert.equal(richDocDocxCellProperties({ colspan: 1 }).columnSpan, undefined);
  assert.equal(richDocDocxCellProperties({ rowspan: 1 }).rowSpan, undefined);

  const xml = await exportXml([table([row([cell({ colspan: 1 }, "拆开了")])])]);
  assert.doesNotMatch(xml, /w:gridSpan/);
  assert.doesNotMatch(xml, /w:vMerge/);
});

test("合并数上界 · 64 列封顶，脏数据不会把 docx 打成非法表格", () => {
  assert.equal(richDocDocxCellProperties({ colspan: 9999 }).columnSpan, 64);
  assert.equal(richDocDocxCellProperties({ rowspan: 9999 }).rowSpan, 64);
  assert.equal(richDocDocxCellProperties({ colspan: "abc" }).columnSpan, undefined);
});

// --- P4 列宽 ---------------------------------------------------------------

test("列宽 · colwidth 像素往返 docx 变成 dxa 缇（96px = 1 英寸 = 1440 缇）", async () => {
  const properties = richDocDocxCellProperties({ colwidth: [192] });
  assert.deepEqual(properties.width, { size: 2880, type: "dxa" });

  const xml = await exportXml([table([row([cell({ colwidth: [192] }, "定宽")])])]);
  assert.match(cellProperties(xml, 0), /<w:tcW w:type="dxa" w:w="2880"\/>/);
});

test("列宽 · 被合并的多列宽度相加，不是只取第一个", () => {
  // ProseMirror 的 colwidth 对合并格是「每个被合并列一个值」。只取第一个的话
  // 合并格导出后会缩成一列宽。
  assert.deepEqual(
    richDocDocxCellProperties({ colspan: 2, colwidth: [96, 96] }).width,
    { size: 2880, type: "dxa" },
  );
});

test("列宽 · 没设 / 脏值时不写 tcW，交回 Word 自动布局", async () => {
  assert.equal(richDocDocxCellProperties({}).width, undefined);
  assert.equal(richDocDocxCellProperties({ colwidth: null }).width, undefined);
  assert.equal(richDocDocxCellProperties({ colwidth: [0, -5] }).width, undefined);

  const xml = await exportXml([table([row([cell({}, "自动")])])]);
  assert.doesNotMatch(cellProperties(xml, 0), /w:tcW/);
});

// --- P4 表头行重复 ----------------------------------------------------------

test("表头重复 · 首行全是 tableHeader 时往返 docx 带 w:tblHeader", async () => {
  const header = row([
    cell({}, "姓名", "tableHeader"),
    cell({}, "部门", "tableHeader"),
  ]);
  assert.deepEqual(richDocDocxRowProperties(header, true), { tableHeader: true });

  const xml = await exportXml([table([header, row([cell({}, "张三"), cell({}, "办公室")])])]);
  assert.match(rowProperties(xml, 0), /<w:tblHeader\/>/);
});

test("表头重复 · 只认第一行；第二行即使全是表头格也不重复", () => {
  const header = row([cell({}, "姓名", "tableHeader")]);
  assert.deepEqual(richDocDocxRowProperties(header, false), {});
});

test("表头重复 · 首行混着普通格就不算表头行（半行表头不该跨页重复）", async () => {
  const mixed = row([cell({}, "姓名", "tableHeader"), cell({}, "备注")]);
  assert.deepEqual(richDocDocxRowProperties(mixed, true), {});

  const xml = await exportXml([table([mixed])]);
  assert.doesNotMatch(xml, /w:tblHeader/);
});

// --- P4 底色与垂直对齐 ------------------------------------------------------

test("单元格底色 · 往返 docx 变成 w:shd，六位十六进制统一大写", async () => {
  assert.deepEqual(richDocDocxCellProperties({ backgroundColor: "#ffcc00" }).shading, {
    fill: "FFCC00",
    type: "clear",
  });

  const xml = await exportXml([table([row([cell({ backgroundColor: "#ffcc00" }, "黄")])])]);
  assert.match(cellProperties(xml, 0), /<w:shd w:fill="FFCC00" w:val="clear"\/>/);
});

test("单元格底色 · 认不出的色值不写 shd，而不是写一个坏值进 docx", () => {
  assert.equal(richDocDocxCellProperties({ backgroundColor: "红色" }).shading, undefined);
  assert.equal(richDocDocxCellProperties({ backgroundColor: "#fc0" }).shading, undefined);
  assert.equal(richDocDocxCellProperties({ backgroundColor: "" }).shading, undefined);
});

test("垂直对齐 · 三档往返 docx 变成 w:vAlign", async () => {
  assert.equal(richDocDocxCellProperties({ verticalAlign: "center" }).verticalAlign, "center");
  assert.equal(richDocDocxCellProperties({ verticalAlign: "bottom" }).verticalAlign, "bottom");
  assert.equal(richDocDocxCellProperties({ verticalAlign: "斜着" }).verticalAlign, undefined);

  const xml = await exportXml([table([row([cell({ verticalAlign: "center" }, "居中")])])]);
  assert.match(cellProperties(xml, 0), /<w:vAlign w:val="center"\/>/);
});

test("多个属性同时设 · 互不覆盖，一个格子里全都在", async () => {
  const xml = await exportXml([
    table([
      row([
        cell(
          { colspan: 2, colwidth: [96, 96], backgroundColor: "#DDEEFF", verticalAlign: "bottom" },
          "全都要",
        ),
      ]),
    ]),
  ]);
  const tcPr = cellProperties(xml, 0);
  assert.match(tcPr, /<w:gridSpan w:val="2"\/>/);
  assert.match(tcPr, /w:w="2880"/);
  assert.match(tcPr, /w:fill="DDEEFF"/);
  assert.match(tcPr, /<w:vAlign w:val="bottom"\/>/);
});

test("表格里的段落照样吃排版属性（选中表格内文字调行距不该没反应）", async () => {
  const xml = await exportXml([
    table([
      row([
        {
          type: "tableCell",
          attrs: {},
          content: [
            {
              type: "paragraph",
              attrs: { lineHeight: "2", firstLineChars: 2 },
              content: [{ type: "text", text: "格内正文" }],
            },
          ],
        },
      ]),
    ]),
  ]);
  assert.match(xml, /w:line="480"/);
  assert.match(xml, /w:firstLineChars="200"/);
});

// --- P5 块级图：整张丢失是本波修掉的既有 bug --------------------------------

/** 1×1 PNG，用作「真的有图片字节」的替身。 */
const PNG_1X1 = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84,
  120, 218, 99, 252, 255, 31, 0, 3, 3, 2, 0, 238, 254, 245, 191, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130,
]);

/** 把网络那一跳换成本地字节。测的是序列化，不是 fetch。 */
async function withStubbedFetch(run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(PNG_1X1, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("块级图 · 图片字节真的进了 docx（w:drawing + 媒体文件）", async () => {
  const blob = await withStubbedFetch(() =>
    tiptapJsonToDocxBlob("w15", {
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://example.com/a.png", alt: "示意图" } },
      ],
    }),
  );
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml").async("string");

  // 这条以前是红的：`image` 在 blockChildren 里没有分支，掉进段落分支后
  // `inlineChildren` 遍历它的 content（图片节点没有 content），
  // 导出是一个空段落——整张图凭空消失。
  assert.match(xml, /<w:drawing>/);
  assert.ok(
    Object.keys(zip.files).some((name) => name.startsWith("word/media/")),
    "docx 包里应当有 word/media/ 下的图片文件",
  );
});

test("块级图 · 取不到图时退回替代文字，而不是留一个空段落", async () => {
  // 「明确告知丢了什么」比「静默丢一张图」强：用户打开 docx 至少看得见
  // 这里原本有张图、叫什么名字。
  const xml = await exportXml([
    { type: "image", attrs: { src: "not-a-url", alt: "季度趋势图" } },
  ]);
  assert.match(xml, /季度趋势图/);
});

test("环绕 · 上下型独占一个段落，嵌入行内与正文同段", async () => {
  // 这是两种环绕方式在 OOXML 里唯一的真实差别，也是用户在屏幕上看到的差别。
  const topBottom = await withStubbedFetch(() =>
    exportXml([
      paragraph("图前正文"),
      { type: "image", attrs: { src: "https://example.com/a.png", wrap: "top-bottom" } },
    ]),
  );
  // 正文与图各自一个 <w:p>：图不在正文那一段里。
  const topBottomParagraphs = topBottom.match(/<w:p>[\s\S]*?<\/w:p>/g) || [];
  assert.equal(topBottomParagraphs.length, 2);
  assert.doesNotMatch(topBottomParagraphs[0], /<w:drawing>/);
  assert.match(topBottomParagraphs[1], /<w:drawing>/);

  const inline = await withStubbedFetch(() =>
    exportXml([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "图前正文" },
          { type: "image", attrs: { src: "https://example.com/a.png", wrap: "inline" } },
        ],
      },
    ]),
  );
  const inlineParagraphs = inline.match(/<w:p>[\s\S]*?<\/w:p>/g) || [];
  assert.equal(inlineParagraphs.length, 1);
  assert.match(inlineParagraphs[0], /图前正文/);
  assert.match(inlineParagraphs[0], /<w:drawing>/);
});
