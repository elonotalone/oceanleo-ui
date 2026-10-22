"use client";

// 通话里的小菜单（设备小箭头、参与者菜单）：共用 AnchoredPopover（portal 到 body、Esc/点外面关、打开时焦点进第一项）。
// 不用 FloatingMenu：它的层级只收类名，压不过小窗与放大视图；这里层级走行内 style（CALL_MENU_Z）。
// 设备是单选（menuitemradio）、开关是复选（menuitemcheckbox）：上下键在三种菜单项之间都能走，所以自己接管方向键。
import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { AnchoredPopover } from "../../../anchored-popover";
import { IconCheck } from "./icons";
import { CALL_MENU_Z } from "./layout";

const ENABLED = ':not([aria-disabled="true"]):not(:disabled)';
export const CALL_MENU_ITEM_SELECTOR = [
  `[role="menuitem"]${ENABLED}`,
  `[role="menuitemradio"]${ENABLED}`,
  `[role="menuitemcheckbox"]${ENABLED}`,
].join(", ");

const PANEL_CLASS =
  "overflow-y-auto overscroll-contain rounded-xl border border-neutral-200/80 bg-white p-1 text-neutral-900 shadow-[0_8px_32px_rgba(0,0,0,0.14)] dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100";

const ITEM_CLASS =
  "flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] leading-5 outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:cursor-not-allowed disabled:opacity-50";
const ITEM_TONE =
  "text-neutral-800 hover:bg-neutral-100 focus-visible:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-white/10 dark:focus-visible:bg-white/10";
const ITEM_DANGER =
  "text-rose-600 hover:bg-rose-50 focus-visible:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:focus-visible:bg-rose-500/10";

export interface CallMenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose(): void;
  /** 菜单的可读名。 */
  label: string;
  children: ReactNode;
  width?: number;
  placement?: "above" | "below";
}

export function CallMenu({ open, anchorRef, onClose, label, children, width = 264, placement = "above" }: CallMenuProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>(CALL_MENU_ITEM_SELECTOR) ?? [])];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowUp"
            ? index <= 0
              ? items.length - 1
              : index - 1
            : index < 0 || index === items.length - 1
              ? 0
              : index + 1;
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  }

  return (
    <AnchoredPopover
      open={open}
      anchorRef={anchorRef}
      onClose={() => onClose()}
      role="menu"
      ariaLabel={label}
      align="start"
      preferredPlacement={placement}
      initialFocusSelector={CALL_MENU_ITEM_SELECTOR}
      className={PANEL_CLASS}
      style={{ width, zIndex: CALL_MENU_Z }}
      attributes={{ "data-call-menu": label }}
    >
      <div ref={listRef} onKeyDown={moveFocus}>
        {children}
      </div>
    </AnchoredPopover>
  );
}

export function CallMenuItem({
  label,
  onSelect,
  disabled = false,
  danger = false,
  icon,
}: {
  label: string;
  onSelect(): void;
  disabled?: boolean;
  danger?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={`${ITEM_CLASS} ${danger ? ITEM_DANGER : ITEM_TONE}`}
      onClick={() => onSelect()}
    >
      {icon ? <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function CheckSlot({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
      {checked ? <IconCheck size={14} /> : null}
    </span>
  );
}

/** 单选（选哪个麦克风/摄像头/扬声器）。 */
export function CallMenuRadio({ label, checked, onSelect }: { label: string; checked: boolean; onSelect(): void }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className={`${ITEM_CLASS} ${ITEM_TONE}`}
      onClick={() => onSelect()}
    >
      <CheckSlot checked={checked} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/** 开关（显示字幕、仅语音、仅对我静音）。 */
export function CallMenuCheckbox({ label, checked, onSelect }: { label: string; checked: boolean; onSelect(): void }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      className={`${ITEM_CLASS} ${ITEM_TONE}`}
      onClick={() => onSelect()}
    >
      <CheckSlot checked={checked} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/** 一组单选项：组名对读屏可见，视觉上是一行小标题。 */
export function CallMenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div aria-hidden="true" className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      {children}
    </div>
  );
}

export function CallMenuNote({ children }: { children: ReactNode }) {
  return <p className="px-2.5 py-1.5 text-[12px] text-neutral-500 dark:text-neutral-400">{children}</p>;
}

export function CallMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-neutral-100 dark:bg-white/10" />;
}
