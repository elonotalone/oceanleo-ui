import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// AI 对话卡（合同 I6 / I8 / I9；W8 任务书「测试」一节逐条对应）。

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

function freshApi() {
  return {
    calls: [],
    wsUrls: [],
    settings: { confirm_dangerous: true, oceanleo_tools: true, billing_paused: false },
    oceanleo: { installed: false, version: null, token_active: false },
  };
}
globalThis.__acpApi = freshApi();
globalThis.__acpRouter = { replaced: [], replace(href) { this.replaced.push(href); }, push() {} };

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => {
      if (!vars) return value;
      return value.replace(/\\{(\\w+)\\}/g, (token, key) => (key in vars ? String(vars[key]) : token));
    };
  }
`);
const apiStub = dataModule(`
  const api = () => globalThis.__acpApi;
  export function agentDialogWsUrl(id, sessionId, token) {
    api().wsUrls.push({ id, sessionId });
    const query = sessionId ? "session_id=" + sessionId + "&token=" + token : "token=" + token;
    return "ws://example.test/v1/computers/" + id + "/agent-dialog?" + query;
  }
  export async function getAgentSettings(id) {
    api().calls.push(["getAgentSettings", id]);
    return { ...api().settings };
  }
  export async function patchAgentSettings(id, patch) {
    api().calls.push(["patchAgentSettings", id, patch]);
    api().settings = { ...api().settings, ...patch };
    return { ...api().settings };
  }
  export async function getOceanleoAgent(id) {
    api().calls.push(["getOceanleoAgent", id]);
    return { ...api().oceanleo };
  }
  export async function installOceanleoAgent(id) {
    api().calls.push(["installOceanleoAgent", id]);
    api().oceanleo = { installed: true, version: "0.3.1", token_active: true };
    return { ok: true, version: "0.3.1" };
  }
  export async function uninstallOceanleoAgent(id) {
    api().calls.push(["uninstallOceanleoAgent", id]);
    api().oceanleo = { installed: false, version: null, token_active: false };
    return { ok: true };
  }
`);
const navigationStub = dataModule(`
  export function useRouter() { return globalThis.__acpRouter; }
`);
const authStub = dataModule(`
  export async function accessToken() { return "tok"; }
  export function cachedAccessToken() { return "tok"; }
`);
const agentStub = dataModule(`
  export async function getTask() { return { ok: false, data: null }; }
  export async function stopTask() { return { ok: false }; }
`);
const computerAgentStub = dataModule(`
  export async function agentState(id) {
    globalThis.__acpApi.calls.push(["agentState", id]);
    return { ok: true, status: 200, data: { computer: { name: "Box", online: true }, task_id: "" } };
  }
  export async function agentTurn(id) {
    globalThis.__acpApi.calls.push(["agentTurn", id]);
    return { ok: false, status: 0 };
  }
  export async function agentReset(id) {
    globalThis.__acpApi.calls.push(["agentReset", id]);
    return { ok: true };
  }
`);
const leoEntryStub = dataModule(`
  export function LeoEntryButton() { return null; }
`);
const confirmStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title, confirmLabel, onConfirm, onCancel }) {
    return React.createElement("div", { "data-test-confirm": title },
      React.createElement("button", { type: "button", onClick: onConfirm, "data-test-confirm-ok": "" }, confirmLabel),
      React.createElement("button", { type: "button", onClick: onCancel, "data-test-confirm-cancel": "" }, "取消"));
  }
`);

const { AcpCard } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/AcpCard.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../../../lib/cloud-computer-api": apiStub,
    "../../../lib/auth/client": authStub,
    "../../../lib/agent": agentStub,
    "../../../lib/cloud-computer-agent-api": computerAgentStub,
    "../../LeoEntryButton": leoEntryStub,
    "../../../ui": confirmStub,
    "next/navigation": navigationStub,
  })
);

const COMPUTER = { id: "cc_1", name: "Box" };

