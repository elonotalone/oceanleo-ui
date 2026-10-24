"use client";

// Skills overhaul 2026-10-24 — W09A：大弹窗工具条（UI-DESIGN「工具条一行」）。
// 左：方形筛选按钮 + 搜索框（约 320px，左放大镜）；右：次按钮、主按钮（Add ▾）、「…」。

import { useId, type ReactNode } from "react";
import { KitIconSearch } from "./kit-icons";

export interface ConfigToolbarProps {
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  filter?: ReactNode;
  secondary?: ReactNode;
  primary?: ReactNode;
  more?: ReactNode;
}

/** 工具条按钮统一外观：高 44（仲裁 A-24：点击目标 ≥ 44）、圆角 12、白底细边框。给调用方拼「筛选」「…」用。 */
export const CONFIG_TOOLBAR_BUTTON_CLASS =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 text-[14px] font-medium text-neutral-800 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800";

/** 方形图标按钮（筛选、更多）。 */
export const CONFIG_TOOLBAR_ICON_BUTTON_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800";

/** 黑底主按钮。 */
export const CONFIG_PRIMARY_BUTTON_CLASS =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-4 text-[14px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";

export function ConfigToolbar({ search, filter, secondary, primary, more }: ConfigToolbarProps) {
  const searchId = useId();
  return (
    <div className="flex flex-wrap items-center gap-2.5" data-config-toolbar="">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {filter ? <div className="shrink-0">{filter}</div> : null}
        {search ? (
          <div className="relative w-full max-w-[320px] min-w-0">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-400">
              <KitIconSearch className="h-4 w-4" />
            </span>
            <input
              id={searchId}
              type="search"
              value={search.value}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              onChange={(event) => search.onChange(event.target.value)}
              data-config-toolbar-search=""
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-[14px] text-neutral-900 outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] placeholder:text-neutral-400 focus:border-neutral-400 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-500"
            />
          </div>
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
