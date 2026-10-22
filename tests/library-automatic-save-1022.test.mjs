// 2026-10-22 claude_autosave_1022: Library 自动保存必须完全自动。
// 六条特征化用例 + 退避/唤醒 + 永久失败如实 + 无「重试」提示 + Umo 保存路径重叠。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AdvancedPersistenceController,
  AUTOSAVE_RETRY_DELAYS,
} from "../src/shell/advanced-persistence-controller.ts";

const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };
class Clock {
  now = 0; next = 0; timers = new Map();
  setTimeout = (callback, delay) => { const id = ++this.next; this.timers.set(id, { at: this.now + delay, callback }); return id; };
  clearTimeout = (id) => this.timers.delete(id);
  async advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]); this.now = due[1].at; due[1].callback(); await settle();
    }
    this.now = end; await settle();
  }
}
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

function legacy(extra = {}) {
  const clock = new Clock(); const flushes = []; const records = []; const states = [];
  const c = new AdvancedPersistenceController({
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: () => clock.now,
    onStateChange: (s) => states.push([clock.now, s]),
    flushRevision: async (r) => { flushes.push([r, clock.now]); return { ok: true, item: { id: `v${r}` } }; },
    recordSavedItem: async (item, r) => { records.push([item.id, r]); return true; },
    ...extra,
  });
  c.observe({ revision: 0, dirty: false });
  return { c, clock, flushes, records, states };
}
function tiered(extra = {}) {
  const clock = new Clock(); const drafts = []; const versions = []; const states = [];
  const c = new AdvancedPersistenceController({
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: () => clock.now,
    onStateChange: (s) => states.push([clock.now, s]),
    draft: { saveRevision: async (r) => { drafts.push([r, clock.now]); return true; } },
    flushRevision: async (r) => { versions.push([r, clock.now]); return { ok: true, item: { id: `v${r}` } }; },
    recordSavedItem: async () => true,
    ...extra,
  });
  c.observe({ revision: 0, dirty: false });
  return { c, clock, drafts, versions, states };
}

test("(1) one tiny edit: exactly one publish, saved at the debounce, no artificial yellow floor", async () => {
  const f = legacy();
  f.c.observe({ revision: 1, dirty: true, userEdited: true });
  assert.equal(f.c.snapshot().state, "saving");
  await f.clock.advance(499); assert.deepEqual(f.flushes, []);
  await f.clock.advance(1);
  assert.deepEqual(f.flushes, [[1, 500]]);
  assert.equal(f.c.snapshot().state, "saved");
  assert.deepEqual(f.states.at(-1), [500, "saved"]);
  await f.clock.advance(120_000);
  assert.equal(f.flushes.length, 1, "no second publication");
  f.c.dispose();
});

test("(1b) draft tier: saved the moment the draft is durable (400ms), one version later", async () => {
  const f = tiered();
  f.c.observe({ revision: 1, dirty: true, userEdited: true });
  await f.clock.advance(400);
  assert.deepEqual(f.drafts, [[1, 400]]);
  assert.equal(f.c.snapshot().state, "saved");
  await f.clock.advance(20_000);
  assert.equal(f.versions.length, 1);
  assert.equal(f.c.snapshot().state, "saved");
  f.c.dispose();
});

test("(2) open/hydrate/close unchanged: zero writes and no unconfirmed work", async () => {
  for (const make of [legacy, tiered]) {
    const f = make();
    f.c.observe({ revision: 1, dirty: true }); // hydration: dirty without a user edit
    f.c.observe({ revision: 2, dirty: true, userEdited: false });
    await f.clock.advance(120_000);
    assert.equal((f.flushes ?? f.versions).length, 0);
    assert.equal((f.drafts ?? []).length, 0);
    assert.equal(f.c.hasUnconfirmedWork(), false, `${make.name} must not hand off hydration dirt`);
    assert.equal(f.c.snapshot().state, "saved");
    f.c.dispose();
  }
});

test("(3) a second edit during an in-flight save persists the latest content", async () => {
  const gate = deferred();
  const f = legacy({
    flushRevision: async (r) => { f.flushes.push([r, f.clock.now]); if (r === 1) await gate.promise; return { ok: true, item: { id: `v${r}` } }; },
  });
  f.c.observe({ revision: 1, dirty: true, userEdited: true });
  await f.clock.advance(500);
  f.c.observe({ revision: 2, dirty: true, userEdited: true });
  gate.resolve(); await settle(); await f.clock.advance(600);
  assert.deepEqual(f.flushes.map((x) => x[0]), [1, 2]);
  assert.equal(f.c.snapshot().acknowledgedRevision, 2);
  assert.equal(f.c.snapshot().state, "saved");
  f.c.dispose();
});

