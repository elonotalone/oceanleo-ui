"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { AdvancedLayoutState } from "./advanced-layout-context";
import { AnchoredPopover } from "./anchored-popover";
import { SelectionInspectorPanel } from "./SelectionInspectorPanel";
import type { SelectionInspectorGroup } from "./selection-inspector-groups";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionPanelAction,
} from "./selection-context";

function FallbackSelectionInspector({
  group,
  context,
  onCommand,
  accent,
  anchorRef,
  onClose,
}: {
  group: SelectionInspectorGroup;
  context: SelectionContext;
  onCommand: (command: SelectionCommand) => void;
  accent: string;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: (restoreFocus?: boolean) => void;
}) {
  const labelId = useId();
  return (
    <AnchoredPopover
      open
      anchorRef={anchorRef}
      onClose={(reason) => onClose(reason !== "outside")}
      id={group.panelId}
      role="dialog"
      ariaLabelledBy={labelId}
      ariaModal={false}
      align="end"
      maxHeight={560}
      attributes={{
        "data-selection-inspector-fallback": true,
      }}
      className="z-[2147483600] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] shadow-2xl"
      style={{ width: 352 }}
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-[var(--border,#e7e5e4)] px-3">
        <h2
          id={labelId}
          className="truncate text-[12px] font-semibold text-[var(--fg,#292524)]"
        >
          {group.label}
        </h2>
        <button
          type="button"
          onClick={() => onClose()}
          aria-label="关闭属性面板"
          className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted,#78716c)] outline-none transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <SelectionInspectorPanel
          context={context}
          controls={group.controls}
          onCommand={onCommand}
          accent={accent}
        />
      </div>
    </AnchoredPopover>
  );
}

export function useSelectionInspectorHost({
  layout,
  groups,
  context,
  onCommand,
  onOpenPanel,
  accent,
  anchorRef,
  overflowTriggerRef,
}: {
  layout: AdvancedLayoutState | null;
  groups: readonly SelectionInspectorGroup[];
  context: SelectionContext | null;
  onCommand: (command: SelectionCommand) => void;
  onOpenPanel?: (
    panelId: string,
    panelAction?: SelectionPanelAction,
  ) => void;
  accent: string;
  anchorRef: RefObject<HTMLElement | null>;
  overflowTriggerRef?: RefObject<HTMLElement | null>;
}) {
  const [fallbackId, setFallbackId] = useState("");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const fallbackGroup =
    groups.find((group) => group.panelId === fallbackId) || null;
  const hostedGroup =
    groups.find(
      (group) => group.panelId === layout?.activeTransientPanelId,
    ) || null;
  const closeFallback = useCallback((restoreFocus = true) => {
    setFallbackId("");
    const returnFocus = returnFocusRef.current;
    returnFocusRef.current = null;
    if (restoreFocus) {
      window.requestAnimationFrame(() => returnFocus?.focus());
    }
  }, []);

  useEffect(() => {
    if (fallbackId && (!fallbackGroup || !context)) closeFallback();
  }, [closeFallback, context, fallbackGroup, fallbackId]);
  useLayoutEffect(() => {
    if (!layout || !hostedGroup || !context) return;
    layout.updateTransientPanel(
      hostedGroup.panelId,
      <SelectionInspectorPanel
        context={context}
        controls={hostedGroup.controls}
        onCommand={onCommand}
        accent={accent}
      />,
    );
  }, [accent, context, hostedGroup, layout, onCommand]);

  const openPanel = useCallback(
    (panelId: string, panelAction?: SelectionPanelAction) => {
      const inspector = groups.find((group) => group.panelId === panelId);
      if (inspector && context) {
        if (layout) {
          if (layout.activeTransientPanelId === panelId) {
            layout.closeDrawer();
          } else {
            layout.openTransientPanel(
              inspector.panelId,
              inspector.label,
              <SelectionInspectorPanel
                context={context}
                controls={inspector.controls}
                onCommand={onCommand}
                accent={accent}
              />,
            );
          }
        } else if (fallbackId === panelId) {
          closeFallback();
        } else {
          const activeElement =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          const overflowTrigger = overflowTriggerRef?.current || null;
          returnFocusRef.current =
            activeElement?.closest("[data-selection-overflow-control]") &&
            overflowTrigger
              ? overflowTrigger
              : activeElement;
          setFallbackId(panelId);
        }
        return;
      }
      setFallbackId("");
      (onOpenPanel || layout?.openDrawer)?.(panelId, panelAction);
    },
    [
      accent,
      closeFallback,
      context,
      fallbackId,
      groups,
      layout,
      onCommand,
      onOpenPanel,
      overflowTriggerRef,
    ],
  );

  return {
    openPanel,
    activePanelId:
      fallbackId ||
      hostedGroup?.panelId ||
      (layout?.hostPanelVisible ? layout.activeDrawerId : ""),
    fallbackPanel:
      fallbackGroup && context ? (
        <FallbackSelectionInspector
          group={fallbackGroup}
          context={context}
          onCommand={onCommand}
          accent={accent}
          anchorRef={anchorRef}
          onClose={closeFallback}
        />
      ) : null,
  };
}
