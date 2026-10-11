"use client";

import { useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { decideBayLessonRefund, type BayLessonPurchase } from "../../../lib/bay/lessons";
import { BayApiError } from "../../../lib/bay/http";
import { ConfirmDialog } from "../../../ui";
import { DANGER_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXTAREA_CLASS } from "../seller/seller-ui";
import { DEFAULT_CURRENCY, moneyText } from "../seller/editor-model";
import { refundHoursLeft, sortSoldOrders } from "./lesson-editor-model";

function errorText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

function statusText(row: BayLessonPurchase, tt: (key: string) => string): string {
  if (row.status === "refund_requested") return tt("待处理退款");
  if (row.status === "refund_declined") return tt("已拒绝退款");
  if (row.status === "disputed") return tt("平台介入中");
  if (row.status === "refunded") return tt("已退款");
  if (row.status === "completed") return tt("已确认");
  return tt("托管中");
}

function timeText(iso: string | null): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toLocaleString() : iso;
}

export function SoldOrders({
  items,
  currency = DEFAULT_CURRENCY,
  disabled,
  onChanged,
  onError,
}: {
  items: BayLessonPurchase[];
  currency?: string;
  disabled?: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}): ReactElement {
  const tt = useUI();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<null | { row: BayLessonPurchase; agree: boolean }>(null);
  const [note, setNote] = useState("");
  const rows = sortSoldOrders(items);

  async function decide() {
    const current = pending;
    if (!current || busyId) return;
    if (!current.agree && !note.trim()) return;
    setBusyId(current.row.id);
    onError("");
    try {
      await decideBayLessonRefund(current.row.id, current.agree, current.agree ? "" : note.trim());
      setPending(null);
      setNote("");
      onChanged();
    } catch (error) {
      onError(errorText(error, tt("退款处理失败，请稍后再试。")));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-[12.5px] text-stone-500">
          {tt("还没有卖出的订单")}
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {rows.map((row) => {
            const waiting = row.status === "refund_requested";
            return (
              <li
                key={row.id}
                className={`py-3 ${waiting ? "rounded-xl bg-amber-50 px-3" : ""}`}
                data-bay-sold-row={waiting ? "refund-requested" : row.status}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-stone-800">{row.item_title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-stone-500">
                      <span>{row.price_fen ? moneyText(row.price_fen, currency) : tt("免费")}</span>
                      <span>{timeText(row.created_at)}</span>
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium text-stone-600">{statusText(row, tt)}</span>
                    </p>
                    {waiting ? (
                      <p className="mt-2 text-[12.5px] leading-5 text-amber-900">
                        {row.refund_reason ? <span className="block">{row.refund_reason}</span> : null}
                        <span>{tt("还剩 {n} 小时，不处理将视为同意", { n: refundHoursLeft(row.refund_due_at) })}</span>
                      </p>
                    ) : null}
                  </div>
                  {waiting ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-bay-confirm="agree-refund"
                        disabled={Boolean(disabled || busyId)}
                        className={PRIMARY_BUTTON}
                        onClick={() => {
                          setPending({ row, agree: true });
                          setNote("");
                        }}
                      >
                        {tt("同意退款")}
                      </button>
                      <button
                        type="button"
                        data-bay-confirm="decline-refund"
                        disabled={Boolean(disabled || busyId)}
                        className={DANGER_BUTTON}
                        onClick={() => {
                          setPending({ row, agree: false });
                          setNote("");
                        }}
                      >
                        {tt("拒绝")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pending?.agree ? (
        <ConfirmDialog
          title={tt("确定同意这笔退款？")}
          confirmLabel={tt("同意退款")}
          onConfirm={() => void decide()}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {pending && !pending.agree ? (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] font-medium text-stone-800">{tt("确定拒绝这笔退款？")}</p>
          <textarea
            className={TEXTAREA_CLASS}
            rows={3}
            value={note}
            placeholder={tt("请写一句拒绝说明")}
            data-bay-refund-note
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className={SECONDARY_BUTTON} onClick={() => setPending(null)}>
              {tt("取消")}
            </button>
            <button type="button" disabled={!note.trim() || Boolean(busyId)} className={DANGER_BUTTON} onClick={() => void decide()}>
              {tt("拒绝")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
