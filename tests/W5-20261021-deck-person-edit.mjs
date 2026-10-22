/**
 * W5: native deck history writes increment the shared user-edit generation.
 * Remote collab merge and load go through the same helper and must not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  cloneDeckDocument,
  normalizeDeckDocument,
} from "../src/shell/doc-editors/deck-schema.ts";
import {
  resetUserEditSession,
  userEditItemKey,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

const { applyDeckHistoryWriteIfChanged, applyDeckUserEditSession } = await import(
  await compileModule("src/shell/doc-editors/use-deck-editor.ts", {
    "../../i18n/ui/useUI": dataModule(
      "const tt = (zh) => zh; export function useUI() { return tt; }",
    ),
  })
);

function deckItem() {
  return { key: "artifact:deck-w5:r1", id: "deck-w5" };
}

function sampleDeck(title = "W5 deck") {
  return normalizeDeckDocument(
    {
      title,
      slides: [{ title: "一页", body: "hello", bullets: [] }],
    },
    title,
  );
}

test("native deck local history write increments userMutationGeneration", () => {
  resetUserEditSession();
  const item = deckItem();
  const before = sampleDeck();
  const after = cloneDeckDocument(before);
  after.slides[0].title = "改过的一页";
  assert.equal(userMutationGeneration(userEditItemKey(item)), 0);
  assert.equal(applyDeckHistoryWriteIfChanged(item, before, after), 1);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 1);
  assert.equal(applyDeckUserEditSession(item, "local-history"), 2);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 2);
});

test("native deck equal documents do not record a person mutation", () => {
  resetUserEditSession();
  const item = deckItem();
  const before = sampleDeck();
  const after = cloneDeckDocument(before);
  assert.equal(applyDeckHistoryWriteIfChanged(item, before, after), 0);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 0);
});

test("native deck load and remote collab do not record a person mutation", () => {
  resetUserEditSession();
  const item = deckItem();
  assert.equal(applyDeckUserEditSession(item, "load"), 0);
  assert.equal(applyDeckUserEditSession(item, "remote-collab"), 0);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 0);
  applyDeckUserEditSession(item, "local-history");
  assert.equal(applyDeckUserEditSession(item, "remote-collab"), 1);
  assert.equal(applyDeckUserEditSession(item, "load"), 1);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 1);
});
