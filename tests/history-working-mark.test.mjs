/**
 * C-7（2026-10-31）：「我的任务」任务名左侧只有两种状态——agent 在干活时显示
 * 工作中动效（与电脑对话列表同一个像素小人），不干活时什么都不显示；
 * 不再有红黄绿灰状态点。运行结束后几秒内动效消失。
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
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://image.oceanleo.com/workspace/poster",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
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
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
window.Element.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.React = React;


function session(id, title, extra = {}) {
  return {
    id, site_id: "image", app_id: "poster", surface: "app", status: "active", title, snapshot: {},
    schema_version: 1, revision: 1, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z",
    last_activity_at: "2026-09-22T00:00:00Z", first_output_at: "2026-09-22T00:00:00Z", ...extra,
  };
}
function task(id, title, extra = {}) {
  return { id, title, status: "done", mode: "agent", created_at: "2026-09-21T00:00:00Z", ...extra };
}

globalThis.__workingSessions = [
  session("s-run", "云端正在跑"),
  session("s-idle", "已经做完"),
  session("s-native", "电脑会话等确认"),
];
globalThis.__workingTasks = [
  task("t-run", "bound", { status: "running", session_id: "s-run" }),
  task("t-idle", "bound", { status: "done", session_id: "s-idle" }),
  task("t-native", "bound", { status: "done", session_id: "s-native", computer_run_status: "waiting_user" }),
  task("t-failed", "旧任务失败了", { status: "failed" }),
  task("t-stopped", "旧任务停了", { status: "stopped" }),
];

const historyUrl = await compileModule("src/shell/HistoryMasterDetail.tsx", {
  "../i18n/ui/useUI": dataModule(
    `export function useUI(){ return (value) => value; }`,
  ),
  "next/navigation": dataModule(`
    export function usePathname(){ return "/workspace/poster"; }
    export function useRouter(){ return { push(){}, replace(){}, prefetch(){} }; }
  `),
  "./WorkspaceSelection": dataModule(`
    export function useWorkspaceSelection(){ return globalThis.React.useState(null); }
  `),
  "./AgentChat": dataModule(`export function AgentChat(){ return null; }`),
  "./library-task-history": dataModule(`export function LibraryTaskHistoryWorkspace(){return null;}`),
  "./WorkspaceSession": dataModule(
    `export function WorkspaceSessionProvider({ children }){ return children; }`,
  ),
  "./HistoryRowActions": dataModule(`
    export function HistoryRowMenu(){ return null; }
    export function MoveTaskProjectDialog(){ return null; }
  `),
  "../ui": dataModule(`export function ConfirmDialog(){ return null; }`),
  "../lib/auth/client": dataModule(`
    export function browserClient(){ return null; }
    export async function accessToken(){ return null; }
  `),
  "../lib/agent": dataModule(`
    export async function authed(){ return { ok: false, error: "stub", status: 401 }; }
    export async function listTasks(){
      return { ok: true, data: { items: globalThis.__workingTasks } };
    }
    export async function deleteTask(){ return { ok: true }; }
    export async function getTask(){ return { ok: false, status: 404 }; }
    export function taskCostYuan(){ return 0; }
  `),
  "../lib/app-session": dataModule(`
    export function isAppSessionApiUnavailableStatus(status){
      return status === 404 || status === 405 || status === 501;
    }
    export async function listAppSessions(){
      return { ok: true, data: { items: globalThis.__workingSessions } };
    }
    export async function getAppSession(){ return { ok: false, status: 404 }; }
    export async function deleteAppSession(){ return { ok: true }; }
    export async function updateAppSessionMetadata(){ return { ok: true }; }
  `),
});

const { HistoryInlineList } = await import(historyUrl);

function row(container, id) {
  return container.querySelector(`[data-history-row="${id}"]`);
}
function workingIds(container) {
  return [...container.querySelectorAll("[data-history-row]")]
    .filter((node) => node.querySelector("[data-history-working] [data-oceanleo-acp-pixel-run]"))
    .map((node) => node.getAttribute("data-history-row"));
}

test("C-7: 只有在干活的行显示工作中动效；完成/失败/停止都不显示任何状态点；结束后几秒内消失", async () => {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(HistoryInlineList, { siteId: "image" })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  try {
    for (const id of ["s-run", "s-idle", "s-native", "t-failed", "t-stopped"]) assert.ok(row(container, id), id);
    assert.deepEqual(workingIds(container).sort(), ["s-native", "s-run"]);
    const mark = row(container, "s-run").querySelector("[data-oceanleo-acp-pixel-run]");
    assert.equal(mark.getAttribute("aria-label"), "进行中");
    assert.match(mark.getAttribute("class"), /text-emerald-600/);
    // Idle rows keep an empty, same-width slot: titles stay aligned, nothing coloured shows.
    const idleSlot = row(container, "t-failed").firstElementChild;
    assert.equal(idleSlot.children.length, 0);
    assert.match(idleSlot.getAttribute("class"), /w-3/);
    assert.equal(container.querySelector(".rounded-full.h-1\\.5"), null, "no red/amber/green/grey status dots");
    for (const cls of ["bg-amber-400", "bg-emerald-500", "bg-rose-500", "bg-stone-400"]) {
      assert.equal(container.querySelector(`[data-history-row] .${cls}`), null, cls);
    }

    // The run ends; nothing on the page emits an event. The working-only poll picks it up.
    globalThis.__workingTasks = globalThis.__workingTasks.map((item) =>
      item.id === "t-run" ? { ...item, status: "done" } : item.id === "t-native" ? { ...item, computer_run_status: undefined } : item);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 4_500)); });
    assert.deepEqual(workingIds(container), [], "the mark stops within a few seconds of the run ending");

    // A new run starts (history-changed event from send/continue): the mark comes back.
    globalThis.__workingTasks = globalThis.__workingTasks.map((item) => item.id === "t-idle" ? { ...item, status: "running" } : item);
    await act(async () => {
      window.dispatchEvent(new window.Event("oceanleo:history-changed"));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.deepEqual(workingIds(container), ["s-idle"]);
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
  }
});
