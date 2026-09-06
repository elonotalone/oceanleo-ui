// ============================================================================
// ResultCanvas 前台（编辑器 / 详情预览）一露出来就登记 workbenchOpen（plugin-chrome X4）
// ----------------------------------------------------------------------------
// 工作台 / /history 的右栏是 `ResultCanvas`：库里点开一件素材 → `foregroundContent`
// 盖住五个固定槽位。规范 v2 §5：「共享 store 暴露 workbenchOpen（任一编辑器 / 详情面板
// 可见即 true）」。这里判的是**真实接线**——不是 store 自己会不会翻，而是 ResultCanvas
// 在打开 / 关闭前台时有没有真的去登记与注销。
//
// 桩表与 `result-canvas-slot-keepalive.test.mjs` 同源；差别只有三处：
//   - `./WorkspaceLibrary` 桩暴露两个按钮，分别走 `onOpenEntry`（详情预览）与
//     `onOpenItem`（编辑器）；
//   - `./workbench-routes` 桩判 `available: true`，编辑器才挂得上；
//   - `./AdvancedContentWorkbench` 与 `./WorkspaceEntryCanvas` 桩各渲染一个标记 +
//     「关闭」按钮，好把 `onClose` 那条路也走一遍。
// store 本体不打桩：它是纯 `.ts`，编译台把它挂成 `file://` 真模块，
// 测试直接 import 的与 ResultCanvas 链过去的是同一份实例。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

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
  url: "https://website.oceanleo.com/history/session-1",
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

const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const store = await import("../src/shell/workbench-open-store.ts");

const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
// 两种宿主形态各编一份：
//   - `splitStubUrl`：/history 真实形态——ResultCanvas 住在 SplitWorkspace 右栏里
//     （有 rightSlot，页签条由 SplitWorkspace 标题行承载）。右栏本身的登记归
//     SplitWorkspace，ResultCanvas 只在前台露出时登记。
//   - `standaloneStubUrl`：没有 SplitWorkspace，ResultCanvas 自带标签条
//     （StandaloneWorkspaceFrame）住在右上角 → 一挂上就登记。
const splitStubUrl = dataModule(`
  const slot = {
    setRightLabel() {}, setRightEditorHeader() {}, setRightFrameless() {},
  };
  export function useRightPaneSlot() { return slot; }
  export function useWorkspacePane() { return null; }
`);
const standaloneStubUrl = dataModule(`
  export function useRightPaneSlot() { return null; }
  export function useWorkspacePane() { return null; }
`);
const guideStubUrl = dataModule(`
  export function useFunctionGuide() { return null; }
`);
const ITEM = {
  key: "creation:poster-1",
  source: "creation",
  id: "poster-1",
  title: "季度汇报海报",
  kind: "image",
  siteId: "website",
  url: "https://website.oceanleo.com/assets/poster-1.png",
  favorite: false,
  meta: {},
};
const panelStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  const ITEM = ${JSON.stringify(ITEM)};
  export function NavigatorGuide() { return null; }
  export function MaterialLibrary() { return jsx("div", { "data-live-panel": "materials" }); }
  export function MyLibrary() { return jsx("div", { "data-live-panel": "mine" }); }
  export function CloudBrowserPanel() { return jsx("div", { "data-live-panel": "browser" }); }
  export function WorkspaceLibrary({ onOpenEntry, onOpenItem }) {
    return jsxs("div", {
      "data-live-panel": "preview",
      children: [
        jsx("button", {
          type: "button",
          "data-open-entry": true,
          onClick: () => onOpenEntry({ id: "entry-1", title: ITEM.title, libraryItem: ITEM }),
          children: "open entry (preview)"
        }),
        jsx("button", {
          type: "button",
          "data-open-item": true,
          onClick: () => onOpenItem(ITEM),
          children: "open item (edit)"
        })
      ]
    });
  }
  export function workspaceEntryFromLibraryItem(item) {
    return { id: item.id || "item", title: item.title || "item", libraryItem: item };
  }
  export function AdvancedContentWorkbench({ onClose }) {
    return jsx("button", {
      type: "button",
      "data-fake-editor": true,
      onClick: onClose,
      children: "editor · close"
    });
  }
  export function WorkspaceEntryCanvas({ onClose }) {
    return jsx("button", {
      type: "button",
      "data-fake-viewer": true,
      onClick: onClose,
      children: "viewer · close"
    });
  }
