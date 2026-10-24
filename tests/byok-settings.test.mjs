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

async function render(status, overrides = {}) {
  globalThis.__byokStub = { ...makeStub(status), ...overrides };
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
  const select = view.host.querySelector("#byok-protocol");
  await act(async () => {
    select.value = "responses";
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await click(view.host, "[data-byok-save]");
  assert.equal(saved[0], "openai");
  assert.equal(saved[1].display_name, "My writing connection");
  assert.equal(saved[1].protocol, "responses");
  assert.equal(saved[1].api_key, "sk-private-test");
  assert.equal(view.host.querySelector("input[type=password]"), null);
  assert.doesNotMatch(view.text(), /sk-private-test/);
  view.cleanup();
});

test("configured connection alias hides wire model ID in settings summary", async () => {
  const view = await render({ ...enabled, providers: [{ provider: "openai", display_name: "Writing", model: "private-upstream-model", protocol: "responses", fingerprint: "sk-…1234", caps: ["tools"] }] });
  assert.match(view.text(), /Writing/);
  assert.doesNotMatch(view.text(), /private-upstream-model/);
  view.cleanup();
});

test("authorization availability is honest and no public subscription product is hardcoded", async () => {
  const view = await render(enabled);
  assert.equal(view.host.querySelector("[data-model-connection-add]").disabled, true);
  assert.match(view.text(), /当前暂不支持登录授权/);
  assert.doesNotMatch(view.text(), /ChatGPT Pro|Codex Pro/);
  view.cleanup();
});

test("authorization starts with alias and polls ready, binding cookie through status request", async () => {
  let started;
  let polls = 0;
  const connection = { id: "conn-owner", display_name: "My work", auth_type: "oauth", protocol: "responses", status: "ready", model: "private-wire-model" };
  const view = await render(enabled, {
    getModelConnections: async () => ({ ok: true, data: { enabled: true, authorization_available: true, connections: polls ? [connection] : [] } }),
    authorizeModelConnection: async (body) => { started = body; return { ok: true, data: { id: "attempt-1", status: "pending", instructions: "Use the official provider authorization flow", handoff_token: "single-use-code" } }; },
    getModelConnectionAuthorization: async () => { polls++; return { ok: true, data: { id: "attempt-1", status: "ready", connection } }; },
  });
  await click(view.host, "[data-model-connection-add]");
  await fill(view.host, "[data-model-connection-form] input:first-of-type", "My work");
  await fill(view.host, "[data-model-connection-form] label:nth-child(2) input", "private-wire-model");
  await click(view.host, "[data-model-connection-authorize]");
  assert.deepEqual(started, { display_name: "My work", model: "private-wire-model", caps: ["tools"], connection_id: undefined });
  assert.match(view.text(), /single-use-code/);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2100)); });
  assert.equal(polls, 1);
  assert.equal(view.host.querySelector("[data-model-connection-form]"), null);
  assert.match(view.text(), /My work/);
  assert.doesNotMatch(view.text(), /single-use-code|private-wire-model/);
  view.cleanup();
});

test("authorization cancellation stops polling and removes the one-time handoff", async () => {
  let polls = 0;
  const view = await render(enabled, {
    getModelConnections: async () => ({ ok: true, data: { enabled: true, authorization_available: true, connections: [{ id: "own", display_name: "Existing", status: "ready", model: "private-model" }] } }),
    authorizeModelConnection: async () => ({ ok: true, data: { id: "cancelled", status: "pending", handoff_token: "transient-code" } }),
    getModelConnectionAuthorization: async () => { polls++; return { ok: false }; },
  });
  const reconnect = [...view.host.querySelectorAll("button")].find((button) => button.textContent === "重新授权");
  await act(async () => reconnect.click());
  await click(view.host, "[data-model-connection-authorize]");
  assert.match(view.text(), /transient-code/);
  const cancel = [...view.host.querySelectorAll("[data-model-connection-form] button")].find((button) => button.textContent === "取消");
  await act(async () => cancel.click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2100)); });
  assert.equal(polls, 0);
  assert.doesNotMatch(view.text(), /transient-code/);
  view.cleanup();
});

test("disconnect is owner-reference based and errors never render server credential text", async () => {
  let deleted;
  const view = await render(enabled, {
    getModelConnections: async () => ({ ok: true, data: { enabled: true, authorization_available: true, connections: [{ id: "own-id", display_name: "My connection", status: "ready" }] } }),
    deleteModelConnection: async (id) => { deleted = id; return { ok: false, code: "reauth_required", error: "secret-token-do-not-render" }; },
  });
  await click(view.host, "[data-model-connection-delete]");
  assert.equal(deleted, "own-id");
  assert.match(view.text(), /断开连接失败/);
  assert.match(view.text(), /重新登录/);
  assert.doesNotMatch(view.text(), /secret-token-do-not-render/);
  view.cleanup();
});

test("expired authorization can be restarted and never shows upstream error text", async () => {
  let starts = 0;
  const view = await render(enabled, {
    getModelConnections: async () => ({ ok: true, data: { enabled: true, authorization_available: true, connections: [{ id: "own", display_name: "Work", status: "ready", model: "private-model" }] } }),
    authorizeModelConnection: async () => ({ ok: true, data: { id: `expiry-${++starts}`, status: "pending" } }),
    getModelConnectionAuthorization: async () => ({ ok: true, data: { id: "expiry-1", status: "expired", error: { code: "expired", message: "upstream-sensitive-value" } } }),
  });
  await act(async () => [...view.host.querySelectorAll("button")].find((button) => button.textContent === "重新授权").click());
  await click(view.host, "[data-model-connection-authorize]");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2100)); });
  assert.match(view.text(), /授权已过期/);
  assert.doesNotMatch(view.text(), /upstream-sensitive-value/);
  assert.equal(view.host.querySelector("[data-model-connection-authorize]").disabled, false);
  await click(view.host, "[data-model-connection-authorize]");
  assert.equal(starts, 2);
  view.cleanup();
});

test("saved authorization requires explicit activation and explains replacing current provider", async () => {
  let activated;
  const view = await render(enabled, {
    getModelConnections: async () => ({ ok: true, data: { enabled: true, authorization_available: true, connections: [{ id: "saved-owner-reference", display_name: "Saved connection", status: "ready", active: !!activated }] } }),
    activateModelConnection: async (id) => { activated = id; return { ok: true, data: { ok: true } }; },
  });
  assert.equal(activated, undefined);
  assert.match(view.text(), /使用此连接将替换这台设备上同厂商的当前配置/);
  await click(view.host, "[data-model-connection-activate]");
  assert.equal(activated, "saved-owner-reference");
  assert.equal(view.host.querySelector("[data-model-connection-activate]"), null);
  view.cleanup();
});
