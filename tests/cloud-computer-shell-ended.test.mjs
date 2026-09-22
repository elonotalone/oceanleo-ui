import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => {
      if (!vars) return value;
      return String(value).replace(/\\{(\\w+)\\}/g, (_, key) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : "{" + key + "}",
      );
    };
  }
`);
const navStubUrl = dataModule(`
  export function useRouter() {
    return { push() {}, replace() {}, refresh() {}, back() {} };
  }
`);
const apiStubUrl = dataModule(`
  export const cloudComputerApi = globalThis.__shellApi;
  export function agentDialogWsUrl() { return "ws://example.test/agent"; }
  export function terminalWsUrl(id, sessionId) {
    return "ws://terminal.test/" + id + "/" + sessionId;
  }
`);
const terminalStubUrl = dataModule(`
  export function useComputerTerminal() {
    const snap = globalThis.__endedTerminal || { status: "live", detail: "" };
    return {
      hostRef: { current: null },
      ready: true,
      status: snap.status,
      detail: snap.detail,
      sendText() {},
      tail() { return ""; },
    };
  }
`);
const stateStubUrl = dataModule(`
  export function computerDisplayState(computer) {
    if (!computer) return "offline";
    if (computer.node_online) return "ready";
    return "offline";
  }
  export function canOpenShell(computer) {
    return Boolean(computer && computer.node_online);
  }
`);
const leoStubUrl = dataModule(`
  export function openLeoAssistant(detail) {
    globalThis.__openLeoDetail = detail;
  }
`);
const authStubUrl = dataModule(`
  export async function accessToken() {
    globalThis.__terminalTokenCalls = (globalThis.__terminalTokenCalls || 0) + 1;
    if (globalThis.__terminalTokenMode === "second-fails" && globalThis.__terminalTokenCalls > 1) {
      return null;
    }
    return "tok";
  }
`);
const xtermStubUrl = dataModule(`
  export class Terminal {
    constructor() {
      this.cols = 80;
      this.rows = 24;
    }
    loadAddon() {}
    open() {}
    write() {}
    onWriteParsed() {}
    onData() {}
    focus() {}
    dispose() {}
  }
`);
const fitStubUrl = dataModule(`
  export class FitAddon {
    fit() {}
    proposeDimensions() {
      return { cols: 80, rows: 24 };
    }
  }
