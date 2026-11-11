// skills-overhaul W10（仲裁 A-16）过期断言改动：账号菜单「插件」→「技能」，落设置中心 skills 栏（原 plugins 栏已拆成技能/连接器）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const exports = src("../src/shell/index.ts");
test("shared account cluster retains controls without the retired shell barrel", () => {
  const cluster = src("../src/shell/account/SidebarAccountCluster.tsx");
  assert.match(cluster, /props\.compact \? "w-full flex-col gap-2"/);
  assert.match(cluster, /justify-between gap-3/);
  assert.match(cluster, /data-sidebar-account-actions[\s\S]*gap-3/);
  assert.match(src("../src/shell/AccountMenu.tsx"), /max-w-\[7\.5rem\]/);
  // Family merge removed the legacy AppShell account barrel, not its shared controls.
  assert.doesNotMatch(exports, /export \* from "\.\/account"/);
  const accountExports = src("../src/shell/account/index.ts");
  for (const name of ["SidebarAccountCluster", "DeviceStatusPopover", "NotificationBell", "SettingsModalHost", "openSettingsModal"]) assert.match(accountExports, new RegExp(name));
});
test("every site's account menu has personalization and skills; only an explicit null hides personalization", () => {
  const cluster = src("../src/shell/account/SidebarAccountCluster.tsx");
  const menu = src("../src/shell/AccountMenu.tsx");
  assert.match(cluster, /personalizationTab=\{props\.personalizationTab\}/);
  assert.match(menu, /props\.personalizationTab === undefined \? "personalization" : props\.personalizationTab/);
  assert.match(menu, /settings\("skills"\)/);
});
test("settings route renders the shared center without site sidebar", () => {
  const page = src("../src/pages/SettingsPage.tsx");
  assert.match(page, /SettingsHub/);
  assert.match(page, /data-settings-center/);
});
