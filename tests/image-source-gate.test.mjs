import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The hook cannot run in Node (Fabric needs a canvas); the behaviour is proven by the built-editor
// Chromium test in oceanleo-app (built-native-image-kinds). This pins the gate's place and shape.
const hook = readFileSync(new URL("../src/shell/image-editor/use-fabric-image-editor.ts", import.meta.url), "utf8");

test("a work that names a picture URL but has no source path fails visibly before sourceReady", () => {
  const gate = hook.indexOf("!projectLoaded && !sourceUrl && (item.previewUrl || item.thumbUrl || item.url)");
  const read = hook.indexOf("if (!projectLoaded && sourceUrl) {");
  const ready = hook.indexOf("sourceReadyRef.current = true;", read);
  assert.ok(gate > 0 && read > gate && ready > read, "gate sits after the structured-source gate, before the raster read and before sourceReady");
  const block = hook.slice(gate, read);
  assert.match(block, /setError\(/);
  assert.match(block, /return;/);
  assert.doesNotMatch(block, /sourceReadyRef\.current = true|setSourceReady\(true\)|setInitialBackground/);
});

test("an explicit blank creation item (no URL) is not caught by the gate", () => {
  assert.match(hook, /!sourceUrl && \(item\.previewUrl \|\| item\.thumbUrl \|\| item\.url\)/);
});
