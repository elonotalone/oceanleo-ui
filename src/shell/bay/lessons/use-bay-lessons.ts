"use client";

// 课程栏分页：筛选或站点变了从头取；用 AbortController 取消上一枪，迟到的响应不覆盖。
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listBayLessonBundles,
  listBayLessons,
  type BayLesson,
  type BayLessonBundle,
} from "../../../lib/bay/lessons";
import type { BayFeedFilter } from "../shell/bay-state";

const PAGE_SIZE = 24;
const LESSON_LIST_ERROR = "课程列表没读出来，请稍后点「重试」。";
const BUNDLE_LIST_ERROR = "套餐列表没读出来，请稍后点「重试」。";

export interface BayLessonsView {
  items: BayLesson[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

export interface BayLessonBundlesView {
  items: BayLessonBundle[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

function isAbort(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError");
}

function mergeById<T extends { id: string }>(prev: T[], next: T[]): T[] {
  const seen = new Set(prev.map((item) => item.id));
  return [...prev, ...next.filter((item) => item.id && !seen.has(item.id))];
}

export function useBayLessons(filter: BayFeedFilter, siteKey: string): BayLessonsView {
  const [items, setItems] = useState<BayLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const category = filter.category ?? "";
  const q = filter.q ?? "";

  const load = useCallback(
    async (offset: number, replace: boolean) => {
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
        const page = await listBayLessons(
          { site: siteKey, category, q, offset, limit: PAGE_SIZE },
          controller?.signal,
        );
        if (request !== requestRef.current) return;
        setItems((prev) => (replace ? page.items : mergeById(prev, page.items)));
        setNextOffset(page.next_offset);
        setError(null);
      } catch (caught) {
        if (request !== requestRef.current || isAbort(caught) || controller?.signal.aborted) return;
        setError(LESSON_LIST_ERROR);
        if (replace) {
          setItems([]);
          setNextOffset(null);
        }
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [siteKey, category, q],
  );

  useEffect(() => {
    void load(0, true);
    return () => abortRef.current?.abort();
  }, [load]);

  const loadMore = useCallback(() => {
    if (loading || nextOffset === null) return;
    void load(nextOffset, false);
  }, [load, loading, nextOffset]);

  const reload = useCallback(() => {
    void load(0, true);
  }, [load]);

  return { items, loading, error, hasMore: nextOffset !== null, loadMore, reload };
}

export function useBayLessonBundles(filter: BayFeedFilter): BayLessonBundlesView {
  const [items, setItems] = useState<BayLessonBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const q = filter.q ?? "";

  const load = useCallback(
    async (offset: number, replace: boolean) => {
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
        const page = await listBayLessonBundles({ q, offset, limit: PAGE_SIZE }, controller?.signal);
        if (request !== requestRef.current) return;
        setItems((prev) => (replace ? page.items : mergeById(prev, page.items)));
        setNextOffset(page.next_offset);
        setError(null);
      } catch (caught) {
        if (request !== requestRef.current || isAbort(caught) || controller?.signal.aborted) return;
        setError(BUNDLE_LIST_ERROR);
        if (replace) {
          setItems([]);
          setNextOffset(null);
        }
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [q],
  );

  useEffect(() => {
    void load(0, true);
    return () => abortRef.current?.abort();
  }, [load]);

  const loadMore = useCallback(() => {
    if (loading || nextOffset === null) return;
    void load(nextOffset, false);
  }, [load, loading, nextOffset]);

  const reload = useCallback(() => {
    void load(0, true);
  }, [load]);

  return { items, loading, error, hasMore: nextOffset !== null, loadMore, reload };
}
