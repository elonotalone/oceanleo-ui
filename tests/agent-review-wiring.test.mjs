/**
 * W02 接线闸：锁产品行为与去向纯函数，不只锁源码里出现过函数名。
 *
 * V6 原判（A-56）：`if (false) installAgentReviewGate()` 或只删调用，5/5 仍绿。
 * 改法照 A-53：去向由 `routeAgentCommandRun` 返回 route，桥只照 tag 分发；
 * 选区由 `assembleAgentEditorContext` 拼进上下文。绕过必须拆掉整支分支。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { routeAgentCommandRun } from "../src/shell/agent-review/gate.ts";
import { assembleAgentEditorContext } from "../src/shell/agent-review/selection-bridge.ts";

const chat = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
const fnChat = readFileSync(
  new URL("../src/shell/FunctionAgentChat.tsx", import.meta.url),
  "utf8",
);
const consoleSource = readFileSync(
  new URL("../src/shell/AgentConsole.tsx", import.meta.url),
  "utf8",
);
const gate = readFileSync(
  new URL("../src/shell/agent-review/gate.ts", import.meta.url),
  "utf8",
);
const toolbar = readFileSync(
  new URL("../src/shell/SelectionToolbar.tsx", import.meta.url),
  "utf8",
);
const dock = readFileSync(
  new URL("../src/shell/agent-review/dock.tsx", import.meta.url),
  "utf8",
);

test("去向纯函数默认送审：不持 apply 的 mutates 不得执行", () => {
  const route = routeAgentCommandRun({
    surfaceEditorId: "grid",
    commandId: "grid.set-cell",
    mutates: true,
    holds: [],
  });
  assert.equal(route.kind, "review");
  const blocked = assembleAgentEditorContext("", "改短一点", null, []);
  assert.equal(blocked, "");
  const withSel = assembleAgentEditorContext("〔右边编辑器〕", "改 @B列", {
    kind: "grid-column",
    id: "col-B",
    summary: "B 列",
  }, [{ kind: "grid-column", id: "col-B", summary: "B 列销售额" }]);
  assert.match(withSel, /〔当前选区〕/);
  assert.match(withSel, /kind=grid-column/);
  assert.match(withSel, /〔提到的对象〕/);
});

test("闸的 run 只照 route.kind 分发，review 分支必须在", () => {
  assert.match(gate, /const route = routeAgentCommandRun\(/);
  assert.match(gate, /if \(route\.kind === "execute"\)/);
  assert.match(gate, /parkedFromMutatingRun/);
  assert.doesNotMatch(
    gate,
    /if \(applyDepth\s*>\s*0\)/,
    "全局 applyDepth 放行所有面 = V3-red-6",
  );
  assert.match(gate, /export function reviewApplyHeld/);
  assert.match(gate, /export function reviewApplyHeld\(\s*editorId: string/);
  assert.doesNotMatch(
    gate,
    /if \(!editorId\) return true/,
    "裸调 reviewApplyHeld() 返回真 = V3-red-6 潜伏口",
  );
  assert.doesNotMatch(
    gate,
    /hold \?\? \{ editorId: "\*" \}/,
    "漏传 hold 造出 * 通配持有 = 潜伏失败即开放",
  );
  assert.doesNotMatch(gate, /hold\?: ReviewApplyHold/);
  assert.doesNotMatch(gate, /editorId\?: string/);
});

test("AgentChat 挂了审阅面板、chips、选区拼装与 agent 闸", () => {
  assert.match(chat, /from "\.\/agent-review"/);
  assert.match(chat, /from "\.\/quick-actions"/);
  assert.match(chat, /createReviewGatedReader/);
  assert.match(chat, /installAgentReviewGate\(\)/);
  assert.match(chat, /AgentReviewPanel/);
  assert.match(chat, /QuickActionChips/);
  assert.match(chat, /assembleAgentEditorContext\(/);
  assert.match(chat, /useHostReviewActions\(\)/);
  assert.match(dock, /applyParkedReview\(surface, snap\.parked\)/);
  assert.match(dock, /applyParkedReview\(surface, inverse\)/);
  assert.doesNotMatch(chat, /@copilotkit/);
});

test("AgentChat 不再把会改文档的确认卡（含以后不用问我）直接露给用户", () => {
  assert.match(chat, /data-agent-review-host/);
  assert.match(chat, /sr-only/);
  assert.doesNotMatch(
    chat.replace(/data-agent-review-host[\s\S]*?\{editorCommands\.card\}/, ""),
    /^\s*\{editorCommands\.card\}/m,
  );
});

test("AgentChat 源码把对象类变更清单渲染成可逐条决定的条目", () => {
  const panel = readFileSync(
    new URL("../src/shell/agent-review/AgentReviewPanel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(panel, /data-review-object=\{item\.id\}/);
  assert.match(panel, /data-agent-review-item="accept"/);
  assert.match(panel, /data-agent-review-action="rollback"/);
});

test("AgentConsole 同样包闸并挂审阅与 chips", () => {
  assert.match(consoleSource, /from "\.\/agent-review"/);
  assert.match(consoleSource, /from "\.\/quick-actions"/);
  assert.match(consoleSource, /createReviewGatedReader/);
  assert.match(consoleSource, /installAgentReviewGate\(\)/);
  assert.match(consoleSource, /AgentReviewPanel/);
  assert.match(consoleSource, /QuickActionChips/);
  assert.match(consoleSource, /useHostReviewActions\(\)/);
  assert.match(consoleSource, /<AgentReviewHostProvided>/);
});

test("FunctionAgentChat 自带审阅面板，并把选区块拼进上下文", () => {
  assert.match(fnChat, /<AgentReviewDock \/>/);
  assert.match(fnChat, /assembleAgentEditorContext\(/);
  assert.match(fnChat, /installAgentReviewGate\(\)/);
  assert.match(fnChat, /installSelectionBridge\(\)/);
  assert.match(
    fnChat,
    /window\.addEventListener\("oceanleo-l4-chip"/,
    "操作台形态下点 chip 必须有人收（R4）；源码命中只是辅闸，行为在 function-agent-l4-chip",
  );
});

test("SelectionToolbar 选区变化时把 kind/id 送进 agent 收件箱（不改排布）", () => {
  assert.match(toolbar, /publishAgentSelection\(context\)/);
  assert.match(toolbar, /data-selection-kind=\{context\?\.kind/);
  assert.match(toolbar, /data-selection-id=\{context\?\.id/);
});
