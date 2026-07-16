"use client";

// ============================================================================
// @oceanleo/ui — 右栏三分区「库」统一版式积木（单一事实源，宗旨 v17，2026-07-07）
// ----------------------------------------------------------------------------
// 右侧「模板 / 预览 / 素材库 / 我的库」的列表态 UI 应完全一致——
// 从上到下 = 搜索框 → 分类 chips → 各种卡片。为避免三处各写一份、日后漂移，把这两段
// 公共版式抽成积木，三个分区（NavigatorGuide / MaterialLibrary / ArtifactLibrary）全部
// 复用它们：
//   - <LibraryToolbar>：一行 = 右对齐的窄搜索框 + 网格/列表切换。
//   - <LibraryChips>：一排分类 chips（选中态用站点 accent 高亮）。
// 这样「搜索框大小 / 左右留白 / 分类样式 / 间距」三分区天然统一，改一处全同步。
// ============================================================================

import { type Dispatch, type ReactNode, type SetStateAction } from "react";

type TT = (s: string, vars?: Record<string, string | number>) => string;

export interface LibraryToolbarProps {
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  view: "grid" | "list";
  setView: Dispatch<SetStateAction<"grid" | "list">>;
  placeholder: string;
  tt: TT;
  actions?: ReactNode;
}

/**
 * 统一「搜索行」：右对齐的窄搜索框 + 网格/列表切换。三分区共用 → 搜索框大小/位置一致。
 * 搜索框固定窄宽（w-40），左侧留白由外层容器 padding 决定
 * （右栏统一 p-4），因此三分区左右留白也一致。
 */
export function LibraryToolbar({
  search,
  setSearch,
  view,
  setView,
  placeholder,
  tt,
  actions,
}: LibraryToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actions}
      <div className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border border-[var(--border,#e5e7eb)] bg-[var(--card,#fff)] px-3 py-1.5 text-[var(--fg,#292524)] transition focus-within:border-[var(--border-strong,#a3a3a3)] focus-within:shadow-sm sm:max-w-64">
        <svg
          className="h-3.5 w-3.5 shrink-0 text-[var(--muted,#a3a3a3)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--muted,#a3a3a3)]"
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="shrink-0 text-[var(--muted,#a3a3a3)] transition hover:text-[var(--fg-2,#525252)]"
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center rounded-lg bg-[var(--surface,#f5f5f5)] p-0.5">
        <button
          type="button"
          onClick={() => setView("grid")}
          className={`rounded-md p-1.5 transition-all duration-150 ${
            view === "grid"
              ? "bg-[var(--card,#fff)] text-[var(--fg,#404040)] shadow-sm"
              : "text-[var(--muted,#a3a3a3)] hover:text-[var(--fg-2,#525252)]"
          }`}
          title={tt("网格视图")}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setView("list")}
          className={`rounded-md p-1.5 transition-all duration-150 ${
            view === "list"
              ? "bg-[var(--card,#fff)] text-[var(--fg,#404040)] shadow-sm"
              : "text-[var(--muted,#a3a3a3)] hover:text-[var(--fg-2,#525252)]"
          }`}
          title={tt("列表视图")}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export interface LibraryChip {
  id: string;
  label: string;
}

export interface LibraryChipsProps {
  chips: LibraryChip[];
  active: string;
  onChange: (id: string) => void;
  accent?: string;
  tt: TT;
  className?: string;
  trailing?: ReactNode;
}

/** 统一「分类 chips 行」：选中态用站点 accent 填充。三分区共用 → 分类样式一致。 */
export function LibraryChips({
  chips,
  active,
  onChange,
  accent = "#4f46e5",
  tt,
  className = "mt-4",
  trailing,
}: LibraryChipsProps) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {chips.map((c) => {
        const on = active === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              on
                ? "font-medium text-white"
                : "bg-[var(--surface,#f5f5f4)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#e7e5e4)]"
            }`}
            style={on ? { background: accent } : undefined}
          >
            {tt(c.label)}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}
