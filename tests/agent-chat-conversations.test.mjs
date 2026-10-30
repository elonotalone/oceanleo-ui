// ============================================================================
// One UI system for computer conversations (redo 2026-10-30, R3 host)
// ----------------------------------------------------------------------------
// Mounts the REAL AgentChat (real SplitWorkspace, AgentTranscriptBubble,
// AgentProgress) and pins what the operator asked for:
//   - nothing new above the stream (no ComputerTaskWorkspace strip);
//   - a computer task opens on its session; the composer's conversation names
//     the computer and program; its OceanLeo target is the computer, never cloud;
//   - `computerSession=cloud` on a computer task does not produce an empty page;
//   - native chat renders through the same bubbles and LeoComposer, sends via
//     the native thread; switching keeps the cloud stream mounted and never stops;
//   - terminal shows the surface + ConversationBar and no LeoComposer;
//   - the settings gear opens the right pane with a title and restores it;
//   - a draft native send creates the session, then sends exactly once.
// Stubbed: network (agent lib, computer-task gateway), LeoComposer (Tiptap),
// the native thread hook, the terminal surface, settings panel, ConversationBar.
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
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/tasks/t1",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator,
  HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement, SVGElement: window.SVGElement,
  Element: window.Element, Node: window.Node, Event: window.Event,
  CustomEvent: window.CustomEvent, KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent, PointerEvent: window.PointerEvent || window.MouseEvent,
  localStorage: window.localStorage, sessionStorage: window.sessionStorage,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.HTMLElement.prototype.scrollTo = function scrollTo() {};
const { createRoot } = await import("react-dom/client");

const reactUrl = JSON.stringify(pathToFileURL(require.resolve("react")).href);
const lazyStub = dataModule(
  "const noop = () => undefined;\nexport default new Proxy(noop, { get: () => noop });\nexport const __stub = true;\n",
);

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const realAgentLibUrl = await compileModule("src/lib/agent.ts", {}, { missingPackageStub: lazyStub });
const agentLibStub = dataModule(`
  export * from ${JSON.stringify(realAgentLibUrl)};
  globalThis.__task = null; globalThis.__stops = 0; globalThis.__followUps = [];
  export async function getTask() {
    return globalThis.__task ? { ok: true, data: globalThis.__task } : { ok: false, status: 404, error: "no task" };
  }
  export async function createTask() { return { ok: false, error: "stub" }; }
  export async function branchTask() { return { ok: false, error: "stub" }; }
  export async function followUp(id, text) { globalThis.__followUps.push(text); return { ok: false, error: "stub" }; }
  export async function stopTask() { globalThis.__stops++; return { ok: true }; }
  export function latestArtifact() { return null; }
`);

// The real computer-task-api helpers over a fake gateway.
const computerTaskApiUrl = await compileModule("src/lib/computer-task-api.ts", {
  "./cloud-computer-api": dataModule(`
    globalThis.__gateway = [];
    export async function cloudComputerRequest(path, init = {}) {
      globalThis.__gateway.push({ path, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
      if (path.startsWith("/v1/computer-task-sessions?")) return { sessions: globalThis.__sessions };
      if (path.endsWith("/task-sessions")) {
        const body = JSON.parse(init.body);
        const session = { id: "cts_new" + globalThis.__gateway.length, task_id: body.task_id || "t_new", computer_id: path.split("/")[3],
          computer_name: "elon", kind: body.kind, program: body.program ?? null, native_session_id: null,
          created_at: "2026-10-30T10:00:00Z", updated_at: "2026-10-30T10:00:00Z", sync_status: "saved" };
        return { task_id: session.task_id, session };
      }
      return { session: {} };
    }
  `),
});
const cloudComputerApiUrl = await compileModule("src/lib/cloud-computer-api.ts", {}, { missingPackageStub: lazyStub });

