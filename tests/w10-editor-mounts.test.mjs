import assert from "node:assert/strict";
import test from "node:test";

import {
  W10_EDITOR_IDS,
  W10_EDITOR_MOUNTS,
  w10LocalHostedCapability,
  w10WorkbenchItem,
} from "../src/shell/w10-editor-mounts.ts";

test("W10 mount table covers eight cores with loaders and required props", () => {
  assert.deepEqual([...W10_EDITOR_IDS], [
    "website",
    "design-canvas",
    "video-canvas",
    "video-timeline",
    "deck",
    "umo-hosted",
    "audiomass-hosted",
    "three-editor",
  ]);
  for (const id of W10_EDITOR_IDS) {
    const row = W10_EDITOR_MOUNTS[id];
    assert.equal(row.editorId, id);
    assert.equal(typeof row.load, "function");
    assert.equal(typeof row.exportName, "string");
    assert.match(row.modulePath, /src\/shell\//);
    if (row.mountKind === "workbench") {
      assert.deepEqual([...row.requiredWorkbench], ["item", "onClose"]);
      const item = w10WorkbenchItem(id);
      assert.equal(item.key, `w10-${id}`);
      assert.equal(item.favorite, false);
      assert.equal(item.meta.editor, id);
    } else {
      assert.ok(row.requiredFrame.includes("src"));
      assert.ok(row.requiredFrame.includes("instanceId"));
      assert.ok(row.hostCapability.startsWith("local-hosted:"));
    }
  }
  assert.equal(
    w10LocalHostedCapability("slides", "http://127.0.0.1:4173"),
    "local-hosted:slides=http://127.0.0.1:4173",
  );
});
