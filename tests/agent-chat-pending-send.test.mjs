import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";

// Home Send opens the task page at once (operator ruling 2026-11-06 21:06; UX wave 2026-11-07, unit HJ,
// contract §2.5). The home puts the message in the pending store and the task view (AgentChat with
// `pendingId`) is on screen in the same commit: the user's bubble from the local copy and the task
// composer. The task id arrives later and is adopted in place; the message's own row replaces the bubble
// in the same render (never two bubbles, never none). Real AgentChat mount harness of
// agent-chat-conversations.test.mjs (real frames client, fake fetch / WebSocket).
await import("./agent-chat-conversations.test.mjs");
const { mount, settle, session, socket, connect, deliver, posts, type, submit } = globalThis.__agentChatHarness;
const { putPending, settlePending, readPending } = await import("../src/shell/acp-task/pending-send.ts");
const { AcpSendError } = globalThis.__agentChatHarness.acpFrames;

const SPEC = { url: "", artifact_id: "art-1", revision_id: "rev-1", name: "spec.pdf", mime: "application/pdf", media_type: "doc" };
function put(overrides = {}) {
  return putPending({
    clientMessageId: "11111111-1111-4111-8111-111111111111",
    computerId: "cc_elon",
    program: "claude",
    text: "修一下构建",
    attachments: [SPEC],
    choice: { model: "opus" },
    ...overrides,
  });
}
const userBubbles = (view) => [...view.host.querySelectorAll('[data-agent-stream="acp"] [data-testid="task-user-bubble"]')];
const pendingBubble = (view) => view.host.querySelector("[data-acp-pending-send]");
const claudeSession = session("cts_home", "acp", "claude");
const sessionNew = (id) => row("client", { id, method: "session/new", params: { cwd: "/root", mcpServers: [] } });
const sessionNewResult = (id) => row("agent", { id, result: { sessionId: "s1", modes: { currentModeId: "default", availableModes: [] } } });
// Row ids are the commit order and the socket continues after the last one: one sequence for every row here.
const prompt = (id, text) => row("client", { id, method: "session/prompt", params: { sessionId: "s1", prompt: [{ type: "text", text }] } });
let seq = 10_000;
function row(direction, message) {
  seq += 1;
  return { id: seq, direction, node_seq: direction === "agent" ? seq : null, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z" };
}

test("opened with a pending message: the bubble (text + files) and the task composer are there in the first commit, with no network answer", async () => {
  const pendingId = put();
  // Nothing the gateway answers is needed for the first paint: the computer read hangs.
  const view = await mount({ pendingId }, { url: `/tasks/new?pending=${pendingId}`, computerMode: "hang", settleMount: false });
  try {
    const bubble = pendingBubble(view);
    assert.ok(bubble, "the user's bubble is on screen at once");
    assert.equal(userBubbles(view).length, 1);
    assert.match(bubble.textContent, /修一下构建/);
    assert.match(bubble.textContent, /spec\.pdf/, "its file, from the local copy");
    assert.equal(view.host.querySelector('[data-agent-stream="cloud"]'), null, "the program's task view, not OceanLeo's");
    const composer = view.composer("acp");
    assert.ok(composer, "the task composer is there");
    assert.equal(composer.textContent.startsWith("elon · claude") || composer.textContent.startsWith("cc_elon · claude"), true, "it addresses the program on that computer");
    assert.equal(composer.__props.sendBlocked, true, "nothing else is sent while the first message is on its way");
    assert.equal(view.host.querySelector("[data-acp-pending-error]"), null);
    assert.equal(posts("/send").length, 0, "the home sends the message; the task view does not send it again");
    assert.doesNotMatch(view.host.textContent, /在下方输入|正在加载任务|正在创建|Sending|正在发送|发送中|上一条还在发送/i);
    assert.equal(view.composer("acp").__props.sendBlockedReason, null);
  } finally { await view.unmount(); }
});

test("the task id is adopted in place (no remount, no list read); the message's own row replaces the bubble with no duplicate", async () => {
  const pendingId = put();
  const created = [];
  const view = await mount({ pendingId, onTaskCreated: (id) => created.push(id) }, { url: `/tasks/new?pending=${pendingId}` });
  try {
    const pane = view.host.querySelector("[data-acp-stream-pane]");
    assert.ok(pane);
    assert.equal(globalThis.__sockets.length, 0, "no task yet: no frames socket");
    await act(async () => { settlePending(pendingId, { taskId: "t1", session: { ...claudeSession, task_id: "t1" } }); });
    await settle();
    assert.deepEqual(created, ["t1"], "the host is told once (it replaces the URL)");
    assert.equal(view.host.querySelector("[data-acp-stream-pane]"), pane, "the same pane: nothing remounted");
    assert.equal(view.host.querySelector('[data-agent-stream="cloud"]'), null, "the OceanLeo pane never shows while the task row is unread");
    assert.match(socket().url, /\/v1\/tasks\/t1\/frames\?/, "the frames socket opens for the new task");
    assert.equal(globalThis.__gateway.some((call) => call.path.startsWith("/v1/computer-task-sessions?")), false, "the created session is used, no list read");
    assert.equal(userBubbles(view).length, 1);
    assert.ok(pendingBubble(view), "still the local copy");
    await connect();
    await deliver(sessionNew(1), sessionNewResult(1));
    assert.equal(userBubbles(view).length, 1, "session/new rows: the bubble stays, once");
    assert.ok(pendingBubble(view));
    await act(async () => { settlePending(pendingId, { taskId: "t1", rowId: null }); });
    await deliver(prompt(2, "修一下构建"));
    assert.equal(pendingBubble(view), null, "the row replaced the local copy");
    const bubbles = userBubbles(view);
    assert.equal(bubbles.length, 1, "one bubble, never two");
    assert.match(bubbles[0].textContent, /修一下构建/);
    assert.ok(view.host.querySelector("[data-acp-transcript]").contains(bubbles[0]), "it is the transcript's own row now");
    assert.equal(view.host.querySelector("[data-acp-stream-pane]"), pane);
    assert.equal(view.composer("acp").__props.sendBlocked, false, "the composer works once the message is accepted");
    await type(view, "acp", "再看看测试");
    await submit(view, "acp");
    const sent = posts("/v1/tasks/t1/send");
    assert.equal(sent.length, 1);
    assert.equal("model" in sent[0].body, false, "the first message's choices are not sent again");
  } finally { await view.unmount(); }
});

test("the home send stays quiet while its request runs, then allows a distinct follow-up before the echo", async () => {
  const pendingId = put({ attachments: [] });
  const view = await mount({ pendingId }, { url: `/tasks/new?pending=${pendingId}` });
  try {
    await act(async () => { settlePending(pendingId, { taskId: "t1", session: { ...claudeSession, task_id: "t1" } }); });
    await settle();
    await connect();
    assert.equal(view.composer("acp").__props.sendBlocked, true, "create did not finish POST /send");
    assert.equal(view.composer("acp").__props.sendBlockedReason, null);
    assert.doesNotMatch(view.host.textContent, /Sending|正在发送|发送中|上一条还在发送/i);
    await act(async () => { settlePending(pendingId, { taskId: "t1", rowId: null, queued: false }); });
    await settle();
    assert.equal(readPending(pendingId).status, "accepted");
    assert.equal(view.composer("acp").__props.sendBlocked, false);
    await type(view, "acp", "还有这一个");
    await submit(view, "acp");
    assert.equal(posts("/send").length, 1);
    assert.equal(posts("/send")[0].body.text, "还有这一个");
    assert.equal("model" in posts("/send")[0].body, false, "accepted home choices are not repeated");
    assert.equal(readPending(pendingId).text, "修一下构建", "the follow-up does not reuse or overwrite the first bubble");
    assert.equal(view.host.querySelectorAll("[data-acp-pending-send]").length, 2);
    await deliver(prompt(80, "还有这一个"));
    assert.ok(pendingBubble(view), "a different prompt row cannot replace the home bubble");
    assert.equal(userBubbles(view).length, 2);
    await deliver(prompt(81, "修一下构建"));
    assert.equal(pendingBubble(view), null);
  } finally { await view.unmount(); }
});

test("a failed send: the gateway's words under the bubble, the text and file back in the composer; the user's retry reuses the message id", async () => {
  const pendingId = put();
  const view = await mount({ pendingId }, { url: `/tasks/new?pending=${pendingId}` });
  try {
    await act(async () => { settlePending(pendingId, { taskId: "t1", session: { ...claudeSession, task_id: "t1" } }); });
    await settle();
    await connect();
    await act(async () => { settlePending(pendingId, { error: new AcpSendError(0, "Failed to fetch", null, null) }); });
    await settle();
    assert.equal(view.host.querySelector("[data-acp-pending-error]").textContent, "Failed to fetch", "verbatim");
    assert.ok(pendingBubble(view).contains(view.host.querySelector("[data-acp-pending-error]")), "under the bubble");
    assert.ok(pendingBubble(view).querySelector("[data-acp-pending-retry]"), "the home send also exposes retry");
    assert.equal(userBubbles(view).length, 1);
    const composer = view.composer("acp");
    assert.equal(composer.__props.value, "修一下构建", "the text is back for the user to send");
    assert.deepEqual(composer.__props.attachments.map((item) => item.name), ["spec.pdf"]);
    assert.equal(composer.__props.sendBlocked, false);
    assert.equal(posts("/send").length, 0, "no automatic resend");
    await act(async () => { pendingBubble(view).querySelector("[data-acp-pending-retry]").click(); });
    await settle();
    const sent = posts("/v1/tasks/t1/send");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.client_message_id, "11111111-1111-4111-8111-111111111111", "the same message: the gateway keeps one row");
    assert.deepEqual(sent[0].body.attachments, [SPEC]);
    assert.equal(view.host.querySelector("[data-acp-pending-error]"), null, "the old failure is no longer said");
    await deliver(prompt(3, "修一下构建"));
    assert.equal(userBubbles(view).length, 1);
    assert.equal(pendingBubble(view), null);
  } finally { await view.unmount(); }
});

