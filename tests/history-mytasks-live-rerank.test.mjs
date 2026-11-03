/**
 * My Tasks live re-rank (V1 DEFECT U5, 2026-11-04 03:26 CST).
 *
 * The open chat signals its phase changes (turn start / end) with
 * HISTORY_CHANGED_EVENT. When that signal lands while a list read is already
 * in flight, the in-flight read was sent BEFORE the change. Reusing it as the
 * answer left the replying task at its old position until the next 8 s poll
 * (V1 repro2: last_activity 2nd newest, sidebar index 9 until reload).
 *
 * Rule: a change signal always gets a read that started after the signal.
 * A plain poll may still share an in-flight read. Opening an old task (the
 * canonical /tasks/<id> route) never moves it.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/tasks/task-x?computerSession=cts_x",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
window.Element.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.React = React;
globalThis.__historyPath = "/tasks/task-x";

const historyUrl = await compileModule("src/shell/HistoryMasterDetail.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI(){ return (value) => value; }`),
  "next/navigation": dataModule(`
    export function usePathname(){ return globalThis.__historyPath; }
    export function useSearchParams(){ return new URLSearchParams(window.location.search); }
    export function useRouter(){ return { push(){}, replace(){}, prefetch(){} }; }
  `),
  "./WorkspaceSelection": dataModule(`
    export function useWorkspaceSelection(){ return globalThis.React.useState(null); }
  `),
  "./AgentChat": dataModule(`export function AgentChat(){ return null; }`),
  "./library-task-history": dataModule(`export function LibraryTaskHistoryWorkspace(){return null;}`),
  "./WorkspaceSession": dataModule(`export function WorkspaceSessionProvider({ children }){ return children; }`),
  "./HistoryRowActions": dataModule(`
    export function HistoryRowMenu(){ return null; }
    export function MoveTaskProjectDialog(){ return null; }
  `),
  "../ui": dataModule(`export function ConfirmDialog(){ return null; } export function SkeletonCard(){ return null; } export function SkeletonLine(){ return null; }`),
  "../lib/auth/client": dataModule(`
    export function browserClient(){ return null; }
    export async function accessToken(){ return null; }
  `),
  "../lib/agent": dataModule(`
    export async function listTasks(...args){ return globalThis.__tasksRead(...args); }
    export async function deleteTask(){ return { ok: true }; }
    export async function getTask(){ return { ok: false, status: 404 }; }
    export function taskCostYuan(){ return 0; }
  `),
  "../lib/app-session": dataModule(`
    export function isAppSessionApiUnavailableStatus(status){ return status === 404 || status === 405 || status === 501; }
    export async function listAppSessions(){ return { ok: true, data: { items: [] } }; }
    export async function getAppSession(){ return { ok: false, status: 404 }; }
    export async function deleteAppSession(){ return { ok: true }; }
    export async function updateAppSessionMetadata(){ return { ok: true }; }
  `),
});

const { HistoryInlineList } = await import(historyUrl);
const { HISTORY_CHANGED_EVENT } = await import("../src/lib/history-events.ts");

function task(id, lastActivity, extra = {}) {
  return {
    id,
    title: `T ${id}`,
    status: "completed",
    mode: "computer",
    site_id: "oceanleo",
    session_id: null,
    created_at: "2026-11-03T10:00:00Z",
    last_activity_at: lastActivity,
    working: false,
    activity_state: "idle",
    ...extra,
  };
}

/** Server rows before the reply: task-x is the oldest of four. */
const before = () => [
  task("task-a", "2026-11-03T19:19:00Z"),
  task("task-b", "2026-11-03T19:18:00Z"),
  task("task-c", "2026-11-03T19:17:00Z"),
  task("task-x", "2026-11-03T18:52:58Z"),
];
/** Server rows once task-x's turn is running. */
const replying = () => [
  task("task-a", "2026-11-03T19:19:00Z"),
  task("task-b", "2026-11-03T19:18:00Z"),
  task("task-c", "2026-11-03T19:17:00Z"),
  task("task-x", "2026-11-03T19:19:57Z", { status: "running", working: true, activity_state: "working", open_turn: true }),
];

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mount() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(HistoryInlineList, { siteId: "oceanleo" }));
  });
  return {
    container,
    order: () => [...container.querySelectorAll("[data-history-row]")].map((node) => node.getAttribute("data-history-row")),
    working: (id) => Boolean(container.querySelector(`[data-history-row="${id}"] [data-history-working]`)),
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("a phase-change signal during an in-flight list read gets a fresh read: the replying task moves to the top", async () => {
  const reads = [];
  globalThis.__tasksRead = () => {
    const pending = {};
    pending.promise = new Promise((resolve) => { pending.resolve = resolve; });
    reads.push(pending);
    return pending.promise;
  };
  const panel = await mount();
  try {
    assert.equal(reads.length, 1, "first paint reads the list once");
    reads[0].resolve({ ok: true, data: { items: before() } });
    await settle(10);
    assert.deepEqual(panel.order(), ["task-a", "task-b", "task-c", "task-x"]);

    // A list read (poll or earlier signal) is on the wire with the old rows...
    await act(async () => window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT)));
    assert.equal(reads.length, 2);
    // ...then the open chat's turn starts and it signals the change.
    await act(async () => window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT)));
    // The read that was sent before the change answers with pre-change rows.
    reads[1].resolve({ ok: true, data: { items: before() } });
    await settle(10);

    assert.equal(reads.length, 3, "the change signal must be answered by a read sent after it");
    reads[2].resolve({ ok: true, data: { items: replying() } });
    await settle(10);
    assert.deepEqual(panel.order(), ["task-x", "task-a", "task-b", "task-c"], "working task sits on top");
    assert.equal(panel.working("task-x"), true, "working task shows the working mark (now)");
    await settle(10);
    assert.equal(reads.length, 3, "one follow-up read per burst, no loop");
  } finally {
    await panel.unmount();
  }
});

