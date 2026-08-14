"use client";

import { useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import {
  installApp,
  uninstallApp,
  type MarketApp,
} from "../lib/app-market";
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
  const openPath = app.open_path.trim();
  if (!openPath) return siteUrl;
  try {
    const base = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
    return new URL(openPath, base).toString();
  } catch {
    return `${siteUrl.replace(/\/+$/, "")}/${openPath.replace(/^\/+/, "")}`;
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

function isMarketAuthError(error: unknown): boolean {
  return error instanceof Error && error.name === "MarketAuthError";
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
  onInstalledChange,
  onRetry,
  onRequestLogin,
}: AppMarketProps) {
  const tt = useUI();
  const [pendingAppId, setPendingAppId] = useState("");
  const [confirmUninstallId, setConfirmUninstallId] = useState("");
  const [notice, setNotice] = useState<{
    kind: "success" | "error" | "auth";
    text: string;
  } | null>(null);
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

  async function toggleInstalled(event: MouseEvent<HTMLButtonElement>, app: MarketApp) {
    event.stopPropagation();
    if (pendingAppId) return;

    if (app.installed && confirmUninstallId !== app.app_id) {
      setConfirmUninstallId(app.app_id);
      setNotice({
        kind: "success",
        text: tt("再点一次「确认卸掉」，才会从「我的」移除。"),
      });
      return;
    }

    const nextInstalled = !app.installed;
    setConfirmUninstallId("");
    setPendingAppId(app.app_id);
    setNotice(null);
    onInstalledChange(app.app_id, nextInstalled);
    try {
      if (nextInstalled) await installApp(app.app_id);
      else await uninstallApp(app.app_id);
      setNotice({
        kind: "success",
        text: nextInstalled
          ? tt("已经装到「我的」。")
          : tt("已从「我的」移除。"),
      });
    } catch (requestError) {
      onInstalledChange(app.app_id, !nextInstalled);
      if (isMarketAuthError(requestError)) {
        setNotice({
          kind: "auth",
          text: tt("登录后才能装到「我的」，请先登录。"),
        });
        onRequestLogin?.();
      } else {
        setNotice({
          kind: "error",
          text: nextInstalled
            ? tt("没装上，请稍后再试；刚才的状态已恢复。")
            : tt("没能移除，请稍后再试；刚才的状态已恢复。"),
        });
      }
    } finally {
      setPendingAppId("");
    }
  }

  return (
    <section data-app-market aria-busy={loading}>
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

      <div data-app-market-scenes className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[12px] font-medium text-stone-500">{tt("按场景看")}</span>
        {scenes.map((option) => {
          const selected = scene === option.scene;
          return (
            <button
              key={option.scene}
              type="button"
              aria-pressed={selected}
              onClick={() => onSceneChange(selected ? "" : option.scene)}
              className={`rounded-full px-3 py-1.5 text-[12px] transition ${
                selected
                  ? "font-medium text-white shadow-sm"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200/80"
              }`}
              style={selected ? { background: accent } : undefined}
            >
              {option.scene} <span className={selected ? "text-white/75" : "text-stone-400"}>{option.count}</span>
            </button>
          );
        })}
      </div>

      {siteIds.length > 1 && (
        <details data-app-market-sites className="mb-4 rounded-xl border border-stone-200/80 bg-white/70">
          <summary className="cursor-pointer select-none px-3 py-2 text-[12px] text-stone-500">
            {siteId
              ? tt("站点：{site}", { site: siteId })
              : tt("按站点筛选（默认全部）")}
          </summary>
          <div className="flex flex-wrap gap-2 border-t border-stone-100 px-3 py-3">
            <button
              type="button"
              aria-pressed={!siteId}
              onClick={() => onSiteChange("")}
              className={`rounded-lg px-2.5 py-1 text-[12px] ${
                !siteId ? "font-medium text-white" : "bg-stone-100 text-stone-600"
              }`}
              style={!siteId ? { background: accent } : undefined}
            >
              {tt("全部站点")}
            </button>
            {siteIds.map((option) => {
              const selected = siteId === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSiteChange(selected ? "" : option)}
                  className={`rounded-lg px-2.5 py-1 text-[12px] ${
                    selected ? "font-medium text-white" : "bg-stone-100 text-stone-600"
                  }`}
                  style={selected ? { background: accent } : undefined}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </details>
      )}

      {notice && (
        <div
          data-app-market-notice={notice.kind}
          role="status"
          className={`mb-4 rounded-xl border px-3 py-2 text-[12px] ${
            notice.kind === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : notice.kind === "auth"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {error && items.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          <span>{error}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="shrink-0 font-medium underline">
              {tt("再试一次")}
            </button>
          )}
        </div>
      )}

      {error && !items.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
          <p className="text-[13px] text-amber-800">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-lg bg-amber-800 px-3 py-1.5 text-[12px] font-medium text-white"
            >
              {tt("再试一次")}
            </button>
          )}
        </div>
      ) : loading && !items.length ? (
        <MarketSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((app) => (
            <article
              key={app.app_id}
              data-market-app={app.app_id}
              className="group relative flex min-h-48 flex-col rounded-2xl border border-stone-200/80 bg-white/85 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
            >
              <button
                type="button"
                data-market-app-open
                onClick={() => openApp(app)}
                aria-label={tt("打开 {name}", { name: app.name })}
                className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2"
                style={{ "--tw-ring-color": accent } as CSSProperties}
              />
              <div className="flex items-start gap-3">
                <span
                  className="pointer-events-none relative z-[1] grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl text-xl"
                  style={{ background: `${accent}16`, color: accent }}
                >
                  <MarketIcon app={app} />
                </span>
                <div className="pointer-events-none relative z-[1] min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold text-stone-900">{app.name}</h3>
                  <p className="mt-0.5 truncate text-[11px] text-stone-400">{app.site_id}</p>
                </div>
                <button
                  type="button"
                  data-market-app-install={app.app_id}
                  onClick={(event) => void toggleInstalled(event, app)}
                  disabled={pendingAppId === app.app_id}
                  className={`relative z-[2] shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                    app.installed
                      ? "border border-stone-200 bg-white text-stone-600"
                      : "text-white"
                  }`}
                  style={!app.installed ? { background: accent } : undefined}
                >
                  {pendingAppId === app.app_id
                    ? tt("处理中…")
                    : app.installed && confirmUninstallId === app.app_id
                      ? tt("确认卸掉")
                      : app.installed
                        ? tt("已装")
                        : tt("装到我的")}
                </button>
              </div>
              <p className="pointer-events-none relative z-[1] mt-3 line-clamp-2 text-[13px] leading-relaxed text-stone-500">
                {app.tagline}
              </p>
              <div className="pointer-events-none relative z-[1] mt-auto flex flex-wrap gap-1.5 pt-4">
                {app.scenes.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-stone-100 px-2 py-1 text-[11px] text-stone-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </article>
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
