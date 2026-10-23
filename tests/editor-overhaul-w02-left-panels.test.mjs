// 2026-10-23 editor overhaul W02 — left panels in every host, edit-bar drawer
// buttons (D3), save-first "My library" switch (D2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://dev.example.test/library?item=a-1" });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "CustomEvent", "localStorage", "MutationObserver"]) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === "window" ? dom.window : dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const ui = dataModule(`export function useUI(){ return (value, vars) => vars ? String(value).replace(/\\{(\\w+)\\}/g, (_, k) => vars[k]) : value; }`);
const icon = dataModule(`export function AdvancedEditorIcon(){return null;}`);
const button = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function Button({ variant, block, align, pill, selected, ...rest }) {
    return React.createElement("button", { type: "button", "data-selected": selected ? "true" : undefined, ...rest });
  }
`);

const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", {
  "../i18n/ui/useUI": ui,
  "./icons": dataModule(`export function IconLibrary(){return null;}`),
  "./AdvancedEditorIcon": icon,
  "./EditBarDockHost": dataModule(`export function EditBarDockHost(){return null;}`),
});
const { SplitWorkspace, useWorkspacePane } = await import(splitUrl);
const helpers = await import(await compileModule("src/shell/inline-advanced-shell-helpers.ts"));
const { useInlineAdvancedPanels } = await import(await compileModule("src/shell/use-inline-advanced-panels.tsx", {
  "../i18n/ui/useUI": ui,
  "../ui/Button": button,
  "./AdvancedEditorIcon": icon,
  "./InlineEditorMaterialPanel": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function InlineEditorMaterialPanel(){return React.createElement('div',{'data-materials-panel':true},'Assets');}
  `),
  "./plugin-chrome/PluginAgentPanel": dataModule(`export function PluginAgentPanel(){return null;}`),
  "./plugin-theme": dataModule(`export function PluginThemeScope({children}){return children;}`),
  "./agent-conversation-layout": dataModule(`export const AGENT_CONVERSATION_HOST_STRETCH_CLASS='';`),
  "./SplitWorkspace": splitUrl,
}));
const minePanelUrl = await compileModule("src/shell/inline-editor-mine-panel.tsx", {
  "../i18n/ui/useUI": ui,
  "../ui/Button": button,
  "./artifact-client": dataModule(`export async function listMyArtifacts(){ return { ok: true, data: { items: globalThis.__mineItems || [] } }; }`),
});
const { useInlineLibraryPanels, editBarDrawersAlwaysVisible, editBarShowsDrawers } = await import(await compileModule("src/shell/use-inline-library-panels.tsx", {
  "./inline-editor-mine-panel": minePanelUrl,
}));
const { EditBarDocumentSegment } = await import(await compileModule("src/shell/plugin-chrome/EditBarDocumentSegment.tsx", {
  "../../i18n/ui/useUI": ui,
  "../../ui/Button": button,
  "../AdvancedEditorIcon": icon,
}));
const { SelectionPresenceProbe, FallbackDetailAside } = await import(await compileModule("src/shell/inline-advanced-shell-parts.tsx", {
  "../i18n/ui/useUI": ui,
  "./plugin-chrome/PluginChromeNotices": dataModule(`export function PluginChromeNotices(){return null;}`),
  "./agent-conversation-layout": dataModule(`export const AGENT_CONVERSATION_HOST_STRETCH_CLASS='';`),
}));
const activateUrl = await compileModule("src/shell/inline-editor-mine-activate.ts");
const { InlineEditorSwitchContext } = await import(activateUrl);
const { useInlineWorkbenchLeave } = await import(await compileModule("src/shell/use-inline-workbench-leave.ts", {
  "./advanced-background-saver": dataModule(`
    export function leaveAdvancedWorkbench(i){ i.closeDetail(); i.onClose(); }
    export function shouldWarnBeforeUnload(){ return false; }
  `),
  "./inline-editor-mine-activate": activateUrl,
}));
const { createRoot } = await import("react-dom/client");

