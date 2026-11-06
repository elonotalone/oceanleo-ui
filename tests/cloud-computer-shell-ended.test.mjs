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

const reactUrl = pathToFileURL(require.resolve("react")).href;
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
      retry() {
        globalThis.__terminalRetryCalls = (globalThis.__terminalRetryCalls || 0) + 1;
      },
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
// 隔离 W6A 在途的 agent-dialog：ShellTaskView 只负责挂 pane，不管 pane 里面。
const agentDialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function useAgentDialog() {
    return { messages: [], busy: false };
  }
  export function AgentDialogPane() {
    return React.createElement("div", { "data-oceanleo-cc-agent-dialog-pane": "1" });
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
      this.writes = [];
      this.resetCount = 0;
      globalThis.__termInstances = globalThis.__termInstances || [];
      globalThis.__termInstances.push(this);
    }
    loadAddon() {}
    open() {}
    write(data) { this.writes.push(data); }
    onWriteParsed() {}
    onData() {}
    focus() {}
    reset() {
      this.resetCount += 1;
      globalThis.__termResetCount = (globalThis.__termResetCount || 0) + 1;
    }
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
const endedCopyStubUrl = dataModule(`
  export const SHELL_ENDED_ZH = {
    missingSession: "缺少会话，这个 Shell 没有开始。",
    endedExit: "这个 Shell 已结束，退出码 {code}。",
    endedGone: "这个 Shell 已经不存在了。",
    reconnecting: "重新连接中…",
    connectionLost: "连接断了。",
    retryConnection: "重新连接",
  };
`);

const { ShellTaskView } = await import(
  await compileModule("src/shell/cloud-computer/ShellTaskView.tsx", {
    "../../i18n/ui/useUI": uiStubUrl,
    "../../lib/cloud-computer-api": apiStubUrl,
    "./TerminalPanel": terminalStubUrl,
    "./computer-state": stateStubUrl,
    "./useAgentDialog": agentDialogStubUrl,
    "next/navigation": navStubUrl,
  })
);

