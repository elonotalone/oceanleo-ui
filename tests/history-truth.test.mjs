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
    task("latest-output", { open_turn: true, working: true, last_activity_at: "2026-11-04T08:00:00Z", last_user_message_at: "2026-11-01T08:00:00Z" }),
    task("latest-user", { open_turn: true, working: true, last_activity_at: "2026-11-04T07:00:00Z", last_user_message_at: "2026-11-04T07:00:00Z" }),
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

test("explicit activity states keep stuck, user-waiting and idle out of working", () => {
  for (const activity_state of ["stuck", "waiting_user", "finishing", "idle"]) {
    assert.equal(isTaskWorking({ status: "running", mode: "computer", working: true, open_turn: true, activity_state }), false, activity_state);
  }
  assert.equal(isTaskWorking({ status: "running", mode: "computer", activity_state: "working" }), true);
  assert.equal(isTaskWorking({ status: "running", mode: "computer", activity_state: "working", working: false, open_turn: true }), false);
  assert.equal(isTaskWorking({ status: "running", mode: "computer", activity_state: "working", open_turn: false }), true);
});

test("activity state follows current bound work without resurrecting an old stuck run", () => {
  const at = "2026-10-15T06:30:00Z";
  const session = (id, extra = {}) => ({
    id, site_id: "oceanleo", app_id: "home-agent", status: "active", title: id, snapshot: {},
    schema_version: 1, revision: 1, created_at: "2026-10-01T00:00:00Z", last_activity_at: at, ...extra,
  });
  const entries = mergeHistoryEntries([
    session("s-stuck", { task_id: "t-stuck" }),
    session("s-idle", { task_id: "t-current" }),
    session("s-active", { task_id: "t-stuck-root" }),
    session("s-raw", { activity_state: "stuck" }),
  ], [
    task("t-stuck", { session_id: "s-stuck", activity_state: "stuck", working: true, open_turn: true, last_activity_at: at }),
    task("t-old", { session_id: "s-idle", activity_state: "stuck", created_at: "2026-10-01T00:00:00Z" }),
    task("t-current", { session_id: "s-idle", activity_state: "idle", created_at: "2026-10-02T00:00:00Z" }),
    task("t-stuck-root", { session_id: "s-active", activity_state: "stuck" }),
    task("t-active", { session_id: "s-active", activity_state: "working", working: true, last_activity_at: at }),
  ]);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  assert.equal(byId.get("s-stuck").activity_state, "stuck");
  assert.equal(byId.get("s-stuck").working, undefined);
  assert.equal(historyEntryTimestamp(byId.get("s-stuck")), at);
  assert.equal(byId.get("s-idle").activity_state, "idle");
  assert.equal(byId.get("s-active").activity_state, "working");
  assert.equal(byId.get("s-active").working, true);
  assert.equal(byId.get("s-raw").activity_state, "stuck");
  assert.equal(entries[0].id, "s-active");
});

test("finishing retains an open turn without working or moving its activity time", () => {
  const at = "2026-10-15T06:30:00Z";
  assert.equal(isTaskWorking({ status: "running", mode: "computer", working: true, open_turn: true, computer_run_status: "finishing" }), false);
  const entries = mergeHistoryEntries([], [
    task("finishing-task", { status: "running", open_turn: true, working: true, computer_run_status: "finishing", last_activity_at: at }),
    task("working-task", { working: true, activity_state: "working", last_activity_at: "2026-10-14T06:30:00Z" }),
  ]);
  assert.deepEqual(entries.map((entry) => entry.id), ["working-task", "finishing-task"]);
  const finishing = entries[1];
  assert.equal(finishing.activity_state, "finishing");
  assert.equal(finishing.working, undefined);
  assert.equal(finishing.task.open_turn, true);
  assert.equal(historyEntryTimestamp(finishing), at);
  assert.equal(formatHistoryActivityTime(at, Boolean(finishing.working), new Date("2026-11-04T00:00:00Z"), "en"), "Oct 15");
});

test("bound finishing is visible over selected idle but preserves selected stuck or waiting attention", () => {
  const at = "2026-10-15T06:30:00Z";
  const sessions = ["idle", "stuck", "waiting_user"].map((state) => ({
    id: `session-${state}`, task_id: `selected-${state}`, site_id: "oceanleo", app_id: "home-agent", status: "active",
    schema_version: 1, revision: 1, created_at: "2026-10-01T00:00:00Z", last_activity_at: at,
  }));
  const tasks = ["idle", "stuck", "waiting_user"].flatMap((state) => [
    task(`older-${state}`, { session_id: `session-${state}`, activity_state: "finishing", working: false, open_turn: true,
      created_at: "2026-10-01T00:00:00Z", last_activity_at: at }),
    task(`selected-${state}`, { session_id: `session-${state}`, activity_state: state, working: false,
      created_at: "2026-10-02T00:00:00Z", last_activity_at: at }),
  ]);
  const byId = new Map(mergeHistoryEntries(sessions, tasks).map((entry) => [entry.id, entry]));
  assert.equal(byId.get("session-idle").activity_state, "finishing");
  assert.equal(byId.get("session-stuck").activity_state, "stuck");
  assert.equal(byId.get("session-waiting_user").activity_state, "waiting_user");
  for (const entry of byId.values()) {
    assert.equal(entry.working, undefined);
    assert.equal(historyEntryTimestamp(entry), at);
  }
});

test("execution rights alone prove neither native work nor finishing completion", () => {
  for (const fields of [{ mode: "computer" }, { computer_id: "paired" }, { computer_run_status: "running" }]) {
    assert.equal(isTaskWorking({ status: "running", open_turn: true, ...fields }), false);
  }
  assert.equal(isTaskWorking({ status: "running", mode: "agent", open_turn: true }), true, "legacy cloud status remains compatible");
  assert.equal(isTaskWorking({ status: "finishing", mode: "computer", open_turn: true, working: true }), false);
  const entry = mergeHistoryEntries([], [task("raw-finishing", { status: "finishing", open_turn: true, working: true,
    last_activity_at: "2026-10-15T06:30:00Z" })])[0];
  assert.equal(entry.activity_state, "finishing");
  assert.equal(entry.working, undefined);
  assert.equal(entry.task.open_turn, true);
});
