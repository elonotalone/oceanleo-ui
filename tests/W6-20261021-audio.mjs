/**
 * W6: a successful local audio mutation increments the shared user-edit
 * generation. Remote apply does not.
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
    "../AdvancedWorkbenchShell": dataModule(
      `export function AdvancedWorkbenchShell() { return null; }`,
    ),
    ...extra,
  };
}

const mutations = await import(
  await compileModule(
    "src/shell/media-editors/use-audio-mutations.ts",
    lightStubs(),
  )
);
function audioItem(id) {
  return { key: `artifact:${id}:r1`, id };
}

test("audio local mutation increments userMutationGeneration", () => {
  resetUserEditSession();
  const item = audioItem("audio-w6");
  assert.equal(userMutationGeneration(userEditItemKey(item)), 0);
  assert.equal(
    mutations.applyAudioMutationUserEditSession(item, "local-mutation"),
    1,
  );
  assert.equal(
    mutations.applyAudioUserEditSession(item, "local-mutation"),
    2,
  );
  assert.equal(userMutationGeneration(userEditItemKey(item)), 2);
});

test("audio remote-apply does not record a person mutation", () => {
  resetUserEditSession();
  const item = audioItem("audio-w6-remote");
  assert.equal(
    mutations.applyAudioMutationUserEditSession(item, "remote-apply"),
    0,
  );
  mutations.applyAudioMutationUserEditSession(item, "local-mutation");
  assert.equal(
    mutations.applyAudioMutationUserEditSession(item, "remote-apply"),
    1,
  );
  assert.equal(userMutationGeneration(userEditItemKey(item)), 1);
});
