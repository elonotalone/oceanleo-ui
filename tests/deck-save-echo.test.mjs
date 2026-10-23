// 10-23 编辑器整改 W07：演示保存后宿主传回自己刚存的那一版，不重载；保存基线不回退。
// 实测根因见 docs/work-logs/2026-10-23-editor-overhaul/signals/W07-journal.md（fork 后第 2 次保存 409）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deckItemArtifactId,
  deckSaveBaseItem,
  isDeckOwnSaveEcho,
} from "../src/shell/doc-editors/deck-save-echo.ts";
import {
  noteOwnCommittedHead,
  resetOwnCommittedHeadsForTests,
} from "../src/shell/doc-editors/editor-own-heads.ts";

const ART = "a67bdb59-4b74-4e7d-97a4-50b4ae7926f5";

function item(extra = {}) {
  return {
    key: "k",
    source: "library",
    id: "rev-1",
    title: "deck",
    url: "https://example.invalid/v1.pptx",
    kind: "ppt",
    artifactId: ART,
    revisionId: "rev-1",
    meta: {},
    ...extra,
  };
}

test("host echo of the revision the deck just saved is not a new document", () => {
  const persisted = item({ id: "rev-2", revisionId: "rev-2" });
  const own = new Set(["rev-2"]);
  // advancedSavedItem shape: id moved to the new version, revisionId still stale.
  const echo = item({ id: "rev-2", revisionId: "rev-1", url: "https://example.invalid/v2.pptx" });
  assert.equal(isDeckOwnSaveEcho(echo, persisted, own), true);
  assert.equal(isDeckOwnSaveEcho(item({ meta: { revision_id: "rev-2" }, id: "x" }), persisted, own), true);
});

test("a different revision, another artifact, or no own saves still reloads", () => {
  const persisted = item({ id: "rev-2", revisionId: "rev-2" });
  assert.equal(isDeckOwnSaveEcho(item({ id: "rev-9", revisionId: "rev-9" }), persisted, new Set(["rev-2"])), false);
  assert.equal(
    isDeckOwnSaveEcho(item({ id: "rev-2", revisionId: "rev-2", artifactId: "other" }), persisted, new Set(["rev-2"])),
    false,
  );
  assert.equal(isDeckOwnSaveEcho(item({ id: "rev-2" }), persisted, new Set()), false);
});

test("save base moves to this tab's own newer head, never to someone else's", () => {
  resetOwnCommittedHeadsForTests();
  noteOwnCommittedHead(ART, "rev-1", "rev-2");
  noteOwnCommittedHead(ART, "rev-2", "rev-3");
  const stale = deckSaveBaseItem(item({ id: "rev-1", revisionId: "rev-1" }));
  assert.equal(stale.revisionId, "rev-3");
  assert.equal(stale.meta.revision_id, "rev-3");
  // Already the head: unchanged object.
  const head = item({ id: "rev-3", revisionId: "rev-3" });
  assert.equal(deckSaveBaseItem(head), head);
  // A revision outside this tab's chain (another collaborator's) is left for CAS to judge.
  const foreign = item({ id: "rev-7", revisionId: "rev-7" });
  assert.equal(deckSaveBaseItem(foreign), foreign);
  assert.equal(deckItemArtifactId(item({ artifactId: "", meta: { root_asset_id: "root" } })), "root");
  resetOwnCommittedHeadsForTests();
});

test("useDeckEditor keeps its load key on a save echo and commits on the own head", () => {
  const source = readFileSync(new URL("../src/shell/doc-editors/use-deck-editor.ts", import.meta.url), "utf8");
  assert.match(source, /!isDeckOwnSaveEcho\(item, persistedItemRef\.current, ownSavedRevisionsRef\.current\)/);
  assert.match(source, /const baseItem = deckSaveBaseItem\(persistedItemRef\.current\);/);
  assert.match(source, /ownSavedRevisionsRef\.current\.add\(saved\)/);
});

test("deck saves are revisions, not the hidden draft tier", () => {
  const route = readFileSync(new URL("../src/shell/advanced-routes/DeckRoute.tsx", import.meta.url), "utf8");
  const persistence = route.slice(route.indexOf("persistence: {"), route.indexOf("onClose={onClose}"));
  assert.ok(persistence.length > 0);
  assert.doesNotMatch(persistence, /\bdraft:\s*editor\.draft/);
});
