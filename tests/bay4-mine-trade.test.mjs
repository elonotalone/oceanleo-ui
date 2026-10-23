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
  export function stripLeoCategoryPrefix(name){
    const text = String(name || "");
    return text.startsWith("Leo") && text.length > 3 ? text.slice(3) : text;
  }
  export function bayCategoryLabel(key){ return key || null; }
`);
const paymentsStub = dataModule(`
  export async function fetchBayPaymentConfig() {
    return { enabled: true, buyer_ready: false, seller_ready: false, currency: "USD" };
  }
  export async function startBayPayment() { return { redirect_url: null }; }
`);
const agentStub = dataModule(`export async function authed(){ return { ok: true, data: {} }; }`);
const domainStub = dataModule(`
  export function familyForHost(){ return undefined; }
  export const CONFIGURED_DOMAIN_FAMILY = undefined;
  export function currentDomainFamily(){ return undefined; }
  export function domainProfileForHost(){ return undefined; }
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function currentFamilySubsiteOrigin(){ return undefined; }
  export function portalHref(path){ return "https://oceanleo.test" + path; }
`);
const localeStub = dataModule("export function useLocale(){ return 'zh'; }");
const messagesStub = dataModule("export function openMessages(){}");

const STUBS = {
  "../apppaid/MySoldAppsPane": dataModule("export function MySoldAppsPane(){ return null; }"),
  "../lessons/SoldOrders": dataModule("export function SoldOrders(){ return null; }"),
  "../supply/parts": dataModule("export function PaneLoading(){ return null; } export function PaneMessage(){ return null; }"),
  "../../../lib/bay/lessons": dataModule(`
    export async function listSoldBayLessonOrders(){ return { items: globalThis.__w3mine.soldLessons || [] }; }
    export async function listBoughtBayLessonOrders(){ return { items: globalThis.__w3mine.boughtLessons || [] }; }
    export async function listMyBayLessons(){ return { items: globalThis.__w3mine.myLessons || [] }; }
    export async function decideBayLessonRefund(){}
    export async function deleteBayLesson(id){ globalThis.__w3mine.calls.push({ method: "DELETE", path: "/v1/bay/lessons/" + id }); return { ok: true }; }
  `),
  "../deal/open-trade-thread": dataModule("export async function openTradeThread(){}"),
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
const { MyFavoritesPane } = await import(await compileModule("src/shell/bay/mine/MyFavoritesPane.tsx", STUBS));
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
  W.myApps = [{ id: "a1", title: "我的计算器", status: "published", cover_url: "https://cdn.example.com/calculator.png" }];
  W.myLessons = [{ id: "l1", title: "PPT 入门", status: "published" }];
  W.soldLessons = [];
  W.boughtLessons = [];
  W.soldAppPurchases = [];
  W.soldAppSubs = [];
  W.boughtAppPurchases = [];
  W.boughtAppSubs = [];
  W.serviceKinds = {};
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
      return {
        items: [
          { id: "s1", title: "Logo", status: "published", listing_kind: "service", summary: "三版", order_count: 2, posted_site: "design" },
          { id: "s-digital", title: "一套图标", status: "published", listing_kind: "digital" },
        ],
      };
    }
    if (path === "/v1/bay/apps/mine") return { items: W.myApps || [] };
    if (path === "/v1/bay/app-paid/mine/sold") {
      return { purchases: W.soldAppPurchases || [], subscriptions: W.soldAppSubs || [] };
    }
    if (path === "/v1/bay/app-paid/mine/bought") {
      return { purchases: W.boughtAppPurchases || [], subscriptions: W.boughtAppSubs || [], trials: [], apps: [] };
    }
    if (String(path).startsWith("/v1/talent/services/")) {
      const id = String(path).split("/").pop();
      return { service: { id, listing_kind: (W.serviceKinds && W.serviceKinds[id]) || "service" } };
    }
    if (path === "/v1/talent/consults/mine" || String(path).endsWith("/consults/mine")) return { items: [] };
    if (path === "/v1/talent/me/stats") return { orders_by_status: { active: 2, delivered: 1 }, rating_avg: 4.6, rating_count: 8, pending_orders: 0 };
    if (String(path).startsWith("/v1/talent/threads")) return { threads: [{ id: "t1", unread_count: 2 }] };
    if (path === "/v1/moderation/my-cases") return { cases: [] };
    if (path === "/v1/talent/favorites") return { items: [{ id: "fav-1", target_kind: "service", target_ref: "s1", target: { id: "s1", title: "收藏 Logo", listing_kind: "service", cover_url: "https://cdn.example.com/logo.png" } }] };
    if (String(path).startsWith("/v1/talent/demands/mine")) {
      return {
        items: [{ id: "d1", title: "做一份路演稿", category: "doc", status: "open", proposal_count: 2, budget_min_fen: 50000, budget_max_fen: 50000, currency: "CNY", created_at: new Date().toISOString() }],
        total: 1,
      };
    }
    if (String(path).startsWith("/v1/talent/proposals/mine")) {
      return {
        items: [
          {
            id: "p1",
            demand_id: "d1",
            price_fen: 80000,
            currency: "CNY",
            status: "pending",
            created_at: new Date().toISOString(),
            demand: { id: "d1", title: "做一份路演稿", status: "open", category: "doc", listing_kind: "digital" },
          },
        ],
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
    async render(element) {
      await act(async () => root.render(element));
      await settle();
    },
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

test("刊登网格用真实封面，搜索后仍可编辑；列表视图显示同一组条目", async () => {
  reset();
  const view = await mount(React.createElement(MyPublishedPane, { ...props("published"), query: "计算器", display: "grid" }));
  assert.equal(view.q("[data-bay-mine-view]").getAttribute("data-bay-mine-view"), "grid");
  assert.equal(view.qa("[data-bay-mine-row]").length, 1);
  assert.equal(view.q('[data-bay-mine-cover="app:a1"] img').getAttribute("src"), "https://cdn.example.com/calculator.png");
  await view.click('[data-bay-mine-row="app:a1"]');
  assert.deepEqual(W.opened.at(-1), { kind: "app-editor", appId: "a1" });
  await view.render(React.createElement(MyPublishedPane, { ...props("published"), query: "", display: "list" }));
  assert.equal(view.q("[data-bay-mine-view]").getAttribute("data-bay-mine-view"), "list");
  assert.ok(view.q('[data-bay-mine-row="service:s1"]'));
  assert.ok(view.q('[data-bay-mine-row="app:a1"]'));
  assert.ok(view.q('[data-bay-mine-row="lesson:l1"]'));
  await view.unmount();
});

test("卖出、买入、收藏都按自己的数据搜索；收藏封面与打开目标保留", async () => {
  reset();
  for (const [Component, tab, query, row] of [
    [MySoldPane, "sold", "路演", "proposal:p1"],
    [MyBoughtPane, "bought", "我买", "order:buy-1"],
    [MyFavoritesPane, "favorites", "收藏 Logo", "fav-1"],
  ]) {
    const view = await mount(React.createElement(Component, { ...props(tab), query, display: "grid" }));
    assert.equal(view.qa("[data-bay-mine-row]").length, 1, tab);
    assert.ok(view.q(`[data-bay-mine-row="${row}"]`), tab);
    if (tab === "favorites") {
      assert.equal(view.q('[data-bay-mine-cover="fav-1"] img').getAttribute("src"), "https://cdn.example.com/logo.png");
      await view.click('[data-bay-mine-row="fav-1"]');
      assert.deepEqual(W.opened.at(-1), { kind: "service", id: "s1" });
    }
    await view.unmount();
  }
});

test("清空无匹配搜索后恢复刊登，损坏的封面回退为类别图标", async () => {
  reset();
  const view = await mount(React.createElement(MyPublishedPane, { ...props("published"), query: "不存在的关键词" }));
  assert.ok(view.q('[data-bay-empty="search"]'));
  await view.render(React.createElement(MyPublishedPane, { ...props("published"), query: "计算器" }));
  const image = view.q('[data-bay-mine-cover="app:a1"] img');
  await act(async () => image.dispatchEvent(new window.Event("error")));
  assert.equal(view.q('[data-bay-mine-cover="app:a1"] img'), null);
  assert.ok(view.q('[data-bay-mine-cover="app:a1"] svg'));
  await view.unmount();
});

test("我发布的：一张统一列表，没有需求、没有分区标题，每行右边标类别，没有页内发布按钮", async () => {
  reset();
  const view = await mount(React.createElement(MyPublishedPane, props("published")));
  assert.ok(view.q('[data-bay-pane="mine-published"]'));
  assert.equal(view.q("[data-bay-mine-section]"), null);
  assert.equal(view.q("[data-bay-mine-dashboard]"), null);
  assert.doesNotMatch(view.host.textContent, /需求/);
  assert.doesNotMatch(view.host.textContent, /素材与服务/);
  assert.match(view.host.textContent, /Logo/);
  assert.doesNotMatch(view.host.textContent, /做一份路演稿/);
  assert.match(view.host.textContent, /人工服务/);
  assert.match(view.host.textContent, /现成文件/);
  assert.doesNotMatch(view.host.textContent, /成品文件/);
  assert.match(view.host.textContent, /网站与软件服务/);
  assert.match(view.host.textContent, /课程/);
  assert.match(view.host.textContent, /我的计算器/);
  assert.match(view.host.textContent, /PPT 入门/);
  assert.ok(view.q('[data-bay-mine-row="app:a1"] [data-bay-listing-kind="app"]'));
  assert.ok(view.q('[data-bay-mine-row="lesson:l1"] [data-bay-listing-kind="lesson"]'));
  assert.ok(view.q('[data-bay-mine-row="service:s-digital"] [data-bay-listing-kind="digital"]'));
  assert.equal(view.qa("[data-bay-mine-publish]").length, 0);
  assert.equal(view.qa("[data-bay-new-service]").length, 0);
  assert.equal(
    view.qa("button").filter((node) => node.textContent.trim() === "发布").length,
    0,
  );
  await view.click('[data-bay-mine-row="service:s1"]');
  assert.deepEqual(W.opened.at(-1), { kind: "service-editor", serviceId: "s1" });
  await view.unmount();
});

test("我发布的：类别条筛到作品时只留作品", async () => {
  reset();
  const view = await mount(React.createElement(MyPublishedPane, { ...props("published"), category: "app" }));
  assert.match(view.host.textContent, /我的计算器/);
  assert.doesNotMatch(view.host.textContent, /Logo/);
  assert.doesNotMatch(view.host.textContent, /一套图标/);
  assert.doesNotMatch(view.host.textContent, /PPT 入门/);
  await view.unmount();
});

test("我卖出的：报价和卖家订单在同一张清单；没有概况、没有分段标题、没有买卖切换", async () => {
  reset();
  const view = await mount(React.createElement(MySoldPane, props("sold")));
  assert.ok(view.q('[data-bay-pane="mine-sold"]'));
  assert.equal(view.q("[data-bay-seller-overview]"), null);
  assert.equal(view.q("[data-bay-mine-section]"), null);
  assert.doesNotMatch(view.host.textContent, /报价中/);
  assert.doesNotMatch(view.host.textContent, /卖出的订单/);
  assert.match(view.host.textContent, /做一份路演稿/);
  assert.ok(view.q('[data-bay-mine-row="proposal:p1"] [data-bay-listing-kind="digital"]'));
  assert.equal(view.q("[data-bay-role]"), null);
  assert.ok(view.q("[data-bay-order-row=sell-1]"));
  assert.equal(view.q("[data-bay-order-row=buy-1]"), null);
  assert.match(view.host.textContent, /人工服务|现成文件|网站与软件服务|课程|其他/);
  await view.unmount();
});

test("我卖出的：课程购买行留下，对应的 talent 合同不重复出现", async () => {
  reset([
    contract({ id: "sell-1", title: "我卖的稿", my_role: "seller", status: "active", payment_state: "disabled" }),
    contract({
      id: "sell-lesson-contract",
      title: "课程：PPT 入门",
      my_role: "seller",
      status: "delivered",
      payment_state: "disabled",
      requirements: { _lesson_order: { item_kind: "lesson", item_id: "l1" } },
    }),
  ]);
  W.soldLessons = [
    {
      id: "lo1",
      item_title: "PPT 入门",
      item_kind: "lesson",
      item_id: "l1",
      status: "completed",
      price_fen: 9900,
      contract_id: "sell-lesson-contract",
    },
  ];
  const view = await mount(React.createElement(MySoldPane, props("sold")));
  assert.ok(view.q('[data-bay-mine-row="lesson-order:lo1"]'));
  assert.ok(view.q('[data-bay-mine-row="lesson-order:lo1"] [data-bay-listing-kind="lesson"]'));
  assert.equal(view.q("[data-bay-order-row=sell-lesson-contract]"), null);
  assert.ok(view.q("[data-bay-order-row=sell-1]"));
  await view.unmount();
});

test("我买到的：只出买家订单；行上没有联系卖家和去评价；空态没有去逛逛", async () => {
  reset();
  const view = await mount(React.createElement(MyBoughtPane, props("bought")));
  assert.ok(view.q('[data-bay-pane="mine-bought"]'));
  assert.equal(view.q("[data-bay-role]"), null);
  assert.ok(view.q("[data-bay-order-row=buy-1]"));
  assert.equal(view.q("[data-bay-order-row=sell-1]"), null);
  assert.doesNotMatch(view.host.textContent, /交易状态/);
  assert.equal(view.q("[data-bay-order-contact=buy-1]"), null);
  assert.equal(view.q("[data-bay-order-review=buy-1]"), null);
  await view.unmount();

  reset([]);
  const empty = await mount(React.createElement(MyBoughtPane, props("bought")));
  assert.ok(empty.q("[data-bay-empty=category]"));
  assert.doesNotMatch(empty.host.textContent, /你还没有买过东西/);
  assert.doesNotMatch(empty.host.textContent, /去逛逛/);
  assert.doesNotMatch(empty.host.textContent, /去发布/);
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

const clickConfirm = async (view, kind, id) => {
  await view.click(`[data-bay-mine-delete="${id}"]`);
  assert.ok(view.q(`[data-bay-mine-confirm="${id}"]`), `${kind} 要先二次确认，不能一点就删`);
  await view.click(`[data-bay-mine-delete-confirm="${id}"]`);
};

test("我发布的：每一行都能删除，先二次确认，再调对应的删除接口", async () => {
  reset();
  const view = await mount(React.createElement(MyPublishedPane, props("published")));
  for (const id of ["service:s1", "service:s-digital", "app:a1", "lesson:l1"]) {
    assert.ok(view.q(`[data-bay-mine-delete="${id}"]`), `${id} 缺少删除按钮`);
  }
  await view.click('[data-bay-mine-delete="service:s1"]');
  assert.ok(view.q('[data-bay-mine-confirm="service:s1"]'));
  assert.equal(W.calls.some((call) => call.method === "DELETE"), false, "确认之前不能发请求");
  await view.click('[data-bay-mine-delete-confirm="service:s1"]');
  assert.ok(W.calls.some((call) => call.method === "DELETE" && call.path === "/v1/talent/me/services/s1"));
  await view.unmount();

  reset();
  const apps = await mount(React.createElement(MyPublishedPane, props("published")));
  await clickConfirm(apps, "网站与软件服务", "app:a1");
  assert.ok(W.calls.some((call) => call.method === "DELETE" && call.path === "/v1/bay/apps/a1"));
  await clickConfirm(apps, "课程", "lesson:l1");
  assert.ok(W.calls.some((call) => call.method === "DELETE" && call.path === "/v1/bay/lessons/l1"));
  await apps.unmount();
});

test("我发布的：服务端不让删时，原因显示在这一行下面，行还在", async () => {
  reset();
  const base = globalThis.__w3HttpRespond;
  globalThis.__w3HttpRespond = (method, path, ...rest) => {
    if (method === "DELETE") throw new Error("这条服务还有进行中的订单，处理完再删除");
    return base(method, path, ...rest);
  };
  const view = await mount(React.createElement(MyPublishedPane, props("published")));
  await clickConfirm(view, "服务", "service:s1");
  const error = view.q('[data-bay-mine-delete-error="service:s1"]');
  assert.ok(error);
  assert.match(error.textContent, /进行中的订单/);
  assert.ok(view.q('[data-bay-mine-row="service:s1"]'));
  await view.unmount();
});

test("我卖出的：只有已了结的订单能删，删的是「从我的列表移除」，不碰订单本身", async () => {
  reset([
    contract({ id: "sell-done", title: "做完的稿", my_role: "seller", status: "completed" }),
    contract({ id: "sell-live", title: "在做的稿", my_role: "seller", status: "active" }),
  ]);
  const view = await mount(React.createElement(MySoldPane, props("sold")));
  assert.ok(view.q('[data-bay-mine-delete="order:sell-done"]'));
  assert.equal(view.q('[data-bay-mine-delete="order:sell-live"]'), null, "进行中的订单不给删除");
  assert.equal(view.q('[data-bay-mine-delete="proposal:p1"]'), null, "等回复的报价不给删除");
  await clickConfirm(view, "订单", "order:sell-done");
  const post = W.calls.find((call) => call.method === "POST" && call.path === "/v1/bay/mine/hidden");
  assert.deepEqual(post && post.body, { item_kind: "order", item_ref: "sell-done" });
  assert.equal(W.calls.some((call) => call.method === "DELETE"), false, "订单本身不能被真删");
  await view.unmount();
});

test("我卖出的 / 我买到的：已移除的行不再出现", async () => {
  reset([
    contract({ id: "sell-done", title: "做完的稿", my_role: "seller", status: "completed" }),
    contract({ id: "buy-done", title: "买到的稿", my_role: "buyer", status: "cancelled" }),
  ]);
  const base = globalThis.__w3HttpRespond;
  globalThis.__w3HttpRespond = (method, path, ...rest) =>
    method === "GET" && path === "/v1/bay/mine/hidden"
      ? { items: [{ item_kind: "order", item_ref: "sell-done" }] }
      : base(method, path, ...rest);
  const sold = await mount(React.createElement(MySoldPane, props("sold")));
  assert.equal(sold.q("[data-bay-order-row=sell-done]"), null);
  await sold.unmount();
  const bought = await mount(React.createElement(MyBoughtPane, props("bought")));
  assert.ok(bought.q("[data-bay-order-row=buy-done]"));
  assert.ok(bought.q('[data-bay-mine-delete="order:buy-done"]'), "已取消的买入订单可以移除");
  await bought.unmount();
});
