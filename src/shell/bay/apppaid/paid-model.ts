// 作品收费：价格换算、权益 → 该显示哪一块、退款是否要理由、卖出列表排序。不碰 window。

import type { BayAppAccess, BayAppPriceModel, BayAppPricingInput, BayAppPurchase, BayAppSubscription } from "../../../lib/bay/app-paid";

export type PriceParseReason = "not_number" | "too_small";

export type PriceParse = { ok: true; fen: number } | { ok: false; reason: PriceParseReason };

export type PurchaseStage = "none" | "held" | "refund-pending" | "refund-declined" | "disputed" | "completed" | "refunded";

export type PaidKind =
  | "owner"
  | "need-pay"
  | "trialing"
  | "trial-ended"
  | "owned-purchase"
  | "subscribed"
  | "past-due"
  | "cancelled-sub";

export type PaidButtons = {
  editPricing: boolean;
  buy: boolean;
  subscribe: boolean;
  trial: boolean;
  confirm: boolean;
  refund: boolean;
  escalate: boolean;
  cancelSub: boolean;
  resumeSub: boolean;
  checkPayment: boolean;
};

export const REFUND_REASON_TOO_SHORT = "请写明退款原因（至少 4 个字）";
export const PRICE_NOT_NUMBER = "请输入有效的价格";
export const PRICE_TOO_SMALL = "价格至少是 1.00";
export const TRIAL_DAYS_INVALID = "试用天数须是 0 到 30 的整数";

const EMPTY_BUTTONS: PaidButtons = {
  editPricing: false,
  buy: false,
  subscribe: false,
  trial: false,
  confirm: false,
  refund: false,
  escalate: false,
  cancelSub: false,
  resumeSub: false,
  checkPayment: false,
};

type PurchaseLike = Pick<BayAppPurchase, "status" | "contract_id" | "instant_refund" | "confirm_due_at" | "refund_due_at" | "created_at" | "subscription_id">;

/** 主单位输入 → 分。9.9 → 990；9.999 四舍五入到分；小于 1.00 或不是数字分开报。 */
export function parsePriceInput(text: string): PriceParse {
  const raw = String(text ?? "").trim();
  if (!raw || raw.includes("-") || /[^\d.,，\s]/.test(raw)) return { ok: false, reason: "not_number" };
  const value = Number(raw.replace(/[,，\s]/g, ""));
  if (!Number.isFinite(value)) return { ok: false, reason: "not_number" };
  const fen = Math.round(value * 100);
  if (fen < 100) return { ok: false, reason: "too_small" };
  return { ok: true, fen };
}

export function fenToPriceInput(fen: number): string {
  if (!Number.isFinite(fen) || fen <= 0) return "";
  return (fen / 100).toFixed(2);
}

export function parseTrialDays(text: string): { ok: true; days: number } | { ok: false } {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: true, days: 0 };
  if (!/^\d+$/.test(raw)) return { ok: false };
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 0 || days > 30) return { ok: false };
  return { ok: true, days };
}

export function priceInputError(text: string): string | null {
  const parsed = parsePriceInput(text);
  if (parsed.ok) return null;
  return parsed.reason === "too_small" ? PRICE_TOO_SMALL : PRICE_NOT_NUMBER;
}

