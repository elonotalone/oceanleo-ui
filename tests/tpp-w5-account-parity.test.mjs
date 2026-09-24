import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const shell = src("../src/shell/AppShell.tsx");
const exports = src("../src/shell/index.ts");
test("all AppShell layouts share account, device and notification controls", () => {
  assert.match(shell, /<SidebarAccountCluster/);
  assert.match(shell, /renderAccountCluster\(true\)/);
  assert.match(shell, /<SettingsModalHost/);
  assert.doesNotMatch(shell, /creditsCapsule|renderAccountButton|renderCredits/);
  assert.match(src("../src/shell/account/SidebarAccountCluster.tsx"), /props\.compact \? "w-full flex-col"/);
  assert.match(exports, /export \* from "\.\/account"/);
  const accountExports = src("../src/shell/account/index.ts");
  for (const name of ["SidebarAccountCluster", "DeviceStatusPopover", "NotificationBell", "SettingsModalHost", "openSettingsModal"]) assert.match(accountExports, new RegExp(name));
});
test("subsites hide the portal-only personalization entry", () => {
  const cluster = src("../src/shell/account/SidebarAccountCluster.tsx");
  const menu = src("../src/shell/AccountMenu.tsx");
  assert.match(cluster, /personalizationTab=\{props\.personalizationTab\}/);
  assert.match(menu, /props\.personalizationTab \? <FloatingMenuItem/);
});
test("settings route renders the shared center without site sidebar", () => {
  const page = src("../src/pages/SettingsPage.tsx");
  assert.match(page, /SettingsHub/);
  assert.match(page, /data-settings-center/);
});
