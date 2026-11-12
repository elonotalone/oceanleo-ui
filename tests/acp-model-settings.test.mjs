import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = JSON.stringify(pathToFileURL(require.resolve("react")).href);
const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
const ui = dataModule(`export function useUI(){ return (zh, vars) => zh.replace(/\\{(\\w+)\\}/g, (m, k) => vars?.[k] ?? m); }`);
const api = dataModule(`
  export function acpErrorText(e) { return e.message; }
  export async function getCatalog() { return globalThis.__am.catalog; }
  export async function request(path, init) {
    const change = JSON.parse(init.body);
    globalThis.__am.calls.push({ path, change });
    return globalThis.__am.apply(change);
  }
`);
const stubs = {
  "../../i18n/ui/useUI": ui,
  "../../lib/acp-frames-api": api,
  "../../lib/program-choice-api": dataModule(`
    export function programChoiceFrom(value){ return value ?? {}; }
    export async function getProgramChoice(){ return globalThis.__am.stored; }
    export async function putProgramChoice(cid, program, patch){ globalThis.__am.saved.push(patch); return patch; }
  `),
  "../cloud-computer/native-surface/useProgramAccess": dataModule("export function useProgramAccess(){ return { programs: [] }; }"),
  "../anchored-popover": dataModule(`
    import React from ${reactUrl};
    export function AnchoredPopover({open, children, attributes}) { return open ? React.createElement("div", attributes, children) : null; }
  `),
};
const settings = await import(await compileModule("src/shell/acp-task/acp-settings.ts", stubs));
const { useAcpCatalogPicker } = await import(await compileModule("src/shell/acp-task/useAcpCatalogPicker.tsx", stubs));
const { settingsLists, offeredChoices, changedChoices } = settings;
const select = (id, values, current = values[0], category = "model_config") => ({
  id, name: id, category, type: "select", currentValue: current,
  options: values.map((value) => ({ value, name: value })),
});
const model = (current, values = ["opus", "fable-5.2"]) => select("model", values, current, "model");
const mode = (auto = false) => select("mode", auto ? ["default", "auto"] : ["default"], "default", "mode");
const fast = (id = "fast", value = true) => ({ id, name: /fast/.test(id) ? "Fast" : id, type: "boolean", currentValue: value });
const opus = () => ({ configOptions: [mode(true), model("opus"), select("effort", ["low", "high", "max"], "high"), fast(), fast("ultracode", false)] });
const fable = () => ({ configOptions: [mode(), model("fable-5.2"), select("effort", ["default", "low", "high", "xhigh"], "default"), fast("ultracode", false)] });
const catalog = () => ({ ...opus(), byModel: { opus: opus(), "fable-5.2": fable() } });

for (const [program, current, state, ids] of [
  ["claude Opus", "opus", opus(), ["mode", "model", "effort", "fast", "ultracode"]],
  ["claude Fable 5.2", "fable-5.2", fable(), ["mode", "model", "effort", "ultracode"]],
  ["codex fast tier", "sol", { configOptions: [model("sol", ["sol", "other"]), select("reasoning_effort", ["medium", "high"]), fast("fast-mode")] }, ["model", "reasoning_effort", "fast-mode"]],
  ["codex standard only", "other", { configOptions: [model("other", ["sol", "other"]), select("reasoning_effort", ["low", "medium"])] }, ["model", "reasoning_effort"]],
  ["cursor", "auto", { configOptions: [mode(), model("auto", ["auto"]), select("effort", ["low", "high"]), fast()] }, ["mode", "model", "effort", "fast"]],
  ["hermes", "nous", { models: { currentModelId: "nous", availableModels: [{ modelId: "nous" }] }, modes: { currentModeId: "chat", availableModes: [{ id: "chat", name: "Chat" }] }, configOptions: [] }, []],
  ["oceanleo", "deepseek", { configOptions: [select("provider", ["openai", "deepseek"], "openai", "provider"), mode(), model("deepseek", ["deepseek"]), select("thinking_effort", ["off", "high"])] }, ["provider", "mode", "model", "thinking_effort"]],
]) test(`${program}: exactly the program's live options, with their wire ids and values`, () => {
  const lists = settingsLists(catalog(), current, state);
  assert.deepEqual(lists.configOptions.map((item) => item.id), ids);
  if (program === "hermes") assert.deepEqual(lists.mode.options.map((item) => item.value), ["chat"]);
});

