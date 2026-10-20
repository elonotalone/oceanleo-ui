/**
 * W7: game local typing records a person mutation. Remote Yjs, agent
 * writeThrough, restore, and un-evented load pull must not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  resetUserEditSession,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

const { applyGameUserEditSession, GAME_EXTERNAL_ORIGIN } = await import(
  await compileModule("src/shell/game-editor/GameCodeStage.tsx", {
    "../AdvancedWorkbenchShell": dataModule(
      `export function AdvancedWorkbenchShell() { return null; }`,
    ),
    "../../i18n/ui/useUI": dataModule(
      `export function useUI() { return (zh) => zh; }`,
    ),
  })
);

function gameItem() {
  return { key: "artifact:game-w7:r1", id: "game-w7" };
}

test("game local textarea typing increments userMutationGeneration", () => {
  resetUserEditSession();
  const item = gameItem();
  assert.equal(userMutationGeneration(item.key), 0);
  assert.equal(applyGameUserEditSession(item, { kind: "local-type" }), 1);
  assert.equal(userMutationGeneration(item.key), 1);
  assert.equal(applyGameUserEditSession(item, { kind: "local-type" }), 2);
  assert.equal(userMutationGeneration(item.key), 2);
});

test("game ytext observe records only the bind-textarea local origin", () => {
  resetUserEditSession();
  const item = gameItem();
  const localOrigin = Symbol("oceanleo-collab-textarea-local");
  assert.equal(
    applyGameUserEditSession(item, {
      kind: "ytext-observe",
      origin: localOrigin,
    }),
    1,
  );
  assert.equal(userMutationGeneration(item.key), 1);
  assert.equal(
    applyGameUserEditSession(item, {
      kind: "ytext-observe",
      origin: GAME_EXTERNAL_ORIGIN,
    }),
    1,
  );
  assert.equal(
    applyGameUserEditSession(item, {
      kind: "ytext-observe",
      origin: undefined,
    }),
    1,
  );
  assert.equal(
    applyGameUserEditSession(item, {
      kind: "ytext-observe",
      origin: { remote: true },
    }),
    1,
  );
  assert.equal(userMutationGeneration(item.key), 1);
});

test("game writeThrough, restore, and load pull do not record", () => {
  resetUserEditSession();
  const item = gameItem();
  assert.equal(
    applyGameUserEditSession(item, { kind: "write-through" }),
    0,
  );
  assert.equal(applyGameUserEditSession(item, { kind: "restore" }), 0);
  assert.equal(applyGameUserEditSession(item, { kind: "load" }), 0);
  assert.equal(userMutationGeneration(item.key), 0);
  applyGameUserEditSession(item, { kind: "local-type" });
  assert.equal(
    applyGameUserEditSession(item, { kind: "write-through" }),
    1,
  );
  assert.equal(applyGameUserEditSession(item, { kind: "restore" }), 1);
  assert.equal(applyGameUserEditSession(item, { kind: "load" }), 1);
  assert.equal(userMutationGeneration(item.key), 1);
});
