"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useUI } from "../../../i18n/ui/useUI";

export function BillingSection({
  stats,
}: {
  stats: { value: ReactNode; label: string }[];
}) {
  const tt = useUI();
  return (
    <div data-settings-pane="billing">
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
      <Link
        href="/cost"
        className="mt-6 inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800"
      >
        {tt("充值 / 账单明细")}
      </Link>
    </div>
  );
}
