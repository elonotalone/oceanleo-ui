// ============================================================================
// A computer task's page (thin-gateway wave 2026-11-07, contract §2.4 / §2.5)
// ----------------------------------------------------------------------------
// Mounts the REAL AgentChat with the REAL frames client (lib/acp-frames-api),
// useAcpFrames / useAcpCatalogPicker and the REAL src/acp renderer; only fetch
// and WebSocket are fakes (routes and the frames socket). Pins:
//   - a native computer task shows ONE stream (`data-agent-stream="acp"`): the
//     rows the socket delivers, through AcpTranscript; no cloud stream;
//   - the composer is disabled unless the socket is connected, with one
//     「连接断开」 line; nothing is queued or resent;
//   - send → POST /send body; another program in the dock → POST /switch;
//     a program's refusal (409 {"error"}) is not repeated under the composer,
//     a gateway refusal is shown verbatim; the text stays either way;
//   - Stop → /stop while a turn is open (from the rows), Close → /close,
//     a permission answer → /answer, a background task stop → /stop-task;
//   - CLI / terminal → the terminal surface + ConversationBar, no composer;
//   - OceanLeo keeps its own stream (cloud task, or a computer task with no
//     program session); no default empty copy anywhere;
//   - a draft that picked a program: send creates the task, then POST /send.
// Stubbed: the agent lib's network, LeoComposer (Tiptap), the catalog pill's
// presentational picker, the terminal surface, ConversationBar.
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
  globalThis.__task = null; globalThis.__stops = 0; globalThis.__followUps = []; globalThis.__followUpBodies = [];
  export async function getTask() {
    return globalThis.__task ? { ok: true, data: globalThis.__task } : { ok: false, status: 404, error: "no task" };
  }
  export async function createTask(input) {
    if (globalThis.__createTaskResult) return { ok: true, data: { task_id: "t_home" }, executionTarget: input.executionTarget };
    return { ok: false, error: "stub" };
  }
  export async function branchTask() { return { ok: false, error: "stub" }; }
  export async function followUp(id, text, attachments, hiddenContext, orgId, computerId, clientWindow) {
    globalThis.__followUps.push(text);
    globalThis.__followUpBodies.push({ id, text, client_window: clientWindow });
    return { ok: false, error: "stub" };
  }
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
// The real frames client over a fake gateway: fetch routes and a fake socket.
globalThis.__acpCalls = [];
globalThis.__sockets = [];
class FakeSocket {
  constructor(url) { this.url = url; this.closed = false; globalThis.__sockets.push(this); }
  send() { throw new Error("the page never sends on the frames socket"); }
  close() { if (this.closed) return; this.closed = true; this.onclose?.({ code: 1000 }); }
  open() { this.onopen?.({}); }
  push(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
  drop() { this.closed = true; this.onclose?.({ code: 1006 }); }
}
Object.defineProperty(globalThis, "WebSocket", { configurable: true, writable: true, value: FakeSocket });
window.WebSocket = FakeSocket;
globalThis.fetch = async (url, init = {}) => {
  const path = String(url).replace("https://gw.test", "");
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  globalThis.__acpCalls.push({ path, method, body });
  const route = globalThis.__acpRoute?.(path, method, body);
  const payload = route?.body ?? (path.endsWith("/catalog") ? (globalThis.__catalog ?? {}) : { row_id: 1 });
  return new Response(JSON.stringify(payload), { status: route?.status ?? 200, headers: { "content-type": "application/json" } });
};
const acpFramesUrl = await compileModule("src/lib/acp-frames-api.ts", {
  "./auth/client": dataModule("export async function accessToken(){ return 'tok'; }"),
  "./auth/config": dataModule("export function gatewayBase(){ return 'https://gw.test'; }"),
});

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
  "../lib/acp-frames-api": acpFramesUrl,
  "./CloudBrowserPanel": dataModule("export function CloudBrowserPanel(){ return null; }"),
  "./ResultCanvas": dataModule(`
    import React from ${reactUrl};
    export function ResultCanvas(){ return React.createElement("div", { "data-preview-content": true }, "preview"); }
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
  // The frames stream's composer is the one with a modelPickerSlot.
  "./LeoComposer": dataModule(`
    import React from ${reactUrl};
    export function LeoComposer(props) {
      const kind = "modelPickerSlot" in props ? "acp" : "cloud";
      return React.createElement("div", { "data-leo-composer": kind, tabIndex: 0,
        onKeyDown: (event) => { if (event.key === "Escape" && props.loading) props.onStop?.(); },
        ref: (node) => { if (node) node.__props = props; } },
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
  // The catalog pill's presentation (the real hook decides what it gets).
  "../native-thread/NativeModelPicker": dataModule(`
    import React from ${reactUrl};
    export function NativeModelPicker(props) {
      return React.createElement("span", { "data-picker": props.loading ? "loading" : "empty",
        "data-picker-summary": props.fallbackSummary || "", "data-picker-disabled": String(Boolean(props.disabled)) });
    }
    export function nativeModelPickerFor(input) {
      const dialog = input.dialog;
      if (!dialog.models.length && !dialog.mode && !dialog.configOptions.length) return null;
      globalThis.__pickerDialog = dialog;
      return React.createElement("span", { "data-picker": "ready", "data-picker-disabled": String(Boolean(input.disabled)),
        "data-picker-model": dialog.selectedModel });
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

const { AgentChat } = await import(await compileModule("src/shell/AgentChat.tsx", OVERRIDES, { missingPackageStub: lazyStub }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const session = (id, kind, program, created = "2026-10-30T09:00:00Z") => ({
  id, task_id: "t1", computer_id: "cc_elon", computer_name: "elon", kind, program,
  native_session_id: null, created_at: created, updated_at: created, sync_status: "saved",
});
const computerTask = () => ({
  task: { id: "t1", status: "running", title: "elon · codex", mode: "computer", plan: { computer_workspace: { version: 1 } } },
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
// Raw rows exactly as the gateway stores them (bare JSON-RPC lines).
let rowSeq = 0;
const row = (direction, message) => ({
  id: ++rowSeq, direction, node_seq: direction === "agent" ? rowSeq : null,
  raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z",
});
const rows = {
  prompt: (id, text) => row("client", { id, method: "session/prompt", params: { sessionId: "s1", prompt: [{ type: "text", text }] } }),
  chunk: (text) => row("agent", { method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } }),
  done: (id) => row("agent", { id, result: { stopReason: "end_turn" } }),
  permission: (id) => row("agent", { id, method: "session/request_permission", params: { sessionId: "s1",
    toolCall: { toolCallId: "tc1", title: "运行 npm test", status: "pending" },
    options: [{ optionId: "allow", name: "允许", kind: "allow_once" }, { optionId: "deny", name: "拒绝", kind: "reject_once" }] } }),
  task: (asyncTaskId) => row("agent", { method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "async_task_spawned",
    asyncTaskId, name: "test runner", taskType: "agent", description: "跑全部测试", canStop: true } } }),
};

async function settle(ms = 40) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

async function mount(props, { task, sessions = [], url = "/tasks/t1", listFails = 0, createFails = false, computerMode, listHang = false, settleMount = true, catalog } = {}) {
  window.history.replaceState(null, "", url);
  globalThis.__listFails = listFails;
  globalThis.__listHang = listHang;
  globalThis.__createFails = createFails;
  globalThis.__computerMode = computerMode;
  globalThis.__barProps = null;
  globalThis.__task = task ?? null;
  globalThis.__sessions = sessions;
  globalThis.__gateway.length = 0;
  globalThis.__acpCalls = [];
  globalThis.__sockets = [];
  globalThis.__acpRoute = null;
  globalThis.__catalog = catalog;
  globalThis.__pickerDialog = null;
  globalThis.__followUpBodies = [];
  globalThis.__pushed = [];
  globalThis.__stops = 0;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(AgentChat, { siteId: "oceanleo", ...props })); });
  if (settleMount) {
    await settle();
    await settle();
  }
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
const socket = () => globalThis.__sockets.at(-1);
async function connect() { await act(async () => { socket().open(); }); await settle(); }
async function deliver(...items) { await act(async () => { for (const item of items) socket().push({ row: item }); }); await settle(); }
const posts = (suffix) => globalThis.__acpCalls.filter((call) => call.method === "POST" && call.path.endsWith(suffix));
async function type(view, kind, text) { await act(async () => { view.composer(kind).__props.onChange(text); }); }
async function submit(view, kind) { await act(async () => { view.composer(kind).__props.onSubmit(""); await new Promise((r) => setTimeout(r, 0)); }); await settle(); }
async function changeConversation(view, kind, next) {
  await act(async () => { view.composer(kind).__props.onConversationChange(next); await new Promise((r) => setTimeout(r, 0)); });
  await settle();
}
globalThis.__agentChatHarness = { mount, settle, visible, session, computerTask, cloudTask, rows, socket, connect, deliver, posts, type, submit };
const codexSessions = [session("cts_codex", "acp", "codex", "2026-10-30T11:00:00Z")];

// ---------------------------------------------------------------------------
// Tests: one per behaviour that must hold (contract §3 B1 B3 B4 B5 B7 B8, book TG-U2 item 3)
// ---------------------------------------------------------------------------

test("a native computer task shows one frames stream: the socket's rows through AcpTranscript, nothing of the old page", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_old", "acp", "claude"), ...codexSessions] });
  try {
    const pane = view.host.querySelector('[data-agent-stream="acp"]');
    assert.ok(visible(pane), "the frames stream is in front");
    assert.equal(view.host.querySelector('[data-agent-stream="cloud"]'), null, "no OceanLeo stream on a native task");
    assert.match(socket().url, /^wss:\/\/gw\.test\/v1\/tasks\/t1\/frames\?token=tok&after=0$/);
    await connect();
    await deliver(rows.prompt(1, "看一下日志"), rows.chunk("日志里"), rows.chunk("没有错误。"), rows.done(1));
    const transcript = pane.querySelector("[data-acp-transcript]");
    assert.ok(transcript, "rows render through AcpTranscript");
    assert.equal(transcript.getAttribute("data-acp-program"), "codex", "the newest chat session names the program");
    assert.match(transcript.textContent, /看一下日志/);
    assert.match(transcript.textContent, /日志里没有错误。/);
    const composer = view.composer("acp");
    assert.equal(composer.textContent.startsWith("elon · codex"), true);
    assert.deepEqual(composer.__props.boundExecutionTarget, { kind: "computer", id: "cc_elon", name: "elon" });
    assert.equal(composer.__props.disabled, false);
    assert.doesNotMatch(view.host.textContent, /在下方输入|正在理解问题|正在重新连接|已排队|未发送|重试/);
    assert.equal(globalThis.__acpCalls.some((call) => /timeline|transcript|messages/.test(call.path)), false, "no old reads");
  } finally { await view.unmount(); }
});

test("while the socket is not connected the composer is disabled with one 「连接断开」 line; a drop reconnects from the last row and resends nothing", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: codexSessions });
  try {
    assert.equal(view.composer("acp").__props.disabled, true, "connecting counts as not connected");
    assert.equal(view.host.querySelectorAll("[data-acp-disconnected]").length, 1);
    assert.equal(view.host.querySelector("[data-acp-disconnected]").textContent, "连接断开");
    await connect();
    assert.equal(view.composer("acp").__props.disabled, false);
    assert.equal(view.host.querySelector("[data-acp-disconnected]"), null);
    await deliver(rows.prompt(1, "hi"), rows.chunk("hello"));
    const first = socket();
    await type(view, "acp", "这句还没发");
    await act(async () => { first.drop(); });
    await settle();
    assert.equal(view.composer("acp").__props.disabled, true);
    assert.equal(view.host.querySelector("[data-acp-disconnected]").textContent, "连接断开");
    assert.equal(view.composer("acp").__props.value, "这句还没发", "the composer keeps what was typed");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
    assert.notEqual(socket(), first, "the plain backoff opened a new socket");
    assert.match(socket().url, new RegExp(`after=${rowSeq}$`), "it continues after the last row delivered");
    await connect();
    assert.equal(view.composer("acp").__props.disabled, false);
    assert.equal(posts("/send").length, 0, "nothing was queued or resent");
  } finally { await view.unmount(); }
});

test("send posts the message once to /send with the program and computer; the user's row comes from the socket", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: codexSessions });
  try {
    await connect();
    await type(view, "acp", "继续");
    await submit(view, "acp");
    const sent = posts("/v1/tasks/t1/send");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.text, "继续");
    assert.equal(sent[0].body.program, "codex");
    assert.equal(sent[0].body.computer_id, "cc_elon");
    assert.match(sent[0].body.client_message_id, /^[0-9a-f-]{36}$/);
    assert.equal("model" in sent[0].body || "mode" in sent[0].body || "config" in sent[0].body, false, "no choices the user did not make");
    assert.equal(view.composer("acp").__props.value, "", "the composer clears once the gateway took it");
    assert.equal(view.host.querySelector("[data-acp-transcript]"), null, "no optimistic bubble: nothing until the row arrives");
    await deliver(rows.prompt(7, "继续"));
    assert.match(view.host.querySelector("[data-acp-transcript]").textContent, /继续/);
  } finally { await view.unmount(); }
});

test("a program's refusal (409 with its JSON-RPC error) is not repeated under the composer; a gateway refusal is shown verbatim; the text stays", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: codexSessions });
  try {
    await connect();
    globalThis.__acpRoute = (path) => path.endsWith("/send")
      ? { status: 409, body: { error: { code: -32602, message: "Invalid params", data: { model: "gpt-x" } } } } : null;
    await type(view, "acp", "用 gpt-x");
    await submit(view, "acp");
    assert.equal(view.composer("acp").__props.value, "用 gpt-x");
    assert.equal(view.host.querySelector("[data-acp-error]"), null, "the agent's own error row is the one place it shows");
    assert.equal(view.composer("acp").__props.disabled, false, "the composer re-enables");
    globalThis.__acpRoute = (path) => path.endsWith("/send")
      ? { status: 409, body: { detail: { code: "agent_not_running", message: "agent process is not running" } } } : null;
    await submit(view, "acp");
    assert.equal(view.host.querySelector("[data-acp-error]")?.textContent, "agent process is not running");
    assert.equal(view.composer("acp").__props.value, "用 gpt-x");
    const ids = posts("/send").map((call) => call.body.client_message_id);
    assert.equal(ids.length, 2);
    assert.equal(ids[0], ids[1], "the same text sent again keeps its id (the gateway dedupes)");
  } finally { await view.unmount(); }
});

test("Stop shows while a prompt row has no response and posts /stop only; Escape stops too; Close posts /close", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: codexSessions });
  try {
    await connect();
    await deliver(rows.prompt(3, "跑测试"), rows.chunk("正在跑"));
    const composer = view.composer("acp");
    assert.equal(composer.__props.loading, true, "a turn is open");
    assert.equal(composer.__props.allowSendWhileRunning, true, "the page never blocks a message itself");
    await act(async () => { composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    assert.equal(posts("/v1/tasks/t1/stop").length, 1);
    assert.equal(posts("/close").length, 0, "Stop never closes");
    await deliver(rows.done(3));
    assert.equal(view.composer("acp").__props.loading, false, "the agent's answer to the prompt ends the turn");
    const close = view.host.querySelector("[data-acp-close]");
    assert.equal(close.textContent, "关闭对话");
    await act(async () => { close.click(); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    assert.equal(posts("/v1/tasks/t1/close").length, 1);
  } finally { await view.unmount(); }
});

test("a permission card answers through /answer with the option the user picked; a background task stops through /stop-task", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_claude", "acp", "claude")] });
  try {
    await connect();
    await deliver(rows.prompt(1, "跑测试"), rows.permission(41), rows.task("bg-1"));
    const allow = view.host.querySelector('[data-native-permission-option="allow"]');
    assert.ok(allow, "the agent's request is a card");
    await act(async () => { allow.click(); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    const answered = posts("/v1/tasks/t1/answer");
    assert.equal(answered.length, 1);
    assert.deepEqual(answered[0].body, { request_id: 41, result: { outcome: { outcome: "selected", optionId: "allow" } } });
    const stopTask = view.host.querySelector('[data-acp-stop-task="bg-1"]');
    assert.ok(stopTask, "a running background task can be stopped on its own");
    await act(async () => { stopTask.click(); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    assert.deepEqual(posts("/v1/tasks/t1/stop-task").map((call) => call.body), [{ task_ref: "bg-1" }]);
    assert.equal(posts("/stop").length, 0);
    await act(async () => { socket().drop(); });
    await settle();
    assert.equal(view.host.querySelector("[data-acp-stop-task]"), null, "no per-task stop while the socket is down");
  } finally { await view.unmount(); }
});

test("CLI and terminal sessions show the terminal surface and the ConversationBar, never a chat composer", async () => {
  for (const [kind, program] of [["cli", "codex"], ["terminal", null]]) {
    const id = `cts_${kind}`;
    const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session(id, kind, program)] });
    try {
      const surface = view.host.querySelector(`[data-native-surface="${id}"]`);
      assert.ok(visible(surface), `${kind}: the surface is in front`);
      assert.equal(surface.getAttribute("data-active"), "true");
      assert.ok(visible(view.host.querySelector("[data-conversation-bar]")));
      for (const composer of view.host.querySelectorAll("[data-leo-composer]")) assert.equal(visible(composer), false, `${kind}: no visible composer`);
      assert.equal(view.host.querySelector('[data-agent-stream="cloud"]'), null);
    } finally { await view.unmount(); }
  }
});

test("the dock naming another program makes the next message a /switch (native → native); an existing chat is reused without creating anything", async () => {
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: [session("cts_claude", "acp", "claude")] });
  try {
    await connect();
    await changeConversation(view, "acp", { kind: "native", computerId: "cc_elon", computerName: "elon", program: "codex", view: "chat" });
    assert.equal(globalThis.__gateway.filter((call) => call.method === "POST").length, 0, "picking creates nothing");
    // The gateway starts Codex in a new session row; the list read after the switch has it.
    globalThis.__sessions = [session("cts_claude", "acp", "claude"), session("cts_codex2", "acp", "codex", "2026-10-30T12:00:00Z")];
    await type(view, "acp", "接着做");
    await submit(view, "acp");
    assert.equal(posts("/send").length, 0);
    const switched = posts("/v1/tasks/t1/switch");
    assert.equal(switched.length, 1);
    assert.equal(switched[0].body.program, "codex");
    assert.equal(switched[0].body.text, "接着做");
    assert.equal(view.composer("acp").__props.oceanleoDisabledReason, "要换执行位置，请新建任务", "no OceanLeo inside a native task");
    await settle();
    assert.equal(view.composer("acp").textContent.startsWith("elon · codex"), true, "the dock names the program now running");
    await type(view, "acp", "再来");
    await submit(view, "acp");
    assert.equal(posts("/v1/tasks/t1/send").length, 1, "the next message goes to the running program");
    assert.equal(posts("/switch").length, 1);
  } finally { await view.unmount(); }
});

test("OceanLeo keeps its own stream: a cloud task, and a computer-mode task with no program session; neither opens a frames socket", async () => {
  const cloud = await mount({ taskId: "t1" }, { task: cloudTask(), sessions: codexSessions });
  try {
    assert.ok(visible(cloud.host.querySelector('[data-agent-stream="cloud"]')));
    assert.match(cloud.host.textContent, /同比增长 12%。/);
    assert.equal(cloud.host.querySelector('[data-agent-stream="acp"]'), null);
    assert.equal(globalThis.__sockets.length, 0);
    assert.equal(cloud.composer("cloud").__props.onConversationChange, undefined, "no program chat inside a cloud task");
  } finally { await cloud.unmount(); }
  const leo = await mount({ taskId: "t1" }, { task: { ...cloudTask(), task: { ...cloudTask().task, mode: "computer" } }, sessions: [] });
  try {
    assert.ok(visible(leo.host.querySelector('[data-agent-stream="cloud"]')), "OceanLeo on a computer keeps its stream");
    assert.equal(globalThis.__sockets.length, 0);
  } finally { await leo.unmount(); }
});

test("no default empty copy: an empty computer task and an empty draft render nothing; only a host's emptyHint shows", async () => {
  const native = await mount({ taskId: "t1" }, { task: computerTask(), sessions: codexSessions });
  try {
    await connect();
    assert.equal(native.host.querySelector("[data-acp-transcript]"), null);
    assert.doesNotMatch(native.host.textContent, /在下方输入|开始与 agent 对话/);
  } finally { await native.unmount(); }
  const draft = await mount({}, { url: "/" });
  try { assert.doesNotMatch(draft.host.textContent, /在下方输入|开始与 agent 对话/); } finally { await draft.unmount(); }
  const hinted = await mount({ emptyHint: "问我任何问题" }, { url: "/" });
  try { assert.match(hinted.host.textContent, /问我任何问题/); } finally { await hinted.unmount(); }
});

test("a draft that picked a program: send creates the task's chat session, posts /send to that task once, then adopts it", async () => {
  const created = [];
  const draft = await mount({ onTaskCreated: (id) => created.push(id) }, { url: "/" });
  try {
    await changeConversation(draft, "cloud", { kind: "native", computerId: "cc_elon", computerName: "elon", program: "codex", view: "chat" });
    assert.equal(globalThis.__gateway.filter((call) => call.method === "POST").length, 0, "selection alone creates nothing");
    assert.ok(visible(draft.host.querySelector('[data-agent-stream="acp"]')));
    assert.equal(draft.composer("acp").__props.disabled, false, "a draft has no socket to wait for");
    await type(draft, "acp", "第一句");
    await submit(draft, "acp");
    const create = globalThis.__gateway.filter((call) => call.method === "POST" && call.path.endsWith("/task-sessions"));
    assert.equal(create.length, 1);
    assert.equal(create[0].body.kind, "acp");
    assert.equal(create[0].body.program, "codex");
    const sent = posts("/v1/tasks/t_new/send");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.text, "第一句");
    assert.equal(sent[0].body.client_message_id, create[0].body.request_id, "one id for the create and the message");
    assert.deepEqual(created, ["t_new"]);
  } finally { await draft.unmount(); }
});

test("the catalog pill: empty catalog → disabled 「选择程序后加载」; a listed model the user picked goes out with the next message only", async () => {
  const empty = await mount({ taskId: "t1" }, { task: computerTask(), sessions: codexSessions });
  try {
    await connect();
    const pill = empty.host.querySelector("[data-picker]");
    assert.equal(pill.getAttribute("data-picker"), "empty");
    assert.equal(pill.getAttribute("data-picker-summary"), "选择程序后加载");
    assert.equal(pill.getAttribute("data-picker-disabled"), "true");
    assert.ok(globalThis.__acpCalls.some((call) => call.path === "/v1/computers/cc_elon/programs/codex/catalog"));
  } finally { await empty.unmount(); }
  const view = await mount({ taskId: "t1" }, { task: computerTask(), sessions: codexSessions,
    catalog: { models: { currentModelId: "gpt-5", availableModels: [{ modelId: "gpt-5", name: "GPT-5" }, { modelId: "gpt-5-mini", name: "GPT-5 mini" }] } } });
  try {
    await connect();
    assert.equal(view.host.querySelector("[data-picker]").getAttribute("data-picker"), "ready");
    await act(async () => { globalThis.__pickerDialog.setSelectedModel("gpt-5-mini"); });
    await type(view, "acp", "一");
    await submit(view, "acp");
    await type(view, "acp", "二");
    await submit(view, "acp");
    const bodies = posts("/send").map((call) => call.body);
    assert.equal(bodies[0].model, "gpt-5-mini");
    assert.equal("model" in bodies[1], false, "an unchanged choice is not sent again");
  } finally { await view.unmount(); localStorage.clear(); }
});
