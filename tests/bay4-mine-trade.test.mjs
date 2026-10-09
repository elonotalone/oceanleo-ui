// W3：我的 · 我发布的 / 我卖出的 / 我买到的。jsdom 真渲染，接口用 http 替身。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://design.oceanleo.com/bay",
});
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
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const W = (globalThis.__w3mine = {
  calls: [],
  opened: [],
  settings: [],
  signedIn: true,
  userId: "me",
  orders: [],
});

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const httpStub = dataModule(`
  const W = globalThis.__w3mine;
  export class BayApiError extends Error {
    constructor(message, status = 0, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function reply(method, path, body, opts) {
    W.calls.push({ method, path, body, opts });
    const responder = globalThis.__w3HttpRespond;
    return responder ? responder(method, path, body, opts) : {};
  }
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const stateStub = dataModule(`
  const W = globalThis.__w3mine;
  export function openBay(target){ W.opened.push(target); }
  export function replaceBay(target){ W.opened.push(target); }
  export function requireBayLogin(){ return true; }
  export function useBaySignedIn(){ return W.signedIn !== false; }
  export function useBayTaskContext(){ return null; }
  export function bayHrefOnSite(){ return ""; }
`);
const authStub = dataModule(`
  export async function getUserId(){ return globalThis.__w3mine.userId; }
  export const AUTH_STATE_EVENT = "oceanleo-auth-state";
  export async function accessToken(){ return "t"; }
  export function cachedAccessToken(){ return "t"; }
`);
const settingsStub = dataModule(`
  export async function ensureBayTerms(){ return true; }
  export function openBaySettings(pane){ globalThis.__w3mine.settings.push(pane); }
`);
const linksStub = dataModule(`
  export function baySiteName(key){ return key === "design" ? "LeoDesign" : key || null; }
  export function baySubsiteLabel(key){ return key || null; }
`);
const paymentsStub = dataModule(`
  export async function fetchBayPaymentConfig() {
    return { enabled: true, buyer_ready: false, seller_ready: false, currency: "USD" };
  }
  export async function startBayPayment() { return { redirect_url: null }; }
`);
const agentStub = dataModule(`export async function authed(){ return { ok: true, data: {} }; }`);
const domainStub = dataModule(`
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function currentFamilySubsiteOrigin(){ return undefined; }
  export function portalHref(path){ return "https://oceanleo.test" + path; }
`);
const localeStub = dataModule("export function useLocale(){ return 'zh'; }");
const messagesStub = dataModule("export function openMessages(){}");

const STUBS = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/bay/payments": paymentsStub,
  "../../../lib/auth/client": authStub,
  "../../../lib/agent": agentStub,
  "../shell/bay-state": stateStub,
  "../shell/bay-links": linksStub,
  "../settings": settingsStub,
  "../settings/settings-open": settingsStub,
  "../settings/terms-flow": settingsStub,
  "../../../contracts/domain-family": domainStub,
  "next-intl": localeStub,
  "../../messages/host-state": messagesStub,
};

const { MyPublishedPane } = await import(await compileModule("src/shell/bay/mine/MyPublishedPane.tsx", STUBS));
const { MySoldPane } = await import(await compileModule("src/shell/bay/mine/MySoldPane.tsx", STUBS));
const { MyBoughtPane } = await import(await compileModule("src/shell/bay/mine/MyBoughtPane.tsx", STUBS));
const { MyOrdersPane } = await import(await compileModule("src/shell/bay/orders/MyOrdersPane.tsx", STUBS));

function contract(extra = {}) {
  return {
    id: "k1",
    buyer_user_id: "buyer-1",
    seller_user_id: "seller-1",
    title: "一套品牌 Logo",
    engagement_kind: "fixed",
    total_fen: 12000,
    currency: "USD",
    status: "active",
    payment_state: "disabled",
    my_role: "buyer",
    seller: { user_id: "seller-1", display_name: "Mia", handle: "mia" },
    buyer: { user_id: "buyer-1", display_name: "Leo", handle: "leo" },
    milestones: [],
    deliveries: [],
    ...extra,
  };
}

function reset(orders) {
  W.calls = [];
  W.opened = [];
  W.settings = [];
  W.signedIn = true;
  W.userId = "me";
  W.orders = orders ?? [
    contract({ id: "buy-1", title: "我买的稿", status: "delivered", payment_state: "disabled" }),
    contract({ id: "sell-1", title: "我卖的稿", my_role: "seller", status: "active", payment_state: "disabled" }),
  ];
  globalThis.__w3HttpRespond = (method, path) => {
    if (method !== "GET") return {};
    if (path === "/v1/talent/categories") {
      return {
        items: [],
        flat_items: [{ slug: "doc", name_zh: "文档与表格", catalog_kind: "delivery", regulated_domain: "none", published: true, position: 50 }],
        total: 1,
        site_defaults: {},
      };
    }
    if (path === "/v1/talent/me/services") {
      return { items: [{ id: "s1", title: "Logo", status: "published", summary: "三版", order_count: 2, posted_site: "design" }] };
    }
    if (path === "/v1/talent/consults/mine" || String(path).endsWith("/consults/mine")) return { items: [] };
    if (path === "/v1/talent/me/stats") return { orders_by_status: { active: 2, delivered: 1 }, rating_avg: 4.6, rating_count: 8, pending_orders: 0 };
    if (String(path).startsWith("/v1/talent/threads")) return { threads: [{ id: "t1", unread_count: 2 }] };
    if (path === "/v1/moderation/my-cases") return { cases: [] };
    if (String(path).startsWith("/v1/talent/demands/mine")) {
      return {
        items: [{ id: "d1", title: "做一份路演稿", category: "doc", status: "open", proposal_count: 2, budget_min_fen: 50000, budget_max_fen: 50000, currency: "CNY", created_at: new Date().toISOString() }],
        total: 1,
      };
    }
    if (String(path).startsWith("/v1/talent/proposals/mine")) {
      return {
        items: [{ id: "p1", demand_id: "d1", price_fen: 80000, currency: "CNY", status: "pending", created_at: new Date().toISOString(), demand: { id: "d1", title: "做一份路演稿", status: "open", category: "doc" } }],
        next_cursor: null,
      };
    }
    if (String(path).startsWith("/v1/talent/handoffs/mine")) return { items: [], next_cursor: null };
    if (String(path).startsWith("/v1/talent/contracts")) return { items: W.orders };
    return {};
  };
}

async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await settle();
  return {
    host,
    q: (sel) => host.querySelector(sel),
    qa: (sel) => [...host.querySelectorAll(sel)],
    async click(sel) {
      const el = host.querySelector(sel);
      assert.ok(el, `找不到 ${sel}`);
      await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      await settle();
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const props = (tab) => ({ target: { kind: "mine", tab }, layout: "docked", siteKey: "design" });

test("我发布的：有 supply、needs 两段，只有一个发布按钮", async () => {
  reset();
  const view = await mount(React.createElement(MyPublishedPane, props("published")));
  assert.ok(view.q('[data-bay-pane="mine-published"]'));
  assert.ok(view.q('[data-bay-mine-section="supply"]'));
  assert.ok(view.q('[data-bay-mine-section="needs"]'));
  assert.match(view.host.textContent, /素材与服务/);
  assert.match(view.host.textContent, /需求/);
  assert.match(view.host.textContent, /Logo/);
  assert.match(view.host.textContent, /做一份路演稿/);
  assert.equal(view.qa("[data-bay-mine-publish]").length, 1);
  assert.equal(view.qa("[data-bay-new-service]").length, 0);
  assert.equal(
    view.qa("button").filter((node) => node.textContent.trim() === "发布").length,
    1,
  );
  await view.click("[data-bay-mine-publish]");
  assert.deepEqual(W.opened.at(-1), { kind: "publish" });
  await view.unmount();
});

test("我卖出的：概况、报价中、卖出的订单；没有买卖切换，只出卖家订单", async () => {
  reset();
  const view = await mount(React.createElement(MySoldPane, props("sold")));
  assert.ok(view.q('[data-bay-pane="mine-sold"]'));
  assert.ok(view.q("[data-bay-seller-overview]"));
  assert.ok(view.q('[data-bay-mine-section="proposals"]'));
  assert.ok(view.q('[data-bay-mine-section="orders"]'));
  assert.match(view.host.textContent, /报价中/);
  assert.match(view.host.textContent, /卖出的订单/);
  assert.match(view.host.textContent, /做一份路演稿/);
  assert.equal(view.q("[data-bay-role]"), null);
  assert.ok(view.q("[data-bay-order-row=sell-1]"));
  assert.equal(view.q("[data-bay-order-row=buy-1]"), null);
  await view.unmount();
});

test("我买到的：只出买家订单；空状态是还没有买过东西和去逛逛", async () => {
  reset();
  const view = await mount(React.createElement(MyBoughtPane, props("bought")));
  assert.ok(view.q('[data-bay-pane="mine-bought"]'));
  assert.equal(view.q("[data-bay-role]"), null);
  assert.ok(view.q("[data-bay-order-row=buy-1]"));
  assert.equal(view.q("[data-bay-order-row=sell-1]"), null);
  await view.unmount();

  reset([]);
  const empty = await mount(React.createElement(MyBoughtPane, props("bought")));
  assert.ok(empty.q("[data-bay-empty=all]"));
  assert.match(empty.host.textContent, /你还没有买过东西。/);
  assert.match(empty.host.textContent, /去逛逛/);
  await empty.click("[data-bay-action=browse-services]");
  assert.deepEqual(W.opened.at(-1), { kind: "feed", filter: { kind: "supply" } });
  await empty.unmount();
});

test("MyOrdersPane 不传 fixedRole 时买卖切换仍在", async () => {
  reset();
  const view = await mount(React.createElement(MyOrdersPane, props("bought")));
  assert.ok(view.q("[data-bay-role=buyer]"));
  assert.ok(view.q("[data-bay-role=seller]"));
  assert.ok(view.q("[data-bay-order-row=buy-1]"));
  assert.equal(view.q("[data-bay-order-row=sell-1]"), null);
  await view.click("[data-bay-role=seller]");
  assert.ok(view.q("[data-bay-order-row=sell-1]"));
  await view.unmount();
});
