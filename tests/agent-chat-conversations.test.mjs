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
//   - no settings gear / right pane: settings live in the composer / bar pill, and a
//     send held back by install / sign-in asks the pill to open its 账号 card;
//   - a draft native send creates the session, then sends exactly once.
// Stubbed: network (agent lib, computer-task gateway), LeoComposer (Tiptap),
// the native thread hook, the terminal surface, ConversationBar.
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
const taskTimelineStub = dataModule(`
  globalThis.__taskTimelineCalls = [];
  const emptyState = { status: "idle", program: null, session_id: null, since: null, last_output_at: null,
    request: null, queued: [], reason: null, pending_stop: false, computer: { id: "cc_elon", online: true } };
  export async function getTaskTimeline(taskId) {
    globalThis.__taskTimelineCalls.push({ path: "/v1/tasks/" + taskId + "/timeline", method: "GET" });
    return globalThis.__timelinePage || { task_id: taskId, entries: [], has_older: false, next_before: null, state: emptyState, sessions: [] };
  }
  export function openTaskTimeline() { return { close() {} }; }
  export async function taskTimelineWsUrl() { return "ws://test.invalid/v1/tasks/live"; }
  export async function sendTaskMessage(taskId, input) {
    globalThis.__taskTimelineCalls.push({ path: "/v1/tasks/" + taskId + "/messages", method: "POST", body: input });
    return { accepted: true, delivery: "started", session_id: "cts_task", entry_cursor: "task-1" };
  }
  export async function createTask(input) { globalThis.__taskTimelineCalls.push({ path: "/v1/tasks", method: "POST", body: input }); return { accepted: true }; }
  export async function stopTask(taskId) { globalThis.__taskTimelineCalls.push({ path: "/v1/tasks/" + taskId + "/stop", method: "POST" }); return { state: emptyState }; }
  export async function answerTaskRequest(taskId, requestId, answer) { globalThis.__taskTimelineCalls.push({ path: "/v1/tasks/" + taskId + "/requests/" + requestId, method: "POST", body: answer }); return { ok: true }; }
  export async function removeQueued(taskId, clientMessageId) { globalThis.__taskTimelineCalls.push({ path: "/v1/tasks/" + taskId + "/queue/" + clientMessageId, method: "DELETE" }); return { ok: true }; }
`);

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
  "../lib/task-timeline-api": taskTimelineStub,
  "../../lib/task-timeline-api": taskTimelineStub,
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
          : props.conversation.computerName + " · " + (props.conversation.kind === "terminal" ? "终端" : props.conversation.program)) : "—",
        props.modelPickerSlot ?? null);
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
    // A held-back send asks the composer pill to open its 账号 card (count of requests);
    // the stub pill shows the count it sees.
    export const NativeSetupRequest = React.createContext(0);
    function SetupProbe() { return React.createElement("span", { "data-setup-request": String(React.useContext(NativeSetupRequest)) }); }
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
        opening: Boolean(input.session && state.opening),
        send,
        stop() { globalThis.__threadStops++; },
        answer(message, answer) { (globalThis.__answers ||= []).push({ id: message.id, answer }); },
        composerAttachments: state.attachments || [], onAttachFiles: undefined, onRemoveAttachment() {},
        modelPicker: React.createElement(SetupProbe), hasOlder: Boolean(state.hasOlder), olderLoading: Boolean(state.olderLoading),
        loadOlder() { globalThis.__loadOlder = (globalThis.__loadOlder || 0) + 1; },
        saveFailed: Boolean(state.saveFailed), dialog: { stub: true, activeSession: "" },
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
  `),
};

const { AgentChat, shouldLoadOlder, LOAD_OLDER_PX } = await import(await compileModule("src/shell/AgentChat.tsx", OVERRIDES, { missingPackageStub: lazyStub }));

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
  globalThis.__taskTimelineCalls = [];
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

test("computer task opens one shared stream, with the selected engine and computer target in its composer", async () => {
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(),
    sessions: [session("cts_old", "acp", "claude", "2026-10-30T09:00:00Z"), session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")],
  });
  try {
    assert.equal(view.host.querySelector("[data-computer-task-workspace]"), null, "the old strip must be gone");
    assert.equal(view.host.querySelector('[aria-label="设备与会话"]'), null);
    assert.doesNotMatch(view.host.textContent, /图形|独立 CLI|Conversation|云端记录正在同步|查看云端保存的对话/);
    const composer = view.composer("cloud");
    assert.ok(visible(composer), "the task composer is in front");
    assert.equal(composer.textContent, "elon · codex");
    assert.equal(composer.__props.conversation.sessionId, "cts_codex");
    assert.deepEqual(composer.__props.boundExecutionTarget, { kind: "computer", id: "cc_elon", name: "elon" },
      "a computer task is bound to its computer, never cloud");
    assert.match(window.location.search, /computerSession=cts_codex/);
    assert.ok(visible(view.host.querySelector('[data-agent-stream="cloud"]')), "the shared task stream is visible");
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
    // The left pane holds stream wrappers only; no element precedes the stream.
    const left = view.host.querySelector('[data-agent-stream="cloud"]').parentElement.parentElement;
    for (const child of left.children) {
      assert.ok(child.querySelector("[data-agent-stream]"),
        `unexpected element in the left pane: ${child.outerHTML.slice(0, 120)}`);
    }
  } finally { await view.unmount(); }
});

test("computerSession=cloud on a computer task keeps the shared task stream and selects the latest session", async () => {
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")],
    url: "/tasks/t1?computerSession=cloud",
  });
  try {
    assert.doesNotMatch(window.location.search, /computerSession=cloud/);
    assert.match(window.location.search, /computerSession=cts_codex/);
    assert.ok(visible(view.composer("cloud")));
    assert.ok(visible(view.host.querySelector('[data-agent-stream="cloud"]')));
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
  } finally { await view.unmount(); }
});

test("computer task renders through the host task stream and task composer", async () => {
  globalThis.__thread = { messages: NATIVE_MESSAGES, saveFailed: true };
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
    const pane = view.host.querySelector('[data-agent-stream="cloud"]');
    assert.ok(visible(pane), "the shared task stream is visible");
    assert.equal(pane.querySelector("[data-oceanleo-cc-composer]"), null, "no Computers-page composer");
    assert.ok(pane.querySelector("[data-quick-actions]"), "the task composer keeps task actions");
    const composer = view.composer("cloud");
    assert.ok(composer);
    await act(async () => { composer.__props.onChange("继续"); });
    await act(async () => { composer.__props.onSubmit("继续"); await new Promise((r) => setTimeout(r, 0)); });
    const post = globalThis.__taskTimelineCalls.find((call) => call.path === "/v1/tasks/t1/messages");
    assert.ok(post, `task message call missing: ${JSON.stringify(globalThis.__taskTimelineCalls)}`);
    assert.equal(post.body.program, "codex");
    assert.equal(post.body.text, "继续");
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

test("terminal sessions remain records in the shared task stream", async () => {
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(), sessions: [session("cts_term", "terminal", null, "2026-10-30T11:00:00Z")],
  });
  try {
    assert.equal(view.host.querySelector('[data-native-surface="cts_term"]'), null);
    assert.equal(view.host.querySelector("[data-conversation-bar]"), null);
    assert.ok(visible(view.host.querySelector('[data-agent-stream="cloud"]')));
    assert.ok(visible(view.composer("cloud")));
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

test("in a computer task, picking an engine creates nothing; the first send uses the task command with that engine", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [] });
  try {
    await changeConversation(view, "cloud", { kind: "native", computerId: "cc_elon", computerName: "elon", program: "claude", view: "chat" });
    assert.equal(globalThis.__gateway.filter((call) => call.method === "POST").length, 0);
    const composer = view.composer("cloud");
    assert.ok(visible(composer), "the shared task composer stays ready");
    assert.equal(composer.__props.disabled, false);
    await act(async () => { composer.__props.onChange("你好"); });
    await act(async () => { composer.__props.onSubmit("你好"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    await settle();
    const post = globalThis.__taskTimelineCalls.find((call) => call.path === "/v1/tasks/t1/messages");
    assert.ok(post, `the first send uses the task message endpoint: ${JSON.stringify(globalThis.__taskTimelineCalls)}`);
    assert.equal(post.body.program, "claude");
    assert.equal(post.body.text, "你好");
    assert.equal(globalThis.__gateway.filter((call) => call.path.endsWith("/task-sessions")).length, 0,
      "selecting and sending through the task timeline creates no legacy pane session");
    assert.doesNotMatch(window.location.search, /computerSession/);
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

test("a send blocked because the program needs setup opens the composer pill's 账号 card instead of sending", async () => {
  globalThis.__thread = { messages: [], blockedReason: "这台电脑上还没有安装 Codex，请在设置里安装。" };
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")], url: "/tasks/t1?computerSession=cts_codex" });
  try {
    const composer = view.composer("native");
    assert.equal(composer.__props.disabled, false, "setup-blocked composer stays usable so Send leads to settings");
    assert.ok(view.host.querySelector("[data-native-blocked]").textContent.includes("还没有安装"));
    await act(async () => { composer.__props.onSubmit("你好"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    assert.deepEqual(globalThis.__sent, [], "nothing sent");
    assert.equal(composer.querySelector("[data-setup-request]").getAttribute("data-setup-request"), "1", "the pill is asked to open its 账号 card");
    assert.equal(view.host.querySelector("[data-native-settings-pane]"), null, "no right-pane settings");
  } finally { await view.unmount(); globalThis.__thread = null; }
});

test("re-entry while the session is still opening: the composer is usable and Enter queues (the bubble is the only signal), then sends once", async () => {
  // Known computer (no 正在连接…) but the link / occupancy is not read yet: not ready, not blocked.
  globalThis.__thread = { messages: NATIVE_MESSAGES, ready: false };
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")], url: "/tasks/t1?computerSession=cts_codex" });
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
    // 2026-10-31 D: no 「正在打开对话…」 line; the queued bubble says it all.
    assert.equal(pane.querySelector("[data-native-blocked]"), null, "no opening line under a queued prompt");
    assert.doesNotMatch(pane.textContent, /正在打开对话/);
    // The session becomes ready: it goes out by itself, once.
    globalThis.__thread = { messages: NATIVE_MESSAGES };
    await act(async () => { view.composer("native").__props.onChange("x"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    assert.deepEqual(globalThis.__sent, [{ session: "cts_codex", text: "继续看" }]);
    assert.equal(pane.querySelector("[data-native-blocked]"), null, "the opening line is gone");
  } finally { await view.unmount(); globalThis.__thread = null; }
});

test("opening an existing conversation never says 正在打开对话…: quiet spinner until its saved copy is read, then the plain hint", async () => {
  globalThis.__thread = { messages: [], opening: true };
  const view = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")], url: "/tasks/t1?computerSession=cts_codex" });
  try {
    const pane = view.host.querySelector('[data-agent-stream="native"]');
    assert.ok(pane.querySelector("[data-native-opening]"), "quiet spinner while the saved copy is on its way");
    assert.doesNotMatch(view.host.textContent, /正在打开对话/);
    assert.equal(pane.querySelector("[data-native-blocked]"), null);
    globalThis.__thread = { messages: [], opening: false };
    await act(async () => { view.composer("native").__props.onChange("x"); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    assert.equal(pane.querySelector("[data-native-opening]"), null);
    assert.ok(pane.textContent.includes("在下方输入，开始与 agent 对话。"));
    assert.doesNotMatch(view.host.textContent, /正在打开对话/);
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

test("an unreadable auxiliary session list keeps the task timeline mounted and offers retry", async () => {
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
    assert.ok(visible(view.composer("cloud")));
    assert.ok(visible(view.host.querySelector('[data-agent-stream="cloud"]')));
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
  } finally { await view.unmount(); }
});

test("a task with an unknown computer state keeps the shared composer usable until I3 state arrives", async () => {
  globalThis.__thread = { blockedReason: "这台电脑离线，只能查看已保存的对话。" };
  const view = await mount({ taskId: "t1" }, {
    // A computer this tab has never read (earlier tests read cc_elon, which would count as known).
    task: computerTask(), sessions: [{ ...session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z"), computer_id: "cc_never_read" }], computerMode: "hang",
  });
  try {
    const pane = view.host.querySelector('[data-agent-stream="cloud"]');
    assert.ok(visible(pane));
    assert.doesNotMatch(pane.textContent, /离线|正在连接…|正在打开对话/);
    assert.equal(view.composer("cloud").__props.disabled, false);
  } finally { await view.unmount(); globalThis.__thread = null; }
});

test("offline task history uses the shared stream and does not render native gate controls", async () => {
  globalThis.__thread = { messages: [
    { id: -21, role: "assistant", kind: "gate", content: "允许运行 npm test？", meta: { gate_prompt: "允许运行 npm test？",
      native_permission: { permId: "p1", options: [{ id: "allow", name: "允许", kind: "allow_once" }], chosen: null } } },
  ] };
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")], computerMode: "offline",
  });
  try {
    const pane = view.host.querySelector('[data-agent-stream="cloud"]');
    assert.ok(visible(pane));
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
    assert.equal(pane.querySelector("[data-native-permission-option]"), null);
    assert.equal(view.composer("cloud").__props.disabled, false,
      "the task composer remains available for a queued command while offline");
  } finally { await view.unmount(); globalThis.__thread = null; }
});

test("a task queue is represented by the shared timeline instead of a native pending bubble", async () => {
  window.sessionStorage.setItem("oceanleo.pending-native-prompt:cts_codex", JSON.stringify({ text: "先跑测试", queued_at: Date.now() }));
  globalThis.__thread = { blockedReason: "Codex 还没有登录，请在设置里登录。" };
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    await settle();
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
    assert.ok(visible(view.host.querySelector('[data-agent-stream="cloud"]')));
    assert.equal(view.host.querySelector("[data-native-unsent]"), null);
    assert.ok(window.sessionStorage.getItem("oceanleo.pending-native-prompt:cts_codex"),
      "the task timeline does not consume the legacy native prompt stash");
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

test("a session handed over by the homepage still opens the one task stream immediately", async () => {
  const api = await import(computerTaskApiUrl);
  // Its own task id: the hung list read must not be shared with later tests' reads.
  api.rememberComputerTaskSession({ id: "cts_handed", task_id: "t_handed", computer_id: "cc_elon", computer_name: "elon", kind: "acp", program: "codex",
    native_session_id: null, created_at: "", updated_at: "", sync_status: "saved" });
  const view = await mount({ taskId: "t_handed" }, { task: computerTask(), sessions: [], url: "/tasks/t_handed?computerSession=cts_handed", listHang: true });
  try {
    const composer = view.composer("cloud");
    assert.ok(visible(composer), "the task composer is available although the list has not arrived");
    assert.ok(visible(view.host.querySelector('[data-agent-stream="cloud"]')));
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
    assert.match(window.location.search, /computerSession=cts_handed/);
  } finally { await view.unmount(); globalThis.__listHang = false; }
});

test("the task composer uses the host placeholder while the task stream remains unified", async () => {
  const view = await mount({ taskId: "t1", placeholder: "宿主占位" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const props = view.composer("cloud").__props;
    assert.equal(props.placeholder, "宿主占位");
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
  } finally { await view.unmount(); }
});

test("a computer task can continue in OceanLeo while keeping one task stream", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const composer = view.composer("cloud");
    assert.equal(composer.__props.oceanleoDisabledReason, null);
    await changeConversation(view, "cloud", { kind: "oceanleo", target: { kind: "computer", id: "cc_elon", name: "elon" } });
    assert.ok(visible(view.composer("cloud")), "the task composer remains mounted");
    assert.equal(view.composer("cloud").__props.conversation.kind, "oceanleo");
    assert.equal(view.composer("cloud").__props.disabled, false, "the task composer can continue the same task");
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
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

test("task sends use the task command and keep the shared stream mounted", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const composer = view.composer("cloud");
    await act(async () => { composer.__props.onChange("继续"); });
    await act(async () => { composer.__props.onSubmit("继续"); await new Promise((r) => setTimeout(r, 0)); });
    const post = globalThis.__taskTimelineCalls.find((call) => call.path === "/v1/tasks/t1/messages");
    assert.ok(post, `task message call missing: ${JSON.stringify(globalThis.__taskTimelineCalls)}`);
    assert.equal(post.body.text, "继续");
    assert.equal(post.body.program, "codex");
    assert.ok(post.body.client_message_id);
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
  } finally { await view.unmount(); }
});

test("a URL change inside the same task does not replace the shared timeline with a pane", async () => {
  const view = await mount({ taskId: "t1" }, {
    task: computerTask(),
    sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z"), session("cts_term", "terminal", null, "2026-10-30T09:00:00Z")],
  });
  try {
    const stream = view.host.querySelector('[data-agent-stream="cloud"]');
    assert.ok(stream);
    await act(async () => {
      window.history.pushState(null, "", "/tasks/t1?computerSession=cts_term");
      window.dispatchEvent(new window.PopStateEvent("popstate"));
      await new Promise((r) => setTimeout(r, 0));
    });
    await settle();
    assert.equal(view.host.querySelector('[data-native-surface="cts_term"]'), null);
    assert.equal(view.host.querySelector('[data-agent-stream="cloud"]'), stream);
    assert.ok(visible(view.composer("cloud")));
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

// 2026-10-31 item 4: no 「读取更早的对话」 button; scrolling up reads one batch by itself.
test("shouldLoadOlder: only the user's own scroll up near the top, or a pane the stream does not fill; never while reading", () => {
  const tall = { scrollHeight: 5000, clientHeight: 600 };
  const base = { hasOlder: true, loading: false };
  assert.equal(shouldLoadOlder({ ...tall, scrollTop: 50 }, { ...base, movingUp: true }), true);
  assert.equal(shouldLoadOlder({ ...tall, scrollTop: 50 }, { ...base, movingUp: false }), false,
    "the smooth follow-to-bottom starting at 0 never reads older batches");
  assert.equal(shouldLoadOlder({ ...tall, scrollTop: LOAD_OLDER_PX + 1 }, { ...base, movingUp: true }), false);
  assert.equal(shouldLoadOlder({ ...tall, scrollTop: 0 }, { ...base, loading: true, movingUp: true }), false, "one batch at a time");
  assert.equal(shouldLoadOlder({ ...tall, scrollTop: 0 }, { ...base, hasOlder: false, movingUp: true }), false);
  assert.equal(shouldLoadOlder({ scrollTop: 0, scrollHeight: 500, clientHeight: 600 }, { ...base, movingUp: false }), true,
    "a short batch that cannot be scrolled up reads the next one");
});

test("task timeline owns older-page loading; the task page has no native load-earlier control", async () => {
  globalThis.__loadOlder = 0;
  globalThis.__thread = { messages: NATIVE_MESSAGES, hasOlder: true };
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const pane = view.host.querySelector('[data-agent-stream="cloud"]');
    assert.ok(pane);
    assert.doesNotMatch(pane.textContent, /读取更早的对话/);
    assert.equal([...pane.querySelectorAll("button")].some((button) => /更早/.test(button.textContent)), false);
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
  } finally { await view.unmount(); globalThis.__thread = null; }

  globalThis.__thread = { messages: NATIVE_MESSAGES, hasOlder: true, olderLoading: true };
  const loading = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    assert.equal(loading.host.querySelector('[data-agent-stream="native"]'), null);
  } finally { await loading.unmount(); globalThis.__thread = null; }
});

// 2026-10-31 item 6: copy only once, at the end of the agent's turn.
test("task timeline rows use the shared host bubble renderer for finished turns", async () => {
  globalThis.__thread = { messages: [
    { id: -31, role: "user", kind: "text", content: "看一下日志" },
    { id: -32, role: "assistant", kind: "text", content: "我先看看。" },
    { id: -33, role: "assistant", kind: "step", content: "读取 server.log", meta: { step_index: 1, native_tool: true } },
    { id: -34, role: "assistant", kind: "text", content: "日志里没有错误。", meta: { final: true } },
    { id: -35, role: "user", kind: "text", content: "谢谢" },
    { id: -36, role: "assistant", kind: "text", content: "不客气。", meta: { final: true } },
  ] };
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")] });
  try {
    const pane = view.host.querySelector('[data-agent-stream="cloud"]');
    assert.ok(pane);
    assert.equal(view.host.querySelector('[data-agent-stream="native"]'), null);
  } finally { await view.unmount(); globalThis.__thread = null; }
});
