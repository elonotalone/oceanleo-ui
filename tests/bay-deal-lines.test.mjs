// W06（oceanleo-bay）：交易会话里的灰字行。
// 覆盖：33 种交易事件 + 「已签约」一行都有文案与动作映射；动作只指向 Bay / 项目群 / 设置；
// 没见过的事件退回服务端兜底；组件把内容当纯文字渲染；目录里没有 talent 站链接与 innerHTML。
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const lines = await import("../src/shell/bay/deal/deal-lines.ts");
const copy = await import("../src/i18n/ui/messages/bay-deal-copy.ts");
const i18n = await import("../src/i18n/config.ts");

const fakeTT = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

/** `app/notifications.py` 的 `TALENT_NOTIFICATION_EVENTS`（2026-10-06 读码，33 个）。 */
const BACKEND_EVENTS = [
  "order.new", "order.updated", "order.started", "delivery.submitted", "revision.requested",
  "acceptance.completed", "acceptance.auto", "order.cancelled", "dispute.opened", "dispute.withdrawn",
  "dispute.assessed", "dispute.responded", "dispute.escalated", "dispute.resolved", "proposal.new",
  "proposal.invited", "proposal.accepted", "proposal.rejected", "message.new", "quote.new",
  "quote.accepted", "review.visible", "review.reply", "level.changed", "handoff.invited",
  "handoff.claimed", "handoff.cancelled", "vetting.rejected", "vetting.credential_expired",
  "payment.failed", "payment.held", "payment.released", "payment.refunded",
];

test("事件清单：33 种交易事件一个不少，再加签约后的 contract.moved_to_project", () => {
  assert.equal(BACKEND_EVENTS.length, 33);
  assert.deepEqual([...lines.DEAL_EVENTS].sort(), [...BACKEND_EVENTS, "contract.moved_to_project"].sort());
});

test("每个事件都有文案与动作映射，文案互不相同", () => {
  const seen = new Map();
  for (const event of [...lines.DEAL_EVENTS, ...lines.OFFER_EVENTS]) {
    const text = lines.dealLineText(fakeTT, event);
    assert.ok(text && text.trim(), `${event} 没有文案`);
    assert.ok(!seen.has(text), `${event} 与 ${seen.get(text)} 文案重复`);
    seen.set(text, event);
    assert.ok(Object.prototype.hasOwnProperty.call(lines.DEAL_LINE_ACTIONS, event), `${event} 没有动作映射`);
    const kind = lines.DEAL_LINE_ACTIONS[event];
    if (kind) assert.ok(lines.dealActionLabel(fakeTT, kind), `${event} 的动作 ${kind} 没有按钮文字`);
  }
  assert.equal(lines.dealLineText(fakeTT, "contract.moved_to_project"), "已签约，之后在项目群里沟通。");
  assert.equal(lines.DEAL_LINE_ACTIONS["contract.moved_to_project"], "project");
  assert.equal(lines.dealLineText(fakeTT, "no.such.event"), null);
});

test("动作目标：订单 / 需求 / 求助在 Bay 打开，项目群在消息窗打开，资料与核验去设置", () => {
  const order = lines.resolveDealLine(fakeTT, { body: "x", meta: { event: "payment.held", contract_id: "c_1" } });
  assert.deepEqual(order.action, { kind: "order", label: "查看订单", target: { kind: "order", id: "c_1" } });

  const fallback = lines.resolveDealLine(fakeTT, { body: "x", meta: { event: "delivery.submitted" } }, "c_9");
  assert.deepEqual(fallback.action?.target, { kind: "order", id: "c_9" });

  const none = lines.resolveDealLine(fakeTT, { body: "x", meta: { event: "delivery.submitted" } });
  assert.equal(none.action, null, "没有合同 id 时不画动作");

  const demand = lines.resolveDealLine(fakeTT, { meta: { event: "proposal.new", demand_id: "d-1" } });
  assert.deepEqual(demand.action?.target, { kind: "demand", id: "d-1" });

  const help = lines.resolveDealLine(fakeTT, { meta: { event: "handoff.claimed", handoff_id: "h1" } });
  assert.deepEqual(help.action?.target, { kind: "help", id: "h1" });

  const project = lines.resolveDealLine(fakeTT, {
    meta: { event: "contract.moved_to_project", im_conversation_id: "6d1c0a8e-1111-2222-3333-444455556666" },
  });
  assert.equal(project.text, "已签约，之后在项目群里沟通。");
  assert.deepEqual(project.action, {
    kind: "project",
    label: "打开项目群",
    target: { kind: "project", conversationId: "6d1c0a8e-1111-2222-3333-444455556666" },
  });

  const loop = lines.resolveDealLine(fakeTT, { meta: { event: "contract.moved_to_project", im_conversation_id: "talent:t1" } });
  assert.equal(loop.action, null, "项目群 id 不能指回交易会话自己");

  const vetting = lines.resolveDealLine(fakeTT, { meta: { event: "vetting.rejected" } });
  assert.deepEqual(vetting.action?.target, { kind: "settings", pane: "vetting" });

  const quote = lines.resolveDealLine(fakeTT, { meta: { event: "quote.new" } });
  assert.equal(quote.action, null, "新报价卡就在会话里，不另给按钮");

  const bad = lines.resolveDealLine(fakeTT, { meta: { event: "payment.held", contract_id: "../../etc" } });
  assert.equal(bad.action, null, "id 不合规时不画动作");
});

