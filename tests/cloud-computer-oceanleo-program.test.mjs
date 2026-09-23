// W6A · Shell 对话框里 OceanLeo agent 程序（合同 I6）的测试。
// 三层：mapTaskMessages / nextOceanleoPoll 纯函数、reduce.ts 登录相位机、
// 控制器（REST turn + 轮询回放、默认程序、setProgram、停止、新对话、离线）。
// 控制器与 MessageList 走 compileModule；网络协作者（lib/agent、agent-api、
// auth、WS url、useUI）全部打桩，桩体转发到 globalThis 上每用例可换的处理器。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { mapTaskMessages, nextOceanleoPoll } from "../src/shell/cloud-computer/agent-dialog/oceanleo-program.ts";
import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";
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
const { MessageList } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/MessageList.tsx", stubs)
);

/** 默认桩：电脑在线、无在跑任务。各用例按需整体换掉。 */
function installDefaultHandlers() {
  globalThis.__oceanApi = {
    calls: [],
    async agentState() {
      this.calls.push("state");
      return { ok: true, data: { task_id: null, computer: { name: "测试电脑", online: true }, task: null } };
    },
    async agentTurn() {
      this.calls.push("turn");
      return { ok: false, status: 500, error: "stub" };
    },
    async agentReset() {
      this.calls.push("reset");
      return { ok: true, data: { ok: true } };
    },
  };
  globalThis.__oceanLib = {
    calls: [],
    async getTask() {
      this.calls.push("get");
      return { ok: false, status: 404, error: "stub" };
    },
    async stopTask(id) {
      this.calls.push(`stop:${id}`);
      return { ok: true, data: { task_id: id, status: "stopped" } };
    },
  };
}

let current = null;
function Harness() {
  current = useAgentDialog({ computerId: "cc_1", sessionId: "sid_1", enabled: true });
  return React.createElement(MessageList, { dialog: current });
}

async function until(fn, label) {
  for (let i = 0; i < 120; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    if (fn()) return;
  }
  throw new Error(label);
}

function openSocket() {
  return [...FakeSocket.sockets].reverse().find((socket) => socket.readyState === 1) ?? null;
}

