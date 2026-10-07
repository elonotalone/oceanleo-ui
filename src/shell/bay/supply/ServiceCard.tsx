"use client";

// 信息流里的一条服务：封面、标题、起价、几天交付、评分、卖家。整条点开服务。
// 浮窗里是一整行，/bay 页网格里是一张卡（variant）。全部内容按纯文本渲染；封面只认 http(s) 地址。

import { useUI } from "../../../i18n/ui/useUI";
import type { BayFeedCardProps } from "../needs";
import { isRestrictedDomain } from "../../../lib/bay/services";
import {
  FEED_ROW_FOOTER_CLASS,
  FEED_ROW_META_CLASS,
  FEED_ROW_PRICE_CLASS,
  FEED_ROW_SUMMARY_CLASS,
  FEED_ROW_TITLE_CLASS,
  FEED_TILE_FOOTER_CLASS,
  FEED_TILE_META_CLASS,
  FEED_TILE_PILL_CLASS,
  FEED_TILE_PRICE_CLASS,
  FEED_TILE_SUMMARY_CLASS,
  FEED_TILE_TITLE_CLASS,
  feedCardClass,
  feedKindBadgeClass,
} from "../shell/feed-card-ui";
import { deliveryDaysText, feedPriceLabel, initialOf, ratingShort, safeHttpUrl } from "./format";

function optionalNumber(source: unknown, key: string): number | null {
  const value = source && typeof source === "object" ? (source as Record<string, unknown>)[key] : null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function SellerAvatar({ url, name }: { url: string | null; name: string }) {
  return url ? (
    <img src={url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-stone-100 text-[11px] text-stone-500">{initialOf(name)}</span>
  );
}

export function ServiceCard({ item, onOpen, variant }: BayFeedCardProps) {
  const tt = useUI();
  if (isRestrictedDomain((item as { regulated_domain?: unknown }).regulated_domain)) return null;
  const cover = safeHttpUrl(item.cover_url);
  const avatar = safeHttpUrl(item.author.avatar_url);
  const days = optionalNumber(item, "delivery_days");
  const orders = item.stats?.order_count ?? 0;
  const sellerName = item.author.display_name || item.author.handle || "";
  const price = feedPriceLabel(tt, item.price);
  const rating = ratingShort(tt, item.author.rating_avg, item.author.rating_count);
  const digital = item.listing_kind === "digital";
  const kindLabel = digital ? tt("数字商品") : tt("服务");
  const official = item.author.official === true;

  if (variant === "card") {
    return (
      <button type="button" data-bay-card="service" data-bay-card-variant="card" data-bay-id={item.id} onClick={onOpen} className={feedCardClass("card")}>
        <span className="flex items-center justify-between gap-3">
          <span data-bay-kind={digital ? "digital" : "service"} className={feedKindBadgeClass("service")}>
            {kindLabel}
          </span>
          <span data-bay-price className={FEED_TILE_PRICE_CLASS}>
            {price}
          </span>
        </span>
        <span className="mt-2.5 flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className={FEED_TILE_TITLE_CLASS}>{item.title}</span>
            {item.summary ? <span className={FEED_TILE_SUMMARY_CLASS}>{item.summary}</span> : null}
          </span>
          {cover ? <img src={cover} alt="" loading="lazy" className="h-14 w-20 shrink-0 rounded-lg object-cover" /> : null}
        </span>
        <span className={FEED_TILE_META_CLASS}>
          {days ? <span className={FEED_TILE_PILL_CLASS}>{deliveryDaysText(tt, days)}</span> : null}
          <span className={FEED_TILE_PILL_CLASS}>{rating}</span>
          {orders > 0 ? <span className={FEED_TILE_PILL_CLASS}>{tt("{n} 份订单", { n: orders })}</span> : null}
        </span>
        <span className={FEED_TILE_FOOTER_CLASS}>
          <SellerAvatar url={avatar} name={sellerName} />
          <span data-bay-seller className="min-w-0 truncate font-medium text-stone-700">
            {sellerName}
          </span>
          {official ? (
            <span data-bay-official className="shrink-0 text-[11px] text-stone-500">
              {tt("官方")}
            </span>
          ) : null}
        </span>
      </button>
    );
  }

  return (
    <button type="button" data-bay-card="service" data-bay-id={item.id} onClick={onOpen} className={feedCardClass("row")}>
      <span className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span data-bay-kind={digital ? "digital" : "service"} className={feedKindBadgeClass("service")}>
              {kindLabel}
            </span>
            <span className={FEED_ROW_TITLE_CLASS}>{item.title}</span>
          </span>
          {item.summary ? <span className={FEED_ROW_SUMMARY_CLASS}>{item.summary}</span> : null}
        </span>
        {cover ? <img src={cover} alt="" loading="lazy" className="h-10 w-14 shrink-0 rounded-md object-cover" /> : null}
        <span data-bay-price className={FEED_ROW_PRICE_CLASS}>
          {price}
        </span>
      </span>
      <span className={FEED_ROW_META_CLASS}>
        {days ? (
          <>
            <span>{deliveryDaysText(tt, days)}</span>
            <span aria-hidden="true">·</span>
          </>
        ) : null}
        <span>{rating}</span>
        {orders > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{tt("{n} 份订单", { n: orders })}</span>
          </>
        ) : null}
      </span>
      <span className={FEED_ROW_FOOTER_CLASS}>
        <SellerAvatar url={avatar} name={sellerName} />
        <span data-bay-seller className="max-w-[10rem] truncate font-medium text-stone-600">
          {sellerName}
        </span>
        {official ? (
          <span data-bay-official className="shrink-0 text-[11px] text-stone-500">
            {tt("官方")}
          </span>
        ) : null}
      </span>
    </button>
  );
}
