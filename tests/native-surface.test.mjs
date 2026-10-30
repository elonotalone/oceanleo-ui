// R4 (2026-10-30 redo): task-page computer surfaces use the host UI system.
// NativeTerminalSurface = xterm only in a host frame (no program strip, no
// session sidebar, no server-page tone); NativeSettingsPanel = scoped groups in
// host style for native chat / CLI / terminal.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/tasks/t_1",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const uiStub = dataModule(`
  export function useUI() { return (value, values) => !values ? value : Object.entries(values).reduce(
    (text, [key, replacement]) => text.replaceAll("{" + key + "}", String(replacement)), value); }
`);
const terminalStub = dataModule(`
  export function useComputerTerminal(input) {
    (globalThis.__terminalCalls ||= []).push(input);
    return { hostRef: { current: null }, ready: true, status: globalThis.__terminalStatus || "live",
      retry() {}, sendText() {}, tail() { return ""; } };
  }
`);
const keyApiStub = dataModule(`
  export class ProgramKeyError extends Error { constructor(code, message) { super(message); this.code = code; } }
  export async function saveProgramKey(...args) { (globalThis.__keyCalls ||= []).push(["save", ...args]); }
  export async function removeProgramKey(...args) { (globalThis.__keyCalls ||= []).push(["remove", ...args]); }
