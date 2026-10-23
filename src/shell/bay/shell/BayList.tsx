"use client";

// LeoBay 页的信息流部件：搜索、出售/求购下拉 + 种类下拉（两边都有种类）、站点下拉（含专业咨询）、信息流本体。
// 整行读起来是「出售 ⌄ · 人工服务 ⌄ · 全部站点 ⌄」。LeoBay 只有 `/bay` 这一张页（见 LeoBayPage），不在 LeoChat 小窗里。
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionCardGrid, CollectionInfiniteSentinel } from "../../collection-chrome";
import type { BayCategory } from "../../../lib/bay/types";
import { CollectionItemList } from "../../collection-items";
import { rememberPublishListing } from "../form/publish-listing";
import { BayCategoryIcon } from "./bay-icons";
import {
  BAY_ADVICE_ZONE,
  BAY_SELL_KINDS,
  BAY_SELL_KIND_LABEL,
  canonicalBayFeedKind,
  isBaySellKind,
  stripLeoCategoryPrefix,
  type BaySellKind,
} from "./bay-links";
import { FeedCard, targetForFeedItem } from "./BayFeedItemCard";
import { BayFilterSelect, type BayFilterOption } from "./BayFilterSelect";
import {
  openBay,
  requireBayLogin,
  setBayFilter,
  useBaySignedIn,
  type BayFeedFilter,
  type BayTarget,
} from "./bay-state";
import { useBayCategories, useBayFeed } from "./use-bay-data";

export { targetForFeedItem };

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_MAX_LENGTH = 60;

/** 页头的展示与收藏状态。货架通过显式 view 属性接收展示状态。 */
export type BayListingChromeValue = {
  view: "grid" | "list";
  favoritesOnly: boolean;
};

export const BayListingChromeContext = createContext<BayListingChromeValue>({
  view: "grid",
  favoritesOnly: false,
});

/** 类目名：接口名去掉开头的 Leo，中英文同一套（Slides、Website）。「其他」在词典里有译文；非中文界面查不到词条时用接口的英文名。 */
export function useBayCategoryName(): (category: Pick<BayCategory, "name_zh" | "name_en" | "slug">) => string {
  const tt = useUI();
  const locale = useLocale();
  return (category) => {
    const translated = tt(category.name_zh);
    const raw = translated !== category.name_zh || locale.startsWith("zh") ? translated : category.name_en || category.name_zh || category.slug;
    return stripLeoCategoryPrefix(raw);
  };
}

export function startPostNeed(category?: string): void {
  if (!requireBayLogin()) return;
  openBay(category ? { kind: "post-need", category } : { kind: "post-need" });
}

export function startPublish(category?: string, feedKind?: string): void {
  if (!requireBayLogin()) return;
  const feed = canonicalBayFeedKind(feedKind);
  if (feed === "request") {
    openBay(category && category !== BAY_ADVICE_ZONE ? { kind: "post-need", category } : { kind: "post-need" });
    return;
  }
  const listing = feed === "app" ? "app" : feed === "lesson" ? "lesson" : feed === "other" ? "other" : feed === "asset" ? "digital" : "service";
  rememberPublishListing(listing);
  openBay(category && category !== BAY_ADVICE_ZONE ? { kind: "publish", category } : { kind: "publish" });
}

export function startPublishApp(): void {
  if (!requireBayLogin()) return;
  rememberPublishListing("app");
  openBay({ kind: "publish" });
}

export function startPublishLesson(): void {
  if (!requireBayLogin()) return;
  rememberPublishListing("lesson");
  openBay({ kind: "publish" });
}

export function startServiceEditor(): void {
  startPublish();
}

export function openMine(): void {
  if (!requireBayLogin()) return;
  openBay({ kind: "mine", tab: "published" });
}

export function activeFeedKey(target: BayTarget): string | null {
  if (target.kind === "demand" || target.kind === "service" || target.kind === "help" || target.kind === "consult") {
    return `${target.kind}:${target.id}`;
  }
  return null;
}

/** 没有搜索词、没有站点：种类本身是下拉里选的，不算「筛选」，空了也没有可清的东西。 */
function isDefaultFilter(filter: BayFeedFilter): boolean {
  return !filter.category && !filter.q;
}

// ---- 搜索 ---------------------------------------------------------------------

/**
 * 搜索框里的字：停手 350ms 才真正去筛，回车立刻筛。
 * 筛选在别处被改掉（比如点了「清除筛选」）时跟着变；自己打出来的尾部空格不会被吃掉。
 */
export function useBaySearchText(filter: BayFeedFilter): { text: string; change: (value: string) => void; commit: (value: string) => void } {
  const [text, setText] = useState(filter.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    const committed = filter.q ?? "";
    setText((current) => (current.trim().slice(0, SEARCH_MAX_LENGTH) === committed ? current : committed));
  }, [filter.q]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const commit = useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setBayFilter({ ...filterRef.current, q: value });
  }, []);

  const change = useCallback(
    (value: string) => {
      const next = value.slice(0, SEARCH_MAX_LENGTH);
      setText(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => commit(next), SEARCH_DEBOUNCE_MS);
    },
    [commit],
  );

  return { text, change, commit };
}

