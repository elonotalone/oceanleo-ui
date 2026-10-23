// W2：发布入口。类别选择器是素材 / 服务 / 需求；服务计费在价格区；类目可预选；需求走 replaceBay。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// 计费方式卡片：免费协作（free）不在卡片里，免费只由价格框 0 表达。
const PRICING_MODEL_CARDS = [
  { key: "fixed", name_zh: "一口价交付", unit: "project", requires: [], settlement_rule_zh: "交付清单齐全即完成", auto_accept_days_default: 7 },
  { key: "session", name_zh: "按次会诊", unit: "session", requires: [], settlement_rule_zh: "以会话时间戳为准", auto_accept_days_default: 2 },
  { key: "hourly", name_zh: "按时计费", unit: "hour", requires: [], settlement_rule_zh: "按已记录时长结算", auto_accept_days_default: 3 },
  { key: "milestone", name_zh: "分阶段", unit: "project", requires: [], settlement_rule_zh: "每个里程碑独立验收", auto_accept_days_default: 7 },
  { key: "free", name_zh: "免费协作", unit: "project", requires: [], settlement_rule_zh: "不涉及金额", auto_accept_days_default: 0 },
];

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", { url: "https://video.oceanleo.com/bay" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  File: dom.window.File,
  DataTransfer: dom.window.DataTransfer,
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
    constructor(message, status, code = null) { super(message); this.name = "BayApiError"; this.status = status; this.code = code; }
  }
  async function reply(method, path, body, opts) {
    (globalThis.__bayCalls ||= []).push({ method, path, body, anonymous: Boolean(opts && opts.anonymous) });
    const responder = globalThis.__bayRespond;
    return responder ? responder(method, path, body) : {};
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
const categoriesStub = dataModule(`
  export async function fetchBayCategories() {
    const rows = globalThis.__bayCategories || [];
    return { items: rows, flat_items: rows, total: rows.length, site_defaults: {} };
  }
`);
const toastStub = dataModule(`
  export function useToast() {
    const push = (kind) => (title) => { (globalThis.__bayToasts ||= []).push({ kind, title }); return {}; };
    return { success: push("success"), error: push("error"), info: push("info") };
  }
`);
const settingsStub = dataModule(`
  export async function ensureBayTerms(scope) { (globalThis.__bayTerms ||= []).push(scope); return globalThis.__bayTermsAccept !== false; }
  export function openBaySettings(pane) { (globalThis.__baySettingsOpened ||= []).push(pane ?? null); }
`);
const stateStub = dataModule(`
  export function openBay(target) { (globalThis.__bayOpened ||= []).push(target); }
  export function replaceBay(target) { (globalThis.__bayReplaced ||= []).push(target); }
  export function requireBayLogin() { return globalThis.__baySignedIn !== false; }
  export function useBaySignedIn() { return globalThis.__baySignedIn !== false; }
  export function useBaySiteKey() { return globalThis.__baySiteKey || "oceanleo"; }
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
`);
const needsStub = dataModule(`
  export async function pickLibraryWork(){ return globalThis.__bayPickedWork ?? { kind: "task", id: "task-42", title: "季度汇报" }; }
`);
const databaseStub = dataModule(`
  export async function uploadFile(file, opts) {
    (globalThis.__bayCoverUploads ||= []).push({ file, opts });
    return { ok: true, data: { file: { url: "https://cdn.example.com/a.png" } } };
  }
  export async function getStorageUsage() {
    return { ok: true, data: { remaining_bytes: 20 * 1024 * 1024 * 1024, unavailable: false } };
  }
`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../../../lib/bay/categories": categoriesStub,
  "../../../lib/database": databaseStub,
  "../../../ui": confirmStub,
  "../../../ui/Toast": toastStub,
  "../settings": settingsStub,
  "../shell/bay-state": stateStub,
  "../needs/LibraryWorkPicker": needsStub,
  "../form/BayTypedPreview": dataModule(`export function BayTypedPreview(){ return null; }`),
  "./BayTypedPreview": dataModule(`export function BayTypedPreview(){ return null; }`),
  "../../artifact-client": dataModule(`export async function getCurrentArtifactItem(){ return { ok: false }; }`),
  "../../library-viewers": dataModule(`export function LibraryItemViewer(){ return null; }`),
};
const { ServiceEditorPane } = await import(await compileModule("src/shell/bay/seller/ServiceEditorPane.tsx", stubs));

const CATEGORIES = [
  { slug: "design", name_zh: "设计与视觉", catalog_kind: "delivery", regulated_domain: "none", position: 10, published: true, required_fields: [{ key: "file_formats", label_zh: "交付格式", type: "list" }] },
];
const PROFILE = { user_id: "seller-1", handle: "leo", display_name: "Leo", avatar_url: null, headline: "", bio: "", categories: [], skills: [], languages: [], published: true, currency: "USD" };

function reset() {
  globalThis.__bayCalls = [];
  globalThis.__bayToasts = [];
  globalThis.__bayTerms = [];
  globalThis.__bayTermsAccept = true;
  globalThis.__bayOpened = [];
  globalThis.__bayReplaced = [];
  globalThis.__baySettingsOpened = [];
  globalThis.__baySignedIn = true;
  globalThis.__baySiteKey = "video";
  globalThis.__bayCategories = CATEGORIES;
  globalThis.__bayPickedWork = { kind: "task", id: "task-42", title: "季度汇报" };
  globalThis.__bayRespond = (method, path, body) => {
    if (method === "GET" && path === "/v1/talent/me") return { profile: PROFILE };
    if (method === "GET" && path === "/v1/talent/pricing-models") return { items: PRICING_MODEL_CARDS };
    if (method === "GET" && path === "/v1/moderation/my-cases") return { cases: [] };
    if (method === "GET" && path === "/v1/talent/domains") return { domains: [{ key: "tax", name_zh: "税务", gated: false }] };
    if (method === "GET" && path === "/v1/talent/me/services") return { items: [] };
    if (method === "POST" && path === "/v1/talent/me/services") return { service: { id: "s-new", status: "draft", ...body } };
    if (method === "PUT" && path === "/v1/talent/me/services/s-new/tiers") return { items: [] };
    if (method === "POST" && path === "/v1/talent/me/services/s-new/media") return { item: { id: "m1", ...body } };
    if (method === "GET" && path === "/v1/talent/me/services/s-new/media") return { items: [] };
    if (method === "POST" && path === "/v1/talent/me/services/s-new/publish") return { service: { id: "s-new", status: "published" }, moderation_hidden: false };
    return {};
  };
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await act(async () => {});
};

async function mount(target = { kind: "service-editor" }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(ServiceEditorPane, { target, layout: "docked", siteKey: globalThis.__baySiteKey })));
  await settle();
  const find = (selector) => {
    const node = host.querySelector(selector);
    assert.ok(node, `找不到 ${selector}`);
    return node;
  };
  const setValue = async (selector, value) => {
    const node = find(selector);
    const proto = node.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : node.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
    await act(async () => node.dispatchEvent(new window.Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })));
  };
  const click = async (selector) => {
    const node = find(selector);
    await act(async () => node.click());
    await settle();
  };
  return { host, find, setValue, click, unmount: () => act(() => root.unmount()) };
}

