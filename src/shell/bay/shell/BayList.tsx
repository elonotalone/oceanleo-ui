"use client";

// LeoBay 页的信息流部件：搜索、出售/求购两档（两边都有种类）、站点下拉（含专业咨询）、信息流本体。
// LeoBay 只有 `/bay` 这一张页（见 LeoBayPage），不在 LeoChat 小窗里。
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionCardGrid, CollectionInfiniteSentinel } from "../../collection-chrome";
import type { BayCategory, BayFeedItem } from "../../../lib/bay/types";
import { DemandCard, HelpRequestCard } from "../needs";
import { ConsultCard, ServiceCard } from "../supply";
import { rememberPublishListing } from "../form/publish-listing";
import { BayCategoryIcon } from "./bay-icons";
import { BAY_ADVICE_ZONE, BAY_FEED_KINDS, canonicalBayFeedKind, stripLeoCategoryPrefix, type BayFeedKind } from "./bay-links";
import { BayFilterSelect, type BayFilterOption } from "./BayFilterSelect";
import {
  openBay,
  requireBayLogin,
  setBayFilter,
  useBaySignedIn,
  type BayFeedFilter,
  type BayTarget,
} from "./bay-state";
import type { BayFeedCardVariant } from "./feed-card-ui";
import { useBayCategories, useBayFeed } from "./use-bay-data";

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_MAX_LENGTH = 60;

/** 页头网格/列表与「仅看收藏」：货架卡读这里，因为 App/Lesson 货架 props 不是本单元的文件。 */
export type BayListingChromeValue = {
  view: "grid" | "list";
  favoritesOnly: boolean;
};

export const BayListingChromeContext = createContext<BayListingChromeValue>({
  view: "grid",
  favoritesOnly: false,
});

export function targetForFeedItem(item: BayFeedItem): BayTarget {
  return { kind: item.kind, id: item.id };
}

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
  const listing = feed === "app" ? "app" : feed === "lesson" ? "lesson" : feed === "asset" ? "digital" : "service";
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

