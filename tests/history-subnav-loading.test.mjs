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
    export function usePathname(){ return "/workspace/poster"; }
    export function useRouter(){ return { push(){}, replace(){}, prefetch(){} }; }
  `),
  "./WorkspaceSelection": dataModule(`
    export function useWorkspaceSelection(){ return globalThis.React.useState(null); }
  `),
  "./AgentChat": dataModule(`export function AgentChat(){ return null; }`),
  "./WorkspaceSession": dataModule(
    `export function WorkspaceSessionProvider({ children }){ return children; }`,
  ),
  "./HistoryRowActions": dataModule(`
    export function HistoryRowMenu(){ return null; }
    export function MoveTaskProjectDialog(){ return null; }
  `),
  "../ui": dataModule(`export function ConfirmDialog(){ return null; }`),
  "../lib/auth/client": dataModule(`export function browserClient(){ return null; }`),
  "../lib/agent": dataModule(`
    export async function listTasks(){ return { ok: true, data: { items: [] } }; }
    export async function deleteTask(){ return { ok: true }; }
    export async function getTask(){ return { ok: false, status: 404 }; }
    export function taskCostYuan(){ return 0; }
  `),
  "../lib/app-session": dataModule(`
    export function isAppSessionApiUnavailableStatus(status){ return status === 404 || status === 405 || status === 501; }
    export async function listAppSessions(){
      globalThis.__historyGate.listCalls += 1;
      if (globalThis.__historyGate.release) await globalThis.__historyGate.release;
      return { ok: true, data: { items: globalThis.__historyItems } };
    }
    export async function getAppSession(){ return { ok: false, status: 404 }; }
    export async function deleteAppSession(){ return { ok: true }; }
    export async function updateAppSessionMetadata(){ return { ok: true }; }
  `),
});

const { HistoryInlineList } = await import(historyUrl);
const { HISTORY_CHANGED_EVENT } = await import("../src/lib/history-events.ts");

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
  let rerender = () => {};
  function Bed() {
    const [, bump] = React.useState(0);
    rerender = () => bump((value) => value + 1);
    return React.createElement(HistoryInlineList, { siteId: "image" });
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