// ---- 种类 ---------------------------------------------------------------------

type IntentValue = "sell" | "buy";

/**
 * 顶栏两个下拉：「出售 / 求购」和「种类」（人工服务 / 现成文件 / 网站与软件服务 / 课程 / 其他）。
 * 出售改种类会换栏（人工服务信息流 / 现成文件 / 网站与软件服务 / 课程 / 其他）；求购改种类只改 offer，不离开 request。
 * 从出售切到求购时带上当前出售种类；从求购切回出售时回到上次卖的种类，没有就是人工服务。
 * 键盘与读屏由 BayFilterSelect 负责（方向键、Home/End、Enter、Esc；listbox + option）。
 */
export function BayViewSwitch({ filter }: { filter: BayFeedFilter; accent?: string }) {
  const tt = useUI();
  const value = canonicalBayFeedKind(filter.kind);
  const lastSellRef = useRef<BaySellKind>(isBaySellKind(value) ? value : "service");
  if (isBaySellKind(value)) lastSellRef.current = value;
  const selling = value !== "request";
  const sellKind = isBaySellKind(value) ? value : lastSellRef.current;
  // 求购栏的种类只看筛选里的 offer：显示的永远是真正在取的那一类。
  const wantedKind: BaySellKind = filter.offer && isBaySellKind(filter.offer) ? filter.offer : "service";
  const typeValue = selling ? sellKind : wantedKind;
  const intentOptions = useMemo<BayFilterOption[]>(
    () => [
      { value: "sell", label: tt("出售") },
      { value: "buy", label: tt("求购") },
    ],
    [tt],
  );
  const kindOptions = useMemo<BayFilterOption[]>(
    () => BAY_SELL_KINDS.map((kind) => ({ value: kind, label: tt(BAY_SELL_KIND_LABEL[kind]) })),
    [tt],
  );

  const applySell = (kind: BaySellKind) => {
    lastSellRef.current = kind;
    setBayFilter({
      ...filter,
      kind,
      category: kind !== "service" && filter.category === BAY_ADVICE_ZONE ? undefined : filter.category,
    });
  };

  const applyWanted = (offer: BaySellKind) => {
    setBayFilter({
      ...filter,
      kind: "request",
      offer,
      category: offer !== "service" && filter.category === BAY_ADVICE_ZONE ? undefined : filter.category,
    });
  };

  return (
    <div data-bay-view className="inline-flex shrink-0 items-center gap-2">
      <div data-bay-browse-intent={selling ? "sell" : "buy"}>
        <BayFilterSelect
          label={tt("出售还是求购")}
          name="intent"
          value={selling ? "sell" : "buy"}
          options={intentOptions}
          onChange={(next) => {
            const intent = next as IntentValue;
            if (intent === "sell") applySell(selling ? sellKind : lastSellRef.current);
            else if (intent === "buy") applyWanted(selling ? sellKind : wantedKind);
          }}
        />
      </div>
      <div data-bay-browse-kind>
        <BayFilterSelect
          label={tt("种类")}
          name="kind"
          value={typeValue}
          options={kindOptions}
          onChange={(next) => {
            if (!isBaySellKind(next)) return;
            if (selling) applySell(next);
            else applyWanted(next);
          }}
        />
      </div>
    </div>
  );
}

// ---- 类目 ---------------------------------------------------------------------

/**
 * 人工服务 / 其他 / 求购栏的「站点」下拉：选项是交付类目，人工服务栏末尾多一条「专业咨询」。
 * 选「全部站点」清掉 category。「全部」自带名词，按键上不会只剩一个光秃秃的「全部」。
 */
export function BayCategorySelect({
  filter,
  onPicked,
}: {
  filter: BayFeedFilter;
  accent?: string;
  onPicked?: () => void;
}) {
  const tt = useUI();
  const name = useBayCategoryName();
  const { categories } = useBayCategories();
  const options = useMemo<BayFilterOption[]>(() => {
    const rows: BayFilterOption[] = categories.map((category) => ({
      value: category.slug,
      label: name(category),
      icon: <BayCategoryIcon name={category.icon} className="h-3.5 w-3.5 shrink-0" />,
    }));
    if (canonicalBayFeedKind(filter.kind) === "service") {
      rows.push({
        value: BAY_ADVICE_ZONE,
        label: tt("专业咨询"),
        icon: <BayCategoryIcon name="advice" className="h-3.5 w-3.5 shrink-0" />,
      });
    }
    return rows;
  }, [categories, filter.kind, name, tt]);

  return (
    <div data-bay-categories="select">
      <BayFilterSelect
        label={tt("站点")}
        name="category"
        value={filter.category ?? ""}
        options={options}
        onChange={(next) => {
          setBayFilter({ ...filter, category: next || undefined });
          onPicked?.();
        }}
        allLabel={tt("全部站点")}
        searchable
      />
    </div>
  );
}

