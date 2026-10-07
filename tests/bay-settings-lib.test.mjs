// W09（oceanleo-bay）：付款就绪、发起付款、条款状态与同意、账本与收款账户取数。
// 网络一律打桩；startBayPayment 在没就绪时一个请求都不许发（契约 §7）。
import test from "node:test";
import assert from "node:assert/strict";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const HTTP_STUB = dataModule(`
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
  }
  function route(method, path, body, opts) {
    const bench = globalThis.__bayBench;
    bench.calls.push({ method, path, body, anonymous: Boolean(opts && opts.anonymous) });
    const hit = bench.routes[method + " " + path.split("?")[0]];
    if (hit === undefined) throw new BayApiError("no route " + method + " " + path, 404);
    if (hit instanceof Error) throw hit;
    if (hit && hit.__status) throw new BayApiError(hit.message || "失败", hit.__status);
    return typeof hit === "function" ? hit(body, path) : JSON.parse(JSON.stringify(hit));
  }
  export async function bayGet(path, opts) { return route("GET", path, undefined, opts); }
  export async function bayPost(path, body) { return route("POST", path, body); }
  export async function bayPatch(path, body) { return route("PATCH", path, body); }
  export async function bayDelete(path) { return route("DELETE", path); }
`);

function bench(routes = {}) {
  globalThis.__bayBench = { calls: [], routes };
  return globalThis.__bayBench;
}

async function freshModule(path) {
  // 每次换一份查询串，模块级缓存不串台。
  const url = await compileModule(path, { "./http": HTTP_STUB });
  return import(`${url}?case=${Math.random().toString(36).slice(2)}`);
}

const DEV_CONFIG = {
  enabled: true,
  provider: "stripe_connect",
  currency: "USD",
  edition: "intl",
  channel_fee: { percent_bps: 390, fixed_minor: 30, note_zh: "支付通道费" },
  buyer_ready: false,
  seller_ready: false,
  payout_countries: ["US", "hk", "bad", 3],
};

test("付款配置：照网关返回取四项；接口失败按没就绪", async () => {
  const b = bench({ "GET /v1/talent/payments/config": DEV_CONFIG });
  const payments = await freshModule("src/lib/bay/payments.ts");
  assert.deepEqual(await payments.fetchBayPaymentConfig(), { enabled: true, buyer_ready: false, seller_ready: false, currency: "USD" });
  assert.equal(b.calls[0].anonymous, true, "配置不登录也能读");
  const channel = await payments.fetchBayPaymentChannel();
  assert.deepEqual(channel.payout_countries, ["US", "HK"]);
  assert.equal(channel.channel_fee.percent_bps, 390);
  assert.equal(b.calls.length, 1, "30 秒内复用同一份配置");

  bench({ "GET /v1/talent/payments/config": { __status: 503, message: "未开放" } });
  const broken = await freshModule("src/lib/bay/payments.ts");
  assert.deepEqual(await broken.fetchBayPaymentConfig(), { enabled: false, buyer_ready: false, seller_ready: false, currency: "USD" });
});

test("startBayPayment：开发网关（enabled 但 buyer_ready=false）不发付款请求", async () => {
  const b = bench({
    "GET /v1/talent/payments/config": DEV_CONFIG,
    "POST /v1/talent/contracts/c1/fund": () => {
      throw new Error("不许调用付款接口");
    },
  });
  const payments = await freshModule("src/lib/bay/payments.ts");
  assert.deepEqual(await payments.startBayPayment("c1"), { redirect_url: null });
  assert.deepEqual(await payments.startBayPayment("../evil"), { redirect_url: null });
  assert.deepEqual(await payments.startBayPayment(""), { redirect_url: null });
  assert.equal(b.calls.filter((call) => call.method === "POST").length, 0);
  assert.equal(await payments.fetchBayCardMethod(), null);
  assert.equal(b.calls.some((call) => call.path === "/v1/talent/payment-method"), false, "没就绪不读卡");

  const off = bench({ "GET /v1/talent/payments/config": { ...DEV_CONFIG, enabled: false, buyer_ready: true } });
  const disabled = await freshModule("src/lib/bay/payments.ts");
  assert.deepEqual(await disabled.startBayPayment("c1"), { redirect_url: null });
  assert.equal(off.calls.filter((call) => call.method === "POST").length, 0, "通道没开也不发");
});

