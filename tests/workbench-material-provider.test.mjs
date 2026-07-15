import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneMaterialForWorkbench,
  getWorkbenchMaterialSnapshot,
  materialScopeKey,
  registerWorkbenchMaterialSource,
} from "../src/shell/workbench-material-registry.ts";

function entry(id, title) {
  return {
    id,
    title,
    libraryItem: {
      key: id,
      source: "artifact",
      id,
      title,
      kind: "image",
      siteId: "design",
      url: `https://asset.test/${id}.png`,
      favorite: false,
      meta: { tags: ["source"] },
    },
  };
}

test("material runtime is scoped only by siteId/appId and merges live sources", () => {
  const scope = materialScopeKey("design", "poster");
  const first = Symbol("goal-app");
  const second = Symbol("platform-library");
  const unregisterFirst = registerWorkbenchMaterialSource(
    scope,
    first,
    [entry("hero", "Hero")],
  );
  const unregisterSecond = registerWorkbenchMaterialSource(
    scope,
    second,
    [entry("hero", "Duplicate"), entry("logo", "Logo")],
  );

  assert.deepEqual(
    getWorkbenchMaterialSnapshot(scope).map((item) => item.id),
    ["hero", "logo"],
  );
  assert.deepEqual(getWorkbenchMaterialSnapshot(materialScopeKey("design", "deck")), []);

  unregisterSecond();
  unregisterFirst();
  assert.deepEqual(getWorkbenchMaterialSnapshot(scope), []);
});

test("typed insert/replace receives a copy and never mutates the library source", () => {
  const source = entry("chart", "Chart").libraryItem;
  const copy = cloneMaterialForWorkbench(source);
  copy.title = "Edited copy";
  copy.meta.tags.push("editor-only");

  assert.notEqual(copy, source);
  assert.notEqual(copy.meta, source.meta);
  assert.deepEqual(source.meta.tags, ["source"]);
  assert.equal(source.title, "Chart");
});
