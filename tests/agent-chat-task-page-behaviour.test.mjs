import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";

// The task page's own behaviour on the frames stream (thin-gateway 2026-11-07), on the
// real AgentChat mount harness of agent-chat-conversations.test.mjs (real frames client,
// fake fetch / WebSocket). Rendered component and dispatched calls only, no source text.
await import("./agent-chat-conversations.test.mjs");
const { mount, settle, session, computerTask, cloudTask, rows, connect, deliver, posts, type, submit } = globalThis.__agentChatHarness;

const sessions = [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")];
function scroller(view) { return view.host.querySelector('[data-agent-stream="acp"] [data-agent-stream-scroller]'); }
function metrics(el, { height, client = 600, top }) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: height, writable: true });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: client, writable: true });
  el.scrollTop = top;
}

test("new rows keep the reader at the bottom; scrolled up, the stream stays where the reader is", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    await deliver(rows.prompt(1, "第一句"), rows.chunk("回答一"));
    const el = scroller(view);
    metrics(el, { height: 1000, top: 400 });
    await deliver(rows.chunk("更多"));
    assert.equal(el.scrollTop, 1000, "at the bottom: follows the new row");
    metrics(el, { height: 2000, top: 100 });
    await act(async () => { el.dispatchEvent(new Event("scroll")); });
    await deliver(rows.chunk("再多一点"));
    assert.equal(el.scrollTop, 100, "scrolled up: not pulled back down");
    await type(view, "acp", "下一句");
    await submit(view, "acp");
    await deliver(rows.done(1), rows.prompt(2, "下一句"));
    assert.equal(el.scrollTop, 2000, "the user's own message brings the stream back to the latest row");
  } finally { await view.unmount(); }
});

test("Stop follows the rows across turns: open while a prompt has no response, closed after it, open again for the next", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    assert.equal(view.composer("acp").__props.loading, false, "no prompt row: no turn");
    await deliver(rows.prompt(1, "一"));
    assert.equal(view.composer("acp").__props.loading, true);
    await deliver(rows.done(1));
    assert.equal(view.composer("acp").__props.loading, false);
    await deliver(rows.prompt(2, "二"), rows.chunk("在做"));
    assert.equal(view.composer("acp").__props.loading, true);
    assert.equal(posts("/stop").length, 0, "nothing stops by itself");
  } finally { await view.unmount(); }
});

test("an OceanLeo send carries this window's id (agent UI actions come back to the tab that asked)", async () => {
  const leo = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: [] });
  try {
    const input = leo.composer("cloud");
    await act(async () => { input.__props.onChange("Leo send"); });
    await settle();
    await act(async () => { input.__props.onSubmit("Leo send"); });
    await settle();
    assert.match(globalThis.__followUpBodies.at(-1).client_window, /^w_[0-9a-f]{16}$/);
  } finally { await leo.unmount(); }
});
