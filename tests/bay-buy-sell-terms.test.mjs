// 买卖价格条款 / 交付条款：同一套 data-bay-reveal-item。
// 买页挂 PostNeedPane，卖页挂 ServiceEditorPane。金额行 id 是 price，标签是「价格」不是「预算」。
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

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", { url: "https://slide.oceanleo.com/bay" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
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
  export class BayApiError extends Error {
    constructor(message, status = 0, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function reply(method, path, body, opts) {
    (globalThis.__bayCalls ||= []).push({ method, path, body, anonymous: Boolean(opts && opts.anonymous) });
    const responder = globalThis.__bayRespond;
    return responder ? responder(method, path, body, opts) : {};
  }
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const agentStub = dataModule(`
  export async function authed(path, init) {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    (globalThis.__bayCalls ||= []).push({ method, path, body });
    const responder = globalThis.__bayRespond;
    try {
      return { ok: true, data: responder ? await responder(method, path, body) : {} };
    } catch (error) {
      return { ok: false, status: error.status || 400, error: error.message };
    }
  }
`);
const toastStub = dataModule(`
  export function useToast() {
    const push = (kind) => (title) => { (globalThis.__bayToasts ||= []).push({ kind, title }); return {}; };
    return { success: push("success"), error: push("error"), info: push("info") };
  }
`);
const settingsStub = dataModule(`
  export async function ensureBayTerms(scope) { (globalThis.__bayTerms ||= []).push(scope); return true; }
  export function openBaySettings(pane) { (globalThis.__baySettingsOpened ||= []).push(pane ?? null); }
`);
const stateStub = dataModule(`
  export function openBay(target) { (globalThis.__bayOpened ||= []).push(target); }
  export function replaceBay(target) { (globalThis.__bayReplaced ||= []).push(target); }
  export function requireBayLogin() { return true; }
  export function useBaySignedIn() { return true; }
  export function useBaySiteKey() { return globalThis.__baySiteKey || "ppt"; }
  export function useBayTaskContext(){ return null; }
  export function bayHrefOnSite(site, target){ return "https://" + site + ".oceanleo.test/bay?bay=" + target.kind + ":" + (target.id ?? ""); }
`);
const reactHref = pathToFileURL(require.resolve("react")).href;
const confirmStub = dataModule(`
  import { createElement as h } from ${JSON.stringify(reactHref)};
  export function ConfirmDialog({ title, onConfirm, onCancel, danger }) {
    return h("div", { role: "dialog", "data-bay-confirm": "", "data-danger": danger ? "1" : "0" },
      h("p", { "data-bay-confirm-title": "" }, title),
      h("button", { type: "button", "data-bay-confirm-cancel": "", onClick: onCancel }, "取消"),
      h("button", { type: "button", "data-bay-confirm-ok": "", onClick: onConfirm }, "确认"));
  }
  export function Modal({ children }){ return children; }
  export function Select({ options, value, onChange }){
    const current = (options || []).find((row) => row.id === value);
    return h("div", null,
      h("button", { type: "button", "data-select-value": value || "" }, current && current.label ? current.label : "请选择"),
      (options || []).map((row) => h("button", { key: row.id, type: "button", "data-select-option": row.id, onClick: () => onChange(row.id) }, row.label)));
  }
`);
const pickerStub = dataModule(`
  export function LibraryWorkPickerHost(){ return null; }
  export async function pickLibraryWork(){ return null; }
`);
const previewStub = dataModule(`export function BayTypedPreview(){ return null; }`);
const databaseStub = dataModule(`
  export async function uploadFile() {
    return { ok: true, data: { file: { url: "https://cdn.example.com/cover.png" } } };
  }
  export async function getStorageUsage() {
    return { ok: true, data: { remaining_bytes: 20 * 1024 * 1024 * 1024, unavailable: false } };
  }
`);
const peopleStub = dataModule(`
  export async function listContacts(){ return []; }
  export async function searchDirectory(){ return []; }
`);
const domainStub = dataModule(`
  export const CONFIGURED_DOMAIN_FAMILY = "com";
  export function currentDomainFamily(){ return "com"; }
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function domainProfileForHost(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function familyForHost(){ return "com"; }
  export function currentFamilySubsiteOrigin(label){ return "https://" + label + ".oceanleo.test"; }
  export function portalHref(path){ return "https://oceanleo.test" + path; }
`);
const inboxStub = dataModule(`export async function fetchConversations(){ return { items: [], next_cursor: null }; }`);
const groupsStub = dataModule(`export async function getConversationDetail(){ return { id: "", title: "", members: [] }; }`);

const sharedStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../../../lib/database": databaseStub,
  "../../../lib/im/people-api": peopleStub,
  "../../../lib/im/inbox-api": inboxStub,
  "../../../lib/im/groups-api": groupsStub,
  "../../../ui": confirmStub,
  "../../../ui/Toast": toastStub,
  "../../../contracts/domain-family": domainStub,
  "../settings": settingsStub,
  "../shell/bay-state": stateStub,
  "../needs/LibraryWorkPicker": pickerStub,
  "./LibraryWorkPicker": pickerStub,
  "../form/BayTypedPreview": previewStub,
  "./BayTypedPreview": previewStub,
  "../../artifact-client": dataModule(`export async function getCurrentArtifactItem(){ return { ok: false }; }`),
  "../../library-viewers": dataModule(`export function LibraryItemViewer(){ return null; }`),
};

const { PostNeedPane } = await import(await compileModule("src/shell/bay/needs/PostNeedPane.tsx", sharedStubs));
const { ServiceEditorPane } = await import(await compileModule("src/shell/bay/seller/ServiceEditorPane.tsx", sharedStubs));

const CATEGORIES = [
  { slug: "doc", name_zh: "文档与表格", catalog_kind: "delivery", regulated_domain: "none", position: 50, published: true },
  { slug: "design", name_zh: "设计与视觉", catalog_kind: "delivery", regulated_domain: "none", position: 10, published: true },
];
const PROFILE = { user_id: "seller-1", handle: "leo", display_name: "Leo", avatar_url: null, headline: "", bio: "", categories: [], skills: [], languages: [], published: true, currency: "USD" };

const EXPECTED = {
  digital: {
    price: ["price"],
    terms: ["deadline", "custom-terms"],
  },
  service: {
    price: ["billing", "price"],
    terms: ["delivery-days", "revisions", "deadline", "custom-terms"],
  },
  session: {
    price: ["billing", "price"],
    terms: ["consult-rounds", "delivery-days", "revisions", "deadline", "custom-terms"],
  },
  hour: {
    price: ["billing", "price"],
    terms: ["consult-minutes", "delivery-days", "revisions", "deadline", "custom-terms"],
  },
  app: {
    price: ["app-price-model", "price"],
    terms: ["deadline", "custom-terms"],
  },
  lesson: {
    price: ["price"],
    terms: ["deadline", "custom-terms"],
  },
};

function reset() {
  globalThis.__bayCalls = [];
  globalThis.__bayToasts = [];
  globalThis.__bayTerms = [];
  globalThis.__bayOpened = [];
  globalThis.__bayReplaced = [];
  globalThis.__baySettingsOpened = [];
  globalThis.__baySiteKey = "ppt";
  globalThis.__bayCategories = CATEGORIES;
  globalThis.__baySiteDefaults = { ppt: "doc" };
  globalThis.__bayRespond = (method, path) => {
    if (method === "GET" && path === "/v1/talent/categories") {
      return { items: CATEGORIES, flat_items: CATEGORIES, total: CATEGORIES.length, site_defaults: { ppt: "doc" } };
    }
    if (method === "GET" && path === "/v1/talent/me") return { profile: PROFILE };
    if (method === "GET" && path === "/v1/talent/pricing-models") return { items: [] };
    if (method === "GET" && path === "/v1/moderation/my-cases") return { cases: [] };
    if (method === "GET" && path === "/v1/talent/domains") return { domains: [] };
    if (method === "GET" && path === "/v1/talent/me/services") return { items: [] };
    return {};
  };
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await act(async () => {});
};

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await settle();
  const find = (selector) => {
    const node = host.querySelector(selector);
    assert.ok(node, `找不到 ${selector}`);
    return node;
  };
  const click = async (selector) => {
    const node = find(selector);
    await act(async () => node.click());
    await settle();
  };
  return { host, find, click, unmount: () => act(() => root.unmount()) };
}

