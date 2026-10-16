import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { setTimeout as realTimeout } from "node:timers";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvas = fabricRequire.resolve("canvas");
const cachedCanvas = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (cachedCanvas) require.cache[canvas] = cachedCanvas;
else delete require.cache[canvas];
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true, url: "https://example.test" });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) {
  Object.defineProperty(globalThis, key, { configurable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class Socket {
  static OPEN = 1;
  static CLOSED = 3;
  static sockets = [];
  readyState = 0;
  sent = [];
  listeners = new Map();
  constructor() {
    Socket.sockets.push(this);
    queueMicrotask(() => { this.readyState = 1; this.emit("open", {}); });
  }
  addEventListener(type, fn) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(fn);
    this.listeners.set(type, handlers);
  }
  emit(type, event) { for (const fn of this.listeners.get(type) ?? []) fn(event); }
  send(raw) {
    const frame = JSON.parse(raw);
    this.sent.push(frame);
    if (frame.t === "occupancy") {
      queueMicrotask(() => {
        if (this.readyState === 1) this.frame({ t: "occupancy", program: frame.program, busy: [] });
      });
    }
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", {});
  }
  frame(frame) { this.emit("message", { data: JSON.stringify(frame) }); }
  lists() { return this.sent.filter((frame) => frame.t === "sessions"); }
}
globalThis.WebSocket = Socket;
const { useAgentDialog } = await import(await compileModule(
  "src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx", {
    "../../../i18n/ui/useUI": dataModule("export function useUI() { return (text) => text; }"),
    "../../../lib/cloud-computer-api": dataModule("export function agentDialogWsUrl() { return 'ws://example.test'; }"),
    "../../../lib/auth/client": dataModule("export async function accessToken() { return 'test'; }"),
    "../../../lib/agent": dataModule("export async function getTask() { return {ok:false}; } export async function stopTask() { return {ok:false}; }"),
    "../../../lib/cloud-computer-agent-api": dataModule("export async function agentState() { return {ok:false}; } export async function agentTurn() { return {ok:false}; } export async function agentReset() { return {ok:false}; }"),
  },
));

test("controller keeps scoped history fresh across visibility, activity, focus, and reconnect", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  let hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  let dialog;
  let props = { computerId: "refresh_controller", sessionId: "scoped", enabled: true, initialProgram: "cursor" };
  function Harness() { dialog = useAgentDialog(props); return null; }
  const host = document.createElement("div");
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); });
  const render = async (patch = {}) => {
    props = { ...props, ...patch };
    await act(async () => { root.render(React.createElement(Harness)); });
    for (let i = 0; i < 5; i += 1) await act(async () => { await setImmediate(); });
  };
  const tick = async (ms) => {
    await act(async () => { t.mock.timers.tick(ms); });
    for (let i = 0; i < 5; i += 1) await act(async () => { await setImmediate(); });
  };
  const frame = async (socket, value) => { await act(async () => socket.frame(value)); };
  const lists = (socket, sessions = []) => frame(socket, { t: "sessions", program: "cursor", supported: true, sessions });
  const until = async (predicate) => {
    for (let i = 0; i < 100 && !predicate(); i += 1) {
      await act(async () => { await new Promise((resolve) => realTimeout(resolve, 1)); });
    }
    assert.equal(Boolean(predicate()), true, "dynamic authentication import and socket open settle");
  };
  await render();
  await until(() => Socket.sockets.at(-1)?.lists().length === 1);
  let socket = Socket.sockets.at(-1);
  assert.equal(socket.lists().length, 1, "scoped dialogs load history on connection");
  await act(async () => {
    window.dispatchEvent(new dom.window.Event("focus"));
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
  });
  assert.equal(socket.lists().length, 1, "focus burst does not overlap initial request");
  await lists(socket, [{ id: "old", title: "Old", updated_at: "2026-10-15T00:00:00Z" }]);
  assert.equal(dialog.sessions.length, 1);
  await tick(15000);
  assert.equal(socket.lists().length, 2);
  await lists(socket);

  hidden = true;
  await act(async () => document.dispatchEvent(new dom.window.Event("visibilitychange")));
  await tick(120000);
  await frame(socket, { t: "turn_start", program: "cursor", acp_session: "external" });
  assert.equal(socket.lists().length, 2, "hidden activity does not fetch lists");
  hidden = false;
  await act(async () => document.dispatchEvent(new dom.window.Event("visibilitychange")));
  assert.equal(socket.lists().length, 3, "returning to tab refreshes immediately");
  await lists(socket);

  await render({ active: false });
  await tick(120000);
  await frame(socket, { t: "done", program: "cursor", acp_session: "external" });
  assert.equal(socket.lists().length, 3, "inactive dialogs suppress event and timer requests");
  await render({ active: true });
  assert.equal(socket.lists().length, 4, "reactivation refreshes even when socket stayed open");
  await lists(socket);
  await tick(1000);
  await frame(socket, { t: "turn_start", program: "cursor", acp_session: "external" });
  await frame(socket, { t: "done", program: "cursor", acp_session: "external" });
  assert.equal(socket.lists().length, 5);
  await lists(socket);
  await tick(1000);
  assert.equal(socket.lists().length, 6, "completion while request was pending gets one trailing refresh");

  await act(async () => socket.close());
  await tick(1000);
  await until(() => Socket.sockets.length === 2 && Socket.sockets.at(-1).lists().length === 1);
  socket = Socket.sockets.at(-1);
  assert.equal(Socket.sockets.length, 2);
  assert.equal(socket.lists().length, 1, "reconnect bypasses the old in-flight request");
  await act(async () => dialog.setProgram("oceanleo"));
  await tick(60000);
  assert.equal(socket.lists().length, 1, "REST OceanLeo does not poll socket history");
  await render({ localOceanleo: true });
  assert.deepEqual(socket.lists().map((frame) => frame.program), ["cursor", "oceanleo"], "local installation loads OceanLeo history once");
  await act(async () => dialog.setProgram("codex"));
  assert.deepEqual(socket.lists().map((frame) => frame.program), ["cursor", "oceanleo", "codex"], "scoped program switches immediately load the correct history");
  await render({ enabled: false });
  await tick(120000);
  assert.equal(socket.lists().length, 3);
});
