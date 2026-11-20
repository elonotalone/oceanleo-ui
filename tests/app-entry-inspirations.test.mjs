import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { W4_SIDEBAR_STUBS } from "./helpers/w4-sidebar-stubs.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.CustomEvent = window.CustomEvent;
const require = createRequire(import.meta.url);
const react = JSON.stringify(pathToFileURL(require.resolve("react")).href);
const ui = dataModule('const tt=s=>s==="灵感"?"Inspirations":s; export function useUI(){return tt}');
const panels = dataModule(`
  import React from ${react};
  export function NavigatorGuide(){return null}
  export function MaterialLibrary(){return null}
  export function MyLibrary(){return React.createElement('div',{'data-library':true})}
  export function CloudBrowserPanel(){return null}
  export function WorkspaceLibrary({openEntryId,onOpenEntry}){
    return React.createElement('button',{'data-preview':true,onClick:()=>onOpenEntry({id:'file',title:'File',libraryItem:{id:'file',title:'File'}})},openEntryId?'File preview':'Open file');
  }
  export function workspaceEntryFromLibraryItem(item){return {id:item.id,title:item.title,libraryItem:item}}
  export function AdvancedContentWorkbench(){return null}
  export function DevicesWorkspacePanel(){return React.createElement('div',{'data-devices':true})}
  export function TaskStackPanel(){return React.createElement('div',{'data-task':true})}
`);
const stubs = {
  ...W4_SIDEBAR_STUBS,
  "../i18n/ui/useUI": ui,
  "./icons": dataModule("export function IconLibrary(){return null}"),
  "./guide-context": dataModule("export function useFunctionGuide(){return null}"),
  "./NavigatorGuide": panels,
  "./MaterialLibrary": panels,
  "./MyLibrary": panels,
  "./CloudBrowserPanel": panels,
  "./WorkspaceLibrary": panels,
  "./AdvancedContentWorkbench": panels,
  "./workspace-panels/DevicesWorkspacePanel": panels,
  "./workspace-panels/TaskStackPanel": panels,
  "./workspace-runtime-hydration": dataModule("export function useWorkspaceRuntimeHydration(){return null}"),
  "./workspace-session-context": dataModule("export function useOptionalWorkspaceSession(){return null}"),
  "./workbench-routes": dataModule("export function editorCapabilityFor(){return {available:false}}"),
  "./advanced-session": dataModule("export function advancedRootItemId(item){return item.id} export function inlineEditorItemsFromSession(){return []} export function savedEditorRevisionTransition(){return {ok:true}}"),
  "./workbench-material-provider": dataModule("export function useWorkbenchMaterialActions(){return {actions:[],perform(){},canPerform(){return false},availability:{},beginMaterialDrag(){},endMaterialDrag(){}}}"),
  "./bay/shell/bay-state": dataModule("export function useBayEnabled(){return true}"),
  "./bay/panel": dataModule("export function BayPanel(){return null}"),
  "./leochat/LeoChatPanel": dataModule("export function LeoChatPanel(){return null}"),
  "./leochat/LeoChatButton": dataModule('export const LEOCHAT_PANEL_REQUEST_EVENT="oceanleo:leochat-panel-request";'),
  "../lib/im/client": dataModule("export function useImEnabled(){return globalThis.__appEntryImEnabled === true}"),
  "./messages/realtime/hooks": dataModule("export function useImUnread(){return null}"),
  "./bay/shell/bay-icons": dataModule("export function BayIcon(){return null}"),
  "./inspirations/InspirationPanel": dataModule(`import React from ${react}; export function InspirationPanel({siteKey,appId}){return React.createElement('div',{'data-inspiration-scope':siteKey+'/'+appId})}`),
};
const { ResultCanvas } = await import(await compileModule("src/shell/ResultCanvas.tsx", stubs));
const { SplitWorkspace } = await import(await compileModule("src/shell/SplitWorkspace.tsx", stubs));
const { InspirationProvider } = await import(await compileModule("src/shell/inspirations/inspiration-context.tsx", stubs));

