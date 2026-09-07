// ============================================================================
// 首页开聊后对话不许「突然变空白」（操作员 2026-09-07 图 f2dde413：LeoSheet 首页发完
// 消息、回答已出现，几秒后整块对话区变成「新任务 / 在下方输入，开始与 agent 对话。」，
// 而左栏「我的任务」里那条 hi 还在）。
// ----------------------------------------------------------------------------
// 挂**真的** AgentChat 首页路径：AgentChat → WorkspaceSessionProvider(home-agent,
// resumeLatest=false) → AgentChatInner(startFreshSession)。后端换成内存假件：
// 会话 API（list / ensure / get / archive / delete）与任务 API（createTask / getTask /
// followUp / listTasks）都按真实合同应答，并把调用顺序记下来。
//
// 钉的是用户看得见的事实：
//   1. 建任务时会话已经先建好（task 出生就绑在 session 上），而不是反过来；
//   2. 回答落地后，无论 provider 之后怎么换 session / 重算 task_id，正文都还在；
//   3. 任务结束（done / stopped）后正文还在，标题不退回「新任务」。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
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
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://excel.oceanleo.com/",
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
window.HTMLElement.prototype.scrollTo = function scrollTo() {};
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

const { createRoot } = await import("react-dom/client");

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

// ---------------------------------------------------------------------------
// 内存后端（挂在 globalThis.__backend 上，替身模块从这里读写）
// ---------------------------------------------------------------------------

function makeBackend() {
  const state = {
    log: [],
    sessions: new Map(),
    tasks: new Map(),
    nextSession: 1,
    nextTask: 1,
    nextMessage: 1,
    // 每次 ensure 前的人为延迟（毫秒）；模拟真机上 3 秒才回来的 POST /sessions。
    ensureDelayMs: 0,
    // 前 N 次 ensure 直接失败（模拟接口抖动 / 并发被丢弃）。
    ensureFailuresLeft: 0,
  };
  const now = () => new Date().toISOString();
  const sessionRow = (s) => ({ ...s });
  state.api = {
    async listSessions(opts) {
      state.log.push(`list-sessions app=${opts.appId}`);
      const items = [...state.sessions.values()].filter(
        (s) =>
          s.site_id === opts.siteId &&
          s.app_id === opts.appId &&
          (opts.status ? s.status === opts.status : true),
      );
      return { ok: true, data: { items: items.map(sessionRow) } };
    },
    async getSession(id) {
      state.log.push(`get-session ${id}`);
      const s = state.sessions.get(id);
      return s
        ? { ok: true, data: sessionRow(s) }
        : { ok: false, status: 404, error: "not found" };
    },
    async ensureSession(input) {
      state.log.push(`ensure-session app=${input.appId}`);
      if (state.ensureFailuresLeft > 0) {
        state.ensureFailuresLeft -= 1;
        state.log.push("ensure-session FAILED");
        return { ok: false, status: 503, error: "会话服务暂时不可用" };
      }
      if (state.ensureDelayMs) {
        await new Promise((r) => setTimeout(r, state.ensureDelayMs));
      }
      const existing = [...state.sessions.values()].find(
        (s) =>
          s.site_id === input.siteId &&
          s.app_id === input.appId &&
          s.status === "active",
      );
      if (existing) {
        existing.last_activity_at = now();
        return { ok: true, data: sessionRow(existing) };
      }
      const id = `s${state.nextSession++}`;
      const row = {
        id,
        site_id: input.siteId,
        app_id: input.appId,
        surface: input.surface || "app",
        title: input.title || "",
        status: "active",
        snapshot: {},
        schema_version: 1,
        revision: 0,
        task_id: null,
        created_at: now(),
        updated_at: now(),
        last_activity_at: now(),
        archived_at: null,
        first_output_at: null,
      };
      state.sessions.set(id, row);
      return { ok: true, data: sessionRow(row) };
    },
    async archiveSession(id) {
      state.log.push(`archive-session ${id}`);
      const s = state.sessions.get(id);
      if (!s) return { ok: false, status: 404, error: "not found" };
      s.status = "archived";
      s.archived_at = now();
      return { ok: true, data: sessionRow(s) };
    },
    async deleteSession(id) {
      state.log.push(`delete-session ${id}`);
      state.sessions.delete(id);
      return { ok: true };
    },
    async createTask(body) {
      const id = `t${state.nextTask++}`;
      state.log.push(`create-task ${id} session=${body.sessionId || "-"}`);
      const task = {
        id,
        status: "running",
        title: body.prompt,
        site_id: body.siteId,
        session_id: body.sessionId || null,
        mode: body.mode || "agent",
        messages: [
          { id: state.nextMessage++, role: "user", kind: "text", content: body.prompt },
        ],
      };
      state.tasks.set(id, task);
      if (body.sessionId && state.sessions.get(body.sessionId)) {
        state.sessions.get(body.sessionId).task_id = id;
      }
      return { ok: true, data: { task_id: id, session_id: task.session_id } };
    },
    async getTask(id) {
      const t = state.tasks.get(id);
      if (!t) return { ok: false, status: 404, error: "no task" };
      return {
        ok: true,
        data: {
          task: {
            id: t.id,
            status: t.status,
            title: t.title,
            site_id: t.site_id,
            session_id: t.session_id,
          },
          messages: t.messages.map((m) => ({ ...m })),
          artifacts: [],
        },
      };
    },
    async followUp(id, prompt) {
      state.log.push(`follow-up ${id}`);
      const t = state.tasks.get(id);
      if (!t) return { ok: false, status: 404, error: "no task" };
      t.status = "running";
      t.messages.push({ id: state.nextMessage++, role: "user", kind: "text", content: prompt });
      return { ok: true, data: { task_id: id, status: "running" } };
    },
    async stopTask(id) {
      state.log.push(`stop ${id}`);
      const t = state.tasks.get(id);
      if (t) t.status = "stopped";
      return { ok: true };
    },
    async listTasks(_limit, siteId) {
      state.log.push(`list-tasks site=${siteId}`);
      return {
        ok: true,
        data: {
          items: [...state.tasks.values()]
            .filter((t) => !siteId || t.site_id === siteId)
            .map((t) => ({ id: t.id, session_id: t.session_id, mode: t.mode })),
        },
      };
    },
  };
  // 后台「agent 回完了」
  state.answer = (id, text) => {
    const t = state.tasks.get(id);
    t.messages.push({
      id: state.nextMessage++,
      role: "assistant",
      kind: "text",
      content: text,
      meta: { done: true },
    });
    t.status = "done";
  };
  return state;
}

