import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule } from "./helpers/module-bench.mjs";

const composer = await readFile(
  new URL("../src/shell/LeoComposer.tsx", import.meta.url),
  "utf8",
);
const functionChat = await readFile(
  new URL("../src/shell/FunctionAgentChat.tsx", import.meta.url),
  "utf8",
);
const agentChat = await readFile(
  new URL("../src/shell/AgentChat.tsx", import.meta.url),
  "utf8",
);
const markdown = await readFile(
  new URL("../src/shell/Markdown.tsx", import.meta.url),
  "utf8",
);
const transcriptBubble = await readFile(
  new URL("../src/shell/AgentTranscriptBubble.tsx", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// 「不逐帧重解析 Markdown」这道闸的装台（裁定 R11，2026-08-31）
// ---------------------------------------------------------------------------
// 这道闸原本有三条断言：不许出现假打字机（`content.slice(0, shown)`）、不许出现
// 定时器（`setTimeout(`）、以及**源码必须逐字等于** `return <Markdown …>{content}</Markdown>`。
// 前两条断的是意图，第三条断的是实现。W21 把整段一次性解析改成块级切分 + 已闭合块
// memo 之后，第三条必然红——但它红的是「实现换了」，不是「意图破了」。
//
// 所以第三条换成**行为断言**：真的逐 token 喂一遍，看已经画好的节点还在不在。
// 这比原来那条更严——原来那条只认一行源码，任何一种照抄那行却在别处逐帧重解析的
// 写法都能骗过它；现在骗不过，因为判的是 DOM 有没有被推倒。
//
// jsdom 取自 `fabric/node` 自带那份（仓内唯一可用），写法与
// `tests/incremental-markdown.test.mjs:21` 同源。
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

/** 一段同时含标题 / 段落 / 列表 / 表格 / 代码围栏的回答，即最坏情况。 */
const STREAMED_ANSWER = [
  "# 季度小结",
  "",
  "这一版把三件事做完了。",
  "",
  "- 首字可见延迟从 1.2s 降到 0.2s",
  "- 表格不再跳列",
  "",
  "| 指标 | 改前 | 改后 |",
  "|---|---|---|",
  "| 首字 | 1200ms | 200ms |",
  "",
  "```js",
  "const stream = subscribe(url);",
  "```",
  "",
  "就这些。",
  "",
].join("\n");

/** 喂到这里，标题与首段都已闭合、后面还有一大半没到。 */
const AFTER_INTRO = STREAMED_ANSWER.slice(
  0,
  STREAMED_ANSWER.indexOf("- 首字"),
);

/**
 * 逐 token 喂完整段，回报「喂之前就已经画好的那两个节点」是不是还是原来那两个。
 *
 * `render(content)` 由调用方给：正路给真的 `TypewriterMarkdown`，反面用例给一个
 * 去掉 memo 的对照件。两边走的是**同一套判定**，所以正路的绿是挣来的，不是这段
 * 探针本身判不出问题。
 */
function closedBlocksSurviveFeed(render) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(render("")));
  act(() => root.render(render(AFTER_INTRO)));

  const heading = host.querySelector("h1");
  const paragraph = host.querySelector("p");
  assert.ok(
    heading && paragraph,
    "喂到 AFTER_INTRO 时标题与首段必须都已经画出来了，否则这条探针什么也没测",
  );

  for (let cut = AFTER_INTRO.length; cut < STREAMED_ANSWER.length; cut += 5) {
    act(() => root.render(render(STREAMED_ANSWER.slice(0, cut))));
  }
  act(() => root.render(render(STREAMED_ANSWER)));

  const survived =
    host.querySelector("h1") === heading &&
    host.querySelector("p") === paragraph;
  act(() => root.unmount());
  host.remove();
  return survived;
}

/**
 * 对照件：**同样**按块切、**同样**用块序号当 key，唯独每块走没有 memo 包过的
 * `Markdown`。它与真身的唯一差别就是那一层 memo，所以它红就证明红的是 memo。
 */
function UnmemoizedBlocks({ content }) {
  const { blocks } = splitStreamingMarkdown(content);
  return React.createElement(
    "div",
    null,
    blocks.map((block) =>
      React.createElement(Markdown, { key: block.key }, block.source),
    ),
  );
}

