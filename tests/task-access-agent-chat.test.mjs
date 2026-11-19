import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { TaskAccessMock, ownerAccess } from "./helpers/task-access-mock.ts";

await import("./agent-chat-conversations.test.mjs");
const { mount, session, computerTask, cloudTask, connect, deliver, rows } = globalThis.__agentChatHarness;
const changed = () => act(async () => {
  window.dispatchEvent(new CustomEvent("oceanleo:task-access-changed", { detail: { taskId: "t1" } }));
});

for (const pane of ["cloud", "acp"]) {
  test(`${pane}: detail opens owner transcript, Share and composer despite a hung access request`, async () => {
    const client = new TaskAccessMock();
    let reject;
    client.getAccess = () => new Promise((_, no) => { reject = no; });
    const detail = pane === "cloud" ? cloudTask() : computerTask();
    detail.access = ownerAccess();
    const view = await mount({ taskId: "t1" }, {
      task: detail, taskAccess: client,
      sessions: pane === "acp" ? [session("cts_generic", "acp", "codex", "2026-10-30T11:00:00Z")] : [],
    });
    try {
      if (pane === "acp") { await connect(); await deliver(rows.prompt(1, "Access regression prompt"), rows.chunk("Access regression answer"), rows.done(1)); }
      const composer = view.composer(pane);
      assert.ok(composer); assert.ok(view.host.querySelector("[data-share-entry]"));
      const transcript = view.host.querySelector(`[data-agent-stream="${pane}"]`).textContent;
      assert.match(transcript, pane === "acp" ? /Access regression answer/ : /同比增长 12%/);
      await act(async () => reject(new TypeError("fetch failed")));
      client.getAccess = async () => { throw new TypeError("network offline"); };
      await changed();
      assert.equal(view.composer(pane), composer);
      assert.equal(view.host.querySelector('[data-task-access-status="unstable"]'), null);
      await changed();
      assert.equal(view.composer(pane), composer);
      assert.ok(view.host.querySelector("[data-share-entry]"));
      assert.ok(view.host.querySelector('[data-task-access-status="unstable"]'));
      assert.match(view.host.querySelector(`[data-agent-stream="${pane}"]`).textContent, pane === "acp" ? /Access regression answer/ : /同比增长 12%/);
      client.getAccess = async () => ownerAccess();
      await changed();
      assert.equal(view.host.querySelector('[data-task-access-status="unstable"]'), null);
    } finally { await view.unmount(); }
  });
}

test("first shared decision has a visible loading placeholder, then shows the read-only conversation", async () => {
  const client = new TaskAccessMock(); let resolve;
  client.getAccess = () => new Promise(yes => { resolve = yes; });
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), taskAccess: client });
  try {
    const stream = view.host.querySelector('[data-agent-stream="cloud"]');
    assert.match(stream.querySelector('[data-task-access-status="loading"]').textContent, /正在读取访问权限/);
    assert.equal(view.composer("cloud"), null);
    await act(async () => resolve({ ...ownerAccess(), role: "view", state: "member", can_send: false, can_manage: false }));
    assert.match(stream.textContent, /同比增长 12%/);
    assert.equal(stream.querySelector('[data-task-access-status="loading"]'), null);
    assert.match(view.host.querySelector('[data-task-access-composer]').textContent, /此任务仅供查看/);
  } finally { await view.unmount(); }
});
