// 程序行（W3）：五项顺序、三态按钮、文案键、Key 卡四程序通用 + hermes 供应商下拉。
// 渲染真 ProgramRow + 真 KeySheet，stub 掉 useUI / lib/agent / auth（网络与 token）。

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
  HTMLInputElement: window.HTMLInputElement,
  HTMLSelectElement: window.HTMLSelectElement,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function useUI() {
    return (value, vars) => {
      if (!vars) return value;
      return value.replace(/\\{(\\w+)\\}/g, (token, key) => (key in vars ? String(vars[key]) : token));
    };
  }
`);
const agentStub = dataModule(`
  export async function getTask() {
    return { ok: true, data: { task: { id: "task_1", computer_id: "cc_1" } } };
  }
`);
const authStub = dataModule(`
  export async function accessToken() { return "tok"; }
  export function cachedAccessToken() { return "tok"; }
`);
const configStub = dataModule(`
  export const GATEWAY_BASE = "https://gateway.test";
`);

const { ProgramRow } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/ProgramRow.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../../../lib/agent": agentStub,
    "../../../lib/auth/client": authStub,
    "../../../lib/auth/config": configStub,
  })
);

const PROGRAMS = [
  { id: "cursor", installed: true, path: "/c", version: "1.2.3", auth: "key", logged_in: true, dir_capability: "full", running: false },
  { id: "hermes", installed: true, path: "/h", version: "2", auth: "none", logged_in: false, dir_capability: "link_only", running: false },
  { id: "claude", installed: false, path: "", version: "", auth: "unknown", logged_in: null, dir_capability: "none", running: false },
  { id: "codex", installed: true, path: "/x", version: "9.9", auth: "login", logged_in: true, dir_capability: "full", running: true },
];

function fakeDialog(overrides = {}) {
  const calls = { retry: 0, openInstall: [], openLogin: [], setProgram: [], closeProgram: [] };
  const dialog = {
    program: null,
    programs: PROGRAMS,
    openedPrograms: [],
    login: { open: false },
    setProgram: (p) => calls.setProgram.push(p),
    openInstall: (p) => calls.openInstall.push(p),
    openLogin: (p) => calls.openLogin.push(p),
    closeProgram: (p) => calls.closeProgram.push(p),
    retryConnect: () => { calls.retry += 1; },
  };
  return { calls, dialog: { ...dialog, ...overrides } };
}

async function render(dialog) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ProgramRow, { dialog }));
  });
  return {
    host,
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function click(element) {
  assert.ok(element);
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

test("五项顺序：OceanLeo agent 第一，其余按 cursor/hermes/claude/codex", async () => {
  const { calls, dialog } = fakeDialog();
  const view = await render(dialog);
  try {
    const ids = [...view.host.querySelectorAll("[data-oceanleo-cc-program]")].map((node) =>
      node.getAttribute("data-oceanleo-cc-program"),
    );
    assert.deepEqual(ids, ["oceanleo", "cursor", "hermes", "claude", "codex"]);
    const text = view.host.textContent || "";
    assert.match(text, /OceanLeo agent[\s\S]*Cursor[\s\S]*Hermes[\s\S]*Claude Code[\s\S]*Codex/);
    // oceanleo 恒绿点、无安装/登录/Key 按钮；点击只切程序
    const oceanleo = view.host.querySelector('[data-oceanleo-cc-program="oceanleo"]');
    assert.ok(oceanleo.querySelector('[data-oceanleo-cc-dot="green"]'));
    assert.equal(oceanleo.querySelector("[data-oceanleo-cc-install]"), null);
    assert.equal(oceanleo.querySelector("[data-oceanleo-cc-login]"), null);
    assert.equal(oceanleo.querySelector("[data-oceanleo-cc-key]"), null);
    await click(oceanleo.querySelector("[data-oceanleo-cc-dialog-oceanleo]"));
    assert.deepEqual(calls.setProgram, ["oceanleo"]);
  } finally {
    view.cleanup();
  }
});

test("三态按钮与文案：未装→安装；未认证→登录+Key；key→Key ✓+移除；login→已登录+版本", async () => {
  const { dialog } = fakeDialog();
  const view = await render(dialog);
  try {
    // claude 未安装：灰点 + 安装，无登录/Key
    const claude = view.host.querySelector('[data-oceanleo-cc-program="claude"]');
    assert.ok(claude.querySelector('[data-oceanleo-cc-dot="gray"]'));
    assert.ok(claude.querySelector('[data-oceanleo-cc-install="claude"]'));
    assert.equal(claude.querySelector('[data-oceanleo-cc-login="claude"]'), null);
    assert.equal(claude.querySelector('[data-oceanleo-cc-key="claude"]'), null);

    // hermes 未认证：黄点 + 「登录」+「Key」，绝不能出「已登录」
    const hermes = view.host.querySelector('[data-oceanleo-cc-program="hermes"]');
    assert.ok(hermes.querySelector('[data-oceanleo-cc-dot="yellow"]'));
    const login = hermes.querySelector('[data-oceanleo-cc-login="hermes"]');
    assert.ok(login);
    assert.equal(login.textContent, "登录");
    assert.ok(hermes.querySelector('[data-oceanleo-cc-key="hermes"]'));
    assert.equal(hermes.querySelector('[data-oceanleo-cc-signed-in="hermes"]'), null);
    assert.equal(hermes.textContent.includes("已登录"), false);

    // cursor auth=key：绿点 + 「Key ✓」+「移除」，无登录按钮
    const cursor = view.host.querySelector('[data-oceanleo-cc-program="cursor"]');
    assert.ok(cursor.querySelector('[data-oceanleo-cc-dot="green"]'));
    assert.equal(cursor.querySelector('[data-oceanleo-cc-key-saved="cursor"]').textContent, "Key ✓");
    assert.ok(cursor.querySelector('[data-oceanleo-cc-key-remove="cursor"]'));
    assert.equal(cursor.querySelector('[data-oceanleo-cc-login="cursor"]'), null);

    // codex auth=login：绿点 + 版本 + 「已登录」+ running 小圆点
    const codex = view.host.querySelector('[data-oceanleo-cc-program="codex"]');
    assert.ok(codex.querySelector('[data-oceanleo-cc-dot="green"]'));
    assert.equal(codex.querySelector('[data-oceanleo-cc-version="codex"]').textContent, "9.9");
    assert.equal(codex.querySelector('[data-oceanleo-cc-signed-in="codex"]').textContent, "已登录");
    assert.ok(codex.querySelector('[data-oceanleo-cc-running="1"]'));
    assert.ok(codex.querySelector('[data-oceanleo-cc-close-session="codex"]'));
  } finally {
    view.cleanup();
  }
});

test("auth=unknown 给灰「未知」+「刷新」，malformed 按未认证对待", async () => {
  const { calls, dialog } = fakeDialog({
    programs: [
      { id: "cursor", installed: true, path: "/c", version: "", auth: "unknown", logged_in: null, dir_capability: "full", running: false },
      { id: "hermes", installed: true, path: "/h", version: "", auth: "malformed", logged_in: false, dir_capability: "full", running: false },
    ],
  });
  const view = await render(dialog);
  try {
    const cursor = view.host.querySelector('[data-oceanleo-cc-program="cursor"]');
    assert.ok(cursor.querySelector('[data-oceanleo-cc-dot="unknown"]'));
    assert.equal(cursor.querySelector('[data-oceanleo-cc-unknown="cursor"]').textContent, "未知");
    await click(cursor.querySelector('[data-oceanleo-cc-refresh="cursor"]'));
    assert.equal(calls.retry, 1);
    // malformed：网关幂等修复前先按未认证展示（登录+Key）
    const hermes = view.host.querySelector('[data-oceanleo-cc-program="hermes"]');
    assert.ok(hermes.querySelector('[data-oceanleo-cc-login="hermes"]'));
    assert.ok(hermes.querySelector('[data-oceanleo-cc-key="hermes"]'));
  } finally {
    view.cleanup();
  }
});

test("Key 卡：四程序通用，hermes 多供应商下拉，保存走 I3 路由并触发状态刷新", async () => {
  const marker = document.createElement("div");
  marker.setAttribute("data-oceanleo-cc-shell-task", "task_1");
  document.body.append(marker);
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    return { ok: true, status: 200, json: async () => ({ ok: true, auth: "key" }) };
  };
  const { calls: dc, dialog } = fakeDialog();
  const view = await render(dialog);
  try {
    await click(view.host.querySelector('[data-oceanleo-cc-key="hermes"]'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const sheet = view.host.querySelector('[data-oceanleo-cc-key-sheet-program="hermes"]');
    assert.ok(sheet);
    const provider = sheet.querySelector("[data-oceanleo-cc-key-provider]");
    assert.ok(provider);
    assert.deepEqual([...provider.options].map((o) => o.value), ["openrouter", "anthropic", "openai", "deepseek", "xai"]);
    // 说明句来自 copy 的 keyWhereHermes
    assert.match(sheet.textContent || "", /Hermes 用所选供应商的 API key/);

    const input = sheet.querySelector("[data-oceanleo-cc-key-input]");
    const propKey = Object.keys(input).find((name) => name.startsWith("__reactProps"));
    assert.ok(propKey);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter.call(input, "sk-test");
      input[propKey].onChange({ target: input, currentTarget: input });
    });
    await click(sheet.querySelector("[data-oceanleo-cc-key-save]"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gateway.test/v1/computers/cc_1/programs/hermes/key");
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, { key: "sk-test", provider: "openrouter" });
    // 成功后关卡 + 触发状态刷新
    assert.equal(view.host.querySelector("[data-oceanleo-cc-key-sheet]"), null);
    assert.equal(dc.retry, 1);
  } finally {
    globalThis.fetch = previousFetch;
    view.cleanup();
    marker.remove();
  }
});

test("已有 key 的行：移除打开 Key 卡 hasKey 态，DELETE 走 query provider", async () => {
  const marker = document.createElement("div");
  marker.setAttribute("data-oceanleo-cc-shell-task", "task_1");
  document.body.append(marker);
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const { calls: dc, dialog } = fakeDialog();
  const view = await render(dialog);
  try {
    await click(view.host.querySelector('[data-oceanleo-cc-key-remove="cursor"]'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const sheet = view.host.querySelector('[data-oceanleo-cc-key-sheet-program="cursor"]');
    assert.ok(sheet);
    assert.ok(sheet.querySelector("[data-oceanleo-cc-key-saved-badge]"));
    assert.equal(sheet.querySelector("[data-oceanleo-cc-key-input]"), null);
    await click(sheet.querySelector("[data-oceanleo-cc-key-remove]"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gateway.test/v1/computers/cc_1/programs/cursor/key");
    assert.equal(calls[0].method, "DELETE");
    assert.equal(dc.retry, 1);
  } finally {
    globalThis.fetch = previousFetch;
    view.cleanup();
    marker.remove();
  }
});
