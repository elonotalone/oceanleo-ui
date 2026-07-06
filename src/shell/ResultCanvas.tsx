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
  /**
   * 「聚焦请求」计数器（宗旨 v16）：宿主每次自增它 → ResultCanvas 离开「导航」首屏、
   * 显示当前受控 `active` 标签。用于「点操作台里的主按钮/引导卡后要把右栏拉到某个生成
   * 资源标签」的场景，即使 `active` 值本身没变（如目标标签恰好等于当前受控值）也强制切走
   * 导航。不传则只有用户点标签或 `active` 值变化才离开导航（既有行为）。 */
  focusNonce?: number;
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

// 使用指南标签的保留 id（宗旨 v12.1）。site tab id 不会撞它（下划线前缀）。
const GUIDE_TAB_ID = "__guide";

export function ResultCanvas({
  tabs,
  active,
  onChange,
  hint,
  accent = "#4f46e5",
  className = "",
  focusNonce,
}: ResultCanvasProps) {
  const rightSlot = useRightPaneSlot();
  const guideCtx = useFunctionGuide();
  const hasGuide = Boolean(guideCtx?.guide);

  // 「使用指南」标签：guide 存在时插到最前，并**默认选中**（右版面首屏 = 导航页）。
  // 用内部 state 记录是否停留在指南标签：首挂载在 guide 存在时为 true；用户点了别的
  // 标签就走站点受控 active。示例点击后（fill）自动跳到站点第一个标签，方便看结果。
  const [onGuide, setOnGuide] = useState(hasGuide);
  // guide 从无到有（切到带指南的功能）时回到指南首屏。
  const prevHasGuide = useRef(hasGuide);
  useEffect(() => {
    if (hasGuide && !prevHasGuide.current) setOnGuide(true);
    if (!hasGuide) setOnGuide(false);
    prevHasGuide.current = hasGuide;
  }, [hasGuide]);

  // 宿主【主动】把受控 active 切到某个真实标签（非首挂载、非指南 id）→ 离开指南首屏，
  // 显示该标签。用于「点了操作台里的主按钮/引导卡后，右栏要跳到对应生成资源标签」
  // （宗旨 v16，word：点『生成大纲』/大纲引导卡 → 右栏库跳到『大纲』标签）。首帧不触发
  // （prevActive 初始 = active），故不破坏「进功能默认停在导航首屏」的既有行为。
  const prevActive = useRef(active);
  useEffect(() => {
    if (active !== prevActive.current) {
      prevActive.current = active;
      if (active !== GUIDE_TAB_ID) setOnGuide(false);
    }
  }, [active]);

  // 「聚焦请求」（focusNonce 自增）→ 强制离开导航首屏、显示当前受控 active（即便 active
  // 值没变，如目标标签恰等于当前受控值）。首帧不触发（prevNonce 初始 = focusNonce）。
  const prevNonce = useRef(focusNonce);
  useEffect(() => {
    if (focusNonce !== prevNonce.current) {
      prevNonce.current = focusNonce;
      if (active !== GUIDE_TAB_ID) setOnGuide(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  const guideTab: CanvasTab | null = useMemo(
    () =>
      guideCtx?.guide
        ? {
            id: GUIDE_TAB_ID,
            label: "导航",
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
  const effectiveActive = onGuide && guideTab ? GUIDE_TAB_ID : active;
  const handleChange = (id: string) => {
    if (id === GUIDE_TAB_ID) {
      setOnGuide(true);
      return;
    }
    setOnGuide(false);
    onChange(id);
  };
  const current = allTabs.find((t) => t.id === effectiveActive) ?? allTabs[0];

  // 在 SplitWorkspace 内：把标签条挂到右栏标题位（去框中框）。卸载时清空。
  const inSplit = rightSlot != null;
  useEffect(() => {
    if (!rightSlot) return;
    rightSlot.setRightLabel(
      <TabBar tabs={allTabs} active={effectiveActive} onChange={handleChange} hint={hint} />,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightSlot, allTabs, effectiveActive, hint]);
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
        <TabBar tabs={allTabs} active={effectiveActive} onChange={handleChange} hint={hint} />
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
