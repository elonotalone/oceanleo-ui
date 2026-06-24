"use client";

// ============================================================================
// @oceanleo/ui — 统一「应用目录」AppDirectory（单一事实源，doctrine v7 2026-06-24）
// ----------------------------------------------------------------------------
// 操作员要求统一全家桶的「选东西」体验：
//   - 不再把分类塞进左侧窄侧边栏（太挤、难选）。分类**横排在右侧主区顶部**。
//   - 二元分类器：顶部先选「分类方式」= 按行业 / 按内容类型；下面再出对应分类 chips。
//   - 卡片（ce335cef 截图版式）：整块可点开（onOpen），卡片下部一个「加入工作台」
//     按键（onAdd，已加入显示「已在工作台 ✓」）。
//
// 复用处：all-sites（app / skill / 网站）、playground（app / skill）、workspace
// 选择页（app / skill / 网站）。各处只是 items 不同、onOpen/onAdd 行为不同。
// ============================================================================

import { useMemo, useState } from "react";
import {
  classify,
  labelFor,
  optionsFor,
  type TaxonomyMode,
} from "../lib/taxonomy";

export interface DirectoryItem {
  /** 唯一 id（agent_id / site key）。 */
  id: string;
  name: string;
  tagline?: string;
  /** 一句更长的能力说明（卡片正文）。 */
  capabilities?: string;
  /** emoji / 单字 / SVG 节点图标。 */
  icon?: React.ReactNode;
  /** 图标底色（hex / tailwind 渐变都行；传 hex 用作纯色底）。 */
  accent?: string;
  /** 分类维度输入：站 id + 旧分区 id。 */
  site_id?: string;
  category?: string;
  /** 是否已加入工作台（控制「加入工作台」按钮态）。 */
  added?: boolean;
}

export interface AppDirectoryProps {
  items: DirectoryItem[];
  /** 点整张卡片 → 打开 / 体验该条目。 */
  onOpen?: (item: DirectoryItem) => void;
  /** 点「加入工作台」。不传则不显示该按钮（如「网站」分区只跳转、不收藏）。 */
  onAdd?: (item: DirectoryItem) => void;
  /** 正在处理「加入」的条目 id（按钮转圈）。 */
  addingId?: string | null;
  /** 卡片底部「打开」动作的文字，默认「打开」。 */
  openLabel?: string;
  /** 整页强调色。 */
  accent?: string;
  loading?: boolean;
  /** 空态文案。 */
  emptyText?: string;
  /** 顶部右侧自定义插槽（如 AI 推荐搜索框已在外面时留空）。 */
  toolbarExtra?: React.ReactNode;
  /** compact：不渲染分类器工具条 + chips，只渲染卡片网格（用于「推荐」这种小列表）。 */
  compact?: boolean;
}

