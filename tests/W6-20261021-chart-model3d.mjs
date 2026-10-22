/**
 * W6: 3D local markDirty increments the shared user-edit generation.
 * 3D bootstrap does not. (The chart editor was deleted 2026-10-22.)
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  resetUserEditSession,
  userEditItemKey,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

function lightStubs(extra = {}) {
  return {
    "../../i18n/ui/useUI": dataModule(
      "const tt = (zh) => zh; export function useUI() { return tt; }",
    ),
    ...extra,
  };
}

const model3d = await import(
  await compileModule(
    "src/shell/media-editors/use-model3d-workbench.ts",
    lightStubs(),
  )
);

function itemFor(id) {
  return { key: `artifact:${id}:r1`, id };
}

test("3d local markDirty increments; bootstrap and recovery do not", () => {
  resetUserEditSession();
  const item = itemFor("model3d-w6");
  assert.equal(model3d.applyModel3dUserEditSession(item, "bootstrap"), 0);
  assert.equal(
    model3d.applyModel3dUserEditSession(item, "recovery-restore"),
    0,
  );
  assert.equal(model3d.applyModel3dUserEditSession(item, "local-dirty"), 1);
  assert.equal(model3d.applyModel3DUserEditSession(item, "local-dirty"), 2);
  assert.equal(model3d.applyModel3dUserEditSession(item, "bootstrap"), 2);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 2);
});
