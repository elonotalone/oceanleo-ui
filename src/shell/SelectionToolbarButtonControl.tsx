"use client";

import type { ReactNode } from "react";
import type {
  SelectionControl,
  SelectionControlValue,
  SelectionPanelAction,
} from "./selection-context";

export function SelectionToolbarButtonControl({
  control,
  buttonClass,
  menu,
  iconOnly,
  icon,
  accent,
  activePanel,
  onOpenPanel,
  onActivated,
  emit,
  forMeasurement = false,
}: {
  control: SelectionControl;
  buttonClass: string;
  menu: boolean;
  iconOnly: boolean;
  icon: ReactNode;
  accent: string;
  activePanel: boolean;
  onOpenPanel?: (
    panelId: string,
    panelAction?: SelectionPanelAction,
  ) => void;
  onActivated?: () => void;
  emit: (value?: SelectionControlValue) => void;
  forMeasurement?: boolean;
}) {
  const accessibleLabel =
    control.disabled && control.unavailableReason
      ? `${control.label}：${control.unavailableReason}`
      : control.label;
  // Measurement clones must omit aria-label/title so the live toolbar's
  // accessible names stay unique under the same role=toolbar root.
  const namedLabel = forMeasurement ? undefined : accessibleLabel;
  if (control.kind === "action" || control.kind === "panel") {
    return (
      <button
        type="button"
        disabled={control.disabled}
        tabIndex={forMeasurement ? -1 : undefined}
        onClick={() => {
          if (control.kind === "panel" && onOpenPanel) {
            onOpenPanel(control.panelId || control.id, control.panelAction);
          } else {
            emit();
          }
          onActivated?.();
        }}
        className={`${buttonClass} ${iconOnly ? "w-11 px-0" : ""} ${
          activePanel ? "bg-[var(--surface-hover,rgba(0,0,0,.06))]" : ""
        } ${
          control.danger || control.tone === "danger"
            ? "text-rose-600 hover:bg-rose-500/10"
            : ""
        }`}
        title={namedLabel}
        aria-label={namedLabel}
        aria-haspopup={control.kind === "panel" ? "dialog" : undefined}
        aria-expanded={control.kind === "panel" ? activePanel : undefined}
        aria-controls={
          control.kind === "panel" ? control.panelId || control.id : undefined
        }
        style={
          activePanel
            ? {
                color: accent,
                boxShadow: `inset 0 -2px 0 ${accent}`,
              }
            : undefined
        }
      >
        {icon}
        {!iconOnly && (
          <span className={menu ? "min-w-0 truncate" : "whitespace-nowrap"}>
            {control.label}
          </span>
        )}
      </button>
    );
  }

  if (control.kind === "toggle") {
    const active = control.value === true;
    return (
      <button
        type="button"
        aria-pressed={active}
        disabled={control.disabled}
        tabIndex={forMeasurement ? -1 : undefined}
        onClick={() => {
          emit(!active);
          onActivated?.();
        }}
        className={`${buttonClass} ${iconOnly ? "w-11 px-0" : ""} ${
          active ? "text-white shadow-sm" : ""
        }`}
        style={active ? { background: accent } : undefined}
        title={namedLabel}
        aria-label={namedLabel}
      >
        {icon}
        {!iconOnly && (
          <span className={menu ? "min-w-0 truncate" : "whitespace-nowrap"}>
            {control.label}
          </span>
        )}
      </button>
    );
  }

  if (control.kind === "color") {
    const color =
      typeof control.value === "string" && /^#[0-9a-f]{6}$/i.test(control.value)
        ? control.value
        : "#000000";
    return (
      <label
        className={`${buttonClass} relative ${
          iconOnly ? "w-11 px-0" : ""
        } focus-within:ring-2 focus-within:ring-[var(--accent,#7c3aed)]/40`}
        title={namedLabel}
      >
        <span className="relative grid h-5 w-5 place-items-center">
          {icon}
          <span
            className="absolute -bottom-0.5 left-0 right-0 h-1 rounded-full ring-1 ring-black/10"
            style={{ background: color }}
          />
        </span>
        {!iconOnly && (
          <span className={menu ? "min-w-0 truncate" : "whitespace-nowrap"}>
            {control.label}
          </span>
        )}
        <input
          type="color"
          value={color}
          disabled={control.disabled}
          tabIndex={forMeasurement ? -1 : undefined}
          onChange={(event) => {
            emit(event.target.value);
            onActivated?.();
          }}
          aria-label={namedLabel}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    );
  }

  return null;
}
