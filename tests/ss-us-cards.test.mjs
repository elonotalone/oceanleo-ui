// Session / sites wave, unit US: the two cards of a session and the right panel's task / quote view.
//   - task card: a reader without access sees the title and "No access", the card is not a button and opens nothing;
//     with access it shows program · status and opens the task (host callback, or `oceanleo:open-task-panel`);
//   - quote card: "N messages from <source>" + the first two lines; click → `oceanleo:open-quote-panel`;
//   - quote view: the snapshot's lines read-only, NO composer (no text field, no send);
//   - the panel: a task entry mounts AgentChat on that task, a draft mounts it without a task id (in its project).
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__usReact = React;
const { createRoot } = await import("react-dom/client");
for (const key of ["HTMLButtonElement", "CustomEvent", "Event"]) globalThis[key] = window[key];

globalThis.__usCard = { access: "allowed", activity: null };
globalThis.__usAgentChats = [];
const ui = dataModule("export function useUI(){return (text, params={}) => text.replace(/\\{(\\w+)\\}/g,(_,k)=>params[k] ?? k);}");
const cardHook = dataModule("export function useTaskCard(){ return globalThis.__usCard; }");
const { TaskCardView } = await import(await compileModule("src/shell/task-room/TaskCardView.tsx", {
  "../../i18n/ui/useUI": ui,
  "./useTaskCard": cardHook,
}));
const { QuoteCardView } = await import(await compileModule("src/shell/task-room/QuoteCardView.tsx", { "../../i18n/ui/useUI": ui }));
const { QuoteMessagesPanel } = await import(await compileModule("src/shell/task-room/QuoteMessagesPanel.tsx", {
  "../../i18n/ui/useUI": ui,
  "../../ui/BackButton": dataModule("export function BackButton(p){ return globalThis.__usReact.createElement('button', { type: 'button', 'aria-label': p.label, onClick: p.onClick }); }"),
}));
const { TaskStackPanel } = await import(await compileModule("src/shell/workspace-panels/TaskStackPanel.tsx", {
  "../AgentChat": dataModule("export function AgentChat(props){ globalThis.__usAgentChats.push(props); return null; }"),
  "../task-room/QuoteMessagesPanel": dataModule("export function QuoteMessagesPanel(p){ return globalThis.__usReact.createElement('div', { 'data-stub-quote': p.message.id }); }"),
}));

const message = (card, extra = {}) => ({ id: "m1", conversation_id: "s1", seq: 3, sender_id: "u1", sender_kind: "system", kind: card.type, body: "", mentions: [], mention_all: false, mention_leo: false, quote: null, thread_root_id: null, thread: null, attachments: [], card, transcript: null, pinned: false, edited_at: null, recalled_at: null, recalled_by: null, hidden_reason: null, leo: null, mention_reads: null, client_id: null, created_at: "2026-11-21T10:00:00Z", ...extra });
const TASK = { type: "task", id: "t1", child_kind: "agent_task", child_id: "t1", title: "Fix the login page" };
const QUOTE = {
  type: "quote", source_title: "Design chat", count: 3,
  items: [
    { sender_name: "Ann", sent_at: "2026-11-20T10:00:00Z", kind: "text", text: "First line\nwith a break" },
    { sender_name: "Bo", sent_at: "2026-11-20T10:01:00Z", kind: "file", text: "", file_name: "plan.pdf" },
    { sender_name: "Ann", sent_at: "2026-11-20T10:02:00Z", kind: "text", text: "Third" },
  ],
};

async function mount(Component, props) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, async close() { await act(async () => root.unmount()); host.remove(); } };
}

function captureEvents(name) {
  const seen = [];
  const listener = (event) => seen.push(event.detail);
  window.addEventListener(name, listener);
  return { seen, stop: () => window.removeEventListener(name, listener) };
}

test("task card, reader without access: title + No access, not clickable, opens nothing", async () => {
  globalThis.__usCard = { access: "denied", activity: null };
  const opened = [];
  const events = captureEvents("oceanleo:open-task-panel");
  const view = await mount(TaskCardView, { message: message(TASK), conversationId: "s1", onOpenTask: (...args) => opened.push(args) });
  try {
    const card = view.host.querySelector("[data-task-card]");
    assert.equal(card.tagName, "DIV", "not a button");
    assert.equal(card.getAttribute("aria-disabled"), "true");
    assert.match(card.textContent, /Fix the login page/);
    assert.equal(view.host.querySelector("[data-task-card-no-access]").textContent, "没有访问权限");
    await act(async () => card.click());
    assert.deepEqual(opened, []);
    assert.deepEqual(events.seen, []);
    assert.equal(view.host.querySelector("button"), null);
  } finally {
    events.stop();
    await view.close();
  }
});

