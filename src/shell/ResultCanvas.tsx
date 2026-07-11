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
 * 提示胶囊（「点击放大预览 · 拖拽到左侧才算选用」全站删除）。 */
function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: CanvasTab[];
  active: string;
  onChange: (id: string) => void;
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
    </div>
  );
}

// 使用指南标签的保留 id（宗旨 v12.1）。site tab id 不会撞它（下划线前缀）。
const GUIDE_TAB_ID = "__guide";

export function ResultCanvas({
  tabs,
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

  const allTabs = useMemo(
    () => (guideTab ? [guideTab, ...tabs] : tabs),
    [guideTab, tabs],
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
      <TabBar tabs={allTabs} active={effectiveActive} onChange={handleChange} />,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightSlot, allTabs, effectiveActive]);
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
        <TabBar tabs={allTabs} active={effectiveActive} onChange={handleChange} />
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
