"use client";

// 信息流里的一条内容（人工服务、答疑、需求、求助，以及卖家按现成文件 / 网站与软件服务 / 课程 / 其他发布的条目）
// 用资料库同款的卡片或列表行画出来。信息流本体（BayList）、网站与软件服务 / 课程货架、现成文件的「卖家在售」共用这一份。
import { useUI } from "../../../i18n/ui/useUI";
import { isRestrictedDomain } from "../../../lib/bay/services";
import type { BayFeedItem } from "../../../lib/bay/types";
import { CollectionItemCard, CollectionItemRow } from "../../collection-items";
import { priceText } from "../needs/need-format";
import { consultPriceText, feedPriceLabel } from "../supply/format";
import { openBay, type BayTarget } from "./bay-state";
import type { BayFeedCardVariant } from "./feed-card-ui";

export function targetForFeedItem(item: BayFeedItem): BayTarget {
  return { kind: item.kind, id: item.id };
}

function httpsCover(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const text = url.trim();
  return text.startsWith("https://") ? text : null;
}

function titleInitial(title: string): string {
  return Array.from(title.trim())[0] || "?";
}

/** 两种外形共用资料库的卡片 / 行；点开进这一条的详情。 */
export function FeedCard({ item, variant }: { item: BayFeedItem; variant: BayFeedCardVariant }) {
  const tt = useUI();
  if ((item.kind === "service" || item.kind === "consult") && isRestrictedDomain((item as { regulated_domain?: unknown }).regulated_domain)) return null;
  const cover = httpsCover(item.cover_url);
  const Item = variant === "card" ? CollectionItemCard : CollectionItemRow;
  const price = item.kind === "consult"
    ? consultPriceText(tt, item.price?.min_fen, item.price?.unit, item.price?.currency)
    : item.kind === "service" ? feedPriceLabel(tt, item.price) : priceText(tt, item.price);
  return (
    <Item
      containerProps={{ "data-bay-card": item.kind, "data-bay-card-variant": variant, "data-bay-id": item.id }}
      title={item.title}
      metadata={<>{item.author.display_name || item.author.handle} · {price}{item.summary ? ` · ${item.summary}` : ""}</>}
      cover={cover ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[15px] font-semibold text-stone-400">{titleInitial(item.title)}</span>}
      onOpen={() => openBay(targetForFeedItem(item))}
    />
  );
}
