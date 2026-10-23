// leobay-projects 波 W06：
//   ① 资质核验进「我的主页」编辑状态（出现条件、自动滚、请求一次性 / 订阅 / 过期、白卡不铺整页）
//   ② 交易会话系统消息改指（level.changed → 我的主页，vetting.* → 我的主页的核验块，不再有 settings 目标）
//   ③ 「用 OceanLeo 账号登录的应用」进设置 → 账户（子页 id、首页一行、子页挂载、列表 / 撤回二次确认 / 空态 / 出错）
//   ④ 边界内不再用退役种类名；新文案 17 语齐全。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w06-verification-grants.test.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test, { afterEach } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import React, { act } from "react";
import ts from "typescript";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { defaultPageDoc } from "../src/lib/bay/page-doc.ts";
import * as tabs from "../src/pages/settings/settings-tabs.ts";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");

// ---------------------------------------------------------------------------------------
// DOM 环境
// ---------------------------------------------------------------------------------------
const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/settings/account",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLFormElement: window.HTMLFormElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  FocusEvent: window.FocusEvent,
  InputEvent: window.InputEvent,
  DragEvent: window.DragEvent,
  File: window.File,
  FileReader: window.FileReader,
  Image: window.Image,
  DataTransfer: window.DataTransfer,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.React = React;
globalThis.__w06React = React;

// react-dom 要在全局 DOM 就位之后再加载（模块求值时就探测 window.document）。
const { createRoot } = await import("react-dom/client");

/** jsdom 没有 scrollIntoView：记下谁被要求滚到视野里。 */
const scrollCalls = [];
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView(options) {
  scrollCalls.push({ el: this, options });
};

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const fakeTT = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

async function flush() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** 等 requestAnimationFrame（编辑器在版面排好之后才滚）。 */
async function frames() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  await flush();
}

/** 没收尾的挂载（某条断言失败时）会继续订阅「进编辑」请求、抢走后面测试的请求，所以每条测试之后统一卸掉。 */
const openViews = new Set();
afterEach(async () => {
  for (const view of [...openViews]) await view.unmount();
});

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  await flush();
  const view = {
    host,
    async click(selector) {
      const node = typeof selector === "string" ? host.querySelector(selector) : selector;
      assert.ok(node, String(selector));
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    async unmount() {
      if (!openViews.delete(view)) return;
      await act(async () => root.unmount());
      host.remove();
    },
  };
  openViews.add(view);
  return view;
}

// ---------------------------------------------------------------------------------------
// ① 进编辑的请求（page/mine-page-edit.ts）
// ---------------------------------------------------------------------------------------
const edit = await import("../src/shell/bay/page/mine-page-edit.ts");
const editUrl = pathToFileURL(path.join(REPO, "src/shell/bay/page/mine-page-edit.ts")).href;

function drainEditRequests() {
  while (edit.takeMinePageEditRequest()) {
    /* 清空上一条测试留下的请求 */
  }
}

test("请求一次性：旧的无参调用照旧进编辑，取走后没有了", () => {
  drainEditRequests();
  assert.equal(edit.takeMinePageEdit(), false, "没人请求时不进编辑");
  edit.requestMinePageEdit();
  assert.equal(edit.takeMinePageEdit(), true);
  assert.equal(edit.takeMinePageEdit(), false, "取走即清，不会在下一次普通打开时再弹出来");
});

test("入口参数：vetting 被带出来，无参是 null，后一次请求覆盖前一次", () => {
  drainEditRequests();
  edit.requestMinePageEdit("vetting");
  assert.deepEqual(edit.takeMinePageEditRequest(), { focus: "vetting" });
  assert.equal(edit.takeMinePageEditRequest(), null);
  edit.requestMinePageEdit();
  assert.deepEqual(edit.takeMinePageEditRequest(), { focus: null });
  edit.requestMinePageEdit("vetting");
  edit.requestMinePageEdit();
  assert.deepEqual(edit.takeMinePageEditRequest(), { focus: null });
});

test("60 秒没人取就作废，之后取不到（内存和 sessionStorage 两份都清掉）", () => {
  drainEditRequests();
  edit.requestMinePageEdit("vetting");
  assert.equal(edit.MINE_PAGE_EDIT_TTL_MS, 60_000);
  assert.equal(edit.takeMinePageEditRequest(Date.now() + edit.MINE_PAGE_EDIT_TTL_MS + 5_000), null);
  assert.equal(edit.takeMinePageEditRequest(), null, "过期的那次也已经被清掉，不会复活");
  assert.equal(window.sessionStorage.getItem("oceanleo.bay.mine-page-edit"), null);
});

test("整页跳转（模块变量丢了）后还能从 sessionStorage 取回；订阅者被通知一次", async () => {
  drainEditRequests();
  let notified = 0;
  const off = edit.subscribeMinePageEdit(() => {
    notified += 1;
  });
  edit.requestMinePageEdit("vetting");
  assert.equal(notified, 1, "主页已经挂着时，请求立刻通知它");
  off();
  edit.requestMinePageEdit("vetting");
  assert.equal(notified, 1, "取消订阅后不再通知");

  const reloaded = await import(`${editUrl}?reloaded=${Math.random().toString(36).slice(2)}`);
  assert.notEqual(reloaded, edit, "换了一份模块实例 = 整页重载");
  assert.deepEqual(reloaded.takeMinePageEditRequest(), { focus: "vetting" });
  assert.equal(reloaded.takeMinePageEditRequest(), null);
  assert.equal(window.sessionStorage.getItem("oceanleo.bay.mine-page-edit"), null, "取走之后存储也清空了");
  drainEditRequests(); // 原实例的内存里还留着同一条（真实的整页重载里它已经不存在了）
});

test("进编辑后要不要滚到核验块：明确要求一定滚；无参看主页是否已公开；没有请求不滚", () => {
  assert.equal(edit.wantsMinePageVetting({ focus: "vetting" }, false), true);
  assert.equal(edit.wantsMinePageVetting({ focus: "vetting" }, true), true);
  assert.equal(edit.wantsMinePageVetting({ focus: null }, true), true, "已公开主页的人走 I-8 去核验");
  assert.equal(edit.wantsMinePageVetting({ focus: null }, false), false, "没公开的人是去建资料，从顶上开始");
  assert.equal(edit.wantsMinePageVetting(null, true), false);
});

