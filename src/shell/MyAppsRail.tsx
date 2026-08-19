"use client";

import { useEffect, useState } from "react";
import {
  listMyApps,
  uninstallApp,
  type MarketApp,
} from "../lib/app-market";
import { useUI } from "../i18n/ui/useUI";

/** “我的应用”统一回到主站应用市场，并直接表达要打开“我的”视图。 */
export const MY_APPS_MARKET_HREF =
  "https://oceanleo.com/playground?tab=app&view=mine";

const SIDEBAR_APP_LIMIT = 8;

function isAuthError(error: unknown): boolean {
  return error instanceof Error && error.name === "MarketAuthError";
}

export function sortMyApps(apps: MarketApp[]): MarketApp[] {
  return apps
    .map((app, index) => ({ app, index }))
    .sort(
      (left, right) =>
        left.app.sort_order - right.app.sort_order || left.index - right.index,
    )
    .map(({ app }) => app);
}

/** `site_url + open_path`，同时收掉两侧重复的斜杠。 */
export function marketAppOpenHref(
  app: Pick<MarketApp, "site_url" | "open_path">,
): string {
  const siteUrl = app.site_url.trim();
  const openPath = app.open_path.trim();
  if (!openPath) return siteUrl;
  if (!siteUrl) return openPath;
  return `${siteUrl.replace(/\/+$/, "")}/${openPath.replace(/^\/+/, "")}`;
}

export interface MyAppsRailProps {
  /**
   * 外壳已有登录事实时传入：false 立即整块隐藏；未传时以 `listMyApps()` 的
   * MarketAuthError 为准，不另造一套登录状态。
   */
  signedIn?: boolean;
  marketHref?: string;
}

type LoadState = "hidden" | "loading" | "ready" | "error";

export function MyAppsRail({
  signedIn,
  marketHref = MY_APPS_MARKET_HREF,
}: MyAppsRailProps) {
  const tt = useUI();
  const [apps, setApps] = useState<MarketApp[]>([]);
  const [loadState, setLoadState] = useState<LoadState>(
    signedIn === false ? "hidden" : "loading",
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (signedIn === false) {
      setApps([]);
      setLoadState("hidden");
      setActionError("");
      return;
    }

    let alive = true;
    setLoadState("loading");
    setActionError("");
    listMyApps()
      .then((items) => {
        if (!alive) return;
        setApps(sortMyApps(items));
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setApps([]);
        setLoadState(isAuthError(error) ? "hidden" : "error");
      });

    return () => {
      alive = false;
    };
  }, [reloadKey, signedIn]);

  async function removeApp(app: MarketApp) {
    const confirmed = window.confirm(
      `${tt("确定从「我的应用」移除")}「${app.name}」？`,
    );
    if (!confirmed) return;

    setActionError("");
    setApps((current) => current.filter((item) => item.app_id !== app.app_id));
    try {
      await uninstallApp(app.app_id);
    } catch {
      setApps((current) =>
        current.some((item) => item.app_id === app.app_id)
          ? current
          : sortMyApps([...current, app]),
      );
      setActionError(tt("移除失败，应用已经放回来了，请重试。"));
    }
  }

  if (loadState === "hidden") return null;

  const rootClass = "mx-2 mt-2 rounded-xl border border-neutral-200/80 bg-white/70 p-2";

  if (loadState === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label={tt("正在加载我的应用")}
        className={rootClass}
        data-my-apps-loading
        data-my-apps-rail="sidebar"
      >
        <div className="mb-2 h-3 w-20 animate-pulse rounded bg-stone-200" />
        <div className="space-y-1.5">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-9 animate-pulse rounded-xl bg-stone-100"
            />
          ))}
        </div>
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section
        className={rootClass}
        data-my-apps-error
        data-my-apps-rail="sidebar"
      >
        <p className="text-[13px] text-stone-600">
          {tt("我的应用暂时加载失败。")}
        </p>
        <button
          type="button"
          className="mt-2 text-[12px] font-medium text-stone-800 underline underline-offset-2"
          data-my-apps-retry
          onClick={() => setReloadKey((value) => value + 1)}
        >
          {tt("重试")}
        </button>
      </section>
    );
  }

  // 没装过应用就整块不出现。曾经这里有一句「还没有装过应用。去应用市场看看」——
  // 办公站的空白位置不该被一句无事可做的话占着，用户装了应用它自己会出来。
  if (apps.length === 0) return null;

  const shownApps = apps.slice(0, SIDEBAR_APP_LIMIT);

  return (
    <section
      className={rootClass}
      data-my-apps-rail="sidebar"
      data-my-apps-state="ready"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold text-neutral-700">
          {tt("我的应用")}
        </h2>
      </div>

      {actionError && (
        <p
          className="mb-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700"
          role="alert"
        >
          {actionError}
        </p>
      )}

      <div className="space-y-1">
        {shownApps.map((app) => (
          <article
            className="group relative rounded-lg hover:bg-neutral-100"
            data-my-apps-item={app.app_id}
            key={app.app_id}
          >
            <a
              className="flex min-w-0 items-center gap-2 px-2 py-1.5 pr-9"
              data-my-apps-open
              href={marketAppOpenHref(app)}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span
                aria-hidden="true"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-stone-100 text-[14px]"
              >
                {app.icon || "◻"}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-medium text-stone-800">
                  {app.name}
                </span>
              </span>
            </a>
            <button
              aria-label={`${tt("从我的应用移除")}：${app.name}`}
              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md text-[14px] text-stone-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              data-my-apps-remove={app.app_id}
              onClick={() => void removeApp(app)}
              title={tt("移除")}
              type="button"
            >
              ×
            </button>
          </article>
        ))}
      </div>

      {apps.length > SIDEBAR_APP_LIMIT && (
        <a
          className="mt-2 flex items-center justify-center rounded-lg px-2 py-1.5 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          data-my-apps-market
          href={marketHref}
        >
          {tt("查看全部")}（{apps.length}）→
        </a>
      )}
    </section>
  );
}
