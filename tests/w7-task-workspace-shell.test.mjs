// ============================================================================
// W7 (2026-10-31): the task right sidebar as one shared shell.
// ----------------------------------------------------------------------------
// - ResultCanvas direct-open: an exact item opens at once (no library list),
//   once per nonce; `edit` falls back to preview without a typed editor; a
//   carried-over item gets its own session provider bound to the task later
//   without remounting the editor.
// - TaskWorkspaceShell: collapsed + plainWhenClosed draws no chrome and (lazy)
//   mounts no canvas; openWorkspaceItem opens the real SplitWorkspace pane and
//   hands the item to the canvas.
// - AgentChat assembles its sidebar through the shell (same props as before);
//   attachments open there.
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.HTMLElement.prototype.scrollTo = function scrollTo() {};
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule("const tt = (v) => v; export function useUI(){ return tt; }\n");

// One shared session context for the provider stub and the hook stub.
const sessionCtxUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export const Ctx = React.createContext(null);
  export function useOptionalWorkspaceSession(){ return React.useContext(Ctx); }
  export function useWorkspaceSession(){ return React.useContext(Ctx); }
`);
const sessionProviderUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  import { Ctx } from ${JSON.stringify(sessionCtxUrl)};
  export function WorkspaceSessionProvider({ children, siteId, appId }) {
    const [taskId, setTaskId] = React.useState(null);
    const value = React.useMemo(() => ({
      siteId, appId, taskId, session: { id: "sess_1" },
      bindTask: async (id) => { (globalThis.__binds ||= []).push(id); setTaskId(id); return { id: "sess_1" }; },
    }), [siteId, appId, taskId]);
    return React.createElement("div", { "data-session-provider": appId },
      React.createElement(Ctx.Provider, { value }, children));
  }
`);
const panelStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  const panel = (name) => jsx("div", { "data-live-panel": name });
  export function NavigatorGuide(){ return panel("template"); }
  export function MaterialLibrary(){ return panel("materials"); }
  export function MyLibrary(){ return panel("mine"); }
  export function CloudBrowserPanel(){ return panel("browser"); }
  export function WorkspaceLibrary(){ return panel("preview"); }
  export function workspaceEntryFromLibraryItem(item, extra = {}){ return { id: item.key, title: item.title, libraryItem: item, ...extra }; }
  export function AdvancedContentWorkbench({ item }){
    React.useEffect(() => { globalThis.__editorMounts = (globalThis.__editorMounts || 0) + 1; }, []);
    return jsx("div", { "data-editor": item.id });
  }
  export function WorkspaceEntryCanvas({ entry, onClose }){
    return jsx("button", { "data-entry-canvas": entry.libraryItem?.id || "", "data-entry-url": entry.libraryItem?.url || "", onClick: onClose });
  }
