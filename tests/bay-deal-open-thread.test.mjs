// W06 R4：点「和 TA 聊 / 联系发布者」后，人要进交易会话输入框，不要填到「跟 leo 说」。
// jsdom 真渲染；网络、登录、条款、付款、消息窗全部用桩。不开浏览器。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://video.oceanleo.com/" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLInputElement: window.HTMLInputElement,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = React;

const W = (globalThis.__w06r4 = {
  viewer: "buyer",
  signedIn: true,
  terms: true,
  termsCalls: [],
  calls: [],
  routes: [],
  payConfigCalls: 0,
  payStartCalls: 0,
  buyerReady: false,
  openBay: [],
  openMessages: [],
  loginCalls: 0,
  imHandlers: {},
});

const httpStub = dataModule(`
  const W = globalThis.__w06r4;
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
  }
  function route(method, path, body) {
    W.calls.push({ method, path, body });
    for (const r of W.routes) {
      if (r.method === method && (typeof r.path === "string" ? path.startsWith(r.path) : r.path.test(path))) {
        const out = typeof r.reply === "function" ? r.reply(path, body) : r.reply;
        if (out instanceof Error) return Promise.reject(out);
        return Promise.resolve(structuredClone(out));
      }
    }
    return Promise.reject(new BayApiError("no route " + method + " " + path, 500));
  }
  export function bayGet(path) { return route("GET", path); }
  export function bayPost(path, body) { return route("POST", path, body); }
  export function bayPatch(path, body) { return route("PATCH", path, body); }
  export function bayDelete(path) { return route("DELETE", path); }
`);
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const authStub = dataModule("export async function getUserId(){ return globalThis.__w06r4.viewer; }");
const paymentsStub = dataModule(`
  export async function fetchBayPaymentConfig(){ globalThis.__w06r4.payConfigCalls++; return { enabled: true, buyer_ready: globalThis.__w06r4.buyerReady, seller_ready: false, currency: "usd" }; }
  export async function startBayPayment(){ globalThis.__w06r4.payStartCalls++; return { redirect_url: null }; }
`);
const hostStub = dataModule("export function openMessages(t){ globalThis.__w06r4.openMessages.push(t); }");
const reportStub = dataModule("export function ReportDialog(){ return null; }");
const bayStateStub = dataModule(`
  export function openBay(t){ globalThis.__w06r4.openBay.push(t); }
  export function requireBayLogin(){ globalThis.__w06r4.loginCalls++; return globalThis.__w06r4.signedIn; }
`);
const hooksStub = dataModule(`
  export function useImEvent(type, handler){ globalThis.__w06r4.imHandlers[type] = handler; }
  export function useImConnection(){ return "open"; }
`);
const settingsStub = dataModule(`
  export async function ensureBayTerms(scope){ globalThis.__w06r4.termsCalls.push(scope); return globalThis.__w06r4.terms; }
  export function openBaySettings(){}
`);
const uploadStub = dataModule(`
  export class UploadError extends Error { constructor(code){ super(code); this.code = code; } }
  export async function uploadAttachment(file){ return { kind: "file", url: "https://files.example.com/" + file.name, name: file.name, size: 1, mime: "application/pdf" }; }
`);

const STUBS = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/auth/client": authStub,
  "../../../lib/bay/payments": paymentsStub,
  "../../../lib/bay/http": httpStub,
  "../../messages/host-state": hostStub,
  "../../messages/report/ReportDialog": reportStub,
  "../shell/bay-state": bayStateStub,
  "../../messages/realtime/hooks": hooksStub,
  "../settings": settingsStub,
  "../../messages/composer/upload": uploadStub,
};

const { DealConversationView } = await import(await compileModule("src/shell/bay/deal/DealConversationView.tsx", STUBS));
const { openTradeThread } = await import(await compileModule("src/shell/bay/deal/open-trade-thread.ts", STUBS));

const T0 = "2026-10-06T10:00:00Z";
const thread = {
  id: "t1",
  kind: "demand",
  subject_ref: "6f1e81b4-d101-4d95-957c-5b5255b31df0:buyer:seller",
  contract_id: null,
  title: "把季度汇报改成 12 页演示稿",
  counterparty: { user_id: "seller", display_name: "Mia", handle: "mia" },
};
const baseMessages = [{ id: "m1", thread_id: "t1", user_id: "buyer", kind: "text", body: "你好", created_at: T0 }];

