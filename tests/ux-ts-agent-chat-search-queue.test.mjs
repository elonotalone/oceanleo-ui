import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";

// UX wave 2026-11-07 (TS) on the real AgentChat mount harness of agent-chat-conversations.test.mjs (real frames
// client, fake fetch / WebSocket): the header search counts hits in a computer task's rows, and 「停止这一轮并发送」
// under a queued prompt stops the turn and sends that prompt again once the stop ended it unread.
await import("./agent-chat-conversations.test.mjs");
const { mount, settle, session, computerTask, connect, deliver, posts, socket } = globalThis.__agentChatHarness;

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

test("「停止这一轮并发送」: Stop now, the queued text goes again only after the stop ended every turn", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    await deliver(prompt(1, "一直做下去"), chunk("在做"), prompt(2, "先回答这个问题"));
    const line = pane(view).querySelector("[data-acp-queued]");
    assert.ok(line.textContent.includes("排队中：这一轮做完后它会看到"));
    await click(line.querySelector("[data-acp-stop-and-send]"));
    assert.equal(posts("/stop").length, 1, "Stop went out");
    assert.equal(posts("/send").length, 0, "nothing sent while the turns are open");
    assert.equal(pane(view).querySelector("[data-acp-stop-and-send]"), null, "one click: the button is gone");
    await deliver(cancel(), answered(2, "cancelled"));
    assert.equal(posts("/send").length, 0, "the running turn has not answered yet");
    await deliver(answered(1, "cancelled"));
    const sends = posts("/send");
    assert.equal(sends.length, 1);
    assert.equal(sends[0].body.text, "先回答这个问题");
    assert.ok(sends[0].body.client_message_id, "a new message id");
    assert.equal(sends[0].body.attachments, undefined);
    await deliver(prompt(3, "先回答这个问题"));
    assert.equal(pane(view).querySelector("[data-acp-queued]"), null, "the new prompt is not queued");
    await settle();
    assert.equal(posts("/send").length, 1, "sent once");
  } finally { await view.unmount(); }
});

test("two queued prompts go again in order after the stop", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    await deliver(prompt(1, "长任务"), chunk("在做"), prompt(2, "问题一"), prompt(3, "问题二"));
    assert.equal(pane(view).querySelectorAll("[data-acp-queued]").length, 2);
    await click(pane(view).querySelectorAll("[data-acp-stop-and-send]")[1]);
    await deliver(cancel(), answered(2, "cancelled"), answered(3, "cancelled"), answered(1, "cancelled"));
    assert.deepEqual(posts("/send").map((call) => call.body.text), ["问题一", "问题二"]);
  } finally { await view.unmount(); }
});

test("a program that runs the queued prompt after the cancel gets nothing sent again", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    await deliver(prompt(1, "一"), chunk("在做"), prompt(2, "二"));
    await click(pane(view).querySelector("[data-acp-stop-and-send]"));
    await deliver(cancel(), answered(1, "cancelled"), chunk("这是二的回答"), answered(2, "end_turn"));
    assert.equal(posts("/send").length, 0);
  } finally { await view.unmount(); }
});

test("a refused Stop sends nothing and the button comes back; the socket going down drops the click", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    globalThis.__acpRoute = (path) => (path.endsWith("/stop") ? { status: 409, body: { error: { code: "agent_not_running", message: "agent_not_running" } } } : null);
    await deliver(prompt(1, "一"), chunk("在做"), prompt(2, "二"));
    await click(pane(view).querySelector("[data-acp-stop-and-send]"));
    assert.equal(posts("/stop").length, 1);
    assert.ok(view.host.querySelector("[data-acp-error]"), "the gateway's words under the composer");
    assert.ok(pane(view).querySelector("[data-acp-stop-and-send]"), "the button is back");
    await deliver(answered(2, "cancelled"), answered(1, "cancelled"));
    assert.equal(posts("/send").length, 0);

    globalThis.__acpRoute = null;
    await deliver(prompt(3, "三"), chunk("在做"), prompt(4, "四"));
    await click(pane(view).querySelector("[data-acp-stop-and-send]"));
    await act(async () => { socket().drop(); });
    await settle();
    assert.equal(pane(view).querySelector("[data-acp-stop-and-send]"), null, "no button while disconnected");
    assert.equal(posts("/send").length, 0, "nothing is sent later on its own");
  } finally { await view.unmount(); }
});
