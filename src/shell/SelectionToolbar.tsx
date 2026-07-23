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
  selectionLiveCapability,
  selectionMoreDialogLabel,
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

function cssPixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function elementInlineSize(element: HTMLElement | null): number {
  if (!element) return 0;
  const measured = element.getBoundingClientRect().width;
  return measured > 0 ? measured : element.offsetWidth;
}

function elementOuterInlineSize(element: HTMLElement | null): number {
  if (!element) return 0;
  const style = window.getComputedStyle(element);
  return (
    elementInlineSize(element) +
    cssPixelValue(style.marginInlineStart) +
    cssPixelValue(style.marginInlineEnd)
  );
}

function normalizedMeasuredWidth(width: number): number {
  return Math.ceil(width * 2) / 2;
}

function normalizedAvailableWidth(width: number): number {
  return Math.max(0, Math.floor(width * 2) / 2);
}

function equalMeasuredWidths(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [id, width] of left) {
    if (right.get(id) !== width) return false;
  }
  return true;
}

function toolbarFloatingHost(
  toolbar: HTMLDivElement,
): HTMLElement | null {
  return toolbar.closest<HTMLElement>("[data-workspace-floating-toolbar]");
}

function toolbarDockedHost(toolbar: HTMLDivElement): HTMLElement | null {
  return toolbar.closest<HTMLElement>("[data-workspace-docked-toolbar]");
}

function toolbarSizingBoundary(toolbar: HTMLDivElement): HTMLElement | null {
  const floatingHost = toolbarFloatingHost(toolbar);
  if (floatingHost) return floatingHost.parentElement;
  // Docked edit bars fill the action-row dock slot; measure that host's real
  // width so live capabilities (including grid) overflow into More.
  const dockedHost = toolbarDockedHost(toolbar);
  if (dockedHost) return dockedHost;
  return toolbar.parentElement;
}

