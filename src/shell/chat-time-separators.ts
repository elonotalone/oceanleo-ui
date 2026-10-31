// One rule for the small centred time above a message (Manus "Today 4:54 PM",
// WeChat / ChatGPT style), shared by the task chat (OceanLeo + computer
// conversations) and LeoChat (2026-10-31 W4).
//
// - The first anchor message with a known time gets a separator.
// - A later anchor gets one again when it comes more than CHAT_TIME_GAP_MS after
//   the previous anchor, or on a different local day.
// - Anchors sent in quick succession get none.
// The task chat anchors on user messages only; LeoChat anchors on every message.
// Items without a known time never get a separator and never reset the clock.

/** Five minutes, the WeChat gap; equals LeoChat's avatar-grouping window. */
export const CHAT_TIME_GAP_MS = 5 * 60 * 1000;

const DAY_MS = 86_400_000;

/** ISO string / epoch (s or ms) → epoch ms; anything else → null. */
export function chatTimeMs(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function sameLocalDay(a: number, b: number): boolean {
  return startOfLocalDay(a) === startOfLocalDay(b);
}

export interface ChatTimeSeparatorOptions<T> {
  /** Epoch ms of the item, or null when unknown. */
  timeOf: (item: T, index: number) => number | null;
  /** Which items can carry a separator and count as "the previous one". Default: all. */
  isAnchor?: (item: T, index: number) => boolean;
  gapMs?: number;
}

/** Index → epoch ms of every item that gets a time separator above it. */
export function chatTimeSeparators<T>(
  items: readonly T[],
  options: ChatTimeSeparatorOptions<T>,
): Map<number, number> {
  const gap = options.gapMs ?? CHAT_TIME_GAP_MS;
  const out = new Map<number, number>();
  let previous: number | null = null;
  items.forEach((item, index) => {
    if (options.isAnchor && !options.isAnchor(item, index)) return;
    const at = options.timeOf(item, index);
    if (at === null) return;
    if (previous === null || at - previous > gap || !sameLocalDay(at, previous)) out.set(index, at);
    previous = at;
  });
  return out;
}

/** The task chat's message shape, kept structural so this file stays dependency-free. */
export interface TimedChatMessage {
  role: string;
  created_at?: string;
  meta?: { native?: unknown; native_pending?: unknown; [key: string]: unknown };
}

/**
 * Task chat: separators above user messages. A just-sent user bubble that has
 * no saved time yet (cloud optimistic bubble, queued native first prompt) and is
 * the newest user message counts as "now", so its separator does not pop in a
 * second later when the saved copy arrives. Saved native history without a
 * time stays without a separator rather than showing a wrong one.
 */
export function agentMessageTimeSeparators(
  messages: readonly TimedChatMessage[],
  now: number = Date.now(),
): Map<number, number> {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      lastUser = i;
      break;
    }
  }
  return chatTimeSeparators(messages, {
    isAnchor: (message) => message.role === "user",
    timeOf: (message, index) => {
      const at = chatTimeMs(message.created_at) ?? chatTimeMs(message.meta?.created_at);
      if (at !== null) return at;
      const fresh = message.meta?.native !== true || message.meta?.native_pending === true;
      return index === lastUser && fresh ? now : null;
    },
  });
}

function safeLocale(locale: string | undefined): string {
  const candidate = (locale || "").trim();
  if (!candidate) return "zh-CN";
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([candidate]).length ? candidate : "en";
  } catch {
    return "en";
  }
}

function capitalize(value: string, locale: string): string {
  return value ? value.charAt(0).toLocaleUpperCase(locale) + value.slice(1) : value;
}

/**
 * "Today 4:54 PM" / "今天 16:54"; "Yesterday …" / "昨天 …"; within a week the
 * weekday; earlier the date (with the year once it is not this year). All words
 * come from Intl, so every locale is covered without a copy table.
 */
export function formatChatTime(at: number, options: { locale?: string; now?: number } = {}): string {
  const locale = safeLocale(options.locale);
  const now = options.now ?? Date.now();
  const date = new Date(at);
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(at)) / DAY_MS);
  // 24-hour locales read "09:05" (WeChat / Manus zh); 12-hour ones keep "9:05 AM".
  const cycle = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle;
  const hour = cycle === "h23" || cycle === "h24" ? "2-digit" : "numeric";
  const time = new Intl.DateTimeFormat(locale, { hour, minute: "2-digit" }).format(date);
  if (days === 0 || days === 1) {
    const word = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-days, "day");
    return `${capitalize(word, locale)} ${time}`;
  }
  if (days > 1 && days < 7) {
    return `${new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date)} ${time}`;
  }
  const sameYear = new Date(now).getFullYear() === date.getFullYear();
  const day = new Intl.DateTimeFormat(locale, sameYear
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" }).format(date);
  return `${day} ${time}`;
}
