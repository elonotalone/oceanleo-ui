import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/website" });
const { window } = dom;
for (const [name, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement, Element: window.Element, Node: window.Node })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLElement.prototype.attachEvent = () => {};
globalThis.__copied = "";
Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { globalThis.__copied = value; } } });

const state = {
  error: false,
  domainReads: 0,
  verifyCalls: [],
  addCalls: [],
  enableCalls: [],
  domains: [{ id: "d1", domain: "www.example.org", status: "pending", dns_records: [
    { type: "CNAME", name: "www.example.org", value: "demo.oceanleo.app" },
    { type: "TXT", name: "_oceanleo-verify.www.example.org", value: "oceanleo-domain-verification=token" },
  ] }],
  access: { desired_mode: "public", effective_mode: "public", enforcement_status: "not_enforced" },
};
const apiStub = dataModule(`
  export const websitePlatformApi = {
    async domains() { globalThis.__website.domainReads++; if (globalThis.__website.error) throw new Error("domain API unavailable"); return { domains: globalThis.__website.domains }; },
    async verifyDomain(_project, domain) { globalThis.__website.verifyCalls.push(domain); return { domain }; },
    async addDomain(_project, domain) { globalThis.__website.addCalls.push(domain); return { domain }; },
    async websiteAccess() { if (globalThis.__website.error) throw new Error("access API unavailable"); return { published_site_access: globalThis.__website.access }; },
    async setWebsiteAccess(_project, mode) { globalThis.__website.enableCalls.push(mode); globalThis.__website.access = { desired_mode: mode, effective_mode: mode, enforcement_status: "enforced" }; return { published_site_access: globalThis.__website.access }; },
    async authUsers() { if (globalThis.__website.error) throw new Error("users API unavailable"); return { users: [{ id: "u1", email: "user@example.org", created_at: "2026-11-06T00:00:00Z" }] }; },
    async analytics() { if (globalThis.__website.error) throw new Error("analytics API unavailable"); return { metrics: { page_views: 12, visits: 7 } }; },
  };
`);
const uiStub = dataModule(`export function useUI() { return text => text; }`);
const mod = await import(await compileModule("src/shell/website-platform/WebsiteManagementPanels.tsx", {
  "../../lib/website-platform-api": apiStub,
  "../../i18n/ui/useUI": uiStub,
}));
globalThis.__website = state;

async function settle() { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }
function button(container, label) { return [...container.querySelectorAll("button")].find(entry => entry.textContent === label); }
function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return { container, render: () => act(async () => { root.render(React.createElement(mod.WebsiteManagementPanels, { projectId: "project-1" })); }), unmount: () => act(async () => { root.unmount(); }) };
}

test("management panels render data, copy records, verify DNS, add domains, enable login, and show stats", async () => {
  state.error = false; state.domainReads = 0; state.verifyCalls.length = 0; state.addCalls.length = 0; state.enableCalls.length = 0; state.access = { desired_mode: "public", effective_mode: "public", enforcement_status: "not_enforced" };
  const view = mount(); await view.render(); await settle();
  assert.match(view.container.querySelector('[data-testid="website-management-domain"]').textContent, /www\.example\.org/);
  assert.match(view.container.querySelector('[data-testid="website-management-domain"]').textContent, /demo\.oceanleo\.app/);
  assert.match(view.container.querySelector('[data-testid="website-management-domain"]').textContent, /oceanleo-domain-verification=token/);
  assert.match(view.container.querySelector('[data-testid="website-management-domain"]').textContent, /pending/);
  await act(async () => button(view.container, "复制").click());
  assert.equal(globalThis.__copied, "demo.oceanleo.app");
  await act(async () => button(view.container, "验证 DNS").click()); await settle();
  assert.deepEqual(state.verifyCalls, ["www.example.org"]); assert.ok(state.domainReads >= 2);
  const input = view.container.querySelector('input[placeholder="example.com"]');
  input.focus();
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "shop.example.org"); input._valueTracker?.setValue("");
  await act(async () => input.dispatchEvent(new window.InputEvent("input", { bubbles: true, inputType: "insertText", data: "shop.example.org" })));
  await act(async () => input.dispatchEvent(new window.Event("input", { bubbles: true })));
  await act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true })));
  await settle();
  assert.equal(input.value, "shop.example.org");
  assert.equal(button(view.container, "添加").disabled, false);
  await act(async () => button(view.container, "添加").click()); await settle();
  assert.deepEqual(state.addCalls, ["shop.example.org"]);
  await act(async () => button(view.container, "启用网站登录").click()); await settle();
  assert.deepEqual(state.enableCalls, ["authenticated"]);
  assert.match(view.container.querySelector('[data-testid="website-management-users"]').textContent, /user@example\.org/);
  assert.match(view.container.querySelector('[data-testid="website-management-statistics"]').textContent, /12/);
  await view.unmount(); view.container.remove();
});

test("management panels surface API errors", async () => {
  state.error = true;
  const view = mount(); await view.render(); await settle();
  assert.match(view.container.textContent, /domain API unavailable|access API unavailable|users API unavailable|analytics API unavailable/);
  await view.unmount(); view.container.remove();
  state.error = false;
});
