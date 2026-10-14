"use client";

// 「我的」→「数据面板」：认证与收款两个入口，下面是数据面板本体（收入、用户、增长、分商品占比）。
import { lazy, Suspense } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { openBaySettings } from "../settings/settings-open";
import type { BayPaneProps } from "../shell/bay-state";
import { PaneLoading } from "../supply/parts";

const DashboardPane = lazy(() => import("../dashboard/DashboardPane").then((mod) => ({ default: mod.DashboardPane })));

const QUIET_BTN =
  "rounded-lg px-3 py-1.5 text-[13px] text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300";

export function BayMineDashboardTab(props: BayPaneProps) {
  const tt = useUI();
  return (
    <section data-bay-pane="mine-dashboard" className="space-y-4">
      <div data-bay-card-links className="flex flex-wrap gap-2 px-4 pt-4">
        <button type="button" className={QUIET_BTN} onClick={() => openBaySettings("vetting")}>
          {tt("认证")}
        </button>
        <button type="button" className={QUIET_BTN} onClick={() => openBaySettings("money")}>
          {tt("收款")}
        </button>
      </div>
      <Suspense fallback={<PaneLoading />}>
        <DashboardPane {...props} />
      </Suspense>
    </section>
  );
}
