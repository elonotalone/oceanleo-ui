// ============================================================================
// W5 (2026-10-31): task switch shows ONE loading look; scroll memory; share entry
// ----------------------------------------------------------------------------
// 1. TaskLoadingGate: the page-level skeleton covers the detail while the host
//    read or any runtime below is pending; a child that mounts in the same commit
//    the host becomes ready keeps it covered (no flash between two loading looks);
//    once ready a key is never covered again; a new key may be.
// 2. Real AgentChat under a gate: covered until its first task read is in.
// 3. First open lands at the bottom on the placed frame (scrollTop, no smooth
//    scrollTo); a remembered scrolled-up spot comes back on the next mount.
// 4. Header share entry stays mounted while selecting (pressed), opens the action
//    bar with every message ticked, and 「复制链接」 is usable at once.
// Harness copied from agent-chat-single-header.test.mjs (same stubs).
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// ---------------------------------------------------------------------------
// jsdom（经 fabric 的依赖树拿到；与 share-select-mode.test.mjs 同款设置）
// ---------------------------------------------------------------------------

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
  url: "https://leoimage.oceanleo.com/",
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
// Layout the stream would have in a browser: 1000px of content in a 200px pane.
// scrollTop is stored per element; every scrollTo call is recorded with its behavior.
const scrollTops = new WeakMap();
globalThis.__scrollCalls = [];
Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", { configurable: true, get() { return 1000; } });
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 200; } });
Object.defineProperty(window.HTMLElement.prototype, "scrollTop", {
  configurable: true,
  get() { return scrollTops.get(this) ?? 0; },
  set(value) { scrollTops.set(this, Math.max(0, Math.min(800, Number(value) || 0))); },
});
window.HTMLElement.prototype.scrollTo = function scrollTo(options) {
  globalThis.__scrollCalls.push({ top: options?.top, behavior: options?.behavior });
  if (options && typeof options.top === "number") this.scrollTop = options.top;
};

// react-dom 在模块求值时就探测 `window.document` 是否存在（canUseDOM / 是否支持
// `input` 事件）。静态 import 会被提升到 jsdom 装好之前，React 就走 IE 的
// attachEvent 兜底并且不再监听 `input`，受控输入框收不到 onChange。所以必须在
// 全局 DOM 就位之后再加载它。
const { createRoot } = await import("react-dom/client");

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

// 任意具名导入都拿得到一个无副作用的空函数——用于顶栏之外的第三方包。
const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

// ---------------------------------------------------------------------------
// 替身
// ---------------------------------------------------------------------------

/**
 * 假后端：`getTask` 按 `globalThis.__task` 应答；其余一律拒绝（本测试不发消息）。
 * 其它导出（authed / listTasks / createConsoleRun…被 app-session、useConsoleRun 等
 * 同一 specifier 的导入方要）走真源码——显式导出按 ES 规范压过 `export *`。
 */
const realAgentLibUrl = await compileModule("src/lib/agent.ts", {}, {
  missingPackageStub: lazyStub,
});
const agentLibStub = dataModule(`
  export * from ${JSON.stringify(realAgentLibUrl)};
  globalThis.__task = null;
  globalThis.__taskGate = null;
  export async function getTask() {
    if (globalThis.__taskGate) await globalThis.__taskGate;
    return globalThis.__task
      ? { ok: true, data: globalThis.__task }
      : { ok: false, status: 404, error: "no task" };
  }
  export async function createTask() { return { ok: false, error: "stub" }; }
  export async function branchTask() { return { ok: false, error: "stub" }; }
  export async function followUp() { return { ok: false, error: "stub" }; }
  export async function stopTask() { return { ok: true }; }
  export function latestArtifact() { return null; }
`);

