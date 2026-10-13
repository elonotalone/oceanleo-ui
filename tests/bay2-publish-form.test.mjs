// W4：发布表单界面。新草稿先出三张种类卡；选完是一张表三块，没有步骤条。
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
    return { ok: true, data: { file: { url: "https://cdn.example.com/cover.png" } } };
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
  globalThis.__bayRespond = (method, path) => {
    if (method === "GET" && path === "/v1/talent/me") return { profile: PROFILE };
    if (method === "GET" && path === "/v1/talent/pricing-models") return { items: [] };
    if (method === "GET" && path === "/v1/moderation/my-cases") return { cases: [] };
    if (method === "GET" && path === "/v1/talent/domains") return { domains: [{ key: "tax", name_zh: "税务", gated: false }] };
    if (method === "GET" && path === "/v1/talent/me/services") return { items: [] };
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
    await settle();
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
  await view.click(`[data-bay-how-you-deliver] [data-bay-choice-option="${kind}"]`);
}

test("新草稿直接出表单，顶上是卖买和分类，默认打开封面", async () => {
  reset();
  const view = await mount();
  assert.equal(view.host.querySelector('[data-bay-publish="pick"]'), null);
  assert.equal(view.find('[data-bay-publish="form"]').getAttribute("data-bay-pane"), "service-editor");
  assert.equal(view.find("[data-bay-publish-intent]").tagName, "SELECT");
  assert.ok(view.host.querySelector("[data-bay-publish-category-field] [data-bay-menu-trigger]"));
  assert.ok(view.host.querySelector("[data-bay-publish-subcategory] [data-bay-category-select]"));
  assert.equal(view.host.querySelector("[data-bay-publish-delivery-field]"), null);
  assert.equal(view.find("[data-bay-how-you-deliver]").tagName, "DIV");
  assert.equal(view.find("[data-bay-how-you-deliver]").getAttribute("data-bay-publish-category"), "digital");
  assert.ok(view.host.querySelector('[data-bay-how-you-deliver] [data-bay-choice-option="digital"]'));
  assert.ok(view.host.querySelector('[data-bay-how-you-deliver] [data-bay-choice-option="service"]'));
  assert.ok(view.host.querySelector('[data-bay-how-you-deliver] [data-bay-choice-option="app"]'));
  assert.ok(view.host.querySelector('[data-bay-how-you-deliver] [data-bay-choice-option="lesson"]'));
  assert.ok(view.host.querySelector('[data-bay-kind="digital"]'));
  assert.ok(view.host.querySelector('[data-bay-kind="service"]'));
  assert.ok(view.host.querySelector('[data-bay-kind="app"]'));
  assert.ok(view.host.querySelector('[data-bay-kind="lesson"]'));
  assert.ok(view.host.querySelector('[data-bay-kind="need"]'));
  assert.equal(view.host.querySelector('[data-bay-kind="consult"]'), null);
  assert.equal(view.host.querySelector('[data-bay-publish="form"] [data-bay-reveal-open]')?.getAttribute("data-bay-reveal-item"), "cover");
  assert.deepEqual(
    [...view.host.querySelectorAll('[data-bay-section="product"] [data-bay-reveal-item]')].map((node) => node.getAttribute("data-bay-reveal-item")),
    ["cover", "title", "description", "files"],
  );
  assert.equal(view.find('[data-bay-section="price"] [data-bay-section-title]').textContent.trim(), "价格");
  assert.deepEqual(
    [...view.host.querySelectorAll('[data-bay-section="price"] [data-bay-reveal-item]')].map((node) => node.getAttribute("data-bay-reveal-item")),
    ["price"],
  );
  assert.doesNotMatch(view.find('[data-bay-section="price"] [data-bay-reveal-item="price"]').textContent, /预算/);
  assert.equal(view.find('[data-bay-section="price"] [data-bay-field="price"]').value, "");
  assert.match(view.find("[data-bay-price-currency]").textContent, /USD/);
  assert.equal(view.find('[data-bay-section="terms"]').getAttribute("data-bay-section-collapsed"), "");
  assert.ok(view.host.querySelector("[data-bay-cover-drop]"));
  assert.doesNotMatch(view.host.textContent, /所属分类/);
  assert.equal(view.host.querySelector('[data-bay-reveal-item="website"]'), null);
  assert.equal(view.host.querySelector('[data-bay-reveal-item="links"]'), null);
  await view.unmount();
});

test("选素材后出三块、没有步骤条、没有档位表", async () => {
  reset();
  const view = await mount();
  await pickHowYouDeliver(view, "digital");
  assert.equal(view.find('[data-bay-publish="form"]').getAttribute("data-bay-pane"), "service-editor");
  assert.ok(view.host.querySelector('[data-bay-section="product"]'));
  assert.ok(view.host.querySelector('[data-bay-section="price"]'));
  assert.ok(view.host.querySelector('[data-bay-section="terms"]'));
  assert.equal(view.host.querySelector("[data-bay-steps]"), null);
  assert.equal(view.host.querySelector("[data-bay-tier]"), null);
  assert.match(view.host.textContent, /现成文件/);
  assert.ok(view.host.querySelector("[data-bay-publish-subcategory] [data-bay-reveal-item='category']"));
  await view.unmount();
});

test("选服务后「更多定价」默认收起", async () => {
  reset();
  const view = await mount();
  await pickHowYouDeliver(view, "service");
  assert.equal(view.find("[data-bay-more-pricing-toggle]").getAttribute("aria-expanded"), "false");
  assert.equal(view.host.querySelector("[data-bay-more-pricing]"), null);
  assert.equal(view.host.querySelector("[data-bay-tier]"), null);
  assert.ok(view.host.querySelector("[data-bay-publish-subcategory] [data-bay-reveal-item='category']"));
  await view.unmount();
});

