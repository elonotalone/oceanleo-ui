/**
 * W3（2026-10-31）：左侧「我的任务」仿 Manus。
 * - 行只有一行任务名：不显示时间 / home-agent 来源 / 花费副标题；
 * - 选中 = 中性灰底（bg-neutral-200/80），不再涂蓝色 accent、不再白字；
 * - 悬停 ~300 ms（或键盘聚焦）在行右侧弹出气泡：完整任务名 + 时间，portal 到 body；
 *   移开即收。
 * - formatHistoryTime：今天显示钟点，今年其余显示短日期，跨年带年份。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { formatHistoryTime } from "../src/shell/history-model.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/history/s-long",
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
  FocusEvent: window.FocusEvent,
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

const LONG_TITLE = "制作两页极简PPT、1秒音频、3×3 Excel和1秒视频，并把结果整理成一份交付说明";

function session(id, title, extra = {}) {
  return {
    id, site_id: "oceanleo", app_id: "home-agent", surface: "app", status: "archived", title, snapshot: {},
    schema_version: 1, revision: 1, created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z",
    last_activity_at: "2026-10-20T08:30:00Z", first_output_at: "2026-10-20T00:00:00Z", ...extra,
  };
}

globalThis.__manusSessions = [session("s-long", LONG_TITLE), session("s-short", "Greeting")];
globalThis.__manusTasks = [
  { id: "t-cost", title: "云端任务", status: "done", mode: "agent", site_id: "oceanleo", created_at: "2026-10-19T00:00:00Z", nano_spent: 5 },
];

const historyUrl = await compileModule("src/shell/HistoryMasterDetail.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI(){ return (value) => value; }`),
  "next/navigation": dataModule(`
    export function usePathname(){ return "/history/s-long"; }
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
    export async function authed(){ return { ok: false, error: "stub", status: 401 }; }
    export async function listTasks(){ return { ok: true, data: { items: globalThis.__manusTasks } }; }
    export async function deleteTask(){ return { ok: true }; }
    export async function getTask(){ return { ok: false, status: 404 }; }
    export function taskCostYuan(){ return 1.23; }
  `),
  "../lib/app-session": dataModule(`
    export function isAppSessionApiUnavailableStatus(status){ return status === 404 || status === 405 || status === 501; }
    export async function listAppSessions(){ return { ok: true, data: { items: globalThis.__manusSessions } }; }
    export async function getAppSession(){ return { ok: false, status: 404 }; }
    export async function deleteAppSession(){ return { ok: true }; }
    export async function updateAppSessionMetadata(){ return { ok: true }; }
  `),
});

const { HistoryInlineList } = await import(historyUrl);

async function mount() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(HistoryInlineList, { siteId: "oceanleo", accent: "#0ea5e9" })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  return {
    container,
    frame: (id) => container.querySelector(`[data-history-row="${id}"]`)?.closest("[data-history-row-frame]"),
    async unmount() {
      await act(async () => { root.unmount(); });
      container.remove();
    },
  };
}

const wait = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

test("行只有一行任务名：无时间、无 home-agent 来源、无花费", async () => {
  const view = await mount();
  try {
    const text = view.container.textContent;
    assert.match(text, /Greeting/);
    assert.doesNotMatch(text, /\d{2}\/\d{2}/, "no 10/31 16:24 style time line");
    assert.doesNotMatch(text, /home-agent/);
    assert.doesNotMatch(text, /1\.23|¥|\$/);
    const title = view.frame("s-long").querySelector("[data-history-title]");
    assert.equal(title.textContent, LONG_TITLE);
    assert.match(title.className, /\btruncate\b/, "one line, ellipsis");
    assert.match(view.frame("s-long").className, /text-\[14px\]/, "bigger task name than the old 13px two-line row");
  } finally {
    await view.unmount();
  }
});

test("选中任务 = 中性灰底，不再蓝底白字；未选中只有悬停浅灰", async () => {
  const view = await mount();
  try {
    const selected = view.frame("s-long");
    const idle = view.frame("s-short");
    assert.match(selected.className, /bg-neutral-200\/80/);
    assert.doesNotMatch(selected.className, /text-white/);
    assert.equal(selected.getAttribute("style"), null, "no inline accent background");
    assert.doesNotMatch(idle.className, /(^|\s)bg-neutral-200\/80/);
    assert.match(idle.className, /hover:bg-neutral-200\/50/);
    assert.equal(view.container.querySelector("[style*='background']"), null);
  } finally {
    await view.unmount();
  }
});

test("悬停 300 ms 弹出气泡：完整名 + 短日期，portal 到 body；移开即收", async () => {
  const view = await mount();
  try {
    const frame = view.frame("s-long");
    await act(async () => {
      frame.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });
    await wait(100);
    assert.equal(document.querySelector("[data-history-bubble]"), null, "not before the hover delay");
    await wait(300);
    const bubble = document.querySelector("[data-history-bubble]");
    assert.ok(bubble, "bubble shows after ~300 ms");
    assert.equal(bubble.getAttribute("role"), "tooltip");
    assert.equal(view.container.contains(bubble), false, "portaled out of the sidebar");
    assert.equal(bubble.parentElement, document.body);
    assert.equal(bubble.querySelector("[data-history-bubble-title]").textContent, LONG_TITLE);
    assert.match(bubble.querySelector("[data-history-bubble-title]").className, /break-words/);
    const time = bubble.querySelector("[data-history-bubble-time]");
    assert.equal(time.getAttribute("datetime"), "2026-10-20T08:30:00Z");
    assert.equal(time.textContent, formatHistoryTime("2026-10-20T08:30:00Z", new Date(), "en"));
    assert.match(bubble.className, /bg-white/);
    assert.match(bubble.className, /border/);
    assert.match(bubble.className, /rounded-xl/);
    assert.match(bubble.className, /shadow/);
    assert.equal(frame.querySelector("button").getAttribute("aria-describedby"), bubble.id);

    await act(async () => {
      frame.dispatchEvent(new window.MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    });
    assert.equal(document.querySelector("[data-history-bubble]"), null, "closes as soon as the pointer leaves");
  } finally {
    await view.unmount();
  }
});

test("键盘聚焦任务名也会弹出气泡，失焦即收", async () => {
  const view = await mount();
  try {
    const button = view.frame("s-short").querySelector("button");
    await act(async () => { button.focus(); });
    await wait(350);
    const bubble = document.querySelector("[data-history-bubble]");
    assert.ok(bubble);
    assert.match(bubble.textContent, /Greeting/);
    await act(async () => { button.blur(); });
    assert.equal(document.querySelector("[data-history-bubble]"), null);
  } finally {
    await view.unmount();
  }
});

test("formatHistoryTime：今天 = 钟点；今年 = 短日期（Oct 20）；跨年带年份；坏值为空", () => {
  const now = new Date(2026, 9, 31, 17, 0, 0);
  const today = new Date(2026, 9, 31, 16, 54, 0).toISOString();
  assert.equal(formatHistoryTime(today, now, "en-US"), "4:54 PM");
  assert.equal(formatHistoryTime(new Date(2026, 9, 20, 9, 0).toISOString(), now, "en-US"), "Oct 20");
  assert.equal(formatHistoryTime(new Date(2026, 9, 20, 9, 0).toISOString(), now, "zh-CN"), "10月20日");
  assert.match(formatHistoryTime(new Date(2025, 2, 3, 9, 0).toISOString(), now, "en-US"), /Mar 3, 2025/);
  assert.equal(formatHistoryTime("", now, "en-US"), "");
  assert.equal(formatHistoryTime("not a date", now, "en-US"), "");
  assert.ok(formatHistoryTime(today, now, "xx-invalid-@@"), "bad locale tags fall back instead of throwing");
});
