import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
const api = await import(await compileModule("src/shell/advanced-routes/editor-handoff.ts", {
  "../office-editor/useOfficeArtifactSource": dataModule("export function useOfficeArtifactSource() { return {}; }"),
}));

test("E7 binder: absent and clean faces never flush", async () => {
  api.resetEditorHandoffForTests();
  assert.equal(await api.saveBeforeLeavePro("missing"), true);
  let calls = 0;
  const unbind = api.bindProFaceHandoff("a", { hasUnsavedChanges: () => false, flush: async () => { calls++; return true; } });
  assert.equal(await api.saveBeforeLeavePro("a"), true);
  assert.equal(api.hasUnsavedProChanges("a"), false);
  assert.equal(calls, 0);
  unbind();
});

test("E7 binder: item isolation, failure, dirty revision protection, cleanup ownership and abort", async () => {
  api.resetEditorHandoffForTests();
  let dirty = true;
  const old = api.bindProFaceHandoff("a", { hasUnsavedChanges: () => true, flush: async () => false });
  const current = api.bindProFaceHandoff("a", { hasUnsavedChanges: () => dirty, flush: async () => true });
  old();
  assert.equal(api.hasUnsavedProChanges("a"), true);
  assert.equal(await api.saveBeforeLeavePro("a"), false, "a newer dirty revision must block leaving");
  assert.equal(await api.saveBeforeLeavePro("b"), true);
  current();
  let finish;
  const abort = new AbortController();
  const clean = api.bindProFaceHandoff("a", { hasUnsavedChanges: () => dirty, flush: () => new Promise(r => finish = r) });
  const pending = api.saveBeforeLeavePro("a", abort.signal);
  abort.abort(); dirty = false; finish(true);
  assert.equal(await pending, false);
  clean();
  const failure = api.bindProFaceHandoff("a", { hasUnsavedChanges: () => true, flush: async () => false });
  assert.equal(await api.saveBeforeLeavePro("a"), false);
  failure();
  dirty = true;
  const success = api.bindProFaceHandoff("a", { hasUnsavedChanges: () => dirty, flush: async () => { dirty = false; return true; } });
  assert.equal(await api.saveBeforeLeavePro("a"), true);
  success();
});