// ---------------------------------------------------------------------------------------
// ① 我的主页 · 编辑器里的资质核验卡
// ---------------------------------------------------------------------------------------
const httpStub = dataModule(`
  globalThis.__bayHttpCalls ??= [];
  async function reply(method, path, body, opts) {
    globalThis.__bayHttpCalls.push({ method, path, body, opts });
    const responder = globalThis.__bayHttpRespond;
    return responder ? responder(method, path, body, opts) : {};
  }
  export class BayApiError extends Error {}
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const profileStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": dataModule(`
    export async function authed(path, init){
      const body = init && init.body ? JSON.parse(init.body) : undefined;
      globalThis.__bayAuthedCalls ??= [];
      globalThis.__bayAuthedCalls.push({ method: (init && init.method) || "GET", path, body });
      return { ok: true, data: { profile: { handle: "leo", display_name: "Leo", published: true, page_doc: body && body.page_doc ? body.page_doc : null } } };
    }
  `),
  "../../../lib/auth/client": dataModule(`export async function getUserId(){ return globalThis.__bayViewer ?? null; }`),
  "../../../lib/database": dataModule(`export async function uploadFile(){ return { ok: true, data: { file: { url: "https://cdn.example/cover.png" } } }; }`),
  "../../../lib/auth/config": dataModule(`
    export const GATEWAY_BASE = "https://api.test";
    export function cookieDomainFor(){ return ""; }
    export function isLeoDevPreviewHost(){ return true; }
  `),
  "../shell/bay-state": dataModule(`
    globalThis.__bayOpened ??= [];
    export function openBay(target){ globalThis.__bayOpened.push(target); }
    export function replaceBay(target){ globalThis.__bayOpened.push(target); }
    export function requireBayLogin(){ return globalThis.__baySignedIn !== false; }
    export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
    export function useBayEnabled(){ return globalThis.__bayEnabled !== false; }
    export function setBayFilter(){}
    export function bayBack(){}
  `),
  "../deal": dataModule(`export async function openTradeThread(){} export function DealConversationView(){ return null; }`),
  "../shell/BayMine": dataModule(`
    export function BaySignInPrompt({ text }){ return globalThis.__w06React.createElement("p", { "data-bay-sign-in": "" }, text); }
    export function BayMine(){ return null; }
  `),
  "../needs/LibraryWorkPicker": dataModule(`export async function pickLibraryWork(){ return null; }`),
};
const { ProfileDetailView } = await import(await compileModule("src/shell/bay/supply/ProfilePane.tsx", profileStubs));

function publicPage(extra = {}) {
  const profile = {
    user_id: "seller-1",
    handle: "leo",
    display_name: "Leo",
    avatar_url: null,
    headline: "十年品牌设计",
    bio: "只做品牌",
    skills: ["Logo"],
    languages: ["中文"],
    categories: ["design"],
    rating_avg: 4.8,
    rating_count: 10,
    published: true,
    official: false,
    page_doc: null,
    ...(extra.profile || {}),
  };
  return { profile, services: [], showcase: [], reviews: [] };
}

function ownPage(extra = {}) {
  const page = publicPage({ ...extra, profile: { page_doc: defaultPageDoc({ display_name: "Leo", bio: "只做品牌" }), ...(extra.profile || {}) } });
  page.own = true;
  page.seller = {
    handle: page.profile.handle,
    display_name: page.profile.display_name,
    avatar_url: null,
    headline: page.profile.headline || "",
    bio: page.profile.bio || "",
    categories: page.profile.categories || [],
    skills: page.profile.skills || [],
    languages: page.profile.languages || [],
    published: page.profile.published !== false,
  };
  return page;
}

const VETTING_MINE = {
  credentials: [{ id: "c1", domain: "tax", state: "pending", source: "官网", checked_at: null, expires_at: null, recheck_due_at: null }],
  decisions: [{ id: "d1", service_id: null, verdict: "reject", reason_code: "x", reason_zh: "编号查不到", actor: "auto", appealed: false, created_at: null }],
  recheck_days: 180,
};

function resetEnv(extra = {}) {
  drainEditRequests();
  scrollCalls.length = 0;
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = (method, path) => (path === "/v1/talent/vetting/mine" ? VETTING_MINE : {});
  globalThis.__bayOpened = [];
  globalThis.__baySignedIn = true;
  globalThis.__bayEnabled = true;
  globalThis.__bayViewer = "seller-1";
  globalThis.__bayAuthedCalls = [];
  Object.assign(globalThis, extra);
}

const h = React.createElement;
const vettingCalls = () => globalThis.__bayHttpCalls.filter((call) => call.path === "/v1/talent/vetting/mine");

test("本人编辑主页：画布卡之后有「资质核验」白卡，里面是提交表单、进度和判定", async () => {
  resetEnv();
  const view = await mount(h(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  assert.equal(view.host.querySelector("[data-bay-mine-vetting]"), null, "没进编辑前没有这一块");
  await view.click('[data-bay-page-action="edit"]');
  const block = view.host.querySelector("[data-bay-mine-vetting]");
  assert.ok(block, "编辑状态里有资质核验");
  const card = block.querySelector("[data-bay-vetting]");
  assert.ok(card);
  assert.match(card.className, /\bbg-white\b/);
  assert.match(card.className, /\brounded-xl\b/);
  assert.match(card.className, /\bborder\b/);
  assert.equal(card.querySelector("h2")?.textContent, "资质核验");
  assert.equal(card.getAttribute("aria-labelledby"), card.querySelector("h2").id);
  assert.match(card.textContent, /这一块只有你自己看得到/);
  // 排在主页画布卡之后，同一个滚动容器里。
  const canvasCard = view.host.querySelector("[data-bay-page-canvas-card]");
  assert.ok(canvasCard);
  assert.ok(canvasCard.compareDocumentPosition(block) & window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(block.parentElement, view.host.querySelector("[data-bay-page-canvas]"));
  // 表单与结果都在（原 BayVettingSection 的钩子都还在）。
  assert.ok(card.querySelector('[data-bay-reveal-item="domain"]'));
  assert.ok(card.querySelector('[data-bay-reveal-item="credential_no"]'));
  assert.ok(card.querySelector("[data-bay-submit-vetting]"));
  assert.ok(card.querySelector('[data-bay-credential="c1"]'));
  assert.ok(card.querySelector('[data-bay-decision="d1"]'));
  assert.ok(card.querySelector('[data-bay-appeal="d1"]'));
  assert.equal(vettingCalls().length, 1);
  await view.unmount();
});

test("出现条件：只有本人、编辑状态、已登录、LeoBay 开着；其余一律没有，也不发核验请求", async () => {
  // 别人的主页：没有编辑，更没有核验。
  resetEnv({ __bayViewer: "buyer-1" });
  let view = await mount(h(ProfileDetailView, { page: publicPage(), viewerId: "buyer-1" }));
  assert.equal(view.host.querySelector("[data-bay-page-action=\"edit\"]"), null);
  assert.equal(view.host.querySelector("[data-bay-mine-vetting]"), null);
  assert.equal(view.host.querySelector("[data-bay-vetting]"), null);
  await view.unmount();

  // 本人但没进编辑：只是主页。
  resetEnv();
  view = await mount(h(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  assert.equal(view.host.querySelector("[data-bay-vetting]"), null);
  await view.unmount();

  // 本人编辑，但没登录：不出现。
  resetEnv({ __baySignedIn: false });
  view = await mount(h(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  await view.click('[data-bay-page-action="edit"]');
  assert.ok(view.host.querySelector("[data-bay-page-editor]"));
  assert.equal(view.host.querySelector("[data-bay-mine-vetting]"), null);
  await view.unmount();

  // 本人编辑，但 LeoBay 关着（境内）：不出现。
  resetEnv({ __bayEnabled: false });
  view = await mount(h(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  await view.click('[data-bay-page-action="edit"]');
  assert.ok(view.host.querySelector("[data-bay-page-editor]"));
  assert.equal(view.host.querySelector("[data-bay-mine-vetting]"), null);
  await view.unmount();

  assert.equal(vettingCalls().length, 0, "不该出现的时候连核验接口都不碰");
});

test("入口 vetting：直接进编辑并滚到核验卡（焦点也落在那里）；请求被取走", async () => {
  resetEnv();
  edit.requestMinePageEdit("vetting");
  const view = await mount(h(ProfileDetailView, { page: ownPage({ profile: { published: false } }), viewerId: "seller-1" }));
  await frames();
  assert.ok(view.host.querySelector("[data-bay-page-editor]"), "直接进编辑态");
  const block = view.host.querySelector("[data-bay-mine-vetting]");
  assert.ok(block);
  assert.equal(scrollCalls.length, 1);
  assert.equal(scrollCalls[0].el, block);
  assert.equal(scrollCalls[0].options.block, "start");
  assert.equal(document.activeElement, block, "键盘 / 读屏的人也落在这一块");
  assert.equal(edit.takeMinePageEdit(), false, "请求只用一次");
  await view.unmount();
});

test("入口 vetting：卡刚挂上只有一行「正在加载」滚不到位，数据读完、卡长高之后再对齐一次", async () => {
  resetEnv();
  let release;
  globalThis.__bayHttpRespond = (method, path) =>
    path === "/v1/talent/vetting/mine"
      ? new Promise((resolve) => {
          release = () => resolve(VETTING_MINE);
        })
      : {};
  edit.requestMinePageEdit("vetting");
  const view = await mount(h(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  await frames();
  assert.equal(scrollCalls.length, 1, "先滚一次");
  assert.equal(view.host.querySelector("[data-bay-vetting]").getAttribute("aria-busy"), "true", "这时卡还在加载");
  release();
  await frames();
  assert.equal(view.host.querySelector("[data-bay-vetting]").getAttribute("aria-busy"), null);
  assert.equal(scrollCalls.length, 2, "读完后再对齐一次");
  assert.equal(scrollCalls[1].el, view.host.querySelector("[data-bay-mine-vetting]"));
  await view.unmount();
});

test("旧的无参调用：已公开主页的人（I-8 去核验）滚过去；没公开的人（去建资料）从顶上开始", async () => {
  resetEnv();
  edit.requestMinePageEdit();
  let view = await mount(h(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  await frames();
  assert.ok(view.host.querySelector("[data-bay-page-editor]"));
  assert.equal(scrollCalls.length, 1, "已公开：落在核验卡");
  await view.unmount();

  resetEnv();
  edit.requestMinePageEdit();
  view = await mount(h(ProfileDetailView, { page: ownPage({ profile: { published: false } }), viewerId: "seller-1" }));
  await frames();
  assert.ok(view.host.querySelector("[data-bay-page-editor]"), "「去建资料」也直接进编辑");
  assert.ok(view.host.querySelector("[data-bay-mine-vetting]"), "核验卡在，只是不抢着滚过去");
  assert.equal(scrollCalls.length, 0);
  await view.unmount();
});

test("没有请求时点「编辑主页」进编辑不滚；别人的主页不会取走别人的请求", async () => {
  resetEnv();
  let view = await mount(h(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  await view.click('[data-bay-page-action="edit"]');
  await frames();
  assert.equal(scrollCalls.length, 0);
  await view.unmount();

  resetEnv({ __bayViewer: "buyer-1" });
  edit.requestMinePageEdit("vetting");
  view = await mount(h(ProfileDetailView, { page: publicPage(), viewerId: "buyer-1" }));
  assert.equal(view.host.querySelector("[data-bay-page-editor]"), null, "别人的主页不进编辑");
  assert.deepEqual(edit.takeMinePageEditRequest(), { focus: "vetting" }, "请求留给我自己的主页");
  await view.unmount();
});

test("主页已经开着时再点「去核验」：当场进编辑并滚过去；取消后手动进编辑不再滚", async () => {
  resetEnv();
  const view = await mount(h(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  assert.equal(view.host.querySelector("[data-bay-page-editor]"), null);
  await act(async () => {
    edit.requestMinePageEdit("vetting");
  });
  await frames();
  assert.ok(view.host.querySelector("[data-bay-page-editor]"), "页面挂着时请求立刻生效");
  assert.equal(scrollCalls.length, 1);
  assert.equal(edit.takeMinePageEdit(), false, "请求没有遗留到下一次打开");

  await act(async () => {
    edit.requestMinePageEdit("vetting");
  });
  await frames();
  assert.equal(scrollCalls.length, 2, "已经在编辑里再点一次，还是会滚过去");

  await view.click('[data-bay-page-action="cancel"]');
  assert.equal(view.host.querySelector("[data-bay-page-editor]"), null);
  await view.click('[data-bay-page-action="edit"]');
  await frames();
  assert.equal(scrollCalls.length, 2, "手动「编辑主页」不带入口，不滚");
  await view.unmount();
});

test("白色只用在分隔的卡上：我的主页坐一张卡，编辑是主题栏卡 + 画布卡 + 核验卡，别人的主页不套卡", async () => {
  resetEnv();
  let view = await mount(h(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  const card = view.host.querySelector("[data-bay-profile-card]");
  assert.ok(card, "本人的主页坐在一张卡里");
  assert.match(card.className, /\brounded-xl\b/);
  assert.match(card.className, /\bborder\b/);
  assert.ok(card.querySelector('[data-bay-pane="profile"]'));
  const view1 = view.host.querySelector("[data-bay-profile]");
  assert.doesNotMatch(view1.className, /bg-white/, "外框不铺白底");

  await view.click('[data-bay-page-action="edit"]');
  const editor = view.host.querySelector("[data-bay-page-editor]");
  const toolbar = view.host.querySelector("[data-bay-page-toolbar]");
  const canvas = view.host.querySelector("[data-bay-page-canvas]");
  const canvasCard = view.host.querySelector("[data-bay-page-canvas-card]");
  assert.doesNotMatch(editor.className, /bg-white/);
  assert.doesNotMatch(canvas.className, /bg-white/, "滚动容器不是白板");
  for (const node of [toolbar, canvasCard]) {
    assert.match(node.className, /\brounded-xl\b/);
    assert.match(node.className, /\bborder\b/);
  }
  assert.doesNotMatch(toolbar.className, /\bborder-b\b/, "主题栏是一张卡，不是贯穿整页的横条");
  await view.unmount();

  resetEnv({ __bayViewer: "buyer-1" });
  view = await mount(h(ProfileDetailView, { page: publicPage(), viewerId: "buyer-1" }));
  assert.equal(view.host.querySelector("[data-bay-profile-card]"), null, "别人的主页是他自己的版面，不再套卡");
  await view.unmount();
});

test("核验卡里提交走原来的接口；提交之后重读不把卡塌成「正在加载」", async () => {
  resetEnv();
  let secondRead;
  let reads = 0;
  globalThis.__bayHttpRespond = (method, path) => {
    if (path === "/v1/talent/vetting/mine") {
      reads += 1;
      if (reads === 2) return new Promise((resolve) => { secondRead = resolve; });
      return VETTING_MINE;
    }
    return { verification_id: "v1", credential: VETTING_MINE.credentials[0] };
  };
  const view = await mount(h(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  await view.click('[data-bay-page-action="edit"]');

  // 什么都没填就提交：本地挡住，不发请求。
  await view.click("[data-bay-submit-vetting]");
  assert.match(view.host.querySelector("[data-bay-vetting]").textContent, /请把领域、种类、编号和查验来源都填上。/);
  assert.equal(globalThis.__bayHttpCalls.filter((call) => call.path === "/v1/talent/vetting/submit").length, 0);

  const setValue = async (field, value) => {
    const row = view.host.querySelector(`[data-bay-reveal-item="${field}"]`);
    if (!row.hasAttribute("data-bay-reveal-open")) await view.click(row);
    const input = view.host.querySelector(`[data-bay-field="${field}"]`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  await setValue("credential_no", "A-123");
  await setValue("source", "学信网");
  await view.click("[data-bay-submit-vetting]");
  const submit = globalThis.__bayHttpCalls.find((call) => call.path === "/v1/talent/vetting/submit");
  assert.ok(submit, "提交走 /v1/talent/vetting/submit");
  assert.equal(submit.body.credential_no, "A-123");
  assert.equal(submit.body.source, "学信网");
  // 第二次读取还没回来：卡还在，没有塌成加载态。
  const card = view.host.querySelector("[data-bay-vetting]");
  assert.ok(card.querySelector("[data-bay-submit-vetting]"), "重读期间表单还在");
  assert.equal(card.getAttribute("aria-busy"), null);
  secondRead(VETTING_MINE);
  await flush();
  assert.ok(view.host.querySelector('[data-bay-credential="c1"]'));
  await view.unmount();
});

// ---------------------------------------------------------------------------------------
// ② 交易会话系统消息改指
// ---------------------------------------------------------------------------------------
const lines = await import("../src/shell/bay/deal/deal-lines.ts");

test("系统消息：等级变化 → 我的主页，核验被拒 / 到期 → 我的主页的核验块；不再有 settings 目标", () => {
  const level = lines.resolveDealLine(fakeTT, { meta: { event: "level.changed" } });
  assert.deepEqual(level.action, { kind: "my-page", label: "查看我的主页", target: { kind: "my-page" } });

  for (const event of ["vetting.rejected", "vetting.credential_expired"]) {
    const row = lines.resolveDealLine(fakeTT, { meta: { event } });
    assert.deepEqual(row.action, { kind: "my-vetting", label: "查看资质核验", target: { kind: "my-vetting" } }, event);
  }

  const kinds = new Set(Object.values(lines.DEAL_LINE_ACTIONS).filter(Boolean));
  assert.deepEqual([...kinds].sort(), ["demand", "help", "my-page", "my-vetting", "order", "project"]);
  for (const kind of kinds) assert.ok(lines.dealActionLabel(fakeTT, kind), `${kind} 有按钮文字`);

  const source = read("src/shell/bay/deal/deal-lines.ts");
  assert.doesNotMatch(source, /kind:\s*"settings"/);
  assert.doesNotMatch(source, /settings-profile|settings-vetting/);
  assert.match(source, /\{ kind: "my-page" \}/);
  assert.match(source, /\{ kind: "my-vetting" \}/);
});

test("系统消息文案里不再用「服务」当种类名：核验相关两句写「人工服务」", () => {
  assert.equal(lines.dealLineText(fakeTT, "vetting.rejected"), "这条人工服务没有通过资质核验，可以查看理由并申诉一次。");
  assert.equal(lines.dealLineText(fakeTT, "vetting.credential_expired"), "资质核验已到期，相关人工服务已转回草稿。");
});

const actionCalls = [];
globalThis.__w06Calls = actionCalls;
const { runDealLineAction } = await import(
  await compileModule("src/shell/bay/deal/deal-actions.ts", {
    "../../messages/host-state": dataModule(`export function openMessages(arg){ globalThis.__w06Calls.push(["openMessages", arg]); }`),
    "../page/mine-page-edit": dataModule(`export function requestMinePageEdit(focus){ globalThis.__w06Calls.push(["requestMinePageEdit", focus]); }`),
    "../shell/bay-state": dataModule(`export function openBay(target){ globalThis.__w06Calls.push(["openBay", target]); }`),
  })
);

test("点系统消息上的按钮：我的主页直接打开；核验先记下入口再打开我的主页；其余照旧", () => {
  actionCalls.length = 0;
  runDealLineAction({ kind: "my-page" });
  assert.deepEqual(actionCalls, [["openBay", { kind: "mine", tab: "page" }]], "查看我的主页不带编辑入口");

  actionCalls.length = 0;
  runDealLineAction({ kind: "my-vetting" });
  assert.deepEqual(actionCalls, [
    ["requestMinePageEdit", "vetting"],
    ["openBay", { kind: "mine", tab: "page" }],
  ], "I-8：先请求编辑 + 核验入口，再打开我的主页");

  actionCalls.length = 0;
  runDealLineAction({ kind: "order", id: "c1" });
  runDealLineAction({ kind: "demand", id: "d1" });
  runDealLineAction({ kind: "help", id: "h1" });
  runDealLineAction({ kind: "project", conversationId: "conv-1" });
  assert.deepEqual(actionCalls, [
    ["openBay", { kind: "order", id: "c1" }],
    ["openBay", { kind: "demand", id: "d1" }],
    ["openBay", { kind: "help", id: "h1" }],
    ["openMessages", { conversationId: "conv-1" }],
  ]);

  const source = read("src/shell/bay/deal/deal-actions.ts");
  assert.doesNotMatch(source, /openBaySettings|from "\.\.\/settings"/, "不再进设置窗");
});

// ---------------------------------------------------------------------------------------
// ③ 设置 → 账户 → 用 OceanLeo 账号登录的应用
// ---------------------------------------------------------------------------------------
test("账户子页 id 与地址：connected-apps 是第五个子页，写出 /settings/account/connected-apps，左栏仍是账户", () => {
  assert.deepEqual([...tabs.ACCOUNT_SETTINGS_VIEWS], ["home", "sign-in-methods", "login-devices", "connected-apps", "security"]);
  const href = "https://oceanleo.com/settings/account/connected-apps";
  assert.equal(tabs.accountSettingsView(href), "connected-apps");
  assert.equal(tabs.accountSettingsPath("connected-apps", "https://oceanleo.com/"), "/settings/account/connected-apps");
  assert.equal(tabs.accountSettingsPath("connected-apps", "https://oceanleo.com/?x=1"), "/settings/account/connected-apps?x=1");
  assert.equal(tabs.settingsPath("account/connected-apps", "https://oceanleo.com/"), "/settings/account/connected-apps");
  assert.equal(tabs.settingsPath("account", href), "/settings/account/connected-apps", "规范化 account 时保留当前子页");
  assert.equal(tabs.isSettingsPathname("/settings/account/connected-apps"), true);
  assert.equal(tabs.tabFromSettingsLocation(href), "account");
  // 旧的三个子页不受影响。
  assert.equal(tabs.accountSettingsView("https://oceanleo.com/settings/account/login-devices"), "login-devices");
  assert.equal(tabs.accountSettingsView("https://oceanleo.com/settings/account/security"), "security");
  assert.equal(tabs.accountSettingsView("https://oceanleo.com/settings/account/no-such-page"), "home");
});

const accountHomeStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../ui": dataModule(`export function ConfirmDialog(){ return null; } export function Modal(){ return null; }`),
  "../../../lib/auth": dataModule(`export async function signOutEverywhere(){}`),
  "../../../lib/auth/account-identity": dataModule(`
    export async function updateDisplayName(){ return {}; }
    export async function updateAvatar(){ return {}; }
    export async function requestEmailChange(){ return {}; }
    export async function verifyEmailChange(){ return {}; }
    export async function completeEmailChange(){ return {}; }
    export async function deleteOceanLeoAccount(){ return {}; }
  `),
};
const { AccountHome } = await import(await compileModule("src/pages/settings/account/AccountHome.tsx", accountHomeStubs));

const homeProfile = {
  userId: "user-1",
  displayName: "Ada",
  sessionContact: { kind: "email", value: "ada@example.com", provider: "email" },
  identities: [],
  deviceLabels: {},
};

test("账户首页多一行「用 OceanLeo 账号登录的应用」：在已连接的设备之后、删除账户之前，点「管理」进子页", async () => {
  const opened = [];
  const view = await mount(
    h(AccountHome, {
      profile: homeProfile,
      credits: 1,
      currency: "CNY",
      onOpenConnectedApps: () => opened.push("connected-apps"),
      onOpenDevices: () => opened.push("devices"),
    }),
  );
  const button = view.host.querySelector("[data-account-open-connected-apps]");
  assert.ok(button, "有进子页的按钮");
  assert.equal(button.textContent, "管理");
  const row = button.parentElement;
  assert.match(row.textContent, /用 OceanLeo 账号登录的应用/);
  assert.match(row.textContent, /查看你授权过的应用，随时可以撤回。/);
  const devices = view.host.querySelector("[data-account-open-devices]").parentElement;
  const del = view.host.querySelector("[data-account-delete]").parentElement;
  assert.ok(devices.compareDocumentPosition(row) & window.Node.DOCUMENT_POSITION_FOLLOWING, "在已连接的设备之后");
  assert.ok(row.compareDocumentPosition(del) & window.Node.DOCUMENT_POSITION_FOLLOWING, "在删除账户之前");
  await view.click(button);
  assert.deepEqual(opened, ["connected-apps"]);
  await view.unmount();
});

const sectionStubs = {
  "../../AccountSecurityPage": dataModule(`
    export function AccountSecurityPage(){ return globalThis.__w06React.createElement("div", { "data-stub": "security" }); }
  `),
  "../account/AccountHome": dataModule(`
    const R = globalThis.__w06React;
    export default function AccountHome(props){
      globalThis.__w06HomeProps = props;
      return R.createElement("div", { "data-stub": "home" }, R.createElement("button", { "data-open-connected": "", onClick: props.onOpenConnectedApps }, "x"));
    }
  `),
  "../account/ConnectedAppsPage": dataModule(`export default function ConnectedAppsPage(){ return globalThis.__w06React.createElement("div", { "data-stub": "connected-apps" }); }`),
  "../account/LoginDevicesPage": dataModule(`export default function LoginDevicesPage(){ return globalThis.__w06React.createElement("div", { "data-stub": "login-devices" }); }`),
  "../account/SignInMethodsPage": dataModule(`export default function SignInMethodsPage(){ return globalThis.__w06React.createElement("div", { "data-stub": "sign-in-methods" }); }`),
};
const { AccountSection } = await import(await compileModule("src/pages/settings/sections/AccountSection.tsx", sectionStubs));

test("AccountSection：view=connected-apps 挂子页；首页把 onOpenConnectedApps 交给账户首页", async () => {
  let view = await mount(h(AccountSection, { email: "ada@example.com", view: "connected-apps" }));
  const pane = view.host.querySelector('[data-settings-pane="account"][data-account-view="connected-apps"]');
  assert.ok(pane);
  assert.ok(pane.querySelector('[data-stub="connected-apps"]'));
  assert.equal(view.host.querySelector('[data-stub="home"]'), null);
  await view.unmount();

  const calls = [];
  view = await mount(h(AccountSection, { email: "ada@example.com", view: "home", onOpenConnectedApps: () => calls.push("go") }));
  assert.equal(typeof globalThis.__w06HomeProps.onOpenConnectedApps, "function");
  await view.click("[data-open-connected]");
  assert.deepEqual(calls, ["go"]);
  await view.unmount();
});

// 设置窗整体：从账户首页点进子页，地址、标题、返回键。
const hubAuth = dataModule(`
  const s = () => globalThis.__w06Auth;
  export function oceanleoConfigured() { return true; }
  export function browserClient() { return { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }; }
  export async function getUserEmail() { return s().email; }
  export async function getUserId() { return "user-1"; }
  export async function getCredits() { return { ok: true, data: { balance_yuan: 12.5 } }; }
  export async function getCreditHistory() { return { ok: true, data: { events: [] } }; }
  export async function getUsageBySite() { return { ok: true, data: { total: { requests: 3 } } }; }
  export async function getAccountProfile() {
    return { profile: { userId: "user-1", displayName: "Ada", sessionContact: { kind: "email", value: s().email, provider: "email" }, identities: [], deviceLabels: {} } };
  }
  export function loginUnavailableNotice() { return null; }
  export function isPasswordResetLanding() { return false; }
`);
const hubPane = (exportName) => dataModule(`export function ${exportName}() { return null; }`);
const hubUrl = await compileModule("src/pages/settings/SettingsHub.tsx", {
  "../../lib/auth": hubAuth,
  "../../ui": dataModule(`export function ConfirmDialog(){ return null; } export function Modal(){ return null; } export function ButtonSpinner(){ return null; }`),
  "../../i18n/ui/useUI": uiStub,
  "../AuthDialog": hubPane("AuthPanel"),
  "../PasswordResetPage": hubPane("PasswordResetPage"),
  "../ApiPage": hubPane("ApiPage"),
  "../DevicesPage": hubPane("DevicesPage"),
  "../PluginsPage": hubPane("PluginsPage"),
  "./personalization/PersonalizationSection": hubPane("PersonalizationSection"),
  "./mail/MailSection": hubPane("MailSection"),
  "./sections/GeneralSection": hubPane("GeneralSection"),
  "./sections/AutomationSettingsSection": hubPane("AutomationSettingsSection"),
  "./sections/BillingSection": hubPane("BillingSection"),
  "./sections/MessagesSection": hubPane("MessagesSection"),
  "./sections/OrgSection": hubPane("OrgSection"),
  "../../shell/bay/settings": hubPane("BaySettingsSection"),
  "../../shell/bay/shell/bay-state": dataModule(`export function bayEnabledHere(){ return true; }`),
  "../../shell/messages/messages-family": dataModule(`export function imEnabledFor(){ return false; }`),
  "../AccountSecurityPage": dataModule(`export function AccountSecurityPage(){ return null; }`),
  "../account/AccountHome": dataModule(`
    const R = globalThis.__w06React;
    export default function AccountHome(props){
      return R.createElement("div", { "data-account-home": "" }, R.createElement("button", { "data-open-connected": "", onClick: props.onOpenConnectedApps }, "go"));
    }
  `),
  "../account/ConnectedAppsPage": dataModule(`export default function ConnectedAppsPage(){ return globalThis.__w06React.createElement("div", { "data-connected-apps-stub": "" }, "apps"); }`),
  "../account/LoginDevicesPage": dataModule(`export default function LoginDevicesPage(){ return null; }`),
  "../account/SignInMethodsPage": dataModule(`export default function SignInMethodsPage(){ return null; }`),
});
const { SettingsHub } = await import(hubUrl);

async function renderHub(pathname) {
  globalThis.__w06Auth = { email: "ada@example.com" };
  window.history.replaceState(null, "", pathname);
  return mount(h(SettingsHub, { defaultTab: "account" }));
}

test("设置窗：账户首页点进子页，地址写成 /settings/account/connected-apps，标题是行名，返回键回账户首页，左栏仍是账户", async () => {
  const view = await renderHub("/settings/account");
  assert.ok(view.host.querySelector("[data-account-home]"));
  await view.click("[data-open-connected]");
  assert.equal(window.location.pathname, "/settings/account/connected-apps");
  assert.ok(view.host.querySelector("[data-connected-apps-stub]"), "子页挂上了");
  assert.equal(view.host.querySelector("[data-settings-pane-title]").textContent, "用 OceanLeo 账号登录的应用");
  assert.equal(view.host.querySelector("[data-settings-item=account]").getAttribute("aria-current"), "page");
  assert.equal(view.host.querySelector("[data-settings-item=connected-apps]"), null, "子页不占左栏");
  const back = view.host.querySelector("[data-settings-back]");
  assert.ok(back);
  await view.click(back);
  assert.equal(window.location.pathname, "/settings/account");
  assert.ok(view.host.querySelector("[data-account-home]"));
  await view.unmount();
});

test("设置窗：直接打开 /settings/account/connected-apps 就是那个子页", async () => {
  const view = await renderHub("/settings/account/connected-apps");
  assert.ok(view.host.querySelector("[data-connected-apps-stub]"));
  assert.equal(view.host.querySelector("[data-settings-pane-title]").textContent, "用 OceanLeo 账号登录的应用");
  await view.unmount();
});

// 子页本体：列表、时间、撤回二次确认、空态、出错。
const grantsState = {
  items: [
    { app_id: "app-a", app_title: "记账助手", app_url_host: "ledger.example.com", cover_url: null, first_at: "2026-09-01T08:00:00Z", last_at: "2026-10-20T10:30:00Z" },
    { app_id: "app-b", app_title: "<img src=x>", app_url_host: "tool.example.org", cover_url: null, first_at: "2026-10-01T08:00:00Z", last_at: null },
  ],
};
globalThis.__w06Grants = { calls: [] };
const grantsHttp = dataModule(`
  export class BayApiError extends Error { constructor(message, status){ super(message); this.status = status; } }
  async function reply(method, path) {
    globalThis.__w06Grants.calls.push({ method, path });
    return globalThis.__w06Grants.respond(method, path);
  }
  export const bayGet = (path) => reply("GET", path);
  export const bayPost = (path) => reply("POST", path);
  export const bayPatch = (path) => reply("PATCH", path);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const { ConnectedAppsPage } = await import(
  await compileModule("src/pages/settings/account/ConnectedAppsPage.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../../../lib/bay/http": grantsHttp,
    "../shell/bay-state": dataModule(`
      globalThis.__w06Opened ??= [];
      export function openBay(target){ globalThis.__w06Opened.push(target); }
      export function useBayEnabled(){ return globalThis.__w06BayOn !== false; }
    `),
  })
);

