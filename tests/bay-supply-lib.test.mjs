// W05：Bay 服务、答疑、收藏、声誉、下单的取数层。
// 覆盖：请求形状（路径、方法、请求体、匿名）、受限领域过滤、档位与加购合计、
// 付款没就绪时下单绝不发起付款。网络与付款全部用桩，测试不联网。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const httpStub = dataModule(`
  globalThis.__bayHttpCalls ??= [];
  async function reply(method, path, body, opts) {
    globalThis.__bayHttpCalls.push({ method, path, body, opts });
    const responder = globalThis.__bayHttpRespond;
    return responder ? responder(method, path, body, opts) : {};
  }
  export class BayApiError extends Error { constructor(m, s, c = null) { super(m); this.status = s; this.code = c; } }
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);

const paymentsStub = dataModule(`
  globalThis.__bayPayCalls ??= [];
  export async function fetchBayPaymentConfig() {
    globalThis.__bayPayCalls.push("config");
    if (globalThis.__bayPayConfigError) throw new Error("config down");
    return globalThis.__bayPayConfig ?? { enabled: false, buyer_ready: false, seller_ready: false, currency: "usd" };
  }
  export async function startBayPayment(id) {
    globalThis.__bayPayCalls.push("start:" + id);
    return { redirect_url: "https://pay.invalid/" };
  }
`);

const stubs = { "./http": httpStub, "./payments": paymentsStub };
const favorites = await import(await compileModule("src/lib/bay/favorites.ts", stubs));
const services = await import(await compileModule("src/lib/bay/services.ts", stubs));
const directory = await import(await compileModule("src/lib/bay/directory.ts", stubs));
const consults = await import(await compileModule("src/lib/bay/consults.ts", stubs));
const reputation = await import(await compileModule("src/lib/bay/reputation.ts", stubs));
const checkout = await import(await compileModule("src/lib/bay/checkout.ts", stubs));

const tt = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

function reset(respond = null) {
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = respond;
  globalThis.__bayPayCalls = [];
  globalThis.__bayPayConfig = undefined;
  globalThis.__bayPayConfigError = false;
}

const calls = () => globalThis.__bayHttpCalls.map(({ method, path, body }) => ({ method, path, body }));

function serviceFixture() {
  return {
    id: "svc-1",
    delivery_days: 5,
    tiers: [
      { id: "t3", service_id: "svc-1", tier: "premium", title: "P", description: "", price_fen: 90000, delivery_days: 10, revisions: -1, features: [], enabled: true },
      { id: "t1", service_id: "svc-1", tier: "basic", title: "B", description: "", price_fen: 30000, delivery_days: 3, revisions: 1, features: [], enabled: true },
      { id: "t2", service_id: "svc-1", tier: "standard", title: "S", description: "", price_fen: 60000, delivery_days: null, revisions: 2, features: [], enabled: false },
    ],
    addons: [
      { id: "a1", service_id: "svc-1", title: "加急", description: "", price_fen: 5000, extra_days: 1, enabled: true },
      { id: "a2", service_id: "svc-1", title: "源文件", description: "", price_fen: 2000, extra_days: 0, enabled: true },
      { id: "a3", service_id: "svc-1", title: "停用", description: "", price_fen: 1, extra_days: 0, enabled: false },
    ],
  };
}

test("收藏：列表、加、删、切换的请求形状", async () => {
  reset((method) => (method === "GET" ? { items: [{ target_ref: "svc-1" }], total: 1 } : { ok: true }));
  await favorites.listBayFavorites("service");
  await favorites.addBayFavorite("service", "svc-1");
  await favorites.removeBayFavorite("service", "svc 1");
  assert.deepEqual(calls(), [
    { method: "GET", path: "/v1/talent/favorites?target_kind=service", body: undefined },
    { method: "POST", path: "/v1/talent/favorites", body: { target_kind: "service", target_ref: "svc-1" } },
    { method: "DELETE", path: "/v1/talent/favorites?target_kind=service&target_ref=svc+1", body: undefined },
  ]);
  reset(() => ({ ok: true }));
  assert.equal(await favorites.toggleBayFavorite("profile", "u1", true), false);
  assert.equal(await favorites.toggleBayFavorite("profile", "u1", false), true);
  assert.deepEqual(calls().map((c) => c.method), ["DELETE", "POST"]);
  assert.deepEqual(calls()[1].body, { target_kind: "profile", target_ref: "u1" });
});

test("收藏：查不到（含未登录）当作没收藏，不抛错", async () => {
  reset(() => Promise.reject(Object.assign(new Error("未登录"), { status: 401 })));
  assert.equal(await favorites.isBayFavorite("service", "svc-1"), false);
  reset(() => ({ items: [{ target_ref: "svc-1" }], total: 1 }));
  assert.equal(await favorites.isBayFavorite("service", "svc-1"), true);
  assert.equal(await favorites.isBayFavorite("service", "svc-2"), false);
});