async function mount(element) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, async destroy() { await act(async () => root.unmount()); container.remove(); } };
}
const click = async (node) => { assert.ok(node, "target exists"); await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true }))); };
const item = { id: "a-1", artifactId: "a-1", title: "Draft", kind: "document", meta: {} };

test("a host-hidden left pane opens for a requested panel and collapses again (root cause of /library?item=)", async () => {
  let pane;
  function Probe() { pane = useWorkspacePane(); return null; }
  const m = await mount(React.createElement(SplitWorkspace, {
    left: React.createElement("div", { "data-chat": true }, "chat"),
    right: React.createElement(Probe), leftHidden: true, onAgentFocus() {}, library: { open: true }, fillParent: true,
  }));
  try {
    const left = m.container.querySelector('[data-workspace-pane="left"]');
    assert.equal(left.dataset.workspacePaneState, "closed");
    assert.equal(pane.leftHidden, true, "controller tells editors the left pane is host-hidden");
    await act(async () => pane.showDetail({ ownerId: "o", id: "materials", label: "素材", content: React.createElement("div", { "data-assets": true }, "assets") }));
    assert.equal(left.dataset.workspacePaneState, "open", "a requested panel is never parked in the collapsed pane");
    assert.equal(left.hasAttribute("inert"), false);
    assert.equal(left.getAttribute("aria-hidden"), null);
    assert.notEqual(left.style.flexBasis, "0%");
    assert.ok(left.querySelector("[data-assets]"));
    assert.equal(left.querySelector('[aria-label="收起面板"]')?.textContent, "×", "no console behind it: the header button closes");
    await click(left.querySelector('[aria-label="收起面板"]'));
    assert.equal(left.dataset.workspacePaneState, "closed");
    assert.equal(left.hasAttribute("inert"), true);
  } finally { await m.destroy(); }
});

function PanelsHarness({ leftHidden, onReady }) {
  const pane = useWorkspacePane();
  const ownerId = "w02-owner";
  const panels = useInlineAdvancedPanels({
    adapter: { id: "deck", label: "Deck", drawers: [
      { id: "deck-design", label: "模板", icon: "templates", content: React.createElement("div", { "data-deck-design": true }) },
      { id: "deck-fonts", label: "字体", icon: "font", content: null, hiddenFromRail: true },
      { id: "deck-draw", label: "画笔", icon: "draw", content: null, hiddenFromRail: true },
    ] },
    item, siteId: "oceanleo", accent: "#123456", ownerId, pluginThemeId: null, workbenchMaterials: null,
    showWorkspaceDetail: pane?.showDetail, clearWorkspaceDetail: pane?.clearDetail,
    workspaceLeftHidden: leftHidden,
    ownedWorkspaceDetailId: pane?.detail?.ownerId === ownerId ? pane.detail.id : null,
  });
  const library = useInlineLibraryPanels({
    panels, item, siteId: "oceanleo", mineLabel: "我的库",
    activateMineItem: async () => ({ ok: true }),
  });
  onReady({ panels, library, pane });
  return React.createElement("div", { "data-fallback": panels.fallbackDetail ? "open" : "closed" }, panels.fallbackDetail?.content);
}

test("library buttons toggle, stay exclusive, and use the shell aside when the left pane is host-hidden", async () => {
  let api;
  const m = await mount(React.createElement(SplitWorkspace, {
    left: "chat", right: React.createElement(PanelsHarness, { leftHidden: true, onReady: (v) => { api = v; } }),
    leftHidden: true, onAgentFocus() {}, library: { open: true }, fillParent: true,
  }));
  try {
    await act(async () => api.library.openLibraryPanel("materials"));
    assert.equal(api.library.activeLibraryPanelId, "materials");
    assert.equal(api.pane.detail, null, "hidden host pane is not used");
    assert.equal(m.container.querySelector("[data-fallback]").dataset.fallback, "open");
    assert.ok(m.container.querySelector("[data-materials-panel]"));
    await act(async () => api.library.openLibraryPanel("mine"));
    assert.equal(api.library.activeLibraryPanelId, "mine", "opening the other panel replaces the first");
    assert.ok(m.container.querySelector("[data-inline-editor-mine-panel]"));
    assert.equal(m.container.querySelector("[data-materials-panel]"), null);
    await act(async () => api.library.openLibraryPanel("mine"));
    assert.equal(api.library.activeLibraryPanelId, null, "second click closes");
    assert.equal(m.container.querySelector("[data-fallback]").dataset.fallback, "closed");
  } finally { await m.destroy(); }
});

