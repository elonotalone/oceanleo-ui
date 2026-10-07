// W07（oceanleo-bay）：项目群里的订单卡 `BayOrderCard`（W02 的 `talent_order` 卡、置顶条都用它）。
// 在 jsdom 里真渲染、真点击；网络、付款就绪、Bay 状态全部用桩，付款模块里不存在任何真实调用。
// 覆盖：compact 版一行标题、一行状态与金额、一个按钮，点整张卡或按钮都打开 `{ kind: "order", id }`；
// 完整版写下一步，付款没就绪写「付款暂未开放」且没有付款按钮、不调发起付款；不是这单的人只看到提示、点了不打开；
// 同一单在消息里和置顶条里各一张，只取一次。
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://slide.oceanleo.com/" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = React;

const W = (globalThis.__w07card = { calls: [], routes: {}, opened: [], payConfigCalls: 0, payStartCalls: 0, buyerReady: false });

const httpStub = dataModule(`
  const W = globalThis.__w07card;
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function reply(method, path, body) {
    W.calls.push({ method, path, body });
    const out = W.routes[method + " " + path];
    if (out === undefined) throw new BayApiError("没有这条路由", 500);
    if (out instanceof Error) throw out;
    return structuredClone(out);
  }
  export const bayGet = (path) => reply("GET", path);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const paymentsStub = dataModule(`
  const W = globalThis.__w07card;
  export async function fetchBayPaymentConfig() {
    W.payConfigCalls += 1;
    return { enabled: true, buyer_ready: W.buyerReady, seller_ready: false, currency: "USD" };
  }
  export async function startBayPayment() { W.payStartCalls += 1; return { redirect_url: null }; }
`);
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const stateStub = dataModule("export function openBay(target){ globalThis.__w07card.opened.push(target); }");
const STUBS = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/bay/payments": paymentsStub,
  "../shell/bay-state": stateStub,
};
const { BayOrderCard } = await import(await compileModule("src/shell/bay/orders/BayOrderCard.tsx", STUBS));
const store = await import(await compileModule("src/shell/bay/orders/order-store.ts", STUBS));
const { BayApiError } = await import(httpStub);

function contract(extra = {}) {
  return {
    id: "k1",
    buyer_user_id: "buyer-1",
    seller_user_id: "seller-1",
    title: "一套品牌 Logo（三稿）",
    engagement_kind: "fixed",
    total_fen: 12000,
    currency: "USD",
    status: "active",
    payment_state: "unfunded",
    my_role: "buyer",
    seller: { user_id: "seller-1", display_name: "Mia", handle: "mia" },
    buyer: { user_id: "buyer-1", display_name: "Leo", handle: "leo" },
    ...extra,
  };
}

function reset(routes = { "GET /v1/talent/contracts/k1": { contract: contract() } }) {
  store.resetBayOrderStore();
  W.calls = [];
  W.routes = routes;
  W.opened = [];
  W.payConfigCalls = 0;
  W.payStartCalls = 0;
  W.buyerReady = false;
}

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await flush();
  return {
    host,
    q: (sel) => host.querySelector(sel),
    qa: (sel) => [...host.querySelectorAll(sel)],
    async click(sel) {
      const el = host.querySelector(sel);
      assert.ok(el, `找不到 ${sel}`);
      await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      await flush();
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const card = (props) => React.createElement(BayOrderCard, props);

test("compact：一行标题、一行状态与金额、一个按钮；点整张卡打开 Bay 里这单", async () => {
  reset();
  const view = await mount(card({ contractId: "k1", compact: true }));
  const root = view.q('[data-bay-order-card="k1"]');
  assert.equal(root.getAttribute("data-compact"), "true");
  assert.equal(view.q("[data-bay-order-title]").textContent, "一套品牌 Logo（三稿）");
  assert.match(view.q("[data-bay-order-title]").className, /truncate/, "标题只占一行");
  assert.equal(view.q("[data-bay-order-status]").textContent, "进行中");
  assert.equal(view.q("[data-bay-order-amount]").textContent, "$120.00");
  assert.equal(view.qa("button").length, 1, "只有一个按钮");
  assert.equal(view.q("[data-bay-order-next]"), null, "窄卡不写下一步");
  await view.click('[data-bay-order-card="k1"]');
  assert.deepEqual(W.opened, [{ kind: "order", id: "k1" }]);
  await view.click("[data-bay-order-open]");
  assert.deepEqual(W.opened, [{ kind: "order", id: "k1" }, { kind: "order", id: "k1" }], "按钮只打开一次，不连带卡片再开一次");
  await view.unmount();
});

test("完整版：写下一步与对方；付款没就绪写「付款暂未开放」，没有付款按钮，不调发起付款", async () => {
  reset();
  const view = await mount(card({ contractId: "k1" }));
  assert.equal(view.q('[data-bay-order-card="k1"]').getAttribute("data-compact"), "false");
  assert.match(view.q("[data-bay-order-next]").textContent, /下一步：付款暂未开放/);
  assert.match(view.host.textContent, /对方：Mia/);
  assert.equal(view.qa("button").length, 1);
  assert.equal(view.q("button").textContent, "查看订单");
  assert.doesNotMatch(view.host.textContent, /去付款/);
  assert.equal(W.payStartCalls, 0, "订单卡从不发起付款");
  await view.click("[data-bay-order-open]");
  assert.deepEqual(W.opened, [{ kind: "order", id: "k1" }]);
  await view.unmount();
});

test("卖家看到的下一步是自己的；交付后写自动完成倒计时", async () => {
  const due = new Date(Date.now() + 50 * 3_600_000).toISOString();
  reset({ "GET /v1/talent/contracts/k1": { contract: contract({ my_role: "seller", status: "delivered", payment_state: "disabled", auto_accept_at: due }) } });
  const view = await mount(card({ contractId: "k1" }));
  assert.match(view.q("[data-bay-order-next]").textContent, /等待买家验收，超时将自动通过/);
  assert.match(view.host.textContent, /对方：Leo/);
  assert.match(view.host.textContent, /还有 2 天 \d+ 小时自动完成/);
  await view.unmount();
});

test("不是这单的人：只看到提示，没有按钮，点了也不打开", async () => {
  reset({ "GET /v1/talent/contracts/k1": new BayApiError("没有权限", 403) });
  const view = await mount(card({ contractId: "k1", compact: true }));
  assert.match(view.host.textContent, /只有这笔订单的买家和卖家能看到详情。/);
  assert.equal(view.qa("button").length, 0);
  await view.click('[data-bay-order-card="k1"]');
  assert.deepEqual(W.opened, []);
  await view.unmount();
});

test("取不到订单（网络错）：说暂时取不到，仍能点进订单页", async () => {
  reset({ "GET /v1/talent/contracts/k1": new BayApiError("网络错误，请稍后再试。", 0) });
  const view = await mount(card({ contractId: "k1" }));
  assert.match(view.host.textContent, /订单信息暂时取不到。/);
  await view.click("[data-bay-order-open]");
  assert.deepEqual(W.opened, [{ kind: "order", id: "k1" }]);
  await view.unmount();
});

test("同一单在消息里和置顶条里各一张：只取一次", async () => {
  reset();
  const view = await mount(
    React.createElement("div", null, card({ contractId: "k1", compact: true }), card({ contractId: "k1" })),
  );
  assert.equal(view.qa('[data-bay-order-card="k1"]').length, 2);
  assert.equal(W.calls.filter((c) => c.method === "GET" && c.path === "/v1/talent/contracts/k1").length, 1);
  await view.unmount();
});

test("动作后放回缓存：订单卡跟着变，不闪成没有权限，随后重取完整的一份", async () => {
  reset();
  const view = await mount(card({ contractId: "k1", compact: true }));
  assert.equal(view.q("[data-bay-order-status]").textContent, "进行中");
  W.routes["GET /v1/talent/contracts/k1"] = { contract: contract({ status: "delivered" }) };
  store.storeBayOrder({ id: "k1", status: "delivered", title: "一套品牌 Logo（三稿）", total_fen: 12000, currency: "USD" });
  assert.equal(store.peekBayOrder("k1").my_role, "buyer", "动作接口没带身份：沿用上一版");
  assert.equal(store.peekBayOrder("k1").status, "delivered");
  await flush();
  assert.equal(view.q("[data-bay-order-status]").textContent, "已交付待验收");
  assert.equal(W.calls.filter((c) => c.path === "/v1/talent/contracts/k1").length, 2, "放回之后重取一次");
  await view.unmount();
});
