// W07（oceanleo-bay）：订单、争议、再来一单的取数层与纯函数。
// 网络整个是桩：断言的是请求的路径与请求体形状。付款就绪由调用方传入，这里不碰付款模块。
// 覆盖：订单各接口的请求形状、争议表单的请求形状、付款没就绪时谁都不能付款、买家和卖家各自只看到自己的动作、
// 「我的订单」分组、作品链接对 ppt / threed 拼出正确子域名、拿不到域名或路径不安全时不给链接、再来一单去哪。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const httpStub = dataModule(`
  globalThis.__w07Calls ??= [];
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function reply(method, path, body) {
    globalThis.__w07Calls.push({ method, path, body });
    const responder = globalThis.__w07Respond;
    return responder ? responder(method, path, body) : {};
  }
  export const bayGet = (path) => reply("GET", path, undefined);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path, undefined);
`);
const STUBS = { "./http": httpStub };
const { BayApiError } = await import(httpStub);
const orders = await import(await compileModule("src/lib/bay/orders.ts", STUBS));
const disputes = await import(await compileModule("src/lib/bay/disputes.ts", STUBS));
const repeat = await import(await compileModule("src/lib/bay/repeat.ts", STUBS));

const familyStub = dataModule(`
  const FAMILY = { com: "oceanleo.com" };
  export function currentFamilySubsiteOrigin(label) {
    const domain = FAMILY[globalThis.__w07Family ?? "com"];
    if (!domain || (globalThis.__w07MissingSubsites ?? []).includes(label)) return undefined;
    return "https://" + label + "." + domain;
  }
