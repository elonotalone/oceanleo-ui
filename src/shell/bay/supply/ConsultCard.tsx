"use client";

// 信息流里的一条答疑：能问什么、多少钱、谁来答。整条点开详情。
// 浮窗里是一整行，/bay 页网格里是一张卡（variant）。
// 医疗、法律、宠物医疗三个领域第一版不上架：带着这些领域的卡片一律不渲染。

import { useUI } from "../../../i18n/ui/useUI";
import type { BayFeedCardProps } from "../needs";
import { isRestrictedDomain } from "../../../lib/bay/services";
import {
  FEED_ROW_FOOTER_CLASS,
  FEED_ROW_PRICE_CLASS,
  FEED_ROW_SUMMARY_CLASS,
  FEED_ROW_TITLE_CLASS,
  FEED_TILE_FOOTER_CLASS,
  FEED_TILE_PRICE_CLASS,
  FEED_TILE_SUMMARY_CLASS,
  FEED_TILE_TITLE_CLASS,
  feedCardClass,
  feedKindBadgeClass,
} from "../shell/feed-card-ui";
import { consultPriceText } from "./format";

export function ConsultCard({ item, onOpen, variant }: BayFeedCardProps) {
  const tt = useUI();
  if (isRestrictedDomain((item as { regulated_domain?: unknown }).regulated_domain)) return null;
  const sellerName = item.author.display_name || item.author.handle || "";
  const price = consultPriceText(tt, item.price?.min_fen ?? null, item.price?.unit ?? null, item.price?.currency);

  if (variant === "card") {
    return (
      <button type="button" data-bay-card="consult" data-bay-card-variant="card" data-bay-id={item.id} onClick={onOpen} className={feedCardClass("card")}>
        <span className="flex items-center justify-between gap-3">
          <span className={feedKindBadgeClass("consult")}>{tt("答疑")}</span>
          <span data-bay-price className={FEED_TILE_PRICE_CLASS}>
            {price}
          </span>
        </span>
        <span className={`mt-2.5 ${FEED_TILE_TITLE_CLASS}`}>{item.title}</span>
        {item.summary ? <span className={FEED_TILE_SUMMARY_CLASS}>{item.summary}</span> : null}
        <span className="mt-auto block pt-1">
          <span className={FEED_TILE_FOOTER_CLASS}>
            <span data-bay-seller className="min-w-0 flex-1 truncate font-medium text-stone-700">
              {sellerName}
            </span>
            <span className="shrink-0">{tt("查看与预约")}</span>
          </span>
        </span>
      </button>
    );
  }

  return (
    <button type="button" data-bay-card="consult" data-bay-id={item.id} onClick={onOpen} className={feedCardClass("row")}>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={feedKindBadgeClass("consult")}>{tt("答疑")}</span>
            <span className={FEED_ROW_TITLE_CLASS}>{item.title}</span>
          </span>
          {item.summary ? <span className={FEED_ROW_SUMMARY_CLASS}>{item.summary}</span> : null}
        </span>
        <span data-bay-price className={FEED_ROW_PRICE_CLASS}>
          {price}
        </span>
      </span>
      <span className={`justify-between ${FEED_ROW_FOOTER_CLASS}`}>
        <span data-bay-seller className="max-w-[10rem] truncate font-medium text-stone-600">
          {sellerName}
        </span>
        <span className="shrink-0">{tt("查看与预约")}</span>
      </span>
    </button>
  );
}
