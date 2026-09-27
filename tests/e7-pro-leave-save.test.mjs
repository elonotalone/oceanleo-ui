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
  await Promise.resolve();
  assert.equal(calls, 0);
  unbind();
});

test("E7 binder: leave-pro always returns true and only kicks the current flush", async () => {
  api.resetEditorHandoffForTests();
  let aCalls = 0;
  let bCalls = 0;
  const stale = api.bindProFaceHandoff("a", {
    hasUnsavedChanges: () => true,
    flush: async () => {
      aCalls += 1;
      return false;
    },
  });
  const current = api.bindProFaceHandoff("a", {
    hasUnsavedChanges: () => true,
    flush: async () => {
      aCalls += 1;
      return false;
    },
  });
  stale();
  assert.equal(api.hasUnsavedProChanges("a"), true);
  assert.equal(await api.saveBeforeLeavePro("a"), true, "failed flush must not lock leave");
  await Promise.resolve();
  assert.equal(aCalls, 1, "only the current binder is kicked");
  const other = api.bindProFaceHandoff("b", {
    hasUnsavedChanges: () => true,
    flush: async () => {
      bCalls += 1;
      return true;
    },
  });
  assert.equal(await api.saveBeforeLeavePro("b"), true);
  await Promise.resolve();
  assert.equal(bCalls, 1);
  assert.equal(aCalls, 1);
  current();
  other();

  const abort = new AbortController();
  abort.abort();
  let abortedCalls = 0;
  const aborted = api.bindProFaceHandoff("a", {
    hasUnsavedChanges: () => true,
    flush: async () => {
      abortedCalls += 1;
      return true;
    },
  });
  assert.equal(await api.saveBeforeLeavePro("a", abort.signal), true);
  await Promise.resolve();
  assert.equal(abortedCalls, 0, "already-aborted leave does not flush");
  aborted();
});
