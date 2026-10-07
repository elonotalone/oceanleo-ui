// W05：下单窗格。
// 覆盖（契约 §7 硬约束）：buyer_ready 为 false 时下单只建订单、不调付款、界面没有可点的付款按钮、
// 提示去「我的订单」；先过买家条款，拒绝条款就不建订单；缺标题/需求不建订单；
// buyer_ready 为 true 才出现付款按钮，点了才调 startBayPayment（桩）；服务页勾的加购带到下单页。
// 付款模块整个是桩：这份测试里不存在任何真实的付款调用。
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
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const httpStub = dataModule(`
  globalThis.__bayHttpCalls ??= [];
  async function reply(method, path, body, opts) {
    globalThis.__bayHttpCalls.push({ method, path, body, opts });
    const responder = globalThis.__bayHttpRespond;
    return responder ? responder(method, path, body, opts) : {};
  }
  export class BayApiError extends Error {}
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const paymentsStub = dataModule(`
  globalThis.__bayPayCalls ??= [];
  export async function fetchBayPaymentConfig() {
    globalThis.__bayPayCalls.push("config");
    return { enabled: !!globalThis.__bayBuyerReady, buyer_ready: !!globalThis.__bayBuyerReady, seller_ready: false, currency: "usd" };
  }
  export async function startBayPayment(id) {
    globalThis.__bayPayCalls.push("start:" + id);
    return { redirect_url: null };
  }
`);
const settingsStub = dataModule(`
  globalThis.__bayTerms ??= [];
  export async function ensureBayTerms(scope) { globalThis.__bayTerms.push(scope); return globalThis.__bayTermsAccept !== false; }
  export function BaySettingsSection(){ return null; }
`);
const authStub = dataModule(`export async function getUserId(){ return globalThis.__bayViewer ?? null; }`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ return globalThis.__baySignedIn !== false; }
  export function bayBack(){}
`);
const dealStub = dataModule(`export async function openTradeThread(){} export function DealConversationView(){ return null; }`);
const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/bay/payments": paymentsStub,
  "../../../lib/auth/client": authStub,
  "../shell/bay-state": stateStub,
  "../deal": dealStub,
  "../settings": settingsStub,
  "../shell/BayMine": dataModule(`export function BaySignInPrompt(){ return null; } export function BayMine(){ return null; }`),
  "./ProfilePane": dataModule(`export function ProfilePane(){} export function ProfileDetailView(){}`),
};
const supply = await import(await compileModule("src/shell/bay/supply/index.ts", stubs));
const { CheckoutView } = await import(await compileModule("src/shell/bay/supply/CheckoutPane.tsx", stubs));

function service(extra = {}) {
  return {
    id: "svc-1",
    user_id: "seller-1",
    title: "品牌 Logo 设计",
    summary: "",
    description: "",
    category: "design",
    cover_url: null,
    engagement_kind: "fixed",
    price_fen: 30000,
    price_unit: "project",
    delivery_days: 5,
    status: "published",
    currency: "CNY",
    required_fields: { file_formats: ["AI", "PNG"] },
    tiers: [
      { id: "t1", service_id: "svc-1", tier: "basic", title: "一版", description: "", price_fen: 30000, delivery_days: 3, revisions: 1, features: [], enabled: true },
      { id: "t3", service_id: "svc-1", tier: "premium", title: "三版", description: "", price_fen: 90000, delivery_days: 7, revisions: -1, features: [], enabled: true },
    ],
    addons: [{ id: "a1", service_id: "svc-1", title: "加急", description: "", price_fen: 5000, extra_days: 1, enabled: true }],
    faq: [],
    media: [],
    reviews: [],
    seller: { user_id: "seller-1", handle: "leo", display_name: "Leo", avatar_url: null },
    ...extra,
  };
}

