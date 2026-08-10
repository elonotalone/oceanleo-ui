import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useEffect, useState } from "react";

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
  url: "https://travel.oceanleo.com/workspace/trip-planner",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  SVGElement: window.SVGElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
  File: window.File,
  Blob: window.Blob,
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
window.HTMLElement.prototype.scrollTo = function scrollTo() {};

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const uiStubUrl = dataModule(`
  const identity = (value) => value;
  export function useUI() { return identity; }
`);
const iconsStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  function Icon({ name, className }) {
    return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
  }
  export function IconLibrary(props) { return Icon({ name: "library", ...props }); }
  export function IconSparkles(props) { return Icon({ name: "agent", ...props }); }
  export function IconWorkspace(props) { return Icon({ name: "ops", ...props }); }
  export function IconExpand(props) { return Icon({ name: "expand", ...props }); }
  export function IconCompress(props) { return Icon({ name: "compress", ...props }); }
`);
const workspaceActionsStubUrl = dataModule(`
  export const FIXED_WORKSPACE_SLOTS = [
    "template", "preview", "materials", "mine", "browser"
  ];
  export const WORKSPACE_ACTION_EVENT = "oceanleo:test-workspace-action";
  export function normalizeWorkspaceAction() { return null; }
  export function workspaceSlotForLegacyId(id) { return id || "preview"; }
`);
const editBarDockHostStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function EditBarDockHost() {
    return jsx("div", { "data-edit-bar-dock": true });
  }
`);
const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", {
  "./icons": iconsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./workspace-actions": workspaceActionsStubUrl,
  "./EditBarDockHost": editBarDockHostStubUrl,
});

const capabilityEntryUrl = await compileModule(
  "src/shell/app-capability-entry.ts",
);
const capabilityContextUrl = await compileModule(
  "src/shell/app-capability-context.tsx",
  { "./app-capability-entry": capabilityEntryUrl },
);
const capabilityBarUrl = await compileModule(
  "src/shell/AppCapabilityBar.tsx",
  { "../i18n/ui/useUI": uiStubUrl },
);

const guideStubUrl = dataModule(`
  export function useFunctionGuide() { return null; }
`);
const panelStubUrl = dataModule(`
  export function NavigatorGuide() { return null; }
  export function MaterialLibrary() { return null; }
  export function MyLibrary() { return null; }
  export function CloudBrowserPanel() { return null; }
  export function WorkspaceLibrary() { return null; }
  export function workspaceEntryFromLibraryItem(item) {
    return { id: item.id || "item", title: item.title || "item", libraryItem: item };
  }
  export function AdvancedContentWorkbench() { return null; }
  export function WorkspaceEntryCanvas() { return null; }
`);
const slotStateStubUrl = dataModule(`
  export function useWorkspaceSlotState() {
    return {
      selected: "preview",
      visibleSlots: ["preview"],
      templatePageId: "",
      setTemplatePageId() {},
      select() {},
      actionFor() { return null; }
    };
  }
`);
const hydrationStubUrl = dataModule(`
  export function useWorkspaceRuntimeHydration() { return null; }
`);
const sessionStubUrl = dataModule(`
  export function useOptionalWorkspaceSession() {
    return globalThis.__pluginHostingSession;
  }
`);
const libraryDataStubUrl = dataModule(`
  export function libraryItemIdentityKey(item) { return item?.id || ""; }
`);
const artifactStubUrl = dataModule(`
  export function canonicalArtifactContextId(siteId, appId) {
    return "olctx:v1:" + siteId + ":" + appId;
  }
`);
const routeStubUrl = dataModule(`
  export function editorCapabilityFor() { return { available: false }; }
`);
const advancedSessionStubUrl = dataModule(`
  export function advancedRootItemId(item) { return String(item?.id || "item"); }
  export function inlineEditorItemsFromSession() { return []; }
  export function savedEditorRevisionTransition() {
    return { ok: true, durableCommit: true };
  }
`);
const materialActionsStubUrl = dataModule(`
  export function useWorkbenchMaterialActions() {
    return {
      actions: [], perform() {}, canPerform() { return false; },
      availability: {}, beginMaterialDrag() {}, endMaterialDrag() {}
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
    return id || fallback(id);
  }
`);
const resultViewStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export const WORKSPACE_SLOT_LABELS = {
    template: "灵感", preview: "生成", materials: "素材库", mine: "我的库", browser: "云端浏览器"
  };
  export function CanvasEmpty({ title, description, action }) {
    return jsxs("div", {
      "data-canvas-empty": true,
      children: [jsx("strong", { children: title }), jsx("span", { children: description }), action]
    });
  }
  export function CanvasSubTabs() { return null; }
  export function FixedWorkspaceTabs() { return null; }
  export function StandaloneWorkspaceFrame({ children }) { return children; }
  export function createLiveWorkspaceNodeStore() {
    return { node: null, version: 0, listeners: new Set() };
  }
  export function LiveWorkspaceNode({ store }) { return store.node; }
