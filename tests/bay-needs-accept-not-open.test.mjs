// R5-QUOTE：平台没开放付款时，买家点「接受并生成合同」屏幕上是「付款暂未开放」。
// 挂载写法照 bay-needs-demand-pane.test.mjs；语言表照 bay-needs-copy.test.mjs / bay-settings-section。
// POST /accept 打桩成 FastAPI 真实 403 体 `{ detail: "付款暂未开放" }`，再经 authed 同款解析与 BayApiError。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { LOCALES } from "../src/i18n/config.ts";
import { BAY_MESSAGES } from "../src/i18n/ui/messages/bay-copy.ts";
import { BAY_DEAL_MESSAGES } from "../src/i18n/ui/messages/bay-deal-copy.ts";
import { BAY_MONEY_MESSAGES } from "../src/i18n/ui/messages/bay-money-copy.ts";
import { BAY_SUPPLY_MESSAGES } from "../src/i18n/ui/messages/bay-supply-copy.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const PAY_NOT_OPEN_ZH = "付款暂未开放";
const BIND_CARD_ZH = "付款前请先在账单页绑定一张银行卡";
const DRAFT_TOAST_ZH = "已生成合同草稿，还没有付款";
const FASTAPI_403_BODY = { detail: PAY_NOT_OPEN_ZH };
const HAN = /[\u4e00-\u9fff]/;
const MOUNT_LOCALES = ["zh", "en", "ja", "de", "ar"];
const MONEY_PATHS = /checkout|payment|payout|setup-intent|billing/i;

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
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

/** FastAPI `{detail: string}` → `authed` 实际交给 `bayPost` 的结果。 */
function authedFromFastApiBody(status, payload) {
  const rawDetail = payload && typeof payload === "object" ? payload.detail : undefined;
  const error = typeof rawDetail === "string" && rawDetail ? rawDetail : `HTTP ${status}`;
  return { ok: false, error, status };
}

const httpStub = dataModule(`
  export class BayApiError extends Error {
    constructor(message, status = 0, code = null) {
      super(message);
      this.name = "BayApiError";
      this.status = status;
      this.code = code;
    }
  }
  function authedFromFastApiBody(status, payload) {
    const rawDetail = payload && typeof payload === "object" ? payload.detail : undefined;
    const error = typeof rawDetail === "string" && rawDetail ? rawDetail : ("HTTP " + status);
    return { ok: false, error, status };
  }
  function errorFrom(status, detail, fallback) {
    if (typeof detail === "string" && detail) return new BayApiError(detail, status);
    const d = detail && typeof detail === "object" ? detail : null;
    const message = d && typeof d.message === "string" && d.message ? d.message : (fallback || "请求失败，请稍后再试。");
    return new BayApiError(message, status, d && typeof d.code === "string" ? d.code : null);
  }
  async function reply(method, path, body, opts) {
    globalThis.__bayHttpCalls = globalThis.__bayHttpCalls || [];
    globalThis.__bayHttpCalls.push({ method, path, body, opts });
    const hit = (globalThis.__bayFetchTable || {})[method + " " + path];
    if (hit && typeof hit.__http === "number") {
      const result = authedFromFastApiBody(hit.__http, hit.body);
      throw errorFrom(result.status, result.detail, result.error);
    }
    if (typeof hit !== "undefined") return hit;
    const responder = globalThis.__bayHttpRespond;
    return responder ? responder(method, path, body, opts) : {};
  }
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const agentStub = dataModule(`
  globalThis.__authedCalls ??= [];
  export async function authed(path, init) {
    const method = String((init && init.method) || "GET").toUpperCase();
    globalThis.__authedCalls.push({ path, init, method });
    globalThis.__httpAuthedCalls = globalThis.__httpAuthedCalls || [];
    globalThis.__httpAuthedCalls.push({ method, path, init });
    const hit = globalThis.__httpAuthedHit;
    if (typeof hit === "function") return hit(path, init);
    if (hit) return hit;
    return globalThis.__authedReply ?? { ok: true, data: { demand: { id: "d1" } } };
  }
  export async function listTasks() { return { ok: true, data: { items: [] } }; }
`);
const uiStub = dataModule(`
  export function useUI() {
    return (zh, vars) => {
      const table = globalThis.__bayTtTable;
      let out = table && table[zh] ? table[zh] : zh;
      if (!vars) return out;
      return out.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    };
  }
`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  globalThis.__bayLoginAsked ??= 0;
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function useBayTaskContext(){ return globalThis.__bayTask ?? null; }
  export function bayHrefOnSite(site, target){ return "https://" + site + ".oceanleo.test/bay?bay=" + target.kind + ":" + (target.id ?? ""); }
`);
const dealStub = dataModule(`
  globalThis.__bayThreads ??= [];
  export async function openTradeThread(subject){ globalThis.__bayThreads.push(subject); }
`);
const settingsStub = dataModule(`
  globalThis.__bayTermsAsked ??= [];
  export async function ensureBayTerms(scope){ globalThis.__bayTermsAsked.push(scope); return globalThis.__bayTermsOk !== false; }
  export function openBaySettings(pane){ globalThis.__baySettingsOpened ??= []; globalThis.__baySettingsOpened.push(pane); }
`);
const domainStub = dataModule(`
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function currentFamilySubsiteOrigin(label){ return ["slide", "design", "3d"].includes(label) ? "https://" + label + ".oceanleo.test" : undefined; }
  export function portalHref(path){ return "https://oceanleo.test" + path; }
`);
const toastStub = dataModule(`
  globalThis.__toasts ??= [];
  const api = {
    success(title){ globalThis.__toasts.push({ kind: "success", title }); },
    error(title){ globalThis.__toasts.push({ kind: "error", title }); },
    info(title){ globalThis.__toasts.push({ kind: "info", title }); },
  };
  export function useToast(){ return api; }
`);
const uiBarrelStub = dataModule(`
  export function Modal({ children }){ return children; }
`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../shell/bay-state": stateStub,
  "../deal": dealStub,
  "../settings": settingsStub,
  "../../../contracts/domain-family": domainStub,
  "../../../ui/Toast": toastStub,
  "../../../ui": uiBarrelStub,
};

