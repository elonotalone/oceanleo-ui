// 设置窗「个性化」面板（editors-and-shell-0924 W08）：
// 生成对话记忆开关、自定义指令字数、从其他 AI 导入、旧网关 404 只说「还没启用」。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/eas-w08-personalization-pane.test.mjs

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://ppt.oceanleo.com/settings",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  FocusEvent: window.FocusEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
for (const proto of [window.HTMLElement.prototype, window.Element.prototype]) {
  proto.attachEvent = function attachEvent() {};
  proto.detachEvent = function detachEvent() {};
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;
const NOT_AVAILABLE = "这项设置还没在你连接的服务上启用。";
const PROMPT = "把这段话发给你常用的 AI，让它总结它记得的关于你的信息 —— 固定提示词";

const STUBS = {
  "../../../i18n/ui/useUI": dataModule(`
    export function useUI() {
      return (zh, vars) =>
        vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
    }
  `),
  "../../../lib/personalization-api": dataModule(`
    export const CUSTOM_INSTRUCTIONS_MAX_CHARS = 1500;
    export const MEMORY_CONTENT_MAX_CHARS = 500;
    export const MEMORY_IMPORT_MAX_CHARS = 20000;
    export function countChars(text) { return Array.from(String(text ?? "")).length; }
    const api = () => globalThis.__w08Api;
    export async function getPersonalization() { return api().getPersonalization(); }
    export async function updatePersonalization(patch) { return api().updatePersonalization(patch); }
    export async function listMemories() { return api().listMemories(); }
    export async function addMemory(input) { return api().addMemory(input); }
    export async function updateMemory(id, patch) { return api().updateMemory(id, patch); }
    export async function deleteMemory(id) { return api().deleteMemory(id); }
    export async function importMemories(text) { return api().importMemories(text); }
    export async function getMemoryImportPrompt(lang) { return api().getMemoryImportPrompt(lang); }
  `),
  "../../AuthDialog": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function AuthDialog({ onSuccess }) {
      return React.createElement("button", { type: "button", "data-testid": "auth-ok", onClick: onSuccess }, "ok");
    }
  `),
  "../../../ui": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function Switch({ checked, onChange, disabled, label }) {
      return React.createElement("button", {
        type: "button",
        role: "switch",
        "aria-checked": String(!!checked),
        "aria-label": label,
        disabled,
        onClick: () => onChange(!checked),
      }, checked ? "on" : "off");
    }
    export function Modal({ children }) {
      return React.createElement("div", { role: "dialog", "data-testid": "modal" }, children);
    }
    export function ConfirmDialog({ title, onConfirm, onCancel }) {
      return React.createElement("div", { "data-testid": "confirm" },
        React.createElement("p", null, title),
        React.createElement("button", { type: "button", onClick: onConfirm }, "ok"),
        React.createElement("button", { type: "button", onClick: onCancel }, "cancel"),
      );
    }
    export function Select({ options, value, onChange }) {
      return React.createElement("select", {
        value,
        onChange: (event) => onChange(event.target.value),
      }, options.map((opt) => React.createElement("option", { key: opt.id, value: opt.id }, opt.label)));
    }
    export function SkeletonLine() {
      return React.createElement("div", { "data-testid": "skeleton" });
    }
    export function ButtonSpinner({ label }) {
      return React.createElement("span", { "data-testid": "spinner" }, label);
    }
  `),
  "../../../shell/share/share-clipboard": dataModule(`
    export async function writeClipboardText(text) {
      globalThis.__w08Clipboard = String(text ?? "");
      return true;
    }
  `),
  "next-intl": dataModule(`
    export function useLocale() { return "zh"; }
  `),
};

const { PersonalizationSection } = await import(
  await compileModule("src/pages/settings/personalization/PersonalizationSection.tsx", STUBS)
);

function okPrefs(overrides = {}) {
  return {
    ok: true,
    status: 200,
    data: {
      memory_enabled: true,
      custom_instructions: "",
      leo_enabled: true,
      leo_panel: {},
      ...overrides,
    },
  };
}

