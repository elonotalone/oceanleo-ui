"use client";

// 会话里的一份报价：价格、天数、修改次数、范围。收到的人能接受 / 拒绝，发出的人能撤回，只在等待回复时。
// 接受后显示「订单已生成」和「查看订单」（在 LeoBay 里打开）；这里没有付款按钮。内容一律当纯文字。

import { useUI, type UITranslate } from "../../../i18n/ui/useUI";
import { offerPermissions, type DealOffer, type DealOfferAction, type DealOfferState } from "../../../lib/bay/threads";
import { formatDealAmount } from "./deal-model";

export interface DealOfferCardProps {
  offerId: string;
  /** 报价的最新状态与条款；还没取到时只画标题。 */
  offer: DealOffer | null;
  fallbackTitle: string;
  viewerId: string | null;
  busy?: boolean;
  error?: string | null;
  onAct: (offerId: string, action: DealOfferAction) => void;
  onOpenOrder?: (contractId: string) => void;
}

export function dealOfferStateLabel(tt: UITranslate, state: DealOfferState): string {
  switch (state) {
    case "accepted":
      return tt("已接受");
    case "declined":
      return tt("已拒绝");
    case "withdrawn":
      return tt("已撤回");
    case "expired":
      return tt("已过期");
    default:
      return tt("等待回复");
  }
}

export function revisionsText(tt: UITranslate, revisions: number): string {
  return revisions < 0 ? tt("不限改稿") : tt("改稿 {n} 次", { n: revisions });
}

export function DealOfferCard({
  offerId,
  offer,
  fallbackTitle,
  viewerId,
  busy = false,
  error = null,
  onAct,
  onOpenOrder,
}: DealOfferCardProps) {
  const tt = useUI();
  const can = offer ? offerPermissions(offer, viewerId) : { accept: false, decline: false, withdraw: false };
  const settled = Boolean(offer && offer.state !== "pending");
  return (
    <div
      data-deal-offer={offerId}
      data-offer-state={offer?.state ?? "unknown"}
      className="w-full max-w-[340px] rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-neutral-500">{tt("报价")}</span>
        {offer ? (
          <span
            data-offer-state-label
            className={
              "rounded-md px-2 py-0.5 text-[11px] " +
              (offer.state === "accepted"
                ? "bg-emerald-50 text-emerald-700"
                : settled
                  ? "bg-neutral-100 text-neutral-500"
                  : "bg-amber-50 text-amber-700")
            }
          >
            {dealOfferStateLabel(tt, offer.state)}
          </span>
        ) : null}
      </div>
      <p className="mt-1 break-words text-[14px] font-semibold">{offer?.title || fallbackTitle}</p>
      {offer ? (
        <>
          <p className="mt-1 text-[13px] text-neutral-700">
            <span data-offer-amount className="font-medium text-neutral-900">
              {formatDealAmount(offer.price_fen, offer.currency || "usd")}
            </span>
            {" · "}
            {tt("{n} 天交付", { n: offer.delivery_days })}
            {" · "}
            {revisionsText(tt, offer.revisions)}
          </p>
          {offer.description ? (
            <p className="mt-1.5 line-clamp-5 whitespace-pre-wrap break-words text-[12.5px] text-neutral-600">
              {offer.description}
            </p>
          ) : null}
          {offer.state === "accepted" && offer.contract_id ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-neutral-500">{tt("订单已生成")}</span>
              {onOpenOrder ? (
                <button
                  type="button"
                  data-offer-open-order
                  onClick={() => offer.contract_id && onOpenOrder(offer.contract_id)}
                  className="rounded-lg border border-neutral-200 px-2.5 py-0.5 text-[12px] text-neutral-700 hover:bg-neutral-50"
                >
                  {tt("查看订单")}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      {can.accept || can.decline || can.withdraw ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {can.accept ? (
            <button
              type="button"
              disabled={busy}
              data-offer-action="accept"
              onClick={() => onAct(offerId, "accept")}
              className="rounded-lg bg-neutral-900 px-3 py-1 text-[12px] text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {tt("接受报价")}
            </button>
          ) : null}
          {can.decline ? (
            <button
              type="button"
              disabled={busy}
              data-offer-action="decline"
              onClick={() => onAct(offerId, "decline")}
              className="rounded-lg border border-neutral-200 px-3 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {tt("拒绝")}
            </button>
          ) : null}
          {can.withdraw ? (
            <button
              type="button"
              disabled={busy}
              data-offer-action="withdraw"
              onClick={() => onAct(offerId, "withdraw")}
              className="rounded-lg border border-neutral-200 px-3 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {tt("撤回报价")}
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" data-offer-error className="mt-2 text-[12px] text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
