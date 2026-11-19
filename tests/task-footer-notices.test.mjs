import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const react = JSON.stringify(pathToFileURL(require.resolve("react")).href);
const ui = dataModule('export function useUI(){ return (s,v) => s.replace(/\\{(\\w+)\\}/g, (_,k) => v?.[k] ?? k); }');
const nil = (name) => dataModule(`export function ${name}(){return null;}`);
const notice = await compileModule("src/shell/transcript/StreamNotice.tsx");
const { TranscriptPane } = await import(await compileModule("src/shell/transcript/TranscriptStream.tsx", {
  "./StreamNotice": notice,
  "../../i18n/ui/useUI": ui,
  "../history/older-history": nil("OlderHistoryTop"),
}));
const api = dataModule('export const acpErrorText = e => e.message; export async function request(path, init){ return globalThis.__controlsRead(path, init); }');
const { AcpSessionControls } = await import(await compileModule("src/shell/acp-task/AcpSessionControls.tsx", {
  "../transcript/StreamNotice": notice, "../../i18n/ui/useUI": ui, "../../lib/acp-frames-api": api,
}));
const { useAcpSessionControls } = await import(await compileModule("src/shell/acp-task/useAcpSessionControls.ts", {
  "../../lib/acp-frames-api": api,
}));
const { TaskAccessComposer } = await import(await compileModule("src/shell/access/TaskAccessComposer.tsx", {
  "../transcript/StreamNotice": notice, "../../i18n/ui/useUI": ui,
  "./useTaskAccess": dataModule('export function notifyTaskAccessChanged(){}'),
  "./task-access-client": dataModule('export class TaskAccessError extends Error {} export const taskAccessClient = {};'),
  "../../pages/AuthDialog": nil("AuthDialog"),
}));
const { LeoComposer } = await import(await compileModule("src/shell/LeoComposer.tsx", {
  "./transcript/StreamNotice": notice, "../i18n/ui/useUI": ui,
  "./use-composer-input-activity": dataModule('export function useComposerInputActivity(_id,_value,onChange){return onChange;}'),
  "../lib/attachment-url": dataModule('export const PRIVATE_ATTACHMENT_MAX_BYTES=20000000;'),
  "./PromptHighlightArea": dataModule(`import React from ${react}; export const TemplateFillArea = React.forwardRef(p => React.createElement('textarea', { value: p.value, readOnly: true }));`),
  "./guide-context": dataModule('export function useFillNonce(){return 0;} export function useFillTemplate(){return null;}'),
  "./mobile-native-actions": dataModule('export function useNativeAttachActions(){return [];} export function useNativeHandoffEntry(){return {action:null,panel:null};} export function useNativeTaskNotifications(){} export function requestTaskNotificationsOnce(){}'),
  "../lib/upload/use-attachment-intake": dataModule('export function useAttachmentIntake(){return {compressing:false,pending:[],inFlight:[],emit(){},handlePaste(){}};}'),
  "./workspace-runtime-hydration": dataModule('export function useWorkspaceRuntimeHydration(){return null;}'),
  "./composer-draft": dataModule('export function useComposerDraft(){return {markSubmitted(){}};}'),
  "./composer-max-height": dataModule('export function useComposerMaxHeight(){return 300;}'),
  "./composer-skill-slash": dataModule('export function composerSlashAdapter(){return {};} export function useComposerSkillSlash(){return {onKeyDown(){return false;},popover:null};}'),
  "./ComposerLibraryPicker": dataModule('export function ComposerLibraryPicker(){return null;} export function warmComposerLibraryFiles(){}'),
  ...Object.fromEntries([
    ["./LeoEntryButton", "LeoEntryButton"], ["./AttachmentStrip", "AttachmentStrip"],
    ["./ModelPicker", "ModelGroupPicker"], ["./PluginsPopover", "PluginsPopover"],
    ["./mcp-apps", "ComposerAppsBar"], ["./cloud-computer/ComputerDock", "ComputerDock"],
  ].map(([path, name]) => [path, nil(name)])),
}));

