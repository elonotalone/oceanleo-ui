// W06（oceanleo-bay）：交易会话接口层 `src/lib/bay/threads.ts`。
// 覆盖：请求路径与请求体、附件只认 https、报价表单收进服务端范围、合同摘要整理、举报 / 拉黑、
// 按主题找或建会话（服务 / 需求 / 私聊 / 合同 / 求助）。网络全部用桩，不联网。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const calls = [];
globalThis.__bayDealCalls = calls;
globalThis.__bayDealReplies = [];

const httpStub = dataModule(`
  function reply(method, path, body, opts) {
    globalThis.__bayDealCalls.push({ method, path, body, opts });
    const next = globalThis.__bayDealReplies.shift();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(typeof next === "function" ? next(path, body) : next);
  }
  export class BayApiError extends Error {}
  export function bayGet(path, opts) { return reply("GET", path, undefined, opts); }
  export function bayPost(path, body) { return reply("POST", path, body); }
  export function bayPatch(path, body) { return reply("PATCH", path, body); }
  export function bayDelete(path) { return reply("DELETE", path); }
`);

const api = await import(await compileModule("src/lib/bay/threads.ts", { "./http": httpStub }));

function reset(...replies) {
  calls.length = 0;
  globalThis.__bayDealReplies = [...replies];
}

test("会话列表、单个会话、已读：路径与参数", async () => {
  reset({ threads: [{ id: "t1", kind: "service", title: "logo", counterparty: { user_id: "u2" } }, { id: "bad id" }]});
  const list = await api.listDealThreads(500);
  assert.equal(calls[0].path, "/v1/talent/threads?limit=100");
  assert.deepEqual(list.map((t) => t.id), ["t1"], "不合规的 id 丢掉");

  reset({ thread: { id: "t1", kind: "demand", contract_id: null }, messages: [{ id: "m1" }], offers: [], contact_hint: 1 });
  const page = await api.fetchDealThread("t1", { before: "2026-10-06T00:00:00Z" });
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].path, "/v1/talent/threads/t1/messages?limit=50&before=2026-10-06T00%3A00%3A00Z");
  assert.equal(page.thread.kind, "demand");
  assert.equal(page.contact_hint, true);
  assert.equal(page.contract_summary, null);

  reset({ ok: true });
  await api.markDealThreadRead("t1");
  assert.deepEqual([calls[0].method, calls[0].path], ["POST", "/v1/talent/threads/t1/read"]);
});

test("合同摘要：顶层或 thread 里都认；字段逐个兜底；next_action 只认四种", () => {
  const top = api.contractSummaryOf({
    contract_summary: {
      id: "c1", title: "Logo", status: "active", payment_state: "held", total_fen: 12345.6, currency: "usd",
      next_action: "deliver", project_id: "p1", im_conversation_id: "conv-1",
      work: { site_key: "design", task_id: "task1", open_path: "/editor?task=task1" },
    },
  });
  assert.deepEqual(top, {
    id: "c1", title: "Logo", status: "active", payment_state: "held", total_fen: 12346, currency: "usd",
    next_action: "deliver", project_id: "p1", im_conversation_id: "conv-1",
    work: { site_key: "design", task_id: "task1", open_path: "/editor?task=task1" },
  });
  const nested = api.contractSummaryOf({ thread: { contract_summary: { id: "c2", status: "draft", next_action: "hack" } } });
  assert.equal(nested.id, "c2");
  assert.equal(nested.next_action, null);
  assert.equal(nested.work, null);
  assert.equal(api.contractSummaryOf({ contract_summary: { title: "no id" } }), null);
  assert.equal(api.contractSummaryOf(null), null);
});

