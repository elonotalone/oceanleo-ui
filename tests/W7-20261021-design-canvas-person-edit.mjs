/**
 * W7: design-canvas commit / person undo / redo increment the shared
 * user-edit generation. Load that zeros revision must not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  resetUserEditSession,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

const { applyDesignCanvasUserEditSession } = await import(
  await compileModule("src/shell/design-canvas/use-local-design-canvas.ts", {
    "../../lib/media-proxy": dataModule(
      `export async function fetchMediaBlob() { throw new Error("W7 design canvas test does not fetch"); }`,
    ),
  })
);

function canvasItem() {
  return { key: "artifact:design-canvas-w7:r1", id: "design-canvas-w7" };
}

test("design canvas commit, undo, and redo increment userMutationGeneration", () => {
  resetUserEditSession();
  const item = canvasItem();
  assert.equal(userMutationGeneration(item.key), 0);
  assert.equal(applyDesignCanvasUserEditSession(item, "commit"), 1);
  assert.equal(userMutationGeneration(item.key), 1);
  assert.equal(applyDesignCanvasUserEditSession(item, "undo"), 2);
  assert.equal(applyDesignCanvasUserEditSession(item, "redo"), 3);
  assert.equal(userMutationGeneration(item.key), 3);
  assert.equal(userMutationGeneration("artifact:other:r1"), 0);
});

test("design canvas load does not record a person mutation", () => {
  resetUserEditSession();
  const item = canvasItem();
  assert.equal(applyDesignCanvasUserEditSession(item, "load"), 0);
  assert.equal(userMutationGeneration(item.key), 0);
  applyDesignCanvasUserEditSession(item, "commit");
  assert.equal(applyDesignCanvasUserEditSession(item, "load"), 1);
  assert.equal(userMutationGeneration(item.key), 1);
});
