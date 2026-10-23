"use client";

// LeoBay：各站 `/bay` 这一张页。页头标题 + 「我的」「发布」，下面按服务 / 素材 / 作品 / 课程 / 需求五栏逛。
// LeoChat 不在这张页上：和卖家说话时打开的是左下角那个小窗。
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  COLLECTION_ACTION_BTN_GHOST,
  COLLECTION_ACTION_BTN_PRIMARY,
  CollectionFilterRow,
  CollectionSearchField,
  CollectionViewOptions,
  CollectionViewToggle,
  type CollectionView,
  type CollectionViewOption,
} from "../../collection-chrome";
import { APP_PAGE_FRAME_CLASS, APP_PAGE_HEADER_ROW_CLASS, APP_PAGE_TITLE_CLASS } from "../../AppPageHeader";
import type { ExplorePageProps } from "../../ExplorePage";
import { BayAppShelf } from "../apps/BayAppShelf";
import { BayAssetLibrary } from "../asset/BayAssetLibrary";
import { BAY_FORM_PAPER_CLASS } from "../form/form-ui";
import { BayLessonShelf } from "../lessons/BayLessonShelf";
import { LibraryWorkPickerHost } from "../needs/LibraryWorkPicker";
import { BayAuthHost } from "./bay-auth-host";
import { BayGlyph } from "./bay-icons";
import { canonicalBayFeedKind, formatBayParam } from "./bay-links";
import {
  bayBack,
  bayEnabledHere,
  registerBayPage,
  setBaySiteKey,
  useBayFilter,
  useBaySiteKey,
  useBayState,
  type BayFeedFilter,
  type BayTarget,
} from "./bay-state";
import { BayDetailPane, bayDetailTitleKey } from "./BayDetail";
import { BayToolbarFilterSlot, BayToolbarSlotProvider } from "./BayFilterSelect";
import {
  BayCategorySelect,
  BayFeed,
  BayListingChromeContext,
  BayViewSwitch,
  openMine,
  startPublish,
  useBaySearchText,
} from "./BayList";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** 素材货架的可选接线（各站原来传给探索页的那几项：点开、插入、拖拽）。 */
export type LeoBayMaterialProps = Pick<
  ExplorePageProps,
  "appId" | "onOpenItem" | "materialActions" | "onMaterialAction" | "materialActionEvidence" | "onMaterialDragStart" | "onMaterialDragEnd"
>;

export interface LeoBayPageProps {
  siteKey: string;
  /** 站点主色：货架卡仍可读。筛选行不用它。不传用天蓝。 */
  accent?: string;
  /** 素材货架的可选接线。 */
  materials?: LeoBayMaterialProps;
}

type Availability = "pending" | "on" | "off";

function subscribeNever(): () => void {
  return () => {};
}

function useAvailability(): Availability {
  return useSyncExternalStore(subscribeNever, (): Availability => (bayEnabledHere() ? "on" : "off"), (): Availability => "pending");
}

const FRAME_CLASS = `${APP_PAGE_FRAME_CLASS} h-[calc(100dvh-1px)]`;
/** 有白板的详情：左右露出页底渐变，上下贴齐，不再垫 pt-3 / pb-5。页框、滚动区、返回行都不铺白，圆角白板才看得见。 */
const PAPER_FRAME_CLASS = "mx-auto flex h-[calc(100dvh-1px)] min-h-0 w-full max-w-6xl flex-col px-4";
const PAPER_HEADER_CLASS = "sticky top-0 z-0 flex min-h-14 shrink-0 items-center justify-between gap-3";
const BTN_GHOST = COLLECTION_ACTION_BTN_GHOST;
/** 详情页「返回」：无描边，左缘不留键内边距，贴着页框左边。 */
const BTN_BACK =
  "inline-flex shrink-0 items-center justify-center gap-1 rounded-full py-2 pr-4 text-[13px] font-medium text-neutral-900";
const BTN_PRIMARY = COLLECTION_ACTION_BTN_PRIMARY;

