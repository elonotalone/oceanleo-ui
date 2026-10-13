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
import { changeOf, DASHBOARD_RANGES, donutItems, type ChangeView } from "./dashboard-model";

const NO_COMPARE: ChangeView = { kind: "empty", label: "—" };
import { DonutChart } from "./DonutChart";
import { LineChart } from "./LineChart";
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
  const incomeValues = data.days.map((row) => row.income_fen);
  const userValues = data.days.map((row) => row.new_users);
  const openValues = data.days.map((row) => row.opens);
  const labels = data.days.map((row) => row.day);
  const slices = donutItems(data.products);
  const incomeTotal = incomeValues.reduce((sum, value) => sum + value, 0);
  const userTotal = userValues.reduce((sum, value) => sum + value, 0);
  const openTotal = openValues.reduce((sum, value) => sum + value, 0);
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
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
      </div>

      <LineChart
        marker="income"
        title={tt("收入")}
        days={labels}
        values={incomeValues}
        formatValue={money}
        ariaLabel={
          data.range_days === 365
            ? tt("最近一年{title}合计 {total}", { title: tt("收入"), total: money(incomeTotal) })
            : tt("最近 {days} 天{title}合计 {total}", { days: data.range_days, title: tt("收入"), total: money(incomeTotal) })
        }
      />
      <LineChart
        marker="new_users"
        title={tt("新增用户")}
        days={labels}
        values={userValues}
        formatValue={count}
        ariaLabel={
          data.range_days === 365
            ? tt("最近一年{title}合计 {total}", { title: tt("新增用户"), total: count(userTotal) })
            : tt("最近 {days} 天{title}合计 {total}", { days: data.range_days, title: tt("新增用户"), total: count(userTotal) })
        }
      />
      <LineChart
        marker="opens"
        title={tt("打开次数")}
        days={labels}
        values={openValues}
        formatValue={count}
        ariaLabel={
          data.range_days === 365
            ? tt("最近一年{title}合计 {total}", { title: tt("打开次数"), total: count(openTotal) })
            : tt("最近 {days} 天{title}合计 {total}", { days: data.range_days, title: tt("打开次数"), total: count(openTotal) })
        }
      />

      <DonutChart
        items={totals.income_fen > 0 ? slices : []}
        formatMoney={money}
        ariaLabel={
          data.range_days === 365
            ? tt("最近一年{title}合计 {total}", { title: tt("分商品收入"), total: money(totals.income_fen) })
            : tt("最近 {days} 天{title}合计 {total}", { days: data.range_days, title: tt("分商品收入"), total: money(totals.income_fen) })
        }
      />

      <div ref={productsRef}>
        <ProductTable products={data.products} currency={data.currency} locale={locale} />
      </div>
    </div>
  );
}
