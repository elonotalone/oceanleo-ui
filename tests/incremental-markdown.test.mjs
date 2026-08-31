// 增量安全的 Markdown 渲染（W21 P1/P5）。
//
// 锁三件事：
//   1. 切分是**无损**的（closed + open 逐字等于输入），且已闭合前缀只增不改；
//   2. 没到齐的东西不许提前变成结构——未闭合围栏不出 <pre>、没收齐的表不出 <table>；
//   3. 流结束后的 DOM 与「一次性渲染」**逐字相同**（这条是正确性判据，不是体感判据）。
//
// 每条断言旁边都跑一遍反面：把增量关掉（`active=false` 逐 token 全量重渲，
// 也就是本改动之前的行为）当作对照组，证明这些断言确实是被增量渲染挣来的，
// 不是碰巧成立。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule } from "./helpers/module-bench.mjs";

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

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://chat.oceanleo.com/workspace",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const { Markdown, TypewriterMarkdown, splitStreamingMarkdown } = await import(
  await compileModule("src/shell/Markdown.tsx")
);

// ---------------------------------------------------------------------------
// 语料：一段同时含标题 / 段落 / 列表 / 表格 / 代码围栏的回答。
// ---------------------------------------------------------------------------
const ANSWER = [
  "# 季度小结",
  "",
  "这一版把三件事做完了。",
  "",
  "- 首字可见延迟从 1.2s 降到 0.2s",
  "- 表格不再跳列",
  "",
  "- 代码块不再逐字重跑高亮",
  "",
  "| 指标 | 改前 | 改后 |",
  "|---|---|---|",
  "| 首字 | 1200ms | 200ms |",
  "| 重解析 | 每 token | 每块 |",
  "",
  "```js",
  "const stream = subscribe(url);",
  "stream.close();",
  "```",
  "",
  "就这些。",
  "",
].join("\n");

/** 逐 token 喂：按字符切，最接近真实 SSE 的最坏情况。 */
function* tokenize(text, size = 7) {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(0, Math.min(i + size, text.length));
  }
  yield text;
}

function mountHost() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

function renderInto(host, element) {
  const root = createRoot(host);
  act(() => root.render(element));
  return {
    update: (next) => act(() => root.render(next)),
    unmount: () => act(() => root.unmount()),
  };
}

// ===========================================================================
// 1. 切分本身（纯函数，DOM 无关）
// ===========================================================================

test("切分无损：closed + open 逐字等于输入，前缀只增不改", () => {
  let previousClosed = "";
  let steps = 0;
  for (const partial of tokenize(ANSWER, 3)) {
    const { closed, open } = splitStreamingMarkdown(partial);
    assert.equal(
      closed + open,
      partial,
      "切分必须无损，一个字符都不许丢或改",
    );
    assert.ok(
      closed.startsWith(previousClosed),
      `已闭合前缀只能变长、不能被改写。上一次：${JSON.stringify(
        previousClosed.slice(-40),
      )}，这一次：${JSON.stringify(closed.slice(-40))}`,
    );
    assert.ok(
      partial.startsWith(closed),
      "已闭合前缀必须是输入的真前缀",
    );
    previousClosed = closed;
    steps += 1;
  }
  assert.ok(steps > 40, "语料要足够长，否则这条测试没有说服力");
});

test("未闭合的代码围栏整段留在尾巴里", () => {
  const partial = "开头一段。\n\n```js\nconst a = 1;\n";
  const { closed, open } = splitStreamingMarkdown(partial);
  assert.equal(closed, "开头一段。\n\n");
  assert.ok(open.startsWith("```js"), "围栏没闭合就不许并进前缀");
  // 闭合之后（且后面还有内容确认这一行已经写完）才并进去。
  const done = "开头一段。\n\n```js\nconst a = 1;\n```\n\n后面。";
  assert.ok(
    splitStreamingMarkdown(done).closed.includes("```js"),
    "围栏闭合后应当并进已闭合前缀",
  );
});

test("表格在收齐之前留在尾巴里", () => {
  const partial = "前言\n\n| a | b |\n|---|---|\n| 1 | 2 |";
  const { closed, open } = splitStreamingMarkdown(partial);
  assert.equal(closed, "前言\n\n");
  assert.ok(open.startsWith("| a | b |"));
  const done = "前言\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n尾声";
  assert.ok(splitStreamingMarkdown(done).closed.includes("|---|---|"));
});

