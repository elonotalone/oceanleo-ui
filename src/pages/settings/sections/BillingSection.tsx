"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getCreditHistory, type CreditEvent } from "../../../lib/auth";
import { UsageBarChart } from "../../CostPage";
import { type BillingPaneView } from "../settings-tabs";
import { TopUpSection } from "./TopUpSection";
import { UsageDetailsSection } from "./UsageDetailsSection";

const BILLING_TABS = [
  { id: "overview", label: "总览" },
  { id: "usage-details", label: "用量明细" },
  { id: "topup", label: "充值" },
] as const;

const TAB_BTN =
  "rounded-lg px-3 py-2 text-[13px] font-medium";
const TAB_ON = `${TAB_BTN} bg-neutral-900 text-white`;
const TAB_OFF = `${TAB_BTN} text-neutral-600 hover:bg-neutral-100`;

export function BillingSection({
  stats,
  wallet,
  view = "overview",
  onViewChange,
}: {
  stats: { value: ReactNode; label: string }[];
  wallet?: ReactNode;
  view?: BillingPaneView;
  onViewChange?: (view: BillingPaneView) => void;
}) {
  const tt = useUI();
  const [events, setEvents] = useState<CreditEvent[]>([]);
  const [localView, setLocalView] = useState<BillingPaneView>(view);

  useEffect(() => {
    setLocalView(view);
  }, [view]);

  useEffect(() => {
    getCreditHistory(500).then((h) => {
      if (h.ok && h.data) setEvents(h.data.events || []);
    });
  }, []);

  function go(next: BillingPaneView) {
    setLocalView(next);
    onViewChange?.(next);
  }

  return (
    <div data-settings-pane="billing" data-billing-hub="" className="space-y-4">
      <div className="flex gap-1" data-billing-settings-tabs="" role="tablist">
        {BILLING_TABS.map((item) => {
          const active = localView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              data-billing-settings-tab={item.id}
              aria-selected={active}
              className={active ? TAB_ON : TAB_OFF}
              onClick={() => go(item.id)}
            >
              {tt(item.label)}
            </button>
          );
        })}
      </div>
      {localView === "overview" ? (
        <div data-billing-overview="" className="space-y-6">
          {stats.length > 0 ? (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${Math.max(stats.length, 1)}, minmax(0, 1fr))` }}
            >
              {stats.map((s, i) => (
                <div key={i} className="rounded-xl border border-neutral-200 p-3 text-center">
                  <p className="text-[18px] font-semibold tabular-nums text-neutral-900">{s.value}</p>
                  <p className="text-[11px] text-neutral-500">{s.label}</p>
                </div>
              ))}
            </div>
          ) : null}
          <UsageBarChart events={events} />
        </div>
      ) : null}
      {localView === "usage-details" ? <UsageDetailsSection /> : null}
      {localView === "topup" ? <TopUpSection wallet={wallet} /> : null}
    </div>
  );
}
