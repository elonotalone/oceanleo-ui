"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import type { AdvancedLayoutState } from "./advanced-layout-context";
import { EditBarFloatingPanel, EditBarPanelContext, useEditBarPanelStack } from "./EditBarFloatingPanel";
import { SelectionInspectorPanel } from "./SelectionInspectorPanel";
import type { SelectionInspectorGroup } from "./selection-inspector-groups";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionPanelAction,
} from "./selection-context";

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
  const localPanels = useEditBarPanelStack();
  const sharedPanels = useContext(EditBarPanelContext);
  const fallbackPanels = sharedPanels ?? localPanels;
  const fallbackActiveId = fallbackPanels.active?.id ?? "";
  const fallbackId = !layout && (!sharedPanels || groups.some(group => group.panelId === fallbackActiveId)) ? fallbackActiveId : "";
  const { open: openFallback, update: updateFallback } = fallbackPanels;
  const fallbackContainerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    fallbackContainerRef.current = anchorRef.current?.closest<HTMLElement>("[data-edit-bar-layer-root], [data-plugin-chrome]") ?? document.body;
  });
  const onCommandRef = useRef(onCommand);
  useLayoutEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);
  const dispatchCommand = useCallback((command: SelectionCommand) => {
    onCommandRef.current(command);
  }, []);
  const fallbackGroup =
    groups.find((group) => group.panelId === fallbackId) || null;
  const hostedGroup =
    groups.find(
      (group) => group.panelId === layout?.activeTransientPanelId,
    ) || null;
  const closeFallback = fallbackPanels.close;

  useEffect(() => {
    if (fallbackId && (!fallbackGroup || !context)) closeFallback();
  }, [closeFallback, context, fallbackGroup, fallbackId]);
  useLayoutEffect(() => {
    if (!fallbackGroup || !context) return;
    updateFallback(fallbackGroup.panelId, <SelectionInspectorPanel context={context} controls={fallbackGroup.controls} onCommand={dispatchCommand} accent={accent} />);
  }, [accent, context, dispatchCommand, fallbackGroup, updateFallback]);
  const updateTransientPanel = layout?.updateTransientPanel;
  useLayoutEffect(() => {
    if (!updateTransientPanel || !hostedGroup || !context) return;
    // Writing panel content can replace the host layout object. Depend on the
    // writer and panel inputs so that write cannot schedule itself again.
    updateTransientPanel(
      hostedGroup.panelId,
      <SelectionInspectorPanel
        context={context}
        controls={hostedGroup.controls}
        onCommand={dispatchCommand}
        accent={accent}
      />,
    );
  }, [accent, context, dispatchCommand, hostedGroup, updateTransientPanel]);

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
                onCommand={dispatchCommand}
                accent={accent}
              />,
            );
          }
        } else if (fallbackId === panelId) {
          closeFallback();
        } else {
          const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          const anchor = !sharedPanels && activeElement?.closest("[data-selection-overflow-control]") ? overflowTriggerRef?.current ?? undefined : undefined;
          openFallback({ id: panelId, label: inspector.label, anchor, content: <SelectionInspectorPanel context={context} controls={inspector.controls} onCommand={dispatchCommand} accent={accent} /> });
        }
        return;
      }
      // Toggle the shared drawer before forwarding a new request. Clearing it
      // unconditionally would turn a second Replace click into close-then-open.
      if (sharedPanels?.panels.some(panel => panel.id === panelId)) {
        sharedPanels.close();
        return;
      }
      if (!sharedPanels) closeFallback();
      (onOpenPanel || layout?.openDrawer)?.(panelId, panelAction);
    },
    [
      accent,
      closeFallback,
      context,
      fallbackId,
      groups,
      layout,
      dispatchCommand,
      onOpenPanel,
      overflowTriggerRef,
      openFallback,
      sharedPanels,
    ],
  );

  return {
    openPanel,
    activePanelId:
      fallbackId ||
      hostedGroup?.panelId ||
      (layout?.hostPanelVisible ? layout.activeDrawerId : ""),
    fallbackPanel: sharedPanels ? null : <EditBarFloatingPanel controller={fallbackPanels} containerRef={fallbackContainerRef} editBarRef={fallbackContainerRef} />,
  };
}