const baseComposer = { value: "keep draft", onChange(){}, onSubmit(){}, showModelPicker: false, showComputerDock: false, showPlugins: false, showAppsBar: false };
async function mount(pane, footer) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const scrollRef = React.createRef();
  const render = async (nextFooter = footer) => act(async () => root.render(React.createElement(TranscriptPane, {
    pane, scrollRef, top: null, empty: null, items: "Conversation", tail: null, overlay: null,
    footer: nextFooter, after: null, canView: true, hasMore: false,
    history: { sentinelRef(){}, loading: false, spinnerVisible: false },
  })));
  await render();
  return { host, render, footer: () => host.querySelector('[data-agent-chat-footer]'),
    notices: () => host.querySelector('[data-agent-stream-notices]'),
    padding: () => scrollRef.current.style.paddingBottom,
    async close(){ await act(async () => root.unmount()); host.remove(); },
  };
}
// jsdom has no layout engine. Exact layout-bearing markup + reserved padding
// catches inserted footer rows without claiming that zero-height jsdom rectangles prove pixels.
const footprint = (node) => {
  const clone = node.cloneNode(true);
  for (const element of clone.querySelectorAll('*')) {
    for (const name of ['disabled', 'aria-disabled', 'aria-describedby']) element.removeAttribute(name);
  }
  return clone.outerHTML;
};

for (const pane of ["cloud", "acp"]) {
  for (const kind of ["upload", "stop", "blocked"]) test(`${pane}: ${kind} notice is in stream; composer layout and padding stay equal`, async () => {
    const retries = [], removed = [];
    const props = { ...baseComposer, sendBlocked: true, onRetryAttachment: id => retries.push(id), onRemoveAttachment: id => removed.push(id) };
    const view = await mount(pane, React.createElement(LeoComposer, props));
    try {
      const before = footprint(view.footer()), padding = view.padding();
      const extra = kind === "upload" ? { attachments: [{ id: "file", name: "report.pdf", failed: true, failedReason: "Network unavailable" }] }
        : kind === "stop" ? { stopError: "Stop failed: computer offline" }
        : { sendBlockedReason: "Send unavailable: computer offline" };
      await view.render(React.createElement(LeoComposer, { ...props, ...extra }));
      assert.equal(footprint(view.footer()), before);
      assert.equal(view.padding(), padding);
      assert.equal(view.footer().querySelector('[role="alert"], [role="status"]'), null);
      assert.match(view.notices().textContent, /Network unavailable|computer offline/);
      assert.ok(view.host.querySelector('[data-agent-stream-scroller]').contains(view.notices()));
      assert.equal(view.footer().querySelector('[data-composer-send]').disabled, true, "notice routing preserves the send guard");
      if (kind === "upload") {
        for (const button of view.notices().querySelectorAll('button')) await act(async () => button.click());
        assert.deepEqual(retries, ["file"]); assert.deepEqual(removed, ["file"]);
      }
      await view.render(React.createElement(LeoComposer, props));
      assert.equal(view.notices().textContent, "", "resolved notices are removed");
    } finally { await view.close(); }
  });

  test(`${pane}: access-read failure changes only the stream notice`, async () => {
    const props = { taskId: "t1", signedIn: true, access: null, onRefresh: async () => {} };
    const view = await mount(pane, React.createElement(TaskAccessComposer, props));
    try {
      const before = view.footer().outerHTML, padding = view.padding();
      await view.render(React.createElement(TaskAccessComposer, { ...props, error: true }));
      assert.equal(view.footer().outerHTML, before);
      assert.equal(view.padding(), padding);
      assert.ok(view.notices().querySelector('[data-auto-recovery="temporary"][aria-busy="true"]'));
      assert.equal(view.notices().querySelector('[data-auto-recovery] button'), null);
      assert.equal(view.footer().querySelector('[role="alert"]'), null);
    } finally { await view.close(); }
  });

  test(`${pane}: access action failure stays in stream with invitation buttons unchanged`, async () => {
    const props = { taskId: "t1", signedIn: true, access: { state: "invited" }, onRefresh: async () => {},
      client: { accept: async () => { throw new Error("offline"); } } };
    const view = await mount(pane, React.createElement(TaskAccessComposer, props));
    try {
      const before = view.footer().outerHTML, padding = view.padding();
      await act(async () => view.footer().querySelector('button').click());
      assert.equal(view.footer().outerHTML, before);
      assert.equal(view.padding(), padding);
      assert.equal(view.notices().querySelectorAll('[role="alert"]').length, 1);
    } finally { await view.close(); }
  });
}

