// 文本类文档（txt / md）的交付字节与库卡片摘要（W08，2026-10-23）
//
// 跑在真 Tiptap schema 上：载入走生产的 `plainTextToHtml` / `markdownToHtml`，
// 交给与编辑器同一套扩展解析，再用生产的写回函数出字节。
// 回退到旧写法（去标签后把空白压成一个空格、默认 turndown）这里会红：
//   · txt 存一次整篇变成一行，`&` 变成 `&amp;`；
//   · md 的表格被压成散字、列表写成 `-   ` 加空白行。
import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { generateHTML, generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";

import {
  createRichDocDeliveryFile,
  markdownToHtml,
  plainTextToHtml,
} from "../src/shell/doc-editors/rich-doc-model.ts";
import {
  RICHDOC_TEXT_EXCERPT_MAX,
  richDocHtmlToMarkdown,
  richDocHtmlToPlainText,
  richDocJsonToPlainText,
  richDocRendersPreviewBitmap,
  richDocTextExcerpt,
} from "../src/shell/doc-editors/rich-doc-text-delivery.ts";
import { richDocReviewExtensions } from "../src/shell/doc-editors/richdoc-review/review-marks.ts";

const FIXTURES = new URL(
  "../docs/work-logs/2026-10-23-editor-overhaul/harness/fixtures/",
  import.meta.url,
);
const fixture = (name) => readFileSync(new URL(name, FIXTURES), "utf8");

const EXTENSIONS = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TableKit.configure({ table: { resizable: false } }),
  Image.configure({ inline: false, allowBase64: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TextStyle,
  Color,
  FontSize,
  FontFamily,
  Highlight.configure({ multicolor: true }),
  ...richDocReviewExtensions(),
];

/** 与编辑器 `setContent` / `getJSON` / `getHTML` 同一套 schema 解析与序列化。 */
function editorWith(html) {
  const json = generateJSON(html, EXTENSIONS);
  return {
    getJSON: () => json,
    getHTML: () => generateHTML(json, EXTENSIONS),
    destroy: () => {},
  };
}

test("txt：载入 → 编辑器 → 写回，段落与段内换行原样，实体不留在文件里", () => {
  const original = fixture("sample.txt");
  const editor = editorWith(plainTextToHtml(original));
  assert.equal(richDocJsonToPlainText(editor.getJSON()), original);

  // 改一个字之后行结构仍在；`&` `<` 是字，不是实体。
  const json = editor.getJSON();
  json.content.at(-1).content.at(-1).text += " & <ok>";
  const saved = richDocJsonToPlainText(json);
  assert.equal(
    saved,
    original.replace("Third line of content.", "Third line of content. & <ok>"),
  );
  assert.doesNotMatch(saved, /&amp;|&lt;/);
  assert.equal(saved.split("\n").length, original.split("\n").length);
  editor.destroy();
});

test("txt：列表、表格、修订删除的字按纯文本写出", () => {
  const editor = editorWith(
    "<p>标题行</p><ul><li><p>甲</p><ul><li><p>甲一</p></li></ul></li><li><p>乙</p></li></ul>" +
      "<ol start=\"3\"><li><p>三</p></li><li><p>四</p></li></ol>" +
      "<table><tbody><tr><th><p>名</p></th><th><p>值</p></th></tr><tr><td colspan=\"2\"><p>合并</p></td></tr></tbody></table>",
  );
  assert.equal(
    richDocJsonToPlainText(editor.getJSON()),
    "标题行\n\n- 甲\n  - 甲一\n- 乙\n\n3. 三\n4. 四\n\n名\t值\n合并\n",
  );
  editor.destroy();
  const tracked = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "保留" },
          { type: "text", text: "删掉", marks: [{ type: "richdocDeletion" }] },
          { type: "text", text: "也保留" },
        ],
      },
    ],
  };
  assert.equal(richDocJsonToPlainText(tracked), "保留也保留\n");
});

test("txt：没有结构时的退路也按块断行、还原实体", () => {
  assert.equal(
    richDocHtmlToPlainText("<p>a &amp; b</p><p>c<br>d</p>"),
    "a & b\n\nc\nd\n",
  );
});