function isDefaultFilter(filter: BayFeedFilter): boolean {
  const kind = canonicalBayFeedKind(filter.kind);
  if (filter.category || filter.q) return false;
  if (kind === "request") return !filter.offer || filter.offer === "service";
  return kind === "service";
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

type SellFeedKind = Exclude<BayFeedKind, "request">;

const SELL_FEED_KINDS = BAY_FEED_KINDS.filter((kind): kind is SellFeedKind => kind !== "request");

const SELL_KIND_LABEL: Record<SellFeedKind, string> = {
  service: "服务",
  asset: "素材",
  app: "作品",
  lesson: "课程",
};

function isSellKind(kind: string): kind is SellFeedKind {
  return kind !== "request" && (SELL_FEED_KINDS as readonly string[]).includes(kind);
}

const INTENT_PILL =
  "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-neutral-900 px-3 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

/**
 * 顶栏两档：出售 / 求购。两边都有「种类」。
 * 出售改种类会换栏（服务信息流 / 素材库 / 作品 / 课程）；求购改种类只改 offer，不离开 request。
 * 点求购时带上当前出售种类；点出售且当前是 request 时回到上次卖的种类。
 */
export function BayViewSwitch({ filter }: { filter: BayFeedFilter; accent?: string }) {
  const tt = useUI();
  const value = canonicalBayFeedKind(filter.kind);
  const lastSellRef = useRef<SellFeedKind>(isSellKind(value) ? value : "service");
  const lastWantedRef = useRef<SellFeedKind>(filter.offer && isSellKind(filter.offer) ? filter.offer : "service");
  if (isSellKind(value)) lastSellRef.current = value;
  if (value === "request" && filter.offer && isSellKind(filter.offer)) lastWantedRef.current = filter.offer;
  const selling = value !== "request";
  const sellKind = isSellKind(value) ? value : lastSellRef.current;
  const wantedKind = filter.offer && isSellKind(filter.offer) ? filter.offer : lastWantedRef.current;
  const typeValue = selling ? sellKind : wantedKind;
  const kindOptions = useMemo<BayFilterOption[]>(
    () => SELL_FEED_KINDS.map((kind) => ({ value: kind, label: tt(SELL_KIND_LABEL[kind]) })),
    [tt],
  );

  const applySell = (kind: SellFeedKind) => {
    lastSellRef.current = kind;
    setBayFilter({
      ...filter,
      kind,
      category: kind !== "service" && filter.category === BAY_ADVICE_ZONE ? undefined : filter.category,
    });
  };

  const applyWanted = (offer: SellFeedKind) => {
    lastWantedRef.current = offer;
    setBayFilter({
      ...filter,
      kind: "request",
      offer,
      category: offer !== "service" && filter.category === BAY_ADVICE_ZONE ? undefined : filter.category,
    });
  };

  return (
    <div
      role="tablist"
      aria-label={tt("出售还是求购")}
      data-bay-view
      className="inline-flex shrink-0 items-center gap-2"
    >
      <button
        type="button"
        role="tab"
        aria-selected={selling}
        data-bay-browse-intent="sell"
        onClick={() => applySell(selling ? sellKind : lastSellRef.current)}
        className={`${INTENT_PILL} ${selling ? "bg-neutral-900 text-white" : "bg-white text-neutral-900"}`}
      >
        {tt("出售")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!selling}
        data-bay-browse-intent="buy"
        onClick={() => applyWanted(selling ? sellKind : wantedKind)}
        className={`${INTENT_PILL} ${!selling ? "bg-neutral-900 text-white" : "bg-white text-neutral-900"}`}
      >
        {tt("求购")}
      </button>
      <div data-bay-browse-kind>
        <BayFilterSelect
          label={tt("种类")}
          name="kind"
          value={typeValue}
          options={kindOptions}
          onChange={(next) => {
            if (!isSellKind(next)) return;
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
 * 服务 / 需求栏的「站点」下拉：选项是交付类目，服务栏末尾多一条「专业咨询」。
 * 选「全部」清掉 category。形态从原来会换行的小标签改成 BayFilterSelect。
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
        allLabel={tt("全部")}
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

function httpsCover(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const text = url.trim();
  return text.startsWith("https://") ? text : null;
}

function titleInitial(title: string): string {
  return Array.from(title.trim())[0] || "?";
}

const LIBRARY_CARD_CLASS =
  "group relative w-full overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:-translate-y-0.5 hover:border-[var(--border-strong,#d6d3d1)] hover:shadow-sm";

/** 网格态：Library `WorkspaceCard` 的 4:3 封面 + 12px 标题。列表仍走原来的四种行卡。 */
function FeedLibraryCard({ item }: { item: BayFeedItem }) {
  const cover = httpsCover(item.cover_url);
  return (
    <button
      type="button"
      data-bay-card={item.kind}
      data-bay-card-variant="card"
      data-bay-id={item.id}
      onClick={() => openBay(targetForFeedItem(item))}
      className={LIBRARY_CARD_CLASS}
    >
      <span className="relative block aspect-[4/3] overflow-hidden bg-[var(--surface,#f5f5f4)]">
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-[var(--leo-dur-4)] ease-[var(--leo-ease-standard)] group-hover:scale-[1.02]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[15px] font-semibold text-stone-400">
            {titleInitial(item.title)}
          </span>
        )}
      </span>
      <span className="block p-2.5">
        <span className="line-clamp-1 text-[12px] font-semibold leading-snug text-[var(--fg,#292524)]">{item.title}</span>
      </span>
    </button>
  );
}

function FeedCard({ item, variant }: { item: BayFeedItem; variant: BayFeedCardVariant }) {
  const onOpen = () => openBay(targetForFeedItem(item));
  if (variant === "card") return <FeedLibraryCard item={item} />;
  if (item.kind === "demand") return <DemandCard item={item} onOpen={onOpen} variant={variant} />;
  if (item.kind === "help") return <HelpRequestCard item={item} onOpen={onOpen} variant={variant} />;
  if (item.kind === "service") return <ServiceCard item={item} onOpen={onOpen} variant={variant} />;
  return <ConsultCard item={item} onOpen={onOpen} variant={variant} />;
}

const QUIET_BUTTON =
  "rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50";

function FeedSkeleton({ variant }: { variant: "list" | "grid" }) {
  const tt = useUI();
  if (variant === "grid") {
    return (
      <CollectionCardGrid role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-feed-loading>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} aria-hidden="true" className="overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]">
            <div className="aspect-[4/3] animate-pulse bg-[var(--surface,#f5f5f4)]" />
            <div className="p-2.5">
              <div className="h-3 w-2/3 rounded bg-stone-100" />
            </div>
          </div>
        ))}
      </CollectionCardGrid>
    );
  }
  return (
    <div role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-feed-loading>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} aria-hidden="true" className="border-b border-black/5 px-3 py-3 dark:border-white/10">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-black/5 dark:bg-white/10" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-black/5 dark:bg-white/10" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-black/5 dark:bg-white/10" />
        </div>
      ))}
    </div>
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
                className="flex min-w-0"
              >
                <FeedCard item={item} variant="card" />
              </div>
            );
          })}
        </CollectionCardGrid>
        ) : (
        <div>
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
        </div>
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
                  const kind = canonicalBayFeedKind(filter.kind);
                  setBayFilter(kind === "request" ? { kind: "request" } : { kind: "service" });
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
