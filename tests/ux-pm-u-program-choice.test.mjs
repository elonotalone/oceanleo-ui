// UX wave 2026-11-07 (PM-U): the composer pill's remembered choice — model,
// permission mode, options such as effort / fast — lives on the gateway per
// user + computer + program (contract §2.1 `…/programs/{program}/choice`), not
// in this browser. The REAL hook (`useAcpCatalogPicker`) and the REAL clients
// (`acp-frames-api`, `program-choice-api`) run over a fake gateway that stores
// the choice with §2.1's merge rule; only the token, the program-access hook
// and (in most cases) the pill's presentation are stand-ins.
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

// ── fake gateway: /catalog and /choice (§2.1: shallow merge, config per id, null removes) ──

const gateway = { catalogs: {}, choices: new Map(), calls: [], hold: null, failPut: null, failGet: null };
function resetGateway() {
  gateway.catalogs = {};
  gateway.choices = new Map();
  gateway.calls = [];
  gateway.hold = null;
  gateway.failPut = null;
  gateway.failGet = null;
}
function mergeChoice(base, patch) {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "config") {
      const config = { ...(base.config || {}) };
      for (const [id, item] of Object.entries(value || {})) { if (item === null) delete config[id]; else config[id] = item; }
      if (Object.keys(config).length) next.config = config; else delete next.config;
    } else if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const path = String(url).replace("https://gw.test", "");
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  gateway.calls.push({ path, method, body, auth: init.headers?.Authorization });
  const catalog = path.match(/^\/v1\/computers\/([^/]+)\/programs\/([^/]+)\/catalog$/);
  if (catalog) return json(gateway.catalogs[catalog[2]] ?? {});
  const choice = path.match(/^\/v1\/computers\/([^/]+)\/programs\/([^/]+)\/choice$/);
  if (choice) {
    const key = `${decodeURIComponent(choice[1])}/${decodeURIComponent(choice[2])}`;
    if (method === "GET") {
      if (gateway.failGet) return json(gateway.failGet.body, gateway.failGet.status);
      if (gateway.hold) await gateway.hold;
      return json(gateway.choices.get(key) ?? {});
    }
    if (method === "PUT") {
      if (gateway.failPut) return json(gateway.failPut.body, gateway.failPut.status);
      const merged = mergeChoice(gateway.choices.get(key) ?? {}, body);
      gateway.choices.set(key, merged);
      return json(merged);
    }
  }
  return json({ detail: "Not Found" }, 404);
};
const puts = () => gateway.calls.filter((call) => call.method === "PUT").map((call) => ({ path: call.path, body: call.body }));
const CHOICE_PATH = "/v1/computers/cc_1/programs/claude/choice";

// ── modules ──

const reactUrl = JSON.stringify(pathToFileURL(require.resolve("react")).href);
const uiStub = dataModule(`export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }`);
const acpFramesUrl = await compileModule("src/lib/acp-frames-api.ts", {
  "./auth/client": dataModule("export async function accessToken(){ return 'tok'; }"),
  "./auth/config": dataModule("export function gatewayBase(){ return 'https://gw.test'; }"),
});
const accessStub = dataModule("export function useProgramAccess(){ return {}; }");
// The pill's presentation: records what the real hook hands it.
const pickerStub = dataModule(`
  import React from ${reactUrl};
  export function NativeModelPicker(props) {
    return React.createElement("span", { "data-picker": props.loading ? "loading" : "empty" });
  }
  export function nativeModelPickerFor(input) {
    globalThis.__pill = input;
    return React.createElement("span", { "data-picker": "ready" });
  }
`);
const HOOK_DEPS = {
  "../../i18n/ui/useUI": uiStub,
  "../../lib/acp-frames-api": acpFramesUrl,
  "../cloud-computer/native-surface/useProgramAccess": accessStub,
};
const { useAcpCatalogPicker } = await import(await compileModule("src/shell/acp-task/useAcpCatalogPicker.tsx", {
  ...HOOK_DEPS,
  "../native-thread/NativeModelPicker": pickerStub,
}));
const popoverStub = dataModule(`
  import React from ${reactUrl};
  export function AnchoredPopover({ open, children, attributes }) {
    if (!open) return null;
    return React.createElement("div", { "data-anchored-popover": "1", ...(attributes || {}) }, children);
  }
`);
const realPill = await import(await compileModule("src/shell/acp-task/useAcpCatalogPicker.tsx", {
  ...HOOK_DEPS,
  "../anchored-popover": popoverStub,
}));
const memory = await import(await compileModule("src/shell/cloud-computer/agent-dialog/model-param-memory.ts", {
  "../../../lib/acp-frames-api": acpFramesUrl,
}));