test("md：标题、紧凑列表、段内换行、强调写回后还是同一份 markdown", async () => {
  const original = fixture("sample.md");
  const editor = editorWith(await markdownToHtml(original));
  const saved = await richDocHtmlToMarkdown(editor.getHTML());
  assert.equal(saved, original);
  assert.doesNotMatch(saved, /^-\s{2,}/m, "列表项不能写成 `-   `");
  assert.doesNotMatch(saved, /^\s+$/m, "不能出现只有空格的行（读回来会变成松散列表）");
  editor.destroy();

  const breaks = editorWith(await markdownToHtml("第一行\n第二行 file_name *斜* **粗** ~~删~~\n"));
  assert.equal(
    await richDocHtmlToMarkdown(breaks.getHTML()),
    "第一行\n第二行 file_name *斜* **粗** ~~删~~\n",
  );
  breaks.destroy();
});

test("md：GFM 表格写回成表格（含合并单元格展开），不是散字", async () => {
  const original = "| 文件 | 页码 |\n| --- | --- |\n| 签章页.pdf | 3 |\n| a\\|b | 4 |\n";
  const editor = editorWith(await markdownToHtml(original));
  assert.equal(await richDocHtmlToMarkdown(editor.getHTML()), original);
  editor.destroy();

  const merged = editorWith(
    "<table><tbody><tr><th><p>A</p></th><th><p>B</p></th><th><p>C</p></th></tr>" +
      "<tr><td rowspan=\"2\"><p>左</p></td><td colspan=\"2\"><p>右</p></td></tr>" +
      "<tr><td><p>x</p></td><td><p>y</p></td></tr></tbody></table>",
  );
  assert.equal(
    await richDocHtmlToMarkdown(merged.getHTML()),
    "| A | B | C |\n| --- | --- | --- |\n| 左 | 右 |  |\n|  | x | y |\n",
  );
  merged.destroy();
});

test("md / txt 交付文件走新的写回规则，docx 仍出 Word", async () => {
  const markdownItem = {
    id: "md-1",
    title: "清单",
    meta: { source_format: "md" },
  };
  const editor = editorWith(await markdownToHtml(fixture("sample.md")));
  const md = await createRichDocDeliveryFile({
    item: markdownItem,
    title: "清单",
    html: editor.getHTML(),
    json: editor.getJSON(),
  });
  assert.equal(md.name, "清单.md");
  assert.equal(await md.text(), fixture("sample.md"));

  const textEditor = editorWith(plainTextToHtml(fixture("sample.txt")));
  const txt = await createRichDocDeliveryFile({
    item: { id: "t-1", title: "notes", meta: { source_format: "txt" } },
    title: "notes",
    html: textEditor.getHTML(),
    json: textEditor.getJSON(),
  });
  assert.equal(txt.name, "notes.txt");
  assert.equal(txt.type, "text/plain");
  assert.equal(await txt.text(), fixture("sample.txt"));
  editor.destroy();
  textEditor.destroy();

  assert.equal(richDocRendersPreviewBitmap({ extension: "md" }), false);
  assert.equal(richDocRendersPreviewBitmap({ extension: "txt" }), false);
  assert.equal(richDocRendersPreviewBitmap({ extension: "html" }), false);
  assert.equal(richDocRendersPreviewBitmap({ extension: "docx" }), true);
});

test("摘要：开头几行、没有 markdown 记号、列表带记号、≤600 字", async () => {
  const editor = editorWith(await markdownToHtml(fixture("sample.md")));
  assert.equal(
    richDocTextExcerpt(editor.getJSON()),
    "验收清单\n• 第一项：标题与开头几行要直接显示在卡片上\n• 第二项：不转圈\n正文第一段。",
  );
  editor.destroy();

  const textEditor = editorWith(plainTextToHtml(fixture("sample.txt")));
  assert.equal(
    richDocTextExcerpt(textEditor.getJSON()),
    "Acceptance notes\nThe first lines of a text file should show on the library card.\nSecond line of content.\nThird line of content.",
  );
  textEditor.destroy();

  const long = {
    type: "doc",
    content: Array.from({ length: 20 }, (_, index) => ({
      type: "paragraph",
      content: [{ type: "text", text: `第${index}段`.padEnd(200, "字") }],
    })),
  };
  const excerpt = richDocTextExcerpt(long);
  assert.ok(Array.from(excerpt).length <= RICHDOC_TEXT_EXCERPT_MAX);
  assert.ok(excerpt.split("\n").length <= 8);
  assert.equal(richDocTextExcerpt({ type: "doc", content: [] }), "");

  const tracked = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "旧", marks: [{ type: "richdocDeletion" }] },
          { type: "text", text: "新标题" },
        ],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "甲" }] }] },
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "乙" }] }] },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(richDocTextExcerpt(tracked), "新标题\n甲 · 乙");
});
