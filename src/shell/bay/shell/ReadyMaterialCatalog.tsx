"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import { COLLECTION_ACTION_BTN_GHOST, CollectionCardGrid, CollectionInfiniteSentinel } from "../../collection-chrome";
import { CollectionItemList } from "../../collection-items";
import { BayAssetCard } from "../asset/BayAssetCard";
import type { BayAsset } from "../asset/library-client";
import { BayFilterSelect } from "./BayFilterSelect";
import { fetchMaterialShelf, fetchMaterialTaxonomy, type MaterialPage } from "./material-shelf-client";
import { emptyMaterialFilters, MATERIAL_TAG_LABELS, materialLabel, materialSearch, readMaterialFilters, type MaterialFilters, type MaterialShelf, type MaterialTaxonomy } from "./material-taxonomy";

const readSearch = () => typeof window === "undefined" ? "" : window.location.search;
const PAGE_SIZE = 30;
const EMPTY_PAGE: MaterialPage = { items: [], categoryCounts: {}, nextOfficial: null, nextSeller: null, unavailable: false };
const CHIP = "min-h-8 shrink-0 rounded-full border px-3 text-xs";

export function ReadyMaterialCatalog({ siteKey, appId, query, view, sellers, online, onOnlineChange, onOpen, children }: {
  siteKey: string; appId?: string; query: string; view: "grid" | "list"; sellers: boolean;
  online: boolean; onOnlineChange: (online: boolean) => void; onOpen: (asset: BayAsset) => void; children: ReactNode;
}) {
  const tt = useUI();
  let locale = "en";
  try { locale = useLocale(); } catch { /* Embedded catalogs can omit next-intl. */ }
  const [search, setSearch] = useState(readSearch);
  const [taxonomy, setTaxonomy] = useState<MaterialTaxonomy | null>(null);
  const [taxonomyError, setTaxonomyError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [overview, setOverview] = useState<Record<string, MaterialPage>>({});
  const [page, setPage] = useState<MaterialPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageKey, setPageKey] = useState("");
  const type = new URLSearchParams(search).get("type");
  const shelf = taxonomy?.shelves.find((row) => row.id === type);
  const filters = useMemo(() => readMaterialFilters(search, shelf, taxonomy || undefined), [search, shelf, taxonomy]);
  const filterKey = JSON.stringify(filters);
  const requestKey = JSON.stringify([shelf?.id, filterKey, query, siteKey, appId, sellers, retry]);
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;

  useEffect(() => {
    const restore = () => setSearch(readSearch());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setTaxonomyError(false);
    void fetchMaterialTaxonomy(controller.signal).then(setTaxonomy).catch(() => {
      if (!controller.signal.aborted) setTaxonomyError(true);
    });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!taxonomy || online) return;
    const controller = new AbortController();
    setLoading(true); setPageKey(""); setPage(EMPTY_PAGE); setOverview({}); setLoadingMore(false);
    const selected = shelf ? [shelf] : taxonomy.shelves;
    let pending = selected.length;
    for (const row of selected) {
      void fetchMaterialShelf({ shelfType: row.id, filters: shelf ? JSON.parse(filterKey) : emptyMaterialFilters(),
        q: query, siteKey, appId, limit: shelf ? PAGE_SIZE : 4 }, { signal: controller.signal, sellers }).then((result) => {
        if (controller.signal.aborted) return;
        if (shelf) { setPage(result); setPageKey(requestKey); }
        else setOverview((current) => ({ ...current, [row.id]: result }));
      }).catch(() => {
        if (controller.signal.aborted) return;
        const failed = { ...EMPTY_PAGE, unavailable: true };
        if (shelf) { setPage(failed); setPageKey(requestKey); }
        else setOverview((current) => ({ ...current, [row.id]: failed }));
      }).finally(() => {
        pending -= 1;
        if (!controller.signal.aborted && pending === 0) setLoading(false);
      });
    }
    return () => controller.abort();
  }, [taxonomy, shelf, filterKey, query, siteKey, appId, sellers, retry, online, requestKey]);

  // A different filter cancels both the initial request and any pagination request.
  const [moreController, setMoreController] = useState<AbortController | null>(null);
  useEffect(() => () => moreController?.abort(), [moreController, requestKey, online]);

  function choose(row: MaterialShelf | null, next = emptyMaterialFilters()) {
    onOnlineChange(false);
    const value = materialSearch(readSearch(), row?.id || null, next);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${value ? `?${value}` : ""}${window.location.hash}`);
    setSearch(value);
  }

  async function loadMore() {
    if (!shelf || loading || loadingMore || pageKey !== requestKey || (page.nextOfficial === null && page.nextSeller === null)) return;
    const controller = new AbortController();
    setMoreController(controller); setLoadingMore(true);
    try {
      const result = await fetchMaterialShelf({ shelfType: shelf.id, filters, q: query, siteKey, appId, limit: PAGE_SIZE },
        { signal: controller.signal, sellers, officialOffset: page.nextOfficial, sellerCursor: page.nextSeller });
      if (!controller.signal.aborted) setPage((current) => {
        const seen = new Set(current.items.map((item) => item.id));
        return { ...result, categoryCounts: current.categoryCounts,
          items: [...current.items, ...result.items.filter((item) => !seen.has(item.id))],
          nextOfficial: result.nextOfficial === current.nextOfficial ? null : result.nextOfficial,
          nextSeller: result.nextSeller === current.nextSeller ? null : result.nextSeller,
        };
      });
    } catch {
      if (!controller.signal.aborted) setPage((current) => ({ ...current, unavailable: true }));
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  const selectedCategory = shelf?.categories.find((row) => row.id === filters.category);
  const unavailable = taxonomyError || (shelf ? page.unavailable : Object.values(overview).some((row) => row.unavailable));
  const hasMore = page.nextOfficial !== null || page.nextSeller !== null;
  const changeFilter = (next: Partial<MaterialFilters>) => shelf && choose(shelf, { ...filters, ...next });

  return <>
    <div role="group" aria-label={tt("文件类型")} data-bay-ready-kinds className="mb-4 flex flex-wrap gap-2">
      <button type="button" data-bay-ready-all aria-pressed={!shelf && !online} className={CHIP} onClick={() => choose(null)}>{tt("全部")}</button>
      {taxonomy?.shelves.map((row) => <button type="button" key={row.id} data-bay-ready-kind={row.id}
        aria-pressed={shelf?.id === row.id && !online} className={`${CHIP} ${shelf?.id === row.id && !online ? "bg-neutral-100" : ""}`}
        onClick={() => choose(row)}>{materialLabel(row, locale)}</button>)}
      <button type="button" aria-pressed={online} className={CHIP} onClick={() => onOnlineChange(true)}>{tt("在线素材")}</button>
    </div>
    {online ? children : <>
      {shelf ? <div data-bay-taxonomy-filters className="mb-5 space-y-3">
        <div role="group" aria-label={tt("内容分类")} className="flex flex-wrap gap-2">
          <button type="button" className={CHIP} aria-pressed={!filters.category} onClick={() => changeFilter({ category: "", contentType: "" })}>{tt("全部分类")}</button>
          {shelf.categories.map((row) => <button type="button" key={row.id} className={CHIP}
            aria-pressed={filters.category === row.id} onClick={() => changeFilter({ category: row.id, contentType: "" })}>
            {materialLabel(row, locale)} <span className="tabular-nums">{loading ? "…" : (page.categoryCounts[row.id] || 0).toLocaleString(locale)}</span>
          </button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedCategory ? <BayFilterSelect name="contentType" label={tt("内容类型")} value={filters.contentType} allLabel={tt("全部内容类型")}
            options={selectedCategory.contentTypes.map((row) => ({ value: row.id, label: materialLabel(row, locale) }))}
            onChange={(contentType) => changeFilter({ contentType })} /> : null}
          {shelf.id === "document" ? <BayFilterSelect name="format" label={tt("格式")} value={filters.format} allLabel={tt("全部格式")}
            options={shelf.artifactTypes.map((id) => ({ value: id, label: id === "pdf" ? "PDF" : tt("其他文档格式") }))}
            onChange={(format) => changeFilter({ format })} /> : null}
          {Object.entries(taxonomy?.tagVocabularies || {}).map(([key, values]) => <BayFilterSelect key={key} name={key}
            label={tt(MATERIAL_TAG_LABELS[key] || key)} value={filters.tags[key]?.[0] || ""} allLabel={tt(MATERIAL_TAG_LABELS[key] || key)}
            options={values.map((row) => ({ value: row.id, label: materialLabel(row, locale) }))}
            onChange={(value) => { const tags = { ...filters.tags }; if (value) tags[key] = [value]; else delete tags[key]; changeFilter({ tags }); }} />)}
        </div>
      </div> : null}
      {unavailable ? <div role="status" data-bay-asset-error className="mb-4 flex items-center gap-3 text-sm">
        <p>{tt(taxonomyError ? "素材分类未能加载，请重试。" : "部分素材未能加载，请重试。")}</p>
        <button type="button" className={COLLECTION_ACTION_BTN_GHOST} onClick={() => setRetry((value) => value + 1)}>{tt("重试")}</button>
      </div> : null}
      {shelf ? <section data-bay-ready-grid={shelf.id}>
        <Items data-bay-asset-grid>{page.items.map((asset) => <BayAssetCard key={asset.id} asset={asset} view={view} onOpen={onOpen} />)}</Items>
        {hasMore ? <div className="mt-5 text-center">
          <button type="button" className={COLLECTION_ACTION_BTN_GHOST} disabled={loadingMore} onClick={() => void loadMore()}>{tt(loadingMore ? "正在加载…" : "加载更多")}</button>
          <CollectionInfiniteSentinel active={!unavailable} loading={loadingMore} onLoadMore={() => void loadMore()} />
        </div> : null}
        {!loading && !unavailable && !page.items.length ? <p className="py-12 text-center text-sm">{tt("这里还没有这个分类的素材。")}</p> : null}
      </section> : <div className="space-y-8" data-bay-ready-shelves>
        {taxonomy?.shelves.map((row) => <section key={row.id} data-bay-ready-shelf={row.id}>
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{materialLabel(row, locale)}</h2>
            <button type="button" className={COLLECTION_ACTION_BTN_GHOST} onClick={() => choose(row)}>{tt("查看全部")}</button></div>
          <Items data-bay-asset-grid>{overview[row.id]?.items.slice(0, 4).map((asset) => <BayAssetCard key={asset.id} asset={asset} view={view} onOpen={onOpen} />)}</Items>
          {overview[row.id] && !overview[row.id].items.length && !overview[row.id].unavailable ? <p className="py-4 text-sm text-neutral-500">{tt("这里还没有这个分类的素材。")}</p> : null}
        </section>)}
      </div>}
      {loading || (!taxonomy && !taxonomyError) ? <div role="status" aria-label={tt("正在加载…")} className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="aspect-video animate-pulse rounded-xl bg-neutral-100" />)}
      </div> : null}
    </>}
  </>;
}
