"use client";

// Skills overhaul 2026-10-24 — W09A：卡片网格里的一张卡（UI-DESIGN「卡片网格」）。
// 白底、圆角 16、细边框、padding 24；标题 16 semibold + 右上开关（蓝色开启态）；两行省略描述；
// 分隔细线；底部「徽标 · meta」+ 右侧「…」。整卡可点（Enter / Space），开关与菜单除外。

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { SkillCover } from "./SkillCover";

export interface ConfigItemCardProps {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  toggle?: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string };
  menu?: ReactNode;
  onOpen?: () => void;
  /** `undefined` = 不显示封面；`null` = 占位封面；字符串 = 封面地址。 */
  cover?: string | null;
}

/** 卡片网格：两列（窄屏一列）。 */
export const CONFIG_CARD_GRID_CLASS = "grid grid-cols-1 gap-4 md:grid-cols-2";

export function ConfigToggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  // 仲裁 A-24：可点区 44×44，视觉轨道仍是 40×24；负外边距让它不撑高卡片标题行。
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-config-toggle=""
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className="-my-2.5 -mr-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        data-config-toggle-track=""
        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
          checked ? "bg-blue-600 dark:bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700"
        }`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
            checked ? "translate-x-[19px]" : "translate-x-[3px]"
          }`}
        />
      </span>
    </button>
  );
}

function stop(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

export function ConfigItemCard({ title, description, badge, meta, toggle, menu, onOpen, cover }: ConfigItemCardProps) {
  const clickable = typeof onOpen === "function";
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen?.();
    }
  };
  const hasFooter = badge != null || meta != null || menu != null;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onOpen?.() : undefined}
      onKeyDown={clickable ? onKeyDown : undefined}
      data-config-item-card=""
      className={`group flex min-w-0 flex-col rounded-2xl border border-neutral-200 bg-white p-6 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] dark:border-neutral-800 dark:bg-neutral-950 ${
        clickable
          ? "cursor-pointer hover:shadow-[0_4px_18px_rgba(0,0,0,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          : ""
      }`}
    >
      <div className="flex min-w-0 items-start gap-4">
        {cover !== undefined ? <SkillCover src={cover} title={typeof title === "string" ? title : ""} size="sm" /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 truncate text-[16px] font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
              {title}
            </h3>
            {toggle ? (
              <ConfigToggle
                checked={toggle.checked}
                onChange={toggle.onChange}
                disabled={toggle.disabled}
                label={toggle.label}
              />
            ) : null}
          </div>
          {description ? (
            <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {hasFooter ? (
        <>
          <div className="mt-auto pt-5" />
          <div className="border-t border-neutral-200 pt-3.5 dark:border-neutral-800">
            <div className="flex min-h-[28px] items-center justify-between gap-3 text-[12.5px] text-neutral-500 dark:text-neutral-400">
              <div className="flex min-w-0 items-center gap-1.5 truncate">
                {badge}
                {badge != null && meta != null ? <span aria-hidden="true">·</span> : null}
                {meta != null ? <span className="truncate">{meta}</span> : null}
              </div>
              {menu ? (
                <div className="shrink-0" onClick={stop} onKeyDown={stop} data-config-item-menu="">
                  {menu}
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