test("byModel replaces the stale computer catalog; unknown models show only model/mode", () => {
  assert.deepEqual(settingsLists(catalog(), "fable-5.2").configOptions.map((item) => item.id), ["mode", "model", "effort", "ultracode"]);
  const unknown = settingsLists({ ...opus() }, "fable-5.2");
  assert.deepEqual(unknown.configOptions.map((item) => item.id), ["mode", "model"]);
  const choice = offeredChoices({ model: "fable-5.2", mode: "auto", config: { fast: true, effort: "max", model: "opus", mode: "auto" } }, settingsLists(catalog(), "fable-5.2"));
  assert.deepEqual(choice, { model: "fable-5.2" });
  assert.deepEqual(changedChoices({ model: "opus", config: { fast: true } }, { model: "opus", config: { fast: true } }), {});
});

let hook;
function Probe(props) { hook = useAcpCatalogPicker(props); return hook.picker; }
async function flush() { for (let i = 0; i < 8; i++) await act(async () => {}); }
async function mount({ props = {}, stored = {}, catalogs = catalog(), apply = () => opus() } = {}) {
  globalThis.__am = { catalog: catalogs, stored, calls: [], saved: [], apply };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  let input = { computerId: `cc_am_${Math.random()}`, program: "claude", ...props };
  const render = async (patch = {}) => { input = { ...input, ...patch }; await act(async () => root.render(React.createElement(Probe, input))); await flush(); };
  await render();
  const click = async (selector) => {
    const node = host.querySelector(selector);
    assert.ok(node, `missing ${selector}`);
    await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await flush();
  };
  const open = async () => { if (!host.querySelector("[data-composer-settings-menu]")) await click("[data-native-model-trigger]"); };
  const pick = async (row, value) => { await open(); await click(`[data-composer-setting-row="${row}"]`); await click(`[data-composer-setting-choice="${row}:${value}"]`); };
  return { host, render, click, open, pick, async close() {
    await act(async () => root.unmount()); host.remove(); console.error = originalError;
    assert.deepEqual(errors, [], "no console.error, hook-order errors, or React warnings");
  } };
}

test("real hook + menu: a live model pick is optimistic, immediately applied, redraws on the reply, and is not resent", async () => {
  let finish;
  const view = await mount({ props: { taskId: "task /1", sessionLive: true, live: opus() }, apply: () => new Promise((resolve) => { finish = resolve; }) });
  try {
    await view.pick("model", "fable-5.2");
    assert.match(view.host.textContent, /fable-5.2/);
    assert.deepEqual(globalThis.__am.calls, [{ path: "/v1/tasks/task%20%2F1/settings", change: { kind: "model", value: "fable-5.2" } }]);
    await view.open();
    assert.equal(view.host.querySelector('[data-composer-setting-row="fast"]'), null, "stale Opus fast disappears before the reply");
    await act(async () => finish(fable())); await flush();
    assert.deepEqual(hook.forSend(), {});
    await view.render({ live: fable() });
    assert.equal(view.host.querySelector('[data-composer-setting-row="fast"]'), null);
    assert.ok(view.host.querySelector('[data-composer-setting-row="param:effort"]'));
  } finally { await view.close(); }
});

test("live refusal reverts the pick and displays one plain notice without persisting it", async () => {
  const view = await mount({ props: { taskId: "t", sessionLive: true, live: opus() }, apply: () => { throw new Error("Unknown config option: fast"); } });
  try {
    await view.pick("fast", "false");
    await view.open();
    assert.equal(view.host.querySelector('[data-composer-setting-row="fast"] [data-composer-setting-value]').textContent, "开");
    assert.equal(view.host.querySelectorAll('[role="alert"]').length, 1);
    assert.match(view.host.textContent, /设置没有生效：Unknown config option: fast/);
    assert.deepEqual(globalThis.__am.saved, []);
    assert.deepEqual(hook.forSend(), {});
  } finally { await view.close(); }
});

