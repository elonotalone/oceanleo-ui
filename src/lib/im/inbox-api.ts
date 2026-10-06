// 收件箱与未读的 REST（work-chat 契约 §4.1）。
import { imFetch } from "./client";
import type { ImConversationSummary, ImPage, ImUnread } from "./types";

export const INBOX_FILTERS = ["all", "unread", "mentions", "dm", "group", "team", "project", "talent"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export function isInboxFilter(value: string): value is InboxFilter {
  return (INBOX_FILTERS as readonly string[]).includes(value);
}

export function conversationsPath(filter: string, cursor?: string | null, limit = 30): string {
  const params = new URLSearchParams();
  params.set("filter", isInboxFilter(filter) ? filter : "all");
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  return `/v1/im/conversations?${params.toString()}`;
}

export function fetchConversations(
  filter: string,
  cursor?: string | null,
): Promise<ImPage<ImConversationSummary>> {
  return imFetch<ImPage<ImConversationSummary>>(conversationsPath(filter, cursor));
}

export function fetchUnread(): Promise<ImUnread> {
  return imFetch<ImUnread>("/v1/im/unread");
}

/** 有草稿的会话 id（收件箱行上的「草稿」提示）。接口形状不确定时宁可不显示。 */
export async function fetchDraftConversationIds(): Promise<Set<string>> {
  try {
    const res = await imFetch<unknown>("/v1/im/drafts");
    const list = Array.isArray(res) ? res : (res as { items?: unknown } | null)?.items;
    const ids = new Set<string>();
    if (Array.isArray(list)) {
      for (const row of list) {
        const r = row as { conversation_id?: unknown; body?: unknown; thread_root_id?: unknown };
        if (typeof r.conversation_id === "string" && typeof r.body === "string" && r.body.trim() && !r.thread_root_id) {
          ids.add(r.conversation_id);
        }
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}
