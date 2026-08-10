// 插件模块自己声明 placements；平台只负责把匹配当前 app 的模块变成操控台按键。

import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_CAPABILITY_QUERY_KEY,
  appCapabilityEntries,
  appCapabilityFamilyFromSearch,
  appCapabilitySearch,
  resolveAppCapabilityEntries,
} from "../src/shell/app-capability-entry.ts";

function plugin(id, label, placements) {
  return {
    id,
    label,
    placements,
    render: () => null,
  };
}

const REAL_APP = { site: "travel", app: "trip-planner" };

test("生产名单来自 pluginModules()，本波为空", () => {
  assert.deepEqual(
    appCapabilityEntries(REAL_APP.site, REAL_APP.app),
    [],
  );
});

test("假的插件模块声明真实 app 后，那枚按键真的进入该 app 的操控台数据", () => {
  const module = plugin("route-sketch", "路线草图", [REAL_APP]);
  assert.deepEqual(
    resolveAppCapabilityEntries([module], REAL_APP.site, REAL_APP.app),
    [module],
  );
});

test("label 含「插件」时不产出用户可见按键", () => {
  const badLabel = plugin("route-sketch", "路线插件", [REAL_APP]);
  assert.deepEqual(
    resolveAppCapabilityEntries([badLabel], REAL_APP.site, REAL_APP.app),
    [],
  );
});

test("placements 指向不存在的 app 时不产出按键，也不抛错", () => {
  const elsewhere = plugin("route-sketch", "路线草图", [REAL_APP]);
  assert.doesNotThrow(() =>
    resolveAppCapabilityEntries(
      [elsewhere],
      "does-not-exist",
      "missing-app",
    ),
  );
  assert.deepEqual(
    resolveAppCapabilityEntries(
      [elsewhere],
      "does-not-exist",
      "missing-app",
    ),
    [],
  );
});

test("位置层不审核插件内容，返回的是模块本身", () => {
  const render = () => ({ arbitrary: "shape" });
  const module = {
    id: "anything-goes",
    label: "任意画布",
    placements: [REAL_APP],
    render,
  };
  const [resolved] = resolveAppCapabilityEntries(
    [module],
    REAL_APP.site,
    REAL_APP.app,
  );
  assert.equal(resolved, module);
  assert.equal(resolved.render, render);
});

test("选中态只改 query，路径由宿主保持不变", () => {
  assert.equal(APP_CAPABILITY_QUERY_KEY, "cap");
  const withCap = appCapabilitySearch("?tab=library&item=42", "route-sketch");
  assert.equal(appCapabilityFamilyFromSearch(withCap), "route-sketch");
  const params = new URLSearchParams(withCap.slice(1));
  assert.equal(params.get("tab"), "library");
  assert.equal(params.get("item"), "42");

  const cleared = appCapabilitySearch(withCap, "");
  assert.equal(appCapabilityFamilyFromSearch(cleared), "");
  assert.equal(new URLSearchParams(cleared.slice(1)).get("tab"), "library");
  assert.equal(appCapabilitySearch("", null), "");
});
