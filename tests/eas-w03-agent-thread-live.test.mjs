// ============================================================================
// 续聊变慢·前端（editors-and-shell-0924 · W03 · 问题 4）
// ----------------------------------------------------------------------------
// 操作员看到的：第二句起发出去之后，界面要呆一两秒才开始动，然后是十几秒无声的
// 「agent 正在思考…」转圈；对话越长越慢。这里挂**真的** AgentChat（任务页形态：显式
// taskId）与 FunctionAgentChat（编辑器左栏），网关换成内存假件，时钟用 node:test 的
// 假时钟——「0 ms 内」「第 3 秒」只有假时钟能诚实地量。
//
// 1. 发出即拉。实测「续聊 POST 返回」到「第一次拉取」有 ~2.2 s 空档——网关早就把用户
//    消息写好、状态落成 running 了，前端却在等轮询梯子上的下一格。两条根因：
//      a. 续聊成功后不拉（新建路径 `start()` 之后会立刻 `refresh()`，续聊路径没有）；
//      b. 轮询只在 `status` 变化时重排。客户端还停在 running（服务端刚收尾、客户端下一次
//         轮询还没到，空转梯子最高 1.2 s）时续聊，`setStatus("running")` 是空操作。
// 2. TTFV：从按下发送到本轮回复第一次渲染出非空文字，记进 `window.__oleoAgentTtfv`；
//    空内容的回复行不算。
// 3. 读秒：还没出字时显示会走的「正在思考 · N 秒」，出字就消失。
// 4. 轮询合并：内容没变的行保持同一个对象；服务端给出 `next_after_id` 才按游标只取新行。
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
// 内存网关：行为照 `backend/app/agent/task_service.py` 的 followup——服务端 running 时
// 409；否则先写用户消息、把状态落成 running，再返回。每次 getTask 都给**新对象**
// （就像每次都重新 JSON.parse），并用假时钟记下调用时刻。
// ---------------------------------------------------------------------------

function makeGateway({ status, messages, cursor = false }) {
  const state = {
    status,
    messages: messages.map((message) => ({ ...message })),
    nextId: 100,
    calls: [],
    // 模拟一个支持增量的网关：响应里带 `next_after_id`，请求带 `after_id` 时只回新行。
    // 游标停在第一条还在变的行（streaming）之前，还在长的那一行因此每次都会重发。
    cursor,
  };
  const copy = (message) => ({
    ...message,
    ...(message.meta ? { meta: JSON.parse(JSON.stringify(message.meta)) } : {}),
  });
  const nextAfterId = () => {
    const open = state.messages.find((message) => message.meta?.streaming === true);
    if (open) return open.id - 1;
    return state.messages.reduce((max, message) => Math.max(max, message.id), 0);
  };
  state.api = {
    async createTask(body) {
      state.calls.push({ kind: "createTask", at: Date.now(), body });
      return { ok: false, status: 500, error: "not in this bench" };
    },
    getTask(id, options) {
      state.calls.push({ kind: "getTask", at: Date.now(), id, options: options ?? null });
      const afterId = state.cursor && typeof options?.afterId === "number" ? options.afterId : null;
      const rows = afterId === null
        ? state.messages
        : state.messages.filter((message) => message.id > afterId);
      return Promise.resolve({
        ok: true,
        data: {
          task: { id, status: state.status, site_id: "ppt", title: "对话" },
          messages: rows.map(copy),
          artifacts: [],
          ...(state.cursor ? { next_after_id: nextAfterId() } : {}),
        },
      });
    },
    followUp(id, prompt) {
      state.calls.push({ kind: "followUp", at: Date.now(), id, prompt });
      if (state.status === "running") {
        return Promise.resolve({ ok: false, status: 409, error: "task is still running" });
      }
      state.messages.push({ id: state.nextId++, role: "user", kind: "text", content: prompt });
      state.status = "running";
      return Promise.resolve({ ok: true, data: { task_id: id, status: "running" } });
    },
    async stopTask(id) {
      state.calls.push({ kind: "stopTask", at: Date.now(), id });
      return { ok: true, data: { task_id: id, status: "stopped" } };
    },
  };
  return state;
}

