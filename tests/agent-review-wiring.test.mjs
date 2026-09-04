/**
 * W02 接线：AgentChat / AgentConsole 必须挂审阅面板、chips、选区桥与闸。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chat = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
const consoleSource = readFileSync(
  new URL("../src/shell/AgentConsole.tsx", import.meta.url),
  "utf8",
);

test("AgentChat 挂了审阅面板、chips、选区桥与 agent 闸", () => {
  assert.match(chat, /from "\.\/agent-review"/);
  assert.match(chat, /from "\.\/quick-actions"/);
  assert.match(chat, /createReviewGatedReader/);
  assert.match(chat, /installAgentReviewGate/);
  assert.match(chat, /AgentReviewPanel/);
  assert.match(chat, /QuickActionChips/);
  assert.match(chat, /buildAgentSelectionBlock/);
  assert.match(chat, /applyParkedReview/);
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
  assert.match(consoleSource, /installAgentReviewGate/);
  assert.match(consoleSource, /AgentReviewPanel/);
  assert.match(consoleSource, /QuickActionChips/);
});
