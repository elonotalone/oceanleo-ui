"use client";

import { BackButton } from "../../../ui/BackButton";
import { Breadcrumb } from "../../../ui/Breadcrumb";
import { BayRecovery } from "./BayRecovery";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import { COLLECTION_ACTION_BTN_GHOST, CollectionCardGrid, CollectionInfiniteSentinel } from "../../collection-chrome";
import { CollectionItemList } from "../../collection-items";
import { siteIconFor } from "../../site-icons";
import { BayAssetCard } from "../asset/BayAssetCard";
import type { BayAsset } from "../asset/library-client";
import { BayFilterSelect } from "./BayFilterSelect";
import { fetchMaterialShelf, fetchMaterialTaxonomy, type MaterialPage } from "./material-shelf-client";
import { emptyMaterialFilters, MATERIAL_TAG_LABELS, materialLabel, materialSearch, readMaterialFilters, type MaterialFilters, type MaterialShelf, type MaterialTaxonomy } from "./material-taxonomy";

const readSearch = () => typeof window === "undefined" ? "" : window.location.search;
const PAGE_SIZE = 30;
const EMPTY_PAGE: MaterialPage = { items: [], categoryCounts: {}, categoryCovers: {}, categoryFacets: {}, contentTypePreviews: {}, nextOfficial: null, nextSeller: null, unavailable: false };
const TYPE_ICONS: Record<string, string> = { deck: "ppt", design: "image", document: "word", sheet: "excel", website: "website", game: "game", video: "video", model_3d: "threed", audio: "music" };

