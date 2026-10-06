"use client";

// 信息流里的一张服务卡：封面、标题、起价、几天交付、评分、卖家。卖家名字点开是他的主页。
// 全部内容按纯文本渲染；封面只认 http(s) 地址。

import { useUI } from "../../../i18n/ui/useUI";
import type { BayFeedCardProps } from "../needs";
import { openBay } from "../shell/bay-state";
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
  const handle = item.author.handle;
  return (
    <article data-bay-card="service" data-bay-id={item.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="aspect-video w-full bg-neutral-100 object-cover" />
        ) : null}
        <div className="px-3 pt-3">
          <p className="line-clamp-2 break-words text-[14px] font-semibold">{item.title}</p>
          {item.summary ? <p className="mt-1 line-clamp-2 break-words text-[12.5px] text-neutral-600">{item.summary}</p> : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-neutral-500">
            <span data-bay-price className="font-semibold text-neutral-900">{feedPriceLabel(tt, item.price)}</span>
            {days ? <span>{deliveryDaysText(tt, days)}</span> : null}
            <span>{ratingShort(tt, item.author.rating_avg, item.author.rating_count)}</span>
            {orders > 0 ? <span>{tt("{n} 份订单", { n: orders })}</span> : null}
          </p>
        </div>
      </button>
      <div className="flex items-center gap-2 px-3 pb-3 pt-2 text-[12px] text-neutral-600">
        {avatar ? (
          <img src={avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
        ) : (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-neutral-100 text-[11px] text-neutral-500">{initialOf(sellerName)}</span>
        )}
        {handle ? (
          <button
            type="button"
            data-bay-seller
            onClick={() => openBay({ kind: "profile", handle })}
            className="min-w-0 truncate hover:underline"
          >
            {sellerName}
          </button>
        ) : (
          <span className="min-w-0 truncate">{sellerName}</span>
        )}
      </div>
    </article>
  );
}
