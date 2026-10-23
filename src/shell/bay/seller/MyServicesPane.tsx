"use client";

// Bay「我的」→ 我发布的现成文件、人工服务和其他。概况那一行可单独拿去「我卖出的」用。
// 窗格不自带返回栏/标题栏/滚动。钱的数字不在这里出现，只给「收款账户」入口（设置 → LeoBay）；收入流水在数据面板。答疑挂牌只读。

import { useCallback, useEffect, useState } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { getUserId } from "../../../lib/auth/client";
import {
  BAY_SERVICE_GROUP_ORDER,
  activeOrderCount,
  awaitingReplyCount,
  groupMyServices,
  hiddenCaseFor,
  listMyConsults,
  listMyContentCases,
  listMyServices,
  listRecentThreads,
  getSellerStats,
  type BayContentCase,
  type BayOwnConsult,
  type BayOwnService,
  type BaySellerStats,
  type BaySellerThread,
  type BayServiceGroup,
} from "../../../lib/bay/seller";
import { openBaySettings } from "../settings";
import { baySiteName } from "../shell/bay-links";
import { openBay, requireBayLogin, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { PublishedCategoryTag } from "../mine/PublishedCategoryTag";
import type { MineCategory } from "../mine/MineCategoryBar";
import { HiddenByPlatformNotice } from "./seller-ui";

const GROUP_TITLES: Record<BayServiceGroup, string> = {
  hidden: "被平台隐藏",
  published: "已上架",
  paused: "已暂停",
  draft: "草稿",
};

interface Loaded {
  services: BayOwnService[];
  consults: BayOwnConsult[];
  cases: BayContentCase[];
  error: string;
}

export function SellerOverview() {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [loaded, setLoaded] = useState<{
    stats: BaySellerStats | null;
    threads: BaySellerThread[];
    viewerId: string | null;
  } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void Promise.all([
      getSellerStats().catch(() => null),
      listRecentThreads().catch(() => ({ threads: [] as BaySellerThread[] })),
      getUserId().catch(() => null),
    ]).then(([stats, threads, viewerId]) => {
      if (alive) setLoaded({ stats, threads: threads.threads || [], viewerId });
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  if (!signedIn || !loaded) return null;

  const active = activeOrderCount(loaded.stats);
  const replies = awaitingReplyCount(loaded.threads, loaded.viewerId);
  const rating = loaded.stats && loaded.stats.rating_count > 0 ? loaded.stats.rating_avg : null;

  return (
    <div data-bay-seller-overview className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <OverviewCell label={tt("进行中的订单")} value={String(active)} />
      <OverviewCell label={tt("待回复")} value={String(replies)} />
      <OverviewCell label={tt("评分")} value={rating == null ? tt("暂无评价") : rating.toFixed(1)} />
      <button type="button" data-bay-money-entry onClick={() => openBaySettings()} className="px-0 py-1 text-left hover:opacity-80">
        <span className="block text-[11px] text-stone-500">{tt("收款账户")}</span>
        <span className="mt-1 block text-[13px] font-semibold text-stone-900">{tt("去设置里看")}</span>
      </button>
    </div>
  );
}

export function MyServicesPane({
  overview = false,
  hideNew = false,
  category = "all",
}: BayPaneProps & { overview?: boolean; hideNew?: boolean; category?: MineCategory }) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => {
    setLoaded(null);
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void Promise.all([
      listMyServices(),
      listMyConsults().catch(() => ({ items: [] as BayOwnConsult[] })),
      listMyContentCases().catch(() => [] as BayContentCase[]),
    ]).then(
      ([services, consults, cases]) => {
        if (alive) {
          setLoaded({
            services: services.items || [],
            consults: consults.items || [],
            cases,
            error: "",
          });
        }
      },
      (error: unknown) => {
        if (alive) setLoaded({ services: [], consults: [], cases: [], error: error instanceof Error ? error.message : "" });
      },
    );
    return () => {
      alive = false;
    };
  }, [signedIn, nonce]);

  if (!signedIn) {
    return (
      <section data-bay-pane="mine-services" className="p-4 text-[13px] text-stone-600">
        <p>{tt("登录后管理你发布的东西。")}</p>
        <button type="button" onClick={() => requireBayLogin()} className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-[13px] font-semibold text-white">
          {tt("登录")}
        </button>
      </section>
    );
  }

  const overviewRow = overview ? <SellerOverview /> : null;

  if (!loaded) {
    return (
      <section data-bay-pane="mine-services" className="space-y-4 p-4">
        {overviewRow}
        <p className="text-[13px] text-stone-500">{tt("正在加载…")}</p>
      </section>
    );
  }

  if (loaded.error) {
    return (
      <section data-bay-pane="mine-services" role="alert" className="space-y-4 p-4 text-[13px] text-rose-700">
        {overviewRow}
        <p>{tt(loaded.error)}</p>
        <button type="button" onClick={reload} className="mt-2 font-medium underline underline-offset-2">
          {tt("重试")}
        </button>
      </section>
    );
  }

  // 类别下拉：只留选中的那一类。答疑算「人工服务」。
  const shownServices = category === "all" ? loaded.services : loaded.services.filter((service) => listingCategory(service) === category);
  const shownConsults = category === "all" || category === "service" ? loaded.consults : [];
  const groups = groupMyServices(shownServices);
  const empty = loaded.services.length === 0 && loaded.consults.length === 0;
  const filteredEmpty = !empty && shownServices.length === 0 && shownConsults.length === 0;

  return (
    <section data-bay-pane="mine-services" className="space-y-4 p-4">
      {overviewRow}

      {/* 一件都没发布时，下面的空状态里已经有「去发布」，这里不再放一个。嵌进「我发布的」时由外层的发布按钮负责。 */}
      {empty || hideNew ? null : (
        <div className="flex justify-end">
          <button type="button" onClick={() => openBay({ kind: "publish" })} data-bay-new-service className="rounded-xl bg-stone-900 px-3 py-1.5 text-[12.5px] font-semibold text-white">
            {tt("发布")}
          </button>
        </div>
      )}

      {empty ? (
        <div data-bay-empty="services" className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center">
          <p className="text-[13px] text-stone-600">{tt("还没有发布过东西。把一件你做得好的事发布出来，别人就能直接下单。")}</p>
          <button type="button" onClick={() => openBay({ kind: "publish" })} className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-[13px] font-semibold text-white">
            {tt("去发布")}
          </button>
        </div>
      ) : filteredEmpty ? (
        <p data-bay-empty="category" className="px-1 py-6 text-center text-[13px] text-stone-500">
          {tt("这一类还没有发布的东西。")}
        </p>
      ) : (
        BAY_SERVICE_GROUP_ORDER.filter((group) => groups[group].length > 0).map((group) => (
          <div key={group} data-bay-group={group}>
            <h3 className="mb-2 text-[12px] font-semibold text-stone-500">
              {tt(GROUP_TITLES[group])} · {groups[group].length}
            </h3>
            <ul>
              {groups[group].map((service) => (
                <li key={service.id}>
                  {group === "hidden" ? <HiddenByPlatformNotice what="service" caseRow={hiddenCaseFor(loaded.cases, "talent_service", service.id)} /> : null}
                  <ServiceRow service={service} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {shownConsults.length ? (
        <div data-bay-group="consults">
          <ul>
            {shownConsults.map((consult) => (
              <li key={consult.id} className="border-b border-stone-100 px-1 py-2.5 text-[13px] text-stone-800">
                <span className="flex items-start justify-between gap-2">
                  <span className="block min-w-0 truncate font-semibold">{consult.title || tt("未命名")}</span>
                  <PublishedCategoryTag category="service" />
                </span>
                <span className="mt-0.5 block text-[12px] text-stone-500">{tt("答疑上架后暂时不能修改")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function OverviewCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1">
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className="mt-1 text-[16px] font-semibold text-stone-900">{value}</p>
    </div>
  );
}

// 这张表里的行只有三类：现成文件（数字商品）、其他、人工服务（含答疑）；右边标签见 PublishedCategoryTag。
function listingCategory(service: BayOwnService): "digital" | "service" | "other" {
  if (service.listing_kind === "digital") return "digital";
  if (service.listing_kind === "other") return "other";
  return "service";
}

function ServiceRow({ service }: { service: BayOwnService }) {
  const tt = useUI();
  const site = baySiteName(service.posted_site);
  const category = listingCategory(service);
  return (
    <button
      type="button"
      data-bay-own-service={service.id}
      onClick={() => openBay({ kind: "service-editor", serviceId: service.id })}
      className="block w-full border-b border-stone-100 px-1 py-2.5 text-left hover:bg-stone-50"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="block min-w-0 truncate text-[14px] font-semibold text-stone-800">{service.title || tt("未命名")}</span>
        <PublishedCategoryTag category={category} />
      </span>
      {service.summary ? <span className="mt-0.5 line-clamp-2 text-[12px] text-stone-500">{service.summary}</span> : null}
      <span className="mt-1 flex flex-wrap gap-x-2 text-[12px] text-stone-500">
        {service.order_count ? <span>{tt("{n} 份订单", { n: service.order_count })}</span> : null}
        {service.view_count ? <span>{tt("{n} 次浏览", { n: service.view_count })}</span> : null}
        {service.delivery_days ? <span>{tt("{n} 天交付", { n: service.delivery_days })}</span> : null}
        {site ? <span>{site}</span> : null}
      </span>
    </button>
  );
}
