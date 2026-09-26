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
  url: "https://ppt.oceanleo.com/workspace",
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
  "./mode-switch-gate": dataModule(`
    export function useModeSwitchFailure() {}
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
    export function openHostedSaveGate() { throw new Error("save not used in this test"); }
    export function libraryItemFromProSave(item) { return item; }
    export function reportProSaved() {}
  `),
  "../AdvancedWorkbenchShell": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function AdvancedWorkbenchShell({ adapter }) {
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

test("D1: a full deck over 20 KB is sent once through the validated snapshot channel, and shown only after its receipt", async () => {
  const draft = { format: "pptist", title: "保留这份八页稿", slides: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, elements: [{ id: `title${i}`, type: "text", content: `${i} 保留原稿 ` + "正文".repeat(2000) }] })) };
  assert.ok(JSON.stringify(draft).length > 20_000);
  globalThis.__d1EmbedBase = ORIGIN;
  globalThis.__d1Handoff = { kind: "inline", json: draft, revision: "rev-7" };
  globalThis.__d1Resolved = resolved(globalThis.__d1Handoff);
  const view = renderRoute();
  try {
    await view.render();
    const frame = view.container.querySelector("iframe");
    assert.ok(frame);
    const recorder = attachFrameRecorder(frame);
    await act(async () => { recorder.load(); recorder.ready(); });
    const restores = recorder.messages.filter(m => m.type === "recovery-restore");
    assert.equal(restores.length, 1);
    assert.deepEqual(restores[0].snapshot.payload, draft);
    assert.equal(globalThis.__d1Opened, false, "core ready must not reveal its default example deck");
    await act(async () => sendMessage(frame, { instanceId: instanceOf(frame), type: "recovery-result", recoveryId: "another-open", ok: true }));
    assert.equal(globalThis.__d1Opened, false);
    await act(async () => sendMessage(frame, { instanceId: instanceOf(frame), type: "recovery-result", recoveryId: restores[0].recoveryId, ok: true }));
    assert.equal(globalThis.__d1Opened, true);
    await act(async () => { recorder.ready(); recorder.ready(); });
    assert.equal(recorder.messages.filter(m => m.type === "init").length, 1);
    assert.equal(recorder.messages.filter(m => m.type === "recovery-restore").length, 1);
  } finally { await view.unmount(); }
});

test("D1: an oversized or refused snapshot never reveals an empty/default PPT", async () => {
  globalThis.__d1EmbedBase = ORIGIN;
  globalThis.__d1Handoff = { kind: "inline", revision: "rev-7", json: { format: "pptist", slides: [{ id: "large", elements: [{ type: "text", content: "x".repeat(4_000_001) }] }] } };
  globalThis.__d1Resolved = resolved(globalThis.__d1Handoff);
  const view = renderRoute();
  try {
    await view.render({ ...ITEM, id: "oversized", key: "oversized" });
    const frame = view.container.querySelector("iframe");
    const recorder = attachFrameRecorder(frame);
    await act(async () => { recorder.load(); recorder.ready(); recorder.ready(); });
    assert.equal(recorder.messages.filter(m => m.type === "init").length, 0);
    assert.equal(recorder.messages.filter(m => m.type === "recovery-restore").length, 0);
    assert.equal(globalThis.__d1Opened, false);
  } finally { await view.unmount(); }
});

test("D1: optional undefined fields are stripped before the bounded recovery contract", async () => {
  globalThis.__d1EmbedBase = ORIGIN;
  const draft = {
    format: "pptist",
    title: "含可选空字段的八页稿",
    slides: [{ id: "s1", elements: [{ id: "title", text: "首页", fill: undefined, lock: undefined }] }],
  };
  globalThis.__d1Handoff = { kind: "inline", revision: "rev-undefined", json: draft };
  globalThis.__d1Resolved = resolved(globalThis.__d1Handoff);
  const view = renderRoute();
  try {
    await view.render({ ...ITEM, id: "undefined-fields", key: "undefined-fields" });
    const frame = view.container.querySelector("iframe");
    const recorder = attachFrameRecorder(frame);
    await act(async () => { recorder.load(); recorder.ready(); });
    const restore = recorder.messages.find((message) => message.type === "recovery-restore");
    assert.ok(restore);
    assert.equal(Object.hasOwn(restore.snapshot.payload.slides[0].elements[0], "fill"), false);
    assert.equal(Object.hasOwn(restore.snapshot.payload.slides[0].elements[0], "lock"), false);
    await act(async () => sendMessage(frame, { instanceId: instanceOf(frame), type: "recovery-result", recoveryId: restore.recoveryId, ok: true }));
    assert.equal(globalThis.__d1Opened, true);
  } finally { await view.unmount(); }
});
