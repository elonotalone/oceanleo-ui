import assert from "node:assert/strict";
import test from "node:test";

import {
  AdvancedPersistenceController,
  persistenceFailureRetryable,
  persistenceObserveAllowsAutosave,
} from "../src/shell/advanced-persistence-controller.ts";
import { SelectionCommandGate } from "../src/shell/selection-transactions.ts";
import {
  activeUserEditItemKey,
  recordUserMutation,
  resetUserEditSession,
  resetUserMutation,
  syncOpenUserEditItem,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

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
  const records = [];
  const controller = new AdvancedPersistenceController({
    debounceMs: 1_600,
    maxRetries: 3,
    retryDelays: [1_000, 2_000, 3_000],
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
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
  return { clock, controller, flushes, records };
}

function draftFixture(overrides = {}) {
  const clock = new FakeClock();
  const drafts = [];
  const versions = [];
  const controller = new AdvancedPersistenceController({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    draft: {
      saveRevision: async (revision) => {
        drafts.push(revision);
        return true;
      },
    },
    flushRevision: async (revision) => {
      versions.push(revision);
      return { ok: true, item: { id: `v${revision}` } };
    },
    recordSavedItem: async () => true,
    ...overrides,
  });
  controller.observe({ revision: 0, dirty: false });
  return { clock, controller, drafts, versions };
}

test("observe dirty+revision with userEdited false does not schedule flushRevision", async () => {
  const fixture = controllerFixture();
  fixture.controller.observe({
    revision: 1,
    dirty: true,
    userEdited: false,
  });
  assert.equal(persistenceObserveAllowsAutosave({ userEdited: false }), false);
  assert.equal(fixture.controller.hasScheduledWork(), false);
  assert.equal(fixture.controller.snapshot().state, "saved");
  await fixture.clock.advance(10_000);
  assert.deepEqual(fixture.flushes, []);
  fixture.controller.dispose();
});

test("observe dirty+revision with omitted userEdited does not schedule flushRevision", async () => {
  const fixture = controllerFixture();
  fixture.controller.observe({ revision: 1, dirty: true });
  assert.equal(persistenceObserveAllowsAutosave({}), false);
  assert.equal(fixture.controller.hasScheduledWork(), false);
  await fixture.clock.advance(10_000);
  assert.deepEqual(fixture.flushes, []);
  fixture.controller.dispose();
});

test("userEdited true schedules debounce flush and keeps the latest revision", async () => {
  const fixture = controllerFixture();
  fixture.controller.observe({ revision: 0, dirty: false });
  fixture.controller.observe({
    revision: 1,
    dirty: true,
    userEdited: true,
  });
  assert.equal(fixture.controller.hasScheduledWork(), true);
  await fixture.clock.advance(1_000);
  fixture.controller.observe({
    revision: 2,
    dirty: true,
    userEdited: true,
  });
  await fixture.clock.advance(1_599);
  assert.deepEqual(fixture.flushes, []);
  await fixture.clock.advance(1);
  await fixture.controller.whenIdle();
  assert.deepEqual(fixture.flushes, [2]);
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 2);
  fixture.controller.dispose();
});

test("userMutationGeneration > 0 schedules after the same dirty load revision", async () => {
  const fixture = controllerFixture();
  fixture.controller.observe({ revision: 1, dirty: true });
  await fixture.clock.advance(1_600);
  assert.deepEqual(fixture.flushes, []);
  fixture.controller.observe({
    revision: 1,
    dirty: true,
    userMutationGeneration: 1,
  });
  assert.equal(fixture.controller.hasScheduledWork(), true);
  await fixture.clock.advance(1_600);
  await fixture.controller.whenIdle();
  assert.deepEqual(fixture.flushes, [1]);
  fixture.controller.dispose();
});

test("integrity-failed stays non-retryable after a user edit", async () => {
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
  fixture.controller.observe({
    revision: 1,
    dirty: true,
    userEdited: true,
  });
  const result = await fixture.controller.flushLatest();
  assert.equal(result.ok, false);
  assert.equal(result.retryable, false);
  assert.deepEqual(fixture.flushes, [1]);
  assert.equal(fixture.controller.snapshot().state, "error");
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 0);
  await fixture.clock.advance(10_000);
  assert.deepEqual(fixture.flushes, [1]);
  fixture.controller.dispose();
});

