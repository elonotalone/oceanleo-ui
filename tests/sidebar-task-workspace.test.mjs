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
const tasksUrl = await compileModule("src/shell/workspace-panels/MyTasksWorkspacePanel.tsx", {
  "../../i18n/ui/useUI": translatedUI,
  "../HistoryMasterDetail": fakeHistory,
  "../AgentChat": fakeAgent,
});
const canvasStubs = {...STUBS, "./SplitWorkspace": splitUrl,
  "../i18n/ui/useUI": translatedUI,
  "./workspace-panels/MyTasksWorkspacePanel": tasksUrl,
  "./workspace-panels/SettingsWorkspacePanel": dataModule(`export function SettingsWorkspacePanel(){ return null; }`),
};
const { ResultCanvas } = await import(await compileModule("src/shell/ResultCanvas.tsx", canvasStubs));
const canvas = (active = "home") => React.createElement(ResultCanvas, {
  key: "canvas", tabs: [], active, showTemplate: false, siteId: "oceanleo", showMyTasks: true, workspaceInstanceId: "outer-tasks",
});
const { sidebarChatTask } = await import(tasksUrl);
const { useWorkspaceSlotState } = await import(await compileModule("src/shell/result-canvas-slot-state.ts"));
const { WORKSPACE_ACTION_EVENT } = await import("../src/shell/workspace-actions.ts");
const isVisible = node => {
  if (!node) return false;
  for (let current = node; current; current = current.parentElement) if (current.hidden || current.classList.contains("hidden") || current.getAttribute("aria-hidden") === "true") return false;
  return true;
};
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
async function setupTask() {
  globalThis.__sidebarMounts = 0;
  globalThis.__sidebarUnmounts = 0;
  const view = await mount(canvas());
  await flush();
  return view;
}