async function boot() {
  FakeSocket.sockets.length = 0;
  current = null;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Harness));
  });
  await until(
    () => FakeSocket.sockets.some((socket) => socket.sent.some((frame) => frame.t === "status")),
    "status frame",
  );
  return {
    host,
    controller: () => current,
    socket: () => openSocket(),
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// mapTaskMessages：任务消息流 → 对话框消息
// ---------------------------------------------------------------------------

test("mapTaskMessages：用户一条一消息，assistant 收进 turn，步骤折叠、产物成链接行", () => {
  const detail = {
    task: { status: "succeeded" },
    messages: [
      { id: 1, role: "user", kind: "text", content: "把桌面截图发我" },
      { id: 2, role: "assistant", kind: "step", content: "运行 screencap\n第二行细节" },
      { id: 3, role: "assistant", kind: "text", content: "截好了" },
      {
        id: 4,
        role: "assistant",
        kind: "artifact",
        content: "",
        meta: { artifact: { title: "桌面截图", url: "https://files.example/shot.png" } },
      },
      { id: 5, role: "assistant", kind: "ui_action", content: "open_panel" },
      { id: 6, role: "user", kind: "text", content: "谢谢" },
      { id: 7, role: "assistant", kind: "error", content: "上传失败\n重试也不行" },
      {
        id: 8,
        role: "assistant",
        kind: "plan",
        content: "",
        meta: {
          plan: [
            { content: "第一步", priority: "high", status: "completed" },
            { content: "", priority: "high" },
            "junk",
            { content: "第二步", priority: "weird", status: "weird" },
          ],
        },
      },
      { id: 9, role: "assistant", kind: "plan", content: "1. 先这样\n2. 再那样", meta: {} },
      { id: 10, role: "assistant", kind: "text", content: "   " },
    ],
  };
  const out = mapTaskMessages(detail, { step: "步骤", error: "出错" });
  assert.equal(out.length, 4);
  assert.deepEqual(
    out.map((message) => message.kind),
    ["user", "turn", "user", "turn"],
  );
  assert.equal(out[0].text, "把桌面截图发我");
  assert.equal(out[2].text, "谢谢");

  const firstTurn = out[1];
  assert.deepEqual(
    firstTurn.items.map((item) => item.kind),
    ["tool", "assistant", "assistant"],
  );
  const step = firstTurn.items[0];
  assert.equal(step.tool.title, "运行 screencap");
  assert.equal(step.tool.status, "completed");
  assert.equal(step.tool.content[0].type, "content");
  assert.match(step.tool.content[0].text, /第二行细节/);
  assert.equal(firstTurn.items[1].text, "截好了");
  // 产物：标题 + 裸 URL 一行，MessageList 会把 URL 渲染成真链接。
  assert.equal(firstTurn.items[2].text, "桌面截图\nhttps://files.example/shot.png");
  // ui_action 不占行；任务终态只钉最后一个 turn。
  assert.equal(firstTurn.stop, "");

  const lastTurn = out[3];
  assert.equal(lastTurn.stop, "succeeded");
  const errorItem = lastTurn.items[0];
  assert.equal(errorItem.kind, "tool");
  assert.equal(errorItem.tool.status, "failed");
  assert.equal(errorItem.tool.title, "上传失败");
  const plan = lastTurn.items.find((item) => item.kind === "plan");
  assert.deepEqual(
    plan.entries,
    [
      { content: "第一步", priority: "high", status: "completed" },
      { content: "第二步", priority: "medium", status: "pending" },
    ],
  );
  // 没结构的 plan 正文按普通正文走，不猜。
  const markdown = lastTurn.items[lastTurn.items.length - 1];
  assert.equal(markdown.kind, "assistant");
  assert.equal(markdown.text, "1. 先这样\n2. 再那样");
});

test("mapTaskMessages：running 不钉 stop；空内容不占行；labels 兜底标题", () => {
  const running = mapTaskMessages({
    task: { status: "running" },
    messages: [
      { id: 1, role: "user", kind: "text", content: "在吗" },
      { id: 2, role: "assistant", kind: "step", content: "" },
      { id: 3, role: "assistant", kind: "error", content: "" },
    ],
  });
  assert.equal(running.length, 2);
  assert.equal(running[1].kind, "turn");
  assert.equal(running[1].stop, "");
  assert.equal(running[1].items[0].tool.title, "步骤");
  assert.equal(running[1].items[1].tool.title, "出错");
  assert.equal(running[1].items[0].tool.content.length, 0);

  assert.deepEqual(mapTaskMessages({ task: null, messages: [] }), []);
  // 空 user 消息不占行，也不切断正在收的 turn。
  const sparse = mapTaskMessages({
    task: { status: "running" },
    messages: [
      { id: 1, role: "assistant", kind: "text", content: "甲" },
      { id: 2, role: "user", kind: "text", content: "  " },
      { id: 3, role: "assistant", kind: "text", content: "乙" },
    ],
  });
  assert.equal(sparse.length, 1);
  assert.deepEqual(sparse[0].items.map((item) => item.text), ["甲", "乙"]);
});

// ---------------------------------------------------------------------------
// nextOceanleoPoll：与 AgentChat.nextPollCadence 同一张时刻表
//（POLL_ACTIVE 200 / 首字窗口 2000ms 内 225 / 梯子 300·500·800·1200 / 后台 1000）
// ---------------------------------------------------------------------------

test("nextOceanleoPoll：钉死镜像时刻表", () => {
  // 后台：只留回看的定时器，idleStep/waitedMs 原样带回。
  assert.deepEqual(nextOceanleoPoll({ hidden: true, changed: true, idleStep: 2, waitedMs: 500 }), {
    delayMs: 1000,
    idleStep: 2,
    waitedMs: 500,
  });
  // 拿到新内容：跟紧，档位与累计清零。
  assert.deepEqual(nextOceanleoPoll({ hidden: false, changed: true, idleStep: 3, waitedMs: 9999 }), {
    delayMs: 200,
    idleStep: -1,
    waitedMs: 0,
  });
  // 首字窗口内：225 紧凑档，不退避、不推档。
  assert.deepEqual(nextOceanleoPoll({ hidden: false, changed: false, idleStep: -1, waitedMs: 0 }), {
    delayMs: 225,
    idleStep: -1,
    waitedMs: 225,
  });
  assert.deepEqual(nextOceanleoPoll({ hidden: false, changed: false, idleStep: -1, waitedMs: 1900 }), {
    delayMs: 225,
    idleStep: -1,
    waitedMs: 2125,
  });
  // 窗口之后上梯子：300 → 500 → 800 → 1200，到顶不再爬。
  let cursor = { idleStep: -1, waitedMs: 2000 };
  const ladder = [];
  for (let i = 0; i < 5; i += 1) {
    const next = nextOceanleoPoll({ hidden: false, changed: false, ...cursor });
    ladder.push(next.delayMs);
    cursor = { idleStep: next.idleStep, waitedMs: next.waitedMs };
  }
  assert.deepEqual(ladder, [300, 500, 800, 1200, 1200]);
  assert.equal(cursor.waitedMs, 2000 + 300 + 500 + 800 + 1200 + 1200);
});

// ---------------------------------------------------------------------------
// reduce.ts：默认程序 + 登录相位机（合同 I3）+ 未知帧忽略
// ---------------------------------------------------------------------------

test("reducer：默认程序是 oceanleo，登录卡空态字段齐全", () => {
  const state = initialDialogState();
  assert.equal(state.program, "oceanleo");
  assert.equal(state.busy, false);
  assert.deepEqual(state.messages, []);
  assert.deepEqual(state.login, {
    open: false,
    program: null,
    phase: "idle",
    url: "",
    code: "",
    needsCode: false,
    codeDraft: "",
    hint: "",
    failed: "",
    pending: false,
  });
});

test("reducer：登录相位 opening → waiting → done，贴码草稿受控", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "open-login", program: "claude" });
  assert.equal(state.login.open, true);
  assert.equal(state.login.program, "claude");
  assert.equal(state.login.phase, "opening");
  assert.equal(state.login.pending, true);

  // hint 可能先于 url 到：也算进入 waiting。
  state = applyDialog(state, { type: "frame", frame: { t: "login_hint", program: "claude", text: "去浏览器完成授权" } });
  assert.equal(state.login.phase, "waiting");
  assert.equal(state.login.hint, "去浏览器完成授权");
  assert.equal(state.login.pending, false);

  state = applyDialog(state, {
    type: "frame",
    frame: { t: "login_url", program: "claude", url: "https://example.com/device", code: "ABCD", needs_code: true },
  });
  assert.equal(state.login.phase, "waiting");
  assert.equal(state.login.url, "https://example.com/device");
  assert.equal(state.login.code, "ABCD");
  assert.equal(state.login.needsCode, true);
  assert.equal(state.login.failed, "");

  state = applyDialog(state, { type: "login-code-draft", code: " 123456 " });
  assert.equal(state.login.codeDraft, " 123456 ");

  state = applyDialog(state, { type: "frame", frame: { t: "login_done", program: "claude" } });
  assert.equal(state.login.phase, "done");
  assert.equal(state.login.open, true);
  assert.equal(state.login.pending, false);

  state = applyDialog(state, { type: "close-login" });
  assert.equal(state.login.open, false);
  assert.equal(state.login.phase, "idle");
});

