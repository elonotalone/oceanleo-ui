// Bay 信息流与待办数（oceanleo-bay 契约 §3.3 / §3.4）。信息流不登录也能取；待办数要登录。
import { bayGet } from "./http";
import type { BayFeedItem, BayFeedKind, BayFeedPage, BaySummary } from "./types";

export type BayFeedKindFilter = "all" | BayFeedKind;

export interface BayFeedQuery {
  kind?: BayFeedKindFilter;
  category?: string | null;
  q?: string | null;
  limit?: number;
}

const FEED_KINDS: readonly BayFeedKind[] = ["demand", "service", "help", "consult"];
const SLUG = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const MAX_Q = 60;

export function bayFeedPath(filter: BayFeedQuery = {}, cursor?: string | null): string {
  const params = new URLSearchParams();
  const kind = filter.kind && (filter.kind === "all" || FEED_KINDS.includes(filter.kind)) ? filter.kind : "all";
  params.set("kind", kind);
  const category = typeof filter.category === "string" ? filter.category.trim() : "";
  if (SLUG.test(category)) params.set("category", category);
  const q = typeof filter.q === "string" ? filter.q.trim().slice(0, MAX_Q) : "";
  if (q) params.set("q", q);
  if (typeof cursor === "string" && cursor) params.set("cursor", cursor.slice(0, 400));
  if (typeof filter.limit === "number" && Number.isFinite(filter.limit)) {
    params.set("limit", String(Math.min(40, Math.max(1, Math.round(filter.limit)))));
  }
  return `/v1/talent/bay/feed?${params.toString()}`;
}

function isFeedItem(value: unknown): value is BayFeedItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BayFeedItem>;
  return (
    typeof item.id === "string" &&
    !!item.id &&
    typeof item.title === "string" &&
    FEED_KINDS.includes(item.kind as BayFeedKind) &&
    !!item.author &&
    typeof item.author === "object"
  );
}

/** 只留形状对的条目；`next_cursor` 不是非空字符串就当没有下一页。 */
export function normalizeBayFeedPage(raw: unknown): BayFeedPage {
  const body = (raw && typeof raw === "object" ? raw : {}) as { items?: unknown; next_cursor?: unknown };
  const items = Array.isArray(body.items) ? body.items.filter(isFeedItem) : [];
  const next = typeof body.next_cursor === "string" && body.next_cursor ? body.next_cursor : null;
  return { items, next_cursor: next };
}

export async function fetchBayFeed(
  filter: BayFeedQuery = {},
  cursor?: string | null,
  opts?: { signal?: AbortSignal },
): Promise<BayFeedPage> {
  const raw = await bayGet<unknown>(bayFeedPath(filter, cursor), { anonymous: true, signal: opts?.signal });
  return normalizeBayFeedPage(raw);
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function normalizeBaySummary(raw: unknown): BaySummary {
  const body = (raw && typeof raw === "object" ? raw : {}) as { needs_action?: unknown; items?: Record<string, unknown> };
  const items = body.items && typeof body.items === "object" ? body.items : {};
  return {
    needs_action: count(body.needs_action),
    items: { proposals: count(items.proposals), orders: count(items.orders), help: count(items.help) },
  };
}

export async function fetchBaySummary(opts?: { signal?: AbortSignal }): Promise<BaySummary> {
  const raw = await bayGet<unknown>("/v1/talent/bay/summary", { signal: opts?.signal });
  return normalizeBaySummary(raw);
}
