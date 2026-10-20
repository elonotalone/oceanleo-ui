/**
 * W6: a successful local audio mutation increments the shared user-edit
 * generation. Remote apply and playlist draft restore do not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  resetUserEditSession,
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
const playlist = await import(
  await compileModule(
    "src/shell/media-editors/AudioPlaylistStage.tsx",
    lightStubs(),
  )
);

function audioItem(id) {
  return { key: `artifact:${id}:r1`, id };
}

test("audio local mutation increments userMutationGeneration", () => {
  resetUserEditSession();
  const item = audioItem("audio-w6");
  assert.equal(userMutationGeneration(item.key), 0);
  assert.equal(
    mutations.applyAudioMutationUserEditSession(item, "local-mutation"),
    1,
  );
  assert.equal(
    mutations.applyAudioUserEditSession(item, "local-mutation"),
    2,
  );
  assert.equal(userMutationGeneration(item.key), 2);
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
  assert.equal(userMutationGeneration(item.key), 1);
});

test("audio playlist trim/delete/gain records; recovery restore does not", () => {
  resetUserEditSession();
  const item = audioItem("audio-playlist-w6");
  assert.equal(
    playlist.applyAudioPlaylistUserEditSession(item, "local-mutation"),
    1,
  );
  assert.equal(
    playlist.applyAudioPlaylistUserEditSession(item, "recovery-restore"),
    1,
  );
  assert.equal(playlist.applyAudioPlaylistUserEditSession(item, "load"), 1);
  resetUserEditSession();
  assert.equal(
    playlist.applyAudioPlaylistUserEditSession(item, "recovery-restore"),
    0,
  );
  assert.equal(playlist.applyAudioPlaylistUserEditSession(item, "remote-apply"), 0);
  assert.equal(userMutationGeneration(item.key), 0);
});