function resetGrants(items = grantsState.items, patch = {}) {
  globalThis.__w06Grants.calls = [];
  globalThis.__w06Opened = [];
  globalThis.__w06BayOn = true;
  globalThis.__w06Grants.respond = async (method) => {
    if (method === "GET") return { items: items.map((item) => ({ ...item })) };
    return { ok: true };
  };
  Object.assign(globalThis.__w06Grants, patch);
}

test("子页：列表、首次 / 最近登录时间、应用名当纯文字；境外名字可点进详情", async () => {
  resetGrants();
  const view = await mount(h(ConnectedAppsPage));
  assert.ok(view.host.querySelector("[data-connected-apps]"));
  const rows = view.host.querySelectorAll("[data-bay-login-grant]");
  assert.equal(rows.length, 2);
  const first = rows[0];
  assert.match(first.textContent, /记账助手/);
  assert.match(first.textContent, /ledger\.example\.com/);
  assert.match(first.textContent, /首次 /);
  assert.match(first.textContent, /最近 /);
  assert.equal(rows[1].textContent.includes("最近 "), false, "没有最近时间就不画");
  assert.ok(rows[1].textContent.includes("<img src=x>"), "标题当纯文字");
  assert.equal(rows[1].querySelector("img"), null);
  assert.equal(globalThis.__w06Grants.calls[0].path, "/v1/bay/app-login/mine/grants");

  await view.click("[data-bay-login-grant-open]");
  assert.deepEqual(globalThis.__w06Opened, [{ kind: "app", id: "app-a" }]);
  await view.unmount();
});