async function expandTerms(view) {
  const terms = view.host.querySelector('[data-bay-section="terms"]');
  if (terms && terms.hasAttribute("data-bay-section-collapsed")) {
    await view.click('[data-bay-section="terms"] [data-bay-section-toggle]');
  }
}

async function pickHowYouDeliver(view, kind) {
  await view.click(`[data-bay-how-you-deliver] [data-bay-choice-option="${kind}"]`);
}

function revealIds(host, section) {
  return [...host.querySelectorAll(`[data-bay-section="${section}"] [data-bay-reveal-item]`)].map((node) => node.getAttribute("data-bay-reveal-item"));
}

function sectionDump(host) {
  const priceRow =
    host.querySelector('[data-bay-section="price"] [data-bay-reveal-item="price"]') ||
    host.querySelector('[data-bay-section="price"] [data-bay-reveal-item="budget"]');
  const label = priceRow?.querySelector("[data-bay-reveal-label]")?.textContent ?? "";
  return `price=[${revealIds(host, "price").join(",")}] terms=[${revealIds(host, "terms").join(",")}] priceRowLabel=${JSON.stringify(label)} priceSection=${JSON.stringify((host.querySelector('[data-bay-section="price"]')?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240))}`;
}

function pairDump(kind, buy, sell, expected) {
  return [
    `${kind}`,
    `expected.price=[${expected.price.join(",")}] expected.terms=[${expected.terms.join(",")}]`,
    `buy ${sectionDump(buy.host)}`,
    `sell ${sectionDump(sell.host)}`,
  ].join(" | ");
}