test("not_live keeps the pick for the next message, filters unsupported retry settings, and shows no refusal", async () => {
  const view = await mount({ props: { taskId: "t", sessionLive: true, live: opus() }, apply: () => {
    throw Object.assign(new Error("HTTP 409"), { status: 409, payload: { detail: { code: "not_live" } } });
  } });
  try {
    await view.pick("fast", "false");
    assert.equal(hook.forSend().config.fast, false);
    await view.open();
    assert.equal(view.host.querySelector('[role="alert"]'), null);
    await view.pick("model", "fable-5.2");
    assert.equal(globalThis.__am.calls.length, 1, "after not_live later picks stay local");
    assert.deepEqual(hook.forSend({ model: "fable-5.2", config: { fast: true, effort: "max", ultracode: true } }), { model: "fable-5.2", config: { ultracode: true } });
    assert.equal(hook.forSend().config?.fast, undefined);
  } finally { await view.close(); }
});

test("offline model switches restore each model's prior value and never call live apply", async () => {
  const view = await mount({ stored: { model: "opus", config: { fast: true, effort: "high" } } });
  try {
    await view.pick("fast", "false");
    await view.pick("model", "fable-5.2");
    await view.pick("param:effort", "xhigh");
    await view.open();
    assert.equal(view.host.querySelector('[data-composer-setting-row="fast"]'), null);
    await view.pick("model", "opus");
    assert.equal(hook.choice.config.fast, false);
    assert.equal(hook.choice.config.effort, "high");
    await view.pick("model", "fable-5.2");
    assert.equal(hook.choice.config.effort, "xhigh");
    assert.deepEqual(globalThis.__am.calls, []);
  } finally { await view.close(); }
});

test("remembered model appears without a loading trigger while the catalog is absent", async () => {
  const view = await mount({ catalogs: {}, stored: { model: "remembered-model" } });
  try {
    assert.match(view.host.textContent, /remembered-model/);
    assert.equal(view.host.querySelector('[data-native-model-loading]'), null);
  } finally { await view.close(); }
});

test("OceanLeo provider reply replaces its model menu and arbitrary boolean/select rows work generically", async () => {
  const before = { configOptions: [select("provider", ["openai", "deepseek"], "openai", "provider"), model("gpt", ["gpt"]), select("thinking_effort", ["off", "high"]), { ...fast("custom-feature", false), category: "" }] };
  const after = { configOptions: [select("provider", ["openai", "deepseek"], "deepseek", "provider"), model("deepseek", ["deepseek"]), select("thinking_effort", ["off", "high"]), { ...fast("custom-feature", false), category: "" }] };
  const view = await mount({ props: { program: "oceanleo", taskId: "leo", sessionLive: true, live: before }, catalogs: {}, apply: () => after });
  try {
    await view.pick("param:provider", "deepseek");
    assert.match(view.host.textContent, /deepseek/);
    await view.open();
    assert.ok(view.host.querySelector('[data-composer-setting-row="param:custom-feature"]'), "unfamiliar boolean names are rendered too");
    await view.click('[data-composer-setting-row="model"]');
    assert.deepEqual([...view.host.querySelectorAll('[data-native-model-option]')].map((node) => node.getAttribute("data-native-model-option")), ["deepseek"]);
    assert.deepEqual(globalThis.__am.calls[0].change, { kind: "config", id: "provider", value: "deepseek" });
    assert.deepEqual(hook.forSend(), {});
  } finally { await view.close(); }
});

test("config mode currentValue and grouped Codex choices are preserved; other mode-category settings are carried as config", () => {
  const state = { configOptions: [
    select("collaboration_mode", ["default", "plan"], "plan", "mode"),
    model("sol", ["sol"]), mode(true),
    { id: "reasoning_effort", type: "select", currentValue: "high", options: [
      { group: "Reasoning", options: [{ value: "medium", name: "Medium" }, { value: "high", name: "High" }] },
    ] },
  ] };
  const lists = settingsLists({}, "sol", state);
  assert.equal(lists.mode.id, "mode");
  assert.equal(lists.mode.current, "default");
  assert.deepEqual(offeredChoices({ mode: "auto", config: { collaboration_mode: "plan", reasoning_effort: "high" } }, lists), {
    mode: "auto", config: { collaboration_mode: "plan", reasoning_effort: "high" },
  });
});

