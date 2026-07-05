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
  nativeOptions,
  optionsFor,
  type TaxonomyMode,
} from "../lib/taxonomy";
import { brandColorFor, tintOf } from "../lib/brand-color";
import { useUI } from "../i18n/ui/useUI";

export interface DirectoryItem {
  /** 唯一 id（agent_id / site key）。 */
  id: string;
  name: string;
  tagline?: string;
  /** 一句更长的能力说明（卡片正文）。 */
  capabilities?: string;
  /** emoji / 单字 / SVG 节点图标。 */
  icon?: React.ReactNode;
  /**
   * @deprecated 宗旨 v13（2026-07-02）：卡片图标不再用「深色纯色底 + 白图标」。
   * 新版本用 `logoColor`（图标本身颜色）+ 自动浅色 tint 底。旧 `accent` 传入时会
   * 作为 `logoColor` 的回退值（等价语义），保留字段仅为向后兼容。
   */
  accent?: string;
  /**
   * 宗旨 v13：卡片图标颜色（hex）。传了它 → 图标浅色 tint 底 + 该色 SVG 图标；
   * 不传 → brandColorFor(id) 稳定选一色。像 OceanLeo 侧边栏 logo 那样的观感。
   */
  logoColor?: string;
  /** 分类维度输入：站 id + 旧分区 id。 */
  site_id?: string;
  category?: string;
  /**
   * 宗旨 v14（操作员 2026-07-05）：本条目归属的【场景分类】（各站自定义，可多选）。
   * 给 AppDirectory 传 `scenes` 模式时，用它出横排分类 chips（替代全局二元分类器）。
   * 一个条目可同时属于多个场景（每个场景 chip 下都会出现它）。
   */
  scenes?: string[];
  /** 是否已加入工作台（控制「加入工作台」按钮态）。 */
  added?: boolean;
  /** 是否可删除（控制卡片右上角「删除」按钮是否出现）。需配合 AppDirectory.onDelete。 */
  deletable?: boolean;
}

export interface AppDirectoryProps {
  items: DirectoryItem[];
  /**
   * 置顶卡片：永远渲染在卡片网格最前，**不受分类 chips / 关键词筛选影响**。
   * 用于 agent / organization / workflow 分区的「＋ 新建」首卡（操作员 2026-06-24）。
   */
  leadingCards?: DirectoryItem[];
  /** 点整张卡片 → 打开 / 体验该条目。 */
  onOpen?: (item: DirectoryItem) => void;
  /** 点「加入工作台」。不传则不显示该按钮（如「网站」分区只跳转、不收藏）。 */
  onAdd?: (item: DirectoryItem) => void;
  /**
   * 点卡片右上角「删除」（仅对 item.deletable 的条目显示）。供 organization /
   * workflow 等「我的项目」目录删除项目用（操作员 2026-06-24）。
   */
  onDelete?: (item: DirectoryItem) => void;
  /**
   * 点卡片右上角「查看 / 编辑 prompt」（操作员 2026-07-02：playground 的 agent 卡片
   * 右上角要有预览 / 编辑 / 保存 prompt 的入口）。提供则每张卡片 hover 时右上角出现
   * prompt 按钮；消费端据此弹 SkillPromptPanel（modal 形态）。
   */
  onPrompt?: (item: DirectoryItem) => void;
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
  /**
   * nativeFirst：把「按分类」（条目自带的原始 category，如 skill 的「技术工程 /
   * 内容创作」18 类）作为**首选且默认**的分类维度，排在「按行业 / 按内容」之前。
   * skill 目录用它——保留作者既定的细粒度分类（操作员 2026-06-24）。
   */
  nativeFirst?: boolean;
  /** 「按分类」维度的标签，默认「按分类」（skill 站可传「按技能」）。 */
  nativeLabel?: string;
  /**
   * 宗旨 v14（操作员 2026-07-05）：场景分类模式。开启后**不再显示「按行业/按内容」
   * 分类方式切换器**，横排 chips 直接是各站自定义的【场景词】（数据驱动，从条目的
   * `scenes[]` 聚合，按首次出现顺序）。一个条目可属多个场景（每个场景 chip 下都出现）。
   * 用于成品 app 目录（image/word/…）：顶部横排 = 面向场景的分类。
   */
  sceneMode?: boolean;
  /** 场景模式下「全部」chip 的文字，默认「全部」。 */
  sceneAllLabel?: string;
}