export function ReadyMaterialCatalog({ siteKey, appId, query, view, sellers, online, onOnlineChange, onOpen, children }: {
  siteKey: string; appId?: string; query: string; view: "grid" | "list"; sellers: boolean;
  online: boolean; onOnlineChange: (online: boolean) => void; onOpen: (asset: BayAsset) => void; children: ReactNode;
}) {
  const tt = useUI();
  let locale = "en";
  try { locale = useLocale(); } catch { /* Embedded catalogs can omit next-intl. */ }
  const [search, setSearch] = useState("");
  const [taxonomy, setTaxonomy] = useState<MaterialTaxonomy | null>(null);
  const [taxonomyError, setTaxonomyError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState<MaterialPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageKey, setPageKey] = useState("");
  const typeRow = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState({ back: false, next: false });
  const type = new URLSearchParams(search).get("type");
  const shelf = taxonomy?.shelves.find((row) => row.id === type) || taxonomy?.shelves[0];
  const filters = useMemo(() => readMaterialFilters(search, shelf, taxonomy || undefined), [search, shelf, taxonomy]);
  const selectedCategory = shelf?.categories.find((row) => row.id === filters.category);
  const narrowed = Boolean(query.trim() || filters.contentType || filters.format || Object.keys(filters.tags).length);
  const filterKey = JSON.stringify(filters);
  const requestKey = JSON.stringify([shelf?.id, filterKey, query, siteKey, appId, sellers, retry]);
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;

  useEffect(() => {
    const restore = () => setSearch(readSearch());
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  // First visit selects Presentations, and invalid type URLs resolve the same way.
  useEffect(() => {
    if (!shelf || type === shelf.id || online) return;
    const value = materialSearch(readSearch(), shelf.id, emptyMaterialFilters());
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${value}${window.location.hash}`);
    setSearch(value);
  }, [shelf, type, online]);

  useEffect(() => {
    const controller = new AbortController();
    setTaxonomyError(false);
    void fetchMaterialTaxonomy(controller.signal).then(setTaxonomy).catch(() => {
      if (!controller.signal.aborted) setTaxonomyError(true);
    });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!shelf || online) return;
    const controller = new AbortController();
    setLoading(true); setPageKey(""); setPage(EMPTY_PAGE); setLoadingMore(false);
    void fetchMaterialShelf({ shelfType: shelf.id, filters: JSON.parse(filterKey), q: query, siteKey, appId, limit: PAGE_SIZE },
      { signal: controller.signal, sellers }).then((result) => {
      if (!controller.signal.aborted) { setPage(result); setPageKey(requestKey); }
    }).catch(() => {
      if (!controller.signal.aborted) { setPage({ ...EMPTY_PAGE, unavailable: true }); setPageKey(requestKey); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [shelf, filterKey, query, siteKey, appId, sellers, retry, online, requestKey]);

  useEffect(() => {
    const row = typeRow.current;
    if (!row) return;
    const measure = () => setArrows({ back: row.scrollLeft > 1, next: row.scrollLeft + row.clientWidth < row.scrollWidth - 1 });
    measure(); row.addEventListener("scroll", measure); window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(row);
    return () => { row.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); observer?.disconnect(); };
  }, [taxonomy, selectedCategory]);

  const moreController = useRef<AbortController | null>(null);
  useEffect(() => () => moreController.current?.abort(), [requestKey, online]);

  function choose(row: MaterialShelf, next = emptyMaterialFilters()) {
    onOnlineChange(false);
    const value = materialSearch(readSearch(), row.id, next);
    window.history.pushState(window.history.state, "", `${window.location.pathname}?${value}${window.location.hash}`);
    setSearch(value);
  }

  async function loadMore() {
    if (!shelf || loading || loadingMore || pageKey !== requestKey || (page.nextOfficial === null && page.nextSeller === null)) return;
    const controller = new AbortController();
    moreController.current = controller; setLoadingMore(true);
    try {
      const result = await fetchMaterialShelf({ shelfType: shelf.id, filters, q: query, siteKey, appId, limit: PAGE_SIZE },
        { signal: controller.signal, sellers, officialOffset: page.nextOfficial, sellerCursor: page.nextSeller });
      if (!controller.signal.aborted) setPage((current) => {
        const seen = new Set(current.items.map((item) => item.id));
        return { ...current, unavailable: current.unavailable || result.unavailable,
          items: [...current.items, ...result.items.filter((item) => !seen.has(item.id))],
          nextOfficial: result.nextOfficial === current.nextOfficial ? null : result.nextOfficial,
          nextSeller: result.nextSeller === current.nextSeller ? null : result.nextSeller,
        };
      });
    } catch { if (!controller.signal.aborted) setPage((current) => ({ ...current, unavailable: true })); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  }

  const unavailable = taxonomyError || page.unavailable;
  const hasMore = page.nextOfficial !== null || page.nextSeller !== null;
  const changeFilter = (next: Partial<MaterialFilters>) => shelf && choose(shelf, { ...filters, ...next });
  const categories = shelf?.categories.filter((row) => page.categoryCounts[row.id] > 0) || [];
  const contentTypes = selectedCategory?.contentTypes.filter((row) => page.contentTypePreviews[row.id]?.length || row.id === filters.contentType) || [];
  const backSearch = shelf ? materialSearch(search, shelf.id, emptyMaterialFilters()) : "";
  function typeButton(id: string, label: string, selected: boolean, onClick: () => void) {
    return <button type="button" key={id} data-bay-ready-kind={id === "online" ? undefined : id} aria-pressed={selected}
      className={`flex w-24 shrink-0 flex-col items-center gap-2 px-1 pb-2 text-center text-xs ${selected ? "font-semibold text-neutral-900" : "text-neutral-600"}`}
      onClick={onClick}>
      <span aria-hidden className={`flex h-12 w-12 items-center justify-center rounded-full p-3 ${selected ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-600"}`}>{siteIconFor(TYPE_ICONS[id] || "bizdev")}</span>
      <span className={selected ? "underline decoration-2 underline-offset-4" : ""}>{label}</span>
    </button>;
  }

  return <>
    {!selectedCategory || online ? <div className="relative mb-6" data-bay-ready-navigation>
      <div ref={typeRow} role="group" aria-label={tt("文件类型")} data-bay-ready-kinds className="flex flex-nowrap gap-2 overflow-x-auto">
        {taxonomy?.shelves.map((row) => typeButton(row.id, materialLabel(row, locale), shelf?.id === row.id && !online, () => choose(row)))}
        {typeButton("online", tt("在线素材"), online, () => onOnlineChange(true))}
      </div>
      {arrows.back ? <button type="button" aria-label={tt("向左滚动")} className="absolute left-0 top-3 rounded-full bg-white p-2 shadow-sm" onClick={() => typeRow.current?.scrollBy({ left: -300, behavior: "smooth" })}>‹</button> : null}
      {arrows.next ? <button type="button" aria-label={tt("向右滚动")} className="absolute right-0 top-3 rounded-full bg-white p-2 shadow-sm" onClick={() => typeRow.current?.scrollBy({ left: 300, behavior: "smooth" })}>›</button> : null}
    </div> : null}
    {online ? children : <>
      {selectedCategory && shelf ? <header className="mb-5 space-y-3">
        <div data-bay-category-title className="flex min-w-0 items-center gap-3 text-lg font-semibold">
          <BackButton href={`?${backSearch}`} onClick={(event) => { event.preventDefault(); choose(shelf); }} label={materialLabel(shelf, locale)} />
          <Breadcrumb items={[
            {label: materialLabel(shelf, locale), href: `?${backSearch}`, onClick: (event) => { event.preventDefault(); choose(shelf); }},
            {label: materialLabel(selectedCategory, locale)},
          ]} current={<h2 className="truncate text-lg font-semibold">{materialLabel(selectedCategory, locale)}</h2>} />
        </div>
        <div data-bay-taxonomy-filters className="flex flex-wrap gap-2">
          {contentTypes.length ? <BayFilterSelect name="contentType" label={tt("内容类型")} value={filters.contentType} allLabel={tt("全部内容类型")}
            options={contentTypes.map((row) => ({ value: row.id, label: materialLabel(row, locale) }))} onChange={(contentType) => changeFilter({ contentType })} /> : null}
          {Object.entries(taxonomy?.tagVocabularies || {}).map(([key, values]) => {
            const available = page.categoryFacets[selectedCategory.id]?.[key] || [];
            const options = values.filter((row) => available.includes(row.id) || filters.tags[key]?.includes(row.id));
            return options.length ? <BayFilterSelect key={key} name={key} label={tt(MATERIAL_TAG_LABELS[key] || key)} value={filters.tags[key]?.[0] || ""} allLabel={tt(MATERIAL_TAG_LABELS[key] || key)}
              options={options.map((row) => ({ value: row.id, label: materialLabel(row, locale) }))}
              onChange={(value) => { const tags = { ...filters.tags }; if (value) tags[key] = [value]; else delete tags[key]; changeFilter({ tags }); }} /> : null;
          })}
        </div>
      </header> : null}
      {unavailable ? <BayRecovery scope="shell/ReadyMaterialCatalog.tsx:163" reload={() => setRetry((value) => value + 1)} /> : null}
      {!selectedCategory ? <div data-bay-ready-categories className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, max(15rem, calc((100% - 3rem) / 4))), 1fr))" }}>
        {categories.map((row, index) => {
          const cover = page.categoryCovers[row.id];
          return <button type="button" key={row.id} data-bay-ready-category={row.id} onClick={() => shelf && choose(shelf, { ...emptyMaterialFilters(), category: row.id })}
            className={`flex min-h-36 items-center justify-between gap-3 overflow-hidden rounded-2xl p-5 text-left hover:brightness-95 ${index % 2 ? "bg-stone-100" : "bg-neutral-100"}`}>
            <span className="min-w-0 flex-1 text-base font-semibold">{materialLabel(row, locale)}</span>
            {cover && (cover.thumb_url || cover.preview_url) ? <img src={cover.thumb_url || cover.preview_url} alt="" loading="lazy" className="h-28 w-1/2 rounded-lg object-contain" /> : null}
          </button>;
        })}
      </div> : narrowed ? <section data-bay-ready-grid={shelf?.id}>
        <Items data-bay-asset-grid>{page.items.map((asset) => <BayAssetCard key={asset.id} asset={asset} view={view} onOpen={onOpen} />)}</Items>
        {hasMore ? <div className="mt-5 text-center">
          <button type="button" className={COLLECTION_ACTION_BTN_GHOST} disabled={loadingMore} onClick={() => void loadMore()}>{tt(loadingMore ? "正在加载…" : "加载更多")}</button>
          <CollectionInfiniteSentinel active={!unavailable} loading={loadingMore} onLoadMore={() => void loadMore()} />
        </div> : null}
      </section> : <div className="space-y-8" data-bay-ready-shelves>
        {contentTypes.map((row) => <section key={row.id} data-bay-ready-shelf={row.id}>
          <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{materialLabel(row, locale)}</h3>
            <button type="button" className={COLLECTION_ACTION_BTN_GHOST} onClick={() => changeFilter({ contentType: row.id })}>{tt("查看全部")}</button></div>
          <div className="flex gap-4 overflow-x-auto" data-bay-asset-shelf>
            {page.contentTypePreviews[row.id].slice(0, 4).map((asset) => <div key={asset.id} className="w-56 shrink-0"><BayAssetCard asset={asset} view="grid" onOpen={onOpen} /></div>)}
          </div>
        </section>)}
      </div>}
      {!loading && !unavailable && (selectedCategory ? !page.items.length : !categories.length) ? <p className="py-12 text-center text-sm">{tt("这里还没有这个分类的素材。")}</p> : null}
      {loading || (!taxonomy && !taxonomyError) ? <div role="status" aria-label={tt("正在加载…")} data-bay-ready-loading className="mt-4 grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="aspect-video animate-pulse rounded-xl bg-neutral-100" />)}
      </div> : null}
    </>}
  </>;
}
