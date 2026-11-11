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
  const ws = navEntries("portal");
  const item = ws.find((entry) => entry.id === "bay");
  assert.ok(item);
  assert.equal(item.href, "/bay");
  assert.equal(item.labelKey, "LeoBay");
  assert.equal(
    ws.some((entry) => entry.href === "/explore"),
    false,
  );
});

test("legacy per-site options cannot hide LeoBay in the merged shell", () => {
  for (const options of [{ withExplore: false }, { withBay: false }, { withExplore: true, withBay: false }]) {
    assert.ok(navEntries("portal", options).some((entry) => entry.id === "bay"));
  }
});

const uiStub = dataModule("export function useUI(){ return (zh) => zh; }");
const intlStub = dataModule("export function useTranslations(){ return (key) => key; }");
const bayStateStub = dataModule("export function bayEnabledHere(){ return true; }");
