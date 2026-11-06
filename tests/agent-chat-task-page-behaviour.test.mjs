import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compileModule } from "./helpers/module-bench.mjs";

// The existing suite exposes the same real AgentChat mount harness after loading
// its network/native stubs. These tests exercise the rendered component and
// dispatched calls; they do not inspect source text.
await import("./agent-chat-conversations.test.mjs");
const { mount, settle, session, computerTask, cloudTask } = globalThis.__agentChatHarness;
let defaultScrollHeight = 0;
let defaultClientHeight = 600;
Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get() { return this.__testScrollHeight ?? defaultScrollHeight; } });
Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get() { return this.__testClientHeight ?? defaultClientHeight; } });

const computerSessions = [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")];
const baseState = (status = "idle", queued = []) => ({
  status,
  program: "codex",
  session_id: "cts_codex",
  since: null,
  last_output_at: null,
  request: null,
  queued,
  reason: null,
  pending_stop: false,
  computer: { id: "cc_elon", online: true },
});
const leoEntry = (id, content, meta = {}) => ({
  cursor: `cursor-${id}`,
  source: "leo",
  program: "codex",
  session_id: null,
  created_at: "2026-11-06T10:00:00Z",
  message: { id, role: "user", kind: "text", content, meta },
});
const page = ({ entries = [], state = baseState(), has_older = false, next_before = null } = {}) => ({
  task_id: "t1", entries, has_older, next_before, state, sessions: [],
});
const queued = (id = "m1") => ({ client_message_id: id, program: "codex", created_at: "2026-11-06T10:00:00Z", text: "queued" });

function setMetrics(el, { height = 1600, client = 600, top = 0 } = {}) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: height, writable: true });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: client, writable: true });
  el.scrollTop = top;
}
function stream(view) { return view.host.querySelector("[data-agent-stream-scroller]"); }
function composer(view) { return view.host.querySelector('[data-leo-composer="cloud"]'); }
function emit(event) { globalThis.__taskTimelineEmit?.(event); }
async function unmount(view) { await view.unmount(); }


test("Stop is shown only while a computer timeline is working", async () => {
  globalThis.__timelinePage = page({ state: baseState("working") });
  const working = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  try { assert.equal(working.composer("cloud").__props.loading, true); }
  finally { await unmount(working); }
  globalThis.__timelinePage = page({ state: baseState("idle") });
  const idle = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  try { assert.equal(idle.composer("cloud").__props.loading, false); }
  finally { await unmount(idle); }
});

test("Escape invokes Stop for a working computer task with an empty composer", async () => {
  globalThis.__timelinePage = page({ state: baseState("working") });
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  try {
    const input = composer(view);
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.ok(globalThis.__taskTimelineCalls.some((call) => call.path === "/v1/tasks/t1/stop"));
  } finally { await unmount(view); }
});

test("queued delivery changes to injected after a later timeline state update", async () => {
  const id = "m1";
  globalThis.__timelinePage = page({
    entries: [leoEntry(1, "queued", { client_message_id: id })],
    state: baseState("queued", [queued(id)]),
  });
  globalThis.__nextDelivery = "queued";
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  try {
    assert.match(view.host.textContent, /已排队/);
    assert.ok(view.host.querySelector(`[data-task-queued-actions="${id}"] button`));
    const input = composer(view);
    await act(async () => { input.__props.onChange("queued"); input.__props.onSubmit("queued"); });
    await settle();
    await act(async () => { emit({ type: "entries", entries: [leoEntry(1, "queued", { client_message_id: id, delivery: "injected" })] }); });
    await act(async () => { emit({ type: "state", state: baseState("working", []) }); });
    await settle();
    assert.match(view.host.textContent, /下一步会看到/);
    assert.equal(view.host.querySelector(`[data-task-queued-actions="${id}"] button`), null);
  } finally { await unmount(view); globalThis.__nextDelivery = null; }
});

test("remove queued is available only before injection", async () => {
  const id = "m-remove";
  globalThis.__timelinePage = page({ entries: [leoEntry(2, "remove", { client_message_id: id })], state: baseState("queued", [queued(id)]) });
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  try {
    const button = view.host.querySelector(`[data-task-queued-actions="${id}"] button`);
    assert.ok(button);
    await act(async () => { button.click(); });
    assert.ok(globalThis.__taskTimelineCalls.some((call) => call.method === "DELETE"));
    await act(async () => { emit({ type: "state", state: baseState("working", []) }); });
    await settle();
    assert.equal(view.host.querySelector(`[data-task-queued-actions="${id}"] button`), null);
  } finally { await unmount(view); }
});

