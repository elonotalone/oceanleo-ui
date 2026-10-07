"use client";

// 项目群里的订单卡（W02 发的 `talent_order` 卡、置顶条都用它）：标题、状态、金额、下一步，点它打开 Bay 里这单。
// `compact`（消息窗里很窄）：一行标题、一行状态与金额、一个按钮。内容一律当纯文字渲染。

import type { MouseEvent } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  autoAcceptCountdown,
  autoAcceptText,
  counterpartyName,
  nextActionText,
  orderAmountText,
  orderStatusLabel,
  type BayOrder,
} from "../../../lib/bay/orders";
import { openBay } from "../shell/bay-state";
import { useBayOrder, useBayPaymentsGate } from "./order-store";

export interface BayOrderCardProps {
  contractId: string;
  compact?: boolean;
}

function statusTone(status: BayOrder["status"] | undefined): string {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700";
    case "cancelled":
      return "bg-neutral-100 text-neutral-500";
    case "disputed":
      return "bg-rose-50 text-rose-700";
    case "delivered":
      return "bg-sky-50 text-sky-700";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

export function BayOrderCard({ contractId, compact = false }: BayOrderCardProps) {
  const tt = useUI();
  const { order, error, loading } = useBayOrder(contractId);
  const gate = useBayPaymentsGate();
  const forbidden = Boolean(error && (error.status === 401 || error.status === 403 || error.status === 404));
  const canOpen = Boolean(contractId) && !forbidden;

  const open = (event?: MouseEvent) => {
    event?.stopPropagation();
    if (!canOpen) return;
    openBay({ kind: "order", id: contractId });
  };

  const title = order?.title?.trim() || tt("订单");
  const status = order ? orderStatusLabel(tt, order.status) : "";
  const amount = order ? orderAmountText(tt, order) : "";
  const next = order ? nextActionText(tt, order, gate) : "";
  const countdown = order && order.status === "delivered" ? autoAcceptText(tt, autoAcceptCountdown(order.auto_accept_at)) : "";

  const note = forbidden
    ? tt("只有这笔订单的买家和卖家能看到详情。")
    : error
      ? tt("订单信息暂时取不到。")
      : loading
        ? tt("正在读取订单…")
        : "";

  const button = canOpen ? (
    <button
      type="button"
      data-bay-order-open={contractId}
      onClick={open}
      className="rounded-lg bg-neutral-900 px-3 py-1 text-[12px] text-white hover:bg-neutral-800"
    >
      {tt("查看订单")}
    </button>
  ) : null;

  if (compact) {
    return (
      <div
        data-bay-order-card={contractId}
        data-compact="true"
        data-order-status={order?.status ?? "unknown"}
        onClick={canOpen ? () => open() : undefined}
        className={
          "w-full max-w-[280px] rounded-xl border border-neutral-200 bg-white px-3 py-2 text-neutral-900 " +
          (canOpen ? "cursor-pointer hover:border-neutral-300" : "")
        }
      >
        <p data-bay-order-title className="truncate text-[13px] font-semibold">
          {title}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-neutral-600">
          {order ? (
            <>
              <span data-bay-order-status>{status}</span>
              {amount ? (
                <>
                  {" · "}
                  <span data-bay-order-amount>{amount}</span>
                </>
              ) : null}
            </>
          ) : (
            note
          )}
        </p>
        {button ? <div className="mt-1.5">{button}</div> : null}
      </div>
    );
  }

  return (
    <div
      data-bay-order-card={contractId}
      data-compact="false"
      data-order-status={order?.status ?? "unknown"}
      onClick={canOpen ? () => open() : undefined}
      className={
        "w-full max-w-[360px] rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900 " +
        (canOpen ? "cursor-pointer hover:border-neutral-300" : "")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{tt("订单")}</span>
        {order ? (
          <span data-bay-order-status className={"rounded-full px-2 py-0.5 text-[11px] " + statusTone(order.status)}>
            {status}
          </span>
        ) : null}
      </div>
      <p data-bay-order-title className="mt-1 line-clamp-2 break-words text-[14px] font-semibold">
        {title}
      </p>
      {order ? (
        <>
          <p className="mt-1 text-[13px] text-neutral-700">
            <span data-bay-order-amount>{amount}</span>
            {order.my_role ? (
              <>
                {" · "}
                {tt("对方：{name}", { name: counterpartyName(tt, order) })}
              </>
            ) : null}
          </p>
          {next ? (
            <p data-bay-order-next className="mt-1 text-[12px] text-sky-700">
              {tt("下一步：{text}", { text: next })}
            </p>
          ) : null}
          {countdown ? <p className="mt-0.5 text-[12px] text-sky-800">{countdown}</p> : null}
        </>
      ) : note ? (
        <p className="mt-1 text-[12px] text-neutral-500">{note}</p>
      ) : null}
      {button ? <div className="mt-2.5">{button}</div> : null}
    </div>
  );
}