function reset({ buyerReady = false } = {}) {
  globalThis.__bayHttpCalls = [];
  globalThis.__bayPayCalls = [];
  globalThis.__bayTerms = [];
  globalThis.__bayTermsAccept = true;
  globalThis.__bayOpened = [];
  globalThis.__baySignedIn = true;
  globalThis.__bayViewer = "buyer-1";
  globalThis.__bayBuyerReady = buyerReady;
  globalThis.__bayHttpRespond = (method, path) => {
    if (method === "GET" && path === "/v1/talent/services/svc-1") return { service: service() };
    if (method === "GET" && path === "/v1/talent/categories") {
      return { items: [{ slug: "design", name_zh: "设计与视觉", name_en: "Design", required_fields: [{ key: "file_formats", label_zh: "交付格式", type: "list", required: true, machine_checkable: true, enum: null }] }] };
    }
    if (method === "GET" && path.startsWith("/v1/talent/favorites")) return { items: [], total: 0 };
    if (method === "POST" && path === "/v1/talent/orders") return { contract: { id: "k-77", title: "做一套 Logo", status: "active" } };
    return {};
  };
}

const settle = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => {});
};

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await settle();
  const setValue = async (selector, value) => {
    const node = host.querySelector(selector);
    assert.ok(node, `找不到 ${selector}`);
    const proto = node.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
    await act(async () => node.dispatchEvent(new window.Event("input", { bubbles: true })));
  };
  const click = async (selector) => {
    const node = host.querySelector(selector);
    assert.ok(node, `找不到 ${selector}`);
    await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await settle();
  };
  return { host, setValue, click, unmount: () => act(() => root.unmount()) };
}

const pane = (tier) => React.createElement(supply.CheckoutPane, { target: { kind: "checkout", serviceId: "svc-1", tier }, layout: "docked", siteKey: "design" });
const startCalls = () => globalThis.__bayPayCalls.filter((call) => call.startsWith("start:"));

test("付款没开放：下单只建订单，不调付款，没有付款按钮，引到我的订单", async () => {
  reset({ buyerReady: false });
  const view = await mount(pane("premium"));
  assert.match(view.host.textContent, /三版/);
  assert.match(view.host.querySelector("[data-bay-pay-hint]").textContent, /付款暂未开放/);
  assert.match(view.host.querySelector("[data-bay-done-means]").textContent, /交付格式.*AI, PNG/);
  await view.setValue('[data-bay-field="what"]', "三版方案，含源文件");
  await view.setValue('[data-bay-field="links"]', "https://a.example\nhttps://b.example");
  await view.click('[data-bay-action="place-order"]');
  assert.deepEqual(globalThis.__bayTerms, ["buyer"], "下单前先过买家条款");
  const orders = globalThis.__bayHttpCalls.filter((call) => call.method === "POST");
  assert.equal(orders.length, 1);
  assert.equal(orders[0].path, "/v1/talent/orders");
  assert.deepEqual(orders[0].body, {
    service_id: "svc-1",
    tier: "premium",
    addon_ids: [],
    requirements: { title: "品牌 Logo 设计", what: "三版方案，含源文件", reference_links: ["https://a.example", "https://b.example"], deadline: "", notes: "" },
  });
  assert.ok(view.host.querySelector("[data-bay-pay-unavailable]"), "写着付款暂未开放");
  assert.match(view.host.textContent, /付款暂未开放/);
  assert.equal(view.host.querySelector("[data-bay-pay]"), null, "没有付款按钮");
  assert.deepEqual(startCalls(), [], "从未调用 startBayPayment");
  await view.click('[data-bay-action="open-order"]');
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "order", id: "k-77" });
  await view.unmount();
});

test("拒绝买家条款：不建订单", async () => {
  reset();
  globalThis.__bayTermsAccept = false;
  const view = await mount(pane("basic"));
  await view.setValue('[data-bay-field="what"]', "要做什么");
  await view.click('[data-bay-action="place-order"]');
  assert.deepEqual(globalThis.__bayTerms, ["buyer"]);
  assert.equal(globalThis.__bayHttpCalls.filter((call) => call.method === "POST").length, 0);
  assert.equal(view.host.querySelector("[data-bay-placed]"), null);
  await view.unmount();
});

test("缺需求、缺标题：不建订单、不问条款，告诉用户缺什么", async () => {
  reset();
  const view = await mount(pane("basic"));
  await view.click('[data-bay-action="place-order"]');
  assert.equal(view.host.querySelector("[data-bay-problem]").getAttribute("data-bay-problem"), "what");
  await view.setValue('[data-bay-field="what"]', "要做什么");
  await view.setValue('[data-bay-field="title"]', "  ");
  await view.click('[data-bay-action="place-order"]');
  assert.equal(view.host.querySelector("[data-bay-problem]").getAttribute("data-bay-problem"), "title");
  assert.deepEqual(globalThis.__bayTerms, []);
  assert.equal(globalThis.__bayHttpCalls.filter((call) => call.method === "POST").length, 0);
  await view.unmount();
});

