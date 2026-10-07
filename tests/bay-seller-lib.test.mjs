// W08（oceanleo-bay）：卖家取数层——新建服务带 posted_site、更新走 PUT 全量、分组、受限领域不出现、
// 作品集导入、资质审核的提交与申诉请求形状。
import test from "node:test";
import assert from "node:assert/strict";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const HTTP_STUB = dataModule(`
export class BayApiError extends Error {
  constructor(message, status, code = null) { super(message); this.name = "BayApiError"; this.status = status; this.code = code; }
}
function record(method, path, body, opts) {
  (globalThis.__baySellerCalls ||= []).push({ method, path, body, anonymous: Boolean(opts && opts.anonymous) });
  const handler = globalThis.__baySellerReply;
  return handler ? handler(method, path, body) : {};
}
export async function bayGet(path, opts) { return record("GET", path, undefined, opts); }
export async function bayPost(path, body) { return record("POST", path, body); }
export async function bayPatch(path, body) { return record("PATCH", path, body); }
export async function bayDelete(path) { return record("DELETE", path); }
`);

const AGENT_STUB = dataModule(`
export async function authed(path, init) {
  (globalThis.__baySellerCalls ||= []).push({ method: init && init.method, path, body: init && init.body ? JSON.parse(init.body) : undefined });
  const handler = globalThis.__baySellerAuthed;
  return handler ? handler(path, init) : { ok: true, data: {} };
}
`);

const seller = await import(
  await compileModule("src/lib/bay/seller.ts", { "./http": HTTP_STUB, "../agent": AGENT_STUB })
);
const vetting = await import(
  await compileModule("src/lib/bay/vetting.ts", { "./http": HTTP_STUB, "./seller": await compileModule("src/lib/bay/seller.ts", { "./http": HTTP_STUB, "../agent": AGENT_STUB }) })
);

function reset(reply, authedReply) {
  globalThis.__baySellerCalls = [];
  globalThis.__baySellerReply = reply || null;
  globalThis.__baySellerAuthed = authedReply || null;
}

const INPUT = {
  title: "为你的 SaaS 设计一套核心界面",
  summary: "适合早期团队",
  description: "交付边界写清楚",
  category: "design",
  catalog_kind: "delivery",
  regulated_domain: "none",
  engagement_kind: "fixed",
  price_fen: 120000,
  price_unit: "project",
  delivery_days: 5,
  status: "draft",
};

test("新建服务：请求体带 posted_site，等于当前站", async () => {
  reset((method, path) => ({ service: { id: "s1", status: "draft" } }));
  const out = await seller.createMyService(INPUT, "video");
  assert.equal(out.service.id, "s1");
  const call = globalThis.__baySellerCalls[0];
  assert.equal(call.method, "POST");
  assert.equal(call.path, "/v1/talent/me/services");
  assert.equal(call.body.posted_site, "video");
  assert.equal(call.body.title, INPUT.title);
  assert.equal(call.body.catalog_kind, "delivery");

  reset(() => ({ service: { id: "s2" } }));
  await seller.createMyService(INPUT, "  PPT ");
  assert.equal(globalThis.__baySellerCalls[0].body.posted_site, "ppt", "站 key 规整成小写");
  reset(() => ({ service: { id: "s3" } }));
  await seller.createMyService(INPUT, "../evil");
  assert.equal(globalThis.__baySellerCalls[0].body.posted_site, null, "不合法的站 key 不发");
  assert.deepEqual(seller.newServiceBody(INPUT, "oceanleo").posted_site, "oceanleo");
});

test("更新服务：PUT 全量载荷，不带 posted_site；后端拒绝理由原样进 Error.message", async () => {
  reset(null, (path, init) => ({ ok: true, data: { service: { id: "s1", status: "draft" } } }));
  await seller.updateMyService("s/1", { ...INPUT, status: "published" });
  const call = globalThis.__baySellerCalls[0];
  assert.equal(call.method, "PUT");
  assert.equal(call.path, "/v1/talent/me/services/s%2F1");
  assert.equal(call.body.status, "published");
  assert.equal("posted_site" in call.body, false);

  reset(null, () => ({ ok: false, status: 400, error: "HTTP 400", detail: { reason_zh: "标题里有越界表述" } }));
  await assert.rejects(seller.updateMyService("s1", INPUT), (error) => error.message === "标题里有越界表述" && error.status === 400);
  reset(null, () => ({ ok: false, status: 409, error: "这个用户名已被占用，换一个试试" }));
  await assert.rejects(seller.saveSellerProfile({ handle: "a", display_name: "A" }), /已被占用/);
});

