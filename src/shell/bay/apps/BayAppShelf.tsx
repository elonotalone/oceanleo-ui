"use client";

// LeoBay「网站与软件服务」栏的货架：卡片网格。组件名与 props 是合同，不许改。
// 先排站点上架来的应用与网站（bay_apps），再接卖家按「网站与软件服务」发布的条目（信息流 listing_kind=app），
// 同一张网格 / 同一种卡片；两边都空才显示空态。
import { type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionCardGrid, CollectionInfiniteSentinel } from "../../collection-chrome";
import { CollectionItemList } from "../../collection-items";
import { rememberBayAppEntry } from "../appinsights/app-source";
import { shelfOpenEntry } from "../appinsights/insights-model";
import { FeedCard } from "../shell/BayFeedItemCard";
import { BayAppCard } from "./BayAppCard";
import { useBayApps } from "./use-bay-apps";
import { useBaySignedIn, type BayFeedFilter } from "../shell/bay-state";
import { useBayFeed } from "../shell/use-bay-data";

export interface BayAppShelfProps {
  filter: BayFeedFilter;
  siteKey: string;
  accent: string;
  view?: "grid" | "list";
}

const QUIET_BUTTON =
  "rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50";
function ShelfSkeleton({ view }: { view: "grid" | "list" }): ReactElement {
  const tt = useUI();
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;
  return (
    <Items role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-app-loading>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} aria-hidden="true" className={view === "list" ? "h-16 animate-pulse bg-white px-4 py-3" : "h-44 animate-pulse rounded-xl border border-stone-200 bg-white p-4"}>
          <div className="h-4 w-14 rounded bg-stone-100" />
          <div className="mt-4 h-4 w-2/3 rounded bg-stone-100" />
          <div className="mt-3 h-3 w-full rounded bg-stone-100" />
          <div className="mt-2 h-3 w-4/5 rounded bg-stone-100" />
        </div>
      ))}
    </Items>
  );
}

export function BayAppShelf({ filter, siteKey, view = "grid" }: BayAppShelfProps): ReactElement {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const feed = useBayApps(filter, siteKey);
  const posted = useBayFeed(filter, signedIn, { listingKind: "app" });
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;

  const count = feed.items.length + posted.items.length;
  const busy = feed.loading || posted.loading;
  const failure = feed.error || posted.error;
  const firstLoad = busy && count === 0;
  const empty = !feed.loading && !feed.error && feed.items.length === 0 && posted.loaded && !posted.loading && !posted.error && posted.items.length === 0;
  const hasMore = feed.hasMore || posted.hasMore;

  return (
    <div data-bay-app-shelf>
      {count > 0 ? (
        <Items>
          {feed.items.map((app) => (
            <div
              key={app.id}
              className="min-w-0"
              onClickCapture={() => rememberBayAppEntry(app.id, shelfOpenEntry(filter, app))}
            >
              <BayAppCard app={app} view={view} />
            </div>
          ))}
          {posted.items.map((item) => (
            <div key={`${item.kind}:${item.id}`} className="min-w-0" data-bay-posted-item={item.kind}>
              <FeedCard item={item} variant={view === "list" ? "row" : "card"} />
            </div>
          ))}
        </Items>
      ) : null}
      {firstLoad ? <ShelfSkeleton view={view} /> : null}
      {failure ? (
        <div className="flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-app-error>
          <p className="text-[13px] text-neutral-500">{tt(failure)}</p>
          <button
            type="button"
            onClick={() => {
              if (feed.error) feed.reload();
              if (posted.error) posted.retry();
            }}
            className={`mt-3 ${QUIET_BUTTON}`}
          >
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {empty ? <div data-bay-app-empty /> : null}
      {hasMore || (busy && count > 0) ? (
        <div data-bay-app-more="" className="mt-3">
          <CollectionInfiniteSentinel
            active={hasMore && !busy}
            loading={busy && count > 0}
            onLoadMore={() => {
              if (feed.hasMore) feed.loadMore();
              if (posted.hasMore) posted.loadMore();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