function setupApi(overrides = {}) {
  const calls = { update: [], import: [] };
  globalThis.__w08Clipboard = "";
  globalThis.__w08Api = {
    async getPersonalization() {
      return okPrefs();
    },
    async updatePersonalization(patch) {
      calls.update.push(patch);
      return { ok: true, data: null, status: 200 };
    },
    async listMemories() {
      return { ok: true, data: [], status: 200 };
    },
    async addMemory() {
      return { ok: false, error: "unknown", status: 500 };
    },
    async updateMemory() {
      return { ok: false, error: "unknown", status: 500 };
    },
    async deleteMemory() {
      return { ok: false, error: "unknown", status: 500 };
    },
    async importMemories(text) {
      calls.import.push(text);
      return {
        ok: true,
        status: 200,
        data: {
          imported: 2,
          skipped: [{ content: "重复的一条", reason: "duplicate" }],
        },
      };
    },
    async getMemoryImportPrompt() {
      return { ok: true, data: PROMPT, status: 200 };
    },
    ...overrides,
  };
  return calls;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount() {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(PersonalizationSection));
  });
  await flush();
  return {
    host,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function click(el) {
  assert.ok(el, "click target");
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

async function typeInto(el, value) {
  assert.ok(el, "input target");
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  assert.ok(setter, "value setter");
  await act(async () => {
    el.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
    setter.call(el, value);
    el.dispatchEvent(new window.KeyboardEvent("keyup", { key: "a", bubbles: true }));
  });
  await flush();
}

test("开关切换调用 updatePersonalization({ memory_enabled })，失败时回滚并提示", async () => {
  let failNext = false;
  const calls = setupApi({
    async updatePersonalization(patch) {
      calls.update.push(patch);
      if (failNext) return { ok: false, error: "server_error", status: 500 };
      return { ok: true, data: null, status: 200 };
    },
  });
  const { host, unmount } = await mount();
  try {
    const card = host.querySelector('[data-personalization-card="memory-toggle"]');
    assert.ok(card, "memory toggle card");
    const sw = card.querySelector('[role="switch"]');
    assert.equal(sw.getAttribute("aria-checked"), "true");

    await click(sw);
    assert.deepEqual(calls.update, [{ memory_enabled: false }]);
    assert.equal(sw.getAttribute("aria-checked"), "false");
    assert.ok(card.querySelector("[data-personalization-memory-off]"));

    failNext = true;
    await click(sw);
    assert.deepEqual(calls.update, [{ memory_enabled: false }, { memory_enabled: true }]);
    assert.equal(sw.getAttribute("aria-checked"), "false");
    const note = card.querySelector('[data-personalization-note="error"]');
    assert.ok(note);
    assert.match(note.textContent, /服务器出了点问题/);
  } finally {
    await unmount();
  }
});

test("自定义指令 1500 字可提交、1501 字与未改动时「确认」禁用", async () => {
  setupApi();
  const { host, unmount } = await mount();
  try {
    const box = host.querySelector("[data-personalization-instructions]");
    const submit = host.querySelector("[data-personalization-instructions-submit]");
    assert.ok(box && submit);
    assert.equal(submit.disabled, true);

    await typeInto(box, "x".repeat(1500));
    assert.equal(submit.disabled, false);

    await typeInto(box, "x".repeat(1501));
    assert.equal(submit.disabled, true);
    assert.match(host.textContent, /最多 1500 字/);

    await typeInto(box, "");
    assert.equal(submit.disabled, true);
  } finally {
    await unmount();
  }
});

test("导入对话框：复制写入假剪贴板；导入调用 importMemories 并显示 imported / skipped", async () => {
  const calls = setupApi();
  const { host, unmount } = await mount();
  try {
    await click(host.querySelector("[data-personalization-import-open]"));
    const dialog = window.document.querySelector("[data-personalization-import-dialog]");
    assert.ok(dialog, "import dialog");
    assert.equal(dialog.querySelector("[data-personalization-import-prompt]").value, PROMPT);

    await click(dialog.querySelector("[data-personalization-import-copy]"));
    assert.equal(globalThis.__w08Clipboard, PROMPT);

    const answer = dialog.querySelector("[data-personalization-import-answer]");
    assert.equal(dialog.querySelector("[data-personalization-import-submit]").disabled, true);
    await typeInto(answer, "  其他 AI 记得我叫小李  ");
    const submit = dialog.querySelector("[data-personalization-import-submit]");
    assert.equal(submit.disabled, false);
    await click(submit);

    assert.deepEqual(calls.import, ["其他 AI 记得我叫小李"]);
    const result = dialog.querySelector("[data-personalization-import-result]");
    assert.ok(result);
    assert.match(result.textContent, /导入 2 条，跳过 1 条/);
    assert.match(result.textContent, /重复的一条/);
    assert.match(result.textContent, /和已有的记忆重复/);
  } finally {
    await unmount();
  }
});

test("后端 404 时显示「还没启用」而不是错误；记忆列表仍可用", async () => {
  setupApi({
    async getPersonalization() {
      return { ok: false, error: "not_available", status: 404 };
    },
    async listMemories() {
      return {
        ok: true,
        status: 200,
        data: [
          {
            id: "m1",
            kind: "preference",
            content: "先给结论",
            site_id: null,
            enabled: true,
            use_count: 2,
            last_used_at: null,
            created_at: "2026-09-24T00:00:00Z",
          },
        ],
      };
    },
  });
  const { host, unmount } = await mount();
  try {
    const infos = [...host.querySelectorAll('[data-personalization-note="info"]')];
    assert.ok(infos.length >= 2, "toggle + instructions + import 都应说明还没启用");
    assert.ok(infos.every((node) => node.textContent.includes(NOT_AVAILABLE)));
    assert.equal(host.querySelector('[data-personalization-note="error"]'), null);
    assert.equal(host.querySelector('[data-personalization-card="memory-toggle"] [role="switch"]'), null);
    assert.ok(host.querySelector("[data-personalization-memory-count]"));
    assert.match(host.querySelector('[data-personalization-card="memories"]').textContent, /先给结论/);
  } finally {
    await unmount();
  }
});
