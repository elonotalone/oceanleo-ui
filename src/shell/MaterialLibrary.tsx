"use client";

// ============================================================================
// @oceanleo/ui — 素材库 MaterialLibrary（单一事实源，宗旨 v17，2026-07-07）
// ----------------------------------------------------------------------------
// 操作员 2026-07-07 定义「素材库」= 给用户【启发 / 参考】的成品示例素材，跟「文件库」
// （用户自己产出的文件）与「导航」（点了填进操作台的模板）都不同：
//   · 海报生成 app 的素材库 = 一批【海报】示例图；
//   · 网站生成相关 app 的素材库 = 一批【网站板块】示例图；
//   · 依此类推——各 app 的素材由站点数据（GoalApp.materials）提供。
//
// 版式与「导航 / 文件库」三分区【几乎完全一致】（操作员硬要求）：从上到下 =
//   搜索框（LibraryToolbar，右对齐窄框）→ 分类 chips（LibraryChips，首枚「全部」）→
//   卡片网格 / 列表。
//
// 交互（操作员定的 UI）：点某个素材卡片 → 素材【放大】铺满整个库来查看（本组件内嵌
// 的绝对定位浮层 `absolute inset-0`，恰好占满库区域，不是全屏 modal，也【绝不】把内容
// 写回操作台——素材只是参考，点它不影响左侧输入）。放大态再点「返回 / ✕」回到网格；
// 放大态可左右切换上一张/下一张。
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { LibraryToolbar, LibraryChips } from "./LibraryLayout";

/** 一条素材（启发/参考用的成品示例，如一张海报、一个网站板块）。 */
export interface MaterialItem {
  /** 稳定 id（去重 / key）。 */
  id: string;
  /** 素材标题（卡面 + 放大态显示）。 */
  title: string;
  /** 缩略图 URL（卡片网格用）。 */
  thumb: string;
  /**
   * 放大态大图 URL（不给则回退用 thumb）。素材库放大是「铺满库查看」，建议给更清晰的
   * preview 直链（如 assetPreviewUrl(key)）。
   */
  preview?: string;
  /** 分类（用于顶部 chips 过滤；不给则只在「全部」里出现）。可多个。 */
  categories?: string[];
  /** 一句话说明（放大态副标题 / 卡面副信息，可选）。 */
  desc?: string;
  /** 搜索附加关键词（可选）。 */
  tags?: string[];
}

export interface MaterialLibraryProps {
  /** 本 app 的素材（启发/参考的成品示例）。 */
  materials: MaterialItem[];
  accent?: string;
  /** 空态提示（不给用通用文案）。 */
  emptyHint?: string;
  className?: string;
}

/**
 * 素材库主体：搜索 + 分类 chips + 卡片网格；点卡片放大铺满整个库查看（不写回操作台）。
 * 放进右栏 ResultCanvas 的一个标签即可（`<MaterialLibrary materials={app.materials} />`）。
 */
