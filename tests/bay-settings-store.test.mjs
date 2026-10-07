// W09（oceanleo-bay）：设置「钱」草稿小件——深链记下要打开的那一块；只读展示组件能编过。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";

test("requestBaySettingsPane：只认 profile/vetting/money，取走一次，过期作废", async () => {
  const store = await import(`${await compileModule("src/shell/bay/settings/settings-pane-store.ts", {})}?case=${Math.random().toString(36).slice(2)}`);
  assert.equal(store.isBaySettingsPane("money"), true);
  assert.equal(store.isBaySettingsPane("terms"), false);
  assert.equal(store.isBaySettingsPane("profile"), true);
  assert.deepEqual([...store.BAY_SETTINGS_BLOCKS], ["profile", "vetting", "money", "terms"]);

  let ticks = 0;
  const stop = store.subscribeBaySettingsPane(() => {
    ticks += 1;
  });
  store.requestBaySettingsPane("terms");
  store.requestBaySettingsPane(undefined);
  store.requestBaySettingsPane("not-a-pane");
  assert.equal(store.takeBaySettingsPane(), null);
  assert.equal(ticks, 0);

  store.requestBaySettingsPane("money");
  assert.equal(ticks, 1);
  assert.equal(store.takeBaySettingsPane(), "money");
  assert.equal(store.takeBaySettingsPane(), null);

  store.requestBaySettingsPane("vetting");
  const first = Date.now;
  Date.now = () => first() + 16_000;
  try {
    assert.equal(store.takeBaySettingsPane(), null, "超过 15 秒没人取就作废");
  } finally {
    Date.now = first;
  }
  stop();
});

test("money-ui / use-bay-load 能编过（草稿不从 index 导出）", async () => {
  const moneyUi = await compileModule("src/shell/bay/settings/money-ui.tsx", {});
  const load = await compileModule("src/shell/bay/settings/use-bay-load.ts", {});
  assert.match(moneyUi, /^data:|^file:/);
  assert.match(load, /^data:|^file:/);
  const mod = await import(`${moneyUi}?case=compile`);
  assert.equal(typeof mod.MoneyCard, "function");
  assert.equal(typeof mod.MonthlyBars, "function");
  assert.equal(typeof mod.LedgerList, "function");
  assert.equal(typeof mod.StatementPanel, "function");
});