`);
const OVERRIDES = {
  "../i18n/ui/useUI": uiStub,
  "./SplitWorkspace": dataModule(
    "export function useRightPaneSlot(){ return null; }\nexport function useWorkspacePane(){ return null; }\nexport function SplitWorkspace(){ return null; }\n",
  ),
  "./guide-context": dataModule("export function useFunctionGuide(){ return null; }\n"),
  "./NavigatorGuide": panelStub,
  "./MaterialLibrary": panelStub,
  "./MyLibrary": panelStub,
  "./CloudBrowserPanel": panelStub,
  "./WorkspaceLibrary": panelStub,
  "./AdvancedContentWorkbench": panelStub,
  "./WorkspaceEntryCanvas": panelStub,
  "./workspace-session-context": sessionCtxUrl,
  "./WorkspaceSession": sessionProviderUrl,
  "./workbench-routes": dataModule(
    "export function editorCapabilityFor(item){ return { available: item?.meta?.editable === true }; }\n",
  ),
  "./advanced-session": dataModule(
    "export function advancedRootItemId(item){ return String(item?.id || 'item'); }\n" +
      "export function inlineEditorItemsFromSession(){ return []; }\n" +
      "export function savedEditorRevisionTransition(){ return { ok: true, durableCommit: true }; }\n",
  ),
  "./workbench-material-provider": dataModule(
    "const actions = [];\nexport function useWorkbenchMaterialActions(){ return { actions, perform(){}, canPerform(){ return false; }, availability: {}, beginMaterialDrag(){}, endMaterialDrag(){} }; }\n",
  ),
  "./legacy-workspace-surface-adapter": dataModule(
    "export function adaptLegacyWorkspaceSurfaceTabs(){ return { groups: { template: [], preview: [], materials: [], mine: [], browser: [] } }; }\n" +
      "export function legacyWorkspaceEntry(tab){ return { id: tab.id, title: tab.label || tab.id, libraryItem: tab.libraryItem }; }\n",
  ),
  "./workspace-surface-model": dataModule(
    "export function buildWorkspaceSurfaceModel(tabs){ return { tabs }; }\n" +
      "export function workspaceSurfaceCallerId(_m, id){ return id; }\n" +
      "export function workspaceSurfacePrimaryTab(){ return null; }\n" +
      "export function workspaceSurfaceSlotForId(_m, id, fallback){ return fallback(id); }\n",
  ),
  "./bay/shell/bay-state": dataModule("export function useBayEnabled(){ return false; }\n"),
  "./bay/panel": dataModule("export function BayPanel(){ return null; }\n"),
  "./leochat/LeoChatPanel": dataModule("export function LeoChatPanel(){ return null; }\n"),
  "../lib/im/client": dataModule("export function useImEnabled(){ return false; }\n"),
  "./messages/realtime/hooks": dataModule("export function useImUnread(){ return null; }\n"),
  "./bay/shell/bay-icons": dataModule("export function BayIcon(){ return null; }\n"),
};
const { ResultCanvas } = await import(await compileModule("src/shell/ResultCanvas.tsx", OVERRIDES));
// The shell's bound-editor wrapper, from the same module graph (same session context).
const { renderBoundTaskEditor } = await import(await compileModule("src/shell/TaskWorkspaceShell.tsx", OVERRIDES));

async function mount(element) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    render: (next) => act(async () => root.render(next)),
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}

const item = (id, extra = {}) => ({
  key: `k:${id}`, source: "creation", id, title: `title ${id}`, kind: "image", siteId: "oceanleo",
  url: `blob:https://oceanbizs.com/${id}`, favorite: false, meta: {}, ...extra,
});

test("direct open: preview shows the exact item at once and reports it; same nonce is consumed once", async () => {
  const reports = [];
  const open = { nonce: "n1", item: item("a"), mode: "preview" };
  const el = (openItem) => React.createElement(ResultCanvas, { tabs: [], openItem, onOpenItemChange: (v) => reports.push(v) });
  const m = await mount(el(open));
  const canvas = m.container.querySelector("[data-entry-canvas]");
  assert.equal(canvas?.getAttribute("data-entry-canvas"), "a", "opened without any library list");
  assert.deepEqual(reports.at(-1), { item: open.item, mode: "preview" });
  await act(async () => canvas.click());
  assert.equal(m.container.querySelector("[data-entry-canvas]"), null, "closed");
  assert.equal(reports.at(-1), null);
  await m.render(el({ ...open }));
  assert.equal(m.container.querySelector("[data-entry-canvas]"), null, "the same nonce never reopens");
  await m.render(el({ ...open, nonce: "n2" }));
  assert.equal(m.container.querySelector("[data-entry-canvas]")?.getAttribute("data-entry-canvas"), "a", "a new nonce opens again");
  await m.unmount();
});

test("direct open: edit opens the typed editor, and falls back to preview without one", async () => {
  const m = await mount(React.createElement(ResultCanvas, { tabs: [], openItem: { nonce: "e1", item: item("doc", { meta: { editable: true } }), mode: "edit" } }));
  assert.equal(m.container.querySelector("[data-editor]")?.getAttribute("data-editor"), "doc");
  assert.equal(m.container.querySelector("[data-session-provider]"), null, "no extra provider unless bindTask");
  await m.render(React.createElement(ResultCanvas, { tabs: [], openItem: { nonce: "e2", item: item("plain"), mode: "edit" } }));
  assert.equal(m.container.querySelector("[data-editor]"), null);
  assert.equal(m.container.querySelector("[data-entry-canvas]")?.getAttribute("data-entry-canvas"), "plain");
  await m.unmount();
});

