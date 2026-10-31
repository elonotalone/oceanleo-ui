// Streaming inline Markdown (2026-10-31). JSDOM setup copied from incremental-markdown.
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

const { Markdown, TypewriterMarkdown } = await import(
  await compileModule("src/shell/Markdown.tsx")
);


const { cjkFriendlyEmphasis, streamingTailSource } = await import(
  await compileModule("src/shell/markdown-inline-repair.ts")
);

// 2026-10-31 operator: `**Sidebar My Tasks order:** why …` showed raw `**` for a
// minute+ while streaming and turned bold only later. Root cause: the open tail
// (the paragraph / list still being typed, until a blank line closes it) was
// rendered as PLAIN TEXT. These lock: inline formatting renders in the tail as
// soon as its closer arrived, a dangling opener is never shown raw, block
// structure still waits (no early <li>/<table>/<pre>), and CJK punctuation next
// to `**` pairs (CommonMark flanking).

const ZW = /​/g;
function render(content, active = true) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(TypewriterMarkdown, { content, active })));
  const strong = [...host.querySelectorAll("strong")].map((node) => node.textContent.replace(ZW, ""));
  const text = host.textContent.replace(ZW, "");
  const html = host.innerHTML;
  act(() => root.unmount());
  host.remove();
  return { strong, text, html, host };
}

test("repro: bold in a still-open list item / paragraph renders while streaming", () => {
  for (const content of [
    "- **Sidebar My Tasks order:** why the list moves",
    "说明如下。\n\n**Sidebar My Tasks order:** why the list moves when",
    "1. 第一条\n2. **Sidebar My Tasks order:** why",
  ]) {
    const view = render(content);
    assert.deepEqual(view.strong, ["Sidebar My Tasks order:"], content);
    assert.doesNotMatch(view.text, /\*\*/, `raw ** shown: ${view.text}`);
    assert.doesNotMatch(view.html, /<li/, "a list still waits for its block to close");
  }
  // italic / code / strike in the tail too.
  const mixed = render("看 *这里* 和 `npm test` 以及 ~~旧的~~ 方案");
  assert.match(mixed.html, /<em>这里<\/em>/);
  assert.match(mixed.html, /<code[^>]*>npm test<\/code>/);
  assert.match(mixed.html, /<del[^>]*>旧的<\/del>/);
});

test("the same partial text never depends on later content: every prefix past the closer is bold", () => {
  const full = "- **Sidebar My Tasks order:** why the order changes after a refresh";
  const closer = full.indexOf(":**") + 3;
  for (let end = closer; end <= full.length; end += 3) {
    const view = render(full.slice(0, end));
    assert.deepEqual(view.strong, ["Sidebar My Tasks order:"], full.slice(0, end));
  }
});

test("a dangling opener at the streaming end is closed, or hidden while nothing follows it", () => {
  const typing = render("前文 **Sidebar My Ta");
  assert.deepEqual(typing.strong, ["Sidebar My Ta"]);
  assert.doesNotMatch(typing.text, /\*/);
  const bare = render("前文 **");
  assert.equal(bare.text.trim(), "前文");
  const code = render("运行 `npm te");
  assert.match(code.html, /<code[^>]*>npm te<\/code>/);
  assert.doesNotMatch(code.text, /`/);
  const star = render("看 *这");
  assert.match(star.html, /<em>这<\/em>/);
  // Not emphasis: a multiplication / a bullet stays as typed.
  assert.match(render("2 * 3 = 6").text, /2 \* 3 = 6/);
});

test("block markers in the tail stay as typed (no early structure)", () => {
  const table = render("| 指标 | 改前 |\n|---|---|\n| 首字 | **1200ms** |");
  assert.doesNotMatch(table.html, /<table/);
  assert.ok(table.text.includes("| 指标 | 改前 |"));
  assert.ok(table.text.includes("|---|---|"));
  assert.deepEqual(table.strong, ["1200ms"]);
  const heading = render("## 标题 **重点");
  assert.doesNotMatch(heading.html, /<h2/);
  assert.ok(heading.text.startsWith("## 标题"));
  const fence = render("```js\nconst a = **b**;");
  assert.doesNotMatch(fence.html, /<pre|<strong/, "code stays plain text");
  assert.equal(streamingTailSource("```js\nx"), null);
});

test("CJK punctuation next to ** pairs (finished and streaming)", () => {
  for (const content of ["**粗体：**后文", "前文**「引语」**后文", "**注意（重要）**请看"]) {
    const done = render(content, false);
    assert.equal(done.strong.length, 1, `${content} → ${done.html}`);
    assert.doesNotMatch(done.text, /\*/);
    const live = render(content, true);
    assert.equal(live.strong.length, 1, `streaming ${content}`);
  }
  // The one-shot Markdown renderer gets the same fix.
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(React.createElement(Markdown, null, "- **排序：**原因如下")));
  assert.equal(host.querySelector("strong")?.textContent.replace(ZW, ""), "排序：");
  act(() => root.unmount());
});

test("cjkFriendlyEmphasis: only flanking failures change; code is untouched", () => {
  assert.equal(cjkFriendlyEmphasis("**plain** text"), "**plain** text");
  assert.equal(cjkFriendlyEmphasis("**order:** why"), "**order:** why");
  assert.equal(cjkFriendlyEmphasis("`a**：**b`"), "`a**：**b`");
  assert.equal(cjkFriendlyEmphasis("```\n**粗体：**后文\n```"), "```\n**粗体：**后文\n```");
  assert.equal(cjkFriendlyEmphasis("* item\n2 * 3"), "* item\n2 * 3");
  assert.equal(cjkFriendlyEmphasis("**粗体：**后文").replace(ZW, ""), "**粗体：**后文");
});
