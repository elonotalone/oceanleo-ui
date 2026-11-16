import assert from "node:assert/strict";
import test from "node:test";
import { TaskAccessMock, ownerAccess } from "./helpers/task-access-mock.ts";
import { act } from "react";

// 「分享」 on a computer task's page (UX wave 2026-11-07, unit SH), on the real AgentChat mount harness of
// agent-chat-conversations.test.mjs (real frames client and src/acp renderer, fake fetch / WebSocket):
//   - the header has 「分享」 where 「关闭对话」 was; the task page has no Close at all (ending a program is the
//     device panel's);
//   - 「分享」 puts the frames stream in select mode: the prompt and the program's reply get checkboxes, the tool
//     step does not; the composer stays, actions are in the header panel; 复制文本 copies the picked words with the program's
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

test("a collaborator uses the public program descriptor and sends without owner-only settings or computer ids", async () => {
  const access = new TaskAccessMock();
  access.access = { ...ownerAccess(), role: "collaborate", state: "member", can_manage: false, general_access: "restricted" };
  const sharedSession = {task_id:"t1",kind:"acp",program:"codex"};
  const { type, submit, posts } = globalThis.__agentChatHarness;
  const view = await mount({taskId:"t1"}, {task:computerTask(),sessions:[sharedSession],taskAccess:access});
  try {
    await connect(); await deliver(rows.prompt(1,"Previous message"), rows.chunk("Codex answer"), rows.done(1));
    assert.ok(view.composer("acp"));
    assert.equal(view.composer("acp").__props.showModelPicker, false);
    await type(view,"acp","Continue the same agent"); await submit(view,"acp");
    const body = posts("/send").at(-1).body;
    assert.equal(body.text,"Continue the same agent");
    for (const key of ["model","mode","config","computer_id","program"]) assert.equal(key in body,false,key);
    await click(view.host.querySelector("[data-share-entry]")); await click(button(view,"复制文本"));
    assert.match(copied.at(-1), /Codex/);
  } finally { await view.unmount(); }
});


test("a fork's first composer target is selectable and travels with its first follow-up", async () => {
  const task=cloudTask();
  task.task.forked_from_task_id="source-task";
  task.task.plan={continued_copy:true,context_kind:"computer_transcript"};
  const {type}=globalThis.__agentChatHarness;
  const view=await mount({taskId:"t1"},{task});
  try {
    const composer=view.composer("cloud");
    assert.ok(composer);
    assert.equal(composer.__props.boundExecutionTarget,undefined);
    assert.equal(composer.__props.conversation,undefined);
    await type(view,"cloud","Continue on my computer");
    const target={kind:"device",id:"my-computer",name:"My computer"};
    await act(async()=>{view.composer("cloud").__props.onSubmit(undefined,undefined,{executionTarget:target});await new Promise(resolve=>setTimeout(resolve,20));});
    assert.deepEqual(globalThis.__followUpBodies.at(-1).options,{preserveTaskSettings:false,bindExecutionTarget:true,executionTarget:target});
  } finally {await view.unmount();}
});

test("shared native agent follow-ups retain the owner's settings", async()=>{
 const access=new TaskAccessMock(); access.access={...ownerAccess(),role:"collaborate",state:"member",can_manage:false};
 const {type,submit}=globalThis.__agentChatHarness;
 const view=await mount({taskId:"t1"},{task:cloudTask(),taskAccess:access});
 try {await type(view,"cloud","Use the same agent");await submit(view,"cloud");assert.equal(globalThis.__followUpBodies.at(-1).options.preserveTaskSettings,true);assert.equal(globalThis.__followUpBodies.at(-1).options.bindExecutionTarget,false);}
 finally {await view.unmount();}
});

test("an explicit task view keeps its historical initialPrompt behavior while access loads",async()=>{
 const access=new TaskAccessMock();let release;access.getAccess=async()=>new Promise(resolve=>{release=resolve;});
 const view=await mount({taskId:"t1",initialPrompt:"Continue from the task URL"},{task:cloudTask(),taskAccess:access});
 try {
  assert.equal(globalThis.__followUps.length,0);
  access.getAccess=TaskAccessMock.prototype.getAccess;
  await act(async()=>{release(ownerAccess());await new Promise(resolve=>setTimeout(resolve,30));});
  assert.deepEqual(globalThis.__followUps,[],"explicit task views ignore initialPrompt as before");
 } finally {await view.unmount();}
});

test("public task viewers see each participant's authorship",async()=>{
 const access=new TaskAccessMock();access.access={...ownerAccess(),role:"view",state:"public",general_access:"public_view",can_send:false,can_manage:false};
 const task=cloudTask();task.messages[0].sender={user_id:"owner",name:"Owner",initial:"O"};task.messages.push({id:3,role:"user",kind:"text",content:"A teammate prompt",sender:{user_id:"teammate",name:"Teammate",initial:"T"}});
 const view=await mount({taskId:"t1"},{task,taskAccess:access});
 try {const labels=[...view.host.querySelectorAll('[data-message-author]')].map(node=>node.textContent);assert.equal(labels.length,2);assert.ok(labels.some(label=>label.includes("Teammate")));}
 finally {await view.unmount();}
});
