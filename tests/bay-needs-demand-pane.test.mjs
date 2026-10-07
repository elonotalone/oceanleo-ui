// W04：需求详情窗格（DemandPane）。
// 覆盖：访客看到「报价」「联系发布者」、附带作品预览与「去处理」（同站不显示）；发布者看报价、接受（先过条款）、拒绝、
// 复制邀请链接、关闭（要写原因）、重新开放；没登录点动作只弹登录；用户文字按纯文本、外链只放行 http(s)；
// 目标不是需求时什么都不画也不发请求。网络、登录、条款、会话、浮窗状态全部打桩。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
    return globalThis.__authedReply ?? { ok: true, data: { demand: { id: "d1" } } };
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
  export function bayHrefOnSite(site, target){ return "https://" + site + ".oceanleo.test/bay?bay=" + target.kind + ":" + (target.id ?? ""); }
`);
const dealStub = dataModule(`
  globalThis.__bayThreads ??= [];
  export async function openTradeThread(subject){ globalThis.__bayThreads.push(subject); if (globalThis.__bayThreadError) throw new Error(globalThis.__bayThreadError); }
`);
const messagesStub = dataModule(`
  globalThis.__bayMessages ??= [];
  export function openMessages(t){ globalThis.__bayMessages.push(t); }
`);
const settingsStub = dataModule(`
  globalThis.__bayTermsAsked ??= [];
  export async function ensureBayTerms(scope){ globalThis.__bayTermsAsked.push(scope); return globalThis.__bayTermsOk !== false; }
  export function openBaySettings(pane){ globalThis.__baySettingsOpened ??= []; globalThis.__baySettingsOpened.push(pane); }
`);
const domainStub = dataModule(`
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
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
  export function Modal({ children }){ return children; }