const paneModule = await import(await compileModule("src/shell/bay/needs/DemandPane.tsx", stubs));
const { DemandPane } = paneModule;

const httpMod = await import(
  await compileModule("src/lib/bay/http.ts", {
    "../agent": agentStub,
    "../auth/config": dataModule(`export const GATEWAY_BASE = "https://gateway.test";`),
  })
);

const CATEGORIES = {
  items: [],
  flat_items: [
    {
      slug: "doc",
      name_zh: "文档与表格",
      catalog_kind: "delivery",
      regulated_domain: "none",
      position: 50,
      published: true,
    },
  ],
  total: 1,
  site_defaults: { ppt: "doc", oceanleo: null },
};

function demand(extra = {}) {
  return {
    id: "d1",
    user_id: "buyer-1",
    title: "做一份路演稿",
    description: "十页以内",
    category: "doc",
    engagement_kind: "fixed",
    budget_min_fen: 50000,
    budget_max_fen: 100000,
    deadline_at: null,
    status: "open",
    proposal_count: 1,
    created_at: "2026-10-01T00:00:00Z",
    currency: "CNY",
    skills: ["PPT"],
    reference_links: [],
    supplemental_notes: "",
    close_reason: null,
    buyer: {
      user_id: "buyer-1",
      handle: "buyer",
      display_name: "买家小李",
      avatar_url: null,
      rating_avg: 4.5,
      rating_count: 2,
      completed_contracts: 3,
      level: "pro",
    },
    posted_site: "ppt",
    handling_site: "ppt",
    attached_work: null,
    is_owner: true,
    my_proposal: null,
    ...extra,
  };
}

function proposal(extra = {}) {
  return {
    id: "p1",
    demand_id: "d1",
    user_id: "seller-1",
    message: "我做过三十多份路演稿",
    price_fen: 80000,
    delivery_days: 5,
    status: "pending",
    created_at: "2026-10-01T00:00:00Z",
    currency: "CNY",
    seller: {
      user_id: "seller-1",
      handle: "ace",
      display_name: "高手",
      avatar_url: null,
      rating_avg: 4.9,
      rating_count: 8,
      completed_contracts: 12,
      level: "top",
    },
    ...extra,
  };
}

function reset(locale = "zh") {
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = null;
  globalThis.__bayFetchTable = {};
  globalThis.__httpAuthedCalls = [];
  globalThis.__httpAuthedHit = null;
  globalThis.__bayOpened = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayThreads = [];
  globalThis.__bayTermsAsked = [];
  globalThis.__bayTermsOk = true;
  globalThis.__toasts = [];
  globalThis.__bayTask = null;
  globalThis.__bayTtTable = BAY_MESSAGES[locale];
  document.documentElement.lang = locale;
}

function seedOwnerDemand() {
  const detail = demand({ is_owner: true });
  globalThis.__bayFetchTable = {
    "GET /v1/talent/categories": CATEGORIES,
    [`GET /v1/talent/demands/${detail.id}`]: { demand: detail },
    [`GET /v1/talent/demands/${detail.id}/proposals`]: { items: [proposal()] },
    "POST /v1/talent/proposals/p1/accept": { __http: 403, body: FASTAPI_403_BODY },
  };
}

