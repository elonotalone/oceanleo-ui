// Wave 2026-11-20 MC (B5): a program's status line — "MCP server "oceanleo" failed to start … Run /mcp" — is a
// notice: its own small line in plain words, never inside the assistant's reply, never "MCP" or a command to type.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { reduceRows } from "../src/acp/reduce.ts";
import { chunkNotice, noticeText } from "../src/acp/notices.ts";

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
const attachmentUrlStub = dataModule(`
  export * from ${JSON.stringify(new URL("../src/lib/attachment-url.ts", import.meta.url).href)};
  export function useAttachmentDisplayUrl(attachment) {
    return attachment?.artifact_id ? "/private-thumbnail/" + attachment.artifact_id : attachment?.url;
  }
`);

const { AcpTranscript } = await import(
  await compileModule("src/acp/AcpTranscript.tsx", {
    "../i18n/ui/useUI": uiStub,
    "./share/share-clipboard": clipboardStub,
    "../lib/attachment-url": attachmentUrlStub,
  })
);

let nextId = 1;
const agent = (message) => ({ id: nextId++, direction: "agent", node_seq: nextId, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-20T05:40:52Z" });
const client = (message) => ({ id: nextId++, direction: "client", node_seq: null, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-20T05:40:52Z" });
const update = (u) => agent({ method: "session/update", params: { sessionId: "s1", update: u } });
const prompt = (id, text) => client({ id, method: "session/prompt", params: { sessionId: "s1", prompt: [{ type: "text", text }] } });
const said = (text) => update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
const endTurn = (id) => agent({ id, result: { stopReason: "end_turn" } });

// claude-agent-acp 0.101.0 `reportMcpServerStartupFailures`, both shapes (`session-notices.js`).
const TITLE = 'MCP server "oceanleo" failed to start';
const DESCRIPTION = "Its tools are unavailable in this session. Run /mcp for the error.";
const asNotice = () => update({ sessionUpdate: "notice", severity: "warning", title: TITLE, description: DESCRIPTION });
const asChunk = () => update({
  sessionUpdate: "agent_message_chunk",
  content: { type: "text", text: `**${TITLE}:** ${DESCRIPTION}` },
  _meta: { claudeCode: { kind: "mcpServerStatus", server: "oceanleo", status: "failed" } },
});
const TOOLS_LINE = "OceanLeo 工具暂时无法在这个任务中使用。";

function render(rows) {
  const markup = renderToStaticMarkup(React.createElement(AcpTranscript, { rows, program: "claude", onAnswer: () => {} }));
  return new JSDOM(`<!doctype html><html><body>${markup}</body></html>`).window.document.body;
}

for (const [shape, build] of [["notice update", asNotice], ["message-chunk fallback", asChunk]]) {
  test(`tools failed to start (${shape}): a separate plain line, the reply untouched`, () => {
    const rows = [prompt(1, "hi"), build(), said("Hello! How can I help?"), endTurn(1)];
    const view = reduceRows(rows);
    const items = view.turns[0].items;
    assert.deepEqual(items.map((item) => item.type), ["notice", "message"]);
    assert.equal(items[0].code, "tools_unavailable");
    assert.equal(items[1].text, "Hello! How can I help?");
    assert.equal(view.retrying, false);

    const body = render(rows);
    const line = body.querySelector('[data-agent-notice="tools_unavailable"]');
    assert.ok(line, "the notice renders as its own line");
    assert.ok(line.textContent.includes(TOOLS_LINE));
    assert.ok(!body.textContent.includes("MCP"), body.textContent);
    assert.ok(!body.textContent.includes("/mcp"), body.textContent);
    assert.ok(!body.textContent.includes("Run "), body.textContent);
    assert.ok(body.textContent.includes("Hello! How can I help?"));
  });
}

test("reply text without a status marker stays in the reply, even when it starts in bold", () => {
  const text = "**Note:** the build passed.";
  assert.equal(chunkNotice({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } }), null);
  const view = reduceRows([prompt(1, "build"), said(text), endTurn(1)]);
  assert.deepEqual(view.turns[0].items.map((item) => item.type), ["message"]);
  assert.equal(view.turns[0].items[0].text, text);
});

test("any status line keeps its own words but never a command to type", () => {
  assert.equal(noticeText("Remote Control is off", "Run /remote-control to reconnect."), "Remote Control is off");
  assert.equal(noticeText("Rate limited", "Waiting 5s before the next try."), "Rate limited\nWaiting 5s before the next try.");
  // Rows are ordered by id: the prompt is built first.
  const asked = prompt(1, "go");
  const informational = update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "**Context almost full:** Older messages will be summarised. Use /compact now." },
    _meta: { claudeCode: { kind: "informational", level: "warning" } },
  });
  const rows = [asked, informational, said("Done."), endTurn(1)];
  const items = reduceRows(rows).turns[0].items;
  assert.deepEqual(items.map((item) => item.type), ["notice", "message"]);
  assert.equal(items[1].text, "Done.");
  const body = render(rows);
  const line = body.querySelector('[data-agent-system="notice"]');
  assert.ok(line.textContent.includes("Context almost full"));
  assert.ok(line.textContent.includes("Older messages will be summarised."));
  assert.ok(!body.textContent.includes("/compact"), body.textContent);
});

test("tool-server news that is not a failure shows nothing", () => {
  const rows = [prompt(1, "hi"), update({ sessionUpdate: "notice", severity: "info", title: 'MCP server "oceanleo" connected' }), said("Hi."), endTurn(1)];
  const body = render(rows);
  assert.equal(body.querySelector('[data-agent-system="notice"]'), null);
  assert.ok(!body.textContent.includes("MCP"));
});