`);
const links = await import(
  await compileModule("src/shell/bay/orders/order-links.ts", {
    "../../../contracts/domain-family": familyStub,
    "../../../lib/bay/http": httpStub,
  })
);

const tt = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

function reset(respond = null) {
  globalThis.__w07Calls = [];
  globalThis.__w07Respond = respond;
  globalThis.__w07Family = "com";
  globalThis.__w07MissingSubsites = [];
}
const calls = () => globalThis.__w07Calls;

function order(extra = {}) {
  return {
    id: "k1",
    buyer_user_id: "buyer-1",
    seller_user_id: "seller-1",
    title: "一套品牌 Logo",
    engagement_kind: "fixed",
    total_fen: 30000,
    currency: "USD",
    status: "active",
    payment_state: "unfunded",
    project_id: "p1",
    thread_id: "t1",
    my_role: "buyer",
    milestones: [],
    revisions_allowed: 2,
    revisions_used: 0,
    ...extra,
  };
}

const CLOSED = { enabled: false, buyer_ready: false };
const ENABLED_NOT_READY = { enabled: true, buyer_ready: false };
const READY = { enabled: true, buyer_ready: true };

test("订单列表：身份、状态、条数按白名单进查询串", async () => {
  reset(() => ({ items: [order(), { title: "没有 id 的脏行" }] }));
  const items = await orders.listBayOrders({ role: "seller", status: "delivered", limit: 500 });
  assert.equal(items.length, 1, "没有 id 的行丢掉");
  await orders.listBayOrders();
  await orders.listBayOrders({ role: "admin", status: "bogus", limit: 0 });
  assert.deepEqual(
    calls().map((c) => [c.method, c.path]),
    [
      ["GET", "/v1/talent/contracts?role=seller&status=delivered&limit=200"],
      ["GET", "/v1/talent/contracts?role=all&limit=100"],
      ["GET", "/v1/talent/contracts?role=all&limit=100"],
    ],
  );
});

test("订单动作：路径与请求体形状照 talent", async () => {
  reset((method, path) => {
    if (method === "GET") return { contract: order({ id: "k 1/x" }) };
    if (path.endsWith("/project")) return { project_id: "p9" };
    return { contract: order() };
  });
  const got = await orders.getBayOrder("k 1/x");
  assert.equal(got.id, "k 1/x");
  await orders.signBayOrder("k1");
  await orders.ensureBayOrderProject("k1");
  await orders.submitBayMilestone("k1", "m1", "  第一段的稿子  ");
  await orders.approveBayMilestone("k1", "m1");
  await orders.completeBayOrder("k1");
  await orders.deliverBayOrder("k1", {
    note: "  第一版，源文件在附件里  ",
    attachments: [
      { url: "https://files.example.com/a.pdf", name: "a.pdf", kind: "file" },
      { url: "javascript:alert(1)", name: "坏链接" },
      { url: "https://files.example.com/a.pdf", name: "重复" },
      { url: "/relative/path.png", name: "相对地址" },
      { url: "https://files.example.com/b.png", name: "  b.png  " },
    ],
    milestone_id: "m2",
  });
  await orders.deliverBayOrder("k1", { note: "", attachments: [] });
  await orders.requestBayRevision("k1", "  颜色和约定的不一样  ", "d3");
  await orders.requestBayRevision("k1", "再改一版");
  await orders.acceptBayDelivery("k1");
  await orders.extendBayReview("k1", 3.7);
  await orders.cancelBayOrder("k1", "  不需要了  ");
  await orders.cancelBayOrder("k1");
  assert.deepEqual(calls(), [
    { method: "GET", path: "/v1/talent/contracts/k%201%2Fx", body: undefined },
    { method: "POST", path: "/v1/talent/contracts/k1/accept", body: undefined },
    { method: "POST", path: "/v1/talent/contracts/k1/project", body: undefined },
    { method: "POST", path: "/v1/talent/contracts/k1/milestones/m1/submit", body: { deliverable_note: "第一段的稿子" } },
    { method: "POST", path: "/v1/talent/contracts/k1/milestones/m1/approve", body: undefined },
    { method: "POST", path: "/v1/talent/contracts/k1/complete", body: undefined },
    {
      method: "POST",
      path: "/v1/talent/contracts/k1/deliver",
      body: {
        note: "第一版，源文件在附件里",
        attachments: [
          { url: "https://files.example.com/a.pdf", name: "a.pdf", kind: "file" },
          { url: "https://files.example.com/b.png", name: "b.png", kind: "file" },
        ],
        milestone_id: "m2",
      },
    },
    { method: "POST", path: "/v1/talent/contracts/k1/deliver", body: { note: "", attachments: [] } },
    { method: "POST", path: "/v1/talent/contracts/k1/request-revision", body: { reason: "颜色和约定的不一样", delivery_id: "d3" } },
    { method: "POST", path: "/v1/talent/contracts/k1/request-revision", body: { reason: "再改一版" } },
    { method: "POST", path: "/v1/talent/contracts/k1/accept-delivery", body: undefined },
    { method: "POST", path: "/v1/talent/contracts/k1/extend-review", body: { days: 3 } },
    { method: "POST", path: "/v1/talent/contracts/k1/cancel", body: { reason: "不需要了" } },
    { method: "POST", path: "/v1/talent/contracts/k1/cancel", body: { reason: "" } },
  ]);
});

test("交付附件最多 20 个，只留 http(s)", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ url: `https://files.example.com/${i}.png`, name: `${i}.png` }));
  assert.equal(orders.cleanDeliveryAttachments(many).length, orders.MAX_DELIVERY_ATTACHMENTS);
  assert.deepEqual(orders.cleanDeliveryAttachments([{ url: "data:text/html,hi" }, { url: "ftp://x.example/a" }, null]), []);
});

test("项目群与合同摘要：读不到不算错", async () => {
  reset((method, path) => {
    if (path === "/v1/talent/threads/t1/messages?limit=1") {
      return { contract_summary: { id: "k1", im_conversation_id: "c-1", work: { site_key: "ppt", open_path: "/editor?task=w1" } } };
    }
    if (path === "/v1/im/conversations/project") return { id: "c-2" };
    throw new BayApiError("会话不存在", 404);
  });
  const summary = await orders.fetchBayContractSummary("t1");
  assert.equal(summary.im_conversation_id, "c-1");
  assert.equal(await orders.fetchBayContractSummary("gone"), null);
  assert.equal(await orders.resolveBayProjectConversation("p1"), "c-2");
  assert.deepEqual(calls().at(-1), { method: "POST", path: "/v1/im/conversations/project", body: { project_id: "p1" } });
});

