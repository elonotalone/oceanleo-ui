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
    if (frame.t === "occupancy" && !FakeSocket.silentOccupancy) reply({ t: "occupancy", program: frame.program, busy: this.busy ?? [] });
    if (frame.t === "models") reply({ t: "models", program: frame.program, models: [{ id: "gpt-x", name: "GPT X", default: true }, { id: "gpt-y", name: "GPT Y" }] });
    if (frame.t === "sessions") reply({ t: "sessions", program: frame.program, sessions: [{ id: "srv-active", title: "Someone else's", updated_at: "2026-10-30" }], active: "srv-active" });
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
    export async function putComputerInbox(id, file, onProgress) {
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

test("live is exposed; offline threads are not live and ignore answers", async () => {
  FakeSocket.sockets = [];
  globalThis.__taskApi = { async transcript() { return { session: session(), frames: [], saved_at: null, sync_status: "saved" }; } };
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: session(), enabled: true });
  try {
    await until(() => globalThis.__thread.live === true, "live");
    assert.equal(globalThis.__thread.draft, false);
    await view.update({ computer: { id: "cc_1", name: "elon", node_online: false } });
    await until(() => globalThis.__thread.live === false, "not live offline");
    const before = sent().length;
    await act(async () => globalThis.__thread.answer({ id: -1, role: "assistant", kind: "gate", content: "", meta: { native_permission: { permId: "p", options: [{ id: "o", name: "O", kind: "allow_once" }], chosen: "", auto: false } } }, "o"));
    assert.equal(sent().slice(before).some((frame) => frame.t === "permission"), false);
  } finally { view.cleanup(); }
});

test("send reports the controller's outcome; attachment-only sends go out with files", async () => {
  FakeSocket.sockets = [];
  globalThis.__taskApi = { async transcript() { return { session: session(), frames: [], saved_at: null, sync_status: "saved" }; } };
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: session(), enabled: true });
  try {
    await until(() => globalThis.__thread.ready, "ready");
    assert.equal(await sendVia(globalThis.__thread, "   "), false, "nothing to send is not a send");
    assert.equal(sent().some((frame) => frame.t === "prompt"), false);
    const file = new window.File(["hello"], "notes.txt", { type: "text/plain" });
    await act(async () => globalThis.__thread.onAttachFiles([file]));
    await until(() => globalThis.__thread.composerAttachments.length === 1 && !globalThis.__thread.composerAttachments[0].uploading, "uploaded");
    assert.equal(await sendVia(globalThis.__thread, ""), true);
    const prompt = sent().find((frame) => frame.t === "prompt");
    assert.equal(prompt.text, "");
    assert.deepEqual(prompt.files, [{ name: "notes.txt", mime: "text/plain", path: "/home/elon/.oceanleo/inbox/notes.txt" }]);
    await until(() => globalThis.__thread.composerAttachments.length === 0, "attachments cleared");
    await until(() => !globalThis.__thread.ready, "busy after send");
    assert.equal(await sendVia(globalThis.__thread, "again"), false, "a send while the turn is pending is refused");
    assert.equal(sent().filter((frame) => frame.t === "prompt").length, 1);
  } finally { view.cleanup(); }
});

