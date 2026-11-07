// UX wave 2026-11-07 (TS): search hits and the queued-prompt line on a computer task's transcript.
//
// (1) The task page's search words reach the ACP transcript: hits in the user's text, the agent's text and step
//     titles are `<mark data-leo-search-hit>` (what the header search counts); raw JSON is not searched.
// (2) A prompt sent while an earlier prompt of the same session is open is "queued" (reduce.ts) until its first
//     output; under its bubble: 「排队中：这一轮做完后它会看到」 and 「停止这一轮并发送」.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { reduceRows } from "../src/acp/reduce.ts";

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

// ---- rows as the gateway stores them ---------------------------------------------

let nextId = 1;
let nextSeq = 1;
const agent = (message) => ({ id: nextId++, direction: "agent", node_seq: nextSeq++, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z" });
const client = (message) => ({ id: nextId++, direction: "client", node_seq: null, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z" });
const update = (u, sessionId = "s1") => agent({ method: "session/update", params: { sessionId, update: u } });
const prompt = (id, text, sessionId = "s1", extra = []) =>
  client({ id, method: "session/prompt", params: { sessionId, prompt: [{ type: "text", text }, ...extra] } });
const said = (text, sessionId = "s1") => update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } }, sessionId);
const done = (id, stopReason = "end_turn") => agent({ id, result: { stopReason } });
const cancel = () => client({ method: "session/cancel", params: { sessionId: "s1" } });
const tool = (toolCallId, title, extra = {}) => update({ sessionUpdate: "tool_call", toolCallId, title, kind: "execute", status: "completed", ...extra });

function html(rows, props = {}) {
  return renderToStaticMarkup(React.createElement(AcpTranscript, { rows, program: "claude", onAnswer: () => {}, ...props }));
}
function render(rows, props) {
  return new JSDOM(`<!doctype html><html><body>${html(rows, props)}</body></html>`).window.document.body;
}
const HIT = "[data-leo-search-hit]";
const QUEUED = "排队中：这一轮做完后它会看到";

// ---- (1) search -----------------------------------------------------------------------

test("search words mark hits in the user's text, the agent's text and a finished step's title (its block opens)", () => {
  const rows = [
    prompt(1, "please deploy the site"),
    tool("t1", "Run deploy script", { rawInput: { command: "deploy --prod" } }),
    said("The deploy finished."),
    done(1),
  ];
  const body = render(rows, { highlightQuery: "deploy" });
  const hits = [...body.querySelectorAll(HIT)];
  assert.deepEqual(hits.map((hit) => hit.textContent), ["deploy", "deploy", "deploy"]);
  assert.ok(body.querySelector('[data-testid="task-user-bubble"]').querySelector(HIT), "the user's text");
  const process = body.querySelector("[data-agent-process]");
  assert.equal(process.getAttribute("data-agent-process-state"), "done");
  assert.ok(process.querySelector(`[data-agent-process-tool-title] ${HIT}`), "the finished block is open with its title marked");
  assert.ok(!process.textContent.includes("--prod"), "the step's raw input stays folded: raw JSON is not searched");
  const reply = [...body.querySelectorAll(HIT)].at(-1);
  assert.ok(!process.contains(reply), "the reply is marked outside the process block");
});

test("no search words: the same markup as without the prop, the finished block stays folded", () => {
  const rows = [prompt(1, "please deploy"), tool("t1", "Run deploy script"), said("Done."), done(1)];
  assert.equal(html(rows, { highlightQuery: "" }), html(rows));
  const body = render(rows);
  assert.equal(body.querySelectorAll(HIT).length, 0);
  assert.equal(body.querySelector("[data-agent-process-tool-title]"), null, "folded: step titles are not on the page");
});

test("words found only elsewhere do not open a step block; a pending raw request's params are not searched", () => {
  const rows = [
    prompt(1, "hi"),
    tool("t1", "Read file"),
    said("zebra here"),
    agent({ id: 9, method: "x/custom", params: { sessionId: "s1", note: "zebra" } }),
  ];
  const body = render(rows, { highlightQuery: "zebra" });
  assert.equal(body.querySelectorAll(HIT).length, 1, "only the agent's text");
  assert.equal(body.querySelector("[data-agent-process-tool-title]"), null, "the step block stays folded");
  assert.equal(body.querySelector("[data-acp-raw-request]").querySelector(HIT), null);
});

// ---- (2) queued prompts: the rule (reduce.ts) ---------------------------------------

test("a prompt sent during an open turn of the same session is queued until its first output", () => {
  const rows = [prompt(1, "first"), said("working"), prompt(2, "second")];
  let view = reduceRows(rows, "claude");
  assert.equal(view.turns[0].queued, false);
  assert.equal(view.turns[1].queued, true);
  rows.push(said(" still on the first"));
  view = reduceRows(rows, "claude");
  assert.equal(view.turns[1].queued, true, "output of the running turn is not its start");
  assert.equal(view.turns[1].items.length, 0);
  rows.push(done(1));
  view = reduceRows(rows, "claude");
  assert.equal(view.turns[1].queued, true, "the previous answer alone does not start it");
  rows.push(said("now the second"));
  view = reduceRows(rows, "claude");
  assert.equal(view.turns[1].queued, false, "its first output starts it");
});

test("not queued: a prompt with no open turn, one in another session, and Cursor / Hermes prompts", () => {
  assert.equal(reduceRows([prompt(1, "a"), done(1), prompt(2, "b")], "claude").turns[1].queued, false);
  assert.equal(reduceRows([prompt(1, "a", "s1"), prompt(2, "b", "s2")], "claude").turns[1].queued, false);
  assert.equal(reduceRows([prompt(1, "a"), prompt(2, "b")], "cursor").turns[1].queued, false, "Cursor replaces the running prompt");
  assert.equal(reduceRows([prompt(1, "a"), prompt(2, "b")], "hermes").turns[1].queued, false, "Hermes says itself");
  assert.equal(reduceRows([prompt(1, "a"), prompt(2, "b")], "codex").turns[1].queued, true);
});

test("a cancel that ends a queued prompt unread leaves it queued, closed, cancelled", () => {
  const view = reduceRows([prompt(1, "a"), said("x"), prompt(2, "b"), cancel(), done(2, "cancelled"), done(1, "cancelled")], "claude");
  const queued = view.turns[1];
  assert.equal(queued.open, false);
  assert.equal(queued.queued, true);
  assert.equal(queued.stopReason, "cancelled");
  assert.equal(view.open, false);
});

// ---- (2) queued prompts: the line under the bubble -----------------------------------------

test("the queued line and its button show under the held prompt only, and go when its turn starts", () => {
  const rows = [prompt(1, "first"), said("working"), prompt(2, "second")];
  const second = rows[2].id;
  const body = render(rows, { onStopAndSend: () => {} });
  const lines = body.querySelectorAll("[data-acp-queued]");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].getAttribute("data-acp-queued"), String(second));
  assert.ok(lines[0].textContent.includes(QUEUED));
  const button = lines[0].querySelector("[data-acp-stop-and-send]");
  assert.ok(button);
  assert.equal(button.textContent, "停止这一轮并发送");
  assert.equal(button.getAttribute("data-acp-stop-and-send"), String(second));
  const bubbles = body.querySelectorAll('[data-testid="task-user-bubble"]');
  assert.equal(bubbles[1].nextElementSibling, lines[0], "directly under the second bubble");

  const started = render([...rows, done(1), said("on it")], { onStopAndSend: () => {} });
  assert.equal(started.querySelector("[data-acp-queued]"), null);
  assert.ok(!started.textContent.includes(QUEUED));
});

test("without onStopAndSend (socket down) the line shows without the button; a prompt with a file gets no button", () => {
  const rows = [prompt(1, "first"), prompt(2, "second")];
  const without = render(rows);
  assert.ok(without.querySelector("[data-acp-queued]"));
  assert.equal(without.querySelector("[data-acp-stop-and-send]"), null);

  const withFile = render([prompt(3, "first"), prompt(4, "look", "s1", [{ type: "image", mimeType: "image/png", data: "AAAA" }])], {
    onStopAndSend: () => {},
  });
  assert.ok(withFile.querySelector("[data-acp-queued]"), "still marked queued");
  assert.equal(withFile.querySelector("[data-acp-stop-and-send]"), null, "the page cannot send the file again");
});

test("a queued prompt the cancel ended shows the stop notice, not the queued line", () => {
  const body = render([prompt(1, "a"), said("x"), prompt(2, "b"), cancel(), done(2, "cancelled")], { onStopAndSend: () => {} });
  assert.equal(body.querySelector("[data-acp-queued]"), null);
  assert.ok(body.querySelector('[data-agent-notice="cancelled"]'));
});
