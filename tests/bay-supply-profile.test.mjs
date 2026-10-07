// W05：个人主页窗格。
// 覆盖：简介/技能/服务/评价；点服务打开服务；先聊聊走 direct；未登录只弹登录；
// 举报与拉黑的请求形状；delivery_days 有值才显示；窗格没有返回栏。
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
const { ProfilePane, ProfileDetailView } = await import(await compileModule("src/shell/bay/supply/ProfilePane.tsx", stubs));

function page(extra = {}) {
  return {
    profile: {
      user_id: "seller-1",
      handle: "leo",
      display_name: "Leo",
      avatar_url: null,
      headline: "十年品牌设计",
      bio: "只做品牌",
      skills: ["Logo"],
      languages: ["中文"],
      categories: ["design"],
      rating_avg: 4.8,
      rating_count: 10,
      ...extra.profile,
    },
    services: extra.services ?? [
      {
        id: "svc-1",
        user_id: "seller-1",
        title: "品牌 Logo 设计",
        summary: "三版方案",
        category: "design",
        cover_url: null,
        engagement_kind: "fixed",
        price_fen: 128000,
        price_unit: "project",
        delivery_days: 3,
        status: "published",
        order_count: 2,
        currency: "CNY",
      },
      {
        id: "svc-2",
        user_id: "seller-1",
        title: "海报",
        summary: "",
        category: "design",
        cover_url: null,
        engagement_kind: "fixed",
        price_fen: 80000,
        price_unit: "project",
        delivery_days: null,
        status: "published",
        currency: "CNY",
      },
    ],
    showcase: extra.showcase ?? [
      { id: "w1", source_kind: "manual", title: "案例 A", summary: "一页", cover_url: null, detail_level: "summary" },
      { id: "w2", source_kind: "task", title: "已交付", summary: "", cover_url: null, detail_level: "summary" },
    ],
    reviews: extra.reviews ?? [
      { id: "r1", contract_id: "k", author_user_id: "b1", target_user_id: "seller-1", author_role: "buyer", rating: 5, body: "很好", revealed: true, created_at: "2026-10-01", author: { display_name: "小王" } },
    ],
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
  globalThis.__bayViewer = "buyer-1";
}

const markup = (props) => renderToStaticMarkup(React.createElement(ProfileDetailView, props));

test("主页：名字、简介、服务、作品、评价；有交期显示、null 不显示；没有返回栏", () => {
  reset();
  const out = markup({ page: page(), viewerId: "buyer-1" });
  assert.match(out, /data-bay-pane="profile"/);
  assert.match(out, /Leo/);
  assert.match(out, /十年品牌设计/);
  assert.match(out, /品牌 Logo 设计/);
  assert.match(out, /3 天交付/);
  assert.match(out, /案例 A/);
  assert.match(out, /已交付/);
  assert.match(out, /很好/);
  assert.match(out, /先聊聊/);
  assert.doesNotMatch(out, /返回/);
  const afterPoster = out.split("海报")[1] || "";
  assert.doesNotMatch(afterPoster.split("案例")[0] || afterPoster, /天交付/);
});

test("主页：本人看不到先聊聊、举报、拉黑", () => {
  reset();
  const out = markup({ page: page(), viewerId: "seller-1" });
  assert.doesNotMatch(out, /data-bay-talk/);
  assert.doesNotMatch(out, /data-bay-report/);
  assert.doesNotMatch(out, /data-bay-block/);
});

test("主页：用户内容当纯文本", () => {
  reset();
  const out = markup({
    page: page({ profile: { user_id: "seller-1", handle: "leo", display_name: "<img src=x>", headline: "<script>x</script>", bio: "<b>x</b>" } }),
    viewerId: null,
  });
  assert.ok(out.includes("&lt;img src=x"));
  assert.ok(!out.includes("<script>x</script>"));
  assert.ok(!out.includes("<b>x</b>"));
});

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(() => {
    root.render(element);
  });
  return {
    host,
    async click(selector) {
      const node = host.querySelector(selector);
      assert.ok(node, selector);
      await act(() => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    unmount() {
      root.unmount();
      host.remove();
    },
  };
}

test("主页：点服务打开服务；先聊聊走 direct；未登录只弹登录", async () => {
  reset();
  const view = await mount(React.createElement(ProfileDetailView, { page: page(), viewerId: "buyer-1" }));
  await view.click('[data-bay-card="service"][data-bay-id="svc-1"]');
  assert.deepEqual(globalThis.__bayOpened, [{ kind: "service", id: "svc-1" }]);
  await view.click("[data-bay-talk]");
  assert.deepEqual(globalThis.__bayThreads, [{ kind: "direct", userId: "seller-1" }]);
  view.unmount();

  reset();
  globalThis.__baySignedIn = false;
  const guest = await mount(React.createElement(ProfileDetailView, { page: page(), viewerId: null }));
  await guest.click("[data-bay-talk]");
  assert.equal(globalThis.__bayLoginAsked, 1);
  assert.deepEqual(globalThis.__bayThreads, []);
  guest.unmount();
});

test("主页：拉黑与举报的请求形状", async () => {
  reset();
  globalThis.__bayHttpRespond = () => ({ ok: true, duplicate: false });
  const view = await mount(React.createElement(ProfileDetailView, { page: page(), viewerId: "buyer-1" }));
  await view.click("[data-bay-block]");
  await view.click("[data-bay-report]");
  const reason = view.host.querySelector("select");
  assert.ok(reason);
  await act(() => {
    reason.value = "offsite";
    reason.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await view.click("[data-bay-report-form] button");
  const calls = globalThis.__bayHttpCalls.map(({ method, path, body }) => ({ method, path, body }));
  assert.ok(calls.some((row) => row.method === "POST" && row.path === "/v1/im/blocks" && row.body.user_id === "seller-1"));
  assert.ok(calls.some((row) => row.method === "POST" && row.path === "/v1/talent/reports" && row.body.target_kind === "profile" && row.body.target_ref === "seller-1"));
  view.unmount();
});

test("主页窗格：目标不是主页时什么都不画；404 说不存在", async () => {
  reset();
  assert.equal(renderToStaticMarkup(React.createElement(ProfilePane, { target: { kind: "feed" }, layout: "docked", siteKey: "design" })), "");
  globalThis.__bayHttpRespond = () => Promise.reject(Object.assign(new Error("gone"), { status: 404 }));
  const view = await mount(React.createElement(ProfilePane, { target: { kind: "profile", handle: "missing" }, layout: "docked", siteKey: "design" }));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  assert.match(view.host.textContent, /这个主页不存在或尚未公开/);
  view.unmount();
});