test("task card with access: program · status line, click opens the task (host callback, else the right panel event)", async () => {
  globalThis.__usCard = { access: "allowed", activity: { activity_state: "working", program: "codex" } };
  const opened = [];
  const view = await mount(TaskCardView, { message: message(TASK), conversationId: "s1", onOpenTask: (...args) => opened.push(args) });
  try {
    const card = view.host.querySelector("button[data-task-card]");
    assert.equal(card.getAttribute("data-task-card-status"), "working");
    assert.equal(view.host.querySelector("[data-task-card-line]").textContent, "Codex · 正在工作");
    assert.equal(view.host.querySelector("[data-task-card-no-access]"), null);
    await act(async () => card.click());
    assert.deepEqual(opened, [["t1", "Fix the login page"]]);
  } finally {
    await view.close();
  }
  const events = captureEvents("oceanleo:open-task-panel");
  const plain = await mount(TaskCardView, { message: message(TASK), conversationId: "s1" });
  try {
    await act(async () => plain.host.querySelector("button").click());
    assert.deepEqual(events.seen, [{ taskId: "t1", title: "Fix the login page" }]);
  } finally {
    events.stop();
    await plain.close();
  }
});

test("task card while the access read is pending is still a card with its title (no No-access flash)", async () => {
  globalThis.__usCard = { access: "checking", activity: null };
  const view = await mount(TaskCardView, { message: message(TASK), conversationId: "s1" });
  try {
    assert.match(view.host.textContent, /Fix the login page/);
    assert.equal(view.host.querySelector("[data-task-card-no-access]"), null);
  } finally {
    await view.close();
  }
});

test("quote card: N messages from <source> and the first two lines; click opens the quote panel", async () => {
  const events = captureEvents("oceanleo:open-quote-panel");
  const msg = message(QUOTE);
  const view = await mount(QuoteCardView, { message: msg, conversationId: "s1" });
  try {
    assert.equal(view.host.querySelector("[data-quote-card-title]").textContent, "来自「Design chat」的 3 条消息");
    const lines = [...view.host.querySelectorAll("[data-quote-card-line]")].map((node) => node.textContent);
    assert.deepEqual(lines, ["Ann: First line with a break", "Bo: plan.pdf"]);
    await act(async () => view.host.querySelector("button").click());
    assert.equal(events.seen.length, 1);
    assert.equal(events.seen[0].message, msg);
  } finally {
    events.stop();
    await view.close();
  }
});

test("quote panel: the snapshot read-only with its title, and no composer", async () => {
  const backs = [];
  const view = await mount(QuoteMessagesPanel, { message: message(QUOTE), onBack: () => backs.push(1) });
  try {
    assert.equal(view.host.querySelector("[data-quote-title]").textContent, "来自「Design chat」的 3 条消息");
    assert.equal(view.host.querySelectorAll("[data-quote-line]").length, 3);
    assert.match(view.host.textContent, /First line\nwith a break/);
    assert.match(view.host.querySelector("[data-quote-file]").textContent, /plan\.pdf/);
    assert.equal(view.host.querySelector("textarea, input, [contenteditable]"), null, "no composer");
    assert.equal(view.host.querySelectorAll("button").length, 1, "Back is the only control");
    await act(async () => view.host.querySelector("button").click());
    assert.deepEqual(backs, [1]);
  } finally {
    await view.close();
  }
});

test("right panel: a task entry mounts AgentChat on that task; a draft mounts it without a task id, in its project; a quote has no AgentChat", async () => {
  const host = { instanceId: "w1", onOpenAction() {}, onOpenItem() {} };
  const common = { onOpenTask() {}, onDraftCreated() {}, onBack() {}, host };
  globalThis.__usAgentChats = [];
  let view = await mount(TaskStackPanel, { ...common, entry: { kind: "task", key: 1, id: "t1", title: "Plan" } });
  assert.equal(globalThis.__usAgentChats.at(-1).taskId, "t1");
  assert.equal(globalThis.__usAgentChats.at(-1).initialTitle, "Plan");
  await view.close();
  globalThis.__usAgentChats = [];
  view = await mount(TaskStackPanel, { ...common, entry: { kind: "draft", key: 2, projectId: "p1" } });
  assert.equal(globalThis.__usAgentChats.at(-1).taskId, undefined);
  assert.equal(globalThis.__usAgentChats.at(-1).projectId, "p1");
  await view.close();
  globalThis.__usAgentChats = [];
  view = await mount(TaskStackPanel, { ...common, entry: { kind: "draft", key: 3, projectId: null } });
  assert.equal("projectId" in globalThis.__usAgentChats.at(-1), false, "standalone draft");
  await view.close();
  globalThis.__usAgentChats = [];
  view = await mount(TaskStackPanel, { ...common, entry: { kind: "quote", key: 4, message: message(QUOTE) } });
  assert.equal(globalThis.__usAgentChats.length, 0);
  assert.equal(view.host.querySelector("[data-stub-quote]").getAttribute("data-stub-quote"), "m1");
  await view.close();
});
