"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useLocale } from "next-intl";

import { useUI } from "../../../i18n/ui/useUI";
import type { BayApp } from "../../../lib/bay/apps";
import {
  buyBayApp,
  cancelBayAppSubscription,
  getBayAppAccess,
  resumeBayAppSubscription,
  startBayAppTrial,
  subscribeBayApp,
  type BayAppAccess,
} from "../../../lib/bay/app-paid";
import { formatBayFen } from "../../../lib/bay/money";
import { openBay, requireBayLogin } from "../shell/bay-state";
import { errorText } from "../supply/use-bay-resource";
import { AppPurchaseStatus } from "./AppPurchaseStatus";
import { describePaidView, formatPaidDate, offersMoneySettings } from "./paid-model";

export interface AppPurchaseBarProps {
  app: BayApp;
  isOwner: boolean;
  /** 每次读到或改变了权益就告诉作品页：它据此决定窗口里放作品还是放「需要购买」。读取失败时传 null。 */
  onAccess: (access: BayAppAccess | null) => void;
}

const PRIMARY = "rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60";
const SECONDARY = "rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60";

export function AppPurchaseBar({ app, isOwner, onAccess }: AppPurchaseBarProps): ReactElement {
  const tt = useUI();
  const locale = useLocale();
  const [access, setAccess] = useState<BayAppAccess | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState<"buy" | "subscribe" | "trial" | "cancel-sub" | null>(null);

  const applyAccess = useCallback(
    (next: BayAppAccess) => {
      setAccess(next);
      onAccess(next);
    },
    [onAccess],
  );

  const refreshAccess = useCallback(async () => {
    try {
      const next = await getBayAppAccess(app.id);
      applyAccess(next);
      setLoadError("");
    } catch (err) {
      setAccess(null);
      onAccess(null);
      setLoadError(errorText(err) || tt("没读到收费信息，请重试。"));
    }
  }, [app.id, applyAccess, onAccess, tt]);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    setLoading(true);
    getBayAppAccess(app.id, ac.signal).then(
      (next) => {
        if (!alive) return;
        applyAccess(next);
        setLoadError("");
        setLoading(false);
      },
      (err) => {
        if (!alive) return;
        setAccess(null);
        onAccess(null);
        setLoadError(errorText(err) || tt("没读到收费信息，请重试。"));
        setLoading(false);
      },
    );
    return () => {
      alive = false;
      ac.abort();
    };
  }, [app.id, applyAccess, onAccess, tt]);

  const currency = access?.currency || "CNY";
  const fen = access?.price_fen ?? app.price_fen;
  const model = access?.price_model ?? app.price_model;
  const price = formatBayFen(fen, currency, locale);
  const view = access ? describePaidView(access, isOwner) : null;
  const buttons = view?.buttons;
  const moneyError = offersMoneySettings(error);

  async function runPaid(work: () => Promise<{ access: BayAppAccess }>) {
    if (busy) return;
    if (!requireBayLogin()) return;
    setBusy(true);
    setError("");
    try {
      const body = await work();
      applyAccess(body.access);
      setAsk(null);
    } catch (err) {
      setError(errorText(err) || tt("购买没成功，请稍后再试。"));
    } finally {
      setBusy(false);
    }
  }

  async function runSub(work: () => Promise<unknown>) {
    if (busy) return;
    if (!requireBayLogin()) return;
    setBusy(true);
    setError("");
    try {
      await work();
      await refreshAccess();
      setAsk(null);
    } catch (err) {
      setError(errorText(err) || tt("没处理成功，请稍后再试。"));
    } finally {
      setBusy(false);
    }
  }

  function startAction(next: "buy" | "subscribe" | "trial" | "cancel-sub") {
    if (!requireBayLogin()) return;
    setError("");
    setAsk(next);
  }

  const periodEnd = formatPaidDate(access?.subscription?.current_period_end, locale);
  const trialEnd = formatPaidDate(access?.trial?.ends_at, locale);

  return (
    <section data-bay-app-purchase className="rounded-xl border border-neutral-200 bg-white p-3">
      <p data-bay-app-price className="text-[14px] font-semibold text-neutral-900">
        {model === "subscription" ? tt("{price} / 月", { price }) : tt("{price} · 一次买断", { price })}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-neutral-500">{tt("另加支付通道费，平台不抽成；款项托管 7 天")}</p>

      {loading ? <div data-bay-loading className="mt-2 h-4 w-24 animate-pulse rounded bg-neutral-100" /> : null}

      {loadError ? (
        <div className="mt-3">
          <p className="text-[12px] text-rose-600">{tt(loadError)}</p>
          <button type="button" data-bay-action="retry" className={`${SECONDARY} mt-2`} onClick={() => void refreshAccess()}>
            {tt("重试")}
          </button>
        </div>
      ) : null}

      {view?.kind === "trialing" && trialEnd ? <p className="mt-2 text-[13px] text-neutral-700">{tt("试用中，{date} 到期", { date: trialEnd })}</p> : null}
      {view?.kind === "trial-ended" ? <p className="mt-2 text-[13px] text-neutral-700">{tt("试用已结束")}</p> : null}
      {view?.kind === "subscribed" && periodEnd ? <p className="mt-2 text-[13px] text-neutral-700">{tt("订阅中，{date} 续费", { date: periodEnd })}</p> : null}
      {view?.kind === "past-due" ? (
        <p className="mt-2 text-[13px] text-amber-800">
          {periodEnd ? tt("续费扣款没有成功，正在重试；{date} 前仍可使用", { date: periodEnd }) : tt("续费扣款没有成功，正在重试")}
        </p>
      ) : null}
      {view?.kind === "cancelled-sub" && periodEnd ? <p className="mt-2 text-[13px] text-neutral-700">{tt("已取消，用到 {date}", { date: periodEnd })}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {buttons?.editPricing ? (
          <button
            type="button"
            data-bay-action="edit-pricing"
            className={SECONDARY}
            onClick={() => openBay({ kind: "app-manage", appId: app.id, tab: "pricing" })}
          >
            {tt("去改定价")}
          </button>
        ) : null}
        {buttons?.buy ? (
          <button type="button" data-bay-action="buy" disabled={busy} className={PRIMARY} onClick={() => startAction("buy")}>
            {tt("购买")}
          </button>
        ) : null}
        {buttons?.subscribe ? (
          <button type="button" data-bay-action="subscribe" disabled={busy} className={PRIMARY} onClick={() => startAction("subscribe")}>
            {tt("订阅")}
          </button>
        ) : null}
        {buttons?.trial ? (
          <button type="button" data-bay-action="trial" disabled={busy} className={SECONDARY} onClick={() => startAction("trial")}>
            {tt("免费试用 {n} 天", { n: access?.trial_days || app.trial_days })}
          </button>
        ) : null}
        {buttons?.cancelSub ? (
          <button type="button" data-bay-action="cancel-sub" disabled={busy} className={SECONDARY} onClick={() => startAction("cancel-sub")}>
            {tt("取消订阅")}
          </button>
        ) : null}
        {buttons?.resumeSub && access?.subscription ? (
          <button
            type="button"
            data-bay-action="resume-sub"
            disabled={busy}
            className={PRIMARY}
            onClick={() => void runSub(() => resumeBayAppSubscription(access.subscription!.id))}
          >
            {busy ? tt("正在处理…") : tt("恢复订阅")}
          </button>
        ) : null}
        {buttons?.checkPayment ? (
          <button
            type="button"
            data-bay-action="check-payment"
            className={SECONDARY}
            onClick={() => openBay({ kind: "settings", pane: "money" })}
          >
            {tt("去检查付款方式")}
          </button>
        ) : null}
      </div>

      {buttons?.trial ? <p className="mt-1.5 text-[11px] leading-4 text-neutral-500">{tt("不扣款，不需要绑卡；到期后要继续用需要购买")}</p> : null}

      {ask === "buy" ? (
        <div data-bay-confirm="buy" className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[13px] font-medium text-neutral-900">{tt("确认购买")}</p>
          <p className="mt-1 text-[12px] text-neutral-600">{tt("将支付 {price}。款项托管 7 天；7 天内没打开过作品可直接全额退，打开过的需写理由由作者处理。", { price })}</p>
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setAsk(null)} className={SECONDARY}>
              {tt("取消")}
            </button>
            <button type="button" disabled={busy} onClick={() => void runPaid(() => buyBayApp(app.id))} className={PRIMARY}>
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}

      {ask === "subscribe" ? (
        <div data-bay-confirm="subscribe" className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[13px] font-medium text-neutral-900">{tt("确认订阅")}</p>
          <p className="mt-1 text-[12px] text-neutral-600">{tt("将按 {price} / 月订阅。每期托管 7 天；7 天内没打开过可直接全额退，打开过的需写理由由作者处理。", { price })}</p>
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setAsk(null)} className={SECONDARY}>
              {tt("取消")}
            </button>
            <button type="button" disabled={busy} onClick={() => void runPaid(() => subscribeBayApp(app.id))} className={PRIMARY}>
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}

      {ask === "trial" ? (
        <div data-bay-confirm="trial" className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[13px] font-medium text-neutral-900">{tt("免费试用 {n} 天", { n: access?.trial_days || app.trial_days })}</p>
          <p className="mt-1 text-[12px] text-neutral-600">{tt("不扣款，不需要绑卡；到期后要继续用需要购买")}</p>
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setAsk(null)} className={SECONDARY}>
              {tt("取消")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runPaid(async () => {
                const body = await startBayAppTrial(app.id);
                return { access: body.access };
              })}
              className={PRIMARY}
            >
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}

      {ask === "cancel-sub" && access?.subscription ? (
        <div data-bay-confirm="cancel-sub" className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[13px] font-medium text-neutral-900">{tt("取消订阅")}</p>
          <p className="mt-1 text-[12px] text-neutral-600">{tt("不再续费，已付的这一期用到 {date}", { date: periodEnd })}</p>
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setAsk(null)} className={SECONDARY}>
              {tt("取消")}
            </button>
            <button type="button" disabled={busy} onClick={() => void runSub(() => cancelBayAppSubscription(access.subscription!.id))} className={PRIMARY}>
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}

      {error && !ask ? (
        <div className="mt-2">
          <p className="text-[12px] text-rose-600">{tt(error)}</p>
          {moneyError ? (
            <button
              type="button"
              data-bay-action="setup-money"
              className={`${SECONDARY} mt-2`}
              onClick={() => openBay({ kind: "settings", pane: "money" })}
            >
              {tt("去设置付款方式")}
            </button>
          ) : null}
        </div>
      ) : null}

      {access?.purchase && (view?.kind === "owned-purchase" || view?.kind === "subscribed" || view?.kind === "past-due" || view?.kind === "cancelled-sub") ? (
        <AppPurchaseStatus purchase={access.purchase} onReload={() => void refreshAccess()} />
      ) : null}
    </section>
  );
}
