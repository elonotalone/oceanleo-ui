// W07：收件箱里的交易会话。
// 覆盖：talent 行 → ImMessage 的映射、报价按钮的权限矩阵、列表渲染（隐藏占位、XSS 当文字、只认 http(s) 附件）、
// 请求拼装、会话视图的首帧与无效会话。网络、登录、实时通道、域名家族全部用桩。
import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const uiStub = dataModule("export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }");
const clientStub = dataModule(`
  export async function imFetch(){ throw new Error("network is stubbed"); }
  export class ImApiError extends Error {}
`);
const familyStub = dataModule(`
  export function currentDomainFamily(){ return "com"; }
  export function currentFamilySubsiteOrigin(){ return undefined; }
`);
const hooksStub = dataModule(`
  export function useImEvent(){}
  export function useImConnection(){ return "open"; }
`);

const apiUrl = await compileModule("src/shell/messages/talent/talent-api.ts", {
  "../../../lib/im/client": clientStub,
  "../../../contracts/domain-family": familyStub,
});
const api = await import(apiUrl);

const listUrl = await compileModule("src/shell/messages/talent/TalentMessageList.tsx", {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/im/client": clientStub,
  "../../../contracts/domain-family": familyStub,
});
const { TalentMessageList, httpUrlOf } = await import(listUrl);

const cardUrl = await compileModule("src/shell/messages/talent/TalentOfferCard.tsx", {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/im/client": clientStub,
  "../../../contracts/domain-family": familyStub,
});
const { TalentOfferCard } = await import(cardUrl);

const viewUrl = await compileModule("src/shell/messages/talent/TalentConversationView.tsx", {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/im/client": clientStub,
  "../../../contracts/domain-family": familyStub,
  "../realtime/hooks": hooksStub,
});
const { TalentConversationView, inferViewerId } = await import(viewUrl);

const T0 = "2026-10-06T10:00:00.000Z";
const T1 = "2026-10-06T10:01:00.000Z";
const T2 = "2026-10-06T10:02:00.000Z";
const BUYER = "user-buyer";
const SELLER = "user-seller";

function row(id, extra = {}) {
  return { id, thread_id: "th1", user_id: SELLER, kind: "text", body: id, meta: {}, attachments: [], created_at: T0, ...extra };
}

function offer(extra = {}) {
  return {
    id: "of1", thread_id: "th1", from_user_id: SELLER, to_user_id: BUYER, title: "做一套 Logo", description: "三版方案",
    price_fen: 128000, delivery_days: 5, revisions: 2, engagement_kind: "fixed", service_id: null, state: "pending",
    expires_at: null, contract_id: null, currency: "CNY", created_at: T0, updated_at: T0, ...extra,
  };
}

const html = (node) => renderToStaticMarkup(node);

test("会话 id：只认 talent:<thread_id>", () => {
  assert.equal(api.parseTalentConversationId("talent:abc-123"), "abc-123");
  assert.equal(api.parseTalentConversationId("talent:"), null);
  assert.equal(api.parseTalentConversationId("abc"), null);
  assert.equal(api.parseTalentConversationId("talent:a/b"), null);
  assert.equal(api.parseTalentConversationId("talent:<script>"), null);
  assert.equal(api.talentConversationId("x1"), "talent:x1");
});

test("报价按钮：只有收到的人能接受/拒绝，只有发出的人能撤回，且只在待回复时", () => {
  const pending = offer();
  assert.deepEqual(api.offerActionsFor(pending, BUYER), { accept: true, decline: true, withdraw: false });
  assert.deepEqual(api.offerActionsFor(pending, SELLER), { accept: false, decline: false, withdraw: true });
  assert.deepEqual(api.offerActionsFor(pending, "stranger"), { accept: false, decline: false, withdraw: false });
  assert.deepEqual(api.offerActionsFor(pending, null), { accept: false, decline: false, withdraw: false });
  for (const state of ["accepted", "declined", "withdrawn", "expired"]) {
    assert.deepEqual(api.offerActionsFor(offer({ state }), BUYER), { accept: false, decline: false, withdraw: false }, state);
    assert.deepEqual(api.offerActionsFor(offer({ state }), SELLER), { accept: false, decline: false, withdraw: false }, state);
  }
});

