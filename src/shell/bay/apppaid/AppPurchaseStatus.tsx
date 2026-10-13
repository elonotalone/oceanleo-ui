"use client";

// 买断或订阅当期那笔购买的托管 / 确认 / 退款 / 请平台介入。行为对齐课程 PurchasePanel。
import { useState, type ReactElement } from "react";
import { useLocale } from "next-intl";

import { useUI } from "../../../i18n/ui/useUI";
import { confirmBayLessonOrder, escalateBayLessonRefund, requestBayLessonRefund } from "../../../lib/bay/lessons";
import type { BayAppPurchase } from "../../../lib/bay/app-paid";
import { errorText } from "../supply/use-bay-resource";
import {
  canConfirm,
  canEscalate,
  canRequestRefund,
  formatPaidDate,
  formatPaidDateTime,
  needsRefundReason,
  purchaseStage,
  refundReasonProblem,
} from "./paid-model";

const PRIMARY = "rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60";
const SECONDARY = "rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60";

export function AppPurchaseStatus({
  purchase,
  onReload,
}: {
  purchase: BayAppPurchase | null;
  onReload: () => void;
}): ReactElement | null {
  const tt = useUI();
  const locale = useLocale();
  const [ask, setAsk] = useState<"confirm" | "refund" | "escalate" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!purchase) return null;
  const row = purchase;
  const stage = purchaseStage(row);
  if (stage === "none") return null;
  const dueDate = formatPaidDate(row.confirm_due_at, locale);
  const refundUntil = formatPaidDateTime(row.refund_due_at, locale);

  async function run(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      setAsk(null);
      setReason("");
      onReload();
    } catch (err) {
      setError(errorText(err) || tt("没处理成功，请稍后再试。"));
    } finally {
      setBusy(false);
    }
  }

  async function submitRefund() {
    const problem = refundReasonProblem(reason, row);
    if (problem) {
      setError(tt("请写明退款原因（至少 4 个字）"));
      return;
    }
    await run(() => requestBayLessonRefund(row.id, reason.trim()));
  }

  return (
    <div data-bay-purchase={stage} className="mt-3 space-y-1">
      {stage === "held" ? (
        <p className="text-[13px] text-neutral-700">{dueDate ? tt("{date} 自动确认", { date: dueDate }) : tt("托管中")}</p>
      ) : null}
      {stage === "refund-pending" ? (
        <p className="text-[13px] text-neutral-700">
          {refundUntil ? tt("等作者处理，{time} 前不处理视为同意", { time: refundUntil }) : tt("已申请退款，卖家超时不处理视为同意")}
        </p>
      ) : null}
      {stage === "refund-declined" ? (
        <div className="space-y-1 text-[13px] text-neutral-700">
          <p>{tt("作者拒绝了退款申请")}</p>
          {row.refund_note ? <p className="whitespace-pre-wrap break-words text-neutral-600">{row.refund_note}</p> : null}
        </div>
      ) : null}
      {stage === "disputed" ? <p className="text-[13px] text-neutral-700">{tt("平台正在处理这笔退款争议")}</p> : null}
      {stage === "completed" ? <p className="text-[13px] text-neutral-700">{tt("款项已付给作者，不能再退")}</p> : null}
      {stage === "refunded" ? <p className="text-[13px] text-neutral-700">{tt("已退款，作品已收回")}</p> : null}

      {error && !ask ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {canConfirm(row) ? (
          <button
            type="button"
            data-bay-action="confirm"
            disabled={busy}
            onClick={() => {
              setError("");
              setAsk("confirm");
            }}
            className={PRIMARY}
          >
            {tt("确认")}
          </button>
        ) : null}
        {canRequestRefund(row) ? (
          <button
            type="button"
            data-bay-action="refund"
            disabled={busy}
            onClick={() => {
              setError("");
              setAsk("refund");
            }}
            className={SECONDARY}
          >
            {tt("申请退款")}
          </button>
        ) : null}
        {canEscalate(row) ? (
          <button
            type="button"
            data-bay-action="escalate"
            disabled={busy}
            onClick={() => {
              setError("");
              setAsk("escalate");
            }}
            className={SECONDARY}
          >
            {tt("请平台介入")}
          </button>
        ) : null}
      </div>

      {ask === "confirm" ? (
        <div data-bay-confirm="confirm" className="mt-3 space-y-2">
          <p className="text-[13px] font-medium text-neutral-900">{tt("确认收货并把款项付给卖家？")}</p>
          <p className="mt-1 text-[12px] text-neutral-600">{tt("确认后款项付给卖家，不能再退")}</p>
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setAsk(null)} className={SECONDARY}>
              {tt("取消")}
            </button>
            <button type="button" disabled={busy} onClick={() => void run(() => confirmBayLessonOrder(row.id))} className={PRIMARY}>
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}

      {ask === "refund" ? (
        <div data-bay-confirm="refund" className="mt-3 space-y-2">
          <p className="text-[13px] font-medium text-neutral-900">{tt("确认退款")}</p>
          {needsRefundReason(row) ? (
            <label className="mt-2 block text-[12px] text-neutral-700">
              {tt("退款原因")}
              <textarea
                value={reason}
                rows={3}
                maxLength={2000}
                onChange={(event) => setReason(event.target.value)}
                placeholder={tt("请写下退款原因")}
                className="mt-1 w-full rounded-full border border-neutral-900 px-2 py-1.5 text-[13px]"
              />
            </label>
          ) : (
            <p className="mt-1 text-[12px] text-neutral-600">{tt("还没打开过，可以直接退")}</p>
          )}
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setAsk(null)} className={SECONDARY}>
              {tt("取消")}
            </button>
            <button type="button" disabled={busy} onClick={() => void submitRefund()} className={PRIMARY}>
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}

      {ask === "escalate" ? (
        <div data-bay-confirm="escalate" className="mt-3 space-y-2">
          <p className="text-[13px] font-medium text-neutral-900">{tt("确认请平台介入")}</p>
          <p className="mt-1 text-[12px] text-neutral-600">{tt("卖家拒绝后，你可以请平台介入。由操作员裁定。")}</p>
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setAsk(null)} className={SECONDARY}>
              {tt("取消")}
            </button>
            <button type="button" disabled={busy} onClick={() => void run(() => escalateBayLessonRefund(row.id))} className={PRIMARY}>
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