/** 页头：左 LeoBay；右侧 = 搜索 + 查看选项 + 网格/列表 + 我的/发布。 */
function Hero({
  filter,
  search,
  view,
  onViewChange,
  favoritesOnly,
  onFavoritesOnly,
}: {
  filter: BayFeedFilter;
  search: { text: string; change: (value: string) => void; commit: (value: string) => void };
  view: CollectionView;
  onViewChange: (view: CollectionView) => void;
  favoritesOnly: boolean;
  onFavoritesOnly: (value: boolean) => void;
}) {
  const tt = useUI();
  const viewOptions: CollectionViewOption[] = [
    {
      id: "favorites",
      label: "仅看收藏",
      checked: favoritesOnly,
      onSelect: () => onFavoritesOnly(!favoritesOnly),
    },
  ];
  return (
    <section data-bay-page-hero className="shrink-0">
      <header className={APP_PAGE_HEADER_ROW_CLASS} data-collection-toolbar="">
        <h1 className={APP_PAGE_TITLE_CLASS}>LeoBay</h1>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <div data-bay-page-search>
            <CollectionSearchField
              value={search.text}
              onChange={search.change}
              onCommit={search.commit}
              placeholder={tt("搜素材、服务、作品、课程、需求…")}
            />
          </div>
          <CollectionViewOptions options={viewOptions} />
          <CollectionViewToggle view={view} onChange={onViewChange} />
          <div className="flex shrink-0 items-center gap-2" data-bay-page-actions>
            <button type="button" onClick={openMine} data-bay-action="mine" className={BTN_GHOST}>
              {tt("我的")}
            </button>
            <button
              type="button"
              onClick={() => startPublish(filter.category, filter.kind)}
              data-bay-action="publish"
              className={BTN_PRIMARY}
            >
              {tt("发布")}
            </button>
          </div>
        </div>
      </header>
    </section>
  );
}

/**
 * 逛 LeoBay：页头（搜索 / 查看选项 / 网格列表）、第二行是出售/求购、种类、站点/素材筛选。
 * 看详情时这一整块只是藏起来（`visible` 为 false）；回来时把信息流滚回离开时的位置。
 * 工具条和素材库包在同一个 `BayToolbarSlotProvider` 里，素材筛选才能送到那一行。
 */
function Browse({ filter, accent, visible, siteKey }: { filter: BayFeedFilter; accent: string; visible: boolean; siteKey: string }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const savedTop = useRef(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const kind = canonicalBayFeedKind(filter.kind);
  const asset = kind === "asset";
  const app = kind === "app";
  const lesson = kind === "lesson";
  const [assetVisited, setAssetVisited] = useState(asset);
  const [view, setView] = useState<CollectionView>("grid");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteKeys, setFavoriteKeys] = useState<ReadonlySet<string> | null>(null);
  const search = useBaySearchText(filter);
  const listingChrome = useMemo(() => ({ view, favoritesOnly }), [favoritesOnly, view]);

  useEffect(() => {
    if (asset) setAssetVisited(true);
  }, [asset]);

  useEffect(() => {
    if (!favoritesOnly) {
      setFavoriteKeys(null);
      return;
    }
    let cancelled = false;
    void import("../../../lib/bay/favorites").then(({ listBayFavorites }) =>
      listBayFavorites().then((data) => {
        if (cancelled) return;
        setFavoriteKeys(new Set((data?.items || []).map((item) => `${item.target_kind}:${item.target_ref}`)));
      }),
    ).catch(() => {
      if (!cancelled) setFavoriteKeys(new Set());
    });
    return () => {
      cancelled = true;
    };
  }, [favoritesOnly]);

  useIsoLayoutEffect(() => {
    if (visible && scrollRef.current) scrollRef.current.scrollTop = savedTop.current;
  }, [visible]);

  return (
    <BayToolbarSlotProvider>
      <BayListingChromeContext.Provider value={listingChrome}>
        <div
          ref={scrollRef}
          onScroll={(event) => {
            if (visibleRef.current) savedTop.current = event.currentTarget.scrollTop;
          }}
          className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-4"
          data-bay-page-feed
          data-bay-listing-view={view}
        >
          <Hero
            filter={filter}
            search={search}
            view={view}
            onViewChange={setView}
            favoritesOnly={favoritesOnly}
            onFavoritesOnly={setFavoritesOnly}
          />
          <CollectionFilterRow data-bay-page-toolbar="" data-bay-page-filters="">
            <BayViewSwitch filter={filter} />
            {asset ? <BayToolbarFilterSlot /> : <BayCategorySelect filter={filter} />}
          </CollectionFilterRow>
          {assetVisited ? (
            <div className={asset ? "flex min-h-[32rem] flex-1 flex-col" : "hidden"} data-bay-page-materials>
              <BayAssetLibrary filter={filter} siteKey={siteKey} accent={accent} view={view} />
            </div>
          ) : null}
          {asset ? null : app ? (
            <div className="mt-5">
              <BayAppShelf filter={filter} siteKey={siteKey} accent={accent} view={view} />
            </div>
          ) : lesson ? (
            <div className="mt-5">
              <BayLessonShelf filter={filter} siteKey={siteKey} accent={accent} view={view} />
            </div>
          ) : (
            <div className="mt-5">
              <BayFeed
                filter={filter}
                activeKey={null}
                variant={view}
                favoritesOnly={favoritesOnly}
                favoriteKeys={favoriteKeys}
                onClearFavorites={() => setFavoritesOnly(false)}
              />
            </div>
          )}
        </div>
      </BayListingChromeContext.Provider>
    </BayToolbarSlotProvider>
  );
}

