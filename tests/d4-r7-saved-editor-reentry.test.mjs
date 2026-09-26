// Real ResultCanvas with real revision transition validation; network/editor leaves are isolated.
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
  url: "https://p-test.dev.oceanleo.com/history/session-1",
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
function revision(revisionId, previousRevisionId = '') {
  return {
    id: 'r7-artifact', key: 'artifact:r7-artifact:' + revisionId,
    artifactId: 'r7-artifact', revisionId, artifactType: 'design',
    kind: 'image', title: 'Saved design', siteId: 'design', source: 'artifact',
    meta: { previous_revision_id: previousRevisionId },
    artifact: { artifactId: 'r7-artifact', revisionId, integrity: { ok: true } },
  };
}
const ITEM = revision('rev-1');
globalThis.__d4SavedEditorProps = null;
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
  export function AdvancedContentWorkbench(props) {
    globalThis.__d4SavedEditorProps = props;
    return jsx("button", {
      "data-fake-editor": props.item.revisionId,
      onClick: props.onClose, children: "close editor"
    });
  }
  export function WorkspaceEntryCanvas({ entry, onClose }) {
    return jsx("button", {
      "data-fake-viewer": entry.libraryItem.revisionId,
      onClick: onClose, children: "return to library"
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
  export function isWorkspaceActionConsumed(_nonce, _consumer) { return false; }
  export function consumeWorkspaceAction() { return true; }
  export function resetWorkspaceActionConsumptionForTests() {}
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
  export { savedEditorRevisionTransition } from "file:///root/projects/oceanleo-ui/src/shell/advanced-session.ts";
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


async function save(item) {
  await act(async () => globalThis.__d4SavedEditorProps.onSavedItem(item));
}
function editButton(container) {
  return [...container.querySelectorAll('button')].find(button => button.textContent.trim() === '编辑');
}
test('verified consecutive saved revisions survive close, preview, and explicit re-edit', async () => {
  const mounted = await mountCanvas();
  const q = selector => mounted.container.querySelector(selector);
  try {
    await click(q('[data-open-item]'));
    await save(revision('rev-2', 'rev-1'));
    await save(revision('rev-3', 'rev-2'));
    assert.equal(q('[data-fake-editor]').getAttribute('data-fake-editor'), 'rev-3');
    await click(q('[data-fake-editor]'));
    assert.equal(q('[data-fake-viewer]')?.getAttribute('data-fake-viewer'), 'rev-3');
    await click(editButton(mounted.container));
    assert.equal(q('[data-fake-editor]')?.getAttribute('data-fake-editor'), 'rev-3');
  } finally { await mounted.unmount(); }
});
test('explicit old revision card stays pinned after leaving saved preview', async () => {
  const mounted = await mountCanvas();
  const q = selector => mounted.container.querySelector(selector);
  try {
    await click(q('[data-open-item]'));
    await save(revision('rev-2', 'rev-1'));
    await click(q('[data-fake-editor]'));
    await click(q('[data-fake-viewer]'));
    await click(q('[data-open-entry]'));
    assert.equal(q('[data-fake-viewer]')?.getAttribute('data-fake-viewer'), 'rev-1');
  } finally { await mounted.unmount(); }
});
test('a rejected revision transition cannot replace the valid saved preview pin', async () => {
  const mounted = await mountCanvas();
  const q = selector => mounted.container.querySelector(selector);
  try {
    await click(q('[data-open-item]'));
    await save(revision('rev-2', 'rev-1'));
    await save(revision('rev-bad', 'other-previous'));
    assert.equal(q('[data-fake-editor]')?.getAttribute('data-fake-editor'), 'rev-2');
    await click(q('[data-fake-editor]'));
    assert.equal(q('[data-fake-viewer]')?.getAttribute('data-fake-viewer'), 'rev-2');
  } finally { await mounted.unmount(); }
});
test('closing without a durable commit still returns to the library', async () => {
  const mounted = await mountCanvas();
  const q = selector => mounted.container.querySelector(selector);
  try {
    await click(q('[data-open-item]'));
    await save(ITEM);
    await click(q('[data-fake-editor]'));
    assert.equal(Boolean(q('[data-fake-viewer]')), false);
    assert.equal(Boolean(q('[data-fake-editor]')), false);
  } finally { await mounted.unmount(); }
});
