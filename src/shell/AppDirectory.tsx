"use client";

// ============================================================================
// @oceanleo/ui — 统一「应用目录」AppDirectory（单一事实源，doctrine v7 2026-06-24）
// ----------------------------------------------------------------------------
// 操作员要求统一全家桶的「选东西」体验：
//   - 不再把分类塞进左侧窄侧边栏（太挤、难选）。分类在页头下一行，和 LeoBay 种类 / 站点同一位置。
//   - 二元分类器：分区、分类方式、类型都是胶囊下拉，不跟搜索挤在同一行。
//
// 卡片版式（2026-10-19）：网格与我的库同一套四列等宽（`CollectionCardGrid`），
// 卡面是 4:3 封面 + 一行标题。点卡片主体 = 直接进该 app 操作台（不先弹模板大卡片）。
// 缩略图取 `capabilityImage`（功能图）；旧的 `thumb` 已废弃且本文件不再读取。
//
// 复用处：all-sites（app / skill / 网站）、playground（app / skill）、workspace
// 选择页（app / skill / 网站）。各处只是 items 不同、onOpen/onAdd 行为不同。
// ============================================================================

import { useMemo, useState, type ReactNode } from "react";
import {
  classify,
  nativeOptions,
  optionsFor,
  type TaxonomyMode,
} from "../lib/taxonomy";
import { brandColorFor, tintOf } from "../lib/brand-color";
import { capabilityImageThumbSrc } from "../lib/app-capability-image";
import { useUI } from "../i18n/ui/useUI";
import {
  CollectionCardGrid,
  CollectionFilterRow,
  CollectionFilterSelect,
  CollectionPageToolbar,
  type CollectionView,
  type CollectionViewOption,
} from "./collection-chrome";

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
   * @deprecated 2026-07-27（W2）：**本组件不再读取它**，缩略图一律走 `capabilityImage`。
   * 字段保留只因 30 个站的 catalog 还在传它，删掉会让未迁移站立刻 typecheck 变红。
   */
  thumb?: string;
  /**
   * 【功能图】缩略图的**原始取值**：裸 OSS key（`cap-app/<siteKey>-<appId>`）或完整 URL，
   * 由 `SiteCatalogConsole` 从 `capabilityImageOf(app)` 透传下来。它**不能**直接进
   * `<img src>`（裸 key 会被当相对路径请求 → 30 站卡片图全 404）；拼链统一由本文件的
   * `capabilityImageThumbSrc()` 完成，对完整 URL 的旧数据原样透传。
   */
  capabilityImage?: string;
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
  /** playground 网站卡：图标不要色底。 */
  plainThumb?: boolean;
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
  /**
   * 页头左侧（Manus 列表页：小标题与搜索同一行）。有值时交给 LibraryToolbar.leading。
   */
  toolbarLeading?: ReactNode;
  /**
   * 搜索行下方、分类 chips 上方。工作台 / Playground 把分区筛选放这里，
   * 这样 DOM 顺序是：标题|搜索 → 分区 CollectionFilterSelect → 分类 chips / 卡片。
   */
  belowToolbar?: ReactNode;
  /** Manus「查看选项」（工作台传「仅看收藏」）。 */
  viewOptions?: CollectionViewOption[];
  /** 为真时只保留 `added` 条目（已加入 / 已收藏）。 */
  favoritesOnly?: boolean;
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

/**
 * 工作台卡 hover 主按钮的文案 key（合同 §0.3）。
 *
 * 这条 key 一度被一句 OpenRouter 操作说明占用（`en` = `Open openrouter.ai/keys and click
 * "Create Key".`，fr/ja/ko 同型），期间本文件退到中性词条「使用」兜底。W3 已在
 * `src/i18n/**`（其独占目录）修正，17 语现在都是通用义，故切回合同原定的「打开」。
 *
 * `tests/app-directory-workspace-card.test.mjs` 钉的是**不变量**——主按钮文案必须 17 语齐备
 * 且译文不是一句话——所以谁再把它接到一条被长句占用的 key 上都会立刻变红。
 */