/** 旧导出名：归属外若还在 import，渲染同一个站点下拉，避免去改别人的文件。 */
export function BayCategoryChips(props: {
  filter: BayFeedFilter;
  accent?: string;
  onPicked?: () => void;
}) {
  return <BayCategorySelect {...props} />;
}

// ---- 信息流 --------------------------------------------------------------------

const QUIET_BUTTON =
  "rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50";

function FeedSkeleton({ variant }: { variant: "list" | "grid" }) {
  const tt = useUI();
  if (variant === "grid") {
    return (
      <CollectionCardGrid role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-feed-loading>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} aria-hidden="true" className="overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]">
            <div className="aspect-video animate-pulse bg-[var(--surface,#f5f5f4)]" />
            <div className="p-2.5">
              <div className="h-3 w-2/3 rounded bg-stone-100" />
            </div>
          </div>
        ))}
      </CollectionCardGrid>
    );
  }
  return (
    <CollectionItemList role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-feed-loading>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} aria-hidden="true" className="border-b border-black/5 px-3 py-3 dark:border-white/10">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-black/5 dark:bg-white/10" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-black/5 dark:bg-white/10" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-black/5 dark:bg-white/10" />
        </div>
      ))}
    </CollectionItemList>
  );
}

/** 信息流本体。list：一行一条（浮窗）；grid：卡片网格（/bay 页）。空列表不摆提示、不摆发布。 */
export function BayFeed({
  filter,
  activeKey,
  variant = "list",
  favoritesOnly = false,
  favoriteKeys = null,
  onClearFavorites,
}: {
  filter: BayFeedFilter;
  activeKey: string | null;
  variant?: "list" | "grid";
  favoritesOnly?: boolean;
  favoriteKeys?: ReadonlySet<string> | null;
  onClearFavorites?: () => void;
}) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const feed = useBayFeed(filter, signedIn);
  const grid = variant === "grid";
  const items = useMemo(() => {
    if (!favoritesOnly) return feed.items;
    if (!favoriteKeys) return [];
    return feed.items.filter((item) => favoriteKeys.has(`${item.kind}:${item.id}`));
  }, [favoriteKeys, favoritesOnly, feed.items]);

  const waitingFavorites = favoritesOnly && favoriteKeys == null;
  const firstLoad = (feed.loading && feed.items.length === 0) || waitingFavorites;
  const errorText = items.length === 0 && !feed.loading && !waitingFavorites ? feed.error : null;
  const empty = feed.loaded && !feed.loading && !feed.error && items.length === 0 && !waitingFavorites;
  const pristine = isDefaultFilter(filter) && !favoritesOnly;

  return (
    <div data-bay-feed={variant}>
      {items.length > 0 ? (
        grid ? (
        <CollectionCardGrid>
          {items.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const active = key === activeKey;
            return (
              <div
                key={key}
                data-bay-feed-item={item.kind}
                data-bay-feed-active={active ? "true" : undefined}
                className="min-w-0"
              >
                <FeedCard item={item} variant="card" />
              </div>
            );
          })}
        </CollectionCardGrid>
        ) : (
        <CollectionItemList>
          {items.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const active = key === activeKey;
            return (
              <div
                key={key}
                data-bay-feed-item={item.kind}
                data-bay-feed-active={active ? "true" : undefined}
                className={active ? "bg-black/[0.045] dark:bg-white/[0.06]" : undefined}
              >
                <FeedCard item={item} variant="row" />
              </div>
            );
          })}
        </CollectionItemList>
        )
      ) : null}
      {firstLoad ? <FeedSkeleton variant={variant} /> : null}
      {errorText ? (
        <div className="flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-feed-error>
          <p className="text-[13px] text-neutral-500">{tt(errorText)}</p>
          <button type="button" onClick={feed.retry} className={`mt-3 ${QUIET_BUTTON}`}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {empty ? (
        <div data-bay-empty={pristine ? "pristine" : "filtered"}>
          {pristine ? null : (
            <div className={`flex flex-col items-center px-4 text-center ${grid ? "py-16" : "py-10"}`}>
              <button
                type="button"
                onClick={() => {
                  // 只清搜索词和站点；种类（以及求购的 offer）是下拉里选的，留在原处。
                  setBayFilter({ ...filter, category: undefined, q: undefined });
                  onClearFavorites?.();
                }}
                className={QUIET_BUTTON}
                data-bay-clear-filters
              >
                {tt("清除筛选")}
              </button>
            </div>
          )}
        </div>
      ) : null}
      {feed.hasMore || (feed.loading && items.length > 0) ? (
        <div data-bay-feed-more="" className={grid ? "mt-3" : undefined}>
          <CollectionInfiniteSentinel
            active={feed.hasMore && !feed.loading}
            loading={feed.loading && items.length > 0}
            onLoadMore={feed.loadMore}
          />
        </div>
      ) : null}
    </div>
  );
}
