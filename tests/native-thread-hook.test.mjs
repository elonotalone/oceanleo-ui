// R1: useNativeThread drives one managed native session headlessly.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

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
    if (frame.t === "occupancy") reply({ t: "occupancy", program: frame.program, busy: this.busy ?? [] });
    if (frame.t === "open_session") {
      reply({ t: "session_opened", program: frame.program, acp_session: frame.acp_session });
      reply({ t: "transcript", program: frame.program, acp_session: frame.acp_session, live: false, frames: [
        { t: "user_message", program: frame.program, acp_session: frame.acp_session, text: "Earlier", replay: true },
        { t: "delta", program: frame.program, acp_session: frame.acp_session, text: "Earlier answer", replay: true },
      ] });
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
    export async function putComputerInbox() { throw new Error("no upload in test"); }
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

test("offline computer: cloud-saved transcript in the main stream, plain blocked reason, no socket, no send", async () => {
  FakeSocket.sockets = [];
  const reads = [];
  globalThis.__taskApi = { async transcript(id, options) {
    reads.push({ id, ...options });
    const text = options.before ? "Older question" : "Saved question";
    return { session: session(), frames: [
      { t: "user_message", program: "codex", acp_session: "nat-1", text, replay: true },
      { t: "delta", program: "codex", acp_session: "nat-1", text: "Saved answer", replay: true },
      { t: "done", program: "codex", acp_session: "nat-1", stop: "end_turn" },
    ], saved_at: "now", sync_status: "error", has_older: !options.before, next_before: options.before ? null : 7 };
  } };
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: false }, session: session(), enabled: true });
  try {
    await until(() => globalThis.__thread.messages.length === 2, "archive messages");
    const thread = globalThis.__thread;
    assert.deepEqual(thread.messages.map((m) => [m.role, m.content]), [["user", "Saved question"], ["assistant", "Saved answer"]]);
    assert.equal(thread.messages[1].meta.final, true);
    assert.equal(thread.offline, true);
    assert.equal(thread.ready, false);
    assert.equal(thread.running, false);
    assert.equal(thread.blockedReason, "这台电脑离线，只能查看已保存的对话。");
    assert.equal(thread.modelPicker, null);
    assert.equal(thread.onAttachFiles, undefined);
    assert.equal(thread.saveFailed, true);
    assert.equal(await sendVia(thread, "hi"), false);
    assert.equal(FakeSocket.sockets.length, 0, "an offline computer is never dialled");
    assert.equal(thread.hasOlder, true);
    await act(async () => thread.loadOlder());
    await until(() => globalThis.__thread.messages.length === 4, "older page");
    assert.equal(reads[1].before, 7);
    assert.deepEqual(globalThis.__thread.messages.map((m) => m.content), ["Older question", "Saved answer", "Saved question", "Saved answer"]);
  } finally { view.cleanup(); }
});

