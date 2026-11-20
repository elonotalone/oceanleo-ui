"use client";

// A quote card (session / sites wave 2026-11-21, contract §1 / §2.2): a snapshot of chat / session messages,
// "N messages from <source>" and the first two lines. Every member of the conversation can read it; later edits or
// recalls of the source messages do not change it. Click → the snapshot read-only in the right panel.
// The card draws its own single frame; the conversation renders it without a bubble.
import type { ImMessage } from "../../lib/im/types";
import { useUI } from "../../i18n/ui/useUI";
import { quoteCardOf, quoteLineText, quotePreview } from "./card-model";
import { openQuotePanel } from "./open-quote";

export interface QuoteCardViewProps {
  /** `message.card = { type: "quote", source_title, count, items }`. */
  message: ImMessage;
  conversationId: string;
  /** Default: the right panel (`openQuotePanel(message)`). */
  onOpenQuote?: (message: ImMessage) => void;
}

export function QuoteCardView({ message, onOpenQuote }: QuoteCardViewProps) {
  const tt = useUI();
  const card = quoteCardOf(message);
  if (!card) return null;
  const heading = tt("来自「{title}」的 {n} 条消息", { title: card.sourceTitle || tt("聊天"), n: card.count });
  return (
    <button
      type="button"
      onClick={() => (onOpenQuote ?? openQuotePanel)(message)}
      data-quote-card=""
      className={
        "flex w-[300px] max-w-full flex-col gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-left " +
        "hover:border-stone-300 hover:bg-stone-50   "
      }
    >
      <span className="truncate text-[13px] font-medium text-stone-900" data-quote-card-title="">{heading}</span>
      {quotePreview(card).map((item, index) => (
        <span key={index} className="truncate text-[12px] text-stone-500" data-quote-card-line="">
          {item.sender_name ? `${item.sender_name}: ` : ""}{quoteLineText(item)}
        </span>
      ))}
    </button>
  );
}
