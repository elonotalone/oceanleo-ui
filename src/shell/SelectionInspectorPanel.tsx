"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import {
  selectionRequestId,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
  type SelectionControlValue,
} from "./selection-context";
import { SelectionGestureTransaction } from "./selection-transactions";

function numberValue(value: SelectionControlValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

const COLOR_SWATCHES = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#78716c",
] as const;

function InspectorControl({
  control,
  context,
  onCommand,
  accent,
}: {
  control: SelectionControl;
  context: SelectionContext;
  onCommand: (command: SelectionCommand) => void;
  accent: string;
}) {
  const [draft, setDraft] = useState<SelectionControlValue | undefined>(
    control.value,
  );
  const [query, setQuery] = useState("");
  const gestureRef = useRef(new SelectionGestureTransaction(control.id));
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<SelectionControlValue | undefined>(undefined);
  const draftRef = useRef(draft);
  const onCommandRef = useRef(onCommand);
  draftRef.current = draft;
  onCommandRef.current = onCommand;

  useEffect(() => {
    if (gestureRef.current.active) return;
    draftRef.current = control.value;
    setDraft(control.value);
  }, [control.value]);
  useEffect(() => {
    const cancelActiveGesture = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      pendingRef.current = undefined;
      const cancel = gestureRef.current.cancel();
      if (cancel) onCommandRef.current(cancel);
    };
    window.addEventListener("blur", cancelActiveGesture);
    return () => {
      window.removeEventListener("blur", cancelActiveGesture);
      cancelActiveGesture();
    };
  }, [context.id, context.revision]);

  const emitInstant = (value?: SelectionControlValue) => {
    onCommand({
      requestId: selectionRequestId(),
      selectionId: context.id,
      controlId: control.id,
      ...(value !== undefined ? { value } : {}),
      ...(context.revision !== undefined
        ? { selectionRevision: context.revision }
        : {}),
    });
  };
  const begin = () => {
    const command = gestureRef.current.start(context, draftRef.current);
    if (command) onCommand(command);
  };
  const update = (value: SelectionControlValue) => {
    if (!gestureRef.current.active) begin();
    draftRef.current = value;
    setDraft(value);
    pendingRef.current = value;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = undefined;
      if (pending === undefined) return;
      const command = gestureRef.current.update(pending);
      if (command) onCommandRef.current(command);
    });
  };
  const flushUpdate = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = undefined;
    if (pending === undefined) return;
    const command = gestureRef.current.update(pending);
    if (command) onCommand(command);
  };
  const commit = (value = draftRef.current) => {
    if (!gestureRef.current.active) return;
    flushUpdate();
    const command = gestureRef.current.commit(value);
    if (command) onCommand(command);
  };
  const cancel = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingRef.current = undefined;
    const command = gestureRef.current.cancel();
    if (!command) return;
    onCommand(command);
    draftRef.current = command.value;
    setDraft(command.value);
  };
  const keyboardCommit = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (
      event.key === "Enter" ||
      event.key.startsWith("Arrow") ||
      event.key === "Home" ||
      event.key === "End" ||
      event.key === "PageUp" ||
      event.key === "PageDown"
    ) {
      commit();
    }
  };
  const icon = control.icon ? (
    <AdvancedEditorIcon name={control.icon} className="h-4 w-4" />
  ) : null;

  if (control.kind === "range") {
    const value = numberValue(draft);
    return (
      <div className="space-y-2.5 rounded-xl border border-[var(--awb-border,var(--border,#e7e5e4))] bg-[var(--card,#fff)] p-3">
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="flex items-center gap-2 font-medium text-[var(--fg,#292524)]">
            {icon}
            {control.label}
          </span>
          <input
            type="number"
            value={value}
            min={control.min}
            max={control.max}
            step={control.step}
            disabled={control.disabled}
            onFocus={begin}
            onChange={(event) => update(Number(event.target.value))}
            onBlur={() => commit()}
            onKeyUp={keyboardCommit}
            className="h-9 w-20 rounded-lg border border-[var(--border,#e7e5e4)] bg-transparent px-2 text-right font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[var(--accent,#7c3aed)]/30"
            aria-label={`${control.label}精确值`}
          />
        </div>
        <input
          type="range"
          value={value}
          min={control.min}
          max={control.max}
          step={control.step}
          disabled={control.disabled}
          onPointerDown={begin}
          onChange={(event) => update(Number(event.target.value))}
          onPointerUp={() => commit()}
          onPointerCancel={cancel}
          onKeyDown={(event) => {
            if (
              event.key.startsWith("Arrow") ||
              event.key === "Home" ||
              event.key === "End" ||
              event.key === "PageUp" ||
              event.key === "PageDown"
            ) {
              begin();
            }
          }}
          onKeyUp={keyboardCommit}
          onBlur={() => commit()}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--divider,#e7e5e4)]"
          style={{ accentColor: accent }}
          aria-label={control.label}
        />
      </div>
    );
  }

  if (control.kind === "text") {
    return (
      <label className="block space-y-2 text-[12px] font-medium text-[var(--fg,#292524)]">
        <span className="flex items-center gap-2">
          {icon}
          {control.label}
        </span>
        <textarea
          value={typeof draft === "string" ? draft : ""}
          disabled={control.disabled}
          maxLength={2_000}
          rows={4}
          onFocus={begin}
          onChange={(event) => update(event.target.value)}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              commit();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              cancel();
              event.currentTarget.blur();
            }
          }}
          className="min-h-24 w-full resize-y rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2 text-[12px] font-normal leading-relaxed outline-none focus:ring-2 focus:ring-[var(--accent,#7c3aed)]/30"
        />
      </label>
    );
  }

  if (control.kind === "color") {
    const value =
      typeof draft === "string" && /^#[0-9a-f]{6}$/i.test(draft)
        ? draft
        : "#000000";
    return (
      <div className="space-y-2 text-[12px] font-medium text-[var(--fg,#292524)]">
        <span className="flex items-center gap-2">
          {icon}
          {control.label}
        </span>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2">
          <input
            type="color"
            value={value}
            disabled={control.disabled}
            onFocus={begin}
            onChange={(event) => update(event.target.value)}
            onBlur={() => commit()}
            className="h-9 w-12 cursor-pointer rounded-lg border-0 bg-transparent"
            aria-label={control.label}
          />
          <input
            value={value}
            disabled={control.disabled}
            onFocus={begin}
            onChange={(event) => update(event.target.value)}
            onBlur={() => commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancel();
                event.currentTarget.blur();
              }
            }}
            className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border,#e7e5e4)] bg-transparent px-3 font-mono uppercase outline-none focus:ring-2 focus:ring-[var(--accent,#7c3aed)]/30"
            aria-label={`${control.label} HEX`}
          />
        </div>
        <div className="grid grid-cols-6 gap-2">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`${control.label} ${swatch}`}
              aria-pressed={value.toLowerCase() === swatch}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                if (value.toLowerCase() === swatch) return;
                if (gestureRef.current.active) cancel();
                setDraft(swatch);
                draftRef.current = swatch;
                emitInstant(swatch);
              }}
              className="aspect-square rounded-lg border border-black/10 shadow-sm outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40"
              style={{ background: swatch }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (control.kind === "select") {
    const options = (control.options || []).filter((option) =>
      `${option.label} ${option.value}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    );
    return (
      <div className="space-y-2 text-[12px] font-medium text-[var(--fg,#292524)]">
        <span className="flex items-center gap-2">
          {icon}
          {control.label}
        </span>
        {(control.options?.length || 0) > 6 && (
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`搜索${control.label}`}
            aria-label={`搜索${control.label}`}
            className="h-10 w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 font-normal outline-none focus:ring-2 focus:ring-[var(--accent,#7c3aed)]/30"
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          {options.map((option) => {
            const active = option.value === String(draft ?? "");
            return (
              <button
                key={option.value}
                type="button"
                disabled={control.disabled}
                aria-pressed={active}
                onClick={() => {
                  if (active) return;
                  setDraft(option.value);
                  draftRef.current = option.value;
                  emitInstant(option.value);
                }}
                className={`min-h-11 rounded-xl border px-3 py-2 text-left text-[11px] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/35 ${
                  active
                    ? "border-transparent font-semibold text-white"
                    : "border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.05))]"
                }`}
                style={active ? { background: accent } : undefined}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (control.kind === "number") {
    return (
      <label className="block space-y-2 text-[12px] font-medium text-[var(--fg,#292524)]">
        <span className="flex items-center gap-2">
          {icon}
          {control.label}
        </span>
        <input
          type="number"
          value={numberValue(draft)}
          min={control.min}
          max={control.max}
          step={control.step}
          disabled={control.disabled}
          onFocus={begin}
          onChange={(event) => update(Number(event.target.value))}
          onBlur={() => commit()}
          onKeyUp={keyboardCommit}
          className="h-10 w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 outline-none focus:ring-2 focus:ring-[var(--accent,#7c3aed)]/30"
        />
      </label>
    );
  }

  const active = control.kind === "toggle" && draft === true;
  const danger = control.danger || control.tone === "danger";
  return (
    <button
      type="button"
      disabled={control.disabled}
      onClick={() => {
        const next = control.kind === "toggle" ? !active : undefined;
        setDraft(next);
        draftRef.current = next;
        emitInstant(next);
      }}
      aria-label={control.label}
      className={`flex h-10 w-full items-center justify-between rounded-xl border px-3 text-[12px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/35 ${
        active
          ? "border-transparent text-white"
          : danger
            ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          : "border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-[var(--fg,#292524)] hover:bg-[var(--surface-hover,rgba(0,0,0,.05))]"
      }`}
      style={active ? { background: accent } : undefined}
    >
      <span className="flex items-center gap-2">
        {icon}
        {control.label}
      </span>
      {active && <span>✓</span>}
    </button>
  );
}

export function SelectionInspectorPanel({
  context,
  controls,
  onCommand,
  accent,
}: {
  context: SelectionContext;
  controls: readonly SelectionControl[];
  onCommand: (command: SelectionCommand) => void;
  accent: string;
}) {
  return (
    <div
      data-selection-inspector
      role="group"
      aria-label={context.label || "所选对象属性"}
      className="h-full min-h-0 overflow-y-auto bg-[var(--awb-shell-bg,var(--bg,#f7f7f5))] p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ "--accent": accent } as CSSProperties}
    >
      <div className="space-y-3">
        {controls.map((control) => (
          <InspectorControl
            key={`${context.id}:${String(context.revision ?? "")}:${control.id}`}
            control={control}
            context={context}
            onCommand={onCommand}
            accent={accent}
          />
        ))}
      </div>
    </div>
  );
}
