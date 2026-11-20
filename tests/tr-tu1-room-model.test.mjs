// TU1 (task rooms wave 2026-11-20): what a card says about a sub task, who may open or send to it,
// the default message selection (rule 3) and the "Given to …" marks; plus the multi-select bar slot
// other code uses, and how a child is opened from anywhere.
import assert from "node:assert/strict";
import test from "node:test";
import { compileModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";
for (const key of ["CustomEvent", "Event"]) globalThis[key] = window[key];

const model = await import(await compileModule("src/shell/task-room/room-model.ts"));
const slots = await import(await compileModule("src/shell/messages/conversation/selection-actions.ts"));
const child = await import(await compileModule("src/shell/task-room/open-child.ts"));
const extras = await import(await compileModule("src/shell/task-room/composer-extras.ts"));

const sub = (id, extra = {}) => ({ kind: "agent_task", id, title: `T ${id}`, card_message_id: null, mode: "view", owner: { id: "u1", name: "Ann" }, program: "codex", status: null, updated_at: "", my_access: "view", ...extra });

test("card status: four words a person reads, nothing for a task without a run", () => {
  assert.equal(model.taskCardStatus("working"), "working");
  assert.equal(model.taskCardStatus("waiting"), "waiting");
  assert.equal(model.taskCardStatus("idle"), "done");
  assert.equal(model.taskCardStatus("closed"), "done");
  assert.equal(model.taskCardStatus("failed"), "failed");
  assert.equal(model.taskCardStatus(null), null);
  assert.equal(model.taskCardStatus(undefined), null);
  assert.equal(model.taskCardStatus("unknown_new_state"), null);
});

test("access: no access cannot open; only owner / collaborate can receive a follow-up", () => {
  assert.equal(model.canOpenChild("none"), false);
  for (const access of ["owner", "collaborate", "view"]) assert.equal(model.canOpenChild(access), true);
  const children = [sub("a", { my_access: "owner" }), sub("b", { my_access: "collaborate" }), sub("c", { my_access: "view" }), sub("d", { my_access: "none" }), { ...sub("r", { my_access: "owner" }), kind: "room" }];
  assert.deepEqual(model.sendableSubTasks(children).map((c) => c.id), ["a", "b"]);
  assert.deepEqual(model.readableSubTasks(children).map((c) => c.id), ["a", "b", "c"]);
});

test("sub task label: '<program> · <title>'", () => {
  assert.equal(model.subTaskLabel({ program: "claude", title: "Fix login" }), "Claude Code · Fix login");
  assert.equal(model.subTaskLabel({ program: null, title: "Fix login" }), "Fix login");
  assert.equal(model.subTaskLabel({ program: "newbot", title: "X" }), "newbot · X");
});

test("default selection: what the person picked wins, else the server's default for the target, else unknown", () => {
  assert.deepEqual(model.summonSelection(["m2"], { default_message_ids: ["m1", "m2", "m3"] }), ["m2"]);
  assert.deepEqual(model.summonSelection(null, { default_message_ids: ["m1", "m2", "m3"] }), ["m1", "m2", "m3"]);
  assert.deepEqual(model.summonSelection([], { default_message_ids: ["m1"] }), [], "an explicit empty pick stays empty");
  assert.equal(model.summonSelection(null, null), null);
});

test("'Given to' marks: every handoff's messages, oldest first, unknown sub tasks skipped, no repeats", () => {
  const handoffs = [
    { id: "h2", agent_task_id: "b", sender: { id: "u", name: "U" }, message_ids: ["m2", "m3"], created_at: "2026-11-20T10:05:00Z" },
    { id: "h1", agent_task_id: "a", sender: { id: "u", name: "U" }, message_ids: ["m1", "m2"], created_at: "2026-11-20T10:00:00Z" },
    { id: "h3", agent_task_id: "gone", sender: { id: "u", name: "U" }, message_ids: ["m4"], created_at: "2026-11-20T10:06:00Z" },
    { id: "h4", agent_task_id: "a", sender: { id: "u", name: "U" }, message_ids: ["m2"], created_at: "2026-11-20T10:07:00Z" },
  ];
  assert.deepEqual(model.handoffTitles(handoffs, [sub("a"), sub("b")]), { m1: ["T a"], m2: ["T a", "T b"], m3: ["T b"] });
});

test("selection bar slot: registered actions skip task rooms by default, own actions first by order, re-register replaces", () => {
  const A = () => null, B = () => null, C = () => null, D = () => null;
  const offA = slots.registerMessageSelectionAction({ id: "x.a", Component: A });
  const offB = slots.registerMessageSelectionAction({ id: "x.b", order: -5, Component: B, appliesTo: () => true });
  slots.registerMessageSelectionAction({ id: "x.a", Component: D });
  try {
    assert.deepEqual(slots.registeredSelectionActions().map((a) => [a.id, a.Component]), [["x.b", B], ["x.a", D]], "same id replaces");
    const group = { kind: "group" }, task = { kind: "task" };
    const own = [{ id: "own", order: -10, Component: C }];
    const regs = slots.registeredSelectionActions();
    assert.deepEqual(slots.selectionActionsFor(regs, own, group).map((a) => a.id), ["own", "x.b", "x.a"]);
    assert.deepEqual(slots.selectionActionsFor(regs, own, task).map((a) => a.id), ["own", "x.b"], "default appliesTo hides it in a task");
    assert.deepEqual(slots.selectionActionsFor(regs, [{ id: "x.a", order: 1, Component: C }], group).map((a) => a.id), ["x.b", "x.a"]);
    assert.equal(slots.selectionActionsFor(regs, [{ id: "x.a", order: 1, Component: C }], group)[1].Component, C, "the host's own action wins over a registered one with the same id");
  } finally {
    offA(); offB();
  }
  assert.deepEqual(slots.registeredSelectionActions().map((a) => a.id), ["x.a"], "an unregister of a replaced action leaves the replacement");
});

test("openTaskChild: a cancelable request; true only when a listener took it; never navigates", () => {
  const seen = [];
  const take = (event) => { seen.push(event.detail); event.preventDefault(); };
  assert.equal(child.openTaskChild({ kind: "agent_task", id: "t1", title: "A" }), false, "nobody listening");
  window.addEventListener(child.OPEN_TASK_CHILD_EVENT, take);
  try {
    assert.equal(child.OPEN_TASK_CHILD_EVENT, "oceanleo:open-task-child");
    assert.equal(child.openTaskChild({ kind: "room", id: "r1", title: "B", extra: 1 }), true);
    assert.deepEqual(seen, [{ kind: "room", id: "r1", title: "B" }]);
  } finally { window.removeEventListener(child.OPEN_TASK_CHILD_EVENT, take); }
  assert.equal(child.taskChildHref({ kind: "agent_task", id: "a b" }), "/tasks/a%20b");
  assert.equal(child.taskChildHref({ kind: "room", id: "r1" }), null);
});

test("@ list extras: filtered by the typed words, case-insensitive", () => {
  const rows = [{ key: "new", label: "New agent task…", onPick() {} }, { key: "t1", label: "Codex · Fix login", onPick() {} }];
  assert.deepEqual(extras.filterExtraMentions(rows, "").map((r) => r.key), ["new", "t1"]);
  assert.deepEqual(extras.filterExtraMentions(rows, "codex").map((r) => r.key), ["t1"]);
  assert.deepEqual(extras.filterExtraMentions(rows, "AGENT").map((r) => r.key), ["new"]);
});
