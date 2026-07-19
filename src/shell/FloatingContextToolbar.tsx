"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../i18n/ui/useUI";
import { advancedWorkbenchStyle } from "./advanced-workbench-chrome";
import {
  clampFloatingToolbar,
  sameFloatingToolbarPoint,
  type FloatingToolbarPoint,
} from "./floating-toolbar-geometry";

interface FloatingToolbarDrag {
  pointerId: number;
  startX: number;
  startY: number;
  originOffset: FloatingToolbarPoint;
}

export interface FloatingContextToolbarController {
  leading: ReactNode;
  trailing: ReactNode;
  portalRoot: HTMLElement | null;
  toolbarRef: RefObject<HTMLDivElement | null>;
  offset: FloatingToolbarPoint;
  position: FloatingToolbarPoint;
}

export function useFloatingContextToolbar({
  workspaceRootRef,
  stageRef,
  resetKey,
}: {
  workspaceRootRef?: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  resetKey: string;
}): FloatingContextToolbarController {
  const tt = useUI();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<FloatingToolbarDrag | null>(null);
  const offsetRef = useRef<FloatingToolbarPoint>({ x: 0, y: 0 });
  const positionRef = useRef<FloatingToolbarPoint>({ x: 0, y: 0 });
  const [offset, setOffset] = useState<FloatingToolbarPoint>(offsetRef.current);
  const [position, setPosition] = useState<FloatingToolbarPoint>(
    positionRef.current,
  );
  const [dragging, setDragging] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const defaultPosition = useCallback((): FloatingToolbarPoint => {
    const root = portalRoot?.getBoundingClientRect();
    const stage = stageRef.current?.getBoundingClientRect();
    if (!root || !stage) return { x: 0, y: 0 };
    const selection = toolbarRef.current?.querySelector<HTMLElement>(
      "[data-selection-anchor-x][data-selection-anchor-y]",
    );
    if (selection) {
      const x = Number(selection.dataset.selectionAnchorX);
      const y = Number(selection.dataset.selectionAnchorY);
      const width = Number(selection.dataset.selectionAnchorWidth || 0);
      const height = Number(selection.dataset.selectionAnchorHeight || 0);
      const toolbarHeight =
        toolbarRef.current?.getBoundingClientRect().height || 0;
      const toolbarWidth =
        toolbarRef.current?.getBoundingClientRect().width || 0;
      if ([x, y, width, height].every(Number.isFinite)) {
        const above = y - root.top - toolbarHeight - 8;
        return {
          x: Math.max(0, x + width / 2 - root.left - toolbarWidth / 2),
          y:
            above >= 0
              ? above
              : Math.max(0, y + height - root.top + 8),
        };
      }
    }
    return {
      x: Math.max(0, stage.left - root.left - 8),
      y: Math.max(0, stage.top - root.top - 8),
    };
  }, [portalRoot, stageRef]);
  const positionForOffset = useCallback(
    (nextOffset: FloatingToolbarPoint): FloatingToolbarPoint => {
      const container = portalRoot?.getBoundingClientRect();
      const toolbar = toolbarRef.current?.getBoundingClientRect();
      if (!container || !toolbar) return { x: 0, y: 0 };
      const anchor = defaultPosition();
      const visualViewport =
        typeof window === "undefined" ? null : window.visualViewport;
      const visualLeft = visualViewport?.offsetLeft || 0;
      const visualTop = visualViewport?.offsetTop || 0;
      const visualRight =
        visualLeft + (visualViewport?.width || window.innerWidth);
      const visualBottom =
        visualTop + (visualViewport?.height || window.innerHeight);
      const minX = Math.max(0, visualLeft - container.left);
      const minY = Math.max(0, visualTop - container.top);
      const visibleWidth = Math.max(
        0,
        Math.min(container.right, visualRight) -
          Math.max(container.left, visualLeft),
      );
      const visibleHeight = Math.max(
        0,
        Math.min(container.bottom, visualBottom) -
          Math.max(container.top, visualTop),
      );
      const clamped = clampFloatingToolbar(
        {
          x: anchor.x + nextOffset.x - minX,
          y: anchor.y + nextOffset.y - minY,
        },
        { width: visibleWidth, height: visibleHeight },
        { width: toolbar.width, height: toolbar.height },
      );
      return { x: clamped.x + minX, y: clamped.y + minY };
    },
    [defaultPosition, portalRoot],
  );
  const setSharedOffset = useCallback(
    (nextOffset: FloatingToolbarPoint) => {
      offsetRef.current = nextOffset;
      setOffset((current) =>
        sameFloatingToolbarPoint(current, nextOffset) ? current : nextOffset,
      );
      const nextPosition = positionForOffset(nextOffset);
      positionRef.current = nextPosition;
      setPosition((current) =>
        sameFloatingToolbarPoint(current, nextPosition)
          ? current
          : nextPosition,
      );
    },
    [positionForOffset],
  );
  const resetSharedOffset = useCallback(
    () => setSharedOffset({ x: 0, y: 0 }),
    [setSharedOffset],
  );
  const finishDrag = useCallback((pointerId?: number) => {
    if (
      pointerId !== undefined &&
      dragRef.current?.pointerId !== pointerId
    ) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
  }, []);
  const moveByKeyboard = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const distance = event.shiftKey ? 48 : 16;
      let next: FloatingToolbarPoint | null = null;
      if (event.key === "ArrowLeft") {
        next = { ...offsetRef.current, x: offsetRef.current.x - distance };
      } else if (event.key === "ArrowRight") {
        next = { ...offsetRef.current, x: offsetRef.current.x + distance };
      } else if (event.key === "ArrowUp") {
        next = { ...offsetRef.current, y: offsetRef.current.y - distance };
      } else if (event.key === "ArrowDown") {
        next = { ...offsetRef.current, y: offsetRef.current.y + distance };
      } else if (event.key === "Home") {
        event.preventDefault();
        resetSharedOffset();
        return;
      }
      if (!next) return;
      event.preventDefault();
      setSharedOffset(next);
    },
    [resetSharedOffset, setSharedOffset],
  );

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.currentTarget.focus();
      event.preventDefault();
      const anchor = defaultPosition();
      const rebasedOffset = {
        x: positionRef.current.x - anchor.x,
        y: positionRef.current.y - anchor.y,
      };
      offsetRef.current = rebasedOffset;
      setOffset(rebasedOffset);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originOffset: rebasedOffset,
      };
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [defaultPosition],
  );
  const continueDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setSharedOffset({
        x: drag.originOffset.x + event.clientX - drag.startX,
        y: drag.originOffset.y + event.clientY - drag.startY,
      });
    },
    [setSharedOffset],
  );
  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      finishDrag(event.pointerId);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
    [finishDrag],
  );
  const makeHandle = useCallback(
    (side: "left" | "right") => (
      <button
        type="button"
        data-floating-toolbar-handle={side}
        data-floating-toolbar-offset={`${offset.x},${offset.y}`}
        onPointerDown={beginDrag}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={(event) => finishDrag(event.pointerId)}
        onLostPointerCapture={(event) => finishDrag(event.pointerId)}
        onDoubleClick={resetSharedOffset}
        onKeyDown={moveByKeyboard}
        className={`grid h-11 w-11 shrink-0 touch-none select-none place-items-center rounded-xl text-[13px] text-[var(--awb-muted)] outline-none transition hover:bg-[var(--awb-hover)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/40 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        aria-label={tt(
          side === "left" ? "从左侧拖动编辑栏" : "从右侧拖动编辑栏",
        )}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
        title={tt("拖动编辑栏；双击复位")}
      >
        ⠿
      </button>
    ),
    [
      beginDrag,
      continueDrag,
      dragging,
      endDrag,
      finishDrag,
      moveByKeyboard,
      offset.x,
      offset.y,
      resetSharedOffset,
      tt,
    ],
  );
  const leading = useMemo(() => makeHandle("left"), [makeHandle]);
  const trailing = useMemo(() => makeHandle("right"), [makeHandle]);

  useLayoutEffect(() => {
    setPortalRoot(workspaceRootRef?.current || stageRef.current);
  }, [stageRef, workspaceRootRef]);
  useLayoutEffect(() => {
    if (!portalRoot) return;
    const update = () => setSharedOffset(offsetRef.current);
    update();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(update);
    observer?.observe(portalRoot);
    if (toolbarRef.current) observer?.observe(toolbarRef.current);
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(update);
    if (toolbarRef.current) {
      mutationObserver?.observe(toolbarRef.current, {
        attributes: true,
        subtree: true,
        attributeFilter: [
          "data-selection-anchor-x",
          "data-selection-anchor-y",
          "data-selection-anchor-width",
          "data-selection-anchor-height",
        ],
      });
    }
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [portalRoot, setSharedOffset]);
  useEffect(() => {
    resetSharedOffset();
    finishDrag();
  }, [finishDrag, resetKey, resetSharedOffset]);

  return { leading, trailing, portalRoot, toolbarRef, offset, position };
}

export function FloatingContextToolbar({
  controller,
  accent,
  children,
}: {
  controller: FloatingContextToolbarController;
  accent: string;
  children?: ReactNode;
}) {
  if (!children || !controller.portalRoot) return null;
  return createPortal(
    <div
      data-advanced-context-row
      data-workspace-floating-toolbar
      ref={controller.toolbarRef}
      className="absolute left-2 top-2 z-[2147483000] inline-flex w-fit max-w-[calc(100%-1rem)] overflow-visible will-change-transform"
      style={{
        ...advancedWorkbenchStyle(accent),
        transform: `translate3d(${controller.position.x}px, ${controller.position.y}px, 0)`,
      }}
    >
      {children}
    </div>,
    controller.portalRoot,
  );
}
