"use client";

// 信息流里的一行答疑：能问什么、多少钱、谁来答。整行点开详情。
// 医疗、法律、宠物医疗三个领域第一版不上架：带着这些领域的卡片一律不渲染。

import { useUI } from "../../../i18n/ui/useUI";
import type { BayFeedCardProps } from "../needs";
import { isRestrictedDomain } from "../../../lib/bay/services";
import { consultPriceText } from "./format";

export function ConsultCard({ item, onOpen }: BayFeedCardProps) {
  const tt = useUI();
  if (isRestrictedDomain((item as { regulated_domain?: unknown }).regulated_domain)) return null;
  const sellerName = item.author.display_name || item.author.handle || "";
  return (
    <button
      type="button"
      data-bay-card="consult"
      data-bay-id={item.id}
      onClick={onOpen}
      className="flex w-full items-start justify-between gap-3 border-b border-neutral-100 px-3 py-2.5 text-left text-neutral-900 hover:bg-black/[0.03]"
    >
      <span className="min-w-0 flex-1">
        <span className="text-[11px] font-medium text-neutral-500">{tt("答疑")}</span>
        <span className="mt-0.5 line-clamp-2 block break-words text-[13px] font-semibold">{item.title}</span>
        {item.summary ? <span className="mt-0.5 line-clamp-2 block break-words text-[12px] text-neutral-600">{item.summary}</span> : null}
        <span data-bay-price className="mt-1 block text-[12px] font-semibold text-neutral-900">
          {consultPriceText(tt, item.price?.min_fen ?? null, item.price?.unit ?? null, item.price?.currency)}
        </span>
        <span data-bay-seller className="mt-1 block truncate text-[12px] text-neutral-600">
          {sellerName}
        </span>
      </span>
      <span className="shrink-0 self-center text-[12px] text-neutral-500">{tt("查看与预约")}</span>
    </button>
  );
}