test("发消息：附件只认 https，名字与种类收窄，最多 10 个", async () => {
  reset({ message: { id: "m9" } });
  await api.sendDealMessage("t1", "hi", [
    { url: "https://cdn.example.com/a.png", name: "a.png", kind: "image" },
    { url: "http://cdn.example.com/b.pdf", name: "b.pdf", kind: "file" },
    { url: "javascript:alert(1)", name: "x", kind: "file" },
    { url: "https://cdn.example.com/v.m4a", name: "", kind: "voice" },
    null,
  ]);
  assert.equal(calls[0].path, "/v1/talent/threads/t1/messages");
  assert.deepEqual(calls[0].body, {
    body: "hi",
    attachments: [
      { url: "https://cdn.example.com/a.png", name: "a.png", kind: "image" },
      { url: "https://cdn.example.com/v.m4a", name: "file", kind: "audio" },
    ],
  });
  const many = Array.from({ length: 14 }, (_, i) => ({ url: `https://x.example.com/${i}`, name: `${i}`, kind: "file" }));
  assert.equal(api.cleanAttachments(many).length, 10);
  assert.equal(api.safeAttachmentUrl("data:text/html,hi"), null);
  assert.equal(api.safeAttachmentUrl("https://ok.example.com/f"), "https://ok.example.com/f");
});

test("报价：表单收进 talent 的范围；接受 / 拒绝 / 撤回路径；按钮权限与 talent 一致", async () => {
  assert.deepEqual(
    api.offerBody({ title: "  海报  ", description: " 两版 ", priceFen: 19999.4, deliveryDays: 0, revisions: 500, serviceId: "s1" }),
    { title: "海报", description: "两版", price_fen: 19999, delivery_days: 1, revisions: 100, engagement_kind: "fixed", service_id: "s1" },
  );
  assert.equal(api.offerBody({ title: "x", priceFen: -5, deliveryDays: 99999, revisions: -7 }).revisions, -1);
  assert.equal(api.offerBody({ title: "x", priceFen: -5, deliveryDays: 99999, revisions: -7 }).delivery_days, 3650);
  assert.equal(api.offerBody({ title: "x", priceFen: -5, deliveryDays: 2, revisions: 1 }).price_fen, 0);

  reset({ offer: { id: "o1" } });
  await api.createDealOffer("t1", { title: "x", priceFen: 100, deliveryDays: 2, revisions: 1 });
  assert.deepEqual([calls[0].method, calls[0].path], ["POST", "/v1/talent/threads/t1/offers"]);

  for (const action of ["accept", "decline", "withdraw"]) {
    reset({ offer: { id: "o1" } });
    await api.actOnDealOffer("o1", action);
    assert.equal(calls[0].path, `/v1/talent/offers/o1/${action}`);
  }

  const offer = { state: "pending", from_user_id: "seller", to_user_id: "buyer" };
  assert.deepEqual(api.offerPermissions(offer, "buyer"), { accept: true, decline: true, withdraw: false });
  assert.deepEqual(api.offerPermissions(offer, "seller"), { accept: false, decline: false, withdraw: true });
  assert.deepEqual(api.offerPermissions({ ...offer, state: "accepted" }, "buyer"), { accept: false, decline: false, withdraw: false });
  assert.deepEqual(api.offerPermissions(offer, null), { accept: false, decline: false, withdraw: false });

  assert.equal(api.canSendOffer({ kind: "service" }, { isServiceOwner: true }), true);
  assert.equal(api.canSendOffer({ kind: "service" }, { isServiceOwner: false }), false);
  assert.equal(api.canSendOffer({ kind: "demand" }, { isDemandOwner: false }), true);
  assert.equal(api.canSendOffer({ kind: "demand" }, { isDemandOwner: true }), false);
  assert.equal(api.canSendOffer({ kind: "demand" }, {}), false, "不知道角色时不显示");
  assert.equal(api.canSendOffer({ kind: "handoff" }, { isServiceOwner: true }), false);
});

