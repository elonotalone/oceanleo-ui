/** Real provider + console + session request serialization; only I/O is stubbed. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act, useState } from "react";

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
  url: "https://ppt.dev.oceanleo.com/workspace/training-courseware",
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
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
window.Element.prototype.scrollTo = function () {};
window.Element.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.React = React;


const calls = [];
let stored = null;
let draft = null;
let seq = 0;
globalThis.__d15Authed = async (url, init = {}) => {
  const path = url.split("?")[0];
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ path, method, body });
  if (method === "POST" && path === "/v1/agent/sessions") {
    stored ||= {
      id: `session-${++seq}`, site_id: body.site_id, app_id: body.app_id,
      surface: body.surface, status: "active", revision: 0,
      snapshot: body.snapshot || {}, schema_version: body.schema_version ?? 1,
    };
    return { ok: true, data: { session: stored, created: true } };
  }
  if (method === "PUT") {
    stored = { ...stored, snapshot: body.snapshot, schema_version: body.schema_version,
      revision: stored.revision + 1 };
    return { ok: true, data: { session: stored } };
  }
  if (method === "GET") return { ok: true, data: path.endsWith("/sessions")
    ? { items: stored ? [stored] : [] } : { session: stored } };
  throw new Error(`unexpected request ${method} ${path}`);
};
globalThis.__d15LoadDraft = () => draft;
const apiUrl = await compileModule("src/lib/app-session.ts", {
  "./agent": dataModule("export const authed = (...args) => globalThis.__d15Authed(...args);"),
  "./history-events": dataModule("export function notifyHistoryChanged() {}"),
});
const providerUrl = await compileModule("src/shell/WorkspaceSession.tsx", {
  "../lib/app-session": apiUrl,
  "../lib/console-draft": dataModule(`
    export async function loadConsoleDraft() { return globalThis.__d15LoadDraft(); }
    export async function clearConsoleDraft() {}
    export async function saveConsoleDraft() {}
  `),
  "./workspace-session-task": dataModule("export async function findLinkedAgentTaskId() {}"),
});
const { WorkspaceSessionProvider, useOptionalWorkspaceSession } = await import(providerUrl);
const chatUrl = await compileModule("src/shell/FunctionAgentChat.tsx", {
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (value) => value; }",
  ),
  "./LeoComposer": dataModule("export function LeoComposer(){ return null; }"),
  "./AgentProgress": dataModule("export function AgentProgress(){ return null; }"),
  "./RestartDraftButton": dataModule(
    "export function RestartDraftButton(){ return null; }",
  ),
  "./OperatorRemark": dataModule(`
    export function OperatorRemarkField(){ return null; }
    export function useOperatorRemark(){ return { remark: "", setRemark(){} }; }
  `),
  "./AgentTranscriptBubble": dataModule(`
    export function AgentTranscriptBubble(props) {
      const h = globalThis.React.createElement;
      return h("div", { "data-agent-bubble": props.message.role }, props.message.content || "");
    }
    export function agentArtifactLabels(){ return {}; }
  `),
  "./useAttachments": dataModule(`
    export function useAttachments() {
      return {
        attachments: [],
        composerAttachments: [],
        handleAttachFiles() {},
        addReady() {},
        restoreReady() {},
        removeAttachment() {},
        ready: () => [],
        uploading: false,
        clear() {},
      };
    }
  `),
  "./WorkspaceSession": providerUrl,
  "./workspace-runtime-hydration": dataModule(`
    export function useWorkspaceRuntimeHydration() {
      return null;
    }
  `),
  "./SplitWorkspace": dataModule(`
    export function useLeftPaneSlot() { return null; }
    export function useRegisterConsoleAgentFocus() {}
  `),
  "./icons": dataModule(`
    export function IconSparkles() { return null; }
    export function IconWorkspace() { return null; }
  `),
  "./guide-context": dataModule(`
    export function useRegisterOpsFiller() {}
    export function useGuideWorkflows() { return null; }
    export function FillNonceProvider({ children }) { return children; }
  `),
  "../lib/agent": dataModule(`
    export async function createTask(body) {
      globalThis.__agentCreateTaskCalls.push(body);
      if (typeof globalThis.__agentCreateTask === "function") {
        return globalThis.__agentCreateTask(body);
      }
      return { ok: false };
    }
    export async function branchTask() { return { ok: false }; }
    export async function followUp() { return { ok: true }; }
    export async function getTask(id) {
      if (typeof globalThis.__agentGetTask === "function") {
        return globalThis.__agentGetTask(id);
      }
      return { ok: false };
    }
    export async function stopTask() { return { ok: true }; }
    export async function reportEditorCommandResult() { return { ok: true }; }
  `),
  "./workspace-actions": dataModule(`
    export const WORKSPACE_ACTION_EVENT = "oceanleo:test-workspace-action";
    export function dispatchWorkspaceAction() {}
    export function normalizeWorkspaceAction() { return null; }
  `),
  "../lib/operator-remark": dataModule(`
    export function appendOperatorRemark(prompt) { return prompt; }
  `),
  "../lib/agent-progress": dataModule(`
    export function activeAgentProgressKey() { return null; }
    export function buildAgentRenderItems() { return []; }
    export function sameAgentMessages(current, incoming) {
      try {
        return JSON.stringify(current) === JSON.stringify(incoming);
      } catch {
        return false;
      }
    }
    export function takeUnreportedAgentArtifacts() { return []; }
  `),
  "./agent-review/surface": dataModule(`
    export function readAgentCommandSurface() { return null; }
  `),
  "./agent-review/dock": dataModule(`
    export function AgentReviewDock() { return null; }
  `),
  "./agent-review/selection-bridge": dataModule(`
    export function assembleAgentEditorContext() { return null; }
  `),
  "./agent-review/inbox": dataModule(`
    export function readAgentSelection() { return null; }
    export function readMentionCatalog() { return []; }
  `),
  "./agent-review/selection-live": dataModule(`
    export function refreshAgentSelectionFromDom() {}
  `),
  "./agent-review/install": dataModule(`
    export function installAgentReviewGate() {}
    export function installSelectionBridge() {}
  `),
});

const { FunctionAgentChat } = await import(chatUrl);
const { createRoot } = await import('react-dom/client');
const h = React.createElement;
let workspace;
let restored;
let consoleSnapshot;
const chatProps = {
  agentId: 'ppt.generate', siteId: 'ppt', schema: { title: 'PPT', fields: [] },
  opsContent: h('div', null, 'console'), enableEditorCommands: false,
  sessionSchemaVersion: 2,
  getSessionSnapshot: () => consoleSnapshot,
  onRestoreSessionSnapshot: snapshot => { restored.push(snapshot); consoleSnapshot = snapshot; },
};
function Probe() { workspace = useOptionalWorkspaceSession(); return null; }
async function mount({ appId = 'training-courseware', console = true, initialSession = null } = {}) {
  calls.length = 0; restored = []; consoleSnapshot = { topic: 'new input', slides: [] };
  stored = initialSession; draft = { state: { topic: 'saved draft', slides: [] } };
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const render = async (overrides = {}) => {
    const props = { appId, console, ...overrides };
    await act(async () => root.render(h(React.StrictMode, null,
      h(WorkspaceSessionProvider, { siteId: 'ppt', appId: props.appId, resumeLatest: false, initialSession },
        h(Probe), props.console ? h(FunctionAgentChat, chatProps) : null))));
  };
  await render();
  return { host, render, async unmount() { await act(async () => root.unmount()); host.remove(); } };
}
const mutations = () => calls.filter(c => c.method !== 'GET');
const creates = () => calls.filter(c => c.method === 'POST' && c.path === '/v1/agent/sessions');

test('embedded attach stays deferred, then first saved output creates v2 and console restores', async () => {
  const bed = await mount();
  try {
    assert.equal(mutations().length, 0, 'registration alone never creates or saves a session');
    await act(async () => { assert.equal(await workspace.ensureActive({ title: 'deck', intent: 'attach' }), null); });
    assert.equal(creates().length, 0);
    await act(async () => { await workspace.ensureActive({ title: 'deck', intent: 'output' }); });
    assert.equal(creates().length, 1);
    assert.equal(creates()[0].body.schema_version, 2);
    assert.equal(stored.schema_version, 2);
    assert.equal(restored.at(-1).topic, 'saved draft');
    assert.doesNotMatch(bed.host.textContent, /不兼容/);
    await act(async () => { await workspace.saveSnapshot({ topic: 'editor head' }); });
    assert.equal(mutations().at(-1).body.schema_version, 2);
  } finally { await bed.unmount(); }
});

test('unregistered app sends no schema_version property and keeps backend v1 default', async () => {
  const bed = await mount({ console: false });
  try {
    await act(async () => { await workspace.ensureActive({ intent: 'output' }); });
    assert.equal(Object.hasOwn(creates()[0].body, 'schema_version'), false);
    assert.equal(stored.schema_version, 1);
  } finally { await bed.unmount(); }
});

for (const entry of ['output', 'thread', 'startNew']) {
  test(`${entry} also uses the registered console schema`, async () => {
    const bed = await mount();
    try {
      await act(async () => {
        if (entry === 'output') await workspace.artifactContext('output');
        else if (entry === 'startNew') await workspace.startNew({ intent: 'thread', remountRuntime: false });
        else await workspace.ensureActive({ intent: 'thread' });
      });
      assert.equal(creates()[0].body.schema_version, 2);
    } finally { await bed.unmount(); }
  });
}

test('explicit standalone snapshot schema wins over registration', async () => {
  const bed = await mount();
  try {
    await act(async () => { await workspace.ensureActive({ intent: 'output', schemaVersion: 7 }); });
    assert.equal(creates()[0].body.schema_version, 7);
  } finally { await bed.unmount(); }
});

test('registration is removed on console unmount and does not leak to another app', async () => {
  const bed = await mount();
  try {
    await bed.render({ console: false });
    await act(async () => { await workspace.ensureActive({ intent: 'output' }); });
    assert.equal(Object.hasOwn(creates()[0].body, 'schema_version'), false);
    stored = null;
    await bed.render({ appId: 'another-app', console: false });
    await act(async () => { await workspace.ensureActive({ intent: 'output' }); });
    assert.equal(creates().at(-1).body.app_id, 'another-app');
    assert.equal(Object.hasOwn(creates().at(-1).body, 'schema_version'), false);
  } finally { await bed.unmount(); }
});

test('real v1 snapshot still errors in v2 console: no restore, create, or overwrite', async () => {
  const legacy = { id: 'legacy-v1', site_id: 'ppt', app_id: 'training-courseware', surface: 'app',
    status: 'active', revision: 3, schema_version: 1, snapshot: { old_format: true } };
  const bed = await mount({ initialSession: legacy });
  try {
    assert.match(bed.host.textContent, /工作会话快照版本 1 与当前版本 2 不兼容/);
    assert.equal(restored.length, 0);
    await act(async () => { await workspace.ensureActive({ intent: 'attach' }); });
    consoleSnapshot = { topic: 'changed input', slides: [] };
    await bed.render();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 850)); });
    assert.equal(mutations().length, 0);
    assert.deepEqual(stored, legacy);
  } finally { await bed.unmount(); }
});
