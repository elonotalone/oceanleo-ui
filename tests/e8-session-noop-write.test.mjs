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
const saveCalls = [];
let stored;
let failNext = false;
let conflictNext = false;
globalThis.fetch = async (url, init = {}) => {
  const path = url.split("?")[0];
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ path, method, body });
  let result;
  if (method === "GET") {
    result = { ok: true, data: path.endsWith("/sessions")
      ? { items: stored ? [structuredClone(stored)] : [] }
      : { session: structuredClone(stored) } };
  } else if (method === "PUT") {
    if (failNext) {
      failNext = false;
      result = { ok: false, status: 500, error: "save failed" };
    } else if (conflictNext) {
      conflictNext = false;
      result = { ok: false, status: 409, error: "conflict" };
    } else {
      assert.equal(body.revision, stored.revision);
      stored = { ...stored, snapshot: body.snapshot, schema_version: body.schema_version,
        ...(body.title !== undefined ? { title: body.title } : {}), revision: stored.revision + 1 };
      result = { ok: true, data: { session: structuredClone(stored) } };
    }
  } else {
    throw new Error(`unexpected request ${method} ${path}`);
  }
  return { json: async () => result };
};
globalThis.__e8Authed = async (...args) => (await fetch(...args)).json();
globalThis.__e8LoadDraft = () => null;
const apiUrl = await compileModule("src/lib/app-session.ts", {
  "./agent": dataModule("export const authed = (...args) => globalThis.__e8Authed(...args);"),
  "./history-events": dataModule("export function notifyHistoryChanged() {}"),
});
const providerUrl = await compileModule("src/shell/WorkspaceSession.tsx", {
  "../lib/app-session": apiUrl,
  "../lib/console-draft": dataModule(`
    export async function loadConsoleDraft() { return globalThis.__e8LoadDraft(); }
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
const { useConsoleDraft } = await import(await compileModule("src/shell/useConsoleDraft.ts", {
  "./WorkspaceSession": providerUrl,
  "../lib/console-draft": dataModule(`
    export async function loadConsoleDraft() { return null; }
    export async function clearConsoleDraft() {}
    export async function saveConsoleDraft() { throw new Error("unexpected draft save"); }
  `),
}));
const { WorkspaceSessionContext } = await import("../src/shell/workspace-session-context.ts");
const h = React.createElement;
let workspace;
let editDraft;
let draftState;
let consoleSnapshot;
const initialState = { topic: "", slides: [] };
const savedSnapshot = () => ({ slides: [{ text: "saved", style: { size: 18, bold: false } }], topic: "saved" });
const session = () => ({ id: "e8-session", site_id: "ppt", app_id: "work-report", surface: "app",
  status: "active", title: "PPT", revision: 172, schema_version: 2, snapshot: savedSnapshot(),
  created_at: "2026-09-27T00:00:00Z", last_activity_at: "2026-09-27T00:00:00Z" });
function Probe({ children }) {
  workspace = useOptionalWorkspaceSession();
  return h(WorkspaceSessionContext.Provider, { value: { ...workspace, saveSnapshot: (...args) => {
    saveCalls.push(args);
    return workspace.saveSnapshot(...args);
  } } }, children);
}
function Draft({ schemaVersion = 2 }) {
  const [state, setState] = useState(initialState);
  editDraft = setState;
  draftState = state;
  useConsoleDraft({ siteId: "ppt", appId: "work-report", state, setState, initialState,
    schemaVersion, debounceMs: 20 });
  return null;
}
const chatProps = {
  agentId: "ppt.generate", siteId: "ppt", schema: { title: "PPT", fields: [] },
  opsContent: h("div", null, "console"), enableEditorCommands: false,
  sessionSchemaVersion: 2,
  getSessionSnapshot: () => consoleSnapshot,
  onRestoreSessionSnapshot: snapshot => {
    // The runtime reconstructs fields in its own order; the server's JSON key order is irrelevant.
    consoleSnapshot = { topic: snapshot.topic, slides: snapshot.slides };
  },
};
async function mount({ child, initial = false, strict = false } = {}) {
  calls.length = 0; saveCalls.length = 0; failNext = false; conflictNext = false;
  stored = session(); consoleSnapshot = initialState;
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = async (schemaVersion = 2) => act(async () => root.render(h(strict ? React.StrictMode : React.Fragment, null,
    h(WorkspaceSessionProvider, { siteId: "ppt", appId: "work-report", initialSession: initial ? stored : null },
      h(Probe, null, child === "draft" ? h(Draft, { schemaVersion }) : child === "chat" ? h(FunctionAgentChat, chatProps) : null)))));
  await render();
  assert.equal(workspace.session?.id, stored.id, "real Provider finished hydration");
  return { render, async unmount() { await act(async () => root.unmount()); host.remove(); } };
}
const writes = () => calls.filter(call => call.method !== "GET");
async function save(snapshot, version = 2, options) {
  let result;
  await act(async () => { result = await workspace.saveSnapshot(snapshot, version, options); });
  return result;
}
const settleAutosave = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 780)); });

test("loaded snapshot returns ok and current session without a request", async () => {
  const bed = await mount();
  try {
    const result = await save(savedSnapshot(), 2, { title: "PPT" });
    assert.equal(result.ok, true);
    assert.equal(result.session.id, "e8-session");
    assert.equal(writes().length, 0);
    assert.equal(result.session.revision, 172);
  } finally { await bed.unmount(); }
});

test("object key order is irrelevant at every depth", async () => {
  const bed = await mount();
  try {
    const result = await save({ topic: "saved", slides: [{ style: { bold: false, size: 18 }, text: "saved" }] });
    assert.equal(result.ok, true);
    assert.equal(writes().length, 0);
  } finally { await bed.unmount(); }
});

for (const field of ["nested", "title", "schema", "removed", "array"]) {
  test(`real ${field} change writes exactly once and advances the confirmed baseline`, async () => {
    const bed = await mount();
    try {
      const snapshot = savedSnapshot();
      if (field === "nested") snapshot.slides[0].style.size = 19;
      if (field === "removed") delete snapshot.slides[0].style.bold;
      if (field === "array") snapshot.slides.unshift({ text: "new" });
      const version = field === "schema" ? 3 : 2;
      const options = { title: field === "title" ? "Renamed" : "PPT", intent: "output" };
      assert.equal((await save(snapshot, version, options)).ok, true);
      assert.equal(writes().length, 1);
      assert.deepEqual(writes()[0].body.snapshot, snapshot);
      assert.equal(writes()[0].body.schema_version, version);
      assert.equal(writes()[0].body.title, options.title);
      assert.equal(writes()[0].body.activity, undefined, "output keeps its default activity=true");
      assert.equal((await save(structuredClone(snapshot), version, options)).session.revision, 173);
      assert.equal(writes().length, 1, "repeat uses newly confirmed server version");
    } finally { await bed.unmount(); }
  });
}

test("failed writes never advance the confirmed baseline", async () => {
  const bed = await mount();
  try {
    const snapshot = { ...savedSnapshot(), topic: "edited" };
    failNext = true;
    assert.equal((await save(snapshot)).ok, false);
    assert.equal((await save(snapshot)).ok, true);
    assert.equal(writes().length, 2);
    assert.equal((await save(snapshot)).ok, true);
    assert.equal(writes().length, 2);
  } finally { await bed.unmount(); }
});

test("queued duplicates skip only after the first write confirms", async () => {
  const bed = await mount();
  try {
    const snapshot = { ...savedSnapshot(), topic: "edited" };
    await act(async () => {
      const results = await Promise.all([workspace.saveSnapshot(snapshot, 2), workspace.saveSnapshot(snapshot, 2)]);
      assert.ok(results.every(result => result.ok));
    });
    assert.equal(writes().length, 1);
  } finally { await bed.unmount(); }
});

test("a queued revert still writes after an earlier change confirms", async () => {
  const bed = await mount();
  try {
    await act(async () => {
      const results = await Promise.all([
        workspace.saveSnapshot({ ...savedSnapshot(), topic: "edited" }, 2),
        workspace.saveSnapshot(savedSnapshot(), 2),
      ]);
      assert.ok(results.every(result => result.ok));
    });
    assert.equal(writes().length, 2);
    assert.deepEqual(stored.snapshot, savedSnapshot());
  } finally { await bed.unmount(); }
});

test("omitting a title preserves it, but explicitly clearing it writes", async () => {
  const bed = await mount();
  try {
    assert.equal((await save(savedSnapshot())).ok, true);
    assert.equal(writes().length, 0);
    assert.equal((await save(savedSnapshot(), 2, { title: "" })).ok, true);
    assert.equal(writes().length, 1);
    assert.equal(stored.title, "");
  } finally { await bed.unmount(); }
});

test("array order remains content even when every entry is unchanged", async () => {
  const bed = await mount();
  try {
    const snapshot = { slides: [{ text: "one" }, { text: "two" }] };
    await save(snapshot);
    await save({ slides: [...snapshot.slides].reverse() });
    assert.equal(writes().length, 2);
    assert.equal(stored.snapshot.slides[0].text, "two");
  } finally { await bed.unmount(); }
});

test("mutating restored objects cannot alter the last confirmed server baseline", async () => {
  const bed = await mount();
  try {
    workspace.session.snapshot.slides[0].style.size = 30;
    assert.equal((await save(workspace.session.snapshot)).ok, true);
    assert.equal(writes().length, 1);
    assert.equal(stored.snapshot.slides[0].style.size, 30);
  } finally { await bed.unmount(); }
});

test("conflict and stale-session guards still block equal snapshots", async () => {
  const bed = await mount();
  try {
    assert.equal((await save(savedSnapshot(), 2, { expectedSessionId: "old-session" })).stale, true);
    assert.equal(writes().length, 0);
    conflictNext = true;
    assert.equal((await save({ ...savedSnapshot(), topic: "changed" })).ok, false);
    assert.equal((await save(savedSnapshot())).ok, false);
    assert.equal(writes().length, 1);
  } finally { await bed.unmount(); }
});

for (const child of ["draft", "chat"]) {
  test(`${child} restoration remains read-only under StrictMode effect replay`, async () => {
    const bed = await mount({ child, initial: true, strict: true });
    try {
      await settleAutosave();
      assert.equal(writes().length, 0);
      assert.equal(saveCalls.length, 0);
    } finally { await bed.unmount(); }
  });
  for (const initial of [false, true]) {
    test(`${child} mount after ${initial ? "injected session" : "server read"} does not schedule or send a save`, async () => {
      const bed = await mount({ child, initial });
      try {
        await settleAutosave();
        assert.equal(writes().length, 0, "opening never rewrites server content");
        assert.equal(saveCalls.length, 0, "restoration itself does not call saveSnapshot");
        await act(async () => window.dispatchEvent(new Event("pagehide")));
        assert.equal(writes().length, 0, "leaving unchanged also remains read-only");
        if (child === "draft") {
          await act(async () => editDraft({ ...draftState, topic: "user edit" }));
        } else {
          consoleSnapshot = { ...consoleSnapshot, topic: "user edit" };
          await bed.render();
        }
        await settleAutosave();
        assert.equal(writes().length, 1, "first real user change still saves");
        assert.equal(stored.snapshot.topic, "user edit");
        assert.equal(writes()[0].body.activity, false, "attach does not reorder recent tasks");
      } finally { await bed.unmount(); }
    });
  }
}

test("a same-value render during debounce does not discard pending user input", async () => {
  const bed = await mount({ child: "draft", initial: true });
  try {
    await act(async () => editDraft({ ...draftState, topic: "pending user edit" }));
    await act(async () => editDraft(structuredClone(draftState)));
    await settleAutosave();
    assert.equal(writes().length, 1);
    assert.equal(stored.snapshot.topic, "pending user edit");
  } finally { await bed.unmount(); }
});

test("a draft schema version change still saves when its state is unchanged", async () => {
  const bed = await mount({ child: "draft", initial: true });
  try {
    await bed.render(3);
    await settleAutosave();
    assert.equal(writes().length, 1);
    assert.equal(stored.schema_version, 3);
    assert.deepEqual(stored.snapshot, savedSnapshot());
  } finally { await bed.unmount(); }
});
