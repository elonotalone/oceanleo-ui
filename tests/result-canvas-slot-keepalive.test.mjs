import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

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

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileTsxUrl(relativePath, replacements) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

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
  import { useEffect, useRef, useState } from ${JSON.stringify(reactUrl)};
  import { jsxs } from ${JSON.stringify(jsxRuntimeUrl)};

  function StatefulPanel({ name }) {
    const instance = useRef(0);
    if (!instance.current) {
      globalThis.__resultCanvasNextInstance += 1;
      instance.current = globalThis.__resultCanvasNextInstance;
    }
    const [state, setState] = useState(0);
    useEffect(() => {
      globalThis.__resultCanvasMounts[name] += 1;
      return () => {
        globalThis.__resultCanvasUnmounts[name] += 1;
      };
    }, [name]);
    return jsxs("div", {
      "data-live-panel": name,
      "data-panel-instance": String(instance.current),
      children: [
        jsxs("span", {
          "data-panel-state": name,
          children: [name, ":", String(state)]
        }),
        jsxs("button", {
          type: "button",
          "data-increment-panel": name,
          onClick: () => setState((value) => value + 1),
          children: ["increment ", name]
        })
      ]
    });
  }

  export function NavigatorGuide() { return null; }
  export function MaterialLibrary() {
    return StatefulPanel({ name: "materials" });
  }
  export function MyLibrary() {
    return StatefulPanel({ name: "mine" });
  }
  export function CloudBrowserPanel() {
    return StatefulPanel({ name: "browser" });
  }
  export function WorkspaceLibrary() {
    return StatefulPanel({ name: "preview" });
  }
  export function workspaceEntryFromLibraryItem(item) {
    return { id: item.id || "item", title: item.title || "item", libraryItem: item };
  }
  export function AdvancedContentWorkbench() { return null; }
  export function WorkspaceEntryCanvas() { return null; }
`);
const workspaceActionsStubUrl = dataModule(`
  export const FIXED_WORKSPACE_SLOTS = [
    "template", "preview", "materials", "mine", "browser"
  ];
  export const WORKSPACE_ACTION_EVENT = "oceanleo:test-workspace-action";
  export function normalizeWorkspaceAction() { return null; }
  export function workspaceSlotForLegacyId(id) {
    return ["template", "preview", "materials", "mine", "browser"].includes(id)
      ? id
      : "preview";
  }
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
const canvasViewStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export const FIXED_WORKSPACE_SLOTS = [
    "template", "preview", "materials", "mine", "browser"
  ];
  export const WORKSPACE_SLOT_LABELS = {
    template: "灵感",
    preview: "生成",
    materials: "素材库",
    mine: "我的库",
    browser: "浏览器"
  };
  export function CanvasEmpty({ title }) {
    return jsx("div", { children: title });
  }
  export function CanvasSubTabs() { return null; }
  export function FixedWorkspaceTabs() { return null; }
  export function createLiveWorkspaceNodeStore() {
    return { node: null, version: 0, listeners: new Set() };
  }
  export function LiveWorkspaceNode({ store }) { return store.node; }
`);

const resultCanvasUrl = await compileTsxUrl("src/shell/ResultCanvas.tsx", {
  react: reactUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./SplitWorkspace": splitStubUrl,
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
  "./result-canvas-view": canvasViewStubUrl,
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
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

test("fixed right-panel slots preserve component instances and live tab state", async () => {
  globalThis.__resultCanvasNextInstance = 0;
  globalThis.__resultCanvasMounts = {
    preview: 0,
    materials: 0,
    mine: 0,
    browser: 0,
  };
  globalThis.__resultCanvasUnmounts = {
    preview: 0,
    materials: 0,
    mine: 0,
    browser: 0,
  };
  const mounted = await createMounted({
    tabs: [],
    showTemplate: false,
    siteId: "oceanleo",
  });
  const panel = (slot) =>
    mounted.container.querySelector(`[data-workspace-slot-panel="${slot}"]`);
  const live = (slot) =>
    mounted.container.querySelector(`[data-live-panel="${slot}"]`);
  const tab = (label) =>
    [...mounted.container.querySelectorAll("nav button")].find(
      (button) => button.textContent === label,
    );

  try {
    assert.deepEqual(globalThis.__resultCanvasMounts, {
      preview: 1,
      materials: 1,
      mine: 1,
      browser: 1,
    });
    const originalNodes = Object.fromEntries(
      ["preview", "materials", "mine", "browser"].map((slot) => [
        slot,
        live(slot),
      ]),
    );
    assert.equal(panel("preview").hidden, false);
    assert.equal(panel("materials").hidden, true);
    assert.equal(panel("materials").getAttribute("aria-hidden"), "true");

    await click(
      mounted.container.querySelector('[data-increment-panel="preview"]'),
    );
    await click(tab("素材库"));
    assert.equal(panel("preview").hidden, true);
    assert.equal(panel("materials").hidden, false);
    await click(
      mounted.container.querySelector('[data-increment-panel="materials"]'),
    );
    await click(tab("我的库"));
    await click(mounted.container.querySelector('[data-increment-panel="mine"]'));
    await click(tab("浏览器"));
    await click(
      mounted.container.querySelector('[data-increment-panel="browser"]'),
    );
    await click(tab("生成"));
    await click(tab("浏览器"));

    for (const slot of ["preview", "materials", "mine", "browser"]) {
      assert.equal(live(slot), originalNodes[slot], `${slot} DOM instance`);
      assert.equal(
        mounted.container.querySelector(`[data-panel-state="${slot}"]`)
          .textContent,
        `${slot}:1`,
        `${slot} state survives slot switches`,
      );
    }
    assert.deepEqual(globalThis.__resultCanvasMounts, {
      preview: 1,
      materials: 1,
      mine: 1,
      browser: 1,
    });
    assert.deepEqual(globalThis.__resultCanvasUnmounts, {
      preview: 0,
      materials: 0,
      mine: 0,
      browser: 0,
    });
  } finally {
    await mounted.unmount();
    delete globalThis.__resultCanvasNextInstance;
    delete globalThis.__resultCanvasMounts;
    delete globalThis.__resultCanvasUnmounts;
  }
});
