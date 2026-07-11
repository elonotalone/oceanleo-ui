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
const accountPage = await readFile(
  new URL("../src/pages/AccountPage.tsx", import.meta.url),
  "utf8",
);
const manager = await readFile(
  new URL("../src/pages/ModelCapabilityMarket.tsx", import.meta.url),
  "utf8",
);
const picker = await readFile(
  new URL("../src/shell/ModelPicker.tsx", import.meta.url),
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

test("模型组合 API 支持具名 CRUD 与全局活跃指针", () => {
  assert.match(account, /getModelGroups/);
  assert.match(account, /createModelGroup/);
  assert.match(account, /updateModelGroup/);
  assert.match(account, /deleteModelGroup/);
  assert.match(account, /setActiveModelGroup/);
  assert.match(account, /\/v1\/models\/groups\/active/);
  assert.match(account, /MODEL_GROUP_CHANGED_EVENT/);
});

test("我的模型选择在同一板块查看与编辑完整能力目录", () => {
  assert.match(manager, /export function ModelGroupManager/);
  assert.match(manager, /category\.capabilities\.map/);
  assert.match(manager, /selectedModels\.map/);
  assert.match(manager, /allModels\.map/);
  assert.match(manager, /编辑组合/);
  assert.match(manager, /保存组合/);
  assert.match(manager, /\+ 新建自定义组合/);
  assert.doesNotMatch(manager, /<table/);
  assert.doesNotMatch(page, /<ModelCapabilityMarket/);
});

test("预设只读，自定义组合可命名删除并按上下顺序兜底", () => {
  assert.match(manager, /item\.kind === "custom"/);
  assert.match(manager, /group\.kind === "preset"/);
  assert.match(manager, /平台只读组合/);
  assert.match(manager, /moveModel\(index, direction\)/);
  assert.match(manager, /从上到下依次尝试/);
  assert.match(manager, /fallbackLabel/);
  assert.match(manager, /updateModelGroup\(group\.id, \{ selection: draft \}\)/);
});

test("每站右上角恢复全局模型组合切换器，不发送一次性模型覆盖", () => {
  assert.match(appShell, /<ModelGroupPicker apiHref=\{apiHref\}/);
  assert.match(picker, /setActiveModelGroup\(group\.key\)/);
  assert.match(picker, /所有 OceanLeo 网站共用/);
  assert.doesNotMatch(picker, /tt\("平台只读组合"\)/);
  assert.doesNotMatch(agentChat, /modelSelectionKeys/);
  assert.doesNotMatch(agentChat, /agentModel:\s*selectedAgentModel/);
  assert.doesNotMatch(operatorConsole, /<ModelPicker/);
});

test("AI 模型页删除用量记录与独立市场，价格来源位于组合管理之后", () => {
  assert.match(page, /title=\{tt\("AI 模型"\)\}/);
  assert.match(accountPage, /label: tt\("AI 模型"\), href: "\/api"/);
  assert.doesNotMatch(accountPage, /label: "API", href: "\/api"/);
  assert.doesNotMatch(page, /用量记录|前往 Cost 页/);
  const managerIndex = page.indexOf("<ModelGroupManager");
  const pricingIndex = page.indexOf('tt("价格数据来源")');
  assert.ok(managerIndex >= 0 && pricingIndex > managerIndex);
});
