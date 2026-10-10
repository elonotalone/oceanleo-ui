"use client";

// 成套素材：一套风格统一、可整套浏览的开源/自有件。列表是封面拼贴，点开进整套。
// 「成套」是形态不是来源，所以待在所属来源分区里面；取数时按 origin 逐件过滤。

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayAssetCard } from "./BayAssetCard";
import {
  listBaySeries,
  searchBayLibrary,
  type BayAsset,
  type BayAssetOrigin,
  type BayAssetType,
  type BaySeries,
} from "./library-client";

function CoverCollage({ covers }: { covers: string[] }): ReactElement {
  const four = covers.slice(0, 4);
  while (four.length < 4) four.push("");
  return (
    <div className="grid aspect-[4/3] w-full grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-t-xl bg-stone-100">
      {four.map((cover, index) =>
        cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={index} src={cover} alt="" loading="lazy" className="h-full w-full bg-white object-contain p-1" />
        ) : (
          <div key={index} className="h-full w-full bg-stone-50" />
        ),
      )}
    </div>
  );
}

export function BayAssetSeries({
  type,
  origin,
  onOpen,
}: {
  type: BayAssetType;
  origin?: BayAssetOrigin;
  onOpen: (asset: BayAsset) => void;
}): ReactElement {
  const tt = useUI();
  const loadFailedText = tt("加载失败");
  const [series, setSeries] = useState<BaySeries[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const [openSeries, setOpenSeries] = useState<BaySeries | null>(null);
  const [items, setItems] = useState<BayAsset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    let alive = true;
    setLoadingList(true);
    setListError("");
    listBaySeries(type)
      .then((result) => {
        if (alive) setSeries(result.series || []);
      })
      .catch((caught) => {
        if (alive) setListError(caught instanceof Error && caught.message ? caught.message : loadFailedText);
      })
      .finally(() => {
        if (alive) setLoadingList(false);
      });
    return () => {
      alive = false;
    };
  }, [loadFailedText, type]);

  function openOne(item: BaySeries) {
    setOpenSeries(item);
    setItems([]);
    setPage(1);
    const request = ++requestRef.current;
    setLoadingItems(true);
    searchBayLibrary({ q: "", type: item.type, seriesId: item.series_id, origin, page: 1, pageSize: 60 })
      .then((result) => {
        if (request !== requestRef.current) return;
        setItems(result.items);
        setHasMore(result.has_more);
      })
      .finally(() => {
        if (request === requestRef.current) setLoadingItems(false);
      });
  }

  function loadMore() {
    if (!openSeries) return;
    const request = ++requestRef.current;
    const next = page + 1;
    setLoadingItems(true);
    searchBayLibrary({
      q: "",
      type: openSeries.type,
      seriesId: openSeries.series_id,
      origin,
      page: next,
      pageSize: 60,
    })
      .then((result) => {
        if (request !== requestRef.current) return;
        setItems((prev) => [...prev, ...result.items]);
        setHasMore(result.has_more);
        setPage(next);
      })
      .finally(() => {
        if (request === requestRef.current) setLoadingItems(false);
      });
  }

  if (openSeries) {
    return (
      <div data-bay-asset-series="open">
        <button
          type="button"
          onClick={() => {
            setOpenSeries(null);
            setItems([]);
          }}
          className="mb-4 inline-flex items-center gap-1 text-[13px] text-stone-500 hover:text-stone-900"
        >
          {tt("← 返回全部成套")}
        </button>
        <header className="mb-5">
          <h2 className="text-lg font-semibold text-stone-900">{openSeries.series_name}</h2>
          <p className="mt-1 text-[13px] text-stone-500">
            {tt("共 {n} 件 · 风格统一的整套开源素材，可整套取用", { n: openSeries.count })}
          </p>
        </header>
        {loadingItems && items.length === 0 ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" role="status" aria-label={tt("正在加载…")}>
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-xl bg-stone-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" data-bay-asset-grid>
            {items.map((asset) => (
              <BayAssetCard key={asset.id} asset={asset} onOpen={onOpen} />
            ))}
          </div>
        )}
        {loadingItems && items.length > 0 ? (
          <div className="py-8 text-center text-[13px] text-stone-400">{tt("加载中…")}</div>
        ) : null}
        {!loadingItems && hasMore ? (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={loadMore}
              className="rounded-lg border border-stone-200 bg-white px-6 py-2.5 text-[13px] font-medium text-stone-700 hover:bg-stone-50"
            >
              {tt("加载更多")}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div data-bay-asset-series="list">
      {listError ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{listError}</div>
      ) : null}
      {loadingList ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" role="status" aria-label={tt("正在加载…")}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="aspect-[4/3] w-full animate-pulse bg-stone-100" />
              <div className="px-3 py-3">
                <div className="h-3 w-2/3 animate-pulse rounded bg-stone-100" />
              </div>
            </div>
          ))}
        </div>
      ) : series.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 py-16 text-center text-[13px] text-stone-400">
          {tt("暂无成套素材。")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {series.map((item) => (
            <button
              key={item.series_id}
              type="button"
              onClick={() => openOne(item)}
              className="group overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
            >
              <CoverCollage covers={item.covers} />
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="truncate text-[13px] font-medium text-stone-800">{item.series_name}</span>
                <span className="ml-2 shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[12px] text-stone-500">
                  {item.count}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