test("with a visible left pane panels go there and an external close never leaves a stale pressed button", async () => {
  let api;
  const m = await mount(React.createElement(SplitWorkspace, {
    left: "chat", right: React.createElement(PanelsHarness, { leftHidden: false, onReady: (v) => { api = v; } }),
    onAgentFocus() {}, library: { open: true }, fillParent: true,
  }));
  try {
    await act(async () => api.library.openLibraryPanel("materials"));
    const left = m.container.querySelector('[data-workspace-pane="left"]');
    assert.equal(left.dataset.leftPanel, "tool-detail");
    assert.ok(left.querySelector("[data-materials-panel]"));
    assert.equal(api.library.activeLibraryPanelId, "materials");
    await click(left.querySelector('[aria-label="返回操作台"]'));
    assert.equal(api.library.activeLibraryPanelId, null, "workspace closed it; the button is no longer pressed");
    await act(async () => api.library.openLibraryPanel("materials"));
    assert.equal(api.library.activeLibraryPanelId, "materials", "next click opens again (not a dead toggle)");
  } finally { await m.destroy(); }
});

test("D3 drawer list: AI excluded, deck/image use the ruled subsets, toolbox editors get their toolbox", () => {
  const d = (id) => ({ id, label: id, icon: "add", content: null });
  const deck = ["deck-design", "deck-elements", "deck-draw", "deck-text", "deck-lines", "deck-notes", "deck-fonts", "agent"].map(d);
  assert.deepEqual(helpers.resolveEditBarDrawers("deck", deck).map((x) => x.id), ["deck-design", "deck-elements", "deck-draw", "deck-lines", "deck-notes"]);
  // W09-to-W02: text/signature/tables/layers/canvas have no other entry once EditorToolsTrigger is gone; export stays in the download menu.
  const image = ["image-text", "image-brush", "image-shapes", "image-lines", "image-notes", "image-signature", "image-tables", "image-layers", "image-canvas", "image-export", "agent"].map(d);
  assert.deepEqual(helpers.resolveEditBarDrawers("image", image).map((x) => x.id), ["image-text", "image-brush", "image-shapes", "image-lines", "image-notes", "image-signature", "image-tables", "image-layers", "image-canvas"]);
  const doc = ["editor-global", "richdoc-review", "agent"].map(d);
  assert.deepEqual(helpers.resolveEditBarDrawers("rich-doc", doc).map((x) => x.id), ["editor-global", "richdoc-review"]);
  const pdf = helpers.resolveInlineAdvancedDrawers({ id: "pdf", toolbox: { label: "页面", icon: "pages", content: "x" } });
  assert.deepEqual(helpers.resolveEditBarDrawers("pdf", pdf).map((x) => x.label), ["页面"]);
});

