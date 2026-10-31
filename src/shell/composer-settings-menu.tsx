"use client";

// 输入框右侧的「agent 设置」药丸（2026-10-31 晚 W7，operator 要点 12）。
// 药丸只显示模型名（如 `Opus 5.5`）；点开是这个 agent 真实支持的几行设置
// （`模型  Opus 5.5`、`推理强度  High`、`权限模式  自动接受改动`、`快速模式  关`），
// 点某一行在菜单右侧弹出一张卡片列出可选值，选中即切换并关闭。Codex / Hermes /
// Claude Code / Cursor 与 OceanLeo（云端 Leo）共用这一个组件：行从各自的数据来
// （ACP 会话的 models / config options / modes，Leo 的模型组合），这里不写死任何项。
// 视觉沿用 ModelGroupPicker 紧凑态的药丸与弹层 class，不是新视觉体系。

// 2026-10-31 夜：输入框下的齿轮「设置」与右栏设置面板删除，电脑对话的全部设置并进这
// 个菜单：行可以带分组小标题（本对话 / 这台电脑上的 <程序> / 整台电脑）、可以是直接
// 开关的一行（toggle）或一行说明（note），一行的卡片也可以放一段表单（登录 / Key / 安装）。

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
  /** 分组小标题：与上一行不同时画在这一行上方。 */
  section?: string;
  /** `choice`（默认）点开一张卡片；`toggle` 点一下就开 / 关；`note` 只是一行说明。 */
  kind?: "choice" | "toggle" | "note";
  /** 行右侧显示的当前值。 */
  value?: string;
  selected?: string;
  choices?: ComposerSettingChoice[];
  /** 不传 = 只读（行置灰）。 */
  onPick?: (value: string) => void;
  /** 行不可用的原因，显示在名称下方（触屏没有悬停）。 */
  reason?: string;
  /** 名称下方的一行说明（如「下次打开时生效」）。 */
  hint?: string;
  /** toggle 行：当前开关；不传 onToggle = 只读。 */
  checked?: boolean;
  onToggle?: (next: boolean) => void;
  /** 卡片里放在选项下面的内容（登录流程、Key 表单、外观表单…）；有它这一行就能点开。 */
  card?: ReactNode;
  /** 卡片里的选项是动作（登录 / 退出登录…）：选了不关菜单，卡片里接着显示进度。 */
  keepOpen?: boolean;
  attrs?: Record<string, string>;
};

/** 外部要求打开菜单（可选直接打开某一行的卡片），nonce 每次加一。 */
export type ComposerSettingsOpenRequest = { nonce: number; row?: string };

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
  /** 菜单开 / 关时告诉宿主（如第一次打开才去读整台电脑的设置）。 */
  onOpenChange?: (open: boolean) => void;
  openRequest?: ComposerSettingsOpenRequest;
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

/** A row that opens a card: a choice row with a setter, or any row carrying card content. */
function rowOpens(row: ComposerSettingRow): boolean {
  return (row.kind ?? "choice") === "choice" && Boolean(row.onPick || row.card);
}

