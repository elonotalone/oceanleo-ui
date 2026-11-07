// ============================================================================
// Task switch speed (2026-10-31; the old dialog model-catalog cache went with the agent-dialog card)
// ----------------------------------------------------------------------------
// 1. user-scoped cache: values are kept per user; a different user or a sign-out
//    drops them (localStorage keys and registered memory caches).
// 2. task-open-cache: a sidebar row starts the task read and (computer task) the
//    session list in parallel, at once; the first read asks for the newest 60
//    and a full page is a partial seed; prefetches are handed out once.
// 3. TaskLoadingGate: a key seen ready once is never covered again, even after
//    the gate remounts.
// ============================================================================
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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

const userCache = await import(pathToFileURL(new URL("../src/lib/user-scoped-cache.ts", import.meta.url).pathname).href);

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
    export function listComputerTaskSessions(taskId) {
      globalThis.__openCalls.push({ kind: "list", id: taskId });
      return new Promise(() => {});
    }
  `),
};
const openCache = await import(await compileModule("src/shell/task-open-cache.ts", openStubs));

test("a computer task row starts the task read and its session list together", async () => {
  userCache.setCacheUser("user-a");
  calls.length = 0;
  globalThis.__openReplies = {};
  openCache.prefetchHistoryOpen({ kind: "task", id: "t-comp", mode: "computer" });
  assert.deepEqual(calls.map((call) => call.kind), ["task", "list"], "both reads go out at once, before either answers");
  assert.equal(calls[0].options.messageLimit, openCache.TASK_FIRST_PAGE_MESSAGES, "newest messages first");
  openCache.prefetchHistoryOpen({ kind: "task", id: "t-comp", mode: "computer" });
  assert.equal(calls.filter((call) => call.kind === "task").length, 1, "hover then press: one read in flight");
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

test("a partial marker survives a history/cache boundary", () => {
  const messages = Array.from({ length: openCache.TASK_FIRST_PAGE_MESSAGES }, (_, i) => ({
    id: i + 1, role: "assistant", content: String(i),
  }));
  // This models the JSON/React copy that no longer has the original WeakSet
  // identity.  The gateway flag must still force the whole-thread read.
  const copied = {
    task: { id: "t-copy" }, messages, artifacts: [], has_more: true,
  };
  assert.equal(openCache.isPartialTaskSeed(copied), true);
  assert.equal(openCache.isPartialTaskSeed({ task: { id: "t-short" }, messages: messages.slice(0, 2), artifacts: [] }), false);
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
