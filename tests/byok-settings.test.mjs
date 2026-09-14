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

test("ByokKeys 走密封 cookie 客户端，不把 key 写入 JS 存储", () => {
  assert.match(byokSource, /probeByok/);
  assert.match(byokSource, /putByok/);
  assert.match(byokSource, /deleteByok/);
  assert.match(byokSource, /type="password"/);
  assert.match(byokSource, /工具调用/);
  assert.match(byokSource, /图片输入/);
  assert.match(byokSource, /推理模式/);
  assert.doesNotMatch(byokSource, /localStorage/);
  assert.doesNotMatch(byokSource, /sessionStorage/);
  assert.doesNotMatch(byokSource, /indexedDB/);
});

test("account.ts 删除 /v1/keys 增删查，authed 带 credentials include", () => {
  assert.doesNotMatch(accountSource, /listUserKeys|addUserKey|deleteUserKey|\/v1\/keys"/);
  assert.match(accountSource, /\/v1\/keys\/providers/);
  const authedStart = accountSource.indexOf("async function authed");
  const authedBody = accountSource.slice(authedStart, accountSource.indexOf("\n}", authedStart) + 2);
  assert.match(authedBody, /credentials:\s*"include"/);
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

const { ByokKeys } = await import(
  await compileModule("src/pages/ByokKeys.tsx", {
    "../lib/auth": authStubUrl,
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

function makeStub(status) {
  return {
    getKeyProviders: async () => ({
      ok: true,
      data: { providers: defaultProviders() },
    }),
    getByok: async () => ({ ok: true, data: status }),
    putByok: async () => ({ ok: true, data: status }),
    deleteByok: async () => ({ ok: true, data: status }),
    probeByok: async () => ({ ok: true, data: { models: [], count: 0 } }),
  };
}

async function flush(count = 6) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {});
  }
}

async function render(status) {
  globalThis.__byokStub = makeStub(status);
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

test("enabled:false 时出现网关尚未启用 BYOK", async () => {
  const view = await render({
    enabled: false,
    providers: [],
    limits: { max_providers: 8 },
  });
  assert.ok(view.text().includes("网关尚未启用 BYOK"));
  view.cleanup();
});

test("enabled:true 列表出现指纹且不出现 sk-test", async () => {
  const view = await render({
    enabled: true,
    providers: [
      {
        provider: "openai",
        name: "OpenAI",
        fingerprint: "sk-…ab3f",
        base_url: "https://api.openai.com/v1",
        model: "gpt-4o",
        caps: ["tools"],
        added_at: 1_700_000_000,
      },
    ],
    limits: { max_providers: 8 },
  });
  assert.ok(view.text().includes("sk-…ab3f"));
  assert.equal(view.text().includes("sk-test"), false);
  view.cleanup();
});
