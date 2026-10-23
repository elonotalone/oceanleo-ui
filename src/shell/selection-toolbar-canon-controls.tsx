"use client";

/**
 * 统一编辑栏里两件「显示值、不显示图标」的规范控件（D9）：
 * - 字号：数字输入 + 常用字号下拉（编辑器给 `kind:"number"` 时）。
 * - 字体：旧写法是 `kind:"panel"`、把当前字体名写在 label 里——按钮上写字体名。
 * 字体给 `kind:"select"` 时直接走 `SelectionToolbarSelectControl`（显示当前选项名）。
 */
import { useId, useRef, useState } from "react";
import { AnchoredPopover } from "./anchored-popover";
import type {
  SelectionControl,
  SelectionControlValue,
  SelectionPanelAction,
} from "./selection-context";
import { EDIT_BAR_TOUCH_EXTEND_CLASS } from "./edit-bar-surface";
import { preserveEditBarSelection } from "./edit-bar-selection-preserve";
import { useEditBarSessionId } from "./edit-bar-selection-session";
import type { CanonicalSelectionControl } from "./edit-bar-canon";

/** 常用字号；只列落在编辑器给的 min / max 之内的。 */
export const EDIT_BAR_FONT_SIZE_PRESETS = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72, 96,
] as const;

const FIELD_CLASS =
  "flex h-7 shrink-0 items-center overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]";

export function SelectionToolbarFontSizeControl({
  control,
  emit,
  accent,
  forMeasurement = false,
}: {
  control: SelectionControl;
  emit: (value?: SelectionControlValue) => void;
  accent: string;
  forMeasurement?: boolean;
}) {
  const sessionId = useEditBarSessionId();
  const [open, setOpen] = useState(false);
  const composingRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = `edit-bar-font-size-${useId().replace(/:/g, "")}`;
  const value =
    typeof control.value === "number" && Number.isFinite(control.value)
      ? control.value
      : 0;
  const min = control.min ?? 1;
  const max = control.max ?? 999;
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const presets = EDIT_BAR_FONT_SIZE_PRESETS.filter(
    (size) => size >= min && size <= max,
  );
  const label = forMeasurement ? undefined : control.label;
  const commit = (raw: string) => {
    const next = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(next)) emit(clamp(next));
  };
  return (
    <div
      className={`${FIELD_CLASS} ${EDIT_BAR_TOUCH_EXTEND_CLASS}`}
      title={label ? `${label}：${value}` : undefined}
      data-edit-bar-font-size
    >
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={control.min}
        max={control.max}
        step={control.step || 1}
        disabled={control.disabled}
        tabIndex={forMeasurement ? -1 : undefined}
        aria-label={label}
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
        className="h-full w-11 border-0 bg-transparent pl-2 text-center text-[12px] font-semibold tabular-nums text-[var(--fg,#292524)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]/45 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {presets.length > 0 && (
        <button
          ref={buttonRef}
          type="button"
          disabled={control.disabled}
          tabIndex={forMeasurement ? -1 : undefined}
          onPointerDown={preserveEditBarSelection}
          onClick={() => {
            if (!forMeasurement) setOpen((current) => !current);
          }}
          aria-haspopup={forMeasurement ? undefined : "listbox"}
          aria-expanded={forMeasurement ? undefined : open}
          aria-controls={!forMeasurement && open ? listboxId : undefined}
          aria-label={label ? `${label} ▾` : undefined}
          className="grid h-full w-6 place-items-center text-[9px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
        >
          ⌄
        </button>
      )}
      <AnchoredPopover
        open={!forMeasurement && open}
        anchorRef={buttonRef}
        panelRef={menuRef}
        onClose={() => setOpen(false)}
        id={listboxId}
        role="listbox"
        ariaLabel={control.label}
        align="start"
        maxHeight={288}
        attributes={sessionId ? { "data-edit-bar-session": sessionId } : undefined}
        className="z-[2147483500] w-24 overflow-y-auto rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-1.5 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {presets.map((size) => (
          <button
            key={size}
            type="button"
            role="option"
            aria-selected={size === value}
            tabIndex={size === value ? 0 : -1}
            onPointerDown={preserveEditBarSelection}
            onClick={() => {
              emit(size);
              setOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[12px] tabular-nums ${
              size === value
                ? "bg-[var(--surface-hover,rgba(0,0,0,.06))] font-semibold text-[var(--fg,#292524)]"
                : "text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
            }`}
          >
            {size}
            {size === value && <span style={{ color: accent }}>✓</span>}
          </button>
        ))}
      </AnchoredPopover>
    </div>
  );
}

/** 旧写法的字体面板键：按钮上写当前字体名，点开编辑器自己的字体面板。 */
export function SelectionToolbarFontFamilyButton({
  control,
  buttonClass,
  activePanel,
  onOpenPanel,
  onActivated,
  forMeasurement = false,
}: {
  control: CanonicalSelectionControl;
  buttonClass: string;
  activePanel: boolean;
  onOpenPanel?: (panelId: string, panelAction?: SelectionPanelAction) => void;
  onActivated?: () => void;
  forMeasurement?: boolean;
}) {
  const fontName = control.canonValueLabel || control.label;
  return (
    <button
      type="button"
      disabled={control.disabled}
      tabIndex={forMeasurement ? -1 : undefined}
      onPointerDown={preserveEditBarSelection}
      onClick={() => {
        if (forMeasurement) return;
        onOpenPanel?.(control.panelId || control.id, control.panelAction);
        onActivated?.();
      }}
      aria-haspopup="dialog"
      aria-expanded={activePanel}
      aria-label={forMeasurement ? undefined : `${control.label}：${fontName}`}
      title={forMeasurement ? undefined : `${control.label}：${fontName}`}
      className={`${buttonClass} max-w-40`}
      data-edit-bar-font-family
    >
      <span className="min-w-0 truncate font-semibold" style={{ fontFamily: fontName }}>
        {fontName}
      </span>
      <span className="shrink-0 text-[9px] opacity-50">⌄</span>
    </button>
  );
}
