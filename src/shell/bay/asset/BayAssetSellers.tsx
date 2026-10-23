"use client";

// 现成文件 · 来源「卖家在售」：卖家按「现成文件」发布的条目（信息流 listing_kind=digital）。
// 与别的来源同一种卡片 / 列表行、同一套加载与空态；点开进这一条的详情（买了就拿到文件）。
import { useMemo, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionCardGrid, CollectionInfiniteSentinel } from "../../collection-chrome";
import { CollectionItemList } from "../../collection-items";
import { BayCategoryIcon } from "../shell/bay-icons";
import { useBaySignedIn } from "../shell/bay-state";
import { FeedCard } from "../shell/BayFeedItemCard";
import { BayFilterSelect, type BayFilterOption } from "../shell/BayFilterSelect";
import { useBayCategoryName } from "../shell/BayList";
import { useBayCategories, useBayFeed } from "../shell/use-bay-data";

/** 卖家在售的「站点」下拉：选项是交付类目；选「全部站点」清掉。 */
export function BayAssetSellerSite({ value, onChange }: { value: string; onChange: (next: string) => void }): ReactElement {
  const tt = useUI();
  const name = useBayCategoryName();
  const { categories } = useBayCategories();
  const options = useMemo<BayFilterOption[]>(
    () =>
      categories.map((category) => ({
        value: category.slug,
        label: name(category),
        icon: <BayCategoryIcon name={category.icon} className="h-3.5 w-3.5 shrink-0" />,
      })),
    [categories, name],
  );
  return (
    <BayFilterSelect
      label={tt("站点")}
      name="seller-site"
      value={value}
      options={options}
      onChange={onChange}
      allLabel={tt("全部站点")}
      searchable
    />
  );
}

const QUIET_BUTTON =
  "rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50";

export function BayAssetSellers({
  query,
  category,
  view = "grid",
}: {
  query: string;
  category: string;
  view?: "grid" | "list";
}): ReactElement {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const feed = useBayFeed({ kind: "asset", q: query || undefined, category: category || undefined }, signedIn, {
    listingKind: "digital",
  });
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;
  const firstLoad = feed.loading && feed.items.length === 0;
  const errorText = feed.items.length === 0 && !feed.loading ? feed.error : null;
  const empty = feed.loaded && !feed.loading && !feed.error && feed.items.length === 0;

  return (
    <div className="mt-5" data-bay-asset-sellers>
      {feed.items.length > 0 ? (
        <Items data-bay-asset-grid>
          {feed.items.map((item) => (
            <div key={`${item.kind}:${item.id}`} className="min-w-0" data-bay-asset-seller-item={item.id}>
              <FeedCard item={item} variant={view === "list" ? "row" : "card"} />
            </div>
          ))}
        </Items>
      ) : null}
      {firstLoad ? (
        <Items role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-asset-loading>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} aria-hidden="true" className={view === "list" ? "h-16 animate-pulse bg-stone-100" : "aspect-video animate-pulse rounded-xl border border-stone-200 bg-stone-100"} />
          ))}
        </Items>
      ) : null}
      {errorText ? (
        <div className="flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-asset-error>
          <p className="text-[13px] text-neutral-500">{tt(errorText)}</p>
          <button type="button" onClick={feed.retry} className={`mt-3 ${QUIET_BUTTON}`}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {empty ? <div data-bay-asset-empty /> : null}
      {feed.hasMore || (feed.loading && feed.items.length > 0) ? (
        <div data-bay-asset-more="" className="mt-3">
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
