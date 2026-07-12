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

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRightPaneSlot } from "./SplitWorkspace";
import { useFunctionGuide } from "./guide-context";
import { NavigatorGuide } from "./NavigatorGuide";
import { useUI } from "../i18n/ui/useUI";
import { useWorkspaceRuntimeHydration } from "./workspace-runtime-hydration";
import {
  crossSiteLibraryTabs,
  type CrossSiteLibraryTabsOptions,
} from "./library-registry";
import type { MaterialItem } from "./MaterialLibrary";

export interface CanvasTab {
  id: string;
  label: string;
  /** 该标签的主体内容。 */
  content: ReactNode;
}

export interface ResultCanvasProps {
  tabs: CanvasTab[];
  /**
   * 宗旨 v22（操作员 2026-07-12）：跨站【只读】库标签。给了它（非空）→ TabBar 末尾长出
   * 独立圆形「+」，点击展开这些标签。它们与 `tabs` 一样能被选中并渲染 content（切到某个
   * 跨站库就在右栏显示那个库），只是默认折叠、需点「+」才出现在标签条里。全是查看类库，
   * 无输入、不生成。
   *
   * ⚠️ 一般【不需要】自己传这个：ResultCanvas 现在**默认自动注入**跨站只读库（见
   * `crossSiteLibraries`）。只有当你要完全自定义「+」里的标签集时才显式传 `moreTabs`
   * ——传了它就【覆盖】默认注入。 */
  moreTabs?: CanvasTab[];
  /**
   * 宗旨 v22（操作员 2026-07-12「右栏库里没有加号」事故修复，2026-07-13）：**默认开**。
   * ResultCanvas 不再要求每个站点 console 手动传 `moreTabs`——它自己调 crossSiteLibraryTabs
   * 生成默认跨站只读库（图片/PPT/文档/表格/视频/音频/3D/全部文件/收藏/素材），自动排除
   * 本站 `tabs` 里已亮的同类库（按 id / 语义键去重），并接上 `materials` / `onSeeAllMaterials`
   * 给素材库子页面用。于是全家桶 40+ 个自建 <ResultCanvas> 的站【零改动】右栏就有「+」。
   *
   * - `false`  → 关掉「+」（该站不需要跨站只读库）。
   * - `CanvasTab[]` / 显式 `moreTabs` → 覆盖默认，自己指定「+」里的标签。
   * - 省略 / `true` → 默认全量（去重后）。 */
  crossSiteLibraries?: boolean;
  /** 素材库（跨站「+」里的「素材库」子页面）要展示的素材切片。默认空态。 */
  materials?: MaterialItem[];
  /** 素材库「看全部素材 →」跳完整素材总栏目。 */
  onSeeAllMaterials?: () => void;
  /** 传给默认跨站库注入的额外 exclude/only（一般不用；本站已亮库已自动排除）。 */
  crossSiteLibraryOptions?: Pick<CrossSiteLibraryTabsOptions, "exclude" | "only">;
  active: string;
  onChange: (id: string) => void;
  /**
   * @deprecated 宗旨 v16（操作员 2026-07-06）：右栏标签条右侧的提示胶囊（如「点击放大
   * 预览 · 拖拽到左侧才算选用」）已全站删除——标签条上移到右栏标题行、与提示挤在一起
   * 不合适，且该提示信息量低。保留 prop 仅为向后兼容（传了也不再渲染）。 */
  hint?: ReactNode;
  /** 选中标签的强调色，默认中性（白底+灰字）。 */
  accent?: string;
  className?: string;
  /**
   * 「聚焦请求」计数器（宗旨 v16）：宿主每次自增它 → ResultCanvas 离开「导航」首屏、
   * 显示当前受控 `active` 标签。用于「点操作台里的主按钮/引导卡后要把右栏拉到某个生成
   * 资源标签」的场景，即使 `active` 值本身没变（如目标标签恰好等于当前受控值）也强制切走
   * 导航。不传则只有用户点标签或 `active` 值变化才离开导航（既有行为）。 */
  focusNonce?: number;
}

