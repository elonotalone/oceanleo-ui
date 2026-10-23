"use client";

import { useId, useState, type ReactElement, type ReactNode } from "react";
import type { BayDashboardDay, BayDashboardProduct } from "../../../lib/bay/dashboard";
import { axisDateIndices, nearestChartIndex } from "./dashboard-model";

const WIDTH = 960;
const HEIGHT = 360;
const LEFT = 90;
const RIGHT = 870;
const TOP = 44;
const BOTTOM = 312;
const COLORS = { income: "var(--ol-accent, #047857)", users: "#0284c7", opens: "#d97706" };

export function overviewGeometry(days: BayDashboardDay[]) {
  const moneyMax = Math.max(100, ...days.map((day) => day.income_fen));
  // Keep count ticks integral, including a range containing only one visitor.
  const countMax = Math.max(4, Math.ceil(Math.max(0, ...days.flatMap((day) => [day.new_users, day.opens])) / 4) * 4);
  const y = (value: number, max: number) => BOTTOM - Math.max(0, value) / max * (BOTTOM - TOP);
  return {
    moneyMax, countMax,
    points: days.map((day, index) => ({
      x: LEFT + (RIGHT - LEFT) * (index + 0.5) / days.length,
      incomeY: y(day.income_fen, moneyMax), usersY: y(day.new_users, countMax), opensY: y(day.opens, countMax),
    })),
  };
}

export function chartSelection(key: string, current: number, length: number): number {
  if (key === "Home") return 0;
  if (key === "End") return Math.max(0, length - 1);
  return Math.max(0, Math.min(length - 1, current + (key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0)));
}

type Props = {
  days: BayDashboardDay[];
  products: BayDashboardProduct[];
  money: (value: number) => string;
  count: (value: number) => string;
  labels: { overview: string; products: string; income: string; users: string; opens: string; count: string; empty: string; noIncome: string };
  summary: ReactNode;
};