test("edit bar shows labeled drawer buttons with a pressed state and toggles them", async () => {
  const toggled = [];
  const m = await mount(React.createElement(EditBarDocumentSegment, {
    actions: [], onTrigger() {},
    drawers: [{ id: "deck-design", label: "模板", icon: "templates" }, { id: "deck-draw", label: "画笔", icon: "draw" }],
    activeDrawerId: "deck-draw", onToggleDrawer: (id) => toggled.push(id),
  }));
  try {
    const buttons = [...m.container.querySelectorAll("[data-edit-bar-drawer]")];
    assert.deepEqual(buttons.map((b) => b.textContent), ["模板", "画笔"]);
    assert.equal(buttons[0].style.paddingInline, "6px", "compact inline padding leaves space for the page rail without changing control height");
    assert.equal(buttons[0].getAttribute("aria-pressed"), "false");
    assert.equal(buttons[1].getAttribute("aria-pressed"), "true");
    await click(buttons[0]);
    await click(buttons[1]);
    assert.deepEqual(toggled, ["deck-design", "deck-draw"]);
    assert.equal(m.container.querySelector('[data-edit-bar-drawer="agent"]'), null);
  } finally { await m.destroy(); }
});

test("selection probe reports whether the editor's selection toolbar rendered any control", async () => {
  const seen = [];
  function Host({ selected }) {
    return React.createElement(SelectionPresenceProbe, { onChange: (v) => seen.push(v) },
      React.createElement("div", { "data-wrapper": true }, selected ? React.createElement("button", null, "B") : null));
  }
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(Host, { selected: false })));
    assert.equal(seen.at(-1), false, "wrapper without controls = nothing selected");
    await act(async () => root.render(React.createElement(Host, { selected: true })));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    assert.equal(seen.at(-1), true);
    await act(async () => root.render(React.createElement(Host, { selected: false })));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    assert.equal(seen.at(-1), false, "deselecting brings the drawer buttons back");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

test("selection probe reports the selection kind so the collapsed edit-bar dot keeps its object icon", async () => {
  const kinds = [];
  function Host({ kind }) {
    return React.createElement(SelectionPresenceProbe, { onChange() {}, onKindChange: (k) => kinds.push(k) },
      React.createElement("div", { "data-selection-kind": kind || "none" }, kind ? React.createElement("button", null, "B") : null));
  }
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));
  try {
    await act(async () => root.render(React.createElement(Host, { kind: null })));
    assert.equal(kinds.at(-1), null, "no selection = no kind");
    await act(async () => root.render(React.createElement(Host, { kind: "image" }))); await settle();
    assert.equal(kinds.at(-1), "image");
    await act(async () => root.render(React.createElement(Host, { kind: "text" }))); await settle();
    assert.equal(kinds.at(-1), "text", "kind attribute changes are observed");
  } finally { await act(async () => root.unmount()); container.remove(); }
  const shell = readFileSync(new URL("../src/shell/InlineAdvancedWorkbenchShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /collapsedIcon=\{[\s\S]{0,120}editorToolsIconForSelection\(selectionKind\)/);
});

test("the shell's own left panel is visible and tells the floating edit bar to stay off it", async () => {
  const open = await mount(React.createElement(FallbackDetailAside, {
    fallbackDetail: { label: "素材库", content: React.createElement("div", { "data-assets": true }) }, onClose() {},
  }));
  try {
    const aside = open.container.querySelector("aside");
    assert.equal(aside.hasAttribute("inert"), false);
    assert.equal(aside.style.width, "320px");
    assert.equal(aside.getAttribute("data-edit-bar-avoid"), "", "W03 avoid contract: the bar is moved out of this rect");
  } finally { await open.destroy(); }
  const closed = await mount(React.createElement(FallbackDetailAside, { fallbackDetail: null, onClose() {} }));
  try {
    const aside = closed.container.querySelector("aside");
    assert.equal(aside.hasAttribute("inert"), true);
    assert.equal(aside.hasAttribute("data-edit-bar-avoid"), false, "a closed panel does not push the bar away");
  } finally { await closed.destroy(); }
});

function LeaveHarness({ dirty, flushResult, onReady }) {
  const leave = useInlineWorkbenchLeave({
    item, onClose() {}, closeDetail() {},
    autoSave: { flushLatest: async () => flushResult, handOffToBackground() {} },
    autoSaveEnabled: true, editorUnconfirmed: dirty,
  });
  onReady(leave);
  return null;
}

