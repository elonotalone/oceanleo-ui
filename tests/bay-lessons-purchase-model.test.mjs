// V2：课程购买状态与大纲进度纯函数。
import assert from "node:assert/strict";
import test from "node:test";

import {
  REFUND_REASON_TOO_SHORT,
  canConfirm,
  canEscalate,
  canRequestRefund,
  chapterAccess,
  daysLeft,
  hoursLeft,
  needsRefundReason,
  nextChapterId,
  purchaseStage,
  refundReasonProblem,
} from "../src/shell/bay/lessons/purchase-model.ts";

function purchase(extra = {}) {
  return {
    id: "p1",
    buyer_id: "b1",
    seller_id: "s1",
    item_kind: "lesson",
    item_id: "l1",
    item_title: "Course",
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
    created_at: null,
    instant_refund: true,
    ...extra,
  };
}

function chapter(id, position, extra = {}) {
  return {
    id,
    lesson_id: "l1",
    position,
    title: id,
    work_site_key: "video",
    work_title: id,
    free_preview: false,
    ...extra,
  };
}

test("purchaseStage 覆盖六种购买状态与空购买", () => {
  assert.equal(purchaseStage(null), "none");
  assert.equal(purchaseStage(purchase({ status: "active" })), "held");
  assert.equal(purchaseStage(purchase({ status: "refund_requested" })), "refund-pending");
  assert.equal(purchaseStage(purchase({ status: "refund_declined" })), "refund-declined");
  assert.equal(purchaseStage(purchase({ status: "disputed" })), "disputed");
  assert.equal(purchaseStage(purchase({ status: "completed" })), "completed");
  assert.equal(purchaseStage(purchase({ status: "refunded" })), "refunded");
});

test("canConfirm 只要 active 或 refund_declined 且有 contract_id", () => {
  assert.equal(canConfirm(null), false);
  assert.equal(canConfirm(purchase({ status: "active", contract_id: "c1" })), true);
  assert.equal(canConfirm(purchase({ status: "refund_declined", contract_id: "c1" })), true);
  assert.equal(canConfirm(purchase({ status: "active", contract_id: null })), false);
  assert.equal(canConfirm(purchase({ status: "refund_declined", contract_id: "" })), false);
  assert.equal(canConfirm(purchase({ status: "completed", contract_id: "c1" })), false);
  assert.equal(canConfirm(purchase({ status: "refund_requested", contract_id: "c1" })), false);
});

test("canRequestRefund 只要 active 且有 contract_id", () => {
  assert.equal(canRequestRefund(null), false);
  assert.equal(canRequestRefund(purchase({ status: "active", contract_id: "c1" })), true);
  assert.equal(canRequestRefund(purchase({ status: "active", contract_id: null })), false);
  assert.equal(canRequestRefund(purchase({ status: "refund_declined", contract_id: "c1" })), false);
  assert.equal(canRequestRefund(purchase({ status: "completed", contract_id: "c1" })), false);
});

test("needsRefundReason 看 instant_refund", () => {
  assert.equal(needsRefundReason(null), false);
  assert.equal(needsRefundReason(purchase({ instant_refund: true })), false);
  assert.equal(needsRefundReason(purchase({ instant_refund: false })), true);
});

test("canEscalate 只要卖家已拒绝", () => {
  assert.equal(canEscalate(null), false);
  assert.equal(canEscalate(purchase({ status: "refund_declined" })), true);
  assert.equal(canEscalate(purchase({ status: "active" })), false);
  assert.equal(canEscalate(purchase({ status: "disputed" })), false);
});

test("refundReasonProblem 需要理由且不足 4 个字才给中文原文", () => {
  const instant = purchase({ instant_refund: true });
  const opened = purchase({ instant_refund: false });
  assert.equal(refundReasonProblem("", null), null);
  assert.equal(refundReasonProblem("", instant), null);
  assert.equal(refundReasonProblem("abc", instant), null);
  assert.equal(refundReasonProblem("abc", opened), REFUND_REASON_TOO_SHORT);
  assert.equal(refundReasonProblem("  三字  ", opened), REFUND_REASON_TOO_SHORT);
  assert.equal(refundReasonProblem("四个字够", opened), null);
  assert.equal(REFUND_REASON_TOO_SHORT, "请写明退款原因（至少 4 个字）");
});

test("daysLeft / hoursLeft 向上取整、过期为 0、空为 null", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");
  assert.equal(daysLeft(null, now), null);
  assert.equal(hoursLeft(null, now), null);
  assert.equal(daysLeft("", now), null);
  assert.equal(hoursLeft("not-a-date", now), null);
  assert.equal(daysLeft("2026-10-10T12:00:00.000Z", now), 0);
  assert.equal(hoursLeft("2026-10-11T11:00:00.000Z", now), 0);
  assert.equal(hoursLeft("2026-10-11T13:00:00.000Z", now), 1);
  assert.equal(hoursLeft("2026-10-11T13:00:01.000Z", now), 2);
  assert.equal(daysLeft("2026-10-12T12:00:00.000Z", now), 1);
  assert.equal(daysLeft("2026-10-12T12:00:01.000Z", now), 2);
});

test("nextChapterId 第一节没学完、都学完回第一节、没有章节回 null", () => {
  const chapters = [chapter("c1", 1), chapter("c2", 2), chapter("c3", 0)];
  assert.equal(nextChapterId([], []), null);
  assert.equal(nextChapterId(chapters, []), "c3");
  assert.equal(nextChapterId(chapters, ["c3"]), "c1");
  assert.equal(nextChapterId(chapters, ["c3", "c1", "c2"]), "c3");
});

test("chapterAccess：已拥有或试看可开，否则上锁", () => {
  assert.equal(chapterAccess({ free_preview: false }, true), "open");
  assert.equal(chapterAccess({ free_preview: true }, false), "open");
  assert.equal(chapterAccess({ free_preview: false }, false), "locked");
});
