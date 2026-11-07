import assert from "node:assert/strict";
import test from "node:test";
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
const button = (view, title) => view.host.querySelector(`button[title="${title}"]`);

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

test("an empty computer task has nothing to share: no 「分享」 until a message is on screen", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions });
  try {
    await connect();
    assert.equal(view.host.querySelector("[data-share-entry]"), null);
    assert.equal(view.host.querySelector("[data-acp-close]"), null);
  } finally { await view.unmount(); }
});

test("「分享」 selects the prompt and the reply (not the tool step); 复制文本 copies them as Codex; 取消 restores the composer", async () => {
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
    assert.equal(view.composer("acp"), null, "the action bar replaces the composer");
    assert.ok(button(view, "复制链接"));

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

    await click(button(view, "取消"));
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
