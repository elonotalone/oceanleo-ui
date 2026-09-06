"use client";

import { useUI } from "../../i18n/ui/useUI";
import type { PluginPage } from "./plugin-pages";

export interface PluginPageRowProps {
  pages: readonly PluginPage[];
  activePageId: string;
  onSelectPage(id: string): void;
}

/** 页面行固定高（规范 v2 §3）。页签撑满这一格，行永不长出第二行、永不上下滚。 */
export const PLUGIN_PAGE_ROW_H = 36;

/**
 * 页签**刻意不用** `ui/Button`：原语默认 44px、最小档 36px 且只许在
 * `tests/hit-target-budget.test.mjs` 登记过的文件里用。页面行由规范钉死 36px，
 * 页签高度跟随行（`h-full`），不写死像素，文字 12px 单行不裁。
 */
const TAB_CLASS =
  "inline-flex h-full shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[12px] font-medium leading-none " +
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 " +
  "disabled:pointer-events-none disabled:opacity-40";

const TAB_IDLE_CLASS =
  "border-transparent text-[var(--pchrome-ink-mid,var(--awb-muted,var(--fg-2,#57534e)))] " +
  "hover:bg-[var(--pchrome-muted,var(--awb-hover,rgba(0,0,0,.06)))] " +
  "hover:text-[var(--pchrome-ink,var(--awb-text,var(--fg,#292524)))]";

const TAB_ACTIVE_CLASS =
  "border-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))] " +
  "bg-[var(--pchrome-accent-soft,var(--awb-accent-soft,color-mix(in_srgb,var(--accent,#7c3aed)_12%,transparent)))] " +
  "text-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]";

export function PluginPageRow({
  pages,
  activePageId,
  onSelectPage,
}: PluginPageRowProps) {
  const tt = useUI();
  return (
    <div
      data-plugin-page-row
      role="tablist"
      // 单行、固定高、横向可滚但不露滚动条、纵向绝不滚（scrollHeight <= clientHeight）。
      className="relative z-[2147483647] flex w-full min-w-0 flex-nowrap items-stretch gap-0.5 overflow-x-auto overflow-y-hidden py-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ height: PLUGIN_PAGE_ROW_H, maxHeight: PLUGIN_PAGE_ROW_H }}
    >
      {pages.map((page) => {
        const active = page.id === activePageId;
        const blocked = Boolean(page.unavailableReason);
        const label = tt(page.label);
        const title = page.unavailableReason
          ? `${label}：${page.unavailableReason}`
          : label;
        return (
          <button
            key={page.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-plugin-page={page.id}
            aria-current={active ? "page" : undefined}
            title={title}
            aria-label={title}
            className={`${TAB_CLASS} ${active ? TAB_ACTIVE_CLASS : TAB_IDLE_CLASS}`}
            style={{
              transitionProperty: "background-color, border-color, color",
              transitionDuration: "var(--leo-dur-1)",
              transitionTimingFunction: "var(--leo-ease-standard)",
            }}
            onClick={() => {
              if (blocked) return;
              onSelectPage(page.id);
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
