// R2 (2026-10-30 redo): the composer's Device control is the only switcher.
// Computer → OceanLeo / Codex / Claude Code / Cursor / Hermes / 终端, agent →
// 对话 / 命令行, all inside the existing ComputerDock popover. The dock only
// emits a ConversationTarget: it never creates a session or navigates.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent,
  CustomEvent: window.CustomEvent, localStorage: window.localStorage, PointerEvent: window.PointerEvent || window.MouseEvent,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
class NoopResizeObserver { observe() {} disconnect() {} unobserve() {} }
globalThis.ResizeObserver = NoopResizeObserver;
window.ResizeObserver = NoopResizeObserver;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(`export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }`);
const popoverStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AnchoredPopover({ open, children, panelRef }) {
    if (!open) return null;
    return React.createElement("div", { ref: panelRef, "data-anchored-popover": "1" }, children);
  }
`);

const { ComputerDock } = await import(await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
  "../../i18n/ui/useUI": uiStub,
  "../../contracts/domain-family": dataModule(`export function portalHref(path) { return path; }`),
  "../../lib/cloud-computer-api": dataModule(`
    export const cloudComputerApi = {};
    export function writeMountedComputerId(id) { globalThis.__cdMounted = id || ""; }
    export function writeMountedComputerName() {}
  `),
  // Any runtime use of the session API from the dock is a regression.
  "../../lib/computer-task-api": dataModule(`
    export async function createComputerTaskSession() { globalThis.__cdCreates = (globalThis.__cdCreates || 0) + 1; throw new Error("dock must not create"); }
    export async function listComputerTaskSessions() { globalThis.__cdCreates = (globalThis.__cdCreates || 0) + 1; return { sessions: [] }; }
  `),
  "../../api/devices": dataModule(`export async function listDevices() { return { ok: true, data: globalThis.__cdDevices || [] }; }`),
  "../../lib/auth/client": dataModule(`export async function getUserId() { return "account-a"; }`),
  "../../lib/cloud-agent-api": dataModule(`export async function listCloudAgentAvailability() { return { kind: "absent" }; }`),
  "../anchored-popover": popoverStub,
  "next/navigation": dataModule(`export function useRouter() { return { push(href) { (globalThis.__cdPushes ||= []).push(href); }, replace() {}, refresh() {}, back() {} }; }`),
}));
const { readExecutionTarget, writeExecutionTarget } = await import("../src/lib/execution-target.ts");

function computer(overrides = {}) {
  return { id: "cc_1", name: "elon", source: "aliyun", status: "running", edition: "com", node_online: true,
    enrolled_at: "2026-09-20T00:00:00Z", confirmed_at: "2026-09-20T00:00:00Z", created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", ...overrides };
}
function session(overrides) {
  return { id: "s", task_id: "t1", computer_id: "cc_1", computer_name: "elon", kind: "acp", program: "codex", native_session_id: null,
    created_at: "2026-10-30T00:00:00Z", updated_at: "2026-10-30T00:00:00Z", sync_status: "saved", ...overrides };
}
function client(programs = [{ id: "codex", installed: true }, { id: "claude", installed: false }, { id: "cursor", installed: true, logged_in: false }, { id: "hermes", installed: true }]) {
  return {
    async listComputers() { return { items: [] }; },
    async listCliPrograms() { globalThis.__cdProgramReads = (globalThis.__cdProgramReads || 0) + 1; return { programs: programs.map((row) => ({ label: row.id, version: "", supports_resume: true, options: [], ...row })) }; },
  };
}
async function flush(count = 8) { for (let i = 0; i < count; i += 1) await act(async () => {}); }

test.beforeEach(() => { window.localStorage.clear(); globalThis.__cdCreates = 0; globalThis.__cdPushes = []; globalThis.__cdDevices = []; globalThis.__cdProgramReads = 0; });

async function renderDock(props = {}) {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  const picks = [];
  const render = async (next = {}) => {
    Object.assign(props, next);
    await act(async () => root.render(React.createElement(ComputerDock, { client: client(), computers: [computer()], onConversationChange: (c) => picks.push(c), ...props })));
    await flush();
  };
  await render();
  const q = (selector) => host.querySelector(selector);
  const click = async (node) => { assert.ok(node, "expected control"); await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await flush(); };
  return {
    host, picks, q, click, render,
    trigger: () => q("[data-oceanleo-cc-dock-trigger]"),
    async open() { await click(q("[data-oceanleo-cc-dock-trigger]")); },
    // Opens at the current computer's list when a native conversation is shown; otherwise drill in.
    async openComputer(id = "cc_1") {
      await click(q("[data-oceanleo-cc-dock-trigger]"));
      if (q(`[data-dock-computer="${id}"]`)) return;
      await click(q(`[data-oceanleo-cc-switch-item="${id}"]`));
    },
    async cleanup() { await act(async () => root.unmount()); host.remove(); },
  };
}

test("computer → Codex → 对话 emits a native chat target; 命令行 emits cli; the dock never creates or navigates", async () => {
  const view = await renderDock();
  try {
    await view.openComputer();
    const level = view.q('[data-dock-level="computer"]');
    assert.ok(level, "the computer's own list opens inside the same popover");
    assert.deepEqual([...level.querySelectorAll("[data-dock-program-row]")].map((n) => n.getAttribute("data-dock-program-row")),
      ["oceanleo", "codex", "claude", "cursor", "hermes", "terminal"]);
    assert.match(view.q("[data-dock-back]").textContent, /elon/);
    await view.click(view.q('[data-dock-program-row="codex"]'));
    assert.ok(view.q('[data-dock-level="program"][data-dock-program="codex"]'));
    assert.deepEqual([...view.host.querySelectorAll("[data-dock-view]")].map((n) => n.getAttribute("data-dock-view")), ["chat", "cli"], "对话 first");
    assert.match(view.q('[data-dock-view="cli"]').textContent, /命令行.*记录和对话分开/);
    await view.click(view.q('[data-dock-view="chat"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" });
    assert.equal(view.q("[data-anchored-popover]"), null, "picking closes the menu");
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="codex"]'));
    await view.click(view.q('[data-dock-view="cli"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "cli" });
    assert.equal(globalThis.__cdCreates, 0);
    assert.deepEqual(globalThis.__cdPushes, []);
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "cloud" }, "a native pick does not move the OceanLeo target");
  } finally { await view.cleanup(); }
});

test("终端 emits a terminal target and OceanLeo emits the existing computer execution target", async () => {
  const targets = [];
  const view = await renderDock({ onTargetChange: (t) => targets.push(t) });
  try {
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="terminal"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "terminal", computerId: "cc_1", computerName: "elon" });
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="oceanleo"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "oceanleo", target: { kind: "computer", id: "cc_1", name: "elon" } });
    assert.deepEqual(targets.at(-1), { kind: "computer", id: "cc_1", name: "elon" });
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "computer", id: "cc_1", name: "elon" });
    assert.equal(globalThis.__cdMounted, "cc_1");
    assert.equal(globalThis.__cdCreates, 0);
    assert.deepEqual(globalThis.__cdPushes, []);
  } finally { await view.cleanup(); }
});

test("program rows show plain status only when not ready; back rows walk up one level", async () => {
  const view = await renderDock();
  try {
    await view.openComputer();
    const text = (id) => view.q(`[data-dock-program-row="${id}"]`).textContent;
    assert.ok(globalThis.__cdProgramReads >= 1);
    assert.doesNotMatch(text("codex"), /未安装|需要登录|离线|已安装/);
    assert.match(text("claude"), /未安装/);
    assert.match(text("cursor"), /需要登录/);
    await view.click(view.q('[data-dock-program-row="hermes"]'));
    assert.match(view.q("[data-dock-back]").textContent, /Hermes/);
    await view.click(view.q("[data-dock-back]"));
    assert.ok(view.q('[data-dock-level="computer"]'));
    await view.click(view.q("[data-dock-back]"));
    assert.ok(view.q('[data-oceanleo-cc-switch-item="cc_1"]'), "back to the computer list");
    assert.doesNotMatch(view.host.textContent, /图形|独立 CLI|ACP|Conversation|用此电脑执行/);
  } finally { await view.cleanup(); }
});

test("existing task conversations are marked and reused by sessionId", async () => {
  const taskSessions = [
    session({ id: "acp-old", kind: "acp", program: "codex", updated_at: "2026-10-30T01:00:00Z" }),
    session({ id: "acp-new", kind: "acp", program: "codex", updated_at: "2026-10-30T02:00:00Z" }),
    session({ id: "term-1", kind: "terminal", program: null }),
    session({ id: "other-pc", computer_id: "cc_2", kind: "cli", program: "claude" }),
  ];
  const conversation = { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat", sessionId: "acp-new" };
  const view = await renderDock({ taskSessions, conversation });
  try {
    assert.equal(view.trigger().textContent, "elon · Codex");
    await view.open();
    assert.ok(view.q('[data-dock-level="computer"]'), "opens at the current computer's list");
    const codex = view.q('[data-dock-program-row="codex"]');
    assert.equal(codex.getAttribute("aria-pressed"), "true");
    assert.match(codex.textContent, /✓/);
    assert.ok(view.q('[data-dock-program-row="terminal"] [data-dock-exists]'), "terminal exists in this task");
    assert.equal(view.q('[data-dock-program-row="claude"] [data-dock-exists]'), null, "another computer's session is not this one's");
    await view.click(codex);
    assert.match(view.q('[data-dock-view="chat"]').textContent, /✓/);
    assert.equal(view.q('[data-dock-view="cli"] [data-dock-exists]'), null);
    await view.click(view.q('[data-dock-view="chat"]'));
    assert.deepEqual(view.picks.at(-1), { ...conversation, sessionId: "acp-new" }, "the most recent one is reused");
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="terminal"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "terminal", computerId: "cc_1", computerName: "elon", sessionId: "term-1" });
    assert.equal(globalThis.__cdCreates, 0);
  } finally { await view.cleanup(); }
});

test("trigger label follows the conversation", async () => {
  const view = await renderDock({ conversation: { kind: "native", computerId: "cc_1", computerName: "elon", program: "claude", view: "cli" } });
  try {
    assert.equal(view.trigger().textContent, "elon · Claude Code · 命令行");
    await view.render({ conversation: { kind: "terminal", computerId: "cc_1", computerName: "elon" } });
    assert.equal(view.trigger().textContent, "elon · 终端");
    await view.render({ conversation: { kind: "oceanleo", target: { kind: "cloud" } } });
    assert.equal(view.trigger().textContent, "云端");
  } finally { await view.cleanup(); }
});

test("bound task: the OceanLeo target stays locked but native conversations can be added", async () => {
  writeExecutionTarget("account-a", { kind: "device", id: "mac", name: "Remembered Mac" });
  globalThis.__cdDevices = [{ device_id: "mac", platform: "macos", device_name: "Remembered Mac", online: true, availability: "online" }];
  const bound = { kind: "computer", id: "cc_1", name: "elon" };
  const targets = [];
  const view = await renderDock({ boundTarget: bound, onTargetChange: (t) => targets.push(t), computers: [computer(), computer({ id: "cc_2", name: "second" })] });
  try {
    assert.equal(view.trigger().textContent, "elon", "the task's target, not the remembered draft one");
    assert.match(view.trigger().getAttribute("title"), /新任务/);
    await view.open();
    const cloud = [...view.host.querySelectorAll("button")].find((b) => b.textContent.startsWith("默认云端"));
    assert.equal(cloud.disabled, true);
    assert.match(cloud.getAttribute("title"), /新建任务/);
    await view.click(view.q('[data-oceanleo-cc-switch-item="cc_2"]'));
    assert.equal(view.q('[data-dock-program-row="oceanleo"]').disabled, true, "another computer cannot take over this task");
    assert.equal(view.q('[data-dock-program-row="codex"]').disabled, false);
    await view.click(view.q('[data-dock-program-row="codex"]'));
    await view.click(view.q('[data-dock-view="chat"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "native", computerId: "cc_2", computerName: "second", program: "codex", view: "chat" });
    await view.render({ conversation: view.picks.at(-1) });
    await view.open();
    await view.click(view.q("[data-dock-back]"));
    const local = [...view.host.querySelectorAll("button")].find((b) => b.getAttribute("aria-expanded") !== null && b.textContent.includes("本地电脑"));
    await view.click(local);
    assert.equal(view.q('[data-oceanleo-device-client="mac"]').disabled, true, "local devices are locked too");
    const cloudGroup = [...view.host.querySelectorAll("button")].find((b) => b.getAttribute("aria-expanded") !== null && b.textContent.includes("云端"));
    await view.click(cloudGroup);
    await view.click(view.q('[data-oceanleo-cc-switch-item="cc_1"]'));
    const ocean = view.q('[data-dock-program-row="oceanleo"]');
    assert.equal(ocean.disabled, false);
    assert.ok(ocean.querySelector("[data-dock-exists]"), "the task's OceanLeo conversation is marked as existing");
    await view.click(ocean);
    assert.deepEqual(view.picks.at(-1), { kind: "oceanleo", target: bound }, "switching back to the task's OceanLeo conversation");
    assert.deepEqual(targets, [], "a bound task never reports a new target");
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "device", id: "mac", name: "Remembered Mac" });
  } finally { await view.cleanup(); }
});

test("without onConversationChange a computer row is a plain execution choice (no drill-down)", async () => {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(ComputerDock, { client: client(), computers: [computer()] })));
    await flush();
    await act(async () => host.querySelector("[data-oceanleo-cc-dock-trigger]").dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await flush();
    await act(async () => host.querySelector('[data-oceanleo-cc-switch-item="cc_1"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await flush();
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "computer", id: "cc_1", name: "elon" });
    assert.equal(host.querySelector("[data-dock-program-row]"), null);
    assert.equal(globalThis.__cdProgramReads, 0);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test("dock source: no session creation, no navigation besides Manage devices, no emoji glyphs", () => {
  const source = readFileSync(new URL("../src/shell/cloud-computer/ComputerDock.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /createComputerTaskSession|computerSession=|\/tasks\//);
  assert.equal(source.match(/router\.push\(/g)?.length, 1);
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2699}]/u);
});

// ── LeoComposer + ConversationBar ────────────────────────────────────────────

const lazyStub = dataModule("const noop = () => undefined;\nexport default new Proxy(noop, { get: () => noop });\nexport const __stub = true;\n");
const dockStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ComputerDock(props) { globalThis.__cdDockProps = props; return React.createElement("button", { type: "button", "data-oceanleo-cc-dock-trigger": "" }, "dock"); }
`);
const { LeoComposer } = await import(await compileModule("src/shell/LeoComposer.tsx", {
  "../i18n/ui/useUI": uiStub,
  "./composer-skill-slash": dataModule(`export function useComposerSkillSlash(){ return { onKeyDown: () => false, popover: null }; } export function composerSlashAdapter(){ return {}; }`),
  "./usePluginsCatalog": dataModule(`export const PLUGINS_SETTINGS_HREF = "/settings/plugins"; export function buildPopoverConnectors(){ return []; } export function usePluginsCatalog(){ return { items: [], loading: false, orgs: [], orgConnections: [] }; }`),
  "../lib/auth": dataModule("export async function getUserEmail(){ return null; }"),
  "../pages/AuthDialog": dataModule("export function AuthDialog(){ return null; }"),
  "./cloud-computer/ComputerDock": dockStub,
  "./ModelPicker": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ModelGroupPicker(){ return React.createElement("span", { "data-model-group-picker": "" }); }`),
  "./PayerSelector": dataModule("export function PayerSelector(){ return null; }"),
  "./mcp-apps": dataModule("export function ComposerAppsBar(){ return null; }"),
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const TemplateFillArea = forwardRef(function TemplateFillArea(props, _ref){
      return createElement("textarea", { "data-editor": "", value: props.value || "", readOnly: true, onKeyDown: props.onKeyDown });
    });
    export const PromptHighlightArea = TemplateFillArea;
  `),
}, { missingPackageStub: lazyStub }));
const { ConversationBar } = await import(await compileModule("src/shell/cloud-computer/ConversationBar.tsx", {
  "../../i18n/ui/useUI": uiStub,
  "./ComputerDock": dockStub,
}));

