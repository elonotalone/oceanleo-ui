// Works-wave phase 2: the page says when Codex is retrying its model stream (C10, codex-acp 2.5.0), and a background
// task the gateway knows ended with its session is never shown as running (W17 projection over the reduced view).
import assert from "node:assert/strict";
import test from "node:test";

import { reduceRows } from "../src/acp/reduce.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { withTaskActivity } = await import(await compileModule("src/shell/acp-task/useTaskActivity.ts", {
  "../../lib/acp-frames-api": dataModule("export async function request() { throw new Error('not in this test'); }"),
}));

function frames(updates) {
  const list = [];
  let id = 0;
  const add = (direction, value) => list.push({ id: ++id, direction, node_seq: direction === "agent" ? id : null,
    raw: JSON.stringify(value), received_at: "2026-11-09T12:00:00Z" });
  add("client", { jsonrpc: "2.0", id: 7, method: "session/prompt", params: { sessionId: "s1", prompt: [{ type: "text", text: "go" }] } });
  for (const update of updates) add("agent", { jsonrpc: "2.0", method: "session/update", params: { sessionId: "s1", update } });
  return list;
}

const info = (meta) => ({ sessionUpdate: "session_info_update", _meta: meta });
const chunk = (text) => ({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } });

test("older codex-acp clients: _meta.codex.error.willRetry marks retrying until output resumes", () => {
  const retrying = reduceRows(frames([info({ codex: { error: { message: "stream disconnected", willRetry: true } } })]), "codex");
  assert.equal(retrying.retrying, true);
  const resumed = reduceRows(frames([info({ codex: { error: { message: "x", willRetry: true } } }), chunk("back")]), "codex");
  assert.equal(resumed.retrying, false);
  const gaveUp = reduceRows(frames([info({ codex: { error: { message: "x", willRetry: false } } })]), "codex");
  assert.equal(gaveUp.retrying, false);
});

test("typed AIR clients: sessionFailure warning = retrying; error or null clears it", () => {
  const air = (sessionFailure) => info({ jetbrains: { air: { version: 1, sessionFailure } } });
  assert.equal(reduceRows(frames([air({ id: "f1", severity: "warning", title: "Reconnecting" })]), "codex").retrying, true);
  assert.equal(reduceRows(frames([air({ id: "f1", severity: "warning" }), air(null)]), "codex").retrying, false);
  assert.equal(reduceRows(frames([air({ id: "f1", severity: "warning" }), air({ id: "f2", severity: "error" })]), "codex").retrying, false);
  assert.equal(reduceRows(frames([info({ jetbrains: { air: { version: 1 } } })]), "codex").retrying, false);
});

test("the projection marks tasks it knows ended; others stay as the frames say", () => {
  const view = { backgroundTasks: [
    { id: "a", state: "running", canStop: true },
    { id: "b", state: "running", canStop: true },
    { id: "c", state: "running", canStop: true },
  ] };
  const activity = { background_tasks: [{ id: "a", state: "stale" }, { id: "b", state: "unknown" }, { id: "x", state: "stale" }] };
  const out = withTaskActivity(view, activity);
  assert.deepEqual(out.backgroundTasks.map((task) => [task.id, task.backgroundState ?? null, task.canStop]),
    [["a", "stale", false], ["b", "unknown", false], ["c", null, true]]);
  assert.equal(withTaskActivity(view, null), view);
  assert.equal(withTaskActivity(view, { background_tasks: [{ id: "a", state: "running" }] }), view);
});