test("没见过的事件退回服务端的中文兜底；报价旧事件也能翻译", () => {
  const unknown = lines.resolveDealLine(fakeTT, { body: "  服务端兜底一句  ", meta: { event: "brand.new.event" } });
  assert.equal(unknown.text, "服务端兜底一句");
  assert.equal(unknown.action, null);
  const legacy = lines.resolveDealLine(fakeTT, { body: "买家已接受报价，草稿订单已经生成", meta: { event: "accepted", offer_id: "o1" } }, "c_2");
  assert.equal(legacy.text, "买家接受了报价，订单已生成。");
  assert.deepEqual(legacy.action?.target, { kind: "order", id: "c_2" });
});

test("两套事件名逐个有文案和动作；同名按 meta 拆开；未知事件不崩、不出 talent 链接", () => {
  const seen = new Map();
  for (const event of [...lines.DEAL_EVENTS, ...lines.OFFER_EVENTS]) {
    const text = lines.dealLineText(fakeTT, event);
    assert.ok(text && text.trim(), `${event} 通知/报价名没有文案`);
    seen.set(text, event);
  }
  for (const item of lines.legacyDealLineCases()) {
    const classified = lines.classifyDealLine(item.event, item.meta);
    assert.equal(classified.family, item.family, `${item.event} ${JSON.stringify(item.meta)} 家族不对`);
    const resolved = lines.resolveDealLine(fakeTT, { body: "服务端兜底", meta: { event: item.event, ...item.meta } }, "c_fallback");
    assert.ok(resolved.text && resolved.text !== "服务端兜底", `${item.event} 没有自己的大白话`);
    assert.ok(!resolved.text.includes("talent.oceanleo.com"), `${item.event} 文案带了 talent 站`);
    assert.ok(!resolved.text.includes("在 talent 打开"), `${item.event} 文案带了「在 talent 打开」`);
    if (item.event !== "revoked") {
      assert.ok(!seen.has(resolved.text) || seen.get(resolved.text) === item.event, `${item.event} 与 ${seen.get(resolved.text)} 文案重复`);
      seen.set(resolved.text, item.event);
    }
    if (item.action) {
      assert.equal(resolved.action?.kind, item.action, `${item.event} 动作不对`);
      assert.ok(resolved.action?.label, `${item.event} 没有动作文字`);
      assert.ok(!String(resolved.action.label).includes("talent"), `${item.event} 动作指向 talent`);
    } else {
      assert.equal(resolved.action, null, `${item.event} 不该有动作`);
    }
  }

  const contractAccepted = lines.resolveDealLine(fakeTT, { meta: { event: "accepted", contract_id: "c9" } });
  assert.equal(contractAccepted.text, "合同已签署生效，双方进入交付阶段。");
  assert.deepEqual(contractAccepted.action?.target, { kind: "order", id: "c9" });

  const offerAccepted = lines.resolveDealLine(fakeTT, { meta: { event: "accepted", offer_id: "o9" } }, "c9");
  assert.equal(offerAccepted.text, "买家接受了报价，订单已生成。");

  const helpCancelled = lines.resolveDealLine(fakeTT, { meta: { event: "cancelled", handoff_id: "h9" } });
  assert.equal(helpCancelled.text, "发起人取消了这次求助，交接的内容已全部收回。");
  assert.deepEqual(helpCancelled.action?.target, { kind: "help", id: "h9" });

  const contractCancelled = lines.resolveDealLine(fakeTT, { meta: { event: "cancelled", contract_id: "c8" } });
  assert.equal(contractCancelled.text, "合同已取消。");

  const emptyUnknown = lines.resolveDealLine(fakeTT, { body: "   ", meta: { event: "milestone.foo" } });
  assert.equal(emptyUnknown.text, "交易有了新进展。");
  assert.equal(emptyUnknown.action, null);

  const talentBody = lines.resolveDealLine(fakeTT, {
    body: "去 https://talent.oceanleo.com/orders/1 在 talent 打开",
    meta: { event: "not.a.real.event" },
  });
  assert.equal(talentBody.text, "交易有了新进展。");
  assert.equal(talentBody.action, null);
});

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const actionCalls = [];
globalThis.__dealActionCalls = actionCalls;
const actionsStub = dataModule("export function runDealLineAction(t){ globalThis.__dealActionCalls.push(t); }");