test("draft mode connects for status and models, never opens, creates or prompts a session; then hands over to the new session", async () => {
  FakeSocket.sockets = [];
  const reads = [];
  globalThis.__taskApi = { async transcript(id) { reads.push(id); return { session: session({ native_session_id: null }), frames: [], saved_at: null, sync_status: "pending" }; } };
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: null, program: "codex", enabled: true });
  try {
    await until(() => sent().some((frame) => frame.t === "models"), "models requested");
    await until(() => globalThis.__thread.modelPicker !== null, "model picker");
    await until(() => sent().some((frame) => frame.t === "sessions"), "sessions listed");
    for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    const thread = globalThis.__thread;
    assert.equal(thread.draft, true);
    assert.equal(thread.live, true);
    assert.equal(thread.ready, false);
    assert.equal(thread.blockedReason, null);
    assert.equal(thread.dialog.programs.find((row) => row.id === "codex")?.installed, true, "program status loaded for settings");
    assert.equal(await sendVia(thread, "hi"), false);
    assert.deepEqual(sent().filter((frame) => ["open_session", "prompt", "new_session"].includes(frame.t)), [], "no session opened, created or prompted");
    assert.equal(thread.dialog.activeSession, "", "the gateway's active session is not adopted");
    assert.deepEqual(reads, [], "no archive read without a session");

    await act(async () => globalThis.__thread.dialog.setSelectedModel("gpt-y"));
    await view.update({ session: session({ native_session_id: null }) });
    await until(() => globalThis.__thread.ready, "ready with session");
    assert.equal(globalThis.__thread.draft, false);
    assert.equal(await sendVia(globalThis.__thread, "First prompt"), true);
    const prompt = sent().find((frame) => frame.t === "prompt");
    assert.equal(prompt.task_session_id, "managed-1");
    assert.equal(prompt.model, "gpt-y", "the draft's model choice carries into the first prompt");
  } finally { view.cleanup(); }
});

test("a hidden chat stays connected and keeps receiving frames", async () => {
  FakeSocket.sockets = [];
  globalThis.__taskApi = { async transcript() { return { session: session(), frames: [], saved_at: null, sync_status: "saved" }; } };
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: session(), enabled: true });
  const hiddenDescriptor = Object.getOwnPropertyDescriptor(window.document, "hidden");
  try {
    await until(() => globalThis.__thread.live, "live");
    Object.defineProperty(window.document, "hidden", { configurable: true, get: () => true });
    await act(async () => window.document.dispatchEvent(new window.Event("visibilitychange")));
    await view.update({});
    const socket = openSocket();
    assert.ok(socket, "socket still open while hidden");
    await act(async () => {
      socket.server({ t: "turn_start", program: "codex", acp_session: "nat-1" });
      socket.server({ t: "question", program: "codex", acp_session: "nat-1", id: "ask-2", title: "Continue?", questions: [] });
    });
    await until(() => globalThis.__thread.messages.some((m) => m.meta?.native_question?.questionId === "ask-2"), "frame received while hidden");
    assert.equal(globalThis.__thread.live, true);
  } finally {
    if (hiddenDescriptor) Object.defineProperty(window.document, "hidden", hiddenDescriptor);
    else delete window.document.hidden;
    view.cleanup();
  }
});

test("a brand-new session is ready once the link is up, without waiting for an occupancy reply", async () => {
  FakeSocket.sockets = [];
  FakeSocket.silentOccupancy = true;
  globalThis.__taskApi = { async transcript() { return { session: session({ native_session_id: null }), frames: [], saved_at: null, sync_status: "pending" }; } };
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: session({ native_session_id: null }), enabled: true });
  try {
    await until(() => globalThis.__thread.ready, "ready without occupancy");
    assert.equal(globalThis.__thread.dialog.occupancyAt ?? null, null, "no occupancy reply was ever received");
    assert.equal(await sendVia(globalThis.__thread, "Go"), true, "the controller sends too");
    assert.equal(sent().filter((frame) => frame.t === "prompt").length, 1);
    await until(() => !globalThis.__thread.ready, "a pending send still holds the new conversation");
    assert.equal(await sendVia(globalThis.__thread, "Again"), false, "no double send into the same new conversation");
  } finally { view.cleanup(); FakeSocket.silentOccupancy = false; }
});

