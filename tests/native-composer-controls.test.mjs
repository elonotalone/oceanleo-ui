// W5 (2026-10-30 task-chat overhaul): composer controls for native programs.
// A Codex / Claude Code conversation never shows the OceanLeo wallet or the
// Lite/Pro/Max tier; its own picker shows model, effort, fast and modes (W7: as
// setting rows behind a model-name pill, each opening a card of choices), with
// fast explained when the current model lacks it, choices persisted per
// program + computer and sent through the controller's setters, and a draft
// (before the first send) shows the picker as soon as the program reports.
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
  export function AnchoredPopover({ open, children, attributes }) {
    if (!open) return null;
    return React.createElement("div", { "data-anchored-popover": "1", ...(attributes || {}) }, children);
  }
`);

const picker = await import(await compileModule("src/shell/native-thread/NativeModelPicker.tsx", {
  "../../i18n/ui/useUI": uiStub,
  "../anchored-popover": popoverStub,
}));
const { NativeModelPicker, nativeModelPickerFor } = picker;

async function flush(count = 4) { for (let i = 0; i < count; i += 1) await act(async () => {}); }
async function mount(element) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  await flush();
  return {
    container,
    q: (selector) => container.querySelector(selector),
    qa: (selector) => [...container.querySelectorAll(selector)],
    async click(node) { assert.ok(node, "expected control"); await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await flush(); },
    async rerender(next) { await act(async () => root.render(next)); await flush(); },
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}

test.beforeEach(() => window.localStorage.clear());

// ── LeoComposer: no wallet / Lite for native ─────────────────────────────────

const lazyStub = dataModule("const noop = () => undefined;\nexport default new Proxy(noop, { get: () => noop });\nexport const __stub = true;\n");
const { LeoComposer } = await import(await compileModule("src/shell/LeoComposer.tsx", {
  "../i18n/ui/useUI": uiStub,
  "./composer-skill-slash": dataModule(`export function useComposerSkillSlash(){ return { onKeyDown: () => false, popover: null }; } export function composerSlashAdapter(){ return {}; }`),
  "./usePluginsCatalog": dataModule(`export const PLUGINS_SETTINGS_HREF = "/settings/plugins"; export function buildPopoverConnectors(){ return []; } export function usePluginsCatalog(){ return { items: [], loading: false, orgs: [], orgConnections: [] }; }`),
  "../lib/auth": dataModule("export async function getUserEmail(){ return null; }"),
  "../pages/AuthDialog": dataModule("export function AuthDialog(){ return null; }"),
  "./cloud-computer/ComputerDock": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ComputerDock(){ return React.createElement("button", { type: "button", "data-oceanleo-cc-dock-trigger": "" }, "dock"); }`),
  "./ModelPicker": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ModelGroupPicker(){ return React.createElement("span", { "data-model-group-picker": "" }); }`),
  "./PayerSelector": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function PayerSelector(){ return React.createElement("span", { "data-payer-selector": "" }, "个人钱包"); }`),
  "./mcp-apps": dataModule("export function ComposerAppsBar(){ return null; }"),
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const TemplateFillArea = forwardRef(function TemplateFillArea(props, _ref){
      return createElement("textarea", { "data-editor": "", value: props.value || "", readOnly: true, onKeyDown: props.onKeyDown });
    });
    export const PromptHighlightArea = TemplateFillArea;
  `),
}, { missingPackageStub: lazyStub }));

const composerBase = { value: "hi", onChange() {}, onSubmit() {}, showPlugins: false, showAppsBar: false };
const NATIVE = { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" };

test("LeoComposer: a native conversation never shows the wallet or the Leo tier, even if the host forgets", async () => {
  const m = await mount(React.createElement(LeoComposer, { ...composerBase, conversation: { kind: "oceanleo", target: { kind: "cloud" } } }));
  try {
    assert.ok(m.q("[data-payer-selector]"), "OceanLeo keeps the wallet");
    assert.ok(m.q("[data-model-group-picker]"), "OceanLeo keeps the tier");
    // Host forgot showPayerSelector={false} and the slot.
    await m.rerender(React.createElement(LeoComposer, { ...composerBase, conversation: NATIVE }));
    assert.equal(m.q("[data-payer-selector]"), null);
    assert.equal(m.q("[data-model-group-picker]"), null);
    assert.doesNotMatch(m.container.textContent, /个人钱包/);
    await m.rerender(React.createElement(LeoComposer, { ...composerBase, conversation: { ...NATIVE, view: "cli" }, showPayerSelector: true }));
    assert.equal(m.q("[data-payer-selector]"), null, "any native view");
    assert.equal(m.q("[data-model-group-picker]"), null);
    await m.rerender(React.createElement(LeoComposer, { ...composerBase, conversation: NATIVE, modelPickerSlot: React.createElement("span", { "data-native-slot": "" }) }));
    assert.ok(m.q("[data-native-slot]"), "the program's own picker renders");
    assert.equal(m.q("[data-payer-selector]"), null);
  } finally { await m.unmount(); }
});

// ── NativeModelPicker ────────────────────────────────────────────────────────

const MODELS = [
  { id: "opus", name: "Opus 4.x", default: true },
  { id: "sonnet", name: "Sonnet 4.x", default: false },
  { id: "paid", name: "Paid", default: false, usable: false, reason: "needs_credits", provider_label: "Anthropic" },
];
const CLAUDE_MODE = { id: "mode", name: "mode", current: "plan", options: [
  { value: "default", name: "Default" }, { value: "acceptEdits", name: "Accept Edits" }, { value: "plan", name: "Plan Mode" },
  { value: "auto", name: "Auto" }, { value: "bypassPermissions", name: "Bypass Permissions" },
] };
const FAST = { id: "fast_mode", name: "Fast mode", category: "model_config", type: "bool", current: true, options: [{ value: "true", name: "Fast" }, { value: "false", name: "Standard" }] };
const EFFORT = { id: "reasoning_effort", name: "Reasoning effort", category: "model_config", type: "select", current: "medium", options: [
  { value: "low", name: "Low" }, { value: "medium", name: "Medium" }, { value: "high", name: "High" },
] };

// W7 (2026-10-31 evening): the pill names the model only; the menu lists one row per setting
// the program reports (name left, current value right); a row opens a card of choices beside it.
async function openRow(m, id) {
  if (!m.q("[data-composer-settings-menu]")) await m.click(m.q("[data-native-model-trigger]"));
  await m.click(m.q(`[data-composer-setting-row="${id}"]`));
  return m.q(`[data-composer-settings-card="${id}"]`);
}
const rowValue = (m, id) => m.q(`[data-composer-setting-row="${id}"] [data-composer-setting-value]`)?.textContent;

test("pill shows the model only; rows per setting with current values; a row opens its choices card", async () => {
  const calls = [];
  const m = await mount(React.createElement(NativeModelPicker, {
    program: "claude", models: MODELS, selected: "opus", onSelect: (id) => calls.push(["model", id]),
    mode: CLAUDE_MODE, selectedMode: "plan", onMode: (v) => calls.push(["mode", v]),
    params: [FAST, EFFORT], onParam: (option, wire) => calls.push(["param", option.id, wire]), fastSupported: true,
  }));
  try {
    assert.equal(m.q("[data-native-model-summary]").textContent, "Opus 4.x", "no · mode · 快速 in the pill");
    await m.click(m.q("[data-native-model-trigger]"));
    assert.deepEqual(m.qa("[data-composer-setting-row]").map((n) => n.getAttribute("data-composer-setting-row")),
      ["model", "param:reasoning_effort", "mode", "fast"]);
    assert.match(m.q('[data-composer-setting-row="param:reasoning_effort"]').textContent, /推理强度/);
    assert.match(m.q('[data-composer-setting-row="mode"]').textContent, /权限模式/);
    assert.deepEqual(["model", "param:reasoning_effort", "mode", "fast"].map((id) => rowValue(m, id)), ["Opus 4.x", "Medium", "计划", "开"]);
    assert.equal(m.q("[data-composer-settings-card]"), null, "no card until a row is picked");
    const card = await openRow(m, "model");
    assert.ok(card, "the model row opens its card");
    const paid = m.q('[data-native-model-option="paid"]');
    assert.equal(paid.disabled, true, "unusable model is disabled");
    assert.match(paid.textContent, /Anthropic 的付费模型需要账户余额。/, "with its reason on screen");
    await openRow(m, "mode");
    assert.deepEqual(m.qa("[data-native-mode-option]").map((n) => n.textContent), ["手动确认", "自动接受改动", "计划", "自动", "全部放行"]);
    await openRow(m, "fast");
    await m.click(m.q('[data-native-fast-option="off"]'));
    assert.equal(m.q("[data-composer-settings-menu]"), null, "a pick closes the menu");
    await openRow(m, "param:reasoning_effort");
    await m.click(m.q('[data-native-param-option="reasoning_effort:high"]'));
    await openRow(m, "mode");
    await m.click(m.q('[data-native-mode-option="acceptEdits"]'));
    await openRow(m, "model");
    await m.click(m.q('[data-native-model-option="sonnet"]'));
    assert.deepEqual(calls, [["param", "fast_mode", "false"], ["param", "reasoning_effort", "high"], ["mode", "acceptEdits"], ["model", "sonnet"]]);
  } finally { await m.unmount(); }
});

test("Codex: no model list → the pill names the permission mode, in plain language", async () => {
  const mode = { id: "mode", name: "mode", current: "agent", options: [
    { value: "read-only", name: "Read Only" }, { value: "agent", name: "Agent" }, { value: "agent-full-access", name: "Agent (full access)" },
  ] };
  const m = await mount(React.createElement(NativeModelPicker, { program: "codex", models: [], selected: "", onSelect() {}, mode, selectedMode: "agent", onMode() {} }));
  try {
    assert.equal(m.q("[data-native-model-summary]").textContent, "代理");
    await openRow(m, "mode");
    assert.deepEqual(m.qa("[data-native-mode-option]").map((n) => n.textContent), ["只读", "代理", "完全访问"]);
  } finally { await m.unmount(); }
});

test("rows follow what each program reports (Cursor / Hermes modes are plain 模式, no invented rows)", async () => {
  const cursorMode = { id: "mode", name: "mode", current: "agent", options: [{ value: "agent", name: "Agent" }, { value: "plan", name: "Plan" }, { value: "ask", name: "Ask" }] };
  const m = await mount(React.createElement(NativeModelPicker, { program: "cursor", models: MODELS.slice(0, 2), selected: "opus", onSelect() {}, mode: cursorMode, selectedMode: "plan", onMode() {} }));
  try {
    await m.click(m.q("[data-native-model-trigger]"));
    assert.deepEqual(m.qa("[data-composer-setting-row]").map((n) => n.getAttribute("data-composer-setting-row")), ["model", "mode"]);
    assert.match(m.q('[data-composer-setting-row="mode"]').textContent, /^模式/);
    assert.equal(rowValue(m, "mode"), "Plan");
  } finally { await m.unmount(); }
});

test("fast is a disabled row with its reason when the program has it but the current model does not", async () => {
  const m = await mount(React.createElement(NativeModelPicker, {
    program: "codex", models: MODELS.slice(0, 2), selected: "sonnet", onSelect() {}, params: [EFFORT], onParam() {}, fastSupported: true,
  }));
  try {
    await m.click(m.q("[data-native-model-trigger]"));
    const row = m.q('[data-composer-setting-row="fast"]');
    assert.ok(row, "fast does not just vanish");
    assert.equal(row.disabled, true);
    assert.equal(rowValue(m, "fast"), "关");
    assert.equal(m.q("[data-composer-setting-reason]").textContent, "当前模型不支持快速模式");
  } finally { await m.unmount(); }
  const none = await mount(React.createElement(NativeModelPicker, { program: "hermes", models: MODELS.slice(0, 2), selected: "opus", onSelect() {}, fastSupported: false }));
  try {
    await none.click(none.q("[data-native-model-trigger]"));
    assert.equal(none.q('[data-composer-setting-row="fast"]'), null, "programs without fast show nothing about it");
  } finally { await none.unmount(); }
});

function fakeDialog(overrides = {}) {
  const calls = [];
  return {
    calls,
    models: MODELS.slice(0, 2), selectedModel: "opus", configOptions: [{ id: "model", name: "Model", category: "model", type: "select", current: "opus", options: [{ value: "opus", name: "Opus 4.x" }, { value: "sonnet", name: "Sonnet 4.x" }] }, FAST, EFFORT],
    mode: CLAUDE_MODE, selectedMode: "plan", activeSession: "s1",
    setSelectedModel: (id) => calls.push(["setSelectedModel", id]),
    setMode: (v) => calls.push(["setMode", v]),
    setConfig: (id, value) => calls.push(["setConfig", id, value]),
    ...overrides,
  };
}

test("a choice goes through the controller's setter and is remembered per program and computer", async () => {
  const dialog = fakeDialog();
  const m = await mount(React.createElement("div", null, nativeModelPickerFor({ program: "claude", computerId: "cc_1", dialog, waiting: true })));
  try {
    await openRow(m, "fast");
    await m.click(m.q('[data-native-fast-option="off"]'));
    assert.deepEqual(dialog.calls, [["setConfig", "fast_mode", false]], "bool wire is coerced for the setter");
    await openRow(m, "param:reasoning_effort");
    await m.click(m.q('[data-native-param-option="reasoning_effort:high"]'));
    assert.deepEqual(dialog.calls.at(-1), ["setConfig", "reasoning_effort", "high"]);
    const memory = JSON.parse(window.localStorage.getItem("oceanleo.acp.modelParams.cc_1.claude"));
    assert.deepEqual(memory, { opus: { fast_mode: "false", reasoning_effort: "high" } });
  } finally { await m.unmount(); }
});

test("a fresh view (no native session yet) restores the remembered choices through the setter", async () => {
  window.localStorage.setItem("oceanleo.acp.modelParams.cc_1.claude", JSON.stringify({ opus: { fast_mode: "false", reasoning_effort: "high" } }));
  const dialog = fakeDialog({ activeSession: "" });
  const m = await mount(React.createElement("div", null, nativeModelPickerFor({ program: "claude", computerId: "cc_1", dialog, waiting: true })));
  try {
    assert.deepEqual(dialog.calls, [["setConfig", "fast_mode", false], ["setConfig", "reasoning_effort", "high"]]);
  } finally { await m.unmount(); }
  const open = fakeDialog({ activeSession: "s1" });
  const m2 = await mount(React.createElement("div", null, nativeModelPickerFor({ program: "claude", computerId: "cc_1", dialog: open, waiting: true })));
  try { assert.deepEqual(open.calls, [], "an open session's own settings win"); }
  finally { await m2.unmount(); }
});

test("Codex legacy effort-in-model-id catalogs: effort picks the variant id and is remembered", async () => {
  const models = [
    { id: "gpt-5[low]", name: "GPT-5 (low)", default: false }, { id: "gpt-5[high]", name: "GPT-5 (high)", default: true },
  ];
  const dialog = fakeDialog({ models, selectedModel: "gpt-5[high]", configOptions: [], mode: null, selectedMode: "" });
  const m = await mount(React.createElement("div", null, nativeModelPickerFor({ program: "codex", computerId: "cc_1", dialog, waiting: true })));
  try {
    assert.ok(await openRow(m, "effort"));
    await m.click(m.q('[data-native-effort-option="gpt-5[low]"]'));
    assert.deepEqual(dialog.calls, [["setSelectedModel", "gpt-5[low]"]]);
    assert.deepEqual(JSON.parse(window.localStorage.getItem("oceanleo.acp.modelParams.cc_1.codex")), { "gpt-5": { reasoning_effort: "low" } });
  } finally { await m.unmount(); }
});

test("nothing known yet: a disabled 正在读取… trigger, or nothing when not waiting", async () => {
  const empty = fakeDialog({ models: [], configOptions: [], mode: null, selectedModel: "" });
  const m = await mount(React.createElement("div", null, nativeModelPickerFor({ program: "codex", computerId: "cc_1", dialog: empty, waiting: true })));
  try {
    const trigger = m.q("[data-native-model-trigger]");
    assert.equal(trigger.disabled, true);
    assert.equal(trigger.textContent, "正在读取…");
  } finally { await m.unmount(); }
  assert.equal(nativeModelPickerFor({ program: "codex", computerId: "cc_1", dialog: empty, waiting: false }), null);
  assert.equal(nativeModelPickerFor({ program: null, computerId: "cc_1", dialog: fakeDialog(), waiting: true }), null);
});

// ── Draft (homepage, before the first send) through the real hook ────────────

class FakeSocket {
  static sockets = [];
  constructor(url) {
    this.url = url; this.readyState = 0; this.sent = []; this.listeners = new Map();
    FakeSocket.sockets.push(this);
    queueMicrotask(() => { if (this.readyState === 3) return; this.readyState = 1; this.emit("open", {}); });
  }
  addEventListener(type, fn, options) {
    const once = Boolean(options && options.once);
    const wrapped = (event) => { if (once) this.removeEventListener(type, wrapped); fn(event); };
    wrapped.original = fn;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), wrapped]);
  }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== fn && item.original !== fn)); }
  send(data) {
    const frame = JSON.parse(data);
    this.sent.push(frame);
    const reply = (out) => queueMicrotask(() => { if (this.readyState === 1) this.emit("message", { data: JSON.stringify(out) }); });
    if (frame.t === "status") reply({ t: "status", programs: [{ id: "claude", installed: true, path: "/cl", version: "1", auth: "login", logged_in: true, dir_capability: "full", running: false }] });
    if (frame.t === "occupancy") reply({ t: "occupancy", program: frame.program, busy: [] });
    if (frame.t === "sessions") reply({ t: "sessions", program: frame.program, sessions: [], active: "" });
    if (frame.t === "models") {
      reply({ t: "models", program: frame.program, models: [{ id: "opus", name: "Opus 4.x", default: true }, { id: "sonnet", name: "Sonnet 4.x" }] });
      reply({ t: "config", program: frame.program, options: [
        { id: "mode", name: "mode", category: "mode", current: "default", options: [{ value: "default", name: "Default" }, { value: "plan", name: "Plan Mode" }] },
        { id: "fast_mode", name: "Fast mode", category: "model_config", current: false, options: [{ value: "true", name: "Fast" }, { value: "false", name: "Standard" }] },
      ] });
    }
  }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.emit("close", {}); }
  emit(type, event) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event); }
}
FakeSocket.CONNECTING = 0; FakeSocket.OPEN = 1; FakeSocket.CLOSING = 2; FakeSocket.CLOSED = 3;

test("draft mode: the picker appears from the warm connection before any session exists", async () => {
  globalThis.WebSocket = FakeSocket;
  window.WebSocket = FakeSocket;
  const hookUi = dataModule(`export function useUI() { return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}")); }`);
  const { useNativeThread } = await import(await compileModule("src/shell/native-thread/useNativeThread.ts", {
    "../../lib/computer-task-api": dataModule(`export async function getComputerTaskTranscript() { throw new Error("no archive in draft"); }`),
    "../../i18n/ui/useUI": hookUi,
    "../../../i18n/ui/useUI": hookUi,
    "../anchored-popover": popoverStub,
    "../../../lib/cloud-computer-api": dataModule(`
      export function agentDialogWsUrl(id) { return "ws://example.test/v1/computers/" + id + "/agent-dialog"; }
      export async function putComputerInbox() { throw new Error("unused"); }
    `),
    "../../../lib/auth/client": dataModule(`export async function accessToken() { return "tok"; }`),
    "../../../lib/agent": dataModule(`export async function getTask() { return { ok: false }; } export async function stopTask() { return { ok: false }; }`),
    "../../../lib/cloud-computer-agent-api": dataModule(`
      export async function agentState() { return { ok: false, status: 0 }; }
      export async function agentTurn() { return { ok: false, status: 0 }; }
      export async function agentReset() { return { ok: true }; }
    `),
  }));
  let thread = null;
  function Host(props) {
    thread = useNativeThread(props);
    return React.createElement("div", null, thread.modelPicker);
  }
  const props = { computer: { id: "cc_1", name: "elon", node_online: true }, session: null, program: "claude", enabled: true };
  const m = await mount(React.createElement(Host, { ...props, computer: null }));
  try {
    assert.equal(m.q("[data-native-model-trigger]")?.textContent, "正在读取…", "computer still loading: a waiting trigger, not nothing");
    await m.rerender(React.createElement(Host, props));
    for (let i = 0; i < 80 && !m.q("[data-native-model-summary]"); i += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    }
    assert.equal(thread.draft, true);
    assert.equal(m.q("[data-native-model-summary]").textContent, "Opus 4.x");
    await openRow(m, "mode");
    assert.deepEqual(m.qa("[data-native-mode-option]").map((n) => n.textContent), ["手动确认", "计划"]);
    await openRow(m, "fast");
    await m.click(m.q('[data-native-fast-option="on"]'));
    assert.equal(thread.dialog.configOptions.find((option) => option.id === "fast_mode").current, true, "the controller's setConfig ran");
    assert.equal(m.q("[data-native-model-summary]").textContent, "Opus 4.x", "the pill stays the model name");
    await m.click(m.q("[data-native-model-trigger]"));
    assert.equal(rowValue(m, "fast"), "开");
    assert.equal(FakeSocket.sockets.flatMap((socket) => socket.sent).some((frame) => ["open_session", "new_session", "prompt"].includes(frame.t)), false, "a draft never opens a session");
    await m.rerender(React.createElement(Host, { ...props, computer: { ...props.computer, node_online: false } }));
    assert.equal(m.q("[data-native-model-picker]"), null, "offline: no picker");
  } finally { await m.unmount(); }
});
