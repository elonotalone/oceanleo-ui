import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/shell/composer-draft.ts", import.meta.url), "utf8");

test("draft persistence is local to this device and has no gateway sync path", () => {
  assert.doesNotMatch(source, /getComposerDrafts|putComposerDraft|useImEvent\(\s*["']composer_draft/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /indexedDB/);
});

test("draft source does not subscribe to remote composer events", () => {
  assert.doesNotMatch(source, /useImEvent|composer_draft["']/);
  assert.doesNotMatch(source, /device_id/);
});