`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../shell/bay-state": stateStub,
  "../deal": dealStub,
  "../../messages/host-state": messagesStub,
  "../settings": settingsStub,
  "../../../contracts/domain-family": domainStub,
  "../../../ui/Toast": toastStub,
  "../../../ui": uiBarrelStub,
};
const paneModule = await import(await compileModule("src/shell/bay/needs/DemandPane.tsx", stubs));
const { DemandPane } = paneModule;
const http = await import(httpStub);

const CATEGORIES = {
  items: [],
  flat_items: [
    { slug: "doc", name_zh: "文档与表格", catalog_kind: "delivery", regulated_domain: "none", position: 50, published: true },
    { slug: "other", name_zh: "其他", catalog_kind: "delivery", regulated_domain: "none", position: 160, published: true },
  ],
  total: 2,
  site_defaults: { ppt: "doc", oceanleo: null },
};

function demand(extra = {}) {
  return {
    id: "d1",
    user_id: "buyer-1",
    title: "做一份路演稿",
    description: "十页以内，要有财务预测，需要英文版本。",
    category: "doc",
    engagement_kind: "fixed",
    budget_min_fen: 50000,
    budget_max_fen: 100000,
    deadline_at: null,
    status: "open",
    proposal_count: 2,
    created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    currency: "CNY",
    skills: ["PPT"],
    reference_links: ["https://a.test/x", "javascript:alert(1)"],
    supplemental_notes: "",
    close_reason: null,
    buyer: { user_id: "buyer-1", handle: "buyer", display_name: "买家小李", avatar_url: null, rating_avg: 4.5, rating_count: 2, completed_contracts: 3, level: "pro" },
    posted_site: "ppt",
    handling_site: "ppt",
    attached_work: { kind: "task", id: "t1", site_key: "ppt", title: "旧稿", preview_url: "/history?task=t1&view=readonly" },
    is_owner: false,
    my_proposal: null,
    ...extra,
  };
}

function proposal(extra = {}) {
  return {
    id: "p1",
    demand_id: "d1",
    user_id: "seller-1",
    message: "我做过三十多份路演稿",
    price_fen: 80000,
    delivery_days: 5,
    status: "pending",
    created_at: "2026-10-01T00:00:00Z",
    currency: "CNY",
    seller: { user_id: "seller-1", handle: "ace", display_name: "高手", avatar_url: null, rating_avg: 4.9, rating_count: 8, completed_contracts: 12, level: "top" },
    ...extra,
  };
}

function reset() {
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = null;
  globalThis.__authedCalls = [];
  globalThis.__authedReply = null;
  globalThis.__bayOpened = [];
  globalThis.__bayMessages = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayThreads = [];
  globalThis.__bayThreadError = null;
  globalThis.__bayTermsAsked = [];
  globalThis.__bayTermsOk = true;
  globalThis.__toasts = [];
  globalThis.__bayTask = null;
}

function respond(detail, proposals = []) {
  globalThis.__bayHttpRespond = (method, path) => {
    if (method === "GET" && path === "/v1/talent/categories") return CATEGORIES;
    if (method === "GET" && path === `/v1/talent/demands/${detail.id}`) return { demand: detail };
    if (method === "GET" && path === `/v1/talent/demands/${detail.id}/proposals`) return { items: proposals };
    return {};
  };
}

async function settle() {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
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

const paneProps = (siteKey = "design") => ({ target: { kind: "demand", id: "d1" }, layout: "docked", siteKey });
const posts = () => globalThis.__bayHttpCalls.filter((call) => call.method !== "GET");

test("目标不是需求时什么都不画，也不发请求", () => {
  reset();
  const out = renderToStaticMarkup(React.createElement(DemandPane, { target: { kind: "feed" }, layout: "docked", siteKey: "design" }));
  assert.equal(out, "");
  assert.equal(globalThis.__bayHttpCalls.length, 0);
});

test("访客：标题、预算、发布者、附带作品的只读预览、报价与联系发布者；窗格不自带返回栏", async () => {
  reset();
  respond(demand());
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  const text = view.host.textContent;
  assert.match(text, /做一份路演稿/);
  assert.match(text, /开放报价/);
  assert.match(text, /文档与表格/);
  assert.match(text, /买家小李/);
  assert.match(text, /¥500/);
  assert.match(text, /2 份报价/);
  const work = view.host.querySelector("[data-bay-attached-work]");
  assert.ok(work);
  assert.match(work.textContent, /旧稿/);
  const preview = work.querySelector("a");
  assert.equal(preview.getAttribute("href"), "https://slide.oceanleo.test/history?task=t1&view=readonly");
  assert.equal(preview.getAttribute("target"), "_blank");
  assert.match(preview.getAttribute("rel"), /noopener/);
  assert.ok(view.host.querySelector('[data-bay-action="propose"]'));
  assert.ok(view.host.querySelector('[data-bay-action="contact"]'));
  assert.equal(view.host.querySelector("[data-bay-demand-owner]"), null, "访客看不到发布者的操作区");
  assert.equal(view.host.querySelector("[data-bay-detail-bar]"), null, "返回栏归外壳");
  assert.equal(view.host.querySelector("header"), null, "不自带标题栏");
  const detailCall = globalThis.__bayHttpCalls.find((call) => call.path === "/v1/talent/demands/d1");
  assert.deepEqual(detailCall.opts, { anonymous: true }, "未登录也能看详情");
  await view.unmount();
});

test("「去处理」：在别的站显示、跳到处理站的 /bay 深链；就在那个站时不显示", async () => {
  reset();
  respond(demand({ handling_site: "ppt" }));
  const elsewhere = await mount(React.createElement(DemandPane, paneProps("design")));
  const link = elsewhere.host.querySelector("[data-bay-handle-on-site]");
  assert.ok(link);
  assert.equal(link.getAttribute("href"), "https://ppt.oceanleo.test/bay?bay=demand:d1");
  assert.match(link.textContent, /去 LeoSlides 处理/);
  await elsewhere.unmount();

  reset();
  respond(demand({ handling_site: "ppt" }));
  const same = await mount(React.createElement(DemandPane, paneProps("ppt")));
  assert.equal(same.host.querySelector("[data-bay-handle-on-site]"), null);
  await same.unmount();
});

test("附带作品拿不到预览地址时写明签约后在哪个站打开", async () => {
  reset();
  respond(demand({ attached_work: { kind: "task", id: "t1", site_key: "design", title: "海报", preview_url: null } }));
  const view = await mount(React.createElement(DemandPane, paneProps("ppt")));
  const work = view.host.querySelector("[data-bay-attached-work]");
  assert.match(work.textContent, /签约后可在 LeoDesign 打开/);
  assert.equal(work.querySelector("a"), null);
  await view.unmount();
});

test("用户文字按纯文本出，外链只放行 http(s)", async () => {
  reset();
  respond(demand({ title: "<b>粗体标题</b>", description: "<img src=x onerror=alert(1)>", supplemental_notes: "<script>1</script>" }));
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  assert.equal(view.host.querySelector("img"), null);
  assert.equal(view.host.querySelector("script"), null);
  assert.equal(view.host.querySelector("h2 b"), null);
  assert.match(view.host.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  const links = [...view.host.querySelectorAll("[data-bay-demand-summary] a")].map((a) => a.getAttribute("href"));
  assert.deepEqual(links, ["https://a.test/x"]);
  const link = view.host.querySelector("[data-bay-demand-summary] a");
  assert.match(link.getAttribute("rel"), /noopener/);
  assert.match(link.getAttribute("rel"), /nofollow/);
  await view.unmount();
});

test("访客登录后点「报价」去报价窗格；「联系发布者」走交易会话", async () => {
  reset();
  respond(demand());
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  await view.click('[data-bay-action="propose"]');
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "propose", demandId: "d1" });
  await view.click('[data-bay-action="contact"]');
  assert.deepEqual(globalThis.__bayThreads, [{ kind: "demand", subjectRef: "d1", userId: "buyer-1" }]);
  globalThis.__bayThreadError = "会话打不开";
  await view.click('[data-bay-action="contact"]');
  assert.match(view.host.textContent, /会话打不开/);
  await view.unmount();
});

test("未登录：能看详情；点报价、联系发布者只弹登录，不开窗格、不发写请求", async () => {
  reset();
  globalThis.__baySignedIn = false;
  respond(demand());
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  assert.match(view.host.textContent, /登录后可以报价、联系发布者/);
  await view.click('[data-bay-action="propose"]');
  await view.click('[data-bay-action="contact"]');
  assert.equal(globalThis.__bayLoginAsked, 2);
  assert.deepEqual(globalThis.__bayOpened, []);
  assert.deepEqual(globalThis.__bayThreads, []);
  assert.deepEqual(posts(), []);
  await view.unmount();
});

test("我已报过价：显示我的报价与状态；等回复时能撤回；需求关闭后没有报价入口", async () => {
  reset();
  const mine = proposal({ id: "pm", user_id: "me", price_fen: 90000, delivery_days: 3, message: "我来做" });
  respond(demand({ my_proposal: mine }));
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  const box = view.host.querySelector("[data-bay-my-proposal]");
  assert.ok(box);
  assert.match(box.textContent, /¥900/);
  assert.match(box.textContent, /3 天交付/);
  assert.match(view.host.querySelector('[data-bay-action="propose"]').textContent, /修改报价/);
  await view.click('[data-bay-action="withdraw"]');
  assert.deepEqual(posts().map((call) => call.path), ["/v1/talent/proposals/pm/withdraw"]);
  assert.ok(globalThis.__toasts.some((toast) => toast.kind === "success"));
  await view.unmount();

  reset();
  respond(demand({ status: "closed", close_reason: "计划调整" }));
  const closed = await mount(React.createElement(DemandPane, paneProps("design")));
  assert.equal(closed.host.querySelector('[data-bay-action="propose"]'), null);
  assert.match(closed.host.textContent, /这条需求已停止接收报价/);
  assert.match(closed.host.textContent, /关闭原因：计划调整/);
  await closed.unmount();
});

test("需求不存在：说一句，不报错；读失败：给重试", async () => {
  reset();
  globalThis.__bayHttpRespond = (method, path) => {
    if (path === "/v1/talent/categories") return CATEGORIES;
    throw new http.BayApiError("需求不存在或已下架", 404);
  };
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  assert.match(view.host.textContent, /这条需求不存在或已下架/);
  assert.equal(view.host.querySelector("[data-bay-demand-summary]"), null);
  await view.unmount();

  reset();
  globalThis.__bayHttpRespond = (method, path) => {
    if (path === "/v1/talent/categories") return CATEGORIES;
    throw new Error("网关暂时不可用");
  };
  const failed = await mount(React.createElement(DemandPane, paneProps("design")));
  assert.match(failed.host.textContent, /网关暂时不可用/);
  assert.match(failed.host.textContent, /重试/);
  await failed.unmount();
});

test("发布者：看到全部报价，等回复的排在前面；接受先过条款，生成合同后进交易会话，不碰付款", async () => {
  reset();
  const pending = proposal({ id: "p1", created_at: "2026-10-02T00:00:00Z" });
  const declined = proposal({ id: "p0", status: "declined", user_id: "seller-0", created_at: "2026-10-01T00:00:00Z" });
  respond(demand({ is_owner: true }), [declined, pending]);
  globalThis.__bayHttpRespond = ((inner) => (method, path, body) => {
    if (method === "POST" && path === "/v1/talent/proposals/p1/accept") return { contract: { id: "c1", thread_id: "th1" } };
    return inner(method, path, body);
  })(globalThis.__bayHttpRespond);
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  assert.ok(view.host.querySelector("[data-bay-demand-owner]"));
  assert.equal(view.host.querySelector('[data-bay-action="propose"]'), null, "发布者不给自己的需求报价");
  const rows = [...view.host.querySelectorAll("[data-bay-proposal]")];
  assert.deepEqual(rows.map((row) => row.getAttribute("data-bay-proposal")), ["pending", "declined"]);
  assert.match(rows[0].textContent, /高手/);
  assert.match(rows[0].textContent, /¥800/);
  assert.match(rows[0].textContent, /5 天交付/);
  assert.match(rows[0].textContent, /12 单完成/);

  globalThis.__bayTermsOk = false;
  await view.click('[data-bay-proposal="pending"] [data-bay-action="accept"]');
  assert.deepEqual(globalThis.__bayTermsAsked, ["buyer"]);
  assert.deepEqual(posts(), [], "没同意条款不能接受报价");

  globalThis.__bayTermsOk = true;
  await view.click('[data-bay-proposal="pending"] [data-bay-action="accept"]');
  assert.deepEqual(posts().map((call) => call.path), ["/v1/talent/proposals/p1/accept"]);
  assert.deepEqual(globalThis.__bayMessages.at(-1), { conversationId: "talent:th1" });
  assert.ok(globalThis.__toasts.some((toast) => toast.kind === "success" && /合同草稿/.test(toast.title) && /没有付款/.test(toast.title)));
  assert.ok(!globalThis.__bayHttpCalls.some((call) => /pay|checkout|stripe/i.test(call.path)), "不触发任何付款");
  await view.unmount();
});

test("发布者：拒绝只处理这一条；和报价人聊走交易会话", async () => {
  reset();
  respond(demand({ is_owner: true }), [proposal({ id: "p1" })]);
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  await view.click('[data-bay-proposal="pending"] [data-bay-action="decline"]');
  assert.deepEqual(posts().map((call) => call.path), ["/v1/talent/proposals/p1/decline"]);
  await view.click('[data-bay-proposal] [data-bay-action="chat"]');
  assert.deepEqual(globalThis.__bayThreads, [{ kind: "demand", subjectRef: "d1", userId: "seller-1" }]);
  await view.unmount();
});

test("发布者：复制邀请链接——没有就新建，链接落在门户 /bay/demands/invite/<token>；作废后消失", async () => {
  reset();
  const copied = [];
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async (text) => void copied.push(text) } });
  respond(demand({ is_owner: true, invite: null }), []);
  globalThis.__bayHttpRespond = ((inner) => (method, path, body) => {
    if (method === "POST" && path === "/v1/talent/demands/d1/invite-link") return { invite: { token: "tok_ABC-1", claimed: false }, demand_id: "d1" };
    if (method === "DELETE" && path === "/v1/talent/demands/d1/invite-link") return { ok: true, revoked: true };
    return inner(method, path, body);
  })(globalThis.__bayHttpRespond);
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  await view.click('[data-bay-action="invite"]');
  assert.deepEqual(posts().at(-1), { method: "POST", path: "/v1/talent/demands/d1/invite-link", body: { ttl_days: 14 }, opts: undefined });
  assert.deepEqual(copied, ["https://oceanleo.test/bay/demands/invite/tok_ABC-1"]);
  assert.equal(view.host.querySelector("[data-bay-invite-url] input").value, "https://oceanleo.test/bay/demands/invite/tok_ABC-1");
  await view.click("[data-bay-invite-url] button");
  assert.equal(posts().at(-1).method, "DELETE");
  assert.equal(view.host.querySelector("[data-bay-invite-url]"), null);
  await view.unmount();

  // 已有没被领取的链接：直接复制，不再新建。
  reset();
  copied.length = 0;
  respond(demand({ is_owner: true, invite: { token: "old_tok", claimed: false } }), []);
  const again = await mount(React.createElement(DemandPane, paneProps("design")));
  await again.click('[data-bay-action="invite"]');
  assert.deepEqual(posts(), []);
  assert.deepEqual(copied, ["https://oceanleo.test/bay/demands/invite/old_tok"]);
  await again.unmount();
});

test("发布者：关闭需求必须写原因；重新开放先过条款", async () => {
  reset();
  respond(demand({ is_owner: true }), []);
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  await view.click('[data-bay-action="close"]');
  await view.click("[data-bay-close-form] button");
  assert.match(view.host.textContent, /请写一句关闭原因/);
  assert.deepEqual(posts(), []);
  await view.type("[data-bay-close-form] textarea", "  计划调整  ");
  await view.click("[data-bay-close-form] button");
  assert.deepEqual(posts().at(-1), { method: "POST", path: "/v1/talent/demands/d1/close", body: { reason: "计划调整" }, opts: undefined });
  await view.unmount();

  reset();
  respond(demand({ is_owner: true, status: "closed", close_reason: "计划调整" }), []);
  const closed = await mount(React.createElement(DemandPane, paneProps("design")));
  assert.equal(closed.host.querySelector('[data-bay-action="close"]'), null);
  await closed.click('[data-bay-action="reopen"]');
  assert.deepEqual(globalThis.__bayTermsAsked, ["buyer"]);
  assert.equal(posts().at(-1).path, "/v1/talent/demands/d1/reopen");
  await closed.unmount();
});

test("发布者点「编辑需求」换成编辑表单，取消回到详情", async () => {
  reset();
  respond(demand({ is_owner: true }), []);
  const view = await mount(React.createElement(DemandPane, paneProps("design")));
  await view.click('[data-bay-action="edit"]');
  const editor = view.host.querySelector('[data-bay-demand-editor="edit"]');
  assert.ok(editor);
  assert.equal(editor.querySelector("input").value, "做一份路演稿");
  const cancel = [...editor.querySelectorAll("button")].find((node) => /取消/.test(node.textContent));
  await act(async () => cancel.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  await settle();
  assert.ok(view.host.querySelector("[data-bay-demand-summary]"));
  await view.unmount();
});

test("纯函数：邀请链接只落在门户、报价排序等回复的在前", () => {
  assert.equal(paneModule.demandInviteUrl("abc"), "https://oceanleo.test/bay/demands/invite/abc");
  assert.equal(paneModule.demandInviteUrl("me@example.com"), null);
  assert.equal(paneModule.demandInviteUrl(null), null);
  const sorted = paneModule.sortProposals([
    { id: "a", status: "accepted", created_at: "2026-10-03T00:00:00Z" },
    { id: "b", status: "pending", created_at: "2026-10-02T00:00:00Z" },
    { id: "c", status: "pending", created_at: "2026-10-01T00:00:00Z" },
  ]);
  assert.deepEqual(sorted.map((row) => row.id), ["c", "b", "a"]);
});
