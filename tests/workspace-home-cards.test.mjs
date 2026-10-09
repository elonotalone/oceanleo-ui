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
  url: "https://oceanleo.com/workspace",
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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const splitStubUrl = dataModule(`
  export function useRightPaneSlot() { return null; }
  export function useWorkspacePane() { return null; }
`);
const guideStubUrl = dataModule(`
  export function useFunctionGuide() { return null; }
`);
const panelStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function NavigatorGuide() { return null; }
  export function MaterialLibrary() { return jsx("div", { "data-live-panel": "materials" }); }
  export function MyLibrary() { return jsx("div", { "data-live-panel": "mine" }); }
  export function CloudBrowserPanel() { return jsx("div", { "data-live-panel": "browser" }); }
  export function WorkspaceLibrary() { return jsx("div", { "data-live-panel": "preview" }); }
  export function workspaceEntryFromLibraryItem(item) {
    return { id: item.id || "item", title: item.title || "item", libraryItem: item };
  }
  export function AdvancedContentWorkbench() { return null; }
  export function WorkspaceEntryCanvas() { return null; }
`);
const hydrationStubUrl = dataModule(`
  export function useWorkspaceRuntimeHydration() { return null; }
`);
const sessionStubUrl = dataModule(`
  export function useOptionalWorkspaceSession() { return null; }
`);
const libraryDataStubUrl = dataModule(`
  export function libraryItemIdentityKey(item) {
    return item ? String(item.id || "") : "";
  }
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
  export function savedEditorRevisionTransition() { return { ok: true, durableCommit: true }; }
`);
const materialActionsStubUrl = dataModule(`
  const actions = [];
  export function useWorkbenchMaterialActions() {
    return {
      actions,
      perform() {},
      canPerform() { return false; },
      availability: {},
      beginMaterialDrag() {},
      endMaterialDrag() {}
    };
  }
`);
const legacyStubUrl = dataModule(`
  export function adaptLegacyWorkspaceSurfaceTabs() {
    return {
      groups: {
        template: [],
        preview: [],
        materials: [],
        mine: [],
        browser: []
      }
    };
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
    return ["template", "preview", "materials", "mine", "browser"].includes(id)
      ? id
      : fallback(id);
  }
`);
const bayStateStubUrl = dataModule(`
  export function useBayEnabled() {
    return globalThis.__w1BayEnabled !== false;
  }
`);
const bayPanelStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function BayPanel(props) {
    globalThis.__w1BayPanel = props;
    globalThis.__w1SetBayBack = (back) => props.onBackChange?.(back);
    return jsxs("div", {
      "data-bay-stub": true,
      children: [
        jsx("button", {
          type: "button",
          "data-bay-open-chat": true,
          onClick: () => props.onOpenConversation?.("talent:t1")
        })
      ]
    });
  }
`);
const leoChatPanelStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function LeoChatPanel(props) {
    globalThis.__w1ChatPanel = props;
    return jsx("button", {
      type: "button",
      "data-leochat-evict": true,
      onClick: () => props.onEvicted?.()
    });
  }
`);
const imClientStubUrl = dataModule(`
  export function useImEnabled() { return false; }
`);
const imUnreadStubUrl = dataModule(`
  export function useImUnread() { return null; }
`);
const bayIconsStubUrl = dataModule(`
  export function BayIcon() { return null; }
