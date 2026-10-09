"use client";

// LeoBay：各站 `/bay` 这一张页。页头标题 + 「我的」「发布」，下面按类目逛素材与服务或需求。
// 官方素材货架没有页面入口，只有地址带 `?kind=material` 时才显示，顶上有「返回 LeoBay」。
// LeoChat 不在这张页上：和卖家说话时打开的是左下角那个小窗。
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { APP_PAGE_FRAME_CLASS, APP_PAGE_HEADER_ROW_CLASS, APP_PAGE_TITLE_CLASS } from "../../AppPageHeader";
import { ExplorePage, type ExplorePageProps } from "../../ExplorePage";
import { LibraryWorkPickerHost } from "../needs/LibraryWorkPicker";
import { BayAuthHost } from "./bay-auth-host";
import { BayGlyph } from "./bay-icons";
import { formatBayParam } from "./bay-links";
import {
  bayBack,
  bayEnabledHere,
  registerBayPage,
  setBayFilter,
  setBaySiteKey,
  useBayFilter,
  useBaySiteKey,
  useBayState,
  type BayFeedFilter,
  type BayTarget,
} from "./bay-state";
import { BayDetailPane, bayDetailTitleKey } from "./BayDetail";
import { BayCategoryChips, BayFeed, BayViewSwitch, openMine, startPublish, useBaySearchText } from "./BayList";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** 素材货架的可选接线（各站原来传给探索页的那几项：点开、插入、拖拽）。 */
export type LeoBayMaterialProps = Pick<
  ExplorePageProps,
  "appId" | "onOpenItem" | "materialActions" | "onMaterialAction" | "materialActionEvidence" | "onMaterialDragStart" | "onMaterialDragEnd"
>;

export interface LeoBayPageProps {
  siteKey: string;
  /** 站点主色：页头、选中的切换与类目用它。不传用天蓝。 */
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
const BTN =
  "inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";
const BTN_GHOST = `${BTN} text-stone-600 hover:bg-stone-100 hover:text-stone-900`;
const BTN_PRIMARY = `${BTN} bg-stone-900 text-white hover:bg-stone-800`;

/** 页头：标题、两个按键、搜索。素材深链不画搜索。 */
function Hero({ filter }: { filter: BayFeedFilter }) {
  const tt = useUI();
  const search = useBaySearchText(filter);
  const material = filter.kind === "material";
  return (
    <section data-bay-page-hero className="shrink-0">
      <header className={APP_PAGE_HEADER_ROW_CLASS}>
        <h1 className={APP_PAGE_TITLE_CLASS}>LeoBay</h1>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2" data-bay-page-actions>
          <button type="button" onClick={openMine} data-bay-action="mine" className={BTN_GHOST}>
            {tt("我的")}
          </button>
          <button type="button" onClick={() => startPublish(filter.category)} data-bay-action="publish" className={BTN_PRIMARY}>
            {tt("发布")}
          </button>
        </div>
      </header>
      {material ? null : (
        <label className="mb-1 flex w-full max-w-md items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-stone-900" data-bay-page-search>
          <BayGlyph name="search" className="h-3.5 w-3.5 shrink-0 text-stone-400" />
          <input
            type="search"
            value={search.text}
            maxLength={60}
            placeholder={tt("搜素材、服务、需求…")}
            aria-label={tt("搜索")}
            onChange={(event) => search.change(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) search.commit(event.currentTarget.value);
            }}
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-stone-300"
          />
        </label>
      )}
    </section>
  );
}

/**
 * 逛 LeoBay：页头、供给/需求、类目、卡片网格；素材货架只走深链。
 * 看详情时这一整块只是藏起来（`visible` 为 false）；回来时把信息流滚回离开时的位置。
 */
