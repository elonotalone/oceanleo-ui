import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { lineDiff } from "../src/shell/cloud-computer/agent-dialog/diff-lines.ts";
import { installDirPayload } from "../src/shell/cloud-computer/agent-dialog/install-dir.ts";
import { normalizeQuestions } from "../src/shell/cloud-computer/agent-dialog/questions.ts";
import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";
import { nextReconnectDelay } from "../src/shell/cloud-computer/agent-dialog/reconnect.ts";
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
`);

const { useAgentDialog, AgentDialogPane } = await import(
  await compileModule("src/shell/cloud-computer/useAgentDialog.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../lib/cloud-computer-api": apiStub,
    "../../lib/auth/client": authStub,
  })
);

const STATUS = {
  t: "status",
  program: "",
  programs: [
    { id: "cursor", installed: true, path: "/c", version: "1", logged_in: true, dir_capability: "full", running: true },
    { id: "hermes", installed: true, path: "/h", version: "1", logged_in: false, dir_capability: "link_only", running: false },
    { id: "claude", installed: false, path: "", version: "", logged_in: null, dir_capability: "none", running: false },
    { id: "codex", installed: false, path: "", version: "", logged_in: null, dir_capability: "full", running: false },
  ],
};

function Harness({ leo }) {
  const dialog = useAgentDialog({ computerId: "cc_1", sessionId: "sid_1", enabled: true });
  return React.createElement(AgentDialogPane, {
    dialog,
    onBack() {},
    onOpenLeo: leo ? () => { globalThis.__leoClicks += 1; } : undefined,
  });
}

async function until(fn, label) {
  for (let i = 0; i < 40; i += 1) {
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

async function click(element) {
  assert.ok(element);
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setControlValue(element, value) {
  const proto = Object.getPrototypeOf(element);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  assert.ok(setter);
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function fillText(element, value) {
  await act(async () => {
    element.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    assert.ok(setter);
    setter.call(element, value);
    element.dispatchEvent(new KeyboardEvent("keyup", { key: "a", bubbles: true }));
  });
}

async function pressEnter(element, shift = false) {
  await act(async () => {
    element.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: shift, bubbles: true, cancelable: true }),
    );
  });
}

async function boot(leo = true) {
  FakeSocket.sockets.length = 0;
  globalThis.__leoClicks = 0;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Harness, { leo }));
  });
  await until(() => FakeSocket.sockets.some((socket) => socket.sent.some((frame) => frame.t === "status")), "status frame");
  const socket = openSocket();
  assert.ok(socket);
  await act(async () => {
    socket.server(STATUS);
  });
  return {
    host,
    socket: () => openSocket(),
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("重连间隔、安装目录、提问退化和行级 diff", () => {
  assert.equal(nextReconnectDelay(1000), 2000);
  assert.equal(nextReconnectDelay(2000), 4000);
  assert.equal(nextReconnectDelay(16000), 30000);
  assert.equal(nextReconnectDelay(30000), 30000);
  assert.equal(installDirPayload("~/.local", "full"), "");
  assert.equal(installDirPayload("  ", "full"), "");
  assert.equal(installDirPayload("~/apps", "full"), "~/apps");
  assert.equal(installDirPayload("/opt/tools", "none"), "");
  assert.equal(normalizeQuestions({ weird: true }).mode, "text");
  assert.equal(normalizeQuestions([{ prompt: "选一个", options: [{ id: "a", label: "甲" }] }]).mode, "fields");
  const rows = lineDiff("a\nb\n", "a\nc\n");
  assert.deepEqual(rows.filter((row) => row.op !== " ").map((row) => `${row.op}${row.text}`), ["-b", "+c"]);

  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, {
    type: "frame",
    frame: { t: "tool", program: "cursor", id: "t1", kind: "edit", title: "Edit file", status: "in_progress" },
  });
  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "tool",
      program: "cursor",
      id: "t1",
      status: "completed",
      content: [{ type: "diff", path: "a.txt", old_text: "a\nb", new_text: "a\nc" }],
    },
  });
  const turn = state.messages.find((message) => message.kind === "turn");
  const tool = turn.items.find((item) => item.kind === "tool");
  assert.equal(turn.items.filter((item) => item.kind === "tool").length, 1);
  assert.equal(tool.tool.title, "Edit file");
  assert.equal(tool.tool.status, "completed");
  assert.equal(tool.tool.content[0].type, "diff");
});

test("程序行状态点、安装抽屉、登录卡、模型和一轮对话", async () => {
  const view = await boot(true);
  try {
    const text = view.host.textContent || "";
    assert.match(text, /Cursor[\s\S]*Hermes[\s\S]*Claude Code[\s\S]*Codex[\s\S]*OceanLeo/);
    assert.ok(view.host.querySelector('[data-oceanleo-cc-program="cursor"] [data-oceanleo-cc-dot="green"]'));
    assert.ok(view.host.querySelector('[data-oceanleo-cc-program="cursor"] [data-oceanleo-cc-running="1"]'));
    assert.ok(view.host.querySelector('[data-oceanleo-cc-program="hermes"] [data-oceanleo-cc-dot="yellow"]'));
    assert.ok(view.host.querySelector('[data-oceanleo-cc-login="hermes"]'));
    assert.ok(view.host.querySelector('[data-oceanleo-cc-program="claude"] [data-oceanleo-cc-dot="gray"]'));
    assert.ok(view.host.querySelector('[data-oceanleo-cc-install="codex"]'));
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dialog-input]"), null);

    await click(view.host.querySelector("[data-oceanleo-cc-dialog-oceanleo]"));
    assert.equal(globalThis.__leoClicks, 1);
    assert.equal(view.socket().sent.some((frame) => frame.program === "oceanleo"), false);

    await click(view.host.querySelector('[data-oceanleo-cc-install="claude"]'));
    const claudeDir = view.host.querySelector("[data-oceanleo-cc-install-dir]");
    assert.equal(claudeDir.disabled, true);
    assert.match(view.host.textContent || "", /这个程序只能装在默认位置/);
    await click(view.host.querySelector("[data-oceanleo-cc-install-close]"));

    await click(view.host.querySelector('[data-oceanleo-cc-install="codex"]'));
    assert.match(view.host.textContent || "", /整个程序装到这个目录/);
    const dir = view.host.querySelector("[data-oceanleo-cc-install-dir]");
    assert.equal(dir.value, "~/.local");
    await click(view.host.querySelector("[data-oceanleo-cc-install-start]"));
    await until(() => view.socket().sent.some((frame) => frame.t === "install"), "install frame");
    const install = view.socket().sent.find((frame) => frame.t === "install");
    assert.deepEqual(install, { t: "install", program: "codex", dir: "" });
    await act(async () => {
      view.socket().server({ t: "install_progress", program: "codex", text: "step one" });
      view.socket().server({ t: "install_progress", program: "codex", text: "step two" });
    });
    assert.match(view.host.querySelector("[data-oceanleo-cc-install-log]").textContent || "", /step one\nstep two/);
    await click(view.host.querySelector("[data-oceanleo-cc-install-close]"));
    assert.equal(view.host.querySelector("[data-oceanleo-cc-install-sheet]"), null);
    await click(view.host.querySelector('[data-oceanleo-cc-install="codex"]'));
    assert.match(view.host.querySelector("[data-oceanleo-cc-install-log]").textContent || "", /step two/);
    const beforeDone = view.socket().sent.length;
    await act(async () => {
      view.socket().server({ t: "install_done", program: "codex", path: "/home/me/.local/bin/codex" });
    });
    assert.match(view.host.querySelector("[data-oceanleo-cc-install-path]").textContent || "", /\/home\/me\/\.local\/bin\/codex/);
    assert.ok(view.socket().sent.slice(beforeDone).some((frame) => frame.t === "status"));
    await act(async () => {
      view.socket().server({ t: "install_failed", program: "codex", code: "install_failed", text: "disk full" });
    });
    assert.match(view.host.querySelector("[data-oceanleo-cc-install-error]").textContent || "", /disk full/);
    assert.ok(view.host.querySelector("[data-oceanleo-cc-install-retry]"));
    await click(view.host.querySelector("[data-oceanleo-cc-install-close]"));

    await click(view.host.querySelector('[data-oceanleo-cc-login="hermes"]'));
    await until(() => view.socket().sent.some((frame) => frame.t === "login" && frame.program === "hermes"), "login frame");
    await act(async () => {
      view.socket().server({
        t: "login_url",
        program: "hermes",
        url: "https://example.com/device",
        code: "ABCD",
      });
    });
    const link = view.host.querySelector("[data-oceanleo-cc-login-url]");
    assert.equal(link.getAttribute("href"), "https://example.com/device");
    assert.equal(link.getAttribute("target"), "_blank");
    assert.equal(link.getAttribute("rel"), "noopener noreferrer");
    assert.equal(view.host.querySelector("[data-oceanleo-cc-login-code]").textContent, "ABCD");
    assert.match(view.host.textContent || "", /在浏览器里完成后这里会自动变绿/);
    await act(async () => {
      view.socket().server({ t: "login_done", program: "hermes" });
    });
    assert.equal(view.host.querySelector("[data-oceanleo-cc-login-card]"), null);

    await click(view.host.querySelector("[data-oceanleo-cc-dialog-cursor]"));
    await until(() => view.socket().sent.some((frame) => frame.t === "models" && frame.program === "cursor"), "models request");
    assert.ok(view.host.querySelector("[data-oceanleo-cc-dialog-input]"));
    await act(async () => {
      view.socket().server({
        t: "models",
        program: "cursor",
        source: "acp",
        models: [
          { id: "a", name: "A", default: false },
          { id: "b", name: "Bee", default: true },
        ],
      });
      view.socket().server({
        t: "config",
        program: "cursor",
        options: [{
          id: "mode",
          name: "模式",
          category: "mode",
          current: "ask",
          options: [
            { value: "ask", name: "Ask" },
            { value: "agent", name: "Agent" },
          ],
        }],
      });
    });
    const model = view.host.querySelector("[data-oceanleo-cc-model]");
    const mode = view.host.querySelector("[data-oceanleo-cc-mode]");
    assert.equal(model.value, "b");
    assert.equal(mode.value, "ask");
    await act(async () => {
      setControlValue(model, "a");
      setControlValue(mode, "agent");
    });
    assert.ok(view.socket().sent.some((frame) => frame.t === "set_config" && frame.id === "mode" && frame.value === "agent"));

    const input = view.host.querySelector("[data-oceanleo-cc-dialog-input]");
    await fillText(input, "hello");
    await pressEnter(input, true);
    assert.equal(view.socket().sent.some((frame) => frame.t === "prompt"), false);
    await click(view.host.querySelector("[data-oceanleo-cc-fresh]"));
    await pressEnter(input, false);
    await until(() => view.socket().sent.some((frame) => frame.t === "prompt"), "prompt");
    const prompt = view.socket().sent.find((frame) => frame.t === "prompt");
    assert.deepEqual(prompt, { t: "prompt", program: "cursor", text: "hello", model: "a", mode: "agent", fresh: true });

    await act(async () => {
      view.socket().server({ t: "turn_start", program: "cursor", acp_session: "s1" });
      view.socket().server({ t: "thought", program: "cursor", text: "hmm" });
      view.socket().server({ t: "delta", program: "cursor", text: "see `<img onerror=alert(1)>` " });
      view.socket().server({
        t: "delta",
        program: "cursor",
        text: "<img src=x onerror=alert(1)><script>alert(1)</script>",
      });
      view.socket().server({ t: "tool", program: "cursor", id: "t1", kind: "edit", title: "Edit file", status: "in_progress", content: [], locations: [] });
      view.socket().server({
        t: "tool",
        program: "cursor",
        id: "t1",
        status: "completed",
        content: [{ type: "diff", path: "a.txt", old_text: "a\nb\n", new_text: "a\nc\n" }],
      });
      view.socket().server({
        t: "plan",
        program: "cursor",
        entries: [{ content: "第一步", priority: "high", status: "completed" }],
      });
      view.socket().server({ t: "usage", program: "cursor", used: 25, size: 100 });
      view.socket().server({
        t: "permission",
        program: "cursor",
        id: "p1",
        title: "Run it",
        kind: "execute",
        options: [
          { id: "once", name: "允许这一次", kind: "allow_once" },
          { id: "always", name: "总是允许", kind: "allow_always" },
          { id: "no", name: "拒绝", kind: "reject_once" },
        ],
        tool: { id: "t1", title: "Edit file", kind: "edit" },
      });
      view.socket().server({ t: "question", program: "cursor", id: "q1", title: "确认", questions: { weird: true } });
    });
    assert.equal(view.host.querySelector("img"), null);
    assert.equal(view.host.querySelector("script"), null);
    assert.match(view.host.textContent || "", /<img onerror/);
    assert.match(view.host.textContent || "", /<script>/);
    assert.equal(view.host.querySelectorAll('[data-oceanleo-cc-tool="t1"]').length, 1);
    assert.match(view.host.textContent || "", /Edit file/);
    assert.match(view.host.textContent || "", /用量 25%/);
    assert.equal(view.host.querySelector('[data-oceanleo-cc-plan-status="completed"]').textContent.includes("第一步"), true);
    await click(view.host.querySelector('[data-oceanleo-cc-tool="t1"] button'));
    const removed = view.host.querySelector('[data-oceanleo-cc-diff-op="-"]');
    const added = view.host.querySelector('[data-oceanleo-cc-diff-op="+"]');
    assert.match(removed.textContent || "", /b/);
    assert.match(added.textContent || "", /c/);
    const options = [...view.host.querySelectorAll("[data-oceanleo-cc-permission-option]")].map((node) => node.getAttribute("data-oceanleo-cc-permission-option"));
    assert.deepEqual(options, ["once", "always", "no"]);
    await click(view.host.querySelector('[data-oceanleo-cc-permission-option="once"]'));
    await until(() => view.socket().sent.some((frame) => frame.t === "permission"), "permission");
    assert.deepEqual(
      view.socket().sent.find((frame) => frame.t === "permission"),
      { t: "permission", id: "p1", option: "once" },
    );
    assert.match(view.host.querySelector("[data-oceanleo-cc-permission-chosen]").textContent || "", /已选：允许这一次/);
    const answer = view.host.querySelector("[data-oceanleo-cc-question-input]");
    await fillText(answer, "yes");
    await click(view.host.querySelector("[data-oceanleo-cc-question-submit]"));
    await until(() => view.socket().sent.some((frame) => frame.t === "answer"), "answer");
    assert.deepEqual(view.socket().sent.find((frame) => frame.t === "answer"), {
      t: "answer",
      id: "q1",
      values: { text: "yes" },
    });
    await click(view.host.querySelector("[data-oceanleo-cc-stop]"));
    assert.deepEqual(
      view.socket().sent.find((frame) => frame.t === "cancel"),
      { t: "cancel", program: "cursor" },
    );
    await click(view.host.querySelector('[data-oceanleo-cc-close-session="cursor"]'));
    assert.deepEqual(
      view.socket().sent.find((frame) => frame.t === "close"),
      { t: "close", program: "cursor" },
    );
    assert.equal(view.host.querySelector('[data-oceanleo-cc-close-session="cursor"]'), null);

    await act(async () => {
      view.socket().server({ t: "models", program: "cursor", source: "none", models: [] });
      view.socket().server({ t: "error", program: "cursor", code: "agent_busy" });
    });
    assert.equal(view.host.querySelector("[data-oceanleo-cc-model]"), null);
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dialog-input]").disabled, true);

    await act(async () => {
      view.socket().server({ t: "error", program: "", code: "computer_offline" });
    });
    assert.equal(
      view.host.querySelector("[data-oceanleo-cc-agent-dialog-pane]").getAttribute("data-oceanleo-cc-reconnect"),
      "paused",
    );
    assert.match(view.host.textContent || "", /机器离线/);
    const count = FakeSocket.sockets.length;
    view.socket().close();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.equal(FakeSocket.sockets.length, count);
    await click(view.host.querySelector("[data-oceanleo-cc-retry]"));
    await until(() => FakeSocket.sockets.length > count, "retry opens a socket");
  } finally {
    view.cleanup();
  }
});

test("没传 onOpenLeo 时不渲染 OceanLeo", async () => {
  const view = await boot(false);
  try {
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dialog-oceanleo]"), null);
    assert.ok(view.host.querySelector("[data-oceanleo-cc-dialog-cursor]"));
  } finally {
    view.cleanup();
  }
});
