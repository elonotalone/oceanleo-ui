// 公开页纯展示用的小件：价格、交期、评分。不 import 取数、不 import 外壳，避免门户入口拉进 AppShell。

import type { UITranslate } from "../../../i18n/ui/useUI";

const CURRENCY_SYMBOL: Record<string, string> = { CNY: "¥", RMB: "¥", USD: "$", EUR: "€", GBP: "£", JPY: "¥", HKD: "HK$" };

export function publicMoney(fen: number, currency?: string | null): string {
  const code = String(currency || "CNY").toUpperCase();
  const value = (Number.isFinite(fen) ? fen : 0) / 100;
  const number = Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbol = CURRENCY_SYMBOL[code];
  return symbol ? `${symbol}${number}` : `${number} ${code}`;
}

export function publicPriceFrom(tt: UITranslate, fen: number | null, currency?: string | null): string {
  if (fen === null || !Number.isFinite(fen)) return tt("面议");
  if (fen <= 0) return tt("免费");
  return tt("{price} 起", { price: publicMoney(fen, currency) });
}

export function publicPrice(tt: UITranslate, fen: number | null, currency?: string | null): string {
  if (fen === null || !Number.isFinite(fen)) return tt("面议");
  if (fen <= 0) return tt("免费");
  return publicMoney(fen, currency);
}

export function publicRating(tt: UITranslate, avg: number | null | undefined, count: number | null | undefined): string {
  if (!count || avg === null || avg === undefined || !Number.isFinite(avg)) return tt("暂无评价");
  return tt("{avg} 分 · {n} 条评价", { avg: Number(avg).toFixed(1), n: count });
}

export function publicResponse(tt: UITranslate, minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 60) return tt("通常 {n} 分钟内回复", { n: Math.max(1, Math.round(minutes)) });
  if (minutes < 24 * 60) return tt("通常 {n} 小时内回复", { n: Math.max(1, Math.round(minutes / 60)) });
  return tt("通常 {n} 天内回复", { n: Math.max(1, Math.round(minutes / 1440)) });
}

export function publicTierLabel(tt: UITranslate, tier: string): string {
  if (tier === "basic") return tt("基础版");
  if (tier === "standard") return tt("标准版");
  if (tier === "premium") return tt("高级版");
  return tier;
}

export function publicRevisions(tt: UITranslate, revisions: number): string {
  return revisions < 0 ? tt("不限改稿") : tt("改稿 {n} 次", { n: revisions });
}