export function AppDirectory({
  items,
  onOpen,
  onAdd,
  addingId,
  openLabel = "打开",
  accent = "#4f46e5",
  loading = false,
  emptyText = "暂无内容",
  toolbarExtra,
  compact = false,
}: AppDirectoryProps) {
  // 分类方式（行业 / 内容）+ 当前选中分类（"all" = 全部）。
  const [mode, setMode] = useState<TaxonomyMode>("industry");
  const [cat, setCat] = useState<string>("all");
  const [filter, setFilter] = useState("");

  // 当前维度下，每个分类的条目数（只统计实际出现的分类）。
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const id = classify(it, mode);
      m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }, [items, mode]);

  // 当前维度可见的分类 chips（「全部」恒在最前；其余仅显示有条目的）。
  const chips = useMemo(() => {
    const opts = optionsFor(mode);
    return opts.filter((o) => o.id === "all" || (counts.get(o.id) || 0) > 0);
  }, [mode, counts]);

  const normFilter = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (compact) return items;
    return items.filter((it) => {
      if (cat !== "all" && classify(it, mode) !== cat) return false;
      if (!normFilter) return true;
      return (
        it.name.toLowerCase().includes(normFilter) ||
        (it.tagline || "").toLowerCase().includes(normFilter) ||
        (it.capabilities || "").toLowerCase().includes(normFilter)
      );
    });
  }, [items, cat, mode, normFilter, compact]);

  // 切换分类方式时，把选中分类重置回「全部」（避免残留另一维度的 id）。
  function switchMode(next: TaxonomyMode) {
    if (next === mode) return;
    setMode(next);
    setCat("all");
  }

  return (
    <div className="space-y-5">
      {!compact && (
      <>
      {/* ── 顶部工具条：分类方式（行业/内容）二选一 + 关键词筛选 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-stone-100 p-1">
          {([
            { id: "industry", label: "按行业" },
            { id: "content", label: "按内容" },
          ] as const).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => switchMode(m.id)}
              className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition ${
                mode === m.id
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {toolbarExtra}
          <div className="flex items-center gap-2 rounded-xl border border-stone-200/90 bg-white/80 px-3 py-1.5 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-stone-400">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
              <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="按名称筛选…"
              className="w-40 bg-transparent text-[13px] text-stone-800 outline-none placeholder:text-stone-400"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                className="shrink-0 rounded-full px-1.5 text-[12px] text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 分类 chips（横排在右侧主区顶部，替代左侧窄侧栏） ── */}
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const on = c.id === cat;
          const n = c.id === "all" ? items.length : counts.get(c.id) || 0;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                on
                  ? "border-transparent text-white shadow-sm"
                  : "border-stone-200 bg-white/70 text-stone-600 hover:border-stone-300 hover:bg-white"
              }`}
              style={on ? { background: accent } : undefined}
            >
              <span className="text-[14px] leading-none">{c.icon}</span>
              <span>{c.label}</span>
              <span className={`text-[11px] ${on ? "text-white/75" : "text-stone-400"}`}>{n}</span>
            </button>
          );
        })}
      </div>
      </>
      )}

      {/* ── 卡片网格（ce335cef：整块可点开 + 底部「加入工作台」） ── */}
      {loading ? (
        <CardGridSkeleton />
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-stone-400">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((it) => (
            <DirectoryCard
              key={it.id}
              item={it}
              accent={accent}
              openLabel={openLabel}
              onOpen={onOpen}
              onAdd={onAdd}
              adding={addingId === it.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DirectoryCard({
  item,
  accent,
  openLabel,
  onOpen,
  onAdd,
  adding,
}: {
  item: DirectoryItem;
  accent: string;
  openLabel: string;
  onOpen?: (item: DirectoryItem) => void;
  onAdd?: (item: DirectoryItem) => void;
  adding?: boolean;
}) {
  const tileBg = item.accent || accent;
  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(item)}
      onKeyDown={(e) => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen(item);
        }
      }}
      className={`group flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white/85 shadow-sm transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md ${
        onOpen ? "cursor-pointer" : ""
      }`}
    >
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl text-white shadow-sm"
            style={{ background: tileBg }}
          >
            {item.icon || "✦"}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-[14px] font-semibold text-stone-900">{item.name}</p>
            {item.tagline && (
              <p className="mt-0.5 line-clamp-1 text-[12px] text-stone-500">{item.tagline}</p>
            )}
          </div>
        </div>
        {item.capabilities && (
          <p className="mt-2.5 line-clamp-2 flex-1 text-[12px] leading-relaxed text-stone-500">
            {item.capabilities}
          </p>
        )}
      </div>

      {/* 底部一行：「打开 →」+「加入工作台」（onAdd 提供时） */}
      <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2.5">
        <span
          className="inline-flex items-center gap-1 text-[12px] font-medium transition-colors"
          style={{ color: accent }}
        >
          {openLabel}
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {onAdd && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdd(item);
            }}
            disabled={adding}
            className={`rounded-full px-3 py-1 text-[12px] font-medium transition disabled:opacity-50 ${
              item.added
                ? "border border-stone-300 text-stone-500 hover:bg-stone-50"
                : "text-white hover:opacity-90"
            }`}
            style={item.added ? undefined : { background: accent }}
          >
            {adding ? "…" : item.added ? "已在工作台 ✓" : "＋ 加入工作台"}
          </button>
        )}
      </div>
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white/60">
          <div className="flex flex-1 flex-col p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-stone-200/70" />
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-stone-200/70" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-stone-200/50" />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-stone-200/50" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-stone-200/50" />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2.5">
            <div className="h-3 w-12 animate-pulse rounded bg-stone-200/60" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-stone-200/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