const OVERRIDES = {
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (zh, vars) => String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }",
  ),
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(url){ (globalThis.__pushed ||= []).push(url); }, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  "../lib/agent": agentLibStub,
  "../lib/computer-task-api": computerTaskApiUrl,
  "../lib/cloud-computer-api": dataModule(`
    export * from ${JSON.stringify(cloudComputerApiUrl)};
    export async function getComputer(id) { return { id, name: "elon", status: "active", node_online: true }; }
  `),
  "./CloudBrowserPanel": dataModule("export function CloudBrowserPanel(){ return null; }"),
  "./ResultCanvas": dataModule(`
    import React from ${reactUrl};
    export function ResultCanvas(){
      React.useEffect(() => { globalThis.__previewMounts = (globalThis.__previewMounts || 0) + 1; return () => { globalThis.__previewMounts--; }; }, []);
      return React.createElement("div", { "data-preview-content": true }, "preview");
    }
    export function CanvasEmpty(){ return null; }
    export function CanvasSubTabs(){ return null; }
  `),
  "./ArtifactRenderer": dataModule("export function ArtifactRenderer(){ return null; }\nexport function artifactToLibraryItem(){ return {}; }"),
  "./MaterialLibrary": dataModule("export function MaterialLibrary(){ return null; }"),
  "./HumanHandoffStatus": dataModule("export function HumanHandoffStatus(){ return null; }"),
  "./quick-actions": dataModule(`
    import React from ${reactUrl};
    export function QuickActionChips(){ return React.createElement("div", { "data-quick-actions": true }); }
  `),
  // Tiptap needs a browser; the stub keeps the props reachable from the DOM node.
  "./LeoComposer": dataModule(`
    import React from ${reactUrl};
    export function LeoComposer(props) {
      const kind = "modelPickerSlot" in props ? "native" : "cloud";
      return React.createElement("div", { "data-leo-composer": kind, ref: (node) => { if (node) node.__props = props; } },
        props.conversation ? (props.conversation.kind === "oceanleo"
          ? (props.conversation.target.kind === "cloud" ? "云端" : props.conversation.target.name)
          : props.conversation.computerName + " · " + (props.conversation.kind === "terminal" ? "终端" : props.conversation.program)) : "—");
    }
  `),
  "./FunctionAgentChat": dataModule(`
    export function EditorCommandNotes(){ return null; }
    export function useEditorCommandBridge(){
      return { contextFor: () => "", captureContext: () => ({context:"",filePin:null}), pending: null, busy: false,
        notes: [], card: null, noteUserTurn(){}, noteOwnTask(){}, ingest(){} };
    }
  `),
  "./agent-review": dataModule(`
    export function AgentReviewPanel(){ return null; }
    export function createReviewGatedReader(){ return null; }
    export const hostReviewSession = {};
    export function installAgentReviewGate(){}
    export function installSelectionBridge(){}
    export function useHostReviewActions(){ return { busy: false, accept(){}, reject(){}, rollback(){} }; }
  `),
  "./plugin-command": dataModule("export function currentPluginCommandSurface(){ return null; }"),
  "./native-thread": dataModule(`
    globalThis.__threadInputs = []; globalThis.__sent = []; globalThis.__threadStops = 0;
    export function useNativeThread(input) {
      globalThis.__threadInputs.push(input);
      const state = globalThis.__thread || {};
      return {
        messages: input.session ? (state.messages || []) : [], running: false,
        ready: Boolean(input.session && input.enabled && state.ready !== false && !state.blockedReason), offline: false,
        blockedReason: input.session ? state.blockedReason || null : null,
        async send(text) { globalThis.__sent.push({ session: input.session && input.session.id, text }); return true; },
        stop() { globalThis.__threadStops++; },
        answer(message, answer) { (globalThis.__answers ||= []).push({ id: message.id, answer }); },
        composerAttachments: [], onAttachFiles: undefined, onRemoveAttachment() {},
        modelPicker: null, hasOlder: false, loadOlder() {}, saveFailed: Boolean(state.saveFailed), dialog: { stub: true },
      };
    }
  `),
  "./cloud-computer/ConversationBar": dataModule(`
    import React from ${reactUrl};
    export function ConversationBar(props) {
      return React.createElement("div", { "data-conversation-bar": true, ref: (node) => { if (node) node.__props = props; } },
        props.conversation.computerName + " · 终端");
    }
  `),
  "./cloud-computer/native-surface": dataModule(`
    import React from ${reactUrl};
    export function NativeTerminalSurface({ session, active }) {
      React.useEffect(() => { globalThis.__surfaceMounts = (globalThis.__surfaceMounts || 0) + 1; return () => { globalThis.__surfaceMounts--; }; }, []);
      return React.createElement("div", { "data-native-surface": session.id, "data-active": String(active) });
    }
    export function NativeSettingsPanel({ conversation, dialog }) {
      return React.createElement("div", { "data-native-settings": conversation.kind, "data-has-dialog": String(Boolean(dialog)) }, "settings body");
    }
    export function nativeSettingsTitle(conversation) {
      return conversation.kind === "terminal" ? "终端设置 · " + conversation.computerName : conversation.program + " 设置 · " + conversation.computerName;
    }
  `),
};

