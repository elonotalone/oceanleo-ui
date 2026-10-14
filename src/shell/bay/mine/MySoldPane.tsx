"use client";

// 「我的」→「我卖出的」：卖家概况、我给别人需求报的价、我作为卖家的订单、卖出的课程订单、卖出的作品订单。
import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { listSoldBayLessonOrders, type BayLessonPurchase } from "../../../lib/bay/lessons";
import { SoldOrders } from "../lessons/SoldOrders";
import { DEFAULT_CURRENCY } from "../seller/editor-model";
import { SellerNotice } from "../seller/seller-ui";
import { MyProposalsPane } from "../needs/MyProposalsPane";
import { MyOrdersPane } from "../orders/MyOrdersPane";
import { SellerOverview } from "../seller/MyServicesPane";
import { useBaySignedIn } from "../shell/bay-state";
import { ordersShownFor, type MinePaneProps } from "./MineCategoryBar";
import { PaneLoading } from "../supply/parts";
import { LazySection } from "./LazySection";

const loadSoldApps = () => import("../apppaid/MySoldAppsPane").then((mod) => mod.MySoldAppsPane);

function SoldLessons() {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [items, setItems] = useState<BayLessonPurchase[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [rowError, setRowError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void listSoldBayLessonOrders().then(
      (body) => {
        if (alive) setItems(body.items || []);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [signedIn, nonce]);

  if (failed) return <SellerNotice tone="error">{tt("课程订单没读出来，请稍后再试。")}</SellerNotice>;
  if (items === null) return <PaneLoading />;
  return (
    <div className="space-y-3">
      <SoldOrders items={items} currency={DEFAULT_CURRENCY} onChanged={() => setNonce((value) => value + 1)} onError={setRowError} />
      {rowError ? <SellerNotice tone="error">{rowError}</SellerNotice> : null}
    </div>
  );
}

export function MySoldPane({ category = "all", ...props }: MinePaneProps) {
  const tt = useUI();
  const all = category === "all";
  return (
    <section data-bay-pane="mine-sold" className="space-y-6">
      {all ? (
        <div className="px-4 pt-4">
          <SellerOverview />
        </div>
      ) : null}
      {all ? (
        <div data-bay-mine-section="proposals">
          <h3 className="px-4 text-[13px] font-semibold text-stone-700">{tt("报价中")}</h3>
          <MyProposalsPane {...props} />
        </div>
      ) : null}
      {ordersShownFor(category) ? (
        <div data-bay-mine-section="orders">
          <h3 className="px-4 text-[13px] font-semibold text-stone-700">{tt("卖出的订单")}</h3>
          <MyOrdersPane {...props} fixedRole="seller" category={category} />
        </div>
      ) : null}
      {all || category === "lesson" ? (
        <div data-bay-mine-section="sold-lessons">
          <h3 className="px-4 text-[13px] font-semibold text-stone-700">{tt("卖出的课程")}</h3>
          <div className="px-4">
            <SoldLessons />
          </div>
        </div>
      ) : null}
      {all || category === "app" ? <LazySection marker="app-orders" title="作品订单" load={loadSoldApps} /> : null}
    </section>
  );
}
