// TG-U1 (2026-11-07 thin gateway): ordered ACP rows → the view the task page renders.
// The page, not the gateway, decides what a turn is: a client `session/prompt` row is open until an agent response
// row with the same JSON-RPC id follows. Fixtures follow the ACP schema (SDK 1.8.0) and what claude-agent-acp 0.90 /
// codex-acp 2.2 emit; real captures are added by TG-V.
import assert from "node:assert/strict";
import test from "node:test";

import { reduceRows } from "../src/acp/reduce.ts";

function rows() {
  let id = 0;
  let seq = 0;
  const list = [];
  const add = (direction, value) => {
    id += 1;
    const row = {
      id,
      direction,
      node_seq: direction === "agent" ? ++seq : null,
      // Stored as TG-G1 stores them: the agent's message as written; node meta lines whole.
      raw: JSON.stringify(value),
      received_at: "2026-11-07T10:00:00Z",
    };
    list.push(row);
    return row;
  };
  const api = {
    list,
    prompt: (rpcId, text, sessionId = "s1") =>
      add("client", { jsonrpc: "2.0", id: rpcId, method: "session/prompt", params: { sessionId, prompt: [{ type: "text", text }] } }),
    request: (rpcId, method, params) => add("client", { jsonrpc: "2.0", id: rpcId, method, params }),
    cancel: (sessionId = "s1") => add("client", { jsonrpc: "2.0", method: "session/cancel", params: { sessionId } }),
    answer: (rpcId, result) => add("client", { jsonrpc: "2.0", id: rpcId, result }),
    clientError: (rpcId, error) => add("client", { jsonrpc: "2.0", id: rpcId, error }),
    update: (update, sessionId = "s1") => add("agent", { jsonrpc: "2.0", method: "session/update", params: { sessionId, update } }),
    say: (text, extra = {}) => api.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text }, ...extra }),
    think: (text) => api.update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text } }),
    done: (rpcId, stopReason = "end_turn") => add("agent", { jsonrpc: "2.0", id: rpcId, result: { stopReason } }),
    result: (rpcId, result) => add("agent", { jsonrpc: "2.0", id: rpcId, result }),
    error: (rpcId, error) => add("agent", { jsonrpc: "2.0", id: rpcId, error }),
    ask: (rpcId, method, params) => add("agent", { jsonrpc: "2.0", id: rpcId, method, params }),
    permission: (rpcId, toolCallId = "t1") =>
      api.ask(rpcId, "session/request_permission", {
        sessionId: "s1",
        toolCall: { toolCallId, title: "Run ls" },
        options: [
          { optionId: "allow", name: "Allow", kind: "allow_once" },
          { optionId: "deny", name: "Deny", kind: "reject_once" },
        ],
      }),
    meta: (line) => add("agent", { oceanleo_acp: 1, seq: seq + 1, ...line }),
  };
  return api;
}

const kinds = (items) => items.map((item) => item.type);

test("no rows: an empty view", () => {
  const view = reduceRows([]);
  assert.deepEqual(view.turns, []);
  assert.deepEqual(view.preamble, []);
  assert.equal(view.open, false);
  assert.deepEqual(view.pending, []);
});

test("a prompt without a response is an open turn; the response closes it with its stopReason", () => {
  const r = rows();
  r.prompt(1, "hi");
  r.say("Hel");
  let view = reduceRows(r.list);
  assert.equal(view.turns.length, 1);
  assert.equal(view.turns[0].text, "hi");
  assert.equal(view.turns[0].open, true);
  assert.equal(view.open, true);
  r.say("lo");
  r.done(1);
  view = reduceRows(r.list);
  assert.equal(view.turns[0].open, false);
  assert.equal(view.turns[0].stopReason, "end_turn");
  assert.equal(view.open, false);
  assert.deepEqual(kinds(view.turns[0].items), ["message"]);
  assert.equal(view.turns[0].items[0].text, "Hello");
  assert.deepEqual(view.turns[0].items[0].rowIds, [2, 3]);
});

test("a prompt error response is kept verbatim and closes the turn", () => {
  const r = rows();
  r.prompt(1, "hi");
  r.error(1, { code: -32603, message: "Internal error", data: { details: "boom" } });
  const turn = reduceRows(r.list).turns[0];
  assert.equal(turn.open, false);
  assert.deepEqual(turn.error, { code: -32603, message: "Internal error", data: { details: "boom" } });
  assert.equal(turn.stopReason, null);
});