const { AgentChat } = await import(await compileModule("src/shell/AgentChat.tsx", OVERRIDES, { missingPackageStub: lazyStub }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const session = (id, kind, program, updated) => ({
  id, task_id: "t1", computer_id: "cc_elon", computer_name: "elon", kind, program,
  native_session_id: null, created_at: "2026-10-30T09:00:00Z", updated_at: updated, sync_status: "saved",
});
const computerTask = () => ({
  task: { id: "t1", status: "completed", title: "elon · codex", mode: "computer", plan: { computer_workspace: { version: 1 } } },
  messages: [], artifacts: [],
});
const cloudTask = () => ({
  task: { id: "t1", status: "done", title: "同比分析", mode: "agent", plan: {} },
  messages: [
    { id: 1, role: "user", kind: "text", content: "帮我算个同比" },
    { id: 2, role: "assistant", kind: "text", content: "同比增长 12%。", meta: { done: true } },
  ],
  artifacts: [],
});
const NATIVE_MESSAGES = [
  { id: -11, role: "user", kind: "text", content: "在 Codex 里看一下日志" },
  { id: -12, role: "assistant", kind: "step", content: "读取 server.log", meta: { step_index: 1, native_tool: true } },
  { id: -13, role: "assistant", kind: "text", content: "日志里没有错误。", meta: { final: true } },
];

async function settle(ms = 40) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

async function mount(props, { task, sessions = [], url = "/tasks/t1" } = {}) {
  window.history.replaceState(null, "", url);
  globalThis.__task = task ?? null;
  globalThis.__sessions = sessions;
  globalThis.__gateway.length = 0;
  globalThis.__sent.length = 0;
  globalThis.__pushed = [];
  globalThis.__stops = 0;
  globalThis.__threadStops = 0;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(AgentChat, { siteId: "oceanleo", ...props })); });
  await settle();
  await settle();
  return {
    host,
    composer: (kind) => host.querySelector(`[data-leo-composer="${kind}"]`),
    async unmount() { await act(async () => root.unmount()); host.remove(); globalThis.__task = null; },
  };
}
const visible = (node) => {
  for (let el = node; el; el = el.parentElement) if (el.hidden) return false;
  return Boolean(node);
};
async function changeConversation(view, kind, next) {
  await act(async () => { view.composer(kind).__props.onConversationChange(next); await new Promise((r) => setTimeout(r, 0)); });
  await settle();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("computer task opens on its latest session, nothing above the stream, OceanLeo target is the computer", async () => {
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(),
    sessions: [session("cts_old", "acp", "claude", "2026-10-30T09:00:00Z"), session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")],
  });
  try {
    assert.equal(view.host.querySelector("[data-computer-task-workspace]"), null, "the old strip must be gone");
    assert.equal(view.host.querySelector('[aria-label="设备与会话"]'), null);
    assert.doesNotMatch(view.host.textContent, /图形|独立 CLI|Conversation|云端记录正在同步|查看云端保存的对话/);
    const native = view.composer("native");
    assert.ok(visible(native), "the native composer is in front");
    assert.equal(native.textContent, "elon · codex");
    assert.equal(native.__props.conversation.sessionId, "cts_codex");
    assert.deepEqual(native.__props.boundExecutionTarget, { kind: "computer", id: "cc_elon", name: "elon" },
      "a computer task is bound to its computer, never cloud");
    assert.match(window.location.search, /computerSession=cts_codex/);
    // The left pane holds stream wrappers only; no element precedes the stream.
    const left = view.host.querySelector('[data-agent-stream="cloud"]').parentElement.parentElement;
    for (const child of left.children) {
      assert.ok(child.querySelector("[data-agent-stream]") || child.querySelector("[data-native-surface]"),
        `unexpected element in the left pane: ${child.outerHTML.slice(0, 120)}`);
    }
  } finally { await view.unmount(); }
});

