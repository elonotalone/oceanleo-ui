import assert from "node:assert/strict";
import test from "node:test";

import {
  W10_EDITOR_IDS,
  W10_EDITOR_MOUNTS,
  w10WorkbenchItem,
} from "../src/shell/w10-editor-mounts.ts";

test("mount table lists only native workbench routes (no hosted-frame mounts)", () => {
  assert.deepEqual([...W10_EDITOR_IDS], [
    "website",
    "video-canvas",
    "video-timeline",
  ]);
  for (const id of W10_EDITOR_IDS) {
    const row = W10_EDITOR_MOUNTS[id];
    assert.equal(row.editorId, id);
    assert.equal(typeof row.load, "function");
    assert.equal(typeof row.exportName, "string");
    assert.match(row.modulePath, /src\/shell\/advanced-routes\//);
    assert.equal(row.mountKind, "workbench");
    assert.deepEqual([...row.requiredWorkbench], ["item", "onClose"]);
    const item = w10WorkbenchItem(id);
    assert.equal(item.key, `w10-${id}`);
    assert.equal(item.favorite, false);
    assert.equal(item.meta.editor, id);
  }
});

test("hosted editors have no mount rows and no local-hosted capability helper", async () => {
  for (const removed of ["deck", "umo-hosted", "audiomass-hosted", "three-editor", "design-canvas"]) {
    assert.equal(removed in W10_EDITOR_MOUNTS, false, removed);
  }
  const mod = await import("../src/shell/w10-editor-mounts.ts");
  assert.equal("w10LocalHostedCapability" in mod, false);
});
