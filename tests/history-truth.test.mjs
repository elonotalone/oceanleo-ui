import assert from "node:assert/strict";
import test from "node:test";

import { HISTORY_ACTIVITY_EVENT, notifyHistoryActivity } from "../src/lib/history-events.ts";
import { formatHistoryActivityTime, formatHistoryTime, historyEntryTimestamp, isTaskWorking, mergeHistoryEntries } from "../src/shell/history-model.ts";

const task = (id, extra = {}) => ({
  id, status: "completed", mode: "computer", title: id,
  created_at: "2026-10-01T00:00:00Z", ...extra,
});

test("reading an old conversation preserves its recorded activity time", () => {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const events = [];
  window.addEventListener(HISTORY_ACTIVITY_EVENT, (event) => events.push(event.detail));
  try {
    notifyHistoryActivity({ taskId: "historical-read", at: "2026-10-15T06:30:00Z" });
    assert.equal(events.length, 1);
    assert.equal(events[0].at, "2026-10-15T06:30:00Z");
    const entries = mergeHistoryEntries([], [
      task("historical-read", { last_activity_at: events[0].at }),
      task("recent", { last_activity_at: "2026-11-03T06:30:00Z" }),
    ]);
    assert.deepEqual(entries.map((entry) => entry.id), ["recent", "historical-read"]);
    assert.equal(historyEntryTimestamp(entries[1]), "2026-10-15T06:30:00Z");
  } finally {
    globalThis.window = previousWindow;
  }
});

test("an unknown/invalid event time cannot stamp a conversation now", () => {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const events = [];
  window.addEventListener(HISTORY_ACTIVITY_EVENT, (event) => events.push(event.detail));
  try {
    for (const at of [undefined, null, "", "invalid-date"]) {
      notifyHistoryActivity({ taskId: `missing-${String(at)}`, user: true, at });
    }
    assert.deepEqual(events, []);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("only confirmed execution is working; waiting and stuck are never now", () => {
  assert.equal(isTaskWorking({ status: "running", mode: "computer", computer_run_status: "running" }), false);
  assert.equal(isTaskWorking({ status: "running", mode: "computer", computer_run_status: "waiting_user", open_turn: true }), false);
  assert.equal(isTaskWorking({ status: "running", mode: "computer", open_turn: true, working: false }), false);
  assert.equal(isTaskWorking({ status: "completed", mode: "computer", working: true }), true);
});

test("working rows use true last activity, including autonomous turns", () => {
  const entries = mergeHistoryEntries([], [
    task("latest-output", { open_turn: true, last_activity_at: "2026-11-04T08:00:00Z", last_user_message_at: "2026-11-01T08:00:00Z" }),
    task("latest-user", { open_turn: true, last_activity_at: "2026-11-04T07:00:00Z", last_user_message_at: "2026-11-04T07:00:00Z" }),
    task("finished", { last_activity_at: "2026-11-04T09:00:00Z" }),
  ]);
  assert.deepEqual(entries.map((entry) => entry.id), ["latest-output", "latest-user", "finished"]);
});

test("hover says now only while working and otherwise uses exactly the recorded time", () => {
  const at = "2026-10-15T06:30:00Z";
  const today = new Date("2026-11-04T06:30:00Z");
  assert.equal(formatHistoryActivityTime(at, true, today, "en"), "now");
  assert.equal(formatHistoryActivityTime(at, true, today, "zh-CN"), "现在");
  assert.equal(formatHistoryActivityTime(at, false, today, "en"), formatHistoryTime(at, today, "en"));
});

test("metadata updates never replace missing conversation activity", () => {
  const entries = mergeHistoryEntries([], [
    task("renamed-old-task", { updated_at: "2026-11-04T08:00:00Z" }),
    task("recent-conversation", { last_activity_at: "2026-11-03T08:00:00Z" }),
  ]);
  assert.deepEqual(entries.map((entry) => entry.id), ["recent-conversation", "renamed-old-task"]);
  assert.equal(historyEntryTimestamp(entries[1]), "2026-10-01T00:00:00Z");
});

test("a failed session list keeps its task-backed conversations visible without enabling deletion", async () => {
  const { canDeleteHistoryEntry } = await import("../src/shell/history-model.ts");
  const entries = mergeHistoryEntries([], [task("bound", { session_id: "not-loaded" })], { sessionApiFailed: true });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "bound");
  assert.equal(canDeleteHistoryEntry(entries[0]), false);
});
