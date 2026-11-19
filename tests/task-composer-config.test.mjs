import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { composerCapsFor, taskComposerPlaceholder, taskHeaderTitle } from "../src/shell/task-composer-config.ts";

const tt = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);

test("both task panes provide Leo, help, mentions, chips and MCP controls", () => {
  const cloud = composerCapsFor("cloud");
  const computer = composerCapsFor("acp");
  for (const key of ["leoSuggest", "getHelp", "mentions", "quickChips", "showPlugins", "showAppsBar"])
    assert.equal(computer[key], cloud[key], key);
  assert.equal(computer.showPayerSelector, false);
  assert.equal(composerCapsFor("acp", {mcp:false}).showAppsBar, false);
  assert.equal(composerCapsFor("acp", {mcp:false}).showPlugins, false);
});

test("placeholder uses the displayed agent, supports custom copy and follows the same tools rule", () => {
  for (const label of ["Custom program", "Claude Code", "Codex", "Hermes"])
    assert.equal(taskComposerPlaceholder(undefined, label, true, tt), `继续追问，或上传文件让 ${label} 分析…`);
  assert.equal(taskComposerPlaceholder(undefined, "Program", false, tt), "继续追问");
  assert.equal(taskComposerPlaceholder("Ask OceanLeo or {agent}", "My agent", true, tt), "Ask My agent or My agent");
  assert.equal(taskComposerPlaceholder("Custom prompt", "Program", true, tt), "Custom prompt");
});

test("task header uses its title, then first user text on one line, then New task", () => {
  assert.equal(taskHeaderTitle(" Title ", "First input", "New task"), "Title");
  assert.equal(taskHeaderTitle("", " First\n user  input ", "New task"), "First user input");
  assert.equal(taskHeaderTitle("", " ", "New task"), "New task");
});

test("both task composer mounts use the shared config and ACP quick chips enter the normal send path", () => {
  const source = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.match(source, /\.\.\.composerConfigFor\("cloud"\)/);
  assert.match(source, /\.\.\.composerConfigFor\("acp"\)/);
  assert.match(source, /QuickActionChips onFire=\{\(prompt\) => void sendAcpMessage\(undefined, prompt\)\}/);
  assert.doesNotMatch(source, /RestartDraftButton|正在总结本次对话/);
});
