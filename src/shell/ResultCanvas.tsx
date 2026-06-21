"use client";

// ============================================================================
// @oceanleo/ui — 三栏工作台「右列」结果/素材画布（单一事实源）
// ----------------------------------------------------------------------------
// 顶部一排标签切换（生成结果 / 素材库 / 我的数据库 / 风格库 …，每站自定义），
// 主体按当前标签渲染对应内容（业务自填）。可选右上角提示文案。
//
// 这是与站点无关的纯壳：tabs 与每个 tab 的内容都由各站传入；本组件只统一
// 「标签条样式 + 选中态 + 独立滚动的主体区 + 圆角描边容器」。accent 可配。
// 各站的「我的数据库」标签可直接渲染 <MyDatabasePanel>（见 pages）。
// ============================================================================

import { type ReactNode } from "react";

export interface CanvasTab {
  id: string;
  label: string;
  /** 该标签的主体内容。 */
  content: ReactNode;
}

export interface ResultCanvasProps {
  tabs: CanvasTab[];
  active: string;
  onChange: (id: string) => void;
  /** 标签条右侧提示（如「点击放大预览 · 拖拽到左侧才算选用」）。 */
  hint?: ReactNode;
  /** 选中标签的强调色，默认中性（白底+灰字）。 */
  accent?: string;
  className?: string;
}

export function ResultCanvas({
  tabs,
  active,
  onChange,
  hint,
  className = "",
}: ResultCanvasProps) {
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-stone-200 bg-white/70 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3">
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active === t.id
                  ? "bg-white text-stone-800 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {hint && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
            {hint}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">{current?.content}</div>
    </div>
  );
}

/**
 * 通用空状态：在结果区还没有内容时显示的占位（图标 + 主文案 + 副文案）。
 */
export function CanvasEmpty({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex h-full min-h-[440px] flex-col items-center justify-center gap-3 text-center">
      {icon ?? (
        <svg
          className="h-12 w-12 text-stone-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.8" />
          <path d="M4 17l5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <p className="text-sm text-stone-400">{title}</p>
      {hint && <p className="max-w-xs text-xs text-stone-400">{hint}</p>}
    </div>
  );
}
