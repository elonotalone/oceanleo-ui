/**
 * W07 · 双核 flag 在 `DeckRoute` 上的接线判据。
 *
 * 跑法（原样带上 package.json `test` 脚本那串 flag，`_COMMON.md` §7b⑫）：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/deck-core-swap.test.mjs
 */

import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
// ── V1-red-4 / A-48：闸必须挂上路由看节点，不能只扫源码 token ─────────────
// jsdom 取自 fabric 依赖树（仓内不许为测试加 jsdom）。canvas 原生绑定在本
// 容器里装不上，先拿空对象把 require 缓存顶掉，建完再还回去。
// 壳本身不在本判据的锁里：桩只负责把 adapter.stage 画出来，iframe 仍是
// DeckHostedRoute 的产品 JSX。

const require = createRequire(import.meta.url);
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

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

const HOST_PAGE = "https://test.dev.oceanleo.com/workspace";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: HOST_PAGE,
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLIFrameElement: window.HTMLIFrameElement,
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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.fetch = async () => {
  throw new Error("DeckHostedRoute 首屏不该发网络请求");
};

const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    return jsxs("div", {
      "data-role": "deck-hosted-shell",
      children: [
        adapter && adapter.stage ? adapter.stage : null,
        adapter && adapter.status
          ? jsx("div", { "data-role": "deck-hosted-status", children: adapter.status })
          : null,
      ],
    });
  }
`);
const routesStubUrl = dataModule(`
  export function editorToolLabel() { return "幻灯片"; }
`);
// DeckRoute 静态拉着整棵旧核。可达性例只走 next + lazy 叶子，旧核
// import 换成空绑定，模块才能加载；叶子 DeckHostedRoute 仍是真组件。
const deckLegacyStubUrl = dataModule(`
  export function DeckContextToolbar() { return null; }
  export function DeckDrawPanel() { return null; }
  export function DeckLinePanel() { return null; }
  export function DeckNotesPanel() { return null; }
  export function DeckSignaturePanel() { return null; }
  export function DeckTablePanel() { return null; }
  export function DeckDesignPanel() { return null; }
  export function DeckEffectsPanel() { return null; }
  export function DeckElementsPanel() { return null; }
  export function DeckLayersPanel() { return null; }
  export function DeckTextPanel() { return null; }
  export function DeckUploadPanel() { return null; }
  export function DeckFontPanel() { return null; }
  export function DeckPresenterView() { return null; }
  export function DeckStage() { return null; }
  export function openDeckPresenterWindow() {
    return { ok: false, reason: "blocked" };
  }
  export function deckRehearsalNoteLine() { return ""; }
  export const DECK_PREVIEW_FIT_ZOOM_PERCENT = 100;
  export function useDeckEditor() {
    return {
      deck: { title: "", slides: [] },
      activeSlide: { id: "" },
      save: async () => null,
      error: "",
      notice: "",
      loading: false,
      dirty: false,
      editRevision: 0,
      canUndo: false,
      canRedo: false,
      undo() {},
      redo() {},
      selectSlide() {},
      patchSlide() {},
      insertImageElement() {},
      importSource: async () => {},
      exportPptx: async () => {},
      downloadJson() {},
      restoreRecovery() {},
      exporting: false,
      ...globalThis.__d1Editor,
    };
  }
  export function buildDeckPptxBlob() { return new Blob(); }
  export function deckPresentationSource() { return {}; }
  export function deckSavedItemForHandoff(item) { return item; }
  export function useUI() { return (key) => key; }
  export function useOfficeArtifactSource(item) {
    return { item, resourceFailed: false, error: "", retry() {}, loading: globalThis.__d1OfficeLoading };
  }
  export function buildDeckCommandSurface() { return {}; }
  export async function downloadConvertedCopy() { return ""; }
  export function importDocFamilyFile() {
    return { ok: false, message: "no" };
  }
  export const DOC_FAMILY_DOWNLOAD_FORMATS = {
    deck: [{ extension: "pptx", label: "PPTX" }],
  };
  export function docFamilyAcceptAttribute() { return "*"; }
  export function usePluginCommandSurface() {}
  export function useWorkbenchMaterialAdapter() {}
  export function advancedSavedItem(item, extra) {
    return Object.assign({}, item, extra);
  }
`);
const deckRouteStubs = {
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../workbench-routes": routesStubUrl,
  "../advanced-session": deckLegacyStubUrl,
  "../doc-editors/DeckContextToolbar": deckLegacyStubUrl,
  "../doc-editors/DeckCreationPanels": deckLegacyStubUrl,
  "../doc-editors/DeckControls": deckLegacyStubUrl,
  "../doc-editors/DeckFontPanel": deckLegacyStubUrl,
  "../doc-editors/DeckPresenterView": deckLegacyStubUrl,
  "../doc-editors/use-deck-presenter": deckLegacyStubUrl,
  "../doc-editors/deck-preview-geometry": deckLegacyStubUrl,
  "../doc-editors/DeckStage": deckLegacyStubUrl,
  "../doc-editors/use-deck-editor": deckLegacyStubUrl,
  "../doc-editors/doc-family-commands": deckLegacyStubUrl,
  "../doc-editors/doc-family-download": deckLegacyStubUrl,
  "../doc-editors/doc-family-formats": deckLegacyStubUrl,
  "../doc-editors/doc-family-import": deckLegacyStubUrl,
  "../../i18n/ui/useUI": deckLegacyStubUrl,
  "../office-editor": deckLegacyStubUrl,
  "../plugin-command": deckLegacyStubUrl,
  "../workbench-material-provider": deckLegacyStubUrl,
};


const reactUrl = pathToFileURL(require.resolve("react")).href;
const modeUrl = dataModule(`
  import { useSyncExternalStore } from ${JSON.stringify(reactUrl)};
  let mode = "normal";
  const listeners = new Set();
  export function setMode(next) { mode = next; for (const fn of listeners) fn(); }
  export function usePluginMode() {
    const current = useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => mode, () => mode);
    return { mode: current, pro: current === "pro", setMode };
  }
