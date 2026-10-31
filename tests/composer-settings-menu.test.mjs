// W7 (2026-10-31 evening, operator points 8 + 12): the composer's agent settings menu and the
// composer height cap. One menu for Codex / Hermes / Claude Code / Cursor (NativeModelPicker,
// see native-composer-controls) and the OceanLeo cloud agent (ModelGroupPicker compact): the
// pill names the model only, rows = settings the agent really has, a row opens a card of
// choices beside the menu (flipping at the viewport edge), keyboard included. Leo's fast mode
// is remembered and goes out with task / follow-up requests.
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
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent,
  CustomEvent: window.CustomEvent, localStorage: window.localStorage,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(`export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }`);
const popoverStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AnchoredPopover({ open, children, attributes, side }) {
    if (!open) return null;
    return React.createElement("div", { "data-anchored-popover": "1", "data-side": side || "", ...(attributes || {}) }, children);
  }
`);

const { composerMaxHeight, COMPOSER_MIN_MAX_HEIGHT } = await import("../src/shell/composer-max-height.ts");
const { readLeoFastMode, leoRunRequestFields, LEO_FAST_MODE_KEY } = await import("../src/lib/leo-run-options.ts");
const menu = await import(await compileModule("src/shell/composer-settings-menu.tsx", { "./anchored-popover": popoverStub }));
const { ComposerSettingsMenu, submenuSide, SUBMENU_WIDTH } = menu;

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
    async key(node, key) { await act(async () => node.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }))); await flush(); },
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}
test.beforeEach(() => window.localStorage.clear());

// ── 8. composer height cap ───────────────────────────────────────────────────
test("composer height: about 30% of the viewport (Manus), never above the host cap, never tiny", () => {
  assert.equal(composerMaxHeight(280, 670), 201, "the operator's screen: 半屏 → about 8 lines");
  assert.equal(composerMaxHeight(280, 1400), 280, "tall screens keep the host's absolute cap");
  assert.equal(composerMaxHeight(280, 300), COMPOSER_MIN_MAX_HEIGHT);
  assert.equal(composerMaxHeight(280, null), 280, "SSR / unknown viewport: the cap");
  assert.equal(composerMaxHeight(100, 670), 100, "a host cap below the floor wins");
  const src = readFileSync(new URL("../src/shell/LeoComposer.tsx", import.meta.url), "utf8");
  assert.match(src, /useComposerMaxHeight\(maxHeight\)/);
  assert.match(src, /maxHeight=\{editorMaxHeight\}/, "the editor gets the viewport-capped height");
});

// ── 12. shared menu ──────────────────────────────────────────────────────────
test("submenu side: right when it fits, else left, else let the popover place it", () => {
  assert.equal(submenuSide({ left: 900, right: 1170 }, 1440), "right");
  assert.equal(submenuSide({ left: 900, right: 1300 }, 1440), "left", "at the right edge the card flips left");
  assert.equal(submenuSide({ left: 10, right: 360 }, 380), undefined, "neither side: vertical fallback");
  assert.equal(SUBMENU_WIDTH, 240);
});

function rows(calls) {
  return [
    { id: "model", label: "模型", value: "Opus 5.5", selected: "opus", choices: [
      { value: "opus", label: "Opus 5.5" }, { value: "sonnet", label: "Sonnet 5", detail: "Anthropic" },
    ], onPick: (v) => calls.push(["model", v]) },
    { id: "effort", label: "推理强度", value: "High", selected: "high", choices: [{ value: "low", label: "Low" }, { value: "high", label: "High" }], onPick: (v) => calls.push(["effort", v]) },
    { id: "fast", label: "快速模式", value: "关", selected: "", choices: [], reason: "当前模型不支持快速模式" },
  ];
}

test("menu: pill = model name, rows show name + value, a row opens a card, a pick switches and closes", async () => {
  const calls = [];
  const m = await mount(React.createElement(ComposerSettingsMenu, { summary: "Opus 5.5", rows: rows(calls), ariaLabel: "模型" }));
  try {
    const trigger = m.q("[data-composer-settings] > button");
    assert.equal(trigger.textContent, "Opus 5.5");
    await m.click(trigger);
    assert.deepEqual(m.qa("[data-composer-setting-row]").map((n) => [n.getAttribute("data-composer-setting-row"), n.querySelector("[data-composer-setting-value]").textContent]),
      [["model", "Opus 5.5"], ["effort", "High"], ["fast", "关"]]);
    assert.equal(m.q('[data-composer-setting-row="fast"]').disabled, true, "an unsupported setting is a disabled row with its reason");
    await m.click(m.q('[data-composer-setting-row="model"]'));
    const card = m.q('[data-composer-settings-card="model"]');
    assert.ok(card, "the card opens");
    assert.equal(card.getAttribute("data-side"), "right", "beside the menu");
    assert.match(card.textContent, /Sonnet 5Anthropic/, "choices carry their short note");
    assert.equal(m.q('[data-composer-setting-choice="model:opus"]').getAttribute("aria-selected"), "true");
    await m.click(m.q('[data-composer-setting-choice="model:sonnet"]'));
    assert.deepEqual(calls, [["model", "sonnet"]]);
    assert.equal(m.q("[data-composer-settings-menu]"), null, "picking closes everything");
  } finally { await m.unmount(); }
});

test("menu keyboard: ArrowRight opens the row's card, ArrowLeft closes it back to the row", async () => {
  const calls = [];
  const m = await mount(React.createElement(ComposerSettingsMenu, { summary: "Opus 5.5", rows: rows(calls), ariaLabel: "模型" }));
  try {
    await m.click(m.q("[data-composer-settings] > button"));
    const row = m.q('[data-composer-setting-row="effort"]');
    row.focus();
    await m.key(row, "ArrowRight");
    const card = m.q('[data-composer-settings-card="effort"]');
    assert.ok(card);
    const choice = m.q('[data-composer-setting-choice="effort:low"]');
    choice.focus();
    await m.key(choice, "ArrowLeft");
    assert.equal(m.q('[data-composer-settings-card="effort"]'), null);
    assert.equal(window.document.activeElement, m.q('[data-composer-setting-row="effort"]'), "focus goes back to the row");
  } finally { await m.unmount(); }
});

// ── 12. OceanLeo (cloud Leo) in the same menu, with fast mode ────────────────
const accountStub = dataModule(`
  export const MODEL_GROUP_CHANGED_EVENT = "oceanleo:model-group-changed";
  const groups = [
    { key: "preset:lite", id: "lite", kind: "preset", name: "Lite", editable: false, selection: {} },
    { key: "preset:pro", id: "pro", kind: "preset", name: "Pro", editable: false, selection: {} },
    { key: "preset:max", id: "max", kind: "preset", name: "Max", editable: false, selection: {} },
    { key: "custom:1", id: "1", kind: "custom", name: "Mine", editable: true, selection: {} },
  ];
  export async function getModelGroups() { return { ok: true, data: { groups, active_group_key: "preset:pro" } }; }
  export async function setActiveModelGroup(key) { (globalThis.__activated ||= []).push(key); return { ok: true, data: { groups, active_group_key: key } }; }