test("资料保存：PUT /me 只发网关认的字段，不发 timezone（仲裁 #10）", async () => {
  reset(null, () => ({ ok: true, data: { profile: { handle: "leo" } } }));
  await seller.saveSellerProfile({
    handle: "leo",
    display_name: "Leo",
    headline: "做品牌视觉",
    bio: "",
    skills: ["Figma"],
    languages: ["中文"],
    availability: "open",
    offplatform_delivery_opt_in: true,
    published: true,
    timezone: "Asia/Shanghai",
    rating_avg: 4.9,
  });
  const call = globalThis.__baySellerCalls[0];
  assert.equal(call.method, "PUT");
  assert.equal(call.path, "/v1/talent/me");
  assert.equal("timezone" in call.body, false);
  assert.equal("rating_avg" in call.body, false, "统计字段不回写");
  assert.deepEqual(Object.keys(call.body).sort(), ["availability", "bio", "display_name", "handle", "headline", "languages", "offplatform_delivery_opt_in", "published", "skills"]);
});

test("档位替换、暂停、上架、删除走对的接口", async () => {
  reset(() => ({}), () => ({ ok: true, data: { items: [] } }));
  await seller.replaceServiceTiers("s1", [{ tier: "basic", title: "基础版", description: "", price_fen: 100, delivery_days: 3, revisions: 1, features: [], enabled: true }]);
  await seller.pauseMyService("s1");
  await seller.publishMyService("s1");
  await seller.deleteMyService("s1");
  const calls = globalThis.__baySellerCalls.map((c) => `${c.method} ${c.path}`);
  assert.deepEqual(calls, [
    "PUT /v1/talent/me/services/s1/tiers",
    "POST /v1/talent/me/services/s1/unpublish",
    "POST /v1/talent/me/services/s1/publish",
    "DELETE /v1/talent/me/services/s1",
  ]);
  assert.equal(globalThis.__baySellerCalls[0].body.tiers.length, 1);
});

test("我的服务分组：被隐藏优先，其余按状态；限定领域不出现", () => {
  const groups = seller.groupMyServices([
    { id: "a", title: "A", status: "published", moderation_hidden: true },
    { id: "b", title: "B", status: "published" },
    { id: "c", title: "C", status: "paused" },
    { id: "d", title: "D", status: "draft" },
    { id: "e", title: "E", status: "published", regulated_domain: "medical" },
    null,
  ]);
  assert.deepEqual(groups.hidden.map((s) => s.id), ["a"]);
  assert.deepEqual(groups.published.map((s) => s.id), ["b"]);
  assert.deepEqual(groups.paused.map((s) => s.id), ["c"]);
  assert.deepEqual(groups.draft.map((s) => s.id), ["d"]);
  assert.deepEqual(seller.BAY_SERVICE_GROUP_ORDER, ["hidden", "published", "paused", "draft"]);
});

test("向导类目：交付只出交付类目；答疑按领域筛，限定领域永远不出现", () => {
  const rows = [
    { slug: "design", catalog_kind: "delivery", regulated_domain: "none", position: 10, published: true },
    { slug: "video", catalog_kind: "delivery", regulated_domain: "none", position: 30, published: true },
    { slug: "tax-basic", catalog_kind: "consult", regulated_domain: "tax", position: 1100, published: true },
    { slug: "med-qa", catalog_kind: "consult", regulated_domain: "medical", position: 1000, published: true },
    { slug: "law-qa", catalog_kind: "consult", regulated_domain: "legal", position: 1010, published: true },
    { slug: "pet-qa", catalog_kind: "consult", regulated_domain: "vet", position: 1020, published: true },
    { slug: "hidden", catalog_kind: "delivery", regulated_domain: "none", position: 5, published: false },
  ];
  assert.deepEqual(seller.wizardCategories(rows, "delivery").map((r) => r.slug), ["design", "video"]);
  assert.deepEqual(seller.wizardCategories(rows, "consult").map((r) => r.slug), ["tax-basic"]);
  assert.deepEqual(seller.wizardCategories(rows, "consult", "medical").map((r) => r.slug), []);
  assert.deepEqual(seller.wizardCategories(rows, "consult", "tax").map((r) => r.slug), ["tax-basic"]);
});

