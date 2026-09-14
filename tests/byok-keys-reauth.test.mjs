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
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const byokSource = readFileSync(new URL("../src/pages/ByokKeys.tsx", import.meta.url), "utf8");
const accountSource = readFileSync(
  new URL("../src/lib/auth/account.ts", import.meta.url),
  "utf8",
);

test("account.ts 把 403 reauth_required 收成可识别的 code", () => {
  assert.match(accountSource, /reauth_required/);
  assert.match(accountSource, /rec\.code/);
});

test("ByokKeys 对 reauth_required 画出重新登录按钮", () => {
  assert.match(byokSource, /reauth_required/);
  assert.match(byokSource, /重新登录/);
  assert.match(byokSource, /signOutEverywhere/);
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/api",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
  HTMLSelectElement: window.HTMLSelectElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);

const authStubUrl = dataModule(`
  const stub = () => globalThis.__byokStub;
  export function getKeyProviders() { return stub().getKeyProviders(); }
  export function getByok() { return stub().getByok(); }
  export function putByok() { return stub().putByok(...arguments); }
  export function deleteByok() { return stub().deleteByok(...arguments); }
  export function probeByok() { return stub().probeByok(...arguments); }
`);

const clientStubUrl = dataModule(`
  export async function signOutEverywhere() {
    globalThis.__byokSignedOut = true;
  }
`);

const { ByokKeys } = await import(
  await compileModule("src/pages/ByokKeys.tsx", {
    "../lib/auth": authStubUrl,
    "../lib/auth/client": clientStubUrl,
    "../i18n/ui/useUI": uiStubUrl,
  })
);

function defaultProviders() {
  return [
    {
      id: "openai",
      name: "OpenAI",
      needs_base_url: false,
      default_model: "gpt-4o",
      protocol: "openai",
      capabilities: ["text"],
      key_help_url: "https://platform.openai.com/api-keys",
      key_prefix: "sk-",
      base_url: "https://api.openai.com/v1",
    },
  ];
}

function makeStub(writeResult) {
  const enabled = {
    enabled: true,
    providers: [],
    limits: { max_providers: 8 },
  };
  return {
    getKeyProviders: async () => ({
      ok: true,
      data: { providers: defaultProviders() },
    }),
    getByok: async () => ({ ok: true, data: enabled }),
    putByok: async () => writeResult,
    deleteByok: async () => ({ ok: true, data: enabled }),
    probeByok: async () => writeResult,
  };
}

async function flush(count = 8) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {});
  }
}

async function clickLabeled(host, label) {
  const button = [...host.querySelectorAll("button")].find(
    (node) => (node.textContent || "").trim() === label,
  );
  assert.ok(button, `missing button ${label}`);
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

async function render(writeResult) {
  globalThis.__byokStub = makeStub(writeResult);
  globalThis.__byokSignedOut = false;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ByokKeys, { loggedIn: true }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("403 reauth_required 出现重新登录按钮", async () => {
  const view = await render({
    ok: false,
    status: 403,
    code: "reauth_required",
    error: "为了保护你的钥匙，请重新登录后再添加",
  });
  await clickLabeled(view.host, "探测");
  assert.ok(view.text().includes("为了保护你的钥匙，请重新登录后再添加"));
  const button = [...view.host.querySelectorAll("button")].find(
    (node) => (node.textContent || "").trim() === "重新登录",
  );
  assert.ok(button);
  view.cleanup();
});

test("其它 4xx 只显示原来的错误，不出现重新登录按钮", async () => {
  const view = await render({
    ok: false,
    status: 400,
    error: "未知服务商，不能在此使用。",
  });
  await clickLabeled(view.host, "探测");
  assert.ok(view.text().includes("未知服务商，不能在此使用。"));
  const button = [...view.host.querySelectorAll("button")].find(
    (node) => (node.textContent || "").trim() === "重新登录",
  );
  assert.equal(button, undefined);
  view.cleanup();
});