`);
const stubs = {
  "../../../lib/cloud-computer-api": dataModule("export const cloudComputerApi = {};"),
  "../../../i18n/ui/useUI": uiStub,
  "../TerminalPanel": terminalStub,
  "../agent-dialog/program-key-api": keyApiStub,
};
const surface = await import(await compileModule("src/shell/cloud-computer/native-surface/index.ts", stubs));
const { NativeTerminalSurface, NativeSettingsPanel, nativeSettingsTitle } = surface;

async function flush(count = 8) {
  for (let index = 0; index < count; index += 1) await act(async () => {});
}

function mount(Component, props) {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  let current = props;
  return {
    host,
    async render(next = {}) {
      current = { ...current, ...next };
      await act(async () => root.render(React.createElement(Component, current)));
      await flush();
    },
    $(selector) { return host.querySelector(selector); },
    text() { return host.textContent || ""; },
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
}

const COMPUTER = { id: "cc_1", name: "elon", node_online: true, status: "running" };

function taskSession(overrides = {}) {
  return {
    id: "ts_1", task_id: "t_1", computer_id: "cc_1", computer_name: "elon", kind: "terminal", program: null,
    native_session_id: null, created_at: "", updated_at: "", sync_status: "saved", ...overrides,
  };
}

function record(id, overrides = {}) {
  return { id, title: id, created_at: "", alive: true, ended_at: null, exit_code: null, end_reason: null, kind: "shell", program: null, cwd: null, record_bytes: 0, ...overrides };
}

function client(overrides = {}) {
  const calls = { open: [], launch: [], programs: 0, settings: 0, patch: [], tools: [], getTools: 0 };
  return {
    calls,
    async openTerminalSession(id, body) { calls.open.push({ id, body }); return { session: record(`t-${calls.open.length}`) }; },
    async listCliPrograms() { calls.programs += 1; return { programs: overrides.programs ?? [{ id: "codex", label: "Codex", installed: true, version: "1", supports_resume: true, options: [] }] }; },
    async getAgentSettings() { calls.settings += 1; return { confirm_dangerous: true, oceanleo_tools: true, billing_paused: false }; },
    async patchAgentSettings(id, patch) { calls.patch.push({ id, patch }); return { confirm_dangerous: true, oceanleo_tools: true, billing_paused: false, ...patch }; },
    async launchCli(id, body) { calls.launch.push({ id, body }); return { session: record(`cli-${calls.launch.length}`, { kind: "cli", program: body.program }) }; },
    async getCliTools() { calls.getTools += 1; return { programs: { cursor: false, claude: false, codex: false } }; },
    async setCliTools(id, program, enabled) { calls.tools.push({ id, program, enabled }); return { ok: true, program, enabled }; },
  };
}

function assertHostChrome(view) {
  const html = view.host.innerHTML;
  assert.doesNotMatch(html, /zinc-/, "no server-page zinc palette");
  assert.equal(view.$("[data-oceanleo-program-strip]"), null, "no program strip");
  assert.equal(view.$("aside"), null, "no past-session sidebar");
  assert.equal(view.$("[data-oceanleo-terminal-card],[data-oceanleo-cli-card]"), null, "not the Computers-page card");
  assert.equal(view.$("[data-oceanleo-cli-settings-overlay],[data-oceanleo-terminal-appearance-overlay]"), null, "no in-card settings overlay");
}

test("terminal surface opens once, binds once, then attaches xterm; stays mounted while hidden", async () => {
  globalThis.__terminalCalls = [];
  globalThis.__terminalStatus = "live";
  const api = client();
  const binds = [];
  const view = mount(NativeTerminalSurface, { computer: COMPUTER, session: taskSession(), active: true, client: api, onNativeSessionChange: async (id) => { binds.push(id); } });
  try {
    await view.render();
    assert.equal(api.calls.open.length, 1);
    assert.deepEqual(api.calls.open[0].body, { cols: 80, rows: 24, kind: "shell" });
    assert.deepEqual(binds, ["t-1"]);
    const frame = view.$('[data-oceanleo-native-terminal-frame="t-1"]');
    assert.ok(frame, "xterm frame attached after binding");
    assert.equal(globalThis.__terminalCalls.at(-1).sessionId, "t-1");
    assertHostChrome(view);

    await view.render({ active: false });
    assert.equal(view.$('[data-oceanleo-native-terminal-frame="t-1"]'), frame, "same node: no remount when hidden");
    assert.equal(globalThis.__terminalCalls.at(-1).active, false);
    await view.render({ active: true });
    assert.equal(view.$('[data-oceanleo-native-terminal-frame="t-1"]'), frame);
    assert.equal(api.calls.open.length, 1, "toggling visibility never opens a new process");
    assert.deepEqual(binds, ["t-1"], "binds the native id once");
  } finally { view.cleanup(); }
});

test("bind failure keeps the process and retry binds the same id without a new process", async () => {
  globalThis.__terminalCalls = [];
  const api = client();
  let attempts = 0;
  const view = mount(NativeTerminalSurface, { computer: COMPUTER, session: taskSession(), active: true, client: api,
    onNativeSessionChange: async () => { attempts += 1; if (attempts === 1) throw new Error("storage unavailable"); } });
  try {
    await view.render();
    assert.equal(view.$("[data-oceanleo-native-terminal-frame]"), null, "no attach before the binding is saved");
    assert.match(view.text(), /没能把它保存到这个任务，请重试。/);
    await act(async () => view.$("[data-oceanleo-native-surface-retry]").click());
    await flush();
    assert.equal(api.calls.open.length, 1);
    assert.equal(attempts, 2);
    assert.ok(view.$('[data-oceanleo-native-terminal-frame="t-1"]'));
  } finally { view.cleanup(); }
});

test("existing native id attaches directly; offline shows one plain line and opens nothing", async () => {
  globalThis.__terminalCalls = [];
  const api = client();
  const binds = [];
  const bound = mount(NativeTerminalSurface, { computer: COMPUTER, session: taskSession({ native_session_id: "t-old" }), active: true, client: api, onNativeSessionChange: (id) => binds.push(id) });
  try {
    await bound.render();
    assert.ok(bound.$('[data-oceanleo-native-terminal-frame="t-old"]'));
    assert.equal(api.calls.open.length, 0);
    assert.deepEqual(binds, []);
  } finally { bound.cleanup(); }

  globalThis.__terminalCalls = [];
  const offline = mount(NativeTerminalSurface, { computer: { ...COMPUTER, node_online: false }, session: taskSession({ native_session_id: "t-old" }), active: true, client: api });
  try {
    await offline.render();
    assert.ok(offline.$("[data-oceanleo-native-surface-offline]"));
    assert.equal(offline.text().trim(), "这台电脑离线。终端内容不会保存，联网后可重新打开。");
    assert.equal(offline.$("[data-oceanleo-card-xterm]"), null, "no fake saved terminal history");
    assert.equal(globalThis.__terminalCalls.length, 0);
    assertHostChrome(offline);
  } finally { offline.cleanup(); }
});

test("ended terminal offers an explicit reopen in host style", async () => {
  globalThis.__terminalCalls = [];
  globalThis.__terminalStatus = "exit";
  const api = client();
  const binds = [];
  const view = mount(NativeTerminalSurface, { computer: COMPUTER, session: taskSession({ native_session_id: "t-old" }), active: true, client: api, onNativeSessionChange: (id) => binds.push(id) });
  try {
    await view.render();
    assert.match(view.text(), /这个终端已结束。/);
    assert.equal(api.calls.open.length, 0, "an ended terminal is never reopened automatically");
    globalThis.__terminalStatus = "live";
    await act(async () => view.$("[data-oceanleo-native-surface-reopen]").click());
    await flush();
    assert.equal(api.calls.open.length, 1);
    assert.deepEqual(binds, ["t-1"]);
    assert.ok(view.$('[data-oceanleo-native-terminal-frame="t-1"]'));
  } finally { view.cleanup(); globalThis.__terminalStatus = "live"; }
});

test("CLI surface launches the session program with stored options; missing program says so plainly", async () => {
  globalThis.__terminalCalls = [];
  const api = client();
  const binds = [];
  const view = mount(NativeTerminalSurface, { computer: COMPUTER, session: taskSession({ kind: "cli", program: "codex" }), active: true, client: api, onNativeSessionChange: (id) => binds.push(id) });
  try {
    await view.render();
    assert.equal(api.calls.launch.length, 1);
    assert.equal(api.calls.launch[0].body.program, "codex");
    assert.equal(api.calls.launch[0].body.options.confirm_dangerous, true);
    assert.deepEqual(binds, ["cli-1"]);
    assert.ok(view.$('[data-oceanleo-native-terminal-frame="cli-1"]'));
    assertHostChrome(view);
  } finally { view.cleanup(); }

  const missingApi = client({ programs: [{ id: "codex", label: "Codex", installed: false, version: null, supports_resume: false, options: [] }] });
  const missing = mount(NativeTerminalSurface, { computer: COMPUTER, session: taskSession({ id: "ts_2", kind: "cli", program: "codex" }), active: true, client: missingApi });
  try {
    await missing.render();
    assert.equal(missingApi.calls.launch.length, 0);
    assert.match(missing.text(), /这台电脑还没有安装 Codex。/);
  } finally { missing.cleanup(); }
});

test("inactive new surface waits until shown before opening anything", async () => {
  const api = client();
  const view = mount(NativeTerminalSurface, { computer: COMPUTER, session: taskSession(), active: false, client: api });
  try {
    await view.render();
    assert.equal(api.calls.open.length, 0);
    await view.render({ active: true });
    assert.equal(api.calls.open.length, 1);
  } finally { view.cleanup(); }
});

test("nativeSettingsTitle names the program or terminal and the computer", () => {
  const tt = (value, values) => !values ? value : Object.entries(values).reduce((text, [key, v]) => text.replaceAll(`{${key}}`, String(v)), value);
  assert.equal(nativeSettingsTitle({ kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" }, tt), "Codex 设置 · elon");
  assert.equal(nativeSettingsTitle({ kind: "native", computerId: "cc_1", computerName: "elon", program: "claude", view: "cli" }, tt), "Claude Code 设置 · elon");
  assert.equal(nativeSettingsTitle({ kind: "terminal", computerId: "cc_1", computerName: "elon" }, tt), "终端设置 · elon");
});

function fakeDialog(overrides = {}) {
  const calls = { model: [], mode: [], login: [], install: [] };
  return {
    calls,
    dialog: {
      programs: [{ id: "codex", installed: true, path: "", version: "0.9", auth: "none", logged_in: false, dir_capability: "full", running: false }],
      models: [{ id: "a", name: "Model A" }, { id: "b", name: "Model B" }],
      selectedModel: "a",
      setSelectedModel: (id) => calls.model.push(id),
      mode: { id: "mode", name: "模式", options: [{ value: "ask", name: "Ask" }, { value: "agent", name: "Agent" }] },
      selectedMode: "ask",
      setMode: (value) => calls.mode.push(value),
      configOptions: [],
      setConfig() {},
      login: { open: false, program: null, phase: "idle", url: "", code: "", needsCode: false, codeDraft: "", hint: "", failed: "", pending: false },
      install: { open: false, program: null, dir: "", running: false, lines: [], donePath: "", failedText: "" },
      messages: [],
      openLogin: (program) => calls.login.push(program),
      openInstall: (program) => calls.install.push(program),
      closeLogin() {}, cancelLogin() {}, submitLoginCode() {}, setLoginCodeDraft() {},
      closeInstall() {}, setInstallDir() {}, startInstall() {},
      logoutProgram() {}, retryConnect() {},
      ...overrides,
    },
  };
}

function groups(view) {
  return [...view.host.querySelectorAll("[data-oceanleo-native-settings-group]")].map((node) => [
    node.getAttribute("data-oceanleo-native-settings-group"),
    node.querySelector("h3")?.textContent,
  ]);
}

test("native chat settings: scoped groups, model change goes to the dialog, machine toggle hits the settings API", async () => {
  const api = client();
  const { dialog, calls } = fakeDialog();
  const view = mount(NativeSettingsPanel, { computer: COMPUTER, conversation: { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" }, dialog, client: api });
  try {
    await view.render();
    assert.deepEqual(groups(view), [
      ["conversation", "本对话"],
      ["program", "这台电脑上的 Codex"],
      ["computer", "整台电脑（所有程序）"],
    ]);
    const select = view.$("[data-oceanleo-native-settings-model]");
    select.value = "b";
    await act(async () => select.dispatchEvent(new window.Event("change", { bubbles: true })));
    assert.deepEqual(calls.model, ["b"]);
    const mode = view.$("[data-oceanleo-native-settings-mode]");
    mode.value = "agent";
    await act(async () => mode.dispatchEvent(new window.Event("change", { bubbles: true })));
    assert.deepEqual(calls.mode, ["agent"]);
    assert.equal(view.$("[data-oceanleo-native-program]").getAttribute("data-state"), "signed_out");
    await act(async () => view.$("[data-oceanleo-native-program-login]").click());
    assert.deepEqual(calls.login, ["codex"]);
    await act(async () => view.$('[data-oceanleo-native-setting="confirm_dangerous"]').click());
    await flush();
    assert.deepEqual(api.calls.patch, [{ id: "cc_1", patch: { confirm_dangerous: false } }]);
    assert.match(view.text(), /下次打开时生效/);
    assert.doesNotMatch(view.host.innerHTML, /zinc-/);
    assert.doesNotMatch(view.text(), /图形|独立 CLI|ACP|Conversation/);
  } finally { view.cleanup(); }
});

test("native chat login flow renders inline in host style", async () => {
  const { dialog } = fakeDialog({ login: { open: true, program: "codex", phase: "waiting", url: "https://auth.example/login", code: "", needsCode: false, codeDraft: "", hint: "", failed: "", pending: false } });
  const view = mount(NativeSettingsPanel, { computer: COMPUTER, conversation: { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" }, dialog, client: client() });
  try {
    await view.render();
    const open = view.$("[data-oceanleo-native-login-open]");
    assert.equal(open.getAttribute("href"), "https://auth.example/login");
    assert.doesNotMatch(open.className, /underline/);
    assert.doesNotMatch(view.host.innerHTML, /zinc-/);
  } finally { view.cleanup(); }
});

test("CLI settings: program group (next-launch defaults + tools) and shared appearance group", async () => {
  const api = client({ programs: [{ id: "codex", label: "Codex", installed: true, version: "1", supports_resume: true, options: [{ key: "sandbox", label: "Sandbox", type: "bool", default: false }] }] });
  const view = mount(NativeSettingsPanel, { computer: COMPUTER, conversation: { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "cli" }, client: api });
  try {
    await view.render();
    assert.deepEqual(groups(view), [
      ["program", "这台电脑上的 Codex"],
      ["appearance", "终端外观（命令行和终端共用）"],
    ]);
    assert.match(view.text(), /这些设置将在下一次启动时生效。/);
    assert.ok(view.$("[data-oceanleo-terminal-appearance]"));
    await act(async () => view.$('[data-oceanleo-cli-tools="codex"]').click());
    await flush();
    assert.deepEqual(api.calls.tools, [{ id: "cc_1", program: "codex", enabled: true }]);
    assert.doesNotMatch(view.host.innerHTML, /zinc-/);
  } finally { view.cleanup(); }
});

test("terminal settings show only the shared appearance group; offline says so once", async () => {
  const view = mount(NativeSettingsPanel, { computer: { ...COMPUTER, node_online: false }, conversation: { kind: "terminal", computerId: "cc_1", computerName: "elon" }, client: client() });
  try {
    await view.render();
    assert.deepEqual(groups(view), [["appearance", "终端外观（命令行和终端共用）"]]);
    assert.ok(view.$("[data-oceanleo-native-settings-offline]"));
    assert.doesNotMatch(view.host.innerHTML, /zinc-/);
  } finally { view.cleanup(); }
});

test("native-surface sources never import the server-page tone palette", () => {
  const dir = new URL("../src/shell/cloud-computer/native-surface/", import.meta.url);
  for (const name of readdirSync(dir)) {
    const source = readFileSync(new URL(name, dir), "utf8");
    assert.doesNotMatch(source, /server-page\/tone|\btone\./, name);
    assert.doesNotMatch(source, /zinc-/, name);
  }
});
