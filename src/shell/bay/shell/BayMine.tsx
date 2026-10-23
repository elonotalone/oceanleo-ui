"use client";

// 「我的」三块：交易 / 我的主页 / 数据面板。没登录先请登录。
// 页签是项目页同一件 ProjectTabNav（下划线）。「交易」里一行两个下拉：第一个选列表（我发布的 / 我卖出的 / 我买到的 / 我的收藏），
// 第二个选类别（全部类别 / 现成文件 / 人工服务 / 网站与软件服务 / 课程 / 其他）；列表放在一块白色圆角卡片里。
// 页签与下拉直接坐在页底上，不铺整页白板；白色只给列表这一块卡片。主页与数据面板的卡片由它们自己画。
// 地址 `mine:published|sold|bought|favorites` 打开「交易」并选中对应列表，`mine:page`、`mine:dashboard` 原样（映射见 ../mine/mine-blocks.ts）。
// 每一块的正文在 `../mine/` 里（主页与数据面板借用 `../supply/ProfilePane` 与 `../dashboard/DashboardPane`），
// 这个文件只管页签、下拉和登录提示。
import { lazy, Suspense, useEffect, useId, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionFilterRow } from "../../collection-chrome";
import { ProjectTabNav } from "../../project-workspace";
import { MyBoughtPane, MyFavoritesPane, MyPublishedPane, MySoldPane } from "../mine";
import { BayMineDashboardTab } from "../mine/MyDashboardTab";
import type { MinePaneProps } from "../mine/mine-bundle";
import {
  MINE_BLOCKS,
  MINE_LISTS,
  isMineList,
  mineBlockOfTab,
  mineListOfTab,
  mineTabOfBlock,
  normalizeMineTab,
  type MineBlock,
  type MineList,
} from "../mine/mine-blocks";
import type { MineCategory } from "../mine/mine-category";
import { setMineView, useMineView, useMineViewLifecycle } from "../mine/mine-view-state";
import { PUBLISHED_CATEGORIES, PUBLISHED_CATEGORY_LABEL, type PublishedCategory } from "../mine/PublishedCategoryTag";
import { PaneLoading } from "../supply/parts";
import { replaceBay, requireBayLogin, useBaySignedIn, type BayLayout, type BayMineTab } from "./bay-state";
import { BayFilterSelect, type BayFilterOption } from "./BayFilterSelect";

// 「我自己的主页」= profile:me。懒加载：ProfilePane 经 BayMine 绕回本文件（同 mine/MyPublishedPane 的做法）。
const OWN_HANDLE = "me";
const ProfilePane = lazy(() => import("../supply/ProfilePane").then((mod) => ({ default: mod.ProfilePane })));

const MINE_LABELS: Readonly<Record<BayMineTab, string>> = {
  published: "我发布的",
  sold: "我卖出的",
  bought: "我买到的",
  favorites: "我的收藏",
  page: "我的主页",
  dashboard: "数据面板",
};

/**
 * 第一块页签的名字。键是「交易」加一个半角空格，不是裸「交易」：裸「交易」是 LeoChat 筛选的词条（英文 Deals），
 * 这一块英文要写 Listings & orders，两处只能拆成两个键（见 lbp-w04-copy.ts）。末尾空格在按钮里不占位。
 */
const TRADE_TAB_LABEL = "交易 ";

function blockLabelKey(block: MineBlock): string {
  return block === "trade" ? TRADE_TAB_LABEL : MINE_LABELS[block];
}

/** 交易列表的白色圆角卡片（参考项目页主区卡片）。页底不铺白，白色只用来分隔这一块。 */
const TRADE_CARD_CLASS = "mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white";

function MinePane({ tab, ...props }: MinePaneProps & { tab: BayMineTab }) {
  if (tab === "sold") return <MySoldPane {...props} />;
  if (tab === "bought") return <MyBoughtPane {...props} />;
  if (tab === "favorites") return <MyFavoritesPane {...props} />;
  if (tab === "page") {
    return (
      <Suspense fallback={<PaneLoading />}>
        <ProfilePane {...props} target={{ kind: "profile", handle: OWN_HANDLE }} />
      </Suspense>
    );
  }
  if (tab === "dashboard") return <BayMineDashboardTab {...props} />;
  return <MyPublishedPane {...props} />;
}

function isPublishedCategory(value: string): value is PublishedCategory {
  return (PUBLISHED_CATEGORIES as readonly string[]).includes(value);
}

