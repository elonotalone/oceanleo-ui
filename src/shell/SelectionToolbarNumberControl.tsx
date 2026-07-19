"use client";

import { useRef, type ReactNode } from "react";
import type {
  SelectionControl,
  SelectionControlValue,
} from "./selection-context";

function asNumber(value: SelectionControlValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function SelectionToolbarNumberControl({
  control,
  menu,
  iconOnly,
  icon,
  emit,
}: {
  control: SelectionControl;
  menu: boolean;
  iconOnly: boolean;
  icon: ReactNode;
  emit: (value?: SelectionControlValue) => void;
}) {
  const composingRef = useRef(false);
  const value = asNumber(control.value);
  const step = control.step || 1;
  const accessibleLabel =
    control.disabled && control.unavailableReason
      ? `${control.label}：${control.unavailableReason}`
      : control.label;
  const clamp = (next: number) =>
    Math.min(
      control.max ?? Number.POSITIVE_INFINITY,
      Math.max(control.min ?? Number.NEGATIVE_INFINITY, next),
    );
  return (
    <div
      className={`flex h-11 shrink-0 items-center overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] ${
        menu ? "w-full" : ""
      }`}
      title={accessibleLabel}
    >
      {!iconOnly && (
        <span className="flex items-center gap-1.5 border-r border-[var(--divider,#e7e5e4)] px-2 text-[11px] text-[var(--muted,#78716c)]">
          {icon}
          {control.label}
        </span>
      )}
      {iconOnly && icon && (
        <span
          className="grid h-full w-7 shrink-0 place-items-center text-[var(--muted,#78716c)]"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <button
        type="button"
        disabled={control.disabled}
        onClick={() => emit(clamp(value - step))}
        className="grid h-full w-7 place-items-center text-sm text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
        aria-label={`${accessibleLabel} -`}
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={control.min}
        max={control.max}
        step={step}
        disabled={control.disabled}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) emit(clamp(next));
        }}
        onChange={(event) => {
          if (
            (event.nativeEvent as InputEvent).isComposing ||
            composingRef.current
          ) {
            return;
          }
          const next = Number(event.target.value);
          if (Number.isFinite(next)) emit(clamp(next));
        }}
        aria-label={accessibleLabel}
        className={`h-full border-0 bg-transparent px-0 text-center text-[12px] font-semibold tabular-nums text-[var(--fg,#292524)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
          menu ? "min-w-16 flex-1" : "w-12"
        }`}
      />
      {control.suffix && (
        <span className="-ml-1 pr-1 text-[10px] text-[var(--muted,#78716c)]">
          {control.suffix}
        </span>
      )}
      <button
        type="button"
        disabled={control.disabled}
        onClick={() => emit(clamp(value + step))}
        className="grid h-full w-7 place-items-center text-sm text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
        aria-label={`${accessibleLabel} +`}
      >
        +
      </button>
    </div>
  );
}