test("home launch first render keeps its bubble and composer without empty or skeleton copy", async () => {
  globalThis.__createTaskResult = true;
  globalThis.__timelinePage = page();
  const view = await mount({ initialPrompt: "hello from home" }, { task: null, settleMount: false });
  try {
    assert.match(view.host.textContent, /hello from home/);
    assert.ok(composer(view));
    assert.doesNotMatch(view.host.textContent, /在下方输入，开始与 agent 对话|正在创建任务|正在读取/);
  } finally { await unmount(view); globalThis.__createTaskResult = false; }
});

test("empty state appears only after the first timeline page is loaded", async () => {
  globalThis.__timelinePage = page({ state: baseState("working") });
  let release;
  globalThis.__timelineHang = { promise: new Promise((resolve) => { release = resolve; }) };
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions, settleMount: false });
  try {
    assert.doesNotMatch(view.host.textContent, /在下方输入，开始与 agent 对话/);
    await act(async () => { release(globalThis.__timelinePage); });
    await act(async () => { emit({ type: "state", state: baseState("idle") }); });
    await settle(); await settle();
    assert.match(view.host.textContent, /在下方输入，开始与 agent 对话/);
  } finally { await unmount(view); globalThis.__timelineHang = null; }
});

test("first placement opens the task at its newest timeline row", async () => {
  // A task id of its own: the scroll memory is per task, and no earlier test may have left a spot for it.
  const task = computerTask();
  task.task.id = "t-place";
  globalThis.__timelinePage = page({ entries: [leoEntry(3, "older row"), leoEntry(4, "newest row")], state: baseState("idle") });
  defaultScrollHeight = 1800;
  const view = await mount({ taskId: "t-place" }, { task, sessions: computerSessions, url: "/tasks/t-place" });
  try {
    assert.match(view.host.textContent, /newest row/);
    assert.equal(stream(view).scrollTop, 1800);
  } finally { defaultScrollHeight = 0; await unmount(view); }
});

test("new timeline rows follow when the reader is at the bottom", async () => {
  globalThis.__timelinePage = page({ entries: [leoEntry(4, "first")], state: baseState("working") });
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  try {
    const el = stream(view); setMetrics(el, { height: 1800, client: 600, top: 1800 });
    const scrollCalls = []; el.scrollTo = ({ top }) => { scrollCalls.push(top); el.scrollTop = top; };
    await act(async () => { emit({ type: "entries", entries: [leoEntry(5, "second")] }); });
    await settle();
    assert.ok(scrollCalls.includes(1800));
  } finally { await unmount(view); }
});

test("new timeline rows show an unread count when the reader is scrolled up", async () => {
  globalThis.__timelinePage = page({ entries: [leoEntry(6, "first")], state: baseState("working") });
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  try {
    const el = stream(view); setMetrics(el, { height: 1800, client: 600, top: 100 });
    await act(async () => { el.dispatchEvent(new Event("scroll")); });
    await act(async () => { emit({ type: "entries", entries: [leoEntry(7, "second")] }); });
    await settle();
    assert.match(view.host.textContent, /回到最新 · 1 条新消息/);
  } finally { await unmount(view); }
});

test("older-page prefetch starts within 480px of the top", async () => {
  globalThis.__timelinePage = page({ entries: [leoEntry(8, "history")], state: baseState("idle"), has_older: true, next_before: "before-1" });
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions, settleMount: false });
  try {
    const el = stream(view); setMetrics(el, { height: 2000, client: 600, top: 520 });
    await settle(); await settle();
    setMetrics(el, { height: 2000, client: 600, top: 520 });
    await act(async () => { el.dispatchEvent(new Event("scroll")); });
    el.scrollTop = 400;
    await act(async () => { el.dispatchEvent(new Event("scroll")); });
    await settle();
    assert.ok(globalThis.__taskTimelineCalls.filter((call) => call.method === "GET").length >= 2);
  } finally { await unmount(view); }
});

