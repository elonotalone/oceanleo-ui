import "./helpers/w1-jsdom-window.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { recordUserMutation, resetUserEditSession } from "../src/shell/user-edit-session.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const react = pathToFileURL(require.resolve("react")).href;
const jsx = `import {jsx,jsxs} from ${JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href)};`;
const noop = (name) => dataModule(`export function ${name}(){return null;}`);
const stubs = {
  "../i18n/ui/useUI": dataModule('const tt=x=>x;export function useUI(){return tt;}'),
  "./AdvancedStageControls": noop("AdvancedStageControls"),
  "./AdvancedWorkbenchStage": dataModule(`${jsx} export function AdvancedWorkbenchStage({editorStage}){return jsx("div",{children:editorStage});}`),
  "./FloatingContextToolbar": dataModule('const toolbar={mode:"floating"};export function useFloatingContextToolbar(){return toolbar;}export function FloatingContextToolbar(){return null;}'),
  "./EditBarDockHost": noop("EditBarDockHost"),
  "./InlineAdvancedWorkbenchHeader": dataModule(`${jsx} export function InlineAdvancedWorkbenchHeader(p){return jsxs("div",{children:[jsx("button",{"data-close-editor":true,onClick:p.onClose,children:"close"}),jsx("button",{"data-back-editor":true,onClick:p.onBack,children:"back"}),jsx("span",{"data-save-state":p.autoSaveState,children:p.autoSaveError})]});}`),
  "./inline-editor-mine-panel": noop("InlineEditorMinePanel"),
  "./inline-advanced-workbench-drop": dataModule('const drop={dropMessage:"",performUpload:async()=>{},handleDrop(){}};export function useInlineAdvancedWorkbenchDrop(){return drop;}'),
  "./use-inline-advanced-panels": dataModule('const panels={drawers:[],editBarDrawers:[],isPanelOpen(){return false;},activeDrawerId:"",openDrawer(){},openTransientPanel(){},updateTransientPanel(){},closeDetail(){},closeDrawer(){}};export function useInlineAdvancedPanels(){return panels;}'),
  "./inline-advanced-shell-parts": dataModule('export function HiddenUploadInput(){return null;}export function StageNoticeCorner(){return null;}export function useEditBarDockPresentation(){return {};}export function FallbackDetailAside(){return null;}export function SelectionPresenceProbe(p){return p.children;}const pages=[{id:"normal",kind:"main"}];export function usePluginPagesForAdapter(){return pages;}'),
  "./advanced-session-context": dataModule('export function useAdvancedSession(){return null;}'),
  "./workbench-material-provider": dataModule('export function useWorkbenchMaterials(){return null;}'),
  "./SplitWorkspace": dataModule('export function useRightPaneSlot(){return null;}export function useWorkspacePane(){return null;}'),
  "./plugin-theme": dataModule(`import {createContext} from ${JSON.stringify(react)};export const PluginThemePortalContext=createContext(null);export function pluginThemeIdForAdapter(){return null;}export function pluginWorkbenchStyle(){return {};}const theme={};export function usePluginTheme(){return theme;}`),
  "./plugin-chrome/EditBarDocumentSegment": noop("EditBarDocumentSegment"),
  "./plugin-chrome/plugin-pages": dataModule('export function editBarVisibleOnPage(){return false;}'),
  "./plugin-chrome/plugin-page-store": dataModule('const page={pageId:"normal"};export function usePluginPage(){return page;}'),
};
// Real Inline shell, autosave hook/controller and leave helper. Only visual,
// network/session and unrelated panel leaves above are controlled.
const { InlineAdvancedWorkbenchShell } = await import(await compileModule("src/shell/InlineAdvancedWorkbenchShell.tsx", stubs));
const { resetBackgroundSaverForTests } = await import(await compileModule("src/shell/advanced-background-saver.ts", stubs));

