// LeoChat 小窗：顶栏栏目、放大 / 还原、左列表右对话。整页和右侧栏见 leochat4-surfaces；小窗只在 surface === "window" 时画。
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

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://video.oceanleo.com/library" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);

const { MessagesLayout } = await import(
  await compileModule("src/shell/messages/MessagesLayout.tsx", {
    "../../i18n/ui/useUI": uiStub,
  }),
);
const { LeoChatTabs } = await import(
  await compileModule("src/shell/leochat/LeoChatTabs.tsx", {
    "../../i18n/ui/useUI": uiStub,
  }),
);

globalThis.__leoChat3 = { imOn: true, open: false, surface: "window", toggles: 0, unread: 0 };
const { LeoChatButton } = await import(
  await compileModule("src/shell/leochat/LeoChatButton.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../lib/im/client": dataModule(`export function useImEnabled(){ return globalThis.__leoChat3.imOn; }`),
    "../bay/shell/bay-state": dataModule(`
      export function useBayEnabled(){ return true; }
      export function attachBayDeepLinks(){ return () => {}; }
    `),
    "../messages/host-state": dataModule(`
      export function useMessagesHost(){
        return { open: globalThis.__leoChat3.open, surface: globalThis.__leoChat3.surface || "window" };
      }
      export function hostState(){
        return {
          toggleWindow(){
            globalThis.__leoChat3.open = !globalThis.__leoChat3.open;
            globalThis.__leoChat3.toggles += 1;
          },
        };
      }
      export function openMessages(){ globalThis.__leoChat3.open = true; globalThis.__leoChat3.toggles += 1; }
      export function closeMessages(){ globalThis.__leoChat3.open = false; globalThis.__leoChat3.toggles += 1; }
    `),
    "../messages/realtime/hooks": dataModule(`export function useImUnread(){ return { total: globalThis.__leoChat3.unread }; }`),
    "../messages/messages-surface": dataModule(`export function ensureMessagesSurfaceStyles(){}`),
  }),
);

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(() => {
    root.render(element);
  });
  return {
    host,
    root: document.body,
    async click(selector) {
      const node = document.body.querySelector(selector);
      assert.ok(node, selector);
      await act(() => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    async unmount() {
      await act(() => root.unmount());
      host.remove();
    },
  };
}

function layoutProps(extra = {}) {
  return {
    layout: "docked",
    dockWidth: 420,
    overlayOffset: { x: 20, y: 40 },
    onDockWidth() {},
    onOverlayOffset() {},
    onClose() {},
    overlayState: "open",
    onExitComplete() {},
    title: "LeoChat",
    list: React.createElement("div", { "data-list": "inbox" }, "列表"),
    detail: null,
    showDetail: false,
    ...extra,
  };
}

test("顶栏有标志、LeoChat、两个栏目、放大键、关闭键，没有整页打开", async () => {
  const toggled = [];
  const view = await mount(
    React.createElement(MessagesLayout, {
      ...layoutProps(),
      tabs: React.createElement(LeoChatTabs, { active: "inbox", onSelect() {} }),
      onToggleExpand: () => toggled.push(1),
    }),
  );
  const overlay = document.querySelector('[data-testid="messages-overlay"]');
  assert.ok(overlay);
  assert.ok(overlay.querySelector("[data-im-brand]"));
  assert.match(overlay.textContent, /LeoChat/);
  assert.equal(overlay.querySelectorAll('[role="tab"]').length, 2);
  assert.ok(overlay.querySelector('[data-leochat-expand="expand"]'));
  assert.ok(overlay.querySelector('[aria-label="关闭"]'));
  assert.equal(overlay.querySelector("[data-leochat-open-page]"), null);
  await view.unmount();
});

test("放大键点了调 onToggleExpand", async () => {
  const toggled = [];
  const view = await mount(
    React.createElement(MessagesLayout, {
      ...layoutProps(),
      onToggleExpand: () => toggled.push("x"),
    }),
  );
  await view.click('[data-leochat-expand="expand"]');
  assert.deepEqual(toggled, ["x"]);
  await view.unmount();
});

test("layout=full：左列表右对话；没选会话时右边是空白提示", async () => {
  const view = await mount(
    React.createElement(MessagesLayout, {
      ...layoutProps({
        layout: "full",
        list: React.createElement("div", { "data-list": "people" }, "联系人"),
        detail: null,
        showDetail: false,
      }),
    }),
  );
  const overlay = document.querySelector('[data-testid="messages-overlay"]');
  assert.equal(overlay.getAttribute("data-layout"), "full");
  assert.ok(overlay.querySelector("[data-im-side]"));
  assert.match(overlay.querySelector("[data-im-side]").textContent, /联系人/);
  assert.ok(overlay.querySelector("[data-im-empty]"));
  assert.match(overlay.querySelector("[data-im-empty]").textContent, /选一个会话开始聊天/);
  await view.unmount();
});

test("layout=mobile 没有放大键", async () => {
  const view = await mount(
    React.createElement(MessagesLayout, {
      ...layoutProps({ layout: "mobile", onToggleExpand: () => {} }),
    }),
  );
  assert.equal(document.querySelector("[data-leochat-expand]"), null);
  await view.unmount();
});

test("栏目只有聊天、联系人", () => {
  const html = renderToStaticMarkup(
    React.createElement(LeoChatTabs, {
      active: "inbox",
      onSelect() {},
      badges: { inbox: 3, people: 0, bay: 100 },
    }),
  );
  assert.match(html, /聊天/);
  assert.match(html, /联系人/);
  assert.doesNotMatch(html, /LeoBay/);
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.match(html, />3</);
  assert.doesNotMatch(html, /99\+/);
  const tabs = src("shell/leochat/LeoChatTabs.tsx");
  assert.match(tabs, /id: "inbox"/);
  assert.match(tabs, /id: "people"/);
  assert.doesNotMatch(tabs, /id: "bay"/);
});

test("LeoChatButton：未登录不渲染；点一下开再点一下关", async () => {
  globalThis.__leoChat3.imOn = false;
  globalThis.__leoChat3.open = false;
  globalThis.__leoChat3.toggles = 0;
  const hidden = await mount(React.createElement(LeoChatButton));
  assert.equal(hidden.host.querySelector("[data-leochat-button]"), null);
  await hidden.unmount();

  globalThis.__leoChat3.imOn = true;
  const view = await mount(React.createElement(LeoChatButton));
  assert.ok(view.host.querySelector("[data-leochat-button]"));
  await view.click("[data-leochat-open]");
  assert.equal(globalThis.__leoChat3.open, true);
  await view.unmount();
  const again = await mount(React.createElement(LeoChatButton));
  assert.equal(again.host.querySelector("[data-leochat-open]").getAttribute("data-leochat-open"), "true");
  await again.click("[data-leochat-open]");
  assert.equal(globalThis.__leoChat3.open, false);
  assert.equal(globalThis.__leoChat3.toggles, 2);
  await again.unmount();
});

test("放大后联系人栏在左、当前会话仍在右", async () => {
  const view = await mount(
    React.createElement(MessagesLayout, {
      ...layoutProps({
        layout: "full",
        list: React.createElement("div", { "data-list": "people" }, "联系人列"),
        detail: React.createElement("div", { "data-detail": "chat" }, "当前会话"),
        showDetail: true,
        onToggleExpand: () => {},
      }),
    }),
  );
  const overlay = document.querySelector('[data-testid="messages-overlay"]');
  assert.match(overlay.querySelector("[data-im-side]").textContent, /联系人列/);
  assert.match(overlay.textContent, /当前会话/);
  assert.equal(overlay.querySelector("[data-im-empty]"), null);
  await view.unmount();
});

test("源码：放大后切到联系人也不收走当前会话；按钮调 toggleWindow；小窗只在 surface === window 时画", () => {
  const host = src("shell/messages/MessagesHost.tsx");
  assert.match(host, /state\.view === "inbox" \|\| state\.layout === "full"/);
  assert.match(host, /windowOpen = state\.open && state\.surface === "window"/);
  assert.doesNotMatch(host, /data-leochat-open-page/);
  assert.doesNotMatch(host, /BayView|id: "bay"/);
  const layout = src("shell/messages/MessagesLayout.tsx");
  assert.match(layout, /onToggleExpand/);
  assert.match(layout, /ImExpandIcon|ImCollapseIcon/);
  assert.doesNotMatch(layout, /data-leochat-open-page/);
  const button = src("shell/leochat/LeoChatButton.tsx");
  assert.match(button, /if \(!imOn\) return null/);
  assert.match(button, /hostState\(\)\.toggleWindow\(\)/);
});

test("源码：记住放大状态；默认高度 660、顶栏 52、圆角 22", () => {
  const state = src("shell/messages/host-state.ts");
  assert.match(state, /EXPANDED_KEY = "oceanleo:leochat:expanded"/);
  assert.match(state, /setItem\(EXPANDED_KEY, expanded \? "1" : "0"\)/);
  const geo = src("shell/messages/overlay-geometry.ts");
  assert.match(geo, /MESSAGES_DEFAULT_HEIGHT_PX = 660/);
  assert.match(geo, /MESSAGES_HEADER_HEIGHT_PX = 52/);
  assert.match(geo, /MESSAGES_OVERLAY_RADIUS_PX = 22/);
  assert.match(geo, /MESSAGES_EXPANDED_WIDTH_PX = 1180/);
  assert.match(geo, /MESSAGES_EXPANDED_HEIGHT_PX = 820/);
});

test("MessagesHost：不可用时只渲染登录框宿主；没有 LeoBay 栏", () => {
  const host = src("shell/messages/MessagesHost.tsx");
  assert.match(host, /if \(!enabled\) return <BayAuthHost \/>;/);
  assert.doesNotMatch(host, /BayView|BayGuestHost/);
  assert.match(host, /isTalentConversationId/);
  assert.match(host, /DealConversationView/);
});

test("layout=full 时左列表在 data-im-side、右边对话在 detail 栏", async () => {
  const view = await mount(
    React.createElement(MessagesLayout, {
      ...layoutProps({
        layout: "full",
        list: React.createElement("div", { "data-list": "inbox" }, "聊天列"),
        detail: React.createElement("div", { "data-detail": "empty" }),
        showDetail: true,
      }),
    }),
  );
  const overlay = document.querySelector('[data-testid="messages-overlay"]');
  assert.equal(overlay.getAttribute("data-layout"), "full");
  assert.match(overlay.querySelector("[data-im-side]").textContent, /聊天列/);
  assert.equal(overlay.querySelector('[data-im-pane="detail"]'), null, "放大态是左右分栏，不是推入栏");
  await view.unmount();
});

test("交易会话 id 以 talent: 开头时 MessagesHost 走交易视图", () => {
  const host = src("shell/messages/MessagesHost.tsx");
  assert.match(host, /id\.startsWith\("talent:"\)/);
  assert.match(host, /<DealConversationView/);
});
