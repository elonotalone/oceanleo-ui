// W04：Bay 需求 / 求助客户端。网络一律打桩，只看发出去的请求长什么样。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const httpStub = dataModule(`
  export const calls = [];
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
  }
  const reply = () => globalThis.__bayReply ?? {};
  export async function bayGet(path, opts) { calls.push({ method: "GET", path, opts }); return reply(); }
  export async function bayPost(path, body) { calls.push({ method: "POST", path, body }); return reply(); }
  export async function bayPatch(path, body) { calls.push({ method: "PATCH", path, body }); return reply(); }
  export async function bayDelete(path) { calls.push({ method: "DELETE", path }); return reply(); }
`);
const agentStub = dataModule(`
  export const authedCalls = [];
  export async function authed(path, init) {
    authedCalls.push({ path, init });
    return globalThis.__authedReply ?? { ok: true, data: { demand: { id: "d1" } } };
  }
`);

const http = await import(httpStub);
const agent = await import(agentStub);
const demands = await import(
  await compileModule("src/lib/bay/demands.ts", { "./http": httpStub, "../agent": agentStub })
);
const handoffs = await import(
  await compileModule("src/lib/bay/handoffs.ts", { "./http": httpStub, "../agent": agentStub })
);

function lastCall() {
  return http.calls[http.calls.length - 1];
}

test("发需求：请求体带发布站点与附带作品（只传 kind + id），只发交付型", async () => {
  await demands.createDemand(
    {
      title: "  做一份融资路演稿  ",
      description: "十页以内",
      category: "doc",
      skills: ["PPT", " PPT ", ""],
      reference_links: ["https://a.test", "https://a.test"],
      status: "open",
    },
    { postedSite: "ppt", attachedWork: { kind: "task", id: "task-1", title: "不该被发出去" } },
  );
  const call = lastCall();
  assert.equal(call.method, "POST");
  assert.equal(call.path, "/v1/talent/demands");
  assert.equal(call.body.posted_site, "ppt");
  assert.deepEqual(call.body.attached_work, { kind: "task", id: "task-1" });
  assert.equal(call.body.title, "做一份融资路演稿");
  assert.deepEqual(call.body.skills, ["PPT"]);
  assert.deepEqual(call.body.reference_links, ["https://a.test"]);
  assert.equal(call.body.catalog_kind, "delivery");
  assert.equal(call.body.regulated_domain, "none");
});

test("发需求：没附作品、门户发布 → attached_work 为 null，posted_site 照记", () => {
  const body = demands.buildDemandBody({ title: "t" }, { postedSite: "oceanleo", attachedWork: null });
  assert.equal(body.posted_site, "oceanleo");
  assert.equal(body.attached_work, null);
  const blank = demands.buildDemandBody({ title: "t" }, { postedSite: "  " });
  assert.equal(blank.posted_site, null);
  assert.equal(blank.attached_work, null);
  const badWork = demands.buildDemandBody({ title: "t" }, { postedSite: "ppt", attachedWork: { kind: "task", id: "  " } });
  assert.equal(badWork.attached_work, null);
});

test("编辑需求走 PUT，可以换掉或去掉附带作品", async () => {
  agent.authedCalls.length = 0;
  await demands.updateDemand("d 1", { title: "新标题" }, null);
  assert.equal(agent.authedCalls.length, 1);
  const { path, init } = agent.authedCalls[0];
  assert.equal(path, "/v1/talent/demands/d%201");
  assert.equal(init.method, "PUT");
  assert.deepEqual(JSON.parse(init.body), { title: "新标题", attached_work: null });
});

test("编辑需求失败：后端的中文 detail.message 原样变成错误", async () => {
  globalThis.__authedReply = { ok: false, status: 422, error: "x", detail: { message: "作品不属于你" } };
  await assert.rejects(() => demands.updateDemand("d1", { title: "t" }), (error) => {
    assert.equal(error.message, "作品不属于你");
    assert.equal(error.status, 422);
    return true;
  });
  delete globalThis.__authedReply;
});

test("报价、接受、拒绝、关闭、邀请链接的路径与请求体", async () => {
  await demands.submitProposal("d1", { price_fen: 50000, delivery_days: 3, message: "  方案  " });
  assert.deepEqual(lastCall(), {
    method: "POST",
    path: "/v1/talent/demands/d1/proposals",
    body: { price_fen: 50000, delivery_days: 3, message: "方案" },
  });
  await demands.acceptProposal("p1");
  assert.equal(lastCall().path, "/v1/talent/proposals/p1/accept");
  await demands.declineProposal("p1");
  assert.equal(lastCall().path, "/v1/talent/proposals/p1/decline");
  await demands.withdrawProposal("p1");
  assert.equal(lastCall().path, "/v1/talent/proposals/p1/withdraw");
  await demands.closeDemand("d1", "  不做了 ");
  assert.deepEqual(lastCall().body, { reason: "不做了" });
  await demands.createDemandInviteLink("d1");
  assert.deepEqual(lastCall().body, { ttl_days: 14 });
  await demands.revokeDemandInviteLink("d1");
  assert.equal(lastCall().method, "DELETE");
  await demands.getDemand("d1");
  assert.equal(lastCall().opts.anonymous, true, "需求详情不登录也能看");
  await demands.listMyDemands({ status: "all", limit: 20 });
  assert.equal(lastCall().path, "/v1/talent/demands/mine?limit=20");
});

test("邀请链接只落在门户 /bay/demands/invite/<token>，带联系方式的 token 一律拒绝", () => {
  assert.equal(demands.bayDemandInvitePath("abc_DEF-1.2~"), "/bay/demands/invite/abc_DEF-1.2~");
  assert.equal(demands.bayDemandInvitePath("me@example.com"), null);
  assert.equal(demands.bayDemandInvitePath("+86 138 0000 0000"), null);
  assert.equal(demands.bayDemandInvitePath("a/b"), null);
  assert.equal(demands.bayDemandInvitePath(""), null);
});

test("预算输入：空 = 面议，负数与脏值 = NaN", () => {
  assert.equal(demands.parseMoneyInput(""), null);
  assert.equal(demands.parseMoneyInput("12.5"), 1250);
  assert.equal(demands.parseMoneyInput("1,200"), 120000);
  assert.ok(Number.isNaN(demands.parseMoneyInput("-3")));
  assert.ok(Number.isNaN(demands.parseMoneyInput("abc")));
});

test("发求助：请求体带发布站点与附带作品，白名单照旧收口", async () => {
  await handoffs.createBayHandoff({
    originKind: "manual",
    originRef: "",
    category: "design",
    brief: "  海报改一下  ",
    budgetFen: 30000,
    mode: "open",
    invitedHandle: "someone",
    context: { messages: [" 1 ", "1", ""], artifacts: [] },
    postedSite: "design",
    attachedWork: { kind: "task", id: "task-9" },
  });
  const call = lastCall();
  assert.equal(call.path, "/v1/talent/handoffs");
  assert.equal(call.body.posted_site, "design");
  assert.deepEqual(call.body.attached_work, { kind: "task", id: "task-9" });
  assert.equal(call.body.brief, "海报改一下");
  assert.equal(call.body.invited_handle, null, "公开求助不带指定的人");
  assert.deepEqual(call.body.context, { messages: ["1"], artifacts: [] });
});

test("发求助：任务页带会话、不附作品；指定某人时去掉 @", () => {
  const body = handoffs.buildHandoffBody({
    originKind: "conversation",
    originRef: "task-1",
    category: "doc",
    brief: "b",
    budgetFen: -5,
    mode: "invited",
    invitedHandle: " @leo ",
    postedSite: null,
  });
  assert.equal(body.origin_kind, "conversation");
  assert.equal(body.origin_ref, "task-1");
  assert.equal(body.budget_fen, 0);
  assert.equal(body.invited_handle, "leo");
  assert.equal(body.posted_site, null);
  assert.equal(body.attached_work, null);
});

test("求助收件箱分区与认领失败分类", () => {
  const split = handoffs.splitInbox([
    { id: "1", mode: "invited" },
    { id: "2", mode: "open" },
  ]);
  assert.deepEqual(split.invited.map((x) => x.id), ["1"]);
  assert.deepEqual(split.open.map((x) => x.id), ["2"]);
  assert.equal(handoffs.claimFailureKind(409), "taken");
  assert.equal(handoffs.claimFailureKind(404), "gone");
  assert.equal(handoffs.claimFailureKind(403), "not_invited");
  assert.equal(handoffs.claimFailureKind(500), "other");
  assert.equal(handoffs.handoffIsLive({ state: "claimed" }), true);
  assert.equal(handoffs.handoffIsLive({ state: "expired" }), false);
});