let page;
function setPage(next) {
  page = next;
}
function installRoutes() {
  W.routes = [
    { method: "GET", path: "/v1/talent/threads/t1/messages", reply: () => page },
    { method: "POST", path: "/v1/talent/threads/t1/read", reply: { ok: true } },
    {
      method: "GET",
      path: "/v1/talent/demands/6f1e81b4-d101-4d95-957c-5b5255b31df0",
      reply: { demand: { id: "6f1e81b4-d101-4d95-957c-5b5255b31df0", user_id: "buyer", title: "把季度汇报改成 12 页演示稿" } },
    },
    { method: "GET", path: "/v1/im/blocks", reply: { items: [] } },
  ];
}

function reset() {
  W.calls = [];
  W.termsCalls = [];
  W.openBay = [];
  W.openMessages = [];
  W.payConfigCalls = 0;
  W.payStartCalls = 0;
  W.loginCalls = 0;
  W.terms = true;
  W.signedIn = true;
  W.buyerReady = false;
  W.viewer = "buyer";
  setPage({ thread, messages: baseMessages, offers: [], contact_hint: false });
  installRoutes();
}

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(DealConversationView, props));
  });
  await flush();
  return {
    host,
    q: (sel) => host.querySelector(sel),
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  assert.ok(setter, "jsdom textarea value setter");
  setter.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}

test("渲染 DealConversationView 后有 data-bay-deal-thread 与 data-bay-deal-composer", async () => {
  reset();
  const view = await mount({ threadId: "t1", layout: "docked" });
  const root = view.q("[data-bay-deal-thread]");
  const box = view.q("[data-bay-deal-composer]");
  assert.ok(root);
  assert.equal(root.getAttribute("data-bay-deal-thread"), "t1");
  assert.ok(box);
  assert.equal(box.tagName, "TEXTAREA");
  assert.ok(box.hasAttribute("data-composer-input"));
  await view.unmount();
});

test("openTradeThread：已登录且 demand+userId 建会话成功时 openBay 进 conversation", async () => {
  reset();
  const demandId = "6f1e81b4-d101-4d95-957c-5b5255b31df0";
  const proposerId = "b0b0b0b0-b0b0-40b0-b0b0-b0b0b0b0b0b0";
  const threadId = "c2c2c2c2-c2c2-42c2-c2c2-c2c2c2c2c2c2";
  W.routes.push({ method: "POST", path: "/v1/talent/threads", reply: { thread: { id: threadId } } });
  await openTradeThread({ kind: "demand", subjectRef: demandId, userId: proposerId });
  assert.equal(W.loginCalls, 1);
  assert.equal(W.openBay.length, 1);
  assert.equal(W.openBay[0].kind, "conversation");
  assert.equal(W.openBay[0].threadId, threadId);
  const post = W.calls.find((c) => c.method === "POST" && c.path === "/v1/talent/threads");
  assert.ok(post, "应 POST /v1/talent/threads");
  assert.deepEqual(post.body, { kind: "demand", counterparty_user_id: proposerId, subject_ref: demandId });
  assert.ok(
    !W.calls.some((c) => c.method === "GET" && String(c.path).includes("/v1/talent/demands/")),
    "有 userId 时不另取需求详情",
  );
});

test("页面上同时有 data-leo-composer 时，填交易内容只碰 data-bay-deal-composer", async () => {
  reset();
  const view = await mount({ threadId: "t1", layout: "page" });
  const leo = document.createElement("textarea");
  leo.setAttribute("data-leo-composer", "true");
  leo.setAttribute("placeholder", "跟 leo 说");
  leo.setAttribute("rows", "2");
  document.body.appendChild(leo);

  const deal = document.querySelector("[data-bay-deal-composer]");
  const last = [...document.querySelectorAll("textarea")].at(-1);
  assert.ok(deal, "交易输入框应在文档里");
  assert.equal(last, leo, "textarea.last() 仍是站点外壳「跟 leo 说」，脚本不该用它");
  assert.notEqual(deal, leo);

  await act(async () => {
    setNativeValue(deal, "新报价说明：三天出初稿");
  });
  await flush(2);

  assert.equal(deal.value, "新报价说明：三天出初稿");
  assert.equal(leo.value, "", "跟 leo 说 的框不能被填");
  assert.equal(document.querySelector("[data-leo-composer]").value, "");
  assert.equal(document.querySelectorAll("[data-bay-deal-composer]").length, 1);

  leo.remove();
  await view.unmount();
});
