// ============================================================================
// Task switch + model pill speed (2026-10-31)
// ----------------------------------------------------------------------------
// 1. user-scoped cache: values are kept per user; a different user or a sign-out
//    drops them (localStorage keys and registered memory caches).
// 2. model catalog: the last models/config frames per computer + program are
//    kept (catalog fields only) and a new thread's controller hydrates them, so
//    the pill names the model before the socket answers; also when the computer
//    row arrives after mount.
// 3. task-open-cache: a sidebar row starts the task read and (computer task) the
//    session list in parallel, at once; the transcript of the newest
//    conversation follows the list; the first read asks for the newest 60 and a
//    full page is a partial seed; prefetches are handed out once.
// 4. useNativeThread: the transcript read is not restarted (or aborted) when the
//    computer's online state arrives; a reopened conversation paints its kept
//    transcript at once.
// 5. TaskLoadingGate: a key seen ready once is never covered again, even after
//    the gate remounts.
// Harness copied from native-thread-hook.test.mjs.
// ============================================================================
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/tasks/t" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class FakeSocket {
  static sockets = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
    FakeSocket.sockets.push(this);
    queueMicrotask(() => {
      if (this.readyState === 3) return;
      this.readyState = 1;
      this.emit("open", {});
    });
  }
  addEventListener(type, fn, options) {
    const once = Boolean(options && options.once);
    const wrapped = (event) => { if (once) this.removeEventListener(type, wrapped); fn(event); };
    wrapped.original = fn;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), wrapped]);
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== fn && item.original !== fn));
  }
  send(data) {
    const frame = JSON.parse(data);
    this.sent.push(frame);
    const reply = (out) => queueMicrotask(() => { if (this.readyState === 1) this.server(out); });
    if (frame.t === "status") reply(STATUS);
    if (frame.t === "occupancy" && !FakeSocket.silentOccupancy) reply({ t: "occupancy", program: frame.program, busy: this.busy ?? [] });
    if (frame.t === "models" && !FakeSocket.noModels) reply({ t: "models", program: frame.program, models: [{ id: "gpt-x", name: "GPT X", default: true }, { id: "gpt-y", name: "GPT Y" }] });
    if (frame.t === "sessions") reply({ t: "sessions", program: frame.program, sessions: [{ id: "srv-active", title: "Someone else's", updated_at: "2026-10-30" }], active: "srv-active" });
    if (frame.t === "open_session" && FakeSocket.holdOpen) {
      FakeSocket.heldOpen = { socket: this, frame };
      return;
    }
    if (frame.t === "open_session") {
      reply({ t: "session_opened", program: frame.program, acp_session: frame.acp_session });
      reply({ t: "transcript", program: frame.program, acp_session: frame.acp_session, live: false, frames: [
        { t: "user_message", program: frame.program, acp_session: frame.acp_session, text: "Earlier", replay: true },
        { t: "delta", program: frame.program, acp_session: frame.acp_session, text: "Earlier answer", replay: true },
      ] });
    }
  }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.emit("close", {}); }
  emit(type, event) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event); }
  server(frame) { this.emit("message", { data: JSON.stringify(frame) }); }
}
FakeSocket.CONNECTING = 0; FakeSocket.OPEN = 1; FakeSocket.CLOSING = 2; FakeSocket.CLOSED = 3;
globalThis.WebSocket = FakeSocket;
window.WebSocket = FakeSocket;