test("reducer：login_failed 带 code；agent_busy 兜底收尾开着的登录卡", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "open-login", program: "codex" });
  state = applyDialog(state, { type: "frame", frame: { t: "login_failed", program: "codex", code: "timeout" } });
  assert.equal(state.login.phase, "failed");
  assert.equal(state.login.failed, "timeout");
  assert.equal(state.login.open, true);
  assert.equal(state.login.pending, false);

  // W2 起发 login_failed busy；旧节点可能还发 error agent_busy——登录卡开着时按 busy 收尾。
  // 登录卡不挑当前程序：默认选中是 oceanleo，用户看着 oceanleo 点 codex 的登录也收。
  state = applyDialog(state, { type: "open-login", program: "codex" });
  assert.equal(state.login.phase, "opening");
  state = applyDialog(state, { type: "frame", frame: { t: "error", program: "codex", code: "agent_busy" } });
  assert.equal(state.login.phase, "failed");
  assert.equal(state.login.failed, "busy");
  // 但 agentBusy 是「当前程序」的输入禁用语义：codex 忙不该禁用 oceanleo 的输入。
  assert.equal(state.agentBusy, false);

  // 不带 program 的 agent_busy（旧节点广播）既收尾登录卡，也置当前 agentBusy。
  state = applyDialog(state, { type: "open-login", program: "codex" });
  state = applyDialog(state, { type: "frame", frame: { t: "error", code: "agent_busy" } });
  assert.equal(state.login.phase, "failed");
  assert.equal(state.login.failed, "busy");
  assert.equal(state.agentBusy, true);

  // 登录卡没开时 agent_busy 不碰登录状态。
  state = initialDialogState();
  state = applyDialog(state, { type: "frame", frame: { t: "error", code: "agent_busy" } });
  assert.equal(state.login.phase, "idle");
  assert.equal(state.login.open, false);
  assert.equal(state.agentBusy, true);
});

