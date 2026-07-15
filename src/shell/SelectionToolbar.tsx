"use client";

import { useMemo, useState } from "react";
import {
  selectionRequestId,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
  type SelectionControlValue,
} from "./selection-context";

export interface SelectionToolbarProps {
  context: SelectionContext | null;
  onCommand: (command: SelectionCommand) => void;
  className?: string;
  accent?: string;
}

function asNumber(value: SelectionControlValue | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function Control({
  control,
  selectionId,
  onCommand,
  accent,
}: {
  control: SelectionControl;
  selectionId: string;
  onCommand: (command: SelectionCommand) => void;
  accent: string;
}) {
  const emit = (value?: SelectionControlValue) =>
    onCommand({
      requestId: selectionRequestId(),
      selectionId,
      controlId: control.id,
      ...(value !== undefined ? { value } : {}),
    });
  const base =
    "h-8 shrink-0 rounded-lg border border-stone-200 bg-white px-2.5 text-[11px] font-medium text-stone-700 outline-none transition hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-35";

  if (control.kind === "action") {
    return (
      <button
        type="button"
        disabled={control.disabled}
        onClick={() => emit()}
        className={`${base} ${control.danger ? "text-rose-600" : ""}`}
        title={control.label}
      >
        {control.label}
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
        onClick={() => emit(!active)}
        className={`${base} ${active ? "text-white" : ""}`}
        style={active ? { background: accent, borderColor: accent } : undefined}
        title={control.label}
      >
        {control.label}
      </button>
    );
  }
  if (control.kind === "color") {
    return (
      <label
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-[10px] text-stone-500"
        title={control.label}
      >
        <span>{control.label}</span>
        <input
          type="color"
          value={
            typeof control.value === "string" && /^#[0-9a-f]{6}$/i.test(control.value)
              ? control.value
              : "#000000"
          }
          disabled={control.disabled}
          onChange={(event) => emit(event.target.value)}
          className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>
    );
  }
  if (control.kind === "select") {
    return (
      <label className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white pl-2 text-[10px] text-stone-500">
        <span>{control.label}</span>
        <select
          value={String(control.value ?? "")}
          disabled={control.disabled}
          onChange={(event) => emit(event.target.value)}
          className="h-full max-w-32 rounded-r-lg border-0 bg-transparent px-1.5 text-[11px] font-medium text-stone-700 outline-none"
        >
          {(control.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (control.kind === "number") {
    return (
      <label className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white pl-2 text-[10px] text-stone-500">
        <span>{control.label}</span>
        <input
          type="number"
          value={asNumber(control.value)}
          min={control.min}
          max={control.max}
          step={control.step}
          disabled={control.disabled}
          onChange={(event) => emit(Number(event.target.value))}
          className="h-full w-16 rounded-r-lg border-0 bg-transparent px-1.5 text-[11px] font-medium text-stone-700 outline-none"
        />
      </label>
    );
  }
  if (control.kind === "range") {
    return (
      <label className="flex h-8 min-w-36 shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-[10px] text-stone-500">
        <span>{control.label}</span>
        <input
          type="range"
          value={asNumber(control.value)}
          min={control.min}
          max={control.max}
          step={control.step}
          disabled={control.disabled}
          onChange={(event) => emit(Number(event.target.value))}
          className="w-20"
          style={{ accentColor: accent }}
        />
        <span className="min-w-7 text-right tabular-nums text-stone-700">
          {Math.round(asNumber(control.value) * 100) / 100}
        </span>
      </label>
    );
  }
  return (
    <label className="flex h-8 min-w-44 shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white pl-2 text-[10px] text-stone-500">
      <span>{control.label}</span>
      <input
        value={typeof control.value === "string" ? control.value : ""}
        disabled={control.disabled}
        maxLength={2_000}
        onChange={(event) => emit(event.target.value)}
        className="h-full min-w-0 flex-1 rounded-r-lg border-0 bg-transparent px-1.5 text-[11px] font-medium text-stone-700 outline-none"
      />
    </label>
  );
}

export function SelectionToolbar({
  context,
  onCommand,
  className = "",
  accent = "#4f46e5",
}: SelectionToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastIdentity, setLastIdentity] = useState("");
  const identity = context ? `${context.kind}:${context.id}` : "";
  if (lastIdentity !== identity) {
    setLastIdentity(identity);
    setMoreOpen(false);
  }
  const [primary, more] = useMemo(() => {
    const controls = context?.controls || [];
    const visible: SelectionControl[] = [];
    const overflow: SelectionControl[] = [];
    controls.forEach((control, index) => {
      if (control.placement === "more" || index >= 8) overflow.push(control);
      else visible.push(control);
    });
    return [visible, overflow];
  }, [context]);

  if (!context || context.controls.length === 0) return null;
  return (
    <div
      data-selection-kind={context.kind}
      data-selection-id={context.id}
      className={`pointer-events-auto flex max-w-[min(92vw,76rem)] items-center gap-1.5 rounded-2xl border border-stone-200 bg-white/95 p-1.5 shadow-xl backdrop-blur ${className}`}
      role="toolbar"
      aria-label={context.label || "选中对象工具"}
    >
      {context.label && (
        <>
          <span className="max-w-28 truncate px-1.5 text-[10px] font-semibold text-stone-500">
            {context.label}
          </span>
          <span className="h-5 w-px shrink-0 bg-stone-200" />
        </>
      )}
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
        {primary.map((control) => (
          <Control
            key={control.id}
            control={control}
            selectionId={context.id}
            onCommand={onCommand}
            accent={accent}
          />
        ))}
      </div>
      {more.length > 0 && (
        <div className="relative shrink-0">
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((value) => !value)}
            className="h-8 rounded-lg border border-stone-200 bg-white px-2.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
          >
            更多 ···
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(60vh,32rem)] w-[min(24rem,85vw)] flex-wrap gap-1.5 overflow-auto rounded-2xl border border-stone-200 bg-white p-2 shadow-2xl">
              {more.map((control) => (
                <Control
                  key={control.id}
                  control={control}
                  selectionId={context.id}
                  onCommand={onCommand}
                  accent={accent}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
