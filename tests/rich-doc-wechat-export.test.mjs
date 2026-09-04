/**
 * W08 判据 5：doocs/md 口径的公众号排版导出，不是独立编辑器。
 *
 * 跑法（必须带 package.json `test` 那串 flag，`_COMMON.md` §7b⑫）：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/rich-doc-wechat-export.test.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  WECHAT_EXPORT_FORMAT,
  WECHAT_THEMES,
  exportWechatFromMarkdown,
  exportWechatFromTiptap,
} from "../src/shell/doc-editors/rich-doc-wechat-export.ts";

function doc(content) {
  return { type: "doc", content };
}

test("导出格式钉在 doocs/md 公众号口径，不是新编辑器 id", () => {
  assert.equal(WECHAT_EXPORT_FORMAT, "doocs.md.wechat.v1");
  const source = readFileSync(
    "src/shell/doc-editors/rich-doc-wechat-export.ts",
    "utf8",
  );
  assert.match(source, /不把它立成/);
  assert.doesNotMatch(source, /createRoot|useEditor|UmoEditor/);
});

test("Tiptap JSON 转出内联样式 HTML，没有 class", () => {
  const source = doc([
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "标题" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "加粗", marks: [{ type: "bold" }] },
        { type: "text", text: "与" },
        {
          type: "text",
          text: "链接",
          marks: [{ type: "link", attrs: { href: "https://oceanleo.com" } }],
        },
      ],
    },
    {
      type: "blockquote",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "引用" }] },
      ],
    },
  ]);
  const before = JSON.stringify(source);
  const result = exportWechatFromTiptap(source, { title: "周报" });
  assert.equal(JSON.stringify(source), before, "导出改写了输入");
  assert.equal(result.format, WECHAT_EXPORT_FORMAT);
  assert.match(result.html, /<section style=/);
  assert.match(result.html, /<h2 style=/);
  assert.match(result.html, /<strong style=/);
  assert.match(result.html, /href="https:\/\/oceanleo.com"/);
  assert.match(result.html, /<blockquote style=/);
  assert.match(result.html, /周报/);
  assert.doesNotMatch(result.html, / class=/);
  assert.doesNotMatch(result.html, /<script/);
  assert.match(result.markdown, /## 标题/);
});

test("默认主题带 doocs/md 的 accent #42b983", () => {
  assert.equal(WECHAT_THEMES.default.accent, "#42b983");
  const result = exportWechatFromTiptap(
    doc([
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
      },
    ]),
  );
  assert.match(result.html, /#42b983/);
});

test("javascript: 链接不会写进 HTML", () => {
  const result = exportWechatFromTiptap(
    doc([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "坏链",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
    ]),
  );
  assert.doesNotMatch(result.html, /javascript:/);
  assert.match(result.html, /坏链/);
});

test("空输入给出原因，不交空 section 冒充成功", () => {
  const fromJson = exportWechatFromTiptap(null);
  assert.equal(fromJson.html, "");
  assert.ok(fromJson.warnings[0].includes("没有可排版"));
  const fromMd = exportWechatFromMarkdown("   ");
  assert.equal(fromMd.html, "");
  assert.ok(fromMd.warnings[0].includes("没有可排版"));
});

test("Markdown 子集走同一套内联样式", () => {
  const result = exportWechatFromMarkdown("# 封面\n\n一段正文\n\n- 条目");
  assert.match(result.html, /<h1 style=/);
  assert.match(result.html, /一段正文/);
  assert.match(result.html, /<ul style=/);
  assert.doesNotMatch(result.html, / class=/);
});
