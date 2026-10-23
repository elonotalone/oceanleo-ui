"use client";

import { useRef, useState, type ReactElement } from "react";
import { useLocale } from "next-intl";

import { htmlLang, normalizeLocale } from "../../../i18n/config";
import { useUI } from "../../../i18n/ui/useUI";
import { getBayDashboard, type BayDashboardRange } from "../../../lib/bay/dashboard";
import { formatBayFen } from "../../../lib/bay/money";
import { useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { BaySignInPrompt } from "../shell/BayMine";
import { PaneLoading, PaneMessage } from "../supply/parts";
import { useBayResource } from "../supply/use-bay-resource";
import { changeOf, DASHBOARD_RANGES, type ChangeView } from "./dashboard-model";

const NO_COMPARE: ChangeView = { kind: "empty", label: "—" };
import { OverviewChart } from "./OverviewChart";
import { ProductTable } from "./ProductTable";
import { StatTile } from "./StatTile";

function formatCount(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(Number.isFinite(value) ? value : 0);
  } catch {
    return String(value);
  }
}

export function DashboardPane(_props: BayPaneProps): ReactElement {
  const tt = useUI();
  const locale = htmlLang(normalizeLocale(useLocale()));
  const signedIn = useBaySignedIn();
  const [days, setDays] = useState<BayDashboardRange>(30);
  const productsRef = useRef<HTMLDivElement | null>(null);
  const resource = useBayResource(signedIn ? `dashboard:${days}` : null, () => getBayDashboard(days));

  if (!signedIn) {
    return (
      <div data-bay-pane="dashboard">
        <BaySignInPrompt text={tt("登录后查看你卖出的全部商品的数据")} />
      </div>
    );
  }
  if (resource.loading) return <PaneLoading />;
  if (!resource.data) {
    return (
      <div data-bay-pane="dashboard">
        <PaneMessage text={resource.error || tt("这一段没加载出来，请刷新页面再试。")} onRetry={resource.reload} />
      </div>
    );
  }

  const data = resource.data;
  const totals = data.totals;
  const money = (fen: number) => formatBayFen(fen, data.currency, locale);
  const count = (value: number) => formatCount(value, locale);
  const scrollToProducts = () => productsRef.current?.scrollIntoView({ block: "start" });

  return (
    <div data-bay-pane="dashboard" className="space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold text-neutral-950">{tt("数据面板")}</h2>
        <div role="tablist" aria-label={tt("数据面板")} className="flex flex-wrap gap-1">
          {DASHBOARD_RANGES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={value === days}
              data-bay-dashboard-range={value}
              onClick={() => setDays(value)}
              className={
                value === days
                  ? "rounded-full bg-neutral-900 px-3 py-1.5 text-[13px] font-semibold text-white"
                  : "rounded-full border border-neutral-900 px-3 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50"
              }
            >
              {value === 7 ? tt("7 天") : value === 30 ? tt("30 天") : value === 90 ? tt("90 天") : tt("一年")}
            </button>
          ))}
        </div>
      </div>

      <OverviewChart days={data.days} products={data.products} money={money} count={count}
        labels={{ overview: tt("数据面板"), products: tt("分商品收入"), income: tt("收入"), users: tt("新增用户"), opens: tt("打开次数"), count: `${tt("新增用户")} / ${tt("打开次数")}`, empty: tt("这段时间还没有数据"), noIncome: tt("这段时间还没有收入") }}
        summary={<div className="flex flex-wrap gap-x-6 gap-y-4">
        <StatTile marker="income_lifetime" label={tt("累计收入")} value={money(totals.income_lifetime_fen)} change={NO_COMPARE} />
        <StatTile marker="income" label={tt("本段收入")} value={money(totals.income_fen)} change={changeOf(totals.income_fen, totals.income_prev_fen)} />
        <StatTile marker="pending" label={tt("托管中")} value={money(totals.pending_fen)} change={NO_COMPARE} />
        <StatTile marker="users_lifetime" label={tt("累计用户")} value={count(totals.users_lifetime)} change={NO_COMPARE} />
        <StatTile marker="new_users" label={tt("本段新增用户")} value={count(totals.new_users)} change={changeOf(totals.new_users, totals.new_users_prev)} />
        <StatTile marker="buyers" label={tt("本段付款人数")} value={count(totals.buyers)} change={NO_COMPARE} />
        <StatTile marker="opens" label={tt("本段打开次数")} value={count(totals.opens)} change={changeOf(totals.opens, totals.opens_prev)} />
        <StatTile marker="followers" label={tt("关注数")} value={count(totals.followers)} change={NO_COMPARE} />
        <StatTile marker="subscriptions" label={tt("生效中的订阅")} value={count(totals.active_subscriptions)} change={NO_COMPARE} />
        <StatTile
          marker="open_threads"
          label={tt("待回复留言")}
          value={count(totals.open_threads)}
          change={NO_COMPARE}
          onActivate={totals.open_threads > 0 ? scrollToProducts : undefined}
        />
        <StatTile
          marker="open_errors"
          label={tt("未处理报错")}
          value={count(totals.open_errors)}
          change={NO_COMPARE}
          onActivate={totals.open_errors > 0 ? scrollToProducts : undefined}
        />
        </div>} />

      <div ref={productsRef}>
        <ProductTable products={data.products} currency={data.currency} locale={locale} />
      </div>
    </div>
  );
}
