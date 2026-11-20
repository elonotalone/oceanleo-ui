import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const api = dataModule("export async function request() { throw new Error('no network in test'); } export const acpErrorText = String;");
const path = "src/shell/acp-task/acp-conversation.ts";
const { pageBehindGateway, endTurns, sessionCanFork, matchingCommands, contextPercent } = await import(await compileModule(path, {
  "../../lib/acp-frames-api": api,
}));
const { AcpSessionControls } = await import(await compileModule("src/shell/acp-task/AcpSessionControls.tsx", {
  "./acp-conversation": await compileModule(path, { "../../lib/acp-frames-api": api }),
  "../../i18n/ui/useUI": dataModule('export function useUI() { return (s,v) => s.replace(/\\{(\\w+)\\}/g, (_,k) => v?.[k] ?? k); }'),
}));
const turn = (rowId, open) => ({ rowId, open, queued: open, stopReason: open ? null : "end_turn", text: String(rowId) });
const viewOf = (...turns) => ({ turns, open: turns.some((item) => item.open), pending: [] });

test("the page is behind only when it shows a turn open and the gateway says idle", () => {
  assert.equal(pageBehindGateway({ activity_state: "idle" }, { open: true }), true);
  assert.equal(pageBehindGateway({ activity_state: "working" }, { open: true }), false);
  assert.equal(pageBehindGateway({ activity_state: "waiting_user" }, { open: true }), false, "a pending permission is an open turn");
  assert.equal(pageBehindGateway({ activity_state: "idle" }, { open: false }), false);
  assert.equal(pageBehindGateway(null, { open: true }), false, "without a snapshot nothing is decided");
});

test("ending turns after a Stop closes only the named open turns and invents no stop reason", () => {
  const view = viewOf(turn(1, false), turn(5, true), turn(9, true));
  const ended = endTurns(view, [5]);
  assert.equal(ended.turns[1].open, false);
  assert.equal(ended.turns[1].queued, false);
  assert.equal(ended.turns[1].stopReason, null);
  assert.equal(ended.turns[2].open, true, "a turn opened after the Stop stays open");
  assert.equal(ended.open, true);
  assert.equal(endTurns(view, [5, 9]).open, false);
  assert.equal(endTurns(view, [1]), view, "an already closed turn changes nothing");
  assert.equal(endTurns(view, []), view);
});

test("fork is enabled solely by an advertised session capability", () => {
  for (const caps of [{}, { fork: false }, { fork: null }]) assert.equal(sessionCanFork(caps), false);
  assert.equal(sessionCanFork({ fork: {} }), true);
  assert.equal(sessionCanFork({ fork: true }), true);
});

test("slash suggestions use only advertised commands, prefix-match and stop once arguments start", () => {
  const commands = [{ name: "compact", description: "Summarize" }, { name: "help", description: "Help" }];
  assert.deepEqual(matchingCommands(commands, "/"), commands);
  assert.deepEqual(matchingCommands(commands, "/COM"), [commands[0]]);
  assert.deepEqual(matchingCommands(commands, "/compact argument"), []);
  assert.deepEqual(matchingCommands([], "/"), []);
  assert.deepEqual(matchingCommands(commands, "hello /"), []);
});

test("command menu and context meter render advertised values; missing or invalid usage stays absent", () => {
  const render = (props) => renderToStaticMarkup(React.createElement(AcpSessionControls, {
    commands: [{ name: "compact", description: "Summarize this session" }], input: "/co", onChange() {}, usage: { used: 25, size: 100 }, ...props,
  }));
  assert.match(render(), /role="menuitem"/);
  assert.match(render(), /\/compact/);
  assert.match(render(), /Summarize this session/);
  assert.match(render(), /25%/);
  assert.match(render(), /<meter/);
  assert.doesNotMatch(render({ commands: [], usage: null }), /menuitem|<meter/);
  assert.doesNotMatch(render({ usage: { used: 1, size: 0 }, disabled: true }), /menuitem|<meter/);
  assert.equal(contextPercent(500, 100), 100);
  assert.equal(contextPercent(-1, 100), null);
  assert.equal(contextPercent(Infinity, 100), null);
});

