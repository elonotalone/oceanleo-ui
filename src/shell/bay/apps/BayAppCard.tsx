"use client";

// 作品栏一张卡：封面、名称、简介、作者、域名、打开次数。点开进详情。
import { useEffect, useState, type ReactElement } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayApp } from "../../../lib/bay/apps";
import { FEED_TILE_CLASS, FEED_TILE_PILL_CLASS, FEED_TILE_SUMMARY_CLASS } from "../shell/feed-card-ui";
import { openBay } from "../shell/bay-state";

function httpsCover(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const text = url.trim();
  return text.startsWith("https://") ? text : null;
}

function titleInitial(title: string): string {
  return Array.from(title.trim())[0] || "?";
}

export function BayAppCard({ app }: { app: BayApp }): ReactElement {
  const tt = useUI();
  const locale = useLocale();
  const cover = httpsCover(app.cover_url);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [cover]);
  const showCover = Boolean(cover) && !broken;
  const author = app.author?.display_name?.trim() || "";
  const official = app.author?.official === true;
  const linkOnly = app.source_kind !== "hosted" || app.embed_ok === false;
  const opens = new Intl.NumberFormat(locale, { notation: "compact", compactDisplay: "short" }).format(
    Number.isFinite(app.open_count) ? app.open_count : 0,
  );

  return (
    <button
      type="button"
      data-bay-app-card={app.id}
      onClick={() => openBay({ kind: "app", id: app.id })}
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
            {titleInitial(app.title)}
          </span>
        )}
        <span className={`absolute right-2 top-2 ${FEED_TILE_PILL_CLASS}`}>{linkOnly ? tt("跳转") : tt("页内可用")}</span>
      </span>
      <span className="mt-3 truncate text-[15px] font-semibold leading-snug tracking-tight text-stone-900">
        {app.title}
      </span>
      {app.summary ? <span className={FEED_TILE_SUMMARY_CLASS}>{app.summary}</span> : null}
      <span className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-3 text-[12px] text-stone-500">
        <span className="min-w-0 truncate font-medium text-stone-700">
          {author}
          {official ? (
            <span className="ml-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
              {tt("官方")}
            </span>
          ) : null}
        </span>
        {app.url_host ? <span className="min-w-0 truncate text-stone-400">{app.url_host}</span> : null}
        <span className="tabular-nums text-stone-400">{opens}</span>
      </span>
    </button>
  );
}
