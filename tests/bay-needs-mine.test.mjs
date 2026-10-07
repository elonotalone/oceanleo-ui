// W04：我的需求 / 我的报价。MyProposalsPane 请求 proposals/mine。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", { url: "https://design.oceanleo.com/bay" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const httpStub = dataModule(`
  globalThis.__bayHttpCalls ??= [];
  export class BayApiError extends Error {
    constructor(message, status = 0, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function reply(method, path, body, opts) {
    globalThis.__bayHttpCalls.push({ method, path, body, opts });
    const responder = globalThis.__bayHttpRespond;
    return responder ? responder(method, path, body, opts) : {};
  }
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function useBayTaskContext(){ return null; }
  export function bayHrefOnSite(){ return ""; }
`);
const agentStub = dataModule(`export async function authed(){ return { ok: true, data: {} }; }`);
const domainStub = dataModule(`
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function currentFamilySubsiteOrigin(){ return undefined; }
  export function portalHref(path){ return "https://oceanleo.test" + path; }
`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../shell/bay-state": stateStub,
  "../../../contracts/domain-family": domainStub,
};

const { MyNeedsPane } = await import(await compileModule("src/shell/bay/needs/MyNeedsPane.tsx", stubs));
const { MyProposalsPane } = await import(await compileModule("src/shell/bay/needs/MyProposalsPane.tsx", stubs));

function reset() {
  globalThis.__bayHttpCalls = [];
  globalThis.__bayOpened = [];
  globalThis.__baySignedIn = true;
  globalThis.__bayHttpRespond = (method, path) => {
    if (method === "GET" && path === "/v1/talent/categories") {
      return { items: [], flat_items: [{ slug: "doc", name_zh: "文档与表格", catalog_kind: "delivery", regulated_domain: "none", published: true, position: 50 }], total: 1, site_defaults: {} };
    }
    if (method === "GET" && String(path).startsWith("/v1/talent/demands/mine")) {
      return { items: [{ id: "d1", title: "做一份路演稿", category: "doc", status: "open", proposal_count: 2, budget_min_fen: 50000, budget_max_fen: 50000, currency: "CNY", created_at: new Date().toISOString() }], total: 1 };
    }
    if (method === "GET" && String(path).startsWith("/v1/talent/proposals/mine")) {
      return { items: [{ id: "p1", demand_id: "d1", price_fen: 80000, currency: "CNY", status: "pending", created_at: new Date().toISOString(), demand: { id: "d1", title: "做一份路演稿", status: "open", category: "doc", posted_site: "ppt" } }], next_cursor: null };
    }
    return {};
  };
}

async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => {});
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await settle();
  return {
    host,
    click: async (selector) => {
      const node = host.querySelector(selector);
      assert.ok(node, `找不到 ${selector}`);
      await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      await settle();
    },
    unmount: () => act(() => root.unmount()),
  };
}

test("目标对不上时不画", () => {
  const props = { target: { kind: "mine", tab: "orders" }, layout: "docked", siteKey: "design" };
  assert.equal(renderToStaticMarkup(React.createElement(MyNeedsPane, props)), "");
  assert.equal(renderToStaticMarkup(React.createElement(MyProposalsPane, props)), "");
});

test("我的需求：列出我发的，点开详情；未登录先登录", async () => {
  reset();
  const view = await mount(React.createElement(MyNeedsPane, { target: { kind: "mine", tab: "needs" }, layout: "docked", siteKey: "design" }));
  assert.equal(view.host.querySelector("header"), null);
  assert.match(view.host.textContent, /做一份路演稿/);
  await view.click("[data-bay-my-need-row='d1']");
  assert.deepEqual(globalThis.__bayOpened, [{ kind: "demand", id: "d1" }]);
  await view.unmount();

  reset();
  globalThis.__baySignedIn = false;
  const guest = await mount(React.createElement(MyNeedsPane, { target: { kind: "mine", tab: "needs" }, layout: "docked", siteKey: "design" }));
  assert.match(guest.host.textContent, /登录后查看你发出的需求/);
  await guest.unmount();
});

test("我的报价：请求 proposals/mine，点开对应需求", async () => {
  reset();
  const view = await mount(React.createElement(MyProposalsPane, { target: { kind: "mine", tab: "proposals" }, layout: "docked", siteKey: "design" }));
  const call = globalThis.__bayHttpCalls.find((row) => String(row.path).startsWith("/v1/talent/proposals/mine"));
  assert.ok(call, "必须请求 proposals/mine");
  assert.match(call.path, /\/v1\/talent\/proposals\/mine/);
  assert.match(view.host.textContent, /做一份路演稿/);
  assert.match(view.host.textContent, /等对方回复/);
  await view.click("[data-bay-my-proposal-row='p1']");
  assert.deepEqual(globalThis.__bayOpened, [{ kind: "demand", id: "d1" }]);
  await view.unmount();
});
