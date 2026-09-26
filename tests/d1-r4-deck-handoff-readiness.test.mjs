import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const url = await compileModule("src/shell/advanced-routes/editor-handoff.ts", {
  "../office-editor/useOfficeArtifactSource": dataModule(`export function useOfficeArtifactSource(item) { return { item, loading: false }; }`),
});
const { bindNormalFaceHandoff, captureBeforeEnterPro, resetEditorHandoffForTests } = await import(url);
const item = { id: "d1-r4-deck", key: "d1-r4-deck", title: "用户的八页稿", url: "https://files.example/source.pptx" };
const draft = { kind: "inline", revision: "r8", json: { slides: Array.from({ length: 8 }, (_, i) => ({ id: `user-${i}` })) } };
test.afterEach(() => resetEditorHandoffForTests());

test("D1 R4: early entry waits for the normal document, then hands off all eight pages", async () => {
  let placeholderReads = 0, saves = 0, settled = false;
  bindNormalFaceHandoff(item.key, {
    status: "loading",
    getHandoff() { placeholderReads++; return { kind: "inline", json: { slides: [{ id: "placeholder" }] }, revision: null }; },
    persistInBackground() { saves++; },
  });
  const capture = captureBeforeEnterPro(item, { waitForReady: true }).then(result => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(placeholderReads, 0, "a loading editor must never serialize its placeholder");
  assert.equal(saves, 0, "a loading editor must never save its placeholder");
  bindNormalFaceHandoff(item.key, { status: "ready", getHandoff: () => draft });
  assert.deepEqual(await capture, { ok: true, handoff: draft, item });
});

test("D1 R4: already loaded normal document keeps the immediate in-memory handoff", async () => {
  let saves = 0;
  bindNormalFaceHandoff(item.key, { status: "ready", getHandoff: () => draft, persistInBackground() { saves++; } });
  assert.deepEqual(await captureBeforeEnterPro(item, { waitForReady: true }), { ok: true, handoff: draft, item });
  assert.equal(saves, 1);
});

test("D1 R4: normal face mounting after entry does not fall back to an old asset URL", async () => {
  let settled = false;
  const capture = captureBeforeEnterPro(item, { waitForReady: true }).then(result => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  bindNormalFaceHandoff(item.key, { status: "ready", getHandoff: () => draft });
  assert.deepEqual(await capture, { ok: true, handoff: draft, item });
});

test("D1 R4: source failure returns immediately without retrying another representation", async () => {
  bindNormalFaceHandoff(item.key, { status: "error", getHandoff: () => ({ kind: "empty" }) });
  const result = await captureBeforeEnterPro(item, { waitForReady: true });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("D1 R4: the source wait expires and a late parse cannot resurrect that attempt", async () => {
  bindNormalFaceHandoff(item.key, { status: "loading", getHandoff: () => ({ kind: "empty" }) });
  const attempt = new AbortController();
  const capture = captureBeforeEnterPro(item, { waitForReady: true, signal: attempt.signal });
  attempt.abort();
  const result = await capture;
  assert.equal(result.ok, false);
  assert.ok(result.error);
  bindNormalFaceHandoff(item.key, { status: "ready", getHandoff: () => draft });
  assert.equal(result.ok, false);
  assert.equal((await captureBeforeEnterPro(item, { waitForReady: true })).ok, true);
});
