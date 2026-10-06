"use client";

// 各站 `/bay` 页（W10 铺到门户与 35 个子站）：和浮窗同一套左栏、右栏。
// 宽屏三段（筛选 / 信息流 / 详情），中屏两段，手机单栏「列表 → 详情」推进。读写 `?bay=`。境内显示暂未开放。
import { useEffect, useSyncExternalStore } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayAuthHost } from "./bay-auth-host";
import { BayIcon } from "./bay-icons";
import { BAY_MINE_TABS } from "./bay-links";
import {
  bayEnabledHere,
  openBay,
  registerBayPage,
  requireBayLogin,
  setBaySiteKey,
  useBayFilter,
  useBayHasDetail,
  useBayState,
  type BayFeedFilter,
} from "./bay-state";
import { BayDetail } from "./BayDetail";
import { BayActions, BayCategoryCards, BayFeed, BayKindFilters, BaySearch, activeFeedKey } from "./BayList";
import { BAY_MINE_LABELS } from "./BayMine";

export interface BayPageProps {
  siteKey: string;
  accent?: string;
}

type Width = "wide" | "medium" | "narrow";

function readWidth(): Width {
  if (typeof window === "undefined") return "wide";
  const w = window.innerWidth;
  return w >= 1180 ? "wide" : w >= 768 ? "medium" : "narrow";
}

function subscribeWidth(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

function useWidth(): Width {
  return useSyncExternalStore(subscribeWidth, readWidth, () => "wide");
}

type Availability = "pending" | "on" | "off";

function subscribeNever(): () => void {
  return () => {};
}

function useAvailability(): Availability {
  return useSyncExternalStore(subscribeNever, (): Availability => (bayEnabledHere() ? "on" : "off"), (): Availability => "pending");
}

function PageHeader({ accent }: { accent?: string }) {
  const tt = useUI();
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10" style={accent ? { color: accent } : undefined}>
        <BayIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold">OceanLeo Bay</h1>
        <p className="truncate text-xs text-black/55 dark:text-white/55">{tt("找人做事，或者接别人的需求")}</p>
      </div>
    </header>
  );
}

function MineLinks() {
  const tt = useUI();
  const { current } = useBayState();
  return (
    <nav aria-label={tt("我的")} className="flex flex-col gap-0.5" data-bay-page-mine>
      {BAY_MINE_TABS.map((tab) => {
        const active = current.kind === "mine" && current.tab === tab;
        return (
          <button
            key={tab}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (requireBayLogin()) openBay({ kind: "mine", tab });
            }}
            className={`rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              active
                ? "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
                : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            }`}
          >
            {tt(BAY_MINE_LABELS[tab])}
          </button>
        );
      })}
    </nav>
  );
}

function FilterColumn({ filter }: { filter: BayFeedFilter }) {
  const tt = useUI();
  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-black/10 pb-4 dark:border-white/10" data-bay-page-filters>
      <BayActions filter={filter} />
      <BayKindFilters filter={filter} />
      <div className="px-2">
        <div className="px-2.5 pb-1 pt-2 text-[12px] text-black/45 dark:text-white/45">{tt("类目")}</div>
        <BayCategoryCards filter={filter} variant="column" />
        <div className="px-2.5 pb-1 pt-4 text-[12px] text-black/45 dark:text-white/45">{tt("我的")}</div>
        <MineLinks />
      </div>
    </aside>
  );
}

function FeedColumn({ filter, withFilters, className }: { filter: BayFeedFilter; withFilters: boolean; className: string }) {
  const { current } = useBayState();
  return (
    <section className={`flex min-h-0 flex-col ${className}`} data-bay-page-feed>
      {withFilters ? <BayActions filter={filter} /> : null}
      <BaySearch filter={filter} />
      {withFilters ? <BayKindFilters filter={filter} /> : <div className="h-2 shrink-0" />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {withFilters ? <BayCategoryCards filter={filter} /> : null}
        <BayFeed filter={filter} activeKey={activeFeedKey(current)} />
      </div>
    </section>
  );
}

export function BayPage({ siteKey, accent }: BayPageProps) {
  const tt = useUI();
  const availability = useAvailability();
  const width = useWidth();
  const filter = useBayFilter();
  const hasDetail = useBayHasDetail();

  useEffect(() => {
    setBaySiteKey(siteKey);
  }, [siteKey]);

  useEffect(() => (availability === "on" ? registerBayPage() : undefined), [availability]);

  if (availability === "pending") {
    return <div className="flex flex-col" style={{ minHeight: "100dvh" }} data-bay-page="pending" />;
  }
  if (availability === "off") {
    return (
      <div className="flex flex-col items-center justify-center px-6 text-center" style={{ minHeight: "60vh" }} data-bay-page="unavailable">
        <p className="text-sm text-black/55 dark:text-white/55">{tt("此功能暂未在本站开放")}</p>
      </div>
    );
  }

  let body;
  if (width === "wide") {
    body = (
      <div className="flex min-h-0 flex-1">
        <FilterColumn filter={filter} />
        <FeedColumn filter={filter} withFilters={false} className="w-[360px] shrink-0 border-r border-black/10 dark:border-white/10" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-bay-page-detail>
          <BayDetail layout="page" />
        </div>
      </div>
    );
  } else if (width === "medium") {
    body = (
      <div className="flex min-h-0 flex-1">
        <FeedColumn filter={filter} withFilters className="w-[360px] shrink-0 border-r border-black/10 dark:border-white/10" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-bay-page-detail>
          <BayDetail layout="page" />
        </div>
      </div>
    );
  } else {
    body = hasDetail ? (
      <div className="flex min-h-0 flex-1 flex-col" data-bay-page-detail>
        <BayDetail layout="mobile" />
      </div>
    ) : (
      <FeedColumn filter={filter} withFilters className="flex-1" />
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "100dvh" }} data-bay-page={width}>
      <PageHeader accent={accent} />
      {body}
      <BayAuthHost />
    </div>
  );
}