test("争议表单：请求体是 { contract_id, reason, detail, evidence }", async () => {
  reset(() => ({ dispute: { id: "d1", contract_id: "k1", state: "open" } }));
  await disputes.createBayDispute({
    contract_id: "k1",
    reason: "对方失联",
    detail: "  三天没有回复，也没交付  ",
    evidence: [
      { url: " https://evidence.example.com/1.png ", description: "  聊天截图  " },
      { url: "ftp://evidence.example.com/2.png", description: "不是网页地址" },
      { url: "javascript:alert(1)", description: "坏链接" },
    ],
  });
  await disputes.createBayDispute({ contract_id: "k1", reason: "我编的原因", detail: "说明" });
  assert.deepEqual(calls(), [
    {
      method: "POST",
      path: "/v1/talent/disputes",
      body: {
        contract_id: "k1",
        reason: "对方失联",
        detail: "三天没有回复，也没交付",
        evidence: [{ url: "https://evidence.example.com/1.png", description: "聊天截图" }],
      },
    },
    { method: "POST", path: "/v1/talent/disputes", body: { contract_id: "k1", reason: "其他", detail: "说明", evidence: [] } },
  ]);
  const long = "字".repeat(disputes.DISPUTE_DETAIL_LIMIT + 50);
  assert.equal(disputes.disputeCreateBody({ contract_id: "k1", reason: "其他", detail: long }).detail.length, disputes.DISPUTE_DETAIL_LIMIT);
});

test("争议表单：没写说明、找不到订单、太长都不能提交", () => {
  assert.equal(disputes.disputeInputProblem(tt, { contract_id: "k1", detail: "   " }), "请说清发生了什么。");
  assert.equal(disputes.disputeInputProblem(tt, { contract_id: "", detail: "有说明" }), "找不到这笔订单。");
  assert.match(disputes.disputeInputProblem(tt, { contract_id: "k1", detail: "字".repeat(2001) }), /最多 2000 字/);
  assert.equal(disputes.disputeInputProblem(tt, { contract_id: "k1", detail: "交付物少了源文件" }), null);
  assert.deepEqual([...disputes.DISPUTE_REASONS], ["交付物与约定不符", "对方逾期未交付", "对方失联", "已发生时长与实际不符", "其他"]);
});

test("争议后续动作：陈述、争议评估、平台裁定、补证据、撤回的路径与请求体", async () => {
  reset(() => ({ dispute: { id: "d1" } }));
  await disputes.respondBayDispute("d1", { statement: "  已按约定交付  " });
  await disputes.assessBayDispute("d1");
  await disputes.escalateBayDispute("d1");
  await disputes.addBayDisputeEvidence("d1", { url: "https://evidence.example.com/3.pdf", description: " 交付记录 " });
  await disputes.withdrawBayDispute("d1");
  assert.deepEqual(calls(), [
    { method: "POST", path: "/v1/talent/disputes/d1/respond", body: { statement: "已按约定交付", evidence: [] } },
    { method: "POST", path: "/v1/talent/disputes/d1/assess", body: undefined },
    { method: "POST", path: "/v1/talent/disputes/d1/escalate", body: undefined },
    { method: "POST", path: "/v1/talent/disputes/d1/evidence", body: { url: "https://evidence.example.com/3.pdf", description: "交付记录" } },
    { method: "POST", path: "/v1/talent/disputes/d1/withdraw", body: undefined },
  ]);
});

test("这单的争议：取同一单里最近的一条", async () => {
  reset(() => ({
    items: [
      { id: "d-old", contract_id: "k1", state: "withdrawn", created_at: "2026-10-01T00:00:00Z" },
      { id: "d-other", contract_id: "k2", state: "open", created_at: "2026-10-05T00:00:00Z" },
      { id: "d-new", contract_id: "k1", state: "open", created_at: "2026-10-03T00:00:00Z" },
    ],
  }));
  assert.equal((await disputes.findBayDisputeForOrder("k1")).id, "d-new");
  assert.equal(await disputes.findBayDisputeForOrder("k9"), null);
  assert.deepEqual(calls().map((c) => c.path), ["/v1/talent/disputes", "/v1/talent/disputes"]);
});

