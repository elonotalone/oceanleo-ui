// ============================================================================
// 打开旧对话 / 素材，右边不再自己跳到云端浏览器（regression-audit-0924 · P7）
// ----------------------------------------------------------------------------
// 操作员看到的：点开一份网站素材或一段旧对话，右边自己切到「云端浏览器」。
// 根因：对话历史里存着 agent 当时发过的「打开浏览器」回执（ui_action），页面一载入
// 就把最新那条当新指令重放；老后端兼容逻辑还会因为历史里有 browse 工具行、或助手
// 说过「接管浏览器」而强开浏览器。上一轮的补丁要等到「某次拉取没有新消息」才认定
// 历史，agent 一直在出字时新来的回执也会被当历史吞掉。
//
// 规则：本页载入时库里已有的回执是历史，只显示不执行；本页看着到来的回执才执行；
// 本页自己刚建的对话没有历史。这里挂真的 AgentChat 与 FunctionAgentChat，网关换成
// 内存假件，看右边画布和页面事件实际收到了什么。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test, { mock } from "node:test";

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
  url: "https://ppt.oceanleo.com/tasks/t1",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  SVGElement: window.SVGElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.Element.prototype.scrollTo = function scrollTo() {};
window.Element.prototype.scrollIntoView = function scrollIntoView() {};
globalThis.React = React;

const { createRoot } = await import("react-dom/client");
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

// ---------------------------------------------------------------------------
// 内存网关：每段对话一份消息表；每次 getTask 都给新对象（就像每次重新 JSON.parse）。
// createTask 成功时照 `onCreate` 建出新对话，模拟 agent 在第一次拉取前就已发出回执。
// ---------------------------------------------------------------------------

function makeGateway(threads, { status = "done" } = {}) {
  const state = {
    status,
    threads: Object.fromEntries(
      Object.entries(threads).map(([id, rows]) => [id, rows.map((row) => ({ ...row }))]),
    ),
    onCreate: null,
    calls: [],
  };
  const copy = (message) => ({
    ...message,
    ...(message.meta ? { meta: JSON.parse(JSON.stringify(message.meta)) } : {}),
  });
  state.api = {
    async createTask(body) {
      state.calls.push({ kind: "createTask", body });
      if (!state.onCreate) return { ok: false, status: 500, error: "not in this bench" };
      const { taskId, messages } = state.onCreate;
      state.threads[taskId] = messages.map((row) => ({ ...row }));
      state.status = "running";
      return { ok: true, data: { task_id: taskId, status: "running" } };
    },
    getTask(id) {
      state.calls.push({ kind: "getTask", id });
      return Promise.resolve({
        ok: true,
        data: {
          task: { id, status: state.status, site_id: "ppt", title: "对话" },
          messages: (state.threads[id] || []).map(copy),
          artifacts: [],
        },
      });
    },
    async followUp(id) {
      return { ok: true, data: { task_id: id, status: "running" } };
    },
    async stopTask(id) {
      return { ok: true, data: { task_id: id, status: "stopped" } };
    },
  };
  return state;
}

const gatewayModule = (realUrl) =>
  dataModule(`
    ${realUrl ? `export * from ${JSON.stringify(realUrl)};` : ""}
    const gw = () => globalThis.__p7Gateway.api;
    export function createTask(body) { return gw().createTask(body); }
    export function getTask(id, options) { return gw().getTask(id, options); }
    export function followUp(id, prompt) { return gw().followUp(id, prompt); }
    export function stopTask(id) { return gw().stopTask(id); }
    export async function branchTask() { return { ok: false, error: "stub" }; }
    export async function reportEditorCommandResult() { return { ok: true }; }
  `);

const plainUseUI = dataModule(
  "export function useUI(){ return (zh, vars) => String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }",
);

