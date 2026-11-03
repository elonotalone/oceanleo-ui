"use client";

import type { ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";

/** The sidebar owns loading; its host's home/composer remains visible. */
export function WorkspacePaneSkeleton({ action }: { action?: ReactNode }) {
  const tt = useUI();
  return (
    <div role="status" aria-label={tt("正在打开素材…")} data-workspace-pane-loading
      className="flex h-full min-h-0 flex-col gap-5 bg-[var(--card,#fff)] p-4">
      <span className="sr-only">{tt("正在打开素材…")}</span>
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="v-skeleton h-4 w-2/5 shrink-0 rounded" />
        <div className="v-skeleton aspect-video w-full shrink-0 rounded-xl" />
        <div className="v-skeleton h-3 shrink-0 rounded" style={{ width: "75%" }} />
        <div className="v-skeleton h-3 shrink-0 rounded" style={{ width: "50%" }} />
      </div>
      {action && <div className="shrink-0 text-sm text-[var(--muted,#78716c)]">{action}</div>}
    </div>
  );
}
