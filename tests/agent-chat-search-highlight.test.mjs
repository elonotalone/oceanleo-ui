// 对话内搜索的命中高亮（2026-09-07，agent 对话顶栏统一 · 子任务 B）。
//
// 搜索控件（AgentChat 顶栏）把搜索词透传给每条气泡，正文里每一处大小写不敏感的
// 纯文本命中都要包成 `<mark data-leo-search-hit>`，控件靠它计数、标当前项、滚动。
// 这里钉住四件事：
//   1. `splitHighlights` 是纯文本匹配：大小写不敏感、多处命中、特殊字符不当正则；
//   2. Markdown 正文（标题 / 列表 / 代码块 / 行内代码 / 链接）里的命中数正确，
//      且只包文本节点，元素结构一个不动；
//   3. 搜索词为空或全空白时，输出与**不传 prop** 逐字节相同（不多出任何包裹节点）；
//   4. 气泡的各个纯文本分支（用户消息 / 步骤 / 报错 / 流式尾巴）同样会亮。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// jsdom 只用来把静态 HTML 解析成可 querySelector 的树（经 fabric 的依赖树拿到，
// 与 share-select-mode.test.mjs 同款取法）。
const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

function parse(html) {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window
    .document.body;
}

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(
      /\\{(\\w+)\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);

const clipboardStub = dataModule(`
  export async function writeClipboardText() { return true; }
`);

const {
  Markdown,
  TypewriterMarkdown,
  HighlightedText,
  splitHighlights,
  SEARCH_HIT_CLASS,
} = await import(await compileModule("src/shell/Markdown.tsx"));

const { AgentTranscriptBubble } = await import(
  await compileModule("src/shell/AgentTranscriptBubble.tsx", {
    "../i18n/ui/useUI": uiStub,
    "./share/share-clipboard": clipboardStub,
  })
);

const HIT = "[data-leo-search-hit]";

function joined(segments) {
  return segments.map((segment) => segment.text).join("");
}

function hits(segments) {
  return segments.filter((segment) => segment.hit).map((segment) => segment.text);
}

// ===========================================================================
// 1. splitHighlights（纯函数）
// ===========================================================================

test("splitHighlights：大小写不敏感，多处命中，片段拼回来逐字等于输入", () => {
  const text = "Leo 说：leo、LEO 与 lEo 都算，leoleo 算两次。";
  const segments = splitHighlights(text, "leo");
  assert.equal(joined(segments), text);
  assert.deepEqual(hits(segments), ["Leo", "leo", "LEO", "lEo", "leo", "leo"]);
  // 相邻片段命中 / 非命中交替，不产生空片段。
  for (const segment of segments) assert.ok(segment.text.length > 0);
  for (let index = 1; index < segments.length; index += 1) {
    if (!segments[index].hit) assert.ok(segments[index - 1].hit, "非命中片段不该相邻");
  }
});

test("splitHighlights：特殊字符是字面量，不当正则", () => {
  assert.deepEqual(hits(splitHighlights("a.b axb a.b", ".")), [".", "."]);
  assert.deepEqual(hits(splitHighlights("a*b aab", "*")), ["*"]);
  assert.deepEqual(hits(splitHighlights("f(x) fx (x)", "(x)")), ["(x)", "(x)"]);
  assert.deepEqual(hits(splitHighlights("[a] a", "[a]")), ["[a]"]);
  assert.deepEqual(hits(splitHighlights("1+1=2", "1+1")), ["1+1"]);
  assert.deepEqual(hits(splitHighlights("C:\\dir\\file", "\\dir")), ["\\dir"]);
  assert.deepEqual(hits(splitHighlights("x^2 $y$ a|b", "$y$")), ["$y$"]);
  // 没命中：只有一个非命中片段。
  assert.deepEqual(splitHighlights("abc", "."), [{ text: "abc", hit: false }]);
});

test("splitHighlights：空 / 全空白搜索词与空文本都只回一个非命中片段", () => {
  for (const query of ["", "   ", "\n\t", null, undefined]) {
    assert.deepEqual(splitHighlights("Leo", query), [{ text: "Leo", hit: false }]);
  }
  assert.deepEqual(splitHighlights("", "leo"), [{ text: "", hit: false }]);
  // 搜索词本身**不** trim：用户敲了空格就按空格找。
  assert.deepEqual(hits(splitHighlights("a b ab", "a ")), ["a "]);
});

test("splitHighlights：命中片段保留原文大小写（高亮的是用户看到的字）", () => {
  const segments = splitHighlights("HeLLo hello", "HELLO");
  assert.deepEqual(hits(segments), ["HeLLo", "hello"]);
});

// ===========================================================================
// 2. Markdown 正文里的命中
// ===========================================================================

const ANSWER = [
  "# Leo 季度小结",
  "",
  "这一版 leo 把三件事做完了，见 [Leo 文档](https://leo.example/docs)。",
  "",
  "- 首字可见延迟：`leo.stream()` 从 1.2s 降到 0.2s",
  "- 表格不再跳列",
  "",
  "```js",
  "const leo = subscribe(url); // LEO",
  "```",
  "",
  "> 引用里的 Leo 也算。",
  "",
].join("\n");

function markup(element) {
  return renderToStaticMarkup(element);
}

test("Markdown：标题 / 段落 / 链接 / 行内代码 / 代码块 / 引用里的命中都被包成 mark", () => {
  const body = parse(
    markup(
      React.createElement(Markdown, { highlightQuery: "leo" }, ANSWER),
    ),
  );
  const marks = [...body.querySelectorAll(HIT)];
  // 标题 1 + 段落 1 + 链接文字 1 + 行内代码 1 + 代码块 2 + 引用 1 = 7
  assert.equal(marks.length, 7, body.innerHTML);
  for (const mark of marks) {
    assert.equal(mark.tagName, "MARK");
    assert.equal(mark.textContent.toLowerCase(), "leo");
    assert.equal(mark.className, SEARCH_HIT_CLASS);
    assert.equal(mark.getAttribute("data-active"), null, "默认没有当前项");
  }
  // 只包文本节点：元素结构一个不动。
  assert.ok(body.querySelector("h1 " + HIT), "标题里的命中");
  assert.ok(body.querySelector("a[href='https://leo.example/docs'] " + HIT), "链接文字里的命中");
  assert.ok(body.querySelector("li code " + HIT), "行内代码里的命中");
  assert.equal(body.querySelectorAll("pre code " + HIT).length, 2, "代码块里的命中");
  assert.ok(body.querySelector("blockquote " + HIT), "引用里的命中");
  assert.equal(body.querySelectorAll("li").length, 2);
  assert.equal(body.querySelectorAll("pre").length, 1);
  // 文本一个字没丢。
  const plain = parse(markup(React.createElement(Markdown, {}, ANSWER)));
  assert.equal(body.textContent, plain.textContent);
});

test("Markdown：命中数随搜索词变化，大小写不敏感，特殊字符按字面量找", () => {
  const count = (query) =>
    parse(markup(React.createElement(Markdown, { highlightQuery: query }, ANSWER)))
      .querySelectorAll(HIT).length;
  assert.equal(count("LEO"), 7);
  assert.equal(count("leo.stream()"), 1);
  // 「.」只匹配字面的英文句点：`leo.stream()`、1.2s、0.2s；链接的 href 不是文本节点，
  // 中文句号「。」不是它。
  assert.equal(count("."), 3);
  assert.equal(count("不存在的词"), 0);
});

test("Markdown：搜索词为空或全空白时输出与不传 prop 逐字节相同", () => {
  const baseline = markup(
    React.createElement(Markdown, { className: "text-[15px]" }, ANSWER),
  );
  for (const query of ["", "   ", undefined]) {
    assert.equal(
      markup(
        React.createElement(
          Markdown,
          { className: "text-[15px]", highlightQuery: query },
          ANSWER,
        ),
      ),
      baseline,
      `highlightQuery=${JSON.stringify(query)} 不该改变输出`,
    );
  }
  assert.ok(!baseline.includes("data-leo-search-hit"));
  assert.ok(!baseline.includes("<mark"));
});

test("TypewriterMarkdown：已闭合块与流式尾巴里的命中都亮，终态与 Markdown 一致", () => {
  // 流式中：标题已闭合，尾巴里还有半截段落。
  const partial = "# Leo 季度小结\n\n这一版 leo 还没写完";
  const streaming = parse(
    markup(
      React.createElement(TypewriterMarkdown, {
        content: partial,
        active: true,
        highlightQuery: "leo",
      }),
    ),
  );
  assert.equal(streaming.querySelectorAll(HIT).length, 2);
  assert.ok(streaming.querySelector("h1 " + HIT), "已闭合块里的命中");
  assert.ok(streaming.querySelector("p " + HIT), "尾巴里的命中");

  // 终态：与一次性 Markdown 渲染逐字节相同（高亮不能打破这条既有不变量）。
  const done = markup(
    React.createElement(TypewriterMarkdown, {
      content: ANSWER,
      active: false,
      className: "text-[15px] leading-relaxed",
      highlightQuery: "leo",
    }),
  );
  const oneShot = markup(
    React.createElement(
      Markdown,
      { className: "text-[15px] leading-relaxed", highlightQuery: "leo" },
      ANSWER,
    ),
  );
  assert.equal(done, oneShot);
  assert.equal(parse(done).querySelectorAll(HIT).length, 7);

  // 不搜时同样与不传 prop 逐字节相同。
  assert.equal(
    markup(
      React.createElement(TypewriterMarkdown, {
        content: partial,
        active: true,
        highlightQuery: "  ",
      }),
    ),
    markup(
      React.createElement(TypewriterMarkdown, { content: partial, active: true }),
    ),
  );
});

test("HighlightedText：没命中时就是那段字符串本身", () => {
  assert.equal(
    markup(React.createElement(HighlightedText, { text: "a < b & c", query: "" })),
    markup(React.createElement(React.Fragment, null, "a < b & c")),
  );
  const body = parse(
    markup(React.createElement(HighlightedText, { text: "a<b> & <B>", query: "<b>" })),
  );
  assert.equal(body.querySelectorAll(HIT).length, 2);
  assert.equal(body.textContent, "a<b> & <B>", "命中包裹不能引入 HTML 解释");
  assert.equal(body.querySelectorAll("b").length, 0);
});

// ===========================================================================
// 3. 气泡：各分支都把搜索词传下去
// ===========================================================================

function bubble(message, extra = {}) {
  return parse(
    markup(React.createElement(AgentTranscriptBubble, { message, ...extra })),
  );
}

test("AgentTranscriptBubble：用户消息 / 回答正文 / 步骤 / 报错 / 计划 / 成员回答都会亮", () => {
  const cases = [
    [{ id: 1, role: "user", kind: "text", content: "帮我算 Leo 的同比，leo 要按月" }, 2],
    [{ id: 2, role: "assistant", kind: "text", content: "**Leo** 的同比：`leo=12%`" }, 2],
    [{ id: 3, role: "assistant", kind: "step", content: "正在读取 leo.xlsx" }, 1],
    [{ id: 4, role: "assistant", kind: "error", content: "Leo 服务超时" }, 1],
    [{ id: 5, role: "assistant", kind: "plan", content: "1. 读 leo\n2. 算 LEO" }, 2],
    [
      {
        id: 6,
        role: "assistant",
        kind: "report",
        content: "leo 已完成",
        meta: { worker_name: "分析员" },
      },
      1,
    ],
    [
      { id: 7, role: "assistant", kind: "gate", content: "要继续处理 Leo 吗？" },
      1,
    ],
  ];
  for (const [message, expected] of cases) {
    const body = bubble(message, { highlightQuery: "leo" });
    assert.equal(
      body.querySelectorAll(HIT).length,
      expected,
      `${message.kind} 气泡的命中数不对：${body.innerHTML}`,
    );
    // 不搜时与不传 prop 逐字节相同。
    assert.equal(
      markup(
        React.createElement(AgentTranscriptBubble, { message, highlightQuery: "" }),
      ),
      markup(React.createElement(AgentTranscriptBubble, { message })),
      `${message.kind} 气泡在空搜索词下不该有任何变化`,
    );
  }
});

test("AgentTranscriptBubble：流式中的回答在尾巴里也亮，且不搜时无 mark", () => {
  const message = {
    id: 8,
    role: "assistant",
    kind: "text",
    content: "# 结论\n\nLeo 的同比还在算",
  };
  const streaming = bubble(message, { streaming: true, highlightQuery: "leo" });
  assert.equal(streaming.querySelectorAll(HIT).length, 1);
  assert.equal(bubble(message, { streaming: true }).querySelectorAll(HIT).length, 0);
});

test("AgentTranscriptBubble：选段模式下命中同样渲染（搜索与分享互不干扰）", () => {
  const body = bubble(
    { id: 9, role: "assistant", kind: "text", content: "Leo 同比 12%" },
    { selectMode: true, selected: false, onSelectToggle: () => {}, highlightQuery: "leo" },
  );
  assert.ok(body.querySelector('[role="checkbox"]'));
  assert.equal(body.querySelectorAll(HIT).length, 1);
});
