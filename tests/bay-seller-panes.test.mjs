// W08：我的服务、卖家资料、资质审核。
// 覆盖：概况数字与收款入口、空状态、状态分组、窗格无返回栏；
// 资料保存请求体没有 timezone；作品集加入用 pickLibraryWork 的返回；
// 审核提交与申诉请求形状；受限领域不出现在领域选项里。
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
  HTMLSelectElement: dom.window.HTMLSelectElement,
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
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  globalThis.__bayLoginAsked ??= 0;
  globalThis.__baySignedIn ??= true;
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function useBaySiteKey(){ return "design"; }
  export function bayBack(){}
`);
const settingsStub = dataModule(`
  globalThis.__baySettings ??= [];
  export async function ensureBayTerms(){ return true; }
  export function openBaySettings(pane){ globalThis.__baySettings.push(pane); }
`);
const linksStub = dataModule(`export function baySiteName(key){ return key === "design" ? "LeoDesign" : key || null; }`);
const authStub = dataModule(`
  export async function getUserId(){ return globalThis.__bayViewer || "me"; }
  export const AUTH_STATE_EVENT = "oceanleo-auth-state";
  export async function accessToken(){ return "t"; }
  export function cachedAccessToken(){ return "t"; }
`);
const needsStub = dataModule(`
  export async function pickLibraryWork(){ return globalThis.__bayPickedWork ?? { kind: "task", id: "task-42", site_key: "ppt", title: "季度汇报" }; }
`);
const httpStub = dataModule(`
  globalThis.__baySellerCalls ??= [];
  async function reply(method, path, body) {
    globalThis.__baySellerCalls.push({ method, path, body });
    const responder = globalThis.__baySellerReply;
    return responder ? responder(method, path, body) : {};
  }
  export class BayApiError extends Error {}
  export const bayGet = (path) => reply("GET", path);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const agentStub = dataModule(`
  export async function authed(path, init) {
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    globalThis.__baySellerCalls.push({ method: init && init.method, path, body });
    const handler = globalThis.__baySellerAuthed;
    return handler ? handler(path, init, body) : { ok: true, data: { profile: body || {} } };
  }
`);

const sellerStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/auth/client": authStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../agent": agentStub,
  "../shell/bay-state": stateStub,
  "../shell/bay-links": linksStub,
  "../settings": settingsStub,
  "../needs": needsStub,
  "../needs/LibraryWorkPicker": needsStub,
};

const { MyServicesPane } = await import(await compileModule("src/shell/bay/seller/MyServicesPane.tsx", sellerStubs));
const { BaySellerProfileSection } = await import(await compileModule("src/shell/bay/seller/BaySellerProfileSection.tsx", sellerStubs));
const { BayVettingSection } = await import(await compileModule("src/shell/bay/seller/BayVettingSection.tsx", sellerStubs));
const sellerIndex = await import(await compileModule("src/shell/bay/seller/index.ts", sellerStubs));

