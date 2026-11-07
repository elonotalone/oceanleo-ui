// UX wave 2026-11-07 (unit LA): the OceanLeo agent's 权限模式 on a computer. Two choices,
// 每次都问 (`ask`) and 不问 (`bypass`); the gateway stores the choice per user + computer +
// program `oceanleo` (`GET/PUT /v1/computers/{cid}/programs/oceanleo/choice`, `{}` = ask) and
// gates every computer-changing tool call by it. The composer row only shows what the gateway
// answered: read once per computer, never optimistic, errors verbatim, no polling.
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
  export function AnchoredPopover({ open, children, attributes, side, role }) {
    if (!open) return null;
    return React.createElement("div", { "data-anchored-popover": "1", "data-side": side || "", role, ...(attributes || {}) }, children);
  }
`);
const accountStub = dataModule(`
  export const MODEL_GROUP_CHANGED_EVENT = "oceanleo:model-group-changed";
  const groups = [
    { key: "preset:lite", id: "lite", kind: "preset", name: "Lite", editable: false, selection: {} },
    { key: "preset:pro", id: "pro", kind: "preset", name: "Pro", editable: false, selection: {} },
  ];
  export async function getModelGroups() { return { ok: true, data: { groups, active_group_key: "preset:pro" } }; }
  export async function setActiveModelGroup(key) { return { ok: true, data: { groups, active_group_key: key } }; }
`);
// The gateway's choice route, driven by each test through `globalThis.__choice`.
const choiceStub = dataModule(`
  export async function getProgramChoice(computerId, program, options = {}) {
    const c = globalThis.__choice;
    c.gets.push({ computerId, program, signal: options.signal });
    return c.get(computerId);
  }
  export async function putProgramChoice(computerId, program, patch) {
    const c = globalThis.__choice;
    c.puts.push({ computerId, program, patch });
    return c.put(computerId, patch);
  }
