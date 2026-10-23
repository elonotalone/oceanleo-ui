"use client";

// 现成文件栏：把 asset 站首页的浏览搬进来，另加卖家按「现成文件」发布的条目。筛选全部是工具条下拉，不再叠几排小标签。
// 类型 / 来源 / 目录 / 行业 / 成套写在 BayToolbarFilters 里，送到页面那一行工具条上。
// 来源的第一项是「卖家在售」（走信息流 listing_kind=digital，见 BayAssetSellers）；有已发布的卖家现成文件时默认它。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionCardGrid } from "../../collection-chrome";
import { CollectionItemList } from "../../collection-items";
import { bayEnabledHere, useBaySignedIn, type BayFeedFilter } from "../shell/bay-state";
import { BaySignInPrompt } from "../shell/BayMine";
import { BayFilterSelect, BayToolbarFilters, type BayFilterOption } from "../shell/BayFilterSelect";
import { useBayFeed } from "../shell/use-bay-data";
import { BayAssetCard } from "./BayAssetCard";
import { BayAssetDetail } from "./BayAssetDetail";
import { BayAssetLive } from "./BayAssetLive";
import { BayAssetSeries } from "./BayAssetSeries";
import { BayAssetSellerSite, BayAssetSellers } from "./BayAssetSellers";
import { BayArtifactDeepLink } from "./BayArtifactDeepLink";
import { BayLicensesView } from "./BayLicensesView";
import {
  BAY_OFFICIAL_PREVIEW_COUNT,
  BAY_TEMPLATE_PAGE_SIZE,
  OFFICIAL_TEMPLATE_CATEGORY,
  listBayMineArtifacts,
  listBayOfficialTemplates,
  mergeOwnedAssets,
  templateArtifactTypeForBay,
} from "./bay-template-shelf";
import { buildPanelsFromCategories, categoryLabel, PPT_INDUSTRIES } from "./asset-taxonomy";
import {
  documentZoneByCategory,
  documentZoneCategoryKey,
  documentZonesForType,
  type DocumentZone,
} from "./document-zones";
import {
  APP_ASSET_PRESET,
  BAY_ASSET_TYPE_LABELS,
  BAY_ASSET_TYPE_ORDER,
  defaultAssetTypeForSite,
  fetchBayAssetById,
  liveSearchAvailable,
  type BayAsset,
  type BayAssetType,
} from "./library-client";
import {
  defaultZone,
  hasSeriesFilter,
  loadTypeOriginIndex,
  browseViewFor,
  parseAssetBrowseSearch,
  replaceBrowseUrl,
  resetOriginIndexCache,
  searchAssetsInZone,
  TYPE_ZONES,
  ZONE_LABELS,
  zoneCategories,
  zoneOrigin,
  zoneTotal,
  type TypeOriginIndex,
  type TypeZone,
} from "./origin-index";

const PREVIEW_PER_ROW = 4;

function readSearch(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.location.search;
  } catch {
    return "";
  }
}

function appFromWindow(): string {
  if (typeof window === "undefined") return "";
  try {
    return (new URLSearchParams(window.location.search).get("app") || "").trim();
  } catch {
    return "";
  }
}

function initialType(filter: BayFeedFilter, siteKey: string): BayAssetType {
  const parsed = parseAssetBrowseSearch(readSearch());
  if (parsed.type) return parsed.type;
  const app = APP_ASSET_PRESET[appFromWindow()];
  if (app) return app.type;
  return defaultAssetTypeForSite(filter.category || siteKey);
}

function initialCat(filter: BayFeedFilter, type: BayAssetType): string {
  const parsed = parseAssetBrowseSearch(readSearch());
  if (parsed.cat) return parsed.cat;
  const app = APP_ASSET_PRESET[appFromWindow()];
  const roomKey = documentZoneCategoryKey(app?.room);
  if (roomKey) {
    const zone = documentZoneByCategory(roomKey);
    if (zone && zone.type === type) return roomKey;
  }
  const fromFilter = documentZoneCategoryKey(filter.category);
  if (fromFilter) {
    const zone = documentZoneByCategory(fromFilter);
    if (zone && zone.type === type) return fromFilter;
  }
  return "";
}

function initialView(type: BayAssetType): TypeZone | null {
  const view = browseViewFor(type, parseAssetBrowseSearch(readSearch()));
  // 「卖家在售」是交易市场的一部分，境内没有：地址里带着也当没有。
  return view === "sellers" && !bayEnabledHere() ? null : view;
}

function initialAssetId(): string {
  return parseAssetBrowseSearch(readSearch()).asset;
}