test("talent 行 → ImMessage：文字、系统、附件、报价卡、审核隐藏", () => {
  const text = api.toImMessage(row("m1", { body: "你好" }));
  assert.equal(text.conversation_id, "talent:th1");
  assert.equal(text.kind, "text");
  assert.equal(text.sender_kind, "user");
  assert.equal(text.body, "你好");
  assert.equal(text.hidden_reason, null);
  assert.equal(text.seq, Date.parse(T0));

  const system = api.toImMessage(row("m2", { kind: "system", user_id: null, body: "买家接受了报价" }));
  assert.equal(system.kind, "system");
  assert.equal(system.sender_kind, "system");
  assert.equal(system.sender_id, null);

  const withFiles = api.toImMessage(
    row("m3", { body: "", attachments: [{ url: "https://x.test/a.png", name: "a.png", kind: "image" }, { url: "", name: "空" }, { name: "无地址" }] }),
  );
  assert.equal(withFiles.attachments.length, 1);
  assert.equal(withFiles.attachments[0].kind, "image");

  const offerMsg = api.toImMessage(row("m4", { kind: "offer", body: "做一套 Logo", meta: { offer_id: "of1" } }), { of1: offer() });
  assert.equal(offerMsg.kind, "text");
  assert.equal(offerMsg.card.type, "talent_offer");
  assert.equal(offerMsg.card.id, "of1");
  assert.match(offerMsg.card.subtitle, /1280\.00/);

  const hidden = api.toImMessage(row("m5", { body: "违规", moderation_hidden: true, attachments: [{ url: "https://x.test/b.png", kind: "image" }] }));
  assert.equal(hidden.hidden_reason, "moderation");
  assert.equal(hidden.body, "");
  assert.deepEqual(hidden.attachments, []);
  assert.equal(hidden.card, null);
});

test("一页（新的在前）按时间升序排好；事件里的消息按 id 并入、不重复", () => {
  const page = { messages: [row("c", { created_at: T2 }), row("a", { created_at: T0 }), row("b", { created_at: T1 })], offers: [] };
  const list = api.pageToMessages(page);
  assert.deepEqual(list.map((m) => m.id), ["a", "b", "c"]);
  const merged = api.mergeMessages(list, [api.toImMessage(row("b", { created_at: T1, body: "改过" })), api.toImMessage(row("d", { created_at: "2026-10-06T10:03:00.000Z" }))]);
  assert.deepEqual(merged.map((m) => m.id), ["a", "b", "c", "d"]);
  assert.equal(merged[1].body, "改过");
});

test("请求拼装：读、发、已读、报价动作都走 talent 现有接口", async () => {
  const calls = [];
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    return {};
  };
  await api.fetchTalentThread("th 1", { before: "2026-10-06T00:00:00Z" }, fetcher);
  await api.sendTalentMessage("th1", "你好", fetcher);
  await api.markTalentThreadRead("th1", fetcher);
  await api.actOnTalentOffer("of1", "accept", fetcher);
  await api.actOnTalentOffer("of1", "decline", fetcher);
  await api.actOnTalentOffer("of1", "withdraw", fetcher);
  assert.match(calls[0].path, /^\/v1\/talent\/threads\/th%201\/messages\?/);
  assert.match(calls[0].path, /before=2026-10-06T00%3A00%3A00Z/);
  assert.equal(calls[1].path, "/v1/talent/threads/th1/messages");
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(calls[1].init.json, { body: "你好", attachments: [] });
  assert.equal(calls[2].path, "/v1/talent/threads/th1/read");
  assert.deepEqual(calls.slice(3).map((c) => c.path), ["/v1/talent/offers/of1/accept", "/v1/talent/offers/of1/decline", "/v1/talent/offers/of1/withdraw"]);
});

test("交易会话地址是站内 Bay，境内不给链接", async () => {
  assert.equal(api.talentThreadUrl("th1"), "/bay?bay=conversation:th1");
  const cnUrl = await compileModule("src/shell/messages/talent/talent-api.ts", {
    "../../../lib/im/client": clientStub,
    "../../../contracts/domain-family": dataModule("export function currentDomainFamily(){ return \"cn\"; }"),
  });
  const cn = await import(cnUrl);
  assert.equal(cn.talentThreadUrl("th1"), null);
});

test("谁是「我」：从报价双方或消息里排除对方", () => {
  assert.equal(inferViewerId(SELLER, [], [offer()]), BUYER);
  assert.equal(inferViewerId(BUYER, [], [offer()]), SELLER);
  assert.equal(inferViewerId(SELLER, [api.toImMessage(row("m1", { user_id: BUYER }))], []), BUYER);
  assert.equal(inferViewerId(SELLER, [], []), null);
});

