// W4：我的收藏。一张带类别标签的清单；空状态没有招生句，行上没有取消收藏。
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
  export function replaceBay(){}
  export function bayHrefOnSite(){ return "#"; }
  globalThis.__bayOpened ??= [];
  globalThis.__bayLoginAsked ??= 0;
  globalThis.__baySignedIn ??= true;
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function bayBack(){}
`);
const settingsOpenStub = dataModule(`
  globalThis.__baySettings ??= [];
  export function openBaySettings(pane){ globalThis.__baySettings.push(pane); }
`);
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
  export async function authed(path, init) {
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    globalThis.__bayHttpCalls = globalThis.__bayHttpCalls || [];
    globalThis.__bayHttpCalls.push({ method: (init && init.method) || "GET", path, body });
    const handler = globalThis.__bayAuthed;
    return handler ? handler(path, init, body) : { ok: true, data: {} };
  }
`);
const pickerStub = dataModule(`
  export async function pickLibraryWork(){ return null; }
`);
const domainStub = dataModule(`
  export function familyForHost(){ return undefined; }
  export const CONFIGURED_DOMAIN_FAMILY = undefined;
  export function currentDomainFamily(){ return undefined; }
  export function domainProfileForHost(){ return undefined; }
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function portalHref(path){ return "https://oceanleo.test" + path; }
`);
const authStub = dataModule(`
  export async function getUserId(){ return "me"; }
  export const AUTH_STATE_EVENT = "oceanleo-auth-state";
  export async function accessToken(){ return "t"; }
  export function cachedAccessToken(){ return "t"; }
`);

const paneStubs = {
  "../deal/open-trade-thread": dataModule("export async function openTradeThread(){}"),
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/bay/directory": dataModule("export function bayQuery(){ return ''; }"),
  "../../../lib/agent": agentStub,
  "../../../lib/auth/client": authStub,
  "../../../lib/auth/config": dataModule("export const GATEWAY_BASE = 'https://api.test';"),
  "../shell/bay-state": stateStub,
  "../settings/settings-open": settingsOpenStub,
  "../needs/LibraryWorkPicker": pickerStub,
  "../../../contracts/domain-family": domainStub,
};

const { MyFavoritesPane } = await import(await compileModule("src/shell/bay/mine/MyFavoritesPane.tsx", paneStubs));
const favorites = await import(
  await compileModule("src/lib/bay/favorites.ts", {
    "./http": httpStub,
    "./directory": dataModule("export function bayQuery(){ return ''; }"),
    "../auth/config": dataModule("export const GATEWAY_BASE = 'https://api.test';"),
    "../../contracts/domain-family": domainStub,
  })
);

const paneProps = { target: { kind: "mine", tab: "favorites" }, layout: "docked", siteKey: "design" };

function favoriteItems() {
  return [
    {
      id: "f-svc",
      target_kind: "service",
      target_ref: "svc-1",
      created_at: null,
      target: { id: "svc-1", title: "Logo 设计", summary: "三版方案", seller: { handle: "leo", display_name: "Leo" } },
    },
    {
      id: "f-pro",
      target_kind: "profile",
      target_ref: "u1",
      created_at: null,
      target: { handle: "ace", display_name: "高手", headline: "十年品牌" },
    },
    {
      id: "f-dmd",
      target_kind: "demand",
      target_ref: "d1",
      created_at: null,
      target: { id: "d1", title: "路演稿", category: "doc", status: "open" },
    },
  ];
}

function resetFavorites(items = favoriteItems()) {
  globalThis.__bayOpened = [];
  globalThis.__baySettings = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = (method, path) => {
    if (method === "GET" && path.startsWith("/v1/talent/favorites")) return { items, total: items.length };
    if (method === "DELETE" && path.startsWith("/v1/talent/favorites")) return { ok: true };
    return {};
  };
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(() => {
    root.render(element);
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 40)));
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

test("收藏纯函数：标题、副标题、打开目标", () => {
  const [service, profile, demand] = favoriteItems();
  assert.equal(favorites.favoriteTitle(service), "Logo 设计");
  assert.equal(favorites.favoriteSubtitle(service), "三版方案");
  assert.deepEqual(favorites.favoriteOpenTarget(service), { kind: "service", id: "svc-1" });
  assert.equal(favorites.favoriteTitle(profile), "高手");
  assert.equal(favorites.favoriteSubtitle(profile), "十年品牌");
  assert.deepEqual(favorites.favoriteOpenTarget(profile), { kind: "profile", handle: "ace" });
  assert.equal(favorites.favoriteTitle(demand), "路演稿");
  assert.equal(favorites.favoriteSubtitle(demand), "doc");
  assert.deepEqual(favorites.favoriteOpenTarget(demand), { kind: "demand", id: "d1" });
  assert.equal(
    favorites.favoriteOpenTarget({ id: "x", target_kind: "profile", target_ref: "u9", created_at: null, target: {} }),
    null,
  );
});

test("我的收藏：一张清单，行右边标类别；点行打开对应目标", async () => {
  resetFavorites();
  const view = await mount(React.createElement(MyFavoritesPane, paneProps));
  assert.ok(view.host.querySelector('[data-bay-pane="mine-favorites"]'));
  assert.equal(view.host.querySelector("[data-bay-fav-group]"), null);
  assert.match(view.host.textContent, /Logo 设计/);
  assert.match(view.host.textContent, /高手/);
  assert.match(view.host.textContent, /路演稿/);
  assert.match(view.host.textContent, /人工服务|成品文件/);
  assert.match(view.host.textContent, /其他/);
  assert.equal(view.host.querySelector("[data-bay-fav-remove]"), null);
  assert.equal(view.host.querySelector("[data-bay-fav-group]"), null);
  await view.click('[data-bay-fav-row="f-svc"] button');
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "service", id: "svc-1" });
  await view.click('[data-bay-fav-row="f-pro"] button');
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "profile", handle: "ace" });
  await view.click('[data-bay-fav-row="f-dmd"] button');
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "demand", id: "d1" });
  view.unmount();
});

test("我的收藏：空状态没有招生句，也没有取消收藏键", async () => {
  resetFavorites([]);
  const view = await mount(React.createElement(MyFavoritesPane, paneProps));
  const empty = view.host.querySelector('[data-bay-empty="category"]');
  assert.ok(empty);
  assert.match(empty.textContent, /这一类还没有收藏。/);
  assert.doesNotMatch(empty.textContent, /看到喜欢的服务、卖家或需求/);
  assert.equal(view.host.querySelector("[data-bay-fav-remove]"), null);
  view.unmount();
});