test("争议三层：叫法只有「争议评估」「平台裁定」，第三层任何时候都在", () => {
  const layers = disputes.disputeLayers(tt);
  assert.deepEqual(layers.map((l) => l.key), ["review_window", "assessment", "resolution"]);
  assert.match(layers[1].title, /争议评估/);
  assert.match(layers[2].title, /平台裁定/);
  const words = JSON.stringify(layers) + disputes.assessmentNonBindingNote(tt) + disputes.disputeStateLabel(tt, "escalated");
  assert.doesNotMatch(words, /仲裁|人工裁定/);
  assert.match(disputes.assessmentNonBindingNote(tt), /没有约束力/);
  assert.equal(disputes.currentDisputeLayer(null), "review_window");
  assert.equal(disputes.currentDisputeLayer({ state: "open" }), "review_window");
  assert.equal(disputes.currentDisputeLayer({ state: "assessed" }), "assessment");
  assert.equal(disputes.currentDisputeLayer({ state: "escalated" }), "resolution");
  assert.match(disputes.disputeMoneyBanner(tt, false), /只写进订单与争议记录/);
});

test("按已发生时长分割：按时计费的单给出分割建议，一口价的单不分割", () => {
  const hourly = order({
    engagement_kind: "hourly",
    total_fen: 10000,
    accepted_at: "2026-10-01T00:00:00Z",
    delivered_at: "2026-10-01T05:00:00Z",
    requirements: { hours: 10 },
  });
  const split = disputes.elapsedSplit(tt, hourly);
  assert.equal(split.mechanical, true);
  assert.equal(split.providerFen, 5000);
  assert.equal(split.requesterFen, 5000);
  const missing = disputes.elapsedSplit(tt, { ...hourly, requirements: {} });
  assert.equal(missing.mechanical, false);
  assert.match(missing.note, /平台裁定/);
  assert.equal(disputes.elapsedSplit(tt, order()), null);
});

test("付款没就绪：谁都不能付款，只给提示", () => {
  const unpaid = order();
  assert.equal(orders.canPayOrder(unpaid, CLOSED), false);
  assert.equal(orders.canPayOrder(unpaid, ENABLED_NOT_READY), false);
  assert.equal(orders.canPayOrder(unpaid, null), false);
  assert.equal(orders.orderActionsFor(unpaid, ENABLED_NOT_READY).pay, false);
  assert.equal(orders.orderActionsFor(unpaid, ENABLED_NOT_READY).setupPayment, true, "付款平台开了、买家没卡：只给去设置");
  assert.equal(orders.orderActionsFor(unpaid, CLOSED).setupPayment, false);
  assert.equal(orders.nextActionText(tt, unpaid, ENABLED_NOT_READY), "付款暂未开放");
  assert.equal(orders.canPayOrder(unpaid, READY), true);
  assert.equal(orders.canPayOrder({ ...unpaid, my_role: "seller" }, READY), false, "卖家永远不付款");
  assert.equal(orders.canPayOrder({ ...unpaid, payment_state: "escrow_held" }, READY), false, "已托管不再付");
  assert.equal(orders.canPayOrder({ ...unpaid, total_fen: 0 }, READY), false, "免费单不付款");
  assert.equal(orders.canPayOrder({ ...unpaid, status: "negotiating" }, READY), false, "没签约不付款");
});

