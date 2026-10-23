"use client";

// 课程栏一张套餐：封面、名称、简介、含几门课、套餐价、划掉的单买合计、省多少。点开进详情。
import { useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayLessonBundle } from "../../../lib/bay/lessons";
import { formatBayMoney } from "../../../lib/bay/services";
import { ledgerCurrency } from "../../../lib/money";
import { CollectionItemCard, CollectionItemRow } from "../../collection-items";
import { openBay } from "../shell/bay-state";
import { bundleSaving, lessonPriceLabel } from "./lesson-format";

function httpsCover(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const text = url.trim();
  return text.startsWith("https://") ? text : null;
}

function titleInitial(title: string): string {
  return Array.from(title.trim())[0] || "?";
}

function money(fen: number): string {
  return formatBayMoney(fen, ledgerCurrency());
}

export function BayBundleCard({ bundle, view = "grid" }: { bundle: BayLessonBundle; view?: "grid" | "list" }): ReactElement {
  const tt = useUI();
  const cover = httpsCover(bundle.cover_url);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [cover]);
  const showCover = Boolean(cover) && !broken;
  const lessonCount = Array.isArray(bundle.lessons) ? bundle.lessons.length : 0;
  const priceRaw = lessonPriceLabel(bundle.price_fen, money);
  const price = priceRaw === "免费" ? tt("免费") : priceRaw;
  const totalFen = Number.isFinite(bundle.lessons_total_fen) ? Number(bundle.lessons_total_fen) : 0;
  const saving = bundleSaving(bundle);
  const totalLabel = totalFen > 0 ? money(totalFen) : "";

  const Item = view === "list" ? CollectionItemRow : CollectionItemCard;
  return (
    <Item
      containerProps={{ "data-bay-bundle-card": bundle.id }}
      title={bundle.title}
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
            {titleInitial(bundle.title)}
          </span>
        )}
      </>}
      metadata={<>
        {tt("含 {n} 门课", { n: lessonCount })} · {price}{totalLabel ? <> · <span className="line-through">{totalLabel}</span></> : null}{saving > 0 ? ` · ${tt("省 {amount}", { amount: money(saving) })}` : ""}{bundle.summary ? ` · ${bundle.summary}` : ""}
      </>}
      onOpen={() => openBay({ kind: "bundle", id: bundle.id })}
    />
  );
}