test("底部操作栏有「存草稿」「发布」", async () => {
  reset();
  const view = await mount();
  const bar = view.find("[data-bay-publish-bar]");
  assert.equal(bar.querySelector('[data-bay-action="save-draft"]').textContent, "存草稿");
  assert.equal(bar.querySelector('[data-bay-action="publish"]').textContent, "发布");
  await view.unmount();
});

test("没有步骤条文案；换类别仍在表单里", async () => {
  reset();
  const view = await mount();
  await pickHowYouDeliver(view, "service");
  assert.equal(view.host.textContent.includes("第 "), false);
  assert.equal(view.host.textContent.includes("共 "), false);
  assert.ok(view.host.querySelector('[data-bay-publish="form"]'));
  assert.equal(view.host.querySelector('[data-bay-publish="pick"]'), null);
  await view.unmount();
});

test("选服务后再切按次：仍是三块，产品信息还是封面标题介绍文件", async () => {
  reset();
  const view = await mount();
  await pickHowYouDeliver(view, "service");
  await view.click('[data-bay-section="price"] [data-bay-service-form-option="consult"]');
  assert.ok(view.host.querySelector('[data-bay-section="product"]'));
  assert.ok(view.host.querySelector('[data-bay-section="price"]'));
  assert.ok(view.host.querySelector('[data-bay-section="terms"]'));
  assert.equal(view.host.querySelector("[data-bay-steps]"), null);
  assert.ok(view.host.querySelector('[data-bay-section="price"] [data-bay-reveal-item="billing"]'));
  assert.deepEqual(
    [...view.host.querySelectorAll('[data-bay-section="price"] [data-bay-reveal-item]')].map((node) => node.getAttribute("data-bay-reveal-item")),
    ["billing", "price"],
  );
  assert.ok(view.host.querySelector('[data-bay-section="terms"] [data-bay-reveal-item="consult-rounds"]'));
  assert.ok(view.host.querySelector('[data-bay-section="terms"] [data-bay-reveal-item="revisions"]'));
  assert.deepEqual(
    [...view.host.querySelectorAll('[data-bay-section="product"] [data-bay-reveal-item]')].map((node) => node.getAttribute("data-bay-reveal-item")),
    ["cover", "title", "description", "files"],
  );
  assert.doesNotMatch(view.find('[data-bay-section="product"]').textContent, /领域/);
  assert.equal(view.host.querySelector("[data-bay-domains]"), null);
  await view.unmount();
});

test("素材：向谁展示和交付内容在交付条款上方；条款里是截止日期和用户自定义，没有授权范围和 FAQ", async () => {
  reset();
  const view = await mount();
  assert.ok(view.host.querySelector('[data-bay-section="audience"] [data-bay-reveal-item="who"]'));
  assert.ok(view.host.querySelector('[data-bay-section="offer"] [data-bay-how-you-deliver]'));
  assert.match(view.find('[data-bay-section="audience"] [data-bay-section-title]').textContent, /向谁展示/);
  assert.match(view.find('[data-bay-section="offer"] [data-bay-section-title]').textContent, /你交付什么/);
  await expandTerms(view);
  const terms = view.find('[data-bay-section="terms"]');
  assert.deepEqual(
    [...terms.querySelectorAll("[data-bay-reveal-item]")].map((node) => node.getAttribute("data-bay-reveal-item")),
    ["deadline", "custom-terms"],
  );
  assert.equal(terms.querySelector('[data-bay-reveal-item="delivery-mode"]'), null);
  assert.ok(terms.querySelector('[data-bay-reveal-item="deadline"]'));
  const deadline = terms.querySelector("[data-bay-deadline-field]");
  assert.ok(deadline);
  assert.match(deadline.className, /\bw-40\b/);
  assert.ok(terms.querySelector('[data-bay-reveal-item="custom-terms"]'));
  assert.ok(view.host.querySelector("[data-bay-audience]"));
  assert.ok(view.host.querySelector('[data-bay-field="custom-terms"]'));
  assert.equal(terms.querySelector('[data-bay-reveal-item="billing"]'), null);
  assert.equal(view.host.querySelector('[data-bay-reveal-item="license"]'), null);
  assert.equal(view.host.querySelector('[data-bay-license="personal"]'), null);
  assert.ok(view.host.querySelector("[data-bay-publish-subcategory] [data-bay-reveal-item='category']"));
  assert.equal(view.host.querySelector("[data-bay-tier]"), null);
  assert.equal(view.host.querySelector("[data-bay-faq-toggle]"), null);
  assert.doesNotMatch(terms.textContent, /网站|我的链接|FAQ/);
  await view.unmount();
});

test("点发布而有没填的：不弹窗，标出缺项", async () => {
  reset();
  const view = await mount();
  await view.click('[data-bay-action="publish"]');
  assert.deepEqual(globalThis.__bayTerms, [], "缺项时不问条款");
  assert.equal(view.host.querySelector("[data-bay-confirm]"), null);
  assert.match(view.find('[data-bay-section="product"]').textContent, /标题/);
  await view.unmount();
});

test("素材没选类目时点发布：缺项有分类，不发发布请求", async () => {
  reset();
  const view = await mount();
  assert.equal(view.find("[data-bay-category-select]").value, "");
  const before = globalThis.__bayCalls.filter((call) => call.method === "POST").length;
  await view.click('[data-bay-action="publish"]');
  assert.match(view.find('[data-bay-section="product"]').textContent, /分类/);
  assert.deepEqual(globalThis.__bayTerms, [], "缺项时不问条款");
  assert.equal(
    globalThis.__bayCalls.filter((call) => call.method === "POST").length,
    before,
    "缺分类时不发发布请求",
  );
  await view.unmount();
});
