"use client";

// 消息搜索：输入 ≥2 字；按会话、发送人、类型、时间筛选；结果高亮；点结果跳到那条；分页。
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import { messagesApi } from "../../../lib/im/messages-api";
import { searchApi, searchQueryReady, normalizeSearchQuery } from "../../../lib/im/search-api";
import type { ImProfile, ImSearchHit } from "../../../lib/im/types";
import { splitHighlights } from "../../Markdown";
import { plainTextOf } from "../conversation/message-format";
import { useImInbox } from "../realtime/hooks";
import { EMPTY_FILTERS, SearchFilters, filtersToParams, type SearchFilterState } from "./SearchFilters";

export interface SearchViewProps {
  initialQuery?: string;
  conversationId?: string | null;
  onOpenResult: (conversationId: string, seq: number) => void;
}

export const SEARCH_DEBOUNCE_MS = 300;
const SNIPPET_BEFORE = 24;
const SNIPPET_MAX = 140;

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/**
 * 命中片段：服务端给的 `[start, end)` 字符区间优先（中日韩按子串检索，区间最准）；
 * 区间为空时回落到按查询词匹配的 `splitHighlights`。各片段拼回来逐字等于输入。
 */
export function highlightSegments(
  text: string,
  ranges: ReadonlyArray<readonly [number, number]> | null | undefined,
  query: string,
): HighlightSegment[] {
  if (ranges && ranges.length > 0 && text) {
    const clipped = ranges
      .map(([start, end]) => [Math.max(0, Math.min(start, text.length)), Math.max(0, Math.min(end, text.length))] as const)
      .filter(([start, end]) => end > start)
      .sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [start, end] of clipped) {
      const last = merged[merged.length - 1];
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    if (merged.length > 0) {
      const segments: HighlightSegment[] = [];
      let cursor = 0;
      for (const [start, end] of merged) {
        if (start > cursor) segments.push({ text: text.slice(cursor, start), hit: false });
        segments.push({ text: text.slice(start, end), hit: true });
        cursor = end;
      }
      if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
      return segments;
    }
  }
  return splitHighlights(text, normalizeSearchQuery(query));
}