test("a program's refusal (409 with its error) is said once, in its row; the text comes back and the retry is a new message", async () => {
  const pendingId = put({ clientMessageId: "22222222-2222-4222-8222-222222222222" });
  const view = await mount({ pendingId }, { url: `/tasks/new?pending=${pendingId}` });
  try {
    await act(async () => { settlePending(pendingId, { taskId: "t1", session: { ...claudeSession, task_id: "t1" } }); });
    await settle();
    await connect();
    const rpc = { code: -32602, message: "Invalid params", data: { model: "opus" } };
    await deliver(row("client", { id: 5, method: "session/set_model", params: { sessionId: "s1", modelId: "opus" } }), row("agent", { id: 5, error: rpc }));
    await act(async () => { settlePending(pendingId, { error: new AcpSendError(409, "Invalid params", rpc, { error: rpc }) }); });
    await settle();
    assert.equal(view.host.querySelector("[data-acp-pending-error]"), null, "not repeated under the bubble");
    assert.equal((view.host.textContent.match(/Invalid params/g) || []).length, 1, "the program's row says it once");
    assert.equal(view.composer("acp").__props.value, "修一下构建");
    await submit(view, "acp");
    const sent = posts("/v1/tasks/t1/send");
    assert.equal(sent.length, 1);
    assert.notEqual(sent[0].body.client_message_id, "22222222-2222-4222-8222-222222222222", "nothing went out: a new message");
  } finally { await view.unmount(); }
});