export function AppDirectory({
  items,
  leadingCards = [],
  onOpen,
  onAdd,
  onDelete,
  onPrompt,
  addingId,
  openLabel,
  accent = "#4f46e5",
  loading = false,
  emptyText,
  toolbarExtra,
  compact = false,
  nativeFirst = false,
  nativeLabel,
  sceneMode = false,
  sceneAllLabel,
}: AppDirectoryProps) {
  const tt = useUI();
  const openLabelText = openLabel ?? tt("打开");
  const emptyTextText = emptyText ?? tt("暂无内容");
  const nativeLabelText = nativeLabel ?? tt("按分类");
  const sceneAllText = sceneAllLabel ?? tt("全部");
  // 分类方式 + 当前选中分类（"all" = 全部）。nativeFirst 时默认「按分类」（原生 category）。
  const [mode, setMode] = useState<TaxonomyMode>(nativeFirst ? "native" : "industry");
  const [cat, setCat] = useState<string>("all");
  const [filter, setFilter] = useState("");

  // 分类方式切换器的选项（nativeFirst 时把「按分类」排首位并默认）。
  const modeTabs = useMemo(
    () =>
      (nativeFirst
        ? ([
            { id: "native", label: nativeLabelText },
            { id: "industry", label: tt("按行业") },
            { id: "content", label: tt("按内容") },
          ] as const)
        : ([
            { id: "industry", label: tt("按行业") },
            { id: "content", label: tt("按内容") },
          ] as const)) as readonly { id: TaxonomyMode; label: string }[],
    [nativeFirst, nativeLabelText, tt],
  );

  // 当前维度下，每个分类的条目数（只统计实际出现的分类）。
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const id = classify(it, mode);
      m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }, [items, mode]);

  // ── 场景模式（宗旨 v14）：横排 chips = 各站自定义场景词（数据驱动，多值） ──
  // 每个场景的条目数（一个条目可属多个场景，故都计入各自场景）。
  const sceneCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const list = it.scenes && it.scenes.length ? it.scenes : ["其它"];
      for (const s of list) m.set(s, (m.get(s) || 0) + 1);
    }
    return m;
  }, [items]);
  // 场景 chips：按首次出现顺序（保序，尊重各站在数据里排的场景顺序），「全部」恒在最前。
  const sceneChips = useMemo(() => {
    const seen: string[] = [];
    for (const it of items) {
      const list = it.scenes && it.scenes.length ? it.scenes : ["其它"];
      for (const s of list) if (!seen.includes(s)) seen.push(s);
    }
    return [{ id: "all", label: sceneAllText, icon: "✦" }, ...seen.map((s) => ({ id: s, label: s, icon: "▪" }))];
  }, [items, sceneAllText]);

  // 当前维度可见的分类 chips（「全部」恒在最前；其余仅显示有条目的）。
  // native 维度的可选分类是数据驱动的（从条目集合现算），其余维度用固定枚举。
  const chips = useMemo(() => {
    const opts = mode === "native" ? nativeOptions(items) : optionsFor(mode);
    return opts.filter((o) => o.id === "all" || (counts.get(o.id) || 0) > 0);
  }, [mode, counts, items]);

  const normFilter = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (compact) return items;
    return items.filter((it) => {
      if (sceneMode) {
        if (cat !== "all") {
          const list = it.scenes && it.scenes.length ? it.scenes : ["其它"];
          if (!list.includes(cat)) return false;
        }
      } else if (cat !== "all" && classify(it, mode) !== cat) {
        return false;
      }
      if (!normFilter) return true;
      return (
        it.name.toLowerCase().includes(normFilter) ||
        (it.tagline || "").toLowerCase().includes(normFilter) ||
        (it.capabilities || "").toLowerCase().includes(normFilter)
      );
    });
  }, [items, cat, mode, normFilter, compact, sceneMode]);

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
      {/* ── 顶部工具条：分类方式二选一/三选一 + 关键词筛选 ──
          场景模式（宗旨 v14）不显示「按行业/按内容」切换器，横排 chips 直接是场景词。 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {sceneMode ? (
          <div />
        ) : (
          <div className="inline-flex rounded-xl bg-stone-100 p-1">
            {modeTabs.map((m) => (
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
                {tt(m.label)}
              </button>
            ))}
          </div>
        )}
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
              placeholder={tt("按名称筛选…")}
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

      {/* ── 分类 chips（横排在右侧主区顶部，替代左侧窄侧栏）──
          场景模式用 sceneChips（各站自定义场景词）；否则用全局二元分类 chips。 */}
      <div className="flex flex-wrap gap-2">
        {(sceneMode ? sceneChips : chips).map((c) => {
          const on = c.id === cat;
          const n = c.id === "all" ? items.length : (sceneMode ? sceneCounts.get(c.id) : counts.get(c.id)) || 0;
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
              <span>{tt(c.label)}</span>
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
      ) : visible.length === 0 && leadingCards.length === 0 ? (
        <p className="py-12 text-center text-sm text-stone-400">{emptyTextText}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {leadingCards.map((it) => (
            <DirectoryCard
              key={it.id}
              item={it}
              accent={accent}
              openLabel={openLabelText}
              onOpen={onOpen}
              adding={addingId === it.id}
              variant="new"
            />
          ))}
          {visible.map((it) => (
            <DirectoryCard
              key={it.id}
              item={it}
              accent={accent}
              openLabel={openLabelText}
              onOpen={onOpen}
              onAdd={onAdd}
              onDelete={onDelete}
              onPrompt={onPrompt}
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
  onDelete,
  onPrompt,
  adding,
  variant = "default",
}: {
  item: DirectoryItem;
  accent: string;
  openLabel: string;
  onOpen?: (item: DirectoryItem) => void;
  onAdd?: (item: DirectoryItem) => void;
  onDelete?: (item: DirectoryItem) => void;
  onPrompt?: (item: DirectoryItem) => void;
  adding?: boolean;
  /** "new" = 「＋ 新建」首卡（虚线描边 + 强调色），视觉上区别于普通条目。 */
  variant?: "default" | "new";
}) {
  const tt = useUI();
  // 宗旨 v13：卡片图标 = 浅色 tint 底 + 彩色 SVG 图标（不再深色底 + 白图标）。
  // 优先级：item.logoColor > item.accent（向后兼容） > brandColorFor(id)（稳定回退）。
  const iconColor = item.logoColor || item.accent || brandColorFor(item.id || item.name);
  const iconTintBg = tintOf(iconColor, 0.14);
  const isNew = variant === "new";
  const canDelete = Boolean(onDelete && item.deletable);
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
      className={`group relative flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        isNew
          ? "border-2 border-dashed bg-white/70 hover:border-solid"
          : "border-stone-200/80 bg-white/85 hover:border-stone-300"
      } ${onOpen ? "cursor-pointer" : ""}`}
      style={isNew ? { borderColor: `${accent}99` } : undefined}
    >
      {(canDelete || (onPrompt && !isNew)) && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
          {onPrompt && !isNew && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrompt(item);
              }}
              className="grid h-7 w-7 place-items-center rounded-lg border border-stone-200 bg-white/90 text-stone-400 opacity-0 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-600 group-hover:opacity-100"
              title={tt("查看 / 编辑 prompt")}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(item);
              }}
              className="grid h-7 w-7 place-items-center rounded-lg border border-stone-200 bg-white/90 text-stone-400 opacity-0 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
              title={tt("删除")}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl shadow-sm ring-1"
            style={{ background: iconTintBg, color: iconColor, boxShadow: `0 1px 0 ${tintOf(iconColor, 0.18)}`, borderColor: tintOf(iconColor, 0.28) }}
          >
            {item.icon || "✦"}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            {/* i18n：站点 functions/agents 配置里的中文 label/tagline 在渲染点过 tt()
                （中文原文=key，词典无命中回退原文——用户自建内容安全）。 */}
            <p className="truncate text-[14px] font-semibold text-stone-900">{tt(item.name)}</p>
            {item.tagline && (
              <p className="mt-0.5 line-clamp-1 text-[12px] text-stone-500">{tt(item.tagline)}</p>
            )}
          </div>
        </div>
        {item.capabilities && (
          <p className="mt-2.5 line-clamp-2 flex-1 text-[12px] leading-relaxed text-stone-500">
            {tt(item.capabilities)}
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
            {adding ? "…" : item.added ? tt("已在工作台 ✓") : tt("＋ 加入工作台")}
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
