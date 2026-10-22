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
  // 源读取失败时舞台是失败面板（带重载），不是一张可编辑的空白稿。
  assert.match(route, /editor\.sourceFailed \? \(\s*<EditorSourceFailurePanel/);
  assert.match(route, /editor\.dirty && collab\.saveGate && !editor\.sourceFailed/);
});

test("native deck and rich-doc routes reject persistence until source content loaded", () => {
  const deck = read("shell/advanced-routes/DeckRoute.tsx");
  const rich = read("shell/advanced-routes/RichDocRoute.tsx");
  assert.match(deck, /ready: !editor\.loading && !editor\.sourceFailed/);
  assert.match(deck, /editor\.sourceFailed \? null : structuredClone\(editor\.deck\)/);
  assert.match(rich, /ready: Boolean\(editor\.editor\) && !editor\.loading/);
  assert.match(rich, /editor\.sourceReady \? editor\.editor\?\.getJSON\(\) \|\| null : null/);
  assert.doesNotMatch(rich, /已按空白文档打开/);
  // The hosted route files are gone; they must not come back.
  for (const gone of ["DeckHostedRoute.tsx", "RichDocHostedRoute.tsx"]) {
    assert.equal(fs.existsSync(new URL(`shell/advanced-routes/${gone}`, root)), false, gone);
  }
});

test("structured text failure is not converted into an editable blank", () => {
  const source = read("shell/AdvancedStructuredEditors.tsx");
  assert.match(source, /sourceFailed/);
  assert.match(source, /if \(sourceFailed\) return/);
  assert.doesNotMatch(source, /新建可编辑版本/);
});
