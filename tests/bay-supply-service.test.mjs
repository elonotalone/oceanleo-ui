// W05：服务详情窗格。
// 覆盖：档位/加购/常见问题/作品图/评价/卖家卡的展示与合计；卖家本人看到「编辑」看不到下单；
// 未登录点下单、先聊聊、收藏都只弹登录；下单带档位与加购；先聊聊走 openTradeThread；收藏的请求形状；
// 用户内容当纯文本、媒体只认 http(s)。网络、登录、浮窗状态、交易会话全部用桩。
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
const authStub = dataModule(`export async function getUserId(){ return globalThis.__bayViewer ?? null; }`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  globalThis.__bayLoginAsked ??= 0;
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function bayBack(){}
`);
const dealStub = dataModule(`
  globalThis.__bayThreads ??= [];
  export async function openTradeThread(subject){ globalThis.__bayThreads.push(subject); if (globalThis.__bayThreadError) throw new Error(globalThis.__bayThreadError); }
  export function DealConversationView(){ return null; }
`);
const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/auth/client": authStub,
  "../shell/bay-state": stateStub,
  "../deal": dealStub,
};
const { ServicePane, ServiceDetailView } = await import(await compileModule("src/shell/bay/supply/ServicePane.tsx", stubs));

function fixture(extra = {}) {
  return {
    id: "svc-1",
    user_id: "seller-1",
    title: "品牌 Logo 设计",
    summary: "三版方案",
    description: "<script>alert(1)</script>\n第二行",
    category: "design",
    cover_url: null,
    engagement_kind: "fixed",
    price_fen: 30000,
    price_unit: "project",
    delivery_days: 5,
    status: "published",
    view_count: 12,
    order_count: 3,
    tags: ["logo"],
    currency: "CNY",
    tiers: [
      { id: "t1", service_id: "svc-1", tier: "basic", title: "一版", description: "", price_fen: 30000, delivery_days: 3, revisions: 1, features: ["源文件"], enabled: true },
      { id: "t3", service_id: "svc-1", tier: "premium", title: "三版", description: "", price_fen: 90000, delivery_days: 7, revisions: -1, features: [], enabled: true },
    ],
    addons: [{ id: "a1", service_id: "svc-1", title: "加急", description: "", price_fen: 5000, extra_days: 1, enabled: true }],
    faq: [{ id: "f1", question: "能开发票吗？", answer: "可以" }],
    media: [
      { id: "m1", kind: "image", url: "https://cdn.example/1.png", poster_url: null, caption: "" },
      { id: "m2", kind: "video", url: "javascript:alert(1)", poster_url: null, caption: "" },
    ],
    reviews: [{ id: "r1", contract_id: "k", author_user_id: "b1", target_user_id: "seller-1", author_role: "buyer", rating: 5, body: "很满意", revealed: true, created_at: "2026-10-01", author: { display_name: "小王" } }],
    seller: { user_id: "seller-1", handle: "leo", display_name: "Leo", avatar_url: null, headline: "十年品牌设计", rating_avg: 4.9, rating_count: 8, response_minutes: 30, languages: ["中文"] },
    ...extra,
  };
}

function reset() {
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = null;
  globalThis.__bayOpened = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayThreads = [];
  globalThis.__bayThreadError = null;
  globalThis.__bayViewer = null;
}

const html = (props) => renderToStaticMarkup(React.createElement(ServiceDetailView, props));

test("服务详情：档位、加购、常见问题、作品图、评价、卖家卡与合计", () => {
  reset();
  const out = html({ service: fixture(), viewerId: "buyer-1", layout: "docked" });
  assert.match(out, /品牌 Logo 设计/);
  assert.match(out, /data-bay-tier="basic" data-selected="true"/, "默认选最便宜的档");
  assert.match(out, /data-bay-tier="premium" data-selected="false"/);
  assert.match(out, /data-bay-addon="a1"/);
  assert.match(out, /能开发票吗？/);
  assert.match(out, /很满意/);
  assert.match(out, /data-bay-seller-card/);
  assert.match(out, /十年品牌设计/);
  assert.match(out, /data-bay-total="?[^>]*>¥300</);
  assert.match(out, /3 天交付/);
  assert.match(out, /data-bay-action="order"/);
  assert.match(out, /data-bay-action="talk"/);
  assert.doesNotMatch(out, /data-bay-action="edit"/);
  assert.match(out, /data-bay-favorite="off"/);
});

test("服务详情：卖家本人看到「编辑」，看不到下单、先聊聊、举报", () => {
  reset();
  const out = html({ service: fixture(), viewerId: "seller-1", layout: "page" });
  assert.match(out, /data-bay-action="edit"/);
  assert.doesNotMatch(out, /data-bay-action="order"/);
  assert.doesNotMatch(out, /data-bay-action="talk"/);
  assert.doesNotMatch(out, /data-bay-report/);
});

test("服务详情：用户内容当纯文本，媒体只认 http(s)", () => {
  reset();
  const out = html({ service: fixture(), viewerId: null, layout: "docked" });
  assert.ok(!out.includes("<script>alert(1)</script>"));
  assert.ok(out.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.doesNotMatch(out, /javascript:/);
  assert.doesNotMatch(out, /<video/);
});

test("服务详情：没有可选档位时不能下单", () => {
  reset();
  const out = html({ service: fixture({ tiers: [] }), viewerId: null, layout: "docked" });
  assert.match(out, /data-bay-action="order"[^>]*disabled/);
});

test("ServicePane：目标不是服务时什么都不画", () => {
  reset();
  assert.equal(renderToStaticMarkup(React.createElement(ServicePane, { target: { kind: "feed" }, layout: "docked", siteKey: "design" })), "");
});

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  for (let i = 0; i < 4; i += 1) await act(async () => {});
  return {
    host,
    click: async (selector) => {
      const node = host.querySelector(selector);
      assert.ok(node, `找不到 ${selector}`);
      await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      for (let i = 0; i < 4; i += 1) await act(async () => {});
    },
    unmount: () => act(() => root.unmount()),
  };
}

test("服务窗格：取详情（匿名），选高级档 + 加购后下单，带着档位与加购去下单页", async () => {
  reset();
  globalThis.__bayHttpRespond = (method, path) => {
    if (path.startsWith("/v1/talent/services/")) return { service: fixture() };
    if (path === "/v1/talent/categories") return { items: [] };
    if (path.startsWith("/v1/talent/favorites")) return { items: [], total: 0 };
    return {};
  };
  const view = await mount(React.createElement(ServicePane, { target: { kind: "service", id: "svc-1" }, layout: "docked", siteKey: "design" }));
  const detail = globalThis.__bayHttpCalls.find((c) => c.path === "/v1/talent/services/svc-1");
  assert.ok(detail, "取了服务详情");
  assert.deepEqual(detail.opts, { anonymous: true });
  const premium = [...view.host.querySelectorAll('[data-bay-tier="premium"] button')].at(-1);
  await act(async () => premium.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  const box = view.host.querySelector('[data-bay-addon="a1"] input');
  await act(async () => box.click());
  assert.match(view.host.querySelector("[data-bay-total]").textContent, /¥950/);
  await view.click('[data-bay-action="order"]');
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "checkout", serviceId: "svc-1", tier: "premium" });
  await view.unmount();
});

test("服务窗格：先聊聊走 openTradeThread；打不开时说一句", async () => {
  reset();
  globalThis.__bayHttpRespond = () => ({ items: [], total: 0 });
  const view = await mount(React.createElement(ServiceDetailView, { service: fixture(), viewerId: "buyer-1", layout: "docked" }));
  await view.click('[data-bay-action="talk"]');
  assert.deepEqual(globalThis.__bayThreads, [{ kind: "service", subjectRef: "svc-1" }]);
  globalThis.__bayThreadError = "会话打不开";
  await view.click('[data-bay-action="talk"]');
  assert.match(view.host.textContent, /会话打不开/);
  await view.unmount();
});

test("服务窗格：未登录时下单、先聊聊、收藏、举报都只弹登录", async () => {
  reset();
  globalThis.__baySignedIn = false;
  globalThis.__bayHttpRespond = () => ({ items: [], total: 0 });
  const view = await mount(React.createElement(ServiceDetailView, { service: fixture(), viewerId: null, layout: "docked" }));
  await view.click('[data-bay-action="order"]');
  await view.click('[data-bay-action="talk"]');
  await view.click("[data-bay-favorite]");
  await view.click("[data-bay-report]");
  assert.equal(globalThis.__bayLoginAsked, 4);
  assert.deepEqual(globalThis.__bayOpened, []);
  assert.deepEqual(globalThis.__bayThreads, []);
  assert.ok(!globalThis.__bayHttpCalls.some((c) => c.method !== "GET"), "没有发任何写请求");
  assert.equal(view.host.querySelector("[data-bay-report-form]"), null);
  await view.unmount();
});

test("服务窗格：收藏与举报的请求形状", async () => {
  reset();
  globalThis.__bayHttpRespond = (method) => (method === "GET" ? { items: [], total: 0 } : { ok: true, duplicate: false });
  const view = await mount(React.createElement(ServiceDetailView, { service: fixture(), viewerId: "buyer-1", layout: "docked" }));
  await view.click("[data-bay-favorite]");
  assert.deepEqual(globalThis.__bayHttpCalls.filter((c) => c.method === "POST").at(-1), {
    method: "POST",
    path: "/v1/talent/favorites",
    body: { target_kind: "service", target_ref: "svc-1" },
    opts: undefined,
  });
  assert.equal(view.host.querySelector("[data-bay-favorite]").getAttribute("data-bay-favorite"), "on");
  await view.click("[data-bay-favorite]");
  assert.equal(globalThis.__bayHttpCalls.at(-1).method, "DELETE");
  assert.equal(globalThis.__bayHttpCalls.at(-1).path, "/v1/talent/favorites?target_kind=service&target_ref=svc-1");
  await view.click("[data-bay-report]");
  await view.click("[data-bay-report-form] button");
  assert.deepEqual(globalThis.__bayHttpCalls.at(-1).body, { target_kind: "service", target_ref: "svc-1", reason: "虚假信息或夸大宣传" });
  assert.ok(view.host.querySelector("[data-bay-report-done]"));
  await view.unmount();
});
