import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import {
  editorCapabilityFor, editorRouteFor, editBarOwnershipForItem, TRUSTED_EDITOR_REGISTRY,
} from "../src/shell/workbench-routes.ts";
import { ADVANCED_EDITOR_ADAPTER_IDS, advancedCapabilityForFeatureId } from "../src/shell/artifact-contract.ts";
import { ADVANCED_FEATURES, advancedFeatureForItem } from "../src/shell/advanced-features.ts";
import { CLIENT_EDITOR_ADAPTERS } from "../src/client-editor-adapters/registry.ts";
import { collabEditorKindForAdapter } from "../src/shell/collab/collab-editor-kinds.ts";

const editorIds = ["audio", "deck", "grid", "image", "pdf", "richdoc", "threed", "video-canvas", "video-timeline"];
const item = (type, patch = {}) => ({
  key: type, id: type, title: type, kind: type, siteId: "oceanleo", source: "artifact", meta: {}, ...patch,
});
function durable(type, patch = {}) {
  return item(type, {
    artifactId: "artifact", revisionId: "revision", artifactType: type,
    artifact: { artifactId: "artifact", revisionId: "revision", artifactType: type,
      access: { canRead: true, canEdit: false, canFork: false }, integrity: { ok: true },
      editability: "view_only", renditions: {}, ...patch },
  });
}

test("nine full editors share the registry, adapter IDs, picker and client inventory", () => {
  assert.deepEqual(Object.keys(TRUSTED_EDITOR_REGISTRY).sort(), editorIds);
  assert.deepEqual([...ADVANCED_EDITOR_ADAPTER_IDS].sort(), editorIds);
  assert.deepEqual(CLIENT_EDITOR_ADAPTERS.map(({ editorId }) => editorId).sort(), editorIds);
  assert.equal(ADVANCED_FEATURES.length, 9);
  assert.ok(ADVANCED_FEATURES.every(({ capability }) => capability.adapter !== "work"));
});

for (const [type, storedId] of [["website", "website_finetuning"], ["game", "game_editing"]]) {
  test(`${type}: stored identity and view-only revisions open work without editor source gates`, () => {
    assert.equal(advancedCapabilityForFeatureId(storedId).adapter, "work");
    for (const value of [item(type), item("file", { meta: { feature_id: storedId } }), durable(type)]) {
      assert.deepEqual(editorRouteFor(value), { type: "work" });
      assert.equal(editorCapabilityFor(value).adapter, "none");
      assert.equal(editBarOwnershipForItem(value), "none");
      assert.equal(advancedFeatureForItem(value)?.id, storedId);
    }
    assert.deepEqual(editorRouteFor(durable(type, { access: { canRead: false } })), { type: "none" });
    assert.deepEqual(editorRouteFor(durable(type, { integrity: { ok: false } })), { type: "none" });
    assert.equal(collabEditorKindForAdapter(type), null);
  });
}

test("workflow artifacts still use the video canvas after merging image/design adapters", () => {
  const flow = durable("workflow", {
    access: { canRead: true, canEdit: true }, editability: "native",
    sourceFormat: "oceanleo.design-document.v1", editorCapability: "design-canvas",
    renditions: { source: { revisionId: "revision", url: "https://files.test/workflow.json", digest: "digest" } },
  });
  assert.deepEqual(editorRouteFor(flow), { type: "video-canvas" });
});

test("source modules never import the removed game editor", () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [join(dir, entry.name)] : []);
  const violations = walk("src").filter((path) => /(?:from\s*["']|import\s*\(["'])[^"']*game-editor\//.test(readFileSync(path, "utf8")));
  assert.deepEqual(violations, []);
});
