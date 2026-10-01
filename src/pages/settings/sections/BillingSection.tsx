"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getCreditHistory, type CreditEvent } from "../../../lib/auth";
import { UsageBarChart } from "../../CostPage";

export function BillingSection({
  stats,
  wallet,
}: {
  stats: { value: ReactNode; label: string }[];
  wallet?: ReactNode;
}) {
  const [events, setEvents] = useState<CreditEvent[]>([]);

  useEffect(() => {
    getCreditHistory(500).then((h) => {
      if (h.ok && h.data) setEvents(h.data.events || []);
    });
  }, []);

  return (
    <div data-settings-pane="billing" className="space-y-6">
      <UsageBarChart events={events} />
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
      {wallet}
    </div>
  );
}
