// W5: the account button targets the existing right-sidebar LeoChat surface.
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

// jsdom's optional canvas binding is not needed by this focused shell test.
const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://music.oceanleo.com/workspace" });
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

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);

globalThis.__w5Button = {
  imOn: true,
  panelOpen: false,
  workspaceOpenRequests: 0,
  windowToggles: 0,
  panelOpens: 0,
  panelCloses: 0,
};

const { LeoChatButton } = await import(
  await compileModule("src/shell/leochat/LeoChatButton.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../lib/im/client": dataModule(`export function useImEnabled(){ return globalThis.__w5Button.imOn; }`),
    "../bay/shell/bay-state": dataModule(`
      export function useBayEnabled(){ return true; }
      export function attachBayDeepLinks(){ return () => {}; }
    `),
    "../messages/host-state": dataModule(`
      export function useMessagesHost(){
        return {
          open: globalThis.__w5Button.panelOpen,
          surface: globalThis.__w5Button.panelOpen ? "panel" : "window",
        };
      }
      export function hostState(){
        return { toggleWindow(){ globalThis.__w5Button.windowToggles += 1; } };
      }
    `),
    "../messages/messages-surface": dataModule(`export function ensureMessagesSurfaceStyles(){}`),
    "../messages/notices/use-notices": dataModule(`
      export function useLeoChatUnread(){ return { chat: 0, notices: 0, requests: 0, total: 0 }; }
    `),
    "../workspace-actions": dataModule(`
      export function dispatchWorkspaceAction(){ globalThis.__w5Button.workspaceOpenRequests += 1; }
    `),
  }),
);

function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  return act(async () => {
    root.render(element);
    await Promise.resolve();
    return {
      host,
      root,
      async click() {
        const button = host.querySelector("[data-leochat-open]");
        assert.ok(button);
        await act(() => button.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      },
      async unmount() {
        await act(() => root.unmount());
        host.remove();
      },
    };
  });
}

function resetState() {
  Object.assign(globalThis.__w5Button, {
    imOn: true,
    panelOpen: false,
    workspaceOpenRequests: 0,
    windowToggles: 0,
    panelOpens: 0,
    panelCloses: 0,
  });
}

function installPanelCanvas() {
  const receive = (event) => {
    if (event.detail?.handled) return;
    event.detail.handled = true;
    if (globalThis.__w5Button.panelOpen) {
      globalThis.__w5Button.panelOpen = false;
      globalThis.__w5Button.panelCloses += 1;
    } else {
      globalThis.__w5Button.panelOpen = true;
      globalThis.__w5Button.panelOpens += 1;
    }
  };
  window.addEventListener("oceanleo:leochat-panel-request", receive);
  return () => window.removeEventListener("oceanleo:leochat-panel-request", receive);
}

test("按钮请求 leochat 面板；第二次关闭；从不打开浮窗", async () => {
  resetState();
  const removeCanvas = installPanelCanvas();
  let view = await mount(React.createElement(LeoChatButton));
  await view.click();
  assert.equal(globalThis.__w5Button.panelOpens, 1);
  assert.equal(globalThis.__w5Button.panelOpen, true);
  assert.equal(globalThis.__w5Button.windowToggles, 0);
  await view.unmount();

  view = await mount(React.createElement(LeoChatButton));
  assert.equal(view.host.querySelector("[data-leochat-open]")?.getAttribute("aria-pressed"), "true");
  assert.equal(view.host.querySelector("[data-leochat-open]")?.getAttribute("data-leochat-surface"), "panel");
  await view.click();
  assert.equal(globalThis.__w5Button.panelCloses, 1);
  assert.equal(globalThis.__w5Button.panelOpen, false);
  assert.equal(globalThis.__w5Button.windowToggles, 0);
  await view.unmount();
  removeCanvas();
});

test("没有右侧栏时保持当前页面；整页上的按钮不改变页面", async () => {
  resetState();
  const originalLocation = window.location;
  let assigned = null;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/library", assign: (href) => { assigned = href; } },
  });
  let view = await mount(React.createElement(LeoChatButton));
  await view.click();
  assert.equal(assigned, null);
  assert.equal(globalThis.__w5Button.workspaceOpenRequests, 1);
  await view.unmount();

  assigned = null;
  globalThis.__w5Button.workspaceOpenRequests = 0;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/leochat", assign: (href) => { assigned = href; } },
  });
  view = await mount(React.createElement(LeoChatButton));
  await view.click();
  assert.equal(assigned, null);
  assert.equal(globalThis.__w5Button.workspaceOpenRequests, 0);
  await view.unmount();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

test("首页和任务页的懒加载右栏保留 LeoChat 请求；按钮不再导航；面板入口跟随 IM", () => {
  resetState();
  globalThis.__w5Button.imOn = false;
  assert.match(src("shell/leochat/LeoChatButton.tsx"), /if \(!imOn\) return null/);
  assert.doesNotMatch(src("shell/leochat/LeoChatButton.tsx"), /openLeoChatPage|location\.assign/);
  assert.match(src("shell/TaskWorkspaceShell.tsx"), /WORKSPACE_ACTION_EVENT/);
  assert.match(src("shell/TaskWorkspaceShell.tsx"), /leochat-button:/);
  assert.match(src("shell/TaskWorkspaceShell.tsx"), /leoChatRequestNonce/);
  assert.match(src("shell/AgentChat.tsx"), /<TaskWorkspaceShell/);
  assert.match(src("shell/ResultCanvas.tsx"), /const panels = useMemo\(\(\) => \(\{ bay: bayOn, leochat: imOn \}\)/);
  assert.match(src("shell/ResultCanvas.tsx"), /LEOCHAT_PANEL_REQUEST_EVENT/);
  assert.match(src("shell/ResultCanvas.tsx"), /workspaceOpen !== false/);
  assert.match(src("shell/ResultCanvas.tsx"), /closeRightPane/);
});
