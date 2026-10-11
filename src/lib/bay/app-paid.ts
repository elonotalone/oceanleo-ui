// LeoBay 作品收费的接口客户端：买断、按月订阅、免费试用。
// 买断与订阅的每一期都是一笔 `BayLessonPurchase`（`item_kind` 是 "app" 或 "app_sub"），
// 确认 / 申请退款 / 卖家处理 / 请平台介入 直接用 `./lessons` 里现成的
// `confirmBayLessonOrder` / `requestBayLessonRefund` / `decideBayLessonRefund` / `escalateBayLessonRefund`。
// 网关路由 `/v1/bay/app-paid*`。字段名与网关出参逐字一致，本文件是合同。

import { bayGet, bayPost } from "./http";
import type { BayApp, BayAppMine } from "./apps";
import type { BayLessonPurchaseStatus } from "./lessons";

export type BayAppPriceModel = "free" | "one_time" | "subscription";

/** 作品的一笔购买（买断），或订阅的一期。字段与课程的购买行相同，多出订阅的三项。 */
export interface BayAppPurchase {
  id: string;
  buyer_id: string;
  seller_id: string;
  item_kind: "app" | "app_sub";
  /** 作品 id。 */
  item_id: string;
  item_title: string;
  contract_id: string | null;
  price_fen: number;
  status: BayLessonPurchaseStatus;
  opened_at: string | null;
  refund_reason: string | null;
  refund_requested_at: string | null;
  refund_due_at: string | null;
  refund_decided_at: string | null;
  refund_note: string | null;
  confirm_due_at: string | null;
  created_at: string | null;
  /** 付款后还没打开过作品：可以不说理由直接退。 */
  instant_refund: boolean;
  subscription_id: string | null;
  period_start: string | null;
  period_end: string | null;
}

/** active 已付到 current_period_end / past_due 续费扣款失败、重试中、仍可用 / cancelled 已取消、用到期末 / expired 已失效。 */
export type BayAppSubscriptionStatus = "active" | "past_due" | "cancelled" | "expired";

export interface BayAppSubscription {
  id: string;
  app_id: string;
  app_title: string;
  buyer_id: string;
  seller_id: string;
  price_fen: number;
  status: BayAppSubscriptionStatus;
  current_period_end: string | null;
  cancelled_at: string | null;
  created_at: string | null;
}

export interface BayAppTrial {
  app_id: string;
  started_at: string | null;
  ends_at: string | null;
  /** 试用还没到期。 */
  active: boolean;
}

/** 这个人现在能不能用这个作品，以及为什么。不登录时 `entitled` 只在免费作品上是 true。 */
export interface BayAppAccess {
  price_model: BayAppPriceModel;
  price_fen: number;
  trial_days: number;
  currency: string;
  entitled: boolean;
  /** free 免费作品 / owner 自己的作品 / purchase 买断 / subscription 订阅中 / trial 试用中；不能用时是 null。 */
  reason: "free" | "owner" | "purchase" | "subscription" | "trial" | null;
  purchase: BayAppPurchase | null;
  subscription: BayAppSubscription | null;
  trial: BayAppTrial | null;
  /** 作品设了试用天数，且这个人还没试用过。 */
  trial_available: boolean;
}

export interface BayAppPricingInput {
  price_model: BayAppPriceModel;
  /** 买断价或月价，单位是分；免费时必须是 0。 */
  price_fen: number;
  /** 0–30；0 = 不提供试用。免费作品必须是 0。 */
  trial_days: number;
}

const P = "/v1/bay/app-paid";
const enc = encodeURIComponent;

/** 作者：设定收费方式。收费作品要求作者已经能收款，否则网关回 409 和一句说明。 */
export function saveBayAppPricing(appId: string, input: BayAppPricingInput): Promise<{ app: BayAppMine }> {
  return bayPost(`${P}/apps/${enc(appId)}/pricing`, input);
}
export function getBayAppAccess(appId: string, signal?: AbortSignal): Promise<BayAppAccess> {
  return bayGet(`${P}/apps/${enc(appId)}/access`, { anonymous: true, signal });
}
/** 买断：从账单里绑的卡扣款，立刻可用，款项托管 7 天。 */
export function buyBayApp(appId: string): Promise<{ purchase: BayAppPurchase; access: BayAppAccess }> {
  return bayPost(`${P}/apps/${enc(appId)}/buy`);
}
/** 订阅：立刻扣第一个月，之后每月到期自动续。 */
export function subscribeBayApp(appId: string): Promise<{ subscription: BayAppSubscription; purchase: BayAppPurchase; access: BayAppAccess }> {
  return bayPost(`${P}/apps/${enc(appId)}/subscribe`);
}
/** 开始免费试用：不扣款，不需要绑卡；到期后要用就得买。每人每个作品一次。 */
export function startBayAppTrial(appId: string): Promise<{ trial: BayAppTrial; access: BayAppAccess }> {
  return bayPost(`${P}/apps/${enc(appId)}/trial`);
}
/** 取消订阅：不再续费，已付的这一期用到期末。 */
export function cancelBayAppSubscription(subscriptionId: string): Promise<{ subscription: BayAppSubscription }> {
  return bayPost(`${P}/subscriptions/${enc(subscriptionId)}/cancel`);
}
/** 到期之前反悔：恢复自动续费。 */
export function resumeBayAppSubscription(subscriptionId: string): Promise<{ subscription: BayAppSubscription }> {
  return bayPost(`${P}/subscriptions/${enc(subscriptionId)}/resume`);
}
/** 有权益的人第一次打开作品时记一次（决定之后能不能不说理由直接退）。失败不打扰用户。 */
export async function markBayAppOpened(appId: string): Promise<void> {
  try {
    await bayPost(`${P}/apps/${enc(appId)}/opened`);
  } catch {
    /* 记不上只影响「秒退」资格，不影响使用 */
  }
}
/** 我买到的作品：买断、订阅、试用。 */
export function listBoughtBayApps(): Promise<{ purchases: BayAppPurchase[]; subscriptions: BayAppSubscription[]; trials: (BayAppTrial & { app_title: string })[]; apps: BayApp[] }> {
  return bayGet(`${P}/mine/bought`);
}
/** 作者：我的作品卖出的每一笔与订阅的人。 */
export function listSoldBayApps(): Promise<{ purchases: BayAppPurchase[]; subscriptions: BayAppSubscription[] }> {
  return bayGet(`${P}/mine/sold`);
}
