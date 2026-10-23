// LeoChat 的未读合计（纯函数）。
//
// 规则（境内外同一条）：LeoChat 入口角标 / 标签页标题 / 「聊天」标签徽标上的数字
//   = 会话未读（IM `unread.total`，静音会话本来就不进 total）+ 平台通知未读（`/v1/notifications` 的 `unread_count`）。
// 联系人标签的数字仍只是联系请求数（`unread.requests`），不掺通知。
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
  /** 入口角标 / 标题 / 「聊天」标签用的合计 = chat + notices。 */
  total: number;
}

export function combineUnread(chat: unknown, notices: unknown): number {
  return cleanCount(chat) + cleanCount(notices);
}

export function leoChatUnread(
  im: { total?: unknown; requests?: unknown } | null | undefined,
  noticeUnread: unknown,
): LeoChatUnread {
  const chat = cleanCount(im?.total);
  const notices = cleanCount(noticeUnread);
  return { chat, notices, requests: cleanCount(im?.requests), total: chat + notices };
}

export const EMPTY_LEOCHAT_UNREAD: LeoChatUnread = Object.freeze({ chat: 0, notices: 0, requests: 0, total: 0 });

/** 数字徽标上的字：0 不显示，超过 99 显示 99+（与会话行同一把尺子）。 */
export function unreadBadgeText(count: unknown): string {
  return formatBadge(cleanCount(count));
}