async function expandTerms(view) {
  const terms = view.host.querySelector('[data-bay-section="terms"]');
  if (terms && terms.hasAttribute("data-bay-section-collapsed")) {
    await view.click('[data-bay-section="terms"] [data-bay-section-toggle]');
  }
}

async function pickHowYouDeliver(view, kind) {
  await expandTerms(view);
  await view.setValue("[data-bay-how-you-deliver] select", kind);
}

test("类别选择器是卖/买，卖的交付方式含 digital / service / app / lesson，没有 consult，没有单独选类别页", async () => {
  reset();
  const view = await mount({ kind: "publish" });
  assert.ok(view.host.querySelector("[data-bay-publish-intent]"));
  assert.equal(view.host.querySelector('[data-bay-kind="consult"]'), null);
  assert.equal(view.host.querySelector('[data-bay-publish="pick"]'), null);
  assert.ok(view.host.querySelector('[data-bay-publish="form"]'));
  assert.equal(view.find("[data-bay-publish-intent]").tagName, "SELECT");
  assert.equal(view.host.querySelector("[data-bay-publish-delivery-field]"), null);
  assert.ok(view.host.querySelector("[data-bay-how-you-deliver]"));
  assert.ok(view.host.querySelector('[data-bay-listing-layout="split"]'));
  assert.equal(view.host.querySelector("[data-bay-listing-stage] [data-bay-reveal-item]")?.getAttribute("data-bay-reveal-item"), "cover");
  await view.click("[data-bay-how-you-deliver] button[data-menu-select-trigger]");
  const kinds = [...view.host.querySelectorAll("[data-bay-kind]")].map((node) => node.getAttribute("data-bay-kind"));
  assert.ok(kinds.includes("digital"));
  assert.ok(kinds.includes("service"));
  assert.ok(kinds.includes("app"));
  assert.ok(kinds.includes("lesson"));
  assert.ok(kinds.includes("need"));
  assert.ok(view.host.querySelector('[data-bay-how-you-deliver] [data-bay-choice-option="digital"]'));
  assert.ok(view.host.querySelector('[data-bay-how-you-deliver] [data-bay-choice-option="service"]'));
  assert.ok(view.host.querySelector("[data-bay-publish-category-field] [data-bay-menu-trigger]"));
  assert.ok(view.host.querySelector("[data-bay-publish-top-pair]"));
  assert.ok(view.host.querySelector("[data-bay-publish-subcategory] [data-bay-category-select]"));
  assert.equal(view.host.querySelector('[data-bay-listing-fields] [data-bay-reveal-open]')?.getAttribute("data-bay-reveal-item"), "how-you-deliver");
  assert.equal(view.find('[data-bay-section="terms"]').getAttribute("data-bay-section-collapsed"), "");
  await view.unmount();
});

