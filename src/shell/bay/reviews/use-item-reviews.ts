"use client";

// 换筛选从头取；AbortController 取消上一枪，迟到的响应不覆盖（照 use-bay-apps）。
import { useCallback, useEffect, useRef, useState } from "react";
import { BayApiError } from "../../../lib/bay/http";
import {
  listBayItemReviews,
  type BayItemReview,
  type BayItemReviewSummary,
  type BayReviewFilter,
  type BayReviewItemKind,
} from "../../../lib/bay/item-reviews";

const PAGE_SIZE = 10;
const LIST_ERROR = "评价列表没读出来，请稍后点「重试」。";

export const EMPTY_REVIEW_SUMMARY: BayItemReviewSummary = {
  total: 0,
  avg: 0,
  good: 0,
  mid: 0,
  bad: 0,
  photos: 0,
  followup: 0,
};

export interface ItemReviewsView {
  summary: BayItemReviewSummary;
  items: BayItemReview[];
  filter: BayReviewFilter;
  setFilter: (filter: BayReviewFilter) => void;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
  patchItem: (review: BayItemReview) => void;
}

function isAbort(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError");
}

function messageOf(error: unknown): string {
  if (error instanceof BayApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return LIST_ERROR;
}

function mergeReviews(prev: BayItemReview[], next: BayItemReview[]): BayItemReview[] {
  const seen = new Set(prev.map((item) => item.id));
  return [...prev, ...next.filter((item) => item.id && !seen.has(item.id))];
}

function pageOf(data: { items?: BayItemReview[]; summary?: BayItemReviewSummary; next_offset?: number | null } | null | undefined) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const summary = data?.summary && typeof data.summary.total === "number" ? data.summary : EMPTY_REVIEW_SUMMARY;
  const nextOffset = typeof data?.next_offset === "number" ? data.next_offset : null;
  return { items, summary, nextOffset };
}

export function useItemReviews(itemKind: BayReviewItemKind, itemId: string): ItemReviewsView {
  const [items, setItems] = useState<BayItemReview[]>([]);
  const [summary, setSummary] = useState<BayItemReviewSummary>(EMPTY_REVIEW_SUMMARY);
  const [filter, setFilterState] = useState<BayReviewFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (offset: number, replace: boolean, nextFilter: BayReviewFilter) => {
      if (!itemId) {
        setItems([]);
        setSummary(EMPTY_REVIEW_SUMMARY);
        setNextOffset(null);
        setLoading(false);
        setError(null);
        return;
      }
      const request = ++requestRef.current;
      if (replace) abortRef.current?.abort();
      const controller = typeof AbortController === "undefined" ? null : new AbortController();
      abortRef.current = controller;
      setLoading(true);
      if (replace) {
        setError(null);
        setItems([]);
        setNextOffset(null);
      }
      try {
        const raw = await listBayItemReviews(
          itemKind,
          itemId,
          { filter: nextFilter, offset, limit: PAGE_SIZE },
          controller?.signal,
        );
        if (request !== requestRef.current) return;
        const page = pageOf(raw);
        setItems((prev) => (replace ? page.items : mergeReviews(prev, page.items)));
        setSummary(page.summary);
        setNextOffset(page.nextOffset);
        setError(null);
      } catch (caught) {
        if (request !== requestRef.current || isAbort(caught) || controller?.signal.aborted) return;
        setError(messageOf(caught) || LIST_ERROR);
        if (replace) {
          setItems([]);
          setNextOffset(null);
        }
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [itemKind, itemId],
  );

  useEffect(() => {
    void load(0, true, filter);
    return () => abortRef.current?.abort();
  }, [load, filter]);

  const setFilter = useCallback((next: BayReviewFilter) => {
    setFilterState(next);
  }, []);

  const loadMore = useCallback(() => {
    if (loading || nextOffset === null) return;
    void load(nextOffset, false, filter);
  }, [load, loading, nextOffset, filter]);

  const reload = useCallback(() => {
    void load(0, true, filter);
  }, [load, filter]);

  const patchItem = useCallback((review: BayItemReview) => {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === review.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = review;
        return next;
      }
      return [review, ...prev];
    });
  }, []);

  return {
    summary,
    items,
    filter,
    setFilter,
    loading,
    error,
    hasMore: nextOffset !== null,
    loadMore,
    reload,
    patchItem,
  };
}