`);
const handoffUrl = await compileModule("src/shell/advanced-routes/editor-handoff.ts", {
  "../office-editor/useOfficeArtifactSource": deckLegacyStubUrl,
});
const gateUrl = await compileModule("src/shell/advanced-routes/mode-switch-gate.tsx", {
  "../plugin-chrome/plugin-mode": modeUrl,
  "../../i18n/ui/useUI": deckLegacyStubUrl,
  "./editor-handoff": handoffUrl,
});
const proUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  import { useModeSwitchHandoff, useModeSwitchReady } from ${JSON.stringify(gateUrl)};
  export function DeckHostedRoute() {
    const handoff = useModeSwitchHandoff();
    globalThis.__d1Received = handoff;
    useModeSwitchReady(true);
    return React.createElement("div", { "data-d1-pro": true });
  }
`);
const deckUrl = await compileModule("src/shell/advanced-routes/DeckRoute.tsx", {
  ...deckRouteStubs,
  "../editor-core-flags": dataModule(`export function resolveEditorCore() { return "legacy"; }`),
  "../plugin-chrome/plugin-mode": modeUrl,
  "../doc-editors/deck-pptist-carrier": dataModule(`export function deckDocumentToPptist(value) { return value; }`),
  "./mode-switch-gate": gateUrl,
  "./editor-handoff": handoffUrl,
  "./DeckHostedRoute": proUrl,
});
const { DeckRoute } = await import(deckUrl);
const { setMode } = await import(modeUrl);
const { resetEditorHandoffForTests } = await import(handoffUrl);
const { createRoot } = await import("react-dom/client");
const item = { id: "d1-route", key: "d1-route", title: "用户八页稿", meta: {} };
const realDeck = { title: item.title, slides: Array.from({ length: 8 }, (_, i) => ({ id: `user-${i}` })) };
async function mount({ loading = true, initialPro = false } = {}) {
  resetEditorHandoffForTests();
  globalThis.__d1Received = null;
  globalThis.__d1OfficeLoading = loading;
  globalThis.__d1Editor = { loading, deck: loading ? { slides: [{ id: "placeholder" }] } : realDeck };
  setMode(initialPro ? "pro" : "normal");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  // The first lazy import of the pro route can take many ticks when the test runner is loaded.
  const drainLazyPro = async () => {
    const deadline = Date.now() + 2000;
    while (!globalThis.__d1Received && !globalThis.__d1Editor.loading && !globalThis.__d1OfficeLoading && Date.now() < deadline) {
      await act(async () => new Promise(resolve => setImmediate(resolve)));
    }
  };
  const render = async () => {
    await act(async () => root.render(React.createElement(DeckRoute, { item, onClose() {} })));
    await drainLazyPro();
  };
  await render();
  return {
    container, render,
    async enter() { await act(async () => setMode("pro")); await drainLazyPro(); },
    async loaded() {
      globalThis.__d1Editor = { loading: false, deck: realDeck };
      globalThis.__d1OfficeLoading = false;
      await render();
    },
    async close() { await act(async () => root.unmount()); container.remove(); resetEditorHandoffForTests(); },
  };
}

test("D1 R4: actual DeckRoute waits through both parsing and office loading before handing off the eight-page draft", async () => {
  const view = await mount();
  try {
    await view.enter();
    assert.ok(view.container.querySelector("[data-mode-switch-pending]"));
    assert.equal(globalThis.__d1Received, null);
    globalThis.__d1Editor = { loading: false, deck: realDeck };
    await view.render();
    assert.equal(globalThis.__d1Received, null, "office loading still owns source resolution");
    await view.loaded();
    assert.deepEqual(globalThis.__d1Received.json, realDeck);
    assert.equal(view.container.querySelector("[data-mode-switch-gate]").dataset.modeSwitchShown, "pro");
    assert.equal(view.container.querySelector("[data-mode-switch-pending]"), null);
  } finally { await view.close(); }
});

test("D1 R4: an already loaded DeckRoute follows the original immediate handoff", async () => {
  const view = await mount({ loading: false });
  try {
    await view.enter();
    assert.deepEqual(globalThis.__d1Received.json, realDeck);
    assert.equal(view.container.querySelector("[data-mode-switch-gate]").dataset.modeSwitchShown, "pro");
  } finally { await view.close(); }
});

test("D1 R4: mounting with pro already selected still waits for normal source readiness", async () => {
  const view = await mount({ initialPro: true });
  try {
    assert.equal(globalThis.__d1Received, null);
    assert.ok(view.container.querySelector("[data-mode-switch-pending]"));
    await view.loaded();
    assert.deepEqual(globalThis.__d1Received.json, realDeck);
  } finally { await view.close(); }
});

test("D1 R4: returning to normal cancels the pending capture; a late parse cannot open pro", async () => {
  const view = await mount();
  try {
    await view.enter();
    await act(async () => setMode("normal"));
    await view.loaded();
    assert.equal(globalThis.__d1Received, null);
    await view.enter();
    assert.deepEqual(globalThis.__d1Received.json, realDeck);
  } finally { await view.close(); }
});