const realAgentLibUrl = await compileModule("src/lib/agent.ts", {}, {
  missingPackageStub: lazyStub,
});
const agentLibStub = dataModule(`
  export * from ${JSON.stringify(realAgentLibUrl)};
  const be = () => globalThis.__backend.api;
  export function createTask(body) { return be().createTask(body); }
  export function getTask(id) { return be().getTask(id); }
  export function followUp(id, prompt) { return be().followUp(id, prompt); }
  export function stopTask(id) { return be().stopTask(id); }
  export function listTasks(limit, siteId) { return be().listTasks(limit, siteId); }
  export async function branchTask() { return { ok: false, error: "stub" }; }
  export function latestArtifact() { return null; }
`);

const realAppSessionUrl = await compileModule("src/lib/app-session.ts", {}, {
  missingPackageStub: lazyStub,
});
const appSessionStub = dataModule(`
  export * from ${JSON.stringify(realAppSessionUrl)};
  const be = () => globalThis.__backend.api;
  export function listAppSessions(opts) { return be().listSessions(opts || {}); }
  export function getAppSession(id) { return be().getSession(id); }
  export function ensureAppSession(input) { return be().ensureSession(input); }
  export function archiveAppSession(id) { return be().archiveSession(id); }
  export function deleteAppSession(id) { return be().deleteSession(id); }
  export async function updateAppSession() { return { ok: false, status: 400, error: "stub" }; }
  export async function updateAppSessionMetadata() { return { ok: false, status: 400, error: "stub" }; }
`);