test("举报与拉黑：走站内消息的举报与拉黑接口，会话 id 用 talent: 前缀", async () => {
  reset({ case_id: "k1" });
  await api.reportDeal({
    target: { kind: "user", id: "u2" }, reason: "fraud", note: "  诱导站外  ", alsoBlock: true,
    conversationId: api.dealConversationId("t1"),
  });
  assert.equal(calls[0].path, "/v1/im/reports");
  assert.deepEqual(calls[0].body, {
    target: { kind: "user", id: "u2" }, reason: "fraud", note: "诱导站外", also_block: true, conversation_id: "talent:t1",
  });
  reset({ case_id: "k2" });
  await api.reportDeal({ target: { kind: "conversation", id: "talent:t1" }, reason: "spam", alsoBlock: true });
  assert.equal(calls[0].body.also_block, undefined, "举报会话不顺带拉黑");

  reset({ ok: true });
  await api.blockDealUser("u2");
  assert.deepEqual([calls[0].method, calls[0].path, calls[0].body], ["POST", "/v1/im/blocks", { user_id: "u2" }]);
  reset({ ok: true });
  await api.unblockDealUser("u2");
  assert.deepEqual([calls[0].method, calls[0].path], ["DELETE", "/v1/im/blocks/u2"]);
  reset({ items: [{ user_id: "u2" }, { user_id: "" }, {}] });
  assert.deepEqual([...(await api.listBlockedUserIds())], ["u2"]);
});

test("按主题找或建会话：服务 / 需求 / 私聊 / 合同 / 求助", async () => {
  reset({ thread: { id: "t-service" } });
  assert.equal(await api.findOrCreateDealThread({ kind: "service", subjectRef: "s1", userId: "seller" }), "t-service");
  assert.deepEqual(calls[0], {
    method: "POST", path: "/v1/talent/threads", opts: undefined,
    body: { kind: "service", counterparty_user_id: "seller", subject_ref: "s1" },
  });

  reset({ service: { id: "s1", user_id: "seller2" } }, { thread: { id: "t2" } });
  assert.equal(await api.findOrCreateDealThread({ kind: "service", subjectRef: "s1" }), "t2");
  assert.deepEqual([calls[0].method, calls[0].path, calls[0].opts], ["GET", "/v1/talent/services/s1", { anonymous: true }]);
  assert.equal(calls[1].body.counterparty_user_id, "seller2");

  reset({ demand: { id: "d1", buyer: { user_id: "poster" } } }, { thread: { id: "t3" } });
  assert.equal(await api.findOrCreateDealThread({ kind: "demand", subjectRef: "d1" }), "t3");
  assert.equal(calls[1].body.counterparty_user_id, "poster");

  reset({ thread: { id: "t4" } });
  assert.equal(await api.findOrCreateDealThread({ kind: "direct", userId: "u9" }), "t4");
  assert.deepEqual(calls[0].body, { kind: "direct", counterparty_user_id: "u9" });

  reset({ contract: { id: "c1", thread_id: "t5" } });
  assert.equal(await api.findOrCreateDealThread({ kind: "contract", subjectRef: "c1" }), "t5");
  assert.equal(calls[0].path, "/v1/talent/contracts/c1");

  reset({ handoff: { id: "h1", thread_id: "t6" } });
  assert.equal(await api.findOrCreateDealThread({ kind: "handoff", subjectRef: "h1" }), "t6");
  assert.equal(calls[0].path, "/v1/talent/handoffs/h1");

  reset({ handoff: { id: "h2", thread_id: null } });
  await assert.rejects(api.findOrCreateDealThread({ kind: "handoff", subjectRef: "h2" }), (e) => e.code === "no_thread");
  reset();
  await assert.rejects(api.findOrCreateDealThread({ kind: "direct" }), (e) => e.code === "invalid");
  await assert.rejects(api.findOrCreateDealThread({ kind: "service", subjectRef: "../x" }), (e) => e.code === "invalid");
  assert.equal(calls.length, 0, "主题不合规时不发请求");
});
