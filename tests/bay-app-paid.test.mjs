// 安全矩阵：不适用（不渲染用户生成的富内容，不涉及跨域）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PRICE_NOT_NUMBER,
  PRICE_TOO_SMALL,
  REFUND_REASON_TOO_SHORT,
  canConfirm,
  canEscalate,
  canRequestRefund,
  currentPeriodPurchase,
  describePaidView,
  fenToPriceInput,
  needsRefundReason,
  offersMoneySettings,
  oneTimePurchases,
  parsePriceInput,
  parseTrialDays,
  pricingPayload,
  purchaseStage,
  refundReasonProblem,
  soldSummary,
  sortSoldPurchases,
} from "../src/shell/bay/apppaid/paid-model.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function source(relativePath) {
  return readFileSync(join(REPO, relativePath), "utf8");
}

function purchase(extra = {}) {
  return {
    id: "p1",
    buyer_id: "b1",
    seller_id: "s1",
    item_kind: "app",
    item_id: "a1",
    item_title: "App",
    contract_id: "c1",
    price_fen: 990,
    status: "active",
    opened_at: null,
    refund_reason: null,
    refund_requested_at: null,
    refund_due_at: null,
    refund_decided_at: null,
    refund_note: null,
    confirm_due_at: null,
    created_at: "2026-10-01T00:00:00.000Z",
    instant_refund: true,
    subscription_id: null,
    period_start: null,
    period_end: null,
    ...extra,
  };
}

function subscription(extra = {}) {
  return {
    id: "sub1",
    app_id: "a1",
    app_title: "App",
    buyer_id: "b1",
    seller_id: "s1",
    price_fen: 990,
    status: "active",
    current_period_end: "2026-11-01T00:00:00.000Z",
    cancelled_at: null,
    created_at: "2026-10-01T00:00:00.000Z",
    ...extra,
  };
}

function access(extra = {}) {
  return {
    price_model: "one_time",
    price_fen: 990,
    trial_days: 0,
    currency: "CNY",
    entitled: false,
    reason: null,
    purchase: null,
    subscription: null,
    trial: null,
    trial_available: false,
    ...extra,
  };
}

test("价格输入 ↔ 分：9.9 / 9.999 / abc / 0.5 / 负数", () => {
  assert.deepEqual(parsePriceInput("9.9"), { ok: true, fen: 990 });
  assert.deepEqual(parsePriceInput("9.90"), { ok: true, fen: 990 });
  assert.deepEqual(parsePriceInput("9.999"), { ok: true, fen: 1000 });
  assert.deepEqual(parsePriceInput("abc"), { ok: false, reason: "not_number" });
  assert.deepEqual(parsePriceInput("0.5"), { ok: false, reason: "too_small" });
  assert.deepEqual(parsePriceInput("-3"), { ok: false, reason: "not_number" });
  assert.deepEqual(parsePriceInput("-9.9"), { ok: false, reason: "not_number" });
  assert.equal(fenToPriceInput(990), "9.90");
  assert.equal(fenToPriceInput(0), "");
  assert.equal(priceInputErrorAlias("0.5"), PRICE_TOO_SMALL);
  assert.equal(priceInputErrorAlias("x"), PRICE_NOT_NUMBER);
});

function priceInputErrorAlias(text) {
  const parsed = parsePriceInput(text);
  if (parsed.ok) return null;
  return parsed.reason === "too_small" ? PRICE_TOO_SMALL : PRICE_NOT_NUMBER;
}

test("试用天数与定价 payload", () => {
  assert.deepEqual(parseTrialDays("0"), { ok: true, days: 0 });
  assert.deepEqual(parseTrialDays("30"), { ok: true, days: 30 });
  assert.deepEqual(parseTrialDays("31"), { ok: false });
  assert.deepEqual(parseTrialDays("1.5"), { ok: false });
  assert.equal(pricingPayload("free", "9.9", "7").ok, true);
  assert.deepEqual(pricingPayload("free", "9.9", "7").input, { price_model: "free", price_fen: 0, trial_days: 0 });
  const paid = pricingPayload("one_time", "9.9", "7");
  assert.equal(paid.ok, true);
  assert.deepEqual(paid.input, { price_model: "one_time", price_fen: 990, trial_days: 7 });
});

