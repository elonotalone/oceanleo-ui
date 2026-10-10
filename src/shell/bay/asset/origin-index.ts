// 类型页三分区：OceanLeo 自有 / 开源专区（已入库）/ 实时搜索。
// 目录→来源索引、默认分区、区内取数、地址参数解析写回都在这里。
// 从 asset 站 lib/assets.ts + lib/type-page-views.ts 搬来，请求打 GATEWAY_BASE。

import {
  BAY_ASSET_TYPE_ORDER,
  listBayCategories,
  liveSearchAvailable,
  searchBayLibrary,
  type BayAsset,
  type BayAssetOrigin,
  type BayAssetSearchResult,
  type BayAssetType,
  type BayAssetZone,
} from "./library-client";
import { documentZoneCategoryKey } from "./document-zones";

export type MaterialOrigin = BayAssetOrigin;
export type TypeZone = BayAssetZone;

export const TYPE_ZONES: readonly TypeZone[] = ["owned", "stocked", "live"];

export const ZONE_ORIGIN: Record<"owned" | "stocked", MaterialOrigin> = {
  owned: "first-party",
  stocked: "external",
};

export const ZONE_LABELS: Record<TypeZone, string> = {
  owned: "OceanLeo 自有",
  stocked: "开源专区（已入库）",
  live: "实时搜索",
};

export const SERIES_ZONE: Partial<Record<BayAssetType, "owned" | "stocked">> = {
  ppt: "owned",
  image: "owned",
  vector: "stocked",
};

export const ORIGIN_FILTER_IS_SERVER_SIDE = true;

const SAMPLE_PER_CATEGORY = 6;

const FOREIGN_SEARCH_KEYS = new Set(["kind", "bay", "q", "category"]);

export interface ZoneCategory {
  key: string;
  origin: MaterialOrigin | null;
  total: number;
  sample: BayAsset[];
}

export interface TypeOriginIndex {
  type: BayAssetType;
  categories: ZoneCategory[];
  shelfTotal: number;
  totalByOrigin: Record<MaterialOrigin, number>;
  mixedCategories: string[];
  failed: boolean;
  incomplete: boolean;
  countsFromServer: boolean;
}

export interface AssetBrowseParams {
  type: BayAssetType | null;
  view: TypeZone | null;
  rawView: string;
  cat: string;
  series: boolean;
  asset: string;
}

export function zoneOrigin(zone: TypeZone): MaterialOrigin | null {
  return zone === "live" ? null : ZONE_ORIGIN[zone];
}

export function zoneIsLive(zone: TypeZone): boolean {
  return zone === "live";
}

export function zoneIsUsable(type: BayAssetType, zone: TypeZone): boolean {
  return zone === "live" ? liveSearchAvailable(type) : true;
}

export function seriesZoneOf(type: BayAssetType): "owned" | "stocked" | null {
  return SERIES_ZONE[type] ?? null;
}

export function hasSeriesFilter(type: BayAssetType, zone: TypeZone): boolean {
  return seriesZoneOf(type) === zone;
}

export function parseZone(raw: string | null | undefined, type: BayAssetType): TypeZone | null {
  const value = (raw || "").trim();
  if (value === "owned" || value === "stocked") return value;
  if (value === "live" || value === "open") {
    return zoneIsUsable(type, "live") ? "live" : "owned";
  }
  if (value === "series") return seriesZoneOf(type) ?? "owned";
  if (value === "library") return "owned";
  return null;
}

export function defaultZone(
  type: BayAssetType,
  counts: { owned: number; stocked: number },
): TypeZone {
  if (counts.owned > 0) return "owned";
  if (counts.stocked > 0) return "stocked";
  return zoneIsUsable(type, "live") ? "live" : "owned";
}

export function normSeriesFlag(
  rawView: string | null | undefined,
  rawSeries: string | null | undefined,
  type: BayAssetType,
  zone: TypeZone,
): boolean {
  if (!hasSeriesFilter(type, zone)) return false;
  return (rawView || "").trim() === "series" || (rawSeries || "").trim() === "1";
}

export function isBayAssetType(value: string | null | undefined): value is BayAssetType {
  return Boolean(value && (BAY_ASSET_TYPE_ORDER as readonly string[]).includes(value));
}

