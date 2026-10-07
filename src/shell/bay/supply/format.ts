// supply 各窗格共用的展示助手：价格、交期、改稿、评分、链接白名单。文案一律 tt 字面量。

import type { UITranslate } from "../../../i18n/ui/useUI";
import type { BayPrice, BayWorkRef } from "../../../lib/bay/types";
import { formatBayMoney, type BayServiceTierName } from "../../../lib/bay/services";

/** 只放行 http(s) 地址；其余（javascript:、data: 等）一律不渲染。 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeSitePath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const value = path.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.length > 2000) return null;
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/** 附带作品的打开地址：https 用 safeHttpUrl；站内路径与 needs 的 workPreviewHref 一样只认绝对路径。 */
export function workOpenHref(work: Pick<BayWorkRef, "site_key" | "preview_url"> | null | undefined): string | null {
  const https = safeHttpUrl(work?.preview_url);
  if (https) return https;
  return safeSitePath(work?.preview_url);
}

export function moneyOrFree(tt: UITranslate, fen: number | null | undefined, currency?: string | null): string {
  if (fen === null || fen === undefined || !Number.isFinite(fen)) return tt("面议");
  if (fen <= 0) return tt("免费");
  return formatBayMoney(fen, currency);
}

/** 信息流卡片上的起价。 */
export function feedPriceLabel(tt: UITranslate, price: BayPrice | null | undefined): string {
  if (!price || price.min_fen === null || price.min_fen === undefined) return tt("面议");
  if (price.min_fen <= 0) return tt("免费");
  return tt("{price} 起", { price: formatBayMoney(price.min_fen, price.currency) });
}

export function consultUnitLabel(tt: UITranslate, unit: string | null | undefined): string {
  return unit === "hour" ? tt("每小时") : tt("每次");
}

export function consultPriceText(tt: UITranslate, fen: number | null | undefined, unit: string | null | undefined, currency?: string | null): string {
  if (fen === null || fen === undefined || fen <= 0) return tt("免费 · {unit}", { unit: consultUnitLabel(tt, unit) });
  return tt("{price} / {unit}", { price: formatBayMoney(fen, currency), unit: consultUnitLabel(tt, unit) });
}

export function consultScopeText(tt: UITranslate, consult: { price_unit?: string | null; rounds?: number | null; minutes?: number | null }): string {
  if (consult.price_unit === "session") {
    return consult.rounds ? tt("每次 {n} 轮问答", { n: consult.rounds }) : tt("每次答疑，轮次以挂牌为准");
  }
  return consult.minutes ? tt("按小时计费，单次约 {n} 分钟", { n: consult.minutes }) : tt("按小时计费，时长以记录为准");
}

export function deliveryDaysText(tt: UITranslate, days: number | null | undefined): string {
  return days ? tt("{n} 天交付", { n: days }) : tt("交期面议");
}

export function revisionsText(tt: UITranslate, revisions: number): string {
  return revisions < 0 ? tt("不限改稿") : tt("改稿 {n} 次", { n: revisions });
}

export function tierLabel(tt: UITranslate, tier: BayServiceTierName | string): string {
  switch (tier) {
    case "basic":
      return tt("基础版");
    case "standard":
      return tt("标准版");
    case "premium":
      return tt("高级版");
    default:
      return tier;
  }
}

export function ratingShort(tt: UITranslate, avg: number | null | undefined, count: number | null | undefined): string {
  if (!count || avg === null || avg === undefined || !Number.isFinite(avg)) return tt("暂无评价");
  return tt("{avg} 分 · {n} 条评价", { avg: Number(avg).toFixed(1), n: count });
}

export function responseTimeText(tt: UITranslate, minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return tt("响应时间待积累");
  if (minutes < 60) return tt("通常 {n} 分钟内回复", { n: Math.max(1, Math.round(minutes)) });
  if (minutes < 24 * 60) return tt("通常 {n} 小时内回复", { n: Math.max(1, Math.round(minutes / 60)) });
  return tt("通常 {n} 天内回复", { n: Math.max(1, Math.round(minutes / 1440)) });
}

export function initialOf(name: string): string {
  return Array.from(name.trim())[0] || "?";
}
