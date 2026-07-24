"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type AriaRole,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export interface AnchoredPopoverRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface AnchoredPopoverViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AnchoredPopoverPosition {
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
  placement: "above" | "below";
}

export interface AnchoredPopoverPositionOptions {
  align?: "start" | "center" | "end";
  gap?: number;
  margin?: number;
  maxHeight?: number;
}

export type AnchoredPopoverCloseReason = "escape" | "outside";

const DEFAULT_GAP = 6;
const DEFAULT_MARGIN = 8;
const DEFAULT_FOCUS_SELECTOR =
  '[autofocus]:not(:disabled), [aria-selected="true"]:not([aria-disabled="true"]):not(:disabled), [role="menuitem"]:not([aria-disabled="true"]):not(:disabled), [role="option"]:not([aria-disabled="true"]):not(:disabled), button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';

const AnchoredPopoverLineageContext = createContext<readonly string[]>([]);
const openPopoverStack: string[] = [];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, Math.max(minimum, maximum)));
}

export function computeAnchoredPopoverPosition(
  anchor: AnchoredPopoverRect,
  popover: Pick<AnchoredPopoverRect, "width" | "height">,
  viewport: AnchoredPopoverViewport,
  {
    align = "start",
    gap = DEFAULT_GAP,
    margin = DEFAULT_MARGIN,
    maxHeight: requestedMaxHeight,
  }: AnchoredPopoverPositionOptions = {},
): AnchoredPopoverPosition {
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const innerLeft = viewport.left + margin;
  const innerTop = viewport.top + margin;
  const innerRight = Math.max(innerLeft, viewportRight - margin);
  const innerBottom = Math.max(innerTop, viewportBottom - margin);
  const roomBelow = Math.max(0, innerBottom - anchor.bottom - gap);
  const roomAbove = Math.max(0, anchor.top - gap - innerTop);
  const placement =
    popover.height > roomBelow && roomAbove > roomBelow ? "above" : "below";
  const availableHeight = placement === "above" ? roomAbove : roomBelow;
  const maxHeight = Math.max(
    0,
    Math.min(
      availableHeight,
      requestedMaxHeight ?? Number.POSITIVE_INFINITY,
    ),
  );
  const renderedHeight = Math.min(popover.height, maxHeight);
  const maxWidth = Math.max(0, innerRight - innerLeft);
  const renderedWidth = Math.min(popover.width, maxWidth);
  const rawLeft =
    align === "end"
      ? anchor.right - renderedWidth
      : align === "center"
        ? anchor.left + (anchor.width - renderedWidth) / 2
        : anchor.left;
  const left = clamp(rawLeft, innerLeft, innerRight - renderedWidth);
  const rawTop =
    placement === "above"
      ? anchor.top - gap - renderedHeight
      : anchor.bottom + gap;
  const top = clamp(rawTop, innerTop, innerBottom - renderedHeight);
  return { left, top, maxWidth, maxHeight, placement };
}

function samePosition(
  left: AnchoredPopoverPosition,
  right: AnchoredPopoverPosition,
): boolean {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.maxWidth === right.maxWidth &&
    left.maxHeight === right.maxHeight &&
    left.placement === right.placement
  );
}

function visualViewportRect(): AnchoredPopoverViewport {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
    width: viewport?.width || window.innerWidth,
    height: viewport?.height || window.innerHeight,
  };
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function targetBelongsToLineage(
  target: EventTarget | null,
  popoverId: string,
): boolean {
  const popover = eventTargetElement(target)?.closest<HTMLElement>(
    "[data-anchored-popover-lineage]",
  );
  return Boolean(
    popover?.dataset.anchoredPopoverLineage
      ?.split(/\s+/)
      .includes(popoverId),
  );
}

export interface AnchoredPopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLElement | null>;
  onClose: (reason: AnchoredPopoverCloseReason) => void;
  children: ReactNode;
  id?: string;
  role?: AriaRole;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaModal?: boolean;
  tabIndex?: number;
  align?: "start" | "center" | "end";
  gap?: number;
  margin?: number;
  maxHeight?: number;
  className?: string;
  style?: CSSProperties;
  attributes?: Record<string, string | number | boolean | undefined>;
  initialFocusSelector?: string | false;
  restoreFocusOnEscape?: boolean;
}

/**
 * Shared portal-backed anchored surface for menus, listboxes and dialogs.
 * React portals preserve logical nesting while the DOM node escapes transformed
 * toolbar roots and overflow-hidden panes.
 */
