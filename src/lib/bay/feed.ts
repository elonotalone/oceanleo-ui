// Bay 信息流与待办数（oceanleo-bay 契约 §3.3 / §3.4）。信息流不登录也能取；待办数要登录。
import { bayGet } from "./http";
import type { BayFeedItem, BayFeedKind, BayFeedPage, BaySummary } from "./types";

/** `supply` = 服务 + 答疑（素材是服务里的数字商品）；`needs` = 需求 + 求助。`/bay` 页只用这两个。 */
export type BayFeedGroup = "supply" | "needs";
export type BayFeedKindFilter = "all" | BayFeedGroup | BayFeedKind;

export interface BayFeedQuery {
  kind?: BayFeedKindFilter;
  category?: string | null;
  q?: string | null;
  limit?: number;
}

const FEED_KINDS: readonly BayFeedKind[] = ["demand", "service", "help", "consult"];
const SLUG = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const MAX_Q = 60;

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

/** 被取消的请求：不要画成网络错误。 */
export function isBayFeedAbort(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { name?: unknown }).name === "AbortError";
}

/** 没登录或被拒绝：逛信息流时当成空列表，不是故障。 */
export function isBayFeedAuthMiss(error: unknown): boolean {
  const status = errorStatus(error);
  return status === 401 || status === 403;
}

export function isBayFeedNetworkFailure(error: unknown): boolean {
  const status = errorStatus(error);
  return status === 0 || (status !== null && status >= 500);
}

export type BayFeedCaughtAction = "ignore" | "empty" | "error";

export function classifyBayFeedCaught(
  error: unknown,
  ctx: { stale?: boolean; aborted?: boolean } = {},
): BayFeedCaughtAction {
  if (ctx.stale || ctx.aborted || isBayFeedAbort(error)) return "ignore";
  if (isBayFeedAuthMiss(error)) return "empty";
  return "error";
}

export function bayFeedErrorText(error: unknown): string {
  if (isBayFeedNetworkFailure(error)) return "网络错误，请稍后再试。";
  return error instanceof Error && error.message ? error.message : "加载失败，请稍后再试。";
}

export function bayFeedPath(filter: BayFeedQuery = {}, cursor?: string | null): string {
  const params = new URLSearchParams();
  const known = filter.kind === "all" || filter.kind === "supply" || filter.kind === "needs" || FEED_KINDS.includes(filter.kind as BayFeedKind);
  const kind = filter.kind && known ? filter.kind : "all";
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
  try {
    const raw = await bayGet<unknown>(bayFeedPath(filter, cursor), { anonymous: true, signal: opts?.signal });
    return normalizeBayFeedPage(raw);
  } catch (error) {
    if (isBayFeedAbort(error) || opts?.signal?.aborted) {
      if (isBayFeedAbort(error) && error instanceof Error) throw error;
      const aborted = new Error("Aborted");
      aborted.name = "AbortError";
      throw aborted;
    }
    if (isBayFeedAuthMiss(error)) return { items: [], next_cursor: null };
    throw error;
  }
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
