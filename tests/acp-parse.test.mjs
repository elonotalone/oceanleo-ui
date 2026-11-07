// TG-U1 (2026-11-07 thin gateway): one stored ACP row → one typed event, nothing dropped or repaired.
import assert from "node:assert/strict";
import test from "node:test";

import { parseRow } from "../src/acp/parse.ts";

let nextId = 1;
// Agent rows hold the agent's JSON-RPC message as written; only node meta lines carry `oceanleo_acp` (TG-G1 storage).
const agent = (message) => ({ id: nextId++, direction: "agent", node_seq: nextId, raw: JSON.stringify(message), received_at: "2026-11-07T10:00:00Z" });
const meta = (line) => ({ id: nextId++, direction: "agent", node_seq: nextId, raw: JSON.stringify({ oceanleo_acp: 1, seq: nextId, ...line }), received_at: "" });
const client = (message) => ({ id: nextId++, direction: "client", node_seq: null, raw: JSON.stringify(message), received_at: "" });
const update = (u, sessionId = "s1") => agent({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: u } });

test("every session/update kind the adapters emit is typed", () => {
  const kinds = [
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "a" } },
    { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "t" } },
    { sessionUpdate: "user_message_chunk", content: { type: "text", text: "u" } },
    { sessionUpdate: "tool_call", toolCallId: "t1", title: "Read", kind: "read", status: "pending" },
    { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" },
    { sessionUpdate: "plan", entries: [{ content: "x", priority: "high", status: "pending" }] },
    { sessionUpdate: "available_commands_update", availableCommands: [{ name: "init", description: "d" }] },
    { sessionUpdate: "current_mode_update", currentModeId: "plan" },
    { sessionUpdate: "config_option_update", configOptions: [{ id: "effort", name: "Effort" }] },
    { sessionUpdate: "session_info_update", title: "T" },
    { sessionUpdate: "usage_update", used: 10, size: 100 },
    { sessionUpdate: "notice", severity: "warning", title: "W" },
    { sessionUpdate: "async_task_spawned", asyncTaskId: "bg1", canStop: true },
    { sessionUpdate: "async_task_progress", asyncTaskId: "bg1", summary: "half" },
    { sessionUpdate: "async_task_state_update", asyncTaskId: "bg1", state: "completed" },
  ];
  for (const u of kinds) {
    const event = parseRow(update(u));
    assert.equal(event.kind, "update", u.sessionUpdate);
    assert.equal(event.sessionId, "s1");
    assert.deepEqual(event.update, u);
  }
});

test("an unknown sessionUpdate is kept with its fields", () => {
  const event = parseRow(update({ sessionUpdate: "subagent_spawned", subagentSessionId: "c1" }));
  assert.equal(event.kind, "unknown_update");
  assert.equal(event.sessionUpdate, "subagent_spawned");
  assert.equal(event.update.subagentSessionId, "c1");
});

test("agent requests, responses and other notifications", () => {
  const permission = parseRow(agent({ jsonrpc: "2.0", id: 7, method: "session/request_permission", params: { sessionId: "s1", options: [] } }));
  assert.equal(permission.kind, "agent_request");
  assert.equal(permission.id, 7);
  assert.equal(permission.method, "session/request_permission");
  const fs = parseRow(agent({ jsonrpc: "2.0", id: "r-1", method: "fs/read_text_file", params: { path: "/a" } }));
  assert.equal(fs.kind, "agent_request");
  assert.equal(fs.id, "r-1");
  const done = parseRow(agent({ jsonrpc: "2.0", id: 1, result: { stopReason: "end_turn" } }));
  assert.equal(done.kind, "agent_response");
  assert.deepEqual(done.result, { stopReason: "end_turn" });
  const failed = parseRow(agent({ jsonrpc: "2.0", id: 2, error: { code: -32602, message: "bad model", data: { allowed: ["a"] } } }));
  assert.equal(failed.kind, "agent_response");
  assert.deepEqual(failed.error, { code: -32602, message: "bad model", data: { allowed: ["a"] } });
  const note = parseRow(agent({ jsonrpc: "2.0", method: "_claude/notice", params: { x: 1 } }));
  assert.equal(note.kind, "agent_notification");
  assert.equal(note.method, "_claude/notice");
});

