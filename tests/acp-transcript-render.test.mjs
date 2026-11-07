// TG-U1 (2026-11-07 thin gateway): render smoke test for `src/acp/AcpTranscript.tsx`.
//
// Stored ACP frame rows go in; the task chat's own components come out (`AgentTranscriptBubble` for words, gates
// and notices, `AgentProgress` for thoughts / tool steps / plans). Static markup is parsed with jsdom (obtained
// through fabric's dependency tree, same as agent-chat-search-highlight.test.mjs) and checked via data-* hooks.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { cursorAnswerResult } from "../src/acp/messages.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(
      /\\{(\\w+)\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);
const clipboardStub = dataModule(`
  export async function writeClipboardText() { return true; }
`);

const { AcpTranscript } = await import(
  await compileModule("src/acp/AcpTranscript.tsx", {
    "../i18n/ui/useUI": uiStub,
    "./share/share-clipboard": clipboardStub,
  })
);

// ---- row builders ------------------------------------------------------------

let nextId = 1;
let nextSeq = 1;
const node = (line) => {
  const seq = nextSeq++;
  return { id: nextId++, direction: "agent", node_seq: seq, raw: JSON.stringify({ oceanleo_acp: 1, seq, ...line }), received_at: "2026-11-07T10:00:00Z" };
};
// Agent rows hold the agent's JSON-RPC message as written; only node meta lines carry `oceanleo_acp` (TG-G1 storage).
const agent = (message) => ({ id: nextId++, direction: "agent", node_seq: nextSeq++, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z" });
const client = (message) => ({ id: nextId++, direction: "client", node_seq: null, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z" });
const update = (u, sessionId = "s1") => agent({ method: "session/update", params: { sessionId, update: u } });

const prompt = (id, text) => client({ id, method: "session/prompt", params: { sessionId: "s1", prompt: [{ type: "text", text }] } });
const said = (text) => update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
const thought = (text) => update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text } });
const endTurn = (id) => agent({ id, result: { stopReason: "end_turn" } });
const answer = (id, result) => client({ id, result });

const permissionRequest = () =>
  agent({
    id: 7,
    method: "session/request_permission",
    params: {
      sessionId: "s1",
      toolCall: { toolCallId: "t1", title: "Run ls" },
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "deny", name: "Deny", kind: "reject_once" },
      ],
    },
  });

// ---- render helpers ------------------------------------------------------------

function html(rows, props = {}) {
  return renderToStaticMarkup(React.createElement(AcpTranscript, { rows, program: "claude", onAnswer: () => {}, ...props }));
}

