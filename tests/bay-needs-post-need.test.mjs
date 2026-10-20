// W04：发需求窗格（PostNeedPane）。
// 覆盖：类目按站预选、门户为空必须自己选、答疑类目不出现；请求体带 posted_site 与 attached_work；
// 未登录点发布走登录；发布前先过买家条款；窗格不自带返回栏/标题栏。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

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
  File: dom.window.File,
  DataTransfer: dom.window.DataTransfer,
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
  globalThis.__authedCalls ??= [];
  export async function authed(path, init) {
    globalThis.__authedCalls.push({ path, init });
    return globalThis.__authedReply ?? { ok: true, data: { demand: { id: "d-new" } } };
  }
  export async function listTasks() { return { ok: true, data: { items: [] } }; }
`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  globalThis.__bayReplaced ??= [];
  globalThis.__bayLoginAsked ??= 0;
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function replaceBay(target){ globalThis.__bayReplaced.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function useBayTaskContext(){ return globalThis.__bayTask ?? null; }
  export function bayHrefOnSite(site, target){ return "https://" + site + ".oceanleo.test/bay?bay=" + target.kind + ":" + (target.id ?? ""); }
`);
const settingsStub = dataModule(`
  globalThis.__bayTermsAsked ??= [];
  export async function ensureBayTerms(scope){ globalThis.__bayTermsAsked.push(scope); return globalThis.__bayTermsOk !== false; }
  export function openBaySettings(pane){ globalThis.__baySettingsOpened ??= []; globalThis.__baySettingsOpened.push(pane); }
`);
const domainStub = dataModule(`
  export const CONFIGURED_DOMAIN_FAMILY = "com";
  export function currentDomainFamily(){ return "com"; }
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function domainProfileForHost(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function familyForHost(){ return "com"; }
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
  export async function pickLibraryWork(){
    globalThis.__bayPickAsked = (globalThis.__bayPickAsked || 0) + 1;
    return globalThis.__bayPicked ?? null;
  }
`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../shell/bay-state": stateStub,
  "../settings": settingsStub,
  "../../../contracts/domain-family": domainStub,
  "../../../ui/Toast": toastStub,
  "../../../ui": uiBarrelStub,
  "./LibraryWorkPicker": pickerStub,
  "../../artifact-client": dataModule(`export async function getCurrentArtifactItem(){ return { ok: false }; }`),
  "../../library-viewers": dataModule(`export function LibraryItemViewer(){ return null; }`),
  "./BayTypedPreview": dataModule(`export function BayTypedPreview(){ return null; }`),
  "../../../lib/database": dataModule(`
    export async function uploadFile(file, opts) {
      (globalThis.__bayCoverUploads ||= []).push({ file, opts });
      return { ok: true, data: { file: { url: "https://cdn.example.com/cover.png" } } };
    }
    export async function getStorageUsage() {
      return { ok: true, data: { remaining_bytes: 20 * 1024 * 1024 * 1024, unavailable: false } };
    }
  `),
  "../../../lib/im/people-api": dataModule(`
    export async function listContacts(){ return []; }
    export async function searchDirectory(){ return []; }
  `),
  "../../../lib/im/inbox-api": dataModule(`export async function fetchConversations(){ return { items: [], next_cursor: null }; }`),
  "../../../lib/im/groups-api": dataModule(`export async function getConversationDetail(){ return { id: "", title: "", members: [] }; }`),
};
const paneModule = await import(await compileModule("src/shell/bay/needs/PostNeedPane.tsx", stubs));
const { PostNeedPane } = paneModule;
const { primeNeedCategoriesForTests } = await import(await compileModule("src/shell/bay/needs/need-categories.ts", stubs));
const { resetBayCategoriesCache } = await import(await compileModule("src/lib/bay/categories.ts", stubs));

const CATEGORIES = {
  items: [],
  flat_items: [
    { slug: "doc", name_zh: "文档与表格", catalog_kind: "delivery", regulated_domain: "none", position: 50, published: true },
    { slug: "design", name_zh: "设计与视觉", catalog_kind: "delivery", regulated_domain: "none", position: 10, published: true },
    { slug: "other", name_zh: "其他", catalog_kind: "delivery", regulated_domain: "none", position: 160, published: true },
    { slug: "legal", name_zh: "法律咨询", catalog_kind: "consult", regulated_domain: "legal", position: 1100, published: true },
    { slug: "medical", name_zh: "医疗咨询", catalog_kind: "consult", regulated_domain: "medical", position: 1000, published: true },
  ],
  total: 5,
  site_defaults: { ppt: "doc", design: "design", oceanleo: null },
};