test("client rows: prompt, other requests, cancel, answers", () => {
  const prompt = parseRow(client({ jsonrpc: "2.0", id: 3, method: "session/prompt", params: { sessionId: "s1", prompt: [{ type: "text", text: "hi" }, { type: "resource_link", uri: "file:///a.png", name: "a.png" }] } }));
  assert.equal(prompt.kind, "prompt");
  assert.equal(prompt.sessionId, "s1");
  assert.equal(prompt.prompt.length, 2);
  const setModel = parseRow(client({ jsonrpc: "2.0", id: 4, method: "session/set_model", params: { sessionId: "s1", modelId: "opus" } }));
  assert.equal(setModel.kind, "client_request");
  assert.equal(setModel.method, "session/set_model");
  const close = parseRow(client({ jsonrpc: "2.0", id: 5, method: "session/close", params: { sessionId: "s1" } }));
  assert.equal(close.kind, "client_request");
  const cancel = parseRow(client({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: "s1" } }));
  assert.equal(cancel.kind, "client_notification");
  assert.equal(cancel.method, "session/cancel");
  const answer = parseRow(client({ jsonrpc: "2.0", id: 7, result: { outcome: { outcome: "selected", optionId: "allow" } } }));
  assert.equal(answer.kind, "client_response");
  assert.deepEqual(answer.result, { outcome: { outcome: "selected", optionId: "allow" } });
  const notFound = parseRow(client({ jsonrpc: "2.0", id: "r-1", error: { code: -32601, message: "Method not found" } }));
  assert.equal(notFound.kind, "client_response");
  assert.equal(notFound.error.code, -32601);
});

test("node meta lines: gap, exit, oversize", () => {
  const gap = parseRow(meta({ gap: { from: 10, to: 14, count: 5 } }));
  assert.deepEqual([gap.kind, gap.from, gap.to, gap.count], ["gap", 10, 14, 5]);
  const exit = parseRow(meta({ exit: { code: 0, signal: "" } }));
  assert.deepEqual([exit.kind, exit.code, exit.signal], ["exit", 0, null]);
  const killed = parseRow(meta({ exit: { code: null, signal: "killed" } }));
  assert.deepEqual([killed.code, killed.signal], [null, "killed"]);
  assert.equal(parseRow(meta({ exit: { code: null, signal: 9 } })).signal, "9");
  const big = parseRow(meta({ oversize: { bytes: 3145728 } }));
  assert.deepEqual([big.kind, big.bytes], ["oversize", 3145728]);
});

test("unreadable rows are unknown and keep the row", () => {
  const broken = { id: 99, direction: "agent", node_seq: 1, raw: "{not json", received_at: "" };
  const event = parseRow(broken);
  assert.equal(event.kind, "unknown");
  assert.equal(event.reason, "not_json");
  assert.equal(event.row, broken);
  assert.equal(parseRow(meta({ ack: 3 })).reason, "unknown_meta");
  assert.equal(parseRow(client([1, 2])).reason, "not_object");
  assert.equal(parseRow(client({ jsonrpc: "2.0" })).reason, "not_jsonrpc");
});

test("a node envelope is never a stored agent row: one that carries a message is an unknown meta line", () => {
  const row = { id: 100, direction: "agent", node_seq: 5, raw: JSON.stringify({ oceanleo_acp: 1, seq: 5, message: { jsonrpc: "2.0", id: 1, result: {} } }), received_at: "" };
  assert.equal(parseRow(row).kind, "unknown");
  assert.equal(parseRow(row).reason, "unknown_meta");
});
