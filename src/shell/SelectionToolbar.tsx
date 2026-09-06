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
import { AnchoredPopover, runAfterOverlayExit } from "./anchored-popover";
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
import {
  EDIT_BAR_BUTTON_CLASS,
  EDIT_BAR_DIVIDER_CLASS,
  editBarPillStyle,
} from "./edit-bar-surface";
import { publishAgentSelection } from "./agent-review/inbox";
import { partitionSelectionInspectorControls } from "./selection-inspector-groups";
import { useSelectionInspectorHost } from "./selection-inspector-host";
import {
  hasCanonicalAlignmentCapability,
  SelectionToolbarControl,
} from "./SelectionToolbarControl";
import { useSelectionToolbarMeasure } from "./useSelectionToolbarMeasure";
import { useInsideEditBarRow } from "./edit-bar-row-context";
import {
  SelectionOverflowGroups,
  SelectionToolbarAgentButton,
  SelectionToolbarViewportProbe,
} from "./selection-toolbar-chrome";

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
  useEffect(() => {
    publishAgentSelection(context);
  }, [context]);
  const toolsLauncher = layout?.toolsLauncher || null;
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreMounted, setMoreMounted] = useState(false);
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
  // 退场那一档要求元素先留在 DOM 里（`anchored-popover` §规范三），跑完必须真摘掉。
  // 藏住已关面板的唯一规则是注入的 `[data-leo-overlay-state="closed"]`；面板自带
  // Tailwind 的 `grid`，作者层 display 会压掉 `[hidden]`，那条规则一缺席（宿主 CSP
  // 不给内联 style）关掉的「更多」就整块留在屏幕上。摘节点让隐藏不再只靠一张样式表。
  useLayoutEffect(() => {
    if (moreOpen) {
      setMoreMounted(true);
      return;
    }
    // 收尾时机交给共享原语：它自己处理「零预算」（reduced-motion、token 缺席）
    // 与「`display` 这类离散过渡不算报到」，这里不许再写第二套计时（红线 9）。
    return runAfterOverlayExit(morePanelRef.current, () =>
      setMoreMounted(false),
    );
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
  // 在单行编辑栏（FloatingContextToolbar 的 EditBarRow）里，撤销重做 / 宿主后缀 /
  // AI 助手 / 固定柄全部由行来画，本组件只剩「选中对象工具」这一段：不画胶囊、
  // 不画自己的前后缀 chrome，否则同一行出现两个 AI 键、两层胶囊。
  const insideRow = useInsideEditBarRow();
  const contextLeading = insideRow ? undefined : layout?.contextBarLeading;
  const contextTrailing = insideRow ? undefined : layout?.contextBarTrailing;
  const toolsAvailable = Boolean(context && toolsLauncher?.available);
  // AI 键：在单行编辑栏里由行画（见 selection-toolbar-chrome.tsx 注释）。
  const agentButton =
    layout && !insideRow ? (
      <SelectionToolbarAgentButton layout={layout} />
    ) : null;
  const prefixVisible = Boolean(contextLeading || leading || toolsAvailable);
  const suffixVisible = Boolean(agentButton || trailing || contextTrailing);
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
    // 「执行了一个动作之后」才关 More。色板是连续取值：拖动取色器时每一次 onChange
    // 都会走到这里，关掉面板等于把人手里的取色器抽走，所以它留在原地。
    const closeMore =
      presentation === "menu" && control.kind !== "color"
        ? () => {
            setMoreOpen(false);
            if (control.kind !== "panel") moreButtonRef.current?.focus();
          }
        : undefined;
    return (
      <div
        key={`${identity}:${control.id}`}
        data-selection-control-id={control.id}
        data-edit-bar-interactive
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
          onActivated={closeMore}
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
          ? "w-fit max-w-full"
          : "w-full max-w-full bg-transparent p-0 text-[var(--fg,#292524)]"
      } ${className}`}
      style={
        effectiveVariant === "floating" && insideRow
          ? {
              // 行是胶囊；这一段透明、无内边距，只保留像素上限防止溢出。
              maxInlineSize:
                floatingMaxInlineSize > 0
                  ? `${floatingMaxInlineSize}px`
                  : SELECTION_TOOLBAR_VIEWPORT_MAX,
            }
          : effectiveVariant === "floating"
          ? {
              // 胶囊外观来自共享配方，插件不得在此处各自加圆角/阴影。
              ...editBarPillStyle(),
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
      role={insideRow ? "group" : "toolbar"}
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
              <span className={EDIT_BAR_DIVIDER_CLASS} />
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
            <span className={EDIT_BAR_DIVIDER_CLASS} />
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
                data-edit-bar-interactive
                className={EDIT_BAR_BUTTON_CLASS}
                aria-label={moreDialogLabel}
                title={moreDialogLabel}
              >
                <AdvancedEditorIcon name="more" />
              </button>
              {(moreOpen || moreMounted) && (
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
                  <SelectionOverflowGroups
                    groups={overflowGroups}
                    liveCapability={liveCapability}
                    morePanelId={morePanelId}
                    renderControl={(control) => renderControl(control, "menu")}
                  />
                </AnchoredPopover>
              )}
            </div>
          )}
        </div>
      )}
      {suffixVisible && (
        <div
          ref={suffixRef}
          data-selection-toolbar-suffix
          className="ml-1 flex shrink-0 items-center gap-1 border-l border-[var(--pchrome-line,var(--divider,#e7e5e4))]/60 pl-2"
        >
          {trailing}
          {contextTrailing}
          {agentButton}
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
        <SelectionToolbarViewportProbe probeRef={viewportCapacityRef} />
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