function reset() {
  resetBayCategoriesCache();
  primeNeedCategoriesForTests(CATEGORIES);
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = (method, path, body) => {
    if (method === "GET" && path === "/v1/talent/categories") return CATEGORIES;
    if (method === "POST" && path === "/v1/talent/demands") return { demand: { id: "d-new", ...body } };
    return {};
  };
  globalThis.__authedCalls = [];
  globalThis.__authedReply = { ok: true, data: { demand: { id: "d-new" } } };
  globalThis.__bayOpened = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayTermsAsked = [];
  globalThis.__bayTermsOk = true;
  globalThis.__toasts = [];
  globalThis.__bayTask = null;
  globalThis.__bayPicked = null;
  globalThis.__bayPickAsked = 0;
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

const paneProps = (siteKey, category) => ({
  target: category ? { kind: "post-need", category } : { kind: "post-need" },
  layout: "docked",
  siteKey,
});

async function expandTerms(view) {
  const terms = view.host.querySelector('[data-bay-section="terms"]');
  if (terms && terms.hasAttribute("data-bay-section-collapsed")) {
    await view.click('[data-bay-section="terms"] [data-bay-section-toggle]');
  }
}

async function fillRequired(view) {
  await view.type("[data-bay-help-text]", "给新品做一份演示稿");
  await view.type('[data-bay-field="description"]', "需要十五页，含财务预测和英文版说明文字。");
  const fileInput = view.host.querySelector("[data-bay-cover-drop] input[type=file]");
  assert.ok(fileInput, "找不到封面上传");
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
}

test("目标不是发需求时什么都不画", () => {
  reset();
  const html = renderToStaticMarkup(
    React.createElement(PostNeedPane, { target: { kind: "demand", id: "d1" }, layout: "docked", siteKey: "ppt" }),
  );
  assert.equal(html, "");
});

test("类目按站预选；门户为空；答疑类目不出现", async () => {
  reset();
  const ppt = await mount(React.createElement(PostNeedPane, paneProps("ppt")));
  assert.equal(ppt.host.querySelector("[data-bay-pane]").getAttribute("data-bay-pane"), "post-need");
  assert.equal(ppt.host.querySelector("header"), null, "不自带标题栏");
  assert.equal(ppt.host.querySelector("[data-bay-detail-bar]"), null, "返回栏归外壳");
  assert.ok(ppt.host.querySelectorAll("[data-bay-reveal-open]").length >= 2);
  assert.equal(ppt.host.querySelector("[data-bay-listing-stage] [data-bay-reveal-item]")?.getAttribute("data-bay-reveal-item"), "cover");
  assert.equal(ppt.host.querySelector("[data-bay-listing-fields] [data-bay-reveal-open]").getAttribute("data-bay-reveal-item"), "how-you-deliver");
  assert.ok(ppt.host.querySelector('[data-bay-section="product"]'));
  assert.ok(ppt.host.querySelector('[data-bay-section="price"]'));
  assert.ok(ppt.host.querySelector('[data-bay-section="terms"]'));
  assert.equal(ppt.host.querySelector('[data-bay-section="terms"]').getAttribute("data-bay-section-collapsed"), "");
  assert.match(ppt.host.querySelector("[data-bay-publish-subcategory]").textContent, /文档与表格/);
  assert.equal(ppt.host.querySelector("[data-bay-help-category] select")?.value, "doc");
  assert.equal(ppt.host.querySelector('[data-bay-help-category] option[data-bay-category="legal"]'), null);
  assert.equal(ppt.host.querySelector('[data-bay-help-category] option[data-bay-category="medical"]'), null);
  assert.match(ppt.host.textContent, /文档与表格/);
  assert.doesNotMatch(ppt.host.textContent, /法律咨询|医疗咨询/);
  await ppt.unmount();

  reset();
  const portal = await mount(React.createElement(PostNeedPane, paneProps("oceanleo")));
  assert.equal(portal.host.querySelector("[data-bay-help-category] select")?.value, "");
  assert.match(portal.host.textContent, /请选择/);
  await portal.unmount();
});

test("未登录点发布只弹登录，不发请求、不过条款", async () => {
  reset();
  globalThis.__baySignedIn = false;
  const view = await mount(React.createElement(PostNeedPane, paneProps("ppt")));
  assert.match(view.host.textContent, /登录后才能找人帮忙/);
  await fillRequired(view);
  await view.click("[data-bay-submit]");
  assert.equal(globalThis.__bayLoginAsked, 1);
  assert.deepEqual(globalThis.__bayTermsAsked, []);
  assert.equal(globalThis.__bayHttpCalls.filter((call) => call.method === "POST").length, 0);
  await view.unmount();
});

test("发布请求体带 posted_site 与 attached_work；先过买家条款", async () => {
  reset();
  globalThis.__bayPicked = { kind: "task", id: "task-9" };
  const view = await mount(React.createElement(PostNeedPane, paneProps("ppt")));
  await fillRequired(view);
  await view.click("[data-bay-work-library]");
  assert.equal(globalThis.__bayPickAsked, 1);
  await view.click("[data-bay-submit]");
  assert.deepEqual(globalThis.__bayTermsAsked, ["buyer"]);
  const created = globalThis.__bayHttpCalls.find((call) => call.method === "POST" && call.path === "/v1/talent/demands");
  assert.ok(created);
  assert.equal(created.body.posted_site, "ppt");
  assert.deepEqual(created.body.attached_work, { kind: "task", id: "task-9" });
  assert.equal(created.body.catalog_kind, "delivery");
  assert.equal(created.body.title, "给新品做一份演示稿");
  assert.deepEqual(globalThis.__bayOpened, [{ kind: "demand", id: "d-new" }]);
  await view.unmount();
});

test("关掉条款窗口就不发布", async () => {
  reset();
  globalThis.__bayTermsOk = false;
  const view = await mount(React.createElement(PostNeedPane, paneProps("design")));
  await fillRequired(view);
  await view.click("[data-bay-submit]");
  assert.deepEqual(globalThis.__bayTermsAsked, ["buyer"]);
  assert.equal(globalThis.__bayHttpCalls.filter((call) => call.method === "POST").length, 0);
  await view.unmount();
});

test("发需求表一次看全：标题和介绍分开，截止日期在交付条款", async () => {
  reset();
  const view = await mount(React.createElement(PostNeedPane, paneProps("ppt")));
  const text = view.host.textContent;
  assert.match(text, /标题/);
  assert.match(text, /详细介绍/);
  assert.match(text, /分类/);
  assert.doesNotMatch(text, /所属分类/);
  assert.doesNotMatch(text, /要做什么/);
  assert.equal(view.host.querySelector('[data-bay-section="price"] [data-bay-section-title]').textContent.trim(), "价格");
  const priceRow = view.host.querySelector('[data-bay-section="price"] [data-bay-reveal-item="price"]');
  const priceIds = [...view.host.querySelectorAll('[data-bay-section="price"] [data-bay-reveal-item]')].map((node) => node.getAttribute("data-bay-reveal-item"));
  assert.ok(priceRow, `买页价格行 id 应是 price，实际 ${priceIds.join(",") || "(空)"}`);
  assert.doesNotMatch(priceRow.textContent, /预算/);
  assert.ok(view.host.querySelector('[data-bay-section="price"] [data-bay-field="price"]'));
  assert.equal(view.host.querySelector('[data-bay-section="price"] [data-bay-field="price"]').value, "");
  assert.match(view.host.querySelector("[data-bay-price-currency]").textContent, /USD/);
  assert.match(text, /向谁展示/);
  assert.match(text, /交付给你的是什么/);
  assert.match(text, /截止日期/);
  assert.match(text, /放文件/);
  assert.deepEqual(
    [...view.host.querySelectorAll('[data-bay-section="product"] [data-bay-reveal-item]')].map((node) => node.getAttribute("data-bay-reveal-item")),
    ["how-you-deliver", "title", "description", "files"],
  );
  assert.ok(view.host.querySelector("[data-bay-how-you-deliver]"));
  assert.equal(view.host.querySelector("[data-bay-publish-delivery-field]"), null);
  assert.equal(view.host.querySelector("[data-bay-listing-fields] [data-bay-reveal-open]").getAttribute("data-bay-reveal-item"), "how-you-deliver");
  assert.ok(view.host.querySelector('[data-bay-section="terms"] [data-bay-field="deadline"]'));
  assert.ok(view.host.querySelector("[data-bay-help-text]"));
  await expandTerms(view);
  assert.ok(view.host.querySelector('[data-bay-section="audience"] [data-bay-reveal-item="who"]'));
  assert.equal(view.host.querySelector('[data-bay-section="terms"] [data-bay-reveal-item="who"]'), null);
  await view.unmount();
});

test("发需求编辑页灰字不用 400，没有白板页脚", () => {
  const editor = readFileSync(new URL("../src/shell/bay/needs/DemandEditor.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(editor, /text-neutral-400|text-stone-400/);
  assert.doesNotMatch(editor, /bg-white\/95/);
  assert.doesNotMatch(editor, /-mx-4/);
});
