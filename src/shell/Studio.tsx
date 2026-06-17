"use client";

// ============================================================================
// @oceanleo/ui — 统一「三栏工作台」模板（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-17 定稿：所有 *.oceanleo.com 站的「实际功能页」统一长这样
// （= image.oceanleo.com 的版式，操作员认可的比例）：
//
//   ┌──────────┬─────────────────────┬────────────────────────────┐
//   │ 侧边栏    │ 中：操作区           │ 右：结果 / 素材查看区        │
//   │(AppShell) │ (StudioOps)          │ (StudioCanvas / ResultCanvas)│
//   │ 每站不同  │ 每个功能不同         │ 结果 + 素材库 + 我的数据库   │
//   └──────────┴─────────────────────┴────────────────────────────┘
//
// 侧边栏由 AppShell 提供。本组件负责中 + 右两栏的统一骨架：
//   - 固定视口高度（减去 header 56px），左右两列各自独立滚动；
//   - 中列固定宽（默认 380px），右列自适应填满；
//   - 中列内容 = 若干 StudioSection（= 原 image 的 CollapsibleSection，可折叠）
//     + 底部主行动按钮；右列内容 = 业务自填（通常用 ResultCanvas）。
//
// 与 image 原实现的差异：抽成与站点无关、accent 可配（不写死 indigo）。
// ============================================================================

import type { ReactNode } from "react";

export interface StudioProps {
  /** 左侧操作列内容（通常是若干 <StudioSection> + 底部主按钮）。 */
  ops: ReactNode;
  /** 右侧结果/素材列内容（通常是 <ResultCanvas>）。 */
  canvas: ReactNode;
  /** 操作列宽度（px），默认 380。 */
  opsWidth?: number;
  /** 顶部 header 高度（px），用于算可视高度，默认 56（= AppShell header）。 */
  headerHeight?: number;
  className?: string;
}

export function Studio({
  ops,
  canvas,
  opsWidth = 380,
  headerHeight = 56,
  className = "",
}: StudioProps) {
  return (
    <div
      className={`flex gap-4 px-4 py-4 ${className}`}
      style={{ height: `calc(100dvh - ${headerHeight}px)` }}
    >
      {/* 中：操作区（独立滚动） */}
      <div
        className="shrink-0 space-y-3 overflow-y-auto pr-1"
        style={{ width: opsWidth }}
      >
        {ops}
      </div>
      {/* 右：结果 / 素材（独立滚动，填满剩余宽度） */}
      <div className="flex min-w-0 flex-1 flex-col">{canvas}</div>
    </div>
  );
}