test("子页：境内（LeoBay 关）应用名只是文字，不放点了没反应的按钮；列表照样读得到", async () => {
  resetGrants();
  globalThis.__w06BayOn = false;
  const view = await mount(h(ConnectedAppsPage));
  assert.equal(view.host.querySelectorAll("[data-bay-login-grant]").length, 2);
  assert.equal(view.host.querySelector("[data-bay-login-grant-open]"), null);
  assert.ok(view.host.querySelector("[data-bay-login-revoke]"), "撤回两版都有");
  await view.unmount();
});

test("撤回要二次确认：先问，取消什么都不发；确认才 DELETE，这一行消失，别的行还在，不重读整张表", async () => {
  resetGrants();
  const view = await mount(h(ConnectedAppsPage));
  const readsBefore = globalThis.__w06Grants.calls.length;
  await view.click('[data-bay-login-grant="app-a"] [data-bay-login-revoke]');
  const ask = view.host.querySelector('[data-bay-login-revoke-confirm="app-a"]');
  assert.ok(ask, "出现确认");
  assert.match(ask.textContent, /撤回后这个应用要再让你同意一次才能登录/);
  assert.equal(globalThis.__w06Grants.calls.filter((call) => call.method === "DELETE").length, 0, "还没确认，不发请求");
  assert.equal(view.host.querySelector('[data-bay-login-grant="app-a"] [data-bay-login-revoke]'), null, "确认时原按钮让位");

  await view.click("[data-bay-login-revoke-cancel]");
  assert.equal(view.host.querySelector("[data-bay-login-revoke-confirm]"), null);
  assert.equal(globalThis.__w06Grants.calls.filter((call) => call.method === "DELETE").length, 0);

  await view.click('[data-bay-login-grant="app-a"] [data-bay-login-revoke]');
  await view.click("[data-bay-login-revoke-yes]");
  const deletes = globalThis.__w06Grants.calls.filter((call) => call.method === "DELETE");
  assert.deepEqual(deletes, [{ method: "DELETE", path: "/v1/bay/app-login/mine/grants/app-a" }]);
  assert.equal(view.host.querySelector('[data-bay-login-grant="app-a"]'), null);
  assert.ok(view.host.querySelector('[data-bay-login-grant="app-b"]'));
  assert.equal(globalThis.__w06Grants.calls.length, readsBefore + 1, "撤回之后不重读整张列表");

  // 撤回最后一个 -> 空态。
  await view.click('[data-bay-login-grant="app-b"] [data-bay-login-revoke]');
  await view.click("[data-bay-login-revoke-yes]");
  assert.ok(view.host.querySelector("[data-bay-login-grants-empty]"));
  await view.unmount();
});