test("direct open + bindTask: the editor session binds to the task once it exists, without a remount", async () => {
  globalThis.__binds = [];
  globalThis.__editorMounts = 0;
  const openItem = { nonce: "c1", item: item("carried", { meta: { editable: true } }), mode: "edit", bindTask: true };
  const el = (taskId) => React.createElement(ResultCanvas, { tabs: [], taskId, siteId: "oceanleo", openItem, renderBoundEditor: renderBoundTaskEditor });
  const m = await mount(el(null));
  assert.equal(m.container.querySelector("[data-session-provider]")?.getAttribute("data-session-provider"), "library");
  assert.ok(m.container.querySelector("[data-session-provider] [data-editor]"));
  assert.deepEqual(globalThis.__binds, [], "no task yet: nothing to bind");
  await m.render(el("task_new"));
  await act(async () => {});
  assert.deepEqual(globalThis.__binds, ["task_new"]);
  assert.equal(globalThis.__editorMounts, 1, "the task arriving never remounts the editor");
  await m.render(el("task_new"));
  assert.deepEqual(globalThis.__binds, ["task_new"], "bound once");
  await m.unmount();
});

// ── TaskWorkspaceShell with the real SplitWorkspace ────────────────────────
const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", {
  "../i18n/ui/useUI": uiStub,
  "./EditBarDockHost": dataModule("export function EditBarDockHost(){ return null; }"),
});
const canvasStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ResultCanvas(props){
    React.useEffect(() => { globalThis.__canvasMounts = (globalThis.__canvasMounts || 0) + 1; }, []);
    globalThis.__canvasProps = props;
    return React.createElement("div", { "data-canvas": props.openItem?.item?.id || "" });
  }