async function mountPair() {
  reset();
  const buy = await mount(React.createElement(PostNeedPane, { target: { kind: "post-need" }, layout: "docked", siteKey: "ppt" }));
  const sell = await mount(React.createElement(ServiceEditorPane, { target: { kind: "service-editor" }, layout: "docked", siteKey: "ppt" }));
  return { buy, sell };
}

async function assertKind(kind, buy, sell, expected, extra) {
  assert.deepEqual(revealIds(sell.host, "price"), expected.price, pairDump(kind, buy, sell, expected));
  assert.deepEqual(revealIds(sell.host, "terms"), expected.terms, pairDump(kind, buy, sell, expected));
  assert.deepEqual(revealIds(buy.host, "price"), expected.price, pairDump(kind, buy, sell, expected));
  assert.deepEqual(revealIds(buy.host, "terms"), expected.terms, pairDump(kind, buy, sell, expected));
  assert.deepEqual(revealIds(buy.host, "price"), revealIds(sell.host, "price"), pairDump(kind, buy, sell, expected));
  assert.deepEqual(revealIds(buy.host, "terms"), revealIds(sell.host, "terms"), pairDump(kind, buy, sell, expected));
  extra?.();
}

test("买卖都有产品/价格/向谁展示/交付内容/交付条款；价格组标题是价格；交付条款默认收起；四种交付在交付条款正上方", async () => {
  const { buy, sell } = await mountPair();
  for (const view of [buy, sell]) {
    assert.ok(view.host.querySelector('[data-bay-section="product"]'));
    assert.ok(view.host.querySelector('[data-bay-section="price"]'));
    assert.ok(view.host.querySelector('[data-bay-section="audience"]'));
    assert.ok(view.host.querySelector('[data-bay-section="offer"]'));
    assert.ok(view.host.querySelector('[data-bay-section="terms"]'));
    assert.equal(view.find('[data-bay-section="price"] [data-bay-section-title]').textContent.trim(), "价格");
    assert.match(view.find('[data-bay-section="audience"] [data-bay-section-title]').textContent, /向谁展示/);
    assert.equal(view.find('[data-bay-section="terms"]').getAttribute("data-bay-section-collapsed"), "");
    assert.deepEqual(
      [...view.host.querySelectorAll('[data-bay-section="product"] [data-bay-reveal-item]')].map((node) => node.getAttribute("data-bay-reveal-item")),
      ["cover", "title", "description", "files"],
    );
    assert.ok(view.host.querySelector('[data-bay-section="offer"] [data-bay-how-you-deliver]'));
    for (const kind of ["digital", "service", "app", "lesson"]) {
      assert.ok(view.host.querySelector(`[data-bay-how-you-deliver] [data-bay-choice-option="${kind}"]`), `缺交付内容 ${kind}`);
    }
    assert.match(view.find('[data-bay-how-you-deliver] [data-bay-choice-option="service"]').textContent, /人工服务/);
    assert.equal(view.host.querySelector("[data-bay-publish-delivery-field]"), null);
    assert.doesNotMatch(view.host.textContent, /所属分类/);
    assert.doesNotMatch(view.host.textContent, /尽快接手|公开征集|只有这个人能看到|只有选中的人能看到|付款后立即交付|交付说明/);
    assert.equal(view.host.querySelector('[data-bay-reveal-item="license"]'), null);
    assert.equal(view.host.querySelector("[data-bay-faq-toggle]"), null);
    assert.equal(view.host.querySelector('[data-bay-reveal-item="website"]'), null);
    assert.equal(view.host.querySelector('[data-bay-reveal-item="links"]'), null);
    assert.equal(view.host.querySelector('[data-bay-help-mode="open"]'), null);
    assert.ok(view.host.querySelector('[data-bay-help-mode="public"]'));
    assert.doesNotMatch(view.find('[data-bay-section="terms"]').textContent, /授权范围|FAQ|网站|我的链接/);
  }
  assert.match(buy.find('[data-bay-section="offer"] [data-bay-section-title]').textContent, /交付给你的是什么/);
  assert.match(sell.find('[data-bay-section="offer"] [data-bay-section-title]').textContent, /你交付什么/);
  await buy.unmount();
  await sell.unmount();
});

