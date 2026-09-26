import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseDeckIr } from "../src/shell/doc-editors/deck-ir.ts";
import { deckDocumentFromIr } from "../src/shell/doc-editors/deck-schema.ts";

const structuredDeck = {
  schema: "oceanleo.deck.v1",
  version: 1,
  title: "社区共享书屋落地手册",
  theme: { accent: "1677FF" },
  slides: [
    { layout: "title", title: "选点" },
    { layout: "bullets", title: "开放日", bullets: ["招募志愿者"] },
    { layout: "quote", title: "复盘", body: "持续运营" },
  ],
  attribution: { entries: [] },
};

test("structured deck IR keeps its slide count in the shared deck renderer model", () => {
  const project = parseDeckIr(JSON.stringify(structuredDeck));
  const deck = deckDocumentFromIr(project);
  assert.equal(project.slides.length, 3);
  assert.equal(deck.slides.length, 3);
  assert.equal(deck.slides[1].title, "开放日");
  assert.equal(deck.slides[1].bullets[0], "招募志愿者");
});

test("invalid structured bytes fail closed instead of falling through to PPTX", () => {
  assert.throws(
    () => parseDeckIr('{"schema":"oceanleo.deck.v1","version":1}'),
    /deck-v1|deck-ir-invalid|failed/i,
  );
});

test("PptViewer routes the declared structured source before the PPTX fetch", async () => {
  const source = await readFile(
    new URL("../src/shell/library-viewers.tsx", import.meta.url),
    "utf8",
  );
  const structuredBranch = source.indexOf("if (structuredSourceUrl)");
  const pptxFetch = source.indexOf("fetchValidatedOfficePackage(");
  assert.notEqual(structuredBranch, -1);
  assert.notEqual(pptxFetch, -1);
  assert.ok(
    structuredBranch < pptxFetch,
    "structured decks must not be passed to the PPTX package validator",
  );
  assert.match(source, /deckStructuredSourceUrl\(item\)/);
  assert.match(source, /parseDeckIr\(/);
  assert.match(source, /deckDocumentFromIr\(/);
});