const STATUS = {
  t: "status",
  program: "",
  programs: [
    { id: "cursor", installed: true, path: "/c", version: "2025.09", logged_in: true, dir_capability: "full", running: false },
    { id: "claude", installed: true, path: "/cl", version: "1.0", logged_in: false, dir_capability: "none", running: false },
    { id: "codex", installed: false, path: "", version: "", logged_in: null, dir_capability: "full", running: false },
    { id: "hermes", installed: true, path: "/h", version: "0.4", logged_in: true, dir_capability: "link_only", running: false },
  ],
};

async function until(fn, label) {
  for (let i = 0; i < 60; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (fn()) return;
  }
  throw new Error(label);
}

function openSocket() {
  return [...FakeSocket.sockets].reverse().find((socket) => socket.readyState === 1) ?? null;
}

function sentFrames() {
  return FakeSocket.sockets.flatMap((socket) => socket.sent);
}

async function click(element) {
  assert.ok(element, "要点的元素不存在");
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function setValue(element, value) {
  assert.ok(element, "要填的控件不存在");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    assert.ok(setter);
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function pressEnter(element) {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });
}

async function server(frame) {
  await act(async () => {
    openSocket().server(frame);
  });
}

function calls(name) {
  return globalThis.__acpApi.calls.filter((call) => call[0] === name);
}

