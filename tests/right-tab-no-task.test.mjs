/**
 * 右栏页签切换不得建档。
 *
 * 用户进 app 后只点灵感 / 生成 / 素材库 / 我的库 / 云端浏览器，
 * FunctionAgentChat 会把 `__oceanleo_ui.right_tab` 写进快照并 debounce 保存。
 * 这条路径必须显式 `intent: "attach"`；内核返回 `{ ok: true, deferred: true }`
 * 时只写草稿、不弹错、并且更新 baseline，同一页签再渲染不会连写。
 */
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
  url: "https://image.oceanleo.com/workspace/poster",
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
  "./WorkspaceSession": dataModule(`
    export function useOptionalWorkspaceSession() {
      return globalThis.__rightTabWorkspace || null;
    }
  `),
  "./workspace-runtime-hydration": dataModule(`
    export function useWorkspaceRuntimeHydration() {
      return globalThis.__rightTabHydration || null;
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

const draftUrl = await compileModule("src/shell/useConsoleDraft.ts", {
  "./WorkspaceSession": dataModule(`
    export function useOptionalWorkspaceSession() {
      return globalThis.__rightTabWorkspace || null;
    }
  `),
  "../lib/console-draft": dataModule(`
    export async function loadConsoleDraft() { return null; }
    export async function saveConsoleDraft(siteId, appId, state) {
      globalThis.__consoleDraftWrites.push({ siteId, appId, state });
    }
    export async function clearConsoleDraft() {}
  `),
});

const { FunctionAgentChat } = await import(chatUrl);
const { useConsoleDraft } = await import(draftUrl);
globalThis.__agentCreateTaskCalls = [];

const schema = {
  agentId: "image.poster",
  title: "海报生成",
  fields: [{ key: "prompt", label: "提示词" }],
};

function makeWorkspace(saveImpl) {
  const calls = [];
  const ensureActiveCalls = [];
  const artifactContextCalls = [];
  const bindTaskCalls = [];
  const workspace = {
    mode: "workspace",
    siteId: "image",
    appId: "poster",
    appTitle: "海报生成",
    availability: "ready",
    readOnly: false,
    session: null,
    sessionId: null,
    taskId: null,
    error: null,
    ensureActiveCalls,
    artifactContextCalls,
    bindTaskCalls,
    async saveSnapshot(snapshot, schemaVersion, options) {
      calls.push({
        snapshot,
        schemaVersion,
        options: options ? { ...options } : options,
      });
      return saveImpl
        ? saveImpl(snapshot, schemaVersion, options)
        : { ok: true, deferred: true };
    },
    async ensureActive(options) {
      ensureActiveCalls.push(options ? { ...options } : options);
      if (options?.intent === "output") {
        return { id: "sess-output" };
      }
      return null;
    },
    async artifactContext(title) {
      artifactContextCalls.push(title);
      return { sessionId: "should-not-create" };
    },
    async bindTask(taskId, title) {
      bindTaskCalls.push({ taskId, title });
      return workspace.session;
    },
    async touch() {
      return workspace.session;
    },
  };
  return { workspace, calls, ensureActiveCalls, artifactContextCalls, bindTaskCalls };
}

function makeHydration() {
  const hydration = {
    appInitialized: true,
    snapshotSharedUi() {
      return { right_tab: globalThis.__rightTab };
    },
    restoreSharedUi() {},
    markRuntimeReady() {},
    registerBeforeLeave(callback) {
      globalThis.__rightTabBeforeLeave = callback;
    },
  };
  return hydration;
}

async function mount(node) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    async rerender(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function ChatBed() {
  const [, setTick] = useState(0);
  globalThis.__rightTabRerender = () => setTick((value) => value + 1);
  return React.createElement(FunctionAgentChat, {
    agentId: "image.poster",
    siteId: "image",
    schema,
    opsContent: React.createElement("div", { "data-ops": "1" }, "ops"),
    showOps: true,
    defaultTab: "ops",
    enableEditorCommands: false,
    manageSessionSnapshot: true,
    getSessionSnapshot: () => ({ prompt: "生成一张海报" }),
    onRestoreSessionSnapshot() {},
    appLabel: "海报生成",
  });
}

async function settle(ms = 0) {
  await act(async () => {
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    } else {
      await Promise.resolve();
      await Promise.resolve();
    }
  });
}

function visibleErrors(container) {
  return [...container.querySelectorAll("p")].map((node) => node.textContent || "");
}

test("只切换右栏页签时 saveSnapshot 带 attach，deferred 不报错且不连写", async () => {
  const { workspace, calls } = makeWorkspace();
  globalThis.__rightTabWorkspace = workspace;
  globalThis.__rightTabHydration = makeHydration();
  globalThis.__rightTab = "template";
  globalThis.__rightTabBeforeLeave = null;

  const panel = await mount(React.createElement(ChatBed));
  try {
    await settle();
    assert.equal(calls.length, 0, "初值页签不得触发保存");

    globalThis.__rightTab = "materials";
    await act(async () => {
      globalThis.__rightTabRerender();
    });
    await settle(850);

    assert.equal(calls.length, 1, "页签从 template 切到 materials 只保存一次");
    assert.equal(calls[0].options?.intent, "attach");
    assert.equal(calls[0].snapshot?.__oceanleo_ui?.right_tab, "materials");
    assert.equal(
      visibleErrors(panel.container).some((text) =>
        /未保存至我的任务|当前工作保存失败/.test(text),
      ),
      false,
    );

    await act(async () => {
      globalThis.__rightTabRerender();
      globalThis.__rightTabRerender();
      globalThis.__rightTabRerender();
    });
    await settle(850);
    assert.equal(
      calls.length,
      1,
      "baseline 更新后，同一页签再渲染不得再写",
    );

    globalThis.__rightTab = "template";
    await act(async () => {
      globalThis.__rightTabRerender();
    });
    await settle(850);
    assert.equal(calls.length, 2, "切回 template 是新快照，允许再写一次");
    assert.equal(calls[1].options?.intent, "attach");
    assert.equal(calls[1].snapshot?.__oceanleo_ui?.right_tab, "template");

    await act(async () => {
      globalThis.__rightTabRerender();
    });
    await settle(850);
    assert.ok(
      calls.length <= 2,
      "切回来之后同一页签不得连写两次以上",
    );
  } finally {
    await panel.unmount();
    delete globalThis.__rightTabWorkspace;
    delete globalThis.__rightTabHydration;
    delete globalThis.__rightTabRerender;
    delete globalThis.__rightTabBeforeLeave;
  }
});

test("重新开始冲刷把 deferred 当成功，不弹未保存至我的任务", async () => {
  const { workspace, calls } = makeWorkspace();
  globalThis.__rightTabWorkspace = workspace;
  globalThis.__rightTabHydration = makeHydration();
  globalThis.__rightTab = "template";
  globalThis.__rightTabBeforeLeave = null;

  const panel = await mount(React.createElement(ChatBed));
  try {
    await settle();
    globalThis.__rightTab = "materials";
    await act(async () => {
      globalThis.__rightTabRerender();
    });
    assert.equal(typeof globalThis.__rightTabBeforeLeave, "function");

    let flushed = false;
    await act(async () => {
      flushed = await globalThis.__rightTabBeforeLeave();
    });

    assert.equal(flushed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options?.intent, "attach");
    assert.equal(
      visibleErrors(panel.container).some((text) =>
        /未保存至我的任务|当前工作保存失败/.test(text),
      ),
      false,
    );

    await settle(850);
    assert.equal(
      calls.length,
      1,
      "restart 冲刷已更新 baseline，debounce 不得再写一次",
    );
  } finally {
    await panel.unmount();
    delete globalThis.__rightTabWorkspace;
    delete globalThis.__rightTabHydration;
    delete globalThis.__rightTabRerender;
    delete globalThis.__rightTabBeforeLeave;
  }
});

function DraftBed() {
  const [state, setState] = useState({ prompt: "" });
  const draft = useConsoleDraft({
    siteId: "image",
    appId: "poster",
    state,
    setState,
    initialState: { prompt: "" },
    debounceMs: 20,
    sessionTitle: "海报生成",
  });
  globalThis.__draftFlush = draft.flush;
  globalThis.__setDraftState = setState;
  return null;
}

test("useConsoleDraft 保存同样 attach，deferred 不再走草稿降级", async () => {
  globalThis.__consoleDraftWrites = [];
  const { workspace, calls } = makeWorkspace(() => ({
    ok: true,
    deferred: true,
    unavailable: true,
  }));
  globalThis.__rightTabWorkspace = workspace;

  const panel = await mount(React.createElement(DraftBed));
  try {
    await settle(30);
    await act(async () => {
      globalThis.__setDraftState({ prompt: "生成一张海报" });
    });
    await act(async () => {
      globalThis.__draftFlush();
      await Promise.resolve();
      await Promise.resolve();
    });
    await settle(50);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].options?.intent, "attach");
    assert.equal(
      globalThis.__consoleDraftWrites.length,
      0,
      "deferred 已由内核写入草稿，不得再走 saveConsoleDraft",
    );
  } finally {
    await panel.unmount();
    delete globalThis.__rightTabWorkspace;
    delete globalThis.__draftFlush;
    delete globalThis.__setDraftState;
    delete globalThis.__consoleDraftWrites;
  }
});

const CHIP = "把这一列清洗一下";

function AgentSendBed() {
  return React.createElement(FunctionAgentChat, {
    agentId: "image.poster",
    siteId: "image",
    schema,
    opsContent: React.createElement("div", { "data-ops": "1" }, "ops"),
    showOps: true,
    defaultTab: "agent",
    enableEditorCommands: false,
    manageSessionSnapshot: false,
    appLabel: "海报生成",
  });
}

function sessionCreatePosts(workspace) {
  return [
    ...workspace.artifactContextCalls,
    ...workspace.ensureActiveCalls.filter((call) => call?.intent === "output"),
  ];
}

test("发出第一句时不产生 POST /v1/agent/sessions", async () => {
  globalThis.__agentCreateTaskCalls = [];
  globalThis.__agentCreateTask = async () => ({
    ok: true,
    data: { task_id: "task-1" },
  });
  globalThis.__agentGetTask = async () => ({
    ok: true,
    data: {
      task: { status: "running" },
      messages: [{ id: 1, role: "user", kind: "text", content: CHIP }],
    },
  });

  const { workspace } = makeWorkspace();
  globalThis.__rightTabWorkspace = workspace;
  globalThis.__rightTabHydration = makeHydration();
  globalThis.__rightTab = "template";

  const panel = await mount(React.createElement(AgentSendBed));
  try {
    await settle();
    await act(async () => {
      window.dispatchEvent(
        new window.CustomEvent("oceanleo-l4-chip", { detail: { prompt: CHIP } }),
      );
    });
    await settle(250);

    assert.equal(globalThis.__agentCreateTaskCalls.length, 1, "必须真的发出去");
    assert.equal(
      globalThis.__agentCreateTaskCalls[0].sessionId,
      undefined,
      "没有会话时 createTask 以 undefined 发送",
    );
    assert.equal(workspace.artifactContextCalls.length, 0);
    assert.deepEqual(
      workspace.ensureActiveCalls.map((call) => call?.intent),
      ["attach"],
    );
    assert.equal(
      sessionCreatePosts(workspace).length,
      0,
      "发出第一句不得走 artifactContext / output，即不产生 POST /v1/agent/sessions",
    );
  } finally {
    await panel.unmount();
    delete globalThis.__rightTabWorkspace;
    delete globalThis.__rightTabHydration;
    delete globalThis.__agentCreateTask;
    delete globalThis.__agentGetTask;
    globalThis.__agentCreateTaskCalls = [];
  }
});

test("首条 assistant 消息到达后产生且只产生一次建档", async () => {
  globalThis.__agentCreateTaskCalls = [];
  let phase = "user";
  const userMessage = { id: 1, role: "user", kind: "text", content: CHIP };
  globalThis.__agentCreateTask = async () => ({
    ok: true,
    data: { task_id: "task-1" },
  });
  globalThis.__agentGetTask = async () => {
    const messages = [userMessage];
    if (phase !== "user") {
      messages.push({
        id: 2,
        role: "assistant",
        kind: "text",
        content: "先把这一列的空值去掉。",
      });
    }
    if (phase === "second-assistant") {
      messages.push({
        id: 3,
        role: "assistant",
        kind: "text",
        content: "再把重复项合并。",
      });
    }
    return {
      ok: true,
      data: { task: { status: "running" }, messages },
    };
  };

  const { workspace } = makeWorkspace();
  globalThis.__rightTabWorkspace = workspace;
  globalThis.__rightTabHydration = makeHydration();
  globalThis.__rightTab = "template";

  const panel = await mount(React.createElement(AgentSendBed));
  try {
    await settle();
    await act(async () => {
      window.dispatchEvent(
        new window.CustomEvent("oceanleo-l4-chip", { detail: { prompt: CHIP } }),
      );
    });
    await settle(250);
    assert.equal(sessionCreatePosts(workspace).length, 0);

    phase = "first-assistant";
    await settle(600);
    const outputCalls = workspace.ensureActiveCalls.filter(
      (call) => call?.intent === "output",
    );
    assert.equal(outputCalls.length, 1, "首条 assistant 到达后只建档一次");
    assert.equal(outputCalls[0].title, CHIP);

    phase = "second-assistant";
    await settle(600);
    assert.equal(
      workspace.ensureActiveCalls.filter((call) => call?.intent === "output")
        .length,
      1,
      "同一 task 后续 assistant 不得再建档",
    );
  } finally {
    await panel.unmount();
    delete globalThis.__rightTabWorkspace;
    delete globalThis.__rightTabHydration;
    delete globalThis.__agentCreateTask;
    delete globalThis.__agentGetTask;
    globalThis.__agentCreateTaskCalls = [];
  }
});
