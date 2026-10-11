"use client";

// 课程栏一张课：封面、名称、简介、作者、节数、价格、评分、已售。点开进详情。
import { useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayLesson } from "../../../lib/bay/lessons";
import { formatBayMoney } from "../../../lib/bay/services";
import { ledgerCurrency } from "../../../lib/money";
import { FEED_TILE_CLASS, FEED_TILE_PILL_CLASS, FEED_TILE_SUMMARY_CLASS } from "../shell/feed-card-ui";
import { openBay } from "../shell/bay-state";
import { lessonPriceLabel, ratingLabel } from "./lesson-format";

function httpsCover(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const text = url.trim();
  return text.startsWith("https://") ? text : null;
}

function titleInitial(title: string): string {
  return Array.from(title.trim())[0] || "?";
}

export function BayLessonCard({ lesson }: { lesson: BayLesson }): ReactElement {
  const tt = useUI();
  const cover = httpsCover(lesson.cover_url);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [cover]);
  const showCover = Boolean(cover) && !broken;
  const author = lesson.author?.display_name?.trim() || "";
  const priceRaw = lessonPriceLabel(lesson.price_fen, (fen) => formatBayMoney(fen, ledgerCurrency()));
  const price = priceRaw === "免费" ? tt("免费") : priceRaw;
  const rating = ratingLabel(lesson.rating_avg, lesson.rating_count);
  const chapters = Number.isFinite(lesson.chapter_count) ? lesson.chapter_count : 0;
  const sold = Number.isFinite(lesson.sales_count) ? lesson.sales_count : 0;

  return (
    <button
      type="button"
      data-bay-lesson-card={lesson.id}
      onClick={() => openBay({ kind: "lesson", id: lesson.id })}
      className={FEED_TILE_CLASS}
    >
      <span className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-stone-100">
        {showCover ? (
          <img
            src={cover ?? ""}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[15px] font-semibold text-stone-400">
            {titleInitial(lesson.title)}
          </span>
        )}
      </span>
      <span className="mt-3 truncate text-[15px] font-semibold leading-snug tracking-tight text-stone-900">
        {lesson.title}
      </span>
      {lesson.summary ? <span className={FEED_TILE_SUMMARY_CLASS}>{lesson.summary}</span> : null}
      <span className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-3 text-[12px] text-stone-500">
        {author ? <span className="min-w-0 truncate font-medium text-stone-700">{author}</span> : null}
        <span className={FEED_TILE_PILL_CLASS}>{tt("{n} 节", { n: chapters })}</span>
        <span className="font-semibold text-stone-800">{price}</span>
        {rating ? <span className="tabular-nums text-stone-500">{rating}</span> : null}
        {sold > 0 ? <span className="tabular-nums text-stone-400">{tt("已售 {n}", { n: sold })}</span> : null}
      </span>
    </button>
  );
}
