"use client";

// Bay 左栏：发需求 / 叫真人 / 我的、搜索、种类筛选、16 个交付类目卡片、混排信息流（卡片由需求与供给两块渲染）。
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayCategory, BayFeedItem } from "../../../lib/bay/types";
import { DemandCard, HelpRequestCard } from "../needs";
import { ConsultCard, ServiceCard } from "../supply";
import { BayCategoryIcon, BayGlyph, CallHumanIcon } from "./bay-icons";
import { BAY_FEED_KINDS } from "./bay-links";
import { useBaySlideIn } from "./bay-motion";
import {
  openBay,
  requireBayLogin,
  setBayFilter,
  useBayFilter,
  useBaySignedIn,
  useBayState,
  type BayFeedFilter,
  type BayLayout,
  type BayTarget,
} from "./bay-state";
import { useBayCategories, useBayFeed } from "./use-bay-data";

const KIND_LABELS: Readonly<Record<(typeof BAY_FEED_KINDS)[number], string>> = {
  all: "全部",
  demand: "需求",
  service: "服务",
  help: "求助",
  consult: "答疑",
};

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

function ActionButton(props: { label: string; icon: ReactNode; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      data-bay-action={props.testId}
      className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-black/5 px-2 py-1.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
    >
      {props.icon}
      <span className="truncate">{props.label}</span>
    </button>
  );
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

export function BayActions({ filter }: { filter: BayFeedFilter }) {
  const tt = useUI();
  return (
    <div className="flex items-center gap-1.5 px-2 pt-2" data-bay-actions>
      <ActionButton testId="post-need" label={tt("发需求")} icon={<BayGlyph name="plus" className="h-3.5 w-3.5" />} onClick={() => startPostNeed(filter.category)} />
      <ActionButton testId="call-human" label={tt("叫真人")} icon={<CallHumanIcon className="h-3.5 w-3.5" />} onClick={() => openBay({ kind: "call-human" })} />
      <ActionButton testId="mine" label={tt("我的")} icon={<BayGlyph name="mine" className="h-3.5 w-3.5" />} onClick={openMine} />
    </div>
  );
}

export function BaySearch({ filter }: { filter: BayFeedFilter }) {
  const tt = useUI();
  const [text, setText] = useState(filter.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(filter.q ?? "");
  }, [filter.q]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    setBayFilter({ ...filter, q: value });
  };

  return (
    <div className="px-2 pt-2">
      <label className="flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-1.5 text-black/45 dark:bg-white/10 dark:text-white/45">
        <BayGlyph name="search" className="h-3.5 w-3.5 shrink-0" />
        <input
          type="search"
          value={text}
          maxLength={60}
          aria-label={tt("搜索 Bay")}
          placeholder={tt("搜索需求、服务、答疑")}
          onChange={(event) => {
            const value = event.target.value;
            setText(value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => commit(value), 350);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) commit(text);
          }}
          className="min-w-0 flex-1 bg-transparent text-xs text-black outline-none placeholder:text-neutral-400 dark:text-white dark:placeholder:text-neutral-500"
        />
      </label>
    </div>
  );
}

export function BayKindFilters({ filter }: { filter: BayFeedFilter }) {
  const tt = useUI();
  const value = filter.kind ?? "all";
  return (
    <div role="tablist" aria-label={tt("筛选种类")} className="flex gap-1 overflow-x-auto px-2 py-2" data-bay-kinds>
      {BAY_FEED_KINDS.map((kind) => {
        const active = kind === value;
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={active}
            data-kind={kind}
            onClick={() => setBayFilter({ ...filter, kind })}
            className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
              active
                ? "bg-sky-500 text-white"
                : "bg-black/5 text-black/70 hover:bg-black/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
            }`}
          >
            {tt(KIND_LABELS[kind])}
          </button>
        );
      })}
    </div>
  );
}

/** 16 个交付类目：`row` 是一排横滑卡片（浮窗）；`column` 是竖排（Bay 页的筛选栏）。再点一次取消。 */
export function BayCategoryCards({ filter, variant = "row" }: { filter: BayFeedFilter; variant?: "row" | "column" }) {
  const tt = useUI();
  const name = useBayCategoryName();
  const { categories, loading } = useBayCategories();
  const toggle = (slug: string) => setBayFilter({ ...filter, category: filter.category === slug ? undefined : slug });

  if (!loading && categories.length === 0) return null;
  if (variant === "column") {
    return (
      <nav aria-label={tt("类目")} className="flex flex-col gap-0.5" data-bay-categories="column">
        {categories.map((category) => {
          const active = filter.category === category.slug;
          return (
            <button
              key={category.slug}
              type="button"
              aria-pressed={active}
              data-category={category.slug}
              onClick={() => toggle(category.slug)}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                active
                  ? "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
                  : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
              }`}
            >
              <BayCategoryIcon name={category.icon} className="h-4 w-4 shrink-0" />
              <span className="truncate">{name(category)}</span>
            </button>
          );
        })}
      </nav>
    );
  }
  return (
    <div role="group" aria-label={tt("类目")} className="flex gap-2 overflow-x-auto px-2 pb-2" data-bay-categories="row">
      {loading
        ? Array.from({ length: 6 }).map((_, index) => (
            <div key={index} aria-hidden="true" className="h-16 w-20 shrink-0 animate-pulse rounded-xl bg-black/5 dark:bg-white/10" />
          ))
        : categories.map((category) => {
            const active = filter.category === category.slug;
            return (
              <button
                key={category.slug}
                type="button"
                aria-pressed={active}
                data-category={category.slug}
                onClick={() => toggle(category.slug)}
                className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-colors ${
                  active
                    ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
                    : "border-black/10 text-black/70 hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                }`}
              >
                <BayCategoryIcon name={category.icon} className="h-5 w-5" />
                <span className="line-clamp-2 text-[11px] leading-tight">{name(category)}</span>
              </button>
            );
          })}
    </div>
  );
}

