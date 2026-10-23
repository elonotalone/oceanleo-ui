// 2026-10-23 editor overhaul W08 R2: a server draft of the native document editor is restored
// as-is. Running it through the Umo reverse conversion stripped paragraph typography
// (line height, first-line indent, spacing), numbering presets and image wrap on every reopen.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { richDocDraftForRestore } from "../src/shell/doc-editors/rich-doc-draft-restore.ts";
import { UMO_DOC_FORMAT } from "../src/shell/doc-editors/rich-doc-umo-migration.ts";

const nativeDraft = {
  type: "doc",
  content: [
    { type: "paragraph", attrs: { textAlign: "center", lineHeight: "2", firstLineChars: 2, spaceBefore: 6 },
      content: [{ type: "text", text: "行距二", marks: [{ type: "bold" }] }] },
    { type: "orderedList", attrs: { start: 1, numbering: "chinese" },
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "一" }] }] }] },
    { type: "image", attrs: { src: "https://x.test/a.png", wrap: "square" } },
  ],
};

test("native drafts keep line height, indents, numbering preset and image wrap", () => {
  const restored = richDocDraftForRestore(structuredClone(nativeDraft));
  assert.deepEqual(restored, nativeDraft);
});

test("legacy Umo drafts are still converted back", () => {
  const legacy = { format: UMO_DOC_FORMAT, title: "t", content: { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "旧" }] },
  ] } };
  const restored = richDocDraftForRestore(legacy);
  assert.equal(restored.type, "doc");
  assert.equal(restored.content[0].content[0].text, "旧");
});

test("RichDocRoute restores working documents through the native-first helper", () => {
  const route = readFileSync(new URL("../src/shell/advanced-routes/RichDocRoute.tsx", import.meta.url), "utf8");
  assert.match(route, /editor\.restoreRecovery\(richDocDraftForRestore\(payload\)\)/);
  assert.doesNotMatch(route, /convertUmoToRichDoc\(/);
});
