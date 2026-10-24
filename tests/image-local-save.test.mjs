import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LOCAL_SAVED_NOTICE,
  createLocalSaveRunner,
} from "../src/shell/image-editor/local-save.ts";

// REAL: the runner is the production module. MOCK: handler (the host), capture and
// markSaved stand in for the Fabric canvas and the editor hook, which cannot run in Node.

function fakeTimers() {
  const pending = [];
  return {
    setTimer: (fn, ms) => {
      const id = { fn, ms, live: true };
      pending.push(id);
      return id;
    },
    clearTimer: (id) => {
      id.live = false;
    },
    fire() {
      for (const t of pending) if (t.live) { t.live = false; t.fn(); }
    },
  };
}

function editor() {
  const state = { revision: 1, dirty: true, saved: [] };
  return {
    state,
    admitted: () => ({ ok: true }),
    capture: () => ({ revision: state.revision, project: { schema: "oceanleo.fabric-image.v1", rev: state.revision } }),
    markSaved: (revision) => {
      if (state.revision !== revision) return false;
      state.dirty = false;
      return true;
    },
  };
}

test("success only after the host's ok answer; dirty clears for that revision", async () => {
  const ed = editor();
  const seen = [];
  const runner = createLocalSaveRunner({
    ...ed,
    handler: async (request) => {
      seen.push(request);
      assert.equal(ed.state.dirty, true, "still dirty until the host answers");
      return { ok: true };
    },
  });
  assert.deepEqual(await runner.run(), { ok: true });
  assert.equal(ed.state.dirty, false);
  assert.equal(seen[0].revision, 1);
  assert.equal(seen[0].project.schema, "oceanleo.fabric-image.v1");
});

test("host refusal, host error and not-ready canvas are failures and keep dirty", async () => {
  for (const [name, runner, ed] of [
    ["refused", (ed) => createLocalSaveRunner({ ...ed, handler: async () => ({ ok: false, error: "宿主拒绝" }) })],
    ["threw", (ed) => createLocalSaveRunner({ ...ed, handler: async () => { throw new Error("disk full"); } })],
    ["not-admitted", (ed) => createLocalSaveRunner({ ...ed, admitted: () => ({ ok: false, error: "图片源未载入" }), handler: async () => ({ ok: true }) })],
    ["no-canvas", (ed) => createLocalSaveRunner({ ...ed, capture: () => null, handler: async () => ({ ok: true }) })],
  ].map(([name, make]) => { const ed = editor(); return [name, make(ed), ed]; })) {
    const result = await runner.run();
    assert.equal(result.ok, false, name);
    assert.ok(result.error, name);
    assert.equal(ed.state.dirty, true, `${name}: not cleaned`);
  }
});

test("an old ack never cleans an edit made while the save was in flight", async () => {
  const ed = editor();
  const notes = [];
  let release;
  const runner = createLocalSaveRunner({
    ...ed,
    onSaved: (revision, stillDirty) => notes.push([revision, stillDirty]),
    handler: () => new Promise((resolve) => { release = () => resolve({ ok: true }); }),
  });
  const pending = runner.run();
  await Promise.resolve();
  ed.state.revision = 2; // user keeps drawing before the ack arrives
  release();
  assert.deepEqual(await pending, { ok: true });
  assert.equal(ed.state.dirty, true, "revision 2 is still unsaved");
  assert.deepEqual(notes, [[1, true]], "no 'saved locally' notice for work that is not saved");
});

test("one save in flight; a second caller saves the newer document afterwards", async () => {
  const ed = editor();
  const order = [];
  const releases = [];
  const runner = createLocalSaveRunner({
    ...ed,
    handler: (request) => {
      order.push(`start-${request.revision}`);
      return new Promise((resolve) => releases.push(() => { order.push(`ack-${request.revision}`); resolve({ ok: true }); }));
    },
  });
  const first = runner.run();
  const second = runner.run();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ["start-1"], "second waits for the first");
  ed.state.revision = 2;
  releases[0]();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["start-1", "ack-1", "start-2"]);
  releases[1]();
  await second;
  assert.equal(ed.state.dirty, false);
});

