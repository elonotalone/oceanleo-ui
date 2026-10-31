// R4 (2026-10-30 redo): task-page computer surfaces use the host UI system.
// NativeTerminalSurface = xterm only in a host frame (no program strip, no
// session sidebar, no server-page tone). 2026-10-31 night: the gear and its
// right-pane NativeSettingsPanel are gone; the same scoped settings live in the
// composer's model pill (native chat) and the bar's settings pill (CLI / terminal).
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
const reactUrl = pathToFileURL(require.resolve("react")).href;
const popoverStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AnchoredPopover({ open, children, attributes, role }) {
    if (!open) return null;
    return React.createElement("div", { "data-anchored-popover": "1", role, ...(attributes || {}) }, children);
  }
`);
// The settings pills default to cloudComputerApi: route it to the test's client.
const apiStub = dataModule("export const cloudComputerApi = new Proxy({}, { get: (_, key) => globalThis.__api?.[key] });");
const stubs = {
  "../../../lib/cloud-computer-api": apiStub,
  "../../../i18n/ui/useUI": uiStub,
  "../TerminalPanel": terminalStub,
  "../agent-dialog/program-key-api": keyApiStub,
  "../../anchored-popover": popoverStub,
};
const surface = await import(await compileModule("src/shell/cloud-computer/native-surface/index.ts", stubs));
const { NativeTerminalSurface, ComputerConversationSettings } = surface;
const picker = await import(await compileModule("src/shell/native-thread/NativeModelPicker.tsx", {
  "../../lib/cloud-computer-api": apiStub,
  "../../i18n/ui/useUI": uiStub,
  "../anchored-popover": popoverStub,
  "../cloud-computer/agent-dialog/program-key-api": keyApiStub,
}));
const { nativeModelPickerFor, NativeSetupRequest } = picker;

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
    assert.match(view.text(), /没能把这个终端加入任务，请重试。/);
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

function fakeDialog(overrides = {}) {
  const calls = { model: [], mode: [], login: [], install: [], logout: [] };
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
      activeSession: "s1",
      login: { open: false, program: null, phase: "idle", url: "", code: "", needsCode: false, codeDraft: "", hint: "", failed: "", pending: false },
      install: { open: false, program: null, dir: "", running: false, lines: [], donePath: "", failedText: "" },
      messages: [],
      openLogin: (program) => calls.login.push(program),
      openInstall: (program) => calls.install.push(program),
      closeLogin() {}, cancelLogin() {}, submitLoginCode() {}, setLoginCodeDraft() {},
      closeInstall() {}, setInstallDir() {}, startInstall() {},
      logoutProgram: (program) => calls.logout.push(program), retryConnect() {},
      ...overrides,
    },
  };
}

function Pill({ request = 0, ...input }) {
  return React.createElement(NativeSetupRequest.Provider, { value: request },
    React.createElement("div", null, nativeModelPickerFor({ program: "codex", computerId: "cc_1", waiting: false, ...input })));
}

async function click(node) {
  assert.ok(node, "expected control");
  await act(async () => node.click());
  await flush();
}
const rowIds = (view) => [...view.host.ownerDocument.querySelectorAll("[data-composer-setting-row]")].map((node) => node.getAttribute("data-composer-setting-row"));
const sections = (view) => [...view.host.querySelectorAll("[data-composer-settings-section]")].map((node) => node.textContent);

test("native chat pill: this conversation, Codex on this computer and the whole computer, in one menu", async () => {
  const api = client();
  globalThis.__api = api;
  const { dialog, calls } = fakeDialog();
  const view = mount(Pill, { dialog });
  try {
    await view.render();
    assert.equal(api.calls.settings, 0, "nothing read until the menu opens");
    await click(view.$("[data-native-model-trigger]"));
    assert.deepEqual(sections(view), ["本对话", "这台电脑上的 Codex", "整台电脑（所有程序）"]);
    assert.deepEqual(rowIds(view), ["model", "mode", "fast", "account", "computer:confirm_dangerous", "computer:oceanleo_tools"]);
    assert.equal(api.calls.settings, 1, "whole-computer settings read on first open");
    const account = view.$('[data-composer-setting-row="account"]');
    assert.equal(account.getAttribute("data-state"), "signed_out");
    assert.equal(account.querySelector("[data-composer-setting-value]").textContent, "未登录 · 0.9");
    await click(view.$('[data-composer-setting-row="model"]'));
    await click(view.$('[data-composer-setting-choice="model:b"]'));
    assert.deepEqual(calls.model, ["b"]);
    await click(view.$("[data-native-model-trigger]"));
    await click(view.$('[data-composer-setting-row="account"]'));
    assert.ok(view.$('[data-composer-settings-card="account"]'));
    assert.ok(view.$("[data-oceanleo-native-program-key]"), "Key beside sign-in");
    await click(view.$("[data-oceanleo-native-program-login]"));
    assert.deepEqual(calls.login, ["codex"]);
    assert.ok(view.$("[data-composer-settings-menu]"), "an account action keeps the menu open");
    const toggle = view.$('[data-oceanleo-native-setting="confirm_dangerous"]');
    assert.equal(toggle.getAttribute("role"), "menuitemcheckbox");
    assert.equal(toggle.getAttribute("aria-checked"), "true");
    await click(toggle);
    assert.deepEqual(api.calls.patch, [{ id: "cc_1", patch: { confirm_dangerous: false } }]);
    assert.equal(view.$('[data-oceanleo-native-setting="confirm_dangerous"]').getAttribute("aria-checked"), "false");
    assert.match(view.text(), /下次打开时生效/);
    assert.doesNotMatch(view.host.innerHTML, /zinc-/);
  } finally { view.cleanup(); }
});

test("account card: sign out when signed in; the login flow renders inside the card", async () => {
  globalThis.__api = client();
  const signedIn = fakeDialog({ programs: [{ id: "codex", installed: true, path: "", version: "0.90.0", auth: "login", logged_in: true, dir_capability: "full", running: false }] });
  const view = mount(Pill, { dialog: signedIn.dialog });
  try {
    await view.render();
    await click(view.$("[data-native-model-trigger]"));
    assert.equal(view.$('[data-composer-setting-row="account"] [data-composer-setting-value]').textContent, "已登录 · 0.90.0");
    await click(view.$('[data-composer-setting-row="account"]'));
    await click(view.$("[data-oceanleo-native-program-logout]"));
    assert.deepEqual(signedIn.calls.logout, ["codex"]);
  } finally { view.cleanup(); }

  const waiting = fakeDialog({ login: { open: true, program: "codex", phase: "waiting", url: "https://auth.example/login", code: "", needsCode: false, codeDraft: "", hint: "", failed: "", pending: false } });
  const flow = mount(Pill, { dialog: waiting.dialog });
  try {
    await flow.render();
    await click(flow.$("[data-native-model-trigger]"));
    await click(flow.$('[data-composer-setting-row="account"]'));
    const open = flow.$('[data-composer-settings-card="account"] [data-oceanleo-native-login-open]');
    assert.equal(open.getAttribute("href"), "https://auth.example/login");
    assert.doesNotMatch(flow.host.innerHTML, /zinc-/);
  } finally { flow.cleanup(); }
});

test("not installed: the pill still shows (program name) with Install; a held-back send opens the 账号 card", async () => {
  globalThis.__api = client();
  const { dialog, calls } = fakeDialog({
    programs: [{ id: "codex", installed: false, path: "", version: null, auth: "none", logged_in: false, dir_capability: "full", running: false }],
    models: [], mode: null, selectedModel: "",
  });
  const view = mount(Pill, { dialog });
  try {
    await view.render();
    assert.equal(view.$("[data-native-model-summary]").textContent, "Codex");
    assert.equal(view.$("[data-composer-settings-menu]"), null);
    await view.render({ request: 1 });
    assert.ok(view.$('[data-composer-settings-card="account"]'), "the request opens the account card");
    assert.equal(view.$('[data-composer-setting-row="account"]').getAttribute("data-state"), "not_installed");
    await click(view.$("[data-oceanleo-native-program-install]"));
    assert.deepEqual(calls.install, ["codex"]);
  } finally { view.cleanup(); }
});

test("offline: the pill stays, every row read-only with the reason, nothing read", async () => {
  const api = client();
  globalThis.__api = api;
  const { dialog } = fakeDialog();
  const view = mount(Pill, { dialog, online: false });
  try {
    await view.render();
    await click(view.$("[data-native-model-trigger]"));
    assert.ok(view.$("[data-oceanleo-native-settings-offline]"));
    for (const id of ["model", "mode", "account", "computer:confirm_dangerous"]) {
      const row = view.$(`[data-composer-setting-row="${id}"]`);
      assert.equal(row.disabled, true, id);
      assert.match(row.textContent, /这台电脑联网后可以修改。/, id);
    }
    assert.equal(api.calls.settings, 0);
  } finally { view.cleanup(); }
});

test("CLI bar pill: the program's next-launch options, tools switch and the shared appearance card", async () => {
  const api = client({ programs: [{ id: "codex", label: "Codex", installed: true, version: "1", supports_resume: true, options: [{ key: "sandbox", label: "Sandbox", type: "bool", default: false }] }] });
  const view = mount(ComputerConversationSettings, { computer: COMPUTER, conversation: { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "cli" }, client: api });
  try {
    await view.render();
    const trigger = view.$("[data-conversation-settings-pill] > button");
    assert.match(trigger.textContent, /Codex/);
    assert.equal(api.calls.programs, 0, "nothing read until opened");
    await click(trigger);
    assert.deepEqual(sections(view), ["这台电脑上的 Codex", "终端外观（命令行和终端共用）"]);
    assert.deepEqual(rowIds(view), ["cli:next-launch", "cli:sandbox", "cli:confirm_dangerous", "cli:tools", "appearance"]);
    assert.match(view.text(), /这些设置将在下一次启动时生效。/);
    await click(view.$('[data-oceanleo-cli-tools="codex"]'));
    assert.deepEqual(api.calls.tools, [{ id: "cc_1", program: "codex", enabled: true }]);
    await click(view.$('[data-composer-setting-row="appearance"]'));
    assert.ok(view.$('[data-composer-settings-card="appearance"] [data-oceanleo-terminal-appearance]'));
    assert.doesNotMatch(view.host.innerHTML, /zinc-/);
  } finally { view.cleanup(); }
});

test("terminal bar pill: appearance only; offline says so once and appearance stays usable", async () => {
  const view = mount(ComputerConversationSettings, { computer: { ...COMPUTER, node_online: false }, conversation: { kind: "terminal", computerId: "cc_1", computerName: "elon" }, client: client() });
  try {
    await view.render();
    await click(view.$("[data-conversation-settings-pill] > button"));
    assert.deepEqual(rowIds(view), ["offline", "appearance"]);
    assert.equal(view.host.querySelectorAll("[data-oceanleo-native-settings-offline]").length, 1);
    assert.equal(view.$('[data-composer-setting-row="appearance"]').disabled, false);
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