`);

const { oceanleoModeFrom, oceanleoModeRow, OCEANLEO_MODES } = await import(
  await compileModule("src/shell/oceanleo-mode.ts", { "../lib/program-choice-api": choiceStub })
);
const { ModelGroupPicker } = await import(await compileModule("src/shell/ModelPicker.tsx", {
  "../lib/auth/account": accountStub,
  "../lib/program-choice-api": choiceStub,
  "../i18n/ui/useUI": uiStub,
  "./anchored-popover": popoverStub,
  "./workbench-open-store": dataModule("export function useWorkbenchOpen(){ return false; }"),
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function installChoice({ get = async () => ({}), put = async (_cid, patch) => ({ ...patch }) } = {}) {
  globalThis.__choice = { gets: [], puts: [], get, put };
  return globalThis.__choice;
}

async function flush(count = 4) { for (let i = 0; i < count; i += 1) await act(async () => {}); }
async function mount(props) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const render = (next) => React.createElement(ModelGroupPicker, { compact: true, placement: "top", align: "right", ...next });
  await act(async () => root.render(render(props)));
  await flush();
  return {
    q: (selector) => container.querySelector(selector),
    qa: (selector) => [...container.querySelectorAll(selector)],
    async click(node) { assert.ok(node, "expected control"); await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await flush(); },
    async rerender(next) { await act(async () => root.render(render(next))); await flush(); },
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}
const rowIds = (m) => m.qa("[data-composer-setting-row]").map((n) => n.getAttribute("data-composer-setting-row"));
const modeRow = (m) => m.q("[data-oceanleo-mode-row]");
const modeValue = (m) => modeRow(m).querySelector("[data-composer-setting-value]").textContent;
const modeReason = (m) => modeRow(m).querySelector("[data-composer-setting-reason]")?.textContent ?? null;

const tt = (zh) => `T(${zh})`;

// ── the pure parts ───────────────────────────────────────────────────────────
test("oceanleoModeFrom: only an explicit bypass skips the question", () => {
  assert.deepEqual([...OCEANLEO_MODES], ["ask", "bypass"]);
  assert.equal(oceanleoModeFrom({}), "ask", "never chosen = ask");
  assert.equal(oceanleoModeFrom({ mode: "bypass" }), "bypass");
  assert.equal(oceanleoModeFrom({ mode: "ask" }), "ask");
  assert.equal(oceanleoModeFrom({ mode: "x" }), "ask", "an unknown mode asks");
  assert.equal(oceanleoModeFrom({ model: "m", config: { fast: true } }), "ask");
});

test("oceanleoModeRow: not read yet = 「…」, read-only", () => {
  const row = oceanleoModeRow({ state: { mode: null, saving: false, error: "" }, onPick: () => {}, tt });
  assert.equal(row.id, "mode");
  assert.equal(row.label, "T(权限模式)");
  assert.equal(row.value, "…");
  assert.equal(row.selected, undefined);
  assert.equal(row.onPick, undefined);
  assert.equal(row.reason, undefined);
  assert.deepEqual(row.attrs, { "data-oceanleo-mode-row": "" });
  assert.deepEqual(row.choices, [
    { value: "ask", label: "T(每次都问)", detail: "T(改动这台电脑前先问你)", attrs: { "data-oceanleo-mode-option": "ask" } },
    { value: "bypass", label: "T(不问)", detail: "T(直接改动这台电脑，不再询问)", attrs: { "data-oceanleo-mode-option": "bypass" } },
  ]);
});

test("oceanleoModeRow: ask / bypass show their label and pick passes the value through", () => {
  const picks = [];
  const ask = oceanleoModeRow({ state: { mode: "ask", saving: false, error: "" }, onPick: (mode) => picks.push(mode), tt });
  assert.equal(ask.value, "T(每次都问)");
  assert.equal(ask.selected, "ask");
  assert.equal(typeof ask.onPick, "function");
  ask.onPick("bypass");
  const bypass = oceanleoModeRow({ state: { mode: "bypass", saving: false, error: "" }, onPick: (mode) => picks.push(mode), tt });
  assert.equal(bypass.value, "T(不问)");
  assert.equal(bypass.selected, "bypass");
  bypass.onPick("ask");
  assert.deepEqual(picks, ["bypass", "ask"]);
});

test("oceanleoModeRow: saving is read-only; an error is the reason, verbatim", () => {
  const saving = oceanleoModeRow({ state: { mode: "ask", saving: true, error: "" }, onPick: () => {}, tt });
  assert.equal(saving.onPick, undefined);
  assert.equal(saving.value, "T(每次都问)", "the old choice stays until the gateway answered");
  const text = "HTTP 503\n{\"reason\":\"gateway_unavailable\"}";
  const failed = oceanleoModeRow({ state: { mode: "bypass", saving: false, error: text }, onPick: () => {}, tt });
  assert.equal(failed.reason, text, "not translated, not reworded");
  assert.equal(typeof failed.onPick, "function", "a failed save can be tried again");
  const unread = oceanleoModeRow({ state: { mode: null, saving: false, error: "未登录" }, onPick: () => {}, tt });
  assert.equal(unread.reason, "未登录");
  assert.equal(unread.onPick, undefined, "a failed read leaves the row read-only");
});

// ── in the composer menu ─────────────────────────────────────────────────────
test("no computer: no 权限模式 row and no choice read", async () => {
  const choice = installChoice();
  const m = await mount({});
  try {
    await m.click(m.q("[data-leo-settings-trigger]"));
    assert.deepEqual(rowIds(m), ["model", "fast"]);
    assert.equal(modeRow(m), null);
    assert.equal(choice.gets.length, 0);
  } finally { await m.unmount(); }
});

test("on a computer: the row reads once, a pick saves and shows only the gateway's answer", async () => {
  const pending = deferred();
  const choice = installChoice({ put: () => pending.promise });
  const m = await mount({ computerId: "cc_1" });
  try {
    assert.equal(choice.gets.length, 1);
    assert.deepEqual([choice.gets[0].computerId, choice.gets[0].program], ["cc_1", "oceanleo"]);
    assert.ok(choice.gets[0].signal, "the read can be aborted");
    await m.click(m.q("[data-leo-settings-trigger]"));
    assert.deepEqual(rowIds(m), ["model", "fast", "mode"], "after Leo's own rows");
    assert.equal(modeRow(m).getAttribute("data-composer-setting-row"), "mode");
    assert.equal(modeValue(m), "每次都问", "{} = ask");
    await m.click(modeRow(m));
    assert.deepEqual(m.qa("[data-oceanleo-mode-option]").map((n) => n.textContent),
      ["每次都问改动这台电脑前先问你", "不问直接改动这台电脑，不再询问"]);
    await m.click(m.q('[data-oceanleo-mode-option="bypass"]'));
    assert.deepEqual(choice.puts, [{ computerId: "cc_1", program: "oceanleo", patch: { mode: "bypass" } }]);
    await m.click(m.q("[data-leo-settings-trigger]"));
    assert.equal(modeValue(m), "每次都问", "never optimistic");
    assert.equal(modeRow(m).disabled, true, "read-only while saving");
    await act(async () => pending.resolve({ mode: "bypass" }));
    await flush();
    assert.equal(modeValue(m), "不问");
    assert.equal(modeRow(m).disabled, false);
    assert.equal(choice.gets.length, 1, "no polling, no re-read");
  } finally { await m.unmount(); }
});

test("a failed save keeps the choice and shows the gateway's text verbatim", async () => {
  const choice = installChoice({
    get: async () => ({ mode: "bypass" }),
    put: async () => { throw new Error("HTTP 409 computer offline"); },
  });
  const m = await mount({ computerId: "cc_1" });
  try {
    await m.click(m.q("[data-leo-settings-trigger]"));
    assert.equal(modeValue(m), "不问");
    await m.click(modeRow(m));
    await m.click(m.q('[data-oceanleo-mode-option="ask"]'));
    assert.deepEqual(choice.puts.map((call) => call.patch), [{ mode: "ask" }]);
    await m.click(m.q("[data-leo-settings-trigger]"));
    assert.equal(modeValue(m), "不问", "mode unchanged");
    assert.equal(modeReason(m), "HTTP 409 computer offline");
    assert.equal(modeRow(m).disabled, false, "the user can try again");
  } finally { await m.unmount(); }
});

test("a failed read: 「…」, the error verbatim, read-only", async () => {
  installChoice({ get: async () => { throw new Error("未登录"); } });
  const m = await mount({ computerId: "cc_1" });
  try {
    await m.click(m.q("[data-leo-settings-trigger]"));
    assert.equal(modeValue(m), "…");
    assert.equal(modeReason(m), "未登录");
    assert.equal(modeRow(m).disabled, true);
  } finally { await m.unmount(); }
});

test("another computer reads its own choice; the old read is aborted, so is the read on unmount", async () => {
  const choice = installChoice({ get: (cid) => (cid === "cc_1" ? new Promise(() => {}) : Promise.resolve({ mode: "bypass" })) });
  const m = await mount({ computerId: "cc_1" });
  let unmounted = false;
  try {
    await m.rerender({ computerId: "cc_2" });
    assert.deepEqual(choice.gets.map((call) => call.computerId), ["cc_1", "cc_2"]);
    assert.equal(choice.gets[0].signal.aborted, true);
    await m.click(m.q("[data-leo-settings-trigger]"));
    assert.equal(modeValue(m), "不问");
    await m.unmount();
    unmounted = true;
    assert.equal(choice.gets[1].signal.aborted, true);
  } finally { if (!unmounted) await m.unmount(); }
});

test("LeoComposer passes the OceanLeo agent's computer only (not a device, not the cloud)", () => {
  const src = readFileSync(new URL("../src/shell/LeoComposer.tsx", import.meta.url), "utf8");
  assert.match(src, /<ModelGroupPicker compact placement="top" align="right" computerId=\{oceanleoComputerId\} \/>/);
  const at = src.indexOf("const oceanleoComputerId");
  assert.ok(at > 0);
  const derivation = src.slice(at, src.indexOf(";", at));
  assert.match(derivation, /activeConversation\?\.kind === "oceanleo" && activeConversation\.target\.kind === "computer"/);
  assert.match(derivation, /!activeConversation && boundExecutionTarget\?\.kind === "computer"/);
  assert.doesNotMatch(derivation, /"device"|"cloud"/);
  const shell = readFileSync(new URL("../src/shell/oceanleo-mode.ts", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /localStorage|setInterval|setTimeout/, "no local copy of the choice, no polling");
});