export function parseAssetBrowseSearch(search: string | URLSearchParams): AssetBrowseParams {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : search;
  const typeRaw = (params.get("type") || "").trim();
  const type = isBayAssetType(typeRaw) ? typeRaw : null;
  const rawView = (params.get("view") || "").trim();
  const view = parseZone(rawView, type ?? "image");
  const catRaw = (params.get("cat") || "").trim();
  const zoneKey = documentZoneCategoryKey(catRaw);
  return {
    type,
    view,
    rawView,
    cat: zoneKey || catRaw,
    series: (params.get("series") || "").trim() === "1" || rawView === "series",
    asset: (params.get("asset") || "").trim(),
  };
}

export function browseViewFor(type: BayAssetType, parsed: AssetBrowseParams): TypeZone | null {
  return parseZone(parsed.rawView, type);
}

export function applyAssetBrowseSearch(
  search: string | URLSearchParams,
  patch: {
    type?: string | null;
    view?: string | null;
    cat?: string | null;
    series?: boolean;
    asset?: string | null;
  },
): string {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : new URLSearchParams(search);
  const setOrDel = (key: string, value: string | null | undefined) => {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  };
  if ("type" in patch) setOrDel("type", patch.type ?? null);
  if ("view" in patch) setOrDel("view", patch.view ?? null);
  if ("cat" in patch) setOrDel("cat", patch.cat ?? null);
  if ("series" in patch) {
    if (patch.series) params.set("series", "1");
    else params.delete("series");
  }
  if ("asset" in patch) setOrDel("asset", patch.asset ?? null);
  return params.toString().replace(/%3A/gi, ":");
}

export function replaceBrowseUrl(patch: {
  type?: string | null;
  view?: string | null;
  cat?: string | null;
  series?: boolean;
  asset?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const next = applyAssetBrowseSearch(window.location.search, patch);
  const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash || ""}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
  if (url === current) return;
  try {
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* ignore */
  }
}

export function preservedForeignParams(search: string): Record<string, string> {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: Record<string, string> = {};
  for (const key of FOREIGN_SEARCH_KEYS) {
    const value = params.get(key);
    if (value != null) out[key] = value;
  }
  return out;
}

export function zoneCategories(index: TypeOriginIndex, origin: MaterialOrigin): ZoneCategory[] {
  return index.categories.filter((item) => item.origin === origin);
}

export function zoneTotal(index: TypeOriginIndex, origin: MaterialOrigin): number {
  return index.totalByOrigin[origin] || 0;
}

export function zoneOwnsWholeShelf(index: TypeOriginIndex, origin: MaterialOrigin): boolean {
  return index.shelfTotal > 0 && zoneTotal(index, origin) === index.shelfTotal;
}

const originIndexCache = new Map<BayAssetType, Promise<TypeOriginIndex>>();

export function resetOriginIndexCache(): void {
  originIndexCache.clear();
}

async function fetchTotalsByOrigin(
  type: BayAssetType,
): Promise<Record<MaterialOrigin, number> | null> {
  if (!ORIGIN_FILTER_IS_SERVER_SIDE) return null;
  try {
    const [own, ext] = await Promise.all([
      searchBayLibrary({ q: "", type, page: 1, pageSize: 4, origin: "first-party" }),
      searchBayLibrary({ q: "", type, page: 1, pageSize: 4, origin: "external" }),
    ]);
    return { "first-party": own.total || 0, external: ext.total || 0 };
  } catch {
    return null;
  }
}

