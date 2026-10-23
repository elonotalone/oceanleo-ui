// 2026-10-22 U4：游戏 Code 页点「编辑」没反应。
// 真实页面行 + 真实页面存储 + 真实 useGamePages，只替掉无关的全局行 / 工具抽屉。
// 旧实现把当前页放在 GamePagesGate 的 useState 里并回报给壳，壳的同步 effect
// 把宿主存储改回 "code"，点「编辑」被吞掉；此测试在旧实现上红。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { readFileSync } from "node:fs";

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
  url: "http://localhost/",
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
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const { createRoot } = await import("react-dom/client");

const headerUrl = await compileModule("src/shell/InlineAdvancedWorkbenchHeader.tsx", {
  "../i18n/ui/useUI": dataModule(
    `export function useUI(){return (v)=>v;}`,
  ),
  "./AdvancedEditorIcon": dataModule(
    `export function AdvancedEditorIcon(){return null;}`,
  ),
  "./advanced-layout-context": dataModule(`
    export const ADVANCED_TOOLS_PANEL_ID = "t";
    export function focusAdvancedToolsTrigger(){}
    export function useAdvancedToolsLauncherRegistration(){}
  `),
  "./plugin-chrome/plugin-mode": dataModule(
    `export function PluginModeAdapterBridge(){return null;}`,
  ),
  // D1（2026-10-23）：页签住进第一行，PluginGlobalRow 收 pages / activePageId / onSelectPage。
  "./plugin-chrome/PluginGlobalRow": dataModule(`
    import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
    export function PluginGlobalRow({ pages = [], activePageId, onSelectPage }) {
      return jsx("div", { children: pages.map((page) => jsx("button", {
        "data-plugin-page": page.id,
        "aria-selected": String(page.id === activePageId),
        onClick: () => onSelectPage(page.id),
        children: page.label,
      }, page.id)) });
    }
  `),
  "../../i18n/ui/useUI": dataModule(`export function useUI(){return (v)=>v;}`),
  "./plugin-theme": dataModule(`export {};`),
});
const pagesUrl = await compileModule("src/shell/game-editor/game-pages.ts");
const { InlineAdvancedWorkbenchHeader } = await import(headerUrl);
const { useGamePages } = await import(pagesUrl);

function Harness() {
  const { activePageId, pages } = useGamePages();
  return React.createElement(
    "div",
    { "data-active": activePageId },
    React.createElement(InlineAdvancedWorkbenchHeader, {
      adapter: { id: "game", label: "游戏", pages },
      autoSaveState: "idle",
      activeDrawerId: "",
      activeLibraryPanelId: null,
      drawers: [],
      accent: "#4f46e5",
      onCloseDrawer() {},
      onOpenDrawer() {},
      onOpenTransientPanel() {},
      onOpenLibrary() {},
      onRetrySave() {},
      onUploadFiles() {},
    }),
  );
}

test("Code -> Edit -> Code -> Edit always lands on the clicked page", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Harness));
  });
  const active = () => container.firstElementChild.getAttribute("data-active");
  const tab = (id) => container.querySelector(`[data-plugin-page="${id}"]`);
  const selected = () =>
    [...container.querySelectorAll("[data-plugin-page]")]
      .filter((el) => el.getAttribute("aria-selected") === "true")
      .map((el) => el.getAttribute("data-plugin-page"));

  assert.equal(active(), "artifact");
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      tab("code").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(active(), "code", `round ${round}: Code click`);
    assert.deepEqual(selected(), ["code"]);
    await act(async () => {
      tab("artifact").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(active(), "artifact", `round ${round}: Edit click must switch back`);
    assert.deepEqual(selected(), ["artifact"]);
  }

  // 离开编辑器：下一件游戏不会直接落在 Code。
  await act(async () => {
    tab("code").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await act(async () => root.unmount());
  const next = document.createElement("div");
  document.body.append(next);
  const root2 = createRoot(next);
  await act(async () => {
    root2.render(React.createElement(Harness));
  });
  assert.equal(next.firstElementChild.getAttribute("data-active"), "artifact");
  await act(async () => root2.unmount());
});

test("GameRoute derives the page from the host store, not local state", () => {
  const route = readFileSync(
    new URL("../src/shell/advanced-routes/GameRoute.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /useGamePages\(\)/);
  assert.doesNotMatch(route, /setActivePageId/);
});
