import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cloneMaterialForWorkbench,
  getWorkbenchMaterialSnapshot,
  materialScopeKey,
  registerWorkbenchMaterialSource,
  subscribeWorkbenchMaterials,
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

test("equivalent material registration preserves snapshot identity and stays quiet", () => {
  const scope = materialScopeKey("image", "poster");
  const source = Symbol("poster-materials");
  let notifications = 0;
  const unsubscribe = subscribeWorkbenchMaterials(scope, () => {
    notifications += 1;
  });
  const unregisterFirst = registerWorkbenchMaterialSource(
    scope,
    source,
    [entry("hero", "Hero")],
  );
  const firstSnapshot = getWorkbenchMaterialSnapshot(scope);
  assert.equal(notifications, 1);

  const unregisterEquivalent = registerWorkbenchMaterialSource(
    scope,
    source,
    [entry("hero", "Hero")],
  );
  assert.equal(getWorkbenchMaterialSnapshot(scope), firstSnapshot);
  assert.equal(notifications, 1);

  unregisterEquivalent();
  unregisterFirst();
  unsubscribe();
});

test("ResultCanvas owns entries without subscribing to its own entry snapshot", () => {
  const source = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const EMPTY_MATERIALS: MaterialItem\[\] = \[\]/);
  assert.match(source, /materials = EMPTY_MATERIALS/);
  assert.match(source, /useWorkbenchMaterialActions/);
  assert.doesNotMatch(source, /useWorkbenchMaterialScope/);
});