test("普通发送不会被误认成操作台 override，输入和附件会清空", () => {
  assert.match(functionChat, /onSubmit=\{\(\) => void send\(\)\}/);
  assert.match(functionChat, /if \(!override\) \{\s*setInput\(""\);\s*atts\.clear\(\)/);
  assert.match(agentChat, /onSubmit=\{\(\) => void send\(\)\}/);
});

test("发送失败只在没有新草稿时恢复原输入和附件", () => {
  assert.match(functionChat, /const restoreSubmission = \(\) =>/);
  assert.match(agentChat, /const restoreSubmission = \(\) =>/);
  assert.match(
    functionChat,
    /setInput\(\(current\) => \(current \? current : submittedInput\)\)/,
  );
  assert.match(agentChat, /atts\.restoreReady\(submittedAttachments\)/);
});

test("附件可以单独发送，上传完成前发送键保持禁用", () => {
  assert.match(composer, /value\.trim\(\) \|\| attachments\?\.length/);
  assert.match(
    composer,
    /!attachments\?\.some\(\(attachment\) => attachment\.uploading\)/,
  );
});

test("不逐帧重解析 Markdown：已闭合块 memo 住，只有尾巴在重画", () => {
  // 原样保留这道闸真正要防的两样东西。
  // 假打字机：把整段切一刀按 `shown` 往外吐，每帧重解析整段。
  assert.doesNotMatch(markdown, /content\.slice\(0,\s*shown\)/);
  // 定时器逐字吐：比真流式更慢，且同样每帧重解析整段。
  assert.doesNotMatch(markdown, /setTimeout\(/);

  // 原来的第三条断言把实现钉死成一行源码（`return <Markdown …>{content}</Markdown>`）。
  // 换成行为：逐 token 喂完，已经画好的标题与首段必须还是**同一批 DOM 节点**。
  // 节点被换掉就意味着那一块被重解析了——用户划的选区、滚动锚点都在那一下里丢。
  assert.ok(
    closedBlocksSurviveFeed((content) =>
      React.createElement(TypewriterMarkdown, { content, active: true }),
    ),
    "已闭合块的 DOM 节点被重建了——整条消息又在逐帧重解析",
  );
});

test("反面：把已闭合块的 memo 去掉，上一条当场失守", () => {
  // 这条用例存在的唯一理由：证明上一条**有约束力**。
  // 对照件与真身只差那一层 memo（切分一样、块 key 一样），它必须红。
  assert.equal(
    closedBlocksSurviveFeed((content) =>
      React.createElement(UnmemoizedBlocks, { content }),
    ),
    false,
    "对照组也没被重建 —— 那说明上一条探针根本判不出重解析，这道闸是空的",
  );
});

test("块 key 与 source 稳定——memo 能命中的前提", () => {
  // memo 只在「同一个 key 拿到逐字相同的 source」时才短路。切分器若在后续 token
  // 到达时改写了已经交出去的块（改名、改内容、重排），memo 当场落空，块级缓存等于没有。
  const issued = new Map();
  for (let cut = 1; cut <= STREAMED_ANSWER.length; cut += 3) {
    for (const block of splitStreamingMarkdown(STREAMED_ANSWER.slice(0, cut))
      .blocks) {
      const previous = issued.get(block.key);
      if (previous !== undefined) {
        assert.equal(
          block.source,
          previous,
          `块 ${block.key} 的 source 被改写了：${JSON.stringify(
            previous,
          )} → ${JSON.stringify(block.source)}`,
        );
      }
      issued.set(block.key, block.source);
    }
  }
  assert.ok(
    issued.size >= 4,
    `语料只切出 ${issued.size} 块，太少，这条断言没有说服力`,
  );
});

test("主站与专业站复用同一个对话消息渲染器", () => {
  assert.match(agentChat, /<AgentTranscriptBubble/);
  assert.match(functionChat, /<AgentTranscriptBubble/);
  assert.match(transcriptBubble, /message\.kind === "gate"/);
  assert.match(transcriptBubble, /if \(message\.meta\?\.artifact\)/);
  assert.doesNotMatch(
    transcriptBubble,
    /message\.meta\?\.artifact && message\.meta\.final/,
  );
});