`);
const workspaceActionsStubUrl = dataModule(`
  export const FIXED_WORKSPACE_SLOTS = ["template", "preview", "materials", "mine", "browser"];
  export const WORKSPACE_ACTION_EVENT = "oceanleo:test-workspace-action";
  export function normalizeWorkspaceAction() { return null; }
  export function workspaceSlotForLegacyId(id) {
    return ["template", "preview", "materials", "mine", "browser"].includes(id) ? id : "preview";
  }
`);
const hydrationStubUrl = dataModule(`
  export function useWorkspaceRuntimeHydration() { return null; }
`);
const sessionStubUrl = dataModule(`
  export function useOptionalWorkspaceSession() { return null; }
`);
const libraryDataStubUrl = dataModule(`
  export function libraryItemIdentityKey(item) { return item ? String(item.id || "") : ""; }
`);
const artifactStubUrl = dataModule(`
  export function canonicalArtifactContextId(siteId, appId) { return "olctx:v1:" + siteId + ":" + appId; }
`);
const routeStubUrl = dataModule(`
  export function editorCapabilityFor() { return { available: true }; }
`);
const advancedSessionStubUrl = dataModule(`
  export function advancedRootItemId(item) { return String(item?.id || "item"); }
  export function inlineEditorItemsFromSession() { return []; }
  export function savedEditorRevisionTransition() { return { ok: true, durableCommit: true }; }
`);
const materialActionsStubUrl = dataModule(`
  const actions = [];
  export function useWorkbenchMaterialActions() {
    return {
      actions, perform() {}, canPerform() { return false; }, availability: {},
      beginMaterialDrag() {}, endMaterialDrag() {}
    };
  }
`);
const legacyStubUrl = dataModule(`
  export function adaptLegacyWorkspaceSurfaceTabs() {
    return { groups: { template: [], preview: [], materials: [], mine: [], browser: [] } };
  }
  export function legacyWorkspaceEntry(tab) {
    return { id: tab.id, title: tab.label || tab.id, libraryItem: tab.libraryItem };
  }
`);
const surfaceModelStubUrl = dataModule(`
  export function buildWorkspaceSurfaceModel(tabs) { return { tabs }; }
  export function workspaceSurfaceCallerId(_model, id) { return id; }
  export function workspaceSurfacePrimaryTab() { return null; }
  export function workspaceSurfaceSlotForId(_model, id, fallback) {
    return ["template", "preview", "materials", "mine", "browser"].includes(id) ? id : fallback(id);
  }