test("transient network failures still retry after a user edit", async () => {
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
  fixture.controller.observe({
    revision: 1,
    dirty: true,
    userEdited: true,
  });
  assert.equal((await fixture.controller.flushLatest()).ok, false);
  assert.deepEqual(fixture.flushes, [1]);
  await fixture.clock.advance(1_000);
  await fixture.controller.whenIdle();
  assert.deepEqual(fixture.flushes, [1, 1]);
  assert.equal(fixture.controller.snapshot().acknowledgedRevision, 1);
  fixture.controller.dispose();
});

test("draft observe without userEdited does not upload a draft", async () => {
  const fixture = draftFixture();
  fixture.controller.observe({ revision: 1, dirty: true });
  await fixture.clock.advance(20_400);
  assert.deepEqual(fixture.drafts, []);
  assert.deepEqual(fixture.versions, []);
  fixture.controller.observe({
    revision: 1,
    dirty: true,
    userEdited: true,
  });
  await fixture.clock.advance(400);
  assert.deepEqual(fixture.drafts, [1]);
  fixture.controller.dispose();
});

test("recordUserMutation / reset / item switch own the generation", () => {
  resetUserEditSession();
  syncOpenUserEditItem("doc-a");
  assert.equal(userMutationGeneration("doc-a"), 0);
  assert.equal(recordUserMutation("doc-a"), 1);
  assert.equal(recordUserMutation("doc-a"), 2);
  assert.equal(userMutationGeneration("doc-a"), 2);
  assert.equal(userMutationGeneration("doc-b"), 0);
  resetUserMutation("doc-a");
  assert.equal(userMutationGeneration("doc-a"), 0);
  recordUserMutation("doc-a");
  syncOpenUserEditItem("doc-b");
  assert.equal(userMutationGeneration("doc-a"), 0);
  assert.equal(userMutationGeneration("doc-b"), 0);
  assert.equal(activeUserEditItemKey(), "doc-b");
  recordUserMutation("doc-b");
  assert.equal(userMutationGeneration("doc-b"), 1);
  syncOpenUserEditItem("doc-a");
  assert.equal(userMutationGeneration("doc-b"), 0);
  assert.equal(userMutationGeneration("doc-a"), 0);
  resetUserEditSession();
});

test("SelectionCommandGate records successful user commands and ignores remote origin", () => {
  resetUserEditSession();
  syncOpenUserEditItem("canvas-1");
  const context = {
    version: 1,
    id: "shape:hero",
    kind: "shape",
    revision: 3,
    controls: [],
  };
  const gate = new SelectionCommandGate();
  assert.equal(
    gate.accept(
      {
        requestId: "req-fill",
        selectionId: context.id,
        controlId: "fill",
        value: "#2563eb",
        selectionRevision: 3,
      },
      context,
    ),
    true,
  );
  assert.equal(userMutationGeneration("canvas-1"), 1);

  assert.equal(
    gate.accept(
      {
        requestId: "req-remote",
        selectionId: context.id,
        controlId: "opacity",
        value: 0.4,
        selectionRevision: 3,
      },
      context,
      "remote",
    ),
    true,
  );
  assert.equal(userMutationGeneration("canvas-1"), 1);

  assert.equal(
    gate.accept(
      {
        requestId: "req-collab",
        selectionId: context.id,
        controlId: "rotate",
        value: 15,
        selectionRevision: 3,
        origin: "collab",
      },
      context,
    ),
    true,
  );
  assert.equal(userMutationGeneration("canvas-1"), 1);

  const start = gate.accept(
    {
      requestId: "req-start",
      selectionId: context.id,
      controlId: "letter-spacing",
      value: 0,
      selectionRevision: 3,
      phase: "start",
      transactionId: "txn-1",
    },
    context,
  );
  assert.equal(start, true);
  assert.equal(userMutationGeneration("canvas-1"), 1);

  assert.equal(
    gate.accept(
      {
        requestId: "req-update",
        selectionId: context.id,
        controlId: "letter-spacing",
        value: 4,
        selectionRevision: 3,
        phase: "update",
        transactionId: "txn-1",
      },
      context,
    ),
    true,
  );
  assert.equal(userMutationGeneration("canvas-1"), 2);

  assert.equal(
    gate.accept(
      {
        requestId: "req-commit",
        selectionId: context.id,
        controlId: "letter-spacing",
        value: 4,
        selectionRevision: 3,
        phase: "commit",
        transactionId: "txn-1",
      },
      context,
    ),
    true,
  );
  assert.equal(userMutationGeneration("canvas-1"), 3);
  resetUserEditSession();
});
