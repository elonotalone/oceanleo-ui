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
import { createPortal } from "react-dom";
import type { AdvancedLayoutState } from "./advanced-layout-context";
import { SelectionInspectorPanel } from "./SelectionInspectorPanel";
import type { SelectionInspectorGroup } from "./selection-inspector-groups";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionPanelAction,
} from "./selection-context";

interface FallbackPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

function samePosition(left: FallbackPosition, right: FallbackPosition): boolean {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.maxHeight === right.maxHeight
  );
}

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
  onClose: () => void;
}) {
  const labelId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<FallbackPosition>({
    left: 8,
    top: 8,
    width: 352,
    maxHeight: 560,
  });
  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const margin = 8;
    const width = Math.min(352, Math.max(240, window.innerWidth - margin * 2));
    const maxHeight = Math.min(560, window.innerHeight - margin * 2);
    const roomBelow = window.innerHeight - anchor.bottom - margin * 2;
    const top =
      roomBelow >= Math.min(320, maxHeight)
        ? anchor.bottom + margin
        : Math.max(margin, anchor.top - maxHeight - margin);
    const next = {
      left: Math.max(
        margin,
        Math.min(anchor.right - width, window.innerWidth - width - margin),
      ),
      top,
      width,
      maxHeight,
    };
    setPosition((current) => (samePosition(current, next) ? current : next));
  }, [anchorRef]);

  useLayoutEffect(() => {
    updatePosition();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, updatePosition]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    const frame = window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          "input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)",
        )
        ?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={labelId}
      data-selection-inspector-fallback
      className="fixed z-[2147483600] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] shadow-2xl"
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        maxHeight: position.maxHeight,
      }}
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
          onClick={onClose}
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
    </div>,
    document.body,
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
}) {
  const [fallbackId, setFallbackId] = useState("");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const fallbackGroup =
    groups.find((group) => group.panelId === fallbackId) || null;
  const hostedGroup =
    groups.find(
      (group) => group.panelId === layout?.activeTransientPanelId,
    ) || null;
  const closeFallback = useCallback(() => {
    setFallbackId("");
    const returnFocus = returnFocusRef.current;
    returnFocusRef.current = null;
    window.requestAnimationFrame(() => returnFocus?.focus());
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
          returnFocusRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
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
    ],
  );

  return {
    openPanel,
    activePanelId:
      fallbackId ||
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
