"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
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
  origin: FloatingToolbarPoint;
}

export interface FloatingContextToolbarController {
  leading: ReactNode;
  portalRoot: HTMLElement | null;
  toolbarRef: RefObject<HTMLDivElement | null>;
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
  const positionRef = useRef<FloatingToolbarPoint>({ x: 0, y: 0 });
  const [position, setPosition] = useState<FloatingToolbarPoint>(
    positionRef.current,
  );
  const [dragging, setDragging] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const setClampedPosition = useCallback(
    (point: FloatingToolbarPoint) => {
      const container = portalRoot?.getBoundingClientRect();
      const toolbar = toolbarRef.current?.getBoundingClientRect();
      const next =
        container && toolbar
          ? clampFloatingToolbar(
              point,
              { width: container.width, height: container.height },
              { width: toolbar.width, height: toolbar.height },
            )
          : { x: 0, y: 0 };
      positionRef.current = next;
      setPosition((current) =>
        sameFloatingToolbarPoint(current, next) ? current : next,
      );
    },
    [portalRoot],
  );
  const defaultPosition = useCallback((): FloatingToolbarPoint => {
    const root = portalRoot?.getBoundingClientRect();
    const stage = stageRef.current?.getBoundingClientRect();
    if (!root || !stage) return { x: 0, y: 0 };
    return {
      x: Math.max(0, stage.left - root.left - 8),
      y: Math.max(0, stage.top - root.top - 8),
    };
  }, [portalRoot, stageRef]);
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
        next = { ...positionRef.current, x: positionRef.current.x - distance };
      } else if (event.key === "ArrowRight") {
        next = { ...positionRef.current, x: positionRef.current.x + distance };
      } else if (event.key === "ArrowUp") {
        next = { ...positionRef.current, y: positionRef.current.y - distance };
      } else if (event.key === "ArrowDown") {
        next = { ...positionRef.current, y: positionRef.current.y + distance };
      } else if (event.key === "Home") {
        next = defaultPosition();
      }
      if (!next) return;
      event.preventDefault();
      setClampedPosition(next);
    },
    [defaultPosition, setClampedPosition],
  );

  const leading = useMemo(
    () => (
      <button
        type="button"
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          event.preventDefault();
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            origin: positionRef.current,
          };
          setDragging(true);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          setClampedPosition({
            x: drag.origin.x + event.clientX - drag.startX,
            y: drag.origin.y + event.clientY - drag.startY,
          });
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          finishDrag(event.pointerId);
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }}
        onPointerCancel={(event) => finishDrag(event.pointerId)}
        onLostPointerCapture={(event) => finishDrag(event.pointerId)}
        onDoubleClick={() => setClampedPosition(defaultPosition())}
        onKeyDown={moveByKeyboard}
        className={`grid h-9 w-6 shrink-0 touch-none select-none place-items-center rounded-lg text-[13px] text-[var(--awb-muted)] outline-none transition hover:bg-[var(--awb-hover)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/40 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        aria-label={tt("拖动编辑栏")}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
        title={tt("拖动编辑栏；双击复位")}
      >
        ⠿
      </button>
    ),
    [
      defaultPosition,
      dragging,
      finishDrag,
      moveByKeyboard,
      setClampedPosition,
      tt,
    ],
  );

  useLayoutEffect(() => {
    setPortalRoot(workspaceRootRef?.current || stageRef.current);
  }, [stageRef, workspaceRootRef]);
  useLayoutEffect(() => {
    if (!portalRoot) return;
    const update = () => setClampedPosition(positionRef.current);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(portalRoot);
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    return () => observer.disconnect();
  }, [portalRoot, setClampedPosition]);
  useEffect(() => {
    setClampedPosition(defaultPosition());
    finishDrag();
  }, [defaultPosition, finishDrag, resetKey, setClampedPosition]);

  return { leading, portalRoot, toolbarRef, position };
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
      className="absolute left-2 top-2 z-[2147483000] flex max-w-[calc(100%-1rem)] min-w-0 will-change-transform"
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