// Claude as the catalog reports it (shape of a real `acp_program_catalog` row, trimmed).
const CLAUDE = {
  models: { currentModelId: "opus", availableModels: [{ modelId: "opus", name: "Opus" }, { modelId: "sonnet", name: "Sonnet" }] },
  modes: { currentModeId: "default", availableModes: [
    { id: "default", name: "Manual" }, { id: "acceptEdits", name: "Accept edits" }, { id: "plan", name: "Plan" },
    { id: "auto", name: "Auto" }, { id: "bypassPermissions", name: "Bypass Permissions" },
  ] },
  configOptions: [
    { id: "mode", category: "mode", type: "select", currentValue: "default", options: [{ value: "default", name: "Manual" }, { value: "bypassPermissions", name: "Bypass" }] },
    { id: "model", category: "model", type: "select", currentValue: "opus", options: [{ value: "opus", name: "Opus" }, { value: "sonnet", name: "Sonnet" }] },
    { id: "effort", category: "thought_level", type: "select", currentValue: "default", options: [
      { value: "default", name: "Default" }, { value: "high", name: "High" }, { value: "xhigh", name: "Extra high" },
    ] },
    { id: "fast", category: "model_config", type: "select", currentValue: "off", options: [{ value: "on", name: "On" }, { value: "off", name: "Off" }] },
  ],
};

async function flush(count = 6) { for (let i = 0; i < count; i += 1) await act(async () => {}); }

function Probe({ hook = useAcpCatalogPicker, ...props }) {
  const result = hook(props);
  globalThis.__picker = result;
  return React.createElement("div", null, result.picker);
}

async function mount(props = {}) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Probe, { computerId: "cc_1", program: "claude", ...props })));
  await flush();
  return {
    container,
    q: (selector) => container.querySelector(selector),
    get choice() { return globalThis.__picker.choice; },
    get dialog() { return globalThis.__pill?.dialog; },
    get notice() { return globalThis.__pill?.notice; },
    async run(fn) { await act(async () => { fn(); }); await flush(); },
    async click(node) { assert.ok(node, "expected control"); await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await flush(); },
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}

test.beforeEach(() => {
  resetGateway();
  gateway.catalogs.claude = CLAUDE;
  window.localStorage.clear();
  globalThis.__pill = null;
});

test("the stored choice is what the pill shows over the catalog default, and what goes out", async () => {
  gateway.choices.set("cc_1/claude", { model: "sonnet", mode: "bypassPermissions", config: { effort: "xhigh", fast: "on" } });
  const m = await mount();
  try {
    assert.deepEqual(m.choice, { model: "sonnet", mode: "bypassPermissions", config: { effort: "xhigh", fast: "on" } });
    assert.equal(m.dialog.selectedModel, "sonnet");
    assert.equal(m.dialog.selectedMode, "bypassPermissions", "Bypass chosen once sticks");
    assert.equal(m.dialog.configOptions.find((option) => option.id === "effort").current, "xhigh");
    assert.equal(m.dialog.configOptions.find((option) => option.id === "fast").current, "on");
    assert.ok(gateway.calls.some((call) => call.method === "GET" && call.path === CHOICE_PATH && call.auth === "Bearer tok"));
    assert.deepEqual(puts(), [], "reading writes nothing");
  } finally { await m.unmount(); }
});

test("nothing stored: the program's own defaults show and nothing goes out", async () => {
  const m = await mount();
  try {
    assert.deepEqual(m.choice, {});
    assert.equal(m.dialog.selectedModel, "opus");
    assert.equal(m.dialog.selectedMode, "default", "a new user starts on the program default (it asks)");
    assert.deepEqual(puts(), []);
  } finally { await m.unmount(); }
});

test("only choices the program lists go out (and show)", async () => {
  gateway.choices.set("cc_1/claude", { model: "gone", mode: "bypassPermissions", config: { effort: "ultra", fast: "on", unknown: "x" } });
  gateway.catalogs.claude = { ...CLAUDE, modes: { currentModeId: "default", availableModes: CLAUDE.modes.availableModes.slice(0, 4) } };
  const m = await mount();
  try {
    assert.deepEqual(m.choice, { config: { fast: "on" } }, "an unlisted model, mode, value or option id is not sent");
    assert.equal(m.dialog.selectedModel, "opus");
    assert.equal(m.dialog.selectedMode, "default", "root Linux without Bypass on offer: the program default shows");
    assert.equal(m.dialog.configOptions.find((option) => option.id === "effort").current, "default");
  } finally { await m.unmount(); }
});