function initialSeries(): boolean {
  return parseAssetBrowseSearch(readSearch()).series;
}

export function BayAssetLibrary({
  filter,
  siteKey,
  accent,
  view = "grid",
}: {
  filter: BayFeedFilter;
  siteKey: string;
  accent?: string;
  view?: "grid" | "list";
}) {
  const tt = useUI();
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;
  const signedIn = useBaySignedIn();
  const bayOn = bayEnabledHere();
  const loadFailedText = tt("加载失败");
  const [type, setType] = useState<BayAssetType>(() => initialType(filter, siteKey));
  const [viewPinned, setViewPinned] = useState(() => initialView(initialType(filter, siteKey)) != null);
  const [zone, setZone] = useState<TypeZone>(() => initialView(initialType(filter, siteKey)) ?? "owned");
  const [cat, setCat] = useState(() => initialCat(filter, initialType(filter, siteKey)));
  const [sellerSite, setSellerSite] = useState("");
  // 「卖家在售」只在刚进来、用户还没动过类型 / 来源时抢默认；之后换类型走原来的默认规则。
  const [sellersDefaultOk, setSellersDefaultOk] = useState(true);
  const [seriesOn, setSeriesOn] = useState(() => initialSeries());
  const [industry, setIndustry] = useState("");
  const [subtab, setSubtab] = useState("");
  const [index, setIndex] = useState<TypeOriginIndex | null>(null);
  const [indexError, setIndexError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [licensesOpen, setLicensesOpen] = useState(false);
  const [active, setActive] = useState<BayAsset | null>(null);
  const [grid, setGrid] = useState<{
    key: string;
    items: BayAsset[];
    page: number;
    hasMore: boolean;
    error: string;
    loadingMore: boolean;
  } | null>(null);
  const requestRef = useRef(0);
  const officialRef = useRef(0);
  const mineRef = useRef(0);
  const query = filter.q ?? "";
  const liveOk = liveSearchAvailable(type);
  const origin = zoneOrigin(zone);
  const officialCat = cat === OFFICIAL_TEMPLATE_CATEGORY;
  const [official, setOfficial] = useState<{
    items: BayAsset[];
    total: number;
    hasMore: boolean;
    error: string;
    loading: boolean;
    page: number;
  } | null>(null);
  const [mineGrid, setMineGrid] = useState<{
    items: BayAsset[];
    total: number;
    hasMore: boolean;
    error: string;
    loading: boolean;
    unauthenticated: boolean;
    page: number;
  } | null>(null);
  const rooms = documentZonesForType(type);
  const docZone = documentZoneByCategory(cat);
  const seriesAvailable = hasSeriesFilter(type, zone);
  // 有没有已发布的卖家现成文件：与搜索词、站点无关，取一条探一下。
  const sellerProbe = useBayFeed({ kind: "asset" }, signedIn, { listingKind: "digital", enabled: bayOn, limit: 1 });
  const hasSellerFiles = bayOn && sellerProbe.loaded && sellerProbe.items.length > 0;
  const sellersFirst = !viewPinned && sellersDefaultOk && hasSellerFiles;
  const defaultPending = !viewPinned && sellersDefaultOk && bayOn && !sellerProbe.loaded;

  useEffect(() => {
    const parsed = parseAssetBrowseSearch(readSearch());
    const next = parsed.type ?? APP_ASSET_PRESET[appFromWindow()]?.type ?? defaultAssetTypeForSite(filter.category || siteKey);
    setType(next);
    if (!initialView(next)) {
      setViewPinned(false);
      setZone("owned");
    }
    if (!parsed.cat) setCat(initialCat(filter, next));
  }, [filter.category, siteKey]);

  useEffect(() => {
    let alive = true;
    setIndex(null);
    setIndexError(false);
    loadTypeOriginIndex(type)
      .then((result) => {
        if (alive) setIndex(result);
      })
      .catch(() => {
        if (alive) setIndexError(true);
      });
    return () => {
      alive = false;
    };
  }, [type]);

  useEffect(() => {
    if (zone !== "owned" || licensesOpen || seriesOn) return;
    if (!templateArtifactTypeForBay(type)) {
      setOfficial({ items: [], total: 0, hasMore: false, error: "", loading: false, page: 1 });
      return;
    }
    const request = ++officialRef.current;
    const all = officialCat && !query;
    setOfficial((prev) => ({
      items: prev && prev.page === 1 ? prev.items : [],
      total: prev?.total ?? 0,
      hasMore: false,
      error: "",
      loading: true,
      page: 1,
    }));
    listBayOfficialTemplates({
      type,
      q: query,
      limit: query ? undefined : all ? BAY_TEMPLATE_PAGE_SIZE : BAY_OFFICIAL_PREVIEW_COUNT,
      offset: 0,
    })
      .then((result) => {
        if (request !== officialRef.current) return;
        setOfficial({
          items: result.items,
          total: result.total,
          hasMore: result.hasMore,
          error: "",
          loading: false,
          page: 1,
        });
      })
      .catch((caught) => {
        if (request !== officialRef.current) return;
        setOfficial({
          items: [],
          total: 0,
          hasMore: false,
          error: caught instanceof Error && caught.message ? caught.message : loadFailedText,
          loading: false,
          page: 1,
        });
      });
  }, [type, zone, officialCat, query, licensesOpen, seriesOn, reloadTick, loadFailedText]);

  useEffect(() => {
    if (zone !== "mine" || licensesOpen) return;
    if (!signedIn) {
      setMineGrid({
        items: [],
        total: 0,
        hasMore: false,
        error: "",
        loading: false,
        unauthenticated: true,
        page: 1,
      });
      return;
    }
    const request = ++mineRef.current;
    setMineGrid({
      items: [],
      total: 0,
      hasMore: false,
      error: "",
      loading: true,
      unauthenticated: false,
      page: 1,
    });
    listBayMineArtifacts({ type, q: query, offset: 0, limit: BAY_TEMPLATE_PAGE_SIZE })
      .then((result) => {
        if (request !== mineRef.current) return;
        setMineGrid({
          items: result.items,
          total: result.total,
          hasMore: result.hasMore,
          error: "",
          loading: false,
          unauthenticated: result.unauthenticated,
          page: 1,
        });
      })
      .catch((caught) => {
        if (request !== mineRef.current) return;
        setMineGrid({
          items: [],
          total: 0,
          hasMore: false,
          error: caught instanceof Error && caught.message ? caught.message : loadFailedText,
          loading: false,
          unauthenticated: false,
          page: 1,
        });
      });
  }, [type, zone, query, signedIn, licensesOpen, reloadTick, loadFailedText]);

  useEffect(() => {
    if (viewPinned || defaultPending) return;
    if (sellersFirst) {
      // 有卖家现成文件：不必等素材索引，直接默认「卖家在售」。
      setZone(defaultZone(type, { owned: 0, stocked: 0, sellers: 1 }));
      return;
    }
    if (!index || index.type !== type) return;
    setZone(
      defaultZone(type, {
        owned: zoneTotal(index, "first-party") + (official?.total ?? 0),
        stocked: zoneTotal(index, "external"),
      }),
    );
  }, [index, type, viewPinned, official?.total, sellersFirst, defaultPending]);

  useEffect(() => {
    if (!index || index.type !== type) return;
    if (viewPinned && zone === "live" && !liveOk) setZone("owned");
  }, [index, type, viewPinned, zone, liveOk]);

  useEffect(() => {
    if (seriesOn && !hasSeriesFilter(type, zone)) setSeriesOn(false);
  }, [seriesOn, type, zone]);

  useEffect(() => {
    if (!cat || !index) return;
    const allowed = new Set([
      ...documentZonesForType(type).map((item) => item.category),
      ...(origin ? zoneCategories(index, origin).map((item) => item.key) : []),
      ...(templateArtifactTypeForBay(type) ? [OFFICIAL_TEMPLATE_CATEGORY] : []),
    ]);
    if (!allowed.has(cat)) {
      setCat("");
      setSubtab("");
    }
  }, [cat, index, origin, type]);

  useEffect(() => {
    replaceBrowseUrl({
      type,
      view: viewPinned || index ? zone : null,
      cat: cat || null,
      series: seriesOn && hasSeriesFilter(type, zone),
    });
  }, [type, zone, cat, seriesOn, viewPinned, index]);

  useEffect(() => {
    const id = initialAssetId();
    if (!id) return;
    let alive = true;
    fetchBayAssetById(id)
      .then((asset) => {
        if (alive && asset?.id) setActive(asset);
      })
      .catch(() => {
        /* 深链件读不到就停在列表，不把整栏打成错误页 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const zoneCats = useMemo(
    () => (index && origin ? zoneCategories(index, origin) : []),
    [index, origin],
  );
  const panels = useMemo(
    () => buildPanelsFromCategories(type, zoneCats.map((item) => item.key)),
    [type, zoneCats],
  );
  const panel = panels.find((item) => item.key === cat) || null;
  const countByCat = useMemo(
    () => new Map(zoneCats.map((item) => [item.key, item.total])),
    [zoneCats],
  );
  const mode: "browse" | "category" | "search" = query
    ? "search"
    : cat || (type === "ppt" && industry)
      ? "category"
      : "browse";

  const searchKey =
    licensesOpen ||
    seriesOn ||
    zone === "live" ||
    zone === "mine" ||
    officialCat ||
    mode === "browse" ||
    !index ||
    !origin
      ? null
      : JSON.stringify([type, zone, cat, subtab, industry, query, reloadTick]);
  const currentGrid = searchKey && grid?.key === searchKey ? grid : null;
  const originItems = currentGrid?.items ?? [];
  const items = officialCat
    ? official?.items ?? []
    : zone === "owned" && query
      ? mergeOwnedAssets(official?.items ?? [], originItems)
      : originItems;
  const page = officialCat ? official?.page ?? 1 : currentGrid?.page ?? 1;
  const hasMore = officialCat ? official?.hasMore ?? false : currentGrid?.hasMore ?? false;
  const loading = officialCat
    ? Boolean(official?.loading)
    : searchKey !== null && (!currentGrid || currentGrid.loadingMore);
  const error = officialCat ? official?.error ?? "" : currentGrid?.error ?? "";

  useEffect(() => {
    if (!searchKey || !index || !origin) return;
    const request = ++requestRef.current;
    let alive = true;
    searchAssetsInZone({
      index,
      type,
      origin,
      q: query,
      category: query ? undefined : cat || undefined,
      subtab: query ? undefined : industry || subtab || undefined,
      page: 1,
      pageSize: 30,
    })
      .then((result) => {
        if (!alive || request !== requestRef.current) return;
        setGrid({
          key: searchKey,
          items: result.items,
          page: 1,
          hasMore: result.has_more,
          error: "",
          loadingMore: false,
        });
      })
      .catch((caught) => {
        if (!alive || request !== requestRef.current) return;
        setGrid({
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
  }, [searchKey, index, origin, type, zone, cat, subtab, industry, query, loadFailedText]);

  const openAsset = useCallback((asset: BayAsset) => {
    const href = (asset.openHref || "").trim();
    if (href && typeof window !== "undefined") {
      window.location.assign(href);
      return;
    }
    setActive(asset);
    replaceBrowseUrl({ asset: asset.id });
  }, []);

  const closeAsset = useCallback(() => {
    setActive(null);
    replaceBrowseUrl({ asset: "" });
  }, []);

  function changeType(next: string) {
    if (!next || next === type) return;
    const nextType = next as BayAssetType;
    setType(nextType);
    setSellersDefaultOk(false);
    setViewPinned(false);
    setZone("owned");
    setIndex(null);
    setIndexError(false);
    setCat("");
    setIndustry("");
    setSubtab("");
    setSeriesOn(false);
    setLicensesOpen(false);
  }

  function changeZone(next: string) {
    if (!next || next === zone) return;
    setSellersDefaultOk(false);
    setViewPinned(true);
    setZone(next as TypeZone);
    setCat("");
    setSubtab("");
    setIndustry("");
    setSeriesOn(false);
    setLicensesOpen(false);
  }

  function changeCat(next: string) {
    setCat(next);
    setSubtab("");
    setLicensesOpen(false);
  }

  function loadMoreOfficial() {
    if (!official || official.loading || !official.hasMore) return;
    const request = ++officialRef.current;
    const next = official.page + 1;
    const offset = official.items.length;
    setOfficial((prev) => (prev ? { ...prev, error: "", loading: true } : prev));
    listBayOfficialTemplates({
      type,
      limit: BAY_TEMPLATE_PAGE_SIZE,
      offset,
    })
      .then((result) => {
        if (request !== officialRef.current) return;
        setOfficial((prev) =>
          prev
            ? {
                items: [...prev.items, ...result.items],
                total: result.total,
                hasMore: result.hasMore,
                error: "",
                loading: false,
                page: next,
              }
            : prev,
        );
      })
      .catch((caught) => {
        if (request !== officialRef.current) return;
        setOfficial((prev) =>
          prev
            ? {
                ...prev,
                error: caught instanceof Error && caught.message ? caught.message : loadFailedText,
                loading: false,
              }
            : prev,
        );
      });
  }

  function loadMoreMine() {
    if (!mineGrid || mineGrid.loading || !mineGrid.hasMore) return;
    const request = ++mineRef.current;
    const next = mineGrid.page + 1;
    const offset = mineGrid.items.length;
    setMineGrid((prev) => (prev ? { ...prev, error: "", loading: true } : prev));
    listBayMineArtifacts({ type, q: query, offset, limit: BAY_TEMPLATE_PAGE_SIZE })
      .then((result) => {
        if (request !== mineRef.current) return;
        setMineGrid((prev) =>
          prev
            ? {
                items: [...prev.items, ...result.items],
                total: result.total,
                hasMore: result.hasMore,
                error: "",
                loading: false,
                unauthenticated: result.unauthenticated,
                page: next,
              }
            : prev,
        );
      })
      .catch((caught) => {
        if (request !== mineRef.current) return;
        setMineGrid((prev) =>
          prev
            ? {
                ...prev,
                error: caught instanceof Error && caught.message ? caught.message : loadFailedText,
                loading: false,
              }
            : prev,
        );
      });
  }

  function loadMore() {
    if (officialCat) {
      loadMoreOfficial();
      return;
    }
    if (!currentGrid || currentGrid.loadingMore || !searchKey || !index || !origin) return;
    const request = ++requestRef.current;
    const next = page + 1;
    setGrid((prev) => (prev?.key === searchKey ? { ...prev, error: "", loadingMore: true } : prev));
    searchAssetsInZone({
      index,
      type,
      origin,
      q: query,
      category: query ? undefined : cat || undefined,
      subtab: query ? undefined : industry || subtab || undefined,
      page: next,
      pageSize: 30,
    })
      .then((result) => {
        if (request !== requestRef.current) return;
        setGrid((prev) =>
          prev?.key === searchKey
            ? {
                ...prev,
                items: [...prev.items, ...result.items],
                page: next,
                hasMore: result.has_more,
                loadingMore: false,
              }
            : prev,
        );
      })
      .catch((caught) => {
        if (request !== requestRef.current) return;
        setGrid((prev) =>
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

  function reloadIndex() {
    resetOriginIndexCache();
    setIndex(null);
    setIndexError(false);
    loadTypeOriginIndex(type)
      .then(setIndex)
      .catch(() => setIndexError(true));
  }

  const typeOptions: BayFilterOption[] = BAY_ASSET_TYPE_ORDER.map((item) => ({
    value: item,
    label: tt(BAY_ASSET_TYPE_LABELS[item]),
  }));
  const originOptions: BayFilterOption[] = TYPE_ZONES.filter((item) => item !== "sellers" || bayOn).map((item) => {
    const usable = item !== "live" || liveOk;
    const count =
      item === "owned"
        ? (index ? zoneTotal(index, "first-party") : 0) + (official?.total ?? 0)
        : index && item === "stocked"
          ? zoneTotal(index, "external")
          : item === "mine"
            ? mineGrid?.unauthenticated
              ? undefined
              : mineGrid?.total
            : undefined;
    return {
      value: item,
      label: tt(ZONE_LABELS[item]),
      count,
      disabled: !usable,
      hint: usable ? undefined : tt("此类型没有实时开源上游。"),
    };
  });
  const catOptions: BayFilterOption[] = [];
  if (templateArtifactTypeForBay(type) && zone === "owned") {
    catOptions.push({
      value: OFFICIAL_TEMPLATE_CATEGORY,
      label: tt("官方成品"),
      count: official?.total,
    });
  }
  const seenCat = new Set<string>(
    templateArtifactTypeForBay(type) ? [OFFICIAL_TEMPLATE_CATEGORY] : [],
  );
  for (const room of rooms) {
    seenCat.add(room.category);
    catOptions.push({
      value: room.category,
      label: tt(room.title),
      count: countByCat.get(room.category),
    });
  }
  for (const item of zoneCats) {
    if (seenCat.has(item.key)) continue;
    catOptions.push({
      value: item.key,
      label: tt(categoryLabel(item.key)),
      count: item.total,
    });
  }
  if (cat && !catOptions.some((item) => item.value === cat)) {
    catOptions.push({ value: cat, label: tt(categoryLabel(cat)) });
  }

  const previews = useMemo(
    () =>
      zoneCats
        .map((item) => ({ key: item.key, items: item.sample.slice(0, PREVIEW_PER_ROW) }))
        .filter((item) => item.items.length > 0),
    [zoneCats],
  );

  const typeName = tt(BAY_ASSET_TYPE_LABELS[type]);
  const otherZone: TypeZone = zone === "owned" ? "stocked" : "owned";
  const otherTotal = index
    ? zoneTotal(index, otherZone === "owned" ? "first-party" : "external")
    : 0;
  const formats = useMemo(() => {
    if (!docZone) return [];
    const found = items.map((item) => item.format).filter((value): value is string => Boolean(value));
    return [...new Set([...docZone.formats, ...found])];
  }, [docZone, items]);

  const sellersZone = zone === "sellers";
  const showCategory = !sellersZone && zone !== "live" && zone !== "mine" && !seriesOn;
  const showIndustry = !sellersZone && type === "ppt" && zone !== "live" && zone !== "mine" && !seriesOn;
  const showSeries = seriesAvailable && zone !== "mine" && !sellersZone;

  return (
    <div data-bay-asset-library className="mt-4 flex min-h-[32rem] flex-1 flex-col">
      <BayToolbarFilters>
        {sellersZone ? null : (
          <BayFilterSelect
            name="type"
            label={tt("文件类型")}
            value={type}
            options={typeOptions}
            onChange={changeType}
          />
        )}
        <BayFilterSelect
          name="view"
          label={tt("来源")}
          value={zone}
          options={originOptions}
          onChange={changeZone}
        />
        {sellersZone ? <BayAssetSellerSite value={sellerSite} onChange={setSellerSite} /> : null}
        {showCategory ? (
          <BayFilterSelect
            name="cat"
            label={tt("目录")}
            value={cat}
            options={catOptions}
            onChange={changeCat}
            allLabel={tt("全部目录")}
            searchable={catOptions.length > 12}
          />
        ) : null}
        {showIndustry ? (
          <BayFilterSelect
            name="industry"
            label={tt("行业")}
            value={industry}
            options={PPT_INDUSTRIES.map((item) => ({ value: item.key, label: tt(item.label) }))}
            onChange={setIndustry}
            allLabel={tt("全部行业")}
          />
        ) : null}
        {showSeries ? (
          <BayFilterSelect
            name="series"
            label={tt("成套")}
            value={seriesOn ? "1" : ""}
            options={[{ value: "1", label: tt("只看成套") }]}
            onChange={(value) => setSeriesOn(value === "1")}
            allLabel={tt("全部（含单件）")}
          />
        ) : null}
        {sellersZone ? null : (
          <button
            type="button"
            data-bay-asset-licenses-open
            onClick={() => setLicensesOpen(true)}
            className="h-8 shrink-0 px-2 text-[12px] text-stone-500 hover:text-stone-800"
          >
            {tt("授权说明")}
          </button>
        )}
      </BayToolbarFilters>

      {licensesOpen && !sellersZone ? (
        <div className="mt-4">
          <BayLicensesView onClose={() => setLicensesOpen(false)} />
        </div>
      ) : sellersZone ? (
        <BayAssetSellers query={query} category={sellerSite} view={view} />
      ) : zone === "mine" ? (
        <div className="mt-5" data-bay-asset-mine>
          {mineGrid?.unauthenticated || !signedIn ? (
            <BaySignInPrompt text={tt("登录后查看你这一类的成品。")} />
          ) : mineGrid?.error ? (
            <div className="flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-asset-error>
              <p className="text-[13px] text-neutral-500">{tt(mineGrid.error)}</p>
              <button
                type="button"
                onClick={() => {
                  mineRef.current += 1;
                  setReloadTick((value) => value + 1);
                }}
                className="mt-3 rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {tt("重试")}
              </button>
            </div>
          ) : !mineGrid || (mineGrid.loading && mineGrid.items.length === 0) ? (
            <Items role="status" aria-label={tt("正在加载…")} data-bay-asset-loading>
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} aria-hidden="true" className={view === "list" ? "h-16 animate-pulse bg-stone-100" : "aspect-video animate-pulse rounded-xl border border-stone-200 bg-stone-100"} />
              ))}
            </Items>
          ) : mineGrid.items.length === 0 ? (
            <div data-bay-asset-empty />
          ) : (
            <>
              <Items data-bay-asset-grid>
                {mineGrid?.items.map((asset) => (
                  <BayAssetCard key={asset.id} asset={asset} onOpen={openAsset} view={view} />
                ))}
              </Items>
              {mineGrid?.loading ? (
                <div className="py-8 text-center text-[13px] text-stone-400">{tt("加载中…")}</div>
              ) : null}
              {!mineGrid?.loading && mineGrid?.hasMore ? (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={loadMoreMine}
                    className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    {tt("加载更多")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : indexError && zone !== "live" && !(official && official.total > 0) ? (
        <div className="mt-8 flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-asset-error>
          <p className="text-[13px] text-neutral-500">{tt("素材网关暂时读不到，稍后再试。")}</p>
          <button
            type="button"
            onClick={reloadIndex}
            className="mt-3 rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {tt("重试")}
          </button>
        </div>
      ) : seriesOn && seriesAvailable && origin ? (
        <div className="mt-5">
          <p className="mb-4 text-[12px] text-stone-500">
            {tt("成组配套、风格统一的「{type}」，整套取用不违和（每套均已人工逐件过目）。", { type: typeName })}
          </p>
          <BayAssetSeries type={type} origin={origin} onOpen={openAsset} />
        </div>
      ) : zone === "live" ? (
        liveOk ? (
          <div className="mt-5">
            <BayAssetLive type={type} query={query} onOpen={openAsset} />
          </div>
        ) : (
          <p className="mt-5 text-[12px] text-stone-500">{tt("此类型没有实时开源上游。")}</p>
        )
      ) : !index && !(official && (official.items.length > 0 || official.total > 0)) ? (
        <Items className="mt-5" role="status" aria-label={tt("正在加载…")} data-bay-asset-loading>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} aria-hidden="true" className={view === "list" ? "h-16 animate-pulse bg-stone-100" : "aspect-video animate-pulse rounded-xl border border-stone-200 bg-stone-100"} />
          ))}
        </Items>
      ) : (
        <div className="mt-5">
          {docZone && mode !== "search" ? <DocumentZoneHeader zone={docZone} total={countByCat.get(docZone.category) ?? currentGrid?.items.length} formats={formats} loading={loading && items.length === 0} /> : null}
          {mode === "category" && panel && panel.subs.length > 1 ? (
            <div
              role="tablist"
              aria-label={tt("二级分类")}
              data-bay-asset-subtabs
              className="mb-4 flex flex-nowrap items-center gap-1.5 overflow-x-auto"
            >
              {panel.subs.map((item) => {
                const on = item.key === subtab;
                return (
                  <button
                    key={item.key || "all"}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setSubtab(item.key)}
                    className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium ${
                      on ? "bg-stone-900 text-white" : "bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    {tt(item.label)}
                  </button>
                );
              })}
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 flex flex-col items-center px-4 py-12 text-center" role="status" data-bay-asset-error>
              <p className="text-[13px] text-neutral-500">{tt(error)}</p>
              <button
                type="button"
                onClick={() => {
                  setGrid(null);
                  requestRef.current += 1;
                  setReloadTick((value) => value + 1);
                }}
                className="mt-3 rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {tt("重试")}
              </button>
            </div>
          ) : null}

          {mode === "browse" ? (
            (official?.total || 0) === 0 && previews.length === 0 ? (
              <ZoneEmptyState
                typeName={typeName}
                zone={zone}
                otherZone={otherZone}
                otherTotal={otherTotal}
                liveUsable={liveOk}
                onGoZone={(next) => {
                  setViewPinned(true);
                  setZone(next);
                  setCat("");
                }}
              />
            ) : (
              <div className="space-y-8" data-bay-asset-zone-home>
                {official && (official.total > 0 || official.items.length > 0) ? (
                  <section data-bay-official-templates>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-stone-900">
                        <span className="truncate">{tt("官方成品")}</span>
                        <span className="tabular-nums text-[12px] font-normal text-stone-400">
                          {official.total.toLocaleString("en-US")}
                        </span>
                      </h2>
                      <button
                        type="button"
                        onClick={() => changeCat(OFFICIAL_TEMPLATE_CATEGORY)}
                        className="shrink-0 text-[13px] font-medium text-stone-400 hover:text-sky-600"
                      >
                        {tt("查看全部")}
                      </button>
                    </div>
                    <Items data-bay-asset-grid>
                      {official.items.slice(0, BAY_OFFICIAL_PREVIEW_COUNT).map((asset) => (
                        <BayAssetCard key={asset.id} asset={asset} onOpen={openAsset} view={view} />
                      ))}
                    </Items>
                  </section>
                ) : null}
                {previews.map((preview) => {
                  const cfg = panels.find((item) => item.key === preview.key);
                  const title = cfg?.label || categoryLabel(preview.key);
                  return (
                    <section key={preview.key}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h2 className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-stone-900">
                          {cfg?.icon ? <span aria-hidden>{cfg.icon}</span> : null}
                          <span className="truncate">{tt(title)}</span>
                          <span className="tabular-nums text-[12px] font-normal text-stone-400">
                            {(countByCat.get(preview.key) ?? 0).toLocaleString("en-US")}
                          </span>
                        </h2>
                        <button
                          type="button"
                          onClick={() => changeCat(preview.key)}
                          className="shrink-0 text-[13px] font-medium text-stone-400 hover:text-sky-600"
                        >
                          {tt("查看全部")}
                        </button>
                      </div>
                      <Items data-bay-asset-grid>
                        {preview.items.map((asset) => (
                          <BayAssetCard key={asset.id} asset={asset} onOpen={openAsset} view={view} />
                        ))}
                      </Items>
                    </section>
                  );
                })}
              </div>
            )
          ) : null}

          {mode !== "browse" ? (
            <>
              {loading && items.length === 0 ? (
                <Items role="status" aria-label={tt("正在加载…")} data-bay-asset-loading>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} aria-hidden="true" className={view === "list" ? "h-16 animate-pulse bg-stone-100" : "aspect-video animate-pulse rounded-xl border border-stone-200 bg-stone-100"} />
                  ))}
                </Items>
              ) : items.length === 0 && !error ? (
                docZone ? (
                  <div data-bay-asset-empty />
                ) : (
                  <ZoneEmptyState
                    typeName={typeName}
                    zone={zone}
                    otherZone={otherZone}
                    otherTotal={otherTotal}
                    liveUsable={liveOk}
                    searching={mode === "search"}
                    onGoZone={(next) => {
                      setViewPinned(true);
                      setZone(next);
                      setCat("");
                    }}
                  />
                )
              ) : items.length > 0 ? (
                <Items data-bay-asset-grid>
                  {items.map((asset) => (
                    <BayAssetCard key={asset.id} asset={asset} onOpen={openAsset} view={view} />
                  ))}
                </Items>
              ) : null}
              {loading && items.length > 0 ? (
                <div className="py-8 text-center text-[13px] text-stone-400">{tt("加载中…")}</div>
              ) : null}
              {!loading && hasMore && items.length > 0 ? (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    {tt("加载更多")}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      {active ? <BayAssetDetail asset={active} onClose={closeAsset} /> : null}
      <BayArtifactDeepLink accent={accent} />
    </div>
  );
}

function DocumentZoneHeader({
  zone,
  total,
  formats,
  loading,
}: {
  zone: DocumentZone;
  total?: number;
  formats: string[];
  loading: boolean;
}) {
  const tt = useUI();
  return (
    <header className="mb-5" data-bay-asset-doc-zone={zone.slug}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{tt("文档分区")}</p>
      <h2 className="mt-1 text-lg font-semibold text-stone-900">{tt(zone.title)}</h2>
      {zone.officialNumbers.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="shrink-0 rounded-full bg-sky-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
              {tt("官方原文")}
            </span>
            {zone.officialNumbers.map((number) => (
              <span key={number} className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[13px] font-semibold text-sky-900 ring-1 ring-sky-200">
                {number}
              </span>
            ))}
          </div>
          {zone.officialSourceNote ? (
            <p className="mt-2 text-[13px] text-sky-900/80">{tt(zone.officialSourceNote)}</p>
          ) : null}
        </div>
      ) : null}
      <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-[11px] text-stone-400">{tt("素材数")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-stone-900">
            {loading || total == null ? "…" : total.toLocaleString("en-US")}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-stone-400">{tt("许可来源")}</dt>
          <dd className="mt-1 font-medium text-stone-900">{tt(zone.licenseLabel)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-stone-400">{tt("可下载格式")}</dt>
          <dd className="mt-1 font-medium text-stone-900">
            {formats.map((item) => item.toUpperCase()).join(" · ") || tt("未标注")}
          </dd>
        </div>
      </dl>
    </header>
  );
}

function ZoneEmptyState({
  typeName,
  zone,
  otherZone,
  otherTotal,
  liveUsable,
  onGoZone,
}: {
  typeName: string;
  zone: TypeZone;
  otherZone: TypeZone;
  otherTotal: number;
  liveUsable: boolean;
  searching?: boolean;
  onGoZone: (zone: TypeZone) => void;
}) {
  const tt = useUI();
  return (
    <div data-bay-asset-empty>
      <div className="flex items-center justify-center gap-2 overflow-x-auto text-[13px]">
        {otherTotal > 0 ? (
          <button
            type="button"
            onClick={() => onGoZone(otherZone)}
            className="shrink-0 rounded-full border border-neutral-900 px-4 py-2 text-stone-700 hover:bg-stone-50"
          >
            {tt("去「{zone}」看 {n} 件", {
              zone: tt(ZONE_LABELS[otherZone]),
              n: otherTotal.toLocaleString("en-US"),
            })}
          </button>
        ) : null}
        {liveUsable ? (
          <button
            type="button"
            onClick={() => onGoZone("live")}
            className="shrink-0 rounded-full border border-neutral-900 px-4 py-2 text-stone-700 hover:bg-stone-50"
          >
            {tt("去实时搜索全网开源「{type}」", { type: typeName })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