test("单个空行不闭合列表——否则 tight/loose 一翻，每个 <li> 都要重建", () => {
  // "- a\n- b\n\n- c" 是**一张** loose 列表，不是两张 tight 列表。
  // 若在空行处就闭合，前缀会先按 tight 画好，等 "- c" 到了又得整张推倒。
  const partial = "- a\n- b\n\n- c\n";
  assert.equal(splitStreamingMarkdown(partial).closed, "");
  // 直到出现「空行 + 顶格非列表行」，列表才真正定型。
  const done = "- a\n- b\n\n- c\n\n后文\n后文续\n\n";
  const { closed } = splitStreamingMarkdown(done);
  assert.ok(closed.includes("- c"), "列表定型后应当并进前缀");
});

test("段落不因结尾换行就算闭合——下一个 token 可能是 setext 的 ===", () => {
  assert.equal(splitStreamingMarkdown("标题候选\n").closed, "");
  // 真的来了 ===，整段被追认成标题；如果之前就闭合成 <p>，这里就得推倒。
  const { closed } = splitStreamingMarkdown("标题候选\n===\n\n正文");
  assert.equal(closed, "标题候选\n===\n\n");
});

// ===========================================================================
// 2. 流式期间不许提前长出结构
// ===========================================================================

test("流式期间：未闭合围栏不出 <pre>，没收齐的表不出 <table>", () => {
  const host = mountHost();
  const view = renderInto(
    host,
    React.createElement(TypewriterMarkdown, { content: "", active: true }),
  );

  const midTable = ANSWER.slice(0, ANSWER.indexOf("| 重解析"));
  view.update(
    React.createElement(TypewriterMarkdown, {
      content: midTable,
      active: true,
    }),
  );
  assert.equal(
    host.querySelector("table"),
    null,
    "表格还没收齐就不许出现 <table>（列数会跳变）",
  );
  assert.ok(
    host.textContent.includes("| 指标 | 改前 | 改后 |"),
    "没收齐的表要按纯文本原样显示，而不是消失",
  );

  const midFence = ANSWER.slice(0, ANSWER.indexOf("stream.close"));
  view.update(
    React.createElement(TypewriterMarkdown, {
      content: midFence,
      active: true,
    }),
  );
  assert.equal(
    host.querySelector("pre"),
    null,
    "围栏没闭合就不许出现 <pre>（高亮器会为每个字符重跑一遍）",
  );
  assert.ok(
    host.textContent.includes("const stream = subscribe(url);"),
    "没闭合的围栏要按纯文本显示",
  );
  // 这一步表格已经收齐了，它必须已经是真表格。
  assert.ok(
    host.querySelector("table"),
    "表格收齐之后应当切换成真正的 <table>",
  );
  view.unmount();
});

test("反面：关掉增量（逐 token 全量重渲）时，上面两条当场失守", () => {
  const host = mountHost();
  const midTable = ANSWER.slice(0, ANSWER.indexOf("| 重解析"));
  const midFence = ANSWER.slice(0, ANSWER.indexOf("stream.close"));

  // active=false 即改动之前的行为：整段直接交给 react-markdown。
  const view = renderInto(
    host,
    React.createElement(TypewriterMarkdown, {
      content: midTable,
      active: false,
    }),
  );
  assert.ok(
    host.querySelector("table"),
    "对照组：全量重渲会把没收齐的表提前画成 <table>",
  );
  const columns = host.querySelectorAll("thead th").length;

  view.update(
    React.createElement(TypewriterMarkdown, {
      content: midFence,
      active: false,
    }),
  );
  assert.ok(
    host.querySelector("pre"),
    "对照组：全量重渲会把没闭合的围栏提前画成代码块",
  );
  assert.equal(columns, 3, "对照组的表头列数取自半截输入，正是跳列的来源");
  view.unmount();
});

// ===========================================================================
// 3. 已闭合块不被重建
// ===========================================================================