test("reducer：未知帧忽略（不报 dialog_unreachable），busy 时不许切程序", () => {
  let state = initialDialogState();
  const before = state;
  // 无 program 的未知帧会走完所有分支落到「忽略」；带别的 program 的在 forCurrent 就返回。
  state = applyDialog(state, { type: "frame", frame: { t: "brand_new_frame", payload: 1 } });
  assert.equal(state, before);
  state = applyDialog(state, { type: "frame", frame: { t: "brand_new_frame", program: "cursor" } });
  assert.equal(state, before);
  state = applyDialog(state, { type: "frame", frame: { t: "" } });
  assert.equal(state, before);

  state = applyDialog(state, { type: "send-began" });
  assert.equal(state.busy, true);
  state = applyDialog(state, { type: "program", program: "cursor" });
  assert.equal(state.program, "oceanleo");
  state = applyDialog(state, { type: "cancel-local" });
  state = applyDialog(state, { type: "program", program: "cursor" });
  assert.equal(state.program, "cursor");
});

// ---------------------------------------------------------------------------
// 控制器：oceanleo 走 REST turn + 轮询，不碰 WS 的 prompt 通道
// ---------------------------------------------------------------------------

test("控制器：默认选中 oceanleo，进入即 agentState 回放当前任务", async () => {
  installDefaultHandlers();
  globalThis.__oceanApi.agentState = async function agentState() {
    this.calls.push("state");
    return {
      ok: true,
      data: {
        task_id: "task_9",
        computer: { name: "客厅电脑", online: true },
        task: { id: "task_9", title: "", status: "succeeded" },
      },
    };
  };
  globalThis.__oceanLib.getTask = async function getTask(id) {
    this.calls.push(`get:${id}`);
    return {
      ok: true,
      data: {
        task: { id: "task_9", title: "", status: "succeeded" },
        messages: [
          { id: 1, role: "user", kind: "text", content: "上次说到哪" },
          { id: 2, role: "assistant", kind: "text", content: "说到回放这里" },
        ],
      },
    };
  };
  const view = await boot();
  try {
    await until(() => globalThis.__oceanApi.calls.includes("state"), "agentState on open");
    await until(() => (view.host.textContent || "").includes("说到回放这里"), "replayed messages");
    assert.equal(view.controller().program, "oceanleo");
    assert.equal(view.controller().computerName, "客厅电脑");
    assert.equal(view.controller().busy, false);
    assert.ok(globalThis.__oceanLib.calls.includes("get:task_9"));
    // oceanleo 不是 WS 程序：不许为它要模型帧。
    assert.equal(view.socket().sent.some((frame) => frame.t === "models" && frame.program === "oceanleo"), false);
    assert.equal(view.socket().sent.some((frame) => frame.t === "prompt"), false);
  } finally {
    view.cleanup();
  }
});

