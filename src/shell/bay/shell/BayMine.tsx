"use client";

// 「我的」：我的需求、我的报价、我的服务、我的订单、我的求助。浮窗右栏与 Bay 页共用；没登录先请登录。
import { useUI } from "../../../i18n/ui/useUI";
import { MyHelpRequestsPane, MyNeedsPane, MyProposalsPane } from "../needs";
import { MyOrdersPane } from "../orders";
import { MyServicesPane } from "../seller";
import { BAY_MINE_TABS } from "./bay-links";
import { replaceBay, requireBayLogin, useBaySignedIn, type BayLayout, type BayMineTab, type BayPaneProps } from "./bay-state";

const MINE_LABELS: Readonly<Record<BayMineTab, string>> = {
  needs: "我的需求",
  proposals: "我的报价",
  services: "我的服务",
  orders: "我的订单",
  help: "我的求助",
};

function MinePane({ tab, ...props }: BayPaneProps & { tab: BayMineTab }) {
  if (tab === "needs") return <MyNeedsPane {...props} />;
  if (tab === "proposals") return <MyProposalsPane {...props} />;
  if (tab === "services") return <MyServicesPane {...props} />;
  if (tab === "orders") return <MyOrdersPane {...props} />;
  return <MyHelpRequestsPane {...props} />;
}

export function BayMineTabs({ tab, onSelect }: { tab: BayMineTab; onSelect?: (tab: BayMineTab) => void }) {
  const tt = useUI();
  const select = onSelect ?? ((next: BayMineTab) => replaceBay({ kind: "mine", tab: next }));
  return (
    <div role="tablist" aria-label={tt("我的")} className="flex gap-1 overflow-x-auto px-2 py-2" data-bay-mine-tabs>
      {BAY_MINE_TABS.map((id) => {
        const active = id === tab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            data-mine-tab={id}
            onClick={() => select(id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
              active
                ? "bg-sky-500 text-white"
                : "bg-black/5 text-black/70 hover:bg-black/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
            }`}
          >
            {tt(MINE_LABELS[id])}
          </button>
        );
      })}
    </div>
  );
}

export function BaySignInPrompt({ text }: { text: string }) {
  const tt = useUI();
  return (
    <div className="px-4 py-10 text-center text-sm text-black/55 dark:text-white/55" data-bay-sign-in>
      <div>{text}</div>
      <button
        type="button"
        onClick={() => requireBayLogin()}
        className="mt-3 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
      >
        {tt("登录")}
      </button>
    </div>
  );
}

export function BayMine({ tab, layout, siteKey }: { tab: BayMineTab; layout: BayLayout; siteKey: string }) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-bay-mine={tab}>
      <BayMineTabs tab={tab} />
      {signedIn ? (
        <div className="min-h-0 flex-1">
          <MinePane tab={tab} target={{ kind: "mine", tab }} layout={layout} siteKey={siteKey} />
        </div>
      ) : (
        <BaySignInPrompt text={tt("登录后查看你的需求、报价、服务、订单和求助")} />
      )}
    </div>
  );
}

export { MINE_LABELS as BAY_MINE_LABELS };
