"use client";

import { useCallback, useState, type ReactElement } from "react";
import { useLocale } from "next-intl";

import { useUI } from "../../../i18n/ui/useUI";
import type { BayApp } from "../../../lib/bay/apps";
import {
  buyBayApp,
  cancelBayAppSubscription,
  listBoughtBayApps,
  resumeBayAppSubscription,
  subscribeBayApp,
  type BayAppPurchase,
  type BayAppTrial,
} from "../../../lib/bay/app-paid";
import { formatBayFen } from "../../../lib/bay/money";
import { openBay, requireBayLogin } from "../shell/bay-state";
import { PaneLoading, PaneMessage, Section } from "../supply/parts";
import { errorText, useBayResource } from "../supply/use-bay-resource";
import { AppPurchaseStatus } from "./AppPurchaseStatus";
import {
  currentPeriodPurchase,
  formatPaidDate,
  oneTimePurchases,
  purchaseStage,
  purchaseStatusLabelKey,
  subStatusLabelKey,
} from "./paid-model";

const PRIMARY = "rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60";
const SECONDARY = "rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60";

function appTitle(apps: BayApp[], id: string, fallback: string): string {
  return apps.find((row) => row.id === id)?.title || fallback;
}

function appOf(apps: BayApp[], id: string): BayApp | undefined {
  return apps.find((row) => row.id === id);
}

