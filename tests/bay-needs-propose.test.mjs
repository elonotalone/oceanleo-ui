// W04：报价窗格（ProposePane）。
// 覆盖：价格/天数/说明；先过卖家条款再提交；没卖家资料去设置；未登录点提交走登录；
// 不能给自己的需求报价；窗格不自带返回栏。
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
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
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
    const out = responder ? responder(method, path, body, opts) : {};
    if (out && out.__error) throw new BayApiError(out.__error.message, out.__error.status, out.__error.code);
    return out;
  }
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const agentStub = dataModule(`
  export async function authed() { return { ok: true, data: {} }; }
  export async function listTasks() { return { ok: true, data: { items: [] } }; }
`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  globalThis.__bayLoginAsked ??= 0;
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function useBayTaskContext(){ return null; }
  export function bayHrefOnSite(site, target){ return "https://" + site + ".oceanleo.test/bay?bay=" + target.kind; }
`);
const settingsStub = dataModule(`
  globalThis.__bayTermsAsked ??= [];
  globalThis.__baySettingsOpened ??= [];
  export async function ensureBayTerms(scope){ globalThis.__bayTermsAsked.push(scope); return globalThis.__bayTermsOk !== false; }
  export function openBaySettings(pane){ globalThis.__baySettingsOpened.push(pane); }
`);
const toastStub = dataModule(`
  globalThis.__toasts ??= [];
  const api = { success(title){ globalThis.__toasts.push({ kind: "success", title }); }, error(title){ globalThis.__toasts.push({ kind: "error", title }); }, info(){} };
  export function useToast(){ return api; }
`);

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
  "../settings": settingsStub,
  "../../../ui/Toast": toastStub,
  "../../../contracts/domain-family": domainStub,
};
const { ProposePane } = await import(await compileModule("src/shell/bay/needs/ProposePane.tsx", stubs));

function demand(extra = {}) {
  return {
    id: "d1",
    user_id: "buyer-1",
    title: "做一份路演稿",
    description: "十页",
    category: "doc",
    engagement_kind: "fixed",
    budget_min_fen: 50000,
    budget_max_fen: 100000,
    deadline_at: null,
    status: "open",
    proposal_count: 0,
    currency: "CNY",
    is_owner: false,
    my_proposal: null,
    ...extra,
  };
}

function reset(detail = demand()) {
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = (method, path) => {
    if (method === "GET" && path === "/v1/talent/demands/d1") return { demand: detail };
    if (method === "POST" && path === "/v1/talent/demands/d1/proposals") return { proposal: { id: "p1" } };
    return {};
  };
  globalThis.__bayOpened = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayTermsAsked = [];
  globalThis.__bayTermsOk = true;
  globalThis.__baySettingsOpened = [];
  globalThis.__toasts = [];
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
    type: async (selector, value) => {
      const node = host.querySelector(selector);
      assert.ok(node, `找不到 ${selector}`);
      const proto = node.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      await act(async () => {
        Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
        node.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
      await settle();
    },
    unmount: () => act(() => root.unmount()),
  };
}

const props = { target: { kind: "propose", demandId: "d1" }, layout: "docked", siteKey: "design" };

test("目标不是报价时什么都不画", () => {
  assert.equal(renderToStaticMarkup(React.createElement(ProposePane, { target: { kind: "feed" }, layout: "docked", siteKey: "design" })), "");
});

test("不能给自己的需求报价；已关闭的也不收", async () => {
  reset(demand({ is_owner: true }));
  const own = await mount(React.createElement(ProposePane, props));
  assert.match(own.host.textContent, /不能给自己报价/);
  assert.equal(own.host.querySelector("[data-bay-propose]"), null);
  await own.unmount();

  reset(demand({ status: "closed" }));
  const closed = await mount(React.createElement(ProposePane, props));
  assert.match(closed.host.textContent, /已停止接收报价/);
  await closed.unmount();
});

test("未登录点提交只弹登录", async () => {
  reset();
  globalThis.__baySignedIn = false;
  const view = await mount(React.createElement(ProposePane, props));
  assert.match(view.host.textContent, /登录后才能报价/);
  await view.type("[data-bay-propose-price]", "800");
  await view.click("[data-bay-submit]");
  assert.equal(globalThis.__bayLoginAsked, 1);
  assert.deepEqual(globalThis.__bayTermsAsked, []);
  assert.equal(globalThis.__bayHttpCalls.filter((call) => call.method === "POST").length, 0);
  await view.unmount();
});

test("先过卖家条款再提交价格、天数、说明", async () => {
  reset();
  const view = await mount(React.createElement(ProposePane, props));
  assert.equal(view.host.querySelector("header"), null);
  assert.match(view.host.textContent, /做一份路演稿/);
  await view.type("[data-bay-propose-price]", "800");
  await view.type("[data-bay-propose-days]", "5");
  await view.type("[data-bay-propose-message]", "我做过三十多份路演稿");
  await view.click("[data-bay-submit]");
  assert.deepEqual(globalThis.__bayTermsAsked, ["seller"]);
  const post = globalThis.__bayHttpCalls.find((call) => call.method === "POST");
  assert.deepEqual(post.body, { price_fen: 80000, delivery_days: 5, message: "我做过三十多份路演稿" });
  assert.deepEqual(globalThis.__bayOpened, [{ kind: "demand", id: "d1" }]);
  await view.unmount();
});

test("后端说没有卖家资料 → 去设置里建", async () => {
  reset();
  globalThis.__bayHttpRespond = (method, path) => {
    if (method === "GET" && path === "/v1/talent/demands/d1") return { demand: demand() };
    if (method === "POST") return { __error: { message: "还没有卖家资料", status: 403, code: "seller_profile_required" } };
    return {};
  };
  const view = await mount(React.createElement(ProposePane, props));
  await view.type("[data-bay-propose-price]", "100");
  await view.click("[data-bay-submit]");
  assert.match(view.host.textContent, /先建好并公开卖家资料/);
  await view.click('[data-bay-action="profile"]');
  assert.deepEqual(globalThis.__baySettingsOpened, ["profile"]);
  await view.unmount();
});
