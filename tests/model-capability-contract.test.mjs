import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { modelTierForSelection } from "../src/lib/model-tier.ts";

const account = await readFile(
  new URL("../src/lib/auth/account.ts", import.meta.url),
  "utf8",
);
const page = await readFile(
  new URL("../src/pages/ApiPage.tsx", import.meta.url),
  "utf8",
);
const accountPage = await readFile(
  new URL("../src/pages/AccountPage.tsx", import.meta.url),
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
  assert.match(accountPage, /label: tt\("AI 模型"\), href: "\/api"/);
  assert.doesNotMatch(accountPage, /label: "API", href: "\/api"/);
});

test("我的模型选择复用模型市场的大类、能力与模型行布局", () => {
  assert.match(market, /export function ModelSelectionSummary/);
  assert.match(market, /groups\.map\(\(item\)/);
  assert.match(market, /group\.capabilities\.map\(\(item\)/);
  assert.match(market, /selectedModels\.map\(\(model, index\)/);
  assert.doesNotMatch(market, /<table/);
});

test("Lite/Pro/Max 精确匹配，任意手改进入自定义", () => {
  const tiers = {
    lite: { text: { general: ["a"] } },
    pro: { text: { general: ["b", "c"] } },
    max: { text: { general: ["d"] } },
  };
  assert.equal(
    modelTierForSelection({ text: { general: ["c", "b"] } }, tiers),
    "pro",
  );
  assert.equal(
    modelTierForSelection({ text: { general: ["b"] } }, tiers),
    "custom",
  );
  assert.equal(
    modelTierForSelection(
      { text: { general: ["b", "c"], reasoning: [] } },
      tiers,
    ),
    "custom",
  );
});

test("模型页提供三档一键应用，并在手动选择后显示自定义", () => {
  assert.match(account, /setModelTier/);
  assert.match(account, /\/v1\/models\/selection\/tier/);
  assert.match(page, /onApplyTier/);
  assert.match(market, /\["lite", "pro", "max", "custom"\]/);
  assert.match(market, /modelTierForSelection/);
});