async function boot(props = {}, api = {}) {
  FakeSocket.sockets.length = 0;
  globalThis.__acpApi = { ...freshApi(), ...api };
  globalThis.__acpRouter.replaced = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(AcpCard, { computer: COMPUTER, ...props }));
  });
  await until(() => sentFrames().some((frame) => frame.t === "status"), "status frame");
  await server(STATUS);
  return {
    host,
    $: (selector) => host.querySelector(selector),
    $$: (selector) => [...host.querySelectorAll(selector)],
    text: () => host.textContent || "",
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("选择页四态：已安装（版本）/ 未安装（安装）/ 未登录（登录 · Key）/ OceanLeo 云端；对话 WS 不带 session_id", async () => {
  const view = await boot();
  try {
    assert.ok(view.$("[data-oceanleo-acp-picker]"));
    assert.deepEqual(
      view.$$("[data-oceanleo-acp-agent]").map((node) => node.getAttribute("data-oceanleo-acp-agent")),
      ["oceanleo", "cursor", "claude", "codex", "hermes"],
    );
    assert.ok(globalThis.__acpApi.wsUrls.length > 0);
    for (const url of globalThis.__acpApi.wsUrls) assert.equal(url.sessionId, undefined);
    assert.ok(FakeSocket.sockets.every((socket) => !socket.url.includes("session_id")));

    const ready = view.$('[data-oceanleo-acp-agent="cursor"] [data-oceanleo-acp-agent-state="ready"]');
    assert.equal(ready.textContent, "已安装 · 2025.09");
    assert.equal(view.$('[data-oceanleo-acp-agent-open="cursor"]').disabled, false);

    assert.ok(view.$('[data-oceanleo-acp-agent="codex"] [data-oceanleo-acp-agent-state="missing"]'));
    assert.ok(view.$('[data-oceanleo-acp-picker-install="codex"]'));
    assert.equal(view.$('[data-oceanleo-acp-agent-open="codex"]').disabled, true);

    const signedOut = view.$('[data-oceanleo-acp-agent="claude"]');
    assert.equal(signedOut.querySelector("[data-oceanleo-acp-agent-state]").getAttribute("data-oceanleo-acp-agent-state"), "signed-out");
    assert.match(signedOut.textContent, /未登录/);
    assert.doesNotMatch(signedOut.textContent, /已登录|Signed in/);
    assert.ok(view.$('[data-oceanleo-acp-picker-login="claude"]'));
    assert.ok(view.$('[data-oceanleo-acp-picker-key="claude"]'));

    assert.ok(view.$('[data-oceanleo-acp-agent="oceanleo"] [data-oceanleo-acp-agent-state="cloud"]'));
    assert.match(view.$("[data-oceanleo-acp-oceanleo-banner]").textContent, /在这台服务器上安装 OceanLeo agent：本地运行、按用量从余额扣费/);

    await click(view.$('[data-oceanleo-acp-picker-login="claude"]'));
    await until(() => sentFrames().some((frame) => frame.t === "login" && frame.program === "claude"), "login frame");
    assert.ok(view.$("[data-oceanleo-cc-login-card]"));
    await click(view.$("[data-oceanleo-cc-login-cancel]"));

    await click(view.$('[data-oceanleo-acp-picker-install="codex"]'));
    assert.ok(view.$("[data-oceanleo-cc-install-sheet]"));
    await click(view.$("[data-oceanleo-cc-install-close]"));

    await click(view.$('[data-oceanleo-acp-picker-key="claude"]'));
    assert.match(view.text(), /Key/);
  } finally {
    view.cleanup();
  }
});

test("OceanLeo 未装：横幅安装按钮调 installOceanleoAgent，装完刷新成「已安装」", async () => {
  const view = await boot();
  try {
    await until(() => !view.$("[data-oceanleo-acp-oceanleo-install]").disabled, "install enabled");
    await click(view.$("[data-oceanleo-acp-oceanleo-install]"));
    await until(() => calls("installOceanleoAgent").length === 1, "install call");
    await until(() => view.$('[data-oceanleo-acp-agent="oceanleo"] [data-oceanleo-acp-agent-state="installed"]'), "installed state");
    assert.equal(
      view.$('[data-oceanleo-acp-agent="oceanleo"] [data-oceanleo-acp-agent-state="installed"]').textContent,
      "已安装 · 0.3.1",
    );
    assert.ok(calls("getOceanleoAgent").length >= 2, "装完重新读一次状态");
    assert.equal(view.$("[data-oceanleo-acp-oceanleo-banner]"), null);
  } finally {
    view.cleanup();
  }
});

test("OceanLeo 未装：进入走云端 REST（agentState），不发 WS 程序帧，会话栏写明不支持", async () => {
  const view = await boot();
  try {
    await until(() => calls("getOceanleoAgent").length > 0, "status read");
    await click(view.$('[data-oceanleo-acp-agent-open="oceanleo"]'));
    await until(() => calls("agentState").length > 0, "agentState");
    assert.ok(view.$("[data-oceanleo-acp-conversation]"));
    assert.equal(sentFrames().some((frame) => frame.program === "oceanleo"), false);
    assert.ok(view.$("[data-oceanleo-acp-sessions-unsupported]"));
    assert.match(view.text(), /这个程序不支持列出过去的对话/);
    assert.match(view.text(), /当前使用云端 OceanLeo agent/);
    assert.ok(globalThis.__acpRouter.replaced.some((href) => href === "/computers/cc_1?card=acp&program=oceanleo"));
  } finally {
    view.cleanup();
  }
});

test("OceanLeo 已装：走 WS 程序 oceanleo（sessions / models / prompt），不碰云端 REST", async () => {
  const view = await boot(
    { initialProgram: "oceanleo" },
    { oceanleo: { installed: true, version: "0.3.1", token_active: true } },
  );
  try {
    await until(() => sentFrames().some((frame) => frame.t === "sessions" && frame.program === "oceanleo"), "oceanleo sessions");
    assert.ok(sentFrames().some((frame) => frame.t === "models" && frame.program === "oceanleo"));
    assert.equal(calls("agentState").length, 0);
    assert.doesNotMatch(view.text(), /当前使用云端 OceanLeo agent/);
    await server({ t: "session_opened", program: "oceanleo", acp_session: "g1", cwd: "/root", replayed: 0 });
    const input = view.$("[data-oceanleo-cc-dialog-input]");
    await setValue(input, "清理缓存");
    await pressEnter(input);
    await until(() => sentFrames().some((frame) => frame.t === "prompt"), "prompt");
    const prompt = sentFrames().find((frame) => frame.t === "prompt");
    assert.equal(prompt.program, "oceanleo");
    assert.equal(prompt.acp_session, "g1");
    assert.equal(calls("agentTurn").length, 0);
  } finally {
    view.cleanup();
  }
});

test("对话视图：agent 条默认收起只显示当前 agent 名，展开可切换并改地址", async () => {
  const view = await boot({ initialProgram: "cursor" });
  try {
    await until(() => sentFrames().some((frame) => frame.t === "sessions" && frame.program === "cursor"), "cursor sessions");
    const bar = view.$("[data-oceanleo-acp-agent-bar]");
    assert.ok(view.$("[data-oceanleo-acp-agents-collapsed]"));
    assert.equal(view.$$("[data-oceanleo-acp-agent-tab]").length, 0);
    assert.match(bar.textContent, /Cursor/);
    assert.doesNotMatch(bar.textContent, /Codex|Claude Code|Hermes|OceanLeo/);

    await click(view.$("[data-oceanleo-acp-agents-expand]"));
    assert.equal(view.$$("[data-oceanleo-acp-agent-tab]").length, 5);
    assert.equal(view.$$("[data-oceanleo-acp-agent-settings]").length, 5);
    await click(view.$('[data-oceanleo-acp-agent-tab="hermes"]'));
    assert.ok(view.$("[data-oceanleo-acp-agents-collapsed]"), "切换后自动收起");
    assert.match(view.$("[data-oceanleo-acp-agent-bar]").textContent, /Hermes/);
    assert.doesNotMatch(view.$("[data-oceanleo-acp-agent-bar]").textContent, /Cursor/);
    assert.ok(globalThis.__acpRouter.replaced.includes("/computers/cc_1?card=acp&program=hermes"));
    await until(() => sentFrames().some((frame) => frame.t === "sessions" && frame.program === "hermes"), "hermes sessions");

    await click(view.$("[data-oceanleo-acp-agents-expand]"));
    await click(view.$("[data-oceanleo-acp-agents-collapse]"));
    assert.ok(view.$("[data-oceanleo-acp-agents-collapsed]"));
  } finally {
    view.cleanup();
  }
});

test("会话栏：列表、回放渲染成历史、回放后接着发的 prompt 带 acp_session；模型菜单、「/」补全、自动允许、无关掉会话、无费用", async () => {
  const view = await boot({ initialProgram: "cursor" });
  try {
    await until(() => sentFrames().some((frame) => frame.t === "sessions" && frame.program === "cursor"), "cursor sessions");
    const updated = new Date(Date.now() - 5 * 60 * 1000 - 1000).toISOString();
    await server({
      t: "sessions",
      program: "cursor",
      supported: true,
      sessions: [
        { id: "s-old", title: "修 nginx", cwd: "/root", updated_at: updated },
        { id: "s-older", title: "装 docker", cwd: "/root", updated_at: "2026-01-01T00:00:00Z" },
      ],
    });
    const row = view.$('[data-oceanleo-acp-session="s-old"]');
    assert.match(row.textContent, /修 nginx/);
    assert.match(row.textContent, /5 分钟前/);
    assert.ok(view.$("[data-oceanleo-acp-new-session]"));

    await click(row);
    await until(() => sentFrames().some((frame) => frame.t === "open_session"), "open_session");
    assert.deepEqual(
      sentFrames().find((frame) => frame.t === "open_session"),
      { t: "open_session", program: "cursor", acp_session: "s-old" },
    );
    assert.ok(globalThis.__acpRouter.replaced.includes("/computers/cc_1?card=acp&program=cursor&session=s-old"));

    const replay = { program: "cursor", acp_session: "s-old", replay: true };
    await server({ t: "user_message", ...replay, text: "看看磁盘" });
    await server({ t: "delta", ...replay, text: "根分区用了 80%。" });
    await server({ t: "user_message", ...replay, text: "清一下日志" });
    await server({ t: "delta", ...replay, text: "已清理旧日志。" });
    await server({ t: "session_opened", program: "cursor", acp_session: "s-old", cwd: "/root", replayed: 4 });
    const history = view.text();
    const order = ["看看磁盘", "根分区用了 80%。", "清一下日志", "已清理旧日志。"].map((text) => history.indexOf(text));
    assert.ok(order.every((index) => index >= 0), "回放四条都渲染");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "回放按原顺序：第二轮回复不能并进第一轮");
    assert.ok(view.$('[data-oceanleo-acp-session="s-old"]').className.includes("bg-zinc-100"));

    await server({
      t: "models",
      program: "cursor",
      acp_session: "s-old",
      source: "none",
      models: [
        { id: "gpt-5", name: "GPT-5", default: true },
        { id: "sonnet", name: "Sonnet", default: false },
      ],
    });
    const model = view.$("[data-oceanleo-cc-model]");
    assert.ok(model, "models 帧里有模型就一定有模型菜单");
    assert.equal(model.value, "gpt-5");
    await setValue(model, "sonnet");
    await until(() => sentFrames().some((frame) => frame.t === "set_config" && frame.id === "model"), "set_config model");
    assert.deepEqual(
      sentFrames().find((frame) => frame.t === "set_config" && frame.id === "model"),
      { t: "set_config", program: "cursor", id: "model", value: "sonnet" },
    );

    const turnsBefore = view.$$("[data-oceanleo-cc-turn]").length;
    await server({
      t: "commands",
      program: "cursor",
      acp_session: "s-old",
      commands: [
        { name: "review", description: "Review the diff (builtin skill)" },
        { name: "init", description: "Write AGENTS.md" },
      ],
    });
    assert.equal(view.$$("[data-oceanleo-cc-turn]").length, turnsBefore);
    assert.doesNotMatch(view.text(), /builtin skill|Commands you can use/);
    assert.equal(view.$("[data-oceanleo-acp-command-completions]"), null);

    const input = view.$("[data-oceanleo-cc-dialog-input]");
    await setValue(input, "/rev");
    assert.ok(view.$("[data-oceanleo-acp-command-completions]"));
    assert.ok(view.$('[data-oceanleo-acp-command="review"]'));
    assert.equal(view.$('[data-oceanleo-acp-command="init"]'), null);
    await click(view.$('[data-oceanleo-acp-command="review"]'));
    assert.equal(view.$("[data-oceanleo-cc-dialog-input]").value, "/review ");

    await setValue(view.$("[data-oceanleo-cc-dialog-input]"), "继续");
    assert.equal(view.$("[data-oceanleo-acp-command-completions]"), null);
    await pressEnter(view.$("[data-oceanleo-cc-dialog-input]"));
    await until(() => sentFrames().some((frame) => frame.t === "prompt"), "prompt");
    assert.deepEqual(
      sentFrames().find((frame) => frame.t === "prompt"),
      { t: "prompt", program: "cursor", text: "继续", acp_session: "s-old", model: "sonnet" },
    );

    await server({ t: "turn_start", program: "cursor", acp_session: "s-old" });
    await server({
      t: "permission",
      program: "cursor",
      acp_session: "s-old",
      id: "p1",
      auto: true,
      title: "Run command",
      tool: { title: "rm -rf /tmp/cache" },
      options: [{ id: "allow", name: "Allow", kind: "allow_once" }],
    });
    assert.match(view.$('[data-oceanleo-cc-permission-auto="p1"]').textContent, /已自动允许：rm -rf \/tmp\/cache/);
    await server({ t: "usage", program: "cursor", used: 1200, size: 200000, cost: { amount: 0.42, currency: "USD" } });
    await server({ t: "done", program: "cursor", stop: "end_turn" });
    assert.doesNotMatch(view.text(), /0\.42|USD|\$/);
    assert.doesNotMatch(view.text(), /关掉会话/);

    await click(view.$("[data-oceanleo-acp-new-session]"));
    await until(() => sentFrames().some((frame) => frame.t === "new_session"), "new_session");
    assert.deepEqual(sentFrames().find((frame) => frame.t === "new_session"), { t: "new_session", program: "cursor" });
  } finally {
    view.cleanup();
  }
});

