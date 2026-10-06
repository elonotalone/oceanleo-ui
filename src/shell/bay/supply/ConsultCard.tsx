"use client";

// 信息流里的一张答疑卡：能问什么、多少钱、谁来答。卡片只是入口（「查看与预约」），
// 预约动作只在详情里。医疗、法律、宠物医疗三个领域第一版不上架：带着这些领域的卡片一律不渲染。

import { useUI } from "../../../i18n/ui/useUI";
import type { BayFeedCardProps } from "../needs";
import { openBay } from "../shell/bay-state";
import { isRestrictedDomain } from "../../../lib/bay/services";
import { consultPriceText } from "./format";

export function ConsultCard({ item, onOpen }: BayFeedCardProps) {
  const tt = useUI();
  if (isRestrictedDomain((item as { regulated_domain?: unknown }).regulated_domain)) return null;
  const sellerName = item.author.display_name || item.author.handle || "";
  const handle = item.author.handle;
  return (
    <article data-bay-card="consult" data-bay-id={item.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className="text-[11px] font-medium text-neutral-500">{tt("答疑")}</span>
        <p className="mt-0.5 line-clamp-2 break-words text-[14px] font-semibold">{item.title}</p>
        {item.summary ? <p className="mt-1 line-clamp-2 break-words text-[12.5px] text-neutral-600">{item.summary}</p> : null}
        <p data-bay-price className="mt-2 text-[12px] font-semibold text-neutral-900">
          {consultPriceText(tt, item.price?.min_fen ?? null, item.price?.unit ?? null, item.price?.currency)}
        </p>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-neutral-100 pt-2 text-[12px] text-neutral-600">
        {handle ? (
          <button type="button" data-bay-seller onClick={() => openBay({ kind: "profile", handle })} className="min-w-0 truncate hover:underline">
            {sellerName}
          </button>
        ) : (
          <span className="min-w-0 truncate">{sellerName}</span>
        )}
        <button type="button" onClick={onOpen} className="shrink-0 rounded-lg bg-neutral-900 px-2.5 py-1 text-[12px] text-white hover:bg-neutral-800">
          {tt("查看与预约")}
        </button>
      </div>
    </article>
  );
}