`);

// 桩表里**不放** `react`：任何被桩到的 specifier 都会让导入它的文件被就地编译，
// store 也 import react，一旦被编译就成了另一份实例，这里读到的永远是 false。
const STUBS = {
  "../i18n/ui/useUI": uiStubUrl,
  "./guide-context": guideStubUrl,
  "./NavigatorGuide": panelStubUrl,
  "./MaterialLibrary": panelStubUrl,
  "./MyLibrary": panelStubUrl,
  "./CloudBrowserPanel": panelStubUrl,
  "./WorkspaceLibrary": panelStubUrl,
  "./workspace-actions": workspaceActionsStubUrl,
  "./workspace-runtime-hydration": hydrationStubUrl,
  "./workspace-session-context": sessionStubUrl,
  "./library-data": libraryDataStubUrl,
  "./artifact-contract": artifactStubUrl,
  "./AdvancedContentWorkbench": panelStubUrl,
  "./WorkspaceEntryCanvas": panelStubUrl,
  "./workbench-routes": routeStubUrl,
  "./advanced-session": advancedSessionStubUrl,
  "./workbench-material-provider": materialActionsStubUrl,
  "./legacy-workspace-surface-adapter": legacyStubUrl,
  "./workspace-surface-model": surfaceModelStubUrl,
};
const { ResultCanvas } = await import(
  await compileModule("src/shell/ResultCanvas.tsx", {
    ...STUBS,
    "./SplitWorkspace": splitStubUrl,
  })
);
const { ResultCanvas: StandaloneResultCanvas } = await import(
  await compileModule("src/shell/ResultCanvas.tsx", {
    ...STUBS,
    "./SplitWorkspace": standaloneStubUrl,
  })
);

async function mountCanvas(Component = ResultCanvas) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(Component, {
        tabs: [],
        showTemplate: false,
        siteId: "website",
        active: "preview",
      }),
    );
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function click(target) {
  assert.ok(target, "要点的按钮不在 DOM 里");
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

test("库里点开编辑器：前台出现 → workbenchOpen=true；关闭 → false", async () => {
  store.resetWorkbenchOpenForTests();
  const mounted = await mountCanvas();
  const q = (selector) => mounted.container.querySelector(selector);
  try {
    assert.equal(store.workbenchOpenSnapshot(), false, "前提：只看库，没有前台");
    assert.equal(q("[data-result-canvas-foreground]"), null);

    await click(q("[data-open-item]"));
    assert.ok(q("[data-result-canvas-foreground]"), "编辑器前台已盖上");
    assert.ok(q("[data-fake-editor]"));
    assert.equal(store.workbenchOpenSnapshot(), true, "编辑器开着必须登记");

    await click(q("[data-fake-editor]"));
    assert.equal(q("[data-result-canvas-foreground]"), null, "关闭后前台撤掉");
    assert.equal(store.workbenchOpenSnapshot(), false, "关闭后必须注销");
  } finally {
    await mounted.unmount();
    store.resetWorkbenchOpenForTests();
  }
});

test("库里点开详情预览（非编辑器）同样算「打开」", async () => {
  store.resetWorkbenchOpenForTests();
  const mounted = await mountCanvas();
  const q = (selector) => mounted.container.querySelector(selector);
  try {
    await click(q("[data-open-entry]"));
    assert.ok(q("[data-fake-viewer]"), "详情预览前台已盖上");
    assert.equal(store.workbenchOpenSnapshot(), true, "详情面板可见也要登记");

    await click(q("[data-fake-viewer]"));
    assert.equal(store.workbenchOpenSnapshot(), false);
  } finally {
    await mounted.unmount();
    store.resetWorkbenchOpenForTests();
  }
});

test("前台开着时整棵 ResultCanvas 卸载也要注销（离开 /history 页不留脏登记）", async () => {
  store.resetWorkbenchOpenForTests();
  const mounted = await mountCanvas();
  await click(mounted.container.querySelector("[data-open-item]"));
  assert.equal(store.workbenchOpenSnapshot(), true);
  await mounted.unmount();
  assert.equal(
    store.workbenchOpenSnapshot(),
    false,
    "卸载不注销，下一页的模型组合选择框就永远不回来",
  );
  store.resetWorkbenchOpenForTests();
});

test("没有 SplitWorkspace 时（自带标签条）一挂上就登记，卸载即注销", async () => {
  store.resetWorkbenchOpenForTests();
  const mounted = await mountCanvas(StandaloneResultCanvas);
  try {
    assert.equal(
      store.workbenchOpenSnapshot(),
      true,
      "自带标签条正好住在右上角，与「模型组合」同一个角 → 面板可见即登记",
    );
  } finally {
    await mounted.unmount();
  }
  assert.equal(store.workbenchOpenSnapshot(), false);
  store.resetWorkbenchOpenForTests();
});
