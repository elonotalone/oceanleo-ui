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

test("a notice reports retrying and resumed output clears it, without vendor metadata", () => {
  const notice = { sessionUpdate: "notice", severity: "warning", title: "Reconnecting", description: "Retrying the stream" };
  assert.equal(reduceRows(frames([notice])).retrying, true);
  assert.equal(reduceRows(frames([notice, chunk("back")])).retrying, false);
  assert.equal(reduceRows(frames([info({ codex: { error: { willRetry: true } } })])).retrying, false);
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