test("real Inline keeps hosted iframe alive through failed close, retry and correlated flush completion", async () => {
  const { createRoot } = await import("react-dom/client");
  const item = { id: "mounted-leave-fixture", key: "mounted-leave-fixture", title: "Hosted video", kind: "video_canvas", meta: {}, url: "https://video.oceanleo.com/source", revisionId: "base" };
  resetUserEditSession(item.key);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const pending = [];
  let unmounts = 0;
  function Frame() {
    React.useEffect(() => () => { unmounts += 1; }, []);
    return React.createElement("iframe", { "data-only-serializer": true });
  }
  function Host() {
    const [opened, setOpened] = React.useState(true);
    const [revision, setRevision] = React.useState(0);
    if (!opened) return React.createElement("div", { "data-editor-closed": true });
    return React.createElement(React.Fragment, null,
      React.createElement("button", { "data-edit": true, onClick() { recordUserMutation(item.key); setRevision((v) => v + 1); } }, "edit"),
      React.createElement(InlineAdvancedWorkbenchShell, { item, onClose: () => setOpened(false), adapter: { id: "video-canvas", label: "Video", stage: React.createElement(Frame), persistence: { userEditKey: item.key, dirty: revision > 0, editRevision: revision, autoSave: true, requiresMountedFlush: true, flush: () => new Promise((resolve) => pending.push(resolve)) } } }),
    );
  }
  await act(async () => root.render(React.createElement(Host)));
  try {
    await act(async () => container.querySelector("[data-edit]").click());
    await act(async () => container.querySelector("[data-close-editor]").click());
    assert.equal(pending.length, 1);
    assert.equal(unmounts, 0);
    assert.equal(Boolean(container.querySelector("[data-only-serializer]")), true);
    assert.equal(Boolean(container.querySelector("[data-editor-leave-pending][inert]")), true);
    await act(async () => pending.shift()({ ok: false, error: "private upload offline", retryable: false }));
    assert.equal(unmounts, 0);
    assert.equal(Boolean(container.querySelector("[data-editor-closed]")), false);
    assert.equal(Boolean(container.querySelector("[data-editor-leave-pending]")), false);
    await act(async () => container.querySelector("[data-back-editor]").click());
    assert.equal(pending.length, 1);
    assert.equal(unmounts, 0);
    await act(async () => pending.shift()({ ok: true, item: { ...item, revisionId: "durable-new" } }));
    assert.equal(unmounts, 1);
    assert.equal(Boolean(container.querySelector("[data-editor-closed]")), true);
  } finally {
    await act(async () => root.unmount()); container.remove(); resetUserEditSession(item.key);
  }
});

const RECEIPT_CASES = ["own receipt", "different root", "different pin", "new dirty edit", "different persistence tier"];
assert.equal(RECEIPT_CASES.length, 5);
for (const scenario of RECEIPT_CASES) test(`real Inline receipt adoption: ${scenario}`, async () => {
  const { createRoot } = await import("react-dom/client");
  const initialItem = { id: `mounted-receipt-${scenario}`, key: `mounted-receipt-${scenario}`, title: "Hosted video", kind: "video_canvas", meta: {}, revisionId: "base" };
  resetUserEditSession(initialItem.key);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  let complete;
  let calls = 0;
  function Host() {
    const [opened, setOpened] = React.useState(true);
    const [item, setItem] = React.useState(initialItem);
    const [revision, setRevision] = React.useState(0);
    const [tier, setTier] = React.useState(initialItem.key);
    if (!opened) return React.createElement("div", { "data-editor-closed": true });
    return React.createElement(React.Fragment, null,
      React.createElement("button", { "data-edit": true, onClick() { recordUserMutation(item.key); setRevision((v) => v + 1); } }, "edit"),
      React.createElement(InlineAdvancedWorkbenchShell, { item, onClose: () => setOpened(false), adapter: { id: "video-canvas", label: "Video", stage: React.createElement("iframe", { "data-only-serializer": true }), persistence: { userEditKey: tier, dirty: revision > 0, editRevision: revision, autoSave: true, requiresMountedFlush: true, flush: async () => {
        calls += 1;
        if (calls > 1) return { ok: false, error: "controlled next write", retryable: false };
        const saved = await new Promise((resolve) => { complete = resolve; });
        if (saved.ok) {
          setItem(scenario === "different root" ? { ...saved.item, id: "other-root", key: "other-root" } :
            scenario === "different pin" ? { ...saved.item, revisionId: "unrelated-pin" } : saved.item);
          setRevision(scenario === "new dirty edit" ? 2 : 0);
          if (scenario === "different persistence tier") setTier(`${initialItem.key}:another-face`);
        }
        return saved;
      } } } }),
    );
  }
  await act(async () => root.render(React.createElement(Host)));
  try {
    await act(async () => container.querySelector("[data-edit]").click());
    await act(async () => container.querySelector("[data-close-editor]").click());
    assert.equal(calls, 1);
    assert.ok(container.querySelector("[data-only-serializer]"));
    await act(async () => complete({ ok: true, item: { ...initialItem, revisionId: "durable-new" } }));
    assert.equal(Boolean(container.querySelector("[data-editor-closed]")), scenario === "own receipt", "only the exact clean same-root receipt in the same persistence tier can complete closing");
    if (scenario !== "own receipt") assert.ok(container.querySelector("[data-only-serializer]"), "an unrelated or dirty source remains mounted");
    assert.equal(calls, 1, "receipt adoption must not publish a second revision");
  } finally {
    await act(async () => { root.unmount(); resetBackgroundSaverForTests(); }); container.remove(); resetUserEditSession(initialItem.key);
  }
});
