// 文档深色显示层 + docx 字号/字体/高亮 + 图片样式（W08，2026-10-23）
//
// 深色下正文变深（D6）：默认黑字换成主题前景、看不清的用户颜色提亮、
// 高亮与单元格底色压暗；全部是 decoration，`getJSON` 一个字节不变。
import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  RICHDOC_DARK_PAGE,
  parseRichDocColor,
  richDocContrast,
  richDocDarkDecorations,
  richDocDarkFillColor,
  richDocDarkTextColor,
} from "../src/shell/doc-editors/rich-doc-theme-ink.ts";
import {
  docxFontName,
  docxHalfPoints,
  docxHexColor,
} from "../src/shell/doc-editors/docx-export.ts";
import {
  RichDocImageStyle,
  normalizeRichDocImageStyle,
} from "../src/shell/doc-editors/rich-doc-image-style.ts";
import { RICHDOC_CSS } from "../src/shell/doc-editors/rich-doc-model.ts";

const schema = getSchema([
  StarterKit,
  TableKit,
  Image,
  RichDocImageStyle,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
]);
const page = parseRichDocColor(RICHDOC_DARK_PAGE);

test("深色：默认黑字换前景，看不清的颜色提亮到 4.5:1，看得清的原样", () => {
  for (const black of ["#000", "#000000", "#1c1917", "rgb(0, 0, 0)", "#333333", "black"]) {
    assert.equal(richDocDarkTextColor(black), "ink", black);
  }
  const navy = richDocDarkTextColor("#1e3a8a");
  assert.match(navy, /^#[0-9a-f]{6}$/);
  assert.ok(richDocContrast(parseRichDocColor(navy), page) >= 4.5);
  // 色相还在：提亮后的海军蓝仍然是蓝占优。
  const [r, , b] = parseRichDocColor(navy);
  assert.ok(b > r);
  assert.equal(richDocDarkTextColor("#fbbf24"), null);
  assert.equal(richDocDarkTextColor("hsl(10 50% 50%)"), null);
});

test("深色：高亮 / 单元格底色压暗到浅字可读，白底变透明", () => {
  assert.equal(richDocDarkFillColor("#ffffff"), "transparent");
  assert.equal(richDocDarkFillColor("rgb(255, 255, 255)"), "transparent");
  const dim = richDocDarkFillColor("#fef08a");
  assert.ok(richDocContrast(parseRichDocColor(dim), parseRichDocColor("#ededf0")) >= 4.5);
});

test("深色 decoration 只改显示：文档 JSON 不变", () => {
  const json = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "黑", marks: [{ type: "textStyle", attrs: { color: "#000000" } }] },
          { type: "text", text: "亮", marks: [{ type: "highlight", attrs: { color: "#fef08a" } }] },
          { type: "text", text: "普通" },
        ],
      },
    ],
  };
  const doc = ProseMirrorNode.fromJSON(schema, json);
  const set = richDocDarkDecorations(doc);
  const found = set.find();
  assert.equal(found.length, 2);
  assert.match(found[0].type.attrs.style, /color:var\(--richdoc-ink\)/);
  assert.match(found[1].type.attrs.style, /background-color:#/);
  assert.deepEqual(JSON.parse(JSON.stringify(doc.toJSON())), json);
});

test("正文样式不写死浅色，深色下高亮原底色让位", () => {
  assert.doesNotMatch(RICHDOC_CSS, /\.oleo-richdoc\{[^}]*color:#1c1917/);
  assert.match(RICHDOC_CSS, /color:var\(--richdoc-ink\)/);
  assert.match(RICHDOC_CSS, /\[data-richdoc-theme="dark"\] \.oleo-richdoc mark\{background-color:transparent!important/);
  const stage = readFileSync(new URL("../src/shell/doc-editors/RichDocStage.tsx", import.meta.url), "utf8");
  assert.match(stage, /data-richdoc-theme=\{theme\}/);
  assert.match(stage, /refreshRichDocThemeInk\(editor\.editor, theme === "dark"\)/);
});

test("docx：字号转半磅、字体取栈首、颜色认 rgb()", () => {
  assert.equal(docxHalfPoints("16px"), 24);
  assert.equal(docxHalfPoints("12pt"), 24);
  assert.equal(docxHalfPoints(""), 0);
  assert.equal(docxFontName("Noto Sans SC, PingFang SC, sans-serif"), "Noto Sans SC");
  assert.equal(docxFontName("serif"), "");
  assert.equal(docxHexColor("rgb(28, 25, 23)"), "1C1917");
  assert.equal(docxHexColor("#abc"), "AABBCC");
  const exporter = readFileSync(new URL("../src/shell/doc-editors/docx-export.ts", import.meta.url), "utf8");
  // 十六进制写进 w:highlight 会被 Word 判损坏：任意高亮色必须走底纹。
  assert.doesNotMatch(exporter, /style\.highlight\s*=/);
  assert.match(exporter, /style\.shading = \{ type: "clear", color: "auto", fill \}/);
});

test("图片样式：越界夹回，100% 不透明 = 不设", () => {
  assert.deepEqual(normalizeRichDocImageStyle({ radius: 999, opacity: 100 }), { radius: 200, opacity: null });
  assert.deepEqual(normalizeRichDocImageStyle({ borderWidth: 0 }), { borderWidth: null });
  assert.deepEqual(normalizeRichDocImageStyle({ borderColor: "javascript:x" }), { borderColor: null });
  const image = schema.nodes.image.create({ src: "a.png", radius: 12, borderWidth: 2, borderColor: "#123456", opacity: 50 });
  assert.equal(image.attrs.radius, 12);
});
