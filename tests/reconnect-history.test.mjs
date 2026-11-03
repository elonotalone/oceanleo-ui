// Stop / reconnect / upload contracts exercised through the real hook and reducer; no browser.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/tasks/t" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class FakeSocket {
  static sockets = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
    FakeSocket.sockets.push(this);
    queueMicrotask(() => {
      if (this.readyState === 3) return;
      this.readyState = 1;
      this.emit("open", {});
    });
  }
  addEventListener(type, fn, options) {
    const once = Boolean(options && options.once);
    const wrapped = (event) => { if (once) this.removeEventListener(type, wrapped); fn(event); };
    wrapped.original = fn;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), wrapped]);
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== fn && item.original !== fn));
  }
  send(data) {
    const frame = JSON.parse(data);
    this.sent.push(frame);
    const reply = (out) => queueMicrotask(() => { if (this.readyState === 1) this.server(out); });
    if (frame.t === "status") reply(STATUS);
    if (frame.t === "occupancy" && !FakeSocket.silentOccupancy) reply({ t: "occupancy", program: frame.program, busy: this.busy ?? [] });
    if (frame.t === "models") reply({ t: "models", program: frame.program, models: [{ id: "gpt-x", name: "GPT X", default: true }, { id: "gpt-y", name: "GPT Y" }] });
    if (frame.t === "sessions") reply({ t: "sessions", program: frame.program, sessions: [{ id: "srv-active", title: "Someone else's", updated_at: "2026-10-30" }], active: "srv-active" });
    if (frame.t === "open_session" && FakeSocket.holdOpen) {
      FakeSocket.heldOpen = { socket: this, frame };
      return;
    }
    if (frame.t === "open_session") {
      reply({ t: "session_opened", program: frame.program, acp_session: frame.acp_session });
      reply({ t: "transcript", program: frame.program, acp_session: frame.acp_session, live: false, frames: FakeSocket.replayOnOpen ? [
        { t: "user_message", program: frame.program, acp_session: frame.acp_session, text: "Earlier", replay: true },
        { t: "delta", program: frame.program, acp_session: frame.acp_session, text: "Earlier answer", replay: true },
      ] : [] });
    }
  }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.emit("close", {}); }
  emit(type, event) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event); }
  server(frame) { this.emit("message", { data: JSON.stringify(frame) }); }
}
FakeSocket.CONNECTING = 0; FakeSocket.OPEN = 1; FakeSocket.CLOSING = 2; FakeSocket.CLOSED = 3;
globalThis.WebSocket = FakeSocket;
window.WebSocket = FakeSocket;