test("服务详情、主页详情不登录也能取（anonymous），路径参数做编码", async () => {
  reset(() => ({}));
  await services.getBayService("a/b");
  await directory.getBayProfile("leo 1");
  const recorded = globalThis.__bayHttpCalls;
  assert.equal(recorded[0].path, "/v1/talent/services/a%2Fb");
  assert.deepEqual(recorded[0].opts, { anonymous: true });
  assert.equal(recorded[1].path, "/v1/talent/profiles/leo%201");
  assert.deepEqual(recorded[1].opts, { anonymous: true });
});

test("举报服务、举报主页、拉黑：调现有接口", async () => {
  reset(() => ({ duplicate: false }));
  await services.reportBayService("svc-1", "fraud", "说明");
  await directory.reportBayProfile("user-9", "offsite");
  await directory.blockBayUser("user-9");
  assert.deepEqual(calls(), [
    { method: "POST", path: "/v1/talent/reports", body: { target_kind: "service", target_ref: "svc-1", reason: "涉嫌欺诈", detail: "说明" } },
    { method: "POST", path: "/v1/talent/reports", body: { target_kind: "profile", target_ref: "user-9", reason: "要求站外交易或预付款" } },
    { method: "POST", path: "/v1/im/blocks", body: { user_id: "user-9" } },
  ]);
});

test("档位与加购：默认最便宜的档、停用的不算、合计与交期", () => {
  const service = serviceFixture();
  assert.deepEqual(services.enabledTiers(service).map((t) => t.tier), ["basic", "premium"]);
  const first = services.serviceSelection(service, "", []);
  assert.equal(first.tier.tier, "basic");
  assert.equal(first.totalFen, 30000);
  assert.equal(first.deliveryDays, 3);
  const picked = services.serviceSelection(service, "premium", ["a1", "a2", "a1"]);
  assert.equal(picked.totalFen, 90000 + 5000 + 2000);
  assert.equal(picked.deliveryDays, 11);
  assert.deepEqual(picked.invalidAddonIds, []);
  const stale = services.serviceSelection(service, "standard", ["a3", "zz"]);
  assert.equal(stale.tier, undefined, "停用的档位不偷偷换成别的档");
  assert.deepEqual(stale.invalidAddonIds, ["a3", "zz"]);
  assert.equal(services.formatBayMoney(128000, "CNY"), "¥1,280");
  assert.equal(services.formatBayMoney(1250, "usd"), "$12.50");
  assert.equal(services.formatBayMoney(100, "XYZ"), "1 XYZ");
});

test("答疑：医疗、法律、宠物医疗不出现在列表里，详情判为不可用", async () => {
  reset((method, path) => {
    if (path.startsWith("/v1/talent/domains")) {
      return { domains: [{ key: "medical" }, { key: "tax" }, { key: "legal" }, { key: "vet" }, { key: "career" }] };
    }
    return {
      items: [
        { id: "c1", regulated_domain: "medical" },
        { id: "c2", regulated_domain: "tax" },
        { id: "c3", regulated_domain: "legal" },
        { id: "c4", regulated_domain: "vet" },
        { id: "c5", regulated_domain: "none" },
      ],
      next_cursor: "n2",
    };
  });
  const page = await consults.listBayConsults({ category: "tax-basic", limit: 10 });
  assert.deepEqual(page.items.map((c) => c.id), ["c2", "c5"]);
  assert.equal(page.next_cursor, "n2");
  assert.equal(globalThis.__bayHttpCalls[0].path, "/v1/talent/consults?category_slug=tax-basic&limit=10");
  assert.deepEqual(globalThis.__bayHttpCalls[0].opts, { anonymous: true });
  const before = globalThis.__bayHttpCalls.length;
  const blocked = await consults.listBayConsults({ domain: "legal" });
  assert.deepEqual(blocked.items, []);
  assert.equal(globalThis.__bayHttpCalls.length, before, "受限领域不发请求");
  assert.deepEqual((await consults.listBayDomains()).map((d) => d.key), ["tax", "career"]);
  assert.equal(consults.consultUnavailable({ regulated_domain: "vet" }), true);
  assert.equal(consults.consultUnavailable({ regulated_domain: "tax" }), false);
});

test("答疑：详情匿名取、预约要登录（POST）", async () => {
  reset(() => ({}));
  await consults.getBayConsult("c 2");
  await consults.bookBayConsult("c2");
  await consults.bookBayConsult("c2", "想问报税");
  assert.deepEqual(calls(), [
    { method: "GET", path: "/v1/talent/consults/c%202", body: undefined },
    { method: "POST", path: "/v1/talent/consults/c2/book", body: {} },
    { method: "POST", path: "/v1/talent/consults/c2/book", body: { note: "想问报税" } },
  ]);
  assert.deepEqual(globalThis.__bayHttpCalls[0].opts, { anonymous: true });
});