test("默认 digital：价格组只有 price，短输入后面是 USD，可空；买卖列表相同", async () => {
  const { buy, sell } = await mountPair();
  await expandTerms(buy);
  await expandTerms(sell);
  await assertKind("digital", buy, sell, EXPECTED.digital, () => {
    for (const view of [buy, sell]) {
      const row = view.host.querySelector('[data-bay-section="price"] [data-bay-reveal-item="price"]');
      assert.ok(row, `价格行应是 price。${sectionDump(view.host)}`);
      assert.doesNotMatch(row.textContent, /预算/);
      const input = view.host.querySelector('[data-bay-section="price"] [data-bay-field="price"]');
      assert.ok(input);
      assert.equal(input.value, "");
      assert.match(view.find("[data-bay-price-currency]").textContent, /USD/);
      assert.equal(view.host.querySelector('[data-bay-section="terms"] [data-bay-reveal-item="delivery-mode"]'), null);
      assert.equal(view.host.querySelector('[data-bay-section="terms"] [data-bay-reveal-item="who"]'), null);
      assert.equal(view.host.querySelector('[data-bay-section="terms"] [data-bay-how-you-deliver]'), null);
      assert.ok(view.host.querySelector('[data-bay-section="audience"] [data-bay-reveal-item="who"]'));
      assert.ok(view.host.querySelector('[data-bay-section="offer"] [data-bay-how-you-deliver]'));
    }
  });
  await buy.unmount();
  await sell.unmount();
});

test("点 service：价格条款 billing 然后 price；交付条款含交期和改稿；按次/按小时出现附加项；买卖列表相同", async () => {
  const { buy, sell } = await mountPair();
  await pickHowYouDeliver(buy, "service");
  await pickHowYouDeliver(sell, "service");
  await assertKind("service", buy, sell, EXPECTED.service);

  await buy.click('[data-bay-section="price"] [data-bay-billing="session"]');
  await sell.click('[data-bay-section="price"] [data-bay-billing="session"]');
  await assertKind("service+session", buy, sell, EXPECTED.session, () => {
    for (const view of [buy, sell]) {
      assert.ok(view.host.querySelector('[data-bay-section="terms"] [data-bay-field="consult-rounds"]'));
    }
  });

  await buy.click('[data-bay-section="price"] [data-bay-billing="hour"]');
  await sell.click('[data-bay-section="price"] [data-bay-billing="hour"]');
  await assertKind("service+hour", buy, sell, EXPECTED.hour, () => {
    for (const view of [buy, sell]) {
      assert.ok(view.host.querySelector('[data-bay-section="terms"] [data-bay-field="consult-minutes"]'));
    }
  });
  await buy.unmount();
  await sell.unmount();
});

test("点 app：价格组 app-price-model 然后 price，选项免费/一次买断/按月；没有交付说明；买卖列表相同", async () => {
  const { buy, sell } = await mountPair();
  await pickHowYouDeliver(buy, "app");
  await pickHowYouDeliver(sell, "app");
  await assertKind("app", buy, sell, EXPECTED.app, () => {
    for (const view of [buy, sell]) {
      const model = view.find('[data-bay-section="price"] [data-bay-reveal-item="app-price-model"]');
      assert.match(model.textContent, /免费/);
      assert.match(model.textContent, /一次买断/);
      assert.match(model.textContent, /按月/);
      assert.equal(view.host.querySelector('[data-bay-section="terms"] [data-bay-reveal-item="delivery-mode"]'), null);
    }
  });
  await buy.unmount();
  await sell.unmount();
});

test("点 lesson：价格条款只有 price；交付条款没有 delivery-days / delivery-mode；买卖列表相同", async () => {
  const { buy, sell } = await mountPair();
  await pickHowYouDeliver(buy, "lesson");
  await pickHowYouDeliver(sell, "lesson");
  await assertKind("lesson", buy, sell, EXPECTED.lesson, () => {
    for (const view of [buy, sell]) {
      assert.equal(view.host.querySelector('[data-bay-section="terms"] [data-bay-reveal-item="delivery-days"]'), null);
      assert.equal(view.host.querySelector('[data-bay-section="terms"] [data-bay-reveal-item="delivery-mode"]'), null);
      assert.equal(view.host.querySelector('[data-bay-section="price"] [data-bay-reveal-item="billing"]'), null);
      assert.equal(view.host.querySelector('[data-bay-section="price"] [data-bay-reveal-item="app-price-model"]'), null);
    }
  });
  await buy.unmount();
  await sell.unmount();
});
