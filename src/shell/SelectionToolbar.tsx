"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { useAdvancedLayout } from "./advanced-layout-context";
import {
  selectionRequestId,
  type SelectionPanelAction,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
  type SelectionControlIcon,
  type SelectionControlValue,
} from "./selection-context";
import {
  partitionSelectionControls,
  SELECTION_TOOLBAR_MAX_WIDTH,
} from "./selection-toolbar-layout";
import { partitionSelectionInspectorControls } from "./selection-inspector-groups";
import { useSelectionInspectorHost } from "./selection-inspector-host";

export interface SelectionToolbarProps {
  context: SelectionContext | null;
  onCommand: (command: SelectionCommand) => void;
  onOpenPanel?: (
    panelId: string,
    panelAction?: SelectionPanelAction,
  ) => void;
  className?: string;
  accent?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  variant?: "bar" | "floating";
}

function asNumber(value: SelectionControlValue | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function iconForSelection(kind: string): SelectionControlIcon {
  const value = kind.toLowerCase();
  if (value.includes("canvas") || value.includes("background")) return "templates";
  if (value.includes("text")) return "text";
  if (value.includes("image") || value.includes("photo")) return "image";
  if (value.includes("table") || value.includes("grid")) return "table";
  if (
    value.includes("shape") ||
    value.includes("rect") ||
    value.includes("circle") ||
    value.includes("ellipse")
  ) return "shape";
  if (value.includes("line") || value.includes("arrow")) return "line";
  if (value.includes("path") || value.includes("draw")) return "draw";
  if (value.includes("note")) return "note";
  if (value.includes("signature")) return "signature";
  if (value.includes("slide") || value.includes("page")) return "pages";
  return "select";
}

function Control({
  control,
  selectionId,
  selectionRevision,
  onCommand,
  onOpenPanel,
  accent,
  activePanel = false,
}: {
  control: SelectionControl;
  selectionId: string;
  selectionRevision?: SelectionContext["revision"];
  onCommand: (command: SelectionCommand) => void;
  onOpenPanel?: (
    panelId: string,
    panelAction?: SelectionPanelAction,
  ) => void;
  accent: string;
  activePanel?: boolean;
}) {
  const [selectOpen, setSelectOpen] = useState(false);
  const selectButtonRef = useRef<HTMLButtonElement | null>(null);
  const emit = (value?: SelectionControlValue) =>
    onCommand({
      requestId: selectionRequestId(),
      selectionId,
      controlId: control.id,
      ...(value !== undefined ? { value } : {}),
      ...(selectionRevision !== undefined ? { selectionRevision } : {}),
    });
  const icon = control.icon ? (
    <AdvancedEditorIcon name={control.icon} className="h-[17px] w-[17px]" />
  ) : null;
  const buttonClass =
    "group/control inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[var(--fg,#292524)] outline-none transition duration-150 hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40 disabled:pointer-events-none disabled:opacity-35";

  if (control.kind === "action" || control.kind === "panel") {
    return (
      <button
        type="button"
        disabled={control.disabled}
        onClick={() => {
          if (control.kind === "panel" && onOpenPanel) {
            onOpenPanel(
              control.panelId || control.id,
              control.panelAction,
            );
            return;
          }
          emit();
        }}
        className={`${buttonClass} ${control.iconOnly ? "w-9 px-0" : ""} ${
          activePanel ? "bg-[var(--surface-hover,rgba(0,0,0,.06))]" : ""
        } ${
          control.danger || control.tone === "danger"
            ? "text-rose-600 hover:bg-rose-500/10"
            : ""
        }`}
        title={control.label}
        aria-label={control.label}
        aria-haspopup={control.kind === "panel" ? "dialog" : undefined}
        aria-expanded={control.kind === "panel" ? activePanel : undefined}
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
        {!control.iconOnly && <span className="whitespace-nowrap">{control.label}</span>}
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
        className={`${buttonClass} ${control.iconOnly ? "w-9 px-0" : ""} ${
          active ? "text-white shadow-sm" : ""
        }`}
        style={active ? { background: accent } : undefined}
        title={control.label}
        aria-label={control.label}
      >
        {icon}
        {!control.iconOnly && <span className="whitespace-nowrap">{control.label}</span>}
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
          control.iconOnly ? "w-9 px-0" : ""
        } focus-within:ring-2 focus-within:ring-[var(--accent,#7c3aed)]/40`}
        title={control.label}
        aria-label={control.label}
      >
        <span className="relative grid h-5 w-5 place-items-center">
          {icon}
          <span
            className="absolute -bottom-0.5 left-0 right-0 h-1 rounded-full ring-1 ring-black/10"
            style={{ background: color }}
          />
        </span>
        {!control.iconOnly && <span className="whitespace-nowrap">{control.label}</span>}
        <input
          type="color"
          value={color}
          disabled={control.disabled}
          onChange={(event) => emit(event.target.value)}
          aria-label={control.label}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    );
  }
  if (control.kind === "select") {
    const selectedOption = (control.options || []).find(
      (option) => option.value === String(control.value ?? ""),
    );
    return (
      <div
        className="group/control relative shrink-0"
        title={control.label}
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setSelectOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          setSelectOpen(false);
          selectButtonRef.current?.focus();
        }}
      >
        <button
          ref={selectButtonRef}
          type="button"
          disabled={control.disabled}
          onClick={() => setSelectOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={selectOpen}
          aria-label={control.label}
          className={`${buttonClass} max-w-48`}
        >
          {icon}
          {!control.iconOnly && (
            <span className="text-[10px] font-normal text-[var(--muted,#78716c)]">
              {control.label}
            </span>
          )}
          <span className="truncate font-semibold">
            {selectedOption?.label || String(control.value ?? "")}
          </span>
          <span className="text-[9px] opacity-50">⌄</span>
        </button>
        {selectOpen && (
          <div
            role="listbox"
            aria-label={control.label}
            className="fixed z-[2147483500] max-h-72 min-w-44 overflow-y-auto rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-1.5 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              left: Math.max(
                8,
                Math.min(
                  selectButtonRef.current?.getBoundingClientRect().left || 8,
                  (typeof window === "undefined" ? 1_024 : window.innerWidth) -
                    220,
                ),
              ),
              top:
                (selectButtonRef.current?.getBoundingClientRect().bottom || 42) +
                6,
              minWidth: Math.max(
                176,
                selectButtonRef.current?.getBoundingClientRect().width || 0,
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
                  onClick={() => {
                    emit(option.value);
                    setSelectOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[11px] whitespace-nowrap transition ${
                    active
                      ? "bg-[var(--surface-hover,rgba(0,0,0,.06))] font-semibold text-[var(--fg,#292524)]"
                      : "text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
                  }`}
                >
                  {option.label}
                  {active && <span style={{ color: accent }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (control.kind === "number") {
    const value = asNumber(control.value);
    const step = control.step || 1;
    const clamp = (next: number) =>
      Math.min(control.max ?? Number.POSITIVE_INFINITY, Math.max(control.min ?? Number.NEGATIVE_INFINITY, next));
    return (
      <div
        className="flex h-9 shrink-0 items-center overflow-hidden rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]"
        title={control.label}
      >
        {!control.iconOnly && (
          <span className="flex items-center gap-1.5 border-r border-[var(--divider,#e7e5e4)] px-2 text-[11px] text-[var(--muted,#78716c)]">
            {icon}
            {control.label}
          </span>
        )}
        <button
          type="button"
          disabled={control.disabled}
          onClick={() => emit(clamp(value - step))}
          className="grid h-full w-7 place-items-center text-sm text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
          aria-label={`${control.label} -`}
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
          onChange={(event) => emit(Number(event.target.value))}
          aria-label={control.label}
          className="h-full w-12 border-0 bg-transparent px-0 text-center text-[12px] font-semibold tabular-nums text-[var(--fg,#292524)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
          aria-label={`${control.label} +`}
        >
          +
        </button>
      </div>
    );
  }
  // Continuous values and long text are rendered only in a child inspector.
  // Keeping this guard fail-closed prevents a future route from reintroducing
  // sliders or content fields into the compact edit bar.
  return null;
}

export function SelectionToolbar({
  context,
  onCommand,
  onOpenPanel,
  className = "",
  accent = "#6d5dfc",
  leading,
  trailing,
  variant = "bar",
}: SelectionToolbarProps) {
  const layout = useAdvancedLayout();
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [moreOpen, setMoreOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const measuredWidthsRef = useRef(new Map<string, number>());
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const [controlsWidth, setControlsWidth] = useState(SELECTION_TOOLBAR_MAX_WIDTH);
  const [hasMeasured, setHasMeasured] = useState(false);
  const identity = context ? `${context.kind}:${context.id}` : "";
  const sourceControls = useMemo(
    () =>
      (context?.controls || []).filter(
        (control) => control.id !== "undo" && control.id !== "redo",
      ),
    [context],
  );
  const { compact: controls, groups: inspectorGroups } = useMemo(
    () => partitionSelectionInspectorControls(sourceControls),
    [sourceControls],
  );
  const controlsIdentity = sourceControls
    .map(
      (control) =>
        `${control.id}:${control.kind}:${control.slot || ""}:${control.inspectorGroup || ""}:${control.iconOnly ? 1 : 0}`,
    )
    .join("|");
  const {
    openPanel: openControlPanel,
    activePanelId,
    fallbackPanel,
  } = useSelectionInspectorHost({
    layout,
    groups: inspectorGroups,
    context,
    onCommand,
    onOpenPanel,
    accent,
    anchorRef: toolbarRef,
  });
  useLayoutEffect(() => {
    setMoreOpen(false);
    setHasMeasured(false);
    measuredWidthsRef.current.clear();
    const currentLayout = layoutRef.current;
    if (currentLayout?.activeTransientPanelId.startsWith("selection-")) {
      currentLayout.closeDrawer();
    }
  }, [controlsIdentity, identity]);
  useLayoutEffect(() => {
    const node = controlsRef.current;
    if (!node) return;
    const update = () => setControlsWidth(node.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [identity]);
  const { visible, overflow } = useMemo(
    () =>
      hasMeasured
        ? partitionSelectionControls(
            controls,
            measuredWidthsRef.current,
            controlsWidth,
          )
        : { visible: [...controls], overflow: [] },
    [controls, controlsWidth, hasMeasured, measurementRevision],
  );
  useLayoutEffect(() => {
    const node = controlsRef.current;
    if (!node) return;
    let changed = false;
    node
      .querySelectorAll<HTMLElement>("[data-selection-control-id]")
      .forEach((element) => {
        const id = element.dataset.selectionControlId;
        const width = element.getBoundingClientRect().width;
        if (
          id &&
          width > 0 &&
          Math.abs((measuredWidthsRef.current.get(id) || 0) - width) > 0.5
        ) {
          measuredWidthsRef.current.set(id, width);
          changed = true;
        }
      });
    if (!hasMeasured) setHasMeasured(true);
    else if (changed) setMeasurementRevision((value) => value + 1);
  }, [hasMeasured, identity, visible]);
  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [moreOpen]);
  useEffect(() => {
    if (!overflow.length) setMoreOpen(false);
  }, [overflow.length]);

  if (!context && !leading && !trailing) return null;
  const effectiveVariant = layout ? "floating" : variant;
  const contextLeading = layout?.contextBarLeading;
  const renderControl = (control: SelectionControl, measure: boolean) => {
    return (
      <div
        key={`${identity}:${control.id}`}
        data-selection-control-id={measure ? control.id : undefined}
        className="inline-flex shrink-0"
      >
        <Control
          control={control}
          selectionId={context?.id || ""}
          selectionRevision={context?.revision}
          onCommand={onCommand}
          onOpenPanel={openControlPanel}
          accent={accent}
          activePanel={Boolean(
            control.kind === "panel" &&
              activePanelId === (control.panelId || control.id),
          )}
        />
      </div>
    );
  };
  return (
    <div
      ref={toolbarRef}
      data-selection-kind={context?.kind || "none"}
      data-selection-id={context?.id || ""}
      className={`pointer-events-auto flex min-w-0 flex-nowrap items-center gap-1 ${
        effectiveVariant === "floating"
          ? "max-w-full rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]/96 p-1.5 text-[var(--fg,#292524)] shadow-[0_10px_32px_rgba(15,23,42,.12)] backdrop-blur-xl"
          : "w-full max-w-full bg-transparent p-0 text-[var(--fg,#292524)]"
      } ${className}`}
      style={
        effectiveVariant === "floating"
          ? {
              width: `min(${SELECTION_TOOLBAR_MAX_WIDTH}px, calc(100vw - 2rem))`,
            }
          : undefined
      }
      role="toolbar"
      aria-label={context?.label || "编辑器工具栏"}
      onBlur={(event) => {
        if (
          moreOpen &&
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          setMoreOpen(false);
        }
      }}
    >
      {(contextLeading || leading) && (
        <>
          <div className="flex shrink-0 items-center gap-1">
            {contextLeading}
            {leading}
          </div>
          <span className="mx-1 h-6 w-px shrink-0 bg-[var(--divider,#e7e5e4)]" />
        </>
      )}
      {context && (
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          aria-label={context.label || "当前对象"}
          title={context.label || "当前对象"}
          style={{
            color: accent,
            background: `color-mix(in srgb, ${accent} 9%, var(--card,#fff))`,
          }}
        >
          <AdvancedEditorIcon
            name={iconForSelection(context.kind)}
            className="h-[18px] w-[18px]"
          />
        </div>
      )}
      {context && (
        <span className="mx-1 h-6 w-px shrink-0 bg-[var(--divider,#e7e5e4)]" />
      )}
      <div
        ref={controlsRef}
        className={`relative flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-visible ${
          overflow.length ? "pr-10" : ""
        }`}
      >
        {visible.map((control) => renderControl(control, true))}
        {overflow.length > 0 && (
          <div className="absolute right-0 top-0 shrink-0">
            <button
              ref={moreButtonRef}
              type="button"
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              onClick={() => setMoreOpen((value) => !value)}
              className="grid h-9 w-9 place-items-center rounded-lg text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
              aria-label="更多属性"
              title="更多属性"
            >
              <AdvancedEditorIcon name="more" />
            </button>
            {moreOpen && (
              <div
                role="dialog"
                aria-label="更多属性"
                className="absolute right-0 top-full z-[90] mt-2 flex max-h-[min(60vh,32rem)] min-w-64 w-max max-w-[min(48rem,calc(100vw-2rem))] flex-wrap justify-end gap-1 overflow-auto rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {overflow.map((control) => renderControl(control, false))}
              </div>
            )}
          </div>
        )}
      </div>
      {trailing && (
        <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-[var(--divider,#e7e5e4)] pl-2">{trailing}</div>
      )}
      {fallbackPanel}
    </div>
  );
}
