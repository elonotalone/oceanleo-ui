// W05：答疑详情与预约。
// 覆盖：范围/轮次/时长/回复时限/价格的展示；医疗、法律、宠物医疗的答疑只显示「暂未开放」（无价格、无预约）；
// 知识区里没有任何按钮；需核验领域缺答疑口径时不开放预约；预约先过买家条款，成功后去订单。
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://oceanleo.com/bay" });
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
const settingsStub = dataModule(`
  globalThis.__bayTerms ??= [];
  export async function ensureBayTerms(scope) { globalThis.__bayTerms.push(scope); return globalThis.__bayTermsAccept !== false; }
`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ return globalThis.__baySignedIn !== false; }
  export function bayBack(){}
`);
const paymentsStub = dataModule(`
  globalThis.__bayPayments ??= [];
  export async function fetchBayPaymentConfig(){ globalThis.__bayPayments.push("config"); return { enabled: false, buyer_ready: false, seller_ready: false, currency: "usd" }; }
  export async function startBayPayment(id){ globalThis.__bayPayments.push("start:" + id); throw new Error("must not pay in tests"); }
`);
const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/bay/payments": paymentsStub,
  "../settings": settingsStub,
  "../shell/bay-state": stateStub,
};
const { ConsultPane, ConsultDetailView } = await import(await compileModule("src/shell/bay/supply/ConsultPane.tsx", stubs));

function consult(extra = {}) {
  return {
    id: "c1",
    user_id: "u9",
    category_slug: "tax-basic",
    regulated_domain: "tax",
    title: "个税年度汇算答疑",
    summary: "专项附加扣除怎么填",
    scope_note: "只答个人所得税",
    price_fen: 20000,
    price_unit: "session",
    rounds: 3,
    minutes: null,
    response_window: "24 小时内",
    status: "published",
    currency: "CNY",
    seller: { user_id: "u9", handle: "taxpro", display_name: "老张", self_described_role: "前事务所会计" },
    ...extra,
  };
}
const TAX = { key: "tax", name_zh: "税务", name_en: "Tax", summary: "", gated: false, ask_placeholder: "a", forbidden_hint: "不代办报税", answer_disclaimer: "仅供参考" };

function reset() {
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = null;
  globalThis.__bayTerms = [];
  globalThis.__bayTermsAccept = true;
  globalThis.__bayOpened = [];
  globalThis.__baySignedIn = true;
  globalThis.__bayPayments = [];
}

const html = (props) => renderToStaticMarkup(React.createElement(ConsultDetailView, props));

test("答疑详情：范围、轮次、回复时限、价格；知识区没有按钮", () => {
  reset();
  const out = html({ consult: consult(), domain: TAX });
  assert.match(out, /个税年度汇算答疑/);
  assert.match(out, /专项附加扣除怎么填/);
  assert.match(out, /只答个人所得税/);
  assert.match(out, /不代办报税/);
  assert.match(out, /仅供参考/);
  assert.match(out, /¥200 \/ 每次/);
  assert.match(out, /每次 3 轮问答/);
  assert.match(out, /24 小时内/);
  assert.match(out, /税务/);
  assert.match(out, /自述：前事务所会计/);
  const knowledge = out.match(/data-zone="knowledge"[\s\S]*?<hr/)[0];
  assert.doesNotMatch(knowledge, /<button/, "知识区里不放任何按钮");
  assert.match(out, /data-bay-action="book"(?![^>]*\sdisabled="")/);
  assert.match(out, /data-bay-pay-hint[^>]*>付款暂未开放：订单会先建好/);
  assert.match(html({ consult: consult(), domain: TAX, buyerReady: true }), /下单后去付款/);
});

test("答疑详情：答复人没写自述身份时照实说；有核验称谓时只显示称谓", () => {
  reset();
  const bare = html({ consult: consult({ seller: { user_id: "u9", handle: "taxpro", display_name: "老张" } }), domain: TAX });
  assert.match(bare, /未填写自述身份/);
  const vetted = html({
    consult: consult({
      regulated_domain: "edu_adult",
      seller: { user_id: "u9", handle: "t", display_name: "王老师", self_described_role: "培训师", practice_vetting: [{ domain: "edu_adult", state: "verified" }] },
    }),
    domain: { key: "edu_adult", name_zh: "成人教育", name_en: "Adult education", summary: "", gated: false },
  });
  assert.match(vetted, /教师资格已核验/);
  assert.doesNotMatch(vetted, /自述：培训师|未填写自述身份/);
});

test("答疑详情：按小时计费显示时长", () => {
  reset();
  const out = html({ consult: consult({ price_unit: "hour", rounds: null, minutes: 45 }), domain: TAX });
  assert.match(out, /¥200 \/ 每小时/);
  assert.match(out, /按小时计费，单次约 45 分钟/);
});

test("医疗、法律、宠物医疗的答疑：只显示暂未开放，没有价格也没有预约", () => {
  reset();
  for (const domain of ["medical", "legal", "vet"]) {
    const out = html({ consult: consult({ regulated_domain: domain }), domain: null });
    assert.match(out, /这个领域的答疑暂未开放/);
    assert.doesNotMatch(out, /¥200/);
    assert.doesNotMatch(out, /data-bay-action="book"/);
    assert.doesNotMatch(out, /个税年度汇算答疑/);
  }
});

test("需核验领域：答疑口径还在取时先不给预约，也不说「缺」；暂停的答疑不接受预约", () => {
  reset();
  const gated = { key: "psych", name_zh: "心理", name_en: "Psych", summary: "", gated: true };
  // 服务端渲染（没有 effect）时口径一定还在取：先不给预约，也不抢着说缺。
  const loading = html({ consult: consult({ regulated_domain: "psych" }), domain: gated, domainsLoading: false });
  assert.match(loading, /正在取这个领域的答疑口径/);
  assert.match(loading, /data-bay-action="book"[^>]*\sdisabled=""/, "口径还在取时先不给预约");
  assert.doesNotMatch(loading, /这个领域要先有平台下发的答疑口径/, "还在取时不说缺");
  const domainsLoading = html({ consult: consult({ regulated_domain: "psych" }), domain: gated, domainsLoading: true });
  assert.match(domainsLoading, /data-bay-action="book"[^>]*\sdisabled=""/, "领域清单还在取时同样先不给预约");
  const paused = html({ consult: consult({ status: "paused" }), domain: TAX });
  assert.match(paused, /暂不接受预约/);
});

test("需核验领域取不到答疑口径：取完后不开放预约，也不在前端编文案顶上", async () => {
  reset();
  const gated = { key: "psych", name_zh: "心理", name_en: "Psych", summary: "", gated: true };
  globalThis.__bayHttpRespond = (method, path) => {
    if (path === "/v1/talent/domains/psych/prompts") return { ask_placeholder: "", forbidden_hint: "", answer_disclaimer: "" };
    return {};
  };
  const view = await mount(React.createElement(ConsultDetailView, { consult: consult({ regulated_domain: "psych" }), domain: gated }));
  const prompts = globalThis.__bayHttpCalls.find((c) => c.path === "/v1/talent/domains/psych/prompts");
  assert.deepEqual(prompts.opts, { anonymous: true }, "口径匿名取");
  assert.match(view.host.textContent, /这个领域的答疑口径还没有下发，暂时不能预约/);
  assert.match(view.host.textContent, /这个领域要先有平台下发的答疑口径/);
  assert.equal(view.host.querySelector("[data-bay-disclaimer]"), null, "不在前端编一段口径顶上");
  const book = view.host.querySelector('[data-bay-action="book"]');
  assert.equal(book.disabled, true);
  await view.click('[data-bay-action="book"]');
  assert.equal(globalThis.__bayHttpCalls.filter((c) => c.method === "POST").length, 0, "不开放时点了也不预约");
  assert.deepEqual(globalThis.__bayTerms, [], "不开放时不问条款");
  await view.unmount();

  // 口径取到了：显示后端给的原文，开放预约。
  reset();
  globalThis.__bayHttpRespond = (method, path) => {
    if (path === "/v1/talent/domains/psych/prompts") return { ask_placeholder: "说说你的困扰", forbidden_hint: "不做诊断", answer_disclaimer: "这不是医疗意见" };
    return {};
  };
  const ready = await mount(React.createElement(ConsultDetailView, { consult: consult({ regulated_domain: "psych" }), domain: gated }));
  assert.match(ready.host.textContent, /这不是医疗意见/);
  assert.match(ready.host.textContent, /不做诊断/);
  assert.equal(ready.host.querySelector('[data-bay-action="book"]').disabled, false);
  await ready.unmount();
});

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  for (let i = 0; i < 6; i += 1) await act(async () => {});
  return {
    host,
    click: async (selector) => {
      const node = host.querySelector(selector);
      assert.ok(node, `找不到 ${selector}`);
      await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      for (let i = 0; i < 6; i += 1) await act(async () => {});
    },
    unmount: () => act(() => root.unmount()),
  };
}

test("答疑窗格：接口返回受限领域的答疑时显示不可用", async () => {
  reset();
  globalThis.__bayHttpRespond = (method, path) => {
    if (path === "/v1/talent/consults/c1") return { consult: consult({ regulated_domain: "legal" }) };
    if (path === "/v1/talent/domains") return { domains: [TAX, { key: "legal", gated: true }] };
    return {};
  };
  const view = await mount(React.createElement(ConsultPane, { target: { kind: "consult", id: "c1" }, layout: "docked", siteKey: "oceanleo" }));
  assert.match(view.host.textContent, /这个领域的答疑暂未开放/);
  assert.equal(view.host.querySelector('[data-bay-action="book"]'), null);
  const detail = globalThis.__bayHttpCalls.find((c) => c.path === "/v1/talent/consults/c1");
  assert.deepEqual(detail.opts, { anonymous: true });
  await view.unmount();
});

test("答疑窗格：预约先过买家条款，成功后去订单；拒绝条款或未登录不预约", async () => {
  reset();
  globalThis.__bayHttpRespond = (method, path) => {
    if (path === "/v1/talent/consults/c1") return { consult: consult() };
    if (path === "/v1/talent/domains") return { domains: [TAX] };
    if (method === "POST" && path === "/v1/talent/consults/c1/book") return { contract: { id: "k-5" }, thread_id: "th-5" };
    return {};
  };
  const view = await mount(React.createElement(ConsultPane, { target: { kind: "consult", id: "c1" }, layout: "docked", siteKey: "oceanleo" }));
  globalThis.__bayTermsAccept = false;
  await view.click('[data-bay-action="book"]');
  assert.deepEqual(globalThis.__bayTerms, ["buyer"]);
  assert.equal(globalThis.__bayHttpCalls.filter((c) => c.method === "POST").length, 0);
  globalThis.__baySignedIn = false;
  globalThis.__bayTermsAccept = true;
  await view.click('[data-bay-action="book"]');
  assert.deepEqual(globalThis.__bayTerms, ["buyer"], "未登录不问条款");
  globalThis.__baySignedIn = true;
  await view.click('[data-bay-action="book"]');
  const posts = globalThis.__bayHttpCalls.filter((c) => c.method === "POST");
  assert.deepEqual(posts.map((c) => [c.path, c.body]), [["/v1/talent/consults/c1/book", {}]]);
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "order", id: "k-5" });
  assert.equal(globalThis.__bayPayments.filter((entry) => entry.startsWith("start:")).length, 0, "预约不发起付款");
  assert.match(view.host.textContent, /付款暂未开放/);
  await view.unmount();
});
