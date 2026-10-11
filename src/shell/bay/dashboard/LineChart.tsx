"use client";

import { useState, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { axisDateIndices, chartHasLine, chartPoints, nearestChartIndex } from "./dashboard-model";

const VIEW_W = 320;
const VIEW_H = 160;
const PAD = 28;

export function LineChart({
  marker,
  title,
  days,
  values,
  formatValue,
  ariaLabel,
}: {
  marker: string;
  title: string;
  days: string[];
  values: number[];
  formatValue: (value: number) => string;
  ariaLabel: string;
}): ReactElement {
  const tt = useUI();
  const [selected, setSelected] = useState<number | null>(null);
  const points = chartPoints(values, VIEW_W, VIEW_H, PAD);
  const showLine = chartHasLine(values) && points.length > 0;
  const max = Math.max(0, ...values);
  const ticks = axisDateIndices(days.length);

  function pickFromMouse(event: MouseEvent<SVGSVGElement>) {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * VIEW_W;
    setSelected(nearestChartIndex(points, localX));
  }

  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    if (!points.length) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setSelected((current) => {
      const start = current == null ? points.length - 1 : current;
      if (event.key === "ArrowLeft") return Math.max(0, start - 1);
      return Math.min(points.length - 1, start + 1);
    });
  }

  return (
    <section data-bay-chart={marker} className="rounded-xl border border-neutral-200 p-3">
      <h3 className="text-[14px] font-semibold text-neutral-900">{title}</h3>
      {!showLine ? (
        <p data-bay-chart-empty className="py-8 text-center text-[13px] text-neutral-500">
          {tt("这段时间还没有数据")}
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            width="100%"
            role="img"
            aria-label={ariaLabel}
            tabIndex={0}
            onMouseMove={pickFromMouse}
            onMouseLeave={() => setSelected(null)}
            onFocus={() => setSelected(points.length - 1)}
            onKeyDown={onKey}
            className="mt-2 h-40 text-neutral-800"
          >
            <text x={4} y={PAD} fill="currentColor" className="text-[11px] text-neutral-500">
              {formatValue(max)}
            </text>
            <text x={4} y={VIEW_H - 8} fill="currentColor" className="text-[11px] text-neutral-500">
              {formatValue(0)}
            </text>
            {ticks.map((index) => (
              <text
                key={`tick-${days[index] ?? index}`}
                x={points[index]?.x ?? PAD}
                y={VIEW_H - 2}
                textAnchor="middle"
                fill="currentColor"
                className="text-[11px] text-neutral-500"
              >
                {days[index]}
              </text>
            ))}
            <path
              d={`${points
                .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
                .join(" ")} L${points[points.length - 1].x} ${VIEW_H - PAD} L${points[0].x} ${VIEW_H - PAD} Z`}
              className="text-neutral-200"
              fill="currentColor"
            />
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            />
            {selected != null && points[selected] ? (
              <circle cx={points[selected].x} cy={points[selected].y} r="3.5" fill="currentColor" />
            ) : null}
          </svg>
          {selected != null && days[selected] != null ? (
            <p data-bay-chart-readout className="mt-1 text-[12px] tabular-nums text-neutral-600">
              {tt("{day}：{value}", { day: days[selected], value: formatValue(values[selected] ?? 0) })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