test("(4) transient failures retry forever on a capped backoff, no click", async () => {
  let fails = 6; const stamps = [];
  const f = legacy({
    flushRevision: async (r) => { stamps.push(f.clock.now); if (fails-- > 0) return { ok: false, error: "network-error" }; return { ok: true, item: { id: "v" } }; },
  });
  f.c.observe({ revision: 1, dirty: true, userEdited: true });
  await f.clock.advance(500 + 1_500 + 4_000 + 9_000 + 20_000 + 30_000 + 30_000);
  assert.equal(f.c.snapshot().acknowledgedRevision, 1);
  assert.equal(f.c.snapshot().state, "saved");
  assert.deepEqual(stamps.map((t, i) => (i ? t - stamps[i - 1] : t)), [500, 1500, 4000, 9000, 20000, 30000, 30000]);
  assert.equal(AUTOSAVE_RETRY_DELAYS.at(-1), 30_000);
  f.c.dispose();
});

test("(4b) online/visible nudges skip the backoff; rate limited; permanent failures are not re-run", async () => {
  let ok = false; let calls = 0;
  const f = legacy({ flushRevision: async () => { calls += 1; return ok ? { ok: true, item: { id: "v" } } : { ok: false, error: "offline" }; } });
  f.c.observe({ revision: 1, dirty: true, userEdited: true });
  await f.clock.advance(500); assert.equal(calls, 1);
  await f.clock.advance(1_000); // inside the 1.5s backoff, past the 1s nudge gap
  ok = true; f.c.nudge("online"); await settle();
  assert.equal(calls, 2); assert.equal(f.c.snapshot().state, "saved");
  f.c.dispose();

  let conflicts = 0;
  const g = legacy({ flushRevision: async () => { conflicts += 1; return { ok: false, error: "x", code: "revision-conflict", retryable: false }; } });
  g.c.observe({ revision: 1, dirty: true, userEdited: true });
  await g.clock.advance(500); await g.clock.advance(600_000);
  g.c.nudge("online"); g.c.nudge("visible"); g.c.nudge("auth"); await settle();
  assert.equal(conflicts, 1, "a conflict is attempted once; no 409 storm");
  assert.equal(g.c.snapshot().state, "error");
  assert.equal(g.c.snapshot().failure.auth, false);
  g.c.dispose();
});

test("(6) auth failure is truthful, then resumes by itself after sign-in", async () => {
  let signedIn = false; let calls = 0;
  const f = tiered({
    draft: { saveRevision: async () => { calls += 1; if (!signedIn) { const e = new Error("401 unauthorized"); e.code = "unauthorized"; throw e; } return true; } },
  });
  f.c.observe({ revision: 1, dirty: true, userEdited: true });
  await f.clock.advance(400 + 600_000);
  assert.equal(calls, 1); assert.equal(f.c.snapshot().state, "error");
  assert.equal(f.c.snapshot().failure.auth, true);
  assert.equal(f.c.hasUnconfirmedWork(), true);
  f.c.nudge("visible"); await settle(); assert.equal(calls, 1, "visibility alone does not hammer a dead session");
  signedIn = true; f.c.nudge("auth"); await f.clock.advance(1); await settle();
  assert.equal(calls, 2); assert.equal(f.c.snapshot().state, "saved");
  f.c.dispose();
});

test("(4c) draft tier transient failures keep retrying beyond 3 attempts and prepareBackgroundRetries stays unbounded", async () => {
  let n = 0;
  const f = tiered({ draft: { saveRevision: async () => ++n > 5 } });
  f.c.observe({ revision: 1, dirty: true, userEdited: true });
  f.c.prepareBackgroundRetries();
  await f.clock.advance(400 + 5_000 + 10_000 + 15_000 + 30_000 + 60_000);
  assert.equal(n, 6); assert.equal(f.c.snapshot().state, "saved");
  f.c.dispose();
});

// ---- background saver (editor closed) -------------------------------------
const fakeWindow = new EventTarget();
const fakeDocument = Object.assign(new EventTarget(), { visibilityState: "visible" });
Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: fakeWindow });
Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: fakeDocument });
const saver = await import("../src/shell/advanced-background-saver.ts");
const KEY = "lib:1022";