export function BayMineTabs({
  tab,
  onSelect,
  variant = "overlay",
  panelId,
}: {
  tab: BayMineTab;
  onSelect?: (tab: BayMineTab) => void;
  variant?: "page" | "overlay";
  /** 下面那块 tabpanel 的 id；给了页签就带 aria-controls。 */
  panelId?: string;
}) {
  const tt = useUI();
  const view = useMineView();
  const block = mineBlockOfTab(tab);
  const select = onSelect ?? ((next: BayMineTab) => replaceBay({ kind: "mine", tab: next }));
  const tabs = MINE_BLOCKS.map((id) => ({
    id,
    label: tt(blockLabelKey(id)),
    ...(panelId ? { tabId: `${panelId}-tab-${id}`, panelId } : {}),
  }));
  return (
    <div data-bay-mine-tabs={variant} className="shrink-0">
      <ProjectTabNav
        tabs={tabs}
        activeId={block}
        ariaLabel={tt("我的")}
        className={variant === "page" ? undefined : "px-2"}
        onChange={(next) => {
          if (next === block) return;
          select(mineTabOfBlock(next, view.list));
        }}
      />
    </div>
  );
}

export function BaySignInPrompt({ text }: { text: string }) {
  const tt = useUI();
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center" data-bay-sign-in>
      <p className="max-w-xs text-[13px] leading-relaxed text-neutral-500">{text}</p>
      <button
        type="button"
        onClick={() => requireBayLogin()}
        className="mt-4 rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800"
      >
        {tt("登录")}
      </button>
    </div>
  );
}

/** 「交易」顶上的一行两个下拉：列表 + 类别。选列表走地址（mine:<列表>），选类别只改视图状态。 */
function TradeFilters({ list, category, page }: { list: MineList; category: MineCategory; page: boolean }) {
  const tt = useUI();
  const listOptions: BayFilterOption[] = MINE_LISTS.map((id) => ({ value: id, label: tt(MINE_LABELS[id]) }));
  const categoryOptions: BayFilterOption[] = PUBLISHED_CATEGORIES.map((id) => ({ value: id, label: tt(PUBLISHED_CATEGORY_LABEL[id]) }));
  const filters = (
    <>
      <BayFilterSelect
        name="mine-list"
        label={tt("列表")}
        value={list}
        options={listOptions}
        onChange={(next) => {
          if (isMineList(next) && next !== list) replaceBay({ kind: "mine", tab: next });
        }}
      />
      <BayFilterSelect
        name="mine-category"
        label={tt("类别")}
        value={category === "all" ? "" : category}
        options={categoryOptions}
        allLabel={tt("全部类别")}
        onChange={(next) => {
          if (next === "") setMineView({ category: "all" });
          else if (isPublishedCategory(next)) setMineView({ category: next });
        }}
      />
    </>
  );
  if (page) return <CollectionFilterRow data-bay-mine-filters="">{filters}</CollectionFilterRow>;
  return (
    <div data-bay-mine-filters="" className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto px-3 pt-3">
      {filters}
    </div>
  );
}

export function BayMine({ tab, layout, siteKey }: { tab: BayMineTab; layout: BayLayout; siteKey: string }) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const panelId = useId();
  const view = useMineView();
  useMineViewLifecycle();
  const page = layout === "page";
  const shown = normalizeMineTab(tab);
  const block = mineBlockOfTab(shown);
  const list = mineListOfTab(shown, view.list);

  // 记住最近看的列表：从主页 / 数据面板点回「交易」时回到它。
  useEffect(() => {
    if (isMineList(shown)) setMineView({ list: shown });
  }, [shown]);

  let body: ReactNode;
  if (!signedIn) {
    body = (
      <div className={page ? TRADE_CARD_CLASS : undefined} data-bay-mine-card="">
        <BaySignInPrompt text={tt("登录后查看你发布的、卖出的、买到的和收藏")} />
      </div>
    );
  } else if (block === "trade") {
    body = (
      <>
        <TradeFilters list={list} category={view.category} page={page} />
        <div className={page ? TRADE_CARD_CLASS : "mt-2"} data-bay-mine-card="">
          <MinePane tab={list} target={{ kind: "mine", tab: list }} layout={layout} siteKey={siteKey} category={view.category} />
        </div>
      </>
    );
  } else {
    body = (
      <div className={page ? "mt-4" : undefined}>
        <MinePane tab={shown} target={{ kind: "mine", tab: shown }} layout={layout} siteKey={siteKey} category="all" />
      </div>
    );
  }

  return (
    <div className="flex flex-col" data-bay-mine={shown} data-bay-mine-block={block}>
      <BayMineTabs tab={shown} variant={page ? "page" : "overlay"} panelId={panelId} />
      <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-tab-${block}`} className="flex flex-col">
        {body}
      </div>
    </div>
  );
}

export { MINE_LABELS as BAY_MINE_LABELS };
