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
      if (path.startsWith("/v1/computer-task-sessions?")) {
        if (globalThis.__listHang) return new Promise(() => {});
        if (globalThis.__listFails > 0) { globalThis.__listFails--; throw Object.assign(new Error("offline"), { status: 503 }); }
        return { sessions: globalThis.__sessions };
      }
      if (path.endsWith("/task-sessions")) {
        if (globalThis.__createFails) throw Object.assign(new Error("create failed"), { status: 503 });
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
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }",
);
// One SplitWorkspace instance shared by AgentChat and the ResultCanvas stub (same context).
const splitWorkspaceUrl = await compileModule("src/shell/SplitWorkspace.tsx", { "../i18n/ui/useUI": uiStub }, { missingPackageStub: lazyStub });
const cloudComputerApiUrl = await compileModule("src/lib/cloud-computer-api.ts", {}, { missingPackageStub: lazyStub });

const OVERRIDES = {
  "../i18n/ui/useUI": uiStub,
  "./SplitWorkspace": splitWorkspaceUrl,
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(url){ (globalThis.__pushed ||= []).push(url); }, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  "../lib/agent": agentLibStub,
  "../lib/computer-task-api": computerTaskApiUrl,
  "../lib/cloud-computer-api": dataModule(`
    export * from ${JSON.stringify(cloudComputerApiUrl)};
    export async function getComputer(id) {
      if (globalThis.__computerMode === "hang") return new Promise(() => {});
      if (globalThis.__computerMode === "offline") return { id, name: "elon", status: "active", node_online: false };
      return { id, name: "elon", status: "active", node_online: true };
    }
  `),
  "./CloudBrowserPanel": dataModule("export function CloudBrowserPanel(){ return null; }"),
  "./ResultCanvas": dataModule(`
    import React from ${reactUrl};
    import { useRightPaneSlot } from ${JSON.stringify(splitWorkspaceUrl)};
    export function ResultCanvas(){
      const slot = useRightPaneSlot();
      // Like an editor header: claims the right pane's title while mounted (even hidden).
      React.useEffect(() => { slot?.setRightPaneClaim("stub-editor", { label: React.createElement("span", null, "编辑器标题"), editorHeader: true, frameless: false }); return () => slot?.clearRightPaneClaim("stub-editor"); }, [slot]);
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
  // The thread stub keeps the real hook's pending contract: queue() shows the bubble at
  // once, it goes out once ready, a blocked one is marked unsent (never handed back).
  "./native-thread": dataModule(`
    import React from ${reactUrl};
    globalThis.__threadInputs = []; globalThis.__sent = []; globalThis.__threadStops = 0;
    export function useNativeThread(input) {
      globalThis.__threadInputs.push(input);
      const state = { ...(globalThis.__thread || {}) };
      const live = Boolean(input.session && input.enabled && input.computer && input.computer.node_online && state.live !== false);
      const ready = live && !state.blockedReason && state.ready !== false;
      const blockedReason = input.session ? state.blockedReason || null : null;
      const [pending, setPending] = React.useState(null);
      const pendingRef = React.useRef(pending);
      pendingRef.current = pending;
      const send = async (text) => { globalThis.__sent.push({ session: input.session && input.session.id, text }); return state.sendResult ?? true; };
      React.useEffect(() => {
        if (!pending || pending.unsent || pending.sending) return;
        if (ready) {
          const sending = { ...pending, sending: true };
          setPending(sending);
          void send(pending.text).then((ok) => setPending((current) => current === sending ? (ok ? null : { ...pending, unsent: "没能发出去，请重试。" }) : current));
        } else if (blockedReason && input.computer) setPending({ ...pending, unsent: blockedReason });
      }, [pending, ready, blockedReason]);
      const bubble = pending ? [{ id: -2147483648, role: "user", kind: "text", content: pending.text, meta: { native: true, native_pending: true, ...(pending.unsent ? { native_unsent: true } : {}) } }] : [];
      return {
        messages: [...(input.session ? (state.messages || []) : []), ...bubble], live, draft: !input.session, running: false,
        ready,
        offline: Boolean(input.computer && !input.computer.node_online),
        blockedReason,
        send,
        stop() { globalThis.__threadStops++; },
        answer(message, answer) { (globalThis.__answers ||= []).push({ id: message.id, answer }); },
        composerAttachments: state.attachments || [], onAttachFiles: undefined, onRemoveAttachment() {},
        modelPicker: null, hasOlder: false, loadOlder() {}, saveFailed: Boolean(state.saveFailed), dialog: { stub: true, activeSession: "" },
        pending: pending ? { text: pending.text, unsent: pending.unsent ?? null } : null,
        queue(text) {
          if (pendingRef.current && !pendingRef.current.unsent) return false;
          if (!text && !(state.attachments || []).length) return false;
          (globalThis.__queued ||= []).push(text);
          const next = { text, unsent: null };
          pendingRef.current = next;
          setPending(next);
          return true;
        },
        markUnsent(reason) { setPending((current) => current && !current.unsent ? { ...current, sending: false, unsent: reason } : current); },
        retry() { setPending((current) => current && current.unsent ? { text: current.text, unsent: null } : current); },
      };
    }
  `),
  "./cloud-computer/ConversationBar": dataModule(`
    import React from ${reactUrl};
    export function ConversationBar(props) {
      globalThis.__barProps = props;
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

async function mount(props, { task, sessions = [], url = "/tasks/t1", listFails = 0, createFails = false, computerMode, listHang = false } = {}) {
  window.history.replaceState(null, "", url);
  globalThis.__listFails = listFails;
  globalThis.__listHang = listHang;
  globalThis.__queued = [];
  globalThis.__createFails = createFails;
  globalThis.__computerMode = computerMode;
  globalThis.__barProps = null;
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
    rerender(next) { root.render(React.createElement(AgentChat, { siteId: "oceanleo", ...next })); },
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

test("draft native chat: the first send creates the session, the page adopts the task in place and sends once (no second navigation)", async () => {
  const created = [];
  const draft = await mount({ onTaskCreated: (id) => created.push(id) }, { url: "/" });
  try {
    await changeConversation(draft, "cloud", { kind: "native", computerId: "cc_elon", computerName: "elon", program: "codex", view: "chat" });
    assert.equal(globalThis.__gateway.filter((call) => call.method === "POST").length, 0, "selection alone creates nothing");
    const draftInput = globalThis.__threadInputs.at(-1);
    assert.equal(draftInput.session, null);
    assert.equal(draftInput.program, "codex", "a picked chat connects for status and models (draft mode)");
    assert.equal(draftInput.enabled, true);
    const composer = draft.composer("native");
    assert.ok(visible(composer));
    assert.equal(composer.__props.conversation.kind, "native", "the composer gets the controlled conversation");
    await act(async () => { composer.__props.onSubmit("看看日志"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    await settle();
    const post = globalThis.__gateway.find((call) => call.method === "POST");
    assert.ok(post, "the send created the managed session");
    assert.equal(post.body.kind, "acp");
    assert.equal(post.body.program, "codex");
    assert.equal(post.body.task_id, undefined);
    assert.deepEqual(created, ["t_new"], "the host is told once");
    assert.deepEqual(globalThis.__pushed, [], "no router push on top of onTaskCreated (and no cross-origin hop)");
    const sid = post.body && globalThis.__sent.at(-1)?.session;
    assert.deepEqual(globalThis.__sent.map((row) => row.text), ["看看日志"], "sent exactly once, in place");
    assert.match(sid, /^cts_new/);
  } finally { await draft.unmount(); }
});

test("in a task, picking 对话 for a program without a session creates nothing; the first send creates it with the task id", async () => {
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: [] });
  try {
    await changeConversation(view, "cloud", { kind: "native", computerId: "cc_elon", computerName: "elon", program: "claude", view: "chat" });
    assert.equal(globalThis.__gateway.filter((call) => call.method === "POST").length, 0);
    const composer = view.composer("native");
    assert.ok(visible(composer), "an empty native pane with a ready composer");
    assert.equal(composer.__props.disabled, false);
    await act(async () => { composer.__props.onSubmit("你好"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    await settle();
    const post = globalThis.__gateway.find((call) => call.method === "POST");
    assert.equal(post.body.task_id, "t1");
    assert.equal(post.body.program, "claude");
    assert.deepEqual(globalThis.__sent.map((row) => row.text), ["你好"]);
    assert.match(window.location.search, /computerSession=cts_new/);
  } finally { await view.unmount(); }
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

test("re-entry while the session is still opening: the composer is usable and Enter queues (正在打开对话…), then sends once", async () => {
  // Known computer (no 正在连接…) but the link / occupancy is not read yet: not ready, not blocked.
  globalThis.__thread = { messages: NATIVE_MESSAGES, ready: false };
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const composer = view.composer("native");
    assert.equal(composer.__props.disabled, false, "typing is never blocked by an unknown state");
    await act(async () => { composer.__props.onChange("继续看"); });
    await act(async () => { view.composer("native").__props.onSubmit("继续看"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    const pane = view.host.querySelector('[data-agent-stream="native"]');
    assert.deepEqual(globalThis.__queued, ["继续看"], "Enter is not dropped: the prompt is queued");
    assert.deepEqual(globalThis.__sent, [], "not sent before the session is ready");
    assert.ok(pane.textContent.includes("继续看"), "the user's bubble shows at once");
    assert.equal(view.composer("native").__props.value, "", "the text moved into the bubble");
    assert.match(pane.querySelector("[data-native-blocked]").textContent, /正在打开对话…/);
    // The session becomes ready: it goes out by itself, once.
    globalThis.__thread = { messages: NATIVE_MESSAGES };
    await act(async () => { view.composer("native").__props.onChange("x"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    assert.deepEqual(globalThis.__sent, [{ session: "cts_codex", text: "继续看" }]);
    assert.equal(pane.querySelector("[data-native-blocked]"), null, "the opening line is gone");
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

test("a failed pick shows in the visible (cloud) stream and nothing switches", async () => {
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: [], createFails: true });
  try {
    await changeConversation(view, "cloud", { kind: "terminal", computerId: "cc_elon", computerName: "elon" });
    const pane = view.host.querySelector('[data-agent-stream="cloud"]');
    assert.ok(visible(pane));
    assert.ok(pane.querySelector("[data-agent-chat-error]").textContent.includes("没能打开这段对话"));
    assert.equal(view.composer("cloud").__props.conversation.kind, "oceanleo", "the Device label stays on the old conversation");
    assert.doesNotMatch(window.location.search, /computerSession/);
  } finally { await view.unmount(); }
});

test("an unreadable session list keeps the URL, shows one line with retry, and recovers", async () => {
  // A session this tab has never seen (a seen one would show at once from memory).
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(), sessions: [session("cts_unread", "acp", "codex", "2026-10-30T11:00:00Z")],
    url: "/tasks/t1?computerSession=cts_unread", listFails: 1,
  });
  try {
    assert.match(window.location.search, /computerSession=cts_unread/, "the param is kept while the list cannot be read");
    const notice = [...view.host.querySelectorAll("[data-computer-sessions-failed]")].find(visible);
    assert.ok(visible(notice));
    await act(async () => { notice.querySelector("button").click(); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    assert.equal(view.host.querySelector("[data-computer-sessions-failed]"), null);
    assert.ok(visible(view.composer("native")));
    assert.equal(view.composer("native").__props.conversation.sessionId, "cts_unread");
  } finally { await view.unmount(); }
});

test("a computer whose state is not known yet says 正在连接…, not offline, and the composer stays usable", async () => {
  globalThis.__thread = { blockedReason: "这台电脑离线，只能查看已保存的对话。" };
  const view = await mount({ taskId: "t1" }, {
    // A computer this tab has never read (earlier tests read cc_elon, which would count as known).
    task: computerTask(), sessions: [{ ...session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z"), computer_id: "cc_never_read" }], computerMode: "hang",
  });
  try {
    const pane = view.host.querySelector('[data-agent-stream="native"]');
    assert.ok(pane.querySelector("[data-native-blocked]").textContent.includes("正在连接…"));
    assert.doesNotMatch(pane.textContent, /离线/);
    assert.ok(pane.textContent.includes("正在打开对话…"), "plain empty hint");
    assert.equal(view.composer("native").__props.disabled, false);
  } finally { await view.unmount(); globalThis.__thread = null; }
});

test("offline: saved transcript gates are read-only (no onNativeAnswer) and the composer is read-only", async () => {
  globalThis.__thread = { messages: [
    { id: -21, role: "assistant", kind: "gate", content: "允许运行 npm test？", meta: { gate_prompt: "允许运行 npm test？",
      native_permission: { permId: "p1", options: [{ id: "allow", name: "允许", kind: "allow_once" }], chosen: null } } },
  ] };
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")], computerMode: "offline",
  });
  try {
    const pane = view.host.querySelector('[data-agent-stream="native"]');
    const option = pane.querySelector("[data-native-permission-option]");
    assert.ok(option, "the gate renders");
    assert.equal(option.disabled, true, "no answer button is active while not live");
    assert.equal(view.composer("native").__props.disabled, true);
  } finally { await view.unmount(); globalThis.__thread = null; }
});

test("a queued first prompt that cannot go out is never handed back silently: bubble stays, 未发送 with the reason and a retry, settings open", async () => {
  window.sessionStorage.setItem("oceanleo.pending-native-prompt:cts_codex", JSON.stringify({ text: "先跑测试", queued_at: Date.now() }));
  globalThis.__thread = { blockedReason: "Codex 还没有登录，请在设置里登录。" };
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    await settle();
    const pane = view.host.querySelector('[data-agent-stream="native"]');
    assert.ok(pane.textContent.includes("先跑测试"), "the user's bubble stays in the conversation");
    assert.equal(view.composer("native").__props.value, "", "nothing is put back into the input box");
    assert.equal(window.sessionStorage.getItem("oceanleo.pending-native-prompt:cts_codex"), null, "stash taken once");
    const unsent = pane.querySelector("[data-native-unsent]");
    assert.ok(visible(unsent), "one plain line under the bubble");
    assert.match(unsent.textContent, /未发送：Codex 还没有登录，请在设置里登录。/);
    assert.ok(unsent.querySelector("button").textContent.includes("重试"));
    assert.deepEqual(globalThis.__sent, []);
    assert.ok(visible(view.host.querySelector('[data-native-settings="native"]')), "settings opened");
    // Fixed in settings, then retried: it goes out once.
    globalThis.__thread = {};
    await act(async () => { unsent.querySelector("button").click(); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    assert.deepEqual(globalThis.__sent, [{ session: "cts_codex", text: "先跑测试" }]);
    assert.equal(view.host.querySelector("[data-native-unsent]"), null);
  } finally { await view.unmount(); globalThis.__thread = null; }
});

test("a draft send whose session cannot be created keeps the bubble, says 未发送 with a retry, and the retry creates it and sends once", async () => {
  const draft = await mount({}, { url: "/", createFails: true });
  try {
    await changeConversation(draft, "cloud", { kind: "native", computerId: "cc_elon", computerName: "elon", program: "codex", view: "chat" });
    await act(async () => { draft.composer("native").__props.onSubmit("看看日志"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    const pane = draft.host.querySelector('[data-agent-stream="native"]');
    assert.ok(pane.textContent.includes("看看日志"), "bubble shown although nothing was created");
    assert.equal(draft.composer("native").__props.value, "", "the text is in the bubble, not handed back");
    const unsent = pane.querySelector("[data-native-unsent]");
    assert.match(unsent.textContent, /未发送：没能打开这段对话，请稍后再试。/);
    const posts = () => globalThis.__gateway.filter((call) => call.method === "POST");
    assert.equal(posts().length, 1);
    globalThis.__createFails = false;
    await act(async () => { unsent.querySelector("button").click(); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    await settle();
    assert.equal(posts().length, 2);
    assert.equal(posts()[1].body.request_id, posts()[0].body.request_id, "the retry reuses the request id (no second session)");
    assert.deepEqual(globalThis.__sent.map((row) => row.text), ["看看日志"], "sent exactly once after the retry");
    assert.equal(draft.host.querySelector("[data-native-unsent]"), null);
  } finally { await draft.unmount(); }
});

test("homepage launch (nativeLaunch): bubble before the session exists, adoption keeps the host's thread, URL replaced, no list read, no own connection", async () => {
  const api = await import(computerTaskApiUrl);
  const conversation = { kind: "native", computerId: "cc_launch", computerName: "elon", program: "codex", view: "chat" };
  const computer = { id: "cc_launch", name: "elon", status: "active", node_online: true };
  const hostThread = {
    messages: [{ id: -2147483648, role: "user", kind: "text", content: "马上看日志", meta: { native: true, native_pending: true } }],
    live: true, draft: true, running: false, ready: false, offline: false, blockedReason: null,
    async send() { return false; }, stop() {}, answer() {},
    composerAttachments: [], onAttachFiles() {}, onRemoveAttachment() {}, modelPicker: null, hasOlder: false, loadOlder() {},
    saveFailed: false, dialog: { stub: true, activeSession: "" }, pending: { text: "马上看日志", unsent: null },
    queue() { return false; }, markUnsent() {}, retry() {},
  };
  const created = [];
  const view = await mount({ nativeLaunch: { conversation, computer, thread: hostThread, created: null }, onTaskCreated: (id) => created.push(id) }, { url: "/" });
  try {
    const pane = view.host.querySelector('[data-agent-stream="native"]');
    assert.ok(visible(pane), "the native conversation is in front at once");
    assert.ok(pane.textContent.includes("马上看日志"), "the user's bubble shows before the session exists");
    assert.doesNotMatch(pane.textContent, /正在连接…|正在打开对话…/, "the known computer is not waited for");
    assert.equal(globalThis.__gateway.filter((call) => call.method === "POST").length, 0, "the host creates the session, not this page");
    const session = { id: "cts_launch", task_id: "t_launch", computer_id: "cc_launch", computer_name: "elon", kind: "acp", program: "codex",
      native_session_id: null, created_at: "", updated_at: "", sync_status: "saved" };
    api.rememberComputerTaskSession(session);
    await act(async () => {
      view.rerender({ nativeLaunch: { conversation, computer, thread: { ...hostThread, draft: false }, created: { taskId: "t_launch", session } }, onTaskCreated: (id) => created.push(id) });
      await new Promise((r) => setTimeout(r, 0));
    });
    await settle();
    assert.deepEqual(created, ["t_launch"], "the host is told once (it replaces the URL)");
    assert.equal(view.host.querySelector('[data-native-chat="cts_launch"]')?.contains(pane) ?? false, true, "same pane, no remount");
    assert.equal(globalThis.__gateway.some((call) => call.path.startsWith("/v1/computer-task-sessions?")), false, "no session list read for the task it just created");
    assert.equal(globalThis.__threadInputs.filter((input) => input.enabled && input.session?.id === "cts_launch").length, 0,
      "the page's own thread for the launched chat never connects (one socket: the host's)");
    assert.deepEqual(globalThis.__pushed, []);
  } finally { await view.unmount(); }
});

test("a session handed over by the homepage (?computerSession) shows at once; its list and computer are read in parallel", async () => {
  const api = await import(computerTaskApiUrl);
  // Its own task id: the hung list read must not be shared with later tests' reads.
  api.rememberComputerTaskSession({ id: "cts_handed", task_id: "t_handed", computer_id: "cc_elon", computer_name: "elon", kind: "acp", program: "codex",
    native_session_id: null, created_at: "", updated_at: "", sync_status: "saved" });
  const view = await mount({ taskId: "t_handed" }, { task: computerTask(), sessions: [], url: "/tasks/t_handed?computerSession=cts_handed", listHang: true });
  try {
    const native = view.composer("native");
    assert.ok(visible(native), "the handed session is in front although the list has not arrived");
    assert.equal(native.__props.conversation.sessionId, "cts_handed");
    assert.match(window.location.search, /computerSession=cts_handed/);
  } finally { await view.unmount(); globalThis.__listHang = false; }
});

test("native composer hides controls that do nothing for a native send and respects the host placeholder", async () => {
  const view = await mount({ taskId: "t1", placeholder: "宿主占位" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const props = view.composer("native").__props;
    assert.equal(props.showPlugins, false);
    assert.equal(props.showPayerSelector, false);
    assert.equal(props.showAppsBar, false);
    assert.equal(props.placeholder, "宿主占位");
  } finally { await view.unmount(); }
});

test("a computer task offers no OceanLeo turn: the row is disabled with a reason and picking it does nothing", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const composer = view.composer("native");
    assert.equal(composer.__props.oceanleoDisabledReason, "OceanLeo 请在新任务里使用");
    await changeConversation(view, "native", { kind: "oceanleo", target: { kind: "computer", id: "cc_elon", name: "elon" } });
    assert.ok(visible(view.composer("native")), "still on the native conversation");
    assert.equal(view.composer("cloud").__props.disabled, true, "the hidden cloud composer cannot send into a computer task");
  } finally { await view.unmount(); }
});

test("a cloud task with native sessions keeps its real bound target and no disabled reason", async () => {
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const composer = view.composer("cloud");
    assert.deepEqual(composer.__props.boundExecutionTarget, { kind: "cloud" });
    assert.equal(composer.__props.oceanleoDisabledReason, null);
  } finally { await view.unmount(); }
});

test("hidden native chats stay connected; switching back reuses the same thread instance", async () => {
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    await changeConversation(view, "cloud", { kind: "native", computerId: "cc_elon", computerName: "elon", program: "codex", view: "chat" });
    const chat = view.host.querySelector('[data-native-chat="cts_codex"]');
    await changeConversation(view, "native", { kind: "oceanleo", target: { kind: "cloud" } });
    assert.equal(visible(chat), false);
    const last = globalThis.__threadInputs.filter((input) => input.session?.id === "cts_codex").at(-1);
    assert.equal(last.enabled, true, "hidden chat keeps its connection");
    await changeConversation(view, "cloud", { kind: "native", computerId: "cc_elon", computerName: "elon", program: "codex", view: "chat", sessionId: "cts_codex" });
    assert.equal(view.host.querySelector('[data-native-chat="cts_codex"]'), chat, "same instance");
  } finally { await view.unmount(); }
});

test("the settings title wins over a hidden editor's header claim", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_term", "terminal", null, "2026-10-30T11:00:00Z")] });
  try {
    await act(async () => { globalThis.__barProps.onOpenSettings(); });
    await settle();
    const title = view.host.querySelector("[data-native-settings-title]");
    assert.ok(title, "settings title rendered in the pane header");
    assert.equal(title.textContent, "终端设置 · elon");
    assert.doesNotMatch(title.closest("[data-pane-header]")?.textContent || "", /编辑器标题/);
  } finally { await view.unmount(); }
});

test("attachment-only native send goes out; the input clears only when the thread says it was sent", async () => {
  globalThis.__thread = { attachments: [{ id: "a1", name: "log.txt", state: "done" }], sendResult: false };
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    await act(async () => { view.composer("native").__props.onChange("保留"); });
    await act(async () => { view.composer("native").__props.onSubmit(""); await new Promise((r) => setTimeout(r, 0)); });
    assert.deepEqual(globalThis.__sent.at(-1), { session: "cts_codex", text: "" }, "attachment-only send attempted");
    assert.equal(view.composer("native").__props.value, "保留", "not cleared when send resolved false");
  } finally { await view.unmount(); globalThis.__thread = null; }
});

test("a URL change inside the same task (back/forward) switches the conversation", async () => {
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(),
    sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z"), session("cts_term", "terminal", null, "2026-10-30T09:00:00Z")],
  });
  try {
    assert.equal(view.composer("native").__props.conversation.sessionId, "cts_codex");
    await act(async () => {
      window.history.pushState(null, "", "/tasks/t1?computerSession=cts_term");
      window.dispatchEvent(new window.PopStateEvent("popstate"));
      await new Promise((r) => setTimeout(r, 0));
    });
    await settle();
    assert.ok(visible(view.host.querySelector('[data-native-surface="cts_term"]')));
  } finally { await view.unmount(); }
});

test("legacy ACP sessions with program oceanleo are never shown as a native chat", async () => {
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(), sessions: [session("cts_legacy", "acp", "oceanleo", "2026-10-30T11:00:00Z")], url: "/tasks/t1?computerSession=cts_legacy",
  });
  try {
    assert.equal(view.host.querySelector('[data-native-chat="cts_legacy"]'), null);
    assert.equal(globalThis.__threadInputs.some((input) => input.session?.id === "cts_legacy"), false);
  } finally { await view.unmount(); }
});

test("source: no dead native gate props, no cross-origin task push, plain read-only wording", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /nativeChatActive|preferredSessionRef|nativeGateOpen/);
  assert.doesNotMatch(source, /portalHref\(`\/tasks/);
  assert.doesNotMatch(source, /当前会话为只读状态|分支已创建，但工作会话暂未同步/);
  assert.match(source, /这段对话只能查看。/);
  assert.match(source, /分支已创建，右侧工作区稍后更新；任务会继续运行。/);
});

// The legacy deep-link import moved from task-host/ into a small host helper.
const importModuleUrl = await compileModule("src/shell/cloud-computer/computer-task-import.tsx", {
  "../../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
  "next/navigation": dataModule(
    "export function useRouter(){ return { replace(url){ globalThis.__forward = url; } }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(globalThis.__importParams || ''); }",
  ),
  "../../lib/auth/client": dataModule("export async function getUserId(){ return 'owner'; }"),
  "../../lib/cloud-computer-api": dataModule("export async function getComputer(id){ return { id, name: 'elon' }; }"),
  "../../lib/execution-target": dataModule("globalThis.__targets = [];\nexport function writeExecutionTarget(owner, target){ globalThis.__targets.push({ owner, target }); }"),
  "../../lib/computer-task-api": dataModule(
    "globalThis.__imports = [];\nexport async function createComputerTaskSession(id, input){ globalThis.__imports.push({ id, input }); return { task_id: 'existing', session: { id: 'managed' } }; }",
  ),
});
const { ComputerTaskImport, legacyImportRequestId } = await import(importModuleUrl);

async function mountImport(props, params) {
  globalThis.__importParams = params;
  globalThis.__forward = undefined;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(React.StrictMode, null, React.createElement(ComputerTaskImport, props)));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, async unmount() { await act(async () => root.unmount()); host.remove(); } };
}

test("legacy deep link imports only its named native session, once, with a request id stable across reloads", async () => {
  globalThis.__imports.length = 0;
  const first = await mountImport({ computerId: "cc", taskId: "existing" }, "card=cli&program=codex&session=known-native");
  try {
    assert.equal(globalThis.__imports.length, 1, "imports exactly once under StrictMode");
    const { input } = globalThis.__imports[0];
    assert.deepEqual({ ...input, request_id: undefined }, {
      kind: "cli", program: "codex", task_id: "existing", native_session_id: "known-native", request_id: undefined,
    });
    assert.equal(globalThis.__forward, "/tasks/existing?computerSession=managed");
    assert.match(first.host.textContent, /正在打开对话/);
    assert.equal(first.host.querySelector(".underline"), null, "no underlined text link as a control");
  } finally { await first.unmount(); }
  const again = await mountImport({ computerId: "cc", taskId: "existing" }, "card=cli&program=codex&session=known-native");
  try {
    assert.equal(globalThis.__imports[1].input.request_id, globalThis.__imports[0].input.request_id, "reload reuses the request id");
    assert.match(globalThis.__imports[0].input.request_id, /^[A-Za-z0-9_.:@\/+~-]{1,160}$/);
  } finally { await again.unmount(); }
  assert.notEqual(
    legacyImportRequestId({ computerId: "cc", kind: "terminal", program: null }),
    legacyImportRequestId({ computerId: "cc2", kind: "terminal", program: null }),
  );
});

test("a computer link without a native program opens the OceanLeo conversation on that computer and creates no session", async () => {
  globalThis.__imports.length = 0;
  globalThis.__targets.length = 0;
  const view = await mountImport({ computerId: "cc_elon" }, "");
  try {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(globalThis.__imports.length, 0, "no oceanleo native session");
    assert.deepEqual(globalThis.__targets, [{ owner: "owner", target: { kind: "computer", id: "cc_elon", name: "elon" } }]);
    assert.equal(globalThis.__forward, "/");
  } finally { await view.unmount(); }
  const program = await mountImport({ computerId: "cc_elon" }, "program=oceanleo");
  try {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(globalThis.__imports.length, 0);
  } finally { await program.unmount(); }
});
