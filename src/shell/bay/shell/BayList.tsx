"use client";

// LeoBay 页的信息流部件：搜索、卖/买两档（卖的一侧用种类下拉）、站点下拉（含专业咨询）、信息流本体。
// LeoBay 只有 `/bay` 这一张页（见 LeoBayPage），不在 LeoChat 小窗里。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
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
  return canonicalBayFeedKind(filter.kind) === "service" && !filter.category && !filter.q;
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

const INTENT_TAB =
  "whitespace-nowrap px-3.5 py-1.5 text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

/**
 * 顶栏两档：我想要卖 / 我想要买。卖的一侧底下「种类」下拉切服务、素材、作品、课程。
 * 点买落到 request；点卖且当前是 request 时回到上次卖的种类，没有则 service。
 * 选中的那一档用站点主色填满（没给主色用黑色）。
 */
export function BayViewSwitch({ filter, accent }: { filter: BayFeedFilter; accent?: string }) {
  const tt = useUI();
  const value = canonicalBayFeedKind(filter.kind);
  const lastSellRef = useRef<SellFeedKind>(isSellKind(value) ? value : "service");
  if (isSellKind(value)) lastSellRef.current = value;
  const selling = value !== "request";
  const sellKind = isSellKind(value) ? value : lastSellRef.current;

  const applyKind = (kind: BayFeedKind) => {
    if (isSellKind(kind)) lastSellRef.current = kind;
    setBayFilter({
      ...filter,
      kind,
      category: kind !== "service" && filter.category === BAY_ADVICE_ZONE ? undefined : filter.category,
    });
  };

  return (
    <div
      role="tablist"
      aria-label={tt("看别人在卖还是在买")}
      data-bay-view
      className="inline-flex shrink-0 items-center gap-2"
    >
      <div className="inline-flex overflow-hidden rounded-lg bg-stone-100">
        <button
          type="button"
          role="tab"
          aria-selected={selling}
          data-bay-browse-intent="sell"
          onClick={() => applyKind(selling ? value : lastSellRef.current)}
          style={selling ? { background: accent || "#111113" } : undefined}
          className={`${INTENT_TAB} ${selling ? "font-medium text-white" : "text-stone-600 hover:bg-stone-200 hover:text-stone-900"}`}
        >
          {tt("我想要卖")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!selling}
          data-bay-browse-intent="buy"
          onClick={() => applyKind("request")}
          style={!selling ? { background: accent || "#111113" } : undefined}
          className={`${INTENT_TAB} ${!selling ? "font-medium text-white" : "text-stone-600 hover:bg-stone-200 hover:text-stone-900"}`}
        >
          {tt("我想要买")}
        </button>
      </div>
      {selling ? (
        <label data-bay-browse-kind className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-stone-600">
          <span>{tt("种类")}</span>
          <select
            aria-label={tt("种类")}
            value={sellKind}
            onChange={(event) => {
              const next = event.target.value;
              if (isSellKind(next)) applyKind(next);
            }}
            className="cursor-pointer rounded-lg bg-stone-100 px-2 py-1.5 text-[13px] text-stone-700 outline-none"
          >
            {SELL_FEED_KINDS.map((kind) => (
              <option key={kind} value={kind} data-view={kind}>
                {tt(SELL_KIND_LABEL[kind])}
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
  accent,
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
        accent={accent}
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

function FeedCard({ item, variant }: { item: BayFeedItem; variant: BayFeedCardVariant }) {
  const onOpen = () => openBay(targetForFeedItem(item));
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-feed-loading>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} aria-hidden="true" className="h-44 animate-pulse rounded-xl border border-stone-200 bg-white p-4">
            <div className="h-4 w-14 rounded bg-stone-100" />
            <div className="mt-4 h-4 w-2/3 rounded bg-stone-100" />
            <div className="mt-3 h-3 w-full rounded bg-stone-100" />
            <div className="mt-2 h-3 w-4/5 rounded bg-stone-100" />
          </div>
        ))}
      </div>
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
}: {
  filter: BayFeedFilter;
  activeKey: string | null;
  variant?: "list" | "grid";
}) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const feed = useBayFeed(filter, signedIn);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const grid = variant === "grid";

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !feed.hasMore || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) feed.loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [feed.hasMore, feed.loadMore]);

  const firstLoad = feed.loading && feed.items.length === 0;
  const errorText = feed.items.length === 0 && !feed.loading ? feed.error : null;
  const empty = feed.loaded && !feed.loading && !feed.error && feed.items.length === 0;
  const pristine = isDefaultFilter(filter);

  return (
    <div data-bay-feed={variant}>
      {feed.items.length > 0 ? (
        <div className={grid ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : undefined}>
          {feed.items.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const active = key === activeKey;
            return (
              <div
                key={key}
                data-bay-feed-item={item.kind}
                data-bay-feed-active={active ? "true" : undefined}
                className={grid ? "flex min-w-0" : active ? "bg-black/[0.045] dark:bg-white/[0.06]" : undefined}
              >
                <FeedCard item={item} variant={grid ? "card" : "row"} />
              </div>
            );
          })}
        </div>
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
              <button type="button" onClick={() => setBayFilter({ kind: "service" })} className={QUIET_BUTTON} data-bay-clear-filters>
                {tt("清除筛选")}
              </button>
            </div>
          )}
        </div>
      ) : null}
      {feed.hasMore ? (
        <div ref={sentinel} className={grid ? "mt-3 flex justify-center" : undefined}>
          <button
            type="button"
            onClick={feed.loadMore}
            className={
              grid
                ? QUIET_BUTTON
                : "block w-full px-3 py-2.5 text-center text-[12px] text-black/45 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-black/[0.03] dark:text-white/45 dark:hover:bg-white/[0.04]"
            }
          >
            {feed.loading ? tt("正在加载…") : tt("加载更多")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