const gatewayModule = (realUrl) =>
  dataModule(`
    ${realUrl ? `export * from ${JSON.stringify(realUrl)};` : ""}
    const gw = () => globalThis.__w03Gateway.api;
    export function createTask(body) { return gw().createTask(body); }
    export function getTask(id, options) { return gw().getTask(id, options); }
    export function followUp(id, prompt) { return gw().followUp(id, prompt); }
    export function stopTask(id) { return gw().stopTask(id); }
    export async function branchTask() { return { ok: false, error: "stub" }; }
    export async function reportEditorCommandResult() { return { ok: true }; }
    export function latestArtifact() { return null; }
  `);

const interpolatingUseUI = dataModule(
  "export function useUI(){ return (zh, vars) => String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }",
);

const recordingBubble = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AgentTranscriptBubble(props) {
    (globalThis.__w03Bubbles ||= []).push(props.message);
    return jsx("div", {
      "data-w03-bubble": props.message.role,
      "data-w03-id": String(props.message.id),
      children: props.message.content || "",
    });
  }
  export function agentArtifactLabels(){ return {}; }
`);

// ---------------------------------------------------------------------------
// AgentChat（任务页形态）
// ---------------------------------------------------------------------------

const realAgentLibUrl = await compileModule("src/lib/agent.ts", {}, {
  missingPackageStub: lazyStub,
});

const agentChatUrl = await compileModule(
  "src/shell/AgentChat.tsx",
  {
    "../i18n/ui/useUI": interpolatingUseUI,
    "next/navigation": dataModule(
      "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
        "export function useSearchParams(){ return new URLSearchParams(); }\n" +
        "export function usePathname(){ return '/tasks/t1'; }",
    ),
    "../lib/agent": gatewayModule(realAgentLibUrl),
    "./AgentTranscriptBubble": recordingBubble,
    "./AgentProgress": dataModule("export function AgentProgress(){ return null; }"),
    "./WorkspaceSession": dataModule(`
      export function useOptionalWorkspaceSession(){ return null; }
      export function WorkspaceSessionProvider(props){ return props.children; }
    `),
    "./RestartDraftButton": dataModule("export function RestartDraftButton(){ return null; }"),
    "./CloudBrowserPanel": dataModule("export function CloudBrowserPanel(){ return null; }"),
    "./ResultCanvas": dataModule(
      "export function ResultCanvas(){ return null; }\nexport function CanvasEmpty(){ return null; }\nexport function CanvasSubTabs(){ return null; }",
    ),
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
        globalThis.__w03Composer = props;
        return jsx("textarea", { "data-composer": true, placeholder: props.placeholder, readOnly: true });
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
// FunctionAgentChat（编辑器左栏）
// ---------------------------------------------------------------------------

const functionChatUrl = await compileModule(
  "src/shell/FunctionAgentChat.tsx",
  {
    "../i18n/ui/useUI": interpolatingUseUI,
    "./LeoComposer": dataModule(`
      import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
      export function LeoComposer(props) {
        globalThis.__w03FnComposer = props;
        return jsx("textarea", { "data-composer": true, readOnly: true });
      }
    `),
    "./AgentProgress": dataModule("export function AgentProgress(){ return null; }"),
    "./RestartDraftButton": dataModule("export function RestartDraftButton(){ return null; }"),
    "./OperatorRemark": dataModule(`
      export function OperatorRemarkField(){ return null; }
      export function useOperatorRemark(){ return { remark: "", setRemark(){} }; }
    `),
    "./AgentTranscriptBubble": recordingBubble,
    "./useAttachments": dataModule(`
      export function useAttachments() {
        return {
          attachments: [], composerAttachments: [], handleAttachFiles() {}, addReady() {},
          restoreReady() {}, removeAttachment() {}, ready: () => [], uploading: false, clear() {},
        };
      }
    `),
    "./WorkspaceSession": dataModule("export function useOptionalWorkspaceSession(){ return null; }"),
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
    "./workspace-actions": dataModule(`
      export const WORKSPACE_ACTION_EVENT = "oceanleo:w03-workspace-action";
      export function dispatchWorkspaceAction() {}
      export function normalizeWorkspaceAction() { return null; }
    `),
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

// ---------------------------------------------------------------------------
// 假时钟与挂载
// ---------------------------------------------------------------------------

const T0 = 1_760_000_000_000;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
}

/** 假时钟往前走 `ms`，每 `step` 毫秒让 React 与 promise 链跑一轮。 */
async function advance(ms, step = 5) {
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
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const pulls = (gateway, since) =>
  gateway.calls.filter((call) => call.kind === "getTask" && call.at >= since);

/**
 * 续聊成功之后第一次拉取落在几毫秒后。先只冲微任务（假时钟一格不动）看有没有拉，
 * 没有就一格格往前走，量出今天到底要等多久——判红时打印的就是这个数。
 */
async function firstPullDelay(gateway, since, horizonMs = 3000) {
  await flush();
  const immediate = pulls(gateway, since);
  if (immediate.length) return immediate[0].at - since;
  for (let waited = 0; waited < horizonMs; waited += 10) {
    await advance(10);
    const later = pulls(gateway, since);
    if (later.length) return later[0].at - since;
  }
  return Number.POSITIVE_INFINITY;
}

const FINISHED_THREAD = [
  { id: 1, role: "user", kind: "text", content: "hi" },
  { id: 2, role: "assistant", kind: "text", content: "你好，我在。", meta: { done: true } },
];

function withClock(fn) {
  return async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: T0 });
    globalThis.__w03Bubbles = [];
    try {
      await fn();
    } finally {
      mock.timers.reset();
      delete globalThis.__w03Gateway;
      delete globalThis.__w03Composer;
      delete globalThis.__w03FnComposer;
    }
  };
}

async function submitViaComposer(text) {
  await act(async () => {
    globalThis.__w03Composer.onChange(text);
  });
  await act(async () => {
    globalThis.__w03Composer.onSubmit(text, null);
  });
}

function followUpAt(gateway) {
  const call = gateway.calls.findLast((entry) => entry.kind === "followUp");
  assert.ok(call, `没有发出续聊：${JSON.stringify(gateway.calls.map((c) => c.kind))}`);
  return call.at;
}

/**
 * 让客户端停在 running、空转梯子爬到 1.2 s 那一档（服务端 running、没有新消息），
 * 并停在「刚拉完一次」的时刻返回——下一格离现在最远，正是操作员撞上的那种空档。
 */
async function climbIdleLadder(gateway) {
  await advance(9000, 25);
  const seen = pulls(gateway, T0).length;
  for (let waited = 0; waited < 1500 && pulls(gateway, T0).length === seen; waited += 5) {
    await advance(5);
  }
  const recent = pulls(gateway, T0).slice(-2).map((call) => call.at);
  assert.equal(recent.length, 2, "客户端应一直在轮询");
  assert.ok(
    recent[1] - recent[0] >= 1000,
    `梯子没爬到顶，最后两次间隔 ${recent[1] - recent[0]} ms`,
  );
  return recent[1];
}

// ===========================================================================
// AgentChat
// ===========================================================================

test(
  "AgentChat：已完成的对话里续聊，POST 一返回就拉（0 ms，假时钟）",
  withClock(async () => {
    const gateway = makeGateway({ status: "done", messages: FINISHED_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t1", siteId: "ppt", mode: "agent" }),
    );
    try {
      assert.ok(view.host.textContent.includes("你好，我在。"), "对话应已载入");
      await advance(500);
      await submitViaComposer("你是谁");
      const since = followUpAt(gateway);
      const delay = await firstPullDelay(gateway, since);
      assert.equal(
        delay,
        0,
        `续聊成功后第一次拉取在 +${delay} ms——网关早已写好用户消息并落成 running，前端却在等定时器`,
      );
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "AgentChat：客户端还停在 running（梯子在 1.2 s 档）时续聊，照样立刻拉，且节奏回到首拉档",
  withClock(async () => {
    const gateway = makeGateway({
      status: "running",
      messages: FINISHED_THREAD,
    });
    globalThis.__w03Gateway = gateway;
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t1", siteId: "ppt", mode: "agent" }),
    );
    try {
      const lastPoll = await climbIdleLadder(gateway);
      // 服务端刚收尾：状态落成 done，但客户端下一次轮询还要 ~1.2 s 才到。
      gateway.status = "done";
      await advance(lastPoll + 60 - Date.now());
      await submitViaComposer("再来一句");
      const since = followUpAt(gateway);
      const delay = await firstPullDelay(gateway, since);
      assert.equal(
        delay,
        0,
        `客户端停在 running 时续聊，第一次拉取在 +${delay} ms（等的是空转梯子上的那一格）`,
      );
      await advance(230);
      const after = pulls(gateway, since);
      assert.ok(
        after.length >= 2,
        `立刻拉过之后，下一次应在首拉档（≤225 ms）内跟上，实际 230 ms 内只拉了 ${after.length} 次`,
      );
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "AgentChat：点灵感追问（sendSuggestion 这条续聊）同样立刻拉",
  withClock(async () => {
    const gateway = makeGateway({ status: "done", messages: FINISHED_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t1", siteId: "ppt", mode: "agent" }),
    );
    try {
      await advance(500);
      await act(async () => {
        window.dispatchEvent(
          new window.CustomEvent("oceanleo-l4-chip", { detail: { prompt: "换个说法" } }),
        );
      });
      const since = followUpAt(gateway);
      const delay = await firstPullDelay(gateway, since);
      assert.equal(delay, 0, `追问发出后第一次拉取在 +${delay} ms`);
    } finally {
      await view.unmount();
    }
  }),
);

// ===========================================================================
// FunctionAgentChat
// ===========================================================================

const schema = {
  agentId: "ppt.deck",
  title: "PPT",
  fields: [{ key: "prompt", label: "提示词" }],
};

function functionChat(taskId = "t1") {
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
    taskId,
  });
}

async function sendFromEditorPane(prompt) {
  await act(async () => {
    window.dispatchEvent(new window.CustomEvent("oceanleo-l4-chip", { detail: { prompt } }));
  });
}

test(
  "FunctionAgentChat：编辑器左栏里续聊，POST 一返回就拉（与 AgentChat 一致）",
  withClock(async () => {
    const gateway = makeGateway({ status: "done", messages: FINISHED_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(functionChat());
    try {
      assert.ok(view.host.textContent.includes("你好，我在。"), "对话应已载入");
      await advance(500);
      await sendFromEditorPane("你是谁");
      const since = followUpAt(gateway);
      const delay = await firstPullDelay(gateway, since);
      assert.equal(delay, 0, `编辑器左栏续聊后第一次拉取在 +${delay} ms`);
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "FunctionAgentChat：客户端停在 running 时续聊，照样立刻拉，且节奏回到首拉档",
  withClock(async () => {
    const gateway = makeGateway({ status: "running", messages: FINISHED_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(functionChat());
    try {
      const lastPoll = await climbIdleLadder(gateway);
      gateway.status = "done";
      await advance(lastPoll + 60 - Date.now());
      await sendFromEditorPane("再来一句");
      const since = followUpAt(gateway);
      const delay = await firstPullDelay(gateway, since);
      assert.equal(delay, 0, `客户端停在 running 时续聊，第一次拉取在 +${delay} ms`);
      await advance(230);
      assert.ok(
        pulls(gateway, since).length >= 2,
        "立刻拉过之后，下一次应在首拉档（≤225 ms）内跟上",
      );
    } finally {
      await view.unmount();
    }
  }),
);

// ===========================================================================
// TTFV：按下发送 → 本轮回复第一次渲染出非空文字
// ===========================================================================

function emptyReply(gateway, meta = {}) {
  const row = {
    id: gateway.nextId++,
    role: "assistant",
    kind: "text",
    content: "",
    meta: { streaming: true, ...meta },
  };
  gateway.messages.push(row);
  return row;
}

/** 一格格走，直到界面里出现 `text`；返回它第一次被渲染出来那一刻的假时钟。 */
async function untilVisible(host, text, horizonMs = 5000) {
  for (let waited = 0; waited <= horizonMs; waited += 5) {
    if (host.textContent.includes(text)) return Date.now();
    await advance(5);
  }
  assert.fail(`${horizonMs} ms 内没等到「${text}」出现：${host.textContent.slice(0, 240)}`);
}

const ttfvRecords = (taskId) =>
  (Array.isArray(window.__oleoAgentTtfv) ? window.__oleoAgentTtfv : []).filter(
    (record) => record.taskId === taskId,
  );

async function assertTtfvRoundTrip(view, gateway, taskId, send) {
  await advance(500);
  const sentAt = Date.now();
  await send("你是谁");
  await advance(300);
  const reply = emptyReply(gateway, { reply_path: "reply" });
  await advance(1200);
  assert.deepEqual(ttfvRecords(taskId), [], "回复行还是空的，不该记 TTFV");

  reply.content = "我是 Leo。";
  reply.meta.first_token_ms = 1380;
  const visibleAt = await untilVisible(view.host, "我是 Leo。");
  const records = ttfvRecords(taskId);
  assert.equal(
    records.length,
    1,
    `回复第一次出字后应记下一条 TTFV，window.__oleoAgentTtfv=${JSON.stringify(window.__oleoAgentTtfv)}`,
  );
  const [record] = records;
  assert.equal(record.ttfvMs, visibleAt - sentAt, "TTFV = 首个非空渲染时刻 − 按下发送时刻");
  assert.equal(record.turnKey, "2", "这是这段对话里用户的第 2 句");
  assert.equal(record.messageId, reply.id);
  assert.equal(record.firstTokenMs, 1380, "带上服务端 first_token_ms，V3 好逐条对照");
  assert.equal(record.replyPath, "reply", "带上 W02 的 reply_path，V3 好分桶");

  reply.content = "我是 Leo。有什么可以帮你？";
  await advance(800);
  assert.equal(ttfvRecords(taskId).length, 1, "同一轮回复继续长，不许再记一次");
}

test(
  "AgentChat：TTFV 从按下发送量到回复第一次渲染出非空文字；空回复行不触发",
  withClock(async () => {
    const gateway = makeGateway({ status: "done", messages: FINISHED_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t-ttfv", siteId: "ppt", mode: "agent" }),
    );
    try {
      await assertTtfvRoundTrip(view, gateway, "t-ttfv", submitViaComposer);
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "FunctionAgentChat：TTFV 同样记录，空回复行同样不触发",
  withClock(async () => {
    const gateway = makeGateway({ status: "done", messages: FINISHED_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(functionChat("t-fn-ttfv"));
    try {
      await assertTtfvRoundTrip(view, gateway, "t-fn-ttfv", sendFromEditorPane);
    } finally {
      await view.unmount();
    }
  }),
);

// ===========================================================================
// 读秒：不是无声的转圈
// ===========================================================================

async function assertThinkingTicker(view, gateway, send) {
  await advance(500);
  const sentAt = Date.now();
  await send("讲个笑话");
  await advance(50);
  assert.match(
    view.host.textContent,
    /正在思考 · 0 秒/,
    "回复行出来之前就开始读秒，起点是按下发送",
  );

  const reply = emptyReply(gateway);
  await advance(3000 - (Date.now() - sentAt));
  const atThree = view.host.textContent;
  assert.match(atThree, /正在思考 · 3 秒/, `回复行空 + running，第 3 秒应显示读秒：${atThree.slice(-120)}`);
  assert.doesNotMatch(atThree, /agent 正在思考…/, "读秒替代无声的转圈，不是叠在它旁边");

  reply.meta.thinking_chars = 1234;
  await advance(4000 - (Date.now() - sentAt));
  assert.match(
    view.host.textContent,
    /正在思考… 已想 1234 字 · 4 秒/,
    "后端给了 thinking_chars，就显示还在想、已经想了多少",
  );

  reply.content = "有一天，一只企鹅……";
  await untilVisible(view.host, "有一天，一只企鹅……");
  assert.doesNotMatch(view.host.textContent, /正在思考/, "出字之后读秒必须消失");
}

test(
  "AgentChat：还没出字时显示会走的「正在思考 · N 秒」，有 thinking_chars 时带上字数，出字就消失",
  withClock(async () => {
    const gateway = makeGateway({ status: "done", messages: FINISHED_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t-tick", siteId: "ppt", mode: "agent" }),
    );
    try {
      await assertThinkingTicker(view, gateway, submitViaComposer);
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "FunctionAgentChat：编辑器左栏同样读秒，出字就消失",
  withClock(async () => {
    const gateway = makeGateway({ status: "done", messages: FINISHED_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(functionChat("t-fn-tick"));
    try {
      await assertThinkingTicker(view, gateway, sendFromEditorPane);
    } finally {
      await view.unmount();
    }
  }),
);

// ===========================================================================
// 轮询合并：长对话不越拉越慢
// ===========================================================================

const STREAMING_THREAD = [
  ...FINISHED_THREAD,
  { id: 3, role: "user", kind: "text", content: "再说一遍" },
  { id: 4, role: "assistant", kind: "text", content: "", meta: { streaming: true } },
];

/** 每一行最近一次渲染时拿到的那个 message 对象。 */
function latestBubbleObjects() {
  const byId = new Map();
  for (const message of globalThis.__w03Bubbles || []) byId.set(message.id, message);
  return byId;
}

async function assertRowsKeepIdentity(view, gateway) {
  await advance(400);
  const before = latestBubbleObjects();
  assert.deepEqual([...before.keys()].sort(), [1, 2, 3, 4], "四行都应已渲染");

  gateway.messages[3].content = "好的，再说一遍：";
  await untilVisible(view.host, "好的，再说一遍：");
  const after = latestBubbleObjects();
  for (const id of [1, 2, 3]) {
    assert.equal(
      after.get(id),
      before.get(id),
      `第 ${id} 行内容没变，这次轮询却换成了新对象——每拉一次整张表都被替换`,
    );
  }
  assert.notEqual(after.get(4), before.get(4), "正在长的那一行必须换成新内容");

  const renders = (globalThis.__w03Bubbles || []).length;
  await advance(600);
  const again = latestBubbleObjects();
  for (const id of [1, 2, 3, 4]) {
    assert.equal(again.get(id), after.get(id), `相同内容的再次轮询，第 ${id} 行不许产生新对象`);
  }
  assert.equal(
    (globalThis.__w03Bubbles || []).length,
    renders,
    "内容完全没变的轮询不该让对话重渲",
  );
}

test(
  "AgentChat：流式期间每次轮询只换正在长的那一行，内容没变的行保持同一个对象",
  withClock(async () => {
    const gateway = makeGateway({ status: "running", messages: STREAMING_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t-merge", siteId: "ppt", mode: "agent" }),
    );
    try {
      await assertRowsKeepIdentity(view, gateway);
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "FunctionAgentChat：流式期间内容没变的行同样保持同一个对象",
  withClock(async () => {
    const gateway = makeGateway({ status: "running", messages: STREAMING_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(functionChat("t-fn-merge"));
    try {
      await assertRowsKeepIdentity(view, gateway);
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "轮询：网关响应带 next_after_id 才按游标只取新行，并把新行并回原表",
  withClock(async () => {
    const gateway = makeGateway({ status: "running", messages: STREAMING_THREAD, cursor: true });
    globalThis.__w03Gateway = gateway;
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t-cursor", siteId: "ppt", mode: "agent" }),
    );
    try {
      await advance(400);
      const options = pulls(gateway, T0).map((call) => call.options);
      assert.equal(options[0], null, "第一次必须拉全表（还不知道网关支不支持游标）");
      assert.ok(
        options.slice(1).some((option) => option?.afterId === 3),
        `网关给了 next_after_id=3，之后应带 after_id=3 只取新行：${JSON.stringify(options)}`,
      );

      gateway.messages[3].content = "游标模式下长出来的字";
      await untilVisible(view.host, "游标模式下长出来的字");
      assert.ok(view.host.textContent.includes("你好，我在。"), "游标之前的旧行不许丢");
      assert.ok(view.host.textContent.includes("再说一遍"), "游标之前的旧行不许丢");

      gateway.messages[3].meta = { done: true };
      await advance(600);
      assert.ok(
        pulls(gateway, T0).slice(-1)[0].options?.afterId === 4,
        "那一行收尾后游标前移到它之后",
      );
      assert.ok(view.host.textContent.includes("游标模式下长出来的字"));
    } finally {
      await view.unmount();
    }
  }),
);

test(
  "轮询：网关不带 next_after_id 时一直拉全表（老网关原样工作）",
  withClock(async () => {
    const gateway = makeGateway({ status: "running", messages: STREAMING_THREAD });
    globalThis.__w03Gateway = gateway;
    const view = await mount(
      React.createElement(AgentChat, { taskId: "t-full", siteId: "ppt", mode: "agent" }),
    );
    try {
      await advance(1500);
      const options = pulls(gateway, T0).map((call) => call.options);
      assert.ok(options.length > 3, "应一直在轮询");
      assert.ok(
        options.every((option) => option === null || option?.afterId === undefined),
        `没见过 next_after_id 就不许发 after_id：${JSON.stringify(options)}`,
      );
    } finally {
      await view.unmount();
    }
  }),
);