test("queued first prompt: the bubble (with its files) shows at once in a draft, goes out once when the session binds, no archive read", async () => {
  FakeSocket.sockets = [];
  const reads = [];
  globalThis.__taskApi = { async transcript(id) { reads.push(id); return { session: session({ native_session_id: null }), frames: [], saved_at: null, sync_status: "pending" }; } };
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: null, program: "codex", enabled: true });
  try {
    await until(() => sent().some((frame) => frame.t === "models"), "prewarm: models requested on pick");
    await until(() => globalThis.__thread.onAttachFiles, "attachments accepted in a draft");
    const file = new window.File(["png"], "shot.png", { type: "image/png" });
    await act(async () => globalThis.__thread.onAttachFiles([file]));
    await until(() => globalThis.__thread.composerAttachments.length === 1 && !globalThis.__thread.composerAttachments[0].uploading, "uploaded");
    let queued;
    await act(async () => { queued = globalThis.__thread.queue("先看日志"); });
    assert.equal(queued, true);
    const bubble = globalThis.__thread.messages.at(-1);
    assert.equal(bubble.role, "user");
    assert.equal(bubble.content, "先看日志");
    assert.equal(bubble.meta.native_pending, true);
    assert.deepEqual(bubble.meta.attachments.map((item) => [item.name, item.media_type]), [["shot.png", "image"]]);
    assert.deepEqual(globalThis.__thread.composerAttachments, [], "its files ride on the bubble, not in the composer");
    assert.deepEqual(globalThis.__thread.pending, { text: "先看日志", unsent: null });
    let again;
    await act(async () => { again = globalThis.__thread.queue("第二句"); });
    assert.equal(again, false, "one first prompt at a time");
    assert.equal(sent().some((frame) => frame.t === "prompt"), false, "nothing goes out without a session");

    await view.update({ session: session({ native_session_id: null }) });
    await until(() => sent().some((frame) => frame.t === "prompt"), "sent once bound");
    const prompt = sent().find((frame) => frame.t === "prompt");
    assert.equal(prompt.text, "先看日志");
    assert.equal(prompt.task_session_id, "managed-1");
    assert.deepEqual(prompt.files, [{ name: "shot.png", mime: "image/png", path: "/home/elon/.oceanleo/inbox/shot.png" }]);
    await until(() => globalThis.__thread.pending === null, "pending cleared");
    assert.equal(globalThis.__thread.messages.filter((message) => message.role === "user").length, 1, "one bubble, not two");
    for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    assert.equal(sent().filter((frame) => frame.t === "prompt").length, 1, "exactly one prompt");
    assert.deepEqual(reads, [], "a session born from this draft has nothing saved to read");
  } finally { view.cleanup(); }
});

test("a queued prompt that cannot go out is marked unsent with the reason (never dropped); retry tries again", async () => {
  FakeSocket.sockets = [];
  globalThis.__taskApi = { async transcript() { return { session: session(), frames: [], saved_at: null, sync_status: "saved" }; } };
  const view = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: session({ program: "claude", native_session_id: null }), enabled: true });
  try {
    await act(async () => { globalThis.__thread.queue("跑测试"); });
    await until(() => globalThis.__thread.pending?.unsent, "unsent");
    assert.equal(globalThis.__thread.pending.unsent, "Claude Code 还没有登录，请在设置里登录。");
    const bubble = globalThis.__thread.messages.at(-1);
    assert.equal(bubble.content, "跑测试");
    assert.equal(bubble.meta.native_unsent, true);
    await act(async () => globalThis.__thread.retry());
    await until(() => globalThis.__thread.pending?.unsent, "still blocked after retry");
    assert.equal(sent().some((frame) => frame.t === "prompt"), false);
  } finally { view.cleanup(); }
  FakeSocket.sockets = [];
  const draft = await mount({ computer: { id: "cc_1", name: "elon", node_online: true }, session: null, program: "codex", enabled: true });
  try {
    await act(async () => { globalThis.__thread.queue("先看日志"); });
    await act(async () => globalThis.__thread.markUnsent("没能打开这段对话，请稍后再试。"));
    assert.deepEqual(globalThis.__thread.pending, { text: "先看日志", unsent: "没能打开这段对话，请稍后再试。" });
    assert.equal(globalThis.__thread.messages.at(-1).content, "先看日志", "the bubble stays");
  } finally { draft.cleanup(); }
});

test("a computer whose state is not known yet does not mark a queued prompt unsent (it is connecting, not offline)", async () => {
  FakeSocket.sockets = [];
  const view = await mount({ computer: null, session: null, program: "codex", enabled: true });
  try {
    await act(async () => { globalThis.__thread.queue("hi"); });
    for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    assert.deepEqual(globalThis.__thread.pending, { text: "hi", unsent: null });
  } finally { view.cleanup(); }
});