test("opening an old task on its canonical route never moves it; repeated signals coalesce into one follow-up", async () => {
  const reads = [];
  globalThis.__tasksRead = () => {
    const pending = {};
    pending.promise = new Promise((resolve) => { pending.resolve = resolve; });
    reads.push(pending);
    return pending.promise;
  };
  const panel = await mount();
  try {
    reads[0].resolve({ ok: true, data: { items: before() } });
    await settle(10);
    assert.deepEqual(panel.order(), ["task-a", "task-b", "task-c", "task-x"], "open old task keeps its place");

    await act(async () => window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT)));
    for (let i = 0; i < 4; i += 1) {
      await act(async () => window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT)));
    }
    assert.equal(reads.length, 2, "signals during an in-flight read do not stampede the gateway");
    reads[1].resolve({ ok: true, data: { items: before() } });
    await settle(10);
    assert.equal(reads.length, 3, "exactly one follow-up read");
    reads[2].resolve({ ok: true, data: { items: before() } });
    await settle(10);
    assert.deepEqual(panel.order(), ["task-a", "task-b", "task-c", "task-x"], "no activity, no movement");
    assert.equal(reads.length, 3);
  } finally {
    await panel.unmount();
  }
});

test("an unmounted list does not start a follow-up read", async () => {
  const reads = [];
  globalThis.__tasksRead = () => {
    const pending = {};
    pending.promise = new Promise((resolve) => { pending.resolve = resolve; });
    reads.push(pending);
    return pending.promise;
  };
  const panel = await mount();
  reads[0].resolve({ ok: true, data: { items: before() } });
  await settle(10);
  await act(async () => window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT)));
  await act(async () => window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT)));
  await panel.unmount();
  reads[1].resolve({ ok: true, data: { items: before() } });
  await settle(10);
  assert.equal(reads.length, 2);
});