test("控制器：发送走 agentTurn，轮询到终态，busy 跟着 running 走", async () => {
  installDefaultHandlers();
  let status = "running";
  globalThis.__oceanApi.agentTurn = async function agentTurn(id, body) {
    this.calls.push("turn");
    assert.equal(id, "cc_1");
    return { ok: true, data: { task_id: "task_1", message_id: 11 } };
  };
  globalThis.__oceanLib.getTask = async function getTask(id) {
    this.calls.push(`get:${id}`);
    return {
      ok: true,
      data: {
        task: { id, title: "", status },
        messages: [
          { id: 1, role: "user", kind: "text", content: "你好" },
          ...(status === "running"
            ? []
            : [{ id: 2, role: "assistant", kind: "text", content: "你好，我是 OceanLeo" }]),
        ],
      },
    };
  };
  const view = await boot();
  try {
    await until(() => globalThis.__oceanApi.calls.includes("state"), "agentState on open");
    await act(async () => {
      view.controller().setDraft("你好");
    });
    await act(async () => {
      await view.controller().send();
    });
    assert.deepEqual(
      globalThis.__oceanApi.calls.filter((name) => name === "turn").length,
      1,
    );
    // 本地回显立刻上屏，任务还在跑 → busy。
    assert.match(view.host.textContent || "", /你好/);
    assert.equal(view.controller().busy, true);

    status = "succeeded";
    await until(() => !view.controller().busy, "busy clears at terminal status");
    await until(() => (view.host.textContent || "").includes("你好，我是 OceanLeo"), "assistant text");
    assert.equal(view.socket().sent.some((frame) => frame.t === "prompt"), false);
  } finally {
    view.cleanup();
  }
});

test("控制器：停止真的停（stopTask + 终态回放），新对话先 reset 再 turn", async () => {
  installDefaultHandlers();
  let status = "running";
  let lastText = "干活";
  globalThis.__oceanApi.agentTurn = async function agentTurn(id, body) {
    this.calls.push("turn");
    lastText = body.text;
    return { ok: true, data: { task_id: "task_2", message_id: 21 } };
  };
  globalThis.__oceanLib.getTask = async function getTask(id) {
    this.calls.push(`get:${id}`);
    return {
      ok: true,
      data: {
        task: { id, title: "", status },
        messages: [
          { id: 1, role: "user", kind: "text", content: lastText },
          ...(status === "stopped"
            ? [{ id: 2, role: "assistant", kind: "text", content: "干了一半被叫停" }]
            : []),
        ],
      },
    };
  };
  globalThis.__oceanLib.stopTask = async function stopTask(id) {
    this.calls.push(`stop:${id}`);
    status = "stopped";
    return { ok: true, data: { task_id: id, status: "stopped" } };
  };
  const view = await boot();
  try {
    await until(() => globalThis.__oceanApi.calls.includes("state"), "agentState on open");
    await act(async () => {
      view.controller().setDraft("干活");
    });
    await act(async () => {
      await view.controller().send();
    });
    assert.equal(view.controller().busy, true);
    await act(async () => {
      view.controller().abort();
    });
    assert.equal(view.controller().busy, false);
    await until(() => globalThis.__oceanLib.calls.includes("stop:task_2"), "stopTask called");
    // 停掉之后拉一次终态：列表留下任务真实结局，不停在「还在跑」。
    await until(() => view.controller().messages.some((message) => message.kind === "turn" && message.stop === "stopped"), "terminal replay");

    // 「新对话」：下一句先 agentReset 再 agentTurn。
    const order = globalThis.__oceanApi.calls;
    await act(async () => {
      view.controller().setFresh(true);
      view.controller().setDraft("另起一段");
    });
    await act(async () => {
      await view.controller().send();
    });
    const resetAt = order.indexOf("reset");
    const turns = order.map((name, index) => (name === "turn" ? index : -1)).filter((index) => index >= 0);
    assert.ok(resetAt >= 0, "agentReset called");
    assert.ok(turns.length >= 2, "second turn sent");
    assert.ok(resetAt < turns[turns.length - 1], "reset before the fresh turn");
  } finally {
    view.cleanup();
  }
});

