import assert from "node:assert/strict";
import test from "node:test";

import {
  pluginModuleProblem,
  pluginModules,
  pluginModulesForPlacement,
} from "../src/shell/plugin-module.ts";

function module(overrides = {}) {
  return {
    id: "probe",
    label: "探针",
    placements: [{ site: "study", app: "review-outline" }],
    render: () => null,
    ...overrides,
  };
}

test("拆除波之后插件模块清单是空数组", () => {
  const modules = pluginModules();
  assert.ok(Array.isArray(modules));
  assert.deepEqual(modules, []);
});

test("含‘插件’二字的用户可见名称会被指出并拒绝产出按键", () => {
  const invalid = module({ label: "探针插件" });
  assert.match(pluginModuleProblem(invalid) || "", /插件/);
  assert.deepEqual(
    pluginModulesForPlacement("study", "review-outline", [invalid]),
    [],
  );
});

test("placements 为空的模块不产出任何按键", () => {
  const nowhere = module({ placements: [] });
  assert.deepEqual(
    pluginModulesForPlacement("study", "review-outline", [nowhere]),
    [],
  );
});