test("chunks join until something else is said; a new messageId starts a new message", () => {
  const r = rows();
  r.prompt(1, "go");
  r.think("let me ");
  r.think("look");
  r.say("A", { messageId: "m1" });
  r.say("B", { messageId: "m1" });
  r.update({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Read a.ts", kind: "read", status: "pending" });
  r.say("C", { messageId: "m2" });
  r.say("D", { messageId: "m3" });
  const items = reduceRows(r.list).turns[0].items;
  assert.deepEqual(kinds(items), ["thought", "message", "tool", "message", "message"]);
  assert.equal(items[0].text, "let me look");
  assert.equal(items[1].text, "AB");
  assert.equal(items[3].text, "C");
  assert.equal(items[4].text, "D");
});

test("a tool call collects its updates in place: status, replaced content and locations, raw input/output", () => {
  const r = rows();
  r.prompt(1, "edit");
  r.update({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Edit", kind: "edit", status: "pending", rawInput: { path: "/a.ts" } });
  r.say("working");
  r.update({ sessionUpdate: "tool_call_update", toolCallId: "t1", status: "in_progress", locations: [{ path: "/a.ts", line: 3 }] });
  r.update({
    sessionUpdate: "tool_call_update",
    toolCallId: "t1",
    status: "completed",
    title: "Edit a.ts",
    content: [{ type: "diff", path: "/a.ts", oldText: "a", newText: "b" }],
    rawOutput: "ok",
  });
  r.update({ sessionUpdate: "tool_call_update", toolCallId: "t2", status: "failed", title: "Bash" });
  const items = reduceRows(r.list).turns[0].items;
  assert.deepEqual(kinds(items), ["tool", "message", "tool"]);
  const tool = items[0].tool;
  assert.equal(tool.status, "completed");
  assert.equal(tool.title, "Edit a.ts");
  assert.equal(tool.kind, "edit");
  assert.deepEqual(tool.content, [{ type: "diff", path: "/a.ts", oldText: "a", newText: "b" }]);
  assert.deepEqual(tool.locations, [{ path: "/a.ts", line: 3 }]);
  assert.deepEqual(tool.rawInput, { path: "/a.ts" });
  assert.equal(tool.rawOutput, "ok");
  assert.deepEqual(tool.rowIds, [2, 4, 5]);
  // An update for a call never announced still shows the step.
  assert.equal(items[2].tool.id, "t2");
  assert.equal(items[2].tool.status, "failed");
});

test("permission: pending on every reduce until a client response row with its id, then answered with that result", () => {
  const r = rows();
  r.prompt(1, "ls");
  r.update({ sessionUpdate: "tool_call", toolCallId: "t1", title: "ls -la", kind: "execute", status: "pending" });
  r.permission(7);
  let view = reduceRows(r.list);
  assert.equal(view.pending.length, 1);
  const card = view.turns[0].items.find((item) => item.type === "request").request;
  assert.equal(card.requestId, 7);
  assert.equal(card.state, "pending");
  assert.deepEqual(card.options.map((o) => o.optionId), ["allow", "deny"]);
  assert.equal(card.toolCall.title, "Run ls", "the request's own tool title wins over the earlier one");
  assert.equal(card.toolCall.kind, "execute", "fields the request does not carry come from the tool call");
  // Hours later, still pending — nothing on the page times it out.
  r.say("still waiting");
  view = reduceRows(r.list);
  assert.equal(view.pending.length, 1);
  r.answer(7, { outcome: { outcome: "selected", optionId: "allow" } });
  view = reduceRows(r.list);
  assert.deepEqual(view.pending, []);
  const answered = view.turns[0].items.find((item) => item.type === "request").request;
  assert.equal(answered.state, "answered");
  assert.deepEqual(answered.result, { outcome: { outcome: "selected", optionId: "allow" } });
  assert.equal(answered.answerRowId, r.list[r.list.length - 1].id);
});

test("the same request id delivered twice while pending is one card; a reused id after the answer is a new request", () => {
  const r = rows();
  r.prompt(1, "x");
  r.permission(7);
  r.permission(7);
  let view = reduceRows(r.list);
  assert.equal(view.turns[0].items.filter((item) => item.type === "request").length, 1);
  r.answer(7, { outcome: { outcome: "cancelled" } });
  r.permission(7, "t9");
  view = reduceRows(r.list);
  const cards = view.turns[0].items.filter((item) => item.type === "request").map((item) => item.request);
  assert.deepEqual(cards.map((card) => card.state), ["answered", "pending"]);
  assert.equal(view.pending.length, 1);
});

test("fs/terminal requests answered by the gateway's method-not-found are answered with that error", () => {
  const r = rows();
  r.prompt(1, "x");
  r.ask("r1", "fs/read_text_file", { sessionId: "s1", path: "/a" });
  r.clientError("r1", { code: -32601, message: "Method not found" });
  const view = reduceRows(r.list);
  const request = view.turns[0].items[0].request;
  assert.equal(request.state, "answered");
  assert.deepEqual(request.error, { code: -32601, message: "Method not found" });
  assert.deepEqual(view.pending, []);
});

test("gap and oversize rows are items where they arrived", () => {
  const r = rows();
  r.prompt(1, "big");
  r.say("a");
  r.meta({ gap: { from: 4, to: 6, count: 3 } });
  r.say("b");
  r.meta({ oversize: { bytes: 3000000 } });
  const items = reduceRows(r.list).turns[0].items;
  assert.deepEqual(kinds(items), ["message", "gap", "message", "oversize"]);
  assert.equal(items[1].count, 3);
  assert.equal(items[3].bytes, 3000000);
});

test("exit: open turns and unanswered requests end; a later prompt starts over", () => {
  const r = rows();
  r.prompt(1, "x");
  r.permission(7);
  r.meta({ exit: { code: 137, signal: "killed" } });
  let view = reduceRows(r.list);
  assert.equal(view.turns[0].open, false);
  assert.equal(view.turns[0].exited, true);
  assert.equal(view.open, false);
  assert.deepEqual(view.pending, []);
  assert.equal(view.turns[0].items.find((item) => item.type === "request").request.state, "ended");
  assert.deepEqual(view.exited, { code: 137, signal: "killed" });
  assert.equal(view.turns[0].items[view.turns[0].items.length - 1].type, "exit");
  // The adapter after a restart reuses ids from 0/1: they answer the new requests, not the ended ones.
  r.prompt(1, "again");
  r.done(1);
  view = reduceRows(r.list);
  assert.equal(view.exited, null);
  assert.equal(view.turns[1].open, false);
  assert.equal(view.turns[1].stopReason, "end_turn");
  assert.equal(view.turns[0].stopReason, null);
});

test("a response answers the latest earlier request with its id (ids restart after a gateway restart)", () => {
  const r = rows();
  r.prompt(1, "first");
  r.done(1);
  r.prompt(1, "second");
  let view = reduceRows(r.list);
  assert.deepEqual(view.turns.map((turn) => turn.open), [false, true]);
  r.done(1, "cancelled");
  view = reduceRows(r.list);
  assert.deepEqual(view.turns.map((turn) => turn.stopReason), ["end_turn", "cancelled"]);
});

test("Claude Code / Codex queue a prompt sent during a turn: output goes to the oldest open turn", () => {
  const r = rows();
  r.prompt(1, "first");
  r.prompt(2, "second");
  r.say("for first");
  r.done(1);
  r.say("for second");
  r.done(2);
  const view = reduceRows(r.list, "claude");
  assert.equal(view.turns[0].items[0].text, "for first");
  assert.equal(view.turns[1].items[0].text, "for second");
});

test("Cursor replaces the running prompt: output after the new prompt goes to the newest open turn", () => {
  const r = rows();
  r.prompt(1, "first");
  r.say("old");
  r.prompt(2, "instead");
  r.say("new");
  r.done(1, "cancelled");
  r.say(" more");
  const view = reduceRows(r.list, "cursor");
  assert.equal(view.turns[0].items[0].text, "old");
  assert.equal(view.turns[0].stopReason, "cancelled");
  assert.equal(view.turns[1].items[0].text, "new more");
  assert.equal(view.turns[1].open, true);
});

test("Hermes: its redirect/queue acknowledgement is a notice on the newest prompt, not reply text", () => {
  const r = rows();
  r.prompt(1, "first");
  r.say("working on it");
  r.prompt(2, "correction");
  r.say("Redirected the active turn with your correction.");
  r.done(2);
  r.prompt(3, "later");
  r.say("Queued for the next turn. (1 queued)");
  const view = reduceRows(r.list, "hermes");
  assert.deepEqual(kinds(view.turns[0].items), ["message"]);
  assert.equal(view.turns[0].items[0].text, "working on it");
  assert.deepEqual(kinds(view.turns[1].items), ["notice"]);
  assert.equal(view.turns[1].items[0].title, "Redirected the active turn with your correction.");
  assert.equal(view.turns[2].items[0].title, "Queued for the next turn. (1 queued)");
  // Other programs: the same words are just words.
  assert.equal(reduceRows(r.list, "claude").turns[0].items.some((item) => item.type === "notice"), false);
});

test("Codex: thread status from session_info_update._meta.codex is the view's activity", () => {
  const r = rows();
  r.prompt(1, "goal");
  r.done(1);
  r.update({ sessionUpdate: "session_info_update", _meta: { codex: { threadStatus: { type: "active", activeFlags: [] } } } });
  assert.equal(reduceRows(r.list, "codex").activity, "active");
  r.update({ sessionUpdate: "session_info_update", title: "Fix bug", _meta: { codex: { threadStatus: { type: "idle" } } } });
  const view = reduceRows(r.list, "codex");
  assert.equal(view.activity, "idle");
  assert.equal(view.title, "Fix bug");
});

test("Stop: a client session/cancel row marks the open turn; the turn stays open until the agent answers", () => {
  const r = rows();
  r.prompt(1, "long");
  r.cancel();
  let view = reduceRows(r.list);
  assert.equal(view.turns[0].cancelRequested, true);
  assert.equal(view.turns[0].open, true);
  r.done(1, "cancelled");
  view = reduceRows(r.list);
  assert.equal(view.turns[0].open, false);
  assert.equal(view.turns[0].stopReason, "cancelled");
});

test("session/new result, set_model / set_mode / set_config_option results and mode updates", () => {
  const r = rows();
  r.request(1, "session/new", { cwd: "/w", mcpServers: [] });
  r.result(1, {
    sessionId: "s1",
    modes: { currentModeId: "default", availableModes: [{ id: "default", name: "Default" }, { id: "plan", name: "Plan" }] },
    models: { currentModelId: "sonnet", availableModels: [{ modelId: "sonnet", name: "Sonnet" }, { modelId: "opus", name: "Opus" }] },
    configOptions: [{ id: "effort", name: "Effort", currentValue: "high" }],
  });
  let view = reduceRows(r.list);
  assert.equal(view.modelId, "sonnet");
  assert.equal(view.modeId, "default");
  assert.equal(view.models.length, 2);
  assert.equal(view.modes.length, 2);
  assert.equal(view.configOptions[0].currentValue, "high");
  r.request(2, "session/set_model", { sessionId: "s1", modelId: "opus" });
  r.result(2, {});
  r.request(3, "session/set_mode", { sessionId: "s1", modeId: "plan" });
  r.result(3, null);
  r.request(4, "session/set_config_option", { sessionId: "s1", configId: "effort", value: "max" });
  r.result(4, { configOptions: [{ id: "effort", name: "Effort", currentValue: "max" }] });
  view = reduceRows(r.list);
  assert.equal(view.modelId, "opus");
  assert.equal(view.modeId, "plan");
  assert.equal(view.configOptions[0].currentValue, "max");
  r.update({ sessionUpdate: "current_mode_update", currentModeId: "default" });
  r.update({ sessionUpdate: "config_option_update", configOptions: [{ id: "effort", name: "Effort", currentValue: "low" }] });
  view = reduceRows(r.list);
  assert.equal(view.modeId, "default");
  assert.equal(view.configOptions[0].currentValue, "low");
  assert.deepEqual(view.turns, []);
});

test("a refused setting is an error item with the agent's own words, and the model stays", () => {
  const r = rows();
  r.request(1, "session/set_model", { sessionId: "s1", modelId: "gpt-x" });
  r.error(1, { code: -32602, message: "Invalid params", data: "model gpt-x is not available" });
  const view = reduceRows(r.list, "codex");
  assert.equal(view.modelId, null);
  assert.deepEqual(kinds(view.preamble), ["error"]);
  assert.equal(view.preamble[0].method, "session/set_model");
  assert.deepEqual(view.preamble[0].error, { code: -32602, message: "Invalid params", data: "model gpt-x is not available" });
});

test("plan, usage, commands and notices", () => {
  const r = rows();
  r.update({ sessionUpdate: "available_commands_update", availableCommands: [{ name: "init", description: "Init" }] });
  r.prompt(1, "plan it");
  r.update({ sessionUpdate: "plan", entries: [{ content: "a", priority: "high", status: "pending" }] });
  r.update({ sessionUpdate: "plan", entries: [{ content: "a", priority: "high", status: "completed" }] });
  r.update({ sessionUpdate: "usage_update", used: 50, size: 200, cost: { amount: 0.1, currency: "USD" } });
  r.update({ sessionUpdate: "notice", severity: "warning", title: "Rate limited", description: "retry in 5s" });
  const view = reduceRows(r.list);
  assert.equal(view.commands[0].name, "init");
  assert.deepEqual(kinds(view.turns[0].items), ["plan", "plan", "notice"]);
  assert.equal(view.plan[0].status, "completed");
  assert.deepEqual(view.usage, { used: 50, size: 200, cost: { amount: 0.1, currency: "USD" } });
  assert.equal(view.turns[0].items[2].title, "Rate limited");
  assert.equal(view.turns[0].items[2].description, "retry in 5s");
});

test("Claude background tasks merge spawned / progress / state updates by asyncTaskId", () => {
  const r = rows();
  r.prompt(1, "build in background");
  r.update({ sessionUpdate: "async_task_spawned", asyncTaskId: "bg1", name: "Bash", taskType: "local_bash", description: "npm run build", canStop: true, toolCallId: "t1" });
  r.update({ sessionUpdate: "async_task_progress", asyncTaskId: "bg1", summary: "compiling", lastToolName: "Bash" });
  let task = reduceRows(r.list).backgroundTasks[0];
  assert.deepEqual(
    [task.id, task.state, task.canStop, task.description, task.summary, task.toolCallId],
    ["bg1", "running", true, "npm run build", "compiling", "t1"],
  );
  r.update({ sessionUpdate: "async_task_state_update", asyncTaskId: "bg1", state: "stopped" });
  task = reduceRows(r.list).backgroundTasks[0];
  assert.equal(task.state, "stopped");
  assert.equal(reduceRows(r.list).backgroundTasks.length, 1);
});

test("a sub-agent's words never join the main reply; its tool steps name their parent", () => {
  const r = rows();
  r.prompt(1, "research");
  r.update({ sessionUpdate: "tool_call", toolCallId: "task1", title: "Task: research", kind: "think", status: "in_progress" });
  r.say("main ");
  r.say("sub says", { _meta: { claudeCode: { parentToolUseId: "task1" } } });
  r.update({ sessionUpdate: "tool_call", toolCallId: "t2", title: "Grep", kind: "search", status: "completed", _meta: { claudeCode: { parentToolUseId: "task1", toolName: "Grep" } } });
  r.say("reply");
  r.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "child session" } }, "child-1");
  const items = reduceRows(r.list).turns[0].items;
  assert.deepEqual(kinds(items), ["tool", "message", "message", "tool", "message", "message"]);
  assert.deepEqual(items.filter((item) => item.type === "message").map((item) => [item.text, item.scope]), [
    ["main ", ""],
    ["sub says", "tool:task1"],
    ["reply", ""],
    ["child session", "session:child-1"],
  ]);
  assert.equal(items[3].tool.parentId, "task1");
});

test("updates before the first prompt are the preamble; rows out of order or delivered twice give the same view", () => {
  const r = rows();
  r.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "replayed" } });
  r.prompt(1, "hi");
  r.say("yo");
  r.done(1);
  const view = reduceRows(r.list);
  assert.deepEqual(kinds(view.preamble), ["message"]);
  assert.equal(view.preamble[0].text, "replayed");
  const shuffled = [r.list[3], r.list[1], r.list[0], r.list[2], r.list[1]];
  assert.deepEqual(reduceRows(shuffled), view);
});

