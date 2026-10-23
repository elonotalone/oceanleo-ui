// 安全矩阵：不适用（填写页展开表单，无不可信注入）
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("卖家资料不再是第二张表：主页编辑源码没有展开字段、设置里连那扇门都拆了", () => {
  const pane = readFileSync(new URL("../src/shell/bay/supply/ProfilePane.tsx", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../src/shell/bay/page/ProfilePageEditor.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/shell/bay/page/ProfilePage.tsx", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../src/shell/bay/settings/BaySettingsSection.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(pane, /BaySellerProfileSection/);
  assert.doesNotMatch(pane, /data-bay-own-profile-form/);
  assert.doesNotMatch(editor, /BayRevealForm/);
  assert.match(page, /data-bay-field="handle"/);
  assert.match(page, /data-bay-field="display_name"/);
  assert.match(page, /variant="avatar"/);
  // leobay-projects W05：设置 → LeoBay 只剩付款卡 + 收款账户，「编辑主页」那扇门随卖家资料页签一起删了。
  assert.doesNotMatch(settings, /BaySettingsProfileDoor|BayVettingSection|requestMinePageEdit/);
  assert.equal(existsSync(new URL("../src/shell/bay/settings/BaySettingsProfileDoor.tsx", import.meta.url)), false);
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
