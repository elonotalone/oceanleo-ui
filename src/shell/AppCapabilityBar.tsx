"use client";

// ============================================================================
// @oceanleo/ui — 操控台【功能按键条】（H 波 W2 产出）
// ----------------------------------------------------------------------------
// 目标形态文档 §7(a)：功能按钮与 app 自己的生成流程**并成一条**，不另起一行。
// 理由（操作员裁定）：用户脑中没有「流程」与「工具」之分，只有「我想干什么」；
// 分成两条会把本方案要消除的那道坎又立回去。
//
//   [本 app 的生成流程] │ [金融计算器] [台账] [换算器] …
//
// ⚠️ 这条按键条**今天不存在**。共享包 2026-06-21 确实有过一条（commit `c96dd28`），
// 但宗旨 v9/v10（`e025e71` / `40a76a6`，2026-06-27/28）改成卡片目录之后，进 app 之后
// 就只剩 PaneHeader 上的「返回 + app 名」了；文件头那几行说「按键条上移到 Studio 之上」
// 的注释一直留到 `c6bc5fe`（2026-07-22）才删掉，是它们让人以为按键条还在。
// 所以本文件是**重装一条**，不是在既有控件上加按钮 —— 但形态仍按 §7(a) 的一条走。
//
// 按钮文案取 L3 族中文名，数据来自 W4 的映射（`app-capability-entry.ts`）。
// 本文件里没有任何站点名、app 名或族名的硬编码（判据 H1-a）。
// ============================================================================

import type { ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { AppCapabilityEntry } from "./app-capability-entry";

/**
 * 按键条占用的竖向高度（px）。`OperatorConsole` 要把它从 Studio 的可视高度里扣掉，
 * 否则「操作台 / 结果」两栏会被顶出一屏（旧按键条当年就是按 56px 扣的）。
 */
export const APP_CAPABILITY_BAR_HEIGHT = 40;

export interface AppCapabilityBarProps {
  /** 左起第一枚按钮的文案 = 当前 app 名（它就是「本 app 的生成流程」）。 */
  appLabel: string;
  appIcon?: ReactNode;
  entries: AppCapabilityEntry[];
  /** 当前选中的族 id；空串 = 停在 app 自己的流程上。 */
  activeFamily: string;
  onSelect: (family: string) => void;
  accent?: string;
}

const BASE_BUTTON =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition";

export function AppCapabilityBar({
  appLabel,
  appIcon,
  entries,
  activeFamily,
  onSelect,
  accent = "#4f46e5",
}: AppCapabilityBarProps) {
  const tt = useUI();
  if (!entries.length) return null;
  const appActive = !activeFamily;
  return (
    <div
      data-console-function-bar
      className="v-scroll-stable flex h-10 w-full shrink-0 items-center gap-1 overflow-x-auto border-b border-stone-200/80 bg-white/80 px-3"
    >
      <button
        type="button"
        data-console-function-kind="app"
        aria-pressed={appActive}
        onClick={() => onSelect("")}
        className={`${BASE_BUTTON} ${
          appActive
            ? "text-white"
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
        }`}
        style={appActive ? { background: accent } : undefined}
        title={appLabel}
      >
        {appIcon != null && (
          <span aria-hidden="true" className="text-[13px] leading-none">
            {appIcon}
          </span>
        )}
        <span className="max-w-[12rem] truncate">{appLabel}</span>
      </button>
      {/* 一条细分隔线：功能按钮与 app 按钮**可区分**即可，不做成两个独立控件组。 */}
      <span
        aria-hidden="true"
        className="mx-1 h-4 w-px shrink-0 rounded bg-stone-200"
      />
      {entries.map((entry) => {
        const active = entry.family === activeFamily;
        return (
          <button
            key={entry.family}
            type="button"
            data-console-function-kind="capability"
            data-capability-family={entry.family}
            data-capability-editor={entry.editorCapability}
            aria-pressed={active}
            onClick={() => onSelect(active ? "" : entry.family)}
            className={`${BASE_BUTTON} border ${
              active
                ? "border-transparent text-white"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900"
            }`}
            style={active ? { background: accent } : undefined}
            title={tt(entry.label)}
          >
            <CapabilityGlyph />
            <span className="max-w-[10rem] truncate">{tt(entry.label)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 功能按钮统一的小图标：与 app 按钮拉开视觉差，同时不占用族自己的名字。 */
function CapabilityGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="h-3 w-3 shrink-0 opacity-70"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16M4 12h10M4 17h7" />
    </svg>
  );
}
