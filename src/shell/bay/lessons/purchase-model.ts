// 课程购买状态与大纲进度的纯函数。不碰 window；测试直接 import。

import type { BayLessonChapter, BayLessonPurchase } from "../../../lib/bay/lessons";

export type PurchaseStage =
  | "none"
  | "held"
  | "refund-pending"
  | "refund-declined"
  | "disputed"
  | "completed"
  | "refunded";

export const REFUND_REASON_TOO_SHORT = "请写明退款原因（至少 4 个字）";

export function purchaseStage(p: BayLessonPurchase | null): PurchaseStage {
  if (!p) return "none";
  switch (p.status) {
    case "active":
      return "held";
    case "refund_requested":
      return "refund-pending";
    case "refund_declined":
      return "refund-declined";
    case "disputed":
      return "disputed";
    case "completed":
      return "completed";
    case "refunded":
      return "refunded";
    default:
      return "none";
  }
}

function remainingUnits(iso: string | null, now: Date, unitMs: number): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const ms = at - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / unitMs);
}

export function daysLeft(iso: string | null, now: Date): number | null {
  return remainingUnits(iso, now, 24 * 60 * 60 * 1000);
}

export function hoursLeft(iso: string | null, now: Date): number | null {
  return remainingUnits(iso, now, 60 * 60 * 1000);
}

export function canConfirm(p: BayLessonPurchase | null): boolean {
  return Boolean(p && (p.status === "active" || p.status === "refund_declined") && p.contract_id);
}

export function canRequestRefund(p: BayLessonPurchase | null): boolean {
  return Boolean(p && p.status === "active" && p.contract_id);
}

export function needsRefundReason(p: BayLessonPurchase | null): boolean {
  return Boolean(p && !p.instant_refund);
}

export function canEscalate(p: BayLessonPurchase | null): boolean {
  return Boolean(p && p.status === "refund_declined");
}

export function refundReasonProblem(reason: string, p: BayLessonPurchase | null): string | null {
  if (!needsRefundReason(p)) return null;
  return reason.trim().length < 4 ? REFUND_REASON_TOO_SHORT : null;
}

export function nextChapterId(chapters: BayLessonChapter[], doneIds: string[]): string | null {
  if (!chapters.length) return null;
  const done = new Set(doneIds);
  const ordered = [...chapters].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return ordered.find((chapter) => !done.has(chapter.id))?.id ?? ordered[0].id;
}

export function chapterAccess(chapter: Pick<BayLessonChapter, "free_preview">, owned: boolean): "open" | "locked" {
  return owned || chapter.free_preview ? "open" : "locked";
}