function Page({ scope, active = "home", openItem, openEntry, leoChatRequestNonce }) {
  const [open, setOpen] = React.useState(false);
  return React.createElement(InspirationProvider, { value: scope },
    React.createElement(SplitWorkspace, {
      workspaceInstanceId: "app-entry", fillParent: true,
      left: React.createElement("div", null,
        React.createElement("button", { "data-toggle": true, onClick: () => setOpen(v => !v) }, "Toggle"),
        React.createElement("button", { "data-open-task": true, onClick: () => window.dispatchEvent(new CustomEvent("oceanleo:open-task-panel", { detail: { taskId: "old-task", title: "Old task" } })) }, "Task")),
      right: React.createElement(ResultCanvas, { tabs: [], active, openItem, openEntry, leoChatRequestNonce, workspaceInstanceId: "app-entry", workspaceOpen: open, showTemplate: false }),
      library: { open, onOpenChange: setOpen, hideToggle: true },
    }));
}
async function mount(props, narrow = false) {
  window.matchMedia = () => ({ matches: narrow, addEventListener() {}, removeEventListener() {} });
  window.history.replaceState(null, "", "/workspace/website/landing");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async next => {
    await act(async () => root.render(React.createElement(Page, next)));
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
  };
  await render(props);
  return {
    container, render,
    q: selector => container.querySelector(selector),
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}
async function click(node) { assert.ok(node); await act(async () => node.click()); }
function shown(node) {
  if (!node) return false;
  for (let p = node; p; p = p.parentElement) {
    if (p.hidden || p.classList.contains("hidden") || p.getAttribute("aria-hidden") === "true") return false;
  }
  return true;
}
const A = { siteKey: "website", appId: "landing" };
const B = { siteKey: "website", appId: "portfolio" };
function assertInspirations(m, scope, visible = true) {
  assert.equal(m.q("[data-workspace-view]").getAttribute("data-workspace-view"), "home");
  const panel = m.q(`[data-inspiration-scope="${scope.siteKey}/${scope.appId}"]`);
  assert.ok(panel, "entering an app defaults to Inspirations with its scope");
  assert.equal(shown(panel), visible);
  assert.equal(m.q("[data-workspace-inspirations] h2").textContent, "Inspirations");
}

test("first app load opens desktop Inspirations; Back and same-app rerenders keep cards and slot choices", async () => {
  const m = await mount({ scope: A });
  try {
    assertInspirations(m, A);
    await click(m.q("[data-workspace-inspirations] [data-back-button]"));
    assert.ok(shown(m.q("[data-workspace-home-cards]")));
    await m.render({ scope: { ...A } });
    assert.ok(shown(m.q("[data-workspace-home-cards]")), "same scope does not reset Back");
    await click(m.q('[data-workspace-card="mine"]'));
    assert.ok(shown(m.q("[data-library]")));
    await m.render({ scope: { ...A } });
    assert.ok(shown(m.q("[data-library]")), "same scope does not reset a chosen slot");
    await m.render({ scope: B });
    assertInspirations(m, B);
  } finally { await m.unmount(); }
});

test("entering another app replaces Devices, a task and a file preview", async () => {
  const m = await mount({ scope: A });
  try {
    await click(m.q("[data-workspace-inspirations] [data-back-button]"));
    await click(m.q('[data-workspace-card="devices"]'));
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
    assert.ok(shown(m.q('[data-workspace-managed-panel="devices"]')));
    await m.render({ scope: B });
    assertInspirations(m, B);
    await click(m.q("[data-open-task]"));
    assert.equal(m.q("[data-workspace-view]").getAttribute("data-workspace-view"), "task");
    await m.render({ scope: A });
    assertInspirations(m, A);
    const openItem = { nonce: "old-file", item: { id: "file", title: "File" }, mode: "preview" };
    await m.render({ scope: A, openItem });
    assert.ok(shown(m.q("[data-result-canvas-foreground]")));
    await m.render({ scope: B, openItem });
    assertInspirations(m, B);
    assert.equal(shown(m.q("[data-result-canvas-foreground]")), false);
  } finally { await m.unmount(); }
});

test("desktop app entry reopens a closed pane; phones prepare Inspirations without opening it", async () => {
  for (const narrow of [false, true]) {
    const m = await mount({ scope: A }, narrow);
    try {
      assertInspirations(m, A, !narrow);
      if (!narrow) await click(m.q("[data-toggle]"));
      assert.equal(m.q('[data-workspace-pane="main"]').getAttribute("data-workspace-pane-state"), "closed");
      await m.render({ scope: B });
      assertInspirations(m, B, !narrow);
      if (narrow) { await click(m.q("[data-toggle]")); assertInspirations(m, B); }
    } finally { await m.unmount(); }
  }
});

test("site changes reset the same app id, while a late file response from the previous app cannot replace Inspirations", async () => {
  const m = await mount({ scope: A, active: "mine" });
  let finish;
  globalThis.__w4Resolve = () => new Promise(resolve => { finish = resolve; });
  try {
    assertInspirations(m, A);
    const openEntry = { nonce: "pending-file", ref: { kind: "artifact", artifactId: "old-file" }, mode: "preview" };
    await m.render({ scope: A, active: "mine", openEntry });
    assert.ok(finish, "old app started resolving the requested file");
    const next = { siteKey: "design", appId: A.appId };
    await m.render({ scope: next, active: "mine", openEntry });
    assertInspirations(m, next);
    await act(async () => finish({ entry: { id: "late-file", title: "Late file" }, actionContext: { rights: { canView: true } } }));
    assertInspirations(m, next);
    assert.equal(shown(m.q("[data-result-canvas-foreground]")), false);
  } finally { delete globalThis.__w4Resolve; await m.unmount(); }
});

test("a retained LeoChat request cannot pull a newly entered app away from Inspirations", async () => {
  globalThis.__appEntryImEnabled = true;
  const m = await mount({ scope: A });
  try {
    await m.render({ scope: A, leoChatRequestNonce: "old-chat" });
    assert.equal(m.q("[data-workspace-view]").getAttribute("data-workspace-view"), "leochat");
    await m.render({ scope: B, leoChatRequestNonce: "old-chat" });
    assertInspirations(m, B);
    await m.render({ scope: B, leoChatRequestNonce: "new-chat" });
    assert.equal(m.q("[data-workspace-view]").getAttribute("data-workspace-view"), "leochat");
    await click(m.q("[data-workspace-back]"));
    await click(m.q("[data-workspace-inspirations] [data-back-button]"));
    await m.render({ scope: { ...B }, leoChatRequestNonce: "new-chat" });
    assert.ok(shown(m.q("[data-workspace-home-cards]")), "consumed chat request does not undo Back");
  } finally { delete globalThis.__appEntryImEnabled; await m.unmount(); }
});

test("site workspace home, main home and LeoBay do not force app content or open the pane; re-entry does", async () => {
  const m = await mount({ scope: null });
  try {
    for (const path of ["/workspace/website", "/", "/bay"]) {
      window.history.replaceState(null, "", path);
      await m.render({ scope: null });
      assert.equal(m.q("[data-workspace-inspirations]"), null);
      assert.ok(m.q("[data-workspace-home-cards]"));
      assert.equal(m.q('[data-workspace-pane="main"]').getAttribute("data-workspace-pane-state"), "closed");
    }
    await m.render({ scope: A });
    assertInspirations(m, A);
    await click(m.q("[data-workspace-inspirations] [data-back-button]"));
    await m.render({ scope: null });
    await m.render({ scope: A });
    assertInspirations(m, A);
  } finally { await m.unmount(); }
});
