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
import {
  EditBarDragHandle,
  EditBarPinButton,
} from "./EditBarDockControls";
import {
  boundedEditBarDockOffset,
  parseEditBarDockState,
  serializeEditBarDockState,
  type EditBarDockMode,
  type EditBarDockState,
} from "./edit-bar-dock-state";
import {
  clampFloatingToolbar,
  sameFloatingToolbarPoint,
  type FloatingToolbarPoint,
} from "./floating-toolbar-geometry";
const DRAG_THRESHOLD_PX = 4;
interface EditBarDrag {
  pointerId: number;
  startX: number;
  startY: number;
  originMode: EditBarDockMode;
  originOffset: FloatingToolbarPoint;
  lastOffset: FloatingToolbarPoint;
  moved: boolean;
}
export interface EditBarDockController {
  leading: ReactNode;
  trailing: ReactNode;
  portalRoot: HTMLElement | null;
  dockRoot: HTMLElement | null;
  toolbarRef: RefObject<HTMLDivElement | null>;
  mode: EditBarDockMode;
  dragging: boolean;
  dropActive: boolean;
  offset: FloatingToolbarPoint;
  position: FloatingToolbarPoint;
  dock: () => void;
  undock: () => void;
  resetPosition: () => void;
}

export function useEditBarDockController({
  workspaceRootRef,
  stageRef,
  dockRootRef,
  resetKey,
  storageKey,
}: {
  workspaceRootRef?: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  dockRootRef?: RefObject<HTMLDivElement | null>;
  resetKey: string;
  storageKey: string;
}): EditBarDockController {
  const defaultMode: EditBarDockMode = dockRootRef ? "docked" : "floating";
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<EditBarDrag | null>(null);
  const hydratedStorageKeyRef = useRef("");
  const modeRef = useRef<EditBarDockMode>(defaultMode);
  const offsetRef = useRef<FloatingToolbarPoint>({ x: 0, y: 0 });
  const positionRef = useRef<FloatingToolbarPoint>({ x: 0, y: 0 });
  const [mode, setMode] = useState<EditBarDockMode>(defaultMode);
  const [offset, setOffset] = useState<FloatingToolbarPoint>(offsetRef.current);
  const [position, setPosition] = useState<FloatingToolbarPoint>(
    positionRef.current,
  );
  const [dragging, setDragging] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [dockRoot, setDockRoot] = useState<HTMLElement | null>(null);

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

  const persist = useCallback(
    (nextMode: EditBarDockMode, nextOffset: FloatingToolbarPoint) => {
      if (
        typeof window === "undefined" ||
        hydratedStorageKeyRef.current !== storageKey
      ) {
        return;
      }
      try {
        window.localStorage.setItem(
          storageKey,
          serializeEditBarDockState({
            version: 1,
            mode: nextMode,
            offset: nextOffset,
          }),
        );
      } catch {
        // Privacy-restricted embeds may disable storage. The live state remains usable.
      }
    },
    [storageKey],
  );

  const setSharedOffset = useCallback(
    (
      requestedOffset: FloatingToolbarPoint,
      persistChange = true,
      targetMode = modeRef.current,
    ) => {
      let nextOffset = boundedEditBarDockOffset(requestedOffset);
      const nextPosition = positionForOffset(nextOffset);
      const containerRect = portalRoot?.getBoundingClientRect();
      const toolbarRect = toolbarRef.current?.getBoundingClientRect();
      const hasMeasurableGeometry = Boolean(
        containerRect &&
          toolbarRect &&
          containerRect.width > 0 &&
          containerRect.height > 0 &&
          toolbarRect.width > 0 &&
          toolbarRect.height > 0,
      );
      if (targetMode === "floating" && hasMeasurableGeometry) {
        const anchor = defaultPosition();
        nextOffset = boundedEditBarDockOffset({
          x: nextPosition.x - anchor.x,
          y: nextPosition.y - anchor.y,
        });
      }
      offsetRef.current = nextOffset;
      setOffset((current) =>
        sameFloatingToolbarPoint(current, nextOffset) ? current : nextOffset,
      );
      positionRef.current = nextPosition;
      setPosition((current) =>
        sameFloatingToolbarPoint(current, nextPosition)
          ? current
          : nextPosition,
      );
      if (persistChange) persist(targetMode, nextOffset);
      return nextOffset;
    },
    [defaultPosition, persist, portalRoot, positionForOffset],
  );

  const applyModeAndOffset = useCallback(
    (nextMode: EditBarDockMode, nextOffset: FloatingToolbarPoint) => {
      modeRef.current = nextMode;
      setMode(nextMode);
      const appliedOffset = setSharedOffset(nextOffset, false, nextMode);
      persist(nextMode, appliedOffset);
      setDropActive(false);
    },
    [persist, setSharedOffset],
  );

  const floatingOffsetFromCurrentRect = useCallback(() => {
    const root = portalRoot?.getBoundingClientRect();
    const toolbar = toolbarRef.current?.getBoundingClientRect();
    if (!root || !toolbar) return offsetRef.current;
    const anchor = defaultPosition();
    return boundedEditBarDockOffset({
      x: toolbar.left - root.left - anchor.x,
      y: toolbar.top - root.top - anchor.y,
    });
  }, [defaultPosition, portalRoot]);

  const dock = useCallback(() => {
    if (!dockRootRef) return;
    applyModeAndOffset("docked", offsetRef.current);
  }, [applyModeAndOffset, dockRootRef]);

  const undock = useCallback(() => {
    applyModeAndOffset("floating", offsetRef.current);
  }, [applyModeAndOffset]);

  const toggleDock = useCallback(() => {
    if (!dockRootRef) return;
    if (modeRef.current === "docked") undock();
    else dock();
  }, [dock, dockRootRef, undock]);

  const resetPosition = useCallback(() => {
    setSharedOffset({ x: 0, y: 0 });
  }, [setSharedOffset]);

  const pointInsideDock = useCallback(
    (clientX: number, clientY: number) => {
      const target = dockRootRef?.current || dockRoot;
      if (!target) return false;
      const rect = target.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    },
    [dockRoot, dockRootRef],
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
    setDropActive(false);
  }, []);

  const moveByKeyboard = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        if (!dockRootRef) return;
        event.preventDefault();
        toggleDock();
        return;
      }
      const distance = event.shiftKey ? 48 : 16;
      let next: FloatingToolbarPoint | null = null;
      const origin = offsetRef.current;
      if (event.key === "ArrowLeft") {
        next = { ...origin, x: origin.x - distance };
      } else if (event.key === "ArrowRight") {
        next = { ...origin, x: origin.x + distance };
      } else if (event.key === "ArrowUp") {
        next = { ...origin, y: origin.y - distance };
      } else if (event.key === "ArrowDown") {
        next = { ...origin, y: origin.y + distance };
      } else if (event.key === "Home") {
        event.preventDefault();
        resetPosition();
        return;
      }
      if (!next) return;
      event.preventDefault();
      if (modeRef.current === "docked") {
        applyModeAndOffset("floating", next);
      } else {
        setSharedOffset(next);
      }
    },
    [
      applyModeAndOffset,
      dockRootRef,
      resetPosition,
      setSharedOffset,
      toggleDock,
    ],
  );

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.currentTarget.focus();
      event.preventDefault();
      const originOffset =
        modeRef.current === "docked"
          ? floatingOffsetFromCurrentRect()
          : {
              x: positionRef.current.x - defaultPosition().x,
              y: positionRef.current.y - defaultPosition().y,
            };
      const boundedOriginOffset = boundedEditBarDockOffset(originOffset);
      if (modeRef.current === "floating") {
        offsetRef.current = boundedOriginOffset;
        setOffset(boundedOriginOffset);
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originMode: modeRef.current,
        originOffset: boundedOriginOffset,
        lastOffset: boundedOriginOffset,
        moved: false,
      };
      setDragging(true);
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is optional in embedded/webview implementations.
      }
    },
    [defaultPosition, floatingOffsetFromCurrentRect],
  );

  const continueDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (
        !drag.moved &&
        Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      drag.moved = true;
      drag.lastOffset = boundedEditBarDockOffset({
        x: drag.originOffset.x + deltaX,
        y: drag.originOffset.y + deltaY,
      });
      if (drag.originMode === "floating") {
        drag.lastOffset = setSharedOffset(
          drag.lastOffset,
          false,
          "floating",
        );
      }
      setDropActive(pointInsideDock(event.clientX, event.clientY));
    },
    [pointInsideDock, setSharedOffset],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const overDock = pointInsideDock(event.clientX, event.clientY);
      if (drag.originMode === "docked") {
        if (drag.moved && !overDock) {
          applyModeAndOffset("floating", drag.lastOffset);
        } else {
          persist("docked", offsetRef.current);
        }
      } else if (overDock && dockRootRef) {
        applyModeAndOffset("docked", drag.lastOffset);
      } else {
        const appliedOffset = setSharedOffset(
          drag.lastOffset,
          false,
          "floating",
        );
        persist("floating", appliedOffset);
      }
      finishDrag(event.pointerId);
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Capture may already be gone after a webview boundary transition.
      }
    },
    [
      applyModeAndOffset,
      dockRootRef,
      finishDrag,
      persist,
      pointInsideDock,
      setSharedOffset,
    ],
  );

  const cancelDrag = useCallback(
    (pointerId: number) => {
      if (dragRef.current?.pointerId !== pointerId) return;
      persist(modeRef.current, offsetRef.current);
      finishDrag(pointerId);
    },
    [finishDrag, persist],
  );

  const makeHandle = useCallback(
    (side: "left" | "right") => (
      <EditBarDragHandle
        side={side}
        mode={mode}
        offset={offset}
        dragging={dragging}
        onPointerDown={beginDrag}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={(event) => cancelDrag(event.pointerId)}
        onLostPointerCapture={(event) => cancelDrag(event.pointerId)}
        onDoubleClick={resetPosition}
        onKeyDown={moveByKeyboard}
      />
    ),
    [
      beginDrag,
      cancelDrag,
      continueDrag,
      dragging,
      endDrag,
      mode,
      moveByKeyboard,
      offset.x,
      offset.y,
      resetPosition,
    ],
  );

  const pinButton = useMemo(
    () =>
      dockRootRef ? (
        <EditBarPinButton mode={mode} onToggle={toggleDock} />
      ) : null,
    [dockRootRef, mode, toggleDock],
  );

  const leading = useMemo(() => makeHandle("left"), [makeHandle]);
  const trailing = useMemo(
    () => (
      <>
        {pinButton}
        {makeHandle("right")}
      </>
    ),
    [makeHandle, pinButton],
  );

  useLayoutEffect(() => {
    setPortalRoot(workspaceRootRef?.current || stageRef.current);
    setDockRoot(dockRootRef?.current || null);
  }, [dockRootRef, stageRef, workspaceRootRef]);

  useLayoutEffect(() => {
    let restored: EditBarDockState | null = null;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
      restored = parseEditBarDockState(raw);
      if (raw && !restored) window.localStorage.removeItem(storageKey);
    } catch {
      // Keep deterministic defaults when storage is unavailable.
    }
    const nextMode =
      restored?.mode === "docked" && !dockRootRef
        ? "floating"
        : restored?.mode || defaultMode;
    const nextOffset = restored?.offset || { x: 0, y: 0 };
    modeRef.current = nextMode;
    offsetRef.current = nextOffset;
    setMode(nextMode);
    setOffset(nextOffset);
    setDropActive(false);
    finishDrag();
    hydratedStorageKeyRef.current = storageKey;
    const nextPosition = positionForOffset(nextOffset);
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }, [
    defaultMode,
    dockRootRef,
    finishDrag,
    positionForOffset,
    resetKey,
    storageKey,
  ]);

  useLayoutEffect(() => {
    setSharedOffset(offsetRef.current, false, mode);
  }, [dockRoot, mode, portalRoot, setSharedOffset]);

  useLayoutEffect(() => {
    if (!portalRoot) return;
    const update = () =>
      setSharedOffset(offsetRef.current, false, modeRef.current);
    update();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(update);
    observer?.observe(portalRoot);
    if (dockRoot) observer?.observe(dockRoot);
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
  }, [dockRoot, mode, portalRoot, setSharedOffset]);

  useEffect(
    () => () => {
      dragRef.current = null;
    },
    [],
  );

  return {
    leading,
    trailing,
    portalRoot,
    dockRoot,
    toolbarRef,
    mode,
    dragging,
    dropActive,
    offset,
    position,
    dock,
    undock,
    resetPosition,
  };
}
