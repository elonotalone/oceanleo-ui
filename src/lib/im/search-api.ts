// 消息搜索接口（契约 §4.2 `GET /v1/im/search`）。W09 持有。

import { imFetch } from "./client";
import type { ImConversationKind, ImMessageKind, ImPage, ImSearchHit } from "./types";
import type { ImFetcher } from "./messages-api";

/** 搜索至少要这么多个字符（契约：q ≥ 2 个字符）。 */
export const SEARCH_MIN_CHARS = 2;

export interface SearchParams {
  q: string;
  conversation_id?: string | null;
  /** 发送人 user_id。 */
  from?: string | null;
  kind?: ImMessageKind | "" | null;
  /** 时间范围：早于（ISO 时间）。 */
  before?: string | null;
  /** 时间范围：晚于（ISO 时间）。 */
  after?: string | null;
  cursor?: string | null;
}

/** 去掉首尾空白后的查询词；够不够长看字符数而不是字节数（中日韩两个字就够）。 */
export function normalizeSearchQuery(value: string): string {
  return value.trim();
}

export function searchQueryReady(value: string): boolean {
  return Array.from(normalizeSearchQuery(value)).length >= SEARCH_MIN_CHARS;
}

/** 拼出请求路径；空筛选条件一律不带。 */
export function buildSearchPath(params: SearchParams): string {
  const search = new URLSearchParams();
  search.set("q", normalizeSearchQuery(params.q));
  if (params.conversation_id) search.set("conversation_id", params.conversation_id);
  if (params.from) search.set("from", params.from);
  if (params.kind) search.set("kind", params.kind);
  if (params.before) search.set("before", params.before);
  if (params.after) search.set("after", params.after);
  if (params.cursor) search.set("cursor", params.cursor);
  return `/v1/im/search?${search.toString()}`;
}

export function createSearchApi(fetcher: ImFetcher) {
  return {
    search(params: SearchParams): Promise<ImPage<ImSearchHit>> {
      return fetcher(buildSearchPath(params));
    },
  };
}

export type SearchApi = ReturnType<typeof createSearchApi>;

export const searchApi: SearchApi = createSearchApi(<T,>(path: string, init?: RequestInit & { json?: unknown }) => imFetch<T>(path, init));

export type SearchConversationRef = { id: string; title: string; kind: ImConversationKind };