test("(4d)(5) editor closed: transient failures recover with no click and no 'failed' job; takeBack reuses the controller without a second publish", async () => {
  saver.resetBackgroundSaverForTests();
  let fail = 2; const writes = [];
  const c = new AdvancedPersistenceController({
    debounceMs: 0,
    flushRevision: async (r) => { writes.push(r); return fail-- > 0 ? { ok: false, error: "network-error" } : { ok: true, item: { id: "v" } }; },
    recordSavedItem: async () => true,
  });
  c.observe({ revision: 1, dirty: true, userEdited: true });
  saver.handOff(KEY, c);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(saver.failedBackgroundSaveCount(), 0, "transient failure never surfaces the unsaved toast");
  assert.equal(saver.hasPendingOrFailed(), true);
  // regained connectivity: no waiting for the 5s background backoff
  for (let i = 0; i < 4 && saver.hasPendingOrFailed(); i += 1) {
    await new Promise((r) => setTimeout(r, 1_100));
    fakeWindow.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(saver.hasPendingOrFailed(), false);
  assert.deepEqual(writes, [1, 1, 1]);
  assert.equal(saver.failedBackgroundSaveCount(), 0);
  saver.resetBackgroundSaverForTests();
});

test("(5) reopen mid-save: takeBack hands the same controller back and nothing is published twice", async () => {
  saver.resetBackgroundSaverForTests();
  const gate = deferred(); const writes = [];
  const c = new AdvancedPersistenceController({
    debounceMs: 0,
    flushRevision: async (r) => { writes.push(r); await gate.promise; return { ok: true, item: { id: "v" } }; },
    recordSavedItem: async () => true,
  });
  c.observe({ revision: 1, dirty: true, userEdited: true });
  saver.handOff(KEY, c);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(saver.takeBack(KEY), c);
  gate.resolve(); await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(writes, [1]);
  assert.equal(saver.hasPendingOrFailed(), false);
  c.dispose(); saver.resetBackgroundSaverForTests();
});

test("(6b) background permanent failures stay truthful: blocked is kept, auth resumes after sign-in event", async () => {
  saver.resetBackgroundSaverForTests();
  let signedIn = false; let calls = 0;
  const c = new AdvancedPersistenceController({
    debounceMs: 0,
    flushRevision: async () => { calls += 1; if (signedIn) return { ok: true, item: { id: "v" } }; return { ok: false, error: "unauthorized", code: "unauthorized" }; },
    recordSavedItem: async () => true,
  });
  c.observe({ revision: 1, dirty: true, userEdited: true });
  saver.handOff(KEY, c);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(saver.failedBackgroundSaveCount(), 1);
  assert.equal(saver.snapshotBackgroundSaves()[0].reason, "auth");
  assert.equal(saver.noticeSnapshot().auth, 1);
  signedIn = true;
  fakeWindow.dispatchEvent(new CustomEvent("oceanleo:auth-state", { detail: { event: "SIGNED_IN", userId: "u1" } }));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(saver.hasPendingOrFailed(), false);
  assert.equal(calls, 2);

  // conflict: kept as blocked, never re-run by nudges
  let conflictCalls = 0;
  const d = new AdvancedPersistenceController({
    debounceMs: 0,
    flushRevision: async () => { conflictCalls += 1; return { ok: false, error: "conflict", code: "revision-conflict", retryable: false }; },
    recordSavedItem: async () => true,
  });
  d.observe({ revision: 1, dirty: true, userEdited: true });
  saver.handOff("lib:conflict", d);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(saver.snapshotBackgroundSaves()[0].reason, "blocked");
  fakeWindow.dispatchEvent(new Event("online")); fakeDocument.dispatchEvent(new Event("visibilitychange"));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(conflictCalls, 1);
  saver.resetBackgroundSaverForTests();
});

test("a caller-capped controller that gave up is still retried by the saver, not left failed", async () => {
  saver.resetBackgroundSaverForTests();
  let ok = false; let calls = 0;
  const c = new AdvancedPersistenceController({
    debounceMs: 0, maxRetries: 0,
    flushRevision: async () => { calls += 1; return ok ? { ok: true, item: { id: "v" } } : { ok: false, error: "w14-final-fail" }; },
    recordSavedItem: async () => true,
  });
  c.observe({ revision: 1, dirty: true, userEdited: true });
  saver.handOff(KEY, c);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(saver.failedBackgroundSaveCount(), 0);
  ok = true; fakeWindow.dispatchEvent(new Event("online"));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(saver.hasPendingOrFailed(), false); assert.equal(calls, 2);
  saver.resetBackgroundSaverForTests();
});

test("the 'N changes still not saved' + Retry toast path is gone", () => {
  const notice = readFileSync("src/shell/advanced-background-save-notice.ts", "utf8");
  const copy = readFileSync("src/i18n/ui/messages/eas-w14-copy.ts", "utf8");
  for (const text of [notice, copy]) {
    assert.doesNotMatch(text, /还没保存上|retryAllFailed|data-advanced-background-save-retry|Retry|重试/);
  }
});
