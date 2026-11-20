// Task page top bar (wave 2026-11-20 roles, unit HB): a project task reads "Project / Task" with the project name
// linking back to the project (contract §1.4), and the bar is always exactly one row, search included (rulings (5)).
// Real AgentChat mount harness of agent-chat-conversations.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
await import("./agent-chat-conversations.test.mjs");
const { mount, cloudTask } = globalThis.__agentChatHarness;

async function click(node) {
  await act(async () => { node.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
}
const projectTask = (project) => { const data = cloudTask(); data.task = { ...data.task, project }; return data; };

test("a project task shows a Project / Task breadcrumb whose project name opens the project", async () => {
  const view = await mount({ taskId: "t1" }, { task: projectTask({ id: "p1", name: "法务与合规" }) });
  try {
    const header = view.host.querySelector("[data-agent-chat-header]");
    const trail = header.querySelector("[data-agent-chat-title] nav[data-breadcrumb]");
    assert.ok(trail, "breadcrumb in the top bar");
    assert.deepEqual([...trail.querySelectorAll("li")].map((li) => li.textContent), ["法务与合规", "/", "同比分析"]);
    const link = trail.querySelector("a");
    assert.equal(link.getAttribute("href"), "/projects/p1");
    assert.equal(trail.querySelector("[data-breadcrumb-current] a"), null, "the task title is not a link");
    globalThis.__pushed = [];
    await click(link);
    assert.deepEqual(globalThis.__pushed, ["/projects/p1"]);
  } finally { await view.unmount(); }
});

test("a task without a project (or a viewer who is not a project member: project null) shows the title alone", async () => {
  for (const task of [cloudTask(), projectTask(null)]) {
    const view = await mount({ taskId: "t1" }, { task });
    try {
      const title = view.host.querySelector("[data-agent-chat-header] [data-agent-chat-title]");
      assert.equal(title.querySelector("nav"), null);
      assert.equal(title.textContent, "同比分析");
    } finally { await view.unmount(); }
  }
});

test("search opens inside the single row; the right-hand buttons stay; a narrow bar hides the title", async () => {
  const view = await mount({ taskId: "t1" }, { task: projectTask({ id: "p1", name: "法务与合规" }) });
  try {
    const header = view.host.querySelector("[data-agent-chat-header]");
    const others = () => [...header.children].filter((node) => !node.matches('[data-agent-chat-title], [data-agent-chat-search], button[aria-label="搜索"]'));
    const before = others();
    assert.ok(before.length >= 1, "the bar has right-hand controls");
    let width = 900;
    header.getBoundingClientRect = () => ({ width, height: 40, top: 0, left: 0, right: width, bottom: 40, x: 0, y: 0 });
    await click(header.querySelector('button[aria-label="搜索"]'));
    const search = header.querySelector("[data-agent-chat-search]");
    assert.equal(search.parentElement, header, "search is a child of the one row");
    assert.equal(header.style.flexWrap, "");
    assert.match(header.className, /flex-nowrap/);
    assert.equal(search.style.flexBasis, "");
    assert.deepEqual(others(), before, "share / menu controls stay in the same row");
    const title = header.querySelector("[data-agent-chat-title]");
    assert.equal(title.hidden, false, "wide bar keeps the (truncating) title");
    assert.match(title.className, /min-w-0/);
    await click(header.querySelector('button[aria-label="关闭"]'));
    width = 320;
    await click(header.querySelector('button[aria-label="搜索"]'));
    assert.equal(header.querySelector("[data-agent-chat-title]").hidden, true, "narrow bar gives the title's place to search");
    await click(header.querySelector('button[aria-label="关闭"]'));
    assert.equal(header.querySelector("[data-agent-chat-title]").hidden, false, "title returns when search closes");
  } finally { await view.unmount(); }
});