test("答疑领域清单：去掉 none 与医疗、法律、宠物医疗", async () => {
  reset(() => ({ domains: ["none", "medical", "legal", "tax", "psych", "vet", "career"].map((key) => ({ key, name_zh: key, gated: ["medical", "legal", "vet"].includes(key) })) }));
  const domains = await seller.listConsultDomains();
  assert.deepEqual(domains.map((d) => d.key), ["tax", "psych", "career"]);
  assert.equal(globalThis.__baySellerCalls[0].anonymous, true);
});

test("答疑挂牌：带 posted_site，按次只带轮数、按时只带分钟；限定领域不发请求", async () => {
  reset(() => ({ consult: { id: "c1" } }));
  await seller.createMyConsult(
    { category_slug: "tax-basic", regulated_domain: "tax", title: "讲清个税汇算", price_fen: 9900, price_unit: "session", rounds: 3, minutes: 60, status: "draft" },
    "finance",
  );
  const body = globalThis.__baySellerCalls[0].body;
  assert.equal(globalThis.__baySellerCalls[0].path, "/v1/talent/consults");
  assert.equal(body.posted_site, "finance");
  assert.equal(body.rounds, 3);
  assert.equal(body.minutes, null);

  reset(() => ({ consult: { id: "c2" } }));
  await assert.rejects(
    seller.createMyConsult({ category_slug: "med-qa", regulated_domain: "medical", title: "x", price_fen: 1, price_unit: "hour", minutes: 60, status: "draft" }, "med"),
  );
  assert.equal(globalThis.__baySellerCalls.length, 0);

  reset(() => ({ items: [{ id: "c1", regulated_domain: "tax" }, { id: "c9", regulated_domain: "vet" }] }));
  const mine = await seller.listMyConsults();
  assert.deepEqual(mine.items.map((c) => c.id), ["c1"]);
});

test("作品集：加入用 pickLibraryWork 的返回（task id），排序与移除", async () => {
  reset(() => ({ items: [{ id: "sc1" }] }));
  const work = { kind: "task", id: "task-42", site_key: "ppt", title: "季度汇报" };
  await seller.addShowcaseWork(work);
  await seller.patchShowcaseItem("sc1", { position: 3 });
  await seller.removeShowcaseItem("sc1");
  const [add, patch, remove] = globalThis.__baySellerCalls;
  assert.equal(add.path, "/v1/talent/me/showcase/import-tasks");
  assert.deepEqual(add.body, { task_ids: ["task-42"], detail_level: "summary" });
  assert.equal(patch.method, "PATCH");
  assert.deepEqual(patch.body, { position: 3 });
  assert.equal(remove.method, "DELETE");
  assert.equal(remove.path, "/v1/talent/me/showcase/sc1");
});

test("卖家概况：进行中订单、待回复", () => {
  assert.equal(seller.activeOrderCount({ orders_by_status: { active: 2, delivered: 1, completed: 9 }, pending_orders: 0 }), 3);
  assert.equal(seller.activeOrderCount({ orders_by_status: { draft: 2, negotiating: 1, active: 0 }, pending_orders: 3 }), 0, "没签约的不算进行中");
  assert.equal(seller.awaitingAcceptCount({ orders_by_status: { draft: 2, negotiating: 1, active: 4 } }), 3);
  assert.equal(seller.activeOrderCount({ orders_by_status: {}, pending_orders: 4 }), 4);
  assert.equal(seller.activeOrderCount(null), 0);
  assert.equal(seller.awaitingReplyCount([{ id: "t1", unread_count: 2 }, { id: "t2", unread_count: 0, last_message: { user_id: "me" } }, { id: "t3", last_message: { user_id: "buyer" } }], "me"), 2);
});

