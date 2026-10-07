"use client";

// 各站 `/bay` 页：和其它列表页同一套标准版式——页框、17px 标题行、分段标签、类目、卡片网格。
// 逛的时候信息流占满整页宽；点开一条，整页换成它的详情，页头那一行变成「返回 + 标题」
// （与 Playground、工作台点开条目的写法相同），回来时信息流还停在原来的位置。
// 每个操作只出现一次：我的 / 发布服务 / 发需求在标题行右边；叫真人在侧栏，这页不再放一个。
// 读写 `?bay=`，浏览器的前进后退跟着走。境内显示暂未开放。
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { APP_PAGE_FRAME_CLASS, APP_PAGE_HEADER_ROW_CLASS, APP_PAGE_TITLE_CLASS, AppPageHeader } from "../../AppPageHeader";
import { LibraryToolbar } from "../../LibraryLayout";
import { DealConversationView } from "../deal";
import { LibraryWorkPickerHost } from "../needs";
import { BayAuthHost } from "./bay-auth-host";
import { BayGlyph } from "./bay-icons";
import { formatBayParam } from "./bay-links";
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
import {
  BayCategoryChips,
  BayCategoryToggle,
  BayFeed,
  BayKindTabs,
  openMine,
  startPostNeed,
  startServiceEditor,
  useBaySearchText,
} from "./BayList";

export interface BayPageProps {
  siteKey: string;
  /** 站点主色：选中的类目用它填色。不传用黑色。 */
  accent?: string;
}

type Availability = "pending" | "on" | "off";

function subscribeNever(): () => void {
  return () => {};
}

function useAvailability(): Availability {
  return useSyncExternalStore(subscribeNever, (): Availability => (bayEnabledHere() ? "on" : "off"), (): Availability => "pending");
}

const FRAME_CLASS = `${APP_PAGE_FRAME_CLASS} h-[calc(100dvh-1px)]`;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const PRIMARY_BUTTON =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-transparent bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800 active:scale-[0.98]";
const SECONDARY_BUTTON =
  "shrink-0 items-center rounded-lg border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 active:scale-[0.98]";

/** 标题行右边的三个操作。手机上「发布服务」让位，改在空列表下面出现（见 Browse）。 */
function PageActions({ filter }: { filter: BayFeedFilter }) {
  const tt = useUI();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" data-bay-page-actions>
      <button type="button" onClick={openMine} data-bay-action="mine" className={`inline-flex ${SECONDARY_BUTTON}`}>
        {tt("我的")}
      </button>
      <button type="button" onClick={startServiceEditor} data-bay-action="publish-service" className={`hidden sm:inline-flex ${SECONDARY_BUTTON}`}>
        {tt("发布服务")}
      </button>
      <button type="button" onClick={() => startPostNeed(filter.category)} data-bay-action="post-need" className={PRIMARY_BUTTON}>
        <BayGlyph name="plus" className="h-4 w-4" />
        {tt("发需求")}
      </button>
    </div>
  );
}

/** 搜索框：外形用列表页共用的那一个（LibraryToolbar），打字停手后才去筛。 */
function PageSearch({ filter }: { filter: BayFeedFilter }) {
  const tt = useUI();
  const search = useBaySearchText(filter);
  return (
    <LibraryToolbar
      search={search.text}
      setSearch={(value) => search.change(typeof value === "function" ? value(search.text) : value)}
      view="grid"
      setView={() => {}}
      placeholder={tt("搜索 Bay")}
      tt={tt}
      hideView
    />
  );
}

/**
 * 逛 Bay：标题行、种类 + 搜索、类目、卡片网格。
 * 看详情时这一整块只是藏起来（`visible` 为 false）；回来时把信息流滚回离开时的位置。
 */
