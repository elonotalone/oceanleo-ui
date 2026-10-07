"use client";

// LeoBay：各站 `/bay` 这一张页。逛的时候是一块彩色页头（搜索、发布、找人帮忙、我的主页）+ 种类 + 卡片网格；
// 「素材」这一栏是官方账号发布的免费素材货架（原来的「探索」页并到这里）；点开一条，换成「返回 + 标题 + 详情」。
// LeoChat 不在这张页上：和卖家说话时打开的是左下角那个小窗。
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getBayOfficialPublisher, type BayOfficialPublisher } from "../../../lib/bay/official";
import { APP_PAGE_FRAME_CLASS, APP_PAGE_HEADER_ROW_CLASS, APP_PAGE_TITLE_CLASS } from "../../AppPageHeader";
import { ExplorePage, type ExplorePageProps } from "../../ExplorePage";
import { LibraryWorkPickerHost } from "../needs/LibraryWorkPicker";
import { BayAuthHost } from "./bay-auth-host";
import { BayGlyph, BayIcon } from "./bay-icons";
import { formatBayParam } from "./bay-links";
import {
  bayBack,
  bayEnabledHere,
  openBay,
  registerBayPage,
  requireBayLogin,
  setBayFilter,
  setBaySiteKey,
  useBayFilter,
  useBaySiteKey,
  useBayState,
  type BayFeedFilter,
  type BayTarget,
} from "./bay-state";
import { BayDetailPane, bayDetailTitleKey } from "./BayDetail";
import { BayCategoryChips, BayFeed, BayKindTabs, openMine, startPostNeed, startServiceEditor, useBaySearchText } from "./BayList";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const MOTION = "transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

/** 素材货架的可选接线（各站原来传给探索页的那几项：点开、插入、拖拽）。 */
export type LeoBayMaterialProps = Pick<
  ExplorePageProps,
  "appId" | "onOpenItem" | "materialActions" | "onMaterialAction" | "materialActionEvidence" | "onMaterialDragStart" | "onMaterialDragEnd"
>;

