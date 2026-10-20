import assert from "node:assert/strict";
import test from "node:test";

import {
  AdvancedPersistenceController,
  persistenceFailureRetryable,
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

function controllerFixture(overrides = {}) {
  const clock = new FakeClock();
  const states = [];
  const flushes = [];
  const records = [];
  const controller = new AdvancedPersistenceController({
    debounceMs: 1_600,
    maxRetries: 3,
    retryDelays: [1_000, 2_000, 3_000],
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

test("W2: integrity-failed is not auto-retried and the draft stays unacknowledged", async () => {
  assert.equal(
    persistenceFailureRetryable(
      Object.assign(new Error("保存被拒绝（integrity-failed）。请稍后重试。"), {
        code: "integrity-failed",
      }),
    ),
    false,
  );

  const fixture = controllerFixture({
    flushRevision: async (revision) => {
      fixture.flushes.push(revision);
      return {
        ok: false,
        error: "保存失败：「提交新版本」这一步没有完成 —— 保存被拒绝（integrity-failed）。请稍后重试。",
        retryable: false,
        code: "integrity-failed",
      };
    },
  });
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({ revision: 1, dirty: true, userEdited: true });
  const result = await fixture.controller.flushLatest();
  assert.equal(result.ok, false);
  assert.equal(result.retryable, false);
  assert.deepEqual(fixture.flushes, [1]);
  assert.equal(fixture.controller.snapshot().state, "error");
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 0);
  assert.equal(fixture.controller.hasUnconfirmedWork(), true);
  await fixture.clock.advance(10_000);
  assert.deepEqual(fixture.flushes, [1], "invalid payload must not be replayed");
  assert.deepEqual(fixture.records, []);
});

test("W2: transient network failures still retry", async () => {
  let attempts = 0;
  const fixture = controllerFixture({
    flushRevision: async (revision) => {
      fixture.flushes.push(revision);
      attempts += 1;
      if (attempts < 2) {
        return { ok: false, error: "连不上素材服务，请检查网络后重试。" };
      }
      return { ok: true, item: { id: `version-${revision}` } };
    },
  });
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({ revision: 1, dirty: true, userEdited: true });
  assert.equal((await fixture.controller.flushLatest()).ok, false);
  assert.deepEqual(fixture.flushes, [1]);
  await fixture.clock.advance(1_000);
  await fixture.controller.whenIdle();
  assert.deepEqual(fixture.flushes, [1, 1]);
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 1);
  assert.equal(fixture.controller.snapshot().state, "saved");
});

test("W2: a later explicit retry can reuse a committed item after session CAS", async () => {
  let recordAttempts = 0;
  const fixture = controllerFixture({
    recordSavedItem: async (item, revision) => {
      fixture.records.push([item.id, revision]);
      recordAttempts += 1;
      return recordAttempts > 1;
    },
  });
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({ revision: 1, dirty: true, userEdited: true });
  assert.equal((await fixture.controller.flushLatest()).ok, false);
  assert.deepEqual(fixture.flushes, [1]);
  assert.equal((await fixture.controller.retry()).ok, true);
  assert.deepEqual(fixture.flushes, [1], "successful upload must not be repeated");
  assert.equal(recordAttempts, 2);
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 1);
});

test("W2-r2: a committed artifact is not uploaded again when only the record step retries", async () => {
  let recordAttempts = 0;
  const fixture = controllerFixture({
    recordSavedItem: async (item, revision) => {
      fixture.records.push([item.id, revision]);
      recordAttempts += 1;
      if (recordAttempts === 1) return false;
      return true;
    },
  });
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({ revision: 1, dirty: true, userEdited: true });
  assert.equal((await fixture.controller.flushLatest()).ok, false);
  assert.deepEqual(fixture.flushes, [1]);
  await fixture.clock.advance(1_000);
  await fixture.controller.whenIdle();
  assert.deepEqual(fixture.flushes, [1], "record retry must reuse the committed item");
  assert.equal(recordAttempts, 2);
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 1);
  assert.equal(fixture.controller.snapshot().state, "saved");
});
