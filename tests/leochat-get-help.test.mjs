// W03：找人帮忙表单默认三样、「我的」四分区、两种入口同一张表。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.React = React;

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", { url: "https://slide.oceanleo.com/bay" });
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
  async function reply(method, path, body, opts) {
    globalThis.__bayHttpCalls.push({ method, path, body, opts });
    const responder = globalThis.__bayHttpRespond;
    return responder ? responder(method, path, body, opts) : {};
  }
  export class BayApiError extends Error {
    constructor(message, status = 0, code = null) { super(message); this.status = status; this.code = code; }
  }
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const agentStub = dataModule(`
  export async function authed(){ return { ok: true, data: {} }; }
  export async function listTasks(){ return { ok: true, data: { items: [] } }; }
`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  globalThis.__bayLoginAsked ??= 0;
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function replaceBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function useBayTaskContext(){ return globalThis.__bayTask ?? null; }
  export function bayHrefOnSite(site, target){ return "https://" + site + ".oceanleo.test/bay?bay=" + target.kind; }
`);
const settingsStub = dataModule(`
  globalThis.__bayTermsAsked ??= [];
  export async function ensureBayTerms(scope){ globalThis.__bayTermsAsked.push(scope); return globalThis.__bayTermsOk !== false; }
`);
const toastStub = dataModule(`
  globalThis.__toasts ??= [];
  const api = { success(title){ globalThis.__toasts.push({ kind: "success", title }); }, error(){}, info(){} };
  export function useToast(){ return api; }
`);
const uiBarrelStub = dataModule(`
  const R = globalThis.React;
  export function Modal({ children }){ return children; }
  export function Select({ options, value, onChange }){
    const current = (options || []).find((row) => row.id === value);
    return R.createElement(
      "div",
      null,
      R.createElement("button", { type: "button", "data-select-value": value || "" }, current && current.label ? current.label : "请选择"),
      (options || []).map((row) =>
        R.createElement(
          "button",
          {
            key: row.id,
            type: "button",
            "data-select-option": row.id,
            "data-bay-category": row.id,
            "aria-checked": row.id === value ? "true" : "false",
            onClick: () => onChange(row.id),
          },
          row.label,
        ),
      ),
    );
  }
`);
const pickerStub = dataModule(`
  export function LibraryWorkPickerHost(){ return null; }
  export async function pickLibraryWork(){ return null; }
`);
const domainStub = dataModule(`
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function currentFamilySubsiteOrigin(){ return undefined; }
  export function portalHref(path){ return "https://oceanleo.test" + path; }
`);
const moneyStub = dataModule(`
  export function useLedgerCurrency(){ return "CNY"; }
  export function formatMoney(n){ return "¥" + n; }
  export function ledgerCurrency(){ return "CNY"; }
`);

const formStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../shell/bay-state": stateStub,
  "../settings": settingsStub,
  "../../../ui/Toast": toastStub,
  "../../../ui": uiBarrelStub,
  "./LibraryWorkPicker": pickerStub,
  "../../../contracts/domain-family": domainStub,
  "../../../lib/money": moneyStub,
};

const { GetHelpForm } = await import(await compileModule("src/shell/bay/needs/GetHelpForm.tsx", formStubs));
const { PostNeedPane } = await import(await compileModule("src/shell/bay/needs/PostNeedPane.tsx", formStubs));
const { CallHumanPane } = await import(await compileModule("src/shell/bay/needs/CallHumanPane.tsx", formStubs));
const { bayDetailTitleKey } = await import(
  await compileModule("src/shell/bay/shell/BayDetail.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../deal": dataModule("export function DealConversationView(){ return null; }"),
    "../needs": dataModule(`
      export function DemandPane(){ return null; }
      export function HelpRequestPane(){ return null; }
      export function PostNeedPane(){ return null; }
      export function ProposePane(){ return null; }
      export function CallHumanPane(){ return null; }
    `),
    "../orders": dataModule("export function OrderPane(){ return null; }"),
    "../seller": dataModule("export function ServiceEditorPane(){ return null; }"),
    "../settings": dataModule("export function BaySettingsPane(){ return null; }"),
    "../supply": dataModule(`
      export function CheckoutPane(){ return null; }
      export function ConsultPane(){ return null; }
      export function ProfilePane(){ return null; }
      export function ServicePane(){ return null; }
    `),
    "./bay-icons": dataModule("export function BayGlyph(){ return null; }"),
    "./bay-motion": dataModule("export function useBaySlideIn(){ return { current: null }; }"),
    "./bay-state": dataModule(`
      export function bayBack(){}
      export function useBaySiteKey(){ return "ppt"; }
      export function useBayState(){ return { current: { kind: "feed" }, canGoBack: false }; }
    `),
    "./BayMine": dataModule("export function BayMine(){ return null; }"),
  })
);
const { BayMineTabs } = await import(
  await compileModule("src/shell/bay/shell/BayMine.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../mine": dataModule(`
      export function MyPublishedPane(){ return null; }
      export function MySoldPane(){ return null; }
      export function MyBoughtPane(){ return null; }
      export function MyFavoritesPane(){ return null; }
      export function MyCardPane(){ return null; }
    `),
    "./bay-links": dataModule(`export const BAY_MINE_UI_TABS = ["published", "sold", "bought", "favorites", "card"];`),
    "./bay-state": stateStub,
  })
);

const CATEGORIES = {
  items: [],
  flat_items: [
    { slug: "doc", name_zh: "文档与表格", catalog_kind: "delivery", regulated_domain: "none", position: 50, published: true },
    { slug: "design", name_zh: "设计与视觉", catalog_kind: "delivery", regulated_domain: "none", position: 10, published: true },
    { slug: "legal", name_zh: "法律咨询", catalog_kind: "consult", regulated_domain: "legal", position: 1100, published: true },
  ],
  total: 3,
  site_defaults: { ppt: "doc", design: "design", oceanleo: null },
};

function reset() {
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = (method, path, body) => {
    if (method === "GET" && path === "/v1/talent/categories") return CATEGORIES;
    if (method === "POST" && path === "/v1/talent/demands") return { demand: { id: "d-new", ...body } };
    if (method === "POST" && path === "/v1/talent/handoffs") return { handoff: { id: "h-new", ...body } };
    return {};
  };
  globalThis.__bayOpened = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayTermsAsked = [];
  globalThis.__bayTermsOk = true;
  globalThis.__toasts = [];
  globalThis.__bayTask = null;
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

test("默认只看得到文字、类目、预算、更多选项和发布", async () => {
  reset();
  const view = await mount(React.createElement(GetHelpForm, { siteKey: "ppt", defaultMode: "public" }));
  assert.ok(view.host.querySelector("[data-bay-help-text]"));
  assert.ok(view.host.querySelector("[data-bay-help-category]"));
  assert.ok(view.host.querySelector("[data-bay-help-budget]"));
  assert.ok(view.host.querySelector("[data-bay-help-more]"));
  assert.ok(view.host.querySelector("[data-bay-submit]"));
  assert.equal(view.host.querySelector("[data-bay-help-mode]"), null);
  assert.equal(view.host.querySelector("[data-bay-help-deadline]"), null);
  assert.equal(view.host.querySelector("[data-bay-attach-work]"), null);
  await view.unmount();
});

test("展开后三种找谁都在；public 走 demands，open 走 handoffs，invited 不填用户名不发", async () => {
  reset();
  const publicView = await mount(React.createElement(GetHelpForm, { siteKey: "ppt", defaultMode: "public" }));
  await publicView.click("[data-bay-help-more]");
  assert.ok(publicView.host.querySelector('[data-bay-help-mode="public"]'));
  assert.ok(publicView.host.querySelector('[data-bay-help-mode="open"]'));
  assert.ok(publicView.host.querySelector('[data-bay-help-mode="invited"]'));
  const longLine = "要做一份演示稿".repeat(10);
  assert.ok(longLine.length > 60);
  await publicView.type("[data-bay-help-text]", `${longLine}\n需要十五页含财务预测和英文版说明。`);
  await publicView.type("[data-bay-help-budget]", "10");
  await publicView.click('[data-bay-help-mode="public"]');
  await publicView.click("[data-bay-submit]");
  const demand = globalThis.__bayHttpCalls.find((call) => call.method === "POST" && call.path === "/v1/talent/demands");
  assert.ok(demand);
  assert.equal(demand.body.title, `${longLine.slice(0, 60)}…`);
  assert.equal(demand.body.budget_min_fen, 1000);
  assert.equal(demand.body.budget_max_fen, 1000);
  await publicView.unmount();

  reset();
  const openView = await mount(React.createElement(GetHelpForm, { siteKey: "ppt", defaultMode: "public" }));
  await openView.type("[data-bay-help-text]", "海报改一下层次和字号再压一压");
  await openView.click("[data-bay-help-more]");
  await openView.click('[data-bay-help-mode="open"]');
  await openView.click("[data-bay-submit]");
  const handoff = globalThis.__bayHttpCalls.find((call) => call.method === "POST" && call.path === "/v1/talent/handoffs");
  assert.ok(handoff);
  assert.equal(handoff.body.mode, "open");
  await openView.unmount();

  reset();
  const invited = await mount(React.createElement(GetHelpForm, { siteKey: "ppt", defaultMode: "public" }));
  await invited.type("[data-bay-help-text]", "海报改一下层次和字号再压一压");
  await invited.click("[data-bay-help-more]");
  await invited.click('[data-bay-help-mode="invited"]');
  await invited.click("[data-bay-submit]");
  assert.match(invited.host.textContent, /请填写要请的那个人的用户名/);
  assert.equal(globalThis.__bayHttpCalls.filter((call) => call.method === "POST").length, 0);
  await invited.unmount();
});

test("PostNeedPane 与 CallHumanPane 都有找人帮忙表单；从「发布 → 需求」进来标题是发需求，叫真人仍是找人帮忙", async () => {
  reset();
  const post = await mount(React.createElement(PostNeedPane, { target: { kind: "post-need" }, layout: "docked", siteKey: "ppt" }));
  assert.ok(post.host.querySelector("[data-bay-get-help]"));
  await post.unmount();
  const call = await mount(React.createElement(CallHumanPane, { target: { kind: "call-human" }, layout: "docked", siteKey: "ppt" }));
  assert.ok(call.host.querySelector("[data-bay-get-help]"));
  await call.unmount();
  assert.equal(bayDetailTitleKey({ kind: "post-need" }), "发需求");
  assert.equal(bayDetailTitleKey({ kind: "publish" }), "发布");
  assert.equal(bayDetailTitleKey({ kind: "call-human" }), "找人帮忙");
});

test("BayMineTabs 恰好五块：我发布的 / 我卖出的 / 我买到的 / 我的收藏 / 个人卡片；认不出的值高亮我发布的", () => {
  const html = renderToStaticMarkup(React.createElement(BayMineTabs, { tab: "help" }));
  assert.deepEqual(
    [...html.matchAll(/data-mine-tab="([a-z]+)"/g)].map((match) => match[1]),
    ["published", "sold", "bought", "favorites", "card"],
  );
  for (const label of ["我发布的", "我卖出的", "我买到的", "我的收藏", "个人卡片"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /我的求助|我发出的|我的报价|我的服务|我的订单/);
  assert.match(html, /aria-selected="true"[^>]*data-mine-tab="published"|data-mine-tab="published"[^>]*aria-selected="true"/);
  const sold = renderToStaticMarkup(React.createElement(BayMineTabs, { tab: "sold" }));
  assert.match(sold, /aria-selected="true"[^>]*data-mine-tab="sold"|data-mine-tab="sold"[^>]*aria-selected="true"/);
});
