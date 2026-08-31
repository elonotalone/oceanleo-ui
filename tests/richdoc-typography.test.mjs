// 富文档排版 · 行距 / 缩进 / 段间距 / 多级编号（W15）
//
// 这份测试的核心判据是任务书那句：**「排版属性做出来但导出丢失，等于没做」**。
// 所以每一条排版能力都有一条 **docx 往返**用例，而且往返走的是真链路：
// `tiptapJsonToDocxBlob()` → 真 `docx` 包打出真 OOXML → `jszip` 解开
// `word/document.xml` → 断言 `w:spacing` / `w:ind` 真的在里面。
// 不 mock 序列化器——mock 掉的话「导出丢失」这个失败模式就永远测不出来。
//
// 另外锁两件在 docx 之前就会丢的事：
//   ① attr 不在 schema 里 ⇒ `setContent` 静默丢掉（`RichDocTypography` 没注册就是这样）；
//   ② 编号格式不沿嵌套继承 ⇒ 屏幕上「（一）」导出成「1.」。

import test from "node:test";
import assert from "node:assert/strict";

import JSZip from "jszip";
import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  RICHDOC_CN_PARAGRAPH_PRESET,
  RICHDOC_DEFAULT_PARAGRAPH_PRESET,
  RichDocTypography,
  parseRichDocLineHeight,
  richDocChineseNumeral,
  richDocDocxParagraphProperties,
  richDocListMarker,
} from "../src/shell/doc-editors/rich-doc-model.ts";
import { tiptapJsonToDocxBlob } from "../src/shell/doc-editors/docx-export.ts";

// --- 往返台 ----------------------------------------------------------------

/** 真导出一次，把 `word/document.xml` 原文取回来。 */
async function exportXml(content) {
  const blob = await tiptapJsonToDocxBlob("w15", { type: "doc", content });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file("word/document.xml").async("string");
}

/** 一个带排版属性的普通段落。 */
function paragraph(attrs, text = "正文") {
  return {
    type: "paragraph",
    attrs,
    content: [{ type: "text", text }],
  };
}

/** 段落属性块（`<w:pPr>…</w:pPr>`）。断言挂在这上面而不是整份 XML 上，
 *  免得正文里偶然出现同样的字串把用例喂绿。 */
function firstParagraphProperties(xml) {
  const match = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(xml);
  return match ? match[0] : "";
}

// --- P2 行距：两种模式 ------------------------------------------------------

test("行距 · 倍数档往返 docx 不丢（1.5 倍 = 360 缇 / lineRule=auto）", async () => {
  const properties = richDocDocxParagraphProperties({ lineHeight: "1.5" });
  assert.deepEqual(properties.spacing, { line: 360, lineRule: "auto" });

  const pPr = firstParagraphProperties(await exportXml([paragraph({ lineHeight: "1.5" })]));
  assert.match(pPr, /w:line="360"/);
  assert.match(pPr, /w:lineRule="auto"/);
});

test("行距 · 固定值档往返 docx 不丢（22pt = 440 缇 / lineRule=exactly）", async () => {
  const properties = richDocDocxParagraphProperties({ lineHeight: "22pt" });
  assert.deepEqual(properties.spacing, { line: 440, lineRule: "exactly" });

  const pPr = firstParagraphProperties(await exportXml([paragraph({ lineHeight: "22pt" })]));
  assert.match(pPr, /w:line="440"/);
  assert.match(pPr, /w:lineRule="exactly"/);
});

test("行距 · 两种写法分得开，非法值当没设", () => {
  assert.deepEqual(parseRichDocLineHeight("1.5"), { mode: "multiple", value: 1.5 });
  assert.deepEqual(parseRichDocLineHeight("22pt"), { mode: "exact", value: 22 });
  assert.equal(parseRichDocLineHeight(""), null);
  assert.equal(parseRichDocLineHeight("abc"), null);
  assert.equal(parseRichDocLineHeight("0"), null);
  assert.equal(parseRichDocLineHeight("-3"), null);
  // 上界：倍数 10、固定值 1000pt 之外一律不认，避免把文档撑成一页一行。
  assert.equal(parseRichDocLineHeight("11"), null);
  assert.equal(parseRichDocLineHeight("1001pt"), null);
});

// --- P2 缩进 ---------------------------------------------------------------