function reset() {
  globalThis.__bayOpened = [];
  globalThis.__baySettings = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayViewer = "me";
  globalThis.__baySellerCalls = [];
  globalThis.__bayPickedWork = { kind: "task", id: "task-42", site_key: "ppt", title: "季度汇报" };
  globalThis.__baySellerReply = (method, path) => {
    if (path === "/v1/talent/me/services") {
      return {
        items: [
          { id: "s1", title: "Logo", status: "published", summary: "三版", order_count: 2, view_count: 9, delivery_days: 3, posted_site: "design" },
          { id: "s2", title: "草稿服务", status: "draft" },
        ],
      };
    }
    if (path === "/v1/talent/consults/mine" || path.endsWith("/consults/mine")) return { items: [{ id: "c1", title: "个税答疑", regulated_domain: "tax" }] };
    if (path === "/v1/talent/me/stats") return { orders_by_status: { active: 2, delivered: 1 }, rating_avg: 4.6, rating_count: 8, pending_orders: 0 };
    if (path.startsWith("/v1/talent/threads")) return { threads: [{ id: "t1", unread_count: 2 }] };
    if (path === "/v1/moderation/my-cases") return { cases: [] };
    if (path === "/v1/talent/me") return { profile: { handle: "leo", display_name: "Leo", published: true, skills: ["Logo"], languages: ["中文"] } };
    if (path === "/v1/talent/me/showcase") return { items: [{ id: "w1", title: "案例 A", summary: "一页" }] };
    if (path === "/v1/talent/vetting/mine") {
      return {
        credentials: [{ id: "cr1", domain: "tax", state: "valid", source: "x", expires_at: null }],
        decisions: [{ id: "d1", verdict: "reject", reason_zh: "查不到", appealed: false }],
        recheck_days: 180,
      };
    }
    return {};
  };
  globalThis.__baySellerAuthed = (path, init, body) => ({ ok: true, data: { profile: body || {}, items: [{ id: "w2", title: "季度汇报" }] } });
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(() => {
    root.render(element);
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
  return {
    host,
    async click(selector) {
      const node = host.querySelector(selector);
      assert.ok(node, selector);
      await act(() => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    },
    unmount() {
      root.unmount();
      host.remove();
    },
  };
}

test("出口：seller 的 index.ts 导出契约里的全部名字", () => {
  for (const name of ["MyServicesPane", "ServiceEditorPane", "BaySellerProfileSection", "BayVettingSection"]) {
    assert.equal(typeof sellerIndex[name], "function", name);
  }
});

test("我的服务：概况、分组、空状态入口；没有返回栏；钱只给设置入口", async () => {
  reset();
  const view = await mount(React.createElement(MyServicesPane, { target: { kind: "mine", tab: "services" }, layout: "docked", siteKey: "design" }));
  assert.match(view.host.innerHTML, /data-bay-seller-overview/);
  assert.match(view.host.textContent, /进行中的订单/);
  assert.match(view.host.textContent, /3/);
  assert.match(view.host.textContent, /待回复/);
  assert.match(view.host.textContent, /4\.6/);
  assert.match(view.host.innerHTML, /data-bay-group="published"/);
  assert.match(view.host.innerHTML, /data-bay-group="draft"/);
  assert.match(view.host.textContent, /LeoDesign/);
  assert.doesNotMatch(view.host.textContent, /返回/);
  await view.click("[data-bay-money-entry]");
  assert.deepEqual(globalThis.__baySettings, ["money"]);
  await view.click('[data-bay-own-service="s1"]');
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "service-editor", serviceId: "s1" });
    assert.equal(view.host.querySelectorAll("[data-bay-new-service]").length, 1, "有服务时右上角有一个「发布服务」");
  view.unmount();
});

test("我的服务：空状态引导发布第一个服务", async () => {
  reset();
  globalThis.__baySellerReply = (method, path) => {
    if (path === "/v1/talent/me/stats") return { orders_by_status: {}, rating_avg: 0, rating_count: 0 };
    if (path.startsWith("/v1/talent/threads")) return { threads: [] };
    return { items: [], cases: [] };
  };
  const view = await mount(React.createElement(MyServicesPane, { target: { kind: "mine", tab: "services" }, layout: "page", siteKey: "design" }));
  assert.match(view.host.innerHTML, /data-bay-empty="services"/);
  // 空状态里已经有「发布第一个服务」，右上角那个「发布服务」不再同时出现。
  assert.equal(view.host.querySelectorAll("[data-bay-new-service]").length, 0);
  assert.equal((view.host.innerHTML.match(/发布第一个服务/g) || []).length, 1);
  assert.equal((view.host.innerHTML.match(/>发布服务</g) || []).length, 0);
  view.unmount();
});

function setInput(node, value) {
  const proto = node.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

test("卖家资料：保存请求体没有 timezone；作品集加入用 pickLibraryWork 的返回", async () => {
  reset();
  const view = await mount(React.createElement(BaySellerProfileSection));
  setInput(view.host.querySelector('[data-bay-field="handle"]'), "leo");
  setInput(view.host.querySelector('[data-bay-field="display_name"]'), "Leo");
  await view.click("[data-bay-save-profile]");
  const put = globalThis.__baySellerCalls.find((row) => row.method === "PUT" && row.path === "/v1/talent/me");
  assert.ok(put);
  assert.equal(Object.prototype.hasOwnProperty.call(put.body, "timezone"), false);
  assert.equal(put.body.handle, "leo");
  await view.click("[data-bay-import-work]");
  const add = globalThis.__baySellerCalls.find((row) => row.path === "/v1/talent/me/showcase/import-tasks");
  assert.deepEqual(add.body, { task_ids: ["task-42"], detail_level: "summary" });
  view.unmount();
});

test("资质审核：提交与申诉请求形状；领域选项没有医疗、法律、宠物医疗", async () => {
  reset();
  const view = await mount(React.createElement(BayVettingSection));
  const options = [...view.host.querySelectorAll('[data-bay-field="domain"] option')].map((node) => node.value);
  assert.ok(options.includes("tax"));
  assert.ok(!options.includes("medical"));
  assert.ok(!options.includes("legal"));
  assert.ok(!options.includes("vet"));
  setInput(view.host.querySelector('[data-bay-field="credential_no"]'), "A-123");
  setInput(view.host.querySelector('[data-bay-field="source"]'), "学信网");
  await view.click("[data-bay-submit-vetting]");
  const submit = globalThis.__baySellerCalls.find((row) => row.path === "/v1/talent/vetting/submit");
  assert.equal(submit.body.domain, "tax");
  assert.equal(submit.body.kind, "education");
  assert.equal(submit.body.credential_no, "A-123");
  assert.equal(submit.body.source, "学信网");
  await view.click("[data-bay-appeal]");
  assert.ok(globalThis.__baySellerCalls.some((row) => row.path === "/v1/talent/vetting/d1/appeal"));
  view.unmount();
});

test("静态：我的服务未登录只给登录", () => {
  reset();
  globalThis.__baySignedIn = false;
  const out = renderToStaticMarkup(React.createElement(MyServicesPane, { target: { kind: "mine", tab: "services" }, layout: "docked", siteKey: "design" }));
  assert.match(out, /登录后管理你发布的服务/);
  assert.doesNotMatch(out, /返回/);
});