test("买家和卖家各自只看到自己的动作", () => {
  const pick = (actions) => Object.keys(actions).filter((key) => actions[key]).sort();
  const delivered = order({ status: "delivered", payment_state: "disabled" });
  assert.deepEqual(pick(orders.orderActionsFor(delivered, CLOSED)), [
    "acceptDelivery",
    "dispute",
    "extendReview",
    "openProject",
    "requestRevision",
    "tradeThread",
  ]);
  assert.deepEqual(pick(orders.orderActionsFor({ ...delivered, my_role: "seller" }, CLOSED)), ["dispute", "openProject", "tradeThread"]);

  const active = order({ payment_state: "disabled" });
  assert.deepEqual(pick(orders.orderActionsFor({ ...active, my_role: "seller" }, CLOSED)), ["cancel", "deliver", "dispute", "openProject", "tradeThread"]);
  assert.deepEqual(pick(orders.orderActionsFor(active, CLOSED)), ["cancel", "dispute", "openProject", "tradeThread"]);

  const staged = order({
    payment_state: "disabled",
    milestones: [
      { id: "m1", seq: 1, title: "草图", amount_fen: 10000, status: "submitted" },
      { id: "m2", seq: 2, title: "定稿", amount_fen: 20000, status: "pending" },
    ],
  });
  assert.equal(orders.orderActionsFor(staged, CLOSED).approveMilestone, true);
  assert.equal(orders.orderActionsFor(staged, CLOSED).submitMilestone, false);
  assert.equal(orders.orderActionsFor({ ...staged, my_role: "seller" }, CLOSED).submitMilestone, true);
  assert.equal(orders.orderActionsFor({ ...staged, my_role: "seller" }, CLOSED).approveMilestone, false);
  assert.equal(orders.orderActionsFor({ ...staged, my_role: "seller" }, CLOSED).deliver, false, "分段的单按里程碑交");

  const done = order({ status: "completed", payment_state: "disabled" });
  assert.deepEqual(pick(orders.orderActionsFor(done, CLOSED)), ["openProject", "repeat", "review", "tradeThread"]);
  assert.deepEqual(pick(orders.orderActionsFor({ ...done, my_role: "seller" }, CLOSED)), ["openProject", "review", "tradeThread"]);

  assert.deepEqual(pick(orders.orderActionsFor({ ...done, my_role: null }, READY)), [], "不是这单的人什么都不能做");
  assert.deepEqual(pick(orders.orderActionsFor(null, READY)), []);
});

test("我的订单分组：待我处理 / 进行中 / 已完成 / 已取消", () => {
  const delivered = order({ status: "delivered", payment_state: "disabled" });
  assert.equal(orders.orderGroupOf(delivered, CLOSED), "todo");
  assert.equal(orders.orderGroupOf({ ...delivered, my_role: "seller" }, CLOSED), "active");
  const active = order({ payment_state: "disabled" });
  assert.equal(orders.orderGroupOf({ ...active, my_role: "seller" }, CLOSED), "todo");
  assert.equal(orders.orderGroupOf(active, CLOSED), "active");
  assert.equal(orders.orderGroupOf(active, READY), "active", "付款状态 disabled 的单不算待付款");
  assert.equal(orders.orderGroupOf(order(), READY), "todo", "付款就绪且没付：待我处理");
  assert.equal(orders.orderGroupOf(order(), ENABLED_NOT_READY), "active", "付款没开放：不催买家付款");
  assert.equal(orders.orderGroupOf(order({ status: "completed" }), CLOSED), "done");
  assert.equal(orders.orderGroupOf(order({ status: "cancelled" }), CLOSED), "cancelled");
  assert.equal(orders.orderGroupOf(order({ status: "disputed" }), CLOSED), "active");
});

test("金额、状态与自动验收倒计时的文字", () => {
  assert.equal(orders.orderAmountText(tt, { total_fen: 12345, currency: "usd" }), "$123.45");
  assert.equal(orders.orderAmountText(tt, { total_fen: 12345, currency: "SGD" }), "123.45 SGD");
  assert.equal(orders.orderAmountText(tt, { total_fen: 0, currency: "USD" }), "免费");
  assert.equal(orders.orderStatusLabel(tt, "delivered"), "已交付待验收");
  const now = Date.parse("2026-10-06T00:00:00Z");
  const soon = orders.autoAcceptCountdown("2026-10-06T05:30:00Z", now);
  assert.equal(orders.autoAcceptText(tt, soon), "还有约 6 小时自动完成");
  const later = orders.autoAcceptCountdown("2026-10-09T02:00:00Z", now);
  assert.equal(orders.autoAcceptText(tt, later), "还有 3 天 2 小时自动完成");
  assert.equal(orders.autoAcceptCountdown("2026-10-05T00:00:00Z", now).state, "due");
  assert.equal(orders.autoAcceptCountdown(null).state, "none");
  assert.equal(orders.reviewExtensionWarning(tt, { review_extended_days: 10 }, 5), "最多还能延长 4 天（累计上限 14 天）");
  assert.equal(orders.reviewExtensionWarning(tt, { review_extended_days: 0 }, 3), "");
});

