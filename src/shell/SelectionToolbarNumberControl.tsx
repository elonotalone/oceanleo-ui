"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { AnchoredPopover } from "./anchored-popover";
import { useEditBarSessionId } from "./edit-bar-selection-session";
import { captureEditBarTextBookmark, restoreEditBarTextBookmark, useEditBarTextStyle,
  EDIT_BAR_FONT_SIZE_PRESETS, type EditBarTextBookmark } from "./selection-toolbar-canon-controls";
import type {
  SelectionControl,
  SelectionControlValue,
} from "./selection-context";
import { EDIT_BAR_TOUCH_EXTEND_CLASS, EDIT_BAR_FIELD_CLASS, EDIT_BAR_INK_CLASS } from "./edit-bar-surface";
import { preserveEditBarSelection } from "./edit-bar-selection-preserve";

function asNumber(value: SelectionControlValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function SelectionToolbarNumberControl({
  control,
  menu,
  iconOnly,
  icon,
  emit,
  forMeasurement = false,
  fontSize = false,
  accent = "var(--awb-accent,#7c3aed)",
}: {
  control: SelectionControl;
  menu: boolean;
  iconOnly: boolean;
  icon: ReactNode;
  emit: (value?: SelectionControlValue) => void;
  forMeasurement?: boolean;
  /** 字号入口一律发 number px；宿主 adapter 负责单位转换。 */
  fontSize?: boolean;
  accent?: string;
}) {
  const composingRef = useRef(false);
  const sessionId = useEditBarSessionId();
  const inherited = useEditBarTextStyle(forMeasurement || !fontSize);
  const bookmarkRef = useRef<EditBarTextBookmark | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const keyboardOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const listboxId = `edit-bar-font-size-${useId().replace(/:/g, "")}`;
  const legacySize = typeof control.value === "string" ? Number.parseFloat(control.value) : NaN;
  const mixed = fontSize && (control.value === null || control.value === "mixed" || inherited?.mixedSize);
  const value = fontSize && typeof control.value !== "number"
    ? Number.isFinite(legacySize) ? legacySize : inherited?.fontSize ?? 16
    : asNumber(control.value);
  const step = control.step || 1;
  const accessibleLabel =
    control.disabled && control.unavailableReason
      ? `${control.label}：${control.unavailableReason}`
      : control.label;
  const namedLabel = forMeasurement ? undefined : accessibleLabel;
  const clamp = (next: number) =>
    Math.min(
      control.max ?? (fontSize ? 999 : Number.POSITIVE_INFINITY),
      Math.max(control.min ?? (fontSize ? 1 : Number.NEGATIVE_INFINITY), next),
    );
  const emitValue = (next: number, focus = true) => {
    if (forMeasurement || control.disabled) return;
    if (fontSize) restoreEditBarTextBookmark(bookmarkRef.current, focus);
    emit(clamp(next));
  };
  const commit = (raw: string) => {
    if (!raw.trim()) return;
    const next = Number(raw);
    if (Number.isFinite(next)) emitValue(next, false);
  };
  const presets = [...new Set(control.options?.length
    ? control.options.map((option) => Number.parseFloat(option.value)).filter(Number.isFinite)
    : EDIT_BAR_FONT_SIZE_PRESETS)].filter((size) => size === clamp(size));
  return (
    <div
      className={`flex max-w-full min-w-0 shrink-0 items-center ${EDIT_BAR_FIELD_CLASS} ${EDIT_BAR_INK_CLASS} ${
        menu ? "min-h-11 w-full" : `h-8 ${EDIT_BAR_TOUCH_EXTEND_CLASS}`
      }`}
      title={namedLabel}
      data-edit-bar-font-size={fontSize ? "" : undefined}
      onPointerDownCapture={() => {
        if (fontSize && !forMeasurement) bookmarkRef.current = captureEditBarTextBookmark() || bookmarkRef.current;
      }}
      onBlur={(event) => {
        const target = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
      }}
    >
      {!iconOnly && (
        <span
          className={`flex min-w-0 items-center gap-1.5 border-r border-[var(--divider,#e7e5e4)] px-2 text-[11px] text-[var(--muted,#78716c)] ${
            menu ? "max-w-[45%]" : ""
          }`}
        >
          {icon}
          <span className="min-w-0 truncate">{control.label}</span>
        </span>
      )}
      {iconOnly && icon && (
        <span
          className="grid h-full w-8 shrink-0 place-items-center"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <button
        type="button"
        disabled={control.disabled}
        tabIndex={forMeasurement ? -1 : undefined}
        onPointerDown={preserveEditBarSelection}
        onClick={() => emitValue(value - step)}
        className="grid h-full w-8 shrink-0 place-items-center rounded-l-xl text-lg hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent,#7c3aed)]/40"
        aria-label={namedLabel ? `${namedLabel} -` : undefined}
      >
        −
      </button>
      <input
        ref={inputRef}
        type="number"
        value={mixed ? "" : value}
        placeholder={mixed ? "多种" : undefined}
        min={control.min}
        max={control.max}
        step={step}
        disabled={control.disabled}
        tabIndex={forMeasurement ? -1 : undefined}
        onClick={() => {
          if (fontSize && !forMeasurement && !control.disabled) {
            keyboardOpenRef.current = false;
            setOpen(true);
          }
        }}
        aria-haspopup={fontSize && !forMeasurement ? "listbox" : undefined}
        aria-expanded={fontSize && !forMeasurement ? open : undefined}
        aria-controls={fontSize && open && !forMeasurement ? listboxId : undefined}
        onKeyDown={(event) => {
          if (fontSize && event.key === "ArrowDown" && !event.nativeEvent.isComposing && !composingRef.current) {
            event.preventDefault();
            bookmarkRef.current = captureEditBarTextBookmark() || bookmarkRef.current;
            keyboardOpenRef.current = true;
            if (open) {
              const selected = menuRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
              (selected || menuRef.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
            } else setOpen(true);
          }
          if (event.key === "Enter") {
            event.stopPropagation();
            if (!event.nativeEvent.isComposing && !composingRef.current) {
              event.preventDefault();
              if (fontSize) {
                setOpen(false);
                restoreEditBarTextBookmark(bookmarkRef.current);
              }
            }
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          commit(event.currentTarget.value);
        }}
        onChange={(event) => {
          if (
            (event.nativeEvent as InputEvent).isComposing ||
            composingRef.current
          ) {
            return;
          }
          commit(event.target.value);
        }}
        aria-label={namedLabel}
        className={`h-full border-0 bg-transparent px-0 text-center text-[12px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
          menu ? "min-w-10 flex-1" : "w-12"
        }`}
      />
      {control.suffix && !fontSize && (
        <span className="-ml-1 pr-1 text-[10px] text-[var(--muted,#78716c)]">
          {control.suffix}
        </span>
      )}
      <button
        type="button"
        disabled={control.disabled}
        tabIndex={forMeasurement ? -1 : undefined}
        onPointerDown={preserveEditBarSelection}
        onClick={() => emitValue(value + step)}
        className="grid h-full w-8 shrink-0 place-items-center rounded-r-xl text-lg hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent,#7c3aed)]/40"
        aria-label={namedLabel ? `${namedLabel} +` : undefined}
      >
        +
      </button>
      {fontSize && <AnchoredPopover
        open={open && !forMeasurement}
        anchorRef={inputRef}
        panelRef={menuRef}
        onClose={(reason) => {
          if (reason === "escape") restoreEditBarTextBookmark(bookmarkRef.current, false);
          setOpen(false);
        }}
        id={listboxId}
        role="listbox"
        ariaLabel={control.label}
        initialFocusSelector={keyboardOpenRef.current ? undefined : false}
        align="start"
        maxHeight={288}
        attributes={sessionId ? { "data-edit-bar-session": sessionId } : undefined}
        className="z-[2147483500] w-24 overflow-y-auto rounded-xl border border-[var(--border,#d6d7df)] bg-[var(--card,#fff)] p-1.5 shadow-2xl"
      >
        {presets.map((size) => <button
          key={size}
          type="button"
          role="option"
          aria-selected={!mixed && size === value}
          tabIndex={size === value || (!presets.includes(value) && size === presets[0]) ? 0 : -1}
          onPointerDown={preserveEditBarSelection}
          onClick={(event) => {
            emitValue(size);
            setOpen(false);
            if (!bookmarkRef.current && event.detail === 0 && menuRef.current?.contains(document.activeElement)) inputRef.current?.focus({ preventScroll: true });
          }}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] tabular-nums hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
        >{size}{!mixed && size === value && <span style={{ color: accent }}>✓</span>}</button>)}
      </AnchoredPopover>}
    </div>
  );
}
