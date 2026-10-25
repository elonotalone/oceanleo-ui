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
  url: "https://oceanleo.com/devices?tab=cloud",
});
const { window } = dom;
const { document } = window;
window.scrollTo = () => {};
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  InputEvent: window.InputEvent,
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
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiTextStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(
      /\\{(\\w+)\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);
const pageHeaderStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function PageHeader({ title }) {
    return React.createElement("h1", null, title);
  }
`);
const domainStubUrl = dataModule(`
  export const CONFIGURED_DOMAIN_FAMILY = globalThis.__devicesFamily || "com";
  export function currentDomainFamily() { return globalThis.__devicesFamily || "com"; }
  export function currentDomainProfile() {
    const family = currentDomainFamily();
    return {
      family,
      portalOrigin: family === "cn" ? "https://oceanleo.cn" : "https://oceanleo.com",
      gatewayOrigin: "",
      cookieDomain: "",
      registrableDomain: family === "cn" ? "oceanleo.cn" : "oceanleo.com",
    };
  }
  export function domainProfileForHost() { return currentDomainProfile(); }
  export function familyForHost() { return currentDomainFamily(); }
  export function runtimePageOrigin() { return currentDomainProfile().portalOrigin; }
  export function portalHref(path) { return path; }
  export function sharedCookieDomainFor() { return undefined; }
`);
const confirmDialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog() {
    return null;
  }
`);
const dialogStubUrl = dataModule(`
  export function CreateComputerDialog() { return null; }
  export function ConnectServerDialog() { return null; }
`);
const facadeStubUrl = dataModule(`
  export const devicesFacade = {
    async listDevices() { return { ok: true, data: [] }; },
    async pairDevice() { return { ok: true, data: null }; },
    async renameDevice() { return { ok: true, data: null }; },
    async revokeDevice() { return { ok: true, data: null }; },
  };
`);

const { DevicesPage } = await import(
  await compileModule("src/pages/DevicesPage.tsx", {
    "../facades/devices": facadeStubUrl,
    "../i18n/ui/useUI": uiTextStubUrl,
    "../ui": confirmDialogStubUrl,
    "./PageHeader": pageHeaderStubUrl,
    "../contracts/domain-family": domainStubUrl,
    "../shell/cloud-computer/CreateComputerDialog": dialogStubUrl,
    "../shell/cloud-computer/ConnectServerDialog": dialogStubUrl,
  })
);

function pc(overrides = {}) {
  return {
    id: "cc_1",
    name: "新加坡一号",
    source: "aliyun",
    status: "running",
    edition: "com",
    public_ip: "1.2.3.4",
    node_online: true,
    enrolled_at: "2026-09-20T00:00:00Z",
    confirmed_at: "2026-09-20T00:00:00Z",
    cost_to_date: { amount_minor: 120, currency: "USD" },
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...overrides,
  };
}

function makeCloudClient(items) {
  return {
    async listComputers() {
      return { items: items.map((item) => ({ ...item })) };
    },
    async listComputerEvents() {
      return { items: [] };
    },
    async getUsage() {
      return null;
    },
  };
}

async function flush(count = 8) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function render(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(DevicesPage, props));
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

test("paired clients and real cloud rows use a single reference-style grid", async () => {
  const view = await render({
    initialTab: "cloud",
    cloudClient: makeCloudClient([
      pc(),
      pc({
        id: "cc_legacy",
        name: "elon",
        source: "byo",
        status: "active",
        enrolled_at: null,
        confirmed_at: null,
        node_online: false,
      }),
    ]),
  });
  assert.ok(view.host.querySelector("[data-oceanleo-devices-page]"));
  assert.ok(view.host.querySelector("[data-device-grid]"));
  assert.equal(view.host.querySelector("[data-oceanleo-cc-section]"), null, "no second old-style cloud section");
  assert.ok(view.text().includes("云电脑"));
  const connected = view.host.querySelector('[data-oceanleo-cc-card="cc_1"]');
  const pending = view.host.querySelector('[data-oceanleo-cc-card="cc_legacy"]');
  assert.ok(connected);
  assert.ok(pending);
  assert.equal(connected.parentElement.hasAttribute("data-device-grid"), true);
  assert.equal(pending.parentElement, connected.parentElement);
  assert.equal(connected.getAttribute("data-oceanleo-cc-display-state"), "ready");
  assert.equal(pending.getAttribute("data-oceanleo-cc-display-state"), "pending_install");
  assert.ok(connected.querySelector('a[href="/computers/cc_1?card=acp"]'), "Tasks uses existing server ACP route");
  assert.doesNotMatch(connected.textContent, /进入桌面/, "a cloud node without desktop capability is not a native remote target");
  view.cleanup();
});

test("cloud deep link without rows keeps a real create/connect card, not another empty section", async () => {
  const view = await render({
    cloudClient: makeCloudClient([]),
  });
  assert.ok(view.host.querySelector("[data-device-connect-card]"));
  assert.equal(view.host.querySelector("[data-oceanleo-cc-empty]"), null);
  assert.ok(view.text().includes("创建云电脑"));
  view.cleanup();
});

test("CN family keeps the same cloud grid without depending on a COM-only section", async () => {
  globalThis.__devicesFamily = "cn";
  const view = await render({
    initialTab: "cloud",
    cloudClient: makeCloudClient([pc()]),
  });
  try {
    assert.ok(view.host.querySelector('[data-oceanleo-cc-card="cc_1"]'));
    assert.ok(view.host.querySelector("[data-device-grid]"));
  } finally {
    globalThis.__devicesFamily = "com";
    view.cleanup();
  }
});
