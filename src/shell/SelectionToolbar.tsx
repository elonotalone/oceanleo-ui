"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import {
  registerAdvancedToolsTrigger,
  useAdvancedLayout,
} from "./advanced-layout-context";
import { EditorToolsTrigger } from "./EditorToolsIcon";
import {
  selectionRequestId,
  type SelectionPanelAction,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
  type SelectionControlValue,
} from "./selection-context";
import {
  groupSelectionOverflowControls,
  partitionSelectionControls,
  selectionControlUsesIconOnly,
  SELECTION_TOOLBAR_MAX_WIDTH,
} from "./selection-toolbar-layout";
import { partitionSelectionInspectorControls } from "./selection-inspector-groups";
import { useSelectionInspectorHost } from "./selection-inspector-host";
import { SelectionToolbarSelectControl } from "./SelectionToolbarSelectControl";

export interface SelectionToolbarProps {
  context: SelectionContext | null;
  onCommand: (command: SelectionCommand) => void;
  onOpenPanel?: (panelId: string, panelAction?: SelectionPanelAction) => void;
  className?: string;
  accent?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  variant?: "bar" | "floating";
}

function asNumber(
  value: SelectionControlValue | undefined,
  fallback = 0,
): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function Control({
  control,
  selectionId,
  selectionRevision,
  onCommand,
  onOpenPanel,
  accent,
  activePanel = false,
  presentation = "compact",
  onActivated,
}: {
  control: SelectionControl;
  selectionId: string;
  selectionRevision?: SelectionContext["revision"];
  onCommand: (command: SelectionCommand) => void;
  onOpenPanel?: (panelId: string, panelAction?: SelectionPanelAction) => void;
  accent: string;
  activePanel?: boolean;
  presentation?: "compact" | "menu";
  onActivated?: () => void;
}) {
  const menu = presentation === "menu";
  const iconOnly = !menu && selectionControlUsesIconOnly(control);
  const emit = (value?: SelectionControlValue) =>
    onCommand({
      requestId: selectionRequestId(),
      selectionId,
      controlId: control.id,
      ...(value !== undefined ? { value } : {}),
      ...(selectionRevision !== undefined ? { selectionRevision } : {}),
    });
  const icon = control.icon
    ? <AdvancedEditorIcon name={control.icon} className="h-[17px] w-[17px]" />
    : null;
  const buttonClass = menu
    ? "group/control flex min-h-9 w-full items-center justify-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-[var(--fg,#292524)] outline-none transition duration-150 hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40 disabled:pointer-events-none disabled:opacity-35"
    : "group/control inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[var(--fg,#292524)] outline-none transition duration-150 hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40 disabled:pointer-events-none disabled:opacity-35";

  if (control.kind === "action" || control.kind === "panel") {
    return (
      <button
        type="button"
        disabled={control.disabled}
        onClick={() => {
          if (control.kind === "panel" && onOpenPanel) {
            onOpenPanel(control.panelId || control.id, control.panelAction);
            onActivated?.();
            return;
          }
          emit();
          onActivated?.();
        }}
        className={`${buttonClass} ${iconOnly ? "w-9 px-0" : ""} ${
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
        {!iconOnly && <span className="whitespace-nowrap">{control.label}</span>}
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
        onClick={() => {
          emit(!active);
          onActivated?.();
        }}
        className={`${buttonClass} ${iconOnly ? "w-9 px-0" : ""} ${
          active ? "text-white shadow-sm" : ""
        }`}
        style={active ? { background: accent } : undefined}
        title={control.label}
        aria-label={control.label}
      >
        {icon}
        {!iconOnly && <span className="whitespace-nowrap">{control.label}</span>}
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
          iconOnly ? "w-9 px-0" : ""
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
        {!iconOnly && <span className="whitespace-nowrap">{control.label}</span>}
        <input
          type="color"
          value={color}
          disabled={control.disabled}
          onChange={(event) => {
            emit(event.target.value);
            onActivated?.();
          }}
          aria-label={control.label}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    );
  }
  if (control.kind === "select") {
    return (
      <SelectionToolbarSelectControl
        control={control}
        selectionId={selectionId}
        selectionRevision={selectionRevision}
        onCommand={onCommand}
        accent={accent}
        presentation={presentation}
        onActivated={onActivated}
      />
    );
  }
  if (control.kind === "number") {
    const value = asNumber(control.value);
    const step = control.step || 1;
    const clamp = (next: number) =>
      Math.min(
        control.max ?? Number.POSITIVE_INFINITY,
        Math.max(control.min ?? Number.NEGATIVE_INFINITY, next),
      );
    return (
      <div
        className={`flex h-9 shrink-0 items-center overflow-hidden rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] ${
          menu ? "w-full" : ""
        }`}
        title={control.label}
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
  const morePanelRef = useRef<HTMLDivElement | null>(null);
  const toolsButtonRef = useRef<HTMLButtonElement | null>(null);
  const morePanelId = `selection-more-${useId().replace(/:/g, "")}`;
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
        `${control.id}:${control.kind}:${control.slot || ""}:${control.placement || ""}:${control.inspectorGroup || ""}:${
          control.iconOnly === undefined ? "" : control.iconOnly ? 1 : 0
        }`,
    )
    .join("|");
  const { openPanel: openControlPanel, activePanelId, fallbackPanel } =
    useSelectionInspectorHost({
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
    const currentLayout = layoutRef.current;
    if (currentLayout?.activeTransientPanelId.startsWith("selection-")) {
      currentLayout.closeDrawer();
    }
  }, [controlsIdentity, identity]);
  const { visible, overflow } = useMemo(
    () =>
      partitionSelectionControls(
        controls,
        new Map(),
        SELECTION_TOOLBAR_MAX_WIDTH,
      ),
    [controls],
  );
  const overflowGroups = useMemo(
    () => groupSelectionOverflowControls(overflow),
    [overflow],
  );
  useLayoutEffect(() => {
    if (!moreOpen) return;
    const panel = morePanelRef.current;
    const firstControl = panel?.querySelector<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), [tabindex='0']",
    );
    (firstControl || panel)?.focus();
  }, [moreOpen]);
  const toolsLauncher = layout?.toolsLauncher || null;
  const toolsLauncherId = toolsLauncher?.id;
  useLayoutEffect(() => {
    if (!toolsLauncherId) return;
    return registerAdvancedToolsTrigger(toolsLauncherId, () =>
      toolsButtonRef.current?.focus(),
    );
  }, [toolsLauncherId]);
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
  const renderControl = (
    control: SelectionControl,
    presentation: "compact" | "menu",
  ) => {
    return (
      <div
        key={`${identity}:${control.id}`}
        data-selection-control-id={control.id}
        data-selection-overflow-control={
          presentation === "menu" ? true : undefined
        }
        className={
          presentation === "menu"
            ? "flex w-full min-w-0"
            : "inline-flex shrink-0"
        }
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
          presentation={presentation}
          onActivated={
            presentation === "menu"
              ? () => {
                  setMoreOpen(false);
                  if (control.kind !== "panel") {
                    moreButtonRef.current?.focus();
                  }
                }
              : undefined
          }
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
        <EditorToolsTrigger
          ref={toolsButtonRef}
          selectionKind={context.kind}
          launcher={toolsLauncher}
          accent={accent}
        />
      )}
      {context && (
        <span className="mx-1 h-6 w-px shrink-0 bg-[var(--divider,#e7e5e4)]" />
      )}
      <div
        ref={controlsRef}
        className="relative flex min-w-0 flex-1 flex-nowrap items-center gap-1 [overflow-x:auto] overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visible.map((control) => renderControl(control, "compact"))}
      </div>
      {overflow.length > 0 && (
        <div className="relative shrink-0">
          <button
            ref={moreButtonRef}
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            aria-controls={morePanelId}
            onClick={() => setMoreOpen((value) => !value)}
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--fg-2,#57534e)] outline-none transition hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40"
            aria-label="更多属性"
            title="更多属性"
          >
            <AdvancedEditorIcon name="more" />
          </button>
          {moreOpen && (
            <div
              ref={morePanelRef}
              id={morePanelId}
              role="dialog"
              aria-label="更多属性"
              aria-modal="false"
              tabIndex={-1}
              className="absolute right-0 top-full z-[90] mt-2 grid max-h-[min(60vh,32rem)] w-72 max-w-[calc(100vw-2rem)] gap-1 overflow-y-auto rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {overflowGroups.map((group, groupIndex) => (
                <div
                  key={group.id}
                  role="group"
                  aria-label={
                    group.id === "inspectors"
                      ? "属性面板"
                      : group.id === "danger"
                        ? "危险操作"
                        : "更多操作"
                  }
                  data-selection-overflow-group={group.id}
                  className={`grid min-w-0 gap-0.5 ${
                    groupIndex > 0
                      ? "border-t border-[var(--divider,#e7e5e4)] pt-1"
                      : ""
                  }`}
                >
                  {group.controls.map((control) =>
                    renderControl(control, "menu"),
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {trailing && (
        <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-[var(--divider,#e7e5e4)] pl-2">{trailing}</div>
      )}
      {fallbackPanel}
    </div>
  );
}
