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
// 2026-09-21：账户菜单从 AccountPage 搬进 SettingsHub（AccountPage 只剩壳）。
const accountPage = await readFile(
  new URL("../src/pages/settings/SettingsHub.tsx", import.meta.url),
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
  assert.match(manager, /selectedRows\.map/);
  assert.match(manager, /offerGroups\.map/);
  assert.match(manager, /编辑组合/);
  assert.match(manager, /保存组合/);
  assert.match(manager, /\+ 新建自定义组合/);
  assert.doesNotMatch(manager, /<table/);
  assert.doesNotMatch(page, /<ModelCapabilityMarket/);
});

test("预设复制编辑，自定义组合可命名删除并调整主备顺序", () => {
  assert.match(manager, /item\.kind === "custom"/);
  assert.match(manager, /group\.kind === "preset"/);
  assert.match(manager, /复制并编辑组合/);
  assert.match(manager, /moveModel\(index, direction\)/);
  assert.doesNotMatch(manager, /从上到下依次尝试/);
  assert.doesNotMatch(manager, /data-model-group-fallback/);
  assert.match(manager, /data-model-group-table/);
  assert.match(manager, /fallbackLabel/);
  assert.match(manager, /updateModelGroup\(group\.id, \{ selection: draft \}\)/);
});

test("同名合并行、不可选禁用、已下架灰显、价未公布", () => {
  assert.match(manager, /partitionOfferModels\(allModels/);
  assert.match(manager, /groupOffers\(partitioned\.selectable/);
  assert.match(manager, /groupOffers\(partitioned\.unavailable/);
  assert.match(manager, /data-model-offer-disabled/);
  assert.match(manager, /data-model-delisted/);
  assert.match(manager, /已下架/);
  assert.match(manager, /价未公布/);
  assert.match(manager, /搜模型查价/);
  assert.match(manager, /canSelect\(model, byokProviders\)/);
  assert.doesNotMatch(manager, /免费 \/ 未公布/);
});

test("AI 模型页删除用量记录与独立市场，价格来源位于组合管理之后", () => {
  assert.match(page, /title=\{tt\("AI 模型"\)\}/);
  // 2026-09-24 W07：能力项「AI 模型」是设置窗面板，不是 /api 链接。旧断言
  // `label: tt("AI 模型"), href: "/api"` 钉住的正是点了没反应、子站 404 的那条缺陷。
  assert.match(accountPage, /id: "ai-models"/);
  assert.match(accountPage, /label: tt\("AI 模型"\)/);
  assert.match(accountPage, /<ApiPage variant="pane"/);
  assert.doesNotMatch(accountPage, /href: "\/api"/);
  assert.doesNotMatch(accountPage, /label: "API", href: "\/api"/);
  assert.doesNotMatch(page, /用量记录|前往 Cost 页/);
  const managerIndex = page.indexOf("<ModelGroupManager");
  const pricingIndex = page.indexOf('tt("价格数据来源")');
  assert.ok(managerIndex >= 0 && pricingIndex > managerIndex);
});