const OPEN_LABEL_KEY = "打开";

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
  toolbarLeading,
  belowToolbar,
  viewOptions,
  favoritesOnly = false,
  compact = false,
  nativeFirst = false,
  nativeLabel,
  sceneMode = false,
  sceneAllLabel,
  groups,
  groupAllLabel,
}: AppDirectoryProps) {
  const tt = useUI();
  // 合同 §0.3：`openLabel` 重新接线为 hover 浮出 / 触屏常驻的**主按钮文案**。它的落点与
  // 点卡主体完全相同 —— 进该 app 操作台。默认词条见 `OPEN_LABEL_KEY`。
  const openLabelText = openLabel ?? tt(OPEN_LABEL_KEY);
  const emptyTextText = emptyText ?? tt("暂无内容");
  const nativeLabelText = nativeLabel ?? tt("按分类");
  const sceneAllText = sceneAllLabel ?? tt("全部");
  const groupAllText = groupAllLabel ?? tt("全部");
  // 分类方式 + 当前选中分类（"all" = 全部）。nativeFirst 时默认「按分类」（原生 category）。
  const [mode, setMode] = useState<TaxonomyMode>(nativeFirst ? "native" : "industry");
  const [cat, setCat] = useState<string>("all");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<CollectionView>("grid");
  const catalog = useMemo(
    () => (favoritesOnly ? items.filter((it) => it.added) : items),
    [favoritesOnly, items],
  );
  // ── 第一层：能力大板块（宗旨 v21）。groups 存在才启用；"all" = 全部板块 ──
  const groupMode = Boolean(groups && groups.length > 0);
  const [grp, setGrp] = useState<string>("all");

  // 每个大板块的条目数（用于 tab 上的计数）。
  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!groupMode) return m;
    for (const it of catalog) {
      if (it.group) m.set(it.group, (m.get(it.group) || 0) + 1);
    }
    return m;
  }, [catalog, groupMode]);

  // 大板块 tab（「全部」恒在最前；其余按 groups 声明顺序，仅显示有条目的板块）。
  const groupTabs = useMemo(() => {
    if (!groupMode || !groups) return [];
    const withItems = groups.filter((g) => (groupCounts.get(g.id) || 0) > 0);
    return [{ id: "all", label: groupAllText, icon: "✦" }, ...withItems];
  }, [groupMode, groups, groupCounts, groupAllText]);

  // 选了某板块后，卡片与第二层场景 chips 都只在【该板块条目】上计算。
  const groupItems = useMemo(() => {
    if (!groupMode || grp === "all") return catalog;
    return catalog.filter((it) => it.group === grp);
  }, [catalog, groupMode, grp]);

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
    for (const it of catalog) {
      const id = classify(it, mode);
      m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }, [catalog, mode]);

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
    const opts = mode === "native" ? nativeOptions(catalog) : optionsFor(mode);
    return opts.filter((o) => o.id === "all" || (counts.get(o.id) || 0) > 0);
  }, [mode, counts, catalog]);

  const normFilter = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (compact) return catalog;
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
  }, [groupItems, catalog, cat, mode, normFilter, compact, sceneMode]);

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

  const categoryChips = sceneMode ? sceneChips : chips;
  const categoryOptions = categoryChips
    .filter((item) => item.id !== "all")
    .map((item) => ({ value: item.id, label: tt(item.label) }));

  return (
    <div>
      {!compact && (
      <>
      <CollectionPageToolbar
        title={toolbarLeading ?? ""}
        search={filter}
        onSearch={setFilter}
        searchPlaceholder={tt("按名称筛选…")}
        view={view}
        onViewChange={setView}
        viewOptions={viewOptions ?? []}
        extraActions={toolbarExtra}
      />

      <CollectionFilterRow>
        {belowToolbar}
        {!sceneMode && modeTabs.length > 1 ? (
          <CollectionFilterSelect
            label={tt("分类")}
            name="taxonomy"
            value={mode}
            options={modeTabs.map((item) => ({ value: item.id, label: item.label }))}
            onChange={(next) => {
              if (next === "native" || next === "industry" || next === "content") switchMode(next);
            }}
          />
        ) : null}
        {groupMode && groupTabs.length > 1 ? (
          <CollectionFilterSelect
            label={tt("板块")}
            name="group"
            value={grp === "all" ? "" : grp}
            options={groupTabs
              .filter((item) => item.id !== "all")
              .map((item) => ({
                value: item.id,
                label: tt(item.label),
                count: groupCounts.get(item.id),
              }))}
            onChange={(next) => switchGroup(next || "all")}
            allLabel={groupAllText}
            searchable={groupTabs.length > 8}
          />
        ) : null}
        {categoryOptions.length > 0 ? (
          <CollectionFilterSelect
            label={tt("类型")}
            name="category"
            value={cat === "all" ? "" : cat}
            options={categoryOptions}
            onChange={(next) => setCat(next || "all")}
            allLabel={sceneMode ? sceneAllText : tt("全部")}
            searchable={categoryOptions.length > 8}
          />
        ) : null}
      </CollectionFilterRow>
      </>
      )}

      <div className={compact ? undefined : "mt-5"}>
      {loading ? (
        <CardGridSkeleton />
      ) : visible.length === 0 && leadingCards.length === 0 ? (
        <p className="py-12 text-center text-sm text-stone-400">{emptyTextText}</p>
      ) : view === "grid" ? (
        <CollectionCardGrid>
          {[...leadingCards, ...visible].map((it, index) => (
              <DirectoryCard
                key={it.id}
                item={it}
                accent={accent}
                openLabel={openLabelText}
                onOpen={onOpen}
                onAdd={index < leadingCards.length ? undefined : onAdd}
                onDelete={index < leadingCards.length ? undefined : onDelete}
                onPrompt={index < leadingCards.length ? undefined : onPrompt}
                adding={addingId === it.id}
                variant={index < leadingCards.length ? "new" : "default"}
              />
          ))}
        </CollectionCardGrid>
      ) : (
        <div className="space-y-2">
          {[...leadingCards, ...visible].map((it, index) => (
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
          ))}
        </div>
      )}
      </div>
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
  /** 打开动作的无障碍名（默认「打开」）。 */
  openLabel: string;
  onOpen?: (item: DirectoryItem) => void;
  onAdd?: (item: DirectoryItem) => void;
  onDelete?: (item: DirectoryItem) => void;
  onPrompt?: (item: DirectoryItem) => void;
  adding?: boolean;
  variant?: "default" | "new";
}) {
  const tt = useUI();
  const isNew = variant === "new";
  const canDelete = Boolean(onDelete && item.deletable);
  const open = () => onOpen?.(item);
  const image = isNew ? undefined : capabilityImageThumbSrc(item.capabilityImage);
  const iconColor = item.logoColor || item.accent || brandColorFor(item.id || item.name);
  const starred = Boolean(item.added);
  const canStar = !isNew && (Boolean(onAdd) || (canDelete && starred));
  const corners: { key: string; label: string; danger: boolean; path: string; run: () => void }[] = [];
  if (onPrompt && !isNew) {
    corners.push({ key: "prompt", label: tt("查看 / 编辑 prompt"), danger: false, run: () => onPrompt(item),
      path: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" });
  }
  if (canDelete) {
    corners.push({ key: "delete", label: tt("删除"), danger: true, run: () => onDelete?.(item),
      path: "M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13" });
  }
  return (
    <article
      data-collection-card={item.id}
      className={`group relative overflow-hidden rounded-xl border bg-[var(--card,#fff)] text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
        isNew
          ? "border-dashed border-neutral-300"
          : "border-[var(--border,#e7e5e4)] hover:-translate-y-0.5 hover:border-[var(--border-strong,#d6d3d1)] hover:shadow-sm"
      }`}
    >
      <button
        type="button"
        data-collection-card-main=""
        onClick={onOpen ? open : undefined}
        disabled={!onOpen}
        className={`block w-full text-left ${onOpen ? "cursor-pointer" : "cursor-default"}`}
        aria-label={onOpen ? `${openLabel} ${tt(item.name)}` : undefined}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface,#f5f5f4)]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover transition duration-[var(--leo-dur-4)] ease-[var(--leo-ease-standard)] group-hover:scale-[1.02]"
              loading="lazy"
            />
          ) : (
            <span
              className="grid h-full w-full place-items-center text-3xl"
              style={
                item.plainThumb
                  ? { color: iconColor }
                  : { background: tintOf(iconColor, 0.14), color: iconColor }
              }
            >
              {item.icon || "✦"}
            </span>
          )}
        </div>
        <div className="p-2.5">
          <p className="line-clamp-1 text-[12px] font-semibold leading-snug text-[var(--fg,#292524)]">
            {tt(item.name)}
          </p>
        </div>
      </button>
      {(canStar || corners.length > 0) && (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {canStar && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (onAdd) onAdd(item);
                else onDelete?.(item);
              }}
              disabled={adding}
              aria-pressed={starred}
              aria-label={starred ? tt("已在工作台 ✓") : tt("＋ 加入工作台")}
              title={starred ? tt("已在工作台 ✓") : tt("＋ 加入工作台")}
              className={`pointer-events-auto grid h-7 w-7 place-items-center rounded-md bg-white/90 shadow-sm backdrop-blur-sm disabled:opacity-50 ${
                starred ? "text-amber-500" : "text-stone-400 hover:text-amber-500"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {corners.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                c.run();
              }}
              title={c.label}
              aria-label={c.label}
              className={`pointer-events-auto grid h-7 w-7 place-items-center rounded-md bg-white/90 text-stone-400 shadow-sm backdrop-blur-sm ${c.danger ? "hover:bg-rose-50 hover:text-rose-600" : "hover:text-stone-600"}`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={c.path} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </article>
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
  const rowImage = capabilityImageThumbSrc(item.capabilityImage);
  const starred = Boolean(item.added);
  const canDelete = Boolean(onDelete && item.deletable);
  const canStar = Boolean(onAdd) || (canDelete && starred);
  const showDescription = Boolean(item.tagline || item.capabilities);
  const stop =
    (action: (entry: DirectoryItem) => void) =>
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      action(item);
    };
  return (
    <div
      className={`flex w-full flex-wrap items-center rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,#fafaf9)] ${
        onOpen ? "cursor-pointer" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        disabled={!onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left"
        aria-label={onOpen ? tt(item.name) : undefined}
      >
        {rowImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rowImage}
            alt=""
            className="h-12 w-16 shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        ) : (
          <span
            className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--surface,#f5f5f4)] text-xl"
            style={
              item.plainThumb
                ? { color: iconColor }
                : { background: tintOf(iconColor, 0.14), color: iconColor }
            }
          >
            {item.icon || "✦"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-[var(--fg,#292524)]">
            {tt(item.name)}
          </p>
          {showDescription && (
            <p className="mt-0.5 truncate text-[10px] text-[var(--muted,#a8a29e)]">
              {tt(item.tagline || item.capabilities || "")}
            </p>
          )}
        </div>
        {item.badge && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ background: accent }}
          >
            {tt(item.badge)}
          </span>
        )}
        <svg
          className="h-4 w-4 shrink-0 text-[var(--border-strong,#d6d3d1)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="flex shrink-0 items-center gap-1.5 px-2 py-2" onClick={(event) => event.stopPropagation()}>
        {canStar && (
          <button
            type="button"
            disabled={adding}
            onClick={stop(onAdd ?? ((entry) => onDelete?.(entry)))}
            aria-pressed={starred}
            aria-label={starred ? tt("已在工作台 ✓") : tt("＋ 加入工作台")}
            className={`grid h-7 w-7 place-items-center rounded-md ${
              starred ? "text-amber-500" : "text-stone-400 hover:text-amber-500"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {onPrompt && (
          <button
            type="button"
            onClick={stop(onPrompt)}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-500 hover:bg-stone-50"
          >
            {tt("查看 / 编辑 prompt")}
          </button>
        )}
        {canDelete && onAdd && (
          <button
            type="button"
            onClick={stop(onDelete!)}
            className="rounded-lg px-2 py-1.5 text-[11px] text-stone-400 hover:bg-rose-50 hover:text-rose-600"
          >
            {tt("删除")}
          </button>
        )}
      </div>
    </div>
  );
}

/** 骨架屏跟着 Library 4:3 卡，否则加载完会跳版。 */
function CardGridSkeleton() {
  return (
    <CollectionCardGrid>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]"
        >
          <div className="aspect-[4/3] animate-pulse bg-stone-200/70" />
          <div className="p-2.5">
            <div className="h-3 w-2/3 animate-pulse rounded bg-stone-200/70" />
          </div>
        </div>
      ))}
    </CollectionCardGrid>
  );
}