test("控制器：电脑不在线——一行实话、输入禁用语义、发送空转", async () => {
  installDefaultHandlers();
  globalThis.__oceanApi.agentState = async function agentState() {
    this.calls.push("state");
    return { ok: true, data: { task_id: null, computer: { name: "卧室电脑", online: false }, task: null } };
  };
  const view = await boot();
  try {
    await until(() => view.controller().offline === true, "offline flag");
    assert.match(view.host.textContent || "", /这台电脑不在线/);
    assert.ok(view.host.querySelector('[data-oceanleo-cc-notice="computer_offline"]'));
    assert.equal(view.controller().computerName, "卧室电脑");
    await act(async () => {
      view.controller().setDraft("在吗");
      await view.controller().send();
    });
    assert.equal(globalThis.__oceanApi.calls.includes("turn"), false);
  } finally {
    view.cleanup();
  }
});

test("控制器：setProgram 放行 oceanleo、拦未知程序、消息按程序分开", async () => {
  installDefaultHandlers();
  const view = await boot();
  try {
    await until(() => globalThis.__oceanApi.calls.includes("state"), "agentState on open");
    assert.equal(view.controller().program, "oceanleo");

    await act(async () => {
      view.controller().setProgram("not-a-program");
    });
    assert.equal(view.controller().program, "oceanleo");

    await act(async () => {
      view.controller().setProgram("cursor");
    });
    assert.equal(view.controller().program, "cursor");
    await until(
      () => view.socket().sent.some((frame) => frame.t === "models" && frame.program === "cursor"),
      "models for cursor",
    );

    const stateCalls = globalThis.__oceanApi.calls.filter((name) => name === "state").length;
    await act(async () => {
      view.controller().setProgram("oceanleo");
    });
    assert.equal(view.controller().program, "oceanleo");
    await until(
      () => globalThis.__oceanApi.calls.filter((name) => name === "state").length > stateCalls,
      "agentState re-fetched on re-entry",
    );
  } finally {
    view.cleanup();
  }
});

test("控制器：超过后端 8000 字上限明说 invalid_argument，不静默截断", async () => {
  installDefaultHandlers();
  const view = await boot();
  try {
    await until(() => globalThis.__oceanApi.calls.includes("state"), "agentState on open");
    await act(async () => {
      view.controller().setDraft("字".repeat(8001));
    });
    await act(async () => {
      await view.controller().send();
    });
    assert.equal(globalThis.__oceanApi.calls.includes("turn"), false);
    assert.ok(
      view.controller().messages.some((message) => message.kind === "notice" && message.code === "invalid_argument"),
    );
    assert.equal(view.controller().busy, false);
    // 原文留在输入框里，用户自己决定删改。
    assert.equal(view.controller().draft.length, 8001);
  } finally {
    view.cleanup();
  }
});

test("控制器：oceanleo 选中时 retryConnect 也重发 status（仲裁 A-5 X1）", async () => {
  installDefaultHandlers();
  const view = await boot();
  try {
    await until(() => globalThis.__oceanApi.calls.includes("state"), "agentState on open");
    assert.equal(view.controller().program, "oceanleo");
    const statusBefore = view.socket().sent.filter((frame) => frame.t === "status").length;
    const stateBefore = globalThis.__oceanApi.calls.filter((name) => name === "state").length;
    await act(async () => {
      view.controller().retryConnect();
    });
    // Key 保存后程序行靠这次 status 刷新（key 的 POST 是纯 REST，后端不推帧）。
    assert.equal(view.socket().sent.filter((frame) => frame.t === "status").length, statusBefore + 1);
    await until(
      () => globalThis.__oceanApi.calls.filter((name) => name === "state").length > stateBefore,
      "agentState re-fetched on retry",
    );
  } finally {
    view.cleanup();
  }
});

test("控制器：agentTurn 网络失败（status 0）报 dialog_unreachable，不留 busy", async () => {
  installDefaultHandlers();
  globalThis.__oceanApi.agentTurn = async function agentTurn() {
    this.calls.push("turn");
    return { ok: false, status: 0, error: "network" };
  };
  const view = await boot();
  try {
    await until(() => globalThis.__oceanApi.calls.includes("state"), "agentState on open");
    await act(async () => {
      view.controller().setDraft("你好");
    });
    await act(async () => {
      await view.controller().send();
    });
    await until(
      () => view.controller().messages.some((message) => message.kind === "notice" && message.code === "dialog_unreachable"),
      "unreachable notice",
    );
    assert.equal(view.controller().busy, false);
  } finally {
    view.cleanup();
  }
});
