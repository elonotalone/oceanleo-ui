"use client";

import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { DONUT_COLOR_CLASSES, donutSegments, sharePercent, type DonutItem } from "./dashboard-model";

const CX = 80;
const CY = 80;
const R = 36;
const CIRC = 2 * Math.PI * R;

export function DonutChart({
  items,
  formatMoney,
  ariaLabel,
}: {
  items: DonutItem[];
  formatMoney: (fen: number) => string;
  ariaLabel: string;
}): ReactElement {
  const tt = useUI();
  const segments = donutSegments(items.map((item) => item.share));
  if (!items.length || !segments.length) {
    return (
      <section data-bay-donut className="space-y-2">
        <h3 className="text-[14px] font-semibold text-neutral-900">{tt("分商品收入")}</h3>
        <p data-bay-donut-empty className="py-8 text-center text-[13px] text-neutral-500">
          {tt("这段时间还没有收入")}
        </p>
      </section>
    );
  }
  return (
    <section data-bay-donut className="space-y-2">
      <h3 className="text-[14px] font-semibold text-neutral-900">{tt("分商品收入")}</h3>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label={ariaLabel} className="shrink-0">
          <g transform={`rotate(-90 ${CX} ${CY})`}>
            {segments.map((segment, index) => {
              const length = Math.max(0, segment.end - segment.start) * CIRC;
              return (
                <circle
                  key={`${segment.start}-${index}`}
                  cx={CX}
                  cy={CY}
                  r={R}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="16"
                  strokeDasharray={`${length} ${CIRC}`}
                  strokeDashoffset={-segment.start * CIRC}
                  className={DONUT_COLOR_CLASSES[index] ?? DONUT_COLOR_CLASSES[0]}
                />
              );
            })}
          </g>
        </svg>
        <ul className="min-w-[12rem] flex-1 space-y-1.5 text-[12px] text-neutral-700">
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`} data-bay-donut-legend={item.isOther ? "other" : "item"} className="flex items-start gap-2">
              <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" className={`mt-1 shrink-0 ${DONUT_COLOR_CLASSES[index] ?? DONUT_COLOR_CLASSES[0]}`}>
                <rect width="10" height="10" rx="2" fill="currentColor" />
              </svg>
              <span className="min-w-0">
                <span className="break-words font-medium text-neutral-900">{item.isOther ? tt("其他") : item.title}</span>
                <span className="ml-2 tabular-nums text-neutral-600">
                  {formatMoney(item.income_fen)} · {sharePercent(item.share)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
