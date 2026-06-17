"use client";

import type { ReactNode } from "react";

// ============================================================================
// @oceanleo/ui — 操作区可折叠卡片（单一事实源；原 image 站 CollapsibleSection）
// ----------------------------------------------------------------------------
// 三栏工作台「中列」里每一段操作（输入 / 参数 / 高级…）都是一个 StudioSection。
// 展开内容向下铺开；折叠时头部右侧显示一行 summary 概要（如「2K 高清 · 智能 · 4」）。
// accent 可配（默认中性灰），各站传自己的品牌色即可让序号徽章着色。
// ============================================================================

export interface StudioSectionProps {
  /** 序号徽章里的数字（1/2/3…）；不传则不显示序号。 */
  index?: number;
  title: string;
  open: boolean;
  onToggle: () => void;
  /** 折叠时头部右侧的概要 */
  summary?: ReactNode;
  /** 展开时序号徽章 / 高亮的强调色，默认 #4f46e5（indigo-600）。 */
  accent?: string;
  children?: ReactNode;
}

export function StudioSection({
  index,
  title,
  open,
  onToggle,
  summary,
  accent = "#4f46e5",
  children,
}: StudioSectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white/80 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        {index != null && (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition-colors"
            style={
              open
                ? { background: accent, color: "#fff" }
                : { background: "#f5f5f4", color: "#78716c" }
            }
          >
            {index}
          </span>
        )}
        <span className="text-sm font-semibold text-stone-800">{title}</span>
        <span className="ml-auto flex items-center gap-2">
          {!open && summary != null && (
            <span className="text-xs text-stone-500">{summary}</span>
          )}
          <span className="text-stone-400">
            <svg
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-stone-100 px-4 py-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** 向后兼容别名：旧站可能仍 `import { CollapsibleSection }`。 */
export const CollapsibleSection = StudioSection;
