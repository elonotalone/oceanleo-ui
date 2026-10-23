"use client";

import { CollectionItemCard, CollectionItemRow, CollectionItemList } from "./collection-items";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  installApp,
  marketAppOpenUrl,
  openMarketApp,
  uninstallApp,
  type MarketApp,
} from "../lib/app-market";
import { capabilityImageThumbUrl } from "../lib/app-capability-image";
import { useUI } from "../i18n/ui/useUI";
import { LibraryToolbar } from "./LibraryLayout";
import {
  CollectionCardGrid,
  CollectionFilterRow,
  CollectionFilterSelect,
  type CollectionView,
  type CollectionViewOption,
} from "./collection-chrome";

export { marketAppOpenUrl as appMarketOpenUrl };

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
  /** 页头左侧（Manus：小标题与搜索同一行）。 */
  toolbarLeading?: ReactNode;
  /** 搜索行下方（Playground 把分区 tab 放这里）。 */
  belowToolbar?: ReactNode;
  viewOptions?: CollectionViewOption[];
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function marketAppImage(app: MarketApp): string {
  const icon = app.icon.trim();
  if (/^https?:\/\//i.test(icon)) return icon;
  return capabilityImageThumbUrl(app.site_id, app.app_key);
}

function matchesQuery(app: MarketApp, query: string): boolean {
  const needle = normalized(query);
  if (!needle) return true;
  return normalized(
    [app.name, app.tagline, app.category, app.site_id, ...app.scenes].join(" "),
  ).includes(needle);
}

function MarketIcon({ app }: { app: MarketApp }) {
  const image = marketAppImage(app);
  if (image) {
    return (
      <img
        src={image}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
      />
    );
  }
  return <span aria-hidden="true">{app.icon.trim() || "✦"}</span>;
}

function MarketInstallButton({
  app,
  accent,
  pending,
  confirmUninstall,
  onToggle,
}: {
  app: MarketApp;
  accent: string;
  pending: boolean;
  confirmUninstall: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const tt = useUI();
  return (
    <button
      type="button"
      data-market-app-install={app.app_id}
      onClick={onToggle}
      disabled={pending}
      className={`relative z-[2] shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:cursor-wait disabled:opacity-60 ${
        app.installed
          ? "border border-stone-200 bg-white text-stone-600"
          : "text-white"
      }`}
      style={!app.installed ? { background: accent } : undefined}
    >
      {pending
        ? tt("处理中…")
        : app.installed && confirmUninstall
          ? tt("从工作台移除")
          : app.installed
            ? tt("已在工作台 ✓")
            : tt("＋ 加入工作台")}
    </button>
  );
}

function MarketSkeleton({ view }: { view: CollectionView }) {
  const tiles = Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className={
            view === "list"
              ? "h-16 animate-pulse rounded-xl bg-stone-100"
              : "overflow-hidden rounded-xl border border-stone-100"
          }
        >
          {view === "list" ? null : (
            <>
              <div className="aspect-video animate-pulse bg-stone-100" />
              <div className="h-8 bg-white" />
            </>
          )}
        </div>
  ));
  return view === "list" ? (
    <div data-app-market-loading className="flex flex-col gap-2" aria-label="正在加载应用市场">
      {tiles}
    </div>
  ) : (
    <CollectionCardGrid data-app-market-loading aria-label="正在加载应用市场">
      {tiles}
    </CollectionCardGrid>
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
  toolbarLeading,
  belowToolbar,
  viewOptions,
}: AppMarketProps) {
  const tt = useUI();
  const [view, setView] = useState<CollectionView>("grid");
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
    openMarketApp(app);
  }

  async function toggleInstalled(event: MouseEvent<HTMLButtonElement>, app: MarketApp) {
    event.stopPropagation();
    if (pendingAppId) return;

    if (app.installed && confirmUninstallId !== app.app_id) {
      setConfirmUninstallId(app.app_id);
      setNotice({
        kind: "success",
        text: tt("从工作台移除"),
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
          ? tt("已放入工作台 ✓")
          : tt("从工作台移除"),
      });
    } catch (requestError) {
      onInstalledChange(app.app_id, !nextInstalled);
      if (isMarketAuthError(requestError)) {
        setNotice({
          kind: "auth",
          text: tt("请先登录"),
        });
        onRequestLogin?.();
      } else {
        setNotice({
          kind: "error",
          text: tt("操作失败"),
        });
      }
    } finally {
      setPendingAppId("");
    }
  }

  return (
    <section data-app-market data-app-market-total={total} aria-busy={loading}>
      <LibraryToolbar
        search={query}
        setSearch={(value) =>
          onQueryChange(typeof value === "function" ? value(query) : value)
        }
        view={view}
        setView={setView}
        placeholder={tt("搜一搜，例如：简历")}
        tt={tt}
        leading={toolbarLeading}
        viewOptions={viewOptions}
      />
      <span className="sr-only">{tt("搜索应用")}</span>
      <CollectionFilterRow data-app-market-scenes="">
        {belowToolbar}
        <CollectionFilterSelect
          label={tt("场景")}
          name="scene"
          value={scene}
          options={scenes.map((option) => ({
            value: option.scene,
            label: option.scene,
            count: option.count,
          }))}
          onChange={onSceneChange}
          allLabel={tt("全部")}
        />
        {siteIds.length > 1 ? (
          <div data-app-market-sites>
            <CollectionFilterSelect
              label={tt("站点")}
              name="site"
              value={siteId}
              options={siteIds.map((option) => ({
                value: option,
                label: option,
              }))}
              onChange={onSiteChange}
              allLabel={tt("全部")}
              searchable={siteIds.length > 8}
            />
          </div>
        ) : null}
      </CollectionFilterRow>

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
        <MarketSkeleton view={view} />
      ) : (() => {
        const Container = view === "list" ? CollectionItemList : CollectionCardGrid;
        const Item = view === "list" ? CollectionItemRow : CollectionItemCard;
        return <Container>{visibleItems.map((app) => {
          const install = <MarketInstallButton app={app} accent={accent} pending={pendingAppId === app.app_id}
            confirmUninstall={confirmUninstallId === app.app_id} onToggle={(event) => void toggleInstalled(event, app)} />;
          return <Item key={app.app_id} containerProps={{ "data-market-app": app.app_id }} openProps={{ "data-market-app-open": true }}
            title={app.name} metadata={app.tagline || app.category || undefined} onOpen={() => openApp(app)} openLabel={tt("打开 {name}", { name: app.name })}
            cover={<span className="grid h-full w-full place-items-center text-[28px] text-stone-500"><MarketIcon app={app} /></span>}
            actions={view === "list" ? install : undefined}
            floatingActions={view === "grid" ? <div className="absolute right-2 top-2">{install}</div> : undefined} />;
        })}</Container>;
      })()}

      {!loading && !error && visibleItems.length === 0 && (
        <p data-app-market-empty className="py-12 text-center text-[13px] text-stone-400">
          {tt("没有匹配的 app，换个词试试")}
        </p>
      )}
    </section>
  );
}
