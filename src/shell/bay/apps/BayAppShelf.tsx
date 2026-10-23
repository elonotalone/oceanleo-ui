"use client";

// LeoBay「作品」栏的货架：卡片网格。本文件归 U1 单元；组件名与 props 是合同，不许改。
import { type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionCardGrid, CollectionInfiniteSentinel } from "../../collection-chrome";
import { CollectionItemList } from "../../collection-items";
import { rememberBayAppEntry } from "../appinsights/app-source";
import { shelfOpenEntry } from "../appinsights/insights-model";
import { BayAppCard } from "./BayAppCard";
import { useBayApps } from "./use-bay-apps";
import type { BayFeedFilter } from "../shell/bay-state";

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
  const feed = useBayApps(filter, siteKey);
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;

  const firstLoad = feed.loading && feed.items.length === 0;
  const empty = !feed.loading && !feed.error && feed.items.length === 0;

  return (
    <div data-bay-app-shelf>
      {feed.items.length > 0 ? (
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
        </Items>
      ) : null}
      {firstLoad ? <ShelfSkeleton view={view} /> : null}
      {feed.error ? (
        <div className="flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-app-error>
          <p className="text-[13px] text-neutral-500">{tt(feed.error)}</p>
          <button type="button" onClick={feed.reload} className={`mt-3 ${QUIET_BUTTON}`}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {empty ? <div data-bay-app-empty /> : null}
      {feed.hasMore || (feed.loading && feed.items.length > 0) ? (
        <div data-bay-app-more="" className="mt-3">
          <CollectionInfiniteSentinel
            active={feed.hasMore && !feed.loading}
            loading={feed.loading && feed.items.length > 0}
            onLoadMore={feed.loadMore}
          />
        </div>
      ) : null}
    </div>
  );
}
