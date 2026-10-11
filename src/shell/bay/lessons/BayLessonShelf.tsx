"use client";

// LeoBay「课程」栏的货架：课程与套餐的卡片网格。本文件归 V1 单元；组件名与 props 是合同，不许改。
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayBundleCard } from "./BayBundleCard";
import { BayLessonCard } from "./BayLessonCard";
import { useBayLessonBundles, useBayLessons } from "./use-bay-lessons";
import { openBay, requireBayLogin, type BayFeedFilter } from "../shell/bay-state";

export interface BayLessonShelfProps {
  filter: BayFeedFilter;
  siteKey: string;
  accent: string;
}

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
const QUIET_BUTTON =
  "rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50";
const PRIMARY_BUTTON =
  "inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

type LessonTab = "lesson" | "bundle";

function ShelfSkeleton(): ReactElement {
  const tt = useUI();
  return (
    <div className={GRID} role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-lesson-loading>
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

function LessonGrid({ filter, siteKey, accent }: BayLessonShelfProps): ReactElement {
  const tt = useUI();
  const feed = useBayLessons(filter, siteKey);
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

  const firstLoad = feed.loading && feed.items.length === 0;
  const empty = !feed.loading && !feed.error && feed.items.length === 0;

  return (
    <>
      {feed.items.length > 0 ? (
        <div className={GRID}>
          {feed.items.map((lesson) => (
            <div key={lesson.id} className="flex min-w-0">
              <BayLessonCard lesson={lesson} />
            </div>
          ))}
        </div>
      ) : null}
      {firstLoad ? <ShelfSkeleton /> : null}
      {feed.error ? (
        <div className="flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-lesson-error>
          <p className="text-[13px] text-neutral-500">{tt(feed.error)}</p>
          <button type="button" onClick={feed.reload} className={`mt-3 ${QUIET_BUTTON}`}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {empty ? (
        <div className="flex flex-col items-center px-4 py-16 text-center" data-bay-lesson-empty>
          <p className="max-w-xs text-[13px] leading-relaxed text-neutral-500">{tt("这里还没有课程")}</p>
          <button
            type="button"
            onClick={() => {
              if (!requireBayLogin()) return;
              openBay({ kind: "lesson-editor" });
            }}
            style={{ background: accent || "#111113" }}
            className={`mt-4 ${PRIMARY_BUTTON}`}
          >
            {tt("发布课程")}
          </button>
        </div>
      ) : null}
      {feed.hasMore ? (
        <div ref={sentinel} className="mt-3 flex justify-center">
          <button type="button" onClick={feed.loadMore} data-bay-lesson-more className={QUIET_BUTTON}>
            {feed.loading ? tt("正在加载…") : tt("加载更多")}
          </button>
        </div>
      ) : null}
    </>
  );
}

function BundleGrid({ filter }: { filter: BayFeedFilter }): ReactElement {
  const tt = useUI();
  const feed = useBayLessonBundles(filter);
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

  const firstLoad = feed.loading && feed.items.length === 0;
  const empty = !feed.loading && !feed.error && feed.items.length === 0;

  return (
    <>
      {feed.items.length > 0 ? (
        <div className={GRID}>
          {feed.items.map((bundle) => (
            <div key={bundle.id} className="flex min-w-0">
              <BayBundleCard bundle={bundle} />
            </div>
          ))}
        </div>
      ) : null}
      {firstLoad ? <ShelfSkeleton /> : null}
      {feed.error ? (
        <div className="flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-lesson-error>
          <p className="text-[13px] text-neutral-500">{tt(feed.error)}</p>
          <button type="button" onClick={feed.reload} className={`mt-3 ${QUIET_BUTTON}`}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {empty ? (
        <div className="flex flex-col items-center px-4 py-16 text-center" data-bay-lesson-empty>
          <p className="max-w-xs text-[13px] leading-relaxed text-neutral-500">{tt("这里还没有套餐")}</p>
        </div>
      ) : null}
      {feed.hasMore ? (
        <div ref={sentinel} className="mt-3 flex justify-center">
          <button type="button" onClick={feed.loadMore} data-bay-lesson-more className={QUIET_BUTTON}>
            {feed.loading ? tt("正在加载…") : tt("加载更多")}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function BayLessonShelf({ filter, siteKey, accent }: BayLessonShelfProps): ReactElement {
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
      {tab === "lesson" ? <LessonGrid filter={filter} siteKey={siteKey} accent={accent} /> : <BundleGrid filter={filter} />}
    </div>
  );
}
