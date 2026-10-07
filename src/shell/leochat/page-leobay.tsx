"use client";

// LeoChat 整页的 LeoBay 栏：逛的时候是种类 + 搜索 + 类目 + 卡片网格；点开一条，换成「返回 + 标题 + 详情卡」。
// 不带页框、不带页标题。页头右边的「我的 / 发布服务 / 找人帮忙」由整页在停在信息流时画。
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { APP_PAGE_HEADER_ROW_CLASS, APP_PAGE_TITLE_CLASS } from "../AppPageHeader";
import { LibraryToolbar } from "../LibraryLayout";
import { DealConversationView } from "../bay/deal/DealConversationView";
import { LibraryWorkPickerHost } from "../bay/needs/LibraryWorkPicker";
import { BayAuthHost } from "../bay/shell/bay-auth-host";
import { BayGlyph } from "../bay/shell/bay-icons";
import { formatBayParam } from "../bay/shell/bay-links";
import {
  bayBack,
  useBayFilter,
  useBaySiteKey,
  useBayState,
  type BayFeedFilter,
  type BayTarget,
} from "../bay/shell/bay-state";
import { BayDetailPane, bayDetailTitleKey } from "../bay/shell/BayDetail";
import {
  BayCategoryChips,
  BayCategoryToggle,
  BayFeed,
  BayKindTabs,
  openMine,
  startPostNeed,
  startServiceEditor,
  useBaySearchText,
} from "../bay/shell/BayList";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const PRIMARY_BUTTON =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-transparent bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800 active:scale-[0.98]";
const SECONDARY_BUTTON =
  "shrink-0 items-center rounded-lg border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 active:scale-[0.98]";

/** 页头右边的操作：我的 / 发布服务 / 找人帮忙。只在 LeoBay 栏、且停在信息流时由整页画出来。 */
export function LeoBayHeaderActions(): ReactElement {
  const tt = useUI();
  const filter = useBayFilter();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" data-bay-page-actions>
      <button type="button" onClick={openMine} data-bay-action="mine" className={`inline-flex ${SECONDARY_BUTTON}`}>
        {tt("我的")}
      </button>
      <button type="button" onClick={startServiceEditor} data-bay-action="publish-service" className={`hidden sm:inline-flex ${SECONDARY_BUTTON}`}>
        {tt("发布服务")}
      </button>
      <button type="button" onClick={() => startPostNeed(filter.category)} data-bay-action="get-help" className={PRIMARY_BUTTON}>
        <BayGlyph name="plus" className="h-4 w-4" />
        {tt("找人帮忙")}
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
      placeholder={tt("搜索")}
      tt={tt}
      hideView
    />
  );
}

/**
 * 逛 LeoBay：种类 + 搜索、类目、卡片网格。
 * 看详情或栏目被切走时这一整块只是藏起来（`visible` 为 false）；回来时把信息流滚回离开时的位置。
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

/** 点开的那一条：一行「返回 + 标题」，正文在一张卡里（卡内滚动，底部的操作条贴在卡的底边）。 */
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
          <h2 className={`min-w-0 truncate ${APP_PAGE_TITLE_CLASS}`}>{title ? tt(title) : null}</h2>
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

/** LeoBay 栏正文：逛的时候是种类 + 搜索 + 类目 + 卡片网格；点开一条，换成「返回 + 标题 + 详情卡」。不带页框、不带页标题。 */
export function LeoBaySection({ accent, active }: { accent?: string; active: boolean }): ReactElement {
  const filter = useBayFilter();
  const { current } = useBayState();
  const siteKey = useBaySiteKey();
  const browsing = current.kind === "feed";
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-bay-page={browsing ? "browse" : "detail"}>
      <div className={browsing ? "flex min-h-0 flex-1 flex-col" : "hidden"} data-bay-page-browse>
        <Browse filter={filter} accent={accent} visible={active && browsing} />
      </div>
      {current.kind === "feed" ? null : <Detail target={current} siteKey={siteKey} />}
      <LibraryWorkPickerHost />
      <BayAuthHost />
    </div>
  );
}