const OVERRIDES = {
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (zh, vars) => String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }",
  ),
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){ globalThis.__routerReplace = (globalThis.__routerReplace||0)+1; }, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  "../lib/agent": agentLibStub,
  "../lib/app-session": appSessionStub,
  "../lib/console-draft": dataModule(
    "export async function loadConsoleDraft(){ return null; }\nexport async function saveConsoleDraft(){}\nexport async function clearConsoleDraft(){}",
  ),
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
};

const { AgentChat } = await import(
  await compileModule("src/shell/AgentChat.tsx", OVERRIDES, {
    missingPackageStub: lazyStub,
  })
);

async function settle(ms = 40) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mountHome(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        globalThis.__strict ? React.StrictMode : React.Fragment,
        null,
        React.createElement(AgentChat, {
          siteId: "excel",
          initialPrompt: "hi",
          mode: "agent",
          onBack: () => {},
          ...props,
        }),
      ),
    );
  });
  return {
    host,
    header: () => host.querySelector("[data-oceanleo-pane-header]"),
    text: () => host.textContent,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const ANSWER = "你好，我在。告诉我你想完成什么，我会直接开始。";

async function launchAndAnswer(backend) {
  globalThis.__backend = backend;
  globalThis.__strict = true;
  const view = await mountHome();
  // 首页开聊：provider 先落地(ready) → start() → startNew → createTask → refresh
  for (let i = 0; i < 40 && !backend.log.some((l) => l.startsWith("create-task")); i += 1) {
    await settle(25);
  }
  const created = backend.log.find((l) => l.startsWith("create-task"));
  assert.ok(created, `首页提交后必须建出任务；调用记录：${JSON.stringify(backend.log)}`);
  const taskId = created.split(" ")[1];
  // 后端回完
  backend.answer(taskId, ANSWER);
  for (let i = 0; i < 40 && !view.text().includes(ANSWER); i += 1) {
    await settle(50);
  }
  assert.ok(view.text().includes(ANSWER), `回答应已出现在正文里：${view.text().slice(0, 300)}`);
  return { view, taskId };
}

// ---------------------------------------------------------------------------
// 1 会话先建、任务后建、task 出生就绑在会话上
// ---------------------------------------------------------------------------

test("首页开聊：会话先于任务建立，任务出生就带 session_id", async () => {
  const backend = makeBackend();
  const { view, taskId } = await launchAndAnswer(backend);
  try {
    const ensureIndex = backend.log.findIndex((l) => l.startsWith("ensure-session"));
    const createIndex = backend.log.findIndex((l) => l.startsWith("create-task"));
    assert.ok(ensureIndex >= 0, `没有建会话：${JSON.stringify(backend.log)}`);
    assert.ok(
      ensureIndex < createIndex,
      `会话必须先于任务建立，实际顺序：${JSON.stringify(backend.log)}`,
    );
    assert.match(
      backend.log[createIndex],
      /session=s\d+/,
      `任务出生时必须带 session_id：${backend.log[createIndex]}`,
    );
    assert.equal(backend.tasks.get(taskId).session_id, "s1");
  } finally {
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// 2 回答出现之后，正文不许再变空白（等 provider 把 session / task_id 重算完）
// ---------------------------------------------------------------------------

test("回答出现后再等几秒，正文与标题都还在，不会退回「新任务」", async () => {
  const backend = makeBackend();
  const { view } = await launchAndAnswer(backend);
  try {
    // 给 provider 的 hydrateLinkedTask / applySession / touch 全部落地的时间
    await settle(400);
    const text = view.text();
    assert.ok(text.includes(ANSWER), `正文被清空了：${text.slice(0, 300)}；调用记录：${JSON.stringify(backend.log)}`);
    assert.ok(!text.includes("在下方输入，开始与 agent 对话"), "空态提示不该出现");
    assert.ok(view.header().textContent.includes("hi"), `标题应是 task.title=hi，实际：${view.header().textContent}`);
  } finally {
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// 3 慢会话：POST /sessions 3 秒才回（真机日志里就是这样）——任务仍必须等它
// ---------------------------------------------------------------------------

test("会话接口很慢时，任务仍等会话建好再建，正文也不会因会话晚到而被清空", async () => {
  const backend = makeBackend();
  backend.ensureDelayMs = 300;
  const { view, taskId } = await launchAndAnswer(backend);
  try {
    const ensureIndex = backend.log.findIndex((l) => l.startsWith("ensure-session"));
    const createIndex = backend.log.findIndex((l) => l.startsWith("create-task"));
    assert.ok(ensureIndex < createIndex, `顺序：${JSON.stringify(backend.log)}`);
    assert.equal(backend.tasks.get(taskId).session_id, "s1");
    await settle(600);
    assert.ok(view.text().includes(ANSWER), `正文被清空了：${view.text().slice(0, 300)}`);
  } finally {
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// 4 任务停止 / 结束后正文仍在
// ---------------------------------------------------------------------------

test("任务 stopped 后，正文与标题原样保留", async () => {
  const backend = makeBackend();
  const { view, taskId } = await launchAndAnswer(backend);
  try {
    backend.tasks.get(taskId).status = "stopped";
    await settle(400);
    assert.ok(view.text().includes(ANSWER), `正文被清空了：${view.text().slice(0, 300)}`);
    assert.ok(view.header().textContent.includes("hi"));
  } finally {
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// 5 真机复现（图 f2dde413）：建会话第一次失败 → 以前 task 无会话出生，随后 provider 一有
//   动静（报错 / 会话补建）就把本地 task 覆盖成 null，正文全清。现在：补一次 ensure 让
//   task 仍绑上会话；就算两次都失败，正文也必须留着。
// ---------------------------------------------------------------------------

test("建会话第一次失败：任务仍等到会话补建后再出生、带 session_id", async () => {
  const backend = makeBackend();
  backend.ensureFailuresLeft = 1;
  const { view, taskId } = await launchAndAnswer(backend);
  try {
    assert.equal(
      backend.tasks.get(taskId).session_id,
      "s1",
      `任务应绑在补建出来的会话上；调用记录：${JSON.stringify(backend.log)}`,
    );
    await settle(400);
    assert.ok(view.text().includes(ANSWER), `正文被清空了：${view.text().slice(0, 300)}`);
  } finally {
    await view.unmount();
  }
});

test("建会话连续失败、任务只能无会话出生：回答出现后 provider 报错/变化也不许清空正文", async () => {
  const backend = makeBackend();
  backend.ensureFailuresLeft = 5;
  const { view } = await launchAndAnswer(backend);
  try {
    // provider 这时已经 reportFailure 过（context 值变了）；再给它几拍
    await settle(400);
    const text = view.text();
    assert.ok(text.includes(ANSWER), `正文被清空了：${text.slice(0, 300)}；调用记录：${JSON.stringify(backend.log)}`);
    assert.ok(!text.includes("在下方输入，开始与 agent 对话"), "空态提示不该出现");
    assert.ok(view.header().textContent.includes("hi"), `标题退回了：${view.header().textContent}`);
  } finally {
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// 6 「新建」重挂载后，首页那条 initialPrompt 不许被再发一遍（真机 T3：自动多出一条 hi）
// ---------------------------------------------------------------------------

test("点「新建」重挂载对话后，不会把首页的 initialPrompt 自动再发一遍", async () => {
  const backend = makeBackend();
  const { view } = await launchAndAnswer(backend);
  try {
    const before = backend.log.filter((l) => l.startsWith("create-task")).length;
    assert.equal(before, 1);
    const restart = view.host.querySelector('button[aria-label="新建"]');
    assert.ok(restart, "顶栏应有「新建」键");
    await act(async () => {
      restart.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    await settle(600);
    const after = backend.log.filter((l) => l.startsWith("create-task")).length;
    assert.equal(after, 1, `「新建」后不该自动再建任务；调用记录：${JSON.stringify(backend.log)}`);
    assert.ok(!view.text().includes(ANSWER), "「新建」后对话应清空");
  } finally {
    await view.unmount();
  }
});
