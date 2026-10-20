"use client";

// 作品栏一张卡：网格是 Library 4:3 封面 + 12px 标题；列表接近 WorkspaceListRow。
import { useContext, useEffect, useState, type ReactElement } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayApp } from "../../../lib/bay/apps";
import { BayListingChromeContext } from "../shell/BayList";
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
  const { view } = useContext(BayListingChromeContext);
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
  const thumb = showCover ? (
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
  );

  if (view === "list") {
    return (
      <button
        type="button"
        data-bay-app-card={app.id}
        onClick={() => openBay({ kind: "app", id: app.id })}
        className="flex w-full items-center gap-3 p-2 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,#fafaf9)]"
      >
        <span className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--surface,#f5f5f4)]">{thumb}</span>
        <span className="min-w-0 flex-1 p-2">
          <span className="block truncate text-[12px] font-semibold text-[var(--fg,#292524)]">{app.title}</span>
          {app.summary ? (
            <span className="mt-0.5 block truncate text-[10px] text-[var(--muted,#a8a29e)]">{app.summary}</span>
          ) : (
            <span className="mt-0.5 block truncate text-[10px] text-[var(--muted,#a8a29e)]">
              {author}
              {official ? ` · ${tt("官方")}` : ""}
              {app.url_host ? ` · ${app.url_host}` : ""}
              {` · ${opens}`}
            </span>
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-bay-app-card={app.id}
      onClick={() => openBay({ kind: "app", id: app.id })}
      className="group relative w-full overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:border-[var(--border-strong,#d6d3d1)] hover:shadow-sm"
    >
      <span className="relative block aspect-[4/3] overflow-hidden bg-[var(--surface,#f5f5f4)]">
        {thumb}
        <span className="absolute right-2 top-2 rounded-md bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
          {linkOnly ? tt("跳转") : tt("页内可用")}
        </span>
      </span>
      <span className="block p-2.5">
        <span className="line-clamp-1 text-[12px] font-semibold leading-snug text-[var(--fg,#292524)]">{app.title}</span>
      </span>
    </button>
  );
}