test("the create failed (no task): the error under the bubble; the retry makes the task with the message id as its request id", async () => {
  const pendingId = put({ clientMessageId: "33333333-3333-4333-8333-333333333333", attachments: [] });
  const created = [];
  const view = await mount({ pendingId, onTaskCreated: (id) => created.push(id) }, { url: `/tasks/new?pending=${pendingId}` });
  try {
    await act(async () => { settlePending(pendingId, { error: new Error("网络错误：无法连接到网关。") }); });
    await settle();
    assert.equal(view.host.querySelector("[data-acp-pending-error]").textContent, "网络错误：无法连接到网关。");
    assert.equal(view.composer("acp").__props.value, "修一下构建");
    await submit(view, "acp");
    const create = globalThis.__gateway.filter((call) => call.method === "POST" && call.path.endsWith("/task-sessions"));
    assert.equal(create.length, 1);
    assert.equal(create[0].body.request_id, "33333333-3333-4333-8333-333333333333", "the same request id as the home's create");
    assert.equal(create[0].body.program, "claude");
    assert.equal(posts("/v1/tasks/t_new/send")[0].body.client_message_id, "33333333-3333-4333-8333-333333333333");
    assert.deepEqual(created, ["t_new"]);
    assert.equal(userBubbles(view).length, 1, "the bubble stays until the row arrives");
    await connect();
    await deliver(prompt(4, "修一下构建"));
    assert.equal(userBubbles(view).length, 1);
    assert.equal(pendingBubble(view), null);
  } finally { await view.unmount(); }
});