const { applyControlRows } = await import(await compileModule("src/shell/acp-task/useAcpSessionControls.ts", {
  "../../lib/acp-frames-api": api,
}));

test("reopened session controls survive history paging and only newer announcements replace each field", () => {
  const baseline = { capabilities: { fork: {} }, commands: [{ name: "help", description: "Help" }],
    usage: { used: 20, size: 100 }, after: 100, positions: { capabilities: 1, commands: 50, usage: 100 } };
  const row = (id, update) => ({ id, direction: "agent", raw: JSON.stringify({ method: "session/update", params: { sessionId: "main", update } }) });
  const state = applyControlRows(baseline, [
    row(49, { sessionUpdate: "available_commands_update", availableCommands: [{ name: "stale" }] }),
    row(99, { sessionUpdate: "usage_update", used: 90, size: 100 }),
    row(51, { sessionUpdate: "available_commands_update", availableCommands: [] }),
    row(101, { sessionUpdate: "usage_update", used: 25, size: 100 }),
  ]);
  assert.deepEqual(state.capabilities, { fork: {} });
  assert.deepEqual(state.commands, [], "an explicit empty commands update clears the old menu");
  assert.deepEqual(state.usage, { used: 25, size: 100 });
});

// B6 replay: the turn of 2026-11-20 14:42-14:58 (methods and update names only, see the fixture's _source).
const { reduceRows } = await import("../src/acp/reduce.ts");
const b6 = JSON.parse(readFileSync(new URL("./fixtures/acp-turn-2026-11-20-b6.json", import.meta.url), "utf8"));
function b6Rows() {
  const out = [];
  let id = b6.first_row - 1, tool = 0;
  const update = (update) => ({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s", update } });
  const make = {
    P: () => ["client", { jsonrpc: "2.0", id: b6.prompt_request_id, method: "session/prompt", params: { sessionId: "s", prompt: [{ type: "text", text: "x" }] } }],
    E: () => ["agent", { jsonrpc: "2.0", id: b6.prompt_request_id, result: { stopReason: "end_turn" } }],
    c: () => ["agent", update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "x" } })],
    t: () => ["agent", update({ sessionUpdate: "tool_call", toolCallId: `t${++tool}`, title: "x", status: "pending" })],
    u: () => ["agent", update({ sessionUpdate: "tool_call_update", toolCallId: `t${tool}`, status: "completed" })],
    g: () => ["agent", update({ sessionUpdate: "usage_update", used: 1, size: 2 })],
    i: () => ["agent", update({ sessionUpdate: "session_info_update" })],
    a: () => ["agent", update({ sessionUpdate: "async_task_spawned", asyncTaskId: "bg", name: "x" })],
    p: () => ["agent", update({ sessionUpdate: "async_task_progress", asyncTaskId: "bg" })],
    s: () => ["agent", update({ sessionUpdate: "async_task_state_update", asyncTaskId: "bg", state: "completed" })],
  };
  for (const [, letter, count] of b6.sequence.matchAll(/([A-Za-z])(\d*)/g)) {
    for (let n = 0; n < Number(count || 1); n++) {
      const [direction, message] = make[letter]();
      out.push({ id: ++id, direction, node_seq: null, raw: JSON.stringify(message), received_at: "2026-11-20T06:58:19Z" });
    }
  }
  return out;
}

test("B6 replay: the page shows the turn working exactly while it lacks the stored end_turn row; catching up ends it", () => {
  const rows = b6Rows();
  assert.equal(rows.find((row) => row.raw.includes('"end_turn"')).id, b6.end_turn_row, "the fixture lines up with the stored ids");
  const missed = rows.filter((row) => row.id < b6.end_turn_row);
  assert.equal(reduceRows(missed).open, true, "the socket stopped before the end: the page kept showing 'working'");
  const caughtUp = reduceRows([...missed, ...rows.filter((row) => row.id >= b6.end_turn_row)]);
  assert.equal(caughtUp.open, false, "with every row after the last one the page had, the turn is over");
  assert.equal(caughtUp.turns.at(-1).stopReason, "end_turn");
});