test("已闭合块的 DOM 节点在后续 token 到达时引用不变", () => {
  const host = mountHost();
  const view = renderInto(
    host,
    React.createElement(TypewriterMarkdown, { content: "", active: true }),
  );

  // 喂到标题与首段都已闭合。
  const afterIntro = ANSWER.slice(0, ANSWER.indexOf("- 首字"));
  view.update(
    React.createElement(TypewriterMarkdown, {
      content: afterIntro,
      active: true,
    }),
  );
  const heading = host.querySelector("h1");
  const firstParagraph = host.querySelector("p");
  assert.ok(heading && firstParagraph, "标题与首段应当已经画出来了");

  // 剩下的全部逐 token 喂完。
  for (const partial of tokenize(ANSWER, 5)) {
    if (partial.length <= afterIntro.length) continue;
    view.update(
      React.createElement(TypewriterMarkdown, {
        content: partial,
        active: true,
      }),
    );
  }

  assert.equal(
    host.querySelector("h1"),
    heading,
    "标题节点被重建了——已闭合块的缓存没有生效",
  );
  assert.equal(
    host.querySelector("p"),
    firstParagraph,
    "首段节点被重建了——已闭合块的缓存没有生效",
  );
  view.unmount();
});

test("反面：关掉增量后，已经画好的列表节点会被后到的 token 推倒重建", () => {
  // tight → loose 是最典型的一种「追认」：后面再来一个列表项，
  // 前面每个 <li> 都要多包一层 <p>，DOM 当场重建。
  const host = mountHost();
  const first = "- a\n- b\n";
  const view = renderInto(
    host,
    React.createElement(TypewriterMarkdown, { content: first, active: false }),
  );
  const beforeItem = host.querySelector("li");
  const beforeText = beforeItem.firstChild;
  assert.equal(beforeItem.querySelector("p"), null, "tight 列表里不该有 <p>");

  view.update(
    React.createElement(TypewriterMarkdown, {
      content: "- a\n- b\n\n- c\n",
      active: false,
    }),
  );
  const afterItem = host.querySelector("li");
  assert.ok(
    afterItem.querySelector("p"),
    "对照组：列表变 loose 后每个 <li> 多包了一层 <p>",
  );
  assert.notEqual(
    afterItem.firstChild,
    beforeText,
    "对照组：<li> 里的内容节点确实被推倒重建了",
  );
  view.unmount();

  // 同一段输入走增量：列表根本不会在定型之前被画出来，也就无所谓重建。
  const incrementalHost = mountHost();
  const incremental = renderInto(
    incrementalHost,
    React.createElement(TypewriterMarkdown, { content: first, active: true }),
  );
  assert.equal(
    incrementalHost.querySelector("li"),
    null,
    "增量渲染在列表定型之前不画列表",
  );
  incremental.unmount();
});

// ===========================================================================
// 4. 终态正确性：与一次性渲染逐字相同
// ===========================================================================

test("逐 token 喂完之后的 DOM 与一次性渲染逐字相同", () => {
  const streamHost = mountHost();
  const stream = renderInto(
    streamHost,
    React.createElement(TypewriterMarkdown, { content: "", active: true }),
  );
  for (const partial of tokenize(ANSWER, 4)) {
    stream.update(
      React.createElement(TypewriterMarkdown, {
        content: partial,
        active: true,
      }),
    );
  }
  // 流结束：active 落回 false。
  stream.update(
    React.createElement(TypewriterMarkdown, {
      content: ANSWER,
      active: false,
    }),
  );

  const oneShotHost = mountHost();
  const oneShot = renderInto(
    oneShotHost,
    React.createElement(
      Markdown,
      { className: "text-[15px] leading-relaxed" },
      ANSWER,
    ),
  );

  assert.equal(
    streamHost.innerHTML,
    oneShotHost.innerHTML,
    "增量渲染的终态必须与一次性渲染逐字相同",
  );
  // 终态该有的结构一个都不能少。
  assert.ok(streamHost.querySelector("h1"));
  assert.ok(streamHost.querySelector("table"));
  assert.ok(streamHost.querySelector("pre"));
  assert.equal(streamHost.querySelectorAll("li").length, 3);
  stream.unmount();
  oneShot.unmount();
});

test("流式中途切到终态不会丢内容", () => {
  const host = mountHost();
  const half = ANSWER.slice(0, Math.floor(ANSWER.length * 0.6));
  const view = renderInto(
    host,
    React.createElement(TypewriterMarkdown, { content: half, active: true }),
  );
  const streamingText = host.textContent;
  assert.ok(streamingText.includes("季度小结"));
  view.update(
    React.createElement(TypewriterMarkdown, { content: half, active: false }),
  );
  assert.ok(
    host.textContent.includes("季度小结"),
    "停止流式不该丢掉已经收到的内容",
  );
  view.unmount();
});
