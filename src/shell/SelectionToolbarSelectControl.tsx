"use client";

import { useId, useRef, useState } from "react";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { AnchoredPopover } from "./anchored-popover";
import {
  selectionRequestId,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
  type SelectionControlValue,
} from "./selection-context";
import { selectionControlUsesIconOnly } from "./selection-toolbar-layout";

export function SelectionToolbarSelectControl({
  control,
  selectionId,
  selectionRevision,
  selectionEpoch,
  onCommand,
  accent,
  presentation,
  onActivated,
}: {
  control: SelectionControl;
  selectionId: string;
  selectionRevision?: SelectionContext["revision"];
  selectionEpoch?: SelectionContext["epoch"];
  onCommand: (command: SelectionCommand) => void;
  accent: string;
  presentation: "compact" | "menu";
  onActivated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = `selection-select-${useId().replace(/:/g, "")}`;
  const menu = presentation === "menu";
  const iconOnly = !menu && selectionControlUsesIconOnly(control);
  const accessibleLabel =
    control.disabled && control.unavailableReason
      ? `${control.label}：${control.unavailableReason}`
      : control.label;
  const selectedOption = (control.options || []).find(
    (option) => option.value === String(control.value ?? ""),
  );
  const valueDescriptionId = `${listboxId}-value`;
  const selectedLabel =
    selectedOption?.label || String(control.value ?? "") || "未选择";
  const emit = (value: SelectionControlValue) =>
    onCommand({
      requestId: selectionRequestId(),
      selectionId,
      controlId: control.id,
      value,
      ...(selectionRevision !== undefined ? { selectionRevision } : {}),
      ...(selectionEpoch !== undefined ? { selectionEpoch } : {}),
    });
  const buttonClass = menu
    ? "group/control flex min-h-11 min-w-0 w-full items-center justify-start gap-2 overflow-hidden rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-[var(--fg,#292524)] outline-none transition duration-150 hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40 disabled:pointer-events-none disabled:opacity-35"
    : "group/control inline-flex h-11 min-w-11 shrink-0 max-w-48 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium text-[var(--fg,#292524)] outline-none transition duration-150 hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40 disabled:pointer-events-none disabled:opacity-35";

  return (
    <div
      className={`group/control relative min-w-0 shrink-0 ${menu ? "w-full" : ""}`}
      title={`${accessibleLabel}：${selectedLabel}`}
      onBlur={(event) => {
        const relatedTarget = event.relatedTarget as Node | null;
        if (
          !event.currentTarget.contains(relatedTarget) &&
          !menuRef.current?.contains(relatedTarget)
        ) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        disabled={control.disabled}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={accessibleLabel}
        aria-describedby={valueDescriptionId}
        className={buttonClass}
      >
        {control.icon && (
          <AdvancedEditorIcon
            name={control.icon}
            className="h-[17px] w-[17px]"
          />
        )}
        {!iconOnly && (
          <span
            className={`text-[10px] font-normal text-[var(--muted,#78716c)] ${
              menu ? "max-w-[45%] min-w-0 truncate" : "shrink-0"
            }`}
          >
            {control.label}
          </span>
        )}
        <span className="min-w-0 truncate font-semibold">
          {selectedLabel}
        </span>
        <span className="shrink-0 text-[9px] opacity-50">⌄</span>
      </button>
      <span id={valueDescriptionId} className="sr-only">
        当前值：{selectedLabel}
      </span>
      <AnchoredPopover
        open={open}
        anchorRef={buttonRef}
        panelRef={menuRef}
        onClose={() => setOpen(false)}
        id={listboxId}
        role="listbox"
        ariaLabel={control.label}
        align="start"
        maxHeight={288}
        className="z-[2147483500] overflow-x-hidden overflow-y-auto rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-1.5 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          width: Math.max(
            176,
            buttonRef.current?.getBoundingClientRect().width || 0,
          ),
        }}
      >
        {(control.options || []).map((option) => {
          const active = option.value === String(control.value ?? "");
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => {
                emit(option.value);
                setOpen(false);
                onActivated?.();
                window.requestAnimationFrame(() => buttonRef.current?.focus());
              }}
              className={`flex min-w-0 w-full items-center justify-between gap-3 overflow-hidden rounded-lg px-3 py-2 text-left text-[11px] transition ${
                active
                  ? "bg-[var(--surface-hover,rgba(0,0,0,.06))] font-semibold text-[var(--fg,#292524)]"
                  : "text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
              }`}
              title={option.label}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {active && (
                <span className="shrink-0" style={{ color: accent }}>
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </AnchoredPopover>
    </div>
  );
}
