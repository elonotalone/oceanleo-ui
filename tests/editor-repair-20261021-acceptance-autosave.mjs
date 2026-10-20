/**
 * V1 independent acceptance: autosave must not flush unless the person edited.
 * Load / dirty / revision change with userEdited false must not call flushRevision.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { AdvancedPersistenceController } from "../src/shell/advanced-persistence-controller.ts";

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
  const flushes = [];
  const controller = new AdvancedPersistenceController({
    debounceMs: 1_600,
    maxRetries: 0,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    flushRevision: async (revision) => {
      flushes.push(revision);
      return { ok: true, item: { id: `version-${revision}` } };
    },
    recordSavedItem: async () => true,
    ...overrides,
  });
  return { clock, controller, flushes };
}

test("observe dirty+new revision with userEdited:false does not call flushRevision", async () => {
  const fixture = controllerFixture();
  fixture.controller.observe({ revision: 0, dirty: false, userEdited: false });
  fixture.controller.observe({ revision: 1, dirty: true, userEdited: false });
  await fixture.clock.advance(5_000);
  if (typeof fixture.controller.whenIdle === "function") {
    await Promise.race([
      fixture.controller.whenIdle(),
      fixture.clock.advance(1),
    ]);
  }
  assert.deepEqual(
    fixture.flushes,
    [],
    "hydration dirty/revision must not autosave when the person has not edited",
  );
});

test("observe dirty+new revision with userEdited omitted defaults to no flush", async () => {
  const fixture = controllerFixture();
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({ revision: 1, dirty: true });
  await fixture.clock.advance(5_000);
  assert.deepEqual(fixture.flushes, []);
});

test("observe dirty+new revision with userEdited:true does schedule flushRevision", async () => {
  const fixture = controllerFixture();
  fixture.controller.observe({ revision: 0, dirty: false, userEdited: false });
  fixture.controller.observe({ revision: 1, dirty: true, userEdited: true });
  await fixture.clock.advance(1_600);
  if (typeof fixture.controller.whenIdle === "function") {
    await fixture.controller.whenIdle();
  } else {
    await Promise.resolve();
  }
  assert.deepEqual(fixture.flushes, [1]);
});
