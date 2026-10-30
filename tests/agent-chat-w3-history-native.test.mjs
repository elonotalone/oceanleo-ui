// ============================================================================
// W3 2026-10-31: history hands the task it already read to AgentChat
// ----------------------------------------------------------------------------
// `initialTask` paints the conversation at once and AgentChat does not GET the
// same task again (no mount fetch, no first poll for a finished task). A seed
// for another task is ignored. A native send the computer refused puts its text
// back into an empty composer (thread.restoredDraft). Harness: the same stubs as
// agent-chat-conversations.test.mjs, with getTask calls counted.
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
  globalThis.__getTaskCalls = [];
  export async function getTask(id) {
    globalThis.__getTaskCalls.push(id);
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
        restoredDraft: state.restoredDraft ?? null,
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


const cloudTask = (id = "t1") => ({
  task: { id, status: "done", title: "同比分析", mode: "agent", plan: {} },
  messages: [
    { id: 1, role: "user", kind: "text", content: "帮我算个同比" },
    { id: 2, role: "assistant", kind: "text", content: "同比增长 12%。", meta: { done: true } },
  ],
  artifacts: [],
});

async function settle(ms = 40) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

async function mount(props, { task = null, sessions = [] } = {}) {
  window.history.replaceState(null, "", "/history?task=t1");
  globalThis.__task = task;
  globalThis.__sessions = sessions;
  globalThis.__listFails = 0;
  globalThis.__listHang = false;
  globalThis.__getTaskCalls.length = 0;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(AgentChat, { siteId: "oceanleo", ...props })); });
  // Longer than the first poll (POLL_FIRST_MS = 120): a finished seeded task is never polled.
  await settle(200);
  return {
    host,
    composer: (kind) => host.querySelector(`[data-leo-composer="${kind}"]`),
    async rerender(next) { await act(async () => { root.render(React.createElement(AgentChat, { siteId: "oceanleo", ...next })); }); },
    async unmount() { await act(async () => root.unmount()); host.remove(); globalThis.__task = null; },
  };
}

test("initialTask paints the conversation with no GET of the same task", async () => {
  const view = await mount({ taskId: "t1", initialTask: cloudTask("t1") }, { task: cloudTask("t1") });
  try {
    assert.match(view.host.textContent, /同比增长 12%。/);
    assert.deepEqual(globalThis.__getTaskCalls, [], "the seeded task is not fetched again");
  } finally { await view.unmount(); }
});

test("without initialTask the task is read as before", async () => {
  const view = await mount({ taskId: "t1" }, { task: cloudTask("t1") });
  try {
    assert.match(view.host.textContent, /同比增长 12%。/);
    assert.ok(globalThis.__getTaskCalls.includes("t1"));
  } finally { await view.unmount(); }
});

test("a seed for another task is ignored", async () => {
  const view = await mount({ taskId: "t1", initialTask: cloudTask("other") }, { task: cloudTask("t1") });
  try {
    assert.ok(globalThis.__getTaskCalls.includes("t1"));
  } finally { await view.unmount(); }
});

test("a refused native send puts its text back into an empty composer, once per restore", async () => {
  const task = { task: { id: "t1", status: "completed", title: "elon · codex", mode: "computer", plan: { computer_workspace: { version: 1 } } }, messages: [], artifacts: [] };
  const sessions = [{ id: "cts_codex", task_id: "t1", computer_id: "cc_elon", computer_name: "elon", kind: "acp", program: "codex",
    native_session_id: "nat-1", created_at: "", updated_at: "2026-10-30T11:00:00Z", sync_status: "saved" }];
  globalThis.__thread = { messages: [], restoredDraft: null };
  const view = await mount({ taskId: "t1" }, { task, sessions });
  try {
    assert.ok(view.composer("native"), "the native composer is shown");
    globalThis.__thread = { messages: [], restoredDraft: { seq: 1, text: "我刚打的字" } };
    await view.rerender({ taskId: "t1" });
    assert.equal(view.composer("native").__props.value, "我刚打的字");
    // Typing something else, then a re-render with the same restore: nothing is overwritten.
    await act(async () => { view.composer("native").__props.onChange("新内容"); });
    await view.rerender({ taskId: "t1" });
    assert.equal(view.composer("native").__props.value, "新内容");
    // A new restore never overwrites what is typed.
    globalThis.__thread = { messages: [], restoredDraft: { seq: 2, text: "第二次" } };
    await view.rerender({ taskId: "t1" });
    assert.equal(view.composer("native").__props.value, "新内容");
  } finally { await view.unmount(); globalThis.__thread = null; }
});
