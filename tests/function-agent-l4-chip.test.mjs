/**
 * W02 · R4：`FunctionAgentChat` 必须听 `oceanleo-l4-chip`。
 *
 * AgentConsole 点 chip 派这个事件。AgentChat 已听。13 件编辑器的操作台形态
 * 走的是 FunctionAgentChat——不听的话，人点了快捷动作，主聊没反应。
 *
 * 闸锁的是产品行为（A-48）：chip 发了之后，界面必须切到 agent，并且那句 prompt
 * 真的进了发送路径。只在源码里留事件名不算。把监听改成空转或换事件名，本文件红。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

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
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://grid.oceanleo.com/workspace",
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

const chatUrl = await compileModule("src/shell/FunctionAgentChat.tsx", {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
  "./LeoComposer": dataModule("export function LeoComposer(){ return null; }"),
  "./AgentProgress": dataModule("export function AgentProgress(){ return null; }"),
  "./RestartDraftButton": dataModule("export function RestartDraftButton(){ return null; }"),
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
});

const { FunctionAgentChat } = await import(chatUrl);

const CHIP = "把这一列清洗一下";

const schema = {
  agentId: "grid.fn",
  title: "表格",
  fields: [],
  actions: [],
};

function ChatBed() {
  return React.createElement(FunctionAgentChat, {
    agentId: "grid.fn",
    siteId: "grid",
    schema,
    opsContent: React.createElement("div", { "data-ops": "1" }, "ops"),
    showOps: true,
    defaultTab: "ops",
    enableEditorCommands: false,
  });
}

async function mountChat() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ChatBed));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("chip 发了，操作台形态的主聊必须切到 agent 并把那句话发出去", async () => {
  const panel = await mountChat();
  try {
    assert.equal(
      panel.container.querySelector('[data-fn-agent-tab="ops"]')?.getAttribute("data-fn-agent-tab"),
      "ops",
      "本例的前提：人正看着操作台，不是已经开着对话",
    );
    await act(async () => {
      window.dispatchEvent(
        new window.CustomEvent("oceanleo-l4-chip", { detail: { prompt: CHIP } }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(
      panel.container.querySelector('[data-fn-agent-tab="agent"]')?.getAttribute("data-fn-agent-tab"),
      "agent",
      "点了 chip 必须切到 agent 形态，人才能看见对话",
    );
    const text = panel.container.textContent || "";
    assert.match(
      text,
      /登录后即可使用 agent/,
      "必须真的走了发送路径（测试环境没登录，产品会把这次发送收成登录提示）。监听空转或换事件名时这条红。",
    );
  } finally {
    await panel.unmount();
  }
});

test("FunctionAgentChat 源码里听的就是这个事件名（辅闸）", () => {
  const source = readFileSync(
    new URL("../src/shell/FunctionAgentChat.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /window\.addEventListener\("oceanleo-l4-chip"/);
  assert.match(source, /sendRef\.current\(prompt\)/);
  assert.match(source, /setTab\("agent"\)/);
});
