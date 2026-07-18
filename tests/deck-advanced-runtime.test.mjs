import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneDeckDocument,
  deckMasterFor,
  normalizeDeckDocument,
} from "../src/shell/doc-editors/deck-schema.ts";

test("deck transitions, object animations and masters survive save and reopen", () => {
  const source = {
    version: 2,
    title: "产品发布",
    aspect: "16:9",
    theme: "ocean",
    masters: [
      {
        id: "master-light",
        name: "亮色母版",
        background: "#f8fafc",
        textColor: "#0f172a",
        accentColor: "#2563eb",
        fontFamily: "Aptos",
      },
      {
        id: "master-dark",
        name: "深色母版",
        background: "#020617",
        textColor: "#f8fafc",
        accentColor: "#38bdf8",
        fontFamily: "Inter",
      },
    ],
    slides: [
      {
        id: "slide-1",
        title: "封面",
        layout: "title",
        masterId: "master-dark",
        transition: { type: "wipe", durationMs: 850 },
        elements: [
          {
            id: "title",
            type: "text",
            x: 10,
            y: 20,
            width: 80,
            height: 20,
            rotation: 0,
            order: 1,
            text: "OceanLeo",
            animation: { type: "fly-up", durationMs: 700, delayMs: 250 },
          },
        ],
      },
      {
        id: "slide-2",
        title: "内容",
        layout: "title-body",
        masterId: "master-light",
        transition: { type: "push-left", durationMs: 500 },
        elements: [],
      },
    ],
  };
  const normalized = normalizeDeckDocument(source);
  const reopened = normalizeDeckDocument(
    JSON.parse(JSON.stringify(cloneDeckDocument(normalized))),
  );
  assert.equal(reopened.masters.length, 2);
  assert.equal(deckMasterFor(reopened, reopened.slides[0]).id, "master-dark");
  assert.equal(reopened.slides[0].transition.type, "wipe");
  assert.equal(reopened.slides[1].transition.type, "push-left");
  assert.deepEqual(reopened.slides[0].elements[0].animation, {
    type: "fly-up",
    durationMs: 700,
    delayMs: 250,
  });
});

test("deck advanced timing is bounded and invalid master references fall back", () => {
  for (const type of ["fade", "push-left", "push-right", "wipe", "zoom"]) {
    const deck = normalizeDeckDocument({
      theme: "paper",
      masters: [{ id: "master-a", name: "A" }],
      slides: [
        {
          title: type,
          masterId: "missing",
          transition: { type, durationMs: 99_999 },
          elements: [
            {
              type: "shape",
              animation: { type: "zoom", durationMs: 1, delayMs: 99_999 },
            },
          ],
        },
      ],
    });
    assert.equal(deck.slides[0].transition.type, type);
    assert.equal(deck.slides[0].transition.durationMs, 3_000);
    assert.equal(deck.slides[0].masterId, "master-a");
    assert.equal(deck.slides[0].elements[0].animation.durationMs, 100);
    assert.equal(deck.slides[0].elements[0].animation.delayMs, 10_000);
  }
});

test("deck clone isolates master and animation mutations", () => {
  const source = normalizeDeckDocument({
    slides: [
      {
        title: "隔离",
        elements: [
          {
            type: "text",
            text: "A",
            animation: { type: "fade", durationMs: 500, delayMs: 0 },
          },
        ],
      },
    ],
  });
  const clone = cloneDeckDocument(source);
  clone.masters[0].background = "#000000";
  clone.slides[0].elements[0].animation.durationMs = 900;
  assert.notEqual(source.masters[0].background, clone.masters[0].background);
  assert.equal(source.slides[0].elements[0].animation.durationMs, 500);
});