test("首行缩进 · 2 字符往返 docx 用 Word 原生的 firstLineChars", async () => {
  const properties = richDocDocxParagraphProperties({ firstLineChars: 2 });
  assert.equal(properties.indent.firstLineChars, 200);
  assert.equal(properties.indent.firstLine, 480);

  const pPr = firstParagraphProperties(await exportXml([paragraph({ firstLineChars: 2 })]));
  assert.match(pPr, /w:firstLineChars="200"/);
  assert.match(pPr, /w:firstLine="480"/);
});

test("悬挂缩进 · 2 字符往返 docx 给绝对缇（OOXML 没有 hangingChars）", async () => {
  const properties = richDocDocxParagraphProperties({ hangingChars: 2 });
  assert.equal(properties.indent.hanging, 480);
  assert.equal(properties.indent.firstLine, undefined);

  const pPr = firstParagraphProperties(await exportXml([paragraph({ hangingChars: 2 })]));
  assert.match(pPr, /w:hanging="480"/);
});

test("悬挂与首行互斥：两个都设时以悬挂为准，不会同时写进 docx", async () => {
  const properties = richDocDocxParagraphProperties({
    hangingChars: 2,
    firstLineChars: 4,
  });
  assert.equal(properties.indent.hanging, 480);
  assert.equal(properties.indent.firstLineChars, undefined);

  const pPr = firstParagraphProperties(
    await exportXml([paragraph({ hangingChars: 2, firstLineChars: 4 })]),
  );
  assert.match(pPr, /w:hanging="480"/);
  assert.doesNotMatch(pPr, /w:firstLineChars=/);
});

test("左右缩进 · 往返 docx 换算成缇（1 磅 = 20 缇）", async () => {
  const properties = richDocDocxParagraphProperties({
    indentLeft: 24,
    indentRight: 12,
  });
  assert.equal(properties.indent.left, 480);
  assert.equal(properties.indent.right, 240);

  const pPr = firstParagraphProperties(
    await exportXml([paragraph({ indentLeft: 24, indentRight: 12 })]),
  );
  assert.match(pPr, /w:left="480"/);
  assert.match(pPr, /w:right="240"/);
});

// --- P2 段前段后 -----------------------------------------------------------

test("段前段后 · 往返 docx，且盖得掉导出侧的默认 after=120", async () => {
  const properties = richDocDocxParagraphProperties({
    spaceBefore: 9,
    spaceAfter: 18,
  });
  assert.equal(properties.spacing.before, 180);
  assert.equal(properties.spacing.after, 360);

  const pPr = firstParagraphProperties(
    await exportXml([paragraph({ spaceBefore: 9, spaceAfter: 18 })]),
  );
  assert.match(pPr, /w:before="180"/);
  // 360 而不是 120：用户设的值必须压过 docx-export 的硬编码默认值。
  assert.match(pPr, /w:after="360"/);
  assert.doesNotMatch(pPr, /w:after="120"/);
});

// --- P2 中文排版预设 --------------------------------------------------------

test("中文排版预设 · 首行缩进 2 字符 + 1.5 倍行距，整份往返 docx", async () => {
  assert.equal(RICHDOC_CN_PARAGRAPH_PRESET.firstLineChars, 2);
  assert.equal(RICHDOC_CN_PARAGRAPH_PRESET.lineHeight, "1.5");

  const pPr = firstParagraphProperties(
    await exportXml([paragraph(RICHDOC_CN_PARAGRAPH_PRESET, "中文公文正文")]),
  );
  assert.match(pPr, /w:firstLineChars="200"/);
  assert.match(pPr, /w:line="360"/);
});

test("恢复默认排版预设 · 清掉缩进，写回 1.15 倍与段后 6 磅", async () => {
  assert.equal(RICHDOC_DEFAULT_PARAGRAPH_PRESET.firstLineChars, null);
  const properties = richDocDocxParagraphProperties(
    RICHDOC_DEFAULT_PARAGRAPH_PRESET,
  );
  assert.equal(properties.spacing.line, 276);
  assert.equal(properties.spacing.after, 120);
  assert.equal(properties.indent, undefined);
});

// --- 标题也吃排版属性 -------------------------------------------------------