test("online: opens the bound native session, send carries task_session_id, answer and stop go to the gateway", async () => {
  FakeSocket.sockets = [];
  globalThis.__taskApi = { async transcript() { return { session: session(), frames: [], saved_at: null, sync_status: "pending", has_older: false, next_before: null }; } };
  const changes = [];
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: session(), enabled: true, onNativeSessionChange: (id) => changes.push(id) });
  try {
    await until(() => sent().some((frame) => frame.t === "open_session"), "open_session");
    const open = sent().find((frame) => frame.t === "open_session");
    assert.equal(open.acp_session, "nat-1");
    assert.equal(open.task_session_id, "managed-1");
    await until(() => globalThis.__thread.messages.some((m) => m.content === "Earlier answer"), "live transcript");
    await until(() => globalThis.__thread.ready, "ready");
    assert.equal(globalThis.__thread.blockedReason, null);
    assert.equal(globalThis.__thread.offline, false);
    assert.equal(changes.length, 0, "the already-bound native id is not reported again");

    assert.equal(await sendVia(globalThis.__thread, "Ship it"), true);
    const prompt = sent().find((frame) => frame.t === "prompt");
    assert.ok(prompt, "prompt frame");
    assert.equal(prompt.text, "Ship it");
    assert.equal(prompt.program, "codex");
    assert.equal(prompt.acp_session, "nat-1");
    assert.equal(prompt.task_session_id, "managed-1");
    await until(() => globalThis.__thread.messages.some((m) => m.role === "user" && m.content === "Ship it"), "echo");
    assert.equal(globalThis.__thread.running, true);

    await act(async () => {
      openSocket().server({ t: "turn_start", program: "codex", acp_session: "nat-1" });
      openSocket().server({ t: "permission", program: "codex", acp_session: "nat-1", id: "perm-9", title: "Allow edit?", kind: "edit",
        options: [{ id: "ok", name: "Allow", kind: "allow_once" }, { id: "no", name: "Reject", kind: "reject_once" }], tool: { title: "Edit a.ts" } });
    });
    await until(() => globalThis.__thread.messages.some((m) => m.kind === "gate"), "gate");
    const gate = globalThis.__thread.messages.find((m) => m.kind === "gate");
    await act(async () => globalThis.__thread.answer(gate, "ok"));
    await until(() => sent().some((frame) => frame.t === "permission"), "permission frame");
    assert.deepEqual(sent().find((frame) => frame.t === "permission"), { t: "permission", id: "perm-9", option: "ok" });
    await until(() => globalThis.__thread.messages.find((m) => m.kind === "gate")?.meta.native_permission.chosen === "Allow", "chosen");

    await act(async () => globalThis.__thread.stop());
    const cancel = sent().find((frame) => frame.t === "cancel");
    assert.ok(cancel, "cancel frame");
    assert.equal(cancel.program, "codex");
    assert.equal(cancel.acp_session, "nat-1");
  } finally { view.cleanup(); }
});

test("online without a native id: first prompt creates the session and reports it once", async () => {
  FakeSocket.sockets = [];
  globalThis.__taskApi = { async transcript() { return { session: session({ native_session_id: null }), frames: [], saved_at: null, sync_status: "pending" }; } };
  const changes = [];
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: session({ native_session_id: null }), enabled: true, onNativeSessionChange: (id) => changes.push(id) });
  try {
    await until(() => globalThis.__thread.ready, "ready");
    assert.equal(sent().some((frame) => frame.t === "open_session"), false);
    assert.equal(await sendVia(globalThis.__thread, "Start"), true);
    const prompt = sent().find((frame) => frame.t === "prompt");
    assert.ok(prompt.ref, "new session prompt carries a client ref");
    assert.equal(prompt.task_session_id, "managed-1");
    await act(async () => openSocket().server({ t: "turn_start", program: "codex", acp_session: "fresh-1", ref: prompt.ref }));
    await until(() => changes.length === 1, "reported");
    assert.deepEqual(changes, ["fresh-1"]);
  } finally { view.cleanup(); }
});

test("program not logged in or not installed is a plain blocked reason pointing to settings", async () => {
  FakeSocket.sockets = [];
  globalThis.__taskApi = { async transcript() { return { session: session(), frames: [], saved_at: null, sync_status: "saved" }; } };
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: session({ program: "claude", native_session_id: null }), enabled: true });
  try {
    await until(() => globalThis.__thread.blockedReason !== null, "blocked");
    assert.equal(globalThis.__thread.blockedReason, "Claude Code 还没有登录，请在设置里登录。");
    assert.equal(globalThis.__thread.ready, false);
    assert.equal(await sendVia(globalThis.__thread, "x"), false);
    assert.equal(sent().some((frame) => frame.t === "prompt"), false);
  } finally { view.cleanup(); }
  FakeSocket.sockets = [];
  const missing = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: session({ id: "managed-2", program: "hermes", native_session_id: null }), enabled: true });
  try {
    await until(() => globalThis.__thread.blockedReason !== null, "blocked install");
    assert.equal(globalThis.__thread.blockedReason, "这台电脑上还没有安装 Hermes，请在设置里安装。");
  } finally { missing.cleanup(); }
});