test("列表：隐藏消息只显示占位；正文当纯文字；附件只认 http(s)", () => {
  const messages = [
    api.toImMessage(row("h", { body: "违规内容", moderation_hidden: true })),
    api.toImMessage(row("x", { body: "<img src=x onerror=alert(1)><script>alert(1)</script>" })),
    api.toImMessage(
      row("f", {
        body: "",
        attachments: [
          { url: "javascript:alert(1)", name: "坏", kind: "file" },
          { url: "data:text/html,<b>x</b>", name: "也坏", kind: "image" },
          { url: "https://cdn.test/ok.png", name: "ok.png", kind: "image" },
          { url: "https://cdn.test/a.pdf", name: "a.pdf", kind: "file" },
        ],
      }),
    ),
  ];
  const out = html(
    React.createElement(TalentMessageList, {
      messages, viewerId: BUYER, offers: {}, onOfferAct() {}, onReport() {},
    }),
  );
  assert.match(out, /该消息因违反规则已隐藏/);
  assert.equal(out.includes("违规内容"), false);
  assert.equal(out.includes("<script>"), false);
  assert.match(out, /&lt;script&gt;/);
  assert.equal(/<img[^>]*onerror/i.test(out), false);
  assert.equal(out.includes("javascript:"), false);
  assert.equal(out.includes("data:text/html"), false);
  assert.match(out, /<img[^>]*src="https:\/\/cdn\.test\/ok\.png"/);
  assert.match(out, /href="https:\/\/cdn\.test\/a\.pdf"[^>]*rel="noopener noreferrer"/);
  assert.equal(httpUrlOf("ftp://x"), null);
  assert.equal(httpUrlOf("https://x.test/a"), "https://x.test/a");
});

test("列表：别人发的消息有「举报」，自己的和被隐藏的没有；系统消息居中", () => {
  const messages = [
    api.toImMessage(row("mine", { user_id: BUYER, body: "我说的" })),
    api.toImMessage(row("theirs", { user_id: SELLER, body: "他说的" })),
    api.toImMessage(row("sys", { kind: "system", user_id: null, body: "买家接受了报价" })),
    api.toImMessage(row("hid", { user_id: SELLER, body: "x", moderation_hidden: true })),
  ];
  const out = html(
    React.createElement(TalentMessageList, { messages, viewerId: BUYER, offers: {}, onOfferAct() {}, onReport() {} }),
  );
  assert.equal((out.match(/data-action="report-message"/g) || []).length, 1);
  assert.match(out, /data-message-kind="system"/);
  assert.match(out, /data-mine="true"/);
});

test("报价卡：买家看到接受/拒绝，卖家看到撤回，已处理的没有按钮", () => {
  const card = { type: "talent_offer", id: "of1", title: "做一套 Logo" };
  const render = (props) => html(React.createElement(TalentOfferCard, { card, onAct() {}, ...props }));

  const buyer = render({ offer: offer(), viewerId: BUYER });
  assert.match(buyer, /data-offer-action="accept"/);
  assert.match(buyer, /data-offer-action="decline"/);
  assert.equal(buyer.includes('data-offer-action="withdraw"'), false);
  assert.match(buyer, /1280\.00 CNY/);
  assert.match(buyer, /5 天交付/);
  assert.match(buyer, /改稿 2 次/);

  const seller = render({ offer: offer(), viewerId: SELLER });
  assert.match(seller, /data-offer-action="withdraw"/);
  assert.equal(seller.includes('data-offer-action="accept"'), false);

  const done = render({ offer: offer({ state: "accepted", contract_id: "c1" }), viewerId: BUYER });
  assert.equal(done.includes("data-offer-action"), false);
  assert.match(done, /已接受/);
  assert.match(done, /草稿订单已生成/);

  const expired = render({ offer: offer({ state: "expired" }), viewerId: BUYER });
  assert.equal(expired.includes("data-offer-action"), false);

  const unlimited = render({ offer: offer({ revisions: -1 }), viewerId: BUYER });
  assert.match(unlimited, /不限改稿/);

  const withLink = render({ offer: offer(), viewerId: BUYER, openUrl: "/bay?bay=conversation:th1" });
  assert.match(withLink, /href="\/bay\?bay=conversation:th1"/);
  const noLink = render({ offer: offer(), viewerId: BUYER, openUrl: null });
  assert.equal(noLink.includes("data-offer-open"), false);

  const loud = render({ offer: offer({ title: "<b>x</b>", description: "<script>1</script>" }), viewerId: BUYER });
  assert.equal(loud.includes("<script>"), false);
  assert.equal(loud.includes("<b>x</b>"), false);
});

test("会话视图：首帧是加载中；会话 id 不对时给出说明而不是空白", () => {
  const loading = html(React.createElement(TalentConversationView, { conversationId: "talent:th1", layout: "full" }));
  assert.match(loading, /data-talent-view="full"/);
  assert.match(loading, /data-talent-loading/);
  assert.match(loading, /交易会话/);
  assert.match(loading, /href="\/bay\?bay=conversation:th1"/);

  const invalid = html(React.createElement(TalentConversationView, { conversationId: "dm-123", layout: "docked" }));
  assert.match(invalid, /data-talent-view="invalid"/);
  assert.match(invalid, /这个会话打不开/);
});