`);

const resultCanvasUrl = await compileModule("src/shell/ResultCanvas.tsx", {
  react: reactUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./SplitWorkspace": splitStubUrl,
  "./guide-context": guideStubUrl,
  "./NavigatorGuide": panelStubUrl,
  "./MaterialLibrary": panelStubUrl,
  "./MyLibrary": panelStubUrl,
  "./CloudBrowserPanel": panelStubUrl,
  "./WorkspaceLibrary": panelStubUrl,
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
  "./bay/shell/bay-state": bayStateStubUrl,
  "./bay/panel": bayPanelStubUrl,
  "./leochat/LeoChatPanel": leoChatPanelStubUrl,
  "../lib/im/client": imClientStubUrl,
  "./messages/realtime/hooks": imUnreadStubUrl,
  "./bay/shell/bay-icons": bayIconsStubUrl,
});
const { ResultCanvas } = await import(resultCanvasUrl);

async function createMounted(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ResultCanvas, props));
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
  assert.ok(target, "expected a clickable node");
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

function cardIds(container) {
  return [...container.querySelectorAll("[data-workspace-card]")].map((node) =>
    node.getAttribute("data-workspace-card"),
  );
}

function viewOf(container) {
  return container.querySelector("[data-workspace-view]")?.getAttribute("data-workspace-view");
}

test("active=home shows visible slot cards then bay and leochat; showTemplate false drops template", async () => {
  globalThis.__w1BayEnabled = true;
  const withTemplate = await createMounted({
    tabs: [],
    active: "home",
    siteId: "oceanleo",
  });
  try {
    const home = withTemplate.container.querySelector("[data-workspace-home]");
    assert.equal(home.getAttribute("data-workspace-home-active"), "true");
    assert.deepEqual(cardIds(withTemplate.container), [
      "template",
      "preview",
      "materials",
      "mine",
      "browser",
      "bay",
      "leochat",
    ]);
  } finally {
    await withTemplate.unmount();
  }
  const withoutTemplate = await createMounted({
    tabs: [],
    active: "home",
    showTemplate: false,
    siteId: "oceanleo",
  });
  try {
    assert.deepEqual(cardIds(withoutTemplate.container), [
      "preview",
      "materials",
      "mine",
      "browser",
      "bay",
      "leochat",
    ]);
  } finally {
    await withoutTemplate.unmount();
  }
});

test("opening a slot card shows that panel and back returns home", async () => {
  const changes = [];
  const mounted = await createMounted({
    tabs: [],
    active: "home",
    siteId: "oceanleo",
    onChange: (id) => changes.push(id),
  });
  try {
    await click(mounted.container.querySelector('[data-workspace-card="materials"]'));
    const panel = mounted.container.querySelector('[data-workspace-slot-panel="materials"]');
    assert.equal(panel.getAttribute("data-workspace-slot-active"), "true");
    const header = mounted.container.querySelector("[data-workspace-frame-header]");
    assert.ok(header);
    assert.ok(header.querySelector("[data-workspace-back]"));
    assert.equal(
      header.querySelector("[data-workspace-view-title]")?.textContent,
      "素材库",
    );
    await click(header.querySelector("[data-workspace-back]"));
    assert.equal(
      mounted.container.querySelector("[data-workspace-home]").getAttribute("data-workspace-home-active"),
      "true",
    );
    assert.ok(changes.includes("home"));
  } finally {
    await mounted.unmount();
  }
});

test("console host without active starts on the template slot and back goes to cards", async () => {
  const mounted = await createMounted({ tabs: [], siteId: "oceanleo" });
  try {
    assert.equal(viewOf(mounted.container), "template");
    const header = mounted.container.querySelector("[data-workspace-frame-header]");
    assert.ok(header);
    assert.ok(header.querySelector("[data-workspace-back]"));
    await click(header.querySelector("[data-workspace-back]"));
    assert.equal(viewOf(mounted.container), "home");
    assert.equal(
      mounted.container.querySelector("[data-workspace-home]").getAttribute("data-workspace-home-active"),
      "true",
    );
  } finally {
    await mounted.unmount();
  }
});

test("useBayEnabled false hides bay and leochat cards", async () => {
  globalThis.__w1BayEnabled = false;
  const mounted = await createMounted({
    tabs: [],
    active: "home",
    siteId: "oceanleo",
  });
  try {
    assert.equal(mounted.container.querySelector('[data-workspace-card="bay"]'), null);
    assert.equal(mounted.container.querySelector('[data-workspace-card="leochat"]'), null);
    assert.ok(mounted.container.querySelector('[data-workspace-card="preview"]'));
  } finally {
    await mounted.unmount();
    globalThis.__w1BayEnabled = true;
  }
});

test("bay workspace action opens the bay panel with the query", async () => {
  globalThis.__w1BayEnabled = true;
  globalThis.__w1BayPanel = null;
  const mounted = await createMounted({
    tabs: [],
    siteId: "oceanleo",
    action: { nonce: "n", action: { version: 1, tab: "bay", query: "PPT 动画" } },
  });
  try {
    const panel = mounted.container.querySelector('[data-workspace-panel="bay"]');
    assert.ok(panel);
    assert.equal(panel.getAttribute("data-workspace-panel-active"), "true");
    assert.equal(globalThis.__w1BayPanel?.request?.query, "PPT 动画");
    assert.equal(globalThis.__w1BayPanel?.active, true);
  } finally {
    await mounted.unmount();
  }
});

test("bay inner back runs first; null inner back then returns home", async () => {
  globalThis.__w1BayEnabled = true;
  globalThis.__w1BayBackCalls = 0;
  const mounted = await createMounted({
    tabs: [],
    siteId: "oceanleo",
    action: { nonce: "n2", action: { version: 1, tab: "bay", query: "x" } },
  });
  try {
    const inner = () => {
      globalThis.__w1BayBackCalls += 1;
    };
    await act(async () => {
      globalThis.__w1SetBayBack(inner);
    });
    await click(mounted.container.querySelector("[data-workspace-back]"));
    assert.equal(globalThis.__w1BayBackCalls, 1);
    assert.equal(viewOf(mounted.container), "bay");
    await act(async () => {
      globalThis.__w1SetBayBack(null);
    });
    await click(mounted.container.querySelector("[data-workspace-back]"));
    assert.equal(viewOf(mounted.container), "home");
  } finally {
    await mounted.unmount();
  }
});

test("bay openConversation opens leochat; onEvicted returns home", async () => {
  globalThis.__w1BayEnabled = true;
  globalThis.__w1ChatPanel = null;
  const mounted = await createMounted({
    tabs: [],
    siteId: "oceanleo",
    action: { nonce: "n3", action: { version: 1, tab: "bay", query: "x" } },
  });
  try {
    await click(mounted.container.querySelector("[data-bay-open-chat]"));
    const chat = mounted.container.querySelector('[data-workspace-panel="leochat"]');
    assert.ok(chat);
    assert.equal(chat.getAttribute("data-workspace-panel-active"), "true");
    assert.equal(globalThis.__w1ChatPanel?.request?.conversationId, "talent:t1");
    await click(mounted.container.querySelector("[data-leochat-evict]"));
    assert.equal(viewOf(mounted.container), "home");
  } finally {
    await mounted.unmount();
  }
});

test("slot panels stay mounted on the home cards", async () => {
  globalThis.__w1BayEnabled = true;
  const mounted = await createMounted({
    tabs: [],
    active: "home",
    siteId: "oceanleo",
  });
  try {
    const panels = mounted.container.querySelectorAll("[data-workspace-slot-panel]");
    assert.equal(panels.length, 5);
    for (const panel of panels) {
      assert.equal(panel.getAttribute("data-workspace-slot-active"), "false");
    }
  } finally {
    await mounted.unmount();
  }
});
