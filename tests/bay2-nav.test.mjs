// LeoBay 第二波 W3：侧栏「探索」换成 LeoBay；/bay 与 /explore 都高亮它。
import { test } from "node:test";
import assert from "node:assert/strict";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { NAV_SOURCE, navEntries } from "../src/shell/nav-source/index.ts";

test("导航里有 /bay 的 LeoBay 项、没有 /explore 项", () => {
  const bay = NAV_SOURCE.find((entry) => entry.id === "bay");
  assert.ok(bay);
  assert.equal(bay.href, "/bay");
  assert.equal(bay.labelKey, "LeoBay");
  assert.equal(bay.iconId, "bay");
  assert.equal(
    NAV_SOURCE.some((entry) => entry.href === "/explore"),
    false,
  );
  assert.equal(
    NAV_SOURCE.some((entry) => entry.id === "explore"),
    false,
  );
  const ws = navEntries("workspace");
  const item = ws.find((entry) => entry.id === "bay");
  assert.ok(item);
  assert.equal(item.href, "/bay");
  assert.equal(item.labelKey, "LeoBay");
  assert.equal(
    ws.some((entry) => entry.href === "/explore"),
    false,
  );
});

test("withExplore: false 或 withBay: false 时没有它", () => {
  assert.equal(
    navEntries("workspace", { withExplore: false }).some((entry) => entry.id === "bay"),
    false,
  );
  assert.equal(
    navEntries("workspace", { withBay: false }).some((entry) => entry.id === "bay"),
    false,
  );
  assert.equal(
    navEntries("workspace", { withExplore: true, withBay: false }).some((entry) => entry.id === "bay"),
    false,
  );
  assert.ok(navEntries("workspace").some((entry) => entry.id === "bay"));
});

const uiStub = dataModule("export function useUI(){ return (zh) => zh; }");
const intlStub = dataModule("export function useTranslations(){ return (key) => key; }");
const bayStateStub = dataModule("export function bayEnabledHere(){ return true; }");

const { workspaceNav, pageFromPath } = await import(
  await compileModule("src/shell/WorkspacePages.tsx", {
    "../i18n/ui/useUI": uiStub,
    "next-intl": intlStub,
    "./bay/shell/bay-state": bayStateStub,
    "./leochat/LeoChatButton": dataModule(`
      export function LeoChatGlyph(){ return null; }
      export function LeoChatButton(){ return null; }
    `),
  })
);

test("/explore、/bay 路径都高亮 LeoBay 这一项", () => {
  assert.equal(pageFromPath("/bay"), "bay");
  assert.equal(pageFromPath("/explore"), "bay");
  assert.equal(pageFromPath("/bay/x"), "bay");
  const nav = workspaceNav();
  const item = nav.find((row) => row.href === "/bay");
  assert.ok(item);
  assert.equal(item.label, "LeoBay");
  assert.equal(typeof item.match, "function");
  assert.equal(item.match("/bay"), true);
  assert.equal(item.match("/explore"), true);
  assert.equal(item.match("/workspace"), false);
  assert.equal(
    workspaceNav({ withExplore: false }).some((row) => row.href === "/bay"),
    false,
  );
  assert.equal(
    workspaceNav({ withBay: false }).some((row) => row.href === "/bay"),
    false,
  );
});
