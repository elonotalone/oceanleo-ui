"use client";

import type { ChunkErrorProps } from "../../lib/lazy-with-retry";
import { useUI } from "../../i18n/ui/useUI";
import { EDIT_BAR_HEIGHT_PX } from "../edit-bar-surface";
import { PLUGIN_CHROME_HEADER_H } from "../plugin-chrome/tokens";

export function WorkbenchRouteLoading() {
  const tt = useUI();
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={tt("正在打开")}
      aria-live="polite"
      data-workbench-route-loading
      data-workbench-skeleton
      className="flex h-full min-h-[18rem] w-full flex-col bg-[var(--pchrome-canvas,var(--surface,#f5f5f4))] text-[var(--pchrome-ink,var(--fg,#292524))]"
    >
      <div
        data-workbench-skeleton-header
        className={`shrink-0 ${PLUGIN_CHROME_HEADER_H} border-b border-[var(--pchrome-line,var(--border,#e7e5e4))] bg-[var(--pchrome-surface,var(--awb-chrome-bg,var(--card,#fff)))]`}
      />
      <div
        data-workbench-skeleton-edit-bar
        className="shrink-0 border-b border-[var(--pchrome-line,var(--border,#e7e5e4))] bg-[var(--pchrome-surface,var(--awb-chrome-bg,var(--card,#fff)))]"
        style={{ height: EDIT_BAR_HEIGHT_PX }}
      />
      <div
        data-workbench-skeleton-stage
        className="flex min-h-0 flex-1 items-start bg-[var(--pchrome-stage,var(--awb-stage-bg,var(--surface,#f5f5f4)))]"
      >
        <div className="grid min-h-0 flex-1 place-items-center text-[var(--pchrome-ink-mid,var(--muted,#78716c))]">
          <span className="inline-flex items-center gap-2 text-[11px]">
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current"
            />
            {tt("正在打开")}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Download failures retain the editor loading surface while the loader recovers. */
export function WorkbenchRouteChunkError(_props: ChunkErrorProps) {
  return <WorkbenchRouteLoading />;
}