function Browse({ filter, accent, visible, siteKey, materials }: { filter: BayFeedFilter; accent: string; visible: boolean; siteKey: string; materials?: LeoBayMaterialProps }) {
  const tt = useUI();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const savedTop = useRef(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const material = filter.kind === "material";
  const [materialVisited, setMaterialVisited] = useState(material);

  useEffect(() => {
    if (material) setMaterialVisited(true);
  }, [material]);

  useIsoLayoutEffect(() => {
    if (visible && scrollRef.current) scrollRef.current.scrollTop = savedTop.current;
  }, [visible]);

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        if (visibleRef.current) savedTop.current = event.currentTarget.scrollTop;
      }}
      className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-4"
      data-bay-page-feed
    >
      <Hero filter={filter} />
      {material ? (
        <div className="mt-3 shrink-0">
          <button type="button" data-bay-materials-back onClick={() => setBayFilter({ kind: "supply" })} className={BTN_GHOST}>
            {tt("返回 LeoBay")}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 shrink-0" data-bay-page-filters>
            <BayViewSwitch filter={filter} accent={accent} />
          </div>
          <div className="mt-4 shrink-0">
            <BayCategoryChips filter={filter} accent={accent} />
          </div>
        </>
      )}
      {/* 素材货架第一次打开后只藏不卸：切去别的种类再回来，筛选和滚动位置都还在。 */}
      {materialVisited ? (
        <div className={material ? "mt-4 flex min-h-[32rem] flex-1 flex-col" : "hidden"} data-bay-page-materials>
          <ExplorePage siteKey={siteKey} accent={accent} embedded {...materials} />
        </div>
      ) : null}
      {material ? null : (
        <div className="mt-5">
          <BayFeed
            filter={filter}
            activeKey={null}
            variant="grid"
            emptyAction={
              <button
                type="button"
                onClick={() => startPublish(filter.category)}
                data-bay-action="publish"
                className={BTN_PRIMARY}
              >
                {tt("发布")}
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

/** 这几种详情铺满页框宽度；其余收在易读的宽度里。 */
const WIDE_DETAILS: ReadonlySet<BayTarget["kind"]> = new Set<BayTarget["kind"]>(["service", "checkout", "profile", "mine", "service-editor", "publish"]);

/** 点开的那一条：一行「返回 + 标题」，正文在一张卡里（卡内滚动，底部的操作条贴在卡的底边）。 */
function Detail({ target, siteKey }: { target: Exclude<BayTarget, { kind: "feed" }>; siteKey: string }) {
  const tt = useUI();
  const title = bayDetailTitleKey(target);
  const width = WIDE_DETAILS.has(target.kind) ? "" : "max-w-3xl";
  return (
    <>
      <header className={APP_PAGE_HEADER_ROW_CLASS} data-bay-page-detail-header>
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={bayBack}
            data-bay-page-back
            className={`${BTN_GHOST} gap-1`}
          >
            <BayGlyph name="back" className="h-4 w-4" />
            {tt("返回")}
          </button>
          <h2 className={`min-w-0 truncate ${APP_PAGE_TITLE_CLASS}`}>{title ? tt(title) : null}</h2>
        </div>
      </header>
      <div
        className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white ${width}`}
        data-bay-page-detail={target.kind}
      >
        <div key={formatBayParam(target)} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <BayDetailPane target={target} layout="page" siteKey={siteKey} />
        </div>
      </div>
    </>
  );
}

export function LeoBayPage({ siteKey, accent = "#0ea5e9", materials }: LeoBayPageProps): ReactElement {
  const availability = useAvailability();
  const filter = useBayFilter();
  const { current } = useBayState();
  const storeSiteKey = useBaySiteKey();
  const browsing = current.kind === "feed";

  useEffect(() => {
    setBaySiteKey(siteKey);
  }, [siteKey]);

  // 挂载：登记 /bay 页在场，接管 `?bay=`（详情）与 `?kind=`（种类）。
  useEffect(() => (availability === "on" ? registerBayPage() : undefined), [availability]);

  if (availability === "pending") {
    return <div className={FRAME_CLASS} data-bay-page="pending" />;
  }
  // 境内没有交易市场（发布、找人帮忙、主页都不开），但素材照旧能逛：这张页只剩素材货架。
  if (availability === "off") {
    return (
      <div className={FRAME_CLASS} data-bay-page="materials-only">
        <ExplorePage siteKey={siteKey} accent={accent} embedded {...materials} />
      </div>
    );
  }

  return (
    <div className={FRAME_CLASS} data-bay-page={browsing ? "browse" : "detail"}>
      <div className={browsing ? "flex min-h-0 flex-1 flex-col" : "hidden"} data-bay-page-browse>
        <Browse filter={filter} accent={accent} visible={browsing} siteKey={storeSiteKey || siteKey} materials={materials} />
      </div>
      {current.kind === "feed" ? null : <Detail target={current} siteKey={storeSiteKey || siteKey} />}
      <LibraryWorkPickerHost />
      <BayAuthHost />
    </div>
  );
}
