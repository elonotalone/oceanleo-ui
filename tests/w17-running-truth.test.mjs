import assert from "node:assert/strict";
import test from "node:test";
import { reduceRows } from "../src/acp/reduce.ts";

const row = (id, direction, value, at = "2026-11-09T10:00:00.000Z") => ({ id, direction, node_seq: direction === "agent" ? id : null, raw: JSON.stringify(value), received_at: at });
const update = (id, value) => row(id, "agent", { jsonrpc: "2.0", method: "session/update", params: { sessionId: "s", update: value } });

test("async task exit becomes ended/stale and never remains in the live strip", () => {
  const view = reduceRows([
    update(1, { sessionUpdate: "async_task_spawned", asyncTaskId: "a", taskType: "shell", name: "tests", canStop: true }),
    row(2, "agent", { oceanleo_acp: 1, exit: { code: 137 } }),
  ], "claude");
  assert.equal(view.backgroundTasks[0].state, "ended");
  assert.equal(view.backgroundTasks[0].backgroundState, "stale");
  assert.equal(view.backgroundTasks[0].canStop, false);
});

test("retry notice stays until model output makes progress", () => {
  const prompt = row(1, "client", { jsonrpc: "2.0", id: 1, method: "session/prompt", params: { sessionId: "s", prompt: [{ type: "text", text: "hi" }] } });
  const retry = update(2, { sessionUpdate: "notice", severity: "warning", title: "Model retrying", description: "reconnect" });
  const say = update(3, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hello" } });
  assert.equal(reduceRows([prompt, retry], "codex").retrying, true);
  assert.equal(reduceRows([prompt, retry, say], "codex").retrying, false);
});
