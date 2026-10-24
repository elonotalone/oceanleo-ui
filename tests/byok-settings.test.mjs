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
const apiPageSource = readFileSync(new URL("../src/pages/ApiPage.tsx", import.meta.url), "utf8");
const guidePageSource = readFileSync(
  new URL("../src/pages/ApiGuidePage.tsx", import.meta.url),
  "utf8",
);
const accountSource = readFileSync(
  new URL("../src/lib/auth/account.ts", import.meta.url),
  "utf8",
);

test("ByokKeys 走密封 cookie 客户端，不把 key 写入 JS 存储", () => {
  assert.doesNotMatch(byokSource, /probeByok/);
  assert.match(byokSource, /saveByokConnection/);
  assert.match(byokSource, /deleteByok/);
  assert.match(byokSource, /type="password"/);
  assert.match(byokSource, /data-byok-add-model/);
  assert.doesNotMatch(byokSource, /localStorage/);
  assert.doesNotMatch(byokSource, /sessionStorage/);
  assert.doesNotMatch(byokSource, /indexedDB/);
  assert.match(byokSource, /HELP_BYOK_ARTICLE_PATH/);
  assert.match(byokSource, /data-byok-help/);
  assert.doesNotMatch(byokSource, /指导文档/);
});

test("ApiPage 不再嵌指导文档；ApiGuidePage 不再列厂商", () => {
  assert.doesNotMatch(apiPageSource, /ApiGuidePage/);
  assert.doesNotMatch(guidePageSource, /PLATFORMS/);
  assert.doesNotMatch(
    guidePageSource,
    /阿里云百炼|DeepSeek|OpenRouter|火山方舟|Anthropic/,
  );
  assert.match(guidePageSource, /HELP_BYOK_ARTICLE_PATH/);
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
  export function saveByokConnection() { return stub().putByok(...arguments); }
  export function deleteByokConnection() { return stub().deleteByok(...arguments); }
  export function deleteByok() { return stub().deleteByok(...arguments); }
  export function probeByok() { return stub().probeByok(...arguments); }
  export function getModelConnections() { return stub().getModelConnections(); }
  export function authorizeModelConnection() { return stub().authorizeModelConnection(...arguments); }
  export function getModelConnectionAuthorization() { return stub().getModelConnectionAuthorization(...arguments); }
  export function deleteModelConnection() { return stub().deleteModelConnection(...arguments); }
  export function activateModelConnection() { return stub().activateModelConnection(...arguments); }
  export function invalidateSelectedModelsCache() {}
`);

const { ByokKeys } = await import(
  await compileModule("src/pages/ByokKeys.tsx", {
    "../lib/auth": authStubUrl,
    "../contracts/domain-family": dataModule('export function runtimePageHost() { return "oceanleo.com"; }'),
    "../lib/help-url": dataModule('export const HELP_BYOK_ARTICLE_PATH = "/a/bring-your-own-key"; export function helpCenterUrl({path}) { return "https://help.oceanleo.com" + path; }'),
    "../shell/byok-status": dataModule('export const BYOK_STATUS_CHANGED_EVENT = "oceanleo:byok-status-changed"; export function invalidateByokStatus() {}'),
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
    getModelConnections: async () => ({ ok: true, data: { enabled: true, authorization_available: false, connections: [] } }),
  };
}

async function flush(count = 6) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {});
  }
}

async function render(status, overrides = {}, props = {}) {
  globalThis.__byokStub = { ...makeStub(status), ...overrides };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ByokKeys, { loggedIn: true, ...props }));
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

async function click(host, selector) {
  const node = host.querySelector(selector);
  assert.ok(node, selector);
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

test("没有已存 key 时不出现已配置的厂商空表，也不摊开空输入框", async () => {
  const view = await render({
    enabled: true,
    providers: [],
    limits: { max_providers: 8 },
  });
  assert.equal(view.host.querySelector("[data-byok-configured]"), null);
  assert.equal(view.text().includes("已配置的厂商"), false);
  assert.equal(view.host.querySelector("[data-byok-editor]")?.getAttribute("data-byok-editor"), "none");
  assert.ok(view.host.querySelector("[data-byok-add]"));
  assert.match(view.text(), /还没有自带密钥/);
  assert.equal(view.host.querySelector("[data-byok-form]"), null);
  assert.equal(view.host.querySelector("input"), null);
  assert.equal(view.host.querySelector("textarea"), null);
  const help = view.host.querySelector("[data-byok-help]");
  assert.ok(help);
  assert.match(help.getAttribute("href") || "", /\/a\/bring-your-own-key/);
  await click(view.host, "[data-byok-add]");
  assert.equal(view.host.querySelector("[data-byok-editor]")?.getAttribute("data-byok-editor"), "add");
  assert.ok(view.host.querySelector("[data-byok-form]"));
  assert.ok(view.host.querySelector("input[type=password]"));
  await click(view.host, "[data-byok-cancel]");
  assert.equal(view.host.querySelector("[data-byok-form]"), null);
  assert.equal(view.host.querySelector("input[type=password]"), null);
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
  const configured = view.host.querySelector("[data-byok-configured]");
  assert.ok(configured);
  assert.equal(view.host.querySelector("[data-byok-form]"), null);
  assert.equal(view.host.querySelector("input[type=password]"), null);
  assert.ok(view.host.querySelector("[data-byok-delete=openai]"));
  await click(view.host, "[data-byok-add]");
  const form = view.host.querySelector("[data-byok-form]");
  assert.ok(form, "点添加后才出现填写表单");
  assert.equal(
    Boolean(configured.compareDocumentPosition(form) & window.Node.DOCUMENT_POSITION_FOLLOWING),
    true,
    "已存 key 的清单要在填写表单上面",
  );
  await click(view.host, "[data-byok-cancel]");
  assert.equal(view.host.querySelector("[data-byok-form]"), null);
  const help = view.host.querySelector("[data-byok-help]");
  assert.ok(help, "设置页要有指向帮助中心的自带密钥说明");
  assert.match(help.getAttribute("href") || "", /\/a\/bring-your-own-key/);
  view.cleanup();
});

const enabled = { enabled: true, providers: [], limits: { max_providers: 8 } };

async function fill(host, selector, value) {
  const node = host.querySelector(selector);
  assert.ok(node, selector);
  await act(async () => {
    const propsKey = Object.keys(node).find((key) => key.startsWith("__reactProps$"));
    node[propsKey].onChange({ target: { value } });
  });
}

test("API-key form sends alias/protocol and retains sealed-cookie API contract", async () => {
  let saved;
  const view = await render(enabled, {
    putByok: async (...args) => { saved = args; return { ok: true, data: enabled }; },
  });
  await click(view.host, "[data-byok-add]");
  await fill(view.host, "#byok-alias", "My writing connection");
  await fill(view.host, "input[type=password]", "sk-private-test");
  await fill(view.host, '[aria-label="模型 ID 1"]', "upstream-one");
  await click(view.host, "[data-byok-add-model]");
  await fill(view.host, '[aria-label="模型 ID 2"]', "upstream-two");
  const select = view.host.querySelector("#byok-protocol");
  await act(async () => {
    select.value = "responses";
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await click(view.host, "[data-byok-save]");
  assert.equal(saved[0].provider, "openai");
  assert.equal(saved[0].display_name, "My writing connection");
  assert.equal(saved[0].protocol, "responses");
  assert.equal(saved[0].api_key, "sk-private-test");
  assert.deepEqual(saved[0].models.map(row => row.id), ["upstream-one", "upstream-two"]);
  assert.equal(view.host.querySelector("input[type=password]"), null);
  assert.doesNotMatch(view.text(), /sk-private-test/);
  view.cleanup();
});

test("settings show actual provider/model alongside optional remark", async () => {
  const view = await render({ ...enabled, providers: [{ provider: "openai", display_name: "Writing", model: "private-upstream-model", protocol: "responses", fingerprint: "sk-…1234", caps: ["tools"] }] });
  assert.match(view.text(), /Writing/);
  assert.match(view.text(), /private-upstream-model/);
  assert.match(view.text(), /openai/);
  assert.match(view.text(), /responses/);
  assert.equal(view.host.querySelector("[data-model-connections]"), null);
  view.cleanup();
});

test("empty remark preserves legacy provider/model display and no OAuth section", async () => {
  let saved;
  const view = await render(enabled, { putByok: async (...args) => { saved = args; return { ok: true, data: enabled }; } });
  await click(view.host, "[data-byok-add]");
  assert.match(view.text(), /备注（选填）/);
  await fill(view.host, "input[type=password]", "sk-private-test");
  await fill(view.host, '[aria-label="模型 ID 1"]', "upstream-one");
  await click(view.host, "[data-byok-save]");
  assert.equal(saved[0].display_name, "");
  assert.equal(view.host.querySelector("[data-model-connection-add]"), null);
  assert.doesNotMatch(view.text(), /登录授权|一次性授权交接码/);
  view.cleanup();
});

test("connection metadata edit preserves key and stable model routes; same provider connections stay distinct", async () => {
  let saved;
  const connection = { connection_id: "first", provider: "openai", display_name: "First", fingerprint: "…1234", base_url: "https://api.openai.com/v1", protocol: "responses", models: [{ route_id: "stable-one", id: "real-model", name: "Friendly" }] };
  const status = { ...enabled, connections: [connection, { ...connection, connection_id: "second", display_name: "Second" }] };
  const view = await render(status, { putByok: async (...args) => { saved = args; return { ok: true, data: status }; } });
  assert.match(view.text(), /First/);
  assert.match(view.text(), /Second/);
  assert.match(view.text(), /real-model/);
  await click(view.host, '[data-byok-edit="first"]');
  assert.equal(view.host.querySelector('input[type=password]').value, "");
  await fill(view.host, "#byok-alias", "Renamed");
  await click(view.host, "[data-byok-save]");
  assert.equal(saved[1], "first");
  assert.equal(saved[0].api_key, undefined);
  assert.equal(saved[0].models[0].route_id, "stable-one");
  assert.equal(saved[0].models[0].id, "real-model");
  view.cleanup();
});

test("connection save failure keeps manual models and editor visible", async () => {
  const view = await render(enabled, { putByok: async () => ({ ok: false, error: "Connection could not be saved" }) });
  await click(view.host, "[data-byok-add]");
  await fill(view.host, "input[type=password]", "private-key");
  await fill(view.host, '[aria-label="模型 ID 1"]', "manual-model");
  await click(view.host, "[data-byok-save]");
  assert.match(view.text(), /Connection could not be saved/);
  assert.equal(view.host.querySelector('[aria-label="模型 ID 1"]').value, "manual-model");
  assert.ok(view.host.querySelector("[data-byok-form]"));
  view.cleanup();
});

test("legacy key-only target opens a blank model row and preserves its existing key on save", async () => {
  let saved;
  const connection = { connection_id: "legacy-custom", provider: "custom", display_name: "中转自用gpt", base_url: "https://example.com/v1", models: [] };
  const status = { ...enabled, connections: [connection] };
  const view = await render(status, { putByok: async (...args) => { saved = args; return { ok: true, data: status }; } }, { initialConnectionId: "legacy-custom" });
  assert.equal(view.host.querySelector('[data-byok-editor]').getAttribute("data-byok-editor"), "edit");
  assert.equal(view.host.querySelectorAll("[data-byok-model-row]").length, 1);
  assert.equal(view.host.querySelector('[aria-label="模型 ID 1"]').value, "");
  assert.equal(view.host.querySelector('input[type="password"]').value, "");
  await fill(view.host, '[aria-label="模型 ID 1"]', "actual-model-id");
  await click(view.host, "[data-byok-save]");
  assert.equal(saved[1], "legacy-custom");
  assert.equal(saved[0].api_key, undefined);
  assert.equal(saved[0].models[0].id, "actual-model-id");
  view.cleanup();
});

test("a canceled write cannot leave a delayed reauthorization error on the connection list", async () => {
  let resolve;
  const view = await render(enabled, { putByok: () => new Promise(done => { resolve = done; }) });
  await click(view.host, "[data-byok-add]");
  await fill(view.host, "input[type=password]", "synthetic-test-key");
  await fill(view.host, '[aria-label="模型 ID 1"]', "actual-model");
  await click(view.host, "[data-byok-save]");
  await click(view.host, "[data-byok-cancel]");
  await act(async () => resolve({ ok: false, status: 403, code: "reauth_required", error: "Stale reauthorization failure" }));
  await flush();
  assert.equal(view.host.querySelector('[data-byok-editor]').getAttribute("data-byok-editor"), "none");
  assert.doesNotMatch(view.text(), /Stale reauthorization failure/);
  view.cleanup();
});
