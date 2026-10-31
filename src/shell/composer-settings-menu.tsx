"use client";

// 输入框右侧的「agent 设置」药丸（2026-10-31 晚 W7，operator 要点 12）。
// 药丸只显示模型名（如 `Opus 5.5`）；点开是这个 agent 真实支持的几行设置
// （`模型  Opus 5.5`、`推理强度  High`、`权限模式  自动接受改动`、`快速模式  关`），
// 点某一行在菜单右侧弹出一张卡片列出可选值，选中即切换并关闭。Codex / Hermes /
// Claude Code / Cursor 与 OceanLeo（云端 Leo）共用这一个组件：行从各自的数据来
// （ACP 会话的 models / config options / modes，Leo 的模型组合），这里不写死任何项。
// 视觉沿用 ModelGroupPicker 紧凑态的药丸与弹层 class，不是新视觉体系。

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnchoredPopover } from "./anchored-popover";
import { IconCheck, IconChevronDown } from "./icons";

export type ComposerSettingChoice = {
  value: string;
  label: string;
  /** 一行简短说明（模型的供应商 / 不可用原因 / 组合说明）。 */
  detail?: string;
  disabled?: boolean;
  attrs?: Record<string, string>;
};

export type ComposerSettingRow = {
  /** 稳定 id：`model` / `effort` / `param:<id>` / `fast` / `mode`。 */
  id: string;
  label: string;
  /** 行右侧显示的当前值。 */
  value: string;
  selected: string;
  choices: ComposerSettingChoice[];
  /** 不传 = 只读（行置灰）。 */
  onPick?: (value: string) => void;
  /** 行不可用的原因，显示在名称下方（触屏没有悬停）。 */
  reason?: string;
};

export type ComposerSettingsMenuProps = {
  /** 药丸文字：只放模型名。 */
  summary: string;
  rows: ComposerSettingRow[];
  ariaLabel: string;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  className?: string;
  /** 菜单底部的附加内容（如「管理模型组合 →」）。 */
  footer?: ReactNode;
  rootAttrs?: Record<string, string>;
  triggerAttrs?: Record<string, string>;
  summaryAttrs?: Record<string, string>;
  popoverAttrs?: Record<string, string | boolean>;
};

/** 弹层最高多少（与 ModelPicker POPOVER_MAX_HEIGHT 一致）。 */
const POPOVER_MAX_HEIGHT = 360;
/** 二级卡片宽度（px），用来判断右侧放不放得下。 */
export const SUBMENU_WIDTH = 240;
const EDGE = 8;

/**
 * 二级卡片放哪一侧：右边放得下放右边，否则左边，两边都放不下交给弹层自己上下摆。
 * 纯函数，便于单测。`menu` 是一级菜单的矩形，`viewportWidth` 是视口宽。
 */
export function submenuSide(menu: { left: number; right: number }, viewportWidth: number, width = SUBMENU_WIDTH): "right" | "left" | undefined {
  if (viewportWidth - menu.right - EDGE >= width + EDGE) return "right";
  if (menu.left - EDGE >= width + EDGE) return "left";
  return undefined;
}

export const SETTINGS_TRIGGER =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:scale-95 disabled:cursor-default disabled:opacity-50";
const TRIGGER_IDLE =
  "border-neutral-200/90 bg-stone-50/80 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900";
const TRIGGER_OPEN = "border-neutral-300 bg-neutral-100 text-neutral-900";
const ROW =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-visible:outline-none disabled:cursor-default disabled:opacity-60";