test("computerSession=cloud on a computer task opens its session instead of an empty page and strips the param", async () => {
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")],
    url: "/tasks/t1?computerSession=cloud",
  });
  try {
    assert.doesNotMatch(window.location.search, /computerSession=cloud/);
    assert.match(window.location.search, /computerSession=cts_codex/);
    assert.ok(visible(view.composer("native")));
    assert.doesNotMatch(view.host.textContent, /打开云端新任务/);
  } finally { await view.unmount(); }
});

test("native chat renders mapped messages through the host bubbles and LeoComposer; send goes to the thread", async () => {
  globalThis.__thread = { messages: NATIVE_MESSAGES, saveFailed: true };
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const pane = view.host.querySelector('[data-agent-stream="native"]');
    assert.ok(pane.textContent.includes("在 Codex 里看一下日志"), "user bubble");
    assert.ok(pane.textContent.includes("日志里没有错误。"), "assistant markdown");
    assert.equal(pane.querySelector("[data-oceanleo-cc-composer]"), null, "no Computers-page composer");
    assert.equal(pane.querySelector("[data-quick-actions]"), null, "no quick-action chips for native");
    assert.ok(pane.querySelector("[data-native-save-failed]"), "one quiet save-failed line");
    // Same composer component, with the native model slot.
    const composer = view.composer("native");
    assert.ok(pane.contains(composer));
    await act(async () => { composer.__props.onChange("继续"); });
    await act(async () => { view.composer("native").__props.onSubmit("继续"); await new Promise((r) => setTimeout(r, 0)); });
    assert.deepEqual(globalThis.__sent.at(-1), { session: "cts_codex", text: "继续" });
    assert.deepEqual(globalThis.__followUps, [], "a native send never goes to the cloud task");
  } finally { await view.unmount(); globalThis.__thread = null; }
});

test("switching keeps the cloud stream mounted, never stops a run, and reuses an existing session", async () => {
  const view = await mount({ taskId: "t1" }, {
    task: cloudTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")],
  });
  try {
    const cloudPane = view.host.querySelector('[data-agent-stream="cloud"]');
    assert.ok(visible(cloudPane), "a cloud task opens on its OceanLeo conversation");
    assert.ok(cloudPane.textContent.includes("同比增长 12%。"));
    assert.equal(view.composer("cloud").textContent, "云端");
    await changeConversation(view, "cloud", { kind: "native", computerId: "cc_elon", computerName: "elon", program: "codex", view: "chat" });
    assert.equal(globalThis.__gateway.filter((call) => call.method === "POST").length, 0, "existing session reused");
    assert.match(window.location.search, /computerSession=cts_codex/);
    assert.equal(view.host.querySelector('[data-agent-stream="cloud"]'), cloudPane, "cloud stream stays mounted");
    assert.equal(visible(cloudPane), false);
    await changeConversation(view, "native", { kind: "oceanleo", target: { kind: "cloud" } });
    assert.ok(visible(cloudPane));
    assert.doesNotMatch(window.location.search, /computerSession/);
    assert.equal(globalThis.__stops + globalThis.__threadStops, 0, "switching never stops anything");
  } finally { await view.unmount(); }
});