test("access → 显示哪种状态与哪些按钮", () => {
  const owner = describePaidView(access({ entitled: true, reason: "owner" }), true);
  assert.equal(owner.kind, "owner");
  assert.deepEqual(owner.buttons, {
    editPricing: true,
    buy: false,
    subscribe: false,
    trial: false,
    confirm: false,
    refund: false,
    escalate: false,
    cancelSub: false,
    resumeSub: false,
    checkPayment: false,
  });

  const needBuy = describePaidView(access({ price_model: "one_time", trial_available: false }), false);
  assert.equal(needBuy.kind, "need-pay");
  assert.equal(needBuy.buttons.buy, true);
  assert.equal(needBuy.buttons.trial, false);
  assert.equal(needBuy.buttons.subscribe, false);

  const needBuyTrial = describePaidView(access({ price_model: "one_time", trial_available: true, trial_days: 7 }), false);
  assert.equal(needBuyTrial.kind, "need-pay");
  assert.equal(needBuyTrial.buttons.buy, true);
  assert.equal(needBuyTrial.buttons.trial, true);

  const needSub = describePaidView(access({ price_model: "subscription", trial_available: true, trial_days: 3 }), false);
  assert.equal(needSub.kind, "need-pay");
  assert.equal(needSub.buttons.subscribe, true);
  assert.equal(needSub.buttons.trial, true);
  assert.equal(needSub.buttons.buy, false);

  const trialing = describePaidView(
    access({
      price_model: "one_time",
      entitled: true,
      reason: "trial",
      trial_available: false,
      trial: { app_id: "a1", started_at: "2026-10-01T00:00:00.000Z", ends_at: "2026-10-08T00:00:00.000Z", active: true },
    }),
    false,
  );
  assert.equal(trialing.kind, "trialing");
  assert.equal(trialing.buttons.buy, true);
  assert.equal(trialing.buttons.trial, false);

  const trialEnded = describePaidView(
    access({
      price_model: "subscription",
      entitled: false,
      trial_available: false,
      trial: { app_id: "a1", started_at: "2026-09-01T00:00:00.000Z", ends_at: "2026-09-08T00:00:00.000Z", active: false },
    }),
    false,
  );
  assert.equal(trialEnded.kind, "trial-ended");
  assert.equal(trialEnded.buttons.subscribe, true);
  assert.equal(trialEnded.buttons.trial, false);

  const held = describePaidView(
    access({
      entitled: true,
      reason: "purchase",
      purchase: purchase({ status: "active", instant_refund: true }),
    }),
    false,
  );
  assert.equal(held.kind, "owned-purchase");
  assert.equal(held.buttons.confirm, true);
  assert.equal(held.buttons.refund, true);
  assert.equal(held.buttons.escalate, false);

  const refundPending = describePaidView(
    access({
      entitled: true,
      reason: "purchase",
      purchase: purchase({ status: "refund_requested" }),
    }),
    false,
  );
  assert.equal(refundPending.kind, "owned-purchase");
  assert.equal(refundPending.buttons.refund, false);
  assert.equal(refundPending.buttons.confirm, false);

  const declined = describePaidView(
    access({
      entitled: true,
      reason: "purchase",
      purchase: purchase({ status: "refund_declined" }),
    }),
    false,
  );
  assert.equal(declined.kind, "owned-purchase");
  assert.equal(declined.buttons.escalate, true);
  assert.equal(declined.buttons.confirm, true);

  const completed = describePaidView(
    access({
      entitled: true,
      reason: "purchase",
      purchase: purchase({ status: "completed" }),
    }),
    false,
  );
  assert.equal(completed.kind, "owned-purchase");
  assert.equal(completed.buttons.confirm, false);
  assert.equal(completed.buttons.refund, false);

  const refunded = describePaidView(
    access({
      entitled: false,
      reason: null,
      purchase: purchase({ status: "refunded" }),
    }),
    false,
  );
  assert.equal(refunded.kind, "need-pay");
  assert.equal(refunded.buttons.buy, true);

  const subscribed = describePaidView(
    access({
      price_model: "subscription",
      entitled: true,
      reason: "subscription",
      subscription: subscription({ status: "active" }),
      purchase: purchase({ status: "active", item_kind: "app_sub", subscription_id: "sub1" }),
    }),
    false,
  );
  assert.equal(subscribed.kind, "subscribed");
  assert.equal(subscribed.buttons.cancelSub, true);
  assert.equal(subscribed.buttons.refund, true);

  const pastDue = describePaidView(
    access({
      price_model: "subscription",
      entitled: true,
      reason: "subscription",
      subscription: subscription({ status: "past_due" }),
    }),
    false,
  );
  assert.equal(pastDue.kind, "past-due");
  assert.equal(pastDue.buttons.checkPayment, true);
  assert.equal(pastDue.buttons.cancelSub, false);

  const cancelled = describePaidView(
    access({
      price_model: "subscription",
      entitled: true,
      reason: "subscription",
      subscription: subscription({ status: "cancelled" }),
      purchase: purchase({ status: "active", item_kind: "app_sub", subscription_id: "sub1" }),
    }),
    false,
  );
  assert.equal(cancelled.kind, "cancelled-sub");
  assert.equal(cancelled.buttons.resumeSub, true);
  assert.equal(cancelled.buttons.refund, true);
});

