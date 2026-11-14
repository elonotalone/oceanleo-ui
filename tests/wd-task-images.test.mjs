import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ui = dataModule(`const tt = (text) => text; export function useUI(){ return tt; }`);
const { AcpTranscript } = await import(await compileModule("src/acp/AcpTranscript.tsx", {
  "../i18n/ui/useUI": ui,
  "../lib/attachment-url": dataModule(`
    export function attachmentRef(att){return att?.artifact_id ? att : null;}
    export function useAttachmentDisplayUrl(att){return att?.url || (att?.artifact_id ? 'https://api.dev.example/thumbnail' : '');}
  `),
}));
const row = (id, direction, message, extra = {}) => ({ id, direction, node_seq: direction === "agent" ? id : null,
  raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-15T00:00:00Z", ...extra });
const image = (data, uri) => ({ type: "image", data, mimeType: "image/png", ...(uri ? { uri } : {}) });
const prompt = (id, text, images, extra) => row(id, "client", { id, method: "session/prompt", params: {
  sessionId: "s1", prompt: [{ type: "text", text }, ...images],
} }, extra);
const reply = (id, text) => row(id, "agent", { method: "session/update", params: { sessionId: "s1", update: {
  sessionUpdate: "agent_message_chunk", content: { type: "text", text },
} } });

for (const program of ["claude", "codex", "cursor", "hermes"]) {
  test(`${program}: expanded images stay in their user turn; chips open the sidebar callback through later output`, async () => {
    const uri = "oceanleo-attachment://550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001/screenshot.png";
    const short = prompt(1, "first screenshot", [image("", uri), image("")], { truncated: { bytes: 70000 } });
    const full = prompt(1, "first screenshot", [image("aGVsbG8=", uri), image("aGVsbG8=")]);
    const initial = [short, reply(2, "assistant after attachment")];
    const opened = [], errors = [];
    const previous = console.error;
    console.error = (...args) => errors.push(args.map(String).join(" "));
    let append;
    function Harness() {
      const [rows, setRows] = useState(initial);
      append = () => setRows((current) => [...current, row(3, "agent", { id: 1, result: { stopReason: "end_turn" } }),
        prompt(4, "next user message", [image("d29ybGQ=")]), reply(5, "last assistant reply")]);
      return React.createElement(AcpTranscript, { program, rows, onOpenAttachment: (attachment) => { opened.push(attachment); },
        onExpandRow: async () => setRows((current) => current.map((entry) => entry.id === 1 ? full : entry)),
      });
    }
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const first = () => host.querySelector('[data-testid="task-user-bubble"]');
      assert.equal(first().querySelectorAll("img").length, 1, "private thumbnail is usable before expansion");
      await act(async () => first().querySelector("button").click());
      assert.equal(opened[0].artifact_id, "550e8400-e29b-41d4-a716-446655440000");
      await act(async () => host.querySelector("[data-acp-truncated-row] button").click());
      assert.equal(host.querySelectorAll("[data-acp-truncated-row]").length, 0);
      assert.equal(first().querySelectorAll("img").length, 2);
      const inline = [...first().querySelectorAll("img")].find((img) => img.getAttribute("src")?.startsWith("data:"));
      assert.ok(inline);
      assert.equal(inline.closest("button").style.width, "64px");
      await act(async () => inline.closest("button").click());
      assert.equal(opened.at(-1).url, "data:image/png;base64,aGVsbG8=");
      await act(async () => append());
      assert.equal(host.querySelectorAll("img").length, 3);
      for (const img of host.querySelectorAll("img")) assert.ok(img.closest('[data-testid="task-user-bubble"]'));
      assert.equal(host.querySelectorAll("[data-acp-full-image]").length, 0);
      const blocks = host.querySelectorAll("[data-history-item]");
      assert.match(blocks[blocks.length - 1].textContent, /last assistant reply/);
      assert.equal(blocks[blocks.length - 1].querySelectorAll("img").length, 0);
      assert.deepEqual(errors, []);
    } finally {
      await act(async () => root.unmount()); host.remove(); console.error = previous;
      assert.deepEqual(errors, [], "no console.error, including hook errors");
    }
  });
}