const STATUS = { t: "status", programs: [
  { id: "codex", installed: true, path: "/c", version: "1", auth: "login", logged_in: true, dir_capability: "full", running: false },
  { id: "claude", installed: true, path: "/cl", version: "1", auth: "none", logged_in: false, dir_capability: "full", running: false },
  { id: "hermes", installed: false, path: "", version: "", auth: "none", logged_in: null, dir_capability: "full", running: false },
] };

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const stubs = {
  "../../lib/computer-task-api": dataModule(`
    export async function getComputerTaskTranscript(id, options) { return globalThis.__taskApi.transcript(id, options ?? {}); }
  `),
  "../../i18n/ui/useUI": uiStub,
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/cloud-computer-api": dataModule(`
    export function agentDialogWsUrl(id) { return "ws://example.test/v1/computers/" + id + "/agent-dialog"; }
    // The composer pill's computer sections default to this client (never called here).
    export const cloudComputerApi = {};
    export async function putComputerInbox(id, file, onProgress, options) {
      if (globalThis.__uploadAttempt) return globalThis.__uploadAttempt(id, file, onProgress, options);
      (globalThis.__inboxPuts ??= []).push({ name: file.name, task_session_id: options?.task_session_id ?? null });
      onProgress?.(100);
      return { path: "/home/elon/.oceanleo/inbox/" + file.name, name: file.name, mime: file.type || "text/plain", size: file.size };
    }
  `),
  "../../../lib/auth/client": dataModule(`export async function accessToken() { return "tok"; }`),
  "../../../lib/agent": dataModule(`export async function getTask() { return { ok: false }; } export async function stopTask() { return { ok: false }; }`),
  "../../../lib/cloud-computer-agent-api": dataModule(`
    export async function agentState() { return { ok: false, status: 0 }; }
    export async function agentTurn() { return { ok: false, status: 0 }; }
    export async function agentReset() { return { ok: true }; }
  `),
};
const { useNativeThread } = await import(await compileModule("src/shell/native-thread/useNativeThread.ts", stubs));

function Probe(props) {
  globalThis.__thread = useNativeThread(props);
  return null;
}

async function until(fn, label) {
  for (let i = 0; i < 80; i += 1) {
    if (fn()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }
  throw new Error(label);
}

async function mount(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Probe, props)));
  return {
    async update(next) { await act(async () => root.render(React.createElement(Probe, { ...props, ...next }))); },
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
}

async function sendVia(thread, text) {
  let result;
  await act(async () => { result = await thread.send(text); });
  return result;
}

const sent = () => FakeSocket.sockets.flatMap((socket) => socket.sent);
const openSocket = () => [...FakeSocket.sockets].reverse().find((socket) => socket.readyState === 1);

function session(overrides = {}) {
  return { id: "managed-1", task_id: "task", computer_id: "cc_1", computer_name: "elon", kind: "acp", program: "codex",
    native_session_id: "nat-1", created_at: "", updated_at: "", sync_status: "saved", ...overrides };
}

const { mergeSavedAndLive, mergeTranscriptPages } = await import("../src/shell/native-thread/merge.ts");
const { applyDialog, initialDialogState } = await import("../src/shell/cloud-computer/agent-dialog/reduce.ts");
const promptRow = (text, id = text, at) => ({ kind: "user", id, text, ...(at !== undefined ? { at } : {}) });
const turn = (text, extra = {}) => ({ kind: "turn", id: `turn-${text}`, acpSession: "s", stop: "end_turn",
  items: [{ kind: "assistant", id: `text-${text}`, text }], ...extra });
const texts = (rows) => rows.flatMap((row) => row.kind === "user" ? row.text : row.kind === "turn" ? row.items.filter((i) => i.kind === "assistant").map((i) => i.text) : []);

test("adoption with only an autonomous turn preserves all saved history and the new output", () => {
  const saved = [promptRow("one"), turn("first"), promptRow("two"), turn("second")];
  const live = [turn("autonomous update", { live: true, stop: "" })];
  assert.deepEqual(texts(mergeSavedAndLive(saved, live, { replay: false }).messages), ["one", "first", "two", "second", "autonomous update"]);
  assert.deepEqual(texts(mergeSavedAndLive(saved, live).messages), ["one", "first", "two", "second", "autonomous update"]);
});

test("overlapping saved and live prompts / replies appear once, growing text and tool ids update in place", () => {
  const savedTool = { kind: "tool", id: "saved-tool", tool: { id: "tool-id", status: "in_progress" } };
  const liveTool = { kind: "tool", id: "live-tool", tool: { id: "tool-id", status: "completed" } };
  const saved = [promptRow("old"), turn("done"), promptRow("current"), turn("working", { items: [savedTool, { kind: "assistant", id: "a", text: "working" }] })];
  const live = [promptRow("current", "echo"), turn("working longer", { live: true, stop: "", items: [liveTool, { kind: "assistant", id: "b", text: "working longer" }] })];
  const merged = mergeSavedAndLive(saved, live).messages;
  assert.deepEqual(texts(merged), ["old", "done", "current", "working longer"]);
  assert.equal(merged.at(-1).items.filter((item) => item.kind === "tool").length, 1);
  assert.equal(merged.at(-1).items[0].tool.status, "completed");
  assert.equal(merged.at(-1).items[0].id, "saved-tool");
  assert.equal(merged.at(-2).id, "current");
});

test("replayed autonomous turns under the same prompt are not doubled", () => {
  const saved = [promptRow("one"), turn("reply one"), turn("reply two")];
  const live = [promptRow("one", "new-id"), turn("reply one", { id: "replay-a" }), turn("reply two", { id: "replay-b" })];
  assert.deepEqual(texts(mergeSavedAndLive(saved, live).messages), ["one", "reply one", "reply two"]);
});

test("replay may replace saved history only when it covers the replies as well as every prompt", () => {
  const saved = [promptRow("one"), turn("answer one"), promptRow("two"), turn("answer two")];
  assert.equal(mergeSavedAndLive(saved, [promptRow("two"), turn("answer two")], { replay: true }).source, "merged");
  assert.equal(mergeSavedAndLive(saved, [promptRow("one"), promptRow("two")], { replay: true }).source, "merged");
  const partialReply = [promptRow("one"), turn("ans"), promptRow("two"), turn("answer two")];
  const partialMerge = mergeSavedAndLive(saved, partialReply, { replay: true });
  assert.equal(partialMerge.source, "merged", "a reply prefix cannot hide the saved ending");
  assert.ok(texts(partialMerge.messages).includes("answer one"));
  assert.equal(mergeSavedAndLive(saved, saved, { replay: true }).source, "live");
});

test("distinct long prompts, stable message ids and distant repeated prompts never collapse", () => {
  const prefix = "a".repeat(450);
  for (const [a, b] of [
    [promptRow(prefix + "one"), promptRow(prefix + "two")],
    [promptRow("again", "frame:codex:s:1"), promptRow("again", "frame:codex:s:2")],
    [promptRow("again", "a", 1), promptRow("again", "b", 100_000)],
  ]) assert.equal(mergeSavedAndLive([a, turn("old")], [b, turn("new")]).messages.filter((row) => row.kind === "user").length, 2);
});

test("reread tail merges without duplicate prompts or losing older pages", () => {
  const pages = [promptRow("one"), turn("first"), promptRow("two"), turn("second")];
  const tail = [promptRow("two"), turn("second"), promptRow("three"), turn("third")];
  assert.deepEqual(texts(mergeTranscriptPages(pages, tail)), ["one", "first", "two", "second", "three", "third"]);
});

for (const t of ["status", "delta", "turn_start", "occupancy", "session_opened"]) test(`${t} clears reconnect offline state`, () => {
  let state = { ...initialDialogState(), program: "codex", activeSession: "s" };
  state = applyDialog(state, { type: "frame", frame: { t: "error", code: "computer_reconnecting", program: "codex" } });
  assert.equal(state.offline, true);
  state = applyDialog(state, { type: "frame", frame: { t, program: "codex", acp_session: "s", text: "back", programs: [], busy: [], link: "attached" } });
  assert.equal(state.offline, false);
});

let serial = 0;
async function openThread({ offline = false, frames = [], hasOlder = false } = {}) {
  FakeSocket.sockets = [];
  FakeSocket.replayOnOpen = false;
  const row = session({ id: `reconnect-${++serial}`, native_session_id: `native-${serial}` });
  const computer = { id: `computer-${serial}`, name: "elon", node_online: !offline };
  globalThis.__taskApi = { async transcript() { return { session: row, frames, has_older: hasOlder, next_before: hasOlder ? 10 : null }; } };
  const mounted = await mount({ computer, session: row, enabled: true });
  if (!offline) await until(() => globalThis.__thread.ready, "thread ready");
  return { ...mounted, row, computer, get thread() { return globalThis.__thread; },
    async frame(frame) { await act(async () => openSocket().server({ program: "codex", acp_session: row.native_session_id, ...frame })); },
    async start() { await this.frame({ t: "turn_start" }); await this.frame({ t: "tool", id: "work", status: "in_progress" }); },
  };
}

test("Stop sends bounded identified cancel, ignores foreign reply, then ends output and allows next prompt", async () => {
  const view = await openThread();
  try {
    await view.start();
    assert.equal(view.thread.running, true);
    await act(async () => { view.thread.stop(); view.thread.stop(); });
    const cancels = sent().filter((frame) => frame.t === "cancel");
    assert.equal(cancels.length, 1);
    assert.equal(cancels[0].task_session_id, view.row.id);
    assert.equal(cancels[0].acp_session, view.row.native_session_id);
    assert.match(cancels[0].stop_id, /^[A-Za-z0-9_-]{1,64}$/);
    assert.equal(view.thread.stopState, "stopping");
    assert.equal(view.thread.running, true);
    await view.frame({ t: "cancel_result", stop_id: "another", result: "stopped" });
    assert.equal(view.thread.stopState, "stopping");
    await view.frame({ t: "cancel_result", stop_id: cancels[0].stop_id, result: "stopped" });
    assert.equal(view.thread.stopState, "stopped");
    assert.equal(view.thread.running, false);
    assert.equal(view.thread.ready, true);
    assert.equal(await sendVia(view.thread, "next turn"), true);
    await view.frame({ t: "done", stop: "cancelled" });
    assert.equal(view.thread.running, true, "late duplicate done must not close the next prompt");
  } finally { view.cleanup(); }
});

for (const result of ["offline", "failed"]) test(`Stop ${result} returns a reason and restores working output`, async () => {
  const view = await openThread();
  try {
    await view.start();
    await act(async () => view.thread.stop());
    const cancel = sent().find((frame) => frame.t === "cancel");
    await view.frame({ t: "cancel_result", stop_id: cancel.stop_id, result, detail: "close_unsupported" });
    assert.equal(view.thread.stopState, "error");
    assert.match(view.thread.stopError, result === "offline" ? /电脑不在线/ : /close_unsupported/);
    assert.equal(view.thread.running, true);
    await act(async () => view.thread.stop());
    assert.equal(sent().filter((frame) => frame.t === "cancel").length, 2);
  } finally { view.cleanup(); }
});

test("Stop on a thread that is not live says computer offline", async () => {
  const view = await openThread({ offline: true });
  try {
    await act(async () => view.thread.stop());
    assert.match(view.thread.stopError, /电脑不在线，停止指令没有送到/);
    assert.equal(sent().length, 0);
  } finally { view.cleanup(); }
});

test("controller Stop deadline is 15 seconds, restores running and permits a second request", async (t) => {
  const view = await openThread();
  try {
    await view.start();
    // Intercept only the Stop deadline; replacing every timer after mounting would
    // prevent cleanup of real socket / occupancy timers created before the fake clock.
    const realSetTimeout = globalThis.setTimeout;
    let deadline;
    t.mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
      if (delay === 15_000) deadline = callback;
      return realSetTimeout(callback, delay, ...args);
    });
    await act(async () => view.thread.stop());
    assert.equal(typeof deadline, "function");
    assert.equal(view.thread.stopState, "stopping");
    await act(async () => deadline());
    assert.equal(view.thread.stopState, "error");
    assert.match(view.thread.stopError, /没有回应停止指令/);
    assert.equal(view.thread.running, true);
    await act(async () => view.thread.stop());
    assert.equal(sent().filter((frame) => frame.t === "cancel").length, 2);
  } finally { view.cleanup(); t.mock.restoreAll(); }
});

test("confirmed Stop clears only the stopped turn's unacknowledged prompt", async () => {
  const view = await openThread();
  try {
    assert.equal(await sendVia(view.thread, "cancel before acknowledgement"), true);
    await act(async () => view.thread.stop());
    const cancel = sent().find((frame) => frame.t === "cancel");
    await view.frame({ t: "cancel_result", stop_id: cancel.stop_id, result: "stopped" });
    await view.frame({ t: "error", code: "computer_reconnecting", detail: "prompt_not_sent" });
    assert.equal(view.thread.pending, null, "the cancelled send must not reappear as a new unsent prompt");
    assert.equal(view.thread.restoredDraft, null);
  } finally { view.cleanup(); }
});

test("a real cancellation of the next turn is never suppressed as the previous Stop's echo", async () => {
  const view = await openThread();
  try {
    await view.start();
    await act(async () => view.thread.stop());
    const cancel = sent().find((frame) => frame.t === "cancel");
    await view.frame({ t: "cancel_result", stop_id: cancel.stop_id, result: "stopped" });
    assert.equal(await sendVia(view.thread, "next"), true);
    await view.frame({ t: "turn_start" });
    await view.frame({ t: "done", stop: "cancelled" });
    assert.equal(view.thread.running, false, "Stop from another page ends this turn too");
  } finally { view.cleanup(); }
});

test("Stop while a first session is being created withdraws its queued prompt instead of starting it later", async () => {
  FakeSocket.sockets = [];
  const computer = { id: "computer-queued-stop", name: "elon", node_online: true };
  globalThis.__taskApi = { async transcript() { return { frames: [] }; } };
  const view = await mount({ computer, session: null, program: "codex", enabled: true });
  try {
    await until(() => openSocket(), "draft socket");
    await act(async () => { globalThis.__thread.queue("do not start after Stop"); globalThis.__thread.stop(); });
    assert.equal(globalThis.__thread.pending, null);
    assert.equal(globalThis.__thread.restoredDraft.text, "do not start after Stop");
    const cancel = sent().find((frame) => frame.t === "cancel");
    await act(async () => openSocket().server({ t: "cancel_result", program: "codex", stop_id: cancel.stop_id, result: "not_running" }));
    await view.update({ session: session({ id: "created-after-stop", computer_id: computer.id, native_session_id: null }) });
    assert.equal(sent().some((frame) => frame.t === "prompt"), false);
    assert.equal(globalThis.__thread.pending, null, "withdrawn text cannot auto-send");
    assert.equal(globalThis.__thread.restoredDraft.text, "do not start after Stop", "withdrawn text is restored to the composer");
  } finally { view.cleanup(); }
});

test("offline Enter queues visibly, reconnect flushes it exactly once", async () => {
  const view = await openThread({ offline: true });
  try {
    await act(async () => assert.equal(view.thread.queue("keep my prompt"), true));
    assert.equal(view.thread.pending.unsent, null);
    assert.match(view.thread.pending.waiting, /电脑重连中/);
    assert.ok(view.thread.messages.some((message) => message.content === "keep my prompt"));
    await view.update({ computer: { ...view.computer, node_online: true } });
    await until(() => sent().some((frame) => frame.t === "prompt"), "queued prompt flushes");
    assert.equal(sent().filter((frame) => frame.t === "prompt" && frame.text === "keep my prompt").length, 1);
    assert.equal(view.thread.pending, null);
  } finally { view.cleanup(); }
});

test("prompt_not_sent restores an unsent bubble with files and a one-click resend", async () => {
  const view = await openThread();
  try {
    await act(async () => view.thread.onAttachFiles([new File(["x"], "picture.png", { type: "image/png" })]));
    await until(() => view.thread.composerAttachments[0]?.uploading === false, "uploaded file");
    assert.equal(await sendVia(view.thread, "with picture"), true);
    await view.frame({ t: "error", code: "computer_reconnecting", detail: "prompt_not_sent" });
    await until(() => Boolean(view.thread.pending?.unsent), "unsent bubble");
    assert.match(view.thread.pending.unsent, /没有发出去/);
    assert.equal(view.thread.messages.filter((message) => message.role === "user" && message.content === "with picture").length, 1);
    await view.frame({ t: "status", link: "attached", programs: STATUS.programs });
    await view.frame({ t: "occupancy", busy: [] });
    await act(async () => view.thread.retry());
    await until(() => sent().filter((frame) => frame.t === "prompt").length === 2, "resend");
    const retry = sent().filter((frame) => frame.t === "prompt").at(-1);
    assert.equal(retry.text, "with picture");
    assert.equal(retry.files.length, 1);
  } finally { view.cleanup(); }
});

test("failed upload blocks text, retries transient 409 three times, manual retry sends text and picture together", async () => {
  const view = await openThread();
  let attempts = 0;
  let failing = true;
  globalThis.__uploadAttempt = async () => {
    attempts++;
    if (failing) throw Object.assign(new Error("busy"), { code: "node_busy", status: 409 });
    return { path: "/home/elon/.oceanleo/inbox/picture.png", name: "picture.png", mime: "image/png", size: 1 };
  };
  try {
    await act(async () => view.thread.onAttachFiles([new File(["x"], "picture.png", { type: "image/png" })]));
    // Sending directly while an upload is pending also waits; text never goes alone.
    let sending;
    await act(async () => { sending = view.thread.send("with picture"); });
    await act(async () => { assert.equal(await sending, false); });
    assert.equal(attempts, 3);
    assert.equal(sent().filter((frame) => frame.t === "prompt").length, 0);
    assert.equal(view.thread.composerAttachments[0].failed, true);
    assert.equal(view.thread.composerAttachments[0].failedReason, "电脑正忙");
    await act(async () => assert.equal(view.thread.queue("with picture"), false));
    failing = false;
    await act(async () => view.thread.onRetryAttachment(view.thread.composerAttachments[0].id));
    assert.equal(await sendVia(view.thread, "with picture"), true);
    const prompt = sent().find((frame) => frame.t === "prompt");
    assert.equal(prompt.text, "with picture");
    assert.equal(prompt.files.length, 1);
    assert.equal(attempts, 4);
  } finally { delete globalThis.__uploadAttempt; view.cleanup(); }
});

// Exercise the actual native conversation component without importing AgentChat's
// unrelated editor/runtime graph. Only its collaborators are replaced, not its effects.
const chatPath = new URL("../src/shell/AgentChat.tsx", import.meta.url);
const chatSource = readFileSync(chatPath, "utf8");
const ast = ts.createSourceFile("AgentChat.tsx", chatSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["NativeChatConversation", "isNearBottom", "scrollMetricsOf", "shouldLoadOlder", "scrollBehavior"]);
const extracted = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map((node) => node.getText(ast)).join("\n");
const scrollModule = ts.transpileModule(`
  import React, {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};
  import { placeConversationScroll, rememberConversationScroll, scrollPaneShown } from ${JSON.stringify(new URL("../src/shell/task-scroll-memory.ts", import.meta.url).href)};
  const STICK_TO_BOTTOM_PX=80, LOAD_OLDER_PX=200, OLDER_ANCHOR_STALE_MS=15000;
  const NativeSetupRequest=React.createContext(0), PROGRAM_LABEL={codex:"Codex"};
  const useNativeThread=()=>globalThis.__scrollThread;
  const useShareMode=()=>({enter(){},exit(){}});
  const hasPendingNativePrompt=()=>false;
  const takePendingNativePrompt=()=>null;
  const notifyHistoryActivity=()=>{};
  const useTaskLoadingReport=()=>{};
  ${extracted}
  export {NativeChatConversation};
`, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { NativeChatConversation } = await import(dataModule(scrollModule));

test("short first page automatically loads older pages when the cursor arrives, until exhausted or overflowing", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let reads = 0;
  const messages = [{ id: -1, role: "user", content: "newest" }];
  const thread = { messages, hasOlder: false, loadOlder() { reads++; }, dialog: { activeSession: "" } };
  const row = session({ id: "scroll-contract" });
  const render = async (patch = {}) => {
    globalThis.__scrollThread = { ...thread, ...patch };
    await act(async () => root.render(React.createElement(NativeChatConversation, {
      session: row, computer: { node_online: true }, active: true, onNativeSessionChange() {},
      conversation: { kind: "native", program: "codex" }, shareInfo: {}, onShareExit() {},
      render: (pane) => React.createElement("div", { ref: pane.scrollRef, "data-scroll": true }),
    })));
  };
  window.HTMLElement.prototype.scrollTo = function () {};
  try {
    await render();
    assert.equal(reads, 0);
    await render({ hasOlder: true });
    assert.equal(reads, 1, "same messages, cursor arrived later; no scroll event needed");
    await render({ hasOlder: true, olderLoading: true });
    assert.equal(reads, 1, "one batch in flight");
    const older = [{ id: -2, role: "user", content: "older" }, ...messages];
    await render({ hasOlder: true, messages: older });
    assert.equal(reads, 2, "page still short: next batch automatically");
    await render({ hasOlder: false, messages: older });
    assert.equal(reads, 2, "exhausted");
    const scroller = host.querySelector("[data-scroll]");
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 600 });
    await render({ hasOlder: true, messages: [{ id: -3, role: "user", content: "oldest" }, ...older] });
    assert.equal(reads, 2, "overflowing: wait for the person's scroll");
  } finally { act(() => root.unmount()); host.remove(); delete globalThis.__scrollThread; }
});

