import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { TaskAccessMock, ownerAccess } from "./helpers/task-access-mock.ts";
import { setCacheUser } from "../src/lib/user-scoped-cache.ts";

await import("./agent-chat-conversations.test.mjs");
const { mount, session, computerTask, cloudTask, connect, deliver, rows } = globalThis.__agentChatHarness;
const changed = () => act(async () => {
  window.dispatchEvent(new CustomEvent("oceanleo:task-access-changed", { detail: { taskId: "t1" } }));
});

for (const pane of ["cloud", "acp"]) {
  for (const strictMode of [false, true]) {
    test(`${pane}: hard-load detail survives SIGNED_IN before INITIAL_SESSION with every access request failing (StrictMode ${strictMode})`, async () => {
      setCacheUser(null);
      const client = new TaskAccessMock();
      client.getAccess = async () => { throw new TypeError("access endpoint unavailable"); };
      let complete;
      const taskRead = new Promise(resolve => { complete = resolve; });
      const detail = pane === "cloud" ? cloudTask() : computerTask();
      detail.access = ownerAccess();
      const view = await mount({ taskId: "t1" }, {
        taskRead, taskAccess: client, strictMode,
        sessions: pane === "acp" ? [session("cts_generic", "acp", "generic", "2026-10-30T11:00:00Z")] : [],
      });
      try {
        await act(async () => {
          window.dispatchEvent(new CustomEvent("oceanleo:auth-state", { detail: { event: "SIGNED_IN", userId: "owner-a" } }));
          window.dispatchEvent(new CustomEvent("oceanleo:auth-state", { detail: { event: "INITIAL_SESSION", userId: "owner-a" } }));
        });
        await act(async () => complete({ ok: true, data: detail }));
        if (pane === "acp") { await connect(); await deliver(rows.prompt(1, "Owner prompt"), rows.chunk("Owner answer"), rows.done(1)); }
        assert.ok(view.composer(pane), view.host.textContent);
        assert.ok(view.host.querySelector("[data-share-entry]"));
        assert.match(view.host.querySelector(`[data-agent-stream="${pane}"]`).textContent, pane === "acp" ? /Owner answer/ : /同比增长 12%/);
        const composer = view.composer(pane);
        await act(async () => {
          window.dispatchEvent(new CustomEvent("oceanleo:auth-state", { detail: { event: "TOKEN_REFRESHED", userId: "owner-a" } }));
        });
        assert.equal(view.composer(pane), composer);
        assert.equal(view.host.querySelector('[data-task-access-status="error"]'), null);
      } finally { await view.unmount(); setCacheUser(null); }
    });
  }

  test(`${pane}: cached owner detail survives auth initialization without an access read`, async () => {
    setCacheUser("owner-a");
    const client = new TaskAccessMock();
    let accessReads = 0;
    client.getAccess = async () => { ++accessReads; throw new Error("owner must not depend on access endpoint"); };
    const detail = pane === "cloud" ? cloudTask() : computerTask();
    detail.access = ownerAccess();
    const view = await mount({ taskId: "t1", initialTask: detail }, {
      task: detail, taskAccess: client,
      sessions: pane === "acp" ? [session("cts_generic", "acp", "generic", "2026-10-30T11:00:00Z")] : [],
    });
    try {
      const composer = view.composer(pane);
      assert.ok(composer);
      await act(async () => {
        window.dispatchEvent(new CustomEvent("oceanleo:auth-state", { detail: { event: "INITIAL_SESSION", userId: "owner-a" } }));
      });
      assert.equal(view.composer(pane), composer);
      assert.ok(view.host.querySelector("[data-share-entry]"));
      assert.equal(accessReads, 0);
    } finally { await view.unmount(); setCacheUser(null); }
  });

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
    assert.match(stream.textContent, /此任务仅供查看/);
    assert.doesNotMatch(view.host.querySelector('[data-task-access-composer]').textContent, /此任务仅供查看/);
  } finally { await view.unmount(); }
});