test("a pick is stored on the server at once (one PUT patch each) and goes out; nothing is kept in this browser", async () => {
  const m = await mount();
  try {
    await m.run(() => m.dialog.setMode("bypassPermissions"));
    await m.run(() => m.dialog.setConfig("effort", "high"));
    await m.run(() => m.dialog.setSelectedModel("sonnet"));
    assert.deepEqual(puts(), [
      { path: CHOICE_PATH, body: { mode: "bypassPermissions" } },
      { path: CHOICE_PATH, body: { config: { effort: "high" } } },
      { path: CHOICE_PATH, body: { model: "sonnet" } },
    ]);
    assert.deepEqual(m.choice, { model: "sonnet", mode: "bypassPermissions", config: { effort: "high" } });
    assert.equal(window.localStorage.length, 0);
  } finally { await m.unmount(); }
  // Another browser (a fresh mount, same user) shows the same choice.
  const other = await mount();
  try {
    assert.deepEqual(other.choice, { model: "sonnet", mode: "bypassPermissions", config: { effort: "high" } });
  } finally { await other.unmount(); }
});

test("the old local copy is stored once when the server has none, then removed", async () => {
  window.localStorage.setItem("oceanleo.acp.selection.cc_1.claude", JSON.stringify({ model: "sonnet", mode: "acceptEdits" }));
  window.localStorage.setItem("oceanleo.acp.modelParams.cc_1.claude", JSON.stringify({ sonnet: { effort: "high", fast: "on" }, opus: { effort: "xhigh" } }));
  window.localStorage.setItem("oceanleo.acp.selection.cc_1.codex", JSON.stringify({ mode: "agent" }));
  const m = await mount();
  try {
    assert.deepEqual(puts(), [{ path: CHOICE_PATH, body: { model: "sonnet", mode: "acceptEdits", config: { effort: "high", fast: "on" } } }],
      "the remembered model's options go up with it");
    assert.deepEqual(m.choice, { model: "sonnet", mode: "acceptEdits", config: { effort: "high", fast: "on" } });
    assert.equal(window.localStorage.getItem("oceanleo.acp.selection.cc_1.claude"), null);
    assert.equal(window.localStorage.getItem("oceanleo.acp.modelParams.cc_1.claude"), null);
    assert.notEqual(window.localStorage.getItem("oceanleo.acp.selection.cc_1.codex"), null, "another program's copy waits for its own first read");
  } finally { await m.unmount(); }
  const again = await mount();
  try {
    assert.equal(puts().length, 1, "once: the next read finds it on the server");
    assert.deepEqual(again.choice, { model: "sonnet", mode: "acceptEdits", config: { effort: "high", fast: "on" } });
  } finally { await again.unmount(); }
});

test("the server already has a choice: the old local copy is removed, not uploaded", async () => {
  gateway.choices.set("cc_1/claude", { mode: "plan" });
  window.localStorage.setItem("oceanleo.acp.selection.cc_1.claude", JSON.stringify({ mode: "acceptEdits" }));
  const m = await mount();
  try {
    assert.deepEqual(puts(), []);
    assert.deepEqual(m.choice, { mode: "plan" });
    assert.equal(window.localStorage.getItem("oceanleo.acp.selection.cc_1.claude"), null);
  } finally { await m.unmount(); }
});

test("an unreadable choice shows the program defaults and keeps the old local copy for a later read", async () => {
  gateway.failGet = { status: 404, body: { detail: "Not Found" } };
  window.localStorage.setItem("oceanleo.acp.selection.cc_1.claude", JSON.stringify({ mode: "acceptEdits" }));
  const m = await mount();
  try {
    assert.deepEqual(m.choice, {});
    assert.deepEqual(puts(), []);
    assert.notEqual(window.localStorage.getItem("oceanleo.acp.selection.cc_1.claude"), null);
  } finally { await m.unmount(); }
});

test("a failed store is said in the gateway's words; the pick still goes out with the next message", async () => {
  gateway.failPut = { status: 503, body: { detail: "choice store unavailable" } };
  const m = await mount();
  try {
    await m.run(() => m.dialog.setMode("bypassPermissions"));
    assert.equal(m.notice, "choice store unavailable");
    assert.deepEqual(m.choice, { mode: "bypassPermissions" });
    gateway.failPut = null;
    await m.run(() => m.dialog.setMode("plan"));
    assert.equal(m.notice, "", "the next good store clears it");
  } finally { await m.unmount(); }
});

