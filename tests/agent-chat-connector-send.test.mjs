import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
await import("./agent-chat-conversations.test.mjs");
import { MCP_APPS_PROTOCOL, UI_METHODS } from "../src/shell/mcp-apps/protocol.ts";
const { mount, settle, cloudTask, computerTask, session, type } = globalThis.__agentChatHarness;
const APP = { id: 123, task_id: "t1", role: "assistant", kind: "step", content: "Gallery", meta: {
  tool: "mcp__demo__gallery", status: "done", verified: true,
  mcp_app: { connector_id: "demo", tool: "gallery", resource_uri: "ui://demo/gallery.html",
    arguments: { query: "card" }, result: { content: [{ type: "text", text: "Choose a card" }] } },
} };
const task = (status = "done") => { const value = cloudTask(); value.task.status = status; value.messages.push(APP); return value; };
const transport = () => ({ listTools: async () => [], callTool: async () => { throw new Error("no second tool call"); },
  readResource: async (_, uri) => ({ contents: [{ uri, mimeType: "text/html;profile=mcp-app", text: "<p>Cards</p>" }] }) });
async function mountApp(options = {}, props = {}) {
  const listeners = [];
  const originalAdd = window.addEventListener.bind(window);
  window.addEventListener = (name, listener, rest) => { if (name === "message") listeners.push(listener); return originalAdd(name, listener, rest); };
  let view;
  try {
    view = await mount({ taskId: "t1", ...props }, { task: task(), mcpTransport: transport(), ...options });
    await settle();
    const frame = view.host.querySelector("iframe");
    assert.ok(frame, "the real AgentChat provider enables the stored connector interface");
    const replies = [];
    const port = { postMessage: (message) => replies.push(message), start() {}, close() {}, onmessage: null };
    await act(async () => {
      for (const listener of listeners) listener({ origin: "null", source: frame.contentWindow,
        data: { protocol: MCP_APPS_PROTOCOL, instanceId: frame.dataset.mcpAppInstance, type: "hello" }, ports: [port] });
    });
    await act(async () => {
      port.onmessage({ data: { jsonrpc: "2.0", id: "init", method: UI_METHODS.INITIALIZE, params: {} } });
      port.onmessage({ data: { jsonrpc: "2.0", method: UI_METHODS.INITIALIZED } });
    });
    const fromApp = async (id, text) => {
      await act(async () => { port.onmessage({ data: { jsonrpc: "2.0", id, method: UI_METHODS.MESSAGE,
        params: { role: "user", content: [{ type: "text", text }] } } }); });
      await settle();
      return replies.find((reply) => reply.id === id);
    };
    return { view, fromApp, replies, async unmount() { await view.unmount(); window.addEventListener = originalAdd; } };
  } catch (error) { await view?.unmount(); window.addEventListener = originalAdd; throw error; }
}

test("connector ui/message sends the next user message to this task and preserves the person's draft", async () => {
  const app = await mountApp({ followUpResponse: () => {
    globalThis.__task.messages.push({ id: 124, role: "user", kind: "text", content: "Use the blue card" });
    return { ok: true };
  } });
  try {
    await type(app.view, "cloud", "My unfinished draft");
    await act(async () => { app.view.composer("cloud").__props.onAddAttachments([
      { id: "draft-file", artifactId: "11111111-1111-4111-8111-111111111111", revisionId: "22222222-2222-4222-8222-222222222222", name: "my-draft.pdf", mime: "application/pdf" },
    ]); });
    assert.equal(app.view.composer("cloud").__props.attachments.length, 1, "the draft file is present before the connector acts");
    const response = await app.fromApp("choose", "Use the blue card");
    assert.deepEqual(globalThis.__followUps, ["Use the blue card"]);
    assert.equal(globalThis.__followUpBodies[0].id, "t1");
    assert.deepEqual(globalThis.__followUpBodies[0].attachments, [], "the app does not send the person's draft files");
    assert.equal(app.view.composer("cloud").__props.value, "My unfinished draft");
    assert.deepEqual(app.view.composer("cloud").__props.attachments.map((item) => item.name), ["my-draft.pdf"]);
    assert.deepEqual(response?.result, {});
    assert.match(app.view.host.textContent, /Use the blue card/);
  } finally { await app.unmount(); }
});

test("a running cloud turn refuses ui/message and preserves the draft without a send", async () => {
  const app = await mountApp({ task: task("running") });
  try {
    await type(app.view, "cloud", "Still editing");
    const response = await app.fromApp("busy", "Use the red card");
    assert.equal(response?.result.isError, true);
    assert.deepEqual(globalThis.__followUps, []);
    assert.equal(app.view.composer("cloud").__props.value, "Still editing");
  } finally { await app.unmount(); }
});

test("gateway refusal reaches the connector frame as failure and leaves the person's draft intact", async () => {
  const app = await mountApp({ followUpResponse: { ok: false, error: "gateway refused" } });
  try {
    await type(app.view, "cloud", "Keep this draft");
    assert.equal((await app.fromApp("failed", "Use this template"))?.result.isError, true);
    assert.equal(globalThis.__followUps.length, 1);
    assert.equal(app.view.composer("cloud").__props.value, "Keep this draft");
    assert.match(app.view.host.querySelector("[data-agent-chat-error]").textContent, /gateway refused/);
  } finally { await app.unmount(); }
});

test("two overlapping ui/message calls dispatch once and report the second as busy", async () => {
  let finish;
  const app = await mountApp({ followUpResponse: () => new Promise((resolve) => { finish = resolve; }) });
  try {
    assert.equal(await app.fromApp("first", "First choice"), undefined, "no success before the gateway accepts");
    assert.equal((await app.fromApp("second", "Second choice"))?.result.isError, true);
    assert.deepEqual(globalThis.__followUps, ["First choice"]);
    await act(async () => { finish({ ok: true }); });
    await settle();
    assert.deepEqual(app.replies.find((reply) => reply.id === "first")?.result, {});
  } finally { finish?.({ ok: true }); await app.unmount(); }
});

test("read-only and computer conversations leave connector interfaces as plain tool text", async () => {
  for (const options of [{ props: { readOnly: true }, task: task() }, { props: {}, task: { ...computerTask(), messages: [APP] }, sessions: [session("cts_1", "acp", "claude")] }]) {
    const view = await mount({ taskId: "t1", ...options.props }, { task: options.task, sessions: options.sessions || [], mcpTransport: transport() });
    try { assert.equal(view.host.querySelector("[data-transcript-mcp-app]"), null); }
    finally { await view.unmount(); }
  }
});


test("a thrown network error returns failure to the frame and releases the send lock for another try", async () => {
  const app = await mountApp({ followUpResponse: () => { throw new Error("network offline"); } });
  try {
    await type(app.view, "cloud", "My draft stays");
    assert.equal((await app.fromApp("offline", "Pick this card"))?.result.isError, true);
    assert.equal(app.view.composer("cloud").__props.value, "My draft stays");
    globalThis.__followUpResponse = { ok: true };
    assert.deepEqual((await app.fromApp("again", "Pick this card"))?.result, {});
    assert.equal(globalThis.__followUps.length, 2);
    assert.equal(app.view.composer("cloud").__props.value, "My draft stays");
  } finally { await app.unmount(); }
});