function FeedCard({ item }: { item: BayFeedItem }) {
  const onOpen = () => openBay(targetForFeedItem(item));
  if (item.kind === "demand") return <DemandCard item={item} onOpen={onOpen} />;
  if (item.kind === "help") return <HelpRequestCard item={item} onOpen={onOpen} />;
  if (item.kind === "service") return <ServiceCard item={item} onOpen={onOpen} />;
  return <ConsultCard item={item} onOpen={onOpen} />;
}

function isDefaultFilter(filter: BayFeedFilter): boolean {
  return (filter.kind ?? "all") === "all" && !filter.category && !filter.q;
}

export function BayEmptyActions() {
  const tt = useUI();
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      <button
        type="button"
        onClick={() => startPostNeed()}
        className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
      >
        {tt("发需求")}
      </button>
      <button
        type="button"
        onClick={startServiceEditor}
        className="rounded-lg bg-black/5 px-3 py-1.5 text-xs font-medium hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
      >
        {tt("发布服务")}
      </button>
    </div>
  );
}

/** 信息流本体（不含筛选头）；Bay 页的中栏也用它。 */
export function BayFeed({ filter, activeKey }: { filter: BayFeedFilter; activeKey: string | null }) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const feed = useBayFeed(filter, signedIn);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !feed.hasMore || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) feed.loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [feed.hasMore, feed.loadMore]);

  return (
    <div data-bay-feed>
      {feed.items.map((item) => {
        const key = `${item.kind}:${item.id}`;
        return (
          <div key={key} data-bay-feed-item={item.kind} className={key === activeKey ? "bg-sky-50 dark:bg-sky-950/30" : undefined}>
            <FeedCard item={item} />
          </div>
        );
      })}
      {feed.loading && feed.items.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-black/45 dark:text-white/45">{tt("正在加载…")}</div>
      ) : null}
      {feed.error && feed.items.length === 0 && !feed.loading ? (
        <div className="px-4 py-6 text-center text-sm text-black/55 dark:text-white/55" role="status">
          <div>{tt(feed.error)}</div>
          <button
            type="button"
            onClick={feed.retry}
            className="mt-2 rounded-md bg-black/5 px-3 py-1 text-xs hover:bg-black/10 dark:bg-white/10"
          >
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {feed.loaded && !feed.loading && !feed.error && feed.items.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-black/45 dark:text-white/45" data-bay-empty>
          <div>{isDefaultFilter(filter) ? tt("Bay 里还没有内容，发第一条需求或服务吧") : tt("没有符合条件的内容")}</div>
          {isDefaultFilter(filter) ? null : (
            <button
              type="button"
              onClick={() => setBayFilter({ kind: "all" })}
              className="mt-2 rounded-md bg-black/5 px-3 py-1 text-xs hover:bg-black/10 dark:bg-white/10"
            >
              {tt("清除筛选")}
            </button>
          )}
          <BayEmptyActions />
        </div>
      ) : null}
      {feed.hasMore ? (
        <div ref={sentinel}>
          <button
            type="button"
            onClick={feed.loadMore}
            className="block w-full px-3 py-2 text-center text-xs text-black/45 hover:bg-black/5 dark:text-white/45"
          >
            {feed.loading ? tt("正在加载…") : tt("加载更多")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function activeFeedKey(target: BayTarget): string | null {
  if (target.kind === "demand" || target.kind === "service" || target.kind === "help" || target.kind === "consult") {
    return `${target.kind}:${target.id}`;
  }
  return null;
}

/** 浮窗左栏。 */
export function BayList({ layout }: { layout: BayLayout }) {
  const filter = useBayFilter();
  const { current } = useBayState();
  const slideRef = useBaySlideIn<HTMLDivElement>(layout === "docked" || layout === "mobile", "list");

  return (
    <div ref={slideRef} className="flex min-h-0 flex-1 flex-col" data-bay-list data-layout={layout}>
      <BayActions filter={filter} />
      <BaySearch filter={filter} />
      <BayKindFilters filter={filter} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <BayCategoryCards filter={filter} />
        <BayFeed filter={filter} activeKey={activeFeedKey(current)} />
      </div>
    </div>
  );
}
