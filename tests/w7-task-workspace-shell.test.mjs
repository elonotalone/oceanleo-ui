import { W4_SIDEBAR_STUBS } from "./helpers/w4-sidebar-stubs.mjs";
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
  export function WorkspaceLibrary({ entries = [], openEntryId, onDetailOpenChange }){
    const entry = entries.find((candidate) => candidate.id === openEntryId) || null;
    if (!entry) return panel("preview");
    return jsx("button", {
      "data-entry-canvas": entry.libraryItem?.id || "",
      "data-entry-url": entry.libraryItem?.url || "",
      onClick: () => onDetailOpenChange?.(false),
    });
  }
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
  ...W4_SIDEBAR_STUBS,
  "./artifact-client": dataModule("export async function prepareArtifactForAction(action,item){ return globalThis.__w4Prepare ? globalThis.__w4Prepare(action,item) : {ok:true,data:item}; }"),
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
  assert.match(src, /const openTaskAttachment = useTaskAttachmentOpener\(/);
  const index = readFileSync(new URL("../src/shell/index.ts", import.meta.url), "utf8");
  assert.match(index, /TaskWorkspaceShell,[\s\S]*?useTaskWorkspaceState,[\s\S]*?attachmentWorkspaceItem/);
});


const commerceContext = (extra = {}) => ({
  surface: "home", ref: { kind: "listing", id: "seller-asset" }, owned: false,
  rights: { canView: true, canEdit: false, canUseInTask: false, canAddToLibrary: false, canDownload: false, canDownloadSource: false },
  commerce: { priceFen: 900, currency: "USD", free: false, purchaseState: "none", listingId: "seller-asset" },
  ...extra,
});
const commerceEntry = (id = "asset") => ({ id, title: "Paid asset", kind: "image", libraryItem: item(id), provenance: { keep: "catalog/revision" } });

test("W4 direct entry keeps the complete entry and commerce context in shared detail/actions and reports", async () => {
  const entry = commerceEntry();
  const actionContext = commerceContext();
  const reports = [];
  const use = () => {};
  const m = await mount(React.createElement(ResultCanvas, { tabs: [], active: "home", openEntry: { nonce: "entry:1", entry, actionContext, mode: "preview" }, onUseWorkspaceEntry: use, onOpenItemChange: value => reports.push(value) }));
  try {
    assert.ok(m.container.querySelector('[data-shared-detail="asset"]'));
    assert.equal(globalThis.__w4Detail.entry, entry);
    assert.equal(globalThis.__w4Detail.actionContext, actionContext);
    assert.equal(globalThis.__w4Actions.actionContext, actionContext);
    assert.equal(globalThis.__w4Actions.onUseInTask, use);
    assert.equal(reports.at(-1).entry, entry);
    assert.equal(reports.at(-1).actionContext, actionContext);
    const next = { entry: commerceEntry("claimed"), actionContext: commerceContext({ owned: true, commerce: { priceFen: 900, currency: "USD", free: false, purchaseState: "settled" } }) };
    await act(async () => globalThis.__w4Actions.onResolved(next));
    assert.equal(globalThis.__w4Detail.entry, next.entry);
    assert.equal(globalThis.__w4Detail.actionContext, next.actionContext);
    await act(async () => m.container.querySelector('[data-shared-back]').click());
    assert.equal(m.container.querySelector('[data-shared-detail]'), null);
    assert.equal(m.container.querySelector('[data-workspace-view]').getAttribute('data-workspace-view'), 'home');
  } finally { await m.unmount(); }
});

test("W4 a denied Edit opens preview, and denied View shows a reason without exposing data", async () => {
  const entry = { ...commerceEntry(), libraryItem: item("editable", { meta: { editable: true } }) };
  const actionContext = commerceContext();
  const el = context => React.createElement(ResultCanvas, { tabs: [], openEntry: { nonce: context.rights.canView ? "denied-edit" : "denied-view", entry, actionContext: context, mode: "edit" } });
  const m = await mount(el(actionContext));
  try {
    assert.ok(m.container.querySelector('[data-shared-detail]'));
    assert.equal(m.container.querySelector('[data-editor]'), null);
    await m.render(el({ ...actionContext, rights: { ...actionContext.rights, canView: false } }));
    assert.equal(m.container.querySelector('[data-workspace-entry-open]').getAttribute('data-workspace-entry-open'), 'error');
    assert.match(m.container.textContent, /没有查看/);
  } finally { await m.unmount(); }
});

