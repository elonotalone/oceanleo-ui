"use client";

// The right panel's `quote` view (session / sites wave 2026-11-21): a quote card's snapshot as read-only messages in
// the conversation look, titled "N messages from <source>". No composer, no actions: the lines are a copy.
import type { ImMessage, ImQuoteItem } from "../../lib/im/types";
import { useUI } from "../../i18n/ui/useUI";
import { BackButton } from "../../ui/BackButton";
import { quoteCardOf } from "./card-model";

export interface QuoteMessagesPanelProps {
  message: ImMessage;
  onBack: () => void;
}

function sentAt(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function QuoteLine({ item }: { item: ImQuoteItem }) {
  const tt = useUI();
  const name = item.sender_name || "?";
  return (
    <li className="flex gap-2.5 px-4 py-2" data-quote-line="">
      <span aria-hidden="true"
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-stone-200 text-[12px] font-medium text-stone-600 dark:bg-stone-700 dark:text-stone-200">
        {Array.from(name)[0]?.toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium text-stone-800 dark:text-stone-100">{name}</span>
          <span className="shrink-0 text-[11px] text-stone-400">{sentAt(item.sent_at)}</span>
        </div>
        {item.text ? (
          <p className="whitespace-pre-wrap break-words text-[14px] leading-6 text-stone-800 dark:text-stone-100">{item.text}</p>
        ) : null}
        {item.file_name ? (
          <p className="mt-1 inline-flex max-w-full rounded-lg bg-stone-100 px-2 py-1 text-[12px] text-stone-600 dark:bg-stone-800 dark:text-stone-300" data-quote-file="">
            <span className="truncate">{tt("文件：{name}", { name: item.file_name })}</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function QuoteMessagesPanel({ message, onBack }: QuoteMessagesPanelProps) {
  const tt = useUI();
  const card = quoteCardOf(message);
  const title = card ? tt("来自「{title}」的 {n} 条消息", { title: card.sourceTitle || tt("聊天"), n: card.count }) : "";
  return (
    <section data-quote-panel="" className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-stone-900">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-stone-200/80 px-2 dark:border-stone-800">
        <BackButton onClick={onBack} label={tt("返回")} data-quote-back="" />
        <h2 className="min-w-0 truncate text-[13px] font-semibold text-stone-800 dark:text-stone-100" data-quote-title="">{title}</h2>
      </header>
      <ol className="min-h-0 flex-1 overflow-auto py-2" aria-label={title}>
        {(card?.items ?? []).map((item, index) => <QuoteLine key={index} item={item} />)}
      </ol>
    </section>
  );
}
