// 安全矩阵：不适用（填写页展开表单，无不可信注入）
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

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", { url: "https://design.oceanleo.com/bay" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
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
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  globalThis.__bayLoginAsked ??= 0;
  globalThis.__baySignedIn ??= true;
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function replaceBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function useBaySiteKey(){ return "design"; }
  export function bayBack(){}
  export function bayHrefOnSite(){ return ""; }
`);
const settingsStub = dataModule(`
  globalThis.__baySettings ??= [];
  export async function ensureBayTerms(){ return true; }
  export function openBaySettings(pane){ globalThis.__baySettings.push(pane); }
`);
const linksStub = dataModule(`
  export function baySiteName(key){ return key === "design" ? "LeoDesign" : key || null; }
  export function baySubsiteLabel(key){ return key || null; }
`);
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
const toastStub = dataModule(`export function useToast(){ return { toast(){}, dismiss(){} }; }`);
const confirmStub = dataModule(`export function ConfirmDialog(){ return null; }`);
const databaseStub = dataModule(`
  export async function uploadFile(file, opts) {
    (globalThis.__bayCoverUploads ||= []).push({ file, opts });
    return { ok: true, data: { file: { url: "https://cdn.example.com/avatar.png" } } };
  }
`);

const sellerStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/auth/client": authStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../../../lib/database": databaseStub,
  "../agent": agentStub,
  "../shell/bay-state": stateStub,
  "../shell/bay-links": linksStub,
  "../settings": settingsStub,
  "../needs": needsStub,
  "../needs/LibraryWorkPicker": needsStub,
  "../../../ui": confirmStub,
  "../../../ui/Toast": toastStub,
};

const { BaySellerProfileSection } = await import(await compileModule("src/shell/bay/seller/BaySellerProfileSection.tsx", sellerStubs));
const { BayVettingSection } = await import(await compileModule("src/shell/bay/seller/BayVettingSection.tsx", sellerStubs));

function reset() {
  globalThis.__bayOpened = [];
  globalThis.__baySettings = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayViewer = "me";
  globalThis.__baySellerCalls = [];
  globalThis.__bayCoverUploads = [];
  globalThis.__bayPickedWork = { kind: "task", id: "task-42", site_key: "ppt", title: "季度汇报" };
  globalThis.__baySellerReply = (method, path) => {
    if (path === "/v1/moderation/my-cases") return { cases: [] };
    if (path === "/v1/talent/me") return { profile: null };
    if (path === "/v1/talent/me/showcase") return { items: [] };
    if (path === "/v1/talent/vetting/mine") return { credentials: [], decisions: [], recheck_days: 180 };
    return {};
  };
  globalThis.__baySellerAuthed = (path, init, body) => ({ ok: true, data: { profile: body || {}, items: [] } });
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

function labelsOf(host, ids) {
  return ids.map((id) => {
    const row = host.querySelector(`[data-bay-reveal-item="${id}"]`);
    assert.ok(row, `缺少 ${id}`);
    const label = row.querySelector("[data-bay-reveal-label]")?.textContent?.trim() || row.textContent?.trim() || "";
    return { id, label, row };
  });
}

test("卖家资料：七项标签都看得见；字段都开着；头像是拖拽上传不是地址框", async () => {
  reset();
  const view = await mount(React.createElement(BaySellerProfileSection));
  const ids = ["handle", "display_name", "avatar", "headline", "bio", "skills", "languages"];
  const expected = {
    handle: "主页地址",
    display_name: "显示名",
    avatar: "头像",
    headline: "一句话介绍",
    bio: "简介",
    skills: "技能",
    languages: "语言",
  };
  const rows = labelsOf(view.host, ids);
  for (const row of rows) {
    assert.match(row.label, new RegExp(expected[row.id]));
  }
  assert.ok(view.host.querySelectorAll("[data-bay-seller-profile] [data-bay-reveal-open]").length >= 4);
  assert.equal(view.host.querySelector("[data-bay-seller-profile] [data-bay-reveal-open]").getAttribute("data-bay-reveal-item"), "handle");
  assert.doesNotMatch(view.host.textContent, /https:\/\/ 开头/);
  assert.doesNotMatch(view.host.textContent, /逗号分隔/);
  assert.doesNotMatch(view.host.textContent, /头像地址/);
  const avatarOpen = view.host.querySelector('[data-bay-reveal-item="avatar"][data-bay-reveal-open]');
  assert.ok(avatarOpen);
  assert.ok(avatarOpen.querySelector("[data-bay-cover-drop]"));
  assert.equal(avatarOpen.querySelector('input:not([type="file"]):not([type="hidden"])'), null);
  view.unmount();
});

test("核验：标签看得见；字段都开着；领域选项没有医疗/法律/宠物医疗", async () => {
  reset();
  const view = await mount(React.createElement(BayVettingSection));
  const expected = { domain: "领域", kind: "凭证种类", credential_no: "编号", source: "查验来源" };
  for (const row of labelsOf(view.host, Object.keys(expected))) {
    assert.match(row.label, new RegExp(expected[row.id]));
  }
  assert.ok(view.host.querySelectorAll("[data-bay-vetting] [data-bay-reveal-open]").length >= 3);
  assert.ok(view.host.querySelector("[data-bay-vetting] [data-bay-reveal-open]"));
  assert.doesNotMatch(view.host.textContent, /例如发证机关/);
  assert.doesNotMatch(view.host.textContent, /只填公开可查的编号和查验来源/);
  const options = [...view.host.querySelectorAll('[data-bay-field="domain"] option')].map((node) => node.value);
  assert.ok(options.includes("tax"));
  assert.ok(!options.includes("medical"));
  assert.ok(!options.includes("legal"));
  assert.ok(!options.includes("vet"));
  const texts = [...view.host.querySelectorAll('[data-bay-field="domain"] option')].map((node) => node.textContent);
  assert.ok(!texts.some((text) => /医疗|法律|宠物医疗/.test(text || "")));
  view.unmount();
});
