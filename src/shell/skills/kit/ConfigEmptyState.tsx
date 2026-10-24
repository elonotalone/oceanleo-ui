"use client";

// Skills overhaul 2026-10-24 — W09A：大弹窗空状态（居中线性图标 + 16px 粗标题 + 14px 灰说明 + 主按钮）。

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
      className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center"
      data-config-empty-state=""
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center text-neutral-400 dark:text-neutral-500">
        {icon ?? <KitIconPuzzle className="h-10 w-10" />}
      </div>
      <h3 className="text-[16px] font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-[420px] text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