export function MaterialLibrary({
  materials,
  accent = "#4f46e5",
  emptyHint,
  className = "",
}: MaterialLibraryProps) {
  const tt = useUI();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [cat, setCat] = useState("");
  // 放大查看的素材在 filtered 中的下标（null = 网格态）。
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);

  // 分类 chips：首枚恒为「全部」，其后是素材声明过的分类（保序去重）。
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const m of materials) {
      for (const c of m.categories ?? []) {
        if (!seen.has(c)) {
          seen.add(c);
          cats.push(c);
        }
      }
    }
    return [{ id: "__all", label: "全部" }, ...cats.map((c) => ({ id: c, label: c }))];
  }, [materials]);

  const activeCat = categories.some((c) => c.id === cat) ? cat : "__all";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (activeCat !== "__all" && !(m.categories ?? []).includes(activeCat)) return false;
      if (!q) return true;
      const hay = `${m.title} ${m.desc ?? ""} ${(m.tags ?? []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [materials, activeCat, search]);

  // 过滤条件变化时收起放大态（避免下标错位）。
  useEffect(() => {
    setZoomIdx(null);
  }, [activeCat, search]);

  const zoom = zoomIdx !== null ? filtered[zoomIdx] : null;

  const navigate = useCallback(
    (dir: -1 | 1) => {
      setZoomIdx((idx) => {
        if (idx === null) return idx;
        const next = idx + dir;
        if (next < 0 || next >= filtered.length) return idx;
        return next;
      });
    },
    [filtered.length],
  );

  // 放大态：← → 切换、Esc 关闭。
  useEffect(() => {
    if (zoomIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") navigate(-1);
      else if (e.key === "ArrowRight") navigate(1);
      else if (e.key === "Escape") setZoomIdx(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoomIdx, navigate]);

  return (
    // relative：让「放大铺满库」的浮层用 absolute inset-0 恰好占满本区域。
    <div className={`relative min-h-full ${className}`}>
      {/* 搜索框（右对齐窄框，与导航/文件库同尺寸）+ 网格/列表切换 */}
      <LibraryToolbar
        search={search}
        setSearch={setSearch}
        view={view}
        setView={setView}
        placeholder={tt("搜索素材")}
        tt={tt}
      />

      {/* 分类 chips（首枚「全部」；与导航/文件库共用版式） */}
      {categories.length > 1 && (
        <LibraryChips chips={categories} active={activeCat} onChange={setCat} accent={accent} tt={tt} />
      )}

      {/* 卡片网格 / 列表 */}
      {filtered.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center">
          <svg className="h-10 w-10 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9.5" r="1.8" />
            <path d="M4 17l5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-[13px] text-neutral-400">
            {search ? tt("未找到匹配的素材") : tt("暂无素材")}
          </p>
          {!search && (
            <p className="max-w-xs text-[12px] leading-relaxed text-neutral-400">
              {emptyHint ?? tt("这里会展示与本功能相关的参考素材，给你灵感与方向。")}
            </p>
          )}
        </div>
      ) : view === "list" ? (
        <div className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
          {filtered.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setZoomIdx(i)}
              className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-neutral-50"
            >
              <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-neutral-800">{tt(m.title)}</span>
                {m.desc && <span className="block truncate text-[11px] text-neutral-500">{tt(m.desc)}</span>}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          {filtered.map((m, i) => (
            <MaterialCard key={m.id} m={m} onClick={() => setZoomIdx(i)} tt={tt} />
          ))}
        </div>
      )}

      {/* 放大态：铺满整个库（absolute inset-0）。点「返回」/ ✕ / Esc 关闭；← → 翻看。 */}
      {zoom && (
        // 宗旨 v18.1（操作员 2026-07-07 二次校正「图片下方大片空白」）：整个放大态 = 单个可上下
        // 滚动的容器；标题条 sticky 顶部。图片 `w-full h-auto` 按自然比例铺满宽度、高度顺其自然，
        // **不再**放在一个 flex-1 撑满高度的框里 → 宽图/矮图下方不再露出大片 bg 空白（容器只按
        // 内容高，图片下面紧跟说明或直接到底）。
        <div className="v-scroll absolute inset-0 z-20 overflow-y-auto rounded-xl bg-white">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-100 bg-white/95 px-1 py-2 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setZoomIdx(null)}
              className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-600 transition hover:bg-neutral-50"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {tt("返回")}
            </button>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-800">{tt(zoom.title)}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
              {(zoomIdx ?? 0) + 1} / {filtered.length}
            </span>
          </div>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={zoom.id}
              src={zoom.preview || zoom.thumb}
              alt={tt(zoom.title)}
              className="v-fade-in block w-full h-auto"
            />
            {zoomIdx !== null && zoomIdx > 0 && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label={tt("上一项")}
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow transition hover:bg-white"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {zoomIdx !== null && zoomIdx < filtered.length - 1 && (
              <button
                type="button"
                onClick={() => navigate(1)}
                aria-label={tt("下一项")}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow transition hover:bg-white"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
          {zoom.desc && (
            <p className="border-t border-neutral-100 px-3 py-2 text-[12px] leading-relaxed text-neutral-500">
              {tt(zoom.desc)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MaterialCard({
  m,
  onClick,
  tt,
}: {
  m: MaterialItem;
  onClick: () => void;
  tt: (s: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative block overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
    >
      <span className="relative block w-full overflow-hidden bg-neutral-100" style={{ aspectRatio: "3 / 4" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={m.thumb}
          alt={tt(m.title)}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/25 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
          <span className="rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
            {tt("放大查看")}
          </span>
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-[13px] font-medium text-neutral-800">{tt(m.title)}</span>
        {m.desc && <span className="line-clamp-1 text-[11px] leading-relaxed text-neutral-500">{tt(m.desc)}</span>}
      </span>
    </button>
  );
}
