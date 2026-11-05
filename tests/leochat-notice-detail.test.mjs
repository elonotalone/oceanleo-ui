import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", "src", rel), "utf8");
const reactUrl = await import.meta.resolve("react");

function item(over = {}) {
  return {
    id: "notice-1",
    kind: "talent.order.new",
    title: "订单有新的交付",
    body: "请在订单页查看交付内容。",
    link: "/bay?bay=order:order-1",
    meta: {},
    read_at: null,
    created_at: "2026-11-05T05:00:00Z",
    ...over,
  };
}

test("openNoticeDetail：标已读并打开通知详情，不执行通知链接", async () => {
  const state = { opened: [], marked: [] };
  const moduleUrl = await compileModule("src/shell/messages/notices/open-notice.ts", {
    "../../../api/notifications": dataModule("export {};"),
    "../../bay/shell/bay-state": dataModule("export function bayEnabledHere(){ return true; } export function openBay(){}"),
    "../host-state": dataModule(`export function hostState(){ return { open(target){ globalThis.__noticeDetailTest.opened.push(target); } }; } export function closeMessages(){} export function openMessages(){} export function isCaseId(){ return true; } export function parseImDeepLink(){ return { kind: "none" }; }`),
    "./use-notices": dataModule(`export function noticeStore(){ return { markRead(ids){ globalThis.__noticeDetailTest.marked.push(ids); return Promise.resolve(); } }; }`),
  });
  globalThis.__noticeDetailTest = state;
  const { openNoticeDetail } = await import(moduleUrl);
  openNoticeDetail(item(), { markRead: (ids) => state.marked.push(ids) });
  assert.deepEqual(state.marked, [["notice-1"]]);
  assert.deepEqual(state.opened, [{ view: "notice-detail", noticeId: "notice-1" }]);
  delete globalThis.__noticeDetailTest;
});

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://oceanleo.com/leochat" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
  return {
    host,
    async click(selector) {
      const node = host.querySelector(selector);
      assert.ok(node, selector);
      await act(() => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    },
    async unmount() {
      await act(() => root.unmount());
      host.remove();
    },
  };
}

const detailState = { target: { kind: "internal", href: "/history?task=t1" }, actionable: true, runs: [], backs: 0 };
const viewModule = await compileModule("src/shell/messages/notices/NoticeDetailView.tsx", {
  "../../../api/notifications": dataModule("export {};"),
  "../../../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
  "../messages-surface": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ImBackIcon(){ return React.createElement("i"); }`),
  "./notice-icons": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function NoticeBellIcon(){ return React.createElement("i"); }`),
  "./notice-present": dataModule("export function formatNoticeTime(){ return '2026/11/05 13:00'; }"),
  "./open-notice": dataModule(`
    export function noticeTargetOf(){ return globalThis.__noticeDetailView.target; }
    export function noticeActionable(){ return globalThis.__noticeDetailView.actionable; }
    export function browserNoticeActions(){ return {}; }
    export function runNoticeTarget(target){ globalThis.__noticeDetailView.runs.push(target); }
  `),
  "./use-notices": dataModule("export function useNoticeState(){ return globalThis.__noticeDetailView.state; }")
});
const { NoticeDetailView } = await import(viewModule);
globalThis.__noticeDetailView = detailState;

test("NoticeDetailView：正文完整显示；链接点击才执行目标；无链接不画；返回回列表", async () => {
  detailState.state = { items: [item()] };
  const view = await mount(React.createElement(NoticeDetailView, { noticeId: "notice-1", onBack: () => detailState.backs += 1 }));
  assert.ok(view.host.querySelector('[data-notice-detail=""]'));
  assert.match(view.host.textContent, /订单有新的交付/);
  assert.match(view.host.textContent, /请在订单页查看交付内容/);
  assert.match(view.host.textContent, /2026\/11\/05/);
  assert.equal(detailState.runs.length, 0);
  await view.click("[data-notice-detail-target]");
  assert.deepEqual(detailState.runs, [detailState.target]);
  await view.click("[data-notice-detail-back]");
  assert.equal(detailState.backs, 1);
  await view.unmount();

  detailState.target = { kind: "none" };
  detailState.actionable = false;
  const noLink = await mount(React.createElement(NoticeDetailView, { noticeId: "notice-1", onBack() {} }));
  assert.equal(noLink.host.querySelector("[data-notice-detail-target]"), null);
  await noLink.unmount();
  delete globalThis.__noticeDetailView;
});