test("撤回失败：留在确认面板里说明，这一行不消失，可以再试", async () => {
  resetGrants();
  globalThis.__w06Grants.respond = async (method) => {
    if (method === "GET") return { items: grantsState.items.map((item) => ({ ...item })) };
    throw new Error("");
  };
  const view = await mount(h(ConnectedAppsPage));
  await view.click('[data-bay-login-grant="app-a"] [data-bay-login-revoke]');
  await view.click("[data-bay-login-revoke-yes]");
  const ask = view.host.querySelector('[data-bay-login-revoke-confirm="app-a"]');
  assert.ok(ask, "面板还在");
  assert.match(ask.textContent, /没撤回成功，请稍后再试。/);
  assert.ok(view.host.querySelector('[data-bay-login-grant="app-a"]'));
  assert.equal(view.host.querySelector("[data-bay-login-revoke-yes]").disabled, false, "可以再点一次");
  await view.unmount();
});

test("空态一句话说明；读取失败给重试；未登录（401）说登录后查看", async () => {
  resetGrants([]);
  let view = await mount(h(ConnectedAppsPage));
  const empty = view.host.querySelector("[data-bay-login-grants-empty]");
  assert.ok(empty);
  assert.match(empty.textContent, /还没有应用用你的 OceanLeo 账号登录过/);
  assert.match(empty.textContent, /随时可以撤回/);
  assert.equal(view.host.querySelector("[data-bay-login-grant]"), null);
  await view.unmount();

  resetGrants();
  let failing = true;
  globalThis.__w06Grants.respond = async () => {
    if (failing) throw Object.assign(new Error("boom"), { status: 500 });
    return { items: grantsState.items.map((item) => ({ ...item })) };
  };
  view = await mount(h(ConnectedAppsPage));
  const error = view.host.querySelector("[data-bay-login-grants-error]");
  assert.ok(error);
  assert.match(error.textContent, /授权列表没读出来，请稍后点「重试」。/);
  assert.equal(error.textContent.includes("boom"), false, "不把服务端原文丢给用户");
  failing = false;
  await view.click(error.querySelector("button"));
  assert.equal(view.host.querySelectorAll("[data-bay-login-grant]").length, 2, "重试后读到列表");
  await view.unmount();

  resetGrants();
  globalThis.__w06Grants.respond = async () => {
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  };
  view = await mount(h(ConnectedAppsPage));
  assert.match(view.host.textContent, /登录后查看你授权过的应用/);
  await view.unmount();
});

