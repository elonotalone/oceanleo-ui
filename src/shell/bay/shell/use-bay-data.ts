"use client";

// 左栏的数据：信息流分页（筛选变了从头取，登录态变了也重取——求助只给专家看）与交付类目。
import { useCallback, useEffect, useRef, useState } from "react";
import { deliveryCategories, fetchBayCategories } from "../../../lib/bay/categories";
import { bayFeedErrorText, classifyBayFeedCaught, fetchBayFeed } from "../../../lib/bay/feed";
import type { BayCategory, BayFeedItem } from "../../../lib/bay/types";
import type { BayFeedFilter } from "./bay-state";

export interface BayFeedView {
  items: BayFeedItem[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

function mergeItems(prev: BayFeedItem[], next: BayFeedItem[]): BayFeedItem[] {
  const seen = new Set(prev.map((item) => `${item.kind}:${item.id}`));
  return [...prev, ...next.filter((item) => !seen.has(`${item.kind}:${item.id}`))];
}

export function useBayFeed(filter: BayFeedFilter, signedIn: boolean): BayFeedView {
  const [items, setItems] = useState<BayFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const kind = filter.kind === "demand" ? "needs" : "supply";
  const category = filter.category ?? "";
  const q = filter.q ?? "";

  const load = useCallback(
    async (from: string | null) => {
      const request = ++requestRef.current;
      abortRef.current?.abort();
      const controller = typeof AbortController === "undefined" ? null : new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      if (!from) {
        setItems([]);
        setLoaded(false);
      }
      try {
        // 页面 supply/缺省/material → 接口 supply；demand → needs。素材货架不走信息流，这里仍按供给请求，页面自己不画这一块。
        const page = await fetchBayFeed({ kind, category, q }, from, { signal: controller?.signal });
        if (request !== requestRef.current) return;
        setItems((prev) => (from ? mergeItems(prev, page.items) : page.items));
        setCursor(page.next_cursor);
      } catch (caught) {
        const action = classifyBayFeedCaught(caught, {
          stale: request !== requestRef.current,
          aborted: Boolean(controller?.signal.aborted),
        });
        if (action === "ignore") return;
        if (action === "empty") {
          if (!from) setItems([]);
          setCursor(null);
          return;
        }
        setError(bayFeedErrorText(caught));
      } finally {
        if (request === requestRef.current) {
          setLoading(false);
          setLoaded(true);
        }
      }
    },
    [kind, category, q],
  );

  useEffect(() => {
    setCursor(null);
    void load(null);
    return () => abortRef.current?.abort();
  }, [load, signedIn]);

  const loadMore = useCallback(() => {
    if (loading || !cursor) return;
    void load(cursor);
  }, [load, loading, cursor]);

  const retry = useCallback(() => {
    void load(null);
  }, [load]);

  return { items, loading, loaded, error, hasMore: Boolean(cursor), loadMore, retry };
}

export interface BayCategoriesView {
  categories: BayCategory[];
  loading: boolean;
  failed: boolean;
}

export function useBayCategories(): BayCategoriesView {
  const [state, setState] = useState<BayCategoriesView>({ categories: [], loading: true, failed: false });
  useEffect(() => {
    let cancelled = false;
    fetchBayCategories().then(
      (data) => {
        if (!cancelled) setState({ categories: deliveryCategories(data), loading: false, failed: false });
      },
      () => {
        if (!cancelled) setState({ categories: [], loading: false, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
