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
  clampFloatingToolbarToBounds,
  isFloatingToolbarDockIntent,
  sameFloatingToolbarPoint,
  type FloatingToolbarBounds,
  type FloatingToolbarPoint,
} from "./floating-toolbar-geometry";
const DRAG_THRESHOLD_PX = 4;
const DOCK_REVEAL_PROXIMITY_PX = 24;
interface EditBarDrag {
  pointerId: number;
  startX: number;
  startY: number;
  originMode: EditBarDockMode;
  originOffset: FloatingToolbarPoint;
  originPosition: FloatingToolbarPoint;
  lastOffset: FloatingToolbarPoint;
  lastPosition: FloatingToolbarPoint;
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
  workspaceRootRef?: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  dockRootRef?: RefObject<HTMLDivElement | null>;
  resetKey: string;
  storageKey: string;
}): EditBarDockController {
  const defaultMode: EditBarDockMode = dockRootRef ? "docked" : "floating";
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<EditBarDrag | null>(null);
  const rememberedDockBoundsRef = useRef<FloatingToolbarBounds | null>(null);
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

  const readLayerElement = useCallback(
    () =>
      workspaceRootRef?.current ||
      dockRootRef?.current?.parentElement ||
      portalRoot ||
      stageRef.current,
    [dockRootRef, portalRoot, stageRef, workspaceRootRef],
  );

  const readDockTargetBounds = useCallback((): FloatingToolbarBounds | null => {
    const target = dockRootRef?.current || dockRoot;
    if (!target) return rememberedDockBoundsRef.current;
    const sentinel = target.querySelector<HTMLElement>(
      "[data-edit-bar-dock-sentinel]",
    );
    const sentinelRect = sentinel?.getBoundingClientRect();
    const measured =
      sentinelRect && sentinelRect.width > 0
        ? sentinelRect
        : target.getBoundingClientRect();
    if (
      Number.isFinite(measured.left) &&
      Number.isFinite(measured.top) &&
      measured.width > 0
    ) {
      const height = measured.height > 0 ? measured.height : 56;
      const next = {
        left: measured.left,
        top: measured.top,
        right: measured.right || measured.left + measured.width,
        bottom: measured.top + height,
      };
      rememberedDockBoundsRef.current = next;
      return next;
    }
    return rememberedDockBoundsRef.current;
  }, [dockRoot, dockRootRef]);

  const defaultPosition = useCallback((): FloatingToolbarPoint => {
    const stage = stageRef.current?.getBoundingClientRect();
    const layer = readLayerElement()?.getBoundingClientRect();
    if (!stage || !layer) return { x: 0, y: 0 };
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
        const above = y - layer.top - toolbarHeight - 8;
        const stageTop = stage.top - layer.top;
        return {
          x: x + width / 2 - layer.left - toolbarWidth / 2,
          y:
            above >= stageTop + 8
              ? above
              : y + height - layer.top + 8,
        };
      }
    }
    return {
      x: stage.left - layer.left + 8,
      y: stage.top - layer.top + 8,
    };
  }, [readLayerElement, stageRef]);

  const positionForOffset = useCallback(
    (
      nextOffset: FloatingToolbarPoint,
      targetMode = modeRef.current,
    ): FloatingToolbarPoint => {
      const stage = stageRef.current?.getBoundingClientRect();
      const toolbar = toolbarRef.current?.getBoundingClientRect();
      const layer = readLayerElement()?.getBoundingClientRect();
      if (!stage || !toolbar || !layer) return positionRef.current;
      const dockBounds = readDockTargetBounds();
      if (targetMode === "docked" && dockBounds) {
        return {
          x:
            dockBounds.left -
            layer.left +
            Math.max(
              0,
              (dockBounds.right - dockBounds.left - toolbar.width) / 2,
            ),
          y:
            dockBounds.top -
            layer.top +
            Math.max(
              0,
              (dockBounds.bottom - dockBounds.top - toolbar.height) / 2,
            ),
        };
      }
      const anchor = defaultPosition();
      const visualViewport =
        typeof window === "undefined" ? null : window.visualViewport;
      const visualLeft = visualViewport?.offsetLeft || 0;
      const visualTop = visualViewport?.offsetTop || 0;
      const visualRight =
        visualLeft + (visualViewport?.width || window.innerWidth);
      const visualBottom =
        visualTop + (visualViewport?.height || window.innerHeight);
      // Include the full shell layer (action row + dock + stage) so the bar can
      // fly through the remembered dock band instead of clamping under it while
      // the pointer continues into chrome above the strip.
      const surfaceLeft = dockBounds
        ? Math.min(stage.left, dockBounds.left, layer.left)
        : Math.min(stage.left, layer.left);
      const surfaceTop = dockBounds
        ? Math.min(stage.top, dockBounds.top, layer.top)
        : Math.min(stage.top, layer.top);
      const surfaceRight = dockBounds
        ? Math.max(stage.right, dockBounds.right, layer.right)
        : Math.max(stage.right, layer.right);
      const surfaceBottom = dockBounds
        ? Math.max(stage.bottom, dockBounds.bottom, layer.bottom)
        : Math.max(stage.bottom, layer.bottom);
      const visibleLeft = Math.max(surfaceLeft, layer.left, visualLeft);
      const visibleTop = Math.max(surfaceTop, layer.top, visualTop);
      const visibleRight = Math.max(
        visibleLeft,
        Math.min(surfaceRight, layer.right, visualRight),
      );
      const visibleBottom = Math.max(
        visibleTop,
        Math.min(surfaceBottom, layer.bottom, visualBottom),
      );
      return clampFloatingToolbarToBounds(
        {
          x: anchor.x + nextOffset.x,
          y: anchor.y + nextOffset.y,
        },
        {
          left: visibleLeft - layer.left,
          top: visibleTop - layer.top,
          right: visibleRight - layer.left,
          bottom: visibleBottom - layer.top,
        },
        { width: toolbar.width, height: toolbar.height },
      );
    },
    [
      defaultPosition,
      readDockTargetBounds,
      readLayerElement,
      stageRef,
    ],
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
      const nextPosition = positionForOffset(nextOffset, targetMode);
      const stageRect = stageRef.current?.getBoundingClientRect();
      const toolbarRect = toolbarRef.current?.getBoundingClientRect();
      const layerRect = readLayerElement()?.getBoundingClientRect();
      const hasMeasurableGeometry = Boolean(
        stageRect &&
          toolbarRect &&
          layerRect &&
          stageRect.width > 0 &&
          stageRect.height > 0 &&
          toolbarRect.width > 0 &&
          toolbarRect.height > 0 &&
          layerRect.width > 0 &&
          layerRect.height > 0,
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
    [
      defaultPosition,
      persist,
      positionForOffset,
      readLayerElement,
      stageRef,
    ],
  );

  const setFloatingPosition = useCallback(
    (requestedPosition: FloatingToolbarPoint, persistChange = true) => {
      const anchor = defaultPosition();
      return setSharedOffset(
        {
          x: requestedPosition.x - anchor.x,
          y: requestedPosition.y - anchor.y,
        },
        persistChange,
        "floating",
      );
    },
    [defaultPosition, setSharedOffset],
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

  const readLiveToolbarBounds = useCallback((): FloatingToolbarBounds | null => {
    const layer = readLayerElement()?.getBoundingClientRect();
    const toolbar = toolbarRef.current?.getBoundingClientRect();
    if (
      !layer ||
      !toolbar ||
      !(toolbar.width > 0) ||
      !(toolbar.height > 0)
    ) {
      return null;
    }
    // Prefer the controller's post-clamp position so drop detection in the
    // same pointermove frame does not wait for a React transform commit.
    const left = layer.left + positionRef.current.x;
    const top = layer.top + positionRef.current.y;
    return {
      left,
      top,
      right: left + toolbar.width,
      bottom: top + toolbar.height,
    };
  }, [readLayerElement]);

  const pointNearDock = useCallback(
    (clientX: number, clientY: number) => {
      const bounds = readDockTargetBounds();
      if (!bounds) return false;
      return isFloatingToolbarDockIntent(
        { x: clientX, y: clientY },
        bounds,
        readLiveToolbarBounds(),
        DOCK_REVEAL_PROXIMITY_PX,
      );
    },
    [readDockTargetBounds, readLiveToolbarBounds],
  );

  const dock = useCallback(() => {
    if (!dockRootRef) return;
    applyModeAndOffset("docked", offsetRef.current);
  }, [applyModeAndOffset, dockRootRef]);

  const undock = useCallback(() => {
    readDockTargetBounds();
    applyModeAndOffset("floating", offsetRef.current);
  }, [applyModeAndOffset, readDockTargetBounds]);

  const toggleDock = useCallback(() => {
    if (!dockRootRef) return;
    if (modeRef.current === "docked") undock();
    else dock();
  }, [dock, dockRootRef, undock]);

  const resetPosition = useCallback(() => {
    setSharedOffset({ x: 0, y: 0 });
  }, [setSharedOffset]);

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
      readDockTargetBounds();
      const originMode = modeRef.current;
      const originPosition = positionRef.current;
      const boundedOriginOffset = offsetRef.current;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originMode,
        originOffset: boundedOriginOffset,
        originPosition,
        lastOffset: boundedOriginOffset,
        lastPosition: originPosition,
        moved: false,
      };
      setDragging(true);
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is optional in embedded/webview implementations.
      }
    },
    [readDockTargetBounds],
  );

  const updateDrag = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerId) return false;
      const deltaX = clientX - drag.startX;
      const deltaY = clientY - drag.startY;
      if (
        !drag.moved &&
        Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX
      ) {
        return false;
      }
      drag.moved = true;
      if (modeRef.current === "docked") {
        modeRef.current = "floating";
        setMode("floating");
      }
      drag.lastPosition = {
        x: drag.originPosition.x + deltaX,
        y: drag.originPosition.y + deltaY,
      };
      drag.lastOffset = setFloatingPosition(drag.lastPosition, false);
      drag.lastPosition = positionRef.current;
      setDropActive(pointNearDock(clientX, clientY));
      return true;
    },
    [pointNearDock, setFloatingPosition],
  );

  const continueDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      updateDrag(event.pointerId, event.clientX, event.clientY);
    },
    [updateDrag],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      let drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      updateDrag(event.pointerId, event.clientX, event.clientY);
      drag = dragRef.current;
      if (!drag) return;
      const overDock = pointNearDock(event.clientX, event.clientY);
      if (!drag.moved) {
        persist(drag.originMode, drag.originOffset);
      } else if (overDock && dockRootRef) {
        applyModeAndOffset("docked", drag.lastOffset);
      } else {
        modeRef.current = "floating";
        setMode("floating");
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
      pointNearDock,
      setSharedOffset,
      updateDrag,
    ],
  );

  const cancelDrag = useCallback(
    (pointerId: number) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerId) return;
      applyModeAndOffset(drag.originMode, drag.originOffset);
      finishDrag(pointerId);
    },
    [applyModeAndOffset, finishDrag],
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
    // Keep one shell-owned portal for docked and floating modes. React never
    // reparents the captured drag handle mid-gesture, while the clipped
    // absolute overlay cannot enlarge workspace or page scroll dimensions.
    setPortalRoot(
      workspaceRootRef?.current ||
        dockRootRef?.current?.parentElement ||
        stageRef.current,
    );
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
    const update = () => {
      const drag = dragRef.current;
      if (drag?.moved && modeRef.current === "floating") {
        drag.lastOffset = setFloatingPosition(drag.lastPosition, false);
        drag.lastPosition = positionRef.current;
        return;
      }
      setSharedOffset(offsetRef.current, false, modeRef.current);
    };
    update();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(update);
    observer?.observe(portalRoot);
    if (stageRef.current && stageRef.current !== portalRoot) {
      observer?.observe(stageRef.current);
    }
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
  }, [
    dockRoot,
    mode,
    portalRoot,
    setFloatingPosition,
    setSharedOffset,
    stageRef,
  ]);

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
