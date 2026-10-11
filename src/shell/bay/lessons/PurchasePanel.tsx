"use client";

// 「我的购买」：托管、确认、退款、请平台介入。四个动作都先弹确认再调接口，成功后重新取详情。
import { useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import {
  confirmBayLessonOrder,
  escalateBayLessonRefund,
  requestBayLessonRefund,
  type BayLessonPurchase,
} from "../../../lib/bay/lessons";
import { errorText } from "../supply/use-bay-resource";
import {
  canConfirm,
  canEscalate,
  canRequestRefund,
  daysLeft,
  hoursLeft,
  needsRefundReason,
  purchaseStage,
  refundReasonProblem,
} from "./purchase-model";

export function PurchasePanel({ purchase, onReload }: { purchase: BayLessonPurchase | null; onReload: () => void }): ReactElement | null {
  const tt = useUI();
  const [ask, setAsk] = useState<"confirm" | "refund" | "escalate" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!purchase) return null;
  const row = purchase;
  const stage = purchaseStage(row);
  const now = new Date();
  const days = daysLeft(row.confirm_due_at, now);
  const hours = hoursLeft(row.refund_due_at, now);

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
    <section data-bay-purchase={stage} className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <h3 className="text-[14px] font-semibold text-neutral-900">{tt("我的购买")}</h3>
      {stage === "held" ? (
        <p className="mt-1 text-[13px] text-neutral-700">
          {days === null ? tt("款项托管中") : tt("款项托管中，{n} 天后自动确认", { n: days })}
        </p>
      ) : null}
      {stage === "refund-pending" ? (
        <p className="mt-1 text-[13px] text-neutral-700">
          {hours === null ? tt("已申请退款，卖家超时不处理视为同意") : tt("已申请退款，卖家会在 {n} 小时内处理，超时视为同意", { n: hours })}
        </p>
      ) : null}
      {stage === "refund-declined" ? (
        <div className="mt-1 space-y-1 text-[13px] text-neutral-700">
          <p>{tt("卖家拒绝了退款申请")}</p>
          {row.refund_note ? <p className="whitespace-pre-wrap break-words text-neutral-600">{row.refund_note}</p> : null}
          {days !== null ? <p>{tt("还剩 {n} 天，不处理将自动确认", { n: days })}</p> : null}
        </div>
      ) : null}
      {stage === "disputed" ? <p className="mt-1 text-[13px] text-neutral-700">{tt("平台正在处理这笔退款争议")}</p> : null}
      {stage === "completed" ? <p className="mt-1 text-[13px] text-neutral-700">{tt("款项已付给卖家，不能再退")}</p> : null}
      {stage === "refunded" ? <p className="mt-1 text-[13px] text-neutral-700">{tt("已退款，课程已收回")}</p> : null}

      {error && !ask ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {canConfirm(row) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              setAsk("confirm");
            }}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60"
          >
            {tt("确认，没问题")}
          </button>
        ) : null}
        {canRequestRefund(row) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              setAsk("refund");
            }}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60"
          >
            {tt("申请退款")}
          </button>
        ) : null}
        {canEscalate(row) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              setAsk("escalate");
            }}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60"
          >
            {tt("请平台介入")}
          </button>
        ) : null}
      </div>

      {ask === "confirm" ? (
        <div data-bay-confirm="confirm" className="mt-3 rounded-lg border border-neutral-200 bg-white p-3">
          <p className="text-[13px] font-medium text-neutral-900">{tt("确认收货并把款项付给卖家？")}</p>
          <p className="mt-1 text-[12px] text-neutral-600">{tt("确认后款项付给卖家，不能再退")}</p>
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setAsk(null)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60">
              {tt("取消")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => confirmBayLessonOrder(row.id))}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60"
            >
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}

      {ask === "refund" ? (
        <div data-bay-confirm="refund" className="mt-3 rounded-lg border border-neutral-200 bg-white p-3">
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
                className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px]"
              />
            </label>
          ) : (
            <p className="mt-1 text-[12px] text-neutral-600">{tt("现在退款会立即全额退回，课程会收回")}</p>
          )}
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setAsk(null)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60">
              {tt("取消")}
            </button>
            <button type="button" disabled={busy} onClick={() => void submitRefund()} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60">
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}

      {ask === "escalate" ? (
        <div data-bay-confirm="escalate" className="mt-3 rounded-lg border border-neutral-200 bg-white p-3">
          <p className="text-[13px] font-medium text-neutral-900">{tt("确认请平台介入")}</p>
          <p className="mt-1 text-[12px] text-neutral-600">{tt("卖家拒绝后，你可以请平台介入。由操作员裁定。")}</p>
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setAsk(null)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60">
              {tt("取消")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => escalateBayLessonRefund(row.id))}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60"
            >
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