test("Tasks title and New task above list; new draft is created in place without remount", async () => {
  const view = await setupTask(); const q = selector => view.container.querySelector(selector);
  try {
    assert.equal(q('[data-workspace-card="tasks"]').textContent.includes("Tasks"), true);
    await act(async () => q('[data-workspace-card="tasks"]').click()); await flush();
    assert.match(q('[data-workspace-view-header]').textContent, /Tasks/);
    const create = q('[data-my-tasks-new]'); const row = q('[data-list-task]');
    assert.ok(create.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
    const url = window.location.href;
    await act(async () => create.click()); await flush();
    assert.ok(q('[data-live-task="draft"]'));
    assert.equal(globalThis.__sidebarAgentProps.navigateToSessionOnCreate, false);
    const input = q('[data-task-draft]'); input.value = "unsent draft";
    await act(async () => q('[data-task-created]').click()); await flush();
    assert.equal(q('[data-task-draft]'), input);
    assert.equal(q('[data-task-draft]').value, "unsent draft");
    assert.equal(globalThis.__sidebarAgentProps.taskId, "new-task");
    assert.equal(window.location.href, url);
    assert.equal(globalThis.__sidebarMounts, 1); assert.equal(globalThis.__sidebarUnmounts, 0);
  } finally { await view.unmount(); }
});

test("list → task → standard Library detail → back; stream stays mounted and a covered action applies once", async () => {
  const view = await setupTask(); const q = selector => view.container.querySelector(selector);
  const previousResolve = globalThis.__w4Resolve;
  let resolutions = 0;
  globalThis.__w4Resolve = async ref => {
    resolutions++;
    assert.equal(ref.artifactId, "art_generated");
    return {entry:{id:"library-generated",title:"Generated file",libraryItem:ITEM},actionContext:{surface:"task",rights:{canView:true,canEdit:false}}};
  };
  try {
    await act(async () => q('[data-workspace-card="tasks"]').click()); await flush();
    await act(async () => q('[data-list-task]').click()); await flush();
    const task = q('[data-live-task="t1"]'); const draft = q('[data-task-draft]'); draft.value = "keep this";
    await act(async () => q('[data-task-file]').click()); await flush();
    assert.ok(q('[data-shared-detail="library-generated"]'));
    assert.equal(isVisible(task), false); assert.equal(globalThis.__sidebarUnmounts, 0);
    assert.equal(resolutions, 1);
    await act(async () => window.dispatchEvent(new CustomEvent("test-live-task-action", {detail:{nonce:"covered-once",action:{version:2,tab:"settings",section:"profile"}}}))); await flush();
    assert.equal(q('[data-workspace-view]').getAttribute('data-workspace-view'), "settings");
    assert.equal(q('[data-live-task="t1"]'), task);
    await act(async () => q('[data-workspace-back]').click()); await flush();
    assert.equal(isVisible(task), true); assert.equal(q('[data-task-draft]').value, "keep this");
    assert.equal(q('[data-workspace-view]').getAttribute('data-workspace-view'), "tasks");
    assert.equal(globalThis.__sidebarMounts, 1); assert.equal(globalThis.__sidebarUnmounts, 0);
    await act(async () => q('[data-task-file]').click()); await flush();
    await act(async () => q('[data-shared-back]').click()); await flush();
    assert.equal(isVisible(task), true);
    await act(async () => q('[data-task-preview]').click()); await flush();
    assert.equal(isVisible(task), false);
    await act(async () => q('[data-fake-viewer]').click()); await flush();
    assert.equal(isVisible(task), true);
  } finally { await view.unmount(); globalThis.__w4Resolve = previousResolve; }
});

test("targeted workspace event changes only its owning instance", async () => {
  const state = {};
  function Receiver({id}) {
    const value = useWorkspaceSlotState({instanceId:id,active:"home",showTemplate:false,runtimeHydration:null,slotForId:id=>id,callerIdForSlot:id=>id});
    state[id] = value;
    return React.createElement("div", {"data-receiver":id}, value.layer);
  }
  const view = await mount(React.createElement(React.Fragment,null,React.createElement(Receiver,{id:"outer"}),React.createElement(Receiver,{id:"other"})));
  try {
    await act(async () => window.dispatchEvent(new CustomEvent(WORKSPACE_ACTION_EVENT,{detail:{instanceId:"outer",nonce:"scope",action:{version:2,tab:"settings"}}})));
    assert.equal(state.outer.layer,"settings"); assert.equal(state.other.layer,"home");
  } finally { await view.unmount(); }
});

test("terminal and snapshot workspaces are never rendered as chat", () => {
  assert.equal(sidebarChatTask({kind:"task",task:{id:"shell",mode:"shell"}}),null);
  assert.equal(sidebarChatTask({kind:"session",session:{id:"work",site_id:"image",app_id:"design",task_id:"task-work",snapshot:{page:1}}}),null);
  assert.equal(sidebarChatTask({kind:"session",session:{id:"empty",site_id:"oceanleo",app_id:"home-agent",task_id:null}}),null);
  assert.deepEqual(sidebarChatTask({kind:"session",session:{id:"chat",site_id:"oceanleo",app_id:"home-agent",task_id:"chat-task",snapshot:{}}}),{taskId:"chat-task",siteId:"oceanleo",title:undefined});
});


test("a scoped open event opens only its matching SplitWorkspace pane", async () => {
  const changes=[];
  function Pane({id}) {
    const [open,setOpen]=React.useState(false);
    return React.createElement(SplitWorkspace,{workspaceInstanceId:id,fillParent:true,
      left:React.createElement("div",null,"task"),right:React.createElement("div",null,"workspace"),
      library:{open,onOpenChange:value=>{changes.push([id,value]);setOpen(value);}}});
  }
  const view=await mount(React.createElement(React.Fragment,null,React.createElement(Pane,{id:"owner"}),React.createElement(Pane,{id:"unrelated"})));
  try {
    await act(async()=>window.dispatchEvent(new CustomEvent(WORKSPACE_ACTION_EVENT,{detail:{instanceId:"owner",nonce:"open-one",action:{version:2,tab:"settings"}}})));
    assert.deepEqual(changes,[["owner",true]]);
  } finally {await view.unmount();}
});