test("terminal shows the surface with ConversationBar and no LeoComposer; settings open the right pane and restore it", async () => {
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(), sessions: [session("cts_term", "terminal", null, "2026-10-30T11:00:00Z")],
  });
  try {
    const surface = view.host.querySelector('[data-native-surface="cts_term"]');
    assert.ok(visible(surface));
    const bar = view.host.querySelector("[data-conversation-bar]");
    assert.ok(visible(bar));
    assert.equal(bar.__props.conversation.kind, "terminal");
    assert.ok(![...view.host.querySelectorAll("[data-leo-composer]")].some(visible), "no visible LeoComposer under a terminal");
    const preview = view.host.querySelector("[data-preview-content]");
    assert.ok(preview, "right content mounted");
    await act(async () => { bar.__props.onOpenSettings(); });
    await settle();
    const settings = view.host.querySelector('[data-native-settings="terminal"]');
    assert.ok(visible(settings), "settings shown in the right pane");
    assert.ok(view.host.textContent.includes("终端设置 · elon"), "pane titled for the conversation");
    assert.equal(visible(preview), false, "previous right content hidden, not unmounted");
    await act(async () => { view.host.querySelector("[data-conversation-bar]").__props.onOpenSettings(); });
    await settle();
    assert.equal(view.host.querySelector("[data-native-settings]"), null);
    assert.equal(view.host.querySelector("[data-preview-content]"), preview, "same right content instance restored");
    assert.equal(globalThis.__surfaceMounts, 1);
  } finally { await view.unmount(); }
});