test("My library switch saves first; a failed save keeps the current file and says why", async () => {
  const switched = [];
  let leave;
  const render = (props) => React.createElement(InlineEditorSwitchContext.Provider, { value: (next) => switched.push(next.id) },
    React.createElement(LeaveHarness, { ...props, onReady: (v) => { leave = v; } }));
  const m = await mount(render({ dirty: true, flushResult: { ok: false, error: "network", errorMessage: "网络断开，保存失败" } }));
  try {
    let result;
    await act(async () => { result = await leave.activateMineItem({ ...item, id: "b-2", artifactId: "b-2" }); });
    assert.deepEqual(result, { ok: false, error: "网络断开，保存失败" });
    assert.deepEqual(switched, [], "stays on the current file when the save fails");
    await m.destroy();
    const ok = await mount(render({ dirty: true, flushResult: { ok: true } }));
    await act(async () => { result = await leave.activateMineItem({ ...item, id: "b-2", artifactId: "b-2" }); });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(switched, ["b-2"], "switches in place after the save is confirmed");
    await ok.destroy();
  } finally { /* destroyed above */ }
});

test("mine panel highlights the current file and shows the reason when the switch is refused", async () => {
  globalThis.__mineItems = [item, { ...item, id: "b-2", artifactId: "b-2", title: "Other" }];
  const { InlineEditorMinePanel } = await import(minePanelUrl);
  const m = await mount(React.createElement(InlineEditorMinePanel, {
    currentItem: item, onActivateItem: async () => ({ ok: false, error: "网络断开，保存失败" }),
  }));
  try {
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    for (let i = 0; i < 20 && !m.container.querySelector("[data-inline-editor-mine-item]"); i++) await act(async () => new Promise((r) => setTimeout(r, 10)));
    const rows = [...m.container.querySelectorAll("[data-inline-editor-mine-item]")];
    assert.ok(rows.length, m.container.textContent);
    assert.equal(rows[0].getAttribute("aria-current"), "true");
    await click(rows[1]);
    for (let i = 0; i < 20 && !m.container.querySelector("[data-inline-editor-mine-switch-error]"); i++) await act(async () => new Promise((r) => setTimeout(r, 10)));
    assert.ok(m.container.querySelector("[data-inline-editor-mine-switch-error]"), m.container.innerHTML.slice(0, 600));
    assert.match(m.container.querySelector("[data-inline-editor-mine-switch-error]").textContent, /网络断开，保存失败/);
  } finally { await m.destroy(); }
});