`);
const { ModelGroupPicker } = await import(await compileModule("src/shell/ModelPicker.tsx", {
  "../lib/auth/account": accountStub,
  "../i18n/ui/useUI": uiStub,
  "./anchored-popover": popoverStub,
  "./workbench-open-store": dataModule("export function useWorkbenchOpen(){ return false; }"),
}));

test("OceanLeo agent: same menu — 模型 (groups with notes) and 快速模式; fast is remembered and sent", async () => {
  globalThis.__activated = [];
  const m = await mount(React.createElement(ModelGroupPicker, { compact: true, placement: "top", align: "right" }));
  try {
    const trigger = m.q("[data-leo-settings-trigger]");
    assert.equal(trigger.textContent, "Pro", "the pill names the model group only");
    await m.click(trigger);
    assert.deepEqual(m.qa("[data-composer-setting-row]").map((n) => n.getAttribute("data-composer-setting-row")), ["model", "fast"]);
    assert.equal(m.q('[data-composer-setting-row="fast"] [data-composer-setting-value]').textContent, "关");
    await m.click(m.q('[data-composer-setting-row="model"]'));
    assert.deepEqual(m.qa("[data-leo-model-option]").map((n) => n.textContent),
      ["Lite响应最快，适合简单任务", "Pro速度与质量均衡", "Max最强，适合复杂任务", "Mine我的自定义组合"]);
    await m.click(m.q('[data-leo-model-option="preset:max"]'));
    assert.deepEqual(globalThis.__activated, ["preset:max"]);
    assert.equal(m.q("[data-leo-settings-trigger]").textContent, "Max");
    assert.deepEqual(leoRunRequestFields(), {}, "off: requests unchanged");
    await m.click(m.q("[data-leo-settings-trigger]"));
    await m.click(m.q('[data-composer-setting-row="fast"]'));
    await m.click(m.q('[data-leo-fast-option="on"]'));
    assert.equal(window.localStorage.getItem(LEO_FAST_MODE_KEY), "1");
    assert.equal(readLeoFastMode(), true);
    assert.deepEqual(leoRunRequestFields(), { fast_mode: true });
    await m.click(m.q("[data-leo-settings-trigger]"));
    assert.equal(m.q('[data-composer-setting-row="fast"] [data-composer-setting-value]').textContent, "开");
    assert.ok(m.q("[data-model-picker-popover]").textContent.includes("管理模型组合 →"));
  } finally { await m.unmount(); }
});

test("Leo fast mode rides on both send paths (new task and follow-up)", () => {
  const src = readFileSync(new URL("../src/lib/agent.ts", import.meta.url), "utf8");
  const create = src.slice(src.indexOf('"/v1/agent/tasks",'), src.indexOf("export function createConsoleRun"));
  assert.match(create, /\.\.\.leoRunRequestFields\(\)/);
  const follow = src.slice(src.indexOf("export function followUp("), src.indexOf("export const followupTask"));
  assert.match(follow, /\.\.\.leoRunRequestFields\(\)/);
});