/** The composer's switch track (same as PluginsPopover's connector toggle). */
function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`relative block h-5 w-9 shrink-0 rounded-full transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${on ? "bg-neutral-900" : "bg-neutral-200"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${on ? "left-4" : "left-0.5"}`} />
    </span>
  );
}

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
  onOpenChange,
  openRequest,
}: ComposerSettingsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  const [side, setSide] = useState<"right" | "left" | undefined>("right");
  const [gap, setGap] = useState(EDGE);

  const subRow = sub ? rows.find((row) => row.id === sub) ?? null : null;
  // Read when the card positions itself: the row exists by then even when the
  // menu and its card open in the same render (a host request).
  const subId = useRef(sub);
  subId.current = sub;
  const subAnchor = useMemo(() => ({
    get current(): HTMLElement | null { return subId.current ? rowRefs.current.get(subId.current) ?? null : null; },
  }), []);

  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => { onOpenChangeRef.current?.(open); }, [open]);

  // A request from the host (a send held back by sign-in opens the account card).
  // Requests made before this menu mounted are not replayed.
  const handledRequest = useRef(openRequest?.nonce ?? 0);
  useEffect(() => {
    if (!openRequest || openRequest.nonce <= handledRequest.current || loading || disabled) return;
    handledRequest.current = openRequest.nonce;
    setOpen(true);
    if (openRequest.row && rows.some((row) => row.id === openRequest.row && rowOpens(row))) setSub(openRequest.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce, loading, disabled]);

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
    if (!rowOpens(row)) return;
    setSub((current) => (current === row.id ? null : row.id));
  }

  function onRowKey(event: KeyboardEvent<HTMLButtonElement>, row: ComposerSettingRow) {
    const opens = side === "left" ? "ArrowLeft" : "ArrowRight";
    if (event.key === opens && rowOpens(row)) {
      event.preventDefault();
      setSub(row.id);
    }
  }

  function onSubKey(event: KeyboardEvent<HTMLDivElement>) {
    const back = side === "left" ? "ArrowRight" : "ArrowLeft";
    if (event.key !== back || !sub) return;
    // Arrow keys inside a form field move the caret, not the focus.
    if ((event.target as HTMLElement).closest?.("input, textarea, select")) return;
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
          {rows.map((row, index) => {
            const kind = row.kind ?? "choice";
            const heading = row.section && row.section !== rows[index - 1]?.section ? (
              <div
                role="presentation"
                className={`px-2.5 pb-1 text-[11px] font-medium text-neutral-400 ${index > 0 ? "mt-1 border-t border-neutral-100 pt-2" : "pt-1"}`}
                data-composer-settings-section=""
              >
                {row.section}
              </div>
            ) : null;
            const note = row.reason || row.hint;
            const noteLine = note ? (
              <span className="block text-[10px] leading-snug text-neutral-400" {...(row.reason ? { "data-composer-setting-reason": "" } : { "data-composer-setting-hint": "" })}>{note}</span>
            ) : null;
            if (kind === "note") {
              return (
                <Fragment key={row.id}>
                  {heading}
                  <p role="none" className="px-2.5 py-1 text-[11px] leading-snug text-neutral-500" data-composer-setting-row={row.id} data-composer-setting-note="" {...row.attrs}>
                    {row.label}
                  </p>
                </Fragment>
              );
            }
            if (kind === "toggle") {
              const readOnly = !row.onToggle;
              const checked = row.checked === true;
              return (
                <Fragment key={row.id}>
                  {heading}
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    aria-disabled={readOnly || undefined}
                    disabled={readOnly}
                    title={row.reason || row.label}
                    onClick={() => row.onToggle?.(!checked)}
                    onMouseEnter={() => { if (sub) setSub(null); }}
                    className={`${ROW} hover:bg-neutral-100 focus-visible:bg-neutral-100`}
                    data-composer-setting-row={row.id}
                    data-composer-setting-toggle={checked ? "on" : "off"}
                    {...row.attrs}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-neutral-700">{row.label}</span>
                      {noteLine}
                    </span>
                    <SwitchTrack on={checked} />
                  </button>
                </Fragment>
              );
            }
            const active = sub === row.id;
            const readOnly = !rowOpens(row);
            return (
              <Fragment key={row.id}>
                {heading}
                <button
                  ref={(node) => { if (node) rowRefs.current.set(row.id, node); else rowRefs.current.delete(row.id); }}
                  type="button"
                  role="menuitem"
                  aria-haspopup={readOnly ? undefined : row.card || row.keepOpen ? "dialog" : "listbox"}
                  aria-expanded={readOnly ? undefined : active}
                  aria-disabled={readOnly || undefined}
                  disabled={readOnly}
                  title={row.reason || (row.value ? `${row.label} · ${row.value}` : row.label)}
                  onClick={() => openRow(row)}
                  onMouseEnter={() => { if (sub && sub !== row.id && !readOnly) setSub(row.id); }}
                  onKeyDown={(event) => onRowKey(event, row)}
                  className={`${ROW} ${active ? "bg-neutral-100" : "hover:bg-neutral-100 focus-visible:bg-neutral-100"}`}
                  data-composer-setting-row={row.id}
                  {...row.attrs}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-neutral-700">{row.label}</span>
                    {noteLine}
                  </span>
                  <span className="max-w-[55%] shrink-0 truncate font-medium text-neutral-900" data-composer-setting-value="">{row.value}</span>
                  {readOnly ? null : <span aria-hidden="true" className="shrink-0 text-neutral-400">›</span>}
                </button>
              </Fragment>
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
          role={subRow?.card || subRow?.keepOpen ? "dialog" : "listbox"}
          // A card with a form is a non-modal panel: no focus trap, the page keeps scrolling.
          trapFocus={false}
          lockScroll={false}
          ariaLabel={subRow?.label}
          className={`z-[60] flex ${subRow?.card ? "w-[min(18rem,86vw)]" : "w-[min(15rem,80vw)]"} flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-xl`}
          attributes={{ "data-composer-settings-card": subRow?.id ?? "" }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]" onKeyDown={onSubKey}>
            {subRow?.choices?.map((choice) => {
              // Action choices (sign in, sign out, …) are plain buttons that keep the card open.
              const action = subRow.keepOpen === true;
              const selected = !action && choice.value === subRow.selected;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role={action ? undefined : "option"}
                  aria-selected={action ? undefined : selected}
                  disabled={choice.disabled}
                  title={choice.detail || choice.label}
                  onClick={() => {
                    const pick = subRow.onPick;
                    if (action) { pick?.(choice.value); return; }
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
            {subRow?.card ? <div className={subRow.choices?.length ? "mt-1 border-t border-neutral-100 p-1.5 pt-2" : "p-1.5"} data-composer-settings-card-body="">{subRow.card}</div> : null}
          </div>
        </AnchoredPopover>
      </AnchoredPopover>
    </div>
  );
}