const OVERRIDES = {
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (zh, vars) => String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }",
  ),
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  // `../lib/database` 不桩：useAttachments 等也从它取导出，网络调用都在事件处理器里。
  "../lib/agent": agentLibStub,
  "./CloudBrowserPanel": dataModule(
    "export function CloudBrowserPanel(){ return null; }",
  ),
  "./ResultCanvas": dataModule(
    "export function ResultCanvas(){ return null; }\nexport function CanvasEmpty(){ return null; }\nexport function CanvasSubTabs(){ return null; }",
  ),
  "./ArtifactRenderer": dataModule(
    "export function ArtifactRenderer(){ return null; }\nexport function artifactToLibraryItem(){ return {}; }",
  ),
  "./MaterialLibrary": dataModule(
    "export function MaterialLibrary(){ return null; }",
  ),
  "./HumanHandoffButton": dataModule(
    "export function HumanHandoffButton(){ return null; }",
  ),
  "./HumanHandoffStatus": dataModule(
    "export function HumanHandoffStatus(){ return null; }",
  ),
  "./quick-actions": dataModule(
    "export function QuickActionChips(){ return null; }",
  ),
  // 输入框与顶栏无关，且 Tiptap 要浏览器环境；桩成 textarea 即可。
  "./LeoComposer": dataModule(`
    import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
    export function LeoComposer(props) {
      return jsx("textarea", { "data-composer": true, placeholder: props.placeholder, readOnly: true });
    }
  `),
  // 「左边说话、右边动手」的指令桥与审阅闸：与顶栏无关，全部空转。
  "./FunctionAgentChat": dataModule(`
    export function EditorCommandNotes(){ return null; }
    export function useEditorCommandBridge(){
      return {
        contextFor: () => "",
        captureContext: () => ({context:"",filePin:null}),
        pending: null,
        busy: false,
        notes: [],
        card: null,
        noteUserTurn(){},
        noteOwnTask(){},
        ingest(){},
      };
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
  "./plugin-command": dataModule(
    "export function currentPluginCommandSurface(){ return null; }",
  ),
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

const gateUrl = await compileModule("src/shell/task-loading-gate.tsx", {
  "../i18n/ui/useUI": OVERRIDES["../i18n/ui/useUI"],
}, { missingPackageStub: lazyStub });
const { TaskLoadingGate, useTaskLoadingReport, taskLoadingCovered } = await import(gateUrl);
const memoryUrl = await compileModule("src/shell/task-scroll-memory.ts");
const { rememberConversationScroll, recallConversationScroll, initialConversationScroll, forgetConversationScrolls } = await import(memoryUrl);

const { AgentChat } = await import(
  await compileModule("src/shell/AgentChat.tsx", {
    ...OVERRIDES,
    "./task-loading-gate": gateUrl,
    "./task-scroll-memory": memoryUrl,
  }, {
    missingPackageStub: lazyStub,
  })
);

const MESSAGES = [
  { id: 1, role: "user", kind: "text", content: "帮我算个同比" },
  { id: 2, role: "assistant", kind: "text", content: "同比增长 12%。", meta: { done: true } },
];

function taskData(id = "t1") {
  return { task: { id, status: "done", title: "同比分析", site_id: "leoimage" }, messages: MESSAGES, artifacts: [] };
}

async function settle(ms = 60) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return {
    host,
    root,
    render: (next) => act(async () => root.render(next)),
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

async function click(target) {
  await act(async () => {
    target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

const covered = (host) => Boolean(host.querySelector("[data-task-loading-cover]"));

function Reporter({ ready }) {
  useTaskLoadingReport(ready);
  return React.createElement("p", { "data-reporter": String(ready) }, "content");
}

test("taskLoadingCovered: pending host or reporter covers; a latched key never does", () => {
  assert.equal(taskLoadingCovered({ gateKey: "a", readyKey: null, hostReady: false, reporters: [] }), true);
  assert.equal(taskLoadingCovered({ gateKey: "a", readyKey: null, hostReady: true, reporters: [true, false] }), true);
  assert.equal(taskLoadingCovered({ gateKey: "a", readyKey: null, hostReady: true, reporters: [true] }), false);
  assert.equal(taskLoadingCovered({ gateKey: "a", readyKey: "a", hostReady: false, reporters: [false] }), false);
  assert.equal(taskLoadingCovered({ gateKey: "b", readyKey: "a", hostReady: true, reporters: [false] }), true);
});

test("gate: one cover from host read through the child's own hydration; no fallback once ready", async () => {
  const gate = (key, hostReady, child) =>
    React.createElement(TaskLoadingGate, { gateKey: key, hostReady }, child);
  const view = await mount(gate("t1", false, React.createElement("div", null, "placeholder")));
  try {
    assert.ok(covered(view.host), "host still reading: covered");
    const cover = view.host.querySelector("[data-task-loading-cover] [data-route-page-skeleton]");
    assert.ok(cover, "the cover is the page-level RoutePageSkeleton");
    assert.equal(cover.getAttribute("aria-busy"), "true");
    assert.doesNotMatch(view.host.textContent, /加载工作会话/);

    // Host becomes ready in the SAME commit a still-hydrating child mounts: stays covered.
    await view.render(gate("t1", true, React.createElement(Reporter, { ready: false })));
    assert.ok(covered(view.host), "child pending in the same commit: no premature reveal");
    assert.ok(view.host.querySelector("[data-reporter]"), "the child is mounted under the cover");

    await view.render(gate("t1", true, React.createElement(Reporter, { ready: true })));
    assert.equal(covered(view.host), false, "everything in: revealed");

    // A later background refresh flips the child back: the shown content stays.
    await view.render(gate("t1", true, React.createElement(Reporter, { ready: false })));
    assert.equal(covered(view.host), false, "never falls back to the loading look for the same task");

    // Another task: covered again until it is in.
    await view.render(gate("t2", false, React.createElement("div", null, "placeholder")));
    assert.ok(covered(view.host));
    await view.render(gate("t2", true, React.createElement(Reporter, { ready: true })));
    assert.equal(covered(view.host), false);
  } finally {
    await view.unmount();
  }
});

test("scroll memory: scrolled-up spot comes back; at bottom (or nothing saved) opens at the latest", () => {
  forgetConversationScrolls();
  assert.deepEqual(initialConversationScroll(null, 900), { top: 900, follow: true });
  rememberConversationScroll("task:a", 120, false);
  assert.deepEqual(recallConversationScroll("task:a"), { top: 120, atBottom: false });
  assert.deepEqual(initialConversationScroll(recallConversationScroll("task:a"), 900), { top: 120, follow: false });
  rememberConversationScroll("task:a", 780, true);
  assert.deepEqual(initialConversationScroll(recallConversationScroll("task:a"), 900), { top: 900, follow: true });
  assert.equal(recallConversationScroll(""), null);
});

test("real AgentChat under a gate: covered until its first task read lands, then never again", async () => {
  let release;
  globalThis.__taskGate = new Promise((resolve) => { release = resolve; });
  globalThis.__task = taskData("t-gate");
  const view = await mount(
    React.createElement(TaskLoadingGate, { gateKey: "t-gate", hostReady: true },
      React.createElement(AgentChat, { siteId: "leoimage", taskId: "t-gate" })),
  );
  try {
    await settle(20);
    assert.ok(covered(view.host), "task read still on its way: the one skeleton covers the chat");
    globalThis.__taskGate = null;
    release();
    await settle(80);
    assert.equal(covered(view.host), false, "read in, conversation decided: revealed");
    assert.match(view.host.textContent, /同比增长 12%/);
  } finally {
    globalThis.__taskGate = null;
    await view.unmount();
    globalThis.__task = null;
  }
});

test("first open lands at the bottom without a smooth scroll; a scrolled-up spot is restored on return", async () => {
  forgetConversationScrolls();
  globalThis.__task = taskData("t-scroll");
  globalThis.__scrollCalls = [];
  let view = await mount(React.createElement(AgentChat, { siteId: "leoimage", taskId: "t-scroll" }));
  try {
    await settle(80);
    const scroller = view.host.querySelector("[data-agent-stream-scroller]");
    assert.ok(scroller);
    assert.equal(scroller.scrollTop, 800, "first frame placed at the bottom");
    assert.deepEqual(
      globalThis.__scrollCalls.filter((call) => call.behavior === "smooth"),
      [],
      "no smooth top-to-bottom scroll on open",
    );
    // The user scrolls up and leaves the task.
    scroller.scrollTop = 150;
    await act(async () => { scroller.dispatchEvent(new window.Event("scroll", { bubbles: true })); });
  } finally {
    await view.unmount();
  }
  globalThis.__scrollCalls = [];
  view = await mount(React.createElement(AgentChat, { siteId: "leoimage", taskId: "t-scroll" }));
  try {
    await settle(80);
    const scroller = view.host.querySelector("[data-agent-stream-scroller]");
    assert.equal(scroller.scrollTop, 150, "coming back to the task restores where the user was");
    assert.deepEqual(globalThis.__scrollCalls.filter((call) => call.behavior === "smooth"), []);
  } finally {
    await view.unmount();
    globalThis.__task = null;
  }
});

test("header share entry stays while selecting, ticks every message, and Copy Link is usable", async () => {
  globalThis.__task = taskData("t-share");
  const view = await mount(React.createElement(AgentChat, { siteId: "leoimage", taskId: "t-share" }));
  try {
    await settle(80);
    const header = view.host.querySelector("[data-oceanleo-pane-header]");
    const entry = () => [...header.querySelectorAll('button[title="分享"]')].find((button) => !button.querySelector("circle"));
    assert.ok(entry(), "share entry in the header");
    await click(entry());
    assert.ok(entry(), "the entry does not vanish on click");
    assert.equal(entry().getAttribute("aria-pressed"), "true");
    assert.match(view.host.textContent, /已选 2 条/, "every message ticked on entry");
    const copyLink = [...view.host.querySelectorAll("button")].find((button) => button.getAttribute("title") === "复制链接");
    assert.ok(copyLink, "the share action bar is shown");
    assert.equal(copyLink.disabled, false, "Copy Link usable straight away");
    await click(entry());
    assert.equal(entry().getAttribute("aria-pressed"), "false", "a second click leaves select mode");
    assert.equal([...view.host.querySelectorAll("button")].find((button) => button.getAttribute("title") === "复制链接"), undefined);
  } finally {
    await view.unmount();
    globalThis.__task = null;
  }
});

test("history detail cache: a revisit is served at once and its TaskDetail is marked stale (AgentChat re-reads)", async () => {
  const { historyDetailCacheKey, storeHistoryDetail, peekHistoryDetail, isStaleTaskSeed, clearHistoryDetailCache } =
    await import(await compileModule("src/shell/history-detail-cache.ts"));
  clearHistoryDetailCache();
  const detail = taskData("t-cache");
  const key = historyDetailCacheKey("oceanleo", "t-cache");
  assert.equal(peekHistoryDetail(key, () => []), undefined);
  storeHistoryDetail(key, { kind: "task", detail });
  assert.equal(isStaleTaskSeed(detail), false, "a fresh read is not stale (no second GET on first open)");
  const served = peekHistoryDetail(key, (value) => [value.detail]);
  assert.equal(served.detail, detail);
  assert.equal(isStaleTaskSeed(detail), true, "served again from memory: AgentChat reads the task once more");
});

test("HistoryDetail source: no 「加载工作会话…」 text, the whole detail sits in one TaskLoadingGate", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/shell/HistoryMasterDetail.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /加载工作会话/);
  assert.match(source, /<TaskLoadingGate gateKey=\{sel \|\| ""\} hostReady=\{hostReady\}>/);
  const chat = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(chat.slice(chat.indexOf("data-native-opening")-200, chat.indexOf("data-native-opening")+200), /v-spinner/,
    "the native chat's opening state is the same skeleton, not a spinner");
});
