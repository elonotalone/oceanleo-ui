"use client";

// Skills overhaul 2026-10-24 — 大弹窗空状态（小图标、14px 标题、12px 说明；按钮保留触控尺寸）。

import type { ReactNode } from "react";
import { KitIconPuzzle } from "./kit-icons";

export interface ConfigEmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function ConfigEmptyState({ icon, title, description, action }: ConfigEmptyStateProps) {
  return (
    <div
      className="flex min-h-[240px] flex-col items-center justify-center px-6 py-8 text-center"
      data-config-empty-state=""
    >
      <div className="mb-4 flex h-8 w-8 items-center justify-center text-neutral-400 dark:text-neutral-500">
        {icon ?? <KitIconPuzzle className="h-7 w-7" />}
      </div>
      <h3 className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-[420px] text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
