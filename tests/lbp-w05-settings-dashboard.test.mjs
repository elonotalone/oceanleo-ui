// leobay-projects W05：设置 → LeoBay 只剩一页（付款卡 + 收款账户）、钱页拆除、
// 数据面板里卖家的钱（收款状态、收入流水、对账单、导出）、各「去设置付款/收款」入口改指、退役种类名清扫。
// 网络与浏览器能力一律打桩；没有任何一条用例会真的碰 Stripe 或写库。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { LOCALES } from "../src/i18n/config.ts";
import { BAY_MONEY_MESSAGES } from "../src/i18n/ui/messages/bay-money-copy.ts";
import { LBP_W05_MESSAGES } from "../src/i18n/ui/messages/lbp-w05-copy.ts";
import {
  payoutTileView,
  productKindLabel,
} from "../src/shell/bay/dashboard/dashboard-model.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { stripJsComments } from "./helpers/strip-js-comments.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dom = new JSDOM('<!doctype html><html lang="zh"><body><main></main></body></html>', {
  pretendToBeVisual: true,
  url: "https://design.oceanleo.com/bay",
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// data: 桩里没法 import 裸包名，需要 React 的桩从这里取。
globalThis.__w05React = React;
if (!dom.window.Element.prototype.scrollIntoView) dom.window.Element.prototype.scrollIntoView = () => {};

// 导出 CSV：把下载的 Blob 与文件名截下来看（jsdom 的 <a>.click() 会去导航，不要真点）。
const downloads = [];
URL.createObjectURL = (blob) => {
  downloads.push({ blob, name: "" });
  return "blob:w05";
};
URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function click() {
  const last = downloads.at(-1);
  if (last) last.name = this.download;
};

const { createRoot } = await import("react-dom/client");

// ---------------------------------------------------------------- 替身 ----

const httpStub = dataModule(`
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function route(method, path, body, opts) {
    const bench = globalThis.__w05;
    bench.calls.push({ method, path, body, anonymous: Boolean(opts && opts.anonymous) });
    const hit = bench.routes[method + " " + path.split("?")[0]];
    if (hit === undefined) throw new BayApiError("no route " + method + " " + path, 404);
    if (hit && hit.__status) throw new BayApiError(hit.message || "失败", hit.__status);
    return typeof hit === "function" ? hit(body, path) : JSON.parse(JSON.stringify(hit));
  }
  export const bayGet = (path, opts) => route("GET", path, undefined, opts);
  export const bayPost = (path, body) => route("POST", path, body);
  export const bayPatch = (path, body) => route("PATCH", path, body);
  export const bayDelete = (path) => route("DELETE", path);
`);
const stateStub = dataModule(`
  export function bayEnabledHere() { return globalThis.__w05.enabled !== false; }
  export function requireBayLogin() { globalThis.__w05.loginCalls += 1; return false; }
  export function useBaySignedIn() { return globalThis.__w05.signedIn !== false; }
  export function openBay(target) { globalThis.__w05.opened.push(target); }
  export function replaceBay(target) { globalThis.__w05.replaced.push(target); }
`);
const uiStub = dataModule(`
  export function useUI() {
    return (zh, vars) => {
      const table = globalThis.__w05.tt;
      const out = table && table[zh] ? table[zh] : zh;
      if (!vars) return out;
      return out.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    };
  }
`);
const settingsOpenStub = dataModule(`
  export function openBaySettings(pane) { globalThis.__w05.settings.push(pane); }
`);
const localeStub = dataModule(`export function useLocale() { return "en"; }`);
const dashboardApiStub = dataModule(`
  export async function getBayDashboard(days) {
    globalThis.__w05.calls.push({ method: "GET", path: "dashboard:" + days });
    if (globalThis.__w05.dashboardError) throw new Error(globalThis.__w05.dashboardError);
    return JSON.parse(JSON.stringify(globalThis.__w05.dashboard));
  }
`);
const partsStub = dataModule(`
  const React = globalThis.__w05React;
  export function PaneLoading() { return React.createElement("div", { "data-bay-loading": "" }); }
  export function PaneMessage({ text }) { return React.createElement("p", { "data-bay-pane-message": "" }, text); }
`);
const bayMineStub = dataModule(`
  const React = globalThis.__w05React;
  export function BaySignInPrompt({ text }) { return React.createElement("p", { "data-bay-signin": "" }, text); }
`);
const pageEditStub = dataModule(`
  export function requestMinePageEdit(focus) { globalThis.__w05.editRequests.push(focus === undefined ? null : focus); }
`);
const dashboardPaneStub = dataModule(`
  const React = globalThis.__w05React;
  export function DashboardPane() { return React.createElement("div", { "data-w05-dashboard-stub": "" }); }
`);
const settingsTabsStub = dataModule(`
  export function openSettingsModal(tab) { globalThis.__w05.modalTabs.push(tab); }
`);

function bench(routes = {}, patch = {}) {
  globalThis.__w05 = {
    routes,
    calls: [],
    opened: [],
    replaced: [],
    settings: [],
    editRequests: [],
    modalTabs: [],
    loginCalls: 0,
    enabled: true,
    signedIn: true,
    tt: undefined,
    dashboard: DASHBOARD,
    dashboardError: "",
    ...patch,
  };
  downloads.length = 0;
  document.documentElement.lang = "zh";
  return globalThis.__w05;
}

async function tick() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(node) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  await tick();
  await tick();
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function click(node) {
  assert.ok(node, "要点的节点不存在");
  await act(async () => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await tick();
}

const buttonLabels = (host) => [...host.querySelectorAll("button")].map((el) => el.textContent.trim());
const buttonByText = (host, text) => [...host.querySelectorAll("button")].find((el) => el.textContent.trim() === text);

// ---------------------------------------------------------------- 夹具 ----

const DEV_CONFIG = {
  enabled: true,
  provider: "stripe_connect",
  currency: "USD",
  edition: "intl",
  channel_fee: { percent_bps: 390, fixed_minor: 30, note_zh: "支付通道费（覆盖 Stripe 收单成本，平台不以此盈利）" },
  buyer_ready: false,
  seller_ready: false,
  payout_countries: ["US"],
};
const READY_CONFIG = { ...DEV_CONFIG, buyer_ready: true, seller_ready: true };
const NO_ACCOUNT = { account: { edition: "intl", provider: "none", state: "none", verified_subject_kind: null, last_checked_at: null } };
const READY_ACCOUNT = { account: { edition: "intl", provider: "stripe_connect", state: "ready", verified_subject_kind: "individual", last_checked_at: null } };
const PENDING_ACCOUNT = { account: { edition: "intl", provider: "stripe_connect", state: "pending", verified_subject_kind: null, last_checked_at: null } };
const NOT_ELIGIBLE = { eligible: false, reason: "", blockers: [] };

function settingsRoutes(extra = {}) {
  return {
    "GET /v1/talent/payments/config": DEV_CONFIG,
    "GET /v1/talent/payout-account": NO_ACCOUNT,
    "GET /v1/talent/paid-work-eligibility": NOT_ELIGIBLE,
    ...extra,
  };
}

const DASHBOARD = {
  currency: "USD",
  range_days: 30,
  totals: {
    income_lifetime_fen: 0,
    income_fen: 0,
    income_prev_fen: 0,
    pending_fen: 0,
    users_lifetime: 3,
    new_users: 1,
    new_users_prev: 0,
    buyers: 0,
    opens: 5,
    opens_prev: 2,
    followers: 2,
    open_threads: 0,
    open_errors: 0,
    active_subscriptions: 0,
  },
  days: [
    { day: "2026-10-22", income_fen: 0, new_users: 1, opens: 2 },
    { day: "2026-10-23", income_fen: 0, new_users: 0, opens: 3 },
  ],
  products: [
    { item_kind: "app", item_id: "a1", title: "我的应用", status: "published", income_fen: 0, orders: 0, share: 0, opens: 5, users: 3, open_threads: 0, open_errors: 0, rating_avg: 0, rating_count: 0 },
    { item_kind: "service", item_id: "s1", title: "改简历", status: "published", income_fen: 0, orders: 0, share: 0, opens: 0, users: 0, open_threads: 0, open_errors: 0, rating_avg: 0, rating_count: 0 },
  ],
};

const LEDGER_TOTAL = 25;
function ledgerRow(n) {
  return {
    id: `l${n}`,
    counterparty_user_id: "u2",
    contract_id: n === 1 ? "c-1" : null,
    direction: "in",
    event: "completed",
    amount_fen: 1000 + n,
    currency: "USD",
    note: "",
    created_at: `2026-10-${String(Math.min(n, 28)).padStart(2, "0")}T10:00:00Z`,
    counterparty: { display_name: `买家${n}` },
  };
}
function ledgerPage(path, { shift = 0 } = {}) {
  const params = new URL(path, "https://x.test").searchParams;
  const page = Number(params.get("page") || 1);
  const limit = Number(params.get("limit") || 50);
  const start = Math.max(0, (page - 1) * limit - (page > 1 ? shift : 0));
  const all = Array.from({ length: LEDGER_TOTAL }, (_, i) => ledgerRow(i + 1));
  const items = all.slice(start, start + limit);
  return { items, page, limit, total: LEDGER_TOTAL, has_more: start + limit < LEDGER_TOTAL, total_in_fen: 0, total_out_fen: 0, monthly: [] };
}
const STATEMENT = {
  contract_id: "c-1",
  counterparty: { display_name: "买家1" },
  terms: { title: "课程验收单", status: "completed", engagement_kind: "fixed" },
  tier: null,
  timeline: [{ id: "t1", contract_id: "c-1", direction: "in", event: "completed", amount_fen: 1001, currency: "USD", note: "", created_at: "2026-10-01T10:00:00Z", counterparty_user_id: "u2", counterparty: null }],
  amount_fen: 1001,
  currency: "USD",
  money_notice: "",
};

function dashboardRoutes(extra = {}) {
  return {
    ...settingsRoutes(),
    "GET /v1/talent/ledger": (_body, path) => ledgerPage(path),
    "GET /v1/talent/ledger/statement": STATEMENT,
    ...extra,
  };
}

// ------------------------------------------------------------- 编译入口 ----

// payments.ts 在模块里缓存 30 秒的付款配置；每次编译带一个只有它自己认得的桩键，换一张新的模块图，用例之间不串台。
let freshSeq = 0;
function fresh(stubs) {
  freshSeq += 1;
  return { ...stubs, [`./__w05-fresh-${freshSeq}`]: dataModule("export {};") };
}

async function loadSection() {
  const url = await compileModule("src/shell/bay/settings/BaySettingsSection.tsx", fresh({
    "../../../lib/bay/http": httpStub,
    "../shell/bay-state": stateStub,
    "../../../i18n/ui/useUI": uiStub,
  }));
  return import(`${url}?case=${Math.random().toString(36).slice(2)}`);
}

async function loadSettingsPane() {
  const url = await compileModule("src/shell/bay/settings/BaySettingsPane.tsx", fresh({
    "../../../lib/bay/http": httpStub,
    "../shell/bay-state": stateStub,
    "../../../i18n/ui/useUI": uiStub,
    "../page/mine-page-edit": pageEditStub,
    "./settings-open": settingsOpenStub,
  }));
  return import(`${url}?case=${Math.random().toString(36).slice(2)}`);
}

async function loadDashboard() {
  const url = await compileModule("src/shell/bay/dashboard/DashboardPane.tsx", fresh({
    "../../../lib/bay/http": httpStub,
    "../../../lib/bay/dashboard": dashboardApiStub,
    "../shell/bay-state": stateStub,
    "../shell/BayMine": bayMineStub,
    "../supply/parts": partsStub,
    "../settings/settings-open": settingsOpenStub,
    "../../../i18n/ui/useUI": uiStub,
    "next-intl": localeStub,
  }));
  return import(`${url}?case=${Math.random().toString(36).slice(2)}`);
}

async function loadDashboardTab() {
  const url = await compileModule("src/shell/bay/mine/MyDashboardTab.tsx", fresh({
    "../shell/bay-state": stateStub,
    "../supply/parts": partsStub,
    "../settings/settings-open": settingsOpenStub,
    "../page/mine-page-edit": pageEditStub,
    "../dashboard/DashboardPane": dashboardPaneStub,
    "../../../i18n/ui/useUI": uiStub,
  }));
  return import(`${url}?case=${Math.random().toString(36).slice(2)}`);
}

const cardIds = (host) => [...host.querySelectorAll("[data-bay-money-card]")].map((el) => el.getAttribute("data-bay-money-card"));

// ========================================================= 设置：一页 ====

test("设置 → LeoBay 只有一页：付款卡 + 收款账户两块，没有页签；旧的四块内容不再出现", async () => {
  bench(settingsRoutes());
  const { BaySettingsSection } = await loadSection();
  const view = await render(React.createElement(BaySettingsSection));
  assert.deepEqual(cardIds(view.host), ["payment-card", "payout"]);
  assert.equal(view.host.querySelector("[data-bay-settings-tab]"), null);
  assert.equal(view.host.querySelector("nav"), null, "不再有页签条");
  const text = view.host.textContent;
  assert.match(text, /付款卡/);
  assert.match(text, /收款账户/);
  for (const gone of ["卖家资料", "资质审核", "规则与条款", "编辑主页", "你花了多少钱", "本月收入", "累计收入", "平台怎么收费", "导出账本"]) {
    assert.equal(text.includes(gone), false, `设置页里不该再出现「${gone}」`);
  }
  view.unmount();
});

test("旧 pane：设置窗里不管传什么 pane 都是这一页；右栏 settings:money / 不带 pane 也是这一页", async () => {
  const { BaySettingsSection } = await loadSection();
  for (const pane of [undefined, "money", "vetting", "profile"]) {
    bench(settingsRoutes());
    const view = await render(React.createElement(BaySettingsSection, { pane }));
    assert.deepEqual(cardIds(view.host), ["payment-card", "payout"], `pane=${pane}`);
    view.unmount();
  }
  // 右栏版（?bay=settings:<pane>）：money / 不带 pane 显示同一页，并带「在设置中打开」。
  const { BaySettingsPane } = await loadSettingsPane();
  for (const pane of [undefined, "money"]) {
    const w = bench(settingsRoutes());
    const target = pane ? { kind: "settings", pane } : { kind: "settings" };
    const view = await render(React.createElement(BaySettingsPane, { target, layout: "docked", siteKey: "design" }));
    assert.deepEqual(cardIds(view.host), ["payment-card", "payout"], `右栏 pane=${pane}`);
    await click(view.host.querySelector("[data-bay-open-in-settings]"));
    assert.deepEqual(w.settings, [pane], "「在设置中打开」仍把 pane 原样交给 openBaySettings");
    assert.deepEqual(w.replaced, [], "money / 不带 pane 不转走");
    view.unmount();
  }
});

test("右栏的老深链 settings:vetting / settings:profile（网关通知与旧书签仍会发）：转去我的主页，不显示付款页", async () => {
  const { BaySettingsPane } = await loadSettingsPane();
  for (const [pane, focus] of [["vetting", "vetting"], ["profile", null]]) {
    const w = bench(settingsRoutes());
    const view = await render(React.createElement(BaySettingsPane, { target: { kind: "settings", pane }, layout: "docked", siteKey: "design" }));
    assert.equal(view.host.querySelector("[data-bay-money-card]"), null, `pane=${pane} 不画付款卡/收款账户`);
    assert.equal(view.host.querySelector("[data-bay-open-in-settings]"), null);
    assert.deepEqual(w.editRequests, [focus], "vetting 明确要去核验块；profile 只是进编辑");
    assert.deepEqual(w.replaced, [{ kind: "mine", tab: "page" }], "换掉这一层详情，不新增返回层");
    assert.equal(w.calls.length, 0, "转走的不取设置页的数据");
    view.unmount();
  }
});

test("openBaySettings 保留 (pane?) 签名，任何 pane 都只打开设置窗的 bay 栏", async () => {
  const w = bench();
  const url = await compileModule("src/shell/bay/settings/settings-open.ts", fresh({
    "../../../pages/settings/settings-tabs": settingsTabsStub,
  }));
  const { openBaySettings } = await import(`${url}?case=${Math.random().toString(36).slice(2)}`);
  assert.equal(openBaySettings.length <= 1, true);
  for (const pane of ["profile", "vetting", "money", undefined]) openBaySettings(pane);
  assert.deepEqual(w.modalTabs, ["bay", "bay", "bay", "bay"]);
});

test("没就绪：付款暂未开放、收款暂未开放、绑卡/开户/提现暂未开放，没有任何可点的相关按钮，也不发 POST", async () => {
  const w = bench(settingsRoutes());
  const { BaySettingsSection } = await loadSection();
  const view = await render(React.createElement(BaySettingsSection));
  const text = view.host.textContent;
  for (const line of ["付款暂未开放", "绑卡暂未开放", "收款暂未开放", "开户暂未开放", "提现暂未开放"]) {
    assert.ok(text.includes(line), `缺「${line}」`);
  }
  assert.equal(view.host.querySelector("button"), null, "没就绪时这一页一个按钮都没有");
  assert.equal(w.calls.some((call) => call.method !== "GET"), false);
  assert.equal(w.calls.some((call) => call.path === "/v1/talent/payment-method"), false, "没就绪不读卡");
  view.unmount();
});

test("就绪时：有卡显示卡与有效期，收款账户显示状态；仍然没有绑卡/开户/提现按钮", async () => {
  const w = bench(
    settingsRoutes({
      "GET /v1/talent/payments/config": READY_CONFIG,
      "GET /v1/talent/payment-method": { method: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030, state: "ready" } },
      "GET /v1/talent/payout-account": READY_ACCOUNT,
      "GET /v1/talent/paid-work-eligibility": { eligible: true, reason: "", blockers: [] },
    }),
  );
  const { BaySettingsSection } = await loadSection();
  const view = await render(React.createElement(BaySettingsSection));
  const text = view.host.textContent;
  assert.match(text, /已绑卡 · visa ·••• 4242/);
  assert.match(text, /有效期 12\/2030/);
  assert.match(text, /收款账户状态：可以收款/);
  assert.equal(text.includes("付款暂未开放"), false);
  assert.equal(text.includes("收款暂未开放"), false);
  assert.equal(view.host.querySelector("[data-bay-money-why]"), null, "能收款时不列「为什么还收不了款」");
  assert.match(text, /开户暂未开放/);
  assert.match(text, /提现暂未开放/);
  assert.equal(view.host.querySelector("button"), null);
  assert.equal(w.calls.some((call) => call.method !== "GET"), false);
  view.unmount();
});

test("付款已开放但没有存卡：说「还没有付款卡」，仍然只有「绑卡暂未开放」没有绑卡按钮", async () => {
  bench(
    settingsRoutes({
      "GET /v1/talent/payments/config": { ...DEV_CONFIG, buyer_ready: true },
      "GET /v1/talent/payment-method": { method: null },
    }),
  );
  const { BaySettingsSection } = await loadSection();
  const view = await render(React.createElement(BaySettingsSection));
  assert.match(view.host.textContent, /还没有付款卡/);
  assert.match(view.host.textContent, /绑卡暂未开放/);
  assert.equal(view.host.textContent.includes("付款暂未开放"), false);
  assert.equal(view.host.querySelector("button"), null);
  view.unmount();
});

test("为什么还收不了款：网关给的原因逐条列出，英文界面不留中文，通道没开放时不重复卡片上已写的三句", async () => {
  bench(
    settingsRoutes({
      "GET /v1/talent/paid-work-eligibility": {
        eligible: false,
        reason: "x",
        blockers: [
          "放款通道尚未接入，平台还不能替你收钱；你现在可以接免费协作的活，也可以和对方直接结算（站外结算平台不禁止，但也不记录、不介入）",
          "USD payouts are not available yet：美元账本上还没有能付出美元的收款通道，现有通道（微信分账 / 支付宝 / 境内银行卡）只结算人民币",
          "到收益页选择收款国家并开通收款账户，由 Stripe 完成核验。",
          "收款账户还不能收款",
        ],
      },
    }),
  );
  document.documentElement.lang = "en";
  globalThis.__w05.tt = { ...BAY_MONEY_MESSAGES.en, ...LBP_W05_MESSAGES.en };
  const { BaySettingsSection } = await loadSection();
  const view = await render(React.createElement(BaySettingsSection));
  const why = view.host.querySelector("[data-bay-money-why]");
  assert.ok(why, "有原因时要有「为什么还收不了款」");
  assert.match(why.textContent, /Why you can't get paid yet/);
  const lines = [...view.host.querySelectorAll("[data-bay-money-blocker]")].map((el) => el.textContent);
  assert.deepEqual(lines, [
    "Payout rail is not connected yet",
    "There is no payout channel that pays out US dollars yet",
    "Your payout account can't receive payments yet",
  ]);
  assert.equal(/[一-鿿]/.test(view.host.textContent), false, `英文界面不该留中文：${view.host.textContent}`);
  assert.match(view.host.textContent, /Payouts are not available yet/);
  assert.match(view.host.textContent, /Account setup is not available yet/);
  view.unmount();
});

test("没登录：只给登录提示，点登录走 requireBayLogin；加载失败给重试", async () => {
  let w = bench(settingsRoutes({ "GET /v1/talent/payout-account": { __status: 401, message: "请先登录" } }));
  const { BaySettingsSection } = await loadSection();
  let view = await render(React.createElement(BaySettingsSection));
  assert.ok(view.host.querySelector("[data-bay-settings-guest]"));
  assert.match(view.host.textContent, /登录后查看付款卡和收款账户/);
  assert.equal(view.host.querySelector("[data-bay-money-card]"), null);
  await click(buttonByText(view.host, "登录"));
  assert.equal(w.loginCalls, 1);
  view.unmount();

  w = bench(settingsRoutes({ "GET /v1/talent/payout-account": { __status: 500, message: "后端出错了" } }));
  view = await render(React.createElement(BaySettingsSection));
  assert.match(view.host.querySelector("[role=alert]").textContent, /后端出错了/);
  assert.ok(buttonByText(view.host, "重试"));
  view.unmount();
});

test("境内：设置栏整块不渲染，也不发任何请求", async () => {
  const w = bench(settingsRoutes(), { enabled: false });
  const { BaySettingsSection } = await loadSection();
  const view = await render(React.createElement(BaySettingsSection));
  assert.equal(view.host.querySelector("[data-bay-settings-section]"), null);
  assert.equal(w.calls.length, 0);
  view.unmount();
});

// ================================================== 钱页拆除、没有残留入口 ====

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

test("钱页与「编辑主页」那扇门已删，src 里没人再引用；页签常量也不在了", () => {
  assert.equal(existsSync(join(REPO, "src/shell/bay/settings/BayMoneySection.tsx")), false);
  assert.equal(existsSync(join(REPO, "src/shell/bay/settings/BaySettingsProfileDoor.tsx")), false);
  const hits = [];
  for (const file of sourceFiles(join(REPO, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const word of ["BayMoneySection", "BaySettingsProfileDoor", "BAY_SETTINGS_BLOCKS", "takeBaySettingsPane", "requestBaySettingsPane", "data-bay-settings-tab"]) {
      if (text.includes(word)) hits.push(`${file.slice(REPO.length)}: ${word}`);
    }
  }
  assert.deepEqual(hits, []);
  const section = readFileSync(join(REPO, "src/shell/bay/settings/BaySettingsSection.tsx"), "utf8");
  assert.doesNotMatch(section, /BayVettingSection|BayTermsOverview|BaySettingsProfileDoor|BayMoneySection/);
});

test("money-ui 五个导出名保持（合同 I-6），买家花销与收费说明不再由设置页渲染", async () => {
  const mod = await import(await compileModule("src/shell/bay/settings/money-ui.tsx", {}));
  for (const name of ["StatementPanel", "LedgerList", "MoneyStat", "MonthlyBars", "useBayMoneyLocale"]) {
    assert.equal(typeof mod[name], "function", name);
  }
  const section = readFileSync(join(REPO, "src/shell/bay/settings/BaySettingsSection.tsx"), "utf8");
  assert.doesNotMatch(section, /MonthlyBars|LedgerList|StatementPanel|total_out_fen|fetchBayLedger/);
});

// ============================================================ 数据面板 ====

test("数据面板：收款状态格紧挨着「托管中」；没开放时说清为什么、什么时候到账；点开去设置页", async () => {
  const w = bench(dashboardRoutes());
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  const markers = [...view.host.querySelectorAll("[data-bay-stat]")].map((el) => el.getAttribute("data-bay-stat"));
  const at = markers.indexOf("pending");
  assert.ok(at >= 0 && markers[at + 1] === "payout", `payout 应紧跟 pending：${markers.join(",")}`);
  const tile = view.host.querySelector('[data-bay-stat="payout"]');
  assert.match(tile.textContent, /收款状态/);
  assert.match(tile.textContent, /暂未开放/);
  assert.match(tile.querySelector("[data-bay-stat-hint]").textContent, /平台暂时不代收代付；开放后，订单款验收通过即转入你的收款账户/);
  await click(tile);
  assert.deepEqual(w.settings, [undefined], "点收款状态打开新的单页（不带 pane）");
  view.unmount();
});

test("收款状态格的三种说明：可收款（什么时候到账）、账户还没办好（点开看原因）、取不到时只显示「—」", async () => {
  const { DashboardPane } = await loadDashboard();
  const props = { target: { kind: "dashboard" }, layout: "page", siteKey: "design" };

  bench(dashboardRoutes({ "GET /v1/talent/payments/config": READY_CONFIG, "GET /v1/talent/payout-account": READY_ACCOUNT }));
  let view = await render(React.createElement(DashboardPane, props));
  let tile = view.host.querySelector('[data-bay-stat="payout"]');
  assert.match(tile.textContent, /可以收款/);
  assert.match(tile.textContent, /订单款先托管，验收通过后转入你的收款账户/);
  view.unmount();

  bench(dashboardRoutes({ "GET /v1/talent/payments/config": READY_CONFIG, "GET /v1/talent/payout-account": PENDING_ACCOUNT }));
  view = await render(React.createElement(DashboardPane, props));
  tile = view.host.querySelector('[data-bay-stat="payout"]');
  assert.match(tile.textContent, /通道审核中/);
  assert.match(tile.textContent, /收款账户还不能收款，点开看原因/);
  view.unmount();

  bench(dashboardRoutes({ "GET /v1/talent/payout-account": { __status: 500, message: "炸了" } }));
  view = await render(React.createElement(DashboardPane, props));
  tile = view.host.querySelector('[data-bay-stat="payout"]');
  assert.match(tile.textContent, /—/);
  assert.equal(tile.querySelector("[data-bay-stat-hint]"), null);
  assert.ok(view.host.querySelector('[data-bay-stat="income"]'), "收款状态取不到不拖累整张面板");
  view.unmount();
});

test("数据面板分组用白色卡片隔开，面板本身不铺白板；收入数字只有一套（只有一个「累计收入」）", async () => {
  bench(dashboardRoutes());
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  const root = view.host.querySelector('[data-bay-pane="dashboard"]');
  assert.doesNotMatch(root.className, /\bbg-white\b/, "面板外框不铺白");
  const cards = [
    view.host.querySelector('[data-bay-chart="overview"]'),
    view.host.querySelector('[data-bay-dashboard-card="products"]'),
    view.host.querySelector("[data-bay-dashboard-ledger]"),
  ];
  for (const card of cards) {
    assert.ok(card, "缺一张卡片");
    assert.match(card.className, /\bbg-white\b/);
    assert.match(card.className, /\bborder\b/);
    assert.match(card.className, /\brounded-xl\b/);
  }
  assert.equal((view.host.textContent.match(/累计收入/g) || []).length, 1);
  // 页头（标题 + 时间段）不在任何白色卡片里。
  const header = view.host.querySelector("h2");
  assert.equal(cards.some((card) => card.contains(header)), false);
  view.unmount();
});

test("收入流水：逐笔列出、只读 direction=in、没登录的人看不到；说明里写明记账不是钱、数字以上面为准", async () => {
  const w = bench(dashboardRoutes());
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  const card = view.host.querySelector("[data-bay-dashboard-ledger]");
  assert.match(card.querySelector("h3").textContent, /收入流水/);
  assert.equal(card.querySelectorAll("[data-bay-ledger-row]").length, 20, "首屏 20 笔");
  assert.match(card.textContent, /\+\$10\.01/);
  assert.match(card.textContent, /验收完成 · 买家1/);
  assert.match(card.querySelector("[data-bay-ledger-notice]").textContent, /下面的金额是记账，不是可动用的钱：平台目前不代收代付/);
  assert.match(card.textContent, /流水只是逐笔记录，收入数字以上面的为准/);
  const ledgerCalls = w.calls.filter((call) => call.path.startsWith("/v1/talent/ledger") && !call.path.includes("statement"));
  assert.ok(ledgerCalls.length >= 1);
  for (const call of ledgerCalls) assert.match(call.path, /direction=in/);
  assert.equal(w.calls.some((call) => /direction=out/.test(call.path)), false, "买家花销不在这里");
  assert.equal(w.calls.some((call) => call.path === "/v1/talent/ledger/summary"), false, "不再另算一套累计收入");
  view.unmount();

  const guest = bench(dashboardRoutes(), { signedIn: false });
  const view2 = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  assert.ok(view2.host.querySelector("[data-bay-signin]"));
  assert.equal(view2.host.querySelector("[data-bay-dashboard-ledger]"), null);
  assert.equal(guest.calls.length, 0);
  view2.unmount();
});

test("收入流水：收款开放后的说明换成托管规则", async () => {
  bench(dashboardRoutes({ "GET /v1/talent/payments/config": READY_CONFIG, "GET /v1/talent/payout-account": READY_ACCOUNT }));
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  assert.match(view.host.querySelector("[data-bay-ledger-notice]").textContent, /订单款由 Stripe 托管，验收后直接转入你的 Stripe 收款账户；平台不抽佣/);
  view.unmount();
});

test("收入流水：收款状态还在取的时候先不写「钱能不能动」那句，取到再写（不先写错一句又换掉）", async () => {
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  bench(dashboardRoutes({ "GET /v1/talent/payout-account": () => gate.then(() => NO_ACCOUNT) }));
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  const card = view.host.querySelector("[data-bay-dashboard-ledger]");
  assert.ok(card, "流水卡不等收款状态");
  assert.equal(card.querySelector("[data-bay-ledger-notice]"), null);
  assert.match(view.host.querySelector('[data-bay-stat="payout"]').textContent, /—/);
  release();
  await tick();
  await tick();
  assert.match(card.querySelector("[data-bay-ledger-notice]").textContent, /平台目前不代收代付/);
  view.unmount();
});

test("收入流水：只有带订单的行能看对账单；点开出现对账单，可关闭", async () => {
  const w = bench(dashboardRoutes());
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  const card = view.host.querySelector("[data-bay-dashboard-ledger]");
  const links = [...card.querySelectorAll("button")].filter((el) => el.textContent.trim() === "查看对账单");
  assert.equal(links.length, 1, "20 行里只有第 1 行有 contract_id");
  assert.equal(card.querySelector("[data-bay-statement]"), null);
  await click(links[0]);
  assert.ok(w.calls.some((call) => call.path === "/v1/talent/ledger/statement?contract_id=c-1"));
  const panel = card.querySelector('[data-bay-statement="c-1"]');
  assert.ok(panel, "对账单出现在流水卡里");
  assert.match(panel.textContent, /课程验收单/);
  assert.match(panel.textContent, /订单对账单/);
  await click(buttonByText(panel, "关闭"));
  assert.equal(card.querySelector("[data-bay-statement]"), null);
  view.unmount();
});

test("对账单取不到时给一句失败提示，不抛未处理的 Promise", async () => {
  bench(dashboardRoutes({ "GET /v1/talent/ledger/statement": { __status: 500, message: "炸了" } }));
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  const card = view.host.querySelector("[data-bay-dashboard-ledger]");
  await click([...card.querySelectorAll("button")].find((el) => el.textContent.trim() === "查看对账单"));
  assert.match(card.querySelector("[role=alert]").textContent, /加载失败，请稍后再试/);
  assert.equal(card.querySelector("[data-bay-statement]"), null);
  view.unmount();
});

test("收入流水：加载更多按页追加并按 id 去重，没有更多时按钮消失", async () => {
  // 第二页在翻页期间被新记录往后挤了 1 条：l20 会在两页里都出现。
  const w = bench(
    dashboardRoutes({
      "GET /v1/talent/ledger": (_body, path) => ledgerPage(path, { shift: 1 }),
    }),
  );
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  const card = view.host.querySelector("[data-bay-dashboard-ledger]");
  assert.equal(card.querySelectorAll("[data-bay-ledger-row]").length, 20);
  const more = card.querySelector('[data-bay-action="ledger-more"]');
  assert.ok(more);
  await click(more);
  const ids = [...card.querySelectorAll("[data-bay-ledger-row]")].map((el) => el.getAttribute("data-bay-ledger-row"));
  assert.equal(ids.length, LEDGER_TOTAL, "25 条全在，l20 没有重复");
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(card.querySelector('[data-bay-action="ledger-more"]'), null);
  assert.ok(w.calls.some((call) => /page=2/.test(call.path)));
  view.unmount();
});

test("收入流水：导出 CSV 翻完所有页（每页 100），表头与币种金额对得上，文件名 bay-income.csv", async () => {
  const w = bench(dashboardRoutes());
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  const card = view.host.querySelector("[data-bay-dashboard-ledger]");
  await click(card.querySelector('[data-bay-action="export-ledger"]'));
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, "bay-income.csv");
  const bytes = new Uint8Array(await downloads[0].blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "带 BOM，Excel 打开不乱码");
  const csv = await downloads[0].blob.text(); // text() 会吃掉 BOM
  const lines = csv.split("\n");
  assert.equal(lines.length, 1 + LEDGER_TOTAL, "表头 + 全部 25 条（不只是屏幕上的 20 条）");
  assert.equal(lines[0], '"时间","对方","订单","事件","收支","金额","已记录","备注"');
  assert.match(lines[1], /"买家1"/);
  assert.match(lines[1], /"c-1"/);
  assert.match(lines[1], /"收入"/);
  assert.match(lines[1], /"10\.01"/);
  const exportCalls = w.calls.filter((call) => /limit=100/.test(call.path));
  assert.equal(exportCalls.length, 1, "25 条一页就够，has_more 为假就停");
  view.unmount();
});

test("收入流水：流水取不到时只在这张卡里给重试，其余数字照常显示", async () => {
  const w = bench(dashboardRoutes({ "GET /v1/talent/ledger": { __status: 500, message: "账本暂时读不了" } }));
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  const card = view.host.querySelector("[data-bay-dashboard-ledger]");
  assert.match(card.querySelector("[data-bay-ledger-error]").textContent, /账本暂时读不了/);
  assert.equal(card.querySelector('[data-bay-action="export-ledger"]'), null, "没有数据就没有导出");
  assert.ok(view.host.querySelector('[data-bay-stat="income_lifetime"]'), "其余数字不受影响");
  w.routes["GET /v1/talent/ledger"] = (_body, path) => ledgerPage(path);
  await click(buttonByText(card, "重试"));
  assert.equal(card.querySelectorAll("[data-bay-ledger-row]").length, 20);
  view.unmount();
});

test("数据面板主数据取不到：整页给重试（收款与流水不抢戏）", async () => {
  bench(dashboardRoutes(), { dashboardError: "面板暂时读不了" });
  const { DashboardPane } = await loadDashboard();
  const view = await render(React.createElement(DashboardPane, { target: { kind: "dashboard" }, layout: "page", siteKey: "design" }));
  assert.match(view.host.querySelector("[data-bay-pane-message]").textContent, /面板暂时读不了/);
  assert.equal(view.host.querySelector("[data-bay-dashboard-ledger]"), null);
  view.unmount();
});

// ============================================ 「我的 → 数据面板」外壳按钮 ====

test("我的 → 数据面板顶上：收款设置 → openBaySettings()；资质核验 → 进我的主页的核验块（I-8）", async () => {
  const w = bench();
  const { BayMineDashboardTab } = await loadDashboardTab();
  const view = await render(React.createElement(BayMineDashboardTab, { target: { kind: "mine", tab: "dashboard" }, layout: "page", siteKey: "design" }));
  assert.deepEqual(buttonLabels(view.host).slice(0, 2), ["收款设置", "资质核验"]);
  assert.equal(view.host.textContent.includes("认证"), false, "旧的「认证」「收款」按钮已改名");
  await click(buttonByText(view.host, "收款设置"));
  assert.deepEqual(w.settings, [undefined]);
  assert.deepEqual(w.opened, []);
  await click(buttonByText(view.host, "资质核验"));
  assert.deepEqual(w.editRequests, ["vetting"]);
  assert.deepEqual(w.opened, [{ kind: "mine", tab: "page" }]);
  assert.deepEqual(w.settings, [undefined], "资质核验不再进设置");
  view.unmount();
});

// =========================================== 入口改指（源码级 + 文案保持）====

const ENTRY_FILES = [
  ["src/shell/bay/orders/OrderPane.tsx", ["去设置付款方式"]],
  ["src/shell/bay/apppaid/AppPurchaseBar.tsx", ["去检查付款方式", "去设置付款方式"]],
  ["src/shell/bay/apppaid/PricingManagePanel.tsx", ["去开通收款"]],
  ["src/shell/bay/apppaid/MyBoughtAppsPane.tsx", ["去检查付款方式"]],
  ["src/shell/bay/seller/MyServicesPane.tsx", ["去设置里看"]],
  ["src/shell/bay/mine/MyDashboardTab.tsx", ["收款设置"]],
];

test("所有「去设置付款/收款」入口都打开新的单页 openBaySettings()，按钮文字保持动作说法", () => {
  for (const [file, labels] of ENTRY_FILES) {
    const text = readFileSync(join(REPO, file), "utf8");
    assert.match(text, /openBaySettings\(\)/, `${file} 要调用 openBaySettings()`);
    assert.doesNotMatch(text, /openBaySettings\(\s*["']/, `${file} 不再指定 pane`);
    assert.doesNotMatch(text, /kind:\s*"settings"/, `${file} 不再 openBay 到 settings 目标`);
    assert.doesNotMatch(text, /pane:\s*"money"/, `${file} 不再指向钱页签`);
    for (const label of labels) assert.ok(text.includes(label), `${file} 缺按钮文字「${label}」`);
  }
  // 数据面板里的收款状态格也是一个入口。
  assert.match(readFileSync(join(REPO, "src/shell/bay/dashboard/DashboardPane.tsx"), "utf8"), /openBaySettings\(\)/);
});

test("没有任何文件还把人送进「钱」页签：全 src 里 openBay 到 settings:money 和 openBaySettings(\"money\") 都清零（只剩类型与深链解析）", () => {
  const hits = [];
  for (const file of sourceFiles(join(REPO, "src"))) {
    const text = stripJsComments(readFileSync(file, "utf8"));
    if (/openBaySettings\(\s*["']money["']\s*\)/.test(text)) hits.push(`${file.slice(REPO.length)}: openBaySettings("money")`);
    if (/openBay\(\{[^}]*kind:\s*"settings"[^}]*pane:\s*"money"/.test(text)) hits.push(`${file.slice(REPO.length)}: openBay settings money`);
  }
  assert.deepEqual(hits, []);
});

// ====================================================== 模型与取数小件 ====

test("payoutTileView：三种状态与「还没取到」", () => {
  assert.deepEqual(payoutTileView(null), { value: "—", hint: "" });
  assert.deepEqual(payoutTileView({ sellerReady: false, payable: false, stateLabel: "还没有收款账户" }), {
    value: "暂未开放",
    hint: "平台暂时不代收代付；开放后，订单款验收通过即转入你的收款账户。",
  });
  assert.deepEqual(payoutTileView({ sellerReady: true, payable: true, stateLabel: "可以收款" }), {
    value: "可以收款",
    hint: "订单款先托管，验收通过后转入你的收款账户。",
  });
  assert.deepEqual(payoutTileView({ sellerReady: true, payable: false, stateLabel: "开户办理中" }), {
    value: "开户办理中",
    hint: "收款账户还不能收款，点开看原因。",
  });
});

test("商品行的种类列只用统一的五个名字（人工服务 / 现成文件 / 网站与软件服务 / 课程 / 其他）", () => {
  assert.equal(productKindLabel({ item_kind: "app", item_id: "a" }), "网站与软件服务");
  assert.equal(productKindLabel({ item_kind: "lesson", item_id: "l" }), "课程");
  assert.equal(productKindLabel({ item_kind: "service", item_id: "s" }), "人工服务");
  assert.equal(productKindLabel({ item_kind: "service", item_id: "s", listing_kind: "digital" }), "现成文件");
  assert.equal(productKindLabel({ item_kind: "service", item_id: "s", listing_kind: "other" }), "其他");
  assert.equal(productKindLabel({ item_kind: "service", item_id: "other" }), "其他订单");
  for (const retired of ["作品", "服务", "素材", "成品文件"]) {
    for (const item of [{ item_kind: "app", item_id: "a" }, { item_kind: "service", item_id: "s" }]) {
      assert.notEqual(productKindLabel(item), retired);
    }
  }
});

test("收款账户状态：网关的 ready 认得是「可以收款」；USD 那句映射成带译文的短句", async () => {
  const money = await import(await compileModule("src/lib/bay/money.ts", fresh({ "./http": httpStub })));
  assert.equal(money.bayPayoutAccountStateLabel("ready"), "可以收款");
  assert.equal(money.bayPayoutAccountStateLabel("active"), "可以收款");
  assert.equal(money.bayPayoutAccountIsPayable("ready"), true);
  assert.equal(money.bayPayoutAccountIsPayable("pending"), false);
  assert.equal(money.bayPayoutAccountIsPayable(undefined), false);
  assert.equal(
    money.mapBayPayoutBlockerLine("USD payouts are not available yet：美元账本上还没有能付出美元的收款通道，现有通道（微信分账 / 支付宝 / 境内银行卡）只结算人民币"),
    "美元账本上还没有能付出美元的收款通道",
  );
});

test("fetchBayPayoutStatus：通道、账户状态、原因一起给；通道没开放时去掉卡片上已写的三句", async () => {
  const w = bench(
    settingsRoutes({
      "GET /v1/talent/paid-work-eligibility": {
        eligible: false,
        reason: "",
        blockers: ["收款暂未开放", "开户暂未开放", "收款账户还在通道那边办理中，办好后这里会自动放开"],
      },
      "GET /v1/talent/payout-account": PENDING_ACCOUNT,
    }),
  );
  const url = await compileModule("src/lib/bay/money.ts", fresh({ "./http": httpStub }));
  const money = await import(`${url}?case=${Math.random().toString(36).slice(2)}`);
  const closed = await money.fetchBayPayoutStatus();
  assert.deepEqual(closed, {
    sellerReady: false,
    state: "pending",
    stateLabel: "通道审核中",
    blockers: ["收款账户还在通道那边办理中，办好后这里会自动放开"],
  });
  assert.equal(w.calls.some((call) => call.method !== "GET"), false);
});

// ================================================ 文案与退役种类名清扫 ====

const HAN = /[一-鿿]/;

test("lbp-w05 分表：17 语齐全、占位符不丢、非中日韩不含汉字、中文站 key 等于值", () => {
  const keys = Object.keys(LBP_W05_MESSAGES.zh);
  assert.ok(keys.length >= 25, `只有 ${keys.length} 条`);
  assert.equal(LOCALES.length, 17);
  for (const key of keys) {
    assert.equal(LBP_W05_MESSAGES.zh[key], key);
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value = LBP_W05_MESSAGES[locale]?.[key];
      assert.ok(typeof value === "string" && value.trim(), `${locale} 缺译文：${key}`);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
    }
  }
});

const BOUNDARY_SCAN = [
  "src/shell/bay/settings/BaySettingsSection.tsx",
  "src/shell/bay/settings/BaySettingsPane.tsx",
  "src/shell/bay/settings/money-ui.tsx",
  "src/shell/bay/dashboard/DashboardPane.tsx",
  "src/shell/bay/dashboard/IncomeLedgerCard.tsx",
  "src/shell/bay/dashboard/StatTile.tsx",
  "src/shell/bay/dashboard/ProductTable.tsx",
  "src/shell/bay/dashboard/OverviewChart.tsx",
  "src/shell/bay/mine/MyDashboardTab.tsx",
  "src/shell/bay/seller/MyServicesPane.tsx",
  "src/shell/bay/apppaid/AppPurchaseBar.tsx",
  "src/shell/bay/apppaid/AppPurchaseStatus.tsx",
  "src/shell/bay/apppaid/MyBoughtAppsPane.tsx",
  "src/shell/bay/apppaid/MySoldAppsPane.tsx",
  "src/shell/bay/apppaid/PricingManagePanel.tsx",
];

function ttLiterals(text) {
  return [...text.matchAll(/\btt\(\s*"([^"\n]*[一-鿿][^"\n]*)"/g)].map((match) => match[1]);
}

test("我改过的文件里每句 tt(\"中文\") 在 16 种语言里都有译文", async () => {
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const missing = [];
  for (const file of BOUNDARY_SCAN) {
    for (const key of ttLiterals(readFileSync(join(REPO, file), "utf8"))) {
      for (const locale of LOCALES) {
        if (locale === "zh") continue;
        if (!UI_MESSAGES[locale]?.[key]) missing.push(`${file.split("/").pop()} ${locale}: ${key}`);
      }
    }
  }
  assert.deepEqual(missing, []);
  // 动态传给 tt() 的几句（收款状态格、种类列、账户状态）同样要齐。
  const dynamic = [
    "暂未开放", "—", "收款状态", "收入流水", "商品明细",
    "平台暂时不代收代付；开放后，订单款验收通过即转入你的收款账户。",
    "订单款先托管，验收通过后转入你的收款账户。",
    "收款账户还不能收款，点开看原因。",
    "还没有收款账户", "开户办理中", "通道审核中", "可以收款", "收款受限", "已停用", "状态未知",
    "人工服务", "现成文件", "网站与软件服务", "课程", "套餐", "其他", "其他订单",
    "放款通道尚未接入", "美元账本上还没有能付出美元的收款通道", "收款账户还不能收款",
    "收款账户还在通道那边办理中，办好后这里会自动放开", "收款账户被通道限制了，请按通道的提示补齐资料",
    "收款账户已停用，需要重新开通才能接有偿的活",
    "下面的金额是记账，不是可动用的钱：平台目前不代收代付",
    "订单款由 Stripe 托管，验收后直接转入你的 Stripe 收款账户；平台不抽佣。",
  ];
  const gaps = [];
  for (const key of dynamic) {
    if (key === "—") continue; // 不是文案，是占位符
    for (const locale of LOCALES) {
      if (locale === "zh") continue;
      if (!UI_MESSAGES[locale]?.[key]) gaps.push(`${locale}: ${key}`);
    }
  }
  assert.deepEqual(gaps, []);
});

test("§5.1：我边界里的用户可见文案不再用「服务 / 素材 / 作品 / 成品文件」指一个种类", () => {
  const allowed = ["人工服务", "网站与软件服务", "服务条款", "服务器"];
  const hits = [];
  for (const file of BOUNDARY_SCAN) {
    for (const key of ttLiterals(readFileSync(join(REPO, file), "utf8"))) {
      let rest = key;
      for (const word of allowed) rest = rest.split(word).join("");
      if (/服务|素材|作品|成品/.test(rest)) hits.push(`${file.split("/").pop()}: ${key}`);
    }
  }
  assert.deepEqual(hits, []);
  // 常量表里的名字（商品行种类、分组标题）也一样。
  const model = readFileSync(join(REPO, "src/shell/bay/dashboard/dashboard-model.ts"), "utf8");
  assert.doesNotMatch(model, /return "(作品|服务|素材|成品文件)"/);
});
