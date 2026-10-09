"use client";

// LeoBay 页的信息流部件：搜索、种类（全部 / 素材 / 服务 / 需求 / 答疑）、类目、信息流本体。
// LeoBay 只有 `/bay` 这一张页（见 LeoBayPage），不在 LeoChat 小窗里。
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayCategory, BayFeedItem } from "../../../lib/bay/types";
import { DemandCard, HelpRequestCard } from "../needs";
import { ConsultCard, ServiceCard } from "../supply";
import { BayCategoryIcon, BayIcon } from "./bay-icons";
import { BAY_FEED_KINDS } from "./bay-links";
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

const KIND_LABELS: Readonly<Record<(typeof BAY_FEED_KINDS)[number], string>> = {
  all: "全部",
  material: "素材",
  demand: "需求",
  service: "服务",
  help: "求助",
  consult: "答疑",
};

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_MAX_LENGTH = 60;
const KIND_TABS = ["all", "material", "service", "demand", "consult"] as const;

export function targetForFeedItem(item: BayFeedItem): BayTarget {
  return { kind: item.kind, id: item.id };
}

/** 类目名：先查 17 种语言的词条；非中文界面查不到时用接口的英文名。 */
export function useBayCategoryName(): (category: Pick<BayCategory, "name_zh" | "name_en" | "slug">) => string {
  const tt = useUI();
  const locale = useLocale();
  return (category) => {
    const translated = tt(category.name_zh);
    if (translated !== category.name_zh || locale.startsWith("zh")) return translated;
    return category.name_en || category.name_zh || category.slug;
  };
}

export function startPostNeed(category?: string): void {
  if (!requireBayLogin()) return;
  openBay(category ? { kind: "post-need", category } : { kind: "post-need" });
}

export function startServiceEditor(): void {
  if (!requireBayLogin()) return;
  openBay({ kind: "service-editor" });
}

export function openMine(): void {
  if (!requireBayLogin()) return;
  openBay({ kind: "mine", tab: "needs" });
}

export function activeFeedKey(target: BayTarget): string | null {
  if (target.kind === "demand" || target.kind === "service" || target.kind === "help" || target.kind === "consult") {
    return `${target.kind}:${target.id}`;
  }
  return null;
}

function isDefaultFilter(filter: BayFeedFilter): boolean {
  return (filter.kind ?? "all") === "all" && !filter.category && !filter.q;
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

/**
 * 种类（全部 / 素材 / 服务 / 需求 / 答疑）：跟我的库分类同一套小标签。
 * 选中的那一个用站点主色填满（没给主色用黑色）。
 */
export function BayKindTabs({ filter, accent }: { filter: BayFeedFilter; accent?: string; variant?: "page" }) {
  const tt = useUI();
  const value = filter.kind ?? "all";
  return (
    <div role="tablist" aria-label={tt("筛选种类")} data-bay-kinds="page" className="flex max-w-full flex-wrap items-center gap-1.5">
      {KIND_TABS.map((kind) => {
        const active = kind === value;
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={active}
            data-kind={kind}
            onClick={() => setBayFilter({ ...filter, kind, category: kind === "material" ? undefined : filter.category })}
            style={active ? { background: accent || "#111113" } : undefined}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
              active ? "font-medium text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900"
            }`}
          >
            {tt(KIND_LABELS[kind])}
          </button>
        );
      })}
    </div>
  );
}

// ---- 类目 ---------------------------------------------------------------------

const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

/**
 * 16 个交付类目，一排会换行的小标签；再点一次取消。摆在种类下面。
 * `accent` 给了就用它填选中的那一个（/bay 页传站点主色），不给用黑色。
 */
export function BayCategoryChips({
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
  const { categories, loading } = useBayCategories();

  if (!loading && categories.length === 0) return null;
  const selectedClass = accent ? "font-medium text-white shadow-sm" : "bg-neutral-900 font-medium text-white shadow-sm";
  const selectedStyle: CSSProperties | undefined = accent ? { background: accent } : undefined;
  return (
    <div role="group" aria-label={tt("类目")} data-bay-categories="chips" className="flex flex-wrap items-center gap-2">
      {loading
        ? Array.from({ length: 8 }).map((_, index) => (
            <span key={index} aria-hidden="true" className="h-7 w-24 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
          ))
        : categories.map((category) => {
            const active = filter.category === category.slug;
            return (
              <button
                key={category.slug}
                type="button"
                aria-pressed={active}
                data-category={category.slug}
                onClick={() => {
                  setBayFilter({ ...filter, category: active ? undefined : category.slug });
                  onPicked?.();
                }}
                className={`${CHIP_BASE} ${
                  active ? selectedClass : "bg-black/5 text-black/70 hover:bg-black/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
                }`}
                style={active ? selectedStyle : undefined}
              >
                <BayCategoryIcon name={category.icon} className="h-3.5 w-3.5 shrink-0" />
                <span>{name(category)}</span>
              </button>
            );
          })}
    </div>
  );
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
  "rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50";

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

/**
 * 信息流本体。list：一行一条（浮窗）；grid：卡片网格（/bay 页）。
 * `emptyAction` 只在「Bay 里一条内容都没有」时出现在说明下面；由调用方决定放什么，
 * 所以同一个按键不会既在顶上又在空状态里各出现一次。
 */
export function BayFeed({
  filter,
  activeKey,
  variant = "list",
  emptyAction,
}: {
  filter: BayFeedFilter;
  activeKey: string | null;
  variant?: "list" | "grid";
  emptyAction?: ReactNode;
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
        <div className={`flex flex-col items-center px-4 text-center ${grid ? "py-16" : "py-10"}`} data-bay-empty={pristine ? "pristine" : "filtered"}>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/5 text-neutral-400 dark:bg-white/10">
            <BayIcon className="h-5 w-5" strokeWidth={1.7} />
          </span>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-neutral-500">
            {pristine ? tt("LeoBay 里还没有内容，发第一条需求或服务吧") : tt("没有符合条件的内容")}
          </p>
          {pristine ? (
            emptyAction ? (
              <div className="mt-4">{emptyAction}</div>
            ) : null
          ) : (
            <button type="button" onClick={() => setBayFilter({ kind: "all" })} className={`mt-4 ${QUIET_BUTTON}`} data-bay-clear-filters>
              {tt("清除筛选")}
            </button>
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