/** 标签条本体（一排 pill）。挂右栏标题位与回退自带头部共用。宗旨 v16：不再渲染右侧
 * 提示胶囊（「点击放大预览 · 拖拽到左侧才算选用」全站删除）。
 *
 * 宗旨 v22（操作员 2026-07-12）：`moreTabs`（跨站只读库）非空时，在这排 pill 的**末尾**
 * 渲染一个**与前面 pill 组不相连**的独立圆形「+」按钮。点击 → 变「−」，右侧行内滑出
 * moreTabs 的 pill（同款）。这些 moreTabs 全是「查看类」库（PPT库/Excel库/画布库/图片库
 * /视频库…），无输入、不生成——生成只在页面左栏操作台。展开态由本组件自管。 */
function TabBar({
  tabs,
  moreTabs,
  active,
  onChange,
}: {
  tabs: CanvasTab[];
  moreTabs?: CanvasTab[];
  active: string;
  onChange: (id: string) => void;
}) {
  const tt = useUI();
  const [expanded, setExpanded] = useState(false);
  const hasMore = Array.isArray(moreTabs) && moreTabs.length > 0;
  // 若当前选中的正是某个 moreTab（如从历史恢复到跨站库标签），自动展开好让它可见。
  useEffect(() => {
    if (hasMore && moreTabs!.some((t) => t.id === active)) setExpanded(true);
  }, [hasMore, moreTabs, active]);

  const pill = (t: CanvasTab) => (
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
  );

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
        {tabs.map(pill)}
      </div>
      {hasMore && (
        <>
          {/* 独立圆形「+」/「−」——与前面 pill 组不相连（gap 拉开 + 圆形描边），一看就特殊。 */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title={expanded ? tt("收起更多库") : tt("更多库（跨站查看）")}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[15px] leading-none transition-colors ${
              expanded
                ? "border-stone-300 bg-stone-200 text-stone-700"
                : "border-stone-300 bg-white text-stone-500 hover:bg-stone-100 hover:text-stone-700"
            }`}
          >
            {expanded ? "−" : "+"}
          </button>
          {/* 展开：滑出其余只读库标签（同款 pill 分组）。 */}
          {expanded && (
            <div className="flex flex-wrap gap-1 rounded-xl bg-stone-100 p-1">
              {moreTabs!.map(pill)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// 使用指南标签的保留 id（宗旨 v12.1）。site tab id 不会撞它（下划线前缀）。
const GUIDE_TAB_ID = "__guide";

export function ResultCanvas({
  tabs,
  moreTabs,
  crossSiteLibraries = true,
  materials,
  onSeeAllMaterials,
  crossSiteLibraryOptions,
  active,
  onChange,
  hint: _hint,
  accent = "#4f46e5",
  className = "",
  focusNonce,
}: ResultCanvasProps) {
  void _hint; // 宗旨 v16：提示胶囊已删除（保留 prop 兼容）。
  const rightSlot = useRightPaneSlot();
  const guideCtx = useFunctionGuide();
  const hasGuide = Boolean(guideCtx?.guide);
  const runtimeHydration = useWorkspaceRuntimeHydration();
  const tabIds = tabs.map((tab) => tab.id).join("\u0000");

  // Shared session metadata owns the actual visible tab (including 导航).
  // Fresh apps still default to 导航; restored sessions prefer the persisted
  // shared tab, then fall back to the site's restored `active` for old snapshots.
  const [selectedTab, setSelectedTab] = useState(
    hasGuide ? GUIDE_TAB_ID : active,
  );
  const prevRuntimeIdentity = useRef(runtimeHydration?.identity);
  useEffect(() => {
    if (runtimeHydration?.identity === prevRuntimeIdentity.current) return;
    prevRuntimeIdentity.current = runtimeHydration?.identity;
    setSelectedTab(hasGuide ? GUIDE_TAB_ID : active);
  }, [runtimeHydration?.identity, hasGuide, active]);

  const prevHasGuide = useRef(hasGuide);
  useEffect(() => {
    if (
      hasGuide &&
      !prevHasGuide.current &&
      !runtimeHydration?.restoredSnapshot &&
      !runtimeHydration?.rightTab
    ) {
      setSelectedTab(GUIDE_TAB_ID);
    }
    if (!hasGuide) {
      setSelectedTab((current) =>
        current === GUIDE_TAB_ID ? active : current,
      );
    }
    prevHasGuide.current = hasGuide;
  }, [
    hasGuide,
    active,
    runtimeHydration?.restoredSnapshot,
    runtimeHydration?.rightTab,
  ]);

  const prevActive = useRef(active);
  const skipRestoredActiveRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runtimeHydration?.restoredSnapshot) return;
    const restored = runtimeHydration.rightTab;
    if (restored === GUIDE_TAB_ID && hasGuide) {
      if (restored !== active && active !== prevActive.current) {
        skipRestoredActiveRef.current = active;
      }
      setSelectedTab(GUIDE_TAB_ID);
      return;
    }
    if (restored && tabs.some((tab) => tab.id === restored)) {
      if (restored !== active && active !== prevActive.current) {
        skipRestoredActiveRef.current = active;
      }
      setSelectedTab(restored);
      return;
    }
    if (restored) {
      // The stored id no longer exists in this app version. Repair it to the
      // visible real tab instead of writing the stale id back forever.
      runtimeHydration.setRightTab(active);
    } else {
      runtimeHydration.setDefaultRightTab(active);
    }
    setSelectedTab(active);
  }, [
    runtimeHydration?.restoredSnapshot,
    runtimeHydration?.rightTab,
    runtimeHydration?.setDefaultRightTab,
    runtimeHydration?.setRightTab,
    hasGuide,
    active,
    tabIds,
  ]);

  // Record the initially visible tab without mutating session state. The save
  // path reads this default only when a real runtime change already warrants a
  // snapshot, so merely opening an app cannot create an empty history item.
  useEffect(() => {
    if (!runtimeHydration || runtimeHydration.restoredSnapshot) return;
    runtimeHydration.setDefaultRightTab(
      hasGuide ? GUIDE_TAB_ID : active,
    );
  }, [
    runtimeHydration?.identity,
    runtimeHydration?.restoredSnapshot,
    runtimeHydration?.setDefaultRightTab,
    hasGuide,
    active,
  ]);

  // 宿主【主动】把受控 active 切到某个真实标签（非首挂载、非指南 id）→ 离开指南首屏，
  // 显示该标签。用于「点了操作台里的主按钮/引导卡后，右栏要跳到对应生成资源标签」
  // （宗旨 v16，word：点『生成大纲』/大纲引导卡 → 右栏库跳到『大纲』标签）。首帧不触发
  // （prevActive 初始 = active），故不破坏「进功能默认停在导航首屏」的既有行为。
  useEffect(() => {
    if (active !== prevActive.current) {
      prevActive.current = active;
      if (skipRestoredActiveRef.current === active) {
        skipRestoredActiveRef.current = null;
        return;
      }
      if (active !== GUIDE_TAB_ID) {
        setSelectedTab(active);
        runtimeHydration?.setRightTab(active);
      }
    }
  }, [active, runtimeHydration]);

  // 「聚焦请求」（focusNonce 自增）→ 强制离开导航首屏、显示当前受控 active（即便 active
  // 值没变，如目标标签恰等于当前受控值）。首帧不触发（prevNonce 初始 = focusNonce）。
  const prevNonce = useRef(focusNonce);
  useEffect(() => {
    if (focusNonce !== prevNonce.current) {
      prevNonce.current = focusNonce;
      if (active !== GUIDE_TAB_ID) {
        setSelectedTab(active);
        runtimeHydration?.setRightTab(active);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  const guideTab: CanvasTab | null = useMemo(
    () =>
      guideCtx?.guide
        ? {
            id: GUIDE_TAB_ID,
            label: "模板",
            content: (
              <NavigatorGuide
                guide={guideCtx.guide}
                accent={accent}
                onUseExample={(ex) => {
                  // 宗旨 v15 决策 E：点导航卡片**不跳页**——只把内容灌进左栏操作台，
                  // 右栏保持在「导航」标签（用户想看结果自己点「结果」）。此前会
                  // setOnGuide(false)+切到结果 tab，被操作员否掉。
                  guideCtx.useExample(ex);
                }}
              />
            ),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guideCtx?.guide, accent, tabs],
  );

  // 可见主标签（guide + 主标签）——始终显示在标签条。
  const primaryTabs = useMemo(
    () => (guideTab ? [guideTab, ...tabs] : tabs),
    [guideTab, tabs],
  );
  // 跨站只读库（默认折叠，点「+」展开）。宗旨 v22（2026-07-13 修「自建 console 没加号」）：
  // 优先用宿主显式传的 moreTabs；否则——除非 crossSiteLibraries===false——**默认自动注入**
  // crossSiteLibraryTabs，并自动排除本站主标签（tabs + guide）里已经覆盖的同类库，避免重复。
  // 于是所有自建 <ResultCanvas> 的站零改动右栏就有「+」。
  const hostTabIds = useMemo(() => tabs.map((t) => t.id), [tabIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const moreTabsSafe = useMemo(() => {
    if (Array.isArray(moreTabs)) return moreTabs;
    if (crossSiteLibraries === false) return [];
    // 本站已亮的库 → 从「+」里排除（按主标签 id 的语义键 + 常见别名）。
    // crossSiteLibraryTabs 的 exclude 同时认 `lib_x` 与语义键 `x`，故直接把主标签 id 丢进去，
    // 并补几个常见别名（files→all、result 非库不影响）。
    const autoExclude = new Set<string>(["material", "all"]);
    for (const id of hostTabIds) {
      autoExclude.add(id);
      if (id === "files") autoExclude.add("all");
      if (id === "material" || id === "materials") autoExclude.add("material");
    }
    return crossSiteLibraryTabs({
      accent,
      materials: materials ?? [],
      onSeeAllMaterials,
      exclude: [...autoExclude, ...(crossSiteLibraryOptions?.exclude ?? [])],
      only: crossSiteLibraryOptions?.only,
    });
  }, [
    moreTabs,
    crossSiteLibraries,
    hostTabIds,
    accent,
    materials,
    onSeeAllMaterials,
    crossSiteLibraryOptions,
  ]);
  // 内容查找集合：主标签 + 跨站只读库。moreTabs 也要在这里，否则从历史恢复到某个跨站库
  // 标签时找不到 content。
  const allTabs = useMemo(
    () => [...primaryTabs, ...moreTabsSafe],
    [primaryTabs, moreTabsSafe],
  );
  const effectiveActive = allTabs.some((tab) => tab.id === selectedTab)
    ? selectedTab
    : active;
  const handleChange = (id: string) => {
    setSelectedTab(id);
    runtimeHydration?.setRightTab(id);
    if (id === GUIDE_TAB_ID) {
      return;
    }
    onChange(id);
  };
  const current = allTabs.find((t) => t.id === effectiveActive) ?? allTabs[0];

  // 在 SplitWorkspace 内：把标签条挂到右栏标题位（去框中框）。卸载时清空。
  const inSplit = rightSlot != null;
  useEffect(() => {
    if (!rightSlot) return;
    rightSlot.setRightLabel(
      <TabBar
        tabs={primaryTabs}
        moreTabs={moreTabsSafe}
        active={effectiveActive}
        onChange={handleChange}
      />,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightSlot, primaryTabs, moreTabsSafe, effectiveActive]);
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
        <TabBar
          tabs={primaryTabs}
          moreTabs={moreTabsSafe}
          active={effectiveActive}
          onChange={handleChange}
        />
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