test("会话栏：程序回 supported:false 时写明不支持列出过去的对话", async () => {
  const view = await boot({ initialProgram: "hermes" });
  try {
    await until(() => sentFrames().some((frame) => frame.t === "sessions" && frame.program === "hermes"), "hermes sessions");
    await server({ t: "sessions", program: "hermes", supported: false, sessions: [] });
    assert.ok(view.$("[data-oceanleo-acp-sessions-unsupported]"));
    assert.match(view.text(), /这个程序不支持列出过去的对话/);
  } finally {
    view.cleanup();
  }
});

test("initialSessionId：进卡即 open_session 那一条", async () => {
  const view = await boot({ initialProgram: "cursor", initialSessionId: "s-deep" });
  try {
    await until(() => sentFrames().some((frame) => frame.t === "open_session"), "open_session");
    assert.deepEqual(
      sentFrames().find((frame) => frame.t === "open_session"),
      { t: "open_session", program: "cursor", acp_session: "s-deep" },
    );
  } finally {
    view.cleanup();
  }
});

test("设置齿轮：模型 / 模式 / 其它配置项；危险操作先问我、OceanLeo 工具、允许扣费三开关调对接口；卸载走确认框", async () => {
  const view = await boot({ initialProgram: "cursor" });
  try {
    await until(() => sentFrames().some((frame) => frame.t === "models" && frame.program === "cursor"), "cursor models");
    await server({
      t: "models",
      program: "cursor",
      source: "acp",
      models: [{ id: "gpt-5", name: "GPT-5", default: true }, { id: "sonnet", name: "Sonnet" }],
    });
    await server({
      t: "config",
      program: "cursor",
      options: [
        { id: "mode", name: "模式", category: "mode", current: "ask", options: [{ value: "ask", name: "Ask" }, { value: "agent", name: "Agent" }] },
        { id: "reasoning", name: "推理强度", type: "select", current: "low", options: [{ value: "low", name: "Low" }, { value: "high", name: "High" }] },
      ],
    });

    await click(view.$("[data-oceanleo-acp-current-settings]"));
    await until(() => calls("getAgentSettings").length > 0 && !view.$('[data-oceanleo-acp-setting="confirm_dangerous"]').disabled, "settings loaded");
    const panel = view.$('[data-oceanleo-acp-settings="cursor"]');
    assert.ok(panel);
    assert.ok(panel.querySelector("[data-oceanleo-acp-settings-model]"));
    assert.ok(panel.querySelector("[data-oceanleo-acp-settings-mode]"));
    assert.ok(panel.querySelector('[data-oceanleo-acp-setting-config="reasoning"]'));
    await setValue(panel.querySelector('[data-oceanleo-acp-setting-config="reasoning"]'), "high");
    await until(() => sentFrames().some((frame) => frame.t === "set_config" && frame.id === "reasoning"), "reasoning set_config");
    assert.match(panel.textContent, /关掉后 AI 执行删除、覆盖等操作前不再问你/);
    assert.match(panel.textContent, /这一项对这台服务器上所有 AI 生效。/);
    assert.ok(panel.querySelector("[data-oceanleo-acp-settings-logout]"));
    assert.ok(panel.querySelector("[data-oceanleo-acp-settings-key]"));
    assert.equal(panel.querySelector('[data-oceanleo-acp-setting="billing_allowed"]'), null);

    const confirm = panel.querySelector('[data-oceanleo-acp-setting="confirm_dangerous"]');
    assert.equal(confirm.checked, true, "危险操作先问我默认开");
    await click(confirm);
    await until(() => calls("patchAgentSettings").length === 1, "patch confirm_dangerous");
    assert.deepEqual(calls("patchAgentSettings")[0], ["patchAgentSettings", "cc_1", { confirm_dangerous: false }]);
    await until(() => !panel.querySelector('[data-oceanleo-acp-setting="oceanleo_tools"]').disabled, "saved");
    assert.equal(panel.querySelector('[data-oceanleo-acp-setting="confirm_dangerous"]').checked, false);

    await click(panel.querySelector('[data-oceanleo-acp-setting="oceanleo_tools"]'));
    await until(() => calls("patchAgentSettings").length === 2, "patch oceanleo_tools");
    assert.deepEqual(calls("patchAgentSettings")[1], ["patchAgentSettings", "cc_1", { oceanleo_tools: false }]);
    await click(view.$("[data-oceanleo-acp-settings-close]"));
    assert.equal(view.$("[data-oceanleo-acp-settings]"), null);
  } finally {
    view.cleanup();
  }

  const local = await boot({}, { oceanleo: { installed: true, version: "0.3.1", token_active: true } });
  try {
    await until(() => local.$('[data-oceanleo-acp-agent="oceanleo"] [data-oceanleo-acp-agent-state="installed"]'), "local installed");
    await click(local.$('[data-oceanleo-acp-picker-settings="oceanleo"]'));
    await until(() => {
      const toggle = local.$('[data-oceanleo-acp-setting="billing_allowed"]');
      return toggle && !toggle.disabled;
    }, "billing toggle");
    const billing = local.$('[data-oceanleo-acp-setting="billing_allowed"]');
    assert.equal(billing.checked, true, "billing_paused:false = 允许扣费");
    await click(billing);
    await until(() => calls("patchAgentSettings").length === 1, "patch billing");
    assert.deepEqual(calls("patchAgentSettings")[0], ["patchAgentSettings", "cc_1", { billing_paused: true }]);

    await until(() => !local.$("[data-oceanleo-acp-uninstall]").disabled, "uninstall enabled");
    await click(local.$("[data-oceanleo-acp-uninstall]"));
    assert.equal(calls("uninstallOceanleoAgent").length, 0, "卸载先确认");
    await click(local.$("[data-test-confirm-ok]"));
    await until(() => calls("uninstallOceanleoAgent").length === 1, "uninstall call");
    await until(() => local.$('[data-oceanleo-acp-agent="oceanleo"] [data-oceanleo-acp-agent-state="cloud"]'), "back to cloud");
    assert.equal(local.$("[data-oceanleo-acp-settings]"), null);
  } finally {
    local.cleanup();
  }
});

