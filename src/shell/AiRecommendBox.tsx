"use client";

// ============================================================================
// @oceanleo/ui — 通用「AI 智能推荐」输入框（doctrine v11，2026-06-26）
// ----------------------------------------------------------------------------
// 操作员要求把原本只在「网站」分区的「说说你想做什么，AI 帮你推荐最合适的应用…」
// 推荐框，移植进 app / agent / organization / workflow 四个分区，并按内容类型定制
// 文案与推荐逻辑。本组件是该交互的单一事实源：
//   - 一个发光输入框（Enter 发送 / Shift+Enter 换行）+「智能推荐」按钮；
//   - 例子 chips（消费端传入，未推荐时显示）；
//   - 推荐结果由消费端通过 onRecommend(query) 回调拿到（调 recommendItems），
//     本组件只管交互态（loading / 错误 / 清空）。命中后展示一行高亮提示。
// ============================================================================

import { useState } from "react";
import { recommendItems, type RecommendCandidate, type ItemRecommendation } from "../lib/recommend";

export interface AiRecommendBoxProps {
  /** 候选集（当前分区全部条目）。 */
  candidates: RecommendCandidate[];
  /** 提示词文案用的内容类型（"app" / "agent" / "组织" / "工作流"）。 */
  kindLabel: string;
  /** 输入框 placeholder（按分区定制）。 */
  placeholder: string;
  /** 例子 chips（未推荐时显示，点了即发）。 */
  examples?: string[];
  /** 命中推荐后回调：把按匹配度排序的 id 列表给消费端去高亮/排序。 */
  onRecommend: (recs: ItemRecommendation[]) => void;
  /** 清空推荐时回调（消费端恢复默认列表）。 */
  onClear?: () => void;
  accent?: string;
}

export function AiRecommendBox({
  candidates,
  kindLabel,
  placeholder,
  examples = [],
  onRecommend,
  onClear,
  accent = "#6366f1",
}: AiRecommendBoxProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState<number | null>(null);

  async function run(q: string) {
    const v = q.trim();
    if (!v || loading) return;
    setLoading(true);
    setError("");
    const r = await recommendItems(v, candidates, kindLabel);
    setLoading(false);
    if (!r.ok) {
      setError(r.error || "推荐服务暂时不可用");
      setCount(0);
      onRecommend([]);
      return;
    }
    setCount(r.recommendations.length);
    onRecommend(r.recommendations);
  }

  function clear() {
    setQuery("");
    setCount(null);
    setError("");
    onClear?.();
  }

  return (
    <section className="mx-auto mb-7 max-w-2xl">
      <div className={`relative rounded-2xl transition-all ${loading ? "leo-glow" : ""}`}>
        <div
          className={`relative overflow-hidden rounded-2xl border bg-white/90 shadow-sm transition-all ${
            loading ? "border-indigo-200/70" : "border-stone-200/90"
          }`}
        >
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void run(query);
              }
            }}
            rows={2}
            placeholder={placeholder}
            className="w-full resize-none bg-transparent px-4 py-3.5 text-sm text-stone-800 outline-none placeholder:text-stone-400 sm:text-base"
          />
          <div className="flex items-center justify-between border-t border-stone-100 px-3 py-2">
            <span className="text-[11px] text-stone-400">
              {loading ? `AI 正在为你匹配${kindLabel}…` : "Enter 发送 · Shift+Enter 换行"}
            </span>
            <div className="flex items-center gap-2">
              {count !== null && (
                <button
                  type="button"
                  onClick={clear}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
                >
                  清空
                </button>
              )}
              <button
                type="button"
                onClick={() => void run(query)}
                disabled={loading || !query.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                    <path d="M12 2l1.6 5L19 8.6 14 11l-2 5-2-5L5 8.6 10.4 7 12 2z" fill="currentColor" />
                  </svg>
                )}
                智能推荐
              </button>
            </div>
          </div>
        </div>
      </div>

      {count === null && examples.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuery(ex);
                void run(ex);
              }}
              className="rounded-full border border-stone-200/80 bg-white/70 px-3 py-1.5 text-xs text-stone-500 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-center text-xs text-rose-500">{error}</p>}
      {count !== null && count === 0 && !error && (
        <p className="mt-3 text-center text-xs text-stone-400">
          没有找到完全匹配的{kindLabel}，下面是全部内容，欢迎浏览。
        </p>
      )}
      {count !== null && count > 0 && (
        <p className="mt-3 text-center text-xs font-medium" style={{ color: accent }}>
          为你推荐 {count} 个最合适的{kindLabel} ✨ 已在最上方高亮
        </p>
      )}
    </section>
  );
}
