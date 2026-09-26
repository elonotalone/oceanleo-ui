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
  "./deck-hosted-save": dataModule(`export async function saveHostedDeck() { throw new Error("unexpected durable save in an opening test"); }`),

  "./mode-switch-gate": dataModule(`
    export function useModeSwitchFailure() {}
    export function useModeSwitchHandoff() { return globalThis.__g4Handoff || null; }
    export function useModeSwitchReady() {}
  `),
  "./editor-handoff": dataModule(`
    export const ENTER_PRO_NOT_READY = "还没准备好";
    export function handoffItemKey(item) { return String(item.key || item.id || ""); }
    const resolvedByItem = new WeakMap();
    export function useEditorHandoffSource(item) {
      if (!resolvedByItem.has(item)) resolvedByItem.set(item, globalThis.__g4Resolved);
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
    export function asHostToEditorMessage(value) { return value; }
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
      const value = globalThis.__g4EmbedBase || "";
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
          taskId: "task-g4",
          onClose() {},
        }));
      });
    },
    renderWithoutAct(item = ITEM) {
      flushSync(() => {
        root.render(React.createElement(DeckHostedRoute, {
          item,
          taskId: "task-g4",
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

test("G4: 同一 handoff 的重新解析不卸载 PPTist，也不重发稿件", async () => {
  globalThis.__g4EmbedBase = ORIGIN;
  globalThis.__g4Handoff = HANDOFF;
  globalThis.__g4Resolved = resolved();
  const view = renderRoute();
  try {
    await view.render();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
    const firstFrame = view.container.querySelector("iframe");
    assert.ok(firstFrame, "初次读稿成功后应挂载 PPTist iframe");
    const first = attachFrameRecorder(firstFrame);
    await act(async () => {
      first.load();
      first.ready();
    });
    const initialMessages = first.messages.filter((message) => message.type === "recovery-restore");
    assert.equal(initialMessages.length, 1, "首个 ready 只应收到一次稿件");

    // 模拟签名刷新：resolved 外壳对象变了，但 handoff、素材 revision 和内容没有变。
    globalThis.__g4Resolved = resolved({ ...HANDOFF });
    await act(async () => {
      view.renderWithoutAct({ ...ITEM });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {});
    const secondFrame = view.container.querySelector("iframe");
    assert.equal(secondFrame, firstFrame, "内容身份未变时不应卸下已加载 iframe");
    assert.equal(
      first.messages.filter((message) => message.type === "recovery-restore").length,
      1,
      "重新解析不能把用户未保存的稿件重新覆盖一遍",
    );
  } finally {
    await view.unmount();
  }
});

test("G4: 没有托管嵌入地址时舞台给出可行动的人话", async () => {
  globalThis.__g4EmbedBase = "";
  globalThis.__g4Handoff = HANDOFF;
  globalThis.__g4Resolved = resolved();
  const view = renderRoute();
  try {
    await view.render();
    await act(async () => {});
    await new Promise((resolve) => setTimeout(resolve, 25));
    const text = view.container.textContent || "";
    assert.match(text, /专业编辑器暂时打不开/);
    assert.match(text, /普通编辑/);
    assert.doesNotMatch(text, /正在读取演示文稿/);
    assert.doesNotMatch(text, /托管地址未放行/);
  } finally {
    await view.unmount();
  }
});

test("G4: 内容 revision 变化时新 iframe 等自己的 ready 后才收稿", async () => {
  globalThis.__g4EmbedBase = ORIGIN;
  globalThis.__g4Handoff = HANDOFF;
  globalThis.__g4Resolved = resolved();
  const view = renderRoute();
  try {
    await view.render();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
    const firstFrame = view.container.querySelector("iframe");
    assert.ok(firstFrame);
    const first = attachFrameRecorder(firstFrame);
    await act(async () => {
      first.load();
      first.ready();
    });
    const nextItem = { ...ITEM, revisionId: "rev-8" };
    globalThis.__g4Resolved = resolved({
      ...HANDOFF,
      revision: "rev-8",
      json: { ...HANDOFF.json, slides: [{ id: "s2", elements: [{ id: "title", text: "第二版" }] }] },
    });
    await act(async () => {
      view.renderWithoutAct(nextItem);
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
    const secondFrame = view.container.querySelector("iframe");
    assert.ok(secondFrame);
    assert.notEqual(secondFrame, firstFrame);
    const second = attachFrameRecorder(secondFrame);
    assert.equal(second.messages.length, 0, "新 iframe 未 ready 前不得收到消息");
    await act(async () => {
      second.load();
      second.ready();
    });
    assert.equal(second.messages.filter((message) => message.type === "recovery-restore").length, 1);
  } finally {
    await view.unmount();
  }
});
