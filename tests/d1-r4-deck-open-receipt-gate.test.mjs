import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

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
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://test.dev.oceanleo.com/workspace",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLIFrameElement: window.HTMLIFrameElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MessageEvent: window.MessageEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const routeUrl = await compileModule("src/shell/advanced-routes/DeckHostedRoute.tsx", {
  "./deck-hosted-save": dataModule(`
    export async function saveHostedDeck(item, payload, siteId, revision) {
      return globalThis.__d1Save ? globalThis.__d1Save(item, payload, siteId, revision) : { ok: true, item: {...item, revisionId: "server-r8"} };
    }
  `),
  "./mode-switch-gate": dataModule(`
    export function useModeSwitchFailure() { return message => { globalThis.__d1Failure = message; }; }
    export function useModeSwitchHandoff() { return globalThis.__d1Handoff || null; }
    export function useModeSwitchReady(ready) { globalThis.__d1Opened = ready; }
  `),
  "./editor-handoff": dataModule(`
    export const ENTER_PRO_NOT_READY = "还没准备好";
    export function handoffItemKey(item) { return String(item.key || item.id || ""); }
    const resolvedByItem = new WeakMap();
    export function useEditorHandoffSource(item) {
      if (!resolvedByItem.has(item)) resolvedByItem.set(item, globalThis.__d1Resolved);
      return resolvedByItem.get(item);
    }
    export async function materializeHandoffJson(source) {
      return { ok: true, json: source.json || { format: "pptist", slides: [{ id: "s1", elements: [] }] } };
    }
    export function hostedSaveTimeoutMs() { return 1000; }
    export function openHostedSaveGate() {
      let resolve, snapshot;
      const promise = new Promise(r => { resolve = r; });
      return { saveId: "d1-save", wait: () => promise,
        acceptSnapshot(value) { snapshot = value; },
        acceptSaveResult() { resolve({ ok: true, snapshot }); } };
    }
    export function libraryItemFromProSave(item) { return item; }
    export function reportProSaved(_key, item) { globalThis.__d1Saved = item; }
  `),
  "../AdvancedWorkbenchShell": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function AdvancedWorkbenchShell({ adapter }) {
      globalThis.__d1Persistence = adapter.persistence;
      return React.createElement("div", { "data-workbench": "deck" }, adapter.stage);
    }
  `),
  "../advanced-recovery-store": dataModule(`export function advancedRecoveryKey() { return "recovery"; }`),
  "../doc-editors/deck-pptist-carrier": dataModule(`
    export const PPTIST_CARRIER_FORMAT = "pptist";
    export function deckDocumentToPptist(value) { return value; }
    export function pptistToDeckDocument(value) { return value; }
  `),
  "../doc-editors/deck-schema": dataModule(`export function normalizeDeckDocument(value) { return value; }`),
  "../doc-editors/pptx-deck-import": dataModule(`export async function importPptxDeck() { return {}; }`),
  "../editor-protocol": dataModule(`
    export const EDITOR_PROTOCOL = "oceanleo.editor.v1";
    export function isValidEditorTargetOrigin() { return true; }
    export { asHostToEditorMessage } from ${JSON.stringify(pathToFileURL(resolve("src/shell/editor-protocol.ts")).href)};
    export function buildEditorEmbedUrl(base, options) {
      const url = new URL(base);
      url.searchParams.set("instance", options.instanceId);
      return url.toString();
    }
    export function acceptEditorFrameMessage(event, gate) {
      if (event.origin !== gate.expectedOrigin || event.source !== gate.frameWindow) return null;
      return event.data && event.data.instanceId === gate.instanceId ? event.data : null;
    }
  `),
  "../editor-sandbox-origin": dataModule(`
    export function isTrustedEmbedEditorBase(value) { return value === "https://slides.oceanleo.app"; }
    export function embedEditorFrameSandbox() { return "allow-scripts"; }
  `),
  "../hosted-editor/index": dataModule(`
    export const DEFAULT_EDITOR_MODE = "normal";
    export function buildHideChromeMessage(instanceId, value) { return { type: "hide-chrome", instanceId, ...value }; }
    export function buildSetModeMessage(instanceId, mode) { return { type: "set-mode", instanceId, mode }; }
    export function buildReviewDecisionMessage(instanceId, proposalId, decision) { return { type: "review-decision", instanceId, proposalId, decision }; }
  `),
  "../hosted-editor-origins": dataModule(`
    export const HOSTED_EDITOR_ORIGINS = { find(callback) {
      const value = globalThis.__d1EmbedBase || "";
      return value && callback(value) ? value : undefined;
    } };
  `),
  "../workbench-routes": dataModule(`export function editorToolLabel() { return "幻灯片"; }`),
});
const { DeckHostedRoute } = await import(routeUrl);
const { createRoot } = await import("react-dom/client");
const { flushSync } = await import("react-dom");

const ORIGIN = "https://slides.oceanleo.app";
const ITEM = {
  id: "deck-reparse-1",
  key: "deck-reparse-1",
  title: "重新解析回归稿",
  revisionId: "rev-7",
  url: "https://files.example/deck.pptx?sig=old",
};
const HANDOFF = {
  kind: "inline",
  revision: "rev-7",
  json: { format: "pptist", slides: [{ id: "s1", elements: [{ id: "title", text: "保留的标题" }] }] },
};

function resolved(source = HANDOFF) {
  return { status: "ready", source };
}

function renderRoute() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return {
    container,
    async render(item = ITEM) {
      await act(async () => {
        root.render(React.createElement(DeckHostedRoute, {
          item,
          taskId: "task-d1",
          onClose() {},
        }));
      });
    },
    renderWithoutAct(item = ITEM) {
      flushSync(() => {
        root.render(React.createElement(DeckHostedRoute, {
          item,
          taskId: "task-d1",
          onClose() {},
        }));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function instanceOf(frame) {
  return new URL(frame.src).searchParams.get("instance");
}

function sendMessage(frame, data) {
  const event = new Event("message");
  Object.defineProperties(event, {
    origin: { value: ORIGIN },
    source: { value: frame.contentWindow },
    data: { value: data },
  });
  window.dispatchEvent(event);
}

function attachFrameRecorder(frame) {
  const messages = [];
  let loaded = false;
  Object.defineProperty(frame.contentWindow, "postMessage", {
    configurable: true,
    value(message) {
      if (loaded) messages.push(message);
    },
  });
  return {
    messages,
    load() {
      loaded = true;
      frame.dispatchEvent(new Event("load", { bubbles: false }));
    },
    ready() {
      sendMessage(frame, {
        protocol: "oceanleo.editor.v1",
        type: "ready",
        instanceId: instanceOf(frame),
      });
    },
  };
}


async function openedFixture() {
  globalThis.__d1EmbedBase = ORIGIN;
  globalThis.__d1Handoff = HANDOFF;
  globalThis.__d1Resolved = resolved(HANDOFF);
  globalThis.__d1Failure = null;
  globalThis.__d1Save = null;
  globalThis.__d1Saved = null;
  const view = renderRoute();
  await view.render({ ...ITEM });
  const frame = view.container.querySelector("iframe");
  const recorder = attachFrameRecorder(frame);
  await act(async () => { recorder.load(); recorder.ready(); });
  const opening = recorder.messages.find(m => m.type === "recovery-restore");
  assert.ok(opening);
  return { view, frame, recorder, opening, send(data) { sendMessage(frame, { instanceId: instanceOf(frame), ...data }); } };
}

test("D1 R4: before the matching draft receipt, reject dirty/content and all save/recovery paths", async () => {
  const f = await openedFixture();
  try {
    await act(async () => {
      f.send({ type: "dirty", dirty: true, revision: 23 });
      f.send({ type: "recovery-snapshot", ok: true, snapshot: { payload: { slides: [{ id: "demo" }] } } });
      f.send({ type: "review-proposal", proposal: { proposalId: "demo-edit", summary: { before: "demo", after: "changed" } } });
    });
    let p = globalThis.__d1Persistence;
    assert.equal(p.dirty, false);
    assert.equal(p.editRevision, 0);
    assert.equal(p.autoSave, false);
    assert.equal(p.recovery.ready, false);
    assert.equal(await p.recovery.capture(), null);
    assert.equal(await p.recovery.restore({ slides: [{ id: "demo" }] }), false);
    assert.equal((await p.flush()).ok, false);
    assert.equal(f.recorder.messages.filter(m => ["save-request", "recovery-capture"].includes(m.type)).length, 0);
    assert.doesNotMatch(f.view.container.textContent, /demo-edit|这条改动还没写进/);
    await act(async () => f.send({ type: "recovery-result", recoveryId: "wrong-receipt", ok: true }));
    assert.equal(globalThis.__d1Opened, false);
    await act(async () => {
      f.send({ type: "recovery-result", recoveryId: f.opening.recoveryId, ok: true });
      f.send({ type: "dirty", dirty: true, revision: 24 });
    });
    p = globalThis.__d1Persistence;
    assert.equal(globalThis.__d1Opened, true);
    assert.equal(p.dirty, true);
    assert.equal(p.editRevision, 24);
    assert.equal(p.recovery.ready, true);
    const savedDraft = { format: "pptist", slides: [{ id: "user-edited" }] };
    let saving;
    await act(async () => { saving = p.flush(); });
    await act(async () => f.send({ type: "recovery-snapshot", recoveryId: "d1-save", ok: true, snapshot: { payload: savedDraft } }));
    assert.equal((await saving).ok, true);
  } finally { await f.view.unmount(); }
});

test("D1 R4: an explicit failed opening receipt returns a reason and never enables persistence", async () => {
  const f = await openedFixture();
  try {
    await act(async () => f.send({ type: "recovery-result", recoveryId: f.opening.recoveryId, ok: false, message: "无法打开这份稿" }));
    assert.equal(globalThis.__d1Opened, false);
    assert.equal(globalThis.__d1Failure, "无法打开这份稿");
    assert.equal(globalThis.__d1Persistence.recovery.ready, false);
    assert.equal((await globalThis.__d1Persistence.flush()).ok, false);
    await act(async () => f.send({ type: "recovery-result", recoveryId: f.opening.recoveryId, ok: true }));
    assert.equal(globalThis.__d1Opened, false, "a late success cannot reverse a failed opening");
  } finally { await f.view.unmount(); }
});

test("D1 R4: a different draft revokes the old receipt and stale persistence callbacks", async () => {
  const f = await openedFixture();
  try {
    await act(async () => f.send({ type: "recovery-result", recoveryId: f.opening.recoveryId, ok: true }));
    const previous = globalThis.__d1Persistence;
    await f.view.render({ ...ITEM, id: "another-draft", key: "another-draft", revisionId: "r2" });
    assert.equal(globalThis.__d1Opened, false);
    assert.equal(globalThis.__d1Persistence.recovery.ready, false);
    assert.equal(previous.recovery.capture(), null);
    assert.equal((await previous.flush()).ok, false);
    const nextFrame = f.view.container.querySelector("iframe");
    const next = attachFrameRecorder(nextFrame);
    await act(async () => { next.load(); next.ready(); });
    const send = data => sendMessage(nextFrame, { instanceId: instanceOf(nextFrame), ...data });
    await act(async () => send({ type: "recovery-result", recoveryId: f.opening.recoveryId, ok: true }));
    assert.equal(globalThis.__d1Opened, false);
    await act(async () => send({ type: "dirty", dirty: true, revision: 91 }));
    assert.equal(globalThis.__d1Persistence.editRevision, 0);
    const opening = next.messages.find(m => m.type === "recovery-restore");
    assert.ok(opening);
    await act(async () => send({ type: "recovery-result", recoveryId: opening.recoveryId, ok: true }));
    assert.equal(globalThis.__d1Opened, true);
  } finally { await f.view.unmount(); }
});


test("D1 R5: server failure stays dirty, never acknowledges saved; later saves use the returned revision", async () => {
  const f = await openedFixture();
  try {
    await act(async () => f.send({type:"recovery-result", recoveryId:f.opening.recoveryId, ok:true}));
    await act(async () => f.send({type:"dirty", dirty:true, revision:2}));
    const attempt = async (complete) => {
      let finish;
      globalThis.__d1Save = (...args) => new Promise(resolve => { finish = value => { complete?.(...args); resolve(value); }; });
      let saving;
      await act(async () => { saving = globalThis.__d1Persistence.flush(); });
      await act(async () => f.send({type:"recovery-snapshot", recoveryId:"d1-save", ok:true, snapshot:{payload:HANDOFF.json}}));
      assert.equal(globalThis.__d1Persistence.dirty,true,"capture is not durable saving");
      assert.ok(finish);
      return {finish, saving};
    };
    let a = await attempt();
    await act(async () => { a.finish({ok:false,error:"上传失败"}); await a.saving; });
    assert.equal(globalThis.__d1Persistence.dirty,true);
    assert.equal(globalThis.__d1Saved,null);
    assert.equal(f.recorder.messages.filter(m=>m.type==="save-result"&&m.ok).length,0);
    a = await attempt(base => assert.equal(base.revisionId,"rev-7"));
    await act(async () => f.send({type:"dirty",dirty:true,revision:3}));
    await act(async () => { a.finish({ok:true,item:{...ITEM,revisionId:"server-r8"}}); await a.saving; });
    await act(async () => f.send({type:"dirty",dirty:false,revision:3}));
    assert.equal(globalThis.__d1Persistence.dirty,true,"late clean echo cannot cover a newer edit");
    assert.equal(globalThis.__d1Saved.revisionId,"server-r8");
    a = await attempt(base => assert.equal(base.revisionId,"server-r8"));
    await act(async () => { a.finish({ok:true,item:{...ITEM,revisionId:"server-r9"}}); await a.saving; });
    assert.equal(globalThis.__d1Persistence.dirty,false);
    assert.equal(globalThis.__d1Saved.revisionId,"server-r9");
    assert.equal(f.recorder.messages.filter(m=>m.type==="save-result"&&m.ok).at(-1).revision,"server-r9");
  } finally { await f.view.unmount(); }
});