test("an older page keeps the reader's place when they kept scrolling during the load", async () => {
  const task = computerTask();
  task.task.id = "t-anchor";
  globalThis.__timelinePage = page({ entries: [leoEntry(9, "history")], state: baseState("idle"), has_older: true, next_before: "before-2" });
  defaultScrollHeight = 2000; // a full viewport: nothing loads before the reader scrolls
  const view = await mount({ taskId: "t-anchor" }, { task, sessions: computerSessions, url: "/tasks/t-anchor" });
  let releaseOlder;
  globalThis.__olderDeferred = { promise: new Promise((resolve) => { releaseOlder = resolve; }) };
  try {
    const el = stream(view);
    setMetrics(el, { height: 2000, client: 600, top: 520 });
    await act(async () => { el.dispatchEvent(new Event("scroll")); });
    const readsBefore = globalThis.__taskTimelineCalls.filter((call) => call.method === "GET").length;
    el.scrollTop = 400; // within 480 px of the top, moving up: the older page is requested
    await act(async () => { el.dispatchEvent(new Event("scroll")); });
    assert.equal(globalThis.__taskTimelineCalls.filter((call) => call.method === "GET").length, readsBefore + 1);
    el.scrollTop = 320; // the reader keeps scrolling while it loads
    await act(async () => { el.dispatchEvent(new Event("scroll")); });
    setMetrics(el, { height: 2400, client: 600, top: 320 }); // the older page adds 400 px above
    await act(async () => { releaseOlder(page({ entries: [leoEntry(8, "older history")], state: baseState("idle") })); });
    await settle(); await settle();
    assert.match(view.host.textContent, /older history/);
    assert.equal(el.scrollTop, 720, "the rows the reader was looking at stay in place: 320 + 400");
  } finally { defaultScrollHeight = 0; await unmount(view); }
});

test("timeline reset rereads rows without losing the current position", async () => {
  globalThis.__timelinePage = page({ entries: [leoEntry(10, "kept")], state: baseState("idle") });
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  try {
    const el = stream(view); setMetrics(el, { height: 1800, client: 600, top: 700 });
    await act(async () => { emit({ type: "reset" }); });
    await settle(); await settle();
    assert.match(view.host.textContent, /kept/);
    assert.equal(el.scrollTop, 700);
  } finally { await unmount(view); }
});

test("computer task mounts the hidden native thread in status-only mode", async () => {
  globalThis.__timelinePage = page();
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  try {
    assert.equal(globalThis.__threadInputs.at(-1).statusOnly, true);
    assert.equal(globalThis.__gateway.some((call) => String(call.path).includes("transcript")), false);
  } finally { await unmount(view); }
});

test("an action targeted at another window is ignored", async () => {
  globalThis.__timelinePage = page();
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  const seen = [];
  const listener = () => seen.push(true);
  window.addEventListener("oceanleo:workspace-action", listener);
  try {
    emit({ type: "entries", entries: [{ ...leoEntry(11, "", { verified: true, target_window: "w_other", workspace_action: { version: 2, tab: "settings" } }), message: { id: 11, role: "assistant", kind: "ui_action", content: "", meta: { verified: true, target_window: "w_other", workspace_action: { version: 2, tab: "settings" } } } }] });
    await settle();
    assert.equal(seen.length, 0);
  } finally { window.removeEventListener("oceanleo:workspace-action", listener); await unmount(view); }
});

test("computer and Leo sends carry the same client window id", async () => {
  globalThis.__timelinePage = page({ state: baseState("idle") });
  const computer = await mount({ taskId: "t1" }, { task: computerTask(), sessions: computerSessions });
  try {
    const input = composer(computer); await act(async () => { input.__props.onChange("computer send"); }); await settle(); await act(async () => { input.__props.onSubmit("computer send"); }); await settle();
    const body = globalThis.__taskTimelineCalls.find((call) => call.method === "POST" && call.path.endsWith("/messages"))?.body;
    assert.match(body.client_window, /^w_[0-9a-f]{16}$/);
  } finally { await unmount(computer); }
  const leo = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: [] });
  try {
    const input = composer(leo); await act(async () => { input.__props.onChange("Leo send"); }); await settle(); await act(async () => { input.__props.onSubmit("Leo send"); }); await settle();
    assert.match(globalThis.__followUpBodies.at(-1).client_window, /^w_[0-9a-f]{16}$/);
  } finally { await unmount(leo); }
});
