import assert from "node:assert/strict";
import test from "node:test";
import { TaskAccessMock, ownerAccess } from "./helpers/task-access-mock.ts";
import { act } from "react";

// 「分享」 on a computer task's page (UX wave 2026-11-07, unit SH), on the real AgentChat mount harness of
// agent-chat-conversations.test.mjs (real frames client and src/acp renderer, fake fetch / WebSocket):
//   - the header has 「分享」 where 「关闭对话」 was; the task page has no Close at all (ending a program is the
//     device panel's);
//   - 「分享」 puts the frames stream in select mode: the prompt and the program's reply get checkboxes, the tool
//     step does not; the composer becomes the share action bar; 复制文本 copies the picked words with the program's
//     name; 取消 brings the composer back.
await import("./agent-chat-conversations.test.mjs");
const { mount, session, computerTask, cloudTask, rows, connect, deliver } = globalThis.__agentChatHarness;

const sessions = [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")];
const toolRow = (rowId) => ({
  id: rowId, direction: "agent", node_seq: rowId, received_at: "2026-11-07T10:00:00Z",
  raw: JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s1",
    update: { sessionUpdate: "tool_call", toolCallId: "tc_ls", title: "ls -la", kind: "execute", status: "completed" } } }),
});

const copied = [];
Object.defineProperty(window.navigator, "clipboard", {
  configurable: true,
  value: { async writeText(text) { copied.push(text); } },
});

async function click(node) {
  await act(async () => { node.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
}
const stream = (view) => view.host.querySelector('[data-agent-stream="acp"]');
const button = (view, title) => document.querySelector(`[data-access-popover] button[title="${title}"]`) || view.host.querySelector(`button[title="${title}"]`);

test("a computer task's header shows 「分享」, never 「关闭对话」", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    await deliver(rows.prompt(3, "列出文件"), rows.chunk("目录里有三个文件。"), rows.done(3));
    const entry = view.host.querySelector("[data-share-entry]");
    assert.ok(entry, "Share is in the header");
    assert.equal(entry.getAttribute("data-share-entry"), "idle");
    assert.equal(view.host.querySelector("[data-acp-close]"), null);
    assert.doesNotMatch(view.host.textContent, /关闭对话/);
  } finally { await view.unmount(); }
});

test("an empty computer task still offers member sharing in the header", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    assert.ok(view.host.querySelector("[data-share-entry]"));
    assert.equal(view.host.querySelector("[data-acp-close]"), null);
  } finally { await view.unmount(); }
});

test("Share selects transcript messages and exposes export actions at the top while keeping the composer", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    const prompt = rows.prompt(3, "列出文件");
    const tool = toolRow(prompt.id + 1);
    await deliver(prompt, tool);
    const reply = rows.chunk("目录里有三个文件。");
    reply.id = tool.id + 1;
    await deliver(reply, { ...rows.done(3), id: tool.id + 2 });
    assert.ok(view.composer("acp"));

    await click(view.host.querySelector("[data-share-entry]"));
    assert.equal(view.host.querySelector("[data-share-entry]").getAttribute("data-share-entry"), "active");
    const boxes = [...stream(view).querySelectorAll('[role="checkbox"]')];
    assert.equal(boxes.length, 2, "the prompt and the reply; the tool step has none");
    assert.deepEqual(boxes.map((box) => box.getAttribute("aria-checked")), ["true", "true"], "entering from the header picks all");
    assert.ok(view.composer("acp"), "selection preserves the composer");
    assert.ok(document.querySelector("[data-task-share-actions]"));
    assert.equal(view.host.querySelector('[data-agent-chat-footer] [data-task-share-actions]'), null);

    await click(button(view, "复制文本"));
    const text = copied.at(-1);
    assert.match(text, /列出文件/);
    assert.match(text, /Codex/);
    assert.match(text, /目录里有三个文件。/);
    assert.doesNotMatch(text, /ls -la/);

    // Untick the prompt: only the reply is copied.
    await click(boxes[0]);
    await click(button(view, "复制文本"));
    assert.doesNotMatch(copied.at(-1), /列出文件/);
    assert.match(copied.at(-1), /目录里有三个文件。/);

    await click([...document.querySelectorAll("[data-task-share-actions] button")].find(node => node.textContent === "清除选择"));
    assert.equal(stream(view).querySelectorAll('[role="checkbox"]').length, 0);
    assert.ok(view.composer("acp"), "the composer is back");
  } finally { await view.unmount(); }
});

test("an OceanLeo cloud task keeps its 「分享」", async () => {
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), sessions });
  try {
    assert.ok(view.host.querySelector("[data-share-entry]"));
  } finally { await view.unmount(); }
});


test("invitation composer accepts Collaborate, hides owner settings, and becomes read-only live after removal", async () => {
  const access = new TaskAccessMock();
  access.access = { ...ownerAccess(), role: "view", state: "invited", invite_role: "collaborate", can_send: false, can_manage: false, general_access: "restricted" };
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), taskAccess: access });
  try {
    assert.equal(view.composer("cloud"), null);
    assert.ok(view.host.textContent.includes("接受邀请"));
    assert.ok(view.host.textContent.includes("拒绝"));
    await click([...view.host.querySelectorAll("[data-task-access-composer] button")].find(node => node.textContent === "接受邀请"));
    assert.ok(view.composer("cloud"));
    assert.equal(view.composer("cloud").__props.showModelPicker, false);
    assert.equal(view.composer("cloud").__props.showComputerDock, false);
    access.access = { ...access.access, role: "view", state: "removed", can_send: false, visible_until: { message_id: 1, frame_id: 0 } };
    await act(async () => { window.dispatchEvent(new CustomEvent("oceanleo:task-access-changed", { detail: { taskId: "t1" } })); await new Promise(resolve => setTimeout(resolve, 30)); });
    assert.equal(view.composer("cloud"), null);
    assert.ok(view.host.textContent.includes("作为我的任务继续"));
    assert.ok(view.host.textContent.includes("帮我算个同比"));
    assert.equal(view.host.textContent.includes("同比增长 12%"), false, "history is clamped at the removal marker");
  } finally { await view.unmount(); }
});

test("declining an invitation keeps a public task readable without enabling sends", async () => {
  const access = new TaskAccessMock();
  access.access = { ...ownerAccess(), role: "view", state: "invited", invite_role: "view", can_send: false, can_manage: false, general_access: "public_view" };
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), taskAccess: access });
  try {
    await click([...view.host.querySelectorAll("[data-task-access-composer] button")].find(node => node.textContent === "拒绝"));
    assert.equal(view.composer("cloud"), null);
    assert.equal(view.host.querySelector("[data-task-access-composer]").dataset.taskAccessComposer, "public");
    assert.ok(view.host.textContent.includes("同比增长 12%"));
  } finally { await view.unmount(); }
});