export function MyBoughtAppsPane(): ReactElement | null {
  const tt = useUI();
  const locale = useLocale();
  const resource = useBayResource("bought-apps", () => listBoughtBayApps());
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [ask, setAsk] = useState<null | { kind: "buy" | "subscribe" | "cancel-sub"; id: string }>(null);

  const reload = resource.reload;
  const onReload = useCallback(() => reload(), [reload]);

  if (resource.loading) return <PaneLoading />;
  if (!resource.data) {
    return <PaneMessage text={resource.error ? tt(resource.error) : tt("没读到你买到的作品，请稍后再试。")} onRetry={reload} />;
  }

  const { purchases, subscriptions, trials, apps } = resource.data;
  const oneTime = oneTimePurchases(purchases);
  const empty = oneTime.length === 0 && subscriptions.length === 0 && trials.length === 0;

  async function run(id: string, work: () => Promise<unknown>) {
    if (!requireBayLogin()) return;
    setBusyId(id);
    setError("");
    try {
      await work();
      setAsk(null);
      reload();
    } catch (err) {
      setError(errorText(err) || tt("没处理成功，请稍后再试。"));
    } finally {
      setBusyId("");
    }
  }

  function openApp(id: string) {
    openBay({ kind: "app", id });
  }

  return (
    <section data-bay-pane="mine-bought-apps" className="space-y-4 px-4 pb-4">
      {empty ? (
        <p data-bay-empty="bought-apps" className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-[13px] text-neutral-600">
          {tt("你还没有买过或试用过任何作品")}
        </p>
      ) : null}

      {error ? <p className="text-[12px] text-rose-600">{tt(error)}</p> : null}

      {oneTime.length ? (
        <Section title={tt("买断的")}>
          <ul data-bay-bought-section="purchase" className="divide-y divide-neutral-100">
            {oneTime.map((row) => (
              <BoughtPurchaseRow
                key={row.id}
                row={row}
                title={appTitle(apps, row.item_id, row.item_title)}
                locale={locale}
                onOpen={() => openApp(row.item_id)}
                onReload={onReload}
              />
            ))}
          </ul>
        </Section>
      ) : null}

      {subscriptions.length ? (
        <Section title={tt("订阅的")}>
          <ul data-bay-bought-section="subscription" className="divide-y divide-neutral-100">
            {subscriptions.map((row) => {
              const period = currentPeriodPurchase(purchases, row.id);
              const periodEnd = formatPaidDate(row.current_period_end, locale);
              return (
                <li key={row.id} data-bay-bought-row="subscription" className="py-3">
                  <button type="button" className="block w-full text-left" onClick={() => openApp(row.app_id)}>
                    <span className="block truncate text-[14px] font-semibold text-neutral-900">{appTitle(apps, row.app_id, row.app_title)}</span>
                  </button>
                  <p className="mt-1 flex flex-wrap gap-2 text-[12px] text-neutral-500">
                    <span>{formatBayFen(row.price_fen, "CNY", locale)}</span>
                    <span>{tt(subStatusLabelKey(row.status))}</span>
                    {periodEnd ? <span>{tt("到期 {date}", { date: periodEnd })}</span> : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.status === "active" ? (
                      <button
                        type="button"
                        data-bay-action="cancel-sub"
                        disabled={Boolean(busyId)}
                        className={SECONDARY}
                        onClick={() => setAsk({ kind: "cancel-sub", id: row.id })}
                      >
                        {tt("取消订阅")}
                      </button>
                    ) : null}
                    {row.status === "cancelled" ? (
                      <button
                        type="button"
                        data-bay-action="resume-sub"
                        disabled={Boolean(busyId)}
                        className={PRIMARY}
                        onClick={() => void run(row.id, () => resumeBayAppSubscription(row.id))}
                      >
                        {busyId === row.id ? tt("正在处理…") : tt("恢复订阅")}
                      </button>
                    ) : null}
                    {row.status === "past_due" ? (
                      <button type="button" data-bay-action="check-payment" className={SECONDARY} onClick={() => openBay({ kind: "settings", pane: "money" })}>
                        {tt("去检查付款方式")}
                      </button>
                    ) : null}
                  </div>
                  {ask?.kind === "cancel-sub" && ask.id === row.id ? (
                    <div data-bay-confirm="cancel-sub" className="mt-3 space-y-2">
                      <p className="text-[12px] text-neutral-600">{tt("不再续费，已付的这一期用到 {date}", { date: periodEnd })}</p>
                      <div className="mt-3 flex justify-end gap-2">
                        <button type="button" className={SECONDARY} onClick={() => setAsk(null)}>
                          {tt("取消")}
                        </button>
                        <button type="button" disabled={Boolean(busyId)} className={PRIMARY} onClick={() => void run(row.id, () => cancelBayAppSubscription(row.id))}>
                          {busyId === row.id ? tt("正在处理…") : tt("确认")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <AppPurchaseStatus purchase={period} onReload={onReload} />
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {trials.length ? (
        <Section title={tt("试用的")}>
          <ul data-bay-bought-section="trial" className="divide-y divide-neutral-100">
            {trials.map((row) => (
              <TrialRow
                key={row.app_id}
                row={row}
                app={appOf(apps, row.app_id)}
                locale={locale}
                busy={busyId === row.app_id}
                asking={ask?.id === row.app_id ? ask.kind : null}
                onAsk={(kind) => setAsk(kind ? { kind, id: row.app_id } : null)}
                onBuy={() => void run(row.app_id, () => buyBayApp(row.app_id))}
                onSubscribe={() => void run(row.app_id, () => subscribeBayApp(row.app_id))}
                onOpen={() => openApp(row.app_id)}
              />
            ))}
          </ul>
        </Section>
      ) : null}
    </section>
  );
}

function BoughtPurchaseRow({
  row,
  title,
  locale,
  onOpen,
  onReload,
}: {
  row: BayAppPurchase;
  title: string;
  locale: string;
  onOpen: () => void;
  onReload: () => void;
}): ReactElement {
  const tt = useUI();
  const stage = purchaseStage(row);
  return (
    <li data-bay-bought-row="purchase" className="py-3">
      <button type="button" className="block w-full text-left" onClick={onOpen}>
        <span className="block truncate text-[14px] font-semibold text-neutral-900">{title}</span>
      </button>
      <p className="mt-1 flex flex-wrap gap-2 text-[12px] text-neutral-500">
        <span>{formatBayFen(row.price_fen, "CNY", locale)}</span>
        <span>{tt(purchaseStatusLabelKey(stage))}</span>
      </p>
      <AppPurchaseStatus purchase={row} onReload={onReload} />
    </li>
  );
}

function TrialRow({
  row,
  app,
  locale,
  busy,
  asking,
  onAsk,
  onBuy,
  onSubscribe,
  onOpen,
}: {
  row: BayAppTrial & { app_title: string };
  app: BayApp | undefined;
  locale: string;
  busy: boolean;
  asking: "buy" | "subscribe" | "cancel-sub" | null;
  onAsk: (kind: "buy" | "subscribe" | null) => void;
  onBuy: () => void;
  onSubscribe: () => void;
  onOpen: () => void;
}): ReactElement {
  const tt = useUI();
  const ends = formatPaidDate(row.ends_at, locale);
  const model = app?.price_model;
  return (
    <li data-bay-bought-row="trial" className="py-3">
      <button type="button" className="block w-full text-left" onClick={onOpen}>
        <span className="block truncate text-[14px] font-semibold text-neutral-900">{app?.title || row.app_title}</span>
      </button>
      <p className="mt-1 text-[12px] text-neutral-500">
        {row.active && ends ? tt("试用中，{date} 到期", { date: ends }) : tt("试用已结束")}
      </p>
      {model === "one_time" || model === "subscription" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {model === "one_time" ? (
            <button type="button" data-bay-action="buy" disabled={busy} className={PRIMARY} onClick={() => onAsk("buy")}>
              {tt("购买")}
            </button>
          ) : (
            <button type="button" data-bay-action="subscribe" disabled={busy} className={PRIMARY} onClick={() => onAsk("subscribe")}>
              {tt("订阅")}
            </button>
          )}
        </div>
      ) : null}
      {asking === "buy" ? (
        <div data-bay-confirm="buy" className="mt-3 space-y-2">
          <p className="text-[12px] text-neutral-600">
            {tt("将支付 {price}。款项托管 7 天；7 天内没打开过作品可直接全额退，打开过的需写理由由作者处理。", {
              price: formatBayFen(app?.price_fen || 0, "CNY", locale),
            })}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={SECONDARY} onClick={() => onAsk(null)}>
              {tt("取消")}
            </button>
            <button type="button" disabled={busy} className={PRIMARY} onClick={onBuy}>
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}
      {asking === "subscribe" ? (
        <div data-bay-confirm="subscribe" className="mt-3 space-y-2">
          <p className="text-[12px] text-neutral-600">
            {tt("将按 {price} / 月订阅。每期托管 7 天；7 天内没打开过可直接全额退，打开过的需写理由由作者处理。", {
              price: formatBayFen(app?.price_fen || 0, "CNY", locale),
            })}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={SECONDARY} onClick={() => onAsk(null)}>
              {tt("取消")}
            </button>
            <button type="button" disabled={busy} className={PRIMARY} onClick={onSubscribe}>
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