async function buildTypeOriginIndex(type: BayAssetType): Promise<TypeOriginIndex> {
  const empty: TypeOriginIndex = {
    type,
    categories: [],
    shelfTotal: 0,
    totalByOrigin: { "first-party": 0, external: 0 },
    mixedCategories: [],
    failed: false,
    incomplete: false,
    countsFromServer: false,
  };

  let keys: string[] = [];
  let shelfTotal = 0;
  let serverTotals: Record<MaterialOrigin, number> | null = null;
  let ownKeys = new Set<string>();
  let extKeys = new Set<string>();
  try {
    const [ownCats, extCats, whole, byOrigin] = await Promise.all([
      listBayCategories(type, "first-party"),
      listBayCategories(type, "external"),
      searchBayLibrary({ q: "", type, page: 1, pageSize: 4 }),
      fetchTotalsByOrigin(type),
    ]);
    ownKeys = new Set(ownCats.categories || []);
    extKeys = new Set(extCats.categories || []);
    keys = [...new Set([...(ownCats.categories || []), ...(extCats.categories || [])])];
    shelfTotal = whole.total || 0;
    serverTotals = byOrigin;
    if (
      ownKeys.size > 0 &&
      ownKeys.size === extKeys.size &&
      [...ownKeys].every((key) => extKeys.has(key))
    ) {
      ownKeys = new Set();
      extKeys = new Set();
    }
  } catch {
    return { ...empty, failed: true };
  }

  let dropped = 0;
  const sampled = await Promise.all(
    keys.map(async (key): Promise<ZoneCategory | null> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await searchBayLibrary({
            q: "",
            type,
            category: key,
            page: 1,
            pageSize: SAMPLE_PER_CATEGORY,
          });
          if (!result.total || result.items.length === 0) return null;
          const inOwn = ownKeys.has(key);
          const inExt = extKeys.has(key);
          const sampledOrigins = new Set(
            result.items.map((item) => item.origin).filter(Boolean) as MaterialOrigin[],
          );
          let origin: MaterialOrigin | null = null;
          if (inOwn !== inExt) origin = inOwn ? "first-party" : "external";
          else if (!inOwn && !inExt && sampledOrigins.size === 1) origin = [...sampledOrigins][0];
          return { key, origin, total: result.total, sample: result.items };
        } catch {
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          dropped += 1;
          return null;
        }
      }
      return null;
    }),
  );

  const categories = sampled.filter((item): item is ZoneCategory => item !== null);
  const summed: Record<MaterialOrigin, number> = { "first-party": 0, external: 0 };
  for (const item of categories) {
    if (item.origin) summed[item.origin] += item.total;
  }
  return {
    type,
    categories,
    shelfTotal,
    totalByOrigin: serverTotals ?? summed,
    mixedCategories: categories.filter((item) => !item.origin).map((item) => item.key),
    failed: false,
    incomplete: dropped > 0 && serverTotals === null,
    countsFromServer: serverTotals !== null,
  };
}

export function loadTypeOriginIndex(type: BayAssetType): Promise<TypeOriginIndex> {
  let pending = originIndexCache.get(type);
  if (!pending) {
    pending = buildTypeOriginIndex(type).catch((error) => {
      originIndexCache.delete(type);
      throw error;
    });
    originIndexCache.set(type, pending);
  }
  return pending;
}

export async function searchAssetsInZone(params: {
  index: TypeOriginIndex;
  type: BayAssetType;
  origin: MaterialOrigin;
  q: string;
  category?: string;
  subtab?: string;
  seriesId?: string;
  page?: number;
  pageSize?: number;
}): Promise<BayAssetSearchResult> {
  const { index, type, origin, q, category, subtab, seriesId } = params;
  const page = params.page || 1;
  const pageSize = params.pageSize || 30;
  const one = (extra: { category?: string; pageSize?: number }) =>
    searchBayLibrary({
      q,
      type,
      subtab,
      seriesId,
      origin,
      page,
      pageSize: extra.pageSize ?? pageSize,
      category: extra.category,
    });

  if (
    ORIGIN_FILTER_IS_SERVER_SIDE ||
    category ||
    seriesId ||
    zoneOwnsWholeShelf(index, origin)
  ) {
    return one({ category });
  }

  const cats = zoneCategories(index, origin);
  if (cats.length === 0) {
    return { items: [], page, has_more: false, total: 0 };
  }
  const per = Math.max(4, Math.ceil(pageSize / cats.length));
  const parts = await Promise.all(
    cats.map((item) => one({ category: item.key, pageSize: per }).catch(() => null)),
  );
  const items: BayAsset[] = [];
  let hasMore = false;
  for (const part of parts) {
    if (!part) continue;
    items.push(...part.items);
    if (part.has_more) hasMore = true;
  }
  return {
    items,
    page,
    has_more: hasMore,
    total: zoneTotal(index, origin),
  };
}