const STATUS = { t: "status", programs: [
  { id: "codex", installed: true, path: "/c", version: "1", auth: "login", logged_in: true, dir_capability: "full", running: false },
  { id: "claude", installed: true, path: "/cl", version: "1", auth: "none", logged_in: false, dir_capability: "full", running: false },
  { id: "hermes", installed: false, path: "", version: "", auth: "none", logged_in: null, dir_capability: "full", running: false },
] };

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const stubs = {
  "../../lib/computer-task-api": dataModule(`
    export async function getComputerTaskTranscript(id, options) { return globalThis.__taskApi.transcript(id, options ?? {}); }
  `),
  "../../i18n/ui/useUI": uiStub,
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/cloud-computer-api": dataModule(`
    export function agentDialogWsUrl(id) { return "ws://example.test/v1/computers/" + id + "/agent-dialog"; }
    // The composer pill's computer sections default to this client (never called here).
    export const cloudComputerApi = {};
    export async function putComputerInbox(id, file, onProgress, options) {
      (globalThis.__inboxPuts ??= []).push({ name: file.name, task_session_id: options?.task_session_id ?? null });
      onProgress?.(100);
      return { path: "/home/elon/.oceanleo/inbox/" + file.name, name: file.name, mime: file.type || "text/plain", size: file.size };
    }
  `),
  "../../../lib/auth/client": dataModule(`export async function accessToken() { return "tok"; }`),
  "../../../lib/agent": dataModule(`export async function getTask() { return { ok: false }; } export async function stopTask() { return { ok: false }; }`),
  "../../../lib/cloud-computer-agent-api": dataModule(`
    export async function agentState() { return { ok: false, status: 0 }; }
    export async function agentTurn() { return { ok: false, status: 0 }; }
    export async function agentReset() { return { ok: true }; }
  `),
};
const { useNativeThread } = await import(await compileModule("src/shell/native-thread/useNativeThread.ts", stubs));

function Probe(props) {
  globalThis.__thread = useNativeThread(props);
  return null;
}

async function until(fn, label) {
  for (let i = 0; i < 80; i += 1) {
    if (fn()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }
  throw new Error(label);
}

async function mount(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Probe, props)));
  return {
    async update(next) { await act(async () => root.render(React.createElement(Probe, { ...props, ...next }))); },
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
}

async function sendVia(thread, text) {
  let result;
  await act(async () => { result = await thread.send(text); });
  return result;
}

const sent = () => FakeSocket.sockets.flatMap((socket) => socket.sent);
const openSocket = () => [...FakeSocket.sockets].reverse().find((socket) => socket.readyState === 1);

function session(overrides = {}) {
  return { id: "managed-1", task_id: "task", computer_id: "cc_1", computer_name: "elon", kind: "acp", program: "codex",
    native_session_id: "nat-1", created_at: "", updated_at: "", sync_status: "saved", ...overrides };
}


const userCache = await import(pathToFileURL(new URL("../src/lib/user-scoped-cache.ts", import.meta.url).pathname).href);
const catalog = await import(pathToFileURL(new URL("../src/shell/cloud-computer/agent-dialog/model-catalog-cache.ts", import.meta.url).pathname).href);

const savedPage = (s, text) => ({ session: s, frames: [
  { t: "user_message", program: "codex", acp_session: s.native_session_id, text, replay: true },
  { t: "delta", program: "codex", acp_session: s.native_session_id, text: "Answer to " + text, replay: true },
  { t: "done", program: "codex", acp_session: s.native_session_id, stop: "end_turn" },
], saved_at: "now", sync_status: "saved", has_older: false, next_before: null });

test("user-scoped cache: kept per user, dropped for another user and on sign-out", () => {
  userCache.setCacheUser("user-a");
  userCache.writeUserJson("probe", { n: 1 });
  let cleared = 0;
  const stop = userCache.onUserScopedClear(() => { cleared += 1; });
  assert.deepEqual(userCache.readUserJson("probe"), { n: 1 });
  assert.ok(Object.keys(localStorage).some((key) => key.startsWith("oceanleo.uc:user-a:")));
  userCache.setCacheUser("user-b");
  assert.equal(cleared, 1, "a different user drops the memory caches");
  assert.equal(userCache.readUserJson("probe"), undefined);
  assert.equal(Object.keys(localStorage).some((key) => key.startsWith("oceanleo.uc:user-a:")), false, "the previous user's keys are gone");
  userCache.writeUserJson("probe", { n: 2 });
  window.dispatchEvent(new window.CustomEvent(userCache.USER_CACHE_AUTH_EVENT, { detail: { event: "SIGNED_OUT", userId: null } }));
  assert.equal(cleared, 2, "sign-out drops them");
  assert.equal(userCache.cacheUser(), "");
  assert.equal(userCache.readUserJson("probe"), undefined, "nothing is read without a user");
  stop();
});

test("model catalog: catalog fields only, per computer + program, per user", () => {
  userCache.setCacheUser("user-a");
  catalog.rememberModelCatalogFrame("cc_m", "codex", { t: "models", program: "codex", acp_session: "spare", ref: "r1", models: [{ id: "gpt-x", name: "GPT X", default: true }] });
  catalog.rememberModelCatalogFrame("cc_m", "codex", { t: "config", program: "codex", acp_session: "spare", options: [{ id: "model", name: "Model", category: "model", type: "select", current: "gpt-x", options: [{ value: "gpt-x", name: "GPT X" }] }] });
  catalog.rememberModelCatalogFrame("cc_m", "codex", { t: "models", program: "codex", models: [] });
  const frames = catalog.modelCatalogFrames("cc_m", "codex");
  assert.deepEqual(frames.map((frame) => frame.t), ["models", "config"], "models first; an empty list never replaces a catalog");
  assert.equal(frames.some((frame) => "acp_session" in frame || "ref" in frame), false);
  assert.deepEqual(catalog.modelCatalogFrames("cc_other", "codex"), []);
  assert.deepEqual(catalog.modelCatalogFrames("cc_m", "claude"), []);
  catalog.clearModelCatalogMemory();
  assert.equal(catalog.modelCatalogFrames("cc_m", "codex").length, 2, "survives a reload (localStorage)");
  userCache.setCacheUser("user-b");
  assert.deepEqual(catalog.modelCatalogFrames("cc_m", "codex"), [], "another user sees nothing");
});

test("model pill: a new thread names the kept model before the computer answers (also when the computer arrives late)", async () => {
  userCache.setCacheUser("user-a");
  catalog.rememberModelCatalogFrame("cc_pill", "codex", { t: "models", program: "codex", models: [{ id: "gpt-y", name: "GPT Y" }, { id: "gpt-z", name: "GPT Z", default: true }] });
  FakeSocket.sockets = [];
  FakeSocket.noModels = true;
  try {
    const view = await mount({ computer: { id: "cc_pill", name: "elon", node_online: true }, session: null, program: "codex", enabled: true });
    try {
      assert.deepEqual(globalThis.__thread.dialog.models.map((model) => model.id), ["gpt-y", "gpt-z"]);
      assert.equal(globalThis.__thread.dialog.selectedModel, "gpt-z", "the catalog's default");
    } finally { view.cleanup(); }
    const late = await mount({ computer: null, session: null, program: "codex", enabled: true });
    try {
      assert.deepEqual(globalThis.__thread.dialog.models, [], "unknown computer: nothing to name yet");
      await late.update({ computer: { id: "cc_pill", name: "elon", node_online: true } });
      assert.deepEqual(globalThis.__thread.dialog.models.map((model) => model.id), ["gpt-y", "gpt-z"]);
    } finally { late.cleanup(); }
  } finally { FakeSocket.noModels = false; }
});

test("transcript read is not restarted when the computer's state arrives; a reopened conversation paints its kept copy at once", async () => {
  userCache.setCacheUser("user-a");
  FakeSocket.sockets = [];
  FakeSocket.holdOpen = true;
  const s = session({ id: "managed-keep", computer_id: "cc_keep", native_session_id: "nat-keep" });
  const reads = [];
  globalThis.__taskApi = { transcript(id, options) {
    return new Promise((resolve) => { reads.push({ id, signal: options.signal, release: (text) => resolve(savedPage(s, text)) }); });
  } };
  const view = await mount({ computer: null, session: s, enabled: true });
  try {
    await until(() => reads.length === 1, "saved copy requested before the computer is known");
    await view.update({ computer: { id: "cc_keep", name: "elon", node_online: true } });
    assert.equal(reads.length, 1, "no second read when the computer comes online");
    assert.equal(reads[0].signal?.aborted ?? false, false, "the first read is not aborted");
    await act(async () => { reads[0].release("First visit"); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await until(() => globalThis.__thread.messages.some((m) => m.content === "First visit"), "saved copy shown");
  } finally { view.cleanup(); }
  const again = await mount({ computer: null, session: s, enabled: true });
  try {
    assert.ok(globalThis.__thread.messages.some((m) => m.content === "First visit"), "kept copy painted at once");
    assert.equal(globalThis.__thread.opening, false);
    await until(() => reads.length === 2, "read again in the background");
    await act(async () => { reads[1].release("Second visit"); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await until(() => globalThis.__thread.messages.some((m) => m.content === "Second visit"), "fresh copy replaces it");
  } finally { FakeSocket.holdOpen = false; FakeSocket.heldOpen = null; again.cleanup(); }
});

// ---------------------------------------------------------------------------
// task-open-cache: prefetch ordering
// ---------------------------------------------------------------------------

const calls = [];
globalThis.__openCalls = calls;
globalThis.__openReplies = {};
const openStubs = {
  "../lib/agent": dataModule(`
    export function getTask(id, options) {
      globalThis.__openCalls.push({ kind: "task", id, options });
      return new Promise((resolve) => { (globalThis.__openReplies.task ??= []).push(resolve); });
    }
  `),
  "../lib/app-session": dataModule(`
    export function getAppSession(id) { globalThis.__openCalls.push({ kind: "session", id }); return new Promise(() => {}); }
  `),
  "../lib/computer-task-api": dataModule(`
    const lists = new Map();
    export function listComputerTaskSessions(taskId) {
      globalThis.__openCalls.push({ kind: "list", id: taskId });
      return new Promise((resolve) => { (globalThis.__openReplies.list ??= []).push((value) => { lists.set(taskId, value.sessions); resolve(value); }); });
    }
    export function knownComputerTaskSessions(taskId) { return lists.get(taskId) ?? null; }
    export function latestComputerTaskSession(rows) { return rows.reduce((a, b) => (!a || Date.parse(b.updated_at) > Date.parse(a.updated_at) ? b : a), null); }
    export function getComputerTaskTranscript(id) {
      globalThis.__openCalls.push({ kind: "transcript", id });
      return new Promise(() => {});
    }
  `),
};
const openCache = await import(await compileModule("src/shell/task-open-cache.ts", openStubs));

test("a computer task row starts the task read and its session list together, then the newest conversation's transcript", async () => {
  userCache.setCacheUser("user-a");
  calls.length = 0;
  globalThis.__openReplies = {};
  openCache.prefetchHistoryOpen({ kind: "task", id: "t-comp", mode: "computer" });
  assert.deepEqual(calls.map((call) => call.kind), ["task", "list"], "both reads go out at once, before either answers");
  assert.equal(calls[0].options.messageLimit, openCache.TASK_FIRST_PAGE_MESSAGES, "newest messages first");
  openCache.prefetchHistoryOpen({ kind: "task", id: "t-comp", mode: "computer" });
  assert.equal(calls.filter((call) => call.kind === "task").length, 1, "hover then press: one read in flight");
  await act(async () => {
    globalThis.__openReplies.list[0]({ sessions: [
      { id: "cts-old", kind: "acp", program: "codex", updated_at: "2026-10-01T00:00:00Z" },
      { id: "cts-new", kind: "acp", program: "claude", updated_at: "2026-10-30T00:00:00Z" },
      { id: "cts-ol", kind: "acp", program: "oceanleo", updated_at: "2026-10-31T00:00:00Z" },
    ] });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.deepEqual(calls.filter((call) => call.kind === "transcript").map((call) => call.id), ["cts-new"]);
  const messages = Array.from({ length: openCache.TASK_FIRST_PAGE_MESSAGES }, (_, i) => ({ id: i + 1, role: "user", content: String(i) }));
  const detail = { task: { id: "t-comp", mode: "computer" }, messages, artifacts: [] };
  globalThis.__openReplies.task[0]({ ok: true, data: detail });
  const taken = openCache.takeTaskPrefetch("t-comp");
  assert.ok(taken, "the page takes the read in flight");
  assert.equal(openCache.takeTaskPrefetch("t-comp"), null, "handed out once");
  const result = await taken;
  assert.equal(result.data, detail);
  assert.equal(openCache.isPartialTaskSeed(detail), true, "a full page may be cut: the whole thread is read after");
  assert.equal(openCache.peekTaskDetail("t-comp"), detail, "kept for the next open");
});

test("a session row reads its app_session and linked task together; a short thread is not partial", async () => {
  calls.length = 0;
  globalThis.__openReplies = {};
  openCache.prefetchHistoryOpen({ kind: "session", id: "sess-1", taskId: "t-cloud" });
  assert.deepEqual(calls.map((call) => [call.kind, call.id]), [["session", "sess-1"], ["task", "t-cloud"]]);
  const detail = { task: { id: "t-cloud" }, messages: [{ id: 1, role: "user", content: "hi" }], artifacts: [] };
  globalThis.__openReplies.task[0]({ ok: true, data: detail });
  await openCache.openTaskFirstPage("t-cloud");
  assert.equal(openCache.isPartialTaskSeed(detail), false);
  assert.equal(calls.filter((call) => call.kind === "task").length, 1, "the page used the prefetched read");
  assert.ok(openCache.takeAppSessionPrefetch("sess-1"));
});

// ---------------------------------------------------------------------------
// TaskLoadingGate: seen keys
// ---------------------------------------------------------------------------

const gate = await import(await compileModule("src/shell/task-loading-gate.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI(){ return (v) => v; }`),
}));

