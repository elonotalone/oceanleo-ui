"use client";

/**
 * 首次请求 settle 之前的素材货架骨架（`01-decisions.md` D5）。
 *
 * 为什么必须是**另一条渲染分支**而不是「空态 + 加载文案」：`WorkspaceLibrary` 在
 * `entries.length === 0` 时一律渲染空态，而空态那句「当前 taxonomy 暂无经授权的公共
 * 素材。」在首帧就出现过——对用户是误导，对排障是噪音。所以未 settle 时呈现层根本
 * 不把货架交给 `WorkspaceLibrary`，改画这个骨架：**一个字的「暂无」都不出现。**
 *
 * 纯展示、无状态，单独成文件是因为 `material-library-view.tsx` 贴着 800 行硬顶。
 */

import type { ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";

const SKELETON_CARDS = 6;

export function MaterialShelfSkeleton({
  toolbar,
  className = "",
  cards = SKELETON_CARDS,
  plain = false,
}: {
  /** 分区轴与次级筛选照常渲染：它们不依赖请求结果，闪掉反而更晃眼。 */
  toolbar?: ReactNode;
  className?: string;
  cards?: number;
  /**
   * 与 `WorkspaceLibrary` 的同名开关逐字同义：整页货架不套白底板。
   * 骨架与货架必须吃同一个值 —— 只改货架的话，底板会在首帧闪一下再消失。
   */
  plain?: boolean;
}) {
  const tt = useUI();
  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        plain ? "bg-transparent" : "bg-[var(--card,#fff)] px-3 pb-3 pt-5"
      } ${className}`}
      data-material-shelf-skeleton="true"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={tt("素材加载中")}
    >
      {toolbar}
      <div className="min-h-0 flex-1 overflow-hidden pt-3">
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
          {Array.from({ length: Math.max(1, cards) }, (_, index) => (
            <div
              key={index}
              data-material-shelf-skeleton-card="true"
              className="overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]"
              aria-hidden="true"
            >
              <div className="aspect-[4/3] animate-pulse bg-[var(--surface,#f5f5f4)]" />
              <div className="p-2.5">
                <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--surface,#f5f5f4)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
