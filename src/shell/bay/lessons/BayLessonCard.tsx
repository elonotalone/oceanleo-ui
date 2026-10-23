"use client";

// 课程栏一张课：封面、名称、简介、作者、节数、价格、评分、已售。点开进详情。
import { useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayLesson } from "../../../lib/bay/lessons";
import { formatBayMoney } from "../../../lib/bay/services";
import { ledgerCurrency } from "../../../lib/money";
import { CollectionItemCard, CollectionItemRow } from "../../collection-items";
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

export function BayLessonCard({ lesson, view = "grid" }: { lesson: BayLesson; view?: "grid" | "list" }): ReactElement {
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

  const Item = view === "list" ? CollectionItemRow : CollectionItemCard;
  return (
    <Item
      containerProps={{ "data-bay-lesson-card": lesson.id }}
      title={lesson.title}
      cover={<>
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
      </>}
      metadata={<>
        {author ? <span>{author} · </span> : null}{tt("{n} 节", { n: chapters })} · {price}{rating ? ` · ${rating}` : ""}{sold > 0 ? ` · ${tt("已售 {n}", { n: sold })}` : ""}{lesson.summary ? ` · ${lesson.summary}` : ""}
      </>}
      onOpen={() => openBay({ kind: "lesson", id: lesson.id })}
    />
  );
}