test("draft native chat: the first send creates the session, navigates, and the task page sends it once", async () => {
  const draft = await mount({}, { url: "/" });
  let created;
  try {
    await changeConversation(draft, "cloud", { kind: "native", computerId: "cc_elon", computerName: "elon", program: "codex", view: "chat" });
    assert.equal(globalThis.__gateway.filter((call) => call.method === "POST").length, 0, "selection alone creates nothing");
    const composer = draft.composer("native");
    assert.ok(visible(composer));
    await act(async () => { composer.__props.onSubmit("看看日志"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    created = globalThis.__gateway.find((call) => call.method === "POST");
    assert.ok(created, "the send created the managed session");
    assert.equal(created.body.kind, "acp");
    assert.equal(created.body.program, "codex");
    assert.equal(created.body.task_id, undefined);
    assert.match(globalThis.__pushed.at(-1), /\/tasks\/t_new\?computerSession=cts_new/);
    assert.deepEqual(globalThis.__sent, [], "nothing is sent before the conversation is connected");
  } finally { await draft.unmount(); }
  const sid = decodeURIComponent(globalThis.__pushed.at(-1).split("computerSession=")[1]);
  const page = await mount({ taskId: "t1" }, {
    task: computerTask(), sessions: [session(sid, "acp", "codex", "2026-10-30T11:00:00Z")], url: `/tasks/t1?computerSession=${sid}`,
  });
  try {
    await settle();
    assert.deepEqual(globalThis.__sent, [{ session: sid, text: "看看日志" }], "sent exactly once");
  } finally { await page.unmount(); }
  // A second page for the same session does not resend.
  const again = await mount({ taskId: "t1" }, {
    task: computerTask(), sessions: [session(sid, "acp", "codex", "2026-10-30T11:00:00Z")], url: `/tasks/t1?computerSession=${sid}`,
  });
  try { assert.deepEqual(globalThis.__sent, []); } finally { await again.unmount(); }
});

test("in a task, a conversation without a session is created with the task id and never executes", async () => {
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: [] });
  try {
    await changeConversation(view, "cloud", { kind: "terminal", computerId: "cc_elon", computerName: "elon" });
    const post = globalThis.__gateway.find((call) => call.method === "POST");
    assert.equal(post.body.task_id, "t1");
    assert.equal(post.body.kind, "terminal");
    assert.equal(post.body.program, null);
    assert.ok(visible(view.host.querySelector("[data-native-surface]")));
    assert.match(window.location.search, /computerSession=cts_new/);
    assert.deepEqual(globalThis.__pushed, [], "in a task no navigation happens");
  } finally { await view.unmount(); }
});

test("a send blocked because the program needs setup opens the settings pane instead of sending", async () => {
  globalThis.__thread = { messages: [], blockedReason: "这台电脑上还没有安装 Codex，请在设置里安装。" };
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const composer = view.composer("native");
    assert.equal(composer.__props.disabled, false, "setup-blocked composer stays usable so Send leads to settings");
    assert.ok(view.host.querySelector("[data-native-blocked]").textContent.includes("还没有安装"));
    await act(async () => { composer.__props.onSubmit("你好"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    assert.deepEqual(globalThis.__sent, [], "nothing sent");
    const settings = view.host.querySelector('[data-native-settings="native"]');
    assert.ok(visible(settings), "settings opened in the right pane");
    assert.equal(settings.getAttribute("data-has-dialog"), "true", "the panel gets the live thread.dialog");
    assert.ok(view.host.textContent.includes("codex 设置 · elon"));
  } finally { await view.unmount(); globalThis.__thread = null; }
});

test("pending native prompt helpers: removed before returned, stale entries discarded", async () => {
  const api = await import(computerTaskApiUrl);
  api.stashPendingNativePrompt("cts_x", "你好");
  assert.ok(window.sessionStorage.getItem("oceanleo.pending-native-prompt:cts_x"));
  assert.equal(api.takePendingNativePrompt("cts_x"), "你好");
  assert.equal(window.sessionStorage.getItem("oceanleo.pending-native-prompt:cts_x"), null);
  assert.equal(api.takePendingNativePrompt("cts_x"), null);
  window.sessionStorage.setItem("oceanleo.pending-native-prompt:cts_old", JSON.stringify({ text: "旧的", queued_at: Date.now() - 11 * 60 * 1000 }));
  assert.equal(api.takePendingNativePrompt("cts_old"), null);
  assert.equal(window.sessionStorage.getItem("oceanleo.pending-native-prompt:cts_old"), null);
});

// The legacy deep-link import moved from task-host/ into a small host helper; behavior kept.
const { ComputerTaskImport } = await import(await compileModule("src/shell/cloud-computer/computer-task-import.tsx", {
  "../../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
  "next/navigation": dataModule(
    "export function useRouter(){ return { replace(url){ globalThis.__forward = url; } }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams('card=cli&program=codex&session=known-native'); }",
  ),
  "../../lib/computer-task-api": dataModule(
    "globalThis.__imports = [];\nexport async function createComputerTaskSession(id, input){ globalThis.__imports.push({ id, input }); return { task_id: 'existing', session: { id: 'managed' } }; }",
  ),
}));

test("legacy deep link imports only its named native session into the task and forwards once", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(React.StrictMode, null, React.createElement(ComputerTaskImport, { computerId: "cc", taskId: "existing" })));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  try {
    assert.equal(globalThis.__imports.length, 1, "imports exactly once under StrictMode");
    assert.deepEqual(globalThis.__imports[0].input, {
      kind: "cli", program: "codex", task_id: "existing", native_session_id: "known-native", request_id: globalThis.__imports[0].input.request_id,
    });
    assert.equal(globalThis.__forward, "/tasks/existing?computerSession=managed");
    assert.match(host.textContent, /正在打开对话/);
    assert.equal(host.querySelector("a.underline, .underline"), null, "no underlined text link as a control");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
