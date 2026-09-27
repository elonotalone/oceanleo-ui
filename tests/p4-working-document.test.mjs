/**
 * P4: PPT / 文档 / 表格共用一份工作文档。切面不因保存失败锁人。
 *
 *   node --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     --test --test-timeout=180000 tests/p4-working-document.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DECK_DRAFT_SCHEMA,
  deckDocumentFromWorkingDraft,
  loadDeckServerDraft,
} from "../src/shell/advanced-draft-deck.ts";
import { deckDocumentToPptist } from "../src/shell/doc-editors/deck-pptist-carrier.ts";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import { mountRoute } from "./e9-richdoc-harness.mjs";

const RICHDOC_DRAFT_SCHEMA = "oceanleo.richdoc.edit.v1";
const GRID_DRAFT_SCHEMA = "oceanleo.grid.univer.v1";

function source(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

function sampleDeck() {
  return normalizeDeckDocument({
    version: 2,
    title: "同一份稿",
    slides: [
      {
        id: "s1",
        title: "封面",
        body: "专业面刚写下的正文",
        bullets: [],
        elements: [
          {
            id: "t1",
            type: "text",
            x: 10,
            y: 20,
            width: 50,
            height: 10,
            rotation: 0,
            order: 0,
            text: "专业面刚写下的正文",
          },
        ],
      },
    ],
  });
}

test("P4: owned routes share one working-document schema and drop .pro.v1 destinations", () => {
  const deckHosted = source("../src/shell/advanced-routes/DeckHostedRoute.tsx");
  const deckDraft = source("../src/shell/advanced-draft-deck.ts");
  const richHosted = source("../src/shell/advanced-routes/RichDocHostedRoute.tsx");
  const richNormal = source("../src/shell/advanced-routes/RichDocRoute.tsx");
  const grid = source("../src/shell/doc-editors/GridUniverStage.tsx");
  assert.match(deckDraft, new RegExp(DECK_DRAFT_SCHEMA.replace(/\./g, "\\.")));
  assert.match(deckHosted, /DECK_DRAFT_SCHEMA/);
  assert.doesNotMatch(deckHosted, /oceanleo\.deck\.pro\.v1/);
  assert.match(richHosted, new RegExp(RICHDOC_DRAFT_SCHEMA.replace(/\./g, "\\.")));
  assert.match(richNormal, new RegExp(RICHDOC_DRAFT_SCHEMA.replace(/\./g, "\\.")));
  assert.doesNotMatch(richHosted, /oceanleo\.richdoc\.pro\.v1/);
  assert.match(grid, new RegExp(GRID_DRAFT_SCHEMA.replace(/\./g, "\\.")));
  assert.equal((grid.match(/draftSchema:/g) || []).length, 1);
});

test("P4: applyMode in owned faces never waits on saveBeforeLeavePro", () => {
  for (const rel of [
    "../src/shell/advanced-routes/DeckHostedRoute.tsx",
    "../src/shell/advanced-routes/DeckRoute.tsx",
    "../src/shell/advanced-routes/RichDocHostedRoute.tsx",
    "../src/shell/advanced-routes/RichDocRoute.tsx",
    "../src/shell/doc-editors/GridUniverStage.tsx",
  ]) {
    const text = source(rel);
    assert.doesNotMatch(text, /saveBeforeLeavePro/);
    const start = text.indexOf("const applyMode = useCallback");
    if (start >= 0) {
      const slice = text.slice(start, start + 500);
      assert.doesNotMatch(slice, /await /);
      assert.doesNotMatch(slice, /flush\(/);
    }
  }
});

test("P4: working draft restore accepts envelope, PPTist, and deck IR as one document", () => {
  const deck = sampleDeck();
  const fromIr = deckDocumentFromWorkingDraft(deck, "同一份稿");
  assert.equal(fromIr?.slides[0].elements[0].text, "专业面刚写下的正文");
  const fromEnvelope = deckDocumentFromWorkingDraft({ deck, draft: null }, "同一份稿");
  assert.equal(fromEnvelope?.slides[0].id, "s1");
  const pptist = deckDocumentToPptist(deck);
  const fromPro = deckDocumentFromWorkingDraft(pptist, "同一份稿");
  assert.match(fromPro?.slides[0].elements[0].text || "", /专业面刚写下的正文/);
  assert.equal(deckDocumentFromWorkingDraft({ title: "no slides" }, "x"), null);
});

test("P4: server draft loader reads a PPTist working document under the shared schema", async () => {
  const deck = sampleDeck();
  const pointer = {
    rootId: "root-1",
    baseRevisionId: "base-1",
    url: "https://files.example/draft.json",
    schema: DECK_DRAFT_SCHEMA,
    editRevision: 4,
    savedAt: "2026-09-27T00:00:00Z",
  };
  const item = {
    id: "base-1",
    key: "ppt-root",
    title: "同一份稿",
    meta: { parent_asset_id: "root-1", advanced_server_draft: pointer },
  };
  const loaded = await loadDeckServerDraft(item, undefined, async () =>
    new Response(
      JSON.stringify({
        ...pointer,
        version: 1,
        data: deckDocumentToPptist(deck),
      }),
    ),
  );
  assert.equal(loaded.serverDraft.schema, DECK_DRAFT_SCHEMA);
  assert.match(loaded.deck.slides[0].elements[0].text, /专业面刚写下的正文/);
  assert.equal(loaded.draft, null);
});

test("P4: RichDoc pro face uses the same schema and applyMode still switches when flush would fail", async () => {
  const host = mountRoute(async () => ({ ok: false, error: "save failed" }));
  try {
    host.message({ type: "ready" });
    host.message({ type: "dirty", dirty: true, revision: 1 });
    const capture = host.posted.findLast((message) => message.type === "recovery-capture");
    host.message({
      type: "recovery-snapshot",
      ok: true,
      recoveryId: capture.recoveryId,
      snapshot: { revision: 1, payload: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "同一份稿" }] }] } },
    });
    const adapter = host.render();
    assert.equal(adapter.persistence.draft.schema, RICHDOC_DRAFT_SCHEMA);
    assert.equal(adapter.persistence.recovery.draftSchema, RICHDOC_DRAFT_SCHEMA);
    const failed = await adapter.persistence.flush();
    assert.equal(failed.ok, false);
    adapter.mode.setMode("pro");
    assert.equal(host.render().mode.current, "pro");
    adapter.mode.setMode("normal");
    assert.equal(host.render().mode.current, "normal");
  } finally {
    host.unmount();
  }
});
