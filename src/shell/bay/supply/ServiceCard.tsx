"use client";

// 信息流里的一行服务：封面、标题、起价、几天交付、评分、卖家。整行点开服务。
// 全部内容按纯文本渲染；封面只认 http(s) 地址。

import { useUI } from "../../../i18n/ui/useUI";
import type { BayFeedCardProps } from "../needs";
import { isRestrictedDomain } from "../../../lib/bay/services";
import { deliveryDaysText, feedPriceLabel, initialOf, ratingShort, safeHttpUrl } from "./format";

function optionalNumber(source: unknown, key: string): number | null {
  const value = source && typeof source === "object" ? (source as Record<string, unknown>)[key] : null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function ServiceCard({ item, onOpen }: BayFeedCardProps) {
  const tt = useUI();
  if (isRestrictedDomain((item as { regulated_domain?: unknown }).regulated_domain)) return null;
  const cover = safeHttpUrl(item.cover_url);
  const avatar = safeHttpUrl(item.author.avatar_url);
  const days = optionalNumber(item, "delivery_days");
  const orders = item.stats?.order_count ?? 0;
  const sellerName = item.author.display_name || item.author.handle || "";
  return (
    <button
      type="button"
      data-bay-card="service"
      data-bay-id={item.id}
      onClick={onOpen}
      className="flex w-full items-start gap-3 border-b border-neutral-100 px-3 py-2.5 text-left text-neutral-900 hover:bg-black/[0.03]"
    >
      {cover ? <img src={cover} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded object-cover" /> : null}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block break-words text-[13px] font-semibold">{item.title}</span>
        {item.summary ? <span className="mt-0.5 line-clamp-2 block break-words text-[12px] text-neutral-600">{item.summary}</span> : null}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-neutral-500">
          <span data-bay-price className="font-semibold text-neutral-900">
            {feedPriceLabel(tt, item.price)}
          </span>
          {days ? <span>{deliveryDaysText(tt, days)}</span> : null}
          <span>{ratingShort(tt, item.author.rating_avg, item.author.rating_count)}</span>
          {orders > 0 ? <span>{tt("{n} 份订单", { n: orders })}</span> : null}
        </span>
        <span className="mt-1 flex items-center gap-2 text-[12px] text-neutral-600">
          {avatar ? (
            <img src={avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <span className="grid h-5 w-5 place-items-center rounded-full bg-neutral-100 text-[11px] text-neutral-500">{initialOf(sellerName)}</span>
          )}
          <span data-bay-seller className="min-w-0 truncate">
            {sellerName}
          </span>
        </span>
      </span>
    </button>
  );
}
