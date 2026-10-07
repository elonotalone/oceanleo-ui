// W04：求助、「叫真人」、我的求助；Dialog 不再默认「其他」；Status 链接去 Bay。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
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

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", { url: "https://design.oceanleo.com/bay" });
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
  export class BayApiError extends Error {
    constructor(message, status = 0, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function reply(method, path, body, opts) {
    globalThis.__bayHttpCalls.push({ method, path, body, opts });
    const responder = globalThis.__bayHttpRespond;
    const out = responder ? responder(method, path, body, opts) : {};
    if (out && out.__error) throw new BayApiError(out.__error.message, out.__error.status, out.__error.code);
    return out;
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
    return globalThis.__authedReply ?? { ok: true, data: { handoff: { id: "h-new" } } };
  }
  export async function listTasks() { return { ok: true, data: { items: [] } }; }
`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  globalThis.__bayLoginAsked ??= 0;
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function useBayTaskContext(){ return globalThis.__bayTask ?? null; }
  export function useBaySiteKey(){ return globalThis.__baySiteKey || "design"; }
  export function bayHrefOnSite(site, target){ return "https://" + site + ".oceanleo.test/bay?bay=" + target.kind + ":" + (target.id ?? ""); }
`);
const dealStub = dataModule(`
  globalThis.__bayThreads ??= [];
  export async function openTradeThread(subject){ globalThis.__bayThreads.push(subject); }
`);
const settingsStub = dataModule(`
  globalThis.__bayTermsAsked ??= [];
  globalThis.__baySettingsOpened ??= [];
  export async function ensureBayTerms(scope){ globalThis.__bayTermsAsked.push(scope); return globalThis.__bayTermsOk !== false; }
  export function openBaySettings(pane){ globalThis.__baySettingsOpened.push(pane); }
`);
const domainStub = dataModule(`
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function currentFamilySubsiteOrigin(label){ return ["slide", "design", "3d"].includes(label) ? "https://" + label + ".oceanleo.test" : undefined; }
  export function portalHref(path){ return "https://oceanleo.test" + path; }
`);
const toastStub = dataModule(`
  globalThis.__toasts ??= [];
  const api = { success(title){ globalThis.__toasts.push({ kind: "success", title }); }, error(){}, info(){} };
  export function useToast(){ return api; }
`);
const moneyStub = dataModule(`
  export function useLedgerCurrency(){ return "CNY"; }
  export function formatMoney(n, _c, d){ return d === 0 || Number.isInteger(n) ? "¥" + n : "¥" + n.toFixed(2); }
  export function ledgerCurrency(){ return "CNY"; }
`);
const pickerStub = dataModule(`
  export function LibraryWorkPickerHost(){ return null; }
  export async function pickLibraryWork(){
    globalThis.__bayPickAsked = (globalThis.__bayPickAsked || 0) + 1;
    return globalThis.__bayPicked ?? null;
  }
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

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../shell/bay-state": stateStub,
  "../deal": dealStub,
  "../settings": settingsStub,
  "../../../contracts/domain-family": domainStub,
  "../../../ui/Toast": toastStub,
  "../../../ui": uiBarrelStub,
  "../../../lib/money": moneyStub,
  "./LibraryWorkPicker": pickerStub,
};

const { CallHumanPane } = await import(await compileModule("src/shell/bay/needs/CallHumanPane.tsx", stubs));
const { HelpRequestPane } = await import(await compileModule("src/shell/bay/needs/HelpRequestPane.tsx", stubs));
const { MyHelpRequestsPane } = await import(await compileModule("src/shell/bay/needs/MyHelpRequestsPane.tsx", stubs));
const { MyNeedsPane } = await import(await compileModule("src/shell/bay/needs/MyNeedsPane.tsx", stubs));
const handoffCtx = await import(await compileModule("src/shell/bay/needs/handoff-context.tsx", stubs));
const talent = await import(await compileModule("src/api/talent-handoff.ts", { "../lib/agent": agentStub, "../lib/money": moneyStub }));

const CATEGORIES = {
  items: [],
  flat_items: [
    { slug: "design", name_zh: "设计与视觉", catalog_kind: "delivery", regulated_domain: "none", position: 10, published: true },
    { slug: "doc", name_zh: "文档与表格", catalog_kind: "delivery", regulated_domain: "none", position: 50, published: true },
    { slug: "other", name_zh: "其他", catalog_kind: "delivery", regulated_domain: "none", position: 160, published: true },
    { slug: "legal", name_zh: "法律咨询", catalog_kind: "consult", regulated_domain: "legal", position: 1100, published: true },
  ],
  total: 4,
  site_defaults: { design: "design", ppt: "doc", oceanleo: null },
};

function reset() {
  globalThis.__bayHttpCalls = [];
  globalThis.__authedCalls = [];
  globalThis.__authedReply = { ok: true, data: { handoff: { id: "h-new" } } };
  globalThis.__bayHttpRespond = (method, path, body) => {
    if (method === "GET" && path === "/v1/talent/categories") return CATEGORIES;
    if (method === "GET" && path === "/v1/talent/handoffs/h1") {
      return {
        handoff: {
          id: "h1",
          brief: "海报改一下层次",
          category: "design",
          budget_fen: 30000,
          currency: "CNY",
          mode: "open",
          state: "open",
          handling_site: "ppt",
          attached_work: { kind: "task", id: "t1", site_key: "ppt", title: "旧稿", preview_url: "/history?task=t1&view=readonly" },
          thread_id: null,
        },
      };
    }
    if (method === "GET" && path === "/v1/talent/handoffs/h1/context") {
      return { items: [{ kind: "message", ref: "7", preview: "只要封面", granted_at: "2026-10-01" }] };
    }
    if (method === "GET" && path === "/v1/talent/handoffs/mine?limit=40") {
      return { items: [{ id: "h1", brief: "海报改一下层次", category: "design", budget_fen: 0, state: "open", created_at: new Date().toISOString() }], next_cursor: null };
    }
    if (method === "POST" && path === "/v1/talent/handoffs") return { handoff: { id: "h-new", ...body } };
    if (method === "POST" && path === "/v1/talent/handoffs/h1/claim") return { handoff: { id: "h1", state: "claimed" }, thread_id: "th1" };
    return {};
  };
  globalThis.__bayOpened = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayTask = null;
  globalThis.__baySiteKey = "design";
  globalThis.__bayTermsAsked = [];
  globalThis.__bayTermsOk = true;
  globalThis.__baySettingsOpened = [];
  globalThis.__bayThreads = [];
  globalThis.__toasts = [];
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

function source(relative) {
  return readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), "utf8");
}

test("目标对不上时三窗格都不画", () => {
  const props = { target: { kind: "feed" }, layout: "docked", siteKey: "design" };
  assert.equal(renderToStaticMarkup(React.createElement(CallHumanPane, props)), "");
  assert.equal(renderToStaticMarkup(React.createElement(HelpRequestPane, props)), "");
  assert.equal(renderToStaticMarkup(React.createElement(MyHelpRequestsPane, props)), "");
});

test("叫真人：类目按站预选、门户为空、答疑不出现、默认不勾其他", async () => {
  reset();
  const view = await mount(React.createElement(CallHumanPane, { target: { kind: "call-human" }, layout: "docked", siteKey: "design" }));
  assert.equal(view.host.querySelector("header"), null);
  const selected = view.host.querySelector('[data-bay-category][aria-checked="true"]');
  assert.equal(selected?.getAttribute("data-bay-category"), "design");
  assert.equal(view.host.querySelector('[data-bay-category="legal"]'), null);
  assert.equal(view.host.querySelector('[data-bay-category="other"][aria-checked="true"]'), null);
  await view.unmount();

  reset();
  const portal = await mount(React.createElement(CallHumanPane, { target: { kind: "call-human" }, layout: "docked", siteKey: "oceanleo" }));
  assert.equal(portal.host.querySelector('[data-bay-category][aria-checked="true"]'), null);
  await portal.unmount();
});

test("叫真人：未登录点提交走登录；登录后请求体带 posted_site 与 attached_work，先过买家条款", async () => {
  reset();
  globalThis.__baySignedIn = false;
  const guest = await mount(React.createElement(CallHumanPane, { target: { kind: "call-human" }, layout: "docked", siteKey: "design" }));
  await guest.type("[data-bay-help-text]", "海报改一下层次和字号");
  await guest.click("[data-bay-submit]");
  assert.equal(globalThis.__bayLoginAsked, 1);
  assert.equal(globalThis.__bayHttpCalls.filter((call) => call.method === "POST").length, 0);
  await guest.unmount();

  reset();
  globalThis.__bayPicked = { kind: "task", id: "task-9" };
  const view = await mount(React.createElement(CallHumanPane, { target: { kind: "call-human" }, layout: "docked", siteKey: "design" }));
  await view.click("[data-bay-help-more]");
  await view.click("[data-bay-pick-work]");
  await view.type("[data-bay-help-text]", "海报改一下层次和字号");
  await view.click("[data-bay-submit]");
  assert.deepEqual(globalThis.__bayTermsAsked, ["buyer"]);
  const created = globalThis.__bayHttpCalls.find((call) => call.method === "POST" && call.path === "/v1/talent/handoffs");
  assert.ok(created);
  assert.equal(created.body.posted_site, "design");
  assert.deepEqual(created.body.attached_work, { kind: "task", id: "task-9" });
  assert.equal(created.body.origin_kind, "manual");
  assert.deepEqual(created.body.context, { messages: [], artifacts: [] });
  assert.deepEqual(globalThis.__bayOpened, [{ kind: "help", id: "h-new" }]);
  await view.unmount();
});

test("任务页叫真人：自动带当前任务，逐条勾选，默认一条都不勾", async () => {
  reset();
  globalThis.__bayTask = {
    taskId: "task-1",
    messages: [
      { id: 7, role: "user", kind: "text", content: "只要封面" },
      { id: 8, role: "assistant", kind: "text", content: "好的", meta: { artifact: { id: "art-1", title: "封面" } } },
    ],
  };
  const view = await mount(React.createElement(CallHumanPane, { target: { kind: "call-human" }, layout: "docked", siteKey: "design" }));
  assert.match(view.host.textContent, /当前任务/);
  assert.ok(view.host.querySelector('[data-bay-handoff-pick="message:7"]'));
  assert.equal(view.host.querySelector('[data-bay-handoff-pick="message:7"]').checked, false);
  await view.click('[data-bay-handoff-pick="message:7"]');
  await view.type("[data-bay-help-text]", "封面层次再压一压");
  await view.click("[data-bay-submit]");
  const created = globalThis.__bayHttpCalls.find((call) => call.method === "POST" && call.path === "/v1/talent/handoffs");
  assert.equal(created.body.origin_kind, "conversation");
  assert.equal(created.body.origin_ref, "task-1");
  assert.deepEqual(created.body.attached_work, { kind: "task", id: "task-1" });
  assert.deepEqual(created.body.context.messages, ["7"]);
  await view.unmount();
});

test("求助详情：勾选内容纯文本、去处理异站显示、认领先过卖家条款", async () => {
  reset();
  const view = await mount(React.createElement(HelpRequestPane, { target: { kind: "help", id: "h1" }, layout: "docked", siteKey: "design" }));
  assert.match(view.host.textContent, /海报改一下层次/);
  assert.match(view.host.textContent, /只要封面/);
  assert.equal(view.host.querySelector("script"), null);
  const handle = view.host.querySelector("[data-bay-handle-on-site]");
  assert.equal(handle.getAttribute("href"), "https://ppt.oceanleo.test/bay?bay=help:h1");
  await view.click('[data-bay-action="claim"]');
  assert.deepEqual(globalThis.__bayTermsAsked, ["seller"]);
  assert.deepEqual(globalThis.__bayOpened, [{ kind: "conversation", threadId: "th1" }]);
  await view.unmount();

  reset();
  const same = await mount(React.createElement(HelpRequestPane, { target: { kind: "help", id: "h1" }, layout: "docked", siteKey: "ppt" }));
  assert.equal(same.host.querySelector("[data-bay-handle-on-site]"), null);
  await same.unmount();
});

test("未登录看求助走登录；我发出的里求助行点开 Bay", async () => {
  reset();
  globalThis.__baySignedIn = false;
  const guest = await mount(React.createElement(HelpRequestPane, { target: { kind: "help", id: "h1" }, layout: "docked", siteKey: "design" }));
  assert.match(guest.host.textContent, /登录后才能看求助/);
  await guest.unmount();

  reset();
  const mine = await mount(React.createElement(MyNeedsPane, { target: { kind: "mine", tab: "needs" }, layout: "docked", siteKey: "design" }));
  await mine.click("[data-bay-my-help-row='h1']");
  assert.deepEqual(globalThis.__bayOpened, [{ kind: "help", id: "h1" }]);
  await mine.unmount();
});

test("talent-handoff 创建求助带 posted_site 与 attached_work", async () => {
  globalThis.__authedCalls = [];
  await talent.createHandoff({
    origin_kind: "manual",
    origin_ref: "",
    category: "design",
    brief: "b",
    budget_fen: 100,
    mode: "open",
    context: { messages: [], artifacts: [] },
    posted_site: "design",
    attached_work: { kind: "task", id: "t1", title: "不该被发出去" },
  });
  const body = JSON.parse(globalThis.__authedCalls[0].init.body);
  assert.equal(body.posted_site, "design");
  assert.deepEqual(body.attached_work, { kind: "task", id: "t1" });
});

test("勾选纯函数：默认空、没有全选、每类最多 50", () => {
  const item = { kind: "message", ref: "1", label: "a", preview: "b" };
  const empty = new Set();
  const once = handoffCtx.toggleHandoffPick(empty, item);
  assert.equal(once.has("message:1"), true);
  const off = handoffCtx.toggleHandoffPick(once, item);
  assert.equal(off.has("message:1"), false);
  const many = new Set(Array.from({ length: 50 }, (_, i) => `message:${i}`));
  const blocked = handoffCtx.toggleHandoffPick(many, { kind: "message", ref: "x", label: "x", preview: "x" });
  assert.equal(blocked.has("message:x"), false);
  const fromTask = handoffCtx.candidatesFromTaskMessages([
    { id: 0, role: "user", content: "占位不算" },
    { id: 3, role: "user", kind: "text", content: "只要封面" },
  ]);
  assert.deepEqual(fromTask.map((row) => row.ref), ["3"]);
  const picker = source("shell/bay/needs/handoff-context.tsx");
  assert.match(picker, /tt\("我说的第 \{n\} 句", \{ n:/);
  assert.match(picker, /tt\("AI 的第 \{n\} 段回答", \{ n:/);
  assert.doesNotMatch(picker, /我说的第 \$\{|AI 的第 \$\{/);
});

test("HumanHandoffDialog 不再默认其他；选中集合仍留在 Dialog", () => {
  const dialog = source("shell/HumanHandoffDialog.tsx");
  assert.match(dialog, /useState<Set<string>>\(new Set\(\)\)/);
  assert.doesNotMatch(dialog, /全选|selectAll|checked=\{true\}/);
  assert.doesNotMatch(dialog, /FALLBACK_CATEGORY|useState\("other"\)/);
  assert.match(dialog, /defaultNeedCategory/);
  assert.doesNotMatch(dialog, /postMessage|iframe|仲裁|抽成|服务费|佣金/);
});

test("HumanHandoffStatus 点开 Bay 里那条求助", () => {
  const status = source("shell/HumanHandoffStatus.tsx");
  assert.match(status, /openBay\(\{\s*kind:\s*"help"/);
  assert.doesNotMatch(status, /talent\.oceanleo|\/requests\//);
});