export function AnchoredPopover({
  open,
  anchorRef,
  panelRef,
  onClose,
  children,
  id: providedId,
  role,
  ariaLabel,
  ariaLabelledBy,
  ariaModal,
  tabIndex = -1,
  align = "start",
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
  maxHeight,
  className = "",
  style,
  attributes,
  initialFocusSelector = DEFAULT_FOCUS_SELECTOR,
  restoreFocusOnEscape = true,
}: AnchoredPopoverProps) {
  const generatedId = useId().replace(/:/g, "");
  const popoverId = providedId || `anchored-popover-${generatedId}`;
  const parentLineage = useContext(AnchoredPopoverLineageContext);
  const lineage = [...parentLineage, popoverId];
  const internalPanelRef = useRef<HTMLElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const [positioned, setPositioned] = useState(false);
  const [position, setPosition] = useState<AnchoredPopoverPosition>({
    left: DEFAULT_MARGIN,
    top: DEFAULT_MARGIN,
    maxWidth: 0,
    maxHeight: 0,
    placement: "below",
  });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const setPanel = useCallback(
    (node: HTMLElement | null) => {
      internalPanelRef.current = node;
      if (panelRef) {
        (panelRef as MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    [panelRef],
  );

  const moveCompositeFocus = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (
        (role !== "menu" && role !== "listbox") ||
        !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
      ) {
        return;
      }
      const items = [
        ...(internalPanelRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([aria-disabled="true"]):not(:disabled), [role="option"]:not([aria-disabled="true"]):not(:disabled)',
        ) || []),
      ];
      if (!items.length) return;
      const activeIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowUp"
              ? activeIndex <= 0
                ? items.length - 1
                : activeIndex - 1
              : activeIndex < 0 || activeIndex === items.length - 1
                ? 0
                : activeIndex + 1;
      event.preventDefault();
      event.stopPropagation();
      items[nextIndex]?.focus();
    },
    [role],
  );

  useLayoutEffect(() => {
    if (!open) {
      setPortalRoot(null);
      setPositioned(false);
      return;
    }
    const updatePortalRoot = () => {
      setPortalRoot(document.fullscreenElement ?? document.body);
    };
    updatePortalRoot();
    document.addEventListener("fullscreenchange", updatePortalRoot);
    return () =>
      document.removeEventListener("fullscreenchange", updatePortalRoot);
  }, [open]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const panel = internalPanelRef.current;
    if (!anchor || !panel) return;
    const panelRect = panel.getBoundingClientRect();
    const naturalWidth = Math.max(panelRect.width, panel.scrollWidth || 0);
    const naturalHeight = Math.max(panelRect.height, panel.scrollHeight || 0);
    const next = computeAnchoredPopoverPosition(
      anchor,
      {
        width: naturalWidth,
        height: naturalHeight,
      },
      visualViewportRect(),
      { align, gap, margin, maxHeight },
    );
    setPosition((current) => (samePosition(current, next) ? current : next));
    setPositioned(true);
  }, [align, anchorRef, gap, margin, maxHeight]);

  useLayoutEffect(() => {
    if (!open || !portalRoot) return;
    setPositioned(false);
    updatePosition();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    if (internalPanelRef.current) observer?.observe(internalPanelRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [anchorRef, open, portalRoot, updatePosition]);

  useEffect(() => {
    if (!open || !portalRoot) return;
    openPopoverStack.push(popoverId);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        openPopoverStack.at(-1) !== popoverId
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current("escape");
      if (restoreFocusOnEscape) {
        anchorRef.current?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        internalPanelRef.current?.contains(target) ||
        targetBelongsToLineage(event.target, popoverId)
      ) {
        return;
      }
      onCloseRef.current("outside");
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      const index = openPopoverStack.lastIndexOf(popoverId);
      if (index >= 0) openPopoverStack.splice(index, 1);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [anchorRef, open, popoverId, portalRoot, restoreFocusOnEscape]);

  useLayoutEffect(() => {
    if (!open || !portalRoot || initialFocusSelector === false) return;
    const panel = internalPanelRef.current;
    const initial = panel?.querySelector<HTMLElement>(initialFocusSelector);
    (initial || panel)?.focus();
  }, [initialFocusSelector, open, portalRoot]);

  if (!open || !portalRoot) return null;
  return createPortal(
    <AnchoredPopoverLineageContext.Provider value={lineage}>
      <div
        {...attributes}
        ref={setPanel}
        id={popoverId}
        role={role}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-modal={ariaModal}
        tabIndex={tabIndex}
        onKeyDown={moveCompositeFocus}
        data-anchored-popover
        data-anchored-popover-id={popoverId}
        data-anchored-popover-lineage={lineage.join(" ")}
        data-anchored-placement={position.placement}
        className={className}
        style={{
          ...style,
          position: "fixed",
          boxSizing: "border-box",
          left: position.left,
          top: position.top,
          maxWidth: positioned ? position.maxWidth : undefined,
          maxHeight: positioned ? position.maxHeight : maxHeight,
          visibility: positioned ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </AnchoredPopoverLineageContext.Provider>,
    portalRoot,
  );
}