test("选 service 后价格组只有价格框，计费方式卡片是交付条款的第一项，不含免费协作", async () => {
  reset();
  const view = await mount({ kind: "publish" });
  assert.equal(view.find('[data-bay-section="terms"]').getAttribute("data-bay-section-collapsed"), "");
  await pickHowYouDeliver(view, "service");
  await expandTerms(view);
  const price = view.find('[data-bay-section="price"]');
  const terms = view.find('[data-bay-section="terms"]');
  assert.equal(price.querySelector("[data-bay-service-form]"), null, "不再有「计费方式」选择行");
  assert.equal(price.querySelector('[data-bay-reveal-item="billing"]'), null);
  assert.equal(price.querySelector("[data-bay-model]"), null, "计费方式卡片不在价格组里");
  assert.deepEqual(
    [...terms.querySelectorAll("[data-bay-model]")].map((node) => node.getAttribute("data-bay-model")),
    ["fixed", "session", "hourly", "milestone"],
  );
  assert.equal(terms.querySelector('select[aria-label="计费方式"]').value, "fixed");
  const fixedCard = terms.querySelector('[data-bay-model="fixed"]');
  assert.doesNotMatch(fixedCard.textContent, /交付清单齐全|自动验收|Auto-accepted|不自动验收/);
  assert.equal(terms.querySelector("[data-bay-model-rule]")?.getAttribute("data-bay-model-rule"), "fixed");
  assert.match(terms.querySelector("[data-bay-model-rule]").textContent, /交付清单齐全即完成/);
  assert.deepEqual(
    [...view.host.querySelectorAll('[data-bay-section="price"] [data-bay-reveal-item]')].map((node) => node.getAttribute("data-bay-reveal-item")),
    ["price"],
  );
  assert.deepEqual(
    [...view.host.querySelectorAll('[data-bay-section="terms"] [data-bay-reveal-item]')].map((node) => node.getAttribute("data-bay-reveal-item")),
    ["billing-model", "delivery-days", "revisions", "deadline", "custom-terms"],
  );
  assert.ok(view.host.querySelector('[data-bay-section="product"] [data-bay-how-you-deliver]'));
  assert.ok(view.host.querySelector('[data-bay-section="audience"] [data-bay-reveal-item="who"]'));
  assert.ok(view.host.querySelector('[data-bay-field="delivery-days"]'));
  assert.ok(view.host.querySelector('[data-bay-field="revisions"]'));
  assert.equal(view.host.querySelector('[data-bay-field="buyer-inputs"]'), null);
  assert.equal(view.host.querySelector("[data-bay-delivery-mode]"), null);
  assert.doesNotMatch(view.host.textContent, /做一件事/);
  assert.doesNotMatch(view.host.textContent, /需要买家先提供什么/);
  assert.doesNotMatch(view.host.textContent, /站外交付/);
  await view.unmount();
});

test("点按次卡片后产品信息仍是封面标题介绍文件，不换成领域", async () => {
  reset();
  const view = await mount({ kind: "publish" });
  await pickHowYouDeliver(view, "service");
  await expandTerms(view);
  await view.setValue('[data-bay-section="terms"] select[aria-label="计费方式"]', "session");
  assert.equal(view.find('[data-bay-section="terms"] select[aria-label="计费方式"]').value, "session");
  assert.doesNotMatch(view.find('[data-bay-section="terms"] [data-bay-model="session"]').textContent, /自动验收|以会话时间戳/);
  assert.equal(view.host.querySelector("[data-bay-model-rule]")?.getAttribute("data-bay-model-rule"), "session");
  // 没有「更改」键：点这一张（右侧是展开小箭头）就重新展开，可以改选。
  assert.equal(view.host.querySelector("[data-bay-choice-change]"), null);
  await view.click('[data-bay-section="terms"] [data-bay-reveal-item="billing-model"] [data-bay-menu-trigger]');
  assert.equal(document.querySelectorAll('[data-bay-menu] button[data-bay-model]').length, 4);
  assert.deepEqual(
    [...view.host.querySelectorAll('[data-bay-section="product"] [data-bay-reveal-item]')].map((node) => node.getAttribute("data-bay-reveal-item")),
    ["how-you-deliver", "title", "description", "files"],
  );
  assert.doesNotMatch(view.find('[data-bay-section="product"]').textContent, /领域/);
  assert.equal(view.host.querySelector("[data-bay-domains]"), null);
  await view.unmount();
});