test("startBayPayment：就绪时才请求托管扣款；只透传 http(s) 跳转地址", async () => {
  const b = bench({
    "GET /v1/talent/payments/config": { ...DEV_CONFIG, buyer_ready: true },
    "POST /v1/talent/contracts/c-9/fund": { contract: { id: "c-9" }, payments: [], redirect_url: "https://checkout.example/s/1" },
    "POST /v1/talent/contracts/c-10/fund": { contract: { id: "c-10" }, payments: [], url: "javascript:alert(1)" },
  });
  const payments = await freshModule("src/lib/bay/payments.ts");
  assert.deepEqual(await payments.startBayPayment("c-9"), { redirect_url: "https://checkout.example/s/1" });
  assert.deepEqual(await payments.startBayPayment("c-10"), { redirect_url: null });
  const posts = b.calls.filter((call) => call.method === "POST").map((call) => call.path);
  assert.deepEqual(posts, ["/v1/talent/contracts/c-9/fund", "/v1/talent/contracts/c-10/fund"]);
  assert.equal(payments.bayChannelFeeMinor(10000), 420);
  assert.equal(payments.bayChannelFeeMinor(-1), 0);
});

test("条款：状态解析、没登录是 401、同意时带版本号", async () => {
  const current = {
    version: 3,
    effective_at: "2026-09-01T00:00:00Z",
    sections: [
      { key: "how_it_works", title_zh: "如何运作", body_md: "先谈后签。" },
      { key: "fees", title_zh: "", body_md: "不抽佣。" },
      { key: "empty", title_zh: "空", body_md: "" },
      { key: "how_it_works", title_zh: "重复", body_md: "x" },
    ],
  };
  const b = bench({
    "GET /v1/talent/terms/status": { current, acceptance: { version: 2, accepted_at: "2026-08-01T00:00:00Z" }, accepted: false },
    "POST /v1/talent/terms/accept": (body) => ({ current, acceptance: { version: body.version, accepted_at: "2026-10-06T10:00:00Z" }, accepted: true, version: body.version }),
    "GET /v1/talent/terms/current": { ...current, current },
  });
  const terms = await freshModule("src/lib/bay/terms.ts");
  const status = await terms.fetchBayTermsStatus();
  assert.equal(status.accepted, false);
  assert.equal(status.current.version, 3);
  assert.deepEqual(status.current.sections.map((s) => [s.key, s.title_zh]), [["how_it_works", "如何运作"], ["fees", "费用"]]);
  assert.deepEqual(status.acceptance, { version: 2, accepted_at: "2026-08-01T00:00:00Z" });
  assert.equal(terms.bayTermsUpToDate(status), false);

  const after = await terms.acceptBayTerms(3);
  assert.equal(after.accepted, true);
  assert.equal(terms.bayTermsUpToDate(after), true);
  assert.deepEqual(b.calls.find((call) => call.method === "POST").body, { version: 3 });
  const { current: doc } = await terms.fetchBayTermsCurrent();
  assert.equal(doc.version, 3);
  assert.equal(b.calls.find((call) => call.path === "/v1/talent/terms/current").anonymous, true);
  assert.equal(terms.bayTermsAnchor("fees<script>"), "bay-terms-feesscript");

  bench({ "GET /v1/talent/terms/status": { __status: 401, message: "请先登录" } });
  const guest = await freshModule("src/lib/bay/terms.ts");
  const denied = await guest.fetchBayTermsStatus();
  assert.equal(denied.status, 401);
  assert.equal(denied.accepted, false);
});

