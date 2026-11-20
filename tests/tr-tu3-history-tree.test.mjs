// Task rooms wave TU3: My tasks shows tasks (people conversations) and standalone agent tasks at
// the top level; agent tasks whose parent_room is one of my tasks are nested under it.
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoryTree,
  filterHistoryTree,
  historyTreeRoomOfSelection,
  mergeHistoryEntries,
  taskParentRoom,
} from "../src/shell/history-model.ts";

const task = (id, at, extra = {}) => ({
  id,
  title: `task ${id}`,
  status: "completed",
  mode: "computer",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: at,
  last_input_at: at,
  last_activity_at: at,
  ...extra,
});
const room = (id, at, extra = {}) => ({ id, title: `room ${id}`, last_message_at: at, project: null, unread: 0, ...extra });

const titles = (rows) => rows.map((row) => row.kind === "room"
  ? `R:${row.room.id}[${row.children.map((entry) => entry.id).join(",")}]`
  : `E:${row.entry.id}`);

test("taskParentRoom reads {id,title} and ignores empty / malformed values", () => {
  assert.deepEqual(taskParentRoom({ parent_room: { id: " r1 ", title: "Plan" } }), { id: "r1", title: "Plan" });
  assert.deepEqual(taskParentRoom({ parent_room: { id: "r1" } }), { id: "r1", title: "" });
  assert.equal(taskParentRoom({ parent_room: null }), undefined);
  assert.equal(taskParentRoom({ parent_room: { id: "" } }), undefined);
  assert.equal(taskParentRoom({}), undefined);
  assert.equal(taskParentRoom(null), undefined);
});

test("mergeHistoryEntries carries parent_room onto task rows and onto the session row of a bound task", () => {
  const tasks = [
    task("t1", "2026-11-20T10:00:00Z", { parent_room: { id: "r1", title: "Room one" } }),
    task("t2", "2026-11-20T09:00:00Z", { session_id: "s2", parent_room: { id: "r2", title: "Room two" } }),
    task("t3", "2026-11-20T08:00:00Z", { parent_room: null }),
  ];
  const sessions = [{ id: "s2", app_id: "chat", title: "s2", status: "active", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-20T09:00:00Z", task_id: "t2" }];
  const entries = mergeHistoryEntries(sessions, tasks);
  const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]));
  assert.deepEqual(byId.t1.parent_room, { id: "r1", title: "Room one" });
  assert.deepEqual(byId.s2.parent_room, { id: "r2", title: "Room two" });
  assert.equal("parent_room" in byId.t3, false);
});

test("no task list (route unavailable) → today's flat list in today's order", () => {
  const entries = mergeHistoryEntries([], [
    task("a", "2026-11-20T08:00:00Z", { parent_room: { id: "r1", title: "" } }),
    task("b", "2026-11-20T10:00:00Z"),
  ]);
  const rows = buildHistoryTree(entries, null);
  assert.deepEqual(titles(rows), ["E:b", "E:a"]);
});

test("children nest under their task; tasks and agent tasks sort together by latest activity", () => {
  const entries = mergeHistoryEntries([], [
    task("solo-old", "2026-11-20T07:00:00Z"),
    task("child-new", "2026-11-20T12:00:00Z", { parent_room: { id: "r1", title: "" } }),
    task("child-old", "2026-11-20T06:00:00Z", { parent_room: { id: "r1", title: "" } }),
    task("solo-mid", "2026-11-20T09:00:00Z"),
    task("orphan", "2026-11-20T08:00:00Z", { parent_room: { id: "not-mine", title: "" } }),
  ]);
  const rows = buildHistoryTree(entries, [
    room("r1", "2026-11-20T05:00:00Z"),          // its newest sub task (12:00) lifts it to the top
    room("r2", "2026-11-20T10:00:00Z"),          // no children: its last message decides
  ]);
  assert.deepEqual(titles(rows), ["R:r1[child-new,child-old]", "R:r2[]", "E:solo-mid", "E:orphan", "E:solo-old"]);
  const r1 = rows[0];
  assert.equal(r1.sortTime, "2026-11-20T12:00:00Z");
});

test("a sub task whose task is not in my task list stays at the top level", () => {
  const entries = mergeHistoryEntries([], [task("x", "2026-11-20T08:00:00Z", { parent_room: { id: "gone", title: "Old" } })]);
  assert.deepEqual(titles(buildHistoryTree(entries, [])), ["E:x"]);
});

test("search keeps a task whose title matches with all its sub tasks, else only the matching sub tasks", () => {
  const entries = mergeHistoryEntries([], [
    task("c1", "2026-11-20T10:00:00Z", { title: "draw logo", parent_room: { id: "r1", title: "" } }),
    task("c2", "2026-11-20T09:00:00Z", { title: "write copy", parent_room: { id: "r1", title: "" } }),
    task("c3", "2026-11-20T08:00:00Z", { title: "budget", parent_room: { id: "r2", title: "" } }),
    task("s", "2026-11-20T07:00:00Z", { title: "logo ideas" }),
  ]);
  const rows = buildHistoryTree(entries, [room("r1", null, { title: "Launch" }), room("r2", null, { title: "Finance" })]);
  const titleHas = (q) => (value) => String(value || "").toLowerCase().includes(q);
  const search = (q) => titles(filterHistoryTree(rows, (r) => titleHas(q)(r.title), (e) => titleHas(q)(e.task.title)));
  assert.deepEqual(search("logo"), ["R:r1[c1]", "E:s"]);
  assert.deepEqual(search("finance"), ["R:r2[c3]"]);
  assert.deepEqual(search("nothing"), []);
});

test("the task holding the selected sub task is found (auto-expand)", () => {
  const entries = mergeHistoryEntries([], [task("c1", "2026-11-20T10:00:00Z", { parent_room: { id: "r1", title: "" } })]);
  const rows = buildHistoryTree(entries, [room("r1", null)]);
  const same = (entry, selection) => entry.id === selection;
  assert.equal(historyTreeRoomOfSelection(rows, "c1", same), "r1");
  assert.equal(historyTreeRoomOfSelection(rows, "zzz", same), null);
  assert.equal(historyTreeRoomOfSelection(rows, null, same), null);
});
