// W07（oceanleo-bay）：我的订单与订单页。jsdom 真渲染。
// 覆盖：付款没就绪没有可点付款按钮、不调付款接口；就绪才出现「去付款」且只看 buyer_ready；
// 买家和卖家各自只看到自己的动作；作品链接对 ppt 拼对子域名；争议表单请求形状；没有权限；
// 我的订单分组/买卖切换/空状态/点开一单。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://slide.oceanleo.com/" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = React;

const W = (globalThis.__w07panes = {
  calls: [],
  routes: {},
  opened: [],
  messages: [],
  settings: [],
  payConfigCalls: 0,
  payStartCalls: 0,
  payStartIds: [],
  buyerReady: false,
  enabled: true,
  termsOk: true,
  termsCalls: 0,
  userId: "buyer-1",
  missingSubsites: [],
});

const httpStub = dataModule(`
  const W = globalThis.__w07panes;
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function reply(method, path, body) {
    W.calls.push({ method, path, body });
    const exact = W.routes[method + " " + path];
    if (exact !== undefined) {
      if (exact instanceof Error) throw exact;
      return structuredClone(exact);
    }
    const found = Object.entries(W.routes).find(([key]) => key.endsWith("*") && (method + " " + path).startsWith(key.slice(0, -1)));
    if (found) {
      if (found[1] instanceof Error) throw found[1];
      return structuredClone(found[1]);
    }
    throw new BayApiError("没有这条路由 " + method + " " + path, 500);
  }
  export const bayGet = (path) => reply("GET", path);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const paymentsStub = dataModule(`
  const W = globalThis.__w07panes;
  export async function fetchBayPaymentConfig() {
    W.payConfigCalls += 1;
    return { enabled: W.enabled, buyer_ready: W.buyerReady, seller_ready: false, currency: "USD" };
  }
  export async function startBayPayment(id) {
    W.payStartCalls += 1;
    W.payStartIds.push(id);
    return { redirect_url: null };
  }
`);
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const stateStub = dataModule(`
  export function openBay(target){ globalThis.__w07panes.opened.push(target); }
  export function requireBayLogin(){ globalThis.__w07panes.opened.push({ kind: "login" }); return false; }
`);
const authStub = dataModule("export async function getUserId(){ return globalThis.__w07panes.userId; }");
const messagesStub = dataModule("export function openMessages(t){ globalThis.__w07panes.messages.push(t); }");
const settingsStub = dataModule("export function openBaySettings(pane){ globalThis.__w07panes.settings.push(pane); }");
const termsStub = dataModule(`
  export async function ensureBayTerms(){
    globalThis.__w07panes.termsCalls += 1;
    return globalThis.__w07panes.termsOk;
  }
`);
const tradeStub = dataModule("export async function openTradeThread(s){ globalThis.__w07panes.opened.push({ kind: \"trade\", ...s }); }");
const familyStub = dataModule(`
  export function currentFamilySubsiteOrigin(label) {
    if ((globalThis.__w07panes.missingSubsites || []).includes(label)) return undefined;
    return "https://" + label + ".oceanleo.com";
  }
`);

const localeStub = dataModule("export function useLocale(){ return 'zh'; }");
const STUBS = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/bay/payments": paymentsStub,
  "../../../lib/auth/client": authStub,
  "../shell/bay-state": stateStub,
  "../../messages/host-state": messagesStub,
  "../settings/settings-open": settingsStub,
  "../settings/terms-flow": termsStub,
  "../deal/open-trade-thread": tradeStub,
  "../../../contracts/domain-family": familyStub,
  "next-intl": localeStub,
};

const { MyOrdersPane } = await import(await compileModule("src/shell/bay/orders/MyOrdersPane.tsx", STUBS));
const { OrderPane } = await import(await compileModule("src/shell/bay/orders/OrderPane.tsx", STUBS));
const store = await import(await compileModule("src/shell/bay/orders/order-store.ts", STUBS));
const { BayApiError } = await import(httpStub);

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
    payment_state: "unfunded",
    my_role: "buyer",
    thread_id: "t1",
    project_id: "p1",
    im_conversation_id: "im-1",
    seller: { user_id: "seller-1", display_name: "Mia", handle: "mia" },
    buyer: { user_id: "buyer-1", display_name: "Leo", handle: "leo" },
    milestones: [],
    deliveries: [],
    revisions_allowed: 2,
    revisions_used: 0,
    work: { site_key: "ppt", open_path: "/editor?task=w1", title: "演示文稿" },
    ...extra,
  };
}

function reset(routes = {}) {
  store.resetBayOrderStore();
  W.calls = [];
  W.routes = {
    "GET /v1/talent/contracts?role=all&limit=200": { items: [] },
    "GET /v1/talent/contracts/k1": { contract: contract() },
    "GET /v1/talent/disputes": { items: [] },
    "GET /v1/talent/reviews?contract_id=k1": { reviews: [], revealed: false, mine: null },
    ...routes,
  };
  W.opened = [];
  W.messages = [];
  W.settings = [];
  W.payConfigCalls = 0;
  W.payStartCalls = 0;
  W.payStartIds = [];
  W.buyerReady = false;
  W.enabled = true;
  W.termsOk = true;
  W.termsCalls = 0;
  W.userId = "buyer-1";
  W.missingSubsites = [];
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await flush();
  return {
    host,
    q: (sel) => host.querySelector(sel),
    qa: (sel) => [...host.querySelectorAll(sel)],
    async click(sel) {
      const el = host.querySelector(sel);
      assert.ok(el, `找不到 ${sel}`);
      await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      await flush();
    },
    async type(sel, value) {
      const el = host.querySelector(sel);
      assert.ok(el, `找不到 ${sel}`);
      const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      await act(async () => {
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new window.Event("input", { bubbles: true }));
        el.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
      await flush(2);
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const paneProps = (id = "k1") => ({ target: { kind: "order", id }, layout: "docked", siteKey: "ppt" });

test("付款没就绪：写「付款暂未开放」，没有可点付款按钮，不调付款接口", async () => {
  reset();
  W.buyerReady = false;
  const view = await mount(React.createElement(OrderPane, paneProps()));
  assert.match(view.host.textContent, /付款暂未开放/);
  assert.equal(view.q("[data-bay-action=pay]"), null);
  assert.equal(W.payStartCalls, 0);
  assert.ok(view.q("[data-bay-action=setup-payment]"), "平台开了、没就绪：去设置付款方式");
  await view.unmount();
});

test("buyer_ready 为真才出现去付款；点了才调 startBayPayment，先过买家条款", async () => {
  reset();
  W.buyerReady = true;
  const view = await mount(React.createElement(OrderPane, paneProps()));
  assert.equal(view.q("[data-bay-pane=order]").getAttribute("data-role"), "buyer");
  const pay = view.q("[data-bay-action=pay]");
  assert.ok(pay, "就绪后出现去付款");
  assert.equal(pay.textContent, "去付款");
  assert.doesNotMatch(view.host.textContent, /付款暂未开放/);
  assert.equal(W.payStartCalls, 0);
  await view.click("[data-bay-action=pay]");
  assert.equal(W.termsCalls, 1);
  assert.deepEqual(W.payStartIds, ["k1"]);
  await view.unmount();
});

test("enabled 关掉、buyer_ready 仍真：按钮仍在（只按 ready）", async () => {
  reset();
  W.enabled = false;
  W.buyerReady = true;
  const view = await mount(React.createElement(OrderPane, paneProps()));
  assert.ok(view.q("[data-bay-action=pay]"));
  assert.equal(view.q("[data-bay-action=setup-payment]"), null);
  await view.unmount();
});

test("买家交付后能验收和要求修改；卖家看不到这两项，能交付", async () => {
  reset({
    "GET /v1/talent/contracts/k1": {
      contract: contract({
        status: "delivered",
        payment_state: "disabled",
        deliveries: [{ id: "d1", round: 1, note: "第一版", attachments: [], state: "submitted", created_at: "2026-10-06T00:00:00Z" }],
      }),
    },
  });
  const buyer = await mount(React.createElement(OrderPane, paneProps()));
  assert.ok(buyer.q("[data-bay-action=accept-delivery]"));
  assert.ok(buyer.q("[data-bay-action=request-revision]"));
  assert.equal(buyer.q("[data-bay-action=deliver]"), null);
  await buyer.unmount();

  reset({
    "GET /v1/talent/contracts/k1": {
      contract: contract({
        my_role: "seller",
        status: "active",
        payment_state: "disabled",
      }),
    },
  });
  const seller = await mount(React.createElement(OrderPane, paneProps()));
  assert.equal(seller.q("[data-bay-pane=order]").getAttribute("data-role"), "seller");
  assert.ok(seller.q("[data-bay-action=deliver]"));
  assert.equal(seller.q("[data-bay-action=pay]"), null);
  assert.equal(seller.q("[data-bay-action=accept-delivery]"), null);
  assert.equal(seller.q("[data-bay-action=request-revision]"), null);
  await seller.unmount();
});

test("作品链接：ppt 去 slide 子域，只认 https，带 rel=noopener noreferrer", async () => {
  reset();
  const view = await mount(React.createElement(OrderPane, paneProps()));
  const link = view.q("[data-bay-work-link]");
  assert.ok(link);
  assert.equal(link.getAttribute("href"), "https://slide.oceanleo.com/editor?task=w1");
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
  assert.equal(link.getAttribute("target"), "_blank");
  assert.match(link.textContent, /打开/);
  await view.unmount();
});

test("争议表单：提交体是 { contract_id, reason, detail, evidence }", async () => {
  reset({
    "POST /v1/talent/disputes": { dispute: { id: "d1", contract_id: "k1", state: "open", reason: "对方失联", detail: "三天没有回复", created_at: "2026-10-06T00:00:00Z" } },
    "GET /v1/talent/disputes/d1": {
      dispute: { id: "d1", contract_id: "k1", state: "open", reason: "对方失联", detail: "三天没有回复", created_at: "2026-10-06T00:00:00Z" },
    },
  });
  const view = await mount(React.createElement(OrderPane, paneProps()));
  assert.ok(view.q("[data-bay-dispute-form]"));
  assert.match(view.host.textContent, /争议评估/);
  assert.match(view.host.textContent, /平台裁定/);
  assert.doesNotMatch(view.host.textContent, /仲裁|人工裁定/);
  await view.type("[data-bay-dispute-detail]", "三天没有回复，也没交付");
  const reason = view.q("[data-bay-dispute-reason]");
  const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    if (selectSetter) selectSetter.call(reason, "对方失联");
    else reason.value = "对方失联";
    reason.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await view.click("[data-bay-action=open-dispute]");
  const posted = W.calls.find((c) => c.method === "POST" && c.path === "/v1/talent/disputes");
  assert.ok(posted, `没有发出争议请求：${JSON.stringify(W.calls)}`);
  assert.deepEqual(posted.body, {
    contract_id: "k1",
    reason: "对方失联",
    detail: "三天没有回复，也没交付",
    evidence: [],
  });
  await view.unmount();
});

test("不是这单的人：显示没有权限，没有任何动作按钮", async () => {
  reset({ "GET /v1/talent/contracts/k1": new BayApiError("没有权限", 403) });
  const view = await mount(React.createElement(OrderPane, paneProps()));
  assert.ok(view.q("[data-bay-no-permission]"));
  assert.match(view.host.textContent, /没有权限/);
  assert.equal(view.q("[data-bay-action=pay]"), null);
  assert.equal(view.q("[data-bay-action=deliver]"), null);
  await view.unmount();
});

test("我的订单：买卖切换、空状态、点开一单", async () => {
  reset({
    "GET /v1/talent/contracts?role=all&limit=200": {
      items: [
        contract({ id: "buy-1", title: "我买的稿", status: "delivered", payment_state: "disabled" }),
        contract({ id: "sell-1", title: "我卖的稿", my_role: "seller", status: "active", payment_state: "disabled" }),
      ],
    },
  });
  const view = await mount(React.createElement(MyOrdersPane, { target: { kind: "mine", tab: "bought" }, layout: "docked", siteKey: "ppt" }));
  assert.equal(view.q("[data-bay-pane=mine-orders]").getAttribute("data-role"), "buyer");
  assert.ok(view.q("[data-bay-order-row=buy-1]"));
  assert.equal(view.q("[data-bay-order-row=sell-1]"), null);
  await view.click("[data-bay-role=seller]");
  assert.equal(view.q("[data-bay-pane=mine-orders]").getAttribute("data-role"), "seller");
  assert.ok(view.q("[data-bay-order-row=sell-1]"));
  await view.click("[data-bay-order-row=sell-1]");
  assert.deepEqual(W.opened.at(-1), { kind: "order", id: "sell-1" });
  await view.unmount();
});

test("我的订单：买家空态去逛逛，卖家空态去发布", async () => {
  reset({ "GET /v1/talent/contracts?role=all&limit=200": { items: [] } });
  const view = await mount(React.createElement(MyOrdersPane, { target: { kind: "mine", tab: "bought" }, layout: "docked", siteKey: "ppt" }));
  assert.ok(view.q("[data-bay-empty=all]"));
  assert.match(view.host.textContent, /去逛逛/);
  await view.click("[data-bay-action=browse-services]");
  assert.deepEqual(W.opened.at(-1), { kind: "feed", filter: { kind: "supply" } });
  await view.click("[data-bay-role=seller]");
  await view.click("[data-bay-action=publish-service]");
  assert.deepEqual(W.opened.at(-1), { kind: "publish" });
  await view.unmount();
});
