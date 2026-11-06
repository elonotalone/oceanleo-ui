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
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLSelectElement: window.HTMLSelectElement,
  HTMLInputElement: window.HTMLInputElement,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const proto of [window.HTMLElement.prototype, window.Element.prototype]) {
  proto.attachEvent = function attachEvent() {};
  proto.detachEvent = function detachEvent() {};
}

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
    const wrapped = (event) => {
      if (once) this.removeEventListener(type, wrapped);
      fn(event);
    };
    wrapped.original = fn;
    const list = this.listeners.get(type) ?? [];
    list.push(wrapped);
    this.listeners.set(type, list);
  }
  removeEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((item) => item !== fn && item.original !== fn),
    );
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", {});
  }
  emit(type, event) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
  server(frame) {
    this.emit("message", { data: JSON.stringify(frame) });
  }
}
FakeSocket.CONNECTING = 0;
FakeSocket.OPEN = 1;
FakeSocket.CLOSING = 2;
FakeSocket.CLOSED = 3;
globalThis.WebSocket = FakeSocket;
window.WebSocket = FakeSocket;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function useUI() {
    return (value, vars) => {
      if (!vars) return value;
      return value.replace(/\\{(\\w+)\\}/g, (token, key) => (key in vars ? String(vars[key]) : token));
    };
  }
`);
const apiStub = dataModule(`
  export function agentDialogWsUrl(id, sessionId, token) {
    return "ws://example.test/v1/computers/" + id + "/agent-dialog?session_id=" + sessionId + "&token=" + token;
  }
`);
const authStub = dataModule(`
  export async function accessToken() { return "tok"; }
  export function cachedAccessToken() { return "tok"; }
`);
// 两个网络协作者桩：转发到 globalThis 上每用例换的处理器，调用顺序与参数都记下来。
const agentLibStub = dataModule(`
  export function getTask(...args) { return globalThis.__oceanLib.getTask(...args); }
  export function stopTask(...args) { return globalThis.__oceanLib.stopTask(...args); }
`);
const agentApiStub = dataModule(`
  export function agentState(...args) { return globalThis.__oceanApi.agentState(...args); }
  export function agentTurn(...args) { return globalThis.__oceanApi.agentTurn(...args); }
  export function agentReset(...args) { return globalThis.__oceanApi.agentReset(...args); }
`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/cloud-computer-api": apiStub,
  "../../../lib/auth/client": authStub,
  "../../../lib/agent": agentLibStub,
  "../../../lib/cloud-computer-agent-api": agentApiStub,
};

const { useAgentDialog } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx", stubs)
);

let current;
function Harness(props) {
  current = useAgentDialog({ computerId: "lifecycle", enabled: true, ...props });
  return null;
}
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
async function mount(props) {
  FakeSocket.sockets.length = 0;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async patch => { await act(async () => root.render(React.createElement(Harness, { ...props, ...patch }))); await flush(); };
  await render({});
  // Opening the socket first awaits a dynamic import that resolves through the loader thread; a loaded runner can need many ticks.
  for (const deadline = Date.now() + 2000; !FakeSocket.sockets.length && Date.now() < deadline;) await flush();
  await flush();
  return { render, cleanup() { act(() => root.unmount()); host.remove(); } };
}

test("I9 logout 带供应商且随后刷新 status；无供应商时省略字段", async () => {
  const view = await mount({ initialProgram: "hermes" });
  try {
    const socket = FakeSocket.sockets[0];
    await act(async () => current.logoutProgram("hermes", "nous"));
    assert.deepEqual(socket.sent.slice(-2), [{ t: "logout", program: "hermes", provider: "nous" }, { t: "status" }]);
    await act(async () => current.logoutProgram("cursor"));
    assert.deepEqual(socket.sent.slice(-2), [{ t: "logout", program: "cursor" }, { t: "status" }]);
    assert.equal(FakeSocket.sockets.length, 1);
  } finally { view.cleanup(); }
});

test("失活暂停 OceanLeo 轮询；恢复复用 WS 并补取任务真相", async () => {
  let reads = 0;
  globalThis.__oceanApi = { async agentState() { return { ok: true, data: { task_id: "task", computer: { online: true } } }; } };
  globalThis.__oceanLib = { async getTask() { reads++; return { ok: true, data: { task: { status: "running" }, messages: [] } }; } };
  const view = await mount({ initialProgram: "oceanleo" });
  try {
    assert.ok(reads > 0);
    await view.render({ active: false });
    const paused = reads;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1200)); });
    assert.equal(reads, paused);
    assert.equal(FakeSocket.sockets[0].readyState, 1);
    await view.render({ active: true });
    assert.ok(reads > paused);
    assert.equal(FakeSocket.sockets.length, 1);
  } finally { view.cleanup(); }
});

test("后台断线不重试，恢复后同机缓存保持可见并重新连线", async () => {
  const view = await mount({ initialProgram: "cursor" });
  try {
    const socket = FakeSocket.sockets[0];
    await act(async () => {
      socket.server({ t: "status", programs: [{ id: "cursor", installed: true, logged_in: true }] });
      socket.server({ t: "sessions", program: "cursor", supported: true, sessions: [{ id: "kept", title: "Kept" }] });
    });
    await view.render({ active: false });
    await act(async () => socket.close());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
    assert.equal(FakeSocket.sockets.length, 1);
    assert.equal(current.sessions[0].id, "kept");
    await view.render({ active: true });
    assert.equal(FakeSocket.sockets.length, 2);
    assert.equal(current.sessions[0].id, "kept");
    assert.equal(current.programs[0].installed, true);
  } finally { view.cleanup(); }
});