async function mount(element) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    async rerender(next) { await act(async () => root.render(next)); },
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}
const composerBase = { value: "hi", onChange() {}, onSubmit() {}, showPlugins: false, showAppsBar: false, showPayerSelector: false };
const NATIVE = { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" };

test("LeoComposer: the gear shows only for native / terminal conversations and opens settings", async () => {
  let opened = 0;
  const props = { ...composerBase, onOpenSettings: () => { opened += 1; }, onConversationChange() {}, taskSessions: [session({ id: "x" })] };
  const m = await mount(React.createElement(LeoComposer, { ...props, conversation: { kind: "oceanleo", target: { kind: "cloud" } } }));
  try {
    assert.equal(m.container.querySelector("[data-conversation-settings]"), null);
    assert.deepEqual(globalThis.__cdDockProps.taskSessions, props.taskSessions, "taskSessions reach the dock");
    assert.equal(typeof globalThis.__cdDockProps.onConversationChange, "function");
    await m.rerender(React.createElement(LeoComposer, { ...props, conversation: NATIVE, settingsOpen: true }));
    const gear = m.container.querySelector("[data-conversation-settings]");
    assert.ok(gear);
    assert.equal(gear.getAttribute("aria-pressed"), "true");
    assert.equal(gear.getAttribute("aria-label"), "设置");
    assert.ok(gear.querySelector("svg"), "an icon button, not a text button");
    const toolbar = m.container.querySelector("[data-composer-bottom-toolbar]");
    const dock = toolbar.querySelector("[data-oceanleo-cc-dock-trigger]");
    assert.equal(dock.nextElementSibling, gear, "right after the Device control");
    await act(async () => gear.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(opened, 1);
    await m.rerender(React.createElement(LeoComposer, { ...props, conversation: { kind: "terminal", computerId: "cc_1", computerName: "elon" } }));
    assert.ok(m.container.querySelector("[data-conversation-settings]"));
    await m.rerender(React.createElement(LeoComposer, { ...composerBase, conversation: NATIVE }));
    assert.equal(m.container.querySelector("[data-conversation-settings]"), null, "no gear without onOpenSettings");
    assert.equal(globalThis.__cdDockProps.onConversationChange, undefined, "no drill-down for hosts that cannot switch");
  } finally { await m.unmount(); }
});

test("LeoComposer: modelPickerSlot replaces ModelGroupPicker; null hides it", async () => {
  const m = await mount(React.createElement(LeoComposer, composerBase));
  try {
    assert.ok(m.container.querySelector("[data-model-group-picker]"));
    await m.rerender(React.createElement(LeoComposer, { ...composerBase, modelPickerSlot: React.createElement("span", { "data-native-model": "" }) }));
    assert.equal(m.container.querySelector("[data-model-group-picker]"), null);
    assert.ok(m.container.querySelector("[data-native-model]"));
    await m.rerender(React.createElement(LeoComposer, { ...composerBase, modelPickerSlot: null }));
    assert.equal(m.container.querySelector("[data-model-group-picker]"), null);
  } finally { await m.unmount(); }
});

test("ConversationBar: composer bottom-bar row with the same Device control and gear", async () => {
  let opened = 0; const picks = [];
  const props = { conversation: NATIVE, onConversationChange: (c) => picks.push(c), taskSessions: [], boundTarget: { kind: "cloud" }, onOpenSettings: () => { opened += 1; }, settingsOpen: false };
  const m = await mount(React.createElement(ConversationBar, props));
  try {
    const bar = m.container.querySelector("[data-conversation-bar]");
    assert.ok(bar);
    assert.match(bar.className, /flex items-center justify-between px-4 pb-3\.5/);
    assert.ok(bar.querySelector("[data-oceanleo-cc-dock-trigger]"));
    assert.deepEqual(globalThis.__cdDockProps.boundTarget, { kind: "cloud" });
    assert.equal(globalThis.__cdDockProps.conversation, NATIVE);
    globalThis.__cdDockProps.onConversationChange({ kind: "oceanleo", target: { kind: "cloud" } });
    assert.deepEqual(picks, [{ kind: "oceanleo", target: { kind: "cloud" } }]);
    const gear = bar.querySelector("[data-conversation-settings]");
    assert.equal(gear.getAttribute("aria-pressed"), "false");
    await act(async () => gear.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(opened, 1);
    await m.rerender(React.createElement(ConversationBar, { ...props, conversation: { kind: "oceanleo", target: { kind: "cloud" } } }));
    assert.equal(m.container.querySelector("[data-conversation-settings]"), null);
  } finally { await m.unmount(); }
});