test("a gate key seen ready once is never covered again, even after the gate remounts", async () => {
  userCache.setCacheUser("user-a");
  gate.clearTaskLoadingSeen();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (key, hostReady) => act(async () => root.render(
    React.createElement(gate.TaskLoadingGate, { key: "gate-" + Math.random(), gateKey: key, hostReady }, React.createElement("p", null, "body"))));
  const state = () => host.querySelector("[data-task-loading-gate]").getAttribute("data-task-loading-gate");
  try {
    await render("task-a", false);
    assert.equal(state(), "loading");
    await render("task-a", true);
    assert.equal(state(), "ready");
    assert.equal(gate.taskLoadingSeen("task-a"), true);
    await render("task-b", false);
    assert.equal(state(), "loading", "a new task may be covered");
    await render("task-a", false);
    assert.equal(state(), "ready", "a revisit (fresh gate, host still reading) is not covered");
  } finally { act(() => root.unmount()); host.remove(); }
});

test("useNativeThread source: the transcript effect does not depend on `online`", () => {
  const source = readFileSync(new URL("../src/shell/native-thread/useNativeThread.ts", import.meta.url), "utf8");
  const effect = source.slice(source.indexOf("const archiveFresh = useRef"), source.indexOf("const reduceArchive"));
  const deps = effect.match(/\}, \[([^\]]*)\]\);\s*$/)?.[1] ?? "";
  assert.ok(deps.includes("sessionKey"), deps);
  assert.equal(/\bonline\b/.test(deps), false, deps);
});
