// TU1 (task rooms wave 2026-11-20): a sub task's card in a task's conversation shows its title, owner,
// program and live status; a person without access reads why and cannot open it; a click opens the
// child through the host (RoomView) or, with no host, through the right panel request.
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
for (const key of ["HTMLButtonElement", "CustomEvent", "Event"]) globalThis[key] = window[key];

globalThis.__tu1Room = null;
globalThis.__tu1Opened = [];
const ui = dataModule("export function useUI(){return (text, params={}) => text.replace(/\\{(\\w+)\\}/g,(_,k)=>params[k] ?? k);}");
const { TaskCardView } = await import(await compileModule("src/shell/task-room/TaskCardView.tsx", {
  "../../i18n/ui/useUI": ui,
  "./useTaskRoom": dataModule("export function useTaskRoom(){ return { room: globalThis.__tu1Room, state: 'ready', reload(){} }; }"),
  "../messages/host-state": dataModule("export function openMessages(t){ globalThis.__tu1Opened.push(['messages', t]); }"),
}));

const child = (extra = {}) => ({ kind: "agent_task", id: "t1", title: "Fix the login page", card_message_id: "m1", mode: "view", owner: { id: "u1", name: "Ann" }, program: "codex", status: "working", updated_at: "", my_access: "view", ...extra });
const message = (card) => ({ id: "m1", conversation_id: "r1", seq: 3, sender_id: "u1", sender_kind: "user", kind: "task", body: "", mentions: [], mention_all: false, mention_leo: false, quote: null, thread_root_id: null, thread: null, attachments: [], card, transcript: null, pinned: false, edited_at: null, recalled_at: null, recalled_by: null, hidden_reason: null, leo: null, mention_reads: null, client_id: null, created_at: "2026-11-20T10:00:00Z" });
const CARD = { type: "task", id: "t1", child_kind: "agent_task", child_id: "t1", title: "Card title" };

async function mount(props) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(TaskCardView, props)));
  return { host, async close() { await act(async () => root.unmount()); host.remove(); } };
}

test("live sub task card: title, kind, owner, program and the status word", async () => {
  globalThis.__tu1Room = { id: "r1", children: [child({ status: "waiting" })] };
  const opened = [];
  const view = await mount({ message: message(CARD), conversationId: "r1", onOpen: (d) => opened.push(d) });
  try {
    const button = view.host.querySelector("[data-task-card]");
    assert.equal(button.getAttribute("data-task-card"), "agent_task");
    assert.equal(button.getAttribute("data-task-card-status"), "waiting");
    assert.match(button.textContent, /Fix the login page/);
    assert.match(button.textContent, /子任务 · Ann · Codex/);
    assert.equal(view.host.querySelector("[data-task-card-state]").textContent, "等待回答");
    await act(async () => button.click());
    assert.deepEqual(opened, [{ kind: "agent_task", id: "t1", title: "Fix the login page" }]);
  } finally { await view.close(); }
});

test("no access: the card says why and does not open", async () => {
  globalThis.__tu1Room = { id: "r1", children: [child({ my_access: "none", status: "done" })] };
  const opened = [];
  const view = await mount({ message: message(CARD), conversationId: "r1", onOpen: (d) => opened.push(d) });
  try {
    assert.equal(view.host.querySelector("[data-task-card-no-access]").textContent, "只有所有者允许的人才能打开");
    await act(async () => view.host.querySelector("[data-task-card]").click());
    assert.deepEqual(opened, []);
  } finally { await view.close(); }
});

test("room unknown (older server, other conversation): the card's own title, still opens", async () => {
  globalThis.__tu1Room = null;
  const requests = [];
  const take = (event) => { requests.push(event.detail); event.preventDefault(); };
  window.addEventListener("oceanleo:open-task-child", take);
  const view = await mount({ message: message({ type: "task", id: "r2", child_kind: "room", child_id: "r2", title: "Plan the trip" }), conversationId: "c9" });
  try {
    const button = view.host.querySelector("[data-task-card]");
    assert.match(button.textContent, /Plan the trip/);
    assert.equal(button.getAttribute("data-task-card-status"), null, "no run state for a task");
    await act(async () => button.click());
    assert.deepEqual(requests, [{ kind: "room", id: "r2", title: "Plan the trip" }]);
    assert.deepEqual(globalThis.__tu1Opened, [], "the panel took it: no LeoChat fallback");
  } finally {
    window.removeEventListener("oceanleo:open-task-child", take);
    await view.close();
  }
});

test("nobody takes the request: a task opens in LeoChat", async () => {
  globalThis.__tu1Room = null;
  globalThis.__tu1Opened = [];
  const view = await mount({ message: message({ type: "task", id: "r2", child_kind: "room", child_id: "r2", title: "Plan" }), conversationId: "c9" });
  try {
    await act(async () => view.host.querySelector("[data-task-card]").click());
    assert.deepEqual(globalThis.__tu1Opened, [["messages", { conversationId: "r2" }]]);
  } finally { await view.close(); }
});
