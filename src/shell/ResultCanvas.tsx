"use client";

// ============================================================================
// @oceanleo/ui — 三栏工作台「右列」结果/素材画布（单一事实源）
// ----------------------------------------------------------------------------
// 顶部一排标签切换（每站结合实际语义自定，如「生成结果/风格库/灵感库」或「律师列表/
// 律师详情」），主体按当前标签渲染对应内容（业务自填）。可选右上角提示文案。
//
// 宗旨 v11（2026-06-28 操作员）——去「框中框」：本组件**不再画自己的圆角边框**，而是
// 把标签条**挂到右栏 PaneHeader 标题位**（SplitWorkspace.useRightPaneSlot）。这样右栏
// 只有外层 <section> 一层边框，标签条直接长在右栏标题行，主体内容直接贴右栏框、可上下
// 滚动（min-h-0 + 稳定滚动槽）。不在 SplitWorkspace 内（slot 为 null）时回退到旧的
// 自带标签条 + 边框版式（兼容独立使用）。
//
// 二级切换：某个一级标签下有多个来源时，用 <CanvasSubTabs> 在主体顶部再切一层（按需，
// 单来源不要二级）。详见 docs/architecture/oceanleo-right-canvas-and-shell-polish.md。
// ============================================================================

import { useEffect, type ReactNode } from "react";
import { useRightPaneSlot } from "./SplitWorkspace";
import { useUI } from "../i18n/ui/useUI";

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

/** 标签条本体（一排 pill + 可选右侧 hint）。挂右栏标题位与回退自带头部共用。 */
function TabBar({
  tabs,
  active,
  onChange,
  hint,
}: {
  tabs: CanvasTab[];
  active: string;
  onChange: (id: string) => void;
  hint?: ReactNode;
}) {
  const tt = useUI();
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`rounded-lg px-3 py-1 text-[13px] font-medium transition-colors ${
              active === t.id
                ? "bg-white text-stone-800 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {tt(t.label)}
          </button>
        ))}
      </div>
      {hint && (
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
          {hint}
        </span>
      )}
    </div>
  );
}

export function ResultCanvas({
  tabs,
  active,
  onChange,
  hint,
  className = "",
}: ResultCanvasProps) {
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  const rightSlot = useRightPaneSlot();

  // 在 SplitWorkspace 内：把标签条挂到右栏标题位（去框中框）。卸载时清空。
  const inSplit = rightSlot != null;
  useEffect(() => {
    if (!rightSlot) return;
    rightSlot.setRightLabel(
      <TabBar tabs={tabs} active={active} onChange={onChange} hint={hint} />,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightSlot, tabs, active, hint]);
  useEffect(() => {
    return () => rightSlot?.setRightLabel(null);
  }, [rightSlot]);

  // SplitWorkspace 内：无边框、无自带头部，主体直接铺满右栏 body（可滚 + 稳定滚动槽）。
  if (inSplit) {
    return (
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${className}`}>
        <div className="v-scroll-stable min-h-0 flex-1 overflow-y-auto p-4">
          {current?.content}
        </div>
      </div>
    );
  }

  // 回退（独立使用、不在 SplitWorkspace 内）：保留自带边框 + 头部标签条。
  return (
    <div
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-stone-200 bg-white/70 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3">
        <TabBar tabs={tabs} active={active} onChange={onChange} hint={hint} />
      </div>
      <div className="v-scroll-stable flex-1 overflow-y-auto p-4">{current?.content}</div>
    </div>
  );
}

/**
 * 右栏「二级切换条」（按需）：某个一级标签下有多个来源时，在主体顶部放一排次级切换。
 * 单来源不要用它。样式 = 圆角胶囊一排，与一级标签区分（更轻量）。
 */
export function CanvasSubTabs({
  tabs,
  active,
  onChange,
  accent = "#4f46e5",
  right,
  className = "",
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  accent?: string;
  /** 切换条右侧附加内容（如计数、搜索框）。 */
  right?: ReactNode;
  className?: string;
}) {
  const tt = useUI();
  return (
    <div className={`mb-3 flex flex-wrap items-center gap-2 ${className}`}>
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              on ? "text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
            style={on ? { background: accent } : undefined}
          >
            {tt(t.label)}
          </button>
        );
      })}
      {right && <span className="ml-auto">{right}</span>}
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
  const tt = useUI();
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
      <p className="text-sm text-stone-400">{tt(title)}</p>
      {hint && <p className="max-w-xs text-xs text-stone-400">{tt(hint)}</p>}
    </div>
  );
}