test("声誉：样本不足不渲染成 0；称谓只在核验通过时出现", () => {
  assert.equal(reputation.reputationRate(tt, null), "样本不足");
  assert.equal(reputation.reputationRate(tt, 0.125), "12.5%");
  assert.equal(reputation.reputationCount(tt, undefined), "样本不足");
  assert.equal(reputation.reputationHours(tt, 0.5), "30 分钟");
  assert.equal(reputation.reputationRating(tt, { rating_avg: 4.8, rating_count: 0 }), "暂无评价");
  assert.equal(reputation.reputationHighlights(tt, null).length, 5);
  const source = { practice_vetting: [{ domain: "edu_adult", state: "approved" }, { domain: "medical", state: "expired" }] };
  assert.equal(reputation.practiceTitleFor(tt, source, "edu_adult"), "教师资格已核验");
  assert.equal(reputation.practiceTitleFor(tt, source, "medical"), null);
  assert.deepEqual(reputation.verifiedPracticeTitles(tt, source), ["教师资格已核验"]);
});

test("评价：提交的请求形状与前置校验（给 W07 用）", async () => {
  const input = { contract_id: "k1", rating: 5, score_communication: 4, score_quality: 5, score_timeliness: 3, score_value: 4, body: "  很好  " };
  assert.equal(reputation.reviewInputProblem(tt, input), null);
  assert.equal(reputation.reviewInputProblem(tt, { ...input, score_value: 0 }), "请给每一项打 1–5 分。");
  reset(() => ({ review: { id: "r1" }, revealed: false }));
  await reputation.submitBayReview(input);
  await reputation.listBayContractReviews("k1");
  assert.deepEqual(calls(), [
    { method: "POST", path: "/v1/talent/reviews", body: { ...input, body: "很好" } },
    { method: "GET", path: "/v1/talent/reviews?contract_id=k1", body: undefined },
  ]);
});

test("下单：付款没就绪时只建订单，不发起付款", async () => {
  reset(() => ({ contract: { id: "k-77", status: "active" } }));
  const service = serviceFixture();
  const form = { title: " 做一套 Logo ", what: "三版方案", links: "https://a.example\n\n https://b.example ", deadline: "2026-10-30", notes: "" };
  const input = checkout.checkoutInput(service, "basic", ["a2"], form);
  assert.deepEqual(input, {
    service_id: "svc-1",
    tier: "basic",
    addon_ids: ["a2"],
    requirements: { title: "做一套 Logo", what: "三版方案", reference_links: ["https://a.example", "https://b.example"], deadline: "2026-10-30", notes: "" },
  });
  const result = await checkout.placeBayServiceOrder(input, 32000);
  assert.equal(result.contract.id, "k-77");
  assert.equal(result.payStep, "unavailable");
  assert.deepEqual(calls(), [{ method: "POST", path: "/v1/talent/orders", body: input }]);
  assert.deepEqual(globalThis.__bayPayCalls, ["config"], "只读付款配置，从不调 startBayPayment");
});

test("下单：付款配置取不到按没就绪处理；免费单不用付；就绪才给付款这一步", async () => {
  reset(() => ({ contract: { id: "k-1" } }));
  globalThis.__bayPayConfigError = true;
  const failed = await checkout.placeBayServiceOrder({ service_id: "s", tier: "basic", addon_ids: [], requirements: {} }, 100);
  assert.equal(failed.payStep, "unavailable");
  assert.ok(!globalThis.__bayPayCalls.some((c) => c.startsWith("start:")));
  assert.equal(checkout.payStepFor({ buyer_ready: false }, 100), "unavailable");
  assert.equal(checkout.payStepFor(null, 100), "unavailable");
  assert.equal(checkout.payStepFor({ buyer_ready: true }, 100), "pay");
  assert.equal(checkout.payStepFor({ buyer_ready: true }, 0), "free");
});

test("下单：缺标题、缺需求、档位停用、加购停用都不能下单", () => {
  const service = serviceFixture();
  const ok = { title: "t", what: "w", links: "", deadline: "", notes: "" };
  const sel = (tier, addons = []) => services.serviceSelection(service, tier, addons);
  assert.equal(checkout.checkoutProblem(sel("basic"), ok), null);
  assert.equal(checkout.checkoutProblem(sel("standard"), ok), "tier");
  assert.equal(checkout.checkoutProblem(sel("basic", ["a3"]), ok), "addons");
  assert.equal(checkout.checkoutProblem(sel("basic"), { ...ok, title: " " }), "title");
  assert.equal(checkout.checkoutProblem(sel("basic"), { ...ok, what: "" }), "what");
  assert.equal(checkout.checkoutInput(service, "basic", [], { ...ok, what: "" }), null);
  assert.equal(checkout.checkoutRequirements({ ...ok, deadline: "明天" }).deadline, "");
});