function Browse({ filter, accent, visible }: { filter: BayFeedFilter; accent?: string; visible: boolean }) {
  const tt = useUI();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const savedTop = useRef(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useIsoLayoutEffect(() => {
    if (visible && scrollRef.current) scrollRef.current.scrollTop = savedTop.current;
  }, [visible]);

  return (
    <>
      <AppPageHeader title="OceanLeo Bay">
        <PageActions filter={filter} />
      </AppPageHeader>
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2" data-bay-page-filters>
        <BayKindTabs filter={filter} variant="page" />
        <div className="flex w-full items-center gap-2 sm:w-64">
          <BayCategoryToggle filter={filter} open={categoriesOpen} onToggle={() => setCategoriesOpen((value) => !value)} variant="page" />
          <div className="min-w-0 flex-1">
            <PageSearch filter={filter} />
          </div>
        </div>
      </div>
      {categoriesOpen ? (
        <div className="mb-3 shrink-0 sm:hidden" data-bay-category-panel>
          <BayCategoryChips filter={filter} accent={accent} onPicked={() => setCategoriesOpen(false)} />
        </div>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={(event) => {
          if (visibleRef.current) savedTop.current = event.currentTarget.scrollTop;
        }}
        className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        data-bay-page-feed
      >
        <div className="mb-4 hidden sm:block">
          <BayCategoryChips filter={filter} accent={accent} />
        </div>
        <BayFeed
          filter={filter}
          activeKey={null}
          variant="grid"
          emptyAction={
            <button type="button" onClick={startServiceEditor} data-bay-action="publish-service" className={`inline-flex sm:hidden ${SECONDARY_BUTTON}`}>
              {tt("发布服务")}
            </button>
          }
        />
      </div>
    </>
  );
}

/** 这几种详情在宽屏上是左右两栏（正文 + 右侧摘要），用满页框宽度；其余是单栏，收在易读的宽度里。 */
const TWO_COLUMN_DETAILS: ReadonlySet<BayTarget["kind"]> = new Set<BayTarget["kind"]>(["service", "checkout", "conversation"]);

/** 返回键：外形与 Playground、工作台点开条目后的返回键相同。 */
function BackButton({ onClick }: { onClick: () => void }) {
  const tt = useUI();
  return (
    <button
      type="button"
      onClick={onClick}
      data-bay-page-back
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-stone-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-50 active:scale-95"
    >
      <BayGlyph name="back" className="h-4 w-4" />
      {tt("返回")}
    </button>
  );
}

/** 点开的那一条：页头是「返回 + 标题」，正文在一张卡里（卡内滚动，底部的操作条贴在卡的底边）。 */
function Detail({ target, siteKey }: { target: Exclude<BayTarget, { kind: "feed" }>; siteKey: string }) {
  const tt = useUI();
  const title = bayDetailTitleKey(target);
  const conversation = target.kind === "conversation";
  const width = TWO_COLUMN_DETAILS.has(target.kind) ? "" : "max-w-3xl";
  let body: ReactNode;
  if (conversation) {
    body = (
      <div key={target.threadId} className="flex min-h-0 flex-1 flex-col">
        <DealConversationView threadId={target.threadId} layout="page" />
      </div>
    );
  } else {
    body = (
      <div key={formatBayParam(target)} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <BayDetailPane target={target} layout="page" siteKey={siteKey} />
      </div>
    );
  }
  return (
    <>
      <header className={APP_PAGE_HEADER_ROW_CLASS} data-bay-page-detail-header>
        <div className="flex min-w-0 items-center gap-3">
          <BackButton onClick={bayBack} />
          <h1 className={`min-w-0 truncate ${APP_PAGE_TITLE_CLASS}`}>{title ? tt(title) : null}</h1>
        </div>
      </header>
      <div
        className={`flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm ${width} ${
          conversation ? "flex-1" : ""
        }`}
        data-bay-page-detail={target.kind}
      >
        {body}
      </div>
    </>
  );
}

/**
 * 页面本体（已确认本站开放 Bay 之后才渲染）：逛 Bay，或者点开的那一条。
 * 单独成一个组件，是为了不依赖浏览器环境也能把两种状态渲染出来检查版式。
 */
export function BayPageBody({ accent }: { accent?: string }) {
  const filter = useBayFilter();
  const { current } = useBayState();
  const siteKey = useBaySiteKey();
  const browsing = current.kind === "feed";
  return (
    <div className={FRAME_CLASS} data-bay-page={browsing ? "browse" : "detail"}>
      {/* 看详情时信息流只是藏起来，不卸载：返回时滚动位置和已经加载的内容都还在。 */}
      <div className={browsing ? "flex min-h-0 flex-1 flex-col" : "hidden"} data-bay-page-browse>
        <Browse filter={filter} accent={accent} visible={browsing} />
      </div>
      {current.kind === "feed" ? null : <Detail target={current} siteKey={siteKey} />}
      <LibraryWorkPickerHost />
      <BayAuthHost />
    </div>
  );
}

export function BayPage({ siteKey, accent }: BayPageProps) {
  const tt = useUI();
  const availability = useAvailability();

  useEffect(() => {
    setBaySiteKey(siteKey);
  }, [siteKey]);

  useEffect(() => (availability === "on" ? registerBayPage() : undefined), [availability]);

  if (availability !== "on") {
    return (
      <div className={FRAME_CLASS} data-bay-page={availability === "off" ? "unavailable" : "pending"}>
        <AppPageHeader title="OceanLeo Bay" />
        {availability === "off" ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-[13px] text-neutral-500">{tt("此功能暂未在本站开放")}</p>
          </div>
        ) : null}
      </div>
    );
  }
  return <BayPageBody accent={accent} />;
}
