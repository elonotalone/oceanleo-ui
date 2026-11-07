// UX wave 2026-11-07 (SH): 「分享」 on a computer task.
//
// `acpShareItems(view)` picks the words of a computer task — the user's prompts and the program's text replies — out
// of the same view the transcript renders, and names the frame rows each is made of (the link is built from those
// rows on the server). `AcpTranscript`'s select mode gives the checkbox to exactly those bubbles: tool steps,
// thoughts, approvals, notices and a sub-agent's words get none.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { reduceRows } from "../src/acp/reduce.ts";
import { acpShareItems } from "../src/acp/share.ts";

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
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const { AcpTranscript } = await import(
  await compileModule("src/acp/AcpTranscript.tsx", {
    "../i18n/ui/useUI": uiStub,
    "./share/share-clipboard": dataModule("export async function writeClipboardText() { return true; }"),
  })
);

// ---- rows exactly as the gateway stores them -----------------------------------------------------------------

let nextId = 1;
const agent = (message) => ({ id: nextId++, direction: "agent", node_seq: nextId, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z" });
const client = (message) => ({ id: nextId++, direction: "client", node_seq: null, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z" });
const update = (u) => agent({ method: "session/update", params: { sessionId: "s1", update: u } });
const prompt = (id, text) => client({ id, method: "session/prompt", params: { sessionId: "s1", prompt: [{ type: "text", text }] } });
const said = (text, extra = {}) => update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text }, ...extra });
const thought = (text) => update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text } });
const tool = (toolCallId, title) => update({ sessionUpdate: "tool_call", toolCallId, title, kind: "execute", status: "completed" });
const endTurn = (id) => agent({ id, result: { stopReason: "end_turn" } });
const failed = (id) => agent({ id, error: { code: -32603, message: "Internal error" } });
const permission = (id) => agent({
  id,
  method: "session/request_permission",
  params: { sessionId: "s1", toolCall: { toolCallId: "t9", title: "Run rm -rf build" }, options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }] },
});

/** Two turns: words, a tool step between two reply parts, a thought, an approval, a sub-agent's words, an error. */
function conversation() {
  nextId = 1;
  const rows = [];
  const add = (row) => (rows.push(row), row.id);
  const ids = {};
  ids.prompt1 = add(prompt(1, "跑一下测试"));
  add(thought("先看看目录"));
  ids.reply1 = [add(said("好的，")), add(said("我先跑测试。"))];
  add(tool("t1", "npm test"));
  ids.reply2 = [add(said("全部通过。"))];
  add(said("子任务的话", { _meta: { claudeCode: { parentToolUseId: "t1" } } }));
  add(permission(40));
  add(endTurn(1));
  ids.prompt2 = add(prompt(2, "再看看覆盖率"));
  add(failed(2));
  return { rows, ids };
}

test("the pickable messages are the prompts and the text replies, each with the frame rows it is made of", () => {
  const { rows, ids } = conversation();
  const share = acpShareItems(reduceRows(rows, "claude"));
  assert.deepEqual(
    share.messages.map((message) => [message.id, message.role, message.kind, message.content]),
    [
      [ids.prompt1, "user", "text", "跑一下测试"],
      [ids.reply1[0], "assistant", "text", "好的，我先跑测试。"],
      [ids.reply2[0], "assistant", "text", "全部通过。"],
      [ids.prompt2, "user", "text", "再看看覆盖率"],
    ],
    "no thought, tool step, approval, sub-agent words or the turn's error",
  );
  assert.deepEqual(
    share.messages.map((message) => share.rowIds.get(message.id)),
    [[ids.prompt1], ids.reply1, ids.reply2, [ids.prompt2]],
  );
});

test("nothing to pick before the first row arrives", () => {
  const share = acpShareItems(reduceRows([], "codex"));
  assert.deepEqual(share.messages, []);
});

function render(rows, select) {
  const markup = renderToStaticMarkup(React.createElement(AcpTranscript, { rows, program: "claude", onAnswer: () => {}, select }));
  return new JSDOM(`<!doctype html><html><body>${markup}</body></html>`).window.document.body;
}

test("select mode: only the pickable bubbles get a checkbox, ticked as selected; outside it no checkbox at all", () => {
  const { rows, ids } = conversation();
  const share = acpShareItems(reduceRows(rows, "claude"));
  const pickable = new Set(share.messages.map((message) => message.id));
  const body = render(rows, { pickable, selected: new Set([ids.reply2[0]]), onToggle: () => {} });
  const boxes = [...body.querySelectorAll('[role="checkbox"]')];
  assert.equal(boxes.length, 4, "two prompts and two replies");
  assert.deepEqual(boxes.map((box) => box.getAttribute("aria-checked")), ["false", "false", "true", "false"]);
  // The approval card and the turn's error are on screen, without a checkbox.
  assert.match(body.textContent, /Run rm -rf build/);
  assert.match(body.textContent, /Internal error/);
  for (const box of boxes) assert.doesNotMatch(box.parentElement.textContent, /Run rm -rf build|Internal error/);
  assert.equal(render(rows, undefined).querySelectorAll('[role="checkbox"]').length, 0);
});
