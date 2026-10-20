/**
 * W7: hosted embed dirty after the core is open and handshake-ready
 * records a person mutation. Init, handshake echo, and restore must not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  resetUserEditSession,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

const { applyEmbeddedUserEditSession, embeddedUserEditKind } = await import(
  await compileModule("src/shell/advanced-routes/EmbeddedRoute.tsx", {
    "../AdvancedWorkbenchShell": dataModule(
      `export function AdvancedWorkbenchShell() { return null; }`,
    ),
    "../../i18n/ui/useUI": dataModule(
      `export function useUI() { return (zh) => zh; }`,
    ),
  })
);

function embeddedItem() {
  return { key: "artifact:embedded-w7:r1", id: "embedded-w7" };
}

function personDirty(overrides = {}) {
  return {
    item: embeddedItem(),
    dirty: true,
    hostedOpen: true,
    handshakeReady: true,
    restoring: false,
    initEcho: false,
    ...overrides,
  };
}

test("embedded person dirty after open and handshake increments userMutationGeneration", () => {
  resetUserEditSession();
  const item = embeddedItem();
  assert.equal(embeddedUserEditKind(personDirty()), "person-dirty");
  assert.equal(userMutationGeneration(item.key), 0);
  assert.equal(applyEmbeddedUserEditSession(personDirty()), 1);
  assert.equal(userMutationGeneration(item.key), 1);
  assert.equal(applyEmbeddedUserEditSession(personDirty()), 2);
  assert.equal(userMutationGeneration(item.key), 2);
});

test("embedded init, handshake, restore, and clean do not record", () => {
  resetUserEditSession();
  const item = embeddedItem();
  assert.equal(
    applyEmbeddedUserEditSession(personDirty({ initEcho: true })),
    0,
  );
  assert.equal(
    applyEmbeddedUserEditSession(personDirty({ handshakeReady: false })),
    0,
  );
  assert.equal(
    applyEmbeddedUserEditSession(personDirty({ hostedOpen: false })),
    0,
  );
  assert.equal(
    applyEmbeddedUserEditSession(personDirty({ restoring: true })),
    0,
  );
  assert.equal(
    applyEmbeddedUserEditSession(personDirty({ dirty: false })),
    0,
  );
  assert.equal(
    applyEmbeddedUserEditSession({
      item,
      kind: "restore",
      dirty: true,
      hostedOpen: true,
      handshakeReady: true,
    }),
    0,
  );
  assert.equal(
    applyEmbeddedUserEditSession({
      item,
      kind: "handshake",
      dirty: true,
      hostedOpen: true,
      handshakeReady: false,
    }),
    0,
  );
  assert.equal(userMutationGeneration(item.key), 0);
  applyEmbeddedUserEditSession(personDirty());
  assert.equal(
    applyEmbeddedUserEditSession(personDirty({ restoring: true })),
    1,
  );
  assert.equal(
    applyEmbeddedUserEditSession(personDirty({ initEcho: true })),
    1,
  );
  assert.equal(userMutationGeneration(item.key), 1);
});
