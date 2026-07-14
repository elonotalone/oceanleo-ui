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
import { LibraryChips, LibraryToolbar } from "./LibraryLayout";

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
   * 宗旨 v15（操作员 2026-07-05）：卡片顶部配图缩略图 URL（AI 风格素材，来自
   * asset.oceanleo.com）。给了它 → 卡片是「图示卡片」（顶部大图 + 底部标题/简介，
   * 对照稿定式图示目录）；不给 → 回退 emoji tint 图标版式。 */
  thumb?: string;
  /** 卡片右上角小角标（如「热」「新」）。 */
  badge?: string;
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
  /**
   * 宗旨 v21（操作员 2026-07-09）：本条目归属的【能力大板块】（第一层分类，单值）。
   * 与 `scenes`（第二层、情境维度、可多值）正交：`group` 是能力/领域维度（如 image 站的
   * 「图像生成 / 图像处理 / AI 写真 / 矢量图形」）。给 AppDirectory 传 `groups` 时，
   * 顶部渲染第一层大板块 tab，选中某板块后，第二层场景 chips 只统计该板块下的条目。
   * 不给 `group` 的条目归入「全部」板块（在任何板块 tab 下都可见——除非选了具体板块）。
   */
  group?: string;
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
  /**
   * 宗旨 v21（操作员 2026-07-09）：两层分类器的【第一层：能力大板块】。给了它 →
   * 顶部先渲染一排大板块 tab（横排 pill，比场景 chips 更醒目），选中某板块后：
   *   · 卡片只显示该板块下的条目（item.group === 板块 id）；
   *   · 第二层场景 chips 只统计该板块下条目的 scenes（动态收窄）。
   * 「全部」板块 tab 恒在最前，显示所有条目。**必须与 sceneMode 搭配**（第二层用场景）。
   * 不给 groups → 行为与旧版完全一致（仅单层 sceneMode / 二元分类器）。
   * 数据驱动：站点在 app-catalog 里声明 GROUPS 数组，顺序即 tab 顺序。
   */
  groups?: { id: string; label: string; icon?: React.ReactNode }[];
  /** 大板块「全部」tab 的文字，默认「全部」。 */
  groupAllLabel?: string;
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
  groups,
  groupAllLabel,
}: AppDirectoryProps) {
  const tt = useUI();
  // openLabel 仍保留在 props 里（向后兼容旧调用方），但卡片底部已不再渲染「打开」文字
  // 按钮（宗旨 v19，2026-07-08）——整卡可点开即是「打开」。
  void openLabel;
  const emptyTextText = emptyText ?? tt("暂无内容");
  const nativeLabelText = nativeLabel ?? tt("按分类");
  const sceneAllText = sceneAllLabel ?? tt("全部");
  const groupAllText = groupAllLabel ?? tt("全部");
  // 分类方式 + 当前选中分类（"all" = 全部）。nativeFirst 时默认「按分类」（原生 category）。
  const [mode, setMode] = useState<TaxonomyMode>(nativeFirst ? "native" : "industry");
  const [cat, setCat] = useState<string>("all");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  // ── 第一层：能力大板块（宗旨 v21）。groups 存在才启用；"all" = 全部板块 ──
  const groupMode = Boolean(groups && groups.length > 0);
  const [grp, setGrp] = useState<string>("all");

  // 每个大板块的条目数（用于 tab 上的计数）。
  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!groupMode) return m;
    for (const it of items) {
      if (it.group) m.set(it.group, (m.get(it.group) || 0) + 1);
    }
    return m;
  }, [items, groupMode]);

  // 大板块 tab（「全部」恒在最前；其余按 groups 声明顺序，仅显示有条目的板块）。
  const groupTabs = useMemo(() => {
    if (!groupMode || !groups) return [];
    const withItems = groups.filter((g) => (groupCounts.get(g.id) || 0) > 0);
    return [{ id: "all", label: groupAllText, icon: "✦" }, ...withItems];
  }, [groupMode, groups, groupCounts, groupAllText]);

  // 选了某板块后，卡片与第二层场景 chips 都只在【该板块条目】上计算。
  const groupItems = useMemo(() => {
    if (!groupMode || grp === "all") return items;
    return items.filter((it) => it.group === grp);
  }, [items, groupMode, grp]);

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
  // 宗旨 v21：第二层场景只在【当前大板块条目 groupItems】上统计（选了板块即动态收窄）。
  // 每个场景的条目数（一个条目可属多个场景，故都计入各自场景）。
  const sceneCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of groupItems) {
      const list = it.scenes && it.scenes.length ? it.scenes : ["其它"];
      for (const s of list) m.set(s, (m.get(s) || 0) + 1);
    }
    return m;
  }, [groupItems]);
  // 场景 chips：按首次出现顺序（保序，尊重各站在数据里排的场景顺序），「全部」恒在最前。
  const sceneChips = useMemo(() => {
    const seen: string[] = [];
    for (const it of groupItems) {
      const list = it.scenes && it.scenes.length ? it.scenes : ["其它"];
      for (const s of list) if (!seen.includes(s)) seen.push(s);
    }
    return [{ id: "all", label: sceneAllText, icon: "✦" }, ...seen.map((s) => ({ id: s, label: s, icon: "▪" }))];
  }, [groupItems, sceneAllText]);

  // 当前维度可见的分类 chips（「全部」恒在最前；其余仅显示有条目的）。
  // native 维度的可选分类是数据驱动的（从条目集合现算），其余维度用固定枚举。
  const chips = useMemo(() => {
    const opts = mode === "native" ? nativeOptions(items) : optionsFor(mode);
    return opts.filter((o) => o.id === "all" || (counts.get(o.id) || 0) > 0);
  }, [mode, counts, items]);

  const normFilter = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (compact) return items;
    // 宗旨 v21：先按大板块收窄（groupItems），再叠加第二层（场景 / 二元分类）+ 关键词。
    return groupItems.filter((it) => {
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
  }, [groupItems, items, cat, mode, normFilter, compact, sceneMode]);

  // 切换分类方式时，把选中分类重置回「全部」（避免残留另一维度的 id）。
  function switchMode(next: TaxonomyMode) {
    if (next === mode) return;
    setMode(next);
    setCat("all");
  }

  // 切换大板块时，第二层场景重置回「全部」（避免残留上个板块专属场景 id）。
  function switchGroup(next: string) {
    if (next === grp) return;
    setGrp(next);
    setCat("all");
  }

  return (
    <div className="space-y-5">
      {!compact && (
      <>
      {/* ── 第一层：能力大板块 tab（宗旨 v21）。groups 存在才渲染，横排大 pill，最醒目。
          选中某板块 → 卡片 + 第二层场景 chips 都收窄到该板块。 ── */}
      {groupMode && groupTabs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-200/70 pb-3">
          {groupTabs.map((g) => {
            const on = g.id === grp;
            const n = g.id === "all" ? items.length : groupCounts.get(g.id) || 0;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => switchGroup(g.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[14px] font-semibold transition ${
                  on
                    ? "text-white shadow-sm"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200/70 hover:text-stone-800"
                }`}
                style={on ? { background: accent } : undefined}
              >
                {g.icon && <span className="text-[16px] leading-none">{g.icon}</span>}
                <span>{tt(g.label)}</span>
                <span className={`text-[11px] font-normal ${on ? "text-white/75" : "text-stone-400"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── 顶部工具条：分类方式二选一/三选一 + 关键词筛选 ──
          场景模式（宗旨 v14）不显示「按行业/按内容」切换器，横排 chips 直接是场景词。 */}
      <LibraryToolbar
        search={filter}
        setSearch={setFilter}
        view={view}
        setView={setView}
        placeholder={tt("按名称筛选…")}
        tt={tt}
        actions={
          <>
          {!sceneMode && (
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
          {toolbarExtra}
          </>
        }
      />

      {/* ── 分类 chips（横排在右侧主区顶部，替代左侧窄侧栏）──
          场景模式用 sceneChips（各站自定义场景词）；否则用全局二元分类 chips。 */}
      <LibraryChips
        chips={(sceneMode ? sceneChips : chips).map((chip) => ({
          id: chip.id,
          label: chip.label,
        }))}
        active={cat}
        onChange={setCat}
        accent={accent}
        tt={tt}
        className=""
      />
      </>
      )}

      {/* ── 卡片网格（ce335cef：整块可点开 + 底部「加入工作台」） ── */}
      {loading ? (
        <CardGridSkeleton />
      ) : visible.length === 0 && leadingCards.length === 0 ? (
        <p className="py-12 text-center text-sm text-stone-400">{emptyTextText}</p>
      ) : (
        <div
          className={
            view === "grid"
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "space-y-2"
          }
        >
          {[...leadingCards, ...visible].map((it, index) =>
            view === "grid" ? (
              <DirectoryCard
                key={it.id}
                item={it}
                accent={accent}
                onOpen={onOpen}
                onAdd={index < leadingCards.length ? undefined : onAdd}
                onDelete={index < leadingCards.length ? undefined : onDelete}
                onPrompt={index < leadingCards.length ? undefined : onPrompt}
                adding={addingId === it.id}
                variant={index < leadingCards.length ? "new" : "default"}
              />
            ) : (
              <DirectoryListRow
                key={it.id}
                item={it}
                accent={accent}
                onOpen={onOpen}
                onAdd={index < leadingCards.length ? undefined : onAdd}
                onDelete={index < leadingCards.length ? undefined : onDelete}
                onPrompt={index < leadingCards.length ? undefined : onPrompt}
                adding={addingId === it.id}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function DirectoryCard({
  item,
  accent,
  onOpen,
  onAdd,
  onDelete,
  onPrompt,
  adding,
  variant = "default",
}: {
  item: DirectoryItem;
  accent: string;
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
      {/* 宗旨 v15：图示卡片顶部大图（16:10，AI 风格素材）。悬浮轻微放大 + 底部渐隐蒙层。 */}
      {item.thumb && !isNew && (
        <span
          className="relative block w-full overflow-hidden border-b border-stone-100"
          style={{ aspectRatio: "16 / 10", background: iconTintBg }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumb}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {item.badge && (
            <span
              className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
              style={{ background: accent }}
            >
              {tt(item.badge)}
            </span>
          )}
        </span>
      )}
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
      <div className={`flex flex-1 flex-col ${item.thumb && !isNew ? "px-3.5 py-3" : "p-4"}`}>
        {item.thumb && !isNew ? (
          // 图示卡片：顶部已有大图，这里只放标题 + 一句简介（无 icon 方块）。
          <>
            <p className="truncate text-[14px] font-semibold text-stone-900">{tt(item.name)}</p>
            {item.tagline && (
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-stone-500">{tt(item.tagline)}</p>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* 底部一行（宗旨 v19，操作员 2026-07-08）：删除「打开 →」文字按钮——整张卡片本就
          可点开（onOpen），底部再放「打开」冗余且占一行（截图 331d7102）。仅当有
          「加入工作台」(onAdd) 时才渲染底部行（playground / all-sites 用）；成品 app 目录
          不传 onAdd → 不出现底部行，卡片更紧凑。openLabel 保留 prop 兼容但不再单独渲染。 */}
      {onAdd && (
        <div className="flex items-center justify-end border-t border-stone-100 px-4 py-2.5">
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
        </div>
      )}
    </div>
  );
}

function DirectoryListRow({
  item,
  accent,
  onOpen,
  onAdd,
  onDelete,
  onPrompt,
  adding,
}: {
  item: DirectoryItem;
  accent: string;
  onOpen?: (item: DirectoryItem) => void;
  onAdd?: (item: DirectoryItem) => void;
  onDelete?: (item: DirectoryItem) => void;
  onPrompt?: (item: DirectoryItem) => void;
  adding?: boolean;
}) {
  const tt = useUI();
  const iconColor =
    item.logoColor || item.accent || brandColorFor(item.id || item.name);
  const stop =
    (action: (entry: DirectoryItem) => void) =>
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      action(item);
    };
  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(item)}
      onKeyDown={(event) => {
        if (onOpen && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen(item);
        }
      }}
      className={`group flex min-h-20 items-center gap-3 rounded-xl border border-stone-200/80 bg-white/80 p-3 transition hover:border-stone-300 hover:bg-white ${
        onOpen ? "cursor-pointer" : ""
      }`}
    >
      {item.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumb}
          alt=""
          className="h-16 w-24 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-xl"
          style={{ background: tintOf(iconColor, 0.14), color: iconColor }}
        >
          {item.icon || "✦"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-semibold text-stone-900">
            {tt(item.name)}
          </p>
          {item.badge && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
              style={{ background: accent }}
            >
              {tt(item.badge)}
            </span>
          )}
        </div>
        {(item.tagline || item.capabilities) && (
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-stone-500">
            {tt(item.tagline || item.capabilities || "")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {onPrompt && (
          <button
            type="button"
            onClick={stop(onPrompt)}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-500 hover:bg-stone-50"
          >
            {tt("编辑 prompt")}
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            disabled={adding}
            onClick={stop(onAdd)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
              item.added
                ? "border border-stone-200 text-stone-500"
                : "text-white"
            }`}
            style={item.added ? undefined : { background: accent }}
          >
            {adding ? "…" : item.added ? tt("已加入") : tt("加入工作台")}
          </button>
        )}
        {onDelete && item.deletable && (
          <button
            type="button"
            onClick={stop(onDelete)}
            className="rounded-lg px-2 py-1.5 text-[11px] text-stone-400 hover:bg-rose-50 hover:text-rose-600"
          >
            {tt("删除")}
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
