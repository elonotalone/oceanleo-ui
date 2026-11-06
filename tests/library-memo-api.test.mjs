import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../src/lib/library-memo-api.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/shell/library-memo/LibraryMemoPage.tsx", import.meta.url), "utf8");

test("Memo API exposes owner-scoped list, text/artifact add and delete endpoints", () => {
  assert.match(api, /\/v1\/library\/memo\/items/);
  assert.match(api, /kind: \"text\"/);
  assert.match(api, /kind: \"artifact\"/);
  assert.match(api, /DELETE/);
});

test("Memo page refreshes on focus and uploads before adding an artifact", () => {
  assert.match(page, /addEventListener\(\"focus\"/);
  assert.match(page, /privateUpload: true/);
  assert.match(page, /addLibraryMemoArtifact/);
  assert.match(page, /deleteLibraryMemoItem/);
});