test("same revision is not re-sent; timeout and unmount fail explicitly and a late ack changes nothing", async () => {
  const ed = editor();
  let sends = 0;
  const timers = fakeTimers();
  const runner = createLocalSaveRunner({ ...ed, ...timers, handler: async () => { sends += 1; return { ok: true }; } });
  await runner.run();
  await runner.run();
  assert.equal(sends, 1);

  const ed2 = editor();
  const t2 = fakeTimers();
  let lateAck;
  const slow = createLocalSaveRunner({ ...ed2, ...t2, handler: () => new Promise((resolve) => { lateAck = () => resolve({ ok: true }); }) });
  const timedOut = slow.run();
  await Promise.resolve();
  t2.fire();
  const out = await timedOut;
  assert.equal(out.ok, false);
  assert.match(out.error, /时限/);
  lateAck();
  await Promise.resolve();
  assert.equal(ed2.state.dirty, true, "an ack after the timeout does not clean");

  const ed3 = editor();
  const t3 = fakeTimers();
  let ack3;
  const closing = createLocalSaveRunner({ ...ed3, ...t3, handler: () => new Promise((resolve) => { ack3 = () => resolve({ ok: true }); }) });
  const pending = closing.run();
  await Promise.resolve();
  closing.dispose();
  const closed = await pending;
  assert.equal(closed.ok, false);
  ack3();
  await Promise.resolve();
  assert.equal(ed3.state.dirty, true);
  assert.equal((await closing.run()).ok, false, "a disposed runner never saves");
});

test("the notice says local, never cloud synced", () => {
  assert.match(LOCAL_SAVED_NOTICE, /本机/);
  assert.match(LOCAL_SAVED_NOTICE, /未同步到云端/);
});

// STATIC (source assertions, not a mounted route): wiring of the real ImageRoute.
const route = readFileSync(new URL("../src/shell/advanced-routes/ImageRoute.tsx", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/shell/advanced-workbench-types.ts", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/shell/image-editor/use-fabric-image-editor.ts", import.meta.url), "utf8");
const runnerSource = readFileSync(new URL("../src/shell/image-editor/local-save.ts", import.meta.url), "utf8");

test("route: local callback is optional and typed; website path unchanged when absent", () => {
  assert.match(types, /onLocalSave\?: LocalImageSaveHandler/);
  assert.match(route, /const hasLocalSave = Boolean\(onLocalSave\)/);
  assert.match(route, /flush: localSaveRunner \? localSaveRunner\.run : saveBeforeNewConversation/);
  // The cloud save callback itself is untouched.
  assert.match(route, /const saved = await editor\.save\(\)/);
});

test("route: local save reads the live Fabric project and shares no cloud or token surface", () => {
  assert.match(route, /capture: \(\) => editorRef\.current\.captureLocalSave\(\)/);
  assert.match(route, /markSaved: \(revision\) => editorRef\.current\.markLocalSaved\(revision\)/);
  for (const forbidden of [/persistImageProject/, /accessToken/, /getArtifactItem/, /fetch\(/, /localStorage/, /postMessage/]) {
    assert.doesNotMatch(runnerSource, forbidden);
  }
  assert.match(route, /dispose\(\)/);
});

test("hook: the clean helper only applies to the same revision and never touches cloud save state", () => {
  const helper = hook.match(/const markLocalSaved = useCallback\(([\s\S]*?)\n  \}, \[updateDirty\]\);/);
  assert.ok(helper, "markLocalSaved present");
  assert.match(helper[1], /Object\.is\(revisionRef\.current, revision\)/);
  assert.doesNotMatch(helper[1], /lastSaveRef|setSavedUrl|cloudSavedAtRef|clearLocalImageDraft/);
});