const { useComputerTerminal } = await import(
  await compileModule("src/shell/cloud-computer/TerminalPanel.tsx", {
    "../../i18n/ui/useUI": uiStubUrl,
    "../../lib/cloud-computer-api": apiStubUrl,
    "../../lib/auth/client": authStubUrl,
    "../../i18n/ui/messages/shell-ended-copy": endedCopyStubUrl,
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
  emitClose() {
    for (const fn of this.listeners.get("close") || []) fn({ code: 1006, wasClean: false });
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

/** 真实时间轮询：重连退避是真实 setTimeout（1s 起），得真等。 */
async function untilReal(pred, budgetMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    if (pred()) return true;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  return Boolean(pred());
}

async function sleepReal(ms) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mountTerminal(sessionId) {
  FakeSocket.instances = [];
  globalThis.__terminalTokenCalls = 0;
  globalThis.__termInstances = [];
  globalThis.__termResetCount = 0;
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
    async emitClose(index) {
      await act(async () => {
        FakeSocket.instances[index].emitClose();
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

test("exit 帧把退出码写进 detail，0 也是真退出码", async () => {
  globalThis.__terminalTokenMode = "ok";
  const view = await mountTerminal("sid_exit");
  await view.emit(0, { t: "exit", exit_code: 0 });
  assert.equal(await until(() => view.probe().getAttribute("data-status") === "exit"), true);
  assert.equal(view.probe().getAttribute("data-detail"), "0");
  // 终局落地后当前 socket 被关掉：不留活管道假装还连着。
  assert.equal(FakeSocket.instances[0].readyState, 3);
  await view.cleanup();
});

test("detached 帧不结束：进入 reconnecting，1s 后用同一 session 重连，成功后清屏回 live", async () => {
  globalThis.__terminalTokenMode = "ok";
  const view = await mountTerminal("sid_1");
  await view.emit(0, { t: "out", data_b64: Buffer.from("hello").toString("base64") });
  await view.emit(0, { t: "detached", reason: "transport" });
  assert.equal(view.probe().getAttribute("data-status"), "reconnecting");
  // 退避 1s 后新开一条 WS，复用同一 session_id（不重复 POST /terminals）。
  assert.equal(await untilReal(() => FakeSocket.instances.length === 2), true);
  assert.match(FakeSocket.instances[1].url, /\/sid_1$/);
  // 新 socket 就绪（桩同步 OPEN，补的 microtask 发 reconnect_ok）→ live + term.reset()。
  assert.equal(
  await untilReal(() => view.probe().getAttribute("data-status") === "live"),
    true,
  );
  assert.equal(globalThis.__termResetCount, 1);
  // 断线前的输出还在（清屏只发生在重连成功那一刻，且由节点回放补上）。
  assert.equal(globalThis.__termInstances[0].writes.length, 1);
  await view.cleanup();
});

test("WS 非正常关闭也走 reconnecting，不冒充退出", async () => {
  globalThis.__terminalTokenMode = "ok";
  const view = await mountTerminal("sid_2");
  await view.emitClose(0);
  assert.equal(view.probe().getAttribute("data-status"), "reconnecting");
  assert.equal(view.probe().getAttribute("data-detail"), "");
  await view.cleanup();
});

test("error session_not_found → gone（节点说会话没了）", async () => {
  globalThis.__terminalTokenMode = "ok";
  const view = await mountTerminal("sid_3");
  await view.emit(0, { t: "error", code: "session_not_found" });
  assert.equal(await until(() => view.probe().getAttribute("data-status") === "gone"), true);
  assert.equal(FakeSocket.instances[0].readyState, 3);
  await view.cleanup();
});

test("重连时拿不到令牌：保持 reconnecting，不谎报结束也不黑屏装活", async () => {
  globalThis.__terminalTokenMode = "second-fails";
  const view = await mountTerminal("sid_9");
  await view.emit(0, { t: "detached", reason: "transport" });
  assert.equal(view.probe().getAttribute("data-status"), "reconnecting");
  // 1s 退避到期后尝试重连，令牌拿不到 → reconnect_failed → 继续退避，仍 reconnecting。
  await sleepReal(1400);
  assert.equal(FakeSocket.instances.length, 1);
  assert.equal(view.probe().getAttribute("data-status"), "reconnecting");
  await view.cleanup();
});

test("旧 Shell 外壳已退役，只保留服务器页重定向且没有结束/对话入口", () => {
  const source = readFileSync(resolve(repo, "src/shell/cloud-computer/ShellTaskView.tsx"), "utf8");
  assert.match(source, /serverPageHref/);
  assert.match(source, /card:\s*"terminal"/);
  assert.match(source, /router\.replace\(target\)/);
  assert.equal(source.includes("data-oceanleo-cc-end-shell"), false);
  assert.equal(source.includes("data-oceanleo-cc-agent-dialog"), false);
  assert.equal(source.includes("data-oceanleo-cc-leo-toggle"), false);
  assert.equal(source.includes("onOpenLeo"), false);
  assert.equal(source.includes("LeoAgentPanel"), false);
  assert.equal(source.includes("openLeoAssistant"), false);
});

test("结束与断线句接进外壳词典，17 个语种全 key", () => {
  const aggregator = readFileSync(
    resolve(repo, "src/i18n/ui/messages/shell-overhaul-copy.ts"),
    "utf8",
  );
  assert.equal(aggregator.includes('from "./shell-ended-copy"'), true);
  assert.equal(aggregator.includes("SHELL_ENDED_MESSAGES"), true);
  const keys = [
    "missingSession",
    "endedExit",
    "endedGone",
    "reconnecting",
    "connectionLost",
    "retryConnection",
  ];
  const locales = Object.keys(SHELL_ENDED_MESSAGES);
  assert.equal(locales.length, 17);
  for (const locale of locales) {
    const table = SHELL_ENDED_MESSAGES[locale];
    for (const key of keys) {
      const zh = SHELL_ENDED_ZH[key];
      assert.equal(typeof table[zh], "string", `${locale} 缺 ${key}`);
      assert.notEqual(table[zh].length, 0, `${locale} 的 ${key} 是空串`);
    }
    assert.equal(table[SHELL_ENDED_ZH.endedExit].includes("{code}"), true);
    assert.notEqual(table[SHELL_ENDED_ZH.missingSession], table[SHELL_ENDED_ZH.endedExit]);
    assert.notEqual(table[SHELL_ENDED_ZH.endedGone], table[SHELL_ENDED_ZH.endedExit]);
  }
  assert.equal(
    SHELL_ENDED_MESSAGES.en[SHELL_ENDED_ZH.endedGone],
    "This Shell no longer exists.",
  );
});