test("a pick made before the stored choice arrives wins over it", async () => {
  gateway.choices.set("cc_1/claude", { model: "sonnet", mode: "plan" });
  let release;
  gateway.hold = new Promise((resolve) => { release = resolve; });
  const m = await mount();
  try {
    await m.run(() => m.dialog.setMode("bypassPermissions"));
    await act(async () => { release(); });
    await flush();
    assert.deepEqual(m.choice, { model: "sonnet", mode: "bypassPermissions" });
  } finally { await m.unmount(); }
});

test("each computer + program has its own choice", async () => {
  gateway.choices.set("cc_1/claude", { mode: "bypassPermissions" });
  gateway.choices.set("cc_2/claude", { mode: "plan" });
  const m = await mount({ computerId: "cc_2" });
  try {
    assert.deepEqual(m.choice, { mode: "plan" });
    await m.run(() => m.dialog.setMode("acceptEdits"));
    assert.deepEqual(puts(), [{ path: "/v1/computers/cc_2/programs/claude/choice", body: { mode: "acceptEdits" } }]);
    assert.deepEqual(gateway.choices.get("cc_1/claude"), { mode: "bypassPermissions" });
  } finally { await m.unmount(); }
});

test("the old local copy maps onto one choice (exact model, Codex family, the only model, or none)", () => {
  const put = (program, selection, params) => {
    window.localStorage.clear();
    if (selection) window.localStorage.setItem(`oceanleo.acp.selection.cc_1.${program}`, JSON.stringify(selection));
    if (params) window.localStorage.setItem(`oceanleo.acp.modelParams.cc_1.${program}`, JSON.stringify(params));
    return memory.localProgramChoice("cc_1", program);
  };
  assert.deepEqual(put("codex", { model: "gpt-5[high]" }, { "gpt-5": { reasoning_effort: "high" } }),
    { model: "gpt-5[high]", config: { reasoning_effort: "high" } });
  assert.deepEqual(put("claude", null, { opus: { fast_mode: "false" } }), { config: { fast_mode: "false" } });
  assert.deepEqual(put("claude", { mode: "plan" }, { opus: { effort: "high" }, sonnet: { effort: "low" } }), { mode: "plan" },
    "two models and none remembered: their options stay behind");
  assert.equal(put("claude", { model: 7 }, "not json"), null);
  assert.equal(put("claude", null, null), null);
});

test("the client sends §2.1's patch shape and keeps only §2.1 fields from the answer", async () => {
  const api = await import(await compileModule("src/lib/program-choice-api.ts", { "./acp-frames-api": acpFramesUrl }));
  gateway.choices.set("cc_9/codex", { mode: "agent", config: { reasoning_effort: "high" } });
  assert.deepEqual(await api.getProgramChoice("cc_9", "codex"), { mode: "agent", config: { reasoning_effort: "high" } });
  assert.deepEqual(await api.putProgramChoice("cc_9", "codex", { mode: "agent-full-access", config: { reasoning_effort: null } }),
    { mode: "agent-full-access" });
  assert.deepEqual(api.programChoiceFrom({ model: "", mode: 3, config: { a: "x", b: 1, c: true }, extra: 1 }), { config: { a: "x", c: true } });
  gateway.failPut = { status: 403, body: { detail: "computer not yours" } };
  await assert.rejects(api.putProgramChoice("cc_9", "codex", { mode: "read-only" }), (error) => error.status === 403 && error.message === "computer not yours");
});

test("render: the real pill names the stored model and reads Bypass plainly", async () => {
  gateway.choices.set("cc_1/claude", { model: "sonnet", mode: "bypassPermissions" });
  const m = await mount({ hook: realPill.useAcpCatalogPicker });
  try {
    assert.equal(m.q("[data-native-model-summary]").textContent, "Sonnet");
    await m.click(m.q("[data-native-model-trigger]"));
    assert.equal(m.q('[data-composer-setting-row="mode"] [data-composer-setting-value]').textContent, "不再询问（Bypass）");
    await m.click(m.q('[data-composer-setting-row="mode"]'));
    await m.click(m.q('[data-native-mode-option="plan"]'));
    assert.deepEqual(puts(), [{ path: CHOICE_PATH, body: { mode: "plan" } }], "a click in the real pill stores the pick");
    assert.equal(m.choice.mode, "plan");
  } finally { await m.unmount(); }
});