test("退款表单是否要求理由", () => {
  assert.equal(needsRefundReason(null), false);
  assert.equal(needsRefundReason(purchase({ instant_refund: true })), false);
  assert.equal(needsRefundReason(purchase({ instant_refund: false })), true);
  assert.equal(refundReasonProblem("", purchase({ instant_refund: true })), null);
  assert.equal(refundReasonProblem("abc", purchase({ instant_refund: false })), REFUND_REASON_TOO_SHORT);
  assert.equal(refundReasonProblem("四个字够", purchase({ instant_refund: false })), null);
  assert.equal(canConfirm(purchase({ status: "active", contract_id: "c1" })), true);
  assert.equal(canRequestRefund(purchase({ status: "active", contract_id: "c1" })), true);
  assert.equal(canEscalate(purchase({ status: "refund_declined" })), true);
  assert.equal(purchaseStage(purchase({ status: "active" })), "held");
});

test("卖出列表待处理退款排最前", () => {
  const rows = sortSoldPurchases([
    purchase({ id: "old", status: "completed", created_at: "2026-10-08T00:00:00.000Z" }),
    purchase({ id: "hot", status: "refund_requested", created_at: "2026-10-02T00:00:00.000Z" }),
    purchase({ id: "newer", status: "active", created_at: "2026-10-09T00:00:00.000Z" }),
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["hot", "newer", "old"],
  );
  assert.deepEqual(soldSummary([{ status: "active" }, { status: "completed" }], [{ status: "active" }, { status: "cancelled" }, { status: "past_due" }]), {
    activeSubs: 2,
    heldCount: 1,
  });
  assert.equal(currentPeriodPurchase([purchase({ id: "a", subscription_id: "sub1", created_at: "2026-10-01T00:00:00.000Z" }), purchase({ id: "b", subscription_id: "sub1", created_at: "2026-10-08T00:00:00.000Z" })], "sub1")?.id, "b");
  assert.deepEqual(oneTimePurchases([purchase({ item_kind: "app" }), purchase({ item_kind: "app_sub" })]).map((row) => row.item_kind), ["app"]);
  assert.equal(offersMoneySettings("付款暂未开放"), true);
  assert.equal(offersMoneySettings("先开通收款"), true);
  assert.equal(offersMoneySettings("网络不好"), false);
});

test("组件 data-bay 标记与客户端函数", () => {
  const bar = source("src/shell/bay/apppaid/AppPurchaseBar.tsx");
  const pricing = source("src/shell/bay/apppaid/PricingManagePanel.tsx");
  const bought = source("src/shell/bay/apppaid/MyBoughtAppsPane.tsx");
  const sold = source("src/shell/bay/apppaid/MySoldAppsPane.tsx");
  const status = source("src/shell/bay/apppaid/AppPurchaseStatus.tsx");
  const all = [bar, pricing, bought, sold, status].join("\n");

  assert.match(bar, /data-bay-app-purchase/);
  assert.match(bar, /data-bay-action="buy"/);
  assert.match(bar, /data-bay-action="subscribe"/);
  assert.match(bar, /data-bay-action="trial"/);
  assert.match(bar, /data-bay-action="edit-pricing"/);
  assert.match(bar, /data-bay-confirm="buy"/);
  assert.match(bar, /data-bay-confirm="subscribe"/);
  assert.match(pricing, /data-bay-price-model/);
  assert.match(pricing, /saveBayAppPricing/);
  assert.match(pricing, /getBayApp/);
  assert.match(bought, /listBoughtBayApps/);
  assert.match(bought, /data-bay-pane="mine-bought-apps"/);
  assert.match(sold, /listSoldBayApps/);
  assert.match(sold, /decideBayLessonRefund/);
  assert.match(sold, /data-bay-pane="mine-sold-apps"/);
  assert.match(status, /confirmBayLessonOrder/);
  assert.match(status, /requestBayLessonRefund/);
  assert.match(status, /escalateBayLessonRefund/);
  assert.doesNotMatch(all, /fetch\(/);
  assert.doesNotMatch(all, /\/v1\//);
  assert.doesNotMatch(all, /<iframe/);
  assert.doesNotMatch(all, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(all, /innerHTML\s*=/);
});

test("AppPurchaseBar 每个成功分支都调用 onAccess", () => {
  const bar = source("src/shell/bay/apppaid/AppPurchaseBar.tsx");
  assert.match(bar, /getBayAppAccess/);
  assert.match(bar, /onAccess\(next\)/);
  assert.match(bar, /onAccess\(null\)/);
  assert.match(bar, /buyBayApp/);
  assert.match(bar, /subscribeBayApp/);
  assert.match(bar, /startBayAppTrial/);
  assert.match(bar, /applyAccess\(body\.access\)/);
  assert.match(bar, /cancelBayAppSubscription/);
  assert.match(bar, /resumeBayAppSubscription/);
  assert.match(bar, /refreshAccess/);
  const applyCount = bar.split("applyAccess(").length - 1;
  assert.ok(applyCount >= 3, `applyAccess 出现 ${applyCount} 次，买/订/试用/读取都应走到`);
});