test("rows between a client session/load and its response are a history replay and render nothing", () => {
  const r = rows();
  r.prompt(1, "first");
  r.say("answer");
  r.done(1);
  r.meta({ exit: { code: 0, signal: "" } });
  // Re-launch on a new session row: the agent replays the conversation before answering session/load.
  r.request(2, "session/load", { sessionId: "s1", cwd: "/w", mcpServers: [] });
  r.update({ sessionUpdate: "user_message_chunk", content: { type: "text", text: "first" } });
  r.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "answer" } });
  r.update({ sessionUpdate: "tool_call", toolCallId: "old", title: "Read", status: "completed" });
  r.update({ sessionUpdate: "subagent_spawned", subagentSessionId: "c1" });
  r.result(2, { modes: { currentModeId: "plan", availableModes: [] } });
  r.prompt(3, "second");
  r.say("new answer");
  const view = reduceRows(r.list);
  assert.deepEqual(kinds(view.turns[0].items), ["message", "exit"]);
  assert.equal(view.modeId, "plan", "the load result itself still counts");
  assert.equal(view.turns.length, 2);
  assert.deepEqual(kinds(view.turns[1].items), ["message"]);
  assert.equal(view.turns[1].items[0].text, "new answer");
});

test("unknown rows are kept as items with their raw row", () => {
  const r = rows();
  r.prompt(1, "x");
  r.update({ sessionUpdate: "subagent_spawned", subagentSessionId: "c1" });
  const broken = { id: 50, direction: "agent", node_seq: 99, raw: "garbage", received_at: "" };
  const items = reduceRows([...r.list, broken]).turns[0].items;
  assert.deepEqual(items.map((item) => [item.type, item.reason]), [["unknown", "unknown_update"], ["unknown", "not_json"]]);
  assert.equal(items[1].row, broken);
});
