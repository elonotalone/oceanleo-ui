// Bay 的服务取数与计算（移植自 talent `lib/talent/directory.ts` 的服务段与服务详情页的逻辑）。
// 详情不登录也能看；举报要登录。金额一律是「分」，只在渲染时换算。

import { bayGet, bayPost } from "./http";
import type { BayPublicProfile, BayReview } from "./directory";
import type { BayListingKind, BayLicense, BayServiceMediaRow } from "./seller";
import type { BayWorkRef } from "./types";

export type BayAttachedWork = BayWorkRef;

export type BayServiceTierName = "basic" | "standard" | "premium";
export type BayPriceUnit = "project" | "session" | "hour" | "day" | "month";
export type BayRequiredFieldValue = string | number | boolean | string[];

export const BAY_TIER_ORDER: BayServiceTierName[] = ["basic", "standard", "premium"];

export interface BayServiceTier {
  id: string;
  service_id: string;
  tier: BayServiceTierName;
  title: string;
  description: string;
  price_fen: number;
  delivery_days: number | null;
  revisions: number;
  features: string[];
  enabled: boolean;
  currency?: string;
}

export interface BayServiceAddon {
  id: string;
  service_id: string;
  title: string;
  description: string;
  price_fen: number;
  extra_days: number;
  position?: number;
  enabled: boolean;
}

export interface BayServiceFaq {
  id: string;
  question: string;
  answer: string;
  position?: number;
}

export interface BayServiceMedia {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  url: string;
  poster_url: string | null;
  caption: string;
  position?: number;
}

export interface BayService {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  description?: string;
  category: string;
  cover_url: string | null;
  engagement_kind: string;
  required_fields?: Record<string, BayRequiredFieldValue>;
  delivery_mode?: "on_platform" | "off_platform";
  price_fen: number;
  price_unit: BayPriceUnit;
  delivery_days: number | null;
  status: "draft" | "published" | "paused";
  view_count?: number;
  order_count?: number;
  min_price_fen?: number;
  tier_count?: number;
  tags?: string[];
  catalog_kind?: "delivery" | "consult" | null;
  regulated_domain?: string | null;
  currency?: string;
  created_at?: string;
  updated_at?: string;
  seller?: BayPublicProfile | null;
  listing_kind?: BayListingKind;
  license?: BayLicense | null;
  has_digital_work?: boolean;
  official?: boolean;
}

export interface BayServiceDetail extends BayService {
  tiers: BayServiceTier[];
  addons: BayServiceAddon[];
  faq: BayServiceFaq[];
  media: BayServiceMedia[];
  reviews: BayReview[];
  review_summary?: { rating_avg: number | null; rating_count: number };
}

export function getBayService(serviceId: string): Promise<{ service: BayServiceDetail }> {
  return bayGet<{ service: BayServiceDetail }>(`/v1/talent/services/${encodeURIComponent(serviceId)}`, { anonymous: true });
}

export function claimBayService(serviceId: string): Promise<{ work: BayAttachedWork | null; media: BayServiceMediaRow[] }> {
  return bayPost<{ work: BayAttachedWork | null; media: BayServiceMediaRow[] }>(
    `/v1/talent/services/${encodeURIComponent(serviceId)}/claim`,
  );
}

const CURRENCY_SYMBOL: Record<string, string> = { CNY: "¥", RMB: "¥", USD: "$", EUR: "€", GBP: "£", JPY: "¥", HKD: "HK$" };

/** 金额（分）→ 「¥1,280」「$12.50」；认不出的币种写成「12.50 XYZ」。 */
export function formatBayMoney(fen: number, currency?: string | null): string {
  const code = String(currency || "CNY").toUpperCase();
  const value = (Number.isFinite(fen) ? fen : 0) / 100;
  const number = Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbol = CURRENCY_SYMBOL[code];
  return symbol ? `${symbol}${number}` : `${number} ${code}`;
}

export function enabledTiers(service: Pick<BayServiceDetail, "tiers"> | null | undefined): BayServiceTier[] {
  const rank = (tier: BayServiceTier) => BAY_TIER_ORDER.indexOf(tier.tier);
  return (service?.tiers || []).filter((tier) => tier.enabled).sort((a, b) => rank(a) - rank(b));
}

