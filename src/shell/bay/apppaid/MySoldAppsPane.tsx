"use client";

import { useState, type ReactElement } from "react";
import { useLocale } from "next-intl";

import { useUI } from "../../../i18n/ui/useUI";
import { listSoldBayApps, type BayAppPurchase, type BayAppSubscription } from "../../../lib/bay/app-paid";
import { decideBayLessonRefund } from "../../../lib/bay/lessons";
import { formatBayFen } from "../../../lib/bay/money";
import { PaneLoading, PaneMessage } from "../supply/parts";
import { errorText, useBayResource } from "../supply/use-bay-resource";
import { formatPaidDate, formatPaidDateTime, purchaseStatusLabelKey, purchaseStage, refundHoursLeft, soldSummary, sortSoldPurchases, subStatusLabelKey } from "./paid-model";

const PRIMARY = "rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60";
const SECONDARY = "rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60";
const DANGER = "rounded-full border border-rose-300 bg-white px-3 py-1.5 text-[12px] text-rose-700 disabled:opacity-60";

export function MySoldAppsPane(): ReactElement | null {
  const tt = useUI();
  const locale = useLocale();
  const resource = useBayResource("sold-apps", () => listSoldBayApps());
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<null | { row: BayAppPurchase; agree: boolean }>(null);
  const [note, setNote] = useState("");

  if (resource.loading) return <PaneLoading />;
  if (!resource.data) {
    return <PaneMessage text={resource.error ? tt(resource.error) : tt("没读到订单，请稍后再试。")} onRetry={resource.reload} />;
  }

  const purchases = sortSoldPurchases(resource.data.purchases);
  const subscriptions = resource.data.subscriptions;
  const summary = soldSummary(resource.data.purchases, subscriptions);
  const empty = purchases.length === 0 && subscriptions.length === 0;

  async function decide() {
    const current = pending;
    if (!current || busyId) return;
    if (!current.agree && !note.trim()) return;
    setBusyId(current.row.id);
    setError("");
    try {
      await decideBayLessonRefund(current.row.id, current.agree, current.agree ? "" : note.trim());
      setPending(null);
      setNote("");
      resource.reload();
    } catch (err) {
      setError(errorText(err) || tt("退款处理失败，请稍后再试。"));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section data-bay-pane="mine-sold-apps" className="space-y-4 px-4 pb-4">
      {empty ? (
        <p data-bay-empty="sold-apps" className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-[13px] text-neutral-600">
          {tt("还没有人买过你的商品")}
        </p>
      ) : (
        <>
          <p data-bay-sold-summary className="flex flex-wrap gap-3 text-[12px] text-neutral-600">
            <span>{tt("生效中的订阅 {n}", { n: summary.activeSubs })}</span>
            <span>{tt("托管中 {n} 笔", { n: summary.heldCount })}</span>
          </p>
          {error ? <p className="text-[12px] text-rose-600">{tt(error)}</p> : null}
          <ul data-bay-sold-orders className="divide-y divide-neutral-100">
            {purchases.map((row) => (
              <SoldPurchaseRow
                key={row.id}
                row={row}
                locale={locale}
                busy={Boolean(busyId)}
                onAgree={() => {
                  setPending({ row, agree: true });
                  setNote("");
                }}
                onDecline={() => {
                  setPending({ row, agree: false });
                  setNote("");
                }}
              />
            ))}
          </ul>
          {pending?.agree ? (
            <div data-bay-confirm="agree-refund" className="space-y-2">
              <p className="text-[13px] font-medium text-neutral-900">{tt("确定同意这笔退款？")}</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className={SECONDARY} onClick={() => setPending(null)}>
                  {tt("取消")}
                </button>
                <button type="button" disabled={Boolean(busyId)} className={PRIMARY} onClick={() => void decide()}>
                  {busyId ? tt("正在处理…") : tt("同意退款")}
                </button>
              </div>
            </div>
          ) : null}
          {pending && !pending.agree ? (
            <div data-bay-confirm="decline-refund" className="space-y-2">
              <p className="text-[13px] font-medium text-neutral-900">{tt("确定拒绝这笔退款？")}</p>
              <textarea
                className="w-full rounded-full border border-neutral-900 px-2 py-1.5 text-[13px]"
                rows={3}
                value={note}
                placeholder={tt("请写一句拒绝说明")}
                data-bay-refund-note
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button type="button" className={SECONDARY} onClick={() => setPending(null)}>
                  {tt("取消")}
                </button>
                <button type="button" disabled={!note.trim() || Boolean(busyId)} className={DANGER} onClick={() => void decide()}>
                  {busyId ? tt("正在处理…") : tt("拒绝")}
                </button>
              </div>
            </div>
          ) : null}
          {subscriptions.length ? (
            <div data-bay-sold-subs>
              <h3 className="text-[14px] font-semibold text-neutral-900">{tt("订阅的人")}</h3>
              <ul className="mt-2 divide-y divide-neutral-100">
                {subscriptions.map((row) => (
                  <SoldSubRow key={row.id} row={row} locale={locale} />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function SoldPurchaseRow({
  row,
  locale,
  busy,
  onAgree,
  onDecline,
}: {
  row: BayAppPurchase;
  locale: string;
  busy: boolean;
  onAgree: () => void;
  onDecline: () => void;
}): ReactElement {
  const tt = useUI();
  const waiting = row.status === "refund_requested";
  const hours = refundHoursLeft(row.refund_due_at);
  return (
    <li data-bay-sold-row={waiting ? "refund-requested" : row.status} className={`py-3 ${waiting ? "rounded-xl bg-amber-50 px-3" : ""}`}>
      <p className="truncate text-[14px] font-semibold text-neutral-800">{row.item_title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-neutral-500">
        <span>{formatBayFen(row.price_fen, "CNY", locale)}</span>
        <span>{formatPaidDateTime(row.created_at, locale)}</span>
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">{tt(purchaseStatusLabelKey(purchaseStage(row)))}</span>
      </p>
      {waiting ? (
        <p className="mt-2 text-[12.5px] leading-5 text-amber-900">
          {row.refund_reason ? <span className="block whitespace-pre-wrap break-words">{row.refund_reason}</span> : null}
          <span>{tt("还剩 {n} 小时，不处理视为同意", { n: hours })}</span>
        </p>
      ) : null}
      {waiting ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" data-bay-confirm="agree-refund" disabled={busy} className={PRIMARY} onClick={onAgree}>
            {tt("同意退款")}
          </button>
          <button type="button" data-bay-confirm="decline-refund" disabled={busy} className={DANGER} onClick={onDecline}>
            {tt("拒绝")}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function SoldSubRow({ row, locale }: { row: BayAppSubscription; locale: string }): ReactElement {
  const tt = useUI();
  return (
    <li data-bay-sold-sub={row.status} className="py-3 text-[12px] text-neutral-600">
      <p className="flex flex-wrap gap-2">
        <span>{tt("开始于 {date}", { date: formatPaidDate(row.created_at, locale) })}</span>
        <span>{tt(subStatusLabelKey(row.status))}</span>
        <span>{tt("到期 {date}", { date: formatPaidDate(row.current_period_end, locale) })}</span>
      </p>
    </li>
  );
}