/** 这几种详情铺满页框宽度；其余收在易读的宽度里。 */
const WIDE_DETAILS: ReadonlySet<BayTarget["kind"]> = new Set<BayTarget["kind"]>([
  "service",
  "checkout",
  "profile",
  "mine",
  "service-editor",
  "publish",
  "app",
  "app-editor",
  "lesson",
  "bundle",
  "lesson-editor",
  "bundle-editor",
  "dashboard",
]);

/** 填写页：页标题行和表单排在同一列里，左边缘对齐。发布、编辑类自己排这一列；发需求、报价由这里给。 */
const FORM_DETAILS: ReadonlySet<BayTarget["kind"]> = new Set<BayTarget["kind"]>([
  "publish",
  "service-editor",
  "app-editor",
  "lesson-editor",
  "bundle-editor",
  "post-need",
  "call-human",
  "propose",
]);

/** 发帖、编辑、我的、数据面板：正文垫白底圆角板。返回和标题留在板外，坐在页底渐变上，和逛 Bay 同一块底。 */
const PAPER_DETAILS: ReadonlySet<BayTarget["kind"]> = new Set<BayTarget["kind"]>([
  "publish",
  "post-need",
  "mine",
  "dashboard",
  "service-editor",
  "app-editor",
  "lesson-editor",
  "bundle-editor",
]);

/** 点开的那一条：一行「返回 + 标题」。发帖白底板跟页一起滚，板上不出滚动条；下滑后白板盖住返回和标题。 */
function Detail({ target, siteKey }: { target: Exclude<BayTarget, { kind: "feed" }>; siteKey: string }) {
  const tt = useUI();
  const title = bayDetailTitleKey(target);
  const form = FORM_DETAILS.has(target.kind);
  const paper = PAPER_DETAILS.has(target.kind);
  // 发需求、报价的窗格自己带 px-4（need-ui 的 PaneBody），这里只给居中的那一列。
  const width = WIDE_DETAILS.has(target.kind) ? "" : form ? "" : "max-w-3xl";
  const pane = (
    <div
      className={paper ? `w-full ${width}` : `flex min-h-0 w-full flex-1 flex-col overflow-hidden ${width}`}
      data-bay-page-detail={target.kind}
    >
      <div key={formatBayParam(target)} className={paper ? undefined : "flex min-h-0 flex-1 flex-col overflow-y-auto"}>
        <BayDetailPane target={target} layout="page" siteKey={siteKey} />
      </div>
    </div>
  );
  const header = (
    <header className={paper ? PAPER_HEADER_CLASS : APP_PAGE_HEADER_ROW_CLASS} data-bay-page-detail-header>
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={bayBack} data-bay-page-back className={BTN_BACK}>
          <BayGlyph name="back" className="h-4 w-4" />
          {tt("返回")}
        </button>
        <h2 className={`min-w-0 truncate ${APP_PAGE_TITLE_CLASS}`}>{title ? tt(title) : null}</h2>
      </div>
    </header>
  );
  if (paper) {
    return (
      <div className="relative min-h-0 flex-1 overflow-y-auto" data-bay-page-scroll="">
        <div className="flex min-h-full flex-col">
          {header}
          <div className={BAY_FORM_PAPER_CLASS} data-bay-page-paper={target.kind}>
            {pane}
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      {header}
      {pane}
    </>
  );
}

export function LeoBayPage({ siteKey, accent = "#0ea5e9" }: LeoBayPageProps): ReactElement {
  const availability = useAvailability();
  const filter = useBayFilter();
  const { current } = useBayState();
  const storeSiteKey = useBaySiteKey();
  const browsing = current.kind === "feed";
  const paperPage = current.kind !== "feed" && PAPER_DETAILS.has(current.kind);

  useEffect(() => {
    setBaySiteKey(siteKey);
  }, [siteKey]);

  // 挂载：登记 /bay 页在场，接管 `?bay=`（详情）与 `?kind=`（种类）。
  useEffect(() => (availability === "on" ? registerBayPage() : undefined), [availability]);

  if (availability === "pending") {
    return <div className={FRAME_CLASS} data-bay-page="pending" />;
  }
  // 境内没有交易市场（发布、找人帮忙、主页都不开），但素材照旧能逛：这张页只剩素材库。
  if (availability === "off") {
    return (
      <div className={FRAME_CLASS} data-bay-page="materials-only">
        <BayAssetLibrary filter={filter} siteKey={storeSiteKey || siteKey} accent={accent} />
      </div>
    );
  }

  return (
    <div className={paperPage ? PAPER_FRAME_CLASS : FRAME_CLASS} data-bay-page={browsing ? "browse" : "detail"}>
      <div className={browsing ? "flex min-h-0 flex-1 flex-col" : "hidden"} data-bay-page-browse>
        <Browse filter={filter} accent={accent} visible={browsing} siteKey={storeSiteKey || siteKey} />
      </div>
      {current.kind === "feed" ? null : <Detail target={current} siteKey={storeSiteKey || siteKey} />}
      <LibraryWorkPickerHost />
      <BayAuthHost />
    </div>
  );
}
