"use client";

// 交易会话的消息列表：文字、文件、报价卡、灰字行；被运营隐藏的只显示占位。
// 正文一律当纯文字（React 文本节点）；文件只认 https 地址，图片用 <img>，其余给新窗口打开的链接。

import { useEffect, useRef } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  dealAttachmentKind,
  safeAttachmentUrl,
  type DealAttachment,
  type DealMessage,
  type DealOffer,
  type DealOfferAction,
} from "../../../lib/bay/threads";
import { DealOfferCard } from "./DealOfferCard";
import { DealSystemLine } from "./DealSystemLine";
import type { DealLineTarget } from "./deal-lines";

export interface DealMessageListProps {
  messages: DealMessage[];
  offers: Record<string, DealOffer>;
  viewerId: string | null;
  peerName?: string;
  contractId: string | null;
  busyOfferId?: string | null;
  offerError?: { offerId: string; message: string } | null;
  onOfferAct: (offerId: string, action: DealOfferAction) => void;
  onOpenOrder?: (contractId: string) => void;
  onLineAction?: (target: DealLineTarget) => void;
  onReport?: (message: DealMessage) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** 还没有消息时显示的话。 */
  emptyHint?: string;
}

function formatTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);
  } catch {
    return "";
  }
}

export function DealAttachmentView({ attachment }: { attachment: Partial<DealAttachment> }) {
  const tt = useUI();
  const href = safeAttachmentUrl(attachment.url);
  if (!href) return null;
  const name = (attachment.name || "").trim() || tt("附件");
  if (dealAttachmentKind(attachment.kind) === "image") {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" data-attachment="image" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={name} loading="lazy" className="max-h-56 max-w-full rounded-lg object-contain" />
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download
      data-attachment={dealAttachmentKind(attachment.kind)}
      className="flex max-w-full items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] text-sky-700 hover:bg-neutral-50"
    >
      <span aria-hidden="true">📎</span>
      <span className="truncate underline underline-offset-2">{name}</span>
    </a>
  );
}

export function DealMessageList(props: DealMessageListProps) {
  const tt = useUI();
  const {
    messages,
    offers,
    viewerId,
    peerName,
    contractId,
    busyOfferId = null,
    offerError = null,
    onOfferAct,
    onOpenOrder,
    onLineAction,
    onReport,
    hasMore,
    loadingMore,
    onLoadMore,
    emptyHint,
  } = props;
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const lastId = messages.length ? messages[messages.length - 1].id : "";

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stickRef.current) endRef.current?.scrollIntoView?.({ block: "end" });
  }, [lastId, messages.length]);

  return (
    <div ref={scrollerRef} data-deal-messages className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {hasMore ? (
        <div className="pb-3 text-center">
          <button
            type="button"
            disabled={loadingMore}
            data-action="load-more"
            onClick={onLoadMore}
            className="rounded-lg border border-neutral-200 px-3 py-1 text-[12px] text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loadingMore ? tt("加载中…") : tt("加载更早的消息")}
          </button>
        </div>
      ) : null}
      {messages.length === 0 && emptyHint ? (
        <p data-deal-empty className="px-4 py-10 text-center text-[13px] text-neutral-400">
          {emptyHint}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {messages.map((message) => {
          if (message.kind === "system") {
            return (
              <DealSystemLine
                key={message.id}
                message={message}
                contractId={contractId}
                onAction={onLineAction}
              />
            );
          }
          const mine = Boolean(viewerId) && message.user_id === viewerId;
          const hidden = Boolean(message.moderation_hidden);
          const meta = message.meta && typeof message.meta === "object" ? message.meta : {};
          const offerId = message.kind === "offer" && typeof meta.offer_id === "string" ? meta.offer_id : null;
          const attachments = hidden ? [] : message.attachments || [];
          return (
            <li
              key={message.id}
              data-message-id={message.id}
              data-message-kind={message.kind}
              data-mine={mine ? "true" : "false"}
              className={"group flex flex-col gap-1 " + (mine ? "items-end" : "items-start")}
            >
              {!mine && peerName ? <span className="px-1 text-[11px] text-neutral-500">{peerName}</span> : null}
              {hidden ? (
                <p data-message-hidden className="rounded-2xl bg-neutral-100 px-3 py-2 text-[13px] italic text-neutral-500">
                  {tt("该消息因违反规则已隐藏")}
                </p>
              ) : offerId ? (
                <DealOfferCard
                  offerId={offerId}
                  offer={offers[offerId] ?? null}
                  fallbackTitle={message.body || tt("报价")}
                  viewerId={viewerId}
                  busy={busyOfferId === offerId}
                  error={offerError && offerError.offerId === offerId ? offerError.message : null}
                  onAct={onOfferAct}
                  onOpenOrder={onOpenOrder}
                />
              ) : (
                <>
                  {message.body ? (
                    <p
                      data-message-body
                      className={
                        "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[14px] " +
                        (mine ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900")
                      }
                    >
                      {message.body}
                    </p>
                  ) : null}
                  {attachments.map((attachment, index) => (
                    <div key={`${message.id}.${index}`} className="max-w-[85%]">
                      <DealAttachmentView attachment={attachment} />
                    </div>
                  ))}
                </>
              )}
              <span className="flex items-center gap-2 px-1 text-[11px] text-neutral-400">
                <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                {!mine && !hidden && onReport ? (
                  <button
                    type="button"
                    data-action="report-message"
                    onClick={() => onReport(message)}
                    className="opacity-0 hover:text-neutral-700 focus:opacity-100 group-hover:opacity-100"
                  >
                    {tt("举报")}
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div ref={endRef} />
    </div>
  );
}