test("materials panel lists the editor-declared types and reports every insert in plain words", async () => {
  const { InlineEditorMaterialPanel } = await import(await compileModule("src/shell/InlineEditorMaterialPanel.tsx", {
    "../i18n/ui/useUI": ui,
    "./MaterialLibrary": dataModule(`export function MaterialLibrary(p){ globalThis.__materialProps = p; return null; }`),
    "./InlineInsertableMaterialShelf": dataModule(`export function InlineInsertableMaterialShelf(p){ globalThis.__materialProps = p; return null; }`),
  }));
  let next = { ok: true };
  const materials = {
    appId: "library", actions: ["insert"], materialTypes: ["image"], entries: [],
    perform: async () => next, canPerform: () => true, beginMaterialDrag() {}, endMaterialDrag() {},
  };
  const m = await mount(React.createElement(InlineEditorMaterialPanel, {
    item: { ...item, kind: "document", meta: { format: "pdf" } }, siteId: "oceanleo", accent: "#000", materials, primaryMaterialAction: "insert",
  }));
  try {
    assert.deepEqual(globalThis.__materialProps.types, ["image"], "PDF editor declared images, not PDFs");
    const { resolveMaterialPanelType, humanMaterialReason } = await import(await compileModule("src/shell/InlineEditorMaterialPanel.tsx", {
      "../i18n/ui/useUI": ui,
      "./MaterialLibrary": dataModule(`export function MaterialLibrary(){ return null; }`),
    }));
    const pdfItem = { ...item, kind: "document", meta: { format: "pdf" } };
    assert.equal(resolveMaterialPanelType(pdfItem, [], ["insert"]), "image", "an undeclared PDF stamp adapter still lists images (D2), not PDFs");
    assert.equal(resolveMaterialPanelType(pdfItem, [], []), "pdf", "no insert action: the file's own type");
    assert.equal(resolveMaterialPanelType({ ...item, kind: "image", meta: {} }, [], ["insert"]), "image");
    assert.equal(resolveMaterialPanelType({ ...item, kind: "ppt", meta: {} }, [], ["insert", "replace"]), "image", "deck inserts images only");
    assert.equal(resolveMaterialPanelType({ ...item, kind: "document", meta: {} }, [], ["insert"]), "image", "doc inserts images only");
    assert.equal(resolveMaterialPanelType({ ...item, kind: "video", meta: {} }, [], ["insert"]), "video");
    assert.equal(resolveMaterialPanelType({ ...item, kind: "audio", meta: {} }, [], ["replace"]), "audio");
    const id = (t) => t;
    assert.equal(humanMaterialReason("目标编辑器尚未注册 command/history 执行契约。", id), "这个编辑器还不能从素材库直接插入");
    assert.equal(humanMaterialReason("Insert/Replace 前必须取得 artifactId + revisionId。", id), "这份素材还没存进库，暂时不能插入");
    assert.equal(humanMaterialReason("网络断了", id), "网络断了");
    await act(async () => { await globalThis.__materialProps.perform("insert", { ...item, title: "Logo" }); });
    assert.equal(m.container.querySelector("[data-material-insert-feedback]").dataset.materialInsertFeedback, "ok");
    assert.match(m.container.textContent, /已插入「Logo」/);
    next = { ok: false, error: "当前编辑器不接受这种 artifact type/source。" };
    await act(async () => { await globalThis.__materialProps.perform("insert", { ...item, title: "Clip" }); });
    assert.equal(m.container.querySelector("[data-material-insert-feedback]").dataset.materialInsertFeedback, "error");
    assert.match(m.container.textContent, /这个编辑器用不了这类素材/, "registry jargon is shown in plain words");
    assert.equal(globalThis.__materialProps.canPerform, materials.canPerform);
  } finally { await m.destroy(); }
});

test("document drawers (插入/批注) stay reachable next to the always-on text bar", () => {
  assert.equal(editBarDrawersAlwaysVisible("richdoc"), true);
  assert.equal(editBarDrawersAlwaysVisible("image"), false);
  assert.equal(editBarDrawersAlwaysVisible("deck"), false);
});

test("a page-level context (deck slide with nothing selected) counts as no selection; an object selection does not", () => {
  const base = { adapterId: "deck@2", hasContextToolbar: true, selectionPresent: true };
  assert.equal(editBarShowsDrawers({ ...base, selectionKind: "slide" }), true, "W07: 模板/元素/画笔/线条/便签 next to the page controls");
  assert.equal(editBarShowsDrawers({ ...base, selectionKind: "slide-text" }), false);
  assert.equal(editBarShowsDrawers({ ...base, adapterId: "audio", selectionKind: "audio-track" }), true, "whole-track controls retain the audio tools drawer");
  assert.equal(editBarShowsDrawers({ ...base, adapterId: "audio", selectionKind: "audio-region" }), false, "a selected region remains an object selection");
  assert.equal(editBarShowsDrawers({ ...base, selectionKind: "slide-image" }), false);
  assert.equal(editBarShowsDrawers({ ...base, selectionPresent: false, selectionKind: null }), true);
  assert.equal(editBarShowsDrawers({ ...base, hasContextToolbar: false, selectionKind: null }), true);
  assert.equal(editBarShowsDrawers({ ...base, adapterId: "richdoc", selectionKind: "text" }), true);
  assert.equal(editBarShowsDrawers({ ...base, adapterId: "image", selectionKind: "image" }), false);
});