test("live switch back restores the program's prior fast value and latest effort/mode options", async () => {
  const view = await mount({ props: { taskId: "t", sessionLive: true, live: opus() }, apply: (change) => change.value === "fable-5.2" ? fable() : opus() });
  try {
    await view.pick("model", "fable-5.2");
    await view.open(); await view.click('[data-composer-setting-row="param:effort"]');
    assert.deepEqual([...view.host.querySelectorAll('[data-native-param-option]')].map((node) => node.getAttribute("data-native-param-option")), ["effort:default", "effort:low", "effort:high", "effort:xhigh"]);
    await view.pick("model", "opus");
    await view.open();
    assert.equal(view.host.querySelector('[data-composer-setting-row="fast"] [data-composer-setting-value]').textContent, "开");
    await view.click('[data-composer-setting-row="mode"]');
    assert.deepEqual([...view.host.querySelectorAll('[data-native-mode-option]')].map((node) => node.getAttribute("data-native-mode-option")), ["default", "auto"]);
    assert.deepEqual(hook.forSend(), {});
  } finally { await view.close(); }
});

test("late live replies cannot overwrite another task's model or show its refusal", async () => {
  let finish;
  const view = await mount({ props: { taskId: "old", sessionLive: true, live: opus() }, apply: () => new Promise((resolve) => { finish = resolve; }) });
  try {
    await view.pick("model", "fable-5.2");
    await view.render({ taskId: "new", live: opus() });
    await act(async () => finish(fable())); await flush();
    assert.match(view.host.textContent, /opus/);
    assert.doesNotMatch(view.host.textContent, /fable-5.2/);
    assert.deepEqual(globalThis.__am.saved, []);
  } finally { await view.close(); }
});

test("live mode pick uses kind=mode, updates immediately, and is omitted from the next send", async () => {
  const updated = opus(); updated.configOptions[0].currentValue = "auto";
  const view = await mount({ props: { taskId: "t", sessionLive: true, live: opus() }, apply: () => updated });
  try {
    await view.pick("mode", "auto");
    assert.deepEqual(globalThis.__am.calls[0].change, { kind: "mode", value: "auto" });
    assert.equal(hook.choice.mode, "auto");
    assert.deepEqual(hook.forSend(), {});
  } finally { await view.close(); }
});

test("a draft's empty frames view still shows catalog models/modes, with unknown per-model parameters hidden", () => {
  const emptyView = { configOptions: null, models: { currentModelId: null, availableModels: [] }, modes: { currentModeId: null, availableModes: [] } };
  assert.deepEqual(settingsLists(opus(), "opus", emptyView).configOptions.map((option) => option.id), ["mode", "model"]);
});

test("offline choices survive reattachment until the program confirms them, then later live changes win", async () => {
  const view = await mount({ props: { taskId: "t", sessionLive: false, live: opus(), reloadKey: "detached" } });
  try {
    await view.pick("fast", "false");
    await view.render({ sessionLive: true, reloadKey: "attached" });
    assert.deepEqual(hook.forSend(), { config: { fast: false } });
    const confirmed = opus(); confirmed.configOptions.find((option) => option.id === "fast").currentValue = false;
    await view.render({ live: confirmed });
    assert.deepEqual(hook.forSend(), {});
    await view.render({ live: opus() });
    assert.equal(hook.choice.config.fast, true, "latest program update is authoritative after confirmation");
  } finally { await view.close(); }
});

test("a refused live model pick returns to the program's model and follows later updates", async () => {
  const view = await mount({ props: { taskId: "t", sessionLive: true, live: opus() }, apply: () => { throw new Error("Model unavailable"); } });
  try {
    await view.pick("model", "fable-5.2");
    assert.match(view.host.textContent, /opus/);
    await view.render({ live: fable() });
    assert.match(view.host.textContent, /fable-5.2/);
  } finally { await view.close(); }
});

test("recorded Fable reply 122789: no fast, exact effort choices, select ultracode, and the real current permission mode", async () => {
  const { readFile } = await import("node:fs/promises");
  const recorded = JSON.parse(await readFile(new URL("./fixtures/acp-model-settings/claude-fable-122789.json", import.meta.url), "utf8"));
  const lists = settingsLists(catalog(), "claude-fable-5-2", recorded);
  assert.deepEqual(lists.configOptions.map((option) => option.id), ["mode", "model", "effort", "ultracode"]);
  assert.deepEqual(lists.configOptions.find((option) => option.id === "effort").options.map((option) => option.value), ["default", "low", "medium", "high", "xhigh", "max"]);
  assert.equal(lists.mode.current, "bypassPermissions");
  assert.deepEqual(offeredChoices({ model: "claude-fable-5-2", config: { fast: "on", effort: "max", ultracode: "off" } }, lists), {
    model: "claude-fable-5-2", config: { effort: "max", ultracode: "off" },
  });
});