function actionSet(host) {
  return [...host.querySelectorAll("[data-bay-action]")]
    .map((node) => node.getAttribute("data-bay-action"))
    .sort();
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function settle() {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
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

const paneProps = (siteKey = "design") => ({
  target: { kind: "demand", id: "d1" },
  layout: "docked",
  siteKey,
});

test("http.ts：FastAPI 403 字符串 detail 变成 BayApiError 原文", async () => {
  reset();
  const parsed = authedFromFastApiBody(403, FASTAPI_403_BODY);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, 403);
  assert.equal(parsed.error, PAY_NOT_OPEN_ZH);
  assert.equal("detail" in parsed, false);
  globalThis.__httpAuthedHit = parsed;
  await assert.rejects(
    () => httpMod.bayPost("/v1/talent/proposals/p1/accept"),
    (error) => {
      assert.equal(error.name, "BayApiError");
      assert.equal(error.status, 403);
      assert.equal(error.message, PAY_NOT_OPEN_ZH);
      assert.doesNotMatch(error.message, /绑定|银行卡|绑卡/);
      return true;
    },
  );
});

test("词表：付款暂未开放 17 语都有译文；非中文不是原句、不含汉字（ja 可含汉字）", () => {
  assert.equal(LOCALES.length, 17);
  for (const locale of LOCALES) {
    const money = BAY_MONEY_MESSAGES[locale][PAY_NOT_OPEN_ZH];
    const merged = BAY_MESSAGES[locale][PAY_NOT_OPEN_ZH];
    assert.ok(typeof money === "string" && money.trim(), `bay-money 缺 ${locale}`);
    assert.equal(merged, money, `聚合表与 money 分表不一致：${locale}`);
    if (locale === "zh") {
      assert.equal(money, PAY_NOT_OPEN_ZH);
      continue;
    }
    assert.notEqual(money, PAY_NOT_OPEN_ZH, `${locale} 等于中文原句`);
    if (locale === "zh-TW" || locale === "ja") {
      assert.match(money, HAN);
      continue;
    }
    assert.equal(HAN.test(money), false, `${locale} 含汉字：${money}`);
  }
  const supplyZh = "付款暂未开放：订单会先建好，开放后在「我的订单」里付款。";
  for (const locale of LOCALES) {
    const value = BAY_SUPPLY_MESSAGES[locale][supplyZh];
    assert.ok(typeof value === "string" && value.trim(), `bay-supply 缺 ${locale}`);
    if (locale !== "zh") assert.notEqual(value, supplyZh);
  }
  assert.equal(
    Object.prototype.hasOwnProperty.call(BAY_DEAL_MESSAGES.zh, PAY_NOT_OPEN_ZH),
    false,
    "deal 分表故意不重复这条，走 money 分表",
  );
});

test("正对照：MOUNT_LOCALES 长度固定，表驱动注册不会静默变空", () => {
  assert.equal(MOUNT_LOCALES.length, 5);
  assert.deepEqual([...MOUNT_LOCALES], ["zh", "en", "ja", "de", "ar"]);
});

for (const locale of MOUNT_LOCALES) {
  test(`发布者点接受：${locale} 屏幕上是「付款暂未开放」译文，没有合同草稿、没有付款请求`, async () => {
    reset(locale);
    seedOwnerDemand();
    const view = await mount(React.createElement(DemandPane, paneProps("design")));
    const beforeActions = actionSet(view.host);
    const beforeCalls = globalThis.__bayHttpCalls.slice();
    assert.ok(view.host.querySelector('[data-bay-proposal="pending"] [data-bay-action="accept"]'));
    assert.equal(beforeActions.includes("accept"), true);
    assert.equal(
      beforeActions.some((name) => /pay|bind|checkout|payout|billing/i.test(name)),
      false,
    );

    await view.click('[data-bay-proposal="pending"] [data-bay-action="accept"]');

    const expected = BAY_MESSAGES[locale][PAY_NOT_OPEN_ZH];
    assert.match(view.host.textContent, new RegExp(escapeRe(expected)));
    assert.equal(view.host.textContent.includes(BIND_CARD_ZH), false);
    if (locale !== "zh") {
      assert.equal(view.host.textContent.includes(PAY_NOT_OPEN_ZH), false, `${locale} 仍露出中文原句`);
    }
    const toastText = globalThis.__toasts.map((item) => String(item.title || "")).join("\n");
    assert.equal(toastText.includes(DRAFT_TOAST_ZH), false);
    assert.equal(
      globalThis.__toasts.some((item) => item.kind === "success"),
      false,
      "失败路径不得出现成功提示",
    );
    const newCalls = globalThis.__bayHttpCalls.slice(beforeCalls.length);
    assert.deepEqual(
      newCalls.map((call) => `${call.method} ${call.path}`),
      ["POST /v1/talent/proposals/p1/accept"],
    );
    assert.equal(newCalls.some((call) => MONEY_PATHS.test(call.path)), false);
    assert.deepEqual(actionSet(view.host), beforeActions);
    await view.unmount();
  });
}