function render(rows, props) {
  return new JSDOM(`<!doctype html><html><body>${html(rows, props)}</body></html>`).window.document.body;
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

// ---- tests -----------------------------------------------------------------------

test("no rows renders nothing at all (no empty-state copy)", () => {
  assert.equal(html([]), "");
});

test("a closed turn: user bubble, one finished process block, the reply once outside it", () => {
  const body = render([
    prompt(1, "hi"),
    thought("Let me look."),
    update({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Read file", kind: "read", status: "pending" }),
    update({ sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed", content: [{ type: "diff", path: "/a.ts", oldText: "a", newText: "b" }] }),
    said("Hel"),
    said("lo"),
    endTurn(1),
  ]);
  assert.ok(body.querySelector("[data-acp-transcript]"));
  const users = body.querySelectorAll('[data-testid="task-user-bubble"]');
  assert.equal(users.length, 1);
  assert.equal(users[0].textContent, "hi");
  const processes = body.querySelectorAll("[data-agent-process]");
  assert.equal(processes.length, 1);
  assert.equal(processes[0].getAttribute("data-agent-process-state"), "done");
  assert.equal(occurrences(body.textContent, "Hello"), 1);
  assert.ok(!processes[0].textContent.includes("Hello"), "the reply is not part of the process block");
});

test("an open turn (no response row yet) keeps its process block running", () => {
  const body = render([
    prompt(1, "hi"),
    thought("Working on it."),
    update({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Read file", kind: "read", status: "in_progress" }),
  ]);
  const processes = body.querySelectorAll("[data-agent-process]");
  assert.equal(processes.length, 1);
  assert.equal(processes[0].getAttribute("data-agent-process-state"), "running");
});

test("a permission request is answerable until the client response row records the chosen option", () => {
  const rows = [prompt(1, "list files"), permissionRequest()];
  const pending = render(rows);
  const card = pending.querySelector('[data-native-permission="7"]');
  assert.ok(card, "permission card for request id 7");
  const options = card.querySelectorAll("[data-native-permission-option]");
  assert.deepEqual([...options].map((button) => button.getAttribute("data-native-permission-option")), ["allow", "deny"]);
  for (const button of options) assert.equal(button.hasAttribute("disabled"), false);
  assert.equal(card.querySelector("[data-native-permission-chosen]"), null);

  const answered = render([...rows, answer(7, { outcome: { outcome: "selected", optionId: "allow" } })]);
  const done = answered.querySelector('[data-native-permission="7"]');
  assert.ok(done);
  const chosen = done.querySelector("[data-native-permission-chosen]");
  assert.ok(chosen, "chosen line shown");
  assert.ok(chosen.textContent.includes("Allow"), `chosen shows the option name, got ${JSON.stringify(chosen.textContent)}`);
  assert.ok(!chosen.textContent.includes("allow"), "the option name, not its id");
  const buttons = done.querySelectorAll("[data-native-permission-option]");
  assert.equal(buttons.length, 2);
  for (const button of buttons) assert.equal(button.hasAttribute("disabled"), true);
});

test("node meta rows: a gap and an exit render as notices", () => {
  const body = render([node({ gap: { from: 2, to: 4, count: 3 } }), prompt(1, "hi"), node({ exit: { code: 1, signal: null } })]);
  const gap = body.querySelector('[data-agent-notice="gap"]');
  assert.ok(gap);
  assert.ok(gap.textContent.includes("此处省略 3 条"));
  const exit = body.querySelector('[data-agent-notice="exit"]');
  assert.ok(exit);
  assert.ok(exit.textContent.includes("code 1"));
});

test("a stoppable background task gets a stop button only when onStopTask is given", () => {
  const rows = [
    prompt(1, "build it"),
    update({ sessionUpdate: "async_task_spawned", asyncTaskId: "bg1", name: "build", description: "npm build", canStop: true }),
  ];
  const withStop = render(rows, { onStopTask: () => {} });
  const task = withStop.querySelector('[data-acp-background-task="bg1"]');
  assert.ok(task);
  assert.ok(task.textContent.includes("npm build"));
  assert.ok(withStop.querySelector('[data-acp-stop-task="bg1"]'));

  const without = render(rows);
  assert.ok(without.querySelector('[data-acp-background-task="bg1"]'));
  assert.equal(without.querySelector("[data-acp-stop-task]"), null);
});

test("an unknown agent request shows method and params verbatim while pending, and is gone once answered", () => {
  const params = { sessionId: "s1", path: "/tmp/x", nested: { n: 1, list: ["a", "b"] } };
  const rows = [prompt(1, "hi"), agent({ id: 9, method: "x/custom", params })];
  const pending = render(rows);
  const card = pending.querySelector('[data-acp-raw-request="x/custom"]');
  assert.ok(card);
  assert.equal(card.querySelector("pre").textContent, JSON.stringify(params, null, 2));

  const answered = render([...rows, client({ id: 9, error: { code: -32601, message: "Method not found" } })]);
  assert.equal(answered.querySelector("[data-acp-raw-request]"), null);
});

test("cursor/create_plan renders a native question gate", () => {
  const body = render(
    [prompt(1, "plan it"), agent({ id: 11, method: "cursor/create_plan", params: { plan: "1. do x", name: "My plan" } })],
    { program: "cursor" },
  );
  const gate = body.querySelector('[data-native-question="11"]');
  assert.ok(gate);
  assert.ok(gate.textContent.includes("My plan"));
  assert.ok(gate.textContent.includes("1. do x"));
  assert.ok(gate.querySelector('[data-native-question-option="accepted"]'));
  assert.ok(gate.querySelector('[data-native-question-option="rejected"]'));
});

test("a prompt error response is shown verbatim in an error bubble", () => {
  const body = render([
    prompt(1, "hi"),
    agent({ id: 1, error: { code: -32603, message: "Internal error: boom", data: { detail: "x" } } }),
  ]);
  const errors = [...body.querySelectorAll(".bg-rose-50")];
  assert.equal(errors.length, 1);
  assert.ok(errors[0].textContent.includes("Internal error: boom"));
});

test("cursorAnswerResult builds the result object Cursor reads", () => {
  assert.deepEqual(cursorAnswerResult("cursor/create_plan", { __plan__: "accepted" }), { outcome: { outcome: "accepted" } });
  assert.deepEqual(cursorAnswerResult("cursor/ask_question", { q1: "a,b", text: "x" }), {
    outcome: { outcome: "answered", answers: [{ questionId: "q1", selectedOptionIds: ["a", "b"] }] },
  });
});
