import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { React, act, splitUrl, uiStubUrl, jsxRuntimeUrl, reactUrl, shell, mount, useRightPaneSlot, PluginChromeFrame } from "./e2-right-pane-fixture.mjs";
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
  import { useEffect } from ${JSON.stringify(reactUrl)};
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
  export function AdvancedContentWorkbench({ onSavedItem }) {
    useEffect(() => {
      globalThis.__e2EditorMounts += 1;
      return () => { globalThis.__e2EditorUnmounts += 1; };
    }, []);
    return jsxs("div", { "data-fake-editor": true, children: [
      jsx("input", {defaultValue: "unsaved", "data-editor-input": true}),
      jsx("button", {"data-save-invalid": true, onClick: () => onSavedItem({...ITEM, valid: false}), children: "fail"}),
      jsx("button", {"data-save-valid": true, onClick: () => onSavedItem({...ITEM, valid: true}), children: "save"})
    ] });
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
  export function savedEditorRevisionTransition(_source, next) { return { ok: next.valid, durableCommit: next.valid }; }
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
const canvasStubs = {...STUBS, "./SplitWorkspace": splitUrl};
const { ResultCanvas } = await import(await compileModule("src/shell/ResultCanvas.tsx", canvasStubs));
const { AppCapabilityEntryProvider } = await import(await compileModule("src/shell/app-capability-context.tsx", canvasStubs));
const canvas = (active = "preview") => React.createElement(ResultCanvas, {
  key: "canvas", tabs: [], active, showTemplate: false, siteId: "website",
});

test("ResultCanvas 保存错误出现和清除均不重挂编辑器、不丢本地输入", async () => {
  globalThis.__e2EditorMounts = 0;
  globalThis.__e2EditorUnmounts = 0;
  const mounted = await mount(canvas());
  const q = (selector) => mounted.container.querySelector(selector);
  try {
    await act(async () => q('[data-open-item]').click());
    const editor = q('[data-fake-editor]');
    const input = q('[data-editor-input]');
    input.value = "尚未保存的改动";
    for (const action of ['[data-save-invalid]', '[data-save-valid]']) {
      await act(async () => q(action).click());
      assert.equal(Boolean(q('[role="alert"]')), action === '[data-save-invalid]');
      assert.equal(q('[data-fake-editor]'), editor, "错误提示不能改变编辑器 React 树位置");
      assert.equal(q('[data-editor-input]').value, "尚未保存的改动");
      assert.equal(globalThis.__e2EditorMounts, 1);
      assert.equal(globalThis.__e2EditorUnmounts, 0);
    }
  } finally { await mounted.unmount(); }
});

test("真实 ResultCanvas 重新设置底层 FixedWorkspaceTabs 不清掉仍在的外壳", async () => {
  const contents = (active) => React.createElement(React.Fragment, null, canvas(active), shell("A"));
  const mounted = await mount(contents("preview"));
  try {
    await mounted.render(contents("materials"));
    assert.ok(mounted.container.querySelector('[data-pane-header] [data-claim-header="A"]'));
    await mounted.render(canvas("materials"));
    assert.equal(mounted.container.querySelector('[data-claim-header]'), null);
    assert.match(mounted.container.querySelector('[data-workspace-pane="main"] [data-pane-header]').textContent, /素材库/);
  } finally { await mounted.unmount(); }
});


test("关闭最后一个自画顶栏的功能页仍退出右侧全屏", async () => {
  let paneSlot;
  function Probe() { paneSlot = useRightPaneSlot(); return null; }
  const entries = [{id: "test", label: "test", render: () => React.createElement(PluginChromeFrame, {
    pluginId: "design-canvas", title: "画布",
  })}];
  const contents = (family) => React.createElement(AppCapabilityEntryProvider, {
    entries, family, siteKey: "website", appId: "website", onFamilyChange() {},
  }, React.createElement(Probe), canvas());
  const mounted = await mount(contents("test"));
  try {
    await act(async () => paneSlot.setRightMaximized(true));
    assert.equal(mounted.container.querySelector('[data-workspace-split]').dataset.workspaceMaximized, "library");
    await mounted.render(contents(""));
    assert.equal(mounted.container.querySelector('[data-workspace-split]').dataset.workspaceMaximized, undefined);
  } finally { await mounted.unmount(); }
});