test("越界表述提示：执业称谓与需许可业务", () => {
  assert.deepEqual(seller.overreachHints("资深律师带你读合同").map((h) => h.term), ["律师"]);
  assert.deepEqual(seller.overreachHints("k12学科培训").map((h) => h.kind), ["scope"]);
  assert.deepEqual(seller.overreachHints("   "), []);
});

test("资质审核：读我的状态（凭证 + 判定），限定领域的凭证不出现", async () => {
  reset(() => ({
    credentials: [
      { id: "cr1", domain: "tax", state: "valid", source: "税务师协会", checked_at: "2026-09-01T00:00:00Z", expires_at: "2027-03-01T00:00:00Z" },
      { id: "cr2", domain: "medical", state: "pending", source: "x" },
      { id: "", domain: "tax" },
    ],
    decisions: [
      { id: "d1", verdict: "reject", reason_zh: "账号名下没有查到未过期的凭证", appealed: false },
      { id: "d2", verdict: "reject", appealed: true },
      { id: "d3", verdict: "pass" },
    ],
    recheck_days: 180,
  }));
  const mine = await vetting.fetchMyVetting();
  assert.deepEqual(mine.credentials.map((c) => c.id), ["cr1"]);
  assert.equal(mine.decisions.length, 3);
  assert.equal(vetting.canAppealDecision(mine.decisions[0]), true);
  assert.equal(vetting.canAppealDecision(mine.decisions[1]), false, "申诉过一次就不能再申诉");
  assert.equal(vetting.canAppealDecision(mine.decisions[2]), false, "通过的不能申诉");
});

test("资质审核：提交请求形状；身份证号形状被本地挡住；申诉是 POST /vetting/<判定 id>/appeal 不带正文", async () => {
  assert.equal(vetting.vettingSubmitProblem({ domain: "medical", kind: "education", credential_no: "1", source: "x" }), "domain");
  assert.equal(vetting.vettingSubmitProblem({ domain: "tax", kind: "nope", credential_no: "1", source: "x" }), "kind");
  assert.equal(vetting.vettingSubmitProblem({ domain: "tax", kind: "education", credential_no: " ", source: "x" }), "credential");
  assert.equal(vetting.vettingSubmitProblem({ domain: "tax", kind: "education", credential_no: "11010519491231002X", source: "x" }), "id_number");
  assert.equal(vetting.vettingSubmitProblem({ domain: "tax", kind: "education", credential_no: "A-123", source: "" }), "source");
  assert.equal(vetting.vettingSubmitProblem({ domain: "tax", kind: "education", credential_no: "A-123", source: "学信网" }), null);

  reset(() => ({ verification_id: "v1", credential: { id: "cr9", domain: "tax", state: "pending" } }));
  await vetting.submitVetting({ domain: "tax", kind: "education", credential_no: "  A-123 ", source: " 学信网在线验证报告 " });
  const submit = globalThis.__baySellerCalls[0];
  assert.equal(submit.method, "POST");
  assert.equal(submit.path, "/v1/talent/vetting/submit");
  assert.deepEqual(submit.body, { domain: "tax", kind: "education", credential_no: "A-123", source: "学信网在线验证报告" });

  reset(() => ({ decision: { id: "d1", verdict: "manual", appealed: true } }));
  await vetting.appealVettingDecision("d1");
  const appeal = globalThis.__baySellerCalls[0];
  assert.equal(appeal.method, "POST");
  assert.equal(appeal.path, "/v1/talent/vetting/d1/appeal");
  assert.equal(appeal.body, undefined);
});

test("复核到期：几天后 / 今天 / 已过期 / 未定", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  assert.deepEqual(vetting.vettingExpiry("2026-10-16T12:00:00Z", now), { kind: "future", days: 10 });
  assert.deepEqual(vetting.vettingExpiry("2026-10-06T13:00:00Z", now), { kind: "today" });
  assert.deepEqual(vetting.vettingExpiry("2026-10-01T12:00:00Z", now), { kind: "past", days: 5 });
  assert.deepEqual(vetting.vettingExpiry(null, now), { kind: "none" });
  assert.deepEqual(vetting.vettingExpiry("not a date", now), { kind: "none" });
});
