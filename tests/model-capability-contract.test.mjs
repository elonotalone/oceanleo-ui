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
