"use client";

import { useMemo, type CSSProperties, type KeyboardEvent } from "react";
import type { MarketApp } from "../lib/app-market";
import { useUI } from "../i18n/ui/useUI";

export type MarketScene = { scene: string; count: number };

export interface AppMarketProps {
  items: MarketApp[];
  total: number;
  scenes: MarketScene[];
  siteIds: string[];
  loading: boolean;
  error?: string | null;
  query: string;
  scene: string;
  siteId: string;
  accent?: string;
  onQueryChange: (query: string) => void;
  onSceneChange: (scene: string) => void;
  onSiteChange: (siteId: string) => void;
  onInstalledChange: (appId: string, installed: boolean) => void;
  onRetry?: () => void;
  onRequestLogin?: () => void;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** 卡片落点：open_path 为空时回到站点首页，非空时按 URL 规则与 site_url 拼接。 */
export function appMarketOpenUrl(app: Pick<MarketApp, "site_url" | "open_path">): string {
  const siteUrl = app.site_url.trim();
  if (!siteUrl) return "";
  try {
    const base = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
    return new URL(app.open_path.trim() || ".", base).toString();
  } catch {
    const path = app.open_path.trim();
    return `${siteUrl.replace(/\/+$/, "")}${path ? `/${path.replace(/^\/+/, "")}` : ""}`;
  }
}

function matchesQuery(app: MarketApp, query: string): boolean {
  const needle = normalized(query);
  if (!needle) return true;
  return normalized(
    [app.name, app.tagline, app.category, app.site_id, ...app.scenes].join(" "),
  ).includes(needle);
}

function MarketIcon({ app }: { app: MarketApp }) {
  const icon = app.icon.trim();
  if (/^https?:\/\//i.test(icon)) {
    return (
      <img
        src={icon}
        alt=""
        className="h-full w-full rounded-xl object-cover"
        loading="lazy"
      />
    );
  }
  return <span aria-hidden="true">{icon || "✦"}</span>;
}

function MarketSkeleton() {
  return (
    <div
      data-app-market-loading
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="正在加载应用市场"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="h-48 animate-pulse rounded-2xl border border-stone-200/80 bg-white/70 p-4"
        >
          <div className="h-11 w-11 rounded-xl bg-stone-100" />
          <div className="mt-4 h-4 w-2/3 rounded bg-stone-100" />
          <div className="mt-3 h-3 w-full rounded bg-stone-100" />
          <div className="mt-2 h-3 w-4/5 rounded bg-stone-100" />
        </div>
      ))}
    </div>
  );
}

export function AppMarket({
  items,
  total,
  scenes,
  siteIds,
  loading,
  error,
  query,
  scene,
  siteId,
  accent = "#0ea5e9",
  onQueryChange,
  onSceneChange,
  onSiteChange,
}: AppMarketProps) {
  const tt = useUI();
  const visibleItems = useMemo(
    () =>
      items.filter(
        (app) =>
          matchesQuery(app, query) &&
          (!scene || app.scenes.includes(scene)) &&
          (!siteId || app.site_id === siteId),
      ),
    [items, query, scene, siteId],
  );

  function openApp(app: MarketApp) {
    const href = appMarketOpenUrl(app);
    if (href && typeof window !== "undefined") {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  function openOnKeyboard(event: KeyboardEvent<HTMLDivElement>, app: MarketApp) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openApp(app);
  }

  return (
    <section data-app-market>
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-stone-200/80 bg-white/80 p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-stone-900">
            {tt("平台一共有 {count} 个现成的活", { count: total })}
          </h2>
          <p className="mt-1 text-[13px] text-stone-500">
            {tt("跨站搜索，找到后直接装进「我的」。")}
          </p>
        </div>
        <label className="flex min-w-0 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-sm sm:w-80">
          <span aria-hidden="true" className="text-stone-400">
            ⌕
          </span>
          <span className="sr-only">{tt("搜索应用")}</span>
          <input
            data-app-market-search
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={tt("搜一搜，例如：简历")}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-stone-800 outline-none placeholder:text-stone-400"
          />
        </label>
      </div>

      {error && !items.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
          <p className="text-[13px] text-amber-800">{error}</p>
        </div>
      ) : loading && !items.length ? (
        <MarketSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((app) => (
            <div
              key={app.app_id}
              data-market-app={app.app_id}
              role="link"
              tabIndex={0}
              onClick={() => openApp(app)}
              onKeyDown={(event) => openOnKeyboard(event, app)}
              className="group flex min-h-48 cursor-pointer flex-col rounded-2xl border border-stone-200/80 bg-white/85 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2"
              style={{ "--tw-ring-color": accent } as CSSProperties}
            >
              <div className="flex items-start gap-3">
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl text-xl"
                  style={{ background: `${accent}16`, color: accent }}
                >
                  <MarketIcon app={app} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold text-stone-900">{app.name}</h3>
                  <p className="mt-0.5 truncate text-[11px] text-stone-400">{app.site_id}</p>
                </div>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white"
                  style={{ background: accent }}
                >
                  {app.installed ? tt("已装") : tt("装到我的")}
                </button>
              </div>
              <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-stone-500">
                {app.tagline}
              </p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                {app.scenes.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-stone-100 px-2 py-1 text-[11px] text-stone-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && visibleItems.length === 0 && (
        <p data-app-market-empty className="py-12 text-center text-[13px] text-stone-400">
          {tt("没有匹配的 app，换个词试试")}
        </p>
      )}
    </section>
  );
}
