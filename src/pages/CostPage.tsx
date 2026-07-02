"use client";

// ============================================================================
// @oceanleo/ui — 统一「Cost」页（单一事实源，2026-07-02）
// ----------------------------------------------------------------------------
// 操作员定稿：账户中心新增独立 Cost 页（/cost）。
//   上半：用量柱状图 —— 纵轴金额（¥），横轴时间（按天，近 30 天）。悬停某柱显示
//         该天用了哪些模型、各自 token 消耗量与金额。
//   下半：用量记录明细表（UsageHistory，从 settings / api 页迁来，此后只在这里
//         显示）。列表内部滚动，不再占满整页。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { getCreditHistory, type CreditEvent } from "../lib/auth";
import { UsageHistory } from "./UsageHistory";
import { PageHeader } from "./PageHeader";
import { useUI } from "../i18n/ui/useUI";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface DayBucket {
  /** "MM-DD" 展示标签 */
  label: string;
  /** 当天消费总额（元，正数） */
  total: number;
  /** 模型 → {tokens, yuan} */
  models: Record<string, { tokens: number; yuan: number }>;
}

/** 把 credit events 聚成近 N 天的「每日消费」桶（只统计 usage 消费，不含充值）。 */
function bucketByDay(events: CreditEvent[], days: number): DayBucket[] {
  const map = new Map<string, DayBucket>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, {
      label: `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      total: 0,
      models: {},
    });
  }
  for (const ev of events) {
    if (ev.kind !== "usage" || !ev.created_at) continue;
    const key = ev.created_at.slice(0, 10);
    const bucket = map.get(key);
    if (!bucket) continue;
    const meta = (ev.meta || {}) as Record<string, unknown>;
    // 真实成本：meta.price_cny（BYOK 免费为 0）；回退 |amount_yuan|。
    const yuan = toNum(meta.price_cny) || Math.abs(toNum(ev.amount_yuan));
    const tokens =
      toNum(meta.prompt_tokens) + toNum(meta.completion_tokens) || toNum(meta.tokens);
    const model = String(meta.model || "") || "unknown";
    bucket.total += yuan;
    const m = bucket.models[model] || { tokens: 0, yuan: 0 };
    m.tokens += tokens;
    m.yuan += yuan;
    bucket.models[model] = m;
  }
  return Array.from(map.values());
}

function UsageBarChart({ events }: { events: CreditEvent[] }) {
  const tt = useUI();
  const [hover, setHover] = useState<number | null>(null);
  const buckets = useMemo(() => bucketByDay(events, 30), [events]);
  const max = Math.max(...buckets.map((b) => b.total), 0.000001);

  return (
    <div className="rounded-2xl border border-neutral-200 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[14px] font-semibold text-neutral-900">{tt("近 30 天消费")}</h2>
        <span className="text-[12px] tabular-nums text-neutral-500">
          {tt("合计")} ¥{buckets.reduce((s, b) => s + b.total, 0).toFixed(4)}
        </span>
      </div>
      <div className="relative">
        {/* 柱区：等宽 30 列，柱高按当日金额/最大值。 */}
        <div className="flex h-44 items-end gap-[3px]">
          {buckets.map((b, i) => {
            const h = b.total > 0 ? Math.max((b.total / max) * 100, 3) : 0;
            const on = hover === i;
            return (
              <div
                key={b.label}
                className="group relative flex h-full flex-1 cursor-pointer items-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {/* 悬停整列高亮的底轨 */}
                <div
                  className={`absolute inset-0 rounded transition ${on ? "bg-neutral-100" : ""}`}
                />
                <div
                  className={`relative w-full rounded-t transition-colors ${
                    b.total > 0
                      ? on
                        ? "bg-neutral-900"
                        : "bg-neutral-400"
                      : "bg-neutral-100"
                  }`}
                  style={{ height: b.total > 0 ? `${h}%` : "2px" }}
                />
                {/* 悬停 tooltip：当天各模型 token + 金额 */}
                {on && (
                  <div
                    className={`absolute bottom-full z-20 mb-2 w-max min-w-[180px] max-w-[260px] rounded-xl border border-neutral-200 bg-white p-3 text-left shadow-lg ${
                      i > buckets.length * 0.66 ? "right-0" : i > buckets.length * 0.33 ? "left-1/2 -translate-x-1/2" : "left-0"
                    }`}
                  >
                    <p className="mb-1 flex items-baseline justify-between gap-4 text-[12px] font-semibold text-neutral-900">
                      <span>{b.label}</span>
                      <span className="tabular-nums">¥{b.total.toFixed(4)}</span>
                    </p>
                    {Object.keys(b.models).length === 0 ? (
                      <p className="text-[11px] text-neutral-400">{tt("当天无消费")}</p>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(b.models)
                          .sort((a, z) => z[1].yuan - a[1].yuan)
                          .map(([model, v]) => (
                            <div key={model} className="flex items-baseline justify-between gap-3 text-[11px]">
                              <span className="max-w-[140px] truncate text-neutral-600">{model}</span>
                              <span className="shrink-0 tabular-nums text-neutral-500">
                                {v.tokens > 0 ? `${v.tokens.toLocaleString()} tok · ` : ""}¥{v.yuan.toFixed(4)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* 横轴：首 / 中 / 尾 三个日期刻度 */}
        <div className="mt-1.5 flex justify-between text-[10px] text-neutral-400">
          <span>{buckets[0]?.label}</span>
          <span>{buckets[Math.floor(buckets.length / 2)]?.label}</span>
          <span>{buckets[buckets.length - 1]?.label}</span>
        </div>
      </div>
    </div>
  );
}

export function CostPage() {
  const tt = useUI();
  const [events, setEvents] = useState<CreditEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getCreditHistory(500).then((h) => {
      if (h.ok && h.data) setEvents(h.data.events || []);
      setLoaded(true);
    });
  }, []);

  return (
    <div className="px-8 py-6">
      <PageHeader title="Cost" />

      <div className="mx-auto mt-8 max-w-3xl space-y-8">
        {!loaded ? (
          <p className="py-16 text-center text-[13px] text-neutral-400">{tt("加载中…")}</p>
        ) : (
          <>
            <section className="v-fade-up">
              <UsageBarChart events={events} />
            </section>
            {/* 明细表（从 settings / api 迁来，仅此一处）；列表内部滚动。 */}
            <UsageHistory limit={200} maxHeight="440px" />
          </>
        )}
      </div>
    </div>
  );
}