export function pricingPayload(model: BayAppPriceModel, priceText: string, trialText: string): { ok: true; input: BayAppPricingInput } | { ok: false; priceError: string | null; trialError: string | null } {
  if (model === "free") {
    return { ok: true, input: { price_model: "free", price_fen: 0, trial_days: 0 } };
  }
  const price = parsePriceInput(priceText);
  const trial = parseTrialDays(trialText);
  if (!price.ok || !trial.ok) {
    return {
      ok: false,
      priceError: price.ok ? null : price.reason === "too_small" ? PRICE_TOO_SMALL : PRICE_NOT_NUMBER,
      trialError: trial.ok ? null : TRIAL_DAYS_INVALID,
    };
  }
  return { ok: true, input: { price_model: model, price_fen: price.fen, trial_days: trial.days } };
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

export function refundHoursLeft(dueAt: string | null | undefined, nowMs = Date.now()): number {
  if (!dueAt) return 0;
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return 0;
  return Math.max(0, Math.ceil((due - nowMs) / 3_600_000));
}

export function purchaseStage(p: PurchaseLike | null | undefined): PurchaseStage {
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

export function canConfirm(p: PurchaseLike | null | undefined): boolean {
  return Boolean(p && (p.status === "active" || p.status === "refund_declined") && p.contract_id);
}

export function canRequestRefund(p: PurchaseLike | null | undefined): boolean {
  return Boolean(p && p.status === "active" && p.contract_id);
}

export function needsRefundReason(p: PurchaseLike | null | undefined): boolean {
  return Boolean(p && !p.instant_refund);
}

export function canEscalate(p: PurchaseLike | null | undefined): boolean {
  return Boolean(p && p.status === "refund_declined");
}

export function refundReasonProblem(reason: string, p: PurchaseLike | null | undefined): string | null {
  if (!needsRefundReason(p)) return null;
  return reason.trim().length < 4 ? REFUND_REASON_TOO_SHORT : null;
}

function payButtons(access: BayAppAccess, extra: Partial<PaidButtons> = {}): PaidButtons {
  return {
    ...EMPTY_BUTTONS,
    buy: access.price_model === "one_time",
    subscribe: access.price_model === "subscription",
    trial: access.trial_available,
    ...extra,
  };
}

function purchaseButtons(purchase: PurchaseLike | null | undefined): Pick<PaidButtons, "confirm" | "refund" | "escalate"> {
  return {
    confirm: canConfirm(purchase),
    refund: canRequestRefund(purchase),
    escalate: canEscalate(purchase),
  };
}

/** access + 是不是作者 → 作品页收费条该处在哪一种情形、露出哪些按钮。 */
export function describePaidView(access: BayAppAccess, isOwner: boolean): { kind: PaidKind; buttons: PaidButtons } {
  if (isOwner) {
    return { kind: "owner", buttons: { ...EMPTY_BUTTONS, editPricing: true } };
  }

  const sub = access.subscription;
  if (sub && (sub.status === "active" || sub.status === "past_due" || sub.status === "cancelled")) {
    const kind: PaidKind = sub.status === "active" ? "subscribed" : sub.status === "past_due" ? "past-due" : "cancelled-sub";
    return {
      kind,
      buttons: {
        ...EMPTY_BUTTONS,
        ...purchaseButtons(access.purchase),
        cancelSub: sub.status === "active",
        resumeSub: sub.status === "cancelled",
        checkPayment: sub.status === "past_due",
      },
    };
  }

  if (access.reason === "purchase" || (access.purchase && (access.entitled || purchaseStage(access.purchase) !== "refunded"))) {
    if (access.purchase && purchaseStage(access.purchase) === "refunded" && !access.entitled) {
      /* 已退完：回到要买的状态 */
    } else if (access.purchase) {
      return { kind: "owned-purchase", buttons: { ...EMPTY_BUTTONS, ...purchaseButtons(access.purchase) } };
    }
  }

  if (access.reason === "trial" || access.trial?.active) {
    return { kind: "trialing", buttons: payButtons(access, { trial: false }) };
  }

  if (access.trial && !access.trial.active && !access.entitled) {
    return { kind: "trial-ended", buttons: payButtons(access, { trial: false }) };
  }

  return { kind: "need-pay", buttons: payButtons(access) };
}

export function sortSoldPurchases<T extends Pick<BayAppPurchase, "status" | "created_at">>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const aHot = a.status === "refund_requested" ? 0 : 1;
    const bHot = b.status === "refund_requested" ? 0 : 1;
    if (aHot !== bHot) return aHot - bHot;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

export function soldSummary(purchases: Pick<BayAppPurchase, "status">[], subscriptions: Pick<BayAppSubscription, "status">[]): { activeSubs: number; heldCount: number } {
  return {
    activeSubs: subscriptions.filter((row) => row.status === "active" || row.status === "past_due").length,
    heldCount: purchases.filter((row) => row.status === "active").length,
  };
}

export function currentPeriodPurchase(purchases: BayAppPurchase[], subscriptionId: string): BayAppPurchase | null {
  const rows = purchases.filter((row) => row.subscription_id === subscriptionId);
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] ?? null;
}

export function offersMoneySettings(message: string): boolean {
  return /付款|收款|绑卡|支付/.test(String(message || ""));
}

export function formatPaidDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

export function formatPaidDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(0, 16).replace("T", " ");
  }
}

export function oneTimePurchases(purchases: BayAppPurchase[]): BayAppPurchase[] {
  return purchases.filter((row) => row.item_kind === "app");
}

export function subStatusLabelKey(status: BayAppSubscription["status"]): string {
  if (status === "past_due") return "续费失败";
  if (status === "cancelled") return "已取消";
  if (status === "expired") return "已失效";
  return "订阅中";
}

export function purchaseStatusLabelKey(stage: PurchaseStage): string {
  if (stage === "held") return "托管中";
  if (stage === "refund-pending") return "待处理退款";
  if (stage === "refund-declined") return "已拒绝退款";
  if (stage === "disputed") return "平台介入中";
  if (stage === "completed") return "已确认";
  if (stage === "refunded") return "已退款";
  return "";
}
