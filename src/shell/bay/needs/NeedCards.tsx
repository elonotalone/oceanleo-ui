"use client";

import { useUI } from "../../../i18n/ui/useUI";
import type { BayFeedItem } from "../../../lib/bay/types";
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
  type BayFeedCardVariant,
  type BayFeedKindTone,
} from "../shell/feed-card-ui";
import { categoryNameBySlug, useNeedCategories } from "./need-categories";
import { authorName, deadlineText, priceText, timeAgoText } from "./need-format";

export interface BayFeedCardProps {
  item: BayFeedItem;
  onOpen: () => void;
  /** row = 浮窗和窄列里的一整行（缺省）；card = /bay 页网格里的一张卡。 */
  variant?: BayFeedCardVariant;
}

function AttachedWorkBadge() {
  const tt = useUI();
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {tt("附有作品")}
    </span>
  );
}

/** 需求卡与求助卡只差种类小标和中间那排说明，外形共用这一份。 */
function NeedCard({
  item,
  onOpen,
  variant,
  tone,
  kindLabel,
  facts,
}: BayFeedCardProps & { tone: BayFeedKindTone; kindLabel: string; facts: string[] }) {
  const tt = useUI();
  const { response } = useNeedCategories();
  const category = categoryNameBySlug(tt, item.category, response);
  const author = authorName(tt, item.author);
  const posted = timeAgoText(tt, item.created_at);
  const price = priceText(tt, item.price);

  if (variant === "card") {
    return (
      <button type="button" onClick={onOpen} className={feedCardClass("card")} data-bay-card={tone} data-bay-card-variant="card">
        <span className="flex items-center justify-between gap-3">
          <span className={feedKindBadgeClass(tone)}>{kindLabel}</span>
          <span className={FEED_TILE_PRICE_CLASS}>{price}</span>
        </span>
        <span className={`mt-2.5 ${FEED_TILE_TITLE_CLASS}`}>{item.title}</span>
        {item.summary ? <span className={FEED_TILE_SUMMARY_CLASS}>{item.summary}</span> : null}
        <span className={FEED_TILE_META_CLASS}>
          {category ? <span className={FEED_TILE_PILL_CLASS}>{category}</span> : null}
          {facts.map((fact) => (
            <span key={fact} className={FEED_TILE_PILL_CLASS}>
              {fact}
            </span>
          ))}
          {item.has_attached_work ? <AttachedWorkBadge /> : null}
        </span>
        <span className={FEED_TILE_FOOTER_CLASS}>
          <span className="min-w-0 truncate font-medium text-stone-700">{author}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{posted}</span>
        </span>
      </button>
    );
  }

  return (
    <button type="button" onClick={onOpen} className={feedCardClass("row")} data-bay-card={tone}>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={feedKindBadgeClass(tone)}>{kindLabel}</span>
            <span className={FEED_ROW_TITLE_CLASS}>{item.title}</span>
          </span>
          {item.summary ? <span className={FEED_ROW_SUMMARY_CLASS}>{item.summary}</span> : null}
        </span>
        <span className={FEED_ROW_PRICE_CLASS}>{price}</span>
      </span>
      <span className={FEED_ROW_META_CLASS}>
        {category ? <span className="rounded-md border border-stone-200 px-1.5 py-0.5">{category}</span> : null}
        {facts.map((fact, index) => (
          <span key={fact} className="inline-flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden="true">·</span> : null}
            {fact}
          </span>
        ))}
        {item.has_attached_work ? <AttachedWorkBadge /> : null}
      </span>
      <span className={FEED_ROW_FOOTER_CLASS}>
        <span className="max-w-[10rem] truncate font-medium text-stone-600">{author}</span>
        <span aria-hidden="true">·</span>
        <span>{posted}</span>
      </span>
    </button>
  );
}

export function DemandCard(props: BayFeedCardProps) {
  const tt = useUI();
  const proposals = Math.max(0, Number(props.item.stats?.proposal_count || 0));
  return (
    <NeedCard
      {...props}
      tone="demand"
      kindLabel={tt("需求")}
      facts={[deadlineText(tt, props.item.deadline_at), tt("{n} 份报价", { n: proposals })]}
    />
  );
}

export function HelpRequestCard(props: BayFeedCardProps) {
  const tt = useUI();
  const waiting = props.item.status === "open" || props.item.status === "draft";
  return <NeedCard {...props} tone="help" kindLabel={tt("求助")} facts={[waiting ? tt("等人接住") : tt("已被接住")]} />;
}
