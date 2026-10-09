"use client";

// 「我的」→「我卖出的」：卖家概况、我给别人需求报的价、我作为卖家的订单。
import { useUI } from "../../../i18n/ui/useUI";
import { MyProposalsPane } from "../needs/MyProposalsPane";
import { MyOrdersPane } from "../orders/MyOrdersPane";
import { SellerOverview } from "../seller/MyServicesPane";
import type { BayPaneProps } from "../shell/bay-state";

export function MySoldPane(props: BayPaneProps) {
  const tt = useUI();
  return (
    <section data-bay-pane="mine-sold" className="space-y-6">
      <div className="px-4 pt-4">
        <SellerOverview />
      </div>
      <div data-bay-mine-section="proposals">
        <h3 className="px-4 text-[13px] font-semibold text-stone-700">{tt("报价中")}</h3>
        <MyProposalsPane {...props} />
      </div>
      <div data-bay-mine-section="orders">
        <h3 className="px-4 text-[13px] font-semibold text-stone-700">{tt("卖出的订单")}</h3>
        <MyOrdersPane {...props} fixedRole="seller" />
      </div>
    </section>
  );
}