export function enabledAddons(service: Pick<BayServiceDetail, "addons"> | null | undefined): BayServiceAddon[] {
  return (service?.addons || []).filter((addon) => addon.enabled);
}

/** 打开服务时默认选中的档位：最便宜的那一档（与 talent 一致）。 */
export function defaultTier(service: Pick<BayServiceDetail, "tiers"> | null | undefined): BayServiceTier | undefined {
  return [...enabledTiers(service)].sort((a, b) => a.price_fen - b.price_fen)[0];
}

export interface BayServiceSelection {
  tier: BayServiceTier | undefined;
  addons: BayServiceAddon[];
  invalidAddonIds: string[];
  totalFen: number;
  /** null = 交期面议。 */
  deliveryDays: number | null;
}

/** 档位 + 加购 → 合计与交期。`tierName` 指定了却不存在时 tier 为 undefined（不偷偷换档）。 */
export function serviceSelection(
  service: Pick<BayServiceDetail, "tiers" | "addons" | "delivery_days"> | null | undefined,
  tierName: string | null | undefined,
  addonIds: Iterable<string>,
): BayServiceSelection {
  const tiers = enabledTiers(service);
  const tier = tierName ? tiers.find((item) => item.tier === tierName) : defaultTier(service);
  const pool = enabledAddons(service);
  const ids = Array.from(new Set(Array.from(addonIds).filter(Boolean)));
  const addons = ids.map((id) => pool.find((item) => item.id === id)).filter((item): item is BayServiceAddon => Boolean(item));
  const invalidAddonIds = ids.filter((id) => !pool.some((item) => item.id === id));
  const totalFen = (tier?.price_fen || 0) + addons.reduce((sum, item) => sum + (item.price_fen || 0), 0);
  const base = tier?.delivery_days ?? service?.delivery_days ?? null;
  const deliveryDays = base === null || base === undefined ? null : base + addons.reduce((sum, item) => sum + (item.extra_days || 0), 0);
  return { tier, addons, invalidAddonIds, totalFen, deliveryDays };
}

/** 限定领域（医疗、法律、宠物医疗）第一版不上架，任何列表里都不出现。 */
export const BAY_RESTRICTED_DOMAINS = ["medical", "legal", "vet"] as const;

export function isRestrictedDomain(domain: unknown): boolean {
  return typeof domain === "string" && (BAY_RESTRICTED_DOMAINS as readonly string[]).includes(domain);
}

export function withoutRestricted<T>(items: T[]): T[] {
  return items.filter((item) => !isRestrictedDomain((item as { regulated_domain?: unknown } | null)?.regulated_domain));
}

export type BayReportReason = "fake" | "harassment" | "offsite" | "plagiarism" | "fraud" | "other";

export const BAY_REPORT_REASONS: BayReportReason[] = ["fake", "harassment", "offsite", "plagiarism", "fraud", "other"];

/** 发给后端的举报原因原文（后端按中文存）；界面上显示的是 tt 译文。 */
export const BAY_REPORT_REASON_TEXT: Record<BayReportReason, string> = {
  fake: "虚假信息或夸大宣传",
  harassment: "骚扰、辱骂或歧视",
  offsite: "要求站外交易或预付款",
  plagiarism: "抄袭、盗用他人作品",
  fraud: "涉嫌欺诈",
  other: "其他",
};

export function reportBayService(serviceId: string, reason: BayReportReason, detail?: string): Promise<{ duplicate: boolean }> {
  return bayPost<{ duplicate: boolean }>("/v1/talent/reports", {
    target_kind: "service",
    target_ref: serviceId,
    reason: BAY_REPORT_REASON_TEXT[reason],
    ...(detail ? { detail } : {}),
  });
}

/** 卖家本人看自己的服务时显示「编辑」，不显示下单与先聊聊。 */
export function isOwnService(service: Pick<BayService, "user_id"> | null | undefined, viewerId: string | null | undefined): boolean {
  return Boolean(service && viewerId && service.user_id === viewerId);
}