test("persistent controls 503 retries quietly, then shows exactly one stream line; recovery clears it", async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, recovered = false;
  globalThis.__controlsRead = async () => {
    ++calls;
    if (!recovered) throw new Error('HTTP 503: service unavailable');
    return { commands: [{ name: 'help', description: 'Help' }], usage: { used: 20, size: 100 } };
  };
  const rows = [];
  function Controls(){
    const controls = useAcpSessionControls('t1', 'attached', rows);
    return React.createElement(AcpSessionControls, { ...controls, input: '/', onChange(){} });
  }
  const view = await mount('acp', React.createElement(Controls));
  try {
    const before = view.footer().outerHTML, padding = view.padding();
    assert.equal(calls, 1);
    assert.equal(view.notices().textContent, '');
    await act(async () => t.mock.timers.tick(2000));
    assert.equal(calls, 2);
    assert.equal(view.notices().textContent, '');
    await act(async () => t.mock.timers.tick(4000));
    assert.equal(calls, 3);
    assert.equal(view.notices().querySelectorAll('[data-acp-controls-error]').length, 1);
    assert.match(view.notices().textContent, /会话选项未能加载：HTTP 503/);
    assert.equal(view.footer().outerHTML, before);
    assert.equal(view.padding(), padding);
    assert.equal(view.footer().querySelector('[role="menu"], meter'), null);
    await act(async () => t.mock.timers.tick(8000));
    assert.equal(calls, 4);
    assert.equal(view.notices().querySelectorAll('[data-acp-controls-error]').length, 1);
    recovered = true;
    await act(async () => t.mock.timers.tick(15000));
    assert.equal(calls, 5);
    assert.equal(view.notices().textContent, '');
    assert.ok(view.footer().querySelector('[role="menu"]'));
    assert.ok(view.footer().querySelector('meter'));
  } finally { await view.close(); delete globalThis.__controlsRead; }
  await act(async () => t.mock.timers.tick(60000));
  assert.equal(calls, 5, 'unmount cancels retries');
});

test("controls task switch discards a late failure and cancels the old retry", async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let rejectOld, calls = 0;
  globalThis.__controlsRead = async (path) => {
    ++calls;
    if (path.includes('/old/')) return new Promise((_, reject) => { rejectOld = reject; });
    return {};
  };
  const rows = [];
  function Controls({ taskId }){
    const controls = useAcpSessionControls(taskId, 'attached', rows);
    return React.createElement(AcpSessionControls, { ...controls, input: '/', onChange(){} });
  }
  const view = await mount('acp', React.createElement(Controls, { taskId: 'old' }));
  try {
    await view.render(React.createElement(Controls, { taskId: 'new' }));
    await act(async () => rejectOld(new Error('stale failure')));
    await act(async () => t.mock.timers.tick(60000));
    assert.equal(calls, 2);
    assert.equal(view.notices().textContent, '');
  } finally { await view.close(); delete globalThis.__controlsRead; }
});

