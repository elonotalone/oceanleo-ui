/**
 * W02 判据 3：选区桥。kind/id/摘要进上下文；@页/@列/@图层。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentSelectionBlock,
  formatSelectionContext,
  parseAtMentions,
  selectionToAgent,
} from "../src/shell/agent-review/selection-bridge.ts";
import { askAiPrompt } from "../src/shell/quick-actions/ask-ai.ts";

test("SelectionContext 投影出 kind/id/摘要", () => {
  const sel = selectionToAgent({
    version: 1,
    kind: "grid-column",
    id: "col-B",
    label: "B 列",
    text: "销售额",
    controls: [],
  });
  assert.equal(sel.kind, "grid-column");
  assert.equal(sel.id, "col-B");
  assert.equal(sel.summary, "销售额");
  const block = formatSelectionContext(sel);
  assert.match(block, /kind=grid-column/);
  assert.match(block, /id=col-B/);
  assert.match(block, /摘要=销售额/);
});

test("聊天 @第三页 @B列 @这个图层 能解析", () => {
  const catalog = [
    { kind: "pdf-page", id: "page-3", summary: "目录页" },
    { kind: "grid-column", id: "col-B", summary: "B 列销售额", label: "B 列" },
    { kind: "image", id: "layer-hero", summary: "主视觉图层" },
  ];
  const hits = parseAtMentions("请改 @第三页 的标题，并清洗 @B列，再修 @这个图层", catalog);
  assert.equal(hits.length, 3);
  assert.equal(hits[0].kind, "page");
  assert.equal(hits[0].id, "page-3");
  assert.equal(hits[1].kind, "column");
  assert.equal(hits[1].id, "col-B");
  assert.equal(hits[2].kind, "layer");
  assert.equal(hits[2].id, "layer-hero");
});

test("拼进 agent 上下文的块同时含当前选区与 @ 对象", () => {
  const sel = { kind: "grid-cell", id: "A1", summary: "单元格 A1" };
  const block = buildAgentSelectionBlock(sel, "看 @B列", [
    { kind: "grid-column", id: "col-B", summary: "B 列" },
  ]);
  assert.match(block, /〔当前选区〕/);
  assert.match(block, /kind=grid-cell/);
  assert.match(block, /〔提到的对象〕/);
  assert.match(block, /column col-B/);
});

test("问 AI 指令默认带上当前选区", () => {
  const prompt = askAiPrompt("改短一点", {
    kind: "pdf-page",
    id: "page-1",
    summary: "封面",
  });
  assert.match(prompt, /改短一点/);
  assert.match(prompt, /kind=pdf-page/);
  assert.match(prompt, /摘要=封面/);
});
