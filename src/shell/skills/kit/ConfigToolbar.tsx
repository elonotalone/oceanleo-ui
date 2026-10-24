"use client";

// Skills overhaul 2026-10-24 — W09A：大弹窗工具条（UI-DESIGN「工具条一行」）。
// 左：方形筛选按钮 + 搜索框（约 320px，左放大镜）；右：次按钮、主按钮（Add ▾）、「…」。

import { useId, type ReactNode } from "react";
import { CollectionSearchField, COLLECTION_ACTION_BTN_GHOST, COLLECTION_ACTION_BTN_PRIMARY } from "../../collection-chrome";

export interface ConfigToolbarProps {
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  filter?: ReactNode;
  secondary?: ReactNode;
  primary?: ReactNode;
  more?: ReactNode;
}

/** Reuse the collection page action styles; the transparent surround preserves 44px targets. */
export const CONFIG_TOOLBAR_BUTTON_CLASS =
  `${COLLECTION_ACTION_BTN_GHOST} relative gap-1.5 before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50`;

/** 方形图标按钮（筛选、更多）。 */
export const CONFIG_TOOLBAR_ICON_BUTTON_CLASS =
  "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 before:absolute before:-inset-1 before:content-[''] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800";

/** 黑底主按钮。 */
export const CONFIG_PRIMARY_BUTTON_CLASS =
  `${COLLECTION_ACTION_BTN_PRIMARY} relative gap-1.5 before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50`;

export function ConfigToolbar({ search, filter, secondary, primary, more }: ConfigToolbarProps) {
  const searchId = useId();
  return (
    <div className="flex flex-wrap items-center gap-2.5" data-config-toolbar="">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {filter ? <div className="shrink-0">{filter}</div> : null}
        {search ? (
          <label htmlFor={searchId} className="flex min-h-11 min-w-0 max-w-full items-center overflow-visible [&_input]:max-w-full" data-config-toolbar-search="">
            <CollectionSearchField
              id={searchId}
              value={search.value}
              placeholder={search.placeholder}
              onChange={search.onChange}
            />
          </label>
        ) : null}
      </div>
      {secondary || primary || more ? (
        <div className="flex shrink-0 items-center gap-2.5">
          {secondary}
          {primary}
          {more}
        </div>
      ) : null}
    </div>
  );
}