export function OverviewChart({ days, products, money, count, labels, summary }: Props): ReactElement {
  const [mode, setMode] = useState<"overview" | "products">("overview");
  const [selected, setSelected] = useState<number | null>(null);
  const id = useId();
  const { points, moneyMax, countMax } = overviewGeometry(days);
  const productMax = Math.max(100, ...products.map((product) => product.income_fen));
  const length = mode === "overview" ? days.length : products.length;
  const index = Math.max(0, Math.min(selected ?? length - 1, length - 1));
  const day = days[index];
  const product = products[index];
  const hasData = mode === "overview" ? days.some((row) => row.income_fen || row.new_users || row.opens) : products.some((row) => row.income_fen > 0);
  const detail = mode === "overview"
    ? day ? `${day.day} · ${labels.income} ${money(day.income_fen)} · ${labels.users} ${count(day.new_users)} · ${labels.opens} ${count(day.opens)}` : labels.empty
    : product ? `${product.title} · ${labels.income} ${money(product.income_fen)}` : labels.noIncome;
  const line = (field: "usersY" | "opensY") => points.map((point) => `${point.x},${point[field]}`).join(" ");
  return (
    <section data-bay-chart="overview" className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div role="group" aria-label={labels.overview} className="flex flex-wrap gap-1">
          {(["overview", "products"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setSelected(null); }}
              className={mode === value ? "rounded-full bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white" : "rounded-full px-3 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-50"}>
              {value === "overview" ? labels.overview : labels.products}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-[11px]">
          <span style={{ color: COLORS.income }}>▮ {labels.income}</span>
          {mode === "overview" && <><span style={{ color: COLORS.users }}>● {labels.users}</span><span style={{ color: COLORS.opens }}>● {labels.opens}</span></>}
        </div>
      </div>
      <div className="px-4 pt-3 text-[12px] tabular-nums text-neutral-600" id={`${id}-detail`} aria-live="polite" aria-atomic="true">{detail}</div>
      <div className="overflow-x-auto">
      <div className="relative min-w-[640px] px-1">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block min-h-[240px] w-full" role="img" aria-label={mode === "overview" ? labels.overview : labels.products} aria-describedby={`${id}-detail`}>
          <title>{mode === "overview" ? labels.overview : labels.products}</title>
          <text x={LEFT} y="20" fontSize="12" fill="currentColor">{labels.income}</text>
          {mode === "overview" && <text x={RIGHT} y="20" fontSize="12" fill="currentColor" textAnchor="end">{labels.count}</text>}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = BOTTOM - ratio * (BOTTOM - TOP);
            return <g key={ratio}>
              <line x1={LEFT} x2={RIGHT} y1={y} y2={y} stroke="currentColor" opacity="0.08" />
              <text x={LEFT - 8} y={y + 4} textAnchor="end" fontSize="11" fill="currentColor">{money(ratio * (mode === "overview" ? moneyMax : productMax))}</text>
              {mode === "overview" && <text x={RIGHT + 8} y={y + 4} fontSize="11" fill="currentColor">{count(ratio * countMax)}</text>}
            </g>;
          })}
          {mode === "overview" ? <>
            {points.map((point, i) => <rect key={days[i].day} x={point.x - Math.min(24, (RIGHT - LEFT) / days.length * 0.55) / 2} y={point.incomeY}
              width={Math.min(24, (RIGHT - LEFT) / days.length * 0.55)} height={BOTTOM - point.incomeY} rx="2" fill={COLORS.income} opacity="0.5" />)}
            <polyline points={line("usersY")} fill="none" stroke={COLORS.users} strokeWidth="2.5" />
            <polyline points={line("opensY")} fill="none" stroke={COLORS.opens} strokeWidth="2.5" />
            {points[index] && <g>
              <line x1={points[index].x} x2={points[index].x} y1={TOP} y2={BOTTOM} stroke="currentColor" opacity="0.2" strokeDasharray="4 4" />
              <circle cx={points[index].x} cy={points[index].usersY} r="4" fill={COLORS.users} />
              <circle cx={points[index].x} cy={points[index].opensY} r="4" fill={COLORS.opens} />
            </g>}
            {axisDateIndices(days.length).map((i) => <text key={i} x={points[i].x} y={BOTTOM + 24} fontSize="11" fill="currentColor" textAnchor="middle">{days[i].day}</text>)}
          </> : products.map((row, i) => {
            const slot = (RIGHT - LEFT) / products.length;
            const height = Math.max(0, row.income_fen) / productMax * (BOTTOM - TOP);
            return <g key={`${row.item_kind}:${row.item_id}`}><title>{row.title}: {money(row.income_fen)}</title>
              <rect x={LEFT + slot * (i + 0.15)} y={BOTTOM - height} width={slot * 0.7} height={height} fill={COLORS.income} opacity={i === index ? 1 : 0.45} rx="2" />
              {axisDateIndices(products.length).includes(i) && <text x={LEFT + slot * (i + 0.5)} y={BOTTOM + 24} fontSize="11" fill="currentColor" textAnchor="middle">{row.title.length > 15 ? `${row.title.slice(0, 14)}…` : row.title}</text>}
            </g>;
          })}
        </svg>
        {length > 0 && <div role="slider" tabIndex={0} aria-label={mode === "overview" ? labels.overview : labels.products}
          aria-valuemin={1} aria-valuemax={length} aria-valuenow={index + 1} aria-valuetext={detail} aria-orientation="horizontal"
          className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-500"
          onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); setSelected(chartSelection(event.key, index, length)); }
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const localX = (event.clientX - rect.left) / rect.width * WIDTH;
            setSelected(mode === "overview" ? nearestChartIndex(points.map((point) => ({ x: point.x, y: 0 })), localX) : Math.max(0, Math.min(length - 1, Math.floor((localX - LEFT) / (RIGHT - LEFT) * length))));
          }} />}
      </div>
      </div>
      {!hasData && <p role="status" className="px-4 pb-3 text-[13px] text-neutral-500">{mode === "overview" ? labels.empty : labels.noIncome}</p>}
      <div className="border-t border-neutral-100 px-4 py-4">{summary}</div>
    </section>
  );
}