function toolbarContainerInlineSize(
  toolbar: HTMLDivElement,
  variant: "bar" | "floating",
): number {
  const floatingHost = toolbarFloatingHost(toolbar);
  const dockedHost = toolbarDockedHost(toolbar);
  const boundary = toolbarSizingBoundary(toolbar);
  const boundaryRect = boundary?.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  let width =
    variant === "bar" && !dockedHost && toolbarRect.width > 0
      ? toolbarRect.width
      : boundaryRect?.width || 0;
  if (dockedHost) {
    const dockedWidth = elementInlineSize(dockedHost);
    if (dockedWidth > 0) {
      width = dockedWidth;
    }
  }
  if (boundaryRect && typeof window !== "undefined") {
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportRight =
      viewportLeft + (viewport?.width || window.innerWidth);
    const visibleBoundaryWidth = Math.max(
      0,
      Math.min(boundaryRect.right, viewportRight) -
        Math.max(boundaryRect.left, viewportLeft),
    );
    if (visibleBoundaryWidth > 0) {
      width =
        width > 0
          ? Math.min(width, visibleBoundaryWidth)
          : visibleBoundaryWidth;
    }
  }
  if (floatingHost && width > 0) {
    // FloatingContextToolbar reserves .5rem at both container edges.
    width = Math.max(0, width - 16);
  }
  if (
    (variant === "floating" || dockedHost) &&
    typeof window !== "undefined"
  ) {
    const viewportWidth =
      window.visualViewport?.width || window.innerWidth;
    // SelectionToolbar itself keeps one rem of reachable space per side.
    width = Math.min(width, Math.max(0, viewportWidth - 32));
  }
  return width;
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
  const [availableWidth, setAvailableWidth] = useState(
    Number.POSITIVE_INFINITY,
  );
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
        restoreMoreFocusRef.current = false;
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
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const readLayout = () => {
      restoreMoreFocusRef.current =
        moreButtonRef.current === document.activeElement ||
        Boolean(morePanelRef.current?.contains(document.activeElement));
      const nextMeasured = new Map<string, number>();
      const measurementNodes =
        measurementRef.current?.querySelectorAll<HTMLElement>(
          "[data-selection-measure-control-id]",
        );
      measurementNodes?.forEach((node) => {
        const width = elementInlineSize(node);
        const id = node.dataset.selectionMeasureControlId;
        if (id && width > 0) {
          nextMeasured.set(id, normalizedMeasuredWidth(width));
        }
      });
      setMeasuredWidths((current) =>
        equalMeasuredWidths(current, nextMeasured)
          ? current
          : nextMeasured,
      );

      let containerWidth = toolbarContainerInlineSize(
        toolbar,
        effectiveVariant,
      );
      const measuredViewportCapacity =
        effectiveVariant === "floating"
          ? elementInlineSize(viewportCapacityRef.current)
          : 0;
      if (measuredViewportCapacity > 0) {
        containerWidth = Math.min(
          containerWidth,
          measuredViewportCapacity,
        );
      }
      if (!(containerWidth > 0)) {
        setAvailableWidth(Number.POSITIVE_INFINITY);
        return;
      }
      const style = window.getComputedStyle(toolbar);
      const chromeWidth =
        cssPixelValue(style.paddingInlineStart) +
        cssPixelValue(style.paddingInlineEnd) +
        cssPixelValue(style.borderInlineStartWidth) +
        cssPixelValue(style.borderInlineEndWidth) +
        elementOuterInlineSize(prefixRef.current) +
        elementOuterInlineSize(suffixRef.current);
      const regionCount =
        (prefixVisible ? 1 : 0) +
        (hasAdaptiveControls ? 1 : 0) +
        (suffixVisible ? 1 : 0);
      const regionGaps =
        Math.max(0, regionCount - 1) * cssPixelValue(style.columnGap);
      const nextAvailable = normalizedAvailableWidth(
        containerWidth - chromeWidth - regionGaps,
      );
      setAvailableWidth((current) =>
        current === nextAvailable ? current : nextAvailable,
      );
    };

    readLayout();
    const boundary = toolbarSizingBoundary(toolbar);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(readLayout);
    if (boundary) observer?.observe(boundary);
    if (prefixRef.current) observer?.observe(prefixRef.current);
    if (suffixRef.current) observer?.observe(suffixRef.current);
    if (measurementRef.current) observer?.observe(measurementRef.current);
    if (viewportCapacityRef.current) {
      observer?.observe(viewportCapacityRef.current);
    }
    measurementRef.current
      ?.querySelectorAll<HTMLElement>("[data-selection-measure-control-id]")
      .forEach((node) => observer?.observe(node));
    window.addEventListener("resize", readLayout);
    window.visualViewport?.addEventListener("resize", readLayout);
    window.visualViewport?.addEventListener("scroll", readLayout);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", readLayout);
      window.visualViewport?.removeEventListener("resize", readLayout);
      window.visualViewport?.removeEventListener("scroll", readLayout);
    };
  }, [
    contextLeading,
    contextTrailing,
    effectiveVariant,
    hasAdaptiveControls,
    leading,
    measurementIdentity,
    prefixVisible,
    suffixVisible,
    toolsLauncher,
    trailing,
  ]);

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
  const renderMeasurementControl = (control: SelectionControl) => (
    <div
      key={`measure:${identity}:${control.id}`}
      data-selection-measure-control-id={control.id}
      className="inline-flex shrink-0"
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
        activePanel={false}
        presentation="compact"
      />
    </div>
  );
  const adaptiveRegionVisible = visible.length > 0 || overflow.length > 0;
  const liveCapability = selectionLiveCapability(context?.kind);
  const moreDialogLabel = selectionMoreDialogLabel(context?.kind);
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
      className={`pointer-events-auto relative flex flex-nowrap items-center gap-1 ${
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
          restoreMoreFocusRef.current = false;
          setMoreOpen(false);
        }
      }}
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
              {moreOpen && (
                <div
                  ref={morePanelRef}
                  id={morePanelId}
                  role="dialog"
                  aria-label={moreDialogLabel}
                  aria-modal="false"
                  tabIndex={-1}
                  data-selection-overflow-live-capability={
                    liveCapability?.id || undefined
                  }
                  className="absolute right-0 top-full z-[90] mt-2 grid max-h-[min(60vh,32rem)] w-72 max-w-[calc(100vw-2rem)] gap-1 overflow-y-auto rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
