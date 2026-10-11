"use client";

import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayAppStatsDay } from "../../../lib/bay/apps";

export function AppStatsBars({ days }: { days: BayAppStatsDay[] }): ReactElement {
  const tt = useUI();
  const max = days.reduce((high, row) => Math.max(high, row.opens), 0);
  return (
    <div data-bay-app-stats className="flex h-16 items-end gap-px">
      {days.map((row) => {
        const ratio = max <= 0 ? 0 : row.opens / max;
        const height = max <= 0 ? 4 : Math.max(4, Math.round(ratio * 64));
        return (
          <div
            key={row.day}
            title={tt("{day}：打开 {opens} · 浏览 {views}", { day: row.day, opens: row.opens, views: row.views })}
            className="min-w-0 flex-1 rounded-t bg-stone-400"
            style={{ height }}
          />
        );
      })}
    </div>
  );
}
