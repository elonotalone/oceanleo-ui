"use client";

// LeoBay 成品货架：种类封面卡 → 分栏货架 → 单种类网格。基础素材仍由原有 API 与插入面板提供。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionCardGrid, CollectionInfiniteSentinel, COLLECTION_ACTION_BTN_GHOST } from "../../collection-chrome";
import { CollectionItemList } from "../../collection-items";
import { bayEnabledHere, type BayFeedFilter } from "../shell/bay-state";
import { canonicalArtifactContextId, type ArtifactContextRef } from "../../artifact-contract";
import type { WorkspaceLibraryEntry } from "../../workspace-library-model";
import { BayAssetCard } from "./BayAssetCard";
import { BayArtifactDeepLink, bayAssetRefForCard, useBayAssetRoute } from "./BayArtifactDeepLink";
import { BayLicensesView } from "./BayLicensesView";
import { BAY_ASSET_TYPE_LABELS, BAY_ASSET_TYPE_ORDER, type BayAsset, type BayAssetType } from "./library-client";
import { BAY_TEMPLATE_PAGE_SIZE } from "./bay-template-shelf";
import { loadReadyLegacyPpt, loadReadyOfficial, loadReadySellers, readyShelfCover, readyTypeFromSearch, type ReadyFile } from "../shell/bay-ready-files";

const PREVIEW_PER_ROW = 4;
const readSearch = () => typeof window === "undefined" ? "" : window.location.search;

type SourceState = { items: ReadyFile[]; loading: boolean; error: boolean };

