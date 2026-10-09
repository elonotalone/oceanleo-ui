"use client";

// 「我的」五块：我发布的 / 我卖出的 / 我买到的 / 我的收藏 / 个人卡片。没登录先请登录。
// 每一块的正文在 `../mine/` 里，这个文件只管分区标签和登录提示。标签允许换行，不出横向滚动条。
import { useUI } from "../../../i18n/ui/useUI";
import { MyBoughtPane, MyCardPane, MyFavoritesPane, MyPublishedPane, MySoldPane } from "../mine";
import { BAY_MINE_UI_TABS } from "./bay-links";
import { replaceBay, requireBayLogin, useBaySignedIn, type BayLayout, type BayMineTab, type BayPaneProps } from "./bay-state";

const MINE_LABELS: Readonly<Record<BayMineTab, string>> = {
  published: "我发布的",
  sold: "我卖出的",
  bought: "我买到的",
  favorites: "我的收藏",
  card: "个人卡片",
};

function shownMineTab(tab: BayMineTab): BayMineTab {
  return BAY_MINE_UI_TABS.includes(tab) ? tab : "published";
}

function MinePane({ tab, ...props }: BayPaneProps & { tab: BayMineTab }) {
  if (tab === "sold") return <MySoldPane {...props} />;
  if (tab === "bought") return <MyBoughtPane {...props} />;
  if (tab === "favorites") return <MyFavoritesPane {...props} />;
  if (tab === "card") return <MyCardPane {...props} />;
  return <MyPublishedPane {...props} />;
}

export function BayMineTabs({
  tab,
  onSelect,
  variant = "overlay",
}: {
  tab: BayMineTab;
  onSelect?: (tab: BayMineTab) => void;
  variant?: "page" | "overlay";
}) {
  const tt = useUI();
  const shown = shownMineTab(tab);
  const select = onSelect ?? ((next: BayMineTab) => replaceBay({ kind: "mine", tab: next }));
  if (variant === "page") {
    return (
      <div className="shrink-0 px-4 pt-4">
        <div role="tablist" aria-label={tt("我的")} data-bay-mine-tabs="page" className="inline-flex max-w-full flex-wrap rounded-xl bg-neutral-100 p-1">
          {BAY_MINE_UI_TABS.map((id) => {
            const active = id === shown;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                data-mine-tab={id}
                onClick={() => select(id)}
                className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
                  active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {tt(MINE_LABELS[id])}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div role="tablist" aria-label={tt("我的")} data-bay-mine-tabs="overlay" data-im-filter-row className="flex shrink-0 flex-wrap gap-0.5 px-2 py-1.5">
      {BAY_MINE_UI_TABS.map((id) => (
        <button key={id} type="button" role="tab" aria-selected={id === shown} data-mine-tab={id} onClick={() => select(id)} className="shrink-0">
          {tt(MINE_LABELS[id])}
        </button>
      ))}
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
        className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800"
      >
        {tt("登录")}
      </button>
    </div>
  );
}

export function BayMine({ tab, layout, siteKey }: { tab: BayMineTab; layout: BayLayout; siteKey: string }) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const shown = shownMineTab(tab);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-bay-mine={shown}>
      <BayMineTabs tab={tab} variant={layout === "page" ? "page" : "overlay"} />
      {signedIn ? (
        <div className="min-h-0 flex-1">
          <MinePane tab={shown} target={{ kind: "mine", tab: shown }} layout={layout} siteKey={siteKey} />
        </div>
      ) : (
        <BaySignInPrompt text={tt("登录后查看你发布的、卖出的、买到的和收藏")} />
      )}
    </div>
  );
}

export { MINE_LABELS as BAY_MINE_LABELS };
