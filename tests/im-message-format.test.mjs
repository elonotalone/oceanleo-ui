// W09：人发的消息的标记解析。只产出 React 节点；XSS 用例必须被当成文字。
import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  parseBlocks,
  parseInline,
  plainTextOf,
  renderMessageBody,
  safeHref,
} from "../src/shell/messages/conversation/message-format.ts";

const html = (text, options) =>
  renderToStaticMarkup(React.createElement("div", null, ...renderMessageBody(text, options)));

test("粗体、斜体、删除线、行内代码", () => {
  const out = html("**粗** _斜_ ~~删~~ `码`");
  assert.match(out, /<strong[^>]*>粗<\/strong>/);
  assert.match(out, /<em>斜<\/em>/);
  assert.match(out, /<del[^>]*>删<\/del>/);
  assert.match(out, /<code[^>]*>码<\/code>/);
});

test("嵌套：粗体里有斜体和链接", () => {
  const nodes = parseInline("**a _b_ https://x.com/p**");
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, "bold");
  const kinds = nodes[0].children.map((n) => n.type);
  assert.deepEqual(kinds, ["text", "italic", "text", "link"]);
});

test("行内代码里的标记原样显示", () => {
  const nodes = parseInline("`**不是粗体**`");
  assert.deepEqual(nodes, [{ type: "code", text: "**不是粗体**" }]);
});

test("未闭合的标记当文字，不吞内容", () => {
  for (const text of ["**没闭合", "~~没闭合", "_没闭合", "`没闭合", "**a ~~b"]) {
    const nodes = parseInline(text);
    assert.equal(plainTextOf(text), text, text);
    assert.ok(nodes.every((n) => n.type === "text" || n.type === "strike" || n.type === "bold"));
  }
  const blocks = parseBlocks("```\n没闭合的代码块\n后面还有字");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
  assert.equal(plainTextOf("```\n没闭合的代码块\n后面还有字"), "```\n没闭合的代码块\n后面还有字");
});

test("snake_case 不被当成斜体", () => {
  const nodes = parseInline("use snake_case_name here");
  assert.deepEqual(nodes, [{ type: "text", text: "use snake_case_name here" }]);
});

test("代码块、引用、列表", () => {
  const blocks = parseBlocks("> 引用一行\n> 第二行\n\n- 甲\n- 乙\n\n1. 一\n2. 二\n\n```js\nconst a = 1;\n```");
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["quote", "list", "list", "code"],
  );
  assert.equal(blocks[1].ordered, false);
  assert.equal(blocks[1].items.length, 2);
  assert.equal(blocks[2].ordered, true);
  assert.equal(blocks[3].text, "const a = 1;");
  const out = html("```\n<b>x</b>\n```");
  assert.match(out, /&lt;b&gt;x&lt;\/b&gt;/);
});

test("链接：只认 http(s)，新窗口且 noopener noreferrer", () => {
  const out = html("看 https://example.com/a?b=1。");
  assert.match(out, /href="https:\/\/example\.com\/a\?b=1"/);
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="noopener noreferrer"/);
  // 句号不进链接
  assert.match(out, /<\/a>。/);
});

test("javascript: / data: / vbscript: 被当成文字，不生成链接", () => {
  for (const text of [
    "javascript:alert(1)",
    "[点我](javascript:alert(1))",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "JaVaScRiPt:alert(1)",
    "ftp://example.com/x",
  ]) {
    const out = html(text);
    assert.doesNotMatch(out, /<a[\s>]/, text);
    assert.doesNotMatch(out, /href=/, text);
  }
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("https://a.com"), "https://a.com/");
});

test("XSS：标签、属性、事件处理器都只是被转义的文字", () => {
  const evil = `<script>alert(1)</script><img src=x onerror=alert(1)> "'><svg onload=alert(1)>`;
  const out = html(evil);
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /<img/i);
  assert.doesNotMatch(out, /<svg/i);
  assert.match(out, /&lt;script&gt;/);
  const code = html("`<img src=x onerror=1>`");
  assert.doesNotMatch(code, /<img/i);
});

test("链接文字里的 html 也被转义", () => {
  const out = html('https://a.com/"><script>alert(1)</script>');
  assert.doesNotMatch(out, /<script/i);
});

test("@提及：按名字渲染成胶囊，名字最长优先", () => {
  const mentions = [
    { id: "u1", label: "Al", kind: "user" },
    { id: "u2", label: "Alice", kind: "user" },
    { id: "all", label: "所有人", kind: "all" },
    { id: "leo", label: "leo", kind: "leo" },
  ];
  const out = html("@Alice 和 @Al 以及 @所有人 @leo 你好 @Bob", { mentions });
  assert.equal((out.match(/data-mention/g) ?? []).length, 4);
  assert.match(out, />@Alice</);
  assert.match(out, />@Al</);
  // 没在 mentions 里的名字只是文字
  assert.match(out, /@Bob/);
  assert.doesNotMatch(out, /data-mention="user"[^>]*>@Bob/);
});

test("@提及的名字是纯文本，不能夹带标签", () => {
  const mentions = [{ id: "u9", label: "<img src=x onerror=1>", kind: "user" }];
  const out = html("@<img src=x onerror=1> 你好", { mentions });
  assert.doesNotMatch(out, /<img/i);
});

test("多行与空行：段落内换行保留，空行分段", () => {
  const blocks = parseBlocks("第一行\n第二行\n\n第三段");
  assert.equal(blocks.length, 2);
  assert.equal(plainTextOf("第一行\n第二行"), "第一行\n第二行");
});

test("源码里没有 innerHTML 类写法", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    new URL("../src/shell/messages/conversation/message-format.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML|eval\(|new Function/);
});
