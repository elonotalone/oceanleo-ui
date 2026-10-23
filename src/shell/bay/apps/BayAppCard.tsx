"use client";

// 网站与软件服务的封面与信息由 Library 共用卡片/列表行呈现。
import { useEffect, useState, type ReactElement } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayApp } from "../../../lib/bay/apps";
import { CollectionItemCard, CollectionItemRow } from "../../collection-items";
import { openBay } from "../shell/bay-state";

function httpsCover(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const text = url.trim();
  return text.startsWith("https://") ? text : null;
}

function titleInitial(title: string): string {
  return Array.from(title.trim())[0] || "?";
}

export function BayAppCard({ app, view = "grid" }: { app: BayApp; view?: "grid" | "list" }): ReactElement {
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

  const Item = view === "list" ? CollectionItemRow : CollectionItemCard;
  return (
    <Item
      containerProps={{ "data-bay-app-card": app.id }}
      title={app.title}
      cover={thumb}
      metadata={<>{author}{official ? ` · ${tt("官方")}` : ""}{app.url_host ? ` · ${app.url_host}` : ""}{` · ${opens}`} · {linkOnly ? tt("跳转") : tt("页内可用")}{app.summary ? ` · ${app.summary}` : ""}</>}
      onOpen={() => openBay({ kind: "app", id: app.id })}
    />
  );
}