export function SettingsGlyph() {
  return (
    <svg className="h-3 w-3 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" strokeLinecap="round" />
      <circle cx="8" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="11" cy="17" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ComposerSettingsMenu({
  summary,
  rows,
  ariaLabel,
  loading = false,
  loadingLabel = "",
  disabled = false,
  className = "",
  footer,
  rootAttrs,
  triggerAttrs,
  summaryAttrs,
  popoverAttrs,
}: ComposerSettingsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const subAnchor = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  const [side, setSide] = useState<"right" | "left" | undefined>("right");
  const [gap, setGap] = useState(EDGE);

  const subRow = sub ? rows.find((row) => row.id === sub) ?? null : null;
  subAnchor.current = sub ? rowRefs.current.get(sub) ?? null : null;

  // The card sits beside the menu (not over it): measure where the row ends
  // and which side of the viewport has room.
  useLayoutEffect(() => {
    if (!sub || typeof window === "undefined") return;
    const menu = menuRef.current?.getBoundingClientRect();
    const row = rowRefs.current.get(sub)?.getBoundingClientRect();
    if (!menu || !row) return;
    const next = submenuSide(menu, window.innerWidth);
    setSide(next);
    setGap(next === "left" ? Math.max(EDGE, row.left - menu.left + 4) : Math.max(EDGE, menu.right - row.right + 4));
  }, [sub]);

  function closeAll() {
    setSub(null);
    setOpen(false);
  }

  function openRow(row: ComposerSettingRow) {
    if (!row.onPick) return;
    setSub((current) => (current === row.id ? null : row.id));
  }

  function onRowKey(event: KeyboardEvent<HTMLButtonElement>, row: ComposerSettingRow) {
    const opens = side === "left" ? "ArrowLeft" : "ArrowRight";
    if (event.key === opens && row.onPick) {
      event.preventDefault();
      setSub(row.id);
    }
  }

  function onSubKey(event: KeyboardEvent<HTMLDivElement>) {
    const back = side === "left" ? "ArrowRight" : "ArrowLeft";
    if (event.key !== back || !sub) return;
    event.preventDefault();
    const row = rowRefs.current.get(sub);
    setSub(null);
    row?.focus();
  }

  if (loading) {
    return (
      <div className={className} {...rootAttrs} data-composer-settings="" data-composer-settings-loading="">
        <button type="button" disabled className={`${SETTINGS_TRIGGER} ${TRIGGER_IDLE}`} {...triggerAttrs}>
          <SettingsGlyph />
          <span className="max-w-[140px] truncate">{loadingLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={className} {...rootAttrs} data-composer-settings="">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (open) closeAll(); else setOpen(true); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${ariaLabel} · ${summary}`}
        className={`${SETTINGS_TRIGGER} ${open ? TRIGGER_OPEN : TRIGGER_IDLE}`}
        title={summary}
        {...triggerAttrs}
      >
        <SettingsGlyph />
        <span className="max-w-[160px] truncate" {...summaryAttrs}>{summary}</span>
        <span className={`shrink-0 text-neutral-400 transition-transform duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] ${open ? "rotate-180" : ""}`}>
          <IconChevronDown className="h-3 w-3" />
        </span>
      </button>

      <AnchoredPopover
        open={open && !disabled}
        anchorRef={triggerRef}
        panelRef={menuRef}
        onClose={closeAll}
        align="end"
        preferredPlacement="above"
        maxHeight={POPOVER_MAX_HEIGHT}
        role="menu"
        ariaLabel={ariaLabel}
        className="z-50 flex w-[min(17rem,88vw)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-xl"
        attributes={{ "data-composer-settings-menu": true, ...popoverAttrs }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {rows.map((row) => {
            const active = sub === row.id;
            const readOnly = !row.onPick;
            return (
              <button
                key={row.id}
                ref={(node) => { if (node) rowRefs.current.set(row.id, node); else rowRefs.current.delete(row.id); }}
                type="button"
                role="menuitem"
                aria-haspopup={readOnly ? undefined : "listbox"}
                aria-expanded={readOnly ? undefined : active}
                aria-disabled={readOnly || undefined}
                disabled={readOnly}
                title={row.reason || `${row.label} · ${row.value}`}
                onClick={() => openRow(row)}
                onMouseEnter={() => { if (sub && sub !== row.id && !readOnly) setSub(row.id); }}
                onKeyDown={(event) => onRowKey(event, row)}
                className={`${ROW} ${active ? "bg-neutral-100" : "hover:bg-neutral-100 focus-visible:bg-neutral-100"}`}
                data-composer-setting-row={row.id}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-neutral-700">{row.label}</span>
                  {row.reason ? <span className="block text-[10px] leading-snug text-neutral-400" data-composer-setting-reason="">{row.reason}</span> : null}
                </span>
                <span className="max-w-[55%] shrink-0 truncate font-medium text-neutral-900" data-composer-setting-value="">{row.value}</span>
                {readOnly ? null : <span aria-hidden="true" className="shrink-0 text-neutral-400">›</span>}
              </button>
            );
          })}
        </div>
        {footer ? <div className="mt-1 shrink-0 border-t border-neutral-100 pt-1">{footer}</div> : null}

        <AnchoredPopover
          open={Boolean(open && subRow)}
          anchorRef={subAnchor}
          onClose={(reason) => { setSub(null); if (reason === "outside") setOpen(false); }}
          side={side}
          align="start"
          gap={gap}
          preferredPlacement="above"
          maxHeight={POPOVER_MAX_HEIGHT}
          role="listbox"
          ariaLabel={subRow?.label}
          className="z-[60] flex w-[min(15rem,80vw)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-xl"
          attributes={{ "data-composer-settings-card": subRow?.id ?? "" }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]" onKeyDown={onSubKey}>
            {subRow?.choices.map((choice) => {
              const selected = choice.value === subRow.selected;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={choice.disabled}
                  title={choice.detail || choice.label}
                  onClick={() => {
                    const pick = subRow.onPick;
                    closeAll();
                    if (!selected) pick?.(choice.value);
                  }}
                  className={`${ROW} ${selected ? "bg-neutral-100" : "hover:bg-neutral-100 focus-visible:bg-neutral-100"}`}
                  data-composer-setting-choice={`${subRow.id}:${choice.value}`}
                  {...choice.attrs}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-neutral-900">{choice.label}</span>
                    {choice.detail ? <span className="block text-[10px] leading-snug text-neutral-400">{choice.detail}</span> : null}
                  </span>
                  {selected ? <IconCheck className="h-3.5 w-3.5 shrink-0 text-neutral-900" /> : null}
                </button>
              );
            })}
          </div>
        </AnchoredPopover>
      </AnchoredPopover>
    </div>
  );
}