/** 截一段包含第一处命中的摘要（区间随之平移）。 */
export function snippetAround(
  body: string,
  ranges: ReadonlyArray<readonly [number, number]> | null | undefined,
): { text: string; ranges: Array<[number, number]> } {
  const first = ranges?.[0]?.[0] ?? 0;
  const start = Math.max(0, first - SNIPPET_BEFORE);
  const end = Math.min(body.length, start + SNIPPET_MAX);
  const text = (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
  const offset = (start > 0 ? 1 : 0) - start;
  const shifted = (ranges ?? [])
    .map(([a, b]) => [a + offset, b + offset] as [number, number])
    .filter(([a, b]) => b > 0 && a < text.length);
  return { text, ranges: shifted };
}

function Highlighted({ segments }: { segments: HighlightSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          <mark key={index} data-search-hit="" className="bg-transparent font-semibold text-neutral-900">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

function previewText(hit: ImSearchHit, fallbacks: { file: string; card: string; voice: string }): string {
  const message = hit.message;
  if (message.body) return plainTextOf(message.body);
  if (message.card) return message.card.title;
  if (message.kind === "voice") return message.transcript?.text || fallbacks.voice;
  if (message.attachments[0]) return message.attachments[0].name;
  return fallbacks.file;
}

export function SearchView({ initialQuery = "", conversationId = null, onOpenResult }: SearchViewProps) {
  const tt = useUI();
  const locale = useLocale();
  const inbox = useImInbox();
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [hits, setHits] = useState<ImSearchHit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [loadingMore, setLoadingMore] = useState(false);
  const [senders, setSenders] = useState<Array<{ id: string; name: string }>>([]);
  const [names, setNames] = useState<Record<string, ImProfile>>({});
  const requestId = useRef(0);

  const params = useMemo(() => filtersToParams(filters, Date.now(), conversationId), [filters, conversationId]);
  const paramsKey = JSON.stringify(params);
  const ready = searchQueryReady(query);

  const conversations = useMemo(
    () =>
      inbox.items
        .filter((item) => item.kind !== "talent")
        .map((item) => ({
          id: item.id,
          title: item.kind === "dm" ? (item.peer?.display_name ?? item.title) : item.title,
        })),
    [inbox.items],
  );

  // 发送人候选：选了会话 → 该会话成员；否则 → 我能直接私聊的人
  const scopedConversation = conversationId || filters.conversationId;
  useEffect(() => {
    let alive = true;
    const load = scopedConversation
      ? messagesApi
          .getConversation(scopedConversation)
          .then((detail) => detail.members.map((member) => ({ id: member.user_id, name: member.profile.display_name })))
      : searchApi.directory().then((items) => items.map((p) => ({ id: p.user_id, name: p.display_name })));
    void load
      .then((list) => alive && setSenders(list))
      .catch(() => alive && setSenders([]));
    return () => {
      alive = false;
    };
  }, [scopedConversation]);

  const run = useCallback(
    async (nextCursor: string | null) => {
      const id = ++requestId.current;
      if (nextCursor) setLoadingMore(true);
      else setState("loading");
      try {
        const page = await searchApi.search({ q: query, ...params, cursor: nextCursor });
        if (id !== requestId.current) return;
        setHits((current) => (nextCursor ? [...current, ...page.items] : page.items));
        setCursor(page.next_cursor);
        setState("done");
        const missing = Array.from(
          new Set(page.items.map((hit) => hit.message.sender_id).filter((v): v is string => Boolean(v))),
        ).filter((senderId) => !names[senderId]);
        if (missing.length > 0) {
          void messagesApi
            .profiles(missing)
            .then((items) => setNames((current) => ({ ...current, ...Object.fromEntries(items.map((p) => [p.user_id, p])) })))
            .catch(() => undefined);
        }
      } catch {
        if (id !== requestId.current) return;
        if (!nextCursor) setHits([]);
        setState("error");
      } finally {
        if (id === requestId.current) setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, paramsKey],
  );

  // 防抖搜索：条件变了就重新从第一页开始
  useEffect(() => {
    if (!ready) {
      requestId.current += 1;
      setHits([]);
      setCursor(null);
      setState("idle");
      return;
    }
    const handle = setTimeout(() => void run(null), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [ready, run]);

  const fallbacks = { file: tt("[文件]"), card: tt("[作品]"), voice: tt("[语音]") };
  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ""
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3" data-search-view="">
      <input
        type="search"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tt("搜索消息")}
        aria-label={tt("搜索消息")}
        className="rounded-xl border-0 bg-neutral-100/80 px-3 py-2 text-[14px] focus:outline-none"
      />
      <SearchFilters
        value={conversationId ? { ...filters, conversationId } : filters}
        onChange={setFilters}
        conversations={conversations}
        senders={senders}
        conversationLocked={Boolean(conversationId)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!ready ? <p className="py-10 text-center text-[12.5px] text-neutral-400">{tt("至少输入 2 个字")}</p> : null}
        {ready && state === "loading" ? <p className="py-10 text-center text-[12.5px] text-neutral-400">{tt("正在搜索…")}</p> : null}
        {ready && state === "error" ? <p className="py-10 text-center text-[12.5px] text-red-600">{tt("搜索失败，请稍后重试。")}</p> : null}
        {ready && state === "done" && hits.length === 0 ? <p className="py-10 text-center text-[12.5px] text-neutral-400">{tt("没有找到相关消息")}</p> : null}
        <ul className="divide-y divide-neutral-100">
          {hits.map((hit) => {
            const preview = previewText(hit, fallbacks);
            const ranges = hit.message.body ? hit.highlights : [];
            const snippet = hit.message.body ? snippetAround(hit.message.body, ranges) : { text: preview, ranges: [] };
            const segments = highlightSegments(snippet.text, snippet.ranges, query);
            const sender = hit.message.sender_id ? names[hit.message.sender_id]?.display_name : hit.message.sender_kind === "leo" ? "leo" : "";
            return (
              <li key={hit.message.id}>
                <button
                  type="button"
                  onClick={() => onOpenResult(hit.conversation.id, hit.message.seq)}
                  className="block w-full px-2 py-2.5 text-left hover:bg-neutral-50"
                  data-search-result=""
                >
                  <div className="flex items-baseline justify-between gap-2 text-[11.5px] text-neutral-400">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-neutral-600">{hit.conversation.title}</span>
                      {sender ? ` · ${sender}` : ""}
                    </span>
                    <time dateTime={hit.message.created_at} className="shrink-0">
                      {formatTime(hit.message.created_at)}
                    </time>
                  </div>
                  <div className="mt-0.5 line-clamp-2 break-words text-[13px] text-neutral-800">
                    <Highlighted segments={segments} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {cursor ? (
          <div className="py-3 text-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void run(cursor)}
              className="rounded-lg border border-neutral-200 px-4 py-1.5 text-[12.5px] text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              {loadingMore ? tt("正在加载…") : tt("加载更多")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