const textBubble = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AgentTranscriptBubble(props) {
    return jsx("div", { "data-p7-id": String(props.message.id), children: props.message.content || "" });
  }
  export function agentArtifactLabels(){ return {}; }
`);

const workspaceActionsUrl = await compileModule("src/shell/workspace-actions.ts", {}, {
  missingPackageStub: lazyStub,
});

// ---------------------------------------------------------------------------
// AgentChat（任务页 / 素材打开的对话）：右边画布换成记录件，记下每次收到的
// `active`（当前在哪一栏）与 `action`（要执行的回执）。
// ---------------------------------------------------------------------------

const realAgentLibUrl = await compileModule("src/lib/agent.ts", {}, {
  missingPackageStub: lazyStub,
});

const agentChatUrl = await compileModule(
  "src/shell/AgentChat.tsx",
  {
    "../i18n/ui/useUI": plainUseUI,
    "next/navigation": dataModule(
      "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
        "export function useSearchParams(){ return new URLSearchParams(); }\n" +
        "export function usePathname(){ return '/tasks/t1'; }",
    ),
    "../lib/agent": gatewayModule(realAgentLibUrl),
    "./workspace-actions": workspaceActionsUrl,
    "./AgentTranscriptBubble": textBubble,
    "./AgentProgress": dataModule("export function AgentProgress(){ return null; }"),
    "./WorkspaceSession": dataModule(`
      export function useRegisterWorkspaceSessionSchemaVersion() {} export function useOptionalWorkspaceSession(){ return null; }
      export function WorkspaceSessionProvider(props){ return props.children; }
    `),
    "./SplitWorkspace": dataModule(`
      import { jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
      export function SplitWorkspace(props) { return jsxs("div", { children: [props.left, props.right] }); }
    `),
    "./RestartDraftButton": dataModule("export function RestartDraftButton(){ return null; }"),
    "./CloudBrowserPanel": dataModule("export function CloudBrowserPanel(){ return null; }"),
    "./ResultCanvas": dataModule(`
      export function ResultCanvas(props) {
        (globalThis.__p7Canvas ||= []).push({
          active: props.active,
          action: props.action ? { nonce: props.action.nonce, tab: props.action.action.tab } : null,
        });
        return null;
      }
      export function CanvasEmpty(){ return null; }
      export function CanvasSubTabs(){ return null; }
    `),
    "./ArtifactRenderer": dataModule(
      "export function ArtifactRenderer(){ return null; }\nexport function artifactToLibraryItem(){ return {}; }",
    ),
    "./MaterialLibrary": dataModule("export function MaterialLibrary(){ return null; }"),
    "./HumanHandoffButton": dataModule("export function HumanHandoffButton(){ return null; }"),
    "./HumanHandoffStatus": dataModule("export function HumanHandoffStatus(){ return null; }"),
    "./quick-actions": dataModule("export function QuickActionChips(){ return null; }"),
    "./LeoComposer": dataModule(`
      import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
      export function LeoComposer(props) {
        globalThis.__p7Composer = props;
        return jsx("textarea", { "data-composer": true, readOnly: true });
      }
    `),
    "./FunctionAgentChat": dataModule(`
      export function EditorCommandNotes(){ return null; }
      export function useEditorCommandBridge(){
        return { contextFor: () => "", pending: null, busy: false, notes: [], card: null, noteUserTurn(){}, noteOwnTask(){}, ingest(){} };
      }
    `),
    "./agent-review": dataModule(`
      export function AgentReviewPanel(){ return null; }
      export function assembleAgentEditorContext(){ return ""; }
      export function createReviewGatedReader(){ return null; }
      export const hostReviewSession = {};
      export function installAgentReviewGate(){}
      export function installSelectionBridge(){}
      export function readAgentSelection(){ return null; }
      export function readMentionCatalog(){ return []; }
      export function refreshAgentSelectionFromDom(){}
      export function useHostReviewActions(){ return { busy: false, accept(){}, reject(){}, rollback(){} }; }
    `),
    "./plugin-command": dataModule("export function currentPluginCommandSurface(){ return null; }"),
    "./PromptHighlightArea": dataModule(`
      import { createElement, forwardRef } from "${reactUrl}";
      export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
        return createElement("textarea", { placeholder: props.placeholder, readOnly: true });
      });
      export const TemplateFillArea = PromptHighlightArea;
      export function templateSegments(){ return []; }
      export function highlightSegments(){ return []; }
      export function stripPromptPlaceholders(text){ return text; }
    `),
  },
  { missingPackageStub: lazyStub },
);

// ---------------------------------------------------------------------------
// FunctionAgentChat（编辑器左栏）：回执经真的 workspace-actions 发成页面事件。
// ---------------------------------------------------------------------------

const functionChatUrl = await compileModule(
  "src/shell/FunctionAgentChat.tsx",
  {
    "../i18n/ui/useUI": plainUseUI,
    "./LeoComposer": dataModule(`
      import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
      export function LeoComposer() {
        return jsx("textarea", { "data-composer": true, readOnly: true });
      }
    `),
    "./AgentProgress": dataModule("export function AgentProgress(){ return null; }"),
    "./RestartDraftButton": dataModule("export function RestartDraftButton(){ return null; }"),
    "./OperatorRemark": dataModule(`
      export function OperatorRemarkField(){ return null; }
      export function useOperatorRemark(){ return { remark: "", setRemark(){} }; }
    `),
    "./AgentTranscriptBubble": textBubble,
    "./useAttachments": dataModule(`
      export function useAttachments() {
        return {
          attachments: [], composerAttachments: [], handleAttachFiles() {}, addReady() {},
          restoreReady() {}, removeAttachment() {}, ready: () => [], uploading: false, clear() {},
        };
      }
    `),
    "./WorkspaceSession": dataModule("export function useRegisterWorkspaceSessionSchemaVersion() {} export function useOptionalWorkspaceSession(){ return null; }"),
    "./workspace-runtime-hydration": dataModule(
      "export function useWorkspaceRuntimeHydration(){ return null; }",
    ),
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
    "../lib/agent": gatewayModule(null),
    "./workspace-actions": workspaceActionsUrl,
    "../lib/operator-remark": dataModule(
      "export function appendOperatorRemark(prompt) { return prompt; }",
    ),
    "./agent-review/surface": dataModule("export function readAgentCommandSurface() { return null; }"),
    "./agent-review/dock": dataModule("export function AgentReviewDock() { return null; }"),
    "./agent-review/selection-bridge": dataModule(
      "export function assembleAgentEditorContext() { return null; }",
    ),
    "./agent-review/inbox": dataModule(`
      export function readAgentSelection() { return null; }
      export function readMentionCatalog() { return []; }
    `),
    "./agent-review/selection-live": dataModule("export function refreshAgentSelectionFromDom() {}"),
    "./agent-review/install": dataModule(`
      export function installAgentReviewGate() {}
      export function installSelectionBridge() {}
    `),
  },
  { missingPackageStub: lazyStub },
);

const { AgentChat } = await import(agentChatUrl);
const { FunctionAgentChat } = await import(functionChatUrl);
const { WORKSPACE_ACTION_EVENT } = await import(workspaceActionsUrl);

// ---------------------------------------------------------------------------
// 假时钟与挂载
// ---------------------------------------------------------------------------

const T0 = 1_760_000_000_000;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
}

async function advance(ms, step = 25) {
  for (let done = 0; done < ms; done += step) {
    await act(async () => {
      mock.timers.tick(Math.min(step, ms - done));
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    });
  }
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  await flush();
  return {
    host,
    async render(next) {
      await act(async () => {
        root.render(next);
      });
      await flush();
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function withClock(fn) {
  return async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: T0 });
    globalThis.__p7Canvas = [];
    const events = [];
    const onEvent = (event) =>
      events.push({ nonce: event.detail.nonce, tab: event.detail.action.tab });
    window.addEventListener(WORKSPACE_ACTION_EVENT, onEvent);
    try {
      await fn(events);
    } finally {
      window.removeEventListener(WORKSPACE_ACTION_EVENT, onEvent);
      mock.timers.reset();
      delete globalThis.__p7Gateway;
      delete globalThis.__p7Composer;
      delete globalThis.__p7Canvas;
    }
  };
}

const receipt = (id, tab = "browser") => ({
  id,
  role: "assistant",
  kind: "ui_action",
  content: "open_panel",
  meta: { verified: true, workspace_action: { version: 1, tab } },
});

// 一段做过网页登录的旧对话：browse 工具行、签过名的「打开浏览器」回执、助手请人接管。
const BROWSED_THREAD = [
  { id: 1, role: "user", kind: "text", content: "帮我登录后台看看数据" },
  { id: 2, role: "assistant", kind: "step", content: "打开网页", meta: { tool: "browse" } },
  receipt(3),
  {
    id: 4,
    role: "assistant",
    kind: "text",
    content: "需要你接管浏览器完成登录验证码。",
    meta: { done: true },
  },
];

const canvasActions = () => globalThis.__p7Canvas.filter((entry) => entry.action);
const lastCanvas = () => globalThis.__p7Canvas.at(-1);

// ===========================================================================
// AgentChat
// ===========================================================================

test(
  "AgentChat：打开旧对话，历史里的浏览器回执、browse 工具行、「接管浏览器」都不再切到云端浏览器",
  withClock(async () => {
    globalThis.__p7Gateway = makeGateway({ t1: BROWSED_THREAD });
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t1", siteId: "ppt", mode: "agent" }),
    );
    try {
      assert.ok(view.host.textContent.includes("接管浏览器"), "对话应已载入");
      await advance(3000);
      assert.ok(globalThis.__p7Canvas.length > 0, "右边画布应已渲染");
      assert.deepEqual(canvasActions(), [], "历史回执不该变成新指令");
      assert.ok(
        globalThis.__p7Canvas.every((entry) => entry.active !== "browser"),
        "右边不该切到云端浏览器",
      );
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "AgentChat：对话还在跑、agent 一直在出字，这期间新来的浏览器回执照样执行",
  withClock(async () => {
    const gateway = makeGateway({ t1: BROWSED_THREAD }, { status: "running" });
    globalThis.__p7Gateway = gateway;
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t1", siteId: "ppt", mode: "agent" }),
    );
    try {
      await advance(600);
      assert.deepEqual(canvasActions(), [], "载入时的历史回执不执行");
      gateway.threads.t1.push({ id: 10, role: "assistant", kind: "text", content: "好的，" });
      await advance(600);
      gateway.threads.t1.push(receipt(11));
      await advance(600);
      gateway.threads.t1.push({ id: 12, role: "assistant", kind: "text", content: "已打开。" });
      await advance(3000);
      assert.ok(
        canvasActions().some((entry) => entry.action.nonce === "message:11"),
        `新回执没执行：${JSON.stringify(canvasActions())}`,
      );
      assert.ok(
        canvasActions().every((entry) => entry.action.nonce === "message:11"),
        "只有新来的那条回执会执行",
      );
      assert.equal(lastCanvas().active, "browser");
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "AgentChat：自己刚建的对话，第一批消息里就带着的回执也执行",
  withClock(async () => {
    const gateway = makeGateway({});
    gateway.onCreate = {
      taskId: "t-own",
      messages: [
        { id: 1, role: "user", kind: "text", content: "打开 example.com" },
        receipt(2),
      ],
    };
    globalThis.__p7Gateway = gateway;
    const view = await mount(React.createElement(AgentChat, { siteId: "ppt", mode: "agent" }));
    try {
      assert.ok(globalThis.__p7Composer, "新对话应有输入框");
      await act(async () => {
        globalThis.__p7Composer.onChange("打开 example.com");
      });
      await act(async () => {
        globalThis.__p7Composer.onSubmit("打开 example.com", null);
      });
      await advance(600);
      assert.ok(
        gateway.calls.some((call) => call.kind === "createTask"),
        "应已新建对话",
      );
      assert.ok(
        canvasActions().some((entry) => entry.action.nonce === "message:2"),
        `自己新建对话里的回执没执行：${JSON.stringify(canvasActions())}`,
      );
      assert.equal(lastCanvas().active, "browser");
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "AgentChat：从一段对话切到另一段旧对话，那段历史里的回执也不执行",
  withClock(async () => {
    globalThis.__p7Gateway = makeGateway(
      {
        t1: [{ id: 1, role: "user", kind: "text", content: "hi" }],
        t2: BROWSED_THREAD.map((row) => ({ ...row, id: row.id + 40 })),
      },
      { status: "running" },
    );
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t1", siteId: "ppt", mode: "agent" }),
    );
    try {
      await advance(600);
      await view.render(
        React.createElement(AgentChat, { taskId: "t2", siteId: "ppt", mode: "agent" }),
      );
      await advance(3000);
      assert.ok(view.host.textContent.includes("接管浏览器"), "应已切到第二段对话");
      assert.deepEqual(canvasActions(), [], "切过去看到的是历史，不该执行");
    } finally {
      await view.unmount();
    }
  }),
);

// ===========================================================================
// FunctionAgentChat（编辑器左栏）
// ===========================================================================

const schema = {
  agentId: "ppt.deck",
  title: "PPT",
  fields: [{ key: "prompt", label: "提示词" }],
};

function functionChat(taskId) {
  return React.createElement(FunctionAgentChat, {
    agentId: "ppt.deck",
    siteId: "ppt",
    schema,
    opsContent: React.createElement("div", null, "ops"),
    showOps: true,
    defaultTab: "agent",
    enableEditorCommands: false,
    manageSessionSnapshot: false,
    appLabel: "PPT",
    ...(taskId ? { taskId } : {}),
  });
}

test(
  "FunctionAgentChat：载入时的历史回执不发；之后新来的回执发给右边",
  withClock(async (events) => {
    const gateway = makeGateway({ t1: BROWSED_THREAD }, { status: "running" });
    globalThis.__p7Gateway = gateway;
    const view = await mount(functionChat("t1"));
    try {
      assert.ok(view.host.textContent.includes("接管浏览器"), "对话应已载入");
      await advance(1500);
      assert.deepEqual(events, [], "历史回执不该发");
      gateway.threads.t1.push({ id: 10, role: "assistant", kind: "text", content: "好的，" });
      await advance(600);
      gateway.threads.t1.push(receipt(11));
      await advance(3000);
      assert.deepEqual(events, [{ nonce: "t1:11", tab: "browser" }]);
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "FunctionAgentChat：自己刚建的对话，第一批消息里就带着的回执也发",
  withClock(async (events) => {
    const gateway = makeGateway({});
    gateway.onCreate = {
      taskId: "t-own",
      messages: [
        { id: 1, role: "user", kind: "text", content: "打开 example.com" },
        receipt(2),
      ],
    };
    globalThis.__p7Gateway = gateway;
    const view = await mount(functionChat());
    try {
      await act(async () => {
        window.dispatchEvent(
          new window.CustomEvent("oceanleo-l4-chip", { detail: { prompt: "打开 example.com" } }),
        );
      });
      await advance(600);
      assert.ok(
        gateway.calls.some((call) => call.kind === "createTask"),
        "应已新建对话",
      );
      assert.deepEqual(events, [{ nonce: "t-own:2", tab: "browser" }]);
    } finally {
      await view.unmount();
    }
  }),
);
