"use client";

// 「我的」：我发出的、我的报价、我的服务、我的订单。浮窗右栏与 /bay 页共用；没登录先请登录。
// 分区标签的外形跟着所在界面走：/bay 页是标准页的分段标签，浮窗里是浮窗的筛选行。两处都允许换行，不出横向滚动条。
import { useUI } from "../../../i18n/ui/useUI";
import { MyNeedsPane, MyProposalsPane } from "../needs";
import { MyOrdersPane } from "../orders";
import { MyServicesPane } from "../seller";
import { BAY_MINE_UI_TABS } from "./bay-links";
import { replaceBay, requireBayLogin, useBaySignedIn, type BayLayout, type BayMineTab, type BayPaneProps } from "./bay-state";

const MINE_LABELS: Readonly<Record<BayMineTab, string>> = {
  needs: "我发出的",
  proposals: "我的报价",
  services: "我的服务",
  orders: "我的订单",
  help: "我的求助",
};

function shownMineTab(tab: BayMineTab): BayMineTab {
  return tab === "help" ? "needs" : tab;
}

function MinePane({ tab, ...props }: BayPaneProps & { tab: BayMineTab }) {
  if (tab === "needs" || tab === "help") return <MyNeedsPane {...props} target={{ kind: "mine", tab: "needs" }} />;
  if (tab === "proposals") return <MyProposalsPane {...props} />;
  if (tab === "services") return <MyServicesPane {...props} />;
  return <MyOrdersPane {...props} />;
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
          <MinePane tab={tab} target={{ kind: "mine", tab }} layout={layout} siteKey={siteKey} />
        </div>
      ) : (
        <BaySignInPrompt text={tt("登录后查看你发出的、报价、服务和订单")} />
      )}
    </div>
  );
}

export { MINE_LABELS as BAY_MINE_LABELS };
