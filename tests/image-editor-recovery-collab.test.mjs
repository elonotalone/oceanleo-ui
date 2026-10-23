// W09 (2026-10-23 R2): reopening an image must not mark it unsaved or pause autosave.
// [实测] Before: the collab room's last-session copy differed only by control-handle
// styling and an expired rendition signature, so every reopen applied it as "someone
// else's change" (dirty, revision++), and a local recovery record left behind by the
// save → close race was restored on top, racing the room and ending in
// "最新服务器草稿暂时无法恢复，自动保存已暂停" with the red cloud.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const delta = await import("../src/shell/image-editor/image-remote-delta.ts");

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function snapshot(objects, extra = {}) {
  return {
    json: { version: "6", objects },
    doc: { width: 800, height: 600 },
    canvasBackground: "#ffffff",
    ...extra,
  };
}

const dependency = (url, digest = "sha256:aa") => ({
  id: "dep-1",
  kind: "image",
  required: true,
  url,
  digest,
  revisionId: url.includes("old") ? "rev-1" : "rev-2",
  expiresAt: url.includes("old") ? "2026-10-23T08:24:05Z" : "2026-10-23T09:24:05Z",
});

test("collab comparison ignores handle styling and rendition signatures, not content", () => {
  const local = snapshot([
    { oceanleoId: "base", type: "Image", flipX: true, hasControls: false, hoverCursor: "default", oceanleoDependency: dependency("https://x/new") },
  ]);
  const room = snapshot([
    { oceanleoId: "base", type: "Image", flipX: true, hasControls: true, hoverCursor: "move", oceanleoDependency: dependency("https://x/old") },
  ]);
  assert.equal(delta.sameImageContent(local, room), true);
  const flipped = snapshot([{ ...room.json.objects[0], flipX: false }]);
  assert.equal(delta.sameImageContent(local, flipped), false);
  const otherBytes = snapshot([{ ...room.json.objects[0], oceanleoDependency: dependency("https://x/old", "sha256:bb") }]);
  assert.equal(delta.sameImageContent(local, otherBytes), false);
  assert.equal(delta.sameImageContent(local, snapshot(local.json.objects, { canvasBackground: "#000000" })), false);
});

test("crop frames exist only on this device and never count as content", () => {
  const plain = snapshot([{ oceanleoId: "a", type: "Rect", fill: "#f00" }]);
  const cropping = snapshot([...plain.json.objects, { oceanleoId: "crop", oceanleoRole: "crop", type: "Rect" }]);
  assert.equal(delta.sameImageContent(plain, cropping), true);
});

test("a remote object with the same bytes keeps this device's unexpired signature", () => {
  const fresh = dependency("https://x/new");
  const stale = dependency("https://x/old");
  assert.deepEqual(delta.keepFresherDependency(fresh, stale), { ...stale, ...fresh });
  const other = dependency("https://x/old", "sha256:bb");
  assert.equal(delta.keepFresherDependency(fresh, other), other);
  assert.equal(delta.keepFresherDependency(undefined, stale), stale);
});

test("remote delta summary names objects and fields, never values", () => {
  const before = snapshot([{ oceanleoId: "abcdefgh12", type: "Image", flipX: false, src: "https://secret/one" }]);
  const remote = snapshot([{ oceanleoId: "abcdefgh12", type: "Image", flipX: true, src: "https://secret/two" }]);
  const summary = delta.remoteDeltaSummary(before, remote, { changed: new Set(["abcdefgh12"]), removed: new Set() }, false);
  assert.equal(summary, "abcdefgh:flipX,src");
  assert.doesNotMatch(summary, /secret/);
});

test("remote apply diffs content only; recovery restore skips what is already on the canvas", () => {
  const core = source("../src/shell/image-editor/fabric-controller-core.ts");
  assert.match(core, /imageChangedObjects\(collabComparableSnapshot\(before\), collabComparableSnapshot\(remote\)\)/);
  assert.match(core, /keepFresherDependency\(/);
  const hook = source("../src/shell/image-editor/use-fabric-image-editor.ts");
  assert.match(hook, /sameImageContent\(project\.snapshot, controller\.getSnapshot\(\)\)\) return "unchanged"/);
  assert.match(hook, /updatedAt <= cloudSavedAtRef\.current\s*\) return "stale"/);
  // A collaborator's change landing mid-restore is not a new local gesture.
  assert.match(hook, /localEditsRef\.current !== startingEdits/);
  assert.doesNotMatch(hook, /revisionRef\.current !== startingRevision/);
  const route = source("../src/shell/advanced-routes/ImageRoute.tsx");
  assert.match(route, /result === "unchanged"[\s\S]{0,200}deleteAdvancedRecovery\(/);
  assert.match(route, /result === "unchanged" \|\| result === "stale" \? true : result/);
  const stage = source("../src/shell/image-editor/FabricImageStage.tsx");
  for (const attribute of ["data-editor-dirty", "data-editor-revision", "data-editor-remote-delta"]) {
    assert.match(stage, new RegExp(attribute));
  }
});
