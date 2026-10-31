/**
 * 左栏「我的任务」的「加载…」只准出现一次：首屏还没拿到任何数据的时候。
 *
 * 之后无论是 HISTORY_CHANGED 事件、翻译函数换了引用（词典对象重新下发）、
 * 还是列表被卸载重挂（侧栏收成 rail 再展开、布局重排），都只在后台刷新，
 * 已有列表继续显示——用户在右栏切页签时左栏不得闪「加载…」。
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
globalThis.__historyGate = { listCalls: 0, release: null, ttSeq: 0 };

function session(id, title) {
  return {
    id,
    site_id: "image",
    app_id: "poster",
    surface: "app",
    status: "active",
    title,
    snapshot: {},
    schema_version: 1,
    revision: 1,
    created_at: "2026-09-05T00:00:00Z",
    updated_at: "2026-09-05T00:00:00Z",
    last_activity_at: "2026-09-05T00:00:00Z",
    first_output_at: "2026-09-05T00:00:00Z",
  };
}
globalThis.__historyItems = [session("s-1", "第一条任务")];

const historyUrl = await compileModule("src/shell/HistoryMasterDetail.tsx", {
  "../i18n/ui/useUI": dataModule(`
    // 每次渲染都返回一个新函数，模拟词典对象换引用后 useUI 的 memo 失效。
    export function useUI(){ globalThis.__historyGate.ttSeq += 1; return (value) => value; }
  `),
  "next/navigation": dataModule(`
    export function usePathname(){ return globalThis.__historyPath || "/workspace/poster"; }
    export function useRouter(){ return { push(href){ globalThis.__historyPushed = href; }, replace(){}, prefetch(){} }; }
  `),
  "./WorkspaceSelection": dataModule(`
    export function useWorkspaceSelection(){ return globalThis.React.useState(globalThis.__historySelected || null); }
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
  "../ui": dataModule(`export function ConfirmDialog(){ return null; } export function SkeletonCard(){ return null; } export function SkeletonLine(){ return null; }`),
  // HistoryDetail 现在会为 mode=shell 的任务渲染 ShellTaskView，其 cloud-computer-api
  // 依赖还从这里取 accessToken；bench 补上这个导出，历史列表本身不碰它。
  "../lib/auth/client": dataModule(`
    export function browserClient(){ return null; }
    export async function accessToken(){ return null; }
  `),
  "../lib/agent": dataModule(`
    export async function listTasks(){ return { ok: true, data: { items: globalThis.__legacyItems || [] } }; }
    export async function deleteTask(){ return { ok: true }; }
    export async function getTask(){ globalThis.__cloudDetailCalls = (globalThis.__cloudDetailCalls || 0) + 1; return { ok: false, status: 404 }; }
    export function taskCostYuan(){ return 0; }
  `),
  "../lib/app-session": dataModule(`
    export function isAppSessionApiUnavailableStatus(status){ return status === 404 || status === 405 || status === 501; }
    export async function listAppSessions(){
      globalThis.__historyGate.listCalls += 1;
      if (globalThis.__historyGate.release) await globalThis.__historyGate.release;
      return { ok: true, data: { items: globalThis.__historyItems } };
    }
    export async function getAppSession(){ globalThis.__cloudDetailCalls = (globalThis.__cloudDetailCalls || 0) + 1; return { ok: false, status: 404 }; }
    export async function deleteAppSession(){ return { ok: true }; }
    export async function updateAppSessionMetadata(){ return { ok: true }; }
  `),
});

const { HistoryInlineList, HistoryDetail } = await import(historyUrl);
const { HISTORY_CHANGED_EVENT } = await import("../src/lib/history-events.ts");

test("local queue appears in My Tasks once and opens native detail without cloud requests", async () => {
  const saved = globalThis.__OCEANLEO_CLIENT_HOST_CONFIG__;
  const cancellations = [];
  const tasks = [{ id: "local-1", remoteTaskId: "cloud-1", title: "写入文件", stage: "waiting_for_network", path: "/work/result.txt", summary: "文件已保存", failure: "", canCancel: false }];
  globalThis.__OCEANLEO_CLIENT_HOST_CONFIG__ = { family: "com", portalOrigin: "https://oceanleo.com", gatewayOrigin: "https://api.dev.oceanleo.com", identityOrigin: "https://auth.oceanleo.com", platform: "desktop", localWorkspace: { listTasks: async () => tasks, cancelTask: async (id) => cancellations.push(id) } };
  globalThis.__legacyItems = [{ id: "cloud-1", title: "不应重复出现", created_at: "2026-10-24T00:00:00Z", status: "running", site_id: "oceanleo" }];
  globalThis.__historyPath = "/history";
  let panel;
  try {
    panel = await mount("oceanleo");
    await settle(20);
    assert.match(panel.text(), /写入文件/);
    // 2026-10-31 Manus 式一行：本机阶段不再占第二行，悬停 title 里看。
    assert.doesNotMatch(panel.text(), /在本机执行.*等待网络恢复/);
    assert.doesNotMatch(panel.text(), /不应重复出现/);
    const button = [...panel.container.querySelectorAll("button")].find((node) => node.textContent.includes("写入文件"));
    assert.match(button.getAttribute("title") || "", /在本机执行.*等待网络恢复/);
    assert.equal(button.style.background, "", "selected/idle rows never paint the accent colour");
    await act(async () => button.click());
    assert.equal(globalThis.__historyPushed, "/history?task=local%3Alocal-1");
    await panel.unmount(); panel = null;
    globalThis.__historySelected = "local:local-1";
    globalThis.__cloudDetailCalls = 0;
    panel = await mount("oceanleo", true);
    await settle(20);
    assert.match(panel.text(), /文件已保存/);
    assert.match(panel.text(), /联网后会自动同步记录/);
    assert.equal(globalThis.__cloudDetailCalls, 0);
    assert.equal([...panel.container.querySelectorAll("button")].some((node) => node.textContent === "停止任务"), false);
    await panel.unmount(); panel = null;
    tasks[0] = { ...tasks[0], stage: "queued", canCancel: true };
    panel = await mount("oceanleo", true);
    await settle(20);
    const stop = [...panel.container.querySelectorAll("button")].find((node) => node.textContent === "停止任务");
    assert.ok(stop);
    await act(async () => stop.click());
    assert.deepEqual(cancellations, ["local-1"]);
    await panel.unmount(); panel = null;
    tasks[0] = { ...tasks[0], stage: "done", canCancel: false };
    globalThis.__legacyItems[0] = { ...globalThis.__legacyItems[0], title: "保留云端标题", status: "done" };
    panel = await mount("oceanleo");
    await settle(20);
    assert.match(panel.text(), /保留云端标题/);
    assert.doesNotMatch(panel.text(), /写入文件/);
  } finally {
    await panel?.unmount();
    globalThis.__OCEANLEO_CLIENT_HOST_CONFIG__ = saved;
    delete globalThis.__legacyItems;
    delete globalThis.__historySelected;
    delete globalThis.__historyPath;
  }
});

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mount(siteId = "image", detail = false) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let rerender = () => {};
  function Bed() {
    const [, bump] = React.useState(0);
    rerender = () => bump((value) => value + 1);
    return React.createElement(detail ? HistoryDetail : HistoryInlineList, { siteId });
  }
  await act(async () => {
    root.render(React.createElement(Bed));
  });
  return {
    container,
    rerender,
    text: () => container.textContent || "",
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

test("首屏拿到数据前显示「加载…」，拿到后消失", async () => {
  let release;
  globalThis.__historyGate.release = new Promise((resolve) => {
    release = resolve;
  });
  const panel = await mount();
  try {
    assert.match(panel.text(), /加载…/);
    release();
    globalThis.__historyGate.release = null;
    await settle(20);
    assert.doesNotMatch(panel.text(), /加载…/);
    assert.match(panel.text(), /第一条任务/);
  } finally {
    await panel.unmount();
  }
});

test("翻译函数换引用、HISTORY_CHANGED 刷新都不再闪「加载…」", async () => {
  const panel = await mount();
  try {
    await settle(20);
    assert.match(panel.text(), /第一条任务/);
    const before = globalThis.__historyGate.listCalls;

    // 父级重渲染 → useUI 返回新函数：老实现会重建 reload 并非静默重拉。
    let pending;
    globalThis.__historyGate.release = new Promise((resolve) => {
      pending = resolve;
    });
    await act(async () => {
      panel.rerender();
    });
    await settle(0);
    assert.doesNotMatch(panel.text(), /加载…/);
    assert.equal(
      globalThis.__historyGate.listCalls,
      before,
      "词典换引用不得触发任何重拉",
    );

    // 事件刷新在后台进行，请求挂起期间列表照常显示。
    await act(async () => {
      window.dispatchEvent(new window.Event(HISTORY_CHANGED_EVENT));
    });
    await settle(0);
    assert.equal(globalThis.__historyGate.listCalls, before + 1);
    assert.doesNotMatch(panel.text(), /加载…/);
    assert.match(panel.text(), /第一条任务/);
    globalThis.__historyItems = [
      session("s-2", "新的产出"),
      ...globalThis.__historyItems,
    ];
    pending();
    globalThis.__historyGate.release = null;
    await settle(20);
    assert.match(panel.text(), /新的产出/);
  } finally {
    await panel.unmount();
  }
});

test("卸载重挂直接沿用上次列表，不回到「加载…」", async () => {
  const first = await mount();
  await settle(20);
  assert.match(first.text(), /新的产出/);
  await first.unmount();

  let release;
  globalThis.__historyGate.release = new Promise((resolve) => {
    release = resolve;
  });
  const second = await mount();
  try {
    assert.doesNotMatch(second.text(), /加载…/);
    assert.match(second.text(), /新的产出/);
    release();
    globalThis.__historyGate.release = null;
    await settle(20);
    assert.match(second.text(), /第一条任务/);
  } finally {
    await second.unmount();
  }
});
