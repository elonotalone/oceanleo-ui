// W06（oceanleo-bay）：交易会话视图 `DealConversationView` 与 `openTradeThread`。
// 在 jsdom 里真渲染、真点击；网络、登录、条款、付款、实时通道、消息窗、举报弹窗全部用桩。
// 覆盖：交易卡、文件链接只认 https 且带 rel、接受报价先过买家条款且不碰付款接口、付款没就绪写「付款暂未开放」、
// 签约后输入框换成项目群提示条并能打开项目群、合同取消后输入框恢复、拉黑后换成解除提示、
// 没登录调 openTradeThread 走登录、talent-api.ts 原有导出一个不少。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// ---- 桩 ----------------------------------------------------------------------
const W = (globalThis.__w06 = {
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
  const W = globalThis.__w06;
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
const authStub = dataModule("export async function getUserId(){ return globalThis.__w06.viewer; }");
const paymentsStub = dataModule(`
  export async function fetchBayPaymentConfig(){ globalThis.__w06.payConfigCalls++; return { enabled: true, buyer_ready: globalThis.__w06.buyerReady, seller_ready: false, currency: "usd" }; }
  export async function startBayPayment(){ globalThis.__w06.payStartCalls++; return { redirect_url: null }; }
`);
const hostStub = dataModule("export function openMessages(t){ globalThis.__w06.openMessages.push(t); }");
const reportStub = dataModule("export function ReportDialog(){ return null; }");
const bayStateStub = dataModule(`
  export function openBay(t){ globalThis.__w06.openBay.push(t); }
  export function requireBayLogin(){ globalThis.__w06.loginCalls++; return globalThis.__w06.signedIn; }
`);
const hooksStub = dataModule(`
  export function useImEvent(type, handler){ globalThis.__w06.imHandlers[type] = handler; }
  export function useImConnection(){ return "open"; }
`);
const settingsStub = dataModule(`
  export async function ensureBayTerms(scope){ globalThis.__w06.termsCalls.push(scope); return globalThis.__w06.terms; }
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

// ---- 数据 ----------------------------------------------------------------------
const T0 = "2026-10-06T10:00:00Z";
const thread = { id: "t1", kind: "service", subject_ref: "s1:buyer:seller", contract_id: null, title: "Logo 设计", counterparty: { user_id: "seller", display_name: "Mia", handle: "mia" } };
const offerPending = {
  id: "o1", thread_id: "t1", from_user_id: "seller", to_user_id: "buyer", title: "Logo 三稿", description: "三个方向", price_fen: 12000,
  delivery_days: 5, revisions: 2, engagement_kind: "fixed", service_id: "s1", state: "pending", expires_at: null, contract_id: null,
  currency: "usd", created_at: "2026-10-06T10:05:00Z", updated_at: "2026-10-06T10:05:00Z",
};
const baseMessages = [
  { id: "m3", thread_id: "t1", user_id: "seller", kind: "offer", body: "Logo 三稿", meta: { offer_id: "o1" }, created_at: "2026-10-06T10:05:00Z" },
  {
    id: "m2", thread_id: "t1", user_id: "seller", kind: "text", body: "文件在这", created_at: "2026-10-06T10:02:00Z",
    attachments: [
      { url: "https://files.example.com/brief.pdf", name: "brief.pdf", kind: "file" },
      { url: "http://files.example.com/old.pdf", name: "old.pdf", kind: "file" },
      { url: "javascript:alert(1)", name: "evil", kind: "file" },
    ],
  },
  { id: "m1", thread_id: "t1", user_id: "buyer", kind: "text", body: "你好", created_at: T0 },
];

let page;
function setPage(next) {
  page = next;
}
function installRoutes() {
  W.routes = [
    { method: "GET", path: "/v1/talent/threads/t1/messages", reply: () => page },
    { method: "POST", path: "/v1/talent/threads/t1/read", reply: { ok: true } },
    { method: "GET", path: "/v1/talent/services/s1", reply: { service: { id: "s1", user_id: "seller", title: "Logo 设计服务" } } },
    { method: "GET", path: "/v1/im/blocks", reply: { items: [] } },
    { method: "POST", path: "/v1/im/blocks", reply: { ok: true } },
    { method: "DELETE", path: "/v1/im/blocks/", reply: { ok: true } },
    {
      method: "POST", path: "/v1/talent/offers/o1/accept",
      reply: () => {
        setPage({
          ...page,
          offers: [{ ...offerPending, state: "accepted", contract_id: "c1" }],
          contract_summary: {
            id: "c1", title: "Logo 三稿", status: "draft", payment_state: null, total_fen: 12000, currency: "usd",
            next_action: "pay", project_id: null, im_conversation_id: null, work: null,
          },
        });
        return { offer: { ...offerPending, state: "accepted", contract_id: "c1" }, contract_id: "c1" };
      },
    },
    { method: "POST", path: "/v1/talent/threads/t1/messages", reply: (_p, body) => ({ message: { id: "m9", thread_id: "t1", user_id: "buyer", kind: "text", body: body.body, created_at: T0 } }) },
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
  setPage({ thread, messages: baseMessages, offers: [offerPending], contact_hint: false });
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
    qa: (sel) => [...host.querySelectorAll(sel)],
    async click(sel) {
      const el = host.querySelector(sel);
      assert.ok(el, `找不到 ${sel}`);
      await act(async () => {
        el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

async function pushEvent() {
  await act(async () => {
    W.imHandlers["message.created"]?.({ conversation_id: "talent:t1" });
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  await flush();
}

test("首屏：头部、交易卡、消息；文件只认 https、新窗口打开带 rel；不出现 talent 站链接", async () => {
  reset();
  const view = await mount({ threadId: "t1", layout: "docked" });
  assert.equal(view.q("[data-deal-title]").textContent, "Mia");
  assert.equal(view.q("[data-deal-subject]").getAttribute("data-deal-subject"), "service");
  assert.match(view.q("[data-deal-subject]").textContent, /服务：Logo 设计服务/);
  assert.equal(view.q("[data-deal-card-status]").getAttribute("data-deal-card-status"), "offer_pending");
  assert.equal(view.q("[data-deal-card-next]").getAttribute("data-deal-card-next"), "reply_offer");
  assert.match(view.q("[data-deal-card-amount]").textContent, /120/);

  const links = view.qa("a[data-attachment]");
  assert.equal(links.length, 1, "只有 https 附件被画出来");
  assert.equal(links[0].getAttribute("href"), "https://files.example.com/brief.pdf");
  assert.equal(links[0].getAttribute("rel"), "noopener noreferrer");
  assert.equal(links[0].getAttribute("target"), "_blank");
  assert.ok(!view.host.innerHTML.includes("talent.oceanleo.com"));
  assert.ok(!view.host.textContent.includes("在 talent 打开"));
  assert.ok(view.q("[data-deal-composer]"), "没签约时有输入框");
  assert.equal(view.q('[data-action="toggle-offer"]'), null, "买家看不到发报价");
  assert.ok(view.q('[data-offer-action="accept"]'), "买家能接受报价");
  await view.unmount();
});

test("接受报价：先过买家条款，再接受；付款没就绪写「付款暂未开放」，没有付款按钮，不调发起付款", async () => {
  reset();
  const view = await mount({ threadId: "t1", layout: "docked" });
  await view.click('[data-offer-action="accept"]');
  assert.deepEqual(W.termsCalls, ["buyer"]);
  assert.ok(W.calls.some((c) => c.method === "POST" && c.path === "/v1/talent/offers/o1/accept"));
  assert.equal(view.q("[data-deal-card-next]").getAttribute("data-deal-card-next"), "pay_unavailable");
  assert.match(view.q("[data-deal-card-next]").textContent, /付款暂未开放/);
  assert.equal(W.payStartCalls, 0, "不调任何发起付款的接口");
  assert.ok(!W.calls.some((c) => /payment|checkout|stripe/i.test(c.path)), "没有付款类请求");
  assert.equal(view.q('[data-action="pay"]'), null);
  assert.match(view.q("[data-deal-notice]").textContent, /报价已被接受，订单已生成。/);
  await view.click("[data-deal-card]");
  assert.deepEqual(W.openBay.at(-1), { kind: "order", id: "c1" }, "点交易卡在 Bay 里打开订单");
  await view.unmount();
});

test("条款窗被关掉：不接受报价", async () => {
  reset();
  W.terms = false;
  const view = await mount({ threadId: "t1", layout: "docked" });
  await view.click('[data-offer-action="accept"]');
  assert.deepEqual(W.termsCalls, ["buyer"]);
  assert.ok(!W.calls.some((c) => c.path.includes("/accept")), "没同意条款就不发接受请求");
  await view.unmount();
});

test("签约后输入框换成项目群提示条并能打开项目群；合同取消后输入框恢复", async () => {
  reset();
  const signed = {
    id: "c1", title: "Logo 三稿", status: "active", payment_state: "held", total_fen: 12000, currency: "usd",
    next_action: null, project_id: "p1", im_conversation_id: "6d1c0a8e-1111-2222-3333-444455556666", work: null,
  };
  setPage({
    thread: { ...thread, contract_id: "c1" },
    messages: [
      ...baseMessages,
      { id: "m8", thread_id: "t1", user_id: null, kind: "system", body: "已签约", meta: { event: "contract.moved_to_project", im_conversation_id: signed.im_conversation_id }, created_at: "2026-10-06T11:00:00Z" },
    ],
    offers: [{ ...offerPending, state: "accepted", contract_id: "c1" }],
    contract_summary: signed,
  });
  const view = await mount({ threadId: "t1", layout: "page" });
  assert.equal(view.q("[data-deal-composer]"), null, "签约后没有输入框");
  assert.ok(view.q("[data-deal-locked]"));
  assert.match(view.q("[data-deal-locked]").textContent, /已签约，之后在项目群里沟通。/);
  assert.match(view.q('[data-deal-event="contract.moved_to_project"]').textContent, /已签约，之后在项目群里沟通。.*打开项目群/);
  await view.click('[data-deal-locked] [data-action="open-project"]');
  assert.deepEqual(W.openMessages.at(-1), { conversationId: signed.im_conversation_id });
  assert.ok(view.q("[data-deal-aside]"), "页面排法：交易卡在右侧栏");

  setPage({ ...page, contract_summary: { ...signed, status: "cancelled" } });
  await pushEvent();
  assert.equal(view.q("[data-deal-locked]"), null, "取消后提示条消失");
  assert.ok(view.q("[data-deal-composer]"), "取消后输入框恢复");
  assert.equal(view.q("[data-deal-card-status]").getAttribute("data-deal-card-status"), "cancelled");
  await view.unmount();
});

test("卖家能发报价；拉黑对方后输入框换成解除提示，解除后恢复", async () => {
  reset();
  W.viewer = "seller";
  setPage({ thread: { ...thread, counterparty: { user_id: "buyer", display_name: "Leo" } }, messages: baseMessages.slice(1), offers: [], contact_hint: true });
  const view = await mount({ threadId: "t1", layout: "mobile", onBack: () => {} });
  assert.ok(view.q('[data-action="back"]'), "窄浮窗有返回");
  assert.ok(view.q("[data-contact-hint]"));
  assert.equal(view.q("[data-deal-card-next]").getAttribute("data-deal-card-next"), "send_offer");
  await view.click('[data-action="toggle-offer"]');
  assert.ok(view.q("[data-deal-offer-form]"), "卖家打开报价表单");
  await view.click('[data-action="block-user"]');
  assert.ok(W.calls.some((c) => c.method === "POST" && c.path === "/v1/im/blocks" && c.body.user_id === "buyer"));
  assert.ok(view.q("[data-deal-blocked]"));
  assert.equal(view.q("[data-deal-composer]"), null);
  await view.click('[data-deal-blocked] [data-action="unblock"]');
  assert.ok(W.calls.some((c) => c.method === "DELETE" && c.path === "/v1/im/blocks/buyer"));
  assert.ok(view.q("[data-deal-composer]"));
  await view.unmount();
});

test("会话不存在 / 没登录 / 非法 id 的状态", async () => {
  reset();
  W.routes.unshift({ method: "GET", path: "/v1/talent/threads/t1/messages", reply: Object.assign(new Error("会话不存在"), { status: 404 }) });
  let view = await mount({ threadId: "t1", layout: "docked" });
  assert.equal(view.q("[data-deal-error]").getAttribute("data-deal-error"), "gone");
  await view.unmount();

  reset();
  W.routes.unshift({ method: "GET", path: "/v1/talent/threads/t1/messages", reply: Object.assign(new Error("未登录"), { status: 401 }) });
  view = await mount({ threadId: "t1", layout: "docked" });
  assert.equal(view.q("[data-deal-error]").getAttribute("data-deal-error"), "login");
  await view.click('[data-action="login"]');
  assert.equal(W.loginCalls, 1);
  await view.unmount();

  reset();
  view = await mount({ threadId: "../etc", layout: "docked" });
  assert.equal(view.q("[data-deal-view]").getAttribute("data-deal-view"), "invalid");
  assert.equal(W.calls.length, 0, "非法 id 不发请求");
  await view.unmount();
});

test("openTradeThread：没登录走登录、不发请求；登录后找或建会话并在 Bay 里打开", async () => {
  reset();
  W.signedIn = false;
  await openTradeThread({ kind: "service", subjectRef: "s1" });
  assert.equal(W.loginCalls, 1);
  assert.equal(W.calls.length, 0);
  assert.equal(W.openBay.length, 0);

  reset();
  W.routes.push({ method: "POST", path: "/v1/talent/threads", reply: { thread: { id: "t42" } } });
  await openTradeThread({ kind: "service", subjectRef: "s1" });
  assert.deepEqual(W.openBay, [{ kind: "conversation", threadId: "t42" }]);
  const post = W.calls.find((c) => c.method === "POST" && c.path === "/v1/talent/threads");
  assert.deepEqual(post.body, { kind: "service", counterparty_user_id: "seller", subject_ref: "s1" });

  reset();
  W.routes.unshift({ method: "GET", path: "/v1/talent/handoffs/h1", reply: { handoff: { id: "h1", thread_id: null } } });
  await assert.rejects(openTradeThread({ kind: "handoff", subjectRef: "h1" }), /还没有人接/);
  assert.equal(W.openBay.length, 0);
});

test("talent-api.ts 原有导出一个不少", async () => {
  const runtime = [
    "TALENT_CONVERSATION_PREFIX", "TALENT_BODY_LIMIT", "TALENT_PAGE_SIZE", "parseTalentConversationId", "talentConversationId",
    "fetchTalentThread", "sendTalentMessage", "markTalentThreadRead", "actOnTalentOffer", "offerActionsFor", "talentThreadUrl",
    "talentMessageSeq", "offerCardOf", "toImMessage", "pageToMessages", "mergeMessages", "counterpartyProfile",
  ];
  const types = [
    "TalentFetcher", "TalentAttachmentRow", "TalentMessageRow", "TalentOfferState", "TalentOffer", "TalentThreadInfo",
    "TalentThreadPage", "TalentOfferAction", "OfferActions",
  ];
  const mod = await import(
    await compileModule("src/shell/messages/talent/talent-api.ts", {
      "../../../lib/im/client": dataModule("export async function imFetch(){ throw new Error('stub'); }"),
      "../../../contracts/domain-family": dataModule("export function currentFamilySubsiteOrigin(){ return undefined; }"),
    })
  );
  for (const name of runtime) assert.ok(name in mod, `talent-api.ts 少了导出 ${name}`);
  const source = readFileSync(new URL("../src/shell/messages/talent/talent-api.ts", import.meta.url), "utf8");
  for (const name of types) {
    assert.match(source, new RegExp(`export (interface|type) ${name}\\b`), `talent-api.ts 少了类型 ${name}`);
  }
});