`);
const shellMod = await import(await compileModule("src/shell/TaskWorkspaceShell.tsx", {
  "../i18n/ui/useUI": uiStub,
  "./SplitWorkspace": splitUrl,
  "./ResultCanvas": canvasStub,
  "./workbench-routes": dataModule("export function editorCapabilityFor(item){ return { available: item?.meta?.editable === true }; }\n"),
}));
const { TaskWorkspaceShell, useTaskWorkspaceState, attachmentWorkspaceItem, attachmentOpenMode, TASK_WORKSPACE_PLAIN_CLOSED_CLASS } = shellMod;

test("shell: collapsed home draws no chrome and mounts no canvas; opening an item opens the real pane", async () => {
  globalThis.__canvasMounts = 0;
  const handle = {};
  function Host() {
    const state = useTaskWorkspaceState();
    handle.state = state;
    return React.createElement(TaskWorkspaceShell, {
      state, tabs: [], left: React.createElement("div", { "data-home-column": true }, "home"),
      lazyRight: true, plainWhenClosed: true, fillParent: true, soloMaxWidth: null,
      canvas: { siteId: "oceanleo", taskId: null },
    });
  }
  const m = await mount(React.createElement(Host));
  const root = m.container.querySelector("[data-workspace-split]");
  for (const cls of TASK_WORKSPACE_PLAIN_CLOSED_CLASS.split(" ")) assert.ok(root.classList.contains(cls), `closed: ${cls}`);
  assert.equal(m.container.querySelector('[data-workspace-pane="main"]').getAttribute("data-workspace-pane-state"), "closed");
  assert.equal(globalThis.__canvasMounts, 0, "lazy: no canvas before the first open");
  assert.ok(m.container.querySelector("[data-home-column]"));
  assert.equal(m.container.querySelector("button[title='展开']"), null, "no sidebar toggle on the home");

  const homeColumn = m.container.querySelector("[data-home-column]");
  await act(async () => handle.state.openWorkspaceItem(item("pic"), "preview"));
  assert.equal(m.container.querySelector('[data-workspace-pane="main"]').getAttribute("data-workspace-pane-state"), "open");
  assert.equal(m.container.querySelector("[data-canvas]")?.getAttribute("data-canvas"), "pic");
  assert.equal(globalThis.__canvasProps.openItem.mode, "preview");
  assert.ok(!m.container.querySelector("[data-workspace-split]").classList.contains("h-auto!"), "open: real split chrome");
  assert.equal(m.container.querySelector("[data-home-column]"), homeColumn, "the home column is never remounted");

  await act(async () => handle.state.setRightOpen(false));
  assert.equal(globalThis.__canvasMounts, 1, "closing keeps the canvas mounted (state kept)");
  await m.unmount();
});

test("shell: AgentChat-shaped use passes the canvas through renderRight; an initial item opens the sidebar", async () => {
  function Host({ library }) {
    const state = useTaskWorkspaceState({ initial: { item: { nonce: "i1", item: item("carried"), mode: "preview", bindTask: true } } });
    return React.createElement(TaskWorkspaceShell, {
      state, tabs: [], left: "chat", library, fillParent: true,
      canvas: { taskId: "t1", siteId: "oceanleo", accent: "#0ea5e9" },
      renderRight: (canvas) => React.createElement("section", { "data-boundary": true }, canvas),
    });
  }
  const m = await mount(React.createElement(Host, { library: undefined }));
  assert.equal(m.container.querySelector('[data-workspace-pane="main"]').getAttribute("data-workspace-pane-state"), "open", "an initial item opens the sidebar");
  assert.ok(m.container.querySelector("[data-boundary] [data-canvas='carried']"));
  assert.equal(globalThis.__canvasProps.taskId, "t1");
  assert.equal(globalThis.__canvasProps.openItem.bindTask, true);
  await m.unmount();
});

test("attachment items: typed libraryItem wins; else a local blob preview item; edit only with a typed editor", () => {
  const typed = item("typed", { meta: { editable: true } });
  assert.equal(attachmentWorkspaceItem({ id: "x", libraryItem: typed }), typed);
  assert.equal(attachmentOpenMode(typed), "edit");
  const local = attachmentWorkspaceItem({ id: "u1", name: "a.png", mime: "image/png", url: "https://x.supabase.co/a.png", previewUrl: "blob:https://oceanbizs.com/1" });
  assert.equal(local.kind, "image");
  assert.equal(local.url, "blob:https://oceanbizs.com/1", "the local blob, not the storage URL");
  assert.equal(local.key, "attachment:u1");
  assert.equal(attachmentOpenMode(local), "preview");
  assert.equal(attachmentOpenMode({ ...local, meta: { ...local.meta, editable: true } }), "preview", "a local-only item never opens an editor");
  assert.equal(attachmentWorkspaceItem({ id: "d", name: "report.pdf", url: "https://h/r.pdf" }).kind, "document");
  assert.equal(attachmentWorkspaceItem({ id: "v", mime: "video/mp4", url: "https://h/v" }).kind, "video");
});

test("AgentChat assembles its sidebar through TaskWorkspaceShell and opens uploaded files there", () => {
  const src = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /<SplitWorkspace\b/, "no second inline SplitWorkspace");
  assert.doesNotMatch(src, /<ResultCanvas\b/, "no second inline ResultCanvas");
  assert.match(src, /<TaskWorkspaceShell[\s\S]*?state=\{taskWorkspace\}[\s\S]*?renderRight=[\s\S]*?\bfillParent\b[\s\S]*?soloMaxWidth=\{null\}/);
  assert.match(src, /useTaskWorkspaceState\(\{\s*defaultOpen: hasOrgPanel,\s*defaultTab: hasOrgPanel \? "preview" : "home",\s*initial: initialWorkspace,/);
  assert.match(src, /const openTaskAttachment = useCallback/);
  const index = readFileSync(new URL("../src/shell/index.ts", import.meta.url), "utf8");
  assert.match(index, /TaskWorkspaceShell,[\s\S]*?useTaskWorkspaceState,[\s\S]*?attachmentWorkspaceItem/);
});
