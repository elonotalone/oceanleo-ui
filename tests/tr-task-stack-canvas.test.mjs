// The task stack inside the real ResultCanvas + SplitWorkspace (task rooms wave, TU2). Setup copied from
// sidebar-task-workspace.test.mjs (same stubs); the task stack panel itself is a stub that shows its props.
// The fixture's mount() wraps everything in its own split; the task page's split sits inside it.
import { W4_SIDEBAR_STUBS } from "./helpers/w4-sidebar-stubs.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { React, act, splitUrl, uiStubUrl, jsxRuntimeUrl, reactUrl, mount, SplitWorkspace } from "./e2-right-pane-fixture.mjs";
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
  export function WorkspaceLibrary({ onOpenEntry, onOpenItem, openEntryId, onDetailOpenChange }) {
    if (openEntryId) return jsx("button", {"data-fake-viewer":true,onClick:()=>onDetailOpenChange?.(false),children:"back from preview"});
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
const hydrationStubUrl = dataModule(`
  export function useWorkspaceRuntimeHydration() { return null; }
`);
const sessionStubUrl = dataModule(`
  export function useOptionalWorkspaceSession() { return null; }
`);
const libraryDataStubUrl = dataModule(`
  export function isDurableLibraryItem(item) { return Boolean(item?.artifactId); }
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
  ...W4_SIDEBAR_STUBS,
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
  "./bay/shell/bay-state": dataModule(`export function useBayEnabled(){ return true; } export function attachBayDeepLinks(){ return () => {}; }`),
  "./bay/panel": dataModule(`export function BayPanel(){ return null; }`),
  "./leochat/LeoChatPanel": dataModule(`export function LeoChatPanel(){ return null; }`),
  "../lib/im/client": dataModule(`export function useImEnabled(){ return false; }`),
  "./messages/realtime/hooks": dataModule(`export function useImUnread(){ return null; }`),
  "./bay/shell/bay-icons": dataModule(`export function BayIcon(){ return null; }`),
};
const translatedUI = dataModule(`const tt = key => key === "侧栏任务" ? "Tasks" : key; export function useUI(){ return tt; }`);
const fakeHistory = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function HistoryInlineList({onOpenEntry}) { return React.createElement("button", {
    "data-list-task": true, onClick: () => onOpenEntry({kind:"task",id:"t1",task:{id:"t1",mode:"agent",site_id:"oceanleo",title:"Task one"}})
  }, "Task one"); }
`);
const fakeAgent = dataModule(`
  import React, {useEffect, useState} from ${JSON.stringify(reactUrl)};
  export function AgentChat(props) {
    globalThis.__sidebarAgentProps = props;
    const [draft, setDraft] = useState("");
    useEffect(() => { globalThis.__sidebarMounts++; return () => globalThis.__sidebarUnmounts++; }, []);
    useEffect(() => {
      const receive = event => props.sidebarHost.onOpenAction(event.detail);
      window.addEventListener("test-live-task-action", receive);
      return () => window.removeEventListener("test-live-task-action", receive);
    }, [props.sidebarHost]);
    return React.createElement("div", {"data-live-task": props.taskId || "draft"},
      React.createElement("button", {"data-task-back":true,onClick:props.onBack}, "back to tasks"),
      React.createElement("input", {"data-task-draft":true,defaultValue:draft,onChange:e=>setDraft(e.target.value)}),
      React.createElement("button", {"data-task-file":true,onClick:()=>props.sidebarHost.onOpenAction({nonce:"file",action:{version:1,tab:"mine",itemId:"art_generated"}})}, "file"),
      React.createElement("button", {"data-task-preview":true,onClick:()=>props.sidebarHost.onOpenItem(${JSON.stringify(ITEM)},"preview")}, "preview"),
      React.createElement("button", {"data-task-created":true,onClick:()=>props.onTaskCreated("new-task")}, "created"));
  }
`);
const stackStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function TaskStackPanel(props) {
    globalThis.__stackProps = props;
    const top = props.stack[props.stack.length - 1];
    return React.createElement("div", { "data-stack-stub": props.stack.map(e => e.id).join(",") },
      React.createElement("span", { "data-stack-title": true }, top.title),
      React.createElement("button", { "data-stack-push": true, onClick: () => window.dispatchEvent(new CustomEvent("oceanleo:open-task-child", { detail: { kind: "room", id: "r9", title: "Inner" }, cancelable: true })) }, "card inside"),
      React.createElement("button", { "data-stack-back": true, onClick: props.onBack }, "back"));
  }
`);
const canvasStubs = {...STUBS, "./SplitWorkspace": splitUrl,
  "../i18n/ui/useUI": translatedUI,
  "./workspace-panels/TaskStackPanel": stackStub,
  "./workspace-panels/SettingsWorkspacePanel": dataModule(`export function SettingsWorkspacePanel(){ return null; }`),
};
const { ResultCanvas } = await import(await compileModule("src/shell/ResultCanvas.tsx", canvasStubs));
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
const isVisible = node => {
  if (!node) return false;
  for (let current = node; current; current = current.parentElement) if (current.hidden || current.classList.contains("hidden") || current.getAttribute("aria-hidden") === "true") return false;
  return true;
};
function Page({ request = null }) {
  const [open, setOpen] = React.useState(false);
  const card = () => window.dispatchEvent(new CustomEvent("oceanleo:open-task-child", { detail: { kind: "agent_task", id: "t1", title: "Draft the plan" }, cancelable: true }));
  return React.createElement("div", { "data-room-page": true }, React.createElement(SplitWorkspace, { workspaceInstanceId: "room-page", fillParent: true,
    left: React.createElement("button", { "data-main-card": true, onClick: card }, "card in the task"),
    right: React.createElement(ResultCanvas, { tabs: [], active: "home", showTemplate: false, siteId: "oceanleo", workspaceInstanceId: "room-page", workspaceOpen: open, taskStackRequest: request }),
    library: { open, onOpenChange: setOpen, hideToggle: true } }));
}

test("a card in the main column opens the closed panel on that sub task; a card inside pushes; Back pops, then the cards", async () => {
  const view = await mount(React.createElement(Page));
  const q = selector => view.container.querySelector(selector);
  try {
    await flush();
    assert.equal(q('[data-room-page] [data-workspace-pane="main"]').getAttribute("data-workspace-pane-state"), "closed");
    await act(async () => q("[data-main-card]").click()); await flush();
    assert.equal(q('[data-room-page] [data-workspace-pane="main"]').getAttribute("data-workspace-pane-state"), "open", "the panel is shown");
    assert.equal(q("[data-stack-stub]").getAttribute("data-stack-stub"), "t1");
    assert.ok(isVisible(q('[data-workspace-managed-panel="task"]')));
    assert.equal(q("[data-workspace-view-header]"), null, "the entry carries its own header with Back");
    await act(async () => q("[data-stack-push]").click()); await flush();
    assert.equal(q("[data-stack-stub]").getAttribute("data-stack-stub"), "t1,r9");
    await act(async () => q("[data-main-card]").click()); await flush();
    assert.equal(q("[data-stack-stub]").getAttribute("data-stack-stub"), "t1", "the main column replaces the stack");
    await act(async () => q("[data-stack-back]").click()); await flush();
    assert.equal(q('[data-workspace-view]').getAttribute("data-workspace-view"), "home");
    assert.ok(isVisible(q("[data-workspace-home]")));
  } finally { await view.unmount(); }
});

test("task page: the host request shows the sub task beside its parent task", async () => {
  const view = await mount(React.createElement(Page, { request: { nonce: "page:0", entries: [{ kind: "agent_task", id: "t7", title: "Numbers" }] } }));
  const q = selector => view.container.querySelector(selector);
  try {
    await flush();
    assert.equal(q('[data-room-page] [data-workspace-pane="main"]').getAttribute("data-workspace-pane-state"), "open");
    assert.equal(q("[data-stack-stub]").getAttribute("data-stack-stub"), "t7");
    assert.equal(q("[data-stack-title]").textContent, "Numbers");
    assert.equal(globalThis.__stackProps.host.instanceId, "room-page");
  } finally { await view.unmount(); }
});