export function BayAssetLibrary({ filter, siteKey, accent, view = "grid", context: providedContext, onEdit, onUseInTask,
  detailInPage = false, licensesOpen = false, onCloseLicenses,
}: {
  filter: BayFeedFilter;
  siteKey: string;
  accent?: string;
  view?: "grid" | "list";
  context?: ArtifactContextRef;
  onEdit?: (entry: WorkspaceLibraryEntry) => Promise<void> | void;
  onUseInTask?: (entry: WorkspaceLibraryEntry) => Promise<void> | void;
  /** /bay lifts the detail outside Browse; embedded hosts retain their own detail. */
  detailInPage?: boolean;
  licensesOpen?: boolean;
  onCloseLicenses?: () => void;
}) {
  const tt = useUI();
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;
  const rootRef = useRef<HTMLDivElement>(null);
  const route = useBayAssetRoute(rootRef);
  const [type, setType] = useState<BayAssetType | null>(() => readyTypeFromSearch(readSearch()));
  const [cat, setCat] = useState(() => new URLSearchParams(readSearch()).get("cat") || "");
  const [limit, setLimit] = useState(BAY_TEMPLATE_PAGE_SIZE);
  const [retry, setRetry] = useState(0);
  const [sources, setSources] = useState<Record<string, SourceState>>({});
  const appId = providedContext?.appId || new URLSearchParams(readSearch()).get("app") || "";
  const context = useMemo(() => providedContext || (appId ? { contextId: canonicalArtifactContextId(siteKey, appId), siteKey, appId } : undefined), [providedContext, siteKey, appId]);
  const bayOn = bayEnabledHere();
  const query = (filter.q || "").trim().toLowerCase();

  useEffect(() => {
    const controller = new AbortController();
    const jobs: [string, () => Promise<ReadyFile[]>][] = BAY_ASSET_TYPE_ORDER.map((type) =>
      [type, () => loadReadyOfficial(type, { siteKey, context, signal: controller.signal })]);
    jobs.push(["legacy-ppt", () => loadReadyLegacyPpt(controller.signal)]);
    if (bayOn) jobs.push(["sellers", () => loadReadySellers(controller.signal)]);
    setSources(Object.fromEntries(jobs.map(([key]) => [key, { items: [], loading: true, error: false }])));
    for (const [key, load] of jobs) {
      void load().then((items) => {
        if (!controller.signal.aborted) setSources((prev) => ({ ...prev, [key]: { items, loading: false, error: false } }));
      }).catch((error) => {
        if (!controller.signal.aborted) setSources((prev) => ({ ...prev, [key]: { items: error?.items || [], loading: false, error: true } }));
      });
    }
    return () => controller.abort();
  }, [siteKey, context, bayOn, retry]);

  useEffect(() => {
    const restore = () => {
      setType(readyTypeFromSearch(readSearch()));
      setCat(new URLSearchParams(readSearch()).get("cat") || "");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => { setLimit(BAY_TEMPLATE_PAGE_SIZE); }, [type, cat, query]);

  const shelves = useMemo(() => BAY_ASSET_TYPE_ORDER.map((type) => {
    const candidates = [...(sources[type]?.items || []), ...(type === "ppt" ? sources["legacy-ppt"]?.items || [] : []),
      ...(sources.sellers?.items.filter((item) => item.type === type) || [])];
    const seen = new Set<string>();
    const items = candidates.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return !query || [item.title, item.author, ...(item.tags || [])].join(" ").toLowerCase().includes(query);
    });
    return { type, items };
  }).filter((shelf) => shelf.items.length > 0), [sources, query]);
  const loading = Object.values(sources).some((source) => source.loading) || Object.keys(sources).length === 0;
  const error = Object.values(sources).some((source) => source.error);
  const selected = shelves.find((shelf) => shelf.type === type);
  // Old official-templates was a source filter; it now means the whole finished-file kind.
  const gridItems = (selected?.items || []).filter((item) => !cat || cat === "official-templates" ||
    item.category === cat || item.tags?.includes(cat) || item.tags?.includes(`category:${cat}`));
  const shown = gridItems.slice(0, limit);
  const openAsset = useCallback((asset: BayAsset) => route.open(bayAssetRefForCard(asset)), [route.open]);

  function chooseType(next: BayAssetType | null) {
    setType(next);
    setCat("");
    const params = new URLSearchParams(readSearch());
    if (next) params.set("type", next); else params.delete("type");
    for (const key of ["view", "zone", "cat", "industry", "series", "subtab", "sellerSite"]) params.delete(key);
    const search = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
  }

  return <div ref={rootRef} data-bay-asset-library className="mt-4 flex min-h-[32rem] flex-1 flex-col">
    <div hidden={Boolean(route.target)} className="min-h-0 flex-1" data-bay-asset-browse>
      <div role="group" aria-label={tt("文件类型")} data-bay-ready-kinds className="mb-6 flex items-stretch gap-3 overflow-x-auto pb-2">
        <button type="button" data-bay-ready-all aria-pressed={!type} onClick={() => chooseType(null)}
          className={`${COLLECTION_ACTION_BTN_GHOST} shrink-0 ${!type ? "bg-neutral-100" : ""}`}>{tt("全部")}</button>
        {shelves.map((shelf) => {
          const cover = readyShelfCover(shelf.items);
          return <button key={shelf.type} type="button" data-bay-ready-kind={shelf.type} aria-pressed={type === shelf.type}
            onClick={() => chooseType(type === shelf.type ? null : shelf.type)}
            className={`flex w-44 shrink-0 items-center gap-3 overflow-hidden rounded-xl border bg-white p-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400 ${type === shelf.type ? "border-neutral-900" : "border-neutral-200 hover:border-neutral-400"}`}>
            <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
              {cover ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
            </span>
            <span className="min-w-0"><span className="block text-[13px] font-medium text-neutral-900">{tt(BAY_ASSET_TYPE_LABELS[shelf.type])}</span>
              <span className="mt-1 block text-[12px] tabular-nums text-neutral-500">{tt("{n} 件", { n: shelf.items.length.toLocaleString() })}</span></span>
          </button>;
        })}
      </div>
      {error ? <div role="status" data-bay-asset-error className="mb-4 flex items-center gap-3 text-[13px] text-neutral-500">
        <p>{tt("素材没读出来，请稍后再试。")}</p><button type="button" className={COLLECTION_ACTION_BTN_GHOST} onClick={() => setRetry((value) => value + 1)}>{tt("重试")}</button>
      </div> : null}
      {!type ? <div className="space-y-8" data-bay-ready-shelves>
        {shelves.map((shelf) => <section key={shelf.type} data-bay-ready-shelf={shelf.type}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-neutral-900">{tt(BAY_ASSET_TYPE_LABELS[shelf.type])}</h2>
            <button type="button" data-bay-ready-see-all={shelf.type} className={COLLECTION_ACTION_BTN_GHOST} onClick={() => chooseType(shelf.type)}>{tt("查看全部")}</button>
          </div>
          <Items data-bay-asset-grid>{shelf.items.slice(0, PREVIEW_PER_ROW).map((asset) => <BayAssetCard key={asset.id} asset={asset} onOpen={openAsset} view={view} />)}</Items>
        </section>)}
      </div> : <section data-bay-ready-grid={type}>
        <h2 className="mb-3 text-[15px] font-semibold text-neutral-900">{tt(BAY_ASSET_TYPE_LABELS[type])}</h2>
        <Items data-bay-asset-grid>{shown.map((asset) => <BayAssetCard key={asset.id} asset={asset} onOpen={openAsset} view={view} />)}</Items>
        {limit < gridItems.length ? <div className="mt-5 text-center">
          <button type="button" className={COLLECTION_ACTION_BTN_GHOST} onClick={() => setLimit((value) => value + BAY_TEMPLATE_PAGE_SIZE)}>{tt("加载更多")}</button>
          <CollectionInfiniteSentinel active={!route.target} loading={false} onLoadMore={() => setLimit((value) => value + BAY_TEMPLATE_PAGE_SIZE)} />
        </div> : null}
      </section>}
      {loading ? <div role="status" data-bay-asset-loading aria-label={tt("正在加载…")} className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="aspect-video animate-pulse rounded-xl bg-neutral-100" />)}
      </div> : !error && (type ? gridItems.length === 0 : shelves.length === 0) ? <p data-bay-asset-empty className="py-12 text-center text-[13px] text-neutral-500">{tt("这里还没有这个分类的素材。")}</p> : null}
    </div>
    {!detailInPage ? <BayArtifactDeepLink target={route.target} onBack={route.close} accent={accent} siteKey={siteKey} onEdit={onEdit} onUseInTask={onUseInTask} /> : null}
    {licensesOpen && onCloseLicenses ? <BayLicensesView onClose={onCloseLicenses} /> : null}
  </div>;
}
