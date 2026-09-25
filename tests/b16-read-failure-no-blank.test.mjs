import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../src/", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("expired office links include 410 in the refresh trigger", () => {
  const source = read("shell/doc-editors/office-file.ts");
  assert.match(source, /401\|403\|410/);
});

test("deck source failure cannot be described or handed off as a blank draft", () => {
  const editor = read("shell/doc-editors/use-deck-editor.ts");
  const route = read("shell/advanced-routes/DeckRoute.tsx");
  assert.doesNotMatch(editor, /现在停在一份空白稿上/);
  assert.match(editor, /sourceFailedRef\.current/);
  assert.match(route, /editor\.sourceFailed/);
  assert.match(route, /kind: "empty"/);
  assert.match(route, /editor\.dirty && !editor\.sourceFailed/);
});

test("hosted editors reject persistence until source content loaded", () => {
  const deck = read("shell/advanced-routes/DeckHostedRoute.tsx");
  const rich = read("shell/advanced-routes/RichDocHostedRoute.tsx");
  assert.match(deck, /if \(!sourceReady\)/);
  assert.match(deck, /ready: ready && sourceReady/);
  assert.match(deck, /src && source != null/);
  assert.match(rich, /if \(!source\)/);
  assert.match(rich, /ready: ready && source != null/);
  assert.doesNotMatch(rich, /已按空白文档打开/);
});

test("structured text failure is not converted into an editable blank", () => {
  const source = read("shell/AdvancedStructuredEditors.tsx");
  assert.match(source, /sourceFailed/);
  assert.match(source, /if \(sourceFailed\) return/);
  assert.doesNotMatch(source, /新建可编辑版本/);
});
