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
import { SelectionAnimationGallery } from "./SelectionAnimationGallery";
import { SelectionToolbarButtonControl } from "./SelectionToolbarButtonControl";
import { SelectionToolbarNumberControl } from "./SelectionToolbarNumberControl";
import {
  selectionRequestId,
  type SelectionPanelAction,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
  type SelectionControlValue,
} from "./selection-context";
import {
  DESIGN_TEXT_CONTROL_ORDER,
  groupSelectionOverflowControls,
  nextTextAlignment,
  orderDesignTextControls,
  partitionSelectionControls,
  selectionControlSemantic,
  selectionControlUsesIconOnly,
  SELECTION_TOOLBAR_VIEWPORT_MAX,
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

function hasCanonicalAlignmentCapability(control: SelectionControl): boolean {
  if (control.kind !== "select") return false;
  const declaredValues = new Set(
    (control.options || []).map((option) => option.value),
  );
  return ["left", "center", "right", "justify"].every((value) =>
    declaredValues.has(value),
  );
}

function Control({
  control,
  selectionId,
  selectionRevision,
  selectionEpoch,
  onCommand,
  onOpenPanel,
  accent,
  canonicalDesignText = false,
  activePanel = false,
  presentation = "compact",
  onActivated,
}: {
  control: SelectionControl;
  selectionId: string;
  selectionRevision?: SelectionContext["revision"];
  selectionEpoch?: SelectionContext["epoch"];
  onCommand: (command: SelectionCommand) => void;
  onOpenPanel?: (panelId: string, panelAction?: SelectionPanelAction) => void;
  accent: string;
  canonicalDesignText?: boolean;
  activePanel?: boolean;
  presentation?: "compact" | "menu";
  onActivated?: () => void;
}) {
  const menu = presentation === "menu";
  const iconOnly = !menu && selectionControlUsesIconOnly(control);
  const emit = (
    value?: SelectionControlValue,
    controlId = control.id,
    history?: SelectionCommand["history"],
  ) =>
    onCommand({
      requestId: selectionRequestId(),
      selectionId,
      controlId,
      ...(value !== undefined ? { value } : {}),
      ...(selectionRevision !== undefined ? { selectionRevision } : {}),
      ...(selectionEpoch !== undefined ? { selectionEpoch } : {}),
      ...(history ? { history } : {}),
    });
  const icon = control.icon
    ? <AdvancedEditorIcon name={control.icon} className="h-[17px] w-[17px]" />
    : null;
  const buttonClass = menu
    ? "group/control flex min-h-11 w-full items-center justify-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-[var(--fg,#292524)] outline-none transition duration-150 hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40 disabled:pointer-events-none disabled:opacity-35"
    : "group/control inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium text-[var(--fg,#292524)] outline-none transition duration-150 hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40 disabled:pointer-events-none disabled:opacity-35";

  if (control.kind === "animation-gallery") {
    return (
      <SelectionAnimationGallery
        control={control}
        selection={{
          id: selectionId,
          revision: selectionRevision,
          epoch: selectionEpoch,
        }}
        onCommand={onCommand}
        accent={accent}
      />
    );
  }

  if (
    canonicalDesignText &&
    selectionControlSemantic(control) === "alignment" &&
    (control.kind === "select" || control.kind === "action")
  ) {
    if (!hasCanonicalAlignmentCapability(control)) return null;
    const current =
      typeof control.value === "string" ? control.value : undefined;
    const next = nextTextAlignment(current);
    const alignmentLabel =
      control.disabled && control.unavailableReason
        ? `${control.label}：${control.unavailableReason}`
        : control.label;
    const alignmentIcon =
      current === "center"
        ? "align-center"
        : current === "right"
          ? "align-right"
          : current === "justify"
            ? "align-justify"
            : "align-left";
    return (
      <button
        type="button"
        disabled={control.disabled}
        onClick={() => {
          emit(next);
          onActivated?.();
        }}
        className={`${buttonClass} ${iconOnly ? "w-11 px-0" : ""}`}
        title={`${alignmentLabel}: ${current || "未设置"}`}
        aria-label={`${alignmentLabel}: ${current || "未设置"}`}
        aria-pressed={current !== undefined}
        data-selection-alignment={current || "unset"}
      >
        <AdvancedEditorIcon
          name={alignmentIcon}
          className="h-[17px] w-[17px]"
        />
        {!iconOnly && (
          <span className="whitespace-nowrap">{control.label}</span>
        )}
      </button>
    );
  }

  if (
    control.kind === "action" ||
    control.kind === "panel" ||
    control.kind === "toggle" ||
    control.kind === "color"
  ) {
    return (
      <SelectionToolbarButtonControl
        control={control}
        buttonClass={buttonClass}
        iconOnly={iconOnly}
        icon={icon}
        accent={accent}
        activePanel={activePanel}
        onOpenPanel={onOpenPanel}
        onActivated={onActivated}
        emit={emit}
      />
    );
  }
  if (control.kind === "select") {
    return (
      <SelectionToolbarSelectControl
        control={control}
        selectionId={selectionId}
        selectionRevision={selectionRevision}
        selectionEpoch={selectionEpoch}
        onCommand={onCommand}
        accent={accent}
        presentation={presentation}
        onActivated={onActivated}
      />
    );
  }
  if (control.kind === "number") {
    return (
      <SelectionToolbarNumberControl
        control={control}
        menu={menu}
        iconOnly={iconOnly}
        icon={icon}
        emit={emit}
      />
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
  const toolsLauncher = layout?.toolsLauncher || null;
  const [moreOpen, setMoreOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const morePanelRef = useRef<HTMLDivElement | null>(null);
  const toolsButtonRef = useRef<HTMLButtonElement | null>(null);
  const morePanelId = `selection-more-${useId().replace(/:/g, "")}`;
  const identity = context
    ? `${context.kind}:${context.id}:${String(context.epoch ?? "")}:${String(
        context.revision ?? "",
      )}`
    : "";
  const sourceControls = useMemo(
    () =>
      (context?.controls || []).filter(
        (control) => control.id !== "undo" && control.id !== "redo",
      ),
    [context],
  );
  const canonicalDesignText =
    toolsLauncher?.id === "design-canvas" &&
    Boolean(context?.kind.toLowerCase().includes("text"));
  const projectedSourceControls = useMemo(
    () =>
      canonicalDesignText
        ? sourceControls.map((control) => {
            const semantic = selectionControlSemantic(control);
            return semantic &&
              DESIGN_TEXT_CONTROL_ORDER.includes(semantic) &&
              control.slot !== "stage" &&
              control.slot !== "context-menu"
              ? { ...control, placement: "primary" as const }
              : control;
          })
        : sourceControls,
    [canonicalDesignText, sourceControls],
  );
  const { compact: controls, groups: inspectorGroups } = useMemo(
    () => partitionSelectionInspectorControls(projectedSourceControls),
    [projectedSourceControls],
  );
  const orderedControls = useMemo(
    () =>
      toolsLauncher?.id === "design-canvas" &&
      context?.kind.toLowerCase().includes("text")
        ? orderDesignTextControls(
            controls.filter(
              (control) =>
                selectionControlSemantic(control) !== "alignment" ||
                hasCanonicalAlignmentCapability(control),
            ),
          )
        : controls,
    [context?.kind, controls, toolsLauncher?.id],
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
        orderedControls,
        new Map(),
        Number.POSITIVE_INFINITY,
      ),
    [orderedControls],
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
  const toolsLauncherId = toolsLauncher?.available
    ? toolsLauncher.id
    : undefined;
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
  const contextTrailing = layout?.contextBarTrailing;
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
          selectionEpoch={context?.epoch}
          onCommand={onCommand}
          onOpenPanel={openControlPanel}
          accent={accent}
          canonicalDesignText={canonicalDesignText}
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
      data-selection-anchor-x={context?.anchor?.x}
      data-selection-anchor-y={context?.anchor?.y}
      data-selection-anchor-width={context?.anchor?.width}
      data-selection-anchor-height={context?.anchor?.height}
      className={`pointer-events-auto flex flex-nowrap items-center gap-1 ${
        effectiveVariant === "floating"
          ? "w-fit max-w-full rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]/96 p-1.5 text-[var(--fg,#292524)] shadow-[0_10px_32px_rgba(15,23,42,.12)] backdrop-blur-xl"
          : "w-full max-w-full bg-transparent p-0 text-[var(--fg,#292524)]"
      } ${className}`}
      style={
        effectiveVariant === "floating"
          ? {
              maxInlineSize: SELECTION_TOOLBAR_VIEWPORT_MAX,
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
      {context && toolsLauncher?.available && (
        <EditorToolsTrigger
          ref={toolsButtonRef}
          selectionKind={context.kind}
          launcher={toolsLauncher}
          accent={accent}
        />
      )}
      {context &&
        toolsLauncher?.available &&
        (visible.length > 0 || overflow.length > 0) && (
        <span className="mx-1 h-6 w-px shrink-0 bg-[var(--divider,#e7e5e4)]" />
      )}
      <div
        ref={controlsRef}
        className="relative flex min-w-0 max-w-full flex-nowrap items-center gap-1 [overflow-x:auto] overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
            className="grid h-11 w-11 place-items-center rounded-xl text-[var(--fg-2,#57534e)] outline-none transition hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40"
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
      {(trailing || contextTrailing) && (
        <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-[var(--divider,#e7e5e4)] pl-2">
          {trailing}
          {contextTrailing}
        </div>
      )}
      {fallbackPanel}
    </div>
  );
}
