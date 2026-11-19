import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";

// UX wave 2026-11-07 (TS) on the real AgentChat mount harness of agent-chat-conversations.test.mjs (real frames
// client, fake fetch / WebSocket): the header search counts hits in a computer task's rows, and 「停止这一轮并发送」
// under a queued prompt stops the turn and sends that prompt again once the stop ended it unread.
await import("./agent-chat-conversations.test.mjs");
const { mount, settle, session, computerTask, connect, deliver, posts, socket, type, submit } = globalThis.__agentChatHarness;

const sessions = [session("cts_claude", "acp", "claude")];
// Rows as the gateway stores them; ids above the harness's own so each test's order is the commit order.
let rowId = 100000;
const row = (direction, message) => ({
  id: ++rowId, direction, node_seq: direction === "agent" ? rowId : null,
  raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z",
});
const prompt = (id, text) => row("client", { id, method: "session/prompt", params: { sessionId: "s1", prompt: [{ type: "text", text }] } });
const chunk = (text) => row("agent", { method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });
const answered = (id, stopReason) => row("agent", { id, result: { stopReason } });
const cancel = () => row("client", { method: "session/cancel", params: { sessionId: "s1" } });

async function click(target) {
  await act(async () => {
    target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  await settle();
}
async function typeInto(input, value) {
  await act(async () => {
    const tracker = input._valueTracker;
    input.value = value;
    if (tracker) tracker.setValue("");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await Promise.resolve();
  });
  await settle();
}
const pane = (view) => view.host.querySelector('[data-agent-stream="acp"]');
const count = (view) => view.host.querySelector("[data-agent-chat-search-count]").textContent.trim();

test("search on a computer task counts the hits in its rows and counts again when new rows arrive", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    await deliver(prompt(1, "帮我 deploy 网站"), chunk("deploy 已经开始"), answered(1, "end_turn"));
    await click(view.host.querySelector('button[title="搜索"]'));
    await typeInto(view.host.querySelector('input[placeholder="搜索对话"]'), "deploy");
    const hits = pane(view).querySelectorAll("[data-leo-search-hit]");
    assert.equal(hits.length, 2, "the user's words and the agent's words");
    assert.equal(count(view), "1/2");
    assert.equal(hits[0].getAttribute("data-active"), "true");
    await deliver(prompt(2, "再 deploy 一次"));
    assert.equal(count(view), "1/3", "a new row is counted");
    // A streaming reply types itself out; the turn's answer row ends it and the count includes all of it.
    await deliver(chunk("第二次 deploy 也好了"), answered(2, "end_turn"));
    assert.equal(count(view), "1/4");
    assert.equal(view.host.querySelectorAll("[data-leo-search-hit]").length, 4, "every hit is in the computer task's pane");
  } finally { await view.unmount(); }
});

async function hold(view, text) {
  await type(view, "acp", text);
  await submit(view, "acp");
}

test("「停止这一轮并发送」 waits for every running turn to stop before sending the local prompt", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    await deliver(prompt(1, "一直做下去"), chunk("在做"), prompt(2, "另一个已在运行的请求"));
    await hold(view, "先回答这个问题");
    const line = pane(view).querySelector('[data-acp-pending-status="held"]');
    assert.ok(line, "the queued prompt stays in the client outbox");
    assert.equal(posts("/send").length, 0);
    await click(line.querySelector("[data-acp-stop-and-send]"));
    assert.equal(posts("/stop").length, 1);
    assert.equal(pane(view).querySelector("[data-acp-stop-and-send]"), null);
    await deliver(cancel(), answered(2, "cancelled"));
    assert.equal(posts("/send").length, 0, "the first running turn is still open");
    await deliver(answered(1, "cancelled"));
    assert.deepEqual(posts("/send").map(call => call.body.text), ["先回答这个问题"]);
    assert.ok(posts("/send")[0].body.client_message_id);
    await deliver(prompt(3, "先回答这个问题"));
    assert.equal(pane(view).querySelector('[data-acp-pending-status="held"]'), null);
    assert.equal(posts("/send").length, 1);
  } finally { await view.unmount(); }
});

test("two local prompts drain in FIFO order, one completed turn at a time", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    await deliver(prompt(1, "长任务"), chunk("在做"));
    await hold(view, "问题一"); await hold(view, "问题二");
    assert.equal(pane(view).querySelectorAll('[data-acp-pending-status="held"]').length, 2);
    await click(pane(view).querySelectorAll("[data-acp-stop-and-send]")[1]);
    await deliver(cancel(), answered(1, "cancelled"));
    assert.deepEqual(posts("/send").map(call => call.body.text), ["问题一"]);
    await deliver(prompt(2, "问题一"));
    assert.equal(posts("/send").length, 1, "an accepted prompt still owns the next turn");
    await deliver(answered(2, "end_turn"));
    assert.deepEqual(posts("/send").map(call => call.body.text), ["问题一", "问题二"]);
  } finally { await view.unmount(); }
});

test("a local prompt drains once after a natural end without sending cancel", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    await deliver(prompt(1, "一"), chunk("在做"));
    await hold(view, "二");
    assert.equal(posts("/send").length, 0);
    await deliver(answered(1, "end_turn"));
    await deliver(prompt(2, "二"), chunk("这是二的回答"), answered(2, "end_turn"));
    assert.equal(posts("/send").length, 1);
    assert.equal(posts("/stop").length, 0);
  } finally { await view.unmount(); }
});

test("a refused Stop retains the local prompt; a disconnected socket cannot drain it", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    globalThis.__acpRoute = path => path.endsWith("/stop") ? { status: 409, body: { error: { code: "agent_not_running", message: "agent_not_running" } } } : null;
    await deliver(prompt(1, "一"), chunk("在做"));
    await hold(view, "二");
    await click(pane(view).querySelector("[data-acp-stop-and-send]"));
    assert.equal(posts("/stop").length, 1);
    assert.ok(view.host.querySelector("[data-acp-error]").closest("[data-agent-stream-scroller]"), "the error is in the stream");
    assert.ok(pane(view).querySelector("[data-acp-stop-and-send]"), "retry is available");
    assert.equal(posts("/send").length, 0);
    await act(async () => socket().drop()); await settle();
    assert.equal(pane(view).querySelector("[data-acp-stop-and-send]"), null);
    assert.equal(posts("/send").length, 0);
    assert.equal(pane(view).querySelectorAll('[data-acp-pending-status="held"]').length, 1, "disconnect preserves the unsent prompt");
  } finally { await view.unmount(); }
});
