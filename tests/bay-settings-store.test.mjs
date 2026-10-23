// W09（oceanleo-bay）：设置草稿小件——旧 pane 名的判断；只读展示组件能编过。
// leobay-projects W05：设置 → LeoBay 只有一页，不再记「要看哪一块」。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";

test("settings-pane-store：旧 pane 名（profile/vetting/money）仍认得，其余不认；页签与「请求/取走」机制已随四个页签拆除", async () => {
  const store = await import(`${await compileModule("src/shell/bay/settings/settings-pane-store.ts", {})}?case=${Math.random().toString(36).slice(2)}`);
  assert.equal(store.isBaySettingsPane("money"), true);
  assert.equal(store.isBaySettingsPane("vetting"), true);
  assert.equal(store.isBaySettingsPane("profile"), true);
  assert.equal(store.isBaySettingsPane("terms"), false);
  assert.equal(store.isBaySettingsPane(undefined), false);
  for (const gone of ["BAY_SETTINGS_BLOCKS", "requestBaySettingsPane", "takeBaySettingsPane", "subscribeBaySettingsPane"]) {
    assert.equal(gone in store, false, `${gone} 应已删除：设置 → LeoBay 只有一页`);
  }
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
  // 合同 I-6：这五个导出名不变（W04 在「我买到的」用 StatementPanel + useBayMoneyLocale）。
  for (const name of ["StatementPanel", "LedgerList", "MoneyStat", "MonthlyBars", "useBayMoneyLocale"]) {
    assert.equal(typeof mod[name], "function", `money-ui 缺导出 ${name}`);
  }
});
