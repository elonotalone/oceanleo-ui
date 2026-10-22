// 后端内联的 three 运行时：代码页看不见、不计体积、保存时不由客户端携带。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildGameEnvelope,
  gameSourceByteLength,
  inspectGameDraft,
  joinGameRuntime,
  readGameEnvelope,
  splitGameRuntime,
} from "../src/shell/game-editor/game-source.ts";

const RUNTIME = `<script data-leoplay-runtime="three@r180">${"window.THREE={};".repeat(60000)}</script>\n`;
const VISIBLE =
  "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script>new THREE.Scene()</script></body></html>";
const STORED = VISIBLE.replace("<head>", `<head>${RUNTIME}`);

test("strip-on-display: the editor source and size exclude the runtime", () => {
  const read = readGameEnvelope({ source: STORED, origin: "ai" });
  assert.equal(read.ok, true);
  assert.equal(read.envelope.source, VISIBLE);
  assert.equal(read.envelope.hiddenRuntime, RUNTIME);
  assert.equal(read.envelope.sizeBytes, new TextEncoder().encode(VISIBLE).length);
  assert.equal(gameSourceByteLength(STORED), read.envelope.sizeBytes);
  const inspection = inspectGameDraft(STORED);
  assert.equal(inspection.sizeBytes, read.envelope.sizeBytes);
  assert.equal(inspection.publishable, true);
  assert.ok(STORED.length > 800_000, "fixture must be large");
});

test("2D sources and sources without a marker are untouched", () => {
  const plain = "<html><body><script>1</script></body></html>";
  assert.deepEqual(splitGameRuntime(plain), { source: plain, hiddenRuntime: "" });
});

test("preview of an unsaved draft re-attaches the runtime only while THREE is used", () => {
  const joined = joinGameRuntime(VISIBLE, RUNTIME);
  assert.equal(joined, STORED);
  assert.equal(joinGameRuntime("<html><body>2d</body></html>", RUNTIME), "<html><body>2d</body></html>");
  assert.equal(joinGameRuntime(VISIBLE, ""), VISIBLE);
});

test("save never sends a client-side runtime (backend injects exactly one)", () => {
  const envelope = buildGameEnvelope({ source: STORED, origin: "ai" });
  assert.equal(envelope.source, VISIBLE);
  assert.equal(envelope.sizeBytes, new TextEncoder().encode(VISIBLE).length);
  assert.doesNotMatch(JSON.stringify(envelope), /data-leoplay-runtime/);
});

test("GameCodeStage routes every source entry through the stripping setter", () => {
  const stage = readFileSync(new URL("../src/shell/game-editor/GameCodeStage.tsx", import.meta.url), "utf8");
  assert.match(stage, /splitGameRuntime\(next\)/);
  assert.match(stage, /joinGameRuntime\(sourceRef\.current, hiddenRuntimeRef\.current\)/);
  assert.doesNotMatch(stage, /useState\(EMPTY_DOC\);\s*\n\s*const \[source, setSource\]/);
});
