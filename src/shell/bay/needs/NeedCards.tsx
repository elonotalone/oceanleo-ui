"use client";

import { useUI } from "../../../i18n/ui/useUI";
import type { BayFeedItem } from "../../../lib/bay/types";
import { categoryNameBySlug, useNeedCategories } from "./need-categories";
import { authorName, deadlineText, priceText, timeAgoText } from "./need-format";

export interface BayFeedCardProps {
  item: BayFeedItem;
  onOpen: () => void;
}

/** 信息流里的一整行（参照收件箱的一行）：自带内边距与下边线；选中底色由 Bay 外壳的外层给。 */
const CARD_CLASS =
  "group block w-full border-b border-black/5 px-3 py-2.5 text-left transition-colors hover:bg-black/5 focus-visible:bg-black/5 focus-visible:outline-none dark:border-white/10 dark:hover:bg-white/5 dark:focus-visible:bg-white/5";

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

function CardFooter({ item, extra }: { item: BayFeedItem; extra: string | null }) {
  const tt = useUI();
  return (
    <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-400">
      <span className="max-w-[10rem] truncate font-medium text-stone-600">{authorName(tt, item.author)}</span>
      <span aria-hidden="true">·</span>
      <span>{timeAgoText(tt, item.created_at)}</span>
      {extra ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{extra}</span>
        </>
      ) : null}
    </span>
  );
}

export function DemandCard({ item, onOpen }: BayFeedCardProps) {
  const tt = useUI();
  const { response } = useNeedCategories();
  const category = categoryNameBySlug(tt, item.category, response);
  const proposals = Math.max(0, Number(item.stats?.proposal_count || 0));
  return (
    <button type="button" onClick={onOpen} className={CARD_CLASS} data-bay-card="demand">
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">{tt("需求")}</span>
            <span className="min-w-0 truncate text-[14px] font-semibold text-stone-800">{item.title}</span>
          </span>
          {item.summary ? (
            <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-stone-500">{item.summary}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-stone-800">{priceText(tt, item.price)}</span>
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
        {category ? <span className="rounded-md border border-stone-200 px-1.5 py-0.5">{category}</span> : null}
        <span>{deadlineText(tt, item.deadline_at)}</span>
        <span aria-hidden="true">·</span>
        <span>{tt("{n} 份报价", { n: proposals })}</span>
        {item.has_attached_work ? <AttachedWorkBadge /> : null}
      </span>
      <CardFooter item={item} extra={null} />
    </button>
  );
}

export function HelpRequestCard({ item, onOpen }: BayFeedCardProps) {
  const tt = useUI();
  const { response } = useNeedCategories();
  const category = categoryNameBySlug(tt, item.category, response);
  return (
    <button type="button" onClick={onOpen} className={CARD_CLASS} data-bay-card="help">
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">{tt("求助")}</span>
            <span className="min-w-0 truncate text-[14px] font-semibold text-stone-800">{item.title}</span>
          </span>
          {item.summary ? (
            <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-stone-500">{item.summary}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-stone-800">{priceText(tt, item.price)}</span>
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
        {category ? <span className="rounded-md border border-stone-200 px-1.5 py-0.5">{category}</span> : null}
        <span>{item.status === "open" || item.status === "draft" ? tt("等人接住") : tt("已被接住")}</span>
        {item.has_attached_work ? <AttachedWorkBadge /> : null}
      </span>
      <CardFooter item={item} extra={null} />
    </button>
  );
}
