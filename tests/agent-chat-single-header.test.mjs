// ============================================================================
// agent 对话区**只有一行**顶栏（操作员 2026-09-07：图 466f833a 布局 + 3f9d0f8c 图标
// + 662b8bb0 搜索态）
// ----------------------------------------------------------------------------
// 上一轮（2026-09-06）的交付物核对失败在「验证了测试、没验证界面」：typecheck 绿、
// 既有测试绿，但 `AgentChat.tsx` 里仍是 `topBar`（返回行）+ SplitWorkspace 的
// PaneHeader（"agent" 行）两行。所以这份测试**挂起真的 AgentChat**（真 SplitWorkspace、
// 真 AgentTranscriptBubble），按渲染结果钉：
//
//   1. 有 onBack 与无 onBack 两种形态下，DOM 里都只有一个 `[data-oceanleo-pane-header]`；
//   2. 顶栏里没有字面 "agent"；标题 = task.title，没有 title 时按有没有消息给占位；
//   3. 右侧三个图标按序：搜索 / 分享 / 展开（右栏开关）；没有全屏键；
//   4. onBack 是一枚图标键（title=返回，不带文字），点击只调回调；
//   5. 点搜索 → 同一行出现输入框；命中计数 n/N、Enter / Shift+Enter 换项、Esc 关闭；
//      当前项带 `data-active="true"`（命中高亮本身由 AgentTranscriptBubble 渲染）；
//   6. 正文区不再浮着第二个「分享」入口。
//
// 只桩「要联网 / 要 Next 运行时 / 与顶栏无关的重组件」，其余编真源码（见 OVERRIDES）。
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
window.HTMLElement.prototype.scrollTo = function scrollTo() {};

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
  export async function getTask() {
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

const { AgentChat } = await import(
  await compileModule("src/shell/AgentChat.tsx", OVERRIDES, {
    missingPackageStub: lazyStub,
  })
);

// ---------------------------------------------------------------------------
// 会话样本与挂载
// ---------------------------------------------------------------------------

const MESSAGES = [
  { id: 1, role: "user", kind: "text", content: "帮我算个同比" },
  { id: 2, role: "assistant", kind: "text", content: "同比增长 12%。同比口径按去年同期。", meta: { done: true } },
];

function taskData({ title = "同比分析", messages = MESSAGES } = {}) {
  return {
    task: { id: "t1", status: "done", title, site_id: "leoimage" },
    messages,
    artifacts: [],
  };
}

async function settle(ms = 60) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mountChat(props, task = taskData()) {
  globalThis.__task = task;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(AgentChat, { siteId: "leoimage", ...props }),
    );
  });
  // 首次 refresh 是 effect 里的 await getTask：给它一拍落地。
  await settle();
  return {
    host,
    header: () => host.querySelector("[data-oceanleo-pane-header]"),
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
      globalThis.__task = null;
    },
  };
}

