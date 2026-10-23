"use client";

// ============================================================================
// 模式页签（W01，编辑器整改波 2026-10-23，操作员裁定 D1）
// ----------------------------------------------------------------------------
// 原来的第二行页签行整行删除，页签挪进第一行左段，紧跟「素材库 / 我的库」。
// 只有两种以上页面的编辑器才有：PDF / 表格 / 网站 =「编辑 | 专业编辑」，
// 游戏 =「编辑 | Code」。只有一页时什么都不画。
//
// 命中区：按钮 `h-full` 撑满第一行（44px），看得见的胶囊是里面的 span（32px）。
// 不用 `ui/Button`：原语默认 44px 的实心胶囊在一行里太重；这里不写死任何小高度，
// 焦点环补在按钮自己身上（focus-ring 判据看同一个元素的类名串）。
// 暂不可用的页（`unavailableReason`）照样露出、照样能点：点了弹出原因、停在当前页，
// 不置灰、不藏（editor-protocol-types 的页面契约；红线：不放灰占位）。
// ============================================================================

import { useUI } from "../../i18n/ui/useUI";
import { useToast } from "../../ui/Toast";
import type { PluginPage } from "./plugin-pages";

export interface PluginPageTabsProps {
  pages: readonly PluginPage[];
  activePageId: string;
  onSelectPage(id: string): void;
}

const TAB_BUTTON_CLASS =
  "group inline-flex h-full shrink-0 select-none items-center rounded-lg px-0.5 " +
  "outline-none focus-visible:ring-2 focus-visible:ring-inset " +
  "focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45";

const PILL_CLASS =
  "inline-flex h-8 items-center whitespace-nowrap rounded-lg border px-3 text-[12px] font-medium leading-none";

const PILL_IDLE_CLASS =
  "border-transparent text-[var(--pchrome-ink-mid,var(--awb-muted,var(--fg-2,#57534e)))] " +
  "group-hover:bg-[var(--pchrome-muted,var(--awb-hover,rgba(0,0,0,.06)))] " +
  "group-hover:text-[var(--pchrome-ink,var(--awb-text,var(--fg,#292524)))]";

const PILL_ACTIVE_CLASS =
  "border-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))] " +
  "bg-[var(--pchrome-accent-soft,var(--awb-accent-soft,color-mix(in_srgb,var(--accent,#7c3aed)_12%,transparent)))] " +
  "text-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]";

export function PluginPageTabs({
  pages,
  activePageId,
  onSelectPage,
}: PluginPageTabsProps) {
  const tt = useUI();
  const toast = useToast();
  if (pages.length < 2) return null;
  return (
    <div
      data-plugin-page-tabs
      role="tablist"
      aria-label={tt("编辑模式")}
      className="flex h-full min-w-0 shrink-0 flex-nowrap items-stretch gap-0.5"
    >
      {pages.map((page) => {
        const active = page.id === activePageId;
        const blocked = Boolean(page.disabled || page.unavailableReason);
        const reason = page.unavailableReason ? tt(page.unavailableReason) : "";
        const label = tt(page.label);
        const title = reason ? `${label}：${reason}` : label;
        return (
          <button
            key={page.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            aria-label={title}
            aria-disabled={blocked || undefined}
            data-plugin-page={page.id}
            data-plugin-page-blocked={blocked || undefined}
            title={title}
            className={TAB_BUTTON_CLASS}
            onClick={() => {
              if (blocked) {
                if (reason) toast.info(title);
                return;
              }
              onSelectPage(page.id);
            }}
          >
            <span
              className={`${PILL_CLASS} ${active ? PILL_ACTIVE_CLASS : PILL_IDLE_CLASS}`}
              style={{
                transitionProperty: "background-color, border-color, color",
                transitionDuration: "var(--leo-dur-1)",
                transitionTimingFunction: "var(--leo-ease-standard)",
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
