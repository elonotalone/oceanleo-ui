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

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../../../lib/bay/categories": categoriesStub,
  "../../../ui": confirmStub,
  "../../../ui/Toast": toastStub,
  "../settings": settingsStub,
  "../shell/bay-state": stateStub,
  "../needs/LibraryWorkPicker": needsStub,
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
  const click = async (selector) => {
    const node = find(selector);
    await act(async () => node.click());
    await settle();
  };
  return { host, find, click, unmount: () => act(() => root.unmount()) };
}

test("新草稿先出三张种类卡", async () => {
  reset();
  const view = await mount();
  assert.equal(view.host.querySelector('[data-bay-publish="pick"]')?.getAttribute("data-bay-pane"), "service-editor");
  assert.ok(view.host.querySelector('[data-bay-kind="digital"]'));
  assert.ok(view.host.querySelector('[data-bay-kind="service"]'));
  assert.ok(view.host.querySelector('[data-bay-kind="consult"]'));
  assert.equal(view.host.querySelector('[data-bay-publish="form"]'), null);
  await view.unmount();
});

test("选数字商品后出三块、没有步骤条、没有档位表", async () => {
  reset();
  const view = await mount();
  await view.click('[data-bay-kind="digital"]');
  assert.equal(view.find('[data-bay-publish="form"]').getAttribute("data-bay-pane"), "service-editor");
  assert.ok(view.host.querySelector('[data-bay-section="product"]'));
  assert.ok(view.host.querySelector('[data-bay-section="price"]'));
  assert.ok(view.host.querySelector('[data-bay-section="terms"]'));
  assert.equal(view.host.querySelector("[data-bay-steps]"), null);
  assert.equal(view.host.querySelector("[data-bay-tier]"), null);
  assert.match(view.host.textContent, /数字商品/);
  assert.equal(view.host.querySelector("[data-bay-category-select]"), null);
  await view.unmount();
});

test("选服务后「更多定价」默认收起", async () => {
  reset();
  const view = await mount();
  await view.click('[data-bay-kind="service"]');
  assert.equal(view.find("[data-bay-more-pricing-toggle]").getAttribute("aria-expanded"), "false");
  assert.equal(view.host.querySelector("[data-bay-more-pricing]"), null);
  assert.equal(view.host.querySelector("[data-bay-tier]"), null);
  assert.ok(view.host.querySelector("[data-bay-category-select]"));
  await view.unmount();
});

test("底部操作栏有「存草稿」「发布」", async () => {
  reset();
  const view = await mount();
  await view.click('[data-bay-kind="digital"]');
  const bar = view.find("[data-bay-publish-bar]");
  assert.equal(bar.querySelector('[data-bay-action="save-draft"]').textContent, "存草稿");
  assert.equal(bar.querySelector('[data-bay-action="publish"]').textContent, "发布");
  await view.unmount();
});

test("没有步骤条文案；未保存时可换一种", async () => {
  reset();
  const view = await mount();
  await view.click('[data-bay-kind="service"]');
  assert.equal(view.host.textContent.includes("第 "), false);
  assert.equal(view.host.textContent.includes("共 "), false);
  await view.click("[data-bay-switch-kind]");
  assert.ok(view.host.querySelector('[data-bay-publish="pick"]'));
  await view.unmount();
});

test("选答疑后仍是三块，没有步骤条", async () => {
  reset();
  const view = await mount();
  await view.click('[data-bay-kind="consult"]');
  assert.ok(view.host.querySelector('[data-bay-section="product"]'));
  assert.ok(view.host.querySelector('[data-bay-section="price"]'));
  assert.ok(view.host.querySelector('[data-bay-section="terms"]'));
  assert.equal(view.host.querySelector("[data-bay-steps]"), null);
  assert.match(view.host.textContent, /答疑/);
  await view.unmount();
});

test("数字商品有授权范围，没有档位和分类", async () => {
  reset();
  const view = await mount();
  await view.click('[data-bay-kind="digital"]');
  assert.ok(view.host.querySelector('[data-bay-license="personal"]'));
  assert.ok(view.host.querySelector('[data-bay-license="commercial"]'));
  assert.ok(view.host.querySelector("[data-bay-digital-terms]"));
  assert.equal(view.host.querySelector("[data-bay-tier]"), null);
  assert.equal(view.host.querySelector("[data-bay-faq-toggle]"), null);
  await view.unmount();
});

test("点发布而有没填的：不弹窗，标出缺项", async () => {
  reset();
  const view = await mount();
  await view.click('[data-bay-kind="digital"]');
  await view.click('[data-bay-action="publish"]');
  assert.deepEqual(globalThis.__bayTerms, [], "缺项时不问条款");
  assert.equal(view.host.querySelector("[data-bay-confirm]"), null);
  assert.match(view.find('[data-bay-section="product"]').textContent, /标题/);
  await view.unmount();
});