test("W4 failed reference open explains missing data, retries, and closes once without replay", async () => {
  const detail = { entry: commerceEntry(), actionContext: commerceContext() };
  let calls = 0;
  globalThis.__w4Resolve = async () => { calls += 1; if (calls === 1) throw Object.assign(new Error('internal-secret-receipt'), { status: 404 }); return detail; };
  const request = { nonce: "ref-retry", ref: { kind: "platform", id: "p1" }, surface: "home", mode: "preview" };
  const el = () => React.createElement(ResultCanvas, { tabs: [], active: "home", openEntry: request });
  const m = await mount(el());
  try {
    assert.match(m.container.textContent, /已下架或不存在/);
    assert.doesNotMatch(m.container.textContent, /internal-secret-receipt/);
    await act(async () => [...m.container.querySelectorAll('button')].find(b=>b.textContent === '重试').click());
    assert.equal(calls, 2);
    assert.equal(globalThis.__w4Detail.entry, detail.entry);
    await act(async () => m.container.querySelector('[data-shared-back]').click());
    await m.render(el());
    assert.equal(m.container.querySelector('[data-shared-detail]'), null);
    assert.equal(calls, 2);
  } finally { await m.unmount(); delete globalThis.__w4Resolve; }
});

test("W4 dismissing a failed request restores the existing view without replay", async () => {
  globalThis.__w4Resolve = async () => { throw Object.assign(new Error(), { status: 403 }); };
  const m = await mount(React.createElement(ResultCanvas, { tabs: [], active: "mine", openEntry: { nonce: "ref-denied", ref: { kind: "platform", id: "p" }, mode: "preview" } }));
  try {
    assert.match(m.container.textContent, /没有查看/);
    await act(async () => [...m.container.querySelectorAll('[data-workspace-entry-open] button')].find(b=>b.textContent === '返回').click());
    assert.equal(m.container.querySelector('[data-workspace-entry-open]'), null);
    assert.equal(m.container.querySelector('[data-workspace-slot-panel="mine"]').hidden, false);
  } finally { await m.unmount(); delete globalThis.__w4Resolve; }
});

test("W4 a later entry cancels an unresolved reference and a stale response cannot replace it", async () => {
  let settle, signal;
  globalThis.__w4Resolve = (_ref, options) => { signal = options.signal; return new Promise(resolve => { settle = resolve; }); };
  const el = openEntry => React.createElement(ResultCanvas, { tabs: [], openEntry });
  const m = await mount(el({ nonce: "slow", ref: { kind: "platform", id: "slow" }, mode: "preview" }));
  try {
    assert.equal(m.container.querySelector('[data-workspace-entry-open]').getAttribute('data-workspace-entry-open'), 'loading');
    const entry = commerceEntry("new");
    await m.render(el({ nonce: "fast", entry, actionContext: commerceContext(), mode: "preview" }));
    assert.equal(signal.aborted, true);
    await act(async () => settle({ entry: commerceEntry("old"), actionContext: commerceContext() }));
    assert.equal(globalThis.__w4Detail.entry, entry);
    assert.equal(m.container.querySelector('[data-workspace-entry-open]'), null);
  } finally { await m.unmount(); delete globalThis.__w4Resolve; }
});

test("W4 switching away from an editor and returning preserves its mounted session", async () => {
  globalThis.__editorMounts = 0;
  const openItem = { nonce: "keep-edit", item: item("working", { meta: { editable: true } }), mode: "edit" };
  const el = active => React.createElement(ResultCanvas, { tabs: [], active, openItem });
  const m = await mount(el("preview"));
  try {
    const editor = m.container.querySelector('[data-editor]');
    await m.render(el("browser"));
    assert.equal(m.container.querySelector('[data-result-canvas-foreground]').hidden, true);
    assert.equal(m.container.querySelector('[data-workspace-slot-panel="browser"]').hidden, false);
    await m.render(el("preview"));
    assert.equal(m.container.querySelector('[data-result-canvas-foreground]').hidden, false);
    assert.equal(m.container.querySelector('[data-editor]'), editor);
    assert.equal(globalThis.__editorMounts, 1);
  } finally { await m.unmount(); }
});

test("W4 StrictMode does not leave an aborted first reference load permanently pending", async () => {
  const requests = [];
  globalThis.__w4Resolve = (_ref, options) => new Promise(resolve=>requests.push({ resolve, signal: options.signal }));
  const m = await mount(React.createElement(React.StrictMode, null, React.createElement(ResultCanvas, { tabs: [], openEntry: { nonce: "strict", ref: { kind: "platform", id: "p" }, mode: "preview" } })));
  try {
    assert.equal(requests.length, 2);
    assert.equal(requests[0].signal.aborted, true);
    await act(async () => requests.at(-1).resolve({ entry: commerceEntry("strict"), actionContext: commerceContext() }));
    assert.ok(m.container.querySelector('[data-shared-detail="strict"]'));
  } finally { await m.unmount(); delete globalThis.__w4Resolve; }
});