export interface LeoBayPageProps {
  siteKey: string;
  /** 站点主色：页头、选中的种类与类目用它。不传用天蓝。 */
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

function heroBackground(accent: string): string {
  return [
    "radial-gradient(90% 140% at 100% 0%, rgba(236, 72, 153, 0.55) 0%, transparent 55%)",
    "radial-gradient(70% 120% at 55% 120%, rgba(250, 204, 21, 0.35) 0%, transparent 60%)",
    `linear-gradient(120deg, ${accent} 0%, #6366f1 60%, #7c3aed 100%)`,
  ].join(", ");
}

function openMyPage(): void {
  if (!requireBayLogin()) return;
  openBay({ kind: "profile", handle: "me" });
}

/** 页头：一块彩色横幅。标题、一句话、搜索框，右边是发布 / 找人帮忙 / 我的主页 / 我的。 */
function Hero({ filter, accent }: { filter: BayFeedFilter; accent: string }) {
  const tt = useUI();
  const search = useBaySearchText(filter);
  const material = filter.kind === "material";
  return (
    <section
      data-bay-page-hero
      className="relative shrink-0 overflow-hidden rounded-[2rem] px-6 py-7 text-white shadow-lg sm:px-10 sm:py-9"
      style={{ backgroundImage: heroBackground(accent) }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 max-w-2xl">
          <h1 className="flex items-center gap-2.5 text-[30px] font-extrabold leading-none tracking-tight sm:text-[38px]">
            <BayIcon className="h-8 w-8 sm:h-9 sm:w-9" strokeWidth={2.2} />
            LeoBay
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/90 sm:text-[16px]">
            {tt("免费素材拿去就用；想做的事找人来做；你会做的，摆出来卖。")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-bay-page-actions>
          <button type="button" onClick={openMyPage} data-bay-action="my-page" className={`rounded-full bg-white/15 px-4 py-2.5 text-[13px] font-semibold text-white backdrop-blur ${MOTION} hover:bg-white/25`}>
            {tt("我的主页")}
          </button>
          <button type="button" onClick={openMine} data-bay-action="mine" className={`rounded-full bg-white/15 px-4 py-2.5 text-[13px] font-semibold text-white backdrop-blur ${MOTION} hover:bg-white/25`}>
            {tt("我的")}
          </button>
          <button
            type="button"
            onClick={() => startPostNeed(filter.category)}
            data-bay-action="get-help"
            className={`rounded-full bg-white/15 px-4 py-2.5 text-[13px] font-semibold text-white backdrop-blur ${MOTION} hover:bg-white/25`}
          >
            {tt("找人帮忙")}
          </button>
          <button
            type="button"
            onClick={startServiceEditor}
            data-bay-action="publish"
            className={`inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-neutral-900 shadow-md ${MOTION} hover:bg-neutral-100 active:scale-[0.98]`}
          >
            <BayGlyph name="plus" className="h-4 w-4" />
            {tt("发布")}
          </button>
        </div>
      </div>
      {material ? null : (
        <label className="mt-6 flex w-full max-w-2xl items-center gap-3 rounded-full bg-white px-5 py-3 text-neutral-900 shadow-md" data-bay-page-search>
          <BayGlyph name="search" className="h-5 w-5 shrink-0 text-neutral-400" />
          <input
            type="search"
            value={search.text}
            maxLength={60}
            placeholder={tt("搜商品、服务、需求…")}
            aria-label={tt("搜索")}
            onChange={(event) => search.change(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) search.commit(event.currentTarget.value);
            }}
            className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-1 py-0.5 text-[15px] outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-300"
          />
        </label>
      )}
    </section>
  );
}

/** 「全部」栏顶上的一条：把人带去素材栏。 */
function MaterialsPromo({ filter }: { filter: BayFeedFilter }) {
  const tt = useUI();
  return (
    <button
      type="button"
      data-bay-materials-promo
      onClick={() => setBayFilter({ ...filter, kind: "material", category: undefined, q: undefined })}
      className={`mb-4 flex w-full flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-amber-100 via-orange-100 to-rose-100 px-6 py-5 text-left text-neutral-900 shadow-sm ring-1 ring-black/5 ${MOTION} hover:-translate-y-0.5 hover:shadow-lg`}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-[17px] font-extrabold tracking-tight">
          {tt("官方素材")}
          <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white">{tt("免费")}</span>
        </span>
        <span className="mt-1 block text-[13px] text-neutral-600">{tt("图片、模板、视频、音乐、3D……由 OceanLeo 官方发布，拿去直接用。")}</span>
      </span>
      <span className="shrink-0 rounded-full bg-white px-5 py-2.5 text-[13px] font-bold shadow-sm">{tt("去逛素材")} →</span>
    </button>
  );
}

/** 素材栏顶上的发布者说明：谁发的、多少钱、什么条款。发布者是官方账号（没建主页时用内置身份）。 */
function MaterialsPublisher() {
  const tt = useUI();
  const [publisher, setPublisher] = useState<BayOfficialPublisher | null>(null);
  useEffect(() => {
    let active = true;
    void getBayOfficialPublisher().then((value) => {
      if (active) setPublisher(value);
    });
    return () => {
      active = false;
    };
  }, []);
  const handle = publisher?.handle || "oceanleo";
  return (
    <div className="mb-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white px-4 py-3 text-[13px] text-neutral-600 shadow-sm ring-1 ring-black/5" data-bay-materials-publisher={handle}>
      <button
        type="button"
        onClick={() => openBay({ kind: "profile", handle })}
        className={`inline-flex items-center gap-2 rounded-full bg-neutral-900 px-3.5 py-2 text-[12px] font-semibold text-white ${MOTION} hover:bg-neutral-700`}
      >
        <BayIcon className="h-3.5 w-3.5" />
        {publisher?.display_name || "OceanLeo"}
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">{tt("官方")}</span>
      </button>
      <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">{tt("全部免费")}</span>
      <span className="min-w-0">{tt("数字素材：点开就能用、能改；可用于个人和商业作品，不得把原文件转手再卖。")}</span>
    </div>
  );
}

/**
 * 逛 LeoBay：页头、种类、（素材货架 | 类目 + 卡片网格）。
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
      <Hero filter={filter} accent={accent} />
      <div className="mt-5 shrink-0" data-bay-page-filters>
        <BayKindTabs filter={filter} accent={accent} />
      </div>
      {/* 素材货架第一次打开后只藏不卸：切去别的种类再回来，筛选和滚动位置都还在。 */}
      {materialVisited ? (
        <div className={material ? "mt-4 flex min-h-[32rem] flex-1 flex-col" : "hidden"} data-bay-page-materials>
          <MaterialsPublisher />
          <ExplorePage siteKey={siteKey} accent={accent} embedded {...materials} />
        </div>
      ) : null}
      {material ? null : (
        <>
          <div className="mt-4 shrink-0">
            <BayCategoryChips filter={filter} accent={accent} />
          </div>
          <div className="mt-5">
            {(filter.kind ?? "all") === "all" && !filter.q && !filter.category ? <MaterialsPromo filter={filter} /> : null}
            <BayFeed
              filter={filter}
              activeKey={null}
              variant="grid"
              emptyAction={
                <button
                  type="button"
                  onClick={startServiceEditor}
                  data-bay-action="publish"
                  className={`rounded-full bg-neutral-900 px-5 py-2.5 text-[13px] font-semibold text-white ${MOTION} hover:bg-neutral-800`}
                >
                  {tt("发布")}
                </button>
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

/** 这几种详情铺满页框宽度；其余收在易读的宽度里。 */
const WIDE_DETAILS: ReadonlySet<BayTarget["kind"]> = new Set<BayTarget["kind"]>(["service", "checkout", "profile", "mine", "service-editor"]);

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
            className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-neutral-700 shadow-sm ring-1 ring-black/5 ${MOTION} hover:bg-neutral-50 active:scale-95`}
          >
            <BayGlyph name="back" className="h-4 w-4" />
            {tt("返回")}
          </button>
          <h2 className={`min-w-0 truncate ${APP_PAGE_TITLE_CLASS}`}>{title ? tt(title) : null}</h2>
        </div>
      </header>
      <div
        className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 ${width}`}
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
  const tt = useUI();
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