async function click(target) {
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

async function type(input, value) {
  await act(async () => {
    // React 16+ 的受控 input 要绕过它自己的值追踪器才认得出 change。
    const tracker = input._valueTracker;
    input.value = value;
    if (tracker) tracker.setValue("");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

async function key(target, key, init = {}) {
  await act(async () => {
    target.dispatchEvent(
      new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
    await Promise.resolve();
  });
}

const buttonsByTitle = (root) =>
  [...root.querySelectorAll("button")].map((button) => button.getAttribute("title"));

// ---------------------------------------------------------------------------
// 1 只有一行、没有 "agent"、三个图标按序、没有全屏键
// ---------------------------------------------------------------------------

test("无 onBack：对话区只有一行顶栏，标题 = 对话总结，右侧 搜索/分享/展开 按序，没有全屏键", async () => {
  const view = await mountChat({ taskId: "t1" });
  try {
    const headers = view.host.querySelectorAll("[data-oceanleo-pane-header]");
    assert.equal(headers.length, 1, "对话区必须只有一行顶栏");
    const header = headers[0];
    assert.doesNotMatch(header.textContent, /agent/i, "顶栏左侧不许再出现字面 agent");
    assert.ok(header.textContent.includes("同比分析"), "顶栏标题应是 task.title");
    assert.equal(header.querySelector('button[title="返回"]'), null, "没给 onBack 就没有返回键");

    const titles = buttonsByTitle(header).filter(Boolean);
    const search = titles.indexOf("搜索");
    const share = titles.indexOf("分享");
    const toggle = titles.indexOf("展开");
    assert.ok(search >= 0, `缺「搜索」键：${JSON.stringify(titles)}`);
    assert.ok(share >= 0, `缺「分享」键：${JSON.stringify(titles)}`);
    assert.ok(toggle >= 0, `缺「展开」（右栏开关）键：${JSON.stringify(titles)}`);
    assert.ok(search < share && share < toggle, `三个图标顺序应为 搜索 → 分享 → 展开，实际 ${JSON.stringify(titles)}`);

    for (const label of ["这一栏切大屏", "恢复双栏"]) {
      assert.equal(
        view.host.querySelector(`button[aria-label="${label}"]`),
        null,
        `全屏键「${label}」应已删除`,
      );
    }
    // 正文区不再浮着第二个「分享」入口：整个 DOM 里只有顶栏那一个 ShareEntryButton
    // （箭头图标）。每条 assistant 气泡自带的「分享」动作键（三点连线图标）是另一回事，
    // 靶它的 <circle> 把两者分开。
    const entryButtons = [...view.host.querySelectorAll('button[title="分享"]')].filter(
      (button) => !button.querySelector("circle"),
    );
    assert.equal(entryButtons.length, 1, "只该有一枚 ShareEntryButton");
    assert.ok(entryButtons[0].closest("[data-oceanleo-pane-header]"), "它必须在顶栏里");
    assert.equal(view.host.querySelector(".overflow-y-auto .sticky"), null);
  } finally {
    await view.unmount();
  }
});

test("有 onBack：仍只有一行；最左是图标返回键（无文字），点击只调回调", async () => {
  let backs = 0;
  const view = await mountChat({
    taskId: "t1",
    onBack: () => {
      backs += 1;
    },
  });
  try {
    assert.equal(view.host.querySelectorAll("[data-oceanleo-pane-header]").length, 1);
    const header = view.header();
    const buttons = [...header.querySelectorAll("button")];
    assert.equal(buttons[0]?.getAttribute("title"), "返回", "返回键应是顶栏最左第一枚");
    assert.equal(buttons[0].textContent.trim(), "", "返回键只有图标，不带文字");
    assert.doesNotMatch(header.textContent, /返回|agent/i);
    await click(buttons[0]);
    assert.equal(backs, 1);
  } finally {
    await view.unmount();
  }
});

test("backLabel 只改返回键的 title；自定义 headerExtra 渲染在搜索图标之前", async () => {
  const view = await mountChat({
    taskId: "t1",
    onBack: () => {},
    backLabel: "回首页",
    headerExtra: React.createElement("span", { "data-test-extra": true }, "运行中"),
  });
  try {
    const header = view.header();
    assert.ok(header.querySelector('button[title="回首页"]'));
    const extra = header.querySelector("[data-test-extra]");
    const search = header.querySelector('button[title="搜索"]');
    assert.ok(extra, "headerExtra 没渲染进顶栏");
    assert.ok(
      extra.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING,
      "headerExtra 应排在搜索图标之前",
    );
  } finally {
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// 2 标题占位
// ---------------------------------------------------------------------------

test("没有对话总结时：有消息 → 正在总结本次对话…；没消息 → 新任务", async () => {
  const summarizing = await mountChat({ taskId: "t1" }, taskData({ title: "" }));
  try {
    assert.ok(summarizing.header().textContent.includes("正在总结本次对话…"));
  } finally {
    await summarizing.unmount();
  }
  const fresh = await mountChat({}, null);
  try {
    assert.equal(fresh.host.querySelectorAll("[data-oceanleo-pane-header]").length, 1);
    assert.ok(fresh.header().textContent.includes("新任务"));
    assert.doesNotMatch(fresh.header().textContent, /agent/i);
  } finally {
    await fresh.unmount();
  }
});

// ---------------------------------------------------------------------------
// 3 搜索态
// ---------------------------------------------------------------------------

test("点搜索 → 同一行展开输入框；命中计数与 Enter / Shift+Enter / Esc 导航", async () => {
  const view = await mountChat({ taskId: "t1" });
  try {
    const header = view.header();
    await click(header.querySelector('button[title="搜索"]'));
    const input = view.header().querySelector('input[placeholder="搜索对话"]');
    assert.ok(input, "点搜索后顶栏里应出现输入框");
    assert.ok(
      input.closest("[data-oceanleo-pane-header]"),
      "输入框必须就在那一行顶栏里，不是另起一行",
    );
    assert.equal(view.host.querySelectorAll("[data-oceanleo-pane-header]").length, 1);
    const count = () =>
      view.header().querySelector("[data-agent-chat-search-count]").textContent.trim();
    assert.equal(count(), "0/0", "空词时显示 0/0");

    await type(input, "同比");
    await settle(20);
    const hits = view.host.querySelectorAll("[data-leo-search-hit]");
    assert.ok(
      hits.length >= 2,
      `样本里「同比」出现 ≥2 次，气泡应把命中包成 [data-leo-search-hit]（实测 ${hits.length}）`,
    );
    assert.equal(count(), `1/${hits.length}`);
    const activeOf = () =>
      [...view.host.querySelectorAll("[data-leo-search-hit]")].findIndex(
        (hit) => hit.getAttribute("data-active") === "true",
      );
    assert.equal(activeOf(), 0, "首个命中应带 data-active");
    assert.equal(
      view.host.querySelectorAll('[data-leo-search-hit][data-active="true"]').length,
      1,
      "同时只能有一个当前项",
    );

    await key(input, "Enter");
    await settle(20);
    assert.equal(count(), `2/${hits.length}`);
    assert.equal(activeOf(), 1);

    await key(input, "Enter", { shiftKey: true });
    await settle(20);
    assert.equal(count(), `1/${hits.length}`);
    assert.equal(activeOf(), 0);

    // ▲ / ▼ 两枚键与快捷键同义。
    await click(view.header().querySelector('button[title="下一项"]'));
    await settle(20);
    assert.equal(activeOf(), 1);
    await click(view.header().querySelector('button[title="上一项"]'));
    await settle(20);
    assert.equal(activeOf(), 0);

    await key(input, "Escape");
    await settle(20);
    assert.equal(view.header().querySelector('input[placeholder="搜索对话"]'), null, "Esc 应关闭搜索");
    assert.ok(view.header().querySelector('button[title="搜索"]'), "关闭后搜索图标回来");
    assert.equal(
      view.host.querySelectorAll("[data-leo-search-hit]").length,
      0,
      "关闭并清空后不再有命中高亮",
    );
  } finally {
    await view.unmount();
  }
});

test("搜不到的词显示 0/0，上一项/下一项禁用；✕ 关闭并清空", async () => {
  const view = await mountChat({ taskId: "t1" });
  try {
    await click(view.header().querySelector('button[title="搜索"]'));
    const input = view.header().querySelector('input[placeholder="搜索对话"]');
    await type(input, "这个词不存在");
    await settle(20);
    assert.equal(
      view.header().querySelector("[data-agent-chat-search-count]").textContent.trim(),
      "0/0",
    );
    assert.equal(view.header().querySelector('button[title="上一项"]').disabled, true);
    assert.equal(view.header().querySelector('button[title="下一项"]').disabled, true);
    await click(view.header().querySelector('button[title="关闭"]'));
    assert.equal(view.header().querySelector("[data-agent-chat-search]"), null);
  } finally {
    await view.unmount();
  }
});
