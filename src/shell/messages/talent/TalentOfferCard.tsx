"use client";

// 交易会话里的报价卡片：规则与 talent 站一模一样。
// 买家（收到报价的人）可以接受 / 拒绝，卖家（发出的人）可以撤回；接受会生成草稿订单（服务端照旧校验，
// 包括服务条款与过期）。内容一律当纯文字渲染。

import { useUI } from "../../../i18n/ui/useUI";
import type { UITranslate } from "../../../i18n/ui/useUI";
import type { ImCard } from "../../../lib/im/types";
import { offerActionsFor, type TalentOffer, type TalentOfferAction, type TalentOfferState } from "./talent-api";

export interface TalentOfferCardProps {
  card: ImCard;
  /** 报价的最新状态与条款；还没取到时只画卡片标题。 */
  offer?: TalentOffer | null;
  viewerId: string | null;
  busy?: boolean;
  error?: string | null;
  onAct: (offerId: string, action: TalentOfferAction) => void;
  /** 「在 LeoBay 打开」；境内没有 Bay 时为 null，不画链接。 */
  openUrl?: string | null;
}

export function offerStateLabel(tt: UITranslate, state: TalentOfferState): string {
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

function amountText(offer: TalentOffer): string {
  const amount = ((Number.isFinite(offer.price_fen) ? offer.price_fen : 0) / 100).toFixed(2);
  return offer.currency ? `${amount} ${offer.currency}` : amount;
}

export function TalentOfferCard({ card, offer, viewerId, busy = false, error = null, onAct, openUrl = null }: TalentOfferCardProps) {
  const tt = useUI();
  const actions = offer ? offerActionsFor(offer, viewerId) : { accept: false, decline: false, withdraw: false };
  const settled = offer && offer.state !== "pending";
  return (
    <div
      data-talent-offer={card.id}
      data-offer-state={offer?.state ?? "unknown"}
      className="w-full max-w-[320px] rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{tt("报价")}</span>
        {offer && (
          <span
            data-offer-state-label
            className={
              "rounded-full px-2 py-0.5 text-[11px] " +
              (offer.state === "accepted"
                ? "bg-emerald-50 text-emerald-700"
                : settled
                  ? "bg-neutral-100 text-neutral-500"
                  : "bg-neutral-100 text-neutral-600")
            }
          >
            {offerStateLabel(tt, offer.state)}
          </span>
        )}
      </div>
      <p className="mt-1 break-words text-[14px] font-semibold">{offer?.title || card.title}</p>
      {offer ? (
        <>
          <p className="mt-1 text-[13px] text-neutral-700">
            <span data-offer-amount>{amountText(offer)}</span>
            {" · "}
            {tt("{n} 天交付", { n: offer.delivery_days })}
            {" · "}
            {offer.revisions < 0 ? tt("不限改稿") : tt("改稿 {n} 次", { n: offer.revisions })}
          </p>
          {offer.description ? (
            <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-[12.5px] text-neutral-600">{offer.description}</p>
          ) : null}
          {offer.contract_id && offer.state === "accepted" ? (
            <p className="mt-1.5 text-[12px] text-neutral-500">{tt("草稿订单已生成，可在 LeoBay 的订单里继续。")}</p>
          ) : null}
        </>
      ) : card.subtitle ? (
        <p className="mt-1 text-[13px] text-neutral-700">{card.subtitle}</p>
      ) : null}
      {(actions.accept || actions.decline || actions.withdraw) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {actions.accept && (
            <button
              type="button"
              disabled={busy}
              data-offer-action="accept"
              onClick={() => onAct(card.id, "accept")}
              className="rounded-lg bg-neutral-900 px-3 py-1 text-[12px] text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {tt("接受报价")}
            </button>
          )}
          {actions.decline && (
            <button
              type="button"
              disabled={busy}
              data-offer-action="decline"
              onClick={() => onAct(card.id, "decline")}
              className="rounded-lg border border-neutral-200 px-3 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {tt("拒绝")}
            </button>
          )}
          {actions.withdraw && (
            <button
              type="button"
              disabled={busy}
              data-offer-action="withdraw"
              onClick={() => onAct(card.id, "withdraw")}
              className="rounded-lg border border-neutral-200 px-3 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {tt("撤回报价")}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" data-offer-error className="mt-2 text-[12px] text-red-600">
          {error}
        </p>
      )}
      {openUrl && (
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-offer-open
          className="mt-2 inline-block text-[12px] font-medium text-neutral-800 underline underline-offset-2 hover:text-neutral-900"
        >
          {tt("在 LeoBay 打开")}
        </a>
      )}
    </div>
  );
}