const { DealSystemLine } = await import(
  await compileModule("src/shell/bay/deal/DealSystemLine.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "./deal-actions": actionsStub,
  })
);

test("灰字行组件：翻译后的文案 + 动作按钮；内容当纯文字", () => {
  const html = renderToStaticMarkup(
    React.createElement("ul", null,
      React.createElement(DealSystemLine, {
        message: { id: "m1", body: "兜底", meta: { event: "order.started", contract_id: "c1" } },
      }),
      React.createElement(DealSystemLine, {
        message: { id: "m2", body: "<img src=x onerror=alert(1)>", meta: { event: "unknown.x" } },
      }),
    ),
  );
  assert.match(html, /data-deal-event="order.started"/);
  assert.match(html, /合同已签署生效，可以开始交付。/);
  assert.match(html, /data-deal-action="order"[^>]*>查看订单</);
  assert.ok(!html.includes("<img"), "兜底正文必须当文字");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

const REPO = fileURLToPath(new URL("../", import.meta.url));

function filesUnder(rel) {
  const abs = path.join(REPO, rel);
  if (statSync(abs).isFile()) return [abs];
  const out = [];
  for (const name of readdirSync(abs)) out.push(...filesUnder(path.join(rel, name)));
  return out;
}

test("我的目录里没有 talent 站链接、「在 talent 打开」、innerHTML", () => {
  const files = [...filesUnder("src/shell/bay/deal"), path.join(REPO, "src/lib/bay/threads.ts")];
  assert.ok(files.length >= 4);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const rel = path.relative(REPO, file);
    assert.ok(!source.includes("talent.oceanleo.com"), `${rel} 出现 talent.oceanleo.com`);
    assert.ok(!source.includes("在 talent 打开"), `${rel} 出现「在 talent 打开」`);
    assert.ok(!/dangerouslySetInnerHTML|\.innerHTML\b|innerHTML\s*=/.test(source), `${rel} 出现 innerHTML`);
    assert.ok(!source.includes("talentThreadUrl"), `${rel} 引用了 talent 站会话地址`);
  }
});

const THREAD_ERRORS = [
  "缺少合同",
  "这笔订单还没有会话",
  "缺少求助",
  "这条求助还没有人接，暂时没有会话",
  "缺少会话主题",
  "缺少对方用户",
  "会话创建失败，请稍后重试",
];

test("每个事件和 openTradeThread 错误句子都有 17 种语言文案", () => {
  const locales = i18n.LOCALES;
  assert.equal(locales.length, 17);
  const zhTexts = new Set();
  for (const event of [...lines.DEAL_EVENTS, ...lines.OFFER_EVENTS]) {
    zhTexts.add(lines.dealLineText(fakeTT, event));
  }
  for (const item of lines.legacyDealLineCases()) {
    zhTexts.add(lines.dealLineText(fakeTT, item.event, item.meta));
  }
  zhTexts.add(lines.UNKNOWN_DEAL_LINE_TEXT);
  zhTexts.add("已签约，之后在项目群里沟通。");
  for (const text of THREAD_ERRORS) zhTexts.add(text);
  assert.ok(zhTexts.size >= 50, `事件文案太少：${zhTexts.size}`);
  for (const zh of zhTexts) {
    assert.ok(zh && zh.trim(), "空文案");
    const placeholders = zh.match(/\{\w+\}/g) || [];
    for (const locale of locales) {
      const translated = copy.BAY_DEAL_MESSAGES[locale][zh];
      assert.ok(translated && String(translated).trim(), `${locale} 缺「${zh}」`);
      for (const token of placeholders) {
        assert.ok(String(translated).includes(token), `${locale} 「${zh}」丢了 ${token}`);
      }
    }
  }
});
