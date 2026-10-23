"use client";

// 左栏的数据：信息流分页（筛选变了从头取，登录态变了也重取——求助只给专家看）与交付类目。
import { useCallback, useEffect, useRef, useState } from "react";
import { deliveryCategories, fetchBayCategories } from "../../../lib/bay/categories";
import { bayFeedErrorText, classifyBayFeedCaught, fetchBayFeed, type BayFeedListingKind } from "../../../lib/bay/feed";
import type { BayCategory, BayFeedItem } from "../../../lib/bay/types";
import { bayListingKindFor, canonicalBayFeedKind } from "./bay-links";
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

/** 信息流取数的可选项。 */
export interface BayFeedOptions {
  /** 强制按这一发布种类取出售侧（货架、现成文件「卖家在售」用）；不传则由 `filter.kind` / `filter.offer` 决定。 */
  listingKind?: BayFeedListingKind;
  /** 要不要取。默认：现成文件栏（asset）自己走素材库的数据，不取；指定了 `listingKind` 就取。 */
  enabled?: boolean;
  /** 一页取几条（只想知道「有没有」时取 1）。 */
  limit?: number;
}

/**
 * 页面筛选 → 接口参数：每一类里显示的就是按这一类发布的东西。
 * 出售侧 `kind=supply`，种类 → `listing_kind`（人工服务 service、现成文件 digital、网站与软件服务 app、课程 lesson、其他 other）；
 * 求购侧 `kind=needs`，取 `filter.offer`（没写就是人工服务）对应的发布种类。
 */
export function bayFeedRequestFor(
  filter: BayFeedFilter,
  listingKind?: BayFeedListingKind,
): { kind: "supply" | "needs"; listing_kind: BayFeedListingKind } {
  if (listingKind) return { kind: "supply", listing_kind: listingKind };
  const page = canonicalBayFeedKind(filter.kind);
  if (page === "request") return { kind: "needs", listing_kind: bayListingKindFor(filter.offer ?? "service") };
  return { kind: "supply", listing_kind: bayListingKindFor(page) };
}

export function useBayFeed(filter: BayFeedFilter, signedIn: boolean, options: BayFeedOptions = {}): BayFeedView {
  const [items, setItems] = useState<BayFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // 页面 service / 缺省 → 接口 supply；request → needs；asset 默认不走这条信息流（素材库自己取数）。
  const skipFeed = !(options.enabled ?? (options.listingKind !== undefined || canonicalBayFeedKind(filter.kind) !== "asset"));
  const { kind, listing_kind: listingKind } = bayFeedRequestFor(filter, options.listingKind);
  const category = filter.category ?? "";
  const q = filter.q ?? "";
  const limit = options.limit;

  const load = useCallback(
    async (from: string | null) => {
      if (skipFeed) {
        setItems([]);
        setCursor(null);
        setError(null);
        setLoading(false);
        setLoaded(true);
        return;
      }
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
        const page = await fetchBayFeed(
          { kind, category, q, listing_kind: listingKind, limit },
          from,
          { signal: controller?.signal },
        );
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
    [kind, category, q, listingKind, limit, skipFeed],
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