`);

const { ShellTaskView } = await import(
  await compileModule("src/shell/cloud-computer/ShellTaskView.tsx", {
    "../../i18n/ui/useUI": uiStubUrl,
    "../../lib/cloud-computer-api": apiStubUrl,
    "./TerminalPanel": terminalStubUrl,
    "./computer-state": stateStubUrl,
    "next/navigation": navStubUrl,
    "../LeoAssistant": leoStubUrl,
  })
);

const { effectOfTerminalFrame, useComputerTerminal } = await import(
  await compileModule("src/shell/cloud-computer/TerminalPanel.tsx", {
    "../../i18n/ui/useUI": uiStubUrl,
    "../../lib/cloud-computer-api": apiStubUrl,
    "../../lib/auth/client": authStubUrl,
    "@xterm/xterm": xtermStubUrl,
    "@xterm/addon-fit": fitStubUrl,
    "@xterm/xterm/css/xterm.css": dataModule("export {};"),
  })
);

const { SHELL_ENDED_MESSAGES, SHELL_ENDED_ZH } = await import(
  await compileModule("src/i18n/ui/messages/shell-ended-copy.ts")
);

class FakeSocket {
  static instances = [];
  static OPEN = 1;
  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.OPEN;
    this.listeners = new Map();
    FakeSocket.instances.push(this);
  }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
  emit(payload) {
    const event = { data: JSON.stringify(payload) };
    for (const fn of this.listeners.get("message") || []) fn(event);
  }
}

function makeClient() {
  return {
    async getComputer() {
      return { id: "cc_1", name: "新加坡一号", node_online: true, status: "running" };
    },
    async closeTerminal() {
      return { ok: true };
    },
    async openTerminal() {
      return { id: "sid_new", task_id: "task-new" };
    },
  };
}

async function flush(count = 8) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function until(pred) {
  for (let i = 0; i < 40; i += 1) {
    if (pred()) return true;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return Boolean(pred());
}

async function mountTerminal(sessionId) {
  FakeSocket.instances = [];
  globalThis.__terminalTokenCalls = 0;
  globalThis.WebSocket = FakeSocket;
  window.WebSocket = FakeSocket;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Probe() {
    const terminal = useComputerTerminal({
      computerId: "cc_1",
      sessionId,
      enabled: true,
    });
    return React.createElement("div", {
      ref: terminal.hostRef,
      "data-status": terminal.status,
      "data-detail": terminal.detail ?? "",
    });
  }
  await act(async () => {
    root.render(React.createElement(Probe));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(await until(() => FakeSocket.instances.length === 1), true);
  return {
    probe: () => host.querySelector("[data-status]"),
    async emit(index, payload) {
      await act(async () => {
        FakeSocket.instances[index].emit(payload);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function render(props = {}) {
  globalThis.__shellApi = makeClient();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const draw = () => {
    root.render(
      React.createElement(ShellTaskView, {
        client: globalThis.__shellApi,
        taskId: "task-1",
        computerId: "cc_1",
        sessionId: "sid_1",
        computerName: "新加坡一号",
        ...props,
      }),
    );
  };
  await act(async () => {
    draw();
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    async rerender() {
      await act(async () => {
        draw();
      });
      await flush();
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("error 先再连一次，第二次才带错误码结束；exit 带退出码", () => {
  const first = effectOfTerminalFrame({ t: "error", code: "acp_start_failed" }, 0);
  assert.equal(first.effect.kind, "reconnect");
  assert.equal(first.errorReconnectsUsed, 1);
  const second = effectOfTerminalFrame(
    { t: "error", code: "acp_start_failed" },
    first.errorReconnectsUsed,
  );
  assert.deepEqual(second.effect, { kind: "error", code: "acp_start_failed" });
  assert.equal(second.errorReconnectsUsed, 1);
  const exit = effectOfTerminalFrame({ t: "exit", exit_code: 0 }, 0);
  assert.deepEqual(exit.effect, { kind: "exit", code: "0" });
  const blank = effectOfTerminalFrame({ t: "error", code: "" }, 1);
  assert.deepEqual(blank.effect, { kind: "error", code: "error" });
});

test("套接字收到 error 会再开一条连接，仍失败才写入错误码", async () => {
  globalThis.__terminalTokenMode = "ok";
  const view = await mountTerminal("sid_1");
  await view.emit(0, { t: "error", code: "acp_start_failed" });
  assert.equal(await until(() => FakeSocket.instances.length === 2), true);
  assert.equal(view.probe().getAttribute("data-status"), "live");
  await view.emit(1, { t: "error", code: "acp_start_failed" });
  assert.equal(await until(() => view.probe().getAttribute("data-status") === "error"), true);
  assert.equal(view.probe().getAttribute("data-detail"), "acp_start_failed");
  assert.equal(FakeSocket.instances.length, 2);
  await view.cleanup();
});

test("再连接拿不到令牌时，用第一次的错误码结束", async () => {
  globalThis.__terminalTokenMode = "second-fails";
  const view = await mountTerminal("sid_9");
  await view.emit(0, { t: "error", code: "socket_lost" });
  assert.equal(await until(() => view.probe().getAttribute("data-status") === "error"), true);
  assert.equal(view.probe().getAttribute("data-detail"), "socket_lost");
  assert.equal(FakeSocket.instances.length, 1);
  await view.cleanup();
});

test("exit 帧把退出码写进 detail", async () => {
  globalThis.__terminalTokenMode = "ok";
  const view = await mountTerminal("sid_exit");
  await view.emit(0, { t: "exit", exit_code: 0 });
  assert.equal(await until(() => view.probe().getAttribute("data-status") === "exit"), true);
  assert.equal(view.probe().getAttribute("data-detail"), "0");
  await view.cleanup();
});

test("结束句写出错误码、退出码，缺会话不用同一句", async () => {
  globalThis.__endedTerminal = { status: "error", detail: "acp_start_failed" };
  const errored = await render({});
  assert.match(errored.text(), /错误码 acp_start_failed/);
  assert.equal(
    errored.host.querySelector("[data-oceanleo-cc-shell-end]")?.getAttribute("data-oceanleo-cc-shell-end"),
    "error",
  );
  errored.cleanup();

  globalThis.__endedTerminal = { status: "exit", detail: "7" };
  const exited = await render({});
  assert.match(exited.text(), /退出码 7/);
  assert.equal(
    exited.host.querySelector("[data-oceanleo-cc-shell-end]")?.getAttribute("data-oceanleo-cc-shell-end"),
    "exit",
  );
  exited.cleanup();

  globalThis.__endedTerminal = { status: "live", detail: "" };
  const missingComputer = await render({ computerId: "" });
  assert.match(missingComputer.text(), /缺少会话/);
  assert.equal(missingComputer.text().includes("这个 Shell 已结束"), false);
  assert.equal(
    missingComputer.host.querySelector("[data-oceanleo-cc-shell-end]")?.getAttribute("data-oceanleo-cc-shell-end"),
    "missing",
  );
  missingComputer.cleanup();

  const missingSession = await render({ sessionId: "" });
  assert.match(missingSession.text(), /缺少会话/);
  assert.equal(missingSession.text().includes("这个 Shell 已结束"), false);
  missingSession.cleanup();
});

test("顶栏只有火花和 leo，没有新面板，也没有右下角覆盖", async () => {
  globalThis.__endedTerminal = { status: "live", detail: "" };
  globalThis.__openLeoDetail = null;
  const view = await render({});
  const toggle = view.host.querySelector("[data-oceanleo-cc-leo-toggle]");
  assert.ok(toggle);
  assert.equal(toggle.textContent, "leo");
  assert.ok(toggle.querySelector("svg"));
  const composer = readFileSync(resolve(repo, "src/shell/LeoComposer.tsx"), "utf8");
  const buttonClass =
    "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] text-neutral-600 transition-all duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-100 active:scale-95";
  assert.equal(composer.includes(`className="${buttonClass}"`), true);
  assert.equal(toggle.className, buttonClass);
  assert.equal(view.text().includes("OceanLeo agent"), false);
  assert.equal(view.text().includes("缩到气泡"), false);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-leo-form]"), null);
  const overlay = [...view.host.querySelectorAll("div")].find((el) => {
    const className = String(el.className || "");
    return className.includes("bottom-3") && className.includes("right-3");
  });
  assert.equal(overlay, undefined);
  await act(async () => {
    toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(globalThis.__openLeoDetail, { toggle: true });
  const source = readFileSync(resolve(repo, "src/shell/cloud-computer/ShellTaskView.tsx"), "utf8");
  assert.equal(source.includes("LeoAgentPanel"), false);
  assert.equal(source.includes("OceanLeo agent"), false);
  view.cleanup();
});

test("结束句接进外壳词典，17 个语种都有错误码占位", () => {
  const aggregator = readFileSync(
    resolve(repo, "src/i18n/ui/messages/shell-overhaul-copy.ts"),
    "utf8",
  );
  assert.equal(aggregator.includes('from "./shell-ended-copy"'), true);
  assert.equal(aggregator.includes("SHELL_ENDED_MESSAGES"), true);
  assert.equal(SHELL_ENDED_MESSAGES.zh[SHELL_ENDED_ZH.endedError].includes("{code}"), true);
  assert.equal(
    SHELL_ENDED_MESSAGES.en[SHELL_ENDED_ZH.endedError],
    "This Shell has ended. Error code {code}.",
  );
  assert.notEqual(SHELL_ENDED_ZH.missingSession, "这个 Shell 已结束");
  for (const locale of Object.keys(SHELL_ENDED_MESSAGES)) {
    const table = SHELL_ENDED_MESSAGES[locale];
    assert.equal(table[SHELL_ENDED_ZH.endedError].includes("{code}"), true);
    assert.equal(table[SHELL_ENDED_ZH.endedExit].includes("{code}"), true);
    assert.notEqual(table[SHELL_ENDED_ZH.missingSession], table[SHELL_ENDED_ZH.endedExit]);
  }
});
