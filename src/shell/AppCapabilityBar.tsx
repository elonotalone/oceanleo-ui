"use client";

// ============================================================================
// @oceanleo/ui — 操控台内部的【工具按键条】
// ----------------------------------------------------------------------------
// 操作员 2026-08-05 裁定（截图第一句）：
//   「最上方的『🗺️ 行程定制方案 地图 地球仪 台账 间隔排程』这一行错误！！
//     不能将这些按键加在最上方，要放在操控台里面。」
//
// 所以这条按键条**长在左栏（操控台）内部**，是操控台正文的第一块，不再跨两栏、
// 不再在双栏之上占一整行，Studio 的可视高度也不再为它扣 40px。
// 本文件此前的头注释写着「操作员裁定要并成一条横条（跨两栏）」——那是旧裁定，
// 已被上面这条推翻，一并删掉，免得下一个人照着它改回去。
//
//   左栏 PaneHeader： [← 返回] [🗺️ 行程定制方案]        [操作台|agent] [库]
//   左栏正文首块：    [地图] [地球仪] [台账] [间隔排程]
//   ——app 身份只在 PaneHeader 上出现一次，按键条里不再重复一枚 app 按钮。
//
// 左栏宽度只有整屏的三成上下，所以按钮**换行排布**而不是横向滚动：一个 app 上的按键
// 最多 6 枚，换行看得全，横向滚动会把后面几枚藏起来。
//
// 按钮文案取模块自己的中文名，名单来自模块自己的 placements 声明。
// 本文件里没有任何站点名、app 名或工具名的硬编码。
// ============================================================================

import type { ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { AppCapabilityEntry } from "./app-capability-entry";

/**
 * @deprecated 按键条已经搬进操控台内部，不再从 Studio 的可视高度里扣任何东西。
 * 常量保留只为不动共享包的导出面（`index.ts` 与 36 个消费站的 import 面）。
 */
export const APP_CAPABILITY_BAR_HEIGHT = 40;

export interface AppCapabilityBarProps {
  /**
   * 可选的「回到 app 自己的流程」按钮文案。`OperatorConsole` **不传**它——app 身份
   * 已经在左栏 PaneHeader 上，按键条里再来一枚就是同一个名字出现两次。
   */
  appLabel?: string;
  appIcon?: ReactNode;
  entries: AppCapabilityEntry[];
  /** 当前选中的工具 id；空串 = 停在 app 自己的流程上。 */
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
      data-console-function-placement="ops"
      className="flex w-full shrink-0 flex-wrap items-center gap-1.5 rounded-xl border border-stone-200/80 bg-white/70 px-2 py-1.5"
    >
      {appLabel != null && appLabel !== "" && (
        <>
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
          <span
            aria-hidden="true"
            className="mx-1 h-4 w-px shrink-0 rounded bg-stone-200"
          />
        </>
      )}
      {entries.map((entry) => {
        const active = entry.id === activeFamily;
        return (
          <button
            key={entry.id}
            type="button"
            data-console-function-kind="capability"
            data-capability-plugin={entry.id}
            aria-pressed={active}
            onClick={() => onSelect(active ? "" : entry.id)}
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

/** 按钮统一的小图标：与操控台里的其它控件拉开视觉差，同时不占用工具自己的名字。 */
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
