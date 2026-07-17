import assert from "node:assert/strict";
import test from "node:test";

import {
  AdvancedPersistenceController,
} from "../src/shell/advanced-persistence-controller.ts";

class FakeClock {
  now = 0;
  nextId = 1;
  timers = new Map();

  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + delay, callback });
    return id;
  };

  clearTimeout = (id) => {
    this.timers.delete(id);
  };

  async advance(ms) {
    const target = this.now + ms;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      this.timers.delete(id);
      this.now = timer.at;
      timer.callback();
      await Promise.resolve();
    }
    this.now = target;
    await Promise.resolve();
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function controllerFixture(overrides = {}) {
  const clock = new FakeClock();
  const states = [];
  const flushes = [];
  const records = [];
  const controller = new AdvancedPersistenceController({
    debounceMs: 1_600,
    maxRetries: 0,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onStateChange: (state) => states.push(state),
    flushRevision: async (revision) => {
      flushes.push(revision);
      return { ok: true, item: { id: `version-${revision}` } };
    },
    recordSavedItem: async (item, revision) => {
      records.push([item.id, revision]);
      return true;
    },
    ...overrides,
  });
  return { clock, controller, flushes, records, states };
}

test("debounce is measured from the latest edit revision", async () => {
  const fixture = controllerFixture();
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({ revision: 1, dirty: true });
  await fixture.clock.advance(1_000);
  fixture.controller.observe({ revision: 2, dirty: true });
  await fixture.clock.advance(1_599);
  assert.deepEqual(fixture.flushes, []);
  await fixture.clock.advance(1);
  await fixture.controller.whenIdle();
  assert.deepEqual(fixture.flushes, [2]);
  assert.deepEqual(fixture.records, [["version-2", 2]]);
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 2);
  assert.equal(fixture.controller.snapshot().state, "saved");
});

test("an edit during upload is serialized into the next save", async () => {
  const first = deferred();
  const flushes = [];
  const records = [];
  const fixture = controllerFixture({
    flushRevision: async (revision) => {
      flushes.push(revision);
      if (revision === 1) return first.promise;
      return { ok: true, item: { id: `version-${revision}` } };
    },
    recordSavedItem: async (item, revision) => {
      records.push([item.id, revision]);
      return true;
    },
  });
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({ revision: 1, dirty: true });
  const draining = fixture.controller.flushLatest();
  await Promise.resolve();
  fixture.controller.observe({ revision: 2, dirty: true });
  first.resolve({ ok: true, item: { id: "version-1" } });
  const result = await draining;
  assert.equal(result.ok, true);
  assert.deepEqual(flushes, [1, 2]);
  assert.deepEqual(records, [
    ["version-1", 1],
    ["version-2", 2],
  ]);
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 2);
});

test("a failed session CAS never reports the revision as saved", async () => {
  const fixture = controllerFixture({
    recordSavedItem: async () => false,
  });
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({ revision: 1, dirty: true });
  const result = await fixture.controller.flushLatest();
  assert.equal(result.ok, false);
  assert.equal(fixture.controller.snapshot().state, "error");
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 0);
  assert.equal(fixture.controller.snapshot().pendingSessionRevision, 1);
});

test("retry after a lost session response reuses the uploaded item", async () => {
  let recordAttempts = 0;
  const fixture = controllerFixture({
    recordSavedItem: async () => {
      recordAttempts += 1;
      return recordAttempts > 1;
    },
  });
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({ revision: 1, dirty: true });
  assert.equal((await fixture.controller.flushLatest()).ok, false);
  assert.equal((await fixture.controller.retry()).ok, true);
  assert.deepEqual(fixture.flushes, [1]);
  assert.equal(recordAttempts, 2);
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 1);
});

test("concurrent flush gates share one serialized drain", async () => {
  const pending = deferred();
  const fixture = controllerFixture({
    flushRevision: async (revision) => {
      fixture.flushes.push(revision);
      return pending.promise;
    },
  });
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({ revision: 1, dirty: true });
  const first = fixture.controller.flushLatest();
  const second = fixture.controller.flushLatest();
  assert.strictEqual(first, second);
  pending.resolve({ ok: true });
  assert.equal((await first).ok, true);
  assert.equal(fixture.flushes.length, 1);
});