const { ModelGroupPicker } = await import(await compileModule("src/shell/ModelPicker.tsx", {
  "./transcript/StreamNotice": notice, "../i18n/ui/useUI": ui,
  "../lib/auth/account": dataModule('export async function getModelGroups(){return globalThis.__modelReadResult;} export async function setActiveModelGroup(){throw new Error("unexpected activate");} export const MODEL_GROUP_CHANGED_EVENT="model-changed";'),
  "./workbench-open-store": dataModule('export function useWorkbenchOpen(){return false;}'),
  "./leo-run-options": dataModule('export function readLeoFastMode(){return false;} export function writeLeoFastMode(){} export const LEO_FAST_MODE_EVENT="fast-changed";'),
  "./oceanleo-mode": dataModule('export function useOceanleoMode(){return {};} export function oceanleoModeRow(){return {};}'),
  "./composer-settings-menu": dataModule(`import React from ${react}; export function ComposerSettingsMenu(p){return React.createElement('div', p.rootAttrs, React.createElement('button', {}, p.summary), p.footer);}`),
  "./anchored-popover": nil("AnchoredPopover"),
}));

test("cloud picker read error is visible without opening its menu and leaves footer markup equal", async () => {
  globalThis.__modelReadResult = { ok: false, status: 401 };
  const baseline = await mount('cloud', React.createElement(ModelGroupPicker, { compact: true }));
  const before = baseline.footer().outerHTML;
  await baseline.close();
  globalThis.__modelReadResult = { ok: false, status: 503, error: 'Models unavailable' };
  const failed = await mount('cloud', React.createElement(ModelGroupPicker, { compact: true }));
  try {
    assert.equal(failed.footer().outerHTML, before);
    assert.equal(failed.footer().querySelector('[data-leo-settings-error]'), null);
    assert.match(failed.notices().textContent, /Models unavailable/);
    assert.equal(failed.notices().querySelectorAll('[data-leo-settings-error]').length, 1);
  } finally { await failed.close(); delete globalThis.__modelReadResult; }
});

const { useAcpCatalogPicker } = await import(await compileModule("src/shell/acp-task/useAcpCatalogPicker.tsx", {
  "../transcript/StreamNotice": notice, "../../i18n/ui/useUI": ui,
  "../../lib/acp-frames-api": dataModule('export const acpErrorText=e=>e.message; export async function request(){throw new Error("unexpected setting");} export async function getCatalog(){return {models:{currentModelId:"one",availableModels:[{modelId:"one",name:"One"},{modelId:"two",name:"Two"}]}};}'),
  "../../lib/program-choice-api": dataModule('export async function putProgramChoice(){throw new Error("Setting save failed");}'),
  "../cloud-computer/native-surface/useProgramAccess": dataModule('export function useProgramAccess(){return {programs:[]};}'),
  "../cloud-computer/agent-dialog/model-param-memory": dataModule('export async function readProgramChoice(){return {};} export function listedConfigValue(){return undefined;}'),
  "../native-thread/NativeModelPicker": dataModule(`import React from ${react}; export function NativeModelPicker(){return null;} export function nativeModelPickerFor(p){return React.createElement('button', {onClick:()=>p.dialog.setSelectedModel('two')}, p.notice || 'Choose model');}`),
}));

test("ACP picker save notice appears once in stream and leaves the picker/footer unchanged", async () => {
  function Picker(){return useAcpCatalogPicker({taskId:'t1',computerId:'computer',program:'generic'}).picker;}
  const view = await mount('acp', React.createElement(Picker));
  try {
    const before = view.footer().outerHTML, padding = view.padding();
    await act(async () => view.footer().querySelector('button').click());
    assert.equal(view.footer().outerHTML, before);
    assert.equal(view.padding(), padding);
    assert.equal(view.notices().querySelectorAll('[data-native-choice-error]').length, 1);
    assert.match(view.notices().textContent, /Setting save failed/);
  } finally { await view.close(); }
});