test("白 / 黑两套 class 都在：卡片、设置与子面板不再写死深色", async () => {
  const view = await boot({ initialProgram: "cursor" });
  try {
    const card = view.$("[data-oceanleo-acp-card]");
    for (const token of ["bg-zinc-50", "dark:bg-neutral-900", "border-zinc-200", "dark:border-neutral-800", "text-zinc-900", "dark:text-neutral-100"]) {
      assert.ok(card.className.split(/\s+/).includes(token), `卡片缺 ${token}`);
    }
    const input = view.$("[data-oceanleo-cc-dialog-input]");
    assert.ok(input.className.includes("bg-white") && input.className.includes("dark:bg-neutral-900"));
    await click(view.$("[data-oceanleo-acp-current-settings]"));
    const panel = view.$('[data-oceanleo-acp-settings="cursor"]');
    assert.ok(panel.className.includes("bg-white") && panel.className.includes("dark:bg-neutral-950"));
  } finally {
    view.cleanup();
  }

  const dir = fileURLToPath(new URL("../src/shell/cloud-computer/agent-dialog/", import.meta.url));
  const hardDark = /(?<![\w:-])(?:bg|text|border|divide|ring|placeholder)-neutral-(?:8|9)\d\d\b/g;
  const offenders = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".tsx"))) {
    const source = readFileSync(join(dir, name), "utf8");
    for (const match of source.matchAll(hardDark)) offenders.push(`${name}: ${match[0]}`);
    if (source.includes("关掉会话")) offenders.push(`${name}: 关掉会话`);
  }
  assert.deepEqual(offenders, [], "agent-dialog 里不许有不带 dark: 的深色写死或「关掉会话」");
});

test("reduce：回放没有 done 时每条用户消息后的回复各成一轮", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  const replay = { program: "cursor", acp_session: "s", replay: true };
  for (const frame of [
    { t: "user_message", ...replay, text: "q1" },
    { t: "delta", ...replay, text: "a1" },
    { t: "user_message", ...replay, text: "q2" },
    { t: "delta", ...replay, text: "a2" },
  ]) {
    state = applyDialog(state, { type: "frame", frame });
  }
  assert.deepEqual(
    state.messages.map((message) =>
      message.kind === "user" ? `u:${message.text}` : `t:${message.items.map((item) => item.text).join("")}`,
    ),
    ["u:q1", "t:a1", "u:q2", "t:a2"],
  );
  assert.ok(state.messages.filter((message) => message.kind === "user").every((message) => message.replay === true));
  state = applyDialog(state, { type: "frame", frame: { t: "commands", program: "cursor", commands: [{ name: "x", description: "y" }] } });
  assert.equal(state.messages.length, 4, "commands 不进消息流");
  assert.deepEqual(state.commands, [{ name: "x", description: "y" }]);
});
