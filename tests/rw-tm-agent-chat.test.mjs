// Wave 2026-11-20 TM: on a project task, Can collaborate members get the
// composer, Can view / viewers get the read-only footer with "Continue as my
// own task", the owner gets the mode control, and an idle cloud task that
// others can see updates from the task push stream without a reload.
import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { TaskAccessMock, ownerAccess } from "./helpers/task-access-mock.ts";
import { setCacheUser } from "../src/lib/user-scoped-cache.ts";

await import("./agent-chat-conversations.test.mjs");
const { mount, cloudTask, settle } = globalThis.__agentChatHarness;

const member = (role) => ({ ...ownerAccess(), role, state: "member", can_send: role === "collaborate", can_manage: false,
  owner: { name: "Elon", initial: "E" } });
const projectTask = (mode, access) => {
  const detail = cloudTask();
  detail.task = { ...detail.task, project_mode: mode, ...(access.role === "owner" ? { project_id: "p1" } : {}) };
  detail.access = access;
  return detail;
};
async function open(detail, acpRoute) {
  const client = new TaskAccessMock();
  client.access = { ...detail.access };
  return mount({ taskId: "t1", initialTask: detail }, { task: detail, taskAccess: client, acpRoute });
}

test("a Can collaborate project task gives a member the normal composer", async () => {
  setCacheUser("member-a");
  const view = await open(projectTask("collaborate", member("collaborate")));
  try {
    assert.ok(view.composer("cloud"), view.host.textContent);
    assert.equal(view.host.querySelector("[data-task-access-composer]"), null);
    assert.equal(view.host.querySelector("[data-project-task-mode]"), null, "only the owner changes the mode");
  } finally { await view.unmount(); setCacheUser(null); }
});

test("a Can view project task is read-only with Continue as my own task", async () => {
  setCacheUser("member-a");
  const view = await open(projectTask("view", member("view")));
  try {
    assert.equal(view.composer("cloud"), null);
    const footer = view.host.querySelector("[data-task-access-composer]");
    assert.equal(footer?.dataset.taskAccessComposer, "member");
    assert.ok([...footer.querySelectorAll("button")].some((button) => /Continue as my own task|作为我的任务继续/.test(button.textContent)));
  } finally { await view.unmount(); setCacheUser(null); }
});

test("the owner's project task shows its mode control in the task header", async () => {
  setCacheUser("owner-a");
  const view = await open(projectTask("collaborate", ownerAccess()));
  try {
    const control = view.host.querySelector("[data-agent-chat-header] [data-project-task-mode]");
    assert.equal(control?.dataset.projectTaskMode, "collaborate");
    assert.ok(view.composer("cloud"));
  } finally { await view.unmount(); setCacheUser(null); }
});

test("an idle cloud task someone else continues appears without a reload", async () => {
  setCacheUser("member-a");
  const detail = projectTask("view", member("view"));
  const streams = [];
  const route = async (path) => {
    if (!path.endsWith("/v1/tasks/t1/events")) return null;
    streams.push(path);
    if (streams.length === 1) {
      // The owner (or another member) starts a turn while this page sits idle.
      const next = projectTask("view", member("view"));
      next.task.status = "done";
      next.messages.push({ id: 3, role: "user", kind: "text", content: "再按季度拆一下",
        sender_user_id: "owner", sender: { name: "Elon", initial: "E" } },
      { id: 4, role: "assistant", kind: "text", content: "第三季度增长最快。", meta: { done: true } });
      globalThis.__task = next;
      return { bytes: new TextEncoder().encode("event: snapshot\ndata: {}\n\n"), mime: "text/event-stream" };
    }
    return { bytes: new Uint8Array(), mime: "text/event-stream" };
  };
  const view = await open(detail, route);
  try {
    for (let i = 0; i < 10 && !/第三季度增长最快/.test(view.host.textContent); i++) await settle(30);
    assert.ok(streams.length >= 1, "the page opened the task push stream");
    assert.match(view.host.textContent, /再按季度拆一下/);
    assert.match(view.host.textContent, /第三季度增长最快/);
  } finally { await view.unmount(); setCacheUser(null); }
});

test("an owner-only private task opens no push stream", async () => {
  setCacheUser("owner-a");
  const detail = cloudTask();
  detail.access = ownerAccess();
  const view = await open(detail);
  try {
    await settle(30);
    assert.equal(globalThis.__acpCalls.filter((call) => call.path.endsWith("/events")).length, 0);
  } finally { await view.unmount(); setCacheUser(null); }
});
