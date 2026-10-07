"use client";

// 交易会话的消息列表：文字、附件、报价卡、系统消息；被运营隐藏的消息只显示占位。
// 正文一律当纯文字（React 文本节点）渲染，附件只认 http(s) 地址：图片用 <img>，其余只给下载链接。

import { useEffect, useRef } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImAttachment, ImMessage } from "../../../lib/im/types";
import { TalentOfferCard } from "./TalentOfferCard";
import type { TalentOffer, TalentOfferAction } from "./talent-api";

export interface TalentMessageListProps {
  messages: ImMessage[];
  viewerId: string | null;
  offers: Record<string, TalentOffer>;
  onOfferAct: (offerId: string, action: TalentOfferAction) => void;
  busyOfferId?: string | null;
  offerError?: { offerId: string; message: string } | null;
  openUrl?: string | null;
  /** 举报一条别人发的消息。 */
  onReport?: (message: ImMessage) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** 对方的名字，用在每条消息上方。 */
  peerName?: string;
}

export function httpUrlOf(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
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

function AttachmentView({ attachment }: { attachment: ImAttachment }) {
  const tt = useUI();
  const href = httpUrlOf(attachment.url);
  if (!href) return null;
  const name = attachment.name || tt("附件");
  if (attachment.kind === "image") {
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
      data-attachment={attachment.kind}
      className="block max-w-full truncate text-[13px] text-neutral-700 underline-offset-2 hover:underline"
    >
      {name}
    </a>
  );
}

export function TalentMessageList(props: TalentMessageListProps) {
  const tt = useUI();
  const { messages, viewerId, offers, onOfferAct, busyOfferId = null, offerError = null, openUrl = null, onReport, hasMore, loadingMore, onLoadMore, peerName } = props;
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
    <div ref={scrollerRef} data-talent-messages className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {hasMore && (
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
      )}
      <ul className="flex flex-col gap-3">
        {messages.map((message) => {
          const mine = Boolean(viewerId) && message.sender_id === viewerId;
          if (message.kind === "system") {
            return (
              <li key={message.id} data-message-id={message.id} data-message-kind="system" className="text-center text-[12px] text-neutral-500">
                {message.body}
              </li>
            );
          }
          const hidden = message.hidden_reason === "moderation";
          const offerId = message.card?.type === "talent_offer" ? message.card.id : null;
          return (
            <li
              key={message.id}
              data-message-id={message.id}
              data-mine={mine ? "true" : "false"}
              className={"group flex flex-col gap-1 " + (mine ? "items-end" : "items-start")}
            >
              {!mine && peerName ? <span className="px-1 text-[11px] text-neutral-500">{peerName}</span> : null}
              {hidden ? (
                <p data-message-hidden className="rounded-2xl bg-neutral-100 px-3 py-2 text-[13px] italic text-neutral-500">
                  {tt("该消息因违反规则已隐藏")}
                </p>
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
                  {message.attachments.map((attachment, index) => (
                    <div key={`${message.id}.${index}`} className="max-w-[85%]">
                      <AttachmentView attachment={attachment} />
                    </div>
                  ))}
                  {offerId && message.card ? (
                    <TalentOfferCard
                      card={message.card}
                      offer={offers[offerId] ?? null}
                      viewerId={viewerId}
                      busy={busyOfferId === offerId}
                      error={offerError && offerError.offerId === offerId ? offerError.message : null}
                      onAct={onOfferAct}
                      openUrl={openUrl}
                    />
                  ) : null}
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