// ---------------------------------------------------------------------------------------
// ④ 退役种类名 + 17 语
// ---------------------------------------------------------------------------------------
const BOUNDARY = [
  "src/shell/bay/page",
  "src/shell/bay/supply/ProfilePane.tsx",
  "src/shell/bay/seller/BayVettingSection.tsx",
  "src/shell/bay/deal/deal-lines.ts",
  "src/shell/bay/deal/deal-actions.ts",
  "src/shell/bay/applogin/MyAppLoginGrants.tsx",
  "src/pages/settings/account",
  "src/pages/settings/settings-tabs.ts",
];

function sourceFiles(rel) {
  const abs = path.join(REPO, rel);
  if (statSync(abs).isFile()) return [rel];
  return readdirSync(abs).flatMap((name) => sourceFiles(path.join(rel, name)));
}

/** 文件里所有 tt("…") 字面量的中文原文。 */
function ttLiterals(rel) {
  const text = read(rel);
  const file = ts.createSourceFile(rel, text, ts.ScriptTarget.ES2022, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tt" && node.arguments.length) {
      const first = node.arguments[0];
      if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) found.push(first.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** 指用户自己「我的库」里的作品（作品集），不是种类名，保留。 */
const LIBRARY_WORK_SENTENCES = new Set(["作品集", "还没有作品。从「我的库」挑进来。", "从我的库挑一件作品"]);

test("边界内用户看得见的句子不再用「服务 / 素材 / 作品 / 成品文件」当种类名", () => {
  const offenders = [];
  for (const rel of BOUNDARY.flatMap(sourceFiles).filter((file) => /\.(ts|tsx)$/.test(file))) {
    for (const sentence of ttLiterals(rel)) {
      if (LIBRARY_WORK_SENTENCES.has(sentence)) continue;
      // 「人工服务」是新种类名；「服务器」「服务条款」这类不是种类词。
      const rest = sentence.replace(/人工服务|服务器|服务条款/g, "");
      if (/服务|素材|作品|成品文件/.test(rest)) offenders.push(`${rel}: ${sentence}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("我的主页上的几句改写：官方现成文件、发布东西、还没有发布任何东西", () => {
  const page = read("src/shell/bay/page/ProfilePage.tsx");
  assert.match(page, /tt\("官方现成文件"\)/);
  assert.match(page, /tt\("逛官方现成文件"\)/);
  assert.match(page, /发布东西时也会自动公开/);
  assert.match(page, /tt\("还没有发布任何东西。"\)/);
  assert.doesNotMatch(page, /官方素材|商品或服务/);
});

const copy = await import("../src/i18n/ui/messages/lbp-w06-copy.ts");
const { LOCALES } = await import("../src/i18n/config.ts");

test("本表新文案 17 语齐全；zh 键等于值；非中日韩语种不夹汉字", () => {
  const zh = copy.LBP_W06_MESSAGES.zh;
  const keys = Object.keys(zh);
  assert.ok(keys.length >= 15, `只有 ${keys.length} 条`);
  for (const locale of LOCALES) {
    for (const key of keys) {
      const value = copy.LBP_W06_MESSAGES[locale][key];
      assert.ok(value && value.trim(), `${locale} 缺「${key}」`);
      if (locale === "zh") assert.equal(value, key);
      if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) {
        assert.equal(/[\u4e00-\u9fff]/.test(value), false, `${locale}「${key}」夹了汉字：${value}`);
      }
    }
  }
});

test("设置 → 账户：三处挂载点都是为 connected-apps 做的最小改动", () => {
  const hub = read("src/pages/settings/SettingsHub.tsx");
  const section = read("src/pages/settings/sections/AccountSection.tsx");
  assert.match(hub, /case "connected-apps":\s*\n\s*return "用 OceanLeo 账号登录的应用";/);
  assert.match(hub, /onOpenConnectedApps=\{\(\) => goAccountView\("connected-apps"\)\}/);
  assert.match(section, /import ConnectedAppsPage from "\.\.\/account\/ConnectedAppsPage";/);
  assert.match(section, /view === "connected-apps"/);
  assert.match(section, /data-account-view="connected-apps"/);
  assert.match(section, /onOpenConnectedApps=\{onOpenConnectedApps\}/);
});
