"use client";

import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { AnchoredPopover } from "./anchored-popover";
import {
  registerAdvancedToolsTrigger,
  useAdvancedLayout,
} from "./advanced-layout-context";
import { EditorToolsTrigger } from "./EditorToolsIcon";
import {
  type SelectionPanelAction,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
} from "./selection-context";
import {
  DESIGN_TEXT_CONTROL_ORDER,
  groupSelectionOverflowControls,
  orderDesignTextControls,
  partitionSelectionControls,
  selectionControlSemantic,
  selectionLiveCapability,
  selectionMoreDialogLabel,
  SELECTION_TOOLBAR_VIEWPORT_MAX,
} from "./selection-toolbar-layout";
import { partitionSelectionInspectorControls } from "./selection-inspector-groups";
import { useSelectionInspectorHost } from "./selection-inspector-host";
import {
  hasCanonicalAlignmentCapability,
  SelectionToolbarControl,
} from "./SelectionToolbarControl";
import { useSelectionToolbarMeasure } from "./useSelectionToolbarMeasure";


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
  const [availableWidth, setAvailableWidth] = useState(
    Number.POSITIVE_INFINITY,
  );
  const [floatingMaxInlineSize, setFloatingMaxInlineSize] = useState(0);
  const [measuredWidths, setMeasuredWidths] = useState<
    ReadonlyMap<string, number>
  >(() => new Map());
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const prefixRef = useRef<HTMLDivElement | null>(null);
  const suffixRef = useRef<HTMLDivElement | null>(null);
  const measurementRef = useRef<HTMLDivElement | null>(null);
  const viewportCapacityRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const morePanelRef = useRef<HTMLDivElement | null>(null);
  const restoreMoreFocusRef = useRef(false);
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
              control.placement !== "more" &&
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
  const measurementIdentity = orderedControls
    .map(
      (control) =>
        `${control.id}:${control.kind}:${control.label}:${String(
          control.value ?? "",
        )}:${(control.options || [])
          .map((option) => `${option.value}:${option.label}`)
          .join(",")}:${control.icon || ""}:${control.suffix || ""}:${
          control.iconOnly === false ? "label" : "icon"
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
      overflowTriggerRef: moreButtonRef,
    });
  useLayoutEffect(() => {
    setMoreOpen(false);
    const currentLayout = layoutRef.current;
    if (currentLayout?.activeTransientPanelId.startsWith("selection-")) {
      currentLayout.closeDrawer();
    }
  }, [controlsIdentity, identity]);
  const semanticProjection = useMemo(
    () =>
      partitionSelectionControls(
        orderedControls,
        new Map(),
        Number.POSITIVE_INFINITY,
      ),
    [orderedControls],
  );
  const measurableControls = semanticProjection.visible;
  const hasAdaptiveControls =
    measurableControls.length > 0 || semanticProjection.overflow.length > 0;
  const { visible, overflow } = useMemo(
    () =>
      partitionSelectionControls(
        orderedControls,
        measuredWidths,
        availableWidth,
      ),
    [availableWidth, measuredWidths, orderedControls],
  );
  const overflowGroups = useMemo(
    () => groupSelectionOverflowControls(overflow),
    [overflow],
  );
  const overflowIdentity = overflow.map((control) => control.id).join("|");
  useLayoutEffect(() => {
    if (!moreOpen) return;
    const panel = morePanelRef.current;
    if (panel?.contains(document.activeElement)) return;
    const firstControl = panel?.querySelector<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), [tabindex='0']",
    );
    (firstControl || panel)?.focus();
  }, [moreOpen, overflowIdentity]);
  const toolsLauncherId = toolsLauncher?.available
    ? toolsLauncher.id
    : undefined;
  useLayoutEffect(() => {
    if (!toolsLauncherId) return;
    return registerAdvancedToolsTrigger(toolsLauncherId, () =>
      toolsButtonRef.current?.focus(),
    );
  }, [toolsLauncherId]);
  useLayoutEffect(() => {
    if (
      overflow.length ||
      (!moreOpen && !restoreMoreFocusRef.current)
    ) {
      return;
    }
    if (moreOpen) setMoreOpen(false);
    if (restoreMoreFocusRef.current || moreOpen) {
      const focusable = toolbarRef.current?.querySelectorAll<HTMLElement>(
        "[data-selection-control-id] button:not(:disabled), [data-selection-control-id] input:not(:disabled), [data-selection-control-id] [tabindex='0']",
      );
      focusable?.item(Math.max(0, focusable.length - 1))?.focus();
    }
    restoreMoreFocusRef.current = false;
  }, [moreOpen, overflow.length]);

  const effectiveVariant = layout ? "floating" : variant;
  const contextLeading = layout?.contextBarLeading;
  const contextTrailing = layout?.contextBarTrailing;
  const toolsAvailable = Boolean(context && toolsLauncher?.available);
  const prefixVisible = Boolean(contextLeading || leading || toolsAvailable);
  const suffixVisible = Boolean(trailing || contextTrailing);
  useSelectionToolbarMeasure({
    toolbarRef,
    prefixRef,
    suffixRef,
    measurementRef,
    viewportCapacityRef,
    moreButtonRef,
    morePanelRef,
    restoreMoreFocusRef,
    effectiveVariant,
    prefixVisible,
    suffixVisible,
    hasAdaptiveControls,
    contextLeading,
    contextTrailing,
    leading,
    trailing,
    toolsLauncher,
    measurementIdentity,
    setMeasuredWidths,
    setAvailableWidth,
    setFloatingMaxInlineSize,
  });

  if (!context && !leading && !trailing) return null;
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
        <SelectionToolbarControl
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
  const renderMeasurementControl = (control: SelectionControl) => (
    <div
      key={`measure:${identity}:${control.id}`}
      data-selection-measure-control-id={control.id}
      className="inline-flex shrink-0"
    >
      <SelectionToolbarControl
        control={control}
        selectionId={context?.id || ""}
        selectionRevision={context?.revision}
        selectionEpoch={context?.epoch}
        onCommand={onCommand}
        onOpenPanel={openControlPanel}
        accent={accent}
        canonicalDesignText={canonicalDesignText}
        activePanel={false}
        presentation="compact"
        forMeasurement
      />
    </div>
  );
  const adaptiveRegionVisible = visible.length > 0 || overflow.length > 0;
  const liveCapability = selectionLiveCapability(context?.kind);
  const moreDialogLabel = selectionMoreDialogLabel(context?.kind);
  const overflowGroupLabelId = (groupId: string, groupIndex: number) =>
    `${morePanelId}-group-${groupIndex}-${groupId.replace(
      /[^a-z0-9_-]/gi,
      "-",
    )}`;
  return (
    <div
      ref={toolbarRef}
      data-selection-kind={context?.kind || "none"}
      data-selection-live-capability={liveCapability?.id || undefined}
      data-selection-id={context?.id || ""}
      data-selection-anchor-x={context?.anchor?.x}
      data-selection-anchor-y={context?.anchor?.y}
      data-selection-anchor-width={context?.anchor?.width}
      data-selection-anchor-height={context?.anchor?.height}
      data-selection-visible-controls={visible
        .map((control) => control.id)
        .join(" ")}
      data-selection-overflow-controls={overflow
        .map((control) => control.id)
        .join(" ")}
      className={`pointer-events-auto relative flex min-w-0 flex-nowrap items-center gap-1 ${
        effectiveVariant === "floating"
          ? "w-fit max-w-full rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]/96 p-1.5 text-[var(--fg,#292524)] shadow-[0_10px_32px_rgba(15,23,42,.12)] backdrop-blur-xl"
          : "w-full max-w-full bg-transparent p-0 text-[var(--fg,#292524)]"
      } ${className}`}
      style={
        effectiveVariant === "floating"
          ? {
              // Pixel remaining-strip ceiling beats 100dvw: the latter only
              // caps magnitude and still lets a translated bar grow past
              // innerWidth. Fall back to the viewport max before first measure.
              maxInlineSize:
                floatingMaxInlineSize > 0
                  ? `${floatingMaxInlineSize}px`
                  : SELECTION_TOOLBAR_VIEWPORT_MAX,
            }
          : undefined
      }
      role="toolbar"
      aria-label={context?.label || "编辑器工具栏"}
    >
      {prefixVisible && (
        <div
          ref={prefixRef}
          data-selection-toolbar-prefix
          className="flex shrink-0 items-center gap-1"
        >
          {(contextLeading || leading) && (
            <div className="flex shrink-0 items-center gap-1">
              {contextLeading}
              {leading}
            </div>
          )}
          {(contextLeading || leading) &&
            (toolsAvailable || adaptiveRegionVisible) && (
              <span className="mx-1 h-6 w-px shrink-0 bg-[var(--divider,#e7e5e4)]" />
            )}
          {toolsAvailable && context && toolsLauncher && (
            <EditorToolsTrigger
              ref={toolsButtonRef}
              selectionKind={context.kind}
              launcher={toolsLauncher}
              accent={accent}
            />
          )}
          {toolsAvailable && adaptiveRegionVisible && (
            <span className="mx-1 h-6 w-px shrink-0 bg-[var(--divider,#e7e5e4)]" />
          )}
        </div>
      )}
      {adaptiveRegionVisible && (
        <div
          data-selection-toolbar-adaptive-region
          className="relative flex min-w-0 max-w-full flex-nowrap items-center gap-1"
        >
          {visible.length > 0 && (
            <div className="relative flex min-w-0 max-w-full flex-nowrap items-center gap-1">
              {visible.map((control) => renderControl(control, "compact"))}
            </div>
          )}
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
                aria-label={moreDialogLabel}
                title={moreDialogLabel}
              >
                <AdvancedEditorIcon name="more" />
              </button>
              <AnchoredPopover
                open={moreOpen}
                anchorRef={moreButtonRef}
                panelRef={morePanelRef}
                onClose={(reason) => {
                  if (reason === "outside") {
                    restoreMoreFocusRef.current = false;
                  }
                  setMoreOpen(false);
                }}
                id={morePanelId}
                role="dialog"
                ariaLabel={moreDialogLabel}
                ariaModal={false}
                align="end"
                maxHeight={512}
                attributes={{
                  "data-selection-overflow-live-capability":
                    liveCapability?.id || undefined,
                }}
                className="z-[2147483500] grid w-72 max-w-[calc(100dvw-1rem)] gap-1 overflow-x-hidden overflow-y-auto rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {liveCapability && (
                  <div
                    data-selection-overflow-capability-label
                    className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-[var(--muted,#78716c)]"
                  >
                    {liveCapability.label}
                  </div>
                )}
                {overflowGroups.map((group, groupIndex) => (
                  <div
                    key={group.id}
                    role="group"
                    aria-labelledby={overflowGroupLabelId(
                      group.id,
                      groupIndex,
                    )}
                    data-selection-overflow-group={group.id}
                    data-selection-overflow-group-label={group.label}
                    className={`grid min-w-0 gap-0.5 ${
                      groupIndex > 0
                        ? "border-t border-[var(--divider,#e7e5e4)] pt-1"
                        : ""
                    }`}
                  >
                    <div
                      id={overflowGroupLabelId(group.id, groupIndex)}
                      className="truncate px-2.5 pb-0.5 pt-1 text-[10px] font-semibold tracking-wide text-[var(--muted,#78716c)]"
                    >
                      {group.label}
                    </div>
                    {group.controls.map((control) =>
                      renderControl(control, "menu"),
                    )}
                  </div>
                ))}
              </AnchoredPopover>
            </div>
          )}
        </div>
      )}
      {suffixVisible && (
        <div
          ref={suffixRef}
          data-selection-toolbar-suffix
          className="ml-1 flex shrink-0 items-center gap-1 border-l border-[var(--divider,#e7e5e4)] pl-2"
        >
          {trailing}
          {contextTrailing}
        </div>
      )}
      {context && measurableControls.length > 0 && (
        <div
          ref={measurementRef}
          aria-hidden="true"
          inert
          data-selection-toolbar-measurements
          className="pointer-events-none invisible fixed left-0 top-0 flex w-max flex-nowrap items-center gap-1"
          style={{ contain: "layout style paint" }}
        >
          {measurableControls.map(renderMeasurementControl)}
        </div>
      )}
      {effectiveVariant === "floating" && (
        <div
          ref={viewportCapacityRef}
          aria-hidden="true"
          inert
          data-selection-toolbar-viewport-capacity
          className="pointer-events-none invisible fixed left-0 top-0 h-px"
          style={{
            contain: "strict",
            inlineSize: SELECTION_TOOLBAR_VIEWPORT_MAX,
          }}
        />
      )}
      {!context && (
        <div
          ref={measurementRef}
          aria-hidden="true"
          inert
          className="hidden"
        />
      )}
      {fallbackPanel}
    </div>
  );
}