test("账本与收款账户：查询参数白名单、金额归一、通道未开返回 null、CSV 防公式", async () => {
  const b = bench({
    "GET /v1/talent/ledger": {
      items: [
        { id: "e1", direction: "in", event: "completed", amount_fen: 12345, currency: "CNY", note: "=HYPERLINK(1)", created_at: "2026-10-01T08:00:00Z", counterparty: { display_name: "小王" } },
        { id: "", direction: "in" },
        { id: "e2", direction: "weird", event: "bogus", amount_fen: "7", created_at: "x" },
      ],
      page: 1,
      limit: 20,
      total: 2,
      has_more: false,
      total_in_fen: 12352,
      total_out_fen: 0,
      monthly: [{ month: "2026-10", in_fen: 12352, out_fen: 0 }, { month: "2026-09", in_fen: -5, out_fen: 100 }, { month: "bad" }],
    },
    "GET /v1/talent/ledger/summary": { currency: "CNY", month: "2026-10", month_in_fen: 12352, lifetime_in_fen: 12352, ongoing_contract_amount_fen: 0, ongoing_contract_count: 0, monthly: [] },
    "GET /v1/talent/payout-account": { __status: 503, message: "未开放" },
    "GET /v1/talent/paid-work-eligibility": { eligible: false, reason: "", blockers: ["收款通道尚未接入", ""] },
  });
  const money = await freshModule("src/lib/bay/money.ts");
  assert.equal(money.bayLedgerPath({ direction: "in", event: "completed", page: 2, limit: 500 }), "/v1/talent/ledger?direction=in&event=completed&page=2&limit=100");
  assert.equal(money.bayLedgerPath({ direction: "sideways", event: "drop" }), "/v1/talent/ledger");
  const page = await money.fetchBayLedger({ direction: "in" });
  assert.deepEqual(page.items.map((item) => [item.id, item.direction, item.event, item.amount_fen]), [["e1", "in", "completed", 12345], ["e2", "in", "adjusted", 7]]);
  assert.deepEqual(page.monthly, [{ month: "2026-09", in_fen: 0, out_fen: 100 }, { month: "2026-10", in_fen: 12352, out_fen: 0 }]);
  assert.equal(b.calls[0].path, "/v1/talent/ledger?direction=in");
  assert.equal((await money.fetchBayLedgerSummary()).month_in_fen, 12352);
  assert.equal(await money.fetchBayPayoutAccount(), null);
  const eligibility = await money.fetchBayPaidWorkEligibility();
  assert.deepEqual(money.bayPayoutBlockerLines(eligibility, null), ["放款通道尚未接入"]);
  const csv = money.bayLedgerCsv(page.items, {
    headers: ["时间", "对方", "订单", "事件", "收支", "金额", "状态", "备注"],
    event: (event) => money.BAY_LEDGER_EVENT_LABELS[event],
    direction: (direction) => (direction === "in" ? "收入" : "支出"),
    recorded: "已记录",
  });
  assert.match(csv, /"'=HYPERLINK\(1\)"/);
  assert.match(csv, /"123\.45"/);
  assert.equal(money.formatBayFen(123450, "CNY"), "¥1,234.50");
  assert.equal(money.bayPayoutAccountStateLabel("none"), "还没有收款账户");
});

test("关闭收款类网关 blocker 映射到词表，不把收益页原句留下", async () => {
  bench({});
  const money = await freshModule("src/lib/bay/money.ts");
  const long = "到收益页选择收款国家并开通收款账户，由 Stripe 完成核验。";
  assert.deepEqual(
    money.bayPayoutBlockerLines({ eligible: false, reason: "", blockers: [long] }, null),
    ["开户暂未开放"],
  );
  assert.deepEqual(
    money.bayPayoutBlockerLines({ eligible: false, reason: "", blockers: ["由 Stripe 完成核验"] }, null),
    ["开户暂未开放"],
  );
  assert.deepEqual(
    money.bayPayoutBlockerLines({ eligible: false, reason: "", blockers: ["收款暂未开放"] }, null),
    ["收款暂未开放"],
  );
  assert.deepEqual(
    money.bayPayoutBlockerLines({ eligible: false, reason: long, blockers: [] }, null),
    ["开户暂未开放"],
  );
  assert.deepEqual(
    money.bayPayoutBlockerLines(
      { eligible: false, reason: "", blockers: [long, "收款暂未开放", "放款通道尚未接入"] },
      { edition: "intl", provider: "none", state: "none", verified_subject_kind: null, last_checked_at: null },
    ),
    ["开户暂未开放", "收款暂未开放", "放款通道尚未接入"],
  );
  assert.deepEqual(money.bayVisiblePayoutBlockerLines(["开户暂未开放", "放款通道尚未接入"], false), ["放款通道尚未接入"]);
  assert.deepEqual(money.bayVisiblePayoutBlockerLines(["开户暂未开放"], true), ["开户暂未开放"]);
});
