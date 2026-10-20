/**
 * W5: hosted PPT dirty after opened-content identity and init records a
 * person mutation. Restore / init / unmatched identity must not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  resetUserEditSession,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

const { applyHostedDeckUserEditSession } = await import(
  await compileModule("src/shell/advanced-routes/DeckHostedRoute.tsx", {
    "../AdvancedWorkbenchShell": dataModule(
      `export function AdvancedWorkbenchShell() { return null; }`,
    ),
    "../../client-ui/host-context": dataModule(
      `export function useOptionalClientHost() { return null; }`,
    ),
  })
);

function hostedItem() {
  return { key: "artifact:hosted-deck-w5:r1", id: "hosted-deck-w5" };
}

function openedGate(overrides = {}) {
  const item = hostedItem();
  return {
    item,
    kind: "dirty",
    dirty: true,
    openedContentIdentity: "deck|open-1",
    contentIdentity: "deck|open-1",
    source: { slides: [{ id: "s1" }] },
    applyingInit: false,
    ...overrides,
  };
}

test("hosted deck dirty after init increments userMutationGeneration", () => {
  resetUserEditSession();
  const item = hostedItem();
  assert.equal(userMutationGeneration(item.key), 0);
  assert.equal(applyHostedDeckUserEditSession(openedGate()), 1);
  assert.equal(userMutationGeneration(item.key), 1);
  assert.equal(applyHostedDeckUserEditSession(openedGate()), 2);
  assert.equal(userMutationGeneration(item.key), 2);
});

test("hosted deck restore, init, and unmatched identity do not record", () => {
  resetUserEditSession();
  const item = hostedItem();
  assert.equal(
    applyHostedDeckUserEditSession(openedGate({ kind: "restore", dirty: true })),
    0,
  );
  assert.equal(applyHostedDeckUserEditSession(openedGate({ kind: "init" })), 0);
  assert.equal(applyHostedDeckUserEditSession(openedGate({ dirty: false })), 0);
  assert.equal(
    applyHostedDeckUserEditSession(openedGate({ openedContentIdentity: null })),
    0,
  );
  assert.equal(
    applyHostedDeckUserEditSession(
      openedGate({ openedContentIdentity: "other", contentIdentity: "deck|open-1" }),
    ),
    0,
  );
  assert.equal(applyHostedDeckUserEditSession(openedGate({ source: null })), 0);
  assert.equal(
    applyHostedDeckUserEditSession(openedGate({ applyingInit: true })),
    0,
  );
  assert.equal(userMutationGeneration(item.key), 0);
});