test("未登录：点下单只弹登录", async () => {
  reset();
  globalThis.__baySignedIn = false;
  const view = await mount(pane("basic"));
  await view.setValue('[data-bay-field="what"]', "要做什么");
  await view.click('[data-bay-action="place-order"]');
  assert.deepEqual(globalThis.__bayTerms, []);
  assert.equal(globalThis.__bayHttpCalls.filter((call) => call.method === "POST").length, 0);
  await view.unmount();
});

test("后端拒绝时把原因说出来，不跳到已下单", async () => {
  reset();
  const respond = globalThis.__bayHttpRespond;
  globalThis.__bayHttpRespond = (method, path, body) =>
    method === "POST" ? Promise.reject(Object.assign(new Error("这个服务档位暂时不能下单"), { status: 400 })) : respond(method, path, body);
  const view = await mount(pane("basic"));
  await view.setValue('[data-bay-field="what"]', "要做什么");
  await view.click('[data-bay-action="place-order"]');
  assert.match(view.host.querySelector("[data-bay-error]").textContent, /这个服务档位暂时不能下单/);
  assert.equal(view.host.querySelector("[data-bay-placed]"), null);
  assert.deepEqual(startCalls(), []);
  await view.unmount();
});

test("付款就绪：下单后才出现付款按钮，点了才调 startBayPayment", async () => {
  reset({ buyerReady: true });
  const view = await mount(pane("basic"));
  assert.match(view.host.querySelector("[data-bay-pay-hint]").textContent, /下单后去付款/);
  await view.setValue('[data-bay-field="what"]', "要做什么");
  await view.click('[data-bay-action="place-order"]');
  assert.deepEqual(startCalls(), [], "建订单这一步不付款");
  const payButton = view.host.querySelector("[data-bay-pay]");
  assert.ok(payButton);
  assert.match(payButton.textContent, /去付款 · ¥300/);
  await view.click("[data-bay-pay]");
  assert.deepEqual(startCalls(), ["start:k-77"]);
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "order", id: "k-77" });
  await view.unmount();
});

test("服务页勾的加购带到下单页；停用的档位提示换一个", async () => {
  reset();
  const servicePane = await mount(React.createElement(supply.ServicePane, { target: { kind: "service", id: "svc-1" }, layout: "docked", siteKey: "design" }));
  const box = servicePane.host.querySelector('[data-bay-addon="a1"] input');
  await act(async () => box.click());
  await servicePane.click('[data-bay-action="order"]');
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "checkout", serviceId: "svc-1", tier: "basic" });
  await servicePane.unmount();
  const view = await mount(pane("basic"));
  assert.equal(view.host.querySelector('[data-bay-addon="a1"] input').checked, true);
  assert.match(view.host.querySelector("[data-bay-total]").textContent, /¥350/);
  await view.unmount();
  const stale = await mount(pane("standard"));
  assert.equal(stale.host.querySelector("[data-bay-problem]").getAttribute("data-bay-problem"), "tier");
  assert.ok(stale.host.querySelector('[data-bay-action="place-order"]').disabled);
  await stale.unmount();
});

test("静态渲染：已下单且付款没开放时，页面上没有付款按钮", () => {
  reset();
  const placed = (payStep) =>
    renderToStaticMarkup(
      React.createElement(CheckoutView, { service: service(), payment: null, layout: "docked", initialPlaced: { contract: { id: "k-1", title: "t" }, payStep } }),
    );
  const unavailable = placed("unavailable");
  assert.match(unavailable, /付款暂未开放/);
  assert.match(unavailable, /去我的订单/);
  assert.doesNotMatch(unavailable, /data-bay-pay=/);
  assert.doesNotMatch(placed("free"), /data-bay-pay=/);
  assert.match(placed("pay"), /data-bay-pay=/);
  assert.deepEqual(startCalls(), []);
});

test("卖家本人打开自己服务的下单页：不给下单", async () => {
  reset();
  globalThis.__bayViewer = "seller-1";
  const view = await mount(pane("basic"));
  assert.match(view.host.textContent, /这是你发布的服务/);
  assert.equal(view.host.querySelector('[data-bay-action="place-order"]'), null);
  await view.unmount();
});