`);

const resultCanvasUrl = await compileModule("src/shell/ResultCanvas.tsx", {
  react: reactUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./SplitWorkspace": splitUrl,
  "./guide-context": guideStubUrl,
  "./NavigatorGuide": panelStubUrl,
  "./MaterialLibrary": panelStubUrl,
  "./MyLibrary": panelStubUrl,
  "./CloudBrowserPanel": panelStubUrl,
  "./WorkspaceLibrary": panelStubUrl,
  "./workspace-actions": workspaceActionsStubUrl,
  "./result-canvas-slot-state": slotStateStubUrl,
  "./app-capability-context": capabilityContextUrl,
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
  "./result-canvas-view": resultViewStubUrl,
});

const { SplitWorkspace } = await import(splitUrl);
const { AppCapabilityEntryProvider } = await import(capabilityContextUrl);
const { AppCapabilityBar } = await import(capabilityBarUrl);
const { ResultCanvas } = await import(resultCanvasUrl);

async function click(target) {
  assert.ok(target, "expected a clickable DOM node");
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

async function waitFor(assertion) {
  let caught;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      caught = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }
  throw caught;
}

async function mount(Component) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Component)));
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function DataAndSaveProbe({ host }) {
  const [receipt, setReceipt] = useState("等待读取");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const appData = await host.appData();
      const state = { note: "模块自己的任意状态", source: appData };
      await host.save(state);
      const loaded = await host.load();
      if (alive) setReceipt(JSON.stringify({ appData, loaded }));
    })();
    return () => {
      alive = false;
    };
  }, [host]);
  return React.createElement(
    "section",
    {
      "data-module-owned-screen": "data-save",
      style: { width: "100%", height: "100%" },
    },
    receipt,
  );
}

function ExplodingModuleView() {
  throw new Error("模块自己的渲染错误");
}

const modules = [
  {
    id: "data-save-probe",
    label: "数据回声",
    placements: [{ site: "travel", app: "trip-planner" }],
    render(host) {
      globalThis.__receivedPluginHost = host;
      globalThis.__pluginRenderCalls += 1;
      return React.createElement(DataAndSaveProbe, { host });
    },
  },
  {
    id: "unfamiliar-shape",
    label: "星云回声",
    placements: [{ site: "travel", app: "trip-planner" }],
    render() {
      return React.createElement(
        "article",
        {
          "data-platform-never-heard-of-this": "nebula-song",
          style: { width: "100%", height: "100%" },
        },
        "一段平台从未登记过的合法 React 节点",
      );
    },
  },
  {
    id: "render-failure",
    label: "故障探针",
    placements: [{ site: "travel", app: "trip-planner" }],
    render() {
      return React.createElement(ExplodingModuleView);
    },
  },
];

function Harness() {
  const [family, setFamily] = useState("");
  return React.createElement(
    AppCapabilityEntryProvider,
    {
      siteKey: "travel",
      appId: "trip-planner",
      entries: modules,
      family,
      onFamilyChange: setFamily,
    },
    React.createElement(SplitWorkspace, {
      left: React.createElement(AppCapabilityBar, {
        entries: modules,
        activeFamily: family,
        onSelect: setFamily,
      }),
      right: React.createElement(ResultCanvas, {
        tabs: [],
        showTemplate: false,
        siteId: "travel",
      }),
      leftLabel: "操作台",
      rightLabel: "结果",
      headerHeight: 0,
    }),
  );
}

test("模块按钮直达右栏，host 读到 app 数据并能原样保存回读", async () => {
  globalThis.__pluginRenderCalls = 0;
  globalThis.__receivedPluginHost = null;
  globalThis.__pluginHostingSession = {
    siteId: "travel",
    appId: "trip-planner",
    taskId: null,
    session: {
      site_id: "travel",
      app_id: "trip-planner",
      snapshot: { route: ["上海", "宁波"], travelers: 0 },
    },
  };
  const mounted = await mount(Harness);
  try {
    await click(
      mounted.container.querySelector('[data-capability-plugin="data-save-probe"]'),
    );
    await waitFor(() => {
      const screen = mounted.container.querySelector(
        '[data-module-owned-screen="data-save"]',
      );
      assert.ok(screen, "模块自己的画面没有出现在右栏");
      assert.match(screen.textContent, /上海/);
      assert.match(screen.textContent, /模块自己的任意状态/);
    });

    assert.ok(globalThis.__pluginRenderCalls > 0, "模块 render(host) 没有被调用");
    assert.deepEqual(
      Object.keys(globalThis.__receivedPluginHost).sort(),
      ["appData", "appId", "exportArtifact", "load", "save", "siteKey"],
    );
    assert.equal(globalThis.__receivedPluginHost.siteKey, "travel");
    assert.equal(globalThis.__receivedPluginHost.appId, "trip-planner");
    const rightPane = mounted.container.querySelector(
      '[data-workspace-pane="main"]',
    );
    const host = mounted.container.querySelector(
      '[data-plugin-module-host="data-save-probe"]',
    );
    assert.ok(rightPane.contains(host), "模块 host 必须属于右栏");
    assert.ok(host.classList.contains("h-full"));
    assert.equal(
      rightPane.querySelector("[data-pane-header]"),
      null,
      "模块打开后应占满右栏，不保留固定槽位标题条",
    );
  } finally {
    await mounted.unmount();
    delete globalThis.__pluginHostingSession;
    delete globalThis.__receivedPluginHost;
    delete globalThis.__pluginRenderCalls;
  }
});

test("平台从未见过的合法 React 节点照样挂载，模块错误也不会带崩工作台", async () => {
  globalThis.__pluginRenderCalls = 0;
  globalThis.__pluginHostingSession = {
    siteId: "travel",
    appId: "trip-planner",
    taskId: null,
    session: {
      site_id: "travel",
      app_id: "trip-planner",
      snapshot: { anything: true },
    },
  };
  const mounted = await mount(Harness);
  const originalConsoleError = console.error;
  try {
    await click(
      mounted.container.querySelector('[data-capability-plugin="unfamiliar-shape"]'),
    );
    const unfamiliar = mounted.container.querySelector(
      '[data-platform-never-heard-of-this="nebula-song"]',
    );
    assert.ok(unfamiliar, "未知内容不应被承载层校验拦截");
    assert.match(unfamiliar.textContent, /从未登记过/);

    console.error = () => {};
    await click(
      mounted.container.querySelector('[data-capability-plugin="render-failure"]'),
    );
    await waitFor(() => {
      assert.match(mounted.container.textContent, /模块自己的渲染错误/);
    });
    assert.ok(
      mounted.container.querySelector('[data-workspace-pane="left"]'),
      "模块报错后工作台仍应存在",
    );
  } finally {
    console.error = originalConsoleError;
    await mounted.unmount();
    delete globalThis.__pluginHostingSession;
    delete globalThis.__pluginRenderCalls;
  }
});