test("W4 shell opens exact entries and references, preserving context and clearing older item requests", async () => {
  let state;
  function Host(){ state = useTaskWorkspaceState(); return React.createElement(TaskWorkspaceShell, { state, tabs: [], left: 'home', lazyRight: true }); }
  const m = await mount(React.createElement(Host));
  try {
    const entry = commerceEntry();
    const actionContext = commerceContext();
    await act(async () => state.openWorkspaceEntry(entry, { mode: 'preview', actionContext }));
    assert.equal(state.rightOpen, true);
    assert.equal(globalThis.__canvasProps.openEntry.entry, entry);
    assert.equal(globalThis.__canvasProps.openEntry.actionContext, actionContext);
    assert.equal(globalThis.__canvasProps.openItem, null);
    const ref = { kind: 'artifact', artifactId: 'root', revisionId: 'pinned' };
    await act(async () => state.openWorkspaceAsset(ref, { surface: 'home' }));
    assert.equal(globalThis.__canvasProps.openEntry.ref, ref);
    await act(async () => state.openWorkspaceItem(item('attachment')));
    assert.equal(globalThis.__canvasProps.openEntry, null);
    assert.equal(globalThis.__canvasProps.openItem.item.id, 'attachment');
  } finally { await m.unmount(); }
});


test("W4 explicit entry Edit prepares a writable revision and refreshes the fork's server context", async () => {
  const original = { ...commerceEntry('template'), libraryItem: item('template', { artifactId: 'template-root', revisionId: 'template-r1', meta: { editable: true } }) };
  const writable = item('mine', { artifactId: 'mine-root', revisionId: 'mine-r1', meta: { editable: true } });
  const owned = { ...commerceEntry('mine'), libraryItem: writable };
  const rights = { ...commerceContext().rights, canEdit: true };
  const calls = [];
  globalThis.__w4Prepare = async (action, source) => { calls.push({ action, source }); return { ok: true, data: writable }; };
  globalThis.__w4Resolve = async ref => {
    assert.deepEqual(ref, { kind: 'artifact', artifactId: 'mine-root', revisionId: 'mine-r1' });
    return { entry: owned, actionContext: commerceContext({ owned: true, rights, ref }) };
  };
  const m = await mount(React.createElement(ResultCanvas, { tabs: [], openEntry: { nonce: 'edit-template', entry: original, actionContext: commerceContext({ rights }), mode: 'edit' } }));
  try {
    await act(async () => {
      for (let attempt = 0; attempt < 50 && !calls.length; attempt += 1) await new Promise(resolve => setTimeout(resolve, 5));
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, 'edit');
    assert.equal(calls[0].source, original.libraryItem);
    assert.ok(m.container.querySelector('[data-editor="mine"]'));
  } finally { await m.unmount(); delete globalThis.__w4Prepare; delete globalThis.__w4Resolve; }
});

test("W4 a new legacy item request also cancels an unresolved typed entry", async () => {
  let signal, settle;
  globalThis.__w4Resolve = (_ref, options) => { signal = options.signal; return new Promise(resolve=>{settle=resolve;}); };
  const m = await mount(React.createElement(ResultCanvas, { tabs: [], openEntry: { nonce: 'slow-typed', ref: { kind: 'platform', id: 'slow' }, mode: 'preview' } }));
  try {
    await m.render(React.createElement(ResultCanvas, { tabs: [], openItem: { nonce: 'new-attachment', item: item('attachment'), mode: 'preview' } }));
    assert.equal(signal.aborted, true);
    await act(async () => settle({ entry: commerceEntry('old'), actionContext: commerceContext() }));
    assert.ok(m.container.querySelector('[data-entry-canvas="attachment"]'));
    assert.equal(m.container.querySelector('[data-shared-detail]'), null);
  } finally { await m.unmount(); delete globalThis.__w4Resolve; }
});

test("W4 an initial entry carries full server commerce data from home into a newly mounted task shell", async () => {
  const entry = commerceEntry('carried');
  const actionContext = commerceContext();
  function Host(){
    const state = useTaskWorkspaceState({ initial: { entry: { nonce: 'carried-entry', entry, actionContext, mode: 'preview' } } });
    return React.createElement(TaskWorkspaceShell, { state, tabs: [], left: 'task', canvas: { taskId: 'new-task' } });
  }
  const m = await mount(React.createElement(Host));
  try {
    assert.equal(globalThis.__canvasProps.openEntry.entry, entry);
    assert.equal(globalThis.__canvasProps.openEntry.actionContext, actionContext);
    assert.equal(globalThis.__canvasProps.taskId, 'new-task');
    assert.equal(m.container.querySelector('[data-workspace-pane="main"]').getAttribute('data-workspace-pane-state'), 'open');
  } finally { await m.unmount(); }
});
