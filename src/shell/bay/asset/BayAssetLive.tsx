"use client";

// 实时搜索分区：直查开源上游（Openverse / Pexels / Pixabay / Poly Haven / Freesound…）。
// 搜索词来自页面工具条，这里不再画搜索框。空词时后端回该类型热门。

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionCardGrid } from "../../collection-chrome";
import { BayAssetCard } from "./BayAssetCard";
import { searchBayLive, type BayAsset, type BayAssetType } from "./library-client";

type LiveSearchResult = {
  key: string;
  items: BayAsset[];
  page: number;
  hasMore: boolean;
  error: string;
  loadingMore: boolean;
};

export function BayAssetLive({
  type,
  query,
  onOpen,
}: {
  type: BayAssetType;
  query: string;
  onOpen: (asset: BayAsset) => void;
}): ReactElement {
  const tt = useUI();
  const loadFailedText = tt("加载失败");
  const [result, setResult] = useState<LiveSearchResult | null>(null);
  const requestRef = useRef(0);
  const searchKey = `${type}\u0000${query}`;
  const current = result?.key === searchKey ? result : null;
  const items = current?.items ?? [];
  const page = current?.page ?? 1;
  const hasMore = current?.hasMore ?? false;
  const loading = !current || current.loadingMore;
  const error = current?.error ?? "";

  useEffect(() => {
    let alive = true;
    const request = ++requestRef.current;
    searchBayLive({ q: query, type, page: 1, pageSize: 30 })
      .then((pageResult) => {
        if (!alive || request !== requestRef.current) return;
        setResult({
          key: searchKey,
          items: pageResult.items,
          page: 1,
          hasMore: pageResult.has_more,
          error: "",
          loadingMore: false,
        });
      })
      .catch((caught) => {
        if (!alive || request !== requestRef.current) return;
        setResult({
          key: searchKey,
          items: [],
          page: 1,
          hasMore: false,
          error: caught instanceof Error && caught.message ? caught.message : loadFailedText,
          loadingMore: false,
        });
      });
    return () => {
      alive = false;
    };
  }, [type, query, searchKey, loadFailedText]);

  function loadMore() {
    if (!current || current.loadingMore) return;
    const request = ++requestRef.current;
    const next = page + 1;
    setResult((prev) => (prev?.key === searchKey ? { ...prev, error: "", loadingMore: true } : prev));
    searchBayLive({ q: query, type, page: next, pageSize: 30 })
      .then((pageResult) => {
        if (request !== requestRef.current) return;
        setResult((prev) =>
          prev?.key === searchKey
            ? {
                ...prev,
                items: [...prev.items, ...pageResult.items],
                page: next,
                hasMore: pageResult.has_more,
                loadingMore: false,
              }
            : prev,
        );
      })
      .catch((caught) => {
        if (request !== requestRef.current) return;
        setResult((prev) =>
          prev?.key === searchKey
            ? {
                ...prev,
                error: caught instanceof Error && caught.message ? caught.message : loadFailedText,
                loadingMore: false,
              }
            : prev,
        );
      });
  }

  return (
    <div data-bay-asset-live>
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>
      ) : null}
      {loading && items.length === 0 ? (
        <CollectionCardGrid role="status" aria-label={tt("正在加载…")} data-bay-asset-loading="">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="aspect-[4/3] animate-pulse rounded-xl border border-stone-200 bg-stone-100" />
          ))}
        </CollectionCardGrid>
      ) : items.length === 0 && !error ? (
        <div data-bay-asset-empty />
      ) : (
        <CollectionCardGrid data-bay-asset-grid="">
          {items.map((asset) => (
            <BayAssetCard key={asset.id} asset={asset} onOpen={onOpen} />
          ))}
        </CollectionCardGrid>
      )}
      {loading && items.length > 0 ? (
        <div className="py-8 text-center text-[13px] text-stone-400">{tt("加载中…")}</div>
      ) : null}
      {!loading && hasMore && items.length > 0 ? (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-full border border-neutral-900 bg-white px-6 py-2.5 text-[13px] font-medium text-stone-700 hover:bg-stone-50"
          >
            {tt("加载更多")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