test("publish 带 category=design 时，选 service 后类目是 design", async () => {
  reset();
  const view = await mount({ kind: "publish", category: "design" });
  await pickHowYouDeliver(view, "service");
  assert.equal(view.find("[data-bay-category-select]").value, "design");
  await view.unmount();
});

test("点买调 replaceBay，目标是 post-need:design", async () => {
  reset();
  const view = await mount({ kind: "publish", category: "design" });
  await view.setValue("[data-bay-publish-intent]", "buy");
  assert.deepEqual(globalThis.__bayReplaced, [{ kind: "post-need", category: "design" }]);
  await view.unmount();
});

test("publish 带 category=design 时，选素材后类目是 design，填齐后请求体带 design", async () => {
  reset();
  const view = await mount({ kind: "publish", category: "design" });
  await pickHowYouDeliver(view, "digital");
  assert.equal(view.find("[data-bay-category-select]").value, "design");
  await view.setValue('[data-bay-field="title"]', "一套图标");
  const fileInput = view.find("[data-bay-cover-drop] input[type=file]");
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
    (ch) => ch.charCodeAt(0),
  );
  const file = new File([png], "a.png", { type: "image/png" });
  if (typeof window.DataTransfer === "function") {
    const transfer = new window.DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
  } else {
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
  }
  await act(async () => fileInput.dispatchEvent(new window.Event("change", { bubbles: true })));
  await settle();
  await view.click("[data-bay-work-library]");
  await view.click('[data-bay-action="publish"]');
  const created = globalThis.__bayCalls.find((call) => call.method === "POST" && call.path === "/v1/talent/me/services");
  assert.ok(created, "没有发出创建请求");
  assert.equal(created.body.category, "design");
  await view.unmount();
});

test("必填项带 *；点发布缺项时标红、不显示「还差几项」；选定后卡片收起可更改", async () => {
  reset();
  const view = await mount({ kind: "publish" });
  for (const id of ["cover", "title", "how-you-deliver"]) {
    assert.ok(view.host.querySelector(`[data-bay-reveal-item="${id}"] [data-bay-required]`), `${id} 缺少 *`);
  }
  assert.equal(view.host.querySelector('[data-bay-reveal-item="description"] [data-bay-required]'), null);
  assert.ok(view.host.querySelector("[data-bay-publish-subcategory] [data-bay-required]"));
  assert.doesNotMatch(view.find("[data-bay-publish-bar]").textContent, /还差|more and you can publish/);
  await view.click('[data-bay-action="publish"]');
  assert.ok(view.host.querySelector('[data-bay-reveal-item="title"][data-bay-reveal-invalid]'));
  // 描述默认一行，随内容变高由 scrollHeight 决定；这里只确认是单行起步。
  assert.equal(view.find('[data-bay-field="description"]').getAttribute("rows"), "1");
  assert.equal(view.host.querySelectorAll("[data-bay-how-you-deliver] button[data-bay-choice-option]").length, 1);
  await view.click("[data-bay-how-you-deliver] button[data-menu-select-trigger]");
  assert.equal(document.querySelectorAll("[data-bay-choice-menu] button[data-bay-choice-option]").length, 5);
  await act(async () => document.querySelector('[data-bay-choice-menu] button[data-bay-choice-option="digital"]').click());
  assert.equal(document.querySelector("[data-bay-choice-menu]"), null);
  await view.unmount();
});

test("截止时间：点开是日历加时分秒和时区，选日期后写出设备时间与 UTC，可清除", async () => {
  reset();
  const view = await mount({ kind: "publish" });
  await expandTerms(view);
  assert.equal(view.host.querySelector("[data-bay-deadline-panel]"), null);
  await view.click("[data-bay-deadline-trigger]");
  assert.ok(view.find("[data-bay-deadline-panel]"));
  assert.ok(view.find("[data-bay-deadline-zone]"));
  assert.equal(view.host.querySelectorAll("[data-bay-deadline-time] input").length, 3);
  await view.click('[data-bay-deadline-day="15"]');
  assert.match(view.find("[data-bay-deadline-trigger]").textContent, /\d{4}-\d{2}-15 23:59:59 UTC/);
  assert.match(view.find("[data-bay-deadline-check]").textContent, /UTC：\d{4}-\d{2}-1[56] \d{2}:\d{2}:\d{2}/);
  await view.click("[data-bay-deadline-clear]");
  assert.doesNotMatch(view.find("[data-bay-deadline-trigger]").textContent, /UTC/);
  await view.unmount();
});
