"use client";

// 会话顶上固定的交易卡：买的是什么、多少钱、现在什么状态、下一步该谁做什么；点它在 LeoBay 里打开订单。
// 付款没就绪时写「付款暂未开放」，没有能点的付款按钮；就绪时也只是打开订单（付款在订单页里发起）。

import { useUI, type UITranslate } from "../../../i18n/ui/useUI";
import { formatDealAmount, type DealCardModel, type DealNextKey, type DealStatusKey } from "./deal-model";

export interface DealCardProps {
  model: DealCardModel;
  compact?: boolean;
  /** 有订单时打开订单；没有订单时打开主题（服务 / 需求 / 求助）。没有可去的地方就不可点。 */
  onOpen?: (() => void) | null;
}

export function dealStatusLabel(tt: UITranslate, status: DealStatusKey): string {
  switch (status) {
    case "talking":
      return tt("洽谈中");
    case "offer_pending":
      return tt("报价待回复");
    case "offer_declined":
      return tt("报价被拒绝");
    case "offer_withdrawn":
      return tt("报价已撤回");
    case "offer_expired":
      return tt("报价已过期");
    case "draft":
      return tt("待确认订单");
    case "negotiating":
      return tt("订单条款协商中");
    case "active":
      return tt("进行中");
    case "delivered":
      return tt("已交付");
    case "completed":
      return tt("已完成");
    case "cancelled":
      return tt("已取消");
    case "disputed":
      return tt("争议处理中");
    case "help":
      return tt("求助");
  }
}

export function dealNextLabel(tt: UITranslate, next: DealNextKey): string | null {
  switch (next) {
    case "pay":
      return tt("下一步：你来付款");
    case "pay_unavailable":
      return tt("付款暂未开放");
    case "deliver":
      return tt("下一步：你来交付");
    case "accept":
      return tt("下一步：你来验收");
    case "review":
      return tt("下一步：你来评价");
    case "reply_offer":
      return tt("下一步：你来回复报价");
    case "wait_offer_reply":
      return tt("等对方回复报价");
    case "send_offer":
      return tt("谈好了就发一份报价");
    case "wait_offer":
      return tt("等卖家发报价");
    case "open_order":
      return tt("订单已生成，去订单里确认条款");
    case "wait_other":
      return tt("等对方处理");
    case "finished":
      return tt("这笔订单已完成");
    case "cancelled":
      return tt("这笔订单已取消");
    case "dispute":
      return tt("在订单里查看争议进度");
    case "none":
      return null;
  }
}

function paymentLabel(tt: UITranslate, state: DealCardModel["paymentState"]): string | null {
  switch (state) {
    case "held":
      return tt("款项已托管");
    case "released":
      return tt("款项已打给卖家");
    case "refunded":
      return tt("款项已退回");
    case "split":
      return tt("款项已部分退回");
    default:
      return null;
  }
}

const ACTION_NEXT: ReadonlySet<DealNextKey> = new Set(["pay", "deliver", "accept", "review", "reply_offer", "open_order"]);

export function DealCard({ model, compact = false, onOpen = null }: DealCardProps) {
  const tt = useUI();
  const next = dealNextLabel(tt, model.next);
  const payment = paymentLabel(tt, model.paymentState);
  const clickable = Boolean(onOpen);
  const body = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-neutral-500">{tt("这笔交易")}</p>
          <p data-deal-card-title className="truncate text-[14px] font-semibold text-neutral-900">
            {model.title || tt("交易会话")}
          </p>
        </div>
        <span
          data-deal-card-status={model.status}
          className={
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] " +
            (model.status === "completed" || model.status === "active" || model.status === "delivered"
              ? "bg-emerald-50 text-emerald-700"
              : model.status === "cancelled" || model.status === "offer_declined" || model.status === "offer_withdrawn" || model.status === "offer_expired"
                ? "bg-neutral-100 text-neutral-500"
                : model.status === "disputed"
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700")
          }
        >
          {dealStatusLabel(tt, model.status)}
        </span>
      </div>
      <div className={"flex flex-wrap items-center gap-x-3 gap-y-1 " + (compact ? "mt-1" : "mt-2")}>
        {model.amount ? (
          <span data-deal-card-amount className="text-[14px] font-semibold text-neutral-900">
            {formatDealAmount(model.amount.fen, model.amount.currency)}
          </span>
        ) : null}
        {payment ? <span className="text-[12px] text-neutral-500">{payment}</span> : null}
        {next ? (
          <span
            data-deal-card-next={model.next}
            className={
              "text-[12px] " +
              (model.next === "pay_unavailable"
                ? "text-neutral-500"
                : ACTION_NEXT.has(model.next)
                  ? "font-medium text-sky-700"
                  : "text-neutral-600")
            }
          >
            {next}
          </span>
        ) : null}
      </div>
      {clickable ? (
        <span className="mt-1.5 inline-block text-[12px] text-sky-700">
          {model.contractId ? tt("查看订单") : tt("查看详情")} ›
        </span>
      ) : null}
    </>
  );
  const frame = "block w-full rounded-xl border border-neutral-200 bg-white text-left " + (compact ? "px-3 py-2" : "p-3");
  if (clickable && onOpen) {
    return (
      <button type="button" data-deal-card onClick={onOpen} className={frame + " hover:border-neutral-300 hover:bg-neutral-50"}>
        {body}
      </button>
    );
  }
  return (
    <div data-deal-card className={frame}>
      {body}
    </div>
  );
}
