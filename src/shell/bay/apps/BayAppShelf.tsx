"use client";

// LeoBay「作品」栏的货架：卡片网格。本文件归 U1 单元；组件名与 props 是合同，不许改。
import { useEffect, useRef, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayAppCard } from "./BayAppCard";
import { useBayApps } from "./use-bay-apps";
import { openBay, requireBayLogin, type BayFeedFilter } from "../shell/bay-state";

export interface BayAppShelfProps {
  filter: BayFeedFilter;
  siteKey: string;
  accent: string;
}

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
const QUIET_BUTTON =
  "rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50";
const PRIMARY_BUTTON =
  "inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

function ShelfSkeleton(): ReactElement {
  const tt = useUI();
  return (
    <div className={GRID} role="status" aria-busy="true" aria-label={tt("正在加载…")} data-bay-app-loading>
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

export function BayAppShelf({ filter, siteKey, accent }: BayAppShelfProps): ReactElement {
  const tt = useUI();
  const feed = useBayApps(filter, siteKey);
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
    <div data-bay-app-shelf>
      {feed.items.length > 0 ? (
        <div className={GRID}>
          {feed.items.map((app) => (
            <div key={app.id} className="flex min-w-0">
              <BayAppCard app={app} />
            </div>
          ))}
        </div>
      ) : null}
      {firstLoad ? <ShelfSkeleton /> : null}
      {feed.error ? (
        <div className="flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-app-error>
          <p className="text-[13px] text-neutral-500">{tt(feed.error)}</p>
          <button type="button" onClick={feed.reload} className={`mt-3 ${QUIET_BUTTON}`}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {empty ? (
        <div className="flex flex-col items-center px-4 py-16 text-center" data-bay-app-empty>
          <p className="max-w-xs text-[13px] leading-relaxed text-neutral-500">{tt("这里还没有作品")}</p>
          <button
            type="button"
            onClick={() => {
              if (!requireBayLogin()) return;
              openBay({ kind: "app-editor" });
            }}
            style={{ background: accent || "#111113" }}
            className={`mt-4 ${PRIMARY_BUTTON}`}
          >
            {tt("上架作品")}
          </button>
        </div>
      ) : null}
      {feed.hasMore ? (
        <div ref={sentinel} className="mt-3 flex justify-center">
          <button type="button" onClick={feed.loadMore} data-bay-app-more className={QUIET_BUTTON}>
            {feed.loading ? tt("正在加载…") : tt("加载更多")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
