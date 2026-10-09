"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayFeedFilter } from "../shell/bay-state";
import { BayAssetDetail } from "./BayAssetDetail";
import { DOCUMENT_ZONES, documentZonesForType } from "./document-zones";
import {
  APP_ASSET_PRESET,
  BAY_ASSET_TYPE_LABELS,
  BAY_ASSET_TYPE_ORDER,
  defaultAssetTypeForSite,
  liveSearchAvailable,
  searchBayLibrary,
  searchBayLive,
  type BayAsset,
  type BayAssetType,
  type BayAssetZone,
} from "./library-client";

const CHIP =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";
const ZONES: readonly BayAssetZone[] = ["owned", "stocked", "live"];

function appFromWindow(): string {
  if (typeof window === "undefined") return "";
  try {
    return (new URLSearchParams(window.location.search).get("app") || "").trim();
  } catch {
    return "";
  }
}

function initialType(filter: BayFeedFilter, siteKey: string): BayAssetType {
  const app = APP_ASSET_PRESET[appFromWindow()];
  if (app) return app.type;
  return defaultAssetTypeForSite(filter.category || siteKey);
}

function initialRoom(filter: BayFeedFilter, type: BayAssetType): string {
  const app = APP_ASSET_PRESET[appFromWindow()];
  if (app?.room && documentZonesForType(type).some((zone) => zone.slug === app.room)) return app.room;
  const match = DOCUMENT_ZONES.find((zone) => zone.slug === filter.category || zone.category === filter.category);
  return match && match.type === type ? match.slug : "";
}

