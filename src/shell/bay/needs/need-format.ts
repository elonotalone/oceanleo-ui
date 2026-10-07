import type { UITranslate } from "../../../i18n/ui/useUI";
import { formatBayFen } from "../../../lib/bay/demands";
import type { BayPrice } from "../../../lib/bay/types";
import { baySiteName } from "../shell/bay-links";

export function budgetText(
  tt: UITranslate,
  minFen: number | null | undefined,
  maxFen: number | null | undefined,
  currency?: string | null,
): string {
  const low = typeof minFen === "number" && Number.isFinite(minFen) ? minFen : null;
  const high = typeof maxFen === "number" && Number.isFinite(maxFen) ? maxFen : null;
  if (low === null && high === null) return tt("预算面议");
  if (low === null) return tt("最高 {amount}", { amount: formatBayFen(high as number, currency) });
  if (high === null) return tt("{amount} 起", { amount: formatBayFen(low, currency) });
  if (low === high) return formatBayFen(low, currency);
  return `${formatBayFen(low, currency)} – ${formatBayFen(high, currency)}`;
}

export function priceText(tt: UITranslate, price: BayPrice | null | undefined): string {
  if (!price) return tt("预算面议");
  return budgetText(tt, price.min_fen, price.max_fen, price.currency);
}

export function timeAgoText(tt: UITranslate, value: string | null | undefined, now = Date.now()): string {
  const at = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(at)) return tt("刚刚发布");
  const minutes = Math.max(1, Math.floor((now - at) / 60_000));
  if (minutes < 60) return tt("{n} 分钟前", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tt("{n} 小时前", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return tt("{n} 天前", { n: days });
  return new Date(at).toISOString().slice(0, 10);
}

export function deadlineText(tt: UITranslate, value: string | null | undefined, now = Date.now()): string {
  const at = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(at)) return tt("交期可协商");
  const days = Math.ceil((at - now) / 86_400_000);
  if (days < 0) return tt("已过截止日");
  if (days === 0) return tt("今天截止");
  if (days <= 7) return tt("{n} 天后截止", { n: days });
  return tt("{date} 截止", { date: new Date(at).toISOString().slice(0, 10) });
}

export function authorName(tt: UITranslate, author: { display_name?: string | null; handle?: string | null } | null | undefined): string {
  const name = (author?.display_name || "").trim();
  if (name) return name;
  const handle = (author?.handle || "").trim();
  return handle ? `@${handle}` : tt("OceanLeo 用户");
}

export function demandStatusText(tt: UITranslate, status: string | null | undefined): string {
  if (status === "draft") return tt("草稿");
  if (status === "open") return tt("开放报价");
  if (status === "filled") return tt("已选定接单人");
  return tt("已关闭");
}

export function proposalStatusText(tt: UITranslate, status: string | null | undefined): string {
  if (status === "accepted") return tt("已接受");
  if (status === "declined") return tt("已拒绝");
  if (status === "withdrawn") return tt("已撤回");
  return tt("等对方回复");
}

export function ratingText(tt: UITranslate, avg: number | null | undefined, count: number | null | undefined): string {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  if (!n || typeof avg !== "number" || !Number.isFinite(avg)) return tt("暂无评价");
  return tt("{score} 分 · {n} 条评价", { score: avg.toFixed(1), n });
}

export function levelText(tt: UITranslate, level: string | null | undefined): string {
  if (level === "rising") return tt("成长中");
  if (level === "pro") return tt("资深");
  if (level === "top") return tt("顶尖");
  return tt("新伙伴");
}

export function deliveryDaysText(tt: UITranslate, days: number | null | undefined): string {
  return typeof days === "number" && days > 0 ? tt("{n} 天交付", { n: days }) : tt("交期面议");
}

/** 站 key → 产品名（不翻译；只有 aitools 随界面语言）；认不出的站退回「这个站」。名字只来自 W03 的 `baySiteName`，本目录不留站名表。 */
export function siteLabel(tt: UITranslate, siteKey: string | null | undefined): string {
  return baySiteName(siteKey, tt) ?? tt("这个站");
}