test("作品链接：ppt 去 slide 子域、threed 去 3d 子域，路径原样接上", () => {
  reset();
  assert.equal(links.bayOrderWorkHref({ site_key: "ppt", open_path: "/editor?task=w1" }), "https://slide.oceanleo.com/editor?task=w1");
  assert.equal(links.bayOrderWorkHref({ site_key: "threed", open_path: "/studio/w2" }), "https://3d.oceanleo.com/studio/w2");
  assert.equal(links.bayOrderWorkHref({ site_key: "design", open_path: "/w3" }), "https://design.oceanleo.com/w3");
});

test("作品链接：拿不到域名、站 key 不认识、路径不安全时不给链接", () => {
  reset();
  globalThis.__w07MissingSubsites = ["slide"];
  assert.equal(links.bayOrderWorkHref({ site_key: "ppt", open_path: "/editor?task=w1" }), null, "家族里没有这个子站");
  globalThis.__w07Family = "cn";
  assert.equal(links.bayOrderWorkHref({ site_key: "threed", open_path: "/studio/w2" }), null, "拿不到域名");
  reset();
  assert.equal(links.bayOrderWorkHref({ site_key: "oceanleo", open_path: "/w" }), null, "门户不是子站");
  assert.equal(links.bayOrderWorkHref({ site_key: "Not A Key", open_path: "/w" }), null);
  assert.equal(links.bayOrderWorkHref({ site_key: "ppt", open_path: "//evil.example.com/w" }), null);
  assert.equal(links.bayOrderWorkHref({ site_key: "ppt", open_path: "https://evil.example.com/w" }), null);
  assert.equal(links.bayOrderWorkHref({ site_key: "ppt", open_path: "/a\\b" }), null);
  assert.equal(links.bayOrderWorkHref({ site_key: "ppt", open_path: "" }), null);
  assert.equal(links.bayOrderWorkHref(null), null);
});

test("再来一单：只给买家、只给完成的单；服务单回到同一服务同一档，其余去和对方谈", async () => {
  const done = order({ status: "completed", source_service_id: "svc-1", source_tier: "premium" });
  assert.deepEqual(repeat.repeatOrderPlan(done), { kind: "checkout", serviceId: "svc-1", tier: "premium", sellerId: "seller-1" });
  assert.deepEqual(repeat.repeatOrderPlan({ ...done, source_tier: "BAD TIER" }), { kind: "checkout", serviceId: "svc-1", sellerId: "seller-1" });
  assert.deepEqual(repeat.repeatOrderPlan({ ...done, source_service_id: null, origin_kind: "service", origin_ref: "svc-2", source_tier: null }), {
    kind: "checkout",
    serviceId: "svc-2",
    sellerId: "seller-1",
  });
  assert.deepEqual(repeat.repeatOrderPlan({ ...done, source_service_id: null, origin_kind: "demand", origin_ref: "dm-1" }), {
    kind: "direct",
    userId: "seller-1",
    sellerId: "seller-1",
  });
  assert.equal(repeat.repeatOrderPlan({ ...done, my_role: "seller" }), null);
  assert.equal(repeat.repeatOrderPlan({ ...done, status: "active" }), null);

  reset(() => ({ pinned: true }));
  await repeat.pinBeforeRepeat(done);
  assert.deepEqual(calls(), [{ method: "POST", path: "/v1/talent/repeat/pin", body: { seller_id: "seller-1", project_id: "p1", pinned: true } }]);
  reset(() => {
    throw new BayApiError("服务暂不可用", 503);
  });
  await repeat.pinBeforeRepeat(done);
  assert.deepEqual(await repeat.listBayRepeatPartners(), [], "端点没上线：空列表，不造数据");
  reset(() => {
    throw new BayApiError("出错了", 500);
  });
  await assert.rejects(repeat.listBayRepeatPartners({ limit: 500 }), /出错了/);
  assert.equal(calls().at(-1).path, "/v1/talent/repeat/partners?limit=100");
});