test("标题段同样吃行距与段间距（用户选中标题调行距不该没反应）", async () => {
  const xml = await exportXml([
    {
      type: "heading",
      attrs: { level: 2, lineHeight: "2", spaceBefore: 12 },
      content: [{ type: "text", text: "二级标题" }],
    },
  ]);
  const pPr = firstParagraphProperties(xml);
  assert.match(pPr, /w:line="480"/);
  assert.match(pPr, /w:before="240"/);
});

// --- P3 多级编号 -----------------------------------------------------------

test("公文层级 · 一、→（一）→ 1.→（1），四级一循环", () => {
  assert.equal(richDocListMarker("cn-official", 0, 1), "一、");
  assert.equal(richDocListMarker("cn-official", 1, 1), "（一）");
  assert.equal(richDocListMarker("cn-official", 2, 1), "1.");
  assert.equal(richDocListMarker("cn-official", 3, 1), "（1）");
  assert.equal(richDocListMarker("cn-official", 4, 2), "二、");
  assert.equal(richDocListMarker("decimal", 0, 3), "3.");
  assert.equal(richDocListMarker("circled", 0, 3), "③");
  assert.equal(richDocListMarker("lower-alpha", 0, 3), "c.");
});

test("中文数字 1–99 完整，越界退回阿拉伯数字", () => {
  assert.equal(richDocChineseNumeral(1), "一");
  assert.equal(richDocChineseNumeral(10), "十");
  assert.equal(richDocChineseNumeral(11), "十一");
  assert.equal(richDocChineseNumeral(20), "二十");
  assert.equal(richDocChineseNumeral(99), "九十九");
  assert.equal(richDocChineseNumeral(100), "100");
});

test("多级编号 · 公文预设往返 docx，嵌套第二级仍是（一）不是 1.", async () => {
  const xml = await exportXml([
    {
      type: "orderedList",
      attrs: { numbering: "cn-official" },
      content: [
        {
          type: "listItem",
          content: [
            paragraph(null, "第一层"),
            {
              // 第二层**不带** numbering：用户只在最外层选了「公文」。
              type: "orderedList",
              content: [
                { type: "listItem", content: [paragraph(null, "第二层")] },
              ],
            },
          ],
        },
      ],
    },
  ]);
  assert.match(xml, /一、/);
  assert.match(xml, /（一）/);
});

test("多级编号 · 每级左缩进递进一个字符宽（240 缇）", () => {
  assert.equal(richDocDocxParagraphProperties({}, 0).indent, undefined);
  assert.equal(richDocDocxParagraphProperties({}, 1).indent.left, 240);
  assert.equal(richDocDocxParagraphProperties({}, 2).indent.left, 480);
  // 用户自己的左缩进与层级缩进相加，不是互相覆盖。
  assert.equal(
    richDocDocxParagraphProperties({ indentLeft: 24 }, 1).indent.left,
    720,
  );
});

// --- schema：没进 schema 的 attr 会被 setContent 静默丢掉 --------------------

test("排版 attr 真在 schema 上，`setContent` 不会把它们静默丢掉", () => {
  const schema = getSchema([Document, Paragraph, Text, RichDocTypography]);
  const attrs = schema.nodes.paragraph.spec.attrs;
  for (const key of [
    "lineHeight",
    "firstLineChars",
    "hangingChars",
    "indentLeft",
    "indentRight",
    "spaceBefore",
    "spaceAfter",
  ]) {
    assert.ok(key in attrs, `paragraph 缺少排版 attr：${key}`);
  }

  const json = {
    type: "doc",
    content: [paragraph({ lineHeight: "1.5", firstLineChars: 2 }, "中文")],
  };
  const restored = ProseMirrorNode.fromJSON(schema, json).toJSON();
  assert.equal(restored.content[0].attrs.lineHeight, "1.5");
  assert.equal(restored.content[0].attrs.firstLineChars, 2);
});

test("对照组：不注册 RichDocTypography 时，同一份 JSON 的排版 attr 当场消失", () => {
  // 这条是上一条的负样本，用来证明上一条不是「怎么写都绿」。
  const bare = getSchema([Document, Paragraph, Text]);
  const json = {
    type: "doc",
    content: [paragraph({ lineHeight: "1.5", firstLineChars: 2 }, "中文")],
  };
  const restored = ProseMirrorNode.fromJSON(bare, json).toJSON();
  assert.equal(restored.content[0].attrs, undefined);
});
