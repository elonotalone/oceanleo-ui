import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const account = await readFile(
  new URL("../src/lib/auth/account.ts", import.meta.url),
  "utf8",
);
const page = await readFile(
  new URL("../src/pages/ApiPage.tsx", import.meta.url),
  "utf8",
);
const market = await readFile(
  new URL("../src/pages/ModelCapabilityMarket.tsx", import.meta.url),
  "utf8",
);
const appShell = await readFile(
  new URL("../src/shell/AppShell.tsx", import.meta.url),
  "utf8",
);
const agentChat = await readFile(
  new URL("../src/shell/AgentChat.tsx", import.meta.url),
  "utf8",
);
const operatorConsole = await readFile(
  new URL("../src/shell/OperatorConsole.tsx", import.meta.url),
  "utf8",
);

test("模型选择按大类与能力小类独立保存", () => {
  assert.match(account, /capability_selection/);
  assert.match(account, /JSON\.stringify\(\{ category, capability, model_ids \}\)/);
  assert.match(page, /setModelSelection\(category, capability, next\)/);
});

test("模型市场显式渲染能力小类并提供能力级 helper", () => {
  assert.match(market, /group\.capabilities/);
  assert.match(market, /selection\[group\?\.id \|\| ""\]\?\.\[item\.id\]/);
  assert.match(account, /getSelectedModelsByCapability/);
  assert.match(account, /getPreferredModel\(\s*category: string,\s*capability = ""/);
});

test("AI 模型页是唯一选择入口，工作台不再发送临时模型覆盖", () => {
  for (const shell of [appShell, agentChat, operatorConsole]) {
    assert.doesNotMatch(shell, /<ModelPicker/);
  }
  assert.doesNotMatch(agentChat, /modelSelectionKeys/);
  assert.doesNotMatch(agentChat, /agentModel:\s*selectedAgentModel/);
  assert.match(page, /title=\{tt\("AI 模型"\)\}/);
});

test("我的模型选择复用模型市场的大类、能力与模型行布局", () => {
  assert.match(market, /export function ModelSelectionSummary/);
  assert.match(market, /groups\.map\(\(item\)/);
  assert.match(market, /group\.capabilities\.map\(\(item\)/);
  assert.match(market, /selectedModels\.map\(\(model, index\)/);
  assert.doesNotMatch(market, /<table/);
});