export function BayAssetLibrary({
  filter,
  siteKey,
  accent,
}: {
  filter: BayFeedFilter;
  siteKey: string;
  accent?: string;
}) {
  const tt = useUI();
  const [type, setType] = useState<BayAssetType>(() => initialType(filter, siteKey));
  const [zone, setZone] = useState<BayAssetZone>("owned");
  const [room, setRoom] = useState(() => initialRoom(filter, initialType(filter, siteKey)));
  const [items, setItems] = useState<BayAsset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<BayAsset | null>(null);
  const requestRef = useRef(0);
  const query = filter.q ?? "";
  const selected = accent ? "font-medium text-white shadow-sm" : "bg-neutral-900 font-medium text-white shadow-sm";
  const selectedStyle = accent ? { background: accent } : undefined;
  const rooms = documentZonesForType(type);
  const liveOk = liveSearchAvailable(type);
  const category = room ? DOCUMENT_ZONES.find((item) => item.slug === room)?.category : undefined;

  useEffect(() => {
    const next = initialType(filter, siteKey);
    setType(next);
    setRoom(initialRoom(filter, next));
    setZone("owned");
  }, [filter.category, siteKey]);

  useEffect(() => {
    if (zone === "live" && !liveSearchAvailable(type)) setZone("owned");
    if (!documentZonesForType(type).some((item) => item.slug === room)) setRoom("");
  }, [type, zone, room]);

  const load = useCallback(
    async (fromPage: number) => {
      const request = ++requestRef.current;
      setLoading(true);
      if (fromPage === 1) {
        setItems([]);
        setError(null);
      }
      try {
        const pageSize = 24;
        const result =
          zone === "live"
            ? await searchBayLive({ q: query, type, page: fromPage, pageSize })
            : await searchBayLibrary({
                q: query,
                type,
                origin: zone === "owned" ? "first-party" : "external",
                category,
                page: fromPage,
                pageSize,
              });
        if (request !== requestRef.current) return;
        setItems((prev) => (fromPage === 1 ? result.items : [...prev, ...result.items]));
        setPage(fromPage);
        setHasMore(result.has_more);
      } catch (caught) {
        if (request !== requestRef.current) return;
        setError(caught instanceof Error && caught.message ? caught.message : "素材没读出来，请稍后再试。");
        if (fromPage === 1) setItems([]);
        setHasMore(false);
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [type, zone, category, query],
  );

  useEffect(() => {
    void load(1);
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  const zoneLabel = (value: BayAssetZone) =>
    value === "owned" ? tt("OceanLeo 自有") : value === "stocked" ? tt("开源专区（已入库）") : tt("实时搜索");

  return (
    <div data-bay-asset-library className="mt-4 flex min-h-[32rem] flex-1 flex-col">
      <div role="group" aria-label={tt("文件类型")} data-bay-asset-types className="flex flex-wrap items-center gap-2">
        {BAY_ASSET_TYPE_ORDER.map((item) => {
          const on = item === type;
          return (
            <button
              key={item}
              type="button"
              data-asset-type={item}
              aria-pressed={on}
              onClick={() => {
                setType(item);
                setRoom("");
              }}
              className={`${CHIP} ${on ? selected : "bg-black/5 text-black/70 hover:bg-black/10 dark:bg-white/10 dark:text-white/70"}`}
              style={on ? selectedStyle : undefined}
            >
              {tt(BAY_ASSET_TYPE_LABELS[item])}
            </button>
          );
        })}
      </div>
      <div role="tablist" aria-label={tt("素材来源")} data-bay-asset-zones className="mt-4 flex flex-wrap items-center gap-1.5">
        {ZONES.map((item) => {
          const on = item === zone;
          const usable = item !== "live" || liveOk;
          const body = zoneLabel(item);
          const shape = "rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition";
          if (!usable) {
            return (
              <span key={item} aria-disabled="true" title={tt("此类型没有实时开源上游。")} data-asset-zone={item} className={`${shape} cursor-not-allowed bg-stone-50 text-stone-400 ring-1 ring-stone-200`}>
                {body}
              </span>
            );
          }
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={on}
              data-asset-zone={item}
              onClick={() => setZone(item)}
              style={on ? { background: accent || "#111113" } : undefined}
              className={`${shape} ${on ? "text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"}`}
            >
              {body}
            </button>
          );
        })}
      </div>
      {zone === "live" && !liveOk ? (
        <p className="mt-2 text-[12px] text-stone-500">{tt("此类型没有实时开源上游。")}</p>
      ) : null}
      {rooms.length > 0 ? (
        <div role="group" data-bay-asset-rooms className="mt-4 flex flex-wrap items-center gap-2">
          {rooms.map((item) => {
            const on = room === item.slug;
            return (
              <button
                key={item.slug}
                type="button"
                data-asset-room={item.slug}
                aria-pressed={on}
                onClick={() => setRoom(on ? "" : item.slug)}
                className={`${CHIP} ${on ? selected : "bg-black/5 text-black/70 hover:bg-black/10 dark:bg-white/10 dark:text-white/70"}`}
                style={on ? selectedStyle : undefined}
              >
                {tt(item.title)}
              </button>
            );
          })}
        </div>
      ) : null}
      {error ? (
        <div className="mt-8 flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-asset-error>
          <p className="text-[13px] text-neutral-500">{tt(error)}</p>
          <button type="button" onClick={() => void load(1)} className="mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {!error && !loading && items.length === 0 ? (
        <p className="mt-12 px-4 text-center text-[13px] text-neutral-500" data-bay-asset-empty>
          {tt("这里还没有这个分类的素材。")}
        </p>
      ) : null}
      {items.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6" data-bay-asset-grid>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              data-bay-asset-card={item.id}
              onClick={() => setActive(item)}
              className="overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition hover:border-stone-300"
            >
              <span className="block aspect-square bg-stone-100">
                {item.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumb_url} alt="" className="h-full w-full object-cover" />
                ) : null}
              </span>
              <span className="block truncate px-2.5 py-2 text-[12px] text-stone-700">{item.title}</span>
            </button>
          ))}
        </div>
      ) : null}
      {loading ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6" role="status" aria-label={tt("正在加载…")} data-bay-asset-loading>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} aria-hidden="true" className="aspect-square animate-pulse rounded-xl border border-stone-200 bg-stone-100" />
          ))}
        </div>
      ) : null}
      {hasMore && !loading ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void load(page + 1)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {tt("加载更多")}
          </button>
        </div>
      ) : null}
      {active ? <BayAssetDetail asset={active} onClose={() => setActive(null)} /> : null}
    </div>
  );
}
