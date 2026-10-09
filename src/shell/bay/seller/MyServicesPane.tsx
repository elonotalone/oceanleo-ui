"use client";

// Bay「我的」→ 我上架的素材与服务。概况那一行可单独拿去「我卖出的」用。
// 窗格不自带返回栏/标题栏/滚动。钱的数字不在这里出现，只给「去看收款」入口。答疑挂牌只读。

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
      <button type="button" data-bay-money-entry onClick={() => openBaySettings("money")} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-left hover:bg-stone-50">
        <span className="block text-[11px] text-stone-500">{tt("收款与账单")}</span>
        <span className="mt-1 block text-[13px] font-semibold text-stone-900">{tt("去设置里看")}</span>
      </button>
    </div>
  );
}

export function MyServicesPane({ overview = false, hideNew = false }: BayPaneProps & { overview?: boolean; hideNew?: boolean }) {
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
        <p>{tt("登录后管理你发布的服务。")}</p>
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

  const groups = groupMyServices(loaded.services);
  const empty = loaded.services.length === 0 && loaded.consults.length === 0;

  return (
    <section data-bay-pane="mine-services" className="space-y-4 p-4">
      {overviewRow}

      {/* 一个服务都没有时，下面的空状态里已经有「发布第一个服务」，这里不再放一个。嵌进「我发布的」时由外层的发布按钮负责。 */}
      {empty || hideNew ? null : (
        <div className="flex justify-end">
          <button type="button" onClick={() => openBay({ kind: "publish" })} data-bay-new-service className="rounded-xl bg-stone-900 px-3 py-1.5 text-[12.5px] font-semibold text-white">
            {tt("发布")}
          </button>
        </div>
      )}

      {empty ? (
        <div data-bay-empty="services" className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center">
          <p className="text-[13px] text-stone-600">{tt("还没有发布过服务。把一件你做得好的事变成别人能直接下单的服务。")}</p>
          <button type="button" onClick={() => openBay({ kind: "publish" })} className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-[13px] font-semibold text-white">
            {tt("发布第一个服务")}
          </button>
        </div>
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

      {loaded.consults.length ? (
        <div data-bay-group="consults">
          <h3 className="mb-2 text-[12px] font-semibold text-stone-500">
            {tt("答疑")} · {loaded.consults.length}
          </h3>
          <ul>
            {loaded.consults.map((consult) => (
              <li key={consult.id} className="border-b border-stone-100 px-1 py-2.5 text-[13px] text-stone-800">
                <span className="block font-semibold">{consult.title || tt("未命名服务")}</span>
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
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2">
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className="mt-1 text-[16px] font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function listingLabel(service: BayOwnService): { kind: "digital" | "service" | "consult"; label: string } {
  if (service.listing_kind === "digital") return { kind: "digital", label: "数字商品" };
  if (service.catalog_kind === "consult") return { kind: "consult", label: "答疑" };
  return { kind: "service", label: "服务" };
}

function ServiceRow({ service }: { service: BayOwnService }) {
  const tt = useUI();
  const site = baySiteName(service.posted_site);
  const listing = listingLabel(service);
  return (
    <button
      type="button"
      data-bay-own-service={service.id}
      onClick={() => openBay({ kind: "service-editor", serviceId: service.id })}
      className="block w-full border-b border-stone-100 px-1 py-2.5 text-left hover:bg-stone-50"
    >
      <span className="flex items-center gap-2">
        <span data-bay-listing-kind={listing.kind} className="shrink-0 text-[12px] text-neutral-500">
          {tt(listing.label)}
        </span>
        <span className="block min-w-0 truncate text-[14px] font-semibold text-stone-800">{service.title || tt("未命名服务")}</span>
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
