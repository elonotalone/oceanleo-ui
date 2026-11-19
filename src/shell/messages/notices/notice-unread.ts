import { formatBadge } from "../realtime/store";

/** 不是有限的正数一律当 0；小数向下取整。 */
export function cleanCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export interface LeoChatUnread {
  /** 会话未读（IM）。 */
  chat: number;
  /** 平台通知未读。 */
  notices: number;
  /** 联系请求（联系人标签的数字）。 */
  requests: number;
}

export function leoChatUnread(
  im: { total?: unknown; requests?: unknown } | null | undefined,
  noticeUnread: unknown,
): LeoChatUnread {
  const chat = cleanCount(im?.total);
  const notices = cleanCount(noticeUnread);
  return { chat, notices, requests: cleanCount(im?.requests) };
}

export const EMPTY_LEOCHAT_UNREAD: LeoChatUnread = Object.freeze({ chat: 0, notices: 0, requests: 0 });

/** 数字徽标上的字：0 不显示，超过 99 显示 99+（与会话行同一把尺子）。 */
export function unreadBadgeText(count: unknown): string {
  return formatBadge(cleanCount(count));
}
