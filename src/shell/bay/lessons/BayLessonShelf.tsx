"use client";

// LeoBay「课程」栏的货架：课程与套餐的卡片网格。组件名与 props 是合同，不许改。
// 「课程」页签先排站点开的课，再接卖家按「课程」发布的条目（信息流 listing_kind=lesson），同一张网格；两边都空才显示空态。
import { useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionCardGrid, CollectionInfiniteSentinel } from "../../collection-chrome";
import { CollectionItemList } from "../../collection-items";
import { FeedCard } from "../shell/BayFeedItemCard";
import { BayBundleCard } from "./BayBundleCard";
import { BayLessonCard } from "./BayLessonCard";
import { useBayLessonBundles, useBayLessons } from "./use-bay-lessons";
import { useBaySignedIn, type BayFeedFilter } from "../shell/bay-state";
import { useBayFeed } from "../shell/use-bay-data";

export interface BayLessonShelfProps {
  filter: BayFeedFilter;
  siteKey: string;
  accent: string;
  view?: "grid" | "list";
}

const QUIET_BUTTON =
  "rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50";
type LessonTab = "lesson" | "bundle";

function ShelfSkeleton({ view }: { view: "grid" | "list" }): ReactElement {
  const tt = useUI();
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;
  return (
    <Items role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-lesson-loading>
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

function LessonGrid({ filter, siteKey, view = "grid" }: BayLessonShelfProps): ReactElement {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const feed = useBayLessons(filter, siteKey);
  const posted = useBayFeed(filter, signedIn, { listingKind: "lesson" });
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;

  const count = feed.items.length + posted.items.length;
  const busy = feed.loading || posted.loading;
  const failure = feed.error || posted.error;
  const firstLoad = busy && count === 0;
  const empty = !feed.loading && !feed.error && feed.items.length === 0 && posted.loaded && !posted.loading && !posted.error && posted.items.length === 0;
  const hasMore = feed.hasMore || posted.hasMore;

  return (
    <>
      {count > 0 ? (
        <Items>
          {feed.items.map((lesson) => (
            <div key={lesson.id} className="min-w-0">
              <BayLessonCard lesson={lesson} view={view} />
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
        <div className="flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-lesson-error>
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
      {empty ? <div data-bay-lesson-empty /> : null}
      {hasMore || (busy && count > 0) ? (
        <div data-bay-lesson-more="" className="mt-3">
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
    </>
  );
}

function BundleGrid({ filter, view = "grid" }: { filter: BayFeedFilter; view?: "grid" | "list" }): ReactElement {
  const tt = useUI();
  const feed = useBayLessonBundles(filter);
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;

  const firstLoad = feed.loading && feed.items.length === 0;
  const empty = !feed.loading && !feed.error && feed.items.length === 0;

  return (
    <>
      {feed.items.length > 0 ? (
        <Items>
          {feed.items.map((bundle) => (
            <div key={bundle.id} className="min-w-0">
              <BayBundleCard bundle={bundle} view={view} />
            </div>
          ))}
        </Items>
      ) : null}
      {firstLoad ? <ShelfSkeleton view={view} /> : null}
      {feed.error ? (
        <div className="flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-lesson-error>
          <p className="text-[13px] text-neutral-500">{tt(feed.error)}</p>
          <button type="button" onClick={feed.reload} className={`mt-3 ${QUIET_BUTTON}`}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {empty ? <div data-bay-lesson-empty /> : null}
      {feed.hasMore || (feed.loading && feed.items.length > 0) ? (
        <div data-bay-lesson-more="" className="mt-3">
          <CollectionInfiniteSentinel
            active={feed.hasMore && !feed.loading}
            loading={feed.loading && feed.items.length > 0}
            onLoadMore={feed.loadMore}
          />
        </div>
      ) : null}
    </>
  );
}

export function BayLessonShelf({ filter, siteKey, accent, view = "grid" }: BayLessonShelfProps): ReactElement {
  const tt = useUI();
  const [tab, setTab] = useState<LessonTab>("lesson");

  return (
    <div data-bay-lesson-shelf>
      <div
        role="tablist"
        aria-label={tt("课程")}
        data-bay-lesson-tab={tab}
        className="mb-4 inline-flex shrink-0 items-center overflow-hidden rounded-lg bg-stone-100"
      >
        {(["lesson", "bundle"] as const).map((kind) => {
          const active = kind === tab;
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={active}
              data-tab={kind}
              onClick={() => setTab(kind)}
              style={active ? { background: accent || "#111113" } : undefined}
              className={`whitespace-nowrap px-3.5 py-1.5 text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
                active ? "font-medium text-white" : "text-stone-600 hover:bg-stone-200 hover:text-stone-900"
              }`}
            >
              {tt(kind === "lesson" ? "课程" : "套餐")}
            </button>
          );
        })}
      </div>
      {tab === "lesson" ? <LessonGrid filter={filter} siteKey={siteKey} accent={accent} view={view} /> : <BundleGrid filter={filter} view={view} />}
    </div>
  );
}
