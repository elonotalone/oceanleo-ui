"use client";

// The small centred time above a message (see chat-time-separators.ts). One
// look for the task chat and LeoChat: muted 12 px text, no rule lines, no pill.

import { formatChatTime } from "./chat-time-separators";

function documentLocale(): string | undefined {
  if (typeof document !== "undefined" && document.documentElement.lang) return document.documentElement.lang;
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return undefined;
}

export const CHAT_TIME_SEPARATOR_CLASS =
  "select-none pb-1 pt-3 text-center text-[12px] leading-none text-stone-400";

export function ChatTimeSeparator({ at, locale }: { at: number; locale?: string }) {
  const label = formatChatTime(at, { locale: locale || documentLocale() });
  return (
    <div className={CHAT_TIME_SEPARATOR_CLASS} data-chat-time-separator="">
      {/* Server and browser may sit in different time zones: the browser's text wins. */}
      <time dateTime={new Date(at).toISOString()} suppressHydrationWarning>
        {label}
      </time>
    </div>
  );
}
