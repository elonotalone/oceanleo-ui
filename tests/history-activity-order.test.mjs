import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bumpHistoryEntries,
  historyEntryTimestamp,
  mergeHistoryEntries,
} from "../src/shell/history-model.ts";

const historySource = readFileSync(
  new URL("../src/shell/HistoryMasterDetail.tsx", import.meta.url),
  "utf8",
);
const chatSource = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");

const task = (id, fields = {}) => ({
  id,
  title: id,
  status: "completed",
  mode: "computer",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...fields,
});

const session = (id, fields = {}) => ({
  id,
  site_id: "oceanleo",
  app_id: "home-agent",
  title: id,
  status: "active",
  snapshot: {},
  schema_version: 1,
  revision: 1,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  last_activity_at: "2026-10-01T00:00:00Z",
  ...fields,
});

test("我的任务：工作中的永远在最上面，其余按最近活动倒序（不是创建时间）", () => {
  const entries = mergeHistoryEntries(
    [session("s-recent", { last_activity_at: "2026-10-31T09:00:00Z" })],
    [
      // Old task, still streaming: its frames moved last_activity_at, not updated_at.
      task("old-running", { status: "running", last_activity_at: "2026-10-31T08:00:00Z" }),
      task("native-running", { computer_run_status: "waiting_user", last_activity_at: "2026-10-30T00:00:00Z" }),
      task("newest-created", { created_at: "2026-10-30T12:00:00Z", updated_at: "2026-10-30T12:00:00Z", last_activity_at: "2026-10-30T12:00:00Z" }),
      task("resumed", { last_activity_at: "2026-10-31T10:00:00+00:00" }),
      // Old gateway (no 0313): falls back to updated_at, then created_at.
      task("legacy", { updated_at: "2026-10-31T09:30:00Z" }),
    ],
  );
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["old-running", "native-running", "resumed", "legacy", "s-recent", "newest-created"],
  );
  assert.equal(entries[0].working, true);
  assert.equal(entries[2].activity_at, "2026-10-31T10:00:00+00:00");
  // The hover time follows the order: last activity, not creation.
  assert.equal(historyEntryTimestamp(entries[2]), "2026-10-31T10:00:00+00:00");
});

test("工作组内按用户最近发言排，流式输出不会让两条任务来回换位", () => {
  const first = mergeHistoryEntries([], [
    task("a", { status: "running", last_user_message_at: "2026-10-31T10:00:00Z", last_activity_at: "2026-10-31T10:05:10Z" }),
    task("b", { status: "running", last_user_message_at: "2026-10-31T10:02:00Z", last_activity_at: "2026-10-31T10:05:00Z" }),
  ]);
  const later = mergeHistoryEntries([], [
    task("a", { status: "running", last_user_message_at: "2026-10-31T10:00:00Z", last_activity_at: "2026-10-31T10:05:20Z" }),
    task("b", { status: "running", last_user_message_at: "2026-10-31T10:02:00Z", last_activity_at: "2026-10-31T10:05:30Z" }),
  ]);
  assert.deepEqual(first.map((entry) => entry.id), ["b", "a"]);
  assert.deepEqual(later.map((entry) => entry.id), ["b", "a"]);
  // Without a user-message time the activity time decides.
  const bare = mergeHistoryEntries([], [
    task("x", { status: "running", last_activity_at: "2026-10-31T10:00:00Z" }),
    task("y", { status: "running", last_activity_at: "2026-10-31T10:01:00Z" }),
  ]);
  assert.deepEqual(bare.map((entry) => entry.id), ["y", "x"]);
});

test("session 行跟随它挂着的 task 的对话活动与工作状态", () => {
  const entries = mergeHistoryEntries(
    [
      session("s-old", { task_id: "t-old", last_activity_at: "2026-10-02T00:00:00Z" }),
      session("s-mid", { last_activity_at: "2026-10-20T00:00:00Z" }),
    ],
    [task("t-old", { session_id: "s-old", mode: "agent", last_activity_at: "2026-10-31T10:00:00Z" })],
  );
  assert.deepEqual(entries.map((entry) => entry.id), ["s-old", "s-mid"]);
  assert.equal(entries[0].activity_at, "2026-10-31T10:00:00Z");
});

test("本页刚看到的活动只把行往上提，刷新后仍保留（localActivity）", () => {
  const tasks = [
    task("quiet", { last_activity_at: "2026-10-20T00:00:00Z" }),
    task("newer", { last_activity_at: "2026-10-30T00:00:00Z" }),
  ];
  const merged = mergeHistoryEntries([], tasks);
  assert.deepEqual(merged.map((entry) => entry.id), ["newer", "quiet"]);
  const bumped = bumpHistoryEntries(merged, { taskId: "quiet", at: "2026-10-31T00:00:00Z" });
  assert.deepEqual(bumped.map((entry) => entry.id), ["quiet", "newer"]);
  // An older event never moves a row down, and returns the same array.
  assert.equal(bumpHistoryEntries(bumped, { taskId: "quiet", at: "2026-10-01T00:00:00Z" }), bumped);
  const refreshed = mergeHistoryEntries([], tasks, {
    localActivity: new Map([["quiet", { at: "2026-10-31T00:00:00Z" }]]),
  });
  assert.deepEqual(refreshed.map((entry) => entry.id), ["quiet", "newer"]);
});

test("侧栏接线：活动事件就地重排、比较含活动时间、置顶仍在最前、聊天流派发活动", () => {
  assert.match(historySource, /HISTORY_ACTIVITY_EVENT/);
  assert.match(historySource, /bumpHistoryEntries\(prev/);
  assert.match(historySource, /localActivity: liveLocalActivity\(\)/);
  assert.match(historySource, /\(x\.activity_at \?\? null\) !== \(y\.activity_at \?\? null\)/);
  assert.match(historySource, /\(x\.task\.last_activity_at \?\? null\) !== \(y\.task\.last_activity_at \?\? null\)/);
  assert.match(historySource, /Number\(pinnedOf\(b\)\) - Number\(pinnedOf\(a\)\)/);
  assert.match(chatSource, /notifyHistoryActivity\(\{ taskId: id \}\)/);
  assert.match(chatSource, /notifyHistoryActivity\(\{ taskId: activityTaskId, user:/);
});
